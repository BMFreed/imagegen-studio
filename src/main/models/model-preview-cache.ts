import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import {
  type FileHandle,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
} from 'node:fs/promises'
import path from 'node:path'

import { validateSrgbWebpStream } from '../projects/igs-package.js'
import {
  type ProjectWorkerClient,
  ProjectWorkerError,
  type VerifiedWorkerImage,
} from '../projects/worker-client.js'

const CACHE_DIRECTORY = 'model-resource-previews-v1'
const SOURCE_MAX_BYTES = 1_000_000
const PREVIEW_MAX_BYTES = 1_000_000
const THUMBNAIL_MAX_BYTES = 128_000
const FAILURE_BACKOFF_MS = 30_000
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const UUID_PATTERN = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}'

export interface ModelPreviewCacheOptions {
  cacheRoot: string
  /** Advisory availability check; the actual shared-worker lease still decides admission. */
  canBuild?: () => Promise<boolean>
  fetchSource: (url: string) => Promise<string | null>
  now?: () => number
  scratchRoot: string
  /** Must await physical child exit; reject WORKER_EXIT_UNCONFIRMED instead of masking exit failure. */
  /** Resolve only after physical child exit; reject WORKER_EXIT_UNCONFIRMED otherwise. */
  withWorker: <T>(use: (worker: PreviewWorker) => Promise<T>) => Promise<T | null>
}
export interface ModelPreviewData {
  previewDataUrl: string
  thumbnailDataUrl: string
}

type SourceMime = 'image/jpeg' | 'image/png' | 'image/webp'

type PreviewWorker = Pick<ProjectWorkerClient, 'createResourcePreview'>

interface CachedImage {
  byteSize: number
  height: number
  sha256: string
  width: number
}

interface CachedSource {
  byteSize: number
  mimeType: SourceMime
  sha256: string
}

interface EntryMetadata {
  entryName: string
  preview: CachedImage
  schemaVersion: 1
  source: CachedSource
  sourceUrlSha256: string
  thumbnail: CachedImage
}

interface SourceBytes {
  bytes: Buffer
  metadata: CachedSource
}

/** Directory descriptors confine Main reads/writes even if a pathname is replaced by a symlink. */
class OwnedDirectory {
  private constructor(
    readonly absolutePath: string,
    readonly handle: FileHandle,
  ) {}

  static async open(input: string, create: boolean): Promise<OwnedDirectory> {
    if (!path.isAbsolute(input)) {
      throw new Error('Model preview directories must be absolute.')
    }
    const resolved = path.resolve(input)
    let current = new OwnedDirectory(
      path.parse(resolved).root,
      await open(path.parse(resolved).root, directoryFlags()),
    )
    try {
      for (const component of resolved
        .slice(path.parse(resolved).root.length)
        .split(path.sep)
        .filter(Boolean)) {
        if (create) {
          await mkdir(current.file(component), { mode: 0o700 }).catch((error: unknown) => {
            if (!isExists(error)) {
              throw error
            }
          })
        }
        const next = await current.openChild(component)
        await current.close()
        current = next
      }
      const stat = await current.handle.stat()
      if (stat.uid !== process.getuid?.() || (stat.mode & 0o022) !== 0) {
        throw new Error('The model preview directory is not app-owned.')
      }
      await current.assertLinked()
      return current
    } catch (error) {
      await current.close()
      throw error
    }
  }

  async assertLinked(): Promise<void> {
    const expected = await this.handle.stat({ bigint: true })
    const actual = await lstat(this.absolutePath, { bigint: true })
    if (
      !actual.isDirectory() ||
      actual.isSymbolicLink() ||
      expected.dev !== actual.dev ||
      expected.ino !== actual.ino ||
      (await realpath(this.absolutePath)) !== this.absolutePath
    ) {
      throw new Error('The model preview directory changed.')
    }
  }

  close(): Promise<void> {
    return this.handle.close()
  }

  async createChild(name: string): Promise<OwnedDirectory> {
    await mkdir(this.file(name), { mode: 0o700 })
    return this.openChild(name)
  }

