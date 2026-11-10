import type { FileHandle } from 'node:fs/promises'

import { createHash, randomUUID } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import {
  link,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rmdir,
  unlink,
} from 'node:fs/promises'
import path from 'node:path'

import {
  ModelDownloader,
  type ModelDownloadInput,
  type ModelDownloadSource,
  type VerifiedStagedModelFile,
} from '../models/model-downloader.js'
import {
  auxiliaryArtifactMaximumBytes,
  createRegionalReferenceVisionResourceRoot,
  type InferenceAuxiliaryResourceRole,
  verifyInferenceAuxiliaryFile,
} from './inference-auxiliary-resources.js'
import { LAMA_OUTPAINT_ARTIFACT } from './lama-manifest.js'
import {
  REGIONAL_REFERENCE_ADAPTER_ARTIFACT,
  REGIONAL_REFERENCE_ARTIFACTS,
  REGIONAL_REFERENCE_VISION_CONFIG_ARTIFACT,
  REGIONAL_REFERENCE_VISION_MODEL_ARTIFACT,
} from './regional-reference-manifest.js'

const DEFAULT_PLAN_TTL_MS = 10 * 60 * 1000
const MAX_PENDING_PLANS = 32
const activeRoots = new Set<string>()

/** Internal trusted-Main seam. Renderer-provided manifests and destinations are not accepted. */
export interface AuxiliaryArtifactManifest {
  readonly filename: string
  readonly role: InferenceAuxiliaryResourceRole
  readonly sha256: string
  readonly sizeBytes: number
  readonly source: ModelDownloadSource
  readonly url: string
}

export interface AuxiliaryInstallationPreview {
  readonly artifact: Readonly<{
    filename: string
    role: InferenceAuxiliaryResourceRole
    sha256: string
    sizeBytes: number
  }>
  readonly expiresAt: number
  readonly installed: boolean
  readonly planId: string
  readonly requiredDownloadBytes: number
  /** This preview never represents the total Python/runtime engine download. */
  readonly scope: 'auxiliary-weights'
}

export interface AuxiliaryInstallationResult {
  readonly byteSize: number
  readonly managedPath: string
  readonly reused: boolean
  readonly role: InferenceAuxiliaryResourceRole
  readonly sha256: string
}

export interface AuxiliaryInstallerOptions {
  readonly clock?: () => number
  readonly downloader: Pick<ModelDownloader, 'download'>
  readonly manifest: AuxiliaryArtifactManifest
  readonly planTtlMs?: number
  readonly resourcesDirectory: string
}

interface OwnedDirectory {
  readonly anchor: string
  readonly handle: FileHandle
  readonly identity: BigIntStats
  readonly visiblePath: string
}

interface InstallationPlan {
  readonly directoryDev: bigint
  readonly directoryIno: bigint
  readonly expiresAt: number
  readonly installed: boolean
}

export class AuxiliaryInstallationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AuxiliaryInstallationError'
  }
}

/**
 * Linux single-instance Main owner for one exact auxiliary artifact. Plans and exclusive per-root
 * reservations remain private in memory; process death releases the reservation. Directory
 * descriptors anchor writes/publication/cleanup even if a pathname is replaced. Private work is
 * exclusively owned by this Main operation. This is not an isolation boundary against arbitrary
 * other processes running under the same user account.
 */
export class AuxiliaryArtifactInstaller {
  private readonly clock: () => number
  private readonly downloader: Pick<ModelDownloader, 'download'>
  private readonly manifest: AuxiliaryArtifactManifest
  private readonly plans = new Map<string, InstallationPlan>()
  private readonly planTtlMs: number
  private readonly resourcesDirectory: string

  constructor(options: AuxiliaryInstallerOptions) {
    assertCanonicalPath(options.resourcesDirectory)
    this.resourcesDirectory = options.resourcesDirectory
    this.manifest = captureManifest(options.manifest)
    this.downloader = options.downloader
    this.clock = options.clock ?? Date.now
    this.planTtlMs = options.planTtlMs ?? DEFAULT_PLAN_TTL_MS
    if (!Number.isSafeInteger(this.planTtlMs) || this.planTtlMs < 1) {
      throw failure('AUXILIARY_INVALID_PLAN', 'The installation plan lifetime is invalid.')
    }
  }

