import { LAMA_OUTPAINT_IDENTITY_V1 } from '../../shared/projects/alpha-outpaint.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { defaultIllustriousNoiseProfile } from '../../shared/projects/illustrious-noise-profile.js'
import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
  type IgsRasterLayerV1,
  type IgsRectV1,
  type IgsSmartPatchLayerV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { after, before } from 'node:test'
import { promisify } from 'node:util'
import { crc32, deflateSync, inflateSync } from 'node:zlib'

import type { OutpaintInfillResolver } from '../runtime/inference-auxiliary-resources.js'
import type {
  SmartPatchBatchInputOptions,
  SmartPatchExecutionItem,
  SmartPatchExecutionModelResolver,
  SmartPatchExecutionOptions,
} from './project-smart-patch-execution.js'
import type { CapturedSmartPatchGenerationInput } from './project-smart-patch-generation-input.js'
import type {
  ComposedSmartPatchGenerationInput,
  SmartPatchWorldExecutionOptions,
} from './project-smart-patch-world-output.js'
import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'
import type { SmartPatchInputMaterial } from './smart-patch-frozen-input.js'
import type {
  SmartPatchCoherenceParameters,
  SmartPatchOutputCompositionPayload,
} from './worker-client.js'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { decodeDerivedProjectMaskPng, encodeProjectMaskPng } from './project-mask.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { SmartPatchInputBundleRepository } from './project-smart-patch-input-bundle.js'
import { executeSmartPatchWithTransport } from './smart-patch-execution-request.js'
import { decodeTargetPngAlpha } from './target-png-mode.js'
import {
  composeSmartPatchOutputWithTransport,
  composeTargetWithTransport,
  conditionSmartPatchWithTransport,
  prepareSmartPatchModelSourceWithTransport,
  prepareSmartPatchWithTransport,
} from './worker-client.js'

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../../..')
const WORKER_SOURCE = path.join(REPOSITORY_ROOT, 'worker-python/src')
const PYTHON = path.join(REPOSITORY_ROOT, 'worker-python/.venv/bin/python')
const ORACLE = path.join(import.meta.dirname, 'test-fixtures/smart-patch-execution-oracle.py')
const LAMA_PATH = process.env.IGS_SMART_PATCH_TEST_LAMA_PATH
const execFileAsync = promisify(execFile)
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
type Family = 'anima' | 'illustrious'
type Mode = 'img2img' | 'inpaint' | 'outpaint' | 'txt2img'
type ExactReference = NonNullable<IgsProjectDocumentV1['generationDraft']['model']>
type FileIdentity = { byteSize: number; path: string; sha256: string }
type NativeResources = {
  anima: { checkpoint: FileIdentity; qwen3Encoder: FileIdentity; vae: FileIdentity }
  illustrious: { checkpoint: FileIdentity }
}
type ExecutionObservation = {
  calls: string[]
  decoded: {
    height: number
    iccSha256: string
    mode: string
    rgbBase64: string
    width: number
  } | null
  paths: { denoising: string; inference: string }
  progress: { requestId: string; step: number; totalSteps: number }[]
  response: Record<string, unknown>
}
type Observation = { request: SmartPatchExecutionRequest; result: ExecutionObservation }
let resourceRoot: string
let resources: NativeResources

async function child<T>(oracle: string, envelope: object): Promise<T> {
  assert.ok(existsSync(PYTHON), 'The existing checkout Python runtime is required')
  const execution = execFileAsync(PYTHON, ['-I', '-B', oracle, WORKER_SOURCE], {
    cwd: REPOSITORY_ROOT,
    env: {
      ...process.env,
      CUDA_VISIBLE_DEVICES: '',
      HF_HUB_OFFLINE: '1',
      MKL_NUM_THREADS: '1',
      OMP_NUM_THREADS: '1',
      OPENBLAS_NUM_THREADS: '1',
      TRANSFORMERS_OFFLINE: '1',
    },
    maxBuffer: 12 * 1024 * 1024,
    timeout: 60_000,
  })
  assert.ok(execution.child.stdin)
  execution.child.stdin.end(JSON.stringify(envelope))
  const result = await execution
  assert.equal(execution.child.exitCode, 0, 'The actual Python child exited before Main continued')
  return JSON.parse(result.stdout) as T
}

before(async () => {
  resourceRoot = await mkdtemp(path.join(tmpdir(), 'igs-patch-native-resources-'))
  resources = await child<NativeResources>(ORACLE, { action: 'initialize', root: resourceRoot })
})
after(async () => {
  if (resourceRoot) {
    await rm(resourceRoot, { force: true, recursive: true })
  }
})

type FixtureOptions = {
  bbox: IgsRectV1
  coherenceSettings?: SmartPatchCoherenceParameters
  family: Family
  internal?: { height: number; width: number }
  loss?: boolean
  mask: { alpha: readonly number[]; bounds: IgsRectV1 } | null
  maskSettings?: { blur: number; padding: number }
  mode: Mode
  sourceAlpha?: number
  sourceRgba?: readonly number[]
}

type Fixture = {
  database: ReturnType<typeof openAppDatabase>
  maskBytes: Buffer | null
  packagePath: string
  patch: IgsSmartPatchLayerV1
  scratch: string
  service: ProjectService
  shadow: ProjectShadowStore
  source: IgsRasterLayerV1
  tabId: string
}

type PreparationWorker = SmartPatchExecutionOptions['preparationWorker']

function reference(family: Family): ExactReference {
  return {
    baseModelFamily: family,
    civitaiFileId: 1003,
    civitaiModelId: 1001,
    civitaiVersionId: 1002,
    displayName: `Scaled native ${family}`,
    fileSha256: resources[family].checkpoint.sha256,
    kind: 'checkpoint',
    localModelId: '11111111-1111-4111-8111-111111111111',
    localVersionId: '22222222-2222-4222-8222-222222222222',
    predictionType: family === 'illustrious' ? 'epsilon' : null,
    versionName: 'Original topology, tiny CPU widths',
  }
}

/**
 * Trusted catalog/architecture qualification is a declared collaborator. The actual request builder
 * and worker recheck exact on-disk resource identities. These small files are not admitted as
 * trained production checkpoints.
 */
function modelService(
  family: Family,
  onResolve?: () => Promise<void>,
): SmartPatchExecutionModelResolver {
  const unused = async (): Promise<never> => {
    throw new Error('An unselected resource must not resolve')
  }
  const verify = async (file: FileIdentity) => {
    const bytes = await readFile(file.path)
    assert.equal(bytes.length, file.byteSize)
    assert.equal(digest(bytes), file.sha256, 'Exact native resource bytes changed')
  }
  return {
    assertNoUnboundGenerationEmbeddings: async () => undefined,
    resolveVerifiedAnimaGenerationLoraForPlan: unused,
    resolveVerifiedGenerationAnimaBundleForPlan: async (saved) => {
      assert.equal(family, 'anima')
      assert.deepEqual(saved, reference(family))
      const native = resources.anima
      for (const file of Object.values(native)) {
        await verify(file)
      }
      await onResolve?.()
      const component = (file: FileIdentity) => ({
        byteSize: file.byteSize,
        localModelId: '33333333-3333-4333-8333-333333333333',
        localVersionId: '44444444-4444-4444-8444-444444444444',
        managedPath: file.path,
        sha256: file.sha256,
      })
      return {
        architecture: 'anima-base-1.0',
        checkpoint: {
          byteSize: native.checkpoint.byteSize,
          managedPath: native.checkpoint.path,
          reference: reference(family),
        },
        qwen3Encoder: component(native.qwen3Encoder),
        vae: component(native.vae),
      }
    },
    resolveVerifiedGenerationCheckpointForPlan: async (saved) => {
      assert.equal(family, 'illustrious')
      assert.deepEqual(saved, reference(family))
      await verify(resources.illustrious.checkpoint)
      await onResolve?.()
      return { managedPath: resources.illustrious.checkpoint.path, reference: reference(family) }
    },
    resolveVerifiedGenerationEmbeddingForPlan: unused,
    resolveVerifiedGenerationLoraForPlan: unused,
    resolveVerifiedGenerationVaeForPlan: unused,
  }
}

