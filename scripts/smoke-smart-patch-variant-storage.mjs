/** Built native display/Save qualification. Variants are writer-adopted fixtures, not public Add. */
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
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { smartPatchVariantMetadataFixture } from '../src/main/projects/test-fixtures/smart-patch-variant.ts'
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
assert.equal(existsSync(reportFile), false)
const evidenceRoot = path.dirname(reportFile)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const relative = path.relative(artifactRoot, evidenceRoot)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
assert.equal(realpathSync(evidenceRoot), evidenceRoot)
assert.ok(lstatSync(evidenceRoot).isDirectory() && !lstatSync(evidenceRoot).isSymbolicLink())

const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'native-variant-storage-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
mkdirSync(workspace, { recursive: true, mode: 0o700 })
const title = 'Stored Smart Patch variants'
const packagePath = path.join(workspace, `${title}.igs`)
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashes = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const sourceFiles = [
  'scripts/smoke-smart-patch-variant-storage.mjs',
  'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs',
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/shared/api.ts',
  'src/shared/projects/project-schema.ts',
  'src/main/projects/igs-package.ts',
  'src/main/projects/project-session.ts',
  'src/main/projects/project-service.ts',
  'src/main/projects/project-autosave.ts',
  'src/main/projects/project-smart-patch-variant-assets.ts',
  'src/shared/projects/project-layer-views.ts',
  'src/shared/projects/project-generation-target-state.ts',
  'src/main/projects/project-shadow.ts',
  'src/main/projects/project-layer-resource.ts',
  'src/main/projects/project-preview.ts',
  'src/main/projects/project-raster-snapshot.ts',
  'src/main/projects/test-fixtures/smart-patch-variant.ts',
  'src/renderer/components/ProjectView.vue',
  'src/renderer/components/ProjectCanvas.vue',
  'src/renderer/components/ProjectSmartPatchLayerRow.vue',
  'src/renderer/components/project-layer-context.ts',
]
const bundleFiles = [
  'dist/main/main.cjs',
  'dist/preload/preload.cjs',
  'dist/renderer/index.html',
  ...readdirSync('dist/renderer/assets')
    .filter((name) => /\.(?:js|css)$/.test(name))
    .map((name) => `dist/renderer/assets/${name}`),
]
const bbox = { height: 192, width: 256, x: 160, y: 120 }
const color = [40, 180, 90, 255]
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
  pageErrors: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  boundary: {
    actual:
      'Built Electron Home/open, real indexed .igs loader, signed active image resource, Chromium image decode, actual Konva Canvas pixels at frozen world coordinates, visible stored variant card, real bbox field and brush gesture edits, native Save/ZIP readback/close/reopen.',
    fixtures:
      'Production ProjectSession writer adopts two literal ICC RGBA variants plus declared portable provenance before launch. Startup scans the real isolated workspace into SQLite. This is an existing nonempty Patch precondition; public Add/acceptance is not exercised or claimed. No Project replies, models, runtime, workers or inference are fabricated.',
    oracle:
      'Opaque literal 256×192 green active image, distant purple inactive image, exact signed resource/ZIP byte hashes and sampled live scene pixels. Mask painting is actual UI input; it cannot remask or move accepted variant pixels.',
    limits:
      'Root must bound launcher; runner verifies unique launcher/native cgroups total≤4GiB, native≤2GiB, zero swap and finite 300s native deadline. One native actor; no model/runtime installation.',
    excluded:
      'Public Generate/Add, variant selection/removal/history UI, durable acceptance journal, staleness/Compare/Preset and inference/model/quality/release qualification.',
    cleanup:
      'Only root disposes this owned payload after confirmed physical native exit and compact evidence pinning. No reusable ML environment or ordinary app data is touched.',
  },
}
let application, window, database, projectId, patchId, active, inactive
let nativeChecks = []