  async install(
    planId: string,
    options: Pick<ModelDownloadInput, 'onProgress' | 'signal'> = {},
  ): Promise<AuxiliaryInstallationResult> {
    const { onProgress, signal } = options
    const plan = this.plans.get(planId)
    this.plans.delete(planId)
    if (plan === undefined || this.now() >= plan.expiresAt) {
      throw failure('AUXILIARY_INVALID_PLAN', 'The installation preview expired or was consumed.')
    }
    assertNotCanceled(signal)
    if (activeRoots.has(this.resourcesDirectory)) {
      throw failure('AUXILIARY_INSTALL_BUSY', 'Another auxiliary installation is active.')
    }
    activeRoots.add(this.resourcesDirectory)
    let directory: OwnedDirectory | undefined
    let work: OwnedDirectory | undefined
    let workName: string | undefined
    let preserveWork = false
    try {
      directory = await openOwnedDirectory(this.resourcesDirectory)
      if (
        directory.identity.dev !== plan.directoryDev ||
        directory.identity.ino !== plan.directoryIno
      ) {
        throw failure('AUXILIARY_PLAN_CHANGED', 'The reviewed auxiliary storage changed.')
      }
      await assertDirectoryIdentity(directory)
      assertNotCanceled(signal)

      // A preview is informational: recheck bytes under the operation lock before reuse.
      if (await this.isInstalled(directory)) {
        await assertDirectoryIdentity(directory)
        assertNotCanceled(signal)
        return this.result(true)
      }
      if (plan.installed) {
        throw failure(
          'AUXILIARY_PLAN_CHANGED',
          'The verified artifact changed; review the required download volume again.',
        )
      }
      await assertReplaceableDestination(directory, this.manifest.filename)
      workName = `.outpaint-infill-${randomUUID()}`
      await mkdir(path.join(directory.anchor, workName), { mode: 0o700 })
      const createdWork = await lstat(path.join(directory.anchor, workName), { bigint: true })
      const candidate = await openOwnedDirectory(path.join(this.resourcesDirectory, workName))
      if (!createdWork.isDirectory() || !sameInode(createdWork, candidate.identity)) {
        await candidate.handle.close()
        throw failure('AUXILIARY_INVALID_STORAGE', 'The new auxiliary work directory changed.')
      }
      work = candidate
      await assertDirectoryIdentity(directory)
      const downloaded = await this.downloader.download({
        expectedBytes: this.manifest.sizeBytes,
        expectedSha256: this.manifest.sha256,
        onProgress,
        signal,
        source: this.manifest.source,
        // The trailing /. addresses the open directory, not the procfs descriptor symlink.
        stagingDirectory: `${work.anchor}/.`,
        url: this.manifest.url,
      })
      await assertDirectoryIdentity(work)
      await assertDirectoryIdentity(directory)
      const stagedName = captureDownloadedFile(downloaded, work, this.manifest)
      const stagedPath = path.join(work.visiblePath, stagedName)
      await verifyInferenceAuxiliaryFile(
        {
          byteSize: this.manifest.sizeBytes,
          managedPath: stagedPath,
          sha256: this.manifest.sha256,
        },
        auxiliaryArtifactMaximumBytes(this.manifest.role),
      )
      assertNotCanceled(signal)
      const publishName = 'publication.ready'
      await copyExactOwnedFile(work, stagedName, publishName, this.manifest, signal)
      await verifyInferenceAuxiliaryFile(
        {
          byteSize: this.manifest.sizeBytes,
          managedPath: path.join(work.visiblePath, publishName),
          sha256: this.manifest.sha256,
        },
        auxiliaryArtifactMaximumBytes(this.manifest.role),
      )
      await assertDirectoryIdentity(work)
      await assertDirectoryIdentity(directory)
      const previous = await backupPreviousArtifact(directory, work, this.manifest.filename)
      const targetPath = path.join(directory.anchor, this.manifest.filename)
      await assertDirectoryIdentity(work)
      await assertDirectoryIdentity(directory)
      await assertDestinationIdentity(targetPath, previous)
      assertNotCanceled(signal)
      let renamed = false
      let publishedIdentity: BigIntStats | undefined
      try {
        await rename(path.join(work.anchor, publishName), targetPath)
        renamed = true
        publishedIdentity = await lstat(targetPath, { bigint: true })
        if (!publishedIdentity.isFile()) {
          throw failure('AUXILIARY_INVALID_STORAGE', 'The published auxiliary file changed.')
        }
        await directory.handle.sync()
        await verifyInferenceAuxiliaryFile(
          {
            byteSize: this.manifest.sizeBytes,
            managedPath: path.join(this.resourcesDirectory, this.manifest.filename),
            sha256: this.manifest.sha256,
          },
          auxiliaryArtifactMaximumBytes(this.manifest.role),
        )
        await assertDirectoryIdentity(directory)
      } catch (error) {
        if (renamed) {
          try {
            await rollbackPublication(directory, work, targetPath, publishedIdentity, previous)
          } catch {
            preserveWork = true
            throw failure(
              'AUXILIARY_RECOVERY_REQUIRED',
              'Auxiliary publication could not be safely rolled back; private backup was retained.',
            )
          }
        }
        throw error
      }
      return this.result(false)
    } finally {
      // Delete flat owned artifacts through the original directory descriptor. A pathname
      // replaced after the final identity check must never cause recursive foreign deletion.
      // Abandoned work from earlier processes is not guessed to be installed or reused here.
      if (directory && work && workName && !preserveWork) {
        const entries = await readdir(work.anchor).catch(() => [])
        for (const name of entries) {
          if (
            ['previous.backup', 'publication.ready', 'rollback.ready'].includes(name) ||
            /^[a-f0-9-]{36}\.part$/.test(name)
          ) {
            await unlink(path.join(work.anchor, name)).catch(() => undefined)
          }
        }
        const owned = await lstat(path.join(directory.anchor, workName), { bigint: true }).catch(
          () => null,
        )
        const opened = await work.handle.stat({ bigint: true }).catch(() => null)
        if (
          owned?.isDirectory() &&
          opened?.isDirectory() &&
          sameInode(owned, work.identity) &&
          sameInode(opened, work.identity)
        ) {
          // rmdir cannot delete entries in a substituted directory. A concurrent empty
          // replacement may still lose its empty name; no recursive data removal is used.
          await rmdir(path.join(directory.anchor, workName)).catch(() => undefined)
        }
      }
      await work?.handle.close().catch(() => undefined)
      await directory?.handle.close().catch(() => undefined)
      activeRoots.delete(this.resourcesDirectory)
    }
  }

