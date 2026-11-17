import Database from 'better-sqlite3'
import assert from 'node:assert/strict'
import {
  chmodSync,
  copyFileSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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

import { initializeAppDatabase, openAppDatabase } from './database.js'

const sourceMigrations = path.resolve('src/main/db/migrations')
const identityMigration = '0030_model_reference_identity.sql'

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-db-backup-'))
  const migrations = path.join(root, 'migrations')
  cpSync(sourceMigrations, migrations, { recursive: true })
  return { filePath: path.join(root, 'database', 'app.sqlite'), migrations, root }
}

function backupFiles(root: string): string[] {
  return readdirSync(path.join(root, 'database'))
    .filter((name) => /^app_backup_\d{8}-\d{6}(?:-\d+)?\.db$/.test(name))
    .sort()
    .map((name) => path.join(root, 'database', name))
}

function snapshot(sqlite: Database.Database) {
  const schema = sqlite
    .prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name')
    .all() as { name: string; sql: string | null; tbl_name: string; type: string }[]
  return {
    schema,
    tables: Object.fromEntries(
      schema
        .filter((entry) => entry.type === 'table')
        .map(({ name }) => {
          const quoted = `"${name.replaceAll('"', '""')}"`
          const rows = sqlite.prepare(`SELECT * FROM ${quoted}`).all()
          return [
            name,
            rows.sort((a, b) => String(JSON.stringify(a)).localeCompare(String(JSON.stringify(b)))),
          ]
        }),
    ),
  }
}

function readSnapshot(filename: string) {
  const sqlite = new Database(filename, { fileMustExist: true, readonly: true })
  try {
    assert.equal(sqlite.pragma('integrity_check', { simple: true }), 'ok')
    return snapshot(sqlite)
  } finally {
    sqlite.close()
  }
}

function tableExists(sqlite: Database.Database, name: string): boolean {
  return Boolean(
    sqlite.prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?').get('table', name),
  )
}

async function createHistorical29(root: string, migrations: string): Promise<void> {
  const oldMigrations = path.join(root, 'migrations-29')
  cpSync(migrations, oldMigrations, { recursive: true })
  rmSync(path.join(oldMigrations, identityMigration))
  // Only fixture preparation uses the old set. The action under test is the current initializer.
  const previous = openAppDatabase(root, oldMigrations)
  try {
    await previous.db
      .insertInto('app_metadata')
      .values({ key: 'backup-sentinel', value: 'before upgrade' })
      .execute()
  } finally {
    await previous.close()
  }
}

test('new database and up-to-date startup do not create migration backups', async () => {
  const f = fixture()
  try {
    const created = await initializeAppDatabase(f.root, f.migrations)
    await created.close()
    assert.deepEqual(backupFiles(f.root), [])

    const reopened = await initializeAppDatabase(f.root, f.migrations)
    await reopened.close()
    const synchronous = openAppDatabase(f.root, f.migrations)
    await synchronous.close()
    assert.deepEqual(backupFiles(f.root), [])
  } finally {
    rmSync(f.root, { force: true, recursive: true })
  }
})

