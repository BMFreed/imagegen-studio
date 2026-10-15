import { createHash, randomUUID } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import { link, lstat, mkdir, open, readdir, realpath, rmdir, unlink } from 'node:fs/promises'
import path from 'node:path'

import {
  parseFrozenSmartPatchInputV1,
  parseSmartPatchInputMaterial,
  type SmartPatchInputMaterial,
} from './smart-patch-frozen-input.js'

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/
const MAX_MANIFEST_BYTES = 128 * 1024
const MANIFEST = 'manifest.json'

export interface SmartPatchInputBundle extends SmartPatchInputMaterial {
  id: string
  /** Identity of the exact committed manifest bytes, suitable for an explicit exact discard. */
  manifestSha256: string
}
export type SmartPatchInputBundleNamespace = 'prepared' | 'queue'
/** Fault hooks surround actual filesystem boundaries; no fake storage replaces the repository. */
export interface SmartPatchInputBundleTestHooks {
  afterManifestPublication?: (input: { bundlePath: string; id: string }) => Promise<void>
  beforeDirectorySync?: (input: {
    directory: string
    id: string
    phase: SyncPhase
  }) => Promise<void>
  beforeDiscardCommit?: (input: { bundlePath: string; id: string }) => Promise<void>
  beforeFileSync?: (input: { filePath: string; id: string }) => Promise<void>
  beforeManifestPublication?: (input: { bundlePath: string; id: string }) => Promise<void>
  createId?: () => string
}
type FileIdentity = Pick<BigIntStats, 'dev' | 'ino'>
type ReadWitness = Pick<BigIntStats, 'ctimeNs' | 'dev' | 'ino' | 'mtimeNs' | 'size'>
type OwnedFile = { identity: FileIdentity; path: string; witness?: ReadWitness }

type BundleOwnership = {
  bundle: SmartPatchInputBundle
  directory: FileIdentity
  files: OwnedFile[]
}

type SyncPhase = 'commit-directory' | 'commit-parent' | 'discard-parent' | 'layout' | 'prepared'

export class SmartPatchInputBundleError extends Error {
  constructor(
    readonly code:
      | 'SMART_PATCH_INPUT_INVALID'
      | 'SMART_PATCH_INPUT_NOT_FOUND'
      | 'SMART_PATCH_INPUT_PUBLICATION_UNCERTAIN'
      | 'SMART_PATCH_INPUT_STORAGE_FAILURE'
      | 'SMART_PATCH_INPUT_STORAGE_UNSAFE',
    message: string,
    readonly identity?: { id: string; manifestSha256: string },
  ) {
    super(message)
    this.name = 'SmartPatchInputBundleError'
  }
}

/**
 * Private prepared input owner, outside queue startup's generation-inputs sweep. A bundle becomes
 * visible only at exclusive manifest publication; it is never a SQL job or a recovery session.
 */
export class SmartPatchInputBundleRepository {
  private pending: Promise<void> = Promise.resolve()
  private readonly root: string

  constructor(
    private readonly dataRoot: string,
    private readonly hooks: SmartPatchInputBundleTestHooks = {},
    namespace: SmartPatchInputBundleNamespace = 'prepared',
  ) {
    if (!path.isAbsolute(dataRoot) || path.resolve(dataRoot) !== dataRoot) {
      throw unsafe('The application data root must be canonical and absolute.')
    }
    if (namespace !== 'prepared' && namespace !== 'queue') {
      throw unsafe('The Smart Patch input namespace is invalid.')
    }
    this.root = path.join(
      dataRoot,
      namespace === 'queue' ? 'generation-queued-inputs' : 'generation-prepared-inputs',
      'smart-patch',
    )
  }

