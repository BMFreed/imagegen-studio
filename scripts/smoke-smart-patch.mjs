/** Built Electron Smart Patch owned-state/storage foundation. No worker, models or inference. */
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
import { crc32, deflateSync } from 'node:zlib'

import { _electron as electron, expect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage, saveIgsPackage } from '../src/main/projects/igs-package.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4, 'Use --report-file ABSOLUTE_NEW_OWNED_REPORT')
assert.equal(process.argv[2], '--report-file')
const reportFile = process.argv[3]
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Report destination must be absent')
const evidenceRoot = path.dirname(reportFile)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const relativeEvidence = path.relative(artifactRoot, evidenceRoot)
assert.ok(
  relativeEvidence && !relativeEvidence.startsWith('..') && !path.isAbsolute(relativeEvidence),
)
assert.equal(realpathSync(evidenceRoot), evidenceRoot)
assert.ok(lstatSync(evidenceRoot).isDirectory() && !lstatSync(evidenceRoot).isSymbolicLink())

const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'native-smart-patch-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
mkdirSync(appDataRoot, { recursive: true, mode: 0o700 })
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashFiles = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const sourceFiles = [
  'scripts/smoke-smart-patch.mjs',
  'src/renderer/App.vue',
  'src/renderer/components/ProjectView.vue',
  'src/renderer/components/ProjectCanvas.vue',
  'src/renderer/components/ProjectSmartPatchLayerRow.vue',
  'src/renderer/components/ProjectLayerStack.vue',
  'src/renderer/components/ProjectSortableLayerRow.vue',
  'src/renderer/components/ProjectEntitySurface.vue',
  'src/renderer/components/project-entity-row.ts',
  'src/renderer/components/project-draft-sync.ts',
  'src/renderer/components/ProjectPresetCard.vue',
  'src/renderer/components/ApplyPresetModal.vue',
  'src/renderer/components/PresetManager.vue',
  'src/renderer/components/project-layer-context.ts',
  'src/shared/api.ts',
  'src/shared/projects/project-schema.ts',
  'src/shared/presets/preset-schema.ts',
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/main/projects/project-service.ts',
  'src/main/projects/project-session.ts',
  'src/main/projects/project-shadow.ts',
  'src/main/projects/project-autosave.ts',
  'src/main/projects/igs-package.ts',
  'src/main/presets/preset-ipc.ts',
  'src/main/presets/preset-service.ts',
  'src/main/presets/preset-repository.ts',
  'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs',
]
const report = {
  outcome: 'running',
  startedAt: new Date().toISOString(),
  fixtureRoot,
  payloads: [fixtureRoot],
  checks: [],
  screenshots: [],
  layouts: [],
  pageErrors: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  sourceSha256: hashFiles(sourceFiles),
  bundleSha256: hashFiles([
    'dist/main/main.cjs',
    'dist/preload/preload.cjs',
    'dist/renderer/index.html',
    ...readdirSync('dist/renderer/assets')
      .filter((name) => /\.(?:js|css)$/.test(name))
      .map((name) => `dist/renderer/assets/${name}`),
  ]),
  boundary: {
    actual:
      'Native Home create, real +Patch twice, own editor and Canvas bbox/internal-resolution changes, one Undo/Redo, real Save/readIgsPackage/close/reopen and explicit dirty shadow Recover after process death.',
    fixtures:
      'A real UI-created saved Project is closed; the production package writer adds one tiny literal ICC Raster neighbor as a declared precondition, then the real UI reopens it. A prompt-only preset is genuinely stored by Main for the owner-race control and retained in this isolated catalog. Its original Main getter response is delayed/released unchanged and the exact handler reference restored. Main/preload/storage/renderer remain real. No image worker, ML runtime, models, downloads or fabricated Project replies.',
    limits:
      'Root launches the actor under finite RAM/zero-swap/deadline bounds. Actual native scopes are limited to2GiB/zero-swap/300seconds; each old PID/start identity must physically exit before restart or payload disposal.',
    notQualified:
      'Mask painting/assets, variants, staleness, Generate/inpaint/outpaint, Preset Apply/result creation for patches, Regional Guidance, resource compatibility and release readiness remain future slices.',
    cleanup:
      'Only this isolated payload is owned. Root retains it until confirmed native exit and compact evidence pinning; this runner never cleans the reusable ML pool or ordinary app data.',
  },
}
let application
let window
let database
let nativeChecks = []
let projectId
let packagePath
let patchAId
let patchBId
let normal
let rasterBefore
let presetReplyHeld = false
const projectTitle = 'Native Smart Patch foundation'
const rasterId = randomUUID()
const rasterMember = `assets/layers/${rasterId}.png`
const rawRaster = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const srgb = readFileSync('worker-python/src/imagegen_worker/srgb.icc')
assert.equal(digest(srgb), IGS_SRGB_ICC_SHA256)
const iccPayload = Buffer.concat([Buffer.from('profile\0\0', 'ascii'), deflateSync(srgb)])
const iccChunk = Buffer.alloc(12 + iccPayload.length)
iccChunk.writeUInt32BE(iccPayload.length, 0)
iccChunk.write('iCCP', 4, 'ascii')
iccPayload.copy(iccChunk, 8)
iccChunk.writeUInt32BE(crc32(iccChunk.subarray(4, -4)), iccChunk.length - 4)
const rasterPng = Buffer.concat([rawRaster.subarray(0, 33), iccChunk, rawRaster.subarray(33)])

