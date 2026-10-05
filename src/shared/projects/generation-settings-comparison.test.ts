import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ModelCatalogItem } from '../api.js'
import type { IgsIllustriousRasterGenerationProvenanceV1 } from './project-schema.js'

import {
  compareRasterGenerationSettings,
  type GenerationSettingsComparisonCurrent,
  type GenerationSettingsComparisonRow,
  isRasterGenerationData,
  type RasterGenerationData,
} from './generation-settings-comparison.js'
import {
  createEmptyProjectDocumentV1,
  isRasterGenerationConfigurationV1,
} from './project-schema.js'

const DOCUMENT_ID = 'f1099bf4-05ea-44d8-b5de-6884ece7ba45'
const REVISION_ID = '6ea21a66-41e5-43ee-80e2-e9837b7c0eb8'
const LAYER_ID = 'b8468727-804a-4522-a3e7-c5145967e43f'
const MODEL_ID = '57424ef4-e87e-4413-9c38-17ec576265f2'
const VERSION_ID = 'd89496a9-c30f-42c9-bfcb-1d82c68963c1'
const OTHER_MODEL_ID = '66bc54d0-a3b3-43bd-aab5-7c6809163915'
const OTHER_VERSION_ID = '8286b94f-2f98-4225-8cd6-5f5b6b0d4481'

test('VAE distinguishes known Embedded, legacy omission and frozen external identity without changing either input', () => {
  const source = fixture()
  assert.equal(result(source, 'vae.resource').status, 'Unavailable')
  assert.equal(result(source, 'vae.resource').after, 'Embedded')
  source.data.generationConfiguration.vae = null
  assert.ok(isRasterGenerationData(source.data))
  assert.deepEqual(result(source, 'vae.resource'), {
    after: 'Embedded',
    before: 'Embedded',
    key: 'vae.resource',
    label: 'VAE',
    status: 'Same',
  })
  const vae = {
    ...source.data.generationConfiguration.model,
    civitaiFileId: 103,
    civitaiModelId: 101,
    civitaiVersionId: 102,
    displayName: 'Exact external VAE',
    fileSha256: 'b'.repeat(64),
    kind: 'vae' as const,
    localModelId: OTHER_MODEL_ID,
    localVersionId: OTHER_VERSION_ID,
    predictionType: null,
  }
  source.current.modelCatalog!.push(catalogItem(vae))
  source.current.generationDraft.vae = structuredClone(vae)
  assert.equal(result(source, 'vae.resource').status, 'Added')
  source.data.generationConfiguration.vae = structuredClone(vae)
  assert.ok(isRasterGenerationData(source.data))
  source.current.generationDraft.vae.displayName = 'Renamed current VAE'
  const before = structuredClone(source)
  assert.equal(result(source, 'vae.resource').status, 'Same')
  assert.match(result(source, 'vae.resource').before, /Exact external VAE.*v1/)
  assert.match(result(source, 'vae.resource').before, /SHA-256 b{64}/)
  assert.deepEqual(source, before, 'comparison must not change either frozen or current values')
  source.current.generationDraft.vae = null
  assert.equal(result(source, 'vae.resource').status, 'Removed')
  assert.equal(result(source, 'vae.resource').after, 'Embedded')
  delete source.data.generationConfiguration.vae
  assert.equal(result(source, 'vae.resource').status, 'Unavailable')
})

test('external VAE comparison refuses equal status for missing, unknown, mismatched or unlinked bindings', () => {
  const source = fixture()
  const vae = {
    ...source.data.generationConfiguration.model,
    kind: 'vae' as const,
    localModelId: OTHER_MODEL_ID,
    localVersionId: OTHER_VERSION_ID,
    predictionType: null,
  }
  source.data.generationConfiguration.vae = structuredClone(vae)
  source.current.generationDraft.vae = structuredClone(vae)
  assert.equal(result(source, 'vae.resource').status, 'Missing resource')
  source.current.modelCatalog!.push(catalogItem(vae))
  assert.equal(result(source, 'vae.resource').status, 'Same')
  const known = structuredClone(source)
  for (const change of [
    { fileStatus: 'missing' as const },
    { fileStatus: 'corrupt' as const },
    { sha256: 'c'.repeat(64) },
    { civitaiFileId: 999 },
    { civitaiVersionId: 999 },
    { baseModelFamily: 'anima' as const },
  ]) {
    const changed = structuredClone(known)
    Object.assign(changed.current.modelCatalog![1].versions[0], change)
    assert.equal(result(changed, 'vae.resource').status, 'Missing resource', JSON.stringify(change))
  }
  source.current.modelCatalog = null
  assert.equal(result(source, 'vae.resource').status, 'Unavailable')
  source.current.modelCatalog = known.current.modelCatalog
  source.current.modelCatalogError = 'Library read failed'
  assert.equal(result(source, 'vae.resource').status, 'Unavailable')
  source.current.modelCatalogError = null
  source.current.generationDraft.vae.localVersionId = VERSION_ID
  assert.equal(
    result(source, 'vae.resource').status,
    'Missing resource',
    'portable match is not a linked local version',
  )
  for (const family of ['anima', null] as const) {
    source.current.generationDraft.model!.baseModelFamily = family
    assert.equal(result(source, 'vae.resource').status, 'Unavailable')
    assert.match(result(source, 'vae.resource').after, /Unavailable for the current model/)
  }
})

