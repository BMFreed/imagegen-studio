/** Exact signed embedding authoring and comparison checks injected into the durable runner. */
import assert from 'node:assert/strict'

import {
  assertDynamicBatchConfiguration,
  assertDynamicBatchFrozen,
  expectedEmbeddingRef,
  normalizeDynamicExecutionInputs,
  normalizeDynamicNativeInputs,
  validateDynamicBatchFixture,
} from './illustrious-dynamic-embeddings-qualification.mjs'

function objective(fixture) {
  assert.ok(['epsilon', 'v_prediction'].includes(fixture.objective), 'Unknown dynamic objective.')
  return fixture.objective
}

function assertEdited(draft) {
  assert.deepEqual(draft.positivePrompt.embeddingRefs, [])
  assert.deepEqual(draft.negativePrompt.embeddingRefs, [])
  assert.equal(draft.positivePrompt.text.includes('<illustriousphoto>'), false)
  assert.equal(draft.negativePrompt.text.includes('<illustriousphoto>'), false)
  assert.deepEqual(draft.seed, { policy: 'fixed', value: 37 })
}

async function authorPrompts({
  window,
  expect,
  tab,
  project,
  reference,
  currentPlan,
  recordAuthoringFailure,
}) {
  const expectedRef = expectedEmbeddingRef(reference)
  const source = reference.embeddingTrained
  for (const polarity of ['positive', 'negative']) {
    const field = polarity === 'positive' ? 'positivePrompt' : 'negativePrompt'
    const control = window.getByRole('textbox', {
      name: polarity === 'positive' ? 'Positive prompt' : 'Negative prompt',
      exact: true,
    })
    const expectedText = currentPlan.sourcePrompts[polarity]
    const seedText = `${polarity === 'positive' ? 'a ceramic cup on a wooden table, studio photograph' : 'low quality'}, ${expectedRef.token}`
    let phase = 'fill seeded literal'
    try {
      await control.fill(seedText)
      await expect(control).toHaveText(seedText)
      await expect.poll(async () => (await tab(project)).generationDraft[field].text).toBe(seedText)
      phase = 'seal seeded text'
      await control.press('Tab')
      await expect(control).not.toBeFocused()
      await expect(control).toHaveText(seedText)
      await expect.poll(async () => (await tab(project)).generationDraft[field].text).toBe(seedText)
      phase = 'open owned completion'
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
      phase = 'choose exact owned version'
      await option.click()
      await expect(control).toBeFocused()
      await expect
        .poll(async () => (await tab(project)).generationDraft[field].embeddingRefs)
        .toEqual([expectedRef])
      phase = 'fill dynamic template with retained sidecar'
      await control.fill(expectedText)
      await expect(control).toHaveText(expectedText)
      await expect
        .poll(async () => (await tab(project)).generationDraft[field])
        .toEqual({
          text: expectedText,
          embeddingRefs: [expectedRef],
        })
      phase = 'seal authored template'
      await control.press('Tab')
      await expect(control).not.toBeFocused()
      await expect(control.locator('.cm-prompt-embedding')).toHaveCount(1)
      await expect(control.locator('.cm-prompt-embedding')).toHaveText(expectedRef.token)
      await expect(control.locator('.cm-prompt-embedding-warning')).toHaveCount(0)
      await expect
        .poll(async () => (await tab(project)).generationDraft[field])
        .toEqual({
          text: expectedText,
          embeddingRefs: [expectedRef],
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
      await recordAuthoringFailure({
        phase,
        polarity,
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

export const illustriousDynamicEmbeddingsProfile = Object.freeze({
  profile: 'illustrious-dynamic-embeddings',
  entrySource: 'scripts/qualify-installed-illustrious-dynamic-embeddings.mjs',
  adapterSource: 'scripts/illustrious-dynamic-embeddings-profile.mjs',
  oracleSource: 'scripts/illustrious-dynamic-embeddings-qualification.mjs',
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
    'embeddingTrained',
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
  authorPrompts,
  assertAuthored(draft, reference) {
    assert.equal(draft.sampling.scheduler, 'Normal')
    assert.equal(draft.vaePrecision, 'FP32')
    assert.equal(draft.vae.localModelId, reference.externalVaeNative.installed.resourceId)
    assert.equal(draft.vae.localVersionId, reference.externalVaeNative.installed.versionId)
    assert.equal(draft.vae.fileSha256, reference.externalVaeNative.sha256)
    assert.deepEqual(draft.positivePrompt.embeddingRefs, [expectedEmbeddingRef(reference)])
    assert.deepEqual(draft.negativePrompt.embeddingRefs, [expectedEmbeddingRef(reference)])
    assert.equal(draft.cfgRescale ?? 0, 0)
  },
  assertEdited,
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
  async assertComparison({ expect, dialog, generation, reference, currentDraft }) {
    assert.ok(generation?.expectedItem, 'Comparison must belong to its actual saved queue item.')
    assertEdited(currentDraft)
    const token = expectedEmbeddingRef(reference).token
    const rows = []
    for (const [polarity, key] of [
      ['positive', 'prompt.embeddings'],
      ['negative', 'negativePrompt.embeddings'],
    ]) {
      const status = generation.expectedItem.prompts[polarity].includes(token) ? 'Removed' : 'Same'
      const row = dialog.locator(`[data-setting="${key}"]`)
      await expect(row).toHaveCount(1)
      await expect(row).toHaveAttribute('data-status', status)
      rows.push({ key, status, observedStatus: await row.getAttribute('data-status') })
    }
    return { embeddingRows: rows }
  },
  boundary: {
    actual:
      'Built Electron renderer/preload/Main, real focused exact-version CodeMirror completion and Generate/Results/Add/Save/reopen/comparison, installed worker0.14 EPS/V, actual SQLite/PNG/.igs and native physical exit.',
    preconditions:
      'One canonical existing qualified runtime/catalog, nine resources/fourteen versions; exact source-SHA-bound NoobAI EPS/V checkpoints, Digital Art LoRA -0.5, native external VAE/FP32 and trained IllustriousPhoto embedding. Catalog defaults remain unchanged; no installation, download or new model/runtime copies.',
    limits:
      '256x256, three TXT evaluations, CFG5, EPS Euler a or V Euler, exact noise-profile defaults/leading spacing. Fixed0/per-iteration, one image per ordinary/negative-only/positive-only/both pair; restored maxPrompts2 retains the same full source templates and authored signed refs. Random, seed-policy matrix, wrap, maximum32-job inference, arbitrary embedding formats/counts/geometry, image quality and release qualification remain outside this claim.',
  },
})
