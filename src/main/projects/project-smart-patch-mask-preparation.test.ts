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

import type { OutpaintInfillResolver } from '../runtime/inference-auxiliary-resources.js'
import type { CapturedSmartPatchGenerationInput } from './project-smart-patch-generation-input.js'
import type { ProjectWorkerClient, SmartPatchCoherenceParameters } from './worker-client.js'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { encodeProjectMaskPng } from './project-mask.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  composeTargetWithTransport,
  conditionSmartPatchWithTransport,
  fadeSmartPatchWithTransport,
  prepareSmartPatchModelSourceWithTransport,
  prepareSmartPatchWithTransport,
} from './worker-client.js'

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../../..')
const WORKER_SOURCE = path.join(REPOSITORY_ROOT, 'worker-python/src')
const PYTHON = path.join(REPOSITORY_ROOT, 'worker-python/.venv/bin/python')
const ORACLE = path.join(import.meta.dirname, 'test-fixtures/smart-patch-preparation-oracle.py')
const execFileAsync = promisify(execFile)
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

type CpuObservation = {
  compositorPath: string
  conditioningPath: string
  decoded: Record<
    string,
    {
      format: string
      height: number
      iccSha256: string | null
      mode: string
      rgbaBase64: string
      rgbBase64: string
      width: number
    }
  >
  fadePath: string
  loadedMlModules: string[]
  pillowVersion: string
  preparationPath: string
  response: Record<string, unknown>
}

type FixtureOptions = {
  bbox: IgsRectV1
  coherenceSettings?: SmartPatchCoherenceParameters
  internal?: { height: number; width: number }
  mask: { alpha: readonly number[]; bounds: IgsRectV1 } | null
  maskSettings?: { blur: number; padding: number }
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
  type:
    | 'compose-target'
    | 'condition-smart-patch'
    | 'fade-smart-patch'
    | 'prepare-smart-patch-model-source'
    | 'prepare-smart-patch',
  payload: object,
  observed: CpuObservation[],
  corrupt?:
    | 'conditioning-mask-rgb'
    | 'contribution-mask-rgb'
    | 'model-source-icc'
    | 'model-source-rgba'
    | 'processing-mask-rgb',
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
    result.conditioningPath,
    path.join(WORKER_SOURCE, 'imagegen_worker/smart_patch_conditioning.py'),
  )
  assert.equal(
    result.preparationPath,
    path.join(WORKER_SOURCE, 'imagegen_worker/smart_patch_preparation.py'),
  )
  assert.equal(result.fadePath, path.join(WORKER_SOURCE, 'imagegen_worker/smart_patch_fade.py'))
  assert.equal(result.pillowVersion, '12.2.0')
  assert.deepEqual(result.loadedMlModules, [])
  observed.push(result)
  return result.response
}

function cpuWorker(
  f: Fixture,
  observed: CpuObservation[],
  options: {
    corrupt?: 'conditioning-mask-rgb' | 'contribution-mask-rgb' | 'processing-mask-rgb'
    transformFadeReply?: (response: Record<string, unknown>) => void
    transformReply?: (response: Record<string, unknown>) => void
  } = {},
): Pick<
  ProjectWorkerClient,
  | 'composeTarget'
  | 'conditionSmartPatch'
  | 'fadeSmartPatch'
  | 'prepareSmartPatch'
  | 'prepareSmartPatchModelSource'
> {
  return {
    composeTarget: (input) =>
      composeTargetWithTransport(input, f.scratch, (payload) =>
        actualCpu('compose-target', payload, observed),
      ),
    conditionSmartPatch: (input) =>
      conditionSmartPatchWithTransport(input, f.scratch, async (payload) =>
        actualCpu(
          'condition-smart-patch',
          payload,
          observed,
          options.corrupt === 'conditioning-mask-rgb' ? options.corrupt : undefined,
        ),
      ),
    fadeSmartPatch: (input) =>
      fadeSmartPatchWithTransport(input, f.scratch, async (payload) => {
        const response = await actualCpu(
          'fade-smart-patch',
          payload,
          observed,
          options.corrupt === 'contribution-mask-rgb' ? options.corrupt : undefined,
        )
        options.transformFadeReply?.(response)
        return response
      }),
    prepareSmartPatch: (input) =>
      prepareSmartPatchWithTransport(input, f.scratch, async (payload) => {
        const response = await actualCpu(
          'prepare-smart-patch',
          payload,
          observed,
          options.corrupt === 'processing-mask-rgb' ? options.corrupt : undefined,
        )
        options.transformReply?.(response)
        return response
      }),
    prepareSmartPatchModelSource: (input) =>
      prepareSmartPatchModelSourceWithTransport(input, f.scratch, (payload) =>
        actualCpu('prepare-smart-patch-model-source', payload, observed),
      ),
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
  plane:
    | 'contributionMask'
    | 'effectiveMask'
    | 'expandedProcessingKeepMask'
    | 'expandedWorldKeepMask'
    | 'finalContributionMask'
    | 'latentKeepMask'
    | 'processingKeepMask'
    | 'processingMask'
    | 'worldKeepMask',
  alpha: readonly number[],
  index = observed.length - 1,
) {
  const observation = observed[index]
  assert.ok(observation, 'Numeric mask requires an actual CPU response')
  const decoded = observation.decoded[plane]
  assert.ok(decoded, 'The actual CPU response must contain its numeric plane')
  assert.equal(decoded.iccSha256, null, 'Numeric generate coverage has no image ICC metadata')
  const expected = Buffer.from(alpha.flatMap((value) => [255, 255, 255, value]))
  assert.ok(
    actualRgba(observed, plane, index).equals(expected),
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
      ...worker,
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

// Independent axial samples from the pinned cubic least-squares control points.
// These literals are not derived by the production fade, a test-local distance transform,
// or the preparation bridge. Source support occupies the first two columns of each row.
const FADE4_ROW = [255, 255, 225, 137, 44, 0, 0, 0]
const FADE16_ROW = [
  255, 255, 247, 230, 212, 193, 172, 151, 130, 109, 89, 70, 52, 36, 23, 12, 5, 0, 0, 0,
]

function stripeFixture(
  blur: number,
  width = 8,
  internal?: { height: number; width: number },
): FixtureOptions {
  return {
    bbox: { height: 3, width, x: -11, y: -7 },
    internal,
    mask: {
      alpha: [1, 64, 128, 255, 64, 1],
      bounds: { height: 3, width: 2, x: -11, y: -7 },
    },
    maskSettings: { blur, padding: 5 },
  }
}

async function prepareActualContribution(
  f: Fixture,
  observed: CpuObservation[],
  worker = cpuWorker(f, observed),
) {
  return await f.service.withCapturedSmartPatchGenerationInput(f.tabId, f.patch.id, (capture) =>
    capture.prepareContribution(worker),
  )
}

for (const scenario of [
  { blur: 4, row: FADE4_ROW },
  { blur: 16, row: FADE16_ROW },
]) {
  test(`actual world contribution fade${scenario.blur} has exact full core, external profile and zero cutoff`, async () => {
    await fixture(stripeFixture(scenario.blur, scenario.row.length), async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const result = await prepareActualContribution(f, observed)
      assert.equal(result.mode, 'inpaint')
      assert.equal(result.context.maskSettings.blur, scenario.blur)
      assert.deepEqual(
        [result.contributionMask.width, result.contributionMask.height],
        [scenario.row.length, 3],
      )
      assert.equal(result.contributionMask.sha256, digest(result.contributionMask.bytes))
      expectNumericMask(observed, 'contributionMask', [
        ...scenario.row,
        ...scenario.row,
        ...scenario.row,
      ])
      assert.ok(
        result.maskPngBytes!.equals(f.maskBytes!),
        'Contribution cannot bake blur into the original owned PNG',
      )
      await unchanged(f, before)
    })
  })
}

for (const blur of [0, 1]) {
  test(`actual blur${blur} contribution uses a binary core while preserving authored and processing soft alpha`, async () => {
    await fixture(stripeFixture(blur), async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const result = await prepareActualContribution(f, observed)
      const soft = [1, 64, 0, 0, 0, 0, 0, 0, 128, 255, 0, 0, 0, 0, 0, 0, 64, 1, 0, 0, 0, 0, 0, 0]
      const preparedIndex = observed.findLastIndex(
        (entry) => entry.response.type === 'smart-patch-prepared',
      )
      assert.ok(preparedIndex >= 0)
      expectNumericMask(observed, 'effectiveMask', soft, preparedIndex)
      expectNumericMask(observed, 'processingMask', soft, preparedIndex)
      expectNumericMask(
        observed,
        'contributionMask',
        [255, 255, 0, 0, 0, 0, 0, 0, 255, 255, 0, 0, 0, 0, 0, 0, 255, 255, 0, 0, 0, 0, 0, 0],
      )
      assert.equal(result.mode, 'inpaint')
      assert.equal(result.processingMaskHasCoverage, true)
      assert.ok(result.maskPngBytes!.equals(f.maskBytes!))
      await unchanged(f, before)
    })
  })
}

for (const blur of [0, 4]) {
  test(`actual transparent stripe neighbor blur${blur} contributes the whole bbox with identical authored inputs`, async () => {
    await fixture({ ...stripeFixture(blur), sourceAlpha: 0 }, async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const result = await prepareActualContribution(f, observed)
      assert.equal(result.mode, 'txt2img')
      assert.equal(result.sourceAlpha, 'transparent')
      assert.equal(result.context.maskSettings.blur, blur)
      expectNumericMask(
        observed,
        'contributionMask',
        Array.from({ length: 24 }, () => 255),
      )
      const preparedIndex = observed.findLastIndex(
        (entry) => entry.response.type === 'smart-patch-prepared',
      )
      expectNumericMask(
        observed,
        'effectiveMask',
        [1, 64, 0, 0, 0, 0, 0, 0, 128, 255, 0, 0, 0, 0, 0, 0, 64, 1, 0, 0, 0, 0, 0, 0],
        preparedIndex,
      )
      assert.ok(result.maskPngBytes!.equals(f.maskBytes!))
      await unchanged(f, before)
    })
  })
}

