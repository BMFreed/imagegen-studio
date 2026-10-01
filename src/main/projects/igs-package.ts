import {
  IGS_SRGB_ICC_SHA256,
  isSrgbCompatiblePngColorChunk,
  pngColorChunkLength,
} from '../../shared/projects/color-profile.js'
import {
  IGS_MIMETYPE,
  IGS_REQUIRED_MEMBER_PATHS,
  IGS_SAFETY_CEILINGS,
  IGS_SCHEMA_VERSION,
  type IgsManifestV1,
  type IgsPreviewRectV1,
  type IgsProjectDocumentV1,
  isIgsMemberPathV1,
  parseIgsManifestV1,
  parseProjectDocumentV1,
  validateIgsPackageMetadataV1,
} from '../../shared/projects/project-schema.js'

import { createHash, randomUUID } from 'node:crypto'
import { type BigIntStats, createReadStream, createWriteStream } from 'node:fs'
import { link, lstat, open, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { type Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { isDeepStrictEqual } from 'node:util'
import { crc32, createInflate, type Inflate, inflateSync } from 'node:zlib'
import * as yauzl from 'yauzl'
import * as yazl from 'yazl'

export type IgsAssetSource = { bytes: Buffer } | { sourcePath: string }

export interface IgsPackageLimits {
  archiveEntries: number
  archiveUncompressedBytes: number
  manifestJsonBytes: number
  memberBytes: number
  mergedPreviewBytes: number
  projectJsonBytes: number
  rasterDimension: number
  readMemberBytes: number
  thumbnailBytes: number
}

/** Safety ceilings, not a product capacity guarantee. Tests may inject smaller ceilings. */
export const DEFAULT_IGS_PACKAGE_LIMITS: Readonly<IgsPackageLimits> = {
  archiveEntries: IGS_SAFETY_CEILINGS.archiveEntries,
  archiveUncompressedBytes: IGS_SAFETY_CEILINGS.archiveUncompressedBytes,
  manifestJsonBytes: IGS_SAFETY_CEILINGS.manifestJsonBytes,
  memberBytes: IGS_SAFETY_CEILINGS.memberBytes,
  mergedPreviewBytes: 256 * 1024 * 1024,
  projectJsonBytes: IGS_SAFETY_CEILINGS.projectJsonBytes,
  rasterDimension: IGS_SAFETY_CEILINGS.rasterDimension,
  readMemberBytes: 256 * 1024 * 1024,
  thumbnailBytes: 16 * 1024 * 1024,
}

export interface IgsPackageWriteInput {
  assets?: Readonly<Record<string, IgsAssetSource>>
  preview: {
    merged: Buffer
    rect: IgsPreviewRectV1 | null
    status: IgsManifestV1['preview']['status']
    thumbnail: Buffer
  }
  project: IgsProjectDocumentV1
  /** Keep the exact validated document member during preview-only maintenance. */
  projectJson?: Buffer
}

export interface IgsPackageReadResult {
  /** Streams a verified member into a same-directory temp file, then replaces destination. */
  extractMemberToFile: (memberPath: string, destinationPath: string) => Promise<void>
  manifest: IgsManifestV1
  project: IgsProjectDocumentV1
  /** This reopens the same package and verifies size and SHA-256 before returning bytes. */
  readMember: (memberPath: string) => Promise<Buffer>
}

export interface IgsPackageOptions {
  limits?: Partial<IgsPackageLimits>
}

export interface IgsPackageSaveOptions extends IgsPackageOptions {
  /** Test seam for an interrupted save after validation and before the commit point. */
  beforeRename?: () => Promise<void>
  /** For New Project: publish only if the destination does not already exist. */
  createOnly?: boolean
}

export interface IgsPackageSaveResult {
  /** False means rename committed, but the containing directory could not be flushed. */
  directorySynced: boolean
  manifest: IgsManifestV1
}

type ScannedMember = { bytes: number; header: Buffer; sha256: string }

type SourceScan = ScannedMember & { source: IgsAssetSource }

interface ImageStructureValidator {
  abort?: () => void
  feed: (chunk: Buffer) => Promise<void>
  finish: () => Promise<void>
}

class PngStructureValidator implements ImageStructureValidator {
  private chunkCrc = 0
  private chunkRemaining = 0
  private chunkType = ''
  private colorChunkParts: Buffer[] = []
  private readonly colorChunksSeen = new Set<string>()
  private decodedBytes = 0
  private expectedDecodedBytes = 0
  private iccParts: Buffer[] = []
  private iccSeen = false
  private ihdr = Buffer.alloc(0)
  private inflateDone: Promise<void> | null = null
  private inflateFailure: Error | null = null
  private inflator: Inflate | null = null
  private pending = Buffer.alloc(0)
  private sawIdat = false
  private sawIend = false
  private scanlinePasses: { dataBytes: number; rows: number }[] = []
  private scanlinePassIndex = 0
  private scanlineRowIndex = 0
  private scanlineRowOffset = 0
  private state: 'chunk-crc' | 'chunk-data' | 'chunk-header' | 'done' | 'signature' = 'signature'
  private stoppedIdat = false

  constructor(
    private readonly memberPath: string,
    private readonly limits: IgsPackageLimits,
  ) {}

  abort(): void {
    this.inflator?.destroy()
  }

  async feed(chunk: Buffer): Promise<void> {
    if (this.state === 'done' && chunk.length > 0) {
      throw this.invalid('Trailing data after PNG IEND.')
    }
    this.pending = Buffer.concat([this.pending, chunk])
    while (true) {
      switch (this.state) {
        case 'chunk-crc': {
          if (this.pending.length < 4) {
            return
          }
          if (this.pending.readUInt32BE(0) !== this.chunkCrc) {
            throw this.invalid('PNG chunk checksum differs.')
          }
          this.pending = this.pending.subarray(4)
          if (this.chunkType === 'IHDR') {
            this.validateIhdr()
          }
          if (this.chunkType === 'iCCP') {
            this.validateIccChunk()
          }
          if (pngColorChunkLength(this.chunkType) !== undefined) {
            this.validateColorChunk()
          }
          if (this.chunkType === 'IEND') {
            this.sawIend = true
            this.state = 'done'
            if (this.pending.length > 0) {
              throw this.invalid('Trailing data after PNG IEND.')
            }
            return
          }
          this.state = 'chunk-header'

          break
        }
        case 'chunk-data': {
          if (this.pending.length === 0) {
            return
          }
          const size = Math.min(this.pending.length, this.chunkRemaining)
          const part = this.pending.subarray(0, size)
          this.chunkCrc = crc32(part, this.chunkCrc)
          if (this.chunkType === 'IHDR') {
            this.ihdr = Buffer.concat([this.ihdr, part])
          }
          if (this.chunkType === 'iCCP') {
            this.iccParts.push(Buffer.from(part))
          }
          if (pngColorChunkLength(this.chunkType) !== undefined) {
            this.colorChunkParts.push(Buffer.from(part))
          }
          if (this.chunkType === 'IDAT') {
            if (this.inflateFailure) {
              throw this.inflateError()
            }
            try {
              await this.writeIdat(part)
            } catch {
              await this.inflateDone
              throw this.inflateError()
            }
          }
          this.pending = this.pending.subarray(size)
          this.chunkRemaining -= size
          if (this.chunkRemaining === 0) {
            this.state = 'chunk-crc'
          }

          break
        }
        case 'chunk-header': {
          if (this.pending.length < 8) {
            return
          }
          this.chunkRemaining = this.pending.readUInt32BE(0)
          this.chunkType = this.pending.toString('ascii', 4, 8)
          if (!/^[A-Z]{4}$/i.test(this.chunkType)) {
            throw this.invalid('Invalid PNG chunk type.')
          }
          if (this.chunkRemaining > this.limits.memberBytes) {
            throw new IgsPackageError('PACKAGE_LIMIT', `PNG chunk is too large: ${this.memberPath}`)
          }
          if (this.ihdr.length === 0 && this.chunkType !== 'IHDR') {
            throw this.invalid('PNG IHDR must be first.')
          }
          if (this.chunkType === 'IHDR' && (this.ihdr.length > 0 || this.chunkRemaining !== 13)) {
            throw this.invalid('Invalid PNG IHDR.')
          }
          if (this.chunkType === 'IEND' && (this.chunkRemaining !== 0 || !this.sawIdat)) {
            throw this.invalid('Invalid PNG IEND.')
          }
          if (this.chunkType === 'iCCP') {
            if (
              this.iccSeen ||
              this.sawIdat ||
              this.chunkRemaining < 4 ||
              this.chunkRemaining > IGS_SAFETY_CEILINGS.iccProfileBytes
            ) {
              throw this.invalid('Invalid or repeated PNG ICC profile.')
            }
            this.iccSeen = true
          }
          if (pngColorChunkLength(this.chunkType) !== undefined) {
            if (
              this.colorChunksSeen.has(this.chunkType) ||
              this.sawIdat ||
              this.chunkRemaining !== pngColorChunkLength(this.chunkType)
            ) {
              throw this.invalid('Invalid or repeated PNG color metadata.')
            }
            this.colorChunksSeen.add(this.chunkType)
          }
          if (
            this.chunkType.charCodeAt(0) >= 65 &&
            this.chunkType.charCodeAt(0) <= 90 &&
            !['IDAT', 'IEND', 'IHDR', 'PLTE'].includes(this.chunkType)
          ) {
            throw this.invalid('Unknown critical PNG chunk.')
          }
          if (this.sawIdat && this.chunkType !== 'IDAT') {
            this.stoppedIdat = true
          }
          if (this.chunkType === 'IDAT') {
            if (this.ihdr.length !== 13) {
              throw this.invalid('PNG IDAT precedes IHDR.')
            }
            if (this.stoppedIdat) {
              throw this.invalid('PNG IDAT chunks must be consecutive.')
            }
            this.sawIdat = true
            if (!this.inflator) {
              this.startInflator()
            }
          }
          this.chunkCrc = crc32(this.pending.subarray(4, 8))
          this.pending = this.pending.subarray(8)
          this.state = this.chunkRemaining === 0 ? 'chunk-crc' : 'chunk-data'

          break
        }
        case 'signature': {
          if (this.pending.length < 8) {
            return
          }
          if (!this.pending.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
            throw this.invalid('Invalid PNG signature.')
          }
          this.pending = this.pending.subarray(8)
          this.state = 'chunk-header'

          break
        }
        default: {
          if (this.pending.length > 0) {
            throw this.invalid('Trailing data after PNG IEND.')
          }
          return
        }
      }
    }
  }

  async finish(): Promise<void> {
    if (!this.sawIend || this.state !== 'done') {
      throw this.invalid('Truncated PNG image.')
    }
    this.inflator!.end()
    await this.inflateDone
    if (this.inflateFailure) {
      throw this.inflateError()
    }
    if (
      this.decodedBytes !== this.expectedDecodedBytes ||
      this.scanlinePassIndex !== this.scanlinePasses.length
    ) {
      throw this.invalid('Invalid PNG compressed image.')
    }
  }

  private inflateError(): IgsPackageError {
    const failure = this.inflateFailure
    return failure instanceof IgsPackageError
      ? failure
      : this.invalid('Invalid PNG compressed image.')
  }

  private invalid(message: string): IgsPackageError {
    return new IgsPackageError('INVALID_IMAGE', `${message} (${this.memberPath})`)
  }

  private startInflator(): void {
    this.inflator = createInflate()
    this.inflateDone = (async () => {
      for await (const chunk of this.inflator!) {
        this.decodedBytes += Buffer.byteLength(chunk)
        if (this.decodedBytes > this.expectedDecodedBytes) {
          throw this.invalid('PNG decoded data exceeds dimensions.')
        }
        this.validateScanlineFilters(chunk)
      }
    })().catch((error: unknown) => {
      this.inflateFailure = error instanceof Error ? error : this.invalid('Invalid PNG stream.')
    })
  }

  private validateColorChunk(): void {
    const payload = Buffer.concat(this.colorChunkParts)
    this.colorChunkParts = []
    if (!isSrgbCompatiblePngColorChunk(this.chunkType, payload)) {
      throw this.invalid('PNG color metadata conflicts with sRGB.')
    }
  }

  private validateIccChunk(): void {
    const payload = Buffer.concat(this.iccParts)
    this.iccParts = []
    const separator = payload.indexOf(0)
    if (
      separator < 1 ||
      separator > 79 ||
      payload[separator + 1] !== 0 ||
      separator + 2 >= payload.length
    ) {
      throw this.invalid('Invalid PNG ICC encoding.')
    }
    let profile: Buffer
    try {
      profile = inflateSync(payload.subarray(separator + 2), {
        maxOutputLength: IGS_SAFETY_CEILINGS.iccProfileBytes,
      })
    } catch {
      throw this.invalid('Invalid PNG ICC compression.')
    }
    if (createHash('sha256').update(profile).digest('hex') !== IGS_SRGB_ICC_SHA256) {
      throw this.invalid('PNG embeds a non-sRGB ICC profile.')
    }
  }

  private validateIhdr(): void {
    const width = this.ihdr.readUInt32BE(0)
    const height = this.ihdr.readUInt32BE(4)
    const bitDepth = this.ihdr[8]
    const colorType = this.ihdr[9]
    const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType]
    if (
      width < 1 ||
      height < 1 ||
      width > this.limits.rasterDimension ||
      height > this.limits.rasterDimension ||
      !channels ||
      ![1, 2, 4, 8, 16].includes(bitDepth) ||
      (colorType === 3 && bitDepth === 16) ||
      ([2, 4, 6].includes(colorType) && bitDepth < 8) ||
      this.ihdr[10] !== 0 ||
      this.ihdr[11] !== 0 ||
      ![0, 1].includes(this.ihdr[12])
    ) {
      throw this.invalid('Unsupported or invalid PNG IHDR.')
    }
    const passBytes = (passWidth: number, passHeight: number): number => {
      if (passWidth === 0 || passHeight === 0) {
        return 0
      }
      const dataBytes = Math.ceil((passWidth * channels * bitDepth) / 8)
      this.scanlinePasses.push({ dataBytes, rows: passHeight })
      return passHeight * (1 + dataBytes)
    }
    if (this.ihdr[12] === 0) {
      this.expectedDecodedBytes = passBytes(width, height)
    } else {
      const adam7 = [
        [0, 0, 8, 8],
        [4, 0, 8, 8],
        [0, 4, 4, 8],
        [2, 0, 4, 4],
        [0, 2, 2, 4],
        [1, 0, 2, 2],
        [0, 1, 1, 2],
      ]
      this.expectedDecodedBytes = adam7.reduce((sum, [x, y, dx, dy]) => {
        const passWidth = width <= x ? 0 : Math.ceil((width - x) / dx)
        const passHeight = height <= y ? 0 : Math.ceil((height - y) / dy)
        return sum + passBytes(passWidth, passHeight)
      }, 0)
    }
    if (this.expectedDecodedBytes > this.limits.archiveUncompressedBytes) {
      throw new IgsPackageError('PACKAGE_LIMIT', `Decoded PNG is too large: ${this.memberPath}`)
    }
  }

  private validateScanlineFilters(chunk: Buffer): void {
    let offset = 0
    while (offset < chunk.length) {
      const pass = this.scanlinePasses[this.scanlinePassIndex]
      if (!pass) {
        throw this.invalid('PNG decoded data exceeds dimensions.')
      }
      if (this.scanlineRowOffset === 0) {
        if (chunk[offset] > 4) {
          throw this.invalid('Invalid PNG scanline filter.')
        }
        offset++
        this.scanlineRowOffset = 1
      }
      const dataBytes = Math.min(pass.dataBytes + 1 - this.scanlineRowOffset, chunk.length - offset)
      offset += dataBytes
      this.scanlineRowOffset += dataBytes
      if (this.scanlineRowOffset === pass.dataBytes + 1) {
        this.scanlineRowOffset = 0
        this.scanlineRowIndex++
        if (this.scanlineRowIndex === pass.rows) {
          this.scanlinePassIndex++
          this.scanlineRowIndex = 0
        }
      }
    }
  }

  private writeIdat(part: Buffer): Promise<void> {
    const inflator = this.inflator!
    return new Promise<void>((resolve, reject) => {
      let settled = false
      const cleanup = (): void => {
        inflator.off('close', onClose)
        inflator.off('error', onError)
      }
      const settle = (error?: Error | null): void => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      }
      const onClose = (): void => settle(this.invalid('PNG inflater closed before IDAT completed.'))
      const onError = (error: Error): void => settle(error)
      // A malformed zlib stream can close without a write callback or `drain`.
      inflator.once('close', onClose)
      inflator.once('error', onError)
      inflator.write(part, (error: Error | null | undefined) => settle(error))
    })
  }
}

