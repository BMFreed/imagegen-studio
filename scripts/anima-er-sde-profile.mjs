/** Narrow original-Anima ER-SDE TXT profile; the shared runner owns durable/UI/native behavior. */
import assert from 'node:assert/strict'

import { animaDynamicBatchProfile as resources } from './anima-dynamic-batch-profile.mjs'
import {
  assertAnimaErSdeConfiguration,
  assertAnimaErSdeFrozen,
  normalizeAnimaErSdeNativeInputs,
  validateAnimaErSdeFixture,
} from './anima-er-sde-qualification.mjs'

export const animaErSdeProfile = Object.freeze({
  profile: 'anima-er-sde',
  entrySource: 'scripts/qualify-installed-anima-er-sde.mjs',
  adapterSource: 'scripts/anima-er-sde-profile.mjs',
  oracleSource: 'scripts/anima-er-sde-qualification.mjs',
  sourceDependencies: [
    'scripts/anima-dynamic-batch-profile.mjs',
    'scripts/anima-dynamic-batch-qualification.mjs',
  ],
  validateFixture: validateAnimaErSdeFixture,
  assertFrozen: assertAnimaErSdeFrozen,
  assertConfiguration: assertAnimaErSdeConfiguration,
  normalizeNativeInputs: normalizeAnimaErSdeNativeInputs,
  normalizeExecutionInputs: normalizeAnimaErSdeNativeInputs,
  normalizeReferenceInputs: normalizeAnimaErSdeNativeInputs,
  expectedBaselineStage: () => 'baseline',
  baselineMetadataDifferences: () => [],
  inferenceSteps: (fixture) => fixture.steps,
  provisionalOnly: (fixture) => fixture.stage === 'control',
  modelKey: resources.modelKey,
  loraKey: resources.loraKey,
  originalSourceKeys: resources.originalSourceKeys,
  operation: resources.operation,
  cfgScale: resources.cfgScale,
  sampling: () => ({
    label: 'Anima method',
    draftKey: 'animaMethod',
    value: 'ER-SDE',
    code: 'er_sde',
    editedValue: 'Heun',
    editedCode: 'heun',
  }),
  assertAuthored(draft, reference, fixture, plan) {
    assert.equal(plan.steps, fixture.steps)
    assert.deepEqual(draft.seed, { policy: 'fixed', value: 0 })
    assert.deepEqual(draft.dynamicPrompt, { maxPrompts: 1, seedBehavior: 'per-iteration' })
    assert.deepEqual(draft.positivePrompt, { embeddingRefs: [], text: plan.sourcePrompts.positive })
    assert.deepEqual(draft.negativePrompt, { embeddingRefs: [], text: plan.sourcePrompts.negative })
    assert.equal(draft.sampling.steps, fixture.steps)
    assert.equal(draft.sampling.cfgScale, 4)
    assert.equal(draft.sampling.animaMethod, 'er_sde')
    assert.equal(draft.model.localModelId, reference.anima.installed.resourceId)
    assert.equal(draft.model.localVersionId, reference.anima.installed.versionId)
    assert.equal(draft.model.fileSha256, reference.anima.sha256)
    assert.equal(draft.loras.length, 1)
    const lora = draft.loras[0]
    assert.equal(lora.enabled, true)
    assert.equal(lora.weight, -0.5)
    assert.equal(lora.resource.localModelId, reference.animaLora.installed.resourceId)
    assert.equal(lora.resource.localVersionId, reference.animaLora.installed.versionId)
    assert.equal(lora.resource.fileSha256, reference.animaLora.sha256)
  },
  comparisonChanged: resources.comparisonChanged,
  comparisonSame: [...resources.comparisonSame, 'guidance.steps', 'guidance.cfg'],
  summaryClaims: ({ fixture, report }) => {
    const provisional = fixture.stage === 'control'
    if (provisional) {
      assert.equal(report.generations.length, 1)
      assert.ok(report.generations.every(({ accepted }) => accepted === false))
    }
    return {
      fiveStepErSdeInferenceClaim: !provisional && fixture.steps === 5,
      threeStepNeighborClaim: !provisional && fixture.steps === 3,
      order3CorrectionSensitivityClaim: false,
      provisionalMutationControl: provisional,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron Project Generate, installed worker0.14, one signed weighted Anima ER-SDE TXT256 job; healthy cases Add/Save/reopen and compare, source-mutation controls retain provisional output only.',
    preconditions:
      'One exact existing Linux/NVIDIA runtime/catalog with qualified Anima/Qwen3/VAE/Myth files. Fixed0, CFG4, Myth LoRA−0.5, red1.3/blurry0.7, exactly3 or5 steps. No installs, downloads, extra environments or model copies.',
    limits:
      'Three-step neighbor and five-step order3 path only. Sensitivity of the order3 correction needs separate aggregate5RED/3GREEN/restored evidence; an individual report does not establish it. No non-Euler IMG/OUT, arbitrary seeds, geometry, formats, image quality, Invoke parity or full MVP/release claim.',
  },
})
