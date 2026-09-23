import { expect, test } from '@playwright/test'

test('requires an explicit decision before replacing temporary results', async ({ page }) => {
  await page.goto('/?prototype=project&scenario=staging')
  await page.getByRole('button', { exact: true, name: 'Generate' }).click()
  const dialog = page.getByRole('dialog', { name: 'Replace generation results' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Keep results' }).click()
  await expect(page.getByRole('button', { name: 'Add 2 as Layers' })).toBeVisible()
  await expect(page.getByLabel('Select candidate 3')).not.toBeChecked()
  await page.getByRole('button', { exact: true, name: 'Generate' }).click()
  await dialog.getByRole('button', { name: 'Discard and generate' }).click()
  await expect(page.getByLabel('Select candidate 4')).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Select Generated Result 1' })).toBeHidden()
})

test('a canceled job cannot complete later while its sibling still completes', async ({ page }) => {
  await page.clock.pauseAt(new Date('2025-01-01T00:00:00Z'))
  await page.goto('/?prototype=project')
  await page.getByRole('button', { exact: true, name: 'Generate' }).click()
  await page.getByRole('button', { name: 'Cancel current generation' }).click()
  await page.clock.runFor(2000)
  const first = page.locator('.candidate').first()
  await expect(first).toContainText(/canceled|Canceled/)
  await expect(page.getByLabel('Select candidate 1')).toBeDisabled()
  await expect(page.getByLabel('Select candidate 2')).toBeEnabled()
})

test('confirmed close cancels only that project jobs and keeps completed queue history', async ({
  page,
}) => {
  await page.clock.pauseAt(new Date('2025-01-01T00:00:00Z'))
  await page.goto('/?prototype=home')

  await page.getByRole('tab', { name: 'Sample Project B.igs' }).click()
  await page.getByRole('button', { exact: true, name: 'Generate' }).click()
  await page.clock.runFor(450)
  await page
    .locator('.project-prototype:visible')
    .getByRole('button', { name: /Generation queue/ })
    .click()
  const projectBQueue = page
    .locator('.project-prototype:visible')
    .getByLabel('Project generation queue')
  await expect(projectBQueue.locator('.queue-item').first()).toContainText('completed')

  await page.getByRole('tab', { name: 'Sample Project A.igs' }).click()
  const hiddenProjectBQueue = page
    .locator('.project-prototype[aria-hidden="true"]')
    .getByLabel('Project generation queue')
  await expect(hiddenProjectBQueue.locator('.queue-item').nth(1)).toContainText('running')
  await page.getByRole('button', { exact: true, name: 'Generate' }).click()
  await page
    .locator('.project-prototype:visible')
    .getByRole('button', { name: /Generation queue/ })
    .click()
  const projectAQueue = page
    .locator('.project-prototype:visible')
    .getByLabel('Project generation queue')
  await expect(projectAQueue.locator('.queue-item').first()).toContainText('running')

  await page.getByRole('button', { name: 'Close Sample Project B.igs' }).click()
  const close = page.getByRole('dialog', { name: 'Close Project' })
  await expect(close).toBeVisible()
  await close.getByRole('button', { name: 'Cancel' }).click()
  await page.clock.runFor(300)
  await expect(close).toBeHidden()
  await expect(page.getByRole('tab', { name: 'Sample Project B.igs' })).toBeVisible()
  await page.getByRole('button', { name: 'Close Sample Project B.igs' }).click()
  await close.getByRole('button', { name: 'Discard Candidates and Close' }).click()
  await expect(page.getByRole('tab', { name: 'Sample Project B.igs' })).toBeHidden()

  await page.clock.runFor(1800)
  await expect(projectAQueue.locator('.queue-item').first()).toContainText('completed')

  await page.getByRole('tab', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Select Sample Project B' }).click()
  await page.getByRole('button', { name: 'Open Project' }).click()
  const reopenedQueue = page
    .locator('.project-prototype:visible')
    .getByLabel('Project generation queue')
  await expect(reopenedQueue.locator('.queue-item')).toHaveCount(4)
  await expect(reopenedQueue.locator('.queue-item').first()).toContainText('completed')
  await expect(reopenedQueue.locator('.queue-item').nth(1)).toContainText('canceled')
  await expect(reopenedQueue.locator('.queue-item').nth(2)).toContainText('canceled')
  await expect(reopenedQueue.locator('.queue-item').nth(3)).toContainText('canceled')
})

test('discarding dirty project edits keeps completed jobs and cancels unfinished jobs', async ({
  page,
}) => {
  await page.clock.pauseAt(new Date('2025-01-01T00:00:00Z'))
  await page.goto('/?prototype=home')

  await page.getByRole('tab', { name: 'Sample Project B.igs' }).click()
  await page.getByRole('button', { exact: true, name: 'Generate' }).click()
  await page.clock.runFor(450)
  await page.getByRole('textbox', { exact: true, name: 'Prompt' }).fill('a changed prompt')
  await page.getByRole('button', { name: 'Close Sample Project B.igs' }).click()

  const close = page.getByRole('dialog', { name: 'Close Project' })
  await expect(close).toContainText('Unsaved project changes')
  await close.getByRole('button', { name: 'Discard Changes' }).click()
  await page.clock.runFor(1800)

  await page.getByRole('tab', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Select Sample Project B' }).click()
  await page.getByRole('button', { name: 'Open Project' }).click()
  await page
    .locator('.project-prototype:visible')
    .getByRole('button', { name: /Generation queue/ })
    .click()
  const queue = page.locator('.project-prototype:visible').getByLabel('Project generation queue')
  await expect(queue.locator('.queue-item')).toHaveCount(4)
  await expect(queue.locator('.queue-item').first()).toContainText('completed')
  await expect(queue.locator('.queue-item').nth(1)).toContainText('canceled')
  await expect(queue.locator('.queue-item').nth(2)).toContainText('canceled')
  await expect(queue.locator('.queue-item').nth(3)).toContainText('canceled')
})

test('integrated Apply explains missing resources and keeps actions on screen', async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 })
  await page.goto('/?prototype=project')
  await page.getByRole('button', { exact: true, name: 'Apply preset' }).click()
  const choice = page.getByRole('button', { name: /Cinematic Img2Img Pass/ })
  await expect(choice).toContainText('Missing resource')
  await choice.click()
  const dialog = page.getByRole('dialog', { name: /Apply Preset/ })
  await expect(dialog.getByText('Selected resource is missing')).toBeVisible()
  const apply = dialog.getByRole('button', { exact: true, name: 'Apply' })
  await expect(apply).toBeInViewport({ ratio: 1 })
  await expect(apply).toBeDisabled()
  await dialog.getByRole('checkbox', { exact: true, name: 'Apply LoRA' }).uncheck()
  await expect(apply).toBeEnabled()
  await dialog.getByRole('button', { name: 'Expand all' }).click()
  await expect(apply).toBeInViewport({ ratio: 1 })
  await apply.click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('textbox', { exact: true, name: 'Prompt' })).toContainText(
    'cinematic shot',
  )
  await expect(page.locator('.lora-row').first()).toContainText('Digital Art')
})

