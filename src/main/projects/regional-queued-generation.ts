import { createHash } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { FrozenQueuedIllustriousTxt2ImgV1 } from './generation-queue.js'
import type { IllustriousTxt2ImgRequestV1 } from './illustrious-txt2img-job.js'
import type { RegionalWorkerInput } from './regional-worker-request.js'

import { GenerationQueueError, parseFrozenGenerationPayloadV1 } from './generation-queue.js'
import { captureRegionalWorkerInput } from './regional-worker-request.js'

/** Private operational identity, outside normal Generate and accepted-result provenance. */
export interface FrozenQueuedRegionalV1 extends Omit<FrozenQueuedIllustriousTxt2ImgV1, 'kind'> {
  kind: 'illustrious-regional'
  regional: { byteSize: number; sha256: string }
}

export interface RegionalQueuedMaterial {
  files: Record<string, Buffer>
  regional: FrozenQueuedRegionalV1['regional']
}

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
  globalNegativeCoverage: v.unknown(),
  globalPositiveCoverage: v.unknown(),
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
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw invalid('The frozen regional payload exceeds its metadata limit.')
  }
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw invalid('The frozen regional payload is not JSON.')
  }
  if (!record(value) || value.kind !== 'illustrious-regional') {
    throw invalid('The frozen regional operation is invalid.')
  }
  const parsed = v.safeParse(regionalRef, value.regional)
  if (!parsed.success) {
    throw invalid('The frozen regional resource descriptor is invalid.')
  }
  const { regional: _regional, ...base } = value
  const ordinary = parseFrozenGenerationPayloadV1(
    JSON.stringify({ ...base, kind: 'illustrious-txt2img' }),
  )
  if (
    ordinary.kind !== 'illustrious-txt2img' ||
    ordinary.workerJob.checkpoint.predictionType !== 'epsilon' ||
    ordinary.workerJob.sampling.scheduler !== 'euler' ||
    ordinary.workerJob.sampling.noiseProfile === undefined ||
    (ordinary.workerJob.sampling.cfgRescale ?? 0) !== 0 ||
    ordinary.workerJob.vaePrecision !== 'FP16' ||
    ordinary.workerJob.vae != null ||
    (ordinary.workerJob.loras?.length ?? 0) !== 0 ||
    (ordinary.workerJob.embeddings?.positive.length ?? 0) !== 0 ||
    (ordinary.workerJob.embeddings?.negative.length ?? 0) !== 0
  ) {
    throw invalid('The frozen regional job differs from the private execution profile.')
  }
  return { ...ordinary, kind: 'illustrious-regional', regional: parsed.output }
}

/**
 * InvokeAI a61ac4fb captures execution nodes and loads detached resources by name. This adapter
 * freezes the same input ownership as bounded fixed-role files in Studio's existing queue folder.
 * The queue owner writes/fsyncs the returned bytes before publishing its SQLite row.
 */
export function captureRegionalQueuedMaterial(input: RegionalWorkerInput): RegionalQueuedMaterial {
  const captured = captureRegionalWorkerInput(input)
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
  return { files, regional: { byteSize: bytes.length, sha256: sha256(bytes) } }
}

/** Return independently verified owned sidecar bytes for an exact Retry copy. */
export async function loadRegionalQueuedFiles(
  root: string,
  payload: FrozenQueuedRegionalV1,
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
  payload: FrozenQueuedRegionalV1,
  request: IllustriousTxt2ImgRequestV1,
): Promise<RegionalWorkerInput> {
  const capturedPayload = parseFrozenQueuedRegionalV1(JSON.stringify(payload))
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
  const { output: _output, target, ...job } = captured.request.job
  const { path: _targetPath, ...targetDescriptor } = target
  if (
    !isDeepStrictEqual({ ...job, target: targetDescriptor }, capturedPayload.workerJob) ||
    captured.recipe.documentId !== capturedPayload.context.documentId ||
    captured.recipe.documentRevision !== capturedPayload.context.documentRevision
  ) {
    throw invalid('The regional request differs from its frozen queue job.')
  }
  return captured
}

async function loadFiles(
  root: string,
  payload: FrozenQueuedRegionalV1,
): Promise<Record<string, Buffer>> {
  const captured = parseFrozenQueuedRegionalV1(JSON.stringify(payload))
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
