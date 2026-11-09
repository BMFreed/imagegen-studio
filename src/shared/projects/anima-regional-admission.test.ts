import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { ANIMA_SAMPLING_METHOD_KEYS } from './anima-sampling-method.js'
import {
  supportsInferenceAnimaRegional,
  supportsInferenceAnimaRegionalImg2Img,
  supportsInferenceAnimaRegionalLora,
  supportsInferenceAnimaRegionalNegative,
  supportsInferenceAnimaRegionalOutpaint,
  supportsInferenceAnimaRegionalSampling,
} from './inference-worker-capabilities.js'
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

for (const mode of ['txt2img', 'img2img', 'outpaint'] as const) {
  test(`Anima regional ${mode} enabled signed or zero LoRA needs its own capability; disabled stays inert`, () => {
    const value = document()
    value.generationDraft.sampling.denoisingStrength = mode === 'txt2img' ? null : 0.5
    const options = {
      animaRegionalImg2ImgSupported: true,
      animaRegionalOutpaintSupported: true,
      targetMode: mode,
    }
    for (const weight of [-1, 0, 0.75]) {
      value.generationDraft.loras = [
        {
          enabled: true,
          resource: { ...value.generationDraft.model!, kind: 'lora' },
          weight,
        },
      ]
      const before = structuredClone(value)
      for (const animaRegionalLoraSupported of [undefined, null, false, true]) {
        assert.equal(
          reason(value, { ...options, animaRegionalLoraSupported }) === null,
          animaRegionalLoraSupported === true,
        )
      }
      assert.deepEqual(value, before)
      value.generationDraft.loras[0].enabled = false
      assert.equal(reason(value, options), null)
    }
  })
}

test('Anima regional LoRA capability requires its own exact qualified ordinary and regional peer', () => {
  const ready = {
    capabilities: [
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
      'anima-regional-lora-v1',
    ],
    protocolVersion: '1',
    runtimeProfile: 'linux-nvidia',
    workerVersion: '0.14.0',
  }
  assert.equal(supportsInferenceAnimaRegionalLora(ready), true)
  for (const missing of ['anima-lora', 'anima-regional-txt2img-v1', 'anima-regional-lora-v1']) {
    assert.equal(
      supportsInferenceAnimaRegionalLora({
        ...ready,
        capabilities: ready.capabilities
          .filter((cap) => cap !== missing)
          .concat('illustrious-regional-lora-v1'),
      }),
      false,
      missing,
    )
  }
  for (const workerVersion of ['0.13.0', '0.15.0']) {
    assert.equal(supportsInferenceAnimaRegionalLora({ ...ready, workerVersion }), false)
  }
  assert.equal(
    supportsInferenceAnimaRegional({
      ...ready,
      capabilities: ready.capabilities.filter((cap) => cap !== 'anima-regional-lora-v1'),
    }),
    true,
  )
})

test('Anima regional LoRA action state is optional but strictly Boolean', () => {
  const state = {
    cfgRescaleSupported: false,
    documentId: randomUUID(),
    embeddingsSupported: false,
    error: null,
    externalVaeSupported: false,
    img2imgSupported: false,
    jobs: [],
    phase: 'idle',
    runningJobId: null,
    vaePrecisionSupported: false,
  }
  for (const animaRegionalLoraSupported of [undefined, false, true]) {
    assert.equal(isProjectGenerationActionState({ ...state, animaRegionalLoraSupported }), true)
  }
  for (const animaRegionalLoraSupported of [null, 0, 1, 'true', {}, []]) {
    assert.equal(isProjectGenerationActionState({ ...state, animaRegionalLoraSupported }), false)
  }
})

