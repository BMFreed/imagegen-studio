import type { ModelCatalogItem } from '../../shared/api.js'
import type {
  PresetApplicationDiagnostic,
  PresetApplicationTarget,
} from '../../shared/presets/preset-application.js'
import {
  parsePresetApplicationPayload,
  presetApplicationDiagnostics,
} from '../../shared/presets/preset-application.js'
import type {
  PresetPayload,
  PresetRecord,
  PresetSectionKey,
} from '../../shared/presets/preset-schema.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive } from 'vue'

import {
  emptyNewProjectPresetState,
  newProjectCreateRequest,
  selectNewProjectPreset,
  setNewProjectPresetSection,
} from './new-project-preset-draft.js'
import {
  type EditablePresetDefinition,
  emptyPresetDefinition,
  presetNeedsAttention,
  validatePresetDefinition,
} from './preset-editor.js'
import {
  newProjectPresetModelRows,
  presetDiagnosticModelFocus,
  presetDiagnosticModelRows,
  presetManagerModelRows,
} from './preset-model-handoff.js'

type Resource = NonNullable<PresetApplicationDiagnostic['resource']>

function resource<K extends Resource['kind']>(kind: K, suffix = ''): Resource & { kind: K } {
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: 33,
    civitaiModelId: 11,
    civitaiVersionId: 22,
    displayName: `Saved ${kind}${suffix}`,
    fileSha256: 'a'.repeat(64),
    kind,
    localModelId: `${kind}-local${suffix}`,
    localVersionId: `${kind}-exact${suffix}`,
    predictionType: kind === 'checkpoint' ? 'epsilon' : null,
    versionName: 'Version B',
  }
}

function current(): PresetApplicationTarget {
  const value = createEmptyProjectDocumentV1({
    documentId: '2b20fc16-d844-4084-b219-3f5651e48926',
    documentRevision: 'af1cf765-859c-4e15-9c56-5dc19a04d6e7',
    primaryBbox: { height: 1024, width: 1024, x: 0, y: 0 },
    title: 'Target project',
  })
  value.generationDraft.model = resource('checkpoint', '-current')
  return value
}

function catalogItem(ref: Resource): ModelCatalogItem {
  return {
    author: null,
    defaultVersionId: 'default-version-A',
    description: null,
    id: ref.localModelId,
    modelId: ref.civitaiModelId,
    name: 'Renamed library model',
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
        installedAt: '2026-10-14T10:00:00.000Z',
        name: 'Renamed library version B',
        predictionType: ref.predictionType,
        sha256: ref.fileSha256,
        trainedWords: [],
      },
    ],
  }
}

function missingPayload(): PresetPayload {
  return {
    loras: [{ enabled: false, resource: resource('lora'), weight: -0.5 }],
    model: resource('checkpoint'),
    negativePrompt: {
      embeddingRefs: [{ resource: resource('embedding', '-negative'), token: '<negative>' }],
      text: '<negative>',
    },
    prompt: {
      embeddingRefs: [{ resource: resource('embedding', '-positive'), token: '<positive>' }],
      text: '<positive>',
    },
    vae: resource('vae'),
  }
}

function sourcePresetRecord(payload: PresetPayload = missingPayload()): PresetRecord {
  return {
    deletedAt: null,
    description: 'Saved source description',
    expiresAt: null,
    favorite: false,
    id: '11111111-1111-4111-8111-111111111111',
    name: 'New Project source',
    payload: {
      guidance: { cfgScale: 5, steps: 28 },
      seed: { policy: 'fixed', value: 0 },
      size: { height: 896, width: 1536 },
      ...payload,
    },
    tags: ['portrait'],
    updatedAt: '2026-11-13T00:00:00.000Z',
    workflow: 'textToImage',
  }
}

