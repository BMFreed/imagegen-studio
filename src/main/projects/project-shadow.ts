import {
  IGS_SAFETY_CEILINGS,
  type IgsMemberRefV1,
  type IgsProjectDocumentV1,
  isIgsMemberPathV1,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, readdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import * as v from 'valibot'

import { type IgsAssetSource, type IgsPackageReadResult, readIgsPackage } from './igs-package.js'
import { canonicalProjectPath, localProjectRecoveryKey } from './project-identity.js'

const SHADOW_VERSION = 1
const MANIFEST_NAME = 'manifest.json'
const SNAPSHOTS_NAME = 'snapshots'
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const LOCAL_KEY_PATTERN = /^project-v1-[a-f0-9]{64}$/
const HASH_CHUNK_BYTES = 1024 * 1024

const Sha256Schema = v.pipe(v.string(), v.regex(SHA256_PATTERN))
const DirtyAssetSchema = v.strictObject({
  bytes: v.pipe(
    v.number(),
    v.safeInteger(),
    v.minValue(1),
    v.maxValue(IGS_SAFETY_CEILINGS.memberBytes),
  ),
  path: v.string(),
  sha256: Sha256Schema,
})
const RequiredAssetPathsSchema = v.pipe(
  v.array(v.string()),
  v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
)
const CommittingDocumentSchema = v.strictObject({
  documentHash: Sha256Schema,
  documentRevision: v.pipe(v.string(), v.uuid()),
  requiredAssetPaths: RequiredAssetPathsSchema,
})
const DirtyManifestSchema = v.strictObject({
  baseDocumentHash: Sha256Schema,
  baseDocumentRevision: v.pipe(v.string(), v.uuid()),
  baseRequiredAssetPaths: v.optional(RequiredAssetPathsSchema),
  committingDocument: v.optional(CommittingDocumentSchema),
  dirtyAssets: v.pipe(v.array(DirtyAssetSchema), v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries)),
  documentHash: Sha256Schema,
  documentId: v.pipe(v.string(), v.uuid()),
  documentRevision: v.pipe(v.string(), v.uuid()),
  localProjectKey: v.pipe(v.string(), v.regex(LOCAL_KEY_PATTERN)),
  shadowVersion: v.literal(SHADOW_VERSION),
  snapshotId: v.pipe(v.string(), v.uuid()),
  state: v.literal('dirty'),
})
const CleanManifestSchema = v.strictObject({
  documentRevision: v.pipe(v.string(), v.uuid()),
  localProjectKey: v.pipe(v.string(), v.regex(LOCAL_KEY_PATTERN)),
  shadowVersion: v.literal(SHADOW_VERSION),
  state: v.literal('clean'),
})
const ManifestSchema = v.variant('state', [DirtyManifestSchema, CleanManifestSchema])

export interface ProjectShadowWriteInput {
  /** Frozen Save target A while the current on-disk revision is still savedDocument S. */
  committingDocument?: IgsProjectDocumentV1
  /** Exactly the new/changed referenced members, keyed by `.igs` member path. */
  dirtyAssets?: Readonly<Record<string, IgsAssetSource>>
  /** Current document; an exact undo to S is recoverable if frozen Save A commits. */
  document: IgsProjectDocumentV1
  /** Canonical local `.igs` path, never the portable document ID. */
  projectPath: string
  /** The revision currently stored in the real `.igs`. */
  savedDocument: IgsProjectDocumentV1
}
export interface ProjectShadowWriteOptions {
  /** Failure injection after all snapshot files are durable and before manifest publication. */
  beforeManifestCommit?: () => Promise<void>
}
export interface ProjectShadowCommit {
  baseDocumentRevision: string
  committingDocumentRevision?: string
  directorySynced: boolean
  documentId: string
  documentRevision: string
  localRecoveryKey: string
}

