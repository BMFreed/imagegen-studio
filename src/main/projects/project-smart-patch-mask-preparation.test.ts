import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  createEmptyProjectDocumentV1,
  type IgsRasterLayerV1,
  type IgsRectV1,
  type IgsSmartPatchLayerV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { crc32, deflateSync } from 'node:zlib'

import type { CapturedSmartPatchGenerationInput } from './project-smart-patch-generation-input.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { encodeProjectMaskPng } from './project-mask.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { composeTargetWithTransport, prepareSmartPatchWithTransport } from './worker-client.js'

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../../..')
const WORKER_SOURCE = path.join(REPOSITORY_ROOT, 'worker-python/src')
const PYTHON = path.join(REPOSITORY_ROOT, 'worker-python/.venv/bin/python')
const ORACLE = path.join(import.meta.dirname, 'test-fixtures/smart-patch-preparation-oracle.py')
const execFileAsync = promisify(execFile)
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

type CpuObservation = {
  compositorPath: string
  decoded: Record<
    string,
    {
      format: string
      height: number
      iccSha256: string | null
      mode: string
      rgbaBase64: string
      width: number
    }
  >
  loadedMlModules: string[]
  pillowVersion: string
  preparationPath: string
  response: Record<string, unknown>
}

type FixtureOptions = {
  bbox: IgsRectV1
  internal?: { height: number; width: number }
  mask: { alpha: readonly number[]; bounds: IgsRectV1 } | null
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

/** Input-only PNG encoding. No crop, resize, compositor or output oracle lives here. */
function sourcePng(
  profile: Buffer,
  width: number,
  height: number,
  rgba: readonly number[],
): Buffer {
  assert.equal(rgba.length, width * height * 4)
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
  header[9] = 6
  const rows = Buffer.alloc(height * (width * 4 + 1))
  for (let row = 0; row < height; row++) {
    rows.set(rgba.slice(row * width * 4, (row + 1) * width * 4), row * (width * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('iCCP', Buffer.concat([Buffer.from('srgb\0\0'), deflateSync(profile)])),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
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
  const root = await mkdtemp(path.join(tmpdir(), 'igs-patch-real-preparation-'))
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
    const document = createEmptyProjectDocumentV1({ title: 'Literal private Patch preparation' })
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
      maskSettings: { blur: 31, padding: 5 },
      name: 'Owned B preparation',
      opacity: 1,
      rasterSubLayers: [],
      visible: true,
    }
    patch.generationDraft.positivePrompt.text = 'frozen owned prompt'
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

async function actualCpu(
  type: 'compose-target' | 'prepare-smart-patch',
  payload: object,
  observed: CpuObservation[],
  corrupt?: 'processing-mask-rgb',
): Promise<Record<string, unknown>> {
  assert.ok(existsSync(PYTHON), 'The existing checkout CPU Python environment is required')
  const execution = execFileAsync(PYTHON, ['-I', '-B', ORACLE, WORKER_SOURCE], {
    cwd: REPOSITORY_ROOT,
    maxBuffer: 256 * 1024,
    timeout: 10_000,
  })
  assert.ok(execution.child.stdin)
  execution.child.stdin.end(
    JSON.stringify({
      corrupt,
      request: {
        ...payload,
        protocolVersion: '1',
        requestId: 'actual-cpu-patch-preparation',
        type,
      },
    }),
  )
  const { stderr, stdout } = await execution
  assert.equal(stderr, '')
  const result = JSON.parse(stdout) as CpuObservation
  assert.equal(result.compositorPath, path.join(WORKER_SOURCE, 'imagegen_worker/compositor.py'))
  assert.equal(
    result.preparationPath,
    path.join(WORKER_SOURCE, 'imagegen_worker/smart_patch_preparation.py'),
  )
  assert.equal(result.pillowVersion, '12.2.0')
  assert.deepEqual(result.loadedMlModules, [])
  observed.push(result)
  return result.response
}

function cpuWorker(
  f: Fixture,
  observed: CpuObservation[],
  options: {
    corrupt?: 'processing-mask-rgb'
    transformReply?: (response: Record<string, unknown>) => void
  } = {},
): Pick<ProjectWorkerClient, 'composeTarget' | 'prepareSmartPatch'> {
  return {
    composeTarget: (input) =>
      composeTargetWithTransport(input, f.scratch, (payload) =>
        actualCpu('compose-target', payload, observed),
      ),
    prepareSmartPatch: (input) =>
      prepareSmartPatchWithTransport(input, f.scratch, async (payload) => {
        const response = await actualCpu('prepare-smart-patch', payload, observed, options.corrupt)
        options.transformReply?.(response)
        return response
      }),
  }
}

function actualRgba(
  observed: CpuObservation[],
  plane: string,
  index = observed.length - 1,
): Buffer {
  const decoded = observed[index].decoded[plane]
  assert.ok(decoded)
  assert.equal(decoded.format, 'PNG')
  assert.equal(decoded.mode, 'RGBA')
  return Buffer.from(decoded.rgbaBase64, 'base64')
}

function expectNumericMask(
  observed: CpuObservation[],
  plane: 'effectiveMask' | 'processingMask',
  alpha: readonly number[],
) {
  const observation = observed.at(-1)
  assert.ok(observation, 'Numeric mask requires an actual CPU response')
  const decoded = observation.decoded[plane]
  assert.ok(decoded, 'The actual CPU response must contain its numeric plane')
  assert.equal(decoded.iccSha256, null, 'Numeric generate coverage has no image ICC metadata')
  const expected = Buffer.from(alpha.flatMap((value) => [255, 255, 255, value]))
  assert.ok(
    actualRgba(observed, plane).equals(expected),
    `Actual ${plane} pixels differ from the literal alpha oracle`,
  )
}

async function state(f: Fixture) {
  return {
    document: structuredClone(f.service.getOpenDocumentForAcceptance(f.tabId)!.document),
    file: await readFile(f.packagePath),
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
  assert.ok(afterFile.equals(beforeFile), 'Private preparation cannot replace the saved .igs')
  assert.deepEqual(afterState, beforeState)
  assert.deepEqual(await scratchEntries(f.scratch), [])
}

const ASYMMETRIC_MASK = {
  alpha: [255, 64, 0, 0, 128, 255],
  bounds: { height: 2, width: 3, x: -2, y: -1 },
}

// Boundary: actual imported ProjectService -> Main verifier -> actual CPU protocol/Pillow.
// Oracle: literal asymmetric world rows and source pixels; no implementation of crop/resize here.
// Controls: identity, null/disjoint/hole neighbors. Mutations: invert generate coverage, wrong
// world offset, use original mask presence, threshold soft bytes or include the red layer above.
test('actual private preparation clips a negative-origin soft mask exactly and preserves immutable original inputs', async () => {
  await fixture(
    { bbox: { height: 3, width: 3, x: -1, y: -2 }, mask: ASYMMETRIC_MASK },
    async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const result = await f.service.withCapturedSmartPatchGenerationInput(
        f.tabId,
        f.patch.id,
        (capture) => capture.prepareInput(cpuWorker(f, observed)),
      )
      assert.equal(result.mode, 'inpaint')
      assert.equal(result.sourceAlpha, 'opaque')
      assert.equal(result.processingMaskHasCoverage, true)
      assert.deepEqual(result.context.bbox, { height: 3, width: 3, x: -1, y: -2 })
      assert.deepEqual(result.context.internalResolution, { height: 3, width: 3 })
      assert.deepEqual(result.context.maskSettings, { blur: 31, padding: 5 })
      assert.deepEqual(result.context.mask, f.patch.mask)
      assert.deepEqual(result.context.sourceLayerIds, [f.source.id])
      assert.equal(result.context.lastActualSeedSnapshot, 0)
      assert.ok(result.maskPngBytes?.equals(f.maskBytes!))
      assert.equal(result.effectiveMask.sha256, digest(result.effectiveMask.bytes))
      assert.equal(result.processingSource.sha256, digest(result.processingSource.bytes))
      assert.equal(result.processingMask.sha256, digest(result.processingMask.bytes))
      assert.equal(result.processingSource.colorSpace, 'srgb')
      assert.equal(result.processingSource.iccSha256, IGS_SRGB_ICC_SHA256)
      expectNumericMask(observed, 'effectiveMask', [0, 0, 0, 64, 0, 0, 128, 255, 0])
      expectNumericMask(observed, 'processingMask', [0, 0, 0, 64, 0, 0, 128, 255, 0])
      assert.ok(
        result.effectiveMask.bytes.equals(result.processingMask.bytes),
        'Same-size numeric masks must retain exact PNG bytes',
      )
      assert.ok(
        result.source.bytes.equals(result.processingSource.bytes),
        'Same-size source preparation must retain exact source PNG bytes',
      )
      assert.ok(
        actualRgba(observed, 'processingSource').equals(
          Buffer.from(Array.from({ length: 9 }, () => [0, 255, 0, 255]).flat()),
        ),
      )
      const observation = observed.at(-1)
      assert.ok(observation)
      assert.equal(observation.decoded.processingSource.iccSha256, IGS_SRGB_ICC_SHA256)
      await unchanged(f, before)
    },
  )
})

for (const scenario of [
  {
    bbox: { height: 2, width: 2, x: 1, y: -1 },
    mask: ASYMMETRIC_MASK,
    name: 'touching the right edge',
  },
  {
    bbox: { height: 2, width: 2, x: 40, y: 70 },
    mask: ASYMMETRIC_MASK,
    name: 'fully disjoint mask',
  },
  {
    bbox: { height: 1, width: 1, x: 0, y: -1 },
    mask: ASYMMETRIC_MASK,
    name: 'overlapping bounds selecting only an unpainted hole',
  },
  { bbox: { height: 2, width: 2, x: -8, y: -9 }, mask: null, name: 'null mask' },
] as const) {
  test(`actual private preparation uses opaque source-only img2img for ${scenario.name}`, async () => {
    await fixture(scenario, async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const result = await f.service.withCapturedSmartPatchGenerationInput(
        f.tabId,
        f.patch.id,
        (capture) => capture.prepareInput(cpuWorker(f, observed)),
      )
      assert.equal(result.mode, 'img2img')
      assert.equal(result.sourceAlpha, 'opaque')
      assert.equal(result.processingMaskHasCoverage, false)
      expectNumericMask(
        observed,
        'effectiveMask',
        Array.from({ length: scenario.bbox.width * scenario.bbox.height }, () => 0),
      )
      expectNumericMask(
        observed,
        'processingMask',
        Array.from({ length: scenario.bbox.width * scenario.bbox.height }, () => 0),
      )
      if (f.maskBytes) {
        assert.ok(
          result.maskPngBytes?.equals(f.maskBytes),
          'A disjoint whole mask is retained and verified',
        )
      } else {
        assert.equal(result.maskPngBytes, null)
      }
      await unchanged(f, before)
    })
  })
}

test('one-pixel neighboring crop retains right-edge paint and chooses inpaint instead of touching-edge img2img', async () => {
  await fixture(
    { bbox: { height: 2, width: 1, x: 0, y: -1 }, mask: ASYMMETRIC_MASK },
    async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const result = await f.service.withCapturedSmartPatchGenerationInput(
        f.tabId,
        f.patch.id,
        (capture) => capture.prepareInput(cpuWorker(f, observed)),
      )
      assert.equal(result.mode, 'inpaint')
      expectNumericMask(observed, 'effectiveMask', [0, 255])
      expectNumericMask(observed, 'processingMask', [0, 255])
      await unchanged(f, before)
    },
  )
})

for (const source of [
  { alpha: 0, mode: 'txt2img', sourceAlpha: 'transparent' },
  { alpha: 128, mode: 'outpaint', sourceAlpha: 'mixed' },
] as const) {
  for (const covered of [false, true]) {
    test(`actual source alpha${source.alpha} keeps ${source.mode} with ${covered ? 'covered' : 'empty'} effective mask`, async () => {
      const bbox = { height: 2, width: 2, x: -10, y: -8 }
      await fixture(
        {
          bbox,
          mask: covered ? { alpha: [1, 64, 128, 255], bounds: bbox } : null,
          sourceAlpha: source.alpha,
        },
        async (f) => {
          const before = await state(f)
          const observed: CpuObservation[] = []
          const result = await f.service.withCapturedSmartPatchGenerationInput(
            f.tabId,
            f.patch.id,
            (capture) => capture.prepareInput(cpuWorker(f, observed)),
          )
          assert.equal(result.mode, source.mode)
          assert.equal(result.sourceAlpha, source.sourceAlpha)
          assert.equal(result.processingMaskHasCoverage, covered)
          expectNumericMask(observed, 'effectiveMask', covered ? [1, 64, 128, 255] : [0, 0, 0, 0])
          const sourcePixels = actualRgba(observed, 'processingSource')
          assert.deepEqual(
            [sourcePixels[3], sourcePixels[7], sourcePixels[11], sourcePixels[15]],
            Array.from({ length: 4 }).fill(source.alpha),
          )
          await unchanged(f, before)
        },
      )
    })
  }
}

// The literals are hand-derived from the normalized cubic kernel a=-0.5 at half-pixel centers,
// including boundary normalization/overshoot. They are not generated with the production resizer.
test('actual anisotropic internal processing uses BICUBIC for independent source and numeric alpha planes', async () => {
  const bbox = { height: 2, width: 2, x: -3, y: -4 }
  const input = [255, 0, 64, 128]
  await fixture(
    {
      bbox,
      internal: { height: 2, width: 4 },
      mask: { alpha: input, bounds: bbox },
      sourceRgba: input.flatMap((gray) => [gray, gray, gray, 255]),
    },
    async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const result = await f.service.withCapturedSmartPatchGenerationInput(
        f.tabId,
        f.patch.id,
        (capture) => capture.prepareInput(cpuWorker(f, observed)),
      )
      const expected = [255, 202, 53, 0, 58, 77, 115, 134]
      assert.equal(result.mode, 'inpaint')
      assert.deepEqual(result.context.bbox, bbox)
      assert.deepEqual(result.context.internalResolution, { height: 2, width: 4 })
      assert.deepEqual([result.effectiveMask.width, result.effectiveMask.height], [2, 2])
      assert.deepEqual([result.processingSource.width, result.processingSource.height], [4, 2])
      assert.deepEqual([result.processingMask.width, result.processingMask.height], [4, 2])
      expectNumericMask(observed, 'effectiveMask', input)
      expectNumericMask(observed, 'processingMask', expected)
      assert.ok(
        actualRgba(observed, 'processingSource').equals(
          Buffer.from(expected.flatMap((gray) => [gray, gray, gray, 255])),
        ),
        'Actual source must use independent BICUBIC gray interpolation with opaque alpha',
      )
      await unchanged(f, before)
    },
  )
})

test('world alpha1 remains inpaint when internal minification erases all numeric mask coverage', async () => {
  const bbox = { height: 8, width: 8, x: -4, y: -9 }
  await fixture(
    {
      bbox,
      internal: { height: 1, width: 1 },
      mask: { alpha: [1], bounds: { height: 1, width: 1, x: bbox.x, y: bbox.y } },
    },
    async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const result = await f.service.withCapturedSmartPatchGenerationInput(
        f.tabId,
        f.patch.id,
        (capture) => capture.prepareInput(cpuWorker(f, observed)),
      )
      assert.equal(
        result.mode,
        'inpaint',
        'World coverage must decide mode before internal quantization',
      )
      assert.equal(result.processingMaskHasCoverage, false)
      expectNumericMask(observed, 'effectiveMask', [1, ...Array.from({ length: 63 }, () => 0)])
      expectNumericMask(observed, 'processingMask', [0])
      await unchanged(f, before)
    },
  )
})

