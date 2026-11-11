import { isProjectDocumentId } from '../../shared/projects/project-generation-actions.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'
import { isProjectWorkspaceId } from '../../shared/projects/project-workspaces.js'

import type { Kysely, Transaction } from 'kysely'
import type { BigIntStats } from 'node:fs'

import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readdirSync,
  realpathSync,
  renameSync,
} from 'node:fs'
import { open } from 'node:fs/promises'
import path from 'node:path'

import type { DB } from '../db/database.types.js'
import type { ProjectIndexRecord, ProjectWorkspaceRecord } from './project-index.js'

import { readIgsPackage } from './igs-package.js'
import { localProjectRecoveryKey, refreshProjectLocationRegistry } from './project-identity.js'
import { withProjectPathLock } from './project-path-lock.js'

export interface ProjectRelocationRecord {
  createdAt: string
  destinationPath: string
  documentId: string
  errorMessage: string | null
  localProjectKey: string
  operationId: string
  project: ProjectIndexRecord
  sourceParentWitness: ParentWitness
  sourcePath: string
  sourceSha256: string
  sourceWitness: FileWitness
  sourceWorkspaceId: string
  state: 'moved' | 'moving' | 'planned'
  targetParentWitness: ParentWitness
  targetWorkspaceId: string
}
export type ProjectRelocationResult = { kind: 'moved' } | { kind: 'pending'; message: string }
interface ParentWitness {
  dev: string
  ino: string
}
interface FileWitness extends ParentWitness {
  ctimeNs: string
  mtimeNs: string
  size: string
}
interface StoreOptions {
  afterDatabaseRepoint?: (record: ProjectRelocationRecord) => Promise<void>
  afterRename?: (record: ProjectRelocationRecord) => Promise<void>
  beforeDatabaseRepoint?: (record: ProjectRelocationRecord) => Promise<void>
  /** Causal seam; fresh synchronous source/destination guards follow before rename. */
  beforeFinalFileCheck?: (record: ProjectRelocationRecord) => Promise<void>
  beforeFinalize?: (record: ProjectRelocationRecord) => Promise<void>
}
export class ProjectRelocationStoreError extends Error {
  constructor(
    readonly code: 'PROJECT_MOVE_CONFLICT' | 'PROJECT_MOVE_INVALID' | 'PROJECT_MOVE_PENDING',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectRelocationStoreError'
  }
}

