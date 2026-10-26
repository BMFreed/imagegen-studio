import type { ModelCatalogItem, ProjectSmartPatchLayerView, ProjectTab } from '../../shared/api.js'
import { PRESET_SECTION_KEYS } from '../../shared/presets/preset-schema.js'
import {
  createEmptyProjectDocumentV1,
  IGS_SAFETY_CEILINGS,
} from '../../shared/projects/project-schema.js'
import { reconcilePromptEmbeddings } from '../../shared/projects/prompt-embeddings.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { reactive } from 'vue'

import { projectSmartResultPresetPayload } from '../../main/projects/project-smart-result-preset.js'
import { smartPatchVariantMetadataFixture } from '../../main/projects/test-fixtures/smart-patch-variant.js'
import {
  type EditablePresetPayload,
  presetNeedsAttention,
  validatePresetDefinition,
} from './preset-editor.js'
import { draftOwnerKey, ProjectDraftSync } from './project-draft-sync.js'
import { createSmartResultPresetIntent } from './result-preset-draft.js'
import {
  captureSmartPatchPresetIntent,
  createSmartPatchPresetIntent,
} from './smart-patch-preset-draft.js'

type Family = 'anima' | 'illustrious'
type Resource = NonNullable<ProjectTab['generationDraft']['model']>

function resource<K extends Resource['kind']>(kind: K, family: Family = 'illustrious') {
  return {
    baseModelFamily: family,
    civitaiFileId: 33,
    civitaiModelId: 11,
    civitaiVersionId: 22,
    displayName: `Authored ${family} ${kind}`,
    fileSha256: 'a'.repeat(64),
    kind,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType:
      kind === 'checkpoint' && family === 'illustrious' ? ('v_prediction' as const) : null,
    versionName: 'Authored exact version',
  }
}

function fixture(family: Family = 'illustrious') {
  const document = createEmptyProjectDocumentV1({ title: 'Canvas source.igs' })
  document.generationDraft.positivePrompt.text = 'Project Canvas template {red|blue}'
  const patch: ProjectSmartPatchLayerView = {
    activeRaster: null,
    activeRasterSubLayerId: null,
    blendMode: 'multiply',
    boundingBox: { height: 384, width: 512, x: -73, y: 51 },
    coherenceSettings: { edgeSize: 31, minimumDenoise: 0.375, mode: 'Box Blur' },
    generationDraft: {
      ...structuredClone(document.generationDraft),
      cfgRescale: 0,
      clipSkip: 2,
      dynamicPrompt: { maxPrompts: 200, seedBehavior: 'per-prompt' },
      loras: [
        { enabled: true, resource: resource('lora', family), weight: -0.7 },
        { enabled: false, resource: resource('lora', family), weight: 0 },
      ],
      model: resource('checkpoint', family),
      negativePrompt: {
        embeddingRefs: [{ resource: resource('embedding', family), token: '<negative-alias>' }],
        text: '<negative-alias>, {fog|blur}',
      },
      positivePrompt: {
        embeddingRefs: [{ resource: resource('embedding', family), token: '<authored-alias>' }],
        text: '<authored-alias>, current Patch {day|night}',
      },
      sampling: {
        animaMethod: 'heun',
        cfgScale: 0,
        denoisingStrength: 0,
        sampler: 'DPM++ 2M',
        scheduler: 'Karras',
        steps: 24,
      },
      seed: { policy: 'fixed', value: 0 },
      vae: resource('vae', family),
      vaePrecision: 'Auto',
    },
    id: randomUUID(),
    internalResolution: { height: 192, width: 256 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 3 },
    maskImageUrl: null,
    maskSettings: { blur: 9, padding: 4 },
    name: 'Selected Patch',
    opacity: 0.8,
    rasterSubLayers: [],
    status: 'empty',
    visible: true,
  }
  const tab: ProjectTab = {
    acceptedResults: [],
    autosaveError: null,
    canRedo: false,
    canUndo: true,
    dirty: true,
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: document.generationDraft,
    id: `project-v1-${'a'.repeat(64)}`,
    lastActualSeedSnapshot: 0,
    layers: [patch],
    primaryBbox: { height: 832, width: 1536, x: 120, y: -45 },
    title: document.title,
  }
  return { patch, tab }
}

