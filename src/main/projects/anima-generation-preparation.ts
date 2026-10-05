import {
  type AnimaFlowScheduler,
  compileAnimaFlowSamplingPlan,
} from '../../shared/projects/anima-flow-sampling-plan.js'
import { isAnimaSamplingMethod } from '../../shared/projects/anima-sampling-method.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  type GenerationDynamicPromptSettings,
  getEffectiveDynamicPromptSettings,
  isGenerationDynamicPromptSettings,
} from '../../shared/projects/generation-dynamic-settings.js'
import type { IgsProjectDocumentV1, IgsRectV1 } from '../../shared/projects/project-schema.js'

import { createHash, randomBytes } from 'node:crypto'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import type { ModelService, VerifiedAnimaGenerationBundle } from '../models/model-service.js'
import type { FrozenGenerationTarget } from './project-generation-target.js'

import { validateSrgbPngStream } from './igs-package.js'
import { GenerationPreparationError } from './project-generation-preparation.js'
import { classifyTargetPngAlpha } from './target-png-mode.js'

export type AnimaGenerationModelResolver = Pick<
  ModelService,
  'resolveVerifiedAnimaGenerationLoraForPlan' | 'resolveVerifiedGenerationAnimaBundleForPlan'
>
export interface FrozenAnimaGenerationLora {
  byteSize: number
  managedPath: string
  reference: ExactResource
  weight: number
}

/** Internal Main preparation only; neither a durable queue row nor accepted Raster provenance. */
export type FrozenAnimaGenerationPreparationV1 = FrozenAnimaGenerationFields &
  (
    | { mode: 'img2img'; sampling: FrozenAnimaSampling & { denoisingStrength: number } }
    | { mode: 'txt2img'; sampling: FrozenAnimaSampling & { denoisingStrength: null } }
  )

export interface PreparedAnimaGeneration {
  context: FrozenAnimaGenerationPreparationV1
  targetPngBytes: Buffer
}

type GenerationDraft = IgsProjectDocumentV1['generationDraft']

type ExactResource = NonNullable<GenerationDraft['model']>

