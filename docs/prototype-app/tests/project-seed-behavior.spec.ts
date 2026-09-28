import { expect, type Page, test } from '@playwright/test'
import { reactive } from 'vue'

import { scheduleDynamicPromptSeeds } from '../src/prototypes/project/project-prompt.utils'
import { freezeGeneration } from '../src/prototypes/project/project-provenance'
import { createProjectScenario } from '../src/prototypes/project/project.mock'
import { acceptStagingCandidates } from '../src/prototypes/project/project.utils'

test('seed schedule shares each iteration seed or advances for every prompt pair', () => {
  expect(scheduleDynamicPromptSeeds(2, 2, 'per-iteration', 100)).toEqual([100, 101, 100, 101])
  expect(scheduleDynamicPromptSeeds(2, 2, 'per-prompt', 100)).toEqual([100, 101, 102, 103])
  expect(scheduleDynamicPromptSeeds(2, 2, 'per-iteration', 0xff_ff_ff_ff)).toEqual([
    0xff_ff_ff_ff, 0, 0xff_ff_ff_ff, 0,
  ])
})

test('accepted provenance retains the frozen seed behavior after draft edits', () => {
  const session = reactive(createProjectScenario('staging'))
  const job = session.queueItems[0]!
  session.document.generationDraft.dynamicPrompt.seedBehavior = 'per-prompt'
  job.frozenGeneration = freezeGeneration(session, job.id, 'portrait red', '', 100)
  session.document.generationDraft.dynamicPrompt.seedBehavior = 'per-iteration'
  session.staging!.selectedCandidateIds = ['candidate-1']

  acceptStagingCandidates(session)

  const layer = session.document.layers.find((item) => item.id === 'accepted-candidate-1')
  expect(layer?.kind).toBe('raster')
  if (layer?.kind !== 'raster') {
    throw new Error('Expected accepted Raster Layer')
  }
  expect(layer.provenance?.dynamicPrompt.seedBehavior).toBe('per-prompt')
  expect(layer.provenance?.payload.seed?.value).toBe(100)
})

async function generateAndAccept(page: Page, behavior: 'per-iteration' | 'per-prompt') {
  await page.clock.install()
  await page.goto('/?prototype=project&scenario=empty-project')

  await page.getByRole('textbox', { exact: true, name: 'Prompt' }).fill('portrait {red|blue}')
  await page.getByLabel('Preview dynamic prompt').first().click()
  const preview = page.getByRole('dialog', { name: 'Dynamic Prompt Preview' })
  await expect(preview).toContainText('2 concrete prompt pairs')
  await preview.getByLabel('Dynamic prompt seed behavior').click()
  await page
    .locator('.n-base-select-option')
    .filter({ hasText: behavior === 'per-prompt' ? 'Per prompt' : 'Per iteration' })
    .click()
  await expect(preview).toContainText(
    behavior === 'per-prompt'
      ? 'A different seed for every prompt pair and iteration.'
      : 'One seed per iteration, shared by every expanded prompt pair.',
  )
  await preview.getByRole('button', { name: 'Close' }).click()

  const random = page.getByRole('switch', { name: 'Random seed' })
  if (await random.isChecked()) {
    await random.click()
  }
  const seed = page.getByRole('textbox', { name: 'Generation seed' })
  await seed.fill('100')
  await seed.press('Enter')
  const count = page.getByRole('textbox', { name: 'Images per click' })
  await count.fill('2')
  await count.press('Enter')

  await page.getByRole('button', { exact: true, name: 'Generate' }).click()
  await expect(page.getByRole('region', { name: 'Generation Results' })).toBeVisible()
  await page.clock.runFor(2500)
  await page.getByRole('button', { name: 'Result selection actions' }).click()
  await page.getByText('Select all completed', { exact: true }).click()
  await page.getByRole('button', { name: 'Add 4 as Layers' }).click()
  await expect(page.getByRole('region', { name: 'Generation Results' })).toBeHidden()
}

for (const behavior of ['per-iteration', 'per-prompt'] as const) {
  test(`Generate freezes ${behavior} seeds on accepted results`, async ({ page }) => {
    await generateAndAccept(page, behavior)
    const expectedSeeds = behavior === 'per-iteration' ? [100, 101, 100, 101] : [100, 101, 102, 103]
    const expectedPrompts = ['portrait red', 'portrait red', 'portrait blue', 'portrait blue']

    for (let index = 0; index < expectedSeeds.length; index += 1) {
      await page
        .getByRole('button', { name: `Layer actions for Generated Result ${index + 1}` })
        .click()
      await page
        .locator('.n-dropdown-menu:visible')
        .getByText('Compare generation settings', { exact: true })
        .click()
      const comparison = page
        .getByRole('region', { name: 'Compare generation settings' })
        .filter({ has: page.getByText(`Generated Result ${index + 1}`, { exact: true }) })
      await comparison.getByRole('checkbox', { name: 'Show unchanged sections' }).check()
      const seedRow = comparison.locator('.comparison-row').filter({ hasText: /^Seed/ })
      const promptRow = comparison.locator('.comparison-row').filter({ hasText: /^Prompt/ })
      await expect(seedRow.locator('.values p').first()).toContainText(String(expectedSeeds[index]))
      await expect(promptRow.locator('.values p').first()).toContainText(expectedPrompts[index]!)
      await page.locator('.canvas-size-label').click()
      await expect(comparison).toBeHidden()
    }
  })
}
