import {
  ACCEPTED_RESULT_HISTORY_PAGE_SIZE,
  type AcceptedResultHistoryCursor,
  isAcceptedResultHistoryCursor,
} from '../../shared/projects/accepted-result-history.js'
import { isProjectDocumentId } from '../../shared/projects/project-generation-actions.js'
import { IgsSchemaError, projectRasterAssets } from '../../shared/projects/project-schema.js'
import {
  isProjectWorkspaceId,
  parseProjectWorkspaceAddInput,
  type ProjectWorkspaceAddInput,
  type ProjectWorkspaceSummary,
} from '../../shared/projects/project-workspaces.js'

import type { Kysely } from 'kysely'

import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, lstat, mkdir, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'

import type { DB } from '../db/database.types.js'

import { IgsPackageError, readIgsPackage } from './igs-package.js'
import { fileMtimeToHomeTimestamp } from './project-home-metadata.js'
import {
  canonicalProjectPath,
  localProjectRecoveryKey,
  ProjectIdentityError,
} from './project-identity.js'
import {
  ensureProjectLocationIdentity,
  hasRelocatedKeyCollision,
} from './project-location-registry.js'
import { withProjectPathLock } from './project-path-lock.js'
import { ProjectRelocationStore } from './project-relocation-store.js'
import { ProjectTrashStore } from './project-trash-store.js'

export const UNCATEGORIZED_WORKSPACE_ID = 'uncategorized'

export interface ProjectWorkspaceRecord {
  color: string
  directoryPath: string
  displayName: string
  id: string
}

export interface ProjectIndexRecord {
  bboxHeight: number | null
  bboxWidth: number | null
  canonicalPath: string
  diagnosticCode: string | null
  displayName: string
  documentId: string | null
  documentRevision: string | null
  fileFingerprint: string | null
  fileHealth: 'corrupt' | 'missing' | 'ready' | 'unsupported_schema'
  lastOpenedAt: string | null
  localProjectKey: string
  previewStatus: 'empty' | 'rendered' | 'unavailable' | null
  thumbnailSha256: string | null
  workspaceId: string
}

export interface ProjectSavedAcceptedResultRecord {
  acceptedAt: string
  actualSeed: number
  assetBytes: number
  assetHeight: number
  assetPath: string
  assetSha256: string
  assetWidth: number
  canonicalPath: string
  documentId: string
  documentRevision: string
  fileFingerprint: string
  layerId: string
  layerName: string
  localProjectKey: string
  modelFileSha256: string
  modelName: string
  modelVersionName: string
  outputHeight: number
  outputWidth: number
  projectTitle: string
}

export interface ProjectSavedAcceptedResultsPage {
  items: ProjectSavedAcceptedResultRecord[]
  nextCursor: AcceptedResultHistoryCursor | null
  totalCount: number
}

export class ProjectIndexError extends Error {
  constructor(
    readonly code:
      | 'INDEX_CURSOR_INVALID'
      | 'INDEX_FILE_CHANGED'
      | 'INDEX_OUTSIDE_WORKSPACE'
      | 'PROJECT_MOVE_PENDING'
      | 'PROJECT_TRASHED'
      | 'WORKSPACE_INVALID_INPUT'
      | 'WORKSPACE_NAME_EXISTS'
      | 'WORKSPACE_PATH_CONFLICT'
      | 'WORKSPACE_PROJECT_OPEN'
      | 'WORKSPACE_PROTECTED'
      | 'WORKSPACE_READ_ONLY'
      | 'WORKSPACE_UNAVAILABLE',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectIndexError'
  }
}

/** Rebuildable Home metadata. No Project pixels or layer document live in SQLite. */
export class ProjectIndexRepository {
  readonly relocations: ProjectRelocationStore
  readonly trash: ProjectTrashStore

  constructor(private readonly db: Kysely<DB>) {
    this.trash = new ProjectTrashStore(db)
    this.relocations = new ProjectRelocationStore(db)
  }

  /** Metadata checks and insertion share Invoke's transaction boundary; the folder is external. */
  async addWorkspace(
    input: ProjectWorkspaceAddInput,
    trustedPickerDirectoryPath: string,
  ): Promise<ProjectWorkspaceRecord> {
    let parsed: ProjectWorkspaceAddInput
    try {
      parsed = parseProjectWorkspaceAddInput(input)
    } catch {
      throw new ProjectIndexError('WORKSPACE_INVALID_INPUT', 'The workspace details are invalid.')
    }
    if (
      typeof trustedPickerDirectoryPath !== 'string' ||
      !path.isAbsolute(trustedPickerDirectoryPath)
    ) {
      throw new ProjectIndexError('WORKSPACE_UNAVAILABLE', 'Choose an existing workspace folder.')
    }
    let directoryPath: string
    try {
      directoryPath = await realpath(trustedPickerDirectoryPath)
    } catch (error) {
      if (!isUnavailablePathError(error)) {
        throw error
      }
      throw new ProjectIndexError('WORKSPACE_UNAVAILABLE', 'The workspace folder is unavailable.')
    }
    const record = { ...parsed, directoryPath, id: randomUUID() }
    await this.assertWritableWorkspace(record)
    return await this.db.transaction().execute(async (transaction) => {
      const existing = await transaction.selectFrom('project_workspace').selectAll().execute()
      if (
        existing.some(
          (row) =>
            normalizeSearchName(row.display_name.trim()) ===
            normalizeSearchName(parsed.displayName),
        )
      ) {
        throw new ProjectIndexError(
          'WORKSPACE_NAME_EXISTS',
          'A workspace with this name already exists.',
        )
      }
      if (existing.some((row) => pathsOverlap(row.directory_path, directoryPath))) {
        throw new ProjectIndexError(
          'WORKSPACE_PATH_CONFLICT',
          'Workspace folders cannot overlap or contain one another.',
        )
      }
      const now = new Date().toISOString()
      await transaction
        .insertInto('project_workspace')
        .values({
          color: record.color,
          created_at: now,
          directory_path: directoryPath,
          display_name: record.displayName,
          id: record.id,
          is_default: 0,
          updated_at: now,
        })
        .execute()
      return record
    })
  }

