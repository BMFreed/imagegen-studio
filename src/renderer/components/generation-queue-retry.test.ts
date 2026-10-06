import type { GenerationQueueEntry } from '../../shared/projects/generation-queue-manager.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { outpaintQueueRetryReason } from './generation-queue-retry.js'

test('outpaint Retry uses the frozen family and fails closed for missing or opposite capabilities', () => {
  // Boundary: renderer advisory over the typed Main state. Neighbor: the opposite family flag
  // remains true. Mutation: qualify all frozen jobs from one common flag or treat absence as ready.
  for (const supported of [undefined, false, true]) {
    const illustrious = outpaintQueueRetryReason('illustrious-outpaint', {
      animaOutpaintSupported: true,
      outpaintSupported: supported,
    })
    const anima = outpaintQueueRetryReason('anima-outpaint', {
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
  assert.match(outpaintQueueRetryReason('illustrious-outpaint', {})!, /outpaint for Illustrious/)
  assert.match(outpaintQueueRetryReason('anima-outpaint', {})!, /outpaint for Anima/)
})

test('unknown outpaint state remains a check in progress; ordinary frozen operations keep their existing gates', () => {
  assert.match(outpaintQueueRetryReason('illustrious-outpaint', null)!, /Checking image engine/)
  assert.match(outpaintQueueRetryReason('anima-outpaint', null)!, /Checking image engine/)
  // The finite ordinary neighbors come from GenerationQueueEntry.operation. A helper failure
  // or legacy peer must not add an outpaint-specific refusal to their existing Retry flow.
  const ordinary: GenerationQueueEntry['operation'][] = [
    'illustrious-txt2img',
    'illustrious-img2img',
    'anima-txt2img',
    'anima-img2img',
  ]
  for (const operation of ordinary) {
    assert.equal(outpaintQueueRetryReason(operation, null), null)
    assert.equal(outpaintQueueRetryReason(operation, {}), null)
    assert.equal(
      outpaintQueueRetryReason(operation, {
        animaOutpaintSupported: false,
        outpaintSupported: false,
      }),
      null,
    )
  }
})
