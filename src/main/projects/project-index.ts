import { IgsSchemaError } from '../../shared/projects/project-schema.js'

import type { Kysely } from 'kysely'

import { lstat, mkdir, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'

import type { DB } from '../db/database.types.js'

import { IgsPackageError, readIgsPackage } from './igs-package.js'
import {
  canonicalProjectPath,
  localProjectRecoveryKey,
  ProjectIdentityError,
} from './project-identity.js'
import { withProjectPathLock } from './project-path-lock.js'

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
  fileHealth: 'corrupt' | 'missing' | 'ready' | 'unsupported_schema'
  lastOpenedAt: string | null
  localProjectKey: string
  previewStatus: 'empty' | 'rendered' | 'unavailable' | null
  workspaceId: string
}

export class ProjectIndexError extends Error {
  constructor(
    readonly code: 'INDEX_FILE_CHANGED' | 'INDEX_OUTSIDE_WORKSPACE' | 'WORKSPACE_UNAVAILABLE',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectIndexError'
  }
}

/** Rebuildable Home metadata. No Project pixels or layer document live in SQLite. */
export class ProjectIndexRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async ensureDefaultWorkspace(dataRoot: string): Promise<ProjectWorkspaceRecord> {
    if (!path.isAbsolute(dataRoot)) {
      throw new ProjectIndexError('WORKSPACE_UNAVAILABLE', 'Application data path is invalid.')
    }
    const appRoot = await realpath(dataRoot)
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

  async indexSaved(filePath: string, workspaceId: string): Promise<ProjectIndexRecord> {
    const canonicalPath = await canonicalProjectPath(filePath)
    return await withProjectPathLock(
      canonicalPath,
      async () => await this.indexSavedLocked(canonicalPath, workspaceId),
    )
  }

  async listProjects(workspaceId?: string): Promise<ProjectIndexRecord[]> {
    let query = this.db.selectFrom('project_index').selectAll().where('trashed_at', 'is', null)
    if (workspaceId) {
      query = query.where('workspace_id', '=', workspaceId)
    }
    const rows = await query.orderBy('last_opened_at', 'desc').orderBy('display_name').execute()
    return rows.map((row) => ({
      bboxHeight: row.bbox_height,
      bboxWidth: row.bbox_width,
      canonicalPath: row.canonical_path,
      diagnosticCode: row.diagnostic_code,
      displayName: row.display_name,
      documentId: row.document_id,
      documentRevision: row.document_revision,
      fileHealth: row.file_health as ProjectIndexRecord['fileHealth'],
      lastOpenedAt: row.last_opened_at,
      localProjectKey: row.local_project_key,
      previewStatus: row.preview_status as ProjectIndexRecord['previewStatus'],
      workspaceId: row.workspace_id,
    }))
  }

  async markOpened(canonicalPath: string): Promise<void> {
    await this.db
      .updateTable('project_index')
      .set({ last_opened_at: new Date().toISOString() })
      .where('canonical_path', '=', canonicalPath)
      .execute()
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
    const seen = new Set<string>()
    for (const entry of entries) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.igs') {
        continue
      }
      const filePath = path.join(workspace.directoryPath, entry.name)
      seen.add(filePath)
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

  async workspaceById(workspaceId: string): Promise<ProjectWorkspaceRecord> {
    const row = await this.db
      .selectFrom('project_workspace')
      .select(['id', 'display_name', 'directory_path', 'color'])
      .where('id', '=', workspaceId)
      .executeTakeFirst()
    if (!row) {
      throw new ProjectIndexError('WORKSPACE_UNAVAILABLE', 'The Project workspace is unavailable.')
    }
    return {
      color: row.color,
      directoryPath: row.directory_path,
      displayName: row.display_name,
      id: row.id,
    }
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

  private async indexSavedLocked(
    canonicalPath: string,
    workspaceId: string,
  ): Promise<ProjectIndexRecord> {
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
    const key = localProjectRecoveryKey(canonicalPath)
    const project = packageResult.project
    const values = {
      bbox_height: project.primaryBbox.height,
      bbox_width: project.primaryBbox.width,
      canonical_path: canonicalPath,
      diagnostic_code: null,
      display_name: project.title,
      document_id: project.documentId,
      document_revision: project.documentRevision,
      file_health: 'ready',
      file_mtime_ns: after.mtimeNs,
      file_size_bytes: after.size,
      indexed_at: now,
      local_project_key: key,
      preview_status: packageResult.manifest.preview.status,
      search_name: normalizeSearchName(project.title),
      workspace_id: workspaceId,
    } as const
    await this.db
      .insertInto('project_index')
      .values({ ...values, last_opened_at: null, trashed_at: null })
      .onConflict((conflict) =>
        conflict.column('local_project_key').doUpdateSet({
          bbox_height: values.bbox_height,
          bbox_width: values.bbox_width,
          canonical_path: values.canonical_path,
          diagnostic_code: null,
          display_name: values.display_name,
          document_id: values.document_id,
          document_revision: values.document_revision,
          file_health: values.file_health,
          file_mtime_ns: values.file_mtime_ns,
          file_size_bytes: values.file_size_bytes,
          indexed_at: now,
          preview_status: values.preview_status,
          search_name: values.search_name,
          workspace_id: values.workspace_id,
        }),
      )
      .execute()
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
      fileHealth: 'ready',
      lastOpenedAt: indexed.last_opened_at,
      localProjectKey: key,
      previewStatus: packageResult.manifest.preview.status,
      workspaceId,
    }
  }

  private async indexUnhealthyLocked(
    filePath: string,
    workspaceId: string,
    diagnosticCode: string,
  ): Promise<void> {
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
    await this.db
      .insertInto('project_index')
      .values({
        bbox_height: existing?.bbox_height ?? null,
        bbox_width: existing?.bbox_width ?? null,
        canonical_path: filePath,
        diagnostic_code: diagnosticCode,
        display_name: name,
        document_id: existing?.document_id ?? null,
        document_revision: existing?.document_revision ?? null,
        file_health: health,
        file_mtime_ns: null,
        file_size_bytes: null,
        indexed_at: now,
        last_opened_at: existing?.last_opened_at ?? null,
        local_project_key: key,
        preview_status: existing?.preview_status ?? null,
        search_name: normalizeSearchName(name),
        trashed_at: existing?.trashed_at ?? null,
        workspace_id: workspaceId,
      })
      .onConflict((conflict) =>
        conflict.column('local_project_key').doUpdateSet({
          diagnostic_code: diagnosticCode,
          file_health: health,
          file_mtime_ns: null,
          file_size_bytes: null,
          indexed_at: now,
        }),
      )
      .execute()
  }
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
      (await realpath(directory)) !== directory
    ) {
      throw new ProjectIndexError('WORKSPACE_UNAVAILABLE', 'The Project workspace path is unsafe.')
    }
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
  return ['EACCES', 'ENOENT', 'ENOTDIR', 'EPERM'].includes(
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
