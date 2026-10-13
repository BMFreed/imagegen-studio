import assert from 'node:assert/strict'
import test from 'node:test'

import type { ModelCatalogItem } from '../api.js'
import type { IgsProjectDocumentV1 } from '../projects/project-schema.js'
import type { PresetPayload } from './preset-schema.js'

import { createEmptyProjectDocumentV1, parseProjectDocumentV1 } from '../projects/project-schema.js'
import {
  applyPresetSections,
  effectivePresetModelFamily,
  includedPresetSections,
  parsePresetApplication,
  parsePresetApplicationPayload,
  presetApplicationDiagnostics,
  type PresetApplicationTarget,
} from './preset-application.js'

const DOCUMENT_ID = '3a563c6e-51fb-46cf-a9c6-bc3b477188cb'
const PRESET_ID = '8e2e8301-49fb-4d81-aa3f-5231c24b5571'
type Resource = NonNullable<IgsProjectDocumentV1['generationDraft']['model']>

function resource<K extends Resource['kind']>(kind: K, suffix = ''): Resource & { kind: K } {
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: 33,
    civitaiModelId: 11,
    civitaiVersionId: 22,
    displayName: `Saved ${kind}${suffix}`,
    fileSha256: 'a'.repeat(64),
    kind,
    localModelId: `${kind}-resource${suffix}`,
    localVersionId: `${kind}-version${suffix}`,
    predictionType: kind === 'checkpoint' ? 'v_prediction' : null,
    versionName: 'Exact version B',
  }
}

function catalogItem(ref: Resource): ModelCatalogItem {
  return {
    author: null,
    defaultVersionId: 'unrelated-default',
    description: null,
    id: ref.localModelId,
    modelId: ref.civitaiModelId,
    name: 'Current renamed label',
    previewDataUrl: null,
    resourceType: ref.kind,
    sourceUrl: null,
    trainedWords: [],
    versions: [
      {
        baseModelFamily: ref.baseModelFamily,
        civitaiFileId: ref.civitaiFileId,
        civitaiVersionId: ref.civitaiVersionId,
        dependencyIssues: [],
        fileName: 'exact.safetensors',
        fileSizeBytes: 1,
        fileStatus: 'ready',
        format: 'safetensors',
        id: ref.localVersionId,
        installedAt: '2026-10-13T10:00:00.000Z',
        name: 'Current renamed version',
        predictionType: ref.predictionType,
        sha256: ref.fileSha256,
        trainedWords: [],
      },
    ],
  }
}

function current(): PresetApplicationTarget {
  const document = createEmptyProjectDocumentV1({
    documentId: DOCUMENT_ID,
    documentRevision: 'bf6f9c4c-5693-4431-a657-b468409b32a9',
    primaryBbox: { height: 832, width: 1024, x: 37, y: -19 },
    title: 'Current Project',
  })
  document.generationDraft.model = resource('checkpoint', '-old')
  document.generationDraft.positivePrompt = { embeddingRefs: [], text: 'Old positive' }
  document.generationDraft.negativePrompt = { embeddingRefs: [], text: 'Old negative' }
  document.generationDraft.loras = [
    { enabled: true, resource: resource('lora', '-old'), weight: -0.5 },
  ]
  document.generationDraft.sampling = {
    animaMethod: 'heun',
    cfgScale: 7,
    denoisingStrength: 0.75,
    sampler: 'Euler',
    scheduler: 'Normal',
    steps: 20,
  }
  document.generationDraft.seed = { policy: 'fixed', value: 5 }
  document.generationDraft.vae = resource('vae', '-old')
  document.generationDraft.vaePrecision = 'FP16'
  document.generationDraft.clipSkip = 3
  return { generationDraft: document.generationDraft, primaryBbox: document.primaryBbox }
}

function envelope(payload: unknown, selectedSections: unknown) {
  return { documentId: DOCUMENT_ID, payload, selectedSections, sourcePresetId: PRESET_ID }
}

