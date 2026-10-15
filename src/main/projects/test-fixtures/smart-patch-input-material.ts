import { compileAnimaFlowSamplingPlan } from '../../../shared/projects/anima-flow-sampling-plan.js'
import { compileAnimaPromptWeighting } from '../../../shared/projects/anima-prompt-weighting.js'
import { IGS_SRGB_ICC_SHA256 } from '../../../shared/projects/color-profile.js'
import { defaultIllustriousNoiseProfile } from '../../../shared/projects/illustrious-noise-profile.js'
import { createEmptyProjectDocumentV1 } from '../../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'

import type { SmartPatchExecutionItem } from '../project-smart-patch-execution.js'
import type {
  PreparedSmartPatchModelSourceInput,
  SmartPatchGenerationMode,
} from '../project-smart-patch-preparation.js'
import type { SmartPatchExecutionRequest } from '../smart-patch-execution-request.js'

import { encodeProjectMaskPng } from '../project-mask.js'
import {
  captureSmartPatchInputMaterial,
  type SmartPatchInputMaterial,
} from '../smart-patch-frozen-input.js'

const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
type Family = 'anima' | 'illustrious'

/** Literal input encoder only: no crop/resize/coherence implementation or output oracle. */
export function literalSmartPatchColorPng(
  width: number,
  height: number,
  pixels: readonly number[],
  channels: 3 | 4,
): Buffer {
  const profile = readFileSync(
    new URL('../../../../worker-python/src/imagegen_worker/srgb.icc', import.meta.url),
  )
  assert.equal(digest(profile), IGS_SRGB_ICC_SHA256)
  return literalPng(width, height, pixels, channels, profile)
}

/** Derived numeric planes may be empty or padded; they are not portable authored-mask assets. */
export function literalSmartPatchNumericPng(
  alpha: Uint8Array | readonly number[],
  width: number,
  height: number,
): Buffer {
  assert.equal(alpha.length, width * height)
  return literalPng(
    width,
    height,
    Array.from(alpha, (value) => [255, 255, 255, value]).flat(),
    4,
    null,
  )
}

