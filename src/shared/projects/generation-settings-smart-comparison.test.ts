import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import type { AnimaModelBundleView, ModelCatalogItem } from '../api.js'

import { smartPatchVariantMetadataFixture } from '../../main/projects/test-fixtures/smart-patch-variant.js'
import { ANIMA_SAMPLING_METHOD_KEYS } from './anima-sampling-method.js'
import {
  compareRasterGenerationSettings,
  compareSmartResultGenerationSettings,
  type GenerationSettingsComparisonCurrent,
  isRasterGenerationData,
} from './generation-settings-comparison.js'
import { defaultIllustriousNoiseProfile } from './illustrious-noise-profile.js'
import { createEmptyProjectDocumentV1 } from './project-schema.js'
import {
  isSmartResultComparisonData,
  type SmartResultComparisonData,
} from './smart-result-comparison.js'

type Family = 'anima' | 'illustrious'
type Mode = 'img2img' | 'inpaint' | 'outpaint' | 'txt2img'
type Resource = NonNullable<GenerationSettingsComparisonCurrent['generationDraft']['model']>

function catalog(model: Resource, bundle?: AnimaModelBundleView): ModelCatalogItem {
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
        ...(model.baseModelFamily === 'illustrious' && model.kind === 'checkpoint'
          ? {
              noiseProfile: {
                effective: defaultIllustriousNoiseProfile(),
                rescaleBetasZeroSnrSource: 'assumed' as const,
                timestepSpacingSource: 'assumed' as const,
              },
            }
          : {}),
      },
    ],
  }
}

function fixture(family: Family, mode: Mode = 'inpaint', converted = false) {
  const source = smartPatchVariantMetadataFixture(family)
  const config = source.generationProvenance.generationConfiguration
  Reflect.set(config, 'mode', mode)
  if (mode === 'txt2img') {
    Reflect.deleteProperty(config.sampling, 'denoisingStrength')
  } else {
    Reflect.set(config.sampling, 'denoisingStrength', 0)
  }
  config.sampling.seedBehavior = 'per-prompt'
  config.positivePrompt.text = '(lantern:1.5), concrete accepted choice'
  config.negativePrompt.text = '(blur:-0.5), concrete negative'
  const lora = {
    ...config.model,
    fileSha256: '7'.repeat(64),
    kind: 'lora',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: null,
  } satisfies Resource
  config.loras = [
    { enabled: true, resource: lora, weight: -0.5 },
    {
      enabled: false,
      resource: {
        ...lora,
        baseModelFamily: null,
        fileSha256: '8'.repeat(64),
        localModelId: randomUUID(),
        localVersionId: randomUUID(),
      },
      weight: 0,
    },
  ]
  let bundle: AnimaModelBundleView | undefined
  const resources: Resource[] = [config.model, lora]
  if ('anima' in config) {
    bundle = {
      ...structuredClone(config.anima),
      qwen3Encoder: {
        ...config.anima.qwen3Encoder,
        localModelId: randomUUID(),
        localVersionId: randomUUID(),
      },
      vae: { ...config.anima.vae, localModelId: randomUUID(), localVersionId: randomUUID() },
    }
  } else {
    config.sampling.noiseProfile = defaultIllustriousNoiseProfile()
    const embedding = {
      ...config.model,
      fileSha256: '6'.repeat(64),
      kind: 'embedding',
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: null,
    } satisfies Resource
    resources.push(embedding)
    config.positivePrompt = {
      embeddingRefs: [{ resource: embedding, token: '<positive>' }],
      text: '<positive>, frozen concrete prompt',
    }
    config.negativePrompt = {
      embeddingRefs: [{ resource: embedding, token: '<negative>' }],
      text: '<negative>, frozen concrete negative',
    }
  }
  const document = createEmptyProjectDocumentV1({ title: 'Smart settings comparison' })
  document.generationDraft = structuredClone(
    source.generationProvenance.layerSourceContext.generationDraft,
  )
  Object.assign(document.generationDraft, {
    loras: structuredClone(config.loras),
    model: structuredClone(config.model),
    negativePrompt: structuredClone(config.negativePrompt),
    positivePrompt: structuredClone(config.positivePrompt),
  })
  document.generationDraft.sampling.denoisingStrength = mode === 'txt2img' ? null : 0
  const data: SmartResultComparisonData = {
    assetSha256: source.asset.sha256,
    currentMode: mode === 'txt2img' ? 'txt2img' : 'img2img',
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationConfiguration: config,
    modeUnavailableReason: null,
    owner: converted
      ? { kind: 'raster', layerId: source.id }
      : { kind: 'smart-patch-variant', layerId: randomUUID(), variantId: source.id },
    resultId: source.id,
  }
  const current: GenerationSettingsComparisonCurrent = {
    bbox: { height: 321, width: 765 },
    generationDraft: document.generationDraft,
    modelCatalog: resources.map((resource) =>
      catalog(resource, resource.kind === 'checkpoint' ? bundle : undefined),
    ),
    modelCatalogError: null,
    reuseSeed: null,
  }
  assert.ok(isSmartResultComparisonData(data), 'Fixture crosses the strict portable Smart guard.')
  return { current, data }
}

