import type { AnimaWorkerRequest } from '../../shared/projects/anima-worker-request.js'
import {
  type RegionalInitializationProfile,
  RegionalInitializationProfileSchema,
} from '../../shared/projects/regional-initialization-profile.js'
import {
  REGIONAL_REFERENCE_IMG2IMG_PROFILE,
  REGIONAL_REFERENCE_INFERENCE_PROFILE,
  REGIONAL_REFERENCE_MAX_BYTES,
  REGIONAL_REFERENCE_MAX_IMAGES,
  REGIONAL_REFERENCE_MAX_SIDE,
  REGIONAL_REFERENCE_MAX_TOTAL_BYTES,
  REGIONAL_REFERENCE_OUTPAINT_PROFILE,
  REGIONAL_REFERENCE_PROFILES,
  type RegionalReferenceInferenceProfile,
  regionalReferenceProfileForMode,
} from '../../shared/projects/regional-reference-inference.js'

import { createHash } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { AnimaRegionalWorkerInput } from './anima-regional-worker-request.js'
import type {
  FrozenQueuedGenerationV1,
  FrozenQueuedIllustriousImg2ImgV1,
  FrozenQueuedIllustriousOutpaintV1,
  FrozenQueuedIllustriousTxt2ImgV1,
} from './generation-queue.js'
import type { AnimaOutpaintRequestV1 } from './outpaint-worker-request.js'
import type { QueuedResourceUse } from './queue-resource-usage.js'
import type {
  RegionalGenerationRequestV1,
  RegionalOutpaintInfill,
  RegionalWorkerInput,
} from './regional-worker-request.js'

import {
  type FrozenQueuedAnimaRegionalV1,
  loadAnimaRegionalQueuedFiles,
  loadAnimaRegionalQueuedInput,
  parseFrozenQueuedAnimaRegionalV1,
} from './anima-regional-queued-generation.js'
import { GenerationQueueError, parseFrozenGenerationPayloadV1 } from './generation-queue.js'
import { frozenEmbeddingFieldsAgree } from './illustrious-generation-embeddings.js'
import { frozenLoraFieldsAgree } from './illustrious-generation-loras.js'
import { frozenVaeFieldsAgree } from './illustrious-generation-vae.js'
import {
  captureRegionalWorkerInput,
  RegionalOutpaintInfillSchema,
  verifyRegionalReferenceWorkerResources,
} from './regional-worker-request.js'

/** Private operational identity, outside normal Generate and accepted-result provenance. */
export interface FrozenQueuedRegionalV1 extends Omit<FrozenQueuedIllustriousTxt2ImgV1, 'kind'> {
  initializationProfile?: RegionalInitializationProfile
  kind: 'illustrious-regional'
  referenceProfile?: typeof REGIONAL_REFERENCE_INFERENCE_PROFILE
  regional: { byteSize: number; sha256: string }
}

/** Public Invoke Canvas composition is a distinct frozen operation, never inferred from age. */
export interface FrozenQueuedRegionalInvokeTxt2ImgV1 extends Omit<FrozenQueuedRegionalV1, 'kind'> {
  compositionProfile: 'invoke-canvas-v1'
  kind: 'illustrious-regional-txt2img'
}

export interface FrozenQueuedRegionalInvokeImg2ImgV1 extends Omit<
  FrozenQueuedIllustriousImg2ImgV1,
  'kind'
> {
  compositionProfile: 'invoke-canvas-v1'
  initializationProfile?: never
  kind: 'illustrious-regional-img2img'
  referenceProfile?: typeof REGIONAL_REFERENCE_IMG2IMG_PROFILE
  regional: FrozenQueuedRegionalV1['regional']
}

export interface FrozenQueuedRegionalInvokeOutpaintV1 extends Omit<
  FrozenQueuedIllustriousOutpaintV1,
  'kind'
> {
  compositionProfile: 'invoke-canvas-v1'
  initializationProfile?: never
  kind: 'illustrious-regional-outpaint'
  outpaintInfill: RegionalOutpaintInfill
  referenceProfile?: typeof REGIONAL_REFERENCE_OUTPAINT_PROFILE
  regional: FrozenQueuedRegionalV1['regional']
}

export type FrozenQueuedRegionalInvokeV1 =
  | FrozenQueuedRegionalInvokeImg2ImgV1
  | FrozenQueuedRegionalInvokeOutpaintV1
  | FrozenQueuedRegionalInvokeTxt2ImgV1

export type FrozenQueuedIllustriousRegionalOperationalV1 =
  FrozenQueuedRegionalInvokeV1 | FrozenQueuedRegionalV1
export type FrozenQueuedRegionalOperationalV1 =
  FrozenQueuedAnimaRegionalV1 | FrozenQueuedIllustriousRegionalOperationalV1

export interface RegionalQueuedMaterial {
  compositionProfile?: 'invoke-canvas-v1'
  files: Record<string, Buffer>
  initializationProfile?: RegionalInitializationProfile
  outpaintInfill?: RegionalOutpaintInfill
  referenceProfile?: RegionalReferenceInferenceProfile
  regional: FrozenQueuedRegionalV1['regional']
}

type RegionalFrozenContext =
  | FrozenQueuedIllustriousImg2ImgV1['context']
  | FrozenQueuedIllustriousOutpaintV1['context']
  | FrozenQueuedIllustriousTxt2ImgV1['context']

