import { compileAnimaFlowSamplingPlan } from '../../shared/projects/anima-flow-sampling-plan.js'
import { captureCompiledAnimaPrompt } from '../../shared/projects/anima-worker-request.js'
import type { AnimaWorkerRequest } from '../../shared/projects/anima-worker-request.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  type IllustriousNoiseProfileV1,
  isIllustriousNoiseProfileV1,
  supportsIllustriousNoiseProfile,
} from '../../shared/projects/illustrious-noise-profile.js'

import type { Stats } from 'node:fs'

import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { IllustriousTxt2ImgRequestV1 } from './illustrious-txt2img-job.js'
import type {
  SmartPatchFadeMode,
  SmartPatchPreparationSource,
  VerifiedWorkerImage,
} from './worker-client.js'

import { decodeDerivedProjectMaskPng } from './project-mask.js'
import {
  assertSmartPatchConditioningSize,
  ProjectWorkerError,
  readSmartPatchModelSourceOutput,
  readSmartPatchPreparationOutput,
} from './worker-client.js'

export type SmartPatchIllustriousInference = Omit<
  IllustriousTxt2ImgRequestV1['job'],
  'bbox' | 'output' | 'sampling' | 'schemaVersion' | 'target'
> & {
  sampling: IllustriousTxt2ImgRequestV1['job']['sampling'] & { denoisingStrength?: number }
}
export type SmartPatchAnimaInference = Omit<
  AnimaWorkerRequest['job'],
  'bbox' | 'output' | 'schemaVersion' | 'target'
>

/** Private numerical wire, deliberately outside durable queue/public generation unions. */
export type SmartPatchExecutionRequest = SmartPatchExecutionFields &
  (
    | { family: 'anima'; inference: SmartPatchAnimaInference }
    | { family: 'illustrious'; inference: SmartPatchIllustriousInference }
  )
export interface SmartPatchExecutionResult {
  actualSeed: number
  output: VerifiedWorkerImage
}
interface SmartPatchExecutionFields {
  internalResolution: { height: number; width: number }
  latentKeepMask: SmartPatchPreparationSource
  mode: SmartPatchFadeMode
  modelSource: SmartPatchPreparationSource | null
  output: { pngPath: string; stagingRoot: string }
  protocolVersion: '1'
  requestId: string
  schemaVersion: 1
  type: 'execute-smart-patch'
}

const integer = (minimum: number, maximum = Number.MAX_SAFE_INTEGER) =>
  v.pipe(v.number(), v.safeInteger(), v.minValue(minimum), v.maxValue(maximum))
const number = (minimum: number, maximum: number) =>
  v.pipe(v.number(), v.finite(), v.minValue(minimum), v.maxValue(maximum))
const filePath = v.pipe(
  v.string(),
  v.nonEmpty(),
  v.check(
    (value) => !value.includes('\0') && path.isAbsolute(value) && path.resolve(value) === value,
  ),
)
const sha = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/))
const dimensions = { height: integer(1, 2048), width: integer(1, 2048) }
const reference = v.strictObject({
  ...dimensions,
  byteSize: integer(1, 32 * 1024 * 1024),
  path: filePath,
  sha256: sha,
})
const resource = { byteSize: integer(1), path: filePath, sha256: sha }
const lora = v.strictObject({ ...resource, weight: v.pipe(v.number(), v.finite()) })
const prompt = v.pipe(
  v.string(),
  v.check(
    (value) =>
      Buffer.byteLength(value) <= 16 * 1024 &&
      !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value),
  ),
)
const embeddings = v.strictObject({
  negative: v.array(v.strictObject({ ...resource, token: v.pipe(prompt, v.nonEmpty()) })),
  positive: v.array(v.strictObject({ ...resource, token: v.pipe(prompt, v.nonEmpty()) })),
})
const common = {
  internalResolution: v.strictObject(dimensions),
  latentKeepMask: reference,
  mode: v.picklist(['txt2img', 'img2img', 'inpaint', 'outpaint']),
  modelSource: v.nullable(reference),
  output: v.strictObject({ pngPath: filePath, stagingRoot: filePath }),
  protocolVersion: v.literal('1'),
  requestId: v.pipe(v.string(), v.uuid()),
  schemaVersion: v.literal(1),
  type: v.literal('execute-smart-patch'),
}
const schema = v.variant('family', [
  v.strictObject({
    ...common,
    family: v.literal('illustrious'),
    inference: v.strictObject({
      checkpoint: v.strictObject({
        path: filePath,
        predictionType: v.picklist(['epsilon', 'v_prediction', 'sample']),
        sha256: sha,
      }),
      embeddings: v.optional(embeddings),
      loras: v.optional(v.array(lora)),
      prompts: v.strictObject({ negative: prompt, positive: prompt }),
      sampling: v.strictObject({
        cfgRescale: v.optional(number(0, 0.99)),
        cfgScale: number(1, 30),
        denoisingStrength: v.optional(number(0, 1)),
        noiseProfile: v.optional(v.custom<IllustriousNoiseProfileV1>(isIllustriousNoiseProfileV1)),
        scheduler: v.picklist([
          'dpmpp_2m_k',
          'dpmpp_2m',
          'euler',
          'euler_a',
          'dpmpp_sde_k',
          'dpmpp_sde',
        ]),
        seed: integer(0, 0xff_ff_ff_ff),
        steps: integer(1, 200),
      }),
      vae: v.optional(v.nullable(v.strictObject(resource))),
      vaePrecision: v.optional(v.picklist(['Auto', 'FP16', 'FP32'])),
    }),
  }),
  v.strictObject({
    ...common,
    family: v.literal('anima'),
    inference: v.strictObject({
      loras: v.array(lora),
      model: v.strictObject({
        architecture: v.literal('anima-base-1.0'),
        checkpoint: v.strictObject(resource),
        qwen3Encoder: v.strictObject(resource),
        vae: v.strictObject(resource),
      }),
      prompts: v.strictObject({ negative: v.unknown(), positive: v.unknown() }),
      sampling: v.unknown(),
    }),
  }),
])

