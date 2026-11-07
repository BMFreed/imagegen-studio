import {
  type RegionalInitializationProfile,
  RegionalInitializationProfileSchema,
} from '../../shared/projects/regional-initialization-profile.js'

import { createHash } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type {
  FrozenQueuedGenerationV1,
  FrozenQueuedIllustriousImg2ImgV1,
  FrozenQueuedIllustriousTxt2ImgV1,
} from './generation-queue.js'
import type { IllustriousGenerationRequestV1 } from './illustrious-txt2img-job.js'
import type { RegionalWorkerInput } from './regional-worker-request.js'

import { GenerationQueueError, parseFrozenGenerationPayloadV1 } from './generation-queue.js'
import { frozenEmbeddingFieldsAgree } from './illustrious-generation-embeddings.js'
import { frozenLoraFieldsAgree } from './illustrious-generation-loras.js'
import { frozenVaeFieldsAgree } from './illustrious-generation-vae.js'
import { captureRegionalWorkerInput } from './regional-worker-request.js'

/** Private operational identity, outside normal Generate and accepted-result provenance. */
export interface FrozenQueuedRegionalV1 extends Omit<FrozenQueuedIllustriousTxt2ImgV1, 'kind'> {
  initializationProfile?: RegionalInitializationProfile
  kind: 'illustrious-regional'
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
  regional: FrozenQueuedRegionalV1['regional']
}

export type FrozenQueuedRegionalInvokeV1 =
  FrozenQueuedRegionalInvokeImg2ImgV1 | FrozenQueuedRegionalInvokeTxt2ImgV1

export type FrozenQueuedRegionalOperationalV1 =
  FrozenQueuedRegionalInvokeV1 | FrozenQueuedRegionalV1

export interface RegionalQueuedMaterial {
  compositionProfile?: 'invoke-canvas-v1'
  files: Record<string, Buffer>
  initializationProfile?: RegionalInitializationProfile
  regional: FrozenQueuedRegionalV1['regional']
}

type RegionalFrozenContext =
  FrozenQueuedIllustriousImg2ImgV1['context'] | FrozenQueuedIllustriousTxt2ImgV1['context']

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
const alphaRef = v.strictObject({
  $alpha8: v.strictObject({ byteSize, file: v.string(), sha256: sha }),
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
  schemaVersion: v.literal(1),
})
type Metadata = v.InferOutput<typeof metadataSchema>
type AlphaRef = v.InferOutput<typeof alphaRef>
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
  return parseRegionalPayload(
    json,
    ['illustrious-regional-img2img', 'illustrious-regional-txt2img'].includes(
      String(readKind(json)),
    ),
  )
}

/**
 * Accept only public operations. The original candidate hash is verified by the caller before
 * projecting reusable settings; no regional conditioning or managed pathname is added to
 * provenance.
 */
export function parseAcceptedGenerationBaseV1(json: string): FrozenQueuedGenerationV1 {
  if (
    !['illustrious-regional-img2img', 'illustrious-regional-txt2img'].includes(
      String(readKind(json)),
    )
  ) {
    return parseFrozenGenerationPayloadV1(json)
  }
  const payload = parseFrozenQueuedRegionalInvokeV1(json)
  if (payload.kind === 'illustrious-regional-img2img') {
    const {
      compositionProfile: _profile,
      initializationProfile: _init,
      regional: _regional,
      ...base
    } = payload
    return { ...base, kind: 'illustrious-img2img' }
  }
  const {
    compositionProfile: _profile,
    initializationProfile: _init,
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
  assertJsonTree(metadata)
  const bytes = Buffer.from(JSON.stringify(metadata), 'utf8')
  if (bytes.length > MAX_METADATA_BYTES) {
    throw invalid('Frozen regional recipe metadata exceeds 1 MiB.')
  }
  files['regional.json'] = bytes
  return {
    ...(captured.compositionProfile !== undefined
      ? { compositionProfile: captured.compositionProfile }
      : {}),
    ...(captured.initializationProfile !== undefined
      ? { initializationProfile: captured.initializationProfile }
      : {}),
    files,
    regional: { byteSize: bytes.length, sha256: sha256(bytes) },
  }
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
    return await loadFiles(root, payload)
  } catch (error) {
    if (error instanceof GenerationQueueError) {
      throw error
    }
    throw invalid('The frozen regional resource could not be verified.')
  }
}

