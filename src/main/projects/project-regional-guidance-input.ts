import type {
  IgsProjectAssetRefV1,
  IgsProjectDocumentV1,
  IgsRectV1,
  IgsSmartPatchMaskAssetV1,
} from '../../shared/projects/project-schema.js'
import { parseProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import { createHash } from 'node:crypto'
import {
  type BigIntStats,
  constants,
  lstatSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs'
import { type FileHandle, lstat, mkdir, mkdtemp, open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { isDeepStrictEqual } from 'node:util'
import * as yauzl from 'yauzl'

import type { IgsAssetSource, IgsPackageReadResult } from './igs-package.js'
import type { ProjectRegionalGuidanceCoverage as RegionalGuidanceCoverage } from './project-regional-guidance-coverage.js'

import {
  readIgsPackage,
  regionalReferenceMembers,
  verifyRegionalReferenceAssetSource,
} from './igs-package.js'
import { decodeProjectMaskPng, readProjectMaskSource } from './project-mask.js'
import { withProjectPathLock } from './project-path-lock.js'
import { projectRegionalGuidanceCoverage } from './project-regional-guidance-coverage.js'

/** Collection-wide private staging safeguard, not document or inference capacity. */
export const REGIONAL_INPUT_CAPTURE_MAX_BYTES = 512 * 1024 * 1024

export interface CapturedRegionalGuidanceInput {
  assets: {
    filePath: string
    member: IgsProjectAssetRefV1
    referenceId?: string
    regionId: string
    role: 'image' | 'mask' | 'profile' | 'thumbnail'
  }[]
  projectMask: (regionId: string, target: IgsRectV1) => Promise<RegionalGuidanceCoverage>
  readAsset: (memberPath: string) => Promise<Buffer>
  snapshot: Pick<
    IgsProjectDocumentV1,
    | 'documentId'
    | 'documentRevision'
    | 'generationDraft'
    | 'lastActualSeedSnapshot'
    | 'primaryBbox'
    | 'regionalGuidance'
  >
  stagingRoot: string
}

type Asset = Omit<CapturedRegionalGuidanceInput['assets'][number], 'filePath'>
type FileIdentity = Pick<BigIntStats, 'dev' | 'ino'>
type FileVersion = Pick<BigIntStats, 'ctimeNs' | 'dev' | 'ino' | 'mtimeNs' | 'size'>
interface OwnedFile {
  filePath: string
  identity: FileIdentity
  version: FileVersion
}
interface CapturedMember {
  asset: Asset
  file?: OwnedFile
  index: number
  source: IgsAssetSource | null | undefined
}
interface Stage {
  baseIdentity: FileIdentity
  basePath: string
  identity: FileIdentity
  root: string
}

const COPY_CHUNK_BYTES = 1024 * 1024

interface ObservedArchiveStream {
  settled: Promise<void>
  stream: Readable
}

interface RegionalArchiveState {
  activeStream?: Readable
  error?: Error
}

/**
 * Yauzl borrows one FileHandle. Its close hook releases no descriptor; the enclosing owner closes
 * that handle exactly once, after every observed range/member stream has settled.
 */
class BorrowedRegionalArchiveReader extends yauzl.RandomAccessReader {
  private acceptingReads = true
  private readonly ranges = new Map<Readable, Promise<void>>()
  private readonly reads = new Set<Promise<void>>()

  constructor(private readonly source: FileHandle) {
    super()
  }

  override _readStreamForRange(start: number, end: number): Readable {
    const readRange = async function* (reader: BorrowedRegionalArchiveReader) {
      if (!reader.acceptingReads) {
        throw new Error('The pinned regional archive reader is closed.')
      }
      let position = start
      while (position < end) {
        const bytes = Buffer.allocUnsafe(Math.min(COPY_CHUNK_BYTES, end - position))
        const result = await reader.source.read(bytes, 0, bytes.length, position)
        if (result.bytesRead === 0) {
          throw new Error('The pinned regional archive was truncated.')
        }
        position += result.bytesRead
        yield bytes.subarray(0, result.bytesRead)
      }
    }
    const stream = Readable.from(readRange(this), { objectMode: false })
    const settled = finished(stream)
    this.ranges.set(stream, settled)
    const remove = () => {
      this.ranges.delete(stream)
    }
    void settled.then(remove, remove)
    return stream
  }

  override close(callback: (error: Error | null) => void): void {
    this.acceptingReads = false
    callback(null)
  }

  async drain(): Promise<void> {
    this.acceptingReads = false
    const ranges = [...this.ranges]
    for (const [stream] of ranges) {
      stream.destroy()
    }
    await Promise.allSettled([...this.reads, ...ranges.map(([, settled]) => settled)])
  }

  override read(
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
    callback: (error: Error | null) => void,
  ): void {
    // Central/local headers use direct positional reads, with no unobserved helper streams.
    const operation = this.readExactly(buffer, offset, length, position)
    this.reads.add(operation)
    void operation.then(
      () => {
        this.reads.delete(operation)
        callback(null)
      },
      (error: unknown) => {
        this.reads.delete(operation)
        callback(error instanceof Error ? error : new Error(String(error)))
      },
    )
  }

  private async readExactly(
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
  ): Promise<void> {
    if (!this.acceptingReads) {
      throw new Error('The pinned regional archive reader is closed.')
    }
    let read = 0
    while (read < length) {
      const result = await this.source.read(buffer, offset + read, length - read, position + read)
      if (result.bytesRead === 0) {
        throw new Error('The pinned regional archive was truncated.')
      }
      read += result.bytesRead
    }
  }
}

/** Authored state and independent files only; this lease grants no generation admission. */
export async function withFrozenRegionalGuidanceInput<T>(
  input: {
    assertCurrent?: () => void
    document: IgsProjectDocumentV1
    packagePath: string
    pendingSource: (member: IgsProjectAssetRefV1) => IgsAssetSource | null
    scratchBasePath: string
  },
  use: (capture: CapturedRegionalGuidanceInput) => Promise<T>,
): Promise<T> {
  // All caller-owned metadata and pending buffers detach before the first filesystem await.
  const document = parseProjectDocumentV1(structuredClone(input.document))
  const { assertCurrent, packagePath, pendingSource, scratchBasePath } = input
  const assets = regionalAssets(document)
  const members = new Map<string, CapturedMember>()
  let totalBytes = 0
  for (const asset of assets) {
    const previous = members.get(asset.member.path)
    if (previous) {
      if (
        previous.asset.role !== asset.role ||
        !isDeepStrictEqual(previous.asset.member, asset.member)
      ) {
        throw new Error('Captured regional members have conflicting roles or descriptors.')
      }
      continue
    }
    totalBytes += asset.member.bytes
    if (!Number.isSafeInteger(totalBytes) || totalBytes > REGIONAL_INPUT_CAPTURE_MAX_BYTES) {
      throw new Error('Regional input capture exceeds the 512 MiB staging limit.')
    }
    members.set(asset.member.path, { asset, index: members.size, source: undefined })
  }
  // Preflight the complete collection before asking for sources or creating staging.
  for (const entry of members.values()) {
    const source = pendingSource(structuredClone(entry.asset.member))
    if (source && 'bytes' in source) {
      if (!Buffer.isBuffer(source.bytes) || source.bytes.length !== entry.asset.member.bytes) {
        throw new Error('The pending regional member differs from its captured descriptor.')
      }
      entry.source = { bytes: Buffer.from(source.bytes) }
    } else {
      entry.source = source ? { sourcePath: source.sourcePath } : null
    }
  }
  assertAbsolutePath(scratchBasePath)
  assertAbsolutePath(packagePath)
  await mkdir(scratchBasePath, { recursive: true })
  const baseIdentity = await canonicalDirectory(scratchBasePath)
  const root = await mkdtemp(path.join(scratchBasePath, 'regional-input-'))
  const ownedFiles: OwnedFile[] = []
  let stage: Stage | undefined
  let rootHandle: Awaited<ReturnType<typeof open>> | undefined
  let leaseOpen = false
  const operations = new Set<Promise<unknown>>()
  try {
    // Keep this inode pinned until cleanup; a removed directory cannot be recreated as its owner.
    rootHandle = await open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    stage = {
      baseIdentity,
      basePath: scratchBasePath,
      identity: await rootHandle.stat({ bigint: true }),
      root,
    }
    const capturedStage = stage
    await assertStage(capturedStage)
    const saved = [...members.values()].filter((entry) => entry.source === null)
    for (const entry of members.values()) {
      if (entry.source) {
        const destination = path.join(root, `member-${entry.index}.asset`)
        entry.file = await copyPendingMember(entry, destination, capturedStage, ownedFiles)
        entry.source = undefined
      }
    }
    if (saved.length > 0) {
      // One package lock/read covers every saved dependency, including shared original ICCs.
      await withProjectPathLock(packagePath, () =>
        withPinnedRegionalArchive(packagePath, async (archive, zip, state, assertSource) => {
          if (archive.project.documentId !== document.documentId) {
            throw new Error('The saved Project identity changed before regional input capture.')
          }
          assertSavedOwners(document, archive.project, assets, members)
          const entries = new Map<string, yauzl.Entry>()
          const wanted = new Map(saved.map((entry) => [entry.asset.member.path, entry]))
          // Enumerate metadata without yielding to copy work while the iterator owns ZIP errors.
          for await (const entry of zip.eachEntry()) {
            const captured = wanted.get(entry.fileName)
            if (!captured) {
              continue
            }
            assertSavedEntry(entry, captured.asset.member)
            if (entries.has(entry.fileName)) {
              throw new Error('The pinned regional archive contains a duplicate captured member.')
            }
            entries.set(entry.fileName, entry)
          }
          await assertSource()
          if (entries.size !== wanted.size) {
            throw new Error('The pinned regional archive is missing a captured member.')
          }
          for (const entry of saved) {
            await copySavedMember(
              entry,
              entries.get(entry.asset.member.path)!,
              zip,
              state,
              assertSource,
              capturedStage,
              ownedFiles,
            )
            entry.source = undefined
          }
        }),
      )
    }
    for (const entry of members.values()) {
      await assertLeasedFile(entry.file!, capturedStage)
    }
    // A caller cannot replace these baselines by mutating the DTO handed to its callback.
    const regions = new Map((document.regionalGuidance ?? []).map((region) => [region.id, region]))
    const readCapturedAsset = async (memberPath: string): Promise<Buffer> => {
      const entry = members.get(memberPath)
      if (!entry?.file) {
        throw new Error('The regional member is not part of this captured lease.')
      }
      await assertLeasedFile(entry.file, capturedStage)
      const bytes = await readExactFile(entry.file, entry.asset.member.bytes)
      await verifyMemberBytes(entry.asset, bytes)
      await assertLeasedFile(entry.file, capturedStage)
      return bytes
    }
    const startOperation = <R>(run: () => Promise<R>): Promise<R> => {
      if (!leaseOpen) {
        return Promise.reject(new Error('The regional input capture lease is closed.'))
      }
      const operation = run()
      operations.add(operation)
      const settled = () => {
        operations.delete(operation)
      }
      void operation.then(settled, settled)
      return operation
    }
    const capture: CapturedRegionalGuidanceInput = {
      assets: assets.map((asset) => ({
        ...structuredClone(asset),
        filePath: members.get(asset.member.path)!.file!.filePath,
      })),
      projectMask: (regionId, target) =>
        startOperation(async () => {
          const capturedTarget = structuredClone(target)
          const region = regions.get(regionId)
          if (!region) {
            throw new Error('The region is not part of this captured lease.')
          }
          if (!region.mask.asset) {
            return projectRegionalGuidanceCoverage(null, capturedTarget)
          }
          const bytes = await readCapturedAsset(region.mask.asset.path)
          return projectRegionalGuidanceCoverage(
            {
              alpha: decodeProjectMaskPng(bytes, region.mask.asset),
              bounds: { ...region.mask.bounds },
            },
            capturedTarget,
          )
        }),
      readAsset: (memberPath) => startOperation(() => readCapturedAsset(memberPath)),
      snapshot: structuredClone({
        documentId: document.documentId,
        documentRevision: document.documentRevision,
        generationDraft: document.generationDraft,
        lastActualSeedSnapshot: document.lastActualSeedSnapshot,
        primaryBbox: document.primaryBbox,
        ...(Object.hasOwn(document, 'regionalGuidance')
          ? { regionalGuidance: document.regionalGuidance }
          : {}),
      }),
      stagingRoot: root,
    }
    assertCurrent?.()
    leaseOpen = true
    return await use(capture)
  } finally {
    leaseOpen = false
    // A failed/finished callback may still have a started read or projection using owned files.
    await Promise.allSettled(operations)
    if (stage) {
      await cleanupStage(stage, ownedFiles)
    }
    await rootHandle?.close().catch(reportCleanupFailure)
  }
}

function regionalAssets(document: IgsProjectDocumentV1): Asset[] {
  return (document.regionalGuidance ?? []).flatMap((region) => [
    ...(region.mask.asset
      ? [{ member: structuredClone(region.mask.asset), regionId: region.id, role: 'mask' as const }]
      : []),
    ...(region.referenceImages ?? []).flatMap((reference) =>
      regionalReferenceMembers(reference).map(({ member, role }) => ({
        member: structuredClone(member),
        referenceId: reference.id,
        regionId: region.id,
        role,
      })),
    ),
  ])
}

function assertSavedOwners(
  captured: IgsProjectDocumentV1,
  saved: IgsProjectDocumentV1,
  assets: Asset[],
  members: Map<string, CapturedMember>,
): void {
  const savedAssets = regionalAssets(saved)
  const ownerKey = (asset: Asset): string =>
    `${asset.regionId}:${asset.referenceId ?? ''}:${asset.role}`
  const owners = new Map(savedAssets.map((asset) => [ownerKey(asset), asset]))
  const capturedMaskIds = new Map(
    (captured.regionalGuidance ?? []).map((region) => [region.id, region.mask.id]),
  )
  const savedMaskIds = new Map(
    (saved.regionalGuidance ?? []).map((region) => [region.id, region.mask.id]),
  )
  // Original ICCs are globally immutable and may already be owned by another ref or Raster.
  const profiles = new Map(
    [
      ...saved.layers.flatMap((layer) =>
        layer.kind === 'raster' && layer.sourceIccProfile ? [layer.sourceIccProfile] : [],
      ),
      ...savedAssets.filter((asset) => asset.role === 'profile').map((asset) => asset.member),
    ].map((profile) => [profile.path, profile]),
  )
  for (const asset of assets) {
    if (members.get(asset.member.path)?.source !== null) {
      continue
    }
    if (asset.role === 'profile') {
      if (isDeepStrictEqual(profiles.get(asset.member.path), asset.member)) {
        continue
      }
    } else {
      const owned = owners.get(ownerKey(asset))
      if (
        owned &&
        isDeepStrictEqual(owned.member, asset.member) &&
        // World placement/revision may change without changing the immutable PNG member.
        (asset.role !== 'mask' ||
          capturedMaskIds.get(asset.regionId) === savedMaskIds.get(asset.regionId))
      ) {
        continue
      }
    }
    throw new Error('The saved regional member no longer has its captured owner and descriptor.')
  }
}

async function withPinnedRegionalArchive<T>(
  packagePath: string,
  use: (
    archive: IgsPackageReadResult,
    zip: yauzl.ZipFile,
    state: RegionalArchiveState,
    assertSource: () => Promise<void>,
  ) => Promise<T>,
): Promise<T> {
  const version = await canonicalFile(packagePath)
  const source = await open(
    packagePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  const reader = new BorrowedRegionalArchiveReader(source)
  const state: RegionalArchiveState = {}
  let zip: yauzl.ZipFile | undefined
  let zipClosed: Promise<void> | undefined
  let failed = false
  const assertSource = async (): Promise<void> => {
    if (state.error) {
      throw state.error
    }
    if (
      !sameVersion(await source.stat({ bigint: true }), version) ||
      !sameVersion(await canonicalFile(packagePath), version)
    ) {
      throw new Error('The saved Project package changed during regional input capture.')
    }
    if (state.error) {
      throw state.error
    }
  }
  try {
    await assertSource()
    const archive = await readIgsPackage(packagePath)
    await assertSource()
    zip = await yauzl.fromRandomAccessReaderPromise(reader, Number(version.size), {
      autoClose: false,
      decodeStrings: true,
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    })
    zipClosed = new Promise<void>((resolve) => {
      zip!.once('close', resolve)
    })
    zip.on('error', (error: Error) => {
      state.error ??= error
      state.activeStream?.destroy(error)
    })
    await assertSource()
    const result = await use(archive, zip, state, assertSource)
    await assertSource()
    return result
  } catch (error) {
    failed = true
    throw error
  } finally {
    const cleanupErrors: unknown[] = []
    let zipCloseRequested = false
    try {
      zip?.close()
      zipCloseRequested = true
    } catch (error) {
      cleanupErrors.push(error)
    }
    try {
      await reader.drain()
      if (zipCloseRequested) {
        await zipClosed
      }
    } catch (error) {
      cleanupErrors.push(error)
    }
    try {
      await source.close()
    } catch (error) {
      cleanupErrors.push(error)
    }
    if (!failed && (state.error || cleanupErrors.length > 0)) {
      throw state.error ?? cleanupErrors[0]
    }
    for (const error of cleanupErrors) {
      reportCleanupFailure(error)
    }
  }
}

function assertSavedEntry(entry: yauzl.Entry, member: IgsProjectAssetRefV1): void {
  const fileType = (entry.externalFileAttributes >>> 16) & 0xff_ff & 0o17_0000
  if (
    entry.fileName !== member.path ||
    entry.uncompressedSize !== member.bytes ||
    entry.fileName.endsWith('/') ||
    (fileType !== 0 && fileType !== 0o10_0000) ||
    entry.isEncrypted() ||
    !entry.canDecodeFileData() ||
    (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)
  ) {
    throw new Error('The pinned regional ZIP entry differs from its captured descriptor.')
  }
}

function observeSavedStream(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  state: RegionalArchiveState,
): Promise<ObservedArchiveStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(error)
        return
      }
      // Observe errors/settlement in the opening callback, before handing off the paused stream.
      const settled = finished(stream)
      void settled.catch(() => undefined)
      stream.on('error', (streamError: Error) => {
        state.error ??= streamError
      })
      state.activeStream = stream
      if (state.error) {
        stream.destroy(state.error)
      }
      resolve({ settled, stream })
    })
  })
}

