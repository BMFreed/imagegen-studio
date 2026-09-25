import type {
  ProjectOpenResult,
  ProjectSaveResult,
  ProjectSummary,
  ProjectTab,
} from '../../shared/api.js'
import {
  createEmptyProjectDocumentV1,
  IGS_SAFETY_CEILINGS,
  type IgsRectV1,
  IgsSchemaError,
} from '../../shared/projects/project-schema.js'

import { randomUUID } from 'node:crypto'
import path from 'node:path'

import type { ProjectIndexRepository } from './project-index.js'
import type { ProjectShadowStore } from './project-shadow.js'
import type { ProjectShadowInspection } from './project-shadow.js'

import { ProjectAutosaveCoordinator, type ProjectAutosaveOptions } from './project-autosave.js'
import { canonicalProjectPath, localProjectRecoveryKey } from './project-identity.js'
import { type ProjectIndexRecord, UNCATEGORIZED_WORKSPACE_ID } from './project-index.js'
import { ProjectSession, type ProjectSessionRoots } from './project-session.js'

export type {
  ProjectOpenResult,
  ProjectSaveResult,
  ProjectSummary,
  ProjectTab,
} from '../../shared/api.js'

const PROJECT_ID_PATTERN = /^project-v1-[a-f0-9]{64}$/

export interface ProjectServiceOptions {
  /** Primarily a test seam for deterministic autosave and simulated process restart. */
  autosaveOptions?: ProjectAutosaveOptions
  dataRoot: string
  repository: ProjectIndexRepository
  roots: ProjectSessionRoots
  shadow: ProjectShadowStore
}

export class ProjectServiceError extends Error {
  constructor(
    readonly code:
      | 'PROJECT_ALREADY_OPEN'
      | 'PROJECT_CREATED_NOT_INDEXED'
      | 'PROJECT_DIRTY'
      | 'PROJECT_IDENTITY_MISMATCH'
      | 'PROJECT_INVALID_INPUT'
      | 'PROJECT_NOT_FOUND'
      | 'PROJECT_NOT_OPEN'
      | 'PROJECT_NOT_READY'
      | 'PROJECT_RECOVERY_UNAVAILABLE',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectServiceError'
  }
}

/**
 * The Electron main process owns Project paths, document sessions and recovery decisions. Renderer
 * calls address indexed local keys, never arbitrary filesystem paths or documents.
 */
export class ProjectService {
  private initialization: Promise<void> | undefined
  private readonly opening = new Map<string, Promise<ProjectOpenResult>>()
  private readonly openTabs = new Map<string, ProjectAutosaveCoordinator>()

  constructor(private readonly options: ProjectServiceOptions) {}

  async close(tabId: string): Promise<void> {
    const coordinator = this.requireTab(tabId)
    if (coordinator.dirty) {
      throw new ProjectServiceError(
        'PROJECT_DIRTY',
        'Save or discard the Project changes before closing this tab.',
      )
    }
    await coordinator.close()
    this.openTabs.delete(tabId)
  }

  async create(input: { height: number; title: string; width: number }): Promise<ProjectTab> {
    const { primaryBbox, title } = parseCreateInput(input)
    await this.initialize()
    const workspace = await this.options.repository.workspaceById(UNCATEGORIZED_WORKSPACE_ID)
    // A random basename avoids path traversal, invalid filename characters and title collisions.
    // createOnly in ProjectSession still rejects an unexpected UUID collision.
    const filePath = path.join(workspace.directoryPath, `project-${randomUUID()}.igs`)
    const session = await ProjectSession.create(
      filePath,
      title,
      this.options.roots,
      primaryBbox,
      workspace.directoryPath,
    )
    // Indexing is derived. On failure the committed .igs remains in the workspace so a later
    // scan can discover it; removing the file here would lose the user's new Project.
    try {
      await this.options.repository.indexSaved(session.filePath, workspace.id)
    } catch {
      throw new ProjectServiceError(
        'PROJECT_CREATED_NOT_INDEXED',
        'The .igs file was created in Uncategorized, but Home could not index it. Retry loading Home to rediscover the file.',
      )
    }
    const coordinator = await ProjectAutosaveCoordinator.attach(
      session,
      this.options.roots,
      this.options.shadow,
      this.options.autosaveOptions,
    )
    this.openTabs.set(session.localRecoveryKey, coordinator)
    await this.markOpenedBestEffort(session.filePath)
    return {
      ...toTab(session.localRecoveryKey, coordinator),
      ...(session.creationDirectorySynced === false
        ? {
            storageWarning:
              'The Project file was created, but the filesystem did not confirm directory sync. Save again to reinforce it.',
          }
        : {}),
    }
  }

  async discardAndClose(tabId: string): Promise<void> {
    const coordinator = this.requireTab(tabId)
    const clean = await coordinator.discardChanges(this.options.roots)
    // discardChanges transfers the exclusive path lease to its returned coordinator.
    this.openTabs.set(tabId, clean)
    await clean.close()
    this.openTabs.delete(tabId)
  }

  async flushAutosave(tabId: string): Promise<void> {
    await this.requireTab(tabId).flush()
  }