  async preview(): Promise<AuxiliaryInstallationPreview> {
    const now = this.now()
    this.removeExpiredPlans(now)
    if (this.plans.size >= MAX_PENDING_PLANS) {
      throw failure('AUXILIARY_PLAN_LIMIT', 'Too many installation previews are pending.')
    }
    const directory = await openOwnedDirectory(this.resourcesDirectory)
    try {
      const installed = await this.isInstalled(directory)
      await assertDirectoryIdentity(directory)
      this.removeExpiredPlans(this.now())
      if (this.plans.size >= MAX_PENDING_PLANS) {
        throw failure('AUXILIARY_PLAN_LIMIT', 'Too many installation previews are pending.')
      }
      const expiresAt = this.now() + this.planTtlMs
      if (!Number.isSafeInteger(expiresAt)) {
        throw failure('AUXILIARY_INVALID_CLOCK', 'The installation preview expiry is invalid.')
      }
      const planId = randomUUID()
      this.plans.set(planId, {
        directoryDev: directory.identity.dev,
        directoryIno: directory.identity.ino,
        expiresAt,
        installed,
      })
      return Object.freeze({
        artifact: Object.freeze({
          filename: this.manifest.filename,
          role: this.manifest.role,
          sha256: this.manifest.sha256,
          sizeBytes: this.manifest.sizeBytes,
        }),
        expiresAt,
        installed,
        planId,
        requiredDownloadBytes: installed ? 0 : this.manifest.sizeBytes,
        scope: 'auxiliary-weights',
      })
    } finally {
      await directory.handle.close()
    }
  }