const MAX_PAYLOAD_BYTES = 128 * 1024
const MAX_METADATA_BYTES = 1024 * 1024
const MAX_ALPHA_BYTES = 64 * 1024 * 1024
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const byteSize = v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(MAX_ALPHA_BYTES))
const sha = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/))
const regionalRef = v.strictObject({
  byteSize: v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(MAX_METADATA_BYTES)),
  sha256: sha,
})
export const regionalAlphaRefSchema = v.strictObject({
  $alpha8: v.strictObject({ byteSize, file: v.string(), sha256: sha }),
})
const regionalReferenceRefSchema = v.strictObject({
  $referencePng: v.strictObject({
    byteSize: v.pipe(
      v.number(),
      v.safeInteger(),
      v.minValue(1),
      v.maxValue(REGIONAL_REFERENCE_MAX_BYTES),
    ),
    file: v.string(),
    height: v.pipe(
      v.number(),
      v.safeInteger(),
      v.minValue(1),
      v.maxValue(REGIONAL_REFERENCE_MAX_SIDE),
    ),
    sha256: sha,
    width: v.pipe(
      v.number(),
      v.safeInteger(),
      v.minValue(1),
      v.maxValue(REGIONAL_REFERENCE_MAX_SIDE),
    ),
  }),
})
const queuedReferencesSchema = v.strictObject({
  images: v.pipe(
    v.array(
      v.strictObject({
        image: regionalReferenceRefSchema,
        referenceId: v.string(),
        regionId: v.string(),
      }),
    ),
    v.minLength(1),
    v.maxLength(REGIONAL_REFERENCE_MAX_IMAGES),
  ),
  profile: v.picklist(REGIONAL_REFERENCE_PROFILES),
  resources: v.unknown(),
})
const metadataSchema = v.strictObject({
  compositionProfile: v.optional(v.literal('invoke-canvas-v1')),
  globalNegativeCoverage: v.unknown(),
  globalPositiveCoverage: v.unknown(),
  initializationProfile: v.optional(RegionalInitializationProfileSchema),
  layout: v.picklist(['cfg-negative-first', 'positive-only']),
  negativePooledSourceId: v.string(),
  positivePooledSourceId: v.string(),
  recipe: v.unknown(),
  references: v.optional(queuedReferencesSchema),
  schemaVersion: v.literal(1),
})
type Metadata = v.InferOutput<typeof metadataSchema>
type AlphaRef = v.InferOutput<typeof regionalAlphaRefSchema>
type Snapshot = { bytes: Buffer; identity: BigIntStats; name: string }

/** Parse the private outer discriminator while retaining the existing ordinary agreement checks. */
export function parseFrozenQueuedRegionalV1(json: string): FrozenQueuedRegionalV1 {
  return parseRegionalPayload(json, false) as FrozenQueuedRegionalV1
}

export function parseFrozenQueuedRegionalInvokeV1(json: string): FrozenQueuedRegionalInvokeV1 {
  return parseRegionalPayload(json, true) as FrozenQueuedRegionalInvokeV1
}

/** Recovery and resource reload understand both operations without making private rows public. */
export function parseFrozenQueuedRegionalOperationalV1(
  json: string,
): FrozenQueuedRegionalOperationalV1 {
  if (
    readKind(json) === 'anima-regional-txt2img' ||
    readKind(json) === 'anima-regional-img2img' ||
    readKind(json) === 'anima-regional-outpaint'
  ) {
    return parseFrozenQueuedAnimaRegionalV1(json)
  }
  return parseRegionalPayload(
    json,
    [
      'illustrious-regional-img2img',
      'illustrious-regional-outpaint',
      'illustrious-regional-txt2img',
    ].includes(String(readKind(json))),
  )
}

/**
 * Accept only public operations. The original candidate hash is verified by the caller before
 * projecting reusable settings; no regional conditioning or managed pathname is added to
 * provenance.
 */
export function parseAcceptedGenerationBaseV1(json: string): FrozenQueuedGenerationV1 {
  if (
    readKind(json) === 'anima-regional-txt2img' ||
    readKind(json) === 'anima-regional-img2img' ||
    readKind(json) === 'anima-regional-outpaint'
  ) {
    const payload = parseFrozenQueuedAnimaRegionalV1(json)
    if (payload.kind === 'anima-regional-outpaint') {
      const {
        compositionProfile: _profile,
        outpaintInfill: _infill,
        promptInterpretation: _interpretation,
        regional: _regional,
        ...base
      } = payload
      return { ...base, kind: 'anima-outpaint' }
    }
    if (payload.kind === 'anima-regional-img2img') {
      const {
        compositionProfile: _profile,
        promptInterpretation: _interpretation,
        regional: _regional,
        ...base
      } = payload
      return { ...base, kind: 'anima-img2img' }
    }
    const {
      compositionProfile: _profile,
      promptInterpretation: _interpretation,
      regional: _regional,
      ...base
    } = payload
    return { ...base, kind: 'anima-txt2img' }
  }
  if (
    ![
      'illustrious-regional-img2img',
      'illustrious-regional-outpaint',
      'illustrious-regional-txt2img',
    ].includes(String(readKind(json)))
  ) {
    return parseFrozenGenerationPayloadV1(json)
  }
  const payload = parseFrozenQueuedRegionalInvokeV1(json)
  if (payload.kind === 'illustrious-regional-outpaint') {
    const {
      compositionProfile: _profile,
      initializationProfile: _init,
      outpaintInfill: _infill,
      referenceProfile: _references,
      regional: _regional,
      ...base
    } = payload
    return { ...base, kind: 'illustrious-outpaint' }
  }
  if (payload.kind === 'illustrious-regional-img2img') {
    const {
      compositionProfile: _profile,
      initializationProfile: _init,
      referenceProfile: _references,
      regional: _regional,
      ...base
    } = payload
    return { ...base, kind: 'illustrious-img2img' }
  }
  const {
    compositionProfile: _profile,
    initializationProfile: _init,
    referenceProfile: _references,
    regional: _regional,
    ...base
  } = payload
  return { ...base, kind: 'illustrious-txt2img' }
}

