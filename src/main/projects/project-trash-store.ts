import { isProjectDocumentId } from '../../shared/projects/project-generation-actions.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'
import type { ProjectTrashDeleteResult } from '../../shared/projects/project-trash.js'
import { isProjectWorkspaceId } from '../../shared/projects/project-workspaces.js'

import type { Kysely } from 'kysely'
import type { BigIntStats } from 'node:fs'

import { randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  realpathSync,
  unlinkSync,
} from 'node:fs'
import path from 'node:path'

import type { DB } from '../db/database.types.js'
import type { ProjectIndexRecord, ProjectWorkspaceRecord } from './project-index.js'

import { localProjectRecoveryKey, refreshProjectLocationRegistry } from './project-identity.js'
import { withProjectPathLock } from './project-path-lock.js'

export interface ProjectTrashRecord {
  canonicalPath: string
  deleteCommittedAt: string | null
  deletionError: string | null
  deletionId: string | null
  fileMissing: boolean
  fileWitness: FileWitness | null
  localProjectKey: string
  parentWitness: ParentWitness | null
  project: ProjectIndexRecord
  state: 'deleting' | 'trashed'
  trashedAt: string
  trashId: string
  workspaceDirectoryPath: string
  workspaceName: string
}
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
  /** Test-only crash window after unlink but before its parent directory is synced. */
  afterFileUnlink?: (record: ProjectTrashRecord) => Promise<void>
  /** Test-only causal seam; the final synchronous identity check always follows this await. */
  beforeFinalFileCheck?: (record: ProjectTrashRecord) => Promise<void>
  /** Test-only crash/fault window before deleting the durable positive journal. */
  beforeFinalize?: (record: ProjectTrashRecord) => Promise<void>
}

export class ProjectTrashStoreError extends Error {
  constructor(
    readonly code:
      | 'TRASH_CONFLICT'
      | 'TRASH_DELETE_PENDING'
      | 'TRASH_FILE_CHANGED'
      | 'TRASH_INVALID_RECORD'
      | 'TRASH_NOT_FOUND',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectTrashStoreError'
  }
}

/**
 * Invoke's reversible Board metadata and v2 positive delete journal adapted to SQLite FULL. The
 * lifecycle is authoritative; a missing derived Home row is never a delete grant.
 */
