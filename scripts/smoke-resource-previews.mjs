/**
 * Actual CPU image derivation/cache and built Electron catalog, exact-version picker and manager.
 * Checkpoint/LoRA bytes and remote image responses are independently prepared fixtures; no ML.
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
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
import { crc32, deflateSync } from 'node:zlib'

import { _electron as electron, expect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { ModelPreviewCache } from '../src/main/models/model-preview-cache.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { developmentImageWorkerLocation } from '../src/main/projects/development-image-worker.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { ProjectTargetInspectionOwner } from '../src/main/projects/project-target-inspection-owner.ts'
import { checkMissingExactVersionHandoff } from './desktop-model-handoff-checks.mjs'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
} from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4, 'Use --report-file ABSOLUTE_NEW_OWNED_REPORT')
assert.equal(process.argv[2], '--report-file')
const reportFile = process.argv[3]
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Report destination must be new')
const evidenceRoot = path.dirname(reportFile)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const relativeEvidence = path.relative(artifactRoot, evidenceRoot)
assert.ok(
  relativeEvidence && !relativeEvidence.startsWith('..') && !path.isAbsolute(relativeEvidence),
)
assert.equal(realpathSync(evidenceRoot), evidenceRoot)
assert.ok(lstatSync(evidenceRoot).isDirectory() && !lstatSync(evidenceRoot).isSymbolicLink())

const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'native-preview-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
const cacheRoot = path.join(appDataRoot, 'cache')
const scratchRoot = path.join(appDataRoot, 'scratch')
const projectRoot = path.join(appDataRoot, 'workspaces/Uncategorized')
for (const directory of [cacheRoot, scratchRoot, projectRoot]) {
  mkdirSync(directory, { mode: 0o700, recursive: true })
}
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashFiles = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const report = {
  outcome: 'running',
  fixtureRoot,
  payloads: [fixtureRoot],
  checks: [],
  screenshots: [],
  viewportChecks: [],
  pageErrors: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  networkObserverControls: [],
  sourceSha256: hashFiles([
    'scripts/smoke-resource-previews.mjs',
    'scripts/desktop-model-handoff-checks.mjs',
    'scripts/native-smoke-window.mjs',
    'scripts/qualification-resource-limits.mjs',
    'src/main/models/model-preview-cache.ts',
    'src/main/models/model-service.ts',
    'src/renderer/components/ModelManager.vue',
    'src/renderer/components/ProjectLoraStack.vue',
    'src/main/projects/worker-client.ts',
    'worker-python/src/imagegen_worker/resource_previews.py',
    'worker-python/src/imagegen_worker/protocol.py',
  ]),
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
      'Checkout CPU image worker → shared CPU owner → real bounded disk cache; built Electron Main/SQLite/catalog → preload → Project exact-version thumbnails, Added state, manager exact-version preview/default controls, absent exact-version handoff, real prompt Undo/Redo, explicit .igs Save/readback and offline restart.',
    fixtures:
      'Two independent 160×80 PNG images with two colors/alpha; their remote data URL responses; four tiny catalog-only checkpoint/LoRA files and a document-scoped SQLite seed-cursor fixture of 0. One exact LoRA local_model_file row is withdrawn/restored to remove that version from the actual Main catalog while leaving the file bytes and sibling intact. One owned prompt-history edit is prepared/cleared through real Project actions. No UI resource deletion, actual generation completion, model parsing, inference, CUDA, installed runtime qualification or release delivery.',
    browser:
      'Native _electron test is required for actual preload/IPC and isolated XDG data; an HTTP browser cannot exercise this boundary.',
    limits:
      'Native identities/cgroups use the existing finite qualification helper with 300-second deadlines. The launching actor must already have bounded aggregate RAM and zero swap.',
    cleanup:
      'Fixture is retained under the owned run root for root-controlled cleanup after confirmed CPU/native exit; this script never deletes external data.',
  },
}
let application
let window
let nativeChecks = []
let fixture
let cached
function writeReport() {
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
}
function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence })
  writeReport()
  console.log(`PASS ${name}`)
}
writeReport()

function chunk(kind, payload) {
  const name = Buffer.from(kind)
  const size = Buffer.alloc(4)
  size.writeUInt32BE(payload.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([name, payload])))
  return Buffer.concat([size, name, payload, checksum])
}

/** PNG bytes are constructed independently of the worker/cache under test. */
function sourcePng(left, right) {
  const width = 160
  const height = 80
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = x < width / 2 ? left : right
      const alpha = y < 4 || y >= height - 4 || x < 4 || x >= width - 4 ? 0 : 192
      rows.set([...color, alpha], y * (width * 4 + 1) + 1 + x * 4)
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

async function prepareFixture() {
  const sourceA = sourcePng([220, 30, 45], [30, 60, 220])
  const sourceB = sourcePng([30, 220, 65], [220, 160, 30])
  const urlA = 'https://image.civitai.com/imagegen-studio-preview-a.png'
  const urlB = 'https://image.civitai.com/imagegen-studio-preview-b.png'
  const sourceByUrl = new Map([
    [urlA, sourceA],
    [urlB, sourceB],
  ])
  const cpuLocation = developmentImageWorkerLocation({
    isPackaged: false,
    mainDirectory: path.resolve('dist/main'),
    nodeEnv: 'test',
    scratchDirectory: scratchRoot,
    smokeOptIn: '1',
  })
  assert.ok(cpuLocation, 'The real checkout CPU worker must be installed for this smoke')
  const owner = new ProjectTargetInspectionOwner(cpuLocation)
  const fetched = []
  const cache = new ModelPreviewCache({
    cacheRoot,
    scratchRoot,
    fetchSource: async (url) => {
      fetched.push(url)
      const bytes = sourceByUrl.get(url)
      assert.ok(bytes, 'Unexpected remote image URL')
      return `data:image/png;base64,${bytes.toString('base64')}`
    },
    withWorker: (use) => owner.useWorker(use, { retainCompletedResult: false }),
  })
  try {
    const a = await cache.get(urlA)
    const b = await cache.get(urlB)
    assert.ok(a && b, 'Real CPU worker must produce both cache entries')
    assert.notEqual(a.previewDataUrl, b.previewDataUrl)
    assert.notEqual(a.thumbnailDataUrl, b.thumbnailDataUrl)
    cached = { a, b }
    assert.deepEqual(fetched, [urlA, urlB])
    check('Two independent source PNGs produce real persisted CPU preview/thumbnail entries', {
      sourceSha256: [digest(sourceA), digest(sourceB)],
      previewSha256: [
        digest(Buffer.from(a.previewDataUrl.split(',')[1], 'base64')),
        digest(Buffer.from(b.previewDataUrl.split(',')[1], 'base64')),
      ],
    })
  } finally {
    await owner.shutdown()
    report.cpuOwnerExitConfirmed = true
    writeReport()
  }
  const database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  const repository = new ModelRepository(database.db)
  async function publish(type, modelId, remoteVersionId, versionName, imageUrl) {
    const name = type === 'checkpoint' ? 'Preview checkpoint' : 'Preview LoRA'
    const bytes = Buffer.from(`Catalog-only ${type} ${remoteVersionId}; not inference weights.`)
    const managedPath = path.join(appDataRoot, 'models', `${type}-${remoteVersionId}.safetensors`)
    mkdirSync(path.dirname(managedPath), { recursive: true, mode: 0o700 })
    writeFileSync(managedPath, bytes, { mode: 0o600 })
    const result = await repository.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath,
          originalFilename: path.basename(managedPath),
          sha256: digest(bytes),
          sizeBytes: bytes.length,
          verifiedAt: new Date().toISOString(),
        },
        resource: {
          creator: 'Native preview fixture',
          displayName: name,
          previewUrl: imageUrl,
          source: { kind: 'civitai', modelId },
          sourceMetadata: { fixture: true },
          type,
        },
        version: {
          baseModelFamily: 'illustrious',
          format: 'safetensors',
          name: versionName,
          predictionType: type === 'checkpoint' ? 'epsilon' : null,
          source: {
            kind: 'civitai',
            fileId: remoteVersionId + 100,
            versionId: remoteVersionId,
            expectedSha256: digest(bytes),
          },
          sourceMetadata: {
            fixture: true,
            previewImageUrl: imageUrl,
            trainedWords: [`preview-${versionName.toLowerCase().replaceAll(' ', '-')}`],
          },
        },
      },
    })
    return {
      ...result,
      portable: {
        baseModelFamily: 'illustrious',
        civitaiFileId: remoteVersionId + 100,
        civitaiModelId: modelId,
        civitaiVersionId: remoteVersionId,
        displayName: name,
        fileSha256: digest(bytes),
        kind: type,
        localModelId: result.resourceId,
        localVersionId: result.versionId,
        predictionType: type === 'checkpoint' ? 'epsilon' : null,
        versionName,
      },
    }
  }
  let checkpointA, checkpointB, loraA, loraB
  try {
    checkpointA = await publish('checkpoint', 99400, 99401, 'Version A', urlA)
    checkpointB = await publish('checkpoint', 99400, 99402, 'Version B', urlB)
    loraA = await publish('lora', 99500, 99501, 'Version A', urlA)
    loraB = await publish('lora', 99500, 99502, 'Version B', urlB)
    await repository.setDefaultVersion(checkpointA.resourceId, checkpointA.versionId)
    await repository.setDefaultVersion(loraA.resourceId, loraA.versionId)
    const installed = await repository.listInstalled()
    assert.equal(installed.length, 2)
    assert.ok(
      installed.every((resource) => resource.previewUrl === urlB),
      'Fixture must retain the misleading last-installed resource URL B',
    )
  } finally {
    await database.close()
  }
  const title = 'Resource preview fixture'
  const session = await ProjectSession.create(path.join(projectRoot, `${title}.igs`), title, {
    placeholdersDir: path.resolve('dist/main/placeholders'),
    scratchDir: scratchRoot,
  })
  session.applyDocument({
    ...session.document,
    generationDraft: {
      ...session.document.generationDraft,
      model: checkpointA.portable,
      seed: { policy: 'fixed', value: 0 },
    },
  })
  await session.save()
  const cursorDatabase = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  try {
    // Fixture setup only: the cursor read/preservation is real, but no inference produced this 0.
    await cursorDatabase.db
      .insertInto('generation_seed_cursor')
      .values({
        actual_seed: 0,
        candidate_id: randomUUID(),
        completion_order: 1,
        document_id: session.document.documentId,
        local_project_key: session.localRecoveryKey,
        updated_at: new Date().toISOString(),
      })
      .execute()
  } finally {
    await cursorDatabase.close()
  }
  return {
    checkpointA,
    checkpointB,
    loraA,
    loraB,
    title,
    projectId: session.localRecoveryKey,
    filePath: session.filePath,
  }
}