function checkpoint() {
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
}
function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence })
  checkpoint()
  console.log(`PASS ${name}`)
}
function chunk(name, bytes) {
  const value = Buffer.alloc(bytes.length + 12)
  value.writeUInt32BE(bytes.length, 0)
  value.write(name, 4, 'ascii')
  bytes.copy(value, 8)
  value.writeUInt32BE(crc32(value.subarray(4, -4)), value.length - 4)
  return value
}
/** Input encoder only. The live renderer supplies composed pixels. */
function png(rgba) {
  const profile = readFileSync('worker-python/src/imagegen_worker/srgb.icc')
  assert.equal(digest(profile), IGS_SRGB_ICC_SHA256)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(bbox.width, 0)
  header.writeUInt32BE(bbox.height, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc(bbox.height * (bbox.width * 4 + 1))
  for (let y = 0; y < bbox.height; y++)
    for (let x = 0; x < bbox.width; x++) rows.set(rgba, y * (bbox.width * 4 + 1) + 1 + x * 4)
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('iCCP', Buffer.concat([Buffer.from('srgb\0\0'), deflateSync(profile)])),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
function variant(document, name, rect, rgba) {
  const value = smartPatchVariantMetadataFixture('illustrious')
  const bytes = png(rgba)
  value.name = name
  value.bbox = { ...rect }
  Object.assign(value.asset, {
    bytes: bytes.length,
    height: bbox.height,
    sha256: digest(bytes),
    width: bbox.width,
  })
  const source = value.generationProvenance.layerSourceContext
  source.bbox = { ...rect }
  source.layerId = patchId
  source.sourceDocumentId = document.documentId
  source.sourceDocumentRevision = document.documentRevision
  source.sourceTarget.height = bbox.height
  source.sourceTarget.width = bbox.width
  source.preparedInputs.finalContributionMask.height = bbox.height
  source.preparedInputs.finalContributionMask.width = bbox.width
  const output = value.generationProvenance.executionResultContext.output
  Object.assign(output, {
    byteSize: bytes.length,
    height: bbox.height,
    sha256: digest(bytes),
    width: bbox.width,
  })
  output.contributionAlpha8 = {
    byteSize: bbox.width * bbox.height,
    height: bbox.height,
    sha256: digest(Buffer.alloc(bbox.width * bbox.height, rgba[3])),
    width: bbox.width,
  }
  return { bytes, value }
}
async function prepare() {
  const session = await ProjectSession.create(packagePath, title, {
    placeholdersDir: path.resolve('dist/main/placeholders'),
    scratchDir: path.join(fixtureRoot, 'writer-scratch'),
  })
  projectId = session.localRecoveryKey
  patchId = randomUUID()
  active = variant(session.document, 'Frozen green variant', bbox, color)
  inactive = variant(
    session.document,
    'Stored purple alternate',
    { ...bbox, x: 2400, y: -1800 },
    [120, 40, 180, 255],
  )
  session.applyDocument({
    ...session.document,
    layers: [
      {
        activeRasterSubLayerId: active.value.id,
        blendMode: 'normal',
        boundingBox: { height: 1024, width: 1024, x: 0, y: 0 },
        generationDraft: structuredClone(session.document.generationDraft),
        id: patchId,
        internalResolution: { height: 512, width: 512 },
        kind: 'smart-patch',
        locked: false,
        mask: { asset: null, id: randomUUID(), revision: 0 },
        name: 'Stored Smart Patch',
        opacity: 1,
        rasterSubLayers: [active.value, inactive.value],
        visible: true,
      },
    ],
  })
  await session.save({
    assets: {
      [active.value.asset.path]: { bytes: active.bytes },
      [inactive.value.asset.path]: { bytes: inactive.bytes },
    },
  })
  const saved = await readIgsPackage(packagePath)
  assert.equal(saved.manifest.preview.status, 'unavailable')
  assert.deepEqual(saved.manifest.preview.rect, bbox)
  report.fixture = {
    localProjectKey: projectId,
    documentId: saved.project.documentId,
    patchId,
    activeId: active.value.id,
    inactiveId: inactive.value.id,
    packagePath,
    packageSha256: digest(readFileSync(packagePath)),
    provenanceSource: 'declared literal fixture, adopted through actual ProjectSession writer',
  }
  check('Writer-adopted precondition owns exactly two portable variants and frozen active bounds')
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
  const result = await api('projects', 'open', projectId)
  assert.equal(result.kind, 'opened')
  return result.tab
}
function patch(tab) {
  const found = tab.layers.find((layer) => layer.id === patchId)
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
    'Every observed native group must remain≤2GiB/zero swap',
  )
  const launcherGroup = readFileSync('/proc/self/cgroup', 'utf8')
    .trim()
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3)
  assert.ok(launcherGroup && launcherGroup.startsWith('/') && launcherGroup !== '/')
  const unique = new Map(value.groups.map((group) => [group.group, BigInt(group.memoryMax)]))
  const launcherRoot = `/sys/fs/cgroup${launcherGroup}`
  const launcherMax = readFileSync(path.join(launcherRoot, 'memory.max'), 'utf8').trim()
  assert.match(launcherMax, /^\d+$/)
  assert.equal(readFileSync(path.join(launcherRoot, 'memory.swap.max'), 'utf8').trim(), '0')
  unique.set(launcherGroup, BigInt(launcherMax))
  const total = [...unique.values()].reduce((sum, limit) => sum + limit, 0n)
  assert.ok(total <= 4n * 1024n ** 3n, 'Unique launcher/native memory ceilings must total≤4GiB')
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
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  assert.deepEqual(await api('models', 'getCatalog'), [])
  await expect
    .poll(async () => (await api('projects', 'list')).some((item) => item.id === projectId))
    .toBe(true)
  const row = await database.db
    .selectFrom('project_index')
    .selectAll()
    .where('local_project_key', '=', projectId)
    .executeTakeFirstOrThrow()
  assert.equal(row.file_health, 'ready')
  check('Real startup workspace scan indexed the nonempty Patch with absent runtime/models')
}
async function openProject() {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
}
async function closeProject(discard = false) {
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
async function frames() {
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
}
async function screenshot(name) {
  await frames()
  const file = path.join(evidenceRoot, `${name}.png`)
  await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push(file)
  checkpoint()
}
const canvas = () => window.getByRole('region', { name: 'Project Canvas', exact: true })
async function sample(label) {
  const point = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }
  const actual = await canvas()
    .locator('.canvas-area')
    .evaluate((host, point) => {
      const bitmap = host.querySelector('.konvajs-content canvas')
      if (!(bitmap instanceof HTMLCanvasElement)) throw new Error('Actual Konva scene is absent')
      const rect = bitmap.getBoundingClientRect()
      const camera = {
        x: Number(host.dataset.cameraX),
        y: Number(host.dataset.cameraY),
        scale: Number(host.dataset.cameraScale),
      }
      const x = (camera.x + point.x * camera.scale) * (bitmap.width / rect.width)
      const y = (camera.y + point.y * camera.scale) * (bitmap.height / rect.height)
      if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height)
        throw new Error('Frozen world center is outside the live Canvas')
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
async function assertDisplay(label) {
  const view = patch(await current())
  assert.equal(view.activeRasterSubLayerId, active.value.id)
  assert.equal(view.rasterSubLayers.length, 2)
  assert.equal(view.status, 'stored')
  assert.equal(view.activeRaster.width, bbox.width)
  assert.equal(view.activeRaster.height, bbox.height)
  assert.deepEqual(view.activeRaster.transform, {
    rotationDegrees: 0,
    scaleX: 1,
    scaleY: 1,
    x: bbox.x,
    y: bbox.y,
  })
  const card = window.locator(`[data-layer-id="${patchId}"]`)
  await expect(card.getByText('2 variants · stored', { exact: true })).toBeVisible()
  await expect(card.getByText(active.value.name, { exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Select Stored Smart Patch', exact: true }).click()
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  await expect(
    window.getByText('Smart Patch generation is not available yet.', { exact: true }),
  ).toBeVisible()
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  await expect.poll(() => sample(`${label}-live-canvas`)).toEqual(color)
  const resource = await application.evaluate(async ({ net }, url) => {
    const response = await net.fetch(url)
    return { status: response.status, bytes: [...new Uint8Array(await response.arrayBuffer())] }
  }, view.activeRaster.imageUrl)
  assert.equal(resource.status, 200)
  assert.equal(Buffer.from(resource.bytes).equals(active.bytes), true)
  const decoded = await window.evaluate(
    (url) =>
      new Promise((resolve, reject) => {
        const image = new Image()
        const timer = setTimeout(() => reject(new Error('Active image decode timed out')), 5000)
        image.onload = () => {
          clearTimeout(timer)
          resolve({ width: image.naturalWidth, height: image.naturalHeight })
        }
        image.onerror = () => {
          clearTimeout(timer)
          reject(new Error('The signed active image did not load in Chromium'))
        }
        image.src = url
      }),
    view.activeRaster.imageUrl,
  )
  assert.deepEqual(decoded, { height: bbox.height, width: bbox.width })
  check(
    `${label}: active resource and live frozen-bbox Canvas pixels render; card and closed Generate agree`,
  )
}
async function paintMask() {
  const before = patch(await current()).mask.revision
  await canvas().getByRole('button', { name: 'Brush tool', exact: true }).click()
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-mask-ready', 'true')
  const point = await canvas()
    .locator('.canvas-area')
    .evaluate((host, bbox) => {
      const rect = host.getBoundingClientRect()
      return {
        x:
          rect.left +
          Number(host.dataset.cameraX) +
          (bbox.x + 40) * Number(host.dataset.cameraScale),
        y:
          rect.top +
          Number(host.dataset.cameraY) +
          (bbox.y + 40) * Number(host.dataset.cameraScale),
      }
    }, bbox)
  await window.mouse.move(point.x, point.y)
  await window.mouse.down()
  await window.mouse.up()
  await expect.poll(async () => patch(await current()).mask.revision).toBe(before + 1)
  assert.ok(patch(await current()).mask.asset)
  await canvas().getByRole('button', { name: 'Pan tool', exact: true }).click()
  const hide = window.getByRole('button', { name: 'Hide mask overlay', exact: true })
  if (await hide.isVisible()) await hide.click()
  check('Actual pointer Brush authored an owned mask without replacing either stored variant')
}
async function saveAndVerify() {
  const before = await current()
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await current()).dirty).toBe(false)
  await expect(window.locator('.document-state')).toHaveText('Saved')
  const saved = await readIgsPackage(packagePath)
  const stored = saved.project.layers.find((layer) => layer.id === patchId)
  assert.equal(stored.kind, 'smart-patch')
  assert.equal(stored.activeRasterSubLayerId, active.value.id)
  assert.deepEqual(stored.rasterSubLayers, [active.value, inactive.value])
  assert.deepEqual(stored.boundingBox, patch(before).boundingBox)
  assert.deepEqual(stored.mask, patch(before).mask)
  assert.equal((await saved.readMember(active.value.asset.path)).equals(active.bytes), true)
  assert.equal((await saved.readMember(inactive.value.asset.path)).equals(inactive.bytes), true)
  assert.equal(saved.manifest.preview.status, 'unavailable')
  assert.deepEqual(saved.manifest.preview.rect, bbox)
  const copy = path.join(evidenceRoot, 'native-stored-smart-patch.igs')
  writeFileSync(copy, readFileSync(packagePath), { flag: 'wx', mode: 0o600 })
  check(
    'Native Save preserves both original variant bytes and frozen preview bounds after bbox/mask edits',
    {
      packageSha256: digest(readFileSync(packagePath)),
      evidenceCopy: copy,
      document: saved.project,
    },
  )
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
  await assertDisplay('initial')
  await screenshot('01-native-stored-smart-patch')
  const width = window.locator('input[aria-label="Smart Patch width"]')
  await width.fill('768')
  await width.press('Enter')
  await expect.poll(async () => patch(await current()).boundingBox.width).toBe(768)
  await paintMask()
  await assertDisplay('edited-bbox-mask')
  await screenshot('02-native-stored-smart-patch-edited')
  await saveAndVerify()
  await closeProject()
  await openProject()
  await assertDisplay('reopened')
  await screenshot('03-native-stored-smart-patch-reopened')
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(await api('models', 'getCatalog'), [])
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  assert.equal(
    (await database.db.selectFrom('generation_queue_item').select('id').execute()).length,
    0,
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