/** Invoke's journal -> filesystem move/fsync -> transactional repoint -> startup recovery. */
export class ProjectRelocationStore {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly options: StoreOptions = {},
  ) {}

  async beginMove(
    project: ProjectIndexRecord,
    sourceWorkspace: ProjectWorkspaceRecord,
    targetWorkspace: ProjectWorkspaceRecord,
    guardSync: () => void,
  ): Promise<ProjectRelocationRecord> {
    project = structuredClone(project)
    sourceWorkspace = structuredClone(sourceWorkspace)
    targetWorkspace = structuredClone(targetWorkspace)
    assertProject(project)
    const documentId = project.documentId
    assertUuid(documentId)
    if (
      !isProjectWorkspaceId(sourceWorkspace.id) ||
      !isProjectWorkspaceId(targetWorkspace.id) ||
      sourceWorkspace.id !== project.workspaceId ||
      sourceWorkspace.id === targetWorkspace.id ||
      path.dirname(project.canonicalPath) !== sourceWorkspace.directoryPath ||
      !canonical(targetWorkspace.directoryPath)
    ) {
      throw invalid()
    }
    if (localProjectRecoveryKey(project.canonicalPath) !== project.localProjectKey) {
      throw invalid()
    }
    const destinationPath = path.join(
      targetWorkspace.directoryPath,
      path.basename(project.canonicalPath),
    )
    return await withMoveLocks(project.canonicalPath, destinationPath, async () => {
      guardSync()
      const sourceParentWitness = parentOf(sourceWorkspace.directoryPath)
      const targetParentWitness = parentOf(targetWorkspace.directoryPath)
      if (sourceParentWitness.dev !== targetParentWitness.dev) {
        throw new ProjectRelocationStoreError(
          'PROJECT_MOVE_INVALID',
          'Move requires both workspaces to be on the same filesystem.',
        )
      }
      assertNoCollision(destinationPath)
      const source = entryNow(project.canonicalPath)
      if (
        !source ||
        !regular(source) ||
        realpathSync(project.canonicalPath) !== project.canonicalPath ||
        fingerprint(witness(source)) !== project.fileFingerprint
      ) {
        throw changed()
      }
      const portable = await readIgsPackage(project.canonicalPath)
      if (
        portable.project.documentId !== project.documentId ||
        portable.project.documentRevision !== project.documentRevision
      ) {
        throw changed()
      }
      const sourceWitness = witness(source)
      if (sourceWitness.dev !== sourceParentWitness.dev) {
        throw invalid()
      }
      const sourceSha256 = await hashChecked(project.canonicalPath, sourceWitness, true)
      guardSync()
      assertParentsNow(
        sourceWorkspace.directoryPath,
        sourceParentWitness,
        targetWorkspace.directoryPath,
        targetParentWitness,
      )
      assertNoCollision(destinationPath)
      if (!sameOriginal(entryNow(project.canonicalPath), sourceWitness)) {
        throw changed()
      }
      const now = new Date().toISOString()
      const record: ProjectRelocationRecord = {
        createdAt: now,
        destinationPath,
        documentId,
        errorMessage: null,
        localProjectKey: project.localProjectKey,
        operationId: randomUUID(),
        project,
        sourceParentWitness,
        sourcePath: project.canonicalPath,
        sourceSha256,
        sourceWitness,
        sourceWorkspaceId: sourceWorkspace.id,
        state: 'planned',
        targetParentWitness,
        targetWorkspaceId: targetWorkspace.id,
      }
      await this.db.transaction().execute(async (transaction) => {
        await assertOperationalRows(transaction, record)
        const existing = await transaction
          .selectFrom('project_relocation')
          .selectAll()
          .where((eb) =>
            eb.or([
              eb('local_project_key', '=', record.localProjectKey),
              eb('source_path', 'in', [record.sourcePath, record.destinationPath]),
              eb('destination_path', 'in', [record.sourcePath, record.destinationPath]),
            ]),
          )
          .execute()
        if (existing.length) {
          throw conflict()
        }
        const indexed = await transaction
          .selectFrom('project_index')
          .selectAll()
          .where('local_project_key', '=', record.localProjectKey)
          .executeTakeFirst()
        if (
          !indexed ||
          indexed.canonical_path !== record.sourcePath ||
          indexed.file_fingerprint !== project.fileFingerprint ||
          indexed.document_id !== record.documentId ||
          indexed.workspace_id !== sourceWorkspace.id ||
          indexed.trashed_at !== null
        ) {
          throw conflict()
        }
        guardSync()
        await transaction.insertInto('project_relocation').values(toRow(record, now)).execute()
        guardSync()
      })
      return record
    })
  }

  async finishMove(
    input: ProjectRelocationRecord,
    guardSync: () => void = () => undefined,
  ): Promise<ProjectRelocationResult> {
    input = structuredClone(input)
    assertKey(input.localProjectKey)
    assertUuid(input.operationId)
    return await withMoveLocks(input.sourcePath, input.destinationPath, async () => {
      const current = await this.get(input.localProjectKey)
      if (!current || !sameAuthority(input, current)) {
        throw conflict()
      }
      const record = current
      try {
        guardSync()
        // Never perform a filesystem effect without rereading positive authority first.
        await this.db
          .transaction()
          .execute((transaction) => assertOperationalRows(transaction, record))
        await this.db
          .updateTable('project_relocation')
          .set({ error_message: null, state: 'moving', updated_at: new Date().toISOString() })
          .where('local_project_key', '=', record.localProjectKey)
          .where('operation_id', '=', record.operationId)
          .execute()
        const fresh = await this.get(record.localProjectKey)
        if (!fresh || !sameAuthority(record, fresh)) {
          throw conflict()
        }
        const source = entryNow(record.sourcePath)
        const destination = entryNow(record.destinationPath)
        if (source && destination) {
          throw changed()
        }
        if (!source && !destination) {
          throw changed()
        }
        if (source) {
          await hashChecked(record.sourcePath, record.sourceWitness, true, record.sourceSha256)
          await this.options.beforeFinalFileCheck?.(record)
          const finalAuthority = await this.get(record.localProjectKey)
          if (!finalAuthority || !sameAuthority(record, finalAuthority)) {
            throw conflict()
          }
          guardSync()
          renameCheckedNow(record)
          await this.options.afterRename?.(record)
        }
        // Destination-only recovery must prove the exact original inode, data and source digest.
        await hashChecked(record.destinationPath, record.sourceWitness, false, record.sourceSha256)
        syncMovedNow(record)
        await this.db
          .updateTable('project_relocation')
          .set({ state: 'moved', updated_at: new Date().toISOString() })
          .where('local_project_key', '=', record.localProjectKey)
          .where('operation_id', '=', record.operationId)
          .execute()
        await this.options.beforeDatabaseRepoint?.(record)
        await hashChecked(record.destinationPath, record.sourceWitness, false, record.sourceSha256)
        const moved = movedWitnessNow(record)
        guardSync()
        await this.db.transaction().execute(async (transaction) => {
          const row = await transaction
            .selectFrom('project_relocation')
            .selectAll()
            .where('local_project_key', '=', record.localProjectKey)
            .executeTakeFirst()
          if (!row || !sameAuthority(record, fromRow(row))) {
            throw conflict()
          }
          await assertOperationalRows(transaction, record)
          guardSync()
          await repoint(transaction, record, moved)
          guardSync()
        })
        refreshProjectLocationRegistry(this.db)
        await this.options.afterDatabaseRepoint?.(record)
        await this.options.beforeFinalize?.(record)
        await hashChecked(record.destinationPath, record.sourceWitness, false, record.sourceSha256)
        movedWitnessNow(record)
        guardSync()
        await this.db.transaction().execute(async (transaction) => {
          const row = await transaction
            .selectFrom('project_relocation')
            .selectAll()
            .where('local_project_key', '=', record.localProjectKey)
            .executeTakeFirst()
          if (!row || !sameAuthority(record, fromRow(row))) {
            throw conflict()
          }
          await assertOperationalRows(transaction, record)
          guardSync()
          await transaction
            .deleteFrom('project_relocation')
            .where('local_project_key', '=', record.localProjectKey)
            .where('operation_id', '=', record.operationId)
            .execute()
        })
        return { kind: 'moved' }
      } catch (error) {
        const message =
          error instanceof ProjectRelocationStoreError
            ? error.message
            : 'Project Move could not finish. Its recovery record was kept; restore access to both workspaces and try again.'
        await this.db
          .updateTable('project_relocation')
          .set({ error_message: message, updated_at: new Date().toISOString() })
          .where('local_project_key', '=', record.localProjectKey)
          .where('operation_id', '=', record.operationId)
          .execute()
          .catch(() => undefined)
        return { kind: 'pending', message }
      }
    })
  }

  async get(projectId: string): Promise<ProjectRelocationRecord | null> {
    assertKey(projectId)
    const row = await this.db
      .selectFrom('project_relocation')
      .selectAll()
      .where('local_project_key', '=', projectId)
      .executeTakeFirst()
    return row ? fromRow(row) : null
  }
  async list(): Promise<ProjectRelocationRecord[]> {
    return (
      await this.db
        .selectFrom('project_relocation')
        .selectAll()
        .orderBy('created_at')
        .orderBy('local_project_key')
        .execute()
    ).map(fromRow)
  }
  async recoverPendingMoves(guardSync?: (record: ProjectRelocationRecord) => void): Promise<void> {
    for (const record of await this.list()) {
      await this.finishMove(record, () => guardSync?.(record))
    }
  }
}