async function limitCheck(label) {
  const check = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds: 300,
    // This CPU-only UI slice needs no model-loading budget. The shared guard still validates
    // the actual owned scope and records the observed limits after the lower cap is applied.
    execute: (file, args, options) =>
      nativeExec(
        file,
        args.map((value) => (value === 'MemoryMax=12G' ? 'MemoryMax=2G' : value)),
        options,
      ),
  })
  nativeChecks.push(check)
  report.resourceLimitChecks.push({ ...check, label })
  writeReport()
}

async function launch(offline) {
  const environment = {
    ...process.env,
    NODE_ENV: 'test',
    XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
    XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
  }
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.IMAGEGEN_DEV_SERVER_URL
  delete environment.IMAGEGEN_TEST_IMAGE_WORKER
  if (!offline) environment.IMAGEGEN_TEST_IMAGE_WORKER = '1'
  nativeChecks = []
  const args =
    process.env.IMAGEGEN_SMOKE_OZONE_PLATFORM === 'x11' ? ['--ozone-platform=x11', '.'] : ['.']
  application = await electron.launch({
    args,
    cwd: process.cwd(),
    env: environment,
    timeout: 30_000,
  })
  await limitCheck(offline ? 'offline-restart-launch' : 'native-launch')
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(10_000)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  const networkControl = await application.evaluate(async ({ session }) => {
    // CivitaiClient captures fetch at construction. Observe Undici itself as well as future
    // global fetch calls, and prove the observer sees a previously captured fetch function.
    const capturedFetch = globalThis.fetch
    globalThis.__previewSmokeActualMainRequests = 0
    process
      .getBuiltinModule('node:diagnostics_channel')
      .channel('undici:request:create')
      .subscribe(() => {
        globalThis.__previewSmokeActualMainRequests++
      })
    const server = process
      .getBuiltinModule('node:http')
      .createServer((_request, response) => response.end('observer control'))
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    let observed
    try {
      const response = await capturedFetch(`http://127.0.0.1:${server.address().port}/`)
      await response.arrayBuffer()
      observed = globalThis.__previewSmokeActualMainRequests
    } finally {
      await new Promise((resolve) => {
        server.close(resolve)
        server.closeAllConnections()
      })
    }
    globalThis.__previewSmokeActualMainRequests = 0
    globalThis.__previewSmokeFetchAttempts = 0
    globalThis.fetch = async () => {
      globalThis.__previewSmokeFetchAttempts++
      throw new Error('External network is forbidden in the resource-preview smoke.')
    }
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (_request, callback) => callback({ cancel: true }),
    )
    return observed
  })
  assert.equal(networkControl, 1, 'The observer must detect native captured-fetch network activity')
  report.networkObserverControls.push({ offline, actualRequestObserved: networkControl })
  writeReport()
  await window.getByRole('tab', { name: 'Home', exact: true }).waitFor()
  await resize(1380, 900)
  const runtime = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(runtime.ok, true)
  assert.equal(runtime.value.kind, 'not-installed', 'No ML runtime pointer should exist')
}