test('real missing diagnostics route every selected checkpoint, LoRA, prompt sidecar and VAE to its exact version', () => {
  const payload = missingPayload()
  const target = current()
  const before = structuredClone({ payload, target })
  const diagnostics = presetApplicationDiagnostics({
    catalog: [],
    current: target,
    payload,
    selectedSections: ['model', 'loras', 'prompt', 'negativePrompt', 'vae'],
  })
  assert.equal(diagnostics.length, 5)
  assert.ok(diagnostics.every((item) => item.code === 'RESOURCE_MISSING'))
  assert.deepEqual(
    diagnostics.map(presetDiagnosticModelFocus),
    [
      ['checkpoint', ''],
      ['lora', ''],
      ['embedding', '-positive'],
      ['embedding', '-negative'],
      ['vae', ''],
    ].map(([kind, suffix]) => ({
      expectedResource: resource(kind as Resource['kind'], suffix),
      origin: 'preset',
      resource: {
        resourceId: `${kind}-local${suffix}`,
        resourceName: `Saved ${kind}${suffix}`,
        versionId: `${kind}-exact${suffix}`,
        versionName: 'Version B',
      },
      resourceType: kind,
    })),
  )
  assert.deepEqual({ payload, target }, before)
})

test('handoff reads the selected edited diagnostic reference instead of the saved source or library default', () => {
  const source = missingPayload()
  const edited = structuredClone(source)
  edited.loras![0].resource = resource('lora', '-edited')
  // An unfinished unchecked section must not hide the selected resource action.
  const canonical = parsePresetApplicationPayload({ ...edited, guidance: null }, ['loras'])
  const diagnostics = presetApplicationDiagnostics({
    catalog: [],
    current: current(),
    payload: canonical,
    selectedSections: ['loras'],
  })
  assert.equal(diagnostics.length, 1)
  assert.deepEqual(presetDiagnosticModelFocus(diagnostics[0]), {
    expectedResource: resource('lora', '-edited'),
    origin: 'preset',
    resource: {
      resourceId: 'lora-local-edited',
      resourceName: 'Saved lora-edited',
      versionId: 'lora-exact-edited',
      versionName: 'Version B',
    },
    resourceType: 'lora',
  })
  assert.equal(source.loras![0].resource.localVersionId, 'lora-exact')
  const focus = presetDiagnosticModelFocus(diagnostics[0])!
  focus.resource!.resourceName = 'Temporary browsing label'
  focus.expectedResource!.displayName = 'Temporary expected label'
  assert.equal(diagnostics[0].resource!.displayName, 'Saved lora-edited')
})

test('unavailable and corrupt catalog diagnostics retain an exact handoff for all resource kinds', () => {
  for (const kind of ['checkpoint', 'lora', 'embedding', 'vae'] as const) {
    const ref = resource(kind)
    const payload: PresetPayload =
      kind === 'checkpoint'
        ? { model: ref as NonNullable<PresetPayload['model']> }
        : kind === 'lora'
          ? { loras: [{ enabled: true, resource: ref as Resource & { kind: 'lora' }, weight: 1 }] }
          : kind === 'embedding'
            ? {
                prompt: {
                  embeddingRefs: [
                    { resource: ref as Resource & { kind: 'embedding' }, token: '<x>' },
                  ],
                  text: '<x>',
                },
              }
            : { vae: ref as Resource & { kind: 'vae' } }
    const section: PresetSectionKey =
      kind === 'checkpoint'
        ? 'model'
        : kind === 'lora'
          ? 'loras'
          : kind === 'embedding'
            ? 'prompt'
            : 'vae'
    const item = catalogItem(ref)
    item.versions[0].fileStatus = 'corrupt'
    for (const [catalog, code] of [
      [null, 'CATALOG_UNAVAILABLE'],
      [[item], 'RESOURCE_CORRUPT'],
    ] as const) {
      const diagnostics = presetApplicationDiagnostics({
        catalog,
        current: current(),
        payload,
        selectedSections: [section],
      })
      assert.equal(diagnostics[0].code, code)
      assert.equal(presetDiagnosticModelFocus(diagnostics[0])!.resourceType, kind)
      assert.equal(presetDiagnosticModelFocus(diagnostics[0])!.resource!.versionId, `${kind}-exact`)
    }
  }
})

