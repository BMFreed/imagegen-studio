import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  isQualifiedInferenceWorkerReady,
  supportsInferenceCFGRescale,
  supportsInferenceImg2Img,
  supportsInferenceLora,
  supportsInferenceVaePrecision,
} from '../../shared/projects/inference-worker-capabilities.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'

import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { GenerationModelResolver } from './illustrious-generation-loras.js'
import type { IllustriousSchedulerKey } from './illustrious-scheduler.js'
import type {
  PreparedNormalGeneration,
  PreparedNormalTxt2Img,
} from './project-generation-preparation.js'

import {
  frozenLoraFieldsAgree,
  type IllustriousWorkerLora,
  reverifyFrozenGenerationLoras,
  workerLoras,
} from './illustrious-generation-loras.js'
import { resolveIllustriousScheduler } from './illustrious-scheduler.js'
import { classifyTargetPngAlpha } from './target-png-mode.js'

const MAX_TARGET_SIDE = 2048
const MAX_TARGET_PIXELS = 4_000_000
const MAX_TARGET_BYTES = 32 * 1024 * 1024
const MAX_PROMPT_BYTES = 16 * 1024
const MAX_PROTOCOL_LINE_BYTES = 64 * 1024
const MAX_STEPS = 200
const MAX_CFG_SCALE = 30
const SHA256_PATTERN = /^[a-f0-9]{64}$/

/** Protocol v1 request shape; this is not a queue row or a released inference capability. */
export interface IllustriousTxt2ImgRequestV1 {
  job: {
    bbox: { height: number; width: number; x: number; y: number }
    checkpoint: {
      path: string
      predictionType: 'epsilon' | 'sample' | 'v_prediction'
      sha256: string
    }
    loras?: IllustriousWorkerLora[]
    output: { pngPath: string; stagingRoot: string }
    prompts: { negative: string; positive: string }
    sampling: {
      cfgRescale?: number
      cfgScale: number
      scheduler: IllustriousSchedulerKey
      seed: number
      steps: number
    }
    schemaVersion: 1
    target: {
      byteSize: number
      height: number
      iccSha256: string
      path: string
      sha256: string
      width: number
    }
    vaePrecision?: 'Auto' | 'FP16' | 'FP32'
  }
  protocolVersion: '1'
  requestId: string
  type: 'generate-illustrious-txt2img'
}

export interface InferenceWorkerReady {
  capabilities: readonly string[]
  protocolVersion: string
  runtimeProfile: string
  workerVersion: string
}

export interface IllustriousImg2ImgRequestV1 extends Omit<
  IllustriousTxt2ImgRequestV1,
  'job' | 'type'
> {
  job: Omit<IllustriousTxt2ImgRequestV1['job'], 'sampling'> & {
    sampling: IllustriousTxt2ImgRequestV1['job']['sampling'] & { denoisingStrength: number }
  }
  type: 'generate-illustrious-img2img'
}
export type IllustriousGenerationRequestV1 =
  IllustriousImg2ImgRequestV1 | IllustriousTxt2ImgRequestV1

export class IllustriousJobError extends Error {
  constructor(
    readonly code:
      | 'GENERATION_INPUT_CHANGED'
      | 'GENERATION_PARAMETER_UNSUPPORTED'
      | 'GENERATION_PREDICTION_UNAVAILABLE'
      | 'GENERATION_SAMPLING_REQUIRED'
      | 'GENERATION_SAMPLING_UNSUPPORTED'
      | 'GENERATION_TARGET_UNSUPPORTED'
      | 'INFERENCE_UNAVAILABLE'
      | 'INVALID_STAGING_ROOT',
    message: string,
  ) {
    super(message)
    this.name = 'IllustriousJobError'
  }
}

/**
 * Lease a verified target file and a main-chosen provisional output path to one future worker
 * request. The callback must consume its output before returning; neither path survives cleanup.
 * This is deliberately separate from durable queue/candidate materialization.
 */
export async function withIllustriousTxt2ImgRequest<T>(input: {
  modelService: GenerationModelResolver
  prepared: PreparedNormalTxt2Img
  ready: InferenceWorkerReady
  scratchBasePath: string
  use: (request: IllustriousTxt2ImgRequestV1) => Promise<T>
}): Promise<T> {
  if (input.prepared.context.kind !== 'normal-txt2img-preparation') {
    throw new IllustriousJobError(
      'GENERATION_TARGET_UNSUPPORTED',
      'The legacy request requires a transparent txt2img target.',
    )
  }
  return await withIllustriousGenerationRequest({
    ...input,
    use: async (request) => {
      if (request.type !== 'generate-illustrious-txt2img') {
        throw new IllustriousJobError(
          'GENERATION_TARGET_UNSUPPORTED',
          'The legacy request requires a transparent txt2img target.',
        )
      }
      return await input.use(request)
    },
  })
}