/** Hydrate only owned alpha bytes, then revalidate the complete recipe/request association. */
export async function loadRegionalQueuedInput(
  root: string,
  payload: FrozenQueuedRegionalOperationalV1,
  request: IllustriousGenerationRequestV1,
): Promise<RegionalWorkerInput> {
  const capturedPayload = parseFrozenQueuedRegionalOperationalV1(JSON.stringify(payload))
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
  const { output: _output, target, ...job } = captured.request.job
  const { path: _targetPath, ...targetDescriptor } = target
  if (
    !isDeepStrictEqual({ ...job, target: targetDescriptor }, capturedPayload.workerJob) ||
    captured.compositionProfile !==
      (capturedPayload.kind !== 'illustrious-regional'
        ? capturedPayload.compositionProfile
        : undefined) ||
    captured.initializationProfile !== capturedPayload.initializationProfile ||
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

function parseRegionalPayload(json: string, invoke: boolean): FrozenQueuedRegionalOperationalV1 {
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
      ? !['illustrious-regional-img2img', 'illustrious-regional-txt2img'].includes(
          String(value.kind),
        )
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
  const {
    compositionProfile: _profile,
    initializationProfile,
    regional: _regional,
    ...base
  } = value
  const ordinary = parseFrozenGenerationPayloadV1(
    JSON.stringify({
      ...base,
      kind:
        value.kind === 'illustrious-regional-img2img'
          ? 'illustrious-img2img'
          : 'illustrious-txt2img',
    }),
  )
  const image = value.kind === 'illustrious-regional-img2img'
  const samplerMatchesInitialization =
    (ordinary.kind === 'illustrious-txt2img' || ordinary.kind === 'illustrious-img2img') &&
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
    (ordinary.kind !== 'illustrious-txt2img' && ordinary.kind !== 'illustrious-img2img') ||
    ordinary.workerJob.checkpoint.predictionType !== 'epsilon' ||
    (invoke && ordinary.workerJob.sampling.cfgScale <= 1) ||
    !samplerMatchesInitialization ||
    ordinary.workerJob.sampling.noiseProfile === undefined ||
    (!invoke && (ordinary.workerJob.sampling.cfgRescale ?? 0) !== 0) ||
    ((!invoke || image) &&
      (ordinary.workerJob.vaePrecision !== 'FP16' || ordinary.workerJob.vae != null)) ||
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
  if (image) {
    if (!invoke || ordinary.kind !== 'illustrious-img2img') {
      throw invalid('Regional img2img requires its exact opaque-image operation.')
    }
    return {
      ...ordinary,
      compositionProfile: 'invoke-canvas-v1',
      kind: 'illustrious-regional-img2img',
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
        kind: 'illustrious-regional-txt2img',
        regional: parsed.output,
      }
    : { ...ordinary, ...initialization, kind: 'illustrious-regional', regional: parsed.output }
}

async function loadFiles(
  root: string,
  payload: FrozenQueuedRegionalOperationalV1,
): Promise<Record<string, Buffer>> {
  const captured = parseFrozenQueuedRegionalOperationalV1(JSON.stringify(payload))
  const directory = await directoryIdentity(root)
  const snapshots: Snapshot[] = []
  const metadata = await readSnapshot(root, 'regional.json', captured.regional)
  snapshots.push(metadata)
  const parsed = parseMetadata(metadata.bytes)
  const descriptors = collectAlphaDescriptors(parsed)
  let aggregate = 0
  const inodes = new Set([inode(metadata.identity)])
  for (const descriptor of descriptors) {
    aggregate += descriptor.byteSize
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

function collectAlphaDescriptors(metadata: Metadata): AlphaRef['$alpha8'][] {
  if (
    !record(metadata.recipe) ||
    !Array.isArray(metadata.recipe.regions) ||
    metadata.recipe.regions.length > 3
  ) {
    throw invalid('Frozen regional recipe regions are invalid.')
  }
  const descriptors: AlphaRef['$alpha8'][] = []
  const collect = (value: unknown, expected: string): void => {
    const result = v.safeParse(alphaRef, value)
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
  return descriptors
}

function hydrate(
  metadata: Metadata,
  files: Record<string, Buffer>,
): Omit<RegionalWorkerInput, 'request'> {
  collectAlphaDescriptors(metadata)
  const { schemaVersion: _schemaVersion, ...result } = metadata
  const alpha = (value: unknown): Uint8Array => {
    const descriptor = v.parse(alphaRef, value).$alpha8
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

function assertJsonTree(value: unknown, seen = new Set<object>(), depth = 0): void {
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
    assertJsonTree(child, seen, depth + 1)
  }
  seen.delete(value)
}

function invalid(message: string): GenerationQueueError {
  return new GenerationQueueError('QUEUE_INPUT_INVALID', message)
}