/** Literal fixture PNG encoding. No crop, resize, compositor or expected-output oracle lives here. */
function literalPng(
  profile: Buffer,
  width: number,
  height: number,
  pixels: readonly number[],
  channels: 3 | 4,
): Buffer {
  assert.equal(pixels.length, width * height * channels)
  const chunk = (name: string, bytes: Buffer): Buffer => {
    const encoded = Buffer.alloc(bytes.length + 12)
    encoded.writeUInt32BE(bytes.length, 0)
    encoded.write(name, 4, 'ascii')
    bytes.copy(encoded, 8)
    encoded.writeUInt32BE(crc32(encoded.subarray(4, -4)), encoded.length - 4)
    return encoded
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = channels === 3 ? 2 : 6
  const rows = Buffer.alloc(height * (width * channels + 1))
  for (let row = 0; row < height; row++) {
    rows.set(
      pixels.slice(row * width * channels, (row + 1) * width * channels),
      row * (width * channels + 1) + 1,
    )
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('iCCP', Buffer.concat([Buffer.from('srgb\0\0'), deflateSync(profile)])),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function sourcePng(
  profile: Buffer,
  width: number,
  height: number,
  rgba: readonly number[],
): Buffer {
  return literalPng(profile, width, height, rgba, 4)
}

function raster(bytes: Buffer, bbox: IgsRectV1, name: string): IgsRasterLayerV1 {
  const id = randomUUID()
  return {
    asset: {
      bytes: bytes.length,
      height: bbox.height,
      path: `assets/layers/${id}.png`,
      sha256: digest(bytes),
      width: bbox.width,
    },
    blendMode: 'normal',
    id,
    kind: 'raster',
    locked: false,
    name,
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: bbox.x, y: bbox.y },
    visible: true,
  }
}

async function fixture(
  options: FixtureOptions,
  run: (value: Fixture) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-patch-real-execution-'))
  const database = openAppDatabase(root, path.join(REPOSITORY_ROOT, 'src/main/db/migrations'))
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const scratch = path.join(root, 'scratch')
  const placeholdersDir = path.join(REPOSITORY_ROOT, 'src/main/projects/placeholders')
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: root,
    repository,
    roots: { placeholdersDir, scratchDir: scratch },
    shadow,
  })
  try {
    const profile = await readFile(path.join(WORKER_SOURCE, 'imagegen_worker/srgb.icc'))
    assert.equal(digest(profile), IGS_SRGB_ICC_SHA256)
    const document = createEmptyProjectDocumentV1({ title: 'Actual private Patch execution' })
    document.primaryBbox = { ...options.bbox }
    document.lastActualSeedSnapshot = 0
    const maskBytes = options.mask
      ? encodeProjectMaskPng(
          Uint8Array.from(options.mask.alpha),
          options.mask.bounds.width,
          options.mask.bounds.height,
        )
      : null
    const maskId = randomUUID()
    const maskHash = maskBytes ? digest(maskBytes) : null
    const patch: IgsSmartPatchLayerV1 = {
      activeRasterSubLayerId: null,
      blendMode: 'normal',
      boundingBox: { ...options.bbox },
      ...(options.coherenceSettings ? { coherenceSettings: { ...options.coherenceSettings } } : {}),
      generationDraft: structuredClone(document.generationDraft),
      id: randomUUID(),
      internalResolution: {
        height: options.internal?.height ?? options.bbox.height,
        width: options.internal?.width ?? options.bbox.width,
      },
      kind: 'smart-patch',
      locked: false,
      mask:
        maskBytes && options.mask && maskHash
          ? {
              asset: {
                bytes: maskBytes.length,
                height: options.mask.bounds.height,
                path: `assets/masks/${maskId}/${maskHash}.png`,
                sha256: maskHash,
                width: options.mask.bounds.width,
              },
              bounds: { ...options.mask.bounds },
              id: maskId,
              revision: 3,
            }
          : { asset: null, id: maskId, revision: 0 },
      maskSettings: { ...(options.maskSettings ?? { blur: 31, padding: 5 }) },
      name: 'Owned B preparation',
      opacity: 1,
      rasterSubLayers: [],
      visible: true,
    }
    patch.generationDraft.positivePrompt.text = 'frozen authored prompt'
    patch.generationDraft.model = reference(options.family)
    patch.generationDraft.sampling = {
      ...patch.generationDraft.sampling,
      animaMethod: 'euler',
      cfgScale: 4,
      denoisingStrength: options.mode === 'txt2img' ? null : 0.75,
      sampler: 'Euler',
      scheduler: 'Normal',
      steps: 3,
    }
    patch.generationDraft.seed = { policy: 'fixed', value: 0 }
    const pixels = options.bbox.width * options.bbox.height
    const sourceBytes = sourcePng(
      profile,
      options.bbox.width,
      options.bbox.height,
      options.sourceRgba ??
        Array.from({ length: pixels }, () => [0, 255, 0, options.sourceAlpha ?? 255]).flat(),
    )
    const redBytes = sourcePng(
      profile,
      options.bbox.width,
      options.bbox.height,
      Array.from({ length: pixels }, () => [255, 0, 0, 255]).flat(),
    )
    const above = raster(redBytes, options.bbox, 'Excluded opaque red above target')
    const source = raster(sourceBytes, options.bbox, 'Included green below target')
    document.layers = [above, patch, source]
    const assets = {
      [above.asset.path]: { bytes: redBytes },
      [source.asset.path]: { bytes: sourceBytes },
      ...(maskBytes && patch.mask.asset ? { [patch.mask.asset.path]: { bytes: maskBytes } } : {}),
    }
    const externalPath = path.join(root, 'source.igs')
    await saveIgsPackage(externalPath, {
      assets,
      preview: {
        ...(await readProjectPlaceholders(placeholdersDir, 'unavailable')),
        rect: options.bbox,
        status: 'unavailable',
      },
      project: document,
    })
    const selected = await service.selectImport(externalPath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      assert.fail('Actual fixture package must enter Project import')
    }
    const imported = await service.finishImport(selected.importId, 'copy')
    assert.equal(imported.result.kind, 'opened')
    if (imported.result.kind !== 'opened') {
      assert.fail('Actual imported Project must open')
    }
    const packagePath = (await repository.listProjects())[0].canonicalPath
    await run({
      database,
      maskBytes,
      packagePath,
      patch,
      scratch,
      service,
      shadow,
      source,
      tabId: imported.result.tab.id,
    })
  } finally {
    for (const tab of service.getOpenTabs()) {
      await service.discardAndClose(tab.id)
    }
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

function options(family: Family, mode: Mode, loss = false): FixtureOptions {
  const bbox = { height: loss ? 512 : 80, width: loss ? 512 : 96, x: -24, y: 17 }
  const mask =
    mode === 'inpaint'
      ? {
          alpha: loss ? [255] : Array.from({ length: 16 * 16 }, () => 255),
          bounds: {
            height: loss ? 1 : 16,
            width: loss ? 1 : 16,
            x: bbox.x + 17,
            y: bbox.y + 19,
          },
        }
      : null
  return {
    bbox,
    coherenceSettings: { edgeSize: 0, minimumDenoise: 0, mode: 'Box Blur' },
    family,
    internal: { height: 64, width: 64 },
    loss,
    mask,
    maskSettings: { blur: 0, padding: 0 },
    mode,
    sourceAlpha: mode === 'txt2img' ? 0 : 255,
    ...(mode === 'outpaint'
      ? {
          sourceRgba: Array.from({ length: bbox.width * bbox.height }, (_, index) => [
            32,
            64,
            96,
            index % bbox.width < bbox.width / 2 ? 255 : 0,
          ]).flat(),
        }
      : {}),
  }
}
function preparationWorker(f: Fixture): PreparationWorker {
  const exchange = async (type: string, payload: object) => {
    const observation = await child<{ response: Record<string, unknown> }>(ORACLE, {
      action: 'prepare',
      request: { ...payload, protocolVersion: '1', requestId: randomUUID(), type },
    })
    return observation.response
  }
  return {
    composeTarget: (input) =>
      composeTargetWithTransport(input, f.scratch, (payload) =>
        exchange('compose-target', payload),
      ),
    conditionSmartPatch: (input) =>
      conditionSmartPatchWithTransport(input, f.scratch, (payload) =>
        exchange('condition-smart-patch', payload),
      ),
    prepareSmartPatch: (input) =>
      prepareSmartPatchWithTransport(input, f.scratch, (payload) =>
        exchange('prepare-smart-patch', payload),
      ),
    prepareSmartPatchModelSource: (input) =>
      prepareSmartPatchModelSourceWithTransport(input, f.scratch, (payload) =>
        exchange('prepare-smart-patch-model-source', payload),
      ),
  }
}

async function actualExecution(
  request: SmartPatchExecutionRequest,
  observed: Observation[],
  corrupt?: 'rgba',
): Promise<Record<string, unknown>> {
  const result = await child<ExecutionObservation>(ORACLE, {
    configRoot: resourceRoot,
    corrupt,
    request,
  })
  assert.deepEqual(result.paths, {
    denoising: path.join(WORKER_SOURCE, 'imagegen_worker/smart_patch_denoising.py'),
    inference: path.join(WORKER_SOURCE, 'imagegen_worker/inference.py'),
  })
  observed.push({ request: structuredClone(request), result })
  if (result.response.type === 'error') {
    // Match the JSONL client's error dispatch instead of hiding a native refusal
    // behind the transport's successful-output metadata check.
    throw new Error(`Native Smart Patch worker refused: ${JSON.stringify(result.response)}`)
  }
  return result.response
}

function executionOptions(
  f: Fixture,
  family: Family,
  observed: Observation[],
): SmartPatchExecutionOptions {
  const infillResolver: OutpaintInfillResolver = {
    resolveVerifiedOutpaintInfill: async () => {
      assert.ok(LAMA_PATH, 'Full OUT integration requires explicit existing pinned LaMa path')
      return { ...LAMA_OUTPAINT_IDENTITY_V1, managedPath: LAMA_PATH }
    },
  }
  return {
    generationWorker: {
      executeSmartPatch: (request) =>
        executeSmartPatchWithTransport(request, f.scratch, (payload) =>
          actualExecution(payload, observed),
        ),
    },
    infillResolver,
    item: { prompts: { negative: '(dark blur)--', positive: '(bright hair:2)' }, seed: 0 },
    modelService: modelService(family),
    preparationWorker: preparationWorker(f),
  }
}

function batchInputOptions(
  f: Fixture,
  family: Family,
  items: readonly SmartPatchExecutionItem[] = [
    { prompts: { negative: '(dark blur)--', positive: '(bright hair:2)' }, seed: 0 },
    { prompts: { negative: 'fog', positive: '(quiet sky:0.5)' }, seed: 0xff_ff_ff_ff },
  ],
): SmartPatchBatchInputOptions {
  return { items, modelService: modelService(family), preparationWorker: preparationWorker(f) }
}

function observePreparation(input: SmartPatchBatchInputOptions) {
  const counts = { compose: 0, condition: 0, modelSource: 0, prepare: 0 }
  const stages: string[] = []
  const worker = input.preparationWorker
  const compose = worker.composeTarget.bind(worker)
  const prepare = worker.prepareSmartPatch.bind(worker)
  const condition = worker.conditionSmartPatch.bind(worker)
  const modelSource = worker.prepareSmartPatchModelSource.bind(worker)
  worker.composeTarget = async (request) => {
    counts.compose++
    stages.push(request.stagingRoot)
    return await compose(request)
  }
  worker.prepareSmartPatch = async (request) => {
    counts.prepare++
    return await prepare(request)
  }
  worker.conditionSmartPatch = async (request) => {
    counts.condition++
    return await condition(request)
  }
  worker.prepareSmartPatchModelSource = async (request) => {
    counts.modelSource++
    return await modelSource(request)
  }
  return { counts, stages }
}

function assertDetachedBatchInput(
  material: SmartPatchInputMaterial,
  setup: FixtureOptions,
  items: readonly SmartPatchExecutionItem[],
  stage: string,
) {
  assert.equal(material.manifest.kind, 'smart-patch-frozen-input')
  assert.equal(material.manifest.schemaVersion, 1)
  assert.equal(material.manifest.mode, setup.mode)
  assert.deepEqual(material.manifest.context.bbox, setup.bbox)
  assert.deepEqual(material.manifest.context.internalResolution, { height: 64, width: 64 })
  assert.deepEqual(
    material.manifest.items.map((entry) => entry.item),
    items,
  )
  assert.ok(material.manifest.items.every((entry) => entry.family === setup.family))
  assert.ok(
    !JSON.stringify(material.manifest).includes(stage),
    'No transient stage survives in the durable material',
  )
  assert.ok(
    !existsSync(stage),
    'Capture removes its private source/preparation stage before returning',
  )
  const files = Object.entries(material.files)
  assert.ok(
    files.length >= 3,
    'Source, latent KEEP and final world contribution remain independently owned',
  )
  for (const [name, bytes] of files) {
    assert.ok(!path.isAbsolute(name) && !name.includes('..'), 'Material filenames stay relative')
    assert.ok(
      Buffer.isBuffer(bytes),
      'Every returned input is a detached Buffer, not a lease pathname',
    )
    assert.ok(bytes.length > 33)
    assert.equal(bytes.toString('ascii', 12, 16), 'IHDR')
    const metadata = material.manifest.files[name as keyof typeof material.manifest.files]
    assert.ok(metadata, 'Each actual file must have an independently matching frozen identity')
    assert.equal(metadata.sha256, digest(bytes))
    assert.equal(metadata.byteSize, bytes.length)
    assert.equal(metadata.width, bytes.readUInt32BE(16))
    assert.equal(metadata.height, bytes.readUInt32BE(20))
  }
  assert.equal(material.files['source.png'][25], 6)
  assert.equal(actualIccHash(material.files['source.png']), IGS_SRGB_ICC_SHA256)
  assert.deepEqual(
    [
      material.manifest.files['final-contribution-mask.png'].width,
      material.manifest.files['final-contribution-mask.png'].height,
    ],
    [setup.bbox.width, setup.bbox.height],
  )
  if (setup.mode === 'txt2img') {
    assert.equal(material.files['model-source.png'], undefined)
    assert.ok(
      decodeTargetPngAlpha(material.files['source.png'], setup.bbox.width, setup.bbox.height).every(
        (alpha) => alpha === 0,
      ),
    )
  } else {
    assert.equal(material.files['model-source.png'][25], 2)
    assert.equal(actualIccHash(material.files['model-source.png']), IGS_SRGB_ICC_SHA256)
  }
}

function worldExecutionOptions(
  f: Fixture,
  family: Family,
  observed: Observation[],
  composed: SmartPatchOutputCompositionPayload[] = [],
): SmartPatchWorldExecutionOptions {
  return {
    ...executionOptions(f, family, observed),
    outputWorker: {
      composeSmartPatchOutput: (input) =>
        composeSmartPatchOutputWithTransport(input, f.scratch, async (payload) => {
          composed.push(structuredClone(payload))
          const observation = await child<{ response: Record<string, unknown> }>(ORACLE, {
            action: 'prepare',
            request: {
              ...payload,
              protocolVersion: '1',
              requestId: randomUUID(),
              type: 'compose-smart-patch-output',
            },
          })
          return observation.response
        }),
    },
  }
}

/**
 * Declared inference collaborator for Main ownership/failure cases only. It writes actual valid RGB
 * pixels; the capture's builders/readers and actual CPU preparation/composition remain real. These
 * cases deliberately make no native inference claim.
 */
function literalWorldExecutionOptions(
  f: Fixture,
  composed: SmartPatchOutputCompositionPayload[] = [],
): SmartPatchWorldExecutionOptions {
  const input = worldExecutionOptions(f, 'illustrious', [], composed)
  input.generationWorker.executeSmartPatch = async (request) => {
    const profile = await readFile(path.join(WORKER_SOURCE, 'imagegen_worker/srgb.icc'))
    const { height, width } = request.internalResolution
    const bytes = literalPng(
      profile,
      width,
      height,
      Array.from({ length: width * height }, () => [23, 47, 91]).flat(),
      3,
    )
    await writeFile(request.output.pngPath, bytes, { flag: 'wx' })
    return {
      output: {
        byteSize: bytes.length,
        colorSpace: 'srgb',
        height,
        iccSha256: IGS_SRGB_ICC_SHA256,
        path: request.output.pngPath,
        sha256: digest(bytes),
        width,
      },
    }
  }
  return input
}

/** Read the embedded profile independently of the returned metadata and Main's PNG verifier. */
function actualIccHash(bytes: Buffer): string {
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const next = offset + length + 12
    assert.ok(next <= bytes.length, 'The returned PNG chunks must be complete')
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'iCCP') {
      const chunk = bytes.subarray(offset + 8, offset + 8 + length)
      const terminator = chunk.indexOf(0)
      assert.ok(terminator > 0 && terminator + 2 < chunk.length)
      assert.equal(chunk[terminator + 1], 0)
      return digest(inflateSync(chunk.subarray(terminator + 2), { maxOutputLength: 64 * 1024 }))
    }
    offset = next
  }
  assert.fail('The actual world PNG must embed its ICC profile')
}