test('Anima regional admission keeps literal zero weights and native Euler without changing inactive sampler fields', () => {
  const value = document()
  const before = structuredClone(value)
  assert.equal(reason(value), null)
  assert.deepEqual(value, before)
  value.generationDraft.sampling.cfgScale = 30
  value.generationDraft.sampling.steps = 200
  assert.equal(reason(value), null)
  assert.equal(reason(value, { iterations: 2 }), null)
  assert.match(reason(value, { targetMode: 'outpaint' })!, /Anima Regional Guidance outpaint/)
  value.generationDraft.sampling.denoisingStrength = 0.5
  assert.match(
    reason(value, { targetMode: 'img2img' })!,
    /support for Anima Regional Guidance img2img/,
  )
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
        value.generationDraft.negativePrompt.text = '{bad|worse}'
        value.regionalGuidance![0].prompts!.useGlobalNegativePrompt = false
        value.regionalGuidance![0].prompts!.negative = { embeddingRefs: [], text: '' }
      },
      /static global negative and regional/,
    ],
    [
      (value) => {
        value.generationDraft.sampling.animaMethod = 'heun'
      },
      /Anima Regional Guidance sampling method/,
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

for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
  test(`regional Anima ${method} requires only its own explicit sampling capability`, () => {
    const value = document()
    value.generationDraft.sampling.animaMethod = method
    const before = structuredClone(value)
    for (const animaRegionalSamplingSupported of [undefined, null, false, true]) {
      assert.equal(
        reason(value, { animaRegionalSamplingSupported }) === null,
        method === 'euler' || animaRegionalSamplingSupported === true,
      )
    }
    assert.equal(
      reason(value, { animaRegionalSamplingSupported: true, animaRegionalSupported: false }) ===
        null,
      false,
    )
    assert.deepEqual(value, before)
  })
}

test('regional sampling capability requires the complete ordinary and regional worker contract', () => {
  const ready = {
    capabilities: [
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
      'anima-regional-sampling-v1',
    ],
    protocolVersion: '1',
    runtimeProfile: 'linux-nvidia',
    workerVersion: '0.14.0',
  }
  assert.equal(supportsInferenceAnimaRegionalSampling(ready), true)
  const imageReady = {
    ...ready,
    capabilities: [...ready.capabilities, 'anima-regional-img2img-v1'],
  }
  assert.equal(supportsInferenceAnimaRegionalImg2Img(ready), false)
  assert.equal(supportsInferenceAnimaRegionalImg2Img(imageReady), true)
  const outpaintReady = {
    ...imageReady,
    capabilities: [...imageReady.capabilities, 'anima-outpaint', 'anima-regional-outpaint-v1'],
  }
  assert.equal(supportsInferenceAnimaRegionalOutpaint(outpaintReady), true)
  assert.equal(supportsInferenceAnimaRegionalOutpaint(imageReady), false)
  for (const missing of [
    'anima-outpaint',
    'anima-regional-img2img-v1',
    'anima-regional-outpaint-v1',
    'anima-regional-txt2img-v1',
  ]) {
    assert.equal(
      supportsInferenceAnimaRegionalOutpaint({
        ...outpaintReady,
        capabilities: outpaintReady.capabilities.filter((cap) => cap !== missing),
      }),
      false,
      missing,
    )
  }
  for (const workerVersion of ['0.13.0', '0.15.0']) {
    assert.equal(supportsInferenceAnimaRegionalOutpaint({ ...outpaintReady, workerVersion }), false)
  }

  assert.equal(
    supportsInferenceAnimaRegionalImg2Img({
      ...imageReady,
      capabilities: imageReady.capabilities.filter((cap) => cap !== 'anima-regional-txt2img-v1'),
    }),
    false,
  )
  for (const missing of ready.capabilities) {
    const peer = { ...ready, capabilities: ready.capabilities.filter((value) => value !== missing) }
    assert.equal(supportsInferenceAnimaRegionalSampling(peer), false, missing)
    if (missing === 'anima-regional-sampling-v1') {
      assert.equal(supportsInferenceAnimaRegional(peer), true)
    }
  }
  for (const workerVersion of ['0.13.0', '0.15.0']) {
    assert.equal(supportsInferenceAnimaRegionalSampling({ ...ready, workerVersion }), false)
  }
})