/** Snapshot before awaits and validate native metadata without inventing a normal target/bbox. */
export function captureSmartPatchExecutionRequest(input: unknown): SmartPatchExecutionRequest {
  const parsed = v.safeParse(schema, structuredClone(input))
  if (!parsed.success) {
    throw new ProjectWorkerError(
      'INVALID_REQUEST',
      'The private Smart Patch execution request is invalid.',
    )
  }
  const request = parsed.output
  assertSmartPatchConditioningSize(request.internalResolution)
  const { height, width } = request.internalResolution
  if (
    (request.mode === 'txt2img') !== (request.modelSource === null) ||
    (request.modelSource &&
      (request.modelSource.width !== width || request.modelSource.height !== height)) ||
    request.latentKeepMask.width !== width / 8 ||
    request.latentKeepMask.height !== height / 8
  ) {
    throw new ProjectWorkerError(
      'INVALID_REQUEST',
      'Smart Patch mode and prepared dimensions differ.',
    )
  }
  if (request.family === 'illustrious') {
    const sampling = request.inference.sampling
    if (
      (request.mode === 'txt2img') !== (sampling.denoisingStrength === undefined) ||
      (sampling.noiseProfile &&
        !supportsIllustriousNoiseProfile(sampling.scheduler, sampling.noiseProfile))
    ) {
      throw new ProjectWorkerError(
        'INVALID_REQUEST',
        'Smart Patch sampling differs from its mode or checkpoint policy.',
      )
    }
  } else {
    const sampling = request.inference.sampling
    if (!sampling || typeof sampling !== 'object' || Array.isArray(sampling)) {
      throw new ProjectWorkerError('INVALID_REQUEST', 'Anima sampling is invalid.')
    }
    const plan = sampling as Record<string, unknown>
    const expected = compileAnimaFlowSamplingPlan({
      guidanceScale: plan.guidanceScale,
      height,
      mode: request.mode === 'txt2img' ? 'txt2img' : 'img2img',
      scheduler: plan.scheduler,
      seed: plan.seed,
      steps: plan.steps,
      strength: plan.strength,
      width,
    })
    if (!isDeepStrictEqual(plan, expected)) {
      throw new ProjectWorkerError(
        'INVALID_REQUEST',
        'Anima sampling differs from its native policy.',
      )
    }
    request.inference.sampling = expected
    request.inference.prompts = {
      negative: captureCompiledAnimaPrompt(request.inference.prompts.negative),
      positive: captureCompiledAnimaPrompt(request.inference.prompts.positive),
    }
  }
  if (Buffer.byteLength(`${JSON.stringify(request)}\n`) > 64 * 1024) {
    throw new ProjectWorkerError(
      'INVALID_REQUEST',
      'The private Smart Patch request exceeds 64 KiB.',
    )
  }
  return request as SmartPatchExecutionRequest
}

/** Confirm the worker's concrete seed, preserving zero and the complete uint32 range. */
export function requireSmartPatchActualSeed(actualSeed: unknown, expectedSeed: number): number {
  if (
    typeof actualSeed !== 'number' ||
    !Number.isInteger(actualSeed) ||
    actualSeed < 0 ||
    actualSeed > 0xff_ff_ff_ff ||
    actualSeed !== expectedSeed
  ) {
    throw new ProjectWorkerError(
      'OUTPUT_MISMATCH',
      'Smart Patch execution actual seed differs from its frozen request.',
    )
  }
  return actualSeed
}

