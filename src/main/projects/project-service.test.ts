import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, utimes } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholdersDir = path.resolve('src/main/projects/placeholders')
const rasterPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)

/** Seed a real portable .igs, then enter the Project service through its public import flow. */
async function openTwoLayerProject(
  dataRoot: string,
  repository: ProjectIndexRepository,
  service: ProjectService,
): Promise<{ filePath: string; layerIds: [string, string]; tabId: string }> {
  const externalPath = path.join(dataRoot, 'Raster fixture.igs')
  const layerIds: [string, string] = [randomUUID(), randomUUID()]
  const sha256 = createHash('sha256').update(rasterPng).digest('hex')
  const assetPaths = layerIds.map((id) => `assets/layers/${id}.png`)
  const project = createEmptyProjectDocumentV1({ title: 'Raster editing' })
  const placeholders = await readProjectPlaceholders(placeholdersDir, 'unavailable')
  await saveIgsPackage(externalPath, {
    assets: Object.fromEntries(assetPaths.map((assetPath) => [assetPath, { bytes: rasterPng }])),
    preview: {
      ...placeholders,
      rect: { height: 2, width: 6, x: 0, y: 0 },
      status: 'unavailable',
    },
    project: {
      ...project,
      layers: layerIds.map((id, index) => ({
        asset: { bytes: rasterPng.length, height: 2, path: assetPaths[index], sha256, width: 2 },
        blendMode: 'normal' as const,
        id,
        kind: 'raster' as const,
        locked: false,
        name: index === 0 ? 'Top' : 'Bottom',
        opacity: 1,
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: index * 4, y: 0 },
        visible: true,
      })),
    },
  })
  const selected = await service.selectImport(externalPath)
  assert.equal(selected.kind, 'transfer-required')
  if (selected.kind !== 'transfer-required') {
    throw new Error('Fixture import did not request a transfer.')
  }
  const imported = await service.finishImport(selected.importId, 'copy')
  assert.equal(imported.result.kind, 'opened')
  if (imported.result.kind !== 'opened') {
    throw new Error('Fixture import did not open the Project.')
  }
  const indexed = await repository.listProjects()
  assert.equal(indexed.length, 1)
  return { filePath: indexed[0].canonicalPath, layerIds, tabId: imported.result.tab.id }
}

async function withService(
  run: (context: {
    dataRoot: string
    repository: ProjectIndexRepository
    service: ProjectService
    shadow: ProjectShadowStore
  }) => Promise<void>,
): Promise<void> {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-service-'))
  const database = openAppDatabase(dataRoot, migrations)
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(dataRoot, 'autosave'))
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot,
    repository,
    roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
    shadow,
  })
  try {
    await run({ dataRoot, repository, service, shadow })
  } finally {
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
}

test('Project service creates, edits, saves and reopens an actual .igs with independent bbox coordinates', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const created = await service.create({
      height: 1152,
      title: '   Portrait board   ',
      width: 768,
    })
    assert.equal(created.title, 'Portrait board')
    assert.deepEqual(created.primaryBbox, { height: 1152, width: 768, x: 0, y: 0 })
    assert.equal(created.dirty, false)
    const indexed = (await repository.listProjects())[0]
    assert.equal(indexed.localProjectKey, created.id)
    assert.equal(indexed.previewStatus, 'empty')
    assert.equal((await readIgsPackage(indexed.canonicalPath)).project.primaryBbox.width, 768)

    const changed = await service.setPrimaryBbox(created.id, {
      height: 640,
      width: 1024,
      x: -320,
      y: 96,
    })
    assert.equal(changed.dirty, true)
    assert.equal(service.hasDirtyTabs(), true)
    await service.flushAutosave(created.id)
    assert.equal((await readIgsPackage(indexed.canonicalPath)).project.primaryBbox.x, 0)
    assert.equal((await service.list())[0]?.recoveryStatus, 'none')

    const saved = await service.save(created.id)
    assert.equal(saved.committed, true)
    assert.equal(saved.recoveryStatus, 'clean')
    assert.equal(saved.tab.dirty, false)
    assert.equal(service.hasDirtyTabs(), false)
    await service.close(created.id)
    assert.deepEqual(service.getOpenTabs(), [])

    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    const opened = await restarted.open(created.id)
    assert.equal(opened.kind, 'opened')
    if (opened.kind === 'opened') {
      assert.deepEqual(opened.tab.primaryBbox, {
        height: 640,
        width: 1024,
        x: -320,
        y: 96,
      })
      assert.equal(opened.tab.dirty, false)
      assert.deepEqual(await restarted.open(created.id), opened)
      await restarted.close(created.id)
    }
    assert.deepEqual((await service.list())[0]?.bbox, { height: 640, width: 1024 })
  })
})