  /** Exact explicit discard only. Missing/corrupt/replaced or foreign bundles are never swept. */
  async discard(id: string, expectedManifestSha256?: string): Promise<void> {
    validateId(id)
    if (expectedManifestSha256 !== undefined && !SHA256.test(expectedManifestSha256)) {
      throw invalid('The expected manifest identity is invalid.')
    }
    await this.serialize(async () => {
      await this.storageRoot(false, id)
      const bundlePath = path.join(this.root, id)
      const { bundle: verified, directory, files } = await this.readBundleOwnership(id)
      if (
        expectedManifestSha256 !== undefined &&
        verified.manifestSha256 !== expectedManifestSha256
      ) {
        throw invalid('The bundle no longer has the expected manifest identity.')
      }
      await this.hooks.beforeDiscardCommit?.({ bundlePath, id })
      // Bind cleanup to the exact read versions, including in-place writes retaining the inode.
      for (const file of files) {
        await assertQualifiedFile(file)
      }
      await assertDirectoryIdentity(bundlePath, directory)
      await assertExactNames(
        bundlePath,
        files.map((file) => path.basename(file.path)),
      )
      // Remove the commit marker first. An interrupted explicit discard cannot load as complete.
      const manifest = files.find((file) => path.basename(file.path) === MANIFEST)!
      await unlinkExact(manifest)
      for (const file of files) {
        if (file !== manifest) {
          await assertDirectoryIdentity(bundlePath, directory)
          await unlinkExact(file)
        }
      }
      await assertDirectoryIdentity(bundlePath, directory)
      await rmdir(bundlePath)
      await this.syncDirectory(this.root, id, 'discard-parent')
    })
  }

  /**
   * Enumerate direct committed-looking identities only, without following links or changing disk.
   * This is not qualification or permission to delete: queue GC must load and exact-discard each
   * unreferenced bundle. Unknown, partial and crash-window entries remain retained for review.
   */
  async listIds(): Promise<string[]> {
    return await this.serialize(async () => {
      try {
        await this.storageRoot(false, '')
      } catch (error) {
        if (
          error instanceof SmartPatchInputBundleError &&
          error.code === 'SMART_PATCH_INPUT_NOT_FOUND'
        ) {
          return []
        }
        throw error
      }
      const root = await ownedDirectory(this.root)
      const ids: string[] = []
      for (const name of await readdir(this.root)) {
        if (!UUID.test(name)) {
          continue
        }
        const directory = path.join(this.root, name)
        try {
          const identity = await ownedDirectory(directory)
          const manifest = await ownedRegularFile(path.join(directory, MANIFEST))
          if (manifest.size < 1n || manifest.size > BigInt(MAX_MANIFEST_BYTES)) {
            continue
          }
          await assertDirectoryIdentity(directory, identity)
          ids.push(name)
        } catch (error) {
          if (error instanceof SmartPatchInputBundleError || hasCode(error, 'ENOENT')) {
            continue
          }
          throw error
        }
      }
      await assertDirectoryIdentity(this.root, root)
      return ids.sort()
    })
  }

  /** Fresh descriptor reads, exact file set and full pixel qualification; no in-memory cache. */
  async load(id: string): Promise<SmartPatchInputBundle> {
    validateId(id)
    return await this.serialize(async () => {
      await this.storageRoot(false, id)
      return await this.readBundle(id)
    })
  }