test('mutating returned preparation/context buffers cannot poison a repeated actual preparation in the same lease', async () => {
  const bbox = { height: 2, width: 2, x: -3, y: -4 }
  await fixture({ bbox, mask: { alpha: [1, 64, 128, 255], bounds: bbox } }, async (f) => {
    const before = await state(f)
    const observed: CpuObservation[] = []
    const worker = cpuWorker(f, observed)
    const mutatingAdapter: typeof worker = {
      composeTarget: worker.composeTarget,
      async prepareSmartPatch(input) {
        const result = await worker.prepareSmartPatch(input)
        input.bbox.x = 700
        input.internalResolution.height = 800
        if (input.mask) {
          input.mask.bounds.x = 900
        }
        return result
      },
    }
    await f.service.withCapturedSmartPatchGenerationInput(f.tabId, f.patch.id, async (capture) => {
      capture.context.bbox.x = 500
      capture.context.internalResolution.width = 2048
      capture.context.maskSettings.blur = 512
      capture.context.generationDraft.positivePrompt.text = 'modified exposed draft'
      capture.maskPngBytes!.fill(0)
      const first = await capture.prepareInput(mutatingAdapter)
      first.context.bbox.x = 999
      first.context.internalResolution.height = 9
      first.context.maskSettings.padding = 500
      first.maskPngBytes!.fill(0)
      first.source.bytes.fill(0)
      first.effectiveMask.bytes.fill(0)
      first.processingSource.bytes.fill(0)
      first.processingMask.bytes.fill(0)
      const second = await capture.prepareInput(worker)
      assert.deepEqual(second.context.bbox, bbox)
      assert.deepEqual(second.context.internalResolution, { height: 2, width: 2 })
      assert.deepEqual(second.context.maskSettings, { blur: 31, padding: 5 })
      assert.equal(second.context.generationDraft.positivePrompt.text, 'frozen owned prompt')
      assert.ok(second.maskPngBytes!.equals(f.maskBytes!))
      assert.equal(second.effectiveMask.sha256, digest(second.effectiveMask.bytes))
      expectNumericMask(observed, 'effectiveMask', [1, 64, 128, 255])
      expectNumericMask(observed, 'processingMask', [1, 64, 128, 255])
      assert.equal(second.mode, 'inpaint')
    })
    await unchanged(f, before)
  })
})

