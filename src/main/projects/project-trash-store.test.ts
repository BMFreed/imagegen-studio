import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
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

import type { ProjectIndexRecord, ProjectWorkspaceRecord } from './project-index.js'

import { openAppDatabase } from '../db/database.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ProjectSession } from './project-session.js'
import { ProjectTrashStore } from './project-trash-store.js'

type Fixture = Awaited<ReturnType<typeof fixture>>
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-trash-core-'))
  const dataRoot = path.join(root, 'data')
  const directory = path.join(root, 'workspace')
  await mkdir(dataRoot)
  await mkdir(directory)
  const database = openAppDatabase(dataRoot, path.resolve('src/main/db/migrations'))
  const workspace: ProjectWorkspaceRecord = {
    color: 'blue',
    directoryPath: directory,
    displayName: 'Core workspace',
    id: randomUUID(),
  }
  const now = new Date().toISOString()
  await database.db
    .insertInto('project_workspace')
    .values({
      color: workspace.color,
      created_at: now,
      directory_path: directory,
      display_name: workspace.displayName,
      id: workspace.id,
      is_default: 0,
      updated_at: now,
    })
    .execute()
  async function addProject(title = 'Core Project') {
    const filePath = path.join(directory, `${randomUUID()}.igs`)
    const session = await ProjectSession.create(filePath, title, {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: path.join(root, 'scratch'),
    })
    const stat = await lstat(filePath, { bigint: true })
    const fingerprint = [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':')
    const project: ProjectIndexRecord = {
      bboxHeight: session.document.primaryBbox.height,
      bboxWidth: session.document.primaryBbox.width,
      canonicalPath: filePath,
      diagnosticCode: null,
      displayName: title,
      documentId: session.document.documentId,
      documentRevision: session.document.documentRevision,
      fileFingerprint: fingerprint,
      fileHealth: 'ready',
      lastOpenedAt: null,
      localProjectKey: localProjectRecoveryKey(filePath),
      previewStatus: 'empty',
      thumbnailSha256: null,
      workspaceId: workspace.id,
    }
    await database.db
      .insertInto('project_index')
      .values({
        bbox_height: project.bboxHeight,
        bbox_width: project.bboxWidth,
        canonical_path: filePath,
        diagnostic_code: null,
        display_name: title,
        document_id: project.documentId,
        document_revision: project.documentRevision,
        file_fingerprint: fingerprint,
        file_health: 'ready',
        file_mtime_ns: stat.mtimeNs.toString(),
        file_size_bytes: Number(stat.size),
        indexed_at: now,
        last_opened_at: null,
        local_project_key: project.localProjectKey,
        preview_status: 'empty',
        preview_thumbnail_sha256: null,
        search_name: title.toLowerCase(),
        trashed_at: null,
        workspace_id: workspace.id,
      })
      .execute()
    return project
  }
  const project = await addProject()
  const store = new ProjectTrashStore(database.db)
  return { addProject, database, dataRoot, directory, project, root, store, workspace }
}
async function withFixture(work: (f: Fixture) => Promise<void>) {
  const f = await fixture()
  try {
    await work(f)
  } finally {
    await f.database.close()
    await rm(f.root, { force: true, recursive: true })
  }
}
const guard = () => undefined
async function trash(f: Fixture, project = f.project) {
  await f.store.moveToTrash(project, f.workspace, guard)
  const record = await f.store.get(project.localProjectKey)
  assert.ok(record)
  return record
}
async function committed(f: Fixture) {
  const record = await trash(f)
  return await f.store.beginPermanentDelete(record.localProjectKey, record.trashId, guard)
}