function assertWorldContribution(result: ComposedSmartPatchGenerationInput, bbox: IgsRectV1) {
  assert.deepEqual(result.context.bbox, bbox)
  const world = result.worldContribution
  assert.equal(world.width, bbox.width)
  assert.equal(world.height, bbox.height)
  assert.equal(world.byteSize, world.bytes.length)
  assert.equal(world.sha256, digest(world.bytes))
  assert.equal(world.colorSpace, 'srgb')
  assert.equal(world.iccSha256, IGS_SRGB_ICC_SHA256)
  assert.equal(world.bytes[24], 8, 'The detached world PNG has actual 8-bit channels')
  assert.equal(world.bytes[25], 6, 'The detached world PNG has actual RGBA topology')
  assert.equal(actualIccHash(world.bytes), IGS_SRGB_ICC_SHA256)
  const expected = result.conditioning.finalContributionMask
  const expectedAlpha = decodeDerivedProjectMaskPng(expected.bytes, expected)
  const worldAlpha = decodeTargetPngAlpha(world.bytes, world.width, world.height)
  assert.ok(
    worldAlpha.equals(expectedAlpha),
    'Actual world output alpha must exactly equal the frozen final contribution, without a second fade',
  )
  return { expectedAlpha, worldAlpha }
}

async function state(f: Fixture) {
  return {
    document: structuredClone(f.service.getOpenDocumentForAcceptance(f.tabId)!.document),
    file: await readFile(f.packagePath),
    history: await f.database.db.selectFrom('project_accepted_result_index').selectAll().execute(),
    queue: await f.database.db.selectFrom('generation_queue_item').selectAll().execute(),
    receipts: await f.database.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
    seed: await f.database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
    shadow: await f.shadow.inspect({
      projectPath: f.packagePath,
      savedPackage: await readIgsPackage(f.packagePath),
    }),
    tab: f.service.getOpenTabs()[0],
  }
}

