import assert from 'node:assert/strict'
import test from 'node:test'

import type { PresetPayload } from '../presets/preset-schema.js'

import { parsePresetApplicationPayload } from '../presets/preset-application.js'
import {
  initializeProjectGenerationPayload,
  isProjectCreateInput,
  parseProjectCreateInput,
} from './project-create.js'
import { createEmptyProjectDocumentV1 } from './project-schema.js'

const dimensions = { height: 768, title: '  New Project  ', width: 1024 }

test('a selected local workspace survives Create parsing without entering the portable document', () => {
  for (const workspaceId of ['uncategorized', '39e2cf23-2e17-4bce-a4c7-83b2d4b29fb7']) {
    const input = parseProjectCreateInput({ ...dimensions, workspaceId })
    assert.equal(input.workspaceId, workspaceId)
    assert.equal(
      Object.hasOwn(initializeProjectGenerationPayload(document()), 'workspaceId'),
      false,
    )
  }
  for (const workspaceId of ['', '../folder', 'projects', null, 2, 'unknown-workspace']) {
    assert.equal(isProjectCreateInput({ ...dimensions, workspaceId }), false)
  }
})

function document() {
  return createEmptyProjectDocumentV1({
    primaryBbox: { height: 768, width: 1024, x: 0, y: 0 },
    title: 'New Project',
  })
}

test('the shared create parser preserves historical inputs and strict selected-only customization', () => {
  assert.deepEqual(parseProjectCreateInput(dimensions), { ...dimensions, title: 'New Project' })
  const temporary = {
    guidance: { cfgScale: -1, steps: null },
    prompt: { embeddingRefs: [], text: 'selected prompt' },
    size: { height: 768, width: 1024 },
  }
  const generationPayload = parsePresetApplicationPayload(temporary, ['prompt', 'size'])
  const parsed = parseProjectCreateInput({ ...dimensions, generationPayload })
  temporary.prompt.text = 'changed unselected editor copy'
  generationPayload.prompt!.text = 'changed caller copy'
  assert.equal(parsed.generationPayload!.prompt!.text, 'selected prompt')
  assert.equal(Object.hasOwn(parsed.generationPayload!, 'guidance'), false)
  assert.equal(isProjectCreateInput(dimensions), true)
  assert.equal(isProjectCreateInput({ ...dimensions, generationPayload: {} }), true)
})

test('invalid create envelopes, image-only sections and conflicting Size are refused', () => {
  const invalid: unknown[] = [
    null,
    [],
    { ...dimensions, title: '  ' },
    { ...dimensions, width: 0 },
    { ...dimensions, height: 768.5 },
    { ...dimensions, width: Number.POSITIVE_INFINITY },
    { ...dimensions, presetId: 'not portable' },
    { ...dimensions, generationPayload: null },
    { ...dimensions, generationPayload: { denoisingStrength: 0.5 } },
    { ...dimensions, generationPayload: { denoisingStrength: undefined } },
    { ...dimensions, generationPayload: { regionalGuidance: [] } },
    { ...dimensions, generationPayload: { dynamicPrompt: {} } },
    { ...dimensions, generationPayload: { layers: [] } },
    { ...dimensions, generationPayload: { lastActualSeedSnapshot: 0 } },
    { ...dimensions, generationPayload: { guidance: { cfgScale: 0, steps: null } } },
    { ...dimensions, generationPayload: { seed: { policy: 'fixed', value: -1 } } },
    { ...dimensions, generationPayload: { seed: { policy: 'reuse', value: 0 } } },
    { ...dimensions, generationPayload: { size: { height: 832, width: 1024 } } },
  ]
  for (const input of invalid) {
    assert.equal(isProjectCreateInput(input), false)
    assert.throws(() => parseProjectCreateInput(input))
  }
  assert.equal(
    isProjectCreateInput({
      ...dimensions,
      generationPayload: { size: { height: 768, width: 1024 } },
    }),
    true,
  )
})

test('initial projection preserves authored neutral settings and independent native sampling choices', () => {
  for (const sampling of [
    { animaMethod: 'heun' as const },
    { sampler: 'DPM++ 2M', scheduler: 'Karras' },
  ]) {
    const baseline = document()
    const payload: PresetPayload = {
      cfgRescale: 0,
      guidance: { cfgScale: 0, steps: 7 },
      loras: [],
      negativePrompt: { embeddingRefs: [], text: 'negative' },
      prompt: { embeddingRefs: [], text: 'authored positive' },
      sampling,
      size: { height: 768, width: 1024 },
      vae: null,
      vaePrecision: 'Auto',
    }
    const initial = initializeProjectGenerationPayload(baseline, payload)
    assert.equal(initial.generationDraft.positivePrompt.text, 'authored positive')
    assert.equal(initial.generationDraft.negativePrompt.text, 'negative')
    assert.equal(initial.generationDraft.cfgRescale, 0)
    assert.equal(initial.generationDraft.vaePrecision, 'Auto')
    assert.equal(initial.generationDraft.sampling.cfgScale, 0)
    assert.equal(initial.generationDraft.sampling.steps, 7)
    assert.equal(initial.generationDraft.sampling.denoisingStrength, null)
    assert.equal(initial.generationDraft.sampling.animaMethod, sampling.animaMethod)
    assert.equal(initial.generationDraft.sampling.sampler, sampling.sampler ?? null)
    assert.equal(initial.generationDraft.sampling.scheduler, sampling.scheduler ?? null)
    assert.deepEqual(initial.generationDraft.seed, { policy: 'random', value: null })
    assert.deepEqual(initial.primaryBbox, baseline.primaryBbox)
    assert.deepEqual(initial.layers, [])
    assert.equal(initial.lastActualSeedSnapshot, null)
    assert.equal(initial.documentId, baseline.documentId)
    assert.equal(initial.documentRevision, baseline.documentRevision)
    assert.deepEqual(baseline.generationDraft.positivePrompt, { embeddingRefs: [], text: '' })
    payload.prompt!.text = 'later editor change'
    assert.equal(initial.generationDraft.positivePrompt.text, 'authored positive')
  }
})

test('omitted Seed stays random while explicit Fixed zero and Reuse authoring remain distinct', () => {
  for (const [payload, seed] of [
    [{}, { policy: 'random', value: null }],
    [{ seed: { policy: 'fixed', value: 0 } }, { policy: 'fixed', value: 0 }],
    [{ seed: { policy: 'reuse' } }, { policy: 'reuse', value: null }],
  ] as const) {
    const initial = initializeProjectGenerationPayload(document(), payload)
    assert.deepEqual(initial.generationDraft.seed, seed)
    assert.equal(initial.lastActualSeedSnapshot, null)
  }
  const source = document()
  assert.deepEqual(initializeProjectGenerationPayload(source), source)
})
