import type { ModelCatalogItem, ProjectTab } from '../../shared/api.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import { reconcilePromptEmbeddings } from '../../shared/projects/prompt-embeddings.js'

import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive } from 'vue'

import { validatePresetDefinition } from './preset-editor.js'
import { ProjectDraftSync } from './project-draft-sync.js'
import { createAuthoringPresetPayload, createProjectPresetIntent } from './project-preset-draft.js'

type Project = Pick<ProjectTab, 'generationDraft' | 'layers' | 'primaryBbox' | 'title'>
type Resource = NonNullable<Project['generationDraft']['model']>
function resource(kind: Resource['kind']): Resource {
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: 33,
    civitaiModelId: 11,
    civitaiVersionId: 22,
    displayName: `Copied ${kind}`,
    fileSha256: 'a'.repeat(64),
    kind,
    localModelId: `${kind}-model`,
    localVersionId: `${kind}-version`,
    predictionType: kind === 'checkpoint' ? 'v_prediction' : null,
    versionName: 'Saved version',
  }
}
function project(): Project {
  const document = createEmptyProjectDocumentV1({
    primaryBbox: { height: 832, width: 1536, x: 120, y: -45 },
    title: 'Source.igs',
  })
  const draft = document.generationDraft
  draft.model = resource('checkpoint')
  draft.positivePrompt = {
    embeddingRefs: [{ resource: resource('embedding'), token: '<saved-alias>' }],
    text: '<saved-alias>, {portrait|studio}',
  }
  draft.negativePrompt = { embeddingRefs: [], text: 'blur' }
  draft.loras = [{ enabled: false, resource: resource('lora'), weight: -0.7 }]
  draft.sampling = {
    animaMethod: 'heun',
    cfgScale: 7,
    denoisingStrength: 0.45,
    sampler: 'DPM++ 2M',
    scheduler: 'Karras',
    steps: 30,
  }
  draft.cfgRescale = 0
  draft.vaePrecision = 'Auto'
  draft.seed = { policy: 'fixed', value: 0 }
  draft.clipSkip = 2
  draft.dynamicPrompt = { maxPrompts: 200, seedBehavior: 'per-prompt' }
  return {
    generationDraft: draft,
    layers: [],
    primaryBbox: document.primaryBbox,
    title: document.title,
  }
}
function layer(
  options: { opacity?: number; visible?: boolean } = {},
): ProjectTab['layers'][number] {
  return {
    blendMode: 'normal',
    height: 64,
    id: 'layer',
    imageUrl: 'copied-image-url',
    locked: false,
    name: 'Layer',
    opacity: options.opacity ?? 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
    visible: options.visible ?? true,
    width: 64,
  }
}
function catalog(ref: Resource): ModelCatalogItem[] {
  return [
    {
      author: null,
      defaultVersionId: 'other-default',
      description: null,
      id: ref.localModelId,
      modelId: ref.civitaiModelId,
      name: 'Current renamed model',
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
          fileName: 'model.safetensors',
          fileSizeBytes: 1,
          fileStatus: 'ready',
          format: 'safetensors',
          id: ref.localVersionId,
          installedAt: '2026-10-13T10:00:00.000Z',
          name: 'Current renamed version',
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

test('shared authoring projection leaves Size and workflow-dependent strength to each wrapper', () => {
  const source = project()
  const before = structuredClone(source)
  const payload = createAuthoringPresetPayload({ draft: reactive(source.generationDraft) })
  const ordinary = createProjectPresetIntent({ mode: 'img2img', project: source }).definition
    .payload
  const { denoisingStrength, size, ...reusable } = ordinary
  assert.deepEqual(payload, reusable)
  assert.deepEqual(size, { height: 832, width: 1536 })
  assert.equal(denoisingStrength, 0.45)
  assert.equal(Object.hasOwn(payload, 'size'), false)
  assert.equal(Object.hasOwn(payload, 'denoisingStrength'), false)
  payload.guidance!.steps = 99
  payload.prompt!.embeddingRefs[0].resource.displayName = 'Detached shared copy'
  assert.deepEqual(source, before)
  assert.equal(ordinary.guidance!.steps, 30)
})

test('Save Current captures detached authoring settings and dimensions while excluding seed and execution context', () => {
  const source = project()
  const before = structuredClone(source)
  const intent = createProjectPresetIntent({ mode: 'img2img', project: reactive(source) })
  assert.equal(intent.definition.name, 'Source Baseline')
  assert.equal(intent.definition.workflow, 'imageToImage')
  assert.equal(intent.projectName, 'Source.igs')
  assert.equal(intent.projectSummary, '1536 × 832 · Copied checkpoint')
  assert.equal(intent.workflowUnknown, false)
  assert.deepEqual(intent.definition.payload, {
    cfgRescale: 0,
    denoisingStrength: 0.45,
    guidance: { cfgScale: 7, steps: 30 },
    loras: source.generationDraft.loras,
    model: source.generationDraft.model,
    negativePrompt: source.generationDraft.negativePrompt,
    prompt: source.generationDraft.positivePrompt,
    sampling: { animaMethod: 'heun', sampler: 'DPM++ 2M', scheduler: 'Karras' },
    size: { height: 832, width: 1536 },
    vae: null,
    vaePrecision: 'Auto',
  })
  const payload = intent.definition.payload
  for (const excluded of [
    'seed',
    'dynamicPrompt',
    'clipSkip',
    'layers',
    'masks',
    'regions',
    'primaryBbox',
    'lastActualSeed',
    'lastActualSeedSnapshot',
  ]) {
    assert.equal(Object.hasOwn(payload, excluded), false, excluded)
  }
  assert.ok(validatePresetDefinition(intent.definition))
  payload.prompt.text = 'Independent editor value'
  payload.prompt.embeddingRefs[0].resource.displayName = 'Independent sidecar'
  payload.loras[0].weight = 1
  assert.deepEqual(source, before)
})

test('plain titles and .igs titles both receive a Baseline name', () => {
  for (const title of ['Source', 'Source.igs', 'Source.IGS']) {
    const source = project()
    source.title = title
    assert.equal(
      createProjectPresetIntent({ mode: 'txt2img', project: source }).definition.name,
      'Source Baseline',
    )
  }
})

test('workflow comes from actual mode; unknown visible contributors require choice regardless of strength', () => {
  const source = project()
  for (const mode of ['img2img', 'outpaint'] as const) {
    assert.equal(
      createProjectPresetIntent({ mode, project: source }).definition.workflow,
      'imageToImage',
    )
  }
  const text = createProjectPresetIntent({ mode: 'txt2img', project: source })
  assert.equal(text.definition.workflow, 'textToImage')
  assert.equal(Object.hasOwn(text.definition.payload, 'denoisingStrength'), false)
  assert.equal(
    createProjectPresetIntent({ mode: null, project: source }).definition.workflow,
    'textToImage',
  )
  source.layers = [layer({ visible: false }), layer({ opacity: 0 })]
  assert.equal(
    createProjectPresetIntent({ mode: null, project: source }).definition.workflow,
    'textToImage',
  )
  source.layers.push(layer())
  for (const strength of [null, 0, 1]) {
    source.generationDraft.sampling.denoisingStrength = strength
    const unknown = createProjectPresetIntent({ mode: null, project: source })
    assert.equal(unknown.definition.workflow, null)
    assert.equal(unknown.workflowUnknown, true)
    assert.equal(validatePresetDefinition(unknown.definition), null)
    unknown.definition.workflow = 'imageToImage'
    assert.ok(validatePresetDefinition(unknown.definition))
  }
})

test('unfinished guidance remains editable and must be repaired or excluded without invented defaults', () => {
  const source = project()
  source.generationDraft.model = null
  source.generationDraft.sampling = {
    cfgScale: null,
    denoisingStrength: null,
    sampler: null,
    scheduler: null,
    steps: null,
  }
  delete source.generationDraft.cfgRescale
  delete source.generationDraft.vaePrecision
  const intent = createProjectPresetIntent({ mode: null, project: source })
  assert.deepEqual(intent.definition.payload.guidance, { cfgScale: null, steps: null })
  for (const absent of ['model', 'sampling', 'cfgRescale', 'vaePrecision']) {
    assert.equal(Object.hasOwn(intent.definition.payload, absent), false)
  }
  assert.equal(validatePresetDefinition(intent.definition), null)
  intent.definition.payload.guidance = { cfgScale: 6, steps: 30 }
  assert.ok(validatePresetDefinition(intent.definition))
  intent.definition.payload.guidance = { cfgScale: null, steps: null }
  delete intent.definition.payload.guidance
  assert.ok(validatePresetDefinition(intent.definition))
})

test('Noob noise snapshot comes only from the exact ready identity, preserving copied advisory prediction and names', () => {
  const source = project()
  const installed = catalog(source.generationDraft.model!)
  const before = structuredClone({ installed, source })
  const matched = createProjectPresetIntent({
    catalog: installed,
    mode: 'img2img',
    project: source,
  })
  assert.deepEqual(
    matched.definition.payload.model?.noiseProfile,
    installed[0].versions[0].noiseProfile!.effective,
  )
  assert.equal(matched.definition.payload.model?.predictionType, 'v_prediction')
  assert.equal(matched.definition.payload.model?.displayName, 'Copied checkpoint')
  assert.equal(matched.definition.payload.model?.versionName, 'Saved version')
  const alterations = [
    { id: 'other-version' },
    { sha256: 'b'.repeat(64) },
    { civitaiFileId: 999 },
    { civitaiVersionId: 999 },
    { baseModelFamily: 'anima' as const },
    { fileStatus: 'corrupt' as const },
  ]
  for (const alteration of alterations) {
    const stale = structuredClone(installed)
    Object.assign(stale[0].versions[0], alteration)
    assert.equal(
      createProjectPresetIntent({ catalog: stale, mode: 'img2img', project: source }).definition
        .payload.model?.noiseProfile,
      undefined,
    )
  }
  for (const unavailable of [undefined, null, []]) {
    assert.equal(
      createProjectPresetIntent({ catalog: unavailable, mode: 'img2img', project: source })
        .definition.payload.model?.noiseProfile,
      undefined,
    )
  }
  assert.deepEqual({ installed, source }, before)
})

test('pending prompt binding overlays lack the chosen sidecar; acknowledged capture retains it while literal text stays literal', async () => {
  for (const binding of [true, false]) {
    const source = project()
    source.generationDraft.positivePrompt = { embeddingRefs: [], text: '' }
    let acknowledged: ProjectTab = {
      ...source,
      acceptedResults: [],
      autosaveError: null,
      canRedo: false,
      canUndo: false,
      dirty: false,
      documentId: '5817b89a-a0f1-47ee-8bf8-619a932866f7',
      documentRevision: '9c12a261-4923-4d31-bef7-8786f8540bde',
      id: `project-v1-${'a'.repeat(64)}`,
      lastActualSeedSnapshot: 0,
    }
    const embedding = resource('embedding')
    const token = '<chosen-exact-embedding>'
    const text = binding ? `${token}, portrait` : 'portrait without an embedding'
    let enter!: () => void
    let release!: () => void
    let settle!: () => void
    const entered = new Promise<void>((resolve) => {
      enter = resolve
    })
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const settled = new Promise<void>((resolve) => {
      settle = resolve
    })
    const view: { overlay: ProjectTab['generationDraft'] | null } = { overlay: null }
    const sync = new ProjectDraftSync({
      onAcknowledged: (tab) => {
        acknowledged = tab
      },
      onError: (_id, error) => {
        throw error
      },
      onOverlay: (_id, draft) => {
        view.overlay = draft
        if (draft === null) {
          settle()
        }
      },
      send: async (tabId, change) => {
        assert.equal(tabId, acknowledged.id)
        assert.equal(change.kind, 'positive-prompt')
        if (change.kind !== 'positive-prompt') {
          throw new Error('Unexpected fixture command')
        }
        // The collaborator computes its acknowledgement through the production binding rule.
        // File verification/storage are outside this renderer projection test.
        const prompt = reconcilePromptEmbeddings(
          { ...acknowledged.generationDraft.positivePrompt, text: change.text },
          [{ fileStatus: 'ready', resource: embedding, searchTerms: [], token }],
          change.embeddingSelection ? { resource: embedding, token } : undefined,
        )
        const reply = {
          ...acknowledged,
          generationDraft: { ...acknowledged.generationDraft, positivePrompt: prompt },
        }
        enter()
        await held
        return reply
      },
    })
    sync.change(acknowledged, {
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
    })
    await entered
    assert.ok(view.overlay, 'the actual sync owner exposes an unacknowledged visible overlay')
    const pending = createProjectPresetIntent({
      mode: 'txt2img',
      project: { ...acknowledged, generationDraft: view.overlay },
    })
    assert.equal(pending.definition.payload.prompt?.text, text)
    assert.deepEqual(pending.definition.payload.prompt?.embeddingRefs, [])
    release()
    await settled
    assert.equal(view.overlay, null)
    const complete = createProjectPresetIntent({ mode: 'txt2img', project: acknowledged })
    assert.equal(complete.definition.payload.prompt?.text, text)
    assert.deepEqual(
      complete.definition.payload.prompt?.embeddingRefs,
      binding ? [{ resource: embedding, token }] : [],
    )
    assert.equal(acknowledged.lastActualSeedSnapshot, 0)
    assert.equal(Object.hasOwn(complete.definition.payload, 'seed'), false)
  }
})

test('malformed resource roles are rejected instead of silently rewriting their identities', () => {
  for (const kind of ['model', 'vae', 'lora', 'embedding'] as const) {
    const source = project()
    switch (kind) {
      case 'lora': {
        source.generationDraft.loras[0].resource.kind = 'vae'
        break
      }
      case 'model': {
        source.generationDraft.model!.kind = 'lora'
        break
      }
      case 'vae': {
        source.generationDraft.vae = resource('checkpoint')
        break
      }
      default: {
        source.generationDraft.positivePrompt.embeddingRefs[0].resource.kind = 'checkpoint'
      }
    }
    const before = structuredClone(source)
    assert.throws(() => createProjectPresetIntent({ mode: 'img2img', project: source }))
    assert.deepEqual(source, before)
  }
})
