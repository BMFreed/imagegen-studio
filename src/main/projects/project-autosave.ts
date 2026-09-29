import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import { parseProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, mkdtemp, open, realpath, rm } from 'node:fs/promises'
import path from 'node:path'

import type { ProjectShadowStore } from './project-shadow.js'
import type { ProjectShadowCommit, ProjectShadowInspection } from './project-shadow.js'

import { type IgsAssetSource, readIgsPackage } from './igs-package.js'
import {
  type ProjectRebuildPreviewInput,
  type ProjectSaveOutcome,
  ProjectSession,
  ProjectSessionError,
  type ProjectSessionRoots,
  type RenderedProjectPreview,
} from './project-session.js'

export interface ProjectAutosaveOptions {
  /** Test seam at the unavoidable `.igs`/single-base-shadow crash window. */
  afterSaveCommit?: () => Promise<void>
  /** Test seam between staging asset sources and publishing a document edit. */
  beforeEditCommit?: (document: IgsProjectDocumentV1) => Promise<void>
  /** Normal document debounce is 500–1500 ms; shorter values are useful in tests. */
  debounceMs?: number
  /** Reject an indexed path swapped to another real file before a tab acquires its lease. */
  expectedCanonicalPath?: string
  /** Inject a fresh registry only when simulating a new main process after a crash. */
  leaseRegistry?: ProjectAutosaveLeaseRegistry
  onAutosaveError?: (error: Error) => void
}
export type CoordinatedSaveOutcome = ProjectSaveOutcome & {
  recovery:
    | { directorySynced: boolean; documentRevision: string; status: 'dirty' }
    | { directorySynced: boolean; status: 'clean' }
    | { error: Error; status: 'failed' }
}

type AssetRef = { bytes: number; height?: number; path: string; sha256: string; width?: number }

type PendingSource = { ref: AssetRef; source: IgsAssetSource }

const PROJECT_HISTORY_LIMIT = 64

export class ProjectAutosaveError extends Error {
  constructor(
    readonly code:
      | 'ASSET_SOURCE_MISSING'
      | 'ASSET_SOURCE_UNREFERENCED'
      | 'COORDINATOR_CLOSED'
      | 'EDIT_CONFLICT'
      | 'PROJECT_ALREADY_OPEN'
      | 'RECOVERY_DECISION_REQUIRED'
      | 'RECOVERY_NOT_AVAILABLE'
      | 'SAVE_IN_PROGRESS'
      | 'SAVED_PROJECT_CHANGED',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectAutosaveError'
  }
}

/** A main-process Project tab owns one canonical path until it closes. */
export class ProjectAutosaveLeaseRegistry {
  private readonly active = new Set<string>()

  acquire(canonicalPath: string): () => void {
    if (this.active.has(canonicalPath)) {
      throw new ProjectAutosaveError(
        'PROJECT_ALREADY_OPEN',
        'This Project is already open in another tab.',
      )
    }
    this.active.add(canonicalPath)
    let released = false
    return () => {
      if (!released) {
        released = true
        this.active.delete(canonicalPath)
      }
    }
  }
}

const processLeases = new ProjectAutosaveLeaseRegistry()

/**
 * Main-process document autosave for one Project tab. Use applyDocument for normal edits and
 * prepared imports. The legacy adoptCurrentEdit path is only for callers that already mutated an
 * attached ProjectSession. Sources are copied into coordinator-owned staging before either method
 * resolves. Generation candidate staging is deliberately separate.
 */
export class ProjectAutosaveCoordinator {
  get canRedo(): boolean {
    return !this.closed && !this.activeSave && !this.editGate && this.future.length > 0
  }
  get canUndo(): boolean {
    return !this.closed && !this.activeSave && !this.editGate && this.past.length > 0
  }
  get dirty(): boolean {
    return this.session.dirty
  }
  get document(): IgsProjectDocumentV1 {
    return this.session.document
  }
  get filePath(): string {
    return this.session.filePath
  }
  get lastAutosaveError(): Error | null {
    return this.autosaveError
  }

  private activeSave: Promise<CoordinatedSaveOutcome> | undefined

  private autosaveError: Error | null = null
  private baseDocument: IgsProjectDocumentV1
  private closed = false
  private readonly debounceMs: number
  private editGate: Promise<void> | undefined
  private editGeneration = 0
  private readonly future: IgsProjectDocumentV1[] = []
  private readonly historicalSources = new Map<string, PendingSource>()
  private readonly ownedStaging = new Set<string>()
  private readonly past: IgsProjectDocumentV1[] = []
  private pendingWrite: Promise<void> = Promise.resolve()

  private rebasing = false

