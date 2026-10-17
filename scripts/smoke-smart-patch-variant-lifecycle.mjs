/** Built Electron lifecycle qualification. Writer-adopted variants are a declared existing state. */
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

import { _electron as electron, expect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { literalSmartPatchColorPng } from '../src/main/projects/test-fixtures/smart-patch-input-material.ts'
import { smartPatchVariantMetadataFixture } from '../src/main/projects/test-fixtures/smart-patch-variant.ts'
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
assert.equal(existsSync(reportFile), false)
const evidenceParent = path.dirname(reportFile)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const relative = path.relative(artifactRoot, evidenceParent)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
assert.equal(realpathSync(evidenceParent), evidenceParent)
assert.ok(lstatSync(evidenceParent).isDirectory() && !lstatSync(evidenceParent).isSymbolicLink())
// Every report owns its screenshots and exported package, including retries in the same parent.
const evidenceRoot = path.join(evidenceParent, `${path.basename(reportFile)}.artifacts`)
assert.equal(existsSync(evidenceRoot), false)
mkdirSync(evidenceRoot, { mode: 0o700 })

const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'native-variant-lifecycle-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
mkdirSync(workspace, { recursive: true, mode: 0o700 })
const title = 'Smart Patch variant lifecycle'
const patchName = 'Stored Smart Patch'
const packagePath = path.join(workspace, `${title}.igs`)
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashes = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const sourceFiles = [
  'scripts/smoke-smart-patch-variant-lifecycle.mjs',
  'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs',
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/shared/api.ts',
  'src/shared/projects/smart-patch-variants.ts',
  'src/main/projects/project-service.ts',
  'src/main/projects/project-smart-patch-variant-inspection.ts',
  'src/main/projects/project-smart-patch-variant-state.ts',
  'src/main/projects/project-autosave.ts',
  'src/main/projects/project-session.ts',
  'src/main/projects/project-shadow.ts',
  'src/main/projects/project-layer-resource.ts',
  'src/main/projects/igs-package.ts',
  'src/main/projects/test-fixtures/smart-patch-variant.ts',
  'src/main/projects/test-fixtures/smart-patch-input-material.ts',
  'src/shared/projects/project-layer-views.ts',
  'src/renderer/components/ProjectView.vue',
  'src/renderer/App.vue',
  'src/renderer/components/ProjectLayerStack.vue',
  'src/renderer/components/ProjectSortableLayerRow.vue',
  'src/renderer/components/ProjectSmartPatchLayerRow.vue',
  'src/renderer/components/SmartPatchVariantsBrowser.vue',
  'src/renderer/components/smart-patch-variant-owner.ts',
  'src/renderer/components/ProjectCanvas.vue',
]
const bundleFiles = [
  'dist/main/main.cjs',
  'dist/preload/preload.cjs',
  'dist/renderer/index.html',
  ...readdirSync('dist/renderer/assets')
    .filter((name) => /\.(?:js|css)$/.test(name))
    .map((name) => `dist/renderer/assets/${name}`),
]
const rect = { height: 192, width: 256, x: 160, y: 120 }
const greenColor = [40, 180, 90, 255]
const purpleColor = [120, 40, 180, 255]
const renamed = 'Chosen purple alternative'
const report = {
  outcome: 'running',
  startedAt: new Date().toISOString(),
  fixtureRoot,
  payloads: [fixtureRoot],
  sourceSha256: hashes(sourceFiles),
  bundleSha256: hashes(bundleFiles),
  checks: [],
  screenshots: [],
  canvasPixels: [],
  dialogGeometry: [],
  pageErrors: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  boundary: {
    actual:
      'Built Electron Home/open; real SQLite scan, IPC lifecycle commands, variant browser, rename/delete cancellation and focus restoration, locked viewing, active/final deletion, narrow viewport layout, signed image resource, live Konva pixels, Undo/Redo, native Save, real ZIP readback, close/reopen.',
    fixtures:
      'ProjectSession writer adopts two literal ICC RGBA images plus portable provenance before launch. This is an existing nonempty Patch precondition, not public Add. No Project replies, catalog, runtime or worker is mocked.',
    oracle:
      'Literal green and purple variants have different frozen world positions. Selection changes signed image bytes and live scene pixels while authoring and immutable provenance remain exact. ZIP loader proves both Undo-retained images after deletion+Save.',
    limits:
      'Root bounds launcher; runner verifies unique launcher/native groups total at most 4 GiB, native at most 2 GiB, zero swap, finite 300 s native deadline; one native actor and no ML downloads/runtime.',
    excluded:
      'Public Generate/Add, physical crash recovery, accepted-history, Compare/Preset, actual worker source freshness, ML inference/quality/release qualification.',
    cleanup:
      'Root disposes only this owned payload after physical native exit and compact evidence pinning; ordinary app data and reusable ML environments remain untouched.',
  },
}
let application, window, database, projectId, patchId, green, purple, authored
const nativeChecks = []

function checkpoint() {
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
}
function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence })
  checkpoint()
  console.log(`PASS ${name}`)
}
function variant(document, name, bbox, color) {
  const value = smartPatchVariantMetadataFixture('illustrious')
  const bytes = literalSmartPatchColorPng(
    bbox.width,
    bbox.height,
    Array.from({ length: bbox.width * bbox.height }, () => color).flat(),
    4,
  )
  value.name = name
  value.bbox = { ...bbox }
  Object.assign(value.asset, {
    bytes: bytes.length,
    height: bbox.height,
    sha256: digest(bytes),
    width: bbox.width,
  })
  const source = value.generationProvenance.layerSourceContext
  Object.assign(source, {
    bbox: { ...bbox },
    layerId: patchId,
    sourceDocumentId: document.documentId,
    sourceDocumentRevision: document.documentRevision,
  })
  Object.assign(source.sourceTarget, { height: bbox.height, width: bbox.width })
  Object.assign(source.preparedInputs.finalContributionMask, {
    height: bbox.height,
    width: bbox.width,
  })
  Object.assign(value.generationProvenance.executionResultContext.output, {
    byteSize: bytes.length,
    contributionAlpha8: {
      byteSize: bbox.width * bbox.height,
      height: bbox.height,
      sha256: digest(Buffer.alloc(bbox.width * bbox.height, color[3])),
      width: bbox.width,
    },
    height: bbox.height,
    sha256: digest(bytes),
    width: bbox.width,
  })
  return { bytes, color, value }
}
async function prepare() {
  const session = await ProjectSession.create(packagePath, title, {
    placeholdersDir: path.resolve('dist/main/placeholders'),
    scratchDir: path.join(fixtureRoot, 'writer-scratch'),
  })
  projectId = session.localRecoveryKey
  patchId = randomUUID()
  green = variant(session.document, 'Frozen green variant', rect, greenColor)
  purple = variant(session.document, 'Stored purple alternate', { ...rect, x: 288 }, purpleColor)
  authored = {
    activeRasterSubLayerId: green.value.id,
    blendMode: 'normal',
    boundingBox: { height: 1024, width: 1024, x: 0, y: 0 },
    generationDraft: structuredClone(session.document.generationDraft),
    id: patchId,
    internalResolution: { height: 512, width: 512 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    name: patchName,
    opacity: 1,
    rasterSubLayers: [green.value, purple.value],
    visible: true,
  }
  session.applyDocument({ ...session.document, layers: [authored] })
  await session.save({
    assets: {
      [green.value.asset.path]: { bytes: green.bytes },
      [purple.value.asset.path]: { bytes: purple.bytes },
    },
  })
  report.fixture = {
    localProjectKey: projectId,
    documentId: session.document.documentId,
    patchId,
    packagePath,
    greenId: green.value.id,
    purpleId: purple.value.id,
    originalPackageSha256: digest(readFileSync(packagePath)),
  }
  check('Real writer adopted exactly two distinct frozen-position variant fixtures')
}
async function api(method, ...args) {
  const result = await window.evaluate(({ method, args }) => window.api.projects[method](...args), {
    method,
    args,
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function current() {
  const result = await api('open', projectId)
  assert.equal(result.kind, 'opened')
  return result.tab
}
function patch(tab) {
  const found = tab.layers.find(({ id }) => id === patchId)
  assert.equal(found?.kind, 'smart-patch')
  return found
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
  const launcherGroup = readFileSync('/proc/self/cgroup', 'utf8')
    .trim()
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3)
  assert.ok(launcherGroup && launcherGroup.startsWith('/') && launcherGroup !== '/')
  const launcherRoot = `/sys/fs/cgroup${launcherGroup}`
  const launcherMax = readFileSync(path.join(launcherRoot, 'memory.max'), 'utf8').trim()
  assert.match(launcherMax, /^\d+$/)
  assert.equal(readFileSync(path.join(launcherRoot, 'memory.swap.max'), 'utf8').trim(), '0')
  const unique = new Map(value.groups.map((group) => [group.group, BigInt(group.memoryMax)]))
  unique.set(launcherGroup, BigInt(launcherMax))
  const total = [...unique.values()].reduce((sum, limit) => sum + limit, 0n)
  assert.ok(total <= 4n * 1024n ** 3n)
  nativeChecks.push(value)
  report.resourceLimitChecks.push({
    label,
    ...value,
    launcherGroup,
    launcherMax,
    uniqueTotalMax: String(total),
  })
  checkpoint()
}
async function launch() {
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
  application = await electron.launch({
    args: ['--ozone-platform=x11', '.'],
    cwd: process.cwd(),
    env: environment,
    timeout: 30_000,
  })
  await bounds('launch')
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(15_000)
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await application.evaluate(({ BrowserWindow }) => {
    const native = BrowserWindow.getAllWindows()[0]
    native.setSize(1440, 900)
    native.focus()
  })
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  await expect.poll(async () => (await api('list')).some(({ id }) => id === projectId)).toBe(true)
  const record = await database.db
    .selectFrom('project_index')
    .selectAll()
    .where('local_project_key', '=', projectId)
    .executeTakeFirstOrThrow()
  assert.equal(record.file_health, 'ready')
  check('Actual isolated startup indexed portable variants through SQLite')
}
async function openProject() {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
  await window
    .locator(`[data-layer-id="${patchId}"]`)
    .getByRole('button', { name: `Select ${patchName}`, exact: true })
    .click()
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
}
async function closeProject(discard = false) {
  await window.keyboard.press('Escape')
  const tab = window.getByRole('tab', { name: title, exact: true })
  await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
  const dialog = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect
    .poll(async () =>
      (await tab.count()) === 0 ? 'closed' : (await dialog.isVisible()) ? 'decision' : 'waiting',
    )
    .not.toBe('waiting')
  if (await tab.count()) {
    assert.equal(discard, true)
    await dialog.getByRole('button', { name: 'Discard Changes', exact: true }).click()
  }
  await expect(tab).toHaveCount(0)
}
async function screenshot(name) {
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const file = path.join(evidenceRoot, `${name}.png`)
  await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push(file)
  checkpoint()
}
const canvas = () => window.getByRole('region', { name: 'Project Canvas', exact: true })
async function sample(label, point) {
  const actual = await canvas()
    .locator('.canvas-area')
    .evaluate((host, point) => {
      const bitmap = host.querySelector('.konvajs-content canvas')
      if (!(bitmap instanceof HTMLCanvasElement)) throw new Error('Live Konva scene is absent')
      const rect = bitmap.getBoundingClientRect()
      const camera = {
        x: Number(host.dataset.cameraX),
        y: Number(host.dataset.cameraY),
        scale: Number(host.dataset.cameraScale),
      }
      const x = ((camera.x + point.x * camera.scale) * bitmap.width) / rect.width
      const y = ((camera.y + point.y * camera.scale) * bitmap.height) / rect.height
      if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height)
        throw new Error('Requested frozen world pixel is outside the live Canvas')
      return {
        camera,
        world: point,
        canvas: { width: bitmap.width, height: bitmap.height, x, y },
        rgba: [...bitmap.getContext('2d').getImageData(Math.floor(x), Math.floor(y), 1, 1).data],
      }
    }, point)
  report.canvasPixels.push({ label, ...actual })
  checkpoint()
  return actual.rgba
}
async function assertActive(value, label) {
  const view = patch(await current())
  assert.equal(view.activeRasterSubLayerId, value.value.id)
  assert.deepEqual(view.activeRaster.transform, {
    rotationDegrees: 0,
    scaleX: 1,
    scaleY: 1,
    x: value.value.bbox.x,
    y: value.value.bbox.y,
  })
  assert.deepEqual(view.boundingBox, authored.boundingBox)
  assert.deepEqual(view.generationDraft, authored.generationDraft)
  assert.deepEqual(view.mask, authored.mask)
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  // Both alternatives cover this literal overlap point; changing the visible anchor changes RGB.
  await expect.poll(() => sample(label, { x: 352, y: 216 })).toEqual(value.color)
  const isGreen = value.value.id === green.value.id
  await expect
    .poll(() => sample(`${label}-exclusive-active`, { x: isGreen ? 200 : 500, y: 216 }))
    .toEqual(value.color)
  assert.notDeepEqual(
    await sample(`${label}-inactive-position`, { x: isGreen ? 500 : 200, y: 216 }),
    isGreen ? purpleColor : greenColor,
    'The other frozen-position image must not remain on the live scene.',
  )
  const resource = await application.evaluate(async ({ net }, url) => {
    const response = await net.fetch(url)
    return { status: response.status, bytes: [...new Uint8Array(await response.arrayBuffer())] }
  }, view.activeRaster.imageUrl)
  assert.equal(resource.status, 200)
  assert.equal(Buffer.from(resource.bytes).equals(value.bytes), true)
  check(`${label}: exact active signed bytes and live frozen-position Canvas pixels`)
}
const browser = () => window.getByRole('dialog', { name: 'Smart Patch variants', exact: true })
const variantRow = (id) => browser().locator(`[data-smart-patch-variant-id="${id}"]`)
async function openVariants() {
  await window
    .getByRole('button', { name: `Browse variants for ${patchName}`, exact: true })
    .click()
  await expect(browser()).toBeVisible()
}
async function hideVariants() {
  await window.keyboard.press('Escape')
  await expect(browser()).toBeHidden()
  await expect(
    window.getByRole('button', { name: `Browse variants for ${patchName}`, exact: true }),
  ).toBeFocused()
}
async function assertUnchanged(before, label) {
  const after = await current()
  assert.equal(after.documentRevision, before.documentRevision)
  assert.equal(after.dirty, before.dirty)
  assert.equal(after.canUndo, before.canUndo)
  assert.equal(after.canRedo, before.canRedo)
  assert.deepEqual(patch(after), patch(before))
  check(label)
}
async function assertDialogBounds(label) {
  const geometry = await browser().evaluate((dialog) => {
    const rect = dialog.getBoundingClientRect()
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      dialog: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      },
      overflow: [
        dialog,
        ...dialog.querySelectorAll(
          '.variants-content, .variants-scroll, .variants-list, .variant-row',
        ),
      ].map((node) => ({
        className: node.className,
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
      })),
    }
  })
  assert.ok(geometry.dialog.x >= 0 && geometry.dialog.y >= 0)
  assert.ok(geometry.dialog.right <= geometry.viewport.width + 1)
  assert.ok(geometry.dialog.bottom <= geometry.viewport.height + 1)
  assert.ok(
    geometry.overflow.every(({ clientWidth, scrollWidth }) => scrollWidth <= clientWidth + 1),
  )
  report.dialogGeometry.push({ label, ...geometry })
  check(label, geometry)
}
async function saveAndRead(expected, label) {
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await current()).dirty).toBe(false)
  await expect(window.locator('.document-state')).toHaveText('Saved')
  const saved = await readIgsPackage(packagePath)
  const actual = saved.project.layers.find(({ id }) => id === patchId)
  assert.equal(actual.kind, 'smart-patch')
  assert.deepEqual(actual.rasterSubLayers, expected)
  assert.deepEqual(actual.boundingBox, authored.boundingBox)
  assert.deepEqual(actual.mask, authored.mask)
  for (const value of expected) {
    const fixture = [green, purple].find(({ value: original }) => original.id === value.id)
    assert.equal((await saved.readMember(value.asset.path)).equals(fixture.bytes), true)
    assert.deepEqual(value.generationProvenance, fixture.value.generationProvenance)
  }
  check(label, { packageSha256: digest(readFileSync(packagePath)), document: saved.project })
  return saved
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
    const identity = latest.processIdentities.find(({ pid }) => pid === application.process().pid)
    const group = latest.groups.find(
      ({ ownedScope, pids }) => ownedScope && pids.includes(identity?.pid),
    )
    assert.ok(identity && group)
    report.ownedSignal = await stopExpiredQualificationProcess({ ...identity, group: group.group })
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
  await prepare()
  await launch()
  await openProject()
  assert.equal((await current()).canUndo, false)
  await assertActive(green, 'initial-green')
  await openVariants()
  await expect(variantRow(green.value.id).getByText('Active', { exact: true })).toBeVisible()
  await expect(variantRow(purple.value.id).getByText('Outdated', { exact: true })).toBeVisible()
  await screenshot('01-native-variant-browser')
  await variantRow(purple.value.id)
    .getByRole('button', { name: `Select variant ${purple.value.name}`, exact: true })
    .click()
  await expect.poll(async () => patch(await current()).activeRasterSubLayerId).toBe(purple.value.id)
  await hideVariants()
  await assertActive(purple, 'selected-purple')
  await openVariants()
  await variantRow(purple.value.id)
    .getByRole('button', { name: `Rename variant ${purple.value.name}`, exact: true })
    .click()
  await browser().getByRole('textbox', { name: 'Variant name', exact: true }).fill(`  ${renamed}  `)
  await browser().getByRole('button', { name: 'Save name', exact: true }).click()
  await expect
    .poll(
      async () =>
        patch(await current()).rasterSubLayers.find(({ id }) => id === purple.value.id)?.name,
    )
    .toBe(renamed)
  const purpleRenamed = { ...purple.value, name: renamed }
  await variantRow(green.value.id)
    .getByRole('button', { name: `Delete variant ${green.value.name}`, exact: true })
    .click()
  await browser()
    .getByRole('button', { name: `Confirm delete variant ${green.value.name}`, exact: true })
    .click()
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(1)
  await expect(variantRow(green.value.id)).toHaveCount(0)
  await screenshot('02-native-renamed-one-variant')
  await hideVariants()
  await assertActive(purple, 'inactive-green-deleted')
  await saveAndRead(
    [purpleRenamed],
    'Native Save persists inactive deletion and exact remaining provenance',
  )
  await canvas().getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(2)
  await assertActive(purple, 'undo-after-deletion-save')
  await canvas().getByRole('button', { name: 'Redo', exact: true }).click()
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(1)
  await canvas().getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(2)
  await saveAndRead(
    [green.value, purpleRenamed],
    'Undo after deletion+Save restores caller-independent green image and both frozen provenances',
  )
  await closeProject()
  await openProject()
  await assertActive(purple, 'reopened-purple')
  await openVariants()
  await expect(variantRow(purple.value.id).getByText(renamed, { exact: true })).toBeVisible()
  await expect(variantRow(purple.value.id).getByText('Active', { exact: true })).toBeVisible()
  await expect(variantRow(green.value.id)).toBeVisible()
  await screenshot('03-native-variants-reopened')

  const beforeCancel = await current()
  const purpleRename = () =>
    variantRow(purple.value.id).getByRole('button', {
      name: `Rename variant ${renamed}`,
      exact: true,
    })
  await purpleRename().click()
  const renameInput = browser().getByRole('textbox', { name: 'Variant name', exact: true })
  await expect(renameInput).toBeFocused()
  await renameInput.fill('Cancelled variant name')
  await renameInput.press('Escape')
  await expect(renameInput).toHaveCount(0)
  await expect(purpleRename()).toBeFocused()
  await expect(variantRow(purple.value.id).getByText(renamed, { exact: true })).toBeVisible()
  await assertUnchanged(
    beforeCancel,
    'Escape cancels rename, preserves the saved document/history and restores its action focus',
  )

  const greenDelete = () =>
    variantRow(green.value.id).getByRole('button', {
      name: `Delete variant ${green.value.name}`,
      exact: true,
    })
  const greenConfirm = () =>
    browser().getByRole('button', {
      name: `Confirm delete variant ${green.value.name}`,
      exact: true,
    })
  await greenDelete().click()
  await expect(greenConfirm()).toBeFocused()
  await greenConfirm().press('Escape')
  await expect(greenConfirm()).toHaveCount(0)
  await expect(greenDelete()).toBeFocused()
  await assertUnchanged(
    beforeCancel,
    'Escape cancels delete confirmation without a document/history change and restores delete focus',
  )
  await greenDelete().click()
  await browser().getByRole('button', { name: 'Cancel delete', exact: true }).click()
  await expect(greenConfirm()).toHaveCount(0)
  await expect(greenDelete()).toBeFocused()
  await assertUnchanged(
    beforeCancel,
    'Explicit Cancel delete preserves both variants and the saved document',
  )

  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1000, 640),
  )
  await expect
    .poll(() => window.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    .toEqual({ width: 1000, height: 640 })
  await assertDialogBounds(
    '1000x640 variants dialog stays within the viewport without horizontal content overflow',
  )
  await screenshot('04-native-variants-narrow')
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900),
  )
  await expect
    .poll(() => window.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    .toEqual({ width: 1440, height: 900 })
  await hideVariants()

  const patchCard = () => window.locator(`[data-layer-id="${patchId}"]`)
  await patchCard()
    .getByRole('button', { name: `Lock ${patchName}`, exact: true })
    .click()
  await expect.poll(async () => patch(await current()).locked).toBe(true)
  const locked = await current()
  await openVariants()
  await expect(
    browser().getByText('Unlock this Patch to select, rename or delete variants.', { exact: true }),
  ).toBeVisible()
  for (const value of [green.value, purpleRenamed]) {
    const row = variantRow(value.id)
    await expect(row).toBeVisible()
    for (const action of ['Select', 'Rename', 'Delete']) {
      await expect(
        row.getByRole('button', { name: `${action} variant ${value.name}`, exact: true }),
      ).toBeDisabled()
    }
  }
  await expect(
    browser().getByRole('region', { name: 'Current generation resources', exact: true }),
  ).toBeVisible()
  await screenshot('05-native-variants-locked')
  await assertUnchanged(
    locked,
    'Locked Patch permits viewing both variants and diagnostics while all variant mutators are disabled',
  )
  await hideVariants()
  await patchCard()
    .getByRole('button', { name: `Unlock ${patchName}`, exact: true })
    .click()
  await expect.poll(async () => patch(await current()).locked).toBe(false)

  await openVariants()
  await variantRow(purple.value.id)
    .getByRole('button', { name: `Delete variant ${renamed}`, exact: true })
    .click()
  await expect(variantRow(purple.value.id).locator('.variant-delete-copy')).toContainText(
    'Another stored variant will become active.',
  )
  await browser()
    .getByRole('button', { name: `Confirm delete variant ${renamed}`, exact: true })
    .click()
  await expect.poll(async () => patch(await current()).activeRasterSubLayerId).toBe(green.value.id)
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(1)
  await expect(variantRow(green.value.id).getByText('Active', { exact: true })).toBeVisible()
  await hideVariants()
  await assertActive(green, 'active-purple-deletion-selects-green-neighbor')
  const beforeFinalDelete = patch(await current())
  await openVariants()
  await greenDelete().click()
  await expect(variantRow(green.value.id).locator('.variant-delete-copy')).toContainText(
    'The Patch will have no raster result.',
  )
  await greenConfirm().click()
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(0)
  await expect(browser().getByText('No variants yet', { exact: true })).toBeVisible()
  const empty = patch(await current())
  assert.equal(empty.activeRasterSubLayerId, null)
  assert.equal(empty.activeRaster, null)
  assert.equal(empty.status, 'empty')
  for (const key of [
    'id',
    'name',
    'visible',
    'locked',
    'opacity',
    'blendMode',
    'boundingBox',
    'internalResolution',
    'generationDraft',
    'mask',
    'maskSettings',
    'coherenceSettings',
  ])
    assert.deepEqual(empty[key], beforeFinalDelete[key])
  await screenshot('06-native-variants-empty')
  await hideVariants()
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  const noRaster = await sample('final-delete-removes-accepted-raster', { x: 352, y: 216 })
  assert.notDeepEqual(noRaster, greenColor)
  assert.notDeepEqual(noRaster, purpleColor)
  await expect(patchCard().locator('.raster-thumbnail')).toHaveCount(0)
  check(
    'Visible final-delete confirmation leaves the same empty Patch authoring/mask with no active raster or old Canvas pixels',
  )
  await canvas().getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(1)
  await assertActive(green, 'undo-final-delete-restores-green')
  await canvas().getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(2)
  assert.deepEqual(
    patch(await current()).rasterSubLayers,
    [green.value, purpleRenamed].map(({ id, name }) => ({ id, name })),
  )
  await assertActive(purple, 'two-undos-restore-purple-and-both-variants')
  await saveAndRead(
    [green.value, purpleRenamed],
    'Native Save after two Undos restores exact two variant names, image bytes and immutable provenances',
  )
  const copy = path.join(evidenceRoot, 'native-smart-patch-variant-lifecycle.igs')
  writeFileSync(copy, readFileSync(packagePath), { flag: 'wx', mode: 0o600 })
  report.evidencePackage = copy
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  const generationState = await window.evaluate(
    (tabId) => window.api.projects.getGenerationState(tabId),
    (await current()).id,
  )
  assert.equal(generationState.ok, true)
  assert.equal(generationState.value.smartPatchSupported, false)
  const status = await window.evaluate(async () => ({
    runtime: await window.api.runtime.getStatus(),
    models: await window.api.models.getCatalog(),
  }))
  assert.equal(status.runtime.ok, true)
  assert.equal(status.runtime.value.kind, 'not-installed')
  assert.deepEqual(status.models, { ok: true, value: [] })
  assert.deepEqual(await database.db.selectFrom('generation_queue_item').select('id').execute(), [])
  assert.deepEqual(report.pageErrors, [])
  check(
    'Lifecycle remains available while absent runtime/models keep public Smart Patch Generate disabled',
  )
  await closeProject()
  await closeNative('final')
  report.finalSourceSha256 = hashes(sourceFiles)
  report.finalBundleSha256 = hashes(bundleFiles)
  assert.deepEqual(report.finalSourceSha256, report.sourceSha256)
  assert.deepEqual(report.finalBundleSha256, report.bundleSha256)
  report.outcome = 'passed'
  report.completedAt = new Date().toISOString()
  checkpoint()
} catch (error) {
  report.outcome = 'failed'
  report.error = { name: error.name, message: error.message, stack: error.stack }
  checkpoint()
  if (window && !window.isClosed())
    await screenshot('failure-before-cleanup').catch(() => undefined)
  throw error
} finally {
  if (application) {
    try {
      if (
        window &&
        !window.isClosed() &&
        (await window.getByRole('tab', { name: title, exact: true }).count())
      )
        await closeProject(true)
    } catch (error) {
      report.uiCleanupError = String(error)
      checkpoint()
    }
    await closeNative('cleanup').catch((error) => {
      report.outcome = 'failed'
      report.cleanupError = String(error)
      checkpoint()
      process.exitCode = 1
    })
  }
  if (database) await database.close()
}
