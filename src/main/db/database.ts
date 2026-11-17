import type { Stats } from 'node:fs'

import Database from 'better-sqlite3'
import { Kysely, sql, SqliteDialect } from 'kysely'
import { createHash } from 'node:crypto'
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
} from 'node:fs'
import path from 'node:path'

import type { DB } from './database.types.js'

import { attachProjectLocationRegistry } from '../projects/project-location-registry.js'

export interface AppDatabase {
  close: () => Promise<void>
  db: Kysely<DB>
  filePath: string
}

/** Same applied name/hash inventory used by migration admission, on the existing connection. */
export async function readAppliedSqlMigrations(
  database: Pick<AppDatabase, 'db'>,
): Promise<readonly Readonly<{ name: string; sha256: string }>[]> {
  const result = await sql<{
    name: string
    sha256: string
  }>`SELECT name, sha256 FROM schema_migrations ORDER BY name`.execute(database.db)
  return Object.freeze(
    result.rows.map((row) => Object.freeze({ name: row.name, sha256: row.sha256 })),
  )
}

/** Invoke startup.init_database: await the online backup before any services can start. */
export async function initializeAppDatabase(
  dataRoot: string,
  migrationsDir: string,
): Promise<AppDatabase> {
  const prepared = prepareAppDatabase(dataRoot, migrationsDir)
  let backupPath: string | undefined
  try {
    if (!prepared.freshlyCreated && needsMigration(prepared.plan)) {
      backupPath = await backupBeforeMigration(prepared.sqlite, prepared.filePath)
      // Log before SQL: even a process crash during migration leaves the selected backup named.
      console.warn(`Updating application database. Pre-upgrade backup: ${backupPath}`)
    }
    inspectPrivateSqliteFiles(prepared.filePath, prepared.identities)
    applySqlMigrations(prepared.sqlite, prepared.plan)
    return finishAppDatabase(prepared)
  } catch (error) {
    if (prepared.sqlite.open) {
      prepared.sqlite.close()
    }
    if (backupPath) {
      throw new Error(
        `Application database upgrade failed. Earlier migrations in this attempt may have committed. Pre-upgrade backup: ${backupPath}. ${restoreGuidance(prepared.filePath)} ${error instanceof Error ? error.message : 'Unknown migration error.'}`,
        { cause: error },
      )
    }
    throw error
  }
}

/** Invoke open_migrated_database: an existing pending database must use startup's backup. */
export function openAppDatabase(dataRoot: string, migrationsDir: string): AppDatabase {
  const prepared = prepareAppDatabase(dataRoot, migrationsDir)
  try {
    if (!prepared.freshlyCreated && needsMigration(prepared.plan)) {
      throw new Error(
        'Application database upgrade requires a startup backup. Start ImageGen Studio or await initializeAppDatabase before opening this database.',
      )
    }
    applySqlMigrations(prepared.sqlite, prepared.plan)
    return finishAppDatabase(prepared)
  } catch (error) {
    if (prepared.sqlite.open) {
      prepared.sqlite.close()
    }
    throw error
  }
}

function prepareAppDatabase(dataRoot: string, migrationsDir: string) {
  const databaseDir = path.join(canonicalOwnedDataRoot(dataRoot), 'database')
  ensurePrivateDatabaseDirectory(databaseDir)
  const filePath = path.join(databaseDir, 'app.sqlite')
  const existing = inspectPrivateSqliteFiles(filePath)
  const freshlyCreated = !existing.has('') && createPrivateSqliteFile(filePath)
  const identities = inspectPrivateSqliteFiles(filePath)
  const sqlite = new Database(filePath, { fileMustExist: true })

  try {
    inspectPrivateSqliteFiles(filePath, identities)
    sqlite.pragma('journal_mode = WAL')
    // Candidate manifests reach disk before queue completion and the seed cursor. Do not let a
    // different SQLite build's default weaken the durability of that second commit boundary.
    sqlite.pragma('synchronous = FULL')
    sqlite.pragma('foreign_keys = ON')
    const plan = planSqlMigrations(sqlite, migrationsDir, filePath)
    return { filePath, freshlyCreated, identities, plan, sqlite }
  } catch (error) {
    sqlite.close()
    throw error
  }
}

function finishAppDatabase({
  filePath,
  identities,
  sqlite,
}: ReturnType<typeof prepareAppDatabase>): AppDatabase {
  // Never open/close live SQLite inodes: that can release another connection's POSIX locks.
  inspectPrivateSqliteFiles(filePath, identities)
  const db = new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }) })
  let releaseIdentityRegistry: () => void
  try {
    // Load authoritative locations before callers can scan, validate queue rows or inspect recovery.
    releaseIdentityRegistry = attachProjectLocationRegistry(db, sqlite, filePath)
  } catch (error) {
    sqlite.close()
    throw error
  }
  let closing: Promise<void> | undefined
  return {
    close: () => {
      closing ??= db.destroy().then(() => releaseIdentityRegistry())
      return closing
    },
    db,
    filePath,
  }
}

