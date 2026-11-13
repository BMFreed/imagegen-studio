import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  isProjectImageExportRect,
  isProjectImageExportRegion,
  type ProjectImageExportRegion,
  type ProjectImageExportResult,
} from '../../shared/projects/project-image-export.js'
import type {
  IgsProjectDocumentV1,
  IgsRasterLayerV1,
} from '../../shared/projects/project-schema.js'

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import path from 'node:path'

import type { IgsAssetSource } from './igs-package.js'
import type { CandidateImageDestinationSelection } from './project-candidate-image-export.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { validateSrgbPngStream } from './igs-package.js'
import { writeCandidateImageCreateOnly } from './project-candidate-image-export.js'
import { compositionRasterLayers, withFrozenRasterComposition } from './project-raster-snapshot.js'
import { ProjectWorkerError } from './worker-client.js'

// Existing merged-image byte ceiling, independent of generation's 32MiB/4M-pixel envelope.
const MAX_EXPORT_BYTES = 256 * 1024 * 1024

export class ProjectImageExportError extends Error {
  constructor(
    readonly code:
      | 'PROJECT_IMAGE_EXPORT_CHANGED'
      | 'PROJECT_IMAGE_EXPORT_EMPTY'
      | 'PROJECT_IMAGE_EXPORT_INVALID_DESTINATION'
      | 'PROJECT_IMAGE_EXPORT_INVALID_INPUT'
      | 'PROJECT_IMAGE_EXPORT_INVALID_OUTPUT',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectImageExportError'
  }
}

/**
 * Invoke4875 exportCanvasComposite/exportRasterComposite snapshot + content/rect adaptation.
 * Studio's frozen-raster/CPU and create-only publication owners retain canonical color and files.
 * This function neither accepts results nor saves, edits or crops the Project.
 */
export async function exportProjectImage(input: {
  assertCurrent: () => void
  chooseDestination: (defaultFileName: string) => Promise<CandidateImageDestinationSelection>
  document: IgsProjectDocumentV1
  packagePath: string
  pendingSource: (asset: IgsRasterLayerV1['asset']) => IgsAssetSource | null
  region: ProjectImageExportRegion
  scratchBasePath: string
  worker: Pick<ProjectWorkerClient, 'composeExport'>
}): Promise<ProjectImageExportResult> {
  if (!isProjectImageExportRegion(input.region)) {
    throw new ProjectImageExportError(
      'PROJECT_IMAGE_EXPORT_INVALID_INPUT',
      'Choose a supported image export region.',
    )
  }
  input.assertCurrent()
  if (compositionRasterLayers(input.document).length === 0) {
    empty()
  }
  let retainWorkerInputs = false
  return await withFrozenRasterComposition(
    { ...input, shouldCleanupStaging: () => !retainWorkerInputs, stagePrefix: 'project-export-' },
    async ({ document, layers, stagingRoot }) => {
      input.assertCurrent()
      const expectedPath = path.join(stagingRoot, 'export.png')
      const bbox = input.region === 'bbox' ? { ...document.primaryBbox } : undefined
      let result: Awaited<ReturnType<ProjectWorkerClient['composeExport']>>
      try {
        result = structuredClone(
          await input.worker.composeExport({
            ...(bbox ? { bbox: { ...bbox } } : {}),
            compositePngPath: expectedPath,
            layers: structuredClone(layers),
            stagingRoot,
          }),
        )
      } catch (error) {
        if (error instanceof ProjectWorkerError && error.code === 'WORKER_EXIT_UNCONFIRMED') {
          retainWorkerInputs = true
        }
        throw error
      }
      input.assertCurrent()
      if (result.status === 'empty') {
        empty()
      }
      const { composite, rect } = result
      if (
        result.status !== 'rendered' ||
        !isProjectImageExportRect(rect) ||
        (bbox &&
          (rect.x !== bbox.x ||
            rect.y !== bbox.y ||
            rect.width !== bbox.width ||
            rect.height !== bbox.height)) ||
        composite.path !== expectedPath ||
        composite.width !== rect.width ||
        composite.height !== rect.height ||
        composite.colorSpace !== 'srgb' ||
        composite.iccSha256 !== IGS_SRGB_ICC_SHA256 ||
        !Number.isSafeInteger(composite.byteSize) ||
        composite.byteSize < 1 ||
        composite.byteSize > MAX_EXPORT_BYTES ||
        !/^[a-f0-9]{64}$/.test(composite.sha256)
      ) {
        invalidOutput()
      }
      const bytes = await readVerifiedExport(
        expectedPath,
        composite.sha256,
        composite.byteSize,
        rect.width,
        rect.height,
      )
      input.assertCurrent()
      const chosen = await input.chooseDestination(
        input.region === 'bbox' ? 'generation-bbox.png' : 'canvas.png',
      )
      input.assertCurrent()
      if (chosen.canceled) {
        return { kind: 'canceled' }
      }
      const destination = imageDestination(chosen.filePath)
      let staleAtPublication: unknown
      try {
        await writeCandidateImageCreateOnly(destination, bytes, {
          beforePublish: async () => {
            try {
              input.assertCurrent()
            } catch (error) {
              staleAtPublication = error
              throw error
            }
          },
        })
      } catch (error) {
        // Preserve the source-owner refusal rather than the writer's generic I/O wrapping.
        throw staleAtPublication ?? error
      }
      return { fileName: path.basename(destination), kind: 'exported', rect: { ...rect } }
    },
  )
}

