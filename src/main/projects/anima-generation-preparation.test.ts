import { ANIMA_SAMPLING_METHOD_KEYS } from '../../shared/projects/anima-sampling-method.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { deflateSync } from 'node:zlib'

import type { VerifiedAnimaGenerationBundle } from '../models/model-service.js'
import type { FrozenGenerationTarget } from './project-generation-target.js'

import {
  type AnimaGenerationModelResolver,
  assertFrozenAnimaGeneration,
  prepareAnimaGeneration,
  reverifyFrozenAnimaGeneration,
  validateAnimaGenerationDraft,
} from './anima-generation-preparation.js'
import { GenerationPreparationError } from './project-generation-preparation.js'

type ExactResource = NonNullable<IgsProjectDocumentV1['generationDraft']['model']>
const profile = readFileSync(path.resolve('worker-python/src/imagegen_worker/srgb.icc'))
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

function reference(kind: 'checkpoint' | 'lora', model = 1, version = 1): ExactResource {
  return {
    baseModelFamily: 'anima',
    civitaiFileId: model * 1000 + version,
    civitaiModelId: model,
    civitaiVersionId: model * 100 + version,
    displayName: `Authored ${kind} ${model}`,
    fileSha256: sha256(Buffer.from(`${kind}-${model}-${version}`)),
    kind,
    localModelId: `00000000-0000-4000-8000-${String(model).padStart(12, '0')}`,
    localVersionId: `00000000-0000-4000-8001-${String(model * 100 + version).padStart(12, '0')}`,
    predictionType: null,
    versionName: `Authored version ${version}`,
  }
}

function bundle(ref: ExactResource): VerifiedAnimaGenerationBundle {
  return {
    architecture: 'anima-base-1.0',
    checkpoint: {
      byteSize: 100,
      managedPath: `/anima/checkpoint-${ref.civitaiVersionId}.safetensors`,
      reference: structuredClone(ref),
    },
    qwen3Encoder: {
      byteSize: 200,
      localModelId: 'qwen-model',
      localVersionId: 'qwen-version',
      managedPath: '/anima/qwen3.safetensors',
      sha256: 'b'.repeat(64),
    },
    vae: {
      byteSize: 300,
      localModelId: 'vae-model',
      localVersionId: 'vae-version',
      managedPath: '/anima/vae.safetensors',
      sha256: 'c'.repeat(64),
    },
  }
}

function resolver(calls: string[] = []): AnimaGenerationModelResolver {
  return {
    resolveVerifiedAnimaGenerationLoraForPlan: async (ref) => {
      calls.push(`lora:${ref.civitaiModelId}`)
      return {
        byteSize: 50,
        managedPath: `/anima/lora-${ref.civitaiModelId}.safetensors`,
        reference: structuredClone(ref),
      }
    },
    resolveVerifiedGenerationAnimaBundleForPlan: async (ref) => {
      calls.push(`bundle:${ref.civitaiModelId}`)
      return bundle(ref)
    },
  }
}

function target(mode: FrozenGenerationTarget['mode'] = 'txt2img'): FrozenGenerationTarget {
  const document = createEmptyProjectDocumentV1({ title: 'Anima preparation fixture' })
  const bytes = png(mode === 'txt2img' ? 0 : mode === 'img2img' ? 255 : 128)
  document.generationDraft.model = reference('checkpoint')
  document.generationDraft.sampling = {
    animaMethod: 'euler',
    cfgScale: 4,
    denoisingStrength: mode === 'txt2img' ? null : 0.65,
    sampler: 'saved inactive SD sampler',
    scheduler: 'saved inactive SD scheduler',
    steps: 3,
  }
  document.generationDraft.seed = { policy: 'fixed', value: 0 }
  document.generationDraft.positivePrompt.text = '(trained portrait:1.2)'
  document.generationDraft.negativePrompt.text = '(blur)-'
  return {
    bbox: { height: 64, width: 64, x: -128, y: 256 },
    composite: {
      bytes,
      byteSize: bytes.length,
      colorSpace: 'srgb',
      height: 64,
      iccSha256: IGS_SRGB_ICC_SHA256,
      sha256: sha256(bytes),
      width: 64,
    },
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: document.generationDraft,
    lastActualSeedSnapshot: null,
    mode,
  }
}