/** Materialize either normal Illustrious operation through one verified scratch lease. */
export async function withIllustriousGenerationRequest<T>(input: {
  modelService: GenerationModelResolver
  prepared: PreparedNormalGeneration
  ready: InferenceWorkerReady
  scratchBasePath: string
  use: (request: IllustriousGenerationRequestV1) => Promise<T>
}): Promise<T> {
  // Copy before any await: a caller retaining the preparatory context or Buffer cannot alter this
  // request while model verification or filesystem materialization is in progress.
  const context = structuredClone(input.prepared.context)
  const bytes = Buffer.from(input.prepared.targetPngBytes)
  const qualified = validatePrepared(context, bytes)
  if (!isQualifiedInferenceWorkerReady(input.ready)) {
    throw new IllustriousJobError(
      'INFERENCE_UNAVAILABLE',
      'The active worker has not qualified Illustrious txt2img inference.',
    )
  }
  if ((context.sampling.cfgRescale ?? 0) !== 0 && !supportsInferenceCFGRescale(input.ready)) {
    throw new IllustriousJobError(
      'INFERENCE_UNAVAILABLE',
      'The active worker has not qualified Illustrious CFG Rescale.',
    )
  }
  if (context.kind === 'normal-img2img-preparation' && !supportsInferenceImg2Img(input.ready)) {
    throw new IllustriousJobError(
      'INFERENCE_UNAVAILABLE',
      'The active worker has not qualified Illustrious img2img.',
    )
  }
  if (context.loras?.length && !supportsInferenceLora(input.ready)) {
    throw new IllustriousJobError(
      'INFERENCE_UNAVAILABLE',
      'The active worker has not qualified Illustrious LoRA.',
    )
  }
  if (
    context.vaePrecision !== undefined &&
    context.vaePrecision !== 'Auto' &&
    !supportsInferenceVaePrecision(input.ready)
  ) {
    throw new IllustriousJobError(
      'INFERENCE_UNAVAILABLE',
      'The active worker has not qualified manual Illustrious VAE Precision.',
    )
  }
  await reverifyFrozenGenerationLoras(context, input.modelService)
  const verified = await input.modelService.resolveVerifiedGenerationCheckpointForPlan(
    context.model.reference,
  )
  if (
    verified.managedPath !== context.model.managedPath ||
    verified.reference.fileSha256 !== context.model.reference.fileSha256 ||
    verified.reference.predictionType !== qualified.predictionType
  ) {
    throw new IllustriousJobError(
      'GENERATION_INPUT_CHANGED',
      'The exact checkpoint path changed after preparation.',
    )
  }

  const base = await canonicalScratchBase(input.scratchBasePath)
  const stage = await mkdtemp(path.join(base, 'illustrious-request-'))
  try {
    const targetPath = path.join(stage, 'target.png')
    const outputPath = path.join(stage, 'result.png')
    await writeFile(targetPath, bytes, { flag: 'wx', mode: 0o600 })
    const written = await readFile(targetPath)
    if (written.length !== bytes.length || sha256(written) !== context.target.sha256) {
      throw new IllustriousJobError(
        'GENERATION_INPUT_CHANGED',
        'The materialized generation target failed verification.',
      )
    }
    const common: IllustriousTxt2ImgRequestV1 = {
      job: {
        ...(context.vaePrecision !== undefined ? { vaePrecision: context.vaePrecision } : {}),
        ...(context.loras !== undefined ? { loras: workerLoras(context) } : {}),
        bbox: { ...context.bbox },
        checkpoint: {
          path: verified.managedPath,
          predictionType: qualified.predictionType,
          sha256: context.model.reference.fileSha256,
        },
        output: { pngPath: outputPath, stagingRoot: stage },
        prompts: { ...context.prompts },
        sampling: {
          ...(supportsInferenceCFGRescale(input.ready) && context.sampling.cfgRescale !== undefined
            ? { cfgRescale: context.sampling.cfgRescale }
            : {}),
          cfgScale: context.sampling.cfgScale,
          scheduler: qualified.scheduler,
          seed: context.sampling.seed,
          steps: context.sampling.steps,
        },
        schemaVersion: 1,
        target: {
          byteSize: context.target.byteSize,
          height: context.target.height,
          iccSha256: context.target.iccSha256,
          path: targetPath,
          sha256: context.target.sha256,
          width: context.target.width,
        },
      },
      protocolVersion: '1',
      requestId: randomUUID(),
      type: 'generate-illustrious-txt2img',
    }
    const request: IllustriousGenerationRequestV1 =
      context.kind === 'normal-img2img-preparation'
        ? {
            ...common,
            job: {
              ...common.job,
              sampling: {
                ...common.job.sampling,
                denoisingStrength: context.sampling.denoisingStrength,
              },
            },
            type: 'generate-illustrious-img2img',
          }
        : common
    assertIllustriousTxt2ImgRequestFitsTransport(request)
    return await input.use(request)
  } finally {
    await rm(stage, { force: true, recursive: true })
  }
}

