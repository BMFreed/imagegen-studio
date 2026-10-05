import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { acceptedRasterProvenanceFixture } from '../../main/projects/test-fixtures/accepted-provenance.js'
import { ANIMA_SAMPLING_METHOD_KEYS } from './anima-sampling-method.js'
import {
  createEmptyProjectDocumentV1,
  isRasterGenerationConfigurationV1,
  parseProjectDocumentV1,
  parseRasterGenerationProvenanceV1,
} from './project-schema.js'

/** Inputs for the strict metadata boundary; no PNG/worker validation is claimed here. */
function record(mode: 'img2img' | 'txt2img' = 'txt2img') {
  const document = createEmptyProjectDocumentV1({ title: 'Schema input' })
  const legacy = acceptedRasterProvenanceFixture(document, Buffer.from('metadata input'), {
    height: 128,
    width: 64,
    x: -7,
    y: 12,
  })
  const component = (sha256: string) => ({
    byteSize: 1024,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    sha256,
  })
  const parsed = parseRasterGenerationProvenanceV1({
    ...legacy,
    generationConfiguration: {
      anima: {
        architecture: 'anima-base-1.0',
        checkpointByteSize: 2048,
        qwen3Encoder: component('c'.repeat(64)),
        vae: component('d'.repeat(64)),
      },
      loras: [],
      mode,
      model: {
        ...legacy.generationConfiguration.model,
        baseModelFamily: 'anima',
        predictionType: null,
      },
      negativePrompt: { embeddingRefs: [], text: '(blur:0.5), worse--' },
      positivePrompt: { embeddingRefs: [], text: '(cat:2), dog++' },
      sampling: {
        ...(mode === 'img2img' ? { denoisingStrength: 0 } : {}),
        actualSeed: 0,
        animaMethod: 'euler',
        cfgScale: 4.5,
        requestedSeedPolicy: 'reuse',
        seedBehavior: 'per-prompt',
        steps: 200,
      },
      size: legacy.generationConfiguration.size,
    },
    kind: mode === 'img2img' ? 'anima-img2img' : 'anima-txt2img',
  })
  assert.ok(parsed.kind === 'anima-txt2img' || parsed.kind === 'anima-img2img')
  return parsed
}

test('strict portable Anima metadata accepts the complete native method registry in both normal modes without synthesizing SD fields', () => {
  for (const mode of ['txt2img', 'img2img'] as const) {
    for (const animaMethod of ANIMA_SAMPLING_METHOD_KEYS) {
      const input = record(mode)
      input.generationConfiguration.sampling.animaMethod = animaMethod
      const parsed = parseRasterGenerationProvenanceV1(input)
      assert.deepEqual(parsed, input)
      assert.equal(isRasterGenerationConfigurationV1(input.generationConfiguration), true)
      assert.equal(parsed.generationConfiguration.sampling.actualSeed, 0)
      for (const key of ['sampler', 'scheduler', 'invokeScheduler']) {
        assert.equal(Object.hasOwn(parsed.generationConfiguration.sampling, key), false)
      }
      assert.equal(parsed.generationConfiguration.model.predictionType, null)
      if (parsed.kind === 'anima-img2img') {
        assert.equal(parsed.generationConfiguration.sampling.denoisingStrength, 0)
      }
    }
  }
})

