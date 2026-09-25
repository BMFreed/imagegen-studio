import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { type FileHandle, lstat, mkdtemp, open, realpath, rm } from 'node:fs/promises'
import path from 'node:path'

import type { IgsAssetSource } from './igs-package.js'
import type { ProjectWorkerClient, VerifiedImportResult } from './worker-client.js'

// Mirrors the first worker protocol's defensive source-byte ceiling, not a product capacity.
const MAX_SOURCE_BYTES = 256 * 1024 * 1024
const COPY_CHUNK_BYTES = 1024 * 1024

export interface RasterImportInput {
  /** Main-process path from an authorized local file selection, never renderer-supplied directly. */
  authorizedSourcePath: string
  /** Snapshot supplier owned by the open Project tab; never exposes its mutable session. */
  getDocument: () => IgsProjectDocumentV1
  /** Explicit insertion point in the current layer order. */
  insertIndex: number
  /** User-visible Raster Layer name. */
  name: string
  /** Project-coordinate origin, independent of the generation bbox. */
  position: { x: number; y: number }
  /** Existing canonical app-owned base, identical to the worker client's staging base. */
  stagingBasePath: string
  worker: ImportWorker
}
export interface PreparedRasterImport {
  /** Sources owned by this preparation until the autosave coordinator copies them. */
  assetSources: Readonly<Record<string, IgsAssetSource>>
  /** The revision read before normalization; compare again when publishing this edit. */
  baseDocumentRevision: string
  /** Remove temporary files after successful coordinator adoption or a rejected edit. Idempotent. */
  dispose: () => Promise<void>
  /** Publish with ProjectAutosaveCoordinator.applyDocument before disposing staging. */
  document: IgsProjectDocumentV1
  layer: RasterLayer
  sourceFormat: VerifiedImportResult['sourceFormat']
  stagingRoot: string
}

type RasterLayer = IgsProjectDocumentV1['layers'][number]

type ImportWorker = Pick<ProjectWorkerClient, 'normalizeImport'>

export class RasterImportError extends Error {
  constructor(
    readonly code:
      | 'IMPORT_INVALID_REQUEST'
      | 'IMPORT_PROJECT_CHANGED'
      | 'IMPORT_SOURCE_CHANGED'
      | 'IMPORT_SOURCE_TOO_LARGE'
      | 'IMPORT_SOURCE_UNAVAILABLE'
      | 'IMPORT_STAGING_INVALID',
    message: string,
  ) {
    super(message)
    this.name = 'RasterImportError'
  }
}

/**
 * Freeze one authorized raster and normalize it in Python, without publishing a document edit. The
 * caller atomically transfers the returned document and sources through the autosave coordinator,
 * then disposes this preparation regardless of adoption success.
 */
export async function importRasterLayer(input: RasterImportInput): Promise<PreparedRasterImport> {
  const initial = input.getDocument()
  if (
    !Number.isSafeInteger(input.insertIndex) ||
    input.insertIndex < 0 ||
    input.insertIndex > initial.layers.length
  ) {
    throw new RasterImportError('IMPORT_INVALID_REQUEST', 'Layer insertion position is invalid.')
  }
  const stagingBase = await canonicalDirectory(input.stagingBasePath)
  const stagingRoot = await mkdtemp(path.join(stagingBase, 'raster-import-'))
  let transferred = false
  try {
    const frozenSource = path.join(stagingRoot, 'source.bin')
    const inputSha256 = await freezeAuthorizedSource(input.authorizedSourcePath, frozenSource)
    const normalized = await input.worker.normalizeImport({
      inputPath: frozenSource,
      inputSha256,
      normalizedPngPath: path.join(stagingRoot, 'normalized.png'),
      originalIccPath: path.join(stagingRoot, 'original.icc'),
      stagingRoot,
    })
    const latest = input.getDocument()
    if (JSON.stringify(latest) !== JSON.stringify(initial)) {
      throw new RasterImportError(
        'IMPORT_PROJECT_CHANGED',
        'The Project changed during import. Retry on the current document.',
      )
    }
    let layerId = randomUUID()
    while (latest.layers.some((layer) => layer.id === layerId)) {
      layerId = randomUUID()
    }
    const layerPath = `assets/layers/${layerId}.png`
    const originalIcc = normalized.originalIcc
    const profilePath = originalIcc ? `assets/profiles/${originalIcc.sha256}.icc` : null
    const layer: RasterLayer = {
      asset: {
        bytes: normalized.normalized.byteSize,
        height: normalized.normalized.height,
        path: layerPath,
        sha256: normalized.normalized.sha256,
        width: normalized.normalized.width,
      },
      blendMode: 'normal',
      id: layerId,
      kind: 'raster',
      locked: false,
      name: input.name,
      opacity: 1,
      ...(originalIcc && profilePath
        ? {
            sourceIccProfile: {
              bytes: originalIcc.byteSize,
              path: profilePath,
              sha256: originalIcc.sha256,
            },
          }
        : {}),
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, ...input.position },
      visible: true,
    }
    const layers = [...latest.layers]
    layers.splice(input.insertIndex, 0, layer)
    const document = { ...latest, layers }
    const assetSources: Record<string, IgsAssetSource> = {
      [layerPath]: { sourcePath: normalized.normalized.path },
    }
    if (originalIcc && profilePath) {
      assetSources[profilePath] = { sourcePath: originalIcc.path }
    }
    transferred = true
    return {
      assetSources,
      baseDocumentRevision: initial.documentRevision,
      dispose: async () => {
        await rm(stagingRoot, { force: true, recursive: true })
      },
      document,
      layer,
      sourceFormat: normalized.sourceFormat,
      stagingRoot,
    }
  } finally {
    if (!transferred) {
      await rm(stagingRoot, { force: true, recursive: true }).catch((error: unknown) => {
        process.emitWarning(`Raster import staging cleanup failed: ${String(error)}`)
      })
    }
  }
}