function capture(tab: ProjectTab | undefined, selectedLayerId: string | null) {
  return captureSmartPatchPresetIntent({
    blocked: false,
    pendingDraft: false,
    selectedLayerId,
    tab,
  })
}

function catalog(ref: Resource): ModelCatalogItem[] {
  return [
    {
      author: null,
      defaultVersionId: 'other-default',
      description: null,
      id: ref.localModelId,
      modelId: ref.civitaiModelId,
      name: 'Current catalog name',
      previewDataUrl: null,
      resourceType: 'checkpoint',
      sourceUrl: null,
      trainedWords: [],
      versions: [
        {
          baseModelFamily: ref.baseModelFamily,
          civitaiFileId: ref.civitaiFileId,
          civitaiVersionId: ref.civitaiVersionId,
          dependencyIssues: [],
          fileName: 'checkpoint.safetensors',
          fileSizeBytes: 1,
          fileStatus: 'ready',
          format: 'safetensors',
          id: ref.localVersionId,
          installedAt: '2026-10-23T10:00:00.000Z',
          name: 'Current catalog version',
          noiseProfile: {
            effective: {
              baseSchedule: 'sdxl-scaled-linear-v1',
              rescaleBetasZeroSnr: true,
              schemaVersion: 1,
              timestepSpacing: 'trailing',
            },
            rescaleBetasZeroSnrSource: 'override',
            timestepSpacingSource: 'override',
          },
          predictionType: 'epsilon',
          sha256: ref.fileSha256,
          trainedWords: [],
        },
      ],
    },
  ]
}

test('selected Smart authoring captures exactly ten reusable sections from the twelve-section contract', () => {
  assert.deepEqual(PRESET_SECTION_KEYS, [
    'prompt',
    'negativePrompt',
    'model',
    'loras',
    'size',
    'sampling',
    'guidance',
    'cfgRescale',
    'denoisingStrength',
    'seed',
    'vae',
    'vaePrecision',
  ])
  for (const family of ['illustrious', 'anima'] as const) {
    const { patch, tab } = fixture(family)
    const before = structuredClone(tab)
    const captured = capture(reactive(tab), patch.id)
    assert.ok(captured)
    assert.deepEqual(captured.owner, {
      documentId: tab.documentId,
      documentRevision: tab.documentRevision,
      layerId: patch.id,
      tabId: tab.id,
    })
    assert.deepEqual(captured.intent, {
      definition: {
        description: '',
        favorite: false,
        name: 'Selected Patch Baseline',
        payload: {
          cfgRescale: 0,
          denoisingStrength: 0,
          guidance: { cfgScale: 0, steps: 24 },
          loras: patch.generationDraft.loras,
          model: patch.generationDraft.model,
          negativePrompt: patch.generationDraft.negativePrompt,
          prompt: patch.generationDraft.positivePrompt,
          sampling: { animaMethod: 'heun', sampler: 'DPM++ 2M', scheduler: 'Karras' },
          vae: patch.generationDraft.vae,
          vaePrecision: 'Auto',
        },
        tags: ['project'],
        workflow: 'smartPatch',
      },
      kind: 'smart-patch-draft',
      patchName: patch.name,
      projectName: tab.title,
      projectSummary: `Authored ${family} checkpoint`,
      workflowUnknown: false,
    })
    assert.deepEqual(
      Object.keys(captured.intent.definition.payload).sort(),
      PRESET_SECTION_KEYS.filter((key) => key !== 'size' && key !== 'seed').sort(),
    )
    assert.ok(validatePresetDefinition(captured.intent.definition))
    assert.deepEqual(tab, before)
  }
})