  private async isInstalled(directory: OwnedDirectory): Promise<boolean> {
    try {
      await verifyInferenceAuxiliaryFile(
        {
          byteSize: this.manifest.sizeBytes,
          managedPath: path.join(directory.visiblePath, this.manifest.filename),
          sha256: this.manifest.sha256,
        },
        auxiliaryArtifactMaximumBytes(this.manifest.role),
      )
      await assertDirectoryIdentity(directory)
      return true
    } catch (error) {
      await assertDirectoryIdentity(directory)
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'GENERATION_RESOURCE_CHANGED'
      ) {
        return false
      }
      throw error
    }
  }

  private now(): number {
    const value = this.clock()
    if (!Number.isSafeInteger(value) || value < 0) {
      throw failure('AUXILIARY_INVALID_CLOCK', 'The installation plan clock is invalid.')
    }
    return value
  }

  private removeExpiredPlans(now: number): void {
    for (const [id, plan] of this.plans) {
      if (plan.expiresAt <= now) {
        this.plans.delete(id)
      }
    }
  }

  private result(reused: boolean): AuxiliaryInstallationResult {
    return Object.freeze({
      byteSize: this.manifest.sizeBytes,
      managedPath: path.join(this.resourcesDirectory, this.manifest.filename),
      reused,
      role: this.manifest.role,
      sha256: this.manifest.sha256,
    })
  }
}

/** Production factory: callers cannot change URL, size, hash, role or installed filename. */
export function createLamaAuxiliaryInstaller(
  resourcesDirectory: string,
  downloader: Pick<ModelDownloader, 'download'> = new ModelDownloader(),
): AuxiliaryArtifactInstaller {
  return new AuxiliaryArtifactInstaller({
    downloader,
    manifest: { ...LAMA_OUTPAINT_ARTIFACT, source: 'invoke-lama' },
    resourcesDirectory,
  })
}

/**
 * Each artifact keeps the existing private preview/stage/verified-publication operation. Completed
 * valid files may remain after cancellation; the inference resolver admits only the complete exact
 * pair. No renderer manifest, inference-time download or group-ready marker exists.
 */
export async function createRegionalReferenceAuxiliaryInstallers(
  resourcesDirectory: string,
  downloader: Pick<ModelDownloader, 'download'> = new ModelDownloader(),
): Promise<
  Readonly<{
    adapter: AuxiliaryArtifactInstaller
    visionConfig: AuxiliaryArtifactInstaller
    visionModel: AuxiliaryArtifactInstaller
  }>
> {
  const visionDirectory = await createRegionalReferenceVisionResourceRoot(resourcesDirectory)
  return Object.freeze({
    adapter: new AuxiliaryArtifactInstaller({
      downloader,
      manifest: REGIONAL_REFERENCE_ADAPTER_ARTIFACT,
      resourcesDirectory,
    }),
    visionConfig: new AuxiliaryArtifactInstaller({
      downloader,
      manifest: REGIONAL_REFERENCE_VISION_CONFIG_ARTIFACT,
      resourcesDirectory: visionDirectory,
    }),
    visionModel: new AuxiliaryArtifactInstaller({
      downloader,
      manifest: REGIONAL_REFERENCE_VISION_MODEL_ARTIFACT,
      resourcesDirectory: visionDirectory,
    }),
  })
}

function isAuxiliaryRole(value: unknown): value is InferenceAuxiliaryResourceRole {
  return (
    value === 'outpaint-infill' ||
    REGIONAL_REFERENCE_ARTIFACTS.some((artifact) => artifact.role === value)
  )
}

function captureManifest(input: AuxiliaryArtifactManifest): AuxiliaryArtifactManifest {
  if (
    !/^[a-z0-9][a-z0-9.-]*$/.test(input.filename) ||
    !isAuxiliaryRole(input.role) ||
    !/^[a-f0-9]{64}$/.test(input.sha256) ||
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > auxiliaryArtifactMaximumBytes(input.role) ||
    !['anima-huggingface', 'civitai', 'invoke-lama', 'invoke-regional-reference'].includes(
      input.source,
    ) ||
    typeof input.url !== 'string'
  ) {
    throw failure('AUXILIARY_INVALID_MANIFEST', 'The trusted auxiliary manifest is invalid.')
  }
  return Object.freeze({
    filename: input.filename,
    role: input.role,
    sha256: input.sha256,
    sizeBytes: input.sizeBytes,
    source: input.source,
    url: input.url,
  })
}

