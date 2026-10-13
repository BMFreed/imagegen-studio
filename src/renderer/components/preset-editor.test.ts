import type { ModelCatalogItem } from '../../shared/api.js'
import type { PresetRecord } from '../../shared/presets/preset-schema.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive } from 'vue'

import {
  emptyPresetDefinition,
  includePresetSection,
  presetDefinitionFromRecord,
  presetNeedsAttention,
  presetNumericInputValid,
  presetResourceReference,
  validatePresetDefinition,
} from './preset-editor.js'

test('numeric adapter distinguishes displayed edits from a stale Naive model', () => {
  assert.equal(presetNumericInputValid('28', 28, { integer: true, min: 1 }), true)
  assert.equal(presetNumericInputValid('-', 28, { integer: true, min: 1 }), false)
  assert.equal(presetNumericInputValid('-1', 28, { integer: true, min: 1 }), false)
  assert.equal(presetNumericInputValid('29', 28, { integer: true, min: 1 }), false)
  assert.equal(presetNumericInputValid('29', 29, { integer: true, min: 1 }), true)
  assert.equal(presetNumericInputValid('2.5', 2.5, { integer: true, min: 1 }), false)
  assert.equal(presetNumericInputValid('0', 0, { integer: true, max: 0xff_ff_ff_ff, min: 0 }), true)
  assert.equal(presetNumericInputValid('-0.2', -0.2), true, 'LoRA weights remain signed')
  assert.equal(presetNumericInputValid('1e-3', 0.001), true)
  for (const text of ['', ' ', '.', '1e', 'NaN', 'Infinity', '0xff']) {
    assert.equal(presetNumericInputValid(text, 28), false, text)
  }
  assert.equal(presetNumericInputValid('1.1', 1.1, { max: 1, min: 0 }), false)
  assert.equal(
    presetNumericInputValid('9007199254740992', 9_007_199_254_740_992, { integer: true }),
    false,
  )
})

function catalogFixture(): ModelCatalogItem[] {
  const checkpoint: ModelCatalogItem = {
    author: null,
    defaultVersionId: 'newer',
    description: null,
    id: 'checkpoint',
    modelId: 100,
    name: 'Installed checkpoint',
    previewDataUrl: null,
    resourceType: 'checkpoint',
    sourceUrl: null,
    trainedWords: [],
    versions: [
      {
        baseModelFamily: 'illustrious',
        civitaiFileId: 300,
        civitaiVersionId: 200,
        dependencyIssues: [],
        fileName: 'exact.safetensors',
        fileSizeBytes: 100,
        fileStatus: 'ready',
        format: 'SafeTensor',
        id: 'exact',
        installedAt: '2026-10-13T00:00:00.000Z',
        name: 'Exact version',
        predictionType: 'v_prediction',
        sha256: 'a'.repeat(64),
        trainedWords: [],
      },
    ],
  }
  checkpoint.versions.push({
    ...checkpoint.versions[0]!,
    civitaiFileId: 301,
    civitaiVersionId: 201,
    id: 'newer',
    name: 'Default version',
    sha256: 'b'.repeat(64),
  })
  return [checkpoint]
}

function recordFixture(): PresetRecord {
  const resource = catalogFixture()[0]!
  return {
    deletedAt: null,
    description: 'Description',
    expiresAt: null,
    favorite: true,
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Saved preset',
    payload: {
      model: {
        ...presetResourceReference(resource, resource.versions[0]!, 'checkpoint'),
        noiseProfile: {
          baseSchedule: 'sdxl-scaled-linear-v1',
          rescaleBetasZeroSnr: true,
          schemaVersion: 1,
          timestepSpacing: 'trailing',
        },
      },
      prompt: { embeddingRefs: [], text: 'A portrait' },
      seed: { policy: 'fixed', value: 0 },
      vae: null,
    },
    tags: ['portrait'],
    updatedAt: '2026-10-13T00:00:00.000Z',
    workflow: 'imageToImage',
  }
}

