import { expect, test } from '@playwright/test'

// These tests exercise the browser document/session boundary; persistence and
// generation remain prototype mocks.
for (const [surface, route] of [
  ['standalone', '/?prototype=project'],
  ['integrated', '/'],
] as const) {
  test(`${surface}: selected Project owns edits, history and Save`, async ({ page }) => {
    await page.goto(route)
    const projectA = page.getByRole('tab', { name: /^Sample Project A\.igs/ })
    const projectB = page.getByRole('tab', { name: /^Sample Project B\.igs/ })
    const prompt = page.getByRole('textbox', { exact: true, name: 'Prompt' })

    await projectA.click()
    const baseline = await prompt.textContent()
    await prompt.fill('Project A isolated prompt')
    await projectB.click()
    await expect(projectA).toHaveAccessibleName('Sample Project A.igs Unsaved changes')
    await expect(projectB).toHaveAccessibleName('Sample Project B.igs')
    await expect(prompt).toHaveText(baseline!)

    await prompt.fill('Project B isolated prompt')
    await projectA.click()
    await expect(prompt).toHaveText('Project A isolated prompt')
    await page.getByRole('button', { exact: true, name: 'Undo' }).click()
    await expect(prompt).toHaveText(baseline!)
    await expect(projectA).toHaveAccessibleName('Sample Project A.igs')
    await expect(projectB).toHaveAccessibleName('Sample Project B.igs Unsaved changes')
    await page.getByRole('button', { exact: true, name: 'Redo' }).click()
    await expect(prompt).toHaveText('Project A isolated prompt')

    await page.keyboard.press('Control+s')
    await expect(page.getByText('Project saved', { exact: true })).toBeVisible()
    await expect(projectA).toHaveAccessibleName('Sample Project A.igs')
    await expect(projectB).toHaveAccessibleName('Sample Project B.igs Unsaved changes')
    await projectB.click()
    await expect(prompt).toHaveText('Project B isolated prompt')
  })

  test(`${surface}: Home tab and shortcut retain the open Project session`, async ({ page }) => {
    await page.goto(route)
    const home = page.getByRole('tab', { exact: true, name: 'Home' })
    const projectB = page.getByRole('tab', { name: /^Sample Project B\.igs/ })
    const prompt = page.getByRole('textbox', { exact: true, name: 'Prompt' })
    await projectB.click()
    await prompt.fill('Retained through Home')

    await home.click()
    await expect(home).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByLabel('Home prototype')).toBeVisible()
    await expect(
      page.getByRole('button', { exact: true, name: 'New Project' }).first(),
    ).toBeVisible()
    await expect(page.getByRole('button', { exact: true, name: 'Generate' })).toBeHidden()
    await projectB.click()
    await expect(prompt).toHaveText('Retained through Home')

    await page.getByRole('button', { exact: true, name: 'Open Home' }).click()
    await expect(page.getByLabel('Home prototype')).toBeVisible()
    await projectB.click()
    await expect(prompt).toHaveText('Retained through Home')
    await expect(projectB).toHaveAccessibleName('Sample Project B.igs Unsaved changes')
  })

  test(`${surface}: close Cancel and Discard affect only the selected Project`, async ({
    page,
  }) => {
    await page.goto(route)
    const projectA = page.getByRole('tab', { name: /^Sample Project A\.igs/ })
    const projectB = page.getByRole('tab', { name: /^Sample Project B\.igs/ })
    const prompt = page.getByRole('textbox', { exact: true, name: 'Prompt' })
    await projectB.click()
    await prompt.fill('Project B remains dirty')
    await projectA.click()
    await prompt.fill('Project A saved baseline')
    await page.keyboard.press('Control+s')
    await expect(projectA).toHaveAccessibleName('Sample Project A.igs')
    await prompt.fill('Project A unsaved edit')
    await page.getByRole('button', { name: 'Close Sample Project A.igs' }).click()
    const close = page.getByRole('dialog', { name: 'Close Project' })
    await expect(close).toContainText('Unsaved project changes')
    await close.getByRole('button', { exact: true, name: 'Cancel' }).click()
    await expect(prompt).toHaveText('Project A unsaved edit')
    await expect(projectA).toHaveAttribute('aria-selected', 'true')

    await page.getByRole('button', { name: 'Close Sample Project A.igs' }).click()
    await close.getByRole('button', { name: 'Discard Changes' }).click()
    await expect(projectA).toBeHidden()
    await expect(projectB).toHaveAttribute('aria-selected', 'true')
    await expect(prompt).toHaveText('Project B remains dirty')
    await expect(projectB).toHaveAccessibleName('Sample Project B.igs Unsaved changes')

    await page.getByRole('tab', { exact: true, name: 'Home' }).click()
    await page.getByRole('button', { name: 'Select Sample Project A' }).click()
    await page.getByRole('button', { exact: true, name: 'Open Project' }).click()
    await expect(projectA).toHaveAttribute('aria-selected', 'true')
    await expect(projectA).toHaveAccessibleName('Sample Project A.igs')
    await expect(prompt).toHaveText('Project A saved baseline')
    await expect(page.getByRole('button', { exact: true, name: 'Undo' })).toBeDisabled()
  })

  test(`${surface}: switching tabs retains generation and close cancels only its Project`, async ({
    page,
  }) => {
    await page.clock.pauseAt(new Date('2025-01-01T00:00:00Z'))
    await page.goto(route)
    await page.getByRole('tab', { exact: true, name: 'Sample Project B.igs' }).click()
    await page.getByRole('button', { exact: true, name: 'Generate' }).click()
    await page.clock.runFor(450)
    await page
      .locator('.project-prototype:visible')
      .getByRole('button', { name: /Generation queue/ })
      .click()
    await expect(page.locator('.project-prototype:visible .queue-item').first()).toContainText(
      'completed',
    )

    await page.getByRole('tab', { exact: true, name: 'Sample Project A.igs' }).click()
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
    await expect(close).toContainText('Unaccepted generation results')
    await close.getByRole('button', { name: 'Discard Candidates and Close' }).click()
    await expect(page.getByRole('tab', { name: 'Sample Project B.igs' })).toBeHidden()
    await expect(page.getByRole('tab', { name: 'Sample Project A.igs' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await page.clock.runFor(1800)
    await expect(projectAQueue.locator('.queue-item')).toHaveCount(4)
    for (const item of await projectAQueue.locator('.queue-item').all()) {
      await expect(item).toContainText('completed')
    }

    await page.getByRole('tab', { exact: true, name: 'Home' }).click()
    await page.getByRole('button', { name: 'Select Sample Project B' }).click()
    await page.getByRole('button', { exact: true, name: 'Open Project' }).click()
    const projectBQueue = page
      .locator('.project-prototype:visible')
      .getByLabel('Project generation queue')
    await expect(projectBQueue.locator('.queue-item')).toHaveCount(4)
    await expect(projectBQueue.locator('.queue-item').first()).toContainText('completed')
    for (const item of await projectBQueue
      .locator('.queue-item')
      .all()
      .then((items) => items.slice(1))) {
      await expect(item).toContainText('canceled')
    }
    await expect(page.getByRole('region', { name: 'Generation Results' })).toBeHidden()
  })
}
