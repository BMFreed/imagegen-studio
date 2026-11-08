import type { GenerationQueueEntry } from '../../shared/projects/generation-queue-manager.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { generationQueueRetryReason } from './generation-queue-retry.js'

test('regional outpaint Retry requires its own capability and frozen image option prerequisites', () => {
  const supported = {
    outpaintSupported: true,
    regionalCfgRescaleSupported: true,
    regionalImg2ImgCfgRescaleSupported: true,
    regionalImg2ImgDpmpp2mSupported: true,
    regionalImg2ImgEulerASupported: true,
    regionalImg2ImgSupported: true,
    regionalImg2ImgVaeSupported: true,
    regionalInvokeInitializationSupported: false,
    regionalLoraSupported: true,
    regionalOutpaintSupported: true,
    regionalSupported: true,
    regionalVaeSupported: true,
  }
  const operation = 'illustrious-regional-outpaint'
  assert.match(generationQueueRetryReason(operation, null)!, /Checking image engine/)
  for (const regionalOutpaintSupported of [undefined, false, true]) {
    const reason = generationQueueRetryReason(operation, {
      ...supported,
      regionalOutpaintSupported,
    })
    assert.equal(reason === null, regionalOutpaintSupported === true)
    if (reason) {
      assert.match(reason, /outpaint with Regional Guidance/)
    }
    assert.equal(
      generationQueueRetryReason('illustrious-outpaint', {
        ...supported,
        regionalOutpaintSupported,
      }),
      null,
    )
  }
  for (const sampler of ['Euler', 'Euler a', 'DPM++ 2M']) {
    assert.equal(generationQueueRetryReason(operation, supported, sampler, true, true, 0.7), null)
  }
  for (const [flag, sampler, lora, vae, rescale] of [
    ['regionalImg2ImgEulerASupported', 'Euler a', false, false, 0],
    ['regionalImg2ImgDpmpp2mSupported', 'DPM++ 2M', false, false, 0],
    ['regionalImg2ImgCfgRescaleSupported', 'Euler', false, false, 0.7],
    ['regionalImg2ImgVaeSupported', 'Euler', false, true, 0],
    ['regionalLoraSupported', 'Euler', true, false, 0],
  ] as const) {
    assert.notEqual(
      generationQueueRetryReason(
        operation,
        { ...supported, [flag]: false },
        sampler,
        lora,
        vae,
        rescale,
      ),
      null,
    )
  }
  assert.equal(
    generationQueueRetryReason(
      'illustrious-regional-txt2img',
      { ...supported, regionalOutpaintSupported: false },
      'Euler',
    ),
    null,
  )
})

test('regional LoRA Retry advisory follows the frozen stack and its separate capability', () => {
  for (const regionalLoraSupported of [undefined, false, true]) {
    const state = { regionalLoraSupported, regionalSupported: true }
    const reason = generationQueueRetryReason('illustrious-regional-txt2img', state, 'Euler', true)
    assert.equal(reason === null, regionalLoraSupported === true)
    if (reason) {
      assert.match(reason, /global LoRAs.*Repair or update/)
    }
    assert.equal(
      generationQueueRetryReason('illustrious-regional-txt2img', state, 'Euler', false),
      null,
    )
    assert.equal(generationQueueRetryReason('illustrious-txt2img', state, 'Euler', true), null)
  }
  assert.match(
    generationQueueRetryReason(
      'illustrious-regional-txt2img',
      { regionalLoraSupported: true, regionalSupported: false },
      'Euler',
      true,
    )!,
    /does not support Regional Guidance/,
  )
})

test('regional Retry advisory follows the frozen sampler and requires a separate Euler a capability', () => {
  for (const regionalInvokeInitializationSupported of [undefined, false, true]) {
    const state = { regionalInvokeInitializationSupported, regionalSupported: true }
    assert.equal(generationQueueRetryReason('illustrious-regional-txt2img', state, 'Euler'), null)
    const result = generationQueueRetryReason('illustrious-regional-txt2img', state, 'Euler a')
    assert.equal(result === null, regionalInvokeInitializationSupported === true)
    if (result) {
      assert.match(result, /Euler a.*Repair or update/)
    }
  }
  assert.notEqual(
    generationQueueRetryReason(
      'illustrious-regional-txt2img',
      { regionalInvokeInitializationSupported: true, regionalSupported: false },
      'Euler a',
    ),
    null,
  )
  assert.equal(
    generationQueueRetryReason('illustrious-txt2img', { regionalSupported: false }, 'Euler a'),
    null,
  )
})

