import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  cfgRescaleControlState,
  cfgRescaleDisplayValue,
  cfgRescaleEditingValid,
  cfgRescaleGenerationCapabilityReason,
  cfgRescaleGenerationRangeReason,
  parseCfgRescaleInput,
} from './cfg-rescale-control.js'

test('CFG Rescale control requires Illustrious and actual runtime qualification with an explicit disabled reason', () => {
  const qualified = {
    editingDisabled: false,
    modelFamily: 'illustrious',
    runtimeSupported: true,
    runtimeUnavailableReason: null,
  }
  assert.deepEqual(cfgRescaleControlState(qualified), { disabled: false, reason: null })
  for (const [change, diagnostic] of [
    [{ modelFamily: 'anima' }, /available only for Illustrious/],
    [{ modelFamily: null }, /Illustrious checkpoint/],
    [{ runtimeSupported: null }, /Checking/],
    [{ runtimeSupported: false }, /current image engine does not support CFG Rescale/],
    [{ runtimeUnavailableReason: 'Image engine crashed' }, /Image engine crashed/],
  ] as const) {
    const state = cfgRescaleControlState({ ...qualified, ...change })
    assert.equal(state.disabled, true)
    assert.match(state.reason!, diagnostic)
  }
  assert.deepEqual(cfgRescaleControlState({ ...qualified, editingDisabled: true }), {
    disabled: true,
    reason: null,
  })
})

test('CFG Rescale Generate gate rejects nonneutral settings on an older engine while preserving neutral and Save behavior', () => {
  for (const value of [undefined, 0]) {
    assert.equal(cfgRescaleGenerationCapabilityReason(value, false), null)
  }
  for (const value of [0.7, 0.99]) {
    assert.equal(cfgRescaleGenerationCapabilityReason(value, true), null)
    assert.match(
      cfgRescaleGenerationCapabilityReason(value, false)!,
      /Reset CFG Rescale or update the image engine/,
    )
    assert.equal(
      cfgRescaleEditingValid(String(value), false),
      true,
      'engine qualification does not block Save',
    )
  }
})

test('CFG Rescale display preserves absent versus explicit zero and validates the complete accepted numeric range', () => {
  assert.equal(cfgRescaleDisplayValue(null, 'illustrious'), '0')
  assert.equal(cfgRescaleDisplayValue(null, 'anima'), '')
  assert.equal(cfgRescaleDisplayValue(0, 'anima'), '0')
  assert.equal(cfgRescaleDisplayValue(0.7, 'illustrious'), '0.7')
  assert.equal(
    cfgRescaleEditingValid('1', false),
    true,
    'portable legacy value does not block Save on hydration',
  )
  assert.equal(cfgRescaleEditingValid('1', true), false, 'unsent invalid raw edit blocks Save')
  assert.match(cfgRescaleGenerationRangeReason(1)!, /before generating/)
  assert.equal(cfgRescaleGenerationRangeReason(0), null)
  assert.equal(cfgRescaleGenerationRangeReason(undefined), null)
  for (const [text, value] of [
    ['0', 0],
    ['.99', 0.99],
    ['0.12345', 0.123_45],
    ['7e-1', 0.7],
    ['', null],
    [' ', null],
  ] as const) {
    assert.deepEqual(parseCfgRescaleInput(text), { kind: 'valid', value })
  }
  for (const text of ['-0.01', '1', '0.99001', 'Infinity', 'NaN', '1e309', '0.7x', '--', '0,7']) {
    assert.deepEqual(parseCfgRescaleInput(text), { kind: 'invalid' })
  }
})