async function copySavedMember(
  entry: CapturedMember,
  zipEntry: yauzl.Entry,
  zip: yauzl.ZipFile,
  state: RegionalArchiveState,
  assertSource: () => Promise<void>,
  stage: Stage,
  owned: OwnedFile[],
): Promise<void> {
  await assertSource()
  await assertStage(stage)
  const destination = path.join(stage.root, `member-${entry.index}.asset`)
  const writer = await open(
    destination,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600,
  )
  let file: OwnedFile | undefined
  let input: ObservedArchiveStream | undefined
  try {
    const identity = await writer.stat({ bigint: true })
    file = { filePath: destination, identity, version: identity }
    owned.push(file)
    entry.file = file
    await assertLeasedFile(file, stage)
    input = await observeSavedStream(zip, zipEntry, state)
    await assertSource()
    let copied = 0
    const hash = createHash('sha256')
    for await (const chunk of input.stream) {
      if (!Buffer.isBuffer(chunk)) {
        throw new TypeError('The regional archive stream returned non-binary input.')
      }
      copied += chunk.length
      if (copied > entry.asset.member.bytes) {
        throw new Error('The saved regional member exceeded its captured byte count.')
      }
      hash.update(chunk)
      let written = 0
      while (written < chunk.length) {
        const result = await writer.write(chunk, written, chunk.length - written)
        if (result.bytesWritten === 0) {
          throw new Error('The saved regional copy could not make progress.')
        }
        written += result.bytesWritten
      }
    }
    await input.settled
    if (copied !== entry.asset.member.bytes || hash.digest('hex') !== entry.asset.member.sha256) {
      throw new Error('The saved regional member failed copied-byte integrity verification.')
    }
    await assertSource()
  } finally {
    if (input) {
      input.stream.destroy()
      await input.settled.catch(() => undefined)
      if (state.activeStream === input.stream) {
        state.activeStream = undefined
      }
    }
    if (file) {
      await writer.stat({ bigint: true }).then((version) => {
        file!.version = version
      }, reportCleanupFailure)
    }
    await writer.close().catch(reportCleanupFailure)
  }
  await verifyLeasedMember(entry, stage)
  await assertSource()
}

