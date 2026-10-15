/** Finite built Electron owned-coherence UI/storage qualification; no ML or runtime. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron, expect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'

const arguments_ = process.argv.slice(2)
assert.ok(
  arguments_.length === 2 || (arguments_.length === 3 && arguments_[2] === '--baseline'),
  'Use --report-file ABSOLUTE_NEW_OWNED_REPORT [--baseline]',
)
assert.equal(arguments_[0], '--report-file')
const reportFile = arguments_[1]
const baseline = arguments_[2] === '--baseline'
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Report must be new')
const evidenceRoot = path.dirname(reportFile)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const relative = path.relative(artifactRoot, evidenceRoot)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
assert.equal(realpathSync(evidenceRoot), evidenceRoot)
assert.ok(lstatSync(evidenceRoot).isDirectory() && !lstatSync(evidenceRoot).isSymbolicLink())
const fixtureRoot = mkdtempSync(
  path.join(evidenceRoot, baseline ? 'coherence-baseline-payload-' : 'coherence-native-payload-'),
)
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
mkdirSync(appDataRoot, { recursive: true, mode: 0o700 })
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashFiles = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const sourceFiles = [
  'scripts/smoke-smart-patch-coherence.mjs',
  'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs',
  'src/renderer/components/ProjectCoherenceSettings.vue',
  'src/renderer/components/project-coherence-settings-editor.ts',
  'src/renderer/components/ProjectView.vue',
  'src/shared/api.ts',
  'src/shared/projects/project-schema.ts',
  'src/shared/projects/smart-patch-coherence-settings.ts',
  'src/main/projects/project-service.ts',
  'src/main/projects/project-smart-patch-generation-input.ts',
  'src/main/projects/project-autosave.ts',
  'src/main/projects/project-shadow.ts',
  'src/main/projects/igs-package.ts',
]
const bundleFiles = [
  'dist/main/main.cjs',
  'dist/preload/preload.cjs',
  'dist/renderer/index.html',
  ...readdirSync('dist/renderer/assets')
    .filter((name) => /\.(?:js|css)$/.test(name))
    .map((name) => `dist/renderer/assets/${name}`),
]
const report = {
  outcome: 'running',
  mode: baseline ? 'old-bundle-baseline' : 'owned-coherence',
  startedAt: new Date().toISOString(),
  fixtureRoot,
  payloads: [fixtureRoot],
  sourceSha256: hashFiles(sourceFiles),
  bundleSha256: hashFiles(bundleFiles),
  checks: [],
  screenshots: [],
  layouts: [],
  pageErrors: [],
  resourceLimits: [],
  nativeClosures: [],
  boundary: {
    actual:
      'Built Electron Home/Create/+Patch; real coherence UI mode/Enter/blur/cancel/history; original preload/Main handlers, SQLite, genuine UI Save/readIgsPackage/reopen and dirty shadow→owned SIGKILL→Home Recover→explicit Save/reopen.',
    preconditions:
      'One small painted mask is created through the actual Main mask API as a declared control precondition. Painting itself is not requalified. Original Main update handler is observed and returns its identical original response. No fabricated Project/profile/pixel replies.',
    limits:
      'Native process scope at most2GiB,zero swap,300s. Source preparation/ML,models,runtime,queue,variants,staleness and release readiness excluded. CPU preparation/recovery have separate evidence.',
    cleanup:
      'Only report-owned disposable fixture. Root cleans after confirmed physical PID/start and owned-scope exit; runner does not delete runtime pools or ordinary app data.',
  },
}
let application, window, database
let projectId, packagePath, patchAId, patchBId
let observed = false
let nativeChecks = []
const title = baseline ? 'Native coherence baseline' : 'Native owned coherence'
const defaults = { edgeSize: 16, minimumDenoise: 0, mode: 'Gaussian Blur' }
const nativeExec = promisify(execFile)
const checkpoint = () =>
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
function check(name, value = {}) {
  report.checks.push({ name, ...value })
  checkpoint()
  console.log(`PASS ${name}`)
}
async function api(scope, method, ...args) {
  const reply = await window.evaluate(
    ({ scope, method, args }) => window.api[scope][method](...args),
    { scope, method, args },
  )
  assert.equal(reply.ok, true, JSON.stringify(reply))
  return reply.value
}
async function current() {
  const result = await api('projects', 'open', projectId)
  assert.equal(result.kind, 'opened')
  return result.tab
}
function patch(tab, id) {
  const owner = tab.layers.find((value) => value.id === id)
  assert.equal(owner?.kind, 'smart-patch')
  return owner
}
function layerContent({ imageUrl: _imageUrl, maskImageUrl: _maskImageUrl, ...value }) {
  return value
}
function exactState(tab) {
  return { ...tab, layers: tab.layers.map(layerContent) }
}
function exceptCoherence({ coherenceSettings: _profile, ...value }) {
  return value
}
const edge = () => window.locator('input[aria-label="Smart Patch coherence edge size"]')
const minimum = () => window.locator('input[aria-label="Smart Patch coherence minimum denoise"]')
const mode = () => window.locator('input[aria-label="Smart Patch coherence mode"]')
async function frames() {
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
}
async function screenshot(label) {
  await frames()
  const file = path.join(evidenceRoot, `${label}.png`)
  await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push(file)
  checkpoint()
}
async function bounds(label) {
  const value = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds: 300,
    execute: (file, args, options) =>
      nativeExec(
        file,
        args.map((argument) => (argument === 'MemoryMax=12G' ? 'MemoryMax=2G' : argument)),
        options,
      ),
  })
  // Keep verified PID/start/cgroup evidence even if the stricter local budget rejects this actor.
  nativeChecks.push(value)
  report.resourceLimits.push({ label, ...value })
  checkpoint()
  assert.ok(
    value.groups.every(
      (group) => BigInt(group.memoryMax) <= 2n * 1024n ** 3n && group.swapMax === '0',
    ),
  )
}
async function observe() {
  await application.evaluate(({ ipcMain }) => {
    const channel = 'projects:update-smart-patch-layer'
    const original = ipcMain._invokeHandlers.get(channel)
    if (typeof original !== 'function' || globalThis.igsNativeCoherenceObserver)
      throw new Error('Original handler required.')
    const probe = { original, rows: [] }
    globalThis.igsNativeCoherenceObserver = probe
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      const row = { args: structuredClone(args), completed: false }
      probe.rows.push(row)
      const reply = await original(event, ...args)
      row.completed = true
      row.ok = reply.ok
      row.error = reply.ok ? null : structuredClone(reply.error)
      if (reply.ok) row.documentRevision = reply.value.documentRevision
      return reply
    })
  })
  observed = true
}
async function commands() {
  return await application.evaluate(() =>
    structuredClone(globalThis.igsNativeCoherenceObserver.rows).filter(
      (row) => row.args[2]?.kind === 'coherence-settings',
    ),
  )
}
async function restoreObserver(label = 'final') {
  if (!observed || !application) return
  report.handlerObservation = await application.evaluate(({ ipcMain }) => {
    const channel = 'projects:update-smart-patch-layer'
    const probe = globalThis.igsNativeCoherenceObserver
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, probe.original)
    const result = {
      restored: ipcMain._invokeHandlers.get(channel) === probe.original,
      rows: structuredClone(probe.rows),
      originalSource: probe.original.toString(),
    }
    delete globalThis.igsNativeCoherenceObserver
    return result
  })
  assert.equal(report.handlerObservation.restored, true)
  report.handlerObservations ??= []
  report.handlerObservations.push({ label, ...report.handlerObservation })
  observed = false
  checkpoint()
}
async function closeProject(discard = false) {
  const tab = window.getByRole('tab', { name: title, exact: true })
  await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
  const guard = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect
    .poll(async () =>
      (await tab.count()) === 0 ? 'closed' : (await guard.isVisible()) ? 'decision' : 'waiting',
    )
    .not.toBe('waiting')
  if (await tab.count()) {
    assert.equal(discard, true)
    await guard.getByRole('button', { name: 'Discard Changes', exact: true }).click()
  }
  await expect(tab).toHaveCount(0)
}
async function select(id) {
  const owner = patch(await current(), id)
  const button = window
    .locator(`[data-layer-id="${id}"]`)
    .getByRole('button', { name: `Select ${owner.name}`, exact: true })
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await frames()
}
async function settled() {
  await expect(edge()).toBeEnabled()
  await expect(minimum()).toBeEnabled()
  await frames()
  await current()
}
async function history(action) {
  await window.getByRole('button', { name: 'Edit menu', exact: true }).click()
  await window
    .getByText(action === 'undo' ? 'Undo · Ctrl+Z' : 'Redo · Ctrl+Shift+Z / Ctrl+Y', {
      exact: true,
    })
    .click()
  await frames()
  return await current()
}
async function clearHistory() {
  await window.getByRole('button', { name: 'Clear Project History', exact: true }).click()
  await window.getByRole('button', { name: 'Clear history', exact: true }).click()
  await expect.poll(async () => (await current()).canUndo).toBe(false)
  await expect.poll(async () => (await current()).canRedo).toBe(false)
  await settled()
}
async function commit(field, value, trigger) {
  await settled()
  const before = await current()
  const count = (await commands()).length
  const key = field === 'edgeSize' ? 'edgeSize' : 'minimumDenoise'
  const input = field === 'edgeSize' ? edge() : minimum()
  await input.fill(String(value))
  await input.press(trigger === 'enter' ? 'Enter' : 'Tab')
  await expect
    .poll(async () => (await commands()).filter((row) => row.completed).length)
    .toBe(count + 1)
  await settled()
  await expect.poll(async () => patch(await current(), patchBId).coherenceSettings[key]).toBe(value)
  const after = await current()
  const row = (await commands()).at(-1)
  assert.equal(row.ok, true)
  assert.equal(row.args[1], patchBId)
  assert.deepEqual(row.args[2], {
    documentId: before.documentId,
    documentRevision: before.documentRevision,
    kind: 'coherence-settings',
    value: { ...patch(before, patchBId).coherenceSettings, [key]: value },
  })
  await minimum().focus()
  await frames()
  await current()
  assert.equal(
    (await commands()).length,
    count + 1,
    'Enter followed by blur must not send another IPC.',
  )
  check(`Real ${field}=${value} ${trigger} submits one captured whole-profile command`, {
    command: row.args[2],
  })
  return after
}
async function layout(width, height, label) {
  await application.evaluate(
    ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size),
    [width, height],
  )
  if (!baseline) await minimum().scrollIntoViewIfNeeded()
  else await window.locator('[aria-label="Smart Patch mask"]').scrollIntoViewIfNeeded()
  await frames()
  const geometry = await window.locator('[aria-label="Smart Patch mask"]').evaluate((section) => ({
    viewport: { width: innerWidth, height: innerHeight },
    section: section.getBoundingClientRect().toJSON(),
    controls: [...section.querySelectorAll('input')].map((input) => {
      const visibleControl =
        input.getAttribute('aria-label') === 'Smart Patch coherence mode'
          ? input.closest('.n-base-selection')
          : input
      return {
        label: input.getAttribute('aria-label'),
        value: input.value,
        disabled: input.disabled,
        rect: visibleControl.getBoundingClientRect().toJSON(),
      }
    }),
  }))
  report.layouts.push({ label, ...geometry })
  if (!baseline) {
    const fields = geometry.controls.filter((control) =>
      control.label?.startsWith('Smart Patch coherence'),
    )
    assert.equal(fields.length, 3)
    for (const control of fields) {
      assert.ok(control.rect.width > 0 && control.rect.height > 0)
      assert.ok(
        control.rect.left >= geometry.section.left &&
          control.rect.right <= geometry.section.right + 1,
      )
      const target = window.locator(`input[aria-label="${control.label}"]`)
      assert.equal(
        await target.evaluate((input) => {
          const visibleControl =
            input.getAttribute('aria-label') === 'Smart Patch coherence mode'
              ? input.closest('.n-base-selection')
              : input
          const rect = visibleControl.getBoundingClientRect()
          const center = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          )
          return center === visibleControl || visibleControl.contains(center)
        }),
        true,
        'Input center must be reachable in the actual viewport.',
      )
    }
  }
  await screenshot(label)
}

async function launch(label) {
  assert.equal(Boolean(application), false, 'A prior native actor must exit before restart.')
  nativeChecks = []
  const environment = {
    ...process.env,
    NODE_ENV: 'production',
    CUDA_VISIBLE_DEVICES: '',
    XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
    XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
    XDG_CACHE_HOME: path.join(fixtureRoot, 'cache'),
  }
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'IMAGEGEN_TEST_IMAGE_WORKER',
    'IMAGEGEN_DEV_SERVER_URL',
    'PYTHONPATH',
    'PYTHONHOME',
  ])
    delete environment[key]
  application = await electron.launch({
    args: ['--ozone-platform=x11', '.'],
    cwd: process.cwd(),
    env: environment,
    timeout: 30_000,
  })
  await bounds(`${label}-launch`)
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(15_000)
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  assert.deepEqual(await api('models', 'getCatalog'), [])
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  await observe()
}

checkpoint()
try {
  await launch(baseline ? 'baseline' : 'coherence')
  await window
    .getByLabel('Workspace navigation')
    .getByRole('button', { name: 'New Project', exact: true })
    .click()
  const modal = window.getByRole('dialog', { name: 'New Project', exact: true })
  await modal.getByRole('textbox', { name: 'Project name', exact: true }).fill(title)
  await modal.locator('input[aria-label="Project width"]').fill('256')
  await modal.locator('input[aria-label="Project height"]').fill('256')
  await modal.getByRole('button', { name: 'Create Project', exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
  const listed = await api('projects', 'list')
  assert.equal(listed.length, 1)
  projectId = listed[0].id
  packagePath = (
    await database.db
      .selectFrom('project_index')
      .select('canonical_path')
      .where('local_project_key', '=', projectId)
      .executeTakeFirstOrThrow()
  ).canonical_path
  report.projectId = projectId
  report.packagePath = packagePath
  await window.getByRole('button', { name: 'Add Smart Patch Layer', exact: true }).click()
  await expect.poll(async () => (await current()).layers.length).toBe(1)
  patchAId = (await current()).layers[0].id
  await window.getByRole('button', { name: 'Add Smart Patch Layer', exact: true }).click()
  await expect.poll(async () => (await current()).layers.length).toBe(2)
  patchBId = (await current()).layers[0].id
  await select(patchBId)
  let tab = await current()
  const owner = patch(tab, patchBId)
  await api('projects', 'editSmartPatchMask', projectId, patchBId, {
    documentId: tab.documentId,
    documentRevision: tab.documentRevision,
    maskId: owner.mask.id,
    maskRevision: owner.mask.revision,
    edit: { kind: 'brush', operation: 'add', diameter: 12, points: [{ x: 17, y: 23 }] },
  })
  // A real UI re-selection refreshes the declared API-created mask precondition.
  await select(patchAId)
  await select(patchBId)
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await current()).dirty).toBe(false)
  const initial = await readIgsPackage(packagePath)
  const initialMask = initial.project.layers.find(({ id }) => id === patchBId).mask.asset
  assert.ok(initialMask)
  const originalMaskBytes = await initial.readMember(initialMask.path)
  const original = await current()
  check(
    'Real native Create/+Patch and declared Main-painted mask are saved without runtime/models',
    { maskSha256: digest(originalMaskBytes) },
  )

  if (baseline) {
    report.oldBundleCoherenceControlCount = await window
      .locator('input[aria-label^="Smart Patch coherence"]')
      .count()
    await layout(1440, 900, 'coherence-before-1440x900')
    await layout(900, 620, 'coherence-before-900x620')
    check(
      'Old current bundle baseline captured at both viewports; new controls are observations only',
    )
  } else {
    await settled()
    assert.deepEqual(patch(original, patchAId).coherenceSettings, defaults)
    assert.deepEqual(patch(original, patchBId).coherenceSettings, defaults)
    await layout(1440, 900, 'coherence-after-1440x900')
    await layout(900, 620, 'coherence-after-900x620')
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1440, 900),
    )
    await clearHistory()
    let count = (await commands()).length
    await mode().click()
    await expect(window.locator('.n-base-select-menu:visible')).toBeVisible()
    await screenshot('coherence-mode-menu')
    await window
      .locator('.n-base-select-menu:visible')
      .getByText('Box Blur', { exact: true })
      .click()
    await expect
      .poll(async () => patch(await current(), patchBId).coherenceSettings.mode)
      .toBe('Box Blur')
    await settled()
    assert.equal((await commands()).length, count + 1)
    const modeRow = (await commands()).at(-1)
    assert.equal(modeRow.args[1], patchBId)
    assert.equal(modeRow.ok, true)
    assert.equal(modeRow.args[2].value.mode, 'Box Blur')
    tab = await history('undo')
    assert.deepEqual(patch(tab, patchBId).coherenceSettings, defaults)
    assert.equal(tab.canUndo, false, 'Mode edit is one Project Undo command.')
    tab = await history('redo')
    assert.equal(patch(tab, patchBId).coherenceSettings.mode, 'Box Blur')
    check('Real mode choice and one-entry Undo/Redo reach the owned profile')
    await clearHistory()
    await window
      .locator('[aria-label="Smart Patch coherence settings"] label')
      .filter({ hasText: 'Edge size' })
      .hover()
    await expect(window.locator('.n-tooltip:visible')).toContainText('processing pixels')
    await screenshot('coherence-edge-tooltip')
    await window.mouse.move(600, 50)
    await expect(window.locator('.n-tooltip:visible')).toBeHidden()
    await commit('edgeSize', 31, 'enter')
    tab = await history('undo')
    assert.equal(patch(tab, patchBId).coherenceSettings.edgeSize, 16)
    assert.equal(tab.canUndo, false)
    tab = await history('redo')
    assert.equal(patch(tab, patchBId).coherenceSettings.edgeSize, 31)
    await commit('minimumDenoise', 0.375, 'blur')

    const unchanged = exactState(await current())
    count = (await commands()).length
    await edge().fill('31')
    await edge().press('Enter')
    await minimum().focus()
    await settled()
    assert.equal((await commands()).length, count)
    assert.deepEqual(exactState(await current()), unchanged)
    check('Same numeric value/Enter/blur publishes no profile IPC or revision')
    await edge().fill('9.5')
    await expect(window.getByRole('alert').filter({ hasText: 'Enter an edge size' })).toBeVisible()
    await screenshot('coherence-invalid-edge')
    await edge().press('Enter')
    await minimum().focus()
    await settled()
    assert.equal((await commands()).length, count)
    assert.deepEqual(exactState(await current()), unchanged)
    await edge().fill('1024')
    await edge().press('Escape')
    await minimum().focus()
    await settled()
    assert.equal((await commands()).length, count)
    assert.deepEqual(exactState(await current()), unchanged)
    await expect(edge()).toHaveValue('31')
    check('Invalid fractional edge and validraw/Escape retain exact state with no IPC')
    await minimum().fill('1.01')
    await expect(
      window.getByRole('alert').filter({ hasText: 'Enter minimum denoise' }),
    ).toBeVisible()
    await minimum().press('Tab')
    await settled()
    assert.equal((await commands()).length, count)
    assert.deepEqual(exactState(await current()), unchanged)
    await minimum().press('Escape')
    check('Out-of-range minimum blur is refused without clamping or IPC')

    await edge().fill('8')
    await select(patchAId)
    await expect(edge()).toHaveValue('16')
    await settled()
    assert.equal(
      (await commands()).length,
      count,
      'Owner selection before blur cancels the old raw draft.',
    )
    assert.deepEqual(exactState(await current()), unchanged)
    await select(patchBId)
    await expect(edge()).toHaveValue('31')
    check('Actual layer selection before blur cancels old-owner draft without retargeting')
    const lockButton = window
      .locator(`[data-layer-id="${patchBId}"]`)
      .getByRole('button', { name: `Lock ${patch(await current(), patchBId).name}`, exact: true })
    await lockButton.click()
    await expect.poll(async () => patch(await current(), patchBId).locked).toBe(true)
    await expect(edge()).toBeDisabled()
    await expect(minimum()).toBeDisabled()
    await screenshot('coherence-locked-owner')
    assert.equal((await commands()).length, count)
    await window
      .locator(`[data-layer-id="${patchBId}"]`)
      .getByRole('button', { name: `Unlock ${patch(await current(), patchBId).name}`, exact: true })
      .click()
    await expect.poll(async () => patch(await current(), patchBId).locked).toBe(false)
    await settled()
    check('Locked owner disables controls and emits no coherence edit')

    tab = await current()
    const expectedProfile = { edgeSize: 31, minimumDenoise: 0.375, mode: 'Box Blur' }
    assert.deepEqual(patch(tab, patchBId).coherenceSettings, expectedProfile)
    for (const id of [patchAId, patchBId])
      assert.deepEqual(
        exceptCoherence(layerContent(patch(tab, id))),
        exceptCoherence(layerContent(patch(original, id))),
      )
    assert.deepEqual(tab.generationDraft, original.generationDraft)
    assert.deepEqual(tab.primaryBbox, original.primaryBbox)
    assert.equal(tab.lastActualSeedSnapshot, original.lastActualSeedSnapshot)
    await window.getByRole('button', { name: 'Save Project', exact: true }).click()
    await expect.poll(async () => (await current()).dirty).toBe(false)
    const saved = await readIgsPackage(packagePath)
    const stored = saved.project.layers.find(({ id }) => id === patchBId)
    assert.deepEqual(stored.coherenceSettings, expectedProfile)
    assert.deepEqual(stored.mask, initial.project.layers.find(({ id }) => id === patchBId).mask)
    assert.ok((await saved.readMember(initialMask.path)).equals(originalMaskBytes))
    assert.deepEqual(saved.project.generationDraft, initial.project.generationDraft)
    assert.deepEqual(saved.project.primaryBbox, initial.project.primaryBbox)
    assert.equal(saved.project.lastActualSeedSnapshot, initial.project.lastActualSeedSnapshot)
    const copy = path.join(evidenceRoot, 'owned-coherence-saved.igs')
    writeFileSync(copy, readFileSync(packagePath), { flag: 'wx', mode: 0o600 })
    await closeProject()
    await window.getByRole('tab', { name: 'Home', exact: true }).click()
    await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
    await window.getByRole('button', { name: `Open ${title}`, exact: true }).click()
    await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
    await select(patchBId)
    await settled()
    await expect(edge()).toHaveValue('31')
    await expect(minimum()).toHaveValue('0.375')
    assert.deepEqual(patch(await current(), patchBId).coherenceSettings, expectedProfile)
    await screenshot('coherence-saved-reopened')
    check(
      'Real UI Save/raw package read/close/reopen retain profile and byte-identical owned mask',
      { evidenceCopy: copy, packageSha256: digest(readFileSync(packagePath)) },
    )

    // Freeze real unsaved UI edits and observe their durable shadow before killing our exact actor.
    const savedBeforeCrash = readFileSync(packagePath)
    await commit('edgeSize', 8, 'enter')
    await commit('minimumDenoise', 1, 'blur')
    await mode().click()
    await window.locator('.n-base-select-menu:visible').getByText('Staged', { exact: true }).click()
    const recoveryProfile = { edgeSize: 8, minimumDenoise: 1, mode: 'Staged' }
    await expect
      .poll(async () => patch(await current(), patchBId).coherenceSettings)
      .toEqual(recoveryProfile)
    await settled()
    const dirty = await current()
    assert.equal(dirty.dirty, true)
    const shadowFile = path.join(appDataRoot, 'autosave', projectId, 'manifest.json')
    await expect
      .poll(() => {
        if (!existsSync(shadowFile)) return null
        const manifest = JSON.parse(readFileSync(shadowFile, 'utf8'))
        if (manifest.state !== 'dirty' || manifest.documentRevision !== dirty.documentRevision)
          return null
        const snapshot = path.join(
          path.dirname(shadowFile),
          'snapshots',
          manifest.snapshotId,
          'project.json',
        )
        if (!existsSync(snapshot)) return null
        const bytes = readFileSync(snapshot)
        if (digest(bytes) !== manifest.documentHash) return null
        const document = JSON.parse(bytes)
        if (document.documentRevision !== dirty.documentRevision) return null
        const profile = document.layers.find(({ id }) => id === patchBId)?.coherenceSettings
        return profile
      })
      .toEqual(recoveryProfile)
    assert.ok(
      readFileSync(packagePath).equals(savedBeforeCrash),
      'Dirty shadow must not implicitly Save.',
    )
    report.crashShadow = JSON.parse(readFileSync(shadowFile, 'utf8'))
    await screenshot('coherence-dirty-before-crash')
    await bounds('before-own-crash')
    await restoreObserver('before-own-crash')
    await database.close()
    database = null
    const child = application.process()
    const identity = nativeChecks.at(-1).nativeIdentity
    assert.equal(child.pid, identity.pid)
    assert.equal(child.exitCode, null)
    const stat = readFileSync(`/proc/${child.pid}/stat`, 'utf8')
    assert.equal(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19], identity.start)
    const exited = new Promise((resolve) => child.once('exit', resolve))
    assert.equal(child.kill('SIGKILL'), true)
    await exited
    const physical = await confirmQualificationProcessExit(nativeChecks)
    assert.equal(physical.confirmed, true)
    report.nativeClosures.push({ label: 'intentional-own-crash', ...physical })
    application = null
    window = null
    checkpoint()
    await launch('recovery')
    await window.getByRole('button', { name: `Open ${title}`, exact: true }).click()
    const recovery = window.getByRole('dialog', { name: 'Recovery available', exact: true })
    await expect(recovery).toBeVisible()
    assert.ok(readFileSync(packagePath).equals(savedBeforeCrash))
    await recovery.getByRole('button', { name: 'Recover', exact: true }).click()
    await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
    await expect(recovery).toBeHidden()
    const recovered = await current()
    assert.equal(recovered.dirty, true)
    assert.equal(recovered.canUndo, false, 'Undo history does not survive process restart.')
    assert.equal(recovered.canRedo, false)
    assert.deepEqual(recovered.layers.map(layerContent), dirty.layers.map(layerContent))
    assert.deepEqual(recovered.generationDraft, dirty.generationDraft)
    assert.deepEqual(recovered.primaryBbox, dirty.primaryBbox)
    assert.equal(recovered.lastActualSeedSnapshot, dirty.lastActualSeedSnapshot)
    assert.ok(readFileSync(packagePath).equals(savedBeforeCrash))
    await select(patchBId)
    await settled()
    await expect(edge()).toHaveValue('8')
    await expect(minimum()).toHaveValue('1')
    await expect(window.locator('.coherence-mode')).toContainText('Staged')
    await minimum().scrollIntoViewIfNeeded()
    await screenshot('coherence-home-recovered')
    check(
      'Actual dirty coherence shadow→owned SIGKILL→Home Recover retains both owners and saved bytes',
      { profile: recoveryProfile, shadowRevision: dirty.documentRevision },
    )
    await window.getByRole('button', { name: 'Save Project', exact: true }).click()
    await expect.poll(async () => (await current()).dirty).toBe(false)
    const recoverySaved = await readIgsPackage(packagePath)
    assert.deepEqual(
      recoverySaved.project.layers.find(({ id }) => id === patchBId).coherenceSettings,
      recoveryProfile,
    )
    assert.ok((await recoverySaved.readMember(initialMask.path)).equals(originalMaskBytes))
    assert.deepEqual(recoverySaved.project.generationDraft, initial.project.generationDraft)
    assert.deepEqual(recoverySaved.project.primaryBbox, initial.project.primaryBbox)
    assert.equal(
      recoverySaved.project.lastActualSeedSnapshot,
      initial.project.lastActualSeedSnapshot,
    )
    const recoveryCopy = path.join(evidenceRoot, 'owned-coherence-recovered-saved.igs')
    writeFileSync(recoveryCopy, readFileSync(packagePath), { flag: 'wx', mode: 0o600 })
    await closeProject()
    await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
    await window.getByRole('button', { name: `Open ${title}`, exact: true }).click()
    await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
    await select(patchBId)
    await settled()
    const recoveryReopened = await current()
    assert.equal(recoveryReopened.dirty, false)
    assert.deepEqual(recoveryReopened.layers.map(layerContent), recovered.layers.map(layerContent))
    await expect(edge()).toHaveValue('8')
    await expect(minimum()).toHaveValue('1')
    check('Recovered owned profile explicitly saves and reopens with the original mask PNG', {
      evidenceCopy: recoveryCopy,
      packageSha256: digest(readFileSync(packagePath)),
    })
  }
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(await api('models', 'getCatalog'), [])
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  assert.equal(
    (await database.db.selectFrom('generation_queue_item').select('id').execute()).length,
    0,
  )
  await closeProject()
  report.outcome = 'passed'
  report.completedAt = new Date().toISOString()
  checkpoint()
} catch (error) {
  report.outcome = 'failed'
  report.error = { name: error.name, message: error.message, stack: error.stack }
  checkpoint()
  if (window && !window.isClosed()) {
    try {
      await screenshot('coherence-failure-before-cleanup')
    } catch (failure) {
      report.failureScreenshotError = String(failure)
      checkpoint()
    }
  }
  throw error
} finally {
  const cleanupFailure = (stage, error) => {
    report.outcome = 'failed'
    report.cleanupErrors ??= []
    report.cleanupErrors.push({ stage, error: String(error) })
    process.exitCode = 1
    checkpoint()
  }
  if (application) {
    // A refusal by the final bounds check must never prevent close or physical-exit verification.
    try {
      await bounds('before-close')
    } catch (error) {
      cleanupFailure('bounds-before-close', error)
    }
    try {
      await restoreObserver()
    } catch (error) {
      cleanupFailure('restore-observer', error)
    }
    try {
      if (database) {
        await database.close()
        database = null
      }
    } catch (error) {
      cleanupFailure('database-close', error)
    }
    try {
      if (
        window &&
        !window.isClosed() &&
        projectId &&
        (await window.getByRole('tab', { name: title, exact: true }).count())
      )
        await closeProject(true)
    } catch (error) {
      cleanupFailure('project-close', error)
    }
    try {
      try {
        await application.close()
      } catch (error) {
        report.closeUiError = String(error)
        const latest = nativeChecks.at(-1)
        const identity = latest.processIdentities.find(
          ({ pid }) => pid === application.process().pid,
        )
        const group = latest.groups.find(
          ({ ownedScope, pids }) => ownedScope && pids.includes(identity?.pid),
        )
        assert.ok(identity && group)
        report.ownedSignal = await stopExpiredQualificationProcess({
          ...identity,
          group: group.group,
        })
      }
    } catch (error) {
      cleanupFailure('application-close', error)
    }
    try {
      const exit = await confirmQualificationProcessExit(nativeChecks)
      assert.equal(exit.confirmed, true)
      report.nativeClosures.push({ label: 'final', ...exit })
    } catch (error) {
      cleanupFailure('confirm-native-exit', error)
    }
  }
  if (database) await database.close()
  report.finalSourceSha256 = hashFiles(sourceFiles)
  report.finalBundleSha256 = hashFiles(bundleFiles)
  if (report.outcome === 'passed') {
    try {
      assert.deepEqual(
        report.finalBundleSha256,
        report.bundleSha256,
        'Bundle must stay fixed during native execution.',
      )
      if (!baseline)
        assert.deepEqual(
          report.finalSourceSha256,
          report.sourceSha256,
          'Qualified sources must stay frozen during execution.',
        )
    } catch (error) {
      report.outcome = 'failed'
      report.identityError = String(error)
      process.exitCode = 1
    }
  }
  checkpoint()
}
