import { compileAnimaFlowSamplingPlan } from '../../shared/projects/anima-flow-sampling-plan.js'
import {
  ANIMA_PROMPT_INTERPRETATION,
  compileAnimaPromptWeighting,
  compileAnimaPromptWeightingForInterpretation,
} from '../../shared/projects/anima-prompt-weighting.js'
import type { AnimaWorkerRequest } from '../../shared/projects/anima-worker-request.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type { IgsProjectDocumentV1, IgsRectV1 } from '../../shared/projects/project-schema.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'

import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { VerifiedAnimaGenerationBundle } from '../models/model-service.js'
import type { PreparedAnimaGenerationBatchItem } from './anima-generation-batch.js'
import type {
  AnimaGenerationModelResolver,
  FrozenAnimaGenerationLora,
  FrozenAnimaGenerationPreparationV1,
  FrozenAnimaOutpaintPreparationV1,
} from './anima-generation-preparation.js'

import { GENERATION_STAGING_LIMITS } from './generation-staging-limits.js'
import {
  FrozenAlphaOutpaintConditioningSchema,
  type FrozenAlphaOutpaintConditioningV1,
} from './outpaint-conditioning.js'

export type FrozenQueuedAnimaGenerationContextV1 = Fields &
  (
    | { kind: 'anima-img2img-preparation'; sampling: Sampling & { denoisingStrength: number } }
    | { kind: 'anima-txt2img-preparation'; sampling: Sampling }
  )
export type FrozenQueuedAnimaGenerationV1 = {
  originRequestId: string
  schemaVersion: 1
} & (
  | {
      context: Extract<FrozenQueuedAnimaGenerationContextV1, { kind: 'anima-img2img-preparation' }>
      kind: 'anima-img2img'
      workerJob: WorkerJob & { sampling: Extract<AnimaJob['sampling'], { mode: 'img2img' }> }
    }
  | {
      context: Extract<FrozenQueuedAnimaGenerationContextV1, { kind: 'anima-txt2img-preparation' }>
      kind: 'anima-txt2img'
      workerJob: WorkerJob & { sampling: Extract<AnimaJob['sampling'], { mode: 'txt2img' }> }
    }
)
export type FrozenQueuedAnimaOutpaintContextV1 = Omit<
  Extract<FrozenQueuedAnimaGenerationContextV1, { kind: 'anima-img2img-preparation' }>,
  'kind'
> & {
  conditioning: FrozenAlphaOutpaintConditioningV1
  kind: 'anima-outpaint-preparation'
}
export interface FrozenQueuedAnimaOutpaintV1 {
  context: FrozenQueuedAnimaOutpaintContextV1
  kind: 'anima-outpaint'
  originRequestId: string
  schemaVersion: 1
  workerJob: Extract<FrozenQueuedAnimaGenerationV1, { kind: 'anima-img2img' }>['workerJob']
}
type Draft = IgsProjectDocumentV1['generationDraft']
type AnimaJob = AnimaWorkerRequest['job']
type Fields = {
  animaPromptInterpretation?: typeof ANIMA_PROMPT_INTERPRETATION
  bbox: IgsRectV1
  cfgRescale?: 0
  documentId: string
  documentRevision: string
  loras: FrozenAnimaGenerationLora[]
  loraStack: Draft['loras']
  model: VerifiedAnimaGenerationBundle
  prompts: { negative: string; positive: string }
  schemaVersion: 1
  target: FrozenAnimaGenerationPreparationV1['target']
  vaePrecision?: 'Auto'
}
type Sampling = Omit<FrozenAnimaGenerationPreparationV1['sampling'], 'denoisingStrength'> & {
  seedBehavior: 'per-iteration' | 'per-prompt'
}
type WorkerJob = Omit<AnimaJob, 'output' | 'sampling' | 'target'> & {
  target: Omit<AnimaJob['target'], 'path'>
}

