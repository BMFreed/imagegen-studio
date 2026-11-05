import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { IllustriousNoiseProfileV1Schema } from '../../shared/projects/illustrious-noise-profile.js'
import {
  type RegionalInitializationProfile,
  RegionalInitializationProfileSchema,
} from '../../shared/projects/regional-initialization-profile.js'

import { createHash } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import { lstat, mkdtemp, open, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { IllustriousTxt2ImgRequestV1 } from './illustrious-txt2img-job.js'
import type { CurrentCanvasRegionalRecipe } from './project-current-canvas-regional-recipe.js'
import type { VerifiedWorkerImage } from './worker-client.js'

import {
  ExactIllustriousEmbeddingSchema,
  frozenEmbeddingFieldsAgree,
  FrozenGenerationEmbeddingsSchema,
  IllustriousWorkerEmbeddingsSchema,
} from './illustrious-generation-embeddings.js'
import {
  captureInferenceWorkerOwnerValue,
  type InferenceWorkerOwner,
  serializeRegionalTransportOwner,
} from './inference-worker-ownership.js'
import { classifyTargetPngAlpha } from './target-png-mode.js'
import {
  ProjectWorkerError,
  readSmartPatchModelSourceOutput,
  readSmartPatchPreparationOutput,
} from './worker-client.js'

/** A private file-backed adapter to Invoke's captured pixels and referenced image resources. */
export type RegionalGlobalCoverage =
  { alpha: Uint8Array; height: number; kind: 'alpha8'; width: number } | { kind: 'everywhere' }

export interface RegionalWorkerInput {
  compositionProfile?: 'invoke-canvas-v1'
  globalNegativeCoverage: RegionalGlobalCoverage
  globalPositiveCoverage: RegionalGlobalCoverage
  initializationProfile?: RegionalInitializationProfile
  layout: 'cfg-negative-first' | 'positive-only'
  negativePooledSourceId: string
  positivePooledSourceId: string
  recipe: CurrentCanvasRegionalRecipe
  request: IllustriousTxt2ImgRequestV1
}

export interface RegionalWorkerFile {
  byteSize: number
  path: string
  sha256: string
}

export interface RegionalWorkerWire {
  bundle: RegionalWorkerFile
  protocolVersion: '1'
  requestId: string
  stagingRoot: string
  type: 'execute-current-canvas-regional'
}

/** The transport owns this lease after dispatch, including an unconfirmed physical child exit. */
export interface RegionalWorkerLease {
  dispose: () => Promise<void>
  request: IllustriousTxt2ImgRequestV1
  wire: RegionalWorkerWire
}

export interface RegionalWorkerResult {
  /** Historical nomination only: the lease owner removes this path after consuming the result. */
  output: VerifiedWorkerImage
  /** Owned verified bytes survive disposal of the provisional files. */
  pngBytes: Buffer
  seed: number
}

const MAX_BUNDLE_BYTES = 1024 * 1024
const MAX_ALPHA_BYTES = 64 * 1024 * 1024
const MAX_TARGET_BYTES = 32 * 1024 * 1024
const MAX_LINE_BYTES = 64 * 1024
const SHA256 = /^[a-f0-9]{64}$/
const leases = new WeakMap<RegionalWorkerLease, LeaseState>()

interface LeaseState {
  base: string
  baseIdentity: BigIntStats
  disposal: Promise<void> | null
  disposed: boolean
  request: IllustriousTxt2ImgRequestV1
  root: string
  rootIdentity: BigIntStats
}

const integer = (minimum: number, maximum = Number.MAX_SAFE_INTEGER) =>
  v.pipe(v.number(), v.safeInteger(), v.minValue(minimum), v.maxValue(maximum))
const filePath = v.pipe(
  v.string(),
  v.nonEmpty(),
  v.maxLength(4096),
  v.check(
    (value) => !value.includes('\0') && path.isAbsolute(value) && path.resolve(value) === value,
  ),
)
const digest = v.pipe(v.string(), v.regex(SHA256))
const rect = v.strictObject({
  height: integer(8, 2048),
  width: integer(8, 2048),
  x: integer(-2_147_483_647, 2_147_483_647),
  y: integer(-2_147_483_647, 2_147_483_647),
})
const text = v.pipe(
  v.string(),
  v.check(
    (value) =>
      Buffer.byteLength(value) <= 16 * 1024 &&
      !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value),
  ),
)
const prompt = v.strictObject({
  embeddingRefs: v.pipe(
    v.array(v.strictObject({ resource: ExactIllustriousEmbeddingSchema, token: text })),
    v.maxLength(10_000),
  ),
  text,
})
const signedPrompts = v.strictObject({ negative: prompt, positive: prompt })
const ownedAlpha = v.pipe(
  v.instance(Uint8Array),
  v.check((value) => value.buffer instanceof ArrayBuffer),
)
const target = v.strictObject({
  byteSize: integer(1, MAX_TARGET_BYTES),
  height: integer(8, 2048),
  iccSha256: v.literal(IGS_SRGB_ICC_SHA256),
  path: filePath,
  sha256: digest,
  width: integer(8, 2048),
})
const requestSchema = v.strictObject({
  job: v.strictObject({
    bbox: rect,
    checkpoint: v.strictObject({
      path: filePath,
      predictionType: v.literal('epsilon'),
      sha256: digest,
    }),
    embeddings: v.optional(IllustriousWorkerEmbeddingsSchema),
    loras: v.optional(v.strictTuple([])),
    output: v.strictObject({ pngPath: filePath, stagingRoot: filePath }),
    prompts: v.strictObject({ negative: text, positive: text }),
    sampling: v.strictObject({
      cfgRescale: v.optional(v.literal(0)),
      cfgScale: v.pipe(v.number(), v.finite(), v.minValue(1), v.maxValue(30)),
      noiseProfile: IllustriousNoiseProfileV1Schema,
      // Main freezes the matching public/private sampler and initialization policy separately.
      scheduler: v.picklist(['euler', 'euler_a']),
      seed: integer(0, 0xff_ff_ff_ff),
      steps: integer(1, 200),
    }),
    schemaVersion: v.literal(1),
    target,
    vae: v.optional(v.null()),
    vaePrecision: v.literal('FP16'),
  }),
  protocolVersion: v.literal('1'),
  requestId: v.pipe(v.string(), v.uuid()),
  type: v.literal('generate-illustrious-txt2img'),
})
const coverageSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('everywhere') }),
  v.strictObject({
    alpha: ownedAlpha,
    height: integer(1, 256),
    kind: v.literal('alpha8'),
    width: integer(1, 256),
  }),
])
const worldRect = v.strictObject({
  height: integer(1, 2048),
  width: integer(1, 2048),
  x: integer(-2_147_483_647, 2_147_483_647),
  y: integer(-2_147_483_647, 2_147_483_647),
})
const recipeSchema = v.strictObject({
  bbox: rect,
  documentId: v.pipe(v.string(), v.uuid()),
  documentRevision: v.pipe(v.string(), v.uuid()),
  family: v.literal('illustrious'),
  globalEmbeddings: FrozenGenerationEmbeddingsSchema,
  globalPrompts: signedPrompts,
  item: v.strictObject({
    iteration: integer(0),
    promptPairIndex: integer(0),
    prompts: v.strictObject({ negative: text, positive: text }),
    seed: integer(0, 0xff_ff_ff_ff),
  }),
  kind: v.literal('current-canvas-regional-recipe'),
  regions: v.pipe(
    v.array(
      v.strictObject({
        authoredPrompts: v.optional(v.unknown()),
        coverage: v.strictObject({
          alpha: ownedAlpha,
          bounds: worldRect,
          intersection: v.nullable(worldRect),
          kind: v.picklist(['covered', 'intersecting-empty', 'empty', 'outside']),
        }),
        embeddings: FrozenGenerationEmbeddingsSchema,
        maskId: v.pipe(v.string(), v.uuid()),
        maskRevision: integer(0),
        negative: v.strictObject({
          prompt,
          source: v.picklist(['current-canvas', 'regional']),
        }),
        positive: v.nullable(prompt),
        referenceImages: v.optional(v.strictTuple([])),
        regionId: v.pipe(v.string(), v.uuid()),
      }),
    ),
    v.maxLength(3),
  ),
})
const inputSchema = v.strictObject({
  compositionProfile: v.optional(v.literal('invoke-canvas-v1')),
  globalNegativeCoverage: coverageSchema,
  globalPositiveCoverage: coverageSchema,
  initializationProfile: v.optional(RegionalInitializationProfileSchema),
  layout: v.picklist(['cfg-negative-first', 'positive-only']),
  negativePooledSourceId: v.string(),
  positivePooledSourceId: v.string(),
  recipe: recipeSchema,
  request: requestSchema,
})