test('optional regional sampling action state admits only actual Boolean capability values', () => {
  const state = {
    cfgRescaleSupported: false,
    documentId: randomUUID(),
    embeddingsSupported: false,
    error: null,
    externalVaeSupported: false,
    img2imgSupported: false,
    jobs: [],
    phase: 'idle',
    runningJobId: null,
    vaePrecisionSupported: false,
  }
  assert.equal(isProjectGenerationActionState(state), true)
  for (const animaRegionalOutpaintSupported of [true, false, undefined]) {
    assert.equal(isProjectGenerationActionState({ ...state, animaRegionalOutpaintSupported }), true)
  }
  for (const animaRegionalOutpaintSupported of [null, 0, 'true', {}, []]) {
    assert.equal(
      isProjectGenerationActionState({ ...state, animaRegionalOutpaintSupported }),
      false,
    )
  }
  for (const animaRegionalImg2ImgSupported of [true, false, undefined]) {
    assert.equal(isProjectGenerationActionState({ ...state, animaRegionalImg2ImgSupported }), true)
  }
  for (const animaRegionalImg2ImgSupported of [null, 0, 'true', {}, []]) {
    assert.equal(isProjectGenerationActionState({ ...state, animaRegionalImg2ImgSupported }), false)
  }
  for (const animaRegionalSamplingSupported of [true, false, undefined]) {
    assert.equal(isProjectGenerationActionState({ ...state, animaRegionalSamplingSupported }), true)
  }
  for (const animaRegionalSamplingSupported of [null, 0, 'true', {}, []]) {
    assert.equal(
      isProjectGenerationActionState({ ...state, animaRegionalSamplingSupported }),
      false,
    )
  }
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

for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
  test(`opaque regional ${method} advisory requires image and selected-method capabilities with explicit strength`, () => {
    const value = document()
    value.generationDraft.sampling.animaMethod = method
    for (const strength of [0, 0.5, 1]) {
      value.generationDraft.sampling.denoisingStrength = strength
      for (const animaRegionalImg2ImgSupported of [undefined, null, false, true]) {
        assert.equal(
          reason(value, {
            animaRegionalImg2ImgSupported,
            animaRegionalSamplingSupported: true,
            targetMode: 'img2img',
          }) === null,
          animaRegionalImg2ImgSupported === true,
        )
      }
    }
    for (const strength of [null, -0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      value.generationDraft.sampling.denoisingStrength = strength
      assert.match(
        reason(value, {
          animaRegionalImg2ImgSupported: true,
          animaRegionalSamplingSupported: true,
          targetMode: 'img2img',
        })!,
        /Denoising Strength/,
      )
    }
  })
}

for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
  test(`mixed-alpha regional ${method} advisory requires OUT capability explicit strength and saved method support`, () => {
    const value = document()
    value.generationDraft.sampling.animaMethod = method
    value.generationDraft.sampling.denoisingStrength = 0.5
    for (const animaRegionalOutpaintSupported of [undefined, false, true]) {
      for (const animaRegionalSamplingSupported of [undefined, false, true]) {
        assert.equal(
          reason(value, {
            animaRegionalOutpaintSupported,
            animaRegionalSamplingSupported,
            targetMode: 'outpaint',
          }) === null,
          animaRegionalOutpaintSupported === true &&
            (method === 'euler' || animaRegionalSamplingSupported === true),
        )
      }
    }
    for (const strength of [null, -1, 1.01, Infinity, NaN]) {
      value.generationDraft.sampling.denoisingStrength = strength
      assert.match(
        reason(value, {
          animaRegionalOutpaintSupported: true,
          animaRegionalSamplingSupported: true,
          targetMode: 'outpaint',
        })!,
        /Denoising Strength/,
      )
    }
  })
}

// Batch admission expands only Current Canvas positive text. The actual planner,
// frozen membership and SQL/files are exercised by the Main public suite.
test('Anima advisory accepts global-positive expansion without editing authored syntax or dormant rows', () => {
  const value = document()
  value.generationDraft.positivePrompt.text = 'a {red|blue} {cat|dog}'
  value.generationDraft.dynamicPrompt = { maxPrompts: 2, seedBehavior: 'per-prompt' }
  value.regionalGuidance!.push({
    ...structuredClone(value.regionalGuidance![0]),
    enabled: false,
    id: randomUUID(),
    mask: { asset: null, id: randomUUID(), revision: 0 },
    prompts: {
      negative: { embeddingRefs: [], text: '{dormant|negative}' },
      positive: { embeddingRefs: [], text: '{dormant|positive}' },
      useGlobalNegativePrompt: false,
    },
  })
  const before = structuredClone(value)
  assert.equal(reason(value, { iterations: 2 }), null)
  assert.deepEqual(value, before)
})

for (const iterations of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 101, true, '2']) {
  test(`Anima advisory refuses non-authorable Images ${String(iterations)} before selecting a batch`, () => {
    const value = document()
    const before = structuredClone(value)
    assert.match(
      reason(value, { iterations: iterations as unknown as number })!,
      /Set Images to an integer from 1 to 100/,
    )
    assert.deepEqual(value, before)
  })
}