/** Main snapshot/plan boundary; model qualification is covered by the real service integration. */
test('Anima Main preparation preserves all six explicit methods, native modes and inactive authored values', async (t) => {
  for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
    for (const mode of ['txt2img', 'img2img'] as const) {
      await t.test(`${method} ${mode}`, async () => {
        const captured = target(mode)
        captured.generationDraft.sampling.animaMethod = method
        captured.generationDraft.cfgRescale = 0
        captured.generationDraft.vaePrecision = 'Auto'
        const before = structuredClone(captured.generationDraft)
        const prepared = await prepareAnimaGeneration({
          modelService: resolver(),
          target: captured,
        })
        assert.equal(prepared.context.mode, mode)
        assert.equal(prepared.context.sampling.animaMethod, method)
        assert.equal(prepared.context.sampling.seed, 0)
        assert.equal(prepared.context.sampling.denoisingStrength, mode === 'img2img' ? 0.65 : null)
        assert.deepEqual(prepared.context.generationDraft, before)
        assert.deepEqual(prepared.context.dynamic, {
          maxPrompts: 100,
          seedBehavior: 'per-iteration',
        })
        assert.deepEqual(prepared.context.bbox, captured.bbox)
        assert.deepEqual(prepared.targetPngBytes, captured.composite.bytes)
        assert.notEqual(prepared.targetPngBytes, captured.composite.bytes)
        assert.deepEqual(captured.generationDraft, before)
      })
    }
  }
})

test('Anima pre-compose validation refuses unsupported family, missing native method and Advanced values', async (t) => {
  const controls: [string, string, (draft: IgsProjectDocumentV1['generationDraft']) => void][] = [
    [
      'Illustrious model',
      'GENERATION_MODEL_UNSUPPORTED',
      (draft) => {
        draft.model!.baseModelFamily = 'illustrious'
      },
    ],
    [
      'prediction type',
      'GENERATION_MODEL_UNSUPPORTED',
      (draft) => {
        draft.model!.predictionType = 'epsilon'
      },
    ],
    [
      'missing method',
      'GENERATION_SAMPLING_REQUIRED',
      (draft) => {
        delete draft.sampling.animaMethod
      },
    ],
    [
      'unknown method',
      'GENERATION_SAMPLING_REQUIRED',
      (draft) => {
        Object.assign(draft.sampling, { animaMethod: 'karras' })
      },
    ],
    [
      'CFG Rescale',
      'GENERATION_ADVANCED_UNSUPPORTED',
      (draft) => {
        draft.cfgRescale = 0.1
      },
    ],
    [
      'manual precision',
      'GENERATION_ADVANCED_UNSUPPORTED',
      (draft) => {
        draft.vaePrecision = 'FP32'
      },
    ],
    [
      'CLIP Skip',
      'GENERATION_ADVANCED_UNSUPPORTED',
      (draft) => {
        draft.clipSkip = 1
      },
    ],
    [
      'external VAE',
      'GENERATION_VAE_UNSUPPORTED',
      (draft) => {
        draft.vae = { ...reference('checkpoint'), kind: 'vae' }
      },
    ],
    [
      'positive embedding',
      'GENERATION_EMBEDDING_UNSUPPORTED',
      (draft) => {
        draft.positivePrompt.embeddingRefs = [
          { resource: { ...reference('checkpoint'), kind: 'embedding' }, token: 'embedding' },
        ]
      },
    ],
    [
      'negative embedding',
      'GENERATION_EMBEDDING_UNSUPPORTED',
      (draft) => {
        draft.negativePrompt.embeddingRefs = [
          { resource: { ...reference('checkpoint'), kind: 'embedding' }, token: 'embedding' },
        ]
      },
    ],
    [
      'enabled other-family LoRA',
      'GENERATION_LORA_UNSUPPORTED',
      (draft) => {
        draft.loras = [
          {
            enabled: true,
            resource: { ...reference('lora'), baseModelFamily: 'illustrious' },
            weight: 1,
          },
        ]
      },
    ],
    [
      'nonfinite LoRA',
      'GENERATION_LORA_UNSUPPORTED',
      (draft) => {
        draft.loras = [{ enabled: true, resource: reference('lora'), weight: Infinity }]
      },
    ],
  ]
  for (const [name, code, alter] of controls) {
    await t.test(name, async () => {
      const captured = target()
      validateAnimaGenerationDraft(captured.generationDraft, { bbox: captured.bbox })
      alter(captured.generationDraft)
      assert.throws(
        () => validateAnimaGenerationDraft(captured.generationDraft, { bbox: captured.bbox }),
        errorCode(code),
      )
      const calls: string[] = []
      await assert.rejects(
        prepareAnimaGeneration({ modelService: resolver(calls), target: captured }),
        errorCode(code),
      )
      assert.deepEqual(calls, [])
    })
  }
})

