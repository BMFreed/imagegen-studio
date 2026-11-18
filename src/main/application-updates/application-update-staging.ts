/**
 * InvokeAI 4875d96531ca6712b288f6e660fcbb34143408c1: model_install/install_staging_ledger.py
 * claim/_write_marker/begin_transfer and its model_install_default.py
 * _install_path_with_info_claimed -> _restore_moved_path callers; invokeai/app/util/no_replace.py.
 * Adapt sibling staging, exclusive claims and durable metadata; preserve both original files.
 * Studio donors: runtime-installation.ts withDirectory/atomicReplace and
 * offline-runtime-assembly.ts copyVerifiedFile. Runtime metadata helpers remain unchanged.
 *
 * Invoke/launcher provide no AppImage header admission. The disclosed narrow adapter below uses
 * https://github.com/AppImage/AppImageSpec/blob/master/draft.md#type-2-image-format and
 * https://raw.githubusercontent.com/torvalds/linux/master/include/uapi/linux/elf.h plus elf-em.h.
 * Header classification does not qualify ELF loading, the filesystem, internal app version,
 * migrations or execution. Private filesystem activation follows the existing runtime journal
 * phases after caller-confirmed resource close; it does not prove physical Main exit, application
 * restart or execution. The disclosed Electron44.4.5 adapter supplies the native relaunch call;
 * this owner records its intent and guards the exact activated snapshot immediately before it. A
 * successful handshake is not execution/startup acknowledgement. Startup inspection only
 * reauthenticates the fixed target on disk; no crash adoption or independent helper is introduced.
 */