test('canvas retains document proportions and Fit uses the available viewport', async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 })
  await page.goto('/?prototype=project&scenario=staging')
  for (const collapsed of [false, true]) {
    if (collapsed) {
      await page.getByRole('button', { name: 'Collapse layers panel' }).click()
    }
    await page.getByRole('button', { exact: true, name: 'Fit View' }).click()
    const frame = await page.locator('.canvas-frame').boundingBox()
    const stage = await page.locator('.canvas-stage').boundingBox()
    expect(frame!.width / frame!.height).toBeCloseTo(888 / 1184, 2)
    expect(frame!.height).toBeGreaterThan(stage!.height * 0.65)
    expect(frame!.height).toBeLessThan(stage!.height)
  }
})

test('Edit original opens the pristine source preset without a redundant confirmation', async ({
  page,
}) => {
  await page.goto('/?prototype=project')
  await page.getByRole('button', { exact: true, name: 'Apply preset' }).click()
  await page.getByRole('button', { name: /Cinematic Img2Img Pass/ }).click()
  const apply = page.getByRole('dialog', { name: /Apply Preset/ })
  await apply.getByRole('button', { name: 'Edit original' }).click()
  await expect(page.getByRole('dialog', { exact: true, name: 'Edit saved preset' })).toBeHidden()
  await expect(page.getByLabel('Preset name')).toHaveValue('Cinematic Img2Img Pass')
})

test('the shared preset catalog also reaches New Project without reloading Home', async ({
  page,
}) => {
  await page.goto('/?prototype=home')
  await page.getByRole('button', { exact: true, name: 'Manage Presets' }).click()
  await page.getByRole('button', { exact: true, name: 'New Preset' }).click()
  await page.getByLabel('Preset name').fill('Session starting point')
  await page.getByRole('button', { exact: true, name: 'Create Preset' }).click()
  await page.getByRole('button', { name: 'Close Preset Manager' }).click()
  await page.getByRole('button', { exact: true, name: 'New Project' }).click()
  await page.getByLabel('Generation preset').click()
  await expect(page.getByText('Session starting point', { exact: true })).toBeVisible()
  await page.getByText('Session starting point', { exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'New Project' })).toContainText(
    'Session starting point',
  )
})
