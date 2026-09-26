import Database from 'better-sqlite3'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from './database.js'

const sourceMigrations = path.resolve('src/main/db/migrations')

function countRows(sqlite: Database.Database, query: string): number {
  const row = sqlite.prepare<[], { count: number }>(query).get()
  assert.ok(row)
  return row.count
}

test('SQLite bootstrap applies strict migrations and persists data across reopen', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-db-'))
  try {
    const first = openAppDatabase(root, sourceMigrations)
    await first.db.insertInto('app_metadata').values({ key: 'probe', value: 'saved' }).execute()
    await first.close()

    const second = openAppDatabase(root, sourceMigrations)
    const row = await second.db
      .selectFrom('app_metadata')
      .select('value')
      .where('key', '=', 'probe')
      .executeTakeFirstOrThrow()
    assert.equal(row.value, 'saved')
    await second.close()

    const sqlite = new Database(first.filePath)
    assert.equal(sqlite.pragma('foreign_keys', { simple: true }), 1)
    assert.equal(sqlite.pragma('journal_mode', { simple: true }), 'wal')
    assert.equal(countRows(sqlite, 'SELECT count(*) AS count FROM schema_migrations'), 4)
    assert.throws(() =>
      sqlite.prepare('INSERT INTO app_metadata VALUES (?, ?)').run('invalid', Buffer.from([1])),
    )
    sqlite.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('a failed SQL migration rolls back without changing the previous schema', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-db-fail-'))
  const migrations = path.join(root, 'migrations')
  cpSync(sourceMigrations, migrations, { recursive: true })
  try {
    const first = openAppDatabase(root, migrations)
    await first.close()
    writeFileSync(
      path.join(migrations, '0005_broken.sql'),
      'CREATE TABLE partial_table (value TEXT) STRICT; INVALID SQL;',
    )

    assert.throws(() => openAppDatabase(root, migrations))
    const sqlite = new Database(first.filePath)
    assert.equal(
      countRows(sqlite, "SELECT count(*) AS count FROM sqlite_master WHERE name = 'partial_table'"),
      0,
    )
    assert.equal(countRows(sqlite, 'SELECT count(*) AS count FROM schema_migrations'), 4)
    sqlite.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('reopening refuses an installed migration whose SQL changed on disk', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-db-changed-'))
  const migrations = path.join(root, 'migrations')
  cpSync(sourceMigrations, migrations, { recursive: true })
  const migrationPath = path.join(migrations, '0001_app_metadata.sql')
  const originalSql = readFileSync(migrationPath, 'utf8')
  try {
    const first = openAppDatabase(root, migrations)
    await first.db.insertInto('app_metadata').values({ key: 'probe', value: 'saved' }).execute()
    await first.close()

    writeFileSync(migrationPath, `${originalSql}\n-- changed after installation\n`)
    assert.throws(
      () => openAppDatabase(root, migrations),
      /Database migration changed after installation: 0001_app_metadata\.sql/,
    )

    // A refused reopen must leave the previous database usable once the installed SQL returns.
    writeFileSync(migrationPath, originalSql)
    const reopened = openAppDatabase(root, migrations)
    const row = await reopened.db
      .selectFrom('app_metadata')
      .select('value')
      .where('key', '=', 'probe')
      .executeTakeFirstOrThrow()
    assert.equal(row.value, 'saved')
    await reopened.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('reopening refuses a missing installed migration without discarding the database', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-db-missing-'))
  const migrations = path.join(root, 'migrations')
  cpSync(sourceMigrations, migrations, { recursive: true })
  const migrationName = '0001_app_metadata.sql'
  const migrationPath = path.join(migrations, migrationName)
  try {
    const first = openAppDatabase(root, migrations)
    await first.db.insertInto('app_metadata').values({ key: 'probe', value: 'saved' }).execute()
    await first.close()

    rmSync(migrationPath)
    assert.throws(
      () => openAppDatabase(root, migrations),
      /Missing installed database migration: 0001_app_metadata\.sql/,
    )

    cpSync(path.join(sourceMigrations, migrationName), migrationPath)
    const reopened = openAppDatabase(root, migrations)
    const row = await reopened.db
      .selectFrom('app_metadata')
      .select('value')
      .where('key', '=', 'probe')
      .executeTakeFirstOrThrow()
    assert.equal(row.value, 'saved')
    await reopened.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})