// Opaque identity assertions use real .igs writer bytes and real SQLite; no ML or mock filesystem.
test('Trash is authoritative reversible metadata and preserves exact portable bytes', async () => {
  await withFixture(async (f) => {
    const bytes = await readFile(f.project.canonicalPath)
    const record = await trash(f)
    assert.equal(record.state, 'trashed')
    assert.equal(record.deletionId, null)
    assert.equal(record.project.documentId, f.project.documentId)
    assert.deepEqual(await readFile(f.project.canonicalPath), bytes)
    assert.equal(
      (
        await f.database.db
          .selectFrom('project_index')
          .select('trashed_at')
          .executeTakeFirstOrThrow()
      ).trashed_at,
      record.trashedAt,
    )
    await f.store.restore(record.localProjectKey, record.trashId, f.workspace.id, guard)
    assert.equal(await f.store.get(record.localProjectKey), null)
    assert.equal(
      (
        await f.database.db
          .selectFrom('project_index')
          .select('trashed_at')
          .executeTakeFirstOrThrow()
      ).trashed_at,
      null,
    )
    assert.deepEqual(await readFile(f.project.canonicalPath), bytes)
  })
})

test('Trash guard refuses before publication and stale caller/index fingerprint cannot freeze a replacement', async () => {
  await withFixture(async (f) => {
    const sentinel = new Error('live document')
    await assert.rejects(
      f.store.moveToTrash(f.project, f.workspace, () => {
        throw sentinel
      }),
      (error) => error === sentinel,
    )
    assert.deepEqual(await f.store.list(), [])
    await writeFile(f.project.canonicalPath, 'Changed outside the app')
    await assert.rejects(f.store.moveToTrash(f.project, f.workspace, guard), {
      code: 'TRASH_FILE_CHANGED',
    })
    assert.deepEqual(await f.store.list(), [])
  })
})

test('concurrent Trash calls publish one authority row and stale Trash identity cannot restore/delete it', async () => {
  await withFixture(async (f) => {
    const results = await Promise.allSettled([
      f.store.moveToTrash(f.project, f.workspace, guard),
      f.store.moveToTrash(f.project, f.workspace, guard),
    ])
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    const [record] = await f.store.list()
    assert.ok(record)
    await assert.rejects(
      f.store.restore(record.localProjectKey, randomUUID(), f.workspace.id, guard),
      { code: 'TRASH_CONFLICT' },
    )
    await assert.rejects(
      f.store.beginPermanentDelete(record.localProjectKey, randomUUID(), guard),
      { code: 'TRASH_CONFLICT' },
    )
    assert.equal((await f.store.list()).length, 1)
  })
})

test('unregister/index eviction leaves lifecycle ownership intact for later same-directory registration', async () => {
  await withFixture(async (f) => {
    const record = await trash(f)
    await f.database.db.deleteFrom('project_index').execute()
    await f.database.db.deleteFrom('project_workspace').execute()
    assert.deepEqual(await f.store.get(record.localProjectKey), record)
    await assert.rejects(
      f.store.restore(record.localProjectKey, record.trashId, f.workspace.id, guard),
      { code: 'TRASH_CONFLICT' },
    )
    assert.equal((await f.store.list()).length, 1)
    assert.ok(await readFile(record.canonicalPath))
  })
})

test('delete transaction rollback keeps original Trash state, index and real file', async () => {
  await withFixture(async (f) => {
    const record = await trash(f)
    const bytes = await readFile(record.canonicalPath)
    await sql`CREATE TRIGGER refuse_project_delete BEFORE DELETE ON project_index BEGIN SELECT RAISE(ABORT, 'owned delete fault'); END`.execute(
      f.database.db,
    )
    await assert.rejects(
      f.store.beginPermanentDelete(record.localProjectKey, record.trashId, guard),
      /owned delete fault/,
    )
    assert.equal((await f.store.get(record.localProjectKey))!.state, 'trashed')
    assert.equal((await f.database.db.selectFrom('project_index').selectAll().execute()).length, 1)
    assert.deepEqual(await readFile(record.canonicalPath), bytes)
  })
})

