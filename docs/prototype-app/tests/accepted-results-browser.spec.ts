import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const screenshotsDir = path.resolve(import.meta.dirname, '..', 'screenshots')
const firstLayerId = '44444444-4444-4444-8444-000000000000'
const firstProjectKey = `project-v1-${'a'.repeat(64)}`

test.beforeAll(async () => {
  await mkdir(screenshotsDir, { recursive: true })
})

test('saved accepted results keep 50-row list scrollable and page without losing navigation identity', async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 })
  await page.goto('/?prototype=accepted-results')
  const dialog = page.getByRole('dialog', { name: 'Saved generations' })
  const list = dialog.getByRole('list', { name: 'Saved generations' })
  await expect(dialog).toBeVisible()
  await expect(list.getByRole('listitem')).toHaveCount(50)
  await expect(dialog.getByText('50 shown · 57 saved')).toBeVisible()

  const first = list.locator(`[data-layer-id="${firstLayerId}"]`)
  await expect(first.getByText('Seed 0')).toBeVisible()
  await expect(first.getByText('Preview unavailable')).toBeVisible()
  await expect(first.locator('.result-name')).toHaveAttribute(
    'title',
    /A very long accepted layer name/,
  )
  await page.screenshot({
    animations: 'disabled',
    path: path.join(screenshotsDir, 'accepted-results-long-list.png'),
  })
  const brokenPreview = list.getByRole('listitem').nth(2)
  await brokenPreview.scrollIntoViewIfNeeded()
  await expect(brokenPreview.getByText('Preview unavailable')).toBeVisible()

  const scroll = dialog.locator('.history-scroll')
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  const last = list.getByRole('button', { name: /Accepted composition 50/ })
  await expect(last).toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'Older results' })).toBeVisible()

  await dialog.getByRole('button', { name: 'Older results' }).click()
  await expect(list.getByRole('listitem')).toHaveCount(7)
  await expect(dialog.getByText('7 shown · 57 saved')).toBeVisible()
  await expect(list.getByRole('button', { name: /Accepted composition 57/ })).toBeVisible()
  await dialog.getByRole('button', { name: 'Newer results' }).click()
  await expect(list.getByRole('listitem')).toHaveCount(50)

  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'Open saved generations' }).click()
  await expect(dialog).toBeVisible()
  await expect(list.getByRole('listitem')).toHaveCount(50)
  await expect(dialog.getByText('50 shown · 57 saved')).toBeVisible()
  await first.getByRole('button', { name: /Open result A very long accepted layer name/ }).click()
  await expect(dialog).toBeHidden()
  const requested = page.getByTestId('accepted-results-mock-navigation')
  await expect(requested).toBeVisible()
  await expect(requested).toHaveAttribute('data-project-key', firstProjectKey)
  await expect(requested).toHaveAttribute('data-layer-id', firstLayerId)
  await expect(requested).toHaveAttribute(
    'data-document-id',
    '11111111-1111-4111-8111-111111111111',
  )
  await expect(requested).toHaveAttribute(
    'data-document-revision',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  )
})

test('compact saved-results browser keeps the footer reachable and the list contained', async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 1280 })
  await page.goto('/?prototype=accepted-results')
  const dialog = page.getByRole('dialog', { name: 'Saved generations' })
  await expect(dialog).toBeVisible()
  const list = dialog.getByRole('list', { name: 'Saved generations' })
  await expect(list.getByRole('listitem')).toHaveCount(50)
  const boxes = await Promise.all([
    dialog.boundingBox(),
    dialog.locator('.history-scroll').boundingBox(),
    dialog.getByRole('button', { name: 'Older results' }).boundingBox(),
  ])
  const [modalBox, listBox, footerBox] = boxes
  expect(modalBox).not.toBeNull()
  expect(listBox).not.toBeNull()
  expect(footerBox).not.toBeNull()
  expect(modalBox!.y).toBeGreaterThanOrEqual(0)
  expect(modalBox!.y + modalBox!.height).toBeLessThanOrEqual(800)
  expect(listBox!.y + listBox!.height).toBeLessThanOrEqual(footerBox!.y)
  const scroll = dialog.locator('.history-scroll')
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(list.getByRole('button', { name: /Accepted composition 50/ })).toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'Older results' })).toBeInViewport()
  await page.screenshot({
    animations: 'disabled',
    path: path.join(screenshotsDir, 'accepted-results-compact.png'),
  })
})

test('saved-results browser gives distinct empty and read-error states', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 })
  await page.goto('/?prototype=accepted-results&scenario=empty')
  const dialog = page.getByRole('dialog', { name: 'Saved generations' })
  await expect(dialog.getByText('No saved generations yet')).toBeVisible()
  await expect(dialog.getByText('0 shown · 0 saved')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Older results' })).toBeDisabled()
  await page.screenshot({
    animations: 'disabled',
    path: path.join(screenshotsDir, 'accepted-results-empty.png'),
  })

  await page.goto('/?prototype=accepted-results&scenario=error')
  await expect(
    dialog.getByText('Saved generations could not be read. Try refreshing.'),
  ).toBeVisible()
  await expect(dialog.getByText('Results unavailable')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Older results' })).toBeDisabled()
  await page.screenshot({
    animations: 'disabled',
    path: path.join(screenshotsDir, 'accepted-results-error.png'),
  })
})

for (const prototype of ['home', 'project'] as const) {
  test(`${prototype} offers the same saved-results browser and reports a mock navigation request`, async ({
    page,
  }) => {
    await page.goto(`/?prototype=${prototype}`)
    const dialog = page.getByRole('dialog', { name: 'Saved generations' })
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: 'Open saved generations' }).click()
    await expect(dialog).toBeVisible()
    const list = dialog.getByRole('list', { name: 'Saved generations' })
    await expect(list.getByRole('listitem')).toHaveCount(50)
    if (prototype === 'project') {
      await page.screenshot({
        animations: 'disabled',
        path: path.join(screenshotsDir, 'accepted-results-project-entry.png'),
      })
    }
    await list
      .locator(`[data-layer-id="${firstLayerId}"]`)
      .getByRole('button', { name: /Open result A very long accepted layer name/ })
      .click()
    await expect(dialog).toBeHidden()
    const requested = page.getByTestId('accepted-results-mock-navigation')
    await expect(requested).toBeVisible()
    await expect(requested).toHaveAttribute('data-project-key', firstProjectKey)
    await expect(requested).toHaveAttribute('data-layer-id', firstLayerId)
    await expect(requested).toContainText('Mock navigation requested for saved Project')
  })
}