// Subject: the production editor adapter and shared canonical parser.
// Fixtures replace catalog inputs only; they do not replace validation or availability rules.
test('a new draft is transient and contains no invented resource or hidden seed section', () => {
  const draft = emptyPresetDefinition()
  assert.equal(validatePresetDefinition(draft), null, 'empty name cannot save')
  assert.deepEqual(draft.payload, { prompt: { embeddingRefs: [], text: '' } })
  draft.name = '  New preset  '
  const canonical = validatePresetDefinition(draft)
  assert.equal(canonical?.name, 'New preset')
  assert.equal(draft.name, '  New preset  ', 'validation must not edit the transient draft')
  assert.deepEqual(canonical?.payload, draft.payload)
  assert.equal(Object.hasOwn(draft, 'id'), false)
  const second = emptyPresetDefinition()
  draft.payload.prompt.text = 'Changed'
  assert.equal(second.payload.prompt!.text, '')
})

test('record editing detaches JSON including Vue proxies, identity, noise snapshot and fixed zero', () => {
  const record = reactive(recordFixture())
  const draft = presetDefinitionFromRecord(record)
  const originalPayload = JSON.parse(JSON.stringify(record.payload))
  assert.deepEqual(draft.payload, originalPayload)
  assert.equal(Object.hasOwn(draft, 'id'), false)
  assert.equal(Object.hasOwn(draft, 'deletedAt'), false)
  assert.equal(Object.hasOwn(draft, 'expiresAt'), false)
  assert.equal(Object.hasOwn(draft, 'updatedAt'), false)
  draft.name = 'Rename only'
  assert.deepEqual(validatePresetDefinition(draft)?.payload, originalPayload)
  draft.payload.model!.noiseProfile!.timestepSpacing = 'linspace'
  draft.payload.prompt!.text = 'Modified prompt'
  draft.tags.push('new')
  assert.deepEqual(JSON.parse(JSON.stringify(record.payload)), originalPayload)
  assert.deepEqual(record.tags, ['portrait'])
  assert.deepEqual(draft.payload.seed, { policy: 'fixed', value: 0 })
})

test('section inclusion uses field presence and preserves explicit clearing values', () => {
  const draft = emptyPresetDefinition()
  draft.name = 'Presence'
  includePresetSection(draft.payload, 'loras')
  includePresetSection(draft.payload, 'vae')
  assert.deepEqual(validatePresetDefinition(draft)?.payload, {
    loras: [],
    prompt: { embeddingRefs: [], text: '' },
    vae: null,
  })
  delete draft.payload.loras
  delete draft.payload.vae
  const absent = validatePresetDefinition(draft)!
  assert.equal(Object.hasOwn(absent.payload, 'loras'), false)
  assert.equal(Object.hasOwn(absent.payload, 'vae'), false)
  delete draft.payload.prompt
  assert.equal(validatePresetDefinition(draft), null, 'no included section cannot save')
  includePresetSection(draft.payload, 'model')
  assert.equal(draft.payload.model, null)
  assert.equal(validatePresetDefinition(draft), null, 'included model must be explicitly chosen')
  delete draft.payload.model
  includePresetSection(draft.payload, 'sampling')
  assert.equal(validatePresetDefinition(draft), null, 'empty sampling is an unfinished section')
  draft.payload.sampling = { animaMethod: 'heun' }
  assert.deepEqual(validatePresetDefinition(draft)?.payload.sampling, { animaMethod: 'heun' })
})

test('invalid cleared numerics remain invalid rather than restoring stale values on save', () => {
  const draft = presetDefinitionFromRecord(recordFixture())
  includePresetSection(draft.payload, 'size')
  assert.notEqual(validatePresetDefinition(draft), null)
  draft.payload.size!.width = null
  assert.equal(validatePresetDefinition(draft), null)
  draft.payload.size!.width = 1024
  draft.payload.size!.height = 32_768
  assert.notEqual(
    validatePresetDefinition(draft),
    null,
    'authoring ceiling is not GPU qualification',
  )
  draft.payload.size!.height = 32_769
  assert.equal(validatePresetDefinition(draft), null)
  draft.payload.size!.height = 1024
  includePresetSection(draft.payload, 'guidance')
  draft.payload.guidance!.steps = null
  assert.equal(validatePresetDefinition(draft), null)
  draft.payload.guidance!.steps = 30
  draft.payload.seed = { policy: 'fixed', value: null }
  assert.equal(validatePresetDefinition(draft), null)
  draft.payload.seed = { policy: 'fixed', value: 0 }
  assert.notEqual(validatePresetDefinition(draft), null)
})

