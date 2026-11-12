/**
 * Built Home Inspector qualification. Invoke4875d965: images.py get_image_full/thumbnail →
 * images_default.py get_path → image_files_disk.py; SelectedImagePreview/PreviewWidgetView
 * keeps full and thumbnail sources distinct. Studio adapts that read path to validated .igs.
 * Fixtures use real Main/package/shadow owners; no ML or simulated generation acceptance.
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
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { crc32, deflateSync } from 'node:zlib'

import { _electron as electron, expect } from '@playwright/test'
import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage, saveIgsPackage } from '../src/main/projects/igs-package.ts'
import { readProjectPlaceholders } from '../src/main/projects/project-placeholders.ts'
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
const payload = mkdtempSync(path.join(evidenceRoot, 'native-inspector-'))
const appData = path.join(payload, 'data/imagegen-studio')
const folder = path.join(payload, 'selected-workspace')
mkdirSync(folder)
const execute = promisify(execFile)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const digest = (file) => hash(readFileSync(file))
const sourceFiles = [
  'scripts/smoke-home-inspector.mjs',
  'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs',
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/shared/api.ts',
  'src/main/projects/project-service.ts',
  'src/main/projects/project-index.ts',
  'src/main/projects/project-preview-resource.ts',
  'src/main/projects/project-identity.ts',
  'src/main/projects/project-location-registry.ts',
  'src/main/projects/project-path-lock.ts',
  'src/main/projects/project-trash-store.ts',
  'src/main/projects/project-shadow.ts',
  'src/main/projects/igs-package.ts',
  'src/main/projects/project-placeholders.ts',
  'src/shared/projects/project-schema.ts',
  'src/shared/projects/home-project-browse.ts',
  'src/renderer/App.vue',
  'src/renderer/components/HomeView.vue',
  'src/renderer/components/HomeProjectInspector.vue',
  'src/renderer/components/HomeProjectPreview.vue',
  'src/renderer/components/project-canvas-geometry.ts',
  'src/renderer/styles/global.css',
]
const report = {
  outcome: 'running',
  mode: 'home-inspector',
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
  boundary: 'Actual built Home/preload/Main/SQLite, package loader/writer and real merged protocol reads. OS Add Workspace picker is controlled and restored exactly. Rendered/unavailable previews and dirty recovery are prepared only while physically closed, not crash qualification or inference/visual-quality evidence. A deliberate external same-thumbnail package replacement is retained as a separate package version and then indexed by actual Refresh. No implicit Open, recovery, Save or generation; no ML/runtime/model copies, foreign data or processes. Grid/current-vs-new-tab and arbitrary capacity are outside this finite qualification.',
  invoke: { revision: '4875d96531ca6712b288f6e660fcbb34143408c1', paths: ['invokeai/app/api/routers/images.py', 'invokeai/app/services/images/images_default.py', 'invokeai/app/services/image_files/image_files_disk.py', 'invokeai/frontend/webv2/src/workbench/widgets/preview/PreviewWidgetView.tsx'] },
}
let application, window, database, workspace, projects, files
let nativeChecks = []
let missingRetained
const imageWidth = 128
const imageHeight = 64
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
    deadlineSeconds: 300,
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
const stage = () => inspector().getByLabel('Project preview canvas', { exact: true })
const row = (id) => window.locator(`.project-row[data-project-id="${id}"]`)
const selectButton = (project) => row(project.id).getByRole('button', { name: `Select ${project.title}`, exact: true })
async function refresh() {
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await expect(window.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled()
}
async function browseWorkspace() {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await home().locator('.workspace-select').filter({ hasText: workspace.displayName }).click()
  await expect(window.getByRole('heading', { name: workspace.displayName, exact: true })).toBeVisible()
}
async function select(project) {
  await selectButton(project).click()
  await expect(selectButton(project)).toHaveAttribute('aria-pressed', 'true')
  await expect(inspector().getByRole('heading', { name: project.title, exact: true })).toBeVisible()
}
async function ready(project, expectedUrl) {
  await expect(stage()).toHaveAttribute('data-preview-state', 'ready')
  await expect(stage()).toHaveAttribute('data-preview-url', expectedUrl)
  assert.equal(await stage().getAttribute('data-image-width'), String(imageWidth))
  assert.equal(await stage().getAttribute('data-image-height'), String(imageHeight))
  await expect(row(project.id)).toHaveAttribute('data-selected', 'true')
}
async function screenshot(name, width, height) {
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width, height })
  await expect.poll(() => window.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([width, height])
  await window.evaluate(() => document.fonts.ready.then(() => undefined))
  await window.mouse.move(0, 0)
  await expect.poll(() => window.locator('.home-view').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-${name}.png`)
  await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push({ file, width, height, sha256: digest(file) })
  persist()
}
async function records() {
  return Object.fromEntries(await Promise.all(projects.map(async (project) => [project.id, await database.db.selectFrom('project_index').selectAll().where('local_project_key', '=', project.id).executeTakeFirstOrThrow()])))
}
function tree(directory) {
  if (!existsSync(directory)) return []
  const entries = []
  function visit(base, prefix) {
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
async function readResource(url) {
  // Same default-session handler as the actual SVG/image load; renderer FetchAPI stays disabled.
  return application.evaluate(async ({ net }, url) => {
    const response = await net.fetch(url)
    const bytes = Array.from(new Uint8Array(await response.arrayBuffer()))
    return { status: response.status, contentType: response.headers.get('content-type'), cacheControl: response.headers.get('cache-control'), bytes }
  }, url)
}
async function assertImageResource(url, png) {
  const result = await readResource(url)
  assert.equal(result.status, 200)
  assert.equal(result.contentType, 'image/png')
  assert.equal(result.cacheControl, 'no-store')
  assert.ok(Buffer.from(result.bytes).equals(png), 'The actual protocol response must be the exact saved merged PNG.')
  const decoded = await window.evaluate((src) => new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('Actual merged protocol image failed browser decode'))
    image.src = src
  }), url)
  assert.deepEqual(decoded, { width: imageWidth, height: imageHeight })
  return { status: result.status, contentType: result.contentType, cacheControl: result.cacheControl, sha256: hash(Buffer.from(result.bytes)), bytes: result.bytes.length, decoded }
}
/** Fixture-only encoder, adapted from generation-target-client.test.ts; production validates all bytes. */
function fixturePng(alternate = false) {
  const chunk = (tag, bytes) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(bytes.length); head.write(tag, 4, 'ascii')
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(tag), bytes])))
    return Buffer.concat([head, bytes, checksum])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(imageWidth); ihdr.writeUInt32BE(imageHeight, 4); ihdr[8] = 8; ihdr[9] = 6
  const pixels = Buffer.alloc(imageHeight * (imageWidth * 4 + 1))
  for (let y = 0; y < imageHeight; y++) {
    for (let x = 0; x < imageWidth; x++) {
      const bright = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0
      pixels.set(alternate ? (bright ? [211, 119, 62, 255] : [70, 42, 89, 255]) : (bright ? [70, 148, 168, 255] : [28, 58, 74, 255]), y * (imageWidth * 4 + 1) + x * 4 + 1)
    }
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}
async function writePreview(file, status, png) {
  const saved = await readIgsPackage(file)
  const layerId = saved.project.layers[0]?.id ?? randomUUID()
  const assetPath = `assets/layers/${layerId}.png`
  const project = parseProjectDocumentV1({
    ...saved.project,
    documentRevision: saved.project.documentRevision,
    layers: [{ id: layerId, kind: 'raster', name: 'Saved preview fixture', visible: true, locked: false, opacity: 1, blendMode: 'normal', transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 }, asset: { path: assetPath, width: imageWidth, height: imageHeight, bytes: png.length, sha256: hash(png) } }],
  })
  const placeholders = await readProjectPlaceholders(path.resolve('src/main/projects/placeholders'), status === 'unavailable' ? 'unavailable' : 'empty')
  await saveIgsPackage(file, { project, assets: { [assetPath]: { bytes: png } }, preview: { merged: status === 'rendered' ? png : placeholders.merged, thumbnail: placeholders.thumbnail, rect: { x: 0, y: 0, width: imageWidth, height: imageHeight }, status } })
  return await readIgsPackage(file)
}
async function prepareFixtures() {
  await application.evaluate(({ dialog }, folder) => {
    if (globalThis.__igsHomeInspectorPicker) throw new Error('Unexpected picker owner')
    const original = dialog.showOpenDialog
    const state = { original, calls: [] }
    globalThis.__igsHomeInspectorPicker = state
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
    await modal.getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Inspector Workspace')
    await modal.getByRole('button', { name: 'Choose Folder and Add', exact: true }).click()
    await expect(modal).toHaveCount(0)
    workspace = (await api('listWorkspaces')).find(({ isDefault }) => !isDefault)
    assert.ok(workspace)
    assert.equal(workspace.directoryPath, folder)
  } finally {
    report.pickerRestoration = await application.evaluate(({ dialog }) => {
      const state = globalThis.__igsHomeInspectorPicker
      if (!state) throw new Error('Missing picker owner')
      dialog.showOpenDialog = state.original
      delete globalThis.__igsHomeInspectorPicker
      return { restored: dialog.showOpenDialog === state.original, calls: state.calls }
    })
    assert.equal(report.pickerRestoration.restored, true)
    persist()
  }
  for (const title of ['Rendered Project', 'Empty Project', 'Unavailable Project', 'Missing Project']) {
    const tab = await api('create', { title, width: 640, height: 512, workspaceId: workspace.id })
    await api('close', tab.id, false)
  }
  projects = await api('list', workspace.id)
  assert.equal(projects.length, 4)
  const initialRecords = await records()
  files = Object.fromEntries(projects.map((project) => [project.id, initialRecords[project.id].canonical_path]))
  check('Fixture workspace and four closed saved Projects use actual Main owners; the OS directory picker identity is restored', { workspace, projects, records: initialRecords, pickerRestoration: report.pickerRestoration })
}

persist()
try {
  await launch('fixtures')
  await prepareFixtures()
  await close('fixtures-normal')
  const rendered = projects.find(({ title }) => title === 'Rendered Project')
  const empty = projects.find(({ title }) => title === 'Empty Project')
  const unavailable = projects.find(({ title }) => title === 'Unavailable Project')
  const missing = projects.find(({ title }) => title === 'Missing Project')
  const png = fixturePng(false)
  const nextPng = fixturePng(true)
  assert.equal(png.equals(nextPng), false)
  await writePreview(files[rendered.id], 'rendered', png)
  await writePreview(files[unavailable.id], 'unavailable', png)
  const savedEmpty = await readIgsPackage(files[empty.id])
  const shadow = new ProjectShadowStore(path.join(appData, 'autosave'))
  await shadow.write({ projectPath: files[empty.id], savedDocument: savedEmpty.project, document: parseProjectDocumentV1({ ...savedEmpty.project, documentRevision: randomUUID(), primaryBbox: { ...savedEmpty.project.primaryBbox, x: 8 } }) })
  assert.equal((await shadow.inspect({ projectPath: files[empty.id], savedPackage: savedEmpty })).status, 'recoverable')
  const shadowDirectory = path.join(appData, 'autosave', empty.id)
  const shadowBefore = tree(shadowDirectory)
  const beforeHashes = Object.fromEntries(projects.map((project) => [project.id, digest(files[project.id])]))
  missingRetained = path.join(payload, 'retained-missing.igs')
  renameSync(files[missing.id], missingRetained)
  await launch('inspector')
  await browseWorkspace()
  await refresh()
  const beforeRecords = await records()
  const summary = await api('list', workspace.id)
  const renderedSummary = summary.find(({ id }) => id === rendered.id)
  assert.match(renderedSummary.previewUrl, /^igs-preview:\/\/merged\//)
  assert.equal(summary.find(({ id }) => id === missing.id).health, 'missing')
  assert.equal(summary.find(({ id }) => id === empty.id).recoveryStatus, 'recoverable')
  await expect(inspector().getByText('Select a project to preview', { exact: true })).toBeVisible()
  await select(rendered)
  await ready(rendered, renderedSummary.previewUrl)
  const resource = await assertImageResource(renderedSummary.previewUrl, png)
  assert.notEqual(renderedSummary.previewUrl, renderedSummary.thumbnailUrl)
  await screenshot('rendered-wide', 1440, 900)
  check('One selection displays the exact saved merged PNG through the real protected protocol and browser decoder without opening a Project', { projectId: rendered.id, previewUrl: renderedSummary.previewUrl, thumbnailUrl: renderedSummary.thumbnailUrl, resource })

  const fitted = await stage().getAttribute('viewBox')
  await inspector().getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect.poll(() => stage().getAttribute('viewBox')).not.toBe(fitted)
  const zoomed = await stage().getAttribute('viewBox')
  const bounds = await stage().boundingBox()
  assert.ok(bounds && bounds.width > 0 && bounds.height > 0)
  await window.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await window.mouse.down()
  await window.mouse.move(bounds.x + bounds.width / 2 + 28, bounds.y + bounds.height / 2 + 17, { steps: 4 })
  await window.mouse.up()
  await expect.poll(() => stage().getAttribute('viewBox')).not.toBe(zoomed)
  await inspector().getByRole('button', { name: 'Fit view', exact: true }).click()
  await expect(stage()).toHaveAttribute('viewBox', fitted)
  await inspector().getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect.poll(() => stage().getAttribute('viewBox')).not.toBe(fitted)
  await inspector().getByRole('button', { name: 'Reset view', exact: true }).click()
  // This 128×64 fixture fits without upscaling: Fit and centered 100% Reset coincide.
  await expect(stage()).toHaveAttribute('viewBox', fitted)
  await expect(inspector().locator('.zoom-value')).toHaveText('100%')
  await inspector().getByRole('button', { name: 'Fit view', exact: true }).click()
  await screenshot('viewer-controls-narrow', 900, 620)
  check('Actual viewer geometry responds to Zoom pan Fit and Reset while preserving the selected saved source', { fitted, zoomed, previewUrl: await stage().getAttribute('data-preview-url') })

  await inspector().getByRole('button', { name: 'Collapse inspector', exact: true }).click()
  await expect(stage()).toHaveCount(0)
  await expect(selectButton(rendered)).toHaveAttribute('aria-pressed', 'true')
  await inspector().getByRole('button', { name: 'Expand inspector', exact: true }).click()
  await ready(rendered, renderedSummary.previewUrl)
  await selectButton(empty).focus()
  await window.keyboard.press('Space')
  await expect(selectButton(empty)).toHaveAttribute('aria-pressed', 'true')
  await expect(inspector().getByText('Empty project', { exact: true })).toBeVisible()
  await expect(inspector().getByText('Recovery available', { exact: true })).toBeVisible()
  await expect(inspector().getByRole('heading', { name: rendered.title, exact: true })).toHaveCount(0)
  await screenshot('empty-recovery-narrow', 900, 620)
  check('Collapse and keyboard selection retain read-only ownership; selecting Empty Project removes the previous image and shows independent saved-empty/recovery conditions')

  await select(unavailable)
  await expect(inspector().getByText('Preview unavailable', { exact: true }).first()).toBeVisible()
  await expect(inspector().getByRole('button', { name: 'Open Project', exact: true })).toBeEnabled()
  await select(missing)
  await expect(inspector().getByText('File missing', { exact: true }).first()).toBeVisible()
  await expect(inspector().getByRole('button', { name: 'Open Project', exact: true })).toBeDisabled()
  await expect(stage()).toHaveCount(0)
  await screenshot('missing-project-wide', 1440, 900)
  check('Saved preview-unavailable remains openable while the actual missing file disables Open and never retains another Project image')

  await select(rendered)
  await window.getByRole('textbox', { name: 'Search projects', exact: true }).fill('Empty')
  await expect(row(rendered.id)).toHaveCount(0)
  await expect(inspector().getByText('Select a project to preview', { exact: true })).toBeVisible()
  await window.getByRole('button', { name: 'Reset filters', exact: true }).click()
  await select(rendered)
  await home().getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(inspector().getByText('Select a project to preview', { exact: true })).toBeVisible()
  await browseWorkspace()
  await expect(inspector().getByText('Select a project to preview', { exact: true })).toBeVisible()
  check('Filtering a selected row out and switching browse scope clear Inspector selection instead of silently choosing another Project')

  for (const project of projects) {
    assert.equal(digest(project.id === missing.id ? missingRetained : files[project.id]), beforeHashes[project.id])
    assert.equal((await records())[project.id].last_opened_at, beforeRecords[project.id].last_opened_at)
    await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveCount(0)
  }
  assert.deepEqual(tree(shadowDirectory), shadowBefore)
  assert.equal((await shadow.inspect({ projectPath: files[empty.id], savedPackage: savedEmpty })).status, 'recoverable')
  check('Selection viewer tools collapse filtering and scope changes preserve all saved packages last-opened timestamps and the actual dirty recovery shadow', { beforeHashes, beforeRecords, shadowDirectory, shadowBefore })

  const retainedRendered = path.join(payload, 'rendered-before-refresh.igs')
  writeFileSync(retainedRendered, readFileSync(files[rendered.id]), { flag: 'wx' })
  const original = await readIgsPackage(files[rendered.id])
  const originalThumbnail = await original.readMember('preview/thumbnail.webp')
  const originalProjectJson = await original.readMember('project.json')
  const originalAsset = original.project.layers[0].asset
  const originalRaster = await original.readMember(originalAsset.path)
  await saveIgsPackage(files[rendered.id], {
    project: original.project,
    projectJson: originalProjectJson,
    assets: { [originalAsset.path]: { bytes: originalRaster } },
    preview: { ...original.manifest.preview, merged: nextPng, thumbnail: originalThumbnail },
  })
  const changed = await readIgsPackage(files[rendered.id])
  const replacementPackageSha256 = digest(files[rendered.id])
  assert.equal(hash(originalThumbnail), hash(await changed.readMember('preview/thumbnail.webp')))
  assert.ok(originalProjectJson.equals(await changed.readMember('project.json')), 'Preview-only replacement preserves exact project.json.')
  assert.ok(originalRaster.equals(await changed.readMember(originalAsset.path)), 'Preview-only replacement preserves exact raster assets.')
  assert.equal(changed.project.documentRevision, original.project.documentRevision)
  const staleBeforeRefresh = await readResource(renderedSummary.previewUrl)
  assert.equal(staleBeforeRefresh.status >= 400, true)
  await refresh()
  const current = (await api('list', workspace.id)).find(({ id }) => id === rendered.id)
  assert.equal(current.thumbnailUrl, renderedSummary.thumbnailUrl)
  assert.notEqual(current.previewUrl, renderedSummary.previewUrl)
  const staleAfterRefresh = await readResource(renderedSummary.previewUrl)
  assert.equal(staleAfterRefresh.status >= 400, true)
  await select(rendered)
  await ready(rendered, current.previewUrl)
  const replacementResource = await assertImageResource(current.previewUrl, nextPng)
  await screenshot('refreshed-version-wide', 1440, 900)
  check('An external package replacement with the same thumbnail and document revision invalidates the old full-preview capability before and after Refresh; the new source returns exact replacement pixels', { originalPreviewUrl: renderedSummary.previewUrl, currentPreviewUrl: current.previewUrl, retainedRendered, beforeSha256: digest(retainedRendered), currentSha256: digest(files[rendered.id]), replacementResource, staleBeforeRefresh: staleBeforeRefresh.status, staleAfterRefresh: staleAfterRefresh.status })

  await inspector().getByRole('button', { name: 'Open in New Tab', exact: true }).click()
  await expect(window.getByRole('tab', { name: rendered.title, exact: true })).toHaveAttribute('aria-selected', 'true')
  const opened = await api('open', rendered.id)
  assert.equal(opened.kind, 'opened')
  assert.equal(opened.tab.id, rendered.id)
  assert.equal(opened.tab.dirty, false)
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await select(rendered)
  await expect(inspector().getByRole('button', { name: 'Switch to Project', exact: true })).toBeVisible()
  await inspector().getByRole('button', { name: 'Switch to Project', exact: true }).click()
  await expect(window.getByRole('tab', { name: rendered.title, exact: true })).toHaveCount(1)
  await expect(window.getByRole('tab', { name: rendered.title, exact: true })).toHaveAttribute('aria-selected', 'true')
  await window.getByRole('button', { name: `Close ${rendered.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: rendered.title, exact: true })).toHaveCount(0)
  await browseWorkspace()
  assert.deepEqual(tree(shadowDirectory), shadowBefore)
  check('Only explicit Inspector Open creates the saved Project tab; Switch to Project focuses its unique existing tab and clean Close preserves unrelated recovery')

  renameSync(missingRetained, files[missing.id])
  missingRetained = null
  await refresh()
  await select(missing)
  await expect(inspector().getByRole('button', { name: 'Open Project', exact: true })).toBeEnabled()
  await expect(inspector().getByText('File missing', { exact: true })).toHaveCount(0)
  for (const project of [empty, unavailable, missing]) assert.equal(digest(files[project.id]), beforeHashes[project.id])
  assert.equal(digest(files[rendered.id]), replacementPackageSha256, 'Explicit Open/Switch/Close must not Save the inspected replacement package.')
  const finalRecords = await records()
  assert.equal(finalRecords[rendered.id].canonical_path, files[rendered.id])
  assert.equal(finalRecords[rendered.id].document_id, beforeRecords[rendered.id].document_id)
  assert.deepEqual(tree(shadowDirectory), shadowBefore)
  report.fixtureRestoration = { workspace, stableProjectIds: projects.map(({ id }) => id), files, beforeHashes, retainedRendered, originalRenderedSha256: digest(retainedRendered), finalPackageHashes: Object.fromEntries(projects.map((project) => [project.id, digest(files[project.id])])), shadowDirectory, shadowBefore, shadowAfter: tree(shadowDirectory), missingRestored: true, finalRecords, deliberateReplacementRemainsIndexed: true }
  await screenshot('restored-home-wide', 1440, 900)
  check('Restoring the exact owned missing package and Refresh return its original identity while the deliberate replacement stays coherently indexed and recovery bytes remain exact')
  await close('inspector-normal')
  assert.equal(report.nativeClosures.length, 2)
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.vueWarnings, [])
  assert.equal(report.checks.length, 10)
  report.outcome = 'passed'
  report.finishedAt = new Date().toISOString()
  persist()
} catch (error) {
  report.outcome = 'failed'
  report.error = error.stack ?? String(error)
  persist()
  if (window && !window.isClosed()) await window.screenshot({ path: path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-failure.png`) }).catch(() => undefined)
  throw error
} finally {
  await close('finally')
  if (missingRetained && existsSync(missingRetained)) {
    const missing = projects.find(({ title }) => title === 'Missing Project')
    assert.equal(existsSync(files[missing.id]), false)
    renameSync(missingRetained, files[missing.id])
    report.failedFixtureRestoration = { missingFile: files[missing.id], restoredSha256: digest(files[missing.id]), normalAppCloseBeforeRestoration: application === null }
    persist()
  }
}
