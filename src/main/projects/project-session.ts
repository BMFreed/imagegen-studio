import type {
  IgsPreviewRectV1,
  IgsProjectDocumentV1,
} from '../../shared/projects/project-schema.js'
import {
  createEmptyProjectDocumentV1,
  parseProjectDocumentV1,
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
import { canonicalProjectPath, localProjectRecoveryKey } from './project-identity.js'
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
  /** A derivative computed from this exact document revision. */
  renderedPreview?: RenderedProjectPreview
}

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
  get dirty(): boolean {
    return contentKey(this.current) !== contentKey(this.saved)
  }
  get document(): IgsProjectDocumentV1 {
    return structuredClone(this.current)
  }
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
  ): Promise<ProjectSession> {
    const canonicalPath = await canonicalProjectPath(filePath, { allowNewFile: true })
    const project = createEmptyProjectDocumentV1({ title })
    const placeholders = await readProjectPlaceholders(roots.placeholdersDir, 'empty')
    await saveIgsPackage(
      canonicalPath,
      { preview: { ...placeholders, rect: null, status: 'empty' }, project },
      { createOnly: true },
    )
    return await ProjectSession.open(canonicalPath, roots)
  }

  static async open(filePath: string, roots: ProjectSessionRoots): Promise<ProjectSession> {
    const canonicalPath = await canonicalProjectPath(filePath)
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
    const candidate = parseProjectDocumentV1(input)
    if (candidate.documentId !== this.current.documentId) {
      throw new ProjectSessionError('PROJECT_INVALID_EDIT', 'A Project ID cannot change in a tab.')
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

  /** Explicit Save. Candidate staging is not part of the input or the `.igs`. */
  async save(input: ProjectSaveInput = {}): Promise<ProjectSaveOutcome> {
    if (savingPaths.has(this.filePath)) {
      throw new ProjectSessionError(
        'PROJECT_SAVE_IN_PROGRESS',
        'A Save for this Project is already running.',
      )
    }
    savingPaths.add(this.filePath)
    // Capture the document before waiting for a Home scan/index critical section. Edits made
    // during that wait belong to the next Save, just like edits made during archive assembly.
    const project = this.current
    try {
      return await withProjectPathLock(
        this.filePath,
        async () => await this.saveOnce(input, project),
      )
    } finally {
      savingPaths.delete(this.filePath)
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
    const memberPaths = new Set(
      project.layers.flatMap((layer) => [
        layer.asset.path,
        ...(layer.sourceIccProfile ? [layer.sourceIccProfile.path] : []),
      ]),
    )
    for (const suppliedPath of Object.keys(supplied)) {
      if (!memberPaths.has(suppliedPath)) {
        throw new ProjectSessionError('PROJECT_INVALID_EDIT', 'An asset is not in the Project.')
      }
    }

    const visibleBounds = visibleRasterBounds(project)
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
      !sameRect(input.renderedPreview.rect, visibleBounds)
    ) {
      throw new ProjectSessionError(
        'PROJECT_INVALID_PREVIEW',
        'The preview does not cover this Project’s visible raster bounds.',
      )
    }

    const placeholderKind = visibleBounds ? 'unavailable' : 'empty'
    const preview: IgsPackageWriteInput['preview'] = input.renderedPreview
      ? {
          merged: input.renderedPreview.merged,
          rect: input.renderedPreview.rect,
          status: 'rendered' as const,
          thumbnail: input.renderedPreview.thumbnail,
        }
      : {
          ...(await readProjectPlaceholders(this.roots.placeholdersDir, placeholderKind)),
          rect: visibleBounds,
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
      if (contentKey(this.current) === contentKey(project)) {
        this.current = project
      }
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
            'The Project changed immediately after Save.',
          )
        }
        this.savedPackage = reopened
        this.savedFingerprint = fingerprint
      } catch {
        this.reloadRequired = true
      }
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
  return JSON.stringify({ ...document, documentRevision: null })
}

function sameRect(left: IgsPreviewRectV1, right: IgsPreviewRectV1): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

/** World-space visible raster bounds, separate from the finite preview bitmap resolution. */
function visibleRasterBounds(document: IgsProjectDocumentV1): IgsPreviewRectV1 | null {
  const layers = document.layers.filter((layer) => layer.visible && layer.opacity > 0)
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
