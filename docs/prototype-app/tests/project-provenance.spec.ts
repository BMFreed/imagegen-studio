import { expect, test } from '@playwright/test'
import { reactive } from 'vue'

import {
  commitProjectMutation,
  redoProject,
  undoProject,
} from '../src/prototypes/project/project-history'
import {
  currentCanvasPayload,
  freezeGeneration,
  presetIntentFromResult,
  resultProvenance,
} from '../src/prototypes/project/project-provenance'
import { createProjectScenario } from '../src/prototypes/project/project.mock'
import {
  acceptStagingCandidates,
  applyPresetSections,
  discardStagingSession,
} from '../src/prototypes/project/project.utils'

test('accepted metadata comes from the frozen job and survives queue cleanup and undo/redo', () => {
  const session = reactive(createProjectScenario('staging'))
  const originalModel = session.document.generationDraft.payload.model!.name
  const job = session.queueItems[0]!
  job.frozenGeneration = freezeGeneration(
    session,
    job.id,
    'frozen positive',
    'frozen negative',
    123,
  )
  session.document.generationDraft.payload.prompt!.text = 'later prompt'
  session.document.generationDraft.payload.model!.name = 'later model'
  acceptStagingCandidates(session)
  const layer = session.document.layers.find((l) => l.id === 'accepted-candidate-1')!
  expect(resultProvenance(layer)?.payload.prompt?.text).toBe('frozen positive')
  expect(resultProvenance(layer)?.payload.model?.name).toBe(originalModel)
  expect(resultProvenance(layer)?.payload.seed?.value).toBe(123)
  session.queueItems = []
  undoProject(session)
  expect(session.document.layers.some((l) => l.id === layer.id)).toBe(false)
  redoProject(session)
  expect(
    resultProvenance(session.document.layers.find((l) => l.id === layer.id)!)?.payload.seed?.value,
  ).toBe(123)
})

test('discard has no accepted-result or history side effect', () => {
  const session = createProjectScenario('staging')
  const before = JSON.stringify(session.document)
  discardStagingSession(session)
  expect(JSON.stringify(session.document)).toBe(before)
  expect(session.history.past).toHaveLength(0)
  expect(session.staging).toBeUndefined()
})

test('Smart Patch settings stay local, comparison uses Canvas, and presets exclude patch geometry', () => {
  const session = reactive(createProjectScenario('smart-patch'))
  const patch = session.document.layers.find((l) => l.kind === 'smart-patch')!
  if (patch.kind !== 'smart-patch') {
    throw new Error('Fixture requires patch')
  }
  const before = JSON.stringify(resultProvenance(patch))
  applyPresetSections(
    session,
    { prompt: { embeddingRefs: [], text: 'patch only' }, size: { height: 128, width: 128 } },
    ['prompt', 'size'],
  )
  expect(patch.generationDraft.payload.prompt?.text).toBe('patch only')
  expect(currentCanvasPayload(session).prompt?.text).not.toBe('patch only')
  expect(session.document.canvas.width).toBe(888)
  expect(patch.status).toBe('outdated')
  expect(JSON.stringify(resultProvenance(patch))).toBe(before)
  const intent = presetIntentFromResult(patch)!
  expect(intent.kind).toBe('project')
  if (intent.kind !== 'project') {
    throw new Error('Expected project intent')
  }
  expect(intent.definition.payload.size).toBeUndefined()
  expect(intent.definition.payload.seed).toBeUndefined()
  expect(intent.definition.payload.prompt?.text).toBe('hand repair, variation 2')
  commitProjectMutation(session, 'Switch variant', () => {
    patch.activeVariantId = 'patch-v1'
  })
  expect(resultProvenance(patch)?.payload.prompt?.text).toBe('hand repair, variation 1')
})