function item(source: ReturnType<typeof fixture>, key: string) {
  const row = compareSmartResultGenerationSettings(source.data, source.current)
    .flatMap((section) => section.rows)
    .find((row) => row.key === key)
  assert.ok(row, `comparison exposes ${key}`)
  return row
}

for (const family of ['illustrious', 'anima'] as const) {
  for (const mode of ['txt2img', 'img2img', 'inpaint', 'outpaint'] as const) {
    for (const converted of [false, true]) {
      test(`${family} ${mode} converted=${converted}: concrete portable settings compare with Project draft and omit the entire Size section`, () => {
        const source = fixture(family, mode, converted)
        const before = structuredClone(source)
        const sections = compareSmartResultGenerationSettings(source.data, source.current)
        assert.equal(
          sections.some((section) => /size|region|geometry|source|execution/i.test(section.key)),
          false,
        )
        assert.equal(JSON.stringify(sections).includes('Internal Size'), false)
        assert.equal(
          new Set(sections.flatMap((section) => section.rows.map((row) => row.key))).size,
          sections.flatMap((section) => section.rows).length,
        )
        for (const key of [
          'prompt.text',
          'negativePrompt.text',
          'model.resource',
          'loras.stack',
          'guidance.steps',
          'guidance.cfg',
          'seed.actual',
          'seed.policy',
          'seed.behavior',
          'cfgRescale.value',
          'vaePrecision.value',
        ]) {
          assert.equal(item(source, key).status, 'Same', key)
        }
        assert.equal(item(source, 'seed.actual').before, '0')
        const renderedLoras = item(source, 'loras.stack').before.split(
          /\n(?=Enabled · |Disabled · )/,
        )
        const configuredLoras = source.data.generationConfiguration.loras
        assert.ok(configuredLoras)
        assert.equal(renderedLoras.length, configuredLoras.length)
        for (const [index, lora] of configuredLoras.entries()) {
          const rendered = renderedLoras[index]
          assert.ok(rendered)
          assert.ok(rendered.startsWith(`${lora.enabled ? 'Enabled' : 'Disabled'} · `))
          assert.ok(rendered.includes(`SHA-256 ${lora.resource.fileSha256}`))
          assert.ok(rendered.endsWith(` · Weight ${lora.weight}`))
        }
        assert.equal(item(source, 'context.mode').before, mode)
        assert.equal(
          item(source, 'context.mode').status,
          mode === 'inpaint' || mode === 'outpaint' ? 'Changed' : 'Same',
        )
        assert.equal(
          item(source, 'denoisingStrength.value').status,
          mode === 'txt2img' ? 'Unavailable' : 'Same',
        )
        if (family === 'anima') {
          assert.equal(item(source, 'anima.qwen3Encoder').status, 'Same')
          assert.equal(item(source, 'anima.vae').status, 'Same')
          assert.equal(item(source, 'sampling.animaMethod').status, 'Same')
          const sampling = sections.find((section) => section.key === 'sampling')
          assert.ok(sampling)
          assert.equal(sampling.label, 'Anima Sampling')
          assert.deepEqual(
            sampling.rows.map((row) => row.key),
            ['sampling.animaMethod'],
          )
        } else {
          assert.equal(item(source, 'prompt.embeddings').status, 'Same')
          assert.equal(item(source, 'negativePrompt.embeddings').status, 'Same')
          assert.equal(item(source, 'sampling.invokeScheduler').status, 'Same')
          assert.equal(item(source, 'vae.resource').status, 'Same')
        }
        assert.deepEqual(source, before)
        source.current.generationDraft.positivePrompt.text = '{authored|unexpanded} current Canvas'
        assert.equal(item(source, 'prompt.text').status, 'Changed')
        assert.equal(
          item(source, 'prompt.text').before,
          before.data.generationConfiguration.positivePrompt.text,
        )
      })
    }
  }
}

