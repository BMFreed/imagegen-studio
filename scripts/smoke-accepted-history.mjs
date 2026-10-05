import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { crc32, deflateSync } from 'node:zlib'
import { _electron as electron, expect } from '@playwright/test'
import Database from 'better-sqlite3'

import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { ProjectShadowStore } from '../src/main/projects/project-shadow.ts'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from '../src/main/projects/test-fixtures/accepted-provenance.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'

const expectRed = process.argv.includes('--expect-red')
assert.ok(
  process.argv.slice(2).every((arg) => arg === '--expect-red'),
  'Only --expect-red is supported.',
)
const artifactRoot = path.resolve(
  process.env.IMAGEGEN_SMOKE_ACCEPTED_HISTORY_ARTIFACTS ??
    path.join(os.tmpdir(), `igs-accepted-history-artifacts-${Date.now()}`),
)
mkdirSync(artifactRoot, { recursive: true, mode: 0o700 })
const dataRoot = mkdtempSync(path.join(os.tmpdir(), 'igs-accepted-history-smoke-'))
const appDataRoot = path.join(dataRoot, 'data', 'imagegen-studio')
const projectRoot = path.join(appDataRoot, 'workspaces', 'Uncategorized')
mkdirSync(projectRoot, { recursive: true })
const roots = {
  placeholdersDir: path.resolve('dist/main/placeholders'),
  scratchDir: path.join(dataRoot, 'scratch'),
}
const environment = {
  ...process.env,
  IMAGEGEN_TEST_IMAGE_WORKER: '1',
  NODE_ENV: 'test',
  XDG_CONFIG_HOME: path.join(dataRoot, 'config'),
  XDG_DATA_HOME: path.join(dataRoot, 'data'),
}
delete environment.ELECTRON_RUN_AS_NODE
delete environment.IMAGEGEN_DEV_SERVER_URL
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const sourceFiles = [
  'scripts/smoke-accepted-history.mjs',
  'scripts/native-smoke-window.mjs',
  'src/main/projects/igs-package.ts',
  'src/main/projects/project-session.ts',
  'src/main/projects/project-shadow.ts',
  'src/main/projects/test-fixtures/accepted-provenance.ts',
]
const bundleFiles = [
  'dist/main/main.cjs',
  'dist/preload/preload.cjs',
  'dist/renderer/index.html',
  ...readdirSync('dist/renderer/assets')
    .filter((name) => /\.(?:js|css)$/.test(name))
    .map((name) => `dist/renderer/assets/${name}`),
  ...readdirSync('dist/main/migrations').map((name) => `dist/main/migrations/${name}`),
]
const hashes = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const sourceSha256 = hashes(sourceFiles)
const bundleSha256 = hashes(bundleFiles)
const report = {
  checks: [],
  pageErrors: [],
  screenshots: [],
  mode: expectRed ? 'expect-red' : 'green',
  sourceSha256,
  bundleSha256,
  boundary: {
    actual:
      'Built Electron renderer, canonical native smoke helper, production preload/IPC/Main, startup workspace scan, .igs loader, SQLite derived catalog, signed saved-image resources, Project Open/recovery and owning-layer selection. Renderer img loading proves display; Electron Main net.fetch verifies exact bytes through the ordinary session protocol without expanding renderer connect-src.',
    fixtures:
      'Real ProjectSession saves and ProjectShadowStore writes establish 96 saved accepted records across two projects and a portable copy. Source accepted-provenance fixtures supply ICC PNGs and frozen inference metadata; no inference/model installation or browser catalog response is simulated.',
    input:
      'Physical keyboard input is blocked by the canonical before-input-event helper; scripted CDP actions drive the actual built DOM. Native BrowserWindow screenshots remain visible.',
  },
}
let application
let window
let fixtures
const modal = () => window.getByRole('dialog', { name: 'Saved generations', exact: true })
const check = (name, evidence = {}) => report.checks.push({ name, ...evidence })
async function screenshot(name) {
  const file = path.join(artifactRoot, `${name}.png`)
  await window.screenshot({ animations: 'disabled', path: file })
  report.screenshots.push(file)
}
async function launch() {
  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  window = await isolateNativeSmokeWindow(application)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  application.process().stderr?.on('data', (chunk) => process.stderr.write(chunk))
  await window.waitForURL('**/index.html')
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1380, 900),
  )
}
async function stop() {
  if (!application) return
  const process = application.process()
  const exited = new Promise((resolve) => process.once('exit', resolve))
  if (process.exitCode === null && !process.killed) {
    assert.equal(process.kill('SIGKILL'), true)
    await Promise.race([
      exited,
      delay(10_000).then(() => {
        throw new Error('Electron did not exit after the smoke restart.')
      }),
    ])
  }
  application = undefined
  window = undefined
}
function fixtureRedPng() {
  const profile = readFileSync('worker-python/src/imagegen_worker/srgb.icc')
  const chunk = (name, payload) => {
    const type = Buffer.from(name, 'ascii')
    const bytes = Buffer.alloc(payload.length + 12)
    bytes.writeUInt32BE(payload.length, 0)
    type.copy(bytes, 4)
    payload.copy(bytes, 8)
    bytes.writeUInt32BE(crc32(Buffer.concat([type, payload])), payload.length + 8)
    return bytes
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(16, 0)
  header.writeUInt32BE(16, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc(65 * 16)
  for (let y = 0; y < 16; y += 1)
    for (let x = 0; x < 16; x += 1) {
      const offset = y * 65 + 1 + x * 4
      rows[offset] = 220
      rows[offset + 1] = 36
      rows[offset + 2] = 48
      rows[offset + 3] = 255
    }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(profile)])),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
