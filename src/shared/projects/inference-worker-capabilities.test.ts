import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isQualifiedInferenceWorkerReady,
  supportsInferenceAnima,
  supportsInferenceAnimaOutpaint,
  supportsInferenceAnimaSmartPatchRegionalLoraMode,
  supportsInferenceAnimaSmartPatchRegionalMode,
  supportsInferenceCandidateThumbnails,
  supportsInferenceCFGRescale,
  supportsInferenceDenoisingProgress,
  supportsInferenceEmbeddings,
  supportsInferenceEuler,
  supportsInferenceExternalVae,
  supportsInferenceIllustriousNoiseProfile,
  supportsInferenceImg2Img,
  supportsInferenceLora,
  supportsInferenceOutpaint,
  supportsInferenceSmartPatchRegionalMode,
  supportsInferenceVaePrecision,
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

test('VAE Precision requires exact 0.8.0 and every retained pipeline capability', () => {
  const capabilities = [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
    'illustrious-lora',
    'illustrious-vae-precision',
  ]
  const current = { ...legacyReady, capabilities, workerVersion: '0.8.0' }
  for (const supports of [
    isQualifiedInferenceWorkerReady,
    supportsInferenceVaePrecision,
    supportsInferenceLora,
    supportsInferenceImg2Img,
    supportsInferenceCFGRescale,
    supportsInferenceCandidateThumbnails,
    supportsInferenceDenoisingProgress,
  ]) {
    assert.equal(supports(current), true)
  }
  for (const removed of capabilities) {
    const incomplete = {
      ...current,
      capabilities: capabilities.filter((entry) => entry !== removed),
    }
    assert.equal(isQualifiedInferenceWorkerReady(incomplete), false)
    assert.equal(supportsInferenceVaePrecision(incomplete), false)
  }
  for (const workerVersion of ['0.2.0', '0.3.0', '0.4.0', '0.5.0', '0.6.0', '0.7.0', '0.8.1']) {
    assert.equal(supportsInferenceVaePrecision({ ...current, workerVersion }), false)
  }
  assert.equal(supportsInferenceVaePrecision(null), false)
})

test('external VAE requires qualified 0.9.0 with every retained capability and rejects legacy or future advertising', () => {
  const capabilities = [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
    'illustrious-lora',
    'illustrious-vae-precision',
    'illustrious-external-vae',
  ]
  const current = { ...legacyReady, capabilities, workerVersion: '0.9.0' }
  for (const supports of [
    isQualifiedInferenceWorkerReady,
    supportsInferenceExternalVae,
    supportsInferenceVaePrecision,
    supportsInferenceLora,
    supportsInferenceImg2Img,
    supportsInferenceCFGRescale,
    supportsInferenceCandidateThumbnails,
    supportsInferenceDenoisingProgress,
  ]) {
    assert.equal(supports(current), true)
  }
  for (const removed of capabilities) {
    const incomplete = {
      ...current,
      capabilities: capabilities.filter((entry) => entry !== removed),
    }
    assert.equal(isQualifiedInferenceWorkerReady(incomplete), false)
    assert.equal(supportsInferenceExternalVae(incomplete), false)
  }
  for (const workerVersion of [
    '0.2.0',
    '0.3.0',
    '0.4.0',
    '0.5.0',
    '0.6.0',
    '0.7.0',
    '0.8.0',
    '0.9.1',
    '0.10.0',
  ]) {
    assert.equal(supportsInferenceExternalVae({ ...current, workerVersion }), false)
  }
  for (const invalid of [
    null,
    { ...current, protocolVersion: '2' },
    { ...current, runtimeProfile: 'cpu' },
  ]) {
    assert.equal(supportsInferenceExternalVae(invalid), false)
  }
})

