import assert from 'node:assert/strict'
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ProjectIndexRepository, UNCATEGORIZED_WORKSPACE_ID } from './project-index.js'
import { ProjectRelocationStore } from './project-relocation-store.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'

const migrations = path.resolve('src/main/db/migrations')
const createInput = { height: 64, title: 'Move fixture', width: 64 }
type Fixture = Awaited<ReturnType<typeof fixture>>

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-project-move-'))
  const dataRoot = path.join(root, 'data')
  const directory = path.join(root, 'workspace')
  await mkdir(dataRoot)
  await mkdir(directory)
  const database = openAppDatabase(dataRoot, migrations)
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(dataRoot, 'autosave'))
  const services: ProjectService[] = []
  const makeService = () => {
    const service = new ProjectService({
      autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots: {
        placeholdersDir: path.resolve('src/main/projects/placeholders'),
        scratchDir: path.join(dataRoot, 'scratch'),
      },
      shadow,
    })
    services.push(service)
    return service
  }
  const service = makeService()
  const workspace = await service.addWorkspace(
    { color: 'blue', displayName: 'Move source' },
    directory,
  )
  return {
    async cleanup() {
      for (const owner of services) {
        for (const tab of owner.getOpenTabs()) {
          await (tab.relocationPending ? owner.close(tab.id) : owner.discardAndClose(tab.id))
        }
      }
      await database.close()
      await rm(root, { force: true, recursive: true })
    },
    database,
    dataRoot,
    directory,
    makeService,
    repository,
    root,
    service,
    shadow,
    workspace,
  }
}
async function withFixture(run: (f: Fixture) => Promise<void>) {
  const f = await fixture()
  try {
    await run(f)
  } finally {
    await f.cleanup()
  }
}
async function closedProject(f: Fixture) {
  const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
  await f.service.close(tab.id)
  const record = await f.repository.getProject(tab.id)
  assert.ok(record)
  return record
}
async function treeBytes(directory: string): Promise<Record<string, Buffer>> {
  const result: Record<string, Buffer> = {}
  async function visit(current: string) {
    const entries = await readdir(current, { withFileTypes: true }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw error
    })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(current, entry.name)
      assert.equal(entry.isSymbolicLink(), false)
      if (entry.isDirectory()) {
        await visit(target)
      } else {
        assert.equal(entry.isFile(), true)
        result[path.relative(directory, target)] = await readFile(target)
      }
    }
  }
  await visit(directory)
  return result
}

async function destination(f: Fixture) {
  const directory = path.join(f.root, 'destination')
  await mkdir(directory)
  return await f.service.addWorkspace({ color: 'violet', displayName: 'Destination' }, directory)
}

test('closed Project Move preserves stable identity and exact package through scoped browsing, reopen, Save and workspace re-Add', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const target = await destination(f)
    const bytes = await readFile(record.canonicalPath)
    const newPath = path.join(target.directoryPath, path.basename(record.canonicalPath))
    assert.deepEqual(await f.service.moveProject(record.localProjectKey, target.id), {
      kind: 'moved',
    })
    assert.deepEqual(await readFile(newPath), bytes)
    await assert.rejects(readFile(record.canonicalPath), { code: 'ENOENT' })
    assert.equal(localProjectRecoveryKey(newPath), record.localProjectKey)
    assert.deepEqual(await f.service.list(f.workspace.id), [])
    assert.deepEqual(
      (await f.service.list(target.id)).map((v) => v.id),
      [record.localProjectKey],
    )
    const opened = await f.service.open(record.localProjectKey)
    assert.equal(opened.kind, 'opened')
    if (opened.kind !== 'opened') {
      throw new Error('Expected opened')
    }
    assert.equal(opened.tab.workspaceId, target.id)
    assert.equal(opened.tab.documentId, record.documentId)
    await f.service.setPrimaryBbox(record.localProjectKey, { height: 64, width: 64, x: 8, y: -8 })
    await f.service.save(record.localProjectKey)
    await f.service.close(record.localProjectKey)
    assert.equal((await readIgsPackage(newPath)).project.primaryBbox.x, 8)
    await assert.rejects(readFile(record.canonicalPath), { code: 'ENOENT' })
    await f.service.removeWorkspace(target.id)
    const readded = await f.service.addWorkspace(
      { color: 'teal', displayName: 'Re-added destination' },
      target.directoryPath,
    )
    assert.deepEqual(
      (await f.service.list(readded.id)).map((v) => v.id),
      [record.localProjectKey],
    )
  })
})

