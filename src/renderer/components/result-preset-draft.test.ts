import { parsePresetDefinition } from '../../shared/presets/preset-schema.js'
import { ANIMA_SAMPLING_METHOD_KEYS } from '../../shared/projects/anima-sampling-method.js'
import type { RasterGenerationData } from '../../shared/projects/generation-settings-comparison.js'
import { isRasterGenerationData } from '../../shared/projects/generation-settings-comparison.js'
import type {
  IgsAnimaRasterGenerationProvenanceV1,
  IgsIllustriousRasterGenerationProvenanceV1,
  IgsRasterGenerationProvenanceV1,
} from '../../shared/projects/project-schema.js'
import {
  createEmptyProjectDocumentV1,
  isRasterGenerationConfigurationV1,
  parseRasterGenerationProvenanceV1,
} from '../../shared/projects/project-schema.js'
import { parseSmartResultPresetData } from '../../shared/projects/smart-result-preset.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { reactive } from 'vue'

import {
  acceptedAnimaProvenanceFixture,
  acceptedRasterProvenanceFixture,
} from '../../main/projects/test-fixtures/accepted-provenance.js'
import { createResultPresetIntent, createSmartResultPresetIntent } from './result-preset-draft.js'

/** Actual strict portable metadata fixtures; this suite does not claim PNG or ML execution. */
function fixture(family: 'anima'): IgsAnimaRasterGenerationProvenanceV1
function fixture(family?: 'illustrious'): IgsIllustriousRasterGenerationProvenanceV1
function fixture(family: 'anima' | 'illustrious' = 'illustrious'): IgsRasterGenerationProvenanceV1 {
  const document = createEmptyProjectDocumentV1({ title: 'Accepted source.igs' })
  const bbox = { height: 832, width: 1536, x: 170, y: -45 }
  const provenance =
    family === 'anima'
      ? acceptedAnimaProvenanceFixture(document, Buffer.from('metadata input'), bbox)
      : acceptedRasterProvenanceFixture(document, Buffer.from('metadata input'), bbox)
  assert.deepEqual(parseRasterGenerationProvenanceV1(provenance), provenance)
  return provenance
}

function data(provenance: IgsRasterGenerationProvenanceV1): RasterGenerationData {
  const result: RasterGenerationData = {
    currentMode: 'txt2img',
    documentId: provenance.layerSourceContext.sourceDocumentId,
    generationConfiguration: provenance.generationConfiguration,
    layerId: randomUUID(),
    modeUnavailableReason: null,
  }
  assert.equal(isRasterGenerationData(result), true)
  return result
}

function intent(source: RasterGenerationData) {
  return createResultPresetIntent({
    data: source,
    layerName: 'Accepted portrait',
    projectName: 'Edited Project.igs',
  })
}

function fullIllustriousRecord() {
  const provenance = fixture()
  const recorded = provenance.generationConfiguration
  recorded.model.predictionType = 'v_prediction'
  recorded.model.displayName = 'Recorded Noob checkpoint'
  recorded.positivePrompt = {
    embeddingRefs: [
      {
        resource: { ...recorded.model, kind: 'embedding', predictionType: null },
        token: '<saved-alias>',
      },
    ],
    text: '<saved-alias>, concrete red portrait',
  }
  recorded.negativePrompt = { embeddingRefs: [], text: 'concrete fog, blur' }
  recorded.sampling.noiseProfile = {
    baseSchedule: 'sdxl-scaled-linear-v1',
    rescaleBetasZeroSnr: true,
    schemaVersion: 1,
    timestepSpacing: 'trailing',
  }
  recorded.sampling.actualSeed = 0
  recorded.sampling.requestedSeedPolicy = 'reuse'
  recorded.sampling.seedBehavior = 'per-prompt'
  recorded.loras = [
    { enabled: true, resource: { ...recorded.model, kind: 'lora' }, weight: -0.7 },
    {
      enabled: false,
      resource: { ...recorded.model, baseModelFamily: 'anima', kind: 'lora', predictionType: null },
      weight: 1.2,
    },
  ]
  recorded.vae = { ...recorded.model, kind: 'vae', predictionType: null }
  recorded.cfgRescale = 0
  recorded.vaePrecision = 'FP32'
  assert.deepEqual(parseRasterGenerationProvenanceV1(provenance), provenance)
  return provenance
}

