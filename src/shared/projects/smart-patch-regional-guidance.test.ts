import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import type { IgsProjectDocumentV1, IgsSmartPatchLayerV1 } from './project-schema.js'

import { ANIMA_BATCH_READY } from '../../main/projects/test-fixtures/anima-batch.js'
import { literalSmartPatchPreparedInput } from '../../main/projects/test-fixtures/smart-patch-input-material.js'
import { generationQueueRetryReason } from '../../renderer/components/generation-queue-retry.js'
import {
  supportsInferenceAnimaSmartPatchRegional,
  supportsInferenceAnimaSmartPatchRegionalImg2Img,
  supportsInferenceAnimaSmartPatchRegionalMode,
  supportsInferenceAnimaSmartPatchRegionalOutpaint,
  supportsInferenceAnimaSmartPatchRegionalTxt2Img,
  supportsInferenceIllustriousSmartPatchRegionalMode,
  supportsInferenceSmartPatchRegionalMode,
} from './inference-worker-capabilities.js'
import { getSmartPatchRegionalGenerationUnavailableReason as reason } from './smart-patch-regional-guidance.js'

function fixture() {
  const { context } = literalSmartPatchPreparedInput('anima').prepared
  const patch: IgsSmartPatchLayerV1 = {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: context.bbox,
    coherenceSettings: context.coherenceSettings,
    generationDraft: context.generationDraft,
    id: context.layerId,
    internalResolution: context.internalResolution,
    kind: 'smart-patch',
    locked: false,
    mask: context.mask,
    maskSettings: context.maskSettings,
    name: 'Selected Patch',
    opacity: 1,
    rasterSubLayers: [],
    visible: true,
  }
  const document: Pick<IgsProjectDocumentV1, 'regionalGuidance'> = {
    regionalGuidance: [
      {
        enabled: true,
        id: randomUUID(),
        locked: false,
        mask: { asset: null, id: randomUUID(), revision: 0 },
        name: 'Owned region',
        overlayOpacity: 0.5,
        prompts: {
          negative: { embeddingRefs: [], text: '{dormant|local}' },
          positive: { embeddingRefs: [], text: '(red scarf)1.5' },
          useGlobalNegativePrompt: true,
        },
      },
    ],
  }
  return { document, iterations: 1, patch, runtimeSupported: true }
}

test('Smart regional eligibility consumes selected Patch and effective signed prompts', () => {
  const input = fixture()
  assert.equal(reason(input), null)
  input.document.regionalGuidance![0].prompts!.useGlobalNegativePrompt = false
  assert.match(reason(input)!, /static/u)
  input.document.regionalGuidance![0].prompts!.negative!.text = 'local exclusion'
  assert.equal(reason(input), null)
  input.patch.generationDraft.negativePrompt.text = '{active|global}'
  assert.match(reason(input)!, /static/u)
})

test('disabled regions keep ordinary Smart eligibility independent of new capability', () => {
  const input = fixture()
  input.runtimeSupported = false
  assert.match(reason(input)!, /engine/u)
  input.document.regionalGuidance![0].enabled = false
  input.patch.generationDraft.model!.baseModelFamily = 'illustrious'
  assert.equal(reason(input), null)
})

