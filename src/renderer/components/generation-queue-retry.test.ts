import type { GenerationQueueEntry } from '../../shared/projects/generation-queue-manager.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { generationQueueRetryReason } from './generation-queue-retry.js'

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