test('Anima uses existing native numerical limits without clamping', async (t) => {
  const controls: [string, (captured: FrozenGenerationTarget) => void][] = [
    [
      'steps above 200',
      (captured) => {
        captured.generationDraft.sampling.steps = 201
      },
    ],
    [
      'fractional steps',
      (captured) => {
        captured.generationDraft.sampling.steps = 1.5
      },
    ],
    [
      'CFG below 1',
      (captured) => {
        captured.generationDraft.sampling.cfgScale = 0.99
      },
    ],
    [
      'CFG above 30',
      (captured) => {
        captured.generationDraft.sampling.cfgScale = 30.01
      },
    ],
    [
      'size below 64',
      (captured) => {
        captured.bbox.width = 56
      },
    ],
    [
      'size above 2048',
      (captured) => {
        captured.bbox.width = 2056
      },
    ],
    [
      'unaligned size',
      (captured) => {
        captured.bbox.width = 65
      },
    ],
    [
      'pixel count above 4M',
      (captured) => {
        captured.bbox.width = 2048
        captured.bbox.height = 2048
      },
    ],
    [
      'strength below 0',
      (captured) => {
        captured.generationDraft.sampling.denoisingStrength = -0.1
      },
    ],
    [
      'strength above 1',
      (captured) => {
        captured.generationDraft.sampling.denoisingStrength = 1.1
      },
    ],
  ]
  for (const [name, alter] of controls) {
    await t.test(name, () => {
      const captured = target()
      validateAnimaGenerationDraft(captured.generationDraft, { bbox: captured.bbox })
      alter(captured)
      assert.throws(
        () => validateAnimaGenerationDraft(captured.generationDraft, { bbox: captured.bbox }),
        { code: 'GENERATION_SAMPLING_UNSUPPORTED' },
      )
    })
  }
  const boundary = target()
  boundary.bbox = { height: 2000, width: 2000, x: 0, y: 0 }
  boundary.generationDraft.sampling.steps = 200
  boundary.generationDraft.sampling.cfgScale = 30
  boundary.generationDraft.sampling.denoisingStrength = 0
  validateAnimaGenerationDraft(boundary.generationDraft, { bbox: boundary.bbox })
  boundary.generationDraft.sampling.denoisingStrength = 1
  validateAnimaGenerationDraft(boundary.generationDraft, { bbox: boundary.bbox })
})

test('Anima resolves only ordered enabled exact LoRAs and preserves disabled foreign rows and signed zero', async () => {
  const captured = target()
  captured.generationDraft.loras = [
    { enabled: true, resource: reference('lora', 8), weight: -0.4 },
    {
      enabled: false,
      resource: { ...reference('lora', 9), baseModelFamily: 'illustrious' },
      weight: 1,
    },
    { enabled: true, resource: reference('lora', 7), weight: 0 },
  ]
  const calls: string[] = []
  const prepared = await prepareAnimaGeneration({ modelService: resolver(calls), target: captured })
  assert.deepEqual(calls, ['bundle:1', 'lora:8', 'lora:7'])
  assert.deepEqual(
    prepared.context.loras.map(({ reference: ref, weight }) => [ref.civitaiModelId, weight]),
    [
      [8, -0.4],
      [7, 0],
    ],
  )
  assert.deepEqual(prepared.context.generationDraft.loras, captured.generationDraft.loras)
  captured.generationDraft.loras.push({
    enabled: true,
    resource: reference('lora', 8, 2),
    weight: 0.1,
  })
  assert.throws(
    () => validateAnimaGenerationDraft(captured.generationDraft, { bbox: captured.bbox }),
    errorCode('GENERATION_LORA_UNSUPPORTED'),
  )
})

