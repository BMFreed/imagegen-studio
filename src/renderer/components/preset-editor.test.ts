import type { ModelCatalogItem } from '../../shared/api.js'
import type { PresetApplicationDiagnostic } from '../../shared/presets/preset-application.js'
import type { PresetRecord } from '../../shared/presets/preset-schema.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive } from 'vue'

import {
  type EditablePresetDefinition,
  emptyPresetDefinition,
  includePresetSection,
  presetDefinitionFromRecord,
  presetNeedsAttention,
  presetNumericInputValid,
  presetResourceReference,
  presetResourceReferences,
  presetUnavailableResources,
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

type AuthoringResource = NonNullable<PresetApplicationDiagnostic['resource']>

function authoringResource<K extends AuthoringResource['kind']>(kind: K, suffix = '') {
  return {
    baseModelFamily: 'illustrious' as const,
    civitaiFileId: 300,
    civitaiModelId: 100,
    civitaiVersionId: 200,
    displayName: `Saved ${kind}${suffix}`,
    fileSha256: 'a'.repeat(64),
    kind,
    localModelId: `${kind}${suffix}`,
    localVersionId: `exact${suffix}`,
    predictionType: kind === 'checkpoint' ? ('v_prediction' as const) : null,
    versionName: 'Exact version',
  }
}

function authoringCatalog(ref: AuthoringResource): ModelCatalogItem {
  const item = catalogFixture()[0]!
  Object.assign(item, {
    id: ref.localModelId,
    modelId: ref.civitaiModelId,
    resourceType: ref.kind,
  })
  Object.assign(item.versions[0]!, {
    baseModelFamily: ref.baseModelFamily,
    civitaiFileId: ref.civitaiFileId,
    civitaiVersionId: ref.civitaiVersionId,
    id: ref.localVersionId,
    predictionType: ref.predictionType,
    sha256: ref.fileSha256,
  })
  return item
}

test('authoring references retain every included resource location, disabled signed LoRAs and repeated sidecars', () => {
  const model = authoringResource('checkpoint')
  const vae = authoringResource('vae')
  const disabledLora = authoringResource('lora', '-disabled')
  const enabledLora = authoringResource('lora', '-enabled')
  const embedding = authoringResource('embedding')
  const draft = emptyPresetDefinition()
  draft.payload = {
    loras: [
      { enabled: false, resource: disabledLora, weight: -0.75 },
      { enabled: true, resource: enabledLora, weight: 0 },
    ],
    model,
    negativePrompt: { embeddingRefs: [{ resource: embedding, token: '<negative>' }], text: '' },
    prompt: {
      embeddingRefs: [
        { resource: embedding, token: '<first>' },
        { resource: embedding, token: '<second>' },
      ],
      text: '',
    },
    vae,
  }
  const before = JSON.stringify(draft)
  assert.deepEqual(presetResourceReferences(draft), [
    { resource: model, section: 'model' },
    { resource: vae, section: 'vae' },
    { resource: disabledLora, section: 'loras' },
    { resource: enabledLora, section: 'loras' },
    { resource: embedding, section: 'prompt' },
    { resource: embedding, section: 'prompt' },
    { resource: embedding, section: 'negativePrompt' },
  ])
  assert.equal(JSON.stringify(draft), before)
  assert.deepEqual(
    presetResourceReferences({
      payload: { loras: [], model: null, prompt: { embeddingRefs: [], text: '' }, vae: null },
    }),
    [],
    'unfinished model, Embedded VAE and empty stacks do not invent references',
  )
})

test('authoring unavailable references distinguish an unknown catalog from a loaded empty catalog', () => {
  const model = authoringResource('checkpoint')
  const draft = { payload: { model } }
  const before = JSON.stringify(draft)
  assert.deepEqual(presetUnavailableResources(draft, [], false), [])
  assert.equal(presetNeedsAttention(draft, [], false), false)
  assert.deepEqual(presetUnavailableResources(draft, [], true), [
    { resource: model, section: 'model' },
  ])
  assert.equal(presetNeedsAttention(draft, [], true), true)
  assert.deepEqual(presetUnavailableResources(draft, [authoringCatalog(model)], true), [])
  assert.equal(presetNeedsAttention(draft, [authoringCatalog(model)], true), false)
  assert.equal(JSON.stringify(draft), before)
})

test('authoring attention requires exact local, provider, SHA and family identity with a ready file', () => {
  const model = authoringResource('checkpoint')
  const draft = { payload: { model } }
  const cases: { change: (item: ModelCatalogItem) => void; label: string }[] = [
    {
      change: (item) => {
        item.id = 'same-file-other-model'
      },
      label: 'local model id',
    },
    {
      change: (item) => {
        item.resourceType = 'lora'
      },
      label: 'resource kind',
    },
    {
      change: (item) => {
        item.modelId = 101
      },
      label: 'provider model id',
    },
    {
      change: (item) => {
        item.versions[0]!.id = 'same-file-other-version'
      },
      label: 'local version id',
    },
    {
      change: (item) => {
        item.versions[0]!.civitaiVersionId = 201
      },
      label: 'provider version id',
    },
    {
      change: (item) => {
        item.versions[0]!.civitaiFileId = 301
      },
      label: 'provider file id',
    },
    {
      change: (item) => {
        item.versions[0]!.sha256 = 'c'.repeat(64)
      },
      label: 'SHA',
    },
    {
      change: (item) => {
        item.versions[0]!.baseModelFamily = 'anima'
      },
      label: 'family',
    },
    {
      change: (item) => {
        item.versions[0]!.fileStatus = 'missing'
      },
      label: 'missing file',
    },
    {
      change: (item) => {
        item.versions[0]!.fileStatus = 'corrupt'
      },
      label: 'corrupt file',
    },
    {
      change: (item) => {
        item.versions.shift()
      },
      label: 'ready default only',
    },
  ]
  for (const { change, label } of cases) {
    const item = authoringCatalog(model)
    change(item)
    const before = JSON.stringify({ draft, item })
    assert.deepEqual(
      presetUnavailableResources(draft, [item], true),
      [{ resource: model, section: 'model' }],
      label,
    )
    assert.equal(presetNeedsAttention(draft, [item], true), true, label)
    assert.equal(JSON.stringify({ draft, item }), before, label)
  }
  const renamed = authoringCatalog(model)
  renamed.name = 'Different display name'
  renamed.versions[0]!.name = 'Different display version'
  renamed.defaultVersionId = 'newer'
  assert.deepEqual(presetUnavailableResources(draft, [renamed], true), [])
  assert.equal(presetNeedsAttention(draft, [renamed], true), false)
})

test('authoring family attention covers all dependent references while an absent model supplies no family gate', () => {
  const model = {
    ...authoringResource('checkpoint'),
    baseModelFamily: 'anima' as const,
    predictionType: null,
  }
  const lora = authoringResource('lora')
  const vae = authoringResource('vae')
  const embedding = authoringResource('embedding')
  const draft = {
    payload: {
      loras: [{ enabled: false, resource: lora, weight: -0.5 }],
      model,
      negativePrompt: { embeddingRefs: [{ resource: embedding, token: '<negative>' }], text: '' },
      prompt: { embeddingRefs: [{ resource: embedding, token: '<positive>' }], text: '' },
      vae,
    },
  }
  const catalog = [model, lora, vae, embedding].map(authoringCatalog)
  assert.deepEqual(
    presetUnavailableResources(draft, catalog, true).map(({ section }) => section),
    ['vae', 'loras', 'prompt', 'negativePrompt'],
  )
  assert.equal(presetNeedsAttention(draft, catalog, true), true)
  const withoutModel = { payload: { ...draft.payload, model: undefined } }
  assert.deepEqual(presetUnavailableResources(withoutModel, catalog, true), [])
  assert.equal(presetNeedsAttention(withoutModel, catalog, true), false)
  const unknown = { ...authoringResource('checkpoint'), baseModelFamily: null }
  assert.deepEqual(
    presetUnavailableResources({ payload: { model: unknown } }, [authoringCatalog(unknown)], true),
    [{ resource: unknown, section: 'model' }],
    'a ready file with unknown family retains the existing attention result',
  )
})

test('resource projection stays available in unfinished Vue drafts without turning authoring attention into Apply admission', () => {
  const source = recordFixture()
  const draft: EditablePresetDefinition = reactive(presetDefinitionFromRecord(source))
  draft.name = ''
  draft.workflow = null
  draft.payload.guidance = { cfgScale: null, steps: null }
  draft.payload.size = { height: 1024, width: null }
  draft.payload.seed = { policy: 'fixed', value: null }
  const before = JSON.stringify({ draft, source })
  assert.equal(validatePresetDefinition(draft), null)
  assert.equal(presetUnavailableResources(draft, [], true).length, 1)
  assert.equal(presetNeedsAttention(draft, [], true), true)
  const item = catalogFixture()[0]!
  item.versions[0]!.dependencyIssues = ['missing companion']
  item.versions[0]!.predictionType = 'epsilon'
  assert.deepEqual(presetUnavailableResources(draft, [item], true), [])
  assert.equal(presetNeedsAttention(draft, [item], true), false)
  assert.equal(JSON.stringify({ draft, source }), before)
})