class WebpStructureValidator implements ImageStructureValidator {
  private actualBytes = 0
  private chunkPayloadRemaining = 0
  private chunkType = ''
  private declaredBytes = 0
  private firstChunk = true
  private iccHash: ReturnType<typeof createHash> | null = null
  private iccSeen = false
  private pending = Buffer.alloc(0)
  private remaining = 0
  private sawImageChunk = false
  private state: 'chunk-data' | 'chunk-header' | 'riff' = 'riff'

  constructor(private readonly memberPath: string) {}

  async feed(chunk: Buffer): Promise<void> {
    this.actualBytes += chunk.length
    this.pending = Buffer.concat([this.pending, chunk])
    while (true) {
      if (this.state === 'riff') {
        if (this.pending.length < 12) {
          return
        }
        if (
          this.pending.toString('ascii', 0, 4) !== 'RIFF' ||
          this.pending.toString('ascii', 8, 12) !== 'WEBP'
        ) {
          throw this.invalid('Invalid WebP RIFF header.')
        }
        this.declaredBytes = this.pending.readUInt32LE(4) + 8
        if (this.declaredBytes < 30 || this.actualBytes > this.declaredBytes) {
          throw this.invalid('Invalid WebP RIFF size.')
        }
        this.pending = this.pending.subarray(12)
        this.state = 'chunk-header'
      } else if (this.state === 'chunk-header') {
        if (this.pending.length < 8) {
          return
        }
        const tag = this.pending.toString('ascii', 0, 4)
        const chunkBytes = this.pending.readUInt32LE(4)
        if (this.firstChunk && !['VP8 ', 'VP8L', 'VP8X'].includes(tag)) {
          throw this.invalid('WebP image chunk must be first.')
        }
        if (
          (tag === 'VP8 ' && chunkBytes < 10) ||
          (tag === 'VP8L' && chunkBytes < 5) ||
          (tag === 'VP8X' && chunkBytes < 10)
        ) {
          throw this.invalid('Truncated WebP image chunk.')
        }
        this.firstChunk = false
        this.sawImageChunk ||= tag === 'VP8 ' || tag === 'VP8L'
        if (tag === 'ICCP') {
          if (
            this.iccSeen ||
            chunkBytes < 128 ||
            chunkBytes > IGS_SAFETY_CEILINGS.iccProfileBytes
          ) {
            throw this.invalid('Invalid or repeated WebP ICC profile.')
          }
          this.iccSeen = true
          this.iccHash = createHash('sha256')
        }
        this.chunkType = tag
        this.chunkPayloadRemaining = chunkBytes
        this.remaining = chunkBytes + (chunkBytes & 1)
        this.pending = this.pending.subarray(8)
        this.state = this.remaining === 0 ? 'chunk-header' : 'chunk-data'
      } else {
        if (this.pending.length === 0) {
          return
        }
        const size = Math.min(this.pending.length, this.remaining)
        const payloadSize = Math.min(size, this.chunkPayloadRemaining)
        if (this.chunkType === 'ICCP') {
          this.iccHash!.update(this.pending.subarray(0, payloadSize))
        }
        this.chunkPayloadRemaining -= payloadSize
        this.pending = this.pending.subarray(size)
        this.remaining -= size
        if (this.remaining === 0) {
          if (this.chunkType === 'ICCP' && this.iccHash!.digest('hex') !== IGS_SRGB_ICC_SHA256) {
            throw this.invalid('WebP embeds a non-sRGB ICC profile.')
          }
          this.state = 'chunk-header'
        }
      }
    }
  }

