import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { isProjectGenerationActionState } from './project-generation-actions.js'
import { createEmptyProjectDocumentV1, type IgsProjectDocumentV1 } from './project-schema.js'
import {
  getInvokeRegionalGenerationUnavailableReason,
  hasEnabledRegionalGuidance,
} from './regional-invoke-generation.js'

function document(): IgsProjectDocumentV1 {
  const value = createEmptyProjectDocumentV1({ title: 'Regional public advisory' })
  value.generationDraft.model = {
    baseModelFamily: 'illustrious',
    civitaiFileId: null,
    civitaiModelId: null,
    civitaiVersionId: null,
    displayName: 'Exact model',
    fileSha256: 'a'.repeat(64),
    kind: 'checkpoint',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: 'epsilon',
    versionName: 'Exact version',
  }
  value.generationDraft.vaePrecision = 'FP16'
  value.generationDraft.sampling = {
    cfgScale: 5,
    denoisingStrength: null,
    sampler: 'Euler',
    scheduler: 'Normal',
    steps: 30,
  }
  value.regionalGuidance = [
    {
      enabled: true,
      id: randomUUID(),
      locked: false,
      mask: { asset: null, id: randomUUID(), revision: 0 },
      name: 'Region',
      overlayOpacity: 0,
    },
  ]
  return value
}

function reason(value: IgsProjectDocumentV1, runtimeSupported: boolean | null | undefined = true) {
  return getInvokeRegionalGenerationUnavailableReason({
    document: value,
    iterations: 1,
    runtimeSupported,
  })
}

test('enabled regions require explicit runtime support; absent and disabled owners leave ordinary generation untouched', () => {
  const value = document()
  assert.equal(hasEnabledRegionalGuidance(value), true)
  assert.equal(reason(value), null)
  for (const flag of [false, null, undefined]) {
    const result = getInvokeRegionalGenerationUnavailableReason({
      document: value,
      iterations: 1,
      runtimeSupported: flag,
    })
    assert.match(result!, /image engine support|does not support/)
    assert.match(result!, /Repair or update/)
  }
  value.regionalGuidance![0].enabled = false
  value.generationDraft.model = null
  assert.equal(hasEnabledRegionalGuidance(value), false)
  assert.equal(reason(value, false), null)
  delete value.regionalGuidance
  assert.equal(hasEnabledRegionalGuidance(value), false)
  assert.equal(reason(value, null), null)
})

test('finite regional settings refuse unsupported families, predictions, sampling, VAE, CFG and steps without rewriting the document', () => {
  const cases: [string, (value: IgsProjectDocumentV1) => void, RegExp][] = [
    ['missing model', (v) => (v.generationDraft.model = null), /Illustrious epsilon/],
    ['Anima', (v) => (v.generationDraft.model!.baseModelFamily = 'anima'), /Illustrious epsilon/],
    [
      'unknown family',
      (v) => (v.generationDraft.model!.baseModelFamily = null),
      /Illustrious epsilon/,
    ],
    ['v-prediction', (v) => (v.generationDraft.model!.predictionType = 'v_prediction'), /epsilon/],
    ['Euler a', (v) => (v.generationDraft.sampling.sampler = 'Euler a'), /Euler.*Normal/],
    ['missing scheduler', (v) => (v.generationDraft.sampling.scheduler = null), /Euler.*Normal/],
    ['Auto VAE', (v) => (v.generationDraft.vaePrecision = 'Auto'), /Embedded VAE.*FP16/],
    ['unset VAE precision', (v) => delete v.generationDraft.vaePrecision, /Embedded VAE.*FP16/],
    [
      'external VAE',
      (v) => (v.generationDraft.vae = { ...v.generationDraft.model!, kind: 'vae' }),
      /Embedded VAE/,
    ],
    ['CFG 1', (v) => (v.generationDraft.sampling.cfgScale = 1), /CFG greater than 1/],
    ['CFG 31', (v) => (v.generationDraft.sampling.cfgScale = 31), /CFG greater than 1/],
    ['missing CFG', (v) => (v.generationDraft.sampling.cfgScale = null), /CFG greater than 1/],
    ['CFG Rescale', (v) => (v.generationDraft.cfgRescale = 0.1), /CFG Rescale/],
    ['fractional steps', (v) => (v.generationDraft.sampling.steps = 1.5), /Steps/],
    ['over steps limit', (v) => (v.generationDraft.sampling.steps = 201), /Steps/],
    ['missing steps', (v) => (v.generationDraft.sampling.steps = null), /Steps/],
  ]
  for (const [name, change, expected] of cases) {
    const value = document()
    change(value)
    const before = structuredClone(value)
    assert.match(reason(value)!, expected, name)
    assert.deepEqual(value, before)
  }
  for (const steps of [1, 200]) {
    const value = document()
    value.generationDraft.sampling.steps = steps
    value.generationDraft.cfgRescale = 0
    assert.equal(reason(value), null)
  }
})

