/** Real built Electron → captured mask command → Main-authored pixels → Save/recovery. No ML. */
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
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { crc32, deflateSync, inflateSync } from 'node:zlib'
import { _electron as electron, expect } from '@playwright/test'
import yazl from 'yazl'

import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage, saveIgsPackage } from '../src/main/projects/igs-package.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { IGS_MIMETYPE } from '../src/shared/projects/project-schema.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  runMaskTransformBeforeSave,
  runMaskTransformRecovery,
} from './smoke-smart-patch-transform-scenario.mjs'
import {
  assertMaskSettingsReopened,
  assertMaskSettingsStored,
  runMaskSettingsBeforeSave,
  runMaskSettingsRecovery,
} from './smoke-smart-patch-mask-settings-scenario.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'

const arguments_ = process.argv.slice(2)
assert.ok(
  arguments_.length === 2 ||
    (arguments_.length === 3 && ['--with-transform', '--with-settings'].includes(arguments_[2])),
  'Use --report-file ABSOLUTE_NEW_OWNED_REPORT [--with-transform | --with-settings]',
)
assert.equal(arguments_[0], '--report-file')
const reportFile = arguments_[1]
const withSettings = arguments_[2] === '--with-settings'
const withTransform = withSettings || arguments_[2] === '--with-transform'
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false)
const evidenceRoot = path.dirname(reportFile)
const relative = path.relative(artifactRoot, evidenceRoot)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
assert.equal(realpathSync(evidenceRoot), evidenceRoot)
assert.ok(lstatSync(evidenceRoot).isDirectory() && !lstatSync(evidenceRoot).isSymbolicLink())
const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'native-mask-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
mkdirSync(appDataRoot, { recursive: true, mode: 0o700 })
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashFiles = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const sourceFiles = [
  'scripts/smoke-smart-patch-mask.mjs',
  'scripts/smoke-smart-patch-transform-scenario.mjs',
  'scripts/smoke-smart-patch-mask-settings-scenario.mjs',
  'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs',
  'src/renderer/index.html',
  'src/renderer/App.vue',
  'src/renderer/components/ProjectView.vue',
  'src/renderer/components/ProjectCanvas.vue',
  'src/renderer/components/ProjectSmartPatchLayerRow.vue',
  'src/renderer/components/ProjectLayerStack.vue',
  'src/renderer/components/ProjectEntitySurface.vue',
  'src/shared/api.ts',
  'src/renderer/components/project-canvas-geometry.ts',
  'src/renderer/components/project-layer-context.ts',
  'src/renderer/components/project-draft-sync.ts',
  'src/shared/projects/project-schema.ts',
  'src/shared/projects/project-mask.ts',
  ...(withSettings ? ['src/shared/projects/project-mask-settings.ts'] : []),
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/main/projects/project-service.ts',
  'src/main/projects/project-autosave.ts',
  'src/main/projects/project-shadow.ts',
  'src/main/projects/project-session.ts',
  'src/main/projects/igs-package.ts',
  'src/main/projects/project-layer-resource.ts',
  'src/main/projects/project-preview.ts',
  'src/main/projects/project-raster-snapshot.ts',
  ...readdirSync('src/renderer/components')
    .filter((name) => /mask.*\.(?:ts|vue)$/i.test(name) && !name.endsWith('.test.ts'))
    .map((name) => `src/renderer/components/${name}`),
  ...readdirSync('src/main/projects')
    .filter((name) => /^project-mask.*\.ts$/.test(name) && !name.endsWith('.test.ts'))
    .map((name) => `src/main/projects/${name}`),
]
const report = {
  outcome: 'running',
  mode: withSettings
    ? 'mask-settings-transform-fit'
    : withTransform
      ? 'mask-transform-fit'
      : 'mask-authoring',
  startedAt: new Date().toISOString(),
  fixtureRoot,
  payloads: [fixtureRoot],
  sourceSha256: hashFiles(sourceFiles),
  bundleSha256: hashFiles([
    'dist/main/main.cjs',
    'dist/preload/preload.cjs',
    'dist/renderer/index.html',
    ...readdirSync('dist/renderer/assets')
      .filter((name) => /\.(?:js|css)$/.test(name))
      .map((name) => `dist/renderer/assets/${name}`),
  ]),
  checks: [],
  screenshots: [],
  masks: [],
  commands: [],
  settingsCommands: [],
  settingsDiagnostics: [],
  resourceLimits: [],
  nativeClosures: [],
  nativeLaunchStates: [],
  pageErrors: [],
  layouts: [],
  boundary: {
    actual: withSettings
      ? 'Built native UI owned blur/padding defaults, captured field commits, strict draft cancellation, configurable outward8-grid Fit; existing actual pointer authoring/Transform, real preload/Main metadata and pixels, one-entry history, actual Save/ZIP read/reopen and dirty-shadow crash recovery.'
      : withTransform
        ? 'Built native UI pointer mask tools plus actual Konva move/scale/rotation previews and explicit Transform Apply/Cancel, Fit24px outward8-grid; real preload/Main authoritative pixels and one-entry history, actual Save/ZIP read/reopen and dirty-shadow crash recovery.'
        : 'Built native UI pointer mask tools; real preload/Main authoritative PNG authoring, owner/refusal/history, genuine Save/ZIP read/reopen and local dirty-shadow crash recovery.',
    fixtures:
      'One tiny ICC Raster is added by the production package writer only while a genuinely UI-created Project is closed. Main handler observation returns identical original replies. A native chooser supplies only an owned corrupted package path. No fabricated Project/pixel replies, runtime, models, workers or inference.',
    oracle:
      'Literal world-coordinate alpha expectations; independent PNG row reconstruction and Chromium decoder, whole alpha/PNG comparisons for history/reopen/recovery. No production mask rasterizer or codec imports.',
    limits:
      'Sequential native actors and scopes: 2GiB/zero swap/300s; physical PID/start exits before restart or disposal. Test masks remain small; large refusal commands allocate no large images.',
    excluded: withTransform
      ? 'Generation/inpaint/outpaint, variants/staleness, Regional Guidance, cross-computer transfer and release readiness.'
      : 'Mask Transform/Fit, generation/inpaint/outpaint, variants/staleness, Regional Guidance, cross-computer transfer and release readiness.',
    cleanup:
      'Root owns cleanup after physical exit, compact evidence pinning and mutation restoration. This runner never touches shared runtime/model data or ordinary app data.',
  },
}
const nativeExec = promisify(execFile)
let application, window, database, projectId, packagePath, normal, rasterBefore
let patchAId,
  patchBId,
  selectedId,
  nativeChecks = [],
  observerInstalled = false