test('actual 29 to 30 upgrade keeps an independent complete pre-migration database', async () => {
  const f = fixture()
  try {
    await createHistorical29(f.root, f.migrations)
    const before = readSnapshot(f.filePath)
    assert.equal(before.tables.schema_migrations?.length, 29)
    assert.ok(!Object.hasOwn(before.tables, 'model_reference_identity'))

    assert.throws(() => openAppDatabase(f.root, f.migrations), /migration|backup/i)
    assert.deepEqual(readSnapshot(f.filePath), before)
    assert.deepEqual(backupFiles(f.root), [])

    const upgraded = await initializeAppDatabase(f.root, f.migrations)
    await upgraded.close()
    const backups = backupFiles(f.root)
    assert.equal(backups.length, 1)
    const backup = backups[0]
    const entry = statSync(backup)
    assert.equal(entry.mode & 0o777, 0o600)
    assert.equal(entry.nlink, 1)
    assert.notEqual(entry.ino, statSync(f.filePath).ino)
    assert.deepEqual(readSnapshot(backup), before)

    const after = readSnapshot(f.filePath)
    assert.equal(after.tables.schema_migrations?.length, 30)
    assert.deepEqual(after.tables.model_reference_identity, [])
    assert.deepEqual(after.tables.app_metadata, before.tables.app_metadata)
    for (const [name, rows] of Object.entries(before.tables)) {
      if (name !== 'schema_migrations') {
        assert.deepEqual(after.tables[name], rows, `Preserve historical table ${name}`)
      }
    }
    const preservedBackup = readFileSync(backup)
    const noOp = await initializeAppDatabase(f.root, f.migrations)
    await noOp.close()
    assert.deepEqual(backupFiles(f.root), backups)
    assert.ok(readFileSync(backup).equals(preservedBackup), 'No-op startup changes no backup bytes')
  } finally {
    rmSync(f.root, { force: true, recursive: true })
  }
})

test('pre-migration backup includes a committed row still held only in the live WAL', async () => {
  const f = fixture()
  let writer: Database.Database | undefined
  let upgraded: Awaited<ReturnType<typeof initializeAppDatabase>> | undefined
  try {
    await createHistorical29(f.root, f.migrations)
    writer = new Database(f.filePath, { fileMustExist: true })
    writer.pragma('wal_autocheckpoint = 0')
    writer.pragma('wal_checkpoint(TRUNCATE)')
    const mainBefore = statSync(f.filePath, { bigint: true })
    writer
      .prepare('INSERT INTO app_metadata (key, value) VALUES (?, ?)')
      .run('wal-only-sentinel', 'committed before backup')
    const mainAfter = statSync(f.filePath, { bigint: true })
    assert.equal(mainAfter.size, mainBefore.size)
    assert.equal(mainAfter.mtimeNs, mainBefore.mtimeNs)
    assert.ok(statSync(`${f.filePath}-wal`).size > 0)

    // Keep the writer alive: closing it here could checkpoint and hide a main-file-copy bug.
    upgraded = await initializeAppDatabase(f.root, f.migrations)
    const [backup] = backupFiles(f.root)
    assert.ok(backup)
    const saved = new Database(backup, { fileMustExist: true, readonly: true })
    try {
      assert.deepEqual(
        saved.prepare('SELECT value FROM app_metadata WHERE key = ?').get('wal-only-sentinel'),
        { value: 'committed before backup' },
      )
      assert.equal(tableExists(saved, 'model_reference_identity'), false)
      const applied = saved
        .prepare<[], { n: number }>('SELECT count(*) AS n FROM schema_migrations')
        .get()
      assert.ok(applied)
      assert.equal(applied.n, 29)
    } finally {
      saved.close()
    }
  } finally {
    await upgraded?.close()
    writer?.close()
    rmSync(f.root, { force: true, recursive: true })
  }
})

test('two upgrades in the same second preserve the first backup and number the next', async (t) => {
  const f = fixture()
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-17T12:00:00.000Z') })
  try {
    await createHistorical29(f.root, f.migrations)
    const first = await initializeAppDatabase(f.root, f.migrations)
    await first.close()
    const [original] = backupFiles(f.root)
    assert.ok(original)
    const originalBytes = readFileSync(original)
    writeFileSync(
      path.join(f.migrations, '0031_backup_collision_probe.sql'),
      "INSERT INTO app_metadata (key, value) VALUES ('second-upgrade', 'new value');",
    )
    const second = await initializeAppDatabase(f.root, f.migrations)
    await second.close()
    const expectedNumbered = original.replace(/\.db$/, '-1.db')
    assert.deepEqual(backupFiles(f.root), [original, expectedNumbered].sort())
    assert.ok(
      readFileSync(original).equals(originalBytes),
      'Earlier backup remains byte-for-byte intact',
    )
    assert.equal(readSnapshot(original).tables.schema_migrations?.length, 29)
    assert.equal(readSnapshot(expectedNumbered).tables.schema_migrations?.length, 30)
  } finally {
    t.mock.timers.reset()
    rmSync(f.root, { force: true, recursive: true })
  }
})