import { createHash, randomUUID } from 'node:crypto'
import * as nodeFs from 'node:fs'
import {
  type BigIntStats,
  closeSync,
  constants,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs'
import * as fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

import type { VerifiedApplicationArtifact } from './electron-update-checker.js'

import { canonicalRuntimeReleaseJson } from '../runtime/runtime-release.js'
import {
  type ApplicationReleaseAuthority,
  type ApplicationReleaseManifest,
  type ApplicationReleaseRuntimeFiles,
  type ApplicationReleaseTrust,
  copyApplicationReleaseAuthority,
  verifyApplicationReleaseAuthority,
} from './application-release.js'

const DIRECTORY_FLAGS =
  constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const CREATE_FLAGS =
  constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW
const CHUNK_BYTES = 1024 * 1024
const MAX_METADATA_BYTES = 1024 * 1024
const JOURNAL = 'journal.json'
const ENVELOPE = 'release-envelope.json'
const RELEASE_NOTES = 'release-notes.json'
const FAILED = 'failed.json'
const CANDIDATE = 'candidate.AppImage'
const BACKUP = 'previous.AppImage'
const ROLLBACK = 'rollback.AppImage'

export interface StagedApplicationUpdate {
  readonly candidatePath: string
  readonly manifest: ApplicationReleaseManifest
  prepareBackup: () => Promise<BackedUpApplicationUpdate>
  readonly stagingDirectory: string
  verifyCompleteSnapshot: () => Promise<void>
}

export interface BackedUpApplicationUpdate {
  activate: (assertApplicationClosed: () => void) => Promise<ActivatedApplicationUpdate>
  readonly backupPath: string
  readonly candidatePath: string
  readonly manifest: ApplicationReleaseManifest
  readonly stagingDirectory: string
  verifyCompleteSnapshot: () => Promise<void>
}

export interface ActivatedApplicationUpdate {
  readonly backupPath: string
  readonly currentAppImage: string
  handoffRelaunch: (schedule: (currentAppImage: string) => unknown) => Promise<void>
  readonly manifest: ApplicationReleaseManifest
  rollback: () => Promise<RolledBackApplicationUpdate>
  readonly stagingDirectory: string
  verifyCompleteSnapshot: () => Promise<void>
}

export interface RolledBackApplicationUpdate {
  readonly backupPath: string
  readonly currentAppImage: string
  readonly manifest: ApplicationReleaseManifest
  readonly stagingDirectory: string
  verifyCompleteSnapshot: () => Promise<void>
}

export type ApplicationUpdateStartupInspection =
  | {
      runtimeAuthentication: 'unverified' | 'verified-publisher-declaration'
      status: 'retained'
      targetAuthentication: 'unverified' | 'verified'
    }
  | { status: 'none' }
  | { status: 'not-checked' }
export type ApplicationUpdateCurrentImageSnapshot = FileSnapshot
export type ApplicationUpdateCurrentSource = Readonly<{
  assertCurrentSnapshot: () => void
  currentAppImage: string
  currentImage: FileSnapshot
  dispose: () => void
  runtimeFiles: Readonly<ApplicationReleaseRuntimeFiles>
  verifyCompleteSnapshot: () => Promise<void>
}>
export type ApplicationUpdateCurrentSourceCapture = Readonly<{
  complete: () => Promise<ApplicationUpdateCurrentSource>
  dispose: () => void
}>
type Phase =
  | 'activated'
  | 'activating'
  | 'backed-up'
  | 'backing-up'
  | 'failed'
  | 'prepared'
  | 'relaunching'
  | 'rolled-back'
  | 'rolling-back'
type PhaseSnapshot = Readonly<{
  backup: FileSnapshot | null
  candidate: FileSnapshot | null
  current: FileSnapshot
  journal: FileSnapshot
  journalBytes: Buffer
  phase: Exclude<Phase, 'failed'>
  rollback: FileSnapshot | null
}>
type FailureCode = 'BUSY' | 'FAILED' | 'INVALID' | 'RECOVERY_REQUIRED' | 'UNSAFE'
type DirectoryIdentity = Readonly<{ dev: string; ino: string }>

type FileIdentity = Readonly<{
  ctimeNs: string
  dev: string
  gid: string
  ino: string
  mode: string
  mtimeNs: string
  nlink: string
  sizeBytes: number
  uid: string
}>

type FileSnapshot = Readonly<{ identity: FileIdentity; sha512: string; sizeBytes: number }>

type CurrentSourceFs = Pick<
  typeof nodeFs,
  'closeSync' | 'fstatSync' | 'lstatSync' | 'openSync' | 'read' | 'realpathSync'
>
type CurrentSourceParent = Readonly<{
  fd: number
  gid: string
  identity: DirectoryIdentity
  mode: string
  path: string
  uid: string
}>
type CurrentSourceFile = Readonly<{
  borrowedFd?: number
  fd: number
  identity: FileIdentity
  parent: CurrentSourceParent
  path: string
}>

type Reader = { handle: fs.FileHandle; identity: FileIdentity; path: string; visible: string }

type OwnedDirectory = {
  anchor: string
  check: () => Promise<void>
  handle: fs.FileHandle
  identity: DirectoryIdentity
}

/** Fixed diagnostics; filesystem paths and release data remain Main-private. */
export class AppUpdateStagingError extends Error {
  constructor(readonly code: FailureCode) {
    const messages = {
      BUSY: 'An application update staging directory already exists. Keep it for explicit recovery.',
      FAILED:
        'The application update could not be staged. The current application was not changed.',
      INVALID: 'The verified application update or AppImage header is invalid.',
      RECOVERY_REQUIRED:
        'Application update staging needs explicit recovery. The current application was not replaced.',
      UNSAFE: 'The application update filesystem identity or permissions changed.',
    }
    super(messages[code])
    this.name = 'AppUpdateStagingError'
  }
}

export class AppUpdateRecoveryPublishError extends Error {
  constructor(
    readonly code:
      | 'APPLICATION_UPDATE_RECOVERY_DESTINATION_EXISTS'
      | 'APPLICATION_UPDATE_RECOVERY_PUBLICATION_UNCERTAIN'
      | 'APPLICATION_UPDATE_RECOVERY_UNSAFE',
  ) {
    const messages = {
      APPLICATION_UPDATE_RECOVERY_DESTINATION_EXISTS:
        'The recovery destination already exists. Choose a new AppImage path.',
      APPLICATION_UPDATE_RECOVERY_PUBLICATION_UNCERTAIN:
        'AppImage recovery publication could not be confirmed. Preserve all recovery files.',
      APPLICATION_UPDATE_RECOVERY_UNSAFE:
        'A verified AppImage could not be published at the chosen recovery path.',
    }
    super(messages[code])
    this.name = 'AppUpdateRecoveryPublishError'
  }
}

/** Outcome describes this operation's publication attempt, not other writers or app readiness. */
export class AppUpdateTransitionError extends Error {
  constructor(
    readonly code: 'BUSY' | 'CLOSE_REQUIRED' | 'INVALID_PHASE' | 'RECOVERY_REQUIRED',
    readonly outcome: 'uncertain' | 'unchanged',
  ) {
    super(
      code === 'CLOSE_REQUIRED'
        ? 'Close application resources before activating the verified update.'
        : code === 'INVALID_PHASE' || code === 'BUSY'
          ? 'This application update capability is no longer available for that operation.'
          : outcome === 'uncertain'
            ? 'Application update publication is uncertain. Preserve all files for explicit recovery.'
            : 'Application update preparation failed before publication. Preserve all staging files for explicit recovery.',
    )
    this.name = 'AppUpdateTransitionError'
  }
}

/** Neither outcome says the previous application was restored or a new application started. */
export class AppUpdateRelaunchError extends Error {
  readonly code = 'APPLICATION_UPDATE_RELAUNCH_FAILED'

  constructor(readonly outcome: 'not-attempted' | 'uncertain') {
    super(
      outcome === 'uncertain'
        ? 'Application relaunch handoff is uncertain. Preserve all update files and do not retry automatically.'
        : 'Application relaunch was not attempted. Preserve the update and backup for explicit recovery.',
    )
    this.name = 'AppUpdateRelaunchError'
  }
}

/** Fixed diagnostic: observation is consistency only, never executing-body authentication. */
export class AppUpdateCurrentSourceError extends Error {
  readonly code = 'APPLICATION_UPDATE_CURRENT_SOURCE_CHANGED'

  constructor() {
    super(
      'The application update source could not be verified. Restart the application before installing an update.',
    )
    this.name = 'AppUpdateCurrentSourceError'
  }
}

/**
 * Invoke4875 rasterSnapshotCapture.ts captureDocumentSnapshot/captureRasterSnapshot and callers
 * engine.ts -> generationComposite.ts -> prepareCanvasInvocation.ts -> invocationSubmit.ts: hold
 * immutable source identity, recheck across every async read, and guard the final consumer. Backend
 * analogy: InstallStaging.protect_source -> probe -> before_transfer/begin_transfer. Invoke has no
 * Electron cached-ASAR/proc descriptor adapter; this disclosed Linux boundary duplicates only known
 * borrowed descriptors. It never reopens an archive pathname or establishes loaded V8 identity,
 * runtime/AppImage signature equivalence, global ownership or retirement.
 */
export function captureApplicationUpdateCurrentSource(input: {
  archiveFd: number
  archivePath: string
  currentAppImage: string
  executableFd: number
  executablePath: string
}): ApplicationUpdateCurrentSourceCapture {
  let physical: CurrentSourceFs | undefined
  const owned = new Set<number>()
  let disposed = false
  let failed = false
  let active = 0
  let completed: Promise<ApplicationUpdateCurrentSource> | null = null
  const closeOwned = () => {
    for (const fd of owned) {
      owned.delete(fd)
      try {
        physical!.closeSync(fd)
      } catch {
        /* No borrowed descriptor is ever disposed. */
      }
    }
  }
  const dispose = () => {
    disposed = true
    if (!active) {
      closeOwned()
    }
  }
  try {
    need(process.platform === 'linux' && process.arch === 'x64', 'UNSAFE')
    // Electron's normal fs facade virtualizes app.asar metadata and caches realpath. Select the
    // physical facade explicitly, without a fallback in Electron, and bind its methods once.
    const raw: typeof nodeFs = process.versions.electron
      ? (createRequire(process.execPath)('original-fs') as typeof nodeFs)
      : nodeFs
    physical = Object.freeze({
      closeSync: raw.closeSync.bind(raw),
      fstatSync: raw.fstatSync.bind(raw),
      lstatSync: raw.lstatSync.bind(raw),
      openSync: raw.openSync.bind(raw),
      read: raw.read.bind(raw),
      realpathSync: raw.realpathSync.bind(raw),
    })
    const physicalFs = physical
    const { archiveFd, archivePath, currentAppImage, executableFd, executablePath } = input
    for (const borrowedFd of [archiveFd, executableFd]) {
      need(
        Number.isSafeInteger(borrowedFd) && borrowedFd >= 0 && borrowedFd <= 0x7f_ff_ff_ff,
        'UNSAFE',
      )
    }
    const hold = (visible: string, borrowedFd?: number): CurrentSourceFile => {
      need(canonicalPath(visible), 'UNSAFE')
      if (borrowedFd !== undefined) {
        need(
          Number.isSafeInteger(borrowedFd) && borrowedFd >= 0 && borrowedFd <= 0x7f_ff_ff_ff,
          'UNSAFE',
        )
      }
      const parentPath = path.dirname(visible)
      need(physicalFs.realpathSync(parentPath) === parentPath, 'UNSAFE')
      const parentFd = physicalFs.openSync(parentPath, DIRECTORY_FLAGS)
      owned.add(parentFd)
      const directory = physicalFs.fstatSync(parentFd, { bigint: true })
      need(directory.isDirectory(), 'UNSAFE')
      const parent: CurrentSourceParent = Object.freeze({
        fd: parentFd,
        gid: String(directory.gid),
        identity: Object.freeze({ dev: String(directory.dev), ino: String(directory.ino) }),
        mode: String(directory.mode),
        path: parentPath,
        uid: String(directory.uid),
      })
      // Following this one known proc magic link duplicates the physical regular file. It does
      // not use the archive pathname, and all borrowed/own/path identities are compared below.
      const fd =
        borrowedFd === undefined
          ? physicalFs.openSync(
              path.join(`/proc/self/fd/${parentFd}`, path.basename(visible)),
              FILE_FLAGS,
            )
          : physicalFs.openSync(
              `/proc/self/fd/${borrowedFd}`,
              constants.O_RDONLY | constants.O_NONBLOCK,
            )
      owned.add(fd)
      const info = physicalFs.fstatSync(fd, { bigint: true })
      need(
        info.isFile() &&
          info.nlink === 1n &&
          info.size > 0n &&
          info.size <= BigInt(Number.MAX_SAFE_INTEGER) &&
          (info.uid === 0n || info.uid === BigInt(process.geteuid!())) &&
          (info.mode & (borrowedFd === undefined ? 0o22n : 0o2n)) === 0n,
        'UNSAFE',
      )
      if (borrowedFd === undefined) {
        need(info.uid === BigInt(process.geteuid!()) && (info.mode & 0o7777n) === 0o755n, 'UNSAFE')
      }
      return Object.freeze({ borrowedFd, fd, identity: fileIdentity(info), parent, path: visible })
    }
    const image = hold(currentAppImage)
    const archive = hold(archivePath, archiveFd)
    const executable = hold(executablePath, executableFd)
    const files = [image, archive, executable] as const
    const assertAll = () => {
      try {
        need(!disposed && !failed, 'UNSAFE')
        for (const file of files) {
          const { parent } = file
          for (const info of [
            physicalFs.fstatSync(parent.fd, { bigint: true }),
            physicalFs.lstatSync(parent.path, { bigint: true }),
          ]) {
            need(
              info.isDirectory() &&
                !info.isSymbolicLink() &&
                (info.uid === 0n || info.uid === BigInt(process.geteuid!())) &&
                // Packaged runtime sources may expose 0664/0775 even on readonly SquashFS.
                // They are frozen observations, not mutable publication roots or trust evidence.
                // The current AppImage's own mutable parent retains the stricter admission.
                (info.mode & (file.borrowedFd === undefined ? 0o22n : 0o2n)) === 0n &&
                String(info.dev) === parent.identity.dev &&
                String(info.ino) === parent.identity.ino &&
                String(info.mode) === parent.mode &&
                String(info.gid) === parent.gid &&
                String(info.uid) === parent.uid,
              'UNSAFE',
            )
          }
          need(physicalFs.realpathSync(parent.path) === parent.path, 'UNSAFE')
          const observed = [
            physicalFs.fstatSync(file.fd, { bigint: true }),
            physicalFs.lstatSync(file.path, { bigint: true }),
            physicalFs.lstatSync(
              path.join(`/proc/self/fd/${parent.fd}`, path.basename(file.path)),
              { bigint: true },
            ),
          ]
          if (file.borrowedFd !== undefined) {
            observed.push(physicalFs.fstatSync(file.borrowedFd, { bigint: true }))
          }
          for (const info of observed) {
            need(
              info.isFile() &&
                !info.isSymbolicLink() &&
                sameIdentity(fileIdentity(info), file.identity),
              'UNSAFE',
            )
          }
          need(physicalFs.realpathSync(file.path) === file.path, 'UNSAFE')
          need(physicalFs.realpathSync(`/proc/self/fd/${file.fd}`) === file.path, 'UNSAFE')
          if (file.borrowedFd !== undefined) {
            need(
              physicalFs.realpathSync(`/proc/self/fd/${file.borrowedFd}`) === file.path,
              'UNSAFE',
            )
          }
        }
      } catch {
        failed = true
        throw new AppUpdateCurrentSourceError()
      }
    }
    assertAll()
    const hashFile = async (file: CurrentSourceFile): Promise<FileSnapshot> => {
      const hash = createHash('sha512')
      const chunk = Buffer.allocUnsafe(CHUNK_BYTES)
      let count = 0
      for (;;) {
        assertAll()
        const bytesRead = await new Promise<number>((resolve, reject) => {
          physicalFs.read(file.fd, chunk, 0, chunk.length, count, (error, length) => {
            if (error) {
              reject(error)
            } else {
              resolve(length)
            }
          })
        })
        assertAll()
        if (!bytesRead) {
          break
        }
        count += bytesRead
        need(count <= file.identity.sizeBytes, 'UNSAFE')
        hash.update(chunk.subarray(0, bytesRead))
      }
      need(count === file.identity.sizeBytes, 'UNSAFE')
      return Object.freeze({
        identity: file.identity,
        sha512: hash.digest('base64'),
        sizeBytes: count,
      })
    }
    const inspect = async (): Promise<readonly [FileSnapshot, FileSnapshot, FileSnapshot]> => {
      active++
      try {
        assertAll()
        const snapshots = [
          await hashFile(image),
          await hashFile(archive),
          await hashFile(executable),
        ] as const
        assertAll()
        return snapshots
      } catch {
        failed = true
        throw new AppUpdateCurrentSourceError()
      } finally {
        active--
        if (disposed && !active) {
          closeOwned()
        }
      }
    }
    return Object.freeze({
      complete: () => {
        completed ??= inspect().then((initial) => {
          assertAll()
          return Object.freeze({
            assertCurrentSnapshot: assertAll,
            currentAppImage,
            currentImage: initial[0],
            dispose,
            runtimeFiles: Object.freeze({
              archive: Object.freeze({
                sha512: initial[1].sha512,
                sizeBytes: initial[1].sizeBytes,
              }),
              executable: Object.freeze({
                sha512: initial[2].sha512,
                sizeBytes: initial[2].sizeBytes,
              }),
            }),
            verifyCompleteSnapshot: async () => {
              const current = await inspect()
              try {
                need(
                  current.every((value, index) => value.sha512 === initial[index].sha512),
                  'UNSAFE',
                )
                assertAll()
              } catch {
                failed = true
                throw new AppUpdateCurrentSourceError()
              }
            },
          })
        })
        return completed
      },
      dispose,
    })
  } catch {
    failed = true
    dispose()
    throw new AppUpdateCurrentSourceError()
  }
}

/**
 * Main-private publication at a separately chosen pathname. Invoke4875
 * no_replace.py:publish_noreplace and install_staging_ledger.py:_publish_claim publish a completed,
 * synced sibling via an atomic no-replace operation. Invoke's direct-to-destination copy fallback
 * can expose partial bytes, so only the hardlink branch is used here. The private work directory
 * and final identity guards bound the cooperative owner, with no claim of exclusion of arbitrary
 * same-user writers.
 */
export async function publishVerifiedApplicationRecovery(input: {
  authority: ApplicationReleaseAuthority
  destinationAppImage: string
  originalAppImage: string
  sourceAppImage: string
  trust: ApplicationReleaseTrust
}): Promise<Readonly<{ destinationAppImage: string; manifest: ApplicationReleaseManifest }>> {
  let parent: OwnedDirectory | undefined
  let temporary: OwnedDirectory | undefined
  let source: Reader | undefined
  let candidate: Reader | undefined
  let publicationAttempted = false
  const assertAbsent = (filename: string, error: AppUpdateRecoveryPublishError) => {
    try {
      lstatSync(filename)
    } catch (missing) {
      if ((missing as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw missing
    }
    throw error
  }
  try {
    const { authority, destinationAppImage, originalAppImage, sourceAppImage, trust } = input
    need(process.platform === 'linux' && process.arch === 'x64', 'UNSAFE')
    need(
      [sourceAppImage, originalAppImage, destinationAppImage].every(
        (filename) => canonicalPath(filename) && path.extname(filename) === '.AppImage',
      ) &&
        destinationAppImage !== originalAppImage &&
        destinationAppImage !== sourceAppImage &&
        !destinationAppImage.startsWith(originalAppImage + path.sep) &&
        destinationAppImage
          .split(path.sep)
          .every(
            (part) =>
              !part.startsWith('.igs-app-update-') && !part.startsWith('.igs-app-recovery-'),
          ),
      'UNSAFE',
    )
    const manifest = verifyApplicationReleaseAuthority(authority, trust)
    const originalParent = path.dirname(originalAppImage)
    const assertOriginalPath = () => {
      need(realpathSync(originalParent) === originalParent, 'UNSAFE')
      try {
        const original = lstatSync(originalAppImage)
        need(original.isFile() && realpathSync(originalAppImage) === originalAppImage, 'UNSAFE')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
      }
    }
    assertOriginalPath()
    const parentPath = path.dirname(destinationAppImage)
    const ownedParent = await openDirectory(parentPath, undefined, false)
    parent = ownedParent
    const destinationName = path.basename(destinationAppImage)
    const destination = path.join(ownedParent.anchor, destinationName)
    const stageName = `.igs-app-update-${createHash('sha256').update(destinationName).digest('hex').slice(0, 16)}`
    const occupied = new AppUpdateRecoveryPublishError(
      'APPLICATION_UPDATE_RECOVERY_DESTINATION_EXISTS',
    )
    const stageOrLock = new AppUpdateRecoveryPublishError('APPLICATION_UPDATE_RECOVERY_UNSAFE')
    const assertUnusedNamespace = () => {
      assertAbsent(path.join(ownedParent.anchor, stageName), stageOrLock)
      assertAbsent(path.join(ownedParent.anchor, `${stageName}.lock`), stageOrLock)
    }
    const assertAvailable = () => {
      assertAbsent(destination, occupied)
      assertUnusedNamespace()
    }
    assertAvailable()
    source = await openReader(sourceAppImage, sourceAppImage)
    need(source.identity.sizeBytes === manifest.artifact.sizeBytes, 'UNSAFE')
    await classifyAppImage(source)
    await requireCopySpace(ownedParent, manifest.artifact.sizeBytes)
    const temporaryName = `.igs-app-recovery-${randomUUID()}`
    const temporaryPath = path.join(parentPath, temporaryName)
    const anchoredTemporary = path.join(ownedParent.anchor, temporaryName)
    assertDirectoryNow(ownedParent, parentPath, false)
    mkdirSync(anchoredTemporary, { mode: 0o700 })
    const created = lstatSync(anchoredTemporary, { bigint: true })
    need(created.isDirectory() && String(created.dev) === ownedParent.identity.dev, 'UNSAFE')
    const ownedTemporary = await openDirectory(
      temporaryPath,
      { dev: String(created.dev), ino: String(created.ino) },
      true,
    )
    temporary = ownedTemporary
    await ownedParent.check()
    await ownedParent.handle.sync()
    const candidatePath = path.join(temporaryPath, CANDIDATE)
    const anchoredCandidate = path.join(ownedTemporary.anchor, CANDIDATE)
    const copied = await copyImage(source, anchoredCandidate, manifest.artifact)
    candidate = await openReader(candidatePath, anchoredCandidate, 0o600)
    const executable = await makeExecutable(candidate, copied)
    await ownedTemporary.handle.sync()

    const assertDirectories = () => {
      assertDirectoryNow(ownedParent, parentPath, false)
      assertDirectoryNow(ownedTemporary, temporaryPath, true)
      const anchored = lstatSync(anchoredTemporary, { bigint: true })
      need(
        anchored.isDirectory() &&
          String(anchored.dev) === ownedTemporary.identity.dev &&
          String(anchored.ino) === ownedTemporary.identity.ino,
        'UNSAFE',
      )
    }
    assertDirectories()
    assertFileNow(sourceAppImage, sourceAppImage, source.identity)
    assertFileNow(candidatePath, anchoredCandidate, executable.identity)
    assertAvailable()
    assertOriginalPath()
    publicationAttempted = true
    try {
      linkSync(anchoredCandidate, destination)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EEXIST') {
        publicationAttempted = false
        throw occupied
      }
      if (code && ['EMLINK', 'ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'EXDEV'].includes(code)) {
        publicationAttempted = false
      }
      throw error
    }
    const linked = fileIdentity(fstatSync(candidate.handle.fd, { bigint: true }))
    need(
      sameIdentity({ ...executable.identity, ctimeNs: linked.ctimeNs, nlink: '2' }, linked),
      'UNSAFE',
    )
    assertFileNow(destinationAppImage, destination, linked)
    // Persist the final link before dropping the private name. A pause or failure
    // after publication never authorizes deleting the destination.
    await ownedParent.handle.sync()
    assertDirectories()
    assertFileNow(destinationAppImage, destination, linked)
    assertFileNow(candidatePath, anchoredCandidate, linked)
    unlinkSync(anchoredCandidate)
    const published = fileIdentity(fstatSync(candidate.handle.fd, { bigint: true }))
    need(sameIdentity({ ...linked, ctimeNs: published.ctimeNs, nlink: '1' }, published), 'UNSAFE')
    await ownedTemporary.handle.sync()
    assertDirectories()
    rmdirSync(anchoredTemporary)
    await ownedParent.handle.sync()
    candidate.identity = published
    candidate.path = destination
    candidate.visible = destinationAppImage
    await inspectReaderImage(candidate, { ...executable, identity: published })
    assertDirectoryNow(ownedParent, parentPath, false)
    assertFileNow(destinationAppImage, destination, published)
    assertUnusedNamespace()
    return Object.freeze({ destinationAppImage, manifest })
  } catch (error) {
    throw publicationAttempted
      ? new AppUpdateRecoveryPublishError('APPLICATION_UPDATE_RECOVERY_PUBLICATION_UNCERTAIN')
      : error instanceof AppUpdateRecoveryPublishError
        ? error
        : new AppUpdateRecoveryPublishError('APPLICATION_UPDATE_RECOVERY_UNSAFE')
  } finally {
    await closeReadHandle(candidate?.handle)
    await closeReadHandle(source?.handle)
    await closeReadHandle(temporary?.handle)
    await closeReadHandle(parent?.handle)
  }
}

/** Main-private stage capability. No caller-provided destination, installer or cleanup authority. */
export async function stageVerifiedApplicationArtifact(input: {
  artifact: VerifiedApplicationArtifact
  currentAppImage: string
  currentSource: ApplicationUpdateCurrentSource
}): Promise<StagedApplicationUpdate> {
  need(input && typeof input === 'object', 'INVALID')
  const { artifact, currentAppImage, currentSource } = input
  need(process.platform === 'linux' && process.arch === 'x64', 'INVALID')
  need(canonicalPath(currentAppImage) && artifact && canonicalPath(artifact.path), 'INVALID')
  need(typeof artifact.verifyCompleteSnapshot === 'function', 'INVALID')
  need(currentSource && currentSource.currentAppImage === currentAppImage, 'INVALID')
  need(
    typeof currentSource.verifyCompleteSnapshot === 'function' &&
      typeof currentSource.assertCurrentSnapshot === 'function',
    'INVALID',
  )
  const currentSourceSnapshot = freezeJson(
    JSON.parse(
      canonicalRuntimeReleaseJson(currentSource.currentImage).toString('utf8'),
    ) as FileSnapshot,
  )
  const verifyCurrentSource = currentSource.verifyCompleteSnapshot.bind(currentSource)
  const assertCurrentSource = currentSource.assertCurrentSnapshot.bind(currentSource)
  let sourceConsumed = false
  const assertSource = async () => {
    need(!sourceConsumed && currentSource.currentAppImage === currentAppImage, 'UNSAFE')
    await verifyCurrentSource()
    need(
      canonicalRuntimeReleaseJson(currentSource.currentImage).equals(
        canonicalRuntimeReleaseJson(currentSourceSnapshot),
      ),
      'UNSAFE',
    )
    assertCurrentSource()
  }
  const sourcePath = artifact.path
  let manifest: ApplicationReleaseManifest
  let manifestBytes: Buffer
  try {
    manifestBytes = canonicalRuntimeReleaseJson(artifact.manifest)
    manifest = freezeJson(JSON.parse(manifestBytes.toString('utf8')) as ApplicationReleaseManifest)
  } catch {
    throw new AppUpdateStagingError('INVALID')
  }
  const verifyArtifact = artifact.verifyCompleteSnapshot.bind(artifact)
  // A capability must still own its native signed selection on both sides of the primitive copy.
  // The caller's verifier owns signature admission; this owner never accepts a new trust source.
  let authority: ReturnType<typeof copyApplicationReleaseAuthority>
  try {
    await assertSource()
    await verifyArtifact()
    await assertSource()
    authority = copyApplicationReleaseAuthority(artifact.authority)
    await verifyArtifact()
    await assertSource()
  } catch {
    throw new AppUpdateStagingError('INVALID')
  }
  const envelopeBytes = Buffer.from(authority.envelope, 'utf8')
  const notesBytes = Buffer.from(authority.releaseNotesJson, 'utf8')
  need(
    manifest &&
      typeof manifest === 'object' &&
      manifest.appId === 'studio.imagegen.desktop' &&
      manifest.scope === 'application-release' &&
      (manifest.schemaVersion === 1 || manifest.schemaVersion === 2) &&
      manifest.target &&
      typeof manifest.target === 'object' &&
      manifest.artifact &&
      typeof manifest.artifact === 'object' &&
      manifest.target.os === 'linux' &&
      manifest.target.arch === 'x64' &&
      manifest.target.format === 'AppImage' &&
      Number.isSafeInteger(manifest.artifact.sizeBytes) &&
      manifest.artifact.sizeBytes >= 64 &&
      typeof manifest.artifact.sha512 === 'string' &&
      Buffer.from(manifest.artifact.sha512, 'base64').length === 64 &&
      Buffer.from(manifest.artifact.sha512, 'base64').toString('base64') ===
        manifest.artifact.sha512,
    'INVALID',
  )
  const assertArtifact = async () => {
    try {
      await assertSource()
      await verifyArtifact()
      await assertSource()
    } catch {
      throw new AppUpdateStagingError('INVALID')
    }
    try {
      need(canonicalRuntimeReleaseJson(artifact.manifest).equals(manifestBytes), 'UNSAFE')
      need(artifact.path === sourcePath, 'UNSAFE')
      const retained = copyApplicationReleaseAuthority(artifact.authority)
      need(
        retained.envelope === authority.envelope &&
          retained.releaseNotesJson === authority.releaseNotesJson,
        'UNSAFE',
      )
    } catch {
      throw new AppUpdateStagingError('UNSAFE')
    }
  }
  const parentPath = path.dirname(currentAppImage)
  const stageName = `.igs-app-update-${createHash('sha256').update(path.basename(currentAppImage)).digest('hex').slice(0, 16)}`
  const stagingDirectory = path.join(parentPath, stageName)
  const candidatePath = path.join(stagingDirectory, CANDIDATE)
  let parent: OwnedDirectory | undefined
  let staging: OwnedDirectory | undefined
  let source: Reader | undefined
  let created = false
  try {
    await assertArtifact()
    parent = await openDirectory(parentPath, undefined, false)
    const current = await inspectImage(
      currentAppImage,
      path.join(parent.anchor, path.basename(currentAppImage)),
      0o755,
      currentSourceSnapshot,
    )
    source = await openReader(sourcePath, sourcePath)
    need(source.identity.sizeBytes === manifest.artifact.sizeBytes, 'INVALID')
    need(!sameInode(current.identity, source.identity), 'INVALID')
    await classifyAppImage(source)
    await parent.check()
    await assertArtifact()
    const volume = await fs.statfs(parent.anchor, { bigint: true })
    need(volume.bavail * volume.bsize >= BigInt(manifest.artifact.sizeBytes), 'FAILED')
    await assertSource()
    assertCurrentSource()
    try {
      await fs.mkdir(path.join(parent.anchor, stageName), { mode: 0o700 })
      created = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new AppUpdateStagingError('BUSY')
      }
      throw error
    }
    staging = await openDirectory(stagingDirectory, undefined, true)
    await parent.check()
    need(staging.identity.dev === parent.identity.dev, 'UNSAFE')
    need((await fs.readdir(staging.anchor)).length === 0, 'UNSAFE')
    await parent.handle.sync()
    const envelope = await writeJournal(staging, parent, envelopeBytes, null, ENVELOPE)
    const releaseNotes = await writeJournal(staging, parent, notesBytes, null, RELEASE_NOTES)
    await assertArtifact()
    const describeAuthority = (file: FileSnapshot) => ({
      sha512: file.sha512,
      sizeBytes: file.sizeBytes,
      snapshot: file.identity,
    })
    const base = {
      authority: {
        envelope: describeAuthority(envelope),
        releaseNotes: describeAuthority(releaseNotes),
      },
      current: { path: currentAppImage, ...current },
      manifest,
      parent: { path: parentPath, ...parent.identity },
      schemaVersion: 2,
      scope: 'application-update-staging',
      staging: { path: stagingDirectory, ...staging.identity },
    } as const
    const preparingBytes = canonicalRuntimeReleaseJson({
      ...base,
      candidate: {
        path: candidatePath,
        sha512: manifest.artifact.sha512,
        sizeBytes: manifest.artifact.sizeBytes,
        snapshot: null,
      },
      state: 'preparing',
    })
    const preparing = await writeJournal(staging, parent, preparingBytes, null)
    const copiedCandidate = await copyImage(
      source,
      path.join(staging.anchor, CANDIDATE),
      manifest.artifact,
    )
    await assertArtifact()
    await parent.check()
    await staging.check()
    await inspectImage(
      currentAppImage,
      path.join(parent.anchor, path.basename(currentAppImage)),
      0o755,
      current,
    )
    const candidate = await inspectImage(
      candidatePath,
      path.join(staging.anchor, CANDIDATE),
      0o600,
      copiedCandidate,
    )
    need(
      candidate.sha512 === manifest.artifact.sha512 &&
        candidate.sizeBytes === manifest.artifact.sizeBytes,
      'UNSAFE',
    )
    need(
      !sameInode(candidate.identity, source.identity) &&
        !sameInode(candidate.identity, current.identity),
      'UNSAFE',
    )
    const preparedBytes = canonicalRuntimeReleaseJson({
      ...base,
      candidate: {
        path: candidatePath,
        sha512: candidate.sha512,
        sizeBytes: candidate.sizeBytes,
        snapshot: candidate.identity,
      },
      state: 'prepared',
    })
    const journal = await writeJournal(staging, parent, preparedBytes, preparing)
    const parentIdentity = parent.identity
    const stagingIdentity = staging.identity
    const backupPath = path.join(stagingDirectory, BACKUP)
    const rollbackPath = path.join(stagingDirectory, ROLLBACK)
    let phase: Phase = 'prepared'
    let pending: Promise<unknown> | null = null
    let pendingKind: string | null = null
    let snapshot: PhaseSnapshot = Object.freeze({
      backup: null,
      candidate,
      current,
      journal,
      journalBytes: preparedBytes,
      phase: 'prepared',
      rollback: null,
    })

    // All capabilities belong to this one owner. An old capability refuses before entering a
    // verification catch, so consuming it cannot poison a legitimate in-progress transition.
    function exclusive<T>(
      kind: string,
      expected: Phase,
      use: () => Promise<T>,
      refuse?: (code: 'BUSY' | 'INVALID_PHASE') => Error,
    ): Promise<T> {
      if (pending) {
        return pendingKind === kind
          ? (pending as Promise<T>)
          : Promise.reject(refuse?.('BUSY') ?? new AppUpdateTransitionError('BUSY', 'unchanged'))
      }
      if (phase !== expected) {
        return Promise.reject(
          refuse?.('INVALID_PHASE') ?? new AppUpdateTransitionError('INVALID_PHASE', 'unchanged'),
        )
      }
      const operation = Promise.resolve().then(use)
      pending = operation
      pendingKind = kind
      const release = () => {
        if (pending === operation) {
          pending = null
          pendingKind = null
        }
      }
      void operation.then(release, release)
      return operation
    }

    async function withDirectories<T>(
      use: (directories: { parent: OwnedDirectory; staging: OwnedDirectory }) => Promise<T>,
    ): Promise<T> {
      const ownedParent = await openDirectory(parentPath, parentIdentity, false)
      let ownedStage: OwnedDirectory | undefined
      try {
        ownedStage = await openDirectory(stagingDirectory, stagingIdentity, true)
        return await use({ parent: ownedParent, staging: ownedStage })
      } finally {
        await closeReadHandle(ownedStage?.handle)
        await closeReadHandle(ownedParent.handle)
      }
    }

    function members(value: PhaseSnapshot): string[] {
      return [
        JOURNAL,
        ENVELOPE,
        RELEASE_NOTES,
        ...(value.candidate ? [CANDIDATE] : []),
        ...(value.backup ? [BACKUP] : []),
        ...(value.rollback ? [ROLLBACK] : []),
      ].sort()
    }

    // Fresh descriptors and no await between the final guards and the optional owned rename.
    function finalGuards<T>(
      value: PhaseSnapshot,
      publish?: (anchors: { parent: string; staging: string }) => T,
    ): T | undefined {
      need(phase !== 'failed', 'RECOVERY_REQUIRED')
      if (!sourceConsumed) {
        assertCurrentSource()
      }
      const parentFd = openSync(parentPath, DIRECTORY_FLAGS)
      let stageFd: number | undefined
      try {
        stageFd = openSync(stagingDirectory, DIRECTORY_FLAGS)
        const parentAnchor = `/proc/self/fd/${parentFd}`
        const stageAnchor = `/proc/self/fd/${stageFd}`
        assertDirectoryNow(
          { handle: { fd: parentFd }, identity: parentIdentity },
          parentPath,
          false,
        )
        assertDirectoryNow(
          { handle: { fd: stageFd }, identity: stagingIdentity },
          stagingDirectory,
          true,
        )
        need(readdirSync(stageAnchor).sort().join('\0') === members(value).join('\0'), 'UNSAFE')
        assertFileNow(
          currentAppImage,
          path.join(parentAnchor, path.basename(currentAppImage)),
          value.current.identity,
        )
        if (value.candidate) {
          assertFileNow(candidatePath, path.join(stageAnchor, CANDIDATE), value.candidate.identity)
        }
        if (value.backup) {
          assertFileNow(backupPath, path.join(stageAnchor, BACKUP), value.backup.identity)
        }
        if (value.rollback) {
          assertFileNow(rollbackPath, path.join(stageAnchor, ROLLBACK), value.rollback.identity)
        }
        assertFileNow(
          path.join(stagingDirectory, JOURNAL),
          path.join(stageAnchor, JOURNAL),
          value.journal.identity,
        )
        assertFileNow(
          path.join(stagingDirectory, ENVELOPE),
          path.join(stageAnchor, ENVELOPE),
          envelope.identity,
        )
        assertFileNow(
          path.join(stagingDirectory, RELEASE_NOTES),
          path.join(stageAnchor, RELEASE_NOTES),
          releaseNotes.identity,
        )
        return publish?.({ parent: parentAnchor, staging: stageAnchor })
      } finally {
        if (stageFd !== undefined) {
          closeSync(stageFd)
        }
        closeSync(parentFd)
      }
    }

    async function verifySnapshot(value: PhaseSnapshot, sourceAuthority: boolean): Promise<void> {
      if (sourceAuthority) {
        await assertArtifact()
      }
      await withDirectories(async (directories) => {
        need(
          (await fs.readdir(directories.staging.anchor)).sort().join('\0') ===
            members(value).join('\0'),
          'UNSAFE',
        )
        await inspectImage(
          currentAppImage,
          path.join(directories.parent.anchor, path.basename(currentAppImage)),
          0o755,
          value.current,
        )
        if (value.candidate) {
          await inspectImage(
            candidatePath,
            path.join(directories.staging.anchor, CANDIDATE),
            imageMode(value.candidate),
            value.candidate,
          )
        }
        if (value.backup) {
          await inspectImage(
            backupPath,
            path.join(directories.staging.anchor, BACKUP),
            0o600,
            value.backup,
          )
        }
        if (value.rollback) {
          await inspectImage(
            rollbackPath,
            path.join(directories.staging.anchor, ROLLBACK),
            0o755,
            value.rollback,
          )
        }
        await inspectMetadata(
          path.join(stagingDirectory, JOURNAL),
          path.join(directories.staging.anchor, JOURNAL),
          value.journalBytes,
          value.journal,
        )
        await inspectMetadata(
          path.join(stagingDirectory, ENVELOPE),
          path.join(directories.staging.anchor, ENVELOPE),
          envelopeBytes,
          envelope,
        )
        await inspectMetadata(
          path.join(stagingDirectory, RELEASE_NOTES),
          path.join(directories.staging.anchor, RELEASE_NOTES),
          notesBytes,
          releaseNotes,
        )
        await directories.staging.check()
        await directories.parent.check()
        if (sourceAuthority) {
          await assertArtifact()
        }
      })
      finalGuards(value)
    }

    async function failOwned(): Promise<void> {
      phase = 'failed'
      await withDirectories(async (directories) => {
        await markFailed(directories.staging, directories.parent)
      }).catch(() => undefined)
    }

    function verifyCapability(expected: Phase): Promise<void> {
      return exclusive(`verify:${expected}`, expected, async () => {
        try {
          await verifySnapshot(snapshot, expected === 'prepared' || expected === 'backed-up')
        } catch {
          await failOwned()
          if (expected === 'prepared') {
            throw new AppUpdateStagingError('RECOVERY_REQUIRED')
          }
          throw new AppUpdateTransitionError(
            'RECOVERY_REQUIRED',
            expected === 'activated' || expected === 'rolled-back' ? 'uncertain' : 'unchanged',
          )
        }
      })
    }

    async function writePhase(
      directories: { parent: OwnedDirectory; staging: OwnedDirectory },
      next: Omit<PhaseSnapshot, 'journal' | 'journalBytes'>,
    ): Promise<PhaseSnapshot> {
      const describe = (filename: string, file: FileSnapshot | null, pendingFile = false) =>
        file
          ? {
              path: filename,
              sha512: file.sha512,
              sizeBytes: file.sizeBytes,
              snapshot: file.identity,
            }
          : pendingFile
            ? {
                path: filename,
                sha512: current.sha512,
                sizeBytes: current.sizeBytes,
                snapshot: null,
              }
            : null
      const bytes = canonicalRuntimeReleaseJson({
        ...base,
        backup: describe(backupPath, next.backup, next.phase === 'backing-up'),
        candidate: describe(candidatePath, next.candidate),
        current: { path: currentAppImage, ...next.current },
        originalCurrent: base.current,
        rollback: describe(rollbackPath, next.rollback, next.phase === 'rolling-back'),
        state: next.phase,
      })
      const nextJournal = await writeJournal(
        directories.staging,
        directories.parent,
        bytes,
        snapshot.journal,
      )
      return Object.freeze({ ...next, journal: nextJournal, journalBytes: bytes })
    }

    function prepareBackup(): Promise<BackedUpApplicationUpdate> {
      return exclusive('backup', 'prepared', async () => {
        try {
          await verifySnapshot(snapshot, true)
          // Consume the prepared capability before the first intentional journal/membership change.
          phase = 'backing-up'
          await withDirectories(async (directories) => {
            await requireCopySpace(directories.parent, current.sizeBytes)
            snapshot = await writePhase(directories, { ...snapshot, phase: 'backing-up' })
            const original = await openReader(
              currentAppImage,
              path.join(directories.parent.anchor, path.basename(currentAppImage)),
              0o755,
            )
            let copiedBackup: FileSnapshot
            try {
              need(sameIdentity(original.identity, current.identity), 'UNSAFE')
              copiedBackup = await copyImage(
                original,
                path.join(directories.staging.anchor, BACKUP),
                current,
              )
            } finally {
              await original.handle.close()
            }
            const backup = await inspectImage(
              backupPath,
              path.join(directories.staging.anchor, BACKUP),
              0o600,
              copiedBackup,
            )
            need(
              backup.sha512 === current.sha512 &&
                backup.sizeBytes === current.sizeBytes &&
                !sameInode(backup.identity, current.identity) &&
                !sameInode(backup.identity, candidate.identity),
              'UNSAFE',
            )
            snapshot = await writePhase(directories, { ...snapshot, backup, phase: 'backed-up' })
          })
          await verifySnapshot(snapshot, true)
          phase = 'backed-up'
          return Object.freeze({
            activate,
            backupPath,
            candidatePath,
            manifest,
            stagingDirectory,
            verifyCompleteSnapshot: () => verifyCapability('backed-up'),
          })
        } catch {
          await failOwned()
          throw new AppUpdateTransitionError('RECOVERY_REQUIRED', 'unchanged')
        }
      })
    }

    function activate(assertApplicationClosed: () => void): Promise<ActivatedApplicationUpdate> {
      return exclusive('activate', 'backed-up', async () => {
        // A refused first close assertion has changed neither phase nor files and remains retryable.
        assertClosedNow(assertApplicationClosed)
        let attempted = false
        try {
          await verifySnapshot(snapshot, true)
          phase = 'activating'
          await withDirectories(async (directories) => {
            need(snapshot.candidate && snapshot.backup, 'UNSAFE')
            const moving = await openReader(
              candidatePath,
              path.join(directories.staging.anchor, CANDIDATE),
              0o600,
            )
            try {
              need(sameIdentity(moving.identity, snapshot.candidate.identity), 'UNSAFE')
              const executable = await makeExecutable(moving, snapshot.candidate)
              snapshot = await writePhase(directories, {
                ...snapshot,
                candidate: executable,
                phase: 'activating',
              })
              await verifySnapshot(snapshot, true)
              // This is the last authority await. The second pure close assertion and fresh-FD
              // guards precede rename in the same synchronous section; no unlink creates a gap.
              await assertArtifact()
              assertClosedNow(assertApplicationClosed)
              finalGuards(snapshot, (anchors) => {
                need(
                  sameIdentity(
                    fileIdentity(fstatSync(moving.handle.fd, { bigint: true })),
                    moving.identity,
                  ),
                  'UNSAFE',
                )
                attempted = true
                renameSync(
                  path.join(anchors.staging, CANDIDATE),
                  path.join(anchors.parent, path.basename(currentAppImage)),
                )
                sourceConsumed = true
                adoptMovedReader(
                  moving,
                  currentAppImage,
                  path.join(directories.parent.anchor, path.basename(currentAppImage)),
                )
                assertFileNow(
                  currentAppImage,
                  path.join(anchors.parent, path.basename(currentAppImage)),
                  moving.identity,
                )
              })
              await directories.staging.handle.sync()
              await directories.parent.handle.sync()
              const published = await inspectReaderImage(moving, {
                ...executable,
                identity: moving.identity,
              })
              snapshot = await writePhase(directories, {
                ...snapshot,
                candidate: null,
                current: published,
                phase: 'activated',
              })
            } finally {
              await moving.handle.close()
            }
          })
          // Publication consumes source-cache authority. Subsequent verification/rollback uses
          // only owned published/current/backup/journal snapshots, even after Check or cache loss.
          await verifySnapshot(snapshot, false)
          phase = 'activated'
          return Object.freeze({
            backupPath,
            currentAppImage,
            handoffRelaunch,
            manifest,
            rollback,
            stagingDirectory,
            verifyCompleteSnapshot: () => verifyCapability('activated'),
          })
        } catch {
          await failOwned()
          throw new AppUpdateTransitionError(
            'RECOVERY_REQUIRED',
            attempted ? 'uncertain' : 'unchanged',
          )
        }
      })
    }

    function handoffRelaunch(schedule: (currentAppImage: string) => unknown): Promise<void> {
      return exclusive(
        'relaunch',
        'activated',
        async () => {
          let attempted = false
          try {
            need(typeof schedule === 'function', 'INVALID')
            await verifySnapshot(snapshot, false)
            // Consume every activated capability before replacing its journal. Even a successful
            // native handshake leaves only durable intent: it is not application-start proof.
            phase = 'relaunching'
            await withDirectories(async (directories) => {
              snapshot = await writePhase(directories, { ...snapshot, phase: 'relaunching' })
            })
            await verifySnapshot(snapshot, false)
            // No await between these fresh synchronous guards and the native call. The helper
            // might already exist after a false return or throw, so attempts are never retried or
            // rolled back automatically. The caller owns normal close after this boundary.
            finalGuards(snapshot, () => {
              attempted = true
              const result = schedule(currentAppImage)
              if (result !== true) {
                if (result instanceof Promise) {
                  void result.catch(() => undefined)
                }
                throw new AppUpdateRelaunchError('uncertain')
              }
            })
          } catch {
            await failOwned()
            throw new AppUpdateRelaunchError(attempted ? 'uncertain' : 'not-attempted')
          }
        },
        () => new AppUpdateRelaunchError('not-attempted'),
      )
    }

    function rollback(): Promise<RolledBackApplicationUpdate> {
      return exclusive('rollback', 'activated', async () => {
        let attempted = false
        try {
          await verifySnapshot(snapshot, false)
          phase = 'rolling-back'
          await withDirectories(async (directories) => {
            need(snapshot.backup, 'UNSAFE')
            await requireCopySpace(directories.parent, snapshot.backup.sizeBytes)
            snapshot = await writePhase(directories, { ...snapshot, phase: 'rolling-back' })
            const saved = await openReader(
              backupPath,
              path.join(directories.staging.anchor, BACKUP),
              0o600,
            )
            let copiedRollback: FileSnapshot
            try {
              need(sameIdentity(saved.identity, snapshot.backup!.identity), 'UNSAFE')
              copiedRollback = await copyImage(
                saved,
                path.join(directories.staging.anchor, ROLLBACK),
                snapshot.backup!,
              )
            } finally {
              await saved.handle.close()
            }
            const copied = await inspectImage(
              rollbackPath,
              path.join(directories.staging.anchor, ROLLBACK),
              0o600,
              copiedRollback,
            )
            need(
              copied.sha512 === current.sha512 &&
                copied.sizeBytes === current.sizeBytes &&
                !sameInode(copied.identity, snapshot.backup!.identity) &&
                !sameInode(copied.identity, snapshot.current.identity),
              'UNSAFE',
            )
            const moving = await openReader(
              rollbackPath,
              path.join(directories.staging.anchor, ROLLBACK),
              0o600,
            )
            try {
              const executable = await makeExecutable(moving, copied)
              snapshot = await writePhase(directories, {
                ...snapshot,
                phase: 'rolling-back',
                rollback: executable,
              })
              await verifySnapshot(snapshot, false)
              finalGuards(snapshot, (anchors) => {
                need(
                  sameIdentity(
                    fileIdentity(fstatSync(moving.handle.fd, { bigint: true })),
                    moving.identity,
                  ),
                  'UNSAFE',
                )
                attempted = true
                renameSync(
                  path.join(anchors.staging, ROLLBACK),
                  path.join(anchors.parent, path.basename(currentAppImage)),
                )
                adoptMovedReader(
                  moving,
                  currentAppImage,
                  path.join(directories.parent.anchor, path.basename(currentAppImage)),
                )
                assertFileNow(
                  currentAppImage,
                  path.join(anchors.parent, path.basename(currentAppImage)),
                  moving.identity,
                )
              })
              await directories.staging.handle.sync()
              await directories.parent.handle.sync()
              const restored = await inspectReaderImage(moving, {
                ...executable,
                identity: moving.identity,
              })
              snapshot = await writePhase(directories, {
                ...snapshot,
                current: restored,
                phase: 'rolled-back',
                rollback: null,
              })
            } finally {
              await moving.handle.close()
            }
          })
          await verifySnapshot(snapshot, false)
          phase = 'rolled-back'
          return Object.freeze({
            backupPath,
            currentAppImage,
            manifest,
            stagingDirectory,
            verifyCompleteSnapshot: () => verifyCapability('rolled-back'),
          })
        } catch {
          await failOwned()
          throw new AppUpdateTransitionError(
            'RECOVERY_REQUIRED',
            attempted ? 'uncertain' : 'unchanged',
          )
        }
      })
    }

    await closeReadHandle(source.handle)
    source = undefined
    await closeReadHandle(staging.handle)
    staging = undefined
    await closeReadHandle(parent.handle)
    parent = undefined
    try {
      await verifySnapshot(snapshot, true)
    } catch (error) {
      await failOwned()
      throw error
    }
    return Object.freeze({
      candidatePath,
      manifest,
      prepareBackup,
      stagingDirectory,
      verifyCompleteSnapshot: () => verifyCapability('prepared'),
    })
  } catch (error) {
    if (created) {
      await markFailed(staging, parent).catch(() => undefined)
      throw new AppUpdateStagingError('RECOVERY_REQUIRED')
    }
    if (error instanceof AppUpdateStagingError) {
      throw error
    }
    const code = (error as NodeJS.ErrnoException).code
    throw new AppUpdateStagingError(
      ['EACCES', 'ELOOP', 'ENOENT', 'ENOTDIR', 'EPERM'].includes(code ?? '') ? 'UNSAFE' : 'FAILED',
    )
  } finally {
    if (source) {
      await closeReadHandle(source.handle)
    }
    if (staging) {
      await closeReadHandle(staging.handle)
    }
    if (parent) {
      await closeReadHandle(parent.handle)
    }
  }
}

/**
 * Read-only retained-stage admission, adapted from Invoke's conservative marker restoration gate.
 * Only the fixed target's bytes can be authenticated. This is never acknowledgement of the loaded
 * application body, startup health, a rollback capability or permission to retire retained files.
 * In particular, the unsigned journal cannot supply trust or make its previous image executable.
 */
export async function inspectRetainedApplicationUpdate(input: {
  currentAppImage: string
  currentSource?: ApplicationUpdateCurrentSource | null
  currentVersion: string
  readTrust: () => Promise<ApplicationReleaseTrust | null>
}): Promise<ApplicationUpdateStartupInspection> {
  const retained = {
    runtimeAuthentication: 'unverified',
    status: 'retained',
    targetAuthentication: 'unverified',
  } as const
  let parent: OwnedDirectory | undefined
  let staging: OwnedDirectory | undefined
  try {
    const { currentAppImage, currentSource = null, currentVersion, readTrust } = input
    need(
      process.platform === 'linux' &&
        process.arch === 'x64' &&
        canonicalPath(currentAppImage) &&
        typeof currentVersion === 'string' &&
        typeof readTrust === 'function',
      'UNSAFE',
    )
    const parentPath = path.dirname(currentAppImage)
    const stageName = `.igs-app-update-${createHash('sha256').update(path.basename(currentAppImage)).digest('hex').slice(0, 16)}`
    const stagingDirectory = path.join(parentPath, stageName)
    parent = await openDirectory(parentPath, undefined, false)
    // Absence is established through the safe held parent; neither the current body nor trust is
    // read for the common no-stage case. A parent replacement cannot turn uncertainty into none.
    try {
      await fs.lstat(path.join(parent.anchor, stageName))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      await parent.check()
      const parentIdentity = parent.identity
      await parent.handle.close()
      parent = undefined
      const parentFd = openSync(parentPath, DIRECTORY_FLAGS)
      try {
        assertDirectoryNow(
          { handle: { fd: parentFd }, identity: parentIdentity },
          parentPath,
          false,
        )
        try {
          lstatSync(path.join(`/proc/self/fd/${parentFd}`, stageName))
        } catch (finalError) {
          if ((finalError as NodeJS.ErrnoException).code === 'ENOENT') {
            return { status: 'none' }
          }
          throw finalError
        }
      } finally {
        closeSync(parentFd)
      }
      return retained
    }
    staging = await openDirectory(stagingDirectory, undefined, true)
    need(staging.identity.dev === parent.identity.dev, 'UNSAFE')
    const expectedMembers = [BACKUP, ENVELOPE, JOURNAL, RELEASE_NOTES].sort().join('\0')
    const checkMembers = async () => {
      need((await fs.readdir(staging!.anchor)).sort().join('\0') === expectedMembers, 'UNSAFE')
    }
    await checkMembers()
    const journal = await readMetadata(
      path.join(stagingDirectory, JOURNAL),
      path.join(staging.anchor, JOURNAL),
    )
    const record = exactRecord(JSON.parse(journal.bytes.toString('utf8')), [
      'authority',
      'backup',
      'candidate',
      'current',
      'manifest',
      'originalCurrent',
      'parent',
      'rollback',
      'schemaVersion',
      'scope',
      'staging',
      'state',
    ])
    need(
      canonicalRuntimeReleaseJson(record).equals(journal.bytes) &&
        record['schemaVersion'] === 2 &&
        record['scope'] === 'application-update-staging' &&
        (record['state'] === 'activated' || record['state'] === 'relaunching') &&
        record['candidate'] === null &&
        record['rollback'] === null,
      'UNSAFE',
    )
    const checkDirectoryReference = (
      value: unknown,
      filename: string,
      expected: DirectoryIdentity,
    ) => {
      const ref = exactRecord(value, ['path', 'dev', 'ino'])
      need(
        ref['path'] === filename && ref['dev'] === expected.dev && ref['ino'] === expected.ino,
        'UNSAFE',
      )
    }
    checkDirectoryReference(record['parent'], parentPath, parent.identity)
    checkDirectoryReference(record['staging'], stagingDirectory, staging.identity)
    const current = snapshotReference(record['current'], currentAppImage, 'identity')
    const backupPath = path.join(stagingDirectory, BACKUP)
    const backup = snapshotReference(record['backup'], backupPath, 'snapshot')
    snapshotReference(record['originalCurrent'], currentAppImage, 'identity')
    const references = exactRecord(record['authority'], ['envelope', 'releaseNotes'])
    const envelopeRef = snapshotReference(references['envelope'], null, 'snapshot')
    const notesRef = snapshotReference(references['releaseNotes'], null, 'snapshot')
    const envelopePath = path.join(stagingDirectory, ENVELOPE)
    const notesPath = path.join(stagingDirectory, RELEASE_NOTES)
    const envelope = await readMetadata(
      envelopePath,
      path.join(staging.anchor, ENVELOPE),
      envelopeRef,
    )
    const notes = await readMetadata(notesPath, path.join(staging.anchor, RELEASE_NOTES), notesRef)
    const authority = copyApplicationReleaseAuthority({
      envelope: envelope.bytes.toString('utf8'),
      releaseNotesJson: notes.bytes.toString('utf8'),
    })
    need(
      Buffer.from(authority.envelope, 'utf8').equals(envelope.bytes) &&
        Buffer.from(authority.releaseNotesJson, 'utf8').equals(notes.bytes),
      'UNSAFE',
    )
    // Merely admit the fixed backup's ordinary metadata. It gains no signed hash, execution,
    // restoration or deletion authority, and its body is deliberately neither read nor hashed.
    const checkBackup = async () => {
      const reader = await openReader(backupPath, path.join(staging!.anchor, BACKUP), 0o600)
      try {
        need(sameIdentity(reader.identity, backup.identity), 'UNSAFE')
      } finally {
        await reader.handle.close()
      }
    }
    await checkBackup()
    await checkMembers()
    await staging.check()
    await parent.check()
    const readSourceObservation = (source: ApplicationUpdateCurrentSource) => {
      const raw = exactRecord(source, [
        'assertCurrentSnapshot',
        'currentAppImage',
        'currentImage',
        'dispose',
        'runtimeFiles',
        'verifyCompleteSnapshot',
      ])
      need(typeof raw['currentAppImage'] === 'string', 'UNSAFE')
      const image = exactRecord(raw['currentImage'], ['identity', 'sha512', 'sizeBytes'])
      const identity = exactRecord(image['identity'], [
        'ctimeNs',
        'dev',
        'gid',
        'ino',
        'mode',
        'mtimeNs',
        'nlink',
        'sizeBytes',
        'uid',
      ])
      const runtime = exactRecord(raw['runtimeFiles'], ['archive', 'executable'])
      const archive = exactRecord(runtime['archive'], ['sha512', 'sizeBytes'])
      const executable = exactRecord(runtime['executable'], ['sha512', 'sizeBytes'])
      return {
        bytes: canonicalRuntimeReleaseJson({
          currentAppImage: raw['currentAppImage'],
          currentImage: {
            identity: { ...identity },
            sha512: image['sha512'],
            sizeBytes: image['sizeBytes'],
          },
          runtimeFiles: { archive: { ...archive }, executable: { ...executable } },
        }),
        raw: Object.freeze({ ...raw }),
      }
    }
    let sourceObservation: ReturnType<typeof readSourceObservation> | null = null
    let verifyRuntimeSource: (() => Promise<void>) | null = null
    let assertRuntimeSource: (() => void) | null = null
    // Capture a complete primitive observation before authority/trust awaits, without getters.
    // The untrusted journal can select this read-only preparation, never grant authentication.
    // A genuine v1 stage never consults the optional runtime capability at all.
    if (
      (record['manifest'] as { schemaVersion?: unknown } | null)?.schemaVersion === 2 &&
      currentSource
    ) {
      try {
        sourceObservation = readSourceObservation(currentSource)
        const verify = sourceObservation.raw['verifyCompleteSnapshot']
        const assert = sourceObservation.raw['assertCurrentSnapshot']
        need(typeof verify === 'function' && typeof assert === 'function', 'UNSAFE')
        verifyRuntimeSource = verify.bind(currentSource) as () => Promise<void>
        assertRuntimeSource = assert.bind(currentSource) as () => void
      } catch {
        sourceObservation = null
      }
    }
    // Used without trust by admission callers as a cheap veto. No current-body hash or network
    // is needed to retain an existing stage, and the bundled keyring is never persisted here.
    const trust = await readTrust()
    if (!trust) {
      return retained
    }
    const manifest = verifyApplicationReleaseAuthority(authority, trust)
    need(
      manifest.version === currentVersion &&
        canonicalRuntimeReleaseJson(manifest).equals(
          canonicalRuntimeReleaseJson(record['manifest']),
        ) &&
        current.sha512 === manifest.artifact.sha512 &&
        current.sizeBytes === manifest.artifact.sizeBytes,
      'UNSAFE',
    )
    const verifyTargetSnapshot = async () => {
      await checkMembers()
      await inspectMetadata(
        path.join(stagingDirectory, JOURNAL),
        path.join(staging!.anchor, JOURNAL),
        journal.bytes,
        journal.snapshot,
      )
      await inspectMetadata(
        envelopePath,
        path.join(staging!.anchor, ENVELOPE),
        envelope.bytes,
        envelope.snapshot,
      )
      await inspectMetadata(
        notesPath,
        path.join(staging!.anchor, RELEASE_NOTES),
        notes.bytes,
        notes.snapshot,
      )
      await inspectImage(
        currentAppImage,
        path.join(parent!.anchor, path.basename(currentAppImage)),
        0o755,
        current,
      )
      await checkBackup()
      await staging!.check()
      await parent!.check()
    }
    await verifyTargetSnapshot()
    let runtimeAuthentication: 'unverified' | 'verified-publisher-declaration' = 'unverified'
    let assertRuntimeBinding: (() => void) | null = null
    if (
      manifest.schemaVersion === 2 &&
      currentSource &&
      sourceObservation &&
      verifyRuntimeSource &&
      assertRuntimeSource
    ) {
      const sourcePort = currentSource
      // Invoke4875 projects/invk/fonts.ts:readEmbeddedFonts checks exact declared roles and
      // bytes before its importProject.ts -> projectFile.ts consumer. Adapt that inventory gate
      // to the already captured physical FD hashes; the existing release verifier supplies trust.
      // No archive/container parser, path supplied by metadata, V8 attestation or cleanup follows.
      try {
        const expectedRuntime = canonicalRuntimeReleaseJson(manifest.runtimeFiles)
        const expectedCurrent = canonicalRuntimeReleaseJson(current)
        const observed = sourceObservation
        const currentSource = freezeJson(JSON.parse(observed.bytes.toString('utf8'))) as Pick<
          ApplicationUpdateCurrentSource,
          'currentAppImage' | 'currentImage' | 'runtimeFiles'
        >
        assertRuntimeBinding = () => {
          const result: unknown = assertRuntimeSource()
          if (result !== undefined) {
            if (result instanceof Promise) {
              void result.catch(() => undefined)
            }
            throw new AppUpdateCurrentSourceError()
          }
          const latest = readSourceObservation(sourcePort)
          need(
            latest.bytes.equals(observed.bytes) &&
              latest.raw['verifyCompleteSnapshot'] === observed.raw['verifyCompleteSnapshot'] &&
              latest.raw['assertCurrentSnapshot'] === observed.raw['assertCurrentSnapshot'] &&
              currentSource.currentAppImage === currentAppImage &&
              canonicalRuntimeReleaseJson(currentSource.currentImage).equals(expectedCurrent) &&
              canonicalRuntimeReleaseJson(currentSource.runtimeFiles).equals(expectedRuntime),
            'UNSAFE',
          )
        }
        assertRuntimeBinding()
        await verifyRuntimeSource()
        assertRuntimeBinding()
        runtimeAuthentication = 'verified-publisher-declaration'
      } catch {
        // Runtime absence/mismatch never turns an independently verified target into unverified.
        runtimeAuthentication = 'unverified'
      }
      // Source callbacks can yield or fail after changing files. Recheck target/authority under
      // their original identities even when the runtime branch refused; no journal is authority.
      await verifyTargetSnapshot()
      if (runtimeAuthentication === 'verified-publisher-declaration') {
        try {
          await verifyRuntimeSource()
          assertRuntimeBinding!()
        } catch {
          runtimeAuthentication = 'unverified'
        }
      }
    }
    const parentIdentity = parent.identity
    const stagingIdentity = staging.identity
    await staging.handle.close()
    staging = undefined
    await parent.handle.close()
    parent = undefined
    if (runtimeAuthentication === 'verified-publisher-declaration') {
      try {
        assertRuntimeBinding!()
      } catch {
        runtimeAuthentication = 'unverified'
      }
    }
    // Finish through the same fresh descriptor/visible-path guards used before publication. No
    // await follows this boundary, so same-byte replacement during trust/hash awaits is refused.
    const parentFd = openSync(parentPath, DIRECTORY_FLAGS)
    let stageFd: number | undefined
    try {
      stageFd = openSync(stagingDirectory, DIRECTORY_FLAGS)
      const parentAnchor = `/proc/self/fd/${parentFd}`
      const stageAnchor = `/proc/self/fd/${stageFd}`
      assertDirectoryNow({ handle: { fd: parentFd }, identity: parentIdentity }, parentPath, false)
      assertDirectoryNow(
        { handle: { fd: stageFd }, identity: stagingIdentity },
        stagingDirectory,
        true,
      )
      need(readdirSync(stageAnchor).sort().join('\0') === expectedMembers, 'UNSAFE')
      for (const [name, snapshot] of [
        [JOURNAL, journal.snapshot],
        [ENVELOPE, envelope.snapshot],
        [RELEASE_NOTES, notes.snapshot],
        [BACKUP, backup],
      ] as const) {
        assertFileNow(
          path.join(stagingDirectory, name),
          path.join(stageAnchor, name),
          snapshot.identity,
        )
      }
      assertFileNow(
        currentAppImage,
        path.join(parentAnchor, path.basename(currentAppImage)),
        current.identity,
      )
      return { runtimeAuthentication, status: 'retained', targetAuthentication: 'verified' }
    } finally {
      if (stageFd !== undefined) {
        closeSync(stageFd)
      }
      closeSync(parentFd)
    }
  } catch {
    return retained
  } finally {
    if (staging) {
      await closeReadHandle(staging.handle)
    }
    if (parent) {
      await closeReadHandle(parent.handle)
    }
  }
}

function exactRecord(value: unknown, keys: string[]): Record<string, unknown> {
  need(value !== null && typeof value === 'object' && !Array.isArray(value), 'UNSAFE')
  const actual = Reflect.ownKeys(value)
  need(
    actual.every((key) => typeof key === 'string'),
    'UNSAFE',
  )
  need(actual.sort().join('\0') === [...keys].sort().join('\0'), 'UNSAFE')
  const captured: [string, unknown][] = []
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    need(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), 'UNSAFE')
    captured.push([key, descriptor.value])
  }
  return Object.fromEntries(captured)
}