export type ProjectShadowInspection =
  | {
      dirtyAssets: Readonly<Record<string, IgsAssetSource>>
      document: IgsProjectDocumentV1
      documentRevision: string
      status: 'recoverable'
    }
  | { reason: 'BASE_DOCUMENT_CHANGED'; status: 'stale' }
  | {
      reason:
        | 'ASSET_MISMATCH'
        | 'ASSET_MISSING'
        | 'DOCUMENT_INVALID'
        | 'DOCUMENT_MISSING'
        | 'MANIFEST_INVALID'
        | 'SHADOW_IO_ERROR'
        | 'SHADOW_PATH_UNSAFE'
        | 'SHADOW_VERSION_UNSUPPORTED'
      status: 'invalid'
    }
  | { status: 'absent' }
  | { status: 'clean' }

type ShadowManifest = v.InferOutput<typeof ManifestSchema>

type DirtyManifest = v.InferOutput<typeof DirtyManifestSchema>

type DirtyAssetRef = v.InferOutput<typeof DirtyAssetSchema>

type MemberRef = Pick<IgsMemberRefV1, 'bytes' | 'path' | 'sha256'> & {
  height?: number
  width?: number
}

export class ProjectShadowError extends Error {
  constructor(
    readonly code:
      | 'SHADOW_ASSET_MISMATCH'
      | 'SHADOW_ASSET_SOURCE'
      | 'SHADOW_INVALID_REQUEST'
      | 'SHADOW_INVALID_STATE'
      | 'SHADOW_IO_ERROR'
      | 'SHADOW_PATH_UNSAFE'
      | 'SHADOW_VERSION_UNSUPPORTED',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectShadowError'
  }
}

const keyLocks = new Map<string, Promise<void>>()

/**
 * App-owned dirty-document recovery. A manifest rename is the sole publication point; unlisted
 * snapshot directories and temporary files are never recovery candidates.
 */
export class ProjectShadowStore {
  private readonly root: string

  constructor(autosaveRoot: string) {
    if (!path.isAbsolute(autosaveRoot) || path.resolve(autosaveRoot) !== autosaveRoot) {
      throw new ProjectShadowError('SHADOW_INVALID_REQUEST', 'Autosave root must be absolute.')
    }
    this.root = autosaveRoot
  }