test('workflow normalization uses the shared write contract without mutating the draft', () => {
  const draft = presetDefinitionFromRecord(recordFixture())
  draft.payload.denoisingStrength = 0.6
  assert.equal(validatePresetDefinition(draft)?.payload.denoisingStrength, 0.6)
  draft.workflow = 'textToImage'
  assert.equal(validatePresetDefinition(draft)?.payload.denoisingStrength, undefined)
  assert.equal(draft.payload.denoisingStrength, 0.6)
  draft.payload = { denoisingStrength: 0.6 }
  assert.equal(
    validatePresetDefinition(draft),
    null,
    'ignored strength is not meaningful inclusion',
  )
})

test('exact selection copies the chosen file rather than mutable resource defaults', () => {
  const resource = catalogFixture()[0]!
  const exact = presetResourceReference(resource, resource.versions[0]!, 'checkpoint')
  assert.equal(exact.localVersionId, 'exact')
  assert.equal(exact.fileSha256, 'a'.repeat(64))
  assert.equal(exact.civitaiVersionId, 200)
  assert.equal(exact.civitaiFileId, 300)
  resource.defaultVersionId = 'exact'
  assert.deepEqual(presetResourceReference(resource, resource.versions[0]!, 'checkpoint'), exact)
  assert.throws(() => presetResourceReference(resource, resource.versions[0]!, 'vae'))
  assert.throws(() =>
    presetResourceReference(resource, { ...resource.versions[0]!, id: 'foreign' }, 'checkpoint'),
  )
  assert.throws(() =>
    presetResourceReference(
      resource,
      { ...resource.versions[0]!, sha256: 'c'.repeat(64) },
      'checkpoint',
    ),
  )
})

test('attention checks exact saved identity without catalog mutation or default fallback', () => {
  const draft = presetDefinitionFromRecord(recordFixture())
  const catalog = catalogFixture()
  const before = JSON.stringify(draft)
  assert.equal(presetNeedsAttention(draft, catalog, false), false)
  assert.equal(presetNeedsAttention(draft, catalog, true), false)
  catalog[0]!.versions = catalog[0]!.versions.filter((version) => version.id === 'newer')
  assert.equal(
    presetNeedsAttention(draft, catalog, true),
    true,
    'a ready default cannot repair missing exact version',
  )
  assert.equal(JSON.stringify(draft), before)
  assert.notEqual(
    validatePresetDefinition(draft),
    null,
    'missing resources may be preserved in a preset',
  )
  for (const change of [
    { sha256: 'c'.repeat(64) },
    { civitaiFileId: 999 },
    { fileStatus: 'corrupt' as const },
    { baseModelFamily: null },
  ]) {
    const altered = catalogFixture()
    Object.assign(altered[0]!.versions[0]!, change)
    assert.equal(presetNeedsAttention(draft, altered, true), true, JSON.stringify(change))
  }
})

test('missing LoRAs, VAE and prompt sidecars are diagnosed even without a model section', () => {
  const resource = catalogFixture()[0]!
  const reference = presetResourceReference(resource, resource.versions[0]!, 'checkpoint')
  const draft = emptyPresetDefinition()
  draft.name = 'Resources'
  draft.payload.loras = [{ enabled: false, resource: { ...reference, kind: 'lora' }, weight: -0.2 }]
  assert.equal(presetNeedsAttention(draft, [], true), true)
  assert.equal(validatePresetDefinition(draft)?.payload.loras?.[0]?.weight, -0.2)
  delete draft.payload.loras
  draft.payload.vae = { ...reference, kind: 'vae', predictionType: null }
  assert.equal(presetNeedsAttention(draft, [], true), true)
  delete draft.payload.vae
  draft.payload.prompt = {
    embeddingRefs: [
      { resource: { ...reference, kind: 'embedding', predictionType: null }, token: '<test>' },
    ],
    text: '<test>',
  }
  assert.equal(presetNeedsAttention(draft, [], true), true)
  assert.equal(validatePresetDefinition(draft)?.payload.prompt?.embeddingRefs.length, 1)
  delete draft.payload.prompt
  draft.payload.vae = null
  assert.equal(
    presetNeedsAttention(draft, [], true),
    false,
    'embedded is explicit and does not require a catalog file',
  )
})
