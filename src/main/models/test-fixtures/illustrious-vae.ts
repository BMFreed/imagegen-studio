/**
 * Header-compatible zero tensors derived from the pinned official Illustrious VAE anchors. This is
 * deliberately incomplete for ML loading; it exercises main preflight and identity only.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

import type { ModelRepository } from '../model-repository.js'

export type VaeHeaderFixture = Record<string, Record<string, string> | TensorDescriptor>
type TensorDescriptor = { data_offsets: [number, number]; dtype: string; shape: number[] }

const official = JSON.parse(
  gunzipSync(readFileSync(new URL('./illustrious-v01-safetensors-header.gz', import.meta.url)))
    .subarray(8)
    .toString('utf8'),
) as Record<string, TensorDescriptor>
const anchors = [
  'encoder.conv_in.weight',
  'encoder.conv_out.weight',
  'decoder.conv_in.weight',
  'decoder.conv_out.weight',
  'quant_conv.weight',
  'post_quant_conv.weight',
  'encoder.down.0.block.0.conv1.weight',
  'decoder.up.3.block.0.conv1.weight',
] as const

export function illustriousVaeFixture(
  layout: 'diffusers' | 'ldm' = 'ldm',
  edit?: (header: VaeHeaderFixture) => void,
): Buffer {
  const header: VaeHeaderFixture = { __metadata__: { source: 'pinned-header preflight fixture' } }
  let offset = 0
  for (const key of anchors) {
    const original = official[`first_stage_model.${key}`]
    if (!original) {
      throw new Error(`Pinned official VAE fixture lacks ${key}`)
    }
    const target =
      layout === 'diffusers'
        ? key
            .replace('encoder.down.0.block.0.', 'encoder.down_blocks.0.resnets.0.')
            .replace('decoder.up.3.block.0.', 'decoder.up_blocks.0.resnets.0.')
        : key
    const size = original.shape.reduce((count, dimension) => count * dimension, 1) * 2
    header[target] = {
      data_offsets: [offset, offset + size],
      dtype: 'F16',
      shape: [...original.shape],
    }
    offset += size
  }
  edit?.(header)
  const json = Buffer.from(JSON.stringify(header))
  const padded = Buffer.concat([json, Buffer.alloc((8 - (json.length % 8)) % 8, 0x20)])
  const file = Buffer.alloc(8 + padded.length + offset)
  file.writeBigUInt64LE(BigInt(padded.length))
  padded.copy(file, 8)
  return file
}

export async function publishIllustriousVaeFixture(
  repository: ModelRepository,
  root: string,
  modelId: number,
  versionId: number,
  layout: 'diffusers' | 'ldm' = 'ldm',
  edit?: (header: VaeHeaderFixture) => void,
) {
  const bytes = illustriousVaeFixture(layout, edit)
  const managedPath = path.join(root, `vae-${modelId}-${versionId}.safetensors`)
  await writeFile(managedPath, bytes)
  const digest = createHash('sha256').update(bytes).digest('hex')
  const published = await repository.publishVerifiedInstallation({
    primary: {
      file: {
        managedPath,
        originalFilename: path.basename(managedPath),
        sha256: digest,
        sizeBytes: bytes.length,
        verifiedAt: '2026-10-04T00:00:00.000Z',
      },
      resource: {
        displayName: `VAE ${modelId}`,
        source: { kind: 'civitai', modelId },
        sourceMetadata: {},
        type: 'vae',
      },
      version: {
        baseModelFamily: 'illustrious',
        format: 'safetensors',
        name: `v${versionId}`,
        source: { expectedSha256: digest, fileId: versionId + 1000, kind: 'civitai', versionId },
        sourceMetadata: { baseModel: 'SDXL 1.0' },
      },
    },
  })
  return { ...published, bytes, managedPath }
}
