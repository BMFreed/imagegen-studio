import { ANIMA_PROMPT_INTERPRETATION } from '../../shared/projects/anima-prompt-weighting.js'
import type { AnimaWorkerRequest } from '../../shared/projects/anima-worker-request.js'
import { ANIMA_REGIONAL_COMPOSITION_PROFILE } from '../../shared/projects/regional-invoke-generation.js'

import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { AnimaOutpaintRequestV1 } from './outpaint-worker-request.js'

import {
  type FrozenQueuedAnimaGenerationV1,
  type FrozenQueuedAnimaOutpaintV1,
  parseFrozenQueuedAnimaGenerationV1,
  parseFrozenQueuedAnimaOutpaintV1,
} from './anima-queued-generation.js'
import {
  type AnimaRegionalWorkerInput,
  captureAnimaRegionalWorkerInput,
} from './anima-regional-worker-request.js'
import { GenerationQueueError } from './generation-queue.js'
import {
  assertRegionalJsonTree,
  createRegionalQueuedAlphaCollector,
  loadOwnedRegionalQueuedFiles,
  regionalAlphaRefSchema,
} from './regional-queued-generation.js'
import {
  type RegionalOutpaintInfill,
  RegionalOutpaintInfillSchema,
} from './regional-worker-request.js'

export type FrozenQueuedAnimaRegionalV1 = RegionalFields &
  (
    | (Omit<Extract<FrozenQueuedAnimaGenerationV1, { kind: 'anima-img2img' }>, 'kind'> & {
        kind: 'anima-regional-img2img'
      })
    | (Omit<Extract<FrozenQueuedAnimaGenerationV1, { kind: 'anima-txt2img' }>, 'kind'> & {
        kind: 'anima-regional-txt2img'
      })
    | (Omit<FrozenQueuedAnimaOutpaintV1, 'kind'> & {
        kind: 'anima-regional-outpaint'
        outpaintInfill: RegionalOutpaintInfill
      })
  )
export interface AnimaRegionalQueuedMaterial {
  compositionProfile: typeof ANIMA_REGIONAL_COMPOSITION_PROFILE
  files: Record<string, Buffer>
  outpaintInfill?: RegionalOutpaintInfill
  promptInterpretation: typeof ANIMA_PROMPT_INTERPRETATION
  regional: FrozenQueuedAnimaRegionalV1['regional']
}
interface RegionalFields {
  compositionProfile: typeof ANIMA_REGIONAL_COMPOSITION_PROFILE
  promptInterpretation: typeof ANIMA_PROMPT_INTERPRETATION
  regional: { byteSize: number; sha256: string }
}
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const metadataSchema = v.strictObject({
  compiledPrompts: v.unknown(),
  compositionProfile: v.literal(ANIMA_REGIONAL_COMPOSITION_PROFILE),
  promptInterpretation: v.literal(ANIMA_PROMPT_INTERPRETATION),
  recipe: v.unknown(),
  schemaVersion: v.literal(1),
})
type Metadata = v.InferOutput<typeof metadataSchema>
type Alpha = v.InferOutput<typeof regionalAlphaRefSchema>['$alpha8']

export function parseFrozenQueuedAnimaRegionalV1(json: string): FrozenQueuedAnimaRegionalV1 {
  try {
    if (Buffer.byteLength(json, 'utf8') > 128 * 1024) {
      invalid()
    }
    const value = JSON.parse(json) as FrozenQueuedAnimaRegionalV1
    const { compositionProfile, outpaintInfill, promptInterpretation, regional, ...base } =
      value as FrozenQueuedAnimaRegionalV1 & { outpaintInfill?: unknown }
    if (
      (value.kind !== 'anima-regional-txt2img' &&
        value.kind !== 'anima-regional-img2img' &&
        value.kind !== 'anima-regional-outpaint') ||
      compositionProfile !== ANIMA_REGIONAL_COMPOSITION_PROFILE ||
      promptInterpretation !== ANIMA_PROMPT_INTERPRETATION ||
      !v.is(
        v.strictObject({
          byteSize: v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(1024 * 1024)),
          sha256: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
        }),
        regional,
      )
    ) {
      invalid()
    }
    const outpaint = value.kind === 'anima-regional-outpaint'
    if (
      outpaint ? !v.is(RegionalOutpaintInfillSchema, outpaintInfill) : outpaintInfill !== undefined
    ) {
      invalid()
    }
    const ordinary = (
      outpaint ? parseFrozenQueuedAnimaOutpaintV1 : parseFrozenQueuedAnimaGenerationV1
    )(
      JSON.stringify({
        ...base,
        kind: outpaint
          ? 'anima-outpaint'
          : value.kind === 'anima-regional-img2img'
            ? 'anima-img2img'
            : 'anima-txt2img',
      }),
    )
    if (
      ordinary.context.animaPromptInterpretation !== promptInterpretation ||
      ordinary.context.bbox.width > 512 ||
      ordinary.context.bbox.height > 512 ||
      ordinary.context.loras.length !== 0 ||
      ordinary.context.loraStack.some((entry) => entry.enabled) ||
      (ordinary.context.vaePrecision ?? 'Auto') !== 'Auto' ||
      (ordinary.context.cfgRescale ?? 0) !== 0
    ) {
      invalid()
    }
    if (ordinary.kind === 'anima-outpaint') {
      const infill = v.parse(RegionalOutpaintInfillSchema, outpaintInfill)
      const { path: _path, ...identity } = infill
      if (!isDeepStrictEqual(identity, ordinary.context.conditioning.infillResource)) {
        invalid()
      }
      return {
        ...ordinary,
        compositionProfile,
        kind: 'anima-regional-outpaint',
        outpaintInfill: v.parse(RegionalOutpaintInfillSchema, outpaintInfill),
        promptInterpretation,
        regional,
      }
    }
    return ordinary.kind === 'anima-img2img'
      ? {
          ...ordinary,
          compositionProfile,
          kind: 'anima-regional-img2img',
          promptInterpretation,
          regional,
        }
      : {
          ...ordinary,
          compositionProfile,
          kind: 'anima-regional-txt2img',
          promptInterpretation,
          regional,
        }
  } catch {
    invalid()
  }
}