function snapshotReference(
  value: unknown,
  filename: string | null,
  identityKey: 'identity' | 'snapshot',
): FileSnapshot {
  const ref = exactRecord(value, [
    identityKey,
    'sha512',
    'sizeBytes',
    ...(filename ? ['path'] : []),
  ])
  need(!filename || ref['path'] === filename, 'UNSAFE')
  const raw = exactRecord(ref[identityKey], [
    'ctimeNs',
    'dev',
    'gid',
    'ino',
    'mode',
    'mtimeNs',
    'nlink',
    'sizeBytes',
    'uid',
  ])
  for (const key of ['ctimeNs', 'dev', 'gid', 'ino', 'mode', 'mtimeNs', 'nlink', 'uid']) {
    need(typeof raw[key] === 'string' && /^(0|[1-9]\d*)$/.test(raw[key]), 'UNSAFE')
  }
  need(
    Number.isSafeInteger(ref['sizeBytes']) &&
      Number(ref['sizeBytes']) > 0 &&
      raw['sizeBytes'] === ref['sizeBytes'] &&
      raw['nlink'] === '1' &&
      typeof ref['sha512'] === 'string' &&
      Buffer.from(ref['sha512'], 'base64').length === 64 &&
      Buffer.from(ref['sha512'], 'base64').toString('base64') === ref['sha512'],
    'UNSAFE',
  )
  return Object.freeze({
    identity: Object.freeze(raw as unknown as FileIdentity),
    sha512: ref['sha512'],
    sizeBytes: ref['sizeBytes'] as number,
  })
}

