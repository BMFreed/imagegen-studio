/** Finite built Home maintenance/model-notice consumer; catalog fixtures are not inference weights. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron, expect } from '@playwright/test'
import { openAppDatabase } from '../src/main/db/database.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import { boundQualificationProcess, confirmQualificationProcessExit } from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4, 'Use --report-file ABSOLUTE_NEW_OWNED_REPORT')
assert.equal(process.argv[2], '--report-file')
const reportFile = process.argv[3], evidenceRoot = path.dirname(reportFile)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const relative = path.relative(artifactRoot, evidenceRoot)
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
assert.equal(realpathSync(evidenceRoot), evidenceRoot); assert.equal(lstatSync(evidenceRoot).isSymbolicLink(), false); assert.equal(existsSync(reportFile), false)
const payload = mkdtempSync(path.join(evidenceRoot, 'native-home-maintenance-'))
const appData = path.join(payload, 'data/imagegen-studio'), folder = path.join(payload, 'selected-workspace'), backups = path.join(payload, 'original-inputs')
for (const directory of [folder, backups]) mkdirSync(directory)
const execute = promisify(execFile), digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const sourceFiles = [
  'scripts/smoke-home-maintenance.mjs', 'scripts/native-smoke-window.mjs', 'scripts/qualification-resource-limits.mjs',
  'src/main/index.ts', 'src/preload/index.ts', 'src/shared/api.ts', 'src/main/db/database.ts',
  'src/main/models/model-repository.ts', 'src/main/models/model-service.ts',
  'src/main/projects/project-service.ts', 'src/main/projects/project-index.ts', 'src/main/projects/project-location-registry.ts',
  'src/main/projects/project-session.ts', 'src/main/projects/igs-package.ts', 'src/main/projects/project-placeholders.ts',
  'src/shared/projects/project-schema.ts', 'src/shared/projects/project-workspaces.ts',
  'src/shared/projects/home-project-browse.ts', 'src/renderer/App.vue', 'src/renderer/components/HomeView.vue',
  'src/renderer/components/HomeProjectInspector.vue', 'src/renderer/components/WorkspaceSettingsModal.vue',
  'src/renderer/components/AddWorkspaceModal.vue', 'src/renderer/components/ModelManager.vue',
  'src/renderer/components/project-model-picker.ts', 'src/renderer/styles/global.css',
  'docs/prototype-app/src/components/IconButton.vue',
]
const bundleFiles = ['dist/main/main.cjs', 'dist/preload/preload.cjs', 'dist/renderer/index.html', ...readdirSync('dist/renderer/assets').filter((name) => /\.(?:js|css)$/.test(name)).map((name) => `dist/renderer/assets/${name}`)]
const report = {
  outcome: 'running', mode: 'home-maintenance', startedAt: new Date().toISOString(), payloads: [payload], checks: [], screenshots: [], nativeClosures: [], resourceChecks: [], pageErrors: [], vueWarnings: [], catalogHandlerRestorations: [],
  sourceSha256: Object.fromEntries(sourceFiles.map((file) => [file, digest(file)])), bundleSha256: Object.fromEntries(bundleFiles.map((file) => [file, digest(file)])),
  sourceBasis: {
    baseRevision: '63a8873f8bc0672bb35d4f3e4535a577ace6bd50', invokeRevision: '4875d96531ca6712b288f6e660fcbb34143408c1',
    invokePaths: ['invokeai/app/api/routers/model_manager.py', 'invokeai/app/services/model_records/model_records_sql.py', 'invokeai/frontend/webv2/src/features/models/data/api.ts', 'invokeai/frontend/webv2/src/features/models/data/modelsStore.ts', 'invokeai/frontend/webv2/src/features/models/ui/launchpad/ModelsNotice.tsx', 'invokeai/frontend/webv2/src/workbench/launchpad/home/livePanels.ts'],
    studioFixtureOwners: ['ModelRepository.publishVerifiedInstallation', 'ModelService.getCatalog/catalogFileStatus', 'ProjectSession.create', 'ProjectService.listWorkspaces/removeWorkspace', 'App.refreshHome/beginWorkspaceRemoval'],
    note: 'Fresh Invoke model record/list/store/ModelsNotice callers distinguish authoritative loaded models from unknown/error and main generators from auxiliaries. Existing Studio repository publication and package writer create owned catalog-only fixture bytes; their actual Main catalog/scanner consumers are used, without an alternate installer or scanner.',
  },
  boundary: 'Three actual built app lifetimes; real Main/catalog/scanner/preload/SQLite/.igs consumers. Only the owned Add Workspace OS picker is controlled, plus an exactly restored getCatalog IPC observer with explicitly labelled UI read hold/rejection/stale-error controls and a typed synthetic completion notification. No complete model/project list is fabricated. Empty, auxiliary-only and supported-ready catalog fixtures reach actual Main file hashing; tiny fixture bytes do not prove model loading, generation, dependency capacity or ML compatibility. Sidebar Rescan sees a controlled newly written unique unopened .igs; current browse/selection and existing bytes/revisions/lastOpened stay exact. Direct Remove uses existing explicit Cancel/confirmation and Main unregister, leaving folder/packages intact. No actual model install, inference, runtime/model copy, SHARED dependency, foreign path/process mutation or broad Home/MVP acceptance.',
}
let application, window, database, workspace, nativeChecks = []
const fixtures = [], modelFixtures = []
function persist() { writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }) }
function check(name, evidence = {}) { report.checks.push({ name, ...evidence }); persist(); console.log(`PASS ${name}`) }
async function api(group, method, ...args) {
  const result = await window.evaluate(({ group, method, args }) => window.api[group][method](...args), { group, method, args })
  assert.equal(result.ok, true, JSON.stringify(result)); return result.value
}
const home = () => window.locator('section.home-view')
const navigation = () => window.getByLabel('Workspace navigation', { exact: true })
const missingNotice = () => home().getByText('No generation model installed.', { exact: true })
const modelError = () => home().getByText('Model catalog unavailable', { exact: true })
const workspaceButton = (name) => navigation().locator('.workspace-select').filter({ hasText: name })
const workspaceMenu = (name) => navigation().getByRole('button', { name: `${name} workspace actions`, exact: true })
const row = (project) => window.locator(`.project-row[data-project-id="${project.id}"]`)
async function tabLabels() { return window.getByRole('tablist', { name: 'Open documents', exact: true }).getByRole('tab').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label'))) }
async function records() { return await database.db.selectFrom('project_index').selectAll().orderBy('local_project_key').execute() }
async function workspaceRows() { return await database.db.selectFrom('project_workspace').selectAll().orderBy('id').execute() }
function stableRecords(rows) { return rows.map(({ indexed_at: _indexedAt, ...value }) => value) }
function assertOriginals() {
  for (const fixture of fixtures) { assert.equal(digest(fixture.path), fixture.sha256); assert.equal(digest(fixture.backup), fixture.sha256) }
  for (const fixture of modelFixtures) assert.equal(digest(fixture.path), fixture.sha256)
}
async function bound(label) {
  const value = await boundQualificationProcess(application.process().pid, { deadlineSeconds: 480, execute: (file, args, options) => execute(file, args.map((item) => item === 'MemoryMax=12G' ? 'MemoryMax=2G' : item), options) })
  nativeChecks.push(value); report.resourceChecks.push({ label, ...value }); persist()
}
async function launch(label) {
  const env = { ...process.env, NODE_ENV: 'test', CUDA_VISIBLE_DEVICES: '', XDG_CONFIG_HOME: path.join(payload, 'config'), XDG_DATA_HOME: path.join(payload, 'data') }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'IMAGEGEN_DEV_SERVER_URL', 'IMAGEGEN_TEST_IMAGE_WORKER']) delete env[key]
  nativeChecks = []; application = await electron.launch({ args: ['--ozone-platform=x11', '.'], cwd: process.cwd(), env, timeout: 30_000 }); await bound(`${label}-launch`)
  window = await isolateNativeSmokeWindow(application); window.setDefaultTimeout(10_000)
  window.on('pageerror', (error) => report.pageErrors.push(error.message)); window.on('console', (message) => { if (message.text().includes('[Vue warn]')) report.vueWarnings.push(message.text()) })
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible(); await expect.poll(async () => (await api('projects', 'listWorkspaces')).length).toBeGreaterThan(0)
  database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900)); await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([1440, 900])
}
async function close(label) {
  if (!application) return
  await restorePicker(); await restoreCatalogProbe()
  if (database) { await database.close(); database = null }
  await bound(`${label}-before-close`); await application.close(); report.nativeClosures.push({ label, ...(await confirmQualificationProcessExit(nativeChecks)) }); application = null; window = null; persist()
}
async function screenshot(name) {
  await window.evaluate(() => document.fonts.ready.then(() => undefined)); await window.mouse.move(0, 0)
  const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-${name}.png`); assert.equal(existsSync(file), false)
  await window.screenshot({ path: file, animations: 'disabled' }); const [width, height] = await window.evaluate(() => [innerWidth, innerHeight]); report.screenshots.push({ file, width, height, sha256: digest(file) }); persist()
}
async function refresh() { const button = window.getByRole('button', { name: 'Refresh projects', exact: true }); await expect(button).toBeEnabled(); await button.click(); await expect(button).toBeEnabled() }
async function action(name, label) { await workspaceMenu(name).click(); await window.locator('.n-dropdown-option:visible').filter({ hasText: new RegExp(`^${label}$`) }).click() }
async function restorePicker() {
  if (!application) return
  const value = await application.evaluate(({ dialog }) => {
    const state = globalThis.__igsHomeMaintenancePicker; if (!state) return null
    if (dialog.showOpenDialog !== state.wrapper) throw new Error('Picker owner changed')
    dialog.showOpenDialog = state.original; delete globalThis.__igsHomeMaintenancePicker; return { restored: dialog.showOpenDialog === state.original, calls: state.calls }
  }); if (value) { assert.equal(value.restored, true); report.pickerRestoration = value; persist() }
}
async function seedPackage(leaf, title, whileClosed) {
  if (whileClosed) assert.equal(application, null)
  const file = path.join(folder, leaf); assert.equal(existsSync(file), false)
  const session = await ProjectSession.create(file, title, { placeholdersDir: path.resolve('src/main/projects/placeholders'), scratchDir: path.join(payload, 'writer-scratch') }, { x: 0, y: 0, width: 640, height: 512 }, folder)
  const backup = path.join(backups, leaf); cpSync(file, backup, { errorOnExist: true, force: false })
  const fixture = { path: file, backup, sha256: digest(file), document: session.document, manifest: (await readIgsPackage(file)).manifest, seededWhileMainClosed: whileClosed, neverExistingUnopenedUniquePath: true }; fixtures.push(fixture); report.packageFixtures = fixtures; persist(); return fixture
}
async function seedCatalog(type, modelId) {
  assert.equal(application, null, 'Catalog fixture publication is only allowed after physical native closure.')
  const connection = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
  try {
    const file = path.join(appData, 'models', `catalog-only-${type}.safetensors`), bytes = Buffer.from(`Owned Home catalog ${type}; hash-verified fixture, not inference weights.`)
    mkdirSync(path.dirname(file), { recursive: true }); assert.equal(existsSync(file), false); writeFileSync(file, bytes, { mode: 0o600 }); const sha256 = digest(file)
    const published = await new ModelRepository(connection.db).publishVerifiedInstallation({ primary: {
      file: { managedPath: file, originalFilename: path.basename(file), sha256, sizeBytes: bytes.length, verifiedAt: new Date().toISOString() },
      resource: { creator: 'Owned Home catalog fixture', displayName: `Catalog-only ${type}`, source: { kind: 'civitai', modelId }, sourceMetadata: { fixture: true, inferenceWeights: false }, type },
      version: { baseModelFamily: 'illustrious', format: 'safetensors', name: 'Catalog fixture', predictionType: type === 'checkpoint' ? 'epsilon' : null, source: { expectedSha256: sha256, kind: 'civitai', versionId: modelId + 1, fileId: modelId + 2 }, sourceMetadata: { fixture: true, inferenceWeights: false } },
    } }); const value = { type, path: file, sha256, sizeBytes: bytes.length, ...published, seededWhileMainPhysicallyClosed: true, inferenceWeights: false }; modelFixtures.push(value); report.modelFixtures = modelFixtures; persist(); return value
  } finally { await connection.close() }
}
async function installCatalogProbe() {
  await application.evaluate(({ ipcMain }) => {
    const channel = 'models:get-catalog', original = ipcMain._invokeHandlers.get(channel)
    if (globalThis.__igsHomeMaintenanceCatalog || typeof original !== 'function') throw new Error('Unexpected catalog handler owner')
    const state = { channel, original, calls: [], next: null, held: null }
    state.wrapper = async (event, ...args) => {
      const call = { id: state.calls.length + 1, args, mode: state.next ?? 'real', finished: false }; state.calls.push(call); state.next = null
      if (call.mode === 'hold') { let release; const gate = new Promise((resolve) => { release = resolve }); state.held = { id: call.id, release, result: 'real' }; await gate; call.mode = state.held.result === 'error' ? 'controlled-stale-error' : 'held-real' }
      const result = call.mode === 'error' || call.mode === 'controlled-stale-error' ? { ok: false, error: { code: 'MODEL_CATALOG_CONTROLLED_READ', message: 'Owned diagnostic read refusal' } } : await original(event, ...args)
      call.finished = true; call.ok = result.ok; call.catalog = result.ok ? result.value.map(({ id, resourceType, versions }) => ({ id, resourceType, versions: versions.map(({ id, fileStatus, baseModelFamily }) => ({ id, fileStatus, baseModelFamily })) })) : null; return result
    }; ipcMain._invokeHandlers.set(channel, state.wrapper); globalThis.__igsHomeMaintenanceCatalog = state
  })
}
async function probeState() { return await application.evaluate(() => { const s = globalThis.__igsHomeMaintenanceCatalog; return s ? { calls: s.calls, heldId: s.held?.id ?? null } : null }) }
async function nextRead(mode) { await application.evaluate((_electron, mode) => { if (!['hold', 'error'].includes(mode)) throw new Error('Invalid catalog control mode'); const s = globalThis.__igsHomeMaintenanceCatalog; if (!s || s.next) throw new Error('Catalog probe unavailable'); s.next = mode }, mode) }
async function releaseRead(result = 'real') { await application.evaluate((_electron, result) => { if (!['real', 'error'].includes(result)) throw new Error('Invalid catalog release'); const s = globalThis.__igsHomeMaintenanceCatalog; if (!s?.held) throw new Error('No held catalog read'); s.held.result = result; s.held.release() }, result) }
async function restoreCatalogProbe() {
  if (!application) return
  const state = await probeState(); if (!state) return
  if (state.heldId && state.calls.some(({ id, finished }) => id === state.heldId && !finished)) await releaseRead()
  await expect.poll(async () => (await probeState()).calls.every(({ finished }) => finished)).toBe(true)
  const value = await application.evaluate(({ ipcMain }) => { const s = globalThis.__igsHomeMaintenanceCatalog; if (ipcMain._invokeHandlers.get(s.channel) !== s.wrapper) throw new Error('Catalog handler owner changed'); ipcMain._invokeHandlers.set(s.channel, s.original); delete globalThis.__igsHomeMaintenanceCatalog; return { restored: ipcMain._invokeHandlers.get(s.channel) === s.original, calls: s.calls } })
  assert.equal(value.restored, true); report.catalogHandlerRestorations.push(value); persist()
}
async function typedCompletion() {
  const notification = { id: 'owned-home-refresh-notification', modelName: 'UI refresh control only', versionName: 'No actual installation', bytesDownloaded: 0, totalBytes: 0, error: null, status: 'completed' }
  await application.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('models:install-changed', value), notification)
  report.controlledCompletionNotification = { notification, actualInstallClaimed: false }; persist()
}

persist()
try {
  await launch('empty-catalog')
  assert.deepEqual(await api('models', 'getCatalog'), []); await expect(missingNotice()).toBeVisible(); await expect(modelError()).toHaveCount(0)
  await expect(navigation().getByRole('button', { name: 'New Project', exact: true })).toBeEnabled(); await expect(navigation().getByRole('button', { name: 'Import Project', exact: true })).toBeEnabled()
  await expect(window.getByRole('button', { name: 'Workspace options', exact: true })).toHaveCount(0)
  await navigation().getByRole('button', { name: /^Trash(?:\s*\d+)?$/ }).click(); await expect(window.getByRole('button', { name: 'Workspace options', exact: true })).toHaveCount(0)
  await navigation().getByRole('button', { name: 'Projects', exact: true }).click(); await expect(missingNotice()).toBeVisible(); await screenshot('empty-model-catalog')
  check('Initial actual empty Main catalog shows calm model guidance without blocking project organization; aggregate Projects and Trash have no concrete-workspace options')

  await application.evaluate(({ dialog }, selectedPath) => { const original = dialog.showOpenDialog, state = { original, calls: [] }; state.wrapper = async (owner, options) => { if (options.title !== 'Add Workspace') return original.call(dialog, owner, options); if (JSON.stringify(options.properties) !== JSON.stringify(['openDirectory', 'createDirectory'])) throw new Error('Wrong Add Workspace picker contract'); state.calls.push({ title: options.title, properties: options.properties, selectedPath }); return { canceled: false, filePaths: [selectedPath] } }; dialog.showOpenDialog = state.wrapper; globalThis.__igsHomeMaintenancePicker = state }, folder)
  await navigation().getByRole('button', { name: 'Add Workspace', exact: true }).click(); const add = window.getByRole('dialog', { name: 'Add Workspace', exact: true })
  await add.getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Maintenance Workspace'); await add.getByRole('button', { name: 'Choose Folder and Add', exact: true }).click(); await expect(add).toHaveCount(0); await restorePicker()
  workspace = (await api('projects', 'listWorkspaces')).find(({ isDefault }) => !isDefault); assert.ok(workspace); assert.equal(workspace.directoryPath, folder)
  await expect(window.getByRole('heading', { name: workspace.displayName, exact: true })).toBeVisible(); await expect(window.getByRole('button', { name: 'Workspace options', exact: true })).toBeVisible()
  await workspaceMenu('Uncategorized').click(); await expect(window.locator('.n-dropdown-option:visible').filter({ hasText: /^Remove Workspace$/ })).toHaveCount(0); await expect(window.locator('.n-dropdown-option:visible').filter({ hasText: /^Rescan$/ })).toBeVisible(); await window.keyboard.press('Escape')
  assert.deepEqual(await tabLabels(), ['Home']); await close('empty-catalog-normal'); assert.equal(report.pickerRestoration.calls.length, 1)
  check('Real owned Add Workspace registers the folder; only concrete scope exposes options, default sidebar omits Remove and exact picker callback restores before normal physical close', { workspace, picker: report.pickerRestoration })

  const original = await seedPackage('retained-original.igs', 'Retained Project', true), auxiliary = await seedCatalog('lora', 91_101)
  await launch('auxiliary-maintenance'); await expect(missingNotice()).toBeVisible(); const auxCatalog = await api('models', 'getCatalog'); assert.equal(auxCatalog.length, 1); assert.equal(auxCatalog[0].id, auxiliary.resourceId); assert.equal(auxCatalog[0].resourceType, 'lora'); assert.equal(auxCatalog[0].versions[0].fileStatus, 'ready')
  await workspaceButton(workspace.displayName).click(); const [project] = await api('projects', 'list', workspace.id); assert.ok(project); await expect(row(project)).toBeVisible(); assert.equal(project.title, original.document.title)
  const initialRecords = await records(); assert.equal(initialRecords.length, 1); assert.equal(initialRecords[0].document_id, original.document.documentId); assert.equal(initialRecords[0].document_revision, original.document.documentRevision); assert.equal(initialRecords[0].last_opened_at, null)
  await row(project).getByRole('button', { name: `Select ${project.title}`, exact: true }).click(); assertOriginals(); report.auxiliaryConsumer = { catalog: auxCatalog, initialRecords }
  check('Actual auxiliary-only Main catalog remains missing a generation model; the closed package is indexed without opening or rewriting it', report.auxiliaryConsumer)

  await window.getByRole('button', { name: 'Workspace options', exact: true }).click(); const settings = window.getByRole('dialog', { name: 'Workspace Settings', exact: true }); await expect(settings.getByRole('textbox', { name: 'Workspace name', exact: true })).toHaveValue(workspace.displayName); await settings.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(settings).toHaveCount(0)
  await expect(workspaceButton(workspace.displayName).locator('.workspace-count')).toHaveText('1'); await expect(window.getByRole('button', { name: 'Refresh projects', exact: true })).not.toHaveAttribute('aria-busy', 'true')
  const added = await seedPackage('rescan-added.igs', 'Rescan Project', false); await action(workspace.displayName, 'Rescan'); await expect(row(project).getByRole('button', { name: `Select ${project.title}`, exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(window.getByRole('heading', { name: workspace.displayName, exact: true })).toBeVisible()
  // Observe the real UI consumer before a diagnostic list call can itself scan the folder.
  await expect(workspaceButton(workspace.displayName).locator('.workspace-count')).toHaveText('2'); await expect(home().getByRole('button', { name: `Select ${added.document.title}`, exact: true })).toBeVisible()
  const rescanned = await api('projects', 'list', workspace.id), afterRescan = await records(); assert.equal(rescanned.length, 2); assert.ok(rescanned.some(({ title }) => title === added.document.title)); await expect(workspaceButton(workspace.displayName).locator('.workspace-count')).toHaveText('2')
  assert.deepEqual(stableRecords(afterRescan.filter(({ local_project_key }) => local_project_key === project.id)), stableRecords(initialRecords)); for (const value of afterRescan) assert.equal(value.last_opened_at, null)
  await expect(window.getByLabel('Project inspector', { exact: true }).getByRole('heading', { name: project.title, exact: true })).toBeVisible(); assertOriginals(); report.rescanConsumer = { before: initialRecords, after: afterRescan, addedPackage: added }
  check('Concrete header opens existing Settings; sidebar Rescan sees a real unique external package and count while preserving scope, selected Inspector owner, existing package/revision/lastOpened', report.rescanConsumer)

  await installCatalogProbe(); const beforeManager = (await probeState()).calls.length
  await home().locator('.n-alert').filter({ hasText: 'No generation model installed.' }).getByRole('button', { name: 'Manage Models', exact: true }).click(); const manager = window.getByRole('dialog', { name: 'Model Manager', exact: true }); await expect(manager).toBeVisible(); await expect(manager.getByText('Catalog-only lora', { exact: true }).first()).toBeVisible()
  const beforeClose = (await probeState()).calls.length; assert.ok(beforeClose > beforeManager); await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click(); await expect(manager).toHaveCount(0); await expect.poll(async () => (await probeState()).calls.length).toBeGreaterThan(beforeClose); await expect(missingNotice()).toBeVisible(); assert.deepEqual(await tabLabels(), ['Home'])
  report.managerCloseRefresh = { beforeManager, beforeClose, after: await probeState(), noActiveProject: true, actualCatalogRead: true }
  check('Manage Models opens the existing manager and its close refreshes real Home catalog even with no active Project', report.managerCloseRefresh)

  await nextRead('hold'); await refresh(); await expect.poll(async () => (await probeState()).heldId).not.toBeNull(); await expect(missingNotice()).toHaveCount(0); await expect(modelError()).toHaveCount(0)
  const heldId = (await probeState()).heldId; await typedCompletion(); await expect.poll(async () => (await probeState()).calls.some(({ id, finished, mode, ok }) => id > heldId && finished && mode === 'real' && ok)).toBe(true); await expect(missingNotice()).toBeVisible()
  await releaseRead('error'); await expect.poll(async () => (await probeState()).calls.find(({ id }) => id === heldId)?.finished).toBe(true); await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await expect(missingNotice()).toBeVisible(); await expect(modelError()).toHaveCount(0)
  report.controlledUnknownAndStaleError = { heldId, state: await probeState(), syntheticNotificationUIRefreshOnly: true, newerReplyFromActualMain: true }
  check('Controlled pending read shows unknown rather than missing; typed completion notification triggers fresh actual Main read and a released stale rejection cannot replace that newer catalog', report.controlledUnknownAndStaleError)

  await nextRead('error'); await refresh(); await expect(modelError()).toBeVisible(); await expect(missingNotice()).toHaveCount(0); await expect(home().locator('.n-alert').filter({ hasText: 'Model catalog unavailable' })).toContainText('Refresh Home or open Manage Models to check installed models.'); await screenshot('catalog-read-error-actions')
  await refresh(); await expect(missingNotice()).toBeVisible(); await expect(modelError()).toHaveCount(0); await restoreCatalogProbe(); assertOriginals(); assert.deepEqual(stableRecords(await records()), stableRecords(afterRescan)); assert.deepEqual(await tabLabels(), ['Home'])
  check('Controlled current catalog rejection has separate actionable error; manual Refresh restores actual auxiliary-only catalog and exact Main handler without package or selection effects', { restoration: report.catalogHandlerRestorations.at(-1), controlledReadErrorOnly: true })

  const beforeCancel = { workspaces: await workspaceRows(), projects: await records() }
  await action(workspace.displayName, 'Remove Workspace'); const remove = window.getByRole('dialog', { name: 'Remove Workspace', exact: true }); await expect(remove).toBeVisible(); await expect(remove.getByText("from Home? Its folder and .igs files will stay on disk. Projects from this workspace will no longer appear in Home.", { exact: false })).toBeVisible(); await remove.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(remove).toHaveCount(0)
  assert.deepEqual(await workspaceRows(), beforeCancel.workspaces); assert.deepEqual(await records(), beforeCancel.projects); assertOriginals(); report.removalCancel = beforeCancel
  check('Sidebar Remove opens the existing explicit unregister confirmation directly; Cancel preserves exact workspace/project rows and both files', beforeCancel)

  await action(workspace.displayName, 'Remove Workspace'); await expect(remove).toBeVisible(); await screenshot('direct-workspace-removal-confirmation'); await remove.getByRole('button', { name: 'Remove Workspace', exact: true }).click(); await expect(remove).toHaveCount(0); await expect(window.getByRole('heading', { name: 'Uncategorized', exact: true })).toBeVisible(); await expect(workspaceButton(workspace.displayName)).toHaveCount(0)
  const finalWorkspaces = await workspaceRows(), finalProjects = await records(); assert.equal(finalWorkspaces.length, 1); assert.equal(finalProjects.length, 0); assert.equal(lstatSync(folder).isDirectory(), true); assertOriginals(); assert.deepEqual(await tabLabels(), ['Home'])
  report.removalConsumer = { removedWorkspace: workspace, before: beforeCancel, finalWorkspaces, finalProjects, folderStillPresent: true, packageSha256: fixtures.map(({ path, sha256 }) => ({ path, sha256 })), noImplicitOpenOrSave: true }; await close('auxiliary-maintenance-normal')
  check('Confirmed existing Main unregister removes only catalog/index owners, switches to Uncategorized and retains the workspace folder and original package bytes through normal physical close', report.removalConsumer)

  const checkpoint = await seedCatalog('checkpoint', 91_201); await launch('ready-catalog'); const finalCatalog = await api('models', 'getCatalog'); assert.equal(finalCatalog.length, 2); const ready = finalCatalog.find(({ id }) => id === checkpoint.resourceId); assert.ok(ready); assert.equal(ready.resourceType, 'checkpoint'); assert.equal(ready.versions[0].baseModelFamily, 'illustrious'); assert.equal(ready.versions[0].fileStatus, 'ready'); assert.equal(ready.versions[0].sha256, checkpoint.sha256)
  await refresh(); await expect(missingNotice()).toHaveCount(0); await expect(modelError()).toHaveCount(0); assert.deepEqual(await tabLabels(), ['Home']); assertOriginals(); assert.equal((await workspaceRows()).length, 1); assert.equal((await records()).length, 0)
  report.readyCatalogConsumer = { catalog: finalCatalog, checkpoint, onlyCatalogAndFileReadyClaimed: true, actualInferenceClaimed: false }; check('Fresh actual Main catalog with a supported ready checkpoint suppresses missing-model guidance; auxiliary-only and unknown/error neighbors stay distinct', report.readyCatalogConsumer)

  assert.deepEqual(Object.fromEntries(sourceFiles.map((file) => [file, digest(file)])), report.sourceSha256); assert.deepEqual(Object.fromEntries(bundleFiles.map((file) => [file, digest(file)])), report.bundleSha256); assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors)); assert.equal(report.vueWarnings.length, 0, JSON.stringify(report.vueWarnings)); await close('ready-catalog-normal')
  assert.equal(report.nativeClosures.length, 3); assert.equal(report.screenshots.length, 3); assert.equal(report.catalogHandlerRestorations.length, 1); assertOriginals()
  report.finalState = { allPackageInputsAndCatalogFixtureBytesExact: true, noProjectOpenedOrSaved: true, normalPhysicalLifetimes: 3, pickerAndCatalogHandlersRestored: true, sourceAndBundlesUnchanged: true, catalogRows: report.readyCatalogConsumer.catalog, packages: fixtures, modelFixtures }
  check('Three app lifetimes exit normally with exact callback restoration, frozen source/bundles and retained original package/catalog fixture bytes', report.finalState); assert.equal(report.checks.length, 11); report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'; report.error = error.stack ?? String(error)
  if (window) try { const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-failure.png`); if (!existsSync(file)) await window.screenshot({ path: file, animations: 'disabled' }); report.failureScreenshot = { file, sha256: digest(file) } } catch (captureError) { report.failureScreenshotError = String(captureError) }
  throw error
} finally {
  try {
    await restorePicker(); await restoreCatalogProbe()
    if (window) { await window.keyboard.press('Escape'); const manager = window.getByRole('dialog', { name: 'Model Manager', exact: true }); if (await manager.isVisible()) await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click(); for (const name of ['Add Workspace', 'Workspace Settings', 'Remove Workspace']) { const modal = window.getByRole('dialog', { name, exact: true }); if (await modal.isVisible()) await modal.getByRole('button', { name: 'Cancel', exact: true }).click() } }
    await close('finally-normal')
  } catch (closeError) { report.outcome = 'failed'; report.closeError = closeError.stack ?? String(closeError); process.exitCode = 1 }
  report.finishedAt = new Date().toISOString(); persist()
}
