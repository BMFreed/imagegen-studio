/**
 * InvokeAI4875d96531ca6712b288f6e660fcbb34143408c1: working_memory_calibration_store.py
 * _os_lock/creation_lock/_creation_file and working_memory_calibration_default.py
 * _creation_lock/_file_lock callers; also install_staging_ledger.py _claim_scan_lock ->
 * sweep_stale_claims -> installer.start. Keep one stable lock inode, serialize participating
 * writers and let descriptor lifetime release the kernel lock. Never unlink a lock file: old and
 * new inodes could both be locked.
 *
 * Invoke's Python flock call has no Node equivalent in this stack. The disclosed Linux adapter uses
 * the trusted distribution's fixed util-linux flock on an inherited descriptor, never a shell or
 * pathname argument. This reserves only an explicit cooperating update attempt. It does not
 * establish exclusive application use, inspect other processes, authorize recovery or retirement,
 * or prevent an older/uncooperating writer. Ordinary startup takes no reservation.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as nodeFs from 'node:fs'
import { type BigIntStats, constants } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

export type ApplicationUpdateAdmission = Readonly<{
  assertHeld: () => void
  currentAppImage: string
  release: () => void
}>

type Failure = 'BUSY' | 'UNAVAILABLE'

export class ApplicationUpdateAdmissionError extends Error {
  readonly code: 'APPLICATION_UPDATE_ADMISSION_UNAVAILABLE' | 'APPLICATION_UPDATE_BUSY'

  constructor(readonly reason: Failure) {
    super(
      reason === 'BUSY'
        ? 'Another application update is in progress. Try again after it finishes. Your Projects remain open.'
        : 'Application update installation could not be reserved. Your Projects remain open.',
    )
    this.name = 'ApplicationUpdateAdmissionError'
    this.code =
      reason === 'BUSY' ? 'APPLICATION_UPDATE_BUSY' : 'APPLICATION_UPDATE_ADMISSION_UNAVAILABLE'
  }
}

const TOOL = '/usr/bin/flock'
const DIRECTORY_FLAGS =
  constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const LOCK_FLAGS = constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK

/** Explicit Install admission only. Check, Download, Review and normal startup never call this. */
export function acquireApplicationUpdateAdmission(
  currentAppImage: string,
): ApplicationUpdateAdmission {
  const owned = new Set<number>()
  let released = false
  let failed = false
  let close: ((fd: number) => void) | undefined
  const release = () => {
    released = true
    for (const fd of owned) {
      owned.delete(fd)
      try {
        close!(fd)
      } catch {
        // Never retry closing a possibly reused descriptor; never unlink or unlock by pathname.
      }
    }
  }
  try {
    need(process.platform === 'linux' && process.arch === 'x64' && canonical(currentAppImage))
    // Electron virtualizes ASAR paths; keep physical filesystem admission consistent with the
    // existing current-source owner, with no fallback when original-fs is missing in Electron.
    const raw: typeof nodeFs = process.versions.electron
      ? (createRequire(process.execPath)('original-fs') as typeof nodeFs)
      : nodeFs
    const physical = Object.freeze({
      closeSync: raw.closeSync.bind(raw),
      fchmodSync: raw.fchmodSync.bind(raw),
      fstatSync: raw.fstatSync.bind(raw),
      fsyncSync: raw.fsyncSync.bind(raw),
      lstatSync: raw.lstatSync.bind(raw),
      openSync: raw.openSync.bind(raw),
      realpathSync: raw.realpathSync.bind(raw),
    })
    close = physical.closeSync
    const euid = BigInt(process.geteuid!())
    const toolParent = path.dirname(TOOL)
    const toolBefore = physical.lstatSync(TOOL, { bigint: true })
    const toolParentBefore = physical.lstatSync(toolParent, { bigint: true })
    const assertTool = () => {
      const tool = physical.lstatSync(TOOL, { bigint: true })
      const parent = physical.lstatSync(toolParent, { bigint: true })
      need(
        tool.isFile() &&
          !tool.isSymbolicLink() &&
          tool.uid === 0n &&
          (tool.mode & 0o22n) === 0n &&
          (tool.mode & 0o111n) !== 0n &&
          fileIdentity(tool) === fileIdentity(toolBefore) &&
          parent.isDirectory() &&
          !parent.isSymbolicLink() &&
          parent.uid === 0n &&
          (parent.mode & 0o22n) === 0n &&
          directoryIdentity(parent) === directoryIdentity(toolParentBefore) &&
          physical.realpathSync(TOOL) === TOOL &&
          physical.realpathSync(toolParent) === toolParent,
      )
    }
    assertTool()
    const parentPath = path.dirname(currentAppImage)
    need(physical.realpathSync(parentPath) === parentPath)
    const parentFd = physical.openSync(parentPath, DIRECTORY_FLAGS)
    owned.add(parentFd)
    const parentBefore = physical.fstatSync(parentFd, { bigint: true })
    const assertParent = () => {
      for (const info of [
        physical.fstatSync(parentFd, { bigint: true }),
        physical.lstatSync(parentPath, { bigint: true }),
      ]) {
        need(
          info.isDirectory() &&
            !info.isSymbolicLink() &&
            info.uid === euid &&
            (info.mode & 0o22n) === 0n &&
            (info.mode & 0o300n) === 0o300n &&
            directoryIdentity(info) === directoryIdentity(parentBefore),
        )
      }
      need(physical.realpathSync(parentPath) === parentPath)
    }
    assertParent()
    const name = `.igs-app-update-${createHash('sha256').update(path.basename(currentAppImage)).digest('hex').slice(0, 16)}.lock`
    const visible = path.join(parentPath, name)
    const anchored = path.join(`/proc/self/fd/${parentFd}`, name)
    let lockFd: number
    try {
      lockFd = physical.openSync(anchored, LOCK_FLAGS | constants.O_CREAT | constants.O_EXCL, 0o600)
      owned.add(lockFd)
      // Only this newly created file may be normalized; existing bytes/mode are never repaired.
      physical.fchmodSync(lockFd, 0o600)
      physical.fsyncSync(lockFd)
      physical.fsyncSync(parentFd)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
      lockFd = physical.openSync(anchored, LOCK_FLAGS)
      owned.add(lockFd)
    }
    const lockBefore = physical.fstatSync(lockFd, { bigint: true })
    const assertSnapshot = () => {
      need(!released && !failed)
      assertParent()
      for (const info of [
        physical.fstatSync(lockFd, { bigint: true }),
        physical.lstatSync(anchored, { bigint: true }),
        physical.lstatSync(visible, { bigint: true }),
      ]) {
        need(
          info.isFile() &&
            !info.isSymbolicLink() &&
            info.uid === euid &&
            info.nlink === 1n &&
            info.size === 0n &&
            (info.mode & 0o7777n) === 0o600n &&
            fileIdentity(info) === fileIdentity(lockBefore),
        )
      }
      need(physical.realpathSync(visible) === visible)
    }
    assertSnapshot()
    assertTool()
    // The inherited descriptor shares the parent's open file description. The utility exits;
    // this owner's descriptor continues holding flock until release or physical process exit.
    const result = spawnSync(TOOL, ['--exclusive', '--nonblock', '3'], {
      env: { LANG: 'C', LC_ALL: 'C' },
      shell: false,
      stdio: ['ignore', 'ignore', 'ignore', lockFd],
      timeout: 2000,
    })
    assertTool()
    assertSnapshot()
    if (result.error || result.signal || result.status !== 0) {
      throw new ApplicationUpdateAdmissionError(
        !result.error && !result.signal && result.status === 1 ? 'BUSY' : 'UNAVAILABLE',
      )
    }
    return Object.freeze({
      assertHeld: () => {
        try {
          assertSnapshot()
        } catch {
          failed = true
          throw new ApplicationUpdateAdmissionError('UNAVAILABLE')
        }
      },
      currentAppImage,
      release,
    })
  } catch (error) {
    release()
    throw error instanceof ApplicationUpdateAdmissionError
      ? error
      : new ApplicationUpdateAdmissionError('UNAVAILABLE')
  }
}

function need(condition: unknown): asserts condition {
  if (!condition) {
    throw new ApplicationUpdateAdmissionError('UNAVAILABLE')
  }
}

function canonical(filename: unknown): filename is string {
  return (
    typeof filename === 'string' &&
    !filename.includes('\0') &&
    path.isAbsolute(filename) &&
    path.resolve(filename) === filename &&
    filename !== path.parse(filename).root
  )
}

function fileIdentity(info: BigIntStats): string {
  // atime may change on reads. Locking does not change the frozen metadata below.
  return [
    info.dev,
    info.ino,
    info.mode,
    info.uid,
    info.gid,
    info.nlink,
    info.size,
    info.mtimeNs,
    info.ctimeNs,
  ].join(':')
}

function directoryIdentity(info: BigIntStats): string {
  // Creating a sibling changes directory timestamps, not its admission identity.
  return [info.dev, info.ino, info.mode, info.uid, info.gid].join(':')
}
