import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isQualifiedInferenceWorkerReady,
  supportsInferenceDenoisingProgress,
} from './inference-worker-capabilities.js'

const legacyReady = {
  capabilities: ['illustrious-txt2img'],
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.2.0',
}

test('qualification matrix accepts legacy inference and requires progress capability for 0.3.0', () => {
  assert.equal(isQualifiedInferenceWorkerReady(legacyReady), true)
  assert.equal(supportsInferenceDenoisingProgress(legacyReady), false)
  const current = {
    ...legacyReady,
    capabilities: ['illustrious-txt2img', 'denoising-progress', 'target-composition'],
    workerVersion: '0.3.0',
  }
  assert.equal(isQualifiedInferenceWorkerReady(current), true)
  assert.equal(supportsInferenceDenoisingProgress(current), true)
  assert.equal(
    isQualifiedInferenceWorkerReady({ ...current, capabilities: ['illustrious-txt2img'] }),
    false,
  )
  assert.equal(
    isQualifiedInferenceWorkerReady({ ...current, capabilities: ['denoising-progress'] }),
    false,
  )
  assert.equal(supportsInferenceDenoisingProgress({ ...current, workerVersion: '0.2.0' }), false)
})

test('qualification matrix rejects unrecognized versions, profiles, protocols and malformed capabilities', () => {
  for (const invalid of [
    null,
    [],
    { ...legacyReady, workerVersion: '0.1.0' },
    { ...legacyReady, workerVersion: '0.4.0' },
    { ...legacyReady, workerVersion: '0.3.1' },
    { ...legacyReady, protocolVersion: '2' },
    { ...legacyReady, runtimeProfile: 'cpu' },
    { ...legacyReady, capabilities: null },
    { ...legacyReady, capabilities: [] },
    { ...legacyReady, capabilities: ['illustrious-txt2img', 1] },
  ]) {
    assert.equal(isQualifiedInferenceWorkerReady(invalid), false)
    assert.equal(supportsInferenceDenoisingProgress(invalid), false)
  }
})