const uint = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const positive = v.pipe(v.number(), v.safeInteger(), v.minValue(1))
const uint32 = v.pipe(uint, v.maxValue(0xff_ff_ff_ff))
const finite = v.pipe(v.number(), v.finite())
const sha = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/))
const name = v.pipe(v.string(), v.nonEmpty(), v.maxBytes(IGS_SAFETY_CEILINGS.titleBytes))
const canonicalPath = v.pipe(
  v.string(),
  v.nonEmpty(),
  v.check((value) => path.isAbsolute(value) && path.resolve(value) === value),
)
const uuid = v.pipe(v.string(), v.uuid())
const side = v.pipe(
  positive,
  v.minValue(64),
  v.maxValue(2048),
  v.check((value) => value % 8 === 0),
)
const position = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(-IGS_SAFETY_CEILINGS.coordinateMagnitude),
  v.maxValue(IGS_SAFETY_CEILINGS.coordinateMagnitude),
)
const bbox = v.pipe(
  v.strictObject({ height: side, width: side, x: position, y: position }),
  v.check((value) => value.width * value.height <= 4_000_000),
)
const prompt = v.pipe(v.string(), v.maxBytes(16 * 1024))
const rawPrompts = v.strictObject({ negative: prompt, positive: prompt })
const referenceFields = {
  baseModelFamily: v.nullable(v.picklist(['illustrious', 'anima'])),
  civitaiFileId: v.nullable(uint),
  civitaiModelId: v.nullable(uint),
  civitaiVersionId: v.nullable(uint),
  displayName: name,
  fileSha256: sha,
  kind: v.literal('lora'),
  localModelId: name,
  localVersionId: name,
  predictionType: v.nullable(v.picklist(['epsilon', 'sample', 'v_prediction'])),
  versionName: name,
}
const animaLoraRef = v.strictObject({
  ...referenceFields,
  baseModelFamily: v.literal('anima'),
  predictionType: v.null_(),
})
const checkpointRef = v.strictObject({ ...animaLoraRef.entries, kind: v.literal('checkpoint') })
const configuredStack = v.pipe(
  v.array(
    v.strictObject({
      enabled: v.boolean(),
      resource: v.strictObject(referenceFields),
      weight: finite,
    }),
  ),
  v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
  v.check((entries) =>
    entries.every(
      (entry) =>
        !entry.enabled ||
        (entry.resource.baseModelFamily === 'anima' && entry.resource.predictionType === null),
    ),
  ),
)
const frozenLoras = v.pipe(
  v.array(
    v.strictObject({
      byteSize: positive,
      managedPath: canonicalPath,
      reference: animaLoraRef,
      weight: finite,
    }),
  ),
  v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
)
const component = v.strictObject({
  byteSize: positive,
  localModelId: name,
  localVersionId: name,
  managedPath: canonicalPath,
  sha256: sha,
})
const bundle = v.strictObject({
  architecture: v.literal('anima-base-1.0'),
  checkpoint: v.strictObject({
    byteSize: positive,
    managedPath: canonicalPath,
    reference: checkpointRef,
  }),
  qwen3Encoder: component,
  vae: component,
})
const method = v.picklist(['euler', 'heun', 'dpmpp_2m', 'dpmpp_2m_sde', 'er_sde', 'lcm'])
const strength = v.pipe(finite, v.minValue(0), v.maxValue(1))
const sampling = v.strictObject({
  animaMethod: method,
  cfgScale: v.pipe(finite, v.minValue(1), v.maxValue(30)),
  requestedSeedPolicy: v.picklist(['fixed', 'random', 'reuse']),
  seed: uint32,
  seedBehavior: v.picklist(['per-iteration', 'per-prompt']),
  steps: v.pipe(positive, v.maxValue(200)),
})
const targetFields = {
  byteSize: v.pipe(positive, v.maxValue(32 * 1024 * 1024)),
  height: side,
  iccSha256: v.literal(IGS_SRGB_ICC_SHA256),
  sha256: sha,
  width: side,
}
const contextFields = {
  animaPromptInterpretation: v.optional(v.literal(ANIMA_PROMPT_INTERPRETATION)),
  bbox,
  cfgRescale: v.optional(v.literal(0)),
  documentId: uuid,
  documentRevision: uuid,
  loras: frozenLoras,
  loraStack: configuredStack,
  model: bundle,
  prompts: rawPrompts,
  schemaVersion: v.literal(1),
  target: v.strictObject({
    ...targetFields,
    colorSpace: v.literal('srgb'),
    format: v.literal('png'),
  }),
  vaePrecision: v.optional(v.literal('Auto')),
}
const txtContext = v.strictObject({
  ...contextFields,
  kind: v.literal('anima-txt2img-preparation'),
  sampling,
})
const imgContext = v.strictObject({
  ...contextFields,
  kind: v.literal('anima-img2img-preparation'),
  sampling: v.strictObject({ ...sampling.entries, denoisingStrength: strength }),
})
const compiledPrompt = v.strictObject({
  cleanedText: prompt,
  spans: v.pipe(
    v.array(v.strictObject({ end: uint, start: uint, weight: finite })),
    v.maxLength(16 * 1024),
  ),
  version: v.literal('anima-prompt-weighting-v1'),
})
const planFields = {
  beginIndex: uint,
  guidanceScale: finite,
  height: side,
  initialSigma: finite,
  posteriorSeed: v.nullable(uint32),
  scheduler: method,
  seed: uint32,
  sigmas: v.pipe(v.array(finite), v.maxLength(400)),
  startStep: uint,
  steps: v.pipe(positive, v.maxValue(200)),
  stepSeed: uint32,
  timesteps: v.pipe(v.array(finite), v.maxLength(399)),
  totalSteps: uint,
  version: v.literal('anima-flow-denoising-v1'),
  width: side,
}
const txtPlan = v.strictObject({ ...planFields, mode: v.literal('txt2img'), strength: v.null_() })
const imgPlan = v.strictObject({ ...planFields, mode: v.literal('img2img'), strength })
const workerFile = v.strictObject({ byteSize: positive, path: canonicalPath, sha256: sha })
const workerFields = {
  bbox,
  loras: v.pipe(
    v.array(v.strictObject({ ...workerFile.entries, weight: finite })),
    v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
  ),
  model: v.strictObject({
    architecture: v.literal('anima-base-1.0'),
    checkpoint: workerFile,
    qwen3Encoder: workerFile,
    vae: workerFile,
  }),
  prompts: v.strictObject({ negative: compiledPrompt, positive: compiledPrompt }),
  schemaVersion: v.literal(1),
  target: v.strictObject(targetFields),
}
const payloadFields = { originRequestId: uuid, schemaVersion: v.literal(1) }
/** Structure is strict; call the parser as well to verify authoritative semantic agreement. */
export const FrozenQueuedAnimaGenerationSchema = v.variant('kind', [
  v.strictObject({
    ...payloadFields,
    context: txtContext,
    kind: v.literal('anima-txt2img'),
    workerJob: v.strictObject({ ...workerFields, sampling: txtPlan }),
  }),
  v.strictObject({
    ...payloadFields,
    context: imgContext,
    kind: v.literal('anima-img2img'),
    workerJob: v.strictObject({ ...workerFields, sampling: imgPlan }),
  }),
])

