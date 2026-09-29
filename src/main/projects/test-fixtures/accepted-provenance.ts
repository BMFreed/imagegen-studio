import { IGS_SRGB_ICC_SHA256 } from '../../../shared/projects/color-profile.js'
import type {
  IgsProjectDocumentV1,
  IgsRasterGenerationProvenanceV1,
} from '../../../shared/projects/project-schema.js'

import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

/** A real ICC-tagged image, so ZIP/shadow tests retain realistic accepted bytes. */
export async function acceptedOutputPngFixture(width = 8, height = 8): Promise<Buffer> {
  const profile = await readFile(path.resolve('worker-python/src/imagegen_worker/srgb.icc'))
  const profileSha256 = createHash('sha256').update(profile).digest('hex')
  if (profileSha256 !== IGS_SRGB_ICC_SHA256) {
    throw new Error('Bundled sRGB profile no longer matches the accepted-output fixture.')
  }
  const chunk = (name: string, payload: Buffer): Buffer => {
    const type = Buffer.from(name, 'ascii')
    const result = Buffer.alloc(12 + payload.length)
    result.writeUInt32BE(payload.length, 0)
    type.copy(result, 4)
    payload.copy(result, 8)
    result.writeUInt32BE(crc32(Buffer.concat([type, payload])), payload.length + 8)
    return result
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // 8-bit RGBA.
  header[9] = 6
  const rowBytes = 1 + width * 4
  const scanlines = Buffer.alloc(rowBytes * height)
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const offset = row * rowBytes + 1 + column * 4
      scanlines[offset] = 37
      scanlines[offset + 1] = 94
      scanlines[offset + 2] = 181
      scanlines[offset + 3] = 255
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(profile)])),
    chunk('IDAT', deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A complete frozen Illustrious result, used only as input to real storage boundaries. */
export function acceptedRasterProvenanceFixture(
  sourceDocument: IgsProjectDocumentV1,
  output: Buffer,
  bbox: { height: number; width: number; x: number; y: number },
): IgsRasterGenerationProvenanceV1 {
  const candidateId = randomUUID()
  return {
    executionResultContext: {
      acceptedAt: '2026-09-29T10:01:00.000Z',
      candidateId,
      completedAt: '2026-09-29T10:00:00.000Z',
      output: {
        byteSize: output.length,
        colorSpace: 'srgb',
        format: 'png',
        height: bbox.height,
        iccSha256: IGS_SRGB_ICC_SHA256,
        sha256: createHash('sha256').update(output).digest('hex'),
        width: bbox.width,
      },
      queueItemId: candidateId,
    },
    generationConfiguration: {
      mode: 'txt2img',
      model: {
        baseModelFamily: 'illustrious',
        civitaiFileId: null,
        civitaiModelId: null,
        civitaiVersionId: null,
        displayName: 'Verified checkpoint',
        fileSha256: 'a'.repeat(64),
        kind: 'checkpoint',
        localModelId: randomUUID(),
        localVersionId: randomUUID(),
        predictionType: 'epsilon',
        versionName: 'v1',
      },
      negativePrompt: { embeddingRefs: [], text: 'blur' },
      positivePrompt: { embeddingRefs: [], text: 'a red lantern' },
      sampling: {
        actualSeed: 42,
        cfgScale: 7.5,
        invokeScheduler: 'dpmpp_2m_k',
        requestedSeedPolicy: 'random',
        sampler: 'DPM++ 2M',
        scheduler: 'Karras',
        steps: 24,
      },
      size: { height: bbox.height, width: bbox.width },
    },
    kind: 'illustrious-txt2img',
    layerSourceContext: {
      bbox,
      sourceDocumentId: sourceDocument.documentId,
      sourceDocumentRevision: sourceDocument.documentRevision,
      sourceTargetSha256: 'b'.repeat(64),
    },
    schemaVersion: 1,
  }
}