test('capture selects the second Smart Patch among distinct drafts and a Raster in either layer order', () => {
  const { patch: first, tab } = fixture()
  first.name = 'First Patch'
  const second = fixture('anima').patch
  second.name = 'Second Patch'
  second.generationDraft.positivePrompt.text = '<authored-alias>, second {sunrise|sunset}'
  second.generationDraft.negativePrompt.text = '<negative-alias>, second {rain|snow}'
  second.generationDraft.sampling = {
    animaMethod: 'lcm',
    cfgScale: 7,
    denoisingStrength: 0.65,
    sampler: null,
    scheduler: null,
    steps: 37,
  }
  second.generationDraft.cfgRescale = 0.25
  second.generationDraft.vae = null
  second.generationDraft.vaePrecision = 'FP32'
  const raster: ProjectTab['layers'][number] = {
    blendMode: 'normal',
    height: 8,
    id: randomUUID(),
    imageUrl: 'igs-layer://neighbor',
    kind: 'raster',
    locked: false,
    name: 'Raster neighbor',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
    visible: true,
    width: 8,
  }
  const expectedPayloads = {
    first: {
      cfgRescale: 0,
      denoisingStrength: 0,
      guidance: { cfgScale: 0, steps: 24 },
      loras: first.generationDraft.loras,
      model: first.generationDraft.model,
      negativePrompt: first.generationDraft.negativePrompt,
      prompt: first.generationDraft.positivePrompt,
      sampling: { animaMethod: 'heun', sampler: 'DPM++ 2M', scheduler: 'Karras' },
      vae: first.generationDraft.vae,
      vaePrecision: 'Auto',
    },
    second: {
      cfgRescale: 0.25,
      denoisingStrength: 0.65,
      guidance: { cfgScale: 7, steps: 37 },
      loras: second.generationDraft.loras,
      model: second.generationDraft.model,
      negativePrompt: second.generationDraft.negativePrompt,
      prompt: second.generationDraft.positivePrompt,
      sampling: { animaMethod: 'lcm' },
      vae: null,
      vaePrecision: 'FP32',
    },
  }
  for (const layers of [
    [first, raster, second],
    [second, raster, first],
  ]) {
    tab.layers = layers
    const before = structuredClone(tab)
    // Select the second Smart entry first, then reverse selection without changing the stack.
    for (const selected of layers[0] === first ? [second, first] : [first, second]) {
      const captured = capture(tab, selected.id)
      assert.ok(captured)
      assert.deepEqual(captured, {
        intent: {
          definition: {
            description: '',
            favorite: false,
            name: `${selected.name} Baseline`,
            payload: selected === first ? expectedPayloads.first : expectedPayloads.second,
            tags: ['project'],
            workflow: 'smartPatch',
          },
          kind: 'smart-patch-draft',
          patchName: selected.name,
          projectName: tab.title,
          projectSummary: selected.generationDraft.model!.displayName,
          workflowUnknown: false,
        },
        owner: {
          documentId: tab.documentId,
          documentRevision: tab.documentRevision,
          layerId: selected.id,
          tabId: tab.id,
        },
      })
      assert.deepEqual(
        tab,
        before,
        'both Patch drafts, Canvas and Raster neighbor remain unchanged',
      )
    }
  }
})

