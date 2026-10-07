import { expect, type Locator, type Page, test } from '@playwright/test'

async function selectExactOption(page: Page, control: Locator, label: string) {
  await control.click()
  await page
    .locator('.n-base-select-menu:visible')
    .first()
    .getByText(label, { exact: true })
    .click()
  await expect(control).toContainText(label)
}

test('Project and Preset Manager author distinct Euler pairs through preset Apply and Undo', async ({
  page,
}) => {
  await page.goto('/?prototype=project')
  const settings = page.getByLabel('Generate settings')
  const sampler = settings.getByLabel('Sampler', { exact: true })
  const scheduler = settings.getByLabel('Scheduler', { exact: true })
  await selectExactOption(page, sampler, 'Euler a')
  await selectExactOption(page, scheduler, 'Normal')
  await selectExactOption(page, sampler, 'Euler')
  await expect(sampler).toHaveText('Euler')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(sampler).toHaveText('Euler a')
  await expect(scheduler).toContainText('Normal')
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(sampler).toHaveText('Euler')

  await page.getByRole('button', { name: 'Save Current as Preset' }).click()
  await expect(page.getByRole('heading', { name: 'Preset Manager' })).toBeVisible()
  await page.getByLabel('Preset name').fill('Ordinary Euler Proof')
  const samplingSection = page
    .locator('.preset-editor .n-collapse-item')
    .filter({ hasText: /^Sampler & Scheduler/ })
  await expect(samplingSection.getByRole('checkbox', { name: 'Included' })).toBeChecked()
  await samplingSection.locator('.n-collapse-item__header').click()
  const presetSampler = samplingSection.getByLabel('Sampler', { exact: true })
  const presetScheduler = samplingSection.getByLabel('Scheduler', { exact: true })
  await expect(presetSampler).toHaveText('Euler')
  await expect(presetScheduler).toContainText('Normal')
  await selectExactOption(page, presetSampler, 'Euler a')
  await expect(presetSampler).toHaveText('Euler a')
  await selectExactOption(page, presetSampler, 'Euler')
  await page.getByRole('button', { name: 'Create Preset' }).click()
  await page.getByRole('button', { name: 'Close Preset Manager' }).click()

  await selectExactOption(page, sampler, 'Euler a')
  await page.getByRole('button', { exact: true, name: 'Apply preset' }).click()
  await page.getByRole('button', { name: /Ordinary Euler Proof/ }).click()
  const applyDialog = page.getByRole('dialog', { name: 'Apply Preset: Ordinary Euler Proof' })
  await expect(
    applyDialog.getByRole('checkbox', { name: 'Apply Sampler & Scheduler' }),
  ).toBeChecked()
  await applyDialog.getByRole('button', { exact: true, name: 'Apply' }).click()
  await expect(sampler).toHaveText('Euler')
  await expect(scheduler).toContainText('Normal')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(sampler).toHaveText('Euler a')
  await expect(scheduler).toContainText('Normal')
})
