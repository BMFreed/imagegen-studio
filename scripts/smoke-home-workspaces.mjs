/** Real built Home/IPC/SQLite/.igs qualification. Only OS picker replies are controlled. */
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
const payload = mkdtempSync(path.join(evidenceRoot, 'native-workspaces-'))
const appData = path.join(payload, 'data/imagegen-studio')
const folder = path.join(payload, 'selected-workspace')
mkdirSync(folder)
const execute = promisify(execFile)
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const report = {
  outcome: 'running',
  startedAt: new Date().toISOString(),
  payloads: [payload],
  checks: [],
  screenshots: [],
  nativeClosures: [],
  resourceChecks: [],
  pageErrors: [],
  boundary:
    'Actual built renderer/preload/Main/SQLite and Project package writers/loaders. Only OS picker replies are controlled; OS dialog UX and arbitrary permission races are not qualified. No ML.',
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
persist()
try {
  await launch('first')
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
  await expect(home().getByRole('button', { name: /Qualification Workspace/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
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
  await home()
    .getByRole('button', { name: /Uncategorized/ })
    .click()
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
  await close('restart-normal')
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.nativeClosures.length, 2)
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