test('current templates differ from both Canvas and accepted concrete or historical authored prompts', () => {
  for (const family of ['illustrious', 'anima'] as const) {
    const { patch, tab } = fixture(family)
    const variant = smartPatchVariantMetadataFixture(family)
    patch.activeRasterSubLayerId = variant.id
    patch.rasterSubLayers = [{ id: variant.id, name: variant.name }]
    const result = createSmartResultPresetIntent({
      data: {
        assetSha256: variant.asset.sha256,
        documentId: tab.documentId,
        documentRevision: tab.documentRevision,
        owner: { kind: 'smart-patch-variant', layerId: patch.id, variantId: variant.id },
        payload: projectSmartResultPresetPayload(
          variant.generationProvenance.generationConfiguration,
        ),
        resultId: variant.id,
        workflow: 'smartPatch',
      },
      layerName: patch.name,
      projectName: tab.title,
    })
    const current = capture(tab, patch.id)!.intent.definition.payload
    assert.deepEqual(current.prompt, patch.generationDraft.positivePrompt)
    assert.deepEqual(current.negativePrompt, patch.generationDraft.negativePrompt)
    assert.notEqual(current.prompt.text, tab.generationDraft.positivePrompt.text)
    assert.notEqual(current.prompt.text, result.definition.payload.prompt!.text)
    assert.notEqual(
      current.prompt.text,
      variant.generationProvenance.layerSourceContext.generationDraft.positivePrompt.text,
    )
    assert.equal(result.definition.payload.prompt!.text, '(lantern:1.5)')
    assert.equal(result.definition.workflow, 'smartPatch')
  }
})

test('source, capture, repeated capture and later editor changes never share mutable aliases', () => {
  const { patch, tab } = fixture()
  const installed = catalog(patch.generationDraft.model!)
  const source = structuredClone({ installed, tab })
  const first = captureSmartPatchPresetIntent({
    blocked: false,
    catalog: installed,
    pendingDraft: false,
    selectedLayerId: patch.id,
    tab: reactive(tab),
  })!
  const frozen = structuredClone(first)
  const second = capture(tab, patch.id)!
  second.intent.definition.payload.prompt!.embeddingRefs[0].resource.displayName = 'Second copy'
  first.intent.definition.payload.prompt!.text = 'Edited prompt'
  first.intent.definition.payload.negativePrompt!.embeddingRefs[0].resource.displayName =
    'Edited ref'
  first.intent.definition.payload.loras![0].resource.displayName = 'Edited LoRA'
  first.intent.definition.payload.loras![0].weight = 1
  first.intent.definition.payload.model!.noiseProfile!.rescaleBetasZeroSnr = false
  first.intent.definition.payload.vae!.versionName = 'Edited VAE'
  first.intent.definition.payload.sampling!.animaMethod = 'lcm'
  first.owner.layerId = randomUUID()
  assert.deepEqual({ installed, tab }, source)
  const captured = capture(tab, patch.id)!
  const capturedBefore = structuredClone(captured)
  patch.name = 'Later Patch name'
  tab.title = 'Later Project name'
  tab.documentRevision = randomUUID()
  patch.generationDraft.positivePrompt.text = 'Later source edit'
  installed[0].versions[0].noiseProfile!.effective.timestepSpacing = 'leading'
  assert.deepEqual(captured, capturedBefore)
  assert.equal(frozen.intent.patchName, 'Selected Patch')
  assert.equal(frozen.intent.definition.payload.model!.noiseProfile!.rescaleBetasZeroSnr, true)
})

test('absence, unfinished guidance, explicit empty prompts and Embedded VAE remain distinct', () => {
  const { patch } = fixture()
  patch.generationDraft.model = null
  patch.generationDraft.loras = []
  patch.generationDraft.positivePrompt = { embeddingRefs: [], text: '' }
  patch.generationDraft.negativePrompt = { embeddingRefs: [], text: '' }
  patch.generationDraft.vae = null
  patch.generationDraft.sampling = {
    cfgScale: null,
    denoisingStrength: null,
    sampler: null,
    scheduler: null,
    steps: null,
  }
  delete patch.generationDraft.cfgRescale
  delete patch.generationDraft.vaePrecision
  const created = createSmartPatchPresetIntent({ patch, projectName: 'Incomplete source' })
  assert.equal(created.projectSummary, 'No model')
  assert.equal(created.definition.workflow, 'smartPatch')
  const expected: EditablePresetPayload = {
    guidance: { cfgScale: null, steps: null },
    loras: [],
    negativePrompt: { embeddingRefs: [], text: '' },
    prompt: { embeddingRefs: [], text: '' },
    vae: null,
  }
  assert.deepEqual(created.definition.payload, expected)
  assert.equal(validatePresetDefinition(created.definition), null)
  created.definition.payload.guidance = { cfgScale: 0, steps: 1 }
  assert.ok(validatePresetDefinition(created.definition))
  created.definition.payload.guidance = { cfgScale: null, steps: null }
  delete created.definition.payload.guidance
  assert.ok(validatePresetDefinition(created.definition))
})

