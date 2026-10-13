import type { ModelCatalogItem } from '../../shared/api.js'
import type {
  PresetApplicationDiagnostic,
  PresetApplicationTarget,
} from '../../shared/presets/preset-application.js'
import {
  parsePresetApplicationPayload,
  presetApplicationDiagnostics,
} from '../../shared/presets/preset-application.js'
import type { PresetPayload, PresetSectionKey } from '../../shared/presets/preset-schema.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import test from 'node:test'

import { presetDiagnosticModelFocus, presetDiagnosticModelRows } from './preset-model-handoff.js'

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
