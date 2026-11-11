/** Real built Home/IPC/SQLite/.igs qualification. OS picker replies are controlled; the catalog race wraps IPC entry and delegates unchanged to the original handler, then restores its identity. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
} from './qualification-resource-limits.mjs'

assert.ok([4, 5].includes(process.argv.length), 'Use --report-file ABSOLUTE_NEW_OWNED_REPORT [--trash-only|--locations-only]')
const trashOnly = process.argv[4] === '--trash-only'
const locationsOnly = process.argv[4] === '--locations-only'
if (process.argv.length === 5) assert.ok(trashOnly || locationsOnly)
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
const payload = mkdtempSync(path.join(evidenceRoot, 'native-workspaces-'))
const appData = path.join(payload, 'data/imagegen-studio')
const folder = path.join(payload, 'selected-workspace')
mkdirSync(folder)
const execute = promisify(execFile)
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const report = {
  outcome: 'running',
  mode: locationsOnly ? 'locations-only' : trashOnly ? 'trash-only' : 'catalog-workspaces-and-trash',
  startedAt: new Date().toISOString(),
  payloads: [payload],
  checks: [],
  screenshots: [],
  nativeClosures: [],
  resourceChecks: [],
  pageErrors: [],
  boundary:
    'Locations-only uses controlled OS shell callbacks; it qualifies Main path selection and UI, not file-manager window UX. Actual built renderer/preload/Main/SQLite and Project package writers/loaders. Only OS picker replies are controlled; OS dialog UX and arbitrary permission races are not qualified. No ML.',
  sourceSha256: Object.fromEntries(
    [
      'scripts/smoke-home-workspaces.mjs',
      'src/main/index.ts',
      'src/preload/index.ts',
      'src/main/projects/project-index.ts',
      'src/main/projects/project-service.ts',
      'src/shared/projects/project-create.ts',
      'src/shared/projects/project-workspaces.ts',
      'src/shared/api.ts',
      'src/renderer/App.vue',
      'src/renderer/components/HomeView.vue',
      'src/renderer/components/AddWorkspaceModal.vue',
      'src/renderer/components/WorkspaceSettingsModal.vue',
      'src/main/projects/project-path-lock.ts',
      'src/main/projects/project-trash-store.ts',
      'src/main/projects/project-preview-resource.ts',
      'src/shared/projects/project-trash.ts',
      'src/renderer/components/ProjectTrashModal.vue',
      'src/main/projects/generation-orchestrator.ts',
      'src/main/db/migrations/0027_project_file_lifecycle.sql',
      'src/renderer/components/NewProjectModal.vue',
      'src/renderer/components/project-workspace-destinations.ts',
      'src/renderer/styles/global.css',
    ].map((file) => [file, digest(file)]),
  ),
  bundleSha256: Object.fromEntries(
    [
      'dist/main/main.cjs',
      'dist/preload/preload.cjs',
      'dist/renderer/index.html',
      ...readdirSync('dist/renderer/assets')
        .filter((name) => /\.(?:js|css)$/.test(name))
        .map((name) => `dist/renderer/assets/${name}`),
    ].map((file) => [file, digest(file)]),
  ),
}
let application, window, database
let nativeChecks = []
let registered, created
function persist() {
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
}
function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence })
  persist()
  console.log(`PASS ${name}`)
}
async function api(method, ...args) {
  const result = await window.evaluate(({ method, args }) => window.api.projects[method](...args), {
    method,
    args,
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function bound(label) {
  const result = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds: 300,
    execute: (file, args, options) =>
      execute(
        file,
        args.map((item) => (item === 'MemoryMax=12G' ? 'MemoryMax=2G' : item)),
        options,
      ),
  })
  nativeChecks.push(result)
  report.resourceChecks.push({ label, ...result })
  persist()
}
async function launch(label) {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    CUDA_VISIBLE_DEVICES: '',
    XDG_CONFIG_HOME: path.join(payload, 'config'),
    XDG_DATA_HOME: path.join(payload, 'data'),
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.IMAGEGEN_DEV_SERVER_URL
  delete env.IMAGEGEN_TEST_IMAGE_WORKER
  nativeChecks = []
  application = await electron.launch({
    args: ['--ozone-platform=x11', '.'],
    cwd: process.cwd(),
    env,
    timeout: 30_000,
  })
  await bound(`${label}-launch`)
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(10_000)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await expect.poll(async () => (await api('listWorkspaces')).length).toBeGreaterThan(0)
  database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
}
async function close(label) {
  if (!application) return
  if (database) {
    await database.close()
    database = null
  }
  await bound(`${label}-before-close`)
  await application.close()
  report.nativeClosures.push({ label, ...(await confirmQualificationProcessExit(nativeChecks)) })
  application = null
  window = null
  persist()
}
async function picker(selectedPath) {
  await application.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async (_window, options) => {
      if (options.title === 'Add Workspace') {
        assertPickerProperties(options.properties)
      }
      return selectedPath === null
        ? { canceled: true, filePaths: [] }
        : { canceled: false, filePaths: [selectedPath] }
    }
    function assertPickerProperties(properties) {
      if (JSON.stringify(properties) !== JSON.stringify(['openDirectory', 'createDirectory']))
        throw new Error('Wrong workspace picker properties')
    }
  }, selectedPath)
}
const home = () => window.getByLabel('Workspace navigation', { exact: true })
const addModal = () => window.getByRole('dialog', { name: 'Add Workspace', exact: true })
const newModal = () => window.getByRole('dialog', { name: 'New Project', exact: true })
const importModal = () => window.getByRole('dialog', { name: 'Import Project', exact: true })
async function closeProject(title) {
  await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
}
async function showHome() {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
}
async function screenshot(name, width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) =>
      BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
    { width, height },
  )
  await expect
    .poll(() => window.evaluate(() => [window.innerWidth, window.innerHeight]))
    .toEqual([width, height])
  await window.evaluate(() => document.fonts.ready.then(() => undefined))
  await window.mouse.move(0, 0)
  await window.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().iterations))
        .map((animation) => animation.finished.catch(() => undefined)),
    )
  })
  for (const dialog of await window.getByRole('dialog').all()) {
    if (await dialog.isVisible()) {
      await expect
        .poll(() =>
          dialog.evaluate((el) => ({
            opacity: getComputedStyle(el).opacity,
            transform: getComputedStyle(el).transform,
          })),
        )
        .toEqual({ opacity: '1', transform: 'none' })
    }
  }
  await expect.poll(() => home().evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-${name}.png`)
  await window.screenshot({ path: file })
  report.screenshots.push({ file, width, height, sha256: digest(file) })
  persist()
}
async function indexRecord(id) {
  return database.db
    .selectFrom('project_index')
    .selectAll()
    .where('local_project_key', '=', id)
    .executeTakeFirstOrThrow()
}
async function fixtureFile(name) {
  const file = path.join(payload, name)
  await ProjectSession.create(file, name.replace('.igs', ''), {
    placeholdersDir: path.resolve('src/main/projects/placeholders'),
    scratchDir: path.join(payload, 'fixture-scratch'),
  })
  return file
}
async function importUi(source, choice) {
  await showHome()
  await picker(source)
  await home().getByRole('button', { name: 'Import Project', exact: true }).click()
  await expect(importModal()).toBeVisible()
  await expect(importModal().getByLabel('Import workspace', { exact: true })).toContainText(
    registered.displayName,
  )
  if (choice === 'copy')
    await importModal().getByText('Keep the original and copy it here', { exact: true }).click()
  await importModal()
    .getByRole('button', {
      name: choice === 'copy' ? 'Copy and Open' : 'Move and Open',
      exact: true,
    })
    .click()
  await expect(importModal()).toHaveCount(0)
  const title = path.basename(source, '.igs')
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
  const projects = await api('list', registered.id)
  const value = projects.find((project) => project.title === title)
  assert.ok(value)
  assert.equal(path.dirname((await indexRecord(value.id)).canonical_path), folder)
  return value
}

const settingsModal = () => window.getByRole('dialog', { name: 'Workspace Settings', exact: true })
const removeModal = () => window.getByRole('dialog', { name: 'Remove Workspace', exact: true })
async function settings(name) {
  await showHome()
  await home()
    .getByRole('button', { name: `${name} workspace actions`, exact: true })
    .click()
  await window
    .locator('.n-dropdown-option-body__label')
    .filter({ hasText: /^Workspace Settings$/ })
    .click()
  await expect(settingsModal()).toBeVisible()
}
async function color(value) {
  await settingsModal().getByLabel('Workspace color', { exact: true }).click()
  await window
    .locator('.n-base-select-option')
    .filter({ hasText: new RegExp(`^${value}$`) })
    .click()
}
async function saveSettings() {
  await settingsModal().getByRole('button', { name: 'Save', exact: true }).click()
  await expect(settingsModal()).toHaveCount(0)
}
async function requestRemove() {
  await settingsModal().getByRole('button', { name: 'Remove Workspace', exact: true }).click()
  await expect(removeModal()).toBeVisible()
}
async function manageWorkspace() {
  writeFileSync(path.join(folder, 'keep.txt'), 'Non-project file must survive unregister.\n')
  const before = Object.fromEntries(
    readdirSync(folder).map((name) => [name, digest(path.join(folder, name))]),
  )
  const assertFiles = () =>
    assert.deepEqual(
      Object.fromEntries(
        readdirSync(folder).map((name) => [name, digest(path.join(folder, name))]),
      ),
      before,
    )
  const projectIds = (await api('list', registered.id)).map(({ id }) => id).sort()
  await settings('Uncategorized')
  await expect(
    settingsModal().getByRole('textbox', { name: 'Workspace name', exact: true }),
  ).toBeDisabled()
  await expect(
    settingsModal().getByRole('button', { name: 'Remove Workspace', exact: true }),
  ).toHaveCount(0)
  await color('Blue')
  await saveSettings()
  assert.equal((await api('listWorkspaces')).find(({ isDefault }) => isDefault).color, 'blue')
  check('default workspace allows color with immutable name and no Remove control')
  await settings(registered.displayName)
  const nameInput = settingsModal().getByRole('textbox', { name: 'Workspace name', exact: true })
  await nameInput.fill('Uncategorized')
  await settingsModal().getByRole('button', { name: 'Save', exact: true }).click()
  await expect(settingsModal().getByRole('alert')).toContainText('already exists')
  await expect(nameInput).toHaveValue('Uncategorized')
  await settingsModal().getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(
    (await api('listWorkspaces')).find(({ id }) => id === registered.id).displayName,
    registered.displayName,
  )
  check('duplicate settings failure retains draft; Cancel preserves saved metadata')
  await settings(registered.displayName)
  await settingsModal()
    .getByRole('textbox', { name: 'Workspace name', exact: true })
    .fill('Managed Workspace')
  await color('Violet')
  await screenshot('workspace-settings', 900, 620)
  await saveSettings()
  registered = (await api('listWorkspaces')).find(({ id }) => id === registered.id)
  assert.equal(registered.displayName, 'Managed Workspace')
  assert.equal(registered.color, 'violet')
  assertFiles()
  await close('metadata-saved-normal')
  await launch('management-restart')
  const saved = (await api('listWorkspaces')).find(({ id }) => id === registered.id)
  assert.equal(saved.displayName, 'Managed Workspace')
  assert.equal(saved.color, 'violet')
  assert.equal((await api('listWorkspaces')).find(({ isDefault }) => isDefault).color, 'blue')
  assertFiles()
  check(
    'name and color persist across normal native restart without changing folder or project bytes',
  )
  await window.getByRole('button', { name: 'Open Workspace Project', exact: true }).click()
  await expect(window.getByRole('tab', { name: 'Workspace Project', exact: true })).toBeVisible()
  await settings(registered.displayName)
  await requestRemove()
  await removeModal().getByRole('button', { name: 'Remove Workspace', exact: true }).click()
  await expect(removeModal().getByRole('alert')).toContainText(/close.*projects/i)
  await screenshot('workspace-open-refusal', 900, 620)
  assert.equal((await api('list', registered.id)).length, 3)
  assertFiles()
  await removeModal().getByRole('button', { name: 'Cancel', exact: true }).click()
  await closeProject('Workspace Project')
  check('confirmed Remove refuses an actual open Project and preserves registration/index/files')
  // Hold only the OS picker reply and observe actual IPC entry. No Main/service/database owner is replaced.
  await application.evaluate(({ dialog, ipcMain }) => {
    const state = {
      oldDialog: dialog.showOpenDialog,
      oldRemove: ipcMain._invokeHandlers.get('projects:remove-workspace'),
      entered: false,
      release: null,
    }
    globalThis.__workspaceQualification = state
    dialog.showOpenDialog = () =>
      new Promise((resolve) => {
        state.release = resolve
      })
    ipcMain._invokeHandlers.set('projects:remove-workspace', (...args) => {
      state.entered = true
      return state.oldRemove(...args)
    })
  })
  try {
    await window.evaluate(() => {
      window.__qualifiedImport = window.api.projects.selectImport()
    })
    await expect
      .poll(() => application.evaluate(() => typeof globalThis.__workspaceQualification.release))
      .toBe('function')
    await window.evaluate((id) => {
      window.__qualifiedRemove = window.api.projects.removeWorkspace(id, true)
    }, registered.id)
    await expect
      .poll(() => application.evaluate(() => globalThis.__workspaceQualification.entered))
      .toBe(true)
    await application.evaluate(
      (_electron, file) =>
        globalThis.__workspaceQualification.release({ canceled: false, filePaths: [file] }),
      (await indexRecord(created.id)).canonical_path,
    )
    const [opened, removal] = await window.evaluate(() =>
      Promise.all([window.__qualifiedImport, window.__qualifiedRemove]),
    )
    assert.equal(opened.ok, true)
    assert.equal(opened.value.kind, 'opened')
    assert.equal(opened.value.result.kind, 'opened')
    assert.equal(removal.ok, false)
    assert.equal(removal.error.code, 'WORKSPACE_PROJECT_OPEN')
    assert.equal((await api('list', registered.id)).length, 3)
    assertFiles()
    await api('close', created.id, false)
  } finally {
    const restored = await application.evaluate(({ dialog, ipcMain }) => {
      const state = globalThis.__workspaceQualification
      state.release?.({ canceled: true, filePaths: [] })
      dialog.showOpenDialog = state.oldDialog
      ipcMain._invokeHandlers.set('projects:remove-workspace', state.oldRemove)
      const proof = {
        dialog: dialog.showOpenDialog === state.oldDialog,
        handler: ipcMain._invokeHandlers.get('projects:remove-workspace') === state.oldRemove,
      }
      delete globalThis.__workspaceQualification
      return proof
    })
    assert.deepEqual(restored, { dialog: true, handler: true })
    report.ipcRestoration = restored
    persist()
  }
  check(
    'actual Main catalog fence serializes pending known-file Import/Open before unregister guard',
  )
  const unconfirmed = await window.evaluate(
    (id) => window.api.projects.removeWorkspace(id, false),
    registered.id,
  )
  assert.equal(unconfirmed.ok, false)
  assert.equal(unconfirmed.error.code, 'IPC_INVALID_CALLER')
  await settings(registered.displayName)
  await requestRemove()
  await removeModal().getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal((await api('list', registered.id)).length, 3)
  assertFiles()
  check('Cancel and missing confirmation do not unregister or alter file bytes')
  await settings(registered.displayName)
  await requestRemove()
  await screenshot('workspace-remove-confirmation', 1440, 900)
  await removeModal().getByRole('button', { name: 'Remove Workspace', exact: true }).click()
  await expect(removeModal()).toHaveCount(0)
  await expect(window.getByRole('heading', { name: 'Uncategorized', exact: true })).toBeVisible()
  assert.equal((await api('listWorkspaces')).length, 1)
  assert.deepEqual(await api('list'), [])
  assertFiles()
  check('confirmed unregister removes metadata only and selects Uncategorized')
  await picker(folder)
  await home().getByRole('button', { name: 'Add Workspace', exact: true }).click()
  await addModal()
    .getByRole('textbox', { name: 'Workspace name', exact: true })
    .fill('Reconnected Workspace')
  await addModal().getByRole('button', { name: 'Choose Folder and Add', exact: true }).click()
  await expect(addModal()).toHaveCount(0)
  const readded = (await api('listWorkspaces')).find(({ isDefault }) => !isDefault)
  assert.ok(readded && readded.id !== registered.id)
  assert.deepEqual((await api('list', readded.id)).map(({ id }) => id).sort(), projectIds)
  assertFiles()
  assert.equal(
    (await readIgsPackage((await indexRecord(created.id)).canonical_path)).project.primaryBbox.x,
    -16,
  )
  await screenshot('workspace-rediscovered', 900, 620)
  check('re-register discovers exact canonical identities and original committed packages')
}

const trashModal = () => window.getByRole('dialog', { name: 'Move Project to Trash', exact: true })
const deleteModal = () =>
  window.getByRole('dialog', { name: 'Delete Project Permanently', exact: true })
async function trashView() {
  await showHome()
  await home()
    .getByRole('button', { name: /^Trash(?:\s+\d+)?$/ })
    .click()
  await expect(window.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible()
}
async function requestTrash(title) {
  await showHome()
  await window.getByRole('button', { name: `${title} project actions`, exact: true }).click()
  await window
    .locator('.n-dropdown-option-body__label')
    .filter({ hasText: /^Move to Trash$/ })
    .click()
  await expect(trashModal()).toBeVisible()
}
async function performTrash(title) {
  await requestTrash(title)
  await trashModal().getByRole('button', { name: 'Move to Trash', exact: true }).click()
  await expect(trashModal()).toHaveCount(0)
}
async function manageTrash() {
  registered = (await api('listWorkspaces')).find(({ isDefault }) => !isDefault)
  const rows = await api('list', registered.id)
  const first = rows.find(({ title }) => title === 'Workspace Project')
  const second = rows.find(({ title }) => title === 'Copy Project')
  const third = rows.find(({ title }) => title === 'Move Project')
  const files = Object.fromEntries(
    await Promise.all(
      rows.map(async (row) => [row.id, (await indexRecord(row.id)).canonical_path]),
    ),
  )
  const hashes = Object.fromEntries(Object.entries(files).map(([id, file]) => [id, digest(file)]))
  await window.getByRole('button', { name: 'Open Workspace Project', exact: true }).click()
  await expect(window.getByRole('tab', { name: 'Workspace Project', exact: true })).toBeVisible()
  await requestTrash('Workspace Project')
  await expect(
    trashModal().getByRole('button', { name: 'Move to Trash', exact: true }),
  ).toHaveCount(0)
  await trashModal().getByRole('button', { name: 'Switch to Project', exact: true }).click()
  await expect(trashModal()).toHaveCount(0)
  assert.deepEqual(await api('listTrash'), [])
  await closeProject('Workspace Project')
  await showHome()
  check('open Project Trash uses Switch to Project and never changes lifecycle')
  await performTrash('Workspace Project')
  const firstTrash = (await api('listTrash')).find(({ id }) => id === first.id)
  assert.ok(firstTrash)
  assert.equal(digest(files[first.id]), hashes[first.id])
  assert.equal((await api('list')).length, 2)
  const deniedOpen = await window.evaluate((id) => window.api.projects.open(id), first.id)
  assert.equal(deniedOpen.ok, false)
  await trashView()
  await expect(window.locator(`[data-project-id="${first.id}"]`)).toHaveAttribute(
    'data-trash-id',
    firstTrash.trashId,
  )
  await screenshot('trash-one', 900, 620)
  await home().getByRole('button', { name: 'New Project', exact: true }).click()
  await expect(newModal().getByLabel('Project workspace', { exact: true })).toContainText(
    'Uncategorized',
  )
  await newModal().getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal((await api('list')).length, 2)
  check(
    'actual Trash hides active rows/counts, denies Open, preserves source and defaults New Project to Uncat',
  )
  await settings(registered.displayName)
  await requestRemove()
  await removeModal().getByRole('button', { name: 'Remove Workspace', exact: true }).click()
  await expect(removeModal()).toHaveCount(0)
  assert.equal((await api('listTrash')).length, 1)
  await trashView()
  await window.getByRole('button', { name: 'Restore Workspace Project', exact: true }).click()
  await expect(window.getByRole('alert').filter({ hasText: /no longer registered/i })).toBeVisible()
  assert.equal(digest(files[first.id]), hashes[first.id])
  assert.equal((await api('listTrash')).length, 1)
  await close('trash-unregistered-normal')
  await launch('trash-restarted')
  assert.equal((await api('listTrash'))[0].trashId, firstTrash.trashId)
  check(
    'Trash authority survives unregister and normal restart; Restore refuses missing registration without retarget',
  )
  await picker(folder)
  await home().getByRole('button', { name: 'Add Workspace', exact: true }).click()
  await addModal()
    .getByRole('textbox', { name: 'Workspace name', exact: true })
    .fill('Trash Restored Workspace')
  await addModal().getByRole('button', { name: 'Choose Folder and Add', exact: true }).click()
  await expect(addModal()).toHaveCount(0)
  registered = (await api('listWorkspaces')).find(({ isDefault }) => !isDefault)
  assert.equal((await api('list', registered.id)).length, 2)
  await trashView()
  await window.getByRole('button', { name: 'Restore Workspace Project', exact: true }).click()
  await expect.poll(() => api('listTrash')).toEqual([])
  assert.equal((await api('list', registered.id)).length, 3)
  assert.equal(digest(files[first.id]), hashes[first.id])
  await home().getByRole('button', { name: 'Projects', exact: true }).click()
  await window.getByRole('button', { name: 'Open Workspace Project', exact: true }).click()
  await expect(window.getByRole('tab', { name: 'Workspace Project', exact: true })).toBeVisible()
  assert.doesNotMatch(
    JSON.stringify(await api('getGenerationState', first.id)),
    /PROJECT_GENERATION_CLOSING|close has not committed/,
  )
  await closeProject('Workspace Project')
  await showHome()
  check(
    'Restore after exact-folder re-Add preserves canonical identity/bytes and reopens without weakening generation fences',
  )
  await performTrash('Workspace Project')
  await trashView()
  const finalFirst = (await api('listTrash'))[0]
  assert.notEqual(finalFirst.trashId, firstTrash.trashId)
  const stale = await window.evaluate(
    ({ id, trashId }) => window.api.projects.deleteProjectPermanently(id, trashId, true),
    firstTrash,
  )
  assert.equal(stale.ok, false)
  assert.equal(digest(files[first.id]), hashes[first.id])
  await window
    .getByRole('button', { name: 'Delete Workspace Project permanently', exact: true })
    .click()
  await expect(deleteModal()).toContainText(path.basename(files[first.id]))
  await deleteModal().getByRole('button', { name: 'Cancel', exact: true }).click()
  const noConfirm = await window.evaluate(
    ({ id, trashId }) => window.api.projects.deleteProjectPermanently(id, trashId, false),
    finalFirst,
  )
  assert.equal(noConfirm.ok, false)
  assert.equal(digest(files[first.id]), hashes[first.id])
  check('stale Trash UUID, Cancel and missing confirmation preserve the exact source file')
  await window
    .getByRole('button', { name: 'Delete Workspace Project permanently', exact: true })
    .click()
  await screenshot('delete-confirmation', 1440, 900)
  await deleteModal().getByRole('button', { name: 'Delete Permanently', exact: true }).click()
  await expect(deleteModal()).toHaveCount(0)
  assert.equal(existsSync(files[first.id]), false)
  assert.deepEqual(await api('listTrash'), [])
  assert.equal(
    (await api('list')).some(({ id }) => id === first.id),
    false,
  )
  assert.equal(digest(files[second.id]), hashes[second.id])
  assert.equal(digest(files[third.id]), hashes[third.id])
  check('confirmed permanent delete removes only the frozen managed file and its lifecycle/index')
  await home().getByRole('button', { name: 'Projects', exact: true }).click()
  await performTrash('Move Project')
  await trashView()
  const pendingTrash = (await api('listTrash'))[0]
  chmodSync(folder, 0o500)
  try {
    await window
      .getByRole('button', { name: 'Delete Move Project permanently', exact: true })
      .click()
    await deleteModal().getByRole('button', { name: 'Delete Permanently', exact: true }).click()
    await expect(
      deleteModal().getByRole('button', { name: 'Retry Delete', exact: true }),
    ).toBeVisible()
    assert.equal((await api('listTrash'))[0].deletionStatus, 'deleting')
    assert.equal(digest(files[third.id]), hashes[third.id])
    await screenshot('delete-pending', 900, 620)
    await deleteModal().getByRole('button', { name: 'Close', exact: true }).click()
    await close('delete-pending-normal')
    await launch('delete-pending-restarted')
    const retained = (await api('listTrash'))[0]
    assert.equal(retained.trashId, pendingTrash.trashId)
    assert.equal(retained.deletionStatus, 'deleting')
    assert.equal(digest(files[third.id]), hashes[third.id])
    check('readonly purge keeps positive pending journal/source across actual normal restart')
  } finally {
    chmodSync(folder, 0o700)
  }
  await close('delete-repaired-normal')
  await launch('delete-repaired-restarted')
  assert.deepEqual(await api('listTrash'), [])
  assert.equal(existsSync(files[third.id]), false)
  const active = await api('list')
  assert.deepEqual(
    active.map(({ id }) => id),
    [second.id],
  )
  assert.equal(digest(files[second.id]), hashes[second.id])
  assert.equal(
    readFileSync(path.join(folder, 'keep.txt'), 'utf8'),
    'Non-project file must survive unregister.\n',
  )
  await trashView()
  await expect(window.getByText('Trash is empty', { exact: true })).toBeVisible()
  await screenshot('trash-empty-recovered', 900, 620)
  check(
    'startup after permission repair completes only committed purge before scanning without reviving deleted rows',
  )
}
async function manageLocations() {
  const rows = await api('list', registered.id)
  const first = rows.find(({ title }) => title === 'Workspace Project')
  const file = (await indexRecord(first.id)).canonical_path
  const before = digest(file)
  await application.evaluate(({ shell }) => {
    const state = { show: shell.showItemInFolder, open: shell.openPath, calls: [], error: '' }
    globalThis.__locationsQualification = state
    shell.showItemInFolder = (file) => state.calls.push({ kind: 'file', path: file })
    shell.openPath = async (directory) => { state.calls.push({ kind: 'directory', path: directory }); return state.error }
  })
  const calls = () => application.evaluate(() => globalThis.__locationsQualification.calls)
  async function projectReveal() {
    await showHome()
    await window.getByRole('button', { name: 'Workspace Project project actions', exact: true }).click()
    const option = window.locator('.n-dropdown-option-body__label:visible').filter({ hasText: /^Show in Folder$/ })
    await expect(option).toHaveCount(1)
    await option.click()
    await expect(option).toHaveCount(0)
  }
  async function workspaceReveal() {
    await window.getByRole('button', { name: `${registered.displayName} workspace actions`, exact: true }).click()
    const option = window.locator('.n-dropdown-option-body__label:visible').filter({ hasText: /^Show in Folder$/ })
    await expect(option).toHaveCount(1)
    await option.click()
    await expect(option).toHaveCount(0)
  }
  try {
    await projectReveal()
    await expect.poll(calls).toEqual([{ kind: 'file', path: file }])
    await expect(window.getByRole('tab')).toHaveCount(1)
    assert.equal(digest(file), before)
    check('actual Home Project reveal reaches shell selector with exact indexed file without opening or saving it')
    await workspaceReveal()
    await expect.poll(calls).toEqual([{ kind: 'file', path: file }, { kind: 'directory', path: folder }])
    const invalid = await window.evaluate(() => window.api.projects.revealProject('/tmp/foreign.igs'))
    assert.equal(invalid.ok, false)
    assert.equal((await calls()).length, 2)
    check('workspace reveal opens exact registered directory; renderer path injection is rejected before shell')
    await application.evaluate(() => { globalThis.__locationsQualification.error = 'controlled unavailable file manager' })
    await workspaceReveal()
    await expect(window.getByRole('alert').filter({ hasText: /could not be opened/i })).toBeVisible()
    assert.equal(digest(file), before)
    await screenshot('reveal-error', 900, 620)
    await application.evaluate(() => { globalThis.__locationsQualification.error = '' })
    await workspaceReveal()
    await expect(window.getByRole('alert').filter({ hasText: /could not be opened/i })).toHaveCount(0)
    check('shell error remains visible in Home and ordinary retry clears it without document effects')
    await window.getByRole('button', { name: 'Open Workspace Project', exact: true }).click()
    const marker = window.getByRole('tab', { name: 'Workspace Project', exact: true }).locator('.project-marker')
    await expect(marker).toHaveAttribute('data-workspace-id', registered.id)
    await expect(marker).toHaveClass(/project-marker--teal/)
    await showHome()
    await home().locator('.workspace-select').filter({ hasText: 'Uncategorized' }).click()
    await expect(window.getByRole('heading', { name: 'Uncategorized', exact: true })).toBeVisible()
    await expect(marker).toHaveAttribute('data-workspace-id', registered.id)
    await settings(registered.displayName)
    await color('Violet')
    await saveSettings()
    await expect(marker).toHaveClass(/project-marker--violet/)
    await screenshot('workspace-tab-marker', 1440, 900)
    check('open tab retains authoritative workspace outside current Home scope and follows catalog color changes')
    await closeProject('Workspace Project')
    await showHome()
    await application.evaluate(({ shell }) => { const state = globalThis.__locationsQualification; shell.showItemInFolder = state.show; shell.openPath = state.open; if (shell.showItemInFolder !== state.show || shell.openPath !== state.open) throw new Error('Shell restoration failed'); delete globalThis.__locationsQualification })
    report.shellRestoredBeforeClose = true
    persist()
    await close('locations-first-normal')
    await launch('locations-restarted')
    await home().getByRole('button', { name: 'Projects', exact: true }).click()
    await window.getByRole('button', { name: 'Open Workspace Project', exact: true }).click()
    const reopened = window.getByRole('tab', { name: 'Workspace Project', exact: true }).locator('.project-marker')
    await expect(reopened).toHaveAttribute('data-workspace-id', registered.id)
    await expect(reopened).toHaveClass(/project-marker--violet/)
    assert.equal(digest(file), before)
    await showHome()
    await screenshot('workspace-tab-reopened', 900, 620)
    await closeProject('Workspace Project')
    check('normal restart and reopen reproduce workspace ownership/color with exact original package bytes')
  } finally {
    // First lifetime's shell patch is process-local; restore before closing or on an early failure.
    if (application) {
      const restored = await application.evaluate(({ shell }) => {
        const state = globalThis.__locationsQualification
        if (!state) return { kind: 'prior-process-exited' }
        shell.showItemInFolder = state.show; shell.openPath = state.open
        const result = { kind: 'restored', show: shell.showItemInFolder === state.show, open: shell.openPath === state.open }
        delete globalThis.__locationsQualification
        return result
      })
      report.shellRestoration = restored
      persist()
    }
  }
}
async function prepareManagedProjects() {
  await picker(folder)
  await home().getByRole('button', { name: 'Add Workspace', exact: true }).click()
  await addModal().getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Trash Workspace')
  await addModal().getByRole('button', { name: 'Choose Folder and Add', exact: true }).click()
  await expect(addModal()).toHaveCount(0)
  registered = (await api('listWorkspaces')).find(({ isDefault }) => !isDefault)
  for (const title of ['Workspace Project', 'Copy Project', 'Move Project']) {
    const tab = await api('create', { title, width: 640, height: 512, workspaceId: registered.id })
    await api('close', tab.id, false)
  }
  writeFileSync(path.join(folder, 'keep.txt'), 'Non-project file must survive unregister.\n')
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await expect(window.getByRole('button', { name: 'Open Workspace Project', exact: true })).toBeVisible()
  check('Fixtures use actual registered workspace and three Main-created closed packages')
}
persist()
try {
  await launch('first')
  if (trashOnly || locationsOnly) {
    await prepareManagedProjects()
  } else {
  assert.deepEqual(await api('list'), [])
  await picker(null)
  await home().getByRole('button', { name: 'Add Workspace', exact: true }).click()
  await addModal()
    .getByRole('textbox', { name: 'Workspace name', exact: true })
    .fill('Qualification Workspace')
  await addModal().getByRole('button', { name: 'Choose Folder and Add', exact: true }).click()
  await expect(
    addModal().getByRole('textbox', { name: 'Workspace name', exact: true }),
  ).toHaveValue('Qualification Workspace')
  assert.equal((await api('listWorkspaces')).length, 1)
  await screenshot('add-workspace-minimum', 900, 620)
  check('picker cancel preserves draft and catalog')
  await picker(folder)
  await addModal().getByRole('button', { name: 'Choose Folder and Add', exact: true }).click()
  await expect(addModal()).toHaveCount(0)
  registered = (await api('listWorkspaces')).find((workspace) => !workspace.isDefault)
  assert.ok(registered)
  assert.equal(registered.directoryPath, folder)
  await expect(
    home().locator('.workspace-select').filter({ hasText: 'Qualification Workspace' }),
  ).toHaveAttribute('aria-pressed', 'true')
  check('real Add Workspace registers canonical folder and selects it', registered)
  const invalid = await window.evaluate(() =>
    window.api.projects.addWorkspace({
      displayName: 'Forged',
      color: 'teal',
      directoryPath: '/renderer/path',
    }),
  )
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error.code, 'IPC_INVALID_CALLER')
  const duplicate = await window.evaluate(() =>
    window.api.projects.addWorkspace({ displayName: 'Another name', color: 'teal' }),
  )
  assert.equal(duplicate.ok, false)
  assert.equal((await api('listWorkspaces')).length, 2)
  check('Main rejects renderer path and duplicate registration')
  await home().getByRole('button', { name: 'New Project', exact: true }).click()
  await expect(newModal().getByLabel('Project workspace', { exact: true })).toContainText(
    registered.displayName,
  )
  await newModal()
    .getByRole('textbox', { name: 'Project name', exact: true })
    .fill('Workspace Project')
  await expect(
    newModal().getByRole('button', { name: 'Create Project', exact: true }),
  ).toBeEnabled()
  await screenshot('create-minimum', 900, 620)
  await newModal().locator('.modal-scroll').hover()
  await window.mouse.wheel(0, 700)
  await expect(
    newModal().getByText('Sets the first generation area. The canvas is unbounded.', {
      exact: true,
    }),
  ).toBeInViewport()
  await expect(
    newModal().getByRole('button', { name: 'Create Project', exact: true }),
  ).toBeInViewport()
  await screenshot('create-minimum-scrolled', 900, 620)
  check('minimum New Project scroll reaches final fields while primary action remains visible')
  await screenshot('create-destination', 1440, 900)
  await newModal().getByRole('button', { name: 'Create Project', exact: true }).click()
  await expect(window.getByRole('tab', { name: 'Workspace Project', exact: true })).toBeVisible()
  created = (await api('list', registered.id)).find(
    (project) => project.title === 'Workspace Project',
  )
  assert.ok(created)
  const indexed = await indexRecord(created.id)
  assert.equal(indexed.workspace_id, registered.id)
  assert.equal(path.dirname(indexed.canonical_path), folder)
  const original = await readIgsPackage(indexed.canonical_path)
  assert.equal(original.project.title, 'Workspace Project')
  check('Home Create writes real package to explicit workspace', {
    id: created.id,
    file: indexed.canonical_path,
  })
  await api('setPrimaryBbox', created.id, { x: -16, y: 8, width: 640, height: 512 })
  await api('save', created.id)
  assert.deepEqual((await readIgsPackage(indexed.canonical_path)).project.primaryBbox, {
    x: -16,
    y: 8,
    width: 640,
    height: 512,
  })
  assert.equal((await indexRecord(created.id)).workspace_id, registered.id)
  check('real Save preserves nondefault index ownership and committed content')
  const copiedSource = await fixtureFile('Copy Project.igs')
  const copyHash = digest(copiedSource)
  await importUi(copiedSource, 'copy')
  assert.equal(digest(copiedSource), copyHash)
  const movedSource = await fixtureFile('Move Project.igs')
  await importUi(movedSource, 'move')
  assert.equal(existsSync(movedSource), false)
  check('Home Copy and Move use explicit destination and preserve correct source semantics')
  await showHome()
  await home().getByRole('button', { name: 'Projects', exact: true }).click()
  assert.equal((await api('list')).length, 3)
  assert.equal((await api('list', 'uncategorized')).length, 0)
  await home().locator('.workspace-select').filter({ hasText: 'Uncategorized' }).click()
  await expect(window.getByText('No projects yet', { exact: true })).toBeVisible()
  await window.getByRole('button', { name: 'Open saved generations', exact: true }).click()
  const history = window.getByRole('dialog', { name: 'Saved generations', exact: true })
  await expect(history).toBeVisible()
  await history.getByRole('button', { name: 'Refresh saved generations', exact: true }).click()
  await history.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(history).toHaveCount(0)
  await expect(window.getByText('No projects yet', { exact: true })).toBeVisible()
  await expect(
    window.getByRole('button', { name: 'Open Workspace Project', exact: true }),
  ).toHaveCount(0)
  check('Saved generations global refresh preserves selected empty Home scope')
  await home().getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(
    window.getByRole('button', { name: 'Open Workspace Project', exact: true }),
  ).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
  await expect(
    window.locator('.project-browser').getByRole('button', { name: /^Open / }),
  ).toHaveCount(3)
  await screenshot('home-aggregate', 1440, 900)
  await screenshot('home-minimum', 900, 620)
  check('aggregate and concrete lists preserve ownership')
  await closeProject('Workspace Project')
  await picker(indexed.canonical_path)
  await home().getByRole('button', { name: 'Import Project', exact: true }).click()
  await expect(window.getByRole('tab', { name: 'Workspace Project', exact: true })).toBeVisible()
  await expect(importModal()).toHaveCount(0)
  assert.equal((await api('list')).length, 3)
  check('known nondefault file opens directly without transfer')
  await close('first-normal')
  await launch('restarted')
  assert.equal(
    (await api('listWorkspaces')).find((workspace) => workspace.id === registered.id).directoryPath,
    folder,
  )
  assert.equal((await api('list', registered.id)).length, 3)
  await window.getByRole('button', { name: 'Open Workspace Project', exact: true }).click()
  await expect(window.getByRole('tab', { name: 'Workspace Project', exact: true })).toBeVisible()
  const reopened = await api('open', created.id)
  assert.equal(reopened.kind, 'opened')
  assert.deepEqual(reopened.tab.primaryBbox, { x: -16, y: 8, width: 640, height: 512 })
  check('restart retains workspace catalog and real saved project')
  await closeProject('Workspace Project')
  renameSync(folder, `${folder}-disconnected`)
  try {
    await showHome()
    await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
    await expect
      .poll(
        async () =>
          (await api('listWorkspaces')).find((workspace) => workspace.id === registered.id)
            .availability,
      )
      .toBe('missing')
    await expect(window.getByText(/workspace folders are unavailable/)).toBeVisible()
    assert.equal((await api('list')).length, 3)
    const rejected = await window.evaluate(
      (workspaceId) =>
        window.api.projects.create({ title: 'Refused', width: 512, height: 512, workspaceId }),
      registered.id,
    )
    assert.equal(rejected.ok, false)
    assert.equal((await api('list', 'uncategorized')).length, 0)
    await screenshot('home-unavailable', 1440, 900)
    check(
      'missing workspace retains cached projects and refuses explicit destination without fallback',
    )
  } finally {
    renameSync(`${folder}-disconnected`, folder)
  }
  await api('list')
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await expect(window.getByText(/workspace folders are unavailable/)).toHaveCount(0)
  assert.equal(
    (await api('listWorkspaces')).find((workspace) => workspace.id === registered.id).availability,
    'available',
  )
  await manageWorkspace()
  }
  if (locationsOnly) await manageLocations()
  else await manageTrash()
  await close('restart-normal')
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.nativeClosures.length, locationsOnly ? 2 : trashOnly ? 4 : 6)
  report.outcome = 'passed'
  report.finishedAt = new Date().toISOString()
  persist()
} catch (error) {
  report.outcome = 'failed'
  report.error = error.stack ?? String(error)
  persist()
  if (window && !window.isClosed())
    await window
      .screenshot({
        path: path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-failure.png`),
      })
      .catch(() => undefined)
  throw error
} finally {
  await close('finally')
}