test('portable applied VAE accepts both normal modes but rejects wrong kind, family, prediction and paths', () => {
  const source = fixture()
  const vae = {
    ...source.data.generationConfiguration.model,
    kind: 'vae' as const,
    predictionType: null,
  }
  source.data.generationConfiguration.vae = vae
  assert.ok(isRasterGenerationData(source.data))
  for (const change of [
    { kind: 'checkpoint' },
    { baseModelFamily: 'anima' },
    { baseModelFamily: null },
    { predictionType: 'epsilon' },
    { managedPath: '/private/vae.safetensors' },
    { byteSize: 100 },
    { fileSha256: 'invalid' },
    { localVersionId: 'foreign' },
  ]) {
    const invalid = structuredClone(source.data)
    Object.assign(invalid.generationConfiguration.vae!, change)
    assert.equal(isRasterGenerationData(invalid), false, JSON.stringify(change))
  }
  const configuration = source.data.generationConfiguration
  source.data.generationConfiguration = {
    ...configuration,
    mode: 'img2img',
    sampling: { ...configuration.sampling, denoisingStrength: 0 },
  }
  assert.ok(isRasterGenerationData(source.data))
  source.data.generationConfiguration.vae = null
  assert.ok(isRasterGenerationData(source.data))
})

test('VAE Precision compares frozen applied values with family-scoped current Auto without inventing legacy values', () => {
  const source = fixture()
  const legacy = structuredClone(source)
  assert.equal(result(source, 'vaePrecision.value').status, 'Unavailable')
  assert.match(result(source, 'vaePrecision.value').before, /Unavailable in saved generation data/)
  assert.equal(result(source, 'vaePrecision.value').after, 'Auto')
  assert.deepEqual(source, legacy, 'projecting the default never writes either input')
  source.data.generationConfiguration.vaePrecision = 'Auto'
  assert.ok(isRasterGenerationData(source.data))
  assert.equal('vaePrecision' in source.current.generationDraft, false)
  assert.equal(result(source, 'vaePrecision.value').status, 'Same')
  assert.equal(result(source, 'vaePrecision.value').before, 'Auto')
  assert.equal(result(source, 'vaePrecision.value').after, 'Auto')
  for (const precision of ['Auto', 'FP16', 'FP32'] as const) {
    source.data.generationConfiguration.vaePrecision = precision
    source.current.generationDraft.vaePrecision = precision
    assert.ok(isRasterGenerationData(source.data))
    assert.equal(result(source, 'vaePrecision.value').status, 'Same', precision)
    assert.equal(result(source, 'vaePrecision.value').before, precision)
    assert.equal(result(source, 'vaePrecision.value').after, precision)
  }
  source.data.generationConfiguration.vaePrecision = 'FP32'
  source.current.generationDraft.vaePrecision = 'FP16'
  const frozen = structuredClone(source)
  assert.deepEqual(result(source, 'vaePrecision.value'), {
    after: 'FP16',
    before: 'FP32',
    key: 'vaePrecision.value',
    label: 'VAE Precision',
    status: 'Changed',
  })
  assert.deepEqual(source, frozen, 'current selection never rewrites accepted precision')
  delete source.current.generationDraft.vaePrecision
  assert.equal(result(source, 'vaePrecision.value').status, 'Changed')
  assert.equal(result(source, 'vaePrecision.value').after, 'Auto')
  const old = source.data.generationConfiguration
  source.data.generationConfiguration = {
    ...old,
    mode: 'img2img',
    sampling: { ...old.sampling, denoisingStrength: 0.75 },
  }
  assert.ok(isRasterGenerationData(source.data), 'both normal-mode variants record the value')
  assert.equal(result(source, 'vaePrecision.value').before, 'FP32')
})

test('VAE Precision current default does not escape Illustrious and invalid recorded precision fails the strict DTO', () => {
  for (const family of ['anima', null] as const) {
    const source = fixture()
    source.data.generationConfiguration.vaePrecision = 'FP32'
    source.current.generationDraft.model!.baseModelFamily = family
    source.current.generationDraft.vaePrecision = 'FP32'
    assert.equal(result(source, 'vaePrecision.value').status, 'Unavailable')
    assert.match(result(source, 'vaePrecision.value').after, /Unsupported|Unavailable/)
    delete source.current.generationDraft.vaePrecision
    assert.equal(result(source, 'vaePrecision.value').status, 'Unavailable')
    assert.notEqual(result(source, 'vaePrecision.value').after, 'Auto')
  }
  const source = fixture()
  source.current.generationDraft.model = null
  source.data.generationConfiguration.vaePrecision = 'FP16'
  assert.equal(result(source, 'vaePrecision.value').status, 'Unavailable')
  assert.notEqual(result(source, 'vaePrecision.value').after, 'Auto')
  for (const precision of ['auto', 'BF16', 'FP64', null, 16, { mode: 'FP16' }]) {
    const invalid = {
      ...source.data,
      generationConfiguration: { ...source.data.generationConfiguration, vaePrecision: precision },
    }
    assert.equal(isRasterGenerationData(invalid), false, JSON.stringify(precision))
  }
  const legacy = fixture()
  assert.ok(isRasterGenerationData(legacy.data))
  assert.equal('vaePrecision' in legacy.data.generationConfiguration, false)
})