  async finish(): Promise<void> {
    if (
      this.actualBytes !== this.declaredBytes ||
      this.state !== 'chunk-header' ||
      this.pending.length !== 0 ||
      !this.sawImageChunk
    ) {
      throw this.invalid('Truncated or invalid WebP RIFF structure.')
    }
  }

  private invalid(message: string): IgsPackageError {
    return new IgsPackageError('INVALID_IMAGE', `${message} (${this.memberPath})`)
  }
}

export class IgsPackageError extends Error {
  constructor(
    readonly code:
      | 'INVALID_IMAGE'
      | 'INVALID_PACKAGE'
      | 'MEMBER_MISMATCH'
      | 'MISSING_ENTRY'
      | 'PACKAGE_CHANGED'
      | 'PACKAGE_LIMIT'
      | 'UNSAFE_ENTRY',
    message: string,
  ) {
    super(message)
    this.name = 'IgsPackageError'
  }
}

/** Reuse the package writer's full PNG/color validation before accepting worker pixels. */
export async function validateSrgbPngStream(
  chunks: AsyncIterable<Buffer>,
  label: string,
  maxBytes: number,
  maxDimension: number,
): Promise<void> {
  if (!label.endsWith('.png')) {
    throw new IgsPackageError('INVALID_IMAGE', 'Expected a PNG image.')
  }
  const limits = resolveLimits({ memberBytes: maxBytes, rasterDimension: maxDimension })
  await scanStream(chunks, label, maxBytes, false, limits)
}