test('resource-bearing family and advisory mismatches remain browseable; settings-only errors do not invent resources', () => {
  const ref = resource('checkpoint')
  const item = catalogItem(ref)
  item.versions[0].predictionType = 'v_prediction'
  const advisory = presetApplicationDiagnostics({
    catalog: [item],
    current: current(),
    payload: { model: ref },
    selectedSections: ['model'],
  })
  assert.equal(advisory[0].code, 'POLICY_ADVISORY_MISMATCH')
  assert.equal(advisory[0].blocking, false)
  assert.equal(presetDiagnosticModelFocus(advisory[0])!.resourceType, 'checkpoint')

  const target = current()
  target.generationDraft.model = {
    ...resource('checkpoint', '-anima'),
    baseModelFamily: 'anima',
    predictionType: null,
  }
  const lora = resource('lora')
  const diagnostics = presetApplicationDiagnostics({
    catalog: [catalogItem(lora)],
    current: target,
    payload: {
      cfgRescale: 0.7,
      loras: [{ enabled: true, resource: lora, weight: 1 }],
      vaePrecision: 'FP32',
    },
    selectedSections: ['loras', 'cfgRescale', 'vaePrecision'],
  })
  assert.equal(diagnostics[0].code, 'RESOURCE_FAMILY_MISMATCH')
  assert.equal(presetDiagnosticModelFocus(diagnostics[0])!.resourceType, 'lora')
  assert.ok(diagnostics.slice(1).every((item) => item.code === 'SETTING_UNSUPPORTED'))
  assert.deepEqual(diagnostics.slice(1).map(presetDiagnosticModelFocus), [null, null])
})

test('duplicate explanations share one action per section while positive and negative embedding actions stay separate', () => {
  const lora = resource('lora')
  const embedding = resource('embedding')
  const prompt = { embeddingRefs: [{ resource: embedding, token: '<alias>' }], text: '<alias>' }
  const diagnostics = presetApplicationDiagnostics({
    catalog: [],
    current: current(),
    payload: {
      loras: [
        { enabled: true, resource: lora, weight: 0.5 },
        { enabled: false, resource: lora, weight: -0.25 },
      ],
      negativePrompt: prompt,
      prompt,
    },
    selectedSections: ['loras', 'prompt', 'negativePrompt'],
  })
  assert.equal(diagnostics.length, 5)
  const rows = presetDiagnosticModelRows(diagnostics)
  assert.deepEqual(
    rows.map((row) => row.diagnostic),
    diagnostics,
  )
  assert.deepEqual(
    rows.map((row) => row.focus?.resourceType ?? null),
    ['lora', null, null, 'embedding', 'embedding'],
  )
  assert.equal(rows[1].actionKey, null)
  assert.equal(rows[2].actionKey, null)
  assert.notEqual(rows[3].actionKey, rows[4].actionKey)
})

test('a handoff action keeps its identity across catalog loading and missing diagnostics while another exact version gets a new identity', () => {
  const ref = resource('checkpoint')
  const inspect = (catalog: ModelCatalogItem[] | null, value: Resource & { kind: 'checkpoint' }) =>
    presetDiagnosticModelRows(
      presetApplicationDiagnostics({
        catalog,
        current: current(),
        payload: { model: value },
        selectedSections: ['model'],
      }),
    )[0]
  const loading = inspect(null, ref)
  const missing = inspect([], ref)
  assert.equal(loading.diagnostic.code, 'CATALOG_UNAVAILABLE')
  assert.equal(missing.diagnostic.code, 'RESOURCE_MISSING')
  assert.ok(loading.actionKey)
  assert.equal(loading.actionKey, missing.actionKey)
  assert.notEqual(missing.actionKey, inspect([], resource('checkpoint', '-other')).actionKey)
})

