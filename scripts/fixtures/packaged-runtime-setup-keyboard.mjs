/** Drive the signed, unconsumed runtime review with a private compositor keyboard. */
import assert from 'node:assert/strict'
import { appendFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect } from '@playwright/test'

import { connectNativeInput } from './packaged-home-recovery-keyboard.mjs'
import { waitForRuntimeSetupEntry } from './packaged-runtime-setup-ui.mjs'

export async function runPackagedRuntimeSetupKeyboard({ root, state, review, noConsentWrites }) {
  const page = state.page
  const trace = path.join(root, 'setup-review-keyboard.ndjson')
  await writeFile(trace, '', { flag: 'wx', mode: 0o600 })
  const record = (entry) => appendFile(trace, JSON.stringify(entry) + '\n')
  const screenshot = (name) =>
    page.screenshot({ path: path.join(root, `setup-${name}.png`), animations: 'disabled' })
  const title = 'Set up image generation'
  const dialog = page.getByRole('dialog', { name: title, exact: true })
  const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true })
  const install = dialog.getByRole('button', { name: 'Install', exact: true })
  const opener = await waitForRuntimeSetupEntry(page, 'install')
  const focused = (locator) => locator.evaluate((element) => element.matches(':focus-visible'))
  const input = await connectNativeInput(state, record, root)

  async function openReview() {
    for (let index = 0; index < 35 && !(await focused(opener)); index++) {
      await input.press('Tab', 'reach-setup')
    }
    await expect(opener).toBeFocused()
    assert.equal(await focused(opener), true)
    await input.press('Return', 'open-setup')
    await expect(dialog).toBeVisible()
    await expect(install).toBeEnabled()
    await expect(dialog.getByText(review.releaseId, { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button')).toHaveCount(2)
    await noConsentWrites()
  }

  async function returnedToSetup(choice) {
    await expect(dialog).toBeHidden()
    await expect(opener).toBeEnabled()
    await expect(opener).toBeFocused()
    const focusVisible = await focused(opener)
    assert.equal(focusVisible, true)
    const outline = await opener.evaluate((element) => {
      const { outlineColor, outlineStyle, outlineWidth } = getComputedStyle(element)
      return { color: outlineColor, style: outlineStyle, width: outlineWidth }
    })
    assert.equal(outline.style, 'solid')
    assert.equal(outline.width, '2px')
    await noConsentWrites()
    await record({ phase: 'after-dismissal', choice, focusVisible, outline })
    await screenshot(`after-${choice}`)
    return { choice, focusVisible, outline }
  }

  try {
    await input.resize(900, 620)
    await openReview()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    const session = await page.context().newCDPSession(page)
    let accessibility
    try {
      const { nodes } = await session.send('Accessibility.getFullAXTree')
      const matches = nodes.filter(
        (node) => !node.ignored && node.role?.value === 'dialog' && node.name?.value === title,
      )
      assert.equal(matches.length, 1)
      accessibility = {
        role: matches[0].role.value,
        name: matches[0].name.value,
        modal: matches[0].properties?.find(({ name }) => name === 'modal')?.value.value,
      }
      assert.equal(accessibility.modal, true)
    } finally {
      await session.detach()
    }

    const geometry = await Promise.all(
      [cancel, install].map((button) =>
        button.evaluate((element) => {
          const { x, y, width, height } = element.getBoundingClientRect()
          return {
            name: element.textContent.trim(),
            x,
            y,
            width,
            height,
            fullyVisible: x >= 0 && y >= 0 && x + width <= innerWidth && y + height <= innerHeight,
          }
        }),
      ),
    )
    assert.ok(
      geometry.every((action) => action.fullyVisible),
      JSON.stringify(geometry),
    )
    await record({ phase: 'review-open', accessibility, geometry })
    await screenshot('review-900x620')
    await expect(cancel).toBeFocused()
    assert.equal(await focused(cancel), true)
    const dwell = []
    for (const [key, expected] of [
      ['Tab', 'Install'],
      ['Tab', 'Cancel'],
      ['shift+Tab', 'Install'],
      ['shift+Tab', 'Cancel'],
    ]) {
      const after = await input.press(key, 'review-focus-cycle')
      assert.equal(after.name, expected)
      assert.equal(after.dialog, title)
      assert.equal(after.focusVisible, true)
      dwell.push({ key, action: after.name, focusVisible: after.focusVisible })
    }
    await screenshot('review-focus-900x620')
    await input.press('Escape', 'dismiss-escape')
    const escape = await returnedToSetup('escape')
    await openReview()
    await expect(cancel).toBeFocused()
    await input.press('Return', 'dismiss-cancel')
    const canceled = await returnedToSetup('cancel')

    return { accessibility, geometry, dwell, escape, canceled }
  } catch (error) {
    await screenshot('review-stopped').catch(() => {})
    throw error
  }
}
