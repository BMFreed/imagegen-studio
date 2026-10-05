import { expect, type Locator, type Page, test } from '@playwright/test'
import { reactive } from 'vue'

import type { PresetPayload } from '../src/prototypes/presets/presets.types'

import { generationModels } from '../src/components/generation/generation.mock'
import {
  clonePreset,
  includedSections,
  setPresetSectionIncluded,
  summarizePresetSection,
} from '../src/prototypes/presets/presets.utils'
import { redoProject, undoProject } from '../src/prototypes/project/project-history'
import { createProjectScenario } from '../src/prototypes/project/project.mock'
import { applyPresetSections, createPresetIntent } from '../src/prototypes/project/project.utils'

const animaModel = generationModels.find((model) => model.baseModelFamily === 'anima')!

async function selectOption(page: Page, control: Locator, label: string) {
  await control.click()
  await page
    .locator('.n-base-select-option:visible')
    .filter({ has: page.getByText(label, { exact: true }) })
    .first()
    .click()
  await expect(control).toContainText(label)
  await expect(page.locator('.n-base-select-menu:visible')).toHaveCount(0)
}

async function clearNativeMethod(control: Locator) {
  await control.hover()
  await control.locator('.n-base-clear').click()
  await expect(control).toContainText('Choose method')
}

async function settleFiniteAnimations(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    )
  })
}

test('prototype authoring uses explicit family metadata and leaves a new native section unset', () => {
  expect(animaModel).toMatchObject({ baseModelFamily: 'anima', name: 'Anima' })
  expect(animaModel.predictionType).toBeUndefined()
  expect(generationModels.find((model) => model.baseModel === 'NoobAI')?.baseModelFamily).toBeNull()
  const payload: PresetPayload = { model: clonePreset(animaModel) }
  setPresetSectionIncluded(payload, 'sampling', true, 'textToImage')
  expect(payload.sampling).toEqual({})
  expect(includedSections(payload)).toContain('sampling')
  expect(summarizePresetSection(payload, 'sampling')).toBe('Anima method not included')
  payload.sampling = { animaMethod: 'dpmpp_2m_sde' }
  expect(summarizePresetSection(payload, 'sampling')).toBe('Anima · DPM++ 2M SDE')
  setPresetSectionIncluded(payload, 'sampling', false, 'textToImage')
  expect(Object.hasOwn(payload, 'sampling')).toBe(false)

  // A display label cannot assign a family to an otherwise unknown model.
  const unknown: PresetPayload = { model: { baseModel: 'Anima', id: 'unknown', name: 'Anima' } }
  setPresetSectionIncluded(unknown, 'sampling', true, 'textToImage')
  expect(unknown.sampling).toEqual({ sampler: 'DPM++ 2M', scheduler: 'Karras' })
  expect(summarizePresetSection({ sampling: {} }, 'sampling')).toBe('Sampling choices not included')
})

test('actual prototype Apply merges sampling members, preserves omitted choices and isolates its source', () => {
  const session = reactive(createProjectScenario('default'))
  const target = session.document.generationDraft.payload
  target.sampling = { animaMethod: 'heun', sampler: 'Euler a', scheduler: 'Normal' }
  const before = clonePreset(target)
  const nativeOnly: PresetPayload = { sampling: { animaMethod: 'er_sde' } }
  const nativeSource = clonePreset(nativeOnly)
  applyPresetSections(session, nativeOnly, ['sampling'])
  expect(target.sampling).toEqual({
    animaMethod: 'er_sde',
    sampler: 'Euler a',
    scheduler: 'Normal',
  })
  expect(nativeOnly).toEqual(nativeSource)
  expect(target.sampling).not.toBe(nativeOnly.sampling)
  undoProject(session)
  expect(session.document.generationDraft.payload).toEqual(before)
  redoProject(session)
  expect(session.document.generationDraft.payload.sampling?.animaMethod).toBe('er_sde')

  const legacy: PresetPayload = { sampling: { sampler: 'DPM++ 2M', scheduler: 'Karras' } }
  applyPresetSections(session, legacy, ['sampling'])
  expect(session.document.generationDraft.payload.sampling).toEqual({
    animaMethod: 'er_sde',
    sampler: 'DPM++ 2M',
    scheduler: 'Karras',
  })
  applyPresetSections(session, { sampling: { scheduler: 'Exponential' } }, ['sampling'])
  expect(session.document.generationDraft.payload.sampling).toEqual({
    animaMethod: 'er_sde',
    sampler: 'DPM++ 2M',
    scheduler: 'Exponential',
  })
  const current = clonePreset(session.document.generationDraft.payload)
  applyPresetSections(session, { sampling: {} }, ['sampling'])
  applyPresetSections(session, {}, ['sampling'])
  applyPresetSections(session, { sampling: { animaMethod: 'lcm' } }, ['prompt'])
  expect(session.document.generationDraft.payload).toEqual(current)
})