  /** No current Project, caller-owned buffers or model files are consulted after admission. */
  async publish(input: SmartPatchInputMaterial): Promise<SmartPatchInputBundle> {
    const captured = captureMaterial(input)
    const material = await qualifiedMaterial(captured.manifest, captured.files)
    const bytes = Buffer.from(JSON.stringify(material.manifest), 'utf8')
    if (bytes.length < 1 || bytes.length > MAX_MANIFEST_BYTES) {
      throw invalid('The Smart Patch manifest exceeds its durable metadata limit.')
    }
    const manifestSha256 = digest(bytes)
    return await this.serialize(async () => {
      const id = this.hooks.createId?.() ?? randomUUID()
      validateId(id)
      await this.storageRoot(true, id)
      const bundlePath = path.join(this.root, id)
      const temporaryManifest = path.join(this.root, `.${id}-manifest-${randomUUID()}.tmp`)
      const ownedFiles: OwnedFile[] = []
      let directory: FileIdentity | undefined
      let committed = false
      try {
        // mkdir is an exclusive reservation. Directory rename alone is not NOREPLACE on Linux.
        await mkdir(bundlePath, { mode: 0o700 })
        directory = await ownedDirectory(bundlePath)
        for (const [name, content] of Object.entries(material.files)) {
          await this.writeDurable(path.join(bundlePath, name), content, id, ownedFiles)
        }
        await this.writeDurable(temporaryManifest, bytes, id, ownedFiles)
        await this.syncDirectory(bundlePath, id, 'prepared')
        await this.hooks.beforeManifestPublication?.({ bundlePath, id })
        await assertDirectoryIdentity(bundlePath, directory)
        await assertExactNames(bundlePath, Object.keys(material.files))
        for (const file of ownedFiles) {
          if (!sameIdentity(await ownedRegularFile(file.path), file.identity)) {
            throw unsafe('A prepared input file was replaced before publication.')
          }
        }
        const manifestPath = path.join(bundlePath, MANIFEST)
        // The exclusive hard link is the sole commit marker; existing names are never replaced.
        await link(temporaryManifest, manifestPath)
        committed = true
        await this.hooks.afterManifestPublication?.({ bundlePath, id })
        await unlinkExact(ownedFiles.find((file) => file.path === temporaryManifest)!)
        await this.syncDirectory(bundlePath, id, 'commit-directory')
        await this.syncDirectory(this.root, id, 'commit-parent')
        return await this.readBundle(id)
      } catch (error) {
        if (committed) {
          // The commit marker may be durable even if its directory sync failed. Never turn an
          // uncertain commit into data loss by deleting it or reporting an ordinary failed write.
          const temporary = ownedFiles.find((file) => file.path === temporaryManifest)
          if (temporary) {
            await unlinkExact(temporary).catch(() => undefined)
          }
          throw uncertain(id, manifestSha256)
        }
        const cleaned = await cleanupOwnedReservation(bundlePath, directory, ownedFiles)
        if (!cleaned) {
          throw uncertain(id, manifestSha256)
        }
        if (error instanceof SmartPatchInputBundleError) {
          throw error
        }
        if (hasCode(error, 'EEXIST')) {
          throw unsafe('The Smart Patch input bundle identity is already reserved.')
        }
        throw new SmartPatchInputBundleError(
          'SMART_PATCH_INPUT_STORAGE_FAILURE',
          'The private Smart Patch inputs could not be published.',
        )
      }
    })
  }

  private async readBundle(id: string): Promise<SmartPatchInputBundle> {
    return (await this.readBundleOwnership(id)).bundle
  }

  private async readBundleOwnership(id: string): Promise<BundleOwnership> {
    const directoryPath = path.join(this.root, id)
    const directory = await ownedDirectory(directoryPath)
    const manifestRead = await boundedRead(path.join(directoryPath, MANIFEST), MAX_MANIFEST_BYTES)
    let raw: unknown
    try {
      raw = JSON.parse(manifestRead.bytes.toString('utf8'))
    } catch {
      throw invalid('The committed Smart Patch manifest is malformed.')
    }
    let manifest: SmartPatchInputMaterial['manifest']
    try {
      manifest = parseFrozenSmartPatchInputV1(raw)
    } catch {
      throw invalid('The committed Smart Patch manifest is invalid.')
    }
    await assertExactNames(directoryPath, [...Object.keys(manifest.files), MANIFEST])
    const identities = new Set([identityKey(manifestRead.identity)])
    const files: Record<string, Buffer> = {}
    const ownedFiles: OwnedFile[] = [
      {
        identity: manifestRead.identity,
        path: path.join(directoryPath, MANIFEST),
        witness: manifestRead.identity,
      },
    ]
    for (const [name, metadata] of Object.entries(manifest.files)) {
      if (!metadata) {
        continue
      }
      const content = await boundedRead(path.join(directoryPath, name), metadata.byteSize, true)
      if (identities.has(identityKey(content.identity))) {
        throw unsafe('Smart Patch bundle members must not alias the same inode.')
      }
      identities.add(identityKey(content.identity))
      files[name] = content.bytes
      ownedFiles.push({
        identity: content.identity,
        path: path.join(directoryPath, name),
        witness: content.identity,
      })
    }
    const material = await qualifiedMaterial(manifest, files)
    // Pixel qualification may await. Recheck every exact descriptor version after it finishes.
    for (const file of ownedFiles) {
      await assertQualifiedFile(file)
    }
    await assertDirectoryIdentity(directoryPath, directory)
    await assertExactNames(directoryPath, [...Object.keys(manifest.files), MANIFEST])
    return {
      bundle: { ...material, id, manifestSha256: digest(manifestRead.bytes) },
      directory,
      files: ownedFiles,
    }
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation)
    this.pending = result.then(
      () => undefined,
      () => undefined,
    )
    return await result
  }

  private async storageRoot(create: boolean, id: string): Promise<void> {
    const rootEntry = await lstat(this.dataRoot, { bigint: true })
    if (
      !rootEntry.isDirectory() ||
      rootEntry.isSymbolicLink() ||
      rootEntry.uid !== BigInt(process.getuid!()) ||
      (rootEntry.mode & 0o002n) !== 0n ||
      (await realpath(this.dataRoot)) !== this.dataRoot
    ) {
      throw unsafe('The application data root is not an owned canonical directory.')
    }
    let parent = this.dataRoot
    for (const name of [path.basename(path.dirname(this.root)), 'smart-patch']) {
      const directory = path.join(parent, name)
      if (create) {
        try {
          await mkdir(directory, { mode: 0o700 })
          await this.syncDirectory(parent, id, 'layout')
        } catch (error) {
          if (!hasCode(error, 'EEXIST')) {
            throw error
          }
        }
      }
      await ownedDirectory(directory)
      parent = directory
    }
  }

  private async syncDirectory(directory: string, id: string, phase: SyncPhase): Promise<void> {
    await this.hooks.beforeDirectorySync?.({ directory, id, phase })
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

  private async writeDurable(
    filePath: string,
    bytes: Buffer,
    id: string,
    owned: OwnedFile[],
  ): Promise<void> {
    const handle = await open(
      filePath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    )
    try {
      const identity = await handle.stat({ bigint: true })
      owned.push({ identity, path: filePath })
      if (!isOwnedFile(identity)) {
        throw unsafe('Smart Patch input files must be private and owned.')
      }
      await handle.writeFile(bytes)
      await this.hooks.beforeFileSync?.({ filePath, id })
      await handle.sync()
    } finally {
      await handle.close()
    }
  }
}