export const FrozenQueuedAnimaOutpaintSchema = v.strictObject({
  ...payloadFields,
  context: v.strictObject({
    ...imgContext.entries,
    conditioning: FrozenAlphaOutpaintConditioningSchema,
    kind: v.literal('anima-outpaint-preparation'),
  }),
  kind: v.literal('anima-outpaint'),
  workerJob: v.strictObject({ ...workerFields, sampling: imgPlan }),
})

export function parseFrozenQueuedAnimaOutpaintV1(json: string): FrozenQueuedAnimaOutpaintV1 {
  if (Buffer.byteLength(json, 'utf8') > GENERATION_STAGING_LIMITS.frozenPayloadBytes) {
    invalid()
  }
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    invalid()
  }
  const parsed = v.safeParse(FrozenQueuedAnimaOutpaintSchema, value)
  if (!parsed.success) {
    invalid()
  }
  assertAgreement(parsed.output)
  assertOutpaintAgreement(parsed.output.context)
  return parsed.output
}

/** Concrete numeric request data only; this creates no public wire command or output pathname. */
export function buildFrozenQueuedAnimaOutpaintV1(
  context: FrozenAnimaOutpaintPreparationV1,
  originRequestId: string,
): FrozenQueuedAnimaOutpaintV1 {
  const { colorSpace: _space, format: _format, ...target } = context.target
  const scalarSampling = { ...context.sampling, seedBehavior: context.dynamic.seedBehavior }
  const model = context.model
  return parseFrozenQueuedAnimaOutpaintV1(
    JSON.stringify({
      context: {
        animaPromptInterpretation: ANIMA_PROMPT_INTERPRETATION,
        bbox: context.bbox,
        conditioning: context.conditioning,
        ...(context.generationDraft.cfgRescale !== undefined
          ? { cfgRescale: context.generationDraft.cfgRescale }
          : {}),
        documentId: context.documentId,
        documentRevision: context.documentRevision,
        kind: 'anima-outpaint-preparation',
        loras: context.loras,
        loraStack: context.generationDraft.loras,
        model,
        prompts: context.prompts,
        sampling: scalarSampling,
        schemaVersion: 1,
        target: context.target,
        ...(context.generationDraft.vaePrecision !== undefined
          ? { vaePrecision: context.generationDraft.vaePrecision }
          : {}),
      },
      kind: 'anima-outpaint',
      originRequestId,
      schemaVersion: 1,
      workerJob: {
        bbox: context.bbox,
        loras: context.loras.map((entry) => ({
          byteSize: entry.byteSize,
          path: entry.managedPath,
          sha256: entry.reference.fileSha256,
          weight: entry.weight,
        })),
        model: {
          architecture: model.architecture,
          checkpoint: {
            byteSize: model.checkpoint.byteSize,
            path: model.checkpoint.managedPath,
            sha256: model.checkpoint.reference.fileSha256,
          },
          qwen3Encoder: {
            byteSize: model.qwen3Encoder.byteSize,
            path: model.qwen3Encoder.managedPath,
            sha256: model.qwen3Encoder.sha256,
          },
          vae: {
            byteSize: model.vae.byteSize,
            path: model.vae.managedPath,
            sha256: model.vae.sha256,
          },
        },
        prompts: {
          negative: compileAnimaPromptWeighting(context.prompts.negative),
          positive: compileAnimaPromptWeighting(context.prompts.positive),
        },
        sampling: compileAnimaFlowSamplingPlan({
          guidanceScale: context.sampling.cfgScale,
          height: context.bbox.height,
          mode: 'img2img',
          scheduler: context.sampling.animaMethod,
          seed: context.sampling.seed,
          steps: context.sampling.steps,
          strength: context.sampling.denoisingStrength,
          width: context.bbox.width,
        }),
        schemaVersion: 1,
        target,
      },
    }),
  )
}