test('reusing the former filename creates a different identity instead of stealing moved ownership', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const bytes = await readFile(record.canonicalPath)
    const target = await destination(f)
    await f.service.moveProject(record.localProjectKey, target.id)
    await writeFile(record.canonicalPath, bytes)
    const [replacement] = await f.service.list(f.workspace.id)
    assert.ok(replacement)
    assert.notEqual(replacement.id, record.localProjectKey)
    assert.equal(localProjectRecoveryKey(record.canonicalPath), replacement.id)
    assert.equal((await f.service.list(target.id))[0].id, record.localProjectKey)
    assert.deepEqual(
      await readFile(path.join(target.directoryPath, path.basename(record.canonicalPath))),
      bytes,
    )
  })
})

test('Move refuses dirty live Projects without implicit close or Save', async () => {
  await withFixture(async (f) => {
    const target = await destination(f)
    const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
    const record = (await f.repository.getProject(tab.id))!
    const bytes = await readFile(record.canonicalPath)
    await f.service.setPrimaryBbox(tab.id, { height: 64, width: 64, x: 5, y: 5 })
    await assert.rejects(f.service.moveProject(tab.id, target.id), { code: 'PROJECT_DIRTY' })
    assert.equal(f.service.getOpenTabs()[0].dirty, true)
    assert.deepEqual(await readFile(record.canonicalPath), bytes)
    assert.deepEqual(await f.repository.relocations.list(), [])
  })
})

test('unverified and deferred generation payloads in either exact staging owner block Move without cleanup', async () => {
  for (const owner of ['generation-staging', 'smart-patch-staging']) {
    await withFixture(async (f) => {
      const record = await closedProject(f)
      const target = await destination(f)
      const directory = path.join(f.dataRoot, 'recovery', owner, record.localProjectKey)
      await mkdir(directory, { recursive: true })
      await writeFile(
        path.join(directory, 'unverified-payload'),
        'Retained, not an available candidate',
      )
      await assert.rejects(f.service.moveProject(record.localProjectKey, target.id), {
        code: 'PROJECT_RECOVERY_UNAVAILABLE',
      })
      assert.equal(
        await readFile(path.join(directory, 'unverified-payload'), 'utf8'),
        'Retained, not an available candidate',
      )
      assert.deepEqual(await f.repository.relocations.list(), [])
    })
  }
})

test('pending Move remains visible after dialog close, blocks both unregisters and resumes original target only', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const target = await destination(f)
    const bytes = await readFile(record.canonicalPath)
    Object.defineProperty(f.repository, 'relocations', {
      configurable: true,
      value: new ProjectRelocationStore(f.database.db, {
        afterRename: async () => {
          throw new Error('Controlled interruption')
        },
      }),
    })
    assert.equal((await f.service.moveProject(record.localProjectKey, target.id)).kind, 'pending')
    const [pending] = await f.service.list(f.workspace.id)
    assert.equal(pending.id, record.localProjectKey)
    assert.equal(pending.fileName, path.basename(record.canonicalPath))
    assert.equal(pending.title, record.displayName)
    assert.equal(pending.pendingMove?.workspaceId, target.id)
    assert.equal(
      (await f.service.listWorkspaces()).find((v) => v.id === f.workspace.id)?.projectCount,
      1,
    )
    await assert.rejects(f.service.open(record.localProjectKey), { code: 'PROJECT_NOT_READY' })
    await assert.rejects(f.service.removeWorkspace(f.workspace.id), { code: 'PROJECT_NOT_READY' })
    await assert.rejects(f.service.removeWorkspace(target.id), { code: 'PROJECT_NOT_READY' })
    await assert.rejects(
      f.service.moveProject(record.localProjectKey, UNCATEGORIZED_WORKSPACE_ID),
      { code: 'PROJECT_NOT_READY' },
    )
    Object.defineProperty(f.repository, 'relocations', {
      configurable: true,
      value: new ProjectRelocationStore(f.database.db),
    })
    assert.deepEqual(await f.service.moveProject(record.localProjectKey, target.id), {
      kind: 'moved',
    })
    assert.deepEqual(
      await readFile(path.join(target.directoryPath, path.basename(record.canonicalPath))),
      bytes,
    )
    assert.deepEqual(await f.service.list(f.workspace.id), [])
    const [moved] = await f.service.list(target.id)
    assert.equal(moved.id, record.localProjectKey)
    assert.equal(moved.fileName, path.basename(record.canonicalPath))
  })
})