test('accepted-result projection captures concrete prompts, exact resources and portable settings from immutable metadata', () => {
  const provenance = fullIllustriousRecord()
  const source = data(provenance)
  const before = structuredClone(source)
  const created = intent(source)
  assert.equal(created.kind, 'result')
  assert.equal(created.definition.name, 'Accepted portrait Preset')
  assert.equal(created.layerName, 'Accepted portrait')
  assert.equal(created.projectName, 'Edited Project.igs')
  assert.equal(created.projectSummary, '1536 × 832 · Recorded Noob checkpoint')
  assert.equal(created.workflowUnknown, false)
  assert.equal(created.definition.workflow, 'textToImage')
  assert.deepEqual(created.unavailableSections, [])
  assert.deepEqual(created.definition.payload, {
    cfgRescale: 0,
    guidance: { cfgScale: 7.5, steps: 24 },
    loras: provenance.generationConfiguration.loras,
    model: {
      ...provenance.generationConfiguration.model,
      noiseProfile: {
        baseSchedule: 'sdxl-scaled-linear-v1',
        rescaleBetasZeroSnr: true,
        schemaVersion: 1,
        timestepSpacing: 'trailing',
      },
    },
    negativePrompt: { embeddingRefs: [], text: 'concrete fog, blur' },
    prompt: {
      embeddingRefs: provenance.generationConfiguration.positivePrompt.embeddingRefs,
      text: '<saved-alias>, concrete red portrait',
    },
    sampling: { sampler: 'DPM++ 2M', scheduler: 'Karras' },
    size: { height: 832, width: 1536 },
    vae: provenance.generationConfiguration.vae,
    vaePrecision: 'FP32',
  })
  assert.deepEqual(parsePresetDefinition(created.definition), created.definition)
  assert.deepEqual(source, before)
})

test('result draft edits are detached from frozen source, including sidecars, LoRAs, VAE and noise profile in Vue proxies', () => {
  const source = data(fullIllustriousRecord())
  const before = structuredClone(source)
  const created = intent(reactive(source))
  const payload = created.definition.payload
  payload.prompt!.text = 'Independent editor value'
  payload.prompt!.embeddingRefs[0].resource.displayName = 'Independent sidecar'
  payload.loras![0].weight = 0.2
  payload.loras![1].enabled = true
  payload.model!.predictionType = 'epsilon'
  payload.model!.noiseProfile!.rescaleBetasZeroSnr = false
  payload.vae!.versionName = 'Independent VAE'
  payload.size!.width = 512
  assert.deepEqual(source, before)
  source.generationConfiguration!.positivePrompt.text = 'Later source change'
  assert.equal(payload.prompt!.text, 'Independent editor value')
})

test('unrecorded optional settings remain absent; legacy metadata invents no empty stack, Embedded VAE or neutral defaults', () => {
  const provenance = fixture()
  const source = data(provenance)
  const before = structuredClone(source)
  const created = intent(source)
  for (const key of ['loras', 'vae', 'cfgRescale', 'vaePrecision'] as const) {
    assert.equal(Object.hasOwn(created.definition.payload, key), false, key)
  }
  assert.equal(Object.hasOwn(created.definition.payload.model!, 'noiseProfile'), false)
  assert.deepEqual(created.unavailableSections, ['loras', 'vae', 'cfgRescale', 'vaePrecision'])
  assert.deepEqual(parsePresetDefinition(created.definition), created.definition)
  assert.deepEqual(source, before)
})