function assertOutpaintAgreement(context: FrozenQueuedAnimaOutpaintContextV1): void {
  const source = context.conditioning.sourceTarget
  if (
    !isDeepStrictEqual(context.conditioning.bbox, context.bbox) ||
    source.sha256 !== context.target.sha256 ||
    source.byteSize !== context.target.byteSize ||
    source.width !== context.target.width ||
    source.height !== context.target.height ||
    source.iccSha256 !== context.target.iccSha256
  ) {
    invalid()
  }
}

const sourceFields = {
  ...workerFields,
  output: v.strictObject({ pngPath: canonicalPath, stagingRoot: canonicalPath }),
  target: v.strictObject({ ...targetFields, path: canonicalPath }),
}
const sourceRequest = v.variant('type', [
  v.strictObject({
    job: v.strictObject({ ...sourceFields, sampling: txtPlan }),
    protocolVersion: v.literal('1'),
    requestId: uuid,
    type: v.literal('generate-anima-txt2img'),
  }),
  v.strictObject({
    job: v.strictObject({ ...sourceFields, sampling: imgPlan }),
    protocolVersion: v.literal('1'),
    requestId: uuid,
    type: v.literal('generate-anima-img2img'),
  }),
])

export class AnimaQueuedGenerationError extends Error {
  readonly code = 'QUEUE_INPUT_INVALID'
  constructor(message: string) {
    super(message)
    this.name = 'AnimaQueuedGenerationError'
  }
}
/**
 * One concrete job, excluding dynamic templates, inactive family settings and disposable image
 * paths.
 */