for (const [name, change, expected] of [
  [
    'Illustrious with Anima sampling fields',
    (x: ReturnType<typeof fixture>) => {
      x.patch.generationDraft.model!.baseModelFamily = 'illustrious'
    },
    /Euler\/Normal/u,
  ],
  [
    'batch',
    (x: ReturnType<typeof fixture>) => {
      x.iterations = 2
    },
    /one static/u,
  ],
  [
    'processing',
    (x: ReturnType<typeof fixture>) => {
      x.patch.internalResolution.width = 520
    },
    /dimensions/u,
  ],
  [
    'processing-padding',
    (x: ReturnType<typeof fixture>) => {
      x.patch.internalResolution.width = 65
    },
    /dimensions/u,
  ],
  [
    'world',
    (x: ReturnType<typeof fixture>) => {
      x.patch.boundingBox.height = 2049
    },
    /dimensions/u,
  ],
  [
    'method',
    (x: ReturnType<typeof fixture>) => {
      x.patch.generationDraft.sampling.animaMethod = 'lcm'
    },
    /Euler or Heun/u,
  ],
  [
    'vae',
    (x: ReturnType<typeof fixture>) => {
      x.patch.generationDraft.vaePrecision = 'FP32'
    },
    /Auto VAE/u,
  ],
  [
    'global-positive',
    (x: ReturnType<typeof fixture>) => {
      x.patch.generationDraft.positivePrompt.text = '{a|b}'
    },
    /static/u,
  ],
  [
    'rows',
    (x: ReturnType<typeof fixture>) => {
      x.document.regionalGuidance = Array.from({ length: 4 }, () =>
        structuredClone(x.document.regionalGuidance![0]),
      )
    },
    /three regions/u,
  ],
  [
    'text',
    (x: ReturnType<typeof fixture>) => {
      x.patch.generationDraft.positivePrompt.text = 'x'.repeat(16_385)
    },
    /budget/u,
  ],
] as const) {
  test(`Smart regional ${name} refuses before any consumer`, () => {
    const input = fixture()
    change(input)
    assert.match(reason(input)!, expected)
  })
}

test('worker requires independently qualified Smart/regional combination, not existing names', () => {
  const ready = {
    ...ANIMA_BATCH_READY,
    capabilities: [
      ...ANIMA_BATCH_READY.capabilities,
      'illustrious-outpaint',
      'anima-outpaint',
      'smart-patch-execution',
      'smart-patch-seed-confirmation',
      'anima-smart-patch-regional-inpaint-v1',
    ],
    workerVersion: '0.14.0',
  }
  assert.equal(supportsInferenceAnimaSmartPatchRegional(ready), true)
  for (const cap of [
    'smart-patch-execution',
    'smart-patch-seed-confirmation',
    'anima-smart-patch-regional-inpaint-v1',
    'anima-flow-sampling',
  ]) {
    assert.equal(
      supportsInferenceAnimaSmartPatchRegional({
        ...ready,
        capabilities: ready.capabilities.filter((x) => x !== cap),
      }),
      false,
      cap,
    )
  }
  assert.equal(
    supportsInferenceAnimaSmartPatchRegional({ ...ready, workerVersion: '0.13.0' }),
    false,
  )
})

test('Retry capability requirement follows frozen Smart metadata rather than current authoring', () => {
  const state = {
    animaSmartPatchRegionalSupported: false,
    animaSupported: true,
    smartPatchSupported: true,
  }
  assert.equal(generationQueueRetryReason('anima-smart-patch', state), null)
  assert.match(
    generationQueueRetryReason(
      'anima-smart-patch',
      state,
      null,
      false,
      false,
      0,
      'heun',
      null,
      true,
    )!,
    /Regional Guidance/u,
  )
  assert.equal(
    generationQueueRetryReason(
      'anima-smart-patch',
      { ...state, animaSmartPatchRegionalSupported: true },
      null,
      false,
      false,
      0,
      'heun',
      null,
      true,
    ),
    null,
  )
})