test('Project service asks before recovery and restores dirty document without replacing saved .igs', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const created = await service.create({ height: 512, title: 'Recovery', width: 512 })
    const savedPath = (await repository.listProjects())[0].canonicalPath
    await service.setPrimaryBbox(created.id, { height: 896, width: 640, x: -44, y: 12 })
    await service.flushAutosave(created.id)
    assert.equal((await readIgsPackage(savedPath)).project.primaryBbox.x, 0)

    // A new lease registry models the next main process after a crash. The first service stays
    // dirty and does not perform a graceful close or erase the recovery shadow.
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    const summary = (await restarted.list())[0]
    assert.equal(summary.recoveryStatus, 'recoverable')
    const choice = await restarted.open(created.id)
    assert.equal(choice.kind, 'recovery-required')
    if (choice.kind === 'recovery-required') {
      assert.equal(choice.recoveryStatus, 'recoverable')
    }
    assert.equal((await readIgsPackage(savedPath)).project.primaryBbox.x, 0)

    const recovered = await restarted.resolveRecovery(created.id, 'recover')
    assert.equal(recovered.dirty, true)
    assert.equal(recovered.primaryBbox.x, -44)
    assert.equal((await readIgsPackage(savedPath)).project.primaryBbox.x, 0)
    assert.equal((await restarted.save(created.id)).recoveryStatus, 'clean')
    assert.equal((await readIgsPackage(savedPath)).project.primaryBbox.x, -44)
    await restarted.close(created.id)
  })
})

test('Project service rejects unknown IDs and invalid bbox before changing an open document', async () => {
  await withService(async ({ service }) => {
    const created = await service.create({ height: 1024, title: 'Valid', width: 1024 })
    await assert.rejects(service.open('../../outside.igs'), { code: 'PROJECT_INVALID_INPUT' })
    await assert.rejects(service.open(`project-v1-${'0'.repeat(64)}`), {
      code: 'PROJECT_NOT_FOUND',
    })
    await assert.rejects(
      service.setPrimaryBbox(created.id, { height: 512, width: 0, x: 0, y: 0 }),
      { code: 'PROJECT_INVALID_INPUT' },
    )
    assert.equal(service.getOpenTabs()[0].dirty, false)
    assert.deepEqual(service.getOpenTabs()[0].primaryBbox, {
      height: 1024,
      width: 1024,
      x: 0,
      y: 0,
    })
    await service.close(created.id)
  })
})

test('an indexed path swapped to another .igs during recovery inspection cannot open or Save the other file', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const created = await service.create({ height: 512, title: 'Indexed', width: 512 })
    const indexedPath = (await repository.listProjects())[0].canonicalPath
    await service.close(created.id)
    const externalPath = path.join(dataRoot, 'external.igs')
    await ProjectSession.create(externalPath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const externalBefore = await readFile(externalPath)
    let swapped = false
    class SwappingShadow extends ProjectShadowStore {
      override async inspect(input: Parameters<ProjectShadowStore['inspect']>[0]) {
        const inspection = await super.inspect(input)
        if (!swapped) {
          swapped = true
          await rename(indexedPath, `${indexedPath}.original`)
          await symlink(externalPath, indexedPath)
        }
        return inspection
      }
    }
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow: new SwappingShadow(path.join(dataRoot, 'autosave')),
    })
    await assert.rejects(restarted.open(created.id), { code: 'PROJECT_INVALID_PATH' })
    assert.deepEqual(restarted.getOpenTabs(), [])
    assert.deepEqual(await readFile(externalPath), externalBefore)
  })
})