test('a repaired exact reference loses its diagnostics/action without selecting a default replacement', () => {
  const ref = resource('lora')
  const payload: PresetPayload = { loras: [{ enabled: true, resource: ref, weight: -0.5 }] }
  const before = structuredClone(payload)
  const inspect = (catalog: ModelCatalogItem[]) =>
    presetApplicationDiagnostics({
      catalog,
      current: current(),
      payload,
      selectedSections: ['loras'],
    })
  assert.equal(presetDiagnosticModelRows(inspect([]))[0].focus!.resource!.versionId, 'lora-exact')
  assert.deepEqual(presetDiagnosticModelRows(inspect([catalogItem(ref)])), [])
  assert.deepEqual(payload, before)
})

test('Manager rows browse all five authored resource locations with exact copied identities', () => {
  const definition = { payload: missingPayload() }
  const before = structuredClone(definition)
  const rows = presetManagerModelRows(definition, [], true)
  assert.deepEqual(
    rows.map(({ focus, section }) => ({
      expectedResource: focus.expectedResource,
      origin: focus.origin,
      resource: focus.resource,
      resourceType: focus.resourceType,
      section,
    })),
    [
      ['model', 'checkpoint', ''],
      ['vae', 'vae', ''],
      ['loras', 'lora', ''],
      ['prompt', 'embedding', '-positive'],
      ['negativePrompt', 'embedding', '-negative'],
    ].map(([section, kind, suffix]) => ({
      expectedResource: resource(kind as Resource['kind'], suffix),
      origin: 'preset-manager',
      resource: {
        resourceId: `${kind}-local${suffix}`,
        resourceName: `Saved ${kind}${suffix}`,
        versionId: `${kind}-exact${suffix}`,
        versionName: 'Version B',
      },
      resourceType: kind,
      section,
    })),
  )
  assert.ok(rows.every(({ actionKey }) => actionKey.length > 0))
  assert.equal(new Set(rows.map(({ actionKey }) => actionKey)).size, 5)
  assert.deepEqual(definition, before)
})

test('Manager actions read the edited draft despite incomplete metadata and unrelated numeric fields', () => {
  const source = missingPayload()
  const draft: EditablePresetDefinition = emptyPresetDefinition()
  draft.payload = structuredClone(source)
  draft.payload.loras![0].resource = resource('lora', '-edited')
  draft.payload.loras![0].weight = null
  draft.payload.guidance = { cfgScale: null, steps: null }
  draft.payload.size = { height: null, width: 1024 }
  draft.payload.seed = { policy: 'fixed', value: null }
  draft.workflow = null
  const before = structuredClone({ draft, source })
  assert.equal(validatePresetDefinition(draft), null)
  const rows = presetManagerModelRows(draft, [], true)
  const lora = rows.find(({ section }) => section === 'loras')!
  assert.deepEqual(lora.focus.expectedResource, resource('lora', '-edited'))
  assert.equal(lora.focus.resource?.versionId, 'lora-exact-edited')
  assert.equal(lora.focus.origin, 'preset-manager')
  assert.equal(source.loras![0].resource.localVersionId, 'lora-exact')
  assert.equal(rows.length, 5, 'unrelated invalid fields do not hide saved resource references')
  assert.deepEqual({ draft, source }, before)
})

test('Manager deduplicates exact references within a section while retaining both prompt polarities', () => {
  const lora = resource('lora')
  const embedding = resource('embedding')
  const repeatedPrompt = {
    embeddingRefs: [
      { resource: embedding, token: '<first>' },
      { resource: embedding, token: '<second>' },
    ],
    text: '<first> <second>',
  }
  const definition = {
    payload: {
      loras: [
        { enabled: true, resource: lora, weight: -0.75 },
        { enabled: false, resource: lora, weight: 0.5 },
      ],
      negativePrompt: repeatedPrompt,
      prompt: repeatedPrompt,
    },
  }
  const before = structuredClone(definition)
  const rows = presetManagerModelRows(definition, [], true)
  assert.deepEqual(
    rows.map(({ section }) => section),
    ['loras', 'prompt', 'negativePrompt'],
  )
  assert.deepEqual(
    rows.map(({ focus }) => focus.resourceType),
    ['lora', 'embedding', 'embedding'],
  )
  assert.notEqual(rows[1].actionKey, rows[2].actionKey)
  assert.deepEqual(definition, before)
})

