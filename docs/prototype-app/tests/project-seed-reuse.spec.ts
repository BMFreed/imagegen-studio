import { expect, type Locator, type Page, test } from '@playwright/test'
import { reactive } from 'vue'

import { recordCompletedActualSeed } from '../src/prototypes/project/project-seed.utils'
import { createProjectScenario } from '../src/prototypes/project/project.mock'

async function selectSeedPolicy(
  page: Page,
  policy: 'Fixed' | 'Reuse',
  scope: Locator | Page = page,
) {
  await page.keyboard.press('Escape')
  await scope.getByLabel('Seed policy').click()
  await page
    .locator('.n-base-select-menu:visible')
    .first()
    .locator('.n-base-select-option:visible')
    .filter({ hasText: policy })
    .click()
  await expect(scope.getByLabel('Seed policy')).toContainText(policy)
  await page.keyboard.press('Escape')
}

test('the prototype records a completed mock seed outside document history', () => {
  const session = reactive(createProjectScenario('staging'))
  const completed = session.queueItems[0]!
  const candidate = session.staging!.candidates[0]!
  const originalDocument = JSON.stringify(session.document)
  const originalHistory = JSON.stringify(session.history)

  expect(recordCompletedActualSeed(session, completed, candidate)).toBe(true)
  expect(session.lastActualSeed).toBe(9001)
  expect(session.dirty).toBe(false)
  expect(JSON.stringify(session.document)).toBe(originalDocument)
  expect(JSON.stringify(session.history)).toBe(originalHistory)

  const unfinished = session.queueItems[3]!
  const unfinishedCandidate = session.staging!.candidates[3]!
  unfinished.status = 'canceled'
  unfinishedCandidate.status = 'canceled'
  expect(recordCompletedActualSeed(session, unfinished, unfinishedCandidate)).toBe(false)
  unfinished.status = 'failed'
  unfinishedCandidate.status = 'failed'
  expect(recordCompletedActualSeed(session, unfinished, unfinishedCandidate)).toBe(false)
  expect(recordCompletedActualSeed(session, completed, undefined)).toBe(false)
  expect(session.lastActualSeed).toBe(9001)

  session.queueItems = []
  expect(session.lastActualSeed).toBe(9001)
})

test('Reuse waits for a completed output and freezes the cursor with the requested policy', async ({
  page,
}) => {
  await page.clock.install()
  await page.goto('/?prototype=project&scenario=empty-project')

  await page.getByRole('button', { exact: true, name: 'Apply preset' }).click()
  await page.getByRole('button', { name: /Hand Repair Smart Patch/ }).click()
  const preset = page.getByRole('dialog', { name: 'Apply Preset: Hand Repair Smart Patch' })
  await preset.getByRole('checkbox', { name: 'Apply Seed' }).check()
  await preset.getByRole('button', { exact: true, name: 'Apply' }).click()

  const generate = page.getByRole('button', { exact: true, name: 'Generate' })
  await expect(page.getByLabel('Seed policy')).toContainText('Reuse')
  await expect(generate).toBeDisabled()
  await expect(page.getByText('No completed seed in this project yet.').first()).toBeVisible()

  await selectSeedPolicy(page, 'Fixed')
  const seed = page.getByRole('textbox', { name: 'Generation seed' })
  await seed.fill('90')
  await seed.press('Enter')
  const count = page.getByRole('textbox', { name: 'Images per click' })
  await count.fill('1')
  await count.press('Enter')
  await generate.click()
  await page.getByRole('button', { name: 'Cancel current generation' }).click()
  await page.clock.runFor(600)
  await selectSeedPolicy(page, 'Reuse')
  await expect(generate).toBeDisabled()
  await page.getByRole('button', { name: 'Discard all candidates' }).click()

  await selectSeedPolicy(page, 'Fixed')
  await seed.fill('100')
  await seed.press('Enter')
  await generate.click()
  await page.clock.runFor(500)
  await expect(page.getByLabel('Select candidate 1')).toBeEnabled()
  await page
    .getByRole('button', { name: /Generation queue/ })
    .last()
    .click()
  const queue = page.getByLabel('Project generation queue')
  await queue.getByRole('button', { name: 'Clear terminal' }).click()
  await expect(queue.locator('.queue-item')).toHaveCount(0)
  await queue.getByRole('button', { name: 'Close project queue' }).click()
  await page.getByRole('button', { name: 'Discard all candidates' }).click()

  await selectSeedPolicy(page, 'Reuse')
  await expect(page.getByText('Last completed seed in this project: 100')).toBeVisible()
  await expect(generate).toBeEnabled()

  await page.getByRole('textbox', { exact: true, name: 'Prompt' }).fill('portrait {red|blue}')
  await page.getByLabel('Preview dynamic prompt').first().click()
  const preview = page.getByRole('dialog', { name: 'Dynamic Prompt Preview' })
  await preview.getByLabel('Dynamic prompt seed behavior').click()
  await page.locator('.n-base-select-option').filter({ hasText: 'Per prompt' }).click()
  await preview.getByRole('button', { name: 'Close' }).click()
  await count.fill('2')
  await count.press('Enter')
  await generate.click()
  await page.clock.runFor(2500)
  await page.getByRole('button', { name: 'Result selection actions' }).click()
  await page.getByText('Select all completed', { exact: true }).click()
  await page.getByRole('button', { name: 'Add 4 as Layers' }).click()

  for (const [index, expectedSeed] of [100, 101, 102, 103].entries()) {
    await page
      .getByRole('button', { name: `Layer actions for Generated Result ${index + 1}` })
      .click()
    await page
      .locator('.n-dropdown-menu:visible')
      .getByText('Compare generation settings', { exact: true })
      .click()
    const comparison = page.getByRole('region', { name: 'Compare generation settings' })
    const seedRow = comparison.locator('.comparison-row').filter({ hasText: /^Seed/ })
    await expect(seedRow.locator('.values p').first()).toContainText(`Fixed · ${expectedSeed}`)
    await expect(seedRow.locator('.values p').first()).toContainText('Requested policy: reuse')
    await page.locator('.canvas-size-label').click()
  }
})

