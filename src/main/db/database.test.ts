import Database from 'better-sqlite3'
import { sql } from 'kysely'
import assert from 'node:assert/strict'
import {
  chmodSync,
  cpSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
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
    const synchronous = await sql<{ synchronous: number }>`PRAGMA synchronous`.execute(first.db)
    assert.equal(synchronous.rows[0]?.synchronous, 2)
    await first.db.insertInto('app_metadata').values({ key: 'probe', value: 'saved' }).execute()
    assert.equal(statSync(`${first.filePath}-wal`).mode & 0o777, 0o600)
    assert.equal(statSync(`${first.filePath}-shm`).mode & 0o777, 0o600)
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
    assert.equal(countRows(sqlite, 'SELECT count(*) AS count FROM schema_migrations'), 9)
    assert.equal(statSync(root).mode & 0o777, 0o700)
    assert.equal(statSync(path.join(root, 'database')).mode & 0o777, 0o700)
    assert.equal(statSync(first.filePath).mode & 0o777, 0o600)
    assert.throws(() =>
      sqlite.prepare('INSERT INTO app_metadata VALUES (?, ?)').run('invalid', Buffer.from([1])),
    )
    const overrideInsert = sqlite.prepare(
      'INSERT INTO checkpoint_prediction_override (sha256, size_bytes, prediction_type, updated_at) VALUES (?, ?, ?, ?)',
    )
    assert.throws(() => overrideInsert.run('g'.repeat(64), 1, 'epsilon', '2026-09-28T00:00:00Z'))
    assert.throws(() => overrideInsert.run('a'.repeat(64), 0, 'epsilon', '2026-09-28T00:00:00Z'))
    assert.throws(() => overrideInsert.run('a'.repeat(64), 1, 'unknown', '2026-09-28T00:00:00Z'))
    sqlite.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('existing shared app data root, database directory and file become private on reopen', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-db-private-'))
  try {
    const first = openAppDatabase(root, sourceMigrations)
    await first.db
      .insertInto('app_metadata')
      .values({ key: 'secret', value: 'frozen prompt' })
      .execute()
    await first.close()
    const directory = path.join(root, 'database')
    chmodSync(root, 0o775)
    chmodSync(directory, 0o775)
    chmodSync(first.filePath, 0o644)

    const reopened = openAppDatabase(root, sourceMigrations)
    assert.equal(statSync(root).mode & 0o777, 0o700)
    assert.equal(statSync(directory).mode & 0o777, 0o700)
    assert.equal(statSync(first.filePath).mode & 0o777, 0o600)
    assert.equal(
      (
        await reopened.db
          .selectFrom('app_metadata')
          .select('value')
          .where('key', '=', 'secret')
          .executeTakeFirstOrThrow()
      ).value,
      'frozen prompt',
    )
    await reopened.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('a symlinked app data root uses canonical private storage', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-db-data-alias-'))
  try {
    const actual = path.join(root, 'actual-data')
    const alias = path.join(root, 'data-alias')
    mkdirSync(actual)
    symlinkSync(actual, alias)
    const database = openAppDatabase(alias, sourceMigrations)
    assert.equal(database.filePath, path.join(actual, 'database', 'app.sqlite'))
    assert.equal(statSync(actual).mode & 0o777, 0o700)
    assert.equal(statSync(path.join(actual, 'database')).mode & 0o777, 0o700)
    await database.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('database bootstrap refuses symlinks and multiply linked SQLite files', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-db-unsafe-'))
  try {
    const outside = path.join(root, 'outside')
    mkdirSync(outside)
    symlinkSync(outside, path.join(root, 'database'))
    assert.throws(
      () => openAppDatabase(root, sourceMigrations),
      /Invalid application database directory/,
    )
    rmSync(path.join(root, 'database'))

    const first = openAppDatabase(root, sourceMigrations)
    await first.close()
    const moved = path.join(outside, 'app.sqlite')
    renameSync(first.filePath, moved)
    symlinkSync(moved, first.filePath)
    assert.throws(
      () => openAppDatabase(root, sourceMigrations),
      /Invalid application database file/,
    )
    rmSync(first.filePath)
    renameSync(moved, first.filePath)

    const walSentinel = path.join(outside, 'wal-sentinel')
    writeFileSync(walSentinel, 'unrelated file')
    rmSync(`${first.filePath}-wal`, { force: true })
    symlinkSync(walSentinel, `${first.filePath}-wal`)
    assert.throws(
      () => openAppDatabase(root, sourceMigrations),
      /Invalid application database file/,
    )
    assert.equal(readFileSync(walSentinel, 'utf8'), 'unrelated file')
    rmSync(`${first.filePath}-wal`)

    const hardlink = path.join(outside, 'app-hardlink.sqlite')
    linkSync(first.filePath, hardlink)
    assert.throws(
      () => openAppDatabase(root, sourceMigrations),
      /Invalid application database file/,
    )
    rmSync(hardlink)
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
    assert.equal(countRows(sqlite, 'SELECT count(*) AS count FROM schema_migrations'), 9)
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