test('Manager unknown-catalog browsing retains known references without claiming a missing resource', () => {
  const ref = resource('checkpoint')
  const definition = { payload: { model: ref, vae: null } }
  const catalog = [catalogItem(ref)]
  const unknown = presetManagerModelRows(definition, catalog, false)
  const emptyUnknown = presetManagerModelRows(definition, [], false)
  const missing = presetManagerModelRows(definition, [], true)
  assert.equal(presetNeedsAttention(definition, [], false), false)
  assert.deepEqual(unknown, emptyUnknown, 'stale catalog contents do not establish availability')
  assert.equal(unknown.length, 1)
  assert.equal(unknown[0].actionKey, missing[0].actionKey)
  assert.deepEqual(unknown[0].focus.expectedResource, ref)
  assert.equal(Object.hasOwn(unknown[0], 'diagnostic'), false)
  assert.equal(presetNeedsAttention(definition, [], true), true)
  assert.deepEqual(presetManagerModelRows(definition, catalog, true), [])
  assert.deepEqual(
    presetManagerModelRows({ payload: { loras: [], model: null, vae: null } }, [], false),
    [],
  )
})

test('Manager and Apply share stable exact-reference action identity while keeping their origins distinct', () => {
  const ref = resource('lora')
  const managerRow = (value: Resource & { kind: 'lora' }) =>
    presetManagerModelRows(
      { payload: { loras: [{ enabled: false, resource: value, weight: -0.5 }] } },
      [],
      true,
    )[0]
  const manager = managerRow(ref)
  const apply = presetDiagnosticModelRows([
    {
      blocking: true,
      code: 'RESOURCE_MISSING',
      message: 'Exact version unavailable.',
      resource: ref,
      section: 'loras',
    },
  ])[0]
  assert.equal(manager.actionKey, apply.actionKey)
  assert.equal(manager.focus.origin, 'preset-manager')
  assert.equal(apply.focus!.origin, 'preset')
  assert.equal(
    managerRow({ ...ref, displayName: 'Renamed display', versionName: 'Renamed version' })
      .actionKey,
    manager.actionKey,
  )
  for (const change of [
    { localModelId: 'other-model' },
    { localVersionId: 'other-version' },
    { fileSha256: 'b'.repeat(64) },
    { civitaiModelId: 12 },
    { civitaiVersionId: 23 },
    { civitaiFileId: 34 },
    { baseModelFamily: 'anima' as const },
  ]) {
    assert.notEqual(
      managerRow({ ...ref, ...change }).actionKey,
      manager.actionKey,
      JSON.stringify(change),
    )
  }
})

test('Manager heals only an exact catalog match and never replaces the draft with a ready default or relink candidate', () => {
  const ref = resource('checkpoint')
  const definition = { payload: { model: ref } }
  const exact = catalogItem(ref)
  const renamedIdentity = catalogItem(ref)
  renamedIdentity.id = 'same-name-and-SHA-different-local-model'
  const wrongSha = catalogItem(ref)
  wrongSha.versions[0].sha256 = 'b'.repeat(64)
  const defaultOnly = catalogItem(ref)
  defaultOnly.versions[0].id = defaultOnly.defaultVersionId!
  const before = structuredClone(definition)
  for (const item of [renamedIdentity, wrongSha, defaultOnly]) {
    const rows = presetManagerModelRows(definition, [item], true)
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0].focus.expectedResource, ref)
    assert.equal(rows[0].focus.resource!.versionId, ref.localVersionId)
  }
  assert.deepEqual(presetManagerModelRows(definition, [exact], true), [])
  assert.deepEqual(definition, before)
})

