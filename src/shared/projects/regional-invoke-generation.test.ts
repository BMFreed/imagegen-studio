import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import {
  supportsInferenceRegionalReferenceImages,
  supportsInferenceRegionalVPrediction,
  supportsInferenceRegionalVPredictionImage,
  supportsInferenceRegionalVPredictionSampling,
} from './inference-worker-capabilities.js'
import { isProjectGenerationActionState } from './project-generation-actions.js'
import { createEmptyProjectDocumentV1, type IgsProjectDocumentV1 } from './project-schema.js'
import {
  getInvokeRegionalGenerationUnavailableReason,
  hasEnabledRegionalGuidance,
} from './regional-invoke-generation.js'

function document(): IgsProjectDocumentV1 {
  const value = createEmptyProjectDocumentV1({ title: 'Regional public advisory' })
  value.generationDraft.model = {
    baseModelFamily: 'illustrious',
    civitaiFileId: null,
    civitaiModelId: null,
    civitaiVersionId: null,
    displayName: 'Exact model',
    fileSha256: 'a'.repeat(64),
    kind: 'checkpoint',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: 'epsilon',
    versionName: 'Exact version',
  }
  value.generationDraft.vaePrecision = 'FP16'
  value.generationDraft.sampling = {
    cfgScale: 5,
    denoisingStrength: null,
    sampler: 'Euler',
    scheduler: 'Normal',
    steps: 30,
  }
  value.regionalGuidance = [
    {
      enabled: true,
      id: randomUUID(),
      locked: false,
      mask: { asset: null, id: randomUUID(), revision: 0 },
      name: 'Region',
      overlayOpacity: 0,
    },
  ]
  return value
}

function reason(
  value: IgsProjectDocumentV1,
  runtimeSupported: boolean | null | undefined = true,
  embeddingsSupported?: boolean | null,
  loraSupported?: boolean | null,
) {
  return getInvokeRegionalGenerationUnavailableReason({
    document: value,
    embeddingsSupported,
    iterations: 1,
    loraSupported,
    runtimeSupported,
  })
}

test('enabled regions require explicit runtime support; absent and disabled owners leave ordinary generation untouched', () => {
  const value = document()
  assert.equal(hasEnabledRegionalGuidance(value), true)
  assert.equal(reason(value), null)
  for (const flag of [false, null, undefined]) {
    const result = getInvokeRegionalGenerationUnavailableReason({
      document: value,
      iterations: 1,
      runtimeSupported: flag,
    })
    assert.match(result!, /image engine support|does not support/)
    assert.match(result!, /Repair or update/)
  }
  value.regionalGuidance![0].enabled = false
  value.generationDraft.model = null
  assert.equal(hasEnabledRegionalGuidance(value), false)
  assert.equal(reason(value, false), null)
  delete value.regionalGuidance
  assert.equal(hasEnabledRegionalGuidance(value), false)
  assert.equal(reason(value, null), null)
})

test('finite regional settings refuse unsupported families, predictions, sampling, VAE, CFG and steps without rewriting the document', () => {
  const cases: [string, (value: IgsProjectDocumentV1) => void, RegExp][] = [
    ['missing model', (v) => (v.generationDraft.model = null), /Illustrious epsilon/],
    ['Anima', (v) => (v.generationDraft.model!.baseModelFamily = 'anima'), /Illustrious epsilon/],
    [
      'unknown family',
      (v) => (v.generationDraft.model!.baseModelFamily = null),
      /Illustrious epsilon/,
    ],
    [
      'v-prediction',
      (v) => (v.generationDraft.model!.predictionType = 'v_prediction'),
      /v_prediction/,
    ],
    [
      'unsupported sampler',
      (v) => (v.generationDraft.sampling.sampler = 'DPM++ SDE'),
      /Euler.*Normal/,
    ],
    ['missing scheduler', (v) => (v.generationDraft.sampling.scheduler = null), /Euler.*Normal/],
    ['Auto VAE', (v) => (v.generationDraft.vaePrecision = 'Auto'), /selected VAE and precision/],
    [
      'unset VAE precision',
      (v) => delete v.generationDraft.vaePrecision,
      /selected VAE and precision/,
    ],
    [
      'external VAE',
      (v) => (v.generationDraft.vae = { ...v.generationDraft.model!, kind: 'vae' }),
      /selected VAE and precision/,
    ],
    ['CFG 1', (v) => (v.generationDraft.sampling.cfgScale = 1), /CFG greater than 1/],
    ['CFG 31', (v) => (v.generationDraft.sampling.cfgScale = 31), /CFG greater than 1/],
    ['missing CFG', (v) => (v.generationDraft.sampling.cfgScale = null), /CFG greater than 1/],
    ['CFG Rescale', (v) => (v.generationDraft.cfgRescale = 0.1), /CFG Rescale/],
    ['fractional steps', (v) => (v.generationDraft.sampling.steps = 1.5), /Steps/],
    ['over steps limit', (v) => (v.generationDraft.sampling.steps = 201), /Steps/],
    ['missing steps', (v) => (v.generationDraft.sampling.steps = null), /Steps/],
  ]
  for (const [name, change, expected] of cases) {
    const value = document()
    change(value)
    const before = structuredClone(value)
    assert.match(reason(value)!, expected, name)
    assert.deepEqual(value, before)
  }
  for (const steps of [1, 200]) {
    const value = document()
    value.generationDraft.sampling.steps = steps
    value.generationDraft.cfgRescale = 0
    assert.equal(reason(value), null)
  }
})