test('Smart OUT regional capability is independent of old INP and ordinary OUT support', () => {
  const common = {
    ...ANIMA_BATCH_READY,
    capabilities: [
      ...ANIMA_BATCH_READY.capabilities,
      'illustrious-outpaint',
      'smart-patch-execution',
      'smart-patch-seed-confirmation',
      'anima-outpaint',
    ],
    workerVersion: '0.14.0',
  }
  const inp = {
    ...common,
    capabilities: [...common.capabilities, 'anima-smart-patch-regional-inpaint-v1'],
  }
  const out = {
    ...common,
    capabilities: [...common.capabilities, 'anima-smart-patch-regional-outpaint-v1'],
  }
  assert.equal(supportsInferenceAnimaSmartPatchRegionalOutpaint(common), false)
  assert.equal(supportsInferenceAnimaSmartPatchRegionalOutpaint(inp), false)
  assert.equal(supportsInferenceAnimaSmartPatchRegionalOutpaint(out), true)
  assert.equal(supportsInferenceAnimaSmartPatchRegional(out), false)
  assert.equal(supportsInferenceAnimaSmartPatchRegionalMode(out, 'outpaint'), true)
  assert.equal(supportsInferenceAnimaSmartPatchRegionalMode(out, 'inpaint'), false)
  assert.equal(supportsInferenceAnimaSmartPatchRegionalMode(inp, 'inpaint'), true)
  assert.equal(supportsInferenceAnimaSmartPatchRegionalMode(inp, 'outpaint'), false)
  assert.equal(supportsInferenceAnimaSmartPatchRegionalMode(out, 'img2img'), false)
  for (const missing of [
    'smart-patch-execution',
    'smart-patch-seed-confirmation',
    'anima-smart-patch-regional-outpaint-v1',
    'anima-flow-sampling',
  ]) {
    assert.equal(
      supportsInferenceAnimaSmartPatchRegionalOutpaint({
        ...out,
        capabilities: out.capabilities.filter((x) => x !== missing),
      }),
      false,
      missing,
    )
  }
})

test('Smart regional advisory requires the capability for the actual known mode', () => {
  const input = { ...fixture(), runtimeOutpaintSupported: false, targetMode: 'outpaint' }
  assert.match(reason(input)!, /engine/u)
  input.runtimeOutpaintSupported = true
  input.runtimeSupported = false
  assert.equal(reason(input), null)
  input.targetMode = 'inpaint'
  assert.match(reason(input)!, /engine/u)
  input.runtimeSupported = true
  assert.equal(reason(input), null)
  input.targetMode = 'img2img'
  assert.match(reason(input)!, /engine/u)
  input.targetMode = 'txt2img'
  assert.match(reason(input)!, /engine/u)
  assert.equal(reason({ ...fixture(), runtimeSupported: undefined, targetMode: 'outpaint' }), null)
})

test('frozen Smart OUT Retry uses its saved OUT requirement independently of current INP support', () => {
  const state = {
    animaSmartPatchRegionalOutpaintSupported: false,
    animaSmartPatchRegionalSupported: true,
    animaSupported: true,
    smartPatchSupported: true,
  }
  const check = (value: typeof state, out: boolean) =>
    generationQueueRetryReason(
      'anima-smart-patch',
      value,
      null,
      false,
      false,
      0,
      'heun',
      null,
      true,
      out,
    )
  assert.match(check(state, true)!, /Smart OUT/u)
  assert.equal(check(state, false), null)
  const onlyOut = {
    ...state,
    animaSmartPatchRegionalOutpaintSupported: true,
    animaSmartPatchRegionalSupported: false,
  }
  assert.equal(check(onlyOut, true), null)
  assert.match(check(onlyOut, false)!, /Regional Guidance/u)
  assert.equal(generationQueueRetryReason('anima-smart-patch', onlyOut), null)
})