test('a default workspace redirected before New Project cannot create a file outside the workspace', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    await service.initialize()
    const workspace = await repository.workspaceById('uncategorized')
    const outside = path.join(dataRoot, 'outside')
    await mkdir(outside)
    await rename(workspace.directoryPath, `${workspace.directoryPath}.saved`)
    await symlink(outside, workspace.directoryPath)
    await assert.rejects(service.create({ height: 512, title: 'Outside attempt', width: 512 }), {
      code: 'PROJECT_INVALID_PATH',
    })
    assert.deepEqual(await readdir(outside), [])
  })
})

test('recovery cannot follow an indexed path swapped after shadow inspection', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const created = await service.create({ height: 512, title: 'Recover here', width: 512 })
    const indexedPath = (await repository.listProjects())[0].canonicalPath
    await service.setPrimaryBbox(created.id, { height: 512, width: 512, x: 15, y: 0 })
    await service.flushAutosave(created.id)
    const externalPath = path.join(dataRoot, 'external-recovery.igs')
    await ProjectSession.create(externalPath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const externalBefore = await readFile(externalPath)
    let swapped = false
    class SwappingShadow extends ProjectShadowStore {
      override async inspect(input: Parameters<ProjectShadowStore['inspect']>[0]) {
        const inspection = await super.inspect(input)
        if (!swapped) {
          swapped = true
          await rename(indexedPath, `${indexedPath}.original`)
          await symlink(externalPath, indexedPath)
        }
        return inspection
      }
    }
    const restarted = new ProjectService({
      autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow: new SwappingShadow(path.join(dataRoot, 'autosave')),
    })
    await assert.rejects(restarted.resolveRecovery(created.id, 'recover'), {
      code: 'PROJECT_INVALID_PATH',
    })
    assert.deepEqual(restarted.getOpenTabs(), [])
    assert.deepEqual(await readFile(externalPath), externalBefore)
  })
})

