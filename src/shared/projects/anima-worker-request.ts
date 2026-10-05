import {
  type AnimaFlowSamplingPlan,
  type AnimaFlowScheduler,
  compileAnimaFlowSamplingPlan,
} from './anima-flow-sampling-plan.js'
import {
  compileAnimaPromptWeighting,
  type CompiledAnimaPromptWeighting,
} from './anima-prompt-weighting.js'
import { IGS_SRGB_ICC_SHA256 } from './color-profile.js'
import { supportsInferenceAnima } from './inference-worker-capabilities.js'

export interface AnimaWorkerFile {
  readonly byteSize: number
  readonly path: string
  readonly sha256: string
}

export interface AnimaWorkerModel {
  readonly architecture: 'anima-base-1.0'
  readonly checkpoint: AnimaWorkerFile
  readonly qwen3Encoder: AnimaWorkerFile
  readonly vae: AnimaWorkerFile
}

export interface AnimaWorkerLora extends AnimaWorkerFile {
  readonly weight: number
}

/** Concrete frozen inputs only: dynamic expansion and managed-file qualification belong to Main. */
export type AnimaWorkerRequestInput = AnimaWorkerInputFields &
  (
    | {
        readonly mode: 'img2img'
        readonly sampling: AnimaWorkerSamplingInput & { readonly strength: number }
      }
    | {
        readonly mode: 'txt2img'
        readonly sampling: AnimaWorkerSamplingInput & { readonly strength: null }
      }
  )

export type AnimaWorkerRequest = {
  readonly protocolVersion: '1'
  readonly requestId: string
} & (
  | {
      readonly job: AnimaWorkerJobFields & {
        readonly sampling: Extract<AnimaFlowSamplingPlan, { mode: 'img2img' }>
      }
      readonly type: 'generate-anima-img2img'
    }
  | {
      readonly job: AnimaWorkerJobFields & {
        readonly sampling: Extract<AnimaFlowSamplingPlan, { mode: 'txt2img' }>
      }
      readonly type: 'generate-anima-txt2img'
    }
)

interface AnimaWorkerInputFields {
  readonly bbox: {
    readonly height: number
    readonly width: number
    readonly x: number
    readonly y: number
  }
  readonly loras: readonly AnimaWorkerLora[]
  readonly model: AnimaWorkerModel
  readonly output: { readonly pngPath: string; readonly stagingRoot: string }
  readonly prompts: { readonly negative: string; readonly positive: string }
  readonly requestId: string
  readonly target: AnimaWorkerFile & {
    readonly height: number
    readonly iccSha256: string
    readonly width: number
  }
}

interface AnimaWorkerSamplingInput {
  readonly guidanceScale: number
  readonly scheduler: AnimaFlowScheduler
  readonly seed: number
  readonly steps: number
}

interface AnimaWorkerJobFields extends Omit<AnimaWorkerInputFields, 'prompts' | 'requestId'> {
  readonly prompts: {
    readonly negative: CompiledAnimaPromptWeighting
    readonly positive: CompiledAnimaPromptWeighting
  }
  readonly schemaVersion: 1
}

export class AnimaWorkerRequestError extends Error {
  constructor(
    readonly code: 'INFERENCE_UNAVAILABLE' | 'INVALID_REQUEST',
    message: string,
  ) {
    super(message)
    this.name = 'AnimaWorkerRequestError'
  }
}

const MAX_MESSAGE_BYTES = 64 * 1024
const MAX_TARGET_BYTES = 32 * 1024 * 1024
const MAX_COORDINATE = 2_147_483_647
const REQUEST_ID = /^[A-Z0-9][\w.-]{0,127}$/i
const SHA256 = /^[a-f0-9]{64}$/

/**
 * Capture one worker command using the authoritative weighting and six-method plan compilers. This
 * validates transport shape and peer support, not managed-file or native model compatibility. It
 * does not admit a Project job, write files or modify the caller's authored prompt.
 */
