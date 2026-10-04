import assert from 'node:assert/strict'
import test from 'node:test'

import {
  type VaePrecision,
  vaePrecisionControlState,
  vaePrecisionGenerationReason,
} from './vae-precision-control.js'

test('VAE Precision authoring permits saving manual values without runtime while Generate explains its capability refusal', () => {
  for (const value of ['FP16', 'FP32'] as const) {
    for (const runtimeSupported of [false, null]) {
      const state = vaePrecisionControlState({
        editingDisabled: false,
        modelFamily: 'illustrious',
        runtimeSupported,
        runtimeUnavailableReason: null,
        value,
      })
      assert.equal(state.disabled, false)
      assert.ok(state.reason)
      assert.match(
        vaePrecisionGenerationReason(value, false)!,
        /Select Auto|update the image engine/,
      )
    }
    assert.equal(vaePrecisionGenerationReason(value, true), null)
  }
  for (const value of [undefined, 'Auto'] as const) {
    assert.equal(vaePrecisionGenerationReason(value, false), null)
  }
})

test('VAE Precision unavailable-family and locked editing controls preserve the current policy without inventing a runtime default', () => {
  for (const value of [null, 'Auto', 'FP16', 'FP32'] as (VaePrecision | null)[]) {
    for (const modelFamily of [null, 'anima', 'unknown']) {
      const state = vaePrecisionControlState({
        editingDisabled: false,
        modelFamily,
        runtimeSupported: true,
        runtimeUnavailableReason: null,
        value,
      })
      assert.equal(state.disabled, true)
      assert.match(state.reason!, /Illustrious/)
    }
    assert.equal(
      vaePrecisionControlState({
        editingDisabled: true,
        modelFamily: 'illustrious',
        runtimeSupported: true,
        runtimeUnavailableReason: null,
        value,
      }).disabled,
      true,
    )
  }
  const offline = vaePrecisionControlState({
    editingDisabled: false,
    modelFamily: 'illustrious',
    runtimeSupported: false,
    runtimeUnavailableReason: 'Image engine unavailable.',
    value: 'FP32',
  })
  assert.equal(offline.disabled, false)
  assert.match(offline.reason!, /still save/)
  const input = {
    editingDisabled: false,
    modelFamily: 'illustrious',
    runtimeSupported: false,
    runtimeUnavailableReason: null,
    value: null,
  }
  assert.deepEqual(vaePrecisionControlState(input), { disabled: false, reason: null })
  assert.equal(input.value, null)
})