async function scratchEntries(scratch: string): Promise<string[]> {
  try {
    return await readdir(scratch)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}
async function unchanged(f: Fixture, before: Awaited<ReturnType<typeof state>>) {
  const after = await state(f)
  const { file: beforeFile, ...beforeState } = before
  const { file: afterFile, ...afterState } = after
  assert.ok(
    afterFile.equals(beforeFile),
    'Private execution must leave raw saved .igs bytes unchanged',
  )
  assert.deepEqual(afterState, beforeState)
  assert.deepEqual(await scratchEntries(f.scratch), [])
}

function assertNativeExecution(observation: Observation, family: Family, mode: Mode) {
  const { request, result } = observation
  assert.equal(request.family, family)
  assert.equal(request.mode, mode)
  assert.deepEqual(request.internalResolution, { height: 64, width: 64 })
  assert.equal(result.response.type, 'smart-patch-executed')
  assert.ok(result.decoded, 'The actual published native PNG must decode')
  assert.equal(result.decoded.mode, 'RGB')
  assert.equal(result.decoded.iccSha256, IGS_SRGB_ICC_SHA256)
  assert.deepEqual([result.decoded.width, result.decoded.height], [64, 64])
  assert.ok(result.calls.includes('denoise'), 'The actual native denoiser must execute')
  assert.ok(result.calls.includes('vae-decode'), 'The actual native VAE decoder must execute')
  assert.equal(result.calls.includes('vae-encode'), mode !== 'txt2img')
  assert.equal(request.modelSource === null, mode === 'txt2img')
  assert.ok(result.progress.length > 0)
  for (const [index, event] of result.progress.entries()) {
    assert.equal(event.requestId, request.requestId)
    assert.equal(event.step, index + 1)
    assert.equal(event.totalSteps, result.progress.length)
  }
  if (request.family === 'illustrious') {
    assert.deepEqual(request.inference.prompts, {
      negative: '(dark blur)--',
      positive: '(bright hair:2)',
    })
    assert.equal(request.inference.sampling.seed, 0)
    assert.equal(request.inference.checkpoint.sha256, resources.illustrious.checkpoint.sha256)
  } else {
    assert.equal(request.inference.prompts.positive.cleanedText, 'bright hair')
    assert.equal(request.inference.prompts.positive.spans[0]?.weight, 2)
    assert.equal(request.inference.sampling.seed, 0)
    assert.equal(request.inference.model.checkpoint.sha256, resources.anima.checkpoint.sha256)
    assert.ok(result.calls.includes('qwen3-encode'))
  }
}

// Boundary: real imported Service/.igs/SQLite -> owned capture -> production Main
// builders/readers -> actual child parser/resources/native family models/publisher.
// Only small architecture/config/CUDA collaborators are declared in the child;
// no replacement denoiser, source/mask algorithm or output oracle is introduced.
for (const family of ['illustrious', 'anima'] as const) {
  for (const mode of ['txt2img', 'img2img', 'inpaint', 'outpaint'] as const) {
    test(
      `actual ${family} ${mode} capture executes native processing RGB while preserving every durable owner`,
      {
        skip:
          mode === 'outpaint' && !LAMA_PATH
            ? 'Set IGS_SMART_PATCH_TEST_LAMA_PATH to existing pinned weights'
            : false,
      },
      async () => {
        await fixture(options(family, mode), async (f) => {
          const before = await state(f)
          const observed: Observation[] = []
          const input = executionOptions(f, family, observed)
          let infillCalls = 0
          const resolver = input.infillResolver!
          input.infillResolver = {
            resolveVerifiedOutpaintInfill: async () => {
              infillCalls++
              return await resolver.resolveVerifiedOutpaintInfill()
            },
          }
          const result = await f.service.withCapturedSmartPatchGenerationInput(
            f.tabId,
            f.patch.id,
            (capture) => capture.execute(input),
          )
          assert.equal(observed.length, 1)
          assertNativeExecution(observed[0], family, mode)
          assert.deepEqual(result.context.bbox, { height: 80, width: 96, x: -24, y: 17 })
          assert.deepEqual(result.context.internalResolution, { height: 64, width: 64 })
          assert.equal(result.output.width, 64)
          assert.equal(result.output.height, 64)
          assert.equal(result.output.sha256, digest(result.output.bytes))
          assert.equal(result.output.bytes[25], 2, 'Main returns actual RGB8 PNG topology')
          assert.equal(result.mode, mode)
          assert.equal(result.item.seed, 0)
          assert.equal(infillCalls, mode === 'outpaint' ? 1 : 0)
          assert.ok(!existsSync(observed[0].request.output.stagingRoot))
          await unchanged(f, before)
        })
      },
    )
  }
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`actual ${family} retains INP and runs VAE/denoising when the edit vanishes into all255 latent KEEP`, async () => {
    await fixture(options(family, 'inpaint', true), async (f) => {
      const before = await state(f)
      const observed: Observation[] = []
      const result = await f.service.withCapturedSmartPatchGenerationInput(
        f.tabId,
        f.patch.id,
        (capture) => capture.execute(executionOptions(f, family, observed)),
      )
      assertNativeExecution(observed[0], family, 'inpaint')
      const keep = result.conditioning.latentKeepMask
      const bytes = decodeDerivedProjectMaskPng(keep.bytes, keep)
      assert.ok(
        bytes.every((alpha) => alpha === 255),
        'Actual reduced latent KEEP is fully protected',
      )
      assert.equal(result.conditioning.latentMaskHasCoverage, false)
      assert.equal(result.mode, 'inpaint')
      await unchanged(f, before)
    })
  })
}

test('execution freezes concrete seed/prompts, draft and methods before an admitted chain awaits', async () => {
  await fixture(options('illustrious', 'inpaint'), async (f) => {
    const observed: Observation[] = []
    const input = executionOptions(f, 'illustrious', observed)
    const actual = input.preparationWorker.composeTarget
    const frozenItem = structuredClone(input.item)
    let afterEdit!: Awaited<ReturnType<typeof state>>
    input.preparationWorker.composeTarget = async (request) => {
      input.item.seed = 99
      input.item.prompts.positive = 'late alias prompt'
      input.modelService.resolveVerifiedGenerationCheckpointForPlan = async () => {
        throw new Error('Late method alias must not execute')
      }
      await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, {
        kind: 'internal-resolution',
        size: { height: 128, width: 128 },
      })
      await f.service.flushAutosave(f.tabId)
      afterEdit = await state(f)
      return await actual(request)
    }
    const result = await f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      (capture) => {
        capture.context.generationDraft.sampling.steps = 99
        capture.context.internalResolution.width = 128
        capture.document.layers = []
        capture.maskPngBytes?.fill(0)
        return capture.execute(input)
      },
    )
    assertNativeExecution(observed[0], 'illustrious', 'inpaint')
    assert.deepEqual(result.item, frozenItem)
    assert.deepEqual(result.context.internalResolution, { height: 64, width: 64 })
    assert.equal(result.context.generationDraft.sampling.steps, 3)
    await unchanged(f, afterEdit)
  })
})

test('Main final consumption refuses a genuinely published RGBA PNG even through an adapter claiming valid RGB metadata', async () => {
  await fixture(options('illustrious', 'img2img'), async (f) => {
    const before = await state(f)
    const observed: Observation[] = []
    const input = executionOptions(f, 'illustrious', observed)
    input.generationWorker.executeSmartPatch = async (request) => {
      const response = await actualExecution(request, observed, 'rgba')
      assert.equal(response.type, 'smart-patch-executed')
      const output = response.output as {
        byteSize: number
        colorSpace: 'srgb'
        height: number
        sha256: string
        width: number
      }
      return { output: { ...output, iccSha256: IGS_SRGB_ICC_SHA256, path: request.output.pngPath } }
    }
    await assert.rejects(
      f.service.withCapturedSmartPatchGenerationInput(f.tabId, f.patch.id, (capture) =>
        capture.execute(input),
      ),
      /RGB|output|PNG/i,
    )
    assert.equal(observed.length, 1)
    assert.equal(observed[0].result.decoded?.mode, 'RGBA')
    await unchanged(f, before)
    const control: Observation[] = []
    await f.service.withCapturedSmartPatchGenerationInput(f.tabId, f.patch.id, (capture) =>
      capture.execute(executionOptions(f, 'illustrious', control)),
    )
    assertNativeExecution(control[0], 'illustrious', 'img2img')
    await unchanged(f, before)
  })
})