test('Anima advisory preserves the actual maxPrompts prefix but never truncates overflowing jobs', () => {
  const value = document()
  value.generationDraft.positivePrompt.text = '{first|second|third}'
  value.generationDraft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
  assert.equal(reason(value, { iterations: 32 }), null)
  assert.match(reason(value, { iterations: 33 })!, /batch admission limit/)
  value.generationDraft.dynamicPrompt.maxPrompts = 2
  assert.equal(reason(value, { iterations: 16 }), null)
  assert.match(reason(value, { iterations: 17 })!, /batch admission limit/)
})

for (const branch of ['global-negative', 'regional-positive', 'regional-negative'] as const) {
  test(`Anima advisory retains static ${branch} despite global-positive expansion`, () => {
    const value = document()
    value.generationDraft.positivePrompt.text = '{cat|dog}'
    value.generationDraft.dynamicPrompt = { maxPrompts: 2, seedBehavior: 'per-iteration' }
    const region = value.regionalGuidance![0]
    region.prompts!.useGlobalNegativePrompt = false
    region.prompts!.negative = { embeddingRefs: [], text: '' }
    if (branch === 'global-negative') {
      value.generationDraft.negativePrompt.text = '{bad|worse}'
    }
    if (branch === 'regional-positive') {
      region.prompts!.positive!.text = '{red|blue}'
    }
    if (branch === 'regional-negative') {
      region.prompts!.negative.text = '{bad|worse}'
    }
    const before = structuredClone(value)
    assert.notEqual(reason(value, { iterations: 2 }), null)
    assert.deepEqual(value, before)
  })
}

for (const positive of ['{cat|dog', '{cat|dog}{broken', '{cat|dog}|broken}']) {
  test(`Anima advisory validates complete positive grammar beyond maxPrompts1: ${positive}`, () => {
    const value = document()
    value.generationDraft.positivePrompt.text = positive
    value.generationDraft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
    assert.notEqual(reason(value, { iterations: 1 }), null)
  })
}

test('Anima regional negative capability is additive and keeps every ordinary and regional prerequisite', () => {
  const ready = {
    capabilities: [
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
      'anima-regional-negative-v1',
    ],
    protocolVersion: '1',
    runtimeProfile: 'linux-nvidia',
    workerVersion: '0.14.0',
  }
  assert.equal(supportsInferenceAnimaRegionalNegative(ready), true)
  for (const capability of [
    'anima-regional-negative-v1',
    'anima-regional-txt2img-v1',
    'anima-txt2img',
    'anima-prompt-weighting',
    'anima-flow-sampling',
  ]) {
    const peer = {
      ...ready,
      capabilities: ready.capabilities.filter((entry) => entry !== capability),
    }
    assert.equal(supportsInferenceAnimaRegionalNegative(peer), false)
  }
  for (const workerVersion of ['0.13.0', '0.15.0', null]) {
    assert.equal(supportsInferenceAnimaRegionalNegative({ ...ready, workerVersion }), false)
  }
})

for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
  for (const source of ['local', 'inherited'] as const) {
    test(`Anima ${method} ${source} negative requires its own capability at CFG1 and CFG4 in every mode`, () => {
      for (const cfgScale of [1, 4]) {
        for (const targetMode of ['txt2img', 'img2img', 'outpaint'] as const) {
          const value = document()
          value.generationDraft.sampling.animaMethod = method
          value.generationDraft.sampling.cfgScale = cfgScale
          value.generationDraft.sampling.denoisingStrength = targetMode === 'txt2img' ? null : 0.5
          value.generationDraft.negativePrompt.text = '(blur)0.75'
          const prompts = value.regionalGuidance![0].prompts!
          prompts.useGlobalNegativePrompt = source === 'inherited'
          prompts.negative = {
            embeddingRefs: [],
            text: source === 'local' ? '(red scarf)1.5' : '{dormant|negative}',
          }
          const before = structuredClone(value)
          const options = {
            animaRegionalImg2ImgSupported: true,
            animaRegionalOutpaintSupported: true,
            animaRegionalSamplingSupported: true,
            targetMode,
          }
          assert.match(
            reason(value, options)!,
            /Checking image engine support for Anima regional negative prompts/,
          )
          assert.match(
            reason(value, { ...options, animaRegionalNegativeSupported: false })!,
            /does not support Anima regional negative prompts/,
          )
          assert.equal(reason(value, { ...options, animaRegionalNegativeSupported: true }), null)
          assert.deepEqual(value, before)
        }
      }
    })
  }
}