/**
 * InvokeAI a61ac4fb captures execution nodes and loads detached resources by name. This adapter
 * freezes the same input ownership as bounded fixed-role files in Studio's existing queue folder.
 * The queue owner writes/fsyncs the returned bytes before publishing its SQLite row.
 */
export function captureRegionalQueuedMaterial(
  input: RegionalWorkerInput,
  context?: RegionalFrozenContext,
): RegionalQueuedMaterial {
  const captured = captureRegionalWorkerInput(input)
  assertPublicRegionalGlobalEmbeddingsAgree(captured, context)
  const { alpha, files } = createRegionalQueuedAlphaCollector()
  const references =
    captured.references === undefined
      ? undefined
      : {
          ...captured.references,
          images: captured.references.images.map((entry, index) => {
            const file = `reference-${index}.png`
            files[file] = Buffer.from(entry.image.bytes)
            const { bytes: _bytes, ...identity } = entry.image
            return {
              image: { $referencePng: { ...identity, file } },
              referenceId: entry.referenceId,
              regionId: entry.regionId,
            }
          }),
        }
  const globalCoverage = (coverage: RegionalWorkerInput['globalNegativeCoverage'], sign: string) =>
    coverage.kind === 'everywhere'
      ? coverage
      : { ...coverage, alpha: alpha(coverage.alpha, `global-${sign}.alpha8`) }
  const metadata = {
    ...(captured.compositionProfile !== undefined
      ? { compositionProfile: captured.compositionProfile }
      : {}),
    ...(captured.initializationProfile !== undefined
      ? { initializationProfile: captured.initializationProfile }
      : {}),
    ...(references ? { references } : {}),
    globalNegativeCoverage: globalCoverage(captured.globalNegativeCoverage, 'negative'),
    globalPositiveCoverage: globalCoverage(captured.globalPositiveCoverage, 'positive'),
    layout: captured.layout,
    negativePooledSourceId: captured.negativePooledSourceId,
    positivePooledSourceId: captured.positivePooledSourceId,
    recipe: {
      ...captured.recipe,
      regions: captured.recipe.regions.map((region, index) => ({
        ...region,
        coverage: {
          ...region.coverage,
          alpha: alpha(region.coverage.alpha, `region-${index}.alpha8`),
        },
      })),
    },
    schemaVersion: 1,
  }
  assertRegionalJsonTree(metadata)
  const bytes = Buffer.from(JSON.stringify(metadata), 'utf8')
  if (bytes.length > MAX_METADATA_BYTES) {
    throw invalid('Frozen regional recipe metadata exceeds 1 MiB.')
  }
  files['regional.json'] = bytes
  return {
    ...(captured.references ? { referenceProfile: captured.references.profile } : {}),
    ...(captured.compositionProfile !== undefined
      ? { compositionProfile: captured.compositionProfile }
      : {}),
    ...(captured.initializationProfile !== undefined
      ? { initializationProfile: captured.initializationProfile }
      : {}),
    ...(captured.request.type === 'generate-illustrious-outpaint'
      ? { outpaintInfill: { ...captured.request.job.infillResource } }
      : {}),
    files,
    regional: { byteSize: bytes.length, sha256: sha256(bytes) },
  }
}

/** One owned fixed-role alpha serializer for both frozen family lanes. */
export function createRegionalQueuedAlphaCollector(): {
  alpha: (samples: Uint8Array, file: string) => AlphaRef
  files: Record<string, Buffer>
} {
  const files: Record<string, Buffer> = {}
  let aggregate = 0
  const alpha = (samples: Uint8Array, file: string): AlphaRef => {
    aggregate += samples.byteLength
    if (aggregate > MAX_ALPHA_BYTES) {
      throw invalid('Frozen regional alpha exceeds 64 MiB.')
    }
    const bytes = Buffer.from(samples)
    files[file] = bytes
    return { $alpha8: { byteSize: bytes.length, file, sha256: sha256(bytes) } }
  }
  return { alpha, files }
}