test('startup recovery completes a real interrupted physical Move before scanner publication', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const target = await destination(f)
    const bytes = await readFile(record.canonicalPath)
    const fault = new ProjectRelocationStore(f.database.db, {
      afterDatabaseRepoint: async () => {
        throw new Error('Lost completion')
      },
    })
    const intent = await fault.beginMove(record, f.workspace, target, () => undefined)
    assert.equal((await fault.finishMove(intent)).kind, 'pending')
    const restarted = f.makeService()
    const rows = await restarted.list()
    assert.deepEqual(
      rows.map((v) => v.id),
      [record.localProjectKey],
    )
    assert.equal(rows[0].workspaceId, target.id)
    assert.equal(rows[0].pendingMove, undefined)
    assert.deepEqual(
      await readFile(path.join(target.directoryPath, path.basename(record.canonicalPath))),
      bytes,
    )
  })
})

test('a replaced app-data symlink cannot hide retained staging payloads from Move admission', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const target = await destination(f)
    const retained = `${f.dataRoot}-retained`
    const foreign = path.join(f.root, 'foreign-data')
    await mkdir(foreign)
    await rename(f.dataRoot, retained)
    await symlink(foreign, f.dataRoot)
    try {
      await assert.rejects(f.service.moveProject(record.localProjectKey, target.id), {
        code: 'PROJECT_RECOVERY_UNAVAILABLE',
      })
      assert.deepEqual(await f.repository.relocations.list(), [])
    } finally {
      await unlink(f.dataRoot)
      await rename(retained, f.dataRoot)
    }
  })
})

test('pending source and destination locations stay reserved against indexing and external import publication', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const target = await destination(f)
    await f.repository.relocations.beginMove(record, f.workspace, target, () => undefined)
    await assert.rejects(f.repository.indexSaved(record.canonicalPath, f.workspace.id), {
      code: 'PROJECT_MOVE_PENDING',
    })
    const external = path.join(f.root, path.basename(record.canonicalPath))
    const bytes = await readFile(record.canonicalPath)
    await writeFile(external, bytes)
    const selected = await f.service.selectImport(external)
    assert.ok(selected && selected.kind === 'transfer-required')
    const imported = await f.service.finishImport(selected.importId, 'copy', target.id)
    assert.ok(imported)
    const intended = path.join(target.directoryPath, path.basename(record.canonicalPath))
    await assert.rejects(readFile(intended), { code: 'ENOENT' })
    assert.deepEqual(await readFile(external), bytes)
    assert.equal((await f.repository.relocations.list()).length, 1)
  })
})

test('Import of a valid reused former filename allocates its new identity without requiring prior rescan', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const bytes = await readFile(record.canonicalPath)
    const target = await destination(f)
    await f.service.moveProject(record.localProjectKey, target.id)
    await writeFile(record.canonicalPath, bytes)
    const selected = await f.service.selectImport(record.canonicalPath)
    assert.ok(selected && selected.kind === 'opened')
    assert.equal((await f.service.list(target.id))[0].id, record.localProjectKey)
    const [clone] = await f.service.list(f.workspace.id)
    assert.notEqual(clone.id, record.localProjectKey)
    assert.equal(f.service.getOpenTabs()[0].id, clone.id)
  })
})