test('Smart optional absence stays Unavailable while explicit empty stack, zero, Embedded and Auto remain recorded', () => {
  for (const family of ['illustrious', 'anima'] as const) {
    const source = fixture(family)
    const config = source.data.generationConfiguration
    Reflect.deleteProperty(config, 'cfgRescale')
    Reflect.deleteProperty(config, 'vaePrecision')
    Reflect.deleteProperty(config.sampling, 'seedBehavior')
    if (!('anima' in config)) {
      Reflect.deleteProperty(config, 'loras')
      Reflect.deleteProperty(config, 'vae')
      assert.equal(item(source, 'loras.stack').status, 'Unavailable')
      assert.equal(item(source, 'vae.resource').status, 'Unavailable')
      config.vae = null
      config.loras = []
      source.current.generationDraft.loras = []
      assert.equal(item(source, 'vae.resource').status, 'Same')
      assert.equal(item(source, 'loras.stack').status, 'Same')
    }
    for (const key of ['cfgRescale.value', 'vaePrecision.value', 'seed.behavior']) {
      assert.equal(item(source, key).status, 'Unavailable')
      assert.match(item(source, key).before, /Unavailable in saved generation data/)
    }
    config.cfgRescale = 0
    config.vaePrecision = 'Auto'
    assert.equal(item(source, 'cfgRescale.value').status, 'Same')
    assert.equal(item(source, 'vaePrecision.value').status, 'Same')
    source.data.currentMode = null
    source.data.modeUnavailableReason = 'CPU pixels unavailable'
    assert.equal(item(source, 'context.mode').status, 'Unavailable')
    assert.equal(item(source, 'context.mode').after, 'CPU pixels unavailable')
    assert.equal(item(source, 'denoisingStrength.value').status, 'Unavailable')
    assert.equal(item(source, 'prompt.text').status, 'Same')
    source.current.generationDraft.seed = { policy: 'random', value: null }
    assert.equal(item(source, 'seed.actual').status, 'Unavailable')
    assert.match(item(source, 'seed.actual').after, /Assigned when/)
    source.current.generationDraft.seed = { policy: 'reuse', value: null }
    source.current.reuseSeed = 0
    assert.equal(item(source, 'seed.actual').status, 'Same')
    source.current.reuseSeed = null
    assert.equal(item(source, 'seed.actual').status, 'Unavailable')
    source.current.generationDraft.sampling.denoisingStrength = null
    source.data.currentMode = 'img2img'
    source.data.modeUnavailableReason = null
    assert.equal(item(source, 'denoisingStrength.value').status, 'Unavailable')
  }
})

test('Smart exact resources, concrete embedding sidecars and ordered enabled/weighted LoRAs retain independent identities', () => {
  const source = fixture('illustrious')
  const original = structuredClone(source)
  source.current.generationDraft.loras.reverse()
  assert.equal(item(source, 'loras.stack').status, 'Changed')
  source.current.generationDraft.loras = structuredClone(original.current.generationDraft.loras)
  source.current.generationDraft.loras[0].weight = 0
  assert.equal(item(source, 'loras.stack').status, 'Changed')
  source.current.generationDraft.loras[0].weight = -0.5
  source.current.generationDraft.loras[0].enabled = false
  assert.equal(item(source, 'loras.stack').status, 'Changed')
  source.current.generationDraft.positivePrompt.embeddingRefs = []
  assert.equal(item(source, 'prompt.embeddings').status, 'Removed')
  source.current.generationDraft.positivePrompt.embeddingRefs = structuredClone(
    original.current.generationDraft.positivePrompt.embeddingRefs,
  )
  source.current.generationDraft.positivePrompt.embeddingRefs[0].resource.fileSha256 = '0'.repeat(
    64,
  )
  assert.equal(item(source, 'prompt.embeddings').status, 'Missing resource')
  const renamed = {
    ...source.data.generationConfiguration.model,
    displayName: 'Local alias',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
  }
  source.current.modelCatalog!.push(catalog(renamed))
  source.current.generationDraft.model = renamed
  assert.equal(item(source, 'model.resource').status, 'Same')
  source.current.modelCatalog = [catalog(renamed)]
  assert.equal(
    item(source, 'model.resource').status,
    'Missing resource',
    'Portable equality is not an installed original local binding.',
  )
  source.current.modelCatalog = null
  assert.equal(item(source, 'model.resource').status, 'Unavailable')
  assert.equal(item(source, 'prompt.text').status, 'Same')
})

