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
  utimes,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { ProjectIndexRecord, ProjectWorkspaceRecord } from './project-index.js'

import { openAppDatabase } from '../db/database.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ProjectRelocationStore } from './project-relocation-store.js'
import { ProjectSession } from './project-session.js'
import { ProjectTrashStore } from './project-trash-store.js'

type Fixture = Awaited<ReturnType<typeof fixture>>
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-relocation-core-'))
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
  const targetDirectory = path.join(root, 'target-workspace')
  await mkdir(targetDirectory)
  const target: ProjectWorkspaceRecord = {
    color: 'teal',
    directoryPath: targetDirectory,
    displayName: 'Target workspace',
    id: randomUUID(),
  }
  await database.db
    .insertInto('project_workspace')
    .values({
      color: target.color,
      created_at: now,
      directory_path: targetDirectory,
      display_name: target.displayName,
      id: target.id,
      is_default: 0,
      updated_at: now,
    })
    .execute()
  const store = new ProjectRelocationStore(database.db)
  return {
    addProject,
    database,
    dataRoot,
    directory,
    project,
    root,
    store,
    target,
    targetDirectory,
    workspace,
  }
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
const destination = (f: Fixture) =>
  path.join(f.targetDirectory, path.basename(f.project.canonicalPath))
const begin = (f: Fixture) => f.store.beginMove(f.project, f.workspace, f.target, guard)
async function terminalQueue(f: Fixture, status = 'failed') {
  const now = new Date().toISOString()
  const id = randomUUID()
  const frozen = String.raw`{ "opaque": ["retained\nbytes", -0] }`
  await f.database.db
    .insertInto('generation_queue_item')
    .values({
      batch_id: randomUUID(),
      canonical_project_path: f.project.canonicalPath,
      created_at: now,
      document_id: f.project.documentId!,
      document_revision: f.project.documentRevision!,
      error_code: status === 'failed' ? 'FIXTURE' : null,
      error_message: null,
      finished_at: now,
      frozen_payload_json: frozen,
      id,
      local_project_key: f.project.localProjectKey,
      operation: 'illustrious-txt2img',
      staging_session_id: randomUUID(),
      started_at: null,
      status,
      status_sequence: 0,
      updated_at: now,
    })
    .execute()
  return { frozen, id }
}

test('same-filesystem Move preserves exact package bytes and stable ownership while repointing the index', async () => {
  await withFixture(async (f) => {
    const original = await readFile(f.project.canonicalPath)
    const record = await begin(f)
    assert.equal(record.sourcePath, f.project.canonicalPath)
    assert.equal(record.destinationPath, destination(f))
    assert.deepEqual(await f.store.finishMove(record), { kind: 'moved' })
    await assert.rejects(readFile(record.sourcePath), { code: 'ENOENT' })
    assert.deepEqual(await readFile(record.destinationPath), original)
    assert.equal(localProjectRecoveryKey(record.destinationPath), f.project.localProjectKey)
    const indexed = await f.database.db
      .selectFrom('project_index')
      .selectAll()
      .where('local_project_key', '=', record.localProjectKey)
      .executeTakeFirstOrThrow()
    const stat = await lstat(record.destinationPath, { bigint: true })
    assert.equal(indexed.canonical_path, record.destinationPath)
    assert.equal(indexed.workspace_id, f.target.id)
    assert.equal(
      indexed.file_fingerprint,
      [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':'),
    )
    assert.equal(await f.store.get(record.localProjectKey), null)
  })
})

test('preflight guard, same-workspace and case-insensitive existing destination refuse without move intent', async () => {
  await withFixture(async (f) => {
    const original = await readFile(f.project.canonicalPath)
    await assert.rejects(
      f.store.beginMove(f.project, f.workspace, f.target, () => {
        throw new Error('guard refused')
      }),
      /guard refused/,
    )
    await assert.rejects(f.store.beginMove(f.project, f.workspace, f.workspace, guard), {
      code: 'PROJECT_MOVE_INVALID',
    })
    const collision = path.join(f.targetDirectory, path.basename(destination(f)).toUpperCase())
    await writeFile(collision, 'Foreign collision')
    await assert.rejects(begin(f), { code: 'PROJECT_MOVE_CONFLICT' })
    assert.deepEqual(await f.store.list(), [])
    assert.deepEqual(await readFile(f.project.canonicalPath), original)
    assert.equal(await readFile(collision, 'utf8'), 'Foreign collision')
  })
})