test('unhealthy reuse of a former filename isolates only that file and repair receives a distinct identity', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const bytes = await readFile(record.canonicalPath)
    const target = await destination(f)
    await f.service.moveProject(record.localProjectKey, target.id)
    const neighbor = await closedProject(f)
    await writeFile(record.canonicalPath, 'Unsupported or corrupt replacement')
    assert.deepEqual(
      (await f.service.list(f.workspace.id)).map((v) => v.id),
      [neighbor.localProjectKey],
    )
    assert.equal((await f.service.list(target.id))[0].id, record.localProjectKey)
    await writeFile(record.canonicalPath, bytes)
    const repaired = (await f.service.list(f.workspace.id)).find(
      (v) => v.id !== neighbor.localProjectKey,
    )
    assert.ok(repaired)
    assert.notEqual(repaired.id, record.localProjectKey)
  })
})

test('permanent deletion retires moved key while a different file can reuse the freed current location', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const target = await destination(f)
    const bytes = await readFile(record.canonicalPath)
    await f.service.moveProject(record.localProjectKey, target.id)
    const newPath = path.join(target.directoryPath, path.basename(record.canonicalPath))
    await f.service.trashProject(record.localProjectKey)
    const [trashed] = await f.service.listTrash()
    assert.deepEqual(await f.service.deleteProjectPermanently(trashed.id, trashed.trashId), {
      kind: 'deleted',
    })
    assert.equal(
      await f.database.db
        .selectFrom('project_identity_binding')
        .selectAll()
        .where('local_project_key', '=', record.localProjectKey)
        .executeTakeFirst(),
      undefined,
    )
    assert.ok(
      await f.database.db
        .selectFrom('project_identity_retired_key')
        .selectAll()
        .where('local_project_key', '=', record.localProjectKey)
        .executeTakeFirst(),
    )
    // A portable copy has the same document UUID but must still have fresh local ownership.
    await writeFile(newPath, bytes)
    const [current] = await f.service.list(target.id)
    assert.notEqual(current.id, record.localProjectKey)
    await writeFile(record.canonicalPath, bytes)
    const [former] = await f.service.list(f.workspace.id)
    assert.notEqual(former.id, record.localProjectKey)
    assert.notEqual(former.id, current.id)
  })
})

test('closed Rename changes both filename and title, preserves member bytes and stable identity across reopen', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const before = await readIgsPackage(record.canonicalPath)
    const members = new Map<string, Buffer>()
    for (const member of before.manifest.members) {
      if (member.path !== 'project.json') {
        members.set(member.path, await before.readMember(member.path))
      }
    }
    assert.deepEqual(await f.service.renameProject(record.localProjectKey, ' Renamed Project '), {
      kind: 'renamed',
    })
    const newPath = path.join(f.directory, 'Renamed Project.igs')
    const after = await readIgsPackage(newPath)
    assert.equal(after.project.title, 'Renamed Project')
    assert.equal(after.project.documentId, before.project.documentId)
    assert.notEqual(after.project.documentRevision, before.project.documentRevision)
    assert.deepEqual(
      {
        ...after.project,
        documentRevision: before.project.documentRevision,
        title: before.project.title,
      },
      before.project,
    )
    assert.deepEqual(after.manifest.preview, before.manifest.preview)
    for (const [name, bytes] of members) {
      assert.deepEqual(await after.readMember(name), bytes)
    }
    await assert.rejects(readFile(record.canonicalPath), { code: 'ENOENT' })
    assert.equal(localProjectRecoveryKey(newPath), record.localProjectKey)
    assert.deepEqual(
      (await f.service.list(f.workspace.id)).map((v) => [v.id, v.title]),
      [[record.localProjectKey, 'Renamed Project']],
    )
    const exact = await readFile(newPath)
    assert.deepEqual(await f.service.renameProject(record.localProjectKey, 'Renamed Project'), {
      kind: 'renamed',
    })
    assert.deepEqual(await readFile(newPath), exact)
    const opened = await f.service.open(record.localProjectKey)
    assert.equal(opened.kind, 'opened')
    if (opened.kind !== 'opened') {
      throw new Error('Expected opened')
    }
    assert.equal(opened.tab.title, 'Renamed Project')
    assert.equal(opened.tab.canUndo, false)
    assert.equal(opened.tab.documentId, record.documentId)
  })
})