test('sampling preserves only explicit members, including inactive family values and unknown family', () => {
  for (const family of ['illustrious', 'anima', null] as const) {
    for (const choice of ['pair', 'native', 'all', 'none'] as const) {
      const { patch } = fixture(family ?? 'illustrious')
      patch.generationDraft.model!.baseModelFamily = family
      patch.generationDraft.sampling.sampler =
        choice === 'pair' || choice === 'all' ? 'Euler' : null
      patch.generationDraft.sampling.scheduler =
        choice === 'pair' || choice === 'all' ? 'Normal' : null
      if (choice === 'native' || choice === 'all') {
        patch.generationDraft.sampling.animaMethod = 'heun'
      } else {
        delete patch.generationDraft.sampling.animaMethod
      }
      const payload = createSmartPatchPresetIntent({ patch, projectName: 'Family source' })
        .definition.payload
      assert.equal(payload.model?.baseModelFamily, family)
      assert.deepEqual(
        payload.sampling,
        choice === 'pair'
          ? { sampler: 'Euler', scheduler: 'Normal' }
          : choice === 'native'
            ? { animaMethod: 'heun' }
            : choice === 'all'
              ? { animaMethod: 'heun', sampler: 'Euler', scheduler: 'Normal' }
              : undefined,
      )
    }
  }
})

test('only an exact ready Illustrious catalog identity adds a detached advisory noise hint', () => {
  const { patch } = fixture()
  const installed = catalog(patch.generationDraft.model!)
  const before = structuredClone({ installed, patch })
  const created = createSmartPatchPresetIntent({ catalog: installed, patch, projectName: 'Source' })
  assert.deepEqual(
    created.definition.payload.model!.noiseProfile,
    installed[0].versions[0].noiseProfile!.effective,
  )
  assert.equal(created.definition.payload.model!.displayName, 'Authored illustrious checkpoint')
  assert.equal(created.definition.payload.model!.versionName, 'Authored exact version')
  assert.equal(created.definition.payload.model!.predictionType, 'v_prediction')
  const mismatches: ((items: ModelCatalogItem[]) => void)[] = [
    (items) => {
      items[0].id = 'other-model'
    },
    (items) => {
      items[0].modelId = 999
    },
    (items) => {
      items[0].resourceType = 'lora'
    },
    (items) => {
      items[0].versions[0].id = 'other-version'
    },
    (items) => {
      items[0].versions[0].sha256 = 'b'.repeat(64)
    },
    (items) => {
      items[0].versions[0].civitaiVersionId = 999
    },
    (items) => {
      items[0].versions[0].civitaiFileId = 999
    },
    (items) => {
      items[0].versions[0].baseModelFamily = 'anima'
    },
    (items) => {
      items[0].versions[0].fileStatus = 'corrupt'
    },
  ]
  for (const change of mismatches) {
    const stale = structuredClone(installed)
    change(stale)
    assert.equal(
      createSmartPatchPresetIntent({ catalog: stale, patch, projectName: 'Source' }).definition
        .payload.model!.noiseProfile,
      undefined,
    )
  }
  const anima = fixture('anima').patch
  assert.equal(
    createSmartPatchPresetIntent({
      catalog: catalog(anima.generationDraft.model!),
      patch: anima,
      projectName: 'Source',
    }).definition.payload.model!.noiseProfile,
    undefined,
  )
  assert.deepEqual({ installed, patch }, before)
})

