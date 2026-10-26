import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import type { PresetPayload } from '../presets/preset-schema.js'

import { ANIMA_SAMPLING_METHOD_KEYS } from './anima-sampling-method.js'
import {
  isSmartResultPresetData,
  isSmartResultPresetDataForRequest,
  isSmartResultPresetOwner,
  isSmartResultPresetPayload,
  isSmartResultPresetRequest,
  parseSmartResultPresetData,
  parseSmartResultPresetPayload,
  parseSmartResultPresetRequest,
  type SmartResultPresetData,
  type SmartResultPresetPayload,
  type SmartResultPresetRequest,
  smartResultPresetResultId,
} from './smart-result-preset.js'

function resource<K extends 'checkpoint' | 'embedding' | 'lora' | 'vae'>(
  kind: K,
  family: 'anima' | 'illustrious' = 'illustrious',
) {
  return {
    baseModelFamily: family,
    civitaiFileId: 303,
    civitaiModelId: 101,
    civitaiVersionId: 202,
    displayName: `Frozen ${kind}`,
    fileSha256: 'a'.repeat(64),
    kind,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType:
      kind === 'checkpoint' && family === 'illustrious' ? ('v_prediction' as const) : null,
    versionName: 'Original version',
  }
}

/** Literal portable wire input, independent of the Main projector under test elsewhere. */
function payload(family: 'anima' | 'illustrious' = 'illustrious'): SmartResultPresetPayload {
  return {
    guidance: { cfgScale: 4, steps: 8 },
    model: resource('checkpoint', family),
    negativePrompt: { embeddingRefs: [], text: '(blur:-0.5)' },
    prompt: { embeddingRefs: [], text: '(lantern:1.5), one expanded result' },
    sampling:
      family === 'anima' ? { animaMethod: 'heun' } : { sampler: 'Euler', scheduler: 'Normal' },
  }
}

function request(variant = true): SmartResultPresetRequest {
  return {
    assetSha256: 'b'.repeat(64),
    documentId: randomUUID(),
    documentRevision: randomUUID(),
    owner: variant
      ? { kind: 'smart-patch-variant', layerId: randomUUID(), variantId: randomUUID() }
      : { kind: 'raster', layerId: randomUUID() },
  }
}

function data(source = request()): SmartResultPresetData {
  return {
    ...structuredClone(source),
    payload: payload(),
    resultId: smartResultPresetResultId(source.owner),
    workflow: 'smartPatch',
  }
}

test('Smart preset source accepts exact nested and converted-Raster owners with detached portable payloads', () => {
  for (const variant of [false, true]) {
    const captured = request(variant)
    const reply = data(captured)
    assert.ok(isSmartResultPresetOwner(captured.owner))
    assert.ok(isSmartResultPresetRequest(captured))
    assert.deepEqual(parseSmartResultPresetRequest(captured), captured)
    assert.ok(isSmartResultPresetData(reply))
    assert.ok(isSmartResultPresetDataForRequest(reply, captured))
    assert.deepEqual(parseSmartResultPresetData(reply), reply)
  }
})

test('Smart source owner/request guards reject malformed identities and extra private fields rather than strip them', () => {
  const captured = request()
  const invalid: unknown[] = [
    null,
    [],
    { ...captured, assetSha256: 'B'.repeat(64) },
    { ...captured, assetSha256: 'b'.repeat(63) },
    { ...captured, documentId: 'another-document' },
    { ...captured, documentRevision: '' },
    { ...captured, sourcePath: '/private/source.png' },
    { ...captured, owner: { kind: 'smart-patch', layerId: randomUUID() } },
    { ...captured, owner: { kind: 'raster', layerId: randomUUID(), variantId: randomUUID() } },
    { ...captured, owner: { kind: 'smart-patch-variant', layerId: randomUUID() } },
    {
      ...captured,
      owner: {
        kind: 'smart-patch-variant',
        layerId: captured.documentId,
        variantId: captured.documentId,
      },
    },
    { ...captured, owner: { ...captured.owner, imagePath: '/private/image.png' } },
  ]
  for (const input of invalid) {
    assert.equal(isSmartResultPresetRequest(input), false)
    assert.throws(() => parseSmartResultPresetRequest(input))
  }
})