test('actual worker refuses an exact checkpoint changed after Main qualification before any native loading', async () => {
  await fixture(options('illustrious', 'img2img'), async (f) => {
    const before = await state(f)
    const observed: Observation[] = []
    const input = executionOptions(f, 'illustrious', observed)
    const original = await readFile(resources.illustrious.checkpoint.path)
    input.generationWorker.executeSmartPatch = async (request) => {
      const changed = Buffer.from(original)
      changed[changed.length - 1] ^= 1
      await writeFile(resources.illustrious.checkpoint.path, changed)
      return await executeSmartPatchWithTransport(request, f.scratch, (payload) =>
        actualExecution(payload, observed),
      )
    }
    try {
      await assert.rejects(
        f.service.withCapturedSmartPatchGenerationInput(f.tabId, f.patch.id, (capture) =>
          capture.execute(input),
        ),
      )
      assert.equal(observed.length, 1)
      assert.equal(observed[0].result.response.code, 'GENERATION_INPUT_CHANGED')
      assert.ok(!observed[0].result.calls.includes('scaled-single-file-constructor'))
      await unchanged(f, before)
    } finally {
      await writeFile(resources.illustrious.checkpoint.path, original)
    }
  })
})

test('the whole admitted execution chain drains after callback failure and escaped execute refuses after close', async () => {
  await fixture(options('illustrious', 'img2img'), async (f) => {
    const before = await state(f)
    const observed: Observation[] = []
    const input = executionOptions(f, 'illustrious', observed)
    let entered!: () => void
    const didEnter = new Promise<void>((resolve) => {
      entered = resolve
    })
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const actual = input.generationWorker.executeSmartPatch
    let held!: CapturedSmartPatchGenerationInput
    let stage = ''
    let callbackSettled = false
    let operation: ReturnType<CapturedSmartPatchGenerationInput['execute']> | undefined
    input.generationWorker.executeSmartPatch = async (request) => {
      stage = request.output.stagingRoot
      entered()
      await released
      assert.ok(existsSync(stage), 'Admitted family execution retains its complete input lease')
      return await actual(request)
    }
    const capturing = f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      async (capture) => {
        held = capture
        operation = capture.execute(input)
        void operation.catch(() => undefined)
        await didEnter
        throw new Error('Intentional callback failure during family execution')
      },
    )
    void capturing.then(
      () => {
        callbackSettled = true
      },
      () => {
        callbackSettled = true
      },
    )
    try {
      await Promise.race([
        didEnter,
        capturing.then(() => assert.fail('Capture settled before the execution witness')),
      ])
      await new Promise<void>((resolve) => {
        setImmediate(resolve)
      })
      assert.equal(callbackSettled, false)
      assert.ok(existsSync(stage))
      release()
      await assert.rejects(capturing, /Intentional callback failure/)
      assert.ok(operation)
      await assert.doesNotReject(operation, 'Admitted VAE/denoising completes before cleanup')
      const result = await operation
      assert.equal(result.mode, 'img2img')
      assertNativeExecution(observed[0], 'illustrious', 'img2img')
      assert.equal(existsSync(stage), false)
      let lateDispatched = false
      input.generationWorker.executeSmartPatch = async () => {
        lateDispatched = true
        throw new Error('Late call')
      }
      await assert.rejects(held.execute(input), /closed|lease/i)
      assert.equal(lateDispatched, false)
      await unchanged(f, before)
    } finally {
      release()
      await Promise.allSettled([capturing, operation ?? Promise.resolve()])
    }
  })
})

for (const callbackFails of [false, true]) {
  test(`unconfirmed execution exit retains leased files even when callback failure is ${callbackFails}`, async () => {
    await fixture(options('illustrious', 'img2img'), async (f) => {
      const before = await state(f)
      const input = executionOptions(f, 'illustrious', [])
      let entered!: () => void
      const didEnter = new Promise<void>((resolve) => {
        entered = resolve
      })
      let release!: () => void
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      let stage = ''
      let operation: ReturnType<CapturedSmartPatchGenerationInput['execute']> | undefined
      input.generationWorker.executeSmartPatch = async (request) => {
        // Controlled exit-confirmation fault; there is deliberately no live child
        // behind this adapter. Physical unkillable-child behavior is not claimed.
        stage = request.output.stagingRoot
        entered()
        await released
        throw Object.assign(new Error('Controlled unconfirmed physical worker exit'), {
          code: 'WORKER_EXIT_UNCONFIRMED',
        })
      }
      const capturing = f.service.withCapturedSmartPatchGenerationInput(
        f.tabId,
        f.patch.id,
        async (capture) => {
          operation = capture.execute(input)
          void operation.catch(() => undefined)
          await didEnter
          if (callbackFails) {
            throw new Error('Intentional callback failure before unconfirmed exit')
          }
          return await operation
        },
      )
      void capturing.catch(() => undefined)
      try {
        await Promise.race([
          didEnter,
          capturing.then(() => assert.fail('Missing controlled worker witness')),
        ])
        release()
        await assert.rejects(
          capturing,
          callbackFails ? /Intentional callback failure/ : /unconfirmed/i,
        )
        await assert.rejects(operation!, /unconfirmed/i)
        assert.ok(existsSync(stage), 'Unconfirmed worker exit must preserve every leased file')
        assert.ok((await readdir(stage)).includes('latent-keep-mask.png'))
        assert.ok((await readdir(stage)).includes('model-source.png'))
      } finally {
        release()
        await Promise.allSettled([capturing, operation ?? Promise.resolve()])
        // The controlled adapter is now settled and has no child. Dispose only
        // this test's retained capture root; no arbitrary artifact sweep.
        for (const entry of await scratchEntries(f.scratch)) {
          await rm(path.join(f.scratch, entry), { force: true, recursive: true })
        }
      }
      await unchanged(f, before)
    })
  })
}

// The additional world boundary executes four native family cases. Ownership/fault cases below
// use the explicitly declared literal RGB collaborator instead of repeatedly loading native models.
for (const family of ['illustrious', 'anima'] as const) {
  for (const loss of [false, true]) {
    const mode = loss ? 'inpaint' : 'img2img'
    test(`actual ${family} ${mode} composes detached world RGBA${loss ? ' after latent coverage disappears' : ''} without touching durable owners`, async () => {
      const setup = options(family, mode, loss)
      await fixture(setup, async (f) => {
        const before = await state(f)
        const observed: Observation[] = []
        const composed: SmartPatchOutputCompositionPayload[] = []
        const result = await f.service.withCapturedSmartPatchGenerationInput(
          f.tabId,
          f.patch.id,
          (capture) =>
            capture.executeAndCompose(worldExecutionOptions(f, family, observed, composed)),
        )
        assert.equal(observed.length, 1)
        assertNativeExecution(observed[0], family, mode)
        assert.equal(composed.length, 1, 'A real serialized CPU composition must complete')
        assert.deepEqual(
          [composed[0].image.width, composed[0].image.height],
          [64, 64],
          'Composition receives actual processing-size RGB rather than an invented world target',
        )
        assert.deepEqual(
          [composed[0].contributionMask.width, composed[0].contributionMask.height],
          [setup.bbox.width, setup.bbox.height],
        )
        assert.equal(result.output.width, 64)
        assert.equal(result.output.height, 64)
        assert.equal(result.output.bytes[25], 2, 'The processing result remains independent RGB')
        const { expectedAlpha, worldAlpha } = assertWorldContribution(result, setup.bbox)
        if (loss) {
          const keep = result.conditioning.latentKeepMask
          assert.ok(
            decodeDerivedProjectMaskPng(keep.bytes, keep).every((alpha) => alpha === 255),
            'This case actually reaches fully protected latent KEEP',
          )
          assert.equal(result.conditioning.latentMaskHasCoverage, false)
          assert.equal(result.mode, 'inpaint', 'World output must preserve frozen INP mode')
          assert.equal(expectedAlpha[19 * setup.bbox.width + 17], 255)
          assert.equal(worldAlpha[19 * setup.bbox.width + 17], 255)
          assert.ok(worldAlpha.includes(0))
        } else {
          assert.ok(worldAlpha.every((alpha) => alpha === 255))
        }
        assert.equal(result.item.seed, 0)
        assert.ok(!existsSync(composed[0].output.stagingRoot))
        // The returned buffers remain complete after the actual stage has been removed.
        assert.equal(digest(result.worldContribution.bytes), result.worldContribution.sha256)
        await unchanged(f, before)
      })
    })
  }
}