function assertDirectoryNow(
  directory: { handle: { fd: number }; identity: DirectoryIdentity },
  filename: string,
  privateStage: boolean,
): void {
  for (const info of [
    fstatSync(directory.handle.fd, { bigint: true }),
    lstatSync(filename, { bigint: true }),
  ]) {
    need(
      info.isDirectory() &&
        !info.isSymbolicLink() &&
        info.uid === BigInt(process.geteuid!()) &&
        (info.mode & 0o22n) === 0n,
      'UNSAFE',
    )
    need(!privateStage || (info.mode & 0o7777n) === 0o700n, 'UNSAFE')
    need(
      String(info.dev) === directory.identity.dev && String(info.ino) === directory.identity.ino,
      'UNSAFE',
    )
  }
  need(realpathSync(filename) === filename, 'UNSAFE')
}

function assertFileNow(visible: string, anchored: string, expected: FileIdentity): void {
  for (const info of [
    lstatSync(visible, { bigint: true }),
    lstatSync(anchored, { bigint: true }),
  ]) {
    need(
      info.isFile() && !info.isSymbolicLink() && sameIdentity(fileIdentity(info), expected),
      'UNSAFE',
    )
  }
  need(realpathSync(visible) === visible, 'UNSAFE')
}

async function openDirectory(
  filename: string,
  expected: DirectoryIdentity | undefined,
  privateStage: boolean,
): Promise<OwnedDirectory> {
  need(canonicalPath(filename), 'UNSAFE')
  const handle = await fs.open(filename, DIRECTORY_FLAGS)
  try {
    const opened = await handle.stat({ bigint: true })
    const identity = Object.freeze({ dev: String(opened.dev), ino: String(opened.ino) })
    const check = async () => {
      const visible = await fs.lstat(filename, { bigint: true })
      const held = await handle.stat({ bigint: true })
      for (const info of [visible, held]) {
        need(
          info.isDirectory() && !info.isSymbolicLink() && info.uid === BigInt(process.geteuid!()),
          'UNSAFE',
        )
        need(
          (info.mode & 0o22n) === 0n && (!privateStage || (info.mode & 0o7777n) === 0o700n),
          'UNSAFE',
        )
        need(String(info.dev) === identity.dev && String(info.ino) === identity.ino, 'UNSAFE')
        need(
          !expected || (String(info.dev) === expected.dev && String(info.ino) === expected.ino),
          'UNSAFE',
        )
      }
      need((await fs.realpath(filename)) === filename, 'UNSAFE')
    }
    await check()
    return { anchor: `/proc/self/fd/${handle.fd}`, check, handle, identity }
  } catch (error) {
    await handle.close()
    throw error
  }
}

