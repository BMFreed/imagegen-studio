import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { AnimaModelBundleView, ModelCatalogItem } from '../api.js'
import type {
  IgsAnimaRasterGenerationProvenanceV1,
  IgsIllustriousRasterGenerationProvenanceV1,
} from './project-schema.js'

import { ANIMA_SAMPLING_METHOD_KEYS } from './anima-sampling-method.js'
import {
  compareRasterGenerationSettings,
  type GenerationSettingsComparisonCurrent,
  isRasterGenerationData,
  type RasterGenerationData,
} from './generation-settings-comparison.js'
import { createEmptyProjectDocumentV1 } from './project-schema.js'

const modelId = '57424ef4-e87e-4413-9c38-17ec576265f2'
const versionId = 'd89496a9-c30f-42c9-bfcb-1d82c68963c1'
const encoderId = '26b4b2f8-85c5-4ad6-854b-903a0a6f42d2'
const encoderVersion = '1ee20dd0-c352-4591-9d8e-4642cb12c2b8'
const vaeId = '4b83fd18-f383-4871-93f8-fc5e92f6729a'
const vaeVersion = 'e3bd50c6-d8da-44af-a1f4-4b6d6ded6482'
const otherModelId = 'b2b24c13-25f5-470c-a35c-79b62c7a9866'
const otherVersion = '999e25aa-773f-42f0-b5f1-609c3e828153'
type Configuration = IgsAnimaRasterGenerationProvenanceV1['generationConfiguration']

function fixture(mode: 'img2img' | 'txt2img' = 'txt2img') {
  const document = createEmptyProjectDocumentV1({ title: 'Native comparison subject' })
  const bundle: AnimaModelBundleView = {
    architecture: 'anima-base-1.0',
    checkpointByteSize: 4567,
    qwen3Encoder: {
      byteSize: 1234,
      localModelId: encoderId,
      localVersionId: encoderVersion,
      sha256: 'b'.repeat(64),
    },
    vae: {
      byteSize: 2345,
      localModelId: vaeId,
      localVersionId: vaeVersion,
      sha256: 'c'.repeat(64),
    },
  }
  const base = {
    anima: bundle,
    loras: [],
    model: {
      baseModelFamily: 'anima' as const,
      civitaiFileId: 701,
      civitaiModelId: 42,
      civitaiVersionId: 7,
      displayName: 'Frozen Anima',
      fileSha256: 'a'.repeat(64),
      kind: 'checkpoint' as const,
      localModelId: modelId,
      localVersionId: versionId,
      predictionType: null,
      versionName: 'exact-v1',
    },
    negativePrompt: { embeddingRefs: [], text: '(blur:0.5)' },
    positivePrompt: { embeddingRefs: [], text: '(猫:1.5) lantern+' },
    sampling: {
      actualSeed: 0,
      animaMethod: 'heun' as const,
      cfgScale: 5,
      requestedSeedPolicy: 'fixed' as const,
      seedBehavior: 'per-iteration' as const,
      steps: 20,
    },
    size: { height: 64, width: 128 },
  }
  const config: Configuration =
    mode === 'img2img'
      ? { ...base, mode, sampling: { ...base.sampling, denoisingStrength: 0 } }
      : { ...base, mode }
  Object.assign(document.generationDraft, {
    model: structuredClone(config.model),
    negativePrompt: structuredClone(config.negativePrompt),
    positivePrompt: structuredClone(config.positivePrompt),
    sampling: {
      animaMethod: 'heun',
      cfgScale: 5,
      denoisingStrength: mode === 'img2img' ? 0 : null,
      sampler: 'DPM++ 2M',
      scheduler: 'Karras',
      steps: 20,
    },
    seed: { policy: 'fixed', value: 0 },
  })
  const data: Omit<RasterGenerationData, 'generationConfiguration'> & {
    generationConfiguration: Configuration
  } = {
    currentMode: mode,
    documentId: document.documentId,
    generationConfiguration: config,
    layerId: 'b8468727-804a-4522-a3e7-c5145967e43f',
    modeUnavailableReason: null,
  }
  const current: GenerationSettingsComparisonCurrent = {
    bbox: config.size,
    generationDraft: document.generationDraft,
    modelCatalog: [catalog(config.model, bundle)],
    modelCatalogError: null,
    reuseSeed: null,
  }
  assert.ok(isRasterGenerationData(data), 'native fixture crosses actual strict portable DTO')
  return { current, data }
}