async function closeNative(label) {
  if (!application) return
  await limitCheck(`${label}-before-close`)
  await application.close()
  const closure = await confirmQualificationProcessExit(nativeChecks)
  report.nativeClosures.push({ label, ...closure })
  application = null
  window = null
  writeReport()
}

async function api(scope, method, ...args) {
  const result = await window.evaluate(
    ({ scope, method, args }) => window.api[scope][method](...args),
    { scope, method, args },
  )
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}

async function currentProject() {
  const value = await api('projects', 'open', fixture.projectId)
  assert.equal(value.kind, 'opened')
  return value.tab
}

async function openProject() {
  const tab = window.getByRole('tab', { name: fixture.title, exact: true })
  if (await tab.count()) await tab.click()
  else await window.getByRole('button', { name: `Open ${fixture.title}`, exact: true }).click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await expect(window.locator('[aria-label="Add LoRA"]')).toBeVisible()
}

async function resize(width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) =>
      BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
    { width, height },
  )
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
}

async function image(locator, expectedUrl, expectedSize) {
  await expect(locator).toHaveAttribute('src', expectedUrl)
  await expect
    .poll(() => locator.evaluate((element) => element.complete && element.naturalWidth > 0))
    .toBe(true)
  const dimensions = await locator.evaluate((element) => [
    element.naturalWidth,
    element.naturalHeight,
  ])
  if (expectedSize) assert.deepEqual(dimensions, expectedSize)
  return dimensions
}