test('Smart source reply guard binds document, revision, current parent, exact result and asset independently', () => {
  const captured = request()
  const reply = data(captured)
  assert.equal(captured.owner.kind, 'smart-patch-variant')
  if (captured.owner.kind !== 'smart-patch-variant') {
    assert.fail('Expected a nested owner.')
  }
  const nestedOwner = captured.owner
  const crossed: SmartResultPresetData[] = [
    { ...reply, documentId: randomUUID() },
    { ...reply, documentRevision: randomUUID() },
    { ...reply, assetSha256: 'c'.repeat(64) },
    { ...reply, owner: { ...nestedOwner, layerId: randomUUID() } },
    (() => {
      const resultId = randomUUID()
      return { ...reply, owner: { ...nestedOwner, variantId: resultId }, resultId }
    })(),
    { ...reply, owner: { kind: 'raster', layerId: reply.resultId } },
  ]
  for (const input of crossed) {
    assert.ok(isSmartResultPresetData(input), 'A valid other source remains valid on its own.')
    assert.equal(isSmartResultPresetDataForRequest(input, captured), false)
  }
  assert.equal(isSmartResultPresetDataForRequest(reply, captured), true)
})

test('Smart source rejects inconsistent result IDs, non-Smart workflow and private response groups', () => {
  const reply = data()
  for (const input of [
    { ...reply, resultId: randomUUID() },
    { ...reply, workflow: 'imageToImage' },
    { ...reply, currentMode: 'inpaint' },
    { ...reply, generationConfiguration: {} },
    { ...reply, layerSourceContext: { internalResolution: { height: 64, width: 64 } } },
    { ...reply, executionResultContext: { queueItemId: randomUUID() } },
  ]) {
    assert.equal(isSmartResultPresetData(input), false)
    assert.throws(() => parseSmartResultPresetData(input))
  }
})

test('Smart payload requires all five core sections and forbids Size, Seed, batch and component identities', () => {
  const original = payload()
  for (const key of ['prompt', 'negativePrompt', 'model', 'sampling', 'guidance']) {
    const missing = structuredClone(original)
    Reflect.deleteProperty(missing, key)
    assert.equal(isSmartResultPresetPayload(missing), false, key)
    assert.equal(isSmartResultPresetPayload({ ...original, [key]: undefined }), false, key)
  }
  for (const [key, value] of Object.entries({
    anima: { vae: { byteSize: 512, sha256: 'd'.repeat(64) } },
    batch: { queueItemId: randomUUID() },
    dynamicPrompt: { maxPrompts: 4, seedBehavior: 'per-prompt' },
    executionResultContext: {},
    internalResolution: { height: 64, width: 64 },
    layerSourceContext: {},
    seed: { policy: 'fixed', value: 0 },
    size: { height: 64, width: 64 },
  })) {
    assert.equal(isSmartResultPresetPayload({ ...original, [key]: value }), false, key)
    assert.throws(() => parseSmartResultPresetPayload({ ...original, [key]: value }))
  }
  assert.equal(isSmartResultPresetPayload({ ...original, size: undefined }), false)
  assert.equal(isSmartResultPresetPayload({ ...original, seed: undefined }), false)
  assert.equal(
    isSmartResultPresetPayload({
      ...original,
      model: { ...original.model, managedPath: '/private/model' },
    }),
    false,
  )
  assert.equal(
    isSmartResultPresetPayload({
      ...original,
      sampling: { ...original.sampling, invokeScheduler: 'euler' },
    }),
    false,
  )
  assert.equal(isSmartResultPresetPayload(original), true)
})

