import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isQualifiedInferenceWorkerReady,
  supportsInferenceCandidateThumbnails,
  supportsInferenceCFGRescale,
  supportsInferenceDenoisingProgress,
  supportsInferenceImg2Img,
  supportsInferenceLora,
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
    { ...legacyReady, workerVersion: '0.6.0' },
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

test('rescale qualification requires exact 0.5.0 and every supported pipeline capability', () => {
  const capabilities = [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
  ]
  const current = { ...legacyReady, capabilities, workerVersion: '0.5.0' }
  assert.ok(isQualifiedInferenceWorkerReady(current))
  assert.ok(supportsInferenceCFGRescale(current))
  assert.ok(supportsInferenceDenoisingProgress(current))
  assert.ok(supportsInferenceCandidateThumbnails(current))
  for (const removed of capabilities) {
    const incomplete: unknown = {
      ...current,
      capabilities: capabilities.filter((value) => value !== removed),
    }
    assert.equal(isQualifiedInferenceWorkerReady(incomplete), false)
    assert.equal(supportsInferenceCFGRescale(incomplete), false)
  }
  for (const workerVersion of ['0.2.0', '0.3.0', '0.4.0', '0.6.0']) {
    assert.equal(supportsInferenceCFGRescale({ ...current, workerVersion }), false)
  }
})

test('thumbnail qualification requires exact 0.4.0 and both progress and thumbnail capabilities', () => {
  const current = {
    ...legacyReady,
    capabilities: ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails'],
    workerVersion: '0.4.0',
  }
  assert.ok(isQualifiedInferenceWorkerReady(current))
  assert.ok(supportsInferenceDenoisingProgress(current))
  assert.ok(supportsInferenceCandidateThumbnails(current))
  assert.equal(supportsInferenceCandidateThumbnails(legacyReady), false)
  assert.equal(supportsInferenceCandidateThumbnails({ ...current, workerVersion: '0.3.0' }), false)
  for (const capabilities of [
    ['illustrious-txt2img', 'denoising-progress'],
    ['illustrious-txt2img', 'candidate-thumbnails'],
    ['denoising-progress', 'candidate-thumbnails'],
  ]) {
    assert.equal(isQualifiedInferenceWorkerReady({ ...current, capabilities }), false)
    assert.equal(supportsInferenceCandidateThumbnails({ ...current, capabilities }), false)
  }
})

test('opaque img2img requires qualified 0.6.0 and retains all earlier capabilities', () => {
  const capabilities = [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
  ]
  const current = { ...legacyReady, capabilities, workerVersion: '0.6.0' }
  assert.ok(isQualifiedInferenceWorkerReady(current))
  assert.ok(supportsInferenceImg2Img(current))
  assert.ok(supportsInferenceCFGRescale(current))
  assert.ok(supportsInferenceDenoisingProgress(current))
  assert.ok(supportsInferenceCandidateThumbnails(current))
  for (const removed of capabilities) {
    const incomplete: unknown = {
      ...current,
      capabilities: capabilities.filter((value) => value !== removed),
    }
    assert.equal(isQualifiedInferenceWorkerReady(incomplete), false)
    assert.equal(supportsInferenceImg2Img(incomplete), false)
  }
  for (const workerVersion of ['0.2.0', '0.3.0', '0.4.0', '0.5.0', '0.7.0']) {
    assert.equal(supportsInferenceImg2Img({ ...current, workerVersion }), false)
  }
})

test('native LoRA qualification requires exact 0.7.0 and all retained pipeline capabilities', () => {
  const capabilities = [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
    'illustrious-lora',
  ]
  const current = { ...legacyReady, capabilities, workerVersion: '0.7.0' }
  assert.ok(isQualifiedInferenceWorkerReady(current))
  for (const supports of [
    supportsInferenceLora,
    supportsInferenceImg2Img,
    supportsInferenceCFGRescale,
    supportsInferenceCandidateThumbnails,
    supportsInferenceDenoisingProgress,
  ]) {
    assert.ok(supports(current))
  }
  for (const removed of capabilities) {
    const incomplete: unknown = {
      ...current,
      capabilities: capabilities.filter((entry) => entry !== removed),
    }
    assert.equal(isQualifiedInferenceWorkerReady(incomplete), false)
    assert.equal(supportsInferenceLora(incomplete), false)
  }
  for (const workerVersion of ['0.2.0', '0.3.0', '0.4.0', '0.5.0', '0.6.0', '0.7.1']) {
    assert.equal(supportsInferenceLora({ ...current, workerVersion }), false)
  }
  assert.equal(supportsInferenceImg2Img(null), false)
})