  private releaseEditGate: (() => void) | undefined

  private releaseLease: (() => void) | undefined

  private readonly saveBaseSources = new Map<string, PendingSource>()

  private saveTarget: IgsProjectDocumentV1 | undefined

  private readonly sources = new Map<string, PendingSource>()

  private readonly stagingBase: string

  private timer: ReturnType<typeof setTimeout> | undefined

  private wroteShadow = false

  private constructor(
    private readonly session: ProjectSession,
    savedDocument: IgsProjectDocumentV1,
    private readonly shadow: ProjectShadowStore,
    roots: ProjectSessionRoots,
    private readonly options: ProjectAutosaveOptions,
    releaseLease: () => void,
  ) {
    this.releaseLease = releaseLease
    this.baseDocument = savedDocument
    this.stagingBase = roots.scratchDir
    this.debounceMs = options.debounceMs ?? 1000
    if (!Number.isSafeInteger(this.debounceMs) || this.debounceMs < 0) {
      throw new RangeError('Autosave debounce must be a nonnegative integer.')
    }
  }

  /** Attach to a clean, already-open session used by an import service. */
  static async attach(
    session: ProjectSession,
    roots: ProjectSessionRoots,
    shadow: ProjectShadowStore,
    options: ProjectAutosaveOptions = {},
  ): Promise<ProjectAutosaveCoordinator> {
    if (session.dirty) {
      throw new ProjectAutosaveError(
        'RECOVERY_DECISION_REQUIRED',
        'Attach before changing the Project document.',
      )
    }
    const releaseLease = acquireLease(session, options)
    try {
      const savedPackage = await readIgsPackage(session.filePath)
      if (!sameDocument(savedPackage.project, session.document)) {
        throw new ProjectAutosaveError(
          'SAVED_PROJECT_CHANGED',
          'The saved Project changed while attaching its document session.',
        )
      }
      const inspection = await shadow.inspect({ projectPath: session.filePath, savedPackage })
      if (inspection.status !== 'absent' && inspection.status !== 'clean') {
        throw new ProjectAutosaveError(
          'RECOVERY_DECISION_REQUIRED',
          'Inspect and resolve the Project recovery state before editing the saved document.',
        )
      }
      return new ProjectAutosaveCoordinator(
        session,
        savedPackage.project,
        shadow,
        roots,
        options,
        releaseLease,
      )
    } catch (error) {
      releaseLease()
      throw error
    }
  }

  /** Explicit Discard Recovery and Open Saved. Does not touch generation staging. */
  static async discardRecovery(
    projectPath: string,
    roots: ProjectSessionRoots,
    shadow: ProjectShadowStore,
    options: ProjectAutosaveOptions = {},
  ): Promise<ProjectAutosaveCoordinator> {
    const { savedPackage, session } = await openConsistent(
      projectPath,
      roots,
      options.expectedCanonicalPath,
    )
    const releaseLease = acquireLease(session, options)
    try {
      await shadow.discard(session.filePath)
      return new ProjectAutosaveCoordinator(
        session,
        savedPackage.project,
        shadow,
        roots,
        options,
        releaseLease,
      )
    } catch (error) {
      releaseLease()
      throw error
    }
  }

  static async inspectRecovery(
    projectPath: string,
    shadow: ProjectShadowStore,
  ): Promise<ProjectShadowInspection> {
    const savedPackage = await readIgsPackage(projectPath)
    return await shadow.inspect({ projectPath, savedPackage })
  }

  /** Open only after the caller has resolved any unclean recovery decision. */
  static async open(
    projectPath: string,
    roots: ProjectSessionRoots,
    shadow: ProjectShadowStore,
    options: ProjectAutosaveOptions = {},
  ): Promise<ProjectAutosaveCoordinator> {
    const session = await ProjectSession.open(projectPath, roots, options.expectedCanonicalPath)
    return await ProjectAutosaveCoordinator.attach(session, roots, shadow, options)
  }