test('dual-CLIP embeddings require exact 0.10.0 with all retained capabilities and reject missing or legacy support', () => {
  const capabilities = [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
    'illustrious-lora',
    'illustrious-vae-precision',
    'illustrious-external-vae',
    'illustrious-embeddings',
  ]
  const current = { ...legacyReady, capabilities, workerVersion: '0.10.0' }
  for (const supports of [
    isQualifiedInferenceWorkerReady,
    supportsInferenceEmbeddings,
    supportsInferenceExternalVae,
    supportsInferenceVaePrecision,
    supportsInferenceLora,
    supportsInferenceImg2Img,
    supportsInferenceCFGRescale,
    supportsInferenceCandidateThumbnails,
    supportsInferenceDenoisingProgress,
  ]) {
    assert.equal(supports(current), true)
  }
  for (const removed of capabilities) {
    const incomplete = {
      ...current,
      capabilities: capabilities.filter((entry) => entry !== removed),
    }
    assert.equal(isQualifiedInferenceWorkerReady(incomplete), false)
    assert.equal(supportsInferenceEmbeddings(incomplete), false)
  }
  for (const workerVersion of [
    '0.2.0',
    '0.3.0',
    '0.4.0',
    '0.5.0',
    '0.6.0',
    '0.7.0',
    '0.8.0',
    '0.9.0',
    '0.10.1',
    '0.12.0',
  ]) {
    assert.equal(supportsInferenceEmbeddings({ ...current, workerVersion }), false)
  }
  assert.equal(supportsInferenceEmbeddings({ ...current, runtimeProfile: 'cpu' }), false)
  assert.equal(supportsInferenceEmbeddings({ ...current, protocolVersion: '2' }), false)
})

const currentCoreCapabilities = [
  'illustrious-txt2img',
  'denoising-progress',
  'candidate-thumbnails',
  'illustrious-cfg-rescale',
  'illustrious-img2img',
  'illustrious-lora',
  'illustrious-vae-precision',
  'illustrious-external-vae',
  'illustrious-embeddings',
]
const animaCapabilities = [
  'anima-txt2img',
  'anima-img2img',
  'anima-lora',
  'anima-prompt-weighting',
  'anima-flow-sampling',
]
const currentReady = {
  ...legacyReady,
  capabilities: [...currentCoreCapabilities, ...animaCapabilities],
  workerVersion: '0.11.0',
}
const coreChecks = [
  isQualifiedInferenceWorkerReady,
  supportsInferenceDenoisingProgress,
  supportsInferenceCandidateThumbnails,
  supportsInferenceCFGRescale,
  supportsInferenceImg2Img,
  supportsInferenceLora,
  supportsInferenceVaePrecision,
  supportsInferenceExternalVae,
  supportsInferenceEmbeddings,
]

const eulerReady = {
  ...currentReady,
  capabilities: [
    ...currentReady.capabilities,
    'illustrious-outpaint',
    'anima-outpaint',
    'illustrious-euler',
  ],
  workerVersion: '0.13.0',
}

test('ordinary Illustrious Euler requires qualified 0.13.0 and its explicit capability', () => {
  assert.equal(supportsInferenceEuler(eulerReady), true)
  for (const check of [
    ...coreChecks,
    supportsInferenceAnima,
    supportsInferenceOutpaint,
    supportsInferenceAnimaOutpaint,
  ]) {
    assert.equal(check(eulerReady), true, check.name)
  }

  for (const peer of [
    { ...eulerReady, workerVersion: '0.12.0' },
    {
      ...eulerReady,
      capabilities: eulerReady.capabilities.filter(
        (capability) => capability !== 'illustrious-euler',
      ),
    },
  ]) {
    assert.equal(supportsInferenceEuler(peer), false)
    // Ordinary retained methods and native Anima Euler do not acquire this new requirement.
    for (const check of [
      ...coreChecks,
      supportsInferenceAnima,
      supportsInferenceOutpaint,
      supportsInferenceAnimaOutpaint,
    ]) {
      assert.equal(check(peer), true, check.name)
    }
  }
})