function checkpoint() {
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
}
function check(name, value = {}) {
  report.checks.push({ name, ...value })
  checkpoint()
  console.log(`PASS ${name}`)
}
async function api(scope, method, ...args) {
  const result = await window.evaluate(
    ({ scope, method, args }) => window.api[scope][method](...args),
    { scope, method, args },
  )
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function current() {
  const opened = await api('projects', 'open', projectId)
  assert.equal(opened.kind, 'opened')
  return opened.tab
}
const patch = (tab, id) => {
  const found = tab.layers.find((layer) => layer.id === id)
  assert.equal(found?.kind, 'smart-patch')
  return found
}
function layerContent(layer) {
  // Raster transport URLs deliberately bind the current document revision. Saved member
  // digests below verify pixels; every editable layer field remains part of this comparison.
  const { imageUrl: _imageUrl, ...content } = layer
  return content
}
const layerContents = (tab) => tab.layers.map(layerContent)
const editableProject = (tab) => ({
  acceptedResults: tab.acceptedResults,
  canRedo: tab.canRedo,
  canUndo: tab.canUndo,
  dirty: tab.dirty,
  documentId: tab.documentId,
  documentRevision: tab.documentRevision,
  generationDraft: tab.generationDraft,
  layers: layerContents(tab),
  primaryBbox: tab.primaryBbox,
})
function assertNormal(tab) {
  assert.deepEqual(
    tab.primaryBbox,
    normal.primaryBbox,
    'Patch edits cannot move the Project primary generation bbox',
  )
  assert.deepEqual(
    tab.generationDraft,
    normal.generationDraft,
    'Patch edits cannot rewrite normal Project settings',
  )
  assert.deepEqual(
    layerContent(tab.layers.find(({ id }) => id === rasterId)),
    layerContent(rasterBefore),
    'Patch edits cannot transform/change the Raster neighbor',
  )
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
  report.resourceLimitChecks.push({ label, ...value })
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
    args: ['--ozone-platform=x11', '.'],
    cwd: process.cwd(),
    env: environment,
    timeout: 30_000,
  })
  await bounds(`${label}-launch`)
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(15_000)
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await window.waitForFunction(() => typeof window.api?.projects?.addSmartPatchLayer === 'function')
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  assert.deepEqual(await api('models', 'getCatalog'), [])
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  check(`${label}: absent runtime/models; native app remains operational`)
}
async function closeProject(discard = false) {
  const tab = window.getByRole('tab', { name: projectTitle, exact: true })
  await window.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
  const guard = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect
    .poll(async () =>
      (await tab.count()) === 0 ? 'closed' : (await guard.isVisible()) ? 'decision' : 'waiting',
    )
    .not.toBe('waiting')
  if (await tab.count()) {
    assert.equal(discard, true, 'A routine clean close must not require a discard decision')
    await guard.getByRole('button', { name: 'Discard Changes', exact: true }).click()
  }
  await expect(tab).toHaveCount(0)
}
async function openProject() {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toBeVisible()
}
async function saveProject(label) {
  const before = await current()
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await current()).dirty).toBe(false)
  await expect(window.locator('.document-state')).toHaveText('Saved')
  const saved = await readIgsPackage(packagePath)
  assert.deepEqual(saved.project.generationDraft, before.generationDraft)
  assert.deepEqual(saved.project.primaryBbox, before.primaryBbox)
  assert.equal(
    saved.manifest.preview.status,
    'unavailable',
    'Visible Raster + absent worker uses the documented placeholder Save',
  )
  assert.equal(digest(await saved.readMember(rasterMember)), digest(rasterPng))
  for (const id of [patchAId, patchBId].filter(Boolean)) {
    const stored = saved.project.layers.find((layer) => layer.id === id)
    const acknowledged = patch(before, id)
    for (const key of [
      'boundingBox',
      'internalResolution',
      'generationDraft',
      'mask',
      'rasterSubLayers',
      'activeRasterSubLayerId',
    ])
      assert.deepEqual(
        stored[key],
        acknowledged[key],
        `Saved ${key} differs from acknowledged patch`,
      )
  }
  const evidenceCopy = path.join(evidenceRoot, `${label}.igs`)
  writeFileSync(evidenceCopy, readFileSync(packagePath), { flag: 'wx', mode: 0o600 })
  check(`${label}: genuine Save/readback with unavailable placeholder and unchanged Raster bytes`, {
    evidenceCopy,
    packageSha256: digest(readFileSync(packagePath)),
    project: saved.project,
  })
  return saved
}
async function select(id) {
  const layer = patch(await current(), id)
  const card = window.locator(`[data-layer-id="${id}"]`)
  const button = card.getByRole('button', { name: `Select ${layer.name}`, exact: true })
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(window.getByRole('textbox', { name: 'Positive prompt', exact: true })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  await expect(
    window.getByText('Smart Patch generation is not available yet.', { exact: true }),
  ).toBeVisible()
}
async function prompt(text) {
  const input = window.getByRole('textbox', { name: 'Positive prompt', exact: true })
  await input.fill(text)
  await input.press('Tab')
}
async function integer(label, value) {
  const input = window.locator(`input[aria-label="${label}"]`)
  await input.fill(String(value))
  await input.press('Enter')
}
async function history(action) {
  await window.getByRole('button', { name: 'Edit menu', exact: true }).click()
  await window
    .getByText(action === 'undo' ? 'Undo · Ctrl+Z' : 'Redo · Ctrl+Shift+Z / Ctrl+Y', {
      exact: true,
    })
    .click()
  await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  return await current()
}
async function screenshot(label) {
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const filename = path.join(evidenceRoot, `${label}.png`)
  await window.screenshot({ path: filename, animations: 'disabled' })
  report.screenshots.push(filename)
  checkpoint()
}
async function holdPresetReply(id) {
  await application.evaluate(({ ipcMain }, targetId) => {
    const channel = 'presets:get'
    const original = ipcMain._invokeHandlers.get(channel)
    if (typeof original !== 'function') throw new Error('The real preset getter is missing.')
    if (globalThis.igsSmartPatchPresetRace) throw new Error('An owned preset delay already exists.')
    const probe = {
      original,
      held: false,
      completed: false,
      delivered: false,
      args: null,
      response: null,
      responseUnchanged: null,
      release: null,
    }
    const delivery = new Promise((resolve) => {
      probe.release = resolve
    })
    globalThis.igsSmartPatchPresetRace = probe
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      const hold = !probe.held && args[0] === targetId
      if (hold) {
        probe.held = true
        probe.args = structuredClone(args)
      }
      const result = await original(event, ...args)
      if (hold) {
        probe.response = structuredClone(result)
        const originalBytes = JSON.stringify(result)
        probe.completed = true
        await delivery
        probe.responseUnchanged = JSON.stringify(result) === originalBytes
        probe.delivered = true
      }
      // Return the identical original object; neither the reply nor target is fabricated.
      return result
    })
  }, id)
  presetReplyHeld = true
}
async function releasePresetReply() {
  if (!presetReplyHeld || !application) return
  const restored = await application.evaluate(({ ipcMain }) => {
    const probe = globalThis.igsSmartPatchPresetRace
    if (!probe) throw new Error('Owned preset delay missing during restoration.')
    ipcMain.removeHandler('presets:get')
    ipcMain.handle('presets:get', probe.original)
    const originalReferenceRestored = ipcMain._invokeHandlers.get('presets:get') === probe.original
    probe.release()
    return {
      held: probe.held,
      originalReferenceRestored,
      originalSource: probe.original.toString(),
    }
  })
  assert.equal(restored.originalReferenceRestored, true)
  if (restored.held)
    await expect
      .poll(() => application.evaluate(() => globalThis.igsSmartPatchPresetRace.delivered))
      .toBe(true)
  const observed = await application.evaluate(() => {
    const probe = globalThis.igsSmartPatchPresetRace
    const result = {
      held: probe.held,
      completed: probe.completed,
      delivered: probe.delivered,
      args: probe.args,
      response: probe.response,
      responseUnchanged: probe.responseUnchanged,
    }
    delete globalThis.igsSmartPatchPresetRace
    return result
  })
  presetReplyHeld = false
  report.presetOwnerRace = {
    ...observed,
    originalReferenceRestored: restored.originalReferenceRestored,
    originalHandlerSha256: digest(restored.originalSource),
  }
  checkpoint()
  return observed
}
async function presetOwnerRace() {
  const definition = {
    name: 'Native normal-owner race preset',
    description: '',
    favorite: false,
    tags: ['native-owner-control'],
    workflow: 'textToImage',
    payload: { prompt: { text: 'Preset belongs to the normal project owner', embeddingRefs: [] } },
  }
  const source = await api('presets', 'create', definition)
  assert.deepEqual(await api('presets', 'get', source.id), source)
  const stored = await database.db
    .selectFrom('presets')
    .selectAll()
    .where('id', '=', source.id)
    .executeTakeFirstOrThrow()
  assert.deepEqual(JSON.parse(stored.payload_json), definition.payload)
  report.presetOwnerRaceFixture = { definition, record: source, storedRow: stored }
  checkpoint()
  const before = editableProject(await current())
  const rasterSelect = window
    .locator(`[data-layer-id="${rasterId}"]`)
    .getByRole('button', { name: 'Select Untouched Raster neighbor', exact: true })
  const openChoice = async () => {
    await rasterSelect.click()
    await expect(rasterSelect).toHaveAttribute('aria-pressed', 'true')
    await window.getByRole('button', { name: 'Apply preset', exact: true }).click()
    const picker = window.getByRole('dialog', { name: 'Choose preset to apply', exact: true })
    await expect(picker).toBeVisible()
    await picker.getByRole('button', { name: 'Refresh presets to apply', exact: true }).click()
    await picker
      .getByRole('textbox', { name: 'Search presets to apply', exact: true })
      .fill(source.name)
    await picker.getByRole('button', { name: `Choose preset ${source.name}`, exact: true }).click()
  }
  await holdPresetReply(source.id)
  try {
    await openChoice()
    await expect
      .poll(() => application.evaluate(() => globalThis.igsSmartPatchPresetRace.completed))
      .toBe(true)
    const captured = await application.evaluate(() => {
      const probe = globalThis.igsSmartPatchPresetRace
      return { args: probe.args, response: probe.response, delivered: probe.delivered }
    })
    assert.equal(captured.args[0], source.id)
    assert.deepEqual(captured.response, { ok: true, value: source })
    assert.equal(captured.delivered, false)
    await select(patchAId)
    assert.deepEqual(editableProject(await current()), before)
    report.presetOwnerRaceTarget = {
      projectId,
      documentId: before.documentId,
      sourcePresetId: source.id,
      requestedOwner: 'normal',
      selectedPatchId: patchAId,
    }
    checkpoint()
    const released = await releasePresetReply()
    assert.equal(released.completed, true)
    assert.equal(released.delivered, true)
    assert.equal(released.responseUnchanged, true)
    // A subsequent genuine getter is an IPC delivery barrier, then Vue receives two frames.
    assert.deepEqual(await api('presets', 'get', source.id), source)
    await window.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
    await expect(window.getByRole('dialog', { name: /^Apply Preset: / })).toHaveCount(0)
    assert.deepEqual(editableProject(await current()), before)
    assertNormal(await current())
    assert.deepEqual(
      await database.db
        .selectFrom('presets')
        .selectAll()
        .where('id', '=', source.id)
        .executeTakeFirstOrThrow(),
      stored,
    )
    check(
      'A delayed original normal-owner preset getter cannot open Apply after actual Patch selection',
      { presetId: source.id, normalAndBothPatchesUnchanged: true },
    )
  } finally {
    await releasePresetReply()
  }
  // Neighbor: the restored getter still opens this exact stored source for the normal owner.
  await openChoice()
  const dialog = window.getByRole('dialog', { name: `Apply Preset: ${source.name}`, exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('checkbox', { name: 'Apply Prompt', exact: true })).toBeChecked()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  assert.deepEqual(editableProject(await current()), before)
  assert.deepEqual(await api('presets', 'get', source.id), source)
  assert.deepEqual(
    await database.db
      .selectFrom('presets')
      .selectAll()
      .where('id', '=', source.id)
      .executeTakeFirstOrThrow(),
    stored,
  )
  assertNormal(await current())
  check(
    'Restored original getter opens the correct real stored preset for the normal owner; Cancel preserves all Project/preset state',
  )
  await select(patchAId)
}
async function resizeNative(size) {
  const native = await application.evaluate(({ BrowserWindow }, [width, height]) => {
    const main = BrowserWindow.getAllWindows()[0]
    main.setSize(width, height)
    return { outer: main.getSize(), content: main.getContentSize() }
  }, size)
  assert.deepEqual(native.outer, size, 'The actual native window must accept the requested size')
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual(native.content)
  return native
}
async function checkPatchLayout() {
  // These are real BrowserWindow outer sizes. X11 decorations can change the renderer's
  // content size, so record both rather than treating the requested size as the viewport.
  try {
    for (const size of [
      [1440, 900],
      [900, 620],
    ]) {
      const native = await resizeNative(size)
      await window
        .locator('input[aria-label="Smart Patch internal height"]')
        .scrollIntoViewIfNeeded()
      await window
        .getByRole('button', { name: 'Add Smart Patch Layer', exact: true })
        .scrollIntoViewIfNeeded()
      await screenshot(`smart-patch-layout-${size.join('x')}`)
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
        const laidOut = (element) => {
          const style = getComputedStyle(element)
          const value = rect(element)
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            !element.closest('[aria-hidden="true"]') &&
            value.width > 0 &&
            value.height > 0
          )
        }
        const panelRect = (element) => rect(element.closest('.project-settings, .layer-stack'))
        const viewport = { width: innerWidth, height: innerHeight }
        const inViewport = (value, panel) =>
          value.right > Math.max(0, panel.left) &&
          value.left < Math.min(viewport.width, panel.right) &&
          value.bottom > Math.max(0, panel.top) &&
          value.top < Math.min(viewport.height, panel.bottom)
        const panels = [
          ...document.querySelectorAll(
            '.project-layout, .project-settings, .settings-scroll, .layer-stack, .generation-footer, .layer-properties, .layer-header',
          ),
        ]
          .filter(laidOut)
          .map((element) => ({
            name: element.className,
            rect: rect(element),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            scrollTop: element.scrollTop,
          }))
        const inputs = [
          ...document.querySelectorAll(
            '.project-settings input, .project-settings textarea, .project-settings [contenteditable="true"], .project-settings .n-base-selection, .layer-stack input, .layer-stack textarea, .layer-stack [contenteditable="true"], .layer-stack .n-base-selection',
          ),
        ]
          .filter(laidOut)
          .map((element) => {
            const bounds = rect(element)
            const panel = panelRect(element)
            const control =
              element.closest('.n-input-number, .n-input, .n-base-selection') ?? element
            return {
              label:
                element.getAttribute('aria-label') ??
                element.closest('[aria-label]')?.getAttribute('aria-label') ??
                element.tagName,
              rect: bounds,
              control: rect(control),
              panel,
              inViewport: inViewport(bounds, panel),
            }
          })
        const headerButtons = [
          ...document.querySelectorAll(
            '.generation-footer button, .document-actions button, .layer-header button',
          ),
        ]
          .filter(laidOut)
          .map((element) => {
            const bounds = rect(element)
            const panel = panelRect(element)
            return {
              name: element.getAttribute('aria-label') ?? element.textContent.trim(),
              header: element.closest('.generation-footer, .document-actions, .layer-header')
                .className,
              rect: bounds,
              panel,
              inViewport: inViewport(bounds, panel),
            }
          })
        const heading = document.querySelector('.layer-header h2')
        const range = document.createRange()
        range.selectNodeContents(heading)
        const headingLines = new Set(
          [...range.getClientRects()]
            .filter((value) => value.width > 0 && value.height > 0)
            .map((value) => Math.round(value.top)),
        )
        return { viewport, panels, inputs, headerButtons, headingLineCount: headingLines.size }
      })
      const evidence = { requestedOuter: size, native, ...measured }
      report.layouts.push(evidence)
      checkpoint()
      const epsilon = 2
      assert.equal(
        measured.headingLineCount,
        1,
        'Layer title and count must remain together on one line',
      )
      const horizontalFit = (value, panel) =>
        value.left >= panel.left - epsilon && value.right <= panel.right + epsilon
      for (const panel of measured.panels) {
        assert.ok(
          panel.scrollWidth <= panel.clientWidth + epsilon,
          `${panel.name} horizontally overflows at native ${size.join('x')}`,
        )
        assert.ok(
          panel.rect.left >= -epsilon && panel.rect.right <= measured.viewport.width + epsilon,
          `${panel.name} extends outside the actual renderer viewport`,
        )
      }
      const rightStack = measured.panels.find(({ name }) => name === 'layer-stack')
      assert.ok(
        rightStack &&
          rightStack.rect.top >= -epsilon &&
          rightStack.rect.bottom <= measured.viewport.height + epsilon,
        'The whole right layer stack must fit inside the actual renderer viewport',
      )
      for (const input of measured.inputs) {
        assert.ok(
          horizontalFit(input.rect, input.panel) && horizontalFit(input.control, input.panel),
          `${input.label} or its rendered control is clipped horizontally at native ${size.join('x')}`,
        )
      }
      for (const label of ['Smart Patch internal width', 'Smart Patch internal height'])
        assert.ok(
          measured.inputs.some((input) => input.label === label && input.inViewport),
          `${label} must be visibly reachable after native resize`,
        )
      for (const button of measured.headerButtons) {
        assert.ok(
          horizontalFit(button.rect, button.panel),
          `${button.name} is clipped horizontally at native ${size.join('x')}`,
        )
        if (button.header !== 'document-actions') {
          assert.ok(
            button.inViewport &&
              button.rect.top >= button.panel.top - epsilon &&
              button.rect.bottom <= button.panel.bottom + epsilon,
            `${button.name} must fit its visible header at native ${size.join('x')}`,
          )
        }
      }
      check(
        `Selected patch native ${size.join('x')}: actual inputs, header actions and right stack fit without horizontal clipping`,
        {
          actualContentSize: native.content,
          inputCount: measured.inputs.length,
          headerButtonCount: measured.headerButtons.length,
        },
      )
    }
  } finally {
    report.layoutRestoredWindow = await resizeNative([1440, 900])
    checkpoint()
  }
}
async function closeNative(label) {
  if (!application) return
  await bounds(`${label}-before-close`)
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
    assert.ok(id && group, 'Failure cleanup can stop only this verified native PID/start/scope')
    report.ownedSignal = await stopExpiredQualificationProcess({ ...id, group: group.group })
  }
  const exit = await confirmQualificationProcessExit(nativeChecks)
  assert.equal(exit.confirmed, true)
  report.nativeClosures.push({ label, ...exit })
  application = null
  window = null
  checkpoint()
}