/** Synchronously detach and validate the shared private recipe/command contract. */
export function captureRegionalWorkerInput(input: RegionalWorkerInput): RegionalWorkerInput {
  let detached: v.InferOutput<typeof inputSchema>
  try {
    const captured: unknown = structuredClone(input)
    const result = v.safeParse(inputSchema, captured)
    if (!result.success) {
      throw invalid('The private regional request is invalid.')
    }
    detached = result.output
    validateAgreement(detached)
    if (
      detached.initializationProfile !== undefined &&
      detached.request.job.sampling.scheduler !== 'euler_a'
    ) {
      throw invalid('Invoke initialization requires the explicit Euler a execution lane.')
    }
    if (
      detached.compositionProfile === 'invoke-canvas-v1' &&
      (detached.globalNegativeCoverage.kind !== 'everywhere' ||
        detached.globalPositiveCoverage.kind !== 'everywhere' ||
        detached.negativePooledSourceId !== 'current-canvas' ||
        detached.positivePooledSourceId !== 'current-canvas' ||
        detached.layout !== 'cfg-negative-first' ||
        detached.request.job.sampling.cfgScale <= 1)
    ) {
      throw invalid('Invoke Canvas requires global support, global pools and CFG above one.')
    }
  } catch (error) {
    if (error instanceof ProjectWorkerError) {
      throw error
    }
    throw invalid('The private regional request cannot be detached.')
  }
  return detached as RegionalWorkerInput
}

