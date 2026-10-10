/** Exact configured/effective stack authoring on the durable common-source image runner. */
import assert from 'node:assert/strict'

import { illustriousDpmProfile } from './illustrious-dpm-profile.mjs'
import { noobaiVpredDpmProfile } from './noobai-vpred-dpm-profile.mjs'
import { assertNoobaiLoraStackDescription } from './noobai-lora-stack-qualification.mjs'
import {
  assertNoobaiLoraStackImageConfiguration,
  assertNoobaiLoraStackImageFrozen,
  expectedNoobaiImageLoraStack,
  literalNoobaiLoraStackImagePlan,
  normalizeNoobaiLoraStackImageNativeInputs,
  validateNoobaiLoraStackImageFixture,
} from './noobai-lora-stack-image-qualification.mjs'

const planFor = (fixture) =>
  literalNoobaiLoraStackImagePlan(fixture.stage, fixture.objective, fixture.mode, fixture.case)
const modelKey = (fixture) => {
  assert.ok(['epsilon', 'v_prediction'].includes(fixture.objective))
  return fixture.objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'
}

function assertEdited(draft, reference) {
  assert.deepEqual(draft.seed, { policy: 'fixed', value: 37 })
  for (const key of ['positivePrompt', 'negativePrompt']) {
    assert.deepEqual(draft[key].embeddingRefs, [])
    assert.equal(draft[key].text.includes('igs_ti_private_'), false)
  }
  const first = draft.loras.find(
    ({ resource }) => resource.fileSha256 === reference.illustriousLora.sha256,
  )
  assert.ok(first)
  assert.equal(first.weight, -0.25)
  assert.equal(first.enabled, true)
  assert.equal(draft.loras.length, 2)
  const second = draft.loras.find(
    ({ resource }) => resource.fileSha256 === reference.illustriousLoraSecond.sha256,
  )
  assert.ok(second)
  assert.ok([0, 0.75].includes(second.weight))
  assert.equal(typeof second.enabled, 'boolean')
}

async function authorComponents(ctx) {
  await noobaiVpredDpmProfile.authorComponents(ctx)
  const { window, expect, tab, project, reference, fixture } = ctx
  const first = reference.illustriousLora
  const second = reference.illustriousLoraSecond
  const stack = expectedNoobaiImageLoraStack(reference, fixture.case)
  async function setWeight(source, weight) {
    const input = window.locator(`input[aria-label="${source.name} weight"]`)
    await input.fill(String(weight))
    await input.press('Enter')
    await expect
      .poll(
        async () =>
          (await tab(project)).generationDraft.loras.find(
            ({ resource }) => resource.localVersionId === source.installed.versionId,
          )?.weight,
      )
      .toBe(weight)
  }
  await window.locator('[aria-label="Add LoRA"]').click()
  await window.getByText(second.name, { exact: true }).last().click()
  await setWeight(second, fixture.case === 'b-zero' ? 0 : 0.75)
  if (fixture.case === 'b-disabled') {
    const control = window.getByRole('switch', { name: `Enable ${second.name}`, exact: true })
    await expect(control).toHaveAttribute('aria-checked', 'true')
    await control.click()
  }
  if (fixture.case === 'ba') {
    // Product has no reorder control; explicit remove/add is the actual authoring operation.
    await window.getByRole('button', { name: `Remove ${first.name}`, exact: true }).click()
    await window.locator('[aria-label="Add LoRA"]').click()
    await window.getByText(first.name, { exact: true }).last().click()
    await setWeight(first, -0.5)
  }
  await expect.poll(async () => (await tab(project)).generationDraft.loras).toEqual(stack)
}

