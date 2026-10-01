import type { Stats } from 'node:fs'

import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { createHash } from 'node:crypto'
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs'
import path from 'node:path'

import type { DB } from './database.types.js'

export interface AppDatabase {
  close: () => Promise<void>
  db: Kysely<DB>
  filePath: string
}

export function openAppDatabase(dataRoot: string, migrationsDir: string): AppDatabase {
  const databaseDir = path.join(canonicalOwnedDataRoot(dataRoot), 'database')
  ensurePrivateDatabaseDirectory(databaseDir)
  const filePath = path.join(databaseDir, 'app.sqlite')
  const existing = inspectPrivateSqliteFiles(filePath)
  if (!existing.has('')) {
    createPrivateSqliteFile(filePath)
  }
  const identities = inspectPrivateSqliteFiles(filePath)
  const sqlite = new Database(filePath, { fileMustExist: true })

  try {
    inspectPrivateSqliteFiles(filePath, identities)
    sqlite.pragma('journal_mode = WAL')
    // Candidate manifests reach disk before queue completion and the seed cursor. Do not let a
    // different SQLite build's default weaken the durability of that second commit boundary.
    sqlite.pragma('synchronous = FULL')
    sqlite.pragma('foreign_keys = ON')
    applySqlMigrations(sqlite, migrationsDir)
    // SQLite creates WAL/SHM with the private main file's mode. Metadata checks must not open
    // and close these files: POSIX close can release the live driver's process-wide locks.
    inspectPrivateSqliteFiles(filePath, identities)
  } catch (error) {
    sqlite.close()
    throw error
  }

  const db = new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }) })
  return { close: () => db.destroy(), db, filePath }
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
function createPrivateSqliteFile(filePath: string): void {
  let descriptor: number
  try {
    descriptor = openSync(
      filePath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return
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
  } finally {
    closeSync(descriptor)
  }
}

function applySqlMigrations(sqlite: Database.Database, migrationsDir: string): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `)

  const files = readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort()
  const installed = new Map(
    (
      sqlite.prepare('SELECT name, sha256 FROM schema_migrations').all() as {
        name: string
        sha256: string
      }[]
    ).map((row) => [row.name, row.sha256]),
  )

  for (const name of installed.keys()) {
    if (!files.includes(name)) {
      throw new Error(`Missing installed database migration: ${name}`)
    }
  }

  for (const name of files) {
    const sql = readFileSync(path.join(migrationsDir, name), 'utf8')
    const sha256 = createHash('sha256').update(sql).digest('hex')
    const oldHash = installed.get(name)
    if (oldHash && oldHash !== sha256) {
      throw new Error(`Database migration changed after installation: ${name}`)
    }
    if (oldHash) {
      continue
    }

    sqlite.transaction(() => {
      sqlite.exec(sql)
      sqlite
        .prepare('INSERT INTO schema_migrations (name, sha256, applied_at) VALUES (?, ?, ?)')
        .run(name, sha256, new Date().toISOString())
    })()
  }
}