/** Reuse the package writer's WebP structure and color checks for worker output. */
export async function validateSrgbWebpStream(
  chunks: AsyncIterable<Buffer>,
  label: string,
  maxBytes: number,
  maxDimension: number,
): Promise<{ height: number; width: number }> {
  if (!label.endsWith('.webp')) {
    throw new IgsPackageError('INVALID_IMAGE', 'Expected a WebP image.')
  }
  const limits = resolveLimits({ memberBytes: maxBytes, rasterDimension: maxDimension })
  const scanned = await scanStream(chunks, label, maxBytes, false, limits)
  return imageDimensions(label, scanned.header, limits)
}

export async function readIgsPackage(
  filePath: string,
  options: IgsPackageOptions = {},
): Promise<IgsPackageReadResult> {
  const limits = resolveLimits(options.limits)
  const initialStat = await lstat(filePath, { bigint: true })
  if (!initialStat.isFile() || initialStat.isSymbolicLink()) {
    throw new IgsPackageError('INVALID_PACKAGE', 'The Project package is not a regular file.')
  }
  // Newer formats may legitimately contain member paths unknown to v1. Read only the bounded
  // marker and manifest first so Open can report unsupported schema before v1 path checks.
  await preflightPackageHeader(filePath, limits)
  const zip = await openArchive(filePath)
  const scanned = new Map<string, ScannedMember>()
  const metadata = new Map<string, Buffer>()
  let totalBytes = 0
  try {
    if (zip.entryCount > limits.archiveEntries) {
      throw new IgsPackageError('PACKAGE_LIMIT', 'The Project package has too many members.')
    }
    for await (const entry of archiveEntries(zip)) {
      assertZipEntry(entry)
      if (scanned.has(entry.fileName)) {
        throw new IgsPackageError('UNSAFE_ENTRY', `Duplicate package member: ${entry.fileName}`)
      }
      if (
        !Number.isSafeInteger(entry.uncompressedSize) ||
        entry.uncompressedSize > memberLimit(entry.fileName, limits)
      ) {
        throw new IgsPackageError('PACKAGE_LIMIT', `Package member is too large: ${entry.fileName}`)
      }
      totalBytes += entry.uncompressedSize
      if (totalBytes > limits.archiveUncompressedBytes) {
        throw new IgsPackageError('PACKAGE_LIMIT', 'The Project package is too large.')
      }
      const retain =
        entry.fileName === 'mimetype' ||
        entry.fileName === 'manifest.json' ||
        entry.fileName === 'project.json'
      const stream = await openArchiveMember(zip, entry)
      const result = await scanArchiveStream(
        stream,
        entry.fileName,
        memberLimit(entry.fileName, limits),
        retain,
        limits,
      )
      if (result.bytes !== entry.uncompressedSize) {
        throw new IgsPackageError(
          'MEMBER_MISMATCH',
          `Package member size changed: ${entry.fileName}`,
        )
      }
      totalBytes += result.bytes - entry.uncompressedSize
      if (totalBytes > limits.archiveUncompressedBytes) {
        throw new IgsPackageError('PACKAGE_LIMIT', 'The Project package is too large.')
      }
      scanned.set(entry.fileName, result)
      if (result.content) {
        metadata.set(entry.fileName, result.content)
      }
      if (isImagePath(entry.fileName)) {
        imageDimensions(entry.fileName, result.header, limits)
      }
    }
  } finally {
    zip.close()
  }

  if (metadata.get('mimetype')?.toString('utf8') !== IGS_MIMETYPE) {
    throw new IgsPackageError('INVALID_PACKAGE', 'This is not an ImageGen Studio Project package.')
  }
  const manifestJson = metadata.get('manifest.json')
  const projectJson = metadata.get('project.json')
  if (!manifestJson || !projectJson) {
    throw new IgsPackageError('MISSING_ENTRY', 'The Project package is incomplete.')
  }
  const { document, manifest } = validateIgsPackageMetadataV1(
    parseJson(manifestJson, 'manifest.json'),
    parseJson(projectJson, 'project.json'),
  )
  const expectedPaths = new Set([
    'manifest.json',
    'mimetype',
    ...manifest.members.map((m) => m.path),
  ])
  if (
    expectedPaths.size !== scanned.size ||
    [...scanned.keys()].some((name) => !expectedPaths.has(name))
  ) {
    throw new IgsPackageError(
      'MEMBER_MISMATCH',
      'The package contains unlisted or missing members.',
    )
  }
  for (const member of manifest.members) {
    const actual = scanned.get(member.path)
    if (!actual || actual.bytes !== member.bytes || actual.sha256 !== member.sha256) {
      throw new IgsPackageError('MEMBER_MISMATCH', `Package member differs: ${member.path}`)
    }
  }
  for (const required of IGS_REQUIRED_MEMBER_PATHS) {
    if (!scanned.has(required)) {
      throw new IgsPackageError('MISSING_ENTRY', `Missing package member: ${required}`)
    }
  }
  for (const layer of document.layers) {
    const dimensions = imageDimensions(
      layer.asset.path,
      scanned.get(layer.asset.path)!.header,
      limits,
    )
    if (dimensions.width !== layer.asset.width || dimensions.height !== layer.asset.height) {
      throw new IgsPackageError('MEMBER_MISMATCH', `Layer dimensions differ: ${layer.asset.path}`)
    }
  }
  // The rect is in infinite-canvas coordinates; the PNG may be downsampled.
  // Both preview images were already checked against their encoded format and limits.
  if (fingerprint(await lstat(filePath, { bigint: true })) !== fingerprint(initialStat)) {
    throw new IgsPackageError('PACKAGE_CHANGED', 'The Project package changed while it was opened.')
  }
  const packageFingerprint = fingerprint(initialStat)
  return {
    extractMemberToFile: async (memberPath: string, destinationPath: string) => {
      const expected = manifest.members.find((member) => member.path === memberPath)
      if (!expected) {
        throw new IgsPackageError('MISSING_ENTRY', `Unknown package member: ${memberPath}`)
      }
      if (fingerprint(await lstat(filePath, { bigint: true })) !== packageFingerprint) {
        throw new IgsPackageError(
          'PACKAGE_CHANGED',
          'The Project package changed after it was opened.',
        )
      }
      const absoluteDestination = path.resolve(destinationPath)
      const temporaryPath = path.join(
        path.dirname(absoluteDestination),
        `.${path.basename(absoluteDestination)}.${randomUUID()}.tmp`,
      )
      const memberZip = await openArchive(filePath)
      let committed = false
      try {
        for await (const entry of archiveEntries(memberZip)) {
          if (entry.fileName !== memberPath) {
            continue
          }
          assertZipEntry(entry)
          const input = await openArchiveMember(memberZip, entry)
          const output = createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 })
          const hash = createHash('sha256')
          let bytes = 0
          const validator = makeImageValidator(memberPath, limits)
          try {
            await pipeline(
              input,
              new Transform({
                transform(chunk: Buffer, _encoding, callback) {
                  void (async () => {
                    bytes += chunk.length
                    if (bytes > expected.bytes || bytes > memberLimit(memberPath, limits)) {
                      throw new IgsPackageError(
                        'PACKAGE_LIMIT',
                        `Package member is too large: ${memberPath}`,
                      )
                    }
                    hash.update(chunk)
                    await validator?.feed(chunk)
                  })().then(() => callback(null, chunk), callback)
                },
              }),
              output,
            )
            await validator?.finish()
          } catch (error) {
            validator?.abort?.()
            throw normalizeArchiveError(error)
          }
          if (bytes !== expected.bytes || hash.digest('hex') !== expected.sha256) {
            throw new IgsPackageError('MEMBER_MISMATCH', `Package member differs: ${memberPath}`)
          }
          if (fingerprint(await lstat(filePath, { bigint: true })) !== packageFingerprint) {
            throw new IgsPackageError(
              'PACKAGE_CHANGED',
              'The Project package changed while reading.',
            )
          }
          const extracted = await open(temporaryPath, 'r')
          try {
            await extracted.sync()
          } finally {
            await extracted.close()
          }
          try {
            const current = await lstat(absoluteDestination)
            if (!current.isFile() || current.isSymbolicLink()) {
              throw new IgsPackageError(
                'INVALID_PACKAGE',
                'The extraction target is not a regular file.',
              )
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error
            }
          }
          await rename(temporaryPath, absoluteDestination)
          committed = true
          return
        }
        throw new IgsPackageError('MISSING_ENTRY', `Missing package member: ${memberPath}`)
      } finally {
        memberZip.close()
        if (!committed) {
          await unlink(temporaryPath).catch(() => undefined)
        }
      }
    },
    manifest,
    project: document,
    readMember: async (memberPath: string) => {
      const expected = manifest.members.find((member) => member.path === memberPath)
      if (!expected) {
        throw new IgsPackageError('MISSING_ENTRY', `Unknown package member: ${memberPath}`)
      }
      if (expected.bytes > limits.readMemberBytes) {
        throw new IgsPackageError(
          'PACKAGE_LIMIT',
          `Member is too large to read into memory: ${memberPath}`,
        )
      }
      if (fingerprint(await lstat(filePath, { bigint: true })) !== packageFingerprint) {
        throw new IgsPackageError(
          'PACKAGE_CHANGED',
          'The Project package changed after it was opened.',
        )
      }
      const memberZip = await openArchive(filePath)
      try {
        for await (const entry of archiveEntries(memberZip)) {
          if (entry.fileName !== memberPath) {
            continue
          }
          assertZipEntry(entry)
          const result = await scanArchiveStream(
            await openArchiveMember(memberZip, entry),
            memberPath,
            Math.min(expected.bytes, limits.readMemberBytes),
            true,
            limits,
          )
          if (result.bytes !== expected.bytes || result.sha256 !== expected.sha256) {
            throw new IgsPackageError('MEMBER_MISMATCH', `Package member differs: ${memberPath}`)
          }
          if (fingerprint(await lstat(filePath, { bigint: true })) !== packageFingerprint) {
            throw new IgsPackageError(
              'PACKAGE_CHANGED',
              'The Project package changed while reading.',
            )
          }
          return result.content!
        }
        throw new IgsPackageError('MISSING_ENTRY', `Missing package member: ${memberPath}`)
      } finally {
        memberZip.close()
      }
    },
  }
}

