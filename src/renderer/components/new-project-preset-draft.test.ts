import type { PresetRecord } from '../../shared/presets/preset-schema.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive } from 'vue'

import {
  emptyNewProjectPresetState,
  newProjectCreateRequest,
  newProjectPresetSections,
  resetNewProjectPreset,
  resetNewProjectPresetSection,
  selectNewProjectPreset,
  setNewProjectPresetSection,
} from './new-project-preset-draft.js'

function fixture(): PresetRecord {
  const base = {
    baseModelFamily: 'illustrious' as const,
    civitaiFileId: 3,
    civitaiModelId: 1,
    civitaiVersionId: 2,
    displayName: 'Unavailable exact file',
    fileSha256: 'a'.repeat(64),
    localModelId: 'unavailable-model',
    localVersionId: 'unavailable-version',
    predictionType: null,
    versionName: 'Saved version',
  }
  return {
    deletedAt: null,
    description: 'Source description',
    expiresAt: null,
    favorite: false,
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Portrait source',
    payload: {
      cfgRescale: 0,
      guidance: { cfgScale: 5, steps: 28 },
      loras: [{ enabled: false, resource: { ...base, kind: 'lora' }, weight: -0.4 }],
      model: {
        ...base,
        kind: 'checkpoint',
        noiseProfile: {
          baseSchedule: 'sdxl-scaled-linear-v1',
          rescaleBetasZeroSnr: true,
          schemaVersion: 1,
          timestepSpacing: 'trailing',
        },
        predictionType: 'v_prediction',
      },
      negativePrompt: { embeddingRefs: [], text: '' },
      prompt: {
        embeddingRefs: [{ resource: { ...base, kind: 'embedding' }, token: '<portrait>' }],
        text: '{portrait|landscape} <portrait>',
      },
      sampling: { sampler: 'Euler', scheduler: 'Normal' },
      seed: { policy: 'fixed', value: 0 },
      size: { height: 896, width: 1536 },
      vae: null,
      vaePrecision: 'Auto',
    },
    tags: ['portrait'],
    updatedAt: '2026-10-14T00:00:00.000Z',
    workflow: 'textToImage',
  }
}

// Subject: production picker/reset/create-request adapter plus the real shared create parser.
// These fixtures stand in for read-only preset records, not the controller or validation.
test('the ordinary no-preset path preserves old positive geometry and required name', () => {
  const state = emptyNewProjectPresetState()
  assert.throws(() => newProjectCreateRequest(state, '  '))
  assert.deepEqual(newProjectCreateRequest(state, '  Untitled  '), {
    height: 1024,
    title: 'Untitled',
    width: 1024,
  })
  state.resolution = { height: 32_768, width: 1 }
  assert.deepEqual(newProjectCreateRequest(state, 'Small area'), {
    height: 32_768,
    title: 'Small area',
    width: 1,
  })
  state.resolution.width = null
  assert.throws(() => newProjectCreateRequest(state, 'Invalid'))
  state.resolution.width = 32_769
  assert.throws(() => newProjectCreateRequest(state, 'Invalid'))
  assert.throws(
    () => newProjectCreateRequest(emptyNewProjectPresetState(), 'Valid', false),
    'raw invalidity must not save an older number',
  )
})

test('only active Text to Image sources can initialize detached New Project state', () => {
  for (const workflow of ['imageToImage', 'smartPatch'] as const) {
    assert.throws(() => selectNewProjectPreset({ ...fixture(), workflow }))
  }
  assert.throws(() =>
    selectNewProjectPreset({
      ...fixture(),
      deletedAt: '2026-10-14T00:00:00.000Z',
      expiresAt: '2026-11-13T00:00:00.000Z',
    }),
  )
  const state = selectNewProjectPreset(fixture())
  assert.ok(state.customization)
  assert.equal(state.customization.selectedSections.includes('size'), true)
  assert.equal(state.customization.selectedSections.includes('seed'), false)
  assert.deepEqual(
    state.customization.selectedSections,
    newProjectPresetSections(state).filter((section) => section !== 'seed'),
  )
  assert.deepEqual(
    state.customization.payload.seed,
    { policy: 'fixed', value: 0 },
    'unchecked values remain available for explicit Use',
  )
})

test('the source snapshot resists later catalog/record edits and Vue proxies', () => {
  const record = reactive(fixture())
  const original = JSON.parse(JSON.stringify(record))
  const state = selectNewProjectPreset(record)
  record.name = 'Renamed elsewhere'
  record.payload.prompt!.text = 'Changed elsewhere'
  record.payload.model!.noiseProfile!.rescaleBetasZeroSnr = false
  record.payload.size!.width = 768
  assert.deepEqual(state.customization!.source, original)
  state.customization!.payload.prompt!.text = 'Customized only'
  state.customization!.payload.model!.noiseProfile!.timestepSpacing = 'linspace'
  assert.equal(state.customization!.initialPayload.prompt!.text, original.payload.prompt.text)
  assert.equal(state.customization!.source.payload.model!.noiseProfile!.timestepSpacing, 'trailing')
  assert.equal(record.payload.prompt!.text, 'Changed elsewhere')
})

test('missing source Size gets a detached 1024 fallback without editing the preset', () => {
  const record = fixture()
  delete record.payload.size
  const before = structuredClone(record)
  const state = selectNewProjectPreset(record)
  assert.deepEqual(state.customization!.payload.size, { height: 1024, width: 1024 })
  assert.deepEqual(newProjectCreateRequest(state, 'Default size').generationPayload?.size, {
    height: 1024,
    width: 1024,
  })
  assert.deepEqual(record, before)
  state.customization!.payload.size.width = 2048
  resetNewProjectPresetSection(state, 'size')
  assert.deepEqual(state.customization!.payload.size, { height: 1024, width: 1024 })
})

