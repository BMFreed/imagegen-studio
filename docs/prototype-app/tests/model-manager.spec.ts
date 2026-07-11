import { expect, type Page, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const __dirname = import.meta.dirname
const screenshotsDir = path.resolve(__dirname, '..', 'screenshots')

const viewports = [
  { height: 1080, name: 'desktop-1920', width: 1920 },
  { height: 900, name: 'laptop-1440', width: 1440 },
  { height: 800, name: 'compact-1280', width: 1280 },
]

test.beforeAll(async () => {
  await mkdir(screenshotsDir, { recursive: true })
})

async function openModelManager(page: Page) {
  await page.goto('/?prototype=model-manager')
  await expect(page.getByRole('heading', { name: 'Model Manager' })).toBeVisible()
  await expect(page.locator('.manager-shell')).toHaveCSS('transform', 'none')
  await expect(page.getByRole('button', { name: 'Add from CivitAI URL' })).toBeVisible()
  await expect(page.getByText('Illustrious XL').first()).toBeVisible()
}

test.describe('Model Manager prototype', () => {
  test('enters through the native modal transition', async ({ page }) => {
    await page.addInitScript(() => {
      const state = globalThis as { managerEnteredFromScale?: boolean } & typeof globalThis
      new MutationObserver(() => {
        const manager = document.querySelector('.manager-shell')
        if (manager && getComputedStyle(manager).transform !== 'none') {
          state.managerEnteredFromScale = true
        }
      }).observe(document, { childList: true, subtree: true })
    })

    await openModelManager(page)
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (globalThis as { managerEnteredFromScale?: boolean } & typeof globalThis)
              .managerEnteredFromScale,
        ),
      )
      .toBe(true)
  })

  for (const viewport of viewports) {
    test(`captures ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width })
      await openModelManager(page)

      const hasHorizontalOverflow = await page
        .locator('.manager-body')
        .evaluate((element) => element.scrollWidth > element.clientWidth)
      expect(hasHorizontalOverflow).toBe(false)

      await page.screenshot({
        fullPage: false,
        path: path.join(screenshotsDir, `model-manager-${viewport.name}.png`),
      })
    })
  }

  test('opens CivitAI token popover', async ({ page }) => {
    await page.setViewportSize({ height: 1080, width: 1920 })
    await openModelManager(page)

    await page.getByRole('button', { name: /CivitAI connected/ }).click()
    await expect(page.getByText('Change token')).toBeVisible()
    await expect(page.getByText('Check connection')).toBeVisible()
    await expect(page.getByText('Remove token')).toBeVisible()
  })

  test('sizes the CivitAI connection action from its content', async ({ page }) => {
    await page.setViewportSize({ height: 800, width: 1280 })
    await openModelManager(page)

    const trigger = page.getByRole('button', { name: /CivitAI connected/ })
    const triggerBox = await trigger.boundingBox()
    const contentBox = await trigger.locator('.n-button__content').boundingBox()
    expect(triggerBox).not.toBeNull()
    expect(contentBox).not.toBeNull()
    expect(triggerBox!.width).toBeLessThan(192)
    expect(triggerBox!.width - contentBox!.width).toBeLessThanOrEqual(30)
  })

  test('shows the Model Manager description', async ({ page }) => {
    await page.setViewportSize({ height: 1080, width: 1920 })
    await openModelManager(page)

    await page.getByRole('button', { name: 'About Model Manager' }).hover()
    await expect(
      page.getByText('Install, inspect and repair the models used by your projects.'),
    ).toBeVisible()
  })

  test('resets visual filter state', async ({ page }) => {
    await page.setViewportSize({ height: 1080, width: 1920 })
    await openModelManager(page)

    const resetFilters = page.getByRole('button', { name: 'Reset filters' })
    await expect(resetFilters).toBeDisabled()

    await page.getByText('Checkpoints', { exact: true }).click()
    await expect(resetFilters).toBeEnabled()

    await resetFilters.click()
    await expect(resetFilters).toBeDisabled()
  })

  test('selects a resource with the keyboard', async ({ page }) => {
    await page.setViewportSize({ height: 1080, width: 1920 })
    await openModelManager(page)

    const digitalArt = page.getByRole('button', { name: /Digital Art/ })
    await expect(digitalArt).toHaveClass(/n-button/)
    await expect(digitalArt).toHaveCSS('padding-left', '12px')
    await expect(digitalArt).toHaveCSS('padding-right', '12px')
    await digitalArt.focus()
    await page.keyboard.press('Space')

    await expect(page.locator('h2', { hasText: 'Digital Art' })).toBeVisible()
    await expect(page.getByText('v0.1').last()).toBeVisible()

    const digitalArtRow = page.locator('article').filter({ hasText: 'Digital Art' })
    const rowBox = await digitalArtRow.boundingBox()
    expect(rowBox).not.toBeNull()
    await page.mouse.click(rowBox!.x + rowBox!.width - 12, rowBox!.y + rowBox!.height / 2)
    await expect(page.locator('h2', { hasText: 'Digital Art' })).toBeVisible()

    await page
      .locator('article')
      .filter({ hasText: 'Bad Hands Negative' })
      .getByRole('button', { name: 'Repair' })
      .click()
    await expect(page.locator('h2', { hasText: 'Digital Art' })).toBeVisible()
  })

  test('resizes navigation and resource details panes', async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 })
    await openModelManager(page)

    const navigation = page.locator('.manager-column--navigation')
    const navigationBefore = await navigation.boundingBox()
    const navigationHandle = page.locator('.manager-body > .n-split__resize-trigger-wrapper')
    const navigationHandleBox = await navigationHandle.boundingBox()
    expect(navigationBefore).not.toBeNull()
    expect(navigationHandleBox).not.toBeNull()
    await page.mouse.move(navigationHandleBox!.x, navigationHandleBox!.y + 100)
    await page.mouse.down()
    await page.mouse.move(navigationHandleBox!.x + 48, navigationHandleBox!.y + 100)
    await page.mouse.up()
    await expect
      .poll(async () => (await navigation.boundingBox())!.width)
      .toBeGreaterThan(navigationBefore!.width + 30)

    const details = page.locator('.manager-column--details')
    const detailsBefore = await details.boundingBox()
    const detailsHandle = page.locator('.manager-content-split > .n-split__resize-trigger-wrapper')
    const detailsHandleBox = await detailsHandle.boundingBox()
    expect(detailsBefore).not.toBeNull()
    expect(detailsHandleBox).not.toBeNull()
    await page.mouse.move(detailsHandleBox!.x, detailsHandleBox!.y + 100)
    await page.mouse.down()
    await page.mouse.move(detailsHandleBox!.x - 48, detailsHandleBox!.y + 100)
    await page.mouse.up()
    await expect
      .poll(async () => (await details.boundingBox())!.width)
      .toBeGreaterThan(detailsBefore!.width + 30)
  })

  test('keeps list, details and install progress inside a short manager viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 600, width: 1280 })
    await openModelManager(page)

    const shell = await page.locator('.manager-shell').boundingBox()
    expect(shell!.y).toBeGreaterThanOrEqual(15)
    expect(shell!.y + shell!.height).toBeLessThanOrEqual(585)

    const body = await page.locator('.manager-body').boundingBox()
    const resourceContent = await page.locator('.resource-content').boundingBox()
    const details = await page.locator('.manager-column--details').boundingBox()
    const install = await page.locator('.install-strip').boundingBox()
    expect(resourceContent!.y + resourceContent!.height).toBeCloseTo(body!.y + body!.height, 0)
    expect(details!.y + details!.height).toBeCloseTo(body!.y + body!.height, 0)
    expect(install!.y + install!.height).toBeCloseTo(
      resourceContent!.y + resourceContent!.height,
      0,
    )
    expect(install!.height).toBeLessThanOrEqual(58)

    const resourceScrolls = await page
      .locator('.resource-scroll .n-scrollbar-container')
      .evaluateAll((containers) =>
        containers.map((container) => container.scrollHeight > container.clientHeight),
      )
    expect(resourceScrolls.some(Boolean)).toBe(true)
    const detailsScrolls = await page
      .locator('.details-panel .n-scrollbar-container')
      .evaluateAll((containers) =>
        containers.map((container) => container.scrollHeight > container.clientHeight),
      )
    expect(detailsScrolls.some(Boolean)).toBe(true)
  })

  test('captures import dialog', async ({ page }) => {
    await page.setViewportSize({ height: 1080, width: 1920 })
    await openModelManager(page)

    await page.getByRole('button', { name: 'Add from CivitAI URL' }).click()
    await expect(page.getByRole('dialog', { name: 'Add from CivitAI URL' })).toBeVisible()
    await expect(page.getByText('Soft Ink Detailer')).toBeVisible()
    await page.waitForTimeout(250)

    await page.screenshot({
      fullPage: false,
      path: path.join(screenshotsDir, 'model-manager-import-dialog-1920.png'),
    })
  })
})