function captureMaterial(input: SmartPatchInputMaterial): SmartPatchInputMaterial {
  if (!input || typeof input !== 'object' || !input.files || typeof input.files !== 'object') {
    throw invalid('Smart Patch input material is invalid.')
  }
  const files: Record<string, Buffer> = {}
  for (const [name, bytes] of Object.entries(input.files)) {
    if (!Buffer.isBuffer(bytes)) {
      throw invalid('Smart Patch input material requires owned PNG buffers.')
    }
    files[name] = Buffer.from(bytes)
  }
  return { files, manifest: structuredClone(input.manifest) }
}

async function qualifiedMaterial(
  manifest: unknown,
  files: Record<string, Buffer>,
): Promise<SmartPatchInputMaterial> {
  try {
    return await parseSmartPatchInputMaterial(manifest, files)
  } catch {
    throw invalid('The frozen Smart Patch metadata and actual input pixels do not match.')
  }
}

function validateId(id: string): void {
  if (typeof id !== 'string' || !UUID.test(id)) {
    throw invalid('The Smart Patch input bundle identity is invalid.')
  }
}

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function identityKey(identity: FileIdentity): string {
  return `${identity.dev}:${identity.ino}`
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function sameReadVersion(left: ReadWitness, right: ReadWitness): boolean {
  return (
    sameIdentity(left, right) &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  )
}

async function assertQualifiedFile(file: OwnedFile): Promise<void> {
  const current = await ownedRegularFile(file.path)
  if (
    !sameIdentity(current, file.identity) ||
    (file.witness && !sameReadVersion(current, file.witness))
  ) {
    throw unsafe('The qualified Smart Patch input file changed before consumption or discard.')
  }
}

function isOwnedFile(entry: BigIntStats): boolean {
  return (
    entry.isFile() && entry.uid === BigInt(process.getuid!()) && (entry.mode & 0o7777n) === 0o600n
  )
}

async function ownedRegularFile(filePath: string): Promise<BigIntStats> {
  const entry = await lstat(filePath, { bigint: true })
  if (!isOwnedFile(entry) || entry.isSymbolicLink() || entry.nlink !== 1n) {
    throw unsafe('Smart Patch bundle members must be private owned regular files.')
  }
  return entry
}

async function ownedDirectory(directory: string): Promise<BigIntStats> {
  let entry: BigIntStats
  try {
    entry = await lstat(directory, { bigint: true })
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      throw new SmartPatchInputBundleError(
        'SMART_PATCH_INPUT_NOT_FOUND',
        'The input bundle is unavailable.',
      )
    }
    throw error
  }
  if (
    !entry.isDirectory() ||
    entry.isSymbolicLink() ||
    entry.uid !== BigInt(process.getuid!()) ||
    (entry.mode & 0o7777n) !== 0o700n ||
    (await realpath(directory)) !== directory
  ) {
    throw unsafe('Smart Patch storage directories must be canonical, private and owned.')
  }
  return entry
}