  /** Explicit Discard Changes/Recovery; generation staging uses a separate store. */
  async discard(projectPath: string): Promise<void> {
    const { directory, key } = await this.identify(projectPath)
    await withKeyLock(key, async () => {
      try {
        await requireDirectory(this.root)
        await requireDirectory(directory)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return
        }
        throw error
      }
      const discarded = path.join(this.root, `.discard-${key}-${randomUUID()}`)
      await rename(directory, discarded)
      await syncDirectory(this.root)
      await rm(discarded, { force: true, recursive: true })
    })
  }

  async inspect(input: {
    projectPath: string
    savedPackage: IgsPackageReadResult
  }): Promise<ProjectShadowInspection> {
    const { directory, key } = await this.identify(input.projectPath)
    return await withKeyLock(key, async () => {
      let manifest: ShadowManifest | null
      try {
        await requireDirectory(this.root)
        await requireDirectory(directory)
        manifest = await readManifest(directory)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return { status: 'absent' }
        }
        if (error instanceof ProjectShadowError) {
          return {
            reason:
              error.code === 'SHADOW_VERSION_UNSUPPORTED'
                ? 'SHADOW_VERSION_UNSUPPORTED'
                : error.code === 'SHADOW_PATH_UNSAFE'
                  ? 'SHADOW_PATH_UNSAFE'
                  : 'MANIFEST_INVALID',
            status: 'invalid',
          }
        }
        return { reason: 'SHADOW_IO_ERROR', status: 'invalid' }
      }
      if (!manifest) {
        return { status: 'absent' }
      }
      if (manifest.localProjectKey !== key) {
        return { reason: 'SHADOW_PATH_UNSAFE', status: 'invalid' }
      }
      if (manifest.state === 'clean') {
        return { status: 'clean' }
      }
      const saved = input.savedPackage.project
      const savedHash = sha256(documentBytes(saved))
      if (manifest.documentId !== saved.documentId) {
        return { reason: 'BASE_DOCUMENT_CHANGED', status: 'stale' }
      }
      // Save may have committed the very document that was shadowed before markClean ran.
      // Exact document identity is sufficient to suppress a false Recovery available status.
      if (
        manifest.documentRevision === saved.documentRevision &&
        manifest.documentHash === savedHash
      ) {
        return { status: 'clean' }
      }
      const matchesBase =
        manifest.baseDocumentRevision === saved.documentRevision &&
        manifest.baseDocumentHash === savedHash
      const matchesCommitting =
        manifest.committingDocument?.documentRevision === saved.documentRevision &&
        manifest.committingDocument.documentHash === savedHash
      if (!matchesBase && !matchesCommitting) {
        return { reason: 'BASE_DOCUMENT_CHANGED', status: 'stale' }
      }
      const snapshot = path.join(directory, SNAPSHOTS_NAME, manifest.snapshotId)
      let document: IgsProjectDocumentV1
      try {
        await requireDirectory(path.join(directory, SNAPSHOTS_NAME))
        await requireDirectory(snapshot)
        const bytes = await safeRead(
          path.join(snapshot, 'project.json'),
          IGS_SAFETY_CEILINGS.projectJsonBytes,
        )
        if (sha256(bytes) !== manifest.documentHash) {
          return { reason: 'DOCUMENT_INVALID', status: 'invalid' }
        }
        document = parseProjectDocumentV1(
          JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown,
        )
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return { reason: 'DOCUMENT_MISSING', status: 'invalid' }
        }
        return { reason: 'DOCUMENT_INVALID', status: 'invalid' }
      }
      if (
        document.documentId !== manifest.documentId ||
        document.documentRevision !== manifest.documentRevision
      ) {
        return { reason: 'DOCUMENT_INVALID', status: 'invalid' }
      }
      if (contentKey(document) === contentKey(saved)) {
        return { status: 'clean' }
      }
      let expected: DirtyAssetRef[]
      try {
        expected = changedMembers(document, saved)
      } catch {
        return { reason: 'DOCUMENT_INVALID', status: 'invalid' }
      }
      const requiredPaths = matchesBase
        ? (manifest.baseRequiredAssetPaths ?? manifest.dirtyAssets.map((member) => member.path))
        : (manifest.committingDocument?.requiredAssetPaths ?? [])
      if (!validAssetPlan(manifest, document) || !samePaths(expected, requiredPaths)) {
        return { reason: 'MANIFEST_INVALID', status: 'invalid' }
      }
      const dirtyAssets: Record<string, IgsAssetSource> = {}
      for (const member of expected) {
        const staged = manifest.dirtyAssets.find((candidate) => candidate.path === member.path)
        if (!staged || !sameAssetRef(staged, member)) {
          return { reason: 'MANIFEST_INVALID', status: 'invalid' }
        }
        const assetPath = path.join(snapshot, member.path)
        const state = await hashFile(assetPath, member)
        if (state !== 'valid') {
          return {
            reason: state === 'missing' ? 'ASSET_MISSING' : 'ASSET_MISMATCH',
            status: 'invalid',
          }
        }
        dirtyAssets[member.path] = { sourcePath: assetPath }
      }
      return {
        dirtyAssets,
        document,
        documentRevision: document.documentRevision,
        status: 'recoverable',
      }
    })
  }

  /** Clear only the revision that actually committed to `.igs`; a later edit remains recoverable. */
  async markClean(
    projectPath: string,
    committedDocumentRevision: string,
  ): Promise<{ cleaned: boolean; directorySynced: boolean }> {
    const { directory, key } = await this.identify(projectPath)
    return await withKeyLock(key, async () => {
      let manifest: ShadowManifest | null
      try {
        manifest = await readManifest(directory)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return { cleaned: false, directorySynced: true }
        }
        throw error
      }
      if (
        !manifest ||
        manifest.state !== 'dirty' ||
        manifest.documentRevision !== committedDocumentRevision
      ) {
        return { cleaned: false, directorySynced: true }
      }
      if (manifest.localProjectKey !== key) {
        throw new ProjectShadowError(
          'SHADOW_INVALID_STATE',
          'Shadow belongs to a different Project.',
        )
      }
      // A caller-provided revision is not proof that Save committed. Reopen the actual package
      // before making the recovery snapshot inaccessible.
      const committed = await readIgsPackage(projectPath)
      if (
        committed.project.documentRevision !== committedDocumentRevision ||
        sha256(documentBytes(committed.project)) !== manifest.documentHash
      ) {
        return { cleaned: false, directorySynced: true }
      }
      const directorySynced = await writeManifest(directory, {
        documentRevision: committedDocumentRevision,
        localProjectKey: key,
        shadowVersion: SHADOW_VERSION,
        state: 'clean',
      })
      await pruneOtherSnapshots(path.join(directory, SNAPSHOTS_NAME)).catch((error: unknown) => {
        process.emitWarning(`Project shadow cleanup failed: ${String(error)}`)
      })
      return { cleaned: true, directorySynced }
    })
  }

  async write(
    input: ProjectShadowWriteInput,
    options: ProjectShadowWriteOptions = {},
  ): Promise<ProjectShadowCommit> {
    const { directory, key } = await this.identify(input.projectPath)
    return await withKeyLock(key, async () => {
      const {
        baseRequired,
        changed,
        committingDocument,
        committingRequired,
        document,
        savedDocument,
        serialized,
      } = validateWrite(input)
      await ensureDirectory(this.root)
      await ensureDirectory(directory)
      await syncDirectory(this.root)
      const snapshots = path.join(directory, SNAPSHOTS_NAME)
      await ensureDirectory(snapshots)
      await syncDirectory(directory)
      const pending = await mkdtemp(path.join(snapshots, '.pending-'))
      const snapshotId = randomUUID()
      const published = path.join(snapshots, snapshotId)
      let manifestCommitted = false
      try {
        await writeSynced(path.join(pending, 'project.json'), serialized)
        for (const member of changed) {
          const destination = path.join(pending, member.path)
          await ensureDirectory(path.dirname(destination))
          await copyVerifiedAsset(input.dirtyAssets![member.path], member, destination)
        }
        const directories = new Set<string>([pending])
        for (const member of changed) {
          let current = path.dirname(path.join(pending, member.path))
          while (current !== pending) {
            directories.add(current)
            current = path.dirname(current)
          }
        }
        for (const item of [...directories].sort((a, b) => b.length - a.length)) {
          await syncDirectory(item)
        }
        await rename(pending, published)
        await syncDirectory(snapshots)
        const manifest: DirtyManifest = {
          baseDocumentHash: sha256(documentBytes(savedDocument)),
          baseDocumentRevision: savedDocument.documentRevision,
          baseRequiredAssetPaths: baseRequired.map((member) => member.path),
          ...(committingDocument
            ? {
                committingDocument: {
                  documentHash: sha256(documentBytes(committingDocument)),
                  documentRevision: committingDocument.documentRevision,
                  requiredAssetPaths: committingRequired.map((member) => member.path),
                },
              }
            : {}),
          dirtyAssets: changed,
          documentHash: sha256(serialized),
          documentId: document.documentId,
          documentRevision: document.documentRevision,
          localProjectKey: key,
          shadowVersion: SHADOW_VERSION,
          snapshotId,
          state: 'dirty',
        }
        // A simulated crash before this point leaves the previous manifest authoritative.
        await options.beforeManifestCommit?.()
        const directorySynced = await writeManifest(directory, manifest)
        manifestCommitted = true
        await pruneOtherSnapshots(snapshots, snapshotId).catch((error: unknown) => {
          process.emitWarning(`Project shadow cleanup failed: ${String(error)}`)
        })
        return {
          baseDocumentRevision: savedDocument.documentRevision,
          ...(committingDocument
            ? { committingDocumentRevision: committingDocument.documentRevision }
            : {}),
          directorySynced,
          documentId: document.documentId,
          documentRevision: document.documentRevision,
          localRecoveryKey: key,
        }
      } finally {
        if (!manifestCommitted) {
          await rm(pending, { force: true, recursive: true }).catch(() => undefined)
          await rm(published, { force: true, recursive: true }).catch(() => undefined)
        }
      }
    })
  }

  private async identify(projectPath: string): Promise<{ directory: string; key: string }> {
    const canonical = await canonicalProjectPath(projectPath)
    if (canonical !== projectPath) {
      throw new ProjectShadowError('SHADOW_INVALID_REQUEST', 'Project path must be canonical.')
    }
    const key = localProjectRecoveryKey(canonical)
    return { directory: path.join(this.root, key), key }
  }
}

