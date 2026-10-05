import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  denoisingControlReason,
  denoisingGenerationReason,
  denoisingRuntimeSupport,
  parseDenoisingStrength,
} from './denoising-strength-control.js'

test('denoising control and Generate require verified opaque pixels, supported model/engine and explicit strength', () => {
  const input = {
    modelFamily: 'illustrious',
    runtimeUnavailableReason: null,
    supported: true,
    target: {
      documentId: 'test',
      mode: 'img2img' as const,
      targetKey: 'a'.repeat(64),
      unavailableReason: null,
    },
    targetError: null,
  }
  assert.equal(denoisingControlReason(input), null)
  assert.match(
    denoisingControlReason({ ...input, target: { ...input.target, mode: 'txt2img' } })!,
    /raster input/,
  )
  assert.match(
    denoisingControlReason({ ...input, target: { ...input.target, mode: 'outpaint' } })!,
    /partly transparent/,
  )
  assert.match(
    denoisingControlReason({ ...input, target: null, targetError: 'Pixel read failed' })!,
    /Pixel read failed/,
  )
  assert.equal(denoisingControlReason({ ...input, modelFamily: 'anima' }), null)
  assert.match(
    denoisingControlReason({ ...input, modelFamily: 'unknown' })!,
    /supported Illustrious or Anima/,
  )
  assert.match(denoisingControlReason({ ...input, supported: false })!, /image engine/)
  assert.match(denoisingGenerationReason('img2img', null, true)!, /Set Denoising Strength/)
  assert.equal(denoisingGenerationReason('img2img', 0, true), null)
  assert.equal(denoisingGenerationReason('img2img', 1, true), null)
  assert.match(denoisingGenerationReason('img2img', 0.75, false)!, /image engine/)
  assert.equal(denoisingGenerationReason('txt2img', 0.75, false), null)
  assert.equal(
    denoisingGenerationReason(null, null, false),
    null,
    'unknown advisory mode cannot invent an empty or opaque target',
  )
})

test('Anima denoising uses native qualification independently of the Illustrious image capability', () => {
  assert.equal(denoisingRuntimeSupport('anima', null), null)
  assert.equal(denoisingRuntimeSupport('anima', { img2imgSupported: true }), false)
  assert.equal(
    denoisingRuntimeSupport('anima', { animaSupported: false, img2imgSupported: true }),
    false,
  )
  assert.equal(
    denoisingRuntimeSupport('anima', { animaSupported: true, img2imgSupported: false }),
    true,
  )
  assert.equal(
    denoisingRuntimeSupport('illustrious', { animaSupported: true, img2imgSupported: false }),
    false,
  )
  assert.equal(
    denoisingRuntimeSupport('illustrious', { animaSupported: false, img2imgSupported: true }),
    true,
  )
  assert.equal(denoisingGenerationReason('img2img', 0, true, 'anima'), null)
  assert.match(denoisingGenerationReason('img2img', 0, false, 'anima')!, /for Anima/)
  assert.match(denoisingGenerationReason('img2img', null, true, 'anima')!, /Set Denoising Strength/)
  assert.match(denoisingGenerationReason('outpaint', 0.5, true, 'anima')!, /partly transparent/)
})

test('denoising raw input retains zero, one and unset while refusing nonfinite and out-of-range values', () => {
  for (const [raw, value] of [
    ['0', 0],
    ['1', 1],
    ['.75', 0.75],
    ['', null],
  ] as const) {
    assert.deepEqual(parseDenoisingStrength(raw), { kind: 'valid', value })
  }
  for (const raw of ['-0.1', '1.00001', 'Infinity', 'NaN', '1e500', '0,5']) {
    assert.deepEqual(parseDenoisingStrength(raw), { kind: 'invalid' })
  }
})