test('a failed Project Save keeps the dirty tab and its valid recovery shadow', async () => {
  await withService(async ({ repository, service, shadow }) => {
    const created = await service.create({ height: 512, title: 'Uncommitted', width: 512 })
    const filePath = (await repository.listProjects())[0].canonicalPath
    await service.setPrimaryBbox(created.id, { height: 512, width: 512, x: 99, y: 0 })
    await service.flushAutosave(created.id)
    // A changed on-disk fingerprint forces the real Save compare-and-replace guard to reject.
    // The package bytes remain valid, so recovery can still be independently inspected.
    await utimes(filePath, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'))
    await assert.rejects(service.save(created.id), { code: 'PROJECT_EXTERNAL_CHANGE' })
    assert.equal(service.getOpenTabs()[0].dirty, true)
    assert.equal((await readIgsPackage(filePath)).project.primaryBbox.x, 0)
    assert.equal(
      (
        await shadow.inspect({
          projectPath: filePath,
          savedPackage: await readIgsPackage(filePath),
        })
      ).status,
      'recoverable',
    )
  })
})

test('a post-create index failure preserves the new .igs for the next Home scan', async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-service-index-'))
  const database = openAppDatabase(dataRoot, migrations)
  try {
    class FailingOnceIndex extends ProjectIndexRepository {
      private failed = false

      override async indexSaved(filePath: string, workspaceId: string) {
        if (!this.failed) {
          this.failed = true
          throw new Error('simulated derived index outage')
        }
        return await super.indexSaved(filePath, workspaceId)
      }
    }
    const repository = new FailingOnceIndex(database.db)
    const service = new ProjectService({
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow: new ProjectShadowStore(path.join(dataRoot, 'autosave')),
    })
    await assert.rejects(service.create({ height: 512, title: 'Still on disk', width: 512 }), {
      code: 'PROJECT_CREATED_NOT_INDEXED',
    })
    const workspace = await repository.workspaceById('uncategorized')
    const files = await readdir(workspace.directoryPath)
    assert.equal(files.length, 1)
    assert.equal(
      (await readIgsPackage(path.join(workspace.directoryPath, files[0]))).project.title,
      'Still on disk',
    )
    const rediscovered = await service.list()
    assert.equal(rediscovered.length, 1)
    assert.equal(rediscovered[0].title, 'Still on disk')
  } finally {
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
})

test('dirty close preserves the tab; explicit discard removes recovery and reopens saved state', async () => {
  await withService(async ({ repository, service, shadow }) => {
    const created = await service.create({ height: 512, title: 'Keep open', width: 512 })
    await service.setPrimaryBbox(created.id, { height: 512, width: 512, x: 40, y: 0 })
    await service.flushAutosave(created.id)
    await assert.rejects(service.close(created.id), { code: 'PROJECT_DIRTY' })
    assert.equal(service.getOpenTabs().length, 1)
    await service.discardAndClose(created.id)
    assert.deepEqual(service.getOpenTabs(), [])
    const savedPath = (await repository.listProjects())[0].canonicalPath
    assert.equal((await readIgsPackage(savedPath)).project.primaryBbox.x, 0)
    assert.equal(
      (
        await shadow.inspect({
          projectPath: savedPath,
          savedPackage: await readIgsPackage(savedPath),
        })
      ).status,
      'absent',
    )
    const reopened = await service.open(created.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind === 'opened') {
      assert.equal(reopened.tab.dirty, false)
      await service.close(created.id)
    }
  })
})

test('external .igs selection is inert until confirmed and Copy preserves portable document identity', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const externalDirectory = path.join(dataRoot, 'external')
    await mkdir(externalDirectory)
    const sourcePath = path.join(externalDirectory, 'Field Notes.igs')
    await ProjectSession.create(sourcePath, 'Field Notes', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const originalBytes = await readFile(sourcePath)
    const originalDocument = (await readIgsPackage(sourcePath)).project
    const canceled = await service.selectImport(sourcePath)
    assert.equal(canceled.kind, 'transfer-required')
    if (canceled.kind !== 'transfer-required') {
      return
    }
    assert.equal(canceled.title, 'Field Notes')
    const workspace = await repository.workspaceById('uncategorized')
    assert.deepEqual(await readdir(workspace.directoryPath), [])
    service.cancelImport(canceled.importId)
    await assert.rejects(service.finishImport(canceled.importId, 'move'), {
      code: 'PROJECT_IMPORT_SELECTION_MISSING',
    })
    assert.deepEqual(await readFile(sourcePath), originalBytes)
    assert.deepEqual(await readdir(workspace.directoryPath), [])

    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const imported = await service.finishImport(selected.importId, 'copy')
    assert.equal(imported.result.kind, 'opened')
    assert.equal(imported.sourceRetained, true)
    assert.equal(imported.warning, undefined)
    assert.deepEqual(await readFile(sourcePath), originalBytes)
    const first = (await repository.listProjects())[0]
    assert.equal(path.basename(first.canonicalPath), 'Field Notes.igs')
    assert.equal(first.documentId, originalDocument.documentId)
    assert.notEqual(first.localProjectKey, selected.importId)
    assert.deepEqual(await readFile(first.canonicalPath), originalBytes)
    if (imported.result.kind === 'opened') {
      assert.equal(imported.result.tab.id, first.localProjectKey)
      await service.close(imported.result.tab.id)
    }

    // A second Copy cannot overwrite the already imported Project and gets its own recovery key.
    const secondSelection = await service.selectImport(sourcePath)
    assert.equal(secondSelection.kind, 'transfer-required')
    if (secondSelection.kind !== 'transfer-required') {
      return
    }
    const second = await service.finishImport(secondSelection.importId, 'copy')
    assert.equal(second.result.kind, 'opened')
    const rows = await repository.listProjects()
    assert.equal(rows.length, 2)
    assert.notEqual(rows[0].localProjectKey, rows[1].localProjectKey)
    assert.deepEqual(
      rows.map((row) => row.documentId),
      [originalDocument.documentId, originalDocument.documentId],
    )
    if (second.result.kind === 'opened') {
      await service.close(second.result.tab.id)
    }
  })
})

test('Move removes the selected source only after a valid imported .igs opens', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const externalDirectory = path.join(dataRoot, 'external')
    await mkdir(externalDirectory)
    const sourcePath = path.join(externalDirectory, 'Move Me.igs')
    await ProjectSession.create(sourcePath, 'Move Me', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const originalBytes = await readFile(sourcePath)
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const imported = await service.finishImport(selected.importId, 'move')
    assert.equal(imported.result.kind, 'opened')
    assert.equal(imported.sourceRetained, false)
    assert.equal(imported.warning, undefined)
    await assert.rejects(readFile(sourcePath), { code: 'ENOENT' })
    const row = (await repository.listProjects())[0]
    assert.deepEqual(await readFile(row.canonicalPath), originalBytes)
    if (imported.result.kind === 'opened') {
      await service.close(imported.result.tab.id)
    }
    const reopened = await service.open(row.localProjectKey)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind === 'opened') {
      await service.close(reopened.tab.id)
    }
  })
})

