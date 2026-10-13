import assert from 'node:assert/strict'
import test from 'node:test'

import { IGS_SAFETY_CEILINGS } from '../projects/project-schema.js'
import {
  isPresetRecord,
  parsePresetDefinition,
  parsePresetPayload,
  PRESET_SECTION_KEYS,
  type PresetDefinition,
  type PresetRecord,
} from './preset-schema.js'

const id = '533a0b45-cd81-447b-a02f-94f17ebbac4a'
const updatedAt = '2026-10-13T10:00:00.000Z'

function resource(kind: 'checkpoint' | 'embedding' | 'lora' | 'vae' = 'checkpoint') {
  return {
    baseModelFamily: 'illustrious' as const,
    civitaiFileId: 13,
    civitaiModelId: 11,
    civitaiVersionId: 12,
    displayName: 'Exact checkpoint',
    fileSha256: 'a'.repeat(64),
    kind,
    localModelId: 'ef75420c-4cdd-4a74-842f-c743c73347a4',
    localVersionId: '8ace4bdd-3734-43d1-86ee-36fb4ebcdb8e',
    predictionType: kind === 'checkpoint' ? ('epsilon' as const) : null,
    versionName: 'v1',
  }
}

function definition(payload: unknown = { prompt: { embeddingRefs: [], text: '' } }) {
  return {
    description: '',
    favorite: false,
    name: 'Preset',
    payload,
    tags: [],
    workflow: 'imageToImage',
  }
}

function record(
  definitionInput: PresetDefinition = parsePresetDefinition(definition()),
): PresetRecord {
  return { ...definitionInput, deletedAt: null, expiresAt: null, id, updatedAt }
}

test('preset payload preserves all twelve approved groups and copied exact resource identities', () => {
  const noiseProfile = {
    baseSchedule: 'sdxl-scaled-linear-v1',
    rescaleBetasZeroSnr: true,
    schemaVersion: 1,
    timestepSpacing: 'trailing',
  }
  const payload = {
    cfgRescale: 0,
    denoisingStrength: 0,
    guidance: { cfgScale: 0, steps: 1 },
    loras: [{ enabled: false, resource: resource('lora'), weight: -0.75 }],
    model: { ...resource(), noiseProfile },
    negativePrompt: { embeddingRefs: [], text: '' },
    prompt: {
      embeddingRefs: [{ resource: resource('embedding'), token: '<lamp>' }],
      text: 'a blue <lamp>, (свет:1.2)',
    },
    sampling: { sampler: 'Euler', scheduler: 'Normal' },
    seed: { policy: 'fixed', value: 0 },
    size: { height: 32_768, width: 8 },
    vae: resource('vae'),
    vaePrecision: 'FP32',
  }
  const parsed = parsePresetPayload(payload)
  assert.deepEqual(parsed, payload)
  assert.deepEqual(Object.keys(parsed).sort(), [...PRESET_SECTION_KEYS].sort())
  const before = structuredClone(payload)
  parsed.model.displayName = 'Edited detached resource'
  parsed.prompt.embeddingRefs[0].token = '<other>'
  parsed.loras[0].weight = 0.5
  assert.deepEqual(
    payload,
    before,
    'parsed resource/sidecar/stack values must not alias the caller',
  )
})

test('omitted sections, selected empty LoRAs, empty prompts and Embedded VAE remain distinct', () => {
  assert.deepEqual(parsePresetPayload({}), {})
  assert.deepEqual(parsePresetPayload({ loras: [] }), { loras: [] })
  assert.deepEqual(parsePresetPayload({ vae: null }), { vae: null })
  assert.deepEqual(parsePresetPayload({ prompt: { embeddingRefs: [], text: '' } }), {
    prompt: { embeddingRefs: [], text: '' },
  })
  for (const payload of [
    { loras: [] },
    { vae: null },
    { prompt: { embeddingRefs: [], text: '' } },
  ]) {
    assert.deepEqual(parsePresetDefinition(definition(payload)).payload, payload)
  }
  assert.throws(() => parsePresetDefinition(definition({})))
  assert.throws(() => parsePresetDefinition(definition({ loras: undefined })))
})

test('text-to-image write normalization removes strength before validating included sections', () => {
  const source = {
    ...definition({ denoisingStrength: 0.25, loras: [], seed: { policy: 'reuse' } }),
    name: '  Night studio  ',
    workflow: 'textToImage',
  }
  const before = structuredClone(source)
  const parsed = parsePresetDefinition(source)
  assert.equal(parsed.name, 'Night studio')
  assert.deepEqual(parsed.payload, { loras: [], seed: { policy: 'reuse' } })
  assert.deepEqual(source, before)
  assert.throws(() =>
    parsePresetDefinition({ ...definition({ denoisingStrength: 0.25 }), workflow: 'textToImage' }),
  )
  const switchedBack = parsePresetDefinition({ ...parsed, workflow: 'imageToImage' })
  assert.equal(Object.hasOwn(switchedBack.payload, 'denoisingStrength'), false)
  assert.equal(
    parsePresetDefinition({ ...source, workflow: 'smartPatch' }).payload.denoisingStrength,
    0.25,
  )
})

