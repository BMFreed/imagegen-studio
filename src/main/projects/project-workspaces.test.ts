import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readdir, readFile, rename, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { type AppDatabase, openAppDatabase } from '../db/database.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectService } from './project-service.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholdersDir = path.resolve('src/main/projects/placeholders')
const newProject = { height: 64, title: 'Workspace project', width: 64 }

class WorkspaceFixture {
  database: AppDatabase
  repository: ProjectIndexRepository
  service: ProjectService
  readonly services: ProjectService[] = []

  get roots() {
    return { placeholdersDir, scratchDir: path.join(this.dataRoot, 'scratch') }
  }

  constructor(
    readonly root: string,
    readonly dataRoot: string,
  ) {
    this.database = openAppDatabase(dataRoot, migrations)
    this.repository = new ProjectIndexRepository(this.database.db)
    this.service = this.makeService()
  }

  async folder(name: string): Promise<string> {
    const directory = path.join(this.root, name)
    await mkdir(directory, { recursive: true })
    return directory
  }

  makeService(repository = this.repository): ProjectService {
    const service = new ProjectService({
      autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot: this.dataRoot,
      repository,
      roots: this.roots,
      shadow: new ProjectShadowStore(path.join(this.dataRoot, 'autosave')),
    })
    this.services.push(service)
    return service
  }

  async reopen(): Promise<void> {
    for (const service of this.services) {
      assert.deepEqual(service.getOpenTabs(), [], 'Reopen requires normal clean tab closure')
    }
    await this.database.close()
    this.database = openAppDatabase(this.dataRoot, migrations)
    this.repository = new ProjectIndexRepository(this.database.db)
    this.service = this.makeService()
  }

  async source(name = 'donor.igs'): Promise<string> {
    const filePath = path.join(await this.folder('external'), name)
    await ProjectSession.create(filePath, 'Portable donor', this.roots)
    return filePath
  }
}

async function withWorkspaceFixture(
  run: (fixture: WorkspaceFixture) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-workspaces-'))
  const dataRoot = path.join(root, 'app')
  await mkdir(dataRoot, { mode: 0o700 })
  const fixture = new WorkspaceFixture(root, dataRoot)
  try {
    await run(fixture)
  } finally {
    for (const service of fixture.services) {
      for (const tab of service.getOpenTabs()) {
        await service.discardAndClose(tab.id)
      }
    }
    await fixture.database.close()
    await rm(root, { force: true, recursive: true })
  }
}

test('workspace registration persists canonical folder metadata and scans only direct .igs files', async () => {
  await withWorkspaceFixture(async (fixture) => {
    const directory = await fixture.folder('drawings')
    const alias = path.join(fixture.root, 'drawings-alias')
    await symlink(directory, alias)
    await ProjectSession.create(
      path.join(directory, 'existing.igs'),
      'Existing direct file',
      fixture.roots,
    )
    const nested = await fixture.folder('drawings/nested')
    await ProjectSession.create(
      path.join(nested, 'ignored.igs'),
      'Ignored nested file',
      fixture.roots,
    )
    const added = await fixture.service.addWorkspace(
      { color: 'blue', displayName: '  Drawings  ' },
      alias,
    )
    assert.equal(added.directoryPath, directory)
    assert.equal(added.displayName, 'Drawings')
    assert.equal(added.color, 'blue')
    assert.equal(added.isDefault, false)
    assert.equal(added.availability, 'available')
    assert.equal(added.writable, true)
    assert.equal(added.projectCount, 1)
    const projects = await fixture.service.list(added.id)
    assert.deepEqual(
      projects.map((project) => [project.title, project.workspaceId]),
      [['Existing direct file', added.id]],
    )
    const opened = await fixture.service.open(projects[0].id)
    assert.equal(opened.kind, 'opened')
    await fixture.service.close(projects[0].id)
    await fixture.reopen()
    const workspaces = await fixture.service.listWorkspaces()
    assert.equal(workspaces[0].id, 'uncategorized')
    assert.deepEqual(
      workspaces.find((workspace) => workspace.id === added.id),
      added,
    )
    assert.deepEqual(await fixture.service.list(added.id), projects)
  })
})

