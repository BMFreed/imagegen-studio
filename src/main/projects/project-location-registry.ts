import { isProjectDocumentId } from '../../shared/projects/project-generation-actions.js'

import type Database from 'better-sqlite3'
import type { Kysely } from 'kysely'

import { randomBytes } from 'node:crypto'
import path from 'node:path'

import type { DB } from '../db/database.types.js'

import { ProjectIdentityError, rawPathDerivedProjectRecoveryKey } from './project-identity.js'

interface Binding {
  canonicalPath: string
  documentId: string
  localProjectKey: string
}
interface Snapshot {
  bindings: Binding[]
  retiredKeys: Set<string>
  tablePresent: boolean
}
interface Owner {
  group: Group
  sqlite: Database.Database
}
interface Group {
  failed: boolean
  filePath: string
  owners: Set<Kysely<DB>>
  snapshot: Snapshot
}

const groups = new Map<string, Group>()
const owners = new WeakMap<Kysely<DB>, Owner>()
let activePaths = new Map<string, Binding>()
let activeKeys = new Map<string, Binding>()
let retiredKeys = new Set<string>()

/**
 * Invoke keeps an image's stable name while repointing its location. This synchronous projection
 * adapts that record lookup for existing Main key validators; SQLite remains the authority.
 */
export function attachProjectLocationRegistry(
  db: Kysely<DB>,
  sqlite: Database.Database,
  canonicalDatabaseFile: string,
): () => void {
  if (owners.has(db) || !isCanonical(canonicalDatabaseFile)) {
    throw unavailable('The Project identity registry owner is invalid.')
  }
  const existing = groups.get(canonicalDatabaseFile)
  let snapshot: Snapshot
  let candidate: Group
  let projected: ReturnType<typeof project>
  try {
    snapshot = readSnapshot(sqlite)
    if (existing?.snapshot.tablePresent && !snapshot.tablePresent) {
      throw unavailable('The authoritative Project identity table is missing.')
    }
    candidate = existing
      ? { ...existing, failed: false, snapshot }
      : { failed: false, filePath: canonicalDatabaseFile, owners: new Set(), snapshot }
    projected = project(candidate)
  } catch (error) {
    // A failed different profile never affects the valid one. A failed secondary read of the
    // SAME DB means its live cached snapshot can no longer authorize identity lookups either.
    if (existing) {
      existing.failed = true
    }
    throw error
  }
  // No failed/partial owner is published; a rejected secondary bootstrap cannot steal a lease.
  const group = existing ?? candidate
  group.snapshot = snapshot
  group.failed = false
  group.owners.add(db)
  groups.set(canonicalDatabaseFile, group)
  owners.set(db, { group, sqlite })
  publish(projected)
  let released = false
  return () => {
    if (released) {
      return
    }
    released = true
    owners.delete(db)
    group.owners.delete(db)
    if (group.owners.size === 0) {
      groups.delete(group.filePath)
      publish(project())
    }
  }
}

/** Validate a draft repoint inside its transaction without publishing uncommitted identity. */
export function assertProjectLocationRegistryCompatible(db: Kysely<DB>): void {
  const owner = requireOwner(db)
  const snapshot = readSnapshot(owner.sqlite)
  if (owner.group.snapshot.tablePresent && !snapshot.tablePresent) {
    throw unavailable('The authoritative Project identity table is missing.')
  }
  // The same precommit projection used by ensureProjectLocationIdentity; do not publish a draft.
  project({ ...owner.group, failed: false, snapshot })
}

/** Call synchronously after a committed relocation transaction, before releasing admission. */
export function refreshProjectLocationRegistry(db: Kysely<DB>): void {
  const owner = requireOwner(db)
  try {
    const snapshot = readSnapshot(owner.sqlite)
    if (owner.group.snapshot.tablePresent && !snapshot.tablePresent) {
      throw unavailable('The authoritative Project identity table is missing.')
    }
    const projected = project({ ...owner.group, failed: false, snapshot })
    owner.group.snapshot = snapshot
    owner.group.failed = false
    publish(projected)
  } catch (error) {
    // SQL may already have committed a repoint. A stale in-memory snapshot is not authority.
    owner.group.failed = true
    throw error
  }
}

/**
 * Called after validating the actual package. Most legacy paths keep their derived key without a
 * row. A reused original filename gets a distinct durable binding instead of the moved key.
 */