for (const mode of ['txt2img', 'img2img'] as const) {
  test(`Smart regional ${mode} requires its own capability without inheriting INP or OUT`, () => {
    const ready = {
      ...ANIMA_BATCH_READY,
      capabilities: [
        ...ANIMA_BATCH_READY.capabilities,
        'illustrious-outpaint',
        'smart-patch-execution',
        'smart-patch-seed-confirmation',
        `anima-smart-patch-regional-${mode}-v1`,
      ],
      workerVersion: '0.14.0',
    }
    assert.equal(supportsInferenceAnimaSmartPatchRegionalMode(ready, mode), true)
    assert.equal(supportsInferenceAnimaSmartPatchRegional(ready), false)
    assert.equal(supportsInferenceAnimaSmartPatchRegionalOutpaint(ready), false)
    assert.equal(
      supportsInferenceAnimaSmartPatchRegionalMode(
        ready,
        mode === 'txt2img' ? 'img2img' : 'txt2img',
      ),
      false,
    )
    assert.equal(supportsInferenceAnimaSmartPatchRegionalTxt2Img(ready), mode === 'txt2img')
    assert.equal(supportsInferenceAnimaSmartPatchRegionalImg2Img(ready), mode === 'img2img')
    for (const missing of [
      `anima-smart-patch-regional-${mode}-v1`,
      'anima-flow-sampling',
      'smart-patch-execution',
      'smart-patch-seed-confirmation',
    ]) {
      assert.equal(
        supportsInferenceAnimaSmartPatchRegionalMode(
          { ...ready, capabilities: ready.capabilities.filter((x) => x !== missing) },
          mode,
        ),
        false,
      )
    }
    const flags =
      mode === 'txt2img' ? { runtimeTxt2ImgSupported: true } : { runtimeImg2ImgSupported: true }
    assert.equal(
      reason({
        ...fixture(),
        runtimeOutpaintSupported: false,
        runtimeSupported: false,
        ...flags,
        targetMode: mode,
      }),
      null,
    )
    assert.match(reason({ ...fixture(), targetMode: mode })!, /engine/u)
    assert.equal(reason({ ...fixture(), runtimeSupported: undefined, targetMode: mode }), null)
  })
  test(`Smart frozen ${mode} Retry requires its saved capability after current regions change`, () => {
    const state = {
      animaSmartPatchRegionalImg2ImgSupported: mode === 'img2img',
      animaSmartPatchRegionalOutpaintSupported: true,
      animaSmartPatchRegionalSupported: true,
      animaSmartPatchRegionalTxt2ImgSupported: mode === 'txt2img',
      animaSupported: true,
      smartPatchSupported: true,
    }
    const check = (value: typeof state) =>
      generationQueueRetryReason(
        'anima-smart-patch',
        value,
        null,
        false,
        false,
        0,
        'euler',
        null,
        true,
        false,
        mode === 'txt2img',
        mode === 'img2img',
      )
    assert.equal(check(state), null)
    assert.match(
      check({
        ...state,
        animaSmartPatchRegionalImg2ImgSupported: false,
        animaSmartPatchRegionalTxt2ImgSupported: false,
      })!,
      /Regional Guidance/u,
    )
    assert.equal(
      generationQueueRetryReason('anima-smart-patch', {
        ...state,
        animaSmartPatchRegionalSupported: false,
      }),
      null,
    )
  })
}

function illustriousFixture() {
  const input = fixture()
  const { context } = literalSmartPatchPreparedInput('illustrious').prepared
  input.patch.generationDraft = structuredClone(context.generationDraft)
  input.patch.generationDraft.sampling.sampler = 'Euler'
  input.patch.generationDraft.sampling.scheduler = 'Normal'
  input.patch.generationDraft.vaePrecision = 'Auto'
  return input
}