/** TI agrees with the recipe; LoRAs and selected VAE retain their ordinary frozen owners. */
export function assertPublicRegionalGlobalEmbeddingsAgree(
  input: RegionalWorkerInput,
  context?: RegionalFrozenContext,
): void {
  if (input.compositionProfile !== 'invoke-canvas-v1') {
    return
  }
  try {
    const capturedContext = context === undefined ? undefined : structuredClone(context)
    if (
      capturedContext === undefined
        ? (input.request.job.loras?.length ?? 0) > 0
        : !frozenLoraFieldsAgree(capturedContext, input.request.job.loras)
    ) {
      throw invalid('Public global LoRAs differ from the full frozen context.')
    }
    if (
      capturedContext === undefined
        ? input.request.job.vae != null || input.request.job.vaePrecision !== 'FP16'
        : !frozenVaeFieldsAgree(capturedContext, input.request.job.vae) ||
          capturedContext.vaePrecision !== input.request.job.vaePrecision
    ) {
      throw invalid('Public VAE or precision differs from the full frozen context.')
    }
    const { recipe } = input
    const embeddings = input.request.job.embeddings
    const effectiveWire =
      embeddings && (embeddings.positive.length > 0 || embeddings.negative.length > 0)
        ? embeddings
        : undefined
    const globals = {
      embeddingRefs: {
        negative: recipe.globalPrompts.negative.embeddingRefs,
        positive: recipe.globalPrompts.positive.embeddingRefs,
      },
      embeddings: recipe.globalEmbeddings,
      prompts: {
        negative: recipe.globalPrompts.negative.text,
        positive: recipe.globalPrompts.positive.text,
      },
    }
    if (!frozenEmbeddingFieldsAgree(globals, effectiveWire)) {
      throw invalid('Public global embedding bindings differ from the recipe.')
    }
    if (capturedContext === undefined) {
      if (effectiveWire !== undefined) {
        throw invalid('Public global embeddings require their full frozen context.')
      }
      return
    }
    if (
      !frozenEmbeddingFieldsAgree(capturedContext, effectiveWire) ||
      !isDeepStrictEqual(capturedContext.prompts, globals.prompts) ||
      !isDeepStrictEqual(
        capturedContext.embeddings ?? { negative: [], positive: [] },
        globals.embeddings,
      )
    ) {
      throw invalid('Public global embeddings differ from the full frozen context.')
    }
  } catch (error) {
    if (error instanceof GenerationQueueError) {
      throw error
    }
    throw invalid('The public global embedding context is invalid.')
  }
}

/** Return independently verified owned sidecar bytes for an exact Retry copy. */
export async function loadRegionalQueuedFiles(
  root: string,
  payload: FrozenQueuedRegionalOperationalV1,
): Promise<Record<string, Buffer>> {
  try {
    return payload.kind === 'anima-regional-txt2img' ||
      payload.kind === 'anima-regional-img2img' ||
      payload.kind === 'anima-regional-outpaint'
      ? await loadAnimaRegionalQueuedFiles(root, payload)
      : await loadFiles(root, payload)
  } catch (error) {
    if (error instanceof GenerationQueueError) {
      throw error
    }
    throw invalid('The frozen regional resource could not be verified.')
  }
}

/** Hydrate only owned alpha bytes, then revalidate the complete recipe/request association. */
export function loadRegionalQueuedInput(
  root: string,
  payload: FrozenQueuedIllustriousRegionalOperationalV1,
  request: RegionalGenerationRequestV1,
): Promise<RegionalWorkerInput>
export function loadRegionalQueuedInput(
  root: string,
  payload: FrozenQueuedAnimaRegionalV1,
  request: AnimaOutpaintRequestV1 | AnimaWorkerRequest,
): Promise<AnimaRegionalWorkerInput>
export async function loadRegionalQueuedInput(
  root: string,
  payload: FrozenQueuedRegionalOperationalV1,
  request: AnimaOutpaintRequestV1 | AnimaWorkerRequest | RegionalGenerationRequestV1,
): Promise<AnimaRegionalWorkerInput | RegionalWorkerInput> {
  if (
    payload.kind === 'anima-regional-txt2img' ||
    payload.kind === 'anima-regional-img2img' ||
    payload.kind === 'anima-regional-outpaint'
  ) {
    return await loadAnimaRegionalQueuedInput(
      root,
      payload,
      request as AnimaOutpaintRequestV1 | AnimaWorkerRequest,
    )
  }

  return await loadIllustriousRegionalQueuedInput(
    root,
    payload,
    request as RegionalGenerationRequestV1,
    true,
  )
}

/**
 * Removal inspection reuses the exact owned sidecar loader and recipe/command agreement. Only
 * model-weight readiness checks are omitted: those belong to dispatch and must not turn a metadata
 * inspection into a large ML file hash.
 */