for (const mask of [null, { alpha: [255], bounds: { height: 1, width: 1, x: 0, y: -7 } }]) {
  test(`actual ${mask ? 'outside' : 'null'} mask keeps source-only img2img with whole-bbox contribution`, async () => {
    await fixture(
      { bbox: { height: 2, width: 3, x: -3, y: -7 }, mask, maskSettings: { blur: 16, padding: 5 } },
      async (f) => {
        const before = await state(f)
        const observed: CpuObservation[] = []
        const result = await prepareActualContribution(f, observed)
        assert.equal(result.mode, 'img2img')
        expectNumericMask(observed, 'contributionMask', [255, 255, 255, 255, 255, 255])
        const preparedIndex = observed.findLastIndex(
          (entry) => entry.response.type === 'smart-patch-prepared',
        )
        expectNumericMask(observed, 'effectiveMask', [0, 0, 0, 0, 0, 0], preparedIndex)
        await unchanged(f, before)
      },
    )
  })
}

test('actual transparent source contributes the entire bbox despite weak partial authored coverage', async () => {
  const bbox = { height: 2, width: 3, x: -3, y: -7 }
  await fixture(
    {
      bbox,
      mask: { alpha: [1], bounds: { height: 1, width: 1, x: bbox.x, y: bbox.y } },
      maskSettings: { blur: 16, padding: 5 },
      sourceAlpha: 0,
    },
    async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const result = await prepareActualContribution(f, observed)
      assert.equal(result.mode, 'txt2img')
      expectNumericMask(observed, 'contributionMask', [255, 255, 255, 255, 255, 255])
      await unchanged(f, before)
    },
  )
})

test('actual uniform alpha128 outpaint contributes the entire bbox with no authored mask', async () => {
  await fixture(
    {
      bbox: { height: 2, width: 3, x: -3, y: -7 },
      mask: null,
      maskSettings: { blur: 16, padding: 5 },
      sourceAlpha: 128,
    },
    async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const result = await prepareActualContribution(f, observed)
      assert.equal(result.mode, 'outpaint')
      assert.equal(result.sourceAlpha, 'mixed')
      expectNumericMask(observed, 'contributionMask', [255, 255, 255, 255, 255, 255])
      await unchanged(f, before)
    },
  )
})

test('actual outpaint contribution unions every nonopaque source pixel with authored support without replacing either soft plane', async () => {
  const bbox = { height: 2, width: 6, x: -3, y: -7 }
  const sourceRow = [255, 0, 1, 128, 254, 255]
  await fixture(
    {
      bbox,
      mask: { alpha: [1, 64], bounds: { height: 2, width: 1, x: bbox.x + 5, y: bbox.y } },
      maskSettings: { blur: 0, padding: 5 },
      sourceRgba: [...sourceRow, ...sourceRow].flatMap((alpha) => [0, 255, 0, alpha]),
    },
    async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const result = await prepareActualContribution(f, observed)
      assert.equal(result.mode, 'outpaint')
      expectNumericMask(
        observed,
        'contributionMask',
        [0, 255, 255, 255, 255, 255, 0, 255, 255, 255, 255, 255],
      )
      const preparedIndex = observed.findLastIndex(
        (entry) => entry.response.type === 'smart-patch-prepared',
      )
      expectNumericMask(
        observed,
        'effectiveMask',
        [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 64],
        preparedIndex,
      )
      assert.ok(result.maskPngBytes!.equals(f.maskBytes!))
      await unchanged(f, before)
    },
  )
})

test('actual source-only outpaint neighbor preserves identical source support without authored coverage', async () => {
  const bbox = { height: 2, width: 6, x: -3, y: -7 }
  const sourceRow = [255, 0, 1, 128, 254, 255]
  await fixture(
    {
      bbox,
      mask: null,
      maskSettings: { blur: 0, padding: 5 },
      sourceRgba: [...sourceRow, ...sourceRow].flatMap((alpha) => [0, 255, 0, alpha]),
    },
    async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const result = await prepareActualContribution(f, observed)
      assert.equal(result.mode, 'outpaint')
      assert.equal(result.sourceAlpha, 'mixed')
      assert.equal(result.maskPngBytes, null)
      expectNumericMask(
        observed,
        'contributionMask',
        [0, 255, 255, 255, 255, 0, 0, 255, 255, 255, 255, 0],
      )
      const preparedIndex = observed.findLastIndex(
        (entry) => entry.response.type === 'smart-patch-prepared',
      )
      expectNumericMask(
        observed,
        'effectiveMask',
        Array.from({ length: 12 }, () => 0),
        preparedIndex,
      )
      await unchanged(f, before)
    },
  )
})