async function openReader(visible: string, filename: string, mode?: number): Promise<Reader> {
  const handle = await fs.open(filename, FILE_FLAGS)
  try {
    const info = await handle.stat({ bigint: true })
    need(
      info.isFile() &&
        info.uid === BigInt(process.geteuid!()) &&
        info.nlink === 1n &&
        info.size > 0n &&
        info.size <= BigInt(Number.MAX_SAFE_INTEGER),
      'UNSAFE',
    )
    need(mode === undefined || (info.mode & 0o7777n) === BigInt(mode), 'UNSAFE')
    const reader = { handle, identity: fileIdentity(info), path: filename, visible }
    await assertReader(reader)
    return reader
  } catch (error) {
    await handle.close()
    throw error
  }
}

async function assertReader(reader: Reader): Promise<void> {
  const atPath = await fs.lstat(reader.path, { bigint: true })
  const visible = await fs.lstat(reader.visible, { bigint: true })
  const held = await reader.handle.stat({ bigint: true })
  need(
    !atPath.isSymbolicLink() &&
      !visible.isSymbolicLink() &&
      (await fs.realpath(reader.visible)) === reader.visible,
    'UNSAFE',
  )
  for (const info of [atPath, visible, held]) {
    need(sameIdentity(fileIdentity(info), reader.identity), 'UNSAFE')
  }
}