test('a changed selected source cannot be transferred and leaves the workspace untouched', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const sourcePath = path.join(dataRoot, 'Original.igs')
    await ProjectSession.create(sourcePath, 'Original', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    await utimes(sourcePath, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'))
    await assert.rejects(service.finishImport(selected.importId, 'move'), {
      code: 'PROJECT_IMPORT_SOURCE_CHANGED',
    })
    assert.equal((await readIgsPackage(sourcePath)).project.title, 'Original')
    assert.deepEqual(
      await readdir((await repository.workspaceById('uncategorized')).directoryPath),
      [],
    )
  })
})

test('Move keeps a source changed after destination publication and reports the duplicate', async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-service-import-race-'))
  const database = openAppDatabase(dataRoot, migrations)
  try {
    const sourcePath = path.join(dataRoot, 'External.igs')
    await ProjectSession.create(sourcePath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    class ChangingSourceIndex extends ProjectIndexRepository {
      private changed = false

      override async indexSaved(filePath: string, workspaceId: string) {
        if (!this.changed) {
          this.changed = true
          await utimes(
            sourcePath,
            new Date('2000-01-01T00:00:00Z'),
            new Date('2000-01-01T00:00:00Z'),
          )
        }
        return await super.indexSaved(filePath, workspaceId)
      }
    }
    const repository = new ChangingSourceIndex(database.db)
    const service = new ProjectService({
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow: new ProjectShadowStore(path.join(dataRoot, 'autosave')),
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const imported = await service.finishImport(selected.importId, 'move')
    assert.equal(imported.result.kind, 'opened')
    assert.equal(imported.sourceRetained, true)
    assert.match(imported.warning ?? '', /original file was kept/i)
    assert.equal((await readIgsPackage(sourcePath)).project.title, 'External')
    assert.equal((await repository.listProjects()).length, 1)
    if (imported.result.kind === 'opened') {
      await service.close(imported.result.tab.id)
    }
  } finally {
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
})

test('failed source removal returns a retained-source warning after a valid destination commits', async () => {
  await withService(async ({ dataRoot, repository, shadow }) => {
    const sourcePath = path.join(dataRoot, 'External.igs')
    await ProjectSession.create(sourcePath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const service = new ProjectService({
      dataRoot,
      removeImportedSource: async () => {
        throw new Error('simulated unlink failure')
      },
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow,
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const imported = await service.finishImport(selected.importId, 'move')
    assert.equal(imported.result.kind, 'opened')
    assert.equal(imported.sourceRetained, true)
    assert.match(imported.warning ?? '', /original file was kept/i)
    assert.equal((await repository.listProjects()).length, 1)
    assert.equal((await readIgsPackage(sourcePath)).project.title, 'External')
    if (imported.result.kind === 'opened') {
      await service.close(imported.result.tab.id)
    }
  })
})

test('index failure after import publication keeps both valid files for Home rediscovery', async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-service-import-index-'))
  const database = openAppDatabase(dataRoot, migrations)
  try {
    const sourcePath = path.join(dataRoot, 'External.igs')
    await ProjectSession.create(sourcePath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const originalBytes = await readFile(sourcePath)
    class FailingImportIndex extends ProjectIndexRepository {
      private failed = false

      override async indexSaved(filePath: string, workspaceId: string) {
        if (!this.failed) {
          this.failed = true
          throw new Error('simulated index outage after copy')
        }
        return await super.indexSaved(filePath, workspaceId)
      }
    }
    const repository = new FailingImportIndex(database.db)
    const service = new ProjectService({
      dataRoot,
      repository,
      roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
      shadow: new ProjectShadowStore(path.join(dataRoot, 'autosave')),
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    await assert.rejects(service.finishImport(selected.importId, 'move'), {
      code: 'PROJECT_IMPORTED_NOT_INDEXED',
    })
    assert.deepEqual(await readFile(sourcePath), originalBytes)
    assert.deepEqual(service.getOpenTabs(), [])
    const workspace = await repository.workspaceById('uncategorized')
    const files = await readdir(workspace.directoryPath)
    assert.deepEqual(files, ['External.igs'])
    assert.deepEqual(await readFile(path.join(workspace.directoryPath, files[0])), originalBytes)
    assert.equal((await service.list())[0].title, 'External')
  } finally {
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
})

test('import rejects a symlinked file and a redirected workspace without publishing outside it', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const sourcePath = path.join(dataRoot, 'External.igs')
    await ProjectSession.create(sourcePath, 'External', {
      placeholdersDir,
      scratchDir: path.join(dataRoot, 'scratch'),
    })
    const linkedSource = path.join(dataRoot, 'Linked.igs')
    await symlink(sourcePath, linkedSource)
    await assert.rejects(service.selectImport(linkedSource), {
      code: 'PROJECT_IMPORT_INVALID_SOURCE',
    })
    const selected = await service.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      return
    }
    const workspace = await repository.workspaceById('uncategorized')
    const elsewhere = path.join(dataRoot, 'elsewhere')
    await mkdir(elsewhere)
    await rename(workspace.directoryPath, `${workspace.directoryPath}.original`)
    await symlink(elsewhere, workspace.directoryPath)
    await assert.rejects(service.finishImport(selected.importId, 'copy'), {
      code: 'PROJECT_INVALID_PATH',
    })
    assert.deepEqual(await readdir(elsewhere), [])
    assert.equal((await readIgsPackage(sourcePath)).project.title, 'External')
  })
})

test('Raster Layer commands persist top-first order and properties through shadow, Save and reopen', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const original = await readIgsPackage(filePath)
    assert.deepEqual(
      original.project.layers.map((layer) => layer.id),
      layerIds,
    )
    assert.equal(original.manifest.preview.status, 'unavailable')

    // The public service boundary must change the open document, while the saved .igs stays put
    // until Save. Each property and the list order must survive the independent loader.
    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'visibility', visible: false })
    await service.updateRasterLayer(tabId, layerIds[1], { kind: 'opacity', opacity: 0.4 })
    await service.updateRasterLayer(tabId, layerIds[1], {
      blendMode: 'multiply',
      kind: 'blend-mode',
    })
    const moved = await service.moveRasterLayer(tabId, layerIds[1], 0)
    assert.deepEqual(
      moved.layers.map((layer) => layer.id),
      [layerIds[1], layerIds[0]],
    )
    const locked = await service.updateRasterLayer(tabId, layerIds[1], {
      kind: 'lock',
      locked: true,
    })
    assert.equal(locked.dirty, true)
    assert.deepEqual(
      locked.layers.map(({ blendMode, locked, opacity, visible }) => ({
        blendMode,
        locked,
        opacity,
        visible,
      })),
      [
        { blendMode: 'multiply', locked: true, opacity: 0.4, visible: true },
        { blendMode: 'normal', locked: false, opacity: 1, visible: false },
      ],
    )
    await service.flushAutosave(tabId)
    assert.deepEqual((await readIgsPackage(filePath)).project.layers, original.project.layers)
    const recovery = await shadow.inspect({ projectPath: filePath, savedPackage: original })
    assert.equal(recovery.status, 'recoverable')
    if (recovery.status === 'recoverable') {
      assert.deepEqual(
        recovery.document.layers.map((layer) => layer.id),
        [layerIds[1], layerIds[0]],
      )
      assert.equal(recovery.document.layers[0].blendMode, 'multiply')
      assert.equal(recovery.document.layers[1].visible, false)
    }

    assert.equal((await service.save(tabId)).tab.dirty, false)
    const saved = await readIgsPackage(filePath)
    assert.deepEqual(
      saved.project.layers.map((layer) => layer.id),
      [layerIds[1], layerIds[0]],
    )
    assert.equal(saved.project.layers[0].opacity, 0.4)
    assert.equal(saved.project.layers[0].locked, true)
    assert.equal(saved.project.layers[1].visible, false)
    assert.equal(saved.manifest.preview.status, 'unavailable')
    for (const layer of saved.project.layers) {
      assert.deepEqual(await saved.readMember(layer.asset.path), rasterPng)
    }
    await service.close(tabId)
    const reopened = await service.open(tabId)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind === 'opened') {
      assert.equal(reopened.tab.dirty, false)
      assert.deepEqual(
        reopened.tab.layers.map((layer) => layer.id),
        [layerIds[1], layerIds[0]],
      )
      assert.equal(reopened.tab.layers[0].blendMode, 'multiply')
      assert.equal(reopened.tab.layers[0].opacity, 0.4)
      assert.equal(reopened.tab.layers[0].locked, true)
      assert.equal(reopened.tab.layers[1].visible, false)
      await service.close(tabId)
    }
  })
})

