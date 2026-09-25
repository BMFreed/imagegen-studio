import Database from 'better-sqlite3'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
    assert.equal(countRows(sqlite, 'SELECT count(*) AS count FROM schema_migrations'), 3)
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
      path.join(migrations, '0004_broken.sql'),
      'CREATE TABLE partial_table (value TEXT) STRICT; INVALID SQL;',
    )

    assert.throws(() => openAppDatabase(root, migrations))
    const sqlite = new Database(first.filePath)
    assert.equal(
      countRows(sqlite, "SELECT count(*) AS count FROM sqlite_master WHERE name = 'partial_table'"),
      0,
    )
    assert.equal(countRows(sqlite, 'SELECT count(*) AS count FROM schema_migrations'), 3)
    sqlite.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})