test('an Euler advertisement cannot qualify incomplete, malformed or unknown peers', () => {
  for (const removed of [...currentCoreCapabilities, 'illustrious-outpaint']) {
    assert.equal(
      supportsInferenceEuler({
        ...eulerReady,
        capabilities: eulerReady.capabilities.filter((capability) => capability !== removed),
      }),
      false,
      removed,
    )
  }
  for (const peer of [
    null,
    { ...eulerReady, workerVersion: '0.11.0' },
    { ...eulerReady, workerVersion: '0.13.1' },
    { ...eulerReady, workerVersion: '0.15.0' },
    { ...eulerReady, protocolVersion: 1 },
    { ...eulerReady, protocolVersion: '2' },
    { ...eulerReady, runtimeProfile: 'cpu' },
    { ...eulerReady, capabilities: ['illustrious-euler'] },
    { ...eulerReady, capabilities: [...eulerReady.capabilities, 1] },
  ]) {
    assert.equal(supportsInferenceEuler(peer), false)
  }
})

test('qualified 0.11.0 retains every Illustrious capability with or without Anima advertisements', () => {
  for (const capabilities of [currentCoreCapabilities, currentReady.capabilities]) {
    for (const check of coreChecks) {
      assert.equal(check({ ...currentReady, capabilities }), true, check.name)
    }
  }
  assert.equal(supportsInferenceAnima(currentReady), true)
  assert.equal(
    supportsInferenceAnima({ ...currentReady, capabilities: currentCoreCapabilities }),
    false,
  )
})

test('Anima requires all five new capabilities while missing advertisements preserve Illustrious 0.11.0', () => {
  for (const removed of animaCapabilities) {
    const incomplete = {
      ...currentReady,
      capabilities: currentReady.capabilities.filter((capability) => capability !== removed),
    }
    assert.equal(supportsInferenceAnima(incomplete), false, removed)
    for (const check of coreChecks) {
      assert.equal(check(incomplete), true, `${removed}: ${check.name}`)
    }
  }
})

test('Anima cannot qualify a 0.11.0 peer missing any retained Illustrious capability', () => {
  for (const removed of currentCoreCapabilities) {
    const incomplete = {
      ...currentReady,
      capabilities: currentReady.capabilities.filter((capability) => capability !== removed),
    }
    assert.equal(isQualifiedInferenceWorkerReady(incomplete), false, removed)
    assert.equal(supportsInferenceAnima(incomplete), false, removed)
  }
})

test('every known older or unknown future peer remains incapable of Anima despite complete advertisement', () => {
  for (const workerVersion of [
    '0.2.0',
    '0.3.0',
    '0.4.0',
    '0.5.0',
    '0.6.0',
    '0.7.0',
    '0.8.0',
    '0.9.0',
    '0.10.0',
    '0.11.1',
    '0.12.0',
  ]) {
    const peer = { ...currentReady, workerVersion }
    assert.equal(supportsInferenceAnima(peer), false, workerVersion)
    assert.equal(
      isQualifiedInferenceWorkerReady(peer),
      workerVersion !== '0.11.1' && workerVersion !== '0.12.0',
      workerVersion,
    )
  }
})

test('wrong profile, protocol and malformed advertisements cannot grant Anima support', () => {
  for (const peer of [
    null,
    undefined,
    false,
    1,
    '0.11.0',
    [],
    { ...currentReady, runtimeProfile: 'cpu' },
    { ...currentReady, runtimeProfile: 'linux-amd' },
    { ...currentReady, protocolVersion: 1 },
    { ...currentReady, protocolVersion: '2' },
    { ...currentReady, capabilities: null },
    { ...currentReady, capabilities: [...currentReady.capabilities, 1] },
    { ...currentReady, capabilities: ['anima-txt2img'] },
  ]) {
    assert.equal(supportsInferenceAnima(peer), false)
  }
  assert.equal(
    supportsInferenceAnima({
      ...currentReady,
      capabilities: [...currentCoreCapabilities, 'anima-all', 'unqualified-anima'],
    }),
    false,
  )
  assert.equal(
    supportsInferenceAnima({
      ...currentReady,
      capabilities: [...currentReady.capabilities, 'unrecognized-extension'],
    }),
    true,
  )
})

