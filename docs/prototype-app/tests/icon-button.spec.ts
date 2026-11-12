import { expect, type Page, test } from '@playwright/test'

type DemoState = {
  badgeValue: number | undefined
  clicks: number
  compact: boolean
  disabled: boolean
  loading: boolean
  pressed: boolean
}

type DemoGlobal = { iconButtonDemo?: DemoState } & typeof globalThis

async function mountIconButton(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    const vueModule = '/@id/vue'
    const iconModule = '/src/components/IconButton.vue'
    const iconsModule = '/@id/@vicons/tabler'
    const [{ createApp, h, reactive }, { default: IconButton }, { Settings }] = await Promise.all([
      import(vueModule),
      import(iconModule),
      import(iconsModule),
    ])

    const host = document.createElement('div')
    host.dataset['testid'] = 'icon-button-demo'
    host.style.cssText =
      'position:fixed;left:200px;top:200px;width:34px;height:34px;overflow:hidden;font-size:9px;z-index:1000'
    document.body.append(host)

    const state: DemoState = reactive({
      badgeValue: 1,
      clicks: 0,
      compact: false,
      disabled: false,
      loading: false,
      pressed: false,
    })
    ;(globalThis as DemoGlobal).iconButtonDemo = state

    createApp({
      setup: () => () =>
        h(IconButton, {
          badge: { dot: true, value: state.badgeValue },
          compact: state.compact,
          disabled: state.disabled,
          icon: Settings,
          label: 'Inspect layer',
          loading: state.loading,
          onClick: () => state.clicks++,
          pressed: state.pressed,
          tooltip: 'Inspect the current layer',
        }),
    }).mount(host)
  })
  await expect(
    page.getByTestId('icon-button-demo').getByRole('button', { name: 'Inspect layer' }),
  ).toBeVisible()
}

async function updateDemo(page: Page, next: Partial<DemoState>) {
  await page.evaluate((patch) => {
    Object.assign((globalThis as DemoGlobal).iconButtonDemo!, patch)
  }, next)
}

test('keeps the existing chrome action named and gives it the default tooltip', async ({
  page,
}) => {
  await page.goto('/')
  const settings = page.getByRole('button', { exact: true, name: 'Settings' })
  await expect(settings).toBeVisible()
  await settings.hover()
  await expect(page.getByText('Settings', { exact: true })).toBeVisible()
})

test('keeps action and glyph sizes stable in normal and compact layouts', async ({ page }) => {
  await mountIconButton(page)
  const button = page.getByTestId('icon-button-demo').getByRole('button', { name: 'Inspect layer' })

  for (const [compact, expectedHitSize] of [
    [false, 32],
    [true, 24],
  ] as const) {
    await updateDemo(page, { compact })
    await expect.poll(async () => (await button.boundingBox())?.width).toBe(expectedHitSize)
    const boxes = await button.evaluate((element) => {
      const icon = element.querySelector('.n-button__icon')
      const glyph = element.querySelector('.n-icon')
      if (!icon || !glyph) {
        throw new Error('Icon allocation is missing')
      }
      const actionRect = element.getBoundingClientRect()
      const iconRect = icon.getBoundingClientRect()
      const glyphRect = glyph.getBoundingClientRect()
      return {
        action: {
          height: actionRect.height,
          width: actionRect.width,
          x: actionRect.x,
          y: actionRect.y,
        },
        glyph: { height: glyphRect.height, width: glyphRect.width },
        icon: { height: iconRect.height, width: iconRect.width, x: iconRect.x, y: iconRect.y },
      }
    })
    expect(boxes.action.height).toBe(expectedHitSize)
    expect(boxes.icon.width).toBe(18)
    expect(boxes.icon.height).toBe(18)
    expect(boxes.glyph.width).toBe(18)
    expect(boxes.glyph.height).toBe(18)
    expect(Math.abs(boxes.icon.x + 9 - boxes.action.x - expectedHitSize / 2)).toBeLessThan(0.6)
    expect(Math.abs(boxes.icon.y + 9 - boxes.action.y - expectedHitSize / 2)).toBeLessThan(0.6)
  }
})