test('Manager keeps the existing authoring policy instead of adding Apply dependency or setting admission', () => {
  const model = resource('checkpoint')
  const item = catalogItem(model)
  item.versions[0].dependencyIssues = ['unavailable companion']
  item.versions[0].predictionType = 'v_prediction'
  assert.deepEqual(
    presetManagerModelRows({ payload: { cfgRescale: 0.7, model } }, [item], true),
    [],
    'authoring warnings do not become inference admission or advisory-policy diagnostics',
  )
  const lora = resource('lora')
  const definition = {
    payload: {
      loras: [{ enabled: false, resource: lora, weight: -0.5 }],
      model: { ...model, baseModelFamily: 'anima' as const, predictionType: null },
    },
  }
  const catalog = [catalogItem(definition.payload.model), catalogItem(lora)]
  const rows = presetManagerModelRows(definition, catalog, true)
  assert.deepEqual(
    rows.map(({ section }) => section),
    ['loras'],
  )
  assert.deepEqual(rows[0].focus.expectedResource, lora)
  assert.deepEqual(
    presetManagerModelRows({ payload: { loras: definition.payload.loras } }, catalog, true),
    [],
    'a preset without a model does not inherit a Project family',
  )
})

test('Manager focus copies Vue-proxied references without mutating the source draft or catalog', () => {
  const source = missingPayload()
  const definition = reactive({ payload: structuredClone(source) })
  const catalog = reactive([catalogItem(resource('checkpoint'))])
  const before = JSON.stringify({ catalog, definition, source })
  const rows = presetManagerModelRows(definition, catalog, false)
  const model = rows.find(({ section }) => section === 'model')!
  assert.notEqual(model.focus.expectedResource, definition.payload.model)
  assert.deepEqual(model.focus.expectedResource, source.model)
  model.focus.expectedResource!.displayName = 'Browsing copy'
  model.focus.expectedResource!.fileSha256 = 'f'.repeat(64)
  model.focus.resource!.resourceName = 'Browsing label'
  model.focus.resource!.versionId = 'Browsing version'
  assert.equal(JSON.stringify({ catalog, definition, source }), before)
})

test('New Project snapshot routes its five used resource locations with exact identities shared by Manager and Apply', () => {
  const source = sourcePresetRecord()
  const state = selectNewProjectPreset(source)
  const before = structuredClone({ source, state })
  const rows = newProjectPresetModelRows(state, [], true)
  const manager = presetManagerModelRows({ payload: state.customization!.payload }, [], true)
  assert.equal(rows.length, 5)
  assert.deepEqual(
    rows.map(({ focus, section }) => ({ focus, section })),
    manager.map(({ focus, section }) => ({
      focus: { ...focus, origin: 'new-project' },
      section,
    })),
  )
  assert.deepEqual(
    rows.map(({ actionKey }) => actionKey),
    manager.map(({ actionKey }) => actionKey),
  )
  for (const row of rows) {
    const apply = presetDiagnosticModelRows([
      {
        blocking: true,
        code: 'RESOURCE_MISSING',
        message: 'The exact resource is unavailable.',
        resource: row.focus.expectedResource!,
        section: row.section,
      },
    ])[0]
    assert.equal(row.actionKey, apply.actionKey)
    assert.equal(apply.focus!.origin, 'preset')
  }
  assert.deepEqual(newProjectPresetModelRows(emptyNewProjectPresetState(), [], false), [])
  assert.deepEqual({ source, state }, before)
})

test('New Project Use suppresses each resource section without discarding its copied values', () => {
  const state = selectNewProjectPreset(sourcePresetRecord())
  const customization = state.customization!
  const before = structuredClone({
    initial: customization.initialPayload,
    payload: customization.payload,
    source: customization.source,
  })
  const sections = ['prompt', 'negativePrompt', 'model', 'loras', 'vae'] as const
  for (const section of sections) {
    setNewProjectPresetSection(state, section, false)
    const rows = newProjectPresetModelRows(state, [], true)
    assert.equal(
      rows.some((row) => row.section === section),
      false,
      section,
    )
    assert.equal(rows.length, 4)
    setNewProjectPresetSection(state, section, true)
    assert.equal(newProjectPresetModelRows(state, [], true).length, 5)
  }
  for (const section of sections) {
    setNewProjectPresetSection(state, section, false)
  }
  assert.deepEqual(newProjectPresetModelRows(state, [], true), [])
  assert.deepEqual(
    {
      initial: customization.initialPayload,
      payload: customization.payload,
      source: customization.source,
    },
    before,
  )
})