  /** Recover validated document edits for review; the saved `.igs` is never changed here. */
  static async recover(
    projectPath: string,
    roots: ProjectSessionRoots,
    shadow: ProjectShadowStore,
    options: ProjectAutosaveOptions = {},
  ): Promise<ProjectAutosaveCoordinator> {
    const { savedPackage, session } = await openConsistent(
      projectPath,
      roots,
      options.expectedCanonicalPath,
    )
    const releaseLease = acquireLease(session, options)
    let coordinator: ProjectAutosaveCoordinator | undefined
    try {
      const inspection = await shadow.inspect({ projectPath: session.filePath, savedPackage })
      if (inspection.status !== 'recoverable') {
        throw new ProjectAutosaveError(
          'RECOVERY_NOT_AVAILABLE',
          'No valid Project document recovery exists.',
        )
      }
      coordinator = new ProjectAutosaveCoordinator(
        session,
        savedPackage.project,
        shadow,
        roots,
        options,
        releaseLease,
      )
      // ProjectSession assigns a fresh revision when applying a recovered document. Republish
      // that revision before exposing the session; original recovery survives failure.
      await coordinator.applyDocumentInternal(
        inspection.document,
        inspection.dirtyAssets,
        {},
        () => {
          // Recovery restores the document state; it is not a user edit in this process.
        },
      )
      await coordinator.flush()
      return coordinator
    } catch (error) {
      coordinator?.clearTimer()
      await coordinator?.pendingWrite
      await coordinator?.cleanupStaging()
      releaseLease()
      throw error
    }
  }

  /**
   * Import services that already called ProjectSession.applyDocument can transfer their returned
   * sources here. The caller must retain its staging until this promise resolves or rejects.
   */
  async adoptCurrentEdit(assetSources: Readonly<Record<string, IgsAssetSource>>): Promise<void> {
    this.assertOpen()
    await this.editGate
    this.assertOpen()
    const document = this.session.document
    const staged = await this.stageSources(document, assetSources)
    try {
      await this.options.beforeEditCommit?.(document)
      await this.editGate
      this.assertOpen()
      if (!sameDocument(this.session.document, document)) {
        throw new ProjectAutosaveError('EDIT_CONFLICT', 'The Project changed during adoption.')
      }
      this.requireChangedSources(document, staged)
      this.installSources(staged)
      // A caller already changed ProjectSession before adoption. Its previous document is not
      // available, so old history must not be allowed to replace this edit on Undo.
      this.past.length = 0
      this.future.length = 0
      this.editGeneration += 1
      this.schedule()
    } catch (error) {
      await this.removeNewStaging(staged)
      throw error
    }
  }

  /**
   * Apply one persistent edit. New or changed asset references must have a matching source. Source
   * files are copied and hash-checked before the edit becomes visible in the session. A prepared
   * edit can supply its original revision to reject publication after another edit wins.
   */
  async applyDocument(
    input: unknown,
    assetSources: Readonly<Record<string, IgsAssetSource>> = {},
    options: { expectedDocumentRevision?: string } = {},
  ): Promise<{ documentRevision: string }> {
    const documentRevision = await this.applyDocumentInternal(
      input,
      assetSources,
      options,
      (before, after) => {
        if (sameContent(before, after)) {
          return
        }
        this.past.push(before)
        if (this.past.length > PROJECT_HISTORY_LIMIT) {
          this.past.shift()
        }
        this.future.length = 0
      },
    )
    return { documentRevision }
  }

  /** Release retained undo/import assets after the tab is clean and writes have settled. */
  async close(): Promise<void> {
    this.assertOpen()
    if (this.activeSave || this.editGate) {
      throw new ProjectAutosaveError('SAVE_IN_PROGRESS', 'Wait for Project Save to finish.')
    }
    if (this.session.dirty) {
      throw new ProjectAutosaveError(
        'RECOVERY_DECISION_REQUIRED',
        'Save or Discard Changes before closing the Project.',
      )
    }
    this.closed = true
    this.clearTimer()
    try {
      await this.pendingWrite
      await this.queueWrite()
      await this.cleanupStaging()
    } catch (error) {
      this.closed = false
      this.reportError(error)
      throw error
    }
    this.releaseLease?.()
    this.releaseLease = undefined
    this.past.length = 0
    this.future.length = 0
  }

  /** Graceful Discard Changes; reopen the saved package as a fresh session. */
  async discardChanges(roots: ProjectSessionRoots): Promise<ProjectAutosaveCoordinator> {
    this.assertOpen()
    if (this.activeSave) {
      throw new ProjectAutosaveError('SAVE_IN_PROGRESS', 'Wait for Project Save to finish.')
    }
    this.closed = true
    this.clearTimer()
    try {
      await this.pendingWrite
      const { savedPackage, session } = await openConsistent(this.filePath, roots)
      await this.shadow.discard(this.filePath)
      await this.cleanupStaging()
      const replacement = new ProjectAutosaveCoordinator(
        session,
        savedPackage.project,
        this.shadow,
        roots,
        this.options,
        this.releaseLease!,
      )
      // Transfer ownership synchronously: the new clean tab remains the only writer for this path.
      this.releaseLease = undefined
      this.past.length = 0
      this.future.length = 0
      return replacement
    } catch (error) {
      this.closed = false
      if (this.session.dirty) {
        this.schedule()
      }
      throw error
    }
  }