test('recorded empty LoRA stack is Same while legacy absence stays Unavailable', () => {
  const source = fixture()
  assert.equal(result(source, 'loras.stack').status, 'Unavailable')
  source.data.generationConfiguration.loras = []
  assert.ok(isRasterGenerationData(source.data))
  assert.equal(result(source, 'loras.stack').status, 'Same')
  assert.equal(result(source, 'loras.stack').before, 'None')
  assert.equal(result(source, 'loras.stack').after, 'None')
})

test('LoRA comparison preserves ordered frozen weight/enabled/exact portable identity without inspecting disabled files', () => {
  const source = fixture()
  const resource = {
    ...source.current.generationDraft.model!,
    displayName: 'Frozen LoRA',
    fileSha256: 'c'.repeat(64),
    kind: 'lora' as const,
    localModelId: OTHER_MODEL_ID,
    localVersionId: OTHER_VERSION_ID,
    predictionType: null,
    versionName: 'Exact v1',
  }
  const enabled = { enabled: true, resource, weight: 0 }
  const disabled = {
    enabled: false,
    resource: {
      ...resource,
      baseModelFamily: 'anima' as const,
      civitaiModelId: 101,
      displayName: 'Disabled unavailable LoRA',
      fileSha256: 'd'.repeat(64),
      localModelId: 'former-local-id',
      localVersionId: 'former-version-id',
    },
    weight: -0.35,
  }
  source.current.modelCatalog!.push(catalogItem(resource))
  source.current.generationDraft.loras = structuredClone([enabled, disabled])
  source.data.generationConfiguration.loras = structuredClone([enabled, disabled])
  assert.ok(
    isRasterGenerationData(source.data),
    'enabled zero and disabled unavailable references cross the actual IPC guard',
  )
  const snapshot = structuredClone(source)
  assert.equal(result(source, 'loras.stack').status, 'Same')
  assert.match(result(source, 'loras.stack').before, /Enabled.*Frozen LoRA.*Weight 0/s)
  assert.match(
    result(source, 'loras.stack').before,
    /Disabled.*Disabled unavailable LoRA.*Weight -0.35/s,
  )
  assert.deepEqual(source, snapshot)
  source.current.generationDraft.loras[0].weight = 0.7
  assert.equal(result(source, 'loras.stack').status, 'Changed')
  assert.match(result(source, 'loras.stack').before, /Weight 0/)
  assert.match(result(source, 'loras.stack').after, /Weight 0.7/)
  source.current.generationDraft.loras = structuredClone([disabled, enabled])
  assert.equal(result(source, 'loras.stack').status, 'Changed', 'stack order is a recorded setting')
  source.current.generationDraft.loras = structuredClone([enabled, disabled])
  source.current.generationDraft.loras[0].resource.displayName = 'Current renamed label'
  source.current.generationDraft.loras[0].resource.versionName = 'Current renamed version'
  assert.equal(
    result(source, 'loras.stack').status,
    'Same',
    'labels are copied descriptions rather than exact identity',
  )
  source.current.modelCatalog = []
  assert.equal(
    result(source, 'loras.stack').status,
    'Missing resource',
    'enabled weight zero still owns a verified resource',
  )
  source.current.modelCatalog = null
  assert.equal(result(source, 'loras.stack').status, 'Unavailable')
  source.current.generationDraft.loras = [disabled]
  source.data.generationConfiguration.loras = [disabled]
  assert.equal(
    result(source, 'loras.stack').status,
    'Same',
    'disabled unknown resources never require a live catalog',
  )
})