test('section and global resets preserve Use mask and clear only their editing revision', () => {
  const state = selectNewProjectPreset(fixture())
  const custom = state.customization!
  setNewProjectPresetSection(state, 'model', false)
  setNewProjectPresetSection(state, 'seed', true)
  const selection = [...custom.selectedSections]
  custom.payload.prompt!.text = 'Custom'
  custom.payload.guidance!.steps = null
  resetNewProjectPresetSection(state, 'prompt')
  assert.deepEqual(custom.selectedSections, selection)
  assert.equal(custom.payload.prompt!.text, fixture().payload.prompt!.text)
  assert.equal(custom.payload.guidance!.steps, null)
  assert.equal(custom.sectionRevisions.prompt, 1)
  assert.equal(custom.sectionRevisions.guidance, undefined)
  resetNewProjectPreset(state)
  assert.deepEqual(custom.selectedSections, selection)
  assert.deepEqual(custom.payload, custom.initialPayload)
  assert.equal(custom.sectionRevisions.prompt, 2)
  assert.equal(custom.sectionRevisions.guidance, 1)
  setNewProjectPresetSection(state, 'size', false)
  assert.equal(
    custom.selectedSections.includes('size'),
    true,
    'initial generation area has no Use switch',
  )
})

test('selected-only creation preserves missing refs and ignores invalid deselected fields', () => {
  const state = selectNewProjectPreset(fixture())
  const custom = state.customization!
  custom.payload.model = null
  custom.payload.guidance!.steps = null
  custom.payload.seed = { policy: 'fixed', value: null }
  assert.throws(() => newProjectCreateRequest(state, 'Invalid selected fields'))
  setNewProjectPresetSection(state, 'model', false)
  setNewProjectPresetSection(state, 'guidance', false)
  const request = newProjectCreateRequest(state, 'Missing resources allowed')
  assert.equal(Object.hasOwn(request.generationPayload!, 'model'), false)
  assert.equal(Object.hasOwn(request.generationPayload!, 'guidance'), false)
  assert.equal(Object.hasOwn(request.generationPayload!, 'seed'), false)
  assert.deepEqual(request.generationPayload?.loras, fixture().payload.loras)
  assert.deepEqual(request.generationPayload?.prompt, fixture().payload.prompt)
  setNewProjectPresetSection(state, 'guidance', true)
  assert.throws(() => newProjectCreateRequest(state, 'Still invalid'))
})

test('the create request copies only canonical generation values with matching initial area', () => {
  const record = fixture()
  const before = structuredClone(record)
  const state = selectNewProjectPreset(record)
  const request = newProjectCreateRequest(state, 'New portrait')
  assert.equal(request.width, 1536)
  assert.equal(request.height, 896)
  assert.deepEqual(request.generationPayload?.size, {
    height: request.height,
    width: request.width,
  })
  assert.equal(request.generationPayload?.model?.localVersionId, 'unavailable-version')
  assert.equal(request.generationPayload?.model?.predictionType, 'v_prediction')
  assert.deepEqual(
    request.generationPayload?.model?.noiseProfile,
    record.payload.model!.noiseProfile,
  )
  assert.equal(request.generationPayload?.loras?.[0]?.weight, -0.4)
  assert.equal(request.generationPayload?.loras?.[0]?.enabled, false)
  assert.equal(request.generationPayload?.vae, null)
  assert.equal(Object.hasOwn(request.generationPayload, 'seed'), false)
  assert.deepEqual(Object.keys(request).sort(), ['generationPayload', 'height', 'title', 'width'])
  assert.deepEqual(record, before, 'request production cannot update source metadata or payload')
  request.generationPayload.prompt!.text = 'Changed outbound copy'
  assert.equal(state.customization!.payload.prompt!.text, before.payload.prompt!.text)
})

test('No preset removes the temporary generation payload and restores the default area', () => {
  const custom = selectNewProjectPreset(fixture())
  custom.customization!.payload.size!.width = 2048
  setNewProjectPresetSection(custom, 'seed', true)
  const noPreset = selectNewProjectPreset(null)
  assert.deepEqual(noPreset, emptyNewProjectPresetState())
  assert.deepEqual(newProjectCreateRequest(noPreset, 'Keep my title'), {
    height: 1024,
    title: 'Keep my title',
    width: 1024,
  })
  assert.equal(newProjectPresetSections(noPreset).length, 0)
  assert.notEqual(custom.customization!.payload.size!.width, noPreset.resolution.width)
})

test('explicit Seed Use preserves zero and mandatory preset Size rejects unsafe edits', () => {
  const state = selectNewProjectPreset(fixture())
  setNewProjectPresetSection(state, 'seed', true)
  assert.deepEqual(newProjectCreateRequest(state, 'Fixed zero').generationPayload?.seed, {
    policy: 'fixed',
    value: 0,
  })
  state.customization!.payload.size!.width = 1
  assert.throws(() => newProjectCreateRequest(state, 'Preset size below portable authoring floor'))
  state.customization!.payload.size!.width = 1024
  state.customization!.selectedSections = state.customization!.selectedSections.filter(
    (section) => section !== 'size',
  )
  assert.throws(() => newProjectCreateRequest(state, 'Unselected generation area'))
})