test('world final consumption refuses truthful wrong-alpha PNG metadata outside the composition adapter', async () => {
  const setup = options('illustrious', 'img2img')
  await fixture(setup, async (f) => {
    const before = await state(f)
    const input = literalWorldExecutionOptions(f)
    const actual = input.outputWorker.composeSmartPatchOutput
    let replaced = false
    input.outputWorker.composeSmartPatchOutput = async (request) => {
      const result = await actual(request)
      const profile = await readFile(path.join(WORKER_SOURCE, 'imagegen_worker/srgb.icc'))
      const bytes = sourcePng(
        profile,
        request.contributionMask.width,
        request.contributionMask.height,
        Array.from(
          { length: request.contributionMask.width * request.contributionMask.height },
          () => [23, 47, 91, 0],
        ).flat(),
      )
      await writeFile(request.pngPath, bytes)
      replaced = true
      assert.ok(
        decodeTargetPngAlpha(bytes, setup.bbox.width, setup.bbox.height).every(
          (alpha) => alpha === 0,
        ),
      )
      assert.equal(actualIccHash(bytes), IGS_SRGB_ICC_SHA256)
      return {
        output: { ...result.output, byteSize: bytes.length, sha256: digest(bytes) },
      }
    }
    await assert.rejects(
      f.service.withCapturedSmartPatchGenerationInput(f.tabId, f.patch.id, (capture) =>
        capture.executeAndCompose(input),
      ),
      /alpha.*frozen|contribution.*alpha/i,
    )
    assert.equal(replaced, true, 'The bad but valid actual PNG reached the independent Main reader')
    await unchanged(f, before)
    const control = await f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      (capture) => capture.executeAndCompose(literalWorldExecutionOptions(f)),
    )
    assertWorldContribution(control, setup.bbox)
    await unchanged(f, before)
  })
})

test('world execution captures the output method and owned geometry before preparation yields', async () => {
  const setup = options('illustrious', 'inpaint')
  await fixture(setup, async (f) => {
    const composed: SmartPatchOutputCompositionPayload[] = []
    const input = literalWorldExecutionOptions(f, composed)
    const actual = input.preparationWorker.composeTarget
    let lateMethodCalled = false
    let afterEdit!: Awaited<ReturnType<typeof state>>
    input.preparationWorker.composeTarget = async (request) => {
      input.outputWorker.composeSmartPatchOutput = async () => {
        lateMethodCalled = true
        throw new Error('Late output method must not run')
      }
      input.item.seed = 99
      input.item.prompts.positive = 'Late world prompt alias'
      await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, {
        kind: 'bounding-box',
        rect: { height: 48, width: 40, x: 300, y: -600 },
      })
      await f.service.flushAutosave(f.tabId)
      afterEdit = await state(f)
      return await actual(request)
    }
    const result = await f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      (capture) => {
        capture.context.bbox = { height: 1, width: 1, x: 0, y: 0 }
        capture.context.maskSettings.blur = 99
        capture.maskPngBytes?.fill(0)
        capture.document.layers = []
        return capture.executeAndCompose(input)
      },
    )
    assert.equal(lateMethodCalled, false)
    assert.equal(composed.length, 1)
    assertWorldContribution(result, setup.bbox)
    assert.equal(result.context.maskSettings.blur, 0)
    assert.equal(result.item.seed, 0)
    assert.equal(result.item.prompts.positive, '(bright hair:2)')
    await unchanged(f, afterEdit)
  })
})

test('the full lease drains admitted world composition after callback failure and rejects escaped calls', async () => {
  const setup = options('illustrious', 'img2img')
  await fixture(setup, async (f) => {
    const before = await state(f)
    const input = literalWorldExecutionOptions(f)
    const actual = input.outputWorker.composeSmartPatchOutput
    let entered!: () => void
    const didEnter = new Promise<void>((resolve) => {
      entered = resolve
    })
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let held!: CapturedSmartPatchGenerationInput
    let stage = ''
    let callbackSettled = false
    let operation: ReturnType<CapturedSmartPatchGenerationInput['executeAndCompose']> | undefined
    input.outputWorker.composeSmartPatchOutput = async (request) => {
      stage = request.stagingRoot
      entered()
      await released
      assert.ok(existsSync(stage), 'The admitted world step retains its processing and mask files')
      assert.ok(existsSync(request.image.path))
      assert.ok(existsSync(request.contributionMask.path))
      return await actual(request)
    }
    const capturing = f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      async (capture) => {
        held = capture
        operation = capture.executeAndCompose(input)
        void operation.catch(() => undefined)
        await didEnter
        throw new Error('Intentional callback failure during world composition')
      },
    )
    void capturing.then(
      () => {
        callbackSettled = true
      },
      () => {
        callbackSettled = true
      },
    )
    try {
      await Promise.race([
        didEnter,
        capturing.then(() => assert.fail('Capture settled before the world-step witness')),
      ])
      // The independent world-step witness has fired and its gate is still
      // closed. Give erroneous early cleanup time to settle before releasing it.
      await Promise.race([
        capturing.catch(() => undefined),
        new Promise<void>((resolve) => {
          setTimeout(resolve, 100)
        }),
      ])
      assert.equal(callbackSettled, false, 'The callback must wait for admitted world composition')
      assert.ok(existsSync(stage))
      release()
      await assert.rejects(capturing, /Intentional callback failure/)
      assert.ok(operation)
      const result = await operation
      assertWorldContribution(result, setup.bbox)
      assert.equal(existsSync(stage), false)
      let lateDispatched = false
      input.outputWorker.composeSmartPatchOutput = async () => {
        lateDispatched = true
        throw new Error('Late world call')
      }
      await assert.rejects(held.executeAndCompose(input), /closed|lease/i)
      assert.equal(lateDispatched, false)
      await unchanged(f, before)
    } finally {
      release()
      await Promise.allSettled([capturing, operation ?? Promise.resolve()])
    }
  })
})

for (const callbackFails of [false, true]) {
  test(`unconfirmed world worker exit retains the whole input lease when callback failure is ${callbackFails}`, async () => {
    await fixture(options('illustrious', 'img2img'), async (f) => {
      const before = await state(f)
      const input = literalWorldExecutionOptions(f)
      let entered!: () => void
      const didEnter = new Promise<void>((resolve) => {
        entered = resolve
      })
      let release!: () => void
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      let stage = ''
      let operation: ReturnType<CapturedSmartPatchGenerationInput['executeAndCompose']> | undefined
      input.outputWorker.composeSmartPatchOutput = async (request) => {
        // Declared failure collaborator; it owns no live child. OS exit confirmation is tested
        // in the real transport client suite, not simulated by this capture retention case.
        stage = request.stagingRoot
        entered()
        await released
        throw Object.assign(new Error('Controlled unconfirmed world worker exit'), {
          code: 'WORKER_EXIT_UNCONFIRMED',
        })
      }
      const capturing = f.service.withCapturedSmartPatchGenerationInput(
        f.tabId,
        f.patch.id,
        async (capture) => {
          operation = capture.executeAndCompose(input)
          void operation.catch(() => undefined)
          await didEnter
          if (callbackFails) {
            throw new Error('Intentional callback failure before unconfirmed world exit')
          }
          return await operation
        },
      )
      void capturing.catch(() => undefined)
      try {
        await Promise.race([
          didEnter,
          capturing.then(() => assert.fail('Missing world worker witness')),
        ])
        release()
        await assert.rejects(
          capturing,
          callbackFails ? /Intentional callback failure/ : /unconfirmed/i,
        )
        await assert.rejects(operation!, /unconfirmed/i)
        assert.ok(existsSync(stage))
        const retained = await readdir(stage)
        for (const name of [
          'latent-keep-mask.png',
          'model-source.png',
          'model-result.png',
          'conditioned-world-contribution-mask.png',
        ]) {
          assert.ok(retained.includes(name), `Retain ${name} until physical exit is confirmed`)
        }
      } finally {
        release()
        await Promise.allSettled([capturing, operation ?? Promise.resolve()])
        // The fault collaborator has settled and never owned a child. Dispose only this fixture.
        for (const entry of await scratchEntries(f.scratch)) {
          await rm(path.join(f.scratch, entry), { force: true, recursive: true })
        }
      }
      await unchanged(f, before)
    })
  })
}