test('Rename refuses dirty open Projects and malformed or colliding filenames without writing', async () => {
  await withFixture(async (f) => {
    const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
    const record = (await f.repository.getProject(tab.id))!
    const bytes = await readFile(record.canonicalPath)
    await f.service.setPrimaryBbox(tab.id, { height: 64, width: 64, x: 9, y: 9 })
    await assert.rejects(f.service.renameProject(tab.id, 'Dirty rename'), {
      code: 'PROJECT_DIRTY',
    })
    assert.deepEqual(await readFile(record.canonicalPath), bytes)
    await f.service.discardAndClose(tab.id)
    for (const name of ['', '../escape', 'a/b', 'x\0y', 'a'.repeat(252)]) {
      await assert.rejects(f.service.renameProject(tab.id, name), { code: 'PROJECT_INVALID_INPUT' })
    }
    const foreign = path.join(f.directory, 'Occupied.igs')
    await writeFile(foreign, 'foreign')
    await assert.rejects(f.service.renameProject(tab.id, 'Occupied'))
    assert.deepEqual(await readFile(record.canonicalPath), bytes)
    assert.equal(await readFile(foreign, 'utf8'), 'foreign')
    assert.deepEqual(await f.repository.relocations.list(), [])
  })
})

test('pending Rename remains source-scoped and resumes only the original name after metadata publication', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    Object.defineProperty(f.repository, 'relocations', {
      configurable: true,
      value: new ProjectRelocationStore(f.database.db, {
        afterMetadataRename: async () => {
          throw new Error('Controlled interruption after metadata commit')
        },
      }),
    })
    assert.equal(
      (await f.service.renameProject(record.localProjectKey, 'Pending Rename')).kind,
      'pending',
    )
    assert.equal(
      (await readIgsPackage(path.join(f.directory, 'Pending Rename.igs'))).project.title,
      'Pending Rename',
    )
    const [summary] = await f.service.list(f.workspace.id)
    assert.equal(summary.id, record.localProjectKey)
    assert.equal(summary.fileName, path.basename(record.canonicalPath))
    assert.equal(summary.title, record.displayName)
    assert.equal(summary.pendingRename?.name, 'Pending Rename')
    assert.equal(summary.pendingMove, undefined)
    await assert.rejects(f.service.open(record.localProjectKey), { code: 'PROJECT_NOT_READY' })
    await assert.rejects(f.service.renameProject(record.localProjectKey, 'Other name'), {
      code: 'PROJECT_NOT_READY',
    })
    const target = await destination(f)
    await assert.rejects(f.service.moveProject(record.localProjectKey, target.id), {
      code: 'PROJECT_NOT_READY',
    })
    await assert.rejects(f.service.removeWorkspace(f.workspace.id), { code: 'PROJECT_NOT_READY' })
    Object.defineProperty(f.repository, 'relocations', {
      configurable: true,
      value: new ProjectRelocationStore(f.database.db),
    })
    const recovered = f.makeService()
    assert.deepEqual(
      (await recovered.list(f.workspace.id)).map((v) => [v.id, v.title, v.fileName]),
      [[record.localProjectKey, 'Pending Rename', 'Pending Rename.igs']],
    )
    assert.deepEqual(await f.repository.relocations.list(), [])
    assert.equal((await recovered.open(record.localProjectKey)).kind, 'opened')
  })
})

