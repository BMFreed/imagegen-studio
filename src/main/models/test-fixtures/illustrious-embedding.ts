/** Finite dual-CLIP safetensors for authoring identity; this is not a trained ML-quality fixture. */
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ModelRepository } from '../model-repository.js'

export type EmbeddingHeaderFixture = Record<string, unknown>
export interface EmbeddingFixtureOptions {
  dtype?: 'BF16' | 'F16' | 'F32'
  editHeader?: (header: EmbeddingHeaderFixture) => void
  singleton?: boolean
  vectors?: number
}

export function illustriousEmbeddingFixture(
  value = 0.125,
  options: EmbeddingFixtureOptions = {},
): Buffer {
  const header: EmbeddingHeaderFixture = {}
  const dtype = options.dtype ?? 'F32'
  const vectors = options.vectors ?? 1
  const stride = dtype === 'F32' ? 4 : 2
  const chunks: Buffer[] = []
  let offset = 0
  for (const [key, width] of [
    ['clip_l', 768],
    ['clip_g', 1280],
  ] as const) {
    const bytes = Buffer.alloc(vectors * width * stride)
    for (let index = 0; index < vectors * width; index++) {
      if (dtype === 'F32') {
        bytes.writeFloatLE(value, index * stride)
      } else {
        const scalar = Buffer.alloc(4)
        scalar.writeFloatLE(value)
        const bits = scalar.readUInt32LE()
        bytes.writeUInt16LE(dtype === 'BF16' ? bits >>> 16 : halfFloat(bits), index * stride)
      }
    }
    header[key] = {
      data_offsets: [offset, offset + bytes.length],
      dtype,
      shape: options.singleton ? [width] : [vectors, width],
    }
    chunks.push(bytes)
    offset += bytes.length
  }
  options.editHeader?.(header)
  const json = Buffer.from(JSON.stringify(header))
  const padded = Buffer.concat([json, Buffer.alloc((8 - (json.length % 8)) % 8, 0x20)])
  const prefix = Buffer.alloc(8)
  prefix.writeBigUInt64LE(BigInt(padded.length))
  return Buffer.concat([prefix, padded, ...chunks])
}

export async function publishIllustriousEmbeddingFixture(
  repository: ModelRepository,
  root: string,
  modelId: number,
  versionId: number,
  originalFilename = 'clean-style.safetensors',
  value = 0.125,
  options: EmbeddingFixtureOptions = {},
) {
  const bytes = illustriousEmbeddingFixture(value, options)
  const managedPath = path.join(root, `embedding-${modelId}-${versionId}.safetensors`)
  await writeFile(managedPath, bytes)
  const digest = createHash('sha256').update(bytes).digest('hex')
  const published = await repository.publishVerifiedInstallation({
    primary: {
      file: {
        managedPath,
        originalFilename,
        sha256: digest,
        sizeBytes: bytes.length,
        verifiedAt: '2026-10-04T00:00:00.000Z',
      },
      resource: {
        displayName: `Embedding ${modelId}`,
        source: { kind: 'civitai', modelId },
        sourceMetadata: {},
        type: 'embedding',
      },
      version: {
        baseModelFamily: 'illustrious',
        format: 'safetensors',
        name: `v${versionId}`,
        source: { expectedSha256: digest, fileId: versionId + 1000, kind: 'civitai', versionId },
        sourceMetadata: { trainedWords: ['source-search-phrase'] },
      },
    },
  })
  return { ...published, bytes, managedPath }
}

function halfFloat(bits: number): number {
  const sign = (bits >>> 16) & 0x80_00
  const exponent = ((bits >>> 23) & 0xff) - 127 + 15
  const fraction = bits & 0x7f_ff_ff
  if (exponent >= 31) {
    return sign | 0x7c_00 | (fraction ? 0x02_00 : 0)
  }
  if (exponent <= 0) {
    return sign | (exponent < -10 ? 0 : (fraction | 0x80_00_00) >>> (14 - exponent))
  }
  return sign | (exponent << 10) | (fraction >>> 13)
}