export async function saveIgsPackage(
  targetPath: string,
  input: IgsPackageWriteInput,
  options: IgsPackageSaveOptions = {},
): Promise<IgsPackageSaveResult> {
  const limits = resolveLimits(options.limits)
  const project = parseProjectDocumentV1(input.project)
  const assets = input.assets ?? {}
  const assetPaths = new Set(
    project.layers.flatMap((layer) =>
      layer.sourceIccProfile ? [layer.asset.path, layer.sourceIccProfile.path] : [layer.asset.path],
    ),
  )
  if (
    Object.keys(assets).length !== assetPaths.size ||
    Object.keys(assets).some((assetPath) => !assetPaths.has(assetPath))
  ) {
    throw new IgsPackageError(
      'MEMBER_MISMATCH',
      'Project layer assets do not match the supplied files.',
    )
  }

  const sources = new Map<string, SourceScan>()
  const projectJson = input.projectJson ?? Buffer.from(JSON.stringify(project), 'utf8')
  if (input.projectJson) {
    if (projectJson.length > limits.projectJsonBytes) {
      throw new IgsPackageError('PACKAGE_LIMIT', 'The Project document member is too large.')
    }
    let suppliedProject: IgsProjectDocumentV1
    try {
      suppliedProject = parseProjectDocumentV1(JSON.parse(projectJson.toString('utf8')))
    } catch {
      throw new IgsPackageError(
        'MEMBER_MISMATCH',
        'The supplied Project document member is invalid.',
      )
    }
    if (!isDeepStrictEqual(suppliedProject, project)) {
      throw new IgsPackageError('MEMBER_MISMATCH', 'The supplied Project document member differs.')
    }
  }
  sources.set('project.json', await scanAssetSource('project.json', { bytes: projectJson }, limits))
  sources.set(
    'preview/thumbnail.webp',
    await scanAssetSource('preview/thumbnail.webp', { bytes: input.preview.thumbnail }, limits),
  )
  sources.set(
    'preview/merged.png',
    await scanAssetSource('preview/merged.png', { bytes: input.preview.merged }, limits),
  )
  for (const [assetPath, source] of Object.entries(assets)) {
    sources.set(assetPath, await scanAssetSource(assetPath, source, limits))
  }
  for (const [memberPath, scanned] of sources) {
    if (isImagePath(memberPath)) {
      imageDimensions(memberPath, scanned.header, limits)
    }
  }
  if (sources.size + 2 > limits.archiveEntries) {
    throw new IgsPackageError('PACKAGE_LIMIT', 'The Project package has too many members.')
  }
  const manifest: IgsManifestV1 = {
    documentId: project.documentId,
    documentRevision: project.documentRevision,
    members: [...sources].map(([memberPath, source]) => ({
      bytes: source.bytes,
      path: memberPath,
      sha256: source.sha256,
    })),
    preview: { rect: input.preview.rect, status: input.preview.status },
    schemaVersion: IGS_SCHEMA_VERSION,
  }
  validateIgsPackageMetadataV1(manifest, project)
  const manifestJson = Buffer.from(JSON.stringify(manifest), 'utf8')
  if (manifestJson.length > memberLimit('manifest.json', limits)) {
    throw new IgsPackageError('PACKAGE_LIMIT', 'The Project manifest is too large.')
  }
  const totalBytes =
    Buffer.byteLength(IGS_MIMETYPE) +
    manifestJson.length +
    [...sources.values()].reduce((sum, source) => sum + source.bytes, 0)
  if (totalBytes > limits.archiveUncompressedBytes) {
    throw new IgsPackageError('PACKAGE_LIMIT', 'The Project package is too large.')
  }

  const absoluteTarget = path.resolve(targetPath)
  const temporaryPath = path.join(
    path.dirname(absoluteTarget),
    `.${path.basename(absoluteTarget)}.${randomUUID()}.tmp`,
  )
  try {
    try {
      const currentTarget = await lstat(absoluteTarget)
      if (!currentTarget.isFile() || currentTarget.isSymbolicLink()) {
        throw new IgsPackageError('INVALID_PACKAGE', 'The Project target is not a regular file.')
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
    const zip = new yazl.ZipFile()
    zip.addBuffer(Buffer.from(IGS_MIMETYPE, 'utf8'), 'mimetype', { compress: false })
    zip.addBuffer(manifestJson, 'manifest.json', { compress: false })
    for (const [memberPath, scanned] of sources) {
      if ('bytes' in scanned.source) {
        zip.addBuffer(scanned.source.bytes, memberPath, { compress: false })
      } else {
        zip.addFile(scanned.source.sourcePath, memberPath, { compress: false })
      }
    }
    zip.end()
    await pipeline(zip.outputStream, createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }))
    // The actual loader, not a JSON-only helper, validates the staged ZIP before publication.
    const staged = await readIgsPackage(temporaryPath, { limits })
    if (staged.project.documentRevision !== project.documentRevision) {
      throw new IgsPackageError('MEMBER_MISMATCH', 'Staged Project revision changed.')
    }
    const temporaryFile = await open(temporaryPath, 'r')
    try {
      await temporaryFile.sync()
    } finally {
      await temporaryFile.close()
    }
    await options.beforeRename?.()
    await (options.createOnly
      ? link(temporaryPath, absoluteTarget)
      : rename(temporaryPath, absoluteTarget))
    let directorySynced = true
    try {
      const directory = await open(path.dirname(absoluteTarget), 'r')
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
    } catch {
      // Rename is already the commit point. The caller must not clear or roll back Save here.
      directorySynced = false
    }
    return { directorySynced, manifest }
  } finally {
    await unlink(temporaryPath).catch(() => undefined)
  }
}