async function copyPendingMember(
  entry: CapturedMember,
  destination: string,
  stage: Stage,
  owned: OwnedFile[],
): Promise<OwnedFile> {
  const source = entry.source!
  const { member } = entry.asset
  if ('sourcePath' in source) {
    await assertCanonicalFile(source.sourcePath)
  }
  await assertStage(stage)
  const writer = await open(
    destination,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600,
  )
  let file: OwnedFile | undefined
  try {
    const identity = await writer.stat({ bigint: true })
    file = { filePath: destination, identity, version: identity }
    owned.push(file)
    if ('bytes' in source) {
      await writer.writeFile(source.bytes)
    } else {
      const reader = await open(
        source.sourcePath,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      )
      try {
        const before = await reader.stat({ bigint: true })
        if (!before.isFile() || before.size !== BigInt(member.bytes)) {
          throw new Error('The pending regional source differs from its captured size.')
        }
        const chunk = Buffer.allocUnsafe(COPY_CHUNK_BYTES)
        let copied = 0
        const hash = createHash('sha256')
        for (;;) {
          const { bytesRead } = await reader.read(chunk, 0, chunk.length, null)
          if (bytesRead === 0) {
            break
          }
          copied += bytesRead
          if (copied > member.bytes) {
            throw new Error('The pending regional source grew during capture.')
          }
          hash.update(chunk.subarray(0, bytesRead))
          let written = 0
          while (written < bytesRead) {
            const result = await writer.write(chunk, written, bytesRead - written)
            if (result.bytesWritten === 0) {
              throw new Error('The regional input copy could not make progress.')
            }
            written += result.bytesWritten
          }
        }
        const after = await reader.stat({ bigint: true })
        const current = await canonicalFile(source.sourcePath)
        if (
          copied !== member.bytes ||
          hash.digest('hex') !== member.sha256 ||
          !sameVersion(before, after) ||
          !sameVersion(before, current)
        ) {
          throw new Error('The pending regional source changed during capture.')
        }
      } finally {
        await reader.close().catch(reportCleanupFailure)
      }
    }
  } finally {
    if (file) {
      await writer.stat({ bigint: true }).then((version) => {
        file!.version = version
      }, reportCleanupFailure)
    }
    await writer.close().catch(reportCleanupFailure)
  }
  entry.file = file
  await verifyLeasedMember(entry, stage)
  return file
}