export async function loadRegionalQueuedResourceUses(
  root: string,
  payload: FrozenQueuedRegionalOperationalV1,
): Promise<QueuedResourceUse[]> {
  const captured = parseFrozenQueuedRegionalOperationalV1(JSON.stringify(payload))
  const target = { ...captured.workerJob.target, path: path.join(root, 'target.png') }
  const output = { pngPath: path.join(root, 'result.png'), stagingRoot: root }
  if (
    captured.kind === 'anima-regional-txt2img' ||
    captured.kind === 'anima-regional-img2img' ||
    captured.kind === 'anima-regional-outpaint'
  ) {
    const request = {
      job: {
        ...structuredClone(captured.workerJob),
        ...(captured.kind === 'anima-regional-outpaint'
          ? { conditioning: captured.context.conditioning, infillResource: captured.outpaintInfill }
          : {}),
        output,
        target,
      },
      protocolVersion: '1',
      requestId: captured.originRequestId,
      type:
        captured.kind === 'anima-regional-outpaint'
          ? 'generate-anima-outpaint'
          : captured.kind === 'anima-regional-img2img'
            ? 'generate-anima-img2img'
            : 'generate-anima-txt2img',
    } as AnimaOutpaintRequestV1 | AnimaWorkerRequest
    await loadAnimaRegionalQueuedInput(root, captured, request)
    return captured.kind === 'anima-regional-outpaint'
      ? [{ managedPath: captured.outpaintInfill.path, sha256: captured.outpaintInfill.sha256 }]
      : []
  }
  const request = {
    job: {
      ...structuredClone(captured.workerJob),
      ...(captured.kind === 'illustrious-regional-outpaint'
        ? { conditioning: captured.context.conditioning, infillResource: captured.outpaintInfill }
        : {}),
      output,
      target,
    },
    protocolVersion: '1',
    requestId: captured.originRequestId,
    type:
      captured.kind === 'illustrious-regional-outpaint'
        ? 'generate-illustrious-outpaint'
        : captured.kind === 'illustrious-regional-img2img'
          ? 'generate-illustrious-img2img'
          : 'generate-illustrious-txt2img',
  } as RegionalGenerationRequestV1
  const input = await loadIllustriousRegionalQueuedInput(root, captured, request, false)
  const uses: QueuedResourceUse[] = [
    input.recipe.globalEmbeddings,
    ...input.recipe.regions.map((region) => region.embeddings),
  ]
    .flatMap((pair) => [...(pair?.positive ?? []), ...(pair?.negative ?? [])])
    .map((entry) => ({
      localModelId: entry.reference.localModelId,
      localVersionId: entry.reference.localVersionId,
      managedPath: entry.managedPath,
      sha256: entry.reference.fileSha256,
    }))
  for (const resource of Object.values(input.references?.resources ?? {})) {
    uses.push({ managedPath: resource.path, sha256: resource.sha256 })
  }
  if (captured.kind === 'illustrious-regional-outpaint') {
    uses.push({ managedPath: captured.outpaintInfill.path, sha256: captured.outpaintInfill.sha256 })
  }
  return uses
}

/** Exact fixed-role loading shared by both family recipes; no alternate filesystem owner. */
export async function loadOwnedRegionalQueuedFiles<T>(
  root: string,
  regional: { byteSize: number; sha256: string },
  parse: (bytes: Buffer) => T,
  collect: (metadata: T) => (AlphaRef['$alpha8'] & { kind?: 'reference' })[],
): Promise<Record<string, Buffer>> {
  const directory = await directoryIdentity(root)
  const snapshots: Snapshot[] = []
  const metadata = await readSnapshot(root, 'regional.json', regional)
  snapshots.push(metadata)
  const parsed = parse(metadata.bytes)
  const descriptors = collect(parsed)
  let aggregate = 0
  let referenceAggregate = 0
  const inodes = new Set([inode(metadata.identity)])
  for (const descriptor of descriptors) {
    if (descriptor.kind === 'reference') {
      referenceAggregate += descriptor.byteSize
      if (
        descriptor.byteSize > REGIONAL_REFERENCE_MAX_BYTES ||
        referenceAggregate > REGIONAL_REFERENCE_MAX_TOTAL_BYTES
      ) {
        throw invalid('Frozen regional reference PNGs exceed their independent byte limit.')
      }
    } else {
      aggregate += descriptor.byteSize
    }
    if (aggregate > MAX_ALPHA_BYTES) {
      throw invalid('Frozen regional alpha exceeds 64 MiB.')
    }
    const snapshot = await readSnapshot(root, descriptor.file, descriptor)
    if (inodes.has(inode(snapshot.identity))) {
      throw invalid('Frozen regional resources alias one inode.')
    }
    inodes.add(inode(snapshot.identity))
    snapshots.push(snapshot)
  }
  const allowed = new Set(['manifest.json', 'target.png', ...snapshots.map((entry) => entry.name)])
  const entries = await readdir(root)
  if (entries.some((name) => !allowed.has(name))) {
    throw invalid('The frozen regional folder contains an unexpected file.')
  }
  // Reads may yield. Every pathname must still designate the exact qualified version.
  for (const snapshot of snapshots) {
    const current = await lstat(path.join(root, snapshot.name), { bigint: true })
    if (!sameVersion(current, snapshot.identity) || current.isSymbolicLink()) {
      throw invalid('A frozen regional resource changed after verification.')
    }
  }
  if (!sameVersion(await directoryIdentity(root), directory)) {
    throw invalid('The frozen regional directory changed while loading.')
  }
  return Object.fromEntries(snapshots.map((snapshot) => [snapshot.name, snapshot.bytes]))
}

export function assertRegionalJsonTree(value: unknown, seen = new Set<object>(), depth = 0): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return
  }
  if (
    typeof value !== 'object' ||
    depth > 64 ||
    seen.has(value) ||
    (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
  ) {
    throw invalid('Frozen regional metadata is not a finite JSON tree.')
  }
  seen.add(value)
  for (const child of Object.values(value)) {
    assertRegionalJsonTree(child, seen, depth + 1)
  }
  seen.delete(value)
}