test('Apply parses only selected own fields and rejects invalid identity/selection envelopes', () => {
  const prompt = { embeddingRefs: [], text: 'Only this prompt' }
  const request = parsePresetApplication(
    envelope(
      {
        guidance: { cfgScale: null, steps: 'unfinished' },
        masks: ['outside the command'],
        model: null,
        prompt,
      },
      ['prompt'],
    ),
  )
  assert.deepEqual(request, {
    documentId: DOCUMENT_ID,
    payload: { prompt },
    selectedSections: ['prompt'],
    sourcePresetId: PRESET_ID,
  })
  const bad = [
    { ...envelope({ prompt }, ['prompt']), documentId: 'not-a-document' },
    { ...envelope({ prompt }, ['prompt']), sourcePresetId: 'not-a-preset' },
    { ...envelope({ prompt }, ['prompt']), applyAll: true },
    envelope({ prompt }, []),
    envelope({ prompt }, ['prompt', 'prompt']),
    envelope({ prompt }, ['masks']),
    envelope({ prompt }, ['size']),
    envelope({ prompt: undefined }, ['prompt']),
    envelope({ prompt: { ...prompt, text: 123 } }, ['prompt']),
    envelope({ cfgRescale: null }, ['cfgRescale']),
  ]
  for (const input of bad) {
    assert.throws(() => parsePresetApplication(input))
  }
  assert.throws(() => parsePresetApplicationPayload(Object.create({ prompt }), ['prompt']))
})

test('prompt-only Apply preserves every unselected field and does not add optional zero defaults', () => {
  const target = current()
  const payload: PresetPayload = {
    cfgRescale: 0,
    guidance: { cfgScale: 0, steps: 30 },
    model: resource('checkpoint', '-new'),
    prompt: { embeddingRefs: [], text: 'New positive' },
    seed: { policy: 'fixed', value: 0 },
    size: { height: 512, width: 768 },
    vae: null,
  }
  const before = structuredClone({ payload, target })
  const output = applyPresetSections(target, payload, ['prompt'])
  assert.deepEqual(output, {
    generationDraft: { ...target.generationDraft, positivePrompt: payload.prompt },
    primaryBbox: target.primaryBbox,
  })
  assert.equal(Object.hasOwn(output.generationDraft, 'cfgRescale'), false)
  assert.deepEqual({ payload, target }, before)
  output.generationDraft.positivePrompt.text = 'Output is independently editable'
  output.generationDraft.loras[0].weight = 1
  assert.deepEqual({ payload, target }, before)
})

test('a full document can be passed structurally without copying its identity, layers or operational seed snapshot', () => {
  const document = createEmptyProjectDocumentV1({
    documentId: DOCUMENT_ID,
    title: 'Untouched identity',
  })
  document.lastActualSeedSnapshot = 0
  const before = structuredClone(document)
  const output = applyPresetSections(document, { prompt: { embeddingRefs: [], text: 'Applied' } }, [
    'prompt',
  ])
  assert.deepEqual(Object.keys(output).sort(), ['generationDraft', 'primaryBbox'])
  assert.deepEqual(document, before)
  assert.equal(document.lastActualSeedSnapshot, 0)
  assert.equal(Object.hasOwn(output, 'documentId'), false)
})

test('Negative Prompt sidecars, signed disabled LoRAs and zero strength are copied without affecting their neighbors', () => {
  const target = current()
  const payload: PresetPayload = {
    denoisingStrength: 0,
    loras: [{ enabled: false, resource: resource('lora'), weight: -0.7 }],
    negativePrompt: {
      embeddingRefs: [{ resource: resource('embedding'), token: '<saved-custom-alias>' }],
      text: '<saved-custom-alias>, blur',
    },
    vaePrecision: 'FP32',
  }
  const output = applyPresetSections(target, payload, [
    'negativePrompt',
    'loras',
    'denoisingStrength',
    'vaePrecision',
  ])
  assert.deepEqual(output.generationDraft.negativePrompt, payload.negativePrompt)
  assert.deepEqual(output.generationDraft.loras, payload.loras)
  assert.equal(output.generationDraft.sampling.denoisingStrength, 0)
  assert.equal(output.generationDraft.vaePrecision, 'FP32')
  assert.deepEqual(output.generationDraft.positivePrompt, target.generationDraft.positivePrompt)
  assert.deepEqual(output.generationDraft.model, target.generationDraft.model)
  assert.deepEqual(output.generationDraft.seed, target.generationDraft.seed)
})