async function verifyLeasedMember(entry: CapturedMember, stage: Stage): Promise<void> {
  const file = entry.file!
  await assertLeasedFile(file, stage)
  await (entry.asset.role === 'mask'
    ? readProjectMaskSource(
        { sourcePath: file.filePath },
        entry.asset.member as IgsSmartPatchMaskAssetV1,
      )
    : verifyRegionalReferenceAssetSource(
        { sourcePath: file.filePath },
        entry.asset.member,
        entry.asset.role,
      ))
  await assertLeasedFile(file, stage)
}

async function verifyMemberBytes(asset: Asset, bytes: Buffer): Promise<void> {
  await (asset.role === 'mask'
    ? readProjectMaskSource({ bytes }, asset.member as IgsSmartPatchMaskAssetV1)
    : verifyRegionalReferenceAssetSource({ bytes }, asset.member, asset.role))
}

async function readExactFile(file: OwnedFile, expectedBytes: number): Promise<Buffer> {
  const reader = await open(
    file.filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const before = await reader.stat({ bigint: true })
    if (
      !before.isFile() ||
      !sameVersion(before, file.version) ||
      before.size !== BigInt(expectedBytes)
    ) {
      throw new Error('The leased regional member changed before reading.')
    }
    const bytes = Buffer.alloc(expectedBytes)
    let offset = 0
    while (offset < bytes.length) {
      const result = await reader.read(
        bytes,
        offset,
        Math.min(COPY_CHUNK_BYTES, bytes.length - offset),
        null,
      )
      if (result.bytesRead === 0) {
        throw new Error('The leased regional member was truncated.')
      }
      offset += result.bytesRead
    }
    if (!sameVersion(before, await reader.stat({ bigint: true }))) {
      throw new Error('The leased regional member changed while reading.')
    }
    return bytes
  } finally {
    await reader.close().catch(reportCleanupFailure)
  }
}