test('Raster Layer commands reject invalid or locked edits and preserve a clean document on no-op', async () => {
  await withService(async ({ dataRoot, repository, service, shadow }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    const before = await readIgsPackage(filePath)
    const beforeTabs = service.getOpenTabs()
    assert.equal(
      (
        await service.updateRasterLayer(tabId, layerIds[0], {
          kind: 'visibility',
          visible: true,
        })
      ).dirty,
      false,
    )
    assert.equal((await service.moveRasterLayer(tabId, layerIds[0], 0)).dirty, false)

    await assert.rejects(
      service.updateRasterLayer(tabId, randomUUID(), { kind: 'visibility', visible: false }),
      { code: 'PROJECT_LAYER_NOT_FOUND' },
    )
    for (const opacity of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await assert.rejects(
        service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity }),
        { code: 'PROJECT_INVALID_INPUT' },
      )
    }
    for (const index of [-1, 2, 0.5]) {
      await assert.rejects(service.moveRasterLayer(tabId, layerIds[0], index), {
        code: 'PROJECT_INVALID_INPUT',
      })
    }
    assert.deepEqual(service.getOpenTabs(), beforeTabs)
    await service.flushAutosave(tabId)
    assert.deepEqual((await readIgsPackage(filePath)).project, before.project)
    assert.notEqual(
      (await shadow.inspect({ projectPath: filePath, savedPackage: before })).status,
      'recoverable',
    )

    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'lock', locked: true })
    await assert.rejects(
      service.updateRasterLayer(tabId, layerIds[0], { kind: 'opacity', opacity: 0.5 }),
      { code: 'PROJECT_LAYER_LOCKED' },
    )
    await assert.rejects(service.moveRasterLayer(tabId, layerIds[0], 1), {
      code: 'PROJECT_LAYER_LOCKED',
    })
    assert.equal(service.getOpenTabs()[0].layers[0].opacity, 1)
    assert.deepEqual(
      service.getOpenTabs()[0].layers.map((layer) => layer.id),
      layerIds,
    )
  })
})

