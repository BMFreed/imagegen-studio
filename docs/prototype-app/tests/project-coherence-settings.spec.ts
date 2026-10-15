import { expect, type Page, test } from '@playwright/test'

// Real shared renderer control and prototype document/history adapter. Production
// Save, recovery and inference are verified at their own Main/native boundaries.
async function openPatch(page: Page) {
  await page.goto('/?prototype=project&scenario=smart-patch')
  await expect(page.getByRole('button', { name: 'Select Hand Repair Patch' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
}
function controls(page: Page) {
  const container = page.locator('.project-prototype:visible .coherence-settings')
  return {
    container,
    edge: container.getByRole('textbox', { name: 'Smart Patch coherence edge size' }),
    minimum: container.getByRole('textbox', { name: 'Smart Patch coherence minimum denoise' }),
    mode: container.getByRole('textbox', { name: 'Smart Patch coherence mode' }),
    modeDisplay: container.locator('.coherence-mode'),
  }
}
async function selectMode(page: Page, label: string) {
  await controls(page).mode.click()
  await page.locator('.n-base-select-menu:visible').getByText(label, { exact: true }).click()
  await expect(controls(page).modeDisplay).toContainText(label)
}

test('shared coherence defaults remain a no-op and compact controls identify processing units', async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 1280 })
  await openPatch(page)
  const { container, edge, minimum, modeDisplay } = controls(page)
  await expect(modeDisplay).toContainText('Gaussian Blur')
  await expect(edge).toHaveValue('16')
  await expect(minimum).toHaveValue('0')
  await edge.fill('16')
  await edge.press('Enter')
  await edge.press('Tab')
  await expect(minimum).toBeFocused()
  await expect(page.getByRole('button', { exact: true, name: 'Undo' })).toBeDisabled()

  const inputId = await edge.getAttribute('id')
  await container.locator(`label[for="${inputId}"]`).click()
  await expect(edge).toBeFocused()
  await container.getByText('Edge size', { exact: true }).hover()
  const tooltip = page.locator('.n-tooltip:visible').filter({ hasText: 'Coherence edge width' })
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText('processing pixels at the internal resolution')
  await expect(tooltip).toContainText('Mask blur uses project pixels')
  expect((await tooltip.boundingBox())!.width).toBeLessThanOrEqual(280)
  expect(await container.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
    false,
  )
})

test('coherence mode and each numeric field preserve the whole profile with one Enter/blur Undo', async ({
  page,
}) => {
  await openPatch(page)
  await selectMode(page, 'Box Blur')
  const { edge, minimum, modeDisplay } = controls(page)
  await edge.fill('24')
  await edge.press('Enter')
  await edge.press('Tab')
  await expect(minimum).toBeFocused()
  await expect(edge).toHaveValue('24')
  await page.getByRole('button', { exact: true, name: 'Undo' }).click()
  await expect(edge).toHaveValue('16')
  await expect(modeDisplay).toContainText('Box Blur')
  await page.getByRole('button', { exact: true, name: 'Redo' }).click()
  await expect(edge).toHaveValue('24')
  await minimum.fill('0.25')
  await minimum.press('Enter')
  await expect(edge).toHaveValue('24')
  await expect(modeDisplay).toContainText('Box Blur')
  await page.getByRole('button', { exact: true, name: 'Undo' }).click()
  await expect(minimum).toHaveValue('0')
  await expect(edge).toHaveValue('24')
  await expect(modeDisplay).toContainText('Box Blur')
})

test('coherence invalid drafts stay visible, Escape cancels and correction commits without clamping', async ({
  page,
}) => {
  await openPatch(page)
  const { container, edge, minimum } = controls(page)
  await edge.fill('16.5')
  await edge.press('Enter')
  await expect(edge).toHaveValue('16.5')
  await expect(container.getByRole('alert')).toContainText('0 to 1024 whole processing pixels')
  await minimum.click()
  await expect(edge).toHaveValue('16.5')
  await expect(page.getByRole('button', { exact: true, name: 'Undo' })).toBeDisabled()
  await edge.focus()
  await edge.press('Escape')
  await expect(edge).toHaveValue('16')
  await minimum.fill('1.2')
  await edge.click()
  await expect(minimum).toHaveValue('1.2')
  await expect(container.getByRole('alert')).toContainText('minimum denoise from 0 to 1')
  await minimum.fill('.125')
  await minimum.press('Enter')
  await expect(minimum).toHaveValue('0.125')
  await expect(container.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { exact: true, name: 'Undo' }).click()
  await expect(minimum).toHaveValue('0')
})

test('coherence selection cancels an uncommitted owner draft and lock disables every control', async ({
  page,
}) => {
  await openPatch(page)
  await controls(page).edge.fill('31')
  await page.getByRole('button', { name: 'Select Portrait Base' }).click()
  await expect(controls(page).container).toHaveCount(0)
  await page.getByRole('button', { name: 'Select Hand Repair Patch' }).click()
  await expect(controls(page).edge).toHaveValue('16')
  await expect(page.getByRole('button', { exact: true, name: 'Undo' })).toBeDisabled()
  await page.getByRole('button', { exact: true, name: 'Lock Hand Repair Patch' }).click()
  await expect(controls(page).edge).toBeDisabled()
  await expect(controls(page).minimum).toBeDisabled()
  await expect(controls(page).mode).toBeDisabled()
  await page.getByRole('button', { exact: true, name: 'Unlock Hand Repair Patch' }).click()
  await expect(controls(page).edge).toBeEnabled()
  await controls(page).edge.fill('8')
  await controls(page).edge.press('Enter')
  await expect(controls(page).edge).toHaveValue('8')
})

test('coherence document navigation discards detached raw drafts and preserves acknowledged profile', async ({
  page,
}) => {
  await openPatch(page)
  await selectMode(page, 'Staged')
  await controls(page).edge.fill('64')
  await page.getByRole('tab', { exact: true, name: 'Home' }).click()
  await page.getByRole('tab', { name: /^Sample Project B\.igs/ }).click()
  await expect(controls(page).modeDisplay).toContainText('Staged')
  await expect(controls(page).edge).toHaveValue('16')
  await page.getByRole('button', { exact: true, name: 'Undo' }).click()
  await expect(controls(page).modeDisplay).toContainText('Gaussian Blur')
  await expect(page.getByRole('button', { exact: true, name: 'Undo' })).toBeDisabled()
})
