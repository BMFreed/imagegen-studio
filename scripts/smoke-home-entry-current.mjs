/** Built Home Create/Import CURRENT presentation over base625eeec9. Main replies and writers are real. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron, expect } from '@playwright/test'
import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import { ProjectShadowStore } from '../src/main/projects/project-shadow.ts'
import { parseProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import { boundQualificationProcess, confirmQualificationProcessExit } from './qualification-resource-limits.mjs'

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
const payload = mkdtempSync(path.join(evidenceRoot, 'native-home-entry-current-'))
const appData = path.join(payload, 'data/imagegen-studio')
const folder = path.join(payload, 'selected-workspace')
const external = path.join(payload, 'external')
const backups = path.join(payload, 'original-inputs')
for (const directory of [folder, external, backups]) mkdirSync(directory)
const execute = promisify(execFile)
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const sourceFiles = [
  'scripts/smoke-home-entry-current.mjs', 'scripts/native-smoke-window.mjs', 'scripts/qualification-resource-limits.mjs',
  'src/main/index.ts', 'src/preload/index.ts', 'src/shared/api.ts', 'src/main/db/database.ts',
  'src/main/projects/project-service.ts', 'src/main/projects/project-generation-recovery.ts',
  'src/main/projects/project-generation-operation-gate.ts', 'src/main/projects/project-index.ts',
  'src/main/projects/project-identity.ts', 'src/main/projects/project-location-registry.ts',
  'src/main/projects/project-path-lock.ts', 'src/main/projects/project-shadow.ts',
  'src/main/projects/project-autosave.ts', 'src/main/projects/project-session.ts',
  'src/main/projects/igs-package.ts',
  'src/main/projects/project-placeholders.ts', 'src/shared/projects/project-schema.ts',
  'src/renderer/App.vue', 'src/renderer/components/HomeView.vue', 'src/renderer/components/NewProjectModal.vue',
  'src/renderer/components/new-project-preset-draft.ts', 'src/renderer/components/AppChrome.vue',
  'src/renderer/styles/global.css',
]
const bundleFiles = ['dist/main/main.cjs', 'dist/preload/preload.cjs', 'dist/renderer/index.html',
  ...readdirSync('dist/renderer/assets').filter((name) => /\.(?:js|css)$/.test(name)).map((name) => `dist/renderer/assets/${name}`)]
const report = {
  outcome: 'running', mode: 'home-entry-current', startedAt: new Date().toISOString(), payloads: [payload],
  checks: [], screenshots: [], nativeClosures: [], resourceChecks: [], pageErrors: [], vueWarnings: [], pickerRestorations: [],
  sourceSha256: Object.fromEntries(sourceFiles.map((file) => [file, digest(file)])),
  bundleSha256: Object.fromEntries(bundleFiles.map((file) => [file, digest(file)])),
  sourceBasis: { baseRevision: '625eeec93bc4c321e03bd39a0cc4265d9501d8a2', paths: ['docs/features/home-screen.md', 'docs/prototype-app/src/App.vue', 'docs/prototype-app/src/prototypes/home/HomePrototype.vue'], note: 'UI presentation only. Existing Main/import/shadow mechanisms and replies are unchanged; no fresh Invoke non-UI review claimed.' },
  boundary: 'Actual built renderer/preload/Main/SQLite and existing .igs/Create/Import/recovery owners. Only OS Add Workspace and Import picker responses are controlled, with exact callback identity restoration; no project API reply is mocked. Direct Main Create/Close prepare neutral saved fixtures, external copies and real dirty shadows while physically closed. The pre-seeded absent external-import target is a controlled recovery fixture, not crash qualification. Actual UI Create/Import/Copy/Move/Recover/Discard are the consumers. Initial source packages and pre-decision shadows are retained independently. Late modal-window navigation is source-only, not fabricated by bypassing modal hit targets. No implicit Save, ML/runtime/model copy, SHARED dependency, foreign paths or processes.',
}
let application, window, database, workspace, fixtures, files
let nativeChecks = []
const opened = new Map()
const seedHashes = {}
const createdHashes = {}
const externalFiles = {}
let shadowInputs = []
function persist() { writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }) }
function check(name, evidence = {}) { report.checks.push({ name, ...evidence }); persist(); console.log(`PASS ${name}`) }
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
  nativeChecks.push(result); report.resourceChecks.push({ label, ...result }); persist()
}
async function launch(label) {
  const env = { ...process.env, NODE_ENV: 'test', CUDA_VISIBLE_DEVICES: '', XDG_CONFIG_HOME: path.join(payload, 'config'), XDG_DATA_HOME: path.join(payload, 'data') }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'IMAGEGEN_DEV_SERVER_URL', 'IMAGEGEN_TEST_IMAGE_WORKER']) delete env[key]
  nativeChecks = []
  application = await electron.launch({ args: ['--ozone-platform=x11', '.'], cwd: process.cwd(), env, timeout: 30_000 })
  await bound(`${label}-launch`)
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(10_000)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  window.on('console', (message) => { if (message.text().includes('[Vue warn]')) report.vueWarnings.push(message.text()) })
  await expect(tab('Home')).toBeVisible()
  await expect.poll(async () => (await api('listWorkspaces')).length).toBeGreaterThan(0)
  database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
  await viewport(1440, 900)
  await installPicker()
}
async function close(label) {
  if (!application) return
  await restorePicker()
  if (database) { await database.close(); database = null }
  await bound(`${label}-before-close`)
  await application.close()
  report.nativeClosures.push({ label, ...(await confirmQualificationProcessExit(nativeChecks)) })
  application = null; window = null; persist()
}
async function installPicker() {
  await application.evaluate(({ dialog }) => {
    if (globalThis.__igsHomeEntryPicker) throw new Error('Unexpected picker owner')
    const state = { original: dialog.showOpenDialog, queued: [], calls: [] }
    state.wrapper = async (owner, options) => {
      if (!['Add Workspace', 'Import Project'].includes(options.title)) return state.original.call(dialog, owner, options)
      const selected = state.queued.shift()
      if (!selected || selected.title !== options.title) throw new Error('Unexpected controlled picker call')
      const expected = options.title === 'Add Workspace' ? ['openDirectory', 'createDirectory'] : ['openFile']
      if (JSON.stringify(options.properties) !== JSON.stringify(expected)) throw new Error('Wrong picker properties')
      if (options.title === 'Import Project' && JSON.stringify(options.filters) !== JSON.stringify([{ extensions: ['igs'], name: 'ImageGen Studio Projects' }])) throw new Error('Wrong Import filter')
      state.calls.push({ title: options.title, properties: options.properties, filters: options.filters, selectedPath: selected.path })
      return selected.path === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [selected.path] }
    }
    dialog.showOpenDialog = state.wrapper
    globalThis.__igsHomeEntryPicker = state
  })
}
async function queuePicker(title, selectedPath) {
  await application.evaluate((_electron, selected) => {
    const state = globalThis.__igsHomeEntryPicker
    if (!state || state.queued.length) throw new Error('Picker queue ownership mismatch')
    state.queued.push(selected)
  }, { title, path: selectedPath })
}
async function restorePicker() {
  if (!application) return
  const restored = await application.evaluate(({ dialog }) => {
    const state = globalThis.__igsHomeEntryPicker
    if (!state) return null
    if (dialog.showOpenDialog !== state.wrapper) throw new Error('Picker identity changed')
    if (state.queued.length) throw new Error('Unconsumed picker selection')
    dialog.showOpenDialog = state.original
    const result = { restored: dialog.showOpenDialog === state.original, calls: state.calls }
    delete globalThis.__igsHomeEntryPicker
    return result
  })
  if (restored) { assert.equal(restored.restored, true); report.pickerRestorations.push(restored); persist() }
}
const home = () => window.getByLabel('Workspace navigation', { exact: true })
const tab = (title) => window.getByRole('tab', { name: title, exact: true })
const newModal = () => window.getByRole('dialog', { name: 'New Project', exact: true })
const importModal = () => window.getByRole('dialog', { name: 'Import Project', exact: true })
const recovery = () => window.getByRole('dialog', { name: 'Recovery available', exact: true })
async function tabLabels() { return window.getByRole('tablist', { name: 'Open documents', exact: true }).getByRole('tab').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label'))) }
async function viewport(width, height) {
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width, height })
  await expect.poll(() => window.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([width, height])
}
async function screenshot(name) {
  await window.evaluate(() => document.fonts.ready.then(() => undefined))
  for (const modal of await window.getByRole('dialog').all()) if (await modal.isVisible()) {
    await expect.poll(() => modal.evaluate((node) => ({ opacity: getComputedStyle(node).opacity, transform: getComputedStyle(node).transform }))).toEqual({ opacity: '1', transform: 'none' })
  }
  const [width, height] = await window.evaluate(() => [window.innerWidth, window.innerHeight])
  const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-${name}.png`)
  assert.equal(existsSync(file), false)
  await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push({ file, width, height, sha256: digest(file) }); persist()
}
async function browse() {
  if (await tab('Home').count() === 0) await window.getByRole('button', { name: 'Open Home', exact: true }).click()
  await tab('Home').click()
  await expect(tab('Home')).toHaveAttribute('aria-selected', 'true')
  await home().locator('.workspace-select').filter({ hasText: workspace.displayName }).click()
  await expect(window.getByRole('heading', { name: workspace.displayName, exact: true })).toBeVisible()
  await expect(home().getByRole('button', { name: 'Import Project', exact: true })).toBeEnabled()
  await expect(window.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled()
}
async function expectCurrent(project, previous, existing = false) {
  await expect(tab(project.title)).toHaveCount(1)
  // Retain ownership before an assertion can fail, so finally can explicitly discard dirty tabs.
  opened.set(project.id, project)
  await expect(tab(project.title)).toHaveAttribute('aria-selected', 'true')
  const expected = existing ? previous : [project.title, ...previous.filter((title) => title !== 'Home' && title !== project.title)]
  await expect.poll(tabLabels).toEqual(expected)
  await expect(window.getByRole('button', { name: `Close ${project.title}`, exact: true })).toBeEnabled()
  if (existing) await expect(tab('Home')).toHaveCount(1)
  else await expect(window.locator('.chrome-context')).toHaveCount(0)
}
async function importPick(selectedPath) {
  await queuePicker('Import Project', selectedPath)
  await home().getByRole('button', { name: 'Import Project', exact: true }).click()
}
async function closeProject(project) {
  if (await tab(project.title).count() === 0) return
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  const decision = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect.poll(async () => await tab(project.title).count() === 0 ? 'closed' : await decision.isVisible() ? 'decision' : 'pending').not.toBe('pending')
  if (await decision.isVisible()) {
    await decision.getByRole('button', { name: 'Discard Changes', exact: true }).click()
    report.explicitDirtyCloses ??= []; report.explicitDirtyCloses.push({ projectId: project.id, title: project.title, action: 'Discard Changes' })
    await expect(decision).toHaveCount(0)
  }
  await expect(tab(project.title)).toHaveCount(0)
  const remaining = window.locator('.document-tab:not([aria-label="Home"]) button.tab-close').first()
  if (await remaining.count()) await expect(remaining).toBeEnabled()
  else if (await home().isVisible()) await expect(window.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled()
}
async function closeOwnProjects() {
  if (!window) return
  if (await newModal().isVisible()) await newModal().getByRole('button', { name: 'Cancel', exact: true }).click()
  if (await importModal().isVisible()) { await importModal().getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(importModal()).toHaveCount(0) }
  if (await recovery().isVisible()) { await recovery().getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(recovery()).toHaveCount(0) }
  for (const project of opened.values()) await closeProject(project)
}
async function rows() { return await database.db.selectFrom('project_index').selectAll().orderBy('local_project_key').execute() }
async function record(id) { return await database.db.selectFrom('project_index').selectAll().where('local_project_key', '=', id).executeTakeFirstOrThrow() }
// A real catalog scan/indexSaved updates its derived observation time, including before Cancel.
function catalogState(records) { return records.map(({ indexed_at: _indexedAt, ...value }) => value) }
function tree(directory) {
  if (!existsSync(directory)) return []
  const entries = []
  function visit(base, relative) {
    assert.equal(lstatSync(base).isSymbolicLink(), false)
    for (const name of readdirSync(base).sort()) {
      const file = path.join(base, name), member = path.posix.join(relative, name), stat = lstatSync(file)
      assert.equal(stat.isSymbolicLink(), false)
      if (stat.isDirectory()) visit(file, member)
      else { assert.equal(stat.isFile(), true); entries.push({ path: member, bytes: stat.size, sha256: digest(file) }) }
    }
  }
  visit(directory, ''); return entries
}
function assertSaved() {
  for (const [id, sha256] of Object.entries(seedHashes)) assert.equal(digest(files[id]), sha256, `Seed ${id}: no implicit Save.`)
  for (const [file, sha256] of Object.entries(createdHashes)) assert.equal(digest(file), sha256, `${file}: committed result remains exact.`)
}
async function importedAt(file, expectedHash) {
  const indexed = (await rows()).find((candidate) => candidate.canonical_path === file)
  assert.ok(indexed, 'Actual Import must index its committed destination.')
  assert.equal(indexed.workspace_id, workspace.id)
  assert.equal(digest(file), expectedHash)
  const saved = await readIgsPackage(file)
  assert.equal(indexed.document_id, saved.project.documentId)
  assert.equal(indexed.document_revision, saved.project.documentRevision)
  createdHashes[file] = expectedHash
  return { id: indexed.local_project_key, title: saved.project.title, record: indexed, savedDocument: saved.project }
}
async function recoverAndInspect(project, expectedX) {
  await recovery().getByRole('button', { name: 'Recover', exact: true }).click()
  await expect(recovery()).toHaveCount(0)
  await expect(tab(project.title)).toHaveCount(1)
  opened.set(project.id, project)
  const current = await api('open', project.id) // Already-open owner diagnostic, not the recovery command.
  assert.equal(current.kind, 'opened'); assert.equal(current.tab.dirty, true); assert.equal(current.tab.primaryBbox.x, expectedX)
  const input = shadowInputs.find(({ projectId }) => projectId === project.id)
  assert.ok(input)
  assert.notEqual(current.tab.documentRevision, input.authoredRevision)
  assert.notEqual(current.tab.documentRevision, input.saved.project.documentRevision)
  const shadow = new ProjectShadowStore(path.join(appData, 'autosave'))
  const actual = await shadow.inspect({ projectPath: input.projectPath, savedPackage: input.saved })
  assert.equal(actual.status, 'recoverable')
  assert.deepEqual(actual.document, { ...input.saved.project, documentRevision: current.tab.documentRevision, primaryBbox: { ...input.saved.project.primaryBbox, x: expectedX } })
  return { tab: current.tab, shadowDocument: actual.document }
}

persist()
try {
  await launch('fixtures')
  await queuePicker('Add Workspace', folder)
  await home().getByRole('button', { name: 'Add Workspace', exact: true }).click()
  const add = window.getByRole('dialog', { name: 'Add Workspace', exact: true })
  await add.getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Entry Workspace')
  await add.getByRole('button', { name: 'Choose Folder and Add', exact: true }).click()
  await expect(add).toHaveCount(0)
  workspace = (await api('listWorkspaces')).find(({ isDefault }) => !isDefault)
  assert.ok(workspace); assert.equal(workspace.directoryPath, folder)
  for (const title of ['Anchor Project', 'Managed Project', 'Recover Project', 'Discard Project', 'Copy Project', 'Move Project', 'Cancel Project', 'External Recovery']) {
    const value = await api('create', { title, width: 640, height: 512, workspaceId: workspace.id })
    await api('close', value.id, false)
  }
  fixtures = await api('list', workspace.id)
  assert.equal(fixtures.length, 8)
  const fixtureRecords = await rows()
  files = Object.fromEntries(fixtureRecords.map((value) => [value.local_project_key, value.canonical_path]))
  await close('fixtures-normal')
  for (const project of fixtures) {
    seedHashes[project.id] = digest(files[project.id])
    cpSync(files[project.id], path.join(backups, `${project.id}.igs`), { errorOnExist: true, force: false })
  }
  const find = (title) => fixtures.find((project) => project.title === title)
  const anchor = find('Anchor Project'), managed = find('Managed Project'), recover = find('Recover Project'), discard = find('Discard Project')
  for (const title of ['Copy Project', 'Move Project', 'Cancel Project', 'External Recovery']) {
    const seed = find(title), file = path.join(external, `${title}.igs`)
    cpSync(files[seed.id], file, { errorOnExist: true, force: false })
    cpSync(file, path.join(backups, `external-${title}.igs`), { errorOnExist: true, force: false })
    externalFiles[title] = { file, sha256: digest(file), seedId: seed.id }
  }
  const malformed = path.join(external, 'Invalid.igs')
  writeFileSync(malformed, 'Controlled invalid project package.\n', { flag: 'wx' })
  const shadow = new ProjectShadowStore(path.join(appData, 'autosave'))
  async function prepareShadow(projectId, projectPath, x) {
    const saved = await readIgsPackage(projectPath)
    const document = parseProjectDocumentV1({ ...saved.project, documentRevision: randomUUID(), primaryBbox: { ...saved.project.primaryBbox, x } })
    await shadow.write({ projectPath, savedDocument: saved.project, document })
    assert.equal((await shadow.inspect({ projectPath, savedPackage: saved })).status, 'recoverable')
    const directory = path.join(appData, 'autosave', projectId), backup = path.join(backups, `${projectId}-shadow`)
    cpSync(directory, backup, { recursive: true, errorOnExist: true, force: false })
    const before = tree(directory); assert.deepEqual(tree(backup), before)
    shadowInputs.push({ projectId, projectPath, saved, x, authoredRevision: document.documentRevision, directory, backup, before })
  }
  await prepareShadow(recover.id, files[recover.id], 8)
  await prepareShadow(discard.id, files[discard.id], 8)
  const externalRecovery = externalFiles['External Recovery']
  const target = path.join(folder, 'External Recovery.igs')
  assert.equal(existsSync(target), false)
  cpSync(externalRecovery.file, target, { errorOnExist: true, force: false })
  assert.equal(digest(target), externalRecovery.sha256)
  const externalRecoveryId = localProjectRecoveryKey(target)
  await prepareShadow(externalRecoveryId, target, 16)
  // Only the temporary extra target copy is removed, while physically closed. Both originals remain retained.
  assert.equal(digest(target), externalRecovery.sha256)
  unlinkSync(target)
  assert.equal(existsSync(target), false)
  assert.equal(digest(externalRecovery.file), externalRecovery.sha256)
  report.fixtures = { workspace, projects: fixtures, records: fixtureRecords, files, seedHashes, externalFiles, malformed, originalDirectory: backups,
    externalRecoveryTargetPreparation: { target, projectId: externalRecoveryId, copiedHash: externalRecovery.sha256, originalTargetAbsent: true, temporaryCopyRemovedWhilePhysicallyClosed: true, externalSourceRetained: true } }
  report.shadowInputs = shadowInputs.map(({ saved, ...input }) => ({ ...input, savedDocument: saved.project }))
  check('Eight actual Main-created closed fixtures, external original copies and three genuine backed-up dirty shadows prepare real owners without API result mocks', report.fixtures)

  await launch('entry-current')
  await browse()
  const anchorRow = window.locator(`.project-row[data-project-id="${anchor.id}"]`)
  await anchorRow.getByRole('button', { name: `Select ${anchor.title}`, exact: true }).click()
  await window.getByLabel('Project inspector', { exact: true }).getByRole('button', { name: 'Open in New Tab', exact: true }).click()
  await expect(tab(anchor.title)).toHaveAttribute('aria-selected', 'true')
  await expect(window.getByRole('button', { name: `Close ${anchor.title}`, exact: true })).toBeEnabled()
  opened.set(anchor.id, anchor)
  await browse()
  const beforeCreate = await rows(), createOrder = await tabLabels()
  await home().getByRole('button', { name: 'New Project', exact: true }).click()
  await newModal().getByRole('textbox', { name: 'Project name', exact: true }).fill('Canceled Project')
  await newModal().getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(newModal()).toHaveCount(0)
  assert.deepEqual(catalogState(await rows()), catalogState(beforeCreate)); await expect.poll(tabLabels).toEqual(createOrder)
  await home().getByRole('button', { name: 'New Project', exact: true }).click()
  await newModal().getByRole('textbox', { name: 'Project name', exact: true }).fill('Created Project')
  await expect(newModal().getByLabel('Project workspace', { exact: true })).toContainText(workspace.displayName)
  await expect(newModal().locator('input[aria-label="Project width"]')).toHaveValue('1024')
  await expect(newModal().locator('input[aria-label="Project height"]')).toHaveValue('1024')
  await screenshot('create-current-wide')
  await newModal().getByRole('button', { name: 'Create Project', exact: true }).click()
  await expect(newModal()).toHaveCount(0)
  const created = (await api('list', workspace.id)).find(({ title }) => title === 'Created Project')
  assert.ok(created)
  await expectCurrent(created, createOrder)
  const createdRecord = await record(created.id), createdFile = createdRecord.canonical_path
  const createdPackage = await readIgsPackage(createdFile)
  assert.equal(createdRecord.workspace_id, workspace.id); assert.equal(path.dirname(createdFile), folder)
  assert.deepEqual(createdPackage.project.primaryBbox, { x: 0, y: 0, width: 1024, height: 1024 })
  createdHashes[createdFile] = digest(createdFile)
  assertSaved()
  check('Actual New Project Cancel is read-only and subsequent UI Create writes selected workspace default bbox1024x1024 then replaces only Home ahead of existing Anchor', { project: created, record: createdRecord, savedDocument: createdPackage.project, sha256: createdHashes[createdFile], order: await tabLabels() })

  await browse()
  const readonlyRows = await rows(), readonlyOrder = await tabLabels()
  await importPick(null)
  await expect(home().getByRole('button', { name: 'Import Project', exact: true })).toBeEnabled()
  await expect.poll(tabLabels).toEqual(readonlyOrder)
  assert.deepEqual(catalogState(await rows()), catalogState(readonlyRows))
  await importPick(malformed)
  await expect(window.locator('.browser-error')).toBeVisible()
  await expect(home().getByRole('button', { name: 'Import Project', exact: true })).toBeEnabled()
  await expect.poll(tabLabels).toEqual(readonlyOrder)
  assert.deepEqual(catalogState(await rows()), catalogState(readonlyRows)); assertSaved()
  check('Actual OS picker Cancel and genuinely malformed selected package leave Home tabs catalog identities and saved bytes unchanged', { rows: readonlyRows, error: await window.locator('.browser-error').textContent(), malformedSha256: digest(malformed) })

  const managedOrder = await tabLabels()
  await importPick(files[managed.id])
  await expect(importModal()).toHaveCount(0)
  await expectCurrent(managed, managedOrder); assertSaved()
  check('Actual managed closed-file Import uses no destination dialog and replaces Home ahead of all existing Projects without another file or implicit Save', { project: managed, record: await record(managed.id), order: await tabLabels() })

  await browse()
  const recoveryOrder = await tabLabels(), beforeCancel = await rows()
  await importPick(files[recover.id])
  await expect(recovery()).toBeVisible(); await expect.poll(tabLabels).toEqual(recoveryOrder)
  await recovery().getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(recovery()).toHaveCount(0); await expect.poll(tabLabels).toEqual(recoveryOrder)
  assert.deepEqual(catalogState(await rows()), catalogState(beforeCancel))
  for (const input of shadowInputs) assert.deepEqual(tree(input.directory), input.before)
  await importPick(files[managed.id])
  await expectCurrent(managed, recoveryOrder, true)
  await browse()
  const recoverOrder = await tabLabels()
  await importPick(files[recover.id]); await expect(recovery()).toBeVisible()
  const recovered = await recoverAndInspect(recover, 8)
  await expectCurrent(recover, recoverOrder); assertSaved()
  check('Managed Import recovery Cancel preserves both intent ownership and original shadows; another already-open import only focuses, then explicit Recover retains current presentation and real fresh-revision dirty content', recovered)

  await browse()
  const dirtyOrder = await tabLabels(), dirtyRecord = await record(recover.id)
  await importPick(files[recover.id]); await expect(recovery()).toHaveCount(0)
  await expectCurrent(recover, dirtyOrder, true)
  const dirty = await api('open', recover.id)
  assert.equal(dirty.kind, 'opened'); assert.deepEqual(dirty.tab, recovered.tab)
  assert.deepEqual(catalogState([await record(recover.id)]), catalogState([dirtyRecord])); assertSaved()
  check('Import of the same already-open dirty recovered file focuses its unique existing tab with Home and order retained and no content revision or saved-package change', { tab: dirty.tab, order: dirtyOrder, record: dirtyRecord })

  await browse()
  const discardOrder = await tabLabels()
  await importPick(files[discard.id]); await expect(recovery()).toBeVisible()
  await recovery().getByRole('button', { name: 'Discard Recovery and Open Saved', exact: true }).click()
  await expect(recovery()).toHaveCount(0); await expectCurrent(discard, discardOrder)
  const discarded = await api('open', discard.id)
  assert.equal(discarded.kind, 'opened'); assert.equal(discarded.tab.dirty, false); assert.equal(discarded.tab.primaryBbox.x, 0)
  assertSaved()
  check('Explicit managed Import Discard opens real saved clean bboxx0 with current placement while original dirty shadow input remains backed up', { tab: discarded.tab, record: await record(discard.id) })

  await browse()
  const cancelExternal = externalFiles['Cancel Project'], externalCancelRows = await rows(), externalCancelOrder = await tabLabels()
  await importPick(cancelExternal.file)
  await expect(importModal()).toBeVisible()
  await expect(importModal().getByRole('button', { name: 'Move and Open', exact: true })).toBeVisible()
  await expect(importModal().getByLabel('Import workspace', { exact: true })).toContainText(workspace.displayName)
  await importModal().getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(importModal()).toHaveCount(0)
  assert.deepEqual(catalogState(await rows()), catalogState(externalCancelRows)); await expect.poll(tabLabels).toEqual(externalCancelOrder)
  assert.equal(digest(cancelExternal.file), cancelExternal.sha256)
  assert.equal(existsSync(path.join(folder, 'Cancel Project.igs')), false); assertSaved()
  check('External destination Cancel preserves source bytes no destination no catalog addition and Home; it never replays a prior selected import', { source: cancelExternal, order: externalCancelOrder, rows: externalCancelRows })

  await viewport(900, 620)
  const copy = externalFiles['Copy Project'], copyOrder = await tabLabels()
  await importPick(copy.file); await expect(importModal()).toBeVisible()
  await expect(importModal().getByLabel('Import workspace', { exact: true })).toContainText(workspace.displayName)
  await importModal().getByText('Keep the original and copy it here', { exact: true }).click()
  await screenshot('copy-destination-narrow')
  await importModal().getByRole('button', { name: 'Copy and Open', exact: true }).click()
  await expect(importModal()).toHaveCount(0)
  const copied = await importedAt(path.join(folder, 'Copy Project.igs'), copy.sha256)
  await expectCurrent(copied, copyOrder)
  assert.notEqual(copied.id, copy.seedId); assert.equal(digest(copy.file), copy.sha256); assertSaved()
  check('Actual external Copy commits and indexes the selected workspace destination then replaces Home; external original and all preexisting packages remain exact', { imported: copied, source: copy, order: await tabLabels() })

  await browse()
  const move = externalFiles['Move Project'], moveOrder = await tabLabels()
  await importPick(move.file); await expect(importModal()).toBeVisible()
  await importModal().getByRole('button', { name: 'Move and Open', exact: true }).click()
  await expect(importModal()).toHaveCount(0)
  const moved = await importedAt(path.join(folder, 'Move Project.igs'), move.sha256)
  await expectCurrent(moved, moveOrder)
  assert.notEqual(moved.id, move.seedId); assert.equal(existsSync(move.file), false)
  assert.equal(digest(path.join(backups, 'external-Move Project.igs')), move.sha256); assertSaved()
  check('Actual external Move publishes identical bytes and a new managed key before removing only its selected external source; original input backup and old owners remain exact', { imported: moved, source: move, order: await tabLabels() })

  await browse()
  const finishOrder = await tabLabels()
  await importPick(externalRecovery.file); await expect(importModal()).toBeVisible()
  await importModal().getByRole('button', { name: 'Move and Open', exact: true }).click()
  await expect(importModal()).toHaveCount(0); await expect(recovery()).toBeVisible()
  await expect.poll(tabLabels).toEqual(finishOrder)
  await screenshot('import-recovery-current-narrow')
  const recoveryImported = await importedAt(target, externalRecovery.sha256)
  assert.equal(recoveryImported.id, externalRecoveryId)
  assert.equal(digest(externalRecovery.file), externalRecovery.sha256, 'Existing Main keeps Move source when imported destination needs recovery.')
  const finishRecovered = await recoverAndInspect(recoveryImported, 16)
  await expectCurrent(recoveryImported, finishOrder); assertSaved()
  await viewport(1440, 900); await screenshot('import-recovered-current-wide')
  check('Real external finishImport recovery-required preserves Home until explicit Recover then applies current placement; owner retains Move original and fresh recovered bboxx16 without Save', { imported: recoveryImported, ...finishRecovered, source: externalRecovery })

  await browse()
  await closeOwnProjects()
  await expect.poll(tabLabels).toEqual(['Home'])
  assertSaved()
  for (const project of fixtures) assert.equal(digest(path.join(backups, `${project.id}.igs`)), seedHashes[project.id])
  for (const [title, source] of Object.entries(externalFiles)) {
    assert.equal(digest(path.join(backups, `external-${title}.igs`)), source.sha256)
    if (title !== 'Move Project') assert.equal(digest(source.file), source.sha256)
  }
  for (const input of shadowInputs) assert.deepEqual(tree(input.backup), input.before)
  assert.deepEqual(Object.fromEntries(sourceFiles.map((file) => [file, digest(file)])), report.sourceSha256)
  assert.deepEqual(Object.fromEntries(bundleFiles.map((file) => [file, digest(file)])), report.bundleSha256)
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors)); assert.equal(report.vueWarnings.length, 0, JSON.stringify(report.vueWarnings))
  const finalRecords = await rows()
  assert.equal(finalRecords.length, 12)
  for (const before of fixtureRecords) {
    const after = finalRecords.find(({ local_project_key }) => local_project_key === before.local_project_key)
    for (const field of ['local_project_key', 'canonical_path', 'workspace_id', 'document_id', 'document_revision']) assert.equal(after[field], before[field])
    assert.equal(after.last_opened_at !== before.last_opened_at, [anchor.id, managed.id, recover.id, discard.id].includes(before.local_project_key))
  }
  report.finalState = { records: finalRecords, seedHashes, committedHashes: createdHashes, externalFiles, openedProjectIds: [...opened.keys()], sourcePackagesExact: true, originalShadowBackupsExact: true, explicitDirtyCloses: report.explicitDirtyCloses }
  await close('entry-current-normal')
  assert.equal(report.nativeClosures.length, 2); assert.equal(report.screenshots.length, 4)
  assert.equal(report.pickerRestorations.length, 2); assert.ok(report.pickerRestorations.every(({ restored }) => restored))
  check('Every own tab closes explicitly with dirty changes discarded, all retained original packages/shadows remain exact and both native app lifetimes physically exit normally', report.finalState)
  assert.equal(report.checks.length, 12)
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'; report.error = error.stack ?? String(error)
  if (window) try {
    const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-failure.png`)
    if (!existsSync(file)) await window.screenshot({ path: file, animations: 'disabled' })
    report.failureScreenshot = { file, sha256: digest(file) }
  } catch (captureError) { report.failureScreenshotError = String(captureError) }
  throw error
} finally {
  try { await closeOwnProjects(); await close('finally-normal') }
  catch (closeError) { report.outcome = 'failed'; report.closeError = closeError.stack ?? String(closeError); process.exitCode = 1 }
  report.finishedAt = new Date().toISOString(); persist()
}
