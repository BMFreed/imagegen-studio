import type {
  IgsProjectDocumentV1,
  IgsRasterLayerV1,
} from '../../shared/projects/project-schema.js'

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import path from 'node:path'

import type { IgsAssetSource } from './igs-package.js'
import type { RenderedProjectPreview } from './project-session.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { compositionRasterLayers, withFrozenRasterComposition } from './project-raster-snapshot.js'

const THUMBNAIL_MAX_SIDE = 256
export type ProjectPreviewResult =
  | { documentRevision: string; kind: 'empty' }
  | { kind: 'rendered'; preview: RenderedProjectPreview }
type RasterLayer = IgsRasterLayerV1

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
  if (compositionRasterLayers(input.document).length === 0) {
    return { documentRevision: input.document.documentRevision, kind: 'empty' }
  }
  return await withFrozenRasterComposition(
    { ...input, stagePrefix: 'project-preview-' },
    async ({ document, layers, stagingRoot }) => {
      const result = await input.worker.composePreview({
        layers,
        mergedPngPath: path.join(stagingRoot, 'merged.png'),
        stagingRoot,
        thumbnailMaxSide: THUMBNAIL_MAX_SIDE,
        thumbnailWebpPath: path.join(stagingRoot, 'thumbnail.webp'),
      })
      if (result.status === 'empty') {
        return { documentRevision: document.documentRevision, kind: 'empty' }
      }
      const [merged, thumbnail] = await Promise.all([
        readVerifiedOutput(result.merged.path, result.merged.sha256, result.merged.byteSize),
        readVerifiedOutput(
          result.thumbnail.path,
          result.thumbnail.sha256,
          result.thumbnail.byteSize,
        ),
      ])
      return {
        kind: 'rendered',
        preview: {
          documentRevision: document.documentRevision,
          merged,
          rect: result.rect,
          thumbnail,
        },
      }
    },
  )
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