test('actual adapter reply metadata is frozen before asynchronous Main output reads', async () => {
  const bbox = { height: 2, width: 2, x: -3, y: -4 }
  await fixture({ bbox, mask: { alpha: [1, 64, 128, 255], bounds: bbox } }, async (f) => {
    const before = await state(f)
    const observed: CpuObservation[] = []
    const actual = cpuWorker(f, observed)
    let mutationDone!: () => void
    const mutated = new Promise<void>((resolve) => {
      mutationDone = resolve
    })
    const retained: {
      reply: Awaited<ReturnType<typeof actual.prepareSmartPatch>> | null
    } = { reply: null }
    const preparing = f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      (capture) =>
        capture.prepareInput({
          composeTarget: actual.composeTarget,
          async prepareSmartPatch(input) {
            const reply = await actual.prepareSmartPatch(input)
            retained.reply = reply
            // Return genuine verified CPU metadata first. The next event-loop turn
            // changes only the adapter-owned view while Main awaits real file I/O.
            setImmediate(() => {
              reply.processingMask.width = 77
              reply.processingSource.sha256 = '0'.repeat(64)
              mutationDone()
            })
            return reply
          },
        }),
    )
    void preparing.catch(() => undefined)
    // This independent signal proves the async mutation executed; no timed sleep
    // or assumed completion order is used as the behavioral oracle.
    await Promise.race([
      mutated,
      preparing.then(() => assert.fail('Preparation settled before its reply-mutation witness')),
    ])
    assert.ok(retained.reply)
    assert.equal(retained.reply.processingMask.width, 77)
    assert.equal(retained.reply.processingSource.sha256, '0'.repeat(64))
    const result = await preparing
    assert.equal(result.processingMask.width, 2)
    assert.equal(result.processingMask.height, 2)
    assert.equal(result.processingMask.sha256, digest(result.processingMask.bytes))
    assert.equal(result.processingSource.sha256, digest(result.processingSource.bytes))
    assert.notEqual(result.processingSource.sha256, '0'.repeat(64))
    assert.equal(result.mode, 'inpaint')
    expectNumericMask(observed, 'effectiveMask', [1, 64, 128, 255])
    expectNumericMask(observed, 'processingMask', [1, 64, 128, 255])
    await unchanged(f, before)
  })
})