test('explicit empty LoRAs, Embedded VAE, zero rescale/seed/guidance and Size differ from omission', () => {
  const target = current()
  const payload: PresetPayload = {
    cfgRescale: 0,
    guidance: { cfgScale: 0, steps: 30 },
    loras: [],
    seed: { policy: 'fixed', value: 0 },
    size: { height: 512, width: 768 },
    vae: null,
  }
  assert.deepEqual(includedPresetSections(payload), [
    'loras',
    'size',
    'guidance',
    'cfgRescale',
    'seed',
    'vae',
  ])
  const output = applyPresetSections(target, payload, includedPresetSections(payload))
  assert.deepEqual(output.generationDraft.loras, [])
  assert.equal(output.generationDraft.vae, null)
  assert.equal(output.generationDraft.cfgRescale, 0)
  assert.equal(output.generationDraft.sampling.cfgScale, 0)
  assert.deepEqual(output.generationDraft.seed, { policy: 'fixed', value: 0 })
  assert.deepEqual(output.primaryBbox, { height: 512, width: 768, x: 37, y: -19 })
  assert.equal(output.generationDraft.clipSkip, 3)
})

test('sampling copies only present members and never substitutes an Anima method or scheduler default', () => {
  const target = current()
  const native = applyPresetSections(target, { sampling: { animaMethod: 'lcm' } }, ['sampling'])
  assert.deepEqual(native.generationDraft.sampling, {
    ...target.generationDraft.sampling,
    animaMethod: 'lcm',
  })
  const pair = applyPresetSections(target, { sampling: { sampler: 'DPM++ 2M' } }, ['sampling'])
  assert.deepEqual(pair.generationDraft.sampling, {
    ...target.generationDraft.sampling,
    sampler: 'DPM++ 2M',
  })
  const older = current()
  delete older.generationDraft.sampling.animaMethod
  const noNative = applyPresetSections(older, { sampling: { scheduler: 'Karras' } }, ['sampling'])
  assert.equal(Object.hasOwn(noNative.generationDraft.sampling, 'animaMethod'), false)
  for (const policy of ['random', 'reuse'] as const) {
    assert.deepEqual(
      applyPresetSections(target, { seed: { policy } }, ['seed']).generationDraft.seed,
      { policy, value: null },
    )
  }
})

test('Model copies advisory identity without introducing project noise policy or mutating the source/library', () => {
  const target = current()
  const model: NonNullable<PresetPayload['model']> = {
    ...resource('checkpoint', '-new'),
    noiseProfile: {
      baseSchedule: 'sdxl-scaled-linear-v1',
      rescaleBetasZeroSnr: true,
      schemaVersion: 1,
      timestepSpacing: 'trailing',
    },
  }
  const catalog = [catalogItem(model)]
  catalog[0].versions[0].predictionType = 'epsilon'
  catalog[0].versions[0].noiseProfile = {
    effective: {
      baseSchedule: 'sdxl-scaled-linear-v1',
      rescaleBetasZeroSnr: false,
      schemaVersion: 1,
      timestepSpacing: 'leading',
    },
    rescaleBetasZeroSnrSource: 'assumed',
    timestepSpacingSource: 'assumed',
  }
  const before = structuredClone({ catalog, model, target })
  const warnings = presetApplicationDiagnostics({
    catalog,
    current: target,
    payload: { model },
    selectedSections: ['model'],
  })
  assert.equal(warnings.length, 2)
  assert.ok(warnings.every((item) => item.code === 'POLICY_ADVISORY_MISMATCH' && !item.blocking))
  assert.match(warnings[0].message, /prediction type.*Model Manager/)
  assert.match(warnings[1].message, /ZTSNR and timestep spacing/)
  assert.deepEqual(
    presetApplicationDiagnostics({
      catalog,
      current: target,
      payload: { model, prompt: { embeddingRefs: [], text: 'Only prompt' } },
      selectedSections: ['prompt'],
    }),
    [],
  )
  const equal = structuredClone(model)
  equal.predictionType = 'epsilon'
  equal.noiseProfile = structuredClone(catalog[0].versions[0].noiseProfile.effective)
  assert.deepEqual(
    presetApplicationDiagnostics({
      catalog,
      current: target,
      payload: { model: equal },
      selectedSections: ['model'],
    }),
    [],
  )
  const output = applyPresetSections(target, { model }, ['model'])
  assert.equal(output.generationDraft.model?.predictionType, 'v_prediction')
  assert.equal(Object.hasOwn(output.generationDraft.model, 'noiseProfile'), false)
  const document = createEmptyProjectDocumentV1({ documentId: DOCUMENT_ID, title: 'Projected' })
  Object.assign(document, output)
  assert.doesNotThrow(() => parseProjectDocumentV1(document))
  assert.deepEqual({ catalog, model, target }, before)
})

