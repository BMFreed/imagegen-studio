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
