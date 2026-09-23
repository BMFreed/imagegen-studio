import { expect, type Locator, type Page, test } from '@playwright/test'
import { reactive } from 'vue'

import { includedSections } from '../src/prototypes/presets/presets.utils'
import {
  freezeGeneration,
  presetIntentFromResult,
  resultProvenance,
} from '../src/prototypes/project/project-provenance'
import { createProjectScenario } from '../src/prototypes/project/project.mock'
import {
  acceptStagingCandidates,
  applyPresetSections,
  createPresetIntent,
} from '../src/prototypes/project/project.utils'

async function selectOption(page: Page, control: Locator, label: string) {
  await control.click()
  await page
    .locator('.n-base-select-menu:visible')
    .first()
    .locator('.n-base-select-option:visible')
    .filter({ hasText: label })
    .click()
  await expect(control).toContainText(label)
}

test('legacy preset omission preserves current advanced values; accepted result keeps frozen values', () => {
  const session = reactive(createProjectScenario('staging'))
  const payload = session.document.generationDraft.payload
  payload.cfgRescale = 0.35
  payload.vaePrecision = 'FP32'
  const currentIntent = createPresetIntent(session)
  expect(currentIntent.kind).toBe('project')
  if (currentIntent.kind !== 'project') {
    throw new Error('Expected Project preset intent')
  }
  expect(currentIntent.definition.payload).toMatchObject({ cfgRescale: 0.35, vaePrecision: 'FP32' })

  const legacyPayload = { prompt: { embeddingRefs: [], text: 'legacy prompt' } }
  expect(includedSections(legacyPayload)).not.toContain('cfgRescale')
  expect(includedSections(legacyPayload)).not.toContain('vaePrecision')
  applyPresetSections(session, legacyPayload, ['prompt', 'cfgRescale', 'vaePrecision'])
  expect(payload.cfgRescale).toBe(0.35)
  expect(payload.vaePrecision).toBe('FP32')
  applyPresetSections(session, { cfgRescale: 0.55, vaePrecision: 'FP16' }, ['cfgRescale'])
  expect(payload.cfgRescale).toBe(0.55)
  expect(payload.vaePrecision).toBe('FP32')
  payload.cfgRescale = 0.35

  const job = session.queueItems[0]!
  job.frozenGeneration = freezeGeneration(session, job.id, 'frozen prompt', '', 123)
  payload.cfgRescale = 0.1
  payload.vaePrecision = 'Auto'
  session.staging!.selectedCandidateIds = ['candidate-1']
  acceptStagingCandidates(session)
  const layer = session.document.layers.find((item) => item.id === 'accepted-candidate-1')!
  expect(resultProvenance(layer)?.payload).toMatchObject({ cfgRescale: 0.35, vaePrecision: 'FP32' })
  const resultIntent = presetIntentFromResult(layer)
  expect(resultIntent?.kind).toBe('project')
  if (resultIntent?.kind !== 'project') {
    throw new Error('Expected result preset intent')
  }
  expect(resultIntent.definition.payload).toMatchObject({ cfgRescale: 0.35, vaePrecision: 'FP32' })
})

test('Project Advanced Options survive Save Current, Preset Manager edit, Apply, Compare and Undo', async ({
  page,
}) => {
  await page.goto('/?prototype=project')
  await page.getByText('Advanced Options', { exact: true }).click()
  const projectSettings = page.getByLabel('Generate settings')
  const cfgRescale = projectSettings.getByRole('textbox', { name: 'CFG Rescale' })
  const vaePrecision = projectSettings.getByLabel('VAE precision', { exact: true })
  await cfgRescale.fill('0.35')
  await cfgRescale.press('Enter')
  await selectOption(page, vaePrecision, 'FP32')

  await page.getByRole('button', { name: 'Layer actions for Portrait Base' }).click()
  await page
    .locator('.n-dropdown-menu:visible')
    .getByText('Compare generation settings', { exact: true })
    .click()
  const comparison = page.getByRole('region', { name: 'Compare generation settings' })
  await expect(
    comparison.locator('.comparison-row').filter({ hasText: /^CFG Rescale/ }),
  ).toContainText('Changed')
  await expect(
    comparison.locator('.comparison-row').filter({ hasText: /^VAE Precision/ }),
  ).toContainText('Changed')
  await page.locator('.canvas-size-label').click()

  await page.getByRole('button', { name: 'Save Current as Preset' }).click()
  await expect(page.getByRole('heading', { name: 'Preset Manager' })).toBeVisible()
  await page.getByLabel('Preset name').fill('Advanced Options Proof')
  const cfgSection = page
    .locator('.preset-editor .n-collapse-item')
    .filter({ hasText: /^CFG Rescale/ })
  const precisionSection = page
    .locator('.preset-editor .n-collapse-item')
    .filter({ hasText: /^VAE Precision/ })
  await expect(cfgSection.getByRole('checkbox', { name: 'Included' })).toBeChecked()
  await expect(precisionSection.getByRole('checkbox', { name: 'Included' })).toBeChecked()
  await cfgSection.locator('.n-collapse-item__header').click()
  const presetCfg = cfgSection.getByRole('textbox', { name: 'CFG Rescale' })
  await expect(presetCfg).toHaveValue('0.35')
  await presetCfg.fill('0.45')
  await presetCfg.press('Enter')
  await precisionSection.locator('.n-collapse-item__header').click()
  const presetPrecision = precisionSection.getByLabel('VAE Precision')
  await expect(presetPrecision).toContainText('FP32')
  await selectOption(page, presetPrecision, 'FP16')
  await page.getByRole('button', { name: 'Create Preset' }).click()
  await page.getByRole('button', { name: 'Close Preset Manager' }).click()

  await cfgRescale.fill('0.1')
  await cfgRescale.press('Enter')
  await selectOption(page, vaePrecision, 'Auto')
  await page.getByRole('button', { exact: true, name: 'Apply preset' }).click()
  await page.getByRole('button', { name: /Advanced Options Proof/ }).click()
  const applyDialog = page.getByRole('dialog', { name: 'Apply Preset: Advanced Options Proof' })
  await expect(applyDialog.getByRole('checkbox', { name: 'Apply CFG Rescale' })).toBeChecked()
  await expect(applyDialog.getByRole('checkbox', { name: 'Apply VAE Precision' })).toBeChecked()
  await applyDialog.getByRole('button', { exact: true, name: 'Apply' }).click()
  await expect(cfgRescale).toHaveValue('0.45')
  await expect(vaePrecision).toContainText('FP16')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(cfgRescale).toHaveValue('0.10')
  await expect(vaePrecision).toContainText('Auto')
})
