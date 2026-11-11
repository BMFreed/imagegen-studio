import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { localProjectRecoveryKey, refreshProjectLocationRegistry } from './project-identity.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectRelocationStore } from './project-relocation-store.js'
import { ProjectService } from './project-service.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'

type Fixture = Awaited<ReturnType<typeof fixture>>
async function fixture(count = 2) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-workspace-relink-'))
  const dataRoot = path.join(root, 'data')
  const directory = path.join(root, 'source_%_😀')
  const located = path.join(root, 'located_%_😀')
  await mkdir(dataRoot)
  await mkdir(directory)
  const database = openAppDatabase(dataRoot, path.resolve('src/main/db/migrations'))
  const repository = new ProjectIndexRepository(database.db)
  const roots = {
    placeholdersDir: path.resolve('src/main/projects/placeholders'),
    scratchDir: path.join(dataRoot, 'scratch'),
  }
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot,
    repository,
    roots,
    shadow: new ProjectShadowStore(path.join(dataRoot, 'autosave')),
  })
  const workspace = await service.addWorkspace(
    { color: 'violet', displayName: 'Reconnect workspace' },
    directory,
  )
  for (let i = 0; i < count; i++) {
    const created = await service.create({
      height: 64,
      title: `Workspace Project ${i + 1}`,
      width: 64,
      workspaceId: workspace.id,
    })
    await service.close(created.id)
    if (i === 0) {
      await service.renameProject(created.id, 'Bound first Project')
    }
  }
  await service.list(workspace.id)
  const projects = await repository.listProjects(workspace.id)
  const bytes = new Map(
    await Promise.all(
      projects.map(
        async (project) =>
          [project.localProjectKey, await readFile(project.canonicalPath)] as const,
      ),
    ),
  )
  await rename(directory, located)
  const snapshot = async () => ({
    bindings: await database.db
      .selectFrom('project_identity_binding')
      .selectAll()
      .orderBy('local_project_key')
      .execute(),
    lifecycle: await database.db
      .selectFrom('project_file_lifecycle')
      .selectAll()
      .orderBy('local_project_key')
      .execute(),
    projects: await database.db
      .selectFrom('project_index')
      .selectAll()
      .orderBy('local_project_key')
      .execute(),
    queue: await database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('id')
      .execute(),
    relocation: await database.db
      .selectFrom('project_relocation')
      .selectAll()
      .orderBy('local_project_key')
      .execute(),
    workspaces: await database.db
      .selectFrom('project_workspace')
      .selectAll()
      .orderBy('id')
      .execute(),
  })
  return {
    bytes,
    database,
    dataRoot,
    directory,
    located,
    projects,
    repository,
    root,
    roots,
    service,
    snapshot,
    workspace,
  }
}
async function withFixture(run: (f: Fixture) => Promise<void>, count = 2) {
  const f = await fixture(count)
  try {
    await run(f)
  } finally {
    for (const tab of f.service.getOpenTabs()) {
      await f.service.discardAndClose(tab.id)
    }
    await chmod(f.located, 0o700).catch(() => undefined)
    await f.database.close()
    await rm(f.root, { force: true, recursive: true })
  }
}
async function terminalQueue(f: Fixture, key: string, file: string, documentId: string) {
  const now = new Date().toISOString()
  await f.database.db
    .insertInto('generation_queue_item')
    .values({
      batch_id: randomUUID(),
      canonical_project_path: file,
      created_at: now,
      document_id: documentId,
      document_revision: randomUUID(),
      error_code: 'FIXTURE',
      error_message: 'Opaque terminal storage control',
      finished_at: now,
      frozen_payload_json: JSON.stringify({ retainedSource: file }),
      id: randomUUID(),
      local_project_key: key,
      operation: 'illustrious-txt2img',
      staging_session_id: randomUUID(),
      started_at: null,
      status: 'failed',
      status_sequence: 0,
      updated_at: now,
    })
    .execute()
}
async function assertPackages(f: Fixture) {
  for (const project of f.projects) {
    assert.ok(
      (await readFile(path.join(f.located, path.basename(project.canonicalPath)))).equals(
        f.bytes.get(project.localProjectKey)!,
      ),
    )
  }
}

