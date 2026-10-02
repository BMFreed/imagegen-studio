import { expect, type Page, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const screenshotsDir = path.resolve(import.meta.dirname, '..', 'screenshots')
const runtimeErrors = new WeakMap<Page, string[]>()

/** Mock fixtures prove production presentation/wiring; they do not prove storage or worker behavior. */
async function openComparison(page: Page, scenario = 'default') {
  await page.goto(`/?prototype=generation-comparison&scenario=${scenario}`)
  await page.getByRole('button', { name: 'Layer actions for Generated greenhouse' }).click()
  await page.getByText('Compare generation settings', { exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Compare generation settings' })
  await expect(dialog).toBeVisible()
  return dialog
}

test.beforeAll(async () => {
  await mkdir(screenshotsDir, { recursive: true })
})

test.beforeEach(({ page }) => {
  const errors: string[] = []
  runtimeErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    // The existing playground has no favicon; its unrelated browser request is not a UI runtime error.
    if (
      message.type() === 'error' &&
      message.text().startsWith('Failed to load resource:') &&
      message.location().url.endsWith('/favicon.ico')
    ) {
      return
    }
    if (
      message.type() === 'error' ||
      (message.type() === 'warning' && message.text().includes('[Vue warn]'))
    ) {
      errors.push(message.text())
    }
  })
})

test.afterEach(({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([])
})

test('real layer menu leaves imported comparison disabled and opens a read-only generated comparison', async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 })
  await page.goto('/?prototype=generation-comparison')
  await page.getByRole('button', { name: 'Layer actions for Imported reference' }).click()
  const unavailable = page.getByText('Compare generation settings · No generation data', {
    exact: true,
  })
  await expect(unavailable).toBeVisible()
  await expect(unavailable.locator('..')).toHaveClass(/disabled/)
  await unavailable.click()
  await expect(page.getByRole('dialog', { name: 'Compare generation settings' })).toHaveCount(0)
  await page.getByRole('heading', { exact: true, name: 'Generation settings comparison' }).click()

  await page.getByRole('button', { name: 'Layer actions for Generated greenhouse' }).click()
  await page.getByText('Compare generation settings', { exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Compare generation settings' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Generated with', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Current Canvas', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Apply|Recall|Restore/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Select Generated greenhouse' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await dialog.getByRole('button', { name: 'Close generation settings comparison' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByLabel('Current steps', { exact: true })).toHaveValue('26')
})

test('known values, unknown old fields, current library prediction and concrete negative addition are explicit', async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 })
  const dialog = await openComparison(page)
  await expect(dialog.locator('[data-setting="guidance.steps"]')).toHaveAttribute(
    'data-status',
    'Changed',
  )
  await expect(dialog.locator('[data-setting="negativePrompt.text"]')).toHaveAttribute(
    'data-status',
    'Added',
  )
  await expect(dialog.locator('[data-setting="model.predictionType"]')).toHaveAttribute(
    'data-status',
    'Changed',
  )
  await expect(dialog.locator('[data-setting="model.predictionType"]')).toContainText(
    'v_prediction',
  )
  await expect(dialog.locator('[data-setting="loras.stack"]')).toHaveAttribute(
    'data-status',
    'Unavailable',
  )
  await expect(dialog.locator('[data-setting="seed.behavior"]')).toHaveAttribute(
    'data-status',
    'Unavailable',
  )
  await expect(dialog.locator('[data-setting="seed.actual"]')).toHaveCount(0)
  await dialog.getByRole('checkbox', { name: 'Show unchanged settings' }).check()
  await expect(dialog.locator('[data-setting="seed.actual"]')).toHaveAttribute(
    'data-status',
    'Same',
  )
  await expect(dialog.locator('[data-setting="seed.actual"] .comparison-values p')).toHaveText([
    '0',
    '0',
  ])
  await expect(dialog.locator('[data-setting="vae.resource"]')).toHaveAttribute(
    'data-status',
    'Unavailable',
  )
  await expect(dialog.getByText('Regional Guidance', { exact: true })).toHaveCount(0)
})

