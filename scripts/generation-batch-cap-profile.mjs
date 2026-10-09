/** Finite native cap/prefix authoring and refusal checks injected into the durable runner. */
import assert from 'node:assert/strict'

import {
  assertBatchCapConfiguration,
  assertBatchCapFrozen,
  normalizeBatchCapExecutionInputs,
  normalizeBatchCapNativeInputs,
  validateBatchCapFixture,
} from './generation-batch-cap-qualification.mjs'
import { generationSeedBoundaryProfile as familyChoices } from './generation-seed-boundary-profile.mjs'

async function assertPreview({
  expect,
  dialog,
  plan,
  purpose,
  maxPrompts,
  seedBehavior,
  observationIndex,
  screenshot,
}) {
  if (purpose === 'edited') return undefined
  assert.ok(['authored', 'refusal'].includes(purpose))
  const expectedItems = plan.items.filter(({ iteration }) => iteration === 0).slice(0, maxPrompts)
  const pairs = dialog.getByRole('region', { name: 'Expanded prompt pairs', exact: true })
  const articles = pairs.locator('article')
  await expect(articles).toHaveCount(expectedItems.length)
  const observed = []
  for (const [index, expected] of expectedItems.entries()) {
    const row = articles.nth(index)
    await expect(row.locator('.pair-number')).toHaveText(String(index + 1))
    await expect(row.locator('.pair-positive')).toHaveText(expected.prompts.positive)
    await expect(row.locator('.pair-negative')).toHaveText(expected.prompts.negative)
    observed.push({
      promptPairIndex: index,
      positive: await row.locator('.pair-positive').innerText(),
      negative: await row.locator('.pair-negative').innerText(),
    })
  }
  const truncated = purpose === 'refusal' || plan.truncated
  const feedback = dialog.getByText('Preview truncated at the configured maximum', { exact: true })
  await expect(feedback).toHaveCount(truncated ? 1 : 0)
  if (truncated)
    await expect(dialog).toContainText(
      `Showing the first ${maxPrompts} prompt pairs. Later alternatives are omitted.`,
    )
  const summary = dialog.locator('.preview-summary')
  await expect(summary).toContainText(
    `${expectedItems.length} concrete prompt ${expectedItems.length === 1 ? 'pair' : 'pairs'}`,
  )
  await expect(summary).toContainText(`${expectedItems.length} jobs · 1 iteration · limit 32`)
  return {
    oneIteration: true,
    seedBehavior,
    observedPairs: observed,
    truncated,
    observedSummary: await summary.innerText(),
    screenshot: await screenshot(`dynamic-preview-${purpose}-${observationIndex}.png`, dialog),
  }
}

async function assertQueuedNotice({ window, expect, plan }) {
  const message = 'Max prompts limited the concrete prompts in this batch.'
  const notice = window.getByText(message, { exact: true })
  await expect(notice).toHaveCount(plan.truncated ? 1 : 0)
  if (plan.truncated) await expect(notice).toBeVisible()
  return {
    truncated: plan.truncated,
    observedNotice: plan.truncated ? await notice.innerText() : null,
  }
}

/** One real confirmed 33-job UI refusal preserves all32 genuine temporary results before Add. */
async function afterCompletions({
  window,
  expect,
  api,
  tab,
  project,
  fixture,
  plan,
  report,
  setInput,
  setDynamic,
  save,
  captureAdmissionEffects,
  assertAdmissionEffectsUnchanged,
  runtimeUsers,
  screenshot,
  checkpoint,
}) {
  if (fixture.stage !== 'boundary') return undefined
  const refusalPlan = { ...plan, maxPrompts: 1, iterations: 33 }
  for (const [label, text] of [
    ['Positive prompt', plan.sourcePrompts.positive],
    ['Negative prompt', plan.sourcePrompts.negative],
  ])
    await window.getByRole('textbox', { name: label, exact: true }).fill(text)
  await setDynamic(project, 1, plan.seedBehavior, { purpose: 'refusal', currentPlan: refusalPlan })
  await setInput('Images per click', 33)
  await setInput('Generation seed', 0)
  await expect
    .poll(async () => (await tab(project)).generationDraft.dynamicPrompt)
    .toEqual({ maxPrompts: 1, seedBehavior: plan.seedBehavior })
  await save(project)
  await expect.poll(runtimeUsers).toEqual([])
  const before = await captureAdmissionEffects(project, 'before-ui-refusal')
  const evidence = {
    kind: 'confirmed-ui-generate-refusal',
    uiRequest: {
      iterations: 33,
      maxPrompts: 1,
      seedBehavior: plan.seedBehavior,
      generationDraft: structuredClone(before.effects.tab.generationDraft),
    },
    before: before.proof,
    reviewedCandidateIds: before.effects.results.candidates.map(({ candidateId }) => candidateId),
    ui: {},
    unchanged: false,
  }
  report.refusal33 = evidence
  await checkpoint()
  assert.equal(before.proof.projectCandidateCount, 32)
  assert.equal(before.proof.layerCount, 0)
  assert.deepEqual(evidence.uiRequest.generationDraft.seed, { policy: 'fixed', value: 0 })
  const generate = window.getByRole('button', { name: 'Generate', exact: true })
  await expect(generate).toBeEnabled()
  await generate.click()
  const dialog = window.getByRole('dialog', {
    name: 'Replace temporary generation results',
    exact: true,
  })
  await expect(dialog).toBeVisible()
  evidence.ui.confirmationText = await dialog.innerText()
  evidence.ui.reviewCount = Number(
    /([0-9]+)\s+temporary\s+results?\s+will be/.exec(evidence.ui.confirmationText)?.[1],
  )
  await checkpoint()
  assert.equal(evidence.ui.reviewCount, 32)
  await dialog.getByRole('button', { name: 'Discard and Generate', exact: true }).click()
  const error = dialog.locator('.dialog-error')
  await expect(error).toBeVisible()
  evidence.ui.observedError = await error.innerText()
  evidence.ui.mainStateObservation = {
    method: 'projects.getGenerationState',
    provenance: 'typed state observation after the real UI request, not its Generate response',
    value: await api('getGenerationState', project.id),
  }
  evidence.ui.screenshot = await screenshot('refusal33-after-confirmation.png', dialog)
  await checkpoint()
  const state = evidence.ui.mainStateObservation.value
  assert.equal(state.phase, 'idle')
  assert.equal(state.error?.code, 'BATCH_TOO_LARGE')
  assert.equal(state.runningJobId, null)
  assert.deepEqual(state.jobs, [])
  assert.ok(
    evidence.ui.observedError.includes(
      'The planned jobs exceed the supplied batch admission limit.',
    ),
  )
  await expect.poll(runtimeUsers).toEqual([])
  const after = await captureAdmissionEffects(project, 'after-ui-refusal')
  evidence.after = after.proof
  await checkpoint()
  assertAdmissionEffectsUnchanged(before, after)
  evidence.unchanged = true
  await checkpoint()
  await dialog.getByRole('button', { name: 'Keep results', exact: true }).click()
  await expect(dialog).toBeHidden()
  return evidence
}

