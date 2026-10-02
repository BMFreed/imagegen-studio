/** Real ordinary Kohya F32 low-rank tensors for a fixed SDXL UNet attention module. */
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ModelRepository } from '../model-repository.js'

export function illustriousLoraFixture(value = 0.125): Buffer {
  const module = 'lora_unet_down_blocks_1_attentions_0_transformer_blocks_0_attn1_to_q'
  const header: Record<string, { data_offsets: number[]; dtype: string; shape: number[] }> = {}
  const chunks: Buffer[] = []
  let offset = 0
  for (const [suffix, shape] of [
    ['lora_down.weight', [1, 640]],
    ['lora_up.weight', [640, 1]],
    ['alpha', []],
  ] as const) {
    const count = shape.reduce<number>((total, dimension) => total * dimension, 1)
    const bytes = Buffer.alloc(count * 4)
    for (let index = 0; index < count; index++) {
      bytes.writeFloatLE(suffix === 'alpha' ? 1 : value, index * 4)
    }
    header[`${module}.${suffix}`] = {
      data_offsets: [offset, offset + bytes.length],
      dtype: 'F32',
      shape: [...shape],
    }
    chunks.push(bytes)
    offset += bytes.length
  }
  const json = Buffer.from(JSON.stringify(header))
  const padded = Buffer.concat([json, Buffer.alloc((8 - (json.length % 8)) % 8, 0x20)])
  const prefix = Buffer.alloc(8)
  prefix.writeBigUInt64LE(BigInt(padded.length))
  return Buffer.concat([prefix, padded, ...chunks])
}

/** Real registry publication; callers still enter ModelService for identity/file qualification. */
export async function publishIllustriousLoraFixture(
  repository: ModelRepository,
  root: string,
  modelId: number,
  versionId: number,
  value = 0.125,
) {
  const bytes = illustriousLoraFixture(value)
  const managedPath = path.join(root, `lora-${modelId}-${versionId}.safetensors`)
  await writeFile(managedPath, bytes)
  const digest = createHash('sha256').update(bytes).digest('hex')
  const published = await repository.publishVerifiedInstallation({
    primary: {
      file: {
        managedPath,
        originalFilename: path.basename(managedPath),
        sha256: digest,
        sizeBytes: bytes.length,
        verifiedAt: '2026-10-02T00:00:00.000Z',
      },
      resource: {
        displayName: `LoRA ${modelId}`,
        source: { kind: 'civitai', modelId },
        sourceMetadata: {},
        type: 'lora',
      },
      version: {
        baseModelFamily: 'illustrious',
        format: 'safetensors',
        name: `v${versionId}`,
        source: { expectedSha256: digest, fileId: versionId + 1000, kind: 'civitai', versionId },
        sourceMetadata: {},
      },
    },
  })
  return { ...published, bytes, managedPath }
}
