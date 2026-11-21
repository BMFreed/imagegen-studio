/** Keyboard-only Home / Recovery navigation in an isolated stock AppImage. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect } from '@playwright/test'

import { readIgsPackage } from '../../src/main/projects/igs-package.ts'
import { rawPathDerivedProjectRecoveryKey } from '../../src/main/projects/project-identity.ts'
import { ProjectShadowStore } from '../../src/main/projects/project-shadow.ts'
import { parseProjectDocumentV1 } from '../../src/shared/projects/project-schema.ts'
import {
  assertOpened,
  assertOriginalBytes,
  indexSnapshot,
  regularFile,
  verifyChooserFixture,
} from './packaged-noobai-import-chooser.mjs'

const execute = promisify(execFile)
const title = 'Packaged trained noobai-v'
const filename = 'Home keyboard recovery.igs'
const dialogName = 'Recovery available'
const actionNames = ['Cancel', 'Discard Recovery and Open Saved', 'Recover']
const selection = (page) => page.getByRole('button', { name: `Select ${title}`, exact: true })
const recoveryDialog = (page) => page.getByRole('dialog', { name: dialogName, exact: true })
const xdo = async (...args) =>
  (await execute('/usr/bin/xdotool', args, { timeout: 5_000 })).stdout.trim()

async function activeFocus(page) {
  return await page.evaluate(() => {
    const element = document.activeElement
    if (!element) return null
    return {
      tag: element.tagName,
      name: element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 120),
      role: element.getAttribute('role'),
      focusVisible: element.matches(':focus-visible'),
      outline: getComputedStyle(element).outlineStyle,
      dialog: element.closest('[role=dialog]')?.getAttribute('aria-label') ?? null,
    }
  })
}

async function connectNativeInput(state, record) {
  const pid = String(state.mainPid)
  assert.match(pid, /^[1-9]\d*$/)
  const matches = (await xdo('search', '--onlyvisible', '--pid', pid)).split('\n')
  assert.equal(matches.length, 1, 'Find the unique visible window of the enrolled Main.')
  const [windowId] = matches
  assert.match(windowId, /^[1-9]\d*$/)
  assert.equal(await xdo('getwindowpid', windowId), pid)
  await xdo('windowfocus', '--sync', windowId)
  const page = state.page
  await page.evaluate(() => {
    globalThis.__igsKeyboardQualificationEvents = []
    addEventListener(
      'keydown',
      (event) => {
        globalThis.__igsKeyboardQualificationEvents.push({
          key: event.key,
          shiftKey: event.shiftKey,
          trusted: event.isTrusted,
        })
      },
      { capture: true },
    )
  })
  let keyEventsSeen = 0
  return {
    async resize(width, height) {
      await xdo('windowmove', '--sync', windowId, '0', '0')
      await xdo('windowsize', '--sync', windowId, String(width), String(height))
      const geometry = await xdo('getwindowgeometry', '--shell', windowId)
      assert.match(geometry, new RegExp(`^WIDTH=${width}$`, 'm'))
      assert.match(geometry, new RegExp(`^HEIGHT=${height}$`, 'm'))
      let renderer
      await expect
        .poll(
          async () => {
            renderer = await page.evaluate(() => ({
              inner: [innerWidth, innerHeight],
              outer: [outerWidth, outerHeight],
              dpr: devicePixelRatio,
            }))
            return [width, height].every((native, axis) => {
              const difference = native - renderer.inner[axis] * renderer.dpr
              return difference >= -1 && difference <= Math.ceil(native * 0.01)
            })
          },
          {
            message: 'Renderer content must agree with the native size within the X11 frame inset.',
          },
        )
        .toBe(true)
      await record({ phase: 'native-resize', windowId, pid, width, height, geometry, renderer })
    },
    async press(key, phase) {
      assert.equal(await xdo('getwindowfocus'), windowId)
      const before = await activeFocus(page)
      await xdo('key', '--clearmodifiers', key)
      const expected = {
        key: key === 'Return' ? 'Enter' : key.split('+').at(-1),
        shiftKey: key.startsWith('shift+'),
        trusted: true,
      }
      let observed
      await expect
        .poll(
          async () => {
            const events = await page.evaluate(
              (offset) => globalThis.__igsKeyboardQualificationEvents.slice(offset),
              keyEventsSeen,
            )
            observed = events.find((entry) => entry.key === expected.key)
            return observed
          },
          { message: `Native key ${key} must reach the renderer during ${phase}` },
        )
        .toEqual(expected)
      keyEventsSeen = await page.evaluate(() => globalThis.__igsKeyboardQualificationEvents.length)
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())))
      const after = await activeFocus(page)
      await record({ phase, key, observed, before, after })
      return after
    },
  }
}

async function tabToSelection(state, input, record) {
  const target = selection(state.page)
  await expect(target).toBeVisible()
  for (let attempt = 0; attempt < 64; attempt++) {
    await input.press('Tab', 'reach-project-selection')
    if (await target.evaluate((element) => element === document.activeElement)) {
      const focus = await activeFocus(state.page)
      await record({ phase: 'project-selection-focused', presses: attempt + 1, focus })
      assert.equal(focus.focusVisible, true)
      await expect(target).toBeInViewport()
      return
    }
  }
  assert.fail('Tab traversal never reached the saved Project selection button. See keyboard trace.')
}

async function shadowFiles(directory, retainAt) {
  const result = []
  for (const relative of (await readdir(directory, { recursive: true })).sort()) {
    const source = path.join(directory, relative)
    const status = await lstat(source)
    if (status.isDirectory()) continue
    assert.ok(status.isFile(), `Unexpected object in owned shadow: ${relative}`)
    const contents = await readFile(source)
    result.push({
      path: relative,
      sizeBytes: contents.length,
      sha256: createHash('sha256').update(contents).digest('hex'),
    })
    if (retainAt) {
      const destination = path.join(retainAt, relative)
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 })
      await writeFile(destination, contents, { flag: 'wx', mode: 0o600 })
    }
  }
  return result
}

async function assertRecoveryActions(dialog) {
  const geometry = []
  for (const label of actionNames) {
    const button = dialog.getByRole('button', { name: label, exact: true })
    await expect(button).toBeEnabled()
    const item = await button.evaluate((element) => {
      const box = element.getBoundingClientRect().toJSON()
      const dialogBox = element.closest('[role=dialog]').getBoundingClientRect().toJSON()
      return {
        box,
        dialogBox,
        viewport: [innerWidth, innerHeight],
        fullyVisible:
          box.width > 0 &&
          box.height > 0 &&
          box.left >= Math.max(0, dialogBox.left) &&
          box.right <= Math.min(innerWidth, dialogBox.right) &&
          box.top >= Math.max(0, dialogBox.top) &&
          box.bottom <= Math.min(innerHeight, dialogBox.bottom),
      }
    })
    geometry.push({ label, ...item })
  }
  return geometry
}

export async function runPackagedHomeRecoveryKeyboard({
  root,
  appData,
  ownedRunRoot,
  packageBefore,
  launch,
  readPorts,
  closeNormally,
  retainOwnStore,
  identity,
}) {
  const proofPath = path.join(path.dirname(root), 'package-proof.json')
  const proof = JSON.parse(await readFile(proofPath, 'utf8'))
  assert.equal(proof.schemaVersion, 1)
  assert.ok(proof.package.path.startsWith(`${ownedRunRoot}${path.sep}`))
  const original = await verifyChooserFixture({
    scenario: 'home-recovery-keyboard',
    root,
    ownedRunRoot,
    packageBefore,
    identity,
    expectedPackage: proof.package,
  })
  const trace = []
  const tracePath = path.join(root, 'keyboard-trace.json')
  await writeFile(tracePath, '[]\n', { flag: 'wx', mode: 0o600 })
  async function record(entry) {
    trace.push(entry)
    await writeFile(tracePath, JSON.stringify(trace, null, 2) + '\n')
  }

  const workspace = path.join(appData, 'workspaces/Uncategorized')
  const database = path.join(appData, 'database/app.sqlite')
  const project = path.join(workspace, filename)
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  assert.equal(await realpath(workspace), workspace)
  assert.deepEqual(await readdir(workspace), [])
  await copyFile(original.path, project, constants.COPYFILE_EXCL)
  const originalFile = await regularFile(project)

  const first = await launch('clean-home-keyboard')
  const initialPorts = await readPorts(first)
  assert.equal(initialPorts.projects.ok, true)
  assert.equal(initialPorts.projects.value.length, 1)
  const [{ id }] = initialPorts.projects.value
  const firstInput = await connectNativeInput(first, record)
  await firstInput.resize(1440, 900)
  await tabToSelection(first, firstInput, record)
  await first.page.screenshot({
    path: path.join(root, 'clean-home-1440x900.png'),
    animations: 'disabled',
  })
  await firstInput.press('Return', 'open-clean-project')
  await assertOpened(first, id)
  await expect(recoveryDialog(first.page)).toHaveCount(0)
  await firstInput.resize(900, 620)
  await expect(first.page.getByRole('tab', { name: title, exact: true })).toBeInViewport()
  await closeNormally(first)
  const saved = await retainOwnStore('clean-keyboard', filename)

  const base = await readIgsPackage(project)
  const dirty = parseProjectDocumentV1({
    ...base.project,
    documentRevision: randomUUID(),
    primaryBbox: { ...base.project.primaryBbox, x: base.project.primaryBbox.x + 8 },
  })
  const autosave = path.join(appData, 'autosave')
  const shadow = new ProjectShadowStore(autosave)
  await shadow.write({ projectPath: project, savedDocument: base.project, document: dirty })
  const shadowDirectory = path.join(autosave, rawPathDerivedProjectRecoveryKey(project))
  const witness = await shadowFiles(shadowDirectory, path.join(root, 'prepared-recovery-shadow'))
  assert.equal(witness.length, 2)
  assert.equal(
    (await shadow.inspect({ projectPath: project, savedPackage: base })).status,
    'recoverable',
  )
  await record({
    phase: 'prepared-recovery-shadow',
    savedRevision: base.project.documentRevision,
    dirtyRevision: dirty.documentRevision,
    witness,
  })

  const second = await launch('recoverable-home-keyboard')
  const page = second.page
  const input = await connectNativeInput(second, record)
  await input.resize(900, 620)
  const baseline = indexSnapshot(database)
  const modal = recoveryDialog(page)
  const trigger = selection(page)
  const dismissals = []

  const assertPreserved = async () => {
    assert.equal(await page.getByRole('tab', { name: title, exact: true }).count(), 0)
    assert.deepEqual(indexSnapshot(database), baseline)
    assert.deepEqual(await shadowFiles(shadowDirectory), witness)
    await assertOriginalBytes(project, identity)
    const now = await regularFile(project)
    assert.deepEqual([now.dev, now.ino], [originalFile.dev, originalFile.ino])
  }

  await tabToSelection(second, input, record)
  for (const choice of ['Escape', 'Cancel']) {
    await input.press('Return', `open-recovery-for-${choice}`)
    await expect(modal).toBeVisible()
    const cancel = modal.getByRole('button', { name: 'Cancel', exact: true })
    await expect(cancel).toBeFocused()
    const ariaModal = await modal.getAttribute('aria-modal')
    await record({
      phase: 'recovery-initial-focus',
      choice,
      ariaModal,
      focus: await activeFocus(page),
    })
    const geometry = await assertRecoveryActions(modal)
    await record({ phase: 'recovery-action-geometry', choice, geometry })
    assert.ok(
      geometry.every((item) => item.fullyVisible),
      'All three Recovery buttons must fit the native minimum window.',
    )
    await page.screenshot({
      path: path.join(root, `recovery-${choice.toLowerCase()}-900x620.png`),
      animations: 'disabled',
    })

    for (const [key, expected] of [
      ['shift+Tab', 'Recover'],
      ['Tab', 'Cancel'],
      ['Tab', 'Discard Recovery and Open Saved'],
      ['Tab', 'Recover'],
      ['Tab', 'Cancel'],
    ]) {
      await input.press(key, `recovery-trap-${choice}`)
      await expect(modal.getByRole('button', { name: expected, exact: true })).toBeFocused()
      assert.equal((await activeFocus(page)).focusVisible, true)
    }

    await input.press(choice === 'Escape' ? 'Escape' : 'Return', `dismiss-recovery-${choice}`)
    await expect(modal).toBeHidden()
    await assertPreserved()
    const focus = await activeFocus(page)
    const returnedToTrigger = await trigger.evaluate(
      (element) => element === document.activeElement,
    )
    dismissals.push({ choice, ariaModal, focus, returnedToTrigger })
    await record({ phase: 'recovery-return-focus', ...dismissals.at(-1) })
    await page.screenshot({
      path: path.join(root, `recovery-after-${choice.toLowerCase()}-900x620.png`),
      animations: 'disabled',
    })
    if (choice === 'Escape' && !returnedToTrigger) await tabToSelection(second, input, record)
  }

  await closeNormally(second)
  const restarted = await retainOwnStore('recovery-canceled-keyboard', filename)
  await assertOriginalBytes(original.path, identity)
  await assertOriginalBytes(project, identity)
  assert.deepEqual(await shadowFiles(shadowDirectory), witness)
  assert.ok(
    dismissals.every((item) => item.returnedToTrigger && item.focus?.focusVisible),
    `Both keyboard dismissals must return visible focus to the same Project selection button: ${JSON.stringify(dismissals)}`,
  )
  assert.ok(dismissals.every((item) => item.ariaModal === 'true' && item.focus.outline === 'solid'))
  return {
    saved,
    restarted,
    offlineProjectResult: { projectId: id, trace: tracePath, dismissals, shadow: witness },
  }
}