  async ensureDefaultWorkspace(dataRoot: string): Promise<ProjectWorkspaceRecord> {
    if (!path.isAbsolute(dataRoot)) {
      throw new ProjectIndexError('WORKSPACE_UNAVAILABLE', 'Application data path is invalid.')
    }
    const appRoot = await realpath(dataRoot)
    const expectedPath = path.join(appRoot, 'workspaces', 'Uncategorized')
    const existing = await this.db
      .selectFrom('project_workspace')
      .selectAll()
      .where('id', '=', UNCATEGORIZED_WORKSPACE_ID)
      .executeTakeFirst()
    if (existing) {
      if (existing.directory_path !== expectedPath) {
        throw new ProjectIndexError(
          'WORKSPACE_UNAVAILABLE',
          'The default workspace moved without a managed migration.',
        )
      }
      // A registered missing folder is recoverable metadata, not permission to recreate it.
      return workspaceRecord(existing)
    }
    const workspacesRoot = await ensureDirectory(appRoot, 'workspaces')
    const directoryPath = await ensureDirectory(workspacesRoot, 'Uncategorized')
    const record: ProjectWorkspaceRecord = {
      color: 'teal',
      directoryPath,
      displayName: 'Uncategorized',
      id: UNCATEGORIZED_WORKSPACE_ID,
    }
    const now = new Date().toISOString()
    await this.db
      .insertInto('project_workspace')
      .values({
        color: record.color,
        created_at: now,
        directory_path: record.directoryPath,
        display_name: record.displayName,
        id: record.id,
        is_default: 1,
        updated_at: now,
      })
      .onConflict((conflict) => conflict.column('id').doNothing())
      .execute()
    const stored = await this.workspaceById(record.id)
    if (stored.directoryPath !== record.directoryPath) {
      throw new ProjectIndexError(
        'WORKSPACE_UNAVAILABLE',
        'The default workspace moved without a managed migration.',
      )
    }
    return stored
  }