test('missing resources and an unavailable catalog remain saveable without substituting identities', () => {
  const { patch } = fixture()
  for (const unavailable of [undefined, null, []]) {
    const created = createSmartPatchPresetIntent({
      catalog: unavailable,
      patch,
      projectName: 'Offline source',
    })
    assert.ok(validatePresetDefinition(created.definition))
    assert.deepEqual(created.definition.payload.model, patch.generationDraft.model)
    assert.deepEqual(created.definition.payload.loras, patch.generationDraft.loras)
    assert.deepEqual(created.definition.payload.vae, patch.generationDraft.vae)
    assert.deepEqual(created.definition.payload.prompt, patch.generationDraft.positivePrompt)
    assert.equal(presetNeedsAttention(created.definition, [], true), true)
  }
})

test('over-budget default names stay editable and source identity is never truncated', () => {
  const { patch } = fixture()
  patch.name = 'я'.repeat(Math.floor(IGS_SAFETY_CEILINGS.titleBytes / 2))
  const created = createSmartPatchPresetIntent({ patch, projectName: 'Full Project identity' })
  assert.equal(created.patchName, patch.name)
  assert.equal(created.definition.name, `${patch.name} Baseline`)
  assert.equal(validatePresetDefinition(created.definition), null)
  created.definition.name = 'Short editable name'
  assert.ok(validatePresetDefinition(created.definition))
  assert.equal(created.patchName, patch.name)
})

test('malformed resource roles refuse capture without changing source values', () => {
  const corruptions: ((draft: ProjectTab['generationDraft']) => void)[] = [
    (draft) => {
      draft.model!.kind = 'lora'
    },
    (draft) => {
      draft.vae!.kind = 'checkpoint'
    },
    (draft) => {
      draft.loras[0].resource.kind = 'embedding'
    },
    (draft) => {
      draft.positivePrompt.embeddingRefs[0].resource.kind = 'vae'
    },
    (draft) => {
      draft.negativePrompt.embeddingRefs[0].resource.kind = 'checkpoint'
    },
  ]
  for (const corrupt of corruptions) {
    const { patch, tab } = fixture()
    corrupt(patch.generationDraft)
    const before = structuredClone(tab)
    assert.throws(() => capture(tab, patch.id))
    assert.deepEqual(tab, before)
  }
})

test('capture refuses absent or non-Smart selections and blocked or pending contexts', () => {
  const { patch, tab } = fixture()
  const raster: ProjectTab['layers'][number] = {
    blendMode: 'normal',
    height: 8,
    id: randomUUID(),
    imageUrl: 'igs-layer://fixture',
    kind: 'raster',
    locked: false,
    name: 'Converted Smart Raster',
    opacity: 1,
    resultPresetSourceKind: 'smart-patch',
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
    visible: true,
    width: 8,
  }
  tab.layers.push(raster)
  assert.equal(capture(undefined, patch.id), null)
  for (const selected of [null, randomUUID(), raster.id]) {
    assert.equal(capture(tab, selected), null)
  }
  for (const flags of [
    { blocked: true, pendingDraft: false },
    { blocked: false, pendingDraft: true },
    { blocked: true, pendingDraft: true },
  ]) {
    assert.equal(captureSmartPatchPresetIntent({ ...flags, selectedLayerId: patch.id, tab }), null)
  }
  assert.ok(capture(tab, patch.id))
  tab.layers = [raster]
  assert.equal(capture(tab, patch.id), null)
})

test('hidden, locked, empty and unverified Smart drafts remain read-only capture sources', () => {
  for (const visible of [true, false]) {
    for (const locked of [true, false]) {
      for (const status of ['empty', 'outdated', 'unverified'] as const) {
        const { patch, tab } = fixture()
        Object.assign(patch, { locked, status, visible })
        const before = structuredClone(tab)
        assert.ok(capture(tab, patch.id))
        assert.deepEqual(tab, before)
      }
    }
  }
})