  getOpenTabs(): ProjectTab[] {
    return [...this.openTabs].map(([id, coordinator]) => toTab(id, coordinator))
  }

  hasDirtyTabs(): boolean {
    return [...this.openTabs.values()].some((coordinator) => coordinator.dirty)
  }

  async initialize(): Promise<void> {
    if (!this.initialization) {
      this.initialization = (async () => {
        await this.options.repository.ensureDefaultWorkspace(this.options.dataRoot)
        await this.options.repository.scanWorkspace(UNCATEGORIZED_WORKSPACE_ID)
      })().catch((error: unknown) => {
        this.initialization = undefined
        throw error
      })
    }
    await this.initialization
  }

  async list(): Promise<ProjectSummary[]> {
    await this.initialize()
    const records = await this.options.repository.scanWorkspace(UNCATEGORIZED_WORKSPACE_ID)
    return await Promise.all(records.map(async (record) => await this.toSummary(record)))
  }

  async open(projectId: string): Promise<ProjectOpenResult> {
    assertProjectId(projectId)
    const existing = this.openTabs.get(projectId)
    if (existing) {
      return { kind: 'opened', tab: toTab(projectId, existing) }
    }
    const pending = this.opening.get(projectId)
    if (pending) {
      return await pending
    }
    const opening = this.openOne(projectId)
    this.opening.set(projectId, opening)
    try {
      return await opening
    } finally {
      this.opening.delete(projectId)
    }
  }

  async resolveRecovery(projectId: string, decision: 'discard' | 'recover'): Promise<ProjectTab> {
    assertProjectId(projectId)
    if (decision !== 'recover' && decision !== 'discard') {
      throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'Choose a recovery action.')
    }
    if (this.openTabs.has(projectId)) {
      throw new ProjectServiceError(
        'PROJECT_ALREADY_OPEN',
        'Close the current Project tab before resolving recovery.',
      )
    }
    const record = await this.requireReadyRecord(projectId)
    const inspection = await ProjectAutosaveCoordinator.inspectRecovery(
      record.canonicalPath,
      this.options.shadow,
    )
    if (inspection.status === 'absent' || inspection.status === 'clean') {
      throw new ProjectServiceError(
        'PROJECT_RECOVERY_UNAVAILABLE',
        'There is no pending Project recovery to resolve.',
      )
    }
    if (decision === 'recover' && inspection.status !== 'recoverable') {
      throw new ProjectServiceError(
        'PROJECT_RECOVERY_UNAVAILABLE',
        'The saved Project can be opened after discarding this invalid recovery state.',
      )
    }
    const coordinator =
      decision === 'recover'
        ? await ProjectAutosaveCoordinator.recover(
            record.canonicalPath,
            this.options.roots,
            this.options.shadow,
            {
              ...this.options.autosaveOptions,
              expectedCanonicalPath: record.canonicalPath,
            },
          )
        : await ProjectAutosaveCoordinator.discardRecovery(
            record.canonicalPath,
            this.options.roots,
            this.options.shadow,
            {
              ...this.options.autosaveOptions,
              expectedCanonicalPath: record.canonicalPath,
            },
          )
    this.openTabs.set(projectId, coordinator)
    await this.markOpenedBestEffort(record.canonicalPath)
    return toTab(projectId, coordinator)
  }

  async save(tabId: string): Promise<ProjectSaveResult> {
    const coordinator = this.requireTab(tabId)
    const saved = await coordinator.save()
    let indexWarning: string | undefined
    try {
      await this.options.repository.indexSaved(coordinator.filePath, UNCATEGORIZED_WORKSPACE_ID)
    } catch {
      // The .igs has already committed. Reporting Save as failed would invite a second Save and
      // misstate the saved revision; a later Home scan rebuilds this derived row.
      indexWarning = 'The Project was saved, but its Home index could not be updated.'
    }
    return {
      committed: true,
      directorySynced: saved.directorySynced,
      recoveryStatus: saved.recovery.status,
      reloadRequired: saved.reloadRequired,
      tab: toTab(tabId, coordinator),
      ...(saved.recovery.status === 'failed'
        ? { recoveryError: saved.recovery.error.message }
        : {}),
      ...(indexWarning ? { indexWarning } : {}),
    }
  }

  async setPrimaryBbox(tabId: string, rect: IgsRectV1): Promise<ProjectTab> {
    const coordinator = this.requireTab(tabId)
    try {
      await coordinator.applyDocument({ ...coordinator.document, primaryBbox: rect })
    } catch (error) {
      if (error instanceof IgsSchemaError) {
        throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'The bounding box is invalid.')
      }
      throw error
    }
    return toTab(tabId, coordinator)
  }

  private async markOpenedBestEffort(filePath: string): Promise<void> {
    try {
      await this.options.repository.markOpened(filePath)
    } catch {
      // Last-opened ordering is derived metadata; a valid open tab must remain usable.
    }
  }

  private async openOne(projectId: string): Promise<ProjectOpenResult> {
    const record = await this.requireReadyRecord(projectId)
    const inspection = await ProjectAutosaveCoordinator.inspectRecovery(
      record.canonicalPath,
      this.options.shadow,
    )
    if (inspection.status !== 'absent' && inspection.status !== 'clean') {
      return {
        kind: 'recovery-required',
        projectId,
        reason: describeRecovery(inspection),
        recoveryStatus: inspection.status,
      }
    }
    const coordinator = await ProjectAutosaveCoordinator.open(
      record.canonicalPath,
      this.options.roots,
      this.options.shadow,
      {
        ...this.options.autosaveOptions,
        expectedCanonicalPath: record.canonicalPath,
      },
    )
    this.openTabs.set(projectId, coordinator)
    await this.markOpenedBestEffort(record.canonicalPath)
    return { kind: 'opened', tab: toTab(projectId, coordinator) }
  }

  private async requireReadyRecord(projectId: string): Promise<ProjectIndexRecord> {
    await this.initialize()
    const records = await this.options.repository.scanWorkspace(UNCATEGORIZED_WORKSPACE_ID)
    const record = records.find((candidate) => candidate.localProjectKey === projectId)
    if (!record) {
      throw new ProjectServiceError('PROJECT_NOT_FOUND', 'This Project is not in the library.')
    }
    if (record.fileHealth !== 'ready') {
      throw new ProjectServiceError(
        'PROJECT_NOT_READY',
        `This Project cannot be opened (${record.fileHealth}).`,
      )
    }
    const workspace = await this.options.repository.workspaceById(record.workspaceId)
    const canonical = await canonicalProjectPath(record.canonicalPath)
    if (
      canonical !== record.canonicalPath ||
      path.dirname(canonical) !== workspace.directoryPath ||
      localProjectRecoveryKey(canonical) !== projectId
    ) {
      throw new ProjectServiceError(
        'PROJECT_IDENTITY_MISMATCH',
        'The Project file no longer matches its indexed location.',
      )
    }
    return record
  }

  private requireTab(tabId: string): ProjectAutosaveCoordinator {
    assertProjectId(tabId)
    const coordinator = this.openTabs.get(tabId)
    if (!coordinator) {
      throw new ProjectServiceError('PROJECT_NOT_OPEN', 'This Project tab is not open.')
    }
    return coordinator
  }

  private async toSummary(record: ProjectIndexRecord): Promise<ProjectSummary> {
    let recoveryStatus: ProjectSummary['recoveryStatus'] = 'none'
    let recoveryReason: string | undefined
    if (record.fileHealth === 'ready' && !this.openTabs.has(record.localProjectKey)) {
      try {
        const inspection = await ProjectAutosaveCoordinator.inspectRecovery(
          record.canonicalPath,
          this.options.shadow,
        )
        if (inspection.status !== 'absent' && inspection.status !== 'clean') {
          recoveryStatus = inspection.status
          recoveryReason = describeRecovery(inspection)
        }
      } catch {
        recoveryStatus = 'invalid'
        recoveryReason = 'The local recovery state could not be inspected.'
      }
    }
    return {
      bbox:
        record.bboxWidth !== null && record.bboxHeight !== null
          ? { height: record.bboxHeight, width: record.bboxWidth }
          : null,
      health: record.fileHealth,
      id: record.localProjectKey,
      previewStatus: record.previewStatus,
      recoveryStatus,
      title: record.displayName,
      ...(recoveryReason ? { recoveryReason } : {}),
    }
  }
}