  /** Force pending dirty state to the durable shadow, or remove it after exact undo. */
  async flush(): Promise<ProjectShadowCommit | null> {
    this.assertOpen()
    this.clearTimer()
    try {
      if (this.rebasing && this.activeSave) {
        await this.activeSave
      }
      return await this.queueWrite()
    } catch (error) {
      this.reportError(error)
      throw error
    }
  }

  /**
   * Resolve only an exact Raster Layer asset in the current unsaved document. The returned source
   * belongs to this coordinator, not the import caller; main must still verify its bytes when
   * copying it for display. Saved assets are read from the `.igs` package instead.
   */
  getCurrentAssetSource(member: {
    bytes: number
    path: string
    sha256: string
  }): IgsAssetSource | null {
    this.assertOpen()
    const ref = this.session.document.layers.find(
      (layer) =>
        layer.asset.path === member.path &&
        layer.asset.sha256 === member.sha256 &&
        layer.asset.bytes === member.bytes,
    )?.asset
    if (!ref || sameRef(ref, referencedMembers(this.baseDocument).get(ref.path))) {
      return null
    }
    const pending = this.sourceFor(ref)
    if (!pending) {
      throw new ProjectAutosaveError(
        'ASSET_SOURCE_MISSING',
        'The current Raster Layer has no verified asset source.',
      )
    }
    return 'sourcePath' in pending.source
      ? { sourcePath: pending.source.sourcePath }
      : { bytes: Buffer.from(pending.source.bytes) }
  }

  /** Keep document edits behind the same gate while preview-only maintenance commits. */
  async rebuildPreview(
    input: ProjectRebuildPreviewInput,
    options: { beforeReplace?: () => void } = {},
  ): Promise<ProjectSaveOutcome> {
    this.assertOpen()
    if (this.activeSave || this.editGate) {
      throw new ProjectAutosaveError('SAVE_IN_PROGRESS', 'Wait for Project Save to finish.')
    }
    if (this.session.dirty) {
      throw new ProjectSessionError(
        'PROJECT_DIRTY',
        'Save the Project changes before rebuilding its preview.',
      )
    }
    this.editGate = new Promise<void>((resolve) => {
      this.releaseEditGate = resolve
    })
    try {
      await this.pendingWrite
      this.assertOpen()
      return await this.session.rebuildPreview(input, options)
    } finally {
      this.releasePreparedEdits()
    }
  }

  /** Restore the document that the latest successful Undo moved away from. */
  async redo(): Promise<void> {
    await this.moveHistory('redo')
  }

