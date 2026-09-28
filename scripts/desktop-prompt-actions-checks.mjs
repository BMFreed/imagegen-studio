import assert from 'node:assert/strict'

import { expect } from '@playwright/test'

/** Real renderer/CodeMirror actions; persistence is checked by the caller's actual .igs loader. */
export async function checkPromptActions({ window, application, projectRegion }) {
  const positive = projectRegion.getByRole('textbox', { name: 'Positive prompt', exact: true })
  const negative = projectRegion.getByRole('textbox', { name: 'Negative prompt', exact: true })
  const positiveCard = projectRegion.getByRole('region', {
    name: 'Positive prompt editor',
    exact: true,
  })
  const negativeCard = projectRegion.getByRole('region', {
    name: 'Negative prompt editor',
    exact: true,
  })
  await positive.fill('alpha phrase, beta word')
  const help = window.locator('.prompt-help')
  await expect(help).toBeVisible()
  await expect(help).toContainText('Ctrl/Cmd+Space browses LoRA triggers.')
  await expect(help).not.toContainText('embeddings')
  await window.getByRole('button', { name: 'Close prompt help' }).click()
  await expect(help).toBeHidden()
  assert.equal(
    await window.evaluate(() =>
      localStorage.getItem('imagegen-studio.prompt-editor-hint-shown.v1'),
    ),
    '1',
  )

  // Click in actual rendered text; do not construct a CodeMirror selection through evaluate.
  await positive.dblclick({ position: { x: 15, y: 12 } })
  await expect.poll(() => window.evaluate(() => getSelection()?.toString())).toBe('alpha')
  await positive.click({ clickCount: 3, position: { x: 15, y: 12 } })
  await expect.poll(() => window.evaluate(() => getSelection()?.toString())).toBe('alpha phrase')
  await positiveCard.getByRole('button', { name: 'Increase prompt attention' }).click()
  await expect(positive).toHaveText('(alpha phrase)+, beta word')
  await expect.poll(() => window.evaluate(() => getSelection()?.toString())).toBe('(alpha phrase)+')
  await positive.press('Control+ArrowDown')
  await expect(positive).toHaveText('alpha phrase, beta word')
  await positive.press('Control+z')
  await expect(positive).toHaveText('(alpha phrase)+, beta word')
  await positive.press('Control+Shift+Z')
  await expect(positive).toHaveText('alpha phrase, beta word')

  await positive.press('Control+Home')
  for (let index = 0; index < 6; index += 1) {
    await positive.press('ArrowRight')
  }
  for (let index = 0; index < 6; index += 1) {
    await positive.press('Shift+ArrowRight')
  }
  await expect.poll(() => window.evaluate(() => getSelection()?.toString())).toBe('phrase')
  // Keyboard activation of the action uses the editor's remembered selection.
  const increase = positiveCard.getByRole('button', { name: 'Increase prompt attention' })
  await increase.focus()
  await increase.press('Enter')
  await expect(positive).toHaveText('alpha phrase+, beta word')
  await negative.fill('soft lighting, blur')
  await negative.press('Control+Home')
  await negative.press('Control+ArrowDown')
  await expect(negative).toHaveText('(soft lighting)-, blur')
  await expect(positive).toHaveText('alpha phrase+, beta word')
  await expect(help).toBeHidden()

  const previousClipboard = await application.evaluate(({ clipboard }) => clipboard.readText())
  try {
    await positiveCard.getByRole('button', { name: 'Copy prompt' }).click()
    await expect(positiveCard.getByRole('status')).toHaveText('Copied')
    assert.equal(
      await application.evaluate(({ clipboard }) => clipboard.readText()),
      'alpha phrase+, beta word',
    )
  } finally {
    await application.evaluate(
      ({ clipboard }, previous) => clipboard.writeText(previous),
      previousClipboard,
    )
  }
  await expect(positive).toHaveText('alpha phrase+, beta word')
  await positiveCard.getByRole('button', { name: 'Clear prompt' }).click()
  await expect(positive).toHaveText('')
  await expect(
    positiveCard.getByRole('button', { name: 'Increase prompt attention' }),
  ).toBeDisabled()
  await expect(positiveCard.getByRole('button', { name: 'Clear prompt' })).toBeDisabled()
  await positive.press('Control+z')
  await expect(positive).toHaveText('alpha phrase+, beta word')

  // Blank caret phrase is a disabled neighboring control, without affecting the negative editor.
  await positive.fill('first,  , last')
  await positive.press('Control+Home')
  for (let index = 0; index < 7; index += 1) {
    await positive.press('ArrowRight')
  }
  await expect(
    positiveCard.getByRole('button', { name: 'Increase prompt attention' }),
  ).toBeDisabled()
  await expect(
    negativeCard.getByRole('button', { name: 'Increase prompt attention' }),
  ).toBeEnabled()
  await positive.fill('alpha phrase, beta word')
  await positive.press('Control+Home')
  await positive.press('Control+ArrowUp')
  await expect(positive).toHaveText('(alpha phrase)+, beta word')
  await expect(positiveCard.getByRole('button', { name: 'Preview dynamic prompt' })).toHaveCount(0)

  if (process.env.IMAGEGEN_SMOKE_PROMPT_ACTIONS_SCREENSHOT) {
    await positiveCard.getByRole('button', { name: 'About Positive prompt editor' }).hover()
    await expect(help).toBeVisible()
    await expect(window.getByRole('button', { name: 'Close prompt help' })).toBeVisible()
    // Capture the settled Naive popover, after its opacity/position transition.
    await window.waitForTimeout(350)
    await window.screenshot({ path: process.env.IMAGEGEN_SMOKE_PROMPT_ACTIONS_SCREENSHOT })
    await window.mouse.move(600, 200)
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(900, 620),
    )
    await window.waitForFunction(() => window.innerWidth === 900)
    await positiveCard.evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await expect(help).toBeHidden()
    await window.waitForTimeout(350)
    await window.screenshot({
      path: process.env.IMAGEGEN_SMOKE_PROMPT_ACTIONS_SCREENSHOT.replace('.png', '-small.png'),
    })
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1380, 900),
    )
    await window.waitForFunction(() => window.innerWidth === 1380)
  }
}