function assertProjectId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !PROJECT_ID_PATTERN.test(value)) {
    throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'The Project ID is invalid.')
  }
}

function parseCreateInput(input: unknown): { primaryBbox: IgsRectV1; title: string } {
  if (!input || typeof input !== 'object') {
    throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'The Project details are invalid.')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    Buffer.byteLength(value.title, 'utf8') > IGS_SAFETY_CEILINGS.titleBytes ||
    typeof value.width !== 'number' ||
    typeof value.height !== 'number'
  ) {
    throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'The Project details are invalid.')
  }
  const title = value.title.trim()
  const primaryBbox = { height: value.height, width: value.width, x: 0, y: 0 }
  try {
    createEmptyProjectDocumentV1({ primaryBbox, title })
  } catch (error) {
    if (error instanceof IgsSchemaError) {
      throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'The Project size is invalid.')
    }
    throw error
  }
  return { primaryBbox, title }
}

function toTab(id: string, coordinator: ProjectAutosaveCoordinator): ProjectTab {
  const document = coordinator.document
  return {
    autosaveError: coordinator.lastAutosaveError?.message ?? null,
    dirty: coordinator.dirty,
    id,
    primaryBbox: document.primaryBbox,
    title: document.title,
  }
}

function describeRecovery(inspection: ProjectShadowInspection): string {
  if (inspection.status === 'recoverable') {
    return 'Unsaved Project changes are available for recovery.'
  }
  if (inspection.status === 'stale') {
    return 'Local recovery no longer matches the saved Project. Open the saved revision only after discarding recovery.'
  }
  if (inspection.status === 'invalid') {
    return `Local recovery cannot be validated (${inspection.reason}). Open the saved revision only after discarding recovery.`
  }
  return 'There is no pending Project recovery.'
}