function canonicalOwnedDataRoot(dataRoot: string): string {
  if (!path.isAbsolute(dataRoot) || path.resolve(dataRoot) !== dataRoot) {
    throw new Error('Invalid application data root')
  }
  const canonical = realpathSync(dataRoot)
  let descriptor: number
  try {
    descriptor = openSync(
      canonical,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
  } catch {
    throw new Error('Invalid application data root')
  }
  try {
    const entry = fstatSync(descriptor)
    const atPath = lstatSync(canonical)
    if (
      !entry.isDirectory() ||
      atPath.isSymbolicLink() ||
      entry.dev !== atPath.dev ||
      entry.ino !== atPath.ino ||
      (process.getuid?.() !== undefined && entry.uid !== process.getuid())
    ) {
      throw new Error('Invalid application data root')
    }
    if ((entry.mode & 0o077) !== 0) {
      fchmodSync(descriptor, 0o700)
    }
  } finally {
    closeSync(descriptor)
  }
  return canonical
}

function ensurePrivateDatabaseDirectory(databaseDir: string): void {
  if (!path.isAbsolute(databaseDir) || path.resolve(databaseDir) !== databaseDir) {
    throw new Error('Invalid application database directory')
  }
  mkdirSync(databaseDir, { mode: 0o700, recursive: true })
  let descriptor: number
  try {
    descriptor = openSync(
      databaseDir,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
  } catch {
    throw new Error('Invalid application database directory')
  }
  try {
    const entry = fstatSync(descriptor)
    const atPath = lstatSync(databaseDir)
    if (
      !entry.isDirectory() ||
      atPath.isSymbolicLink() ||
      entry.dev !== atPath.dev ||
      entry.ino !== atPath.ino ||
      realpathSync(databaseDir) !== databaseDir ||
      (process.getuid?.() !== undefined && entry.uid !== process.getuid())
    ) {
      throw new Error('Invalid application database directory')
    }
    if ((entry.mode & 0o077) !== 0) {
      fchmodSync(descriptor, 0o700)
    }
  } finally {
    closeSync(descriptor)
  }
}

/** Never open/close an existing SQLite inode, including before opening another connection. */
function inspectPrivateSqliteFiles(
  filePath: string,
  identities?: ReadonlyMap<string, Stats>,
): Map<string, Stats> {
  const inspected = new Map<string, Stats>()
  for (const suffix of ['', '-wal', '-shm']) {
    const current = `${filePath}${suffix}`
    let entry: Stats
    try {
      entry = lstatSync(current)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        if (suffix === '' && identities?.has(suffix)) {
          throw new Error(`Invalid application database file: ${path.basename(current)}`)
        }
        continue
      }
      throw new Error(`Invalid application database file: ${path.basename(current)}`)
    }
    // WAL/SHM can be reconciled by SQLite during a cold open; the main file cannot change.
    const before = suffix === '' ? identities?.get(suffix) : undefined
    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      entry.nlink !== 1 ||
      (process.getuid?.() !== undefined && entry.uid !== process.getuid()) ||
      (before && (entry.dev !== before.dev || entry.ino !== before.ino))
    ) {
      throw new Error(`Invalid application database file: ${path.basename(current)}`)
    }
    if ((entry.mode & 0o777) !== 0o600) {
      throw new Error(
        `Invalid application database permissions: ${path.basename(current)}. Close the app and repair this owned regular file to mode 0600 before reopening.`,
      )
    }
    inspected.set(suffix, entry)
  }
  return inspected
}

/** The sole raw file descriptor belongs to a newly created inode and closes before SQLite. */
function createPrivateSqliteFile(filePath: string): boolean {
  let descriptor: number
  try {
    descriptor = openSync(
      filePath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return false
    }
    throw error
  }
  try {
    fchmodSync(descriptor, 0o600)
    const created = fstatSync(descriptor)
    const atPath = lstatSync(filePath)
    if (!atPath.isFile() || created.dev !== atPath.dev || created.ino !== atPath.ino) {
      throw new Error('Invalid application database file: app.sqlite')
    }
    return true
  } finally {
    closeSync(descriptor)
  }
}

