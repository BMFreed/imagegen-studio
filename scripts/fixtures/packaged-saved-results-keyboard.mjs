/** Keyboard-only Saved generations modal acceptance in the stock Wayland AppImage. */
import { appendFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect } from '@playwright/test'

import { connectNativeInput } from './packaged-home-recovery-keyboard.mjs'

const name = 'Saved generations'

async function accessibleDialog(page) {
  const session = await page.context().newCDPSession(page)
  try {
    const { nodes } = await session.send('Accessibility.getFullAXTree')
    return nodes
      .filter((node) => !node.ignored && node.role?.value === 'dialog' && node.name?.value === name)
      .map((node) => ({
        name: node.name.value,
        role: node.role.value,
        modal: node.properties?.find((property) => property.name === 'modal')?.value.value ?? null,
      }))
  } finally {
    await session.detach()
  }
}

async function focused(locator) {
  return await locator.evaluate((element) => ({
    active: document.activeElement === element,
    visible: element.matches(':focus-visible'),
  }))
}

export async function qualifySavedResultsKeyboard(state, root, expectedRows) {
  const { page } = state
  const opener = page.getByRole('button', { name: 'Open saved generations', exact: true })
  const dialog = page.getByRole('dialog', { name, exact: true })
  const list = dialog.getByRole('list', { name, exact: true })
  const refresh = dialog.getByRole('button', { name: 'Refresh saved generations', exact: true })
  const close = dialog.getByRole('button', { name: 'Close', exact: true })
  const firstResult = list.getByRole('button').first()
  const trace = path.join(root, 'saved-results-keyboard.ndjson')
  const screenshot = async (filename) =>
    await page.screenshot({ path: path.join(root, filename + '.png'), animations: 'disabled' })
  await writeFile(trace, '', { flag: 'wx', mode: 0o600 })
  const record = async (event) => await appendFile(trace, JSON.stringify(event) + '\n')
  const issues = []
  const check = (condition, issue) => {
    if (!condition) issues.push(issue)
  }
  const input = await connectNativeInput(state, record, root)
  await input.resize(900, 620)

  async function openKeyboard(choice) {
    await expect(opener).toBeVisible()
    for (let count = 0; count < 64 && !(await focused(opener)).active; count++) {
      await input.press('Tab', 'reach-history-opener')
    }
    await expect(opener).toBeFocused()
    check((await focused(opener)).visible, choice + ': opener focus is invisible')
    await input.press('Return', 'open-history-' + choice)
    await expect(dialog).toBeVisible()
    await expect(list).toHaveAttribute('aria-busy', 'false')
    await expect(list.getByRole('listitem')).toHaveCount(expectedRows)
    await expect(refresh).toBeEnabled()
    await expect(firstResult).toBeEnabled()
    await expect(close).toBeEnabled()
  }

  async function assertFocus(locator, key, phase) {
    await input.press(key, phase)
    const focus = await focused(locator)
    await record({ phase: 'expected-focus', choice: phase, focus })
    check(focus.active && focus.visible, phase + ': expected visible focus was not reached')
    return focus.active
  }

  async function dismissed(choice) {
    await expect(dialog).toBeHidden()
    await expect(opener)
      .toBeFocused({ timeout: 2_000 })
      .catch(() => {})
    const focus = await focused(opener)
    await record({ phase: 'dismissal', choice, focus })
    check(focus.active && focus.visible, choice + ': opener did not regain visible focus')
    await screenshot('saved-results-after-' + choice)
  }

  await openKeyboard('escape')
  const ariaModal = await dialog.getAttribute('aria-modal')
  const accessibility = await accessibleDialog(page)
  const focusInside = await dialog.evaluate((element) => element.contains(document.activeElement))
  const closeGeometry = await close.evaluate((element) => {
    const { top, right, bottom, left, width, height } = element.getBoundingClientRect()
    return {
      viewport: [innerWidth, innerHeight],
      close: [left, top, width, height],
      closeFullyVisible: top >= 0 && left >= 0 && right <= innerWidth && bottom <= innerHeight,
    }
  })
  const scroller = await dialog.locator('.history-scroll').evaluate((element) => {
    const { top, bottom, left, right } = element.getBoundingClientRect()
    return {
      bottom,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
      fullyVisible: top >= 0 && left >= 0 && bottom <= innerHeight && right <= innerWidth,
    }
  })
  const geometry = { ...closeGeometry, scroller }
  check(ariaModal === 'true', 'Saved generations lacks aria-modal=true')
  check(
    accessibility.length === 1 && accessibility[0].modal === true,
    'Chromium does not expose one modal Saved generations dialog',
  )
  check(focusInside, 'Opening Saved generations leaves focus outside')
  check(geometry.closeFullyVisible, 'Close is clipped at the native minimum window size')
  check(
    scroller.fullyVisible &&
      scroller.clientHeight > 0 &&
      scroller.scrollHeight > scroller.clientHeight &&
      ['auto', 'scroll'].includes(scroller.overflowY) &&
      scroller.bottom <= geometry.close[1],
    'Saved results do not scroll within the visible area above Close',
  )
  await record({ phase: 'history-open', ariaModal, accessibility, focusInside, geometry })
  await screenshot('saved-results-open-900x620')

  for (let count = 0; count < expectedRows + 2 && !(await focused(refresh)).active; count++) {
    await input.press('Tab', 'reach-history-refresh')
  }
  check((await focused(refresh)).active, 'The first action cannot be reached with Tab')
  await assertFocus(close, 'shift+Tab', 'reverse-wrap-to-close')
  await screenshot('saved-results-close-focus-900x620')
  await assertFocus(refresh, 'Tab', 'forward-wrap-to-refresh')
  await assertFocus(firstResult, 'Tab', 'tab-to-first-result')
  await assertFocus(refresh, 'shift+Tab', 'reverse-tab-to-refresh')
  await input.press('Escape', 'dismiss-history-escape')
  await dismissed('escape')

  await openKeyboard('close')
  if (!(await focused(refresh)).active) {
    // The first Tab enters the modal's first action from its focusable container.
    await assertFocus(refresh, 'Tab', 'reach-refresh-for-close')
  }
  if (await assertFocus(close, 'shift+Tab', 'reach-close-button')) {
    await input.press('Return', 'activate-history-close')
    await dismissed('close')
  } else {
    await input.press('Escape', 'dismiss-history-close-fallback')
    await expect(dialog).toBeHidden()
  }

  const result = { issues, ariaModal, accessibility, focusInside, geometry, expectedRows }
  await writeFile(
    path.join(root, 'saved-results-keyboard.json'),
    JSON.stringify(result, null, 2) + '\n',
    {
      flag: 'wx',
      mode: 0o600,
    },
  )
  return result
}