test('actual preparation keeps its captured world mask and source after edits, Clear, Save and Project close', async () => {
  const bbox = { height: 2, width: 2, x: -3, y: -4 }
  await fixture({ bbox, mask: { alpha: [1, 64, 128, 255], bounds: bbox } }, async (f) => {
    const before = await state(f)
    const observed: CpuObservation[] = []
    let entered!: () => void
    const captureEntered = new Promise<void>((resolve) => {
      entered = resolve
    })
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const capturing = f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      async (capture) => {
        entered()
        await released
        return await capture.prepareInput(cpuWorker(f, observed))
      },
    )
    void capturing.catch(() => undefined)
    try {
      await captureEntered
      await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, {
        kind: 'bounding-box',
        rect: { height: 3, width: 4, x: 70, y: 90 },
      })
      await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, {
        kind: 'internal-resolution',
        size: { height: 4, width: 4 },
      })
      await f.service.updateGenerationDraft(
        f.tabId,
        { kind: 'positive-prompt', text: 'later owned draft' },
        undefined,
        f.patch.id,
      )
      const tab = f.service.getOpenTabs()[0]
      const patch = tab.layers.find((layer) => layer.id === f.patch.id)
      assert.ok(patch?.kind === 'smart-patch')
      await f.service.editSmartPatchMask(f.tabId, f.patch.id, {
        documentId: tab.documentId,
        documentRevision: tab.documentRevision,
        edit: { kind: 'clear' },
        maskId: patch.mask.id,
        maskRevision: patch.mask.revision,
      })
      await f.service.updateRasterLayer(f.tabId, f.source.id, {
        kind: 'visibility',
        visible: false,
      })
      await f.service.clearHistory(f.tabId)
      await f.service.save(f.tabId)
      const intentionallySaved = await readFile(f.packagePath)
      const saved = await readIgsPackage(f.packagePath)
      assert.equal(
        saved.manifest.members.some((member) => member.path.startsWith('assets/masks/')),
        false,
      )
      await f.service.close(f.tabId)
      assert.deepEqual(f.service.getOpenTabs(), [])
      release()
      const result = await capturing
      assert.deepEqual(result.context.bbox, bbox)
      assert.deepEqual(result.context.internalResolution, { height: 2, width: 2 })
      assert.equal(result.context.generationDraft.positivePrompt.text, 'frozen owned prompt')
      assert.equal(result.context.documentRevision, before.document.documentRevision)
      assert.ok(result.maskPngBytes?.equals(f.maskBytes!))
      assert.deepEqual(result.context.sourceLayerIds, [f.source.id])
      assert.equal(result.mode, 'inpaint')
      expectNumericMask(observed, 'effectiveMask', [1, 64, 128, 255])
      expectNumericMask(observed, 'processingMask', [1, 64, 128, 255])
      assert.ok(
        (await readFile(f.packagePath)).equals(intentionallySaved),
        'Preparation cannot republish its old captured document after close',
      )
      assert.deepEqual(
        await f.database.db.selectFrom('generation_queue_item').selectAll().execute(),
        before.queue,
      )
      assert.deepEqual(
        await f.database.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
        before.receipts,
      )
      assert.deepEqual(
        await f.database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
        before.seed,
      )
      assert.deepEqual(await scratchEntries(f.scratch), [])
    } finally {
      release()
      await Promise.allSettled([capturing])
    }
  })
})

