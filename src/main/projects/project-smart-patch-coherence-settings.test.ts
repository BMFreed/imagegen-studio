import type {
  ProjectSmartPatchLayerChange,
  ProjectSmartPatchLayerView,
  ProjectTab,
} from '../../shared/api.js'
import type {
  IgsRasterLayerV1,
  IgsSmartPatchLayerV1,
} from '../../shared/projects/project-schema.js'
import type { SmartPatchCoherenceSettings } from '../../shared/projects/smart-patch-coherence-settings.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { parseProjectMaskImageUrl } from './project-mask-resource.js'
import { readProjectMaskSource } from './project-mask.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'

const rasterPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const defaults: SmartPatchCoherenceSettings = {
  edgeSize: 16,
  minimumDenoise: 0,
  mode: 'Gaussian Blur',
}
const changedProfile: SmartPatchCoherenceSettings = {
  edgeSize: 31,
  minimumDenoise: 0.375,
  mode: 'Box Blur',
}

interface Fixture {
  database: ReturnType<typeof openAppDatabase>
  first: ProjectSmartPatchLayerView
  normal: ProjectTab
  raster: IgsRasterLayerV1
  restart: () => ProjectService
  savedPath: string
  second: ProjectSmartPatchLayerView
  service: ProjectService
  shadow: ProjectShadowStore
}