  file(name: string): string {
    if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
      throw new Error('Invalid model preview cache name.')
    }
    return `/proc/self/fd/${this.handle.fd}/${name}`
  }

  async openChild(name: string): Promise<OwnedDirectory> {
    return new OwnedDirectory(
      path.join(this.absolutePath, name),
      await open(this.file(name), directoryFlags()),
    )
  }

  async read(name: string, maxBytes: number): Promise<Buffer> {
    const file = await open(
      this.file(name),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
    try {
      const before = await file.stat({ bigint: true })
      if (!before.isFile() || before.size < 1n || before.size > BigInt(maxBytes)) {
        throw new Error('Invalid model preview file size.')
      }
      const buffer = Buffer.alloc(Number(before.size))
      let offset = 0
      while (offset < buffer.length) {
        const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset)
        if (bytesRead === 0) {
          break
        }
        offset += bytesRead
      }
      const after = await file.stat({ bigint: true })
      const linked = await lstat(this.file(name), { bigint: true })
      if (
        offset !== buffer.length ||
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs ||
        linked.isSymbolicLink() ||
        linked.dev !== before.dev ||
        linked.ino !== before.ino
      ) {
        throw new Error('The model preview file changed.')
      }
      return buffer
    } finally {
      await file.close()
    }
  }

  async removeCacheEntry(name: string, child: OwnedDirectory): Promise<void> {
    const stat = await child.handle.stat()
    const members = await readdir(`/proc/self/fd/${child.handle.fd}`)
    if (
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o022) !== 0 ||
      members.some((member) => !['preview.webp', 'source.bin', 'thumbnail.webp'].includes(member))
    ) {
      throw new Error('The superseded model preview entry is not safely owned.')
    }
    for (const member of members) {
      const memberStat = await lstat(child.file(member))
      if (!memberStat.isFile() || memberStat.isSymbolicLink()) {
        throw new Error('The superseded model preview entry contains unexpected media.')
      }
    }
    await this.removeChild(name, child)
  }

  async removeChild(name: string, child: OwnedDirectory): Promise<void> {
    const expected = await child.handle.stat({ bigint: true })
    const actual = await lstat(this.file(name), { bigint: true })
    if (
      !actual.isDirectory() ||
      actual.isSymbolicLink() ||
      expected.dev !== actual.dev ||
      expected.ino !== actual.ino
    ) {
      throw new Error('The model preview scratch directory changed.')
    }
    await rm(this.file(name), { force: true, recursive: true })
  }

  async write(name: string, bytes: Buffer): Promise<void> {
    const file = await open(
      this.file(name),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    )
    try {
      await file.writeFile(bytes)
      await file.sync()
    } finally {
      await file.close()
    }
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Optional presentation cache; source/model installation and generation do not depend on it. */
export class ModelPreviewCache {
  private buildTail: Promise<void> = Promise.resolve()
  private readonly failedUntil = new Map<string, number>()
  private readonly inFlight = new Map<string, Promise<ModelPreviewData | null>>()
  private readonly now: () => number

  constructor(private readonly options: ModelPreviewCacheOptions) {
    this.now = options.now ?? Date.now
  }

  get(url: string): Promise<ModelPreviewData | null> {
    if (!isSourceUrl(url)) {
      return Promise.resolve(null)
    }
    const key = sha256(Buffer.from(url))
    const existing = this.inFlight.get(key)
    if (existing) {
      return existing
    }
    const request: Promise<ModelPreviewData | null> = this.load(url, key)
      .catch(() => null)
      .then((value) => {
        if (value) {
          this.failedUntil.delete(key)
        } else {
          // Avoid repeated optional network/worker work on every catalog/Prepare read.
          if (this.failedUntil.size >= 1024) {
            this.failedUntil.clear()
          }
          if ((this.failedUntil.get(key) ?? 0) <= this.now()) {
            this.failedUntil.set(key, this.now() + FAILURE_BACKOFF_MS)
          }
        }
        return value
      })
      .finally(() => {
        if (this.inFlight.get(key) === request) {
          this.inFlight.delete(key)
        }
      })
    this.inFlight.set(key, request)
    return request
  }

  /** Operational catalog reads are strictly offline and never acquire a worker or update backoff. */
  async read(url: string): Promise<ModelPreviewData | null> {
    if (!isSourceUrl(url)) {
      return null
    }
    try {
      return (await this.readEntry(sha256(Buffer.from(url))))?.value ?? null
    } catch {
      return null
    }
  }

  private async load(url: string, key: string): Promise<ModelPreviewData | null> {
    const cachedValue = (await this.readEntry(key))?.value
    if (cachedValue) {
      return cachedValue
    }
    if ((this.failedUntil.get(key) ?? 0) > this.now()) {
      return null
    }
    const previousBuild = this.buildTail
    let release!: () => void
    this.buildTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previousBuild
    try {
      // Offline hits bypass the build queue; queued misses recheck after the previous publication.
      const cached = await this.readEntry(key)
      if (cached?.value) {
        return cached.value
      }
      if (!(await (this.options.canBuild?.() ?? Promise.resolve(true)))) {
        return null
      }
      // Fetch before taking the shared worker lease; optional network work must not block Save/import.
      const source = cached?.source ?? decodeSource(await this.options.fetchSource(url))
      if (!source) {
        return null
      }
      const leased: { scratch: OwnedDirectory | null; stage: OwnedDirectory | null } = {
        scratch: null,
        stage: null,
      }
      const stageName = `model-resource-preview-${randomUUID()}`
      let unconfirmedExit = false
      try {
        return await this.options.withWorker(async (worker) => {
          const scratch = (leased.scratch = await OwnedDirectory.open(
            this.options.scratchRoot,
            true,
          ))
          const stage = (leased.stage = await scratch.createChild(stageName))
          await stage.write('source.bin', source.bytes)
          await stage.assertLinked()
          const previewPath = path.join(stage.absolutePath, 'preview.webp')
          const thumbnailPath = path.join(stage.absolutePath, 'thumbnail.webp')
          const result = await worker.createResourcePreview({
            inputPath: path.join(stage.absolutePath, 'source.bin'),
            inputSha256: source.metadata.sha256,
            previewMaxSide: 512,
            previewWebpPath: previewPath,
            stagingRoot: stage.absolutePath,
            thumbnailMaxSide: 96,
            thumbnailWebpPath: thumbnailPath,
          })
          await stage.assertLinked()
          const preview = await readWorkerImage(
            stage,
            'preview.webp',
            result.preview,
            512,
            PREVIEW_MAX_BYTES,
          )
          const thumbnail = await readWorkerImage(
            stage,
            'thumbnail.webp',
            result.thumbnail,
            96,
            THUMBNAIL_MAX_BYTES,
          )
          // Recheck the immutable input rather than trusting the injected worker's DTO.
          const inputBytes = await stage.read('source.bin', SOURCE_MAX_BYTES)
          if (
            inputBytes.length !== source.metadata.byteSize ||
            sha256(inputBytes) !== source.metadata.sha256
          ) {
            throw new Error('The model preview source changed.')
          }
          await this.publish(key, source, preview, thumbnail)
          return dataUrls(preview.bytes, thumbnail.bytes)
        })
      } catch (error) {
        unconfirmedExit =
          error instanceof ProjectWorkerError && error.code === 'WORKER_EXIT_UNCONFIRMED'
        throw error
      } finally {
        // A rejected request can leave a live worker. Only the provider's exit barrier permits removal.
        const { scratch, stage } = leased
        if (stage) {
          if (!unconfirmedExit && scratch) {
            await scratch.removeChild(stageName, stage).catch(() => undefined)
          }
          await stage.close()
        }
        await scratch?.close()
      }
    } finally {
      release()
    }
  }

  private async publish(
    key: string,
    source: SourceBytes,
    preview: { bytes: Buffer; metadata: CachedImage },
    thumbnail: { bytes: Buffer; metadata: CachedImage },
  ): Promise<void> {
    const root = await OwnedDirectory.open(path.join(this.options.cacheRoot, CACHE_DIRECTORY), true)
    const entryName = `${key}-${randomUUID()}`
    const tempName = `${key}-${randomUUID()}.tmp`
    let entry: OwnedDirectory | null = null
    let previous: OwnedDirectory | null = null
    let previousName: string | null = null
    let published = false
    try {
      try {
        previousName = parseMetadata(
          JSON.parse((await root.read(`${key}.json`, 4096)).toString('utf8')),
          key,
        ).entryName
        previous = await root.openChild(previousName)
      } catch {
        previousName = null
      }
      entry = await root.createChild(entryName)
      await entry.write('source.bin', source.bytes)
      await entry.write('preview.webp', preview.bytes)
      await entry.write('thumbnail.webp', thumbnail.bytes)
      await entry.handle.sync()
      const metadata: EntryMetadata = {
        entryName,
        preview: preview.metadata,
        schemaVersion: 1,
        source: source.metadata,
        sourceUrlSha256: key,
        thumbnail: thumbnail.metadata,
      }
      await root.write(tempName, Buffer.from(JSON.stringify(metadata)))
      await entry.assertLinked()
      await root.assertLinked()
      await rename(root.file(tempName), root.file(`${key}.json`))
      published = true
      await root.handle.sync()
      if (previous && previousName) {
        await root.removeCacheEntry(previousName, previous).catch(() => undefined)
      }
    } finally {
      await rm(root.file(tempName), { force: true }).catch(() => undefined)
      if (entry) {
        if (!published) {
          await root.removeChild(entryName, entry).catch(() => undefined)
        }
        await entry.close()
      }
      await root.close()
      await previous?.close()
    }
  }

  private async readEntry(
    key: string,
  ): Promise<{ source: SourceBytes; value: ModelPreviewData | null } | null> {
    let root: OwnedDirectory | null = null
    let entry: OwnedDirectory | null = null
    try {
      root = await OwnedDirectory.open(path.join(this.options.cacheRoot, CACHE_DIRECTORY), false)
      const metadata = parseMetadata(
        JSON.parse((await root.read(`${key}.json`, 4096)).toString('utf8')),
        key,
      )
      entry = await root.openChild(metadata.entryName)
      const sourceBytes = await entry.read('source.bin', SOURCE_MAX_BYTES)
      if (
        sourceBytes.length !== metadata.source.byteSize ||
        sha256(sourceBytes) !== metadata.source.sha256 ||
        !matchesSourceFormat(sourceBytes, metadata.source.mimeType)
      ) {
        return null
      }
      const source = { bytes: sourceBytes, metadata: metadata.source }
      try {
        const preview = await readCachedImage(
          entry,
          'preview.webp',
          metadata.preview,
          512,
          PREVIEW_MAX_BYTES,
        )
        const thumbnail = await readCachedImage(
          entry,
          'thumbnail.webp',
          metadata.thumbnail,
          96,
          THUMBNAIL_MAX_BYTES,
        )
        await entry.assertLinked()
        await root.assertLinked()
        return { source, value: dataUrls(preview, thumbnail) }
      } catch {
        return { source, value: null }
      }
    } catch {
      return null
    } finally {
      await entry?.close()
      await root?.close()
    }
  }
}

function directoryFlags(): number {
  return constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
}

function isExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
}