export function buildAnimaWorkerRequest(input: unknown, ready: unknown): AnimaWorkerRequest {
  if (!supportsInferenceAnima(ready)) {
    throw new AnimaWorkerRequestError(
      'INFERENCE_UNAVAILABLE',
      'The worker has not qualified the original Anima pipeline.',
    )
  }
  const fields = capture(input, [
    'requestId',
    'mode',
    'model',
    'bbox',
    'target',
    'output',
    'prompts',
    'sampling',
    'loras',
  ])
  if (typeof fields.requestId !== 'string' || !REQUEST_ID.test(fields.requestId)) {
    invalid('Anima request identity is invalid.')
  }
  if (fields.mode !== 'txt2img' && fields.mode !== 'img2img') {
    invalid('Anima request mode is unsupported.')
  }
  const modelFields = capture(fields.model, ['architecture', 'checkpoint', 'qwen3Encoder', 'vae'])
  if (modelFields.architecture !== 'anima-base-1.0') {
    invalid('Anima model architecture is unsupported.')
  }
  const model = Object.freeze({
    architecture: 'anima-base-1.0' as const,
    checkpoint: file(modelFields.checkpoint),
    qwen3Encoder: file(modelFields.qwen3Encoder),
    vae: file(modelFields.vae),
  })
  const filePaths = new Set([model.checkpoint.path, model.qwen3Encoder.path, model.vae.path])
  if (filePaths.size !== 3) {
    invalid('Anima requires three distinct model files.')
  }
  const bboxFields = capture(fields.bbox, ['x', 'y', 'width', 'height'])
  const bbox = Object.freeze({
    height: integer(bboxFields.height, 1, Number.MAX_SAFE_INTEGER),
    width: integer(bboxFields.width, 1, Number.MAX_SAFE_INTEGER),
    x: integer(bboxFields.x, -MAX_COORDINATE, MAX_COORDINATE),
    y: integer(bboxFields.y, -MAX_COORDINATE, MAX_COORDINATE),
  })
  const samplingFields = capture(fields.sampling, [
    'guidanceScale',
    'scheduler',
    'seed',
    'steps',
    'strength',
  ])
  const targetFields = capture(fields.target, [
    'path',
    'sha256',
    'byteSize',
    'width',
    'height',
    'iccSha256',
  ])
  const target = Object.freeze({
    byteSize: integer(targetFields.byteSize, 1, MAX_TARGET_BYTES),
    height: integer(targetFields.height, 1, Number.MAX_SAFE_INTEGER),
    iccSha256: digest(targetFields.iccSha256),
    path: canonicalPath(targetFields.path),
    sha256: digest(targetFields.sha256),
    width: integer(targetFields.width, 1, Number.MAX_SAFE_INTEGER),
  })
  if (
    target.width !== bbox.width ||
    target.height !== bbox.height ||
    target.iccSha256 !== IGS_SRGB_ICC_SHA256
  ) {
    invalid('Anima target geometry or color profile differs.')
  }
  const outputFields = capture(fields.output, ['pngPath', 'stagingRoot'])
  const output = Object.freeze({
    pngPath: canonicalPath(outputFields.pngPath),
    stagingRoot: canonicalPath(outputFields.stagingRoot),
  })
  if (
    parentPath(target.path) !== output.stagingRoot ||
    parentPath(output.pngPath) !== output.stagingRoot ||
    !hasPngSuffix(target.path) ||
    !hasPngSuffix(output.pngPath) ||
    target.path === output.pngPath
  ) {
    invalid('Anima target and result must be distinct direct staging children.')
  }
  if (filePaths.has(target.path) || filePaths.has(output.pngPath)) {
    invalid('Anima model files must be distinct from request images.')
  }
  const loras = Object.freeze(
    captureArray(fields.loras).map((value: unknown) => {
      const loraFields = capture(value, ['path', 'sha256', 'byteSize', 'weight'])
      const lora = Object.freeze({ ...fileFields(loraFields), weight: finite(loraFields.weight) })
      if (filePaths.has(lora.path) || lora.path === target.path || lora.path === output.pngPath) {
        invalid('Anima LoRAs must be distinct files.')
      }
      filePaths.add(lora.path)
      return lora
    }),
  )
  const promptFields = capture(fields.prompts, ['positive', 'negative'])
  if (typeof promptFields.positive !== 'string' || typeof promptFields.negative !== 'string') {
    invalid('Anima concrete prompts must be text.')
  }
  const sampling = compileAnimaFlowSamplingPlan({
    ...samplingFields,
    height: bbox.height,
    mode: fields.mode,
    width: bbox.width,
  })
  const prompts = Object.freeze({
    negative: compileAnimaPromptWeighting(promptFields.negative),
    positive: compileAnimaPromptWeighting(promptFields.positive),
  })
  const job = { bbox, loras, model, output, prompts, schemaVersion: 1 as const, target }
  const envelope = { protocolVersion: '1' as const, requestId: fields.requestId }
  const request: AnimaWorkerRequest =
    sampling.mode === 'txt2img'
      ? Object.freeze({
          ...envelope,
          job: Object.freeze({ ...job, sampling }),
          type: 'generate-anima-txt2img',
        })
      : Object.freeze({
          ...envelope,
          job: Object.freeze({ ...job, sampling }),
          type: 'generate-anima-img2img',
        })
  if (new TextEncoder().encode(`${JSON.stringify(request)}\n`).length > MAX_MESSAGE_BYTES) {
    invalid('Anima request exceeds the 64 KiB worker line limit.')
  }
  return request
}

