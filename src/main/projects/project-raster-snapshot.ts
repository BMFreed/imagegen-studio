import {
  type IgsProjectDocumentV1,
  type IgsRasterLayerV1,
  parseProjectDocumentV1,
  projectActiveRasterContributions,
} from '../../shared/projects/project-schema.js'

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ComposePreviewInput } from './worker-client.js'

import { type IgsAssetSource, readIgsPackage } from './igs-package.js'
import { withProjectPathLock } from './project-path-lock.js'

const COPY_CHUNK_BYTES = 1024 * 1024
export interface FrozenRasterComposition {
  /** A validated copy captured before the first filesystem await. */
  document: IgsProjectDocumentV1
  /** Main-owned, verified file snapshots in visible Project stack order. */
  layers: ComposePreviewInput['layers']
  stagingRoot: string
}
export type RasterCompositionScope = { beneathLayerId: string }
type RasterLayer = IgsRasterLayerV1

type RasterAsset = RasterLayer['asset']

type FrozenSource = IgsAssetSource | null

/** Project stack order is top first; each Patch contributes only its active frozen world raster. */
export function compositionRasterLayers(
  document: IgsProjectDocumentV1,
  scope?: RasterCompositionScope,
): IgsRasterLayerV1[] {
  let scoped = document
  if (scope) {
    const index = document.layers.findIndex((layer) => layer.id === scope.beneathLayerId)
    if (index < 0) {
      throw new Error('The captured composition owner no longer exists.')
    }
    scoped = { ...document, layers: document.layers.slice(index + 1) }
  }
  return projectActiveRasterContributions(scoped).filter(
    (layer) => layer.visible && layer.opacity > 0,
  )
}

/**
 * Freeze all visible raster inputs before invoking a worker. Saved members are extracted under the
 * same in-process path lock as Save; pending sources are verified against the captured document.
 * Scratch files stay alive for the callback, unless its owner retains them for an unconfirmed
 * worker exit. They are never candidate or Project assets.
 */
export async function withFrozenRasterComposition<T>(
  input: {
    document: IgsProjectDocumentV1
    packagePath: string
    pendingSource: (asset: RasterAsset) => IgsAssetSource | null
    scope?: RasterCompositionScope
    scratchBasePath: string
    /** A live child may retain its inputs until physical exit has been confirmed. */
    shouldCleanupStaging?: () => boolean
    stagePrefix: string
  },
  use: (composition: FrozenRasterComposition) => Promise<T>,
): Promise<T> {
  const shouldCleanupStaging = input.shouldCleanupStaging
  // Do this before any await: a concurrent Project edit cannot alter the settings or asset refs
  // being frozen. Copy pending byte sources too, because the original Buffer may be reused.
  const document = parseProjectDocumentV1(structuredClone(input.document))
  const visible = compositionRasterLayers(document, input.scope)
  const sources = new Map<string, { asset: RasterAsset; source: FrozenSource }>()
  for (const layer of visible) {
    const key = assetKey(layer.asset)
    if (!sources.has(key)) {
      const pending = input.pendingSource(layer.asset)
      sources.set(key, {
        asset: layer.asset,
        source: pending && 'bytes' in pending ? { bytes: Buffer.from(pending.bytes) } : pending,
      })
    }
  }

  if (
    !path.isAbsolute(input.scratchBasePath) ||
    path.resolve(input.scratchBasePath) !== input.scratchBasePath
  ) {
    throw new Error('Project composition staging must be absolute.')
  }
  await mkdir(input.scratchBasePath, { recursive: true })
  const root = await realpath(input.scratchBasePath)
  if (root !== input.scratchBasePath || !(await lstat(root)).isDirectory()) {
    throw new Error('Project composition staging is unavailable.')
  }
  const stage = await mkdtemp(path.join(root, input.stagePrefix))
  try {
    const frozen = new Map<string, string>()
    const saved = new Map<string, { asset: RasterAsset; filePath: string }>()
    for (const [key, { asset, source }] of sources) {
      const filePath = path.join(
        stage,
        `layer-${frozen.size}${asset.path.endsWith('.webp') ? '.webp' : '.png'}`,
      )
      frozen.set(key, filePath)
      if (source) {
        await freezePendingSource(source, filePath, asset)
      } else {
        saved.set(key, { asset, filePath })
      }
    }
    if (saved.size > 0) {
      await withProjectPathLock(input.packagePath, async () => {
        const archive = await readIgsPackage(input.packagePath)
        if (archive.project.documentId !== document.documentId) {
          throw new Error('The saved Project identity changed while freezing raster inputs.')
        }
        for (const { asset, filePath } of saved.values()) {
          const member = archive.manifest.members.find((entry) => entry.path === asset.path)
          if (!member || member.bytes !== asset.bytes || member.sha256 !== asset.sha256) {
            throw new Error('The saved Raster Layer changed before generation input was frozen.')
          }
          await archive.extractMemberToFile(asset.path, filePath)
        }
      })
    }
    const layers = visible.map((layer) => ({
      blendMode: layer.blendMode,
      height: layer.asset.height,
      opacity: layer.opacity,
      path: frozen.get(assetKey(layer.asset))!,
      sha256: layer.asset.sha256,
      transform: layer.transform,
      width: layer.asset.width,
    }))
    return await use({ document, layers, stagingRoot: stage })
  } finally {
    if (shouldCleanupStaging?.() ?? true) {
      await rm(stage, { force: true, recursive: true }).catch((error: unknown) => {
        process.emitWarning(`Project composition staging cleanup failed: ${String(error)}`)
      })
    } else {
      process.emitWarning(
        'Project composition staging retained because worker exit is unconfirmed.',
      )
    }
  }
}

function assetKey(asset: RasterAsset): string {
  return `${asset.path}:${asset.sha256}:${asset.bytes}`
}

async function freezePendingSource(
  source: IgsAssetSource,
  destination: string,
  asset: RasterAsset,
): Promise<void> {
  if ('bytes' in source) {
    const bytes = source.bytes
    if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256) {
      throw new Error('The pending Raster Layer changed before composition.')
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
      throw new Error('The pending Raster Layer source changed during composition.')
    }
  } finally {
    await writer?.close()
    await reader.close()
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