test('startup recovery purges only positive committed rows and preserves ordinary Trash files', async () => {
  await withFixture(async (f) => {
    const ordinary = await f.addProject('Uncommitted control')
    const control = await trash(f, ordinary)
    const record = await committed(f)
    assert.equal(record.state, 'deleting')
    assert.ok(record.deletionId)
    assert.ok(await readFile(record.canonicalPath))
    assert.equal(
      (
        await f.database.db
          .selectFrom('project_index')
          .selectAll()
          .where('local_project_key', '=', record.localProjectKey)
          .execute()
      ).length,
      0,
    )
    await new ProjectTrashStore(f.database.db).recoverCommittedDeletes()
    await assert.rejects(readFile(record.canonicalPath), { code: 'ENOENT' })
    assert.equal(await f.store.get(record.localProjectKey), null)
    assert.ok(await readFile(control.canonicalPath))
    assert.equal((await f.store.get(control.localProjectKey))!.state, 'trashed')
  })
})

test('replacement at the final-check await remains untouched and keeps the committed delete journal', async () => {
  await withFixture(async (f) => {
    const record = await committed(f)
    const original = await readFile(record.canonicalPath)
    const retained = `${record.canonicalPath}.retained`
    const store = new ProjectTrashStore(f.database.db, {
      beforeFinalFileCheck: async () => {
        await rename(record.canonicalPath, retained)
        await writeFile(record.canonicalPath, 'Foreign replacement')
      },
    })
    assert.equal((await store.finishPermanentDelete(record)).kind, 'pending')
    assert.equal(await readFile(record.canonicalPath, 'utf8'), 'Foreign replacement')
    assert.deepEqual(await readFile(retained), original)
    assert.equal((await f.store.get(record.localProjectKey))!.state, 'deleting')
    await new ProjectTrashStore(f.database.db).recoverCommittedDeletes()
    assert.equal(await readFile(record.canonicalPath, 'utf8'), 'Foreign replacement')
  })
})

test('parent directory replacement is refused without following the new workspace occupant', async () => {
  await withFixture(async (f) => {
    const record = await committed(f)
    const original = await readFile(record.canonicalPath)
    const retained = `${f.directory}.retained`
    const store = new ProjectTrashStore(f.database.db, {
      beforeFinalFileCheck: async () => {
        await rename(f.directory, retained)
        await mkdir(f.directory)
        await writeFile(record.canonicalPath, 'New folder occupant')
      },
    })
    assert.equal((await store.finishPermanentDelete(record)).kind, 'pending')
    assert.equal(await readFile(record.canonicalPath, 'utf8'), 'New folder occupant')
    assert.deepEqual(
      await readFile(path.join(retained, path.basename(record.canonicalPath))),
      original,
    )
  })
})

test('symlink and multilink substitutions cannot become purge targets', async () => {
  for (const mode of ['symlink', 'hardlink'] as const) {
    await withFixture(async (f) => {
      const record = await committed(f)
      const original = await readFile(record.canonicalPath)
      const other = path.join(f.root, 'other.igs')
      const store = new ProjectTrashStore(f.database.db, {
        beforeFinalFileCheck: async () => {
          if (mode === 'symlink') {
            await rename(record.canonicalPath, `${record.canonicalPath}.retained`)
            await writeFile(other, 'Foreign target')
            await symlink(other, record.canonicalPath)
          } else {
            await link(record.canonicalPath, other)
          }
        },
      })
      assert.equal((await store.finishPermanentDelete(record)).kind, 'pending')
      if (mode === 'symlink') {
        assert.equal(await readFile(other, 'utf8'), 'Foreign target')
        assert.equal((await lstat(record.canonicalPath)).isSymbolicLink(), true)
      } else {
        assert.deepEqual(await readFile(record.canonicalPath), original)
        assert.deepEqual(await readFile(other), original)
      }
    })
  }
})

test('failure after unlink retains positive authority; restart completes the absent-file purge safely', async () => {
  await withFixture(async (f) => {
    const record = await committed(f)
    const store = new ProjectTrashStore(f.database.db, {
      afterFileUnlink: async () => {
        throw new Error('Owned post-unlink crash')
      },
    })
    assert.equal((await store.finishPermanentDelete(record)).kind, 'pending')
    await assert.rejects(readFile(record.canonicalPath), { code: 'ENOENT' })
    assert.equal((await f.store.get(record.localProjectKey))!.deletionId, record.deletionId)
    await new ProjectTrashStore(f.database.db).recoverCommittedDeletes()
    assert.equal(await f.store.get(record.localProjectKey), null)
  })
})

