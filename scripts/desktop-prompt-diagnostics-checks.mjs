import { expect } from '@playwright/test'

export async function checkPromptDiagnostics({ window, application, projectRegion }) {
  const positive = projectRegion.getByRole('textbox', { name: 'Positive prompt', exact: true })
  const negative = projectRegion.getByRole('textbox', { name: 'Negative prompt', exact: true })
  await positive.fill('(soft light')
  await negative.fill('(blur:abc)')
  await expect(positive.locator('.cm-prompt-syntax-error')).toHaveText('(')
  await expect(negative.locator('.cm-prompt-syntax-warning')).toHaveText('abc')
  await expect(positive.locator('.cm-prompt-syntax-warning')).toHaveCount(0)
  const indicator = projectRegion.getByRole('button', { name: 'Positive prompt syntax diagnostics (1)', exact: true })
  await indicator.focus()
  await indicator.press('Enter')
  const details = window.getByRole('region', { name: 'Positive prompt syntax diagnostics', exact: true })
  await expect(details).toContainText('Unclosed "("; expected ")".')
  await expect(details).toContainText('Bracket structure')
  await expect(positive).toHaveText('(soft light')
  if (process.env.IMAGEGEN_SMOKE_PROMPT_DIAGNOSTICS_SCREENSHOT) {
    await window.waitForTimeout(350) // Capture the settled native Naive transition.
    await window.screenshot({ path: process.env.IMAGEGEN_SMOKE_PROMPT_DIAGNOSTICS_SCREENSHOT })
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 620))
    await window.waitForFunction(() => window.innerWidth === 900)
    await projectRegion.getByRole('region', { name: 'Positive prompt editor', exact: true })
      .evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await window.waitForTimeout(350)
    await window.screenshot({ path: process.env.IMAGEGEN_SMOKE_PROMPT_DIAGNOSTICS_SCREENSHOT.replace('.png', '-small.png') })
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1380, 900))
    await window.waitForFunction(() => window.innerWidth === 1380)
  }
  await positive.press('Control+End')
  await positive.press(')')
  await expect(positive).toHaveText('(soft light)')
  await expect(indicator).toHaveCount(0)
  await expect(details).toBeHidden()
  await expect(positive.locator('.cm-prompt-syntax-error')).toHaveCount(0)
  await positive.press('Control+z')
  await expect(positive).toHaveText('(soft light')
  await expect(indicator).toBeVisible()
  await expect(negative.locator('.cm-prompt-syntax-warning')).toHaveText('abc')
  await expect(projectRegion.getByRole('button', { name: 'Save Project' })).toBeEnabled()
  // Leave malformed text in both polarities for the caller's actual .igs Save/read check.
}
