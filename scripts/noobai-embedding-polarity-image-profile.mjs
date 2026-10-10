/** Exact signed embedding authoring on the existing durable image/acceptance runner. */
import assert from 'node:assert/strict'

import { illustriousDpmProfile } from './illustrious-dpm-profile.mjs'
import { noobaiVpredDpmProfile } from './noobai-vpred-dpm-profile.mjs'
import {
  assertNoobaiEmbeddingPolarityImageConfiguration,
  assertNoobaiEmbeddingPolarityImageFrozen,
  expectedNoobaiImageEmbeddingRef,
  literalNoobaiEmbeddingPolarityImagePlan,
  normalizeNoobaiEmbeddingPolarityImageNativeInputs,
  validateNoobaiEmbeddingPolarityImageFixture,
} from './noobai-embedding-polarity-image-qualification.mjs'

const planFor = (fixture) =>
  literalNoobaiEmbeddingPolarityImagePlan(
    fixture.stage,
    fixture.objective,
    fixture.mode,
    fixture.case,
  )
const modelKey = (fixture) => {
  assert.ok(['epsilon', 'v_prediction'].includes(fixture.objective))
  return fixture.objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'
}

function assertEdited(draft) {
  assert.deepEqual(draft.seed, { policy: 'fixed', value: 37 })
  for (const key of ['positivePrompt', 'negativePrompt']) {
    assert.deepEqual(draft[key].embeddingRefs, [])
    assert.equal(draft[key].text.includes('<illustriousphoto>'), false)
    assert.equal(draft[key].text.includes('igs_ti_private_'), false)
  }
}

async function authorPrompts(ctx) {
  const { window, expect, tab, project, reference, currentPlan, recordAuthoringFailure } = ctx
  const item = currentPlan.items[0]
  assert.equal(currentPlan.items.length, 1)
  for (const polarity of ['positive', 'negative']) {
    const field = polarity === 'positive' ? 'positivePrompt' : 'negativePrompt'
    const key = item[`${polarity}Embedding`]
    const expectedRef = key === null ? null : expectedNoobaiImageEmbeddingRef(reference, key)
    const source = key === null ? null : reference[key]
    const expectedText = currentPlan.sourcePrompts[polarity]
    const control = window.getByRole('textbox', {
      name: polarity === 'positive' ? 'Positive prompt' : 'Negative prompt',
      exact: true,
    })
    let phase = 'fill literal prompt'
    try {
      await control.fill(expectedText)
      await expect(control).toHaveText(expectedText)
      await expect
        .poll(async () => (await tab(project)).generationDraft[field].text)
        .toBe(expectedText)
      phase = 'seal text before exact version selection'
      await control.press('Tab')
      await expect(control).not.toBeFocused()
      await expect(control).toHaveText(expectedText)
      if (expectedRef !== null) {
        phase = 'open focused completion'
        await control.focus()
        await control.press('Control+End')
        await expect(control).toBeFocused()
        await control.press('Control+Space')
        await expect(control).toHaveAttribute('aria-controls', /^[A-Za-z0-9_-]+$/)
        const listId = await control.getAttribute('aria-controls')
        const list = window.locator(`[role="listbox"][id="${listId}"]`)
        await expect(list).toHaveCount(1)
        await expect(list).toBeVisible()
        const option = list
          .getByRole('option')
          .filter({ has: window.getByText(expectedRef.token, { exact: true }) })
          .filter({ hasText: `${source.name} · ${source.versionName}` })
        await expect(option).toHaveCount(1)
        await expect(option).toBeVisible()
        await expect(control).toBeFocused()
        assert.equal(await control.getAttribute('aria-controls'), listId)
        assert.equal(
          await option.evaluate((element) => element.closest('[role="listbox"]')?.id),
          listId,
        )
        phase = 'choose exact signed embedding version'
        await option.click()
        await expect(control).toBeFocused()
        await expect
          .poll(async () => (await tab(project)).generationDraft[field].embeddingRefs)
          .toEqual([expectedRef])
      }
      phase = 'verify and seal authored prompt'
      await expect(control).toHaveText(expectedText)
      await expect
        .poll(async () => (await tab(project)).generationDraft[field])
        .toEqual({
          text: expectedText,
          embeddingRefs: expectedRef === null ? [] : [expectedRef],
        })
      await control.press('Tab')
      await expect(control).not.toBeFocused()
      const decorations = control.locator('.cm-prompt-embedding')
      await expect(decorations).toHaveCount(expectedRef === null ? 0 : 1)
      if (expectedRef !== null) await expect(decorations).toHaveText(expectedRef.token)
      await expect(control.locator('.cm-prompt-embedding-warning')).toHaveCount(0)
      await expect
        .poll(async () => (await tab(project)).generationDraft[field])
        .toEqual({
          text: expectedText,
          embeddingRefs: expectedRef === null ? [] : [expectedRef],
        })
    } catch (error) {
      const [dom, main] = await Promise.allSettled([
        window.evaluate(() => ({
          editors: [...document.querySelectorAll('.cm-content[role="textbox"]')].map((element) => ({
            label: element.getAttribute('aria-label'),
            text: element.textContent,
            focused: document.activeElement === element,
            controls: element.getAttribute('aria-controls'),
          })),
          lists: [...document.querySelectorAll('[role="listbox"]')].map((element) => ({
            id: element.id,
            options: [...element.querySelectorAll('[role="option"]')].map(
              (option) => option.textContent,
            ),
          })),
        })),
        tab(project).then(({ generationDraft }) => ({
          positivePrompt: generationDraft.positivePrompt,
          negativePrompt: generationDraft.negativePrompt,
        })),
      ])
      if (recordAuthoringFailure)
        await recordAuthoringFailure({
          phase,
          polarity,
          key,
          projectId: project.id,
          expectedText,
          expectedRef,
          error: String(error),
          dom: dom.status === 'fulfilled' ? dom.value : { error: String(dom.reason) },
          main: main.status === 'fulfilled' ? main.value : { error: String(main.reason) },
        }).catch(() => {})
      throw error
    }
  }
}

