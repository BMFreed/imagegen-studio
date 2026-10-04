import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type { IgsProjectDocumentV1, IgsRectV1 } from '../../shared/projects/project-schema.js'

import { createHash, randomBytes } from 'node:crypto'

import type { GenerationModelResolver } from './illustrious-generation-loras.js'
import type { IllustriousSchedulerKey } from './illustrious-scheduler.js'
import type { FrozenGenerationTarget } from './project-generation-target.js'

import {
  type FrozenGenerationLora,
  type FrozenLoraStack,
  validAuthoredGenerationLoras,
} from './illustrious-generation-loras.js'
import {
  type FrozenGenerationVae,
  validAuthoredGenerationVae,
} from './illustrious-generation-vae.js'
import { resolveIllustriousScheduler } from './illustrious-scheduler.js'
import { classifyTargetPngAlpha } from './target-png-mode.js'

/** Main-owned snapshot, deliberately distinct from a qualified worker request or queue row. */
export interface FrozenNormalTxt2ImgPreparationV1 {
  bbox: IgsRectV1
  documentId: string
  documentRevision: string
  kind: 'normal-txt2img-preparation'
  loras?: FrozenGenerationLora[]
  loraStack?: FrozenLoraStack
  model: {
    managedPath: string
    reference: ExactCheckpoint
  }
  prompts: {
    negative: string
    positive: string
  }
  sampling: {
    /** Historical preparations omit this field; new jobs freeze the effective value, including 0. */
    cfgRescale?: number
    cfgScale: number
    invokeScheduler: IllustriousSchedulerKey | null
    requestedSeedPolicy: SeedPolicy
    sampler: string | null
    scheduler: string | null
    seed: number
    seedBehavior?: 'per-iteration' | 'per-prompt'
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
  /** Explicit Embedded null for new jobs; absence remains historical and unrecorded. */
  vae?: FrozenGenerationVae | null
  /** Authored/default precision policy; historical preparations omit it. */
  vaePrecision?: 'Auto' | 'FP16' | 'FP32'
}
export interface PreparedNormalTxt2Img {
  context: FrozenNormalTxt2ImgPreparationV1
  /** Copy of the verified PNG for main-owned materialization before queue insertion. */
  targetPngBytes: Buffer
}

export interface FrozenNormalImg2ImgPreparationV1 extends Omit<
  FrozenNormalTxt2ImgPreparationV1,
  'kind' | 'sampling'
> {
  kind: 'normal-img2img-preparation'
  sampling: FrozenNormalTxt2ImgPreparationV1['sampling'] & { denoisingStrength: number }
}
export type FrozenNormalGenerationPreparationV1 =
  FrozenNormalImg2ImgPreparationV1 | FrozenNormalTxt2ImgPreparationV1
export interface PreparedNormalGeneration {
  context: FrozenNormalGenerationPreparationV1
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
export function validateNormalTxt2ImgDraft(
  draft: IgsProjectDocumentV1['generationDraft'],
  operationalSeed?: number | null,
  savedSnapshot?: number | null,
): ReturnType<typeof validateNormalGenerationDraft> {
  if (draft.sampling.denoisingStrength !== null) {
    throw new GenerationPreparationError(
      'GENERATION_SAMPLING_UNSUPPORTED',
      'Denoising strength is not supported for this txt2img preparation.',
    )
  }
  return validateNormalGenerationDraft(draft, operationalSeed, savedSnapshot)
}

/** Validate stored settings without inventing a mode from layer presence or UI state. */
export function validateNormalGenerationDraft(
  draft: IgsProjectDocumentV1['generationDraft'],
  operationalSeed?: number | null,
  savedSnapshot?: number | null,
): {
  cfgRescale: number
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
  if (!validAuthoredGenerationLoras(draft.loras)) {
    throw new GenerationPreparationError(
      'GENERATION_LORA_UNSUPPORTED',
      'Enabled LoRAs require distinct Illustrious resources and finite weights.',
    )
  }
  if (draft.positivePrompt.embeddingRefs.length || draft.negativePrompt.embeddingRefs.length) {
    throw new GenerationPreparationError(
      'GENERATION_EMBEDDING_UNSUPPORTED',
      'Embedding references are not supported by this preparation.',
    )
  }
  if (draft.clipSkip !== undefined) {
    throw new GenerationPreparationError(
      'GENERATION_ADVANCED_UNSUPPORTED',
      'CLIP Skip is not supported by this preparation.',
    )
  }
  if (!validAuthoredGenerationVae(draft.vae)) {
    throw new GenerationPreparationError(
      'GENERATION_VAE_UNSUPPORTED',
      'Choose an exact Illustrious-compatible external VAE or reset it to Embedded.',
    )
  }
  if (draft.vaePrecision !== undefined && !['Auto', 'FP16', 'FP32'].includes(draft.vaePrecision)) {
    throw new GenerationPreparationError(
      'GENERATION_PARAMETER_UNSUPPORTED',
      'VAE Precision must be Auto, FP16 or FP32.',
    )
  }
  const cfgRescale = draft.cfgRescale ?? 0
  if (!Number.isFinite(cfgRescale) || cfgRescale < 0 || cfgRescale > 0.99) {
    throw new GenerationPreparationError(
      'GENERATION_PARAMETER_UNSUPPORTED',
      'Illustrious CFG Rescale must be between 0 and 0.99.',
    )
  }
  const { sampling } = draft
  if (
    sampling.denoisingStrength !== null &&
    (!Number.isFinite(sampling.denoisingStrength) ||
      sampling.denoisingStrength < 0 ||
      sampling.denoisingStrength > 1)
  ) {
    throw new GenerationPreparationError(
      'GENERATION_PARAMETER_UNSUPPORTED',
      'Denoising strength must be between 0 and 1.',
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
  const reusableSeed = operationalSeed ?? savedSnapshot
  if (draft.seed.policy === 'reuse' && reusableSeed == null) {
    throw new GenerationPreparationError(
      'GENERATION_SEED_UNAVAILABLE',
      'Reuse needs a completed actual seed from this Project.',
    )
  }
  if (draft.seed.policy === 'reuse' && reusableSeed != null && !isUint32(reusableSeed)) {
    throw new GenerationPreparationError(
      'GENERATION_SEED_INVALID',
      'The completed seed must be an unsigned 32-bit integer.',
    )
  }
  return {
    cfgRescale,
    cfgScale: sampling.cfgScale,
    invokeScheduler: schedulerSelection.kind === 'supported' ? schedulerSelection.key : null,
    model,
    steps: sampling.steps,
  }
}

/**
 * Preserve the strict transparent-target API for legacy callers. Production preparation supports
 * both normal modes; queue admission separately qualifies the live runtime before dispatch.
 */
export async function prepareNormalTxt2Img(input: {
  lastActualSeed?: number | null
  modelService: GenerationModelResolver
  randomUint32?: () => number
  target: FrozenGenerationTarget
}): Promise<PreparedNormalTxt2Img> {
  if (input.target.mode !== 'txt2img') {
    throw new GenerationPreparationError(
      'GENERATION_MODE_UNSUPPORTED',
      'Only an empty generation area can be prepared for the first Illustrious txt2img slice.',
    )
  }
  validateNormalTxt2ImgDraft(
    input.target.generationDraft,
    input.lastActualSeed,
    input.target.lastActualSeedSnapshot,
  )
  const prepared = await prepareNormalGeneration(input)
  if (prepared.context.kind !== 'normal-txt2img-preparation') {
    throw new GenerationPreparationError(
      'GENERATION_MODE_UNSUPPORTED',
      'The frozen target is not txt2img.',
    )
  }
  return { ...prepared, context: prepared.context }
}

/** Freeze one verified transparent txt2img or opaque img2img target for the same queue pipeline. */
export async function prepareNormalGeneration(input: {
  lastActualSeed?: number | null
  modelService: GenerationModelResolver
  randomUint32?: () => number
  target: FrozenGenerationTarget
}): Promise<PreparedNormalGeneration> {
  const { target } = input
  // Freeze everything before the model-file verification await. The target is main-owned but its
  // nested objects and Buffer are mutable to a caller that retains the original references.
  const draft = structuredClone(target.generationDraft)
  const bbox = { ...target.bbox }
  const composite = { ...target.composite, bytes: Buffer.from(target.composite.bytes) }
  const { documentId, documentRevision } = target
  const savedSnapshot = target.lastActualSeedSnapshot
  const { cfgRescale, cfgScale, invokeScheduler, model, steps } = validateNormalGenerationDraft(
    draft,
    input.lastActualSeed,
    savedSnapshot,
  )
  await input.modelService.assertNoUnboundGenerationEmbeddings({
    modelFamily: model.baseModelFamily,
    negativePrompt: structuredClone(draft.negativePrompt),
    positivePrompt: structuredClone(draft.positivePrompt),
  })
  const actualSeed =
    draft.seed.policy === 'fixed'
      ? draft.seed.value
      : draft.seed.policy === 'reuse'
        ? (input.lastActualSeed ?? savedSnapshot)
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

  let actualMode: ReturnType<typeof classifyTargetPngAlpha>
  try {
    actualMode = classifyTargetPngAlpha(bytes, bbox.width, bbox.height)
  } catch {
    throw new GenerationPreparationError(
      'GENERATION_TARGET_CHANGED',
      'The frozen target is not valid bounded RGBA pixels.',
    )
  }
  if (actualMode !== target.mode) {
    throw new GenerationPreparationError(
      'GENERATION_TARGET_CHANGED',
      'The frozen generation mode differs from the target pixels.',
    )
  }
  if (actualMode === 'outpaint') {
    throw new GenerationPreparationError(
      'GENERATION_MODE_UNSUPPORTED',
      'Partially transparent generation areas are not supported by this Illustrious pipeline yet.',
    )
  }
  if (actualMode === 'img2img' && draft.sampling.denoisingStrength === null) {
    throw new GenerationPreparationError(
      'GENERATION_SAMPLING_REQUIRED',
      'Set Denoising Strength before generating from the image in this area.',
    )
  }

  // Main re-hashes the exact installed file; Default and same-model alternatives are irrelevant.
  const verified = await input.modelService.resolveVerifiedGenerationCheckpointForPlan(model)
  const vae = draft.vae
    ? await input.modelService.resolveVerifiedGenerationVaeForPlan(draft.vae)
    : null
  const loras: FrozenGenerationLora[] = []
  for (const entry of draft.loras) {
    if (!entry.enabled) {
      continue
    }
    const verifiedLora = await input.modelService.resolveVerifiedGenerationLoraForPlan(
      entry.resource,
    )
    loras.push({ ...verifiedLora, weight: entry.weight })
  }
  const common: Omit<FrozenNormalTxt2ImgPreparationV1, 'kind'> = {
    bbox,
    documentId,
    documentRevision,
    loras,
    loraStack: draft.loras,
    model: { managedPath: verified.managedPath, reference: { ...verified.reference } },
    prompts: {
      negative: draft.negativePrompt.text,
      positive: draft.positivePrompt.text,
    },
    sampling: {
      cfgRescale,
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
    vae: vae ? structuredClone(vae) : null,
    vaePrecision: draft.vaePrecision ?? 'Auto',
  }
  let context: FrozenNormalGenerationPreparationV1
  if (actualMode === 'img2img') {
    const denoisingStrength = draft.sampling.denoisingStrength
    if (denoisingStrength === null) {
      throw new GenerationPreparationError(
        'GENERATION_SAMPLING_REQUIRED',
        'Set Denoising Strength before generating from this image.',
      )
    }
    context = {
      ...common,
      kind: 'normal-img2img-preparation',
      sampling: { ...common.sampling, denoisingStrength },
    }
  } else {
    context = { ...common, kind: 'normal-txt2img-preparation' }
  }
  return {
    context,
    targetPngBytes: bytes,
  }
}

function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xff_ff_ff_ff
}