test('completed seed belongs to one project and survives same-session close and reopen', async ({
  page,
}) => {
  await page.clock.install()
  await page.goto('/?prototype=home')
  await page.getByRole('tab', { name: 'Sample Project B.igs' }).click()
  const activeProject = page.locator('.project-prototype:visible')
  await selectSeedPolicy(page, 'Fixed', activeProject)
  const seed = activeProject.getByRole('textbox', { name: 'Generation seed' })
  await seed.fill('321')
  await seed.press('Enter')
  const count = activeProject.getByRole('textbox', { name: 'Images per click' })
  await count.fill('1')
  await count.press('Enter')
  await page.keyboard.press('Control+s')
  const projectBTab = page.getByRole('tab', { name: 'Sample Project B.igs' })
  await expect(projectBTab.locator('.dirty-dot')).toHaveCount(0)
  await activeProject.getByRole('button', { exact: true, name: 'Generate' }).click()
  await page.clock.runFor(500)
  await expect(activeProject.getByLabel('Select candidate 1')).toBeEnabled()
  await expect(projectBTab.locator('.dirty-dot')).toHaveCount(0)
  await activeProject.getByRole('button', { name: 'Discard all candidates' }).click()

  await page.getByRole('tab', { name: 'Sample Project A.igs' }).click()
  const projectA = page.locator('.project-prototype:visible')
  await selectSeedPolicy(page, 'Reuse', projectA)
  await expect(projectA.getByRole('button', { exact: true, name: 'Generate' })).toBeDisabled()
  await expect(
    projectA.getByText('No completed seed in this project yet.', { exact: true }),
  ).toBeVisible()

  await page.getByRole('tab', { name: 'Sample Project B.igs' }).click()
  await selectSeedPolicy(page, 'Reuse', activeProject)
  await expect(activeProject.getByText('Last completed seed in this project: 321')).toBeVisible()
  await page.getByRole('button', { name: 'Close Sample Project B.igs' }).click()
  const close = page.getByRole('dialog', { name: 'Close Project' })
  await close.getByRole('button', { name: 'Discard Changes' }).click()
  await page.getByRole('tab', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Select Sample Project B' }).click()
  await page.getByRole('button', { name: 'Open Project' }).click()
  const reopened = page.locator('.project-prototype:visible')
  await selectSeedPolicy(page, 'Reuse', reopened)
  await expect(reopened.getByText('Last completed seed in this project: 321')).toBeVisible()
  await expect(reopened.getByRole('button', { exact: true, name: 'Generate' })).toBeEnabled()
})