export const noobaiEmbeddingPolarityImageProfile = Object.freeze({
  ...illustriousDpmProfile,
  profile: 'noobai-embedding-polarity-image',
  entrySource: 'scripts/qualify-installed-noobai-embedding-polarity-image.mjs',
  adapterSource: 'scripts/noobai-embedding-polarity-image-profile.mjs',
  oracleSource: 'scripts/noobai-embedding-polarity-image-qualification.mjs',
  sourceDependencies: [
    ...illustriousDpmProfile.sourceDependencies,
    'scripts/illustrious-dpm-profile.mjs',
    'scripts/illustrious-dpm-qualification.mjs',
    'scripts/noobai-vpred-dpm-profile.mjs',
  ],
  validateFixture: validateNoobaiEmbeddingPolarityImageFixture,
  assertFrozen: assertNoobaiEmbeddingPolarityImageFrozen,
  assertConfiguration: assertNoobaiEmbeddingPolarityImageConfiguration,
  normalizeNativeInputs: normalizeNoobaiEmbeddingPolarityImageNativeInputs,
  normalizeExecutionInputs: normalizeNoobaiEmbeddingPolarityImageNativeInputs,
  normalizeReferenceInputs: normalizeNoobaiEmbeddingPolarityImageNativeInputs,
  inferenceSteps: (fixture) => planFor(fixture).steps,
  observedSteps: (fixture) => planFor(fixture).observedSteps,
  modelKey,
  originalSourceKeys: (fixture) => [
    modelKey(fixture),
    'illustriousLora',
    'externalVaeNative',
    'embeddingTrained',
    'embeddingControl',
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
  authorComponents: noobaiVpredDpmProfile.authorComponents,
  authorPrompts,
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
    assert.equal(draft.loras.length, 1)
    assert.equal(draft.loras[0].enabled, true)
    assert.equal(draft.loras[0].weight, -0.5)
    const lora = reference.illustriousLora
    assert.equal(draft.loras[0].resource.localModelId, lora.installed.resourceId)
    assert.equal(draft.loras[0].resource.localVersionId, lora.installed.versionId)
    assert.equal(draft.loras[0].resource.fileSha256, lora.sha256)
    for (const polarity of ['positive', 'negative']) {
      const key = item[`${polarity}Embedding`]
      assert.deepEqual(draft[`${polarity}Prompt`], {
        text: plan.sourcePrompts[polarity],
        embeddingRefs: key === null ? [] : [expectedNoobaiImageEmbeddingRef(reference, key)],
      })
    }
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
    ...(fixture.mode === 'img2img' ? ['context.mode'] : []),
  ],
  async assertComparison({ expect, dialog, generation, reference, currentDraft }) {
    const item = generation.expectedItem
    assert.ok(['img2img', 'outpaint'].includes(item.mode))
    assertEdited(currentDraft)
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
    }
    const evidence = {}
    for (const [key, values] of Object.entries(checks)) {
      const status = values[0] === values[1] ? 'Same' : 'Changed'
      const row = dialog.locator(`[data-setting="${key}"]`)
      await expect(row).toHaveAttribute('data-status', status)
      await expect(row.locator('.comparison-values p')).toHaveText(values)
      evidence[key] = { status, values }
    }
    for (const polarity of ['positive', 'negative']) {
      const key = polarity === 'positive' ? 'prompt.embeddings' : 'negativePrompt.embeddings'
      const selected = item[`${polarity}Embedding`]
      const row = dialog.locator(`[data-setting="${key}"]`)
      const status = selected === null ? 'Same' : 'Removed'
      await expect(row).toHaveCount(1)
      await expect(row).toHaveAttribute('data-status', status)
      if (selected === null)
        await expect(row.locator('.comparison-values p')).toHaveText(['None', 'None'])
      else {
        const expected = expectedNoobaiImageEmbeddingRef(reference, selected)
        const before = row.locator('.comparison-values p').nth(0)
        await expect(before).toContainText(expected.token)
        await expect(before).toContainText(expected.resource.versionName)
        await expect(before).toContainText(expected.resource.fileSha256)
        await expect(row.locator('.comparison-values p').nth(1)).toHaveText('None')
      }
      evidence[key] = { status, selected, observedStatus: await row.getAttribute('data-status') }
    }
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
      installedEmbeddingImageInferenceClaim: !provisional,
      acceptedSavedReopenedClaim: !provisional,
      provisionalMutationControl: provisional,
      directionalSensitivityClaim: false,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Exact Model Manager policy and focused CodeMirror signed-version completion -> image Prepare/frozen native job -> installed worker image/OUT -> temporary candidate -> explicit Add/Save/readback/reopen/owning comparison; controls remain provisional.',
    preconditions:
      'One existing runtime/catalog; exact EPS/V and trained/artificial-zero dual-CLIP sources, one pinned common opaque256 PNG per objective, signed Digital Art−0.5/native external VAE FP32. Normal N3/CFG5/Fixed0/strength.5; OUT x64 plus exact LaMa/policy.',
    limits:
      'One literal per polarity and crossed T/Z,Z/T only, with an EPS IMG ordinary neighbor. Direction requires independent native tensors/handoff and sign-swap matching opposite healthy pixels, not inequality alone. No arbitrary syntax/formats/geometry, subjective quality, Invoke pixel parity, full MVP or release claim.',
  },
})