  /** Resolve a Home resource without scanning every Project in the workspace again. */
  async getProject(projectId: string): Promise<ProjectIndexRecord | null> {
    if (!/^project-v1-[a-f0-9]{64}$/.test(projectId)) {
      return null
    }
    const row = await this.db
      .selectFrom('project_index')
      .selectAll()
      .where('local_project_key', '=', projectId)
      .where('trashed_at', 'is', null)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('project_file_lifecycle')
              .select('local_project_key')
              .whereRef(
                'project_file_lifecycle.local_project_key',
                '=',
                'project_index.local_project_key',
              ),
          ),
        ),
      )
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('project_relocation')
              .select('local_project_key')
              .whereRef(
                'project_relocation.local_project_key',
                '=',
                'project_index.local_project_key',
              ),
          ),
        ),
      )
      .executeTakeFirst()
    return row ? indexRecord(row) : null
  }

  /** Trash thumbnails remain read-only; pending permanent deletion never publishes a resource. */
  async getProjectForPreview(projectId: string): Promise<ProjectIndexRecord | null> {
    if (!/^project-v1-[a-f0-9]{64}$/.test(projectId)) {
      return null
    }
    const lifecycle = await this.trash.get(projectId)
    if (!lifecycle) {
      return await this.getProject(projectId)
    }
    if (lifecycle.state !== 'trashed') {
      return null
    }
    const workspace = (await this.listWorkspaces()).find(
      (candidate) => candidate.directoryPath === lifecycle.workspaceDirectoryPath,
    )
    return workspace ? { ...lifecycle.project, workspaceId: workspace.id } : null
  }

  async getSavedAcceptedResult(
    localProjectKey: string,
    layerId: string,
  ): Promise<ProjectSavedAcceptedResultRecord | null> {
    if (
      typeof localProjectKey !== 'string' ||
      !/^project-v1-[a-f0-9]{64}$/.test(localProjectKey) ||
      !isProjectDocumentId(layerId)
    ) {
      return null
    }
    return (
      (await savedResultQuery(this.db)
        .where('result.local_project_key', '=', localProjectKey)
        .where('result.layer_id', '=', layerId)
        .executeTakeFirst()) ?? null
    )
  }

  async indexSaved(
    filePath: string,
    workspaceId: string,
    options: { expectedDocumentId?: string } = {},
  ): Promise<ProjectIndexRecord> {
    const canonicalPath = await canonicalProjectPath(filePath)
    return await withProjectPathLock(
      canonicalPath,
      async () => await this.indexSavedLocked(canonicalPath, workspaceId, options),
    )
  }

  /** One read-only projection for Home sorting; paths and frozen lifecycle snapshots stay separate. */
  async listProjectModifiedTimes(workspaceId?: string): Promise<Map<string, string | null>> {
    let query = this.db.selectFrom('project_index').select(['local_project_key', 'file_mtime_ns'])
    if (workspaceId !== undefined) {
      query = query.where('workspace_id', '=', workspaceId)
    }
    const rows = await query.execute()
    return new Map(
      rows.map((row) => [row.local_project_key, fileMtimeToHomeTimestamp(row.file_mtime_ns)]),
    )
  }

  async listProjects(workspaceId?: string): Promise<ProjectIndexRecord[]> {
    let query = this.db
      .selectFrom('project_index')
      .selectAll()
      .where('trashed_at', 'is', null)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('project_file_lifecycle')
              .select('local_project_key')
              .whereRef(
                'project_file_lifecycle.local_project_key',
                '=',
                'project_index.local_project_key',
              ),
          ),
        ),
      )
    query = query.where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('project_relocation')
            .select('local_project_key')
            .whereRef(
              'project_relocation.local_project_key',
              '=',
              'project_index.local_project_key',
            ),
        ),
      ),
    )
    if (workspaceId) {
      query = query.where('workspace_id', '=', workspaceId)
    }
    const rows = await query.orderBy('last_opened_at', 'desc').orderBy('display_name').execute()
    return rows.map(indexRecord)
  }

  /** Last verified saved snapshot, scoped to one Project. Dirty tabs and shadow are not sources. */
  async listSavedAcceptedResults(
    localProjectKey: string,
  ): Promise<ProjectSavedAcceptedResultRecord[]> {
    if (typeof localProjectKey !== 'string' || !/^project-v1-[a-f0-9]{64}$/.test(localProjectKey)) {
      return []
    }
    return await savedResultQuery(this.db)
      .where('result.local_project_key', '=', localProjectKey)
      .orderBy('result.accepted_at', 'desc')
      .orderBy('result.layer_id')
      .execute()
  }

  /** A bounded global metadata page; source revalidation belongs to Refresh/preview/Open. */
  async listSavedAcceptedResultsPage(
    cursor?: AcceptedResultHistoryCursor | null,
  ): Promise<ProjectSavedAcceptedResultsPage> {
    if (cursor !== undefined && cursor !== null && !isAcceptedResultHistoryCursor(cursor)) {
      throw new ProjectIndexError(
        'INDEX_CURSOR_INVALID',
        'The accepted-result page cursor is invalid.',
      )
    }
    const reviewedCursor = cursor ? { ...cursor } : null
    return await this.db.transaction().execute(async (transaction) => {
      const count = await savedResultQuery(transaction)
        .clearSelect()
        .select(transaction.fn.countAll<number>().as('totalCount'))
        .executeTakeFirstOrThrow()
      let query = savedResultQuery(transaction)
        .orderBy('result.accepted_at', 'desc')
        .orderBy('result.local_project_key')
        .orderBy('result.layer_id')
        .limit(ACCEPTED_RESULT_HISTORY_PAGE_SIZE + 1)
      if (reviewedCursor) {
        query = query.where((eb) =>
          eb.or([
            eb('result.accepted_at', '<', reviewedCursor.acceptedAt),
            eb.and([
              eb('result.accepted_at', '=', reviewedCursor.acceptedAt),
              eb('result.local_project_key', '>', reviewedCursor.projectKey),
            ]),
            eb.and([
              eb('result.accepted_at', '=', reviewedCursor.acceptedAt),
              eb('result.local_project_key', '=', reviewedCursor.projectKey),
              eb('result.layer_id', '>', reviewedCursor.layerId),
            ]),
          ]),
        )
      }
      const rows = await query.execute()
      const items = rows.slice(0, ACCEPTED_RESULT_HISTORY_PAGE_SIZE)
      const last = items.at(-1)
      return {
        items,
        nextCursor:
          rows.length > ACCEPTED_RESULT_HISTORY_PAGE_SIZE && last
            ? {
                acceptedAt: last.acceptedAt,
                layerId: last.layerId,
                projectKey: last.localProjectKey,
              }
            : null,
        totalCount: Number(count.totalCount),
      }
    })
  }

  async listWorkspaces(): Promise<ProjectWorkspaceRecord[]> {
    const rows = await this.db
      .selectFrom('project_workspace')
      .selectAll()
      .orderBy('is_default', 'desc')
      .orderBy('display_name')
      .orderBy('id')
      .execute()
    return rows.map(workspaceRecord)
  }

  async markOpened(canonicalPath: string): Promise<void> {
    await this.db
      .updateTable('project_index')
      .set({ last_opened_at: new Date().toISOString() })
      .where('canonical_path', '=', canonicalPath)
      .execute()
  }

  /** Forget a proven missing file's derived Home row; recovery/location owners are untouched. */
  async removeMissingProject(
    expected: ProjectIndexRecord,
    assertClosed: () => void,
  ): Promise<void> {
    await withProjectPathLock(expected.canonicalPath, async () => {
      await this.db.transaction().execute(async (transaction) => {
        const row = await transaction
          .selectFrom('project_index')
          .selectAll()
          .where('local_project_key', '=', expected.localProjectKey)
          .executeTakeFirst()
        const workspace = row
          ? await transaction
              .selectFrom('project_workspace')
              .selectAll()
              .where('id', '=', row.workspace_id)
              .executeTakeFirst()
          : undefined
        const lifecycle = await transaction
          .selectFrom('project_file_lifecycle')
          .select('local_project_key')
          .where('local_project_key', '=', expected.localProjectKey)
          .executeTakeFirst()
        const relocation = await transaction
          .selectFrom('project_relocation')
          .select('local_project_key')
          .where('local_project_key', '=', expected.localProjectKey)
          .executeTakeFirst()
        if (
          !row ||
          !workspace ||
          row.canonical_path !== expected.canonicalPath ||
          row.workspace_id !== expected.workspaceId ||
          row.file_health !== 'missing' ||
          row.trashed_at !== null ||
          lifecycle ||
          relocation ||
          path.dirname(row.canonical_path) !== workspace.directory_path ||
          path.extname(row.canonical_path).toLowerCase() !== '.igs'
        ) {
          throw new ProjectIndexError(
            'INDEX_FILE_CHANGED',
            'Refresh Home before removing this missing entry.',
          )
        }
        const assertMissing = async () => {
          assertClosed()
          await assertWorkspaceDirectory(workspace.directory_path)
          try {
            await lstat(row.canonical_path)
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error
            }
            // ENOENT can also mean the parent disappeared. Recheck its canonical access.
            await assertWorkspaceDirectory(workspace.directory_path)
            assertClosed()
            return
          }
          throw new ProjectIndexError(
            'INDEX_FILE_CHANGED',
            'The Project path exists again. Refresh Home to inspect it before removing an entry.',
          )
        }
        await assertMissing()
        // Only the derived accepted-result index cascades, as for Remove Workspace.
        await transaction
          .deleteFrom('project_index')
          .where('local_project_key', '=', row.local_project_key)
          .execute()
        // Any reappearance or operation admitted during the await rolls the transaction back.
        await assertMissing()
      })
    })
  }

  /** Forget only rebuildable registrations, adapting Invoke's guarded metadata transaction. */
  async removeWorkspace(
    workspaceId: string,
    assertNoOpenProjects: (workspace: ProjectWorkspaceRecord) => void,
  ): Promise<void> {
    if (!isProjectWorkspaceId(workspaceId)) {
      throw new ProjectIndexError('WORKSPACE_INVALID_INPUT', 'The workspace ID is invalid.')
    }
    await this.db.transaction().execute(async (transaction) => {
      const row = await transaction
        .selectFrom('project_workspace')
        .selectAll()
        .where('id', '=', workspaceId)
        .executeTakeFirst()
      if (!row) {
        throw new ProjectIndexError(
          'WORKSPACE_UNAVAILABLE',
          'The Project workspace is unavailable.',
        )
      }
      if (row.id === UNCATEGORIZED_WORKSPACE_ID || row.is_default === 1) {
        throw new ProjectIndexError('WORKSPACE_PROTECTED', 'Uncategorized cannot be removed.')
      }
      const workspace = workspaceRecord(row)
      assertNoOpenProjects(workspace)
      // Only the derived accepted-result index cascades. Operational records and files survive.
      await transaction
        .deleteFrom('project_index')
        .where('workspace_id', '=', workspaceId)
        .execute()
      assertNoOpenProjects(workspace)
      await transaction.deleteFrom('project_workspace').where('id', '=', workspaceId).execute()
      assertNoOpenProjects(workspace)
    })
  }

  async requireWritableWorkspace(workspaceId: string): Promise<ProjectWorkspaceRecord> {
    const workspace = await this.workspaceById(workspaceId)
    await this.assertWritableWorkspace(workspace)
    return workspace
  }

  /** Rescan can reconstruct a lost index without the old database or preview cache. */
  async scanWorkspace(workspaceId: string): Promise<ProjectIndexRecord[]> {
    const workspace = await this.workspaceById(workspaceId)
    await assertWorkspaceDirectory(workspace.directoryPath)
    const indexedAtStart = await this.listProjects(workspaceId)
    const entries = await readdir(workspace.directoryPath, { withFileTypes: true }).catch(
      (error: unknown) => {
        if (isUnavailablePathError(error)) {
          throw new ProjectIndexError(
            'WORKSPACE_UNAVAILABLE',
            'The Project workspace is unavailable.',
          )
        }
        throw error
      },
    )
    const movingPaths = new Set(
      (await this.relocations.list()).flatMap((entry) => [entry.sourcePath, entry.destinationPath]),
    )
    const seen = new Set<string>()
    for (const entry of entries) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.igs') {
        continue
      }
      const filePath = path.join(workspace.directoryPath, entry.name)
      seen.add(filePath)
      const lifecycle = await this.db
        .selectFrom('project_file_lifecycle')
        .select('local_project_key')
        .where('canonical_path', '=', filePath)
        .executeTakeFirst()
      if (
        movingPaths.has(filePath) ||
        (lifecycle && (await this.trash.get(lifecycle.local_project_key)))
      ) {
        continue
      }
      try {
        await this.indexSaved(filePath, workspaceId)
      } catch (error) {
        if (error instanceof IgsSchemaError) {
          await this.indexUnhealthy(filePath, workspaceId, error.code)
        } else if (error instanceof IgsPackageError) {
          if (error.code !== 'PACKAGE_CHANGED') {
            await this.indexUnhealthy(filePath, workspaceId, error.code)
          }
        } else if (error instanceof ProjectIndexError && error.code === 'INDEX_FILE_CHANGED') {
          // An atomic Save can replace a file during scan. The next scan retries.
        } else if (
          (error instanceof ProjectIdentityError && error.code === 'PROJECT_PATH_UNAVAILABLE') ||
          (error as NodeJS.ErrnoException).code === 'ENOENT'
        ) {
          if (!(await pathExists(filePath))) {
            await this.indexUnhealthy(filePath, workspaceId, 'FILE_MISSING')
          } else {
            throw error
          }
        } else {
          // Scope failures and SQLite errors are not evidence of corrupt .igs bytes.
          throw error
        }
      }
    }
    for (const row of indexedAtStart) {
      if (!seen.has(row.canonicalPath)) {
        const entry = await lstat(row.canonicalPath).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null
          }
          throw error
        })
        if (!entry) {
          await this.indexUnhealthy(row.canonicalPath, workspaceId, 'FILE_MISSING')
        } else if (!entry.isFile() || entry.isSymbolicLink()) {
          await this.indexUnhealthy(row.canonicalPath, workspaceId, 'UNSAFE_ENTRY')
        }
      }
    }
    return await this.listProjects(workspaceId)
  }

  /** Keep the immutable folder identity while changing bounded named-record metadata. */
  async updateWorkspace(
    workspaceId: string,
    input: ProjectWorkspaceAddInput,
  ): Promise<ProjectWorkspaceRecord> {
    if (!isProjectWorkspaceId(workspaceId)) {
      throw new ProjectIndexError('WORKSPACE_INVALID_INPUT', 'The workspace ID is invalid.')
    }
    let parsed: ProjectWorkspaceAddInput
    try {
      parsed = parseProjectWorkspaceAddInput(input)
    } catch {
      throw new ProjectIndexError('WORKSPACE_INVALID_INPUT', 'The workspace details are invalid.')
    }
    return await this.db.transaction().execute(async (transaction) => {
      const rows = await transaction.selectFrom('project_workspace').selectAll().execute()
      const current = rows.find((row) => row.id === workspaceId)
      if (!current) {
        throw new ProjectIndexError(
          'WORKSPACE_UNAVAILABLE',
          'The Project workspace is unavailable.',
        )
      }
      if (
        (current.id === UNCATEGORIZED_WORKSPACE_ID || current.is_default === 1) &&
        parsed.displayName !== current.display_name
      ) {
        throw new ProjectIndexError('WORKSPACE_PROTECTED', 'Uncategorized cannot be renamed.')
      }
      if (
        rows.some(
          (row) =>
            row.id !== workspaceId &&
            normalizeSearchName(row.display_name.trim()) ===
              normalizeSearchName(parsed.displayName),
        )
      ) {
        throw new ProjectIndexError(
          'WORKSPACE_NAME_EXISTS',
          'A workspace with this name already exists.',
        )
      }
      await transaction
        .updateTable('project_workspace')
        .set({
          color: parsed.color,
          display_name: parsed.displayName,
          updated_at: new Date().toISOString(),
        })
        .where('id', '=', workspaceId)
        .execute()
      const saved = await transaction
        .selectFrom('project_workspace')
        .selectAll()
        .where('id', '=', workspaceId)
        .executeTakeFirstOrThrow()
      return workspaceRecord(saved)
    })
  }

  async workspaceAvailability(
    workspace: ProjectWorkspaceRecord,
  ): Promise<Pick<ProjectWorkspaceSummary, 'availability' | 'writable'>> {
    let mode: number
    try {
      const entry = await lstat(workspace.directoryPath)
      mode = entry.mode
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        (await realpath(workspace.directoryPath)) !== workspace.directoryPath
      ) {
        return { availability: 'inaccessible', writable: false }
      }
      if ((mode & 0o444) === 0 || (mode & 0o111) === 0) {
        return { availability: 'inaccessible', writable: false }
      }
      await access(workspace.directoryPath, constants.R_OK | constants.X_OK)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (isUnavailablePathError(error)) {
        return {
          availability: code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'inaccessible',
          writable: false,
        }
      }
      throw error
    }
    // Explicit read-only filesystem permissions remain a refusal even for a privileged launcher.
    if ((mode & 0o222) === 0) {
      return { availability: 'available', writable: false }
    }
    try {
      await access(workspace.directoryPath, constants.W_OK | constants.X_OK)
      return { availability: 'available', writable: true }
    } catch (error) {
      if (isUnavailablePathError(error)) {
        return { availability: 'available', writable: false }
      }
      throw error
    }
  }

  async workspaceById(workspaceId: string): Promise<ProjectWorkspaceRecord> {
    const row = await this.db
      .selectFrom('project_workspace')
      .select(['id', 'display_name', 'directory_path', 'color'])
      .where('id', '=', workspaceId)
      .executeTakeFirst()
    if (!row) {
      throw new ProjectIndexError('WORKSPACE_UNAVAILABLE', 'The Project workspace is unavailable.')
    }
    return workspaceRecord(row)
  }

  protected async indexUnhealthy(
    filePath: string,
    workspaceId: string,
    diagnosticCode: string,
  ): Promise<void> {
    await withProjectPathLock(filePath, async () => {
      const workspace = await this.workspaceById(workspaceId)
      if (path.dirname(filePath) !== workspace.directoryPath) {
        throw new ProjectIndexError('INDEX_OUTSIDE_WORKSPACE', 'Project path is outside workspace.')
      }
      await assertWorkspaceDirectory(workspace.directoryPath)
      const currentDiagnostic = await diagnoseCurrentFile(filePath)
      if (!currentDiagnostic) {
        // The package was repaired or recreated while this scan was running.
        return
      }
      await this.indexUnhealthyLocked(filePath, workspaceId, currentDiagnostic)
    })
  }

  private async assertWritableWorkspace(workspace: ProjectWorkspaceRecord): Promise<void> {
    const state = await this.workspaceAvailability(workspace)
    if (state.availability !== 'available') {
      throw new ProjectIndexError(
        'WORKSPACE_UNAVAILABLE',
        'The selected workspace folder is unavailable.',
      )
    }
    if (!state.writable) {
      throw new ProjectIndexError(
        'WORKSPACE_READ_ONLY',
        'The selected workspace folder is read-only.',
      )
    }
  }

  private async indexSavedLocked(
    canonicalPath: string,
    workspaceId: string,
    options: { expectedDocumentId?: string },
  ): Promise<ProjectIndexRecord> {
    if (
      (await this.relocations.list()).some(
        (move) => move.sourcePath === canonicalPath || move.destinationPath === canonicalPath,
      )
    ) {
      throw new ProjectIndexError(
        'PROJECT_MOVE_PENDING',
        'This Project location is reserved by a pending move.',
      )
    }
    const workspace = await this.workspaceById(workspaceId)
    if (path.dirname(canonicalPath) !== workspace.directoryPath) {
      throw new ProjectIndexError(
        'INDEX_OUTSIDE_WORKSPACE',
        'A Project must be a direct file in its workspace.',
      )
    }
    const before = await fileIdentity(canonicalPath)
    const packageResult = await readIgsPackage(canonicalPath)
    const after = await fileIdentity(canonicalPath)
    if (before.fingerprint !== after.fingerprint) {
      throw new ProjectIndexError('INDEX_FILE_CHANGED', 'The Project changed during indexing.')
    }
    const now = new Date().toISOString()
    const project = packageResult.project
    if (options.expectedDocumentId && project.documentId !== options.expectedDocumentId) {
      throw new ProjectIndexError(
        'INDEX_FILE_CHANGED',
        'The trashed file was replaced by another Project document.',
      )
    }
    const key = await ensureProjectLocationIdentity(this.db, canonicalPath, project.documentId)
    const thumbnailSha256 = packageResult.manifest.members.find(
      (member) => member.path === 'preview/thumbnail.webp',
    )?.sha256
    if (!thumbnailSha256) {
      throw new ProjectIndexError('INDEX_FILE_CHANGED', 'The Project preview is unavailable.')
    }
    const values = {
      bbox_height: project.primaryBbox.height,
      bbox_width: project.primaryBbox.width,
      canonical_path: canonicalPath,
      diagnostic_code: null,
      display_name: project.title,
      document_id: project.documentId,
      document_revision: project.documentRevision,
      file_fingerprint: after.fingerprint,
      file_health: 'ready',
      file_mtime_ns: after.mtimeNs,
      file_size_bytes: after.size,
      indexed_at: now,
      local_project_key: key,
      preview_status: packageResult.manifest.preview.status,
      preview_thumbnail_sha256: thumbnailSha256,
      search_name: normalizeSearchName(project.title),
      workspace_id: workspaceId,
    } as const
    // The raster UUID identifies each result, including every inactive nested variant.
    // Parent Patch and candidate IDs are neither result identity nor catalog membership.
    const savedResults = projectRasterAssets(project).flatMap((layer) => {
      const provenance = layer.generationProvenance
      if (!provenance) {
        return []
      }
      const { executionResultContext, generationConfiguration } = provenance
      return [
        {
          accepted_at: executionResultContext.acceptedAt,
          actual_seed: generationConfiguration.sampling.actualSeed,
          asset_bytes: layer.asset.bytes,
          asset_height: layer.asset.height,
          asset_path: layer.asset.path,
          asset_sha256: layer.asset.sha256,
          asset_width: layer.asset.width,
          document_id: project.documentId,
          document_revision: project.documentRevision,
          layer_id: layer.id,
          layer_name: layer.name,
          local_project_key: key,
          model_file_sha256: generationConfiguration.model.fileSha256,
          model_name: generationConfiguration.model.displayName,
          model_version_name: generationConfiguration.model.versionName,
          output_height: executionResultContext.output.height,
          output_width: executionResultContext.output.width,
        },
      ]
    })
    await this.db.transaction().execute(async (transaction) => {
      const lifecycle = await transaction
        .selectFrom('project_file_lifecycle')
        .select(['state', 'trashed_at'])
        .where('local_project_key', '=', key)
        .executeTakeFirst()
      if (lifecycle?.state === 'deleting') {
        throw new ProjectIndexError(
          'PROJECT_TRASHED',
          'Permanent deletion of this Project is pending.',
        )
      }
      await transaction
        .insertInto('project_index')
        .values({ ...values, last_opened_at: null, trashed_at: lifecycle?.trashed_at ?? null })
        .onConflict((conflict) =>
          conflict.column('local_project_key').doUpdateSet({
            bbox_height: values.bbox_height,
            bbox_width: values.bbox_width,
            canonical_path: values.canonical_path,
            diagnostic_code: null,
            display_name: values.display_name,
            document_id: values.document_id,
            document_revision: values.document_revision,
            file_fingerprint: values.file_fingerprint,
            file_health: values.file_health,
            file_mtime_ns: values.file_mtime_ns,
            file_size_bytes: values.file_size_bytes,
            indexed_at: now,
            preview_status: values.preview_status,
            preview_thumbnail_sha256: values.preview_thumbnail_sha256,
            search_name: values.search_name,
            ...(lifecycle ? { trashed_at: lifecycle.trashed_at } : {}),
            workspace_id: values.workspace_id,
          }),
        )
        .execute()
      await transaction
        .deleteFrom('project_accepted_result_index')
        .where('local_project_key', '=', key)
        .execute()
      // A full document can contain thousands of small results. Keep statement bindings bounded;
      // every batch and the parent Home row still share this one transaction.
      for (let offset = 0; offset < savedResults.length; offset += 100) {
        await transaction
          .insertInto('project_accepted_result_index')
          .values(savedResults.slice(offset, offset + 100))
          .execute()
      }
    })
    const indexed = await this.db
      .selectFrom('project_index')
      .select('last_opened_at')
      .where('local_project_key', '=', key)
      .executeTakeFirstOrThrow()
    return {
      bboxHeight: project.primaryBbox.height,
      bboxWidth: project.primaryBbox.width,
      canonicalPath,
      diagnosticCode: null,
      displayName: project.title,
      documentId: project.documentId,
      documentRevision: project.documentRevision,
      fileFingerprint: after.fingerprint,
      fileHealth: 'ready',
      lastOpenedAt: indexed.last_opened_at,
      localProjectKey: key,
      previewStatus: packageResult.manifest.preview.status,
      thumbnailSha256,
      workspaceId,
    }
  }

  private async indexUnhealthyLocked(
    filePath: string,
    workspaceId: string,
    diagnosticCode: string,
  ): Promise<void> {
    // An unreadable replacement has no validated document ID for a fresh binding. Keep the
    // moved identity reserved and isolate this one path until its package can be validated.
    if (hasRelocatedKeyCollision(filePath)) {
      return
    }
    const key = localProjectRecoveryKey(filePath)
    const existing = await this.db
      .selectFrom('project_index')
      .selectAll()
      .where('local_project_key', '=', key)
      .executeTakeFirst()
    const health =
      diagnosticCode === 'FILE_MISSING'
        ? 'missing'
        : diagnosticCode === 'UNSUPPORTED_SCHEMA'
          ? 'unsupported_schema'
          : 'corrupt'
    const name = existing?.display_name ?? (path.basename(filePath, '.igs') || 'Untitled Project')
    const now = new Date().toISOString()
    await this.db.transaction().execute(async (transaction) => {
      if (
        await transaction
          .selectFrom('project_file_lifecycle')
          .select('local_project_key')
          .where('local_project_key', '=', key)
          .executeTakeFirst()
      ) {
        return
      }
      await transaction
        .insertInto('project_index')
        .values({
          bbox_height: existing?.bbox_height ?? null,
          bbox_width: existing?.bbox_width ?? null,
          canonical_path: filePath,
          diagnostic_code: diagnosticCode,
          display_name: name,
          document_id: existing?.document_id ?? null,
          document_revision: existing?.document_revision ?? null,
          file_fingerprint: null,
          file_health: health,
          file_mtime_ns: null,
          file_size_bytes: null,
          indexed_at: now,
          last_opened_at: existing?.last_opened_at ?? null,
          local_project_key: key,
          preview_status: existing?.preview_status ?? null,
          preview_thumbnail_sha256: null,
          search_name: normalizeSearchName(name),
          trashed_at: existing?.trashed_at ?? null,
          workspace_id: workspaceId,
        })
        .onConflict((conflict) =>
          conflict.column('local_project_key').doUpdateSet({
            diagnostic_code: diagnosticCode,
            file_fingerprint: null,
            file_health: health,
            file_mtime_ns: null,
            file_size_bytes: null,
            indexed_at: now,
            preview_thumbnail_sha256: null,
          }),
        )
        .execute()
    })
  }
}