test('Rename normalizes a real exact-saved dirty shadow before changing title/revision', async () => {
  await withFixture(async (f) => {
    const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
    const record = (await f.repository.getProject(tab.id))!
    const original = (await readIgsPackage(record.canonicalPath)).project
    await f.service.setPrimaryBbox(tab.id, { height: 64, width: 64, x: 16, y: 8 })
    await f.service.save(tab.id)
    await f.service.close(tab.id)
    const saved = (await readIgsPackage(record.canonicalPath)).project
    // The actual pre-Save snapshot whose package commit won before markClean publication.
    await f.shadow.write({
      document: saved,
      projectPath: record.canonicalPath,
      savedDocument: original,
    })
    assert.equal(
      JSON.parse(await readFile(path.join(f.dataRoot, 'autosave', tab.id, 'manifest.json'), 'utf8'))
        .state,
      'dirty',
    )
    assert.deepEqual(await f.service.renameProject(tab.id, 'Saved Shadow Rename'), {
      kind: 'renamed',
    })
    const opened = await f.service.open(tab.id)
    assert.equal(opened.kind, 'opened')
    if (opened.kind !== 'opened') {
      throw new Error('Rename must not create stale recovery')
    }
    assert.equal(opened.tab.primaryBbox.x, 16)
    assert.equal(opened.tab.title, 'Saved Shadow Rename')
  })
})

test('case-only Rename excludes only its own source from the final collision check', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    assert.deepEqual(await f.service.renameProject(record.localProjectKey, 'Scene'), {
      kind: 'renamed',
    })
    assert.deepEqual(await f.service.renameProject(record.localProjectKey, 'scene'), {
      kind: 'renamed',
    })
    const finalPath = path.join(f.directory, 'scene.igs')
    assert.equal((await readIgsPackage(finalPath)).project.title, 'scene')
    assert.equal(localProjectRecoveryKey(finalPath), record.localProjectKey)
    await assert.rejects(readFile(path.join(f.directory, 'Scene.igs')), { code: 'ENOENT' })
    assert.deepEqual(await f.repository.relocations.list(), [])
  })
})

for (const samePath of [false, true]) {
  test(`clean-open Rename keeps both canvas history directions and title on later Save (same path ${samePath})`, async () => {
    await withFixture(async (f) => {
      const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
      const record = (await f.repository.getProject(tab.id))!
      const owner = f.service.getOpenDocumentForAcceptance(tab.id)!
      await f.service.setPrimaryBbox(tab.id, { height: 64, width: 64, x: 8, y: 0 })
      await f.service.save(tab.id)
      await f.service.setPrimaryBbox(tab.id, { height: 64, width: 64, x: 16, y: 0 })
      const clean = await f.service.undo(tab.id)
      assert.equal(clean.dirty, false)
      assert.equal(clean.canUndo, true)
      assert.equal(clean.canRedo, true)
      const original = (await readIgsPackage(record.canonicalPath)).project
      const epoch = owner.documentEpoch
      const name = samePath ? path.basename(record.canonicalPath, '.igs') : 'Live Rename'
      const destination = path.join(f.directory, `${name}.igs`)
      assert.deepEqual(await f.service.renameProject(tab.id, name), { kind: 'renamed' })
      assert.equal(f.service.getOpenDocumentForAcceptance(tab.id), owner)
      const current = f.service.getOpenTabs()[0]
      assert.equal(current.id, tab.id)
      assert.equal(current.documentId, tab.documentId)
      assert.equal(current.title, name)
      assert.equal(current.dirty, false)
      assert.equal(current.canUndo, true)
      assert.equal(current.canRedo, true)
      assert.equal(owner.documentEpoch, epoch + 1)
      const renamed = (await readIgsPackage(destination)).project
      assert.deepEqual(
        { ...renamed, documentRevision: original.documentRevision, title: original.title },
        original,
      )
      assert.equal((await f.service.undo(tab.id)).primaryBbox.x, 0)
      assert.equal(f.service.getOpenTabs()[0].title, name)
      await f.service.save(tab.id)
      assert.equal((await readIgsPackage(destination)).project.title, name)
      assert.equal((await f.service.redo(tab.id)).primaryBbox.x, 8)
      assert.equal((await f.service.redo(tab.id)).primaryBbox.x, 16)
      assert.equal(f.service.getOpenTabs()[0].title, name)
      await f.service.save(tab.id)
      const after = (await readIgsPackage(destination)).project
      assert.equal(after.title, name)
      assert.equal(after.primaryBbox.x, 16)
      if (!samePath) {
        await assert.rejects(readFile(record.canonicalPath), { code: 'ENOENT' })
      }
      await f.service.close(tab.id)
      const reopened = await f.service.open(tab.id)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind === 'opened') {
        assert.equal(reopened.tab.title, name)
      }
    })
  })
}

