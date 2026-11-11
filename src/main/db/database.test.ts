import Database from 'better-sqlite3'
import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  linkSync,
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
import { fileURLToPath } from 'node:url'

import type {
  DatabaseOwnerRequest,
  DatabaseOwnerResponse,
} from './fixtures/database-process-owner.js'

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
    assert.equal(countRows(sqlite, 'SELECT count(*) AS count FROM schema_migrations'), 29)
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
    const noiseInsert = sqlite.prepare(
      'INSERT INTO checkpoint_noise_profile_override (sha256, size_bytes, rescale_betas_zero_snr, timestep_spacing, updated_at) VALUES (?, ?, ?, ?, ?)',
    )
    assert.throws(() => noiseInsert.run('g'.repeat(64), 1, 0, 'leading', '2026-10-07T00:00:00Z'))
    assert.throws(() => noiseInsert.run('a'.repeat(64), 0, 0, 'leading', '2026-10-07T00:00:00Z'))
    assert.throws(() => noiseInsert.run('a'.repeat(64), 1, 2, 'leading', '2026-10-07T00:00:00Z'))
    assert.throws(() => noiseInsert.run('a'.repeat(64), 1, 0, 'custom', '2026-10-07T00:00:00Z'))
    noiseInsert.run('a'.repeat(64), 1, null, null, '2026-10-07T00:00:00Z')
    sqlite.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('shared directories become private; unsafe SQLite permissions preserve bytes until explicit repair', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-db-private-'))
  try {
    const first = openAppDatabase(root, sourceMigrations)
    await first.db
      .insertInto('app_metadata')
      .values({ key: 'secret', value: 'frozen prompt' })
      .execute()
    await first.close()
    const before = readFileSync(first.filePath)
    const directory = path.join(root, 'database')
    chmodSync(root, 0o775)
    chmodSync(directory, 0o775)
    chmodSync(first.filePath, 0o644)

    assert.throws(
      () => openAppDatabase(root, sourceMigrations),
      /Invalid application database permissions: app\.sqlite.*Close the app.*0600/,
    )
    assert.equal(statSync(root).mode & 0o777, 0o700)
    assert.equal(statSync(directory).mode & 0o777, 0o700)
    assert.equal(statSync(first.filePath).mode & 0o777, 0o644)
    assert.deepEqual(readFileSync(first.filePath), before)
    chmodSync(first.filePath, 0o600)
    const reopened = openAppDatabase(root, sourceMigrations)
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

type OwnerReply = Exclude<DatabaseOwnerResponse, { ready: true }>
type OwnerCommand =
  | Omit<Extract<DatabaseOwnerRequest, { operation: 'write' }>, 'id'>
  | { operation: 'close' | 'keys' }

/** A separate process owns the actual bootstrap and acknowledged SQLite reads/writes. */
async function startDatabaseOwner(root: string) {
  const child = fork(
    fileURLToPath(new URL('./fixtures/database-process-owner.ts', import.meta.url)),
    [root, sourceMigrations],
    {
      execArgv: ['--import', import.meta.resolve('tsx')],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  )
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })
  let resolveReady: () => void = () => undefined
  let rejectReady: (error: Error) => void = () => undefined
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  const pending = new Map<
    number,
    { reject: (error: Error) => void; resolve: (reply: OwnerReply) => void }
  >()
  child.on('message', (message: DatabaseOwnerResponse) => {
    if ('ready' in message) {
      resolveReady()
      return
    }
    const request = pending.get(message.id)
    pending.delete(message.id)
    request?.resolve(message)
  })
  child.on('error', (error) => {
    rejectReady(error)
    for (const request of pending.values()) {
      request.reject(error)
    }
    pending.clear()
  })
  const exited = new Promise<void>((resolve) => {
    child.once('exit', (code, signal) => {
      const error = new Error(
        `Database owner exited (${String(code)}, ${String(signal)}): ${stderr}`,
      )
      rejectReady(error)
      for (const request of pending.values()) {
        request.reject(error)
      }
      pending.clear()
      resolve()
    })
  })
  // A broken child/IPC protocol must fail this harness and clean up, not hang the whole suite.
  // This is a test-operation ceiling, not a SQLite busy timeout or product recovery policy.
  async function bounded<T>(operation: Promise<T>, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(() => {
            child.kill('SIGKILL')
            reject(new Error(`Database owner timed out while ${label}: ${stderr}`))
          }, 10_000)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }
  let requestId = 0
  function request(command: OwnerCommand): Promise<OwnerReply> {
    const response = new Promise<OwnerReply>((resolve, reject) => {
      const id = ++requestId
      pending.set(id, { reject, resolve })
      child.send({ ...command, id } satisfies DatabaseOwnerRequest, (error) => {
        if (error) {
          pending.delete(id)
          reject(error)
        }
      })
    })
    return bounded(response, `acknowledging ${command.operation}`)
  }
  try {
    await bounded(ready, 'becoming ready')
  } catch (error) {
    child.kill('SIGKILL')
    await bounded(exited, 'exiting after startup failure')
    throw error
  }
  return {
    dispose: async () => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          assert.equal((await request({ operation: 'close' })).ok, true)
        } catch (error) {
          child.kill('SIGKILL')
          await bounded(exited, 'exiting after shutdown failure')
          throw error
        }
      }
      await bounded(exited, 'exiting after acknowledged close')
    },
    request,
  }
}