/** Full file boundary shared by production JSONL transport and declared integration collaborators. */
export async function executeSmartPatchWithTransport(
  input: SmartPatchExecutionRequest,
  scratchBasePath: string,
  exchange: (request: SmartPatchExecutionRequest) => Promise<Record<string, unknown>>,
): Promise<SmartPatchExecutionResult> {
  const request = captureSmartPatchExecutionRequest(input)
  const stage = request.output.stagingRoot
  await canonicalDirectory(scratchBasePath)
  const stageEntry = await canonicalDirectory(stage)
  // The shared scratch base follows the existing application's mkdir/umask policy. Each actual
  // operation stage is a separate mkdtemp-owned directory and must remain private to its owner.
  if ((stageEntry.mode & 0o022) !== 0) {
    throw new ProjectWorkerError('INVALID_PATH', 'Smart Patch operation staging must be private.')
  }
  if (!within(scratchBasePath, stage)) {
    throw new ProjectWorkerError('INVALID_PATH', 'Smart Patch staging is outside owned scratch.')
  }
  const images = [
    request.latentKeepMask.path,
    ...(request.modelSource ? [request.modelSource.path] : []),
    request.output.pngPath,
  ]
  if (
    new Set(images).size !== images.length ||
    images.some((file) => path.dirname(file) !== stage || path.extname(file) !== '.png')
  ) {
    throw new ProjectWorkerError(
      'INVALID_PATH',
      'Smart Patch inputs and output must be distinct staging PNG children.',
    )
  }
  const resources =
    request.family === 'anima'
      ? [
          request.inference.model.checkpoint,
          request.inference.model.qwen3Encoder,
          request.inference.model.vae,
          ...request.inference.loras,
        ]
      : [
          request.inference.checkpoint,
          ...(request.inference.loras ?? []),
          ...(request.inference.vae ? [request.inference.vae] : []),
          ...(request.inference.embeddings?.positive ?? []),
          ...(request.inference.embeddings?.negative ?? []),
        ]
  for (const resource of resources) {
    const stat = await lstat(resource.path)
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      (await realpath(resource.path)) !== resource.path ||
      within(scratchBasePath, resource.path) ||
      resource.path === scratchBasePath ||
      ('byteSize' in resource && resource.byteSize !== stat.size)
    ) {
      throw new ProjectWorkerError('INVALID_PATH', 'A Smart Patch resource is unsafe or changed.')
    }
  }
  const keepBytes = await readSmartPatchPreparationOutput(
    request.latentKeepMask.path,
    request.latentKeepMask,
    'mask',
  )
  if (
    (request.mode === 'txt2img' || request.mode === 'img2img') &&
    decodeDerivedProjectMaskPng(keepBytes, request.latentKeepMask).some((value) => value !== 0)
  ) {
    throw new ProjectWorkerError('INVALID_REQUEST', 'Ordinary Smart Patch modes require zero KEEP.')
  }
  if (request.modelSource) {
    await readSmartPatchModelSourceOutput(request.modelSource.path, {
      ...request.modelSource,
      colorSpace: 'srgb',
      iccSha256: IGS_SRGB_ICC_SHA256,
    })
  }
  try {
    await lstat(request.output.pngPath)
    throw new ProjectWorkerError('INVALID_PATH', 'Smart Patch output already exists.')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error
    }
  }
  const response = await exchange(request)
  const actualSeed = requireSmartPatchActualSeed(
    response.actualSeed,
    request.inference.sampling.seed,
  )
  const metadata = v.safeParse(
    v.strictObject({
      ...dimensions,
      byteSize: integer(1, 32 * 1024 * 1024),
      colorSpace: v.literal('srgb'),
      sha256: sha,
    }),
    response.output,
  )
  if (
    response.type !== 'smart-patch-executed' ||
    response.protocolVersion !== '1' ||
    response.requestId !== request.requestId ||
    !metadata.success ||
    metadata.output.width !== request.internalResolution.width ||
    metadata.output.height !== request.internalResolution.height
  ) {
    throw new ProjectWorkerError(
      'OUTPUT_MISMATCH',
      'Smart Patch execution returned invalid RGB metadata.',
    )
  }
  const output: VerifiedWorkerImage = {
    ...metadata.output,
    iccSha256: IGS_SRGB_ICC_SHA256,
    path: request.output.pngPath,
  }
  await readSmartPatchModelSourceOutput(output.path, output)
  return { actualSeed, output }
}

function within(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  )
}

async function canonicalDirectory(directory: string): Promise<Stats> {
  const stat = await lstat(directory)
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (await realpath(directory)) !== directory
  ) {
    throw new ProjectWorkerError(
      'INVALID_PATH',
      'Smart Patch staging must be an owned canonical directory.',
    )
  }
  return stat
}