async function screenshot(label, locator, width, height) {
  await resize(width, height)
  await locator.scrollIntoViewIfNeeded()
  await window.mouse.move(width - 5, 5)
  await window.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    )
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  const bounds = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      withinViewport:
        rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
    }
  })
  assert.equal(bounds.withinViewport, true, `${label} must fit the supported viewport`)
  assert.equal(bounds.documentOverflow, false)
  const file = path.join(evidenceRoot, `${label}-${width}x${height}.png`)
  await locator.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push(file)
  report.viewportChecks.push({ label, width, height, bounds })
  writeReport()
}

function loraOption(version) {
  return window
    .locator('.n-base-select-menu:visible')
    .locator('.model-option')
    .filter({ hasText: 'Preview LoRA' })
    .filter({ hasText: version })
}

async function picker(added, screenshots = false) {
  await window.locator('[aria-label="Add LoRA"]').click()
  const menu = window.locator('.n-base-select-menu:visible')
  await expect(menu).toHaveCount(1)
  const a = loraOption('Version A')
  const b = loraOption('Version B')
  await image(a.locator('img'), cached.a.thumbnailDataUrl, [96, 48])
  await image(b.locator('img'), cached.b.thumbnailDataUrl, [96, 48])
  if (added) {
    await expect(a).toHaveClass(/model-option--added/)
    await expect(b).toHaveClass(/model-option--added/)
    await expect(a).toContainText('Added')
    await expect(b).toContainText('Added')
  } else {
    await expect(a).not.toHaveClass(/model-option--added/)
    await expect(b).not.toHaveClass(/model-option--added/)
  }
  if (screenshots) {
    await screenshot('lora-exact-version-picker', menu, 1380, 900)
    await screenshot('lora-exact-version-picker', menu, 900, 680)
  }
  return { menu, a, b }
}