export function buildFrozenQueuedAnimaGenerationV1(input: {
  context: FrozenAnimaGenerationPreparationV1
  item: PreparedAnimaGenerationBatchItem
  request: AnimaWorkerRequest
}): FrozenQueuedAnimaGenerationV1 {
  const { context, item, request } = structuredClone(input)
  const { output, target, ...job } = request.job
  const { path: targetPath, ...workerTarget } = target
  if (
    !v.is(sourceRequest, request) ||
    !v.is(uuid, request.requestId) ||
    request.protocolVersion !== '1' ||
    request.type !==
      (context.mode === 'img2img' ? 'generate-anima-img2img' : 'generate-anima-txt2img') ||
    Buffer.byteLength(`${JSON.stringify(request)}\n`, 'utf8') > 64 * 1024 ||
    !path.isAbsolute(output.stagingRoot) ||
    path.resolve(output.stagingRoot) !== output.stagingRoot ||
    path.dirname(targetPath) !== output.stagingRoot ||
    path.dirname(output.pngPath) !== output.stagingRoot ||
    path.resolve(targetPath) !== targetPath ||
    path.resolve(output.pngPath) !== output.pngPath ||
    !targetPath.endsWith('.png') ||
    !output.pngPath.endsWith('.png') ||
    targetPath === output.pngPath ||
    !isDeepStrictEqual(item.compiledPrompts, request.job.prompts) ||
    !isDeepStrictEqual(item.samplingPlan, request.job.sampling)
  ) {
    invalid()
  }
  const common = {
    animaPromptInterpretation: ANIMA_PROMPT_INTERPRETATION,
    bbox: context.bbox,
    ...(context.generationDraft.cfgRescale !== undefined
      ? { cfgRescale: context.generationDraft.cfgRescale }
      : {}),
    documentId: context.documentId,
    documentRevision: context.documentRevision,
    loras: context.loras,
    loraStack: context.generationDraft.loras,
    model: context.model,
    prompts: item.prompts,
    schemaVersion: 1,
    target: context.target,
    ...(context.generationDraft.vaePrecision !== undefined
      ? { vaePrecision: context.generationDraft.vaePrecision }
      : {}),
  }
  const scalarSampling = {
    animaMethod: context.sampling.animaMethod,
    cfgScale: context.sampling.cfgScale,
    requestedSeedPolicy: context.sampling.requestedSeedPolicy,
    seed: item.seed,
    seedBehavior: context.dynamic.seedBehavior,
    steps: context.sampling.steps,
  }
  const value = {
    context:
      context.mode === 'txt2img'
        ? { ...common, kind: 'anima-txt2img-preparation', sampling: scalarSampling }
        : {
            ...common,
            kind: 'anima-img2img-preparation',
            sampling: { ...scalarSampling, denoisingStrength: context.sampling.denoisingStrength },
          },
    kind: context.mode === 'txt2img' ? 'anima-txt2img' : 'anima-img2img',
    originRequestId: request.requestId,
    schemaVersion: 1,
    workerJob: { ...job, target: workerTarget },
  }
  const parsed = parseFrozenQueuedAnimaGenerationV1(JSON.stringify(value))
  const paths = [
    parsed.workerJob.model.checkpoint.path,
    parsed.workerJob.model.qwen3Encoder.path,
    parsed.workerJob.model.vae.path,
    ...parsed.workerJob.loras.map((entry) => entry.path),
  ]
  if (paths.includes(targetPath) || paths.includes(output.pngPath)) {
    invalid()
  }
  return parsed
}

/** Validate persisted concrete text, plan/version, exact resource projections and configured stack. */
export function parseFrozenQueuedAnimaGenerationV1(json: string): FrozenQueuedAnimaGenerationV1 {
  if (
    typeof json !== 'string' ||
    Buffer.byteLength(json, 'utf8') > GENERATION_STAGING_LIMITS.frozenPayloadBytes
  ) {
    invalid()
  }
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    invalid()
  }
  const result = v.safeParse(FrozenQueuedAnimaGenerationSchema, value)
  if (!result.success) {
    invalid()
  }
  const payload: FrozenQueuedAnimaGenerationV1 = result.output
  try {
    assertAgreement(payload)
  } catch {
    invalid()
  }
  return payload
}

/**
 * Retry/dispatch checks captured identities, including pinned companions, without rebuilding
 * authoring.
 */