/** Check each concrete request, including JSON escaping, before grouped queue publication. */
export function assertIllustriousTxt2ImgRequestFitsTransport(
  request: IllustriousGenerationRequestV1,
): void {
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') + 1 > MAX_PROTOCOL_LINE_BYTES) {
    throw new IllustriousJobError(
      'GENERATION_PARAMETER_UNSUPPORTED',
      'The generation request exceeds the worker transport limit.',
    )
  }
}

function validatePrepared(
  context: PreparedNormalGeneration['context'],
  bytes: Buffer,
): {
  predictionType: 'epsilon' | 'sample' | 'v_prediction'
  scheduler: IllustriousSchedulerKey
} {
  const { bbox, model, prompts, sampling, target } = context
  if (
    context.vaePrecision !== undefined &&
    !['Auto', 'FP16', 'FP32'].includes(context.vaePrecision)
  ) {
    throw new IllustriousJobError(
      'GENERATION_PARAMETER_UNSUPPORTED',
      'The frozen VAE Precision is invalid.',
    )
  }
  if (!frozenLoraFieldsAgree(context, workerLoras(context))) {
    throw new IllustriousJobError(
      'GENERATION_INPUT_CHANGED',
      'The frozen LoRA configuration is invalid.',
    )
  }
  if (
    !['normal-img2img-preparation', 'normal-txt2img-preparation'].includes(context.kind) ||
    context.schemaVersion !== 1
  ) {
    throw new IllustriousJobError('GENERATION_INPUT_CHANGED', 'Unknown preparation context.')
  }
  if (
    !Number.isInteger(bbox.x) ||
    !Number.isInteger(bbox.y) ||
    Math.abs(bbox.x) > IGS_SAFETY_CEILINGS.coordinateMagnitude ||
    Math.abs(bbox.y) > IGS_SAFETY_CEILINGS.coordinateMagnitude ||
    !Number.isInteger(bbox.width) ||
    !Number.isInteger(bbox.height) ||
    bbox.width < 8 ||
    bbox.height < 8 ||
    bbox.width > MAX_TARGET_SIDE ||
    bbox.height > MAX_TARGET_SIDE ||
    bbox.width % 8 !== 0 ||
    bbox.height % 8 !== 0 ||
    bbox.width * bbox.height > MAX_TARGET_PIXELS
  ) {
    throw new IllustriousJobError(
      'GENERATION_TARGET_UNSUPPORTED',
      'Illustrious txt2img dimensions must be multiples of 8 within the target limits.',
    )
  }
  if (
    target.format !== 'png' ||
    target.colorSpace !== 'srgb' ||
    target.iccSha256 !== IGS_SRGB_ICC_SHA256 ||
    target.width !== bbox.width ||
    target.height !== bbox.height ||
    target.byteSize < 1 ||
    target.byteSize > MAX_TARGET_BYTES ||
    target.byteSize !== bytes.length ||
    !SHA256_PATTERN.test(target.sha256) ||
    sha256(bytes) !== target.sha256
  ) {
    throw new IllustriousJobError(
      'GENERATION_INPUT_CHANGED',
      'The prepared PNG target no longer matches its verified metadata.',
    )
  }
  const expectedMode = context.kind === 'normal-img2img-preparation' ? 'img2img' : 'txt2img'
  let actualMode: ReturnType<typeof classifyTargetPngAlpha>
  try {
    actualMode = classifyTargetPngAlpha(bytes, bbox.width, bbox.height)
  } catch {
    throw new IllustriousJobError(
      'GENERATION_INPUT_CHANGED',
      'The frozen target has invalid RGBA pixels.',
    )
  }
  if (actualMode !== expectedMode) {
    throw new IllustriousJobError(
      'GENERATION_TARGET_UNSUPPORTED',
      'The frozen operation differs from its RGBA target pixels.',
    )
  }
  if (context.kind === 'normal-img2img-preparation') {
    if (
      !Number.isFinite(context.sampling.denoisingStrength) ||
      context.sampling.denoisingStrength < 0 ||
      context.sampling.denoisingStrength > 1
    ) {
      throw new IllustriousJobError(
        'GENERATION_PARAMETER_UNSUPPORTED',
        'Illustrious img2img requires Denoising Strength between 0 and 1.',
      )
    }
  } else if ('denoisingStrength' in sampling) {
    throw new IllustriousJobError(
      'GENERATION_PARAMETER_UNSUPPORTED',
      'A txt2img request cannot contain active denoising strength.',
    )
  }
  if (
    model.reference.kind !== 'checkpoint' ||
    model.reference.baseModelFamily !== 'illustrious' ||
    !SHA256_PATTERN.test(model.reference.fileSha256) ||
    !path.isAbsolute(model.managedPath) ||
    path.resolve(model.managedPath) !== model.managedPath
  ) {
    throw new IllustriousJobError(
      'GENERATION_INPUT_CHANGED',
      'The exact Illustrious checkpoint identity is invalid.',
    )
  }
  if (
    model.reference.predictionType !== 'epsilon' &&
    model.reference.predictionType !== 'v_prediction' &&
    model.reference.predictionType !== 'sample'
  ) {
    throw new IllustriousJobError(
      'GENERATION_PREDICTION_UNAVAILABLE',
      'The checkpoint prediction type must be verified before inference.',
    )
  }
  if (
    !Number.isSafeInteger(sampling.steps) ||
    sampling.steps < 1 ||
    sampling.steps > MAX_STEPS ||
    !Number.isFinite(sampling.cfgScale) ||
    sampling.cfgScale < 1 ||
    sampling.cfgScale > MAX_CFG_SCALE ||
    (sampling.cfgRescale !== undefined &&
      (!Number.isFinite(sampling.cfgRescale) ||
        sampling.cfgRescale < 0 ||
        sampling.cfgRescale > 0.99)) ||
    !Number.isInteger(sampling.seed) ||
    sampling.seed < 0 ||
    sampling.seed > 0xff_ff_ff_ff
  ) {
    throw new IllustriousJobError(
      'GENERATION_PARAMETER_UNSUPPORTED',
      'Illustrious txt2img requires 1–200 Steps, CFG from 1–30 and a uint32 seed.',
    )
  }
  const resolved = resolveIllustriousScheduler(sampling.sampler, sampling.scheduler)
  if (resolved.kind === 'missing' || sampling.invokeScheduler === null) {
    throw new IllustriousJobError(
      'GENERATION_SAMPLING_REQUIRED',
      'Select an explicit sampler and scheduler before inference.',
    )
  }
  if (resolved.kind !== 'supported' || resolved.key !== sampling.invokeScheduler) {
    throw new IllustriousJobError(
      'GENERATION_SAMPLING_UNSUPPORTED',
      'The frozen sampler and scheduler do not match a supported Invoke scheduler.',
    )
  }
  if (
    typeof prompts.positive !== 'string' ||
    typeof prompts.negative !== 'string' ||
    Buffer.from(prompts.positive, 'utf8').toString('utf8') !== prompts.positive ||
    Buffer.from(prompts.negative, 'utf8').toString('utf8') !== prompts.negative ||
    Buffer.byteLength(prompts.positive, 'utf8') > MAX_PROMPT_BYTES ||
    Buffer.byteLength(prompts.negative, 'utf8') > MAX_PROMPT_BYTES
  ) {
    throw new IllustriousJobError(
      'GENERATION_PARAMETER_UNSUPPORTED',
      'A generation prompt exceeds the first worker transport limit.',
    )
  }
  return { predictionType: model.reference.predictionType, scheduler: resolved.key }
}

async function canonicalScratchBase(basePath: string): Promise<string> {
  if (!path.isAbsolute(basePath) || path.resolve(basePath) !== basePath) {
    throw new IllustriousJobError('INVALID_STAGING_ROOT', 'Scratch storage must be absolute.')
  }
  await mkdir(basePath, { recursive: true })
  const real = await realpath(basePath)
  if (real !== basePath || !(await lstat(real)).isDirectory()) {
    throw new IllustriousJobError('INVALID_STAGING_ROOT', 'Scratch storage is unavailable.')
  }
  return real
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}
