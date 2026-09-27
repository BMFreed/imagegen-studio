import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type { IgsProjectDocumentV1, IgsRectV1 } from '../../shared/projects/project-schema.js'

import { createHash, randomBytes } from 'node:crypto'

import type { ModelService } from '../models/model-service.js'
import type { IllustriousSchedulerKey } from './illustrious-scheduler.js'
import type { FrozenGenerationTarget } from './project-generation-target.js'

import { resolveIllustriousScheduler } from './illustrious-scheduler.js'

/** Main-owned snapshot, deliberately distinct from a qualified worker request or queue row. */
export interface FrozenNormalTxt2ImgPreparationV1 {
  bbox: IgsRectV1
  documentId: string
  documentRevision: string
  kind: 'normal-txt2img-preparation'
  model: {
    managedPath: string
    reference: ExactCheckpoint
  }
  prompts: {
    negative: string
    positive: string
  }
  sampling: {
    cfgScale: number
    invokeScheduler: IllustriousSchedulerKey | null
    requestedSeedPolicy: SeedPolicy
    sampler: string | null
    scheduler: string | null
    seed: number
    steps: number
  }
  schemaVersion: 1
  target: {
    byteSize: number
    colorSpace: 'srgb'
    format: 'png'
    height: number
    iccSha256: string
    sha256: string
    width: number
  }
}
export interface PreparedNormalTxt2Img {
  context: FrozenNormalTxt2ImgPreparationV1
  /** Copy of the verified PNG, for future main-owned materialization before queue insertion. */
  targetPngBytes: Buffer
}

type ExactCheckpoint = NonNullable<IgsProjectDocumentV1['generationDraft']['model']>

type SeedPolicy = IgsProjectDocumentV1['generationDraft']['seed']['policy']

export class GenerationPreparationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'GenerationPreparationError'
  }
}

/** Reject unsupported draft settings before invoking an image worker. Recheck the frozen draft too. */
export function validateNormalTxt2ImgDraft(draft: IgsProjectDocumentV1['generationDraft']): {
  cfgScale: number
  invokeScheduler: IllustriousSchedulerKey | null
  model: ExactCheckpoint
  steps: number
} {
  const model = draft.model
  if (!model) {
    throw new GenerationPreparationError('GENERATION_MODEL_REQUIRED', 'Choose a checkpoint first.')
  }
  if (model.kind !== 'checkpoint' || model.baseModelFamily !== 'illustrious') {
    throw new GenerationPreparationError(
      'GENERATION_MODEL_UNSUPPORTED',
      'This preparation supports only an Illustrious checkpoint.',
    )
  }
  if (draft.loras.some((lora) => lora.enabled)) {
    throw new GenerationPreparationError(
      'GENERATION_LORA_UNSUPPORTED',
      'Active LoRAs are not supported by this preparation.',
    )
  }
  if (draft.positivePrompt.embeddingRefs.length || draft.negativePrompt.embeddingRefs.length) {
    throw new GenerationPreparationError(
      'GENERATION_EMBEDDING_UNSUPPORTED',
      'Embedding references are not supported by this preparation.',
    )
  }
  if (
    draft.vae ||
    draft.cfgRescale !== undefined ||
    draft.clipSkip !== undefined ||
    draft.vaePrecision !== undefined
  ) {
    throw new GenerationPreparationError(
      'GENERATION_ADVANCED_UNSUPPORTED',
      'Advanced generation options are not supported by this preparation.',
    )
  }
  const { sampling } = draft
  if (sampling.denoisingStrength !== null) {
    throw new GenerationPreparationError(
      'GENERATION_SAMPLING_UNSUPPORTED',
      'Denoising strength is not supported for this txt2img preparation.',
    )
  }
  const schedulerSelection = resolveIllustriousScheduler(sampling.sampler, sampling.scheduler)
  if (schedulerSelection.kind === 'unsupported') {
    throw new GenerationPreparationError(
      'GENERATION_SAMPLING_UNSUPPORTED',
      'The selected sampler and scheduler pair is not supported by the first Illustrious pipeline.',
    )
  }
  if (
    sampling.steps === null ||
    !Number.isSafeInteger(sampling.steps) ||
    sampling.steps < 1 ||
    sampling.cfgScale === null ||
    !Number.isFinite(sampling.cfgScale) ||
    sampling.cfgScale < 0
  ) {
    throw new GenerationPreparationError(
      'GENERATION_SAMPLING_REQUIRED',
      'Set valid Steps and CFG before preparing a generation.',
    )
  }
  if (draft.seed.policy === 'reuse') {
    throw new GenerationPreparationError(
      'GENERATION_SEED_UNAVAILABLE',
      'Reuse needs the durable last actual seed cursor, which is not connected yet.',
    )
  }
  return {
    cfgScale: sampling.cfgScale,
    invokeScheduler: schedulerSelection.kind === 'supported' ? schedulerSelection.key : null,
    model,
    steps: sampling.steps,
  }
}