test('enabled LoRAs, reference images and active global TI refuse; disabled or dormant data remains inert', () => {
  const value = document()
  const resource = { ...value.generationDraft.model!, kind: 'embedding' as const }
  value.generationDraft.positivePrompt.embeddingRefs = [{ resource, token: 'exact_ti' }]
  value.generationDraft.negativePrompt.embeddingRefs = [{ resource, token: 'negative_ti' }]
  assert.equal(reason(value), null)
  value.generationDraft.positivePrompt.text = 'an exact_ti portrait'
  assert.match(reason(value)!, /active global embedding/)
  value.generationDraft.positivePrompt.text = 'inactive_exact_ti'
  value.generationDraft.negativePrompt.text = 'negative_ti'
  assert.match(reason(value)!, /active global embedding/)
  value.generationDraft.negativePrompt.text = ''
  value.generationDraft.loras = [
    { enabled: true, resource: { ...resource, kind: 'lora' }, weight: 0 },
  ]
  assert.match(reason(value)!, /Disable all LoRAs/)
  value.generationDraft.loras[0].enabled = false
  assert.equal(reason(value), null)
  const region = value.regionalGuidance![0]
  const id = randomUUID()
  region.referenceImages = [
    {
      asset: {
        bytes: 10,
        height: 8,
        path: `assets/regional-references/${id}/${'a'.repeat(64)}.png`,
        sha256: 'a'.repeat(64),
        width: 8,
      },
      id,
      name: 'Reference',
      sourceFormat: 'PNG',
      thumbnail: {
        bytes: 10,
        height: 8,
        path: `assets/regional-references/${id}/${'b'.repeat(64)}.webp`,
        sha256: 'b'.repeat(64),
        width: 8,
      },
    },
  ]
  assert.match(reason(value)!, /reference images from enabled regions/)
  region.enabled = false
  assert.equal(reason(value), null)
})

test('effective regional text respects negative inheritance and admits empty streams, exact regional TI and every overlay opacity/lock state', () => {
  const value = document()
  const region = value.regionalGuidance![0]
  region.prompts = {
    negative: { embeddingRefs: [], text: '{dormant|negative}' },
    positive: { embeddingRefs: [], text: '' },
    useGlobalNegativePrompt: true,
  }
  assert.equal(reason(value), null)
  region.prompts.useGlobalNegativePrompt = false
  assert.match(reason(value)!, /static global and regional prompts/)
  region.prompts.negative!.text = ''
  region.prompts.positive = {
    embeddingRefs: [
      { resource: { ...value.generationDraft.model!, kind: 'embedding' }, token: 'regional_ti' },
    ],
    text: 'regional_ti',
  }
  for (const overlayOpacity of [0, 0.5, 1]) {
    region.overlayOpacity = overlayOpacity
    region.locked = true
    assert.equal(reason(value), null)
  }
  for (const polarity of ['negativePrompt', 'positivePrompt'] as const) {
    value.generationDraft[polarity].text = 'unmatched {'
    assert.match(reason(value)!, /static global and regional prompts/)
    value.generationDraft[polarity].text = ''
  }
  region.prompts.positive.text = 'unmatched }'
  assert.match(reason(value)!, /static global and regional prompts/)
  region.enabled = false
  value.regionalGuidance!.push({
    ...structuredClone(region),
    enabled: true,
    id: randomUUID(),
    prompts: undefined,
  })
  assert.equal(reason(value), null)
})

test('regional count, one-image batching and target dimensions enforce finite bounds', () => {
  const value = document()
  const first = value.regionalGuidance![0]
  value.regionalGuidance = Array.from({ length: 3 }, () => ({
    ...structuredClone(first),
    id: randomUUID(),
  }))
  assert.equal(reason(value), null)
  value.regionalGuidance.push({ ...structuredClone(first), id: randomUUID() })
  assert.match(reason(value)!, /at most 3/)
  value.regionalGuidance[3].enabled = false
  assert.equal(reason(value), null)
  for (const iterations of [0, 2, 1.5, 100]) {
    assert.match(
      getInvokeRegionalGenerationUnavailableReason({
        document: value,
        iterations,
        runtimeSupported: true,
      })!,
      /Images per click set to 1/,
    )
  }
  for (const [width, height] of [
    [8, 8],
    [2048, 8],
    [2000, 2000],
  ]) {
    value.primaryBbox = { height, width, x: 0, y: 0 }
    assert.equal(reason(value), null)
  }
  for (const [width, height] of [
    [7, 8],
    [9, 8],
    [2049, 8],
    [2048, 2048],
    [8.5, 8],
  ]) {
    value.primaryBbox = { height, width, x: 0, y: 0 }
    assert.match(reason(value)!, /dimensions from 8 to 2048/)
  }
})

test('regional capability is an optional strict boolean in preload action responses', () => {
  const state = {
    cfgRescaleSupported: true,
    documentId: randomUUID(),
    embeddingsSupported: true,
    error: null,
    externalVaeSupported: true,
    img2imgSupported: true,
    jobs: [],
    phase: 'idle',
    runningJobId: null,
    vaePrecisionSupported: true,
  }
  assert.equal(isProjectGenerationActionState(state), true)
  for (const regionalSupported of [false, true]) {
    assert.equal(isProjectGenerationActionState({ ...state, regionalSupported }), true)
  }
  for (const regionalSupported of [null, 0, 1, 'true', {}]) {
    assert.equal(isProjectGenerationActionState({ ...state, regionalSupported }), false)
  }
})
