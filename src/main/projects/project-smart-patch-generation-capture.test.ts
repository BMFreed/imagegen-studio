import type { ProjectSmartPatchLayerView, ProjectTab } from '../../shared/api.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type {
  IgsProjectDocumentV1,
  IgsRasterLayerV1,
  IgsSmartPatchLayerV1,
} from '../../shared/projects/project-schema.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { CapturedSmartPatchGenerationInput } from './project-smart-patch-generation-input.js'
import type { ComposeTargetInput, ProjectWorkerClient } from './worker-client.js'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { decodeProjectMaskPng, readProjectMaskSource } from './project-mask.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  acceptedOutputPngFixture,
  transparentTargetPngFixture,
} from './test-fixtures/accepted-provenance.js'

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

interface Fixture {
  above: IgsRasterLayerV1
  below: IgsRasterLayerV1
  bottom: IgsRasterLayerV1
  database: ReturnType<typeof openAppDatabase>
  first: IgsSmartPatchLayerV1
  opaquePng: Buffer
  packagePath: string
  root: string
  scratch: string
  second: IgsSmartPatchLayerV1
  service: ProjectService
  shadow: ProjectShadowStore
  tabId: string
}

function raster(bytes: Buffer, name: string, x: number, y: number): IgsRasterLayerV1 {
  const id = randomUUID()
  return {
    asset: {
      bytes: bytes.length,
      height: bytes.readUInt32BE(20),
      path: `assets/layers/${id}.png`,
      sha256: digest(bytes),
      width: bytes.readUInt32BE(16),
    },
    blendMode: 'normal',
    id,
    kind: 'raster',
    locked: false,
    name,
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x, y },
    visible: true,
  }
}