test('intent transaction rollback leaves source and index intact without positive recovery authority', async () => {
  await withFixture(async (f) => {
    await sql`CREATE TRIGGER refuse_relocation BEFORE INSERT ON project_relocation BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END`.execute(
      f.database.db,
    )
    const original = await readFile(f.project.canonicalPath)
    await assert.rejects(begin(f), /fixture rollback/)
    assert.equal(await f.store.get(f.project.localProjectKey), null)
    assert.deepEqual(await readFile(f.project.canonicalPath), original)
    assert.equal(
      (await f.database.db.selectFrom('project_index').selectAll().executeTakeFirstOrThrow())
        .canonical_path,
      f.project.canonicalPath,
    )
  })
})

test('unfinished queue, acceptance journal and Trash prevent publication before filesystem effects', async () => {
  for (const kind of ['queue', 'acceptance', 'trash']) {
    await withFixture(async (f) => {
      const original = await readFile(f.project.canonicalPath)
      if (kind === 'queue') {
        await terminalQueue(f, 'pending')
      }
      if (kind === 'acceptance') {
        await f.database.db
          .insertInto('generation_acceptance_journal')
          .values({
            canonical_project_path: f.project.canonicalPath,
            document_id: f.project.documentId!,
            local_project_key: f.project.localProjectKey,
            operation_id: randomUUID(),
            payload_json: '{}',
            recorded_at: new Date().toISOString(),
          })
          .execute()
      }
      if (kind === 'trash') {
        await new ProjectTrashStore(f.database.db).moveToTrash(f.project, f.workspace, guard)
      }
      await assert.rejects(begin(f), { code: 'PROJECT_MOVE_CONFLICT' })
      assert.equal(await f.store.get(f.project.localProjectKey), null)
      assert.deepEqual(await readFile(f.project.canonicalPath), original)
    })
  }
})

test('a destination created at the final-check seam is retained with the source and durable pending journal', async () => {
  await withFixture(async (f) => {
    const record = await begin(f)
    const original = await readFile(record.sourcePath)
    const store = new ProjectRelocationStore(f.database.db, {
      beforeFinalFileCheck: async () => {
        await writeFile(record.destinationPath, 'Foreign final destination')
      },
    })
    assert.equal((await store.finishMove(record)).kind, 'pending')
    assert.deepEqual(await readFile(record.sourcePath), original)
    assert.equal(await readFile(record.destinationPath, 'utf8'), 'Foreign final destination')
    assert.ok(await f.store.get(record.localProjectKey))
    await f.store.recoverPendingMoves()
    assert.equal(await readFile(record.destinationPath, 'utf8'), 'Foreign final destination')
  })
})

test('a source replaced at the final-check seam is not moved under the old intent', async () => {
  await withFixture(async (f) => {
    const record = await begin(f)
    const retained = `${record.sourcePath}.retained`
    const original = await readFile(record.sourcePath)
    const store = new ProjectRelocationStore(f.database.db, {
      beforeFinalFileCheck: async () => {
        await rename(record.sourcePath, retained)
        await writeFile(record.sourcePath, 'Foreign replacement')
      },
    })
    assert.equal((await store.finishMove(record)).kind, 'pending')
    assert.equal(await readFile(record.sourcePath, 'utf8'), 'Foreign replacement')
    assert.deepEqual(await readFile(retained), original)
    await assert.rejects(readFile(record.destinationPath), { code: 'ENOENT' })
  })
})

test('source symlink and replaced target parent refuse without following foreign paths', async () => {
  for (const kind of ['symlink', 'parent']) {
    await withFixture(async (f) => {
      const record = await begin(f)
      const original = await readFile(record.sourcePath)
      const foreign = path.join(f.root, 'foreign.igs')
      await writeFile(foreign, 'Foreign source')
      const store = new ProjectRelocationStore(f.database.db, {
        beforeFinalFileCheck: async () => {
          if (kind === 'symlink') {
            await rename(record.sourcePath, `${record.sourcePath}.retained`)
            await symlink(foreign, record.sourcePath)
          } else {
            await rename(f.targetDirectory, `${f.targetDirectory}.retained`)
            await mkdir(f.targetDirectory)
          }
        },
      })
      assert.equal((await store.finishMove(record)).kind, 'pending')
      assert.equal(await readFile(foreign, 'utf8'), 'Foreign source')
      if (kind === 'parent') {
        assert.deepEqual(await readFile(record.sourcePath), original)
      } else {
        assert.equal((await lstat(record.sourcePath)).isSymbolicLink(), true)
      }
    })
  }
})

