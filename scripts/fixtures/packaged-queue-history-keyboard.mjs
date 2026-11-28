/** Exercise stock Queue Manager history choices through trusted compositor keys. */
import assert from 'node:assert/strict'
import { appendFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect } from '@playwright/test'

import { connectNativeInput } from './packaged-home-recovery-keyboard.mjs'

const managerName = 'Queue Manager'
const confirmationName = 'Clear queue history'
const launcherName = 'Open Queue Manager'
const choices = {
  completed: { option: 'Completed jobs', scope: 'completed' },
  'failed-or-canceled': { option: 'Failed and canceled jobs', scope: 'failed and canceled' },
}
const availableChoices = ['Completed jobs', 'Failed and canceled jobs', 'All terminal jobs']

async function readFocus(page) {
  return await page.evaluate(() => {
    const element = document.activeElement
    if (!(element instanceof HTMLElement)) return null
    const rect = element.getBoundingClientRect()
    return {
      dialog: element.closest('[role="dialog"]')?.getAttribute('aria-label') ?? null,
      enabled: !element.matches(':disabled'),
      focusVisible: element.matches(':focus-visible'),
      hasFocus: document.hasFocus(),
      name: element.getAttribute('aria-label') ?? element.textContent?.trim(),
      rendered: rect.height > 0 && rect.width > 0,
      tag: element.tagName,
    }
  })
}

async function expectButtonFocus(page, dialog, labels, observation) {
  let focus
  await expect
    .poll(
      async () => {
        focus = await readFocus(page)
        return focus
      },
      { message: observation },
    )
    .toMatchObject({
      dialog,
      enabled: true,
      focusVisible: true,
      hasFocus: true,
      name: expect.stringMatching(new RegExp(`^(?:${labels.join('|')})$`)),
      rendered: true,
      tag: 'BUTTON',
    })
  return focus
}

async function exactRows(page, manager, ids) {
  const rows = manager.getByTestId('queue-job-row')
  await expect(rows).toHaveCount(ids.length)
  assert.deepEqual(
    await rows.evaluateAll((elements) => elements.map((element) => element.dataset.jobId).sort()),
    [...ids].sort(),
  )
  const response = await page.evaluate(() => window.api.projects.getGenerationQueue())
  assert.equal(response.ok, true, response.error?.message)
  assert.equal(response.value.nextCursor, null)
  assert.deepEqual(response.value.items.map(({ id }) => id).sort(), [...ids].sort())
  if (!ids.length) {
    await expect(manager.getByText('No generation jobs yet', { exact: true })).toBeVisible()
  }
}

async function reachByTab(locator, input, phase) {
  await expect(locator).toBeEnabled()
  for (let count = 0; count < 48; count++) {
    if (await locator.evaluate((element) => element === document.activeElement)) return
    await input.press('Tab', phase)
  }
  await expect(locator).toBeFocused()
}

async function queueKeyboardSession({ expectedIds, name, root, state }) {
  const { page } = state
  const trace = path.join(root, `queue-history-${name}.ndjson`)
  await writeFile(trace, '', { flag: 'wx', mode: 0o600 })
  const record = (entry) => appendFile(trace, JSON.stringify(entry) + '\n')
  const input = await connectNativeInput(state, record, root)
  await input.resize(900, 620)
  const viewport = await page.evaluate(() => ({
    dpr: devicePixelRatio,
    height: innerHeight,
    width: innerWidth,
  }))
  assert.deepEqual(viewport, { dpr: 1, height: 620, width: 900 })
  const manager = page.getByRole('dialog', { exact: true, name: managerName })
  const launcher = page.getByRole('button', { exact: true, name: launcherName })
  await reachByTab(launcher, input, 'reach-queue-launcher')
  await input.press('Return', 'open-queue-manager')
  await expect(manager).toBeVisible()
  await exactRows(page, manager, expectedIds)
  const screenshots = {}
  async function screenshot(label) {
    const filename = path.join(root, `queue-history-${name}-${label}.png`)
    await page.screenshot({ animations: 'disabled', path: filename, scale: 'css' })
    screenshots[label] = filename
  }
  const focus = {}
  async function observe(label, dialog, ...labels) {
    focus[label] = await expectButtonFocus(page, dialog, labels, label)
    await record({ focus: focus[label], phase: label })
  }
  async function closeQueue() {
    await input.press('Escape', 'close-queue-manager')
    await expect(manager).toBeHidden()
    await observe('focus-returned-to-launcher', null, launcherName)
    await screenshot('launcher-restored')
  }
  return {
    closeQueue,
    focus,
    input,
    manager,
    observe,
    page,
    screenshot,
    screenshots,
    trace,
    viewport,
  }
}