test('recorded empty LoRA stack, Embedded VAE, CFG Rescale zero and Auto precision remain explicit neighboring controls', () => {
  const provenance = fixture()
  Object.assign(provenance.generationConfiguration, {
    cfgRescale: 0,
    loras: [],
    vae: null,
    vaePrecision: 'Auto',
  })
  assert.deepEqual(parseRasterGenerationProvenanceV1(provenance), provenance)
  const created = intent(data(provenance))
  assert.deepEqual(created.definition.payload.loras, [])
  assert.equal(created.definition.payload.vae, null)
  assert.equal(created.definition.payload.cfgRescale, 0)
  assert.equal(created.definition.payload.vaePrecision, 'Auto')
  assert.deepEqual(created.unavailableSections, [])
  assert.deepEqual(parsePresetDefinition(created.definition), created.definition)
})

test('workflow and denoising strength come from saved result mode, independent of an unrelated or unavailable current target', () => {
  for (const family of ['anima', 'illustrious'] as const) {
    const provenance = family === 'anima' ? fixture('anima') : fixture()
    for (const mode of ['txt2img', 'img2img', 'outpaint'] as const) {
      const configuration = structuredClone(provenance.generationConfiguration)
      Object.assign(configuration, {
        mode,
        sampling: {
          ...configuration.sampling,
          ...(mode === 'txt2img' ? {} : { denoisingStrength: 0 }),
        },
      })
      assert.equal(isRasterGenerationConfigurationV1(configuration), true)
      for (const currentMode of ['txt2img', 'img2img', 'outpaint', null] as const) {
        const source: RasterGenerationData = {
          ...data(provenance),
          currentMode,
          generationConfiguration: configuration,
          modeUnavailableReason: currentMode === null ? 'No active source target' : null,
        }
        const created = intent(source)
        assert.equal(
          created.definition.workflow,
          mode === 'txt2img' ? 'textToImage' : 'imageToImage',
        )
        assert.equal(created.workflowUnknown, false)
        assert.equal(
          Object.hasOwn(created.definition.payload, 'denoisingStrength'),
          mode !== 'txt2img',
        )
        if (mode !== 'txt2img') {
          assert.equal(created.definition.payload.denoisingStrength, 0)
        }
        assert.deepEqual(parsePresetDefinition(created.definition), created.definition)
      }
    }
  }
})

test('Anima copies every recorded native method without SD sampler fields or component identities disguised as preset VAE', () => {
  for (const animaMethod of ANIMA_SAMPLING_METHOD_KEYS) {
    const provenance = fixture('anima')
    provenance.generationConfiguration.sampling.animaMethod = animaMethod
    assert.deepEqual(parseRasterGenerationProvenanceV1(provenance), provenance)
    const created = intent(data(provenance))
    assert.deepEqual(created.definition.payload.sampling, { animaMethod })
    assert.deepEqual(created.definition.payload.loras, [])
    assert.equal(created.definition.payload.cfgRescale, 0)
    assert.equal(created.definition.payload.vaePrecision, 'Auto')
    assert.equal(created.definition.payload.model!.predictionType, null)
    assert.equal(Object.hasOwn(created.definition.payload, 'vae'), false)
    assert.equal(Object.hasOwn(created.definition.payload, 'anima'), false)
    assert.deepEqual(created.unavailableSections, ['vae'])
    assert.deepEqual(parsePresetDefinition(created.definition), created.definition)
  }
})

test('historical seed policy and actual zero remain source facts; batch, execution and layer identities never enter a result preset', () => {
  for (const requestedSeedPolicy of ['fixed', 'random', 'reuse'] as const) {
    const provenance = fullIllustriousRecord()
    provenance.generationConfiguration.sampling.requestedSeedPolicy = requestedSeedPolicy
    const source = data(provenance)
    const before = structuredClone(source)
    const created = intent(source)
    for (const excluded of [
      'seed',
      'actualSeed',
      'requestedSeedPolicy',
      'seedBehavior',
      'dynamicPrompt',
      'maxPrompts',
      'clipSkip',
      'regions',
      'mask',
      'bbox',
      'internalResolution',
      'layerSourceContext',
      'executionResultContext',
      'documentId',
      'layerId',
      'invokeScheduler',
    ]) {
      assert.equal(Object.hasOwn(created.definition.payload, excluded), false, excluded)
      assert.equal(Object.hasOwn(created.definition.payload.sampling!, excluded), false, excluded)
    }
    assert.deepEqual(source, before)
    assert.equal(source.generationConfiguration!.sampling.actualSeed, 0)
    assert.equal(source.generationConfiguration!.sampling.requestedSeedPolicy, requestedSeedPolicy)
  }
})