test('Workspace Relink atomically keeps registration and two stable keys with terminal path-only repoint in a readonly Unicode folder', async () => {
  await withFixture(async (f) => {
    const first = f.projects[0]
    await terminalQueue(f, first.localProjectKey, first.canonicalPath, first.documentId!)
    const before = await f.snapshot()
    assert.ok(before.bindings.length > 0)
    assert.equal(before.queue.length, 1)
    await chmod(f.located, 0o500)
    let inspected = 0
    try {
      await f.repository.relocations.relinkMissingWorkspace(
        f.workspace,
        f.projects,
        f.located,
        () => undefined,
        async (project, saved) => {
          assert.equal(project.documentId, saved.project.documentId)
          inspected++
        },
      )
      assert.equal(inspected, f.projects.length * 2)
      const registered = await f.repository.workspaceById(f.workspace.id)
      assert.deepEqual(registered, {
        color: f.workspace.color,
        directoryPath: f.located,
        displayName: f.workspace.displayName,
        id: f.workspace.id,
      })
      for (const project of f.projects) {
        const file = path.join(f.located, path.basename(project.canonicalPath))
        const row = await f.repository.getProject(project.localProjectKey)
        assert.equal(row?.canonicalPath, file)
        assert.equal(row?.lastOpenedAt, project.lastOpenedAt)
        assert.equal(row?.workspaceId, f.workspace.id)
        assert.equal(localProjectRecoveryKey(file), project.localProjectKey)
      }
      assert.equal(
        (await f.database.db.selectFrom('project_identity_binding').selectAll().execute()).length,
        2,
      )
      assert.deepEqual(
        (await f.snapshot()).queue,
        before.queue.map((row) => ({
          ...row,
          canonical_project_path: path.join(f.located, path.basename(row.canonical_project_path)),
        })),
      )
      assert.deepEqual(await f.repository.relocations.list(), [])
      await assertPackages(f)
    } finally {
      await chmod(f.located, 0o700)
    }
  })
})

test('Workspace Relink accepts an empty missing registration without importing extra files', async () => {
  await withFixture(async (f) => {
    await writeFile(path.join(f.located, 'notes.txt'), 'ignored workspace neighbor')
    await mkdir(path.join(f.located, 'nested.igs'))
    await f.repository.relocations.relinkMissingWorkspace(
      f.workspace,
      [],
      f.located,
      () => undefined,
      async () => assert.fail('No Project was selected'),
    )
    assert.equal((await f.repository.workspaceById(f.workspace.id)).directoryPath, f.located)
    assert.deepEqual(await f.repository.listProjects(f.workspace.id), [])
    assert.equal(
      await readFile(path.join(f.located, 'notes.txt'), 'utf8'),
      'ignored workspace neighbor',
    )
  }, 0)
})

test('Workspace Relink refuses an incomplete filename set or the last mismatched saved revision without changing earlier owners', async () => {
  await withFixture(async (f) => {
    const before = await f.snapshot()
    const last = f.projects.at(-1)!
    const file = path.join(f.located, path.basename(last.canonicalPath))
    const extra = path.join(f.located, 'extra.igs')
    await copyFile(file, extra)
    await assert.rejects(
      f.repository.relocations.relinkMissingWorkspace(
        f.workspace,
        f.projects,
        f.located,
        () => undefined,
        async () => undefined,
      ),
      { code: 'PROJECT_MOVE_CONFLICT' },
    )
    await rm(extra)
    const held = path.join(f.root, 'held.igs')
    await rename(file, held)
    await assert.rejects(
      f.repository.relocations.relinkMissingWorkspace(
        f.workspace,
        f.projects,
        f.located,
        () => undefined,
        async () => undefined,
      ),
      { code: 'PROJECT_MOVE_CONFLICT' },
    )
    await rename(held, file)
    const session = await ProjectSession.open(file, f.roots)
    session.applyDocument({
      ...session.document,
      primaryBbox: { ...session.document.primaryBbox, x: 19 },
    })
    await session.save()
    const changed = await readFile(file)
    await assert.rejects(
      f.repository.relocations.relinkMissingWorkspace(
        f.workspace,
        f.projects,
        f.located,
        () => undefined,
        async () => undefined,
      ),
      { code: 'PROJECT_MOVE_CONFLICT' },
    )
    assert.deepEqual(await f.snapshot(), before)
    assert.ok((await readFile(file)).equals(changed))
    assert.ok(
      (await readFile(path.join(f.located, path.basename(f.projects[0].canonicalPath)))).equals(
        f.bytes.get(f.projects[0].localProjectKey)!,
      ),
    )
  })
})