  /** Explicit Save commits `.igs`, then cleans only that revision and rebases any later edit. */
  async save(
    input: { emptyPreviewRevision?: string; renderedPreview?: RenderedProjectPreview } = {},
  ): Promise<CoordinatedSaveOutcome> {
    this.assertOpen()
    if (this.activeSave || this.editGate) {
      throw new ProjectAutosaveError('SAVE_IN_PROGRESS', 'A Project Save is already running.')
    }
    this.clearTimer()
    const savingDocument = this.session.document
    const assets = this.changedSources(savingDocument)
    // Worker derivatives may finish for the revision that preceded the user's latest edit.
    // Save the captured document anyway, using an honest unavailable/empty placeholder.
    const preview = {
      ...(input.emptyPreviewRevision === savingDocument.documentRevision
        ? { emptyPreviewRevision: input.emptyPreviewRevision }
        : {}),
      ...(input.renderedPreview?.documentRevision === savingDocument.documentRevision
        ? { renderedPreview: input.renderedPreview }
        : {}),
    }
    this.editGate = new Promise<void>((resolve) => {
      this.releaseEditGate = resolve
    })
    const coordinated = (async (): Promise<CoordinatedSaveOutcome> => {
      let committed: ProjectSaveOutcome
      try {
        // A must be durable in the shadow before package assembly starts. Edits arriving during
        // this preflight wait to enter the session until ProjectSession has captured A.
        if (this.session.dirty) {
          await this.queueWrite()
        }
        await this.preserveSaveBaseAssets(savingDocument)
        if (!sameDocument(this.session.document, savingDocument)) {
          throw new ProjectAutosaveError(
            'SAVED_PROJECT_CHANGED',
            'The Project changed while preparing its Save snapshot.',
          )
        }
        this.saveTarget = savingDocument
        const packageSave = this.session.save({ assets, ...preview })
        this.releasePreparedEdits()
        committed = await packageSave
      } catch (error) {
        this.saveTarget = undefined
        this.releasePreparedEdits()
        if (this.session.dirty) {
          this.schedule()
        }
        throw error
      }
      try {
        await this.pendingWrite
        await this.options.afterSaveCommit?.()
        this.rebasing = true
        await this.pendingWrite
        this.baseDocument = savingDocument
        this.saveTarget = undefined
        this.retainSaveBaseSourcesForCurrent()
        const savedPackage = await readIgsPackage(this.filePath)
        if (!sameDocument(savedPackage.project, savingDocument)) {
          throw new ProjectAutosaveError(
            'SAVED_PROJECT_CHANGED',
            'The Project changed immediately after Save; reopen it before autosave continues.',
          )
        }
        const cleaned = await this.shadow.markClean(this.filePath, savingDocument.documentRevision)
        if (this.session.dirty) {
          const later = await this.writeCurrent()
          if (!later) {
            throw new Error('A dirty Project did not produce a recovery shadow.')
          }
          return {
            ...committed,
            recovery: {
              directorySynced: later.directorySynced,
              documentRevision: later.documentRevision,
              status: 'dirty',
            },
          }
        }
        const cleanGeneration = this.editGeneration
        if (!cleaned.cleaned && this.wroteShadow) {
          // An edit undone to the just-saved content may have a different transient revision.
          await this.shadow.discard(this.filePath)
        }
        if (this.editGeneration !== cleanGeneration || this.session.dirty) {
          const later = await this.writeCurrent()
          if (later) {
            return {
              ...committed,
              recovery: {
                directorySynced: later.directorySynced,
                documentRevision: later.documentRevision,
                status: 'dirty',
              },
            }
          }
        }
        this.sources.clear()
        this.autosaveError = null
        return {
          ...committed,
          recovery: { directorySynced: cleaned.directorySynced, status: 'clean' },
        }
      } catch (error) {
        this.rebasing = true
        await this.pendingWrite
        this.baseDocument = savingDocument
        this.saveTarget = undefined
        this.retainSaveBaseSourcesForCurrent()
        const failure = this.reportError(error)
        if (this.session.dirty) {
          this.schedule()
        }
        return { ...committed, recovery: { error: failure, status: 'failed' } }
      }
    })()
    this.activeSave = coordinated
    try {
      return await coordinated
    } finally {
      this.saveTarget = undefined
      this.rebasing = false
      this.releasePreparedEdits()
      this.activeSave = undefined
    }
  }

  /** Restore one document state without rewinding queue or staging. Failed edits keep both stacks. */
  async undo(): Promise<void> {
    await this.moveHistory('undo')
  }

  private async applyDocumentInternal(
    input: unknown,
    assetSources: Readonly<Record<string, IgsAssetSource>>,
    options: { expectedDocumentRevision?: string },
    afterCommit: (before: IgsProjectDocumentV1, after: IgsProjectDocumentV1) => void,
    beforeCommit?: () => void,
  ): Promise<string> {
    this.assertOpen()
    await this.editGate
    this.assertOpen()
    const before = this.session.document
    if (
      options.expectedDocumentRevision !== undefined &&
      before.documentRevision !== options.expectedDocumentRevision
    ) {
      throw new ProjectAutosaveError(
        'EDIT_CONFLICT',
        'The Project changed while preparing this edit.',
      )
    }
    const candidate = parseProjectDocumentV1(input)
    if (
      options.expectedDocumentRevision !== undefined &&
      candidate.documentRevision !== options.expectedDocumentRevision
    ) {
      throw new ProjectAutosaveError('EDIT_CONFLICT', 'This edit has an outdated Project revision.')
    }
    const staged = await this.stageSources(candidate, assetSources)
    try {
      await this.options.beforeEditCommit?.(candidate)
      await this.editGate
      this.assertOpen()
      if (!sameDocument(this.session.document, before)) {
        throw new ProjectAutosaveError('EDIT_CONFLICT', 'The Project changed during this edit.')
      }
      this.requireChangedSources(candidate, staged)
      beforeCommit?.()
      this.session.applyDocument(candidate)
      const documentRevision = this.session.document.documentRevision
      this.installSources(staged)
      afterCommit(before, this.session.document)
      this.editGeneration += 1
      this.schedule()
      return documentRevision
    } catch (error) {
      await this.removeNewStaging(staged)
      throw error
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ProjectAutosaveError('COORDINATOR_CLOSED', 'This Project session is closed.')
    }
  }

  private changedSources(document: IgsProjectDocumentV1): Record<string, IgsAssetSource> {
    const result: Record<string, IgsAssetSource> = {}
    for (const ref of this.requiredSources(document)) {
      const pending = this.sourceFor(ref)
      if (!pending) {
        throw new ProjectAutosaveError(
          'ASSET_SOURCE_MISSING',
          'A new or changed Project asset needs its immutable source.',
        )
      }
      result[ref.path] = pending.source
    }
    return result
  }

