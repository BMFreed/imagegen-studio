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
 * successful handshake is not execution/startup acknowledgement. No public Install or
 * crash-recovery/adoption consumer exists here, and no independent helper is introduced.
 */
import { createHash, randomUUID } from 'node:crypto'
import {
  type BigIntStats,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  realpathSync,
  renameSync,
} from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'

import type { ApplicationReleaseManifest } from './application-release.js'
import type { VerifiedApplicationArtifact } from './electron-update-checker.js'

import { canonicalRuntimeReleaseJson } from '../runtime/runtime-release.js'

const DIRECTORY_FLAGS =
  constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const CREATE_FLAGS =
  constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW
const CHUNK_BYTES = 1024 * 1024
const MAX_METADATA_BYTES = 1024 * 1024
const JOURNAL = 'journal.json'
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

/** Main-private stage capability. No caller-provided destination, installer or cleanup authority. */
export async function stageVerifiedApplicationArtifact(input: {
  artifact: VerifiedApplicationArtifact
  currentAppImage: string
}): Promise<StagedApplicationUpdate> {
  need(input && typeof input === 'object', 'INVALID')
  const { artifact, currentAppImage } = input
  need(process.platform === 'linux' && process.arch === 'x64', 'INVALID')
  need(canonicalPath(currentAppImage) && artifact && canonicalPath(artifact.path), 'INVALID')
  need(typeof artifact.verifyCompleteSnapshot === 'function', 'INVALID')
  const sourcePath = artifact.path
  let manifest: ApplicationReleaseManifest
  let manifestBytes: Buffer
  try {
    manifestBytes = canonicalRuntimeReleaseJson(artifact.manifest)
    manifest = freezeJson(JSON.parse(manifestBytes.toString('utf8')) as ApplicationReleaseManifest)
  } catch {
    throw new AppUpdateStagingError('INVALID')
  }
  need(
    manifest &&
      typeof manifest === 'object' &&
      manifest.appId === 'studio.imagegen.desktop' &&
      manifest.scope === 'application-release' &&
      manifest.schemaVersion === 1 &&
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
  const verifyArtifact = artifact.verifyCompleteSnapshot.bind(artifact)
  const assertArtifact = async () => {
    try {
      await verifyArtifact()
    } catch {
      throw new AppUpdateStagingError('INVALID')
    }
    try {
      need(canonicalRuntimeReleaseJson(artifact.manifest).equals(manifestBytes), 'UNSAFE')
      need(artifact.path === sourcePath, 'UNSAFE')
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
    )
    source = await openReader(sourcePath, sourcePath)
    need(source.identity.sizeBytes === manifest.artifact.sizeBytes, 'INVALID')
    need(!sameInode(current.identity, source.identity), 'INVALID')
    await classifyAppImage(source)
    await parent.check()
    await assertArtifact()
    const volume = await fs.statfs(parent.anchor, { bigint: true })
    need(volume.bavail * volume.bsize >= BigInt(manifest.artifact.sizeBytes), 'FAILED')
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
    const base = {
      current: { path: currentAppImage, ...current },
      manifest,
      parent: { path: parentPath, ...parent.identity },
      schemaVersion: 1,
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
  const reader = await openReader(visible, filename, 0o600)
  try {
    need(
      reader.identity.sizeBytes <= MAX_METADATA_BYTES &&
        reader.identity.sizeBytes === expectedBytes.length,
      'UNSAFE',
    )
    need(!expected || sameIdentity(reader.identity, expected.identity), 'UNSAFE')
    const bytes = Buffer.alloc(expectedBytes.length + 1)
    let count = 0
    while (count < bytes.length) {
      const { bytesRead } = await reader.handle.read(bytes, count, bytes.length - count, count)
      if (!bytesRead) {
        break
      }
      count += bytesRead
    }
    await assertReader(reader)
    need(count === expectedBytes.length && bytes.subarray(0, count).equals(expectedBytes), 'UNSAFE')
    const sha512 = createHash('sha512').update(expectedBytes).digest('base64')
    need(!expected || sha512 === expected.sha512, 'UNSAFE')
    return Object.freeze({ identity: reader.identity, sha512, sizeBytes: count })
  } finally {
    await reader.handle.close()
  }
}

async function writeJournal(
  staging: OwnedDirectory,
  parent: OwnedDirectory,
  bytes: Buffer,
  previous: FileSnapshot | null,
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
  const visible = path.join(await fs.realpath(staging.anchor), JOURNAL)
  if (previous) {
    const reader = await openReader(visible, path.join(staging.anchor, JOURNAL), 0o600)
    try {
      need(sameIdentity(reader.identity, previous.identity), 'UNSAFE')
    } finally {
      await reader.handle.close()
    }
  } else {
    try {
      await fs.lstat(path.join(staging.anchor, JOURNAL))
      throw new AppUpdateStagingError('UNSAFE')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
  await parent.check()
  await staging.check()
  await fs.rename(temporary, path.join(staging.anchor, JOURNAL))
  await staging.handle.sync()
  await parent.handle.sync()
  return await inspectMetadata(visible, path.join(staging.anchor, JOURNAL), bytes)
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