test('regional Retry requires its frozen operation capability, independent of all ordinary flags', () => {
  const operation = 'illustrious-regional-txt2img'
  assert.match(generationQueueRetryReason(operation, null)!, /Checking image engine/)
  for (const regionalSupported of [undefined, false, true]) {
    const result = generationQueueRetryReason(operation, {
      animaOutpaintSupported: true,
      animaSupported: true,
      outpaintSupported: true,
      regionalSupported,
      smartPatchSupported: true,
    })
    assert.equal(result === null, regionalSupported === true)
    if (result !== null) {
      assert.match(result, /does not support Regional Guidance.*Repair or update/)
    }
  }
  assert.equal(
    generationQueueRetryReason('illustrious-txt2img', { regionalSupported: false }),
    null,
  )
  assert.equal(
    generationQueueRetryReason('illustrious-img2img', { regionalSupported: false }),
    null,
  )
})

test('outpaint Retry uses the frozen family and fails closed for missing or opposite capabilities', () => {
  // Boundary: renderer advisory over the typed Main state. Neighbor: the opposite family flag
  // remains true. Mutation: qualify all frozen jobs from one common flag or treat absence as ready.
  for (const supported of [undefined, false, true]) {
    const illustrious = generationQueueRetryReason('illustrious-outpaint', {
      animaOutpaintSupported: true,
      outpaintSupported: supported,
    })
    const anima = generationQueueRetryReason('anima-outpaint', {
      animaOutpaintSupported: supported,
      outpaintSupported: true,
    })
    if (supported === true) {
      assert.equal(illustrious, null)
      assert.equal(anima, null)
    } else {
      assert.match(illustrious!, /outpaint for Illustrious/)
      assert.match(anima!, /outpaint for Anima/)
    }
  }
  assert.match(generationQueueRetryReason('illustrious-outpaint', {})!, /outpaint for Illustrious/)
  assert.match(generationQueueRetryReason('anima-outpaint', {})!, /outpaint for Anima/)
})

test('unknown outpaint state remains a check in progress; ordinary frozen operations keep their existing gates', () => {
  assert.match(generationQueueRetryReason('illustrious-outpaint', null)!, /Checking image engine/)
  assert.match(generationQueueRetryReason('anima-outpaint', null)!, /Checking image engine/)
  // The finite ordinary neighbors come from GenerationQueueEntry.operation. A helper failure
  // or legacy peer must not add an outpaint-specific refusal to their existing Retry flow.
  const ordinary: GenerationQueueEntry['operation'][] = [
    'illustrious-txt2img',
    'illustrious-img2img',
    'anima-txt2img',
    'anima-img2img',
  ]
  for (const operation of ordinary) {
    assert.equal(generationQueueRetryReason(operation, null), null)
    assert.equal(generationQueueRetryReason(operation, {}), null)
    assert.equal(
      generationQueueRetryReason(operation, {
        animaOutpaintSupported: false,
        outpaintSupported: false,
      }),
      null,
    )
  }
})

test('Smart Patch Retry requires its own capability and the frozen family, including absent legacy flags', () => {
  // Boundary: renderer advisory. Neighbor: all ordinary/outpaint capabilities remain true.
  // Mutation: enable Smart Retry from outpaint support, or ignore the frozen Anima family.
  for (const smartPatchSupported of [undefined, false, true]) {
    for (const animaSupported of [undefined, false, true]) {
      const state = {
        animaOutpaintSupported: true,
        animaSupported,
        outpaintSupported: true,
        smartPatchSupported,
      }
      const illustrious = generationQueueRetryReason('illustrious-smart-patch', state)
      const anima = generationQueueRetryReason('anima-smart-patch', state)
      assert.equal(illustrious === null, smartPatchSupported === true)
      assert.equal(anima === null, smartPatchSupported === true && animaSupported === true)
    }
  }
  for (const operation of ['illustrious-smart-patch', 'anima-smart-patch'] as const) {
    assert.match(generationQueueRetryReason(operation, null)!, /Checking image engine/)
    assert.match(generationQueueRetryReason(operation, {})!, /does not support Smart Patch/)
  }
  assert.equal(
    generationQueueRetryReason('illustrious-outpaint', {
      outpaintSupported: true,
      smartPatchSupported: false,
    }),
    null,
  )
})