test('multilink substitution at final validation never moves a shared file', async () => {
  await withFixture(async (f) => {
    const record = await begin(f)
    const other = path.join(f.root, 'other.igs')
    const store = new ProjectRelocationStore(f.database.db, {
      beforeFinalFileCheck: () => link(record.sourcePath, other),
    })
    assert.equal((await store.finishMove(record)).kind, 'pending')
    assert.deepEqual(await readFile(record.sourcePath), await readFile(other))
    await assert.rejects(readFile(record.destinationPath), { code: 'ENOENT' })
  })
})

test('failure after atomic rename retains destination-only authority that startup completes safely', async () => {
  await withFixture(async (f) => {
    const record = await begin(f)
    const original = await readFile(record.sourcePath)
    const store = new ProjectRelocationStore(f.database.db, {
      afterRename: async () => {
        throw new Error('crash after rename')
      },
    })
    assert.equal((await store.finishMove(record)).kind, 'pending')
    await assert.rejects(readFile(record.sourcePath), { code: 'ENOENT' })
    assert.deepEqual(await readFile(record.destinationPath), original)
    assert.ok(await f.store.get(record.localProjectKey))
    await new ProjectRelocationStore(f.database.db).recoverPendingMoves()
    assert.equal(await f.store.get(record.localProjectKey), null)
    assert.equal(localProjectRecoveryKey(record.destinationPath), record.localProjectKey)
  })
})

test('terminal queue, receipt and seed data preserve frozen bytes while only mutable paths repoint', async () => {
  await withFixture(async (f) => {
    const failed = await terminalQueue(f)
    const completed = await terminalQueue(f, 'completed')
    const now = new Date().toISOString()
    await f.database.db
      .insertInto('generation_candidate_receipt')
      .values({
        actual_seed: 17,
        candidate_id: completed.id,
        canonical_project_path: f.project.canonicalPath,
        completed_at: now,
        completion_order: 1,
        expected_status_sequence: 0,
        frozen_payload_sha256: 'a'.repeat(64),
        image_byte_size: 1,
        image_sha256: 'b'.repeat(64),
        local_project_key: f.project.localProjectKey,
        queue_item_id: completed.id,
        reserved_at: now,
        staging_session_id: randomUUID(),
        status: 'completed',
      })
      .execute()
    await f.database.db
      .insertInto('generation_seed_cursor')
      .values({
        actual_seed: 17,
        candidate_id: completed.id,
        completion_order: 1,
        document_id: f.project.documentId!,
        local_project_key: f.project.localProjectKey,
        updated_at: now,
      })
      .execute()
    const queueBefore = await f.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('id')
      .execute()
    const receiptBefore = await f.database.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .execute()
    const seedBefore = await f.database.db
      .selectFrom('generation_seed_cursor')
      .selectAll()
      .execute()
    const record = await begin(f)
    assert.deepEqual(await f.store.finishMove(record), { kind: 'moved' })
    const expectedQueue = queueBefore.map((row) => ({
      ...row,
      canonical_project_path: record.destinationPath,
    }))
    const expectedReceipt = receiptBefore.map((row) => ({
      ...row,
      canonical_project_path: record.destinationPath,
    }))
    assert.deepEqual(
      await f.database.db.selectFrom('generation_queue_item').selectAll().orderBy('id').execute(),
      expectedQueue,
    )
    assert.deepEqual(
      await f.database.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
      expectedReceipt,
    )
    assert.deepEqual(
      await f.database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
      seedBefore,
    )
    assert.equal(
      expectedQueue.find((row) => row.id === failed.id)!.frozen_payload_json,
      failed.frozen,
    )
  })
})

test('failure before database repoint preserves source metadata and resumes without another filesystem move', async () => {
  await withFixture(async (f) => {
    const record = await begin(f)
    const store = new ProjectRelocationStore(f.database.db, {
      beforeDatabaseRepoint: async () => {
        throw new Error('database unavailable')
      },
    })
    assert.equal((await store.finishMove(record)).kind, 'pending')
    assert.equal(
      (await f.database.db.selectFrom('project_index').selectAll().executeTakeFirstOrThrow())
        .canonical_path,
      record.sourcePath,
    )
    assert.deepEqual(await f.store.finishMove(record), { kind: 'moved' })
  })
})