test('a live database owner sees external committed writes across secondary close and reopen', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-db-lock-visibility-'))
  let secondary: ReturnType<typeof openAppDatabase> | undefined
  let owner: Awaited<ReturnType<typeof startDatabaseOwner>> | undefined
  try {
    secondary = openAppDatabase(root, sourceMigrations)
    await secondary.db
      .insertInto('app_metadata')
      .values({ key: 'lock-visibility-baseline', value: 'private durable probe' })
      .execute()
    await secondary.close()
    secondary = undefined
    owner = await startDatabaseOwner(root)
    const filePath = path.join(root, 'database', 'app.sqlite')
    const initialWal = statSync(`${filePath}-wal`).ino
    const initialShm = statSync(`${filePath}-shm`).ino
    secondary = openAppDatabase(root, sourceMigrations)
    await secondary.db
      .insertInto('app_metadata')
      .values({ key: 'lock-visibility-first', value: 'private durable probe' })
      .execute()
    assert.deepEqual(await owner.request({ operation: 'keys' }), {
      id: 1,
      keys: ['lock-visibility-baseline', 'lock-visibility-first'],
      ok: true,
    })
    await secondary.close()
    secondary = undefined
    const sidecarsAfterClose = {
      shm: statSync(`${filePath}-shm`, { throwIfNoEntry: false })?.ino,
      wal: statSync(`${filePath}-wal`, { throwIfNoEntry: false })?.ino,
    }
    secondary = openAppDatabase(root, sourceMigrations)
    await secondary.db
      .insertInto('app_metadata')
      .values({ key: 'lock-visibility-second', value: 'private durable probe' })
      .execute()
    assert.deepEqual(await owner.request({ operation: 'keys' }), {
      id: 2,
      keys: ['lock-visibility-baseline', 'lock-visibility-first', 'lock-visibility-second'],
      ok: true,
    })
    // Metadata explains retained visibility; the committed data assertion above is the invariant.
    assert.deepEqual(sidecarsAfterClose, { shm: initialShm, wal: initialWal })
    await owner.dispose()
    owner = undefined
    await secondary.close()
    secondary = undefined
    const reopened = openAppDatabase(root, sourceMigrations)
    try {
      const keys = await reopened.db
        .selectFrom('app_metadata')
        .select('key')
        .orderBy('key')
        .execute()
      assert.deepEqual(
        keys.map((row) => row.key),
        ['lock-visibility-baseline', 'lock-visibility-first', 'lock-visibility-second'],
      )
    } finally {
      await reopened.close()
    }
  } finally {
    await owner?.dispose()
    await secondary?.close()
    rmSync(root, { force: true, recursive: true })
  }
})