async function classifyAppImage(reader: Reader): Promise<void> {
  const header = Buffer.alloc(64)
  let offset = 0
  while (offset < header.length) {
    const result = await reader.handle.read(header, offset, header.length - offset, offset)
    need(result.bytesRead > 0, 'INVALID')
    offset += result.bytesRead
  }
  // AI\x02 intentionally occupies ELF identification padding. Do not demand zero padding there.
  need(
    header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) &&
      header[4] === 2 &&
      header[5] === 1 &&
      header[6] === 1 &&
      header.subarray(8, 11).equals(Buffer.from([0x41, 0x49, 2])) &&
      [2, 3].includes(header.readUInt16LE(16)) &&
      header.readUInt16LE(18) === 62 &&
      header.readUInt32LE(20) === 1 &&
      header.readUInt16LE(52) === 64,
    'INVALID',
  )
  await assertReader(reader)
}

async function inspectImage(
  visible: string,
  filename: string,
  mode: number,
  expected?: FileSnapshot,
): Promise<FileSnapshot> {
  const reader = await openReader(visible, filename, mode)
  try {
    return await inspectReaderImage(reader, expected)
  } finally {
    await reader.handle.close()
  }
}

async function inspectReaderImage(reader: Reader, expected?: FileSnapshot): Promise<FileSnapshot> {
  need(!expected || sameIdentity(reader.identity, expected.identity), 'UNSAFE')
  await classifyAppImage(reader)
  const hash = createHash('sha512')
  const chunk = Buffer.allocUnsafe(CHUNK_BYTES)
  let count = 0
  for (;;) {
    const { bytesRead } = await reader.handle.read(chunk, 0, chunk.length, count)
    if (!bytesRead) {
      break
    }
    count += bytesRead
    need(count <= reader.identity.sizeBytes, 'UNSAFE')
    hash.update(chunk.subarray(0, bytesRead))
  }
  await assertReader(reader)
  const sha512 = hash.digest('base64')
  need(count === reader.identity.sizeBytes && (!expected || sha512 === expected.sha512), 'UNSAFE')
  return Object.freeze({ identity: reader.identity, sha512, sizeBytes: count })
}

