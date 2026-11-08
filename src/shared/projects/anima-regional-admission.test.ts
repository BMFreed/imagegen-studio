import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { supportsInferenceAnimaRegional } from './inference-worker-capabilities.js'
import { isProjectGenerationActionState } from './project-generation-actions.js'
import { createEmptyProjectDocumentV1, type IgsProjectDocumentV1 } from './project-schema.js'
import { getInvokeRegionalGenerationUnavailableReason } from './regional-invoke-generation.js'

function document(): IgsProjectDocumentV1 {
  const value = createEmptyProjectDocumentV1({
    primaryBbox: { height: 64, width: 512, x: 0, y: 0 },
    title: 'Anima regional admission',
  })
  const draft = value.generationDraft
  draft.model = {
    baseModelFamily: 'anima',
    civitaiFileId: null,
    civitaiModelId: null,
    civitaiVersionId: null,
    displayName: 'Anima',
    fileSha256: 'a'.repeat(64),
    kind: 'checkpoint',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: null,
    versionName: 'Original',
  }
  draft.sampling = {
    animaMethod: 'euler',
    cfgScale: 1,
    denoisingStrength: null,
    sampler: 'DPM++ 2M',
    scheduler: 'Karras',
    steps: 1,
  }
  draft.positivePrompt.text = '(cat)0'
  draft.negativePrompt.text = ''
  draft.vaePrecision = 'Auto'
  value.regionalGuidance = [
    {
      enabled: true,
      id: randomUUID(),
      locked: true,
      mask: { asset: null, id: randomUUID(), revision: 0 },
      name: 'Region',
      overlayOpacity: 0,
      prompts: {
        negative: null,
        positive: { embeddingRefs: [], text: '(white cat)0' },
        useGlobalNegativePrompt: true,
      },
    },
  ]
  return value
}

function reason(
  value: IgsProjectDocumentV1,
  options: Partial<Parameters<typeof getInvokeRegionalGenerationUnavailableReason>[0]> = {},
) {
  return getInvokeRegionalGenerationUnavailableReason({
    animaRegionalSupported: true,
    document: value,
    iterations: 1,
    targetMode: 'txt2img',
    ...options,
  })
}

test('Anima regional admission keeps literal zero weights and native Euler without changing inactive sampler fields', () => {
  const value = document()
  const before = structuredClone(value)
  assert.equal(reason(value), null)
  assert.deepEqual(value, before)
  value.generationDraft.sampling.cfgScale = 30
  value.generationDraft.sampling.steps = 200
  assert.equal(reason(value), null)
  assert.match(reason(value, { iterations: 2 })!, /one image per click/)
  for (const targetMode of ['img2img', 'outpaint'] as const) {
    assert.match(reason(value, { targetMode })!, /fully transparent/)
  }
  for (const animaRegionalSupported of [undefined, null, false]) {
    assert.match(
      reason(value, { animaRegionalSupported, runtimeSupported: true })!,
      /Anima Regional Guidance/,
    )
  }
})

test('inherited nonempty negative refuses; explicit local empty permits the unchanged global negative', () => {
  const value = document()
  value.generationDraft.negativePrompt.text = 'bad anatomy'
  const before = structuredClone(value)
  assert.match(reason(value)!, /turn off Use global negative prompt/)
  assert.deepEqual(value, before)
  value.regionalGuidance![0].prompts!.useGlobalNegativePrompt = false
  value.regionalGuidance![0].prompts!.negative = { embeddingRefs: [], text: '' }
  assert.equal(reason(value), null)
  value.regionalGuidance![0].prompts!.negative.text = ' '
  assert.match(reason(value)!, /local negative/)
})

test('finite regional refusals preserve disabled rows and demand nonempty enabled positives', () => {
  const cases: [(value: IgsProjectDocumentV1) => void, RegExp][] = [
    [
      (value) => {
        value.regionalGuidance![0].prompts!.positive = null
      },
      /nonempty positive/,
    ],
    [
      (value) => {
        value.regionalGuidance![0].prompts!.positive!.text = ''
      },
      /nonempty positive/,
    ],
    [
      (value) => {
        value.generationDraft.positivePrompt.text = '{cat|dog}'
      },
      /static/,
    ],
    [
      (value) => {
        value.generationDraft.sampling.animaMethod = 'heun'
      },
      /native Anima Euler/,
    ],
    [
      (value) => {
        value.generationDraft.cfgRescale = 0.1
      },
      /CFG Rescale 0/,
    ],
    [
      (value) => {
        value.generationDraft.vaePrecision = 'FP16'
      },
      /Auto VAE precision/,
    ],
    [
      (value) => {
        value.primaryBbox.width = 520
      },
      /64 to 512/,
    ],
  ]
  for (const [change, expected] of cases) {
    const value = document()
    change(value)
    const before = structuredClone(value)
    assert.match(reason(value)!, expected)
    assert.deepEqual(value, before)
    value.regionalGuidance![0].enabled = false
    assert.equal(reason(value, { animaRegionalSupported: false }), null)
  }
  const value = document()
  value.regionalGuidance![0].prompts!.positive!.text = ' '
  assert.equal(reason(value), null, 'Whitespace remains an authored emitting prompt.')
})

test('separate capability never follows from ordinary Anima or Illustrious regional strings', () => {
  const capabilities = [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
    'illustrious-lora',
    'illustrious-vae-precision',
    'illustrious-external-vae',
    'illustrious-embeddings',
    'illustrious-outpaint',
    'anima-txt2img',
    'anima-img2img',
    'anima-lora',
    'anima-prompt-weighting',
    'anima-flow-sampling',
    'anima-regional-txt2img-v1',
  ]
  const ready = {
    capabilities,
    protocolVersion: '1',
    runtimeProfile: 'linux-nvidia',
    workerVersion: '0.14.0',
  }
  assert.equal(supportsInferenceAnimaRegional(ready), true)
  for (const removed of ['anima-regional-txt2img-v1', 'anima-flow-sampling']) {
    assert.equal(
      supportsInferenceAnimaRegional({
        ...ready,
        capabilities: capabilities
          .filter((entry) => entry !== removed)
          .concat('illustrious-regional-invoke-v1'),
      }),
      false,
    )
  }
  for (const workerVersion of ['0.13.0', '0.15.0']) {
    assert.equal(supportsInferenceAnimaRegional({ ...ready, workerVersion }), false)
  }
  const state = {
    animaRegionalSupported: true,
    cfgRescaleSupported: true,
    documentId: randomUUID(),
    embeddingsSupported: true,
    error: null,
    externalVaeSupported: true,
    img2imgSupported: true,
    jobs: [],
    phase: 'idle',
    runningJobId: null,
    vaePrecisionSupported: true,
  }
  assert.equal(isProjectGenerationActionState(state), true)
  for (const animaRegionalSupported of [null, 1, 'true']) {
    assert.equal(isProjectGenerationActionState({ ...state, animaRegionalSupported }), false)
  }
})
