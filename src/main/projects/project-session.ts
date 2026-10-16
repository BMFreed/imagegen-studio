import type { PresetPayload } from '../../shared/presets/preset-schema.js'
import { initializeProjectGenerationPayload } from '../../shared/projects/project-create.js'
import type {
  IgsPreviewRectV1,
  IgsProjectDocumentV1,
  IgsRectV1,
} from '../../shared/projects/project-schema.js'
import {
  createEmptyProjectDocumentV1,
  parseProjectDocumentV1,
  projectActiveRasterContributions,
  projectAssetReferences,
} from '../../shared/projects/project-schema.js'

import { randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import path from 'node:path'

import {
  type IgsAssetSource,
  type IgsPackageReadResult,
  type IgsPackageWriteInput,
  readIgsPackage,
  saveIgsPackage,
} from './igs-package.js'
import {
  canonicalProjectPath,
  localProjectRecoveryKey,
  ProjectIdentityError,
} from './project-identity.js'
import { withProjectPathLock } from './project-path-lock.js'
import { readProjectPlaceholders } from './project-placeholders.js'

export interface ProjectSessionRoots {
  /** Bundled immutable PNG/WebP placeholders, copied beside the built main process. */
  placeholdersDir: string
  /** App-owned disposable storage for streaming assets from a saved `.igs`. */
  scratchDir: string
}

export interface RenderedProjectPreview {
  documentRevision: string
  merged: Buffer
  rect: IgsPreviewRectV1
  thumbnail: Buffer
}

export interface ProjectSaveInput {
  /** New or changed members; unchanged members are extracted from the saved package. */
  assets?: Readonly<Record<string, IgsAssetSource>>
  /** The compositor found no visible pixels at this exact revision, including transparent layers. */
  emptyPreviewRevision?: string
  /** Trusted operational cursor, copied into the package only by this explicit Save. */
  lastActualSeedSnapshot?: number
  /** A derivative computed from this exact document revision. */
  renderedPreview?: RenderedProjectPreview
}

export type ProjectRebuildPreviewInput =
  | { emptyPreviewRevision: string; renderedPreview?: never }
  | { emptyPreviewRevision?: never; renderedPreview: RenderedProjectPreview }

export interface ProjectSaveOutcome {
  /** Rename/link committed the new `.igs`; derived index synchronization is a separate step. */
  committed: true
  /** False means the containing directory could not be fsynced after commit. */
  directorySynced: boolean
  /** The file committed, but an immediate post-commit read failed; reopen before further edits. */
  reloadRequired: boolean
}

export class ProjectSessionError extends Error {
  constructor(
    readonly code:
      | 'PROJECT_DIRTY'
      | 'PROJECT_EXTERNAL_CHANGE'
      | 'PROJECT_INVALID_EDIT'
      | 'PROJECT_INVALID_PREVIEW'
      | 'PROJECT_RELOAD_REQUIRED'
      | 'PROJECT_SAVE_IN_PROGRESS',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectSessionError'
  }
}

const savingPaths = new Set<string>()

/** One open Project document. This first slice has no autosave, queue, UI or SQLite index yet. */
export class ProjectSession {
  /** Null for reopened files; false means the new filename was not directory-fsynced. */
  get creationDirectorySynced(): boolean | null {
    return this.createdDirectorySynced
  }
  get dirty(): boolean {
    return contentKey(this.current) !== contentKey(this.saved)
  }
  get document(): IgsProjectDocumentV1 {
    return structuredClone(this.current)
  }
  private createdDirectorySynced: boolean | null = null
  private current: IgsProjectDocumentV1
  private reloadRequired = false
  private saved: IgsProjectDocumentV1

  private savedFingerprint: string

  private savedPackage: IgsPackageReadResult

  private constructor(
    readonly filePath: string,
    readonly localRecoveryKey: string,
    private readonly roots: ProjectSessionRoots,
    initial: IgsPackageReadResult,
    fingerprint: string,
  ) {
    this.current = initial.project
    this.saved = initial.project
    this.savedFingerprint = fingerprint
    this.savedPackage = initial
  }

  static async create(
    filePath: string,
    title: string,
    roots: ProjectSessionRoots,
    primaryBbox?: IgsRectV1,
    expectedDirectory?: string,
    generationPayload?: PresetPayload,
  ): Promise<ProjectSession> {
    // Capture and validate all authored values before the first asynchronous filesystem step.
    const project = initializeProjectGenerationPayload(
      createEmptyProjectDocumentV1({ primaryBbox, title }),
      generationPayload,
    )
    const canonicalPath = await canonicalProjectPath(filePath, { allowNewFile: true })
    if (expectedDirectory && path.dirname(canonicalPath) !== expectedDirectory) {
      throw new ProjectIdentityError(
        'PROJECT_INVALID_PATH',
        'The Project workspace no longer matches its managed location.',
      )
    }
    const placeholders = await readProjectPlaceholders(roots.placeholdersDir, 'empty')
    const written = await saveIgsPackage(
      canonicalPath,
      { preview: { ...placeholders, rect: null, status: 'empty' }, project },
      { createOnly: true },
    )
    const session = await ProjectSession.open(canonicalPath, roots, canonicalPath)
    session.createdDirectorySynced = written.directorySynced
    return session
  }

  static async open(
    filePath: string,
    roots: ProjectSessionRoots,
    expectedCanonicalPath?: string,
  ): Promise<ProjectSession> {
    const canonicalPath = await canonicalProjectPath(filePath)
    if (expectedCanonicalPath && canonicalPath !== expectedCanonicalPath) {
      throw new ProjectIdentityError(
        'PROJECT_INVALID_PATH',
        'The Project file no longer matches its indexed location.',
      )
    }
    const before = await fileFingerprint(canonicalPath)
    const initial = await readIgsPackage(canonicalPath)
    const after = await fileFingerprint(canonicalPath)
    if (before !== after) {
      throw new ProjectSessionError(
        'PROJECT_EXTERNAL_CHANGE',
        'The Project changed while it was opening.',
      )
    }
    return new ProjectSession(
      canonicalPath,
      localProjectRecoveryKey(canonicalPath),
      roots,
      initial,
      after,
    )
  }

  /** Apply a document mutation, preserving the saved revision on an exact undo. */
  applyDocument(input: unknown): void {
    if (this.reloadRequired) {
      throw new ProjectSessionError('PROJECT_RELOAD_REQUIRED', 'Reopen the saved Project first.')
    }
    const parsed = parseProjectDocumentV1(input)
    if (parsed.documentId !== this.current.documentId) {
      throw new ProjectSessionError('PROJECT_INVALID_EDIT', 'A Project ID cannot change in a tab.')
    }
    // The portable seed is Save metadata, not editable document content. Undo snapshots and
    // prepared edits can carry an older value; neither may rewind a successful Save.
    const candidate = {
      ...parsed,
      lastActualSeedSnapshot: this.current.lastActualSeedSnapshot,
    }
    const key = contentKey(candidate)
    const revision =
      key === contentKey(this.saved)
        ? this.saved.documentRevision
        : key === contentKey(this.current)
          ? this.current.documentRevision
          : randomUUID()
    this.current = parseProjectDocumentV1({ ...candidate, documentRevision: revision })
  }

  /**
   * Replace only derived previews in a clean saved Project. Unlike Save, a missing or failed
   * derivative is an error: maintenance must not replace a valid package with a placeholder.
   */
  async rebuildPreview(
    input: ProjectRebuildPreviewInput,
    options: { beforeReplace?: () => void } = {},
  ): Promise<ProjectSaveOutcome> {
    if (savingPaths.has(this.filePath)) {
      throw new ProjectSessionError(
        'PROJECT_SAVE_IN_PROGRESS',
        'A Save for this Project is already running.',
      )
    }
    this.assertRebuildReady()
    const project = this.saved
    assertPreviewInput(project, input, true)
    savingPaths.add(this.filePath)
    try {
      return await withProjectPathLock(this.filePath, async () => {
        this.assertRebuildReady()
        const preview: IgsPackageWriteInput['preview'] = input.renderedPreview
          ? {
              merged: input.renderedPreview.merged,
              rect: input.renderedPreview.rect,
              status: 'rendered',
              thumbnail: input.renderedPreview.thumbnail,
            }
          : {
              ...(await readProjectPlaceholders(this.roots.placeholdersDir, 'empty')),
              rect: null,
              status: 'empty',
            }

        await mkdir(this.roots.scratchDir, { recursive: true })
        const scratch = await mkdtemp(
          path.join(await realpath(this.roots.scratchDir), 'igs-rebuild-'),
        )
        try {
          const projectJson = await this.savedPackage.readMember('project.json')
          const assets: Record<string, IgsAssetSource> = {}
          const memberPaths = new Set(projectAssetReferences(project).map((member) => member.path))
          let index = 0
          for (const memberPath of memberPaths) {
            const destination = path.join(scratch, `${index++}.member`)
            await this.savedPackage.extractMemberToFile(memberPath, destination)
            assets[memberPath] = { sourcePath: destination }
          }
          const written = await saveIgsPackage(
            this.filePath,
            { assets, preview, project, projectJson },
            {
              beforeRename: async () => {
                if (
                  (await canonicalProjectPath(this.filePath)) !== this.filePath ||
                  (await fileFingerprint(this.filePath)) !== this.savedFingerprint
                ) {
                  throw new ProjectSessionError(
                    'PROJECT_EXTERNAL_CHANGE',
                    'The saved Project changed before its preview could be rebuilt.',
                  )
                }
                this.assertRebuildReady()
                options.beforeReplace?.()
                this.assertRebuildReady()
              },
            },
          )
          await this.refreshCommittedPackage(project)
          return {
            committed: true,
            directorySynced: written.directorySynced,
            reloadRequired: this.reloadRequired,
          }
        } finally {
          await rm(scratch, { force: true, recursive: true }).catch((error: unknown) => {
            process.emitWarning(`Project preview rebuild cleanup failed: ${String(error)}`)
          })
        }
      })
    } finally {
      savingPaths.delete(this.filePath)
    }
  }

  /** Explicit Save. Candidate staging is not part of the input or the `.igs`. */
  async save(input: ProjectSaveInput = {}): Promise<ProjectSaveOutcome> {
    if (savingPaths.has(this.filePath)) {
      throw new ProjectSessionError(
        'PROJECT_SAVE_IN_PROGRESS',
        'A Save for this Project is already running.',
      )
    }
    // Capture the document before waiting for a Home scan/index critical section. Edits made
    // during that wait belong to the next Save, just like edits made during archive assembly.
    const project =
      input.lastActualSeedSnapshot === undefined
        ? this.current
        : parseProjectDocumentV1({
            ...this.current,
            lastActualSeedSnapshot: input.lastActualSeedSnapshot,
          })
    savingPaths.add(this.filePath)
    try {
      return await withProjectPathLock(
        this.filePath,
        async () => await this.saveOnce(input, project),
      )
    } finally {
      savingPaths.delete(this.filePath)
    }
  }

  private assertRebuildReady(): void {
    if (this.reloadRequired) {
      throw new ProjectSessionError('PROJECT_RELOAD_REQUIRED', 'Reopen the saved Project first.')
    }
    if (this.dirty || this.current.documentRevision !== this.saved.documentRevision) {
      throw new ProjectSessionError(
        'PROJECT_DIRTY',
        'Save the Project changes before rebuilding its preview.',
      )
    }
  }

  private async refreshCommittedPackage(project: IgsProjectDocumentV1): Promise<void> {
    try {
      const before = await fileFingerprint(this.filePath)
      const reopened = await readIgsPackage(this.filePath)
      const fingerprint = await fileFingerprint(this.filePath)
      if (
        before !== fingerprint ||
        reopened.project.documentId !== project.documentId ||
        reopened.project.documentRevision !== project.documentRevision
      ) {
        throw new ProjectSessionError(
          'PROJECT_EXTERNAL_CHANGE',
          'The Project changed immediately after its package replacement.',
        )
      }
      this.savedPackage = reopened
      this.savedFingerprint = fingerprint
    } catch {
      this.reloadRequired = true
    }
  }

  private async saveOnce(
    input: ProjectSaveInput,
    project: IgsProjectDocumentV1,
  ): Promise<ProjectSaveOutcome> {
    if (this.reloadRequired) {
      throw new ProjectSessionError('PROJECT_RELOAD_REQUIRED', 'Reopen the saved Project first.')
    }
    const supplied = input.assets ?? {}
    const memberPaths = new Set(projectAssetReferences(project).map((member) => member.path))
    for (const suppliedPath of Object.keys(supplied)) {
      if (!memberPaths.has(suppliedPath)) {
        throw new ProjectSessionError('PROJECT_INVALID_EDIT', 'An asset is not in the Project.')
      }
    }

    const visibleBounds = assertPreviewInput(project, input, false)

    const placeholderKind =
      input.emptyPreviewRevision !== undefined || !visibleBounds ? 'empty' : 'unavailable'
    const preview: IgsPackageWriteInput['preview'] = input.renderedPreview
      ? {
          merged: input.renderedPreview.merged,
          rect: input.renderedPreview.rect,
          status: 'rendered' as const,
          thumbnail: input.renderedPreview.thumbnail,
        }
      : {
          ...(await readProjectPlaceholders(this.roots.placeholdersDir, placeholderKind)),
          rect: placeholderKind === 'empty' ? null : visibleBounds,
          status: placeholderKind,
        }

    await mkdir(this.roots.scratchDir, { recursive: true })
    const scratch = await mkdtemp(path.join(await realpath(this.roots.scratchDir), 'igs-save-'))
    try {
      const assets: Record<string, IgsAssetSource> = { ...supplied }
      for (const memberPath of memberPaths) {
        if (assets[memberPath]) {
          continue
        }
        const destination = path.join(scratch, `${assetsCount(assets)}.member`)
        await this.savedPackage.extractMemberToFile(memberPath, destination)
        assets[memberPath] = { sourcePath: destination }
      }
      const result = await saveIgsPackage(
        this.filePath,
        { assets, preview, project },
        {
          beforeRename: async () => {
            if ((await fileFingerprint(this.filePath)) !== this.savedFingerprint) {
              throw new ProjectSessionError(
                'PROJECT_EXTERNAL_CHANGE',
                'The saved Project changed outside this tab.',
              )
            }
          },
        },
      )
      // Rename is the commit point. A post-commit read failure must not be
      // reported as a failed Save: the package writer already verified it.
      this.saved = project
      // Keep edits that arrived while the package was assembled, but move their portable
      // metadata to the just-committed snapshot without adding a document revision.
      this.current =
        contentKey(this.current) === contentKey(project)
          ? project
          : { ...this.current, lastActualSeedSnapshot: project.lastActualSeedSnapshot }
      await this.refreshCommittedPackage(project)
      return {
        committed: true,
        directorySynced: result.directorySynced,
        reloadRequired: this.reloadRequired,
      }
    } finally {
      // Scratch is disposable. Failure to remove it cannot turn a committed
      // package replacement into a failed Save.
      await rm(scratch, { force: true, recursive: true }).catch((error: unknown) => {
        process.emitWarning(`Project Save scratch cleanup failed: ${String(error)}`)
      })
    }
  }
}

function assertPreviewInput(
  project: IgsProjectDocumentV1,
  input: Pick<ProjectSaveInput, 'emptyPreviewRevision' | 'renderedPreview'>,
  requireExplicit: boolean,
): IgsPreviewRectV1 | null {
  const visibleBounds = visibleRasterBounds(project)
  if (input.renderedPreview && input.emptyPreviewRevision !== undefined) {
    throw new ProjectSessionError(
      'PROJECT_INVALID_PREVIEW',
      'A Project preview cannot be both rendered and empty.',
    )
  }
  if (requireExplicit && !input.renderedPreview && input.emptyPreviewRevision === undefined) {
    throw new ProjectSessionError(
      'PROJECT_INVALID_PREVIEW',
      'A rebuilt Project preview requires an exact derivative.',
    )
  }
  if (
    input.emptyPreviewRevision !== undefined &&
    input.emptyPreviewRevision !== project.documentRevision
  ) {
    throw new ProjectSessionError(
      'PROJECT_INVALID_PREVIEW',
      'The empty preview belongs to a different Project revision.',
    )
  }
  if (input.renderedPreview && !visibleBounds) {
    throw new ProjectSessionError(
      'PROJECT_INVALID_PREVIEW',
      'An empty Project cannot have a rendered preview.',
    )
  }
  if (
    input.renderedPreview &&
    input.renderedPreview.documentRevision !== project.documentRevision
  ) {
    throw new ProjectSessionError(
      'PROJECT_INVALID_PREVIEW',
      'The preview belongs to a different Project revision.',
    )
  }
  if (
    input.renderedPreview &&
    visibleBounds &&
    !containsRect(visibleBounds, input.renderedPreview.rect)
  ) {
    throw new ProjectSessionError(
      'PROJECT_INVALID_PREVIEW',
      'The preview lies outside this Project’s visible raster bounds.',
    )
  }
  return visibleBounds
}

function assetsCount(assets: Record<string, IgsAssetSource>): number {
  return Object.keys(assets).length
}

async function fileFingerprint(filePath: string): Promise<string> {
  const stats = await lstat(filePath, { bigint: true })
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new ProjectSessionError('PROJECT_EXTERNAL_CHANGE', 'The Project is not a file.')
  }
  return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}`
}

function contentKey(document: IgsProjectDocumentV1): string {
  return JSON.stringify({ ...document, documentRevision: null, lastActualSeedSnapshot: null })
}

function containsRect(outer: IgsPreviewRectV1, inner: IgsPreviewRectV1): boolean {
  return (
    Number.isSafeInteger(inner.x) &&
    Number.isSafeInteger(inner.y) &&
    Number.isSafeInteger(inner.width) &&
    Number.isSafeInteger(inner.height) &&
    inner.width > 0 &&
    inner.height > 0 &&
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

/** World-space visible raster bounds, separate from the finite preview bitmap resolution. */
function visibleRasterBounds(document: IgsProjectDocumentV1): IgsPreviewRectV1 | null {
  const layers = projectActiveRasterContributions(document).filter(
    (layer) => layer.visible && layer.opacity > 0,
  )
  if (layers.length === 0) {
    return null
  }
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const layer of layers) {
    const { rotationDegrees, scaleX, scaleY, x, y } = layer.transform
    const radians = (rotationDegrees * Math.PI) / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    for (const [cornerX, cornerY] of [
      [0, 0],
      [layer.asset.width, 0],
      [0, layer.asset.height],
      [layer.asset.width, layer.asset.height],
    ]) {
      const scaledX = cornerX * scaleX
      const scaledY = cornerY * scaleY
      const px = x + scaledX * cosine - scaledY * sine
      const py = y + scaledX * sine + scaledY * cosine
      minX = Math.min(minX, px)
      minY = Math.min(minY, py)
      maxX = Math.max(maxX, px)
      maxY = Math.max(maxY, py)
    }
  }
  return {
    height: Math.max(1, Math.ceil(maxY) - Math.floor(minY)),
    width: Math.max(1, Math.ceil(maxX) - Math.floor(minX)),
    x: Math.floor(minX),
    y: Math.floor(minY),
  }
}