function patch(document: IgsProjectDocumentV1, name: string, x: number): IgsSmartPatchLayerV1 {
  const generationDraft = structuredClone(document.generationDraft)
  generationDraft.positivePrompt.text = `${name} owned prompt`
  generationDraft.seed = { policy: 'fixed', value: 0 }
  return {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { height: 3, width: 4, x, y: -6 },
    generationDraft,
    id: randomUUID(),
    internalResolution: { height: 128, width: 256 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    name,
    opacity: 1,
    rasterSubLayers: [],
    visible: true,
  }
}

async function withProject(run: (fixture: Fixture) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-smart-patch-input-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const scratch = path.join(root, 'scratch')
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: root,
    repository,
    roots: { placeholdersDir: path.resolve('src/main/projects/placeholders'), scratchDir: scratch },
    shadow,
  })
  try {
    const document = createEmptyProjectDocumentV1({ title: 'Literal owned capture' })
    document.primaryBbox = { height: 8, width: 8, x: -16, y: -8 }
    document.generationDraft.positivePrompt.text = 'independent normal prompt'
    document.lastActualSeedSnapshot = 0
    const opaquePng = await acceptedOutputPngFixture(4, 3)
    const abovePng = await acceptedOutputPngFixture(8, 8)
    const above = raster(abovePng, 'Above', -16, -8)
    const below = raster(opaquePng, 'Below', -12, -6)
    const bottom = raster(opaquePng, 'Bottom', -12, -6)
    const hidden = { ...raster(opaquePng, 'Hidden below', -12, -6), visible: false }
    const zero = { ...raster(opaquePng, 'Zero-opacity below', -12, -6), opacity: 0 }
    const first = patch(document, 'Patch A', 20)
    const second = patch(document, 'Patch B', -12)
    document.layers = [above, first, second, below, hidden, zero, bottom]
    const external = path.join(root, 'input.igs')
    await saveIgsPackage(external, {
      assets: Object.fromEntries(
        [above, below, hidden, zero, bottom].map((layer) => [
          layer.asset.path,
          { bytes: layer.id === above.id ? abovePng : opaquePng },
        ]),
      ),
      preview: {
        ...(await readProjectPlaceholders(
          path.resolve('src/main/projects/placeholders'),
          'unavailable',
        )),
        rect: document.primaryBbox,
        status: 'unavailable',
      },
      project: document,
    })
    const selection = await service.selectImport(external)
    assert.equal(selection.kind, 'transfer-required')
    if (selection.kind !== 'transfer-required') {
      throw new Error('Fixture must enter actual Project import.')
    }
    const imported = await service.finishImport(selection.importId, 'copy')
    assert.equal(imported.result.kind, 'opened')
    if (imported.result.kind !== 'opened') {
      throw new Error('Fixture import must open.')
    }
    const packagePath = (await repository.listProjects())[0].canonicalPath
    await run({
      above,
      below,
      bottom,
      database,
      first,
      opaquePng,
      packagePath,
      root,
      scratch,
      second,
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

function owned(tab: ProjectTab, id: string): ProjectSmartPatchLayerView {
  const layer = tab.layers.find((candidate) => candidate.id === id)
  assert.ok(layer?.kind === 'smart-patch')
  return layer
}

async function paint(fixture: Fixture) {
  const { second, service, tabId } = fixture
  const tab = service.getOpenTabs()[0]
  const mask = owned(tab, second.id).mask
  return await service.editSmartPatchMask(tabId, second.id, {
    documentId: tab.documentId,
    documentRevision: tab.documentRevision,
    edit: {
      kind: 'polygon',
      operation: 'add',
      points: [
        { x: -11, y: -5 },
        { x: -9, y: -5 },
        { x: -9, y: -3 },
        { x: -11, y: -3 },
      ],
    },
    maskId: mask.id,
    maskRevision: mask.revision,
  })
}

async function maskBytes(service: ProjectService, tabId: string, layerId: string): Promise<Buffer> {
  const coordinator = service.getOpenDocumentForAcceptance(tabId)
  assert.ok(coordinator)
  const layer = coordinator.document.layers.find((candidate) => candidate.id === layerId)
  assert.ok(layer?.kind === 'smart-patch' && layer.mask.asset)
  const source = coordinator.getCurrentAssetSource(layer.mask.asset)
  return source
    ? await readProjectMaskSource(source, layer.mask.asset)
    : await (await readIgsPackage(coordinator.filePath)).readMember(layer.mask.asset.path)
}

/**
 * Controlled output qualifies capture ownership/verification; actual CPU pixels have a separate
 * test.
 */
function worker(
  bytes: Buffer,
  inspect: (input: ComposeTargetInput) => Promise<void> = async () => undefined,
  mode: 'img2img' | 'outpaint' | 'txt2img' = 'img2img',
): Pick<ProjectWorkerClient, 'composeTarget'> {
  return {
    composeTarget: async (input) => {
      await inspect(input)
      await writeFile(input.targetPngPath, bytes)
      return {
        composite: {
          byteSize: bytes.length,
          colorSpace: 'srgb',
          height: bytes.readUInt32BE(20),
          iccSha256: IGS_SRGB_ICC_SHA256,
          path: input.targetPngPath,
          sha256: digest(bytes),
          width: bytes.readUInt32BE(16),
        },
        mode,
        rect: { ...input.bbox },
      }
    },
  }
}

async function state(fixture: Fixture) {
  const { database, packagePath, service, shadow, tabId } = fixture
  return {
    document: service.getOpenDocumentForAcceptance(tabId)?.document,
    file: await readFile(packagePath),
    queue: await database.db.selectFrom('generation_queue_item').selectAll().execute(),
    receipts: await database.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
    seed: await database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
    shadow: await shadow.inspect({
      projectPath: packagePath,
      savedPackage: await readIgsPackage(packagePath),
    }),
    tab: service.getOpenTabs()[0],
  }
}

async function assertUnchanged(fixture: Fixture, before: Awaited<ReturnType<typeof state>>) {
  const after = await state(fixture)
  const { file: beforeFile, ...beforeState } = before
  const { file: afterFile, ...afterState } = after
  assert.ok(afterFile.equals(beforeFile), 'Capture cannot replace the saved package.')
  assert.deepEqual(afterState, beforeState)
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

test('capture waits for a still-running composition after its callback fails, and closes the retained capability', async () => {
  await withProject(async (fixture) => {
    const { opaquePng, scratch, second, service, tabId } = fixture
    await paint(fixture)
    await service.flushAutosave(tabId)
    const before = await state(fixture)
    let heldCapture: CapturedSmartPatchGenerationInput | null = null
    let sourceEntered!: () => void
    const entered = new Promise<void>((resolve) => {
      sourceEntered = resolve
    })
    let releaseSource!: () => void
    const released = new Promise<void>((resolve) => {
      releaseSource = resolve
    })
    let callbackFailed!: () => void
    const failed = new Promise<void>((resolve) => {
      callbackFailed = resolve
    })
    const failure = new Error('Controlled fast composition failure')
    let slowCompleted = false
    let slowOperation: Promise<unknown> | null = null
    let releaseTimer: ReturnType<typeof setTimeout> | undefined
    const capturing = service.withCapturedSmartPatchGenerationInput(
      tabId,
      second.id,
      async (capture) => {
        heldCapture = capture
        slowOperation = capture.composeSource(
          worker(opaquePng, async (input) => {
            sourceEntered()
            await released
            assert.ok(capture.maskPngPath)
            assert.ok(capture.maskPngBytes)
            assert.ok(
              (await readFile(capture.maskPngPath)).equals(capture.maskPngBytes),
              'The retained mask must survive another composition failure.',
            )
            for (const layer of input.layers) {
              assert.ok(
                (await readFile(layer.path)).equals(opaquePng),
                'The source lease must remain usable until the actual slow composition settles.',
              )
            }
          }),
        )
        void slowOperation.then(
          () => {
            slowCompleted = true
          },
          () => undefined,
        )
        const fast = capture.composeSource({
          composeTarget: async () => {
            await entered
            throw failure
          },
        })
        try {
          return await Promise.all([fast, slowOperation])
        } catch (error) {
          callbackFailed()
          throw error
        }
      },
    )
    void capturing.catch(() => undefined)
    try {
      await failed
      // Controlled worker delay, not an observation sleep: actual completion is witnessed below.
      releaseTimer = setTimeout(releaseSource, 50)
      await assert.rejects(capturing, (error) => error === failure)
      assert.equal(
        slowCompleted,
        true,
        'The outer capture must not settle or remove files before its started composition finishes.',
      )
      const capture = heldCapture as CapturedSmartPatchGenerationInput | null
      assert.ok(capture)
      assert.ok(capture.maskPngPath)
      assert.equal(existsSync(capture.maskPngPath), false)
      let lateWorkerCalled = false
      await assert.rejects(
        capture.composeSource({
          composeTarget: async () => {
            lateWorkerCalled = true
            throw new Error('A retained closed capability cannot dispatch work.')
          },
        }),
        /capture.*closed|lease.*closed/i,
      )
      assert.equal(lateWorkerCalled, false)
      assert.deepEqual(await scratchEntries(scratch), [])
      await assertUnchanged(fixture, before)
    } finally {
      if (releaseTimer) {
        clearTimeout(releaseTimer)
      }
      releaseSource()
      await Promise.allSettled([capturing, slowOperation ?? Promise.resolve()])
    }
  })
})

test('real Smart Patch B capture owns below-only source, original mask, independent inputs and no publication', async () => {
  await withProject(async (fixture) => {
    const { above, below, bottom, opaquePng, scratch, second, service, tabId } = fixture
    let tab = await paint(fixture)
    for (const [kind, value] of [
      ['mask-blur', 31],
      ['bbox-padding', 5],
    ] as const) {
      tab = await service.updateSmartPatchLayer(tabId, second.id, {
        documentId: tab.documentId,
        documentRevision: tab.documentRevision,
        kind,
        value,
      })
    }
    await service.flushAutosave(tabId)
    const before = await state(fixture)
    const expectedMask = await maskBytes(service, tabId, second.id)
    let stage = ''
    const result = await service.withCapturedSmartPatchGenerationInput(
      tabId,
      second.id,
      async (capture) => {
        assert.deepEqual(capture.document, before.document)
        assert.deepEqual(capture.context.sourceLayerIds, [below.id, bottom.id])
        assert.ok(!capture.context.sourceLayerIds.includes(above.id))
        assert.equal(capture.context.projectKey, tabId)
        assert.equal(capture.context.layerId, second.id)
        assert.equal(capture.context.documentRevision, before.tab.documentRevision)
        assert.deepEqual(capture.context.bbox, { height: 3, width: 4, x: -12, y: -6 })
        assert.deepEqual(capture.context.internalResolution, { height: 128, width: 256 })
        assert.deepEqual(
          capture.context.generationDraft,
          owned(before.tab, second.id).generationDraft,
        )
        assert.deepEqual(capture.context.maskSettings, { blur: 31, padding: 5 })
        assert.equal(capture.context.lastActualSeedSnapshot, 0)
        assert.deepEqual(capture.context.mask, owned(before.tab, second.id).mask)
        assert.ok(capture.maskPngBytes?.equals(expectedMask))
        assert.ok(capture.maskPngPath)
        assert.ok((await readFile(capture.maskPngPath)).equals(expectedMask))
        return await capture.composeSource(
          worker(opaquePng, async (input) => {
            stage = path.dirname(input.stagingRoot)
            assert.deepEqual(input.bbox, second.boundingBox)
            assert.deepEqual(
              input.layers.map((layer) => layer.path.endsWith('.png')),
              [true, true],
            )
            assert.deepEqual(
              input.layers.map((layer) => layer.transform),
              [below.transform, bottom.transform],
            )
            assert.equal(input.layers.length, 2)
            for (const layer of input.layers) {
              assert.ok((await readFile(layer.path)).equals(opaquePng))
            }
          }),
        )
      },
    )
    assert.equal(result.sourceAlpha, 'opaque')
    assert.equal(Object.hasOwn(result, 'mode'), false, 'Capture does not invent an inference mode.')
    assert.ok(result.maskPngBytes?.equals(expectedMask))
    assert.ok(result.source.bytes.equals(opaquePng))
    assert.equal(existsSync(stage), false)
    assert.deepEqual(await scratchEntries(scratch), [])
    await assertUnchanged(fixture, before)
  })
})

test('normal neighboring capture preserves full stack and its private draft/layers across repeated adapter mutation', async () => {
  await withProject(async (fixture) => {
    const { above, below, bottom, service, tabId } = fixture
    const normalPng = await acceptedOutputPngFixture(8, 8)
    const before = await state(fixture)
    await service.withCapturedNormalGenerationInput(tabId, async (capture) => {
      const first = await capture.composeTarget(
        worker(normalPng, async (input) => {
          assert.equal(input.layers.length, 3)
          assert.deepEqual(
            input.layers.map((layer) => layer.transform),
            [above.transform, below.transform, bottom.transform],
          )
          input.layers[0].transform.x = 999
          input.layers[0].opacity = 0
        }),
      )
      first.generationDraft.positivePrompt.text = 'Mutated returned target'
      capture.document.generationDraft.positivePrompt.text = 'Mutated callback document'
      const second = await capture.composeTarget(
        worker(normalPng, async (input) => {
          assert.equal(input.layers[0].transform.x, -16)
          assert.equal(input.layers[0].opacity, 1)
        }),
      )
      assert.equal(second.generationDraft.positivePrompt.text, 'independent normal prompt')
      assert.deepEqual(second.bbox, before.tab.primaryBbox)
    })
    await assertUnchanged(fixture, before)
  })
})

test('callback and returned Smart Patch metadata/mask buffers cannot poison a later compose from the same lease', async () => {
  await withProject(async (fixture) => {
    const { opaquePng, second, service, tabId } = fixture
    await paint(fixture)
    const before = await state(fixture)
    const expectedMask = await maskBytes(service, tabId, second.id)
    await service.withCapturedSmartPatchGenerationInput(tabId, second.id, async (capture) => {
      capture.context.bbox.x = 600
      capture.context.internalResolution.width = 1024
      capture.context.generationDraft.positivePrompt.text = 'Mutated exposed context'
      capture.context.maskSettings.blur = 512
      capture.context.sourceLayerIds.length = 0
      capture.document.layers.length = 0
      assert.ok(capture.maskPngBytes)
      capture.maskPngBytes.fill(0)
      const first = await capture.composeSource(
        worker(opaquePng, async (input) => {
          assert.deepEqual(input.bbox, second.boundingBox)
          assert.equal(input.layers.length, 2)
          input.layers[0].transform.x = 777
        }),
      )
      assert.equal(first.context.generationDraft.positivePrompt.text, 'Patch B owned prompt')
      assert.deepEqual(first.context.maskSettings, { blur: 16, padding: 8 })
      assert.ok(first.maskPngBytes?.equals(expectedMask))
      first.context.generationDraft.positivePrompt.text = 'Mutated returned context'
      first.context.maskSettings.padding = 500
      first.maskPngBytes?.fill(0)
      first.source.bytes.fill(0)
      const secondResult = await capture.composeSource(
        worker(opaquePng, async (input) => {
          assert.equal(input.layers[0].transform.x, -12)
        }),
      )
      assert.equal(secondResult.context.generationDraft.positivePrompt.text, 'Patch B owned prompt')
      assert.deepEqual(secondResult.context.maskSettings, { blur: 16, padding: 8 })
      assert.ok(secondResult.maskPngBytes?.equals(expectedMask))
      assert.ok(secondResult.source.bytes.equals(opaquePng))
    })
    await assertUnchanged(fixture, before)
  })
})

test('captured input survives edits begun before I/O and retains whole mask/source after Clear, Save and close', async () => {
  await withProject(async (fixture) => {
    const { below, opaquePng, packagePath, scratch, second, service, tabId } = fixture
    await paint(fixture)
    await service.save(tabId)
    const before = service.getOpenTabs()[0]
    const expectedMask = await maskBytes(service, tabId, second.id)
    let enter!: (capture: CapturedSmartPatchGenerationInput) => void
    const entered = new Promise<CapturedSmartPatchGenerationInput>((resolve) => {
      enter = resolve
    })
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let stage = ''
    const capturing = service.withCapturedSmartPatchGenerationInput(
      tabId,
      second.id,
      async (capture) => {
        assert.ok(capture.maskPngPath)
        stage = path.dirname(capture.maskPngPath)
        enter(capture)
        await released
        assert.ok((await readFile(capture.maskPngPath)).equals(expectedMask))
        return await capture.composeSource(
          worker(opaquePng, async (input) => {
            assert.equal(input.layers[0].opacity, 1)
            assert.equal(input.layers.length, 2)
            assert.deepEqual(input.bbox, second.boundingBox)
          }),
        )
      },
    )
    void capturing.catch(() => undefined)
    try {
      await service.updateSmartPatchLayer(tabId, second.id, {
        kind: 'bounding-box',
        rect: { height: 8, width: 8, x: 70, y: 90 },
      })
      await service.updateGenerationDraft(
        tabId,
        { kind: 'positive-prompt', text: 'Later B prompt' },
        undefined,
        second.id,
      )
      let tab = service.getOpenTabs()[0]
      await service.updateSmartPatchLayer(tabId, second.id, {
        documentId: tab.documentId,
        documentRevision: tab.documentRevision,
        kind: 'mask-blur',
        value: 44,
      })
      const capture = await Promise.race([
        entered,
        capturing.then(() => assert.fail('Capture settled before its retained-lease witness')),
      ])
      assert.equal(capture.context.documentRevision, before.documentRevision)
      assert.deepEqual(capture.context.bbox, second.boundingBox)
      assert.equal(capture.context.generationDraft.positivePrompt.text, 'Patch B owned prompt')
      assert.deepEqual(capture.context.maskSettings, { blur: 16, padding: 8 })
      await service.updateRasterLayer(tabId, below.id, { kind: 'visibility', visible: false })
      tab = service.getOpenTabs()[0]
      const mask = owned(tab, second.id).mask
      await service.editSmartPatchMask(tabId, second.id, {
        documentId: tab.documentId,
        documentRevision: tab.documentRevision,
        edit: { kind: 'clear' },
        maskId: mask.id,
        maskRevision: mask.revision,
      })
      await service.clearHistory(tabId)
      await service.save(tabId)
      const saved = await readIgsPackage(packagePath)
      assert.equal(
        saved.manifest.members.some((member) => member.path.startsWith('assets/masks/')),
        false,
      )
      await service.close(tabId)
      assert.equal(service.getOpenTabs().length, 0)
      assert.equal(existsSync(stage), true)
      release()
      const result = await capturing
      assert.equal(result.context.documentRevision, before.documentRevision)
      assert.deepEqual(result.context.mask, owned(before, second.id).mask)
      assert.ok(result.maskPngBytes?.equals(expectedMask))
      assert.ok(result.source.bytes.equals(opaquePng))
      assert.equal(existsSync(stage), false)
      assert.deepEqual(await scratchEntries(scratch), [])
    } finally {
      release()
      await capturing.catch(() => undefined)
    }
  })
})

test('null and cleared masks are valid original snapshots, with source alpha independent from mask state', async () => {
  await withProject(async (fixture) => {
    const { opaquePng, second, service, tabId } = fixture
    const before = await state(fixture)
    const transparent = await transparentTargetPngFixture(4, 3)
    for (const [bytes, mode, expected] of [
      [opaquePng, 'img2img', 'opaque'],
      [transparent, 'txt2img', 'transparent'],
    ] as const) {
      const input = await service.withCapturedSmartPatchGenerationInput(
        tabId,
        second.id,
        async (capture) => {
          assert.equal(capture.maskPngBytes, null)
          assert.equal(capture.maskPngPath, null)
          assert.deepEqual(capture.context.mask, second.mask)
          return await capture.composeSource(worker(bytes, undefined, mode))
        },
      )
      assert.equal(input.sourceAlpha, expected)
      assert.equal(input.maskPngBytes, null)
    }
    await assertUnchanged(fixture, before)
    let tab = await paint(fixture)
    const mask = owned(tab, second.id).mask
    tab = await service.editSmartPatchMask(tabId, second.id, {
      documentId: tab.documentId,
      documentRevision: tab.documentRevision,
      edit: { kind: 'clear' },
      maskId: mask.id,
      maskRevision: mask.revision,
    })
    const cleared = owned(tab, second.id).mask
    assert.equal(cleared.revision, 2)
    await service.withCapturedSmartPatchGenerationInput(tabId, second.id, async (capture) => {
      assert.deepEqual(capture.context.mask, cleared)
      assert.equal(capture.maskPngBytes, null)
    })
  })
})

test('disjoint verified mask is retained whole, and legacy/default read-only capture permits hidden locked targets', async () => {
  await withProject(async (fixture) => {
    const { opaquePng, second, service, tabId } = fixture
    let tab = await paint(fixture)
    const mask = owned(tab, second.id).mask
    tab = await service.editSmartPatchMask(tabId, second.id, {
      documentId: tab.documentId,
      documentRevision: tab.documentRevision,
      edit: {
        kind: 'transform',
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 100, y: -100 },
      },
      maskId: mask.id,
      maskRevision: mask.revision,
    })
    tab = await service.updateSmartPatchLayer(tabId, second.id, { kind: 'lock', locked: true })
    tab = await service.updateSmartPatchLayer(tabId, second.id, {
      kind: 'visibility',
      visible: false,
    })
    await service.save(tabId)
    const before = await state(fixture)
    const expectedMask = await maskBytes(service, tabId, second.id)
    const rawPatch = before.document?.layers.find((layer) => layer.id === second.id)
    assert.ok(rawPatch?.kind === 'smart-patch')
    assert.equal(Object.hasOwn(rawPatch, 'maskSettings'), false)
    const result = await service.withCapturedSmartPatchGenerationInput(
      tabId,
      second.id,
      async (capture) => {
        assert.equal(capture.context.locked, true)
        assert.equal(capture.context.visible, false)
        assert.deepEqual(capture.context.maskSettings, { blur: 16, padding: 8 })
        assert.deepEqual(capture.context.mask, owned(tab, second.id).mask)
        assert.ok(capture.maskPngBytes?.equals(expectedMask))
        assert.ok(capture.context.mask.asset)
        assert.deepEqual(capture.context.mask.bounds, { height: 2, width: 2, x: 100, y: -100 })
        assert.ok(capture.maskPngBytes)
        assert.deepEqual(
          [...decodeProjectMaskPng(capture.maskPngBytes, capture.context.mask.asset)],
          [255, 255, 255, 255],
        )
        return await capture.composeSource(worker(opaquePng))
      },
    )
    assert.equal(result.sourceAlpha, 'opaque')
    assert.ok(result.maskPngBytes?.equals(expectedMask))
    await assertUnchanged(fixture, before)
  })
})

test('missing/Raster owner and structurally valid oversized crop refuse without callback or Project effects', async () => {
  await withProject(async (fixture) => {
    const { above, scratch, second, service, tabId } = fixture
    for (const id of [above.id, randomUUID(), 'invalid']) {
      const before = await state(fixture)
      await assert.rejects(
        service.withCapturedSmartPatchGenerationInput(tabId, id, async () => {
          assert.fail('Wrong-owner input cannot reach its callback.')
        }),
        { code: 'PROJECT_LAYER_NOT_FOUND' },
      )
      await assertUnchanged(fixture, before)
    }
    await service.updateSmartPatchLayer(tabId, second.id, {
      kind: 'bounding-box',
      rect: { height: 3, width: 2049, x: -12, y: -6 },
    })
    await service.flushAutosave(tabId)
    const before = await state(fixture)
    await assert.rejects(
      service.withCapturedSmartPatchGenerationInput(tabId, second.id, async () => {
        assert.fail('Oversized source cannot reach its callback.')
      }),
      /CPU compositor limits/,
    )
    await assertUnchanged(fixture, before)
    assert.deepEqual(
      (await scratchEntries(scratch)).filter((name) => name.startsWith('smart-patch-input-')),
      [],
    )
  })
})

test('corrupted pending mask refuses instead of becoming empty and removes only disposable capture files', async () => {
  await withProject(async (fixture) => {
    const { scratch, second, service, tabId } = fixture
    await paint(fixture)
    await service.flushAutosave(tabId)
    const coordinator = service.getOpenDocumentForAcceptance(tabId)
    assert.ok(coordinator)
    const mask = owned(service.getOpenTabs()[0], second.id).mask
    assert.ok(mask.asset)
    // A valid file-backed pending source is an input precondition, installed by the real owner.
    const originalBytes = await maskBytes(service, tabId, second.id)
    const inputPath = path.join(fixture.root, 'pending-mask.png')
    await writeFile(inputPath, originalBytes)
    await coordinator.adoptCurrentEdit({ [mask.asset.path]: { sourcePath: inputPath } })
    await service.flushAutosave(tabId)
    const source = coordinator.getCurrentAssetSource(mask.asset)
    assert.ok(source && 'sourcePath' in source)
    const original = await readFile(source.sourcePath)
    const before = await state(fixture)
    const directories = await scratchEntries(scratch)
    const corrupt = Buffer.from(original)
    corrupt[corrupt.length - 1] ^= 1
    try {
      await writeFile(source.sourcePath, corrupt)
      await assert.rejects(
        service.withCapturedSmartPatchGenerationInput(tabId, second.id, async () => {
          assert.fail('Invalid mask cannot reach its callback.')
        }),
        { code: 'MASK_IMAGE_INVALID' },
      )
      assert.deepEqual((await scratchEntries(scratch)).sort(), directories.sort())
    } finally {
      await writeFile(source.sourcePath, original)
    }
    await assertUnchanged(fixture, before)
    await service.withCapturedSmartPatchGenerationInput(tabId, second.id, async (capture) => {
      assert.ok(capture.maskPngBytes?.equals(original))
    })
  })
})

test('callback and source-verification failures clean leases without document/history/queue/seed publication', async () => {
  for (const phase of ['callback', 'verification', 'after-compose', 'alpha-claim'] as const) {
    await withProject(async (fixture) => {
      const { opaquePng, scratch, second, service, tabId } = fixture
      await paint(fixture)
      await service.flushAutosave(tabId)
      const before = await state(fixture)
      const directories = await scratchEntries(scratch)
      let stage = ''
      await assert.rejects(
        service.withCapturedSmartPatchGenerationInput(tabId, second.id, async (capture) => {
          assert.ok(capture.maskPngPath)
          stage = path.dirname(capture.maskPngPath)
          if (phase === 'callback') {
            throw new Error('Controlled callback refusal')
          }
          const transport = worker(opaquePng)
          if (phase === 'verification') {
            return await capture.composeSource({
              composeTarget: async (input) => {
                const result = await transport.composeTarget(input)
                return { ...result, composite: { ...result.composite, sha256: '0'.repeat(64) } }
              },
            })
          }
          if (phase === 'alpha-claim') {
            return await capture.composeSource(worker(opaquePng, undefined, 'txt2img'))
          }
          await capture.composeSource(transport)
          assert.equal(existsSync(capture.maskPngPath), true)
          throw new Error('Controlled after-compose refusal')
        }),
        phase === 'verification'
          ? /changed while being verified/
          : phase === 'alpha-claim'
            ? /alpha differs/
            : /Controlled .* refusal/,
      )
      assert.equal(existsSync(stage), false)
      assert.deepEqual((await scratchEntries(scratch)).sort(), directories.sort())
      await assertUnchanged(fixture, before)
    })
  }
})