test('shows a portal tooltip on hover and focus, including when disabled', async ({ page }) => {
  await mountIconButton(page)
  const host = page.getByTestId('icon-button-demo')
  const button = host.getByRole('button', { name: 'Inspect layer' })
  const tooltip = page.getByText('Inspect the current layer', { exact: true })

  await button.hover()
  await expect(tooltip).toBeVisible()
  expect(
    await tooltip.evaluate((element) => element.closest('[data-testid="icon-button-demo"]')),
  ).toBeNull()
  await page.mouse.move(400, 400)
  await expect(tooltip).toBeHidden()

  await button.focus()
  await expect(tooltip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tooltip).toBeHidden()

  await updateDemo(page, { disabled: true })
  await expect(button).toBeDisabled()
  await button.hover()
  await expect(tooltip).toBeVisible()
  await page.mouse.move(400, 400)
  const unavailableFocusTarget = host.getByRole('group', { name: 'Inspect layer' })
  await expect(unavailableFocusTarget).toHaveAttribute('aria-disabled', 'true')
  await unavailableFocusTarget.focus()
  await expect(tooltip).toBeVisible()
  await page.keyboard.press('Space')
  expect(await page.evaluate(() => (globalThis as DemoGlobal).iconButtonDemo!.clicks)).toBe(0)

  await updateDemo(page, { disabled: false, loading: true })
  await expect(button).not.toBeDisabled()
  await button.focus()
  await expect(button).toBeFocused()
  await expect(tooltip).toBeVisible()
})

test('a focused tooltip lets the user click the neighboring action underneath it', async ({
  page,
}) => {
  await mountIconButton(page)
  const trigger = page
    .getByTestId('icon-button-demo')
    .getByRole('button', { name: 'Inspect layer' })
  await trigger.focus()
  const tooltip = page.getByText('Inspect the current layer', { exact: true })
  await expect(tooltip).toBeVisible()
  const box = await tooltip.boundingBox()
  if (!box) {
    throw new Error('Visible tooltip bounds are unavailable')
  }
  await page.evaluate(
    ({ x, y }) => {
      const neighbor = document.createElement('button')
      neighbor.textContent = 'Neighbor action'
      neighbor.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:32px;height:24px;z-index:1001`
      neighbor.addEventListener('click', () => {
        neighbor.dataset['clicked'] = 'true'
      })
      document.body.append(neighbor)
    },
    { x: box.x + box.width / 2 - 16, y: box.y + box.height / 2 - 12 },
  )
  await expect(trigger).toBeFocused()
  const neighbor = page.getByRole('button', { exact: true, name: 'Neighbor action' })
  await neighbor.click({ timeout: 2000 })
  await expect(neighbor).toHaveAttribute('data-clicked', 'true')
  await expect(neighbor).toBeFocused()
  await expect(tooltip).toBeHidden()
})

test('forwards one action and exposes pressed, loading, disabled and badge states', async ({
  page,
}) => {
  await mountIconButton(page)
  const button = page.getByTestId('icon-button-demo').getByRole('button', { name: 'Inspect layer' })

  await button.focus()
  await button.press('Space')
  expect(await page.evaluate(() => (globalThis as DemoGlobal).iconButtonDemo!.clicks)).toBe(1)

  await updateDemo(page, { pressed: true })
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await updateDemo(page, { loading: true })
  await expect(button).toHaveAttribute('aria-busy', 'true')
  await button.click()
  expect(await page.evaluate(() => (globalThis as DemoGlobal).iconButtonDemo!.clicks)).toBe(1)

  await updateDemo(page, { badgeValue: 0, disabled: true, loading: false })
  await expect(button).toBeDisabled()
  await button.evaluate((element) => (element as HTMLButtonElement).click())
  expect(await page.evaluate(() => (globalThis as DemoGlobal).iconButtonDemo!.clicks)).toBe(1)
  await expect(page.getByTestId('icon-button-demo').locator('.n-badge-sup')).toHaveCount(0)
})