async function loadIllustriousRegionalQueuedInput(
  root: string,
  payload: FrozenQueuedIllustriousRegionalOperationalV1,
  request: RegionalGenerationRequestV1,
  verifyReferenceWeights: boolean,
): Promise<RegionalWorkerInput> {
  const capturedPayload = parseRegionalPayload(
    JSON.stringify(payload),
    payload.kind !== 'illustrious-regional',
  )
  const capturedRequest = structuredClone(request)
  const files = await loadRegionalQueuedFiles(root, capturedPayload)
  const metadata = parseMetadata(files['regional.json'])
  const hydrated = hydrate(metadata, files)
  let captured: RegionalWorkerInput
  try {
    captured = captureRegionalWorkerInput({
      ...hydrated,
      request: capturedRequest,
    })
  } catch {
    throw invalid('The frozen regional recipe/request association is invalid.')
  }
  assertPublicRegionalGlobalEmbeddingsAgree(captured, capturedPayload.context)
  if (verifyReferenceWeights && captured.references) {
    await verifyRegionalReferenceWorkerResources(captured.references)
  }
  const { output: _output, target, ...fullJob } = captured.request.job
  let job = fullJob
  if (captured.request.type === 'generate-illustrious-outpaint') {
    if (
      capturedPayload.kind !== 'illustrious-regional-outpaint' ||
      !isDeepStrictEqual(captured.request.job.conditioning, capturedPayload.context.conditioning) ||
      !isDeepStrictEqual(captured.request.job.infillResource, capturedPayload.outpaintInfill)
    ) {
      throw invalid('The frozen regional outpaint resources differ.')
    }
    const {
      conditioning: _conditioning,
      infillResource: _infill,
      output: _output,
      target: _target,
      ...numeric
    } = captured.request.job
    job = numeric
  }
  const { path: _targetPath, ...targetDescriptor } = target
  if (
    !isDeepStrictEqual({ ...job, target: targetDescriptor }, capturedPayload.workerJob) ||
    captured.compositionProfile !==
      (capturedPayload.kind !== 'illustrious-regional'
        ? capturedPayload.compositionProfile
        : undefined) ||
    captured.initializationProfile !== capturedPayload.initializationProfile ||
    captured.references?.profile !== capturedPayload.referenceProfile ||
    captured.recipe.documentId !== capturedPayload.context.documentId ||
    captured.recipe.documentRevision !== capturedPayload.context.documentRevision
  ) {
    throw invalid('The regional request differs from its frozen queue job.')
  }
  return captured
}

function readKind(json: string): unknown {
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw invalid('The frozen regional payload exceeds its metadata limit.')
  }
  try {
    const value: unknown = JSON.parse(json)
    return record(value) ? value.kind : undefined
  } catch {
    throw invalid('The frozen regional payload is not JSON.')
  }
}