const noiseReady = {
  ...eulerReady,
  capabilities: [...eulerReady.capabilities, 'illustrious-noise-profile'],
  workerVersion: '0.14.0',
}
test('noise profile requires exact 0.14 and complete native capabilities while retaining earlier methods', () => {
  assert.equal(supportsInferenceIllustriousNoiseProfile(noiseReady), true)
  for (const check of [
    ...coreChecks,
    supportsInferenceEuler,
    supportsInferenceAnima,
    supportsInferenceOutpaint,
    supportsInferenceAnimaOutpaint,
  ]) {
    assert.equal(check(noiseReady), true, check.name)
  }
  for (const removed of [
    ...currentCoreCapabilities,
    'illustrious-outpaint',
    'illustrious-euler',
    'illustrious-noise-profile',
  ]) {
    assert.equal(
      supportsInferenceIllustriousNoiseProfile({
        ...noiseReady,
        capabilities: noiseReady.capabilities.filter((value) => value !== removed),
      }),
      false,
      removed,
    )
  }
  for (const workerVersion of ['0.2.0', '0.12.0', '0.13.0', '0.14.1', '0.15.0']) {
    assert.equal(
      supportsInferenceIllustriousNoiseProfile({ ...noiseReady, workerVersion }),
      false,
      workerVersion,
    )
  }
  for (const peer of [
    null,
    { ...noiseReady, protocolVersion: 2 },
    { ...noiseReady, runtimeProfile: 'cpu' },
    { ...noiseReady, capabilities: [...noiseReady.capabilities, 1] },
  ]) {
    assert.equal(supportsInferenceIllustriousNoiseProfile(peer), false)
  }
})

const smartRegionalModes = ['inpaint', 'outpaint', 'txt2img', 'img2img'] as const
const animaSmartRegionalCommon = {
  ...noiseReady,
  capabilities: [
    ...noiseReady.capabilities,
    'smart-patch-execution',
    'smart-patch-seed-confirmation',
  ],
}

