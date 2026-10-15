import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from './database.js'

const migrations = path.resolve('src/main/db/migrations')

test('Outpaint queue migration preserves all four legacy operations, every status and independent receipts/seed across actual reopen', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-outpaint-queue-migration-'))
  const legacyMigrations = path.join(root, 'legacy')
  await mkdir(legacyMigrations)
  for (const name of await readdir(migrations)) {
    if (name.endsWith('.sql') && name < '0015') {
      await cp(path.join(migrations, name), path.join(legacyMigrations, name))
    }
  }
  try {
    const before = openAppDatabase(root, legacyMigrations)
    const timestamp = '2026-10-05T00:00:00.000Z'
    const rows = [
      'illustrious-txt2img',
      'illustrious-img2img',
      'anima-txt2img',
      'anima-img2img',
    ].flatMap((operation) =>
      ['pending', 'running', 'completed', 'failed', 'canceled'].map((status, index) => ({
        batch_id: 'legacy-batch',
        canonical_project_path: '/legacy/project.igs',
        created_at: timestamp,
        document_id: 'legacy-document',
        document_revision: 'legacy-revision',
        error_code: status === 'failed' ? 'LEGACY_FAILURE' : null,
        error_message: status === 'failed' ? 'Old failure' : null,
        finished_at: ['canceled', 'completed', 'failed'].includes(status) ? timestamp : null,
        frozen_payload_json: JSON.stringify({ legacy: index, operation }),
        id: `${operation}-${status}`,
        local_project_key: 'legacy-project',
        operation,
        staging_session_id: 'legacy-session',
        started_at: status === 'pending' ? null : timestamp,
        status,
        status_sequence: index,
        updated_at: timestamp,
      })),
    )
    await before.db.insertInto('generation_queue_item').values(rows).execute()
    await before.db
      .insertInto('generation_candidate_receipt')
      .values({
        actual_seed: 0,
        candidate_id: 'old-candidate',
        canonical_project_path: '/legacy/project.igs',
        completed_at: timestamp,
        expected_status_sequence: 2,
        frozen_payload_sha256: 'a'.repeat(64),
        image_byte_size: 123,
        image_sha256: 'b'.repeat(64),
        local_project_key: 'legacy-project',
        queue_item_id: 'illustrious-txt2img-completed',
        reserved_at: timestamp,
        staging_session_id: 'legacy-session',
        status: 'completed',
      })
      .execute()
    const receipts = await before.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .execute()
    assert.ok(receipts[0].completion_order !== null)
    await before.db
      .insertInto('generation_seed_cursor')
      .values({
        actual_seed: 0,
        candidate_id: 'old-candidate',
        completion_order: receipts[0].completion_order,
        document_id: 'legacy-document',
        local_project_key: 'legacy-project',
        updated_at: timestamp,
      })
      .execute()
    const cursors = await before.db.selectFrom('generation_seed_cursor').selectAll().execute()
    const oldRows = await before.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('id')
      .execute()
    await assert.rejects(
      before.db
        .insertInto('generation_queue_item')
        .values({ ...rows[0], id: 'early-outpaint', operation: 'illustrious-outpaint' })
        .execute(),
      /CHECK constraint failed/,
    )
    await before.close()

    const migrated = openAppDatabase(root, migrations)
    try {
      assert.deepEqual(
        await migrated.db.selectFrom('generation_queue_item').selectAll().orderBy('id').execute(),
        oldRows,
      )
      assert.deepEqual(
        await migrated.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
        receipts,
      )
      assert.deepEqual(
        await migrated.db.selectFrom('generation_seed_cursor').selectAll().execute(),
        cursors,
      )
      for (const operation of ['illustrious-outpaint', 'anima-outpaint']) {
        await migrated.db
          .insertInto('generation_queue_item')
          .values({ ...rows[0], id: operation, operation })
          .execute()
      }
      for (const operation of [
        'anima-inpaint',
        'illustrious-inpaint',
        'sdxl-outpaint',
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
      const integrity = await sql<{ integrity_check: string }>`PRAGMA integrity_check`.execute(
        migrated.db,
      )
      assert.equal(integrity.rows[0]?.integrity_check, 'ok')
      const indexes = await sql<{
        name: string
      }>`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'generation_queue_item' ORDER BY name`.execute(
        migrated.db,
      )
      assert.deepEqual(
        indexes.rows.map((row) => row.name),
        [
          'idx_generation_queue_project',
          'idx_generation_queue_status',
          'sqlite_autoindex_generation_queue_item_1',
        ],
      )
    } finally {
      await migrated.close()
    }
    const reopened = openAppDatabase(root, migrations)
    try {
      assert.equal(
        (await reopened.db.selectFrom('generation_queue_item').selectAll().execute()).length,
        22,
      )
      assert.deepEqual(
        await reopened.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
        receipts,
      )
      assert.deepEqual(
        await reopened.db.selectFrom('generation_seed_cursor').selectAll().execute(),
        cursors,
      )
    } finally {
      await reopened.close()
    }
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