async function withKeyLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = keyLocks.get(key) ?? Promise.resolve()
  let release: () => void = () => undefined
  const active = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => active)
  keyLocks.set(key, tail)
  await previous
  try {
    return await work()
  } finally {
    release()
    if (keyLocks.get(key) === tail) {
      keyLocks.delete(key)
    }
  }
}

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function documentBytes(document: IgsProjectDocumentV1): Buffer {
  const bytes = Buffer.from(JSON.stringify(document), 'utf8')
  if (bytes.length > IGS_SAFETY_CEILINGS.projectJsonBytes) {
    throw new ProjectShadowError(
      'SHADOW_INVALID_REQUEST',
      'Project document exceeds its safety limit.',
    )
  }
  return bytes
}

function contentKey(document: IgsProjectDocumentV1): string {
  // The seed snapshot is portable Save metadata, not an editable document difference. Keep
  // documentBytes() exact: the committing hash still identifies the package after rename.
  return JSON.stringify({ ...document, documentRevision: null, lastActualSeedSnapshot: null })
}

function referencedMembers(document: IgsProjectDocumentV1): Map<string, MemberRef> {
  const members = new Map<string, MemberRef>()
  const add = (member: MemberRef): void => {
    if (!isIgsMemberPathV1(member.path) || !member.path.startsWith('assets/')) {
      throw new ProjectShadowError('SHADOW_INVALID_REQUEST', 'Project has an unsafe asset path.')
    }
    const previous = members.get(member.path)
    if (previous && JSON.stringify(previous) !== JSON.stringify(member)) {
      throw new ProjectShadowError(
        'SHADOW_INVALID_REQUEST',
        'An asset path has conflicting references.',
      )
    }
    members.set(member.path, member)
  }
  for (const layer of document.layers) {
    add(layer.asset)
    if (layer.sourceIccProfile) {
      add(layer.sourceIccProfile)
    }
  }
  return members
}