/**
 * Detach before the first await, then own independent recipe/alpha/target snapshots. No input path
 * is renamed, retained as a capture lease, or removed. InvokeAI a61ac4fb uses captured pixels and
 * graph references; this is its bounded Node-child adapter, outside public/durable job unions. The
 * caller MUST retain the lease after a dispatched failure until physical exit is confirmed.
 */
export async function prepareRegionalWorkerRequest(
  input: RegionalWorkerInput,
  scratchBasePath: string,
  owner?: InferenceWorkerOwner,
): Promise<RegionalWorkerLease> {
  const capturedOwner = owner === undefined ? undefined : captureInferenceWorkerOwnerValue(owner)
  const detached = captureRegionalWorkerInput(input) as v.InferOutput<typeof inputSchema>
  const base = scratchBasePath
  const baseIdentity = await canonicalDirectory(base)
  const sources = [detached.request.job.checkpoint, ...embeddingResources(detached.recipe)]
  for (const resource of sources) {
    const file = 'managedPath' in resource ? resource.managedPath : resource.path
    if (!v.is(filePath, file) || within(base, file) || file === base) {
      throw invalidPath('Regional model resources must be outside disposable scratch.')
    }
    const entry = await lstat(file, { bigint: true })
    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      (await realpath(file)) !== file ||
      ('byteSize' in resource && entry.size !== BigInt(resource.byteSize))
    ) {
      throw invalidPath('A regional model resource is unsafe or changed.')
    }
  }
  const request = detached.request as IllustriousTxt2ImgRequestV1
  const sourceTarget = request.job.target
  const targetBytes = await readSmartPatchPreparationOutput(
    sourceTarget.path,
    { ...sourceTarget, colorSpace: 'srgb' },
    'source',
  )
  if (classifyTargetPngAlpha(targetBytes, sourceTarget.width, sourceTarget.height) !== 'txt2img') {
    throw invalid('Regional txt2img requires a wholly transparent target.')
  }
  const root = await mkdtemp(path.join(base, 'regional-request-'))
  const rootIdentity = await canonicalDirectory(root)
  const state: LeaseState = {
    base,
    baseIdentity,
    disposal: null,
    disposed: false,
    request,
    root,
    rootIdentity,
  }
  try {
    if (capturedOwner) {
      await writeOwnerMarker(state, capturedOwner)
    }
    request.job.target.path = path.join(root, 'target.png')
    request.job.output = { pngPath: path.join(root, 'result.png'), stagingRoot: root }
    await writeFile(request.job.target.path, targetBytes, { flag: 'wx', mode: 0o600 })
    let alphaBytes = 0
    const alphaDescriptor = async (alpha: Uint8Array, name: string) => {
      alphaBytes += alpha.byteLength
      if (alphaBytes > MAX_ALPHA_BYTES) {
        throw invalid('Regional alpha exceeds 64 MiB.')
      }
      const bytes = Buffer.from(alpha)
      const file = path.join(root, name)
      await writeFile(file, bytes, { flag: 'wx', mode: 0o600 })
      return { $alpha8: descriptor(file, bytes) }
    }
    const regions = []
    for (const [index, region] of detached.recipe.regions.entries()) {
      regions.push({
        ...region,
        coverage: {
          ...region.coverage,
          alpha: await alphaDescriptor(region.coverage.alpha, `region-${index}.alpha8`),
        },
      })
    }
    const globalCoverage = async (coverage: RegionalGlobalCoverage, sign: string) =>
      coverage.kind === 'everywhere'
        ? coverage
        : {
            ...coverage,
            alpha: await alphaDescriptor(coverage.alpha, `global-${sign}.alpha8`),
          }
    // Invoke applies TI while building each prompt's conditioning. The recipe owns that loading
    // here; the ordinary command remains intact for frozen agreement, provenance and Retry.
    const nativeRequest = structuredClone(request)
    if (
      detached.compositionProfile === 'invoke-canvas-v1' &&
      ((nativeRequest.job.embeddings?.positive.length ?? 0) > 0 ||
        (nativeRequest.job.embeddings?.negative.length ?? 0) > 0)
    ) {
      delete nativeRequest.job.embeddings
    }
    const bundle = {
      ...(detached.compositionProfile ? { compositionProfile: detached.compositionProfile } : {}),
      ...(detached.initializationProfile !== undefined
        ? { initializationProfile: detached.initializationProfile }
        : {}),
      globalNegativeCoverage: await globalCoverage(detached.globalNegativeCoverage, 'negative'),
      globalPositiveCoverage: await globalCoverage(detached.globalPositiveCoverage, 'positive'),
      layout: detached.layout,
      negativePooledSourceId: detached.negativePooledSourceId,
      positivePooledSourceId: detached.positivePooledSourceId,
      recipe: { ...detached.recipe, regions },
      request: nativeRequest,
      schemaVersion: 1,
    }
    assertJsonTree(bundle)
    const bytes = Buffer.from(JSON.stringify(bundle), 'utf8')
    if (bytes.length > MAX_BUNDLE_BYTES) {
      throw invalid('Regional bundle exceeds 1 MiB.')
    }
    const file = path.join(root, 'bundle.json')
    await writeFile(file, bytes, { flag: 'wx', mode: 0o600 })
    const wire: RegionalWorkerWire = {
      bundle: descriptor(file, bytes),
      protocolVersion: '1',
      requestId: request.requestId,
      stagingRoot: root,
      type: 'execute-current-canvas-regional',
    }
    if (Buffer.byteLength(`${JSON.stringify(wire)}\n`) > MAX_LINE_BYTES) {
      throw invalid('Regional wire exceeds 64 KiB.')
    }
    freezeTree(request)
    freezeTree(wire)
    const lease: RegionalWorkerLease = Object.freeze({
      dispose: () => dispose(state),
      request,
      wire,
    })
    leases.set(lease, state)
    return lease
  } catch (error) {
    await dispose(state)
    throw error
  }
}