  private async cleanupStaging(): Promise<void> {
    for (const directory of this.ownedStaging) {
      await rm(directory, { force: true, recursive: true }).catch((error: unknown) => {
        process.emitWarning(`Project autosave staging cleanup failed: ${String(error)}`)
      })
    }
    this.ownedStaging.clear()
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = undefined
  }

  private installSources(staged: Map<string, PendingSource>): void {
    for (const [memberPath, source] of staged) {
      this.sources.set(memberPath, source)
      this.historicalSources.set(assetKey(source.ref), source)
    }
    const references = referencedMembers(this.session.document)
    for (const [memberPath, source] of this.sources) {
      const ref = references.get(memberPath)
      if (!ref || !sameRef(source.ref, ref)) {
        this.sources.delete(memberPath)
      }
    }
  }

  private async moveHistory(direction: 'redo' | 'undo'): Promise<void> {
    this.assertOpen()
    if (this.activeSave || this.editGate) {
      throw new ProjectAutosaveError(
        'SAVE_IN_PROGRESS',
        'Wait for the Project operation to finish.',
      )
    }
    const source = direction === 'undo' ? this.past : this.future
    const destination = direction === 'undo' ? this.future : this.past
    const target = source.at(-1)
    if (!target) {
      return
    }
    const expectedDocumentRevision = this.session.document.documentRevision
    const restored = { ...target, documentRevision: expectedDocumentRevision }
    // Re-copy/hash every asset reintroduced by this snapshot before changing the document. A
    // retained historical source can disappear or be corrupted independently of the Undo stack.
    const assetSources = this.changedSources(restored)
    await this.applyDocumentInternal(
      restored,
      assetSources,
      { expectedDocumentRevision },
      (before) => {
        // This callback runs synchronously after the verified document/asset commit. A competing
        // edit fails its revision check before it can alter either stack.
        source.pop()
        destination.push(before)
      },
      () => {
        if (source.at(-1) !== target) {
          throw new ProjectAutosaveError(
            'EDIT_CONFLICT',
            'Project history changed during Undo/Redo.',
          )
        }
      },
    )
  }

  private async preserveSaveBaseAssets(savingDocument: IgsProjectDocumentV1): Promise<void> {
    this.saveBaseSources.clear()
    const target = referencedMembers(savingDocument)
    const removedOrChanged = [...referencedMembers(this.baseDocument).values()].filter(
      (ref) => !sameRef(ref, target.get(ref.path)),
    )
    if (removedOrChanged.length === 0) {
      return
    }
    const savedPackage = await readIgsPackage(this.filePath)
    if (!sameDocument(savedPackage.project, this.baseDocument)) {
      throw new ProjectAutosaveError(
        'SAVED_PROJECT_CHANGED',
        'The saved Project changed while preparing its Save snapshot.',
      )
    }
    await mkdir(this.stagingBase, { recursive: true })
    const directory = await mkdtemp(path.join(await realpath(this.stagingBase), 'igs-save-base-'))
    try {
      for (const [index, ref] of removedOrChanged.entries()) {
        const destination = path.join(directory, `${index}.asset`)
        await savedPackage.extractMemberToFile(ref.path, destination)
        this.saveBaseSources.set(ref.path, { ref, source: { sourcePath: destination } })
      }
      for (const source of this.saveBaseSources.values()) {
        this.historicalSources.set(assetKey(source.ref), source)
      }
      this.ownedStaging.add(directory)
    } catch (error) {
      this.saveBaseSources.clear()
      await rm(directory, { force: true, recursive: true })
      throw error
    }
  }

  private queueWrite(): Promise<ProjectShadowCommit | null> {
    const queued = this.pendingWrite.then(() => this.writeCurrent())
    this.pendingWrite = queued.then(
      () => undefined,
      () => undefined,
    )
    return queued
  }

  private releasePreparedEdits(): void {
    this.releaseEditGate?.()
    this.releaseEditGate = undefined
    this.editGate = undefined
  }

  private async removeNewStaging(staged: Map<string, PendingSource>): Promise<void> {
    for (const source of staged.values()) {
      if ('sourcePath' in source.source) {
        const directory = path.dirname(source.source.sourcePath)
        this.ownedStaging.delete(directory)
        await rm(directory, { force: true, recursive: true })
      }
    }
  }