/** Declared finite input fixtures; they do not claim actual CPU conditioning or native execution. */
export function literalSmartPatchPreparedInput(
  family: Family = 'illustrious',
  mode: SmartPatchGenerationMode = 'inpaint',
): {
  executions: { item: SmartPatchExecutionItem; request: SmartPatchExecutionRequest }[]
  prepared: PreparedSmartPatchModelSourceInput
} {
  const document = createEmptyProjectDocumentV1({ title: 'Literal durable Patch input' })
  const draft = document.generationDraft
  draft.model = {
    baseModelFamily: family,
    civitaiFileId: null,
    civitaiModelId: null,
    civitaiVersionId: null,
    displayName: 'Literal checkpoint',
    fileSha256: 'a'.repeat(64),
    kind: 'checkpoint',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: family === 'anima' ? null : 'epsilon',
    versionName: 'Exact literal version',
  }
  draft.positivePrompt.text = 'portrait (soft light:1.5)'
  draft.negativePrompt.text = 'blur'
  draft.sampling = {
    cfgScale: 4,
    denoisingStrength: 0.5,
    sampler: family === 'illustrious' ? 'Euler' : null,
    scheduler: family === 'illustrious' ? 'Normal' : null,
    steps: 3,
    ...(family === 'anima' ? { animaMethod: 'euler' as const } : {}),
  }
  draft.seed = { policy: 'fixed', value: 0 }
  const bbox = { height: 128, width: 128, x: -9, y: 13 }
  const painted = mode === 'inpaint'
  const authored = painted ? encodeProjectMaskPng(Uint8Array.of(1), 1, 1) : null
  const maskId = randomUUID()
  const mask = authored
    ? {
        asset: {
          bytes: authored.length,
          height: 1,
          path: `assets/masks/${maskId}/${digest(authored)}.png`,
          sha256: digest(authored),
          width: 1,
        },
        bounds: { height: 1, width: 1, x: -6, y: 17 },
        id: maskId,
        revision: 1,
      }
    : { asset: null, id: maskId, revision: 0 }
  const numeric = (alpha: readonly number[], width = 128, height = 128) => {
    const bytes = literalSmartPatchNumericPng(alpha, width, height)
    return { bytes, height, sha256: digest(bytes), width }
  }
  const color = (bytes: Buffer, width = 128, height = 128) => ({
    bytes,
    byteSize: bytes.length,
    colorSpace: 'srgb' as const,
    height,
    iccSha256: IGS_SRGB_ICC_SHA256,
    sha256: digest(bytes),
    width,
  })
  const sourcePixels = Array.from({ length: 128 * 128 }, () => [
    32,
    64,
    96,
    mode === 'txt2img' ? 0 : mode === 'outpaint' ? 128 : 255,
  ]).flat()
  const source = color(literalSmartPatchColorPng(128, 128, sourcePixels, 4))
  const modelSource =
    mode === 'txt2img'
      ? null
      : color(
          literalSmartPatchColorPng(
            64,
            64,
            Array.from({ length: 64 * 64 }, () => [32, 64, 96]).flat(),
            3,
          ),
          64,
          64,
        )
  const effective = numeric(
    Array.from({ length: 128 * 128 }, (_, index) => (painted && index === 515 ? 1 : 0)),
  )
  const processingMask = numeric(Array.from({ length: 64 * 64 }).fill(0) as number[], 64, 64)
  const processingKeep = numeric(
    Array.from({ length: 64 * 64 }).fill(painted ? 255 : mode === 'outpaint' ? 128 : 0) as number[],
    64,
    64,
  )
  const processingSource = color(
    literalSmartPatchColorPng(
      64,
      64,
      Array.from({ length: 64 * 64 }, () => [
        32,
        64,
        96,
        mode === 'txt2img' ? 0 : mode === 'outpaint' ? 128 : 255,
      ]).flat(),
      4,
    ),
    64,
    64,
  )
  const keep = numeric(
    Array.from({ length: 8 * 8 }, () => (painted ? 255 : mode === 'outpaint' ? 128 : 0)),
    8,
    8,
  )
  const worldKeep = numeric(
    Array.from({ length: 128 * 128 }, (_, index) =>
      painted ? (index === 515 ? 254 : 255) : mode === 'outpaint' ? 128 : 0,
    ),
  )
  const expandedProcessing = numeric(
    Array.from({ length: 64 * 64 }).fill(painted ? 255 : 0) as number[],
    64,
    64,
  )
  const expandedWorld = numeric(
    Array.from({ length: 128 * 128 }, (_, index) => (painted && index !== 515 ? 255 : 0)),
  )
  const final = numeric(
    Array.from({ length: 128 * 128 }, (_, index) => (!painted || index === 515 ? 255 : 0)),
  )
  const coherence = { edgeSize: 0, minimumDenoise: 0, mode: 'Gaussian Blur' as const }
  const prepared: PreparedSmartPatchModelSourceInput = {
    coherence,
    conditioning: {
      expandedProcessingKeepMask: { ...expandedProcessing, polarity: 'keep' },
      expandedWorldKeepMask: { ...expandedWorld, polarity: 'keep' },
      finalContributionMask: { ...final, polarity: 'generate' },
      latentKeepMask: { ...keep, polarity: 'keep' },
      latentMaskHasCoverage: !painted,
      processingKeepMask: { ...processingKeep, polarity: 'keep' },
      worldKeepMask: { ...worldKeep, polarity: 'keep' },
    },
    context: {
      bbox,
      coherenceSettings: { ...coherence },
      documentId: document.documentId,
      documentRevision: document.documentRevision,
      generationDraft: draft,
      internalResolution: { height: 64, width: 64 },
      lastActualSeedSnapshot: 0,
      layerId: randomUUID(),
      locked: false,
      mask,
      maskSettings: { blur: 0, padding: 8 },
      projectKey: randomUUID(),
      sourceLayerIds: mode === 'txt2img' ? [] : [randomUUID()],
      visible: true,
    },
    effectiveMask: effective,
    maskPngBytes: authored,
    mode,
    modelSource,
    processingMask,
    processingMaskHasCoverage: false,
    processingSource,
    source,
    sourceAlpha: mode === 'txt2img' ? 'transparent' : mode === 'outpaint' ? 'mixed' : 'opaque',
  }
  const item = { prompts: { negative: 'blur', positive: 'portrait (soft light:1.5)' }, seed: 0 }
  const imageReference = (
    image: { bytes: Buffer; byteSize?: number; height: number; sha256: string; width: number },
    path: string,
  ) => ({
    byteSize: image.bytes.length,
    height: image.height,
    path,
    sha256: image.sha256,
    width: image.width,
  })
  const common = {
    internalResolution: { height: 64, width: 64 },
    latentKeepMask: imageReference(keep, '/operation-stage/latent-keep-mask.png'),
    mode,
    modelSource: modelSource
      ? imageReference(modelSource, '/operation-stage/model-source.png')
      : null,
    output: { pngPath: '/operation-stage/model-result.png', stagingRoot: '/operation-stage' },
    protocolVersion: '1' as const,
    requestId: randomUUID(),
    schemaVersion: 1 as const,
    type: 'execute-smart-patch' as const,
  }
  const request: SmartPatchExecutionRequest =
    family === 'anima'
      ? {
          ...common,
          family: 'anima',
          inference: {
            loras: [],
            model: {
              architecture: 'anima-base-1.0',
              checkpoint: {
                byteSize: 12,
                path: '/managed/anima.safetensors',
                sha256: 'a'.repeat(64),
              },
              qwen3Encoder: {
                byteSize: 13,
                path: '/managed/qwen.safetensors',
                sha256: 'b'.repeat(64),
              },
              vae: { byteSize: 14, path: '/managed/vae.safetensors', sha256: 'c'.repeat(64) },
            },
            prompts: {
              negative: compileAnimaPromptWeighting(item.prompts.negative),
              positive: compileAnimaPromptWeighting(item.prompts.positive),
            },
            sampling: compileAnimaFlowSamplingPlan({
              guidanceScale: 4,
              height: 64,
              mode: mode === 'txt2img' ? 'txt2img' : 'img2img',
              scheduler: 'euler',
              seed: 0,
              steps: 3,
              strength: mode === 'txt2img' ? null : 0.5,
              width: 64,
            }),
          },
        }
      : {
          ...common,
          family: 'illustrious',
          inference: {
            checkpoint: {
              path: '/managed/illustrious.safetensors',
              predictionType: 'v_prediction',
              sha256: 'a'.repeat(64),
            },
            loras: [],
            prompts: { ...item.prompts },
            sampling: {
              cfgRescale: 0,
              cfgScale: 4,
              ...(mode === 'txt2img' ? {} : { denoisingStrength: 0.5 }),
              noiseProfile: defaultIllustriousNoiseProfile(),
              scheduler: 'euler',
              seed: 0,
              steps: 3,
            },
            vae: null,
            vaePrecision: 'Auto',
          },
        }
  return { executions: [{ item, request }], prepared }
}