test('actual fully covered soft inpaint core has no invented fade at image edges', async () => {
  const bbox = { height: 2, width: 3, x: -3, y: -7 }
  await fixture(
    {
      bbox,
      mask: { alpha: [1, 64, 128, 255, 64, 1], bounds: bbox },
      maskSettings: { blur: 512, padding: 0 },
    },
    async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const result = await prepareActualContribution(f, observed)
      assert.equal(result.mode, 'inpaint')
      expectNumericMask(observed, 'contributionMask', [255, 255, 255, 255, 255, 255])
      const preparedIndex = observed.findLastIndex(
        (entry) => entry.response.type === 'smart-patch-prepared',
      )
      expectNumericMask(observed, 'effectiveMask', [1, 64, 128, 255, 64, 1], preparedIndex)
      await unchanged(f, before)
    },
  )
})

test('actual world fade is identical across anisotropic internal sizes and Fit-only padding changes', async () => {
  await fixture(stripeFixture(4), async (f) => {
    const firstBefore = await state(f)
    const observed: CpuObservation[] = []
    const first = await prepareActualContribution(f, observed)
    await unchanged(f, firstBefore)
    for (const size of [
      { height: 3, width: 16 },
      { height: 6, width: 4 },
    ]) {
      await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, {
        kind: 'internal-resolution',
        size,
      })
      const tab = f.service.getOpenTabs()[0]
      await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, {
        documentId: tab.documentId,
        documentRevision: tab.documentRevision,
        kind: 'bbox-padding',
        value: 512,
      })
      await f.service.flushAutosave(f.tabId)
      const before = await state(f)
      const next = await prepareActualContribution(f, observed)
      assert.deepEqual(next.context.internalResolution, size)
      assert.deepEqual(next.context.maskSettings, { blur: 4, padding: 512 })
      assert.deepEqual(
        [next.processingSource.width, next.processingSource.height],
        [size.width, size.height],
      )
      assert.deepEqual([next.contributionMask.width, next.contributionMask.height], [8, 3])
      assert.ok(
        next.contributionMask.bytes.equals(first.contributionMask.bytes),
        'Internal resizing and padding cannot change project-space fade pixels',
      )
      expectNumericMask(observed, 'contributionMask', [...FADE4_ROW, ...FADE4_ROW, ...FADE4_ROW])
      await unchanged(f, before)
    }
  })
})

test('captured contribution uses its original blur despite later setting edits and exposed input/adapter mutations', async () => {
  await fixture(stripeFixture(4), async (f) => {
    const observed: CpuObservation[] = []
    const actual = cpuWorker(f, observed)
    let replyMutationDone!: () => void
    const replyMutated = new Promise<void>((resolve) => {
      replyMutationDone = resolve
    })
    let entered!: () => void
    const enteredCapture = new Promise<void>((resolve) => {
      entered = resolve
    })
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let before!: Awaited<ReturnType<typeof state>>
    const capturing = f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      async (capture) => {
        capture.context.maskSettings.blur = 512
        entered()
        await released
        const first = await capture.prepareContribution({
          ...actual,
          async fadeSmartPatch(input) {
            const result = await actual.fadeSmartPatch(input)
            input.maskBlur = 0
            input.mode = 'txt2img'
            input.source.width = 700
            setImmediate(() => {
              result.contributionMask.width = 77
              result.contributionMask.sha256 = '0'.repeat(64)
              replyMutationDone()
            })
            return result
          },
        })
        await replyMutated
        assert.equal(first.context.maskSettings.blur, 4)
        assert.equal(first.contributionMask.width, 8)
        assert.equal(first.contributionMask.sha256, digest(first.contributionMask.bytes))
        expectNumericMask(observed, 'contributionMask', [...FADE4_ROW, ...FADE4_ROW, ...FADE4_ROW])
        first.context.maskSettings.blur = 0
        first.contributionMask.bytes.fill(0)
        const second = await capture.prepareContribution(actual)
        assert.equal(second.context.maskSettings.blur, 4)
        assert.equal(second.contributionMask.sha256, digest(second.contributionMask.bytes))
        expectNumericMask(observed, 'contributionMask', [...FADE4_ROW, ...FADE4_ROW, ...FADE4_ROW])
        return second
      },
    )
    void capturing.catch(() => undefined)
    try {
      await enteredCapture
      const tab = f.service.getOpenTabs()[0]
      await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, {
        documentId: tab.documentId,
        documentRevision: tab.documentRevision,
        kind: 'mask-blur',
        value: 16,
      })
      await f.service.flushAutosave(f.tabId)
      before = await state(f)
      release()
      const result = await capturing
      assert.equal(result.context.maskSettings.blur, 4)
      await unchanged(f, before)
    } finally {
      release()
      await Promise.allSettled([capturing])
    }
  })
})

test('actual contribution output with nonwhite RGB refuses after real fade and cleans its entire private operation', async () => {
  await fixture(stripeFixture(4), async (f) => {
    const before = await state(f)
    const observed: CpuObservation[] = []
    await assert.rejects(
      prepareActualContribution(
        f,
        observed,
        cpuWorker(f, observed, { corrupt: 'contribution-mask-rgb' }),
      ),
      /mask|coverage|image|white|output/i,
    )
    assert.deepEqual(
      observed.map((entry) => entry.response.type),
      ['target-done', 'smart-patch-prepared', 'smart-patch-faded'],
    )
    await unchanged(f, before)
    const clean: CpuObservation[] = []
    await prepareActualContribution(f, clean)
    expectNumericMask(clean, 'contributionMask', [...FADE4_ROW, ...FADE4_ROW, ...FADE4_ROW])
    await unchanged(f, before)
  })
})