test('live Current Canvas changes recompute the disposable comparison without changing its frozen baseline', async ({
  page,
}) => {
  const dialog = await openComparison(page)
  await dialog.getByRole('checkbox', { name: 'Show unchanged settings' }).check()
  const currentSteps = page.getByLabel('Current steps', { exact: true })
  await currentSteps.fill('30')
  await currentSteps.press('Enter')
  const steps = dialog.locator('[data-setting="guidance.steps"]')
  await expect(steps).toHaveAttribute('data-status', 'Same')
  await expect(steps.locator('.comparison-values p')).toHaveText(['30', '30'])
  await currentSteps.fill('44')
  await currentSteps.press('Enter')
  await expect(steps).toHaveAttribute('data-status', 'Changed')
  await expect(steps.locator('.comparison-values p')).toHaveText(['30', '44'])
  await dialog.getByRole('button', { name: 'Close generation settings comparison' }).click()
  await expect(currentSteps).toHaveValue('44')
  await expect(page.getByRole('textbox', { name: 'Current negative prompt' })).toHaveValue(
    'blur, noise',
  )
})

test('missing exact resource bindings are exposed without replacing the recorded model', async ({
  page,
}) => {
  const dialog = await openComparison(page, 'missing')
  const model = dialog.locator('[data-setting="model.resource"]')
  await expect(model).toHaveAttribute('data-status', 'Missing resource')
  await expect(model).toContainText('Illustrious XL')
  await expect(dialog.locator('[data-setting="model.predictionType"]')).toHaveAttribute(
    'data-status',
    'Missing resource',
  )
  await page.screenshot({
    animations: 'disabled',
    path: path.join(screenshotsDir, 'generation-comparison-missing.png'),
  })
})

test('current mode failure keeps recorded settings usable and failed generation-data reads show a diagnostic', async ({
  page,
}) => {
  const dialog = await openComparison(page, 'unavailable')
  await expect(dialog.locator('[data-setting="context.mode"]')).toHaveAttribute(
    'data-status',
    'Unavailable',
  )
  await expect(dialog.locator('[data-setting="context.mode"]')).toContainText(
    'Image engine is not installed',
  )
  await expect(dialog.locator('[data-setting="guidance.steps"]')).toHaveAttribute(
    'data-status',
    'Changed',
  )
  await dialog.getByRole('button', { name: 'Close generation settings comparison' }).click()
  const failed = await openComparison(page, 'error')
  await expect(
    failed.getByText('Generation data could not be read. Close and try again.'),
  ).toBeVisible()
  await expect(failed.locator('[data-setting]')).toHaveCount(0)
  await page.screenshot({
    animations: 'disabled',
    path: path.join(screenshotsDir, 'generation-comparison-error.png'),
  })
})

test('long prompts wrap inside the bounded popover and its footer stays usable at compact size', async ({
  page,
}) => {
  for (const viewport of [
    { height: 900, width: 1440 },
    { height: 620, width: 900 },
  ]) {
    await page.setViewportSize(viewport)
    const dialog = await openComparison(page)
    const toggle = dialog.getByRole('checkbox', { name: 'Show unchanged settings' })
    await toggle.check()
    await expect(toggle).toBeInViewport()
    await expect(
      dialog.getByRole('button', { name: 'Close generation settings comparison' }),
    ).toBeInViewport()
    const prompt = dialog.locator('[data-setting="prompt.text"]')
    await prompt.scrollIntoViewIfNeeded()
    await expect(prompt).toHaveAttribute('data-status', 'Same')
    // The public popup follower reacts to resized content; wait for its observable final position.
    await expect
      .poll(() => dialog.evaluate((element) => element.getBoundingClientRect().bottom))
      .toBeLessThanOrEqual(viewport.height)
    const geometry = await dialog.evaluate((element) => ({
      documentWidth: document.documentElement.scrollWidth,
      popoverBottom: element.getBoundingClientRect().bottom,
      popoverLeft: element.getBoundingClientRect().left,
      popoverRight: element.getBoundingClientRect().right,
      popoverWidth: element.getBoundingClientRect().width,
      rowOverflow: [...element.querySelectorAll('.comparison-values p')].some(
        (node) => node.scrollWidth > node.clientWidth + 1,
      ),
      viewportHeight: innerHeight,
      viewportWidth: innerWidth,
    }))
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)
    expect(geometry.popoverLeft).toBeGreaterThanOrEqual(0)
    expect(geometry.popoverRight).toBeLessThanOrEqual(geometry.viewportWidth)
    expect(geometry.popoverBottom).toBeLessThanOrEqual(geometry.viewportHeight)
    expect(geometry.popoverWidth).toBeLessThanOrEqual(geometry.viewportWidth - 64)
    expect(geometry.rowOverflow).toBe(false)
    await page.screenshot({
      animations: 'disabled',
      path: path.join(screenshotsDir, `generation-comparison-${viewport.width}.png`),
    })
    await dialog.press('Escape')
    await expect(dialog).toBeHidden()
  }
})