test('Save marks an all-hidden or zero-opacity raster Project empty without dropping layer assets', async () => {
  await withService(async ({ dataRoot, repository, service }) => {
    const { filePath, layerIds, tabId } = await openTwoLayerProject(dataRoot, repository, service)
    await service.updateRasterLayer(tabId, layerIds[0], { kind: 'visibility', visible: false })
    await service.updateRasterLayer(tabId, layerIds[1], { kind: 'opacity', opacity: 0 })
    await service.save(tabId)
    const empty = await readIgsPackage(filePath)
    assert.equal(empty.manifest.preview.status, 'empty')
    assert.equal(empty.manifest.preview.rect, null)
    assert.equal(empty.project.layers.length, 2)
    for (const layer of empty.project.layers) {
      assert.deepEqual(await empty.readMember(layer.asset.path), rasterPng)
    }

    // One visible nonzero-opacity layer changes only the preview classification; pixels are still
    // saved intact when the worker is unavailable.
    await service.updateRasterLayer(tabId, layerIds[1], { kind: 'opacity', opacity: 0.01 })
    await service.save(tabId)
    const visible = await readIgsPackage(filePath)
    assert.equal(visible.manifest.preview.status, 'unavailable')
    assert.deepEqual(visible.manifest.preview.rect, { height: 2, width: 2, x: 4, y: 0 })
    assert.deepEqual(await visible.readMember(visible.project.layers[1].asset.path), rasterPng)
  })
})