test('Add rejects duplicate names, aliases, ancestors and descendants without deleting folders', async () => {
  await withWorkspaceFixture(async (fixture) => {
    const directory = await fixture.folder('collection')
    await fixture.service.addWorkspace({ color: 'green', displayName: 'Collection' }, directory)
    const other = await fixture.folder('other')
    await assert.rejects(
      fixture.service.addWorkspace({ color: 'amber', displayName: ' collection ' }, other),
      { code: 'WORKSPACE_NAME_EXISTS' },
    )
    const alias = path.join(fixture.root, 'alias')
    await symlink(directory, alias)
    for (const [displayName, directoryPath] of [
      ['Alias', alias],
      ['Nested', await fixture.folder('collection/nested')],
      ['Parent', fixture.root],
    ]) {
      await assert.rejects(
        fixture.service.addWorkspace({ color: 'teal', displayName }, directoryPath),
        { code: 'WORKSPACE_PATH_CONFLICT' },
      )
    }
    for (const displayName of ['', 'x'.repeat(301)]) {
      await assert.rejects(fixture.service.addWorkspace({ color: 'teal', displayName }, other), {
        code: 'WORKSPACE_INVALID_INPUT',
      })
    }
    assert.deepEqual(
      (await fixture.service.listWorkspaces()).map((workspace) => workspace.displayName),
      ['Uncategorized', 'Collection'],
    )
    assert.deepEqual(await readdir(other), [])
    assert.deepEqual(await readdir(directory), ['nested'])
  })
})