test('Anima preparation captures mode, target bytes, identities, draft, dynamic policy and reusable zero before awaits', async () => {
  const captured = target('img2img')
  captured.generationDraft.seed.policy = 'reuse'
  captured.lastActualSeedSnapshot = 91
  captured.generationDraft.dynamicPrompt = { maxPrompts: 3, seedBehavior: 'per-prompt' }
  captured.generationDraft.loras = [{ enabled: true, resource: reference('lora', 8), weight: -0.4 }]
  const original = structuredClone(captured)
  let entered!: () => void
  let finish!: () => void
  const resolving = new Promise<void>((resolve) => {
    entered = resolve
  })
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const base = resolver()
  const input = {
    lastActualSeed: 0,
    modelService: {
      ...base,
      resolveVerifiedGenerationAnimaBundleForPlan: async (ref: ExactResource) => {
        entered()
        await gate
        return await base.resolveVerifiedGenerationAnimaBundleForPlan(ref)
      },
    },
    target: captured,
  }
  const preparing = prepareAnimaGeneration(input)
  await resolving
  input.lastActualSeed = 55
  captured.mode = 'txt2img'
  captured.documentId = randomUUID()
  captured.documentRevision = randomUUID()
  captured.lastActualSeedSnapshot = 77
  captured.bbox.width = 128
  captured.composite.bytes.fill(0)
  captured.composite.sha256 = 'd'.repeat(64)
  captured.generationDraft.model = reference('checkpoint', 2)
  captured.generationDraft.positivePrompt.text = 'later prompt'
  captured.generationDraft.sampling.animaMethod = 'lcm'
  captured.generationDraft.sampling.denoisingStrength = 0.1
  captured.generationDraft.dynamicPrompt.maxPrompts = 5
  captured.generationDraft.loras[0].weight = 0.9
  finish()
  const prepared = await preparing
  assert.equal(prepared.context.mode, 'img2img')
  assert.equal(prepared.context.documentId, original.documentId)
  assert.equal(prepared.context.documentRevision, original.documentRevision)
  assert.deepEqual(prepared.context.bbox, original.bbox)
  assert.deepEqual(prepared.context.generationDraft, original.generationDraft)
  assert.deepEqual(prepared.context.dynamic, { maxPrompts: 3, seedBehavior: 'per-prompt' })
  assert.equal(prepared.context.sampling.seed, 0)
  assert.equal(prepared.context.loras[0].weight, -0.4)
  assert.deepEqual(prepared.targetPngBytes, Buffer.from(original.composite.bytes))
})

test('Anima seed resolution gives operational zero precedence, uses snapshot fallback and consumes Random once', async (t) => {
  for (const [name, operational, saved, expected] of [
    ['operational zero', 0, 19, 0],
    ['saved zero', null, 0, 0],
    ['operational wins', 17, 19, 17],
  ] as const) {
    await t.test(name, async () => {
      const captured = target()
      captured.generationDraft.seed.policy = 'reuse'
      captured.lastActualSeedSnapshot = saved
      const prepared = await prepareAnimaGeneration({
        lastActualSeed: operational,
        modelService: resolver(),
        target: captured,
      })
      assert.equal(prepared.context.sampling.seed, expected)
    })
  }
  const captured = target()
  captured.generationDraft.seed.policy = 'reuse'
  await assert.rejects(
    prepareAnimaGeneration({ modelService: resolver(), target: captured }),
    errorCode('GENERATION_SEED_UNAVAILABLE'),
  )
  await assert.rejects(
    prepareAnimaGeneration({ lastActualSeed: -1, modelService: resolver(), target: captured }),
    errorCode('GENERATION_SEED_INVALID'),
  )
  captured.generationDraft.seed.policy = 'random'
  let draws = 0
  validateAnimaGenerationDraft(captured.generationDraft, { bbox: captured.bbox })
  const prepared = await prepareAnimaGeneration({
    modelService: resolver(),
    randomUint32: () => {
      draws += 1
      return 0
    },
    target: captured,
  })
  assert.equal(draws, 1)
  assert.equal(prepared.context.sampling.seed, 0)
  await assert.rejects(
    prepareAnimaGeneration({
      modelService: resolver(),
      randomUint32: () => 2 ** 32,
      target: captured,
    }),
    errorCode('GENERATION_SEED_INVALID'),
  )
})

