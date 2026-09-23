import { expect, test } from '@playwright/test'

async function openCinematicApply(page: import('@playwright/test').Page) {
  await page.goto('/?prototype=project')
  await page.getByRole('button', { exact: true, name: 'Apply preset' }).click()
  await page.getByRole('button', { name: /Cinematic Img2Img Pass/ }).click()
  return page.getByRole('dialog', { name: 'Apply Preset: Cinematic Img2Img Pass' })
}

test('Project Apply identifies the source and opens an unchanged original directly', async ({
  page,
}) => {
  const dialog = await openCinematicApply(page)

  await expect(dialog.getByText('Teal-orange grade with a low-denoise film look.')).toBeVisible()
  await expect(dialog.getByText(/temporary copy for/)).toBeVisible()
  await expect(
    dialog.locator('.preset-meta').getByRole('button', { name: 'Edit original' }),
  ).toBeVisible()
  await expect(dialog.locator('footer').getByRole('button', { name: 'Edit original' })).toHaveCount(
    0,
  )

  await dialog.getByRole('button', { name: 'About Apply Preset' }).hover()
  await expect(
    page.getByText('The project does not stay linked to the preset after applying.'),
  ).toBeVisible()

  await dialog.getByRole('button', { name: 'Edit original' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit saved preset' })).toHaveCount(0)
  await expect(page.getByLabel('Preset name')).toHaveValue('Cinematic Img2Img Pass')
})

test('Project Apply resets values without resetting section selection and guards changed drafts', async ({
  page,
}) => {
  const dialog = await openCinematicApply(page)
  const loraSelection = dialog.getByRole('checkbox', { name: 'Apply LoRA' })
  const resetAll = dialog.getByRole('button', { name: 'Reset all' })
  const guidanceSection = dialog.locator('.n-collapse-item').filter({ hasText: /^Steps & CFG/ })

  await expect(resetAll).toBeDisabled()
  await loraSelection.uncheck()
  await guidanceSection.locator('.n-collapse-item__header').click()
  const cfg = guidanceSection.getByRole('textbox', { name: 'CFG' })
  await cfg.fill('6.2')
  await expect(resetAll).toBeEnabled()
  await guidanceSection.getByRole('button', { name: 'Reset Steps & CFG' }).click()
  await expect(cfg).toHaveValue('4.5')
  await expect(loraSelection).not.toBeChecked()
  await expect(resetAll).toBeDisabled()

  await cfg.fill('6.4')
  await resetAll.click()
  await expect(cfg).toHaveValue('4.5')
  await expect(loraSelection).not.toBeChecked()

  await dialog.getByRole('button', { name: 'Edit original' }).click()
  const guard = page.getByRole('dialog', { name: 'Edit saved preset' })
  await expect(guard).toBeVisible()
  await guard.getByRole('button', { name: 'Keep editing here' }).click()
  await expect(dialog).toBeVisible()
  await expect(loraSelection).not.toBeChecked()

  await loraSelection.check()
  await dialog.getByRole('button', { name: 'Edit original' }).click()
  await expect(guard).toHaveCount(0)
  await expect(page.getByLabel('Preset name')).toHaveValue('Cinematic Img2Img Pass')
})
