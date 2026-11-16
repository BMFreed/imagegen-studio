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
 * migrations or execution. This owner stages only; it never replaces or executes an application.
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

export interface StagedApplicationUpdate {
  readonly candidatePath: string
  readonly manifest: ApplicationReleaseManifest
  readonly stagingDirectory: string
  verifyCompleteSnapshot: () => Promise<void>
}
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
    await copyCandidate(source, path.join(staging.anchor, CANDIDATE), manifest)
    await assertArtifact()
    await parent.check()
    await staging.check()
    await inspectImage(
      currentAppImage,
      path.join(parent.anchor, path.basename(currentAppImage)),
      0o755,
      current,
    )
    const candidate = await inspectImage(candidatePath, path.join(staging.anchor, CANDIDATE), 0o600)
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
    let retired = false
    const verifyCompleteSnapshot = async () => {
      let visibleParent: OwnedDirectory | undefined
      let visibleStage: OwnedDirectory | undefined
      try {
        need(!retired, 'RECOVERY_REQUIRED')
        await assertArtifact()
        visibleParent = await openDirectory(parentPath, parentIdentity, false)
        visibleStage = await openDirectory(stagingDirectory, stagingIdentity, true)
        need(
          (await fs.readdir(visibleStage.anchor)).sort().join('\0') ===
            [CANDIDATE, JOURNAL].sort().join('\0'),
          'UNSAFE',
        )
        await inspectImage(
          currentAppImage,
          path.join(visibleParent.anchor, path.basename(currentAppImage)),
          0o755,
          current,
        )
        await inspectImage(
          candidatePath,
          path.join(visibleStage.anchor, CANDIDATE),
          0o600,
          candidate,
        )
        await inspectMetadata(
          path.join(stagingDirectory, JOURNAL),
          path.join(visibleStage.anchor, JOURNAL),
          preparedBytes,
          journal,
        )
        await visibleStage.check()
        await visibleParent.check()
        await assertArtifact()
        await closeReadHandle(visibleStage.handle)
        visibleStage = undefined
        await closeReadHandle(visibleParent.handle)
        visibleParent = undefined
        // As in ProjectRelocation's final no-await guard, don't return a snapshot
        // whose earlier file checks were invalidated during the last async hash.
        need(!retired, 'RECOVERY_REQUIRED')
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
          need(
            readdirSync(stageAnchor).sort().join('\0') === [CANDIDATE, JOURNAL].sort().join('\0'),
            'UNSAFE',
          )
          assertFileNow(
            currentAppImage,
            path.join(parentAnchor, path.basename(currentAppImage)),
            current.identity,
          )
          assertFileNow(candidatePath, path.join(stageAnchor, CANDIDATE), candidate.identity)
          assertFileNow(
            path.join(stagingDirectory, JOURNAL),
            path.join(stageAnchor, JOURNAL),
            journal.identity,
          )
        } finally {
          if (stageFd !== undefined) {
            closeSync(stageFd)
          }
          closeSync(parentFd)
        }
      } catch {
        retired = true
        if (!visibleParent) {
          visibleParent = await openDirectory(parentPath, parentIdentity, false).catch(
            () => undefined,
          )
        }
        if (visibleParent && !visibleStage) {
          visibleStage = await openDirectory(stagingDirectory, stagingIdentity, true).catch(
            () => undefined,
          )
        }
        await markFailed(visibleStage, visibleParent).catch(() => undefined)
        throw new AppUpdateStagingError('RECOVERY_REQUIRED')
      } finally {
        if (visibleStage) {
          await closeReadHandle(visibleStage.handle)
        }
        if (visibleParent) {
          await closeReadHandle(visibleParent.handle)
        }
      }
    }
    await closeReadHandle(source.handle)
    source = undefined
    await closeReadHandle(staging.handle)
    staging = undefined
    await closeReadHandle(parent.handle)
    parent = undefined
    await verifyCompleteSnapshot()
    return Object.freeze({ candidatePath, manifest, stagingDirectory, verifyCompleteSnapshot })
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
  } finally {
    await reader.handle.close()
  }
}

async function copyCandidate(
  source: Reader,
  destination: string,
  manifest: ApplicationReleaseManifest,
): Promise<void> {
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
      need(count <= manifest.artifact.sizeBytes, 'UNSAFE')
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
    need(
      count === manifest.artifact.sizeBytes && hash.digest('base64') === manifest.artifact.sha512,
      'UNSAFE',
    )
    await writer.sync()
  } finally {
    await writer.close()
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
