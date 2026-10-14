import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
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
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { crc32, deflateSync } from 'node:zlib'

import type { ComposeTargetInput, ProjectWorkerClient } from './worker-client.js'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { fixtureMaskPng, paintedPatchFixture } from './test-fixtures/project-mask.js'

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../../..')
const WORKER_SOURCE = path.join(REPOSITORY_ROOT, 'worker-python/src')
const PYTHON = path.join(REPOSITORY_ROOT, 'worker-python/.venv/bin/python')
const ORACLE = path.join(import.meta.dirname, 'test-fixtures/smart-patch-composition-oracle.py')
const BBOX: IgsRectV1 = { height: 3, width: 4, x: -12, y: -6 }
const PRIMARY_BBOX: IgsRectV1 = { height: 8, width: 8, x: -16, y: -8 }
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const execFileAsync = promisify(execFile)

type Fixture = {
  database: ReturnType<typeof openAppDatabase>
  document: IgsProjectDocumentV1
  lowerIds: string[]
  maskBytes: Buffer | null
  packagePath: string
  patch: IgsSmartPatchLayerV1
  scratch: string
  service: ProjectService
  shadow: ProjectShadowStore
  tabId: string
}

type CpuObservation = {
  compositorPath: string
  decoded: {
    format: string
    height: number
    iccSha256: string
    mode: string
    rgbaBase64: string
    width: number
  }
  loadedMlModules: string[]
  pillowVersion: string
  response: {
    composite: {
      byteSize: number
      colorSpace: 'srgb'
      height: number
      sha256: string
      width: number
    }
    mode: 'img2img' | 'outpaint' | 'txt2img'
    rect: IgsRectV1
    type: string
  }
}

/** Input-only PNG builder; neither expected output nor the compositor is implemented here. */
function sourcePng(
  profile: Buffer,
  width: number,
  height: number,
  rgba: readonly number[],
): Buffer {
  assert.equal(rgba.length, 4)
  const chunk = (name: string, bytes: Buffer): Buffer => {
    const result = Buffer.alloc(bytes.length + 12)
    result.writeUInt32BE(bytes.length, 0)
    result.write(name, 4, 'ascii')
    bytes.copy(result, 8)
    result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4)
    return result
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      rows.set(rgba, y * (width * 4 + 1) + 1 + x * 4)
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('iCCP', Buffer.concat([Buffer.from('srgb\0\0'), deflateSync(profile)])),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function raster(name: string, bytes: Buffer, rect: IgsRectV1): IgsRasterLayerV1 {
  const id = randomUUID()
  return {
    asset: {
      bytes: bytes.length,
      height: rect.height,
      path: `assets/layers/${id}.png`,
      sha256: digest(bytes),
      width: rect.width,
    },
    blendMode: 'normal',
    id,
    kind: 'raster',
    locked: false,
    name,
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: rect.x, y: rect.y },
    visible: true,
  }
}