async function savedFixture(title) {
  const session = await ProjectSession.create(path.join(projectRoot, `${title}.igs`), title, roots)
  const original = await acceptedOutputPngFixture(8, 8)
  const current = await acceptedOutputPngFixture(16, 16)
  const layers = Array.from({ length: 32 }, (_, position) => {
    const id = randomUUID()
    const provenance = acceptedRasterProvenanceFixture(session.document, original, {
      width: 8,
      height: 8,
      x: position * 24,
      y: 24,
    })
    provenance.executionResultContext.acceptedAt = new Date(
      Date.UTC(2026, 9, 2, 12, 0, position),
    ).toISOString()
    provenance.generationConfiguration.sampling.actualSeed = position === 31 ? 0 : 200 + position
    provenance.generationConfiguration.model.displayName = 'Copied checkpoint metadata'
    return {
      asset: {
        bytes: current.length,
        height: 16,
        path: `assets/layers/${id}.png`,
        sha256: digest(current),
        width: 16,
      },
      blendMode: 'normal',
      generationProvenance: provenance,
      id,
      kind: 'raster',
      locked: false,
      name:
        position === 31
          ? 'Hidden seed-zero target'
          : position === 0
            ? `Accepted image 01 ${'with a long descriptive name '.repeat(3)}`
            : `Accepted image ${String(position + 1).padStart(2, '0')}`,
      opacity: 1,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: position * 24, y: 24 },
      visible: position !== 31,
    }
  })
  session.applyDocument({ ...session.document, layers })
  await session.save({
    assets: Object.fromEntries(layers.map((layer) => [layer.asset.path, { bytes: current }])),
  })
  const saved = (await readIgsPackage(session.filePath)).project
  assert.equal(saved.layers.length, 32)
  return {
    bytes: readFileSync(session.filePath),
    current,
    document: saved,
    key: session.localRecoveryKey,
    path: session.filePath,
    session,
    target: saved.layers[31],
    title,
  }
}
async function prepareFixtures() {
  const first = await savedFixture('History First')
  const second = await savedFixture('History Second')
  const copiedPath = path.join(projectRoot, 'History First portable copy.igs')
  copyFileSync(first.path, copiedPath)
  const copiedSession = await ProjectSession.open(copiedPath, roots)
  // A portable copy keeps its document/layer identities; its title may evolve independently.
  copiedSession.applyDocument({ ...copiedSession.document, title: 'History First copy' })
  await copiedSession.save()
  const copy = {
    ...first,
    bytes: readFileSync(copiedPath),
    document: copiedSession.document,
    key: copiedSession.localRecoveryKey,
    path: copiedPath,
    session: copiedSession,
    title: 'History First copy',
  }
  const shadow = new ProjectShadowStore(path.join(appDataRoot, 'autosave'))
  copy.session.applyDocument({
    ...copy.document,
    layers: copy.document.layers.filter((layer) => layer.id !== copy.target.id),
  })
  await shadow.write({
    document: copy.session.document,
    projectPath: copy.path,
    savedDocument: copy.document,
  })
  const red = fixtureRedPng()
  const changedLayer = second.document.layers[30]
  second.session.applyDocument({
    ...second.document,
    primaryBbox: { ...second.document.primaryBbox, x: 96 },
    layers: second.document.layers.map((layer) =>
      layer.id === changedLayer.id
        ? { ...layer, asset: { ...layer.asset, bytes: red.length, sha256: digest(red) } }
        : layer,
    ),
  })
  await shadow.write({
    dirtyAssets: { [changedLayer.asset.path]: { bytes: red } },
    document: second.session.document,
    projectPath: second.path,
    savedDocument: second.document,
  })
  second.dirtyAssetLayer = changedLayer
  second.red = red
  second.recoveredDocument = second.session.document
  for (const fixture of [first, second, copy])
    assert.deepEqual(readFileSync(fixture.path), fixture.bytes)
  return { first, second, copy }
}
async function apiHistory(cursor = null) {
  const result = await window.evaluate(
    (value) => window.api.projects.getAcceptedResultHistory(value),
    cursor,
  )
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function openModal() {
  await window.getByRole('button', { name: 'Open saved generations', exact: true }).click()
  await expect(modal()).toBeVisible()
  await expect(
    modal().getByRole('list', { name: 'Saved generations', exact: true }),
  ).toHaveAttribute('aria-busy', 'false')
  return await apiHistory()
}
function row(fixture, layer = fixture.target) {
  return modal().locator(`article[data-project-key="${fixture.key}"][data-layer-id="${layer.id}"]`)
}
async function clickResult(fixture, layer = fixture.target) {
  await row(fixture, layer)
    .getByRole('button', { name: `Open result ${layer.name} in ${fixture.title}`, exact: true })
    .click()
}
async function opened(fixture) {
  const result = await window.evaluate((key) => window.api.projects.open(key), fixture.key)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.value.kind, 'opened')
  return result.value.tab
}
async function imageBytes(url) {
  // The renderer intentionally allows these resources only in img-src, not connect-src.
  // Electron net.fetch uses the same registered default-session protocol handler as the image.
  const response = await application.evaluate(async ({ net }, value) => {
    const result = await net.fetch(value)
    return { status: result.status, bytes: [...new Uint8Array(await result.arrayBuffer())] }
  }, url)
  assert.equal(response.status, 200)
  return Buffer.from(response.bytes)
}
async function assertPreview(fixture, layer = fixture.target) {
  const entry = (await apiHistory()).items.find(
    (item) => item.projectKey === fixture.key && item.layerId === layer.id,
  )
  assert.ok(entry)
  assert.match(entry.imageUrl, /^igs-history:\/\/result\//)
  assert.equal(entry.width, 8)
  assert.equal(entry.height, 8)
  assert.equal(entry.seed, layer.generationProvenance.generationConfiguration.sampling.actualSeed)
  const image = row(fixture, layer).locator('img')
  await image.scrollIntoViewIfNeeded()
  await expect(image).toHaveAttribute('src', entry.imageUrl)
  await expect
    .poll(() =>
      image.evaluate(
        (element) =>
          element.complete && element.naturalWidth === 16 && element.naturalHeight === 16,
      ),
    )
    .toBe(true)
  assert.deepEqual(await imageBytes(entry.imageUrl), fixture.current)
  return entry
}
async function selectedAndRevealed(fixture) {
  const stack = window.getByLabel('Project layers', { exact: true })
  const target = stack.locator(`[data-layer-id="${fixture.target.id}"]`)
  await expect(
    target.getByRole('button', { name: `Select ${fixture.target.name}`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    target.getByRole('button', { name: `Show ${fixture.target.name}`, exact: true }),
  ).toBeVisible()
  assert.equal(
    await target.evaluate((element) => {
      const panel = element.closest('[aria-label="Project layers"]')
      const bounds = element.getBoundingClientRect()
      const visible = panel.getBoundingClientRect()
      return bounds.top >= visible.top - 1 && bounds.bottom <= visible.bottom + 1
    }),
    true,
    'History navigation reveals the owning row in the layer panel.',
  )
}
function persistedIndex() {
  const database = new Database(path.join(appDataRoot, 'database', 'app.sqlite'), {
    readonly: true,
    fileMustExist: true,
  })
  try {
    return database
      .prepare(
        'SELECT * FROM project_accepted_result_index ORDER BY accepted_at DESC, local_project_key, layer_id',
      )
      .all()
  } finally {
    database.close()
  }
}
async function assertModalGeometry() {
  const actual = await modal().evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const scroll = element.querySelector('.history-scroll')
    return {
      x: rect.left,
      y: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
    }
  })
  assert.ok(
    actual.x >= 0 &&
      actual.y >= 0 &&
      actual.right <= actual.viewportWidth + 1 &&
      actual.bottom <= actual.viewportHeight + 1,
    JSON.stringify(actual),
  )
  assert.ok(actual.scrollHeight > actual.clientHeight && actual.clientHeight > 0)
  await expect(modal().getByRole('button', { name: 'Close', exact: true })).toBeVisible()
  return actual
}
async function installSealProbe() {
  await application.evaluate(({ ipcMain }) => {
    const channel = 'projects:seal-prompt-history'
    const original = ipcMain._invokeHandlers.get(channel)
    if (typeof original !== 'function') throw new Error('Real prompt-history handler is missing.')
    globalThis.igsAcceptedHistorySealProbe = { calls: [], original }
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      globalThis.igsAcceptedHistorySealProbe.calls.push(args)
      return await original(event, ...args)
    })
  })
}
async function restoreSealProbe() {
  return await application.evaluate(({ ipcMain }) => {
    const probe = globalThis.igsAcceptedHistorySealProbe
    ipcMain.removeHandler('projects:seal-prompt-history')
    ipcMain.handle('projects:seal-prompt-history', probe.original)
    delete globalThis.igsAcceptedHistorySealProbe
    return probe.calls
  })
}
async function installOpenGate(projectKey) {
  await application.evaluate(({ ipcMain }, key) => {
    const original = ipcMain._invokeHandlers.get('projects:open')
    if (typeof original !== 'function') throw new Error('Real Project Open handler is missing.')
    const gate = { finished: false, original, resultKind: null, started: false }
    globalThis.igsAcceptedHistoryOpenGate = gate
    ipcMain.removeHandler('projects:open')
    ipcMain.handle('projects:open', async (event, ...args) => {
      if (args[0] !== key) return await original(event, ...args)
      gate.started = true
      await new Promise((resolve) => {
        gate.release = resolve
      })
      try {
        const result = await original(event, ...args)
        gate.resultKind = result.ok ? result.value.kind : result.error.code
        return result
      } finally {
        gate.finished = true
      }
    })
  }, projectKey)
}
async function openGateState() {
  return await application.evaluate(() => {
    const gate = globalThis.igsAcceptedHistoryOpenGate
    return { finished: gate.finished, resultKind: gate.resultKind, started: gate.started }
  })
}
async function restoreOpenGate() {
  await application.evaluate(({ ipcMain }) => {
    const gate = globalThis.igsAcceptedHistoryOpenGate
    gate.release?.()
    ipcMain.removeHandler('projects:open')
    ipcMain.handle('projects:open', gate.original)
    delete globalThis.igsAcceptedHistoryOpenGate
  })
}
async function assertPreloadRejectsMalformedPages() {
  await application.evaluate(({ ipcMain }) => {
    const channel = 'projects:get-accepted-result-history'
    const original = ipcMain._invokeHandlers.get(channel)
    if (typeof original !== 'function') throw new Error('Real accepted history handler is missing.')
    globalThis.igsAcceptedHistoryPageProbe = { mode: null, original }
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      const response = await original(event, ...args)
      if (!response.ok) return response
      const changed = structuredClone(response)
      if (globalThis.igsAcceptedHistoryPageProbe.mode === 'private-path')
        changed.value.canonicalPath = '/private/untrusted/result.igs'
      if (globalThis.igsAcceptedHistoryPageProbe.mode === 'over-limit') {
        changed.value.items.push({
          ...changed.value.items[0],
          layerId: '00112233-4455-4677-8899-aabbccddeeff',
          imageUrl: null,
        })
        changed.value.nextCursor = null
      }
      if (globalThis.igsAcceptedHistoryPageProbe.mode === 'foreign-preview')
        changed.value.items[0].documentRevision = '00112233-4455-4677-8899-aabbccddeeff'
      return changed
    })
  })
  try {
    for (const mode of ['private-path', 'over-limit', 'foreign-preview']) {
      await application.evaluate((_, value) => {
        globalThis.igsAcceptedHistoryPageProbe.mode = value
      }, mode)
      assert.equal(
        await application.evaluate(() => globalThis.igsAcceptedHistoryPageProbe.mode),
        mode,
      )
      const observed = await window.evaluate(() => window.api.projects.getAcceptedResultHistory())
      assert.equal(observed.ok, false, mode)
      assert.equal(observed.error.code, 'IPC_INVALID_RESPONSE', mode)
    }
  } finally {
    await application.evaluate(({ ipcMain }) => {
      const probe = globalThis.igsAcceptedHistoryPageProbe
      ipcMain.removeHandler('projects:get-accepted-result-history')
      ipcMain.handle('projects:get-accepted-result-history', probe.original)
      delete globalThis.igsAcceptedHistoryPageProbe
    })
  }
  assert.equal((await apiHistory()).totalCount, 96)
  check(
    'Actual preload rejects controlled Main response corruption (private paths, over-limit pages and foreign preview binding), then accepts the restored real catalog',
  )
}