test('failure after database repoint and before finalization is idempotent and retains stable registry ownership', async () => {
  for (const seam of ['afterDatabaseRepoint', 'beforeFinalize'] as const) {
    await withFixture(async (f) => {
      const record = await begin(f)
      const store = new ProjectRelocationStore(f.database.db, {
        [seam]: async () => {
          throw new Error('finalization crash')
        },
      })
      assert.equal((await store.finishMove(record)).kind, 'pending')
      assert.equal(localProjectRecoveryKey(record.destinationPath), record.localProjectKey)
      assert.equal(
        (
          await f.database.db
            .selectFrom('project_identity_binding')
            .selectAll()
            .executeTakeFirstOrThrow()
        ).canonical_path,
        record.destinationPath,
      )
      assert.ok(await f.store.get(record.localProjectKey))
      await f.store.recoverPendingMoves()
      assert.equal(await f.store.get(record.localProjectKey), null)
    })
  }
})

test('destination replacement after rename is refused even when foreign bytes exactly equal the original', async () => {
  await withFixture(async (f) => {
    const record = await begin(f)
    const original = await readFile(record.sourcePath)
    const store = new ProjectRelocationStore(f.database.db, {
      afterRename: async () => {
        await rename(record.destinationPath, `${record.destinationPath}.retained`)
        await writeFile(record.destinationPath, original)
      },
    })
    assert.equal((await store.finishMove(record)).kind, 'pending')
    await f.store.recoverPendingMoves()
    assert.deepEqual(await readFile(record.destinationPath), original)
    assert.deepEqual(await readFile(`${record.destinationPath}.retained`), original)
    assert.ok(await f.store.get(record.localProjectKey))
  })
})

test('destination-only recovery verifies SHA beyond matching inode, size and mtime', async () => {
  await withFixture(async (f) => {
    await utimes(f.project.canonicalPath, 1000, 1000)
    const stat = await lstat(f.project.canonicalPath, { bigint: true })
    f.project.fileFingerprint = [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(
      ':',
    )
    await f.database.db
      .updateTable('project_index')
      .set({ file_fingerprint: f.project.fileFingerprint, file_mtime_ns: stat.mtimeNs.toString() })
      .where('local_project_key', '=', f.project.localProjectKey)
      .execute()
    const record = await begin(f)
    const original = await readFile(record.sourcePath)
    const corrupt = Buffer.from(original)
    corrupt[corrupt.length - 1] ^= 1
    const store = new ProjectRelocationStore(f.database.db, {
      afterRename: async () => {
        await writeFile(record.destinationPath, corrupt)
        await utimes(record.destinationPath, 1000, 1000)
      },
    })
    assert.equal((await store.finishMove(record)).kind, 'pending')
    const changed = await lstat(record.destinationPath, { bigint: true })
    assert.equal(changed.ino.toString(), record.sourceWitness.ino)
    assert.equal(changed.mtimeNs.toString(), record.sourceWitness.mtimeNs)
    assert.equal(changed.size.toString(), record.sourceWitness.size)
    assert.deepEqual(await readFile(record.destinationPath), corrupt)
    assert.ok(await f.store.get(record.localProjectKey))
  })
})

test('positive authority cannot be forged by caller snapshots or corrupted persisted witnesses', async () => {
  await withFixture(async (f) => {
    const record = await begin(f)
    await assert.rejects(
      f.store.finishMove({
        ...record,
        destinationPath: path.join(f.targetDirectory, 'foreign.igs'),
      }),
      { code: 'PROJECT_MOVE_CONFLICT' },
    )
    await f.database.db
      .updateTable('project_relocation')
      .set({ source_witness_json: JSON.stringify({ ...record.sourceWitness, ino: '999999999' }) })
      .where('local_project_key', '=', record.localProjectKey)
      .execute()
    await assert.rejects(f.store.recoverPendingMoves(), { code: 'PROJECT_MOVE_INVALID' })
    assert.ok(await readFile(record.sourcePath))
    await assert.rejects(readFile(record.destinationPath), { code: 'ENOENT' })
  })
})

test('a late busy row or caller lifecycle guard blocks positive-intent execution without losing original bytes', async () => {
  await withFixture(async (f) => {
    const record = await begin(f)
    const original = await readFile(record.sourcePath)
    assert.equal(
      (
        await f.store.finishMove(record, () => {
          throw new Error('staging unavailable')
        })
      ).kind,
      'pending',
    )
    assert.deepEqual(await readFile(record.sourcePath), original)
    const queued = await terminalQueue(f, 'pending')
    assert.equal((await f.store.finishMove(record)).kind, 'pending')
    await f.database.db.deleteFrom('generation_queue_item').where('id', '=', queued.id).execute()
    await f.store.recoverPendingMoves()
    assert.deepEqual(await readFile(record.destinationPath), original)
  })
})