export function captureAnimaRegionalQueuedMaterial(
  input: AnimaRegionalWorkerInput,
): AnimaRegionalQueuedMaterial {
  const captured = captureAnimaRegionalWorkerInput(input)
  const { alpha, files } = createRegionalQueuedAlphaCollector()
  const recipe = {
    ...captured.recipe,
    regions: captured.recipe.regions.map((region, index) => ({
      ...region,
      coverage: {
        ...region.coverage,
        alpha: alpha(region.coverage.alpha, `region-${index}.alpha8`),
      },
    })),
  }
  const metadata = {
    compiledPrompts: captured.compiledPrompts,
    compositionProfile: captured.compositionProfile,
    promptInterpretation: captured.promptInterpretation,
    recipe,
    schemaVersion: 1,
  }
  assertRegionalJsonTree(metadata)
  const bytes = Buffer.from(JSON.stringify(metadata), 'utf8')
  if (bytes.length > 1024 * 1024) {
    invalid()
  }
  files['regional.json'] = bytes
  return {
    compositionProfile: captured.compositionProfile,
    files,
    ...(captured.request.type === 'generate-anima-outpaint'
      ? { outpaintInfill: { ...captured.request.job.infillResource } }
      : {}),
    promptInterpretation: captured.promptInterpretation,
    regional: { byteSize: bytes.length, sha256: sha256(bytes) },
  }
}

export async function loadAnimaRegionalQueuedFiles(
  root: string,
  payload: FrozenQueuedAnimaRegionalV1,
): Promise<Record<string, Buffer>> {
  const captured = parseFrozenQueuedAnimaRegionalV1(JSON.stringify(payload))
  return await loadOwnedRegionalQueuedFiles(root, captured.regional, parseMetadata, collect)
}
export async function loadAnimaRegionalQueuedInput(
  root: string,
  payload: FrozenQueuedAnimaRegionalV1,
  request: AnimaOutpaintRequestV1 | AnimaWorkerRequest,
): Promise<AnimaRegionalWorkerInput> {
  const captured = parseFrozenQueuedAnimaRegionalV1(JSON.stringify(payload))
  const detachedRequest = structuredClone(request)
  const files = await loadAnimaRegionalQueuedFiles(root, captured)
  const metadata = parseMetadata(files['regional.json'])
  const recipe = metadata.recipe as AnimaRegionalWorkerInput['recipe']
  const hydrated = {
    ...recipe,
    regions: recipe.regions.map((region) => {
      const descriptor = v.parse(regionalAlphaRefSchema, region.coverage.alpha).$alpha8
      return {
        ...region,
        coverage: { ...region.coverage, alpha: new Uint8Array(files[descriptor.file]) },
      }
    }),
  }
  const { schemaVersion: _version, ...fields } = metadata
  const input = captureAnimaRegionalWorkerInput({
    ...fields,
    compiledPrompts: metadata.compiledPrompts,
    recipe: hydrated,
    request: detachedRequest,
  } as AnimaRegionalWorkerInput)
  const { output: _output, target, ...jobFields } = input.request.job
  const job =
    input.request.type === 'generate-anima-outpaint'
      ? (() => {
          const {
            conditioning: _conditioning,
            infillResource: _infill,
            ...numeric
          } = input.request.job
          const { output: _output, target: _target, ...rest } = numeric
          return rest
        })()
      : jobFields
  if (
    captured.kind === 'anima-regional-outpaint' &&
    (input.request.type !== 'generate-anima-outpaint' ||
      !isDeepStrictEqual(input.request.job.conditioning, captured.context.conditioning) ||
      !isDeepStrictEqual(input.request.job.infillResource, captured.outpaintInfill))
  ) {
    invalid()
  }
  const { path: _path, ...descriptor } = target
  if (
    !isDeepStrictEqual({ ...job, target: descriptor }, captured.workerJob) ||
    input.recipe.documentId !== captured.context.documentId ||
    input.recipe.documentRevision !== captured.context.documentRevision ||
    !isDeepStrictEqual(input.recipe.item.prompts, captured.context.prompts)
  ) {
    invalid()
  }
  return input
}
function parseMetadata(bytes: Buffer): Metadata {
  try {
    const value: unknown = JSON.parse(bytes.toString('utf8'))
    if (!Buffer.from(JSON.stringify(value), 'utf8').equals(bytes)) {
      invalid()
    }
    const parsed = v.parse(metadataSchema, value)
    collect(parsed)
    return parsed
  } catch {
    invalid()
  }
}
function collect(metadata: Metadata): Alpha[] {
  const recipe = metadata.recipe as AnimaRegionalWorkerInput['recipe']
  if (
    !recipe ||
    !Array.isArray(recipe.regions) ||
    recipe.regions.length < 1 ||
    recipe.regions.length > 3
  ) {
    invalid()
  }
  return recipe.regions.map((region, index) => {
    const descriptor = v.parse(regionalAlphaRefSchema, region.coverage?.alpha).$alpha8
    if (descriptor.file !== `region-${index}.alpha8`) {
      invalid()
    }
    return descriptor
  })
}
function invalid(): never {
  throw new GenerationQueueError(
    'QUEUE_INPUT_INVALID',
    'The frozen Anima regional input is invalid.',
  )
}
