import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, utimes } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectService } from './project-service.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholdersDir = path.resolve('src/main/projects/placeholders')

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
