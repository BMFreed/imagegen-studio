import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from './civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from './civitai-token-store.js'
import { ModelRepository } from './model-repository.js'
import { ModelService } from './model-service.js'
import {
  inspectSdxlSafetensorsHeader,
  qualifySdxlCheckpoint,
} from './sdxl-checkpoint-qualification.js'

const migrations = path.resolve('src/main/db/migrations')
const storage: SafeStorageAdapter = {
  decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
  encryptStringAsync: async () => Buffer.alloc(0),
  getSelectedStorageBackend: () => 'gnome_libsecret',
  isAsyncEncryptionAvailable: async () => true,
}

const officialBytes = gunzipSync(
  readFileSync(new URL('./test-fixtures/illustrious-v01-safetensors-header.gz', import.meta.url)),
)
const officialHeader = officialBytes.subarray(8)
const officialSize = Number(
  /^size (\d+)$/m.exec(
    readFileSync(
      new URL('./test-fixtures/illustrious-v01-lfs-pointer.txt', import.meta.url),
      'utf8',
    ),
  )?.[1],
)

type HeaderTensor = { data_offsets: [number, number]; dtype: string; shape: number[] }
type Header = Record<string, HeaderTensor | Record<string, string>>

function officialParsedHeader(): Header {
  return JSON.parse(officialHeader.toString('utf8')) as Header
}

/** Tiny on-disk fixture copied from the pinned real header's anchor descriptors. */
function miniatureCheckpoint(omitKey?: string): Buffer {
  const official = officialParsedHeader()
  const keys = [
    'model.diffusion_model.input_blocks.0.0.weight',
    'model.diffusion_model.input_blocks.4.1.transformer_blocks.0.attn2.to_k.weight',
    'model.diffusion_model.out.2.weight',
    'conditioner.embedders.0.transformer.text_model.encoder.layers.0.layer_norm1.weight',
    'conditioner.embedders.1.model.ln_final.weight',
    'first_stage_model.encoder.conv_in.weight',
    'first_stage_model.decoder.conv_out.weight',
  ]
  const header: Header = { __metadata__: official.__metadata__ }
  let offset = 0
  for (const key of keys) {
    if (key === omitKey) {
      continue
    }
    const tensor = official[key] as HeaderTensor | undefined
    assert.ok(tensor, `The pinned Illustrious header must contain ${key}`)
    const bytesPerElement = tensor.dtype === 'F32' ? 4 : 2
    const byteLength =
      tensor.shape.reduce((product, dimension) => product * dimension, 1) * bytesPerElement
    header[key] = {
      data_offsets: [offset, offset + byteLength],
      dtype: tensor.dtype,
      shape: [...tensor.shape],
    }
    offset += byteLength
  }
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8')
  const file = Buffer.alloc(8 + headerBytes.length + offset)
  file.writeBigUInt64LE(BigInt(headerBytes.length), 0)
  headerBytes.copy(file, 8)
  return file
}

test('pinned official Illustrious header has an SDXL base UNet, both encoders and VAE', () => {
  assert.equal(officialBytes.readBigUInt64LE(0), BigInt(officialHeader.length))
  assert.doesNotThrow(() => inspectSdxlSafetensorsHeader(officialHeader, officialSize))
})

test('custom modelspec label does not override compatible SDXL tensor structure', () => {
  const header = officialParsedHeader()
  header.__metadata__ = { 'modelspec.architecture': 'custom-illustrious-derivative' }
  assert.doesNotThrow(() =>
    inspectSdxlSafetensorsHeader(Buffer.from(JSON.stringify(header)), officialSize),
  )
})