async function openOwnedDirectory(visiblePath: string): Promise<OwnedDirectory> {
  assertCanonicalPath(visiblePath)
  const atPath = await lstat(visiblePath, { bigint: true })
  if (
    !atPath.isDirectory() ||
    (atPath.mode & 0o022n) !== 0n ||
    (await realpath(visiblePath)) !== visiblePath
  ) {
    throw failure('AUXILIARY_INVALID_STORAGE', 'Auxiliary storage is not a private real directory.')
  }
  const handle = await open(
    visiblePath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const identity = await handle.stat({ bigint: true })
    if (!identity.isDirectory() || !sameInode(atPath, identity)) {
      throw failure('AUXILIARY_INVALID_STORAGE', 'Auxiliary storage changed during opening.')
    }
    const directory = {
      anchor: `/proc/self/fd/${handle.fd}`,
      handle,
      identity,
      visiblePath,
    }
    await assertDirectoryIdentity(directory)
    return directory
  } catch (error) {
    await handle.close()
    throw error
  }
}

async function assertDirectoryIdentity(directory: OwnedDirectory): Promise<void> {
  const current = await lstat(directory.visiblePath, { bigint: true }).catch(() => null)
  if (
    !current?.isDirectory() ||
    !sameInode(current, directory.identity) ||
    (current.mode & 0o022n) !== 0n ||
    (await realpath(directory.visiblePath).catch(() => null)) !== directory.visiblePath
  ) {
    throw failure('AUXILIARY_INVALID_STORAGE', 'The auxiliary storage directory changed.')
  }
}

async function assertReplaceableDestination(directory: OwnedDirectory, filename: string) {
  const target = await lstat(path.join(directory.anchor, filename), { bigint: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return null
      }
      throw error
    },
  )
  if (target && !target.isFile()) {
    throw failure('AUXILIARY_INVALID_STORAGE', 'The auxiliary destination is not a regular file.')
  }
  return target
}

/** Keep the previous flat regular artifact until final publication verification succeeds. */
async function backupPreviousArtifact(
  directory: OwnedDirectory,
  work: OwnedDirectory,
  filename: string,
): Promise<BigIntStats | null> {
  const previous = await assertReplaceableDestination(directory, filename)
  if (!previous) {
    return null
  }
  const targetPath = path.join(directory.anchor, filename)
  const backupPath = path.join(work.anchor, 'previous.backup')
  await link(targetPath, backupPath)
  const backup = await lstat(backupPath, { bigint: true })
  if (!backup.isFile() || !sameInode(previous, backup)) {
    throw failure('AUXILIARY_INVALID_STORAGE', 'The previous auxiliary artifact changed.')
  }
  await assertDestinationIdentity(targetPath, previous)
  const handle = await open(
    backupPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const opened = await handle.stat({ bigint: true })
    if (!opened.isFile() || !sameInode(previous, opened)) {
      throw failure('AUXILIARY_INVALID_STORAGE', 'The previous auxiliary backup changed.')
    }
    await handle.sync()
  } finally {
    await handle.close()
  }
  await work.handle.sync()
  return previous
}

async function assertDestinationIdentity(targetPath: string, expected: BigIntStats | null) {
  const actual = await lstat(targetPath, { bigint: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  })
  if (expected ? !actual?.isFile() || !sameInode(actual, expected) : actual !== null) {
    throw failure(
      'AUXILIARY_INVALID_STORAGE',
      'The auxiliary destination changed before publication.',
    )
  }
}

/** A failed post-rename operation may only undo the exact inode this operation published. */
async function rollbackPublication(
  directory: OwnedDirectory,
  work: OwnedDirectory,
  targetPath: string,
  publishedIdentity: BigIntStats | undefined,
  previous: BigIntStats | null,
): Promise<void> {
  if (!publishedIdentity) {
    throw failure('AUXILIARY_RECOVERY_REQUIRED', 'The published inode is unknown.')
  }
  await assertDestinationIdentity(targetPath, publishedIdentity)
  if (previous) {
    const backupPath = path.join(work.anchor, 'previous.backup')
    const backup = await lstat(backupPath, { bigint: true })
    if (!backup.isFile() || !sameInode(backup, previous)) {
      throw failure('AUXILIARY_RECOVERY_REQUIRED', 'The previous auxiliary backup changed.')
    }
    // Retain the original backup if restoring or synchronizing the destination fails.
    const restorePath = path.join(work.anchor, 'rollback.ready')
    await link(backupPath, restorePath)
    await assertDestinationIdentity(targetPath, publishedIdentity)
    await rename(restorePath, targetPath)
    await directory.handle.sync()
    await assertDestinationIdentity(targetPath, previous)
  } else {
    await assertDestinationIdentity(targetPath, publishedIdentity)
    await unlink(targetPath)
    await directory.handle.sync()
  }
}