test('Anima checks actual alpha, integrity and embedded profile before model resolution', async (t) => {
  const controls: [string, string, (captured: FrozenGenerationTarget) => void][] = [
    [
      'mode lie',
      'GENERATION_TARGET_CHANGED',
      (captured) => {
        captured.mode = 'img2img'
      },
    ],
    [
      'hash change',
      'GENERATION_TARGET_CHANGED',
      (captured) => {
        captured.composite.sha256 = 'a'.repeat(64)
      },
    ],
    [
      'size change',
      'GENERATION_TARGET_CHANGED',
      (captured) => {
        captured.composite.byteSize += 1
      },
    ],
    [
      'profile label',
      'GENERATION_TARGET_CHANGED',
      (captured) => {
        captured.composite.iccSha256 = 'a'.repeat(64)
      },
    ],
    [
      'geometry metadata',
      'GENERATION_TARGET_CHANGED',
      (captured) => {
        captured.composite.width = 128
      },
    ],
    [
      'foreign embedded profile',
      'GENERATION_TARGET_CHANGED',
      (captured) => {
        const bytes = png(0, Buffer.from('foreign profile'))
        Object.assign(captured.composite, { bytes, byteSize: bytes.length, sha256: sha256(bytes) })
      },
    ],
    [
      'missing embedded profile',
      'GENERATION_TARGET_CHANGED',
      (captured) => {
        const bytes = png(0, null)
        Object.assign(captured.composite, { bytes, byteSize: bytes.length, sha256: sha256(bytes) })
      },
    ],
    [
      'outpaint',
      'GENERATION_MODE_UNSUPPORTED',
      (captured) => {
        Object.assign(captured, target('outpaint'))
      },
    ],
    [
      'img2img strength missing',
      'GENERATION_SAMPLING_REQUIRED',
      (captured) => {
        Object.assign(captured, target('img2img'))
        captured.generationDraft.sampling.denoisingStrength = null
      },
    ],
  ]
  for (const [name, code, alter] of controls) {
    await t.test(name, async () => {
      const captured = target()
      alter(captured)
      const calls: string[] = []
      await assert.rejects(
        prepareAnimaGeneration({ modelService: resolver(calls), target: captured }),
        errorCode(code),
      )
      assert.deepEqual(calls, [])
    })
  }
  const captured = target()
  captured.generationDraft.sampling.denoisingStrength = 0.4
  const prepared = await prepareAnimaGeneration({ modelService: resolver(), target: captured })
  assert.equal(prepared.context.mode, 'txt2img')
  assert.equal(prepared.context.sampling.denoisingStrength, null)
  assert.equal(prepared.context.generationDraft.sampling.denoisingStrength, 0.4)
})