export async function literalPreparedSmartPatchInputMaterial(
  family: Family = 'illustrious',
  mode: SmartPatchGenerationMode = 'inpaint',
): Promise<SmartPatchInputMaterial> {
  const { executions, prepared } = literalSmartPatchPreparedInput(family, mode)
  return await captureSmartPatchInputMaterial(prepared, executions)
}

function literalPng(
  width: number,
  height: number,
  pixels: readonly number[],
  channels: 3 | 4,
  profile: Buffer | null,
): Buffer {
  assert.equal(pixels.length, width * height * channels)
  const chunk = (tag: string, bytes: Buffer): Buffer => {
    const output = Buffer.alloc(bytes.length + 12)
    output.writeUInt32BE(bytes.length)
    output.write(tag, 4, 'ascii')
    bytes.copy(output, 8)
    output.writeUInt32BE(crc32(output.subarray(4, -4)), output.length - 4)
    return output
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = channels === 3 ? 2 : 6
  const rows = Buffer.alloc(height * (width * channels + 1))
  for (let row = 0; row < height; row++) {
    rows.set(
      pixels.slice(row * width * channels, (row + 1) * width * channels),
      row * (width * channels + 1) + 1,
    )
  }
  // Stored deflate blocks keep encoded length independent of channel values for hash mutation controls.
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    ...(profile
      ? [chunk('iCCP', Buffer.concat([Buffer.from('srgb\0\0'), deflateSync(profile)]))]
      : []),
    chunk('IDAT', deflateSync(rows, { level: 0 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