test('a structurally valid oversized internal resolution refuses this finite CPU preparation without mutating its Project', async () => {
  const bbox = { height: 2, width: 2, x: -3, y: -4 }
  await fixture({ bbox, internal: { height: 2, width: 2049 }, mask: null }, async (f) => {
    const before = await state(f)
    const observed: CpuObservation[] = []
    await assert.rejects(
      f.service.withCapturedSmartPatchGenerationInput(f.tabId, f.patch.id, (capture) =>
        capture.prepareInput(cpuWorker(f, observed)),
      ),
      /limit|size|dimension|bbox|processing/i,
    )
    assert.equal(
      observed.some((entry) => entry.response.type === 'smart-patch-prepared'),
      false,
      'Oversized internal work cannot reach the CPU publication route',
    )
    await unchanged(f, before)
  })
})

for (const corruption of ['metadata-width', 'processing-mask-rgb'] as const) {
  test(`actual prepared output ${corruption} refuses and leaves no Project or operation effects`, async () => {
    const bbox = { height: 2, width: 2, x: -3, y: -4 }
    await fixture({ bbox, mask: { alpha: [1, 64, 128, 255], bounds: bbox } }, async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const worker = cpuWorker(f, observed, {
        corrupt: corruption === 'processing-mask-rgb' ? corruption : undefined,
        transformReply:
          corruption === 'metadata-width'
            ? (response) => {
                const mask = response.processingMask as Record<string, unknown>
                mask.width = 3
              }
            : undefined,
      })
      await assert.rejects(
        f.service.withCapturedSmartPatchGenerationInput(f.tabId, f.patch.id, (capture) =>
          capture.prepareInput(worker),
        ),
        /mask|image|dimension|output|coverage/i,
      )
      assert.equal(
        observed.length,
        2,
        'The fault follows actual source composition and CPU preparation',
      )
      await unchanged(f, before)
      const validObserved: CpuObservation[] = []
      const valid = await f.service.withCapturedSmartPatchGenerationInput(
        f.tabId,
        f.patch.id,
        (capture) => capture.prepareInput(cpuWorker(f, validObserved)),
      )
      assert.equal(valid.mode, 'inpaint')
      expectNumericMask(validObserved, 'processingMask', [1, 64, 128, 255])
      await unchanged(f, before)
    })
  })
}

