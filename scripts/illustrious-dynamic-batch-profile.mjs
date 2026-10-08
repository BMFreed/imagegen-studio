/** Illustrious-family EPS/V authoring and literal assertions injected into the durable runner. */
import assert from 'node:assert/strict'

import {
  assertDynamicBatchConfiguration,
  assertDynamicBatchFrozen,
  normalizeDynamicExecutionInputs,
  normalizeDynamicNativeInputs,
  validateDynamicBatchFixture,
} from './illustrious-dynamic-batch-qualification.mjs'

function objective(fixture) {
  assert.ok(['epsilon', 'v_prediction'].includes(fixture.objective), 'Unknown dynamic objective.')
  return fixture.objective
}

export const illustriousDynamicBatchProfile = Object.freeze({
  profile: 'illustrious-dynamic-batch',
  entrySource: 'scripts/qualify-installed-illustrious-dynamic-batch.mjs',
  adapterSource: 'scripts/illustrious-dynamic-batch-profile.mjs',
  oracleSource: 'scripts/illustrious-dynamic-batch-qualification.mjs',
  validateFixture: validateDynamicBatchFixture,
  assertFrozen: assertDynamicBatchFrozen,
  assertConfiguration: assertDynamicBatchConfiguration,
  normalizeNativeInputs: normalizeDynamicNativeInputs,
  normalizeExecutionInputs: normalizeDynamicExecutionInputs,
  modelKey: (fixture) => (objective(fixture) === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'),
  loraKey: 'illustriousLora',
  originalSourceKeys: (fixture) => [
    objective(fixture) === 'epsilon' ? 'illustriousEpsilon' : 'illustrious',
    'illustriousLora',
    'externalVaeNative',
  ],
  operation: 'illustrious-txt2img',
  cfgScale: 5,
  sampling: (fixture) => ({
    label: 'Sampler',
    draftKey: 'sampler',
    value: objective(fixture) === 'epsilon' ? 'Euler a' : 'Euler',
    code: objective(fixture) === 'epsilon' ? 'Euler a' : 'Euler',
    editedValue: objective(fixture) === 'epsilon' ? 'Euler' : 'Euler a',
    editedCode: objective(fixture) === 'epsilon' ? 'Euler' : 'Euler a',
    scheduler: 'Normal',
  }),
  async authorComponents({ window, expect, tab, project, reference, setSelect }) {
    const input = window.locator('input[aria-label="VAE"]')
    if (!(await input.isVisible()))
      await window.getByText('Advanced Options', { exact: true }).click()
    await expect(input).toBeEnabled({ timeout: 180_000 })
    await input.scrollIntoViewIfNeeded()
    const source = reference.externalVaeNative
    if ((await tab(project)).generationDraft.vae?.localVersionId !== source.installed.versionId) {
      await input.click()
      const option = window
        .locator('.model-option:visible')
        .filter({ hasText: source.name })
        .filter({ hasText: `· ${source.versionName} ·` })
      await expect(option).toHaveCount(1)
      await option.click()
    }
    await expect
      .poll(async () => (await tab(project)).generationDraft.vae?.localVersionId)
      .toBe(source.installed.versionId)
    if ((await tab(project)).generationDraft.vaePrecision !== 'FP32')
      await setSelect('VAE precision', 'FP32')
    await expect.poll(async () => (await tab(project)).generationDraft.vaePrecision).toBe('FP32')
  },
  assertAuthored(draft, reference) {
    assert.equal(draft.sampling.scheduler, 'Normal')
    assert.equal(draft.vaePrecision, 'FP32')
    assert.equal(draft.vae.localModelId, reference.externalVaeNative.installed.resourceId)
    assert.equal(draft.vae.localVersionId, reference.externalVaeNative.installed.versionId)
    assert.equal(draft.vae.fileSha256, reference.externalVaeNative.sha256)
    assert.equal(draft.positivePrompt.embeddingRefs.length, 0)
    assert.equal(draft.negativePrompt.embeddingRefs.length, 0)
    assert.equal(draft.cfgRescale ?? 0, 0)
  },
  comparisonChanged: [
    'sampling.invokeScheduler',
    'sampling.sampler',
    'seed.actual',
    'prompt.text',
    'negativePrompt.text',
    'loras.stack',
  ],
  comparisonSame: [
    'model.resource',
    'model.predictionType',
    'sampling.scheduler',
    'noiseProfile.baseSchedule',
    'noiseProfile.rescaleBetasZeroSnr',
    'noiseProfile.timestepSpacing',
    'vae.resource',
    'vaePrecision.value',
  ],
  boundary: {
    actual:
      'Built Electron renderer/preload/Main, public Generate/Results/Add/Save/recovery, installed worker0.14 Illustrious-family EPS/V, actual SQLite/PNG/.igs and native physical exit.',
    preconditions:
      'One canonical existing qualified runtime/catalog, nine resources/fourteen versions; exact source-SHA-bound NoobAI EPS/V checkpoints, signed Digital Art LoRA and native external VAE. No installation, download or new model/runtime copies.',
    limits:
      '256x256, three TXT evaluations, CFG5, EPS Euler a or V Euler, exact noise-profile defaults/leading spacing, external native VAE/FP32 and signed Digital Art LoRA -0.5; finite Fixed/per-iteration, crash and Reuse/per-prompt cases only. Random, uint32 wrap, maximum32-job inference, image quality, broad compatibility and release qualification are outside this claim.',
  },
})
