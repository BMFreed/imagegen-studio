import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import type { ModelCatalogItem } from '../api.js'
import type { IgsIllustriousRasterGenerationProvenanceV1 } from './project-schema.js'

import { smartPatchVariantMetadataFixture } from '../../main/projects/test-fixtures/smart-patch-variant.js'
import {
  compareRasterGenerationSettings,
  compareSmartResultGenerationSettings,
  exactBoundComparisonVersion,
  type GenerationComparisonResourceAction,
  generationComparisonSideLabel,
  type GenerationSettingsComparisonCurrent,
  type GenerationSettingsComparisonRow,
  isRasterGenerationData,
  type RasterGenerationData,
} from './generation-settings-comparison.js'
import { createEmptyProjectDocumentV1 } from './project-schema.js'
import {
  isSmartResultComparisonData,
  type SmartResultComparisonData,
} from './smart-result-comparison.js'

type Resource = GenerationComparisonResourceAction['resource']
type Configuration = IgsIllustriousRasterGenerationProvenanceV1['generationConfiguration']

function resource(): Resource & { kind: 'checkpoint' }
function resource<K extends Resource['kind']>(
  kind: K,
  overrides?: Partial<Omit<Resource, 'kind'>>,
): Resource & { kind: K }
function resource(
  kind: Resource['kind'] = 'checkpoint',
  overrides: Partial<Omit<Resource, 'kind'>> = {},
): Resource {
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: 93,
    civitaiModelId: 91,
    civitaiVersionId: 92,
    displayName: 'Copied resource label',
    fileSha256: 'a'.repeat(64),
    kind,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: kind === 'checkpoint' ? 'epsilon' : null,
    versionName: 'Copied version label',
    ...overrides,
  }
}

function catalog(ref: Resource): ModelCatalogItem {
  return {
    author: null,
    defaultVersionId: ref.localVersionId,
    description: null,
    id: ref.localModelId,
    modelId: ref.civitaiModelId,
    name: ref.displayName,
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
        fileSizeBytes: 1234,
        fileStatus: 'ready',
        format: 'SafeTensor',
        id: ref.localVersionId,
        installedAt: '2026-11-13T10:00:00.000Z',
        name: ref.versionName,
        predictionType: ref.predictionType,
        sha256: ref.fileSha256,
        trainedWords: [],
      },
    ],
  }
}

function fixture() {
  const document = createEmptyProjectDocumentV1({ title: 'Comparison resources' })
  const configuration: Configuration = {
    loras: [],
    mode: 'txt2img',
    model: {
      ...resource(),
      baseModelFamily: 'illustrious',
      kind: 'checkpoint',
      predictionType: 'epsilon',
    },
    negativePrompt: { embeddingRefs: [], text: 'blur' },
    positivePrompt: { embeddingRefs: [], text: 'a lantern' },
    sampling: {
      actualSeed: 0,
      cfgScale: 7,
      invokeScheduler: 'euler',
      requestedSeedPolicy: 'fixed',
      sampler: 'Euler',
      scheduler: 'Normal',
      steps: 4,
    },
    size: { height: 64, width: 64 },
    vae: null,
  }
  Object.assign(document.generationDraft, {
    model: structuredClone(configuration.model),
    negativePrompt: structuredClone(configuration.negativePrompt),
    positivePrompt: structuredClone(configuration.positivePrompt),
  })
  const data: Omit<RasterGenerationData, 'generationConfiguration'> & {
    generationConfiguration: Configuration
  } = {
    currentMode: 'txt2img',
    documentId: document.documentId,
    generationConfiguration: configuration,
    layerId: randomUUID(),
    modeUnavailableReason: null,
  }
  const current: GenerationSettingsComparisonCurrent = {
    bbox: configuration.size,
    generationDraft: document.generationDraft,
    modelCatalog: [catalog(configuration.model)],
    modelCatalogError: null,
    reuseSeed: null,
  }
  assert.ok(isRasterGenerationData(data), 'The fixture crosses the existing strict DTO guard.')
  return { current, data }
}

function rows(source: ReturnType<typeof fixture>) {
  return compareRasterGenerationSettings(source.data, source.current).flatMap(
    (section) => section.rows,
  )
}

function result(source: ReturnType<typeof fixture>, key: string): GenerationSettingsComparisonRow {
  const found = rows(source).find((row) => row.key === key)
  assert.ok(found, `The projection exposes ${key}.`)
  return found
}