/** Shared eligibility for Project reads, global counts/pages and saved-result capability lookup. */
function savedResultQuery(db: Kysely<DB>) {
  return db
    .selectFrom('project_accepted_result_index as result')
    .innerJoin('project_index as project', (join) =>
      join
        .onRef('project.local_project_key', '=', 'result.local_project_key')
        .onRef('project.document_id', '=', 'result.document_id')
        .onRef('project.document_revision', '=', 'result.document_revision'),
    )
    .select([
      'result.accepted_at as acceptedAt',
      'result.actual_seed as actualSeed',
      'result.asset_bytes as assetBytes',
      'result.asset_height as assetHeight',
      'result.asset_path as assetPath',
      'result.asset_sha256 as assetSha256',
      'result.asset_width as assetWidth',
      'project.canonical_path as canonicalPath',
      'result.document_id as documentId',
      'result.document_revision as documentRevision',
      'project.file_fingerprint as fileFingerprint',
      'result.layer_id as layerId',
      'result.layer_name as layerName',
      'result.local_project_key as localProjectKey',
      'result.model_file_sha256 as modelFileSha256',
      'result.model_name as modelName',
      'result.model_version_name as modelVersionName',
      'result.output_height as outputHeight',
      'result.output_width as outputWidth',
      'project.display_name as projectTitle',
    ])
    .where('project.file_health', '=', 'ready')
    .where('project.trashed_at', 'is', null)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('project_file_lifecycle as lifecycle')
            .select('lifecycle.local_project_key')
            .whereRef('lifecycle.local_project_key', '=', 'project.local_project_key'),
        ),
      ),
    )
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('project_relocation as relocating')
            .select('relocating.local_project_key')
            .whereRef('relocating.local_project_key', '=', 'project.local_project_key'),
        ),
      ),
    )
    .where('project.file_fingerprint', 'is not', null)
    .$narrowType<{ fileFingerprint: string }>()
}