test('Smart Anima byte identities use qualified bundles without weakening ordinary companion local binding checks', () => {
  const source = fixture('anima', 'txt2img')
  const config = source.data.generationConfiguration
  assert.ok('anima' in config)
  const version = source.current.modelCatalog![0].versions[0]
  const bundle = version.anima!
  assert.equal(item(source, 'anima.qwen3Encoder').status, 'Same')
  bundle.qwen3Encoder.localModelId = randomUUID()
  bundle.qwen3Encoder.localVersionId = randomUUID()
  assert.equal(
    item(source, 'anima.qwen3Encoder').status,
    'Same',
    'Smart stored only the component bytes, never these local UUIDs.',
  )
  const ordinary = {
    currentMode: 'txt2img',
    documentId: source.data.documentId,
    generationConfiguration: {
      ...config,
      anima: structuredClone(bundle),
      size: { height: 64, width: 64 },
    },
    layerId: source.data.resultId,
    modeUnavailableReason: null,
  }
  assert.ok(isRasterGenerationData(ordinary))
  const ordinaryRows = () =>
    compareRasterGenerationSettings(ordinary, source.current).flatMap((section) => section.rows)
  assert.equal(ordinaryRows().find((row) => row.key === 'anima.qwen3Encoder')!.status, 'Same')
  ordinary.generationConfiguration.anima.qwen3Encoder.localVersionId = randomUUID()
  assert.equal(
    ordinaryRows().find((row) => row.key === 'anima.qwen3Encoder')!.status,
    'Unavailable',
  )
  assert.ok(
    compareRasterGenerationSettings(ordinary, source.current).some(
      (section) => section.key === 'size',
    ),
  )
  const before = structuredClone(source)
  for (const change of [
    'hash',
    'bytes',
    'checkpoint',
    'qualification',
    'family',
    'external-vae',
  ] as const) {
    const changed = structuredClone(before)
    const changedVersion = changed.current.modelCatalog![0].versions[0]
    if (change === 'hash') {
      changedVersion.anima!.qwen3Encoder.sha256 = '0'.repeat(64)
    }
    if (change === 'bytes') {
      changedVersion.anima!.qwen3Encoder.byteSize++
    }
    if (change === 'checkpoint') {
      changedVersion.anima!.checkpointByteSize++
      changedVersion.fileSizeBytes++
    }
    if (change === 'qualification') {
      changedVersion.dependencyIssues.push('Missing pinned companion')
    }
    if (change === 'family') {
      changed.current.generationDraft.model!.baseModelFamily = 'illustrious'
    }
    if (change === 'external-vae') {
      changed.current.generationDraft.vae = { ...config.model, kind: 'vae', predictionType: null }
    }
    assert.equal(
      item(changed, change === 'external-vae' ? 'anima.vae' : 'anima.qwen3Encoder').status,
      'Unavailable',
      change,
    )
  }
})

test('Smart native methods and cross-family drafts preserve applicability and ordinary transport refuses Smart configurations', () => {
  const source = fixture('anima')
  const config = source.data.generationConfiguration
  assert.ok('anima' in config)
  for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
    config.sampling.animaMethod = method
    source.current.generationDraft.sampling.animaMethod = method
    assert.equal(item(source, 'sampling.animaMethod').status, 'Same')
  }
  source.current.generationDraft.model!.baseModelFamily = 'illustrious'
  assert.equal(item(source, 'sampling.animaMethod').status, 'Unavailable')
  assert.equal(item(source, 'anima.vae').status, 'Unavailable')
  const sd = fixture('illustrious')
  sd.current.generationDraft.model!.baseModelFamily = 'anima'
  assert.equal(item(sd, 'sampling.sampler').status, 'Unavailable')
  assert.equal(item(sd, 'sampling.scheduler').status, 'Unavailable')
  assert.equal(item(sd, 'vae.resource').status, 'Unavailable')
  assert.equal(item(sd, 'cfgRescale.value').status, 'Unavailable')
  sd.current.generationDraft.model = null
  assert.equal(item(sd, 'sampling.invokeScheduler').status, 'Unavailable')
  assert.equal(item(sd, 'model.resource').status, 'Removed')
  for (const entry of [source, sd]) {
    assert.equal(
      isRasterGenerationData({
        currentMode: entry.data.currentMode,
        documentId: entry.data.documentId,
        generationConfiguration: entry.data.generationConfiguration,
        layerId: entry.data.resultId,
        modeUnavailableReason: null,
      }),
      false,
    )
  }
})
