import { expect, test } from '@playwright/test'

test('layer properties follow selection and opacity changes are undoable', async ({ page }) => {
  await page.goto('/?prototype=project')
  const properties = page.getByRole('toolbar', { name: 'Selected layer properties' })
  await expect(properties.getByLabel('Layer blend mode')).toBeVisible()
  const opacity = properties.getByRole('textbox', { exact: true, name: 'Layer opacity' })
  await expect(opacity).toHaveValue('100')
  await opacity.fill('62')
  await opacity.press('Enter')
  await page.getByRole('button', { name: 'Select Highlight Pass' }).click()
  await expect(opacity).toHaveValue('78')
  await page.getByRole('button', { name: 'Select Portrait Base' }).click()
  await expect(opacity).toHaveValue('62')
  await page.getByRole('button', { exact: true, name: 'Undo' }).click()
  await expect(opacity).toHaveValue('100')

  await page.getByRole('button', { exact: true, name: 'Select Face lighting' }).click()
  await expect(properties.getByLabel('Layer blend mode')).toHaveCount(0)
  const regionalOpacity = properties.getByRole('textbox', { name: 'Region opacity' })
  await expect(regionalOpacity).toHaveValue('50')
  await regionalOpacity.fill('25')
  await regionalOpacity.press('Enter')
  await expect(page.locator('.regional-overlay')).toHaveCSS('opacity', '0.25')
  await page.getByRole('button', { exact: true, name: 'Undo' }).click()
  await expect(regionalOpacity).toHaveValue('50')
  await expect(page.locator('.regional-overlay')).toHaveCSS('opacity', '0.5')
})

test('regional authoring stays in the row and edits, attachments and deletion can be undone', async ({
  page,
}) => {
  await page.goto('/?prototype=project&scenario=regional-guidance')
  const row = page.locator('.regional-row').filter({ hasText: 'Face lighting' })
  const prompt = row.getByRole('textbox', { exact: true, name: 'Regional prompt' })
  const originalPrompt = await prompt.inputValue()
  await prompt.fill('soft window light')
  await page.locator('.canvas-size-label').click()
  await page.getByRole('button', { exact: true, name: 'Undo' }).click()
  await expect(prompt).toHaveValue(originalPrompt)

  await row.getByRole('button', { exact: true, name: 'Negative Prompt' }).click()
  await row
    .getByRole('textbox', { exact: true, name: 'Regional negative prompt' })
    .fill('hard shadows')
  await row.getByRole('switch', { name: 'Use global negative prompt' }).check()
  await expect(
    row.getByRole('textbox', { exact: true, name: 'Regional negative prompt' }),
  ).toHaveCount(0)
  await page.getByRole('button', { exact: true, name: 'Undo' }).click()
  await expect(
    row.getByRole('textbox', { exact: true, name: 'Regional negative prompt' }),
  ).toHaveValue('hard shadows')

  await row.getByLabel('Add regional reference images').setInputFiles({
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="white"/></svg>',
    ),
    mimeType: 'image/svg+xml',
    name: 'window-light.svg',
  })
  await expect(row.getByRole('img', { name: 'window-light.svg' })).toBeVisible()
  await row.getByRole('button', { name: 'Remove reference window-light.svg' }).click()
  await expect(row.getByRole('img', { name: 'window-light.svg' })).toHaveCount(0)
  await page.getByRole('button', { exact: true, name: 'Undo' }).click()
  await expect(row.getByRole('img', { name: 'window-light.svg' })).toBeVisible()

  await row.getByRole('button', { name: 'Layer actions for Face lighting' }).click()
  await page.getByText('Delete region', { exact: true }).click()
  await expect(row).toHaveCount(0)
  await page.getByRole('button', { exact: true, name: 'Undo' }).click()
  await page.getByRole('button', { exact: true, name: 'Select Face lighting' }).click()
  await expect(row.getByRole('img', { name: 'window-light.svg' })).toBeVisible()
})

