import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type { DB } from './database.types.js'

export interface AppDatabase {
  close: () => Promise<void>
  db: Kysely<DB>
  filePath: string
}

export function openAppDatabase(dataRoot: string, migrationsDir: string): AppDatabase {
  const databaseDir = path.join(dataRoot, 'database')
  mkdirSync(databaseDir, { recursive: true })
  const filePath = path.join(databaseDir, 'app.sqlite')
  const sqlite = new Database(filePath)

  try {
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    applySqlMigrations(sqlite, migrationsDir)
  } catch (error) {
    sqlite.close()
    throw error
  }

  const db = new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }) })
  return { close: () => db.destroy(), db, filePath }
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