test('prototype Save Current preserves the native choice and inactive pair without including Seed', () => {
  const session = reactive(createProjectScenario('default'))
  const payload = session.document.generationDraft.payload
  payload.model = clonePreset(animaModel)
  payload.sampling = { animaMethod: 'heun', sampler: 'Euler a', scheduler: 'Normal' }
  payload.seed = { policy: 'fixed', value: 0 }
  const intent = createPresetIntent(session)
  expect(intent.kind).toBe('project')
  if (intent.kind !== 'project') {
    throw new Error('Expected Project preset intent')
  }
  expect(intent.definition.payload.sampling).toEqual(payload.sampling)
  expect(Object.hasOwn(intent.definition.payload, 'seed')).toBe(false)
  intent.definition.payload.sampling!.animaMethod = 'lcm'
  expect(payload.sampling.animaMethod).toBe('heun')
})

test('Project selectors retain both family choices and direct clear participates in Undo', async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 })
  await page.goto('/?prototype=project')
  const settings = page.getByLabel('Generate settings')
  const sampler = settings.getByLabel('Sampler', { exact: true })
  const scheduler = settings.getByLabel('Scheduler', { exact: true })
  await selectOption(page, sampler, 'Euler a')
  await selectOption(page, scheduler, 'Normal')
  const model = settings.getByLabel('Generation model', { exact: true })
  await selectOption(page, model, 'Anima')
  const method = settings.getByLabel('Anima method', { exact: true })
  await expect(method).toContainText('Choose method')
  await expect(scheduler).toHaveCount(0)
  await method.click()
  const labels = await page
    .locator('.n-base-select-menu:visible .n-base-select-option')
    .allTextContents()
  expect(labels.map((label) => label.trim())).toEqual([
    'Euler',
    'Heun',
    'DPM++ 2M',
    'DPM++ 2M SDE',
    'ER-SDE',
    'LCM',
  ])
  await settleFiniteAnimations(page)
  await page.screenshot({ path: test.info().outputPath('anima-project-method-normal.png') })
  await page.setViewportSize({ height: 800, width: 1280 })
  await settleFiniteAnimations(page)
  await page.screenshot({ path: test.info().outputPath('anima-project-method-min.png') })
  await page.keyboard.press('Escape')
  await selectOption(page, method, 'Heun')
  await selectOption(page, model, 'Illustrious XL')
  await expect(sampler).toContainText('Euler a')
  await expect(scheduler).toContainText('Normal')
  await selectOption(page, model, 'Anima')
  await expect(method).toContainText('Heun')
  await clearNativeMethod(method)
  await page.getByRole('button', { exact: true, name: 'Undo' }).click()
  await expect(method).toContainText('Heun')
})