async function assertCatalog(defaultLabel) {
  const catalog = await api('models', 'getCatalog')
  assert.equal(catalog.length, 2)
  for (const resource of catalog) {
    const a = resource.versions.find((version) => version.name === 'Version A')
    const b = resource.versions.find((version) => version.name === 'Version B')
    assert.ok(a && b)
    assert.equal(a.previewDataUrl, cached.a.previewDataUrl)
    assert.equal(a.thumbnailDataUrl, cached.a.thumbnailDataUrl)
    assert.equal(b.previewDataUrl, cached.b.previewDataUrl)
    assert.equal(b.thumbnailDataUrl, cached.b.thumbnailDataUrl)
    assert.equal(resource.defaultVersionId, defaultLabel === 'a' ? a.id : b.id)
    assert.equal(resource.previewDataUrl, cached[defaultLabel].previewDataUrl)
    assert.equal(resource.thumbnailDataUrl, cached[defaultLabel].thumbnailDataUrl)
  }
  return catalog
}

try {
  fixture = await prepareFixture()
  await launch(false)
  await assertCatalog('a')
  check('Built Main catalog uses exact default A despite the resource-level URL being B')
  await openProject()
  const before = await currentProject()
  assert.equal(before.generationDraft.model.localVersionId, fixture.checkpointA.versionId)
  assert.equal(before.generationDraft.loras.length, 0)
  const options = await picker(false, true)
  await options.b.click()
  await expect
    .poll(async () => (await currentProject()).generationDraft.loras[0]?.resource.localVersionId)
    .toBe(fixture.loraB.versionId)
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await currentProject()).dirty).toBe(false)
  const saved = (await readIgsPackage(fixture.filePath)).project
  assert.equal(saved.generationDraft.loras[0].resource.localVersionId, fixture.loraB.versionId)
  const persistedDraft = structuredClone((await currentProject()).generationDraft)
  await picker(true)
  await window.keyboard.press('Escape')
  check('Project adds exact LoRA B through UI and persists Added state with real explicit Save')

  await resize(1380, 900)
  await window.getByRole('button', { name: 'Open Preview LoRA in Models', exact: true }).click()
  const manager = window.getByRole('dialog', { name: 'Model Manager', exact: true })
  await expect(manager).toBeVisible()
  const projectVersion = manager.locator('.version-row--project')
  await expect(projectVersion).toHaveCount(1)
  await expect(projectVersion).toContainText('Version B')
  await expect(projectVersion).toContainText('Selected in Project')
  await expect(manager.locator('.metadata-list dd').first()).toHaveText('Version B')
  await image(manager.locator('.large-preview img'), cached.b.previewDataUrl, [160, 80])
  const loraRow = manager.locator('.resource-row').filter({ hasText: 'Preview LoRA' })
  await image(loraRow.locator('img'), cached.a.thumbnailDataUrl, [96, 48])
  await screenshot('manager-exact-selected-b-default-a', manager, 1380, 900)
  await screenshot('manager-exact-selected-b-default-a', manager, 900, 680)
  check('Project manager handoff focuses exact B preview while the resource row shows default A')

  await manager
    .locator('.version-row')
    .filter({ hasText: 'Version B' })
    .getByRole('button', { name: 'Set Default', exact: true })
    .click()
  await expect
    .poll(
      async () =>
        (await api('models', 'getCatalog')).find(
          (resource) => resource.id === fixture.loraB.resourceId,
        )?.defaultVersionId,
    )
    .toBe(fixture.loraB.versionId)
  await image(loraRow.locator('img'), cached.b.thumbnailDataUrl, [96, 48])
  await api(
    'models',
    'setDefaultVersion',
    fixture.checkpointB.resourceId,
    fixture.checkpointB.versionId,
  )
  await assertCatalog('b')
  assert.deepEqual((await currentProject()).generationDraft, persistedDraft)
  assert.deepEqual(
    (await readIgsPackage(fixture.filePath)).project.generationDraft,
    saved.generationDraft,
  )
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager).toHaveCount(0)
  assert.equal(await application.evaluate(() => globalThis.__previewSmokeFetchAttempts), 0)
  assert.equal(await application.evaluate(() => globalThis.__previewSmokeActualMainRequests), 0)
  check(
    'Default changes switch resource thumbnails to B while Project checkpoint A and exact LoRA B remain unchanged',
  )
  await closeNative('first-session')

  await launch(true)
  await assertCatalog('b')
  await openProject()
  assert.deepEqual((await currentProject()).generationDraft, persistedDraft)
  assert.equal((await currentProject()).dirty, false)
  await picker(true)
  await window.keyboard.press('Escape')
  await window.getByRole('button', { name: 'Open Preview LoRA in Models', exact: true }).click()
  const offlineManager = window.getByRole('dialog', { name: 'Model Manager', exact: true })
  await expect(offlineManager).toBeVisible()
  await image(offlineManager.locator('.large-preview img'), cached.b.previewDataUrl, [160, 80])
  await image(
    offlineManager.locator('.resource-row').filter({ hasText: 'Preview LoRA' }).locator('img'),
    cached.b.thumbnailDataUrl,
    [96, 48],
  )
  assert.equal(await application.evaluate(() => globalThis.__previewSmokeFetchAttempts), 0)
  assert.equal(await application.evaluate(() => globalThis.__previewSmokeActualMainRequests), 0)
  check(
    'Offline restart with no runtime pointer and CPU adapter disabled loads durable cached images and persisted Added state',
  )
  await offlineManager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(offlineManager).toHaveCount(0)
  await api('models', 'setDefaultVersion', fixture.loraA.resourceId, fixture.loraA.versionId)
  const handoffResource = (await api('models', 'getCatalog')).find(
    (resource) => resource.id === fixture.loraB.resourceId,
  )
  assert.ok(handoffResource)
  const exactVersion = handoffResource.versions.find(
    (version) => version.id === fixture.loraB.versionId,
  )
  const neighborVersion = handoffResource.versions.find(
    (version) => version.id === fixture.loraA.versionId,
  )
  assert.ok(exactVersion && neighborVersion)
  assert.equal(
    (await api('projects', 'listGenerationResults', fixture.projectId)).lastActualSeed,
    0,
  )
  const inventoryDatabase = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  let withdrawnFile = null
  const modelFileHashes = hashFiles(
    (
      await inventoryDatabase.db
        .selectFrom('local_model_file')
        .select('managed_path')
        .orderBy('managed_path')
        .execute()
    ).map((file) => file.managed_path),
  )
  async function restoreExactVersion() {
    if (!withdrawnFile) return
    await inventoryDatabase.db.transaction().execute(async (transaction) => {
      const existing = await transaction
        .selectFrom('local_model_file')
        .selectAll()
        .where('resource_version_id', '=', fixture.loraB.versionId)
        .executeTakeFirst()
      if (existing) assert.deepEqual(existing, withdrawnFile)
      else await transaction.insertInto('local_model_file').values(withdrawnFile).execute()
    })
    assert.deepEqual(hashFiles(Object.keys(modelFileHashes)), modelFileHashes)
    withdrawnFile = null
  }
  try {
    await checkMissingExactVersionHandoff({
      window,
      projectId: fixture.projectId,
      projectTitle: fixture.title,
      packagePath: fixture.filePath,
      exact: {
        resourceId: handoffResource.id,
        versionId: exactVersion.id,
        name: handoffResource.name,
        versionName: exactVersion.name,
        previewDataUrl: exactVersion.previewDataUrl,
        fileName: exactVersion.fileName,
        trainedWords: exactVersion.trainedWords,
      },
      neighbor: {
        versionId: neighborVersion.id,
        versionName: neighborVersion.name,
        previewDataUrl: neighborVersion.previewDataUrl,
        thumbnailDataUrl: neighborVersion.thumbnailDataUrl,
        baseModelFamily: neighborVersion.baseModelFamily,
      },
      withdrawExactVersion: async () => {
        await inventoryDatabase.db.transaction().execute(async (transaction) => {
          assert.equal(withdrawnFile, null)
          withdrawnFile = await transaction
            .selectFrom('local_model_file')
            .selectAll()
            .where('resource_version_id', '=', fixture.loraB.versionId)
            .executeTakeFirstOrThrow()
          const deleted = await transaction
            .deleteFrom('local_model_file')
            .where('id', '=', withdrawnFile.id)
            .where('resource_version_id', '=', fixture.loraB.versionId)
            .executeTakeFirstOrThrow()
          assert.equal(deleted.numDeletedRows, 1n)
        })
        assert.deepEqual(hashFiles(Object.keys(modelFileHashes)), modelFileHashes)
      },
      restoreExactVersion,
      record: check,
      screenshot: (label, locator) => screenshot(label, locator, 1380, 900),
    })
    assert.deepEqual(hashFiles(Object.keys(modelFileHashes)), modelFileHashes)
    check(
      'Missing-version fixture restores its exact catalog row and preserves all four model files',
    )
  } finally {
    try {
      await restoreExactVersion()
    } finally {
      await inventoryDatabase.close()
    }
  }
  await closeNative('offline-restart')
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.nativeClosures.length, 2)
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'
  report.failure = { message: error.message, stack: error.stack }
  if (window) {
    const visible = window.getByRole('dialog', { name: 'Model Manager', exact: true })
    if (await visible.count()) {
      const file = path.join(evidenceRoot, 'manager-failure.png')
      await visible
        .screenshot({ path: file, animations: 'disabled' })
        .then(() => report.screenshots.push(file))
        .catch(() => undefined)
    }
  }
  throw error
} finally {
  if (application) {
    try {
      if (window && report.outcome === 'failed' && fixture?.projectId) {
        // The failed assertion may leave our controlled prompt edit dirty. Discard only
        // this isolated fixture tab before app.quit, which otherwise awaits a user dialog.
        const discarded = await window.evaluate(
          (id) => window.api.projects.discardAndClose(id, true),
          fixture.projectId,
        )
        assert.equal(discarded.ok, true, JSON.stringify(discarded))
      }
      await closeNative('failure-cleanup')
    } catch (error) {
      report.cleanupFailure = { message: error.message, stack: error.stack }
      report.outcome = 'failed'
    }
  }
  writeReport()
  console.log(
    JSON.stringify({
      report: reportFile,
      outcome: report.outcome,
      checks: report.checks.length,
      fixtureRoot,
    }),
  )
}