// This new boundary never calls a native family executor. Its declared catalog resolver checks
// actual tiny fixture files; all source composition, mask/model-source preparation and material
// validation use the production Main path and real serialized CPU requests.
for (const family of ['illustrious', 'anima'] as const) {
  for (const mode of ['txt2img', 'inpaint'] as const) {
    test(`actual ${family} ${mode} prepares detached batch inputs once without inference or durable side effects`, async () => {
      const setup = options(family, mode)
      if (mode === 'txt2img') {
        setup.bbox = { ...setup.bbox, height: 79, width: 95 }
      }
      await fixture(setup, async (f) => {
        const before = await state(f)
        const input = batchInputOptions(f, family)
        const frozenItems = structuredClone(input.items)
        const observed = observePreparation(input)
        const material = await f.service.withCapturedSmartPatchGenerationInput(
          f.tabId,
          f.patch.id,
          (capture) => capture.prepareBatchInput(input),
        )
        assert.deepEqual(observed.counts, {
          compose: 1,
          condition: 1,
          modelSource: mode === 'txt2img' ? 0 : 1,
          prepare: 1,
        })
        assert.equal(observed.stages.length, 1)
        assertDetachedBatchInput(material, setup, frozenItems, observed.stages[0])
        if (f.maskBytes) {
          assert.ok(
            material.files['authored-mask.png'].equals(f.maskBytes),
            'The authored mask survives preparation byte for byte',
          )
        }
        assert.equal(material.manifest.context.generationDraft.seed.value, 0)
        for (const [index, entry] of material.manifest.items.entries()) {
          assert.equal(entry.inference.sampling.seed, frozenItems[index].seed)
          if (entry.family === 'illustrious') {
            assert.deepEqual(entry.inference.prompts, frozenItems[index].prompts)
          } else {
            assert.equal(
              entry.inference.prompts.positive.cleanedText,
              index === 0 ? 'bright hair' : 'quiet sky',
            )
            assert.equal(entry.inference.prompts.positive.spans[0]?.weight, index === 0 ? 2 : 0.5)
          }
        }
        await unchanged(f, before)
      })
    })
  }
}

test('batch input preparation freezes every concrete item and collaborator before the first CPU await', async () => {
  const setup = options('illustrious', 'inpaint')
  await fixture(setup, async (f) => {
    const input = batchInputOptions(f, 'illustrious')
    const frozenItems = structuredClone(input.items)
    const observed = observePreparation(input)
    const actual = input.preparationWorker.composeTarget
    let lateMethodCalled = false
    let afterEdit!: Awaited<ReturnType<typeof state>>
    input.preparationWorker.composeTarget = async (request) => {
      input.items[0].seed = 99
      input.items[0].prompts.positive = 'Changed concrete item alias'
      input.items = []
      input.preparationWorker.conditionSmartPatch = async () => {
        lateMethodCalled = true
        throw new Error('Late CPU collaborator must not run')
      }
      input.modelService.resolveVerifiedGenerationCheckpointForPlan = async () => {
        lateMethodCalled = true
        throw new Error('Late model collaborator must not run')
      }
      await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, {
        kind: 'internal-resolution',
        size: { height: 128, width: 128 },
      })
      await f.service.flushAutosave(f.tabId)
      afterEdit = await state(f)
      return await actual(request)
    }
    const material = await f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      (capture) => {
        capture.context.bbox.width = 1
        capture.context.generationDraft.sampling.steps = 99
        capture.document.layers = []
        capture.maskPngBytes?.fill(0)
        return capture.prepareBatchInput(input)
      },
    )
    assert.equal(lateMethodCalled, false)
    assert.deepEqual(observed.counts, { compose: 1, condition: 1, modelSource: 1, prepare: 1 })
    assertDetachedBatchInput(material, setup, frozenItems, observed.stages[0])
    assert.equal(material.manifest.context.generationDraft.sampling.steps, 3)
    await unchanged(f, afterEdit)
  })
})

test('a later concrete item resource refusal returns no prepared prefix and preserves the single execution neighbor', async () => {
  const setup = options('illustrious', 'img2img')
  await fixture(setup, async (f) => {
    const before = await state(f)
    const input = batchInputOptions(f, 'illustrious')
    const observed = observePreparation(input)
    let checkedItems = 0
    input.modelService.assertNoUnboundGenerationEmbeddings = async () => {
      checkedItems++
      if (checkedItems === 2) {
        throw new Error('Controlled refusal while qualifying the later concrete item')
      }
    }
    let delivered = false
    await assert.rejects(
      f.service.withCapturedSmartPatchGenerationInput(f.tabId, f.patch.id, async (capture) => {
        const result = await capture.prepareBatchInput(input)
        delivered = true
        return result
      }),
      /Controlled refusal while qualifying the later concrete item/,
    )
    assert.equal(checkedItems, 2, 'The first concrete item qualified before the later item refused')
    assert.equal(delivered, false, 'A valid prefix must never escape a failed batch preparation')
    assert.deepEqual(observed.counts, { compose: 1, condition: 1, modelSource: 1, prepare: 1 })
    assert.ok(!existsSync(observed.stages[0]))
    await unchanged(f, before)
    const control = await f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      (capture) => capture.execute(literalWorldExecutionOptions(f)),
    )
    assert.equal(
      control.output.bytes[25],
      2,
      'Existing single execution still returns processing RGB',
    )
    assert.deepEqual([control.output.width, control.output.height], [64, 64])
    assert.equal(control.item.seed, 0)
    await unchanged(f, before)
  })
})

test('batch input preparation refuses empty oversized and invalid later items before CPU work while cap32 shares one source', async () => {
  const setup = options('illustrious', 'img2img')
  await fixture(setup, async (f) => {
    const before = await state(f)
    const item = { prompts: { negative: '', positive: 'bright hair' }, seed: 0 }
    const invalidBatches = [
      [],
      Array.from({ length: 33 }, () => structuredClone(item)),
      [item, { ...item, seed: -1 }],
    ]
    for (const items of invalidBatches) {
      const input = batchInputOptions(f, 'illustrious', items)
      let composed = false
      input.preparationWorker.composeTarget = async () => {
        composed = true
        throw new Error('Invalid concrete batch must refuse before CPU work')
      }
      await assert.rejects(
        f.service.withCapturedSmartPatchGenerationInput(f.tabId, f.patch.id, (capture) =>
          capture.prepareBatchInput(input),
        ),
        { code: 'GENERATION_PARAMETER_UNSUPPORTED' },
      )
      assert.equal(composed, false)
      await unchanged(f, before)
    }
    const input = batchInputOptions(
      f,
      'illustrious',
      Array.from({ length: 32 }, (_, seed) => ({ prompts: { ...item.prompts }, seed })),
    )
    const observed = observePreparation(input)
    let resourceQualifications = 0
    input.modelService = modelService('illustrious', async () => {
      resourceQualifications++
    })
    let concreteChecks = 0
    input.modelService.assertNoUnboundGenerationEmbeddings = async () => {
      concreteChecks++
    }
    const material = await f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      (capture) => capture.prepareBatchInput(input),
    )
    assert.equal(material.manifest.items.length, 32)
    assert.equal(
      resourceQualifications,
      2,
      'One initial qualification and one final recheck serve every identical exact selection',
    )
    assert.equal(
      concreteChecks,
      32,
      'Concrete-prompt embedding checks are never memoized across items',
    )
    assert.deepEqual(observed.counts, { compose: 1, condition: 1, modelSource: 1, prepare: 1 })
    assertDetachedBatchInput(material, setup, input.items, observed.stages[0])
    await unchanged(f, before)
  })
})

test('the complete batch input lease drains later resource qualification after callback failure and rejects escaped calls', async () => {
  const setup = options('illustrious', 'inpaint')
  await fixture(setup, async (f) => {
    const before = await state(f)
    const input = batchInputOptions(f, 'illustrious')
    const observed = observePreparation(input)
    let entered!: () => void
    const didEnter = new Promise<void>((resolve) => {
      entered = resolve
    })
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let qualifications = 0
    input.modelService = modelService('illustrious', async () => {
      qualifications++
      if (qualifications === 2) {
        entered()
        await released
        assert.ok(
          existsSync(observed.stages[0]),
          'The batch lease retains prepared inputs through its final resource qualification',
        )
      }
    })
    let held!: CapturedSmartPatchGenerationInput
    let operation: ReturnType<CapturedSmartPatchGenerationInput['prepareBatchInput']> | undefined
    let callbackSettled = false
    const capturing = f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      async (capture) => {
        held = capture
        operation = capture.prepareBatchInput(input)
        void operation.catch(() => undefined)
        await didEnter
        throw new Error('Intentional callback failure during batch input preparation')
      },
    )
    void capturing.then(
      () => {
        callbackSettled = true
      },
      () => {
        callbackSettled = true
      },
    )
    try {
      await Promise.race([
        didEnter,
        capturing.then(() => assert.fail('Missing final resource qualification witness')),
      ])
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100)
      })
      assert.equal(
        callbackSettled,
        false,
        'The batch input lease must remain pending while admitted resource work is blocked',
      )
      assert.ok(existsSync(observed.stages[0]))
      release()
      await assert.rejects(capturing, /Intentional callback failure/)
      assert.ok(operation)
      const material = await operation
      assertDetachedBatchInput(material, setup, input.items, observed.stages[0])
      await assert.rejects(held.prepareBatchInput(input), /closed|lease/i)
      assert.equal(qualifications, 2)
      await unchanged(f, before)
    } finally {
      release()
      await Promise.allSettled([capturing, operation ?? Promise.resolve()])
    }
  })
})