test('Anima frozen verification refuses settings, enabled-order, target and exact component drift', async (t) => {
  const captured = target()
  captured.generationDraft.loras = [
    { enabled: true, resource: reference('lora', 8), weight: -0.4 },
    { enabled: true, resource: reference('lora', 7), weight: 0 },
  ]
  const prepared = await prepareAnimaGeneration({ modelService: resolver(), target: captured })
  assertFrozenAnimaGeneration(prepared.context, prepared.targetPngBytes)
  await reverifyFrozenAnimaGeneration(prepared.context, resolver())
  const tampered = structuredClone(prepared.context)
  tampered.sampling.animaMethod = 'heun'
  assert.throws(
    () => assertFrozenAnimaGeneration(tampered, prepared.targetPngBytes),
    errorCode('GENERATION_PARAMETER_UNSUPPORTED'),
  )
  const reordered = structuredClone(prepared.context)
  reordered.loras.reverse()
  assert.throws(
    () => assertFrozenAnimaGeneration(reordered, prepared.targetPngBytes),
    errorCode('GENERATION_RESOURCE_CHANGED'),
  )
  const changedBytes = Buffer.from(prepared.targetPngBytes)
  changedBytes[0] = 0
  assert.throws(
    () => assertFrozenAnimaGeneration(prepared.context, changedBytes),
    errorCode('GENERATION_TARGET_CHANGED'),
  )
  for (const [name, alter] of [
    [
      'checkpoint path',
      (value: VerifiedAnimaGenerationBundle) => {
        value.checkpoint.managedPath = '/new/checkpoint.safetensors'
      },
    ],
    [
      'checkpoint size',
      (value: VerifiedAnimaGenerationBundle) => {
        value.checkpoint.byteSize += 1
      },
    ],
    [
      'Qwen hash',
      (value: VerifiedAnimaGenerationBundle) => {
        value.qwen3Encoder.sha256 = 'd'.repeat(64)
      },
    ],
    [
      'Qwen local version',
      (value: VerifiedAnimaGenerationBundle) => {
        value.qwen3Encoder.localVersionId = 'replacement-version'
      },
    ],
    [
      'VAE local model',
      (value: VerifiedAnimaGenerationBundle) => {
        value.vae.localModelId = 'replacement-model'
      },
    ],
    [
      'VAE size',
      (value: VerifiedAnimaGenerationBundle) => {
        value.vae.byteSize += 1
      },
    ],
  ] as const) {
    await t.test(name, async () => {
      const changed = resolver()
      changed.resolveVerifiedGenerationAnimaBundleForPlan = async (ref) => {
        const value = bundle(ref)
        alter(value)
        return value
      }
      await assert.rejects(
        reverifyFrozenAnimaGeneration(prepared.context, changed),
        errorCode('GENERATION_RESOURCE_CHANGED'),
      )
    })
  }
  const changedLora = resolver()
  const base = changedLora.resolveVerifiedAnimaGenerationLoraForPlan
  changedLora.resolveVerifiedAnimaGenerationLoraForPlan = async (ref) => ({
    ...(await base(ref)),
    byteSize: 999,
  })
  await assert.rejects(
    reverifyFrozenAnimaGeneration(prepared.context, changedLora),
    errorCode('GENERATION_RESOURCE_CHANGED'),
  )
})

test('Anima reverify snapshots context before awaiting bundle resolution', async () => {
  const captured = target()
  captured.generationDraft.loras = [{ enabled: true, resource: reference('lora', 8), weight: -0.4 }]
  const prepared = await prepareAnimaGeneration({ modelService: resolver(), target: captured })
  const calls: string[] = []
  const base = resolver(calls)
  const checking = reverifyFrozenAnimaGeneration(prepared.context, {
    ...base,
    resolveVerifiedGenerationAnimaBundleForPlan: async (ref) => {
      prepared.context.loras[0].reference = reference('lora', 99)
      prepared.context.generationDraft.loras[0].resource = reference('lora', 99)
      return await base.resolveVerifiedGenerationAnimaBundleForPlan(ref)
    },
  })
  await checking
  assert.deepEqual(calls, ['bundle:1', 'lora:8'])
})

function errorCode(code: string): (error: unknown) => boolean {
  return (error) => error instanceof GenerationPreparationError && error.code === code
}

function png(alpha: number, icc: Buffer | null = profile): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(64, 0)
  header.writeUInt32BE(64, 4)
  header[8] = 8
  header[9] = 6
  const pixels = Buffer.alloc((64 * 4 + 1) * 64)
  for (let row = 0; row < 64; row += 1) {
    for (let column = 0; column < 64; column += 1) {
      pixels[row * (64 * 4 + 1) + 1 + column * 4 + 3] = alpha
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    ...(icc ? [chunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(icc)]))] : []),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type: string, payload: Buffer): Buffer {
  const data = Buffer.concat([Buffer.from(type), payload])
  const result = Buffer.alloc(payload.length + 12)
  result.writeUInt32BE(payload.length, 0)
  data.copy(result, 4)
  let crc = 0xff_ff_ff_ff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xed_b8_83_20 : 0)
    }
  }
  result.writeUInt32BE((crc ^ 0xff_ff_ff_ff) >>> 0, result.length - 4)
  return result
}