test('Workspace Relink SQL abort and final source reappearance roll back every binding index and terminal path', async () => {
  await withFixture(async (f) => {
    await terminalQueue(
      f,
      f.projects[0].localProjectKey,
      f.projects[0].canonicalPath,
      f.projects[0].documentId!,
    )
    const before = await f.snapshot()
    await sql
      .raw(
        "CREATE TRIGGER refuse_workspace_rebind BEFORE UPDATE OF directory_path ON project_workspace BEGIN SELECT RAISE(ABORT, 'owned workspace rebind fault'); END",
      )
      .execute(f.database.db)
    try {
      await assert.rejects(
        f.repository.relocations.relinkMissingWorkspace(
          f.workspace,
          f.projects,
          f.located,
          () => undefined,
          async () => undefined,
        ),
        /owned workspace rebind fault/,
      )
    } finally {
      await sql.raw('DROP TRIGGER refuse_workspace_rebind').execute(f.database.db)
    }
    assert.deepEqual(await f.snapshot(), before)
    const fault = new ProjectRelocationStore(f.database.db, {
      beforeWorkspaceRelinkCommit: async () => {
        await mkdir(f.directory)
      },
    })
    try {
      await assert.rejects(
        fault.relinkMissingWorkspace(
          f.workspace,
          f.projects,
          f.located,
          () => undefined,
          async () => undefined,
        ),
        { code: 'PROJECT_MOVE_CONFLICT' },
      )
      assert.deepEqual(await f.snapshot(), before)
      await assertPackages(f)
    } finally {
      await rm(f.directory, { force: true, recursive: true })
    }
    await f.repository.relocations.relinkMissingWorkspace(
      f.workspace,
      f.projects,
      f.located,
      () => undefined,
      async () => undefined,
    )
    await assertPackages(f)
  })
})

test('Workspace Relink rejects overlapping registrations default mutation and orphan operational ownership', async () => {
  await withFixture(async (f) => {
    const before = await f.snapshot()
    await assert.rejects(
      f.repository.relocations.relinkMissingWorkspace(
        await f.repository.workspaceById('uncategorized'),
        [],
        f.located,
        () => undefined,
        async () => undefined,
      ),
      { code: 'PROJECT_MOVE_INVALID' },
    )
    await assert.rejects(
      f.repository.relocations.relinkMissingWorkspace(
        f.workspace,
        f.projects,
        f.dataRoot,
        () => undefined,
        async () => undefined,
      ),
      { code: 'PROJECT_MOVE_CONFLICT' },
    )
    assert.deepEqual(await f.snapshot(), before)
    const orphanPath = path.join(f.directory, 'forgotten.igs')
    const orphanKey = `project-v1-${createHash('sha256').update(randomUUID()).digest('hex')}`
    await terminalQueue(f, orphanKey, orphanPath, randomUUID())
    const orphan = await f.snapshot()
    await assert.rejects(
      f.repository.relocations.relinkMissingWorkspace(
        f.workspace,
        f.projects,
        f.located,
        () => undefined,
        async () => undefined,
      ),
      { code: 'PROJECT_MOVE_CONFLICT' },
    )
    assert.deepEqual(await f.snapshot(), orphan)
    await f.database.db
      .deleteFrom('generation_queue_item')
      .where('local_project_key', '=', orphanKey)
      .execute()
    await f.database.db
      .insertInto('project_identity_binding')
      .values({
        canonical_path: orphanPath,
        document_id: randomUUID(),
        local_project_key: orphanKey,
      })
      .execute()
    refreshProjectLocationRegistry(f.database.db)
    const orphanBinding = await f.snapshot()
    await assert.rejects(
      f.repository.relocations.relinkMissingWorkspace(
        f.workspace,
        f.projects,
        f.located,
        () => undefined,
        async () => undefined,
      ),
      { code: 'PROJECT_MOVE_CONFLICT' },
    )
    assert.deepEqual(await f.snapshot(), orphanBinding)
    await assertPackages(f)
  })
})

test('Workspace Relink preserves frozen Trash authority instead of leaving its paths behind', async () => {
  await withFixture(async (f) => {
    await rename(f.located, f.directory)
    await f.service.trashProject(f.projects[0].localProjectKey)
    await rename(f.directory, f.located)
    const before = await f.snapshot()
    assert.equal(before.lifecycle.length, 1)
    await assert.rejects(
      f.repository.relocations.relinkMissingWorkspace(
        f.workspace,
        f.projects,
        f.located,
        () => undefined,
        async () => undefined,
      ),
      { code: 'PROJECT_MOVE_CONFLICT' },
    )
    assert.deepEqual(await f.snapshot(), before)
    await assertPackages(f)
  })
})
