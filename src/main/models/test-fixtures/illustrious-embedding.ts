/** Finite dual-CLIP safetensors for authoring identity; this is not a trained ML-quality fixture. */
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ModelRepository } from '../model-repository.js'

export function illustriousEmbeddingFixture(value = 0.125): Buffer {
  const header: Record<string, { data_offsets: number[]; dtype: string; shape: number[] }> = {}
  const chunks: Buffer[] = []
  let offset = 0
  for (const [key, width] of [
    ['clip_l', 768],
    ['clip_g', 1280],
  ] as const) {
    const bytes = Buffer.alloc(width * 4)
    for (let index = 0; index < width; index++) {
      bytes.writeFloatLE(value, index * 4)
    }
    header[key] = { data_offsets: [offset, offset + bytes.length], dtype: 'F32', shape: [1, width] }
    chunks.push(bytes)
    offset += bytes.length
  }
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
) {
  const bytes = illustriousEmbeddingFixture(value)
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