test('LoRA comparison distinguishes exact portable settings while local rebinding preserves identity', () => {
  const source = fixture()
  const resource = {
    ...source.current.generationDraft.model!,
    fileSha256: 'c'.repeat(64),
    kind: 'lora' as const,
    localModelId: OTHER_MODEL_ID,
    localVersionId: OTHER_VERSION_ID,
    predictionType: null,
  }
  const entry = { enabled: true, resource, weight: -0.35 }
  source.data.generationConfiguration.loras = [structuredClone(entry)]
  source.current.generationDraft.loras = [structuredClone(entry)]
  source.current.modelCatalog!.push(catalogItem(resource))
  assert.ok(isRasterGenerationData(source.data))
  const original = structuredClone(source)
  for (const change of [
    { fileSha256: 'd'.repeat(64) },
    { civitaiVersionId: 194 },
    { civitaiFileId: 195 },
  ]) {
    const current = {
      ...resource,
      ...change,
      localModelId: '158f0b45-8aba-4989-9188-f477cae67bf5',
      localVersionId: '11f3ac96-8075-47b4-9260-86d4d4d55d4c',
    }
    source.current.generationDraft.loras = [{ ...entry, resource: current }]
    source.current.modelCatalog = [...original.current.modelCatalog!, catalogItem(current)]
    assert.equal(
      result(source, 'loras.stack').status,
      'Changed',
      'both exact versions are installed; portable identity still differs',
    )
  }
  const rebound = {
    ...resource,
    displayName: 'Local renamed resource',
    localModelId: '158f0b45-8aba-4989-9188-f477cae67bf5',
    localVersionId: '11f3ac96-8075-47b4-9260-86d4d4d55d4c',
    versionName: 'Local renamed version',
  }
  source.current.generationDraft.loras = [{ ...entry, resource: rebound }]
  source.current.modelCatalog = [...original.current.modelCatalog!, catalogItem(rebound)]
  assert.equal(
    result(source, 'loras.stack').status,
    'Same',
    'machine-local bindings and copied labels do not change portable identity',
  )
  source.current.generationDraft.loras[0].enabled = false
  assert.equal(result(source, 'loras.stack').status, 'Changed')
  source.current.modelCatalog = [catalogItem(rebound)]
  assert.equal(
    result(source, 'loras.stack').status,
    'Missing resource',
    'enabled baseline still requires its exact binding even when current row is disabled',
  )
  source.current.modelCatalog = original.current.modelCatalog
  source.current.generationDraft.loras = []
  assert.equal(result(source, 'loras.stack').status, 'Removed')
  source.data.generationConfiguration.loras = []
  source.current.generationDraft.loras = [structuredClone(entry)]
  assert.equal(result(source, 'loras.stack').status, 'Added')
  source.data.generationConfiguration.loras = [structuredClone(entry)]
  source.current.generationDraft.loras[0].weight = 1e-10
  assert.equal(result(source, 'loras.stack').status, 'Changed')
  assert.match(result(source, 'loras.stack').after, /Weight 1e-10/)
  assert.deepEqual(
    source.data.generationConfiguration.loras,
    original.data.generationConfiguration.loras,
    'current edits never rewrite accepted settings',
  )
})

test('Denoising Strength compares immutable applied img2img settings and ignores stored txt2img strength', () => {
  const source = fixture()
  source.current.generationDraft.sampling.denoisingStrength = 0.75
  assert.equal(
    result(source, 'denoisingStrength.value').status,
    'Unavailable',
    'legacy/txt output never invents an applied strength',
  )
  const old = source.data.generationConfiguration
  source.data.generationConfiguration = {
    ...old,
    mode: 'img2img',
    sampling: { ...old.sampling, denoisingStrength: 0.75 },
  }
  assert.ok(isRasterGenerationConfigurationV1(source.data.generationConfiguration))
  source.data.currentMode = 'img2img'
  assert.equal(result(source, 'denoisingStrength.value').status, 'Same')
  source.current.generationDraft.sampling.denoisingStrength = 0.25
  const frozen = structuredClone(source.data)
  assert.equal(result(source, 'denoisingStrength.value').status, 'Changed')
  assert.equal(result(source, 'denoisingStrength.value').before, '0.75')
  assert.equal(result(source, 'denoisingStrength.value').after, '0.25')
  source.data.generationConfiguration.sampling.denoisingStrength = 0
  source.current.generationDraft.sampling.denoisingStrength = 0
  assert.equal(result(source, 'denoisingStrength.value').status, 'Same')
  assert.equal(result(source, 'denoisingStrength.value').before, '0')
  source.data.currentMode = 'txt2img'
  assert.equal(result(source, 'denoisingStrength.value').status, 'Unavailable')
  assert.match(result(source, 'denoisingStrength.value').after, /Not applied/)
  source.data.currentMode = 'outpaint'
  assert.equal(result(source, 'denoisingStrength.value').status, 'Unavailable')
  assert.equal(frozen.generationConfiguration.mode, 'img2img')
  assert.equal('denoisingStrength' in old.sampling, false)
})

test('recorded CFG Rescale compares actual values and Illustrious default zero without rewriting legacy absence', () => {
  const source = fixture()
  assert.equal(result(source, 'cfgRescale.value').status, 'Unavailable')
  source.data.generationConfiguration.cfgRescale = 0
  assert.equal('cfgRescale' in source.current.generationDraft, false)
  assert.equal(result(source, 'cfgRescale.value').status, 'Same')
  assert.equal(result(source, 'cfgRescale.value').before, '0')
  assert.equal(result(source, 'cfgRescale.value').after, '0')
  assert.equal('cfgRescale' in source.current.generationDraft, false)
  source.current.generationDraft.cfgRescale = 0.7
  assert.equal(result(source, 'cfgRescale.value').status, 'Changed')
  source.data.generationConfiguration.cfgRescale = 0.7
  assert.equal(result(source, 'cfgRescale.value').status, 'Same')
  source.current.generationDraft.model!.baseModelFamily = 'anima'
  assert.equal(result(source, 'cfgRescale.value').status, 'Unavailable')
  assert.match(result(source, 'cfgRescale.value').after, /Anima/)
  delete source.data.generationConfiguration.cfgRescale
  source.current.generationDraft.model!.baseModelFamily = 'illustrious'
  source.current.generationDraft.cfgRescale = 0
  assert.equal(result(source, 'cfgRescale.value').status, 'Unavailable')
  assert.equal('cfgRescale' in source.data.generationConfiguration, false)
})