function changedMembers(
  document: IgsProjectDocumentV1,
  savedDocument: IgsProjectDocumentV1,
): DirtyAssetRef[] {
  const saved = referencedMembers(savedDocument)
  const changed: DirtyAssetRef[] = []
  for (const member of referencedMembers(document).values()) {
    const previous = saved.get(member.path)
    if (
      previous &&
      previous.bytes === member.bytes &&
      previous.sha256 === member.sha256 &&
      previous.width === member.width &&
      previous.height === member.height
    ) {
      continue
    }
    changed.push({ bytes: member.bytes, path: member.path, sha256: member.sha256 })
  }
  if (changed.length > IGS_SAFETY_CEILINGS.archiveEntries) {
    throw new ProjectShadowError('SHADOW_INVALID_REQUEST', 'Too many changed Project assets.')
  }
  const total = changed.reduce((sum, member) => sum + member.bytes, 0)
  if (total > IGS_SAFETY_CEILINGS.archiveUncompressedBytes) {
    throw new ProjectShadowError(
      'SHADOW_INVALID_REQUEST',
      'Changed assets exceed the safety limit.',
    )
  }
  return changed.sort((left, right) => left.path.localeCompare(right.path))
}

function sameAssetRef(left: DirtyAssetRef, right: DirtyAssetRef): boolean {
  return left.path === right.path && left.bytes === right.bytes && left.sha256 === right.sha256
}