test('global LoRAs and TI require their support while references refuse and dormant data stays inert', () => {
  const value = document()
  const resource = { ...value.generationDraft.model!, kind: 'embedding' as const }
  value.generationDraft.positivePrompt.embeddingRefs = [{ resource, token: 'exact_ti' }]
  value.generationDraft.negativePrompt.embeddingRefs = [{ resource, token: 'negative_ti' }]
  assert.equal(reason(value), null)
  value.generationDraft.positivePrompt.text = 'an exact_ti portrait'
  assert.match(reason(value)!, /global embeddings/)
  assert.equal(reason(value, true, true), null)
  assert.match(reason(value, true, false)!, /does not support global embeddings/)
  value.generationDraft.positivePrompt.text = 'inactive_exact_ti'
  value.generationDraft.negativePrompt.text = 'negative_ti'
  assert.match(reason(value)!, /global embeddings/)
  assert.equal(reason(value, true, true), null)
  value.generationDraft.negativePrompt.text = ''
  value.generationDraft.loras = [
    { enabled: true, resource: { ...resource, kind: 'lora' }, weight: 0 },
  ]
  assert.match(reason(value)!, /Checking image engine support for global LoRAs/)
  assert.match(reason(value, true, true, false)!, /does not support global LoRAs/)
  assert.equal(reason(value, true, true, true), null)
  assert.match(reason(value, false, true, true)!, /does not support Regional Guidance/)
  value.generationDraft.loras[0].enabled = false
  assert.equal(reason(value), null)
  const region = value.regionalGuidance![0]
  const id = randomUUID()
  region.referenceImages = [
    {
      asset: {
        bytes: 10,
        height: 8,
        path: `assets/regional-references/${id}/${'a'.repeat(64)}.png`,
        sha256: 'a'.repeat(64),
        width: 8,
      },
      id,
      name: 'Reference',
      sourceFormat: 'PNG',
      thumbnail: {
        bytes: 10,
        height: 8,
        path: `assets/regional-references/${id}/${'b'.repeat(64)}.webp`,
        sha256: 'b'.repeat(64),
        width: 8,
      },
    },
  ]
  assert.match(reason(value)!, /Regional reference images/)
  region.enabled = false
  assert.equal(reason(value), null)
})

test('effective regional text respects negative inheritance and admits empty streams, exact regional TI and every overlay opacity/lock state', () => {
  const value = document()
  const region = value.regionalGuidance![0]
  region.prompts = {
    negative: { embeddingRefs: [], text: '{dormant|negative}' },
    positive: { embeddingRefs: [], text: '' },
    useGlobalNegativePrompt: true,
  }
  assert.equal(reason(value), null)
  region.prompts.useGlobalNegativePrompt = false
  assert.match(reason(value)!, /static global negative and regional prompts/)
  region.prompts.negative!.text = ''
  region.prompts.positive = {
    embeddingRefs: [
      { resource: { ...value.generationDraft.model!, kind: 'embedding' }, token: 'regional_ti' },
    ],
    text: 'regional_ti',
  }
  for (const overlayOpacity of [0, 0.5, 1]) {
    region.overlayOpacity = overlayOpacity
    region.locked = true
    assert.equal(reason(value), null)
  }
  for (const polarity of ['negativePrompt', 'positivePrompt'] as const) {
    value.generationDraft[polarity].text = 'unmatched {'
    assert.match(
      reason(value)!,
      polarity === 'negativePrompt'
        ? /static global negative and regional prompts/
        : /dynamic group needs a closing brace/,
    )
    value.generationDraft[polarity].text = ''
  }
  region.prompts.positive.text = 'unmatched }'
  assert.match(reason(value)!, /static global negative and regional prompts/)
  region.enabled = false
  value.regionalGuidance!.push({
    ...structuredClone(region),
    enabled: true,
    id: randomUUID(),
    prompts: undefined,
  })
  assert.equal(reason(value), null)
})

test('regional count, one-image batching and target dimensions enforce finite bounds', () => {
  const value = document()
  const first = value.regionalGuidance![0]
  value.regionalGuidance = Array.from({ length: 3 }, () => ({
    ...structuredClone(first),
    id: randomUUID(),
  }))
  assert.equal(reason(value), null)
  value.regionalGuidance.push({ ...structuredClone(first), id: randomUUID() })
  assert.match(reason(value)!, /at most 3/)
  value.regionalGuidance[3].enabled = false
  assert.equal(reason(value), null)
  for (const iterations of [0, 33, 1.5, 100]) {
    assert.match(
      getInvokeRegionalGenerationUnavailableReason({
        document: value,
        iterations,
        runtimeSupported: true,
      })!,
      /from 1 to 32 images per click/,
    )
  }
  for (const [width, height] of [
    [8, 8],
    [2048, 8],
    [2000, 2000],
  ]) {
    value.primaryBbox = { height, width, x: 0, y: 0 }
    assert.equal(reason(value), null)
  }
  for (const [width, height] of [
    [7, 8],
    [9, 8],
    [2049, 8],
    [2048, 2048],
    [8.5, 8],
  ]) {
    value.primaryBbox = { height, width, x: 0, y: 0 }
    assert.match(reason(value)!, /dimensions from 8 to 2048/)
  }
})