function generationConfiguration(): IgsIllustriousRasterGenerationProvenanceV1['generationConfiguration'] {
  const config: IgsIllustriousRasterGenerationProvenanceV1['generationConfiguration'] = {
    mode: 'txt2img',
    model: {
      baseModelFamily: 'illustrious',
      civitaiFileId: 93,
      civitaiModelId: 91,
      civitaiVersionId: 92,
      displayName: 'Illustrious checkpoint',
      fileSha256: 'a'.repeat(64),
      kind: 'checkpoint',
      localModelId: MODEL_ID,
      localVersionId: VERSION_ID,
      predictionType: 'epsilon',
      versionName: 'v1',
    },
    negativePrompt: { embeddingRefs: [], text: 'blur' },
    positivePrompt: { embeddingRefs: [], text: 'a red lantern' },
    sampling: {
      actualSeed: 0,
      cfgScale: 7,
      invokeScheduler: 'dpmpp_2m_k',
      requestedSeedPolicy: 'fixed',
      sampler: 'DPM++ 2M',
      scheduler: 'Karras',
      seedBehavior: 'per-iteration',
      steps: 30,
    },
    size: { height: 128, width: 64 },
  }
  assert.ok(isRasterGenerationConfigurationV1(config), 'fixture is valid portable v1 settings')
  return config
}

function catalogItem(
  model: NonNullable<GenerationSettingsComparisonCurrent['generationDraft']['model']>,
) {
  const resource: ModelCatalogItem = {
    author: null,
    defaultVersionId: model.localVersionId,
    description: null,
    id: model.localModelId,
    modelId: model.civitaiModelId,
    name: model.displayName,
    previewDataUrl: null,
    resourceType: model.kind,
    sourceUrl: null,
    trainedWords: [],
    versions: [
      {
        baseModelFamily: model.baseModelFamily,
        civitaiFileId: model.civitaiFileId,
        civitaiVersionId: model.civitaiVersionId,
        dependencyIssues: [],
        fileName: 'checkpoint.safetensors',
        fileSizeBytes: 1234,
        fileStatus: 'ready',
        format: 'SafeTensor',
        id: model.localVersionId,
        installedAt: '2026-10-02T10:00:00.000Z',
        name: model.versionName,
        predictionType: model.predictionType,
        sha256: model.fileSha256,
        trainedWords: [],
      },
    ],
  }
  return resource
}

function fixture(): {
  current: GenerationSettingsComparisonCurrent
  data: Omit<RasterGenerationData, 'generationConfiguration'> & {
    generationConfiguration: IgsIllustriousRasterGenerationProvenanceV1['generationConfiguration']
  }
} {
  const config = generationConfiguration()
  const document = createEmptyProjectDocumentV1({
    documentId: DOCUMENT_ID,
    documentRevision: REVISION_ID,
    title: 'Comparison test',
  })
  Object.assign(document.generationDraft, {
    model: structuredClone(config.model),
    negativePrompt: structuredClone(config.negativePrompt),
    positivePrompt: structuredClone(config.positivePrompt),
    sampling: {
      cfgScale: config.sampling.cfgScale,
      denoisingStrength: null,
      sampler: config.sampling.sampler,
      scheduler: config.sampling.scheduler,
      steps: config.sampling.steps,
    },
    seed: { policy: 'fixed', value: 0 },
  })
  const result = {
    current: {
      bbox: { height: 128, width: 64 },
      generationDraft: document.generationDraft,
      modelCatalog: [catalogItem(config.model)],
      modelCatalogError: null,
      reuseSeed: null,
    },
    data: {
      currentMode: 'txt2img' as const,
      documentId: DOCUMENT_ID,
      generationConfiguration: config,
      layerId: LAYER_ID,
      modeUnavailableReason: null,
    },
  }
  assert.ok(isRasterGenerationData(result.data), 'fixture crosses the real strict DTO guard')
  return result
}

function rows(source: ReturnType<typeof fixture>): GenerationSettingsComparisonRow[] {
  return compareRasterGenerationSettings(source.data, source.current).flatMap(
    (section) => section.rows,
  )
}

function result(source: ReturnType<typeof fixture>, key: string): GenerationSettingsComparisonRow {
  const found = rows(source).find((item) => item.key === key)
  assert.ok(found, `projection must expose ${key}`)
  return found
}

test('strict portable DTO admits legacy optional seed behavior and imported layers, rejects private context', () => {
  const source = fixture()
  delete source.data.generationConfiguration.sampling.seedBehavior
  assert.ok(isRasterGenerationData(source.data))
  assert.ok(isRasterGenerationData({ ...source.data, generationConfiguration: null }))
  assert.deepEqual(
    compareRasterGenerationSettings(
      { ...source.data, generationConfiguration: null },
      source.current,
    ),
    [],
  )
  for (const invalid of [
    { ...source.data, layerSourceContext: { bbox: { x: 1, y: 2 } } },
    { ...source.data, documentId: 'foreign-tab' },
    { ...source.data, currentMode: null },
    { ...source.data, modeUnavailableReason: 'worker missing' },
    { ...source.data, currentMode: null, modeUnavailableReason: ' ' },
    { ...source.data, currentMode: null, modeUnavailableReason: 'ø'.repeat(513) },
    {
      ...source.data,
      generationConfiguration: { ...source.data.generationConfiguration, managedPath: '/private' },
    },
    {
      ...source.data,
      generationConfiguration: {
        ...source.data.generationConfiguration,
        sampling: { ...source.data.generationConfiguration.sampling, workerPath: '/private' },
      },
    },
    {
      ...source.data,
      generationConfiguration: {
        ...source.data.generationConfiguration,
        sampling: { ...source.data.generationConfiguration.sampling, seedBehavior: 'unknown' },
      },
    },
  ]) {
    assert.equal(isRasterGenerationData(invalid), false)
  }
  assert.ok(
    isRasterGenerationData({
      ...source.data,
      currentMode: null,
      modeUnavailableReason: 'Worker down',
    }),
  )
})

