import type { ProjectHomeCatalog } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'

import { type AppDatabase, openAppDatabase } from '../db/database.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ProjectIndexRepository } from './project-index.js'
import { withProjectPathLock } from './project-path-lock.js'
import {
  parseProjectMergedPreviewImageUrl,
  readProjectMergedPreview,
} from './project-preview-resource.js'
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

  makeService(
    repository = this.repository,
    shadow = new ProjectShadowStore(path.join(this.dataRoot, 'autosave')),
  ): ProjectService {
    const service = new ProjectService({
      autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot: this.dataRoot,
      repository,
      roots: this.roots,
      shadow,
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

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
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
    const afterOpen = await fixture.service.list(added.id)
    assert.equal(projects[0].lastOpenedAt, null)
    assert.equal(typeof afterOpen[0].lastOpenedAt, 'string')
    assert.equal(
      afterOpen[0].lastOpenedAt,
      (await fixture.repository.getProject(projects[0].id))!.lastOpenedAt,
    )
    assert.deepEqual(afterOpen, [{ ...projects[0], lastOpenedAt: afterOpen[0].lastOpenedAt }])
    await fixture.reopen()
    const workspaces = await fixture.service.listWorkspaces()
    assert.equal(workspaces[0].id, 'uncategorized')
    assert.deepEqual(
      workspaces.find((workspace) => workspace.id === added.id),
      added,
    )
    assert.deepEqual(await fixture.service.list(added.id), afterOpen)
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
    assert.equal(
      (await restarted.listHomeCatalog(added.id)).projects[0].recoveryStatus,
      'recoverable',
    )
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
    const catalog = await fixture.service.listHomeCatalog()
    assert.deepEqual(catalog.workspaces, summaries)
    assert.equal(catalog.projects.length, 3)
    assert.equal(catalog.projects.find(({ id }) => id === healthy.id)?.recoveryStatus, 'none')
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

test('Home discovers each workspace once after startup and sees external Project changes', async () => {
  await withWorkspaceFixture(async (fixture) => {
    const added = await fixture.service.addWorkspace(
      { color: 'blue', displayName: 'Home catalog' },
      await fixture.folder('home-catalog'),
    )
    const defaultDirectory = (await fixture.service.listWorkspaces())[0].directoryPath
    const external = await ProjectSession.create(
      path.join(added.directoryPath, 'external.igs'),
      'Original external title',
      fixture.roots,
    )
    const original = await ProjectSession.create(
      path.join(defaultDirectory, 'default.igs'),
      'Default Project',
      fixture.roots,
    )
    const defaultBytes = await readFile(original.filePath)
    class ObservedIndex extends ProjectIndexRepository {
      readonly scans: string[] = []

      override async scanWorkspace(...args: Parameters<ProjectIndexRepository['scanWorkspace']>) {
        const [workspaceId] = args
        this.scans.push(workspaceId)
        return await super.scanWorkspace(...args)
      }
    }
    const repository = new ObservedIndex(fixture.database.db)
    const service = fixture.makeService(repository)
    await service.initializeStorage()
    assert.deepEqual(await service.listTrash(), [])
    assert.deepEqual(repository.scans, [])
    const expectedScans = ['uncategorized', added.id].sort()

    const initial = await service.listHomeCatalog()
    assert.deepEqual(repository.scans.sort(), expectedScans)
    await service.initialize()
    assert.deepEqual(repository.scans.sort(), expectedScans)
    assert.deepEqual(initial.projects, await fixture.service.list())
    assert.deepEqual(initial.workspaces, await fixture.service.listWorkspaces())
    const initialExternal = initial.projects.find((project) => project.workspaceId === added.id)
    assert.ok(initialExternal)
    assert.equal(initialExternal.title, 'Original external title')

    external.applyDocument({ ...external.document, title: 'Externally updated title' })
    assert.equal((await external.save()).reloadRequired, false)
    await ProjectSession.create(
      path.join(defaultDirectory, 'new.igs'),
      'Externally added Project',
      fixture.roots,
    )

    repository.scans.length = 0
    const refreshed = await service.listHomeCatalog()
    assert.deepEqual(refreshed.projects.map((project) => project.title).sort(), [
      'Default Project',
      'Externally added Project',
      'Externally updated title',
    ])
    assert.deepEqual(repository.scans.sort(), expectedScans)
    assert.equal(
      refreshed.projects.find((project) => project.workspaceId === added.id)?.id,
      initialExternal.id,
    )
    assert.deepEqual(
      refreshed.workspaces.map((workspace) => workspace.projectCount),
      [2, 1],
    )
    assert.deepEqual(await readFile(original.filePath), defaultBytes)

    repository.scans.length = 0
    const scoped = await service.listHomeCatalog(added.id)
    assert.deepEqual(repository.scans.sort(), expectedScans)
    assert.deepEqual(
      scoped.projects,
      refreshed.projects.filter((project) => project.workspaceId === added.id),
    )
    assert.deepEqual(scoped.workspaces, refreshed.workspaces)

    repository.scans.length = 0
    assert.deepEqual(await service.list(added.id), scoped.projects)
    assert.deepEqual(repository.scans, [added.id])
    repository.scans.length = 0
    assert.deepEqual(await service.listWorkspaces(), refreshed.workspaces)
    assert.deepEqual(repository.scans.sort(), expectedScans)
  })
})

test('Home exposes only verified first-folder Projects and their previews while a later folder scans', async () => {
  await withWorkspaceFixture(async (fixture) => {
    const later = await fixture.service.addWorkspace(
      { color: 'blue', displayName: 'Later workspace' },
      await fixture.folder('later'),
    )
    const first = await fixture.repository.workspaceById('uncategorized')
    const healthy = await ProjectSession.create(
      path.join(first.directoryPath, 'checked.igs'),
      'Checked project',
      fixture.roots,
    )
    const replaced = await ProjectSession.create(
      path.join(first.directoryPath, 'replaced.igs'),
      'Replaced project',
      fixture.roots,
    )
    await writeFile(path.join(first.directoryPath, 'corrupt.igs'), 'not an archive')
    await ProjectSession.create(
      path.join(later.directoryPath, 'later.igs'),
      'Later project',
      fixture.roots,
    )
    const replacement = path.join(first.directoryPath, 'replacement.tmp')
    await writeFile(replacement, 'replaced after validation')

    let markLaterStarted!: () => void
    let allowLaterScan!: () => void
    const laterStarted = new Promise<void>((resolve) => (markLaterStarted = resolve))
    const allowLater = new Promise<void>((resolve) => (allowLaterScan = resolve))
    class PausedIndex extends ProjectIndexRepository {
      override async scanWorkspace(...args: Parameters<ProjectIndexRepository['scanWorkspace']>) {
        if (args[0] === later.id) {
          markLaterStarted()
          await allowLater
        }
        const records = await super.scanWorkspace(...args)
        if (args[0] === first.id) {
          await rename(replacement, replaced.filePath)
        }
        return records
      }
    }
    const repository = new PausedIndex(fixture.database.db)
    const initial: ProjectHomeCatalog[] = []
    const final = fixture.makeService(repository).listHomeCatalog(undefined, (catalog) => {
      initial.push(catalog)
    })
    try {
      await Promise.race([
        laterStarted,
        final.then(() => assert.fail('The full catalog must wait for the later folder.')),
      ])
      assert.equal(initial.length, 1)
      const { projects, workspaces } = initial[0]
      assert.deepEqual(
        workspaces.map(({ availability, id, projectCount }) => [id, availability, projectCount]),
        [[first.id, 'available', 3]],
      )
      assert.deepEqual(
        projects.map(({ health, recoveryStatus, title, workspaceId }) => [
          title,
          workspaceId,
          health,
          recoveryStatus,
        ]),
        [['Checked project', first.id, 'ready', 'none']],
      )
      assert.ok(projects[0].previewUrl)
      const resource = parseProjectMergedPreviewImageUrl(projects[0].previewUrl)
      assert.ok(resource)
      const preview = await readProjectMergedPreview(resource, repository)
      assert.equal(preview.status, 200)
      assert.deepEqual(
        Buffer.from(await preview.arrayBuffer()),
        await (await readIgsPackage(healthy.filePath)).readMember('preview/merged.png'),
      )
    } finally {
      allowLaterScan()
      await final
    }
    const completed = await final
    assert.equal(initial.length, 1)
    assert.deepEqual(
      completed.projects.find(({ title }) => title === 'Checked project'),
      initial[0].projects[0],
    )
    assert.equal(completed.projects.length, 4)
    assert.deepEqual(
      completed.workspaces.map(({ id }) => id),
      [first.id, later.id],
    )
    assert.equal(
      completed.projects.find(({ fileName }) => fileName === 'corrupt.igs')?.health,
      'corrupt',
    )
    assert.equal(completed.projects.find(({ title }) => title === 'Later project')?.health, 'ready')
  })
})

async function prepareSingleWorkspaceDiscovery(fixture: WorkspaceFixture) {
  const workspace = await fixture.repository.ensureDefaultWorkspace(fixture.dataRoot)
  const packages = new Map<string, string>()
  for (let i = 1; i <= 62; i++) {
    const name = `project-${i.toString().padStart(2, '0')}`
    const saved = await ProjectSession.create(
      path.join(workspace.directoryPath, `${name}.igs`),
      name,
      fixture.roots,
    )
    packages.set(localProjectRecoveryKey(saved.filePath), saved.filePath)
  }

  const remainingStarted = deferred()
  const releaseRemaining = deferred()
  const scanBodyFinished = deferred()
  let filesVisited = 0
  class PausedIndex extends ProjectIndexRepository {
    override async indexSaved(...args: Parameters<ProjectIndexRepository['indexSaved']>) {
      if (++filesVisited === 61) {
        remainingStarted.resolve()
        await releaseRemaining.promise
      }
      return await super.indexSaved(...args)
    }

    override async scanWorkspace(...args: Parameters<ProjectIndexRepository['scanWorkspace']>) {
      const records = await super.scanWorkspace(...args)
      scanBodyFinished.resolve()
      return records
    }
  }
  const repository = new PausedIndex(fixture.database.db)
  const service = fixture.makeService(repository)
  const initial: ProjectHomeCatalog[] = []
  const withCatalogLock = <T>(work: () => Promise<T>) => withProjectPathLock(fixture.dataRoot, work)
  const catalog = service.listHomeCatalog(
    undefined,
    (snapshot) => initial.push(snapshot),
    withCatalogLock,
  )
  return {
    catalog,
    initial,
    packages,
    releaseRemaining,
    remainingStarted,
    repository,
    scanBodyFinished,
    service,
    withCatalogLock,
    workspace,
  }
}

test(
  'Initial Home Open attaches the exact Project while its only workspace is still scanning',
  { timeout: 10_000 },
  async () => {
    await withWorkspaceFixture(async (fixture) => {
      const {
        catalog,
        initial,
        packages,
        releaseRemaining,
        remainingStarted,
        repository,
        scanBodyFinished,
        service,
        withCatalogLock,
        workspace,
      } = await prepareSingleWorkspaceDiscovery(fixture)
      const reconciliationStarted = deferred()
      const releaseReconciliation = deferred()
      const ordinaryOpenQueued = deferred()
      let opening: ReturnType<typeof service.openFromHome> | undefined
      let closeDrain: Promise<void> | undefined
      try {
        await Promise.race([
          remainingStarted.promise,
          catalog.then(() => assert.fail('The remaining Projects should still be paused.')),
        ])
        assert.equal(initial.length, 1)
        assert.deepEqual(
          initial[0].workspaces.map(({ id, projectCount }) => [id, projectCount]),
          [[workspace.id, 60]],
        )
        assert.equal(initial[0].projects.length, 60)
        assert.ok(
          initial[0].projects.every(({ health, id }) => packages.has(id) && health === 'ready'),
        )
        const project = initial[0].projects[0]
        assert.ok(project.previewUrl)
        const resource = parseProjectMergedPreviewImageUrl(project.previewUrl)
        assert.ok(resource)
        const preview = await readProjectMergedPreview(resource, repository)
        assert.equal(preview.status, 200)
        const filePath = packages.get(project.id)!
        const before = await readFile(filePath)
        const archive = await readIgsPackage(filePath)
        assert.deepEqual(
          Buffer.from(await preview.arrayBuffer()),
          await archive.readMember('preview/merged.png'),
        )

        opening = service.openFromHome(
          project.id,
          (work) => {
            ordinaryOpenQueued.resolve()
            return withCatalogLock(work)
          },
          async (read) => {
            const result = await read()
            assert.ok(result?.kind === 'opened')
            assert.deepEqual(
              [result.tab.id, result.tab.documentId, result.tab.documentRevision],
              [project.id, archive.project.documentId, archive.project.documentRevision],
            )
            reconciliationStarted.resolve()
            await releaseReconciliation.promise
            return result
          },
        )
        await Promise.race([
          reconciliationStarted.promise,
          opening.then(() => assert.fail('Open settled before reconciliation was released.')),
          ordinaryOpenQueued.promise.then(() =>
            assert.fail('Verified Open queued behind discovery.'),
          ),
        ])
        assert.equal((await repository.listProjects(workspace.id)).length, 60)
        assert.equal(service.getOpenTabs()[0]?.id, project.id)

        // Main drains the catalog lock before snapshotting tabs for native Close.
        let drained = false
        closeDrain = withCatalogLock(async () => {
          drained = true
          assert.equal(service.getOpenTabs()[0]?.id, project.id)
        })
        releaseRemaining.resolve()
        await Promise.race([
          scanBodyFinished.promise,
          catalog.then(() => assert.fail('The catalog must wait for Open reconciliation.')),
        ])
        await setImmediate()
        assert.equal(drained, false, 'Close must wait for Open reconciliation after scanning ends.')
        releaseReconciliation.resolve()
        assert.equal((await opening).kind, 'opened')
        await closeDrain
        assert.equal(drained, true)
        await service.close(project.id)
        assert.deepEqual(await readFile(filePath), before)
      } finally {
        releaseRemaining.resolve()
        releaseReconciliation.resolve()
        await Promise.allSettled([catalog, opening, closeDrain])
      }
      const complete = await catalog
      assert.equal(initial.length, 1)
      assert.deepEqual(new Set(complete.projects.map(({ id }) => id)), new Set(packages.keys()))
      assert.equal(complete.workspaces[0].projectCount, 62)

      const restarted = fixture.makeService(repository)
      const indexedInitial: ProjectHomeCatalog[] = []
      const indexed = await restarted.listHomeCatalog(undefined, (snapshot) => {
        indexedInitial.push(snapshot)
      })
      assert.deepEqual(indexedInitial, [])
      assert.deepEqual(indexed, complete)
    })
  },
)

test(
  'Initial Home Open queues the ordinary rescan when a published Project changed',
  { timeout: 10_000 },
  async () => {
    await withWorkspaceFixture(async (fixture) => {
      const {
        catalog,
        initial,
        packages,
        releaseRemaining,
        remainingStarted,
        repository,
        service,
        withCatalogLock,
      } = await prepareSingleWorkspaceDiscovery(fixture)
      const ordinaryOpenQueued = deferred()
      let opening: ReturnType<typeof service.openFromHome> | undefined
      try {
        await Promise.race([
          remainingStarted.promise,
          catalog.then(() => assert.fail('The remaining Projects should still be paused.')),
        ])
        const project = initial[0].projects[0]
        const filePath = packages.get(project.id)!
        const saved = await ProjectSession.open(filePath, fixture.roots)
        const witness = await repository.getProject(project.id)
        assert.ok(witness)
        saved.applyDocument({ ...saved.document, title: 'Changed during discovery' })
        assert.equal((await saved.save()).reloadRequired, false)
        assert.notEqual(saved.document.documentRevision, witness.documentRevision)
        assert.equal(await repository.matchesSavedFile(witness), false)
        const changed = await readFile(filePath)

        opening = service.openFromHome(
          project.id,
          (work) => {
            ordinaryOpenQueued.resolve()
            return withCatalogLock(work)
          },
          async (read) => await read(),
        )
        await Promise.race([
          ordinaryOpenQueued.promise,
          opening.then(() => assert.fail('A changed Project opened under its stale witness.')),
        ])
        assert.deepEqual(service.getOpenTabs(), [])
        assert.equal(
          (await repository.getProject(project.id))?.documentRevision,
          witness.documentRevision,
        )
        releaseRemaining.resolve()

        const result = await opening
        assert.equal(result.kind, 'opened')
        assert.deepEqual(
          [result.tab.id, result.tab.title, result.tab.documentId, result.tab.documentRevision],
          [
            project.id,
            'Changed during discovery',
            saved.document.documentId,
            saved.document.documentRevision,
          ],
        )
        assert.equal(
          (await repository.getProject(project.id))?.documentRevision,
          saved.document.documentRevision,
        )
        await service.close(project.id)
        assert.deepEqual(await readFile(filePath), changed)
        assert.equal((await catalog).projects.length, 62)
      } finally {
        releaseRemaining.resolve()
        await Promise.allSettled([catalog, opening])
      }
    })
  },
)

test('Open discovers an unindexed default Project before the first Home catalog', async () => {
  await withWorkspaceFixture(async (fixture) => {
    const { repository, service } = fixture
    const workspace = await repository.ensureDefaultWorkspace(fixture.dataRoot)
    const saved = await ProjectSession.create(
      path.join(workspace.directoryPath, 'direct-open.igs'),
      'Direct Open',
      fixture.roots,
    )
    const projectId = localProjectRecoveryKey(saved.filePath)
    const before = await readFile(saved.filePath)
    assert.equal(await repository.getProject(projectId), null)

    await service.initializeStorage()
    const opened = await service.open(projectId)
    assert.equal(opened.kind, 'opened')
    assert.deepEqual(
      [opened.tab.id, opened.tab.title, opened.tab.documentId, opened.tab.documentRevision],
      [projectId, 'Direct Open', saved.document.documentId, saved.document.documentRevision],
    )
    await service.close(projectId)
    assert.deepEqual(await readFile(saved.filePath), before)
  })
})

test(
  'Initial Home releases each folder before opening a verified Project and keeps the final registry current',
  { timeout: 10_000 },
  async () => {
    await withWorkspaceFixture(async (fixture) => {
      const middle = await fixture.service.addWorkspace(
        { color: 'blue', displayName: 'Middle' },
        await fixture.folder('middle'),
      )
      const last = await fixture.service.addWorkspace(
        { color: 'blue', displayName: 'Remaining' },
        await fixture.folder('remaining'),
      )
      const removed = await fixture.service.addWorkspace(
        { color: 'blue', displayName: 'Will be removed' },
        await fixture.folder('removed'),
      )
      const first = await fixture.repository.workspaceById('uncategorized')
      const saved = await ProjectSession.create(
        path.join(first.directoryPath, 'checked.igs'),
        'First checked project',
        fixture.roots,
      )
      await ProjectSession.create(
        path.join(middle.directoryPath, 'middle.igs'),
        'Middle project',
        fixture.roots,
      )
      await ProjectSession.create(
        path.join(last.directoryPath, 'last.igs'),
        'Remaining project',
        fixture.roots,
      )
      const before = await readFile(saved.filePath)

      const middleStarted = deferred()
      const releaseMiddle = deferred()
      const lastStarted = deferred()
      const releaseLast = deferred()
      const scans: string[] = []
      class PausedIndex extends ProjectIndexRepository {
        override async scanWorkspace(...args: Parameters<ProjectIndexRepository['scanWorkspace']>) {
          const [id] = args
          scans.push(id)
          if (id === middle.id) {
            middleStarted.resolve()
            await releaseMiddle.promise
          }
          if (id === last.id) {
            lastStarted.resolve()
            await releaseLast.promise
          }
          return await super.scanWorkspace(...args)
        }
      }
      const repository = new PausedIndex(fixture.database.db)
      const service = fixture.makeService(repository)
      const withCatalogLock = <T>(work: () => Promise<T>) =>
        withProjectPathLock(fixture.dataRoot, work)
      const published: ProjectHomeCatalog[] = []
      const catalog = service.listHomeCatalog(
        undefined,
        (initial) => published.push(initial),
        withCatalogLock,
      )
      let opened: ReturnType<typeof service.open> | undefined
      let registryEdit: Promise<string> | undefined
      try {
        await Promise.race([
          middleStarted.promise,
          catalog.then(() => assert.fail('Expected the middle-folder barrier')),
        ])
        assert.equal(published.length, 1)
        const id = localProjectRecoveryKey(saved.filePath)
        assert.deepEqual(
          published[0].projects.map((item) => item.id),
          [id],
        )
        opened = withCatalogLock(() => service.open(id))
        registryEdit = withCatalogLock(async () => {
          await service.removeWorkspace(removed.id)
          const workspace = await service.addWorkspace(
            { color: 'blue', displayName: 'Added after startup' },
            await fixture.folder('added'),
          )
          await ProjectSession.create(
            path.join(workspace.directoryPath, 'added.igs'),
            'Added project',
            fixture.roots,
          )
          return workspace.id
        })
        releaseMiddle.resolve()
        const result = await Promise.race([
          opened,
          lastStarted.promise.then(() =>
            assert.fail('Queued Open must finish before the next folder acquires the gate'),
          ),
        ])
        assert.equal(result.kind, 'opened')
        assert.equal(result.tab.documentRevision, saved.document.documentRevision)
        await Promise.race([
          lastStarted.promise,
          catalog.then(() => assert.fail('The final folder remains paused')),
        ])
        const added = await registryEdit
        assert.deepEqual(scans, [first.id, middle.id, added, last.id])
        assert.equal(service.getOpenTabs()[0]?.id, id)
        assert.deepEqual(await readFile(saved.filePath), before)

        releaseLast.resolve()
        const completed = await catalog
        assert.deepEqual(
          completed.workspaces.map(({ id }) => id),
          [first.id, added, middle.id, last.id],
        )
        assert.deepEqual(completed.projects.map(({ title }) => title).sort(), [
          'Added project',
          'First checked project',
          'Middle project',
          'Remaining project',
        ])
        assert.ok(completed.projects.find((project) => project.id === id)?.lastOpenedAt)
        assert.deepEqual(scans, [first.id, middle.id, added, last.id, added])
        assert.equal(published.length, 1)
        await withCatalogLock(() => service.close(id))
        assert.deepEqual(await readFile(saved.filePath), before)
      } finally {
        releaseMiddle.resolve()
        releaseLast.resolve()
        await Promise.allSettled([catalog, opened, registryEdit])
      }
    })
  },
)

test('Open rescans a ready index entry when the saved Project fingerprint changes', async () => {
  await withWorkspaceFixture(async (fixture) => {
    const workspace = await fixture.repository.ensureDefaultWorkspace(fixture.dataRoot)
    const saved = await ProjectSession.create(
      path.join(workspace.directoryPath, 'changed.igs'),
      'Original project',
      fixture.roots,
    )
    const scans: string[] = []
    class ObservedIndex extends ProjectIndexRepository {
      override async scanWorkspace(...args: Parameters<ProjectIndexRepository['scanWorkspace']>) {
        scans.push(args[0])
        return await super.scanWorkspace(...args)
      }
    }
    const repository = new ObservedIndex(fixture.database.db)
    const service = fixture.makeService(repository)
    const catalog = await service.listHomeCatalog()
    const [project] = catalog.projects
    assert.equal(project.health, 'ready')
    const indexed = await repository.getProject(project.id)
    assert.ok(indexed)
    saved.applyDocument({ ...saved.document, title: 'Changed on disk' })
    assert.equal((await saved.save()).reloadRequired, false)
    const changed = await readFile(saved.filePath)
    assert.equal(await repository.matchesSavedFile(indexed), false)

    const opened = await service.open(project.id)
    assert.equal(opened.kind, 'opened')
    assert.equal(opened.tab.title, 'Changed on disk')
    assert.equal(opened.tab.documentRevision, saved.document.documentRevision)
    assert.deepEqual(scans, [workspace.id, workspace.id])
    assert.equal(
      (await repository.getProject(project.id))?.documentRevision,
      saved.document.documentRevision,
    )
    await service.close(project.id)
    assert.deepEqual(await readFile(saved.filePath), changed)
  })
})

for (const returnedFolder of ['external', 'default'] as const) {
  test(`Scoped Home counts Projects when the ${returnedFolder} workspace returns during discovery`, async () => {
    await withWorkspaceFixture(async (fixture) => {
      const added = await fixture.service.addWorkspace(
        { color: 'green', displayName: 'External folder' },
        await fixture.folder('external'),
      )
      const returned =
        returnedFolder === 'external'
          ? added
          : await fixture.repository.workspaceById('uncategorized')
      const saved = await ProjectSession.create(
        path.join(returned.directoryPath, 'returned.igs'),
        'Project in the returned workspace',
        fixture.roots,
      )
      const before = await readFile(saved.filePath)
      const moved = `${returned.directoryPath}.retained`
      class TransientIndex extends ProjectIndexRepository {
        attempts = 0

        override async scanWorkspace(...args: Parameters<ProjectIndexRepository['scanWorkspace']>) {
          const [workspaceId] = args
          if (workspaceId !== returned.id || ++this.attempts !== 1) {
            return await super.scanWorkspace(...args)
          }
          await rename(returned.directoryPath, moved)
          try {
            return await super.scanWorkspace(...args)
          } finally {
            await rename(moved, returned.directoryPath)
          }
        }
      }
      const repository = new TransientIndex(fixture.database.db)
      const service = fixture.makeService(repository)
      const catalog = await service.listHomeCatalog(added.id)
      assert.equal(repository.attempts, 2)
      assert.deepEqual(
        catalog.projects.map(({ health, recoveryStatus, title }) => [
          health,
          recoveryStatus,
          title,
        ]),
        returnedFolder === 'external'
          ? [['ready', 'none', 'Project in the returned workspace']]
          : [],
      )
      const workspace = catalog.workspaces.find(({ id }) => id === returned.id)
      assert.equal(workspace?.availability, 'available')
      assert.equal(workspace?.projectCount, 1)
      assert.deepEqual(await readFile(saved.filePath), before)
    })
  })
}

for (const replacementPoint of ['after scan', 'during shadow inspection'] as const) {
  test(`Home rechecks a package replaced ${replacementPoint}`, async () => {
    await withWorkspaceFixture(async (fixture) => {
      const workspace = await fixture.service.addWorkspace(
        { color: 'green', displayName: 'Observed workspace' },
        await fixture.folder('observed'),
      )
      const session = await ProjectSession.create(
        path.join(workspace.directoryPath, 'observed.igs'),
        'Observed Project',
        fixture.roots,
      )
      const replacementBytes = Buffer.from('corrupt replacement')
      const replacement = path.join(workspace.directoryPath, 'replacement.tmp')
      await writeFile(replacement, replacementBytes)
      let replacementPending = true
      const replace = async () => {
        if (replacementPending) {
          replacementPending = false
          await rename(replacement, session.filePath)
        }
      }
      class ObservedIndex extends ProjectIndexRepository {
        override async scanWorkspace(...args: Parameters<ProjectIndexRepository['scanWorkspace']>) {
          const records = await super.scanWorkspace(...args)
          if (args[0] === workspace.id && replacementPoint === 'after scan') {
            await replace()
          }
          return records
        }
      }
      class ObservedShadow extends ProjectShadowStore {
        override async inspectWithoutSavedPackage(projectPath: string) {
          const inspection = await super.inspectWithoutSavedPackage(projectPath)
          if (projectPath === session.filePath && replacementPoint === 'during shadow inspection') {
            await replace()
          }
          return inspection
        }
      }
      const service = fixture.makeService(
        new ObservedIndex(fixture.database.db),
        new ObservedShadow(path.join(fixture.dataRoot, 'autosave')),
      )
      const first = await service.listHomeCatalog(workspace.id)
      assert.deepEqual(
        first.projects.map(({ health, recoveryReason, recoveryStatus }) => [
          health,
          recoveryStatus,
          recoveryReason,
        ]),
        [['ready', 'invalid', 'The local recovery state could not be inspected.']],
      )
      const refreshed = await service.listHomeCatalog(workspace.id)
      assert.deepEqual(
        refreshed.projects.map(({ health, recoveryStatus }) => [health, recoveryStatus]),
        [['corrupt', 'none']],
      )
      assert.deepEqual(await readFile(session.filePath), replacementBytes)
    })
  })
}

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
    await assert.rejects(service.listHomeCatalog('uncategorized'), (error) => error === sentinel)
    assert.deepEqual(await service.list('uncategorized'), [])
  })
})