function planSqlMigrations(sqlite: Database.Database, migrationsDir: string, filePath: string) {
  const files = readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort()
  const bootstrap = !sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get()
  const installed = new Map(
    (bootstrap
      ? []
      : (sqlite.prepare('SELECT name, sha256 FROM schema_migrations').all() as {
          name: string
          sha256: string
        }[])
    ).map((row) => [row.name, row.sha256]),
  )

  for (const name of installed.keys()) {
    if (!files.includes(name)) {
      throw new Error(
        `Missing installed database migration: ${name}. Run the matching or newer application. ${restoreGuidance(filePath)}`,
      )
    }
  }

  const pending: { name: string; sha256: string; sql: string }[] = []
  for (const name of files) {
    const migrationSql = readFileSync(path.join(migrationsDir, name), 'utf8')
    const sha256 = createHash('sha256').update(migrationSql).digest('hex')
    const oldHash = installed.get(name)
    if (oldHash !== undefined && oldHash !== sha256) {
      throw new Error(
        `Database migration changed after installation: ${name}. ${restoreGuidance(filePath)}`,
      )
    }
    if (oldHash !== undefined) {
      continue
    }

    pending.push({ name, sha256, sql: migrationSql })
  }
  return { bootstrap, pending }
}

function needsMigration(plan: ReturnType<typeof planSqlMigrations>): boolean {
  return plan.bootstrap || plan.pending.length > 0
}

function applySqlMigrations(
  sqlite: Database.Database,
  plan: ReturnType<typeof planSqlMigrations>,
): void {
  if (plan.bootstrap) {
    sqlite.exec(`CREATE TABLE schema_migrations (
      name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL
    ) STRICT;`)
  }
  for (const { name, sha256, sql: migrationSql } of plan.pending) {
    sqlite.transaction(() => {
      sqlite.exec(migrationSql)
      sqlite
        .prepare('INSERT INTO schema_migrations (name, sha256, applied_at) VALUES (?, ?, ?)')
        .run(name, sha256, new Date().toISOString())
    })()
  }
}

function restoreGuidance(filePath: string): string {
  return `Close all application processes before manual recovery. Preserve the current app.sqlite with its -wal and -shm files together. Copy a specifically chosen pre-upgrade backup from ${path.dirname(filePath)} (app_backup_<date>-<time>[-N].db); do not automatically choose the latest. Database restoration does not restore Project or resource files.`
}

/** Invoke Database.backup/_backup_db: reserve, online backup, preserve successful copies. */
async function backupBeforeMigration(sqlite: Database.Database, filePath: string): Promise<string> {
  if (sqlite.inTransaction) {
    throw new Error('Cannot back up a database inside a transaction.')
  }
  const directory = path.dirname(filePath)
  const directoryIdentity = lstatSync(directory)
  const timestamp = new Date().toISOString().replaceAll(/[-:]/g, '').replace('T', '-').slice(0, 15)
  for (let attempt = 0; ; attempt += 1) {
    const destination = path.join(
      directory,
      `app_backup_${timestamp}${attempt ? `-${attempt}` : ''}.db`,
    )
    let descriptor: number
    try {
      descriptor = openSync(
        destination,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        continue
      }
      throw new Error(
        `Application database backup failed; no migrations were applied. ${restoreGuidance(filePath)}`,
        { cause: error },
      )
    }
    const created = fstatSync(descriptor)
    const isOwned = () => {
      const current = lstatSync(destination)
      return (
        current.isFile() &&
        current.nlink === 1 &&
        current.dev === created.dev &&
        current.ino === created.ino
      )
    }
    try {
      fchmodSync(descriptor, 0o600)
      // Do not let an orphaned companion at this otherwise new name affect SQLite's destination.
      for (const suffix of ['-wal', '-shm', '-journal']) {
        try {
          lstatSync(`${destination}${suffix}`)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            continue
          }
          throw error
        }
        throw new Error('Backup destination has an existing SQLite companion.')
      }
      await sqlite.backup(destination)
      const currentDirectory = lstatSync(directory)
      if (
        !isOwned() ||
        (fstatSync(descriptor).mode & 0o777) !== 0o600 ||
        !currentDirectory.isDirectory() ||
        (currentDirectory.mode & 0o777) !== 0o700 ||
        currentDirectory.dev !== directoryIdentity.dev ||
        currentDirectory.ino !== directoryIdentity.ino ||
        realpathSync(directory) !== directory
      ) {
        throw new Error('Backup destination identity changed.')
      }
      fsyncSync(descriptor)
      const directoryFd = openSync(
        directory,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      )
      try {
        fsyncSync(directoryFd)
      } finally {
        closeSync(directoryFd)
      }
      return destination
    } catch (error) {
      // The native backup closes its own destination connection before resolving/rejecting.
      // Never delete another inode or infer ownership of an unexpected companion.
      try {
        if (isOwned()) {
          unlinkSync(destination)
        }
      } catch {
        /* Preserve unknown paths. */
      }
      throw new Error(
        `Application database backup failed at ${destination}; no migrations were applied. Unexpected companion files or changed paths are preserved for inspection. ${restoreGuidance(filePath)}`,
        { cause: error },
      )
    } finally {
      // This is the newly reserved backup inode, never the live source/main/WAL/SHM inode.
      closeSync(descriptor)
    }
  }
}