test('fixed seeds require uint32 including zero while Random and Reuse store only policy', () => {
  for (const value of [0, 0xff_ff_ff_ff]) {
    assert.deepEqual(parsePresetPayload({ seed: { policy: 'fixed', value } }), {
      seed: { policy: 'fixed', value },
    })
  }
  for (const policy of ['random', 'reuse']) {
    assert.deepEqual(parsePresetPayload({ seed: { policy } }), { seed: { policy } })
    for (const value of [0, null, 19]) {
      assert.throws(() => parsePresetPayload({ seed: { policy, value } }))
    }
  }
  for (const seed of [
    { policy: 'fixed' },
    { policy: 'fixed', value: null },
    { policy: 'fixed', value: -1 },
    { policy: 'fixed', value: 0x1_00_00_00_00 },
    { policy: 'fixed', value: 1.5 },
    { policy: 'fixed', value: Infinity },
    { lastActualSeed: 0, policy: 'reuse' },
    { actualSeed: 0, policy: 'fixed', value: 0 },
  ]) {
    assert.throws(() => parsePresetPayload({ seed }))
  }
})

test('sampling persists only specified fields, rejects empty sections and validates native names', () => {
  for (const sampling of [
    { sampler: 'Euler' },
    { scheduler: 'Karras' },
    { animaMethod: 'heun' },
    { animaMethod: 'euler', sampler: 'Euler', scheduler: 'Normal' },
  ]) {
    assert.deepEqual(parsePresetPayload({ sampling }), { sampling })
  }
  for (const sampling of [
    {},
    { sampler: undefined },
    { sampler: '' },
    { scheduler: '   ' },
    { animaMethod: 'not-an-anima-method' },
    { actualSeed: 0, sampler: 'Euler' },
  ]) {
    assert.throws(() => parsePresetPayload({ sampling }))
  }
})

test('resource kind, SHA and embedding token remain strict without a catalog lookup', () => {
  const missing = {
    ...resource('embedding'),
    localModelId: 'unlinked-model',
    localVersionId: 'unlinked-version',
  }
  assert.deepEqual(
    parsePresetPayload({
      prompt: { embeddingRefs: [{ resource: missing, token: '<missing>' }], text: '<missing>' },
    }).prompt!.embeddingRefs[0].resource,
    missing,
  )
  const incompatible = {
    loras: [
      { enabled: true, resource: { ...resource('lora'), baseModelFamily: 'anima' }, weight: -1 },
    ],
    model: resource(),
  }
  assert.deepEqual(
    parsePresetPayload(incompatible),
    incompatible,
    'availability/family diagnostics belong to selected-section application',
  )
  for (const payload of [
    { model: resource('lora') },
    { vae: resource() },
    { loras: [{ enabled: true, resource: resource(), weight: 0.5 }] },
    {
      prompt: {
        embeddingRefs: [{ resource: resource('lora'), token: '<wrong>' }],
        text: '<wrong>',
      },
    },
    { prompt: { embeddingRefs: [{ resource: resource('embedding'), token: '   ' }], text: '' } },
    { model: { ...resource(), fileSha256: 'a'.repeat(63) } },
    { model: { ...resource(), managedPath: '/private/model.safetensors' } },
    { model: { id: 'prototype-model', name: 'Prototype model' } },
  ]) {
    assert.throws(() => parsePresetPayload(payload))
  }
})

test('noise snapshot belongs to the exact Illustrious model section and is never invented for Anima', () => {
  const anima = { ...resource(), baseModelFamily: 'anima', predictionType: null }
  assert.deepEqual(parsePresetPayload({ model: anima }), { model: anima })
  const profile = {
    baseSchedule: 'sdxl-scaled-linear-v1',
    rescaleBetasZeroSnr: false,
    schemaVersion: 1,
    timestepSpacing: 'leading',
  }
  assert.throws(() => parsePresetPayload({ model: { ...anima, noiseProfile: profile } }))
  assert.throws(() => parsePresetPayload({ noiseProfile: profile }))
  assert.throws(() =>
    parsePresetPayload({
      model: { ...resource(), noiseProfile: { ...profile, timestepSpacing: 'auto' } },
    }),
  )
})