export async function reverifyFrozenQueuedAnimaGeneration(
  input: FrozenQueuedAnimaGenerationV1,
  resolver: AnimaGenerationModelResolver,
): Promise<void> {
  const payload = parseFrozenQueuedAnimaGenerationV1(JSON.stringify(input))
  const model = await resolver.resolveVerifiedGenerationAnimaBundleForPlan(
    payload.context.model.checkpoint.reference,
  )
  if (!isDeepStrictEqual(model, payload.context.model)) {
    invalid()
  }
  for (const entry of payload.context.loras) {
    const verified = await resolver.resolveVerifiedAnimaGenerationLoraForPlan(entry.reference)
    if (
      !isDeepStrictEqual(verified, {
        byteSize: entry.byteSize,
        managedPath: entry.managedPath,
        reference: entry.reference,
      })
    ) {
      invalid()
    }
  }
}

function invalid(): never {
  throw new AnimaQueuedGenerationError('The frozen Anima generation input is invalid.')
}

function assertAgreement(
  payload: FrozenQueuedAnimaGenerationV1 | FrozenQueuedAnimaOutpaintV1,
): void {
  const { context, workerJob } = payload
  const actualPrompts = {
    negative: compileAnimaPromptWeightingForInterpretation(
      context.prompts.negative,
      context.animaPromptInterpretation,
    ),
    positive: compileAnimaPromptWeightingForInterpretation(
      context.prompts.positive,
      context.animaPromptInterpretation,
    ),
  }
  const actualPlan = compileAnimaFlowSamplingPlan({
    guidanceScale: context.sampling.cfgScale,
    height: context.bbox.height,
    mode: payload.kind === 'anima-txt2img' ? 'txt2img' : 'img2img',
    scheduler: context.sampling.animaMethod,
    seed: context.sampling.seed,
    steps: context.sampling.steps,
    strength:
      context.kind === 'anima-txt2img-preparation' ? null : context.sampling.denoisingStrength,
    width: context.bbox.width,
  })
  const { loras, loraStack, model } = context
  const expectedModel = {
    architecture: model.architecture,
    checkpoint: {
      byteSize: model.checkpoint.byteSize,
      path: model.checkpoint.managedPath,
      sha256: model.checkpoint.reference.fileSha256,
    },
    qwen3Encoder: {
      byteSize: model.qwen3Encoder.byteSize,
      path: model.qwen3Encoder.managedPath,
      sha256: model.qwen3Encoder.sha256,
    },
    vae: { byteSize: model.vae.byteSize, path: model.vae.managedPath, sha256: model.vae.sha256 },
  }
  const expectedLoras = loras.map((entry) => ({
    byteSize: entry.byteSize,
    path: entry.managedPath,
    sha256: entry.reference.fileSha256,
    weight: entry.weight,
  }))
  const enabled = loraStack.filter((entry) => entry.enabled)
  const civitaiModels = new Set<number>()
  const models = new Set<string>()
  for (const [index, entry] of enabled.entries()) {
    if (
      models.has(entry.resource.localModelId) ||
      (entry.resource.civitaiModelId !== null &&
        civitaiModels.has(entry.resource.civitaiModelId)) ||
      !isDeepStrictEqual(entry.resource, loras[index]?.reference) ||
      entry.weight !== loras[index]?.weight
    ) {
      invalid()
    }
    models.add(entry.resource.localModelId)
    if (entry.resource.civitaiModelId !== null) {
      civitaiModels.add(entry.resource.civitaiModelId)
    }
  }
  const paths = [
    model.checkpoint.managedPath,
    model.qwen3Encoder.managedPath,
    model.vae.managedPath,
    ...loras.map((entry) => entry.managedPath),
  ]
  const { colorSpace: _space, format: _format, ...metadata } = context.target
  if (
    !isDeepStrictEqual(actualPrompts, workerJob.prompts) ||
    !isDeepStrictEqual(actualPlan, workerJob.sampling) ||
    !isDeepStrictEqual(expectedModel, workerJob.model) ||
    !isDeepStrictEqual(expectedLoras, workerJob.loras) ||
    !isDeepStrictEqual(context.bbox, workerJob.bbox) ||
    !isDeepStrictEqual(metadata, workerJob.target) ||
    context.bbox.width !== context.target.width ||
    context.bbox.height !== context.target.height ||
    enabled.length !== loras.length ||
    new Set(paths).size !== paths.length
  ) {
    invalid()
  }
}