function indexRecord(row: DB['project_index']): ProjectIndexRecord {
  return {
    bboxHeight: row.bbox_height,
    bboxWidth: row.bbox_width,
    canonicalPath: row.canonical_path,
    diagnosticCode: row.diagnostic_code,
    displayName: row.display_name,
    documentId: row.document_id,
    documentRevision: row.document_revision,
    fileFingerprint: row.file_fingerprint,
    fileHealth: row.file_health as ProjectIndexRecord['fileHealth'],
    lastOpenedAt: row.last_opened_at,
    localProjectKey: row.local_project_key,
    previewStatus: row.preview_status as ProjectIndexRecord['previewStatus'],
    thumbnailSha256: row.preview_thumbnail_sha256,
    workspaceId: row.workspace_id,
  }
}

function workspaceRecord(
  row: Pick<DB['project_workspace'], 'color' | 'directory_path' | 'display_name' | 'id'>,
): ProjectWorkspaceRecord {
  return {
    color: row.color,
    directoryPath: row.directory_path,
    displayName: row.display_name,
    id: row.id,
  }
}

function pathsOverlap(first: string, second: string): boolean {
  const contains = (parent: string, child: string): boolean => {
    const relative = path.relative(parent, child)
    return (
      relative === '' ||
      (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    )
  }
  return contains(first, second) || contains(second, first)
}

async function ensureDirectory(parent: string, name: string): Promise<string> {
  const directory = path.join(parent, name)
  await mkdir(directory, { recursive: true })
  const entry = await lstat(directory)
  if (!entry.isDirectory() || entry.isSymbolicLink() || (await realpath(directory)) !== directory) {
    throw new ProjectIndexError('WORKSPACE_UNAVAILABLE', 'The Project workspace path is unsafe.')
  }
  return directory
}

async function assertWorkspaceDirectory(directory: string): Promise<void> {
  try {
    const entry = await lstat(directory)
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      (entry.mode & 0o444) === 0 ||
      (entry.mode & 0o111) === 0 ||
      (await realpath(directory)) !== directory
    ) {
      throw new ProjectIndexError('WORKSPACE_UNAVAILABLE', 'The Project workspace path is unsafe.')
    }
    await access(directory, constants.R_OK | constants.X_OK)
  } catch (error) {
    if (isUnavailablePathError(error)) {
      throw new ProjectIndexError('WORKSPACE_UNAVAILABLE', 'The Project workspace is unavailable.')
    }
    throw error
  }
}