test('actual frozen settings compare with Current Canvas while v1 omissions stay explicitly Unavailable', () => {
  const source = fixture()
  const projected = rows(source)
  for (const key of [
    'prompt.text',
    'negativePrompt.text',
    'model.resource',
    'model.predictionType',
    'size.dimensions',
    'sampling.sampler',
    'sampling.scheduler',
    'sampling.invokeScheduler',
    'guidance.steps',
    'guidance.cfg',
    'seed.actual',
    'seed.policy',
    'seed.behavior',
    'context.mode',
  ]) {
    assert.equal(result(source, key).status, 'Same', key)
  }
  for (const key of [
    'loras.stack',
    'cfgRescale.value',
    'denoisingStrength.value',
    'vae.resource',
    'vaePrecision.value',
    'clipSkip.value',
  ]) {
    assert.equal(result(source, key).status, 'Unavailable', key)
    assert.match(result(source, key).before, /Unavailable in saved generation data/)
  }
  assert.equal(new Set(projected.map((row) => row.key)).size, projected.length)
  assert.ok(
    projected.every((row) => typeof row.before === 'string' && typeof row.after === 'string'),
  )
  assert.equal(JSON.stringify(projected).includes('Regional Guidance'), false)
})

test('semantic identity ignores copied names and local IDs only when both exact bindings are present', () => {
  const source = fixture()
  const copied = {
    ...source.current.generationDraft.model!,
    displayName: 'Renamed on this computer',
    localModelId: OTHER_MODEL_ID,
    localVersionId: OTHER_VERSION_ID,
    versionName: 'Renamed v1',
  }
  source.current.generationDraft.model = copied
  source.current.modelCatalog!.push(catalogItem(copied))
  assert.equal(result(source, 'model.resource').status, 'Same')
  assert.match(result(source, 'model.resource').after, /Renamed on this computer/)
  source.current.modelCatalog = [catalogItem(copied)]
  assert.equal(result(source, 'model.resource').status, 'Missing resource')
})

test('portable relink candidates and catalog defaults never mask an unlinked or incorrect exact version', () => {
  for (const change of [
    'local-binding',
    'sha256',
    'family',
    'version-id',
    'file-id',
    'model-id',
    'corrupt',
  ] as const) {
    const source = fixture()
    const installed = source.current.modelCatalog![0]
    const version = installed.versions[0]
    switch (change) {
      case 'corrupt': {
        version.fileStatus = 'corrupt'
        break
      }
      case 'family': {
        version.baseModelFamily = 'anima'
        break
      }
      case 'file-id': {
        version.civitaiFileId = 999
        break
      }
      case 'local-binding': {
        installed.id = OTHER_MODEL_ID
        version.id = OTHER_VERSION_ID
        installed.defaultVersionId = OTHER_VERSION_ID
        break
      }
      case 'model-id': {
        installed.modelId = 999
        break
      }
      case 'sha256': {
        version.sha256 = 'b'.repeat(64)
        break
      }
      case 'version-id': {
        version.civitaiVersionId = 999
        break
      }
    }
    assert.equal(result(source, 'model.resource').status, 'Missing resource', change)
    assert.equal(result(source, 'model.predictionType').status, 'Missing resource', change)
  }
  const source = fixture()
  source.current.generationDraft.model = null
  assert.equal(result(source, 'model.resource').status, 'Removed')
})

test('two ready resource bindings still differ when any portable identity axis changes', () => {
  const variants: Partial<
    NonNullable<GenerationSettingsComparisonCurrent['generationDraft']['model']>
  >[] = [
    { baseModelFamily: 'anima' },
    { civitaiFileId: 999 },
    { civitaiModelId: 999 },
    { civitaiVersionId: 999 },
    { fileSha256: 'b'.repeat(64) },
    { kind: 'lora' },
  ]
  for (const changedIdentity of variants) {
    const source = fixture()
    const copied = {
      ...source.current.generationDraft.model!,
      ...changedIdentity,
      localModelId: OTHER_MODEL_ID,
      localVersionId: OTHER_VERSION_ID,
    }
    source.current.generationDraft.model = copied
    source.current.modelCatalog!.push(catalogItem(copied))
    assert.equal(
      result(source, 'model.resource').status,
      'Changed',
      JSON.stringify(changedIdentity),
    )
    assert.notEqual(result(source, 'model.resource').before, result(source, 'model.resource').after)
    assert.match(result(source, 'model.resource').before, /CivitAI model 91 · version 92 · file 93/)
  }
})