/** Verify correlation and actual RGB/ICC bytes, independently of optional thumbnail claims. */
export async function readRegionalWorkerResult(
  lease: RegionalWorkerLease,
  response: Record<string, unknown>,
): Promise<RegionalWorkerResult> {
  const state = leases.get(lease)
  if (!state || state.disposed || state.disposal) {
    throw invalid('The regional lease is unavailable.')
  }
  await assertStage(state)
  const { request } = state
  if (
    response === null ||
    typeof response !== 'object' ||
    Array.isArray(response) ||
    response.type !== 'generation-done' ||
    response.protocolVersion !== '1' ||
    response.requestId !== request.requestId ||
    response.outputPath !== request.job.output.pngPath ||
    !Number.isInteger(response.seed) ||
    response.seed !== request.job.sampling.seed ||
    Object.keys(response).some(
      (key) =>
        !['outputPath', 'protocolVersion', 'requestId', 'seed', 'thumbnail', 'type'].includes(key),
    )
  ) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'Regional completion differs from its request.')
  }
  const bytes = await readBoundedFile(request.job.output.pngPath, MAX_TARGET_BYTES)
  const output: VerifiedWorkerImage = {
    ...descriptor(request.job.output.pngPath, bytes),
    colorSpace: 'srgb',
    height: request.job.bbox.height,
    iccSha256: IGS_SRGB_ICC_SHA256,
    width: request.job.bbox.width,
  }
  const pngBytes = await readSmartPatchModelSourceOutput(output.path, output)
  return { output, pngBytes, seed: request.job.sampling.seed }
}