test('finalize failure preserves journal even after durable unlink and later recovery finalizes it', async () => {
  await withFixture(async (f) => {
    const record = await committed(f)
    await sql`CREATE TRIGGER refuse_lifecycle_delete BEFORE DELETE ON project_file_lifecycle BEGIN SELECT RAISE(ABORT, 'owned finalize fault'); END`.execute(
      f.database.db,
    )
    assert.equal((await f.store.finishPermanentDelete(record)).kind, 'pending')
    await assert.rejects(readFile(record.canonicalPath), { code: 'ENOENT' })
    assert.equal((await f.store.get(record.localProjectKey))!.state, 'deleting')
    await sql`DROP TRIGGER refuse_lifecycle_delete`.execute(f.database.db)
    await new ProjectTrashStore(f.database.db).recoverCommittedDeletes()
    assert.equal(await f.store.get(record.localProjectKey), null)
  })
})

test('a new occupant after unlink is preserved by finalize check and all later recovery attempts', async () => {
  await withFixture(async (f) => {
    const record = await committed(f)
    const store = new ProjectTrashStore(f.database.db, {
      beforeFinalize: async () => {
        await writeFile(record.canonicalPath, 'Post-purge occupant')
      },
    })
    assert.equal((await store.finishPermanentDelete(record)).kind, 'pending')
    assert.equal(await readFile(record.canonicalPath, 'utf8'), 'Post-purge occupant')
    await new ProjectTrashStore(f.database.db).recoverCommittedDeletes()
    assert.equal(await readFile(record.canonicalPath, 'utf8'), 'Post-purge occupant')
    assert.ok(await f.store.get(record.localProjectKey))
  })
})

test('known missing source with original existing parent can complete metadata-only permanent deletion', async () => {
  await withFixture(async (f) => {
    await unlink(f.project.canonicalPath)
    const record = await committed(f)
    assert.equal(record.fileMissing, true)
    assert.equal(record.fileWitness, null)
    assert.deepEqual(await f.store.finishPermanentDelete(record), { kind: 'deleted' })
    assert.equal(await f.store.get(record.localProjectKey), null)
  })
})

test('unknown original parent refuses initial delete while keeping Trash reversible', async () => {
  await withFixture(async (f) => {
    const bytes = await readFile(f.project.canonicalPath)
    await rename(f.directory, `${f.directory}.retained`)
    const record = await trash(f)
    assert.equal(record.parentWitness, null)
    await assert.rejects(
      f.store.beginPermanentDelete(record.localProjectKey, record.trashId, guard),
      { code: 'TRASH_DELETE_PENDING' },
    )
    assert.equal((await f.store.get(record.localProjectKey))!.state, 'trashed')
    await mkdir(f.directory)
    await writeFile(record.canonicalPath, 'Later folder occupant')
    await assert.rejects(
      f.store.beginPermanentDelete(record.localProjectKey, record.trashId, guard),
      { code: 'TRASH_DELETE_PENDING' },
    )
    await new ProjectTrashStore(f.database.db).recoverCommittedDeletes()
    assert.equal(await readFile(record.canonicalPath, 'utf8'), 'Later folder occupant')
    const saved = await f.store.get(record.localProjectKey)
    assert.ok(saved)
    assert.equal(saved.state, 'trashed')
    assert.equal(saved.deletionId, null)
    assert.equal(saved.deleteCommittedAt, null)
    await rm(f.directory, { recursive: true })
    await rename(`${f.directory}.retained`, f.directory)
    await f.store.restore(record.localProjectKey, record.trashId, f.workspace.id, guard)
    assert.equal(await f.store.get(record.localProjectKey), null)
    assert.deepEqual(await readFile(record.canonicalPath), bytes)
  })
})

