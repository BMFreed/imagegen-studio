/** Exercise the stock Updates dialog through trusted native keyboard input. */
import assert from 'node:assert/strict'
import { appendFile, lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect } from '@playwright/test'

import { connectNativeInput } from './packaged-home-recovery-keyboard.mjs'
import { assertOfflineProjectDesktop } from './packaged-noobai-import-chooser.mjs'

const scenario = 'application-updates-keyboard'
const suite = 'packaged-application-updates-keyboard'

async function readFocus(page) {
  return await page.evaluate(() => {
    const node = document.activeElement
    return {
      tag: node?.tagName ?? null,
      name: node?.getAttribute('aria-label') ?? node?.textContent?.trim().slice(0, 120) ?? null,
      dialog: node?.closest('[role=dialog]')?.getAttribute('aria-label') ?? null,
      visible: node?.matches(':focus-visible') ?? false,
    }
  })
}

async function readAccessibleDialog(page, name) {
  const session = await page.context().newCDPSession(page)
  try {
    const { nodes } = await session.send('Accessibility.getFullAXTree')
    const node = nodes.find(
      (entry) => !entry.ignored && entry.role?.value === 'dialog' && entry.name?.value === name,
    )
    return node
      ? {
          name: node.name.value,
          role: node.role.value,
          modal:
            node.properties?.find((property) => property.name === 'modal')?.value.value ?? null,
        }
      : null
  } finally {
    await session.detach()
  }
}