function empty(): never {
  throw new ProjectImageExportError(
    'PROJECT_IMAGE_EXPORT_EMPTY',
    'There is no visible raster content to export. You can still save the Project.',
  )
}

function invalidOutput(): never {
  throw new ProjectImageExportError(
    'PROJECT_IMAGE_EXPORT_INVALID_OUTPUT',
    'The composited image could not be verified. The destination was not changed.',
  )
}

/** Same native PNG destination rule as candidate-image export, without changing that consumer. */
function imageDestination(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !path.isAbsolute(value) ||
    path.resolve(value) !== value ||
    value.includes('\0')
  ) {
    throw new ProjectImageExportError(
      'PROJECT_IMAGE_EXPORT_INVALID_DESTINATION',
      'Choose an absolute .png filename for the image.',
    )
  }
  const extension = path.extname(value)
  if (extension === '') {
    return `${value}.png`
  }
  if (extension.toLowerCase() !== '.png') {
    throw new ProjectImageExportError(
      'PROJECT_IMAGE_EXPORT_INVALID_DESTINATION',
      'Choose a .png filename for the image.',
    )
  }
  return value
}

/** Existing generation-target verified-read mechanism, with the separate image export ceiling. */
async function readVerifiedExport(
  filePath: string,
  expectedSha256: string,
  expectedBytes: number,
  width: number,
  height: number,
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
      before.size > BigInt(MAX_EXPORT_BYTES) ||
      before.size !== BigInt(expectedBytes)
    ) {
      invalidOutput()
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
      atPath.isSymbolicLink() ||
      before.dev !== atPath.dev ||
      before.ino !== atPath.ino
    ) {
      invalidOutput()
    }
    await validateSrgbPngStream(
      (async function* () {
        yield bytes
      })(),
      'export.png',
      MAX_EXPORT_BYTES,
      Math.max(width, height),
    )
    if (bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height || bytes[25] !== 6) {
      invalidOutput()
    }
    let offset = 8
    let tagged = false
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset)
      if (bytes.toString('ascii', offset + 4, offset + 8) === 'iCCP') {
        tagged = true
      }
      offset += size + 12
    }
    if (!tagged) {
      invalidOutput()
    }
    return bytes
  } finally {
    await file.close()
  }
}
