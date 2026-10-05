import { IGS_SRGB_ICC_SHA256 } from '../../../shared/projects/color-profile.js'
import { createEmptyProjectDocumentV1 } from '../../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'

import type {
  AnimaGenerationModelResolver,
  FrozenAnimaGenerationLora,
  PreparedAnimaGeneration,
} from '../anima-generation-preparation.js'

export const ANIMA_BATCH_READY = {
  capabilities: [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
    'illustrious-lora',
    'illustrious-vae-precision',
    'illustrious-external-vae',
    'illustrious-embeddings',
    'anima-txt2img',
    'anima-img2img',
    'anima-lora',
    'anima-prompt-weighting',
    'anima-flow-sampling',
  ],
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.11.0',
}

export type AnimaBatchFixture = {
  files: Map<string, Buffer>
  modelService: AnimaGenerationModelResolver
  prepared: PreparedAnimaGeneration
  root: string
  scratch: string
}

export function animaFixtureSha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * The resolver double supplies exact tiny identities and rereads real files; it does not qualify a
 * trained checkpoint/header or production registry links. These tests own planner/compiler and
 * scratch-lease behavior. Separate ProjectService integration tests use the actual ModelService.
 */
export async function withAnimaBatchFixture(
  run: (fixture: AnimaBatchFixture) => Promise<void>,
  options: { alpha?: number; opaque?: boolean } = {},
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-batch-'))
  try {
    const models = path.join(root, 'models')
    const scratch = path.join(root, 'scratch')
    await mkdir(models)
    await mkdir(scratch)
    const files = new Map<string, Buffer>()
    async function managed(name: string) {
      const managedPath = path.join(models, `${name}.safetensors`)
      const bytes = Buffer.from(`exact ${name} fixture`)
      await writeFile(managedPath, bytes)
      files.set(managedPath, bytes)
      return { byteSize: bytes.length, managedPath, sha256: animaFixtureSha256(bytes) }
    }
    const checkpoint = await managed('checkpoint')
    const qwen3Encoder = await managed('qwen')
    const vae = await managed('vae')
    const checkpointReference = {
      baseModelFamily: 'anima' as const,
      civitaiFileId: 3,
      civitaiModelId: 1,
      civitaiVersionId: 2,
      displayName: 'Fixture Anima',
      fileSha256: checkpoint.sha256,
      kind: 'checkpoint' as const,
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: null,
      versionName: 'Fixture version',
    }
    const model = {
      architecture: 'anima-base-1.0' as const,
      checkpoint: {
        byteSize: checkpoint.byteSize,
        managedPath: checkpoint.managedPath,
        reference: checkpointReference,
      },
      qwen3Encoder: { ...qwen3Encoder, localModelId: randomUUID(), localVersionId: randomUUID() },
      vae: { ...vae, localModelId: randomUUID(), localVersionId: randomUUID() },
    }
    const loras: FrozenAnimaGenerationLora[] = []
    for (const [index, weight] of [-0.7, 0, 1.2].entries()) {
      const file = await managed(`lora-${index}`)
      loras.push({
        byteSize: file.byteSize,
        managedPath: file.managedPath,
        reference: {
          ...checkpointReference,
          civitaiFileId: 10 + index,
          civitaiModelId: 20 + index,
          civitaiVersionId: 30 + index,
          displayName: `Fixture LoRA ${index}`,
          fileSha256: file.sha256,
          kind: 'lora' as const,
          localModelId: randomUUID(),
          localVersionId: randomUUID(),
        },
        weight,
      })
    }
    const document = createEmptyProjectDocumentV1({
      primaryBbox: { height: 64, width: 64, x: -80, y: 96 },
      title: 'Anima batch fixture',
    })
    const draft = document.generationDraft
    draft.model = checkpointReference
    draft.sampling = {
      animaMethod: 'euler',
      cfgScale: 4.5,
      denoisingStrength: options.opaque ? 0.5 : null,
      sampler: 'DPM++ 2M',
      scheduler: 'Karras',
      steps: 4,
    }
    draft.seed = { policy: 'fixed', value: 0 }
    draft.positivePrompt.text = '{(cat:2)|dog++}'
    draft.negativePrompt.text = '{(bad:0.5)|worse--}'
    draft.dynamicPrompt = { maxPrompts: 100, seedBehavior: 'per-iteration' }
    draft.loras = loras.map((entry) => ({
      enabled: true,
      resource: entry.reference,
      weight: entry.weight,
    }))
    const targetPngBytes = await animaFixturePng(options.alpha ?? (options.opaque ? 255 : 0))
    const common = {
      bbox: document.primaryBbox,
      documentId: document.documentId,
      documentRevision: document.documentRevision,
      dynamic: draft.dynamicPrompt,
      generationDraft: draft,
      kind: 'anima-generation-preparation' as const,
      loras,
      model,
      prompts: { negative: draft.negativePrompt.text, positive: draft.positivePrompt.text },
      schemaVersion: 1 as const,
      target: {
        byteSize: targetPngBytes.length,
        colorSpace: 'srgb' as const,
        format: 'png' as const,
        height: 64,
        iccSha256: IGS_SRGB_ICC_SHA256,
        sha256: animaFixtureSha256(targetPngBytes),
        width: 64,
      },
    }
    const sampling = {
      animaMethod: 'euler' as const,
      cfgScale: 4.5,
      requestedSeedPolicy: 'fixed' as const,
      seed: 0,
      steps: 4,
    }
    const prepared: PreparedAnimaGeneration = {
      context: options.opaque
        ? { ...common, mode: 'img2img', sampling: { ...sampling, denoisingStrength: 0.5 } }
        : { ...common, mode: 'txt2img', sampling: { ...sampling, denoisingStrength: null } },
      targetPngBytes,
    }
    async function verify(managedPath: string): Promise<void> {
      assert.ok((await readFile(managedPath)).equals(files.get(managedPath)!))
    }
    const modelService: AnimaGenerationModelResolver = {
      resolveVerifiedAnimaGenerationLoraForPlan: async (reference) => {
        const entry = loras.find(
          (item) => item.reference.localVersionId === reference.localVersionId,
        )!
        assert.deepEqual(reference, entry.reference)
        await verify(entry.managedPath)
        return structuredClone({
          byteSize: entry.byteSize,
          managedPath: entry.managedPath,
          reference: entry.reference,
        })
      },
      resolveVerifiedGenerationAnimaBundleForPlan: async (reference) => {
        assert.deepEqual(reference, checkpointReference)
        for (const component of [checkpoint, qwen3Encoder, vae]) {
          await verify(component.managedPath)
        }
        return structuredClone(model)
      },
    }
    await run({ files, modelService, prepared, root, scratch })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

export async function animaFixturePng(alpha: number, profile?: Buffer): Promise<Buffer> {
  const icc =
    profile ?? (await readFile(path.resolve('worker-python/src/imagegen_worker/srgb.icc')))
  const header = Buffer.alloc(13)
  header.writeUInt32BE(64, 0)
  header.writeUInt32BE(64, 4)
  header[8] = 8
  header[9] = 6
  const pixels = Buffer.alloc((64 * 4 + 1) * 64)
  for (let row = 0; row < 64; row++) {
    for (let column = 0; column < 64; column++) {
      const offset = row * (64 * 4 + 1) + 1 + column * 4
      pixels[offset] = 40
      pixels[offset + 1] = 90
      pixels[offset + 2] = 180
      pixels[offset + 3] = alpha
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(icc)])),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function pngChunk(type: string, payload: Buffer): Buffer {
  const chunk = Buffer.alloc(payload.length + 12)
  chunk.writeUInt32BE(payload.length, 0)
  chunk.write(type, 4, 'ascii')
  payload.copy(chunk, 8)
  let crc = 0xff_ff_ff_ff
  for (const byte of chunk.subarray(4, payload.length + 8)) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xed_b8_83_20 : 0)
    }
  }
  chunk.writeUInt32BE((crc ^ 0xff_ff_ff_ff) >>> 0, payload.length + 8)
  return chunk
}