function validateAgreement(input: v.InferOutput<typeof inputSchema>): void {
  const { recipe, request } = input
  const { bbox, prompts, sampling } = request.job
  if (
    bbox.width % 8 !== 0 ||
    bbox.height % 8 !== 0 ||
    bbox.width * bbox.height > 4_000_000 ||
    !isDeepStrictEqual(bbox, recipe.bbox) ||
    request.job.target.width !== bbox.width ||
    request.job.target.height !== bbox.height ||
    sampling.seed !== recipe.item.seed ||
    !isDeepStrictEqual(prompts, recipe.item.prompts) ||
    prompts.positive !== recipe.globalPrompts.positive.text ||
    prompts.negative !== recipe.globalPrompts.negative.text ||
    (input.layout === 'positive-only') !== (sampling.cfgScale === 1)
  ) {
    throw invalid('Regional recipe, command, layout or geometry disagree.')
  }
  const embeddings = request.job.embeddings
  const effectiveWire =
    embeddings && (embeddings.positive.length > 0 || embeddings.negative.length > 0)
      ? embeddings
      : undefined
  if (input.compositionProfile === 'invoke-canvas-v1') {
    if (
      !frozenEmbeddingFieldsAgree(
        {
          embeddingRefs: {
            negative: recipe.globalPrompts.negative.embeddingRefs,
            positive: recipe.globalPrompts.positive.embeddingRefs,
          },
          embeddings: recipe.globalEmbeddings,
          prompts,
        },
        effectiveWire,
      )
    ) {
      throw invalid('Public global embedding bindings differ from their recipe and command.')
    }
  } else if (effectiveWire !== undefined) {
    throw invalid('Private regional resources must remain owned by the recipe.')
  }
  const allPrompts = [recipe.globalPrompts.negative, recipe.globalPrompts.positive]
  const ids = new Set(['current-canvas'])
  const positiveIds = new Set(['current-canvas'])
  for (const region of recipe.regions) {
    if (ids.has(region.regionId)) {
      throw invalid('Regional source identities must be unique.')
    }
    ids.add(region.regionId)
    if (region.positive !== null) {
      positiveIds.add(region.regionId)
      allPrompts.push(region.positive)
    } else if (region.embeddings.positive.length) {
      throw invalid('An absent regional positive cannot own resources.')
    }
    allPrompts.push(region.negative.prompt)
    if (
      !isDeepStrictEqual(region.coverage.bounds, bbox) ||
      region.coverage.alpha.byteLength !== bbox.width * bbox.height ||
      (region.negative.source === 'current-canvas' &&
        !isDeepStrictEqual(region.negative.prompt, recipe.globalPrompts.negative))
    ) {
      throw invalid('Regional coverage or inherited negative differs from its recipe.')
    }
  }
  if (
    !ids.has(input.negativePooledSourceId) ||
    !positiveIds.has(input.positivePooledSourceId) ||
    allPrompts.reduce((sum, entry) => sum + Buffer.byteLength(entry.text), 0) > 128 * 1024 ||
    embeddingResources(recipe).length > 16
  ) {
    throw invalid('Regional pools, text or binding counts exceed the private contract.')
  }
  for (const coverage of [input.globalNegativeCoverage, input.globalPositiveCoverage]) {
    if (
      coverage.kind === 'alpha8' &&
      (coverage.width !== bbox.width / 8 ||
        coverage.height !== bbox.height / 8 ||
        coverage.alpha.byteLength !== coverage.width * coverage.height)
    ) {
      throw invalid('Global alpha requires exact latent dimensions and row-major bytes.')
    }
  }
}