export const noobaiLoraStackImageProfile = Object.freeze({
  ...illustriousDpmProfile,
  profile: 'noobai-lora-stack-image',
  entrySource: 'scripts/qualify-installed-noobai-lora-stack-image.mjs',
  adapterSource: 'scripts/noobai-lora-stack-image-profile.mjs',
  oracleSource: 'scripts/noobai-lora-stack-image-qualification.mjs',
  sourceDependencies: [
    ...illustriousDpmProfile.sourceDependencies,
    'scripts/illustrious-dpm-profile.mjs',
    'scripts/illustrious-dpm-qualification.mjs',
    'scripts/noobai-vpred-dpm-profile.mjs',
  ],
  validateFixture: validateNoobaiLoraStackImageFixture,
  assertFrozen: assertNoobaiLoraStackImageFrozen,
  assertConfiguration: assertNoobaiLoraStackImageConfiguration,
  normalizeNativeInputs: normalizeNoobaiLoraStackImageNativeInputs,
  normalizeExecutionInputs: normalizeNoobaiLoraStackImageNativeInputs,
  normalizeReferenceInputs: normalizeNoobaiLoraStackImageNativeInputs,
  inferenceSteps: (fixture) => planFor(fixture).steps,
  observedSteps: (fixture) => planFor(fixture).observedSteps,
  authoredFirstLoraWeight: (fixture) => (fixture.case === 'ba' ? 0.75 : -0.5),
  modelKey,
  originalSourceKeys: (fixture) => [
    modelKey(fixture),
    'illustriousLora',
    'illustriousLoraSecond',
    'externalVaeNative',
  ],
  cfgScale: 5,
  sampling(fixture) {
    const sampler = fixture.objective === 'epsilon' ? 'Euler a' : 'Euler'
    return {
      label: 'Sampler',
      draftKey: 'sampler',
      value: sampler,
      code: sampler,
      editedValue: sampler,
      editedCode: sampler,
      scheduler: 'Normal',
    }
  },
  authorComponents,
  assertEdited,
  assertAuthored(draft, reference, fixture, plan) {
    assert.deepEqual(plan, planFor(fixture))
    const item = plan.items[0]
    const checkpoint = reference[modelKey(fixture)]
    assert.deepEqual(draft.seed, { policy: 'fixed', value: 0 })
    assert.deepEqual(draft.dynamicPrompt, { maxPrompts: 1, seedBehavior: 'per-iteration' })
    assert.equal(draft.sampling.steps, 3)
    assert.equal(draft.sampling.cfgScale, 5)
    assert.equal(draft.sampling.sampler, item.sampler)
    assert.equal(draft.sampling.scheduler, 'Normal')
    assert.equal(draft.model.localModelId, checkpoint.installed.resourceId)
    assert.equal(draft.model.localVersionId, checkpoint.installed.versionId)
    assert.equal(draft.model.fileSha256, checkpoint.sha256)
    assert.equal(draft.model.predictionType, fixture.objective)
    assert.equal(draft.vaePrecision, 'FP32')
    const vae = reference.externalVaeNative
    assert.equal(draft.vae.localModelId, vae.installed.resourceId)
    assert.equal(draft.vae.localVersionId, vae.installed.versionId)
    assert.equal(draft.vae.fileSha256, vae.sha256)
    assert.equal(draft.cfgRescale ?? 0, 0)
    assert.deepEqual(draft.loras, expectedNoobaiImageLoraStack(reference, fixture.case))
    for (const polarity of ['positive', 'negative'])
      assert.deepEqual(draft[`${polarity}Prompt`], {
        text: plan.sourcePrompts[polarity],
        embeddingRefs: [],
      })
  },
  comparisonChanged: (fixture) => [
    'seed.actual',
    'prompt.text',
    'negativePrompt.text',
    'loras.stack',
    ...(fixture.mode === 'outpaint' ? ['context.mode'] : []),
  ],
  comparisonSame: (fixture) => [
    'model.resource',
    'model.predictionType',
    'sampling.scheduler',
    'noiseProfile.baseSchedule',
    'noiseProfile.rescaleBetasZeroSnr',
    'noiseProfile.timestepSpacing',
    'vae.resource',
    'vaePrecision.value',
    'guidance.steps',
    'guidance.cfg',
    'denoisingStrength.value',
    'sampling.sampler',
    'sampling.invokeScheduler',
    'prompt.embeddings',
    'negativePrompt.embeddings',
    ...(fixture.mode === 'img2img' ? ['context.mode'] : []),
  ],
  async assertComparison({ expect, dialog, generation, reference, currentDraft }) {
    const item = generation.expectedItem
    assertEdited(currentDraft, reference)
    const before = expectedNoobaiImageLoraStack(reference, item.case)
    const after = structuredClone(before)
    after.find(({ resource }) => resource.fileSha256 === reference.illustriousLora.sha256).weight =
      -0.25
    assert.deepEqual(currentDraft.loras, after, 'Only A weight is edited in the live stack.')
    assert.equal(currentDraft.sampling.sampler, item.sampler)
    assert.equal(currentDraft.sampling.scheduler, 'Normal')
    assert.equal(currentDraft.sampling.denoisingStrength, 0.5)
    const checks = {
      'sampling.invokeScheduler': [item.invokeScheduler, item.invokeScheduler],
      'sampling.sampler': [item.sampler, item.sampler],
      'sampling.scheduler': ['Normal', 'Normal'],
      'context.mode': [item.mode, 'img2img'],
      'guidance.steps': ['3', '3'],
      'guidance.cfg': ['5', '5'],
      'denoisingStrength.value': ['0.5', '0.5'],
      'seed.actual': ['0', '37'],
      'prompt.embeddings': ['None', 'None'],
      'negativePrompt.embeddings': ['None', 'None'],
    }
    const evidence = {}
    for (const [key, values] of Object.entries(checks)) {
      const status = values[0] === values[1] ? 'Same' : 'Changed'
      const row = dialog.locator(`[data-setting="${key}"]`)
      await expect(row).toHaveAttribute('data-status', status)
      await expect(row.locator('.comparison-values p')).toHaveText(values)
      evidence[key] = { status, values }
    }
    const stackRow = dialog.locator('[data-setting="loras.stack"]')
    await expect(stackRow).toHaveAttribute('data-status', 'Changed')
    const values = await stackRow.locator('.comparison-values p').allTextContents()
    assert.equal(values.length, 2)
    assertNoobaiLoraStackDescription(values[0], before)
    assertNoobaiLoraStackDescription(values[1], after)
    evidence['loras.stack'] = { status: 'Changed', values }
    return evidence
  },
  summaryClaims({ fixture, report }) {
    planFor(fixture)
    const provisional = fixture.stage === 'control'
    assert.equal(report.generations.length, 1)
    assert.equal(report.generations[0].accepted, !provisional)
    return {
      objective: fixture.objective,
      mode: fixture.mode,
      case: fixture.case,
      installedMultipleLoraImageInferenceClaim: !provisional,
      acceptedSavedReopenedClaim: !provisional,
      provisionalMutationControl: provisional,
      sourceBoundWeightSensitivityClaim: false,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Exact Model Manager policy and actual two-LoRA UI/remove-add order -> image Prepare/frozen native job -> installed image/OUT -> candidate -> explicit Add/Save/readback/reopen/owning comparison; controls remain provisional.',
    preconditions:
      'One existing runtime/catalog; exact EPS/V sources, Digital Art A−0.5/Lineless B+0.75 or zero/disabled, one common opaque256 PNG per objective, external VAE FP32. Normal N3/CFG5/Fixed0/strength.5; OUT x64 and exact LaMa/policy.',
    limits:
      'Only AB/BA/B-zero/B-disabled with ordinary unweighted prompts. Native source/weight proof is separate; AB/BA need not differ in pixels. No arbitrary formats/stacks/geometry, subjective quality, Invoke pixel parity, full MVP or release claim.',
  },
})
