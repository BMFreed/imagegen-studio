import type {
  IgsProjectDocumentV1,
  IgsSmartPatchLayerV1,
} from '../../../shared/projects/project-schema.js'

import { createHash, randomUUID } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'

import { encodeProjectMaskPng } from '../project-mask.js'

export const fixtureMaskAlpha = [0, 64, 128, 255]
export const fixtureMaskPng = (): Buffer =>
  encodeProjectMaskPng(Uint8Array.from(fixtureMaskAlpha), 2, 2)

/** A genuine owned descriptor; the actual codec supplies its PNG fixture bytes. */
export function paintedPatchFixture(
  document: IgsProjectDocumentV1,
  png = fixtureMaskPng(),
): IgsSmartPatchLayerV1 {
  const maskId = randomUUID()
  const sha256 = createHash('sha256').update(png).digest('hex')
  return {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { height: 768, width: 512, x: 800, y: -500 },
    generationDraft: structuredClone(document.generationDraft),
    id: randomUUID(),
    internalResolution: { height: 384, width: 256 },
    kind: 'smart-patch',
    locked: false,
    mask: {
      asset: {
        bytes: png.length,
        height: 2,
        path: `assets/masks/${maskId}/${sha256}.png`,
        sha256,
        width: 2,
      },
      bounds: { height: 2, width: 2, x: -9, y: 13 },
      id: maskId,
      revision: 1,
    },
    name: 'Painted Patch',
    opacity: 1,
    rasterSubLayers: [],
    visible: true,
  }
}

/** Valid PNG/CRCs and dimensions, with one black RGB byte: this is a coverage-format fault. */
export function invalidMaskRgbFixture(): Buffer {
  const rows = Buffer.from([
    0, 0, 255, 255, 0, 255, 255, 255, 64, 0, 255, 255, 255, 128, 255, 255, 255, 255,
  ])
  const header = Buffer.from([0, 0, 0, 2, 0, 0, 0, 2, 8, 6, 0, 0, 0])
  const chunk = (name: string, data: Buffer): Buffer => {
    const value = Buffer.alloc(data.length + 12)
    value.writeUInt32BE(data.length, 0)
    value.write(name, 4, 4, 'ascii')
    data.copy(value, 8)
    value.writeUInt32BE(crc32(value.subarray(4, -4)), value.length - 4)
    return value
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