test('new prepare capability drains a running worker after callback failure and refuses retained late calls', async () => {
  const bbox = { height: 2, width: 2, x: -3, y: -4 }
  await fixture({ bbox, mask: { alpha: [1, 64, 128, 255], bounds: bbox } }, async (f) => {
    const before = await state(f)
    const observed: CpuObservation[] = []
    const actual = cpuWorker(f, observed)
    let entered!: () => void
    const workerEntered = new Promise<void>((resolve) => {
      entered = resolve
    })
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let held!: CapturedSmartPatchGenerationInput
    const pending: {
      operation: ReturnType<CapturedSmartPatchGenerationInput['prepareInput']> | null
    } = { operation: null }
    let settled = false
    let stagingRoot = ''
    const capturing = f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      async (capture) => {
        held = capture
        pending.operation = capture.prepareInput({
          composeTarget: actual.composeTarget,
          async prepareSmartPatch(input) {
            stagingRoot = input.stagingRoot
            entered()
            await released
            assert.ok(
              existsSync(stagingRoot),
              'An admitted worker still owns its leased scratch files',
            )
            return await actual.prepareSmartPatch(input)
          },
        })
        void pending.operation.catch(() => undefined)
        await workerEntered
        throw new Error('Intentional callback failure while admitted preparation is running')
      },
    )
    void capturing.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    try {
      await workerEntered
      await new Promise<void>((resolve) => {
        setImmediate(resolve)
      })
      assert.equal(
        settled,
        false,
        'Callback failure cannot settle capture before its admitted worker drains',
      )
      assert.ok(existsSync(stagingRoot))
      release()
      await assert.rejects(capturing, /Intentional callback failure/)
      assert.ok(pending.operation)
      const result = await pending.operation
      assert.equal(result.mode, 'inpaint')
      expectNumericMask(observed, 'processingMask', [1, 64, 128, 255])
      assert.equal(existsSync(stagingRoot), false)
      let lateDispatched = false
      await assert.rejects(
        held.prepareInput({
          composeTarget: async () => {
            lateDispatched = true
            throw new Error('Late dispatch forbidden')
          },
          prepareSmartPatch: async () => {
            lateDispatched = true
            throw new Error('Late dispatch forbidden')
          },
        }),
        /closed|lease/i,
      )
      assert.equal(lateDispatched, false)
      await unchanged(f, before)
    } finally {
      release()
      await Promise.allSettled([capturing, pending.operation ?? Promise.resolve()])
    }
  })
})