test('all installed hashes are admitted before any earlier pending SQL or backup', async () => {
  const f = fixture()
  try {
    const initial = openAppDatabase(f.root, f.migrations)
    await initial.db
      .insertInto('app_metadata')
      .values({ key: 'must-survive-preflight', value: 'untouched' })
      .execute()
    await initial.close()
    const before = readSnapshot(f.filePath)
    writeFileSync(
      path.join(f.migrations, '0000_early_destructive_probe.sql'),
      'DELETE FROM app_metadata; CREATE TABLE must_not_exist (id INTEGER PRIMARY KEY) STRICT;',
    )
    const late = path.join(f.migrations, identityMigration)
    writeFileSync(late, `${readFileSync(late, 'utf8')}\n-- changed installed migration\n`)

    await assert.rejects(
      initializeAppDatabase(f.root, f.migrations),
      /Database migration changed after installation: 0030_model_reference_identity\.sql/,
    )
    assert.deepEqual(readSnapshot(f.filePath), before)
    assert.deepEqual(backupFiles(f.root), [])
  } finally {
    rmSync(f.root, { force: true, recursive: true })
  }
})

test('a later migration failure retains the chosen original backup without silently restoring partial progress', async () => {
  const f = fixture()
  const restoredRoot = mkdtempSync(path.join(os.tmpdir(), 'igs-db-restored-copy-'))
  const wrongRoot = mkdtempSync(path.join(os.tmpdir(), 'igs-db-wrong-backup-'))
  try {
    const initial = openAppDatabase(f.root, f.migrations)
    await initial.db
      .insertInto('app_metadata')
      .values({ key: 'restore-sentinel', value: 'original state' })
      .execute()
    await initial.close()
    const before = readSnapshot(f.filePath)
    const neighborPath = path.join(f.root, 'neighbor.igs')
    const neighborBytes = Buffer.from('unrelated owned file must remain unchanged')
    writeFileSync(neighborPath, neighborBytes)
    writeFileSync(
      path.join(f.migrations, '0031_partial_upgrade_probe.sql'),
      "UPDATE app_metadata SET value = 'committed first migration' WHERE key = 'restore-sentinel'; CREATE TABLE committed_upgrade (id INTEGER PRIMARY KEY) STRICT;",
    )
    writeFileSync(
      path.join(f.migrations, '0032_failed_upgrade_probe.sql'),
      "UPDATE app_metadata SET value = 'must roll back' WHERE key = 'restore-sentinel'; CREATE TABLE rolled_back_upgrade (id INTEGER PRIMARY KEY) STRICT; INVALID SQL;",
    )

    let firstFailure: unknown
    await assert.rejects(initializeAppDatabase(f.root, f.migrations), (error: unknown) => {
      firstFailure = error
      return error instanceof Error
    })
    const [original] = backupFiles(f.root)
    assert.ok(original)
    assert.ok(firstFailure instanceof Error)
    assert.ok(firstFailure.message.includes(original), 'Failure names the exact pre-upgrade backup')
    assert.match(firstFailure.message, /partial|earlier.{0,40}migration|committed/i)
    assert.deepEqual(readSnapshot(original), before)
    const originalBytes = readFileSync(original)

    const partial = readSnapshot(f.filePath)
    assert.equal(partial.tables.schema_migrations?.length, 31)
    assert.ok(Object.hasOwn(partial.tables, 'committed_upgrade'))
    assert.ok(!Object.hasOwn(partial.tables, 'rolled_back_upgrade'))
    assert.deepEqual(partial.tables.app_metadata, [
      { key: 'restore-sentinel', value: 'committed first migration' },
    ])
    await assert.rejects(initializeAppDatabase(f.root, f.migrations))
    const backups = backupFiles(f.root)
    assert.equal(backups.length, 2)
    const retryBackup = backups.find((filename) => filename !== original)
    assert.ok(retryBackup)
    assert.deepEqual(readSnapshot(retryBackup), partial)

    // Exercise the documented copy choice, never replacing active data or consuming the backup.
    mkdirSync(path.join(restoredRoot, 'database'), { mode: 0o700 })
    copyFileSync(original, path.join(restoredRoot, 'database', 'app.sqlite'))
    const restored = openAppDatabase(restoredRoot, sourceMigrations)
    await restored.close()
    assert.deepEqual(readSnapshot(path.join(restoredRoot, 'database', 'app.sqlite')), before)
    assert.deepEqual(backupFiles(restoredRoot), [])

    // The most recent retry copy is a partially upgraded schema, unsuitable for the old version.
    mkdirSync(path.join(wrongRoot, 'database'), { mode: 0o700 })
    copyFileSync(retryBackup, path.join(wrongRoot, 'database', 'app.sqlite'))
    assert.throws(
      () => openAppDatabase(wrongRoot, sourceMigrations),
      /Missing installed database migration: 0031_partial_upgrade_probe\.sql/,
    )
    assert.deepEqual(readSnapshot(path.join(wrongRoot, 'database', 'app.sqlite')), partial)
    assert.deepEqual(readSnapshot(f.filePath), partial)
    assert.ok(
      readFileSync(original).equals(originalBytes),
      'Chosen backup remains intact after restore',
    )
    assert.ok(readFileSync(neighborPath).equals(neighborBytes), 'Neighboring file remains intact')
  } finally {
    rmSync(wrongRoot, { force: true, recursive: true })
    rmSync(restoredRoot, { force: true, recursive: true })
    rmSync(f.root, { force: true, recursive: true })
  }
})