function embeddingResources(recipe: v.InferOutput<typeof recipeSchema>) {
  return [recipe.globalEmbeddings, ...recipe.regions.map((region) => region.embeddings)].flatMap(
    (pair) => [...pair.positive, ...pair.negative],
  )
}

function descriptor(file: string, bytes: Buffer): RegionalWorkerFile {
  return {
    byteSize: bytes.length,
    path: file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

async function canonicalDirectory(directory: string): Promise<BigIntStats> {
  if (!v.is(filePath, directory)) {
    throw invalidPath('Regional scratch path is invalid.')
  }
  const stat = await lstat(directory, { bigint: true })
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== BigInt(process.getuid!()) ||
    (stat.mode & 0o022n) !== 0n ||
    (await realpath(directory)) !== directory
  ) {
    throw invalidPath('Regional scratch must be an owned canonical private directory.')
  }
  return stat
}

async function assertStage(state: LeaseState): Promise<void> {
  const base = await canonicalDirectory(state.base)
  const root = await canonicalDirectory(state.root)
  if (!sameIdentity(base, state.baseIdentity) || !sameIdentity(root, state.rootIdentity)) {
    throw invalidPath('Regional staging was replaced.')
  }
}

/**
 * InvokeAI a61ac4fb install_staging_ledger persists ownership before payload publication; its
 * calibration store supplies the wrapper's lifetime flock. Only the Python guard reclaims old
 * marked roots. This producer syncs one exact marker and never scans or signals old owners.
 */
async function writeOwnerMarker(state: LeaseState, owner: InferenceWorkerOwner): Promise<void> {
  await assertStage(state)
  const directory = await open(
    state.root,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    if (!sameIdentity(await directory.stat({ bigint: true }), state.rootIdentity)) {
      throw invalidPath('Regional ownership directory changed.')
    }
    const bytes = serializeRegionalTransportOwner(owner, state.rootIdentity)
    const markerPath = `/proc/self/fd/${directory.fd}/.owner-v1.json`
    const marker = await open(
      markerPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW |
        constants.O_NONBLOCK,
      0o600,
    )
    try {
      const before = await marker.stat({ bigint: true })
      if (
        !before.isFile() ||
        before.nlink !== 1n ||
        before.uid !== BigInt(process.getuid!()) ||
        (before.mode & 0o077n) !== 0n
      ) {
        throw invalidPath('Regional ownership marker is unsafe.')
      }
      await marker.writeFile(bytes)
      await marker.sync()
      const after = await marker.stat({ bigint: true })
      const atPath = await lstat(markerPath, { bigint: true })
      if (
        !sameIdentity(before, after) ||
        !sameIdentity(before, atPath) ||
        !after.isFile() ||
        !atPath.isFile() ||
        atPath.isSymbolicLink() ||
        after.nlink !== 1n ||
        atPath.nlink !== 1n ||
        after.uid !== before.uid ||
        atPath.uid !== before.uid ||
        after.mode !== before.mode ||
        atPath.mode !== before.mode ||
        after.size !== BigInt(bytes.length) ||
        atPath.size !== after.size ||
        after.ctimeNs !== atPath.ctimeNs ||
        after.mtimeNs !== atPath.mtimeNs
      ) {
        throw invalidPath('Regional ownership marker changed during publication.')
      }
      await assertStage(state)
      await directory.sync()
      if (!sameIdentity(await directory.stat({ bigint: true }), state.rootIdentity)) {
        throw invalidPath('Regional ownership directory changed during publication.')
      }
      await assertStage(state)
    } finally {
      await marker.close()
    }
  } finally {
    await directory.close()
  }
}

async function dispose(state: LeaseState): Promise<void> {
  if (state.disposed) {
    return
  }
  state.disposal ??= (async () => {
    await assertStage(state)
    // No recursive traversal into a worker-created directory or linked foreign file.
    for (const name of await readdir(state.root)) {
      const entry = await lstat(path.join(state.root, name), { bigint: true })
      if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1n) {
        throw invalidPath('Regional cleanup encountered an unexpected non-owned entry.')
      }
    }
    await rm(state.root, { recursive: true })
    state.disposed = true
  })().catch((error: unknown) => {
    state.disposal = null
    throw error
  })
  await state.disposal
}