test('only selected nested resource sections block Apply; unknown catalogs allow plain text and explicit clears', () => {
  const target = current()
  const embedding = resource('embedding')
  const payload: PresetPayload = {
    loras: [{ enabled: false, resource: resource('lora'), weight: 0 }],
    model: resource('checkpoint'),
    negativePrompt: { embeddingRefs: [], text: 'plain text' },
    prompt: {
      embeddingRefs: [{ resource: embedding, token: '<copied-alias>' }],
      text: '<copied-alias>, portrait',
    },
    vae: resource('vae'),
  }
  assert.deepEqual(
    presetApplicationDiagnostics({
      catalog: [],
      current: target,
      payload,
      selectedSections: ['negativePrompt'],
    }),
    [],
  )
  const missing = presetApplicationDiagnostics({
    catalog: [],
    current: target,
    payload,
    selectedSections: ['prompt'],
  })
  assert.equal(missing.length, 1)
  assert.equal(missing[0].section, 'prompt')
  assert.equal(missing[0].code, 'RESOURCE_MISSING')
  assert.equal(missing[0].resource?.localVersionId, embedding.localVersionId)
  assert.equal(missing[0].blocking, true)
  assert.equal(
    presetApplicationDiagnostics({
      catalog: [],
      current: target,
      payload,
      selectedSections: ['loras'],
    })[0].blocking,
    true,
  )
  assert.equal(
    presetApplicationDiagnostics({
      catalog: null,
      current: target,
      payload,
      selectedSections: ['model'],
    })[0].code,
    'CATALOG_UNAVAILABLE',
  )
  assert.deepEqual(
    presetApplicationDiagnostics({
      catalog: null,
      current: target,
      payload: { loras: [], prompt: { embeddingRefs: [], text: 'literal' }, vae: null },
      selectedSections: ['loras', 'vae', 'prompt'],
    }),
    [],
  )
})

test('exact file availability refuses default fallback, changed registry identity/hash/family, corruption and dependencies', () => {
  const target = current()
  const model = resource('checkpoint')
  const ready = catalogItem(model)
  const inspect = (catalog: ModelCatalogItem[]) =>
    presetApplicationDiagnostics({
      catalog,
      current: target,
      payload: { model },
      selectedSections: ['model'],
    })
  assert.deepEqual(inspect([ready]), [])
  const variants: { code: string; mutate: (item: ModelCatalogItem) => void }[] = [
    {
      code: 'RESOURCE_MISSING',
      mutate: (item) => {
        item.versions[0].id = item.defaultVersionId!
      },
    },
    {
      code: 'RESOURCE_MISSING',
      mutate: (item) => {
        item.modelId = 999
      },
    },
    {
      code: 'RESOURCE_MISSING',
      mutate: (item) => {
        item.versions[0].civitaiFileId = 999
      },
    },
    {
      code: 'RESOURCE_MISSING',
      mutate: (item) => {
        item.versions[0].civitaiVersionId = 999
      },
    },
    {
      code: 'RESOURCE_MISSING',
      mutate: (item) => {
        item.versions[0].sha256 = 'b'.repeat(64)
      },
    },
    {
      code: 'RESOURCE_MISSING',
      mutate: (item) => {
        item.versions[0].baseModelFamily = 'anima'
      },
    },
    {
      code: 'RESOURCE_MISSING',
      mutate: (item) => {
        item.versions[0].fileStatus = 'missing'
      },
    },
    {
      code: 'RESOURCE_CORRUPT',
      mutate: (item) => {
        item.versions[0].fileStatus = 'corrupt'
      },
    },
    {
      code: 'RESOURCE_MISSING',
      mutate: (item) => {
        item.versions[0].dependencyIssues = ['Required companion missing']
      },
    },
  ]
  for (const { code, mutate } of variants) {
    const changed = structuredClone(ready)
    mutate(changed)
    assert.equal(inspect([changed])[0].code, code)
  }
})