test('a source changed before initial delete preserves Trash and its derived index', async () => {
  await withFixture(async (f) => {
    const record = await trash(f)
    const foreign = Buffer.from('Changed after Trash but before committing permanent deletion')
    await writeFile(record.canonicalPath, foreign)
    await assert.rejects(
      f.store.beginPermanentDelete(record.localProjectKey, record.trashId, guard),
      { code: 'TRASH_FILE_CHANGED' },
    )
    const saved = await f.store.get(record.localProjectKey)
    assert.ok(saved)
    assert.equal(saved.state, 'trashed')
    assert.equal(saved.deletionId, null)
    assert.equal(saved.deleteCommittedAt, null)
    assert.equal((await f.database.db.selectFrom('project_index').selectAll().execute()).length, 1)
    await new ProjectTrashStore(f.database.db).recoverCommittedDeletes()
    assert.deepEqual(await readFile(record.canonicalPath), foreign)
  })
})

test('corrupted authority is rejected before any recovery unlink and caller snapshots never override it', async () => {
  await withFixture(async (f) => {
    const record = await committed(f)
    const bytes = await readFile(record.canonicalPath)
    await assert.rejects(
      f.store.finishPermanentDelete({ ...record, canonicalPath: path.join(f.root, 'foreign.igs') }),
      { code: 'TRASH_CONFLICT' },
    )
    await f.database.db
      .updateTable('project_file_lifecycle')
      .set({ parent_witness_json: '{"dev":"not-an-inode","ino":"0"}' })
      .execute()
    await assert.rejects(new ProjectTrashStore(f.database.db).recoverCommittedDeletes(), {
      code: 'TRASH_INVALID_RECORD',
    })
    assert.deepEqual(await readFile(record.canonicalPath), bytes)
  })
})

test('a shaped but inconsistent file witness is corrupt rather than a grant to purge replacement bytes', async () => {
  await withFixture(async (f) => {
    const record = await committed(f)
    const bytes = await readFile(record.canonicalPath)
    assert.ok(record.fileWitness)
    await f.database.db
      .updateTable('project_file_lifecycle')
      .set({
        file_witness_json: JSON.stringify({
          ...record.fileWitness,
          size: String(BigInt(record.fileWitness.size) + 1n),
        }),
      })
      .execute()
    await assert.rejects(f.store.finishPermanentDelete(record), { code: 'TRASH_INVALID_RECORD' })
    assert.deepEqual(await readFile(record.canonicalPath), bytes)
  })
})

test('an indexed missing source cannot freeze a later occupant under its stale Trash metadata', async () => {
  await withFixture(async (f) => {
    const foreign = Buffer.from('A different source now occupies the old missing path')
    await writeFile(f.project.canonicalPath, foreign)
    await f.database.db
      .updateTable('project_index')
      .set({ file_fingerprint: null, file_health: 'missing' })
      .where('local_project_key', '=', f.project.localProjectKey)
      .execute()
    const missing = { ...f.project, fileFingerprint: null, fileHealth: 'missing' as const }
    await assert.rejects(f.store.moveToTrash(missing, f.workspace, guard), {
      code: 'TRASH_FILE_CHANGED',
    })
    assert.deepEqual(await f.store.list(), [])
    assert.deepEqual(await readFile(f.project.canonicalPath), foreign)
  })
})

test('committed deletion does not invent a pending row if postcommit identity refresh requires repair', async () => {
  await withFixture(async (f) => {
    const record = await committed(f)
    await sql`CREATE TRIGGER corrupt_retirement AFTER DELETE ON project_file_lifecycle
      BEGIN INSERT INTO project_identity_binding (local_project_key, canonical_path, document_id)
      VALUES (OLD.local_project_key, OLD.canonical_path, json_extract(OLD.project_json, '$.documentId')); END`.execute(
      f.database.db,
    )
    assert.deepEqual(await f.store.finishPermanentDelete(record), { kind: 'deleted' })
    await assert.rejects(readFile(record.canonicalPath), { code: 'ENOENT' })
    assert.equal(await f.store.get(record.localProjectKey), null)
    assert.throws(() => localProjectRecoveryKey(record.canonicalPath), /identity|location|storage/i)
  })
})