const title = 'Native painted Smart Patch masks'
const rasterId = randomUUID()
const rasterMember = `assets/layers/${rasterId}.png`
const rawRaster = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const icc = readFileSync('worker-python/src/imagegen_worker/srgb.icc')
assert.equal(digest(icc), IGS_SRGB_ICC_SHA256)
function pngChunk(tag, bytes) {
  const result = Buffer.alloc(12 + bytes.length)
  result.writeUInt32BE(bytes.length, 0)
  result.write(tag, 4, 'ascii')
  bytes.copy(result, 8)
  result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4)
  return result
}
const rasterPng = Buffer.concat([
  rawRaster.subarray(0, 33),
  pngChunk('iCCP', Buffer.concat([Buffer.from('profile\0\0', 'ascii'), deflateSync(icc)])),
  rawRaster.subarray(33),
])
function checkpoint() {
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
}
function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence })
  checkpoint()
  console.log(`PASS ${name}`)
}
function settingsDiagnostic(stage, evidence) {
  report.settingsDiagnostics.push({ stage, ...evidence })
  checkpoint()
  console.log(`OBSERVED settings ${stage}`)
}
async function rawApi(scope, method, ...args) {
  return await window.evaluate(({ scope, method, args }) => window.api[scope][method](...args), {
    scope,
    method,
    args,
  })
}
async function api(scope, method, ...args) {
  const result = await rawApi(scope, method, ...args)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function current() {
  const result = await api('projects', 'open', projectId)
  assert.equal(result.kind, 'opened')
  return result.tab
}
const patch = (tab, id) => {
  const value = tab.layers.find((layer) => layer.id === id)
  assert.equal(value?.kind, 'smart-patch')
  return value
}
const layerContent = ({ imageUrl: _imageUrl, maskImageUrl: _maskImageUrl, ...layer }) => layer
const content = (tab) => ({
  documentId: tab.documentId,
  generationDraft: tab.generationDraft,
  primaryBbox: tab.primaryBbox,
  layers: tab.layers.map(layerContent),
  acceptedResults: tab.acceptedResults,
  lastActualSeedSnapshot: tab.lastActualSeedSnapshot,
})
const exactState = (tab) => ({
  ...content(tab),
  documentRevision: tab.documentRevision,
  dirty: tab.dirty,
  canUndo: tab.canUndo,
  canRedo: tab.canRedo,
})
function assertNormal(tab) {
  assert.equal(tab.layers.length, 3, 'Painting cannot create standalone mask or Raster layers')
  assert.equal(tab.layers.filter(({ kind }) => kind === 'smart-patch').length, 2)
  // The validated Raster view keeps its legacy optional `kind`; Smart Patch is explicit.
  assert.equal(tab.layers.filter(({ kind }) => kind !== 'smart-patch').length, 1)
  assert.deepEqual(tab.primaryBbox, normal.primaryBbox)
  assert.deepEqual(tab.generationDraft, normal.generationDraft)
  assert.deepEqual(
    layerContent(tab.layers.find(({ id }) => id === rasterId)),
    layerContent(rasterBefore),
  )
  assert.deepEqual(tab.acceptedResults, [])
}
async function barrier() {
  await current()
  await nativeFrames()
}
async function nativeFrames() {
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
}
async function screenshot(label) {
  await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  const file = path.join(evidenceRoot, `${label}.png`)
  await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push(file)
  checkpoint()
}
async function bounds(label) {
  const value = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds: 300,
    execute: (file, args, options) =>
      nativeExec(
        file,
        args.map((item) => (item === 'MemoryMax=12G' ? 'MemoryMax=2G' : item)),
        options,
      ),
  })
  assert.ok(
    value.groups.every(
      (group) => BigInt(group.memoryMax) <= 2n * 1024n ** 3n && group.swapMax === '0',
    ),
  )
  nativeChecks.push(value)
  report.resourceLimits.push({ label, ...value })
  checkpoint()
}
async function observeCommands() {
  await application.evaluate(({ ipcMain }, withSettings) => {
    const channel = 'projects:edit-smart-patch-mask'
    const original = ipcMain._invokeHandlers.get(channel)
    if (typeof original !== 'function' || globalThis.igsNativeMaskObserver)
      throw new Error('Mask observer requires the original Main handler.')
    const probe = { original, rows: [] }
    globalThis.igsNativeMaskObserver = probe
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      const row = { args: structuredClone(args), completed: false }
      probe.rows.push(row)
      const result = await original(event, ...args)
      row.completed = true
      row.ok = result.ok
      row.error = result.ok ? null : structuredClone(result.error)
      if (result.ok) row.documentRevision = result.value.documentRevision
      return result
    })
    if (withSettings) {
      const settingsChannel = 'projects:update-smart-patch-layer'
      const settingsOriginal = ipcMain._invokeHandlers.get(settingsChannel)
      if (typeof settingsOriginal !== 'function' || globalThis.igsNativeMaskSettingsObserver)
        throw new Error('Settings observer requires the original Main handler.')
      const settings = { original: settingsOriginal, rows: [] }
      globalThis.igsNativeMaskSettingsObserver = settings
      ipcMain.removeHandler(settingsChannel)
      ipcMain.handle(settingsChannel, async (event, ...args) => {
        const row = { args: structuredClone(args), completed: false }
        settings.rows.push(row)
        const result = await settingsOriginal(event, ...args)
        row.completed = true
        row.ok = result.ok
        row.error = result.ok ? null : structuredClone(result.error)
        if (result.ok) row.documentRevision = result.value.documentRevision
        return result
      })
    }
  }, withSettings)
  observerInstalled = true
}
async function commands() {
  return await application.evaluate(() => structuredClone(globalThis.igsNativeMaskObserver.rows))
}
async function settingsCommands() {
  assert.equal(withSettings, true)
  return await application.evaluate(() =>
    structuredClone(globalThis.igsNativeMaskSettingsObserver.rows).filter(({ args }) =>
      ['mask-blur', 'bbox-padding'].includes(args[2]?.kind),
    ),
  )
}
async function restoreObserver(label) {
  if (!observerInstalled || !application) return
  const value = await application.evaluate(({ ipcMain }) => {
    const probe = globalThis.igsNativeMaskObserver
    ipcMain.removeHandler('projects:edit-smart-patch-mask')
    ipcMain.handle('projects:edit-smart-patch-mask', probe.original)
    const restored =
      ipcMain._invokeHandlers.get('projects:edit-smart-patch-mask') === probe.original
    const result = {
      restored,
      rows: structuredClone(probe.rows),
      originalSource: probe.original.toString(),
    }
    const settings = globalThis.igsNativeMaskSettingsObserver
    if (settings) {
      ipcMain.removeHandler('projects:update-smart-patch-layer')
      ipcMain.handle('projects:update-smart-patch-layer', settings.original)
      result.settings = {
        restored:
          ipcMain._invokeHandlers.get('projects:update-smart-patch-layer') === settings.original,
        rows: structuredClone(settings.rows),
        originalSource: settings.original.toString(),
      }
      delete globalThis.igsNativeMaskSettingsObserver
    }
    delete globalThis.igsNativeMaskObserver
    return result
  })
  assert.equal(value.restored, true)
  if (withSettings) {
    assert.equal(value.settings?.restored, true)
    report.settingsCommands.push({
      label,
      originalReferenceRestored: value.settings.restored,
      originalHandlerSha256: digest(value.settings.originalSource),
      rows: value.settings.rows,
    })
  }
  report.commands.push({
    label,
    originalReferenceRestored: value.restored,
    originalHandlerSha256: digest(value.originalSource),
    rows: value.rows,
  })
  observerInstalled = false
  checkpoint()
}
async function launch(label) {
  const environment = {
    ...process.env,
    NODE_ENV: 'production',
    CUDA_VISIBLE_DEVICES: '',
    XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
    XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
    XDG_CACHE_HOME: path.join(fixtureRoot, 'cache'),
  }
  for (const name of [
    'ELECTRON_RUN_AS_NODE',
    'IMAGEGEN_TEST_IMAGE_WORKER',
    'IMAGEGEN_DEV_SERVER_URL',
    'PYTHONPATH',
    'PYTHONHOME',
  ])
    delete environment[name]
  nativeChecks = []
  application = await electron.launch({
    args: [
      '--ozone-platform=x11',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      // Owned qualification only: decouple compositor cadence from an idle/DPMS-off desktop.
      '--disable-frame-rate-limit',
      '--disable-gpu-vsync',
      '.',
    ],
    cwd: process.cwd(),
    env: environment,
    timeout: 30_000,
  })
  await bounds(`${label}-launch`)
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(15_000)
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  const nativeFocus = await application.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows()[0]
    const before = {
      visible: main.isVisible(),
      minimized: main.isMinimized(),
      focused: main.isFocused(),
    }
    if (main.isMinimized()) main.restore()
    main.show()
    main.focus()
    main.webContents.focus()
    return {
      before,
      after: {
        visible: main.isVisible(),
        minimized: main.isMinimized(),
        focused: main.isFocused(),
      },
    }
  })
  await expect
    .poll(() =>
      window.evaluate(() => ({
        focused: document.hasFocus(),
        visibility: document.visibilityState,
      })),
    )
    .toEqual({ focused: true, visibility: 'visible' })
  const rendererFocus = await window.evaluate(() => ({
    focused: document.hasFocus(),
    visibility: document.visibilityState,
  }))
  const compositorCadence = await window.evaluate(async () => {
    const begin = performance.now()
    const frames = []
    const timers = []
    let finished = false
    return await new Promise((resolve) => {
      const frame = (timestamp) => {
        if (finished) return
        frames.push({ elapsed: performance.now() - begin, timestamp })
        if (frames.length < 12) requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
      setTimeout(() => timers.push({ requested: 100, elapsed: performance.now() - begin }), 100)
      setTimeout(() => {
        finished = true
        resolve({
          elapsed: performance.now() - begin,
          frames,
          timers,
          visibility: document.visibilityState,
          focused: document.hasFocus(),
        })
      }, 350)
    })
  })
  report.nativeLaunchStates.push({ label, nativeFocus, rendererFocus, compositorCadence })
  check(
    `${label}: real native window restored/shown/focused; renderer has focus and visible compositor`,
    { nativeFocus, rendererFocus },
  )
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await window.waitForFunction(() => typeof window.api?.projects?.editSmartPatchMask === 'function')
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  assert.deepEqual(await api('models', 'getCatalog'), [])
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  await observeCommands()
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1440, 900),
  )
  check(`${label}: real native mask API with absent runtime/models`)
}
async function closeNative(label) {
  if (!application) return
  await bounds(`${label}-before-close`)
  await restoreObserver(label)
  if (database) {
    await database.close()
    database = null
  }
  try {
    await application.close()
  } catch (error) {
    report.closeUiError = String(error)
    const latest = nativeChecks.at(-1)
    const id = latest.processIdentities.find(({ pid }) => pid === application.process().pid)
    const group = latest.groups.find(({ ownedScope, pids }) => ownedScope && pids.includes(id?.pid))
    assert.ok(id && group)
    report.ownedSignal = await stopExpiredQualificationProcess({ ...id, group: group.group })
  }
  const exit = await confirmQualificationProcessExit(nativeChecks)
  assert.equal(exit.confirmed, true)
  report.nativeClosures.push({ label, ...exit })
  application = null
  window = null
  checkpoint()
}
async function closeProject(discard = false) {
  const tab = window.getByRole('tab', { name: title, exact: true })
  await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
  const guard = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect
    .poll(async () =>
      (await tab.count()) === 0 ? 'closed' : (await guard.isVisible()) ? 'decision' : 'waiting',
    )
    .not.toBe('waiting')
  if (await tab.count()) {
    assert.equal(discard, true)
    await guard.getByRole('button', { name: 'Discard Changes', exact: true }).click()
  }
  await expect(tab).toHaveCount(0)
  await nativeFrames()
  await expect(guard).toBeHidden()
}
async function openProject() {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
}
async function select(id) {
  const layer = patch(await current(), id)
  const button = window
    .locator(`[data-layer-id="${id}"]`)
    .getByRole('button', { name: `Select ${layer.name}`, exact: true })
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  selectedId = id
}
const canvas = () => window.getByRole('region', { name: 'Project Canvas', exact: true })
async function worldPoint(point) {
  const view = await canvas()
    .locator('.canvas-area')
    .evaluate((host) => {
      const rect = host.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        x: Number(host.dataset.cameraX),
        y: Number(host.dataset.cameraY),
        scale: Number(host.dataset.cameraScale),
      }
    })
  assert.ok(
    Number.isFinite(view.x) && Number.isFinite(view.y) && view.scale > 0,
    'Actual camera diagnostics are required for real pointer placement',
  )
  const position = {
    x: view.left + view.x + point.x * view.scale,
    y: view.top + view.y + point.y * view.scale,
  }
  assert.ok(
    position.x > view.left + 35 &&
      position.x < view.left + view.width - 35 &&
      position.y > view.top + 35 &&
      position.y < view.top + view.height - 55,
    'Fixture world point must be reachable away from tool/viewport controls',
  )
  return position
}
async function tool(name) {
  const button = canvas().getByRole('button', { name, exact: true })
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
}
async function diameter(value) {
  const input = window.locator('input[aria-label="Mask brush size"]')
  await input.fill(String(value))
  await input.press('Tab')
  await expect(input).toHaveValue(String(value))
}
async function gesture(name, points, polygon = false, operation = 'add') {
  const before = await current()
  const count = (await commands()).length
  await tool(name)
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-mask-ready', 'true')
  if (!name.includes('Lasso')) await diameter(20)
  const positions = []
  for (const point of points) positions.push(await worldPoint(point))
  if (polygon) {
    for (const position of positions) await window.mouse.click(position.x, position.y)
    await canvas().locator('.canvas-area').press('Enter')
  } else {
    await window.mouse.move(positions[0].x, positions[0].y)
    await window.mouse.down()
    for (const position of positions.slice(1))
      await window.mouse.move(position.x, position.y, { steps: 4 })
    await window.mouse.up()
  }
  await expect
    .poll(async () => (await commands()).filter((row) => row.completed).length)
    .toBe(count + 1)
  const rows = await commands()
  const row = rows.at(-1)
  assert.equal(row.ok, true, JSON.stringify(row.error))
  assert.equal(row.args[2].documentRevision, before.documentRevision)
  assert.equal(row.args[2].documentId, before.documentId)
  assert.equal(row.args[0], projectId)
  assert.equal(row.args[1], selectedId)
  assert.equal(row.args[2].maskId, patch(before, selectedId).mask.id)
  assert.equal(row.args[2].maskRevision, patch(before, selectedId).mask.revision)
  assert.equal(row.args[2].edit.kind, name.includes('Lasso') ? 'polygon' : 'brush')
  assert.equal(row.args[2].edit.operation, name === 'Eraser tool' ? 'subtract' : operation)
  if (row.args[2].edit.kind === 'brush') assert.equal(row.args[2].edit.diameter, 20)
  const after = await current()
  assert.equal(row.documentRevision, after.documentRevision)
  return after
}
async function sceneAlphaAt(point) {
  const position = await worldPoint(point)
  return await canvas()
    .locator('.konva-stage')
    .evaluate((host, screen) => {
      const samples = [...host.querySelectorAll('canvas')]
        .filter((element) => element.getBoundingClientRect().width > 0)
        .map((element) => {
          const rect = element.getBoundingClientRect()
          const x = Math.floor(((screen.x - rect.left) * element.width) / rect.width)
          const y = Math.floor(((screen.y - rect.top) * element.height) / rect.height)
          return element.getContext('2d').getImageData(x, y, 1, 1).data[3]
        })
      return Math.max(0, ...samples)
    }, position)
}
async function overlayControl() {
  const before = exactState(await current())
  const count = (await commands()).length
  await expect.poll(() => sceneAlphaAt({ x: -40, y: 32 })).toBeGreaterThan(0)
  await window.getByRole('button', { name: 'Hide mask overlay', exact: true }).click()
  await expect.poll(() => sceneAlphaAt({ x: -40, y: 32 })).toBe(0)
  await barrier()
  assert.deepEqual(exactState(await current()), before)
  await window.getByRole('button', { name: 'Show mask overlay', exact: true }).click()
  await expect.poll(() => sceneAlphaAt({ x: -40, y: 32 })).toBeGreaterThan(0)
  await barrier()
  assert.deepEqual(exactState(await current()), before)
  assert.equal((await commands()).length, count)
  check(
    'Real overlay toggle hides/restores rendered coverage outside raster/bbox without changing mask/Project/history or issuing a Main edit',
  )
}
async function resizeNative(width, height) {
  const native = await application.evaluate(
    ({ BrowserWindow }, [width, height]) => {
      const main = BrowserWindow.getAllWindows()[0]
      main.setSize(width, height)
      return { outer: main.getSize(), content: main.getContentSize() }
    },
    [width, height],
  )
  assert.deepEqual(native.outer, [width, height])
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual(native.content)
  await nativeFrames()
  return native
}
async function nativeLayouts() {
  const baseline = exactState(await current())
  const commandCount = (await commands()).length
  try {
    for (const size of [
      [1440, 900],
      [900, 620],
    ]) {
      const native = await application.evaluate(({ BrowserWindow }, [width, height]) => {
        const main = BrowserWindow.getAllWindows()[0]
        main.setSize(width, height)
        return { outer: main.getSize(), content: main.getContentSize() }
      }, size)
      assert.deepEqual(native.outer, size)
      await expect
        .poll(() => window.evaluate(() => [innerWidth, innerHeight]))
        .toEqual(native.content)
      await window.locator('input[aria-label="Mask brush size"]').scrollIntoViewIfNeeded()
      await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
      await screenshot(`painted-mask-tools-${size.join('x')}`)
      const measured = await window.evaluate(() => {
        const rect = (element) => {
          const value = element.getBoundingClientRect()
          return {
            left: value.left,
            right: value.right,
            top: value.top,
            bottom: value.bottom,
            width: value.width,
            height: value.height,
          }
        }
        const visible = (element) => {
          const value = rect(element)
          const style = getComputedStyle(element)
          return (
            value.width > 0 &&
            value.height > 0 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            !element.closest('[aria-hidden="true"]')
          )
        }
        const selectors = [
          '.project-settings',
          '.settings-scroll',
          '.layer-stack',
          '.tool-rail',
          '.mask-settings',
        ]
        const panels = selectors
          .map((selector) => document.querySelector(selector))
          .filter(visible)
          .map((element) => ({
            name: element.className,
            rect: rect(element),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          }))
        const area = rect(document.querySelector('.canvas-area'))
        const railButtons = [...document.querySelectorAll('.tool-rail button')]
          .filter(visible)
          .map((element) => ({ name: element.getAttribute('aria-label'), rect: rect(element) }))
        const maskPanel = document.querySelector('[aria-label="Smart Patch mask"]')
        const maskControls = [...maskPanel.querySelectorAll('input, button, .n-base-selection')]
          .filter(visible)
          .map((element) => ({
            name: element.getAttribute('aria-label') ?? element.textContent.trim(),
            rect: rect(element),
            container: rect(
              element.closest('.n-input-number, .n-input, .n-base-selection') ?? element,
            ),
          }))
        return {
          viewport: { width: innerWidth, height: innerHeight },
          area,
          panels,
          maskSection: rect(maskPanel),
          railButtons,
          maskControls,
        }
      })
      report.layouts.push({ requestedOuter: size, native, ...measured })
      checkpoint()
      const epsilon = 2
      for (const panel of measured.panels)
        assert.ok(
          panel.scrollWidth <= panel.clientWidth + epsilon,
          `${panel.name} must not overflow horizontally at ${size.join('x')}`,
        )
      for (const button of measured.railButtons)
        assert.ok(
          button.rect.left >= measured.area.left - epsilon &&
            button.rect.right <= measured.area.right + epsilon &&
            button.rect.top >= measured.area.top - epsilon &&
            button.rect.bottom <= measured.area.bottom + epsilon,
          `${button.name} must remain reachable inside Canvas`,
        )
      for (const control of measured.maskControls)
        assert.ok(
          control.rect.left >= measured.maskSection.left - epsilon &&
            control.rect.right <= measured.maskSection.right + epsilon &&
            control.container.left >= measured.maskSection.left - epsilon &&
            control.container.right <= measured.maskSection.right + epsilon,
          `${control.name} must fit its Mask section`,
        )
      assert.ok(
        measured.maskControls.some(
          (control) =>
            control.name === 'Mask brush size' &&
            control.rect.top >= -epsilon &&
            control.rect.bottom <= measured.viewport.height + epsilon,
        ),
      )
      const stack = measured.panels.find(({ name }) => name === 'layer-stack')
      assert.ok(
        stack.rect.left >= -epsilon &&
          stack.rect.right <= measured.viewport.width + epsilon &&
          stack.rect.top >= -epsilon &&
          stack.rect.bottom <= measured.viewport.height + epsilon,
      )
      await barrier()
      assert.deepEqual(exactState(await current()), baseline)
      assert.equal((await commands()).length, commandCount)
      check(
        `Painted-mask native ${size.join('x')}: real rail/buttons/Mask controls fit; viewport resize changes no document/history`,
      )
    }
  } finally {
    report.layoutRestoredWindow = await application.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows()[0]
      main.setSize(1440, 900)
      return { outer: main.getSize(), content: main.getContentSize() }
    })
    await expect
      .poll(() => window.evaluate(() => [innerWidth, innerHeight]))
      .toEqual(report.layoutRestoredWindow.content)
    checkpoint()
  }
}