export class ProjectTrashStore {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly options: StoreOptions = {},
  ) {}

  async beginPermanentDelete(
    projectId: string,
    trashId: string,
    guardSync: () => void,
  ): Promise<ProjectTrashRecord> {
    assertProjectId(projectId)
    assertUuid(trashId)
    const initial = await this.get(projectId)
    if (!initial) {
      throw notFound()
    }
    return await withProjectPathLock(initial.canonicalPath, async () => {
      const prepared = await this.get(projectId)
      if (!prepared) {
        throw notFound()
      }
      if (prepared.trashId !== trashId) {
        throw conflict()
      }
      guardSync()
      if (prepared.state === 'trashed') {
        // Invoke begin_delete resolves paths before record deletion. This readonly preflight
        // additionally binds them to the frozen Trash witness, keeping Restore available on
        // an initially unknown/changed source. The actual purge repeats the exact same checks.
        const checked = openCheckedSourceNow(prepared)
        closeSync(checked.fd)
        if (!checked.filePresent && !prepared.fileMissing) {
          throw changedFile()
        }
      }
      // All filesystem work stays outside the transaction. Only its positive row grants purge.
      return await this.db.transaction().execute(async (transaction) => {
        const row = await transaction
          .selectFrom('project_file_lifecycle')
          .selectAll()
          .where('local_project_key', '=', projectId)
          .executeTakeFirst()
        if (!row) {
          throw notFound()
        }
        const record = fromRow(row)
        if (
          record.trashId !== trashId ||
          record.state !== prepared.state ||
          !sameRecordWitness(record, prepared)
        ) {
          throw conflict()
        }
        guardSync()
        const now = new Date().toISOString()
        const deletionId = record.deletionId ?? randomUUID()
        const committedAt = record.deleteCommittedAt ?? now
        await transaction
          .updateTable('project_file_lifecycle')
          .set({
            delete_committed_at: committedAt,
            delete_operation_id: deletionId,
            deletion_error: null,
            state: 'deleting',
            updated_at: now,
          })
          .where('local_project_key', '=', projectId)
          .execute()
        await transaction
          .deleteFrom('project_index')
          .where('local_project_key', '=', projectId)
          .execute()
        guardSync()
        const saved = await transaction
          .selectFrom('project_file_lifecycle')
          .selectAll()
          .where('local_project_key', '=', projectId)
          .executeTakeFirstOrThrow()
        return fromRow(saved)
      })
    })
  }

  async finishPermanentDelete(input: ProjectTrashRecord): Promise<ProjectTrashDeleteResult> {
    input = structuredClone(input)
    assertProjectId(input.localProjectKey)
    assertUuid(input.trashId)
    assertUuid(input.deletionId)
    return await withProjectPathLock(input.canonicalPath, async () => {
      const initial = await this.get(input.localProjectKey)
      if (!initial) {
        throw notFound()
      }
      let record: ProjectTrashRecord = initial
      if (
        record.state !== 'deleting' ||
        record.trashId !== input.trashId ||
        record.deletionId !== input.deletionId ||
        record.canonicalPath !== input.canonicalPath
      ) {
        throw conflict()
      }
      let finalized = false
      try {
        await this.options.beforeFinalFileCheck?.(record)
        const current = await this.get(record.localProjectKey)
        if (!current || !sameAuthority(current, record)) {
          throw conflict()
        }
        record = current
        const parentFd = unlinkCheckedNow(record)
        try {
          await this.options.afterFileUnlink?.(record)
          syncParentNow(parentFd, record)
          await this.options.beforeFinalize?.(record)
          // A new occupant is never silently treated as the deleted file or removed by retry.
          assertParentNow(parentFd, record)
          if (entryNow(record.canonicalPath) !== null) {
            throw changedFile()
          }
          await this.db.transaction().execute(async (transaction) => {
            const row = await transaction
              .selectFrom('project_file_lifecycle')
              .selectAll()
              .where('local_project_key', '=', record.localProjectKey)
              .executeTakeFirst()
            if (!row || !sameAuthority(fromRow(row), record)) {
              throw conflict()
            }
            // Preserve Invoke's non-reused stable-name property after freeing the physical slot.
            // Queue/history remains separately owned; a later file must not inherit this key.
            await transaction
              .insertInto('project_identity_retired_key')
              .values({ local_project_key: record.localProjectKey })
              .onConflict((conflict) => conflict.column('local_project_key').doNothing())
              .execute()
            await transaction
              .deleteFrom('project_identity_binding')
              .where('local_project_key', '=', record.localProjectKey)
              .execute()
            await transaction
              .deleteFrom('project_file_lifecycle')
              .where('local_project_key', '=', record.localProjectKey)
              .where('trash_id', '=', record.trashId)
              .where('delete_operation_id', '=', record.deletionId)
              .where('state', '=', 'deleting')
              .execute()
          })
          finalized = true
          refreshProjectLocationRegistry(this.db)
        } finally {
          closeSync(parentFd)
        }
        return { kind: 'deleted' }
      } catch (error) {
        // The file and positive journal are already durably finalized. A poisoned identity
        // projection must fail closed for later operations, not invent a pending delete row.
        if (finalized) {
          return { kind: 'deleted' }
        }
        const message = pendingMessage(error)
        // Preserve the journal on every failure, including an inability to save its diagnostic.
        await this.db
          .updateTable('project_file_lifecycle')
          .set({ deletion_error: message, updated_at: new Date().toISOString() })
          .where('local_project_key', '=', record.localProjectKey)
          .where('trash_id', '=', record.trashId)
          .where('delete_operation_id', '=', record.deletionId)
          .where('state', '=', 'deleting')
          .execute()
          .catch(() => undefined)
        return { kind: 'pending', message }
      }
    })
  }

  async get(projectId: string): Promise<ProjectTrashRecord | null> {
    assertProjectId(projectId)
    const row = await this.db
      .selectFrom('project_file_lifecycle')
      .selectAll()
      .where('local_project_key', '=', projectId)
      .executeTakeFirst()
    return row ? fromRow(row) : null
  }

  async list(): Promise<ProjectTrashRecord[]> {
    const rows = await this.db
      .selectFrom('project_file_lifecycle')
      .selectAll()
      .orderBy('trashed_at', 'desc')
      .orderBy('local_project_key')
      .execute()
    return rows.map(fromRow)
  }

  async moveToTrash(
    project: ProjectIndexRecord,
    workspace: ProjectWorkspaceRecord,
    guardSync: () => void,
  ): Promise<void> {
    project = structuredClone(project)
    workspace = structuredClone(workspace)
    assertProjectSnapshot(project)
    if (
      !isProjectWorkspaceId(workspace.id) ||
      workspace.id !== project.workspaceId ||
      workspace.directoryPath !== path.dirname(project.canonicalPath) ||
      typeof workspace.displayName !== 'string' ||
      !workspace.displayName
    ) {
      throw invalidRecord()
    }
    await withProjectPathLock(project.canonicalPath, async () => {
      guardSync()
      const frozenProject = structuredClone(project)
      const witness = captureWitness(project.canonicalPath, workspace.directoryPath)
      // A present file also needs an indexed fingerprint; corrupt/missing null metadata cannot
      // identify a later occupant safely enough to authorize its eventual permanent deletion.
      if (witness.fileWitness && fingerprint(witness.fileWitness) !== project.fileFingerprint) {
        throw changedFile()
      }
      const now = new Date().toISOString()
      const record: ProjectTrashRecord = {
        canonicalPath: project.canonicalPath,
        deleteCommittedAt: null,
        deletionError: null,
        deletionId: null,
        ...witness,
        localProjectKey: project.localProjectKey,
        project: frozenProject,
        state: 'trashed',
        trashedAt: now,
        trashId: randomUUID(),
        workspaceDirectoryPath: workspace.directoryPath,
        workspaceName: workspace.displayName,
      }
      await this.db.transaction().execute(async (transaction) => {
        guardSync()
        if (
          await transaction
            .selectFrom('project_file_lifecycle')
            .select('local_project_key')
            .where('local_project_key', '=', project.localProjectKey)
            .executeTakeFirst()
        ) {
          throw conflict()
        }
        const indexed = await transaction
          .selectFrom('project_index')
          .selectAll()
          .where('local_project_key', '=', project.localProjectKey)
          .executeTakeFirst()
        if (
          !indexed ||
          indexed.canonical_path !== project.canonicalPath ||
          indexed.workspace_id !== workspace.id ||
          indexed.document_id !== project.documentId ||
          indexed.document_revision !== project.documentRevision ||
          indexed.file_fingerprint !== project.fileFingerprint
        ) {
          throw conflict()
        }
        guardSync()
        await transaction.insertInto('project_file_lifecycle').values(toRow(record, now)).execute()
        await transaction
          .updateTable('project_index')
          .set({ trashed_at: now })
          .where('local_project_key', '=', project.localProjectKey)
          .execute()
        guardSync()
      })
    })
  }

  async recoverCommittedDeletes(): Promise<void> {
    // Validate the entire authority set before allowing the first destructive action.
    const records = await this.list()
    for (const record of records) {
      if (record.state === 'deleting') {
        await this.finishPermanentDelete(record)
      }
    }
  }

  async restore(
    projectId: string,
    trashId: string,
    workspaceId: string,
    guardSync: () => void,
  ): Promise<void> {
    assertProjectId(projectId)
    assertUuid(trashId)
    if (!isProjectWorkspaceId(workspaceId)) {
      throw invalidRecord()
    }
    const initial = await this.get(projectId)
    if (!initial) {
      throw notFound()
    }
    await withProjectPathLock(initial.canonicalPath, async () => {
      guardSync()
      await this.db.transaction().execute(async (transaction) => {
        const row = await transaction
          .selectFrom('project_file_lifecycle')
          .selectAll()
          .where('local_project_key', '=', projectId)
          .executeTakeFirst()
        if (!row) {
          throw notFound()
        }
        const record = fromRow(row)
        if (record.trashId !== trashId || record.state !== 'trashed') {
          throw conflict()
        }
        const workspace = await transaction
          .selectFrom('project_workspace')
          .selectAll()
          .where('id', '=', workspaceId)
          .executeTakeFirst()
        if (!workspace || workspace.directory_path !== record.workspaceDirectoryPath) {
          throw conflict()
        }
        const indexed = await transaction
          .selectFrom('project_index')
          .selectAll()
          .where('local_project_key', '=', projectId)
          .executeTakeFirst()
        if (
          !indexed ||
          indexed.canonical_path !== record.canonicalPath ||
          indexed.workspace_id !== workspaceId
        ) {
          throw conflict()
        }
        guardSync()
        await transaction
          .updateTable('project_index')
          .set({ trashed_at: null })
          .where('local_project_key', '=', projectId)
          .execute()
        await transaction
          .deleteFrom('project_file_lifecycle')
          .where('local_project_key', '=', projectId)
          .where('trash_id', '=', trashId)
          .execute()
        guardSync()
      })
    })
  }
}