async function sampleContrast(locator) {
  const sample = await locator.evaluate((element) => {
    const backgrounds = []
    const style = getComputedStyle(element)
    for (let node = element; node; node = node.parentElement) {
      const background = getComputedStyle(node).backgroundColor
      if (background !== 'rgba(0, 0, 0, 0)') backgrounds.push(background)
      if (background.startsWith('rgb(')) break
    }
    return {
      text: element.textContent.trim(),
      foreground: style.color,
      fontSize: style.fontSize,
      backgrounds,
    }
  })
  function over(back, color) {
    const parts = /^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)$/.exec(color)
    assert.ok(parts, color)
    const alpha = Number(parts[4] ?? 1)
    return back.map((channel, index) => channel * (1 - alpha) + Number(parts[index + 1]) * alpha)
  }
  function luminance(rgb) {
    const [red, green, blue] = rgb.map((value) => {
      const channel = value / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return red * 0.2126 + green * 0.7152 + blue * 0.0722
  }
  assert.match(sample.backgrounds.at(-1), /^rgb\(/)
  const background = sample.backgrounds.reduceRight(over, [0, 0, 0])
  const luminances = [luminance(background), luminance(over(background, sample.foreground))]
  return {
    ...sample,
    ratio: (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05),
  }
}

export async function runPackagedApplicationUpdatesKeyboard({
  root,
  appData,
  ownedRunRoot,
  packageBefore,
  launch,
  closeNormally,
  identity,
}) {
  const strict = process.env.IMAGEGEN_APPLICATION_UPDATES_KEYBOARD_STRICT
  assert.ok(strict === undefined || strict === '1')
  const proofPath = path.join(path.dirname(root), 'package-proof.json')
  assert.equal(await realpath(proofPath), proofPath)
  const proof = JSON.parse(await readFile(proofPath, 'utf8'))
  assert.equal(proof.schemaVersion, 1)
  assert.ok(proof.package.path.startsWith(ownedRunRoot + path.sep))
  await assertOfflineProjectDesktop({
    root,
    ownedRunRoot,
    packageBefore,
    expectedPackage: proof.package,
    scenario,
    suite,
  })
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  await assert.rejects(lstat(appData), { code: 'ENOENT' })

  const tracePath = path.join(root, 'application-updates-keyboard.ndjson')
  await writeFile(tracePath, '', { flag: 'wx', mode: 0o600 })
  const record = async (entry) => await appendFile(tracePath, JSON.stringify(entry) + '\n')
  const state = await launch('application-updates-keyboard')
  const { page } = state
  const help = page.getByRole('button', { exact: true, name: 'Help menu' })
  const option = page.getByText('Check for Updates…', { exact: true })
  const dialogName = 'Application Updates'
  const dialog = page.getByRole('dialog', { exact: true, name: dialogName })
  const unavailable = dialog.getByText('Updates unavailable', { exact: true })
  const unavailableCopy = dialog.getByText('Update checking is not available in this build.', {
    exact: true,
  })
  const close = dialog.getByRole('button', { exact: true, name: 'Close' })
  const checkAgain = dialog.getByRole('button', { exact: true, name: 'Check again' })
  const issues = []
  const dwell = []
  let measurements
  let ariaModal
  let accessibleDialog
  let actionGeometry
  let openingFocus
  let failure

  async function screenshot(name) {
    await page.screenshot({ path: path.join(root, name + '.png'), animations: 'disabled' })
  }
  function check(condition, message) {
    if (!condition) issues.push(message)
  }

  try {
    const input = await connectNativeInput(state, record, root)
    await input.resize(900, 620)
    async function openKeyboard() {
      for (let count = 0; count < 60; count++) {
        if (await help.evaluate((element) => document.activeElement === element)) break
        await input.press('Tab', 'reach-help')
      }
      await expect(help).toBeFocused()
      check(
        (await readFocus(page)).visible,
        'The keyboard-focused Help trigger lacks focus-visible.',
      )
      await input.press('Return', 'open-help')
      await expect(option).toBeVisible()
      await input.press('Down', 'select-updates-menu-option')
      await input.press('Return', 'open-application-updates')
      await expect(dialog).toBeVisible()
      await expect(unavailable).toBeVisible()
      await expect(unavailableCopy).toBeVisible()
      await expect(checkAgain).toBeEnabled()
      await expect(dialog.getByRole('button')).toHaveCount(2)
    }
    async function returnedToHelp(choice) {
      await expect(dialog).toBeHidden()
      await expect(help)
        .toBeFocused({ timeout: 2_000 })
        .catch(() => {})
      const focus = await readFocus(page)
      const returned = await help.evaluate((element) => element === document.activeElement)
      await record({ phase: 'after-dismissal', choice, focus, returned })
      check(returned && focus.visible, `${choice} does not restore visible focus to Help.`)
      await screenshot(`updates-after-${choice}`)
    }

    await openKeyboard()
    ariaModal = await dialog.getAttribute('aria-modal')
    accessibleDialog = await readAccessibleDialog(page, dialogName)
    openingFocus = await readFocus(page)
    check(ariaModal === 'true', 'The modal dialog lacks aria-modal=true.')
    check(
      accessibleDialog?.modal === true,
      'Chromium accessibility does not expose Updates as modal.',
    )
    check(
      openingFocus.dialog === dialogName,
      'Opening Updates leaves keyboard focus outside the dialog.',
    )
    measurements = await Promise.all(
      [unavailable, unavailableCopy, close, checkAgain].map(sampleContrast),
    )
    for (const sample of measurements) {
      check(sample.ratio >= 4.5, `Text contrast for "${sample.text}" is below 4.5:1.`)
    }
    actionGeometry = await Promise.all(
      [close, checkAgain].map((locator) =>
        locator.evaluate((element) => {
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
    check(
      actionGeometry.every((item) => item.fullyVisible),
      'An Updates action is clipped at the native minimum size.',
    )
    await record({
      phase: 'updates-open',
      ariaModal,
      accessibleDialog,
      openingFocus,
      measurements,
      actionGeometry,
    })
    await screenshot('updates-900x620')

    for (const [key, phase] of [
      ['Tab', 'updates-tab-1'],
      ['Tab', 'updates-tab-2'],
      ['shift+Tab', 'updates-reverse-tab-1'],
      ['shift+Tab', 'updates-reverse-tab-2'],
    ]) {
      await input.press(key, phase)
      const focus = await readFocus(page)
      dwell.push({ key, focus })
      check(
        focus.dialog === dialogName &&
          focus.visible &&
          ['Close', 'Check again'].includes(focus.name),
        `Focus escapes or becomes invisible during ${phase}.`,
      )
    }
    for (const [first, second] of [
      [0, 1],
      [2, 3],
    ]) {
      check(
        new Set([dwell[first].focus.name, dwell[second].focus.name]).size === 2,
        `The keyboard focus cycle does not visit both actions in the ${first ? 'reverse' : 'forward'} direction.`,
      )
    }
    await screenshot('updates-keyboard-focus-900x620')
    await input.press('Escape', 'dismiss-escape')
    await returnedToHelp('escape')

    await openKeyboard()
    for (let count = 0; count < 3; count++) {
      if (await close.evaluate((element) => document.activeElement === element)) break
      await input.press('Tab', 'reach-close')
    }
    if (await close.evaluate((element) => document.activeElement === element)) {
      await input.press('Return', 'dismiss-close-button')
      await returnedToHelp('close')
    } else {
      issues.push('The Close action cannot be reached from the dialog with three Tabs.')
      await screenshot('updates-close-unreachable')
      await input.press('Escape', 'fallback-dismiss-unreachable-close')
      await expect(dialog).toBeHidden()
    }
  } catch (error) {
    failure = String(error)
    await screenshot('updates-investigation-stopped').catch(() => {})
  } finally {
    await closeNormally(state)
  }
  const proofAfter = await identity(packageBefore.path)
  assert.deepEqual(proofAfter, packageBefore)
  const result = {
    issues,
    failure: failure ?? null,
    package: proofAfter,
    ariaModal,
    accessibleDialog,
    openingFocus,
    measurements,
    actionGeometry,
    dwell,
    nativePhysicalExit: state.normalPhysicalExit,
  }
  await writeFile(
    path.join(root, 'application-updates-keyboard.json'),
    JSON.stringify(result, null, 2) + '\n',
    {
      flag: 'wx',
      mode: 0o600,
    },
  )
  assert.equal(failure, undefined, 'Updates observation could not finish. See the native trace.')
  if (strict) assert.deepEqual(issues, [])
  return result
}
