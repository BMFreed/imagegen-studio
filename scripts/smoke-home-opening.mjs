/**
 * Built Home opening gestures and captured recovery-target qualification over base83179d52.
 * Presentation follows docs/features/home-screen.md, specs/04-ui-ux-navigation.md and the
 * existing Vue/Naive prototype App.vue/HomePrototype.vue. Main/storage owners are unchanged;
 * closed-prepared fixtures reuse their real package/shadow operations, without API mocks or ML.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  cpSync,
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron, expect } from '@playwright/test'
import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectShadowStore } from '../src/main/projects/project-shadow.ts'
import { parseProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
} from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4, 'Use --report-file ABSOLUTE_NEW_OWNED_REPORT')
assert.equal(process.argv[2], '--report-file')
const reportFile = process.argv[3]
const evidenceRoot = path.dirname(reportFile)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const relative = path.relative(artifactRoot, evidenceRoot)
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
assert.equal(realpathSync(evidenceRoot), evidenceRoot)
assert.equal(lstatSync(evidenceRoot).isSymbolicLink(), false)
assert.equal(existsSync(reportFile), false)
const payload = mkdtempSync(path.join(evidenceRoot, 'native-home-opening-'))
const appData = path.join(payload, 'data/imagegen-studio')
const folder = path.join(payload, 'selected-workspace')
mkdirSync(folder)
const execute = promisify(execFile)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const digest = (file) => hash(readFileSync(file))
const sourceFiles = [
  'scripts/smoke-home-opening.mjs',
  'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs',
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/shared/api.ts',
  'src/main/projects/project-service.ts',
  'src/main/projects/project-generation-recovery.ts',
  'src/main/projects/project-generation-operation-gate.ts',
  'src/main/projects/project-index.ts',
  'src/main/projects/project-preview-resource.ts',
  'src/main/projects/project-identity.ts',
  'src/main/projects/project-location-registry.ts',
  'src/main/projects/project-path-lock.ts',
  'src/main/projects/project-trash-store.ts',
  'src/main/projects/project-shadow.ts',
  'src/main/projects/project-autosave.ts',
  'src/main/projects/igs-package.ts',
  'src/main/projects/project-placeholders.ts',
  'src/shared/projects/project-schema.ts',
  'src/shared/projects/home-project-browse.ts',
  'src/renderer/App.vue',
  'src/renderer/components/HomeView.vue',
  'src/renderer/components/HomeProjectInspector.vue',
  'src/renderer/components/HomeProjectPreview.vue',
  'src/renderer/components/AppChrome.vue',
  'src/renderer/components/ProjectTrashModal.vue',
  'src/renderer/components/project-canvas-geometry.ts',
  'src/renderer/styles/global.css',
]
const report = {
  outcome: 'running',
  mode: 'home-opening',
  startedAt: new Date().toISOString(),
  payloads: [payload],
  checks: [],
  screenshots: [],
  nativeClosures: [],
  resourceChecks: [],
  pageErrors: [],
  vueWarnings: [],
  sourceSha256: Object.fromEntries(sourceFiles.map((file) => [file, digest(file)])),
  bundleSha256: Object.fromEntries([
    'dist/main/main.cjs',
    'dist/preload/preload.cjs',
    'dist/renderer/index.html',
    ...readdirSync('dist/renderer/assets').filter((name) => /\.(?:js|css)$/.test(name)).map((name) => `dist/renderer/assets/${name}`),
  ].map((file) => [file, digest(file)])),
  boundary: 'Actual built Home/preload/Main/SQLite and real package/shadow owners. Home-only current/new presentation targets and gesture guards; production Open, recovery, queue/history and persistence APIs remain unchanged. Only actual UI actions open/resolve recovery; direct APIs prepare fixtures and inspect existing Main owners. OS Add Workspace picker and one actual Open timing gate/observer delegate originals and restore exact callback identity. Closed-prepared recovery and exact owned file renames are controlled fixtures, not crash qualification. Original saved packages and shadow inputs are retained separately before explicit Recover/Discard/own dirty Close. No implicit Save, inference, runtime/model copy, foreign data or process.',
  sourceBasis: { baseRevision: '83179d52b187d3c8a4566d892109a115edb8d94d', paths: ['docs/features/home-screen.md', 'docs/specs/04-ui-ux-navigation.md', 'docs/prototype-app/src/App.vue', 'docs/prototype-app/src/prototypes/home/HomePrototype.vue'], note: 'UI presentation only; no fresh Invoke source review or new Main/storage mechanism is claimed.' },
}
let application, window, database, workspace, projects, files
let nativeChecks = []
let missingRetained
let recoveredMissingRetained
const openedProjectIds = new Set()
function persist() {
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
}
function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence })
  persist()
  console.log(`PASS ${name}`)
}
async function api(method, ...args) {
  const result = await window.evaluate(({ method, args }) => window.api.projects[method](...args), { method, args })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function bound(label) {
  const result = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds: 480,
    execute: (file, args, options) => execute(file, args.map((item) => item === 'MemoryMax=12G' ? 'MemoryMax=2G' : item), options),
  })
  nativeChecks.push(result)
  report.resourceChecks.push({ label, ...result })
  persist()
}
async function launch(label) {
  const env = { ...process.env, NODE_ENV: 'test', CUDA_VISIBLE_DEVICES: '', XDG_CONFIG_HOME: path.join(payload, 'config'), XDG_DATA_HOME: path.join(payload, 'data') }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.IMAGEGEN_DEV_SERVER_URL
  delete env.IMAGEGEN_TEST_IMAGE_WORKER
  nativeChecks = []
  application = await electron.launch({ args: ['--ozone-platform=x11', '.'], cwd: process.cwd(), env, timeout: 30_000 })
  await bound(`${label}-launch`)
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(10_000)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  window.on('console', (message) => {
    if (message.text().includes('[Vue warn]')) report.vueWarnings.push(message.text())
  })
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await expect.poll(async () => (await api('listWorkspaces')).length).toBeGreaterThan(0)
  database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
}
async function close(label) {
  if (!application) return
  if (database) { await database.close(); database = null }
  await bound(`${label}-before-close`)
  await application.close()
  report.nativeClosures.push({ label, ...(await confirmQualificationProcessExit(nativeChecks)) })
  application = null
  window = null
  persist()
}

const home = () => window.getByLabel('Workspace navigation', { exact: true })
const inspector = () => window.getByLabel('Project inspector', { exact: true })
const row = (id) => window.locator(`.project-row[data-project-id="${id}"]`)
const selectButton = (project) => row(project.id).getByRole('button', { name: `Select ${project.title}`, exact: true })
const tab = (title) => window.getByRole('tab', { name: title, exact: true })
const recovery = () => window.getByRole('dialog', { name: 'Recovery available', exact: true })
const menuOption = (label) => window.locator('.n-dropdown-option:visible').filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })
const viewButton = (mode) => window.getByRole('button', { name: mode === 'grid' ? 'Grid view' : 'List view', exact: true })
async function tabLabels() {
  return window.getByRole('tablist', { name: 'Open documents', exact: true }).getByRole('tab').evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')))
}
async function viewport(width, height) {
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width, height })
  await expect.poll(() => window.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([width, height])
}
async function screenshot(name, width, height) {
  await viewport(width, height)
  await window.evaluate(() => document.fonts.ready.then(() => undefined))
  await window.mouse.move(0, 0)
  const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-${name}.png`)
  assert.equal(existsSync(file), false)
  await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push({ file, width, height, sha256: digest(file) })
  persist()
}
async function refresh() {
  const button = window.getByRole('button', { name: 'Refresh projects', exact: true })
  await button.click()
  await expect(button).toBeEnabled()
}
async function browseWorkspace() {
  if (await tab('Home').count() === 0) await window.getByRole('button', { name: 'Open Home', exact: true }).click()
  await tab('Home').click()
  await expect(tab('Home')).toHaveAttribute('aria-selected', 'true')
  await home().locator('.workspace-select').filter({ hasText: workspace.displayName }).click()
  await expect(window.getByRole('heading', { name: workspace.displayName, exact: true })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled()
}
async function mode(value) {
  await viewButton(value).click()
  await expect(viewButton(value)).toHaveAttribute('aria-pressed', 'true')
  await expect(window.getByLabel(value === 'grid' ? 'Project grid' : 'Project list', { exact: true })).toBeVisible()
}
async function select(project) {
  await selectButton(project).click()
  await expect(selectButton(project)).toHaveAttribute('aria-pressed', 'true')
  await expect(inspector().getByRole('heading', { name: project.title, exact: true })).toBeVisible()
}
async function context(project) {
  await selectButton(project).click({ button: 'right' })
  await expect(selectButton(project)).toHaveAttribute('aria-pressed', 'true')
  await expect(inspector().getByRole('heading', { name: project.title, exact: true })).toBeVisible()
}
async function opened(project, target, previous, existing = false) {
  await expect(tab(project.title)).toHaveCount(1)
  await expect(tab(project.title)).toHaveAttribute('aria-selected', 'true')
  const expected = existing ? previous : [
    ...(target === 'new' ? ['Home'] : []),
    project.title,
    ...previous.filter((label) => label !== 'Home' && label !== project.title),
  ]
  await expect.poll(tabLabels).toEqual(expected)
  if (expected.includes('Home')) await expect(window.locator('.chrome-context')).toHaveText('Projects')
  else await expect(window.locator('.chrome-context')).toHaveCount(0)
  if (!existing) openedProjectIds.add(project.id)
  // Close becomes enabled only after the actual Open/recovery request's finally clears pending.
  await expect(window.getByRole('button', { name: `Close ${project.title}`, exact: true })).toBeEnabled()
}
async function closeProject(project) {
  if (await tab(project.title).count() === 0) return
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  const modal = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect.poll(async () => await tab(project.title).count() === 0 ? 'closed' : await modal.isVisible() ? 'decision' : 'pending').not.toBe('pending')
  if (await modal.isVisible()) {
    const discard = modal.getByRole('button', { name: 'Discard Changes', exact: true })
    if (await discard.count()) {
      await discard.click()
      report.explicitDirtyCloses ??= []
      report.explicitDirtyCloses.push({ projectId: project.id, title: project.title, action: 'Discard Changes' })
    } else {
      await modal.getByRole('button', { name: /^(?:Close and Keep Recovery|Discard Candidates and Close|Cancel Jobs and Close)$/ }).click()
    }
    await expect(modal).toHaveCount(0)
  }
  await expect(tab(project.title)).toHaveCount(0)
  // Main Close removes the tab before App finishes its catalog refresh/finally.
  // Wait for the real remaining command to become enabled before navigating again.
  const remainingClose = window.locator('.document-tab:not([aria-label="Home"]) button.tab-close').first()
  if (await remainingClose.count()) await expect(remainingClose).toBeEnabled()
  else if (await home().isVisible()) await expect(window.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled()
}
async function closeOwnProjects() {
  if (!window || !projects) return
  if (await recovery().isVisible()) {
    await recovery().getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(recovery()).toHaveCount(0)
  }
  for (const project of projects) await closeProject(project)
}
async function records() {
  return Object.fromEntries(await Promise.all(projects.map(async (project) => [project.id, await database.db.selectFrom('project_index').selectAll().where('local_project_key', '=', project.id).executeTakeFirstOrThrow()])))
}
function tree(directory) {
  if (!existsSync(directory)) return []
  const entries = []
  function visit(base, prefix) {
    assert.equal(lstatSync(base).isSymbolicLink(), false)
    for (const name of readdirSync(base).sort()) {
      const target = path.join(base, name)
      const relativeName = path.posix.join(prefix, name)
      const entry = lstatSync(target)
      assert.equal(entry.isSymbolicLink(), false)
      if (entry.isDirectory()) visit(target, relativeName)
      else { assert.equal(entry.isFile(), true); entries.push({ path: relativeName, bytes: entry.size, sha256: digest(target) }) }
    }
  }
  visit(directory, '')
  return entries
}
function assertPackages(hashes) {
  for (const project of projects) {
    const actual = project.title === 'Missing Project' && missingRetained ? missingRetained : project.title === 'Recover Project' && recoveredMissingRetained ? recoveredMissingRetained : files[project.id]
    assert.equal(digest(actual), hashes[project.id], `${project.title}: no implicit Save or package replacement.`)
  }
}
function assertIdentity(before, after, includeOpened) {
  for (const project of projects) {
    for (const key of ['local_project_key', 'canonical_path', 'workspace_id', 'document_id', 'document_revision', ...(includeOpened ? ['last_opened_at'] : [])]) {
      assert.equal(after[project.id][key], before[project.id][key], `${project.title}: ${key}`)
    }
  }
}
async function prepareFixtures() {
  await application.evaluate(({ dialog }, folder) => {
    if (globalThis.__igsHomeOpeningPicker) throw new Error('Unexpected picker owner')
    const original = dialog.showOpenDialog
    const state = { original, calls: [] }
    globalThis.__igsHomeOpeningPicker = state
    dialog.showOpenDialog = async (owner, options) => {
      if (options.title !== 'Add Workspace') return original.call(dialog, owner, options)
      if (JSON.stringify(options.properties) !== JSON.stringify(['openDirectory', 'createDirectory'])) throw new Error('Wrong Add Workspace picker contract')
      state.calls.push({ title: options.title, properties: options.properties, selectedPath: folder })
      return { canceled: false, filePaths: [folder] }
    }
  }, folder)
  try {
    await home().getByRole('button', { name: 'Add Workspace', exact: true }).click()
    const modal = window.getByRole('dialog', { name: 'Add Workspace', exact: true })
    await modal.getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Opening Workspace')
    await modal.getByRole('button', { name: 'Choose Folder and Add', exact: true }).click()
    await expect(modal).toHaveCount(0)
    workspace = (await api('listWorkspaces')).find(({ isDefault }) => !isDefault)
    assert.ok(workspace)
    assert.equal(workspace.directoryPath, folder)
  } finally {
    report.pickerRestoration = await application.evaluate(({ dialog }) => {
      const state = globalThis.__igsHomeOpeningPicker
      if (!state) throw new Error('Missing picker owner')
      dialog.showOpenDialog = state.original
      delete globalThis.__igsHomeOpeningPicker
      return { restored: dialog.showOpenDialog === state.original, calls: state.calls }
    })
    assert.equal(report.pickerRestoration.restored, true)
    persist()
  }
  for (const title of ['Anchor Project', 'Current Project', 'New Project', 'Menu Project', 'Recover Project', 'Discard Project', 'Missing Project', 'Trash Project']) {
    const created = await api('create', { title, width: 640, height: 512, workspaceId: workspace.id })
    await api('close', created.id, false)
    // Create chooses a UUID filename. Prepare a named source before baseline capture so
    // the later unchanged-name maintenance control is truly a no-op.
    if (title === 'Current Project') await api('renameProject', created.id, title)
  }
  projects = await api('list', workspace.id)
  assert.equal(projects.length, 8)
  const initialRecords = await records()
  files = Object.fromEntries(projects.map((project) => [project.id, initialRecords[project.id].canonical_path]))
  for (const project of projects) await expect(tab(project.title)).toHaveCount(0)
  check('Eight closed saved fixtures use real Main Create and Close; Add Workspace restores the exact controlled OS picker', { workspace, projects, records: initialRecords, pickerRestoration: report.pickerRestoration })
}

/** Actual projects:open timing/call observation; every intercepted call delegates its original handler. */
async function observeOpen(projectId, gate = false) {
  await application.evaluate(({ ipcMain }, { projectId, gate }) => {
    if (globalThis.__igsHomeOpeningOpenObserver) throw new Error('Unexpected Open observer owner')
    const channel = 'projects:open'
    const handlers = ipcMain._invokeHandlers
    const original = handlers.get(channel)
    if (typeof original !== 'function') throw new Error('Real projects:open handler is absent')
    const state = { channel, original, projectId, calls: [], entered: false, finished: false, pending: null, release: null }
    const barrier = gate ? new Promise((resolve) => { state.release = resolve }) : Promise.resolve()
    const wrapper = async (...args) => {
      if (args[1] !== projectId) return original(...args)
      state.calls.push({ projectId: args[1], enteredAt: new Date().toISOString() })
      state.entered = true
      const pending = (async () => {
        await barrier
        try {
          const result = await original(...args)
          state.result = { ok: result?.ok, kind: result?.value?.kind, projectId: result?.value?.tab?.id, error: result?.error }
          return result
        } finally { state.finished = true }
      })()
      state.pending = pending
      return await pending
    }
    state.wrapper = wrapper
    globalThis.__igsHomeOpeningOpenObserver = state
    handlers.set(channel, wrapper)
  }, { projectId, gate })
}
async function observerState() {
  return application.evaluate(() => {
    const state = globalThis.__igsHomeOpeningOpenObserver
    return state ? { projectId: state.projectId, calls: state.calls, entered: state.entered, finished: state.finished, result: state.result } : null
  })
}
async function releaseOpen() {
  await application.evaluate(() => {
    const state = globalThis.__igsHomeOpeningOpenObserver
    if (!state?.release) throw new Error('Owned Open gate is absent')
    state.release()
  })
}
async function restoreOpenObserver() {
  if (!application) return null
  const result = await application.evaluate(async ({ ipcMain }) => {
    const state = globalThis.__igsHomeOpeningOpenObserver
    if (!state) return null
    state.release?.()
    if (state.pending) await state.pending.catch(() => undefined)
    if (ipcMain._invokeHandlers.get(state.channel) !== state.wrapper) throw new Error('Open handler ownership changed')
    ipcMain._invokeHandlers.set(state.channel, state.original)
    const result = { projectId: state.projectId, restored: ipcMain._invokeHandlers.get(state.channel) === state.original, calls: state.calls, entered: state.entered, finished: state.finished, result: state.result }
    delete globalThis.__igsHomeOpeningOpenObserver
    return result
  })
  if (result) {
    assert.equal(result.restored, true)
    report.openHandlerRestorations ??= []
    report.openHandlerRestorations.push(result)
    persist()
  }
  return result
}