test('Illustrious scheduler resolution is unavailable for Anima, unknown family or no current checkpoint', () => {
  for (const family of ['anima', null] as const) {
    const source = fixture()
    source.current.generationDraft.model!.baseModelFamily = family
    source.current.modelCatalog![0].versions[0].baseModelFamily = family
    assert.equal(result(source, 'sampling.invokeScheduler').status, 'Unavailable')
    assert.equal(
      result(source, 'sampling.sampler').status,
      family === 'anima' ? 'Unavailable' : 'Same',
    )
    assert.equal(
      result(source, 'sampling.scheduler').status,
      family === 'anima' ? 'Unavailable' : 'Same',
    )
  }
  const source = fixture()
  source.current.generationDraft.model = null
  assert.equal(result(source, 'sampling.invokeScheduler').status, 'Unavailable')
})

test('Current prediction type comes from installed library override while actual baseline remains frozen', () => {
  const source = fixture()
  source.current.modelCatalog![0].versions[0].predictionType = 'v_prediction'
  source.current.modelCatalog![0].versions[0].predictionTypeSource = 'user'
  assert.equal(source.current.generationDraft.model!.predictionType, 'epsilon')
  assert.equal(result(source, 'model.resource').status, 'Same')
  assert.deepEqual(result(source, 'model.predictionType'), {
    after: 'v_prediction',
    before: 'epsilon',
    key: 'model.predictionType',
    label: 'Prediction type',
    status: 'Changed',
  })
  assert.equal(source.data.generationConfiguration.model.predictionType, 'epsilon')
})

test('unknown catalog is Unavailable, known empty library is Missing resource, and prompts remain comparable', () => {
  const source = fixture()
  source.current.modelCatalog = null
  assert.equal(result(source, 'model.resource').status, 'Unavailable')
  assert.equal(result(source, 'prompt.text').status, 'Same')
  assert.equal(result(source, 'prompt.embeddings').status, 'Same')
  source.current.modelCatalog = []
  assert.equal(result(source, 'model.resource').status, 'Missing resource')
  source.current.modelCatalogError = 'Catalog request failed'
  assert.equal(result(source, 'model.resource').status, 'Unavailable')
  assert.match(result(source, 'model.resource').after, /Catalog request failed/)
})

test('concrete dynamic output compares against authored syntax and embedding token identities independently', () => {
  const source = fixture()
  source.current.generationDraft.positivePrompt.text = 'a {red|blue} lantern'
  source.current.generationDraft.negativePrompt.text = 'blur, noise'
  assert.equal(result(source, 'prompt.text').status, 'Changed')
  assert.equal(result(source, 'prompt.text').before, 'a red lantern')
  assert.equal(result(source, 'prompt.text').after, 'a {red|blue} lantern')
  assert.equal(result(source, 'negativePrompt.text').status, 'Changed')
  const embedding = { ...source.data.generationConfiguration.model, kind: 'embedding' as const }
  source.data.generationConfiguration.positivePrompt.embeddingRefs = [
    { resource: embedding, token: 'warm-light' },
  ]
  source.current.generationDraft.positivePrompt.embeddingRefs = [
    { resource: { ...embedding, displayName: 'Display rename' }, token: 'warm-light' },
  ]
  source.current.modelCatalog!.push(catalogItem(embedding))
  assert.equal(result(source, 'prompt.embeddings').status, 'Same')
  source.data.generationConfiguration.positivePrompt.embeddingRefs = []
  assert.equal(result(source, 'prompt.embeddings').status, 'Added')
  source.data.generationConfiguration.positivePrompt.embeddingRefs = [
    { resource: embedding, token: 'warm-light' },
  ]
  source.current.generationDraft.positivePrompt.embeddingRefs = []
  assert.equal(result(source, 'prompt.embeddings').status, 'Removed')
  source.current.generationDraft.positivePrompt.embeddingRefs = [
    { resource: embedding, token: 'warm-light' },
  ]
  source.current.generationDraft.positivePrompt.embeddingRefs[0].token = 'cold-light'
  assert.equal(result(source, 'prompt.embeddings').status, 'Changed')
  source.current.modelCatalog!.pop()
  assert.equal(result(source, 'prompt.embeddings').status, 'Missing resource')
  source.data.generationConfiguration.negativePrompt.text = ''
  assert.equal(result(source, 'negativePrompt.text').status, 'Added')
  source.data.generationConfiguration.negativePrompt.text = 'blur, noise'
  source.current.generationDraft.negativePrompt.text = ''
  assert.equal(result(source, 'negativePrompt.text').status, 'Removed')
})

