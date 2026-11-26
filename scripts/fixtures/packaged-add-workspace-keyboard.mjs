/** Follow keyboard focus across the renderer and KDE directory chooser. */
import { appendFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect } from '@playwright/test'

import { connectNativeInput } from './packaged-home-recovery-keyboard.mjs'
import { driveKdeDirectoryChooser } from './packaged-kde-chooser.mjs'

const name = 'Add Workspace'
const colorLabel = 'Violet'
export const keyboardWorkspaceColor = 'violet'

async function accessibleDialogs(page) {
  const session = await page.context().newCDPSession(page)
  try {
    const { nodes } = await session.send('Accessibility.getFullAXTree')
    return nodes
      .filter((node) => !node.ignored && node.role?.value === 'dialog' && node.name?.value === name)
      .map((node) => ({
        name: node.name.value,
        modal: node.properties?.find((property) => property.name === 'modal')?.value.value ?? null,
      }))
  } finally {
    await session.detach()
  }
}

async function focusOf(locator) {
  return await locator.evaluate((element) => {
    const active = document.activeElement
    return {
      active: active === element,
      visible: active === element && active.matches(':focus-visible'),
      windowFocused: document.hasFocus(),
      activeTag: active?.tagName ?? null,
      activeLabel: active?.getAttribute('aria-label') ?? null,
    }
  })
}

export async function qualifyAddWorkspaceKeyboard({ root, state, displayName }) {
  const { page } = state
  const opener = page
    .getByRole('region', { exact: true, name: 'Home' })
    .getByRole('button', { exact: true, name })
  const dialog = page.getByRole('dialog', { exact: true, name })
  const draft = dialog.getByRole('textbox', { exact: true, name: 'Workspace name' })
  const color = dialog.getByLabel('Workspace color', { exact: true })
  const submit = dialog.getByRole('button', { exact: true, name: 'Choose Folder and Add' })
  const trace = path.join(root, 'add-workspace-keyboard.ndjson')
  const screenshot = (phase) =>
    page.screenshot({
      path: path.join(root, `add-workspace-keyboard-${phase}.png`),
      animations: 'disabled',
    })
  await writeFile(trace, '', { flag: 'wx', mode: 0o600 })
  const record = (event) => appendFile(trace, JSON.stringify(event) + '\n')
  const input = await connectNativeInput(state, record, root)
  await input.resize(900, 620)

  const issues = []
  const check = (condition, message) => {
    if (!condition) issues.push(message)
  }
  async function reach(locator, phase) {
    await expect(locator).toBeVisible()
    for (let count = 0; count < 48 && !(await focusOf(locator)).active; count++) {
      await input.press('Tab', phase)
    }
    await expect(locator).toBeFocused()
  }
  async function observeReturn(locator, phase) {
    await expect(locator)
      .toBeFocused({ timeout: 2000 })
      .catch(() => {})
    const focus = await focusOf(locator)
    await record({ phase, focus })
    check(
      focus.active && focus.visible && focus.windowFocused,
      phase + ': visible focus did not return',
    )
    return focus
  }
  async function openAndPrepare() {
    await reach(opener, 'reach-add-workspace')
    await input.press('Return', 'open-add-workspace')
    await expect(dialog).toBeVisible()
    await draft.fill(displayName)
    await color.click()
    await page.getByText(colorLabel, { exact: true }).click()
    await expect(color).toContainText(colorLabel)
    await expect(submit).toBeEnabled()
  }
  async function cancelPicker(origin, target) {
    await reach(target, 'reach-picker-' + origin)
    const choice = await driveKdeDirectoryChooser({
      state,
      windowTitle: name,
      activate: () => input.press('Return', 'open-picker-' + origin),
    })
    await expect(submit).toBeEnabled()
    await expect(draft).toHaveValue(displayName)
    await expect(color).toContainText(colorLabel)
    const focus = await observeReturn(target, 'return-' + origin)
    await screenshot('return-' + origin)
    return { choice, focus }
  }

  await openAndPrepare()
  const ariaModal = await dialog.getAttribute('aria-modal')
  const accessibility = await accessibleDialogs(page)
  check(ariaModal === 'true', 'Add Workspace lacks aria-modal=true')
  check(
    accessibility.length === 1 && accessibility[0].modal === true,
    'Chromium does not expose one modal Add Workspace dialog',
  )
  await record({ phase: 'modal-semantics', ariaModal, accessibility })
  await screenshot('open')

  const fromName = await cancelPicker('name', draft)
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true)
  await input.press('Escape', 'escape-add-workspace')
  await expect(dialog).toBeHidden()
  const openerFocus = await observeReturn(opener, 'return-to-home-opener')
  await screenshot('escaped')

  await openAndPrepare()
  const fromSubmit = await cancelPicker('submit', submit)
  const result = {
    ariaModal,
    accessibility,
    issues,
    draft: { displayName, color: keyboardWorkspaceColor },
    returns: { name: fromName.focus, submit: fromSubmit.focus, opener: openerFocus },
  }
  await writeFile(
    path.join(root, 'add-workspace-keyboard.json'),
    JSON.stringify(result, null, 2) + '\n',
    {
      flag: 'wx',
      mode: 0o600,
    },
  )
  return { result, chooser: [fromName.choice, fromSubmit.choice] }
}