for (const mode of ['inpaint', 'outpaint', 'txt2img', 'img2img'] as const) {
  test(`Illustrious Smart regional ${mode} requires exact family/mode readiness`, () => {
    const cap = `illustrious-smart-patch-regional-${mode}-v1`
    const ready = {
      ...ANIMA_BATCH_READY,
      capabilities: [
        ...ANIMA_BATCH_READY.capabilities,
        'illustrious-outpaint',
        'illustrious-euler',
        'illustrious-noise-profile',
        'smart-patch-execution',
        'smart-patch-seed-confirmation',
        cap,
      ],
      workerVersion: '0.14.0',
    }
    assert.equal(supportsInferenceIllustriousSmartPatchRegionalMode(ready, mode), true)
    assert.equal(supportsInferenceSmartPatchRegionalMode(ready, 'illustrious', mode), true)
    for (const required of [
      cap,
      'smart-patch-execution',
      'smart-patch-seed-confirmation',
      'illustrious-euler',
      'illustrious-noise-profile',
    ]) {
      const peer = { ...ready, capabilities: ready.capabilities.filter((x) => x !== required) }
      assert.equal(
        supportsInferenceSmartPatchRegionalMode(peer, 'illustrious', mode),
        false,
        required,
      )
    }
    assert.equal(supportsInferenceSmartPatchRegionalMode(ready, 'anima', mode), false)
    for (const other of ['inpaint', 'outpaint', 'txt2img', 'img2img'].filter((x) => x !== mode)) {
      assert.equal(supportsInferenceSmartPatchRegionalMode(ready, 'illustrious', other), false)
    }
    assert.equal(
      supportsInferenceIllustriousSmartPatchRegionalMode(
        { ...ready, workerVersion: '0.13.0' },
        mode,
      ),
      false,
    )
    const input = illustriousFixture()
    const runtime = {
      runtimeImg2ImgSupported: mode === 'img2img',
      runtimeOutpaintSupported: mode === 'outpaint',
      runtimeSupported: mode === 'inpaint',
      runtimeTxt2ImgSupported: mode === 'txt2img',
    }
    assert.equal(reason({ ...input, ...runtime, targetMode: mode }), null)
    assert.match(
      reason({
        ...input,
        ...runtime,
        [mode === 'inpaint'
          ? 'runtimeSupported'
          : mode === 'outpaint'
            ? 'runtimeOutpaintSupported'
            : mode === 'txt2img'
              ? 'runtimeTxt2ImgSupported'
              : 'runtimeImg2ImgSupported']: false,
        targetMode: mode,
      })!,
      /Illustrious/u,
    )
    const state = {
      [`illustriousSmartPatchRegional${mode === 'inpaint' ? '' : mode === 'outpaint' ? 'Outpaint' : mode === 'txt2img' ? 'Txt2Img' : 'Img2Img'}Supported`]: true,
      smartPatchSupported: true,
    }
    assert.equal(
      generationQueueRetryReason(
        'illustrious-smart-patch',
        state,
        undefined,
        false,
        false,
        0,
        undefined,
        undefined,
        true,
        mode === 'outpaint',
        mode === 'txt2img',
        mode === 'img2img',
      ),
      null,
    )
    assert.match(
      generationQueueRetryReason(
        'illustrious-smart-patch',
        {
          animaSmartPatchRegionalImg2ImgSupported: true,
          animaSmartPatchRegionalOutpaintSupported: true,
          animaSmartPatchRegionalSupported: true,
          animaSmartPatchRegionalTxt2ImgSupported: true,
          smartPatchSupported: true,
        },
        undefined,
        false,
        false,
        0,
        undefined,
        undefined,
        true,
        mode === 'outpaint',
        mode === 'txt2img',
        mode === 'img2img',
      )!,
      /Illustrious/u,
    )
  })
}

test('Illustrious Smart regional guard preserves bounded Euler Normal policy and selected negatives', () => {
  const good = illustriousFixture()
  assert.equal(reason(good), null)
  const unsupported = [
    (x: ReturnType<typeof illustriousFixture>) => {
      x.patch.generationDraft.model!.predictionType = 'sample'
    },
    (x: ReturnType<typeof illustriousFixture>) => {
      x.patch.generationDraft.sampling.sampler = 'Euler a'
    },
    (x: ReturnType<typeof illustriousFixture>) => {
      x.patch.generationDraft.sampling.scheduler = 'Karras'
    },
    (x: ReturnType<typeof illustriousFixture>) => {
      x.patch.generationDraft.sampling.cfgScale = 1
    },
    (x: ReturnType<typeof illustriousFixture>) => {
      x.patch.generationDraft.vaePrecision = 'FP32'
    },
    (x: ReturnType<typeof illustriousFixture>) => {
      x.patch.generationDraft.negativePrompt.text = '{changed|Smart}'
    },
    (x: ReturnType<typeof illustriousFixture>) => {
      x.iterations = 2
    },
  ]
  for (const change of unsupported) {
    const candidate = structuredClone(good)
    change(candidate)
    assert.equal(typeof reason(candidate), 'string')
  }
  good.document.regionalGuidance![0].prompts!.useGlobalNegativePrompt = false
  good.document.regionalGuidance![0].prompts!.negative!.text = 'local exclusion'
  assert.equal(reason(good), null)
})