function catalog(
  model: GenerationSettingsComparisonCurrent['generationDraft']['model'] & {},
  bundle?: AnimaModelBundleView,
): ModelCatalogItem {
  return {
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
        ...(bundle ? { anima: structuredClone(bundle) } : {}),
        baseModelFamily: model.baseModelFamily,
        civitaiFileId: model.civitaiFileId,
        civitaiVersionId: model.civitaiVersionId,
        dependencyIssues: [],
        fileName: 'exact.safetensors',
        fileSizeBytes: bundle?.checkpointByteSize ?? 100,
        fileStatus: 'ready',
        format: 'SafeTensor',
        id: model.localVersionId,
        installedAt: '2026-10-05T00:00:00.000Z',
        name: model.versionName,
        predictionType: model.predictionType,
        sha256: model.fileSha256,
        trainedWords: [],
      },
    ],
  }
}

function rows(source: ReturnType<typeof fixture>) {
  return compareRasterGenerationSettings(source.data, source.current).flatMap(
    (section) => section.rows,
  )
}
function result(source: ReturnType<typeof fixture>, key: string) {
  const item = rows(source).find((item) => item.key === key)
  assert.ok(item, `subject exposes ${key}`)
  return item
}

test('native comparison covers all six methods and both modes without invented SD fields or input mutations', () => {
  for (const mode of ['txt2img', 'img2img'] as const) {
    for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
      const source = fixture(mode)
      source.data.generationConfiguration.sampling.animaMethod = method
      source.current.generationDraft.sampling.animaMethod = method
      const before = structuredClone(source)
      for (const key of [
        'model.resource',
        'anima.architecture',
        'anima.checkpointByteSize',
        'anima.qwen3Encoder',
        'anima.vae',
        'sampling.animaMethod',
        'prompt.text',
        'negativePrompt.text',
        'seed.actual',
        'guidance.steps',
        'guidance.cfg',
        'context.mode',
      ]) {
        assert.equal(result(source, key).status, 'Same', `${mode}/${method}/${key}`)
      }
      assert.ok(
        !rows(source).some((item) =>
          [
            'model.predictionType',
            'sampling.invokeScheduler',
            'sampling.sampler',
            'sampling.scheduler',
          ].includes(item.key),
        ),
      )
      assert.deepEqual(source, before)
      const projected = rows(source)
      source.current.generationDraft.sampling.sampler = 'Euler a'
      source.current.generationDraft.sampling.scheduler = 'Normal'
      assert.deepEqual(
        rows(source),
        projected,
        'inactive SD history must not become Anima settings',
      )
    }
  }
})

test('explicit native method changes are visible and absent authoring remains Unavailable', () => {
  const source = fixture()
  source.current.generationDraft.sampling.animaMethod = 'lcm'
  assert.equal(result(source, 'sampling.animaMethod').status, 'Changed')
  assert.equal(result(source, 'sampling.animaMethod').after, 'LCM')
  delete source.current.generationDraft.sampling.animaMethod
  assert.equal(result(source, 'sampling.animaMethod').status, 'Unavailable')
  assert.equal(result(source, 'sampling.animaMethod').after, 'Not set')
})

test('portable companion equality excludes local bindings but availability still requires each exact binding', () => {
  const source = fixture()
  const original = structuredClone(source.current.modelCatalog![0])
  const currentModel = {
    ...source.current.generationDraft.model!,
    localModelId: otherModelId,
    localVersionId: otherVersion,
  }
  const rebound = structuredClone(source.data.generationConfiguration.anima)
  rebound.qwen3Encoder.localModelId = otherModelId
  rebound.qwen3Encoder.localVersionId = otherVersion
  rebound.vae.localModelId = otherModelId
  rebound.vae.localVersionId = otherVersion
  source.current.generationDraft.model = currentModel
  source.current.modelCatalog = [original, catalog(currentModel, rebound)]
  assert.equal(result(source, 'model.resource').status, 'Same')
  assert.equal(result(source, 'anima.qwen3Encoder').status, 'Same')
  assert.equal(result(source, 'anima.vae').status, 'Same')
  source.data.generationConfiguration.anima.qwen3Encoder.localVersionId = otherVersion
  assert.equal(result(source, 'anima.qwen3Encoder').status, 'Unavailable')
  assert.equal(result(source, 'anima.vae').status, 'Same')
})