test('effective embedding comparison preserves copied literals and exact per-polarity identity across library Default and display changes', () => {
  const source = fixture()
  const positive = {
    ...source.data.generationConfiguration.model,
    fileSha256: 'b'.repeat(64),
    kind: 'embedding' as const,
    localModelId: '6e3b548d-6dc0-4c2e-bc5c-0b68971da010',
    localVersionId: '6e3b548d-6dc0-4c2e-bc5c-0b68971da011',
    predictionType: null,
  }
  const negative = {
    ...positive,
    civitaiModelId: 101,
    fileSha256: 'c'.repeat(64),
    localModelId: '6e3b548d-6dc0-4c2e-bc5c-0b68971da020',
    localVersionId: '6e3b548d-6dc0-4c2e-bc5c-0b68971da021',
  }
  for (const [polarity, embedding] of [
    ['positive', positive],
    ['negative', negative],
  ] as const) {
    source.data.generationConfiguration[`${polarity}Prompt`] = {
      embeddingRefs: [{ resource: embedding, token: '<custom>' }],
      text: `literal <custom> ${polarity}`,
    }
    source.current.generationDraft[`${polarity}Prompt`] = structuredClone(
      source.data.generationConfiguration[`${polarity}Prompt`],
    )
    source.current.modelCatalog!.push(catalogItem(embedding))
  }
  const before = structuredClone(source.data)
  const catalog = source.current.modelCatalog!.find((item) => item.id === positive.localModelId)!
  catalog.defaultVersionId = '6e3b548d-6dc0-4c2e-bc5c-0b68971da099'
  catalog.name = 'New library label'
  catalog.versions[0].name = 'Renamed installed v1'
  source.current.generationDraft.positivePrompt.embeddingRefs[0].resource.displayName =
    'Different copied label'
  assert.equal(result(source, 'prompt.embeddings').status, 'Same')
  assert.equal(result(source, 'negativePrompt.embeddings').status, 'Same')
  assert.match(result(source, 'prompt.embeddings').before, /<custom>/)
  assert.equal(result(source, 'prompt.text').before, 'literal <custom> positive')
  assert.deepEqual(
    source.data,
    before,
    'read-only comparison never rewrites copied metadata or tokens',
  )
  source.current.generationDraft.negativePrompt.embeddingRefs[0].resource = { ...positive }
  assert.equal(result(source, 'negativePrompt.embeddings').status, 'Changed')
  assert.equal(
    result(source, 'prompt.embeddings').status,
    'Same',
    'polarity has an independent exact binding',
  )
  catalog.versions[0].fileStatus = 'missing'
  assert.equal(result(source, 'prompt.embeddings').status, 'Missing resource')
  source.current.modelCatalog = null
  assert.equal(result(source, 'prompt.embeddings').status, 'Unavailable')
})

test('baseline actual seed zero, requested policy and seed behavior compare as distinct facts', () => {
  const source = fixture()
  assert.equal(result(source, 'seed.actual').before, '0')
  assert.equal(result(source, 'seed.actual').after, '0')
  source.current.generationDraft.seed = { policy: 'reuse', value: 200 }
  source.current.reuseSeed = 0
  assert.equal(result(source, 'seed.actual').status, 'Same')
  assert.equal(result(source, 'seed.policy').status, 'Changed')
  source.current.reuseSeed = null
  assert.equal(result(source, 'seed.actual').status, 'Unavailable')
  source.current.generationDraft.seed = { policy: 'random', value: 0 }
  assert.equal(result(source, 'seed.actual').status, 'Unavailable')
  source.current.generationDraft.dynamicPrompt = { maxPrompts: 10, seedBehavior: 'per-prompt' }
  assert.equal(result(source, 'seed.behavior').status, 'Changed')
  delete source.data.generationConfiguration.sampling.seedBehavior
  assert.equal(result(source, 'seed.behavior').status, 'Unavailable')
})

test('size and mode use current derived generation context, mode failure is explicit and unrelated values remain useful', () => {
  const source = fixture()
  source.current.bbox = { height: 64, width: 128 }
  source.data.currentMode = 'outpaint'
  assert.equal(result(source, 'size.dimensions').status, 'Changed')
  assert.equal(result(source, 'context.mode').status, 'Changed')
  source.data.currentMode = null
  source.data.modeUnavailableReason = 'Image engine is not installed'
  assert.equal(result(source, 'context.mode').status, 'Unavailable')
  assert.equal(result(source, 'context.mode').after, 'Image engine is not installed')
  assert.equal(result(source, 'guidance.steps').status, 'Same')
})

test('semantic scalar changes and unchosen controls are distinguished without inventing missing defaults', () => {
  const source = fixture()
  source.current.generationDraft.sampling.cfgScale = 8
  source.current.generationDraft.sampling.steps = null
  source.current.generationDraft.sampling.sampler = null
  source.current.generationDraft.sampling.scheduler = null
  source.current.generationDraft.cfgRescale = 0
  source.current.generationDraft.vaePrecision = 'Auto'
  assert.equal(result(source, 'guidance.cfg').status, 'Changed')
  assert.equal(result(source, 'guidance.steps').status, 'Removed')
  assert.equal(result(source, 'sampling.sampler').status, 'Removed')
  assert.equal(result(source, 'sampling.invokeScheduler').status, 'Unavailable')
  assert.equal(result(source, 'cfgRescale.value').status, 'Unavailable')
  assert.equal(result(source, 'vaePrecision.value').status, 'Unavailable')
})

test('pure projection leaves frozen inputs unchanged and never allocates a random seed', () => {
  const source = fixture()
  source.current.generationDraft.seed = { policy: 'random', value: null }
  const snapshot = structuredClone(source)
  function freeze(value: unknown): void {
    if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(freeze)
      Object.freeze(value)
    }
  }
  freeze(source)
  const random = Math.random
  Math.random = () => {
    throw new Error('Comparison must not allocate a seed')
  }
  try {
    const first = rows(source)
    const second = rows(source)
    assert.deepEqual(first, second)
    first[0].after = 'mutating the disposable view'
    assert.equal(second[0].after, snapshot.current.generationDraft.positivePrompt.text)
    assert.deepEqual(source, snapshot)
  } finally {
    Math.random = random
  }
})
