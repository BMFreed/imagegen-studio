import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from './database.js'

const migrations = path.resolve(import.meta.dirname, 'migrations')
const migrationName = '0022_regional_img2img_queue.sql'

test('Regional img2img SQL migration preserves ten existing operations in every state and independent receipt/cursor/index bytes across reopen', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-regional-queue-migration-'))
  const legacyMigrations = path.join(root, 'legacy-migrations')
  await mkdir(legacyMigrations, { mode: 0o700 })
  for (const name of await readdir(migrations)) {
    if (/^\d{4}_[a-z0-9_]+\.sql$/.test(name) && name < migrationName) {
      await cp(path.join(migrations, name), path.join(legacyMigrations, name))
    }
  }
  const timestamp = '2026-10-15T12:34:56.789Z'
  const ordinaryOperations = [
    'illustrious-txt2img',
    'illustrious-img2img',
    'anima-txt2img',
    'anima-img2img',
    'illustrious-outpaint',
    'anima-outpaint',
    'illustrious-smart-patch',
    'anima-smart-patch',
    'illustrious-regional',
    'illustrious-regional-txt2img',
  ]
  const states = ['pending', 'running', 'completed', 'failed', 'canceled']
  const rows = ordinaryOperations.flatMap((operation, operationIndex) =>
    states.map((status, stateIndex) => ({
      batch_id: `legacy-batch-${operationIndex}`,
      canonical_project_path: `/legacy/project-${operationIndex}.igs`,
      created_at: timestamp,
      document_id: `legacy-document-${operationIndex}`,
      document_revision: `legacy-revision-${operationIndex}-${stateIndex}`,
      error_code:
        status === 'failed' ? 'PRESERVED_FAILURE' : status === 'canceled' ? 'USER_CANCELED' : null,
      error_message:
        status === 'failed' ? 'Original error: \"Локальные байты\"\nsecond line' : null,
      finished_at: ['canceled', 'completed', 'failed'].includes(status) ? timestamp : null,
      frozen_payload_json: `{\n  "operation": "${operation}", "state": "${status}", "unicode": "日本語/Русский", "escaped": "\\n"\n}`,
      id: `${operation}-${status}`,
      local_project_key: `legacy-project-${operationIndex}`,
      operation,
      staging_session_id: `legacy-session-${operationIndex}`,
      started_at: status === 'pending' ? null : timestamp,
      status,
      status_sequence: stateIndex,
      updated_at: timestamp,
    })),
  )
  try {
    const legacy = openAppDatabase(root, legacyMigrations)
    let oldRows: unknown
    let receipts: unknown
    let cursors: unknown
    let indexes: unknown
    let bytes: unknown
    let priorMigrations: unknown
    try {
      await legacy.db.insertInto('generation_queue_item').values(rows).execute()
      for (const operation of ['illustrious-regional-img2img']) {
        await assert.rejects(
          legacy.db
            .insertInto('generation_queue_item')
            .values({ ...rows[0], id: operation, operation })
            .execute(),
          /CHECK constraint failed/,
        )
      }
      for (const [index, actualSeed] of [0, 0xff_ff_ff_ff].entries()) {
        const inserted = await legacy.db
          .insertInto('generation_candidate_receipt')
          .values({
            actual_seed: actualSeed,
            candidate_id: `independent-candidate-${index}`,
            canonical_project_path: `/legacy/project-${index}.igs`,
            completed_at: timestamp,
            expected_status_sequence: 2,
            frozen_payload_sha256: (index === 0 ? 'a' : 'c').repeat(64),
            image_byte_size: 123 + index,
            image_sha256: (index === 0 ? 'b' : 'd').repeat(64),
            local_project_key: `legacy-project-${index}`,
            queue_item_id:
              index === 0 ? 'illustrious-txt2img-completed' : 'illustrious-img2img-completed',
            reserved_at: timestamp,
            staging_session_id: `legacy-session-${index}`,
            status: 'completed',
          })
          .returningAll()
          .executeTakeFirstOrThrow()
        assert.ok(inserted.completion_order !== null)
        await legacy.db
          .insertInto('generation_seed_cursor')
          .values({
            actual_seed: actualSeed,
            candidate_id: inserted.candidate_id,
            completion_order: inserted.completion_order,
            document_id: `legacy-document-${index}`,
            local_project_key: `legacy-project-${index}`,
            updated_at: timestamp,
          })
          .execute()
      }
      await legacy.db
        .insertInto('generation_candidate_receipt')
        .values({
          actual_seed: 17,
          candidate_id: 'independent-reserved-candidate',
          canonical_project_path: '/legacy/project-2.igs',
          completed_at: null,
          expected_status_sequence: 1,
          frozen_payload_sha256: 'e'.repeat(64),
          image_byte_size: 125,
          image_sha256: 'f'.repeat(64),
          local_project_key: 'legacy-project-2',
          queue_item_id: 'anima-txt2img-running',
          reserved_at: timestamp,
          staging_session_id: 'legacy-session-2',
          status: 'reserved',
        })
        .execute()
      oldRows = await legacy.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .orderBy('id')
        .execute()
      receipts = await legacy.db
        .selectFrom('generation_candidate_receipt')
        .selectAll()
        .orderBy('candidate_id')
        .execute()
      cursors = await legacy.db
        .selectFrom('generation_seed_cursor')
        .selectAll()
        .orderBy('local_project_key')
        .execute()
      indexes = (
        await sql`SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='generation_queue_item' ORDER BY name`.execute(
          legacy.db,
        )
      ).rows
      bytes = (
        await sql`SELECT id, hex(CAST(frozen_payload_json AS BLOB)) AS payload_bytes, hex(CAST(error_message AS BLOB)) AS error_bytes FROM generation_queue_item ORDER BY id`.execute(
          legacy.db,
        )
      ).rows
      priorMigrations = (
        await sql`SELECT name, sha256, applied_at FROM schema_migrations ORDER BY name`.execute(
          legacy.db,
        )
      ).rows
    } finally {
      await legacy.close()
    }
    const migrated = openAppDatabase(root, migrations)
    try {
      assert.deepEqual(
        await migrated.db.selectFrom('generation_queue_item').selectAll().orderBy('id').execute(),
        oldRows,
      )
      assert.deepEqual(
        await migrated.db
          .selectFrom('generation_candidate_receipt')
          .selectAll()
          .orderBy('candidate_id')
          .execute(),
        receipts,
      )
      assert.deepEqual(
        await migrated.db
          .selectFrom('generation_seed_cursor')
          .selectAll()
          .orderBy('local_project_key')
          .execute(),
        cursors,
      )
      assert.deepEqual(
        (
          await sql`SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='generation_queue_item' ORDER BY name`.execute(
            migrated.db,
          )
        ).rows,
        indexes,
      )
      assert.deepEqual(
        (
          await sql`SELECT id, hex(CAST(frozen_payload_json AS BLOB)) AS payload_bytes, hex(CAST(error_message AS BLOB)) AS error_bytes FROM generation_queue_item ORDER BY id`.execute(
            migrated.db,
          )
        ).rows,
        bytes,
      )
      assert.deepEqual(
        (
          await sql`SELECT name, sha256, applied_at FROM schema_migrations WHERE name < ${migrationName} ORDER BY name`.execute(
            migrated.db,
          )
        ).rows,
        priorMigrations,
      )
      for (const operation of ['illustrious-regional-img2img']) {
        await migrated.db
          .insertInto('generation_queue_item')
          .values({ ...rows[0], id: operation, operation })
          .execute()
      }
      for (const operation of [
        'illustrious-inpaint',
        'anima-inpaint',
        'sdxl-smart-patch',
        'anima-regional',
        'regional',
        'smart-patch',
        'unsupported',
      ]) {
        await assert.rejects(
          migrated.db
            .insertInto('generation_queue_item')
            .values({ ...rows[0], id: operation, operation })
            .execute(),
          /CHECK constraint failed/,
        )
      }
      await assert.rejects(
        migrated.db
          .insertInto('generation_queue_item')
          .values({ ...rows[0], id: 'invalid-status', status: 'queued' })
          .execute(),
        /CHECK constraint failed/,
      )
      await assert.rejects(
        migrated.db
          .insertInto('generation_queue_item')
          .values({ ...rows[0], id: 'negative-sequence', status_sequence: -1 })
          .execute(),
        /CHECK constraint failed/,
      )
      await assert.rejects(
        migrated.db.insertInto('generation_queue_item').values(rows[0]).execute(),
        /UNIQUE constraint failed/,
      )
      await assert.rejects(
        sql`UPDATE generation_queue_item SET frozen_payload_json = ${Buffer.from('not TEXT')} WHERE id = ${rows[0].id}`.execute(
          migrated.db,
        ),
        /cannot store BLOB value in TEXT column/,
      )
      const integrity = await sql<{ integrity_check: string }>`PRAGMA integrity_check`.execute(
        migrated.db,
      )
      assert.equal(integrity.rows[0]?.integrity_check, 'ok')
      const foreignKeys = await sql`PRAGMA foreign_key_check`.execute(migrated.db)
      assert.deepEqual(foreignKeys.rows, [])
    } finally {
      await migrated.close()
    }
    const reopened = openAppDatabase(root, migrations)
    try {
      assert.equal(
        (await reopened.db.selectFrom('generation_queue_item').selectAll().execute()).length,
        rows.length + 1,
      )
      assert.deepEqual(
        await reopened.db
          .selectFrom('generation_candidate_receipt')
          .selectAll()
          .orderBy('candidate_id')
          .execute(),
        receipts,
      )
      assert.deepEqual(
        await reopened.db
          .selectFrom('generation_seed_cursor')
          .selectAll()
          .orderBy('local_project_key')
          .execute(),
        cursors,
      )
      assert.deepEqual(
        (
          await sql`SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='generation_queue_item' ORDER BY name`.execute(
            reopened.db,
          )
        ).rows,
        indexes,
      )
    } finally {
      await reopened.close()
    }
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