test('an unsafe overlapping bootstrap cannot unlock an existing same-process writer', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-db-active-lock-'))
  const owner = openAppDatabase(root, sourceMigrations)
  let witness: Awaited<ReturnType<typeof startDatabaseOwner>> | undefined
  let transactionOpen = false
  try {
    witness = await startDatabaseOwner(root)
    await sql`BEGIN IMMEDIATE`.execute(owner.db)
    transactionOpen = true
    chmodSync(`${owner.filePath}-shm`, 0o644)
    assert.throws(
      () => openAppDatabase(root, sourceMigrations),
      /Invalid application database permissions: app\.sqlite-shm/,
    )
    chmodSync(`${owner.filePath}-shm`, 0o600)
    const blocked = await witness.request({ key: 'lock-visibility-blocked', operation: 'write' })
    assert.equal(blocked.ok, false)
    assert.equal(!blocked.ok && blocked.code, 'SQLITE_BUSY')
    await sql`ROLLBACK`.execute(owner.db)
    transactionOpen = false
    assert.equal(
      (await witness.request({ key: 'lock-visibility-after-unlock', operation: 'write' })).ok,
      true,
    )
    const keys = await owner.db.selectFrom('app_metadata').select('key').orderBy('key').execute()
    assert.deepEqual(
      keys.map((row) => row.key),
      ['lock-visibility-after-unlock'],
    )
  } finally {
    if (transactionOpen) {
      await sql`ROLLBACK`.execute(owner.db)
    }
    await witness?.dispose()
    await owner.close()
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
    assert.equal(countRows(sqlite, 'SELECT count(*) AS count FROM schema_migrations'), 29)
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

test('img2img migration preserves all old queue rows and expands only the operation constraint', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-db-img2img-'))
  const legacyMigrations = path.join(root, 'legacy-migrations')
  const img2imgMigrations = path.join(root, 'img2img-migrations')
  for (const [target, before] of [
    [legacyMigrations, '0013'],
    [img2imgMigrations, '0014'],
  ]) {
    mkdirSync(target)
    for (const name of readdirSync(sourceMigrations)) {
      if (name.endsWith('.sql') && name < before) {
        cpSync(path.join(sourceMigrations, name), path.join(target, name))
      }
    }
  }
  try {
    const before = openAppDatabase(root, legacyMigrations)
    const rows = ['pending', 'running', 'completed', 'failed', 'canceled'].map((status, index) => ({
      batch_id: 'existing-batch',
      canonical_project_path: '/existing/project.igs',
      created_at: '2026-10-01T00:00:00.000Z',
      document_id: 'existing-document',
      document_revision: 'existing-revision',
      error_code: status === 'failed' ? 'FAILED' : null,
      error_message: status === 'failed' ? 'Existing failure' : null,
      finished_at: ['canceled', 'completed', 'failed'].includes(status)
        ? '2026-10-02T00:00:00.000Z'
        : null,
      frozen_payload_json: `{"legacy":${index}}`,
      id: `legacy-${index}`,
      local_project_key: 'existing-project',
      operation: 'illustrious-txt2img',
      staging_session_id: 'existing-session',
      started_at: status === 'pending' ? null : '2026-10-01T00:00:00.000Z',
      status,
      status_sequence: index,
      updated_at: '2026-10-02T00:00:00.000Z',
    }))
    await before.db.insertInto('generation_queue_item').values(rows).execute()
    await before.close()
    const after = openAppDatabase(root, img2imgMigrations)
    assert.deepEqual(
      await after.db.selectFrom('generation_queue_item').selectAll().orderBy('id').execute(),
      rows,
    )
    await after.db
      .insertInto('generation_queue_item')
      .values({ ...rows[0], id: 'opaque-job', operation: 'illustrious-img2img' })
      .execute()
    await assert.rejects(
      after.db
        .insertInto('generation_queue_item')
        .values({ ...rows[0], id: 'unsupported-job', operation: 'anima-img2img' })
        .execute(),
      /CHECK constraint failed/,
    )
    const indexes = await sql<{
      name: string
    }>`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'generation_queue_item' ORDER BY name`.execute(
      after.db,
    )
    assert.deepEqual(
      indexes.rows.map((row) => row.name),
      [
        'idx_generation_queue_project',
        'idx_generation_queue_status',
        'sqlite_autoindex_generation_queue_item_1',
      ],
    )
    await after.close()
    const reopened = openAppDatabase(root, img2imgMigrations)
    assert.equal(
      (await reopened.db.selectFrom('generation_queue_item').selectAll().execute()).length,
      6,
    )
    await reopened.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})