function normalizeArchiveError(error: unknown): Error {
  if (error instanceof IgsPackageError) {
    return error
  }
  if (error instanceof Error) {
    const fileError = error as NodeJS.ErrnoException
    if (
      fileError.code === 'ENOENT' ||
      fileError.code === 'EACCES' ||
      typeof fileError.syscall === 'string'
    ) {
      return error
    }
  }
  return new IgsPackageError('INVALID_PACKAGE', 'The Project package contains malformed ZIP data.')
}

async function openArchive(filePath: string): Promise<yauzl.ZipFile> {
  try {
    return await yauzl.openPromise(filePath, {
      autoClose: false,
      decodeStrings: true,
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    })
  } catch (error) {
    throw normalizeArchiveError(error)
  }
}

async function* archiveEntries(zip: yauzl.ZipFile): AsyncGenerator<yauzl.Entry> {
  try {
    for await (const entry of zip.eachEntry()) {
      yield entry
    }
  } catch (error) {
    throw normalizeArchiveError(error)
  }
}

async function openArchiveMember(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  try {
    return await zip.openReadStreamPromise(entry)
  } catch (error) {
    throw normalizeArchiveError(error)
  }
}

async function scanArchiveStream(
  chunks: Readable,
  memberPath: string,
  limit: number,
  retain: boolean,
  limits: IgsPackageLimits,
): Promise<ScannedMember & { content?: Buffer }> {
  try {
    return await scanStream(chunks, memberPath, limit, retain, limits)
  } catch (error) {
    throw normalizeArchiveError(error)
  }
}