function held<T>() {
  let release!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

test('held real draft synchronization blocks capture for selected, sibling and Project owners until exact binding acknowledgement', async () => {
  for (const scope of ['selected', 'sibling', 'project'] as const) {
    for (const binding of [true, false]) {
      const { patch, tab } = fixture()
      patch.generationDraft.positivePrompt = {
        embeddingRefs: [],
        text: 'Acknowledged Patch prompt',
      }
      const sibling = structuredClone(patch)
      sibling.id = randomUUID()
      sibling.name = 'Sibling Patch'
      tab.layers.push(sibling)
      let acknowledged = tab
      const layerId = scope === 'project' ? undefined : scope === 'selected' ? patch.id : sibling.id
      const sourceDraft =
        layerId === undefined
          ? tab.generationDraft
          : (scope === 'selected' ? patch : sibling).generationDraft
      const entered = held<void>()
      const deliver = held<void>()
      const settled = held<void>()
      const overlays = new Map<string, ProjectTab['generationDraft']>()
      const embedding = resource('embedding')
      const token = '<chosen-exact-embedding>'
      const text = binding ? `${token}, {portrait|studio}` : 'Unbound literal {portrait|studio}'
      const sync = new ProjectDraftSync({
        onAcknowledged: (reply) => {
          acknowledged = reply
        },
        onError: (_id, error) => {
          throw error
        },
        onOverlay: (tabId, draft, targetLayerId) => {
          const key = draftOwnerKey(tabId, targetLayerId)
          if (draft) {
            overlays.set(key, draft)
          } else {
            overlays.delete(key)
            settled.release()
          }
        },
        send: async (tabId, change, _group, targetLayerId) => {
          assert.equal(tabId, tab.id)
          assert.equal(targetLayerId, layerId)
          if (change.kind !== 'positive-prompt') {
            throw new Error('Unexpected fixture command')
          }
          // Production binding rule; native resource verification and Main storage are separate boundaries.
          const prompt = reconcilePromptEmbeddings(
            { ...sourceDraft.positivePrompt, text: change.text },
            [{ fileStatus: 'ready', resource: embedding, searchTerms: [], token }],
            change.embeddingSelection ? { resource: embedding, token } : undefined,
          )
          const reply = structuredClone(acknowledged)
          const draft =
            targetLayerId === undefined
              ? reply.generationDraft
              : (
                  reply.layers.find(
                    (layer) => layer.id === targetLayerId,
                  ) as ProjectSmartPatchLayerView
                ).generationDraft
          draft.positivePrompt = prompt
          reply.documentRevision = randomUUID()
          entered.release()
          await deliver.promise
          return reply
        },
      })
      sync.change(
        { ...tab, generationDraft: sourceDraft },
        {
          kind: 'positive-prompt',
          text,
          ...(binding
            ? {
                embeddingSelection: {
                  resourceId: embedding.localModelId,
                  token,
                  versionId: embedding.localVersionId,
                },
              }
            : {}),
        },
        undefined,
        layerId,
      )
      await entered.promise
      const overlay = overlays.get(draftOwnerKey(tab.id, layerId))!
      assert.equal(overlay.positivePrompt.text, text)
      assert.deepEqual(overlay.positivePrompt.embeddingRefs, [])
      assert.equal(sync.hasPending(tab.id), true)
      const captureCurrent = () =>
        captureSmartPatchPresetIntent({
          blocked: false,
          pendingDraft: sync.hasPending(tab.id) || overlays.size > 0,
          selectedLayerId: patch.id,
          tab: acknowledged,
        })
      assert.equal(captureCurrent(), null)
      deliver.release()
      await settled.promise
      assert.equal(sync.hasPending(tab.id), false)
      assert.equal(overlays.size, 0)
      const captured = captureCurrent()
      assert.ok(captured)
      assert.equal(captured.owner.documentRevision, acknowledged.documentRevision)
      assert.deepEqual(
        captured.intent.definition.payload.prompt,
        scope === 'selected'
          ? { embeddingRefs: binding ? [{ resource: embedding, token }] : [], text }
          : patch.generationDraft.positivePrompt,
      )
      assert.equal(acknowledged.lastActualSeedSnapshot, 0)
      assert.equal(Object.hasOwn(captured.intent.definition.payload, 'seed'), false)
    }
  }
})