test('concurrent duplicate metadata checks and inserts commit only one workspace row', async () => {
  await withWorkspaceFixture(async (fixture) => {
    const first = await fixture.folder('first')
    const second = await fixture.folder('second')
    const results = await Promise.allSettled([
      fixture.service.addWorkspace({ color: 'green', displayName: 'Shared name' }, first),
      fixture.service.addWorkspace({ color: 'violet', displayName: 'shared name' }, second),
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    const rejected = results.find((result) => result.status === 'rejected')
    assert.ok(rejected?.status === 'rejected')
    assert.equal(rejected.reason.code, 'WORKSPACE_NAME_EXISTS')
    assert.equal((await fixture.service.listWorkspaces()).length, 2)
    assert.deepEqual(await readdir(first), [])
    assert.deepEqual(await readdir(second), [])
  })
})

test('selected Create, Save, closed Rebuild Preview and reopen retain the actual workspace', async () => {
  await withWorkspaceFixture(async (fixture) => {
    const added = await fixture.service.addWorkspace(
      { color: 'violet', displayName: 'Selected' },
      await fixture.folder('selected'),
    )
    const selected = await fixture.service.create({ ...newProject, workspaceId: added.id })
    const ordinary = await fixture.service.create({ ...newProject, title: 'Default neighbor' })
    await fixture.service.close(ordinary.id)
    const record = await fixture.repository.getProject(selected.id)
    assert.ok(record)
    assert.equal(record.workspaceId, added.id)
    assert.equal(path.dirname(record.canonicalPath), added.directoryPath)
    await fixture.service.setPrimaryBbox(selected.id, { height: 64, width: 64, x: 7, y: -9 })
    const saved = await fixture.service.save(selected.id)
    assert.equal(saved.committed, true)
    assert.equal(saved.indexWarning, undefined)
    await fixture.service.close(selected.id)
    const document = (await readIgsPackage(record.canonicalPath)).project
    assert.equal(Object.hasOwn(document, 'workspaceId'), false)
    assert.deepEqual(document.primaryBbox, { height: 64, width: 64, x: 7, y: -9 })
    const rebuilt = await fixture.service.rebuildPreview(selected.id, {
      composePreview: async () => {
        throw new Error('An empty Project needs no compositor')
      },
    })
    assert.equal(rebuilt.committed, true)
    assert.equal(rebuilt.indexWarning, undefined)
    assert.deepEqual((await readIgsPackage(record.canonicalPath)).project, document)
    assert.equal((await fixture.repository.getProject(selected.id))!.workspaceId, added.id)
    assert.equal((await fixture.service.list()).length, 2)
    assert.deepEqual(
      (await fixture.service.list(added.id)).map((project) => project.id),
      [selected.id],
    )
    assert.deepEqual(
      (await fixture.service.list('uncategorized')).map((project) => project.id),
      [ordinary.id],
    )
    await fixture.reopen()
    const opened = await fixture.service.open(selected.id)
    assert.equal(opened.kind, 'opened')
    if (opened.kind === 'opened') {
      assert.deepEqual(opened.tab.primaryBbox, document.primaryBbox)
    }
    await fixture.service.close(selected.id)
  })
})

test('non-default recovery and Save use the registered workspace index', async () => {
  await withWorkspaceFixture(async (fixture) => {
    const added = await fixture.service.addWorkspace(
      { color: 'blue', displayName: 'Recovery' },
      await fixture.folder('recovery'),
    )
    const created = await fixture.service.create({ ...newProject, workspaceId: added.id })
    const record = (await fixture.repository.getProject(created.id))!
    const savedBytes = await readFile(record.canonicalPath)
    await fixture.service.setPrimaryBbox(created.id, { height: 64, width: 64, x: 91, y: 0 })
    await fixture.service.flushAutosave(created.id)
    const restarted = fixture.makeService()
    assert.equal((await restarted.list(added.id))[0].recoveryStatus, 'recoverable')
    assert.equal((await restarted.open(created.id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(created.id, 'recover')
    assert.equal(recovered.primaryBbox.x, 91)
    assert.deepEqual(await readFile(record.canonicalPath), savedBytes)
    const saved = await restarted.save(created.id)
    assert.equal(saved.indexWarning, undefined)
    assert.equal((await fixture.repository.getProject(created.id))!.workspaceId, added.id)
    await restarted.close(created.id)
  })
})

test('non-default Save and Rebuild refresh the real saved accepted-result index', async () => {
  await withWorkspaceFixture(async (fixture) => {
    const added = await fixture.service.addWorkspace(
      { color: 'violet', displayName: 'Accepted results' },
      await fixture.folder('accepted'),
    )
    const session = await ProjectSession.create(
      path.join(added.directoryPath, 'accepted.igs'),
      'Accepted owner',
      fixture.roots,
    )
    const bytes = await acceptedOutputPngFixture()
    const id = randomUUID()
    const assetPath = `assets/layers/${id}.png`
    session.applyDocument({
      ...session.document,
      layers: [
        {
          asset: {
            bytes: bytes.length,
            height: 8,
            path: assetPath,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            width: 8,
          },
          blendMode: 'normal',
          generationProvenance: acceptedRasterProvenanceFixture(session.document, bytes, {
            height: 8,
            width: 8,
            x: 0,
            y: 0,
          }),
          id,
          kind: 'raster',
          locked: false,
          name: 'Accepted layer',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
          visible: false,
        },
      ],
    })
    await session.save({ assets: { [assetPath]: { bytes } } })
    const selected = await fixture.service.selectImport(session.filePath)
    assert.ok(selected.kind === 'opened' && selected.result.kind === 'opened')
    const tabId = selected.result.tab.id
    assert.equal((await fixture.repository.listSavedAcceptedResults(tabId)).length, 1)
    await fixture.service.setPrimaryBbox(tabId, { height: 64, width: 64, x: 3, y: 5 })
    const saved = await fixture.service.save(tabId)
    assert.equal(saved.indexWarning, undefined)
    const document = (await readIgsPackage(session.filePath)).project
    const [accepted] = await fixture.repository.listSavedAcceptedResults(tabId)
    assert.equal(accepted.documentRevision, document.documentRevision)
    assert.equal(accepted.canonicalPath, session.filePath)
    assert.equal(accepted.layerId, id)
    await fixture.service.close(tabId)
    const rebuilt = await fixture.service.rebuildPreview(tabId, {
      composePreview: async () => {
        throw new Error('A hidden layer needs no compositor')
      },
    })
    assert.equal(rebuilt.indexWarning, undefined)
    const [rebuiltAccepted] = await fixture.repository.listSavedAcceptedResults(tabId)
    assert.deepEqual({ ...rebuiltAccepted, fileFingerprint: accepted.fileFingerprint }, accepted)
    assert.equal((await fixture.repository.getProject(tabId))!.workspaceId, added.id)
  })
})

test('selected Import copies into its workspace while a known workspace import opens in place', async () => {
  await withWorkspaceFixture(async (fixture) => {
    const added = await fixture.service.addWorkspace(
      { color: 'amber', displayName: 'Imports' },
      await fixture.folder('imports'),
    )
    const sourcePath = await fixture.source()
    const donor = await readFile(sourcePath)
    const selection = await fixture.service.selectImport(sourcePath)
    assert.equal(selection.kind, 'transfer-required')
    assert.equal(
      (await fixture.service.listWorkspaces()).length,
      2,
      'external selection cannot register a folder',
    )
    assert.deepEqual(await fixture.service.list(), [])
    assert.ok(selection.kind === 'transfer-required')
    const imported = await fixture.service.finishImport(selection.importId, 'copy', added.id)
    assert.equal(imported.sourceRetained, true)
    assert.equal(imported.result.kind, 'opened')
    assert.ok(imported.result.kind === 'opened')
    const id = imported.result.tab.id
    const record = (await fixture.repository.getProject(id))!
    assert.equal(record.workspaceId, added.id)
    assert.equal(path.dirname(record.canonicalPath), added.directoryPath)
    assert.deepEqual(await readFile(sourcePath), donor)
    assert.deepEqual(await readFile(record.canonicalPath), donor)
    await fixture.service.close(id)
    const files = await readdir(added.directoryPath)
    const direct = await fixture.service.selectImport(record.canonicalPath)
    assert.equal(direct.kind, 'opened')
    assert.deepEqual(await readdir(added.directoryPath), files)
    assert.equal((await fixture.service.list()).length, 1)
    await fixture.service.close(id)
    const defaultSource = await fixture.source('default.igs')
    const defaultSelection = await fixture.service.selectImport(defaultSource)
    assert.ok(defaultSelection.kind === 'transfer-required')
    const defaultImport = await fixture.service.finishImport(defaultSelection.importId, 'copy')
    assert.ok(defaultImport.result.kind === 'opened')
    assert.equal(
      (await fixture.repository.getProject(defaultImport.result.tab.id))!.workspaceId,
      'uncategorized',
    )
  })
})

test('explicit invalid, missing and read-only destinations refuse before copy or Create without fallback', async () => {
  await withWorkspaceFixture(async (fixture) => {
    const added = await fixture.service.addWorkspace(
      { color: 'teal', displayName: 'Destination' },
      await fixture.folder('destination'),
    )
    const sourcePath = await fixture.source()
    const donor = await readFile(sourcePath)
    const defaultDirectory = (await fixture.service.listWorkspaces())[0].directoryPath
    const missingPath = `${added.directoryPath}.retained`
    for (const state of ['unknown', 'missing', 'read-only'] as const) {
      if (state === 'missing') {
        await rename(added.directoryPath, missingPath)
      }
      if (state === 'read-only') {
        await rename(missingPath, added.directoryPath)
        await chmod(added.directoryPath, 0o500)
      }
      try {
        const workspaceId = state === 'unknown' ? randomUUID() : added.id
        const code = state === 'read-only' ? 'WORKSPACE_READ_ONLY' : 'WORKSPACE_UNAVAILABLE'
        await assert.rejects(fixture.service.create({ ...newProject, workspaceId }), { code })
        const selection = await fixture.service.selectImport(sourcePath)
        assert.ok(selection.kind === 'transfer-required')
        await assert.rejects(
          fixture.service.finishImport(selection.importId, 'move', workspaceId),
          { code },
        )
        await assert.rejects(
          fixture.service.finishImport(selection.importId, 'copy', workspaceId),
          { code: 'PROJECT_IMPORT_SELECTION_MISSING' },
        )
        assert.deepEqual(await readFile(sourcePath), donor)
        assert.deepEqual(await readdir(defaultDirectory), [])
        assert.deepEqual(await fixture.repository.listProjects(), [])
        if (state === 'read-only') {
          const summary = (await fixture.service.listWorkspaces()).find(
            (workspace) => workspace.id === added.id,
          )!
          assert.equal(summary.availability, 'available')
          assert.equal(summary.writable, false)
          assert.deepEqual(await readdir(added.directoryPath), [])
        }
      } finally {
        if (state === 'read-only') {
          await chmod(added.directoryPath, 0o700)
        }
      }
    }
  })
})

test('missing and inaccessible folders retain cached rows and do not block healthy cross-workspace browsing', async () => {
  await withWorkspaceFixture(async (fixture) => {
    const first = await fixture.service.addWorkspace(
      { color: 'green', displayName: 'Missing' },
      await fixture.folder('missing'),
    )
    const second = await fixture.service.addWorkspace(
      { color: 'blue', displayName: 'Healthy' },
      await fixture.folder('healthy'),
    )
    const missing = await fixture.service.create({ ...newProject, workspaceId: first.id })
    const healthy = await fixture.service.create({ ...newProject, workspaceId: second.id })
    const fallback = await fixture.service.create(newProject)
    for (const tab of [missing, healthy, fallback]) {
      await fixture.service.close(tab.id)
    }
    const defaultDirectory = (await fixture.service.listWorkspaces())[0].directoryPath
    await rename(first.directoryPath, `${first.directoryPath}.retained`)
    await rename(defaultDirectory, `${defaultDirectory}.retained`)
    await fixture.reopen()
    const summaries = await fixture.service.listWorkspaces()
    assert.equal(summaries.find((workspace) => workspace.id === first.id)!.availability, 'missing')
    assert.equal(summaries[0].availability, 'missing')
    assert.equal(summaries.find((workspace) => workspace.id === first.id)!.projectCount, 1)
    assert.equal((await fixture.service.list()).length, 3)
    const missingSummary = (await fixture.service.list(first.id))[0]
    assert.equal(missingSummary.id, missing.id)
    assert.equal(
      missingSummary.health,
      'ready',
      'workspace availability does not change cached file health',
    )
    assert.equal(missingSummary.recoveryStatus, 'unavailable')
    assert.equal(missingSummary.thumbnailUrl, null)
    await assert.rejects(fixture.service.create(newProject), { code: 'WORKSPACE_UNAVAILABLE' })
    await assert.rejects(readdir(defaultDirectory), { code: 'ENOENT' })
    const next = await fixture.service.create({ ...newProject, workspaceId: second.id })
    await fixture.service.close(next.id)
    await chmod(second.directoryPath, 0o000)
    try {
      const inaccessible = (await fixture.service.listWorkspaces()).find(
        (workspace) => workspace.id === second.id,
      )!
      assert.equal(inaccessible.availability, 'inaccessible')
      assert.equal(inaccessible.projectCount, 2)
      const all = await fixture.service.list()
      assert.equal(all.length, 4)
      const healthySummary = all.find((project) => project.id === healthy.id)!
      assert.equal(healthySummary.health, 'ready')
      assert.equal(healthySummary.recoveryStatus, 'unavailable')
    } finally {
      await chmod(second.directoryPath, 0o700)
    }
    assert.equal((await fixture.service.list(second.id))[0].recoveryStatus, 'none')
    await rename(`${first.directoryPath}.retained`, first.directoryPath)
    assert.equal((await fixture.service.list(first.id))[0].recoveryStatus, 'none')
  })
})

test('cross-workspace refresh isolates availability errors and propagates real repository failures', async () => {
  await withWorkspaceFixture(async (fixture) => {
    const added = await fixture.service.addWorkspace(
      { color: 'blue', displayName: 'Repository failure' },
      await fixture.folder('failure'),
    )
    const sentinel = new Error('SQLite query failed')
    class FailingIndex extends ProjectIndexRepository {
      override async scanWorkspace(workspaceId: string) {
        if (workspaceId === added.id) {
          throw sentinel
        }
        return await super.scanWorkspace(workspaceId)
      }
    }
    const service = fixture.makeService(new FailingIndex(fixture.database.db))
    await assert.rejects(service.list(), (error) => error === sentinel)
    await assert.rejects(service.listWorkspaces(), (error) => error === sentinel)
  })
})