test('backup failure aborts before SQL, removes its own partial inode and preserves unknown companions', async (t) => {
  const f = fixture()
  let destination: string | undefined
  try {
    const initial = openAppDatabase(f.root, f.migrations)
    await initial.db
      .insertInto('app_metadata')
      .values({ key: 'failed-backup-sentinel', value: 'must remain' })
      .execute()
    await initial.close()
    const before = readSnapshot(f.filePath)
    const earlier = path.join(f.root, 'database', 'app_backup_20000101-000000.db')
    const earlierBytes = Buffer.from('earlier backup must not be removed')
    writeFileSync(earlier, earlierBytes, { mode: 0o600 })
    writeFileSync(
      path.join(f.migrations, '0031_after_backup_failure.sql'),
      'DELETE FROM app_metadata; CREATE TABLE forbidden_after_backup_failure (id INTEGER PRIMARY KEY) STRICT;',
    )
    t.mock.method(Database.prototype, 'backup', async (filename: string) => {
      destination = filename
      assert.equal(statSync(filename).mode & 0o777, 0o600)
      writeFileSync(filename, 'controlled incomplete backup')
      writeFileSync(`${filename}-wal`, 'controlled incomplete backup WAL', { mode: 0o600 })
      writeFileSync(`${filename}-shm`, 'controlled incomplete backup SHM', { mode: 0o600 })
      throw new Error('Controlled backup IO failure')
    })
    await assert.rejects(
      initializeAppDatabase(f.root, f.migrations),
      /backup failed.*no migrations.*companion files.*preserved/i,
    )
    assert.ok(destination)
    assert.deepEqual(
      readdirSync(path.join(f.root, 'database'))
        .filter((name) => name.startsWith('app_backup_'))
        .sort(),
      [
        path.basename(earlier),
        `${path.basename(destination)}-wal`,
        `${path.basename(destination)}-shm`,
      ].sort(),
    )
    assert.equal(readFileSync(`${destination}-wal`, 'utf8'), 'controlled incomplete backup WAL')
    assert.equal(readFileSync(`${destination}-shm`, 'utf8'), 'controlled incomplete backup SHM')
    assert.ok(readFileSync(earlier).equals(earlierBytes), 'Pre-existing backup is untouched')
    assert.deepEqual(readSnapshot(f.filePath), before)
  } finally {
    rmSync(f.root, { force: true, recursive: true })
  }
})