function captureDownloadedFile(
  input: VerifiedStagedModelFile,
  work: OwnedDirectory,
  manifest: AuxiliaryArtifactManifest,
): string {
  const name = path.basename(input.stagingPath)
  if (
    path.dirname(input.stagingPath) !== work.anchor ||
    !/^[a-f0-9-]{36}\.part$/.test(name) ||
    input.sizeBytes !== manifest.sizeBytes ||
    input.sha256 !== manifest.sha256
  ) {
    throw failure('AUXILIARY_INVALID_DOWNLOAD', 'The download did not return the owned exact file.')
  }
  return name
}

async function copyExactOwnedFile(
  work: OwnedDirectory,
  sourceName: string,
  publishName: string,
  manifest: AuxiliaryArtifactManifest,
  signal?: AbortSignal,
): Promise<void> {
  const sourcePath = path.join(work.anchor, sourceName)
  const source = await open(
    sourcePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  let target: FileHandle | undefined
  try {
    const before = await source.stat({ bigint: true })
    if (!before.isFile() || before.size !== BigInt(manifest.sizeBytes)) {
      throw failure('AUXILIARY_INVALID_DOWNLOAD', 'The staged auxiliary file changed.')
    }
    target = await open(path.join(work.anchor, publishName), 'wx', 0o600)
    const digest = createHash('sha256')
    const buffer = Buffer.allocUnsafe(Math.min(manifest.sizeBytes + 1, 1024 * 1024))
    let size = 0
    while (true) {
      assertNotCanceled(signal)
      const { bytesRead } = await source.read(
        buffer,
        0,
        Math.min(buffer.length, manifest.sizeBytes - size + 1),
        null,
      )
      if (bytesRead === 0) {
        break
      }
      size += bytesRead
      if (size > manifest.sizeBytes) {
        throw failure('AUXILIARY_INVALID_DOWNLOAD', 'The staged auxiliary file grew.')
      }
      digest.update(buffer.subarray(0, bytesRead))
      let offset = 0
      while (offset < bytesRead) {
        const written = await target.write(buffer, offset, bytesRead - offset)
        if (written.bytesWritten < 1) {
          throw failure('AUXILIARY_STORAGE_ERROR', 'The auxiliary publication copy failed.')
        }
        offset += written.bytesWritten
      }
    }
    const after = await source.stat({ bigint: true })
    const atPath = await lstat(sourcePath, { bigint: true })
    if (
      size !== manifest.sizeBytes ||
      digest.digest('hex') !== manifest.sha256 ||
      !sameStableFile(before, after) ||
      !sameStableFile(before, atPath)
    ) {
      throw failure('AUXILIARY_INVALID_DOWNLOAD', 'The exact auxiliary file changed while copying.')
    }
    assertNotCanceled(signal)
    await target.sync()
  } finally {
    await target?.close()
    await source.close()
  }
}

function assertCanonicalPath(value: string): void {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) {
    throw failure('AUXILIARY_INVALID_STORAGE', 'Auxiliary storage must be canonical and absolute.')
  }
}

function sameInode(first: BigIntStats, second: BigIntStats): boolean {
  return first.dev === second.dev && first.ino === second.ino
}

function sameStableFile(first: BigIntStats, second: BigIntStats): boolean {
  return (
    sameInode(first, second) &&
    first.size === second.size &&
    first.mtimeNs === second.mtimeNs &&
    first.ctimeNs === second.ctimeNs
  )
}

function assertNotCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw failure('DOWNLOAD_CANCELED', 'The auxiliary installation was canceled.')
  }
}

function failure(code: string, message: string): AuxiliaryInstallationError {
  return new AuxiliaryInstallationError(code, message)
}