test('selected resources use the effective selected model family, without checking unselected current settings', () => {
  const target = current()
  const anima = {
    ...resource('checkpoint', '-anima'),
    baseModelFamily: 'anima' as const,
    predictionType: null,
  }
  const lora = resource('lora')
  const payload: PresetPayload = {
    loras: [{ enabled: true, resource: lora, weight: 0.7 }],
    model: anima,
  }
  const catalog = [catalogItem(anima), catalogItem(lora)]
  assert.equal(effectivePresetModelFamily(target, payload, ['loras']), 'illustrious')
  assert.deepEqual(
    presetApplicationDiagnostics({
      catalog,
      current: target,
      payload,
      selectedSections: ['loras'],
    }),
    [],
  )
  assert.equal(effectivePresetModelFamily(target, payload, ['model', 'loras']), 'anima')
  assert.equal(
    presetApplicationDiagnostics({
      catalog,
      current: target,
      payload,
      selectedSections: ['model', 'loras'],
    })[0].code,
    'RESOURCE_FAMILY_MISMATCH',
  )
  assert.deepEqual(
    presetApplicationDiagnostics({
      catalog,
      current: target,
      payload,
      selectedSections: ['model'],
    }),
    [],
  )
  const unknown = { ...resource('lora'), baseModelFamily: null }
  assert.equal(
    presetApplicationDiagnostics({
      catalog: [catalogItem(unknown)],
      current: target,
      payload: { loras: [{ enabled: true, resource: unknown, weight: 1 }] },
      selectedSections: ['loras'],
    })[0].code,
    'RESOURCE_FAMILY_UNKNOWN',
  )
})

test('Anima diagnoses only selected unsupported values, permits neutral values and explains dormant sampling', () => {
  const target = current()
  target.generationDraft.model = {
    ...resource('checkpoint'),
    baseModelFamily: 'anima',
    predictionType: null,
  }
  const embedding = resource('embedding')
  const vae = resource('vae')
  const payload: PresetPayload = {
    cfgRescale: 0.7,
    negativePrompt: { embeddingRefs: [], text: 'literal' },
    prompt: { embeddingRefs: [{ resource: embedding, token: '<embedding>' }], text: '<embedding>' },
    sampling: { sampler: 'Euler', scheduler: 'Normal' },
    vae,
    vaePrecision: 'FP32',
  }
  const catalog = [catalogItem(embedding), catalogItem(vae)]
  const diagnostics = presetApplicationDiagnostics({
    catalog,
    current: target,
    payload,
    selectedSections: ['cfgRescale', 'vaePrecision', 'vae', 'prompt'],
  })
  for (const section of ['cfgRescale', 'vaePrecision', 'vae', 'prompt']) {
    assert.ok(
      diagnostics.some(
        (item) => item.section === section && item.code === 'SETTING_UNSUPPORTED' && item.blocking,
      ),
    )
  }
  assert.deepEqual(
    presetApplicationDiagnostics({
      catalog,
      current: target,
      payload,
      selectedSections: ['negativePrompt'],
    }),
    [],
  )
  assert.deepEqual(
    presetApplicationDiagnostics({
      catalog,
      current: target,
      payload: { cfgRescale: 0, vae: null, vaePrecision: 'Auto' },
      selectedSections: ['cfgRescale', 'vaePrecision', 'vae'],
    }),
    [],
  )
  const inactive = presetApplicationDiagnostics({
    catalog,
    current: target,
    payload,
    selectedSections: ['sampling'],
  })
  assert.equal(inactive[0].code, 'SETTING_INACTIVE')
  assert.equal(inactive[0].blocking, false)
  assert.equal(
    applyPresetSections(target, payload, ['sampling']).generationDraft.sampling.animaMethod,
    'heun',
  )
})

test('duplicate LoRA resources and ambiguous nested embedding aliases are explicit diagnostics', () => {
  const target = current()
  const lora = resource('lora')
  const first = resource('embedding', '-first')
  const second = { ...resource('embedding', '-second'), fileSha256: 'b'.repeat(64) }
  const payload: PresetPayload = {
    loras: [
      { enabled: true, resource: lora, weight: 1 },
      { enabled: false, resource: lora, weight: -1 },
    ],
    prompt: {
      embeddingRefs: [
        { resource: first, token: '<alias>' },
        { resource: second, token: '<alias>' },
      ],
      text: '<alias>',
    },
  }
  const input = {
    catalog: [catalogItem(lora), catalogItem(first), catalogItem(second)],
    current: target,
    payload,
    selectedSections: ['loras', 'prompt'] as const,
  }
  const before = structuredClone(input)
  const diagnostics = presetApplicationDiagnostics(input)
  assert.equal(diagnostics.filter((item) => item.code === 'RESOURCE_DUPLICATE').length, 1)
  assert.equal(diagnostics.filter((item) => item.code === 'EMBEDDING_AMBIGUOUS').length, 1)
  assert.deepEqual(input, before)
  diagnostics[0].resource!.displayName = 'Independent diagnostic copy'
  assert.deepEqual(input, before)
})