test('comparison is read-only and result preset is available in the integrated Apply picker', async ({
  page,
}) => {
  await page.goto('/?prototype=project')
  const prompt = page.getByRole('textbox', { exact: true, name: 'Prompt' })
  const original = await prompt.textContent()
  await page.getByRole('button', { name: 'Layer actions for Portrait Base' }).click()
  await page.getByText('Compare generation settings', { exact: true }).click()
  const comparison = page.getByRole('region', { name: 'Compare generation settings' })
  await expect(comparison).toBeVisible()
  await expect(comparison.getByText('portrait, studio lighting', { exact: true })).toBeVisible()
  await expect(comparison.getByText('Current Canvas', { exact: true })).toBeVisible()
  await comparison.getByRole('checkbox', { name: 'Show unchanged sections' }).check()
  await expect(comparison.getByRole('button')).toHaveCount(0)
  await page.locator('.canvas-size-label').click()
  await expect(prompt).toHaveText(original!)
  await page.getByRole('button', { name: 'Layer actions for Portrait Base' }).click()
  await page.getByText('Create Preset from Result', { exact: true }).click()
  await page.getByLabel('Preset name').fill('From accepted portrait')
  await page.getByRole('button', { exact: true, name: 'Create Preset' }).click()
  await page.getByRole('button', { name: 'Close Preset Manager' }).click()
  await page.getByRole('button', { exact: true, name: 'Apply preset' }).click()
  await page.getByRole('button', { name: /From accepted portrait/ }).click()
  await page
    .getByRole('dialog', { name: /Apply Preset/ })
    .getByRole('button', { exact: true, name: 'Apply' })
    .click()
  await expect(prompt).toHaveText('portrait, studio lighting')
})

test('imported layers explain missing provenance and patch comparison follows the active variant', async ({
  page,
}) => {
  await page.goto('/?prototype=project&scenario=smart-patch')
  await page.getByRole('button', { name: 'Layer actions for Highlight Pass' }).click()
  await expect(page.getByText('Compare generation settings · No generation data')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Layer actions for Hand Repair Patch' }).click()
  await page.getByText('Compare generation settings', { exact: true }).click()
  const comparison = page.getByRole('region', { name: 'Compare generation settings' })
  await expect(comparison).toContainText('hand repair, variation 2')
  await expect(comparison).not.toContainText('Internal Size')
  await page.locator('.canvas-size-label').click()
  await page.getByRole('button', { name: 'Switch variant for Hand Repair Patch' }).click()
  await page.getByRole('button', { exact: true, name: 'Variant 1' }).click()
  await page.getByRole('button', { name: 'Layer actions for Hand Repair Patch' }).click()
  await page.getByText('Compare generation settings', { exact: true }).click()
  await expect(comparison).toContainText('hand repair, variation 1')
})

test('generation freezes the chosen version and prompt before later edits', async ({ page }) => {
  await page.clock.install()
  await page.goto('/?prototype=project')
  const prompt = page.getByRole('textbox', { exact: true, name: 'Prompt' })
  await prompt.fill('queued portrait')
  await page.getByLabel('Model version', { exact: true }).click()
  await page.getByText('v1.0 archive', { exact: true }).last().click()
  await page.getByRole('button', { exact: true, name: 'Generate' }).click()
  await prompt.click()
  await prompt.press('ControlOrMeta+a')
  await page.keyboard.insertText('edited after enqueue')
  await expect(prompt).toHaveText('edited after enqueue')
  await page.clock.runFor(2000)
  await page.getByRole('button', { exact: true, name: 'Add 1 as Layer' }).click()
  await page.getByRole('button', { name: 'Layer actions for Generated Result 1' }).click()
  await page.getByText('Compare generation settings', { exact: true }).click()
  const comparison = page.getByRole('region', { name: 'Compare generation settings' })
  await expect(comparison.getByText('queued portrait', { exact: true })).toBeVisible()
  await expect(comparison.getByText('edited after enqueue', { exact: true })).toBeVisible()
  await comparison.getByRole('checkbox', { name: 'Show unchanged sections' }).check()
  await expect(comparison).toContainText('illustrious-xl-v1-0')
})

test('comparison labels missing resources and unavailable legacy fields explicitly', async ({
  page,
}) => {
  await page.goto('/?prototype=project&scenario=errors')
  await page.getByRole('button', { name: 'Layer actions for Portrait Base' }).click()
  await page.getByText('Compare generation settings', { exact: true }).click()
  const comparison = page.getByRole('region', { name: 'Compare generation settings' })
  await expect(
    comparison.locator('.comparison-row').filter({ hasText: 'Sampler & Scheduler' }),
  ).toContainText('Unavailable')
  await expect(
    comparison.locator('.comparison-row').filter({ hasText: /Model.*Missing resource/ }),
  ).toContainText('Illustrious XL')
})