test('New Project navigation follows current edited references instead of either saved source snapshot', () => {
  const source = sourcePresetRecord()
  const state = selectNewProjectPreset(source)
  const customization = state.customization!
  const edited = missingPayload()
  edited.model = resource('checkpoint', '-edited')
  edited.loras![0].resource = resource('lora', '-edited')
  edited.prompt!.embeddingRefs[0].resource = resource('embedding', '-positive-edited')
  edited.negativePrompt!.embeddingRefs[0].resource = resource('embedding', '-negative-edited')
  edited.vae = resource('vae', '-edited')
  customization.payload = { ...customization.payload, ...edited }
  source.payload.model = resource('checkpoint', '-changed-elsewhere')
  const before = structuredClone({ source, state })
  const rows = newProjectPresetModelRows(state, [], true)
  assert.deepEqual(
    rows.map(({ focus }) => focus.expectedResource),
    [
      edited.model,
      edited.vae,
      edited.loras![0].resource,
      edited.prompt!.embeddingRefs[0].resource,
      edited.negativePrompt!.embeddingRefs[0].resource,
    ],
  )
  assert.equal(customization.initialPayload.model!.localVersionId, 'checkpoint-exact')
  assert.equal(customization.source.payload.model!.localVersionId, 'checkpoint-exact')
  assert.deepEqual({ source, state }, before)
})

test('New Project navigation survives unfinished used fields without requiring a valid Create request', () => {
  const state = selectNewProjectPreset(sourcePresetRecord())
  const customization = state.customization!
  customization.payload.guidance = { cfgScale: null, steps: null }
  customization.payload.size = { height: null, width: 1536 }
  customization.payload.seed = { policy: 'fixed', value: null }
  customization.payload.loras![0].weight = null
  setNewProjectPresetSection(state, 'seed', true)
  const before = structuredClone(state)
  assert.throws(() => newProjectCreateRequest(state, ''))
  assert.throws(() => newProjectCreateRequest(state, 'Valid name', false))
  const rows = newProjectPresetModelRows(state, [], true)
  assert.equal(rows.length, 5)
  assert.deepEqual(
    rows.find(({ section }) => section === 'loras')!.focus.expectedResource,
    resource('lora'),
  )
  assert.deepEqual(state, before)
})

test('New Project heals only exact ready references and retains authoring family policy from used Model', () => {
  const ref = resource('checkpoint')
  const state = selectNewProjectPreset(sourcePresetRecord({ model: ref }))
  const wrongSha = catalogItem(ref)
  wrongSha.versions[0].sha256 = 'b'.repeat(64)
  const defaultOnly = catalogItem(ref)
  defaultOnly.versions[0].id = defaultOnly.defaultVersionId!
  const wrongFamily = catalogItem(ref)
  wrongFamily.versions[0].baseModelFamily = 'anima'
  const corrupt = catalogItem(ref)
  corrupt.versions[0].fileStatus = 'corrupt'
  const before = structuredClone(state)
  for (const item of [wrongSha, defaultOnly, wrongFamily, corrupt]) {
    const rows = newProjectPresetModelRows(state, [item], true)
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0].focus.expectedResource, ref)
    assert.equal(rows[0].focus.resource!.versionId, ref.localVersionId)
  }
  const exact = catalogItem(ref)
  exact.versions[0].dependencyIssues = ['unavailable companion']
  exact.versions[0].predictionType = 'v_prediction'
  assert.deepEqual(newProjectPresetModelRows(state, [exact], true), [])
  assert.deepEqual(state, before)

  const lora = resource('lora')
  const model = { ...ref, baseModelFamily: 'anima' as const, predictionType: null }
  const mixed = selectNewProjectPreset(
    sourcePresetRecord({ loras: [{ enabled: false, resource: lora, weight: -0.5 }], model }),
  )
  const catalog = [catalogItem(model), catalogItem(lora)]
  assert.deepEqual(
    newProjectPresetModelRows(mixed, catalog, true).map(({ section }) => section),
    ['loras'],
  )
  setNewProjectPresetSection(mixed, 'model', false)
  assert.deepEqual(
    newProjectPresetModelRows(mixed, catalog, true),
    [],
    'an unused Model cannot impose its family on selected references',
  )
  assert.deepEqual(mixed.customization!.payload.model, model)
})