test('header preflight rejects a missing encoder, SDXL refiner shape and invalid tensor bounds', () => {
  const good = miniatureCheckpoint()
  const header = JSON.parse(
    good.subarray(8, 8 + Number(good.readBigUInt64LE(0))).toString(),
  ) as Header
  const size = good.length
  const encode = (): Buffer => Buffer.from(JSON.stringify(header), 'utf8')
  const missing = 'conditioner.embedders.1.model.ln_final.weight'
  delete header[missing]
  assert.throws(() => inspectSdxlSafetensorsHeader(encode(), size), {
    message: /OpenCLIP-G text encoder/,
  })
  header[missing] = officialParsedHeader()[missing]
  const cross = 'model.diffusion_model.input_blocks.4.1.transformer_blocks.0.attn2.to_k.weight'
  const original = header[cross] as HeaderTensor
  header[cross] = { ...original, shape: [640, 1280] }
  assert.throws(() => inspectSdxlSafetensorsHeader(encode(), size), {
    message: /SDXL base UNet cross-attention/,
  })
  header[cross] = { ...original, data_offsets: [original.data_offsets[0], size] }
  assert.throws(() => inspectSdxlSafetensorsHeader(encode(), size), {
    message: /tensor data is invalid/,
  })
})

test('an SDXL header without VAE decoder weights cannot enter generation', () => {
  const withoutVae = miniatureCheckpoint('first_stage_model.decoder.conv_out.weight')
  const header = withoutVae.subarray(8, 8 + Number(withoutVae.readBigUInt64LE(0)))
  assert.throws(() => inspectSdxlSafetensorsHeader(header, withoutVae.length), {
    message: /VAE decoder/,
  })
})

test('actual header reader rejects a malformed length and a symlink', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-sdxl-header-'))
  try {
    const modelPath = path.join(root, 'model.safetensors')
    const linkPath = path.join(root, 'linked.safetensors')
    const malformed = Buffer.alloc(16)
    malformed.writeBigUInt64LE(33_554_433n)
    await writeFile(modelPath, malformed)
    await assert.rejects(qualifySdxlCheckpoint(modelPath), {
      message: /header length/,
      name: 'SdxlCheckpointQualificationError',
    })
    await writeFile(modelPath, miniatureCheckpoint())
    await assert.doesNotReject(qualifySdxlCheckpoint(modelPath))
    await symlink(modelPath, linkPath)
    await assert.rejects(qualifySdxlCheckpoint(linkPath), { code: 'ELOOP' })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('ModelService blocks a hash-verified checkpoint missing a text encoder before generation planning', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-sdxl-model-service-'))
  const database = openAppDatabase(root, migrations)
  try {
    const repository = new ModelRepository(database.db)
    const service = new ModelService(
      repository,
      new CivitaiClient(),
      new CivitaiTokenStore(storage, root),
    )
    async function install(bytes: Buffer, versionId: number): Promise<void> {
      const modelPath = path.join(root, `model-${versionId}.safetensors`)
      await writeFile(modelPath, bytes)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const installed = await repository.publishVerifiedInstallation({
        primary: {
          file: {
            managedPath: modelPath,
            originalFilename: path.basename(modelPath),
            sha256,
            sizeBytes: bytes.length,
            verifiedAt: '2026-09-28T00:00:00.000Z',
          },
          resource: {
            displayName: 'Header qualification fixture',
            source: { kind: 'civitai', modelId: 420 },
            sourceMetadata: {},
            type: 'checkpoint',
          },
          version: {
            baseModelFamily: 'illustrious',
            format: 'safetensors',
            name: `v${versionId}`,
            predictionType: null,
            source: {
              expectedSha256: sha256,
              fileId: versionId + 1000,
              kind: 'civitai',
              versionId,
            },
            sourceMetadata: {},
          },
        },
      })
      const saved = await service.resolveGenerationCheckpoint(
        installed.resourceId,
        installed.versionId,
      )
      if (versionId === 1) {
        const verified = await service.resolveVerifiedGenerationCheckpointForPlan(saved)
        assert.equal(verified.managedPath, modelPath)
      } else {
        await assert.rejects(service.resolveVerifiedGenerationCheckpointForPlan(saved), {
          code: 'MODEL_CHECKPOINT_INCOMPATIBLE',
          message: /OpenCLIP-G text encoder/,
        })
      }
    }
    await install(miniatureCheckpoint(), 1)
    await install(miniatureCheckpoint('conditioner.embedders.1.model.ln_final.weight'), 2)
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})