test('regional capability is an optional strict boolean in preload action responses', () => {
  const state = {
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
  for (const field of [
    'regionalSupported',
    'regionalInvokeInitializationSupported',
    'regionalImg2ImgSupported',
    'regionalImg2ImgCfgRescaleSupported',
    'regionalLoraSupported',
    'regionalVaeSupported',
    'regionalReferenceImagesSupported',
  ]) {
    for (const supported of [false, true]) {
      assert.equal(isProjectGenerationActionState({ ...state, [field]: supported }), true)
    }
    for (const unsupported of [null, 0, 1, 'true', {}]) {
      assert.equal(isProjectGenerationActionState({ ...state, [field]: unsupported }), false)
    }
  }
})

test('explicit regional Euler a requires its own capability and never changes authored settings', () => {
  const value = document()
  value.generationDraft.sampling.sampler = 'Euler a'
  const before = structuredClone(value)
  for (const initializationSupported of [undefined, null, false, true]) {
    const result = getInvokeRegionalGenerationUnavailableReason({
      document: value,
      initializationSupported,
      iterations: 1,
      runtimeSupported: true,
    })
    assert.equal(result === null, initializationSupported === true)
    if (result) {
      assert.match(result, /Euler a.*Repair or update/)
    }
  }
  assert.deepEqual(value, before)
  value.generationDraft.sampling.sampler = 'Euler'
  for (const initializationSupported of [undefined, null, false, true]) {
    assert.equal(
      getInvokeRegionalGenerationUnavailableReason({
        document: value,
        initializationSupported,
        iterations: 1,
        runtimeSupported: true,
      }),
      null,
    )
  }
})

test('Euler a initialization support cannot grant missing regional engine support or affect ordinary drafts', () => {
  const value = document()
  value.generationDraft.sampling.sampler = 'Euler a'
  for (const runtimeSupported of [undefined, null, false]) {
    assert.notEqual(
      getInvokeRegionalGenerationUnavailableReason({
        document: value,
        initializationSupported: true,
        iterations: 1,
        runtimeSupported,
      }),
      null,
    )
  }
  value.regionalGuidance![0].enabled = false
  assert.equal(reason(value, false), null)
})

test('global embedding support is required only for active refs and cannot grant regional support', () => {
  const value = document()
  value.generationDraft.positivePrompt = {
    embeddingRefs: [
      { resource: { ...value.generationDraft.model!, kind: 'embedding' }, token: '<shared>' },
    ],
    text: 'a scene <shared>',
  }
  for (const embeddingsSupported of [undefined, null, false]) {
    assert.match(reason(value, true, embeddingsSupported)!, /global embeddings/)
  }
  assert.equal(reason(value, true, true), null)
  for (const runtimeSupported of [null, false]) {
    assert.notEqual(reason(value, runtimeSupported, true), null)
  }
  value.generationDraft.positivePrompt.text = 'ordinary text without the saved trigger'
  assert.equal(reason(value, true, false), null)
  value.generationDraft.positivePrompt.text = '<shared>'
  value.regionalGuidance![0].enabled = false
  assert.equal(reason(value, false, false), null)
})

function imageReason(
  value: IgsProjectDocumentV1,
  overrides: Partial<Parameters<typeof getInvokeRegionalGenerationUnavailableReason>[0]> = {},
) {
  return getInvokeRegionalGenerationUnavailableReason({
    document: value,
    img2imgSupported: true,
    iterations: 1,
    runtimeSupported: true,
    targetMode: 'img2img',
    ...overrides,
  })
}

test('opaque regional img2img requires its specific capability as well as generic regional support', () => {
  const value = document()
  value.generationDraft.sampling.denoisingStrength = 0.5
  const before = structuredClone(value)
  assert.equal(imageReason(value), null)
  for (const img2imgSupported of [undefined, null, false]) {
    assert.match(imageReason(value, { img2imgSupported })!, /opaque img2img.*Regional Guidance/)
  }
  for (const runtimeSupported of [undefined, null, false]) {
    assert.match(imageReason(value, { runtimeSupported })!, /support.*Regional Guidance/)
  }
  assert.deepEqual(value, before)
})

test('opaque regional img2img requires explicit finite strength including admitted zero and one', () => {
  const value = document()
  for (const strength of [0, 0.5, 1]) {
    value.generationDraft.sampling.denoisingStrength = strength
    assert.equal(imageReason(value), null)
  }
  for (const strength of [null, -0.01, 1.01, NaN, Infinity, -Infinity]) {
    value.generationDraft.sampling.denoisingStrength = strength
    const before = structuredClone(value)
    assert.match(imageReason(value)!, /Set Denoising Strength from 0 to 1/)
    assert.deepEqual(value, before)
  }
  for (const strength of [undefined, false, true, '0.5']) {
    value.generationDraft.sampling.denoisingStrength = strength as unknown as number
    assert.match(imageReason(value)!, /Set Denoising Strength from 0 to 1/)
  }
})

test('opaque regional img2img refuses unqualified sampling choices without rewriting them', () => {
  const cases: [string, (value: IgsProjectDocumentV1) => void][] = [
    [
      'Euler a with Karras',
      (v) => {
        v.generationDraft.sampling.sampler = 'Euler a'
        v.generationDraft.sampling.scheduler = 'Karras'
      },
    ],
    ['DPM++ SDE', (v) => (v.generationDraft.sampling.sampler = 'DPM++ SDE')],
    ['Karras', (v) => (v.generationDraft.sampling.scheduler = 'Karras')],
  ]
  for (const [name, change] of cases) {
    const value = document()
    value.generationDraft.sampling.denoisingStrength = 0.5
    change(value)
    const before = structuredClone(value)
    assert.match(
      imageReason(value, {
        cfgRescaleSupported: true,
        dpmSupported: true,
        initializationSupported: true,
        vaeSupported: true,
      })!,
      /Regional img2img requires Euler or Euler a with Normal, or DPM\+\+ 2M with Normal or Karras/,
      name,
    )
    assert.deepEqual(value, before)
  }
})

test('IMG-only advisory guards preserve omitted-mode Main and explicit TXT behavior', () => {
  const value = document()
  value.generationDraft.sampling.sampler = 'DPM++ 2M'
  value.generationDraft.sampling.scheduler = 'Karras'
  value.generationDraft.vaePrecision = 'FP32'
  value.generationDraft.vae = { ...value.generationDraft.model!, kind: 'vae' }
  value.generationDraft.cfgRescale = 0.7
  for (const targetMode of [undefined, null, 'txt2img'] as const) {
    assert.equal(
      imageReason(value, {
        cfgRescaleSupported: true,
        dpmSupported: true,
        img2imgSupported: false,
        targetMode,
        vaeSupported: true,
      }),
      null,
    )
  }
  value.generationDraft.sampling.sampler = 'Euler a'
  value.generationDraft.sampling.scheduler = 'Normal'
  assert.equal(
    imageReason(value, {
      cfgRescaleSupported: true,
      img2imgSupported: false,
      initializationSupported: true,
      targetMode: 'txt2img',
      vaeSupported: true,
    }),
    null,
  )
})

test('partial alpha never becomes regional IMG and disabled regions leave ordinary modes untouched', () => {
  const value = document()
  value.generationDraft.sampling.denoisingStrength = 0.5
  assert.match(imageReason(value, { targetMode: 'outpaint' })!, /outpaint with Regional Guidance/)
  assert.equal(imageReason(value), null)
  assert.equal(imageReason(value, { outpaintSupported: true, targetMode: 'outpaint' }), null)
  value.regionalGuidance![0].enabled = false
  value.generationDraft.model = null
  for (const targetMode of ['img2img', 'outpaint', 'txt2img'] as const) {
    assert.equal(
      imageReason(value, { img2imgSupported: false, runtimeSupported: false, targetMode }),
      null,
    )
  }
})

test('opaque regional img2img retains active global resource gates and exact authored data', () => {
  const value = document()
  value.generationDraft.sampling.denoisingStrength = 0.5
  value.generationDraft.positivePrompt = {
    embeddingRefs: [
      { resource: { ...value.generationDraft.model!, kind: 'embedding' }, token: '<exact>' },
    ],
    text: 'a scene <exact>',
  }
  const before = structuredClone(value)
  assert.match(imageReason(value, { embeddingsSupported: false })!, /global embeddings/)
  assert.equal(imageReason(value, { embeddingsSupported: true }), null)
  assert.deepEqual(value, before)
  value.generationDraft.loras = [
    {
      enabled: true,
      resource: { ...value.generationDraft.model!, kind: 'lora' },
      weight: 0.5,
    },
  ]
  assert.match(
    imageReason(value, { embeddingsSupported: true, loraSupported: false })!,
    /global LoRAs/,
  )
  assert.equal(imageReason(value, { embeddingsSupported: true, loraSupported: true }), null)
  assert.match(
    imageReason(value, {
      embeddingsSupported: true,
      img2imgSupported: false,
      loraSupported: true,
    })!,
    /does not support opaque img2img/,
  )
})

test('opaque nonzero rescale requires its combination capability while zero and TXT remain independent', () => {
  const value = document()
  value.generationDraft.sampling.denoisingStrength = 0.5
  for (const cfgRescale of [0.7, 0.99]) {
    value.generationDraft.cfgRescale = cfgRescale
    const before = structuredClone(value)
    for (const img2imgCfgRescaleSupported of [undefined, null, false]) {
      assert.match(
        imageReason(value, { cfgRescaleSupported: true, img2imgCfgRescaleSupported })!,
        /CFG Rescale with opaque regional img2img/,
      )
    }
    assert.equal(
      imageReason(value, { cfgRescaleSupported: true, img2imgCfgRescaleSupported: true }),
      null,
    )
    assert.match(
      imageReason(value, { cfgRescaleSupported: false, img2imgCfgRescaleSupported: true })!,
      /CFG Rescale with Regional Guidance/,
    )
    assert.equal(imageReason(value, { cfgRescaleSupported: true, targetMode: 'txt2img' }), null)
    assert.deepEqual(value, before)
  }
  value.generationDraft.cfgRescale = 0
  assert.equal(
    imageReason(value, { cfgRescaleSupported: false, img2imgCfgRescaleSupported: false }),
    null,
  )
})

test('opaque Euler a requires its own combination capability while Euler and TXT stay independent', () => {
  const value = document()
  value.generationDraft.sampling.sampler = 'Euler a'
  value.generationDraft.sampling.denoisingStrength = 0.5
  const before = structuredClone(value)
  for (const img2imgEulerASupported of [undefined, null, false]) {
    assert.match(
      imageReason(value, { img2imgEulerASupported, initializationSupported: true })!,
      /Euler a with opaque regional img2img/,
    )
  }
  assert.equal(
    imageReason(value, { img2imgEulerASupported: true, initializationSupported: true }),
    null,
  )
  assert.match(
    imageReason(value, { img2imgEulerASupported: true, initializationSupported: false })!,
    /Regional Guidance with Euler a/,
  )
  assert.match(
    imageReason(value, {
      img2imgEulerASupported: true,
      img2imgSupported: false,
      initializationSupported: true,
    })!,
    /opaque img2img with Regional Guidance/,
  )
  assert.equal(
    imageReason(value, {
      img2imgEulerASupported: false,
      img2imgSupported: false,
      initializationSupported: true,
      targetMode: 'txt2img',
    }),
    null,
  )
  assert.deepEqual(value, before)
  value.generationDraft.sampling.sampler = 'Euler'
  assert.equal(imageReason(value, { img2imgEulerASupported: false }), null)
  value.generationDraft.sampling.sampler = 'Euler a'
  value.generationDraft.cfgRescale = 0.7
  assert.match(
    imageReason(value, {
      cfgRescaleSupported: true,
      img2imgCfgRescaleSupported: false,
      img2imgEulerASupported: true,
      initializationSupported: true,
    })!,
    /CFG Rescale with opaque regional img2img/,
  )
  assert.equal(
    imageReason(value, {
      cfgRescaleSupported: true,
      img2imgCfgRescaleSupported: true,
      img2imgEulerASupported: true,
      initializationSupported: true,
    }),
    null,
  )
})

test('opaque DPM Normal and Karras require the separate IMG capability without TXT initialization', () => {
  for (const scheduler of ['Normal', 'Karras'] as const) {
    const value = document()
    value.generationDraft.sampling.sampler = 'DPM++ 2M'
    value.generationDraft.sampling.scheduler = scheduler
    value.generationDraft.sampling.denoisingStrength = 0.5
    const before = structuredClone(value)
    for (const img2imgDpmpp2mSupported of [undefined, null, false]) {
      assert.match(
        imageReason(value, {
          dpmSupported: true,
          img2imgDpmpp2mSupported,
          initializationSupported: true,
        })!,
        /DPM\+\+ 2M with opaque regional img2img/,
      )
    }
    const flags = {
      dpmSupported: false,
      img2imgDpmpp2mSupported: true,
      initializationSupported: false,
    }
    assert.equal(imageReason(value, flags), null)
    assert.equal(imageReason(value, { ...flags, targetMode: undefined }), null)
    assert.match(
      imageReason(value, { ...flags, targetMode: 'txt2img' })!,
      /Regional Guidance with DPM/,
    )
    assert.match(
      imageReason(value, { ...flags, targetMode: 'outpaint' })!,
      /outpaint with Regional Guidance/,
    )
    assert.deepEqual(value, before)
  }
})

test('opaque selected VAE or effective non-FP16 precision requires its own combination and preserves TXT admission', () => {
  for (const selected of [false, true]) {
    for (const precision of [undefined, 'Auto', 'FP16', 'FP32'] as const) {
      const value = document()
      value.generationDraft.sampling.denoisingStrength = 0.5
      value.generationDraft.vae = selected ? { ...value.generationDraft.model!, kind: 'vae' } : null
      if (precision === undefined) {
        delete value.generationDraft.vaePrecision
      } else {
        value.generationDraft.vaePrecision = precision
      }
      const before = structuredClone(value)
      for (const img2imgVaeSupported of [undefined, null, false, true]) {
        const flags = { img2imgVaeSupported, vaeSupported: true }
        const result = imageReason(value, flags)
        const requires = selected || precision !== 'FP16'
        assert.equal(result === null, !requires || img2imgVaeSupported === true)
        if (result) {
          assert.match(result, /selected VAE and precision with opaque regional img2img/)
        }
        assert.equal(imageReason(value, { ...flags, targetMode: 'txt2img' }), null)
        assert.equal(imageReason(value, { ...flags, targetMode: undefined }), null)
      }
      if (selected || precision !== 'FP16') {
        assert.match(
          imageReason(value, { img2imgVaeSupported: true, vaeSupported: false })!,
          /selected VAE and precision with Regional Guidance/,
        )
        assert.match(
          imageReason(value, {
            img2imgSupported: false,
            img2imgVaeSupported: true,
            vaeSupported: true,
          })!,
          /opaque img2img with Regional Guidance/,
        )
      }
      assert.deepEqual(value, before)
    }
  }
})

test('regional image VAE support state accepts only optional Boolean values', () => {
  // Reuse the established typed state fixture already verified by the neighboring state tests.
  const state = {
    animaOutpaintSupported: false,
    animaSupported: false,
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
  for (const regionalImg2ImgVaeSupported of [undefined, false, true]) {
    assert.equal(isProjectGenerationActionState({ ...state, regionalImg2ImgVaeSupported }), true)
  }
  for (const regionalImg2ImgVaeSupported of [null, 1, 'true']) {
    assert.equal(isProjectGenerationActionState({ ...state, regionalImg2ImgVaeSupported }), false)
  }
})

const V_PREDICTION_CAPABILITY = 'illustrious-regional-v-prediction-v1'

test('regional V objective requires the new explicit combination capability on a qualified peer', () => {
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
    'illustrious-regional-invoke-v1',
    V_PREDICTION_CAPABILITY,
  ]
  const ready = {
    capabilities,
    protocolVersion: '1',
    runtimeProfile: 'linux-nvidia',
    workerVersion: '0.14.0',
  }
  assert.equal(supportsInferenceRegionalVPrediction(ready), true)
  for (const absent of [
    V_PREDICTION_CAPABILITY,
    'illustrious-regional-invoke-v1',
    'illustrious-txt2img',
  ]) {
    assert.equal(
      supportsInferenceRegionalVPrediction({
        ...ready,
        capabilities: capabilities.filter((c) => c !== absent),
      }),
      false,
    )
  }
  assert.equal(supportsInferenceRegionalVPrediction({ ...ready, workerVersion: '0.13.0' }), false)
})

test('regional V advisory keeps epsilon independent and zero enabled owners inert', () => {
  const value = document()
  for (const support of [undefined, false, true]) {
    assert.equal(
      getInvokeRegionalGenerationUnavailableReason({
        document: value,
        iterations: 1,
        runtimeSupported: true,
        vPredictionSupported: support,
      }),
      null,
    )
  }
  value.generationDraft.model!.predictionType = 'v_prediction'
  const before = structuredClone(value)
  for (const support of [undefined, false, true]) {
    const result = getInvokeRegionalGenerationUnavailableReason({
      document: value,
      iterations: 1,
      runtimeSupported: true,
      targetMode: 'txt2img',
      vPredictionSupported: support,
    })
    assert.equal(result === null, support === true)
    if (result) {
      assert.match(result, /v_prediction.*Repair or update/)
    }
  }
  assert.deepEqual(value, before)
  value.regionalGuidance![0].enabled = false
  assert.equal(
    getInvokeRegionalGenerationUnavailableReason({
      document: value,
      iterations: 1,
      runtimeSupported: false,
      vPredictionSupported: false,
    }),
    null,
  )
})

for (const targetMode of ['img2img', 'outpaint'] as const) {
  test(`regional V advisory refuses actual ${targetMode} on a legacy TXT V peer`, () => {
    const value = document()
    value.generationDraft.model!.predictionType = 'v_prediction'
    value.generationDraft.sampling.denoisingStrength = 0.5
    const before = structuredClone(value)
    assert.match(
      getInvokeRegionalGenerationUnavailableReason({
        document: value,
        img2imgSupported: true,
        iterations: 1,
        outpaintSupported: true,
        runtimeSupported: true,
        targetMode,
        vPredictionSupported: true,
      })!,
      /v_prediction image modes/,
    )
    assert.deepEqual(value, before)
  })
}

for (const sampler of ['Euler a', 'DPM++ 2M'] as const) {
  test(`regional V advisory refuses ${sampler} while the epsilon neighbor remains admitted`, () => {
    const value = document()
    value.generationDraft.model!.predictionType = 'v_prediction'
    value.generationDraft.sampling.sampler = sampler
    const input = {
      document: value,
      dpmSupported: true,
      initializationSupported: true,
      iterations: 1,
      runtimeSupported: true,
      vPredictionSupported: true,
    }
    assert.match(
      getInvokeRegionalGenerationUnavailableReason(input)!,
      /v_prediction sampling methods.*Repair or update/,
    )
    value.generationDraft.model!.predictionType = 'epsilon'
    assert.equal(getInvokeRegionalGenerationUnavailableReason(input), null)
  })
}

test('regional V support is an optional strict boolean without changing legacy preload action states', () => {
  const state = {
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
  for (const regionalVPredictionSupported of [false, true]) {
    assert.equal(isProjectGenerationActionState({ ...state, regionalVPredictionSupported }), true)
  }
  for (const regionalVPredictionSupported of [null, 0, 1, 'true', {}]) {
    assert.equal(isProjectGenerationActionState({ ...state, regionalVPredictionSupported }), false)
  }
})

const V_IMAGE_CAPABILITY = 'illustrious-regional-v-prediction-image-v1'

test('regional V image capability requires both prior objective and regional source execution owners', () => {
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
    'illustrious-regional-invoke-v1',
    'illustrious-regional-img2img-v1',
    V_PREDICTION_CAPABILITY,
    V_IMAGE_CAPABILITY,
  ]
  const ready = {
    capabilities,
    protocolVersion: '1',
    runtimeProfile: 'linux-nvidia',
    workerVersion: '0.14.0',
  }
  assert.equal(supportsInferenceRegionalVPredictionImage(ready), true)
  for (const absent of [
    V_IMAGE_CAPABILITY,
    V_PREDICTION_CAPABILITY,
    'illustrious-regional-img2img-v1',
    'illustrious-regional-invoke-v1',
    'illustrious-img2img',
  ]) {
    const peer = { ...ready, capabilities: capabilities.filter((c) => c !== absent) }
    assert.equal(supportsInferenceRegionalVPredictionImage(peer), false, absent)
  }
  assert.equal(
    supportsInferenceRegionalVPredictionImage({ ...ready, workerVersion: '0.13.0' }),
    false,
  )
  assert.equal(
    supportsInferenceRegionalVPrediction({
      ...ready,
      capabilities: capabilities.filter((c) => c !== V_IMAGE_CAPABILITY),
    }),
    true,
  )
})

for (const targetMode of ['img2img', 'outpaint'] as const) {
  test(`regional V ${targetMode} advisory requires its separate image combination without authoring mutation`, () => {
    const value = document()
    value.generationDraft.model!.predictionType = 'v_prediction'
    value.generationDraft.sampling.denoisingStrength = 0.5
    const before = structuredClone(value)
    const input = {
      document: value,
      img2imgSupported: true,
      iterations: 1,
      outpaintSupported: true,
      runtimeSupported: true,
      targetMode,
      vPredictionSupported: true,
    }
    for (const vPredictionImageSupported of [undefined, false, true]) {
      const result = getInvokeRegionalGenerationUnavailableReason({
        ...input,
        vPredictionImageSupported,
      })
      assert.equal(result === null, vPredictionImageSupported === true)
      if (result) {
        assert.match(result, /v_prediction image modes.*Repair or update/)
      }
    }
    assert.deepEqual(value, before)
    assert.match(
      getInvokeRegionalGenerationUnavailableReason({
        ...input,
        img2imgSupported: false,
        vPredictionImageSupported: true,
      })!,
      /opaque img2img/,
    )
    if (targetMode === 'outpaint') {
      assert.match(
        getInvokeRegionalGenerationUnavailableReason({
          ...input,
          outpaintSupported: false,
          vPredictionImageSupported: true,
        })!,
        /outpaint/,
      )
    }
    assert.match(
      getInvokeRegionalGenerationUnavailableReason({
        ...input,
        vPredictionImageSupported: true,
        vPredictionSupported: false,
      })!,
      /v_prediction.*Repair or update/,
    )
    value.generationDraft.model!.predictionType = 'epsilon'
    assert.equal(
      getInvokeRegionalGenerationUnavailableReason({
        ...input,
        vPredictionImageSupported: false,
        vPredictionSupported: false,
      }),
      null,
    )
  })

  test(`regional V ${targetMode} image capability cannot admit ancestral or DPM methods`, () => {
    const value = document()
    value.generationDraft.model!.predictionType = 'v_prediction'
    value.generationDraft.sampling.denoisingStrength = 0.5
    for (const sampler of ['Euler a', 'DPM++ 2M'] as const) {
      value.generationDraft.sampling.sampler = sampler
      assert.match(
        getInvokeRegionalGenerationUnavailableReason({
          document: value,
          img2imgSupported: true,
          iterations: 1,
          outpaintSupported: true,
          runtimeSupported: true,
          targetMode,
          vPredictionImageSupported: true,
          vPredictionSupported: true,
        })!,
        /v_prediction sampling methods.*Repair or update/,
      )
    }
  })
}

test('regional V image action-state field is optional and strictly boolean for legacy preload responses', () => {
  const state = {
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
  for (const regionalVPredictionImageSupported of [true, false]) {
    assert.equal(
      isProjectGenerationActionState({ ...state, regionalVPredictionImageSupported }),
      true,
    )
  }
  for (const regionalVPredictionImageSupported of [null, 0, 'true', {}, []]) {
    assert.equal(
      isProjectGenerationActionState({ ...state, regionalVPredictionImageSupported }),
      false,
    )
  }
})

const V_SAMPLING_CAPABILITY = 'illustrious-regional-v-prediction-sampling-v1'

test('regional V sampling capability requires the previous objective owner without inferring other method or image owners', () => {
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
    'illustrious-regional-invoke-v1',
    V_PREDICTION_CAPABILITY,
    V_SAMPLING_CAPABILITY,
  ]
  const ready = {
    capabilities,
    protocolVersion: '1',
    runtimeProfile: 'linux-nvidia',
    workerVersion: '0.14.0',
  }
  assert.equal(supportsInferenceRegionalVPredictionSampling(ready), true)
  assert.equal(supportsInferenceRegionalVPredictionImage(ready), false)
  for (const absent of [
    V_SAMPLING_CAPABILITY,
    V_PREDICTION_CAPABILITY,
    'illustrious-regional-invoke-v1',
  ]) {
    assert.equal(
      supportsInferenceRegionalVPredictionSampling({
        ...ready,
        capabilities: capabilities.filter((c) => c !== absent),
      }),
      false,
      absent,
    )
  }
  assert.equal(
    supportsInferenceRegionalVPredictionSampling({ ...ready, workerVersion: '0.13.0' }),
    false,
  )
  assert.equal(
    supportsInferenceRegionalVPrediction({
      ...ready,
      capabilities: capabilities.filter((c) => c !== V_SAMPLING_CAPABILITY),
    }),
    true,
  )
})

for (const targetMode of ['txt2img', 'img2img', 'outpaint'] as const) {
  for (const method of [
    { sampler: 'Euler a', scheduler: 'Normal' },
    { sampler: 'DPM++ 2M', scheduler: 'Normal' },
    { sampler: 'DPM++ 2M', scheduler: 'Karras' },
  ] as const) {
    test(`regional V ${targetMode} ${method.sampler} ${method.scheduler} requires separate sampling support and keeps Euler and epsilon peers`, () => {
      const value = document()
      value.generationDraft.model!.predictionType = 'v_prediction'
      value.generationDraft.sampling = {
        ...value.generationDraft.sampling,
        ...method,
        denoisingStrength: 0.5,
      }
      const before = structuredClone(value)
      const input = {
        document: value,
        dpmSupported: true,
        img2imgDpmpp2mSupported: true,
        img2imgEulerASupported: true,
        img2imgSupported: true,
        initializationSupported: true,
        iterations: 1,
        outpaintSupported: true,
        runtimeSupported: true,
        targetMode,
        vPredictionImageSupported: true,
        vPredictionSupported: true,
      }
      for (const support of [undefined, false, true]) {
        const actual = getInvokeRegionalGenerationUnavailableReason({
          ...input,
          vPredictionSamplingSupported: support,
        })
        assert.equal(actual === null, support === true)
        if (actual) {
          assert.match(actual, /v_prediction sampling methods.*Repair or update/)
        }
      }
      assert.deepEqual(value, before)
      value.generationDraft.model!.predictionType = 'epsilon'
      assert.equal(
        getInvokeRegionalGenerationUnavailableReason({
          ...input,
          vPredictionSamplingSupported: false,
        }),
        null,
      )
      value.generationDraft.model!.predictionType = 'v_prediction'
      value.generationDraft.sampling.sampler = 'Euler'
      value.generationDraft.sampling.scheduler = 'Normal'
      assert.equal(
        getInvokeRegionalGenerationUnavailableReason({
          ...input,
          vPredictionSamplingSupported: false,
        }),
        null,
      )
    })
  }
}

test('regional V sampling opt-in cannot grant unsupported Euler Karras schedules', () => {
  const value = document()
  value.generationDraft.model!.predictionType = 'v_prediction'
  value.generationDraft.sampling.scheduler = 'Karras'
  for (const sampler of ['Euler', 'Euler a'] as const) {
    value.generationDraft.sampling.sampler = sampler
    assert.match(
      getInvokeRegionalGenerationUnavailableReason({
        document: value,
        iterations: 1,
        runtimeSupported: true,
        vPredictionSamplingSupported: true,
        vPredictionSupported: true,
      })!,
      /requires Euler or Euler a with Normal/,
    )
  }
})

test('regional V sampling state is optional strict boolean for old preload responses', () => {
  const state = {
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
  for (const regionalVPredictionSamplingSupported of [true, false]) {
    assert.equal(
      isProjectGenerationActionState({ ...state, regionalVPredictionSamplingSupported }),
      true,
    )
  }
  for (const regionalVPredictionSamplingSupported of [null, 0, 'true', {}, []]) {
    assert.equal(
      isProjectGenerationActionState({ ...state, regionalVPredictionSamplingSupported }),
      false,
    )
  }
})

test('regional original-image admission is a separate finite EPS TXT lane and leaves disabled references dormant', () => {
  const value = document()
  value.primaryBbox.width = value.primaryBbox.height = 512
  const reference = (index: number) => {
    const id = randomUUID()
    return {
      asset: {
        bytes: 1024,
        height: 600,
        path: `assets/regional-references/${id}/${'a'.repeat(64)}.png`,
        sha256: 'a'.repeat(64),
        width: 800,
      },
      id,
      name: `Original ${index}`,
      sourceFormat: 'PNG' as const,
      thumbnail: {
        bytes: 128,
        height: 96,
        path: `assets/regional-references/${id}/${'b'.repeat(64)}.webp`,
        sha256: 'b'.repeat(64),
        width: 128,
      },
    }
  }
  value.regionalGuidance![0].referenceImages = [reference(0)]
  const allowed = (
    document = value,
    supported: boolean | null = true,
    iterations = 1,
    targetMode: 'img2img' | 'outpaint' | 'txt2img' = 'txt2img',
  ) =>
    getInvokeRegionalGenerationUnavailableReason({
      document,
      iterations,
      regionalReferenceImagesSupported: supported,
      runtimeSupported: true,
      targetMode,
      vPredictionSupported: true,
    })
  const original = structuredClone(value)
  assert.equal(allowed(), null)
  for (const flag of [null, false]) {
    assert.match(allowed(value, flag)!, /image engine.*regional reference images/)
  }
  assert.match(allowed(value, true, 2)!, /one image and static prompts/)
  for (const mode of ['img2img', 'outpaint'] as const) {
    assert.match(allowed(value, true, 1, mode)!, /transparent txt2img/)
  }
  const changes: [(document: IgsProjectDocumentV1) => void, RegExp][] = [
    [
      (v) => {
        v.generationDraft.model!.predictionType = 'v_prediction'
      },
      /epsilon/,
    ],
    [
      (v) => {
        v.generationDraft.sampling.sampler = 'Euler a'
      },
      /Euler with the Normal/,
    ],
    [
      (v) => {
        v.generationDraft.sampling.scheduler = 'Karras'
      },
      /Euler with the Normal/,
    ],
    [
      (v) => {
        v.generationDraft.cfgRescale = 0.1
      },
      /CFG Rescale 0/,
    ],
    [
      (v) => {
        v.generationDraft.vaePrecision = 'Auto'
      },
      /embedded VAE.*FP16/,
    ],
    [
      (v) => {
        v.generationDraft.loras = [
          { enabled: true, resource: { ...v.generationDraft.model!, kind: 'lora' }, weight: 0 },
        ]
      },
      /Disable global LoRAs/,
    ],
    [
      (v) => {
        v.generationDraft.positivePrompt.text = '{one|two}'
      },
      /static prompts/,
    ],
    [
      (v) => {
        v.primaryBbox.width = 520
      },
      /64 to 512/,
    ],
    [
      (v) => {
        v.regionalGuidance![0].referenceImages = [
          reference(0),
          reference(1),
          reference(2),
          reference(3),
        ]
      },
      /at most 3 images/,
    ],
    [
      (v) => {
        v.regionalGuidance![0].referenceImages![0].asset.bytes = 32 * 1024 * 1024 + 1
      },
      /32 MiB/,
    ],
    [
      (v) => {
        v.regionalGuidance![0].referenceImages![0].asset.width = 16_385
      },
      /original image dimensions/,
    ],
    [
      (v) => {
        const p = {
          embeddingRefs: [
            {
              resource: { ...v.generationDraft.model!, kind: 'embedding' as const },
              token: 'active_ti',
            },
          ],
          text: 'active_ti',
        }
        v.regionalGuidance![0].prompts = {
          negative: p,
          positive: null,
          useGlobalNegativePrompt: false,
        }
      },
      /active prompt embeddings/,
    ],
  ]
  for (const [change, expected] of changes) {
    const next = structuredClone(value)
    change(next)
    assert.match(allowed(next)!, expected)
  }
  assert.deepEqual(value, original)
  value.regionalGuidance![0].referenceImages.push(reference(1), reference(2))
  value.regionalGuidance![0].prompts = {
    negative: { embeddingRefs: [], text: '{dormant|negative}' },
    positive: null,
    useGlobalNegativePrompt: true,
  }
  assert.equal(allowed(), null, 'Image-only region and dormant local negative remain valid.')
  value.regionalGuidance![0].enabled = false
  value.primaryBbox.width = 1024
  value.generationDraft.model = null
  assert.equal(allowed(value, false), null)
})

test('regional reference-image capability never follows from base regional support or a spoofed old peer', () => {
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
      'illustrious-regional-invoke-v1',
      'illustrious-regional-reference-txt2img-v1',
    ],
    protocolVersion: '1',
    runtimeProfile: 'linux-nvidia',
    workerVersion: '0.14.0',
  }
  assert.equal(supportsInferenceRegionalReferenceImages(ready), true)
  for (const cap of [
    'illustrious-regional-invoke-v1',
    'illustrious-regional-reference-txt2img-v1',
  ]) {
    assert.equal(
      supportsInferenceRegionalReferenceImages({
        ...ready,
        capabilities: ready.capabilities.filter((c) => c !== cap),
      }),
      false,
    )
  }
  assert.equal(
    supportsInferenceRegionalReferenceImages({ ...ready, workerVersion: '0.13.0' }),
    false,
  )
})