function isSourceUrl(input: string): boolean {
  if (input.length > 8192) {
    return false
  }
  try {
    const url = new URL(input)
    return (
      url.protocol === 'https:' &&
      ['civitai.com', 'image.civitai.com'].includes(url.hostname) &&
      url.port === '' &&
      url.username === '' &&
      url.password === ''
    )
  } catch {
    return false
  }
}

function decodeSource(value: string | null): SourceBytes | null {
  if (!value || value.length > Math.ceil(SOURCE_MAX_BYTES / 3) * 4 + 64) {
    return null
  }
  const matched = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!matched) {
    return null
  }
  const mimeType = matched[1] as SourceMime
  const bytes = Buffer.from(matched[2], 'base64')
  if (
    bytes.length < 1 ||
    bytes.length > SOURCE_MAX_BYTES ||
    bytes.toString('base64') !== matched[2] ||
    !matchesSourceFormat(bytes, mimeType)
  ) {
    return null
  }
  return { bytes, metadata: { byteSize: bytes.length, mimeType, sha256: sha256(bytes) } }
}

function matchesSourceFormat(bytes: Buffer, mime: SourceMime): boolean {
  if (mime === 'image/png') {
    return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  }
  if (mime === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  return (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
}

async function readWorkerImage(
  directory: OwnedDirectory,
  name: string,
  reported: VerifiedWorkerImage,
  maxSide: number,
  maxBytes: number,
): Promise<{ bytes: Buffer; metadata: CachedImage }> {
  if (
    reported.path !== path.join(directory.absolutePath, name) ||
    reported.colorSpace !== 'srgb' ||
    reported.iccSha256 !== IGS_SRGB_ICC_SHA256
  ) {
    throw new Error('The model preview worker output does not match its destination.')
  }
  const metadata = parseImage(reported, maxSide, maxBytes)
  return { bytes: await readCachedImage(directory, name, metadata, maxSide, maxBytes), metadata }
}

async function readCachedImage(
  directory: OwnedDirectory,
  name: string,
  metadata: CachedImage,
  maxSide: number,
  maxBytes: number,
): Promise<Buffer> {
  const bytes = await directory.read(name, maxBytes)
  const actual = await validateSrgbWebpStream(
    (async function* () {
      yield bytes
    })(),
    name,
    maxBytes,
    maxSide,
  )
  if (
    bytes.length !== metadata.byteSize ||
    sha256(bytes) !== metadata.sha256 ||
    actual.width !== metadata.width ||
    actual.height !== metadata.height
  ) {
    throw new Error('The model preview image metadata does not match its pixels.')
  }
  return bytes
}

function parseMetadata(value: unknown, key: string): EntryMetadata {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    value.sourceUrlSha256 !== key ||
    typeof value.entryName !== 'string' ||
    !new RegExp(`^${key}-${UUID_PATTERN}$`).test(value.entryName) ||
    !record(value.source)
  ) {
    throw new Error('Invalid model preview cache metadata.')
  }
  const source = value.source
  if (
    !positive(source.byteSize, SOURCE_MAX_BYTES) ||
    typeof source.sha256 !== 'string' ||
    !SHA256_PATTERN.test(source.sha256) ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(String(source.mimeType))
  ) {
    throw new Error('Invalid model preview source metadata.')
  }
  return {
    entryName: value.entryName,
    preview: parseImage(value.preview, 512, PREVIEW_MAX_BYTES),
    schemaVersion: 1,
    source: {
      byteSize: source.byteSize,
      mimeType: source.mimeType as SourceMime,
      sha256: source.sha256,
    },
    sourceUrlSha256: key,
    thumbnail: parseImage(value.thumbnail, 96, THUMBNAIL_MAX_BYTES),
  }
}

function parseImage(value: unknown, maxSide: number, maxBytes: number): CachedImage {
  if (
    !record(value) ||
    !positive(value.byteSize, maxBytes) ||
    !positive(value.width, maxSide) ||
    !positive(value.height, maxSide) ||
    typeof value.sha256 !== 'string' ||
    !SHA256_PATTERN.test(value.sha256)
  ) {
    throw new Error('Invalid model preview image metadata.')
  }
  return {
    byteSize: value.byteSize,
    height: value.height,
    sha256: value.sha256,
    width: value.width,
  }
}

function positive(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function dataUrls(preview: Buffer, thumbnail: Buffer): ModelPreviewData {
  return {
    previewDataUrl: `data:image/webp;base64,${preview.toString('base64')}`,
    thumbnailDataUrl: `data:image/webp;base64,${thumbnail.toString('base64')}`,
  }
}