function samePaths(members: DirtyAssetRef[], paths: string[]): boolean {
  return (
    members.length === paths.length &&
    members.every((member, index) => member.path === paths[index])
  )
}

function sortedUnique(paths: string[]): boolean {
  return paths.every((value, index) => index === 0 || paths[index - 1] < value)
}

function unionChangedMembers(...groups: DirtyAssetRef[][]): DirtyAssetRef[] {
  const union = new Map<string, DirtyAssetRef>()
  for (const group of groups) {
    for (const member of group) {
      const previous = union.get(member.path)
      if (previous && !sameAssetRef(previous, member)) {
        throw new ProjectShadowError(
          'SHADOW_INVALID_REQUEST',
          'An asset has conflicting references.',
        )
      }
      union.set(member.path, member)
    }
  }
  const members = [...union.values()].sort((left, right) => left.path.localeCompare(right.path))
  if (
    members.length > IGS_SAFETY_CEILINGS.archiveEntries ||
    members.reduce((sum, member) => sum + member.bytes, 0) >
      IGS_SAFETY_CEILINGS.archiveUncompressedBytes
  ) {
    throw new ProjectShadowError('SHADOW_INVALID_REQUEST', 'Changed assets exceed safety limits.')
  }
  return members
}

function validAssetPlan(manifest: DirtyManifest, document: IgsProjectDocumentV1): boolean {
  const stagedPaths = manifest.dirtyAssets.map((member) => member.path)
  const basePaths = manifest.baseRequiredAssetPaths ?? stagedPaths
  const committingPaths = manifest.committingDocument?.requiredAssetPaths ?? []
  const unionPaths = [...new Set([...basePaths, ...committingPaths])].sort()
  if (
    (manifest.committingDocument && !manifest.baseRequiredAssetPaths) ||
    !sortedUnique(stagedPaths) ||
    !sortedUnique(basePaths) ||
    !sortedUnique(committingPaths) ||
    stagedPaths.length !== unionPaths.length ||
    stagedPaths.some((memberPath, index) => memberPath !== unionPaths[index])
  ) {
    return false
  }
  try {
    const references = referencedMembers(document)
    return manifest.dirtyAssets.every((member) => {
      const reference = references.get(member.path)
      return reference && reference.bytes === member.bytes && reference.sha256 === member.sha256
    })
  } catch {
    return false
  }
}