test('an admitted contribution chain reaches fade after callback closure and drains before cleanup', async () => {
  await fixture(stripeFixture(4), async (f) => {
    const before = await state(f)
    const observed: CpuObservation[] = []
    const actual = cpuWorker(f, observed)
    let entered!: () => void
    const prepareEntered = new Promise<void>((resolve) => {
      entered = resolve
    })
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending: {
      operation: ReturnType<CapturedSmartPatchGenerationInput['prepareContribution']> | null
    } = { operation: null }
    let held!: CapturedSmartPatchGenerationInput
    let settled = false
    let stage = ''
    let fadeDispatched = false
    const capturing = f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      async (capture) => {
        held = capture
        pending.operation = capture.prepareContribution({
          ...actual,
          async fadeSmartPatch(input) {
            fadeDispatched = true
            assert.ok(
              existsSync(stage),
              'An admitted preparation-to-fade chain still owns its files',
            )
            return await actual.fadeSmartPatch(input)
          },
          async prepareSmartPatch(input) {
            stage = input.stagingRoot
            const prepared = await actual.prepareSmartPatch(input)
            entered()
            await released
            return prepared
          },
        })
        void pending.operation.catch(() => undefined)
        await prepareEntered
        throw new Error('Intentional callback failure between preparation and fade')
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
      await prepareEntered
      await new Promise<void>((resolve) => {
        setImmediate(resolve)
      })
      assert.equal(settled, false)
      assert.equal(fadeDispatched, false)
      assert.ok(existsSync(stage))
      release()
      await assert.rejects(capturing, /Intentional callback failure between preparation and fade/)
      assert.ok(pending.operation)
      await pending.operation
      assert.equal(
        fadeDispatched,
        true,
        'Closure cannot stop the second stage of an already admitted operation',
      )
      expectNumericMask(observed, 'contributionMask', [...FADE4_ROW, ...FADE4_ROW, ...FADE4_ROW])
      assert.equal(existsSync(stage), false)
      let lateDispatched = false
      const late = () => {
        lateDispatched = true
        throw new Error('Late contribution dispatch forbidden')
      }
      await assert.rejects(
        held.prepareContribution({
          composeTarget: async () => late(),
          fadeSmartPatch: async () => late(),
          prepareSmartPatch: async () => late(),
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

async function prepareActualConditioning(
  f: Fixture,
  observed: CpuObservation[],
  coherence?: SmartPatchCoherenceParameters,
  worker = cpuWorker(f, observed),
) {
  return await f.service.withCapturedSmartPatchGenerationInput(f.tabId, f.patch.id, (capture) =>
    capture.prepareConditioning(worker, coherence),
  )
}

function observedAlpha(observed: CpuObservation[], plane: string): number[] {
  const rgba = actualRgba(observed, plane)
  return Array.from({ length: rgba.length / 4 }, (_, index) => rgba[index * 4 + 3])
}

const GAUSSIAN_WEAK_CIRCLE = [
  255, 255, 254, 255, 255, 255, 254, 254, 254, 255, 254, 254, 254, 254, 254, 255, 254, 254, 254,
  255, 255, 255, 254, 255, 255,
]
const BOX_WEAK_CIRCLE = [
  255, 255, 255, 255, 255, 255, 254, 254, 254, 255, 255, 254, 254, 254, 255, 255, 254, 254, 254,
  255, 255, 255, 255, 255, 255,
]
const STAGED_WEAK_CIRCLE = [
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255,
]

function coherentCircleFixture(internal = { height: 40, width: 40 }): FixtureOptions {
  return {
    bbox: { height: 40, width: 40, x: -11, y: -7 },
    internal,
    mask: {
      alpha: Array.from({ length: 64 }, () => 1),
      bounds: { height: 8, width: 8, x: 5, y: 9 },
    },
    maskSettings: { blur: 0, padding: 5 },
  }
}

test('the real owned profile changes CPU conditioning while a private override leaves the Project untouched', async () => {
  await fixture(coherentCircleFixture(), async (f) => {
    const before = await state(f)
    const initial: CpuObservation[] = []
    const legacy = await prepareActualConditioning(f, initial)
    assert.deepEqual(legacy.context.coherenceSettings, {
      edgeSize: 16,
      minimumDenoise: 0,
      mode: 'Gaussian Blur',
    })
    expectNumericMask(initial, 'latentKeepMask', GAUSSIAN_WEAK_CIRCLE)
    await unchanged(f, before)
    const tab = f.service.getOpenTabs()[0]
    const owned: SmartPatchCoherenceParameters = {
      edgeSize: 16,
      minimumDenoise: 0,
      mode: 'Box Blur',
    }
    await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, {
      documentId: tab.documentId,
      documentRevision: tab.documentRevision,
      kind: 'coherence-settings',
      value: owned,
    })
    await f.service.flushAutosave(f.tabId)
    const afterEdit = await state(f)
    const observed: CpuObservation[] = []
    const result = await prepareActualConditioning(f, observed)
    assert.deepEqual(result.coherence, owned)
    assert.deepEqual(result.context.coherenceSettings, owned)
    expectNumericMask(observed, 'latentKeepMask', BOX_WEAK_CIRCLE)
    const override: CpuObservation[] = []
    const overridden = await prepareActualConditioning(f, override, {
      edgeSize: 16,
      minimumDenoise: 0,
      mode: 'Gaussian Blur',
    })
    assert.equal(overridden.coherence.mode, 'Gaussian Blur')
    assert.deepEqual(overridden.context.coherenceSettings, owned)
    expectNumericMask(override, 'latentKeepMask', GAUSSIAN_WEAK_CIRCLE)
    await unchanged(f, afterEdit)
  })
})

test('late document edits and exposed profile aliases cannot retarget an owned conditioning capture', async () => {
  const owned: SmartPatchCoherenceParameters = {
    edgeSize: 16,
    minimumDenoise: 0,
    mode: 'Staged',
  }
  await fixture({ ...coherentCircleFixture(), coherenceSettings: owned }, async (f) => {
    const observed: CpuObservation[] = []
    const actual = cpuWorker(f, observed)
    const afterEdit = await f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      async (capture) => {
        capture.context.coherenceSettings.mode = 'Box Blur'
        const exposed = capture.document.layers.find((layer) => layer.id === f.patch.id)
        assert.ok(exposed?.kind === 'smart-patch' && exposed.coherenceSettings)
        exposed.coherenceSettings.edgeSize = 0
        const tab = f.service.getOpenTabs()[0]
        await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, {
          documentId: tab.documentId,
          documentRevision: tab.documentRevision,
          kind: 'coherence-settings',
          value: { ...owned, mode: 'Gaussian Blur' },
        })
        await f.service.flushAutosave(f.tabId)
        const afterEdit = await state(f)
        const first = await capture.prepareConditioning(actual)
        assert.deepEqual(first.coherence, owned)
        assert.deepEqual(first.context.coherenceSettings, owned)
        expectNumericMask(observed, 'latentKeepMask', STAGED_WEAK_CIRCLE)
        first.coherence.mode = 'Gaussian Blur'
        first.context.coherenceSettings.edgeSize = 0
        const second = await capture.prepareConditioning(actual)
        assert.deepEqual(second.coherence, owned)
        assert.deepEqual(second.context.coherenceSettings, owned)
        expectNumericMask(observed, 'latentKeepMask', STAGED_WEAK_CIRCLE)
        return afterEdit
      },
    )
    await unchanged(f, afterEdit)
    const current = f.service.getOpenTabs()[0].layers.find((layer) => layer.id === f.patch.id)
    assert.equal(
      current?.kind === 'smart-patch' && current.coherenceSettings?.mode,
      'Gaussian Blur',
    )
  })
})

// Actual Service -> actual protocol/Pillow/NumPy. The OUT literals are independently
// normalized cubic samples of world keep [95,255], not separately resized operands.
for (const authored of [true, false]) {
  test(`actual ${authored ? 'authored OUT multiplication precedes' : 'source-only OUT neighbor retains source before'} BICUBIC processing resize`, async () => {
    const bbox = { height: 1, width: 2, x: -11, y: -7 }
    await fixture(
      {
        bbox,
        internal: { height: 8, width: 8 },
        mask: authored ? { alpha: [64], bounds: { ...bbox, width: 1 } } : null,
        maskSettings: { blur: 0, padding: 5 },
        sourceRgba: [0, 255, 0, 128, 0, 255, 0, 255],
      },
      async (f) => {
        const before = await state(f)
        const observed: CpuObservation[] = []
        const result = await prepareActualConditioning(f, observed, {
          edgeSize: 0,
          minimumDenoise: 0,
          mode: 'Gaussian Blur',
        })
        const row = authored
          ? [77, 87, 109, 151, 199, 241, 255, 255]
          : [114, 121, 139, 172, 211, 244, 255, 255]
        assert.equal(result.mode, 'outpaint')
        expectNumericMask(observed, 'worldKeepMask', authored ? [95, 255] : [128, 255])
        expectNumericMask(
          observed,
          'processingKeepMask',
          Array.from({ length: 8 }, () => row).flat(),
        )
        expectNumericMask(observed, 'latentKeepMask', [authored ? 172 : 189])
        expectNumericMask(
          observed,
          'expandedProcessingKeepMask',
          Array.from({ length: 64 }, () => 0),
        )
        expectNumericMask(observed, 'expandedWorldKeepMask', [0, 0])
        expectNumericMask(observed, 'finalContributionMask', [255, 255])
        assert.equal(result.conditioning.latentMaskHasCoverage, true)
        for (const plane of [
          'worldKeepMask',
          'processingKeepMask',
          'latentKeepMask',
          'expandedProcessingKeepMask',
          'expandedWorldKeepMask',
        ] as const) {
          assert.equal(result.conditioning[plane].polarity, 'keep')
          assert.equal(result.conditioning[plane].sha256, digest(result.conditioning[plane].bytes))
        }
        assert.equal(result.conditioning.finalContributionMask.polarity, 'generate')
        await unchanged(f, before)
      },
    )
  })
}

for (const profile of [
  { expected: GAUSSIAN_WEAK_CIRCLE, mode: 'Gaussian Blur' },
  { expected: BOX_WEAK_CIRCLE, mode: 'Box Blur' },
  { expected: STAGED_WEAK_CIRCLE, mode: 'Staged' },
] as const) {
  test(`actual ${profile.mode} coherence preserves weak numeric alpha with its literal latent footprint`, async () => {
    await fixture(coherentCircleFixture(), async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const result = await prepareActualConditioning(f, observed, {
        edgeSize: 16,
        minimumDenoise: 0,
        mode: profile.mode,
      })
      assert.equal(result.mode, 'inpaint')
      assert.deepEqual(result.coherence, { edgeSize: 16, minimumDenoise: 0, mode: profile.mode })
      assert.deepEqual(
        [result.conditioning.latentKeepMask.width, result.conditioning.latentKeepMask.height],
        [5, 5],
      )
      expectNumericMask(observed, 'latentKeepMask', profile.expected)
      const worldKeep = observedAlpha(observed, 'worldKeepMask')
      assert.equal(worldKeep.filter((alpha) => alpha === 254).length, 64)
      assert.equal(worldKeep.filter((alpha) => alpha === 255).length, 1536)
      assert.equal(worldKeep[16 * 40 + 16], 254)
      assert.equal(worldKeep[15 * 40 + 16], 255)
      assert.ok(
        result.conditioning.processingKeepMask.bytes.equals(
          result.conditioning.worldKeepMask.bytes,
        ),
      )
      const expanded = observedAlpha(observed, 'expandedProcessingKeepMask')
      assert.equal(
        expanded.every((alpha) => alpha === 0 || alpha === 255),
        true,
      )
      assert.equal(
        expanded.filter((alpha) => alpha === 0).length,
        profile.expected.filter((alpha) => alpha < 255).length * 64,
      )
      assert.equal(expanded[20 * 40 + 20], 0)
      assert.equal(expanded[4 * 40 + 4], 255)
      assert.ok(
        result.conditioning.expandedWorldKeepMask.bytes.equals(
          result.conditioning.expandedProcessingKeepMask.bytes,
        ),
      )
      const final = observedAlpha(observed, 'finalContributionMask')
      assert.equal(
        final.every((alpha, index) => alpha + expanded[index] === 255),
        true,
      )
      assert.equal(result.conditioning.latentMaskHasCoverage, true)
      assert.ok(result.maskPngBytes!.equals(f.maskBytes!))
      await unchanged(f, before)
    })
  })
}

for (const edgeSize of [0, 7, 8]) {
  test(`actual processing edge${edgeSize} floors the latent radius and ${edgeSize < 8 ? 'ignores' : 'applies'} minimum denoise`, async () => {
    const bbox = { height: 8, width: 16, x: -11, y: -7 }
    await fixture(
      {
        bbox,
        mask: { alpha: Array.from({ length: 128 }, () => 64), bounds: bbox },
        maskSettings: { blur: 0, padding: 5 },
      },
      async (f) => {
        const before = await state(f)
        const observed: CpuObservation[] = []
        const result = await prepareActualConditioning(f, observed, {
          edgeSize,
          minimumDenoise: 0.5,
          mode: 'Gaussian Blur',
        })
        expectNumericMask(observed, 'latentKeepMask', edgeSize < 8 ? [191, 191] : [127, 127])
        assert.equal(result.conditioning.latentMaskHasCoverage, true)
        assert.equal(result.mode, 'inpaint')
        await unchanged(f, before)
      },
    )
  })
}

for (const sourceAlpha of [0, 255]) {
  test(`actual ${sourceAlpha === 0 ? 'txt2img' : 'img2img'} conditioning neighbor retains all-zero keep and whole-frame contribution`, async () => {
    await fixture(
      {
        bbox: { height: 8, width: 8, x: -11, y: -7 },
        mask: null,
        maskSettings: { blur: 16, padding: 5 },
        sourceAlpha,
      },
      async (f) => {
        const before = await state(f)
        const observed: CpuObservation[] = []
        const result = await prepareActualConditioning(f, observed)
        assert.equal(result.mode, sourceAlpha === 0 ? 'txt2img' : 'img2img')
        assert.deepEqual(result.coherence, {
          edgeSize: 16,
          minimumDenoise: 0,
          mode: 'Gaussian Blur',
        })
        expectNumericMask(
          observed,
          'worldKeepMask',
          Array.from({ length: 64 }, () => 0),
        )
        expectNumericMask(observed, 'latentKeepMask', [0])
        expectNumericMask(
          observed,
          'finalContributionMask',
          Array.from({ length: 64 }, () => 255),
        )
        await unchanged(f, before)
      },
    )
  })
}

test('the new latent-grid preflight refuses one-pixel internal processing while its old preparation neighbor remains valid', async () => {
  const bbox = { height: 2, width: 2, x: -11, y: -7 }
  await fixture(
    { bbox, internal: { height: 1, width: 1 }, mask: { alpha: [1, 64, 128, 255], bounds: bbox } },
    async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      await assert.rejects(
        prepareActualConditioning(f, observed),
        /grid|multiple|eight|8|conditioning|latent/i,
      )
      assert.equal(
        observed.some((entry) => entry.response.type === 'smart-patch-conditioned'),
        false,
      )
      const ordinary = await f.service.withCapturedSmartPatchGenerationInput(
        f.tabId,
        f.patch.id,
        (capture) => capture.prepareInput(cpuWorker(f, observed)),
      )
      assert.deepEqual([ordinary.processingMask.width, ordinary.processingMask.height], [1, 1])
      assert.equal(ordinary.mode, 'inpaint')
      await unchanged(f, before)
    },
  )
})

for (const alpha of [1, 64]) {
  test(`actual single alpha${alpha} pixel ${alpha === 1 ? 'reports latent loss' : 'survives as its latent neighbor'} while retaining original world edit core`, async () => {
    const bbox = { height: 64, width: 64, x: -11, y: -7 }
    await fixture(
      {
        bbox,
        mask: { alpha: [alpha], bounds: { height: 1, width: 1, x: bbox.x + 27, y: bbox.y + 27 } },
        maskSettings: { blur: 0, padding: 5 },
      },
      async (f) => {
        const before = await state(f)
        const observed: CpuObservation[] = []
        const result = await prepareActualConditioning(f, observed)
        assert.equal(result.processingMaskHasCoverage, true)
        assert.equal(result.mode, 'inpaint')
        assert.equal(result.conditioning.latentMaskHasCoverage, alpha === 64)
        const latent = observedAlpha(observed, 'latentKeepMask')
        assert.equal(latent.filter((value) => value < 255).length, alpha === 1 ? 0 : 13)
        const expanded = observedAlpha(observed, 'expandedWorldKeepMask')
        const contribution = observedAlpha(observed, 'finalContributionMask')
        assert.equal(expanded[27 * 64 + 27], 0)
        assert.equal(contribution[27 * 64 + 27], 255)
        if (alpha === 1) {
          assert.equal(expanded.filter((value) => value === 0).length, 1)
          assert.equal(contribution.filter((value) => value > 0).length, 1)
        }
        assert.ok(result.maskPngBytes!.equals(f.maskBytes!))
        await unchanged(f, before)
      },
    )
  })
}

test('processing coherence and latent dimensions follow anisotropic internal axes while final fade and padding stay in world space', async () => {
  const bbox = { height: 8, width: 40, x: -11, y: -7 }
  await fixture(
    {
      bbox,
      internal: { height: 8, width: 40 },
      mask: { alpha: Array.from({ length: 16 }, () => 255), bounds: { ...bbox, width: 2 } },
      maskSettings: { blur: 4, padding: 5 },
    },
    async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const profile: SmartPatchCoherenceParameters = {
        edgeSize: 16,
        minimumDenoise: 0,
        mode: 'Gaussian Blur',
      }
      const first = await prepareActualConditioning(f, observed, profile)
      assert.deepEqual(
        [first.conditioning.processingKeepMask.width, first.conditioning.processingKeepMask.height],
        [40, 8],
      )
      assert.deepEqual(
        [first.conditioning.latentKeepMask.width, first.conditioning.latentKeepMask.height],
        [5, 1],
      )
      assert.deepEqual(
        [
          first.conditioning.expandedWorldKeepMask.width,
          first.conditioning.expandedWorldKeepMask.height,
        ],
        [40, 8],
      )
      assert.deepEqual(
        [
          first.conditioning.finalContributionMask.width,
          first.conditioning.finalContributionMask.height,
        ],
        [40, 8],
      )
      const expanded = observedAlpha(observed, 'expandedWorldKeepMask')
      const final = observedAlpha(observed, 'finalContributionMask')
      assert.equal(expanded.slice(0, 40).indexOf(255), 24)
      assert.deepEqual([expanded[11], expanded[12], expanded[23], expanded[24]], [0, 0, 0, 255])
      assert.deepEqual(
        final.slice(24, 27),
        [225, 137, 44],
        'Owned blur4 uses three literal project-pixel fade samples after the projected core',
      )
      await unchanged(f, before)
      await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, {
        kind: 'internal-resolution',
        size: { height: 8, width: 80 },
      })
      await f.service.flushAutosave(f.tabId)
      const doubledBefore = await state(f)
      const doubled = await prepareActualConditioning(f, observed, profile)
      assert.deepEqual(
        [doubled.conditioning.latentKeepMask.width, doubled.conditioning.latentKeepMask.height],
        [10, 1],
      )
      const doubledExpanded = observedAlpha(observed, 'expandedWorldKeepMask')
      const doubledFinal = observedAlpha(observed, 'finalContributionMask')
      assert.equal(doubledExpanded.slice(0, 40).indexOf(255), 12)
      assert.deepEqual(
        [doubledExpanded[11], doubledExpanded[12], doubledExpanded[23], doubledExpanded[24]],
        [0, 255, 255, 255],
      )
      assert.deepEqual(doubledFinal.slice(12, 15), [225, 137, 44])
      assert.equal(doubled.coherence.edgeSize, 16)
      assert.equal(doubled.context.maskSettings.blur, 4)
      await unchanged(f, doubledBefore)
      const tab = f.service.getOpenTabs()[0]
      await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, {
        documentId: tab.documentId,
        documentRevision: tab.documentRevision,
        kind: 'bbox-padding',
        value: 512,
      })
      await f.service.flushAutosave(f.tabId)
      const afterEdit = await state(f)
      const next = await prepareActualConditioning(f, observed, profile)
      assert.ok(
        next.conditioning.finalContributionMask.bytes.equals(
          doubled.conditioning.finalContributionMask.bytes,
        ),
      )
      assert.ok(
        next.conditioning.latentKeepMask.bytes.equals(doubled.conditioning.latentKeepMask.bytes),
      )
      await unchanged(f, afterEdit)
    },
  )
})

