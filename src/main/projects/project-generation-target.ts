import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type { IgsProjectDocumentV1, IgsRectV1 } from '../../shared/projects/project-schema.js'

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import path from 'node:path'

import type { IgsAssetSource } from './igs-package.js'
import type { ComposeTargetMode, ProjectWorkerClient } from './worker-client.js'

import { validateSrgbPngStream } from './igs-package.js'
import { withFrozenRasterComposition } from './project-raster-snapshot.js'

// A defensive read ceiling matching the current worker protocol, not a measured generation limit.
const MAX_TARGET_BYTES = 32 * 1024 * 1024
export interface FrozenGenerationTarget {
  bbox: IgsRectV1
  composite: {
    bytes: Buffer
    byteSize: number
    colorSpace: 'srgb'
    height: number
    iccSha256: string
    sha256: string
    width: number
  }
  documentRevision: string
  generationDraft: IgsProjectDocumentV1['generationDraft']
  mode: ComposeTargetMode
}
type RasterAsset = IgsProjectDocumentV1['layers'][number]['asset']

type TargetWorker = Pick<ProjectWorkerClient, 'composeTarget'>

/**
 * Build one finite, world-space generation input from the exact Project snapshot. The Project can
 * change after capture: the returned bbox, draft and pixels do not. The worker does not choose the
 * source files or retain the scratch directory after this call.
 */
export async function buildFrozenGenerationTarget(input: {
  document: IgsProjectDocumentV1
  packagePath: string
  pendingSource: (asset: RasterAsset) => IgsAssetSource | null
  scratchBasePath: string
  worker: TargetWorker
}): Promise<FrozenGenerationTarget> {
  return await withFrozenRasterComposition(
    { ...input, stagePrefix: 'project-target-' },
    async ({ document, layers, stagingRoot }) => {
      const bbox = { ...document.primaryBbox }
      const targetPngPath = path.join(stagingRoot, 'target.png')
      const result = await input.worker.composeTarget({
        // Do not let an adapter mutate the bbox we use to verify and return this snapshot.
        bbox: { ...bbox },
        layers,
        stagingRoot,
        targetPngPath,
      })
      if (
        result.composite.path !== targetPngPath ||
        !sameRect(result.rect, bbox) ||
        result.composite.width !== bbox.width ||
        result.composite.height !== bbox.height ||
        result.composite.colorSpace !== 'srgb' ||
        result.composite.iccSha256 !== IGS_SRGB_ICC_SHA256 ||
        !['img2img', 'outpaint', 'txt2img'].includes(result.mode)
      ) {
        throw new Error('The generation target differs from its frozen Project inputs.')
      }
      const bytes = await readVerifiedTarget(
        targetPngPath,
        result.composite.sha256,
        result.composite.byteSize,
        bbox,
      )
      return {
        bbox,
        composite: {
          bytes,
          byteSize: bytes.length,
          colorSpace: 'srgb',
          height: bbox.height,
          iccSha256: IGS_SRGB_ICC_SHA256,
          sha256: result.composite.sha256,
          width: bbox.width,
        },
        documentRevision: document.documentRevision,
        generationDraft: document.generationDraft,
        mode: result.mode,
      }
    },
  )
}

async function readVerifiedTarget(
  filePath: string,
  expectedSha256: string,
  expectedBytes: number,
  bbox: IgsRectV1,
): Promise<Buffer> {
  const file = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const before = await file.stat({ bigint: true })
    if (
      !before.isFile() ||
      before.size < 1n ||
      before.size > BigInt(MAX_TARGET_BYTES) ||
      before.size !== BigInt(expectedBytes)
    ) {
      throw new Error('The generation target is not a bounded, expected output file.')
    }
    const bytes = await file.readFile()
    const after = await file.stat({ bigint: true })
    const atPath = await lstat(filePath, { bigint: true })
    if (
      bytes.length !== expectedBytes ||
      createHash('sha256').update(bytes).digest('hex') !== expectedSha256 ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      before.dev !== atPath.dev ||
      before.ino !== atPath.ino ||
      atPath.isSymbolicLink()
    ) {
      throw new Error('The generation target changed while being verified.')
    }
    await validateSrgbPngStream(
      (async function* () {
        yield bytes
      })(),
      'target.png',
      MAX_TARGET_BYTES,
      Math.max(bbox.width, bbox.height),
    )
    if (
      bytes.readUInt32BE(16) !== bbox.width ||
      bytes.readUInt32BE(20) !== bbox.height ||
      bytes[25] !== 6 ||
      !hasIccProfile(bytes)
    ) {
      throw new Error('The generation target is not the expected ICC-tagged RGBA image.')
    }
    return bytes
  } finally {
    await file.close()
  }
}

function hasIccProfile(png: Buffer): boolean {
  let offset = 8
  while (offset + 12 <= png.length) {
    const size = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    if (type === 'iCCP') {
      return true
    }
    offset += size + 12
  }
  return false
}

function sameRect(left: IgsRectV1, right: IgsRectV1): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}
