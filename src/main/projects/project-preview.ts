import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { RenderedProjectPreview } from './project-session.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { type IgsAssetSource, readIgsPackage } from './igs-package.js'

const THUMBNAIL_MAX_SIDE = 256
const COPY_CHUNK_BYTES = 1024 * 1024

export type ProjectPreviewResult =
  | { documentRevision: string; kind: 'empty' }
  | { kind: 'rendered'; preview: RenderedProjectPreview }
type RasterLayer = IgsProjectDocumentV1['layers'][number]

type PreviewWorker = Pick<ProjectWorkerClient, 'composePreview'>

/**
 * Freeze the document's referenced visible pixels in main-owned scratch before asking the worker to
 * compose them. Neither renderer pixels nor mutable source paths are sent to the worker.
 */
export async function buildProjectPreview(input: {
  document: IgsProjectDocumentV1
  packagePath: string
  pendingSource: (asset: RasterLayer['asset']) => IgsAssetSource | null
  scratchBasePath: string
  worker: PreviewWorker
}): Promise<ProjectPreviewResult> {
  const visible = input.document.layers.filter((layer) => layer.visible && layer.opacity > 0)
  if (visible.length === 0) {
    return { documentRevision: input.document.documentRevision, kind: 'empty' }
  }

  await mkdir(input.scratchBasePath, { recursive: true })
  const root = await realpath(input.scratchBasePath)
  if (root !== input.scratchBasePath || !(await lstat(root)).isDirectory()) {
    throw new Error('Project preview staging is unavailable.')
  }
  const stage = await mkdtemp(path.join(root, 'project-preview-'))
  try {
    const archive = await readIgsPackage(input.packagePath)
    const frozen = new Map<string, string>()
    const layers = [] as Parameters<PreviewWorker['composePreview']>[0]['layers']
    for (const layer of visible) {
      const key = `${layer.asset.path}:${layer.asset.sha256}`
      let filePath = frozen.get(key)
      if (!filePath) {
        filePath = path.join(
          stage,
          `layer-${frozen.size}${layer.asset.path.endsWith('.webp') ? '.webp' : '.png'}`,
        )
        const source = input.pendingSource(layer.asset)
        await (source
          ? freezePendingSource(source, filePath, layer.asset)
          : archive.extractMemberToFile(layer.asset.path, filePath))
        frozen.set(key, filePath)
      }
      layers.push({
        blendMode: layer.blendMode,
        height: layer.asset.height,
        opacity: layer.opacity,
        path: filePath,
        sha256: layer.asset.sha256,
        transform: layer.transform,
        width: layer.asset.width,
      })
    }
    const result = await input.worker.composePreview({
      layers,
      mergedPngPath: path.join(stage, 'merged.png'),
      stagingRoot: stage,
      thumbnailMaxSide: THUMBNAIL_MAX_SIDE,
      thumbnailWebpPath: path.join(stage, 'thumbnail.webp'),
    })
    if (result.status === 'empty') {
      return { documentRevision: input.document.documentRevision, kind: 'empty' }
    }
    const [merged, thumbnail] = await Promise.all([
      readVerifiedOutput(result.merged.path, result.merged.sha256, result.merged.byteSize),
      readVerifiedOutput(result.thumbnail.path, result.thumbnail.sha256, result.thumbnail.byteSize),
    ])
    return {
      kind: 'rendered',
      preview: {
        documentRevision: input.document.documentRevision,
        merged,
        rect: result.rect,
        thumbnail,
      },
    }
  } finally {
    await rm(stage, { force: true, recursive: true }).catch((error: unknown) => {
      process.emitWarning(`Project preview staging cleanup failed: ${String(error)}`)
    })
  }
}

async function freezePendingSource(
  source: IgsAssetSource,
  destination: string,
  asset: RasterLayer['asset'],
): Promise<void> {
  if ('bytes' in source) {
    const bytes = Buffer.from(source.bytes)
    if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256) {
      throw new Error('The pending Raster Layer changed before preview rendering.')
    }
    await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 })
    return
  }

  const sourcePath = source.sourcePath
  if (!path.isAbsolute(sourcePath) || (await realpath(sourcePath)) !== sourcePath) {
    throw new Error('The pending Raster Layer source is unsafe.')
  }
  const reader = await open(
    sourcePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  let writer: Awaited<ReturnType<typeof open>> | undefined
  try {
    const before = await reader.stat({ bigint: true })
    if (!before.isFile() || before.size !== BigInt(asset.bytes)) {
      throw new Error('The pending Raster Layer source changed.')
    }
    writer = await open(destination, 'wx', 0o600)
    const digest = createHash('sha256')
    const chunk = Buffer.allocUnsafe(COPY_CHUNK_BYTES)
    let copied = 0
    while (true) {
      const { bytesRead } = await reader.read(chunk, 0, chunk.length, null)
      if (bytesRead === 0) {
        break
      }
      copied += bytesRead
      if (copied > asset.bytes) {
        throw new Error('The pending Raster Layer source grew.')
      }
      digest.update(chunk.subarray(0, bytesRead))
      let written = 0
      while (written < bytesRead) {
        const result = await writer.write(chunk, written, bytesRead - written)
        written += result.bytesWritten
      }
    }
    const after = await reader.stat({ bigint: true })
    if (
      copied !== asset.bytes ||
      digest.digest('hex') !== asset.sha256 ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    ) {
      throw new Error('The pending Raster Layer source changed during preview rendering.')
    }
  } finally {
    await writer?.close()
    await reader.close()
  }
}

async function readVerifiedOutput(
  filePath: string,
  expectedSha256: string,
  expectedBytes: number,
): Promise<Buffer> {
  const file = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const before = await file.stat({ bigint: true })
    if (!before.isFile() || before.size !== BigInt(expectedBytes)) {
      throw new Error('The Project preview output changed.')
    }
    const bytes = await file.readFile()
    const after = await file.stat({ bigint: true })
    if (
      bytes.length !== expectedBytes ||
      sha256(bytes) !== expectedSha256 ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      (await lstat(filePath)).isSymbolicLink()
    ) {
      throw new Error('The Project preview output changed during verification.')
    }
    return bytes
  } finally {
    await file.close()
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