test('caller profile and adapter mutations cannot replace a conditioning operation frozen before its first await', async () => {
  await fixture(coherentCircleFixture(), async (f) => {
    const before = await state(f)
    const observed: CpuObservation[] = []
    const actual = cpuWorker(f, observed)
    const profile: SmartPatchCoherenceParameters = {
      edgeSize: 16,
      minimumDenoise: 0,
      mode: 'Gaussian Blur',
    }
    let mutationDone!: () => void
    const mutated = new Promise<void>((resolve) => {
      mutationDone = resolve
    })
    await f.service.withCapturedSmartPatchGenerationInput(f.tabId, f.patch.id, async (capture) => {
      const preparing = capture.prepareConditioning(
        {
          ...actual,
          async conditionSmartPatch(input) {
            const result = await actual.conditionSmartPatch(input)
            input.coherence.edgeSize = 0
            input.coherence.mode = 'Staged'
            input.maskBlur = 512
            setImmediate(() => {
              result.latentKeepMask.width = 999
              result.finalContributionMask.sha256 = '0'.repeat(64)
              mutationDone()
            })
            return result
          },
        },
        profile,
      )
      profile.edgeSize = 0
      profile.minimumDenoise = 1
      profile.mode = 'Box Blur'
      const first = await preparing
      await mutated
      assert.deepEqual(first.coherence, { edgeSize: 16, minimumDenoise: 0, mode: 'Gaussian Blur' })
      assert.equal(first.conditioning.latentKeepMask.width, 5)
      assert.equal(
        first.conditioning.finalContributionMask.sha256,
        digest(first.conditioning.finalContributionMask.bytes),
      )
      expectNumericMask(observed, 'latentKeepMask', GAUSSIAN_WEAK_CIRCLE)
      first.coherence.edgeSize = 0
      first.conditioning.latentKeepMask.bytes.fill(0)
      first.conditioning.finalContributionMask.bytes.fill(0)
      const second = await capture.prepareConditioning(actual)
      assert.deepEqual(second.coherence, { edgeSize: 16, minimumDenoise: 0, mode: 'Gaussian Blur' })
      expectNumericMask(observed, 'latentKeepMask', GAUSSIAN_WEAK_CIRCLE)
    })
    await unchanged(f, before)
  })
})