for (const seam of ['afterMetadataRename', 'beforeFinalize'] as const) {
  test(`pending live Rename at ${seam} fences identity and retries same name preserving history`, async () => {
    await withFixture(async (f) => {
      const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
      await f.service.setPrimaryBbox(tab.id, { height: 64, width: 64, x: 8, y: 0 })
      await f.service.save(tab.id)
      const owner = f.service.getOpenDocumentForAcceptance(tab.id)!
      const source = (await f.repository.getProject(tab.id))!
      Object.defineProperty(f.repository, 'relocations', {
        configurable: true,
        value: new ProjectRelocationStore(f.database.db, {
          [seam]: async () => {
            throw new Error('Controlled interruption')
          },
        }),
      })
      assert.equal((await f.service.renameProject(tab.id, 'Held Name')).kind, 'pending')
      const journal = await f.repository.relocations.list()
      const pendingBytes = await readFile(path.join(f.directory, 'Held Name.igs'))
      const [pending] = await f.service.list(f.workspace.id)
      assert.equal(pending.id, tab.id)
      assert.equal(pending.fileName, path.basename(source.canonicalPath))
      assert.equal(pending.title, source.displayName)
      assert.equal(pending.pendingRename?.name, 'Held Name')
      assert.deepEqual(await f.repository.relocations.list(), journal)
      assert.ok((await readFile(path.join(f.directory, 'Held Name.igs'))).equals(pendingBytes))
      assert.equal(f.service.getOpenTabs()[0].relocationPending, true)
      assert.equal(f.service.getOpenDocumentId(tab.id), null)
      await assert.rejects(f.service.save(tab.id), { code: 'PROJECT_NOT_READY' })
      await assert.rejects(f.service.undo(tab.id), { code: 'PROJECT_NOT_READY' })
      await assert.rejects(f.service.renameProject(tab.id, 'Other Name'), {
        code: 'PROJECT_NOT_READY',
      })
      Object.defineProperty(f.repository, 'relocations', {
        configurable: true,
        value: new ProjectRelocationStore(f.database.db),
      })
      assert.deepEqual(await f.service.renameProject(tab.id, 'Held Name'), { kind: 'renamed' })
      const [renamed] = await f.service.list(f.workspace.id)
      assert.equal(renamed.id, tab.id)
      assert.equal(renamed.fileName, 'Held Name.igs')
      assert.equal(renamed.title, 'Held Name')
      assert.ok((await readFile(path.join(f.directory, 'Held Name.igs'))).equals(pendingBytes))
      assert.equal(f.service.getOpenDocumentForAcceptance(tab.id), owner)
      assert.equal((await f.service.undo(tab.id)).primaryBbox.x, 0)
      assert.equal(f.service.getOpenTabs()[0].title, 'Held Name')
      await f.service.save(tab.id)
      assert.equal(
        (await readIgsPackage(path.join(f.directory, 'Held Name.igs'))).project.title,
        'Held Name',
      )
    })
  })
}