test('Anima regional negative capability cannot grant missing method image OUT or base support', () => {
  const value = document()
  value.generationDraft.negativePrompt.text = 'noise'
  const options = {
    animaRegionalImg2ImgSupported: true,
    animaRegionalNegativeSupported: true,
    animaRegionalOutpaintSupported: true,
    animaRegionalSamplingSupported: true,
  }
  assert.match(
    reason(value, { ...options, animaRegionalSupported: false })!,
    /does not support Anima Regional Guidance/,
  )
  value.generationDraft.sampling.animaMethod = 'heun'
  assert.match(
    reason(value, { ...options, animaRegionalSamplingSupported: false })!,
    /sampling method/,
  )
  value.generationDraft.sampling.denoisingStrength = 0.5
  assert.match(
    reason(value, { ...options, animaRegionalImg2ImgSupported: false, targetMode: 'img2img' })!,
    /img2img/,
  )
  assert.match(
    reason(value, { ...options, animaRegionalOutpaintSupported: false, targetMode: 'outpaint' })!,
    /outpaint/,
  )
})

test('Anima negative admission leaves dormant disabled and local-empty branches on legacy peers', () => {
  const value = document()
  value.generationDraft.negativePrompt.text = 'ordinary global negative'
  value.regionalGuidance![0].prompts!.useGlobalNegativePrompt = false
  value.regionalGuidance![0].prompts!.negative = { embeddingRefs: [], text: '' }
  assert.equal(reason(value, { animaRegionalNegativeSupported: false }), null)
  value.generationDraft.negativePrompt.text = ''
  value.regionalGuidance![0].prompts!.useGlobalNegativePrompt = true
  value.regionalGuidance![0].prompts!.negative.text = '{dormant|negative}'
  assert.equal(reason(value, { animaRegionalNegativeSupported: false }), null)
  value.regionalGuidance!.push({
    ...structuredClone(value.regionalGuidance![0]),
    enabled: false,
    id: randomUUID(),
    mask: { asset: null, id: randomUUID(), revision: 0 },
    prompts: {
      negative: { embeddingRefs: [], text: 'disabled negative' },
      positive: null,
      useGlobalNegativePrompt: false,
    },
  })
  assert.equal(reason(value, { animaRegionalNegativeSupported: false }), null)
})

test('Anima signed admission retains exact whitespace static text and source resource refusals', () => {
  const value = document()
  const prompts = value.regionalGuidance![0].prompts!
  prompts.useGlobalNegativePrompt = false
  prompts.negative = { embeddingRefs: [], text: ' ' }
  assert.match(reason(value)!, /regional negative prompts/)
  assert.equal(reason(value, { animaRegionalNegativeSupported: true }), null)
  prompts.negative.text = '{bad|worse}'
  assert.match(
    reason(value, { animaRegionalNegativeSupported: true })!,
    /static global negative and regional/,
  )
})

test('optional Anima regional negative state rejects null strings and all nonboolean values', () => {
  const state = {
    cfgRescaleSupported: false,
    documentId: randomUUID(),
    embeddingsSupported: false,
    error: null,
    externalVaeSupported: false,
    img2imgSupported: false,
    jobs: [],
    phase: 'idle',
    runningJobId: null,
    vaePrecisionSupported: false,
  }
  assert.equal(isProjectGenerationActionState(state), true)
  for (const animaRegionalNegativeSupported of [undefined, false, true]) {
    assert.equal(isProjectGenerationActionState({ ...state, animaRegionalNegativeSupported }), true)
  }
  for (const animaRegionalNegativeSupported of [null, 'true', 1, 0, {}, []]) {
    assert.equal(
      isProjectGenerationActionState({ ...state, animaRegionalNegativeSupported }),
      false,
    )
  }
})