async function readBoundedFile(filePath: string, maximum: number): Promise<Buffer> {
  const file = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  ).catch(() => {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'Regional output is unavailable.')
  })
  try {
    const before = await file.stat({ bigint: true })
    if (
      !before.isFile() ||
      before.size < 1n ||
      before.size > BigInt(maximum) ||
      before.nlink !== 1n
    ) {
      throw new ProjectWorkerError(
        'OUTPUT_MISMATCH',
        'Regional output is not a bounded owned file.',
      )
    }
    const bytes = Buffer.alloc(Number(before.size))
    let offset = 0
    while (offset < bytes.length) {
      const read = await file.read(bytes, offset, bytes.length - offset, offset)
      if (read.bytesRead === 0) {
        break
      }
      offset += read.bytesRead
    }
    const after = await file.stat({ bigint: true })
    const atPath = await lstat(filePath, { bigint: true })
    if (
      offset !== bytes.length ||
      !sameIdentity(before, after) ||
      !sameIdentity(before, atPath) ||
      before.size !== after.size ||
      before.ctimeNs !== after.ctimeNs ||
      before.mtimeNs !== after.mtimeNs ||
      atPath.isSymbolicLink() ||
      (await realpath(filePath)) !== filePath
    ) {
      throw new ProjectWorkerError('OUTPUT_MISMATCH', 'Regional output changed while being read.')
    }
    return bytes
  } catch (error) {
    if (error instanceof ProjectWorkerError) {
      throw error
    }
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'Regional output could not be verified.')
  } finally {
    await file.close()
  }
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function within(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

/** Reject values which JSON would omit, coerce, invoke, or serialize through a custom prototype. */
function assertJsonTree(value: unknown, seen = new Set<object>(), depth = 0): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return
  }
  if (typeof value !== 'object' || depth > 64 || seen.has(value)) {
    throw invalid('Regional metadata is not a finite JSON tree.')
  }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
    throw invalid('Regional metadata contains an unsupported object.')
  }
  seen.add(value)
  for (const child of Object.values(value)) {
    assertJsonTree(child, seen, depth + 1)
  }
  seen.delete(value)
}

function freezeTree(value: object): void {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') {
      freezeTree(child)
    }
  }
  Object.freeze(value)
}

function invalid(message: string): ProjectWorkerError {
  return new ProjectWorkerError('INVALID_REQUEST', message)
}

function invalidPath(message: string): ProjectWorkerError {
  return new ProjectWorkerError('INVALID_PATH', message)
}