test('explicit Close preserves a pending Rename journal for a new Service lifetime', async () => {
  await withFixture(async (f) => {
    const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
    Object.defineProperty(f.repository, 'relocations', {
      configurable: true,
      value: new ProjectRelocationStore(f.database.db, {
        beforeFinalize: async () => {
          throw new Error('Controlled interruption')
        },
      }),
    })
    assert.equal((await f.service.renameProject(tab.id, 'Restart Name')).kind, 'pending')
    await f.service.close(tab.id)
    assert.equal(f.service.getOpenTabs().length, 0)
    assert.ok(await f.repository.relocations.get(tab.id))
    Object.defineProperty(f.repository, 'relocations', {
      configurable: true,
      value: new ProjectRelocationStore(f.database.db),
    })
    const recovered = f.makeService()
    const opened = await recovered.open(tab.id)
    assert.equal(opened.kind, 'opened')
    if (opened.kind === 'opened') {
      assert.equal(opened.tab.title, 'Restart Name')
    }
    assert.equal(await f.repository.relocations.get(tab.id), null)
  })
})

test('Home browse timestamps project active, pending and Trash metadata without rewriting durable snapshots', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    assert.equal((await f.service.open(record.localProjectKey)).kind, 'opened')
    await f.service.close(record.localProjectKey)
    const opened = (await f.repository.getProject(record.localProjectKey))!
    const stamp = await lstat(record.canonicalPath, { bigint: true })
    const modifiedAt = new Date(Number(stamp.mtimeNs / 1_000_000n)).toISOString()
    const expected = { lastOpenedAt: opened.lastOpenedAt, modifiedAt }
    const packageBytes = await readFile(record.canonicalPath)
    const fileName = path.basename(record.canonicalPath)
    const [active] = await f.service.list(f.workspace.id)
    assert.equal(active.fileName, fileName)
    assert.deepEqual({ lastOpenedAt: active.lastOpenedAt, modifiedAt: active.modifiedAt }, expected)
    assert.ok((await readFile(record.canonicalPath)).equals(packageBytes))
    const target = await destination(f)
    Object.defineProperty(f.repository, 'relocations', {
      configurable: true,
      value: new ProjectRelocationStore(f.database.db, {
        afterRename: async () => {
          throw new Error('Controlled pending Move')
        },
      }),
    })
    assert.equal((await f.service.moveProject(record.localProjectKey, target.id)).kind, 'pending')
    const before = await f.database.db
      .selectFrom('project_relocation')
      .selectAll()
      .executeTakeFirstOrThrow()
    const [pending] = await f.service.list(f.workspace.id)
    assert.equal(pending.fileName, fileName)
    assert.deepEqual(
      { lastOpenedAt: pending.lastOpenedAt, modifiedAt: pending.modifiedAt },
      expected,
    )
    assert.deepEqual(
      await f.database.db.selectFrom('project_relocation').selectAll().executeTakeFirstOrThrow(),
      before,
    )
    const movedPath = path.join(target.directoryPath, fileName)
    assert.ok((await readFile(movedPath)).equals(packageBytes))
    Object.defineProperty(f.repository, 'relocations', {
      configurable: true,
      value: new ProjectRelocationStore(f.database.db),
    })
    await f.service.moveProject(record.localProjectKey, target.id)
    await f.service.trashProject(record.localProjectKey)
    const lifecycle = await f.database.db
      .selectFrom('project_file_lifecycle')
      .selectAll()
      .executeTakeFirstOrThrow()
    const [trash] = await f.service.listTrash()
    assert.equal(trash.fileName, fileName)
    assert.deepEqual({ lastOpenedAt: trash.lastOpenedAt, modifiedAt: trash.modifiedAt }, expected)
    assert.ok((await readFile(movedPath)).equals(packageBytes))
    assert.deepEqual(
      await f.database.db
        .selectFrom('project_file_lifecycle')
        .selectAll()
        .executeTakeFirstOrThrow(),
      lifecycle,
    )
    assert.equal('modifiedAt' in JSON.parse(lifecycle.project_json), false)
  })
})