function parseRegionalPayload(
  json: string,
  invoke: boolean,
): FrozenQueuedIllustriousRegionalOperationalV1 {
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw invalid('The frozen regional payload exceeds its metadata limit.')
  }
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw invalid('The frozen regional payload is not JSON.')
  }
  if (
    !record(value) ||
    (invoke
      ? ![
          'illustrious-regional-img2img',
          'illustrious-regional-outpaint',
          'illustrious-regional-txt2img',
        ].includes(String(value.kind))
      : value.kind !== 'illustrious-regional') ||
    (invoke ? value.compositionProfile !== 'invoke-canvas-v1' : 'compositionProfile' in value)
  ) {
    throw invalid('The frozen regional operation is invalid.')
  }
  const parsed = v.safeParse(regionalRef, value.regional)
  if (!parsed.success) {
    throw invalid('The frozen regional resource descriptor is invalid.')
  }
  if (
    'initializationProfile' in value &&
    !v.is(RegionalInitializationProfileSchema, value.initializationProfile)
  ) {
    throw invalid('The frozen regional initialization profile is unsupported.')
  }
  if (
    'referenceProfile' in value &&
    (!invoke ||
      value.referenceProfile !==
        regionalReferenceProfileForMode(
          value.kind === 'illustrious-regional-outpaint'
            ? 'outpaint'
            : value.kind === 'illustrious-regional-img2img'
              ? 'img2img'
              : 'txt2img',
        ))
  ) {
    throw invalid('The frozen regional reference profile is unsupported.')
  }
  const {
    compositionProfile: _profile,
    initializationProfile,
    outpaintInfill,
    referenceProfile,
    regional: _regional,
    ...base
  } = value
  const ordinary = parseFrozenGenerationPayloadV1(
    JSON.stringify({
      ...base,
      kind:
        value.kind === 'illustrious-regional-outpaint'
          ? 'illustrious-outpaint'
          : value.kind === 'illustrious-regional-img2img'
            ? 'illustrious-img2img'
            : 'illustrious-txt2img',
    }),
  )
  const outpaint = value.kind === 'illustrious-regional-outpaint'
  const image = value.kind === 'illustrious-regional-img2img' || outpaint
  if (
    outpaint ? !v.is(RegionalOutpaintInfillSchema, outpaintInfill) : outpaintInfill !== undefined
  ) {
    throw invalid('The frozen regional infill descriptor is invalid.')
  }
  const samplerMatchesInitialization =
    (ordinary.kind === 'illustrious-txt2img' ||
      ordinary.kind === 'illustrious-img2img' ||
      ordinary.kind === 'illustrious-outpaint') &&
    (initializationProfile === undefined
      ? ordinary.workerJob.sampling.scheduler === 'euler' ||
        (image &&
          invoke &&
          ['dpmpp_2m', 'dpmpp_2m_k', 'euler_a'].includes(ordinary.workerJob.sampling.scheduler))
      : ordinary.workerJob.sampling.scheduler === 'euler_a' ||
        (invoke &&
          (ordinary.workerJob.sampling.scheduler === 'dpmpp_2m' ||
            ordinary.workerJob.sampling.scheduler === 'dpmpp_2m_k')))
  if (
    (ordinary.kind !== 'illustrious-txt2img' &&
      ordinary.kind !== 'illustrious-img2img' &&
      ordinary.kind !== 'illustrious-outpaint') ||
    !(
      ordinary.workerJob.checkpoint.predictionType === 'epsilon' ||
      (invoke && ordinary.workerJob.checkpoint.predictionType === 'v_prediction')
    ) ||
    (invoke && ordinary.workerJob.sampling.cfgScale <= 1) ||
    !samplerMatchesInitialization ||
    ordinary.workerJob.sampling.noiseProfile === undefined ||
    (!invoke && (ordinary.workerJob.sampling.cfgRescale ?? 0) !== 0) ||
    (!invoke && (ordinary.workerJob.vaePrecision !== 'FP16' || ordinary.workerJob.vae != null)) ||
    (image &&
      (initializationProfile !== undefined ||
        !['dpmpp_2m', 'dpmpp_2m_k', 'euler', 'euler_a'].includes(
          ordinary.workerJob.sampling.scheduler,
        ))) ||
    (!invoke && (ordinary.workerJob.loras?.length ?? 0) !== 0) ||
    (!invoke &&
      ((ordinary.workerJob.embeddings?.positive.length ?? 0) !== 0 ||
        (ordinary.workerJob.embeddings?.negative.length ?? 0) !== 0))
  ) {
    throw invalid('The frozen regional job differs from the private execution profile.')
  }
  const initialization =
    initializationProfile === undefined
      ? {}
      : {
          initializationProfile: v.parse(
            RegionalInitializationProfileSchema,
            initializationProfile,
          ),
        }
  if (outpaint) {
    if (!invoke || ordinary.kind !== 'illustrious-outpaint') {
      throw invalid('Regional outpaint requires its exact mixed-alpha operation.')
    }
    return {
      ...ordinary,
      compositionProfile: 'invoke-canvas-v1',
      kind: 'illustrious-regional-outpaint',
      ...(referenceProfile !== undefined
        ? { referenceProfile: REGIONAL_REFERENCE_OUTPAINT_PROFILE }
        : {}),
      outpaintInfill: v.parse(RegionalOutpaintInfillSchema, outpaintInfill),
      regional: parsed.output,
    }
  }
  if (image) {
    if (!invoke || ordinary.kind !== 'illustrious-img2img') {
      throw invalid('Regional img2img requires its exact opaque-image operation.')
    }
    return {
      ...ordinary,
      compositionProfile: 'invoke-canvas-v1',
      kind: 'illustrious-regional-img2img',
      ...(referenceProfile !== undefined
        ? { referenceProfile: REGIONAL_REFERENCE_IMG2IMG_PROFILE }
        : {}),
      regional: parsed.output,
    }
  }
  if (ordinary.kind !== 'illustrious-txt2img') {
    throw invalid('Regional txt2img requires its exact transparent operation.')
  }
  return invoke
    ? {
        ...ordinary,
        compositionProfile: 'invoke-canvas-v1',
        ...initialization,
        ...(referenceProfile !== undefined
          ? { referenceProfile: REGIONAL_REFERENCE_INFERENCE_PROFILE }
          : {}),
        kind: 'illustrious-regional-txt2img',
        regional: parsed.output,
      }
    : { ...ordinary, ...initialization, kind: 'illustrious-regional', regional: parsed.output }
}

async function loadFiles(
  root: string,
  payload: FrozenQueuedIllustriousRegionalOperationalV1,
): Promise<Record<string, Buffer>> {
  const captured = parseRegionalPayload(
    JSON.stringify(payload),
    payload.kind !== 'illustrious-regional',
  )
  return await loadOwnedRegionalQueuedFiles(
    root,
    captured.regional,
    parseMetadata,
    collectAlphaDescriptors,
  )
}

function parseMetadata(bytes: Buffer): Metadata {
  let value: unknown
  try {
    value = JSON.parse(bytes.toString('utf8'))
    if (!Buffer.from(JSON.stringify(value), 'utf8').equals(bytes)) {
      throw invalid('Frozen regional metadata is not its canonical JSON snapshot.')
    }
  } catch {
    throw invalid('Frozen regional metadata is malformed.')
  }
  const parsed = v.safeParse(metadataSchema, value)
  if (!parsed.success) {
    throw invalid('Frozen regional metadata is invalid.')
  }
  return parsed.output
}

