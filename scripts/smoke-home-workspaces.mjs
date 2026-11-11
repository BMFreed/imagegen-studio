/** Real built Home/IPC/SQLite/.igs qualification. OS picker replies are controlled; the catalog race wraps IPC entry and delegates unchanged to the original handler, then restores its identity. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
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
  utimesSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron, expect } from '@playwright/test'
import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage, saveIgsPackage } from '../src/main/projects/igs-package.ts'
import { readProjectPlaceholders } from '../src/main/projects/project-placeholders.ts'
import { ProjectShadowStore } from '../src/main/projects/project-shadow.ts'
import { parseProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
} from './qualification-resource-limits.mjs'

assert.ok([4, 5].includes(process.argv.length), 'Use --report-file ABSOLUTE_NEW_OWNED_REPORT [--trash-only|--locations-only|--move-only|--relocation-only|--open-rename-only|--browse-only]')
const trashOnly = process.argv[4] === '--trash-only'
const locationsOnly = process.argv[4] === '--locations-only'
const moveOnly = process.argv[4] === '--move-only'
const relocationOnly = process.argv[4] === '--relocation-only'
const openRenameOnly = process.argv[4] === '--open-rename-only'
const browseOnly = process.argv[4] === '--browse-only'
if (process.argv.length === 5) assert.ok(trashOnly || locationsOnly || moveOnly || relocationOnly || openRenameOnly || browseOnly)
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
  mode: browseOnly ? 'browse-only' : openRenameOnly ? 'open-rename-only' : relocationOnly ? 'relocation-only' : moveOnly ? 'move-only' : locationsOnly ? 'locations-only' : trashOnly ? 'trash-only' : 'catalog-workspaces-and-trash',
  startedAt: new Date().toISOString(),
  payloads: [payload],
  checks: [],
  screenshots: [],
  nativeClosures: [],
  resourceChecks: [],
  pageErrors: [],
  boundary: browseOnly
    ? 'Browse-only qualifies actual built Home/IPC/SQLite and real package timestamps. Controlled owned-file mtimes prepare sort inputs; verified recovery shadow and preview-unavailable package are prepared through real writers while the app is physically closed. This is not crash recovery acceptance. Exact owned missing-file/workspace renames are restored; no model/runtime or foreign data changes. OS picker replies are controlled.'
    : 'Locations-only uses controlled OS shell callbacks; it qualifies Main path selection and UI, not file-manager window UX. Relocation/open-Rename uses exact owned fs syscall interception to chmod its own packages and delegates to originals for actual EACCES; stack, journal phase, identities and modes must restore. Actual built renderer/preload/Main/SQLite and Project package writers/loaders. OS picker replies are controlled; OS dialog UX and arbitrary permission races are not qualified. No ML.',
  sourceSha256: Object.fromEntries(
    [
      'scripts/smoke-home-workspaces.mjs',
      'src/main/index.ts',
      'src/preload/index.ts',
      'src/main/projects/project-index.ts',
      'src/main/projects/project-home-metadata.ts',
      'src/main/projects/project-shadow.ts',
      'src/shared/projects/home-project-browse.ts',
      'src/main/projects/project-service.ts',
      'src/main/projects/project-identity.ts',
      'src/main/projects/project-location-registry.ts',
      'src/main/projects/project-relocation-store.ts',
      'src/main/projects/project-session.ts',
      'src/main/projects/project-autosave.ts',
      'src/main/projects/igs-package.ts',
      'src/main/projects/project-placeholders.ts',
      'src/shared/projects/project-schema.ts',
      'src/main/db/database.ts',
      'src/main/db/migrations/0028_project_relocation.sql',
      'src/main/db/migrations/0029_project_rename.sql',
      'src/renderer/components/MoveProjectModal.vue',
      'src/renderer/components/RenameProjectModal.vue',
      'src/shared/projects/project-rename.ts',
      'src/shared/projects/project-create.ts',
      'src/shared/projects/project-workspaces.ts',
      'src/shared/api.ts',
      'src/renderer/App.vue',
      'src/renderer/components/HomeView.vue',
      'src/renderer/components/GenerationQueueManager.vue',
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
  // Playwright settles finite animations for the capture. Do not await every page
  // animation's finished promise: a paused animation can hold the harness indefinitely.
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
  await window.screenshot({ path: file, animations: 'disabled' })
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
async function manageMove() {
  const source = registered
  const destinationFolder = path.join(payload, 'move-destination')
  mkdirSync(destinationFolder)
  await picker(destinationFolder)
  await home().getByRole('button', { name: 'Add Workspace', exact: true }).click()
  await addModal().getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Move destination')
  await addModal().getByRole('button', { name: 'Choose Folder and Add', exact: true }).click()
  await expect(addModal()).toHaveCount(0)
  const target = (await api('listWorkspaces')).find((v) => v.directoryPath === destinationFolder)
  const rows = await api('list', source.id)
  const first = rows.find((v) => v.title === 'Workspace Project')
  const pendingProject = rows.find((v) => v.title === 'Move Project')
  const sourceFile = (await indexRecord(first.id)).canonical_path
  const pendingSource = (await indexRecord(pendingProject.id)).canonical_path
  const destinationFile = path.join(destinationFolder, path.basename(sourceFile))
  const pendingDestination = path.join(destinationFolder, path.basename(pendingSource))
  const originalHash = digest(sourceFile)
  const pendingHash = digest(pendingSource)
  const moveModal = () => window.getByRole('dialog', { name: 'Move Project', exact: true })
  async function browseSource() {
    await showHome()
    await home().locator('.workspace-select').filter({ hasText: source.displayName }).click()
    await expect(window.getByRole('heading', { name: source.displayName, exact: true })).toBeVisible()
  }
  async function requestMove(title, retry = false) {
    await window.getByRole('button', { name: `${title} project actions`, exact: true }).click()
    const option = window.locator('.n-dropdown-option-body__label:visible').filter({ hasText: retry ? /^Retry Move$/ : /^Move to Workspace$/ })
    await option.click()
    await expect(moveModal()).toBeVisible()
  }
  async function chooseTarget() {
    await moveModal().getByLabel('Destination workspace', { exact: true }).click()
    await window.locator('.n-base-select-option:visible').filter({ hasText: 'Move destination' }).click()
  }
  await browseSource()
  await window.getByRole('button', { name: 'Open Workspace Project', exact: true }).click()
  await expect(window.getByRole('tab', { name: 'Workspace Project', exact: true })).toHaveAttribute('aria-selected', 'true')
  await window.locator('input[aria-label="Generation area width"]').fill('648')
  await window.locator('input[aria-label="Generation area width"]').press('Enter')
  await expect(window.getByText('Unsaved changes', { exact: true })).toBeVisible()
  await showHome()
  await expect(home()).toBeVisible()
  await requestMove('Workspace Project')
  await expect(moveModal().getByRole('button', { name: 'Switch to Project', exact: true })).toBeVisible()
  await expect(moveModal().getByRole('button', { name: 'Move Project', exact: true })).toHaveCount(0)
  await moveModal().getByRole('button', { name: 'Switch to Project', exact: true }).click()
  await window.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(window.getByText('Saved', { exact: true })).toBeVisible()
  await closeProject('Workspace Project')
  await browseSource()
  check('actual dirty open Project Move refuses and offers Switch without implicit Save or close')
  await requestMove('Workspace Project')
  await chooseTarget()
  await screenshot('move-confirmation', 900, 620)
  await moveModal().getByRole('button', { name: 'Move Project', exact: true }).click()
  await expect(moveModal()).toHaveCount(0)
  assert.equal(existsSync(sourceFile), false)
  assert.equal(digest(destinationFile), originalHash)
  assert.equal((await api('list', source.id)).length, 2)
  assert.equal((await api('list', target.id))[0].id, first.id)
  await expect(window.getByRole('button', { name: 'Open Workspace Project', exact: true })).toHaveCount(0)
  check('public closed Move publishes exact package in selected workspace with stable ID and clears source scope row')
  await close('moved-first-normal')
  await launch('move-restarted')
  await home().getByRole('button', { name: 'Projects', exact: true }).click()
  await window.getByRole('button', { name: 'Open Workspace Project', exact: true }).click()
  await expect(window.getByRole('tab', { name: 'Workspace Project', exact: true }).locator('.project-marker')).toHaveAttribute('data-workspace-id', target.id)
  assert.equal((await api('list', target.id))[0].id, first.id)
  assert.equal(digest(destinationFile), originalHash)
  await api('setPrimaryBbox', first.id, { height: 512, width: 640, x: 9, y: -9 })
  await api('save', first.id)
  assert.equal((await readIgsPackage(destinationFile)).project.primaryBbox.x, 9)
  assert.equal(existsSync(sourceFile), false)
  await closeProject('Workspace Project')
  await browseSource()
  check('cold restart reopens stable identity with target tab marker; explicit edit/Save writes only new canonical location')
  await application.evaluate(async (_electron, paths) => {
    const fs = process.getBuiltinModule('fs')
    const state = { original: fs.renameSync, fired: 0 }
    globalThis.__moveQualification = state
    fs.renameSync = (from, to) => {
      if (from === paths.source && to === paths.destination && state.fired === 0) { state.fired++; fs.chmodSync(paths.parent, 0o500) }
      return state.original(from, to)
    }
  }, { source: pendingSource, destination: pendingDestination, parent: destinationFolder })
  try {
    await requestMove('Move Project')
    await chooseTarget()
    await moveModal().getByRole('button', { name: 'Move Project', exact: true }).click()
    await expect(moveModal().getByRole('button', { name: 'Retry Move', exact: true })).toBeVisible()
    assert.equal(await application.evaluate(() => globalThis.__moveQualification.fired), 1)
    assert.equal(digest(pendingSource), pendingHash)
    assert.equal(existsSync(pendingDestination), false)
    await screenshot('move-pending', 900, 620)
    await moveModal().getByRole('button', { name: 'Close', exact: true }).click()
    await expect(window.getByText('Move pending', { exact: true })).toBeVisible()
    await requestMove('Move Project', true)
    await expect(moveModal().getByRole('button', { name: 'Retry Move', exact: true })).toBeVisible()
    await moveModal().getByRole('button', { name: 'Close', exact: true }).click()
    for (const id of [source.id, target.id]) {
      const result = await window.evaluate((workspaceId) => window.api.projects.removeWorkspace(workspaceId, true), id)
      assert.equal(result.ok, false)
    }
    assert.equal((await api('list', source.id)).find((v) => v.id === pendingProject.id).pendingMove.workspaceId, target.id)
    check('real rename EACCES after durable intent keeps visible frozen pending Move and protects both workspaces without discard')
  } finally {
    chmodSync(destinationFolder, 0o700)
    const restored = await application.evaluate(async () => {
      const fs = process.getBuiltinModule('fs')
      const state = globalThis.__moveQualification
      fs.renameSync = state.original
      const result = fs.renameSync === state.original
      delete globalThis.__moveQualification
      return result
    })
    assert.equal(restored, true)
    report.moveFsRestored = restored
    persist()
  }
  await close('move-pending-normal')
  await launch('move-recovered')
  assert.equal(existsSync(pendingSource), false)
  assert.equal(digest(pendingDestination), pendingHash)
  assert.equal((await api('list', source.id)).length, 1)
  assert.equal((await api('list', target.id)).length, 2)
  assert.equal((await api('list', target.id)).find((v) => v.id === pendingProject.id).pendingMove, undefined)
  await home().getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(window.getByText('Move pending', { exact: true })).toHaveCount(0)
  await screenshot('move-recovered', 1440, 900)
  check('startup resumes only original pending Move before scan and retains exact package/stable ID after normal restart')
}
async function manageRelocation() {
  const source = registered
  const destinationFolder = path.join(payload, 'relocation-destination')
  mkdirSync(destinationFolder)
  await picker(destinationFolder)
  await home().getByRole('button', { name: 'Add Workspace', exact: true }).click()
  await addModal().getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Relocation destination')
  await addModal().getByRole('button', { name: 'Choose Folder and Add', exact: true }).click()
  await expect(addModal()).toHaveCount(0)
  const target = (await api('listWorkspaces')).find((v) => v.directoryPath === destinationFolder)
  assert.ok(target)
  const rows = await api('list', source.id)
  const moved = rows.find((v) => v.title === 'Workspace Project')
  const renamed = rows.find((v) => v.title === 'Copy Project')
  const closedPending = rows.find((v) => v.title === 'Move Project')
  assert.ok(moved && renamed && closedPending)
  const movedSource = (await indexRecord(moved.id)).canonical_path
  const movedDestination = path.join(destinationFolder, path.basename(movedSource))
  const closedSource = (await indexRecord(closedPending.id)).canonical_path
  const closedDestination = path.join(destinationFolder, path.basename(closedSource))
  const renameSource = (await indexRecord(renamed.id)).canonical_path
  const renameDestination = path.join(folder, 'Renamed Project.igs')
  const renameRecovered = path.join(folder, 'Recovered Name.igs')
  const moveModal = () => window.getByRole('dialog', { name: 'Move Project', exact: true })
  const renameModal = () => window.getByRole('dialog', { name: 'Rename Project', exact: true })
  const journal = (id) => database.db.selectFrom('project_relocation').selectAll().where('local_project_key', '=', id).executeTakeFirst()
  const bbox = (x) => ({ height: 512, width: 640, x, y: -x })
  async function watchTabs() {
    await window.evaluate(() => {
      window.__relocationTabs = []
      window.api.projects.onTabsChanged((tabs) => { window.__relocationTabs = tabs })
    })
  }
  async function currentTab(id) {
    return await window.evaluate((id) => window.__relocationTabs.find((tab) => tab.id === id), id)
  }
  async function browse(workspace = null) {
    await showHome()
    if (workspace) {
      await home().locator('.workspace-select').filter({ hasText: workspace.displayName }).click()
      await expect(window.getByRole('heading', { name: workspace.displayName, exact: true })).toBeVisible()
    } else {
      await home().getByRole('button', { name: 'Projects', exact: true }).click()
    }
  }
  async function request(title, label, dialog) {
    await window.getByRole('button', { name: `${title} project actions`, exact: true }).click()
    await window.locator('.n-dropdown-option-body__label:visible').filter({ hasText: new RegExp(`^${label}$`) }).click()
    await expect(dialog()).toBeVisible()
  }
  async function chooseDestination(workspace) {
    await moveModal().getByLabel('Destination workspace', { exact: true }).click()
    await window.locator('.n-base-select-option:visible').filter({ hasText: workspace.displayName }).click()
  }
  async function open(title, id) {
    await window.getByRole('button', { name: `Open ${title}`, exact: true }).click()
    await expect(window.getByRole('tab', { name: title, exact: true })).toHaveAttribute('aria-selected', 'true')
    // Open returns the existing coordinator's snapshot; opening UI itself has no tabs broadcast.
    const result = await api('open', id)
    assert.equal(result.kind, 'opened')
    return result.tab
  }
  async function packageState(file) {
    const value = await readIgsPackage(file)
    const members = {}
    for (const member of value.manifest.members.filter((m) => m.path !== 'project.json').sort((a, b) => a.path.localeCompare(b.path))) {
      members[member.path] = createHash('sha256').update(await value.readMember(member.path)).digest('hex')
    }
    return { sha256: digest(file), project: value.project, preview: value.manifest.preview, members }
  }
  function assertRenameContent(before, after, title) {
    assert.equal(after.project.title, title)
    assert.notEqual(after.project.documentRevision, before.project.documentRevision)
    assert.deepEqual({ ...after.project, title: null, documentRevision: null }, { ...before.project, title: null, documentRevision: null })
    assert.deepEqual(after.preview, before.preview)
    assert.deepEqual(after.members, before.members)
  }
  async function restoreFault(file, mode) {
    const fileExists = existsSync(file)
    if (fileExists) chmodSync(file, mode)
    const proof = await application.evaluate(() => {
      const fs = process.getBuiltinModule('fs')
      const state = globalThis.__relocationFsFault
      fs.renameSync = state.originalRenameSync
      fs.open = state.originalOpen
      fs.promises.rename = state.originalRename
      fs.promises.open = state.originalPromiseOpen
      const proof = {
        renameSync: fs.renameSync === state.originalRenameSync,
        open: fs.open === state.originalOpen,
        rename: fs.promises.rename === state.originalRename,
        promiseOpen: fs.promises.open === state.originalPromiseOpen,
        fired: state.fired,
        physicalRenames: state.physicalRenames,
        metadataRenames: state.metadataRenames,
        destinationArchiveOpens: state.destinationArchiveOpens,
        deniedCode: state.deniedCode,
        stack: state.stack,
      }
      delete globalThis.__relocationFsFault
      return proof
    })
    assert.deepEqual([proof.renameSync, proof.open, proof.rename, proof.promiseOpen], [true, true, true, true])
    assert.ok(fileExists, 'The fault did not reach its owned physical destination')
    assert.equal(lstatSync(file).mode & 0o777, mode)
    report.relocationFsRestorations ??= []
    report.relocationFsRestorations.push({ file, mode, ...proof })
    persist()
    return proof
  }
  async function installFault(kind, from, to) {
    assert.equal(await application.evaluate(() => Boolean(globalThis.__relocationFsFault)), false)
    await application.evaluate((_electron, paths) => {
      const fs = process.getBuiltinModule('fs')
      const state = {
        originalRenameSync: fs.renameSync, originalOpen: fs.open,
        originalRename: fs.promises.rename, originalPromiseOpen: fs.promises.open,
        fired: 0, physicalRenames: 0, metadataRenames: 0, destinationArchiveOpens: 0,
        deniedCode: null, stack: null,
      }
      globalThis.__relocationFsFault = state
      function consumerStack(message) {
        const previous = Error.stackTraceLimit
        try {
          Error.stackTraceLimit = 64
          return new Error(message).stack
        } finally {
          Error.stackTraceLimit = previous
        }
      }
      fs.renameSync = (from, to) => {
        const result = state.originalRenameSync(from, to)
        if (from === paths.from && to === paths.to) state.physicalRenames++
        return result
      }
      if (paths.kind === 'move') {
        // Core digest reads use fs.promises.open. The first callback ZIP open after the
        // physical rename belongs to live rebindLocation, after the SQL path repoint.
        fs.open = (...args) => {
          if (args[0] === paths.to && state.physicalRenames === 1) {
            state.destinationArchiveOpens++
            if (state.fired === 0) {
              state.fired++
              state.stack = consumerStack('Owned live-rebind read boundary')
              fs.chmodSync(paths.to, 0o000)
              const callback = args.at(-1)
              args[args.length - 1] = (error, ...rest) => {
                state.deniedCode = error?.code ?? null
                callback(error, ...rest)
              }
            }
          }
          return state.originalOpen(...args)
        }
      } else if (paths.kind === 'open-rename') {
        fs.promises.rename = async (from, to) => {
          const result = await state.originalRename(from, to)
          if (to === paths.to && from !== paths.from) {
            if (!String(from).startsWith(`${paths.parent}/.${paths.fileName}.`) || !String(from).endsWith('.tmp')) throw new Error('Unexpected metadata replacement path')
            state.metadataRenames++
          }
          return result
        }
        fs.open = (...args) => {
          if (args[0] === paths.to && state.metadataRenames === 1) {
            state.destinationArchiveOpens++
            const stack = consumerStack('Owned open Rename live-rebind boundary')
            if (state.fired === 0 && /rebindLocation/.test(stack)) {
              state.fired++
              state.stack = stack
              fs.chmodSync(paths.parent, 0o000)
              const callback = args.at(-1)
              args[args.length - 1] = (error, ...rest) => {
                state.deniedCode = error?.code ?? null
                callback(error, ...rest)
              }
            }
          }
          return state.originalOpen(...args)
        }
      } else {
        fs.promises.rename = async (from, to) => {
          const result = await state.originalRename(from, to)
          if (to === paths.to && from !== paths.from) {
            if (!String(from).startsWith(`${paths.parent}/.${paths.fileName}.`) || !String(from).endsWith('.tmp')) throw new Error('Unexpected metadata replacement path')
            state.metadataRenames++
            fs.chmodSync(paths.to, 0o000)
          }
          return result
        }
        fs.promises.open = async (...args) => {
          const selected = args[0] === paths.to && state.metadataRenames === 1 && state.fired === 0
          if (selected) {
            state.fired++
            state.stack = consumerStack('Owned post-metadata verification boundary')
          }
          try {
            return await state.originalPromiseOpen(...args)
          } catch (error) {
            if (selected) state.deniedCode = error.code
            throw error
          }
        }
      }
    }, { kind, from, to, parent: path.dirname(to), fileName: path.basename(to) })
  }
  async function pendingMove(project, from, to, workspace, explicitTabClose) {
    await browse()
    const before = await open(project.title, project.id)
    const beforeHash = digest(from)
    const mode = lstatSync(from).mode & 0o777
    await browse()
    await request(project.title, 'Move to Workspace', moveModal)
    await chooseDestination(workspace)
    await installFault('move', from, to)
    let fault
    try {
      await moveModal().getByRole('button', { name: 'Move Project', exact: true }).click()
      await expect(moveModal().getByRole('button', { name: 'Retry Move', exact: true })).toBeVisible()
      const row = await journal(project.id)
      assert.equal(row.state, 'moved')
      assert.equal(row.source_path, from)
      assert.equal(row.destination_path, to)
      assert.equal((await indexRecord(project.id)).canonical_path, to)
      assert.equal(existsSync(from), false)
      await expect.poll(async () => (await currentTab(project.id))?.relocationPending).toBe(true)
      const live = await currentTab(project.id)
      assert.equal(live.documentId, before.documentId)
      assert.equal(live.documentRevision, before.documentRevision)
    } finally {
      fault = await restoreFault(to, mode)
    }
    assert.equal(fault.physicalRenames, 1)
    assert.equal(fault.destinationArchiveOpens, 1, 'Unexpected callback archive consumer; this is a setup failure')
    assert.equal(fault.fired, 1)
    assert.equal(fault.deniedCode, 'EACCES')
    assert.match(fault.stack, /rebindLocation/, 'Fault must reach the actual live session rebind consumer')
    assert.equal(digest(to), beforeHash)
    await moveModal().getByRole('button', { name: 'Close', exact: true }).click()
    await browse()
    await expect(window.getByRole('button', { name: `Open ${project.title}`, exact: true })).toBeDisabled()
    await request(project.title, 'Retry Move', moveModal)
    await expect(moveModal().getByLabel('Destination workspace', { exact: true }).locator('.n-base-selection')).toHaveClass(/n-base-selection--disabled/)
    await moveModal().getByRole('button', { name: 'Close', exact: true }).click()
    await window.getByRole('tab', { name: project.title, exact: true }).click()
    await expect(window.getByText('This Project has a pending file operation. Finish it from Home to continue editing. You can also close this tab.', { exact: true })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Save Project', exact: true })).toBeDisabled()
    await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
    const failures = await window.evaluate(async ({ id, documentId }) => {
      return await Promise.all([
        window.api.projects.setPrimaryBbox(id, { height: 512, width: 640, x: 93, y: -93 }),
        window.api.projects.save(id),
        window.api.projects.generate(id, { documentId, iterations: 1 }),
      ])
    }, { id: project.id, documentId: before.documentId })
    assert.ok(failures.every((result) => !result.ok))
    assert.deepEqual(failures.map((result) => result.error.code), [
      'PROJECT_NOT_READY', 'PROJECT_NOT_READY', 'GENERATION_DOCUMENT_CHANGED',
    ])
    assert.equal(digest(to), beforeHash)
    assert.equal(existsSync(from), false)
    if (explicitTabClose) {
      await closeProject(project.title)
      assert.ok(await journal(project.id))
    }
    await browse()
    await screenshot(explicitTabClose ? 'relocation-pending-tab-closed' : 'relocation-pending-live', 1440, 900)
    check(explicitTabClose
      ? 'real EACCES at live rebind retains moved journal; UI/Main fence edits Save Generate and explicit tab Close preserves recovery'
      : 'second real live-rebind EACCES leaves pending clean tab for normal native window Close', { id: project.id, source: from, destination: to, sha256: beforeHash, fault })
    return beforeHash
  }

  if (openRenameOnly) {
    const controlTitle = 'Open Renamed Project'
    const retryTitle = 'Retry Renamed Project'
    const closedTitle = 'Closed Pending Rename'
    const coldTitle = 'Cold Recovered Rename'
    const controlPath = path.join(folder, `${controlTitle}.igs`)
    const retryPath = path.join(folder, `${retryTitle}.igs`)
    const closedPath = path.join(folder, `${closedTitle}.igs`)
    const coldPath = path.join(folder, `${coldTitle}.igs`)
    const widthInput = () => window.locator('input[aria-label="Generation area width"]')
    async function changeWidth(width) {
      await widthInput().fill(String(width))
      await widthInput().press('Enter')
      await expect(window.getByText('Unsaved changes', { exact: true })).toBeVisible()
    }
    async function saveUi() {
      await window.getByRole('button', { name: 'Save Project', exact: true }).click()
      await expect(window.getByText('Saved', { exact: true })).toBeVisible()
    }
    async function prepareHistory(project) {
      await browse(source)
      await open(project.title, project.id)
      await changeWidth(648)
      await saveUi()
      await changeWidth(656)
      await window.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(window.getByText('Saved', { exact: true })).toBeVisible()
      const value = await api('open', project.id)
      assert.equal(value.kind, 'opened')
      assert.equal(value.tab.dirty, false)
      assert.equal(value.tab.primaryBbox.width, 648)
      assert.equal(value.tab.canUndo, true)
      assert.equal(value.tab.canRedo, true)
      return value.tab
    }
    async function historySave(title, id, file) {
      await window.getByRole('tab', { name: title, exact: true }).click()
      for (const [direction, width] of [['Undo', 640], ['Redo', 648], ['Redo', 656], ['Undo', 648]]) {
        await window.getByRole('button', { name: direction, exact: true }).click()
        await saveUi()
        const saved = await readIgsPackage(file)
        assert.equal(saved.project.title, title)
        assert.equal(saved.project.primaryBbox.width, width)
      }
      const value = await api('open', id)
      assert.equal(value.kind, 'opened')
      assert.equal(value.tab.title, title)
      assert.equal(value.tab.dirty, false)
      assert.equal(value.tab.canUndo, true)
      assert.equal(value.tab.canRedo, true)
    }
    async function pendingRename(project, from, to, title, capture = false) {
      await browse(source)
      const before = await open(project.title, project.id)
      const beforePackage = await packageState(from)
      const mode = lstatSync(path.dirname(to)).mode & 0o777
      await browse(source)
      await request(project.title, 'Rename', renameModal)
      await renameModal().getByRole('textbox', { name: 'Project name', exact: true }).fill(title)
      await installFault('open-rename', from, to)
      let fault
      let live
      let witness
      try {
        await renameModal().getByRole('button', { name: 'Rename', exact: true }).click()
        await expect(renameModal().getByRole('button', { name: 'Retry Rename', exact: true })).toBeVisible()
        const row = await journal(project.id)
        assert.equal(row.operation_kind, 'rename')
        assert.equal(row.state, 'moved')
        assert.notEqual(row.target_witness_json, null)
        witness = JSON.parse(row.target_witness_json)
        assert.equal(row.source_path, from)
        assert.equal(row.destination_path, to)
        assert.equal((await indexRecord(project.id)).canonical_path, to)
        assert.equal(existsSync(from), false)
        await expect.poll(async () => (await currentTab(project.id))?.relocationPending).toBe(true)
        live = await currentTab(project.id)
        assert.equal(live.title, before.title)
        assert.equal(live.documentId, before.documentId)
        assert.equal(live.documentRevision, before.documentRevision)
        assert.equal(live.dirty, false)
      } finally {
        fault = await restoreFault(path.dirname(to), mode)
      }
      const afterModeRestore = lstatSync(to, { bigint: true })
      assert.deepEqual(Object.fromEntries(Object.keys(witness).map((key) => [key, afterModeRestore[key].toString()])), witness, 'Directory permission restoration must not mutate the captured target witness')
      assert.equal(fault.physicalRenames, 1)
      assert.equal(fault.metadataRenames, 1)
      assert.equal(fault.fired, 1)
      assert.equal(fault.deniedCode, 'EACCES')
      assert.match(fault.stack, /rebindLocation/, 'Fault must reach the live renamed-session consumer after metadata and SQL repoint')
      const afterPackage = await packageState(to)
      assertRenameContent(beforePackage, afterPackage, title)
      const frozenInput = renameModal().getByRole('textbox', { name: 'Project name', exact: true })
      await expect(frozenInput).toBeDisabled()
      await expect(frozenInput).toHaveValue(title)
      if (capture) await screenshot('open-rename-pending-frozen', 900, 620)
      await renameModal().getByRole('button', { name: 'Close', exact: true }).click()
      await browse(source)
      await expect(window.getByRole('button', { name: `Open ${project.title}`, exact: true })).toBeDisabled()
      const conflict = await window.evaluate(({ id, name }) => window.api.projects.renameProject(id, name), { id: project.id, name: `${title} other` })
      assert.equal(conflict.ok, false)
      assert.equal(conflict.error.code, 'PROJECT_NOT_READY')
      assert.equal(digest(to), afterPackage.sha256)
      await request(project.title, 'Retry Rename', renameModal)
      await expect(renameModal().getByRole('textbox', { name: 'Project name', exact: true })).toHaveValue(title)
      await expect(renameModal().getByRole('textbox', { name: 'Project name', exact: true })).toBeDisabled()
      await renameModal().getByRole('button', { name: 'Close', exact: true }).click()
      await window.getByRole('tab', { name: project.title, exact: true }).click()
      await expect(window.getByText('This Project has a pending file operation. Finish it from Home to continue editing. You can also close this tab.', { exact: true })).toBeVisible()
      await expect(window.getByRole('button', { name: 'Save Project', exact: true })).toBeDisabled()
      await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
      const failures = await window.evaluate(async ({ id, documentId }) => Promise.all([
        window.api.projects.setPrimaryBbox(id, { height: 512, width: 640, x: 91, y: -91 }),
        window.api.projects.save(id),
        window.api.projects.generate(id, { documentId, iterations: 1 }),
      ]), { id: project.id, documentId: before.documentId })
      assert.ok(failures.every((result) => !result.ok))
      assert.deepEqual(failures.map((result) => result.error.code), ['PROJECT_NOT_READY', 'PROJECT_NOT_READY', 'GENERATION_DOCUMENT_CHANGED'])
      assert.equal(digest(to), afterPackage.sha256)
      assert.equal(existsSync(from), false)
      await browse(source)
      return { before, beforePackage, afterPackage, live, fault }
    }

    await watchTabs()
    await browse(source)
    await open(moved.title, moved.id)
    const originalControlHash = digest(movedSource)
    await changeWidth(648)
    await browse(source)
    await request(moved.title, 'Rename', renameModal)
    await expect(renameModal().getByText(/has unsaved changes/)).toBeVisible()
    await expect(renameModal().getByRole('button', { name: 'Rename', exact: true })).toHaveCount(0)
    const dirtyRefusal = await window.evaluate((id) => window.api.projects.renameProject(id, 'Refused Dirty Rename'), moved.id)
    assert.equal(dirtyRefusal.ok, false)
    assert.equal(dirtyRefusal.error.code, 'PROJECT_ALREADY_OPEN')
    assert.equal(digest(movedSource), originalControlHash)
    assert.equal(await journal(moved.id), undefined)
    await screenshot('open-rename-dirty-blocker', 900, 620)
    await renameModal().getByRole('button', { name: 'Switch to Project', exact: true }).click()
    await window.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(window.getByText('Saved', { exact: true })).toBeVisible()
    check('dirty open Rename is visibly refused through Home and Main without implicit Save or path mutation')

    const clean = await prepareHistory(moved)
    const beforeControl = await packageState(movedSource)
    await browse(source)
    await request(moved.title, 'Rename', renameModal)
    await renameModal().getByRole('textbox', { name: 'Project name', exact: true }).fill(controlTitle)
    await screenshot('open-rename-confirmation', 900, 620)
    await renameModal().getByRole('button', { name: 'Rename', exact: true }).click()
    await expect(renameModal()).toHaveCount(0)
    await expect.poll(async () => (await currentTab(moved.id))?.title).toBe(controlTitle)
    const rebound = await currentTab(moved.id)
    assert.deepEqual({ id: rebound.id, documentId: rebound.documentId, title: rebound.title, dirty: rebound.dirty, undo: rebound.canUndo, redo: rebound.canRedo, workspace: rebound.workspaceId }, { id: clean.id, documentId: clean.documentId, title: controlTitle, dirty: false, undo: true, redo: true, workspace: source.id })
    assert.notEqual(rebound.documentRevision, clean.documentRevision)
    await expect(window.getByRole('tab', { name: moved.title, exact: true })).toHaveCount(0)
    await expect(window.getByRole('tab', { name: controlTitle, exact: true }).locator('.project-marker')).toHaveAttribute('data-workspace-id', source.id)
    const renamedControl = await packageState(controlPath)
    assertRenameContent(beforeControl, renamedControl, controlTitle)
    assert.equal(renamedControl.project.documentRevision, rebound.documentRevision)
    assert.equal(existsSync(movedSource), false)
    assert.equal(await journal(moved.id), undefined)
    await screenshot('open-rename-live-title', 1440, 900)
    check('clean-open Rename keeps tab document identity and both history directions while changing title filename and saved revision', { id: moved.id, before: beforeControl, after: renamedControl, tab: rebound })
    await historySave(controlTitle, moved.id, controlPath)
    assert.equal(existsSync(movedSource), false)
    check('live Undo Redo and original future canvas state survive Rename and every explicit Save retains the new title and path')
    await closeProject(controlTitle)
    await close('open-rename-first-normal')

    await launch('open-rename-faults')
    await watchTabs()
    const retryClean = await prepareHistory(renamed)
    const retryPending = await pendingRename(renamed, renameSource, retryPath, retryTitle, true)
    check('real EACCES during renamed-session rebind keeps post-SQL intent and frozen name while UI and Main fence editing Save and Generate', { id: renamed.id, fault: retryPending.fault, before: retryPending.beforePackage, after: retryPending.afterPackage })
    await request(renamed.title, 'Retry Rename', renameModal)
    await renameModal().getByRole('button', { name: 'Retry Rename', exact: true }).click()
    await expect(renameModal()).toHaveCount(0)
    await expect.poll(async () => (await currentTab(renamed.id))?.title).toBe(retryTitle)
    const retried = await currentTab(renamed.id)
    assert.deepEqual({ id: retried.id, documentId: retried.documentId, dirty: retried.dirty, undo: retried.canUndo, redo: retried.canRedo }, { id: retryClean.id, documentId: retryClean.documentId, dirty: false, undo: true, redo: true })
    assert.equal(retried.documentRevision, retryPending.afterPackage.project.documentRevision)
    assert.equal(digest(retryPath), retryPending.afterPackage.sha256)
    assert.equal(await journal(renamed.id), undefined)
    check('same-live frozen Rename Retry adopts the already-published exact package and preserves the existing tab history')
    await historySave(retryTitle, renamed.id, retryPath)
    assert.equal(existsSync(renameSource), false)
    const retryFinalHash = digest(retryPath)
    await closeProject(retryTitle)
    check('same-live Retry retains Undo Redo and later Save uses the renamed title and destination only')

    const renamedControlSummary = { ...moved, title: controlTitle }
    const closedPendingRename = await pendingRename(renamedControlSummary, controlPath, closedPath, closedTitle)
    await closeProject(controlTitle)
    assert.ok(await journal(moved.id))
    check('explicit pending Rename tab Close preserves durable intent without an old-path write', { id: moved.id, fault: closedPendingRename.fault })
    await prepareHistory(closedPending)
    const coldPendingRename = await pendingRename(closedPending, closedSource, coldPath, coldTitle)
    assert.equal((await currentTab(closedPending.id)).relocationPending, true)
    const pendingRows = await database.db.selectFrom('project_relocation').selectAll().execute()
    assert.deepEqual(pendingRows.map((row) => row.local_project_key).sort(), [moved.id, closedPending.id].sort())
    await screenshot('open-rename-pending-home', 1440, 900)
    check('pending Rename survives dialog Close and retains a fenced clean tab for normal app Close', { id: closedPending.id, fault: coldPendingRename.fault, journals: pendingRows })
    await close('open-rename-pending-normal')

    await launch('open-rename-recovered')
    await watchTabs()
    assert.deepEqual(await database.db.selectFrom('project_relocation').selectAll().execute(), [])
    assert.equal((await indexRecord(moved.id)).canonical_path, closedPath)
    assert.equal((await indexRecord(closedPending.id)).canonical_path, coldPath)
    assert.equal((await indexRecord(renamed.id)).canonical_path, retryPath)
    assert.equal(digest(closedPath), closedPendingRename.afterPackage.sha256)
    assert.equal(digest(coldPath), coldPendingRename.afterPackage.sha256)
    assert.equal(digest(retryPath), retryFinalHash)
    for (const stale of [movedSource, controlPath, closedSource, renameSource]) assert.equal(existsSync(stale), false)
    await browse(source)
    await expect(window.getByText('Rename pending', { exact: true })).toHaveCount(0)
    await expect(window.getByRole('button', { name: `Open ${closedTitle}`, exact: true })).toBeEnabled()
    await expect(window.getByRole('button', { name: `Open ${coldTitle}`, exact: true })).toBeEnabled()
    await screenshot('open-rename-recovered-home', 1440, 900)
    check('cold startup completes both live and explicitly closed Rename intents with exact package bytes stable keys and no stale paths')
    const recoveredControl = await open(closedTitle, moved.id)
    assert.equal(recoveredControl.documentId, clean.documentId)
    assert.equal(recoveredControl.title, closedTitle)
    assert.equal(recoveredControl.canUndo, false)
    assert.equal(recoveredControl.canRedo, false)
    await changeWidth(664)
    await saveUi()
    assert.equal((await readIgsPackage(closedPath)).project.title, closedTitle)
    assert.equal((await readIgsPackage(closedPath)).project.primaryBbox.width, 664)
    assert.equal(existsSync(controlPath), false)
    await closeProject(closedTitle)
    await browse(source)
    const recoveredCold = await open(coldTitle, closedPending.id)
    assert.equal(recoveredCold.documentId, coldPendingRename.before.documentId)
    assert.equal(recoveredCold.title, coldTitle)
    assert.equal(recoveredCold.canUndo, false)
    assert.equal(recoveredCold.canRedo, false)
    await closeProject(coldTitle)
    await browse(source)
    check('recovered Rename opens the original document with transient history reset and explicit later Save retains authoritative title and path')
    return
  }

  await watchTabs()
  await browse(source)
  await open(moved.title, moved.id)
  await window.locator('input[aria-label="Generation area width"]').fill('648')
  await window.locator('input[aria-label="Generation area width"]').press('Enter')
  await expect(window.getByText('Unsaved changes', { exact: true })).toBeVisible()
  await browse(source)
  await request(moved.title, 'Move to Workspace', moveModal)
  await expect(moveModal().getByText(/has unsaved changes/)).toBeVisible()
  await expect(moveModal().getByRole('button', { name: 'Move Project', exact: true })).toHaveCount(0)
  await screenshot('relocation-dirty-blocker', 900, 620)
  await moveModal().getByRole('button', { name: 'Switch to Project', exact: true }).click()
  await window.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(window.getByText('Saved', { exact: true })).toBeVisible()
  check('dirty open Move offers Switch with no implicit Save close or filesystem effect')
  await api('setPrimaryBbox', moved.id, bbox(7))
  await api('save', moved.id)
  await api('setPrimaryBbox', moved.id, bbox(9))
  await api('save', moved.id)
  await api('undo', moved.id)
  const clean = (await api('save', moved.id)).tab
  assert.equal(clean.dirty, false)
  assert.equal(clean.canUndo, true)
  assert.equal(clean.canRedo, true)
  const cleanHash = digest(movedSource)
  await browse(source)
  await request(moved.title, 'Rename', renameModal)
  await expect(renameModal().getByRole('textbox', { name: 'Project name', exact: true })).toBeEnabled()
  await expect(renameModal().getByRole('button', { name: 'Rename', exact: true })).toBeEnabled()
  await renameModal().getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(digest(movedSource), cleanHash)
  check('clean open Rename offers the confirmation without implicit Save or tab replacement')
  await browse(source)
  await request(moved.title, 'Move to Workspace', moveModal)
  await chooseDestination(target)
  await screenshot('relocation-clean-open-confirmation', 900, 620)
  await moveModal().getByRole('button', { name: 'Move Project', exact: true }).click()
  await expect(moveModal()).toHaveCount(0)
  await expect.poll(async () => (await currentTab(moved.id))?.workspaceId).toBe(target.id)
  const rebound = await currentTab(moved.id)
  assert.deepEqual({ id: rebound.id, documentId: rebound.documentId, revision: rebound.documentRevision, undo: rebound.canUndo, redo: rebound.canRedo, dirty: rebound.dirty }, { id: clean.id, documentId: clean.documentId, revision: clean.documentRevision, undo: true, redo: true, dirty: false })
  await expect(window.getByRole('tab', { name: moved.title, exact: true }).locator('.project-marker')).toHaveAttribute('data-workspace-id', target.id)
  assert.equal(existsSync(movedSource), false)
  assert.equal(digest(movedDestination), cleanHash)
  check('clean-open Move retains exact live tab document Undo/Redo and package bytes with authoritative target marker', { id: moved.id, source: movedSource, destination: movedDestination, tab: rebound })
  await window.getByRole('tab', { name: moved.title, exact: true }).click()
  await api('undo', moved.id)
  await api('save', moved.id)
  assert.equal((await readIgsPackage(movedDestination)).project.primaryBbox.x, 0)
  await api('redo', moved.id)
  await api('save', moved.id)
  assert.equal((await readIgsPackage(movedDestination)).project.primaryBbox.x, 7)
  assert.equal(existsSync(movedSource), false)
  const savedMovedHash = digest(movedDestination)
  await closeProject(moved.title)
  check('preserved live Undo/Redo followed by Save writes only the new canonical location')
  await browse(source)
  const beforeRename = await packageState(renameSource)
  await request(renamed.title, 'Rename', renameModal)
  await renameModal().getByRole('textbox', { name: 'Project name', exact: true }).fill('../invalid')
  await expect(renameModal().getByText('Project name contains unsupported characters.', { exact: true })).toBeVisible()
  await expect(renameModal().getByRole('button', { name: 'Rename', exact: true })).toBeDisabled()
  await screenshot('relocation-rename-validation', 900, 620)
  await renameModal().getByRole('textbox', { name: 'Project name', exact: true }).fill(path.basename(closedSource, '.igs'))
  const collisionHash = digest(closedSource)
  await renameModal().getByRole('button', { name: 'Rename', exact: true }).click()
  await expect(renameModal().getByText(/A file with this name already exists/)).toBeVisible()
  await renameModal().getByRole('button', { name: 'Close', exact: true }).click()
  assert.equal(digest(renameSource), beforeRename.sha256)
  assert.equal(digest(closedSource), collisionHash)
  assert.equal(await journal(renamed.id), undefined)
  check('shared Rename name validation and real destination collision preserve both original packages with no journal')
  await request(renamed.title, 'Rename', renameModal)
  await renameModal().getByRole('textbox', { name: 'Project name', exact: true }).fill('  Renamed Project  ')
  await renameModal().getByRole('button', { name: 'Rename', exact: true }).click()
  await expect(renameModal()).toHaveCount(0)
  assert.equal(existsSync(renameSource), false)
  assert.equal((await indexRecord(renamed.id)).canonical_path, renameDestination)
  const afterRename = await packageState(renameDestination)
  assertRenameContent(beforeRename, afterRename, 'Renamed Project')
  await expect(window.getByRole('button', { name: 'Open Renamed Project', exact: true })).toBeVisible()
  await screenshot('relocation-renamed-home', 1440, 900)
  check('public closed Rename changes title and filename together, retaining stable identity preview and every non-project member', { id: renamed.id, before: beforeRename, after: afterRename })
  await request('Renamed Project', 'Rename', renameModal)
  await renameModal().getByRole('button', { name: 'Rename', exact: true }).click()
  await expect(renameModal()).toHaveCount(0)
  assert.equal(digest(renameDestination), afterRename.sha256)
  assert.equal(await journal(renamed.id), undefined)
  check('same-name Rename is an exact-byte no-op with no new revision or journal')
  await close('relocation-first-normal')

  await launch('relocation-faults')
  await watchTabs()
  assert.equal(digest(movedDestination), savedMovedHash)
  assert.equal(digest(renameDestination), afterRename.sha256)
  const pendingClosedHash = await pendingMove(closedPending, closedSource, closedDestination, target, true)
  const pendingLiveHash = await pendingMove(moved, movedDestination, movedSource, source, false)
  await browse(source)
  await request('Renamed Project', 'Rename', renameModal)
  await renameModal().getByRole('textbox', { name: 'Project name', exact: true }).fill('Recovered Name')
  const renameMode = lstatSync(renameDestination).mode & 0o777
  await installFault('rename', renameDestination, renameRecovered)
  let renameFault
  try {
    await renameModal().getByRole('button', { name: 'Rename', exact: true }).click()
    await expect(renameModal().getByRole('button', { name: 'Retry Rename', exact: true })).toBeVisible()
    const row = await journal(renamed.id)
    assert.equal(row.operation_kind, 'rename')
    assert.equal(row.state, 'moving')
    assert.equal(row.target_witness_json, null)
    assert.equal(row.destination_path, renameRecovered)
    assert.equal((await indexRecord(renamed.id)).canonical_path, renameDestination)
  } finally {
    renameFault = await restoreFault(renameRecovered, renameMode)
  }
  assert.equal(renameFault.physicalRenames, 1)
  assert.equal(renameFault.metadataRenames, 1)
  assert.equal(renameFault.fired, 1)
  assert.equal(renameFault.deniedCode, 'EACCES')
  assert.match(renameFault.stack, /verifyRenamedPackage/, 'Fault must reach actual post-metadata package verification')
  const pendingRenameState = await packageState(renameRecovered)
  assertRenameContent(afterRename, pendingRenameState, 'Recovered Name')
  await expect(renameModal().getByRole('textbox', { name: 'Project name', exact: true })).toBeDisabled()
  await expect(renameModal().getByRole('textbox', { name: 'Project name', exact: true })).toHaveValue('Recovered Name')
  await renameModal().getByRole('button', { name: 'Close', exact: true }).click()
  await browse()
  await expect(window.getByText('Rename pending', { exact: true })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Open Renamed Project', exact: true })).toBeDisabled()
  await request('Renamed Project', 'Retry Rename', renameModal)
  await expect(renameModal().getByRole('textbox', { name: 'Project name', exact: true })).toHaveValue('Recovered Name')
  await renameModal().getByRole('button', { name: 'Close', exact: true }).click()
  const pendingRows = await database.db.selectFrom('project_relocation').selectAll().execute()
  assert.equal(pendingRows.length, 3)
  assert.equal((await currentTab(moved.id)).relocationPending, true)
  await screenshot('relocation-three-pending-home', 1440, 900)
  check('real post-metadata EACCES keeps frozen Rename intent and exact changed package; Home blocks Open while pending live Move remains', { id: renamed.id, fault: renameFault, journals: pendingRows })
  await close('relocation-pending-live-normal')

  await launch('relocation-recovered')
  await watchTabs()
  assert.deepEqual(await database.db.selectFrom('project_relocation').selectAll().execute(), [])
  assert.equal((await indexRecord(moved.id)).canonical_path, movedSource)
  assert.equal((await indexRecord(closedPending.id)).canonical_path, closedDestination)
  assert.equal((await indexRecord(renamed.id)).canonical_path, renameRecovered)
  assert.equal(digest(movedSource), pendingLiveHash)
  assert.equal(digest(closedDestination), pendingClosedHash)
  assert.equal(digest(renameRecovered), pendingRenameState.sha256)
  for (const stale of [movedDestination, closedSource, renameDestination]) assert.equal(existsSync(stale), false)
  await browse()
  await expect(window.getByText('Move pending', { exact: true })).toHaveCount(0)
  await expect(window.getByText('Rename pending', { exact: true })).toHaveCount(0)
  await expect(window.getByRole('button', { name: 'Open Recovered Name', exact: true })).toBeEnabled()
  await screenshot('relocation-recovered-home', 1440, 900)
  check('normal cold restart recovers two post-repoint Move journals and post-metadata Rename, stable keys exact bytes and no stale source')
  const reopenedMove = await open(moved.title, moved.id)
  assert.equal(reopenedMove.workspaceId, source.id)
  await api('setPrimaryBbox', moved.id, bbox(19))
  await api('save', moved.id)
  assert.equal((await readIgsPackage(movedSource)).project.primaryBbox.x, 19)
  assert.equal(existsSync(movedDestination), false)
  await closeProject(moved.title)
  await browse()
  const reopenedRename = await open('Recovered Name', renamed.id)
  assert.equal(reopenedRename.id, renamed.id)
  assert.equal(reopenedRename.documentId, pendingRenameState.project.documentId)
  assert.equal(reopenedRename.title, 'Recovered Name')
  await closeProject('Recovered Name')
  await browse()
  check('recovered Project opens by original key; subsequent explicit edit Save and renamed-title reopen use only authoritative destinations')
}
/** Read-only Home browse consumer with real timestamps and independent saved/recovery conditions. */
async function manageBrowse() {
  const summaries = await api('list', registered.id)
  const find = (title) => {
    const value = summaries.find((project) => project.title === title)
    assert.ok(value)
    return value
  }
  const recent = find('Move Project')
  const recovery = find('Copy Project')
  const missing = find('Workspace Project')
  const records = Object.fromEntries(await Promise.all(summaries.map(async (project) => [project.id, await indexRecord(project.id)])))
  const files = Object.fromEntries(summaries.map((project) => [project.id, records[project.id].canonical_path]))
  const originalHashes = Object.fromEntries(summaries.map((project) => [project.id, digest(files[project.id])]))
  const dates = new Map([
    [missing.id, '2020-03-03T00:00:00.000Z'],
    [recovery.id, '2020-02-02T00:00:00.000Z'],
    [recent.id, '2020-01-01T00:00:00.000Z'],
  ])
  for (const project of summaries) {
    const date = new Date(dates.get(project.id))
    utimesSync(files[project.id], date, date)
  }
  const sortControl = () => window.getByLabel('Sort by', { exact: true })
  const statusControl = () => window.getByLabel('Status', { exact: true })
  const searchControl = () => window.getByRole('textbox', { name: 'Search projects', exact: true })
  const resetControl = () => window.getByLabel('Project browser controls', { exact: true }).getByRole('button', { name: 'Reset filters', exact: true })
  const rowIds = () => window.locator('.project-row:visible').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-project-id')))
  async function rows(expected) {
    await expect.poll(rowIds).toEqual(expected)
  }
  async function choose(control, label) {
    await control.click()
    await window.locator('.n-base-select-option:visible').filter({ hasText: new RegExp(`^${label}$`) }).click()
    await expect(control).toContainText(label)
  }
  async function refresh() {
    await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  }
  async function browseWorkspace() {
    await showHome()
    await home().locator('.workspace-select').filter({ hasText: registered.displayName }).click()
    await expect(window.getByRole('heading', { name: registered.displayName, exact: true })).toBeVisible()
  }
  async function browseAll() {
    await showHome()
    await home().getByRole('button', { name: 'Projects', exact: true }).click()
    await expect(window.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
  }
  async function openUi(project) {
    await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
    await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveAttribute('aria-selected', 'true')
  }
  async function assertControls(search, sort, status) {
    await expect(searchControl()).toHaveValue(search)
    await expect(sortControl()).toContainText(sort)
    await expect(statusControl()).toContainText(status)
  }
  await refresh()
  let actual = await api('list', registered.id)
  for (const value of actual) {
    assert.equal(value.modifiedAt, dates.get(value.id))
    assert.equal(digest(files[value.id]), originalHashes[value.id])
  }
  // Actual Main Open calls produce the operational last-opened timestamps; no DB update seam.
  const openedTimes = []
  for (const project of [recovery, missing, recent]) {
    await openUi(project)
    await closeProject(project.title)
    await showHome()
    const value = (await api('list', registered.id)).find(({ id }) => id === project.id)
    assert.ok(value.lastOpenedAt && Number.isFinite(Date.parse(value.lastOpenedAt)))
    openedTimes.push(value.lastOpenedAt)
  }
  assert.ok(openedTimes[0] < openedTimes[1] && openedTimes[1] < openedTimes[2])
  await refresh()
  await assertControls('', 'Last opened', 'All statuses')
  await rows([recent.id, missing.id, recovery.id])
  await choose(sortControl(), 'Name')
  await rows([recovery.id, recent.id, missing.id])
  await choose(sortControl(), 'Modified')
  await rows([missing.id, recovery.id, recent.id])
  actual = await api('list', registered.id)
  for (const value of actual) assert.equal(value.modifiedAt, dates.get(value.id), 'Open and browse must not manufacture package-modified times')
  check('real Main last-opened and saved file mtimes drive the three visible Home sort orders', { openedTimes, summaries: actual })
  await searchControl().fill(' Trash Workspace ')
  await rows([])
  await expect(window.getByText('No projects match this search or filter', { exact: true })).toBeVisible()
  await expect(resetControl()).toBeEnabled()
  await resetControl().click()
  await assertControls('', 'Modified', 'All statuses')
  await rows([missing.id, recovery.id, recent.id])
  check('Home search matches trimmed Project names only; no-match Reset clears filters but retains selected sort')
  await openUi(recent)
  await showHome()
  await choose(statusControl(), 'Open')
  await rows([recent.id])
  await searchControl().fill(' MOVE ')
  await rows([recent.id])
  await screenshot('browse-open-narrow', 900, 620)
  await window.getByRole('tab', { name: recent.title, exact: true }).click()
  await expect(window.getByRole('tab', { name: recent.title, exact: true })).toHaveAttribute('aria-selected', 'true')
  await showHome()
  await assertControls(' MOVE ', 'Modified', 'Open')
  await rows([recent.id])
  check('Open filter follows the actual tab registry and Home query controls survive Project remount')
  await browseAll()
  await assertControls(' MOVE ', 'Modified', 'Open')
  await rows([recent.id])
  await trashView()
  await assertControls(' MOVE ', 'Modified', 'Open')
  await rows([])
  await browseWorkspace()
  await assertControls(' MOVE ', 'Modified', 'Open')
  await rows([recent.id])
  await resetControl().click()
  await assertControls('', 'Modified', 'All statuses')
  await rows([missing.id, recovery.id, recent.id])
  await closeProject(recent.title)
  await choose(statusControl(), 'Open')
  await rows([])
  await resetControl().click()
  await screenshot('browse-controls-wide', 1440, 900)
  check('workspace Projects and Trash browse switches preserve search status and sort; Reset retains sort and closing a tab updates Open')
  for (const project of summaries) assert.equal(digest(files[project.id]), originalHashes[project.id])
  check('read-only Home sorting filtering remount and Open/Close preserve all three saved package bytes')
  await close('browse-first-normal')

  // These are explicit real disk preconditions prepared while the app is physically closed,
  // not a simulated crash and not a mocked Home/API result.
  const saved = await readIgsPackage(files[recovery.id])
  const shadowDocument = parseProjectDocumentV1({
    ...saved.project,
    documentRevision: randomUUID(),
    primaryBbox: { ...saved.project.primaryBbox, x: 8 },
  })
  const shadow = new ProjectShadowStore(path.join(appData, 'autosave'))
  await shadow.write({ projectPath: files[recovery.id], savedDocument: saved.project, document: shadowDocument })
  const inspection = await shadow.inspect({ projectPath: files[recovery.id], savedPackage: await readIgsPackage(files[recovery.id]) })
  assert.equal(inspection.status, 'recoverable')
  assert.equal(digest(files[recovery.id]), originalHashes[recovery.id])
  const previewOriginal = await readIgsPackage(files[recent.id])
  const raster = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==', 'base64')
  const layerId = randomUUID()
  const assetPath = `assets/layers/${layerId}.png`
  const previewDocument = parseProjectDocumentV1({
    ...previewOriginal.project,
    documentRevision: randomUUID(),
    layers: [{ id: layerId, kind: 'raster', name: 'Saved preview control', visible: true, locked: false, opacity: 1, blendMode: 'normal', transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 }, asset: { path: assetPath, bytes: raster.length, width: 2, height: 2, sha256: createHash('sha256').update(raster).digest('hex') } }],
  })
  const placeholder = await readProjectPlaceholders(path.resolve('src/main/projects/placeholders'), 'unavailable')
  await saveIgsPackage(files[recent.id], { project: previewDocument, assets: { [assetPath]: { bytes: raster } }, preview: { ...placeholder, rect: { x: 0, y: 0, width: 2, height: 2 }, status: 'unavailable' } })
  const previewHash = digest(files[recent.id])
  const retainedMissing = path.join(payload, 'browse-missing-retained.igs')
  renameSync(files[missing.id], retainedMissing)
  assert.equal(digest(retainedMissing), originalHashes[missing.id])
  const disconnected = `${folder}-browse-disconnected`
  try {
    await launch('browse-conditions')
    await browseWorkspace()
    actual = await api('list', registered.id)
    assert.equal(actual.find(({ id }) => id === missing.id).health, 'missing')
    assert.equal(actual.find(({ id }) => id === recovery.id).recoveryStatus, 'recoverable')
    assert.equal(actual.find(({ id }) => id === recent.id).health, 'ready')
    assert.equal(actual.find(({ id }) => id === recent.id).previewStatus, 'unavailable')
    await choose(sortControl(), 'Name')
    await choose(statusControl(), 'Recovery available')
    await rows([recovery.id])
    await screenshot('browse-recovery-only', 900, 620)
    check('Recovery filter consumes a real verified document shadow without including the missing-file or preview-unavailable controls', { summaries: actual, recoveryPreparation: 'real ProjectShadowStore.write while app closed; not crash qualification' })
    await choose(statusControl(), 'Needs attention')
    await rows([missing.id])
    check('Needs attention includes the actual missing file and excludes independent recovery-only and saved-preview-unavailable Projects')
    await choose(statusControl(), 'All statuses')
    await rows([recovery.id, recent.id, missing.id])
    await screenshot('browse-independent-conditions', 1440, 900)
    await choose(statusControl(), 'Needs attention')
    renameSync(folder, disconnected)
    await refresh()
    await expect.poll(async () => (await api('listWorkspaces')).find(({ id }) => id === registered.id)?.availability).toBe('missing')
    await rows([recovery.id, recent.id, missing.id])
    await expect(window.getByText(/workspace folder is missing/)).toBeVisible()
    await screenshot('browse-unavailable-workspace', 900, 620)
    check('workspace availability independently adds every cached Project to Needs attention without rewriting file health')
    renameSync(disconnected, folder)
    await refresh()
    await expect.poll(async () => (await api('listWorkspaces')).find(({ id }) => id === registered.id)?.availability).toBe('available')
    await rows([missing.id])
    await choose(statusControl(), 'Recovery available')
    await rows([recovery.id])
    assert.equal(digest(files[recovery.id]), originalHashes[recovery.id])
    assert.equal(digest(files[recent.id]), previewHash)
    assert.equal(digest(retainedMissing), originalHashes[missing.id])
    check('restoring workspace access restores independent filter membership and preserves Project and shadow bytes')
    renameSync(retainedMissing, files[missing.id])
    await refresh()
    await choose(statusControl(), 'Needs attention')
    await rows([])
    await resetControl().click()
    await assertControls('', 'Name', 'All statuses')
    await rows([recovery.id, recent.id, missing.id])
    await screenshot('browse-restored-home', 1440, 900)
    const restored = await api('list', registered.id)
    assert.ok(restored.every((project) => project.health === 'ready'))
    assert.equal(restored.find(({ id }) => id === recovery.id).recoveryStatus, 'recoverable')
    assert.equal(restored.find(({ id }) => id === recent.id).previewStatus, 'unavailable')
    report.browseFixtureRestoration = { sourceDirectory: folder, disconnectedAbsent: !existsSync(disconnected), missingSource: files[missing.id], missingRetainedAbsent: !existsSync(retainedMissing), missingSourceSha256: digest(files[missing.id]), recoveryPackageSha256: digest(files[recovery.id]), previewPackageSha256: digest(files[recent.id]) }
    persist()
    check('restored missing file reappears by its stable key; empty attention Reset keeps Name sort and all original package owners')
  } finally {
    // Restore only the exact owned fault paths, including when a UI assertion fails.
    if (existsSync(disconnected)) renameSync(disconnected, folder)
    if (existsSync(retainedMissing)) renameSync(retainedMissing, files[missing.id])
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
  if (trashOnly || locationsOnly || moveOnly || relocationOnly || openRenameOnly || browseOnly) {
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
  if (browseOnly) await manageBrowse()
  else if (relocationOnly || openRenameOnly) await manageRelocation()
  else if (moveOnly) await manageMove()
  else if (locationsOnly) await manageLocations()
  else await manageTrash()
  await close('restart-normal')
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.nativeClosures.length, browseOnly ? 2 : relocationOnly || openRenameOnly || moveOnly ? 3 : locationsOnly ? 2 : trashOnly ? 4 : 6)
  if (relocationOnly) assert.equal(report.checks.length, 13)
  if (openRenameOnly) assert.equal(report.checks.length, 11)
  if (browseOnly) assert.equal(report.checks.length, 11)
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