function assertAbsolutePath(filePath: string): void {
  if (!path.isAbsolute(filePath) || path.resolve(filePath) !== filePath) {
    throw new Error('Regional input paths must be canonical and absolute.')
  }
}

async function canonicalDirectory(directory: string): Promise<BigIntStats> {
  const entry = await lstat(directory, { bigint: true })
  if (!entry.isDirectory() || entry.isSymbolicLink() || (await realpath(directory)) !== directory) {
    throw new Error('The regional input staging directory is unsafe.')
  }
  return entry
}

async function canonicalFile(filePath: string): Promise<BigIntStats> {
  assertAbsolutePath(filePath)
  const entry = await lstat(filePath, { bigint: true })
  if (!entry.isFile() || entry.isSymbolicLink() || (await realpath(filePath)) !== filePath) {
    throw new Error('The regional input source is not a canonical regular file.')
  }
  return entry
}

async function assertCanonicalFile(filePath: string): Promise<void> {
  await canonicalFile(filePath)
}

async function assertStage(stage: Stage): Promise<void> {
  if (
    !sameIdentity(await canonicalDirectory(stage.basePath), stage.baseIdentity) ||
    !sameIdentity(await canonicalDirectory(stage.root), stage.identity)
  ) {
    throw new Error('The regional input staging directory was replaced.')
  }
}