async function diagnoseCurrentFile(filePath: string): Promise<string | null> {
  let entry
  try {
    entry = await lstat(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'FILE_MISSING'
    }
    throw error
  }
  if (!entry.isFile() || entry.isSymbolicLink()) {
    return 'UNSAFE_ENTRY'
  }
  try {
    await readIgsPackage(filePath)
    return null
  } catch (error) {
    if (error instanceof IgsSchemaError) {
      return error.code
    }
    if (error instanceof IgsPackageError) {
      return error.code === 'PACKAGE_CHANGED' ? null : error.code
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

function isUnavailablePathError(error: unknown): boolean {
  return ['EACCES', 'ELOOP', 'ENOENT', 'ENOTDIR', 'EPERM', 'EROFS'].includes(
    (error as NodeJS.ErrnoException).code ?? '',
  )
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function fileIdentity(
  filePath: string,
): Promise<{ fingerprint: string; mtimeNs: string; size: number }> {
  const stat = await lstat(filePath, { bigint: true })
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ProjectIndexError('INDEX_FILE_CHANGED', 'The Project file changed or is unsafe.')
  }
  return {
    fingerprint: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`,
    mtimeNs: stat.mtimeNs.toString(),
    size: Number(stat.size),
  }
}

function normalizeSearchName(value: string): string {
  return value.normalize('NFKC').toLowerCase()
}