export async function runPackagedQueueHistoryKeyboard({
  afterIds,
  assertPreserved,
  assertPruned,
  beforeIds,
  mode,
  root,
  state,
}) {
  const choice = choices[mode]
  assert.ok(choice)
  const removed = beforeIds.filter((id) => !afterIds.includes(id))
  assert.ok(removed.length > 0 && afterIds.every((id) => beforeIds.includes(id)))
  const {
    closeQueue,
    focus,
    input,
    manager,
    observe,
    page,
    screenshot,
    screenshots,
    trace,
    viewport,
  } = await queueKeyboardSession({ expectedIds: beforeIds, name: mode, root, state })
  const trigger = manager.getByRole('button', { exact: true, name: confirmationName })
  const confirmation = page.getByRole('dialog', { exact: true, name: confirmationName })
  const menuOption = (label) =>
    page.locator('.n-dropdown-option-body').filter({ has: page.getByText(label, { exact: true }) })
  const option = menuOption(choice.option)
  const keep = confirmation.getByRole('button', { exact: true, name: 'Keep history' })
  const confirm = confirmation.getByRole('button', { exact: true, name: 'Clear history' })

  async function openMenu(phase) {
    await reachByTab(trigger, input, `${phase}-reach-clear-menu`)
    await input.press('Return', `${phase}-open-clear-menu`)
    for (const label of availableChoices) {
      const visibleChoice = menuOption(label)
      await expect(visibleChoice).toBeVisible()
      if (label === 'Completed jobs' && mode === 'failed-or-canceled') {
        await expect(visibleChoice).toHaveClass(/dropdown-option-body--disabled/)
      } else {
        await expect(visibleChoice).not.toHaveClass(/dropdown-option-body--disabled/)
      }
    }
  }
  async function openConfirmation(phase) {
    await openMenu(phase)
    for (let count = 0; count < availableChoices.length; count++) {
      await input.press('Down', `${phase}-select-status-scope`)
      if (
        await option.evaluate((element) =>
          element.classList.contains('n-dropdown-option-body--pending'),
        )
      ) {
        break
      }
    }
    await expect(option).toHaveClass(/dropdown-option-body--pending/)
    await input.press('Return', `${phase}-open-confirmation`)
    await expect(confirmation).toBeVisible()
    await expect(
      confirmation.getByText(`Remove ${choice.scope} jobs from queue history?`, {
        exact: false,
      }),
    ).toBeVisible()
    await observe(`${phase}-focus-keep`, confirmationName, 'Keep history')
  }
  async function preserve(phase) {
    await expect(confirmation).toBeHidden()
    await expect(option).toBeHidden()
    await expect(manager).toBeVisible()
    await observe(`${phase}-focus-returned-to-clear-menu`, managerName, confirmationName)
    await exactRows(page, manager, beforeIds)
    await assertPreserved()
  }

  try {
    await assertPreserved()
    if (mode === 'completed') {
      await openMenu('menu-escape')
      await screenshot('mixed-scope-menu')
      await input.press('Escape', 'dismiss-only-clear-menu')
      await preserve('menu-escape')
      await screenshot('menu-escape-restored')

      await openConfirmation('confirmation-escape')
      await screenshot('default-safe-focus')
      await input.press('shift+Tab', 'reverse-trap-in-confirmation')
      await observe('reverse-tab-focuses-clear', confirmationName, 'Clear history')
      await input.press('Tab', 'forward-trap-in-confirmation')
      await observe('forward-tab-focuses-keep', confirmationName, 'Keep history')
      await input.press('Escape', 'dismiss-only-confirmation')
      await preserve('confirmation-escape')

      await openConfirmation('keep-history')
      await expect(keep).toBeFocused()
      await input.press('Return', 'activate-keep-history')
      await preserve('keep-history')
      await screenshot('keep-history-restored')
    }

    await openConfirmation('confirm')
    await input.press('Tab', 'choose-clear-history')
    await observe('confirm-focuses-clear', confirmationName, 'Clear history')
    await expect(confirm).toBeFocused()
    await input.press('Return', 'activate-clear-history')
    await expect(confirmation).toBeHidden()
    await expect(manager).toBeVisible()
    await exactRows(page, manager, afterIds)
    const notice = `Removed ${removed.length} jobs from queue history.`
    await expect(manager.getByText(notice, { exact: true })).toBeVisible()
    await assertPruned()
    await observe(
      'confirmed-clear-keeps-queue-focus',
      managerName,
      'Close Queue Manager',
      'Refresh',
      confirmationName,
    )
    await screenshot('after-exact-clear')
    await closeQueue()
    return { afterIds, beforeIds, focus, mode, removed, screenshots, trace, viewport }
  } catch (error) {
    await screenshot('failure').catch(() => {})
    throw error
  }
}

export async function inspectPackagedQueueHistoryKeyboard({ expectedIds, root, state }) {
  const session = await queueKeyboardSession({ expectedIds, name: 'cold-empty', root, state })
  const { closeQueue, focus, screenshot, screenshots, trace, viewport } = session
  await screenshot('history')
  await closeQueue()
  return { expectedIds, focus, screenshots, trace, viewport }
}