interface FrozenAnimaGenerationFields {
  bbox: IgsRectV1
  documentId: string
  documentRevision: string
  dynamic: GenerationDynamicPromptSettings
  /** Complete authoring snapshot; inactive settings and disabled rows are retained, not dispatched. */
  generationDraft: GenerationDraft
  kind: 'anima-generation-preparation'
  loras: FrozenAnimaGenerationLora[]
  model: VerifiedAnimaGenerationBundle
  prompts: { negative: string; positive: string }
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

interface FrozenAnimaSampling {
  animaMethod: AnimaFlowScheduler
  cfgScale: number
  requestedSeedPolicy: GenerationDraft['seed']['policy']
  seed: number
  steps: number
}

interface AnimaDraftValidationInput {
  bbox: IgsRectV1
  lastActualSeed?: number | null
  lastActualSeedSnapshot?: number | null
}

/** Synchronous pre-compose checks. The neutral validation seed never resolves or consumes Random. */
export function validateAnimaGenerationDraft(
  draft: GenerationDraft,
  input: AnimaDraftValidationInput,
): void {
  if (!draft.model) {
    refuse('GENERATION_MODEL_REQUIRED', 'Choose an Anima checkpoint first.')
  }
  if (
    draft.model.kind !== 'checkpoint' ||
    draft.model.baseModelFamily !== 'anima' ||
    draft.model.predictionType !== null
  ) {
    refuse(
      'GENERATION_MODEL_UNSUPPORTED',
      'This preparation requires an original Anima checkpoint.',
    )
  }
  if (!validAnimaLoraStack(draft.loras)) {
    refuse(
      'GENERATION_LORA_UNSUPPORTED',
      'Enabled LoRAs require distinct exact Anima resources and finite signed weights.',
    )
  }
  if (
    draft.positivePrompt.embeddingRefs.length !== 0 ||
    draft.negativePrompt.embeddingRefs.length !== 0
  ) {
    refuse('GENERATION_EMBEDDING_UNSUPPORTED', 'Prompt embeddings are not supported by Anima.')
  }
  if (draft.vae !== null) {
    refuse('GENERATION_VAE_UNSUPPORTED', 'Anima requires its verified pinned companion VAE.')
  }
  if (
    draft.clipSkip !== undefined ||
    (draft.cfgRescale !== undefined && draft.cfgRescale !== 0) ||
    (draft.vaePrecision !== undefined && draft.vaePrecision !== 'Auto')
  ) {
    refuse(
      'GENERATION_ADVANCED_UNSUPPORTED',
      'Anima does not support CLIP Skip, nonzero CFG Rescale or manual VAE precision.',
    )
  }
  if (!isAnimaSamplingMethod(draft.sampling.animaMethod)) {
    refuse('GENERATION_SAMPLING_REQUIRED', 'Choose an explicit native Anima sampling method.')
  }
  if (draft.sampling.steps === null || draft.sampling.cfgScale === null) {
    refuse('GENERATION_SAMPLING_REQUIRED', 'Set Steps and CFG before preparing Anima.')
  }
  if (
    draft.dynamicPrompt !== undefined &&
    !isGenerationDynamicPromptSettings(draft.dynamicPrompt)
  ) {
    refuse('GENERATION_PARAMETER_UNSUPPORTED', 'The dynamic prompt settings are invalid.')
  }
  if (!['fixed', 'random', 'reuse'].includes(draft.seed.policy)) {
    refuse('GENERATION_SEED_INVALID', 'The Anima seed policy is invalid.')
  }
  if (draft.seed.policy === 'fixed' && !isUint32(draft.seed.value)) {
    refuse('GENERATION_SEED_INVALID', 'Fixed seed must be an unsigned 32-bit integer.')
  }
  const reusableSeed = input.lastActualSeed ?? input.lastActualSeedSnapshot
  if (draft.seed.policy === 'reuse' && reusableSeed == null) {
    refuse('GENERATION_SEED_UNAVAILABLE', 'Reuse needs a completed actual seed from this Project.')
  }
  if (draft.seed.policy === 'reuse' && !isUint32(reusableSeed)) {
    refuse('GENERATION_SEED_INVALID', 'The completed seed must be an unsigned 32-bit integer.')
  }
  assertBbox(input.bbox)
  // A saved strength is validated even when transparent pixels later make it inactive.
  const strength = draft.sampling.denoisingStrength
  compileAnimaFlowSamplingPlan({
    guidanceScale: draft.sampling.cfgScale,
    height: input.bbox.height,
    mode: strength === null ? 'txt2img' : 'img2img',
    scheduler: draft.sampling.animaMethod,
    seed: 0,
    steps: draft.sampling.steps,
    strength,
    width: input.bbox.width,
  })
}

/** Capture all mutable inputs before the first await, then qualify the exact original bundle. */
export async function prepareAnimaGeneration(input: {
  lastActualSeed?: number | null
  modelService: AnimaGenerationModelResolver
  randomUint32?: () => number
  target: FrozenGenerationTarget
}): Promise<PreparedAnimaGeneration> {
  const draft = structuredClone(input.target.generationDraft)
  const bbox = { ...input.target.bbox }
  const composite = { ...input.target.composite, bytes: Buffer.from(input.target.composite.bytes) }
  const { documentId, documentRevision, lastActualSeedSnapshot, mode } = input.target
  const { lastActualSeed, modelService, randomUint32 } = input
  validateAnimaGenerationDraft(draft, { bbox, lastActualSeed, lastActualSeedSnapshot })
  const actualMode = assertTarget(composite, bbox, composite.bytes)
  if (actualMode !== mode) {
    refuse('GENERATION_TARGET_CHANGED', 'The captured Anima mode differs from the target pixels.')
  }
  if (actualMode === 'outpaint') {
    refuse(
      'GENERATION_MODE_UNSUPPORTED',
      'Anima preparation does not support partially transparent areas.',
    )
  }
  const strength = actualMode === 'img2img' ? draft.sampling.denoisingStrength : null
  if (actualMode === 'img2img' && strength === null) {
    refuse('GENERATION_SAMPLING_REQUIRED', 'Set Denoising Strength for the captured Anima image.')
  }
  const seed =
    draft.seed.policy === 'fixed'
      ? draft.seed.value
      : draft.seed.policy === 'reuse'
        ? (lastActualSeed ?? lastActualSeedSnapshot)
        : (randomUint32?.() ?? randomBytes(4).readUInt32LE(0))
  if (!isUint32(seed)) {
    refuse('GENERATION_SEED_INVALID', 'The resolved Anima seed must be an unsigned 32-bit integer.')
  }
  // Main checks the real embedded ICC/CRC structure, not merely the caller's profile label.
  try {
    await validateSrgbPngStream(pngChunks(composite.bytes), 'target.png', 32 * 1024 * 1024, 2048)
  } catch {
    refuse(
      'GENERATION_TARGET_CHANGED',
      'The captured Anima PNG failed its sRGB profile validation.',
    )
  }
  const model = structuredClone(
    await modelService.resolveVerifiedGenerationAnimaBundleForPlan(draft.model!),
  )
  const loras: FrozenAnimaGenerationLora[] = []
  for (const entry of draft.loras) {
    if (!entry.enabled) {
      continue
    }
    const verified = await modelService.resolveVerifiedAnimaGenerationLoraForPlan(entry.resource)
    loras.push({ ...structuredClone(verified), weight: entry.weight })
  }
  const common: FrozenAnimaGenerationFields = {
    bbox,
    documentId,
    documentRevision,
    dynamic: getEffectiveDynamicPromptSettings(draft.dynamicPrompt),
    generationDraft: draft,
    kind: 'anima-generation-preparation',
    loras,
    model,
    prompts: { negative: draft.negativePrompt.text, positive: draft.positivePrompt.text },
    schemaVersion: 1,
    target: {
      byteSize: composite.byteSize,
      colorSpace: 'srgb',
      format: 'png',
      height: composite.height,
      iccSha256: composite.iccSha256,
      sha256: composite.sha256,
      width: composite.width,
    },
  }
  const sampling: FrozenAnimaSampling = {
    animaMethod: draft.sampling.animaMethod!,
    cfgScale: draft.sampling.cfgScale!,
    requestedSeedPolicy: draft.seed.policy,
    seed,
    steps: draft.sampling.steps!,
  }
  const context: FrozenAnimaGenerationPreparationV1 =
    actualMode === 'txt2img'
      ? { ...common, mode: 'txt2img', sampling: { ...sampling, denoisingStrength: null } }
      : { ...common, mode: 'img2img', sampling: { ...sampling, denoisingStrength: strength! } }
  assertFrozenAnimaGeneration(context, composite.bytes)
  return { context, targetPngBytes: composite.bytes }
}

/** Validate the captured Main snapshot before pure batch expansion or ephemeral materialization. */
export function assertFrozenAnimaGeneration(
  context: FrozenAnimaGenerationPreparationV1,
  targetPngBytes: Buffer,
): void {
  assertFrozenContext(context)
  const actualMode = assertTarget(context.target, context.bbox, targetPngBytes)
  if (actualMode !== context.mode) {
    refuse('GENERATION_TARGET_CHANGED', 'The frozen Anima mode differs from its captured pixels.')
  }
}

/** Requalify the frozen exact identities independently of the current Project or library Default. */
export async function reverifyFrozenAnimaGeneration(
  inputContext: FrozenAnimaGenerationPreparationV1,
  modelService: AnimaGenerationModelResolver,
): Promise<void> {
  const context = structuredClone(inputContext)
  assertFrozenContext(context)
  const model = await modelService.resolveVerifiedGenerationAnimaBundleForPlan(
    context.model.checkpoint.reference,
  )
  if (!isDeepStrictEqual(model, context.model)) {
    refuse('GENERATION_RESOURCE_CHANGED', 'The exact Anima bundle changed after preparation.')
  }
  for (const entry of context.loras) {
    const verified = await modelService.resolveVerifiedAnimaGenerationLoraForPlan(entry.reference)
    if (!isDeepStrictEqual({ ...verified, weight: entry.weight }, entry)) {
      refuse('GENERATION_RESOURCE_CHANGED', 'An exact Anima LoRA changed after preparation.')
    }
  }
}

function assertFrozenContext(context: FrozenAnimaGenerationPreparationV1): void {
  if (
    context.kind !== 'anima-generation-preparation' ||
    context.schemaVersion !== 1 ||
    !context.documentId ||
    !context.documentRevision ||
    (context.mode !== 'txt2img' && context.mode !== 'img2img')
  ) {
    refuse('GENERATION_PARAMETER_UNSUPPORTED', 'The frozen Anima context is invalid.')
  }
  const { generationDraft: draft, model, sampling } = context
  validateAnimaGenerationDraft(draft, {
    bbox: context.bbox,
    // Reverification validates the already resolved seed, not a mutable operational cursor.
    lastActualSeed: sampling.seed,
  })
  if (
    !isUint32(sampling.seed) ||
    sampling.requestedSeedPolicy !== draft.seed.policy ||
    (draft.seed.policy === 'fixed' && sampling.seed !== draft.seed.value) ||
    sampling.animaMethod !== draft.sampling.animaMethod ||
    sampling.cfgScale !== draft.sampling.cfgScale ||
    sampling.steps !== draft.sampling.steps ||
    context.prompts.negative !== draft.negativePrompt.text ||
    context.prompts.positive !== draft.positivePrompt.text ||
    !isDeepStrictEqual(context.dynamic, getEffectiveDynamicPromptSettings(draft.dynamicPrompt)) ||
    (context.mode === 'img2img' &&
      sampling.denoisingStrength !== draft.sampling.denoisingStrength) ||
    (context.mode === 'txt2img' && sampling.denoisingStrength !== null)
  ) {
    refuse(
      'GENERATION_PARAMETER_UNSUPPORTED',
      'The frozen Anima settings differ from their capture.',
    )
  }
  compileAnimaFlowSamplingPlan({
    guidanceScale: sampling.cfgScale,
    height: context.bbox.height,
    mode: context.mode,
    scheduler: sampling.animaMethod,
    seed: sampling.seed,
    steps: sampling.steps,
    strength: sampling.denoisingStrength,
    width: context.bbox.width,
  })
  if (
    model.architecture !== 'anima-base-1.0' ||
    !isDeepStrictEqual(model.checkpoint.reference, draft.model) ||
    !validFile(
      model.checkpoint.managedPath,
      model.checkpoint.byteSize,
      model.checkpoint.reference.fileSha256,
    ) ||
    !validFile(
      model.qwen3Encoder.managedPath,
      model.qwen3Encoder.byteSize,
      model.qwen3Encoder.sha256,
    ) ||
    !validFile(model.vae.managedPath, model.vae.byteSize, model.vae.sha256) ||
    !model.qwen3Encoder.localModelId ||
    !model.qwen3Encoder.localVersionId ||
    !model.vae.localModelId ||
    !model.vae.localVersionId
  ) {
    refuse('GENERATION_RESOURCE_CHANGED', 'The frozen exact Anima bundle is invalid.')
  }
  const paths = new Set([
    model.checkpoint.managedPath,
    model.qwen3Encoder.managedPath,
    model.vae.managedPath,
  ])
  const active = draft.loras.filter((entry) => entry.enabled)
  if (paths.size !== 3 || active.length !== context.loras.length) {
    refuse('GENERATION_RESOURCE_CHANGED', 'The frozen Anima resource stack is inconsistent.')
  }
  for (const [index, entry] of context.loras.entries()) {
    if (
      !validFile(entry.managedPath, entry.byteSize, entry.reference.fileSha256) ||
      paths.has(entry.managedPath) ||
      !isDeepStrictEqual(entry.reference, active[index].resource) ||
      entry.weight !== active[index].weight
    ) {
      refuse('GENERATION_RESOURCE_CHANGED', 'The frozen ordered Anima LoRA stack is inconsistent.')
    }
    paths.add(entry.managedPath)
  }
}

function validAnimaLoraStack(stack: GenerationDraft['loras']): boolean {
  if (!Array.isArray(stack)) {
    return false
  }
  const localModels = new Set<string>()
  const sourceModels = new Set<number>()
  for (const entry of stack) {
    if (
      typeof entry.enabled !== 'boolean' ||
      !Number.isFinite(entry.weight) ||
      entry.resource.kind !== 'lora'
    ) {
      return false
    }
    if (!entry.enabled) {
      continue
    }
    const ref = entry.resource
    if (
      ref.baseModelFamily !== 'anima' ||
      ref.predictionType !== null ||
      localModels.has(ref.localModelId) ||
      (ref.civitaiModelId !== null && sourceModels.has(ref.civitaiModelId))
    ) {
      return false
    }
    localModels.add(ref.localModelId)
    if (ref.civitaiModelId !== null) {
      sourceModels.add(ref.civitaiModelId)
    }
  }
  return true
}

function assertTarget(
  target: FrozenAnimaGenerationPreparationV1['target'] | FrozenGenerationTarget['composite'],
  bbox: IgsRectV1,
  bytes: Buffer,
): ReturnType<typeof classifyTargetPngAlpha> {
  if (
    bytes.length !== target.byteSize ||
    createHash('sha256').update(bytes).digest('hex') !== target.sha256 ||
    target.colorSpace !== 'srgb' ||
    target.iccSha256 !== IGS_SRGB_ICC_SHA256 ||
    target.width !== bbox.width ||
    target.height !== bbox.height ||
    !hasIccProfile(bytes) ||
    ('format' in target && target.format !== 'png')
  ) {
    refuse('GENERATION_TARGET_CHANGED', 'The frozen Anima target failed its integrity check.')
  }
  try {
    return classifyTargetPngAlpha(bytes, bbox.width, bbox.height)
  } catch {
    return refuse(
      'GENERATION_TARGET_CHANGED',
      'The frozen Anima target is not bounded RGBA pixels.',
    )
  }
}

function assertBbox(bbox: IgsRectV1): void {
  if (
    !Number.isSafeInteger(bbox.x) ||
    !Number.isSafeInteger(bbox.y) ||
    Math.abs(bbox.x) > 2_147_483_647 ||
    Math.abs(bbox.y) > 2_147_483_647
  ) {
    refuse('GENERATION_PARAMETER_UNSUPPORTED', 'The Anima generation bbox coordinates are invalid.')
  }
}

function hasIccProfile(png: Buffer): boolean {
  let offset = 8
  while (offset + 12 <= png.length) {
    const size = png.readUInt32BE(offset)
    const next = offset + size + 12
    if (next > png.length) {
      return false
    }
    const type = png.toString('ascii', offset + 4, offset + 8)
    if (type === 'iCCP') {
      return true
    }
    if (type === 'IEND') {
      return false
    }
    offset = next
  }
  return false
}

function validFile(managedPath: string, byteSize: number, sha256: string): boolean {
  return (
    path.isAbsolute(managedPath) &&
    path.resolve(managedPath) === managedPath &&
    Number.isSafeInteger(byteSize) &&
    byteSize > 0 &&
    /^[a-f0-9]{64}$/.test(sha256)
  )
}

function isUint32(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xff_ff_ff_ff
  )
}

async function* pngChunks(bytes: Buffer): AsyncGenerator<Buffer> {
  yield bytes
}

function refuse(code: string, message: string): never {
  throw new GenerationPreparationError(code, message)
}