test('Anima portable configuration rejects foreign family semantics, incomplete component identities and private or regional input', () => {
  const changes: ((input: ReturnType<typeof record>) => void)[] = [
    (input) => Object.assign(input.generationConfiguration.model, { predictionType: 'epsilon' }),
    (input) =>
      Object.assign(input.generationConfiguration.model, { baseModelFamily: 'illustrious' }),
    (input) => Object.assign(input.generationConfiguration.sampling, { sampler: 'Euler' }),
    (input) => Object.assign(input.generationConfiguration.sampling, { scheduler: 'Karras' }),
    (input) =>
      Object.assign(input.generationConfiguration.sampling, { invokeScheduler: 'euler_a' }),
    (input) => Object.assign(input.generationConfiguration.sampling, { animaMethod: 'unknown' }),
    (input) => Object.assign(input.generationConfiguration.sampling, { seedBehavior: 'unknown' }),
    (input) => Object.assign(input.generationConfiguration, { cfgRescale: 0.1 }),
    (input) => Object.assign(input.generationConfiguration, { vaePrecision: 'FP16' }),
    (input) => Object.assign(input.generationConfiguration, { vae: null }),
    (input) => Object.assign(input.generationConfiguration.anima, { architecture: 'sdxl' }),
    (input) => Object.assign(input.generationConfiguration.anima, { checkpointByteSize: 0 }),
    (input) => Object.assign(input.generationConfiguration.anima.qwen3Encoder, { byteSize: -1 }),
    (input) => Object.assign(input.generationConfiguration.anima.qwen3Encoder, { sha256: 'bad' }),
    (input) => Object.assign(input.generationConfiguration.anima.vae, { localModelId: '/private' }),
    (input) => Object.assign(input.generationConfiguration.anima.vae, { managedPath: '/private' }),
    (input) => {
      delete (
        input.generationConfiguration.anima as Partial<typeof input.generationConfiguration.anima>
      ).vae
    },
    (input) => {
      delete (input.generationConfiguration as Partial<typeof input.generationConfiguration>).loras
    },
    (input) => {
      input.generationConfiguration.positivePrompt.embeddingRefs = [
        {
          resource: { ...input.generationConfiguration.model, kind: 'embedding' },
          token: '<embedding>',
        },
      ]
    },
    (input) => {
      input.generationConfiguration.loras = [
        {
          enabled: true,
          resource: {
            ...input.generationConfiguration.model,
            baseModelFamily: 'illustrious',
            kind: 'lora',
          },
          weight: 1,
        },
      ]
    },
    (input) => Object.assign(input, { regionalGuidance: [] }),
    (input) => Object.assign(input.generationConfiguration, { regionalGuidance: [] }),
    (input) => Object.assign(input.layerSourceContext, { regionalMasks: [] }),
    (input) => Object.assign(input.executionResultContext, { regionalPrompts: [] }),
    (input) => Object.assign(input.generationConfiguration.size, { width: 8 }),
    (input) => {
      input.generationConfiguration.size = { height: 2048, width: 2048 }
      input.layerSourceContext.bbox = {
        ...input.layerSourceContext.bbox,
        height: 2048,
        width: 2048,
      }
      Object.assign(input.executionResultContext.output, { height: 2048, width: 2048 })
    },
  ]
  for (const change of changes) {
    const input = record()
    change(input)
    assert.throws(() => parseRasterGenerationProvenanceV1(input), { code: 'INVALID_PROJECT' })
  }
  const mismatch = record('img2img')
  Object.assign(mismatch, { kind: 'anima-txt2img' })
  assert.throws(() => parseRasterGenerationProvenanceV1(mismatch), { code: 'INVALID_PROJECT' })
})

test('new Anima records retain only explicit neutral options and disabled configured LoRA refs; legacy absence remains unchanged', () => {
  const native = record()
  native.generationConfiguration.cfgRescale = 0
  native.generationConfiguration.vaePrecision = 'Auto'
  native.generationConfiguration.loras = [
    {
      enabled: false,
      resource: {
        ...native.generationConfiguration.model,
        baseModelFamily: 'illustrious',
        kind: 'lora',
        predictionType: 'v_prediction',
      },
      weight: -0.7,
    },
  ]
  assert.deepEqual(parseRasterGenerationProvenanceV1(native), native)
  const document = createEmptyProjectDocumentV1({ title: 'Legacy neighbor' })
  const legacy = acceptedRasterProvenanceFixture(document, Buffer.from('metadata input'), {
    height: 128,
    width: 64,
    x: 0,
    y: 0,
  })
  assert.deepEqual(parseRasterGenerationProvenanceV1(legacy), legacy)
  assert.equal(
    Object.hasOwn(parseRasterGenerationProvenanceV1(legacy).generationConfiguration, 'anima'),
    false,
  )
  assert.deepEqual(parseProjectDocumentV1(document), document)
})