test('an existing database without migration history is backed up before bootstrap metadata is written', async () => {
  const f = fixture()
  try {
    mkdirSync(path.join(f.root, 'database'), { mode: 0o700 })
    const legacy = new Database(f.filePath)
    try {
      legacy.exec(
        "CREATE TABLE preserved_legacy (id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT; INSERT INTO preserved_legacy VALUES (1, 'original unversioned data');",
      )
    } finally {
      legacy.close()
    }
    chmodSync(f.filePath, 0o600)
    const before = readSnapshot(f.filePath)
    assert.ok(!Object.hasOwn(before.tables, 'schema_migrations'))
    const initialized = await initializeAppDatabase(f.root, f.migrations)
    await initialized.close()
    const backups = backupFiles(f.root)
    assert.equal(backups.length, 1)
    assert.deepEqual(readSnapshot(backups[0]), before)
    const after = readSnapshot(f.filePath)
    assert.deepEqual(after.tables.preserved_legacy, before.tables.preserved_legacy)
    assert.equal(after.tables.schema_migrations?.length, 30)
  } finally {
    rmSync(f.root, { force: true, recursive: true })
  }
})

test('empty installed hash refuses before earlier pending SQL or backup', async () => {
  const f = fixture()
  try {
    const initial = openAppDatabase(f.root, f.migrations)
    await initial.db
      .insertInto('app_metadata')
      .values({ key: 'empty-hash-neighbor', value: 'saved' })
      .execute()
    await initial.close()
    const corruptHistory = new Database(f.filePath)
    corruptHistory
      .prepare('UPDATE schema_migrations SET sha256 = ? WHERE name = ?')
      .run('', identityMigration)
    corruptHistory.close()
    const before = readSnapshot(f.filePath)
    writeFileSync(path.join(f.migrations, '0000_pending_probe.sql'), 'DELETE FROM app_metadata;')
    let failure: unknown
    try {
      await initializeAppDatabase(f.root, f.migrations)
    } catch (error) {
      failure = error
    }
    assert.ok(failure instanceof Error)
    assert.deepEqual(
      readSnapshot(f.filePath).tables.app_metadata,
      before.tables.app_metadata,
      'Preflight must preserve saved rows before rejecting an invalid installed hash',
    )
    assert.match(
      failure.message,
      /Database migration changed after installation: 0030_model_reference_identity.sql/,
    )
    assert.deepEqual(readSnapshot(f.filePath), before)
    assert.deepEqual(backupFiles(f.root), [])
  } finally {
    rmSync(f.root, { force: true, recursive: true })
  }
})

test('a replaced backup destination stops SQL and preserves the replacement target', async (t) => {
  const f = fixture()
  try {
    await createHistorical29(f.root, f.migrations)
    const before = readSnapshot(f.filePath)
    const neighbor = path.join(f.root, 'neighbor.bin')
    const neighborBytes = Buffer.from('replacement target must remain unchanged')
    writeFileSync(neighbor, neighborBytes)
    const nativeBackup = Database.prototype.backup
    let replacement: string | undefined
    t.mock.method(
      Database.prototype,
      'backup',
      async function (this: Database.Database, destination: string) {
        const result = await nativeBackup.call(this, destination)
        renameSync(destination, `${destination}.moved`)
        symlinkSync(neighbor, destination)
        replacement = destination
        return result
      },
    )
    await assert.rejects(
      initializeAppDatabase(f.root, f.migrations),
      /backup failed.*no migrations.*changed paths.*preserved/i,
    )
    assert.ok(replacement)
    assert.ok(lstatSync(replacement).isSymbolicLink())
    assert.ok(readFileSync(neighbor).equals(neighborBytes))
    assert.deepEqual(readSnapshot(`${replacement}.moved`), before)
    assert.deepEqual(readSnapshot(f.filePath), before)
  } finally {
    rmSync(f.root, { force: true, recursive: true })
  }
})