export async function ensureProjectLocationIdentity(
  db: Kysely<DB>,
  canonicalPath: string,
  documentId: string,
): Promise<string> {
  assertProjectPath(canonicalPath)
  if (!isProjectDocumentId(documentId)) {
    throw unavailable('The Project document identity is invalid.')
  }
  const owner = requireOwner(db)
  let tablePresent: boolean
  try {
    tablePresent = hasIdentityTables(owner.sqlite)
  } catch (error) {
    owner.group.failed = true
    throw error
  }
  if (!tablePresent) {
    if (owner.group.snapshot.tablePresent) {
      owner.group.failed = true
      throw unavailable('The authoritative Project identity table is missing.')
    }
    const derived = rawPathDerivedProjectRecoveryKey(canonicalPath)
    if (resolveProjectLocationKey(canonicalPath, derived) !== derived) {
      throw unavailable('Active application databases disagree about a Project location.')
    }
    return derived
  }
  const key = await db.transaction().execute(async (transaction) => {
    const current = await transaction
      .selectFrom('project_identity_binding')
      .selectAll()
      .where('canonical_path', '=', canonicalPath)
      .executeTakeFirst()
    if (current) {
      const binding = parseBinding(current)
      if (binding.documentId !== documentId) {
        throw unavailable('Another Project document replaced this registered location.')
      }
      return binding.localProjectKey
    }
    const derived = rawPathDerivedProjectRecoveryKey(canonicalPath)
    const relocated = await transaction
      .selectFrom('project_identity_binding')
      .selectAll()
      .where('local_project_key', '=', derived)
      .executeTakeFirst()
    const retired = await transaction
      .selectFrom('project_identity_retired_key')
      .select('local_project_key')
      .where('local_project_key', '=', derived)
      .executeTakeFirst()
    if (!relocated && !retired) {
      const global = activePaths.get(canonicalPath)
      if (
        (global && global.documentId !== documentId) ||
        resolveProjectLocationKey(canonicalPath, derived) !== derived
      ) {
        throw unavailable('Active application databases disagree about a Project location.')
      }
      return derived
    }
    if (relocated) {
      parseBinding(relocated)
    }
    if (retired) {
      parseRetiredKey(retired)
    }
    const replacement = `project-v1-${randomBytes(32).toString('hex')}`
    await transaction
      .insertInto('project_identity_binding')
      .values({
        canonical_path: canonicalPath,
        document_id: documentId,
        local_project_key: replacement,
      })
      .execute()
    // Validate other live DB owners before commit; the SQL transaction rolls back a conflict.
    project({ ...owner.group, failed: false, snapshot: readSnapshot(owner.sqlite) })
    return replacement
  })
  refreshProjectLocationRegistry(db)
  return key
}

/** Pure sync lookup for existing consumers. It never follows a historical pathname alias. */
export function resolveProjectLocationKey(canonicalPath: string, derivedKey: string): string {
  assertHealthyRegistry()
  const binding = activePaths.get(canonicalPath)
  if (binding) {
    return binding.localProjectKey
  }
  if (retiredKeys.has(derivedKey)) {
    throw unavailable(
      'This pathname used a retired Project identity. Refresh Home to identify its current file.',
    )
  }
  const elsewhere = activeKeys.get(derivedKey)
  if (elsewhere && elsewhere.canonicalPath !== canonicalPath) {
    throw unavailable(
      'This filename belonged to a relocated Project. Refresh Home to identify its current file.',
    )
  }
  return derivedKey
}

/** A corrupt old-name occupant has no trusted document identity and cannot inherit a moved key. */
export function hasRelocatedKeyCollision(canonicalPath: string): boolean {
  assertProjectPath(canonicalPath)
  assertHealthyRegistry()
  if (activePaths.has(canonicalPath)) {
    return false
  }
  const derived = rawPathDerivedProjectRecoveryKey(canonicalPath)
  const relocated = activeKeys.get(derived)
  return (
    retiredKeys.has(derived) ||
    (relocated !== undefined && relocated.canonicalPath !== canonicalPath)
  )
}

function assertHealthyRegistry(): void {
  for (const group of groups.values()) {
    if (group.failed) {
      throw unavailable(
        'Project location identity could not be verified. Reopen after repairing local storage.',
      )
    }
  }
}