test('regional VAE Retry advisory follows frozen selection and precision independently of LoRA', () => {
  for (const regionalVaeSupported of [undefined, false, true]) {
    const state = { regionalSupported: true, regionalVaeSupported }
    const reason = generationQueueRetryReason(
      'illustrious-regional-txt2img',
      state,
      'Euler',
      false,
      true,
    )
    assert.equal(reason === null, regionalVaeSupported === true)
    if (reason) {
      assert.match(reason, /selected VAE.*Repair or update/)
    }
    assert.equal(
      generationQueueRetryReason('illustrious-regional-txt2img', state, 'Euler', false, false),
      null,
    )
    assert.equal(
      generationQueueRetryReason('illustrious-txt2img', state, 'Euler', false, true),
      null,
    )
  }
})

test('regional IMG VAE Retry requires the frozen selection combination while legacy and TXT remain independent', () => {
  for (const regionalImg2ImgVaeSupported of [undefined, false, true]) {
    const state = {
      regionalImg2ImgSupported: true,
      regionalImg2ImgVaeSupported,
      regionalSupported: true,
      regionalVaeSupported: true,
    }
    const reason = generationQueueRetryReason(
      'illustrious-regional-img2img',
      state,
      'Euler',
      false,
      true,
    )
    assert.equal(reason === null, regionalImg2ImgVaeSupported === true)
    if (reason) {
      assert.match(reason, /selected VAE and precision with opaque regional img2img/)
    }
    assert.equal(
      generationQueueRetryReason('illustrious-regional-img2img', state, 'Euler', false, false),
      null,
    )
    assert.equal(
      generationQueueRetryReason('illustrious-regional-txt2img', state, 'Euler', false, true),
      null,
    )
    assert.match(
      generationQueueRetryReason(
        'illustrious-regional-img2img',
        { ...state, regionalVaeSupported: false },
        'Euler',
        false,
        true,
      )!,
      /with Regional Guidance/,
    )
  }
})

test('frozen regional V Retry follows the recorded objective independently of current epsilon state', () => {
  for (const regionalVPredictionSupported of [undefined, false, true]) {
    const state = { regionalSupported: true, regionalVPredictionSupported }
    const reason = generationQueueRetryReason(
      'illustrious-regional-txt2img',
      state,
      'Euler',
      false,
      false,
      0,
      undefined,
      'v_prediction',
    )
    assert.equal(reason === null, regionalVPredictionSupported === true)
    if (reason) {
      assert.match(reason, /frozen Regional Guidance v_prediction.*Repair or update/)
    }
    assert.equal(
      generationQueueRetryReason(
        'illustrious-regional-txt2img',
        state,
        'Euler',
        false,
        false,
        0,
        undefined,
        'epsilon',
      ),
      null,
    )
    assert.equal(
      generationQueueRetryReason(
        'illustrious-txt2img',
        state,
        'Euler',
        false,
        false,
        0,
        undefined,
        'v_prediction',
      ),
      null,
    )
  }
})

for (const [operation, sampler] of [
  ['illustrious-regional-img2img', 'Euler'],
  ['illustrious-regional-txt2img', 'Euler a'],
] as const) {
  test(`frozen V Retry cannot turn qualified ${operation}/${sampler} into an unsupported objective combination`, () => {
    assert.match(
      generationQueueRetryReason(
        operation,
        {
          regionalImg2ImgSupported: true,
          regionalInvokeInitializationSupported: true,
          regionalSupported: true,
          regionalVPredictionSupported: true,
        },
        sampler,
        false,
        false,
        0,
        undefined,
        'v_prediction',
      )!,
      /requires TXT Euler/,
    )
  })
}