async function withProject(run: (state: Fixture) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-patch-coherence-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const services: ProjectService[] = []
  const restart = () => {
    const service = new ProjectService({
      autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot: root,
      repository,
      roots: {
        placeholdersDir: path.resolve('src/main/projects/placeholders'),
        scratchDir: path.join(root, 'scratch'),
      },
      shadow,
    })
    services.push(service)
    return service
  }
  const service = restart()
  try {
    let normal = await service.create({
      height: 256,
      title: 'Owned coherence profiles',
      width: 256,
    })
    normal = await service.updateGenerationDraft(normal.id, {
      kind: 'positive-prompt',
      text: 'ordinary draft',
    })
    normal = await service.updateGenerationDraft(normal.id, {
      kind: 'seed',
      policy: 'fixed',
      value: 0,
    })
    await service.save(normal.id)
    const savedPath = (await repository.listProjects())[0].canonicalPath
    await service.close(normal.id)
    const saved = await readIgsPackage(savedPath)
    const id = randomUUID()
    const raster: IgsRasterLayerV1 = {
      asset: {
        bytes: rasterPng.length,
        height: 2,
        path: `assets/layers/${id}.png`,
        sha256: digest(rasterPng),
        width: 2,
      },
      blendMode: 'normal',
      id,
      kind: 'raster',
      locked: false,
      name: 'Literal Raster neighbor',
      opacity: 1,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 11, y: -19 },
      visible: true,
    }
    // A literal Raster and seed are declared input preconditions, written while the genuine Project is closed.
    await saveIgsPackage(savedPath, {
      assets: { [raster.asset.path]: { bytes: rasterPng } },
      preview: {
        merged: await saved.readMember('preview/merged.png'),
        rect: { height: 2, width: 2, x: 11, y: -19 },
        status: 'unavailable',
        thumbnail: await saved.readMember('preview/thumbnail.webp'),
      },
      project: {
        ...saved.project,
        documentRevision: randomUUID(),
        lastActualSeedSnapshot: 0,
        layers: [raster],
      },
    })
    const opened = await service.open(normal.id)
    assert.equal(opened.kind, 'opened')
    if (opened.kind !== 'opened') {
      throw new Error('The declared fixture must open.')
    }
    normal = opened.tab
    await service.addSmartPatchLayer(normal.id)
    let tab = await service.addSmartPatchLayer(normal.id)
    const [first, second] = tab.layers.filter(
      (value): value is ProjectSmartPatchLayerView => value.kind === 'smart-patch',
    )
    assert.ok(first && second)
    tab = await service.editSmartPatchMask(tab.id, second.id, {
      documentId: tab.documentId,
      documentRevision: tab.documentRevision,
      edit: { diameter: 12, kind: 'brush', operation: 'add', points: [{ x: 17, y: -4 }] },
      maskId: second.mask.id,
      maskRevision: second.mask.revision,
    })
    await service.save(tab.id)
    await service.close(tab.id)
    const baseline = await service.open(tab.id)
    assert.equal(baseline.kind, 'opened')
    if (baseline.kind !== 'opened') {
      throw new Error('Saved painted fixture must open.')
    }
    await database.db
      .insertInto('generation_seed_cursor')
      .values({
        actual_seed: 0,
        candidate_id: randomUUID(),
        completion_order: 1,
        document_id: baseline.tab.documentId,
        local_project_key: baseline.tab.id,
        updated_at: '2026-10-14T12:00:00.000Z',
      })
      .execute()
    await run({
      database,
      first: patch(baseline.tab, first.id),
      normal,
      raster,
      restart,
      savedPath,
      second: patch(baseline.tab, second.id),
      service,
      shadow,
    })
  } finally {
    for (const owner of services.reverse()) {
      for (const tab of owner.getOpenTabs()) {
        await owner.discardAndClose(tab.id)
      }
    }
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

function patch(tab: ProjectTab, id: string): ProjectSmartPatchLayerView {
  const result = tab.layers.find((value) => value.id === id)
  assert.ok(result?.kind === 'smart-patch')
  return result
}

function editable(value: ProjectSmartPatchLayerView) {
  const { maskImageUrl: _url, status: _status, ...document } = value
  return document
}

function change(
  tab: ProjectTab,
  value: SmartPatchCoherenceSettings,
): Extract<ProjectSmartPatchLayerChange, { kind: 'coherence-settings' }> {
  return {
    documentId: tab.documentId,
    documentRevision: tab.documentRevision,
    kind: 'coherence-settings',
    value: { ...value },
  }
}

async function maskBytes(service: ProjectService, value: ProjectSmartPatchLayerView) {
  assert.ok(value.mask.asset && value.maskImageUrl)
  const capability = parseProjectMaskImageUrl(value.maskImageUrl)
  assert.ok(capability)
  const resource = service.getMaskAsset(capability)
  assert.ok(resource)
  const bytes =
    resource.kind === 'staged'
      ? await readProjectMaskSource(resource.source, resource.member)
      : await (await readIgsPackage(resource.filePath)).readMember(resource.member.path)
  assert.equal(digest(bytes), value.mask.asset.sha256)
  return bytes
}

test('whole owned coherence edit targets B with one Undo step and preserves masks, Raster, ordinary inputs and seed cursor', async () => {
  await withProject(async ({ database, first, normal, raster, savedPath, second, service }) => {
    let tab = service.getOpenTabs()[0]
    assert.equal(tab.canUndo, false)
    assert.deepEqual(first.coherenceSettings, defaults)
    assert.deepEqual(second.coherenceSettings, defaults)
    const before = structuredClone(tab)
    const originalFile = await readFile(savedPath)
    const pixels = await maskBytes(service, second)
    const cursor = await database.db.selectFrom('generation_seed_cursor').selectAll().execute()
    tab = await service.updateSmartPatchLayer(tab.id, second.id, change(tab, changedProfile))
    assert.equal(tab.dirty, true)
    assert.equal(tab.canUndo, true)
    assert.deepEqual(editable(patch(tab, second.id)), {
      ...editable(second),
      coherenceSettings: changedProfile,
    })
    assert.deepEqual(editable(patch(tab, first.id)), editable(first))
    assert.deepEqual(tab.generationDraft, normal.generationDraft)
    assert.deepEqual(tab.primaryBbox, normal.primaryBbox)
    const rasterBefore = before.layers.find(({ id }) => id === raster.id)
    const rasterAfter = tab.layers.find(({ id }) => id === raster.id)
    assert.ok(rasterBefore && rasterBefore.kind !== 'smart-patch')
    assert.ok(rasterAfter && rasterAfter.kind !== 'smart-patch')
    const { imageUrl: _beforeUrl, ...beforeRasterFields } = rasterBefore
    const { imageUrl: _afterUrl, ...afterRasterFields } = rasterAfter
    assert.deepEqual(afterRasterFields, beforeRasterFields)
    const originalPackage = await readIgsPackage(savedPath)
    assert.ok((await originalPackage.readMember(raster.asset.path)).equals(rasterPng))
    assert.deepEqual(tab.acceptedResults, before.acceptedResults)
    assert.equal(tab.lastActualSeedSnapshot, 0)
    assert.ok((await maskBytes(service, patch(tab, second.id))).equals(pixels))
    assert.deepEqual(
      await database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
      cursor,
    )
    assert.ok((await readFile(savedPath)).equals(originalFile))
    tab = await service.undo(tab.id)
    assert.equal(tab.canUndo, false, 'The whole profile is exactly one changed Project command.')
    assert.equal(tab.canRedo, true)
    assert.equal(tab.dirty, false)
    assert.deepEqual(editable(patch(tab, second.id)), editable(second))
    tab = await service.redo(tab.id)
    assert.deepEqual(patch(tab, second.id).coherenceSettings, changedProfile)
    const unchanged = await service.updateSmartPatchLayer(
      tab.id,
      second.id,
      change(tab, changedProfile),
    )
    assert.deepEqual(
      unchanged,
      tab,
      'Same whole profile must not create another revision/history step.',
    )
  })
})

test('actual shadow and fresh Service recovery retain owned coherence before explicit Save and genuine package reopen', async () => {
  await withProject(async ({ first, raster, restart, savedPath, second, service, shadow }) => {
    let tab = service.getOpenTabs()[0]
    const savedBytes = await readFile(savedPath)
    const originalMask = await maskBytes(service, second)
    tab = await service.updateSmartPatchLayer(tab.id, second.id, change(tab, changedProfile))
    await service.flushAutosave(tab.id)
    const saved = await readIgsPackage(savedPath)
    const inspection = await shadow.inspect({ projectPath: savedPath, savedPackage: saved })
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status !== 'recoverable') {
      throw new Error('Real dirty recovery must contain the profile.')
    }
    const recoveredPatch = inspection.document.layers.find(({ id }) => id === second.id)
    assert.ok(recoveredPatch?.kind === 'smart-patch')
    assert.deepEqual(recoveredPatch.coherenceSettings, changedProfile)
    assert.deepEqual(recoveredPatch.mask, second.mask)
    assert.deepEqual(Object.keys(inspection.dirtyAssets), [])
    assert.ok((await readFile(savedPath)).equals(savedBytes), 'Local recovery does not imply Save.')
    const restarted = restart()
    assert.equal((await restarted.open(tab.id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(tab.id, 'recover')
    assert.equal(recovered.dirty, true)
    assert.deepEqual(patch(recovered, second.id).coherenceSettings, changedProfile)
    assert.deepEqual(editable(patch(recovered, first.id)), editable(first))
    assert.ok((await maskBytes(restarted, patch(recovered, second.id))).equals(originalMask))
    assert.ok((await readFile(savedPath)).equals(savedBytes))
    const explicitlySaved = await restarted.save(tab.id)
    assert.equal(explicitlySaved.tab.dirty, false)
    const stored = await readIgsPackage(savedPath)
    const storedPatch = stored.project.layers.find(({ id }) => id === second.id)
    assert.ok(storedPatch?.kind === 'smart-patch' && storedPatch.mask.asset)
    assert.deepEqual(storedPatch, { ...editable(second), coherenceSettings: changedProfile })
    assert.deepEqual(
      stored.project.layers.find(({ id }) => id === raster.id),
      raster,
    )
    assert.equal(stored.project.lastActualSeedSnapshot, 0)
    assert.ok((await stored.readMember(storedPatch.mask.asset.path)).equals(originalMask))
    assert.ok((await stored.readMember(raster.asset.path)).equals(rasterPng))
    const raw = JSON.parse((await stored.readMember('project.json')).toString('utf8')) as {
      layers: IgsSmartPatchLayerV1[]
    }
    assert.deepEqual(
      raw.layers.find(({ id }) => id === second.id)?.coherenceSettings,
      changedProfile,
    )
    await restarted.close(tab.id)
    const reopened = await restarted.open(tab.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind !== 'opened') {
      throw new Error('Explicitly saved profile must reopen.')
    }
    assert.equal(reopened.tab.dirty, false)
    assert.deepEqual(patch(reopened.tab, second.id).coherenceSettings, changedProfile)
    assert.ok((await maskBytes(restarted, patch(reopened.tab, second.id))).equals(originalMask))
  })
})

test('legacy absent coherence remains absent and clean on defaults; changed profile Undo restores absence before Save', async () => {
  await withProject(async ({ first, savedPath, second, service, shadow }) => {
    let tab = service.getOpenTabs()[0]
    await service.close(tab.id)
    const saved = await readIgsPackage(savedPath)
    const assets: Record<string, { bytes: Buffer }> = {}
    for (const member of saved.manifest.members) {
      if (member.path.startsWith('assets/')) {
        assets[member.path] = { bytes: await saved.readMember(member.path) }
      }
    }
    // Legacy omission is a declared package precondition, not a result manufactured by the test.
    await saveIgsPackage(savedPath, {
      assets,
      preview: {
        merged: await saved.readMember('preview/merged.png'),
        rect: saved.manifest.preview.rect,
        status: 'unavailable',
        thumbnail: await saved.readMember('preview/thumbnail.webp'),
      },
      project: {
        ...saved.project,
        documentRevision: randomUUID(),
        layers: saved.project.layers.map((value) => {
          if (value.kind !== 'smart-patch') {
            return value
          }
          const { coherenceSettings: _profile, ...legacy } = value
          return legacy
        }),
      },
    })
    const legacy = await readIgsPackage(savedPath)
    assert.equal(
      legacy.project.layers.some((value) => Object.hasOwn(value, 'coherenceSettings')),
      false,
    )
    const original = await readFile(savedPath)
    const opened = await service.open(tab.id)
    assert.equal(opened.kind, 'opened')
    if (opened.kind !== 'opened') {
      throw new Error('Legacy profile absence must open.')
    }
    tab = opened.tab
    assert.deepEqual(patch(tab, first.id).coherenceSettings, defaults)
    assert.deepEqual(patch(tab, second.id).coherenceSettings, defaults)
    const before = structuredClone(tab)
    const pixels = await maskBytes(service, patch(tab, second.id))
    assert.deepEqual(
      await service.updateSmartPatchLayer(tab.id, second.id, change(tab, defaults)),
      before,
    )
    await service.flushAutosave(tab.id)
    const inspection = await shadow.inspect({ projectPath: savedPath, savedPackage: legacy })
    assert.ok(inspection.status === 'absent' || inspection.status === 'clean')
    assert.ok((await readFile(savedPath)).equals(original))
    tab = await service.updateSmartPatchLayer(
      tab.id,
      second.id,
      change(tab, { edgeSize: 0, minimumDenoise: 1, mode: 'Staged' }),
    )
    tab = await service.undo(tab.id)
    assert.equal(tab.canUndo, false)
    assert.equal(tab.dirty, false)
    await service.withCapturedSmartPatchGenerationInput(tab.id, second.id, async (capture) => {
      const owned = capture.document.layers.find(({ id }) => id === second.id)
      assert.ok(owned?.kind === 'smart-patch')
      assert.equal(
        Object.hasOwn(owned, 'coherenceSettings'),
        false,
        'Undo restores the real legacy omission.',
      )
      assert.deepEqual(capture.context.coherenceSettings, defaults)
    })
    tab = await service.redo(tab.id)
    await service.save(tab.id)
    const edited = await readIgsPackage(savedPath)
    const untouched = edited.project.layers.find(({ id }) => id === first.id)
    const owner = edited.project.layers.find(({ id }) => id === second.id)
    assert.ok(untouched?.kind === 'smart-patch' && owner?.kind === 'smart-patch')
    assert.equal(Object.hasOwn(untouched, 'coherenceSettings'), false)
    assert.deepEqual(owner.coherenceSettings, { edgeSize: 0, minimumDenoise: 1, mode: 'Staged' })
    assert.ok((await maskBytes(service, patch(tab, second.id))).equals(pixels))
  })
})

test('actual coherence edit refuses malformed, stale, locked and wrong-owner requests without file or history mutation', async () => {
  await withProject(async ({ first, raster, savedPath, second, service }) => {
    let tab = service.getOpenTabs()[0]
    const before = structuredClone(tab)
    const original = await readFile(savedPath)
    const valid = change(tab, changedProfile)
    for (const invalid of [
      { ...valid, value: { ...changedProfile, edgeSize: -1 } },
      { ...valid, value: { ...changedProfile, edgeSize: 1025 } },
      { ...valid, value: { ...changedProfile, edgeSize: 0.5 } },
      { ...valid, value: { ...changedProfile, minimumDenoise: NaN } },
      { ...valid, value: { ...changedProfile, minimumDenoise: Infinity } },
      { ...valid, value: { ...changedProfile, minimumDenoise: -0.01 } },
      { ...valid, value: { ...changedProfile, minimumDenoise: 1.01 } },
      { ...valid, value: { ...changedProfile, mode: 'Gaussian' } },
      { ...valid, value: { ...changedProfile, padding: 8 } },
      { ...valid, documentRevision: undefined },
      { ...valid, extra: true },
      { kind: valid.kind, value: valid.value },
    ]) {
      await assert.rejects(
        service.updateSmartPatchLayer(tab.id, second.id, invalid as ProjectSmartPatchLayerChange),
        { code: 'PROJECT_INVALID_INPUT' },
      )
      assert.deepEqual(service.getOpenTabs()[0], before)
    }
    for (const identity of [{ documentId: randomUUID() }, { documentRevision: randomUUID() }]) {
      await assert.rejects(
        service.updateSmartPatchLayer(tab.id, second.id, { ...valid, ...identity }),
        { code: 'EDIT_CONFLICT' },
      )
      assert.deepEqual(service.getOpenTabs()[0], before)
    }
    for (const id of [raster.id, randomUUID()]) {
      await assert.rejects(service.updateSmartPatchLayer(tab.id, id, valid), {
        code: 'PROJECT_LAYER_NOT_FOUND',
      })
      assert.deepEqual(service.getOpenTabs()[0], before)
    }
    assert.ok((await readFile(savedPath)).equals(original))
    tab = await service.updateSmartPatchLayer(tab.id, second.id, { kind: 'opacity', opacity: 0.6 })
    const edited = structuredClone(tab)
    await assert.rejects(service.updateSmartPatchLayer(tab.id, second.id, valid), {
      code: 'EDIT_CONFLICT',
    })
    assert.deepEqual(service.getOpenTabs()[0], edited)
    tab = await service.updateSmartPatchLayer(tab.id, second.id, { kind: 'lock', locked: true })
    const locked = structuredClone(tab)
    await assert.rejects(
      service.updateSmartPatchLayer(tab.id, second.id, change(tab, changedProfile)),
      { code: 'PROJECT_INVALID_INPUT' },
    )
    assert.deepEqual(service.getOpenTabs()[0], locked)
    tab = await service.updateSmartPatchLayer(tab.id, second.id, { kind: 'lock', locked: false })
    tab = await service.updateSmartPatchLayer(tab.id, second.id, {
      kind: 'visibility',
      visible: false,
    })
    tab = await service.updateSmartPatchLayer(tab.id, second.id, change(tab, changedProfile))
    assert.deepEqual(patch(tab, second.id).coherenceSettings, changedProfile)
    assert.deepEqual(patch(tab, first.id).coherenceSettings, defaults)
  })
})

test('incoming and returned profile aliases cannot alter acknowledged owned state or history', async () => {
  await withProject(async ({ second, service }) => {
    const tab = service.getOpenTabs()[0]
    const incoming = change(tab, changedProfile)
    const pending = service.updateSmartPatchLayer(tab.id, second.id, incoming)
    incoming.value.edgeSize = 0
    incoming.value.minimumDenoise = 1
    incoming.value.mode = 'Staged'
    const acknowledged = await pending
    assert.deepEqual(patch(acknowledged, second.id).coherenceSettings, changedProfile)
    const returnedProfile = patch(acknowledged, second.id).coherenceSettings
    assert.ok(returnedProfile)
    returnedProfile.edgeSize = 1024
    returnedProfile.mode = 'Staged'
    assert.deepEqual(patch(service.getOpenTabs()[0], second.id).coherenceSettings, changedProfile)
    const undone = await service.undo(tab.id)
    assert.deepEqual(patch(undone, second.id).coherenceSettings, defaults)
    const redone = await service.redo(tab.id)
    assert.deepEqual(patch(redone, second.id).coherenceSettings, changedProfile)
  })
})

test('captured coherence remains detached across a later owned profile edit and another capture observes only the new value', async () => {
  await withProject(async ({ first, second, service }) => {
    let tab = service.getOpenTabs()[0]
    tab = await service.updateSmartPatchLayer(tab.id, second.id, change(tab, changedProfile))
    const before = structuredClone(tab)
    await service.withCapturedSmartPatchGenerationInput(tab.id, second.id, async (capture) => {
      assert.deepEqual(capture.context.coherenceSettings, changedProfile)
      const capturedOwner = capture.document.layers.find(({ id }) => id === second.id)
      assert.ok(capturedOwner?.kind === 'smart-patch')
      assert.deepEqual(capturedOwner.coherenceSettings, changedProfile)
      tab = await service.updateSmartPatchLayer(
        tab.id,
        second.id,
        change(tab, { edgeSize: 8, minimumDenoise: 1, mode: 'Staged' }),
      )
      assert.deepEqual(capture.context.coherenceSettings, changedProfile)
      assert.deepEqual(capturedOwner.coherenceSettings, changedProfile)
      assert.equal(capture.context.documentRevision, before.documentRevision)
      capture.context.coherenceSettings.edgeSize = 1024
      assert.deepEqual(capturedOwner.coherenceSettings, changedProfile)
      assert.deepEqual(patch(service.getOpenTabs()[0], second.id).coherenceSettings, {
        edgeSize: 8,
        minimumDenoise: 1,
        mode: 'Staged',
      })
    })
    await service.withCapturedSmartPatchGenerationInput(tab.id, second.id, async (capture) => {
      assert.deepEqual(capture.context.coherenceSettings, {
        edgeSize: 8,
        minimumDenoise: 1,
        mode: 'Staged',
      })
      assert.deepEqual(capture.context.mask, second.mask)
      assert.deepEqual(capture.context.bbox, second.boundingBox)
      assert.deepEqual(capture.context.internalResolution, second.internalResolution)
    })
    assert.deepEqual(editable(patch(service.getOpenTabs()[0], first.id)), editable(first))
  })
})