/**
 * Freeze the inputs that today's Project can prove. Sampling implementation and runtime
 * capabilities remain unqualified, so this result must not be dispatched to the worker.
 */
export async function prepareNormalTxt2Img(input: {
  modelService: Pick<ModelService, 'resolveVerifiedGenerationCheckpointForPlan'>
  randomUint32?: () => number
  target: FrozenGenerationTarget
}): Promise<PreparedNormalTxt2Img> {
  const { target } = input
  if (target.mode !== 'txt2img') {
    throw new GenerationPreparationError(
      'GENERATION_MODE_UNSUPPORTED',
      'Only an empty generation area can be prepared for the first Illustrious txt2img slice.',
    )
  }
  // Freeze everything before the model-file verification await. The target is main-owned but its
  // nested objects and Buffer are mutable to a caller that retains the original references.
  const draft = structuredClone(target.generationDraft)
  const bbox = { ...target.bbox }
  const composite = { ...target.composite, bytes: Buffer.from(target.composite.bytes) }
  const { documentId, documentRevision } = target
  const { cfgScale, invokeScheduler, model, steps } = validateNormalTxt2ImgDraft(draft)
  const actualSeed =
    draft.seed.policy === 'fixed'
      ? draft.seed.value
      : (input.randomUint32?.() ?? randomBytes(4).readUInt32LE(0))
  if (actualSeed === null || !isUint32(actualSeed)) {
    throw new GenerationPreparationError(
      'GENERATION_SEED_INVALID',
      'The scheduled seed must be an unsigned 32-bit integer.',
    )
  }

  const bytes = composite.bytes
  if (
    bytes.length !== composite.byteSize ||
    createHash('sha256').update(bytes).digest('hex') !== composite.sha256 ||
    composite.colorSpace !== 'srgb' ||
    composite.iccSha256 !== IGS_SRGB_ICC_SHA256 ||
    composite.width !== bbox.width ||
    composite.height !== bbox.height
  ) {
    throw new GenerationPreparationError(
      'GENERATION_TARGET_CHANGED',
      'The frozen generation target failed its integrity check.',
    )
  }

  // Main re-hashes the exact installed file; Default and same-model alternatives are irrelevant.
  const verified = await input.modelService.resolveVerifiedGenerationCheckpointForPlan(model)
  return {
    context: {
      bbox,
      documentId,
      documentRevision,
      kind: 'normal-txt2img-preparation',
      model: { managedPath: verified.managedPath, reference: { ...verified.reference } },
      prompts: {
        negative: draft.negativePrompt.text,
        positive: draft.positivePrompt.text,
      },
      sampling: {
        cfgScale,
        invokeScheduler,
        requestedSeedPolicy: draft.seed.policy,
        sampler: draft.sampling.sampler,
        scheduler: draft.sampling.scheduler,
        seed: actualSeed,
        steps,
      },
      schemaVersion: 1,
      target: {
        byteSize: bytes.length,
        colorSpace: 'srgb',
        format: 'png',
        height: composite.height,
        iccSha256: composite.iccSha256,
        sha256: composite.sha256,
        width: composite.width,
      },
    },
    targetPngBytes: bytes,
  }
}

function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xff_ff_ff_ff
}