async function preflightPackageHeader(filePath: string, limits: IgsPackageLimits): Promise<void> {
  const zip = await openArchive(filePath)
  const metadata = new Map<string, Buffer>()
  try {
    if (zip.entryCount > limits.archiveEntries) {
      throw new IgsPackageError('PACKAGE_LIMIT', 'The Project package has too many members.')
    }
    for await (const entry of archiveEntries(zip)) {
      if (entry.fileName !== 'mimetype' && entry.fileName !== 'manifest.json') {
        continue
      }
      if (metadata.has(entry.fileName) || entry.isEncrypted() || !entry.canDecodeFileData()) {
        throw new IgsPackageError('UNSAFE_ENTRY', `Invalid package header: ${entry.fileName}`)
      }
      const result = await scanArchiveStream(
        await openArchiveMember(zip, entry),
        entry.fileName,
        memberLimit(entry.fileName, limits),
        true,
        limits,
      )
      metadata.set(entry.fileName, result.content!)
    }
  } finally {
    zip.close()
  }
  if (metadata.get('mimetype')?.toString('utf8') !== IGS_MIMETYPE) {
    throw new IgsPackageError('INVALID_PACKAGE', 'This is not an ImageGen Studio Project package.')
  }
  const manifest = metadata.get('manifest.json')
  if (!manifest) {
    throw new IgsPackageError('MISSING_ENTRY', 'The Project manifest is missing.')
  }
  parseIgsManifestV1(parseJson(manifest, 'manifest.json'))
}

function resolveLimits(overrides: Partial<IgsPackageLimits> | undefined): IgsPackageLimits {
  const limits = { ...DEFAULT_IGS_PACKAGE_LIMITS }
  for (const key of Object.keys(limits) as (keyof IgsPackageLimits)[]) {
    const value = overrides?.[key]
    if (value === undefined) {
      continue
    }
    if (!Number.isSafeInteger(value) || value < 1 || value > limits[key]) {
      throw new IgsPackageError('PACKAGE_LIMIT', `Invalid ${key} safety ceiling.`)
    }
    limits[key] = value
  }
  return limits
}

function memberLimit(memberPath: string, limits: IgsPackageLimits): number {
  if (memberPath.startsWith('assets/profiles/')) {
    return Math.min(limits.memberBytes, IGS_SAFETY_CEILINGS.iccProfileBytes)
  }
  switch (memberPath) {
    case 'manifest.json': {
      return Math.min(limits.memberBytes, limits.manifestJsonBytes)
    }
    case 'mimetype': {
      return Buffer.byteLength(IGS_MIMETYPE)
    }
    case 'preview/merged.png': {
      return Math.min(limits.memberBytes, limits.mergedPreviewBytes)
    }
    case 'preview/thumbnail.webp': {
      return Math.min(limits.memberBytes, limits.thumbnailBytes)
    }
    case 'project.json': {
      return Math.min(limits.memberBytes, limits.projectJsonBytes)
    }
    default: {
      return limits.memberBytes
    }
  }
}

function isImagePath(memberPath: string): boolean {
  return memberPath.endsWith('.png') || memberPath.endsWith('.webp')
}