function requireOwner(db: Kysely<DB>): Owner {
  const owner = owners.get(db)
  if (!owner) {
    throw unavailable('The Project identity database is not registered.')
  }
  return owner
}
function tableExists(sqlite: Database.Database, name: string): boolean {
  return (
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
    undefined
  )
}
function hasIdentityTables(sqlite: Database.Database): boolean {
  const bindings = tableExists(sqlite, 'project_identity_binding')
  const retired = tableExists(sqlite, 'project_identity_retired_key')
  if (bindings && retired) {
    return true
  }
  const installed = sqlite
    .prepare("SELECT 1 FROM schema_migrations WHERE name GLOB '0028_*' LIMIT 1")
    .get()
  if (bindings || retired || installed) {
    throw unavailable('The authoritative Project identity tables are incomplete.')
  }
  return false
}
function readSnapshot(sqlite: Database.Database): Snapshot {
  if (!hasIdentityTables(sqlite)) {
    return { bindings: [], retiredKeys: new Set(), tablePresent: false }
  }
  const rows: unknown[] = sqlite
    .prepare('SELECT local_project_key, canonical_path, document_id FROM project_identity_binding')
    .all()
  const retiredRows: unknown[] = sqlite
    .prepare('SELECT local_project_key FROM project_identity_retired_key')
    .all()
  return {
    bindings: rows.map(parseBinding),
    retiredKeys: new Set(retiredRows.map(parseRetiredKey)),
    tablePresent: true,
  }
}
function parseRetiredKey(row: unknown): string {
  if (
    !row ||
    typeof row !== 'object' ||
    Array.isArray(row) ||
    typeof (row as Record<string, unknown>).local_project_key !== 'string' ||
    !/^project-v1-[a-f0-9]{64}$/.test((row as { local_project_key: string }).local_project_key)
  ) {
    throw unavailable('A retired Project identity record is invalid.')
  }
  return (row as { local_project_key: string }).local_project_key
}
function parseBinding(row: unknown): Binding {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw unavailable('The Project identity record is invalid.')
  }
  const value = row as Record<string, unknown>
  if (
    typeof value.local_project_key !== 'string' ||
    !/^project-v1-[a-f0-9]{64}$/.test(value.local_project_key) ||
    typeof value.canonical_path !== 'string' ||
    !isProjectDocumentId(value.document_id)
  ) {
    throw unavailable('The Project identity record is invalid.')
  }
  assertProjectPath(value.canonical_path)
  return {
    canonicalPath: value.canonical_path,
    documentId: value.document_id,
    localProjectKey: value.local_project_key,
  }
}
function isCanonical(value: string): boolean {
  return Boolean(
    value && !value.includes('\0') && path.isAbsolute(value) && path.normalize(value) === value,
  )
}
function assertProjectPath(value: string): void {
  if (
    typeof value !== 'string' ||
    !isCanonical(value) ||
    path.extname(value).toLowerCase() !== '.igs'
  ) {
    throw unavailable('The Project location is invalid.')
  }
}
function sameBinding(a: Binding, b: Binding): boolean {
  return (
    a.canonicalPath === b.canonicalPath &&
    a.localProjectKey === b.localProjectKey &&
    a.documentId === b.documentId
  )
}
function project(replacement?: Group): {
  keys: Map<string, Binding>
  paths: Map<string, Binding>
  retired: Set<string>
} {
  const paths = new Map<string, Binding>()
  const keys = new Map<string, Binding>()
  const retired = new Set<string>()
  const snapshots = [...groups.values()].filter((group) => group.filePath !== replacement?.filePath)
  if (replacement) {
    snapshots.push(replacement)
  }
  for (const group of snapshots) {
    for (const key of group.snapshot.retiredKeys) {
      retired.add(key)
    }
  }
  for (const group of snapshots) {
    for (const binding of group.snapshot.bindings) {
      const pathOwner = paths.get(binding.canonicalPath)
      const keyOwner = keys.get(binding.localProjectKey)
      if (
        retired.has(binding.localProjectKey) ||
        (pathOwner && !sameBinding(pathOwner, binding)) ||
        (keyOwner && !sameBinding(keyOwner, binding))
      ) {
        throw unavailable('Active application databases disagree about a Project location.')
      }
      paths.set(binding.canonicalPath, binding)
      keys.set(binding.localProjectKey, binding)
    }
  }
  return { keys, paths, retired }
}
function publish(snapshot: {
  keys: Map<string, Binding>
  paths: Map<string, Binding>
  retired: Set<string>
}): void {
  activeKeys = snapshot.keys
  activePaths = snapshot.paths
  retiredKeys = snapshot.retired
}
function unavailable(message: string): ProjectIdentityError {
  return new ProjectIdentityError('PROJECT_PATH_UNAVAILABLE', message)
}