test('portable authoring ranges refuse invalid numbers without pretending to qualify hardware', () => {
  assert.equal(
    parsePresetPayload({ guidance: { cfgScale: 1000, steps: 1000 } }).guidance!.steps,
    1000,
  )
  for (const value of [0, 1]) {
    assert.deepEqual(parsePresetPayload({ cfgRescale: value, denoisingStrength: value }), {
      cfgRescale: value,
      denoisingStrength: value,
    })
  }
  for (const payload of [
    { guidance: { cfgScale: -1, steps: 1 } },
    { guidance: { cfgScale: NaN, steps: 1 } },
    { guidance: { cfgScale: 0, steps: 0 } },
    { guidance: { cfgScale: 0, steps: 1.5 } },
    { guidance: { cfgScale: 0, steps: Number.MAX_SAFE_INTEGER + 1 } },
    { guidance: { cfgScale: 0 } },
    { loras: [{ enabled: true, resource: resource('lora'), weight: Infinity }] },
    { loras: [{ enabled: true, resource: resource('lora'), weight: NaN }] },
    { cfgRescale: -0.01 },
    { cfgRescale: 1.01 },
    { denoisingStrength: 1.01 },
    { size: { height: 1024, width: 7 } },
    { size: { height: 1024, width: 32_769 } },
    { size: { height: 1024, width: 8.5 } },
    { size: { height: 1024, width: 1024, x: 0 } },
    { vaePrecision: 'BF16' },
  ]) {
    assert.throws(() => parsePresetPayload(payload))
  }
})

test('excluded layer, execution, batch and engine groups cannot enter the portable payload', () => {
  for (const key of [
    'regions',
    'regionalGuidance',
    'mask',
    'bbox',
    'batch',
    'dynamicPrompt',
    'advanced',
    'engineSpecific',
    'clipSkip',
    'executionResultContext',
    'layerSourceContext',
  ]) {
    assert.throws(() =>
      parsePresetPayload({ [key]: {}, prompt: { embeddingRefs: [], text: 'lamp' } }),
    )
  }
})

test('definition metadata preserves user tags, validates UTF-8 bounds and rejects unknown fields', () => {
  const source = { ...definition(), favorite: true, tags: ['Anime', 'anime', '', '  studio  '] }
  assert.deepEqual(parsePresetDefinition(source).tags, source.tags)
  assert.equal(parsePresetDefinition({ ...source, name: 'é'.repeat(512) }).name.length, 512)
  for (const invalid of [
    { ...source, name: '   ' },
    { ...source, name: 'é'.repeat(513) },
    { ...source, description: 'x'.repeat(IGS_SAFETY_CEILINGS.textBytes + 1) },
    { ...source, tags: Array.from({ length: 65 }).fill('tag') },
    { ...source, tags: ['é'.repeat(65)] },
    { ...source, favorite: 1 },
    { ...source, workflow: 'txt2img' },
    { ...source, id },
    { ...source, projectId: id },
  ]) {
    assert.throws(() => parsePresetDefinition(invalid))
  }
})

test('actual serialized payload budget rejects composed valid sections rather than only individual strings', () => {
  const largeResource = {
    ...resource('lora'),
    displayName: 'a'.repeat(IGS_SAFETY_CEILINGS.titleBytes),
    localModelId: 'b'.repeat(IGS_SAFETY_CEILINGS.titleBytes),
    localVersionId: 'c'.repeat(IGS_SAFETY_CEILINGS.titleBytes),
    versionName: 'd'.repeat(IGS_SAFETY_CEILINGS.titleBytes),
  }
  const entry = { enabled: false, resource: largeResource, weight: -0.5 }
  const healthy = { loras: Array.from({ length: 100 }).fill(entry) }
  assert.ok(
    Buffer.byteLength(JSON.stringify(healthy), 'utf8') < IGS_SAFETY_CEILINGS.projectJsonBytes,
  )
  assert.equal(parsePresetPayload(healthy).loras!.length, 100)
  const oversized = { loras: Array.from({ length: 4000 }).fill(entry) }
  assert.ok(
    Buffer.byteLength(JSON.stringify(oversized), 'utf8') > IGS_SAFETY_CEILINGS.projectJsonBytes,
  )
  assert.throws(() => parsePresetPayload(oversized), /portable JSON budget/)
  assert.throws(() => parsePresetDefinition(definition(oversized)), /portable JSON budget/)
})

test('stored records require canonical identity/time/normalization and paired deletion state', () => {
  const active = record()
  assert.equal(isPresetRecord(active), true)
  assert.equal(
    isPresetRecord({ ...active, deletedAt: updatedAt, expiresAt: '2026-11-12T10:00:00.000Z' }),
    true,
  )
  for (const invalid of [
    { ...active, id: 'preset-1' },
    { ...active, updatedAt: '2026-10-13T10:00:00Z' },
    { ...active, updatedAt: '2026-10-13T10:00:00.000+00:00' },
    { ...active, updatedAt: '2026-02-30T10:00:00.000Z' },
    { ...active, name: ' Preset ' },
    { ...active, payload: {} },
    { ...active, payload: { denoisingStrength: 0.5, vae: null }, workflow: 'textToImage' },
    { ...active, deletedAt: updatedAt },
    { ...active, expiresAt: updatedAt },
    { ...active, deletedAt: updatedAt, expiresAt: updatedAt },
    { ...active, deletedAt: updatedAt, expiresAt: '2026-10-12T10:00:00.000Z' },
    { ...active, deletedAt: 'not-a-date', expiresAt: '2026-11-12T10:00:00.000Z' },
    { ...active, schemaVersion: 1 },
  ]) {
    assert.equal(isPresetRecord(invalid), false)
  }
})