test('imported or legacy layers with no portable configuration refuse result authoring instead of copying current Project settings', () => {
  const source = data(fixture())
  source.generationConfiguration = null
  assert.throws(() => intent(source), /no saved generation configuration.*Save Current as Preset/)
  assert.equal(source.generationConfiguration, null)
})

test('invalid or private transport data refuses authoring rather than normalizing it into a portable preset', () => {
  for (const change of [
    (source: RasterGenerationData) => Object.assign(source, { layerSourceContext: { mask: [] } }),
    (source: RasterGenerationData) => {
      Object.assign(source.generationConfiguration!.model, { managedPath: '/private/model' })
    },
    (source: RasterGenerationData) => Object.assign(source, { layerId: 'unknown layer' }),
    (source: RasterGenerationData) => Object.assign(source, { currentMode: 'smartPatch' }),
    (source: RasterGenerationData) => {
      Object.assign(source.generationConfiguration!.positivePrompt.embeddingRefs[0].resource, {
        kind: 'checkpoint',
      })
    },
  ]) {
    const source = data(fullIllustriousRecord())
    change(source)
    const before = structuredClone(source)
    assert.throws(() => intent(source), /saved result generation data is invalid/)
    assert.deepEqual(source, before)
  }
})

test('Smart result drafts preserve portable frozen settings and identities while omitting geometry and Seed', () => {
  for (const family of ['illustrious', 'anima'] as const) {
    const recorded = family === 'illustrious' ? fullIllustriousRecord() : fixture('anima')
    const raster = intent(data(recorded)).definition.payload
    const { size: _size, ...payload } = raster
    const resultId = randomUUID()
    const source = parseSmartResultPresetData({
      assetSha256: 'b'.repeat(64),
      documentId: randomUUID(),
      documentRevision: randomUUID(),
      owner: { kind: 'smart-patch-variant', layerId: randomUUID(), variantId: resultId },
      payload,
      resultId,
      workflow: 'smartPatch',
    })
    const before = structuredClone(source)
    const created = createSmartResultPresetIntent({
      data: reactive(source),
      layerName: 'Patch · Inspected inactive variant',
      projectName: 'Dirty Project.igs',
    })
    assert.equal(created.definition.workflow, 'smartPatch')
    assert.equal(created.smartGeometryExcluded, true)
    assert.equal(
      created.projectSummary,
      `${payload.model!.displayName} · ${payload.model!.versionName}`,
    )
    assert.deepEqual(created.definition.payload, payload)
    assert.equal(Object.hasOwn(created.definition.payload, 'size'), false)
    assert.equal(Object.hasOwn(created.definition.payload, 'seed'), false)
    assert.equal(Object.hasOwn(created.definition.payload, 'anima'), false)
    assert.deepEqual(parsePresetDefinition(created.definition).payload, payload)
    created.definition.payload.prompt!.text = 'Detached edit'
    created.definition.payload.model!.displayName = 'Detached model label'
    assert.deepEqual(source, before)
    assert.deepEqual(source.payload.prompt, recorded.generationConfiguration.positivePrompt)
    assert.deepEqual(source.payload.loras, recorded.generationConfiguration.loras)

    for (const extra of [
      { size: { height: 256, width: 256 } },
      { seed: { policy: 'fixed', value: 0 } },
      { sourceTarget: { sha256: 'c'.repeat(64) } },
    ]) {
      const invalid = structuredClone(source)
      Object.assign(invalid.payload, extra)
      assert.throws(
        () =>
          createSmartResultPresetIntent({
            data: invalid,
            layerName: 'Patch',
            projectName: 'Project',
          }),
        /saved Smart result settings are invalid/,
      )
    }
  }
})