async function copyImage(
  source: Reader,
  destination: string,
  expected: Readonly<{ sha512: string; sizeBytes: number }>,
): Promise<FileSnapshot> {
  await assertReader(source)
  const writer = await fs.open(destination, CREATE_FLAGS, 0o600)
  try {
    await writer.chmod(0o600)
    const hash = createHash('sha512')
    const chunk = Buffer.allocUnsafe(CHUNK_BYTES)
    let count = 0
    for (;;) {
      const { bytesRead } = await source.handle.read(chunk, 0, chunk.length, count)
      if (!bytesRead) {
        break
      }
      count += bytesRead
      need(count <= expected.sizeBytes, 'UNSAFE')
      hash.update(chunk.subarray(0, bytesRead))
      let offset = 0
      while (offset < bytesRead) {
        const { bytesWritten } = await writer.write(
          chunk,
          offset,
          bytesRead - offset,
          count - bytesRead + offset,
        )
        need(bytesWritten > 0, 'FAILED')
        offset += bytesWritten
      }
    }
    await assertReader(source)
    const sha512 = hash.digest('base64')
    need(count === expected.sizeBytes && sha512 === expected.sha512, 'UNSAFE')
    await writer.sync()
    // Invoke's no-replace publisher returns the held writer's signature, not a fresh path's.
    // Bind the later readback to that inode even if equal bytes replace its name after close.
    const written = await writer.stat({ bigint: true })
    const identity = fileIdentity(written)
    need(
      written.isFile() &&
        written.nlink === 1n &&
        written.uid === BigInt(process.geteuid!()) &&
        (written.mode & 0o7777n) === 0o600n &&
        written.size === BigInt(expected.sizeBytes) &&
        sameIdentity(fileIdentity(await fs.lstat(destination, { bigint: true })), identity),
      'UNSAFE',
    )
    return Object.freeze({ identity, sha512, sizeBytes: count })
  } finally {
    await writer.close()
  }
}

