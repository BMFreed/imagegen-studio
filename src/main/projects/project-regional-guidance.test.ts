import type { ProjectTab } from '../../shared/api.js'
import {
  type IgsProjectDocumentV1,
  type IgsRasterLayerV1,
  type IgsRegionalGuidanceV1,
  projectOwnedIds,
} from '../../shared/projects/project-schema.js'
import type {
  ProjectRegionalGuidanceChange,
  ProjectRegionalGuidanceOwner,
} from '../../shared/projects/regional-guidance.js'

import assert from 'node:assert/strict'
import crypto, { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry, type ProjectAutosaveOptions } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { resolveProjectLayerAsset } from './project-layer-resource.js'
import { resolveProjectMaskAsset } from './project-mask-resource.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'

const rasterPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)

interface Fixture {
  document: () => IgsProjectDocumentV1
  restart: () => ProjectService
  savedPath: string
  service: ProjectService
  setAfterSave: (hook?: ProjectAutosaveOptions['afterSaveCommit']) => void
  setBeforeEdit: (hook?: ProjectAutosaveOptions['beforeEditCommit']) => void
  shadow: ProjectShadowStore
  shadowRoot: string
  tab: () => ProjectTab
}

/** Real service, SQLite, filesystem, shadow, package writer and loader; no image worker is used. */
async function withProject(run: (fixture: Fixture) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-regional-guidance-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const services: ProjectService[] = []
  let beforeEdit: ProjectAutosaveOptions['beforeEditCommit']
  let afterSave: ProjectAutosaveOptions['afterSaveCommit']
  const restart = () => {
    const service = new ProjectService({
      autosaveOptions: {
        afterSaveCommit: async () => afterSave?.(),
        beforeEditCommit: async (document) => beforeEdit?.(document),
        debounceMs: 60_000,
        leaseRegistry: new ProjectAutosaveLeaseRegistry(),
      },
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
    let tab = await service.create({ height: 256, title: 'Regional foundation', width: 256 })
    const coordinator = service.getOpenDocumentForAcceptance(tab.id)!
    const id = randomUUID()
    const raster: IgsRasterLayerV1 = {
      asset: {
        bytes: rasterPng.length,
        height: 2,
        path: `assets/layers/${id}.png`,
        sha256: createHash('sha256').update(rasterPng).digest('hex'),
        width: 2,
      },
      blendMode: 'normal',
      id,
      kind: 'raster',
      locked: false,
      name: 'Preserved Raster',
      opacity: 1,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 11, y: -19 },
      visible: true,
    }
    // A literal Raster is a declared fixture precondition, not a substitute for a regional action.
    await coordinator.applyDocument(
      { ...coordinator.document, layers: [raster] },
      { [raster.asset.path]: { bytes: rasterPng } },
    )
    tab = await service.addSmartPatchLayer(tab.id)
    tab = await service.updateGenerationDraft(tab.id, {
      kind: 'positive-prompt',
      text: 'ordinary draft',
    })
    tab = await service.updateGenerationDraft(tab.id, { kind: 'seed', policy: 'fixed', value: 0 })
    const savedPath = coordinator.filePath
    await service.save(tab.id)
    await service.close(tab.id)
    const opened = await service.open(tab.id)
    assert.equal(opened.kind, 'opened')
    if (opened.kind !== 'opened') {
      throw new Error('The saved fixture must open.')
    }
    await run({
      document: () => service.getOpenDocumentForAcceptance(tab.id)!.document,
      restart,
      savedPath,
      service,
      setAfterSave: (hook) => {
        afterSave = hook
      },
      setBeforeEdit: (hook) => {
        beforeEdit = hook
      },
      shadow,
      shadowRoot: path.join(root, 'autosave'),
      tab: () => service.getOpenTabs().find((value) => value.id === tab.id)!,
    })
  } finally {
    beforeEdit = undefined
    afterSave = undefined
    for (const owner of services.reverse()) {
      for (const tab of owner.getOpenTabs()) {
        await owner.discardAndClose(tab.id)
      }
    }
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

function documentOwner(tab: ProjectTab) {
  return { documentId: tab.documentId, documentRevision: tab.documentRevision }
}

function owner(
  tab: ProjectTab,
  regionId = tab.regionalGuidance![0].id,
): ProjectRegionalGuidanceOwner {
  return { ...documentOwner(tab), regionId }
}

function region(tab: ProjectTab, id = tab.regionalGuidance![0].id): IgsRegionalGuidanceV1 {
  const result = tab.regionalGuidance?.find((value) => value.id === id)
  assert.ok(result)
  return result
}

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

test('public regional lifecycle owns independent identities and one Undo per change while preserving Raster, Smart, draft and seed', async () => {
  await withProject(async (f) => {
    const before = structuredClone(f.document())
    const original = await readFile(f.savedPath)
    assert.equal(Object.hasOwn(f.tab(), 'regionalGuidance'), false)
    let tab = await f.service.addRegionalGuidance(f.tab().id, documentOwner(f.tab()))
    const added = region(tab)
    assert.deepEqual(added, {
      enabled: true,
      id: added.id,
      locked: false,
      mask: { asset: null, id: added.mask.id, revision: 0 },
      name: 'Regional Guidance',
      overlayOpacity: 0.5,
    })
    assert.notEqual(added.id, added.mask.id)
    assert.equal(tab.dirty, true)
    assert.equal(tab.canUndo, true)
    const addedRevision = tab.documentRevision
    tab = await f.service.undo(tab.id)
    assert.equal(Object.hasOwn(tab, 'regionalGuidance'), false)
    assert.equal(tab.dirty, false)
    assert.equal(tab.canUndo, false)
    tab = await f.service.redo(tab.id)
    assert.deepEqual(region(tab), added)
    assert.notEqual(tab.documentRevision, before.documentRevision)
    const changes: ProjectRegionalGuidanceChange[] = [
      { kind: 'rename', name: 'Left subject' },
      { kind: 'overlay-opacity', overlayOpacity: 0.125 },
      { enabled: false, kind: 'enabled' },
      { kind: 'lock', locked: true },
    ]
    for (const change of changes) {
      const previous = structuredClone(region(tab))
      tab = await f.service.updateRegionalGuidance(tab.id, owner(tab), change)
      const changed = structuredClone(region(tab))
      assert.notDeepEqual(changed, previous)
      tab = await f.service.undo(tab.id)
      assert.deepEqual(region(tab), previous)
      tab = await f.service.redo(tab.id)
      assert.deepEqual(region(tab), changed)
    }
    assert.notEqual(tab.documentRevision, addedRevision)
    assert.deepEqual(f.document().layers, before.layers)
    assert.deepEqual(f.document().generationDraft, before.generationDraft)
    assert.deepEqual(f.document().primaryBbox, before.primaryBbox)
    assert.equal(f.document().lastActualSeedSnapshot, before.lastActualSeedSnapshot)
    assert.deepEqual(tab.acceptedResults, [])
    assert.ok((await readFile(f.savedPath)).equals(original), 'Regional edits do not imply Save.')
  })
})

test('duplicate is adjacent with new mask ownership and delete restores absence with complete Undo/Redo', async () => {
  await withProject(async (f) => {
    let tab = await f.service.addRegionalGuidance(f.tab().id, documentOwner(f.tab()))
    const sourceId = region(tab).id
    tab = await f.service.updateRegionalGuidance(tab.id, owner(tab, sourceId), {
      enabled: false,
      kind: 'enabled',
    })
    const source = structuredClone(region(tab, sourceId))
    tab = await f.service.addRegionalGuidance(tab.id, documentOwner(tab))
    const lastId = tab.regionalGuidance![1].id
    tab = await f.service.duplicateRegionalGuidance(tab.id, owner(tab, sourceId))
    const copy = tab.regionalGuidance![1]
    assert.deepEqual(
      tab.regionalGuidance!.map(({ id }) => id),
      [sourceId, copy.id, lastId],
    )
    assert.notEqual(copy.id, sourceId)
    assert.notEqual(copy.mask.id, source.mask.id)
    assert.deepEqual(copy, {
      ...source,
      id: copy.id,
      mask: { asset: null, id: copy.mask.id, revision: 0 },
      name: `${source.name} copy`,
    })
    const duplicated = structuredClone(tab.regionalGuidance)
    tab = await f.service.undo(tab.id)
    assert.deepEqual(
      tab.regionalGuidance!.map(({ id }) => id),
      [sourceId, lastId],
    )
    tab = await f.service.redo(tab.id)
    assert.deepEqual(tab.regionalGuidance, duplicated)
    for (const id of [copy.id, sourceId, lastId]) {
      tab = await f.service.deleteRegionalGuidance(tab.id, owner(tab, id))
    }
    assert.equal(Object.hasOwn(tab, 'regionalGuidance'), false)
    assert.equal(Object.hasOwn(f.document(), 'regionalGuidance'), false)
    tab = await f.service.undo(tab.id)
    assert.deepEqual(
      tab.regionalGuidance!.map(({ id }) => id),
      [lastId],
    )
    tab = await f.service.redo(tab.id)
    assert.equal(Object.hasOwn(tab, 'regionalGuidance'), false)
  })
})

test('duplicate keeps a maximum UTF-8 name when the copy suffix cannot fit', async () => {
  await withProject(async (f) => {
    let tab = await f.service.addRegionalGuidance(f.tab().id, documentOwner(f.tab()))
    tab = await f.service.updateRegionalGuidance(tab.id, owner(tab), {
      kind: 'rename',
      name: 'я'.repeat(512),
    })
    tab = await f.service.duplicateRegionalGuidance(tab.id, owner(tab))
    assert.equal(tab.regionalGuidance![1].name, 'я'.repeat(512))
  })
})

test('locked regional owners allow enable and unlock but refuse rename, opacity, duplicate and delete without mutation', async () => {
  await withProject(async (f) => {
    let tab = await f.service.addRegionalGuidance(f.tab().id, documentOwner(f.tab()))
    tab = await f.service.updateRegionalGuidance(tab.id, owner(tab), { kind: 'lock', locked: true })
    const before = structuredClone(tab)
    for (const change of [
      { kind: 'rename', name: 'forbidden' },
      { kind: 'overlay-opacity', overlayOpacity: 0 },
    ] as const) {
      await assert.rejects(f.service.updateRegionalGuidance(tab.id, owner(tab), change), {
        code: 'PROJECT_LAYER_LOCKED',
      })
    }
    await assert.rejects(f.service.duplicateRegionalGuidance(tab.id, owner(tab)), {
      code: 'PROJECT_LAYER_LOCKED',
    })
    await assert.rejects(f.service.deleteRegionalGuidance(tab.id, owner(tab)), {
      code: 'PROJECT_LAYER_LOCKED',
    })
    assert.deepEqual(f.tab(), before)
    tab = await f.service.updateRegionalGuidance(tab.id, owner(tab), {
      enabled: false,
      kind: 'enabled',
    })
    assert.equal(region(tab).enabled, false)
    assert.equal(region(tab).locked, true)
    tab = await f.service.updateRegionalGuidance(tab.id, owner(tab), {
      kind: 'lock',
      locked: false,
    })
    assert.equal(region(tab).locked, false)
  })
})

test('equal-value regional changes preserve exact revision, history, absence and explicit empty collection', async () => {
  await withProject(async (f) => {
    const absent = structuredClone(f.document())
    const actual = f.service.getOpenDocumentForAcceptance(f.tab().id)!
    await actual.applyDocument({ ...actual.document, regionalGuidance: [] })
    assert.deepEqual(f.tab().regionalGuidance, [])
    await f.service.undo(f.tab().id)
    assert.deepEqual(f.document(), absent)
    let tab = await f.service.addRegionalGuidance(f.tab().id, documentOwner(f.tab()))
    const before = structuredClone(tab)
    for (const change of [
      { kind: 'rename', name: 'Regional Guidance' },
      { enabled: true, kind: 'enabled' },
      { kind: 'lock', locked: false },
      { kind: 'overlay-opacity', overlayOpacity: 0.5 },
    ] as const) {
      tab = await f.service.updateRegionalGuidance(tab.id, owner(tab), change)
      assert.deepEqual(tab, before)
    }
    tab = await f.service.undo(tab.id)
    assert.deepEqual(f.document(), absent)
    assert.equal(tab.canUndo, false)
  })
})

test('actual dirty shadow and fresh-service recovery retain regions without regional assets before portable Save/reopen', async () => {
  await withProject(async (f) => {
    const original = await readFile(f.savedPath)
    const baseline = structuredClone(f.document())
    let tab = await f.service.addRegionalGuidance(f.tab().id, documentOwner(f.tab()))
    tab = await f.service.updateRegionalGuidance(tab.id, owner(tab), {
      kind: 'rename',
      name: 'Recovered authoring',
    })
    const regions = structuredClone(tab.regionalGuidance)
    await f.service.flushAutosave(tab.id)
    const saved = await readIgsPackage(f.savedPath)
    const actualInspection = await new ProjectShadowStore(f.shadowRoot).inspect({
      projectPath: f.savedPath,
      savedPackage: saved,
    })
    assert.equal(actualInspection.status, 'recoverable')
    if (actualInspection.status !== 'recoverable') {
      throw new Error('Dirty regional data must be recoverable.')
    }
    assert.deepEqual(actualInspection.document.regionalGuidance, regions)
    assert.deepEqual(actualInspection.dirtyAssets, {})
    assert.ok((await readFile(f.savedPath)).equals(original))
    const restarted = f.restart()
    assert.equal((await restarted.open(tab.id)).kind, 'recovery-required')
    tab = await restarted.resolveRecovery(tab.id, 'recover')
    assert.equal(tab.dirty, true)
    assert.equal(tab.canUndo, false)
    assert.deepEqual(tab.regionalGuidance, regions)
    assert.ok((await readFile(f.savedPath)).equals(original))
    const outcome = await restarted.save(tab.id)
    assert.equal(outcome.tab.dirty, false)
    const portable = await readIgsPackage(f.savedPath)
    assert.deepEqual(portable.project.regionalGuidance, regions)
    assert.deepEqual(portable.project.layers, baseline.layers)
    assert.deepEqual(portable.project.generationDraft, baseline.generationDraft)
    assert.equal(portable.project.lastActualSeedSnapshot, baseline.lastActualSeedSnapshot)
    assert.deepEqual(
      portable.manifest.members.map(({ path }) => path),
      saved.manifest.members.map(({ path }) => path),
    )
    const raw = JSON.parse(
      (await portable.readMember('project.json')).toString('utf8'),
    ) as IgsProjectDocumentV1
    assert.deepEqual(raw.regionalGuidance, regions)
    for (const layer of baseline.layers) {
      if (layer.kind === 'raster') {
        assert.ok((await portable.readMember(layer.asset.path)).equals(rasterPng))
      }
    }
    await restarted.close(tab.id)
    const reopened = await restarted.open(tab.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind !== 'opened') {
      throw new Error('Saved regional data must reopen.')
    }
    assert.deepEqual(reopened.tab.regionalGuidance, regions)
    assert.equal(reopened.tab.dirty, false)
    assert.equal(reopened.tab.canUndo, false)
  })
})

test('Save A commits only A while a later regional edit B stays dirty and recoverable across the real package transition', async () => {
  await withProject(async (f) => {
    let tab = await f.service.addRegionalGuidance(f.tab().id, documentOwner(f.tab()))
    tab = await f.service.updateRegionalGuidance(tab.id, owner(tab), {
      kind: 'rename',
      name: 'Saved A',
    })
    const regionId = region(tab).id
    const committed = deferred()
    const release = deferred()
    f.setAfterSave(async () => {
      committed.release()
      await release.promise
    })
    const saving = f.service.save(tab.id)
    await committed.promise
    try {
      const packageA = await readIgsPackage(f.savedPath)
      assert.equal(packageA.project.regionalGuidance![0].name, 'Saved A')
      tab = await f.service.updateRegionalGuidance(tab.id, owner(f.tab(), regionId), {
        kind: 'rename',
        name: 'Recover B',
      })
      await f.service.flushAutosave(tab.id)
    } finally {
      release.release()
    }
    const outcome = await saving
    f.setAfterSave()
    assert.equal(outcome.tab.dirty, true)
    assert.equal(region(outcome.tab).name, 'Recover B')
    const saved = await readIgsPackage(f.savedPath)
    assert.equal(saved.project.regionalGuidance![0].name, 'Saved A')
    const inspection = await new ProjectShadowStore(f.shadowRoot).inspect({
      projectPath: f.savedPath,
      savedPackage: saved,
    })
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status !== 'recoverable') {
      throw new Error('The later regional edit must survive Save A.')
    }
    assert.equal(inspection.document.regionalGuidance![0].name, 'Recover B')
    assert.deepEqual(inspection.dirtyAssets, {})
    const restarted = f.restart()
    assert.equal((await restarted.open(tab.id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(tab.id, 'recover')
    assert.equal(region(recovered).name, 'Recover B')
    assert.equal(recovered.dirty, true)
    assert.equal((await readIgsPackage(f.savedPath)).project.regionalGuidance![0].name, 'Saved A')
  })
})

test('malformed and stale document/entity requests cannot change regional state, saved bytes or history', async () => {
  await withProject(async (f) => {
    let tab = await f.service.addRegionalGuidance(f.tab().id, documentOwner(f.tab()))
    const captured = owner(tab)
    tab = await f.service.updateRegionalGuidance(tab.id, captured, {
      kind: 'rename',
      name: 'Current',
    })
    const before = structuredClone(tab)
    const saved = await readFile(f.savedPath)
    await assert.rejects(
      f.service.addRegionalGuidance(tab.id, { ...documentOwner(tab), extra: true } as never),
      { code: 'PROJECT_INVALID_INPUT' },
    )
    await assert.rejects(
      f.service.updateRegionalGuidance(tab.id, owner(tab), {
        kind: 'rename',
        name: ' ',
        positivePrompt: 'unsupported',
      } as never),
      { code: 'PROJECT_INVALID_INPUT' },
    )
    for (const stale of [captured, { ...owner(tab), documentId: randomUUID() }]) {
      await assert.rejects(
        f.service.updateRegionalGuidance(tab.id, stale, { kind: 'rename', name: 'Stale' }),
        { code: 'EDIT_CONFLICT' },
      )
      await assert.rejects(f.service.duplicateRegionalGuidance(tab.id, stale), {
        code: 'EDIT_CONFLICT',
      })
      await assert.rejects(f.service.deleteRegionalGuidance(tab.id, stale), {
        code: 'EDIT_CONFLICT',
      })
    }
    for (const regionId of [...tab.layers.map(({ id }) => id), region(tab).mask.id, randomUUID()]) {
      await assert.rejects(
        f.service.updateRegionalGuidance(tab.id, owner(tab, regionId), {
          enabled: false,
          kind: 'enabled',
        }),
        { code: 'PROJECT_LAYER_NOT_FOUND' },
      )
      await assert.rejects(f.service.deleteRegionalGuidance(tab.id, owner(tab, regionId)), {
        code: 'PROJECT_LAYER_NOT_FOUND',
      })
    }
    assert.deepEqual(f.tab(), before)
    assert.ok((await readFile(f.savedPath)).equals(saved))
  })
})

test('staged edit rejects saved-revision ABA through the captured Main epoch without a phantom Undo', async () => {
  await withProject(async (f) => {
    const tab = await f.service.addRegionalGuidance(f.tab().id, documentOwner(f.tab()))
    await f.service.save(tab.id)
    await f.service.clearHistory(tab.id)
    const before = structuredClone(f.document())
    const entered = deferred()
    const release = deferred()
    f.setBeforeEdit(async (candidate) => {
      if (candidate.regionalGuidance?.[0].name === 'Staged rename') {
        entered.release()
        await release.promise
      }
    })
    const editing = f.service.updateRegionalGuidance(tab.id, owner(f.tab()), {
      kind: 'rename',
      name: 'Staged rename',
    })
    const refused = assert.rejects(editing, { code: 'EDIT_CONFLICT' })
    await entered.promise
    try {
      await f.service.updateGenerationDraft(tab.id, {
        kind: 'positive-prompt',
        text: 'intervening edit',
      })
      await f.service.undo(tab.id)
      assert.equal(f.document().documentRevision, before.documentRevision)
    } finally {
      release.release()
    }
    await refused
    f.setBeforeEdit()
    assert.deepEqual(f.document(), before)
    assert.equal(f.tab().canUndo, false)
    assert.equal(f.tab().canRedo, true)
  })
})

test('staged requests and DTOs are detached and a closed coordinator cannot publish into its replacement', async () => {
  await withProject(async (f) => {
    const tab = await f.service.addRegionalGuidance(f.tab().id, documentOwner(f.tab()))
    await f.service.save(tab.id)
    const entered = deferred()
    const release = deferred()
    f.setBeforeEdit(async (candidate) => {
      if (candidate.regionalGuidance?.[0].name === 'Captured name') {
        entered.release()
        await release.promise
      }
    })
    const target = owner(f.tab())
    const change: ProjectRegionalGuidanceChange = { kind: 'rename', name: 'Captured name' }
    const editing = f.service.updateRegionalGuidance(tab.id, target, change)
    await entered.promise
    target.documentId = randomUUID()
    target.regionId = randomUUID()
    change.name = 'Caller mutation'
    release.release()
    let current = await editing
    f.setBeforeEdit()
    assert.equal(region(current).name, 'Captured name')
    current.regionalGuidance![0].name = 'DTO mutation'
    current.regionalGuidance![0].mask.id = randomUUID()
    assert.equal(region(f.tab()).name, 'Captured name')
    await f.service.save(tab.id)
    const held = deferred()
    const finish = deferred()
    f.setBeforeEdit(async (candidate) => {
      if (candidate.regionalGuidance?.[0].name === 'Old coordinator') {
        held.release()
        await finish.promise
      }
    })
    const pending = f.service.updateRegionalGuidance(tab.id, owner(f.tab()), {
      kind: 'rename',
      name: 'Old coordinator',
    })
    const refused = assert.rejects(pending, (error: unknown) =>
      Boolean(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        ['COORDINATOR_CLOSED', 'EDIT_CONFLICT'].includes(String(error.code)),
      ),
    )
    await held.promise
    try {
      await f.service.close(tab.id)
      const reopened = await f.service.open(tab.id)
      assert.equal(reopened.kind, 'opened')
    } finally {
      finish.release()
    }
    await refused
    f.setBeforeEdit()
    assert.equal(region(f.tab()).name, 'Captured name')
    assert.equal(f.tab().dirty, false)
  })
})

test('controlled edit failure and external Save refusal retain the regional document and recovery', async () => {
  await withProject(async (f) => {
    let tab = await f.service.addRegionalGuidance(f.tab().id, documentOwner(f.tab()))
    const before = structuredClone(tab)
    f.setBeforeEdit(async () => {
      throw new Error('Controlled regional publication refusal')
    })
    await assert.rejects(
      f.service.updateRegionalGuidance(tab.id, owner(tab), { kind: 'rename', name: 'Refused' }),
      /Controlled regional publication refusal/,
    )
    f.setBeforeEdit()
    assert.deepEqual(f.tab(), before)
    await f.service.flushAutosave(tab.id)
    const saved = await readIgsPackage(f.savedPath)
    const assets: Record<string, { bytes: Buffer }> = {}
    for (const layer of saved.project.layers) {
      if (layer.kind === 'raster') {
        assets[layer.asset.path] = { bytes: await saved.readMember(layer.asset.path) }
      }
    }
    await saveIgsPackage(f.savedPath, {
      assets,
      preview: {
        merged: await saved.readMember('preview/merged.png'),
        rect: saved.manifest.preview.rect,
        status: saved.manifest.preview.status,
        thumbnail: await saved.readMember('preview/thumbnail.webp'),
      },
      project: { ...saved.project, documentRevision: randomUUID(), title: 'External authority' },
    })
    const external = await readFile(f.savedPath)
    await assert.rejects(f.service.save(tab.id))
    assert.ok((await readFile(f.savedPath)).equals(external))
    tab = f.tab()
    assert.equal(tab.dirty, true)
    assert.deepEqual(tab.regionalGuidance, before.regionalGuidance)
    assert.notEqual(
      (
        await f.shadow.inspect({
          projectPath: f.savedPath,
          savedPackage: await readIgsPackage(f.savedPath),
        })
      ).status,
      'absent',
    )
  })
})

test('regional and existing Smart add allocators retry every current-owned UUID and reserve both new identities', async (t) => {
  await withProject(async (f) => {
    let tab = await f.service.addRegionalGuidance(f.tab().id, documentOwner(f.tab()))
    const occupied = projectOwnedIds(f.document())
    const originalRandom = crypto.randomUUID
    const regionId = originalRandom()
    const maskId = originalRandom()
    const candidates = [...occupied, regionId, regionId, ...occupied, maskId]
    const mocked = t.mock.method(crypto, 'randomUUID', () => candidates.shift() ?? originalRandom())
    syncBuiltinESMExports()
    try {
      tab = await f.service.addRegionalGuidance(tab.id, documentOwner(tab))
      assert.deepEqual(tab.regionalGuidance!.at(-1)?.mask, { asset: null, id: maskId, revision: 0 })
      assert.equal(tab.regionalGuidance!.at(-1)?.id, regionId)
      assert.equal(candidates.length, 0)
    } finally {
      mocked.mock.restore()
      syncBuiltinESMExports()
    }
    const duplicateId = originalRandom()
    const duplicateMaskId = originalRandom()
    const beforeCopy = projectOwnedIds(f.document())
    const copyCandidates = [...beforeCopy, duplicateId, duplicateId, ...beforeCopy, duplicateMaskId]
    const mockedCopy = t.mock.method(
      crypto,
      'randomUUID',
      () => copyCandidates.shift() ?? originalRandom(),
    )
    syncBuiltinESMExports()
    try {
      tab = await f.service.duplicateRegionalGuidance(tab.id, owner(tab, regionId))
      const copy = region(tab, duplicateId)
      assert.equal(copy.mask.id, duplicateMaskId)
      assert.equal(copyCandidates.length, 0)
    } finally {
      mockedCopy.mock.restore()
      syncBuiltinESMExports()
    }
    const smartId = originalRandom()
    const smartMaskId = originalRandom()
    const allOwned = projectOwnedIds(f.document())
    const next = [...allOwned, smartId, smartId, ...allOwned, smartMaskId]
    const mockedSmart = t.mock.method(crypto, 'randomUUID', () => next.shift() ?? originalRandom())
    syncBuiltinESMExports()
    try {
      tab = await f.service.addSmartPatchLayer(tab.id)
      const patch = tab.layers.find(({ id }) => id === smartId)
      assert.ok(patch?.kind === 'smart-patch')
      assert.equal(patch.mask.id, smartMaskId)
      assert.equal(next.length, 0)
      const ids = projectOwnedIds(f.document())
      assert.equal(new Set(ids).size, ids.length)
    } finally {
      mockedSmart.mock.restore()
      syncBuiltinESMExports()
    }
  })
})

test('regional admission guard consults the actual owner while image resources and other tabs remain independent', async () => {
  await withProject(async (f) => {
    let tab = await f.service.addRegionalGuidance(f.tab().id, documentOwner(f.tab()))
    assert.throws(() => f.service.assertNewGenerationAdmission(tab.id, tab.documentId), {
      code: 'GENERATION_REGIONAL_GUIDANCE_UNSUPPORTED',
    })
    const patch = tab.layers.find((layer) => layer.kind === 'smart-patch')!
    assert.doesNotThrow(
      () => f.service.assertSmartPatchGenerationAdmission(tab.id, tab.documentId, patch.id),
      'Target permission remains independent of new-job regional eligibility after SQL publication.',
    )
    const value = region(tab)
    assert.equal(
      resolveProjectLayerAsset(f.document(), {
        assetSha256: 'a'.repeat(64),
        documentRevision: tab.documentRevision,
        layerId: value.id,
        tabId: tab.id,
      }),
      null,
    )
    assert.equal(
      resolveProjectMaskAsset(f.document(), {
        assetSha256: 'a'.repeat(64),
        documentRevision: tab.documentRevision,
        layerId: value.id,
        maskId: value.mask.id,
        maskRevision: 0,
        tabId: tab.id,
      }),
      null,
    )
    const other = await f.service.create({ height: 256, title: 'Independent owner', width: 256 })
    assert.doesNotThrow(() => f.service.assertNewGenerationAdmission(other.id, other.documentId))
    assert.throws(() => f.service.assertNewGenerationAdmission(tab.id, other.documentId), {
      code: 'PROJECT_IDENTITY_MISMATCH',
    })
    tab = await f.service.updateRegionalGuidance(tab.id, owner(tab), {
      enabled: false,
      kind: 'enabled',
    })
    assert.doesNotThrow(() => f.service.assertNewGenerationAdmission(tab.id, tab.documentId))
    assert.doesNotThrow(() =>
      f.service.assertSmartPatchGenerationAdmission(tab.id, tab.documentId, patch.id),
    )
    assert.equal(f.service.getOpenTabs().find(({ id }) => id === other.id)?.canUndo, false)
  })
})
