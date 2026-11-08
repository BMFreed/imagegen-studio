import { ANIMA_SAMPLING_METHOD_KEYS } from '../../shared/projects/anima-sampling-method.js'

import assert from 'node:assert/strict'
import test from 'node:test'

import { generationQueueRetryReason } from './generation-queue-retry.js'

test('frozen Anima regional Retry requires only its separate regional operation capability', () => {
  const operation = 'anima-regional-txt2img'
  assert.match(generationQueueRetryReason(operation, null)!, /frozen Anima Regional Guidance/)
  for (const animaRegionalSupported of [undefined, false, true]) {
    const state = { animaRegionalSupported, animaSupported: true, regionalSupported: true }
    assert.equal(
      generationQueueRetryReason(operation, state) === null,
      animaRegionalSupported === true,
    )
  }
  assert.equal(
    generationQueueRetryReason(
      operation,
      { animaRegionalSupported: true, animaSupported: false, regionalSupported: false },
      'DPM++ 2M',
      true,
      true,
      0.7,
    ),
    null,
  )
  assert.equal(generationQueueRetryReason('anima-txt2img', { animaRegionalSupported: false }), null)
  assert.equal(
    generationQueueRetryReason('illustrious-regional-txt2img', {
      animaRegionalSupported: true,
      regionalSupported: false,
    }) === null,
    false,
  )
})

for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
  test(`frozen regional ${method} Retry gates its own method independently of ordinary draft fields`, () => {
    for (const animaRegionalSamplingSupported of [undefined, false, true]) {
      const state = { animaRegionalSamplingSupported, animaRegionalSupported: true }
      assert.equal(
        generationQueueRetryReason(
          'anima-regional-txt2img',
          state,
          'Euler a',
          true,
          true,
          0.7,
          method,
        ) === null,
        method === 'euler' || animaRegionalSamplingSupported === true,
      )
      assert.equal(generationQueueRetryReason('anima-txt2img', state), null)
    }
    assert.notEqual(
      generationQueueRetryReason(
        'anima-regional-txt2img',
        { animaRegionalSamplingSupported: true, animaRegionalSupported: false },
        undefined,
        false,
        false,
        0,
        method,
      ),
      null,
    )
  })
}

for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
  test(`frozen opaque regional ${method} Retry keeps its image and native method gates`, () => {
    for (const animaRegionalImg2ImgSupported of [undefined, false, true]) {
      for (const animaRegionalSamplingSupported of [undefined, false, true]) {
        const state = {
          animaRegionalImg2ImgSupported,
          animaRegionalSamplingSupported,
          animaRegionalSupported: true,
        }
        assert.equal(
          generationQueueRetryReason(
            'anima-regional-img2img',
            state,
            null,
            false,
            false,
            0,
            method,
          ) === null,
          animaRegionalImg2ImgSupported === true &&
            (method === 'euler' || animaRegionalSamplingSupported === true),
        )
        assert.equal(generationQueueRetryReason('anima-img2img', state), null)
      }
    }
  })
}

for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
  test(`frozen OUT regional ${method} Retry keeps its separate OUT and native method gates`, () => {
    for (const animaRegionalOutpaintSupported of [undefined, false, true]) {
      for (const animaRegionalSamplingSupported of [undefined, false, true]) {
        const state = {
          animaRegionalOutpaintSupported,
          animaRegionalSamplingSupported,
          animaRegionalSupported: true,
        }
        assert.equal(
          generationQueueRetryReason(
            'anima-regional-outpaint',
            state,
            null,
            false,
            false,
            0,
            method,
          ) === null,
          animaRegionalOutpaintSupported === true &&
            (method === 'euler' || animaRegionalSamplingSupported === true),
        )
        assert.equal(generationQueueRetryReason('anima-txt2img', state), null)
      }
    }
    assert.notEqual(
      generationQueueRetryReason(
        'anima-regional-outpaint',
        {
          animaRegionalOutpaintSupported: true,
          animaRegionalSamplingSupported: true,
          animaRegionalSupported: false,
        },
        null,
        false,
        false,
        0,
        method,
      ),
      null,
    )
  })
}