test('New Project unknown catalog enumerates only known used refs and preserves action identity after settlement', () => {
  const state = selectNewProjectPreset(sourcePresetRecord())
  for (const section of ['model', 'negativePrompt', 'vae'] as const) {
    setNewProjectPresetSection(state, section, false)
  }
  const refs = [resource('lora'), resource('embedding', '-positive')]
  const staleReady = refs.map(catalogItem)
  const unknown = newProjectPresetModelRows(state, staleReady, false)
  const missing = newProjectPresetModelRows(state, [], true)
  assert.deepEqual(newProjectPresetModelRows(state, [], false), unknown)
  assert.deepEqual(
    unknown.map(({ section }) => section),
    ['loras', 'prompt'],
  )
  assert.deepEqual(
    unknown.map(({ actionKey }) => actionKey),
    missing.map(({ actionKey }) => actionKey),
  )
  assert.ok(unknown.every((row) => !Object.hasOwn(row, 'diagnostic')))
  assert.deepEqual(newProjectPresetModelRows(state, staleReady, true), [])
  state.customization!.payload.loras = []
  state.customization!.payload.prompt = { embeddingRefs: [], text: 'Literal prompt only' }
  assert.deepEqual(newProjectPresetModelRows(state, [], false), [])
})

test('New Project deduplicates per section while retaining signed disabled LoRAs and both embedding polarities', () => {
  const lora = resource('lora')
  const embedding = resource('embedding')
  const prompt = {
    embeddingRefs: [
      { resource: embedding, token: '<first>' },
      { resource: embedding, token: '<second>' },
    ],
    text: '<first> <second>',
  }
  const state = selectNewProjectPreset(
    sourcePresetRecord({
      loras: [
        { enabled: false, resource: lora, weight: -0.75 },
        { enabled: true, resource: lora, weight: 0 },
      ],
      negativePrompt: prompt,
      prompt,
    }),
  )
  const before = structuredClone(state)
  const rows = newProjectPresetModelRows(state, [], true)
  assert.deepEqual(
    rows.map(({ section }) => section),
    ['loras', 'prompt', 'negativePrompt'],
  )
  assert.notEqual(rows[1].actionKey, rows[2].actionKey)
  assert.deepEqual(rows[0].focus.expectedResource, lora)
  assert.deepEqual(state, before)
})

test('New Project focus copies Vue-proxied references without mutating source, customization or catalog', () => {
  const source = reactive(sourcePresetRecord())
  const state = reactive(selectNewProjectPreset(source))
  const catalog = reactive([catalogItem(resource('checkpoint'))])
  const before = JSON.stringify({ catalog, source, state })
  const rows = newProjectPresetModelRows(state, catalog, false)
  const model = rows.find(({ section }) => section === 'model')!
  assert.notEqual(model.focus.expectedResource, state.customization!.payload.model)
  assert.deepEqual(model.focus.expectedResource, source.payload.model)
  model.focus.expectedResource!.displayName = 'Temporary browse name'
  model.focus.expectedResource!.fileSha256 = 'f'.repeat(64)
  model.focus.resource!.resourceName = 'Temporary browse label'
  model.focus.resource!.versionId = 'Temporary browse version'
  assert.equal(JSON.stringify({ catalog, source, state }), before)
})