test('current and recorded missing, invalid or unknown companion metadata cannot claim Same', () => {
  for (const change of [
    (source: ReturnType<typeof fixture>) => {
      delete source.current.modelCatalog![0].versions[0].anima
    },
    (source: ReturnType<typeof fixture>) => {
      source.current.modelCatalog![0].versions[0].dependencyIssues = ['vae']
    },
    (source: ReturnType<typeof fixture>) => {
      source.current.modelCatalog![0].versions[0].fileStatus = 'missing'
    },
    (source: ReturnType<typeof fixture>) => {
      source.current.modelCatalog![0].versions[0].anima!.vae.sha256 = 'invalid'
    },
    (source: ReturnType<typeof fixture>) => {
      source.current.modelCatalog![0].versions[0].anima!.qwen3Encoder.byteSize = 0
    },
    (source: ReturnType<typeof fixture>) => {
      source.current.modelCatalog![0].versions[0].anima!.checkpointByteSize++
    },
    (source: ReturnType<typeof fixture>) => {
      source.current.modelCatalog = null
    },
    (source: ReturnType<typeof fixture>) => {
      source.current.modelCatalogError = 'Catalog failed'
    },
  ]) {
    const source = fixture()
    change(source)
    assert.equal(result(source, 'anima.qwen3Encoder').status, 'Unavailable')
    assert.equal(result(source, 'anima.vae').status, 'Unavailable')
  }
  for (const field of ['sha256', 'byteSize'] as const) {
    const source = fixture()
    if (field === 'sha256') {
      source.data.generationConfiguration.anima.vae.sha256 = 'e'.repeat(64)
    } else {
      source.data.generationConfiguration.anima.vae.byteSize++
    }
    assert.equal(result(source, 'anima.vae').status, 'Unavailable')
    assert.equal(result(source, 'anima.qwen3Encoder').status, 'Same')
  }
})

test('changed SHA or size in a separately linked companion bundle changes portable identity', () => {
  for (const field of ['sha256', 'byteSize'] as const) {
    const source = fixture()
    const selected = {
      ...source.current.generationDraft.model!,
      civitaiFileId: 801,
      civitaiVersionId: 8,
      fileSha256: 'd'.repeat(64),
      localModelId: otherModelId,
      localVersionId: otherVersion,
    }
    const changed = structuredClone(source.data.generationConfiguration.anima)
    if (field === 'sha256') {
      changed.vae.sha256 = 'e'.repeat(64)
    } else {
      changed.vae.byteSize++
    }
    source.current.generationDraft.model = selected
    source.current.modelCatalog!.push(catalog(selected, changed))
    assert.equal(result(source, 'model.resource').status, 'Changed')
    assert.equal(result(source, 'anima.vae').status, 'Changed', field)
    assert.equal(result(source, 'anima.qwen3Encoder').status, 'Same')
  }
})

test('neutral options preserve legacy omission and refuse unsupported current Anima controls', () => {
  const source = fixture()
  assert.equal(result(source, 'cfgRescale.value').status, 'Unavailable')
  assert.equal(result(source, 'vaePrecision.value').status, 'Unavailable')
  source.data.generationConfiguration.cfgRescale = 0
  source.data.generationConfiguration.vaePrecision = 'Auto'
  assert.equal(result(source, 'cfgRescale.value').status, 'Same')
  assert.equal(result(source, 'vaePrecision.value').status, 'Same')
  source.current.generationDraft.cfgRescale = 0.25
  source.current.generationDraft.vaePrecision = 'FP32'
  assert.equal(result(source, 'cfgRescale.value').status, 'Unavailable')
  assert.match(result(source, 'cfgRescale.value').after, /unsupported for Anima/)
  assert.equal(result(source, 'vaePrecision.value').status, 'Unavailable')
  assert.match(result(source, 'vaePrecision.value').after, /unsupported for Anima/)
})

test('an external VAE in the current Anima draft remains explicitly unsupported instead of Same', () => {
  const source = fixture()
  assert.equal(result(source, 'anima.vae').status, 'Same')
  source.current.generationDraft.vae = {
    ...source.data.generationConfiguration.model,
    baseModelFamily: 'illustrious',
    kind: 'vae',
  }
  assert.equal(result(source, 'anima.vae').status, 'Unavailable')
  assert.match(result(source, 'anima.vae').after, /current external VAE selection is unsupported/)
  assert.equal(result(source, 'anima.qwen3Encoder').status, 'Same')
})