for (const viewport of [
  { height: 720, width: 1280 },
  { height: 900, width: 1440 },
  { height: 1080, width: 1920 },
]) {
  test(`staging stays compact and panel handles stay centered at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/?prototype=project&scenario=staging')
    const tray = page.getByRole('region', { name: 'Generation Results' })
    const stage = page.locator('.canvas-stage')
    const trayBox = (await tray.boundingBox())!
    const stageBox = (await stage.boundingBox())!
    expect(trayBox.height).toBeLessThanOrEqual(124)
    expect(trayBox.x).toBeGreaterThanOrEqual(stageBox.x)
    expect(trayBox.x + trayBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width)
    expect(trayBox.y + trayBox.height).toBeLessThan(stageBox.y + stageBox.height)
    await expect(tray.getByRole('button', { name: 'Add 2 as Layers' })).toBeInViewport({ ratio: 1 })
    for (const panel of ['settings', 'layers']) {
      const handle = page.getByRole('button', { name: `Collapse ${panel} panel` })
      const box = (await handle.boundingBox())!
      const currentStage = (await stage.boundingBox())!
      expect(box.y + box.height / 2).toBeCloseTo(currentStage.y + currentStage.height / 2, 0)
      await handle.click()
      const expand = page.getByRole('button', { name: `Expand ${panel} panel` })
      const expandedBox = (await expand.boundingBox())!
      expect(expandedBox.y + expandedBox.height / 2).toBeCloseTo(
        currentStage.y + currentStage.height / 2,
        0,
      )
      await expand.click()
    }
    await page.getByRole('button', { name: 'Next result preview' }).click()
    await expect(page.getByLabel('Select candidate 1')).toBeChecked()
    await expect(page.getByLabel('Select candidate 2')).toBeChecked()
    await expect(page.getByLabel('Select candidate 3')).not.toBeChecked()
    await page.getByRole('button', { name: 'Collapse Generation Results' }).click()
    expect((await tray.boundingBox())!.height).toBeLessThanOrEqual(42)
    await expect(tray.getByRole('button', { name: 'Add 2 as Layers' })).toBeVisible()
    await page.getByRole('button', { name: 'Result selection actions' }).click()
    await page.getByText('Clear selection', { exact: true }).click()
    await expect(tray.getByRole('button', { name: 'Add 0 as Layers' })).toBeDisabled()
  })
}

test('staging actions remain inside the canvas when both side panels are widened', async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 })
  await page.goto('/?prototype=project&scenario=staging')
  const handles = page.locator('.project-prototype .n-split__resize-trigger')
  for (const [index, delta] of [
    [0, 160],
    [1, -160],
  ] as const) {
    const box = (await handles.nth(index).boundingBox())!
    await page.mouse.move(box.x + 2, box.y + 20)
    await page.mouse.down()
    await page.mouse.move(box.x + delta, box.y + 20, { steps: 8 })
    await page.mouse.up()
  }
  const stage = (await page.locator('.canvas-stage').boundingBox())!
  expect(stage.width).toBeLessThan(240)
  const toolbar = page.getByRole('toolbar', { name: 'Temporary generation results' })
  const actions = toolbar.getByRole('button')
  for (const action of await actions.all()) {
    const box = (await action.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(stage.x)
    expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width)
  }
  const tray = (await page.getByRole('region', { name: 'Generation Results' }).boundingBox())!
  const frame = (await page.locator('.canvas-frame').boundingBox())!
  expect(frame.y + frame.height).toBeLessThan(tray.y)
  await toolbar.getByRole('button', { name: 'Add 2 as Layers' }).click()
  await expect(page.getByRole('dialog', { name: 'Accept generation results' })).toBeVisible()
})

test('resource choices show useful metadata and trigger search preserves the prompt', async ({
  page,
}) => {
  await page.goto('/?prototype=project')
  const prompt = page.getByRole('textbox', { exact: true, name: 'Prompt' })
  const originalPrompt = await prompt.textContent()
  const loras = page.getByLabel('Add LoRA', { exact: true })
  await loras.click()
  const detail = page.locator('.n-base-select-option').filter({ hasText: 'Detail Tweaker' })
  await expect(detail).toContainText('Illustrious')
  await expect(detail).toContainText('highly detailed, intricate detail')
  await expect(detail.locator('img')).toBeVisible()
  await loras.locator('input').fill('intricate detail')
  await expect(page.locator('.n-base-select-option')).toHaveCount(1)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('switch', { name: 'Enable Detail Tweaker' })).toBeVisible()
  await expect(prompt).toHaveText(originalPrompt!)
  await loras.click()
  await expect(
    page.locator('.n-base-select-option').filter({ hasText: 'Detail Tweaker' }),
  ).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')

  await page.getByLabel('Generation model', { exact: true }).click()
  const selectedModel = page.locator('.n-base-select-option').filter({ hasText: 'Illustrious XL' })
  await expect(selectedModel.locator('img')).toBeVisible()
  await expect(selectedModel).toContainText('Illustrious · v1.1 main')
  const model = page.locator('.n-base-select-option').filter({ hasText: 'NoobAI XL' })
  await expect(model).toContainText('NoobAI')
  await expect(model.locator('img')).toBeVisible()
  await expect(model.locator('.resource-triggers')).toHaveCount(0)
  await model.click()
  await expect(page.getByLabel('Generation model', { exact: true })).toContainText('NoobAI XL')
  await expect(prompt).toHaveText(originalPrompt!)
})