  private reportError(error: unknown): Error {
    const failure = error instanceof Error ? error : new Error(String(error))
    this.autosaveError = failure
    try {
      this.options.onAutosaveError?.(failure)
    } catch (callbackError) {
      process.emitWarning(`Project autosave error observer failed: ${String(callbackError)}`)
    }
    return failure
  }

  private requireChangedSources(
    document: IgsProjectDocumentV1,
    staged: Map<string, PendingSource>,
  ): void {
    for (const ref of this.requiredSources(document)) {
      const pending = this.sourceFor(ref, staged)
      if (!pending) {
        throw new ProjectAutosaveError(
          'ASSET_SOURCE_MISSING',
          'A new or changed Project asset needs its immutable source.',
        )
      }
    }
  }

  private requiredSources(document: IgsProjectDocumentV1): AssetRef[] {
    const required = new Map<string, AssetRef>()
    for (const ref of changedMembers(document, this.baseDocument)) {
      required.set(ref.path, ref)
    }
    if (this.saveTarget && !sameDocument(document, this.saveTarget)) {
      for (const ref of changedMembers(document, this.saveTarget)) {
        required.set(ref.path, ref)
      }
    }
    return [...required.values()]
  }

  private retainSaveBaseSourcesForCurrent(): void {
    const current = referencedMembers(this.session.document)
    for (const [memberPath, pending] of this.saveBaseSources) {
      const ref = current.get(memberPath)
      if (ref && sameRef(ref, pending.ref) && !sameRef(ref, this.sources.get(memberPath)?.ref)) {
        this.sources.set(memberPath, pending)
      }
    }
    this.saveBaseSources.clear()
  }

  private schedule(): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.flush().catch(() => undefined)
    }, this.debounceMs)
    this.timer.unref()
  }

  private sourceFor(ref: AssetRef, staged?: Map<string, PendingSource>): PendingSource | undefined {
    for (const candidate of [
      staged?.get(ref.path),
      this.sources.get(ref.path),
      this.saveBaseSources.get(ref.path),
      this.historicalSources.get(assetKey(ref)),
    ]) {
      if (candidate && sameRef(candidate.ref, ref)) {
        return candidate
      }
    }
    return undefined
  }

  private async stageSources(
    document: IgsProjectDocumentV1,
    input: Readonly<Record<string, IgsAssetSource>>,
  ): Promise<Map<string, PendingSource>> {
    const references = referencedMembers(document)
    const entries = Object.entries(input)
    for (const [memberPath] of entries) {
      if (!references.has(memberPath)) {
        throw new ProjectAutosaveError(
          'ASSET_SOURCE_UNREFERENCED',
          'An asset source is not referenced by this Project edit.',
        )
      }
    }
    const staged = new Map<string, PendingSource>()
    let directory: string | undefined
    try {
      for (const [memberPath, source] of entries) {
        const ref = references.get(memberPath)!
        if ('bytes' in source) {
          const bytes = Buffer.from(source.bytes)
          assertBytes(bytes, ref)
          staged.set(memberPath, { ref, source: { bytes } })
        } else {
          if (!directory) {
            await mkdir(this.stagingBase, { recursive: true })
            directory = await mkdtemp(path.join(await realpath(this.stagingBase), 'igs-pending-'))
          }
          const destination = path.join(directory, `${staged.size}.asset`)
          await copyVerifiedFile(source.sourcePath, destination, ref)
          staged.set(memberPath, { ref, source: { sourcePath: destination } })
        }
      }
      if (directory) {
        this.ownedStaging.add(directory)
      }
      return staged
    } catch (error) {
      if (directory) {
        await rm(directory, { force: true, recursive: true })
      }
      throw error
    }
  }

  private async writeCurrent(): Promise<ProjectShadowCommit | null> {
    const document = this.session.document
    const savedPackage = await readIgsPackage(this.filePath)
    if (
      !sameDocument(savedPackage.project, this.baseDocument) &&
      (!this.saveTarget || !sameDocument(savedPackage.project, this.saveTarget))
    ) {
      throw new ProjectAutosaveError(
        'SAVED_PROJECT_CHANGED',
        'The saved Project changed outside this session.',
      )
    }
    const dirtyAfterCommit = this.saveTarget && !sameContent(document, this.saveTarget)
    if (sameContent(document, this.baseDocument) && !dirtyAfterCommit) {
      if (this.wroteShadow) {
        await this.shadow.discard(this.filePath)
      }
      this.autosaveError = null
      return null
    }
    const commit = await this.shadow.write({
      ...(this.saveTarget && !sameDocument(document, this.saveTarget)
        ? { committingDocument: this.saveTarget }
        : {}),
      dirtyAssets: this.changedSources(document),
      document,
      projectPath: this.filePath,
      savedDocument: this.baseDocument,
    })
    this.wroteShadow = true
    this.autosaveError = null
    return commit
  }
}