async function makeExecutable(reader: Reader, expected: FileSnapshot): Promise<FileSnapshot> {
  await assertReader(reader)
  need(sameIdentity(reader.identity, expected.identity), 'UNSAFE')
  const before = reader.identity
  await reader.handle.chmod(0o755)
  await reader.handle.sync()
  const info = await reader.handle.stat({ bigint: true })
  const after = fileIdentity(info)
  need(
    info.isFile() &&
      (info.mode & 0o7777n) === 0o755n &&
      sameIdentity({ ...before, ctimeNs: after.ctimeNs, mode: after.mode }, after),
    'UNSAFE',
  )
  reader.identity = after
  await assertReader(reader)
  return await inspectReaderImage(reader, { ...expected, identity: after })
}

/** Only the held inode's rename-related ctime may change; never adopt by digest/path alone. */
function adoptMovedReader(reader: Reader, visible: string, filename: string): void {
  const after = fileIdentity(fstatSync(reader.handle.fd, { bigint: true }))
  need(sameIdentity({ ...reader.identity, ctimeNs: after.ctimeNs }, after), 'UNSAFE')
  reader.identity = after
  reader.path = filename
  reader.visible = visible
}

function imageMode(snapshot: FileSnapshot): number {
  return Number(BigInt(snapshot.identity.mode) & 0o7777n)
}

async function requireCopySpace(directory: OwnedDirectory, sizeBytes: number): Promise<void> {
  await directory.check()
  const volume = await fs.statfs(directory.anchor, { bigint: true })
  need(volume.bavail * volume.bsize >= BigInt(sizeBytes), 'FAILED')
}

function assertClosedNow(assertion: () => void): void {
  try {
    if (typeof assertion !== 'function') {
      throw new TypeError('Invalid close assertion.')
    }
    const result: unknown = assertion()
    if (result !== undefined) {
      // A rejected async callback must not become an unhandled rejection, but is never awaited or
      // accepted as a close assertion. Thenables and every other returned value are refused.
      if (result instanceof Promise) {
        void result.catch(() => undefined)
      }
      throw new Error('The close assertion must be synchronous.')
    }
  } catch {
    throw new AppUpdateTransitionError('CLOSE_REQUIRED', 'unchanged')
  }
}

async function inspectMetadata(
  visible: string,
  filename: string,
  expectedBytes: Buffer,
  expected?: FileSnapshot,
): Promise<FileSnapshot> {
  const read = await readMetadata(visible, filename, expected)
  need(read.bytes.equals(expectedBytes), 'UNSAFE')
  return read.snapshot
}

async function readMetadata(
  visible: string,
  filename: string,
  expected?: FileSnapshot,
): Promise<{ bytes: Buffer; snapshot: FileSnapshot }> {
  const reader = await openReader(visible, filename, 0o600)
  try {
    need(reader.identity.sizeBytes <= MAX_METADATA_BYTES, 'UNSAFE')
    need(!expected || sameIdentity(reader.identity, expected.identity), 'UNSAFE')
    const bytes = Buffer.alloc(reader.identity.sizeBytes + 1)
    let count = 0
    while (count < bytes.length) {
      const { bytesRead } = await reader.handle.read(bytes, count, bytes.length - count, count)
      if (!bytesRead) {
        break
      }
      count += bytesRead
    }
    await assertReader(reader)
    need(count === reader.identity.sizeBytes, 'UNSAFE')
    const contents = bytes.subarray(0, count)
    const sha512 = createHash('sha512').update(contents).digest('base64')
    need(!expected || (sha512 === expected.sha512 && count === expected.sizeBytes), 'UNSAFE')
    return {
      bytes: contents,
      snapshot: Object.freeze({ identity: reader.identity, sha512, sizeBytes: count }),
    }
  } finally {
    await reader.handle.close()
  }
}

async function writeJournal(
  staging: OwnedDirectory,
  parent: OwnedDirectory,
  bytes: Buffer,
  previous: FileSnapshot | null,
  member = JOURNAL,
): Promise<FileSnapshot> {
  await parent.check()
  await staging.check()
  need(bytes.length <= MAX_METADATA_BYTES, 'INVALID')
  const temporary = path.join(staging.anchor, `.journal-${randomUUID()}.tmp`)
  const file = await fs.open(temporary, CREATE_FLAGS, 0o600)
  try {
    await file.chmod(0o600)
    await file.writeFile(bytes)
    await file.sync()
  } finally {
    await file.close()
  }
  const visible = path.join(await fs.realpath(staging.anchor), member)
  if (previous) {
    const reader = await openReader(visible, path.join(staging.anchor, member), 0o600)
    try {
      need(sameIdentity(reader.identity, previous.identity), 'UNSAFE')
    } finally {
      await reader.handle.close()
    }
  } else {
    try {
      await fs.lstat(path.join(staging.anchor, member))
      throw new AppUpdateStagingError('UNSAFE')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
  await parent.check()
  await staging.check()
  await fs.rename(temporary, path.join(staging.anchor, member))
  await staging.handle.sync()
  await parent.handle.sync()
  return await inspectMetadata(visible, path.join(staging.anchor, member), bytes)
}

async function markFailed(staging?: OwnedDirectory, parent?: OwnedDirectory): Promise<void> {
  if (!staging || !parent) {
    return
  }
  await parent.check()
  await staging.check()
  const file = await fs.open(path.join(staging.anchor, FAILED), CREATE_FLAGS, 0o600)
  try {
    await file.writeFile(
      canonicalRuntimeReleaseJson({
        code: 'RECOVERY_REQUIRED',
        schemaVersion: 1,
        scope: 'application-update-staging',
        state: 'failed',
      }),
    )
    await file.sync()
  } finally {
    await file.close()
  }
  await staging.handle.sync()
  await parent.handle.sync()
}

function fileIdentity(info: BigIntStats): FileIdentity {
  return Object.freeze({
    ctimeNs: String(info.ctimeNs),
    dev: String(info.dev),
    gid: String(info.gid),
    ino: String(info.ino),
    mode: String(info.mode),
    mtimeNs: String(info.mtimeNs),
    nlink: String(info.nlink),
    sizeBytes: Number(info.size),
    uid: String(info.uid),
  })
}

function sameIdentity(a: FileIdentity, b: FileIdentity): boolean {
  return canonicalRuntimeReleaseJson(a).equals(canonicalRuntimeReleaseJson(b))
}

function sameInode(a: FileIdentity, b: FileIdentity): boolean {
  return a.dev === b.dev && a.ino === b.ino
}

function canonicalPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    path.isAbsolute(value) &&
    path.resolve(value) === value &&
    !value.includes('\0')
  )
}

function freezeJson<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const member of Object.values(value)) {
      freezeJson(member)
    }
    Object.freeze(value)
  }
  return value
}

function need(condition: unknown, code: FailureCode): asserts condition {
  if (!condition) {
    throw new AppUpdateStagingError(code)
  }
}

async function closeReadHandle(handle?: fs.FileHandle): Promise<void> {
  await handle?.close().catch(() => {
    process.emitWarning('Application update staging read handle closure could not be confirmed.')
  })
}
