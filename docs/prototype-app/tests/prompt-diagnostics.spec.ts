import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('imagegen-studio.prompt-editor-hint-dismissed.v1', '1'),
  )
})

test('Project exposes actual syntax ranges and accessible explanations without blocking Generate', async ({
  page,
}) => {
  await page.goto('/?prototype=project&scenario=default')
  const positive = page.getByRole('textbox', { exact: true, name: 'Prompt' })
  const negative = page.getByRole('textbox', { exact: true, name: 'Negative Prompt' })
  await positive.fill('(light')
  await negative.fill('(blur:abc)')
  await expect(positive.locator('.cm-prompt-syntax-error')).toHaveText('(')
  await expect(negative.locator('.cm-prompt-syntax-warning')).toHaveText('abc')
  await negative.locator('.cm-prompt-syntax-warning').hover()
  await expect(page.locator('.prompt-syntax-tooltip')).toContainText(
    'Invalid attention weight "abc"',
  )
  await page.mouse.move(800, 200)
  const status = page.getByRole('button', { exact: true, name: 'Prompt syntax diagnostics (1)' })
  await status.focus()
  await status.press('Enter')
  const details = page.getByRole('region', { exact: true, name: 'Prompt syntax diagnostics' })
  await expect(details).toContainText('Unclosed "("')
  await positive.press('Control+End')
  await positive.press(')')
  await expect(status).toHaveCount(0)
  await expect(positive.locator('.cm-prompt-syntax-error')).toHaveCount(0)
  await expect(negative.locator('.cm-prompt-syntax-warning')).toHaveText('abc')
  await positive.fill('(light')
  await page.getByRole('button', { exact: true, name: 'Generate' }).click()
  await expect(page.getByRole('region', { exact: true, name: 'Generation Results' })).toBeVisible()
  await expect(positive).toHaveText('(light')
  await expect(negative).toHaveText('(blur:abc)')
})

test('Apply overlay preserves malformed prompt text and clears derived warnings on reset', async ({
  page,
}) => {
  await page.goto('/?prototype=project&scenario=default')
  await page.getByRole('button', { exact: true, name: 'Apply preset' }).click()
  await page.getByRole('button', { name: /Studio Portrait Soft Light/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Apply Preset: Studio Portrait Soft Light' })
  await dialog.getByRole('button', { exact: true, name: 'Expand all' }).click()
  const prompt = dialog.getByRole('textbox', { exact: true, name: 'Prompt' })
  await prompt.click()
  await prompt.press('Control+a')
  await page.keyboard.insertText('(portrait:abc)')
  await expect(prompt).toHaveText('(portrait:abc)')
  await expect(prompt.locator('.cm-prompt-syntax-warning')).toHaveText('abc')
  const indicator = dialog.getByRole('button', {
    exact: true,
    name: 'Prompt syntax diagnostics (1)',
  })
  await indicator.click()
  await expect(
    page.getByRole('region', { exact: true, name: 'Prompt syntax diagnostics' }),
  ).toContainText('Invalid attention weight "abc"')
  await dialog.getByRole('button', { exact: true, name: 'Reset all' }).click()
  await expect(prompt.locator('.cm-prompt-syntax-warning')).toHaveCount(0)
  await prompt.click()
  await prompt.press('Control+a')
  await page.keyboard.insertText('(portrait:abc)')
  await expect(prompt).toHaveText('(portrait:abc)')
  await dialog.getByRole('button', { exact: true, name: 'Apply' }).click()
  await expect(dialog).toBeHidden()
  const applied = page.getByRole('textbox', { exact: true, name: 'Prompt' })
  await expect(applied).toHaveText('(portrait:abc)')
  await expect(applied.locator('.cm-prompt-syntax-warning')).toHaveText('abc')
})