test('Smart payload preserves optional absence versus explicit empty, Embedded, zero and Auto without defaults', () => {
  const absent = payload()
  assert.deepEqual(parseSmartResultPresetPayload(absent), absent)
  assert.deepEqual(Object.keys(parseSmartResultPresetPayload(absent)).sort(), [
    'guidance',
    'model',
    'negativePrompt',
    'prompt',
    'sampling',
  ])
  const explicit = {
    ...absent,
    cfgRescale: 0,
    denoisingStrength: 0,
    loras: [],
    vae: null,
    vaePrecision: 'Auto' as const,
  }
  assert.deepEqual(parseSmartResultPresetPayload(explicit), explicit)
  assert.equal(
    isSmartResultPresetPayload({ ...explicit, guidance: { cfgScale: 4, steps: 0 } }),
    false,
  )
  assert.equal(isSmartResultPresetPayload({ ...explicit, denoisingStrength: Number.NaN }), false)
})

test('Smart payload keeps exact Illustrious prompt sidecars, policy hints and signed enabled/disabled LoRAs', () => {
  const value = payload()
  value.model.noiseProfile = {
    baseSchedule: 'sdxl-scaled-linear-v1',
    rescaleBetasZeroSnr: true,
    schemaVersion: 1,
    timestepSpacing: 'trailing',
  }
  value.prompt = {
    embeddingRefs: [{ resource: resource('embedding'), token: '<frozen-positive>' }],
    text: '<frozen-positive>, lantern',
  }
  value.negativePrompt = {
    embeddingRefs: [{ resource: resource('embedding'), token: '<frozen-negative>' }],
    text: '<frozen-negative>, blur',
  }
  value.loras = [
    { enabled: true, resource: resource('lora'), weight: -0.5 },
    { enabled: false, resource: resource('lora', 'anima'), weight: 0 },
  ]
  value.vae = resource('vae')
  assert.deepEqual(parseSmartResultPresetPayload(value), value)
  assert.equal(isSmartResultPresetPayload({ ...value, sampling: { animaMethod: 'euler' } }), false)
  assert.equal(isSmartResultPresetPayload({ ...value, sampling: { sampler: 'Euler' } }), false)
  assert.equal(
    isSmartResultPresetPayload({ ...value, model: { ...value.model, predictionType: null } }),
    false,
  )
  assert.equal(isSmartResultPresetPayload({ ...value, vae: resource('vae', 'anima') }), false)
  assert.equal(
    isSmartResultPresetPayload({
      ...value,
      loras: [{ enabled: true, resource: resource('lora', 'anima'), weight: 1 }],
    }),
    false,
  )
})

test('Smart Anima payload admits the complete native registry and refuses SD fields, embeddings and companion-as-VAE', () => {
  const value = payload('anima')
  for (const animaMethod of ANIMA_SAMPLING_METHOD_KEYS) {
    assert.ok(isSmartResultPresetPayload({ ...value, sampling: { animaMethod } }))
  }
  const invalid: PresetPayload[] = [
    { ...value, sampling: { animaMethod: 'heun', sampler: 'Euler', scheduler: 'Normal' } },
    { ...value, sampling: { sampler: 'Euler', scheduler: 'Normal' } },
    { ...value, model: { ...value.model, predictionType: 'epsilon' } },
    { ...value, vae: null },
    { ...value, vae: resource('vae', 'anima') },
    { ...value, vaePrecision: 'FP32' },
    { ...value, cfgRescale: 0.1 },
    {
      ...value,
      prompt: {
        embeddingRefs: [{ resource: resource('embedding'), token: '<wrong>' }],
        text: '<wrong>',
      },
    },
    { ...value, loras: [{ enabled: true, resource: resource('lora'), weight: -0.5 }] },
  ]
  for (const input of invalid) {
    assert.equal(isSmartResultPresetPayload(input), false)
  }
  assert.equal(
    isSmartResultPresetPayload({ ...value, sampling: { animaMethod: 'unknown' } }),
    false,
  )
  assert.ok(
    isSmartResultPresetPayload({ ...value, cfgRescale: 0, loras: [], vaePrecision: 'Auto' }),
  )
})