try {
  fixtures = await prepareFixtures()
  await launch()
  const home = await window.evaluate(() => window.api.projects.list())
  assert.equal(home.ok, true)
  assert.equal(home.value.length, 3)
  assert.equal(new Set(home.value.map((project) => project.id)).size, 3)
  for (const fixture of Object.values(fixtures)) {
    assert.ok(
      home.value.some((project) => project.id === fixture.key && project.health === 'ready'),
    )
    await expect(
      window.getByRole('button', { name: `Open ${fixture.title}`, exact: true }),
    ).toBeVisible()
  }
  await expect(window.locator('.project-list article.project-row')).toHaveCount(3)
  check(
    'Valid built Home discovers three actual saved .igs files before testing the feature entrypoint',
    { projectKeys: home.value.map((project) => project.id) },
  )
  await screenshot('00-home-valid')
  const entrypointCount = await window
    .getByRole('button', { name: 'Open saved generations', exact: true })
    .count()
  if (expectRed) {
    const cause = new Error(
      entrypointCount === 0
        ? 'Feature RED: rendered Home has no Open saved generations entrypoint.'
        : 'Expected feature RED was not observed: the saved accepted-results entrypoint already exists.',
    )
    cause.code =
      entrypointCount === 0 ? 'ACCEPTED_HISTORY_ENTRYPOINT_MISSING' : 'EXPECTED_RED_NOT_OBSERVED'
    throw cause
  }
  assert.equal(entrypointCount, 1)
  const initialIndex = persistedIndex()
  assert.equal(initialIndex.length, 96)
  const firstPage = await openModal()
  assert.equal(firstPage.totalCount, 96)
  assert.equal(firstPage.items.length, 50)
  assert.ok(firstPage.nextCursor)
  assert.deepEqual(
    await modal()
      .locator('article')
      .evaluateAll((elements) =>
        elements.map((element) => [element.dataset.projectKey, element.dataset.layerId]),
      ),
    firstPage.items.map((item) => [item.projectKey, item.layerId]),
  )
  const secondPage = await apiHistory(firstPage.nextCursor)
  assert.equal(secondPage.totalCount, 96)
  assert.equal(secondPage.items.length, 46)
  assert.equal(secondPage.nextCursor, null)
  const actual = [...firstPage.items, ...secondPage.items]
  assert.equal(new Set(actual.map((item) => `${item.projectKey}:${item.layerId}`)).size, 96)
  assert.deepEqual(
    actual.map((item) => [item.projectKey, item.layerId, item.seed, item.width, item.height]),
    initialIndex.map((item) => [
      item.local_project_key,
      item.layer_id,
      item.actual_seed,
      item.output_width,
      item.output_height,
    ]),
  )
  assert.ok(actual.every((item) => !('canonicalPath' in item) && !('assetPath' in item)))
  await assertPreview(fixtures.first)
  check(
    'Actual preload/Main catalog and two DOM pages preserve all 96 copied owning identities and original 8px output versus current 16px previews',
    { pageSizes: [50, 46], count: 96 },
  )
  const normal = await assertModalGeometry()
  await screenshot('01-history-home-normal')
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(900, 620),
  )
  const compact = await assertModalGeometry()
  await screenshot('02-history-home-compact')
  check(
    'Native normal and compact modal stays inside its viewport with a full-height scroll area and visible footer',
    { normal, compact },
  )
  await modal().getByRole('button', { name: 'Older results', exact: true }).click()
  await expect(modal().getByRole('listitem')).toHaveCount(46)
  await expect(modal().getByRole('button', { name: 'Older results', exact: true })).toBeDisabled()
  assert.deepEqual(
    await modal()
      .locator('article')
      .evaluateAll((elements) =>
        elements.map((element) => [element.dataset.projectKey, element.dataset.layerId]),
      ),
    secondPage.items.map((item) => [item.projectKey, item.layerId]),
  )
  await screenshot('03-history-older-page-compact')
  await modal().getByRole('button', { name: 'Newer results', exact: true }).click()
  await expect(modal().getByRole('listitem')).toHaveCount(50)
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1380, 900),
  )
  await clickResult(fixtures.first)
  await expect(modal()).toHaveCount(0)
  await expect(window.getByRole('tab', { name: fixtures.first.title, exact: true })).toBeVisible()
  await selectedAndRevealed(fixtures.first)
  const cleanBefore = await opened(fixtures.first)
  assert.equal(cleanBefore.dirty, false)
  assert.equal(cleanBefore.canUndo, false)
  assert.equal(
    cleanBefore.layers.find((layer) => layer.id === fixtures.first.target.id).visible,
    false,
  )
  await screenshot('04-home-navigation-hidden-layer')
  await installSealProbe()
  let sealCalls
  try {
    await openModal()
    await clickResult(fixtures.first)
    await expect(modal()).toHaveCount(0)
    await selectedAndRevealed(fixtures.first)
  } finally {
    sealCalls = await restoreSealProbe()
  }
  assert.deepEqual(
    sealCalls,
    [],
    'Same active-target history navigation must not seal prompt history.',
  )
  assert.deepEqual(await opened(fixtures.first), cleanBefore)
  assert.deepEqual(persistedIndex(), initialIndex)
  assert.deepEqual(readFileSync(fixtures.first.path), fixtures.first.bytes)
  check(
    'Home and Project entrypoints select/reveal the exact hidden owning layer without visibility, dirty, Undo or .igs mutation',
  )
  check(
    'Same active-target history navigation calls the real prompt-history seal handler zero times',
  )

  const visibleLayer = fixtures.first.document.layers[30]
  const visibleRow = window
    .getByLabel('Project layers', { exact: true })
    .locator(`[data-layer-id="${visibleLayer.id}"]`)
  await visibleRow.getByRole('button', { name: `Select ${visibleLayer.name}`, exact: true }).click()
  const opacity = window.locator('input[aria-label="Layer opacity"]')
  await opacity.fill('25')
  await opacity.press('Enter')
  await expect
    .poll(
      async () =>
        (await opened(fixtures.first)).layers.find((layer) => layer.id === visibleLayer.id).opacity,
    )
    .toBe(0.25)
  const dirtyBefore = await opened(fixtures.first)
  assert.equal(dirtyBefore.dirty, true)
  await openModal()
  await assertPreview(fixtures.first)
  await clickResult(fixtures.first)
  await expect(modal()).toHaveCount(0)
  await selectedAndRevealed(fixtures.first)
  assert.deepEqual(await opened(fixtures.first), dirtyBefore)
  assert.deepEqual(readFileSync(fixtures.first.path), fixtures.first.bytes)
  check(
    'Navigating a saved result in an already dirty tab preserves its current opacity edits, Undo and saved bytes',
  )

  await openModal()
  await clickResult(fixtures.copy)
  const recovery = () => window.getByRole('dialog', { name: 'Recovery available', exact: true })
  await expect(recovery()).toBeVisible()
  await screenshot('05-copy-recovery-cancel')
  await recovery().getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(recovery()).toHaveCount(0)
  assert.equal(
    (await window.evaluate(() => window.api.projects.list())).value.find(
      (project) => project.id === fixtures.copy.key,
    ).recoveryStatus,
    'recoverable',
  )
  // Cancel clears that target intent. A later ordinary Open/Recover must retain the removed layer.
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: `Open ${fixtures.copy.title}`, exact: true }).click()
  await expect(recovery()).toBeVisible()
  await recovery().getByRole('button', { name: 'Recover', exact: true }).click()
  await expect(recovery()).toHaveCount(0)
  const removedBefore = await opened(fixtures.copy)
  assert.equal(removedBefore.dirty, true)
  assert.equal(
    removedBefore.layers.some((layer) => layer.id === fixtures.copy.target.id),
    false,
  )
  await openModal()
  await clickResult(fixtures.copy)
  await expect(modal()).toHaveCount(0)
  await expect(
    window.getByText(
      'This saved result is not available in the current project. Your unsaved changes were preserved.',
      { exact: true },
    ),
  ).toBeVisible()
  assert.deepEqual(await opened(fixtures.copy), removedBefore)
  assert.deepEqual(readFileSync(fixtures.copy.path), fixtures.copy.bytes)
  await screenshot('06-dirty-removed-owning-layer-preserved')
  check(
    'Ordinary Recover and later saved-result navigation preserve a dirty removed owning layer in the copied project',
  )

  await openModal()
  await clickResult(fixtures.second)
  await expect(recovery()).toBeVisible()
  await recovery().getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(recovery()).toHaveCount(0)
  await expect(window.getByRole('tab', { name: fixtures.second.title, exact: true })).toHaveCount(0)
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: `Open ${fixtures.second.title}`, exact: true }).click()
  await expect(recovery()).toBeVisible()
  await recovery().getByRole('button', { name: 'Recover', exact: true }).click()
  await expect(recovery()).toHaveCount(0)
  await expect(
    window
      .getByLabel('Project layers', { exact: true })
      .locator(`[data-layer-id="${fixtures.second.target.id}"]`)
      .getByRole('button', { name: `Select ${fixtures.second.target.name}`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  assert.equal(
    (await opened(fixtures.second)).layers.some((layer) => layer.id === fixtures.second.target.id),
    true,
  )
  await screenshot('06b-canceled-present-target-not-selected')
  check(
    'Cancel consumes a present-layer history intent: subsequent ordinary Home Open/Recover keeps that target unselected',
  )
  await openModal()
  await clickResult(fixtures.second)
  await expect(modal()).toHaveCount(0)
  await selectedAndRevealed(fixtures.second)
  const secondBefore = await opened(fixtures.second)
  assert.equal(secondBefore.dirty, true)
  assert.deepEqual(secondBefore.primaryBbox, fixtures.second.recoveredDocument.primaryBbox)
  assert.equal(
    secondBefore.layers.find((layer) => layer.id === fixtures.second.target.id).visible,
    false,
  )
  const dirtyNeighbor = secondBefore.layers.find(
    (layer) => layer.id === fixtures.second.dirtyAssetLayer.id,
  )
  assert.deepEqual(await imageBytes(dirtyNeighbor.imageUrl), fixtures.second.red)
  await openModal()
  const savedNeighbor = await assertPreview(fixtures.second, fixtures.second.dirtyAssetLayer)
  assert.notEqual(digest(await imageBytes(dirtyNeighbor.imageUrl)), savedNeighbor.assetSha256)
  await screenshot('07-saved-preview-versus-dirty-current-asset')
  await clickResult(fixtures.second, fixtures.second.dirtyAssetLayer)
  await expect(modal()).toHaveCount(0)
  await expect(
    window.getByText(
      'This saved result is not available in the current project. Your unsaved changes were preserved.',
      { exact: true },
    ),
  ).toBeVisible()
  assert.deepEqual(await opened(fixtures.second), secondBefore)
  assert.deepEqual(readFileSync(fixtures.second.path), fixtures.second.bytes)
  check(
    'A fresh history request selects the present layer; saved blue preview stays distinct from the dirty red asset and that mismatched owning layer is refused without overwriting edits',
  )

  // Establish a genuinely clean, closed First fixture for the later delayed Open control.
  // Real UI Undo restores the earlier opacity edit; ordinary clean Close flushes its shadow.
  await window.getByRole('tab', { name: fixtures.first.title, exact: true }).click()
  await window.getByRole('button', { name: 'Edit menu', exact: true }).click()
  await window.locator('.n-dropdown-menu').getByText('Undo · Ctrl+Z', { exact: true }).click()
  assert.equal((await opened(fixtures.first)).dirty, false)
  await window.getByRole('button', { name: `Close ${fixtures.first.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: fixtures.first.title, exact: true })).toHaveCount(0)
  assert.deepEqual(readFileSync(fixtures.first.path), fixtures.first.bytes)
  await stop()
  await launch()
  await openModal()
  await clickResult(fixtures.second)
  await expect(recovery()).toBeVisible()
  await recovery().getByRole('button', { name: 'Recover', exact: true }).click()
  await expect(recovery()).toHaveCount(0)
  await selectedAndRevealed(fixtures.second)
  const recoveredAfterRestart = await opened(fixtures.second)
  assert.equal(recoveredAfterRestart.dirty, true)
  assert.deepEqual(recoveredAfterRestart.primaryBbox, fixtures.second.recoveredDocument.primaryBbox)
  assert.deepEqual(readFileSync(fixtures.second.path), fixtures.second.bytes)
  check(
    'After a real process restart, Recover retains the history intent and selects/reveals the exact present owning layer without changing saved bytes',
  )
  await openModal()
  await clickResult(fixtures.copy)
  await expect(recovery()).toBeVisible()
  await recovery()
    .getByRole('button', { name: 'Discard Recovery and Open Saved', exact: true })
    .click()
  await expect(recovery()).toHaveCount(0)
  await expect(
    window
      .getByLabel('Project layers', { exact: true })
      .locator(`[data-layer-id="${fixtures.copy.target.id}"]`)
      .getByRole('button', { name: `Select ${fixtures.copy.target.name}`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  const discarded = await opened(fixtures.copy)
  assert.equal(discarded.dirty, false)
  assert.equal(discarded.layers.length, 32)
  assert.equal(
    discarded.layers.find((layer) => layer.id === fixtures.copy.target.id).visible,
    false,
  )
  assert.deepEqual(readFileSync(fixtures.copy.path), fixtures.copy.bytes)
  await screenshot('08-discard-recovery-cancels-saved-layer-focus')
  check(
    'Explicit Discard Recovery opens the clean saved copied project and cancels pending history focus; the hidden target stays unselected',
  )

  await installOpenGate(fixtures.first.key)
  try {
    await openModal()
    await clickResult(fixtures.first)
    await expect.poll(async () => (await openGateState()).started).toBe(true)
    await window.getByRole('tab', { name: 'Home', exact: true }).click()
    await expect(window.getByRole('tab', { name: 'Home', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(
      window.getByRole('button', { name: 'New Project', exact: true }).first(),
    ).toBeDisabled()
    await application.evaluate(() => globalThis.igsAcceptedHistoryOpenGate.release())
    await expect.poll(async () => (await openGateState()).finished).toBe(true)
    assert.equal((await openGateState()).resultKind, 'opened')
    // This actual busy->enabled transition means the renderer consumed the late IPC reply.
    await expect(
      window.getByRole('button', { name: 'New Project', exact: true }).first(),
    ).toBeEnabled()
    await expect(window.getByRole('tab', { name: 'Home', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(
      window.getByRole('tab', { name: fixtures.first.title, exact: true }),
    ).toHaveAttribute('aria-selected', 'false')
    await expect(recovery()).toHaveCount(0)
    await screenshot('08b-late-open-retains-manual-home-context')
  } finally {
    await restoreOpenGate()
  }
  await window.getByRole('tab', { name: fixtures.first.title, exact: true }).click()
  await expect(
    window
      .getByLabel('Project layers', { exact: true })
      .locator(`[data-layer-id="${fixtures.first.target.id}"]`)
      .getByRole('button', { name: `Select ${fixtures.first.target.name}`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  assert.equal((await opened(fixtures.first)).dirty, false)
  assert.deepEqual(readFileSync(fixtures.first.path), fixtures.first.bytes)
  check(
    'Switching to Home during a paused real Main Open keeps Home active after the late reply; the clean background tab opens normally later and carries no stale owning-layer focus',
  )
  await window.getByRole('button', { name: `Close ${fixtures.first.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: fixtures.first.title, exact: true })).toHaveCount(0)
  // Tab removal precedes the real workspace rescan at the end of Close. Await its public idle state.
  await expect(
    window.getByRole('button', { name: 'New Project', exact: true }).first(),
  ).toBeEnabled()

  await openModal()
  await assertPreview(fixtures.first)
  const copyBeforeStale = await opened(fixtures.copy)
  writeFileSync(
    fixtures.first.path,
    Buffer.from('controlled corrupted source after catalog display'),
  )
  await clickResult(fixtures.first)
  await expect(modal()).toBeVisible()
  await expect(
    modal().getByText('This saved result changed or is unavailable. Refresh saved generations.', {
      exact: true,
    }),
  ).toBeVisible()
  assert.equal(
    await window.getByRole('tab', { name: fixtures.first.title, exact: true }).count(),
    0,
  )
  assert.deepEqual(await opened(fixtures.copy), copyBeforeStale)
  await screenshot('09-stale-closed-file-refused')
  writeFileSync(fixtures.first.path, fixtures.first.bytes)
  await modal().getByRole('button', { name: 'Refresh saved generations', exact: true }).click()
  await expect(
    modal().getByRole('list', { name: 'Saved generations', exact: true }),
  ).toHaveAttribute('aria-busy', 'false')
  assert.equal((await apiHistory()).totalCount, 96)
  await assertPreview(fixtures.first)
  await modal().getByRole('button', { name: 'Close', exact: true }).click()
  check(
    'A stale displayed row refuses a changed closed .igs without changing the active project; restored source plus real Refresh repairs previews and the catalog',
  )
  await assertPreloadRejectsMalformedPages()
  for (const fixture of Object.values(fixtures))
    assert.deepEqual(readFileSync(fixture.path), fixture.bytes)
  assert.deepEqual(
    hashes(sourceFiles),
    sourceSha256,
    'Smoke or fixture/helper source changed while running.',
  )
  assert.deepEqual(
    hashes(bundleFiles),
    bundleSha256,
    'Tested built artifacts changed while running.',
  )
  assert.deepEqual(report.pageErrors, [])
  report.outcome = 'passed'
} catch (cause) {
  report.outcome =
    expectRed && cause.code === 'ACCEPTED_HISTORY_ENTRYPOINT_MISSING' ? 'expected-red' : 'failed'
  report.error = { code: cause.code ?? null, message: cause.message, stack: cause.stack }
  if (window && !window.isClosed()) await screenshot('failure').catch(() => undefined)
  console.error(cause)
  process.exitCode = 1
} finally {
  writeFileSync(
    path.join(artifactRoot, 'native-accepted-history-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await stop().catch((cause) => console.error('Smoke cleanup:', cause.message))
  rmSync(dataRoot, { force: true, recursive: true })
  console.log(
    `Native accepted history: ${report.outcome ?? 'incomplete'}; ${report.checks.length} checks; ${report.pageErrors.length} page errors; artifacts ${artifactRoot}`,
  )
}