for (const callbackFails of [false, true]) {
  test(`unconfirmed batch preparation exit retains the complete input lease when callback failure is ${callbackFails}`, async () => {
    await fixture(options('illustrious', 'inpaint'), async (f) => {
      const before = await state(f)
      const input = batchInputOptions(f, 'illustrious')
      const observed = observePreparation(input)
      let entered!: () => void
      const didEnter = new Promise<void>((resolve) => {
        entered = resolve
      })
      let release!: () => void
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      input.preparationWorker.conditionSmartPatch = async () => {
        // Controlled settled adapter with no live child; physical unkillable behavior is not claimed.
        entered()
        await released
        throw Object.assign(new Error('Controlled unconfirmed preparation child exit'), {
          code: 'WORKER_EXIT_UNCONFIRMED',
        })
      }
      let operation: ReturnType<CapturedSmartPatchGenerationInput['prepareBatchInput']> | undefined
      const capturing = f.service.withCapturedSmartPatchGenerationInput(
        f.tabId,
        f.patch.id,
        async (capture) => {
          operation = capture.prepareBatchInput(input)
          void operation.catch(() => undefined)
          await didEnter
          if (callbackFails) {
            throw new Error('Intentional callback failure before unconfirmed preparation')
          }
          return await operation
        },
      )
      void capturing.catch(() => undefined)
      try {
        await Promise.race([
          didEnter,
          capturing.then(() => assert.fail('Missing preparation worker witness')),
        ])
        release()
        await assert.rejects(
          capturing,
          callbackFails ? /Intentional callback failure/ : /unconfirmed/i,
        )
        await assert.rejects(operation!, /unconfirmed/i)
        const stage = observed.stages[0]
        assert.ok(existsSync(stage), 'Unconfirmed CPU preparation keeps its leased inputs')
        assert.ok(existsSync(path.join(stage, 'processing-source.png')))
        assert.ok(existsSync(path.join(stage, 'world-mask.png')))
      } finally {
        release()
        await Promise.allSettled([capturing, operation ?? Promise.resolve()])
        // No child exists behind the controlled fault. Remove only this settled fixture's retained roots.
        for (const entry of await scratchEntries(f.scratch)) {
          await rm(path.join(f.scratch, entry), { force: true, recursive: true })
        }
      }
      await unchanged(f, before)
    })
  })
}

test('private batch preparation retains readable hidden locked input without enabling public generation', async () => {
  const setup = options('illustrious', 'inpaint')
  await fixture(setup, async (f) => {
    await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, {
      kind: 'visibility',
      visible: false,
    })
    await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, { kind: 'lock', locked: true })
    await f.service.flushAutosave(f.tabId)
    const before = await state(f)
    const input = batchInputOptions(f, 'illustrious')
    const observed = observePreparation(input)
    const material = await f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      (capture) => capture.prepareBatchInput(input),
    )
    assert.equal(material.manifest.context.locked, true)
    assert.equal(material.manifest.context.visible, false)
    assertDetachedBatchInput(material, setup, input.items, observed.stages[0])
    await unchanged(f, before)
  })
})

for (const field of ['prediction-type', 'noise-profile'] as const) {
  test(`batch input final qualification refuses same-SHA checkpoint ${field} drift without returning a prefix`, async () => {
    const setup = options('illustrious', 'inpaint')
    await fixture(setup, async (f) => {
      const before = await state(f)
      const input = batchInputOptions(f, 'illustrious')
      const observed = observePreparation(input)
      const original = input.modelService.resolveVerifiedGenerationCheckpointForPlan
      let qualifications = 0
      input.modelService.resolveVerifiedGenerationCheckpointForPlan = async (saved) => {
        const result = await original(saved)
        qualifications++
        if (qualifications === 1) {
          return result
        }
        if (field === 'prediction-type') {
          return { ...result, reference: { ...result.reference, predictionType: 'v_prediction' } }
        }
        return {
          ...result,
          noiseProfile: {
            ...defaultIllustriousNoiseProfile(),
            rescaleBetasZeroSnr: true,
            timestepSpacing: 'trailing',
          },
        }
      }
      let delivered = false
      await assert.rejects(
        f.service.withCapturedSmartPatchGenerationInput(f.tabId, f.patch.id, async (capture) => {
          const result = await capture.prepareBatchInput(input)
          delivered = true
          return result
        }),
        { code: 'GENERATION_RESOURCE_CHANGED' },
      )
      assert.equal(qualifications, 2, 'Final real qualification follows one shared exact snapshot')
      assert.equal(delivered, false)
      assert.deepEqual(observed.counts, { compose: 1, condition: 1, modelSource: 1, prepare: 1 })
      assert.ok(!existsSync(observed.stages[0]))
      await unchanged(f, before)
    })
  })
}

test('actual batch material retains INP and its world core when latent coverage is fully protected', async () => {
  const setup = options('illustrious', 'inpaint', true)
  await fixture(setup, async (f) => {
    const before = await state(f)
    const input = batchInputOptions(f, 'illustrious')
    const observed = observePreparation(input)
    const material = await f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      (capture) => capture.prepareBatchInput(input),
    )
    assertDetachedBatchInput(material, setup, input.items, observed.stages[0])
    const keep = material.manifest.files['latent-keep-mask.png']
    assert.ok(
      decodeDerivedProjectMaskPng(material.files['latent-keep-mask.png'], keep).every(
        (alpha) => alpha === 255,
      ),
    )
    assert.equal(material.manifest.latentMaskHasCoverage, false)
    assert.equal(material.manifest.mode, 'inpaint')
    const contribution = decodeDerivedProjectMaskPng(
      material.files['final-contribution-mask.png'],
      material.manifest.files['final-contribution-mask.png'],
    )
    assert.equal(
      contribution[19 * setup.bbox.width + 17],
      255,
      'Loss on the latent grid must not erase the original world edit core',
    )
    assert.ok(contribution.includes(0))
    await unchanged(f, before)
  })
})

for (const family of ['illustrious', 'anima'] as const) {
  test(`actual ${family} captured CPU batch material reloads from a fresh durable bundle owner after capture cleanup`, async () => {
    const setup = options(family, 'inpaint')
    await fixture(setup, async (f) => {
      const before = await state(f)
      const input = batchInputOptions(f, family)
      const observed = observePreparation(input)
      const material = await f.service.withCapturedSmartPatchGenerationInput(
        f.tabId,
        f.patch.id,
        (capture) => capture.prepareBatchInput(input),
      )
      assertDetachedBatchInput(material, setup, input.items, observed.stages[0])
      const expectedManifest = structuredClone(material.manifest)
      const expectedFiles = Object.fromEntries(
        Object.entries(material.files).map(([name, bytes]) => [name, Buffer.from(bytes)]),
      )
      // The repository only sees detached material after the real capture lease has been removed.
      const dataRoot = path.dirname(f.scratch)
      const published = await new SmartPatchInputBundleRepository(dataRoot).publish(material)
      assert.equal(published.manifest.kind, 'smart-patch-frozen-input')
      assert.equal(published.manifest.items.length, 2)
      const committedManifest = await readFile(
        path.join(
          dataRoot,
          'generation-prepared-inputs',
          'smart-patch',
          published.id,
          'manifest.json',
        ),
      )
      assert.equal(published.manifestSha256, digest(committedManifest))
      material.files['source.png'].fill(0)
      published.files['latent-keep-mask.png'].fill(0)
      const fresh = new SmartPatchInputBundleRepository(dataRoot)
      const loaded = await fresh.load(published.id)
      assert.deepEqual(loaded.manifest, expectedManifest)
      assert.equal(loaded.manifestSha256, published.manifestSha256)
      assert.deepEqual(Object.keys(loaded.files).sort(), Object.keys(expectedFiles).sort())
      for (const [name, bytes] of Object.entries(expectedFiles)) {
        assert.ok(
          loaded.files[name].equals(bytes),
          `Fresh reload preserves actual ${name} bytes after caller aliases change`,
        )
      }
      assert.equal(existsSync(observed.stages[0]), false)
      await unchanged(f, before)
      await fresh.discard(loaded.id, loaded.manifestSha256)
      await assert.rejects(new SmartPatchInputBundleRepository(dataRoot).load(loaded.id), {
        code: 'SMART_PATCH_INPUT_NOT_FOUND',
      })
      await unchanged(f, before)
    })
  })
}