function validateWrite(input: ProjectShadowWriteInput): {
  baseRequired: DirtyAssetRef[]
  changed: DirtyAssetRef[]
  committingDocument: IgsProjectDocumentV1 | null
  committingRequired: DirtyAssetRef[]
  document: IgsProjectDocumentV1
  savedDocument: IgsProjectDocumentV1
  serialized: Buffer
} {
  const document = parseProjectDocumentV1(input.document)
  const savedDocument = parseProjectDocumentV1(input.savedDocument)
  const committingDocument = input.committingDocument
    ? parseProjectDocumentV1(input.committingDocument)
    : null
  const savedContent = contentKey(savedDocument)
  const documentContent = contentKey(document)
  const commitsDifferentContent =
    committingDocument &&
    committingDocument.documentRevision !== savedDocument.documentRevision &&
    contentKey(committingDocument) !== savedContent
  const dirtyFromSaved =
    document.documentRevision !== savedDocument.documentRevision && documentContent !== savedContent
  const exactUndoDuringSave =
    document.documentRevision === savedDocument.documentRevision &&
    documentContent === savedContent &&
    commitsDifferentContent
  if (
    document.documentId !== savedDocument.documentId ||
    (!dirtyFromSaved && !exactUndoDuringSave)
  ) {
    throw new ProjectShadowError(
      'SHADOW_INVALID_REQUEST',
      'Shadow requires a dirty Project revision or an undo during Save.',
    )
  }
  if (
    committingDocument &&
    (committingDocument.documentId !== document.documentId ||
      (committingDocument.documentRevision === savedDocument.documentRevision &&
        contentKey(committingDocument) !== contentKey(savedDocument)) ||
      (committingDocument.documentRevision === document.documentRevision &&
        contentKey(committingDocument) !== contentKey(document)))
  ) {
    throw new ProjectShadowError(
      'SHADOW_INVALID_REQUEST',
      'The committing Project document does not match this Save transition.',
    )
  }
  const baseRequired = changedMembers(document, savedDocument)
  const committingRequired = committingDocument ? changedMembers(document, committingDocument) : []
  const changed = unionChangedMembers(baseRequired, committingRequired)
  const supplied = input.dirtyAssets ?? {}
  if (
    Object.keys(supplied).length !== changed.length ||
    changed.some((member) => !Object.hasOwn(supplied, member.path))
  ) {
    throw new ProjectShadowError(
      'SHADOW_INVALID_REQUEST',
      'Supply exactly the new or changed referenced Project assets.',
    )
  }
  return {
    baseRequired,
    changed,
    committingDocument,
    committingRequired,
    document,
    savedDocument,
    serialized: documentBytes(document),
  }
}

async function requireDirectory(directory: string): Promise<void> {
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new ProjectShadowError('SHADOW_PATH_UNSAFE', 'A shadow directory is unsafe.')
  }
}

