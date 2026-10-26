import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from './database.js'

const migrations = path.resolve('src/main/db/migrations')
const migrationName = '0019_smart_patch_raster_history_geometry.sql'
const at = '2026-10-22T00:00:00.000Z'

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-smart-raster-history-migration-'))
  const legacyMigrations = path.join(root, 'legacy-migrations')
  await cp(migrations, legacyMigrations, { recursive: true })
  await rm(path.join(legacyMigrations, migrationName))
  const old = openAppDatabase(root, legacyMigrations)
  const projectKey = `project-v1-${'a'.repeat(64)}`
  let prepared = false
  try {
    await old.db
      .insertInto('project_workspace')
      .values({
        color: 'blue',
        created_at: at,
        directory_path: '/declared/projects',
        display_name: 'Unchanged workspace',
        id: 'legacy-workspace',
        is_default: 1,
        updated_at: at,
      })
      .execute()
    await old.db
      .insertInto('project_index')
      .values({
        bbox_height: 64,
        bbox_width: 64,
        canonical_path: '/declared/projects/source.igs',
        diagnostic_code: null,
        display_name: 'Original 日本語\nРусский',
        document_id: randomUUID(),
        document_revision: randomUUID(),
        file_fingerprint: 'kept fingerprint',
        file_health: 'ready',
        file_mtime_ns: '123456789012345',
        file_size_bytes: 12_345,
        indexed_at: at,
        last_opened_at: at,
        local_project_key: projectKey,
        preview_status: 'unavailable',
        preview_thumbnail_sha256: 'b'.repeat(64),
        search_name: 'original',
        trashed_at: null,
        workspace_id: 'legacy-workspace',
      })
      .execute()
    const rows = [0, 0xff_ff_ff_ff].map((seed, index) => ({
      accepted_at: at,
      actual_seed: seed,
      asset_bytes: 123 + index,
      asset_height: 8,
      asset_path: `assets/layers/${randomUUID()}.png`,
      asset_sha256: 'c'.repeat(64),
      asset_width: 8,
      document_id: randomUUID(),
      document_revision: randomUUID(),
      layer_id: randomUUID(),
      layer_name: `Original result ${index}\n日本語`,
      local_project_key: projectKey,
      model_file_sha256: 'd'.repeat(64),
      model_name: 'Exact model',
      model_version_name: 'Original version',
      output_height: 8,
      output_width: 8,
    }))
    await old.db.insertInto('project_accepted_result_index').values(rows).execute()
    await old.db
      .insertInto('app_metadata')
      .values({ key: 'unrelated', value: 'exact\nbytes' })
      .execute()
    const project = await old.db.selectFrom('project_index').selectAll().execute()
    const ordered = await old.db
      .selectFrom('project_accepted_result_index')
      .selectAll()
      .orderBy('layer_id')
      .execute()
    const priorMigrations = (
      await sql`SELECT * FROM schema_migrations ORDER BY name`.execute(old.db)
    ).rows
    await assert.rejects(
      old.db
        .insertInto('project_accepted_result_index')
        .values({ ...rows[0], layer_id: randomUUID(), output_width: 1 })
        .execute(),
      /CHECK constraint failed/,
    )
    prepared = true
    return { legacyMigrations, priorMigrations, project, projectKey, root, rows: ordered }
  } finally {
    await old.close()
    if (!prepared) {
      await rm(root, { force: true, recursive: true })
    }
  }
}