async function assertLeasedFile(file: OwnedFile, stage: Stage): Promise<void> {
  await assertStage(stage)
  const current = await canonicalFile(file.filePath)
  if (current.nlink !== 1n || !sameVersion(current, file.version)) {
    throw new Error('The leased regional member was replaced or changed.')
  }
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function sameVersion(left: FileVersion, right: FileVersion): boolean {
  return (
    sameIdentity(left, right) &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  )
}

/** Final checks and the destructive syscall share one Main turn; no awaited pathname evidence. */
function assertCleanupStageNow(stage: Stage, filePath?: string): void {
  for (const pathname of [stage.basePath, stage.root, ...(filePath ? [filePath] : [])]) {
    if (realpathSync(pathname) !== pathname) {
      throw new Error('The regional input cleanup path is no longer canonical.')
    }
  }
  const base = lstatSync(stage.basePath, { bigint: true })
  const root = lstatSync(stage.root, { bigint: true })
  if (
    !base.isDirectory() ||
    base.isSymbolicLink() ||
    !root.isDirectory() ||
    root.isSymbolicLink() ||
    !sameIdentity(base, stage.baseIdentity) ||
    !sameIdentity(root, stage.identity)
  ) {
    throw new Error('The regional input cleanup directory was replaced.')
  }
}

function unlinkOwnedNow(stage: Stage, file: OwnedFile): void {
  assertCleanupStageNow(stage, file.filePath)
  const current = lstatSync(file.filePath, { bigint: true })
  if (
    !current.isFile() ||
    current.isSymbolicLink() ||
    current.nlink !== 1n ||
    !sameIdentity(current, file.identity) ||
    !sameVersion(current, file.version)
  ) {
    throw new Error('The regional input cleanup file was replaced or changed.')
  }
  unlinkSync(file.filePath)
}

function removeOwnedStageNow(stage: Stage): void {
  assertCleanupStageNow(stage)
  rmdirSync(stage.root)
}

/** Exact owned files only: foreign entries or a replaced directory are never recursively removed. */
async function cleanupStage(stage: Stage, files: OwnedFile[]): Promise<void> {
  for (const file of [...files].reverse()) {
    try {
      await assertLeasedFile(file, stage)
      unlinkOwnedNow(stage, file)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        reportCleanupFailure(error)
      }
    }
  }
  try {
    await assertStage(stage)
    removeOwnedStageNow(stage)
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      reportCleanupFailure(error)
    }
  }
}

function reportCleanupFailure(error: unknown): void {
  process.emitWarning(`Regional input capture cleanup retained owned staging: ${String(error)}`)
}