async function ensureDirectory(directory: string): Promise<void> {
  await mkdir(directory, { mode: 0o700, recursive: true })
  await requireDirectory(directory)
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function writeSynced(pathname: string, bytes: Buffer): Promise<void> {
  const handle = await open(pathname, 'wx', 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

function memberCeiling(memberPath: string): number {
  return memberPath.startsWith('assets/profiles/')
    ? IGS_SAFETY_CEILINGS.iccProfileBytes
    : IGS_SAFETY_CEILINGS.memberBytes
}

async function copyVerifiedAsset(
  source: IgsAssetSource,
  member: DirtyAssetRef,
  destination: string,
): Promise<void> {
  if (member.bytes > memberCeiling(member.path)) {
    throw new ProjectShadowError('SHADOW_ASSET_MISMATCH', 'Project asset exceeds its safety limit.')
  }
  const output = await open(destination, 'wx', 0o600)
  let input: Awaited<ReturnType<typeof open>> | undefined
  try {
    const digest = createHash('sha256')
    let copied = 0
    if ('bytes' in source) {
      if (!Buffer.isBuffer(source.bytes)) {
        throw new ProjectShadowError('SHADOW_ASSET_SOURCE', 'Asset source must be bytes or a file.')
      }
      copied = source.bytes.length
      digest.update(source.bytes)
      await output.writeFile(source.bytes)
    } else {
      if (!path.isAbsolute(source.sourcePath)) {
        throw new ProjectShadowError('SHADOW_ASSET_SOURCE', 'Asset source path must be absolute.')
      }
      input = await open(
        source.sourcePath,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      )
      const stats = await input.stat()
      if (!stats.isFile() || stats.size !== member.bytes) {
        throw new ProjectShadowError(
          'SHADOW_ASSET_MISMATCH',
          'Asset source differs from its reference.',
        )
      }
      const chunk = Buffer.allocUnsafe(HASH_CHUNK_BYTES)
      while (true) {
        const { bytesRead } = await input.read(chunk, 0, chunk.length, null)
        if (bytesRead === 0) {
          break
        }
        copied += bytesRead
        if (copied > member.bytes) {
          throw new ProjectShadowError(
            'SHADOW_ASSET_MISMATCH',
            'Asset source changed while copying.',
          )
        }
        digest.update(chunk.subarray(0, bytesRead))
        let written = 0
        while (written < bytesRead) {
          const result = await output.write(chunk, written, bytesRead - written)
          written += result.bytesWritten
        }
      }
    }
    if (copied !== member.bytes || digest.digest('hex') !== member.sha256) {
      throw new ProjectShadowError(
        'SHADOW_ASSET_MISMATCH',
        'Asset source differs from its reference.',
      )
    }
    await output.sync()
  } finally {
    await input?.close()
    await output.close()
  }
}

async function writeManifest(projectDirectory: string, manifest: ShadowManifest): Promise<boolean> {
  const temporary = path.join(projectDirectory, `.manifest-${randomUUID()}.tmp`)
  try {
    await writeSynced(temporary, Buffer.from(JSON.stringify(manifest), 'utf8'))
    await rename(temporary, path.join(projectDirectory, MANIFEST_NAME))
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
  try {
    await syncDirectory(projectDirectory)
    return true
  } catch {
    // The manifest rename committed, but crash durability of its directory is uncertain.
    return false
  }
}

async function safeRead(pathname: string, maximumBytes: number): Promise<Buffer> {
  const handle = await open(
    pathname,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const stats = await handle.stat()
    if (!stats.isFile() || stats.size > maximumBytes) {
      throw new ProjectShadowError(
        'SHADOW_INVALID_STATE',
        'Shadow file is not a safe regular file.',
      )
    }
    const bytes = await handle.readFile()
    if (bytes.length > maximumBytes) {
      throw new ProjectShadowError('SHADOW_INVALID_STATE', 'Shadow file exceeds its safety limit.')
    }
    return bytes
  } finally {
    await handle.close()
  }
}

async function readManifest(projectDirectory: string): Promise<ShadowManifest | null> {
  let raw: Buffer
  try {
    raw = await safeRead(
      path.join(projectDirectory, MANIFEST_NAME),
      IGS_SAFETY_CEILINGS.manifestJsonBytes,
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) as unknown
  } catch {
    throw new ProjectShadowError('SHADOW_INVALID_STATE', 'Shadow manifest is invalid.')
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'shadowVersion' in value &&
    value.shadowVersion !== SHADOW_VERSION
  ) {
    throw new ProjectShadowError('SHADOW_VERSION_UNSUPPORTED', 'Shadow version is unsupported.')
  }
  const result = v.safeParse(ManifestSchema, value)
  if (!result.success) {
    throw new ProjectShadowError('SHADOW_INVALID_STATE', 'Shadow manifest is invalid.')
  }
  return result.output
}

async function hashFile(
  pathname: string,
  member: DirtyAssetRef,
): Promise<'mismatch' | 'missing' | 'valid'> {
  let handle: Awaited<ReturnType<typeof open>>
  try {
    handle = await open(pathname, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'missing'
    }
    return 'mismatch'
  }
  try {
    const stats = await handle.stat()
    if (!stats.isFile() || stats.size !== member.bytes || stats.size > memberCeiling(member.path)) {
      return 'mismatch'
    }
    const digest = createHash('sha256')
    let total = 0
    const chunk = Buffer.allocUnsafe(HASH_CHUNK_BYTES)
    while (true) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
      if (bytesRead === 0) {
        break
      }
      total += bytesRead
      if (total > member.bytes) {
        return 'mismatch'
      }
      digest.update(chunk.subarray(0, bytesRead))
    }
    return total === member.bytes && digest.digest('hex') === member.sha256 ? 'valid' : 'mismatch'
  } catch {
    return 'mismatch'
  } finally {
    await handle.close()
  }
}

async function pruneOtherSnapshots(
  snapshotsDirectory: string,
  activeSnapshotId?: string,
): Promise<void> {
  for (const entry of await readdir(snapshotsDirectory)) {
    if (entry === activeSnapshotId) {
      continue
    }
    await rm(path.join(snapshotsDirectory, entry), { force: true, recursive: true })
  }
}