function assertMemberPath(memberPath: string): void {
  if (
    !memberPath ||
    memberPath.startsWith('/') ||
    memberPath.includes('\\') ||
    memberPath.includes('\0') ||
    memberPath.includes('//') ||
    memberPath.split('/').some((segment) => segment === '.' || segment === '..') ||
    !(memberPath === 'mimetype' || memberPath === 'manifest.json' || isIgsMemberPathV1(memberPath))
  ) {
    throw new IgsPackageError('UNSAFE_ENTRY', `Unsafe or unknown package member: ${memberPath}`)
  }
}

function assertZipEntry(entry: yauzl.Entry): void {
  assertMemberPath(entry.fileName)
  // The format contains files only. Do not follow a Unix symlink encoded in ZIP attributes.
  const mode = (entry.externalFileAttributes >>> 16) & 0xff_ff
  const fileType = mode & 0o17_0000
  if (
    entry.fileName.endsWith('/') ||
    (fileType !== 0 && fileType !== 0o10_0000) ||
    entry.isEncrypted() ||
    !entry.canDecodeFileData() ||
    (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)
  ) {
    throw new IgsPackageError('UNSAFE_ENTRY', `Unsupported package member: ${entry.fileName}`)
  }
}

function imageDimensions(
  memberPath: string,
  header: Buffer,
  limits: IgsPackageLimits,
): {
  height: number
  width: number
} {
  let width = 0
  let height = 0
  if (memberPath.endsWith('.png')) {
    if (
      header.length < 24 ||
      !header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
      header.toString('ascii', 12, 16) !== 'IHDR' ||
      header.readUInt32BE(8) !== 13
    ) {
      throw new IgsPackageError('INVALID_IMAGE', `Invalid PNG header: ${memberPath}`)
    }
    width = header.readUInt32BE(16)
    height = header.readUInt32BE(20)
  } else if (memberPath.endsWith('.webp')) {
    if (
      header.length < 30 ||
      header.toString('ascii', 0, 4) !== 'RIFF' ||
      header.toString('ascii', 8, 12) !== 'WEBP'
    ) {
      throw new IgsPackageError('INVALID_IMAGE', `Invalid WebP header: ${memberPath}`)
    }
    const tag = header.toString('ascii', 12, 16)
    if (tag === 'VP8X') {
      width = 1 + header.readUIntLE(24, 3)
      height = 1 + header.readUIntLE(27, 3)
    } else if (tag === 'VP8L' && header[20] === 0x2f) {
      width = 1 + (header[21] | ((header[22] & 0x3f) << 8))
      height = 1 + ((header[22] >> 6) | (header[23] << 2) | ((header[24] & 0x0f) << 10))
    } else if (
      tag === 'VP8 ' &&
      header[23] === 0x9d &&
      header[24] === 0x01 &&
      header[25] === 0x2a
    ) {
      width = header.readUInt16LE(26) & 0x3f_ff
      height = header.readUInt16LE(28) & 0x3f_ff
    } else {
      throw new IgsPackageError('INVALID_IMAGE', `Invalid WebP frame: ${memberPath}`)
    }
  } else {
    throw new IgsPackageError('INVALID_IMAGE', `Unsupported image: ${memberPath}`)
  }
  if (
    width < 1 ||
    height < 1 ||
    width > limits.rasterDimension ||
    height > limits.rasterDimension
  ) {
    throw new IgsPackageError(
      'PACKAGE_LIMIT',
      `Image dimensions exceed the safety ceiling: ${memberPath}`,
    )
  }
  return { height, width }
}

function makeImageValidator(
  memberPath: string,
  limits: IgsPackageLimits,
): ImageStructureValidator | null {
  if (memberPath.endsWith('.png')) {
    return new PngStructureValidator(memberPath, limits)
  }
  if (memberPath.endsWith('.webp')) {
    return new WebpStructureValidator(memberPath)
  }
  return null
}

async function scanStream(
  chunks: AsyncIterable<string | Buffer> | Iterable<string | Buffer>,
  memberPath: string,
  limit: number,
  retain: boolean,
  limits: IgsPackageLimits,
): Promise<ScannedMember & { content?: Buffer }> {
  const hash = createHash('sha256')
  const content: Buffer[] = []
  let header = Buffer.alloc(0)
  let bytes = 0
  const validator = makeImageValidator(memberPath, limits)
  try {
    for await (const rawChunk of chunks) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk)
      bytes += chunk.length
      if (bytes > limit) {
        throw new IgsPackageError('PACKAGE_LIMIT', `Package member is too large: ${memberPath}`)
      }
      hash.update(chunk)
      await validator?.feed(chunk)
      if (header.length < 64) {
        header = Buffer.concat([header, chunk.subarray(0, 64 - header.length)])
      }
      if (retain) {
        content.push(chunk)
      }
    }
    await validator?.finish()
  } catch (error) {
    validator?.abort?.()
    throw error
  }
  return {
    bytes,
    header,
    sha256: hash.digest('hex'),
    ...(retain ? { content: Buffer.concat(content, bytes) } : {}),
  }
}

function parseJson(buffer: Buffer, memberPath: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)) as unknown
  } catch {
    throw new IgsPackageError('INVALID_PACKAGE', `Invalid ${memberPath}.`)
  }
}

function fingerprint(stats: BigIntStats): string {
  return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}`
}

async function scanAssetSource(
  memberPath: string,
  source: IgsAssetSource,
  limits: IgsPackageLimits,
): Promise<SourceScan> {
  assertMemberPath(memberPath)
  const limit = memberLimit(memberPath, limits)
  if ('bytes' in source) {
    const result = await scanStream([source.bytes], memberPath, limit, false, limits)
    return { ...result, source }
  }
  const sourceStat = await lstat(source.sourcePath)
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || sourceStat.size > limit) {
    throw new IgsPackageError('INVALID_PACKAGE', `Asset source is not a safe file: ${memberPath}`)
  }
  const result = await scanStream(
    createReadStream(source.sourcePath),
    memberPath,
    limit,
    false,
    limits,
  )
  if (result.bytes !== sourceStat.size) {
    throw new IgsPackageError('MEMBER_MISMATCH', `Asset source changed: ${memberPath}`)
  }
  return { ...result, source }
}
