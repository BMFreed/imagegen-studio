/**
 * Built Home grid/list and bounded split-panel qualification. Invoke4875d965: images.py get_image_full/thumbnail →
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
const payload = mkdtempSync(path.join(evidenceRoot, 'native-home-grid-'))
const appData = path.join(payload, 'data/imagegen-studio')
const folder = path.join(payload, 'selected-workspace')
mkdirSync(folder)
const execute = promisify(execFile)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const digest = (file) => hash(readFileSync(file))
const sourceFiles = [
  'scripts/smoke-home-grid.mjs',
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
  'src/renderer/components/ProjectTrashModal.vue',
  'src/renderer/components/project-canvas-geometry.ts',
  'src/renderer/styles/global.css',
]
const report = {
  outcome: 'running',
  mode: 'home-grid',
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
  boundary: 'Actual built Home/preload/Main/SQLite with real saved package, thumbnail/merged image and shadow owners. UI-only grid/list, bounded NSplit drag, viewport and App-session presentation state; production media/storage/recovery behavior is unchanged. OS Add Workspace picker is controlled and identity-restored. Preview/recovery/missing fixtures are prepared only while physically closed; no crash, generation, full-resolution quality or capacity qualification. Grid/list and panel preferences are checked across Home remount, not app restart. Explicit reversible Grid Move to Trash and Restore plus canceled Delete confirmation reuse original lifecycle owners; actual Delete is not executed. No implicit Open or Save, no ML/runtime/model copy, foreign data or process.',
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
async function writePreview(file, status, png, thumbnail) {
  const saved = await readIgsPackage(file)
  const layerId = saved.project.layers[0]?.id ?? randomUUID()
  const assetPath = `assets/layers/${layerId}.png`
  const project = parseProjectDocumentV1({
    ...saved.project,
    documentRevision: saved.project.documentRevision,
    layers: [{ id: layerId, kind: 'raster', name: 'Saved preview fixture', visible: true, locked: false, opacity: 1, blendMode: 'normal', transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 }, asset: { path: assetPath, width: imageWidth, height: imageHeight, bytes: png.length, sha256: hash(png) } }],
  })
  const placeholders = await readProjectPlaceholders(path.resolve('src/main/projects/placeholders'), status === 'unavailable' ? 'unavailable' : 'empty')
  await saveIgsPackage(file, { project, assets: { [assetPath]: { bytes: png } }, preview: { merged: status === 'rendered' ? png : placeholders.merged, thumbnail: thumbnail ?? placeholders.thumbnail, rect: { x: 0, y: 0, width: imageWidth, height: imageHeight }, status } })
  return await readIgsPackage(file)
}
async function prepareFixtures() {
  await application.evaluate(({ dialog }, folder) => {
    if (globalThis.__igsHomeGridPicker) throw new Error('Unexpected picker owner')
    const original = dialog.showOpenDialog
    const state = { original, calls: [] }
    globalThis.__igsHomeGridPicker = state
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
    await modal.getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Grid Workspace')
    await modal.getByRole('button', { name: 'Choose Folder and Add', exact: true }).click()
    await expect(modal).toHaveCount(0)
    workspace = (await api('listWorkspaces')).find(({ isDefault }) => !isDefault)
    assert.ok(workspace)
    assert.equal(workspace.directoryPath, folder)
  } finally {
    report.pickerRestoration = await application.evaluate(({ dialog }) => {
      const state = globalThis.__igsHomeGridPicker
      if (!state) throw new Error('Missing picker owner')
      dialog.showOpenDialog = state.original
      delete globalThis.__igsHomeGridPicker
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


const browser = () => window.locator('.project-browser')
const navigationHandle = () => window.locator('.home-shell-split > .n-split__resize-trigger-wrapper')
const inspectorHandle = () => window.locator('.home-content-split > .n-split__resize-trigger-wrapper')
const viewButton = (mode) => window.getByRole('button', { name: mode === 'grid' ? 'Grid view' : 'List view', exact: true })
const zoomValue = () => inspector().locator('.zoom-value')
async function choose(control, label) {
  await control.click()
  await window.locator('.n-base-select-option:visible').filter({ hasText: new RegExp(`^${label}$`) }).click()
  await expect(control).toContainText(label)
}
async function mode(value) {
  await viewButton(value).click()
  await expect(viewButton(value)).toHaveAttribute('aria-pressed', 'true')
  await expect(window.getByLabel(value === 'grid' ? 'Project grid' : 'Project list', { exact: true })).toBeVisible()
}
async function dimensions() {
  const [navigation, content, preview] = await Promise.all([home().boundingBox(), browser().boundingBox(), inspector().boundingBox()])
  assert.ok(navigation && content && preview)
  return { navigation: navigation.width, browser: content.width, inspector: preview.width }
}
async function drag(handle, delta) {
  await expect(handle).toBeVisible()
  const box = await handle.boundingBox()
  assert.ok(box && box.width > 0 && box.height > 0)
  const y = box.y + Math.min(box.height / 2, 100)
  await window.mouse.move(box.x + box.width / 2, y)
  await window.mouse.down()
  await window.mouse.move(box.x + box.width / 2 + delta, y, { steps: 8 })
  await window.mouse.up()
}
async function dragToEdge(handle, side) {
  const box = await handle.boundingBox()
  assert.ok(box)
  const width = await window.evaluate(() => window.innerWidth)
  await drag(handle, (side === 'left' ? 2 : width - 2) - (box.x + box.width / 2))
}
async function navigationTo(width) {
  await drag(navigationHandle(), width - (await dimensions()).navigation)
  await expect.poll(async () => Math.abs((await dimensions()).navigation - width)).toBeLessThan(3)
}
async function inspectorTo(width) {
  await drag(inspectorHandle(), (await dimensions()).inspector - width)
  await expect.poll(async () => Math.abs((await dimensions()).inspector - width)).toBeLessThan(3)
}
async function viewport(width, height) {
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width, height })
  await expect.poll(() => window.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([width, height])
  await expect.poll(() => window.locator('.home-view').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
}
async function boundedPanels() {
  await expect.poll(async () => {
    const size = await dimensions()
    return size.navigation >= 209 && size.navigation <= 361 && size.inspector >= 259 && size.inspector <= 441 && size.browser >= 279
  }).toBe(true)
  return await dimensions()
}
async function unavailableInspectorHandle() {
  if (await inspectorHandle().count() === 0) return
  const box = await inspectorHandle().boundingBox()
  assert.ok(!(await inspectorHandle().isVisible()) || !box || box.width <= 0.5, 'Collapsed Inspector must not expose a usable resize handle.')
}
/** Fixture-only Pillow WebP codec, matching Invoke image-file thumbnail serialization. */
async function thumbnailWebp(png) {
  const result = await execute('python3', ['-c',
    'import base64,io,sys; import PIL; from PIL import Image; image=Image.open(io.BytesIO(base64.b64decode(sys.argv[1]))).convert("RGBA"); output=io.BytesIO(); image.save(output,format="WEBP",quality=95); print(PIL.__version__); print(base64.b64encode(output.getvalue()).decode())',
    png.toString('base64'),
  ], { env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
  const [version, encoded] = result.stdout.trim().split('\n')
  assert.ok(version && encoded)
  report.fixtureCodec = { name: 'system Python Pillow', version, noMLRuntimeDependency: true }
  return Buffer.from(encoded, 'base64')
}
async function assertThumbnail(project, summary, expected) {
  const image = row(project.id).locator('.project-thumbnail img')
  await row(project.id).scrollIntoViewIfNeeded()
  await expect(image).toHaveAttribute('src', summary.thumbnailUrl)
  await expect.poll(() => image.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true)
  const resource = await readResource(summary.thumbnailUrl)
  assert.equal(resource.status, 200)
  assert.equal(resource.contentType, 'image/webp')
  assert.ok(Buffer.from(resource.bytes).equals(expected), 'Grid thumbnail must be the exact embedded WebP, not synthetic artwork.')
  return { url: summary.thumbnailUrl, bytes: resource.bytes.length, sha256: hash(expected) }
}

persist()
try {
  await launch('fixtures')
  await prepareFixtures()
  const png = fixturePng(false)
  const thumbnail = await thumbnailWebp(png)
  await close('fixtures-normal')
  const rendered = projects.find(({ title }) => title === 'Rendered Project')
  const empty = projects.find(({ title }) => title === 'Empty Project')
  const unavailable = projects.find(({ title }) => title === 'Unavailable Project')
  const missing = projects.find(({ title }) => title === 'Missing Project')
  await writePreview(files[rendered.id], 'rendered', png, thumbnail)
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

  await launch('grid-layout')
  await viewport(1440, 900)
  await browseWorkspace()
  await refresh()
  const beforeRecords = await records()
  const summary = await api('list', workspace.id)
  const renderedSummary = summary.find(({ id }) => id === rendered.id)
  assert.equal(summary.find(({ id }) => id === missing.id).health, 'missing')
  assert.equal(summary.find(({ id }) => id === empty.id).recoveryStatus, 'recoverable')
  await expect(viewButton('grid')).toHaveAttribute('aria-pressed', 'true')
  await expect(window.getByLabel('Project grid', { exact: true })).toBeVisible()
  await expect(inspector().getByText('Select a project to preview', { exact: true })).toBeVisible()
  for (const project of projects) assert.ok(await row(project.id).locator('.condition-stack > .n-tag').count() <= 2)
  await select(empty)
  await expect(inspector().getByText('Empty project', { exact: true })).toBeVisible()
  await expect(inspector().getByText('Recovery available', { exact: true })).toBeVisible()
  await select(unavailable)
  await expect(inspector().getByText('Preview unavailable', { exact: true }).first()).toBeVisible()
  await expect(inspector().getByRole('button', { name: 'Open Project', exact: true })).toBeEnabled()
  await select(missing)
  await expect(inspector().getByRole('button', { name: 'Open Project', exact: true })).toBeDisabled()
  await expect(stage()).toHaveCount(0)
  await select(rendered)
  await ready(rendered, renderedSummary.previewUrl)
  const resource = await assertImageResource(renderedSummary.previewUrl, png)
  const gridThumbnail = await assertThumbnail(rendered, renderedSummary, thumbnail)
  await screenshot('grid-wide', 1440, 900)
  check('Grid is the initial view and actual saved thumbnail/full pixels and independent recovery unavailable and missing conditions reach the selected Inspector', { projectId: rendered.id, resource, gridThumbnail, sizes: await boundedPanels() })

  await inspector().getByRole('button', { name: 'Zoom in', exact: true }).click()
  const manualZoom = await zoomValue().textContent()
  assert.equal(manualZoom?.trim(), '125%')
  const cameraBeforeToggle = await stage().getAttribute('viewBox')
  const previewElement = await stage().elementHandle()
  assert.ok(previewElement)
  await mode('list')
  await ready(rendered, renderedSummary.previewUrl)
  assert.equal(await stage().evaluate((element, original) => element === original, previewElement), true, 'View toggle must keep the same Inspector image consumer.')
  await expect(stage()).toHaveAttribute('viewBox', cameraBeforeToggle)
  await expect(zoomValue()).toHaveText('125%')
  for (const project of projects) assert.ok(await row(project.id).locator('.project-name-line > .n-tag').count() <= 1)
  await screenshot('list-wide', 1440, 900)
  await mode('grid')
  await ready(rendered, renderedSummary.previewUrl)
  assert.equal(await stage().evaluate((element, original) => element === original, previewElement), true)
  await expect(stage()).toHaveAttribute('viewBox', cameraBeforeToggle)
  check('Grid to List and back keep selected Project source actual image element and manually zoomed view while each presentation bounds its condition tags', { projectId: rendered.id, previewUrl: renderedSummary.previewUrl, cameraBeforeToggle, manualZoom: manualZoom.trim() })

  await row(unavailable.id).getByRole('button', { name: `${unavailable.title} project actions`, exact: true }).click()
  await expect(window.locator('.n-dropdown-option-body__label:visible').filter({ hasText: /^Show in Folder$/ })).toBeVisible()
  await expect(selectButton(rendered)).toHaveAttribute('aria-pressed', 'true')
  await expect(selectButton(unavailable)).toHaveAttribute('aria-pressed', 'false')
  await expect(inspector().getByRole('heading', { name: rendered.title, exact: true })).toBeVisible()
  await window.mouse.click(8, 185)
  await expect(window.locator('.n-dropdown-option-body__label:visible')).toHaveCount(0)
  for (const project of projects) await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveCount(0)
  check('A nested grid action opens its own menu without changing selection preview owner or opening any Project')

  await row(unavailable.id).getByRole('button', { name: `${unavailable.title} project actions`, exact: true }).click()
  await window.locator('.n-dropdown-option-body__label:visible').filter({ hasText: /^Move to Trash$/ }).click()
  const trashModal = window.getByRole('dialog', { name: 'Move Project to Trash', exact: true })
  await expect(trashModal).toBeVisible()
  await expect(trashModal).toContainText(unavailable.title)
  await trashModal.getByRole('button', { name: 'Move to Trash', exact: true }).click()
  await expect(trashModal).toHaveCount(0)
  await expect(row(unavailable.id)).toHaveCount(0)
  assert.equal(digest(files[unavailable.id]), beforeHashes[unavailable.id])
  await home().getByRole('button', { name: /^Trash(?:\s*\d+)?$/ }).click()
  await expect(viewButton('grid')).toHaveAttribute('aria-pressed', 'true')
  await expect(row(unavailable.id)).toBeVisible()
  await row(unavailable.id).getByRole('button', { name: `${unavailable.title} project actions`, exact: true }).click()
  await expect(window.locator('.n-dropdown-option-body__label:visible').filter({ hasText: /^Restore Project$/ })).toBeVisible()
  await window.locator('.n-dropdown-option-body__label:visible').filter({ hasText: /^Delete Permanently$/ }).click()
  const deleteModal = window.getByRole('dialog', { name: 'Delete Project Permanently', exact: true })
  await expect(deleteModal).toBeVisible()
  await expect(deleteModal.getByRole('button', { name: 'Delete Permanently', exact: true })).toBeEnabled()
  await deleteModal.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(deleteModal).toHaveCount(0)
  const controlTrash = (await api('listTrash')).find(({ id }) => id === unavailable.id)
  assert.ok(controlTrash && controlTrash.deletionStatus === 'trashed')
  assert.equal(digest(files[unavailable.id]), beforeHashes[unavailable.id])
  await select(unavailable)
  await screenshot('trash-grid-wide', 1440, 900)
  await row(unavailable.id).getByRole('button', { name: `${unavailable.title} project actions`, exact: true }).click()
  await window.locator('.n-dropdown-option-body__label:visible').filter({ hasText: /^Restore Project$/ }).click()
  await expect(row(unavailable.id)).toHaveCount(0)
  assert.equal((await api('listTrash')).some(({ id }) => id === unavailable.id), false)
  await browseWorkspace()
  await expect(row(unavailable.id)).toBeVisible()
  await expect(viewButton('grid')).toHaveAttribute('aria-pressed', 'true')
  assert.equal(digest(files[unavailable.id]), beforeHashes[unavailable.id])
  await select(rendered)
  await ready(rendered, renderedSummary.previewUrl)
  await inspector().getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(zoomValue()).toHaveText('125%')
  const resizedPreviewElement = await stage().elementHandle()
  assert.ok(resizedPreviewElement)
  check('Grid Trash overflow reaches actual Trash confirmation Restore and canceled permanent-delete confirmation while keeping the saved file and original Project key', { projectId: unavailable.id, trashId: controlTrash.trashId, packageSha256: beforeHashes[unavailable.id], permanentDeleteExecuted: false })

  const initialSizes = await dimensions()
  await drag(navigationHandle(), 40)
  await expect.poll(async () => (await dimensions()).navigation).toBeGreaterThan(initialSizes.navigation + 24)
  const beforeInspectorDrag = await dimensions()
  await drag(inspectorHandle(), -36)
  await expect.poll(async () => (await dimensions()).inspector).toBeGreaterThan(beforeInspectorDrag.inspector + 20)
  await boundedPanels()
  await ready(rendered, renderedSummary.previewUrl)
  await expect(zoomValue()).toHaveText('125%')
  assert.equal(await stage().evaluate((element, original) => element === original, resizedPreviewElement), true)
  const draggedSizes = await dimensions()
  check('Both actual NSplit handles redistribute space while retaining selected saved source and manual zoom scale', { initialSizes, draggedSizes, previewUrl: renderedSummary.previewUrl })

  await viewport(900, 620)
  const narrowInitial = await boundedPanels()
  await dragToEdge(navigationHandle(), 'right')
  const narrowNavigationMax = await boundedPanels()
  await dragToEdge(navigationHandle(), 'left')
  const narrowNavigationMin = await boundedPanels()
  await dragToEdge(inspectorHandle(), 'left')
  const narrowInspectorMax = await boundedPanels()
  await dragToEdge(inspectorHandle(), 'right')
  const narrowInspectorMin = await boundedPanels()
  await navigationTo(240)
  await inspectorTo(280)
  await screenshot('grid-narrow', 900, 620)
  await ready(rendered, renderedSummary.previewUrl)
  await expect(zoomValue()).toHaveText('125%')
  await viewport(1920, 1080)
  const largeSizes = await boundedPanels()
  await screenshot('grid-large', 1920, 1080)
  await expect(zoomValue()).toHaveText('125%')
  check('Viewport resize and extreme drags honor sidebar210to360 Inspector260to440 and browser280 bounds at900 1440 and1920 without selecting or opening another owner', { narrowInitial, narrowNavigationMax, narrowNavigationMin, narrowInspectorMax, narrowInspectorMin, largeSizes })

  await viewport(1440, 900)
  await navigationTo(260)
  await inspectorTo(330)
  const expandedSizes = await dimensions()
  await inspector().getByRole('button', { name: 'Collapse inspector', exact: true }).click()
  await expect.poll(async () => Math.abs((await dimensions()).inspector - 44)).toBeLessThan(2)
  await unavailableInspectorHandle()
  await expect(selectButton(rendered)).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await dimensions()).browser).toBeGreaterThan(expandedSizes.browser + 270)
  await screenshot('collapsed-inspector-wide', 1440, 900)
  await inspector().getByRole('button', { name: 'Expand inspector', exact: true }).click()
  await expect.poll(async () => Math.abs((await dimensions()).inspector - expandedSizes.inspector)).toBeLessThan(3)
  await expect(inspectorHandle()).toBeVisible()
  await ready(rendered, renderedSummary.previewUrl)
  await previewElement.dispose()
  await resizedPreviewElement.dispose()
  check('Collapsed Inspector occupies44pixels without a usable handle and restores its previous expanded width and selected source', { expandedSizes, restoredSizes: await dimensions() })

  await mode('list')
  await choose(window.getByLabel('Sort by', { exact: true }), 'Name')
  await window.getByRole('textbox', { name: 'Search projects', exact: true }).fill('Empty')
  await choose(window.getByLabel('Status', { exact: true }), 'Recovery available')
  await expect(row(empty.id)).toBeVisible()
  await expect(row(rendered.id)).toHaveCount(0)
  await expect(inspector().getByText('Select a project to preview', { exact: true })).toBeVisible()
  await window.getByRole('button', { name: 'Reset filters', exact: true }).click()
  await expect(window.getByRole('textbox', { name: 'Search projects', exact: true })).toHaveValue('')
  await expect(window.getByLabel('Status', { exact: true })).toContainText('All statuses')
  await expect(window.getByLabel('Sort by', { exact: true })).toContainText('Name')
  await expect(viewButton('list')).toHaveAttribute('aria-pressed', 'true')
  await select(rendered)
  await home().getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(inspector().getByText('Select a project to preview', { exact: true })).toBeVisible()
  await expect(viewButton('list')).toHaveAttribute('aria-pressed', 'true')
  await home().getByRole('button', { name: /^Trash(?:\s*\d+)?$/ }).click()
  await expect(viewButton('list')).toHaveAttribute('aria-pressed', 'true')
  await expect(inspector().getByText('Select a project to preview', { exact: true })).toBeVisible()
  await browseWorkspace()
  await expect(viewButton('list')).toHaveAttribute('aria-pressed', 'true')
  await expect(inspector().getByText('Select a project to preview', { exact: true })).toBeVisible()
  check('Reset preserves chosen List and sort while clearing search and Status; Projects Trash and workspace switches retain presentation and clear selection')

  const readOnlyRecords = await records()
  for (const project of projects) {
    assert.equal(digest(project.id === missing.id ? missingRetained : files[project.id]), beforeHashes[project.id])
    for (const key of ['local_project_key', 'canonical_path', 'workspace_id', 'document_id', 'document_revision', 'last_opened_at']) assert.equal(readOnlyRecords[project.id][key], beforeRecords[project.id][key], `${project.title}: ${key} must survive UI-only controls.`)
    await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveCount(0)
  }
  assert.deepEqual(tree(shadowDirectory), shadowBefore)
  assert.equal((await shadow.inspect({ projectPath: files[empty.id], savedPackage: savedEmpty })).status, 'recoverable')
  check('All view filter scope resize and collapse controls preserve every saved package last-opened identity and exact dirty recovery before explicit Open', { beforeHashes, beforeRecords, readOnlyRecords, shadowDirectory, shadowBefore })

  await navigationTo(260)
  await inspectorTo(330)
  const sessionSizes = await dimensions()
  await select(rendered)
  await inspector().getByRole('button', { name: 'Open in New Tab', exact: true }).click()
  await expect(window.getByRole('tab', { name: rendered.title, exact: true })).toHaveAttribute('aria-selected', 'true')
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await expect(viewButton('list')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => Math.abs((await dimensions()).navigation - sessionSizes.navigation)).toBeLessThan(3)
  await expect.poll(async () => Math.abs((await dimensions()).inspector - sessionSizes.inspector)).toBeLessThan(3)
  await inspector().getByRole('button', { name: 'Collapse inspector', exact: true }).click()
  await window.getByRole('tab', { name: rendered.title, exact: true }).click()
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await expect(viewButton('list')).toHaveAttribute('aria-pressed', 'true')
  await expect(inspector().getByRole('button', { name: 'Expand inspector', exact: true })).toBeVisible()
  await unavailableInspectorHandle()
  await expect.poll(async () => Math.abs((await dimensions()).inspector - 44)).toBeLessThan(2)
  await inspector().getByRole('button', { name: 'Expand inspector', exact: true }).click()
  await expect.poll(async () => Math.abs((await dimensions()).inspector - sessionSizes.inspector)).toBeLessThan(3)
  await select(rendered)
  await expect(inspector().getByRole('button', { name: 'Switch to Project', exact: true })).toBeVisible()
  await inspector().getByRole('button', { name: 'Switch to Project', exact: true }).click()
  await expect(window.getByRole('tab', { name: rendered.title, exact: true })).toHaveCount(1)
  await expect(window.getByRole('tab', { name: rendered.title, exact: true })).toHaveAttribute('aria-selected', 'true')
  await window.getByRole('button', { name: `Close ${rendered.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: rendered.title, exact: true })).toHaveCount(0)
  await browseWorkspace()
  await expect(viewButton('list')).toHaveAttribute('aria-pressed', 'true')
  const finalRecords = await records()
  for (const project of projects) {
    assert.equal(digest(project.id === missing.id ? missingRetained : files[project.id]), beforeHashes[project.id])
    if (project.id !== rendered.id) assert.equal(finalRecords[project.id].last_opened_at, beforeRecords[project.id].last_opened_at)
  }
  assert.notEqual(finalRecords[rendered.id].last_opened_at, beforeRecords[rendered.id].last_opened_at)
  assert.deepEqual(tree(shadowDirectory), shadowBefore)
  check('Explicit Open alone updates last-opened and creates one Project tab; List panel sizes and collapsed preference survive Home remount and clean Switch Close without Save', { projectId: rendered.id, sessionSizes, remountedSizes: await dimensions(), finalRecords })

  await close('grid-layout-normal')
  assert.equal(report.nativeClosures.length, 2)
  renameSync(missingRetained, files[missing.id])
  missingRetained = null
  const finalPackageHashes = Object.fromEntries(projects.map((project) => [project.id, digest(files[project.id])]))
  assert.deepEqual(finalPackageHashes, beforeHashes)
  assert.deepEqual(tree(shadowDirectory), shadowBefore)
  report.fixtureRestoration = { workspace, stableProjectIds: projects.map(({ id }) => id), files, beforeHashes, finalPackageHashes, beforeRecords, readOnlyRecords, finalRecords, shadowDirectory, shadowBefore, shadowAfter: tree(shadowDirectory), missingRestored: true, restorationAfterNormalPhysicalClose: true, noImplicitProjectSave: true, presentationScope: 'App session only; no cross-launch preference persistence claim' }
  check('Both owned lifetimes close normally before the exact missing control is restored; every package and the original dirty shadow remain byte-identical')
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.vueWarnings, [])
  assert.equal(report.checks.length, 12)
  assert.equal(report.screenshots.length, 6)
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