async function assertDirectoryIdentity(directory: string, expected: FileIdentity): Promise<void> {
  if (!sameIdentity(await ownedDirectory(directory), expected)) {
    throw unsafe('The Smart Patch bundle directory was replaced.')
  }
}

async function assertExactNames(directory: string, expected: readonly string[]): Promise<void> {
  const actual = await readdir(directory)
  if (actual.length !== expected.length || actual.some((name) => !expected.includes(name))) {
    throw unsafe('The Smart Patch bundle contains unexpected or missing members.')
  }
}

async function boundedRead(
  filePath: string,
  ceiling: number,
  exact = false,
): Promise<{ bytes: Buffer; identity: ReadWitness }> {
  let handle
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      throw new SmartPatchInputBundleError(
        'SMART_PATCH_INPUT_NOT_FOUND',
        'The committed input bundle is unavailable.',
      )
    }
    throw unsafe('The Smart Patch input file could not be opened safely.')
  }
  try {
    const before = await handle.stat({ bigint: true })
    if (
      !isOwnedFile(before) ||
      before.nlink !== 1n ||
      before.size < 1n ||
      before.size > BigInt(ceiling) ||
      (exact && before.size !== BigInt(ceiling))
    ) {
      throw invalid('The Smart Patch input file has invalid ownership, size or topology.')
    }
    const bytes = Buffer.alloc(ceiling + 1)
    let offset = 0
    while (offset < bytes.length) {
      const read = await handle.read(
        bytes,
        offset,
        Math.min(64 * 1024, bytes.length - offset),
        null,
      )
      if (read.bytesRead === 0) {
        break
      }
      offset += read.bytesRead
    }
    const after = await handle.stat({ bigint: true })
    const current = await lstat(filePath, { bigint: true })
    if (
      offset > ceiling ||
      (exact && offset !== ceiling) ||
      !sameIdentity(before, after) ||
      !sameIdentity(before, current) ||
      !isOwnedFile(current) ||
      current.nlink !== 1n ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    ) {
      throw invalid('The Smart Patch input file changed during its bounded read.')
    }
    return { bytes: bytes.subarray(0, offset), identity: before }
  } finally {
    await handle.close()
  }
}

async function unlinkExact(file: OwnedFile): Promise<void> {
  const current = await lstat(file.path, { bigint: true })
  if (
    !current.isFile() ||
    !sameIdentity(current, file.identity) ||
    (file.witness &&
      (!isOwnedFile(current) || current.nlink !== 1n || !sameReadVersion(current, file.witness)))
  ) {
    throw unsafe('The Smart Patch input file changed ownership before cleanup.')
  }
  await unlink(file.path)
}

/** No recursive remove: a replacement directory or foreign file cannot become cleanup's target. */
async function cleanupOwnedReservation(
  directory: string,
  identity: FileIdentity | undefined,
  files: readonly OwnedFile[],
): Promise<boolean> {
  let complete = true
  for (const file of [...files].reverse()) {
    try {
      if (path.dirname(file.path) === directory) {
        if (!identity) {
          continue
        }
        await assertDirectoryIdentity(directory, identity)
      }
      await unlinkExact(file)
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) {
        complete = false
      }
    }
  }
  if (identity) {
    try {
      await assertDirectoryIdentity(directory, identity)
      await rmdir(directory)
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) {
        complete = false
      }
    }
  }
  return complete
}

function invalid(message: string): SmartPatchInputBundleError {
  return new SmartPatchInputBundleError('SMART_PATCH_INPUT_INVALID', message)
}

function unsafe(message: string): SmartPatchInputBundleError {
  return new SmartPatchInputBundleError('SMART_PATCH_INPUT_STORAGE_UNSAFE', message)
}

function uncertain(id: string, manifestSha256: string): SmartPatchInputBundleError {
  return new SmartPatchInputBundleError(
    'SMART_PATCH_INPUT_PUBLICATION_UNCERTAIN',
    'Smart Patch input publication needs exact reconciliation; retained files must not be discarded automatically.',
    { id, manifestSha256 },
  )
}