for (const mode of smartRegionalModes) {
  const loraCapability = `anima-smart-patch-regional-lora-${mode}-v1`
  const baseCapability = `anima-smart-patch-regional-${mode}-v1`

  test(`Anima global LoRA Smart regional ${mode} requires its exact grant independently of old and Canvas grants`, () => {
    const old = {
      ...animaSmartRegionalCommon,
      capabilities: [
        ...animaSmartRegionalCommon.capabilities,
        ...smartRegionalModes.map((item) => `anima-smart-patch-regional-${item}-v1`),
        'anima-regional-lora-v1',
        ...smartRegionalModes
          .filter((item) => item !== mode)
          .map((item) => `anima-smart-patch-regional-lora-${item}-v1`),
      ],
    }
    assert.equal(supportsInferenceAnimaSmartPatchRegionalMode(old, mode), true)
    assert.equal(supportsInferenceAnimaSmartPatchRegionalMode(old, mode, false), true)
    assert.equal(supportsInferenceAnimaSmartPatchRegionalLoraMode(old, mode), false)
    assert.equal(supportsInferenceAnimaSmartPatchRegionalMode(old, mode, true), false)
    assert.equal(supportsInferenceSmartPatchRegionalMode(old, 'anima', mode, null, true), false)

    const onlyLora = {
      ...animaSmartRegionalCommon,
      capabilities: [...animaSmartRegionalCommon.capabilities, loraCapability],
    }
    assert.equal(supportsInferenceAnimaSmartPatchRegionalLoraMode(onlyLora, mode), true)
    assert.equal(supportsInferenceAnimaSmartPatchRegionalMode(onlyLora, mode, true), true)
    assert.equal(supportsInferenceSmartPatchRegionalMode(onlyLora, 'anima', mode, null, true), true)
    assert.equal(supportsInferenceAnimaSmartPatchRegionalMode(onlyLora, mode), false)
    assert.equal(supportsInferenceSmartPatchRegionalMode(onlyLora, 'anima', mode), false)
    for (const other of smartRegionalModes.filter((item) => item !== mode)) {
      assert.equal(
        supportsInferenceAnimaSmartPatchRegionalMode(onlyLora, other, true),
        false,
        other,
      )
    }
    const both = { ...onlyLora, capabilities: [...onlyLora.capabilities, baseCapability] }
    assert.equal(supportsInferenceAnimaSmartPatchRegionalMode(both, mode, false), true)
    assert.equal(supportsInferenceAnimaSmartPatchRegionalMode(both, mode, true), true)
    // A valid Illustrious objective/mode grant must not grant the unsupported LoRA composition.
    const illustrious = {
      ...both,
      capabilities: [
        ...both.capabilities,
        `illustrious-smart-patch-regional-${mode}-v1`,
        `illustrious-smart-patch-regional-v-prediction-${mode}-v1`,
      ],
    }
    for (const objective of ['epsilon', 'v_prediction']) {
      assert.equal(
        supportsInferenceSmartPatchRegionalMode(illustrious, 'illustrious', mode, objective),
        true,
      )
      assert.equal(
        supportsInferenceSmartPatchRegionalMode(illustrious, 'illustrious', mode, objective, true),
        false,
      )
    }
  })

  test(`Anima global LoRA Smart regional ${mode} requires every common native prerequisite and exact qualified version`, () => {
    const ready = {
      ...animaSmartRegionalCommon,
      capabilities: [...animaSmartRegionalCommon.capabilities, loraCapability],
    }
    for (const removed of [
      ...currentCoreCapabilities,
      ...animaCapabilities,
      'illustrious-outpaint',
      'smart-patch-execution',
      'smart-patch-seed-confirmation',
      loraCapability,
    ]) {
      const peer = {
        ...ready,
        capabilities: ready.capabilities.filter((item) => item !== removed),
      }
      assert.equal(supportsInferenceAnimaSmartPatchRegionalLoraMode(peer, mode), false, removed)
      assert.equal(supportsInferenceAnimaSmartPatchRegionalMode(peer, mode, true), false, removed)
      assert.equal(
        supportsInferenceSmartPatchRegionalMode(peer, 'anima', mode, null, true),
        false,
        removed,
      )
    }
    for (const workerVersion of ['0.11.0', '0.12.0', '0.13.0', '0.14.1', '0.15.0']) {
      const peer = { ...ready, workerVersion }
      assert.equal(
        supportsInferenceAnimaSmartPatchRegionalLoraMode(peer, mode),
        false,
        workerVersion,
      )
      assert.equal(
        supportsInferenceAnimaSmartPatchRegionalMode(peer, mode, true),
        false,
        workerVersion,
      )
    }
    for (const peer of [
      null,
      undefined,
      [],
      { ...ready, protocolVersion: 1 },
      { ...ready, protocolVersion: '2' },
      { ...ready, runtimeProfile: 'cpu' },
      { ...ready, capabilities: null },
      { ...ready, capabilities: [...ready.capabilities, 1] },
    ]) {
      assert.equal(supportsInferenceAnimaSmartPatchRegionalLoraMode(peer, mode), false)
      assert.equal(supportsInferenceSmartPatchRegionalMode(peer, 'anima', mode, null, true), false)
    }
  })
}

test('Anima global LoRA Smart regional grants reject unsupported mode and family identities', () => {
  const ready = {
    ...animaSmartRegionalCommon,
    capabilities: [
      ...animaSmartRegionalCommon.capabilities,
      ...smartRegionalModes.map((mode) => `anima-smart-patch-regional-lora-${mode}-v1`),
      'anima-smart-patch-regional-lora-unsupported-v1',
    ],
  }
  for (const mode of [null, undefined, '', 'unsupported', 'txt2img ', 0, {}, ['inpaint']]) {
    assert.equal(supportsInferenceAnimaSmartPatchRegionalLoraMode(ready, mode), false)
    assert.equal(supportsInferenceAnimaSmartPatchRegionalMode(ready, mode, true), false)
    assert.equal(supportsInferenceSmartPatchRegionalMode(ready, 'anima', mode, null, true), false)
  }
  for (const family of [null, undefined, '', 'sdxl', 'anima-qwen35', 'Anima', 0]) {
    assert.equal(
      supportsInferenceSmartPatchRegionalMode(ready, family, 'inpaint', null, true),
      false,
    )
  }
})