test('a malformed real sixth conditioning output refuses the whole result and leaves the old preparation/control intact', async () => {
  await fixture(coherentCircleFixture(), async (f) => {
    const before = await state(f)
    const observed: CpuObservation[] = []
    await assert.rejects(
      prepareActualConditioning(
        f,
        observed,
        undefined,
        cpuWorker(f, observed, { corrupt: 'conditioning-mask-rgb' }),
      ),
      /mask|white|coverage|image|output/i,
    )
    assert.equal(observed.at(-1)?.response.type, 'smart-patch-conditioned')
    await unchanged(f, before)
    const control: CpuObservation[] = []
    const valid = await prepareActualConditioning(f, control)
    assert.equal(valid.conditioning.latentMaskHasCoverage, true)
    expectNumericMask(control, 'latentKeepMask', GAUSSIAN_WEAK_CIRCLE)
    await unchanged(f, before)
  })
})

test('an admitted conditioning chain survives callback closure between preparation and coherence and refuses late capabilities', async () => {
  await fixture(coherentCircleFixture(), async (f) => {
    const before = await state(f)
    const observed: CpuObservation[] = []
    const actual = cpuWorker(f, observed)
    let entered!: () => void
    const prepareEntered = new Promise<void>((resolve) => {
      entered = resolve
    })
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending: {
      operation: ReturnType<CapturedSmartPatchGenerationInput['prepareConditioning']> | null
    } = { operation: null }
    let held!: CapturedSmartPatchGenerationInput
    let stage = ''
    let dispatched = false
    let settled = false
    const capturing = f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      async (capture) => {
        held = capture
        pending.operation = capture.prepareConditioning({
          ...actual,
          async conditionSmartPatch(input) {
            dispatched = true
            assert.ok(existsSync(stage))
            return await actual.conditionSmartPatch(input)
          },
          async prepareSmartPatch(input) {
            stage = input.stagingRoot
            const result = await actual.prepareSmartPatch(input)
            entered()
            await released
            return result
          },
        })
        void pending.operation.catch(() => undefined)
        await prepareEntered
        throw new Error('Intentional callback failure between preparation and coherence')
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
      await Promise.race([
        prepareEntered,
        capturing.then(() => assert.fail('Capture settled before its preparation witness')),
      ])
      await new Promise<void>((resolve) => {
        setImmediate(resolve)
      })
      assert.equal(settled, false)
      assert.equal(dispatched, false)
      assert.ok(existsSync(stage))
      release()
      await assert.rejects(
        capturing,
        /Intentional callback failure between preparation and coherence/,
      )
      assert.ok(pending.operation)
      await pending.operation
      assert.equal(dispatched, true)
      assert.equal(existsSync(stage), false)
      expectNumericMask(observed, 'latentKeepMask', GAUSSIAN_WEAK_CIRCLE)
      let lateDispatched = false
      const late = () => {
        lateDispatched = true
        throw new Error('Late conditioning dispatch forbidden')
      }
      await assert.rejects(
        held.prepareConditioning({
          composeTarget: async () => late(),
          conditionSmartPatch: async () => late(),
          prepareSmartPatch: async () => late(),
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

const MODEL_SOURCE_BBOX = { height: 8, width: 8, x: -3, y: -4 }
const MODEL_SOURCE_COHERENCE: SmartPatchCoherenceParameters = {
  edgeSize: 0,
  minimumDenoise: 0,
  mode: 'Gaussian Blur',
}

function literalModelSourceFixture(
  mode: 'img2img' | 'inpaint' | 'outpaint' | 'txt2img',
): FixtureOptions {
  return {
    bbox: { ...MODEL_SOURCE_BBOX },
    coherenceSettings: { ...MODEL_SOURCE_COHERENCE },
    mask:
      mode === 'inpaint'
        ? {
            alpha: [64],
            bounds: { height: 1, width: 1, x: -3, y: -4 },
          }
        : null,
    maskSettings: { blur: 0, padding: 8 },
    sourceRgba: Array.from({ length: 64 }, () => [
      32,
      64,
      96,
      mode === 'txt2img' ? 0 : mode === 'outpaint' ? 128 : 255,
    ]).flat(),
  }
}

function expectLiteralModelRgb(
  result: Awaited<ReturnType<CapturedSmartPatchGenerationInput['prepareModelSource']>>,
  observed: CpuObservation[],
): void {
  assert.ok(result.modelSource, 'Image modes require actual model RGB bytes')
  assert.deepEqual([result.modelSource.width, result.modelSource.height], [8, 8])
  assert.equal(result.modelSource.byteSize, result.modelSource.bytes.length)
  assert.equal(result.modelSource.sha256, digest(result.modelSource.bytes))
  assert.equal(result.modelSource.colorSpace, 'srgb')
  assert.equal(result.modelSource.iccSha256, IGS_SRGB_ICC_SHA256)
  assert.equal(result.modelSource.bytes[24], 8, 'Model source is actual PNG RGB8')
  assert.equal(result.modelSource.bytes[25], 2, 'Model source contains RGB rather than RGBA pixels')
  const decoded = observed.at(-1)?.decoded.modelSource
  assert.ok(decoded)
  assert.equal(decoded.mode, 'RGB')
  assert.equal(decoded.iccSha256, IGS_SRGB_ICC_SHA256)
  const literal = Buffer.from(Array.from({ length: 64 }, () => [32, 64, 96]).flat())
  assert.ok(
    Buffer.from(decoded.rgbBase64, 'base64').equals(literal),
    'Actual model-source pixels differ from literal unpremultiplied RGB',
  )
}

// Boundary: actual ProjectService capture -> transport -> production CPU protocol -> RGB consumer.
// Oracle: literal same-size pixels, null TXT, independently decoded RGB8/sRGB and persisted state.
// Neighbor: only source alpha or authored-mask coverage changes IMG/INP/TXT mode. A resolver
// that throws proves that non-OUT modes neither resolve nor approximate LaMa.
for (const mode of ['txt2img', 'img2img', 'inpaint'] as const) {
  test(`actual ${mode} model-source preparation returns its literal RGB/null contract without LaMa or Project effects`, async () => {
    await fixture(literalModelSourceFixture(mode), async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      let resourceCalls = 0
      const resolver: OutpaintInfillResolver = {
        async resolveVerifiedOutpaintInfill(): Promise<never> {
          resourceCalls++
          throw new Error('Non-OUT model preparation must not resolve LaMa')
        },
      }
      const result = await f.service.withCapturedSmartPatchGenerationInput(
        f.tabId,
        f.patch.id,
        (capture) => capture.prepareModelSource(cpuWorker(f, observed), resolver),
      )
      assert.equal(result.mode, mode)
      assert.equal(resourceCalls, 0)
      assert.deepEqual(result.context.bbox, MODEL_SOURCE_BBOX)
      assert.equal(result.context.lastActualSeedSnapshot, 0)
      assert.equal(result.context.generationDraft.positivePrompt.text, 'frozen owned prompt')
      assert.deepEqual(result.coherence, MODEL_SOURCE_COHERENCE)
      assert.deepEqual(
        Object.keys(result.conditioning).sort(),
        [
          'expandedProcessingKeepMask',
          'expandedWorldKeepMask',
          'finalContributionMask',
          'latentKeepMask',
          'latentMaskHasCoverage',
          'processingKeepMask',
          'worldKeepMask',
        ].sort(),
      )
      assert.deepEqual(
        observed.map((entry) => entry.response.type),
        [
          'target-done',
          'smart-patch-prepared',
          'smart-patch-conditioned',
          ...(mode === 'txt2img' ? [] : ['smart-patch-model-source-prepared']),
        ],
      )
      if (mode === 'txt2img') {
        assert.equal(result.modelSource, null)
        assert.equal(
          observed.some((entry) => entry.decoded.modelSource),
          false,
        )
      } else {
        expectLiteralModelRgb(result, observed)
        assert.ok(
          !result.modelSource!.bytes.equals(result.processingSource.bytes),
          'The detached RGB publication differs from its RGBA processing input',
        )
      }
      if (mode === 'inpaint') {
        assert.ok(result.maskPngBytes?.equals(f.maskBytes!))
        expectNumericMask(
          observed,
          'worldKeepMask',
          [191, ...Array.from({ length: 63 }, () => 255)],
          2,
        )
      }
      await unchanged(f, before)
    })
  })
}

test('frozen model-source operation ignores exposed aliases and a later real owned geometry/profile edit', async () => {
  await fixture(literalModelSourceFixture('inpaint'), async (f) => {
    const observed: CpuObservation[] = []
    const actual = cpuWorker(f, observed)
    const afterEdit = await f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      async (capture) => {
        capture.context.bbox.x = 900
        capture.context.internalResolution.width = 999
        capture.context.coherenceSettings.edgeSize = 1024
        capture.context.maskSettings.blur = 512
        capture.document.layers = []
        capture.maskPngBytes?.fill(0)
        await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, {
          kind: 'internal-resolution',
          size: { height: 16, width: 16 },
        })
        const tab = f.service.getOpenTabs()[0]
        await f.service.updateSmartPatchLayer(f.tabId, f.patch.id, {
          documentId: tab.documentId,
          documentRevision: tab.documentRevision,
          kind: 'coherence-settings',
          value: { edgeSize: 8, minimumDenoise: 0.25, mode: 'Staged' },
        })
        await f.service.flushAutosave(f.tabId)
        const ownedAfterEdit = await state(f)
        const first = await capture.prepareModelSource(actual)
        expectLiteralModelRgb(first, observed)
        assert.equal(first.mode, 'inpaint')
        assert.deepEqual(first.context.bbox, MODEL_SOURCE_BBOX)
        assert.deepEqual(first.context.internalResolution, { height: 8, width: 8 })
        assert.deepEqual(first.coherence, MODEL_SOURCE_COHERENCE)
        assert.deepEqual(first.context.maskSettings, { blur: 0, padding: 8 })
        assert.ok(first.maskPngBytes?.equals(f.maskBytes!))
        const originalRgbHash = first.modelSource!.sha256
        first.modelSource!.bytes.fill(0)
        first.processingSource.bytes.fill(0)
        first.conditioning.worldKeepMask.bytes.fill(0)
        first.context.coherenceSettings.edgeSize = 512
        const second = await capture.prepareModelSource(actual)
        expectLiteralModelRgb(second, observed)
        assert.equal(second.modelSource!.sha256, originalRgbHash)
        assert.deepEqual(second.coherence, MODEL_SOURCE_COHERENCE)
        return ownedAfterEdit
      },
    )
    await unchanged(f, afterEdit)
  })
})

test('actual frozen OUT alone requests LaMa and preserves all state when its resolver refuses', async () => {
  await fixture(literalModelSourceFixture('outpaint'), async (f) => {
    const before = await state(f)
    const observed: CpuObservation[] = []
    let resourceCalls = 0
    let sourceCalls = 0
    const actual = cpuWorker(f, observed)
    await assert.rejects(
      f.service.withCapturedSmartPatchGenerationInput(f.tabId, f.patch.id, (capture) =>
        capture.prepareModelSource(
          {
            ...actual,
            async prepareSmartPatchModelSource(input) {
              sourceCalls++
              return actual.prepareSmartPatchModelSource(input)
            },
          },
          {
            async resolveVerifiedOutpaintInfill(): Promise<never> {
              resourceCalls++
              throw new Error('Intentional verified LaMa unavailable')
            },
          },
        ),
      ),
      /Intentional verified LaMa unavailable/,
    )
    assert.equal(resourceCalls, 1)
    assert.equal(sourceCalls, 0)
    assert.deepEqual(
      observed.map((entry) => entry.response.type),
      ['target-done', 'smart-patch-prepared', 'smart-patch-conditioned'],
    )
    await unchanged(f, before)
  })
})

for (const corruption of [
  'model-source-rgba',
  'model-source-icc',
  'metadata-width',
  'metadata-hash',
] as const) {
  test(`actual late ${corruption} model-source adapter result is refused by Main consumption with no Project effects`, async () => {
    await fixture(literalModelSourceFixture('img2img'), async (f) => {
      const before = await state(f)
      const observed: CpuObservation[] = []
      const actual = cpuWorker(f, observed)
      // Declared seam: only the final transport adapter is bypassed. Source creation,
      // preparation, conditioning and RGB publication all run real protocol routes.
      // A content fault updates its claimed hash, so Main must inspect the PNG itself.
      await assert.rejects(
        f.service.withCapturedSmartPatchGenerationInput(f.tabId, f.patch.id, (capture) =>
          capture.prepareModelSource({
            ...actual,
            async prepareSmartPatchModelSource(input) {
              const response = await actualCpu(
                'prepare-smart-patch-model-source',
                {
                  infillResource: input.infillResource,
                  mode: input.mode,
                  output: {
                    modelSourcePngPath: input.modelSourcePngPath,
                    stagingRoot: input.stagingRoot,
                  },
                  source: input.source,
                },
                observed,
                corruption === 'model-source-rgba' || corruption === 'model-source-icc'
                  ? corruption
                  : undefined,
              )
              const metadata = response.modelSource as Record<string, unknown>
              assert.ok(metadata)
              assert.ok(input.modelSourcePngPath)
              return {
                modelSource: {
                  byteSize: metadata.byteSize as number,
                  colorSpace: 'srgb',
                  height: metadata.height as number,
                  iccSha256: IGS_SRGB_ICC_SHA256,
                  path: input.modelSourcePngPath,
                  sha256:
                    corruption === 'metadata-hash' ? '0'.repeat(64) : (metadata.sha256 as string),
                  width: corruption === 'metadata-width' ? 16 : (metadata.width as number),
                },
              }
            },
          }),
        ),
        /source|image|PNG|RGB|profile|ICC|dimension|output|metadata/i,
      )
      assert.equal(observed.at(-1)?.response.type, 'smart-patch-model-source-prepared')
      assert.equal(observed.length, 4)
      await unchanged(f, before)
      const control: CpuObservation[] = []
      const valid = await f.service.withCapturedSmartPatchGenerationInput(
        f.tabId,
        f.patch.id,
        (capture) => capture.prepareModelSource(cpuWorker(f, control)),
      )
      expectLiteralModelRgb(valid, control)
      await unchanged(f, before)
    })
  })
}

test('an admitted model-source chain drains after callback failure and refuses retained late calls', async () => {
  await fixture(literalModelSourceFixture('img2img'), async (f) => {
    const before = await state(f)
    const observed: CpuObservation[] = []
    const actual = cpuWorker(f, observed)
    let entered!: () => void
    const sourceEntered = new Promise<void>((resolve) => {
      entered = resolve
    })
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let held!: CapturedSmartPatchGenerationInput
    let stage = ''
    let sourceFinished = false
    let callbackSettled = false
    const pending: {
      operation: ReturnType<CapturedSmartPatchGenerationInput['prepareModelSource']> | null
    } = { operation: null }
    const capturing = f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      async (capture) => {
        held = capture
        pending.operation = capture.prepareModelSource({
          ...actual,
          async prepareSmartPatchModelSource(input) {
            stage = input.stagingRoot
            entered()
            await released
            assert.ok(existsSync(stage), 'Admitted RGB work retains its source staging')
            const result = await actual.prepareSmartPatchModelSource(input)
            sourceFinished = true
            return result
          },
        })
        void pending.operation.catch(() => undefined)
        await sourceEntered
        throw new Error('Intentional callback failure during model-source operation')
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
        sourceEntered,
        capturing.then(() => assert.fail('Capture settled before its RGB source witness')),
      ])
      await new Promise<void>((resolve) => {
        setImmediate(resolve)
      })
      assert.equal(callbackSettled, false)
      assert.equal(sourceFinished, false)
      assert.ok(existsSync(stage))
      release()
      await assert.rejects(capturing, /Intentional callback failure during model-source operation/)
      assert.ok(pending.operation)
      await assert.doesNotReject(
        pending.operation,
        'Admitted RGB work completes before staging cleanup',
      )
      const completed = await pending.operation
      expectLiteralModelRgb(completed, observed)
      assert.equal(sourceFinished, true)
      assert.equal(existsSync(stage), false)
      let lateDispatched = false
      const late = async (): Promise<never> => {
        lateDispatched = true
        throw new Error('Late model-source dispatch forbidden')
      }
      await assert.rejects(
        held.prepareModelSource({
          composeTarget: late,
          conditionSmartPatch: late,
          prepareSmartPatch: late,
          prepareSmartPatchModelSource: late,
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