function collectAlphaDescriptors(
  metadata: Metadata,
): (AlphaRef['$alpha8'] & { kind?: 'reference' })[] {
  if (
    !record(metadata.recipe) ||
    !Array.isArray(metadata.recipe.regions) ||
    metadata.recipe.regions.length > 3
  ) {
    throw invalid('Frozen regional recipe regions are invalid.')
  }
  const descriptors: (AlphaRef['$alpha8'] & { kind?: 'reference' })[] = []
  const collect = (value: unknown, expected: string): void => {
    const result = v.safeParse(regionalAlphaRefSchema, value)
    if (!result.success || result.output.$alpha8.file !== expected) {
      throw invalid('A frozen regional alpha role or descriptor is invalid.')
    }
    descriptors.push(result.output.$alpha8)
  }
  for (const [index, region] of metadata.recipe.regions.entries()) {
    if (!record(region) || !record(region.coverage)) {
      throw invalid('Frozen regional coverage is invalid.')
    }
    collect(region.coverage.alpha, `region-${index}.alpha8`)
  }
  for (const sign of ['negative', 'positive'] as const) {
    const coverage =
      sign === 'negative' ? metadata.globalNegativeCoverage : metadata.globalPositiveCoverage
    if (!record(coverage)) {
      throw invalid('Frozen global coverage is invalid.')
    }
    if (coverage.kind === 'alpha8') {
      collect(coverage.alpha, `global-${sign}.alpha8`)
    } else if (coverage.kind !== 'everywhere' || Object.keys(coverage).length !== 1) {
      throw invalid('Frozen global coverage is invalid.')
    }
  }
  for (const [index, entry] of (metadata.references?.images ?? []).entries()) {
    const descriptor = entry.image.$referencePng
    if (descriptor.file !== `reference-${index}.png`) {
      throw invalid('A frozen regional reference role is invalid.')
    }
    descriptors.push({ ...descriptor, kind: 'reference' })
  }
  return descriptors
}

function hydrate(
  metadata: Metadata,
  files: Record<string, Buffer>,
): Omit<RegionalWorkerInput, 'request'> {
  collectAlphaDescriptors(metadata)
  const { schemaVersion: _schemaVersion, ...result } = metadata
  const alpha = (value: unknown): Uint8Array => {
    const descriptor = v.parse(regionalAlphaRefSchema, value).$alpha8
    return new Uint8Array(files[descriptor.file])
  }
  const globalCoverage = (value: unknown) => {
    if (!record(value)) {
      throw invalid('Frozen global coverage is invalid.')
    }
    return value.kind === 'alpha8' ? { ...value, alpha: alpha(value.alpha) } : value
  }
  const recipe = metadata.recipe as Record<string, unknown> & { regions: Record<string, unknown>[] }
  return {
    ...result,
    ...(metadata.references
      ? {
          references: {
            ...metadata.references,
            images: metadata.references.images.map((entry) => {
              const { file, ...identity } = entry.image.$referencePng
              return {
                image: { ...identity, bytes: new Uint8Array(files[file]) },
                referenceId: entry.referenceId,
                regionId: entry.regionId,
              }
            }),
          },
        }
      : {}),
    globalNegativeCoverage: globalCoverage(metadata.globalNegativeCoverage),
    globalPositiveCoverage: globalCoverage(metadata.globalPositiveCoverage),
    recipe: {
      ...recipe,
      regions: recipe.regions.map((region) => {
        const coverage = region.coverage as Record<string, unknown>
        return { ...region, coverage: { ...coverage, alpha: alpha(coverage.alpha) } }
      }),
    },
  } as Omit<RegionalWorkerInput, 'request'>
}

async function directoryIdentity(root: string): Promise<BigIntStats> {
  if (!path.isAbsolute(root) || path.resolve(root) !== root || root.includes('\0')) {
    throw invalid('The frozen regional directory is not canonical.')
  }
  const entry = await lstat(root, { bigint: true })
  if (
    !entry.isDirectory() ||
    entry.isSymbolicLink() ||
    entry.uid !== BigInt(process.getuid!()) ||
    (entry.mode & 0o022n) !== 0n ||
    (await realpath(root)) !== root
  ) {
    throw invalid('The frozen regional directory is unsafe.')
  }
  return entry
}

async function readSnapshot(
  root: string,
  name: string,
  descriptor: { byteSize: number; sha256: string },
): Promise<Snapshot> {
  const filename = path.join(root, name)
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const before = await handle.stat({ bigint: true })
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      before.uid !== BigInt(process.getuid!()) ||
      (before.mode & 0o022n) !== 0n ||
      before.size !== BigInt(descriptor.byteSize)
    ) {
      throw invalid('A frozen regional resource is not an exact owned regular file.')
    }
    const bytes = Buffer.alloc(descriptor.byteSize)
    let offset = 0
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (read.bytesRead === 0) {
        break
      }
      offset += read.bytesRead
    }
    const after = await handle.stat({ bigint: true })
    const atPath = await lstat(filename, { bigint: true })
    if (
      offset !== bytes.length ||
      sha256(bytes) !== descriptor.sha256 ||
      !sameVersion(before, after) ||
      !sameVersion(before, atPath) ||
      atPath.isSymbolicLink() ||
      (await realpath(filename)) !== filename
    ) {
      throw invalid('A frozen regional resource changed or failed its digest.')
    }
    return { bytes, identity: before, name }
  } finally {
    await handle.close()
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameVersion(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.ctimeNs === right.ctimeNs &&
    left.mtimeNs === right.mtimeNs &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.nlink === right.nlink
  )
}

function inode(entry: BigIntStats): string {
  return `${entry.dev}:${entry.ino}`
}

function invalid(message: string): GenerationQueueError {
  return new GenerationQueueError('QUEUE_INPUT_INVALID', message)
}