test('available references omit action metadata while retaining portable equality across label changes', () => {
  const source = fixture()
  source.current.generationDraft.model!.displayName = 'Renamed current resource'
  assert.equal(result(source, 'model.resource').status, 'Same')
  assert.ok(rows(source).every((row) => !('resourceActions' in row)))
  assert.equal(generationComparisonSideLabel('generated'), 'Generated with')
  assert.equal(generationComparisonSideLabel('current'), 'Current Canvas')
})

test('a mixed model row offers only its missing generated or current reference', () => {
  for (const missingSide of ['generated', 'current'] as const) {
    const source = fixture()
    const authored = resource('checkpoint', { fileSha256: 'b'.repeat(64) })
    source.current.generationDraft.model = authored
    source.current.modelCatalog = [
      catalog(missingSide === 'generated' ? authored : source.data.generationConfiguration.model),
    ]
    const row = result(source, 'model.resource')
    assert.equal(row.status, 'Missing resource')
    assert.deepEqual(
      row.resourceActions?.map((action) => action.side),
      [missingSide],
    )
    assert.deepEqual(
      row.resourceActions?.[0]?.resource,
      missingSide === 'generated' ? source.data.generationConfiguration.model : authored,
    )
    assert.equal('resourceActions' in result(source, 'model.predictionType'), false)
  }
})

test('the shared exact resolver ignores defaults and refuses a portable match under different local bindings', () => {
  const source = fixture()
  const ref = source.data.generationConfiguration.model
  const installed = source.current.modelCatalog![0]
  const exact = installed.versions[0]
  const other = { ...exact, id: randomUUID(), sha256: 'b'.repeat(64) }
  installed.versions.unshift(other)
  installed.defaultVersionId = other.id
  assert.equal(exactBoundComparisonVersion(ref, [installed]), exact)
  assert.equal('resourceActions' in result(source, 'model.resource'), false)
  source.current.generationDraft.model = { ...ref, localVersionId: randomUUID() }
  assert.equal(exactBoundComparisonVersion(source.current.generationDraft.model, [installed]), null)
  assert.deepEqual(
    result(source, 'model.resource').resourceActions?.map((action) => action.side),
    ['current'],
  )
})

test('missing exact tuple fields and file readiness drive the same resolver and row action', () => {
  const source = fixture()
  const ref = source.data.generationConfiguration.model
  const installed = source.current.modelCatalog![0]
  for (const change of [
    { baseModelFamily: 'anima' as const },
    { civitaiFileId: 999 },
    { civitaiVersionId: 999 },
    { fileStatus: 'missing' as const },
    { fileStatus: 'corrupt' as const },
    { sha256: 'b'.repeat(64) },
  ]) {
    const changed = structuredClone(installed)
    Object.assign(changed.versions[0], change)
    source.current.modelCatalog = [changed]
    assert.equal(exactBoundComparisonVersion(ref, [changed]), null, JSON.stringify(change))
    assert.deepEqual(
      result(source, 'model.resource').resourceActions?.map((action) => action.side),
      ['generated', 'current'],
    )
  }
})

test('unknown catalog states enumerate known refs without inventing a missing current selection', () => {
  for (const error of [null, 'Catalog read failed']) {
    const source = fixture()
    source.current.modelCatalog = error ? source.current.modelCatalog : null
    source.current.modelCatalogError = error
    const actions = result(source, 'model.resource').resourceActions!
    assert.deepEqual(
      actions.map(({ availability, side }) => [availability, side]),
      [
        ['Unavailable', 'generated'],
        ['Unavailable', 'current'],
      ],
    )
    assert.notEqual(actions[0].actionKey, actions[1].actionKey)
    source.current.generationDraft.model = null
    assert.deepEqual(
      result(source, 'model.resource').resourceActions?.map((action) => action.side),
      ['generated'],
    )
  }
})