test('strength zero is comparable for actual img2img/outpaint and unavailable for txt2img or unknown mode', () => {
  const source = fixture('img2img')
  assert.equal(result(source, 'denoisingStrength.value').status, 'Same')
  assert.equal(result(source, 'denoisingStrength.value').before, '0')
  source.current.generationDraft.sampling.denoisingStrength = 0.5
  assert.equal(result(source, 'denoisingStrength.value').status, 'Changed')
  source.data.currentMode = 'outpaint'
  assert.equal(result(source, 'denoisingStrength.value').status, 'Changed')
  source.current.generationDraft.sampling.denoisingStrength = 0
  assert.equal(result(source, 'denoisingStrength.value').status, 'Same')
  for (const mode of ['txt2img', null] as const) {
    source.data.currentMode = mode
    source.data.modeUnavailableReason = mode === null ? 'Worker unavailable' : null
    assert.equal(result(source, 'denoisingStrength.value').status, 'Unavailable')
  }
})

test('seed zero, Random and project Reuse retain existing operational meanings', () => {
  const source = fixture()
  assert.equal(result(source, 'seed.actual').status, 'Same')
  source.current.generationDraft.seed.policy = 'random'
  assert.equal(result(source, 'seed.actual').status, 'Unavailable')
  source.current.generationDraft.seed.policy = 'reuse'
  assert.equal(result(source, 'seed.actual').status, 'Unavailable')
  source.current.reuseSeed = 0
  assert.equal(result(source, 'seed.actual').status, 'Same')
  source.current.reuseSeed = 100
  assert.equal(result(source, 'seed.actual').status, 'Changed')
  source.current.generationDraft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-prompt' }
  assert.equal(result(source, 'seed.behavior').status, 'Changed')
})

test('configured disabled LoRAs remain comparable while enabled missing resources and signed weight changes are explicit', () => {
  const source = fixture()
  const lora = {
    enabled: false,
    resource: {
      ...source.data.generationConfiguration.model,
      kind: 'lora' as const,
      localModelId: otherModelId,
      localVersionId: otherVersion,
    },
    weight: -0.5,
  }
  source.data.generationConfiguration.loras.push(lora)
  source.current.generationDraft.loras.push(structuredClone(lora))
  assert.equal(result(source, 'loras.stack').status, 'Same')
  source.current.generationDraft.loras[0].weight = 0.5
  assert.equal(result(source, 'loras.stack').status, 'Changed')
  source.current.generationDraft.loras[0].enabled = true
  assert.equal(result(source, 'loras.stack').status, 'Missing resource')
})

test('raw weighted text compares without dynamic expansion, and rows exclude source/execution/regional data', () => {
  const source = fixture()
  const before = structuredClone(source)
  const projected = rows(source)
  assert.equal(result(source, 'prompt.text').before, '(猫:1.5) lantern+')
  assert.ok(
    !projected.some((item) =>
      /regional|bbox|queue|candidate|mask|span|sigmas|stepSeed/i.test(item.key),
    ),
  )
  source.current.generationDraft.positivePrompt.text = '(猫:1.5) {lantern|flower}'
  assert.equal(result(source, 'prompt.text').status, 'Changed')
  assert.equal(result(source, 'prompt.text').after, '(猫:1.5) {lantern|flower}')
  assert.deepEqual(source.data, before.data)
})

test('cross-family comparison does not equate dormant SD pairs with Anima execution', () => {
  const source = fixture()
  const native = source.data.generationConfiguration
  const legacy: IgsIllustriousRasterGenerationProvenanceV1['generationConfiguration'] = {
    mode: 'txt2img',
    model: { ...native.model, baseModelFamily: 'illustrious', predictionType: 'epsilon' },
    negativePrompt: native.negativePrompt,
    positivePrompt: native.positivePrompt,
    sampling: {
      actualSeed: 0,
      cfgScale: 5,
      invokeScheduler: 'dpmpp_2m_k',
      requestedSeedPolicy: 'fixed',
      sampler: 'DPM++ 2M',
      scheduler: 'Karras',
      steps: 20,
    },
    size: native.size,
  }
  const legacyRows = compareRasterGenerationSettings(
    { ...source.data, generationConfiguration: legacy },
    source.current,
  ).flatMap((section) => section.rows)
  for (const key of ['sampling.sampler', 'sampling.scheduler', 'sampling.invokeScheduler']) {
    assert.equal(legacyRows.find((item) => item.key === key)?.status, 'Unavailable')
  }
  assert.equal(legacyRows.find((item) => item.key === 'sampling.animaMethod')?.after, 'Heun')
  source.current.generationDraft.model = legacy.model
  source.current.modelCatalog = [catalog(legacy.model)]
  assert.equal(result(source, 'sampling.animaMethod').status, 'Unavailable')
  assert.equal(result(source, 'anima.vae').status, 'Unavailable')
})