persist()
try {
  await launch('fixtures')
  await prepareFixtures()
  await close('fixtures-normal')
  const byTitle = (title) => projects.find((project) => project.title === `${title} Project`)
  const anchor = byTitle('Anchor'), current = byTitle('Current'), fresh = byTitle('New'), menu = byTitle('Menu')
  const recover = byTitle('Recover'), discard = byTitle('Discard'), missing = byTitle('Missing'), trash = byTitle('Trash')
  const shadow = new ProjectShadowStore(path.join(appData, 'autosave'))
  const backups = path.join(payload, 'original-inputs')
  mkdirSync(backups)
  const beforeHashes = Object.fromEntries(projects.map((project) => [project.id, digest(files[project.id])]))
  for (const project of projects) cpSync(files[project.id], path.join(backups, `${project.id}.igs`), { errorOnExist: true, force: false })
  const recoveryInputs = []
  for (const project of [recover, discard]) {
    const saved = await readIgsPackage(files[project.id])
    const document = parseProjectDocumentV1({ ...saved.project, documentRevision: randomUUID(), primaryBbox: { ...saved.project.primaryBbox, x: 8 } })
    await shadow.write({ projectPath: files[project.id], savedDocument: saved.project, document })
    assert.equal((await shadow.inspect({ projectPath: files[project.id], savedPackage: saved })).status, 'recoverable')
    const directory = path.join(appData, 'autosave', project.id)
    const backup = path.join(backups, `${project.id}-shadow`)
    cpSync(directory, backup, { recursive: true, errorOnExist: true, force: false })
    recoveryInputs.push({ projectId: project.id, saved, directory, backup, before: tree(directory), recoveredRevision: document.documentRevision })
    assert.deepEqual(tree(backup), tree(directory))
  }
  report.recoveryInputs = recoveryInputs.map(({ saved, ...input }) => ({ ...input, savedRevision: saved.project.documentRevision }))
  report.originalPackages = { directory: backups, beforeHashes }
  persist()

  await launch('opening-gestures')
  await viewport(1440, 900)
  await browseWorkspace()
  await refresh()
  const beforeRecords = await records()
  const summaries = await api('list', workspace.id)
  for (const project of [recover, discard]) assert.equal(summaries.find(({ id }) => id === project.id).recoveryStatus, 'recoverable')
  await mode('grid')
  await select(current)
  await row(menu.id).getByRole('button', { name: `${menu.title} project actions`, exact: true }).click()
  await expect(menuOption('Open')).toBeVisible()
  await expect(menuOption('Open in New Tab')).toBeVisible()
  await expect(selectButton(current)).toHaveAttribute('aria-pressed', 'true')
  await expect(selectButton(menu)).toHaveAttribute('aria-pressed', 'false')
  await window.keyboard.press('Escape')
  await expect(menuOption('Open')).toHaveCount(0)
  await expect.poll(tabLabels).toEqual(['Home'])
  const readOnlyRecords = await records()
  assertIdentity(beforeRecords, readOnlyRecords, true)
  assertPackages(beforeHashes)
  for (const input of recoveryInputs) assert.deepEqual(tree(input.directory), input.before)
  await screenshot('selection-grid-wide', 1440, 900)
  check('Plain Grid selection and nested overflow preserve Inspector owner all package bytes keys lastOpened and both dirty shadows without Open', { beforeRecords, readOnlyRecords, beforeHashes })

  await select(anchor)
  let order = await tabLabels()
  await inspector().getByRole('button', { name: 'Open in New Tab', exact: true }).click()
  await opened(anchor, 'new', order)
  await browseWorkspace()
  order = await tabLabels()
  await selectButton(fresh).click({ modifiers: ['Control'] })
  await opened(fresh, 'new', order)
  await browseWorkspace()
  const twoProjectOrder = await tabLabels()
  await selectButton(anchor).click({ modifiers: ['Control'] })
  await opened(anchor, 'new', twoProjectOrder, true)
  await browseWorkspace()
  await screenshot('new-tab-order-wide', 1440, 900)
  check('Inspector New and Ctrl-click insert directly after Home before another Project; reopening focuses the unique existing tab without reordering', { order: twoProjectOrder })

  await expect(tab(current.title)).toHaveCount(0)
  assert.deepEqual(twoProjectOrder, ['Home', fresh.title, anchor.title])
  const maintenanceRecords = await records()
  const maintenanceFocus = await window.getByRole('tablist', { name: 'Open documents', exact: true }).locator('[aria-selected="true"]').getAttribute('aria-label')
  await window.evaluate(() => {
    if (window.__igsHomeOpeningTabSnapshot) throw new Error('Unexpected tabsChanged observer owner')
    const state = { receipts: [], settled: false, unsubscribe: null }
    state.unsubscribe = window.api.projects.onTabsChanged((tabs) => {
      state.receipts.push(tabs.map(({ id, title, documentId, documentRevision, dirty }) => ({ id, title, documentId, documentRevision, dirty })))
      // App subscribed first; observe its Vue render after the actual Main snapshot receipt.
      requestAnimationFrame(() => requestAnimationFrame(() => { state.settled = true }))
    })
    window.__igsHomeOpeningTabSnapshot = state
  })
  try {
    // No-op maintenance control, not UI Rename qualification: the closed source name is unchanged.
    const maintenance = await api('renameProject', current.id, current.title)
    assert.equal(maintenance.kind, 'renamed')
    await expect.poll(() => window.evaluate(() => window.__igsHomeOpeningTabSnapshot.receipts.length)).toBeGreaterThan(0)
    await expect.poll(() => window.evaluate(() => window.__igsHomeOpeningTabSnapshot.settled)).toBe(true)
    assert.deepEqual(await window.evaluate(() => window.__igsHomeOpeningTabSnapshot.receipts.at(-1).map(({ id }) => id)), [anchor.id, fresh.id], 'The real Main insertion order must differ from the Home-adjacent UI order in this control.')
    await expect.poll(tabLabels).toEqual(twoProjectOrder)
    await expect(tab(maintenanceFocus)).toHaveAttribute('aria-selected', 'true')
    assertPackages(beforeHashes)
    assertIdentity(maintenanceRecords, await records(), true)
  } finally {
    report.maintenanceSnapshotControl = await window.evaluate(() => {
      const state = window.__igsHomeOpeningTabSnapshot
      if (!state) throw new Error('Missing tabsChanged observer owner')
      state.unsubscribe()
      delete window.__igsHomeOpeningTabSnapshot
      return { receipts: state.receipts, settled: state.settled, unsubscribed: true, observerRemoved: !window.__igsHomeOpeningTabSnapshot }
    })
    persist()
  }
  check('Actual no-op closed-Project maintenance emits a real preload tabsChanged snapshot without resetting Home-adjacent UI order focus package bytes identities or lastOpened', { order: twoProjectOrder, focus: maintenanceFocus, maintenanceRecords, observer: report.maintenanceSnapshotControl })

  order = await tabLabels()
  await selectButton(menu).dblclick({ modifiers: ['Meta'] })
  await opened(menu, 'new', order)
  await browseWorkspace()
  const modifierOrder = await tabLabels()
  await selectButton(menu).dblclick({ modifiers: ['Control'] })
  await opened(menu, 'new', modifierOrder, true)
  await browseWorkspace()
  check('Cmd modified double-click opens a new Project once and Ctrl modified double-click on the existing tab never falls through to current replacement', { order: modifierOrder })

  await mode('list')
  order = await tabLabels()
  await selectButton(current).click({ button: 'middle' })
  await opened(current, 'new', order)
  await browseWorkspace()
  const listOrder = await tabLabels()
  await selectButton(anchor).click({ button: 'middle' })
  await opened(anchor, 'new', listOrder, true)
  await browseWorkspace()
  await selectButton(anchor).press('Enter')
  await opened(anchor, 'current', listOrder, true)
  check('Actual List middle-click inserts after Home and existing middle or Enter only focuses without duplicate tabs or Home removal', { order: listOrder })

  await closeProject(current)
  await browseWorkspace()
  await mode('list')
  order = await tabLabels()
  await selectButton(current).press('Enter')
  await opened(current, 'current', order)
  await closeProject(current)
  check('List Enter replaces Home only after successful actual Open and the global chrome action can reopen Home')

  await browseWorkspace()
  await mode('grid')
  order = await tabLabels()
  await selectButton(current).dblclick()
  await opened(current, 'current', order)
  await closeProject(current)
  await browseWorkspace()
  await mode('list')
  order = await tabLabels()
  await row(current.id).getByRole('button', { name: `Open ${current.title}`, exact: true }).click()
  await opened(current, 'current', order)
  await closeProject(current)
  await browseWorkspace()
  await select(current)
  order = await tabLabels()
  await inspector().getByRole('button', { name: 'Open Project', exact: true }).click()
  await opened(current, 'current', order)
  await closeProject(current)
  check('Unmodified Grid double-click List nested Open and Inspector Open all use successful current replacement through the existing Main owner')

  await closeProject(menu)
  await browseWorkspace()
  await mode('grid')
  await viewport(900, 620)
  order = await tabLabels()
  await context(menu)
  await expect(menuOption('Open')).toBeVisible()
  await expect(menuOption('Open in New Tab')).toBeVisible()
  await screenshot('context-menu-narrow', 900, 620)
  await menuOption('Open in New Tab').click()
  await opened(menu, 'new', order)
  await closeProject(menu)
  await browseWorkspace()
  await mode('list')
  order = await tabLabels()
  await context(menu)
  await menuOption('Open').click()
  await opened(menu, 'current', order)
  await closeProject(menu)
  await viewport(1440, 900)
  check('Right-click Grid and List select the passive row and the real manual menu routes Open New versus current without accidental left-click Open')

  await browseWorkspace()
  await select(recover)
  const cancelNewOrder = await tabLabels()
  await inspector().getByRole('button', { name: 'Open in New Tab', exact: true }).click()
  await expect(recovery()).toBeVisible()
  await expect(tab(recover.title)).toHaveCount(0)
  await expect.poll(tabLabels).toEqual(cancelNewOrder)
  await screenshot('recovery-pending-narrow', 900, 620)
  await recovery().getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(recovery()).toHaveCount(0)
  await expect.poll(tabLabels).toEqual(cancelNewOrder)
  for (const input of recoveryInputs) assert.deepEqual(tree(input.directory), input.before)
  await select(current)
  order = await tabLabels()
  await inspector().getByRole('button', { name: 'Open Project', exact: true }).click()
  await opened(current, 'current', order)
  await closeProject(current)
  check('Cancel after captured New leaves Home and shadows intact; a following different current request replaces Home with its own intent')

  await browseWorkspace()
  await select(discard)
  const cancelCurrentOrder = await tabLabels()
  await inspector().getByRole('button', { name: 'Open Project', exact: true }).click()
  await expect(recovery()).toBeVisible()
  await expect(tab(discard.title)).toHaveCount(0)
  await expect.poll(tabLabels).toEqual(cancelCurrentOrder)
  await recovery().getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(recovery()).toHaveCount(0)
  await expect.poll(tabLabels).toEqual(cancelCurrentOrder)
  for (const input of recoveryInputs) assert.deepEqual(tree(input.directory), input.before)
  await select(current)
  order = await tabLabels()
  await inspector().getByRole('button', { name: 'Open in New Tab', exact: true }).click()
  await opened(current, 'new', order)
  await closeProject(current)
  check('Cancel after captured current leaves Home and recovery unchanged; a following different New request keeps Home and inserts at its own position')

  await browseWorkspace()
  await select(recover)
  order = await tabLabels()
  await inspector().getByRole('button', { name: 'Open in New Tab', exact: true }).click()
  await expect(recovery()).toBeVisible()
  await recovery().getByRole('button', { name: 'Recover', exact: true }).click()
  await expect(recovery()).toHaveCount(0)
  await opened(recover, 'new', order)
  // Diagnostic read of the already-open owner; this does not resolve recovery or fabricate a tab.
  const recovered = await api('open', recover.id)
  assert.equal(recovered.kind, 'opened')
  assert.equal(recovered.tab.dirty, true)
  assert.equal(recovered.tab.primaryBbox.x, 8)
  const recoveredInput = recoveryInputs.find(({ projectId }) => projectId === recover.id)
  // Existing ProjectSession recovery deliberately issues and republishes a fresh revision.
  assert.notEqual(recovered.tab.documentRevision, recoveredInput.recoveredRevision)
  assert.notEqual(recovered.tab.documentRevision, recoveredInput.saved.project.documentRevision)
  const recoveredShadow = await shadow.inspect({ projectPath: files[recover.id], savedPackage: recoveredInput.saved })
  assert.equal(recoveredShadow.status, 'recoverable')
  assert.deepEqual(recoveredShadow.document, {
    ...recoveredInput.saved.project,
    documentRevision: recovered.tab.documentRevision,
    primaryBbox: { ...recoveredInput.saved.project.primaryBbox, x: 8 },
  })
  await expect(tab(recover.title).getByLabel('Unsaved changes', { exact: true })).toBeVisible()
  assertPackages(beforeHashes)
  await screenshot('recovered-dirty-wide', 1440, 900)
  check('Explicit Recover retains captured New target and restores real dirty bbox x8 with its owner-issued fresh revision without changing any saved package', { recoveredTab: recovered.tab, recoveredShadowDocument: recoveredShadow.document })

  await browseWorkspace()
  recoveredMissingRetained = path.join(payload, 'retained-live-recover.igs')
  renameSync(files[recover.id], recoveredMissingRetained)
  await refresh()
  assert.equal((await api('list', workspace.id)).find(({ id }) => id === recover.id).health, 'missing')
  await select(recover)
  await expect(inspector().getByRole('button', { name: 'Switch to Project', exact: true })).toBeEnabled()
  await expect(inspector().getByRole('button', { name: 'Open in New Tab', exact: true })).toBeEnabled()
  await observeOpen(recover.id)
  const missingOpenOrder = await tabLabels()
  await inspector().getByRole('button', { name: 'Switch to Project', exact: true }).click()
  await opened(recover, 'current', missingOpenOrder, true)
  await browseWorkspace()
  await selectButton(recover).click({ modifiers: ['Control'] })
  await opened(recover, 'new', missingOpenOrder, true)
  await browseWorkspace()
  await selectButton(recover).click({ button: 'middle' })
  await opened(recover, 'new', missingOpenOrder, true)
  const focusObserver = await restoreOpenObserver()
  assert.deepEqual(focusObserver.calls, [])
  const missingExisting = await api('open', recover.id)
  assert.equal(missingExisting.kind, 'opened')
  assert.deepEqual(missingExisting.tab, recovered.tab)
  renameSync(recoveredMissingRetained, files[recover.id])
  recoveredMissingRetained = undefined
  assertPackages(beforeHashes)
  check('A real dirty recovered tab remains uniquely focusable after its saved source becomes Missing; current Ctrl and middle focus call no Main Open and preserve exact content', { observer: focusObserver, recoveredTab: missingExisting.tab })

  await browseWorkspace()
  await select(discard)
  order = await tabLabels()
  await inspector().getByRole('button', { name: 'Open Project', exact: true }).click()
  await expect(recovery()).toBeVisible()
  await recovery().getByRole('button', { name: 'Discard Recovery and Open Saved', exact: true }).click()
  await expect(recovery()).toHaveCount(0)
  await opened(discard, 'current', order)
  const savedOpened = await api('open', discard.id)
  assert.equal(savedOpened.kind, 'opened')
  assert.equal(savedOpened.tab.dirty, false)
  assert.equal(savedOpened.tab.primaryBbox.x, 0)
  assertPackages(beforeHashes)
  const discardedInput = recoveryInputs.find(({ projectId }) => projectId === discard.id)
  assert.deepEqual(tree(discardedInput.backup), discardedInput.before)
  await screenshot('discard-current-wide', 1440, 900)
  await closeProject(discard)
  check('Explicit Discard Recovery retains captured current target opens saved bbox x0 and removes Home without Save; original recovery input remains separately retained', { savedTab: savedOpened.tab, originalShadowBackup: discardedInput.backup })

  await browseWorkspace()
  await mode('grid')
  await select(missing)
  await expect(inspector().getByRole('button', { name: 'Open Project', exact: true })).toBeEnabled()
  assert.equal((await api('list', workspace.id)).find(({ id }) => id === missing.id).health, 'ready')
  missingRetained = path.join(payload, 'retained-closed-missing.igs')
  renameSync(files[missing.id], missingRetained)
  await observeOpen(missing.id)
  order = await tabLabels()
  await inspector().getByRole('button', { name: 'Open Project', exact: true }).click()
  await expect.poll(async () => (await observerState()).finished).toBe(true)
  await expect(window.locator('.browser-error').filter({ hasText: 'Project action failed' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled()
  await expect.poll(tabLabels).toEqual(order)
  await expect(tab(missing.title)).toHaveCount(0)
  const failedObserver = await restoreOpenObserver()
  assert.equal(failedObserver.calls.length, 1)
  assert.equal(failedObserver.result.ok, false)
  assert.equal(failedObserver.result.error.code, 'PROJECT_NOT_READY')
  await refresh()
  assert.equal((await api('list', workspace.id)).find(({ id }) => id === missing.id).health, 'missing')
  await select(missing)
  await expect(inspector().getByRole('button', { name: 'Open Project', exact: true })).toBeDisabled()
  await expect(inspector().getByRole('button', { name: 'Open in New Tab', exact: true })).toBeDisabled()
  await context(missing)
  for (const label of ['Open', 'Open in New Tab']) await expect(menuOption(label).locator('.n-dropdown-option-body')).toHaveClass(/n-dropdown-option-body--disabled/)
  await window.keyboard.press('Escape')
  assertPackages(beforeHashes)
  check('Cached Ready actual Open delegates Main refusal and keeps Home; real Refresh makes closed Missing Inspector and context Open targets disabled', { observer: failedObserver, retainedPackage: missingRetained })

  await row(trash.id).getByRole('button', { name: `${trash.title} project actions`, exact: true }).click()
  await menuOption('Move to Trash').click()
  const trashModal = window.getByRole('dialog', { name: 'Move Project to Trash', exact: true })
  await expect(trashModal).toBeVisible()
  await trashModal.getByRole('button', { name: 'Move to Trash', exact: true }).click()
  await expect(trashModal).toHaveCount(0)
  await home().getByRole('button', { name: /^Trash(?:\s*\d+)?$/ }).click()
  await expect(row(trash.id)).toBeVisible()
  await context(trash)
  await expect(menuOption('Restore Project')).toBeVisible()
  await expect(menuOption('Open')).toHaveCount(0)
  await expect(menuOption('Open in New Tab')).toHaveCount(0)
  await expect(inspector().getByRole('button', { name: 'Open Project', exact: true })).toHaveCount(0)
  await expect(inspector().getByRole('button', { name: 'Open in New Tab', exact: true })).toHaveCount(0)
  const trashOrder = await tabLabels()
  await window.evaluate(() => {
    const state = { events: [], listener: null }
    state.listener = (event) => {
      const item = { type: event.type, button: event.button, key: event.key, prevented: event.defaultPrevented, target: event.target?.className }
      state.events.push(item)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        item.visibleMenus = [...document.querySelectorAll('.n-dropdown-option')].filter((node) => node.getBoundingClientRect().height > 0).map((node) => node.textContent)
      }))
    }
    for (const name of ['click', 'auxclick', 'contextmenu', 'keydown', 'keyup', 'mousedown', 'mouseup']) document.addEventListener(name, state.listener)
    window.__igsHomeOpeningTrashTrace = state
  })
  try {
  await window.keyboard.press('Escape')
  await selectButton(trash).dblclick({ modifiers: ['Control'] })
  await selectButton(trash).click({ button: 'middle' })
  await selectButton(trash).press('Enter')
  await expect.poll(tabLabels).toEqual(trashOrder)
  await context(trash)
  await expect(menuOption('Restore Project')).toBeVisible()
  await inspector().getByRole('heading', { name: trash.title, exact: true }).click()
  await expect(menuOption('Restore Project')).toHaveCount(0)
  await context(trash)
  await menuOption('Restore Project').click()
  } finally {
    report.trashGestureTrace = await window.evaluate(() => {
      const state = window.__igsHomeOpeningTrashTrace
      for (const name of ['click', 'auxclick', 'contextmenu', 'keydown', 'keyup', 'mousedown', 'mouseup']) document.removeEventListener(name, state.listener)
      delete window.__igsHomeOpeningTrashTrace
      return { events: state.events, removed: true }
    })
    persist()
  }
  await expect(row(trash.id)).toHaveCount(0)
  assert.equal((await api('listTrash')).some(({ id }) => id === trash.id), false)
  assertPackages(beforeHashes)
  check('Actual Trash has Restore and no Open target; modified double middle and Enter cannot create a Project tab, and explicit Restore preserves saved bytes')

  await browseWorkspace()
  await mode('list')
  await select(current)
  await observeOpen(current.id, true)
  await row(current.id).getByRole('button', { name: `Open ${current.title}`, exact: true }).click()
  await expect.poll(async () => (await observerState()).entered).toBe(true)
  await expect(selectButton(fresh)).toBeDisabled()
  // The loading icon contributes to the primary button's accessible name.
  await expect(inspector().locator('button.inspector-open')).toBeDisabled()
  await expect(inspector().getByRole('button', { name: 'Open in New Tab', exact: true })).toBeDisabled()
  await window.getByRole('button', { name: 'Close Home', exact: true }).click()
  await expect(tab('Home')).toHaveCount(0)
  await window.getByRole('button', { name: 'Open Home', exact: true }).click()
  await expect(tab('Home')).toHaveCount(1)
  // Opening is still pending: activation is guarded, so observe the user's retained active Project.
  const activeBeforeRelease = await window.getByRole('tablist', { name: 'Open documents', exact: true }).locator('[aria-selected="true"]').getAttribute('aria-label')
  assert.equal(activeBeforeRelease, anchor.title)
  await releaseOpen()
  await expect.poll(async () => (await observerState()).finished).toBe(true)
  await expect(tab(current.title)).toHaveCount(1)
  await expect(tab(current.title)).toHaveAttribute('aria-selected', 'false')
  await expect(tab('Home')).toHaveCount(1)
  await expect(tab(activeBeforeRelease)).toHaveAttribute('aria-selected', 'true')
  await expect(window.getByRole('button', { name: `Close ${current.title}`, exact: true })).toBeEnabled()
  const staleObserver = await restoreOpenObserver()
  assert.equal(staleObserver.calls.length, 1)
  assert.equal(staleObserver.result.ok, true)
  assert.equal(staleObserver.result.kind, 'opened')
  openedProjectIds.add(current.id)
  await browseWorkspace()
  await closeProject(current)
  check('A held actual Main Open disables competing entry points; closing and reopening Home invalidates the captured epoch so late success retains its inactive tab without closing Home or stealing focus', { activeBeforeRelease, observer: staleObserver })

  await closeOwnProjects()
  assertPackages(beforeHashes)
  assert.deepEqual(Object.fromEntries(sourceFiles.map((file) => [file, digest(file)])), report.sourceSha256)
  assert.deepEqual(Object.fromEntries(Object.keys(report.bundleSha256).map((file) => [file, digest(file)])), report.bundleSha256)
  const finalRecords = await records()
  assertIdentity(beforeRecords, finalRecords, false)
  for (const project of [missing, trash]) assert.equal(finalRecords[project.id].last_opened_at, beforeRecords[project.id].last_opened_at)
  for (const project of projects) assert.equal(digest(path.join(backups, `${project.id}.igs`)), beforeHashes[project.id])
  for (const input of recoveryInputs) assert.deepEqual(tree(input.backup), input.before)
  await expect.poll(tabLabels).toEqual(['Home'])
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors))
  assert.equal(report.vueWarnings.length, 0, JSON.stringify(report.vueWarnings))
  report.finalState = { beforeRecords, finalRecords, beforeHashes, explicitlyOpenedProjectIds: [...openedProjectIds], shadowBackups: recoveryInputs.map(({ projectId, backup, before }) => ({ projectId, backup, tree: before })), missingAndTrashNeverOpened: true }
  check('All own tabs explicitly close with dirty Recover discarded by its existing owner; every package identity and original retained input remains exact with no implicit Save', report.finalState)
  await close('opening-gestures-normal')
  renameSync(missingRetained, files[missing.id])
  missingRetained = undefined
  assertPackages(beforeHashes)
  assert.equal(report.nativeClosures.length, 2)
  assert.equal(report.screenshots.length, 6)
  check('Both finite app lifetimes close normally with physical PID exit; exact owned missing file is restored only after closure and all six screenshots are retained', { closures: report.nativeClosures, restoredMissing: files[missing.id] })
  assert.equal(report.checks.length, 19)
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'
  report.error = error.stack ?? String(error)
  if (window) {
    try {
      const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-failure.png`)
      if (!existsSync(file)) await window.screenshot({ path: file, animations: 'disabled' })
      report.failureScreenshot = { file, sha256: digest(file) }
    } catch (captureError) { report.failureScreenshotError = String(captureError) }
  }
  throw error
} finally {
  try {
    await restoreOpenObserver()
    if (recoveredMissingRetained && files) {
      const project = projects.find(({ title }) => title === 'Recover Project')
      assert.equal(existsSync(files[project.id]), false)
      renameSync(recoveredMissingRetained, files[project.id])
      recoveredMissingRetained = undefined
    }
    await closeOwnProjects()
    await close('finally-normal')
    if (missingRetained && files) {
      const project = projects.find(({ title }) => title === 'Missing Project')
      assert.equal(existsSync(files[project.id]), false)
      renameSync(missingRetained, files[project.id])
      missingRetained = undefined
      report.failureMissingRestored = true
    }
  } catch (closeError) {
    report.outcome = 'failed'
    report.closeError = closeError.stack ?? String(closeError)
    // A forced kill is never a normal-close PASS; leave exact process/payload evidence to the owner.
    process.exitCode = 1
  }
  report.finishedAt = new Date().toISOString()
  persist()
}