test('identical labels retain distinct exact file and binding actions, stable through renaming', () => {
  const source = fixture()
  source.current.generationDraft.model = {
    ...source.data.generationConfiguration.model,
    fileSha256: 'b'.repeat(64),
    localVersionId: randomUUID(),
  }
  source.current.modelCatalog = []
  const first = result(source, 'model.resource').resourceActions!
  assert.equal(first.length, 2)
  assert.notEqual(first[0].actionKey, first[1].actionKey)
  assert.notEqual(first[0].resource.fileSha256, first[1].resource.fileSha256)
  source.data.generationConfiguration.model.displayName = 'Renamed saved copy'
  source.current.generationDraft.model.versionName = 'Renamed current version'
  assert.deepEqual(
    result(source, 'model.resource').resourceActions?.map((action) => action.actionKey),
    first.map((action) => action.actionKey),
  )
  assert.equal(first[0].resource.displayName, 'Copied resource label')
  assert.equal(first[1].resource.versionName, 'Copied version label')
  const authored = { ...source.current.generationDraft.model }
  for (const change of [
    { baseModelFamily: null },
    { civitaiFileId: 999 },
    { civitaiModelId: 999 },
    { civitaiVersionId: 999 },
    { fileSha256: 'c'.repeat(64) },
    { localModelId: randomUUID() },
    { localVersionId: randomUUID() },
  ]) {
    source.current.generationDraft.model = { ...authored, ...change }
    const changed = result(source, 'model.resource').resourceActions!
    assert.equal(changed[0].actionKey, first[0].actionKey)
    assert.notEqual(changed[1].actionKey, first[1].actionKey, JSON.stringify(change))
  }
})

test('enabled zero and signed LoRAs deduplicate browse actions without losing stack order or disabled text', () => {
  const source = fixture()
  const lora = resource('lora')
  const disabled = resource('lora', { displayName: 'Disabled neighbor' })
  source.data.generationConfiguration.loras = [
    { enabled: true, resource: lora, weight: -0.5 },
    { enabled: false, resource: disabled, weight: -0.25 },
    { enabled: true, resource: lora, weight: 0 },
  ]
  source.current.generationDraft.loras = [
    { enabled: true, resource: structuredClone(lora), weight: 0.75 },
    { enabled: true, resource: structuredClone(lora), weight: 0 },
  ]
  assert.ok(isRasterGenerationData(source.data))
  const row = result(source, 'loras.stack')
  assert.deepEqual(
    row.resourceActions?.map((action) => action.side),
    ['generated', 'current'],
  )
  assert.ok(
    row.resourceActions?.every((action) => action.resource.localModelId === lora.localModelId),
  )
  assert.match(
    row.before,
    /Weight -0\.5[\s\S]*Disabled neighbor[\s\S]*Weight -0\.25[\s\S]*Weight 0/,
  )
  assert.match(row.after, /Weight 0\.75[\s\S]*Weight 0/)
  source.current.modelCatalog!.push(catalog(lora))
  assert.equal(result(source, 'loras.stack').status, 'Changed')
  assert.equal('resourceActions' in result(source, 'loras.stack'), false)
  const disabledOnly = [{ enabled: false, resource: disabled, weight: 0 }]
  source.data.generationConfiguration.loras = disabledOnly
  source.current.generationDraft.loras = structuredClone(disabledOnly)
  source.current.modelCatalog = null
  assert.equal(result(source, 'loras.stack').status, 'Same')
  assert.equal('resourceActions' in result(source, 'loras.stack'), false)
})

test('legacy omitted LoRA and VAE rows have no new availability gate for authored resources', () => {
  const source = fixture()
  delete source.data.generationConfiguration.loras
  delete source.data.generationConfiguration.vae
  source.current.generationDraft.loras = [{ enabled: true, resource: resource('lora'), weight: 1 }]
  source.current.generationDraft.vae = resource('vae')
  source.current.modelCatalog = null
  for (const key of ['loras.stack', 'vae.resource']) {
    assert.equal(result(source, key).status, 'Unavailable')
    assert.equal('resourceActions' in result(source, key), false)
  }
})

test('VAE actions name external refs only and respect Embedded and unsupported current family boundaries', () => {
  const source = fixture()
  source.current.modelCatalog = null
  assert.equal('resourceActions' in result(source, 'vae.resource'), false)
  const vae = {
    ...resource('vae'),
    baseModelFamily: 'illustrious' as const,
    kind: 'vae' as const,
    predictionType: null,
  }
  source.data.generationConfiguration.vae = vae
  assert.deepEqual(
    result(source, 'vae.resource').resourceActions?.map((action) => action.side),
    ['generated'],
  )
  source.data.generationConfiguration.vae = null
  source.current.generationDraft.vae = vae
  assert.deepEqual(
    result(source, 'vae.resource').resourceActions?.map((action) => action.side),
    ['current'],
  )
  source.data.generationConfiguration.vae = vae
  source.current.generationDraft.model!.baseModelFamily = 'anima'
  assert.equal('resourceActions' in result(source, 'vae.resource'), false)
})