test('history geometry migration preserves every legacy result byte and seek index across reopen, admits 1px world output and retains constraints/cascade', async () => {
  const f = await fixture()
  try {
    const upgraded = openAppDatabase(f.root, migrations)
    try {
      assert.deepEqual(
        await upgraded.db
          .selectFrom('project_accepted_result_index')
          .selectAll()
          .orderBy('layer_id')
          .execute(),
        f.rows,
      )
      assert.deepEqual(
        await upgraded.db.selectFrom('project_index').selectAll().execute(),
        f.project,
      )
      assert.deepEqual(
        (
          await sql`SELECT * FROM schema_migrations WHERE name < ${migrationName} ORDER BY name`.execute(
            upgraded.db,
          )
        ).rows,
        f.priorMigrations,
      )
      assert.equal(
        (
          await upgraded.db
            .selectFrom('app_metadata')
            .select('value')
            .where('key', '=', 'unrelated')
            .executeTakeFirstOrThrow()
        ).value,
        'exact\nbytes',
      )
      const indexes = (
        await sql<{
          name: string
          sql: string
        }>`SELECT name, sql FROM sqlite_master WHERE type='index' AND name='idx_project_accepted_result_catalog_order'`.execute(
          upgraded.db,
        )
      ).rows
      assert.equal(indexes.length, 1)
      assert.match(indexes[0].sql, /accepted_at DESC, local_project_key ASC, layer_id ASC/)
      for (const [width, height] of [
        [1, 1],
        [7, 5],
        [2048, 2048],
      ]) {
        await upgraded.db
          .insertInto('project_accepted_result_index')
          .values({
            ...f.rows[0],
            layer_id: randomUUID(),
            output_height: height,
            output_width: width,
          })
          .execute()
      }
      for (const changes of [
        { output_width: 0 },
        { output_height: 2049 },
        { output_width: 1.5 },
        { actual_seed: -1 },
        { asset_bytes: 0 },
        { model_file_sha256: 'g'.repeat(64) },
      ]) {
        await assert.rejects(
          upgraded.db
            .insertInto('project_accepted_result_index')
            .values({ ...f.rows[0], layer_id: randomUUID(), ...changes })
            .execute(),
          /CHECK constraint failed|cannot store REAL/,
        )
      }
      await assert.rejects(
        upgraded.db
          .insertInto('project_accepted_result_index')
          .values({
            ...f.rows[0],
            layer_id: randomUUID(),
            local_project_key: `project-v1-${'f'.repeat(64)}`,
          })
          .execute(),
        /FOREIGN KEY constraint failed/,
      )
      assert.equal((await sql`PRAGMA foreign_key_check`.execute(upgraded.db)).rows.length, 0)
    } finally {
      await upgraded.close()
    }
    const reopened = openAppDatabase(f.root, migrations)
    try {
      assert.equal(
        (await reopened.db.selectFrom('project_accepted_result_index').selectAll().execute())
          .length,
        5,
      )
      await reopened.db
        .deleteFrom('project_index')
        .where('local_project_key', '=', f.projectKey)
        .execute()
      assert.equal(
        (await reopened.db.selectFrom('project_accepted_result_index').selectAll().execute())
          .length,
        0,
      )
    } finally {
      await reopened.close()
    }
  } finally {
    await rm(f.root, { force: true, recursive: true })
  }
})

test('a failed history table rebuild rolls back its rows, index and installed migration identity before a successful retry', async () => {
  const f = await fixture()
  const faultyMigrations = path.join(f.root, 'faulty-migrations')
  try {
    await cp(migrations, faultyMigrations, { recursive: true })
    const target = path.join(faultyMigrations, migrationName)
    await writeFile(
      target,
      `${await readFile(target, 'utf8')}\nSELECT * FROM deliberate_missing_history_table;\n`,
    )
    assert.throws(
      () => openAppDatabase(f.root, faultyMigrations),
      /deliberate_missing_history_table/,
    )
    const legacy = openAppDatabase(f.root, f.legacyMigrations)
    try {
      assert.deepEqual(
        await legacy.db
          .selectFrom('project_accepted_result_index')
          .selectAll()
          .orderBy('layer_id')
          .execute(),
        f.rows,
      )
      assert.deepEqual(
        (await sql`SELECT * FROM schema_migrations ORDER BY name`.execute(legacy.db)).rows,
        f.priorMigrations,
      )
      assert.equal(
        (
          await sql`SELECT * FROM sqlite_master WHERE name='idx_project_accepted_result_catalog_order'`.execute(
            legacy.db,
          )
        ).rows.length,
        1,
      )
      await assert.rejects(
        legacy.db
          .insertInto('project_accepted_result_index')
          .values({ ...f.rows[0], layer_id: randomUUID(), output_width: 1 })
          .execute(),
        /CHECK constraint failed/,
      )
    } finally {
      await legacy.close()
    }
    const restored = openAppDatabase(f.root, migrations)
    await restored.close()
  } finally {
    await rm(f.root, { force: true, recursive: true })
  }
})
