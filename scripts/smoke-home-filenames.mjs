/** Built Home filename consumer over b9f33fd3; real packages, scanner, preload and UI. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron, expect } from '@playwright/test'
import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import { boundQualificationProcess, confirmQualificationProcessExit } from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4, 'Use --report-file ABSOLUTE_NEW_OWNED_REPORT')
assert.equal(process.argv[2], '--report-file')
assert.equal(process.platform, 'linux', 'This finite fixture includes a literal Linux filename backslash.')
const reportFile = process.argv[3], evidenceRoot = path.dirname(reportFile)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const relative = path.relative(artifactRoot, evidenceRoot)
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
assert.equal(realpathSync(evidenceRoot), evidenceRoot)
assert.equal(lstatSync(evidenceRoot).isSymbolicLink(), false)
assert.equal(existsSync(reportFile), false)
const payload = mkdtempSync(path.join(evidenceRoot, 'native-home-filenames-'))
const appData = path.join(payload, 'data/imagegen-studio'), folder = path.join(payload, 'selected-workspace')
const backups = path.join(payload, 'original-inputs'), heldPath = path.join(payload, 'held-missing-project.igs')
for (const directory of [folder, backups]) mkdirSync(directory)
const execute = promisify(execFile)
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const sourceFiles = [
  'scripts/smoke-home-filenames.mjs', 'scripts/native-smoke-window.mjs', 'scripts/qualification-resource-limits.mjs',
  'src/main/index.ts', 'src/preload/index.ts', 'src/shared/api.ts', 'src/main/db/database.ts',
  'src/main/projects/project-service.ts', 'src/main/projects/project-index.ts', 'src/main/projects/project-identity.ts',
  'src/main/projects/project-location-registry.ts', 'src/main/projects/project-relocation-store.ts',
  'src/main/projects/project-autosave.ts', 'src/main/projects/project-shadow.ts',
  'src/main/projects/project-session.ts', 'src/main/projects/igs-package.ts', 'src/main/projects/project-placeholders.ts',
  'src/shared/projects/project-schema.ts', 'src/shared/projects/project-rename.ts',
  'src/shared/projects/home-project-browse.ts', 'src/renderer/App.vue', 'src/renderer/components/HomeView.vue',
  'src/renderer/components/HomeProjectInspector.vue', 'src/renderer/components/HomeProjectPreview.vue',
  'src/renderer/components/RenameProjectModal.vue', 'src/renderer/styles/global.css',
]
const bundleFiles = ['dist/main/main.cjs', 'dist/preload/preload.cjs', 'dist/renderer/index.html',
  ...readdirSync('dist/renderer/assets').filter((name) => /\.(?:js|css)$/.test(name)).map((name) => `dist/renderer/assets/${name}`)]
const report = {
  outcome: 'running', mode: 'home-filenames', startedAt: new Date().toISOString(), payloads: [payload],
  checks: [], screenshots: [], nativeClosures: [], resourceChecks: [], pageErrors: [], vueWarnings: [],
  sourceSha256: Object.fromEntries(sourceFiles.map((file) => [file, digest(file)])),
  bundleSha256: Object.fromEntries(bundleFiles.map((file) => [file, digest(file)])),
  sourceBasis: {
    baseRevision: 'b9f33fd3b49398632f807ff60b3c11eac18f7a05',
    invokeRevision: '4875d96531ca6712b288f6e660fcbb34143408c1',
    invokePaths: ['invokeai/app/services/project_records/project_records_common.py', 'invokeai/app/services/project_records/project_records_default.py', 'invokeai/app/services/shared/database/queries/projects.py', 'invokeai/app/api/routers/projects.py', 'invokeai/frontend/webv2/src/workbench/projects/library.ts', 'invokeai/frontend/webv2/src/workbench/projects/api.ts'],
    studioFixtureOwners: ['ProjectSession.create', 'ProjectIndexRepository.scanWorkspace', 'ProjectService.renameProject', 'ProjectRelocationStore.beginRename', 'App.confirmRenameProject'],
    note: 'Invoke lightweight summaries omit documents and have no folder-backed filename. The reviewed adaptation publishes the existing Studio canonical/source basename; it does not derive a filename from the title. Fixture packages use existing Studio writer/placeholders while Main is physically closed; Rename uses its actual existing Main/UI owner.',
  },
  boundary: 'Two actual built app lifetimes, real Main scanner/preload/SQLite and .igs packages. Only the Add Workspace OS picker is controlled and its exact callback restored; no Project API reply, pending journal or legacy DTO is fabricated. Same display title with distinct real Unicode/case/long and literal Linux backslash filenames; List/Inspector selection, Refresh, cached Missing and explicit closed-project UI Rename are actual consumers. Read-only byte/identity/revision/open-time controls are separate from the expected explicit Rename title/revision/package change. The held missing source is restored only after confirmed physical app exit. Legacy omission fallback and pending operation projections remain separate source/Main-unit evidence. No ML, runtime/model copy, SHARED dependency, foreign paths or process mutation; no full Home/lifecycle/MVP acceptance claim.',
}
let application, window, database, workspace, alpha, beta, nativeChecks = [], heldMissing = false
const fixtures = []
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
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await expect.poll(async () => (await api('listWorkspaces')).length).toBeGreaterThan(0)
  database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
  await viewport(1440, 900)
}
async function close(label) {
  if (!application) return
  await restorePicker()
  if (database) { await database.close(); database = null }
  await bound(`${label}-before-close`); await application.close()
  report.nativeClosures.push({ label, ...(await confirmQualificationProcessExit(nativeChecks)) })
  application = null; window = null; persist()
}
const navigation = () => window.getByLabel('Workspace navigation', { exact: true })
const inspector = () => window.getByLabel('Project inspector', { exact: true })
const row = (project) => window.locator(`.project-row[data-project-id="${project.id}"]`)
const selectButton = (project) => row(project).getByRole('button', { name: `Select ${project.title}`, exact: true })
async function records() { return await database.db.selectFrom('project_index').selectAll().orderBy('local_project_key').execute() }
// Scanning changes its derived timestamp; implicit Open/Save or ownership changes must still fail.
function catalog(rows) { return rows.map(({ indexed_at: _indexedAt, ...value }) => value) }
async function tabLabels() { return window.getByRole('tablist', { name: 'Open documents', exact: true }).getByRole('tab').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label'))) }
async function refresh() {
  const button = window.getByRole('button', { name: 'Refresh projects', exact: true })
  await expect(button).toBeEnabled(); await button.click(); await expect(button).toBeEnabled()
}
async function viewport(width, height) {
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width, height })
  await expect.poll(() => window.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([width, height])
}
async function screenshot(name) {
  await window.evaluate(() => document.fonts.ready.then(() => undefined)); await window.mouse.move(0, 0)
  const [width, height] = await window.evaluate(() => [window.innerWidth, window.innerHeight])
  const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-${name}.png`)
  assert.equal(existsSync(file), false); await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push({ file, width, height, sha256: digest(file) }); persist()
}
async function filename(project, leaf) {
  const field = row(project).locator('.project-file-name')
  await expect(field).toBeVisible(); await expect(field).toHaveText(leaf); await expect(field).toHaveAttribute('title', leaf)
  assert.equal(leaf, path.basename(leaf)); assert.notEqual(leaf, `${project.title}.igs`)
}
async function select(project, leaf) {
  await selectButton(project).click(); await expect(selectButton(project)).toHaveAttribute('aria-pressed', 'true')
  await expect(inspector().getByRole('heading', { name: project.title, exact: true })).toBeVisible()
  const label = `${workspace.displayName} / ${leaf}`
  await expect(inspector().locator('.inspector-header span')).toHaveText(label)
  await expect(inspector().locator('.inspector-header span')).toHaveAttribute('title', label)
}
function assertOriginals() {
  for (const fixture of fixtures) {
    assert.equal(digest(fixture.backup), fixture.sha256)
    assert.equal(digest(heldMissing && fixture === fixtures[1] ? heldPath : fixture.path), fixture.sha256)
  }
}
async function restorePicker() {
  if (!application) return
  const value = await application.evaluate(({ dialog }) => {
    const state = globalThis.__igsHomeFilenamesPicker
    if (!state) return null
    if (dialog.showOpenDialog !== state.wrapper) throw new Error('Picker owner changed')
    dialog.showOpenDialog = state.original; delete globalThis.__igsHomeFilenamesPicker
    return { restored: dialog.showOpenDialog === state.original, calls: state.calls }
  })
  if (value) { assert.equal(value.restored, true); report.pickerRestoration = value; persist() }
}
function restoreMissing() {
  if (!heldMissing) return
  assert.equal(application, null, 'Restore only after physical native closure.')
  assert.equal(existsSync(fixtures[1].path), false); assert.equal(lstatSync(heldPath).isSymbolicLink(), false)
  assert.equal(digest(heldPath), fixtures[1].sha256)
  renameSync(heldPath, fixtures[1].path); heldMissing = false
  assert.equal(digest(fixtures[1].path), fixtures[1].sha256)
  report.missingRestoration = { path: fixtures[1].path, sha256: digest(fixtures[1].path), afterPhysicalExit: true, heldPathAbsent: !existsSync(heldPath) }; persist()
}

persist()
try {
  await launch('register-workspace')
  await application.evaluate(({ dialog }, selectedPath) => {
    const original = dialog.showOpenDialog, state = { original, calls: [] }
    state.wrapper = async (owner, options) => {
      if (options.title !== 'Add Workspace') return original.call(dialog, owner, options)
      if (JSON.stringify(options.properties) !== JSON.stringify(['openDirectory', 'createDirectory'])) throw new Error('Wrong Add Workspace contract')
      state.calls.push({ title: options.title, properties: options.properties, selectedPath }); return { canceled: false, filePaths: [selectedPath] }
    }
    dialog.showOpenDialog = state.wrapper; globalThis.__igsHomeFilenamesPicker = state
  }, folder)
  await navigation().getByRole('button', { name: 'Add Workspace', exact: true }).click()
  const add = window.getByRole('dialog', { name: 'Add Workspace', exact: true })
  await add.getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Filename Workspace')
  await add.getByRole('button', { name: 'Choose Folder and Add', exact: true }).click(); await expect(add).toHaveCount(0)
  await restorePicker()
  workspace = (await api('listWorkspaces')).find(({ isDefault }) => !isDefault)
  assert.ok(workspace); assert.equal(workspace.directoryPath, folder); assert.equal((await api('list', workspace.id)).length, 0)
  assert.deepEqual(await tabLabels(), ['Home']); await close('register-workspace-normal')
  assert.equal(report.nativeClosures.length, 1); assert.equal(report.pickerRestoration.calls.length, 1)
  check('Real Add Workspace registers the owned empty folder; the exact picker callback is restored and the first app lifetime physically closes normally', { workspace, picker: report.pickerRestoration })

  const roots = { placeholdersDir: path.resolve('src/main/projects/placeholders'), scratchDir: path.join(payload, 'writer-scratch') }
  const leaves = ['MiXeD α — длинное имя — retained actual filename for narrow inspector and list.IGS', 'Other\\Variant — β.igs']
  for (const [index, leaf] of leaves.entries()) {
    assert.equal(application, null)
    const file = path.join(folder, leaf)
    const session = await ProjectSession.create(file, 'Shared Project', roots, { x: 0, y: 0, width: 640, height: 512 }, folder)
    const original = await readIgsPackage(file), backup = path.join(backups, `original-${index + 1}.igs`)
    cpSync(file, backup, { errorOnExist: true, force: false })
    fixtures.push({ path: file, fileName: leaf, sha256: digest(file), backup, document: session.document, manifest: original.manifest })
  }
  assert.notEqual(fixtures[0].document.documentId, fixtures[1].document.documentId)
  assertOriginals(); report.fixtures = { workspace, packages: fixtures, originalDirectory: backups, seededWhileMainPhysicallyClosed: true }; persist()
  check('Existing ProjectSession writer creates two exact backed-up closed packages with the same title and distinct real Unicode/case/long and Linux backslash leaves', report.fixtures)

  await launch('filename-consumer')
  await navigation().locator('.workspace-select').filter({ hasText: workspace.displayName }).click()
  await expect(window.getByRole('heading', { name: workspace.displayName, exact: true })).toBeVisible(); await refresh()
  const summaries = await api('list', workspace.id), beforeRecords = await records()
  assert.equal(summaries.length, 2); assert.equal(beforeRecords.length, 2)
  alpha = summaries.find(({ fileName }) => fileName === leaves[0]); beta = summaries.find(({ fileName }) => fileName === leaves[1])
  assert.ok(alpha && beta); assert.notEqual(alpha.id, beta.id)
  for (const [index, project] of [alpha, beta].entries()) {
    const record = beforeRecords.find(({ local_project_key }) => local_project_key === project.id)
    assert.equal(project.title, 'Shared Project'); assert.equal(project.health, 'ready'); assert.equal(project.recoveryStatus, 'none')
    assert.equal(project.fileName, path.basename(record.canonical_path)); assert.equal(record.canonical_path, fixtures[index].path)
    assert.equal(record.document_id, fixtures[index].document.documentId); assert.equal(record.document_revision, fixtures[index].document.documentRevision)
    assert.equal(record.last_opened_at, null); assert.equal(project.lastOpenedAt, null)
  }
  report.initialConsumer = { summaries, beforeRecords }; assertOriginals()
  check('Fresh real Main scan and preload summaries publish exact canonical basenames independently of duplicate display titles and portable document IDs', report.initialConsumer)

  await window.getByRole('button', { name: 'List view', exact: true }).click()
  await filename(alpha, leaves[0]); await filename(beta, leaves[1]); await select(alpha, leaves[0]); await select(beta, leaves[1])
  await expect.poll(tabLabels).toEqual(['Home']); await refresh(); await filename(alpha, leaves[0]); await filename(beta, leaves[1])
  assert.deepEqual(catalog(await records()), catalog(beforeRecords)); assertOriginals()
  await screenshot('same-title-actual-filenames-wide')
  check('Built List rows and selected Inspector show real leaf filenames with exact title attributes; selection and Refresh keep both packages, revisions, identities and lastOpened unchanged')

  await viewport(900, 620); await select(alpha, leaves[0]); await filename(alpha, leaves[0])
  const geometry = await inspector().locator('.inspector-header span').evaluate((node) => {
    const style = getComputedStyle(node), rect = node.getBoundingClientRect()
    return { clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, textOverflow: style.textOverflow, whiteSpace: style.whiteSpace, right: rect.right, viewportWidth: innerWidth }
  })
  assert.ok(geometry.scrollWidth > geometry.clientWidth); assert.equal(geometry.textOverflow, 'ellipsis'); assert.equal(geometry.whiteSpace, 'nowrap'); assert.ok(geometry.right <= geometry.viewportWidth)
  await screenshot('long-unicode-filename-narrow'); assert.deepEqual(catalog(await records()), catalog(beforeRecords)); assertOriginals()
  check('Narrow real Inspector truncates the long Unicode/case filename visually while preserving the full exact text and title attribute', { geometry })

  await expect.poll(tabLabels).toEqual(['Home']); assertOriginals(); assert.equal(existsSync(heldPath), false)
  assert.equal(lstatSync(fixtures[1].path).isSymbolicLink(), false)
  renameSync(fixtures[1].path, heldPath); heldMissing = true
  report.missingFixture = { originalPath: fixtures[1].path, heldPath, sha256: digest(heldPath), heldOutsideWorkspace: path.dirname(heldPath) !== folder }; persist()
  await refresh(); await expect.poll(async () => (await api('list', workspace.id)).find(({ id }) => id === beta.id)?.health).toBe('missing')
  const missingSummaries = await api('list', workspace.id), missingRecords = await records()
  const missing = missingSummaries.find(({ id }) => id === beta.id), missingRecord = missingRecords.find(({ local_project_key }) => local_project_key === beta.id)
  assert.equal(missing.fileName, leaves[1]); assert.equal(missing.title, beta.title); assert.equal(missingRecord.diagnostic_code, 'FILE_MISSING')
  const stableMissing = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => !['diagnostic_code', 'file_fingerprint', 'file_health', 'file_mtime_ns', 'file_size_bytes', 'indexed_at', 'preview_thumbnail_sha256'].includes(key)))
  assert.deepEqual(stableMissing(missingRecord), stableMissing(beforeRecords.find(({ local_project_key }) => local_project_key === beta.id)))
  assert.deepEqual(catalog(missingRecords.filter(({ local_project_key }) => local_project_key === alpha.id)), catalog(beforeRecords.filter(({ local_project_key }) => local_project_key === alpha.id)))
  await filename(beta, leaves[1]); await select(missing, leaves[1]); await expect(inspector().getByText('Locate the saved Project file or remove its missing entry from Home.', { exact: false })).toBeVisible()
  await expect(row(beta).getByRole('button', { name: `Open ${beta.title}`, exact: true })).toBeDisabled()
  await screenshot('cached-missing-filename-narrow'); assertOriginals()
  report.missingConsumer = { summaries: missingSummaries, records: missingRecords }
  check('Actual missing-file Refresh retains cached literal-backslash basename, title, IDs, revision and lastOpened with FILE_MISSING diagnostic; the available sibling stays exact', report.missingConsumer)

  await select(alpha, leaves[0])
  await row(alpha).getByRole('button', { name: `${alpha.title} project actions`, exact: true }).click()
  await window.locator('.n-dropdown-option:visible').filter({ hasText: /^Rename$/ }).click()
  const rename = window.getByRole('dialog', { name: 'Rename Project', exact: true }), renamedTitle = 'Renamed Project', renamedPath = path.join(folder, `${renamedTitle}.igs`)
  await rename.getByRole('textbox', { name: 'Project name', exact: true }).fill(renamedTitle)
  await rename.getByRole('button', { name: 'Rename', exact: true }).click(); await expect(rename).toHaveCount(0)
  await expect(window.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled()
  const renamed = (await api('list', workspace.id)).find(({ id }) => id === alpha.id), renamedPackage = await readIgsPackage(renamedPath), afterRenameRecords = await records()
  assert.ok(renamed); assert.equal(renamed.title, renamedTitle); assert.equal(renamed.fileName, path.basename(renamedPath)); assert.equal(renamed.health, 'ready')
  assert.equal(renamed.pendingRename, undefined); assert.equal(renamed.pendingMove, undefined); assert.equal(existsSync(fixtures[0].path), false)
  assert.equal(renamedPackage.project.documentId, fixtures[0].document.documentId); assert.notEqual(renamedPackage.project.documentRevision, fixtures[0].document.documentRevision)
  assert.deepEqual({ ...renamedPackage.project, title: null, documentRevision: null }, { ...fixtures[0].document, title: null, documentRevision: null })
  assert.deepEqual(renamedPackage.manifest.preview, fixtures[0].manifest.preview)
  assert.deepEqual(renamedPackage.manifest.members.filter(({ path: member }) => member !== 'project.json'), fixtures[0].manifest.members.filter(({ path: member }) => member !== 'project.json'))
  const renamedRecord = afterRenameRecords.find(({ local_project_key }) => local_project_key === alpha.id)
  assert.equal(renamedRecord.canonical_path, renamedPath); assert.equal(renamedRecord.display_name, renamedTitle); assert.equal(renamedRecord.document_revision, renamedPackage.project.documentRevision); assert.equal(renamedRecord.last_opened_at, null)
  assert.deepEqual(catalog(afterRenameRecords.filter(({ local_project_key }) => local_project_key === beta.id)), catalog(missingRecords.filter(({ local_project_key }) => local_project_key === beta.id)))
  assert.equal((await database.db.selectFrom('project_relocation').selectAll().execute()).length, 0)
  await expect(row(renamed).locator('.project-file-name')).toHaveText(path.basename(renamedPath)); await expect(row(renamed).locator('.project-file-name')).toHaveAttribute('title', path.basename(renamedPath))
  await select(renamed, path.basename(renamedPath)); await filename(beta, leaves[1]); await expect.poll(tabLabels).toEqual(['Home'])
  const renamedSha256 = digest(renamedPath)
  assert.notEqual(renamedSha256, fixtures[0].sha256); assert.equal(digest(fixtures[0].backup), fixtures[0].sha256); assert.equal(digest(heldPath), fixtures[1].sha256)
  report.renameConsumer = { before: alpha, after: renamed, renamedPath, renamedSha256, beforeDocument: fixtures[0].document, afterDocument: renamedPackage.project, afterRenameRecords, pendingRelocations: [], unrenamedSiblingCatalogExact: true, explicitExpectedPackageTitleAndRevisionChange: true }
  check('Actual closed-project UI Rename publishes the new real filename and title with stable Project/document identity; only the expected title/revision package change is accepted', report.renameConsumer)

  await refresh(); await select(beta, leaves[1]); await select(renamed, path.basename(renamedPath))
  const finalRecords = await records(); assert.deepEqual(catalog(finalRecords), catalog(afterRenameRecords))
  assert.equal(digest(renamedPath), renamedSha256); assert.equal(digest(heldPath), fixtures[1].sha256)
  for (const fixture of fixtures) assert.equal(digest(fixture.backup), fixture.sha256)
  assert.deepEqual(Object.fromEntries(sourceFiles.map((file) => [file, digest(file)])), report.sourceSha256)
  assert.deepEqual(Object.fromEntries(bundleFiles.map((file) => [file, digest(file)])), report.bundleSha256)
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors)); assert.equal(report.vueWarnings.length, 0, JSON.stringify(report.vueWarnings))
  assert.deepEqual(await tabLabels(), ['Home']); await close('filename-consumer-normal'); restoreMissing()
  assert.equal(report.nativeClosures.length, 2); assert.equal(report.screenshots.length, 3)
  report.finalState = { initialRecords: beforeRecords, afterRenameRecords, finalRecords, restoredUnrenamedPath: fixtures[1].path, restoredUnrenamedSha256: digest(fixtures[1].path), renamedPath, renamedSha256: digest(renamedPath), originalBackups: fixtures.map(({ backup, sha256 }) => ({ path: backup, sha256 })), noProjectOpened: true, noImplicitSave: true, cachedMissingDiagnosticRetainedUntilNextScan: true, sourceAndBundlesUnchanged: true }
  check('Read-only controls after explicit Rename preserve all persisted fields except derived scan time; both lifetimes physically exit normally and the held source restores byte-exact after exit', report.finalState)
  assert.equal(report.checks.length, 8); report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'; report.error = error.stack ?? String(error)
  if (window) try { const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-failure.png`); if (!existsSync(file)) await window.screenshot({ path: file, animations: 'disabled' }); report.failureScreenshot = { file, sha256: digest(file) } } catch (captureError) { report.failureScreenshotError = String(captureError) }
  throw error
} finally {
  try {
    await restorePicker()
    if (window) {
      await window.keyboard.press('Escape')
      for (const name of ['Add Workspace', 'Rename Project']) {
        const modal = window.getByRole('dialog', { name, exact: true })
        if (await modal.isVisible()) await modal.getByRole('button', { name: 'Cancel', exact: true }).click()
      }
    }
    await close('finally-normal'); restoreMissing()
  } catch (closeError) { report.outcome = 'failed'; report.closeError = closeError.stack ?? String(closeError); process.exitCode = 1 }
  report.finishedAt = new Date().toISOString(); persist()
}