async function assertOperationalRows(
  db: Kysely<DB> | Transaction<DB>,
  record: ProjectRelocationRecord,
): Promise<void> {
  const paths = [record.sourcePath, record.destinationPath]
  const workspaces = await db
    .selectFrom('project_workspace')
    .selectAll()
    .where('id', 'in', [record.sourceWorkspaceId, record.targetWorkspaceId])
    .execute()
  if (
    !workspaces.some(
      (w) =>
        w.id === record.sourceWorkspaceId && w.directory_path === path.dirname(record.sourcePath),
    ) ||
    !workspaces.some(
      (w) =>
        w.id === record.targetWorkspaceId &&
        w.directory_path === path.dirname(record.destinationPath),
    )
  ) {
    throw conflict()
  }
  const lifecycle = await db
    .selectFrom('project_file_lifecycle')
    .select('local_project_key')
    .where((eb) =>
      eb.or([
        eb('local_project_key', '=', record.localProjectKey),
        eb('canonical_path', 'in', paths),
      ]),
    )
    .executeTakeFirst()
  const acceptance = await db
    .selectFrom('generation_acceptance_journal')
    .select('local_project_key')
    .where((eb) =>
      eb.or([
        eb('local_project_key', '=', record.localProjectKey),
        eb('canonical_project_path', 'in', paths),
      ]),
    )
    .executeTakeFirst()
  if (lifecycle || acceptance) {
    throw conflict()
  }
  const queue = await db
    .selectFrom('generation_queue_item')
    .select(['local_project_key', 'canonical_project_path', 'document_id', 'status'])
    .where((eb) =>
      eb.or([
        eb('local_project_key', '=', record.localProjectKey),
        eb('canonical_project_path', 'in', paths),
      ]),
    )
    .execute()
  if (
    queue.some(
      (row) =>
        row.local_project_key !== record.localProjectKey ||
        !paths.includes(row.canonical_project_path) ||
        row.document_id !== record.documentId ||
        !['canceled', 'completed', 'failed'].includes(row.status),
    )
  ) {
    throw conflict()
  }
  const receipts = await db
    .selectFrom('generation_candidate_receipt')
    .select(['local_project_key', 'canonical_project_path', 'status'])
    .where((eb) =>
      eb.or([
        eb('local_project_key', '=', record.localProjectKey),
        eb('canonical_project_path', 'in', paths),
      ]),
    )
    .execute()
  if (
    receipts.some(
      (row) =>
        row.local_project_key !== record.localProjectKey ||
        !paths.includes(row.canonical_project_path) ||
        row.status !== 'completed',
    )
  ) {
    throw conflict()
  }
  const bindings = await db
    .selectFrom('project_identity_binding')
    .selectAll()
    .where((eb) =>
      eb.or([
        eb('local_project_key', '=', record.localProjectKey),
        eb('canonical_path', 'in', paths),
      ]),
    )
    .execute()
  if (
    bindings.some(
      (row) =>
        row.local_project_key !== record.localProjectKey ||
        row.document_id !== record.documentId ||
        !paths.includes(row.canonical_path),
    )
  ) {
    throw conflict()
  }
  const indexed = await db
    .selectFrom('project_index')
    .select(['local_project_key', 'canonical_path', 'document_id', 'trashed_at'])
    .where((eb) =>
      eb.or([
        eb('local_project_key', '=', record.localProjectKey),
        eb('canonical_path', 'in', paths),
      ]),
    )
    .execute()
  if (
    indexed.some(
      (row) =>
        row.local_project_key !== record.localProjectKey ||
        !paths.includes(row.canonical_path) ||
        row.document_id !== record.documentId ||
        row.trashed_at !== null,
    )
  ) {
    throw conflict()
  }
}
async function repoint(
  db: Transaction<DB>,
  record: ProjectRelocationRecord,
  moved: FileWitness,
): Promise<void> {
  await db
    .insertInto('project_identity_binding')
    .values({
      canonical_path: record.destinationPath,
      document_id: record.documentId,
      local_project_key: record.localProjectKey,
    })
    .onConflict((c) =>
      c
        .column('local_project_key')
        .doUpdateSet({ canonical_path: record.destinationPath, document_id: record.documentId }),
    )
    .execute()
  const p = record.project
  const now = new Date().toISOString()
  const values = {
    bbox_height: p.bboxHeight,
    bbox_width: p.bboxWidth,
    canonical_path: record.destinationPath,
    diagnostic_code: null,
    display_name: p.displayName,
    document_id: record.documentId,
    document_revision: p.documentRevision,
    file_fingerprint: fingerprint(moved),
    file_health: 'ready',
    file_mtime_ns: moved.mtimeNs,
    file_size_bytes: Number(moved.size),
    indexed_at: now,
    last_opened_at: p.lastOpenedAt,
    local_project_key: record.localProjectKey,
    preview_status: p.previewStatus,
    preview_thumbnail_sha256: p.thumbnailSha256,
    search_name: p.displayName.normalize('NFKC').toLowerCase(),
    trashed_at: null,
    workspace_id: record.targetWorkspaceId,
  }
  await db
    .insertInto('project_index')
    .values(values)
    .onConflict((c) => c.column('local_project_key').doUpdateSet(values))
    .execute()
  await db
    .updateTable('generation_queue_item')
    .set({ canonical_project_path: record.destinationPath })
    .where('local_project_key', '=', record.localProjectKey)
    .execute()
  await db
    .updateTable('generation_candidate_receipt')
    .set({ canonical_project_path: record.destinationPath })
    .where('local_project_key', '=', record.localProjectKey)
    .execute()
}
async function withMoveLocks<T>(
  source: string,
  destination: string,
  use: () => Promise<T>,
): Promise<T> {
  if (!canonical(source) || !canonical(destination) || source === destination) {
    throw invalid()
  }
  const [first, second] = [source, destination].sort()
  return await withProjectPathLock(first, () => withProjectPathLock(second, use))
}
function canonical(value: unknown): value is string {
  return typeof value === 'string' && path.isAbsolute(value) && path.normalize(value) === value
}
function assertKey(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^project-v1-[a-f0-9]{64}$/.test(value)) {
    throw invalid()
  }
}
function assertUuid(value: unknown): asserts value is string {
  if (!isProjectDocumentId(value)) {
    throw invalid()
  }
}
function assertProject(value: unknown): asserts value is ProjectIndexRecord {
  if (!value || typeof value !== 'object') {
    throw invalid()
  }
  const p = value as ProjectIndexRecord
  assertKey(p.localProjectKey)
  assertUuid(p.documentId)
  assertUuid(p.documentRevision)
  if (
    !canonical(p.canonicalPath) ||
    path.extname(p.canonicalPath).toLowerCase() !== '.igs' ||
    !isProjectWorkspaceId(p.workspaceId) ||
    p.fileHealth !== 'ready' ||
    typeof p.displayName !== 'string' ||
    !p.displayName ||
    Buffer.byteLength(p.displayName) > IGS_SAFETY_CEILINGS.titleBytes ||
    typeof p.fileFingerprint !== 'string' ||
    !/^\d+:\d+:\d+:-?\d+:-?\d+$/.test(p.fileFingerprint) ||
    !Number.isSafeInteger(p.bboxWidth) ||
    !Number.isSafeInteger(p.bboxHeight) ||
    p.bboxWidth! <= 0 ||
    p.bboxHeight! <= 0 ||
    !['empty', 'rendered', 'unavailable'].includes(p.previewStatus ?? '') ||
    !(p.thumbnailSha256 === null || /^[a-f0-9]{64}$/.test(p.thumbnailSha256)) ||
    !(
      p.lastOpenedAt === null ||
      (typeof p.lastOpenedAt === 'string' && Number.isFinite(Date.parse(p.lastOpenedAt)))
    )
  ) {
    throw invalid()
  }
}
function parseWitness(input: string, file: false): ParentWitness
function parseWitness(input: string, file: true): FileWitness
function parseWitness(input: string, file: boolean): FileWitness | ParentWitness {
  if (Buffer.byteLength(input) > 2048) {
    throw invalid()
  }
  const value: unknown = JSON.parse(input)
  if (!value || typeof value !== 'object') {
    throw invalid()
  }
  const o = value as Record<string, unknown>
  if (
    Object.keys(o).sort().join(',') !== (file ? 'ctimeNs,dev,ino,mtimeNs,size' : 'dev,ino') ||
    !unsigned(o.dev) ||
    !unsigned(o.ino) ||
    (file && (!unsigned(o.size) || !signed(o.mtimeNs) || !signed(o.ctimeNs)))
  ) {
    throw invalid()
  }
  return value as FileWitness | ParentWitness
}
function unsigned(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,30}$/.test(value)
}
function signed(value: unknown): value is string {
  return typeof value === 'string' && /^-?\d{1,30}$/.test(value)
}
function fromRow(row: DB['project_relocation']): ProjectRelocationRecord {
  try {
    if (Buffer.byteLength(row.project_json) > IGS_SAFETY_CEILINGS.manifestJsonBytes) {
      throw invalid()
    }
    const project: unknown = JSON.parse(row.project_json)
    assertProject(project)
    const sourceParentWitness = parseWitness(row.source_parent_witness_json, false)
    const targetParentWitness = parseWitness(row.target_parent_witness_json, false)
    const sourceWitness = parseWitness(row.source_witness_json, true)
    assertKey(row.local_project_key)
    assertUuid(row.operation_id)
    assertUuid(row.document_id)
    if (
      !canonical(row.source_path) ||
      !canonical(row.destination_path) ||
      row.source_path === row.destination_path ||
      path.basename(row.source_path) !== path.basename(row.destination_path) ||
      !isProjectWorkspaceId(row.source_workspace_id) ||
      !isProjectWorkspaceId(row.target_workspace_id) ||
      row.source_workspace_id === row.target_workspace_id ||
      row.local_project_key !== project.localProjectKey ||
      row.document_id !== project.documentId ||
      row.source_path !== project.canonicalPath ||
      project.workspaceId !== row.source_workspace_id ||
      project.fileFingerprint !== fingerprint(sourceWitness) ||
      sourceParentWitness.dev !== targetParentWitness.dev ||
      sourceWitness.dev !== sourceParentWitness.dev ||
      !/^[a-f0-9]{64}$/.test(row.source_sha256) ||
      !['moved', 'moving', 'planned'].includes(row.state) ||
      !Number.isFinite(Date.parse(row.created_at)) ||
      !(row.error_message === null || typeof row.error_message === 'string')
    ) {
      throw invalid()
    }
    return {
      createdAt: row.created_at,
      destinationPath: row.destination_path,
      documentId: row.document_id,
      errorMessage: row.error_message,
      localProjectKey: row.local_project_key,
      operationId: row.operation_id,
      project,
      sourceParentWitness,
      sourcePath: row.source_path,
      sourceSha256: row.source_sha256,
      sourceWitness,
      sourceWorkspaceId: row.source_workspace_id,
      state: row.state as ProjectRelocationRecord['state'],
      targetParentWitness,
      targetWorkspaceId: row.target_workspace_id,
    }
  } catch {
    throw invalid()
  }
}
function toRow(r: ProjectRelocationRecord, now: string): DB['project_relocation'] {
  return {
    created_at: r.createdAt,
    destination_path: r.destinationPath,
    document_id: r.documentId,
    error_message: r.errorMessage,
    local_project_key: r.localProjectKey,
    operation_id: r.operationId,
    project_json: JSON.stringify(r.project),
    source_parent_witness_json: JSON.stringify(r.sourceParentWitness),
    source_path: r.sourcePath,
    source_sha256: r.sourceSha256,
    source_witness_json: JSON.stringify(r.sourceWitness),
    source_workspace_id: r.sourceWorkspaceId,
    state: r.state,
    target_parent_witness_json: JSON.stringify(r.targetParentWitness),
    target_workspace_id: r.targetWorkspaceId,
    updated_at: now,
  }
}
function sameAuthority(a: ProjectRelocationRecord, b: ProjectRelocationRecord): boolean {
  return (
    JSON.stringify({ ...a, errorMessage: null, state: 'planned' }) ===
    JSON.stringify({ ...b, errorMessage: null, state: 'planned' })
  )
}
function witness(s: BigIntStats): FileWitness {
  return {
    ctimeNs: s.ctimeNs.toString(),
    dev: s.dev.toString(),
    ino: s.ino.toString(),
    mtimeNs: s.mtimeNs.toString(),
    size: s.size.toString(),
  }
}
function fingerprint(w: FileWitness): string {
  return [w.dev, w.ino, w.size, w.mtimeNs, w.ctimeNs].join(':')
}
function regular(s: BigIntStats): boolean {
  return (
    s.isFile() &&
    !s.isSymbolicLink() &&
    s.nlink === 1n &&
    s.size > 0n &&
    s.size <= BigInt(Number.MAX_SAFE_INTEGER)
  )
}
function sameOriginal(s: BigIntStats | null, w: FileWitness): boolean {
  return !!s && regular(s) && fingerprint(witness(s)) === fingerprint(w)
}
function sameMoved(s: BigIntStats | null, w: FileWitness): boolean {
  return (
    !!s &&
    regular(s) &&
    s.dev.toString() === w.dev &&
    s.ino.toString() === w.ino &&
    s.size.toString() === w.size &&
    s.mtimeNs.toString() === w.mtimeNs
  )
}
function entryNow(p: string): BigIntStats | null {
  try {
    return lstatSync(p, { bigint: true })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw e
  }
}
function parentOf(p: string): ParentWitness {
  const s = lstatSync(p, { bigint: true })
  if (!s.isDirectory() || s.isSymbolicLink() || realpathSync(p) !== p) {
    throw changed()
  }
  return { dev: s.dev.toString(), ino: s.ino.toString() }
}
function sameParent(p: string, expected: ParentWitness): void {
  const current = parentOf(p)
  if (current.dev !== expected.dev || current.ino !== expected.ino) {
    throw changed()
  }
}
function assertParentsNow(a: string, aw: ParentWitness, b: string, bw: ParentWitness): void {
  sameParent(a, aw)
  sameParent(b, bw)
}
function assertNoCollision(p: string): void {
  if (
    entryNow(p) ||
    readdirSync(path.dirname(p)).some(
      (name) => name.toLowerCase() === path.basename(p).toLowerCase(),
    )
  ) {
    throw new ProjectRelocationStoreError(
      'PROJECT_MOVE_CONFLICT',
      'A file with this name already exists in the destination workspace. No file was replaced.',
    )
  }
}
async function hashChecked(
  p: string,
  expected: FileWitness,
  original: boolean,
  expectedHash?: string,
): Promise<string> {
  const handle = await open(p, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat({ bigint: true })
    if (
      !(original ? sameOriginal(before, expected) : sameMoved(before, expected)) ||
      realpathSync(p) !== p
    ) {
      throw changed()
    }
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let position = 0
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
      if (!bytesRead) {
        break
      }
      hash.update(buffer.subarray(0, bytesRead))
      position += bytesRead
    }
    const after = await handle.stat({ bigint: true })
    const current = entryNow(p)
    if (
      fingerprint(witness(before)) !== fingerprint(witness(after)) ||
      !current ||
      fingerprint(witness(current)) !== fingerprint(witness(after))
    ) {
      throw changed()
    }
    const sha = hash.digest('hex')
    if (expectedHash && sha !== expectedHash) {
      throw changed()
    }
    return sha
  } finally {
    await handle.close()
  }
}
function renameCheckedNow(r: ProjectRelocationRecord): void {
  const parents = [path.dirname(r.sourcePath), path.dirname(r.destinationPath)]
  const fds: number[] = []
  try {
    for (const p of parents) {
      fds.push(openSync(p, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW))
    }
    for (let i = 0; i < fds.length; i++) {
      const s = fstatSync(fds[i], { bigint: true })
      const expected = i === 0 ? r.sourceParentWitness : r.targetParentWitness
      if (
        !s.isDirectory() ||
        s.dev.toString() !== expected.dev ||
        s.ino.toString() !== expected.ino
      ) {
        throw changed()
      }
    }
    assertParentsNow(parents[0], r.sourceParentWitness, parents[1], r.targetParentWitness)
    assertNoCollision(r.destinationPath)
    if (
      !sameOriginal(entryNow(r.sourcePath), r.sourceWitness) ||
      realpathSync(r.sourcePath) !== r.sourcePath
    ) {
      throw changed()
    }
    // No await/callback/log emission between final synchronous guards and same-filesystem rename.
    renameSync(r.sourcePath, r.destinationPath)
  } finally {
    for (const fd of fds) {
      closeSync(fd)
    }
  }
}
function movedWitnessNow(r: ProjectRelocationRecord): FileWitness {
  assertParentsNow(
    path.dirname(r.sourcePath),
    r.sourceParentWitness,
    path.dirname(r.destinationPath),
    r.targetParentWitness,
  )
  if (entryNow(r.sourcePath)) {
    throw changed()
  }
  const moved = entryNow(r.destinationPath)
  if (!sameMoved(moved, r.sourceWitness) || realpathSync(r.destinationPath) !== r.destinationPath) {
    throw changed()
  }
  return witness(moved!)
}
function syncMovedNow(r: ProjectRelocationRecord): void {
  movedWitnessNow(r)
  const paths = [r.destinationPath, path.dirname(r.sourcePath), path.dirname(r.destinationPath)]
  for (const p of paths) {
    const fd = openSync(
      p,
      constants.O_RDONLY |
        constants.O_NOFOLLOW |
        (p === r.destinationPath ? 0 : constants.O_DIRECTORY),
    )
    try {
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  }
}
function invalid(): ProjectRelocationStoreError {
  return new ProjectRelocationStoreError(
    'PROJECT_MOVE_INVALID',
    'The saved Move request could not be verified. No file was moved.',
  )
}
function changed(): ProjectRelocationStoreError {
  return new ProjectRelocationStoreError(
    'PROJECT_MOVE_PENDING',
    'The Project file or a workspace changed. Move was retained for safe recovery; no replacement file will be moved.',
  )
}
function conflict(): ProjectRelocationStoreError {
  return new ProjectRelocationStoreError(
    'PROJECT_MOVE_CONFLICT',
    'The Project or its Move state changed. Refresh Home before trying again.',
  )
}