async function canonicalDirectory(directory: string): Promise<string> {
  if (!path.isAbsolute(directory) || path.resolve(directory) !== directory) {
    throw new RasterImportError('IMPORT_STAGING_INVALID', 'Import staging base must be canonical.')
  }
  try {
    const entry = await lstat(directory)
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      (await realpath(directory)) !== directory
    ) {
      throw new RasterImportError('IMPORT_STAGING_INVALID', 'Import staging base is unsafe.')
    }
  } catch (error) {
    if (error instanceof RasterImportError) {
      throw error
    }
    throw new RasterImportError('IMPORT_STAGING_INVALID', 'Import staging base is unavailable.')
  }
  return directory
}

async function freezeAuthorizedSource(sourcePath: string, destination: string): Promise<string> {
  if (!path.isAbsolute(sourcePath) || path.resolve(sourcePath) !== sourcePath) {
    throw new RasterImportError('IMPORT_INVALID_REQUEST', 'Selected raster path must be canonical.')
  }
  let source: FileHandle
  try {
    if ((await realpath(sourcePath)) !== sourcePath) {
      throw new RasterImportError('IMPORT_SOURCE_UNAVAILABLE', 'Selected raster path is unsafe.')
    }
    source = await open(
      sourcePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
  } catch (error) {
    if (error instanceof RasterImportError) {
      throw error
    }
    throw new RasterImportError('IMPORT_SOURCE_UNAVAILABLE', 'Selected raster is unavailable.')
  }
  let output: FileHandle | undefined
  try {
    const before = await source.stat({ bigint: true })
    if (!before.isFile() || before.isSymbolicLink() || before.size === 0n) {
      throw new RasterImportError('IMPORT_SOURCE_UNAVAILABLE', 'Selected raster is not a file.')
    }
    if (before.size > BigInt(MAX_SOURCE_BYTES)) {
      throw new RasterImportError(
        'IMPORT_SOURCE_TOO_LARGE',
        'Selected raster exceeds the worker limit.',
      )
    }
    output = await open(destination, 'wx', 0o600)
    const digest = createHash('sha256')
    const chunk = Buffer.allocUnsafe(COPY_CHUNK_BYTES)
    let copied = 0
    while (true) {
      const { bytesRead } = await source.read(chunk, 0, chunk.length, null)
      if (bytesRead === 0) {
        break
      }
      copied += bytesRead
      if (copied > MAX_SOURCE_BYTES) {
        throw new RasterImportError(
          'IMPORT_SOURCE_TOO_LARGE',
          'Selected raster exceeds the worker limit.',
        )
      }
      digest.update(chunk.subarray(0, bytesRead))
      let written = 0
      while (written < bytesRead) {
        const result = await output.write(chunk, written, bytesRead - written)
        written += result.bytesWritten
      }
    }
    const after = await source.stat({ bigint: true })
    if (
      copied !== Number(before.size) ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs
    ) {
      throw new RasterImportError(
        'IMPORT_SOURCE_CHANGED',
        'Selected raster changed while importing.',
      )
    }
    await output.sync()
    return digest.digest('hex')
  } finally {
    await output?.close()
    await source.close()
  }
}