export const generationBatchCapProfile = Object.freeze({
  profile: 'generation-batch-cap',
  entrySource: 'scripts/qualify-installed-generation-batch-cap.mjs',
  adapterSource: 'scripts/generation-batch-cap-profile.mjs',
  oracleSource: 'scripts/generation-batch-cap-qualification.mjs',
  sourceDependencies: [
    'scripts/generation-seed-boundary-profile.mjs',
    'scripts/generation-seed-boundary-qualification.mjs',
    ...familyChoices.sourceDependencies,
  ],
  validateFixture: validateBatchCapFixture,
  assertFrozen: assertBatchCapFrozen,
  assertConfiguration: assertBatchCapConfiguration,
  normalizeNativeInputs: normalizeBatchCapNativeInputs,
  normalizeExecutionInputs: normalizeBatchCapExecutionInputs,
  normalizeReferenceInputs: (frozen, { fixture, plan }) =>
    fixture.stage === 'prefix'
      ? normalizeBatchCapExecutionInputs(frozen, plan)
      : normalizeBatchCapNativeInputs(frozen),
  expectedBaselineStage: () => 'boundary',
  baselineMetadataDifferences: (fixture) => (fixture.stage === 'prefix' ? ['seedBehavior'] : []),
  completionTimeoutMs: () => 1_600_000,
  modelKey: familyChoices.modelKey,
  loraKey: familyChoices.loraKey,
  originalSourceKeys: familyChoices.originalSourceKeys,
  operation: familyChoices.operation,
  cfgScale: familyChoices.cfgScale,
  sampling: familyChoices.sampling,
  authorComponents: familyChoices.authorComponents,
  authorSeed: familyChoices.authorSeed,
  assertAuthored: familyChoices.assertAuthored,
  comparisonChanged: familyChoices.comparisonChanged,
  comparisonSame: familyChoices.comparisonSame,
  assertComparison: familyChoices.assertComparison,
  assertPreview,
  assertQueuedNotice,
  afterCompletions,
  summaryClaims: ({ fixture, report }) => {
    if (fixture.stage === 'boundary') assert.equal(report.refusal33?.unchanged, true)
    return {
      max32InferenceClaim: fixture.stage === 'boundary',
      boundedTruncationClaim: fixture.stage === 'prefix',
      preservedResultsOn33RefusalClaim: fixture.stage === 'boundary',
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron Project preview/Generate, installed worker0.14,32 native jobs or6 selected-prefix jobs, real confirmed33-job UI refusal retaining old32 candidates, SQLite/PNG/Add/Save/reopen and every saved layer comparison.',
    preconditions:
      'One exact existing runtime/catalog; qualified Anima or Illustrious-family EPS/V files, components and signed LoRA. No install, downloads, new environments, model copies or product cap changes.',
    limits:
      '256x256/three TXT evaluations. Full known four weighted pairs: boundary4x8 Fixed0/per-iteration32; prefix3x2 Fixed0/per-prompt6 compared with same-input boundary records. Refusal uses one selected pairx33 after completed32, before Add. This does not qualify64 distinct authored pairs, arbitrary truncation/seed matrices, image quality or a release.',
  },
})