test('Preset Manager and Apply share native editing; omission keeps the current method and source unchanged', async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 })
  await page.goto('/?prototype=project')
  const settings = page.getByLabel('Generate settings')
  await selectOption(page, settings.getByLabel('Generation model', { exact: true }), 'Anima')
  const currentMethod = settings.getByLabel('Anima method', { exact: true })
  await selectOption(page, currentMethod, 'Heun')
  await page.getByRole('button', { name: 'Save Current as Preset' }).click()
  await page.getByLabel('Preset name').fill('Native Sampling Proof')
  const sampling = page
    .locator('.preset-editor .n-collapse-item')
    .filter({ hasText: /^Sampler & Scheduler/ })
  await expect(sampling.getByRole('checkbox', { name: 'Included' })).toBeChecked()
  await sampling.locator('.n-collapse-item__header').click()
  const savedMethod = sampling.getByLabel('Anima method', { exact: true })
  await expect(savedMethod).toContainText('Heun')
  await selectOption(page, savedMethod, 'ER-SDE')
  await settleFiniteAnimations(page)
  await page.screenshot({ path: test.info().outputPath('anima-preset-native-normal.png') })
  await page.setViewportSize({ height: 800, width: 1280 })
  await settleFiniteAnimations(page)
  await page.screenshot({ path: test.info().outputPath('anima-preset-native-min.png') })
  const cfgSection = page
    .locator('.preset-editor .n-collapse-item')
    .filter({ hasText: /^CFG Rescale/ })
  await cfgSection.locator('.n-collapse-item__header').click()
  const presetReset = cfgSection.getByRole('button', { name: 'Reset unsupported CFG Rescale' })
  await expect(presetReset).toHaveCSS('height', '24px')
  await expect(presetReset).toHaveCSS('width', '24px')
  await presetReset.scrollIntoViewIfNeeded()
  await page.setViewportSize({ height: 900, width: 1440 })
  await settleFiniteAnimations(page)
  await page.screenshot({ path: test.info().outputPath('anima-preset-advanced-normal.png') })
  await page.setViewportSize({ height: 800, width: 1280 })
  await presetReset.scrollIntoViewIfNeeded()
  await settleFiniteAnimations(page)
  await page.screenshot({ path: test.info().outputPath('anima-preset-advanced-min.png') })
  await page.getByRole('button', { exact: true, name: 'Create Preset' }).click()
  await page.getByRole('button', { name: 'Close Preset Manager' }).click()
  await selectOption(page, currentMethod, 'LCM')
  await page.getByRole('button', { exact: true, name: 'Apply preset' }).click()
  await page.getByRole('button', { name: /Native Sampling Proof/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Apply Preset: Native Sampling Proof' })
  const applySampling = dialog
    .locator('.n-collapse-item')
    .filter({ hasText: /^Sampler & Scheduler/ })
  await applySampling.locator('.n-collapse-item__header').click()
  await clearNativeMethod(applySampling.getByLabel('Anima method', { exact: true }))
  await expect(applySampling).toContainText(
    'No Anima method is included. Apply keeps the current method.',
  )
  await dialog.getByRole('button', { exact: true, name: 'Apply' }).click()
  await expect(currentMethod).toContainText('LCM')
  const savedSampling = await page.evaluate(async () => {
    const loadModule = (path: string) => import(path)
    const { presetCatalog } = (await loadModule(
      '/src/prototypes/presets/presets.catalog.ts',
    )) as typeof import('../src/prototypes/presets/presets.catalog')
    return presetCatalog.value.find((preset) => preset.name === 'Native Sampling Proof')?.payload
      .sampling
  })
  expect(savedSampling?.animaMethod).toBe('er_sde')
})

test('Anima Advanced preserves inapplicable values until an explicit field Reset, including Undo', async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 })
  await page.goto('/?prototype=project')
  const settings = page.getByLabel('Generate settings')
  await settings.getByText('Advanced Options', { exact: true }).click()
  const rescale = settings.getByRole('textbox', { name: 'CFG Rescale' })
  const precision = settings.getByLabel('VAE precision', { exact: true })
  const vae = settings.getByLabel('VAE', { exact: true })
  await rescale.fill('0.35')
  await rescale.press('Enter')
  await selectOption(page, precision, 'FP32')
  const savedVae = await vae.textContent()
  await selectOption(page, settings.getByLabel('Generation model', { exact: true }), 'Anima')
  await expect(rescale).toBeDisabled()
  await expect(rescale).toHaveValue('0.35')
  await expect(precision).toContainText('FP32')
  await expect(vae).toHaveText(savedVae!)
  await expect(settings).toContainText('CFG Rescale is not supported by Anima.')
  await expect(settings).toContainText('Anima uses its pinned companion VAE.')
  const reset = settings.getByRole('button', { name: 'Reset unsupported CFG Rescale' })
  await expect(reset).toHaveCSS('height', '24px')
  await expect(reset).toHaveCSS('width', '24px')
  await rescale.scrollIntoViewIfNeeded()
  await settleFiniteAnimations(page)
  await page.screenshot({ path: test.info().outputPath('anima-project-advanced-normal.png') })
  await page.setViewportSize({ height: 800, width: 1280 })
  await rescale.scrollIntoViewIfNeeded()
  await settleFiniteAnimations(page)
  await page.screenshot({ path: test.info().outputPath('anima-project-advanced-min.png') })
  await settings.getByRole('button', { name: 'Reset unsupported CFG Rescale' }).click()
  await expect(rescale).toHaveValue('')
  await expect(settings.getByRole('button', { name: 'Reset unsupported CFG Rescale' })).toHaveCount(
    0,
  )
  await expect(precision).toContainText('FP32')
  await expect(vae).toHaveText(savedVae!)
  await page.getByRole('button', { exact: true, name: 'Undo' }).click()
  await expect(rescale).toHaveValue('0.35')
})