checkpoint()
try {
  await launch('foundation')
  await window
    .getByLabel('Workspace navigation')
    .getByRole('button', { name: 'New Project', exact: true })
    .click()
  const dialog = window.getByRole('dialog', { name: 'New Project', exact: true })
  await dialog.getByRole('textbox', { name: 'Project name', exact: true }).fill(projectTitle)
  assert.deepEqual(await api('projects', 'list'), [])
  // Enter is a real form submission here, unlike the in-Project resolution controls.
  // Author both values before the one explicit Create action.
  await dialog.locator('input[aria-label="Project width"]').fill('256')
  await dialog.locator('input[aria-label="Project height"]').fill('256')
  const closingForm = await dialog.locator('form').elementHandle()
  await dialog.getByRole('button', { name: 'Create Project', exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toBeVisible()
  // Observe the real retiring DOM, rather than forcing component state. A late native
  // DOM submit qualifies the closing-form guard only when the form is still connected and
  // its busy state has cleared; otherwise the normal single-Create path remains proved.
  report.closingForm = await closingForm.evaluate(async (form) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const submit = document.querySelector(`button[form="${form.id}"]`)
    const connected = form.isConnected
    const busy = submit?.disabled ?? null
    const valid = form.checkValidity()
    const submitted = connected && busy === false && valid
    if (submitted) form.requestSubmit()
    return { connected, busy, valid, submitted }
  })
  await closingForm.dispose()
  await expect(dialog).toHaveCount(0)
  const created = await api('projects', 'list')
  assert.equal(created.length, 1)
  assert.equal(created[0].title, projectTitle)
  projectId = created[0].id
  report.projectId = projectId
  await prompt('Normal Project prompt remains independent')
  await expect
    .poll(async () => (await current()).generationDraft.positivePrompt.text)
    .toBe('Normal Project prompt remains independent')
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
  const initialSaved = await readIgsPackage(packagePath)
  assert.deepEqual(initialSaved.project.primaryBbox, { x: 0, y: 0, width: 256, height: 256 })
  assert.equal(
    (await database.db.selectFrom('project_index').select('local_project_key').execute()).length,
    1,
  )
  check(
    'One explicit native Create produces exactly one indexed Project and a saved 256×256 bbox',
    { closingForm: report.closingForm, projectId, documentId: initialSaved.project.documentId },
  )
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
    name: 'Untouched Raster neighbor',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
    visible: true,
  }
  await saveIgsPackage(packagePath, {
    assets: { [rasterMember]: { bytes: rasterPng } },
    preview: {
      merged: await seed.readMember('preview/merged.png'),
      rect: { x: 0, y: 0, width: 2, height: 2 },
      status: 'unavailable',
      thumbnail: await seed.readMember('preview/thumbnail.webp'),
    },
    project: { ...seed.project, documentRevision: randomUUID(), layers: [raster] },
  })
  check(
    'Declared tiny ICC Raster fixture published only while the genuine UI-created Project is closed',
    { rasterId, rasterSha256: digest(rasterPng), noWorker: true },
  )
  await openProject()
  normal = await current()
  rasterBefore = normal.layers.find(({ id }) => id === rasterId)
  assert.ok(rasterBefore)
  assert.deepEqual(normal.primaryBbox, { x: 0, y: 0, width: 256, height: 256 })
  for (const slot of ['A', 'B']) {
    const before = await current()
    await window.getByRole('button', { name: 'Add Smart Patch Layer', exact: true }).click()
    await expect.poll(async () => (await current()).layers.length).toBe(before.layers.length + 1)
    const after = await current()
    const ids = new Set(before.layers.map(({ id }) => id))
    const added = after.layers.filter(({ id }) => !ids.has(id))
    assert.equal(added.length, 1)
    const value = added[0]
    assert.equal(value.kind, 'smart-patch')
    assert.equal(after.layers[0].id, value.id, 'New Smart Patch belongs at the top of the stack')
    assert.deepEqual(value.boundingBox, normal.primaryBbox)
    assert.deepEqual(value.internalResolution, { width: 256, height: 256 })
    assert.deepEqual(value.generationDraft, normal.generationDraft)
    assert.match(value.mask.id, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
    assert.deepEqual(value.mask, { id: value.mask.id, revision: 0, asset: null })
    assert.deepEqual(value.rasterSubLayers, [])
    assert.equal(value.activeRasterSubLayerId, null)
    if (slot === 'A') patchAId = value.id
    else patchBId = value.id
    assertNormal(after)
    check(
      `+Patch ${slot}: actual top-of-stack entity copies acknowledged normal state into independent ownership`,
      { layer: value },
    )
  }
  let state = await current()
  assert.notEqual(patch(state, patchAId).mask.id, patch(state, patchBId).mask.id)
  const originalB = structuredClone(patch(state, patchBId))
  await select(patchAId)
  await expect(window.getByRole('button', { name: 'Apply preset', exact: true })).toBeDisabled()
  await expect(
    window.getByRole('button', { name: 'Save Current as Preset', exact: true }),
  ).toBeDisabled()
  const managePresets = window.getByRole('button', { name: 'Manage Presets', exact: true })
  await expect(managePresets).toBeEnabled()
  const beforeManager = await current()
  await managePresets.click()
  const manager = window.getByRole('dialog', { name: 'Preset Manager', exact: true })
  await expect(manager).toBeVisible()
  await manager.getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await expect(manager).toHaveCount(0)
  assert.deepEqual(layerContents(await current()), layerContents(beforeManager))
  assertNormal(await current())
  const rasterSelect = window
    .locator(`[data-layer-id="${rasterId}"]`)
    .getByRole('button', { name: 'Select Untouched Raster neighbor', exact: true })
  await rasterSelect.click()
  await expect(rasterSelect).toHaveAttribute('aria-pressed', 'true')
  const applyPreset = window.getByRole('button', { name: 'Apply preset', exact: true })
  await expect(applyPreset).toBeEnabled()
  await applyPreset.click()
  const picker = window.getByRole('dialog', { name: 'Choose preset to apply', exact: true })
  await expect(picker).toBeVisible()
  await expect(
    picker.getByRole('textbox', { name: 'Search presets to apply', exact: true }),
  ).toBeVisible()
  await applyPreset.click()
  await expect(picker).toHaveCount(0)
  assertNormal(await current())
  assert.deepEqual(await api('presets', 'list'), [])
  check(
    'Selected patch disables future Apply/Save Current but retains Manage Presets; normal Raster neighbor still opens/closes the real Apply picker',
  )
  await presetOwnerRace()
  await select(patchAId)
  await prompt('Patch A owns its prompt')
  await expect
    .poll(async () => patch(await current(), patchAId).generationDraft.positivePrompt.text)
    .toBe('Patch A owns its prompt')
  await integer('Smart Patch width', 192)
  await integer('Smart Patch height', 128)
  await integer('Smart Patch internal width', 384)
  await integer('Smart Patch internal height', 256)
  await expect
    .poll(async () => ({
      bbox: patch(await current(), patchAId).boundingBox,
      internal: patch(await current(), patchAId).internalResolution,
    }))
    .toEqual({
      bbox: { x: 0, y: 0, width: 192, height: 128 },
      internal: { width: 384, height: 256 },
    })
  const canvas = window.getByRole('region', { name: 'Project Canvas', exact: true })
  await canvas.getByRole('button', { name: 'Bounding Box tool', exact: true }).click()
  await canvas.locator('.canvas-area').focus()
  await canvas.locator('.canvas-area').press('ArrowRight')
  await canvas.locator('.canvas-area').press('ArrowDown')
  await expect
    .poll(async () => patch(await current(), patchAId).boundingBox)
    .toEqual({ x: 1, y: 1, width: 192, height: 128 })
  state = await current()
  assert.deepEqual(patch(state, patchBId), originalB)
  assertNormal(state)
  const editedA = structuredClone(patch(state, patchAId))
  await select(patchBId)
  await prompt('Patch B is independently authored')
  await expect
    .poll(async () => patch(await current(), patchBId).generationDraft.positivePrompt.text)
    .toBe('Patch B is independently authored')
  await integer('Smart Patch width', 128)
  await integer('Smart Patch height', 192)
  await integer('Smart Patch internal width', 256)
  await integer('Smart Patch internal height', 384)
  await expect
    .poll(async () => patch(await current(), patchBId).internalResolution)
    .toEqual({ width: 256, height: 384 })
  state = await current()
  assert.deepEqual(patch(state, patchAId), editedA)
  assertNormal(state)
  check(
    'Real selection binds the editor/Canvas to one owned patch; A/B/primary/Raster neighbor remain separate',
    { patchA: editedA, patchB: patch(state, patchBId) },
  )

  await select(patchAId)
  const beforeRapid = await current()
  const bBeforeRapid = structuredClone(patch(beforeRapid, patchBId))
  // Do not poll Main or blur manually between the authored input and the new owner click.
  // The app must flush the old captured owner itself when selection changes.
  await window
    .getByRole('textbox', { name: 'Positive prompt', exact: true })
    .fill('Patch A rapid selection owner')
  const bSelect = window
    .locator(`[data-layer-id="${patchBId}"]`)
    .getByRole('button', { name: `Select ${bBeforeRapid.name}`, exact: true })
  await bSelect.click()
  await expect(bSelect).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(async () => patch(await current(), patchAId).generationDraft.positivePrompt.text)
    .toBe('Patch A rapid selection owner')
  const afterRapid = await current()
  assert.deepEqual(
    patch(afterRapid, patchBId),
    bBeforeRapid,
    'A late draft response must not overwrite the newly selected Patch B',
  )
  assertNormal(afterRapid)
  await expect
    .poll(async () =>
      (
        await window
          .getByRole('textbox', { name: 'Positive prompt', exact: true })
          .locator('.cm-line')
          .allTextContents()
      ).join('\n'),
    )
    .toBe('Patch B is independently authored')
  check(
    'Rapid pending A prompt→immediate B selection flushes the captured A owner and preserves B/normal settings',
    { patchA: patch(afterRapid, patchAId), patchB: patch(afterRapid, patchBId) },
  )

  // Seal any prompt group through actual selection, then test one isolated numeric mutation.
  await select(patchAId)
  await window.getByRole('button', { name: 'Clear Project History', exact: true }).click()
  await window.getByRole('button', { name: 'Clear history', exact: true }).click()
  await expect.poll(async () => (await current()).canUndo).toBe(false)
  const beforeHistory = await current()
  await integer('Smart Patch internal width', 512)
  await expect.poll(async () => patch(await current(), patchAId).internalResolution.width).toBe(512)
  const afterHistory = await current()
  const undone = await history('undo')
  assert.deepEqual(layerContents(undone), layerContents(beforeHistory))
  assert.equal(undone.canUndo, false)
  assertNormal(undone)
  const redone = await history('redo')
  assert.deepEqual(layerContents(redone), layerContents(afterHistory))
  assert.equal(redone.canRedo, false)
  assertNormal(redone)
  await checkPatchLayout()
  await saveProject('smart-patch-saved')
  const savedLayers = structuredClone(layerContents(await current()))
  const savedBytes = readFileSync(packagePath)
  await closeProject()
  await openProject()
  state = await current()
  assert.deepEqual(layerContents(state), savedLayers)
  assertNormal(state)
  check(
    'Clean real close/reopen retains patch identities, owned draft/bbox/internal resolution and blank masks',
  )

  await select(patchAId)
  await prompt('Patch A unsaved recovery edit')
  await expect
    .poll(async () => patch(await current(), patchAId).generationDraft.positivePrompt.text)
    .toBe('Patch A unsaved recovery edit')
  const dirty = await current()
  assert.equal(dirty.dirty, true)
  const shadowPath = path.join(appDataRoot, 'autosave', projectId, 'manifest.json')
  await expect
    .poll(() => {
      if (!existsSync(shadowPath)) return null
      const manifest = JSON.parse(readFileSync(shadowPath, 'utf8'))
      if (manifest.state !== 'dirty') return null
      const snapshot = path.join(
        path.dirname(shadowPath),
        'snapshots',
        manifest.snapshotId,
        'project.json',
      )
      if (!existsSync(snapshot)) return null
      const bytes = readFileSync(snapshot)
      if (digest(bytes) !== manifest.documentHash) return null
      const document = JSON.parse(bytes)
      if (document.documentRevision !== manifest.documentRevision) return null
      return document.layers.find(({ id }) => id === patchAId)?.generationDraft.positivePrompt.text
    })
    .toBe('Patch A unsaved recovery edit')
  const shadow = JSON.parse(readFileSync(shadowPath, 'utf8'))
  assert.equal(shadow.documentId, dirty.documentId)
  assert.ok(
    readFileSync(packagePath).equals(savedBytes),
    'Shadow autosave cannot implicitly Save the Project',
  )
  report.crashShadow = shadow
  await bounds('before-own-crash')
  await database.close()
  database = null
  const child = application.process()
  const crashIdentity = nativeChecks.at(-1).nativeIdentity
  assert.equal(child.pid, crashIdentity.pid)
  assert.equal(child.exitCode, null)
  const processStat = readFileSync(`/proc/${child.pid}/stat`, 'utf8')
  assert.equal(
    processStat.slice(processStat.lastIndexOf(')') + 2).split(' ')[19],
    crashIdentity.start,
    'Crash simulation must target the still-owned original PID/start identity',
  )
  const exited = new Promise((resolve) => child.once('exit', resolve))
  assert.equal(child.kill('SIGKILL'), true)
  await exited
  const physical = await confirmQualificationProcessExit(nativeChecks)
  assert.equal(physical.confirmed, true)
  report.nativeClosures.push({ label: 'intentional-own-crash', ...physical })
  application = null
  window = null
  checkpoint()
  await launch('recovery')
  await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  const recover = window.getByRole('dialog', { name: 'Recovery available', exact: true })
  await expect(recover).toBeVisible()
  assert.ok(readFileSync(packagePath).equals(savedBytes))
  await recover.getByRole('button', { name: 'Recover', exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toBeVisible()
  const recovered = await current()
  assert.equal(recovered.dirty, true)
  assert.equal(recovered.canUndo, false, 'Project Undo history does not survive restart')
  assert.equal(recovered.canRedo, false)
  assert.deepEqual(layerContents(recovered), layerContents(dirty))
  assertNormal(recovered)
  assert.ok(readFileSync(packagePath).equals(savedBytes))
  await select(patchAId)
  await expect
    .poll(async () =>
      (
        await window
          .getByRole('textbox', { name: 'Positive prompt', exact: true })
          .locator('.cm-line')
          .allTextContents()
      ).join('\n'),
    )
    .toBe('Patch A unsaved recovery edit')
  await saveProject('smart-patch-recovered')
  await closeProject()
  await openProject()
  assert.deepEqual(layerContents(await current()), layerContents(recovered))
  assertNormal(await current())
  check(
    'Actual crash→Home Recover→explicit Save/reopen preserves both patch owners and all normal neighbors',
    { shadowDocumentRevision: shadow.documentRevision, recoveredDocumentId: recovered.documentId },
  )
  assert.deepEqual(await api('models', 'getCatalog'), [])
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  assert.equal(
    await database.db
      .selectFrom('generation_queue_item')
      .select('id')
      .execute()
      .then((rows) => rows.length),
    0,
  )
  assert.deepEqual(report.pageErrors, [])
  assert.equal(
    (await database.db.selectFrom('project_index').select('local_project_key').execute()).length,
    1,
    'The entire native campaign must retain only the one explicitly created Project',
  )
  await closeProject()
  await closeNative('final')
  report.finalSourceSha256 = hashFiles(sourceFiles)
  assert.deepEqual(
    report.finalSourceSha256,
    report.sourceSha256,
    'The qualification source, including this final harness, must remain frozen during the run',
  )
  report.outcome = 'passed'
  report.completedAt = new Date().toISOString()
  checkpoint()
} catch (error) {
  report.outcome = 'failed'
  report.error =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) }
  checkpoint()
  if (window && !window.isClosed()) {
    try {
      await screenshot('failure-before-cleanup')
    } catch (screenshotError) {
      report.failureScreenshotError = String(screenshotError)
      checkpoint()
    }
  }
  throw error
} finally {
  if (application) {
    try {
      await releasePresetReply()
    } catch (error) {
      report.presetDelayCleanupError = String(error)
      checkpoint()
    }
    try {
      const applyDialog = window?.getByRole('dialog', { name: /^Apply Preset: / })
      if (window && !window.isClosed() && (await applyDialog.isVisible()))
        await applyDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      if (
        projectId &&
        window &&
        !window.isClosed() &&
        (await window.getByRole('tab', { name: projectTitle, exact: true }).count())
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
