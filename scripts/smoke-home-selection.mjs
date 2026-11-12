/** Built Home selected-Project continuity over base67be16f8; UI state only, real Main owners. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron, expect } from '@playwright/test'
import { openAppDatabase } from '../src/main/db/database.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import { boundQualificationProcess, confirmQualificationProcessExit } from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4, 'Use --report-file ABSOLUTE_NEW_OWNED_REPORT')
assert.equal(process.argv[2], '--report-file')
const reportFile = process.argv[3], evidenceRoot = path.dirname(reportFile)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const relative = path.relative(artifactRoot, evidenceRoot)
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
assert.equal(realpathSync(evidenceRoot), evidenceRoot)
assert.equal(lstatSync(evidenceRoot).isSymbolicLink(), false)
assert.equal(existsSync(reportFile), false)
const payload = mkdtempSync(path.join(evidenceRoot, 'native-home-selection-'))
const appData = path.join(payload, 'data/imagegen-studio'), folder = path.join(payload, 'selected-workspace')
const backups = path.join(payload, 'original-inputs')
mkdirSync(folder); mkdirSync(backups)
const execute = promisify(execFile)
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const sourceFiles = [
  'scripts/smoke-home-selection.mjs', 'scripts/native-smoke-window.mjs', 'scripts/qualification-resource-limits.mjs',
  'src/main/index.ts', 'src/preload/index.ts', 'src/shared/api.ts', 'src/main/db/database.ts',
  'src/main/projects/project-service.ts', 'src/main/projects/project-index.ts', 'src/main/projects/project-identity.ts',
  'src/main/projects/project-location-registry.ts', 'src/main/projects/project-autosave.ts',
  'src/main/projects/project-session.ts', 'src/main/projects/igs-package.ts', 'src/main/projects/project-placeholders.ts',
  'src/shared/projects/home-project-browse.ts', 'src/renderer/App.vue', 'src/renderer/components/HomeView.vue',
  'src/renderer/components/HomeProjectInspector.vue', 'src/renderer/components/HomeProjectPreview.vue',
  'src/renderer/components/AppChrome.vue', 'src/renderer/styles/global.css',
]
const bundleFiles = ['dist/main/main.cjs', 'dist/preload/preload.cjs', 'dist/renderer/index.html',
  ...readdirSync('dist/renderer/assets').filter((name) => /\.(?:js|css)$/.test(name)).map((name) => `dist/renderer/assets/${name}`)]
const report = {
  outcome: 'running', mode: 'home-selection', startedAt: new Date().toISOString(), payloads: [payload],
  checks: [], screenshots: [], nativeClosures: [], resourceChecks: [], pageErrors: [], vueWarnings: [], unexpectedDirtyCloses: [], listHandlerRestorations: [],
  sourceSha256: Object.fromEntries(sourceFiles.map((file) => [file, digest(file)])),
  bundleSha256: Object.fromEntries(bundleFiles.map((file) => [file, digest(file)])),
  sourceBasis: { baseRevision: '67be16f82487708399df75b9f2a2a94db9a3f135', paths: ['docs/features/home-screen.md', 'docs/prototype-app/src/App.vue', 'docs/prototype-app/src/prototypes/home/HomePrototype.vue'], note: 'UI session continuity only; existing filter, Project/package and catalog owners unchanged. No fresh Invoke non-UI review claimed.' },
  boundary: 'Actual built Home/Project UI, preload, Main, SQLite and saved packages. Direct Main Create/Close prepare two neutral closed fixtures; only the Add Workspace OS picker is controlled and restored. Real catalog handlers are held then delegated, never replaced with fabricated replies, and exact original identities are restored. Ordinary loading holds list only; the causal remount control holds list/workspaces/Trash replies so a later catalog refresh cannot hide the initial validation boundary before the actual Status change. Selection, navigation, view/filter/scope changes and ordinary Close are actual UI actions. Source package copies and readonly catalog controls distinguish implicit Open/Save from the one explicit Beta Open. Empty saved-preview Inspector verifies selected ownership; image inference, preview-camera persistence, crash recovery, cross-launch settings and full Home/MVP readiness are not claimed. No ML/runtime/model copy, SHARED dependency, foreign data or process mutation.',
}
let application, window, database, workspace, fixtures, alpha, beta, nativeChecks = []
const files = {}, hashes = {}
function persist() { writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }) }
function check(name, evidence = {}) { report.checks.push({ name, ...evidence }); persist(); console.log(`PASS ${name}`) }
async function api(method, ...args) {
  const result = await window.evaluate(({ method, args }) => window.api.projects[method](...args), { method, args })
  assert.equal(result.ok, true, JSON.stringify(result)); return result.value
}
async function bound(label) {
  const result = await boundQualificationProcess(application.process().pid, { deadlineSeconds: 480,
    execute: (file, args, options) => execute(file, args.map((item) => item === 'MemoryMax=12G' ? 'MemoryMax=2G' : item), options) })
  nativeChecks.push(result); report.resourceChecks.push({ label, ...result }); persist()
}
async function launch(label) {
  const env = { ...process.env, NODE_ENV: 'test', CUDA_VISIBLE_DEVICES: '', XDG_CONFIG_HOME: path.join(payload, 'config'), XDG_DATA_HOME: path.join(payload, 'data') }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'IMAGEGEN_DEV_SERVER_URL', 'IMAGEGEN_TEST_IMAGE_WORKER']) delete env[key]
  nativeChecks = []
  application = await electron.launch({ args: ['--ozone-platform=x11', '.'], cwd: process.cwd(), env, timeout: 30_000 })
  await bound(`${label}-launch`)
  window = await isolateNativeSmokeWindow(application); window.setDefaultTimeout(10_000)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  window.on('console', (message) => { if (message.text().includes('[Vue warn]')) report.vueWarnings.push(message.text()) })
  await expect(tab('Home')).toBeVisible()
  await expect.poll(async () => (await api('listWorkspaces')).length).toBeGreaterThan(0)
  database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
  await viewport(1440, 900)
}
async function close(label) {
  if (!application) return
  await restoreListGate(); await restorePicker()
  if (database) { await database.close(); database = null }
  await bound(`${label}-before-close`); await application.close()
  report.nativeClosures.push({ label, ...(await confirmQualificationProcessExit(nativeChecks)) })
  application = null; window = null; persist()
}
const navigation = () => window.getByLabel('Workspace navigation', { exact: true })
const inspector = () => window.getByLabel('Project inspector', { exact: true })
const tab = (title) => window.getByRole('tab', { name: title, exact: true })
const row = (project) => window.locator(`.project-row[data-project-id="${project.id}"]`)
const selectButton = (project) => row(project).getByRole('button', { name: `Select ${project.title}`, exact: true })
async function tabLabels() { return window.getByRole('tablist', { name: 'Open documents', exact: true }).getByRole('tab').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label'))) }
async function records() { return await database.db.selectFrom('project_index').selectAll().orderBy('local_project_key').execute() }
// Real scans update indexed_at; every persisted ownership/content/open-time field stays checked.
function catalog(records) { return records.map(({ indexed_at: _indexedAt, ...value }) => value) }
function assertPackages() { for (const [id, expected] of Object.entries(hashes)) { assert.equal(digest(files[id]), expected, `${id}: saved package changed`); assert.equal(digest(path.join(backups, `${id}.igs`)), expected) } }
async function viewport(width, height) {
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width, height })
  await expect.poll(() => window.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([width, height])
}
async function screenshot(name) {
  await window.evaluate(() => document.fonts.ready.then(() => undefined))
  const [width, height] = await window.evaluate(() => [window.innerWidth, window.innerHeight])
  const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-${name}.png`)
  assert.equal(existsSync(file), false); await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push({ file, width, height, sha256: digest(file) }); persist()
}
async function home() {
  if (await tab('Home').count() === 0) await window.getByRole('button', { name: 'Open Home', exact: true }).click()
  await tab('Home').click(); await expect(tab('Home')).toHaveAttribute('aria-selected', 'true')
  await expect(window.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled()
}
async function select(project) {
  await selectButton(project).click(); await selected(project)
}
async function selected(project) {
  await expect(selectButton(project)).toHaveAttribute('aria-pressed', 'true')
  await expect(inspector().getByRole('heading', { name: project.title, exact: true })).toBeVisible()
}
async function noneSelected() {
  await expect(window.locator('.row-select[aria-pressed="true"]')).toHaveCount(0)
  await expect(inspector().getByText('Select a project to preview', { exact: true })).toBeVisible()
}
async function choose(label, option) {
  const control = window.getByLabel(label, { exact: true }); await control.click()
  await window.locator('.n-base-select-option:visible').filter({ hasText: new RegExp(`^${option}$`) }).click()
  await expect(control).toContainText(option)
}
async function projectTab() {
  await tab(beta.title).click(); await expect(tab(beta.title)).toHaveAttribute('aria-selected', 'true')
  await expect(window.getByRole('button', { name: `Close ${beta.title}`, exact: true })).toBeEnabled()
}
async function closeProject(project) {
  if (await tab(project.title).count() === 0) return
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  const modal = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect.poll(async () => await tab(project.title).count() === 0 ? 'closed' : await modal.isVisible() ? 'decision' : 'pending').not.toBe('pending')
  if (await modal.isVisible()) {
    // Diagnostic cleanup of an unexpected own dirty tab is explicit; it never upgrades the run.
    report.unexpectedDirtyCloses.push({ projectId: project.id, action: 'Discard Changes' }); persist()
    await modal.getByRole('button', { name: 'Discard Changes', exact: true }).click(); await expect(modal).toHaveCount(0)
  }
  await expect(tab(project.title)).toHaveCount(0)
  const remaining = window.locator('.document-tab:not([aria-label="Home"]) button.tab-close').first()
  if (await remaining.count()) await expect(remaining).toBeEnabled()
  else if (await navigation().isVisible()) await expect(window.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled()
}
async function restorePicker() {
  if (!application) return
  const value = await application.evaluate(({ dialog }) => {
    const state = globalThis.__igsHomeSelectionPicker
    if (!state) return null
    if (dialog.showOpenDialog !== state.wrapper) throw new Error('Picker owner changed')
    dialog.showOpenDialog = state.original; delete globalThis.__igsHomeSelectionPicker
    return { restored: dialog.showOpenDialog === state.original, calls: state.calls }
  })
  if (value) { assert.equal(value.restored, true); report.pickerRestoration = value; persist() }
}
async function holdList(allCatalog = false) {
  await application.evaluate(({ ipcMain }, { workspaceId, allCatalog }) => {
    if (globalThis.__igsHomeSelectionList) throw new Error('Unexpected list gate owner')
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const state = { release, entries: [] }
    const channels = ['projects:list', ...(allCatalog ? ['projects:list-workspaces', 'projects:list-trash'] : [])]
    for (const channel of channels) {
      const original = ipcMain._invokeHandlers.get(channel)
      if (typeof original !== 'function') throw new Error(`Real catalog handler absent: ${channel}`)
      const entry = { channel, original, entered: false, finished: false, calls: [], pending: null }
      entry.wrapper = (event, ...args) => {
        if (entry.entered || (channel === 'projects:list' && args[0] !== workspaceId)) return original(event, ...args)
        entry.entered = true; entry.calls.push(args)
        entry.pending = gate.then(() => original(event, ...args)).then((value) => { entry.finished = true; return value })
        return entry.pending
      }
      state.entries.push(entry)
    }
    for (const entry of state.entries) ipcMain._invokeHandlers.set(entry.channel, entry.wrapper)
    globalThis.__igsHomeSelectionList = state
  }, { workspaceId: workspace.id, allCatalog })
}
async function listState() {
  return await application.evaluate(() => {
    const state = globalThis.__igsHomeSelectionList
    if (!state) return null
    const channels = state.entries.map(({ channel, entered, finished, calls }) => ({ channel, entered, finished, calls }))
    return { ...channels[0], channels }
  })
}
async function restoreListGate() {
  if (!application) return
  const value = await application.evaluate(async ({ ipcMain }) => {
    const state = globalThis.__igsHomeSelectionList
    if (!state) return null
    state.release(); await Promise.all(state.entries.map((entry) => entry.pending?.catch(() => undefined)))
    for (const entry of state.entries) if (ipcMain._invokeHandlers.get(entry.channel) !== entry.wrapper) throw new Error('Catalog handler owner changed')
    for (const entry of state.entries) ipcMain._invokeHandlers.set(entry.channel, entry.original)
    const channels = state.entries.map(({ channel, original, entered, finished, calls }) => ({ channel, restored: ipcMain._invokeHandlers.get(channel) === original, entered, finished, calls }))
    delete globalThis.__igsHomeSelectionList
    return { restored: channels.every((entry) => entry.restored), entered: channels[0].entered, finished: channels[0].finished, calls: channels[0].calls, channels }
  })
  if (value) { assert.equal(value.restored, true); report.listHandlerRestorations.push(value); persist() }
  return value
}

persist()
try {
  await launch('continuity')
  await application.evaluate(({ dialog }, selectedPath) => {
    const original = dialog.showOpenDialog, state = { original, calls: [] }
    state.wrapper = async (owner, options) => {
      if (options.title !== 'Add Workspace') return original.call(dialog, owner, options)
      if (JSON.stringify(options.properties) !== JSON.stringify(['openDirectory', 'createDirectory'])) throw new Error('Wrong Add Workspace contract')
      state.calls.push({ title: options.title, properties: options.properties, selectedPath }); return { canceled: false, filePaths: [selectedPath] }
    }
    dialog.showOpenDialog = state.wrapper; globalThis.__igsHomeSelectionPicker = state
  }, folder)
  await navigation().getByRole('button', { name: 'Add Workspace', exact: true }).click()
  const add = window.getByRole('dialog', { name: 'Add Workspace', exact: true })
  await add.getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Selection Workspace')
  await add.getByRole('button', { name: 'Choose Folder and Add', exact: true }).click(); await expect(add).toHaveCount(0)
  await restorePicker()
  workspace = (await api('listWorkspaces')).find(({ isDefault }) => !isDefault)
  assert.ok(workspace); assert.equal(workspace.directoryPath, folder)
  for (const title of ['Alpha Project', 'Beta Project']) { const created = await api('create', { title, width: 640, height: 512, workspaceId: workspace.id }); await api('close', created.id, false) }
  fixtures = await api('list', workspace.id); assert.equal(fixtures.length, 2)
  alpha = fixtures.find(({ title }) => title === 'Alpha Project'); beta = fixtures.find(({ title }) => title === 'Beta Project'); assert.ok(alpha && beta)
  const beforeRecords = await records()
  for (const project of fixtures) {
    files[project.id] = beforeRecords.find(({ local_project_key }) => local_project_key === project.id).canonical_path
    hashes[project.id] = digest(files[project.id]); cpSync(files[project.id], path.join(backups, `${project.id}.igs`), { errorOnExist: true, force: false })
  }
  report.fixtures = { workspace, projects: fixtures, beforeRecords, files, hashes, originalDirectory: backups }
  persist()
  await navigation().locator('.workspace-select').filter({ hasText: workspace.displayName }).click()
  await expect(window.getByRole('heading', { name: workspace.displayName, exact: true })).toBeVisible()
  // Direct Main fixture creation does not publish a Renderer catalog refresh.
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await expect(window.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled()
  await expect(selectButton(alpha)).toBeVisible(); await expect(selectButton(beta)).toBeVisible(); await noneSelected()
  assertPackages(); check('Two real Main-created closed fixtures start unselected in the selected workspace; exact saved originals and controlled picker callback are retained', report.fixtures)

  await select(alpha); await expect.poll(tabLabels).toEqual(['Home'])
  assert.deepEqual(catalog(await records()), catalog(beforeRecords)); assertPackages()
  await selectButton(beta).click({ modifiers: ['Control'] })
  await expect(tab(beta.title)).toHaveAttribute('aria-selected', 'true')
  await expect(window.getByRole('button', { name: `Close ${beta.title}`, exact: true })).toBeEnabled()
  await expect.poll(tabLabels).toEqual(['Home', beta.title])
  await home(); await selected(alpha)
  const openedRecords = await records()
  for (const before of beforeRecords) {
    const after = openedRecords.find(({ local_project_key }) => local_project_key === before.local_project_key)
    assert.deepEqual({ ...before, indexed_at: null, last_opened_at: null }, { ...after, indexed_at: null, last_opened_at: null })
    assert.equal(before.last_opened_at !== after.last_opened_at, before.local_project_key === beta.id)
  }
  assertPackages(); check('Selecting Alpha does not Open or Save; actual explicit Ctrl-Open of Beta then Home remount restores Alpha Inspector with only Beta lastOpened changed', { beforeRecords, openedRecords, tabs: await tabLabels() })

  await projectTab(); await home(); await selected(alpha)
  await window.getByRole('button', { name: 'Close Home', exact: true }).click(); await expect(tab('Home')).toHaveCount(0)
  await home(); await selected(alpha)
  await window.getByRole('button', { name: 'List view', exact: true }).click(); await choose('Sort by', 'Name'); await selected(alpha)
  await inspector().getByRole('button', { name: 'Collapse inspector', exact: true }).click()
  await projectTab(); await home(); await expect(inspector().getByRole('button', { name: 'Expand inspector', exact: true })).toBeVisible()
  await expect(selectButton(alpha)).toHaveAttribute('aria-pressed', 'true')
  await inspector().getByRole('button', { name: 'Expand inspector', exact: true }).click(); await selected(alpha)
  await screenshot('retained-selection-wide')
  assert.deepEqual(catalog(await records()), catalog(openedRecords)); assertPackages()
  check('Project tab return and explicit Close Home/reopen retain Alpha; List Name sorting and collapsed Inspector survive remount without selecting another row')

  await holdList(); await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await expect.poll(async () => (await listState()).entered).toBe(true); await selected(alpha)
  assert.equal((await listState()).finished, false)
  const held = await listState(), restored = await restoreListGate()
  assert.equal(restored.finished, true); assert.equal(restored.calls.length, 1)
  await expect(window.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled(); await selected(alpha)
  await viewport(900, 620); await screenshot('retained-selection-narrow')
  assert.deepEqual(catalog(await records()), catalog(openedRecords)); assertPackages()
  check('A held real Main list refresh keeps cached Alpha selection while loading and after its actual response; exact handler identity is restored', { held, restored })

  const search = window.getByRole('textbox', { name: 'Search projects', exact: true })
  await search.fill('Beta'); await expect(selectButton(alpha)).toHaveCount(0); await noneSelected()
  await search.fill(''); await expect(selectButton(alpha)).toBeVisible(); await noneSelected()
  await select(alpha); await choose('Status', 'Open'); await expect(selectButton(alpha)).toHaveCount(0); await noneSelected()
  await choose('Status', 'All statuses'); await expect(selectButton(alpha)).toBeVisible(); await noneSelected()
  assert.deepEqual(catalog(await records()), catalog(openedRecords)); assertPackages()
  check('Name and Status filters clear a hidden Alpha selection; returning matching rows never resurrects the hidden ID or silently chooses Beta')

  await select(alpha); await navigation().getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(window.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible(); await expect(selectButton(alpha)).toBeVisible(); await noneSelected()
  await select(alpha); await navigation().locator('.workspace-select').filter({ hasText: workspace.displayName }).click()
  await expect(window.getByRole('heading', { name: workspace.displayName, exact: true })).toBeVisible(); await expect(selectButton(alpha)).toBeVisible(); await noneSelected()
  await select(alpha); await navigation().getByRole('button', { name: /^Trash(?:\s*\d+)?$/ }).click()
  await expect(window.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible(); await noneSelected()
  await navigation().locator('.workspace-select').filter({ hasText: workspace.displayName }).click()
  await expect(selectButton(alpha)).toBeVisible(); await noneSelected()
  assert.deepEqual(catalog(await records()), catalog(openedRecords)); assertPackages()
  check('Projects workspace and empty Trash scope switches clear selection even when Alpha is visible in both ordinary scopes; no lifecycle command or implicit Open occurs')

  await choose('Status', 'Open'); await select(beta); await projectTab()
  await holdList(true)
  await window.getByRole('button', { name: `Close ${beta.title}`, exact: true }).click()
  await expect(tab(beta.title)).toHaveCount(0); await expect(tab('Home')).toHaveAttribute('aria-selected', 'true')
  await expect.poll(async () => (await listState()).channels.every(({ entered }) => entered)).toBe(true)
  const closeRefreshHeld = await listState()
  assert.equal(closeRefreshHeld.channels.length, 3); assert.ok(closeRefreshHeld.channels.every(({ finished }) => !finished))
  await expect(selectButton(beta)).toHaveCount(0); await noneSelected()
  // These actual toolbar controls remain enabled while Close awaits refresh. Changing Status
  // before any catalog response returns distinguishes initial validation from a later refresh.
  await choose('Status', 'All statuses'); await expect(selectButton(beta)).toBeVisible(); await noneSelected()
  const closeRefreshRestored = await restoreListGate()
  assert.ok(closeRefreshRestored.channels.every(({ entered, finished, restored, calls }) => entered && finished && restored && calls.length === 1))
  await expect(window.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled(); await noneSelected()
  await screenshot('invalidated-selection-narrow')
  assert.equal(report.unexpectedDirtyCloses.length, 0); assert.deepEqual(catalog(await records()), catalog(openedRecords)); assertPackages()
  check('Closing selected Beta while Home is unmounted revalidates before any held catalog response; actual All statuses cannot resurrect the latent Beta ID before or after original responses', { closeRefreshHeld, closeRefreshRestored })

  await select(alpha); await selected(alpha); await expect.poll(tabLabels).toEqual(['Home'])
  report.selectedAtFirstExit = { projectId: alpha.id, workspaceId: workspace.id }
  await close('continuity-normal')
  await launch('fresh-session'); await expect(selectButton(alpha)).toBeVisible(); await expect(selectButton(beta)).toBeVisible(); await noneSelected()
  await expect(window.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled()
  const finalRecords = await records(); assert.deepEqual(catalog(finalRecords), catalog(openedRecords)); assertPackages()
  assert.deepEqual(Object.fromEntries(sourceFiles.map((file) => [file, digest(file)])), report.sourceSha256)
  assert.deepEqual(Object.fromEntries(bundleFiles.map((file) => [file, digest(file)])), report.bundleSha256)
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors)); assert.equal(report.vueWarnings.length, 0, JSON.stringify(report.vueWarnings))
  report.finalState = { beforeRecords, openedRecords, finalRecords, files, hashes, originalDirectory: backups, explicitlyOpenedProjectIds: [beta.id], selectedBeforeExit: alpha.id, freshSessionStartsUnselected: true, sourcePackagesExact: true, noImplicitSave: true }
  await close('fresh-session-normal')
  assert.equal(report.nativeClosures.length, 2); assert.equal(report.screenshots.length, 3); assert.equal(report.listHandlerRestorations.length, 2)
  check('A fresh app lifetime starts with no selected Project; both exact packages and all catalog fields except derived scan time/explicit Beta open remain stable, and both lifetimes physically close normally', report.finalState)
  assert.equal(report.checks.length, 8); report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'; report.error = error.stack ?? String(error)
  if (window) try { const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-failure.png`); if (!existsSync(file)) await window.screenshot({ path: file, animations: 'disabled' }); report.failureScreenshot = { file, sha256: digest(file) } } catch (captureError) { report.failureScreenshotError = String(captureError) }
  throw error
} finally {
  try {
    await restoreListGate()
    if (window) {
      await window.keyboard.press('Escape')
      const add = window.getByRole('dialog', { name: 'Add Workspace', exact: true })
      if (await add.isVisible()) await add.getByRole('button', { name: 'Cancel', exact: true }).click()
      if (beta) await closeProject(beta)
    }
    await close('finally-normal')
  } catch (closeError) { report.outcome = 'failed'; report.closeError = closeError.stack ?? String(closeError); process.exitCode = 1 }
  report.finishedAt = new Date().toISOString(); persist()
}