// Narrow operations shared with transform qualification; Main/pixel replies remain genuine.
function transformContext() {
  return {
    at,
    assertNormal,
    barrier,
    canvas,
    check,
    commands,
    content,
    current,
    editRequest,
    exactState,
    history,
    maskPixels,
    nativeFrames,
    patch,
    patchAId,
    patchBId,
    projectId,
    rawApi,
    refusal,
    settingsCommands,
    settingsDiagnostic,
    settingsRefusal,
    resizeNative,
    screenshot,
    select,
    tool,
    window: () => window,
    worldPoint,
  }
}

// A PNG-standard decoder local to this oracle; production mask/PNG helpers are not imported.
function decodedPng(bytes) {
  assert.ok(
    bytes.length < 1024 * 1024 &&
      bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  )
  let width, height
  const blocks = []
  let ended = false
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset)
    const tag = bytes.toString('ascii', offset + 4, offset + 8)
    const end = offset + 12 + length
    assert.ok(end <= bytes.length)
    assert.equal(crc32(bytes.subarray(offset + 4, end - 4)), bytes.readUInt32BE(end - 4))
    const data = bytes.subarray(offset + 8, end - 4)
    if (tag === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      assert.deepEqual([...data.subarray(8)], [8, 6, 0, 0, 0])
    }
    if (tag === 'IDAT') blocks.push(data)
    if (tag === 'IEND') {
      assert.equal(end, bytes.length)
      ended = true
    }
    offset = end
  }
  assert.ok(
    ended && width > 0 && height > 0 && width * height < 100_000,
    'Native fixture remains small',
  )
  const stride = width * 4
  const rows = inflateSync(Buffer.concat(blocks), { maxOutputLength: (stride + 1) * height })
  assert.equal(rows.length, (stride + 1) * height)
  const rgba = Buffer.alloc(stride * height)
  const paeth = (a, b, c) => {
    const p = a + b - c
    const d = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
    return d[0] <= d[1] && d[0] <= d[2] ? a : d[1] <= d[2] ? b : c
  }
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (stride + 1)]
    assert.ok(filter <= 4)
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x
      const left = x < 4 ? 0 : rgba[index - 4]
      const up = y === 0 ? 0 : rgba[index - stride]
      const corner = y === 0 || x < 4 ? 0 : rgba[index - stride - 4]
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, corner)][filter]
      rgba[index] = (rows[y * (stride + 1) + 1 + x] + predictor) & 255
    }
  }
  const alpha = Buffer.alloc(width * height)
  for (let i = 0; i < alpha.length; i++) {
    assert.ok(
      rgba[i * 4] === 255 && rgba[i * 4 + 1] === 255 && rgba[i * 4 + 2] === 255,
      'Stored mask RGB must be white even at zero coverage',
    )
    alpha[i] = rgba[i * 4 + 3]
  }
  return { width, height, alpha, rgba }
}
async function chromiumAlpha(bytes) {
  const result = await window.evaluate(async (encoded) => {
    const image = new Image()
    image.src = `data:image/png;base64,${encoded}`
    await image.decode()
    const target = document.createElement('canvas')
    target.width = image.naturalWidth
    target.height = image.naturalHeight
    const context = target.getContext('2d')
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, target.width, target.height).data
    return {
      width: target.width,
      height: target.height,
      alpha: [...pixels.filter((_, index) => index % 4 === 3)],
    }
  }, bytes.toString('base64'))
  return { ...result, alpha: Buffer.from(result.alpha) }
}
async function maskPixels(layer, label, supplied) {
  assert.ok(layer.mask.asset && layer.maskImageUrl)
  const bytes =
    supplied ??
    Buffer.from(
      await window.evaluate(async (url) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Mask image refused: ${response.status}`)
        return [...new Uint8Array(await response.arrayBuffer())]
      }, layer.maskImageUrl),
    )
  assert.equal(bytes.length, layer.mask.asset.bytes)
  assert.equal(digest(bytes), layer.mask.asset.sha256)
  const decoded = decodedPng(bytes)
  const browser = await chromiumAlpha(bytes)
  assert.equal(decoded.width, layer.mask.asset.width)
  assert.equal(decoded.height, layer.mask.asset.height)
  assert.deepEqual([browser.width, browser.height], [decoded.width, decoded.height])
  assert.ok(
    browser.alpha.equals(decoded.alpha),
    'Independent Chromium and PNG-standard alpha decoders disagree',
  )
  assert.deepEqual(
    [decoded.width, decoded.height],
    [layer.mask.bounds.width, layer.mask.bounds.height],
  )
  const { width, height, alpha } = decoded
  assert.ok(
    alpha.subarray(0, width).some(Boolean) &&
      alpha.subarray((height - 1) * width).some(Boolean) &&
      Array.from({ length: height }, (_, y) => alpha[y * width]).some(Boolean) &&
      Array.from({ length: height }, (_, y) => alpha[y * width + width - 1]).some(Boolean),
    'Stored mask bounds must be tight',
  )
  const pngFile = path.join(evidenceRoot, `${label}.png`)
  writeFileSync(pngFile, bytes, { flag: 'wx', mode: 0o600 })
  report.masks.push({
    label,
    layerId: layer.id,
    mask: layer.mask,
    pngFile,
    pngSha256: digest(bytes),
    alphaSha256: digest(alpha),
  })
  checkpoint()
  return { ...decoded, bytes, bounds: layer.mask.bounds }
}
const at = (image, x, y) =>
  x < image.bounds.x ||
  y < image.bounds.y ||
  x >= image.bounds.x + image.width ||
  y >= image.bounds.y + image.height
    ? 0
    : image.alpha[(y - image.bounds.y) * image.width + x - image.bounds.x]
function pixelsEqual(actual, expected, message) {
  assert.deepEqual(actual.bounds, expected.bounds, message)
  assert.ok(actual.alpha.equals(expected.alpha) && actual.bytes.equals(expected.bytes), message)
}
async function saveProject(label) {
  const before = await current()
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await current()).dirty).toBe(false)
  await expect(window.locator('.document-state')).toHaveText('Saved')
  const saved = await readIgsPackage(packagePath)
  assert.deepEqual(saved.project.primaryBbox, before.primaryBbox)
  assert.deepEqual(saved.project.generationDraft, before.generationDraft)
  assert.equal(saved.manifest.preview.status, 'unavailable')
  assert.deepEqual(
    saved.manifest.preview.rect,
    { x: 0, y: 0, width: 2, height: 2 },
    'Authored mask bounds/overlay must not expand the actual Raster preview input',
  )
  assert.ok((await saved.readMember(rasterMember)).equals(rasterPng))
  const masks = {}
  for (const id of [patchAId, patchBId]) {
    const stored = saved.project.layers.find((layer) => layer.id === id)
    const acknowledged = patch(before, id)
    assert.deepEqual(stored.mask, acknowledged.mask)
    assert.deepEqual(stored.boundingBox, acknowledged.boundingBox)
    const bytes = await saved.readMember(stored.mask.asset.path)
    masks[id] = await maskPixels(acknowledged, `${label}-${id}`, bytes)
    const manifestRef = saved.manifest.members.find(
      (member) => member.path === stored.mask.asset.path,
    )
    assert.equal(manifestRef.sha256, digest(bytes))
    assert.equal(manifestRef.bytes, bytes.length)
  }
  if (withSettings) await assertMaskSettingsStored(transformContext(), saved.project, label)
  const file = path.join(evidenceRoot, `${label}.igs`)
  writeFileSync(file, readFileSync(packagePath), { flag: 'wx', mode: 0o600 })
  check(
    `${label}: real UI Save/raw PNG and manifest readback retain both masks and Raster bytes with workerless preview`,
    { file, packageSha256: digest(readFileSync(packagePath)), project: saved.project },
  )
  return { saved, masks }
}
function editRequest(tab, id, edit) {
  const owner = patch(tab, id)
  return {
    documentId: tab.documentId,
    documentRevision: tab.documentRevision,
    maskId: owner.mask.id,
    maskRevision: owner.mask.revision,
    edit,
  }
}
async function refusal(label, id, request, codes) {
  const before = await current()
  const savedBytes = readFileSync(packagePath)
  const result = await rawApi('projects', 'editSmartPatchMask', projectId, id, request)
  assert.equal(result.ok, false, label)
  assert.ok(codes.includes(result.error.code), JSON.stringify(result))
  await barrier()
  assert.deepEqual(exactState(await current()), exactState(before))
  assert.ok(readFileSync(packagePath).equals(savedBytes))
  check(`Main mask refusal: ${label}; Project/history/saved package unchanged`, {
    code: result.error.code,
  })
}
async function settingsRefusal(label, id, request, code) {
  const before = await current()
  const savedBytes = readFileSync(packagePath)
  const result = await rawApi('projects', 'updateSmartPatchLayer', projectId, id, request)
  assert.equal(result.ok, false, label)
  assert.equal(result.error.code, code, JSON.stringify(result))
  await barrier()
  assert.deepEqual(exactState(await current()), exactState(before))
  assert.ok(readFileSync(packagePath).equals(savedBytes))
  check(`Main settings refusal: ${label}; Project/history/saved package unchanged`, {
    code: result.error.code,
  })
}
async function history(action) {
  await expect(
    canvas().getByRole('button', { name: action === 'undo' ? 'Undo' : 'Redo', exact: true }),
  ).toBeEnabled()
  const before = await current()
  await window.getByRole('button', { name: 'Edit menu', exact: true }).click()
  await window
    .getByText(action === 'undo' ? 'Undo · Ctrl+Z' : 'Redo · Ctrl+Shift+Z / Ctrl+Y', {
      exact: true,
    })
    .click()
  await expect
    .poll(async () => (await current()).documentRevision)
    .not.toBe(before.documentRevision)
  await expect(window.getByRole('button', { name: 'Save Project', exact: true })).toBeEnabled()
  await barrier()
  return await current()
}
async function nativeImportFile(file) {
  await application.evaluate(({ dialog }, selected) => {
    if (globalThis.igsMaskChooserOriginal) throw new Error('Chooser already owned.')
    globalThis.igsMaskChooserOriginal = dialog.showOpenDialog
    globalThis.igsMaskChooserCalls = 0
    dialog.showOpenDialog = async () => {
      globalThis.igsMaskChooserCalls++
      return { canceled: false, filePaths: [selected] }
    }
  }, file)
  try {
    const result = await rawApi('projects', 'selectImport')
    assert.equal(await application.evaluate(() => globalThis.igsMaskChooserCalls), 1)
    return result
  } finally {
    const restored = await application.evaluate(({ dialog }) => {
      const original = globalThis.igsMaskChooserOriginal
      dialog.showOpenDialog = original
      delete globalThis.igsMaskChooserOriginal
      delete globalThis.igsMaskChooserCalls
      return dialog.showOpenDialog === original
    })
    assert.equal(restored, true)
  }
}
async function corruptImport(saved, layer) {
  const original = readFileSync(packagePath)
  const before = exactState(await current())
  const zip = new yazl.ZipFile()
  const chunks = []
  const finished = new Promise((resolve, reject) => {
    zip.outputStream.on('data', (chunk) => chunks.push(chunk))
    zip.outputStream.on('end', resolve)
    zip.outputStream.on('error', reject)
  })
  zip.addBuffer(Buffer.from(IGS_MIMETYPE), 'mimetype', { compress: false })
  zip.addBuffer(Buffer.from(JSON.stringify(saved.manifest)), 'manifest.json', { compress: false })
  for (const member of saved.manifest.members) {
    let bytes = await saved.readMember(member.path)
    if (member.path === layer.mask.asset.path) {
      bytes = Buffer.from(bytes)
      bytes[bytes.length - 1] ^= 1
    }
    zip.addBuffer(bytes, member.path)
  }
  zip.end()
  await finished
  const corruptFile = path.join(fixtureRoot, 'owned-corrupt-mask.igs')
  writeFileSync(corruptFile, Buffer.concat(chunks), { flag: 'wx', mode: 0o600 })
  await assert.rejects(readIgsPackage(corruptFile))
  const result = await nativeImportFile(corruptFile)
  assert.equal(result.ok, false, 'Actual native import must refuse corrupted mask bytes')
  await barrier()
  assert.deepEqual(exactState(await current()), before)
  assert.ok(readFileSync(packagePath).equals(original))
  assert.equal((await api('projects', 'list')).length, 1)
  const control = await nativeImportFile(packagePath)
  assert.equal(control.ok, true, JSON.stringify(control))
  assert.equal(control.value.kind, 'opened')
  assert.equal(control.value.result.kind, 'opened')
  assert.equal(control.value.result.tab.id, projectId)
  await barrier()
  assert.deepEqual(exactState(await current()), before)
  assert.ok(readFileSync(packagePath).equals(original))
  check(
    'Real preload/Main Import refuses an owned corrupted mask package; chooser restored and original Project remains exact',
    {
      code: result.error.code,
      validImportNeighbor: control.value.kind,
      corruptPackageSha256: digest(readFileSync(corruptFile)),
      corruption: 'one mask PNG CRC byte differs; original manifest/hash retained',
    },
  )
}

checkpoint()
try {
  await launch('painted-mask')
  await window
    .getByLabel('Workspace navigation')
    .getByRole('button', { name: 'New Project', exact: true })
    .click()
  const modal = window.getByRole('dialog', { name: 'New Project', exact: true })
  await modal.getByRole('textbox', { name: 'Project name', exact: true }).fill(title)
  await modal.locator('input[aria-label="Project width"]').fill('256')
  await modal.locator('input[aria-label="Project height"]').fill('256')
  await modal.getByRole('button', { name: 'Create Project', exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
  await nativeFrames()
  await expect(modal).toBeHidden()
  const created = await api('projects', 'list')
  assert.equal(created.length, 1)
  projectId = created[0].id
  report.projectId = projectId
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await current()).dirty).toBe(false)
  packagePath = (
    await database.db
      .selectFrom('project_index')
      .select('canonical_path')
      .where('local_project_key', '=', projectId)
      .executeTakeFirstOrThrow()
  ).canonical_path
  report.packagePath = packagePath
  await closeProject()
  const seed = await readIgsPackage(packagePath)
  const raster = {
    asset: {
      bytes: rasterPng.length,
      height: 2,
      path: rasterMember,
      sha256: digest(rasterPng),
      width: 2,
    },
    blendMode: 'normal',
    id: rasterId,
    kind: 'raster',
    locked: false,
    name: 'Preserved Raster',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
    visible: true,
  }
  await saveIgsPackage(packagePath, {
    assets: { [rasterMember]: { bytes: rasterPng } },
    preview: {
      merged: await seed.readMember('preview/merged.png'),
      thumbnail: await seed.readMember('preview/thumbnail.webp'),
      status: 'unavailable',
      rect: { x: 0, y: 0, width: 2, height: 2 },
    },
    project: { ...seed.project, documentRevision: randomUUID(), layers: [raster] },
  })
  await openProject()
  normal = await current()
  rasterBefore = normal.layers.find(({ id }) => id === rasterId)
  for (const slot of ['A', 'B']) {
    const ids = new Set((await current()).layers.map(({ id }) => id))
    await window.getByRole('button', { name: 'Add Smart Patch Layer', exact: true }).click()
    await expect.poll(async () => (await current()).layers.length).toBe(ids.size + 1)
    const added = (await current()).layers.find(({ id }) => !ids.has(id))
    assert.equal(added.kind, 'smart-patch')
    if (slot === 'A') patchAId = added.id
    else patchBId = added.id
    assert.deepEqual(added.mask, { id: added.mask.id, asset: null, revision: 0 })
  }
  await select(patchAId)
  await diameter(20)
  const pristineB = layerContent(patch(await current(), patchBId))
  let state = await gesture('Brush tool', [{ x: -40, y: 32 }])
  const aFirst = await maskPixels(patch(state, patchAId), 'a-brush-outside-bbox')
  assert.equal(at(aFirst, -40, 32), 255)
  assert.equal(at(aFirst, -20, 32), 0)
  assert.ok(
    aFirst.alpha.some((value) => value > 0 && value < 255),
    'The painted brush must retain its antialiased edge',
  )
  assert.ok(aFirst.bounds.x + aFirst.width < patch(state, patchAId).boundingBox.x)
  assert.deepEqual(layerContent(patch(state, patchBId)), pristineB)
  assertNormal(state)
  const oldMaskUrl = patch(state, patchAId).maskImageUrl
  check(
    'Actual Brush publishes white-RGB alpha PNG outside the owned bbox without touching B/normal/Raster',
  )
  await overlayControl()
  await select(patchBId)
  state = await gesture(
    'Polygon Lasso tool',
    withTransform
      ? [
          { x: 40, y: 40 },
          { x: 100, y: 40 },
          { x: 100, y: 80 },
          { x: 80, y: 80 },
          { x: 80, y: 100 },
          { x: 40, y: 100 },
        ]
      : [
          { x: 40, y: 40 },
          { x: 100, y: 40 },
          { x: 100, y: 100 },
          { x: 40, y: 100 },
        ],
    true,
  )
  const bPolygon = await maskPixels(patch(state, patchBId), 'b-polygon')
  assert.equal(at(bPolygon, 70, 70), 255)
  assert.equal(at(bPolygon, 30, 70), 0)
  const beforeErase = content(state)
  await window.getByRole('button', { name: 'Clear Project History', exact: true }).click()
  await window.getByRole('button', { name: 'Clear history', exact: true }).click()
  await expect.poll(async () => (await current()).canUndo).toBe(false)
  state = await gesture('Eraser tool', [{ x: 70, y: 70 }])
  const bErased = await maskPixels(patch(state, patchBId), 'b-erased')
  assert.equal(at(bErased, 70, 70), 0)
  assert.equal(at(bErased, 50, 50), 255)
  const afterErase = content(state)
  state = await history('undo')
  assert.deepEqual(content(state), beforeErase)
  assert.equal(state.canUndo, false)
  pixelsEqual(
    await maskPixels(patch(state, patchBId), 'b-undo'),
    bPolygon,
    'One Undo must restore the entire previous mask',
  )
  state = await history('redo')
  assert.deepEqual(content(state), afterErase)
  assert.equal(state.canRedo, false)
  pixelsEqual(
    await maskPixels(patch(state, patchBId), 'b-redo'),
    bErased,
    'One Redo must restore the complete eraser result',
  )
  assertNormal(state)
  check(
    'One real Eraser gesture makes an interior hole; one Undo/Redo restores exact whole PNG/alpha and owned metadata',
  )
  state = await gesture('Lasso tool', [
    { x: 120, y: 40 },
    { x: 160, y: 40 },
    { x: 160, y: 80 },
    { x: 120, y: 80 },
    { x: 120, y: 40 },
  ])
  let bLasso = await maskPixels(patch(state, patchBId), 'b-lasso')
  assert.equal(at(bLasso, 140, 60), 255)
  assert.equal(at(bLasso, 110, 60), 0)
  assert.equal(at(bLasso, 70, 70), 0)
  check('Actual Lasso adds a distinct region while retaining the prior polygon and erased hole')
  await window.getByLabel('Mask lasso operation', { exact: true }).click()
  await window
    .locator('.n-base-select-option')
    .filter({ hasText: /^Subtract from mask$/ })
    .click()
  state = await gesture(
    'Polygon Lasso tool',
    [
      { x: 130, y: 50 },
      { x: 150, y: 50 },
      { x: 150, y: 70 },
      { x: 130, y: 70 },
    ],
    true,
    'subtract',
  )
  bLasso = await maskPixels(patch(state, patchBId), 'b-polygon-subtract')
  assert.equal(at(bLasso, 140, 60), 0)
  assert.equal(at(bLasso, 125, 45), 255)
  assert.equal(at(bLasso, 70, 70), 0)
  await window.getByLabel('Mask lasso operation', { exact: true }).click()
  await window
    .locator('.n-base-select-option')
    .filter({ hasText: /^Add to mask$/ })
    .click()
  check(
    'Real Lasso operation selector sends Polygon Subtract to Main and clears only the selected interior',
  )
  const beforeClear = content(state)
  await window.getByRole('button', { name: 'Clear mask', exact: true }).click()
  await expect.poll(async () => patch(await current(), patchBId).mask.asset).toBe(null)
  state = await history('undo')
  assert.deepEqual(content(state), beforeClear)
  pixelsEqual(
    await maskPixels(patch(state, patchBId), 'b-clear-undo'),
    bLasso,
    'Clear Undo retains complete owned pixels',
  )
  check('Actual Clear mask removes coverage; Undo restores the complete retained asset')
  await select(patchAId)
  await canvas().getByLabel('Canvas zoom', { exact: true }).click()
  await window
    .locator('.n-base-select-option')
    .filter({ hasText: /^200%$/ })
    .click()
  await tool('Pan tool')
  const panStart = await worldPoint({ x: 20, y: 10 })
  await window.mouse.move(panStart.x, panStart.y)
  await window.mouse.down()
  await window.mouse.move(panStart.x + 25, panStart.y + 15, { steps: 3 })
  await window.mouse.up()
  state = await gesture('Brush tool', [{ x: -20, y: 60 }])
  const aZoomed = await maskPixels(patch(state, patchAId), 'a-zoom-pan-brush')
  assert.equal(at(aZoomed, -40, 32), 255)
  assert.equal(at(aZoomed, -20, 60), 255)
  assert.equal(at(aZoomed, 0, 60), 0)
  pixelsEqual(
    await maskPixels(patch(state, patchBId), 'b-after-a-zoom'),
    bLasso,
    'Zoomed A editing cannot rewrite B',
  )
  assertNormal(state)
  const staleUrl = await window.evaluate(async (url) => {
    const response = await fetch(url)
    return { ok: response.ok, status: response.status }
  }, oldMaskUrl)
  assert.equal(staleUrl.ok, false)
  check(
    'Zoom/pan authoring preserves literal project coordinates and rejects the previous signed mask revision',
    { staleStatus: staleUrl.status },
  )
  const maskBeforeBbox = structuredClone(patch(state, patchAId).mask)
  await canvas().getByRole('button', { name: 'Bounding Box tool', exact: true }).click()
  await canvas().locator('.canvas-area').focus()
  await canvas().locator('.canvas-area').press('ArrowRight')
  await expect.poll(async () => patch(await current(), patchAId).boundingBox.x).toBe(1)
  state = await current()
  assert.deepEqual(patch(state, patchAId).mask, maskBeforeBbox)
  pixelsEqual(
    await maskPixels(patch(state, patchAId), 'a-after-bbox'),
    aZoomed,
    'BBox movement cannot transform/crop the mask',
  )
  assertNormal(state)
  check(
    'Direct owned BBox movement leaves independently positioned mask bytes/bounds/revision unchanged',
  )
  await tool('Brush tool')
  const beforeCancel = exactState(await current())
  const countBeforeCancel = (await commands()).length
  const cancelStart = await worldPoint({ x: 10, y: 100 })
  await window.mouse.move(cancelStart.x, cancelStart.y)
  await window.mouse.down()
  await window.mouse.move(cancelStart.x + 8, cancelStart.y + 4, { steps: 2 })
  await canvas().locator('.canvas-area').press('Escape')
  await window.mouse.up()
  await barrier()
  assert.equal((await commands()).length, countBeforeCancel)
  assert.deepEqual(exactState(await current()), beforeCancel)
  check(
    'Escape followed by terminal pointerup cancels the active gesture without a Main command or history/document mutation',
  )
  const beforeOwnerCancel = exactState(await current())
  const ownerCancelCount = (await commands()).length
  await tool('Polygon Lasso tool')
  for (const point of [
    { x: -15, y: 100 },
    { x: 5, y: 100 },
    { x: 5, y: 120 },
  ]) {
    const screen = await worldPoint(point)
    await window.mouse.click(screen.x, screen.y)
  }
  await select(patchBId)
  await canvas().locator('.canvas-area').press('Enter')
  await barrier()
  assert.equal((await commands()).length, ownerCancelCount)
  assert.deepEqual(exactState(await current()), beforeOwnerCancel)
  check(
    'Actual owner switch cancels an uncommitted valid polygon; terminal Enter cannot publish it to either Patch',
  )
  await select(patchAId)
  const baseline = await current()
  const request = editRequest(baseline, patchAId, {
    kind: 'brush',
    operation: 'add',
    diameter: 20,
    points: [{ x: 10, y: 100 }],
  })
  for (const [label, change] of [
    ['stale document', { documentRevision: normal.documentRevision }],
    ['foreign document', { documentId: randomUUID() }],
    ['foreign mask', { maskId: randomUUID() }],
    ['stale mask revision', { maskRevision: request.maskRevision + 1 }],
  ])
    await refusal(label, patchAId, { ...request, ...change }, ['EDIT_CONFLICT'])
  await refusal('missing target', randomUUID(), request, ['PROJECT_LAYER_NOT_FOUND'])
  await refusal('Raster target', rasterId, request, ['PROJECT_LAYER_NOT_FOUND'])
  await refusal(
    'invalid diameter',
    patchAId,
    { ...request, edit: { ...request.edit, diameter: 0 } },
    ['IPC_INVALID_CALLER'],
  )
  await refusal(
    'renderer cannot inject an asset path or pixels',
    patchAId,
    { ...request, asset: { path: '/outside-owned/mask.png', pixels: [255] } },
    ['IPC_INVALID_CALLER'],
  )
  await refusal(
    'too many points',
    patchAId,
    {
      ...request,
      edit: { ...request.edit, points: Array.from({ length: 8193 }, () => ({ x: 0, y: 0 })) },
    },
    ['IPC_INVALID_CALLER'],
  )
  await refusal(
    'oversized sparse bounds',
    patchAId,
    {
      ...request,
      edit: {
        ...request.edit,
        points: [
          { x: 0, y: 0 },
          { x: 5000, y: 0 },
        ],
      },
    },
    ['MASK_LIMIT'],
  )
  await refusal(
    'pixel-area ceiling',
    patchAId,
    {
      ...request,
      edit: {
        ...request.edit,
        points: [
          { x: 0, y: 0 },
          { x: 2000, y: 2000 },
        ],
      },
    },
    ['MASK_LIMIT'],
  )
  const workCorners = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
    { x: 0, y: 1000 },
  ]
  await refusal(
    'bounded work ceiling before raster allocation',
    patchAId,
    {
      ...request,
      edit: {
        kind: 'polygon',
        operation: 'add',
        points: Array.from({ length: 8192 }, (_, i) => workCorners[i % 4]),
      },
    },
    ['MASK_LIMIT'],
  )
  const aName = patch(await current(), patchAId).name
  const aCard = window.locator(`[data-layer-id="${patchAId}"]`)
  await aCard.getByRole('button', { name: `Lock ${aName}`, exact: true }).click()
  await expect.poll(async () => patch(await current(), patchAId).locked).toBe(true)
  await refusal('locked target', patchAId, editRequest(await current(), patchAId, request.edit), [
    'PROJECT_LAYER_LOCKED',
  ])
  await expect(canvas().getByRole('button', { name: 'Brush tool', exact: true })).toBeDisabled()
  await expect(canvas().getByRole('button', { name: 'Pan tool', exact: true })).toBeEnabled()
  await aCard.getByRole('button', { name: `Unlock ${aName}`, exact: true }).click()
  await expect.poll(async () => patch(await current(), patchAId).locked).toBe(false)
  await aCard.getByRole('button', { name: `Hide ${aName}`, exact: true }).click()
  await expect.poll(async () => patch(await current(), patchAId).visible).toBe(false)
  await refusal('hidden target', patchAId, editRequest(await current(), patchAId, request.edit), [
    'PROJECT_LAYER_HIDDEN',
  ])
  await aCard.getByRole('button', { name: `Show ${aName}`, exact: true }).click()
  await expect.poll(async () => patch(await current(), patchAId).visible).toBe(true)
  if (withTransform) bLasso = await runMaskTransformBeforeSave(transformContext())
  if (withSettings) await runMaskSettingsBeforeSave(transformContext())
  await nativeLayouts()
  const firstSave = await saveProject('painted-masks-saved')
  const savedContent = content(await current())
  const savedBytes = readFileSync(packagePath)
  await closeProject()
  await openProject()
  state = await current()
  assert.deepEqual(content(state), savedContent)
  assertNormal(state)
  for (const id of [patchAId, patchBId])
    pixelsEqual(
      await maskPixels(patch(state, id), `reopened-${id}`),
      firstSave.masks[id],
      'Native reopened pixels must equal the saved mask',
    )
  check(
    'Real clean close/reopen resolves both saved masks through exact current signed image capabilities',
  )
  if (withSettings) await assertMaskSettingsReopened(transformContext(), false)
  await corruptImport(firstSave.saved, patch(state, patchAId))
  await select(patchAId)
  await diameter(20)
  state = await gesture('Brush tool', [{ x: 10, y: 100 }])
  let dirtyPixels = await maskPixels(patch(state, patchAId), 'a-unsaved-recovery')
  assert.equal(at(dirtyPixels, 10, 100), 255)
  if (withTransform) {
    dirtyPixels = await runMaskTransformRecovery(transformContext())
    state = await current()
  }
  if (withSettings) {
    await runMaskSettingsRecovery(transformContext())
    state = await current()
  }
  const dirtyContent = content(state)
  assert.ok(readFileSync(packagePath).equals(savedBytes))
  const shadowFile = path.join(appDataRoot, 'autosave', projectId, 'manifest.json')
  await expect
    .poll(() => {
      if (!existsSync(shadowFile)) return null
      const manifest = JSON.parse(readFileSync(shadowFile, 'utf8'))
      if (manifest.state !== 'dirty') return null
      const snapshot = path.join(path.dirname(shadowFile), 'snapshots', manifest.snapshotId)
      const projectFile = path.join(snapshot, 'project.json')
      if (!existsSync(projectFile)) return null
      const bytes = readFileSync(projectFile)
      if (digest(bytes) !== manifest.documentHash) return null
      const doc = JSON.parse(bytes)
      if (doc.documentRevision !== manifest.documentRevision) return null
      const owned = doc.layers.find(({ id }) => id === patchAId)
      if (withSettings)
        for (const id of [patchAId, patchBId])
          if (
            JSON.stringify(doc.layers.find((layer) => layer.id === id).maskSettings) !==
            JSON.stringify(patch(state, id).maskSettings)
          )
            return null
      const image = path.join(snapshot, owned.mask.asset.path)
      if (!existsSync(image)) return null
      return digest(readFileSync(image)) === patch(state, patchAId).mask.asset.sha256
        ? manifest.documentRevision
        : null
    })
    .toBe(state.documentRevision)
  report.crashShadow = JSON.parse(readFileSync(shadowFile, 'utf8'))
  checkpoint()
  await bounds('before-own-crash')
  await restoreObserver('before-own-crash')
  await database.close()
  database = null
  const child = application.process()
  const identity = nativeChecks.at(-1).nativeIdentity
  assert.equal(child.pid, identity.pid)
  assert.equal(child.exitCode, null)
  const stat = readFileSync(`/proc/${child.pid}/stat`, 'utf8')
  assert.equal(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19], identity.start)
  const exited = new Promise((resolve) => child.once('exit', resolve))
  assert.equal(child.kill('SIGKILL'), true)
  await exited
  const physical = await confirmQualificationProcessExit(nativeChecks)
  assert.equal(physical.confirmed, true)
  report.nativeClosures.push({ label: 'own-crash', ...physical })
  application = null
  window = null
  checkpoint()
  await launch('recovery')
  await window.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  const recovery = window.getByRole('dialog', { name: 'Recovery available', exact: true })
  await expect(recovery).toBeVisible()
  assert.ok(readFileSync(packagePath).equals(savedBytes))
  await recovery.getByRole('button', { name: 'Recover', exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
  await nativeFrames()
  await expect(recovery).toBeHidden()
  state = await current()
  assert.equal(state.dirty, true)
  assert.equal(state.canUndo, false)
  assert.equal(state.canRedo, false)
  assert.deepEqual(content(state), dirtyContent)
  assertNormal(state)
  pixelsEqual(
    await maskPixels(patch(state, patchAId), 'a-recovered'),
    dirtyPixels,
    'Actual crash recovery must retain the new unpublished mask bytes',
  )
  pixelsEqual(
    await maskPixels(patch(state, patchBId), 'b-recovered'),
    bLasso,
    'Recovery must preserve the untouched other owner',
  )
  assert.ok(readFileSync(packagePath).equals(savedBytes))
  check(
    'Actual dirty shadow asset→owned process death→Home Recover retains both masks while saved package stays exact',
  )
  if (withSettings) await assertMaskSettingsReopened(transformContext(), true)
  await select(patchAId)
  const finalSave = await saveProject('painted-masks-recovered')
  await closeProject()
  await openProject()
  state = await current()
  assert.deepEqual(content(state), dirtyContent)
  assertNormal(state)
  for (const id of [patchAId, patchBId])
    pixelsEqual(
      await maskPixels(patch(state, id), `final-reopen-${id}`),
      finalSave.masks[id],
      'Recovered explicit Save must publish reopenable exact mask bytes',
    )
  if (withSettings) await assertMaskSettingsReopened(transformContext(), true)
  assert.deepEqual(await api('models', 'getCatalog'), [])
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  assert.equal(
    (await database.db.selectFrom('generation_queue_item').select('id').execute()).length,
    0,
  )
  assert.equal((await api('projects', 'getAcceptedResultHistory')).items.length, 0)
  assert.deepEqual(report.pageErrors, [])
  await closeProject()
  await closeNative('final')
  report.finalSourceSha256 = hashFiles(sourceFiles)
  assert.deepEqual(report.finalSourceSha256, report.sourceSha256)
  report.outcome = 'passed'
  report.completedAt = new Date().toISOString()
  checkpoint()
} catch (error) {
  report.outcome = 'failed'
  report.error = { message: String(error), stack: error?.stack }
  checkpoint()
  if (window && !window.isClosed())
    try {
      report.failureUiState = await window.evaluate(() => ({
        visibility: document.visibilityState,
        dialogs: [...document.querySelectorAll('[role="dialog"]')].map((element) => {
          const style = getComputedStyle(element)
          return {
            name: element.getAttribute('aria-label'),
            classes: element.className,
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            transitionDuration: style.transitionDuration,
            animations: element.getAnimations().map((animation) => ({
              playState: animation.playState,
              currentTime: animation.currentTime,
              timing: animation.effect?.getComputedTiming(),
            })),
          }
        }),
      }))
      checkpoint()
      await screenshot('failure-before-cleanup')
    } catch (shotError) {
      report.failureScreenshotError = String(shotError)
      checkpoint()
    }
  throw error
} finally {
  if (application) {
    try {
      if (
        projectId &&
        window &&
        !window.isClosed() &&
        (await window.getByRole('tab', { name: title, exact: true }).count())
      )
        await closeProject(true)
    } catch (error) {
      report.uiCleanupError = String(error)
      checkpoint()
    }
    try {
      await closeNative('failure-cleanup')
    } catch (error) {
      report.outcome = 'failed'
      report.cleanupError = String(error)
      checkpoint()
      process.exitCode = 1
    }
  }
  if (database) {
    await database.close()
    database = null
  }
}