function capture(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  ) {
    invalid('Anima request fields must be plain objects.')
  }
  const ownKeys = Reflect.ownKeys(input)
  const descriptors = Object.getOwnPropertyDescriptors(input)
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
  ) {
    invalid('Anima request fields are unsupported.')
  }
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    const descriptor = descriptors[key]
    if (!descriptor || !('value' in descriptor)) {
      invalid('Anima request requires plain field values.')
    }
    result[key] = descriptor.value
  }
  return result
}

function captureArray(input: unknown): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
    invalid('Anima LoRAs must be a plain ordered array.')
  }
  if (Reflect.ownKeys(input).length !== input.length + 1) {
    invalid('Anima LoRA array fields are unsupported.')
  }
  const result: unknown[] = []
  for (let index = 0; index < input.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, index)
    if (!descriptor || !('value' in descriptor)) {
      invalid('Anima LoRA entries require plain values.')
    }
    result.push(descriptor.value)
  }
  return result
}

function file(input: unknown): AnimaWorkerFile {
  return Object.freeze(fileFields(capture(input, ['path', 'sha256', 'byteSize'])))
}

function fileFields(input: Record<string, unknown>): AnimaWorkerFile {
  return {
    byteSize: integer(input.byteSize, 1, Number.MAX_SAFE_INTEGER),
    path: canonicalPath(input.path),
    sha256: digest(input.sha256),
  }
}

function canonicalPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\0')) {
    invalid('Anima files require absolute normalized paths.')
  }
  const points = Array.from(value)
  if (
    points.length > 4096 ||
    points.some((point) => {
      const code = point.codePointAt(0)!
      return code >= 0xd8_00 && code <= 0xdf_ff
    }) ||
    value
      .slice(1)
      .split('/')
      .some((part) => part === '' || part === '.' || part === '..')
  ) {
    invalid('Anima files require bounded normalized Unicode paths.')
  }
  return value
}

function parentPath(value: string): string {
  return value.slice(0, value.lastIndexOf('/')) || '/'
}

function hasPngSuffix(value: string): boolean {
  return value.endsWith('.png') && value.slice(value.lastIndexOf('/') + 1) !== '.png'
}

function digest(value: unknown): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    invalid('Anima files require a lowercase SHA-256 identity.')
  }
  return value
}

function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid('Anima requires a finite numeric value.')
  }
  return value
}

function integer(value: unknown, minimum: number, maximum: number): number {
  const number = finite(value)
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    invalid('Anima integer is outside the supported range.')
  }
  return number
}

function invalid(message: string): never {
  throw new AnimaWorkerRequestError('INVALID_REQUEST', message)
}