function acquireLease(session: ProjectSession, options: ProjectAutosaveOptions): () => void {
  return (options.leaseRegistry ?? processLeases).acquire(session.filePath)
}

async function openConsistent(
  projectPath: string,
  roots: ProjectSessionRoots,
  expectedCanonicalPath?: string,
): Promise<{ savedPackage: Awaited<ReturnType<typeof readIgsPackage>>; session: ProjectSession }> {
  const session = await ProjectSession.open(projectPath, roots, expectedCanonicalPath)
  const savedPackage = await readIgsPackage(session.filePath)
  if (!sameDocument(savedPackage.project, session.document)) {
    throw new ProjectAutosaveError(
      'SAVED_PROJECT_CHANGED',
      'The Project changed while its document session was opening.',
    )
  }
  return { savedPackage, session }
}

function referencedMembers(document: IgsProjectDocumentV1): Map<string, AssetRef> {
  const members = new Map<string, AssetRef>()
  const add = (ref: AssetRef): void => {
    const previous = members.get(ref.path)
    if (previous && !sameRef(previous, ref)) {
      throw new ProjectAutosaveError(
        'ASSET_SOURCE_UNREFERENCED',
        'An asset path has conflicting Project references.',
      )
    }
    members.set(ref.path, ref)
  }
  for (const layer of document.layers) {
    add(layer.asset)
    if (layer.sourceIccProfile) {
      add(layer.sourceIccProfile)
    }
  }
  return members
}

function changedMembers(document: IgsProjectDocumentV1, saved: IgsProjectDocumentV1): AssetRef[] {
  const previous = referencedMembers(saved)
  return [...referencedMembers(document).values()].filter(
    (ref) => !sameRef(ref, previous.get(ref.path)),
  )
}

function sameRef(left: AssetRef, right: AssetRef | undefined): boolean {
  return Boolean(
    right &&
    left.path === right.path &&
    left.bytes === right.bytes &&
    left.sha256 === right.sha256 &&
    left.width === right.width &&
    left.height === right.height,
  )
}

function sameDocument(left: IgsProjectDocumentV1, right: IgsProjectDocumentV1): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sameContent(left: IgsProjectDocumentV1, right: IgsProjectDocumentV1): boolean {
  return (
    JSON.stringify({ ...left, documentRevision: null }) ===
    JSON.stringify({ ...right, documentRevision: null })
  )
}

function assetKey(ref: AssetRef): string {
  return JSON.stringify([ref.path, ref.bytes, ref.sha256, ref.width ?? null, ref.height ?? null])
}

function assertBytes(bytes: Buffer, ref: AssetRef): void {
  if (
    bytes.length !== ref.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== ref.sha256
  ) {
    throw new ProjectAutosaveError(
      'ASSET_SOURCE_MISSING',
      'Asset source differs from its reference.',
    )
  }
}

async function copyVerifiedFile(
  sourcePath: string,
  destination: string,
  ref: AssetRef,
): Promise<void> {
  if (!path.isAbsolute(sourcePath)) {
    throw new ProjectAutosaveError('ASSET_SOURCE_MISSING', 'Asset source path must be absolute.')
  }
  const input = await open(
    sourcePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  let output: Awaited<ReturnType<typeof open>> | undefined
  try {
    const before = await input.stat({ bigint: true })
    if (!before.isFile() || before.size !== BigInt(ref.bytes)) {
      throw new ProjectAutosaveError('ASSET_SOURCE_MISSING', 'Asset source is not a matching file.')
    }
    output = await open(destination, 'wx', 0o600)
    const digest = createHash('sha256')
    const chunk = Buffer.allocUnsafe(1024 * 1024)
    let copied = 0
    while (true) {
      const { bytesRead } = await input.read(chunk, 0, chunk.length, null)
      if (bytesRead === 0) {
        break
      }
      copied += bytesRead
      if (copied > ref.bytes) {
        throw new ProjectAutosaveError(
          'ASSET_SOURCE_MISSING',
          'Asset source changed while copying.',
        )
      }
      digest.update(chunk.subarray(0, bytesRead))
      await output.writeFile(chunk.subarray(0, bytesRead))
    }
    const after = await input.stat({ bigint: true })
    if (
      copied !== ref.bytes ||
      digest.digest('hex') !== ref.sha256 ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    ) {
      throw new ProjectAutosaveError('ASSET_SOURCE_MISSING', 'Asset source changed while copying.')
    }
    await output.sync()
  } finally {
    await output?.close()
    await input.close()
  }
}