async function fixture(
  run: (value: Fixture) => Promise<void>,
  withLowerAndMask = true,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-patch-real-composition-'))
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
    const document = createEmptyProjectDocumentV1({ title: 'Independent real CPU Patch source' })
    document.primaryBbox = { ...PRIMARY_BBOX }
    document.generationDraft.positivePrompt.text = 'normal full-stack source'
    document.lastActualSeedSnapshot = 0
    const maskBytes = withLowerAndMask ? fixtureMaskPng() : null
    const patch = paintedPatchFixture(document)
    patch.name = 'Target B'
    patch.boundingBox = { ...BBOX }
    patch.internalResolution = { height: 128, width: 256 }
    patch.generationDraft.positivePrompt.text = 'owned B source'
    patch.maskSettings = { blur: 31, padding: 5 }
    if (maskBytes && patch.mask.asset) {
      patch.mask.bounds = { height: 2, width: 2, x: -11, y: -5 }
    } else {
      patch.mask = { asset: null, id: patch.mask.id, revision: 1 }
    }
    const redBytes = sourcePng(profile, 8, 8, [255, 0, 0, 255])
    const blueBytes = sourcePng(profile, 3, 3, [0, 0, 255, 255])
    const greenBytes = sourcePng(profile, 4, 3, [0, 255, 0, 255])
    const above = raster('Red above target', redBytes, PRIMARY_BBOX)
    const blue = raster('Blue immediately below target', blueBytes, { ...BBOX, width: 3 })
    const green = raster('Green bottom source', greenBytes, BBOX)
    document.layers = [above, patch, ...(withLowerAndMask ? [blue, green] : [])]
    const assets = {
      [above.asset.path]: { bytes: redBytes },
      ...(withLowerAndMask
        ? { [blue.asset.path]: { bytes: blueBytes }, [green.asset.path]: { bytes: greenBytes } }
        : {}),
      ...(maskBytes && patch.mask.asset ? { [patch.mask.asset.path]: { bytes: maskBytes } } : {}),
    }
    const sourcePath = path.join(root, 'source.igs')
    await saveIgsPackage(sourcePath, {
      assets,
      preview: {
        ...(await readProjectPlaceholders(placeholdersDir, 'unavailable')),
        rect: PRIMARY_BBOX,
        status: 'unavailable',
      },
      project: document,
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      assert.fail('Actual source package must be imported')
    }
    const imported = await service.finishImport(selected.importId, 'copy')
    assert.equal(imported.result.kind, 'opened')
    if (imported.result.kind !== 'opened') {
      assert.fail('Actual imported Project must open')
    }
    const packagePath = (await repository.listProjects())[0].canonicalPath
    await run({
      database,
      document,
      lowerIds: withLowerAndMask ? [blue.id, green.id] : [],
      maskBytes,
      packagePath,
      patch,
      scratch,
      service,
      shadow,
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

/** Controlled transport invokes the real production parser/compositor, not a supplied PNG reply. */
function cpuWorker(observed: CpuObservation[]): Pick<ProjectWorkerClient, 'composeTarget'> {
  return {
    async composeTarget(input: ComposeTargetInput) {
      assert.ok(existsSync(PYTHON), 'The existing checkout CPU Python environment is required')
      const envelope = {
        bbox: input.bbox,
        layers: input.layers,
        output: { stagingRoot: input.stagingRoot, targetPngPath: input.targetPngPath },
        protocolVersion: '1',
        requestId: 'real-cpu-patch-source',
        type: 'compose-target',
      }
      const execution = execFileAsync(PYTHON, ['-I', '-B', ORACLE, WORKER_SOURCE], {
        cwd: REPOSITORY_ROOT,
        maxBuffer: 256 * 1024,
        timeout: 10_000,
      })
      assert.ok(execution.child.stdin)
      execution.child.stdin.end(JSON.stringify(envelope))
      const { stderr, stdout } = await execution
      assert.equal(stderr, '')
      const result = JSON.parse(stdout) as CpuObservation
      assert.equal(result.response.type, 'target-done')
      assert.equal(result.compositorPath, path.join(WORKER_SOURCE, 'imagegen_worker/compositor.py'))
      assert.equal(result.pillowVersion, '12.2.0')
      assert.deepEqual(result.loadedMlModules, [])
      assert.deepEqual(
        {
          format: result.decoded.format,
          height: result.decoded.height,
          iccSha256: result.decoded.iccSha256,
          mode: result.decoded.mode,
          width: result.decoded.width,
        },
        {
          format: 'PNG',
          height: input.bbox.height,
          iccSha256: IGS_SRGB_ICC_SHA256,
          mode: 'RGBA',
          width: input.bbox.width,
        },
      )
      observed.push(result)
      return {
        composite: {
          ...result.response.composite,
          iccSha256: result.decoded.iccSha256,
          path: input.targetPngPath,
        },
        mode: result.response.mode,
        rect: result.response.rect,
      }
    },
  }
}

async function unchanged(
  f: Fixture,
  before: { document: IgsProjectDocumentV1; package: Buffer; shadow: unknown; tab: unknown },
) {
  assert.deepEqual(f.service.getOpenDocumentForAcceptance(f.tabId)!.document, before.document)
  assert.deepEqual(f.service.getOpenTabs()[0], before.tab)
  assert.deepEqual(await readFile(f.packagePath), before.package)
  assert.deepEqual(
    await f.shadow.inspect({
      projectPath: f.packagePath,
      savedPackage: await readIgsPackage(f.packagePath),
    }),
    before.shadow,
  )
  assert.deepEqual(
    await f.database.db.selectFrom('generation_queue_item').selectAll().execute(),
    [],
  )
  assert.deepEqual(await readdir(f.scratch), [])
}

async function baseline(f: Fixture) {
  return {
    document: structuredClone(f.service.getOpenDocumentForAcceptance(f.tabId)!.document),
    package: await readFile(f.packagePath),
    shadow: await f.shadow.inspect({
      projectPath: f.packagePath,
      savedPackage: await readIgsPackage(f.packagePath),
    }),
    tab: f.service.getOpenTabs()[0],
  }
}

test('actual CPU Patch source excludes red above, preserves top-first blue/green below and frozen mask; normal full-stack control stays red', async () => {
  await fixture(async (f) => {
    const before = await baseline(f)
    const observed: CpuObservation[] = []
    const worker = cpuWorker(observed)
    let stage = ''
    let maskPath = ''
    const source = await f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      async (capture) => {
        assert.deepEqual(capture.context.bbox, { height: 3, width: 4, x: -12, y: -6 })
        assert.deepEqual(capture.context.internalResolution, { height: 128, width: 256 })
        assert.deepEqual(capture.context.maskSettings, { blur: 31, padding: 5 })
        assert.deepEqual(capture.context.sourceLayerIds, f.lowerIds)
        assert.equal(capture.context.generationDraft.positivePrompt.text, 'owned B source')
        assert.equal(capture.context.lastActualSeedSnapshot, 0)
        assert.deepEqual(capture.maskPngBytes, f.maskBytes)
        assert.ok(capture.maskPngPath)
        maskPath = capture.maskPngPath
        assert.deepEqual(await readFile(maskPath), f.maskBytes)
        // Caller mutations must not alter the authoritative private world-space snapshot.
        capture.context.bbox.x = 100
        capture.context.generationDraft.positivePrompt.text = 'changed public view'
        capture.context.maskSettings.blur = 0
        capture.document.primaryBbox.x = 900
        const exposedBlue = capture.document.layers.find((layer) => layer.id === f.lowerIds[0])
        assert.ok(exposedBlue && exposedBlue.kind === 'raster')
        exposedBlue.transform.x = 500
        capture.maskPngBytes!.fill(0)
        assert.deepEqual(
          await readFile(maskPath),
          f.maskBytes,
          'Mutating a public mask buffer cannot alter the actual Main lease',
        )
        return await capture.composeSource({
          async composeTarget(input) {
            stage = input.stagingRoot
            assert.deepEqual(input.bbox, { height: 3, width: 4, x: -12, y: -6 })
            assert.equal(input.layers.length, 2)
            return await worker.composeTarget(input)
          },
        })
      },
    )
    assert.deepEqual(source.context.bbox, BBOX)
    assert.equal(source.context.projectKey, f.tabId)
    assert.equal(source.context.documentId, before.document.documentId)
    assert.equal(source.context.documentRevision, before.document.documentRevision)
    assert.equal(source.context.layerId, f.patch.id)
    assert.deepEqual(source.context.internalResolution, { height: 128, width: 256 })
    assert.deepEqual(source.context.sourceLayerIds, f.lowerIds)
    assert.deepEqual(source.context.maskSettings, { blur: 31, padding: 5 })
    assert.equal(source.context.generationDraft.positivePrompt.text, 'owned B source')
    assert.deepEqual(source.maskPngBytes, f.maskBytes)
    assert.deepEqual(source.context.mask, f.patch.mask)
    assert.equal(source.sourceAlpha, 'opaque')
    assert.equal(source.source.width, 4)
    assert.equal(source.source.height, 3)
    assert.equal(source.source.sha256, digest(source.source.bytes))
    const expected = Buffer.from([
      0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 255,
      255, 0, 0, 255, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 255,
      0, 255,
    ])
    assert.deepEqual(
      Buffer.from(observed[0].decoded.rgbaBase64, 'base64'),
      expected,
      'Actual production RGBA rows must contain exactly three blue columns and one green column, never red or mask white',
    )
    assert.equal(existsSync(stage), false)
    assert.equal(existsSync(maskPath), false)
    const normal = await f.service.withCapturedNormalGenerationInput(f.tabId, (capture) =>
      capture.composeTarget(worker),
    )
    assert.deepEqual(normal.bbox, PRIMARY_BBOX)
    assert.equal(normal.generationDraft.positivePrompt.text, 'normal full-stack source')
    assert.equal(normal.mode, 'img2img')
    assert.deepEqual(
      Buffer.from(observed[1].decoded.rgbaBase64, 'base64'),
      Buffer.from(Array.from({ length: 64 }, () => [255, 0, 0, 255]).flat()),
      'The ordinary real full-stack composite remains opaque red',
    )
    await unchanged(f, before)
  })
})

test('actual CPU empty Patch with no lower source stays transparent despite red above; normal control stays red', async () => {
  await fixture(async (f) => {
    const before = await baseline(f)
    const observed: CpuObservation[] = []
    const worker = cpuWorker(observed)
    const source = await f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      (capture) => capture.composeSource(worker),
    )
    assert.deepEqual(source.context.bbox, BBOX)
    assert.deepEqual(source.context.sourceLayerIds, [])
    assert.equal(source.context.mask.asset, null)
    assert.equal(source.maskPngBytes, null)
    assert.equal(source.sourceAlpha, 'transparent')
    assert.deepEqual(
      Buffer.from(observed[0].decoded.rgbaBase64, 'base64'),
      Buffer.alloc(4 * 3 * 4),
      'Red above an empty target cannot leak into its actual transparent source',
    )
    const normal = await f.service.withCapturedNormalGenerationInput(f.tabId, (capture) =>
      capture.composeTarget(worker),
    )
    assert.equal(normal.mode, 'img2img')
    assert.deepEqual(
      Buffer.from(observed[1].decoded.rgbaBase64, 'base64'),
      Buffer.from(Array.from({ length: 64 }, () => [255, 0, 0, 255]).flat()),
    )
    await unchanged(f, before)
  }, false)
})

test('actual CPU normal-only neighboring control keeps the entire top-first stack and opaque red source', async () => {
  await fixture(async (f) => {
    const before = await baseline(f)
    const observed: CpuObservation[] = []
    const normal = await f.service.withCapturedNormalGenerationInput(f.tabId, (capture) =>
      capture.composeTarget(cpuWorker(observed)),
    )
    assert.deepEqual(normal.bbox, PRIMARY_BBOX)
    assert.equal(normal.generationDraft.positivePrompt.text, 'normal full-stack source')
    assert.equal(normal.mode, 'img2img')
    assert.equal(normal.composite.width, 8)
    assert.equal(normal.composite.height, 8)
    assert.equal(normal.composite.sha256, digest(normal.composite.bytes))
    assert.deepEqual(
      Buffer.from(observed[0].decoded.rgbaBase64, 'base64'),
      Buffer.from(Array.from({ length: 64 }, () => [255, 0, 0, 255]).flat()),
      'A Smart Patch source-scope change cannot alter this independent ordinary full-stack compositor control',
    )
    await unchanged(f, before)
  })
})

test('actual CPU source alpha observes visible half-opacity and hidden lower-layer neighbors while ordinary full-stack control remains opaque red', async () => {
  await fixture(async (f) => {
    const [blueId, greenId] = f.lowerIds
    await f.service.updateRasterLayer(f.tabId, greenId, { kind: 'visibility', visible: false })
    await f.service.updateRasterLayer(f.tabId, blueId, { kind: 'opacity', opacity: 0.5 })
    await f.service.save(f.tabId)
    const mixedBefore = await baseline(f)
    const observed: CpuObservation[] = []
    const worker = cpuWorker(observed)
    const mixed = await f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      (capture) => capture.composeSource(worker),
    )
    assert.equal(mixed.sourceAlpha, 'mixed')
    assert.deepEqual(mixed.context.sourceLayerIds, [blueId])
    assert.deepEqual(mixed.maskPngBytes, f.maskBytes)
    assert.deepEqual(
      Buffer.from(observed[0].decoded.rgbaBase64, 'base64'),
      Buffer.from([
        0, 0, 255, 127, 0, 0, 255, 127, 0, 0, 255, 127, 0, 0, 0, 0, 0, 0, 255, 127, 0, 0, 255, 127,
        0, 0, 255, 127, 0, 0, 0, 0, 0, 0, 255, 127, 0, 0, 255, 127, 0, 0, 255, 127, 0, 0, 0, 0,
      ]),
      'Actual half-opacity blue is alpha127, hidden green contributes nothing and the last column is exactly transparent',
    )
    await f.service.withCapturedNormalGenerationInput(f.tabId, (capture) =>
      capture.composeTarget(worker),
    )
    assert.deepEqual(
      Buffer.from(observed[1].decoded.rgbaBase64, 'base64'),
      Buffer.from(Array.from({ length: 64 }, () => [255, 0, 0, 255]).flat()),
    )
    await unchanged(f, mixedBefore)

    await f.service.updateRasterLayer(f.tabId, blueId, { kind: 'visibility', visible: false })
    await f.service.save(f.tabId)
    const hiddenBefore = await baseline(f)
    const empty = await f.service.withCapturedSmartPatchGenerationInput(
      f.tabId,
      f.patch.id,
      (capture) => capture.composeSource(worker),
    )
    assert.equal(empty.sourceAlpha, 'transparent')
    assert.deepEqual(empty.context.sourceLayerIds, [])
    assert.deepEqual(
      empty.maskPngBytes,
      f.maskBytes,
      'Nonempty owned paint is retained independently from an empty source composite',
    )
    assert.deepEqual(Buffer.from(observed[2].decoded.rgbaBase64, 'base64'), Buffer.alloc(4 * 3 * 4))
    await f.service.withCapturedNormalGenerationInput(f.tabId, (capture) =>
      capture.composeTarget(worker),
    )
    assert.deepEqual(
      Buffer.from(observed[3].decoded.rgbaBase64, 'base64'),
      Buffer.from(Array.from({ length: 64 }, () => [255, 0, 0, 255]).flat()),
    )
    await unchanged(f, hiddenBefore)
  })
})