test('embedding actions preserve polarity and side while deduplicating only within each row', () => {
  const source = fixture()
  const embedding = { ...resource('embedding'), kind: 'embedding' as const }
  source.data.generationConfiguration.positivePrompt = {
    embeddingRefs: [
      { resource: embedding, token: '<first>' },
      { resource: embedding, token: '<second>' },
    ],
    text: '<first> <second>',
  }
  source.data.generationConfiguration.negativePrompt = {
    embeddingRefs: [{ resource: embedding, token: '<negative>' }],
    text: '<negative>',
  }
  source.current.generationDraft.positivePrompt = structuredClone(
    source.data.generationConfiguration.positivePrompt,
  )
  source.current.generationDraft.negativePrompt = structuredClone(
    source.data.generationConfiguration.negativePrompt,
  )
  assert.ok(isRasterGenerationData(source.data))
  const positive = result(source, 'prompt.embeddings')
  const negative = result(source, 'negativePrompt.embeddings')
  assert.deepEqual(
    positive.resourceActions?.map((action) => action.side),
    ['generated', 'current'],
  )
  assert.deepEqual(
    negative.resourceActions?.map((action) => action.side),
    ['generated', 'current'],
  )
  assert.equal(
    new Set(
      [...positive.resourceActions, ...negative.resourceActions].map((action) => action.actionKey),
    ).size,
    4,
  )
  assert.match(positive.before, /<first>[\s\S]*<second>/)
  assert.match(negative.before, /<negative>/)
  assert.equal('resourceActions' in result(source, 'prompt.text'), false)
})

test('proxy-backed inputs produce detached metadata without mutating frozen or current resources', () => {
  const source = fixture()
  source.current.modelCatalog = null
  const snapshot = JSON.stringify(source)
  source.data.generationConfiguration.model = new Proxy(
    source.data.generationConfiguration.model,
    {},
  )
  source.current.generationDraft.model = new Proxy(source.current.generationDraft.model!, {})
  const actions = result(source, 'model.resource').resourceActions!
  assert.equal(JSON.stringify(source), snapshot)
  assert.notEqual(actions[0].resource, source.data.generationConfiguration.model)
  assert.notEqual(actions[1].resource, source.current.generationDraft.model)
  actions[0].resource.displayName = 'Changed detached metadata'
  actions[1].resource.fileSha256 = 'f'.repeat(64)
  assert.equal(JSON.stringify(source), snapshot)
})

test('Smart and Raster resource rows agree, while Anima companion snapshots never create browse refs', () => {
  const source = fixture()
  source.current.modelCatalog = null
  const { size, ...configuration } = source.data.generationConfiguration
  assert.deepEqual(size, source.current.bbox)
  const smart: SmartResultComparisonData = {
    assetSha256: 'd'.repeat(64),
    currentMode: 'txt2img',
    documentId: source.data.documentId,
    documentRevision: randomUUID(),
    generationConfiguration: { ...configuration, loras: configuration.loras ?? [] },
    modeUnavailableReason: null,
    owner: { kind: 'raster', layerId: source.data.layerId },
    resultId: source.data.layerId,
  }
  assert.ok(isSmartResultComparisonData(smart))
  const smartRows = compareSmartResultGenerationSettings(smart, source.current).flatMap(
    (section) => section.rows,
  )
  assert.deepEqual(
    smartRows.find((row) => row.key === 'model.resource'),
    result(source, 'model.resource'),
  )
  const anima = smartPatchVariantMetadataFixture('anima').generationProvenance
  smart.generationConfiguration = anima.generationConfiguration
  source.current.generationDraft = anima.layerSourceContext.generationDraft
  assert.ok(isSmartResultComparisonData(smart))
  const animaRows = compareSmartResultGenerationSettings(smart, source.current).flatMap(
    (section) => section.rows,
  )
  assert.deepEqual(
    animaRows.filter((row) => row.resourceActions).map((row) => row.key),
    ['model.resource'],
  )
  assert.equal(animaRows.find((row) => row.key === 'anima.vae')?.status, 'Unavailable')
})