function assertProjectId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^project-v1-[a-f0-9]{64}$/.test(value)) {
    throw invalidRecord()
  }
}
function assertUuid(value: unknown): asserts value is string {
  if (!isProjectDocumentId(value)) {
    throw invalidRecord()
  }
}
function isIso(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  )
}
function isCanonical(value: unknown): value is string {
  return typeof value === 'string' && path.isAbsolute(value) && path.normalize(value) === value
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}
function isNullableUuid(value: unknown): boolean {
  return value === null || isProjectDocumentId(value)
}
function isNullableNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
}
function assertProjectSnapshot(value: unknown): asserts value is ProjectIndexRecord {
  if (
    !isObject(value) ||
    !isCanonical(value.canonicalPath) ||
    path.extname(value.canonicalPath).toLowerCase() !== '.igs' ||
    !isProjectWorkspaceId(value.workspaceId) ||
    !isNullableUuid(value.documentId) ||
    !isNullableUuid(value.documentRevision) ||
    typeof value.displayName !== 'string' ||
    !value.displayName ||
    !['corrupt', 'missing', 'ready', 'unsupported_schema'].includes(String(value.fileHealth)) ||
    !isNullableString(value.diagnosticCode) ||
    !isNullableString(value.fileFingerprint) ||
    !isNullableString(value.lastOpenedAt) ||
    !isNullableNumber(value.bboxWidth) ||
    !isNullableNumber(value.bboxHeight) ||
    !(
      value.previewStatus === null ||
      ['empty', 'rendered', 'unavailable'].includes(String(value.previewStatus))
    ) ||
    !(
      value.thumbnailSha256 === null ||
      (typeof value.thumbnailSha256 === 'string' && /^[a-f0-9]{64}$/.test(value.thumbnailSha256))
    )
  ) {
    throw invalidRecord()
  }
  assertProjectId(value.localProjectKey)
  if (localProjectRecoveryKey(value.canonicalPath) !== value.localProjectKey) {
    throw invalidRecord()
  }
  if (
    value.fileFingerprint !== null &&
    !/^\d{1,30}:\d{1,30}:\d{1,30}:-?\d{1,30}:-?\d{1,30}$/.test(value.fileFingerprint)
  ) {
    throw invalidRecord()
  }
  if (
    value.fileHealth === 'ready' &&
    (value.documentId === null ||
      value.documentRevision === null ||
      value.fileFingerprint === null ||
      value.bboxWidth === null ||
      value.bboxHeight === null ||
      value.previewStatus === null)
  ) {
    throw invalidRecord()
  }
}
function parseWitness(value: string, file: false): ParentWitness | null
function parseWitness(value: string, file: true): FileWitness | null
function parseWitness(value: string, file: boolean): FileWitness | ParentWitness | null {
  const parsed: unknown = JSON.parse(value)
  if (parsed === null) {
    return null
  }
  if (
    !isObject(parsed) ||
    Object.keys(parsed).sort().join(',') !== (file ? 'ctimeNs,dev,ino,mtimeNs,size' : 'dev,ino') ||
    !unsigned(parsed.dev) ||
    !unsigned(parsed.ino) ||
    (file && (!unsigned(parsed.size) || !signed(parsed.mtimeNs) || !signed(parsed.ctimeNs)))
  ) {
    throw invalidRecord()
  }
  return parsed as unknown as FileWitness | ParentWitness
}
function unsigned(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,30}$/.test(value)
}
function signed(value: unknown): value is string {
  return typeof value === 'string' && /^-?\d{1,30}$/.test(value)
}
function fromRow(row: DB['project_file_lifecycle']): ProjectTrashRecord {
  try {
    if (
      Buffer.byteLength(row.project_json, 'utf8') > IGS_SAFETY_CEILINGS.manifestJsonBytes ||
      Buffer.byteLength(row.parent_witness_json, 'utf8') > IGS_SAFETY_CEILINGS.titleBytes ||
      Buffer.byteLength(row.file_witness_json, 'utf8') > IGS_SAFETY_CEILINGS.titleBytes
    ) {
      throw invalidRecord()
    }
    const project: unknown = JSON.parse(row.project_json)
    assertProjectSnapshot(project)
    const parentWitness = parseWitness(row.parent_witness_json, false)
    const fileWitness = parseWitness(row.file_witness_json, true)
    if (fileWitness && fingerprint(fileWitness) !== project.fileFingerprint) {
      throw invalidRecord()
    }
    assertProjectId(row.local_project_key)
    assertUuid(row.trash_id)
    if (
      !isCanonical(row.canonical_path) ||
      !isCanonical(row.workspace_directory_path) ||
      path.dirname(row.canonical_path) !== row.workspace_directory_path ||
      project.canonicalPath !== row.canonical_path ||
      project.localProjectKey !== row.local_project_key ||
      typeof row.workspace_name !== 'string' ||
      !row.workspace_name ||
      !isIso(row.trashed_at) ||
      !isIso(row.updated_at) ||
      !['deleting', 'trashed'].includes(row.state) ||
      !isNullableString(row.deletion_error) ||
      ![0, 1].includes(row.file_missing) ||
      (fileWitness && (!parentWitness || row.file_missing !== 0)) ||
      (row.file_missing === 1 && (!parentWitness || fileWitness))
    ) {
      throw invalidRecord()
    }
    if (row.state === 'trashed') {
      if (row.delete_operation_id !== null || row.delete_committed_at !== null) {
        throw invalidRecord()
      }
    } else {
      assertUuid(row.delete_operation_id)
      if (!isIso(row.delete_committed_at)) {
        throw invalidRecord()
      }
    }
    return {
      canonicalPath: row.canonical_path,
      deleteCommittedAt: row.delete_committed_at,
      deletionError: row.deletion_error,
      deletionId: row.delete_operation_id,
      fileMissing: row.file_missing === 1,
      fileWitness,
      localProjectKey: row.local_project_key,
      parentWitness,
      project,
      state: row.state as ProjectTrashRecord['state'],
      trashedAt: row.trashed_at,
      trashId: row.trash_id,
      workspaceDirectoryPath: row.workspace_directory_path,
      workspaceName: row.workspace_name,
    }
  } catch {
    throw invalidRecord()
  }
}
function toRow(record: ProjectTrashRecord, now: string): DB['project_file_lifecycle'] {
  return {
    canonical_path: record.canonicalPath,
    delete_committed_at: record.deleteCommittedAt,
    delete_operation_id: record.deletionId,
    deletion_error: record.deletionError,
    file_missing: record.fileMissing ? 1 : 0,
    file_witness_json: JSON.stringify(record.fileWitness),
    local_project_key: record.localProjectKey,
    parent_witness_json: JSON.stringify(record.parentWitness),
    project_json: JSON.stringify(record.project),
    state: record.state,
    trash_id: record.trashId,
    trashed_at: record.trashedAt,
    updated_at: now,
    workspace_directory_path: record.workspaceDirectoryPath,
    workspace_name: record.workspaceName,
  }
}
function captureWitness(
  filePath: string,
  directory: string,
): Pick<ProjectTrashRecord, 'fileMissing' | 'fileWitness' | 'parentWitness'> {
  let parent: BigIntStats
  try {
    parent = lstatSync(directory, { bigint: true })
  } catch (error) {
    if (unavailable(error)) {
      return { fileMissing: false, fileWitness: null, parentWitness: null }
    }
    throw error
  }
  if (!parent.isDirectory() || parent.isSymbolicLink() || realpathSync(directory) !== directory) {
    throw changedFile()
  }
  const parentWitness = { dev: parent.dev.toString(), ino: parent.ino.toString() }
  let entry: BigIntStats | null
  try {
    entry = entryNow(filePath)
  } catch (error) {
    if (unavailable(error)) {
      return { fileMissing: false, fileWitness: null, parentWitness }
    }
    throw error
  }
  if (!entry) {
    return { fileMissing: true, fileWitness: null, parentWitness }
  }
  if (
    !entry.isFile() ||
    entry.isSymbolicLink() ||
    entry.nlink !== 1n ||
    realpathSync(filePath) !== filePath
  ) {
    throw changedFile()
  }
  return { fileMissing: false, fileWitness: fileWitnessOf(entry), parentWitness }
}
function fileWitnessOf(entry: BigIntStats): FileWitness {
  return {
    ctimeNs: entry.ctimeNs.toString(),
    dev: entry.dev.toString(),
    ino: entry.ino.toString(),
    mtimeNs: entry.mtimeNs.toString(),
    size: entry.size.toString(),
  }
}
function fingerprint(witness: FileWitness): string {
  return [witness.dev, witness.ino, witness.size, witness.mtimeNs, witness.ctimeNs].join(':')
}
function entryNow(filePath: string): BigIntStats | null {
  try {
    return lstatSync(filePath, { bigint: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}
function unavailable(error: unknown): boolean {
  return ['EACCES', 'ELOOP', 'ENOENT', 'ENOTDIR', 'EPERM'].includes(
    (error as NodeJS.ErrnoException).code ?? '',
  )
}
function assertParentNow(fd: number, record: ProjectTrashRecord): void {
  const expected = record.parentWitness
  if (!expected) {
    throw new ProjectTrashStoreError(
      'TRASH_DELETE_PENDING',
      'The original workspace identity was unavailable when the Project entered Trash. Deletion remains blocked.',
    )
  }
  const descriptor = fstatSync(fd, { bigint: true })
  const current = lstatSync(record.workspaceDirectoryPath, { bigint: true })
  if (
    !descriptor.isDirectory() ||
    !current.isDirectory() ||
    current.isSymbolicLink() ||
    descriptor.dev.toString() !== expected.dev ||
    descriptor.ino.toString() !== expected.ino ||
    current.dev !== descriptor.dev ||
    current.ino !== descriptor.ino ||
    realpathSync(record.workspaceDirectoryPath) !== record.workspaceDirectoryPath
  ) {
    throw changedFile()
  }
}
/** Shared readonly preflight: pins the parent and validates the current entry without mutation. */
function openCheckedSourceNow(record: ProjectTrashRecord): { fd: number; filePresent: boolean } {
  if (!record.parentWitness || (!record.fileWitness && !record.fileMissing)) {
    throw new ProjectTrashStoreError(
      'TRASH_DELETE_PENDING',
      'The original file identity was unavailable when the Project entered Trash. Deletion remains blocked.',
    )
  }
  const fd = openSync(
    record.workspaceDirectoryPath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    assertParentNow(fd, record)
    const current = entryNow(record.canonicalPath)
    if (
      current &&
      (!record.fileWitness ||
        !current.isFile() ||
        current.isSymbolicLink() ||
        current.nlink !== 1n ||
        fingerprint(fileWitnessOf(current)) !== fingerprint(record.fileWitness) ||
        realpathSync(record.canonicalPath) !== record.canonicalPath)
    ) {
      throw changedFile()
    }
    return { fd, filePresent: current !== null }
  } catch (error) {
    closeSync(fd)
    throw error
  }
}
function unlinkCheckedNow(record: ProjectTrashRecord): number {
  if (record.state !== 'deleting' || !record.deletionId || !record.deleteCommittedAt) {
    throw invalidRecord()
  }
  const checked = openCheckedSourceNow(record)
  try {
    // No await, callback or diagnostic emission between the fresh shared guard and unlink.
    if (checked.filePresent) {
      unlinkSync(record.canonicalPath)
    }
    return checked.fd
  } catch (error) {
    closeSync(checked.fd)
    throw error
  }
}
function syncParentNow(fd: number, record: ProjectTrashRecord): void {
  assertParentNow(fd, record)
  fsyncSync(fd)
}
function sameAuthority(first: ProjectTrashRecord, second: ProjectTrashRecord): boolean {
  return (
    first.state === 'deleting' && second.state === 'deleting' && sameRecordWitness(first, second)
  )
}
function sameRecordWitness(first: ProjectTrashRecord, second: ProjectTrashRecord): boolean {
  return (
    first.localProjectKey === second.localProjectKey &&
    first.trashId === second.trashId &&
    first.deletionId === second.deletionId &&
    first.deleteCommittedAt === second.deleteCommittedAt &&
    first.canonicalPath === second.canonicalPath &&
    first.workspaceDirectoryPath === second.workspaceDirectoryPath &&
    first.fileMissing === second.fileMissing &&
    JSON.stringify(first.fileWitness) === JSON.stringify(second.fileWitness) &&
    JSON.stringify(first.parentWitness) === JSON.stringify(second.parentWitness)
  )
}
function invalidRecord(): ProjectTrashStoreError {
  return new ProjectTrashStoreError(
    'TRASH_INVALID_RECORD',
    'The saved Trash entry could not be verified. Deletion was not attempted.',
  )
}
function conflict(): ProjectTrashStoreError {
  return new ProjectTrashStoreError(
    'TRASH_CONFLICT',
    'The Project lifecycle changed. Refresh Trash before trying again.',
  )
}
function notFound(): ProjectTrashStoreError {
  return new ProjectTrashStoreError('TRASH_NOT_FOUND', 'This Project is no longer in Trash.')
}
function changedFile(): ProjectTrashStoreError {
  return new ProjectTrashStoreError(
    'TRASH_FILE_CHANGED',
    'The Project file or its workspace changed. No replacement file will be deleted.',
  )
}
function pendingMessage(error: unknown): string {
  return error instanceof ProjectTrashStoreError
    ? error.message
    : 'Project deletion could not finish safely. Its recovery record was kept; restore workspace access and retry.'
}
