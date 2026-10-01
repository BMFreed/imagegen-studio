import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { crc32, deflateSync } from 'node:zlib'
import { _electron as electron, expect } from '@playwright/test'

import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'

import { openAppDatabase } from '../src/main/db/database.ts'
import { GenerationQueueRepository } from '../src/main/projects/generation-queue.ts'
import { GenerationStagingRepository } from '../src/main/projects/generation-staging.ts'
import {
  IgsPackageError,
  readIgsPackage,
  saveIgsPackage,
} from '../src/main/projects/igs-package.ts'
import { withIllustriousTxt2ImgRequest } from '../src/main/projects/illustrious-txt2img-job.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'

const migrations = path.resolve('src/main/db/migrations')
const icc = readFileSync('worker-python/src/imagegen_worker/srgb.icc')
const ready = {
  capabilities: ['illustrious-txt2img'],
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.2.0',
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function fixtureDatabaseDescriptors(pid) {
  const databasePath = path.join(appDataRoot, 'database', 'app.sqlite')
  const identity = (file) => {
    try {
      const entry = statSync(file)
      return { device: entry.dev, inode: entry.ino, byteSize: entry.size }
    } catch (cause) {
      if (cause.code === 'ENOENT') return null
      throw cause
    }
  }
  return {
    files: Object.fromEntries(
      ['', '-wal', '-shm'].map((suffix) => [suffix || 'database', identity(databasePath + suffix)]),
    ),
    mainDescriptors: readdirSync(`/proc/${pid}/fd`).flatMap((fd) => {
      const fdPath = `/proc/${pid}/fd/${fd}`
      try {
        const target = readlinkSync(fdPath)
        return target.startsWith(databasePath) ? [{ fd, target, ...identity(fdPath) }] : []
      } catch (cause) {
        if (cause.code === 'ENOENT') return []
        throw cause
      }
    }),
  }
}

function pngChunk(name, bytes) {
  const kind = Buffer.from(name, 'ascii')
  const chunk = Buffer.alloc(12 + bytes.length)
  chunk.writeUInt32BE(bytes.length, 0)
  kind.copy(chunk, 4)
  bytes.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([kind, bytes])), bytes.length + 8)
  return chunk
}

function srgbPng(width, height, opaque) {
  assert.equal(digest(icc), IGS_SRGB_ICC_SHA256)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const scanlines = Buffer.alloc((1 + width * 4) * height)
  if (opaque) {
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const offset = row * (1 + width * 4) + 1 + column * 4
        scanlines[offset] = 37
        scanlines[offset + 1] = 94
        scanlines[offset + 2] = 181
        scanlines[offset + 3] = 255
      }
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(icc)])),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

async function renderedBlueBounds(window) {
  return await window.evaluate(() => {
    const canvases = document.querySelectorAll('[aria-label="Project Canvas"] .konva-stage canvas')
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    for (const canvas of canvases) {
      if (!(canvas instanceof HTMLCanvasElement)) continue
      const context = canvas.getContext('2d')
      if (!context) continue
      const { data, height, width } = context.getImageData(0, 0, canvas.width, canvas.height)
      const pixelWidth = canvas.getBoundingClientRect().width / width
      const pixelHeight = canvas.getBoundingClientRect().height / height
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4
          if (
            data[offset + 2] > data[offset] + 80 &&
            data[offset + 2] > data[offset + 1] + 45 &&
            data[offset + 3] > 160
          ) {
            left = Math.min(left, x * pixelWidth)
            top = Math.min(top, y * pixelHeight)
            right = Math.max(right, (x + 1) * pixelWidth)
            bottom = Math.max(bottom, (y + 1) * pixelHeight)
          }
        }
      }
    }
    return Number.isFinite(left) ? { left, top, right, bottom } : null
  })
}

async function setNativeSaveDialogResult(application, result) {
  await application.evaluate(({ dialog }, selectedResult) => {
    globalThis.igsSmokeSaveDialogCalls ??= 0
    dialog.showSaveDialog = async () => {
      globalThis.igsSmokeSaveDialogCalls += 1
      return selectedResult
    }
  }, result)
}

async function nativeSaveDialogCalls(application) {
  return await application.evaluate(() => globalThis.igsSmokeSaveDialogCalls ?? 0)
}

async function clickSaveCandidateImage(window) {
  const menuItem = window.getByRole('menuitem', { name: 'Save Candidate Image' })
  await expect(menuItem).toBeHidden()
  await window.getByRole('button', { name: 'Result 1 actions' }).click()
  await menuItem.click()
  await expect(menuItem).toBeHidden()
}

function candidateCard(window, candidate) {
  return window.locator(`.candidate[data-candidate-id="${candidate.candidateId}"]`)
}

function durableResultsSnapshot(snapshot) {
  assert.equal(snapshot.ok, true)
  return {
    ...snapshot.value,
    candidates: snapshot.value.candidates.map(
      ({ imageUrl, thumbnailUrl: _thumbnailUrl, ...candidate }) => ({
        ...candidate,
        sourcePngSha256: new URL(imageUrl).pathname.split('/')[4],
      }),
    ),
  }
}

async function chooseResultSession(window, label) {
  await window.getByLabel('Result session', { exact: true }).click()
  await window.getByRole('option', { exact: true, name: label }).click()
  await expect(window.getByRole('listbox', { exact: true, name: 'Result sessions' })).toBeHidden()
}

async function crashAndRestartResultsApplication() {
  const previousProcess = application.process()
  const exited = new Promise((resolve) => previousProcess.once('exit', resolve))
  assert.equal(previousProcess.kill('SIGKILL'), true)
  await Promise.race([
    exited,
    delay(10_000).then(() => {
      throw new Error('The Results app did not exit during the navigation recovery fixture.')
    }),
  ])
  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  await isolateNativeSmokeWindow(application)
  trackMainErrors(application)
  const window = await application.firstWindow()
  await trackPageErrors(window)
  await window.getByRole('tab', { exact: true, name: 'Home' }).waitFor()
  return window
}

let closedQueueOpenAttempt = 0
async function captureNativeInput(window) {
  if (!queueNavigationArtifacts) return
  await window.evaluate(() => {
    window.igsSmokeInputEvents = []
    window.igsSmokeInputListener ??= (event) => {
      const target = event.target instanceof Element ? event.target : null
      window.igsSmokeInputEvents.push({
        type: event.type,
        key: event.key,
        trusted: event.isTrusted,
        x: event.clientX,
        y: event.clientY,
        target: target?.getAttribute('aria-label') ?? target?.textContent?.slice(0, 120),
      })
      if (window.igsSmokeInputEvents.length > 500) window.igsSmokeInputEvents.shift()
    }
    for (const type of ['keydown', 'keyup', 'pointerdown', 'click'])
      window.addEventListener(type, window.igsSmokeInputListener, true)
  })
}
async function openClosedQueueResult(window, candidate) {
  const tracePath = queueNavigationArtifacts
    ? path.join(queueNavigationArtifacts, `closed-queue-open-${++closedQueueOpenAttempt}.zip`)
    : null
  if (tracePath) await window.context().tracing.start({ screenshots: true, snapshots: true })
  await captureNativeInput(window)
  try {
    await window.getByRole('button', { exact: true, name: 'Open Queue Manager' }).click()
    const manager = window.getByRole('dialog', { exact: true, name: 'Queue Manager' })
    await expect(
      manager.getByRole('region', { exact: true, name: 'Generation jobs' }),
    ).toHaveAttribute('aria-busy', 'false')
    const target = manager
      .locator(`[data-testid="queue-job-row"][data-job-id="${candidate.queueItemId}"]`)
      .getByRole('button', { exact: true, name: 'Show job details' })
    await target.click()
    await expect(target).toHaveAttribute('aria-pressed', 'true')
    await expect(
      manager.getByRole('region', { exact: true, name: 'Generation jobs' }),
    ).toHaveAttribute('aria-busy', 'false')
    await expect(manager.getByRole('button', { exact: true, name: 'View result' })).toHaveCount(0)
    await expect(manager.locator('[data-testid="queue-result-thumbnail"] img')).toHaveCount(0)
    await manager.getByRole('button', { exact: true, name: 'Open Project' }).click()
    await expect(manager).toHaveCount(0)
  } finally {
    if (tracePath) {
      const inputs = await window.evaluate(() => window.igsSmokeInputEvents)
      writeFileSync(
        tracePath.replace(/\.zip$/, '-input-events.json'),
        `${JSON.stringify(inputs, null, 2)}\n`,
      )
      await window.context().tracing.stop({ path: tracePath })
    }
  }
}

const dataRoot = mkdtempSync(path.join(os.tmpdir(), 'igs-results-smoke-'))
const appDataRoot = path.join(dataRoot, 'data', 'imagegen-studio')
const environment = {
  ...process.env,
  IMAGEGEN_TEST_IMAGE_WORKER: '1',
  NODE_ENV: 'test',
  XDG_CONFIG_HOME: path.join(dataRoot, 'config'),
  XDG_DATA_HOME: path.join(dataRoot, 'data'),
}
delete environment.ELECTRON_RUN_AS_NODE

const pageErrors = []
const queueNavigationArtifacts = process.env.IMAGEGEN_SMOKE_QUEUE_RESULTS_ARTIFACTS
  ? path.resolve(process.env.IMAGEGEN_SMOKE_QUEUE_RESULTS_ARTIFACTS)
  : null
if (queueNavigationArtifacts) {
  mkdirSync(queueNavigationArtifacts, { mode: 0o700, recursive: true })
}
const queueNavigationReport = { checks: [], pageErrors, screenshots: [] }
queueNavigationReport.testBoundary = {
  desktopInput:
    'Actual BrowserWindow remains visible for compositor screenshots. Physical OS keyboard input is prevented through before-input-event; scripted CDP keyboard input bypasses this callback on the tested runtime.',
  renderer:
    'Actual built Electron DOM, CDP keyboard handlers and Konva Canvas; screenshots use this renderer.',
  persistence:
    'Actual main/preload/IPC, .igs, autosave, SQLite queue and staging. Controlled fixture PNG publication replaces inference pixels; native file pickers are controlled.',
}
const testedBuild = Object.fromEntries(
  [
    'dist/main/main.cjs',
    'dist/preload/preload.cjs',
    'dist/renderer/index.html',
    ...readdirSync('dist/renderer/assets')
      .filter((name) => /\.(?:js|css)$/.test(name))
      .map((name) => `dist/renderer/assets/${name}`),
  ].map((file) => [file, digest(readFileSync(file))]),
)
const testedScript = digest(readFileSync('scripts/smoke-generation-results.mjs'))
const testedWindowIsolationHelper = digest(readFileSync('scripts/native-smoke-window.mjs'))
async function queueNavigationScreenshot(window, name) {
  if (!queueNavigationArtifacts) return
  const file = path.join(queueNavigationArtifacts, `${name}.png`)
  await window.screenshot({ animations: 'disabled', path: file })
  queueNavigationReport.screenshots.push(file)
}
async function trackPageErrors(window) {
  window.on('pageerror', (error) => pageErrors.push(error.message))
  await window.waitForURL('**/index.html')
  await captureNativeInput(window)
}
function trackMainErrors(application) {
  application.process().stderr?.on('data', (chunk) => process.stderr.write(chunk))
}

let application
let liveFixtureDatabase
try {
  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  await isolateNativeSmokeWindow(application)
  trackMainErrors(application)
  const initialWindow = await application.firstWindow()
  await trackPageErrors(initialWindow)
  await initialWindow.getByRole('tab', { name: 'Home' }).waitFor()
  await initialWindow.getByRole('button', { name: 'New Project' }).first().click()
  const createDialog = initialWindow.getByRole('dialog', { name: 'New Project' })
  await createDialog.locator('input[aria-label="Project name"]').fill('Recovered result smoke')
  await createDialog.locator('input[aria-label="Project width"]').fill('64')
  await createDialog.locator('input[aria-label="Project height"]').fill('64')
  await createDialog.getByRole('button', { name: 'Create Project' }).click()
  const projectTitle = 'Recovered result smoke'
  await initialWindow.getByRole('tab', { name: projectTitle }).waitFor()
  const listed = await initialWindow.evaluate(() => window.api.projects.list())
  assert.equal(listed.ok, true)
  const project = listed.value.find((item) => item.title === projectTitle)
  assert.ok(project)
  const originalBbox = { height: 64, width: 64, x: 80, y: -24 }
  const positioned = await initialWindow.evaluate(
    ([id, bbox]) => window.api.projects.setPrimaryBbox(id, bbox),
    [project.id, originalBbox],
  )
  assert.equal(positioned.ok, true)
  await initialWindow.getByRole('button', { name: 'Save Project' }).click()
  await initialWindow
    .getByRole('region', { name: `Project ${projectTitle}` })
    .getByText('Saved', { exact: true })
    .waitFor()
  const projectDirectory = path.join(appDataRoot, 'workspaces', 'Uncategorized')
  const entries = readdirSync(projectDirectory).filter((entry) => entry.endsWith('.igs'))
  assert.equal(entries.length, 1)
  const packagePath = path.join(projectDirectory, entries[0])
  await expect
    .poll(async () => (await readIgsPackage(packagePath)).project.primaryBbox)
    .toEqual(originalBbox)
  const firstProcess = application.process()
  const firstExited = new Promise((resolve) => firstProcess.once('exit', resolve))
  assert.equal(firstProcess.kill('SIGKILL'), true)
  await Promise.race([
    firstExited,
    delay(10_000).then(() => {
      throw new Error('The first Electron instance did not exit after the simulated crash.')
    }),
  ])
  application = undefined
  console.log('Results smoke fixture: saved Project and simulated restart.')

  // Fixture precondition: publish a genuine queue item/candidate through the production
  // repositories. Only the inference pixels are supplied; the UI and recovery path stay real.
  const originalBytes = readFileSync(packagePath)
  const archive = await readIgsPackage(packagePath)
  const { documentId, documentRevision, primaryBbox: bbox } = archive.project
  assert.deepEqual(bbox, originalBbox)
  const modelBytes = Buffer.from('results smoke checkpoint fixture')
  const modelPath = path.join(appDataRoot, 'results-smoke-model.safetensors')
  writeFileSync(modelPath, modelBytes)
  const target = srgbPng(bbox.width, bbox.height, false)
  const output = srgbPng(bbox.width, bbox.height, true)
  const prepared = {
    context: {
      bbox,
      documentId,
      documentRevision,
      kind: 'normal-txt2img-preparation',
      model: {
        managedPath: modelPath,
        reference: {
          baseModelFamily: 'illustrious',
          civitaiFileId: 22,
          civitaiModelId: 20,
          civitaiVersionId: 21,
          displayName: 'Results smoke fixture',
          fileSha256: digest(modelBytes),
          kind: 'checkpoint',
          localModelId: randomUUID(),
          localVersionId: randomUUID(),
          predictionType: 'epsilon',
          versionName: '1',
        },
      },
      prompts: { negative: '', positive: 'blue result' },
      sampling: {
        cfgScale: 7.5,
        invokeScheduler: 'dpmpp_2m_k',
        requestedSeedPolicy: 'fixed',
        sampler: 'DPM++ 2M',
        scheduler: 'Karras',
        seed: 42,
        steps: 24,
      },
      schemaVersion: 1,
      target: {
        byteSize: target.length,
        colorSpace: 'srgb',
        format: 'png',
        height: bbox.height,
        iccSha256: IGS_SRGB_ICC_SHA256,
        sha256: digest(target),
        width: bbox.width,
      },
    },
    targetPngBytes: target,
  }
  const database = openAppDatabase(appDataRoot, migrations)
  let candidate
  try {
    const queue = new GenerationQueueRepository(database.db, appDataRoot)
    const staging = new GenerationStagingRepository(database.db, appDataRoot)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    await withIllustriousTxt2ImgRequest({
      modelService: {
        resolveVerifiedGenerationCheckpointForPlan: async (reference) => ({
          managedPath: modelPath,
          reference,
        }),
      },
      prepared,
      ready,
      scratchBasePath: path.join(appDataRoot, 'scratch'),
      use: async (request) => {
        const queued = await queue.enqueueIllustriousTxt2Img({
          prepared,
          projectPath: packagePath,
          request,
          stagingSessionId: randomUUID(),
        })
        const claim = await queue.claimNextPending()
        assert.equal(claim?.item.id, queued.id)
        writeFileSync(request.job.output.pngPath, output)
        candidate = await staging.publishIllustriousTxt2Img({
          actualSeed: 42,
          expectedProvisionalRoot: request.job.output.stagingRoot,
          expectedStatusSequence: claim.item.statusSequence,
          provisionalOutputPath: request.job.output.pngPath,
          queueItemId: queued.id,
        })
      },
    })
  } finally {
    await database.close()
  }
  assert.ok(candidate)
  assert.deepEqual(readFileSync(packagePath), originalBytes)
  console.log('Results smoke fixture: published verified candidate through queue and staging.')

  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  await isolateNativeSmokeWindow(application)
  trackMainErrors(application)
  const window = await application.firstWindow()
  await trackPageErrors(window)
  await window.getByRole('tab', { name: 'Home' }).waitFor()
  const stageOnlyHomeRow = window
    .getByRole('listitem')
    .filter({ has: window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }) })
  await expect(stageOnlyHomeRow.getByText('Recovery available', { exact: true })).toBeVisible()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveCount(0)
  const stageOnlyHome = await window.evaluate(() => window.api.projects.list())
  assert.equal(stageOnlyHome.ok, true)
  assert.equal(
    stageOnlyHome.value.find((item) => item.id === project.id).recoveryStatus,
    'recoverable',
  )
  await queueNavigationScreenshot(window, '00-staging-only-home-recovery')
  // A closed Project cannot supply live signed resources. Queue history can still open that
  // Project, after which the ordinary recovery/results path verifies the candidate afresh.
  await window.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
  const closedProjectManager = window.getByRole('dialog', { name: 'Queue Manager', exact: true })
  await closedProjectManager
    .locator(`[data-testid="queue-job-row"][data-job-id="${candidate.queueItemId}"]`)
    .getByRole('button', { name: 'Show job details', exact: true })
    .click()
  await expect(
    closedProjectManager.getByRole('button', { name: 'View result', exact: true }),
  ).toHaveCount(0)
  await expect(closedProjectManager.locator('[data-testid="queue-job-thumbnail"] img')).toHaveCount(
    0,
  )
  await expect(
    closedProjectManager.locator('[data-testid="queue-result-thumbnail"] img'),
  ).toHaveCount(0)
  await expect(
    closedProjectManager.getByRole('button', { name: 'Open Project', exact: true }),
  ).toBeEnabled()
  await expect(closedProjectManager.locator('[data-testid="queue-result-section"]')).toContainText(
    'Open this Project to check its local result.',
  )
  await queueNavigationScreenshot(window, '01-closed-project-queue')
  await closedProjectManager.getByRole('button', { name: 'Open Project', exact: true }).click()
  await expect(closedProjectManager).toHaveCount(0)
  const stageOnlyQueueRecovery = window.getByRole('dialog', { name: 'Recovery available' })
  await expect(stageOnlyQueueRecovery).toBeVisible()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveCount(0)
  await expect(stageOnlyQueueRecovery.getByText(/temporary results for review/)).toBeVisible()
  const stageOnlyOpenDecision = await window.evaluate(
    (id) => window.api.projects.open(id),
    project.id,
  )
  assert.equal(stageOnlyOpenDecision.ok, true)
  assert.equal(stageOnlyOpenDecision.value.kind, 'recovery-required')
  assert.equal(stageOnlyOpenDecision.value.recoveryStatus, 'recoverable')
  assert.deepEqual(readFileSync(packagePath), originalBytes)
  assert.deepEqual(readFileSync(candidate.assetPath), output)
  const originalRecoveryWindowGeometry = await application.evaluate(({ BrowserWindow }) => {
    const nativeWindow = BrowserWindow.getAllWindows()[0]
    return { bounds: nativeWindow.getBounds(), contentSize: nativeWindow.getContentSize() }
  })
  await queueNavigationScreenshot(window, '01-staging-only-recovery-normal')
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(900, 620),
  )
  await queueNavigationScreenshot(window, '01-staging-only-recovery-compact')
  await application.evaluate(
    ({ BrowserWindow }, [width, height]) =>
      BrowserWindow.getAllWindows()[0].setContentSize(width, height),
    originalRecoveryWindowGeometry.contentSize,
  )
  await expect
    .poll(async () => await window.evaluate(() => [window.innerWidth, window.innerHeight]))
    .toEqual(originalRecoveryWindowGeometry.contentSize)
  const restoredRecoveryWindowGeometry = await application.evaluate(({ BrowserWindow }) => {
    const nativeWindow = BrowserWindow.getAllWindows()[0]
    return { bounds: nativeWindow.getBounds(), contentSize: nativeWindow.getContentSize() }
  })
  assert.deepEqual(restoredRecoveryWindowGeometry, originalRecoveryWindowGeometry)
  queueNavigationReport.recoveryWindowGeometry = {
    original: originalRecoveryWindowGeometry,
    restored: restoredRecoveryWindowGeometry,
  }
  await queueNavigationScreenshot(window, '01-staging-only-recovery-restored')
  await stageOnlyQueueRecovery.getByRole('button', { name: 'Recover', exact: true }).click()
  queueNavigationReport.checks.push({
    name: 'Stage-only Home recovery gates closed Queue Open; explicit Recover continues to the exact verified result',
    queueItemId: candidate.queueItemId,
  })
  await window.getByRole('tab', { name: projectTitle }).waitFor()
  const snapshot = await window.evaluate(
    (id) => window.api.projects.listGenerationResults(id),
    project.id,
  )
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.value.recoveryUnavailable, false)
  assert.equal(snapshot.value.candidates.length, 1)
  assert.equal(snapshot.value.lastActualSeed, 42)
  const cleanStageOnlyTab = await window.evaluate((id) => window.api.projects.open(id), project.id)
  assert.equal(cleanStageOnlyTab.ok, true)
  assert.equal(cleanStageOnlyTab.value.kind, 'opened')
  assert.equal(cleanStageOnlyTab.value.tab.dirty, false)
  assert.equal(cleanStageOnlyTab.value.tab.canUndo, false)
  assert.equal(cleanStageOnlyTab.value.tab.layers.length, 0)
  const recovered = snapshot.value.candidates[0]
  assert.equal(recovered.candidateId, candidate.candidateId)
  assert.deepEqual(recovered.bbox, bbox)
  assert.equal(recovered.actualSeed, 42)
  assert.match(recovered.imageUrl, /^igs-staging:\/\/asset\//)
  assert.equal('assetPath' in recovered || 'frozenPayloadJson' in recovered, false)
  await expect(window.getByRole('region', { name: 'Project Canvas' })).toBeVisible()
  await expect(window.getByRole('toolbar', { name: 'Temporary generation results' })).toBeVisible()
  await expect(candidateCard(window, recovered).locator('.candidate-button')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(window.getByLabel('Result session', { exact: true })).toHaveCount(0)
  assert.deepEqual(readFileSync(packagePath), originalBytes)
  // A recovered result from the supported legacy peer has no thumbnail cache. The strip must
  // keep the candidate selectable without downloading its full PNG as a thumbnail fallback.
  const legacyCandidateButton = window.getByRole('button', {
    name: 'Preview candidate 1',
    exact: true,
  })
  assert.equal('thumbnailUrl' in recovered, false)
  await expect(legacyCandidateButton.locator('img')).toHaveCount(0)
  await expect(legacyCandidateButton.locator('.candidate-placeholder')).toBeVisible()
  await expect(legacyCandidateButton).toHaveAttribute(
    'title',
    'Thumbnail unavailable. Select to preview the full image.',
  )
  await expect(window.getByLabel('Select candidate 1')).toBeEnabled()
  await expect(window.getByRole('button', { name: 'Reuse last seed' })).toBeEnabled()
  const resource = await window.evaluate(async (url) => {
    const response = await fetch(url)
    const bytes = new Uint8Array(await response.arrayBuffer())
    return {
      bytes: bytes.length,
      contentType: response.headers.get('content-type'),
      signature: [...bytes.slice(0, 8)],
      status: response.status,
    }
  }, recovered.imageUrl)
  assert.deepEqual(resource, {
    bytes: output.length,
    contentType: 'image/png',
    signature: [...output.subarray(0, 8)],
    status: 200,
  })
  const imageLoaded = await window.evaluate(async (url) => {
    const image = new Image()
    image.src = url
    await image.decode()
    return { height: image.naturalHeight, width: image.naturalWidth }
  }, recovered.imageUrl)
  assert.deepEqual(imageLoaded, { height: 64, width: 64 })
  await expect.poll(async () => await renderedBlueBounds(window)).not.toBeNull()
  const initialPreviewBounds = await renderedBlueBounds(window)
  assert.ok(initialPreviewBounds)
  await window.getByRole('button', { name: 'Zoom in' }).click()
  await expect
    .poll(async () => {
      const bounds = await renderedBlueBounds(window)
      return bounds ? bounds.right - bounds.left : 0
    })
    .toBeGreaterThan(initialPreviewBounds.right - initialPreviewBounds.left + 1)
  const frozenPreviewBounds = await renderedBlueBounds(window)
  assert.ok(frozenPreviewBounds && frozenPreviewBounds.right > frozenPreviewBounds.left + 20)
  const openTab = await window.evaluate((id) => window.api.projects.open(id), project.id)
  assert.equal(openTab.ok, true)
  assert.equal(openTab.value.tab.layers.length, 0)
  const movedBbox = { ...bbox, x: bbox.x + 10 }
  const canvas = window.getByRole('region', { name: 'Project Canvas' })
  await canvas.getByRole('button', { name: 'Bounding Box tool' }).click()
  await canvas.locator('.canvas-area').focus()
  await canvas.locator('.canvas-area').press('Shift+ArrowRight')
  await expect(window.locator('.bbox-readout')).toContainText(`X ${movedBbox.x}`)
  await expect
    .poll(async () => {
      const open = await window.evaluate((id) => window.api.projects.open(id), project.id)
      return open.ok ? open.value.tab.primaryBbox.x : null
    })
    .toBe(movedBbox.x)
  await expect.poll(async () => await renderedBlueBounds(window)).toEqual(frozenPreviewBounds)
  await window.getByRole('button', { name: 'Save Project' }).click()
  await expect
    .poll(async () => (await readIgsPackage(packagePath)).project.primaryBbox.x)
    .toBe(movedBbox.x)
  const savedProject = (await readIgsPackage(packagePath)).project
  assert.deepEqual(savedProject.primaryBbox, movedBbox)
  assert.equal(savedProject.layers.length, 0)
  assert.equal(savedProject.lastActualSeedSnapshot, 42)
  const afterSave = await window.evaluate(
    (id) => window.api.projects.listGenerationResults(id),
    project.id,
  )
  assert.equal(afterSave.ok, true)
  assert.equal(afterSave.value.candidates.length, 1)
  assert.equal(afterSave.value.lastActualSeed, 42)

  // The actual Results menu calls renderer → preload → main. Replace only the native Save picker;
  // candidate verification, path handling and output publication stay in the production code.
  const packageBeforeExport = readFileSync(packagePath)
  const candidateBeforeExport = readFileSync(candidate.assetPath)
  const stagingManifestPath = path.join(
    path.dirname(path.dirname(candidate.assetPath)),
    'manifest.json',
  )
  const manifestBeforeExport = readFileSync(stagingManifestPath)
  const exportDirectory = path.join(dataRoot, 'exports')
  mkdirSync(exportDirectory)
  const exportedPath = path.join(exportDirectory, 'saved-candidate.png')
  const canvasBoundsBeforeExport = await canvas.locator('.konva-stage').boundingBox()
  assert.ok(canvasBoundsBeforeExport)
  await setNativeSaveDialogResult(application, { canceled: false, filePath: exportedPath })
  let dialogCalls = await nativeSaveDialogCalls(application)
  await clickSaveCandidateImage(window)
  await expect.poll(() => nativeSaveDialogCalls(application)).toBe(dialogCalls + 1)
  await expect(window.getByText('Image exported')).toBeVisible()
  await expect
    .poll(() => canvas.locator('.konva-stage').boundingBox())
    .toEqual(canvasBoundsBeforeExport)
  await expect.poll(() => existsSync(exportedPath)).toBe(true)
  assert.deepEqual(readFileSync(exportedPath), output)
  assert.deepEqual(readFileSync(packagePath), packageBeforeExport)
  assert.deepEqual(readFileSync(candidate.assetPath), candidateBeforeExport)
  assert.deepEqual(readFileSync(stagingManifestPath), manifestBeforeExport)
  const afterExport = await window.evaluate(
    (id) => window.api.projects.listGenerationResults(id),
    project.id,
  )
  assert.equal(afterExport.ok, true)
  assert.deepEqual(
    afterExport.value.candidates.map((item) => item.candidateId),
    [candidate.candidateId],
  )
  const afterExportTab = await window.evaluate((id) => window.api.projects.open(id), project.id)
  assert.equal(afterExportTab.ok, true)
  assert.equal(afterExportTab.value.tab.layers.length, 0)
  assert.equal(afterExportTab.value.tab.dirty, false)

  const filesBeforeCancel = readdirSync(exportDirectory).sort()
  await setNativeSaveDialogResult(application, { canceled: true })
  dialogCalls = await nativeSaveDialogCalls(application)
  await clickSaveCandidateImage(window)
  await expect.poll(() => nativeSaveDialogCalls(application)).toBe(dialogCalls + 1)
  await expect(window.getByText('Image exported')).toHaveCount(0)
  await expect
    .poll(() => canvas.locator('.konva-stage').boundingBox())
    .toEqual(canvasBoundsBeforeExport)
  assert.deepEqual(readdirSync(exportDirectory).sort(), filesBeforeCancel)
  assert.deepEqual(readFileSync(packagePath), packageBeforeExport)
  assert.deepEqual(readFileSync(candidate.assetPath), candidateBeforeExport)
  assert.deepEqual(readFileSync(stagingManifestPath), manifestBeforeExport)

  // A chosen existing destination must never be overwritten, and the temporary source must stay
  // available for another Save attempt. The native picker is allowed to return an existing path.
  const existingPath = path.join(exportDirectory, 'existing-candidate.png')
  const existingBytes = Buffer.from('Keep this unrelated destination unchanged.')
  writeFileSync(existingPath, existingBytes)
  await setNativeSaveDialogResult(application, { canceled: false, filePath: existingPath })
  dialogCalls = await nativeSaveDialogCalls(application)
  await clickSaveCandidateImage(window)
  await expect.poll(() => nativeSaveDialogCalls(application)).toBe(dialogCalls + 1)
  await expect(window.getByText('Image export failed')).toBeVisible()
  await expect(window.getByText(/A file with that name already exists/)).toBeVisible()
  await expect
    .poll(() => canvas.locator('.konva-stage').boundingBox())
    .toEqual(canvasBoundsBeforeExport)
  assert.deepEqual(readFileSync(existingPath), existingBytes)
  assert.deepEqual(
    readdirSync(exportDirectory).sort(),
    [path.basename(existingPath), path.basename(exportedPath)].sort(),
  )
  assert.deepEqual(readFileSync(packagePath), packageBeforeExport)
  assert.deepEqual(readFileSync(candidate.assetPath), candidateBeforeExport)
  assert.deepEqual(readFileSync(stagingManifestPath), manifestBeforeExport)
  const afterFailedExport = await window.evaluate(
    (id) => window.api.projects.listGenerationResults(id),
    project.id,
  )
  assert.equal(afterFailedExport.ok, true)
  assert.deepEqual(
    afterFailedExport.value.candidates.map((item) => item.candidateId),
    [candidate.candidateId],
  )
  const afterFailedExportTab = await window.evaluate(
    (id) => window.api.projects.open(id),
    project.id,
  )
  assert.equal(afterFailedExportTab.ok, true)
  assert.equal(afterFailedExportTab.value.tab.layers.length, 0)
  assert.equal(afterFailedExportTab.value.tab.dirty, false)

  await window.getByRole('button', { name: `Close ${projectTitle}` }).click()
  const closeDialog = window.getByRole('dialog', { name: 'Close Project' })
  await expect(
    closeDialog.getByText('Unaccepted generation results', { exact: false }),
  ).toBeVisible()
  await closeDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(window.getByRole('toolbar', { name: 'Temporary generation results' })).toBeVisible()
  const afterCancel = await window.evaluate(
    (id) => window.api.projects.listGenerationResults(id),
    project.id,
  )
  assert.equal(afterCancel.ok, true)
  assert.deepEqual(
    afterCancel.value.candidates.map((item) => item.candidateId),
    [candidate.candidateId],
  )
  await window.evaluate(async (url) => await (await fetch(url)).arrayBuffer(), recovered.imageUrl)
  await window.getByRole('button', { name: `Close ${projectTitle}` }).click()
  await closeDialog.getByRole('button', { name: 'Discard Candidates and Close' }).click()
  await expect(window.getByRole('tab', { name: projectTitle })).toHaveCount(0)
  const revokedStatus = await window.evaluate(
    async (url) => (await fetch(url)).status,
    recovered.imageUrl,
  )
  assert.equal(revokedStatus, 404)
  await window.getByRole('button', { name: `Open ${projectTitle}` }).click()
  await window.getByRole('tab', { name: projectTitle }).waitFor()
  const afterClose = await window.evaluate(
    (id) => window.api.projects.listGenerationResults(id),
    project.id,
  )
  assert.equal(afterClose.ok, true)
  assert.equal(afterClose.value.candidates.length, 0)
  assert.equal(afterClose.value.lastActualSeed, 42)
  assert.equal(existsSync(candidate.assetPath), false)
  console.log(
    'Desktop Results smoke passed: verified recovery, preview, exact image export, Save, Cancel and discard.',
  )

  // A separate fixture preserves the preview/export/close assertions above. Independently
  // published outputs exercise grouped acceptance across staging sessions and discard of one
  // unselected candidate.
  const beforeAcceptanceProcess = application.process()
  const beforeAcceptanceExited = new Promise((resolve) =>
    beforeAcceptanceProcess.once('exit', resolve),
  )
  assert.equal(beforeAcceptanceProcess.kill('SIGKILL'), true)
  await Promise.race([
    beforeAcceptanceExited,
    delay(10_000).then(() => {
      throw new Error('The Results app did not exit before acceptance fixture publication.')
    }),
  ])
  application = undefined
  const packageBeforeAcceptance = readFileSync(packagePath)
  const acceptanceSource = (await readIgsPackage(packagePath)).project
  assert.equal(acceptanceSource.layers.length, 0)
  const acceptedCandidates = []
  async function publishRecoveryCandidates({
    queue,
    staging,
    projectPath = packagePath,
    seeds = [71, 72, 73],
  }) {
    const published = []
    for (const seed of seeds) {
      const candidatePrepared = {
        ...prepared,
        context: {
          ...prepared.context,
          bbox: acceptanceSource.primaryBbox,
          documentId: acceptanceSource.documentId,
          documentRevision: acceptanceSource.documentRevision,
          sampling: { ...prepared.context.sampling, seed },
        },
      }
      await withIllustriousTxt2ImgRequest({
        modelService: {
          resolveVerifiedGenerationCheckpointForPlan: async (reference) => ({
            managedPath: modelPath,
            reference,
          }),
        },
        prepared: candidatePrepared,
        ready,
        scratchBasePath: path.join(appDataRoot, 'scratch'),
        use: async (request) => {
          const queued = await queue.enqueueIllustriousTxt2Img({
            prepared: candidatePrepared,
            projectPath,
            request,
            stagingSessionId: randomUUID(),
          })
          const claim = await queue.claimNextPending()
          assert.equal(claim?.item.id, queued.id)
          writeFileSync(request.job.output.pngPath, output)
          published.push(
            await staging.publishIllustriousTxt2Img({
              actualSeed: seed,
              expectedProvisionalRoot: request.job.output.stagingRoot,
              expectedStatusSequence: claim.item.statusSequence,
              provisionalOutputPath: request.job.output.pngPath,
              queueItemId: queued.id,
            }),
          )
        },
      })
    }
    return published
  }
  const recoveryNeighborPackagePath = path.join(dataRoot, 'recovery-neighbor.igs')
  writeFileSync(recoveryNeighborPackagePath, packageBeforeAcceptance)
  let recoveryNeighbor
  const acceptanceDatabase = openAppDatabase(appDataRoot, migrations)
  try {
    const queue = new GenerationQueueRepository(acceptanceDatabase.db, appDataRoot)
    const staging = new GenerationStagingRepository(acceptanceDatabase.db, appDataRoot)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    acceptedCandidates.push(...(await publishRecoveryCandidates({ queue, staging })))
    ;[recoveryNeighbor] = await publishRecoveryCandidates({
      queue,
      staging,
      projectPath: recoveryNeighborPackagePath,
      seeds: [91],
    })
  } finally {
    await acceptanceDatabase.close()
  }
  assert.equal(acceptedCandidates.length, 3)
  assert.notEqual(acceptedCandidates[0].stagingSessionId, acceptedCandidates[1].stagingSessionId)
  assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)

  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  await isolateNativeSmokeWindow(application)
  trackMainErrors(application)
  let acceptanceWindow = await application.firstWindow()
  await trackPageErrors(acceptanceWindow)
  await acceptanceWindow.getByRole('tab', { name: 'Home' }).waitFor()
  let acceptanceSnapshot
  const stageOnlyDatabase = openAppDatabase(appDataRoot, migrations)
  try {
    const queueRowsBefore = await stageOnlyDatabase.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('id')
      .execute()
    assert.ok(queueRowsBefore.every((row) => !['pending', 'running'].includes(row.status)))
    const seedRowsBefore = await stageOnlyDatabase.db
      .selectFrom('generation_seed_cursor')
      .selectAll()
      .orderBy('local_project_key')
      .execute()
    const candidateFilesBefore = acceptedCandidates.flatMap((item) => [
      { bytes: readFileSync(item.assetPath), path: item.assetPath },
      {
        bytes: readFileSync(path.join(path.dirname(path.dirname(item.assetPath)), 'manifest.json')),
        path: path.join(path.dirname(path.dirname(item.assetPath)), 'manifest.json'),
      },
    ])
    const cleanShadowPath = path.join(appDataRoot, 'autosave', project.id, 'manifest.json')
    const cleanShadowBefore = existsSync(cleanShadowPath) ? readFileSync(cleanShadowPath) : null
    if (cleanShadowBefore) assert.equal(JSON.parse(cleanShadowBefore).state, 'clean')
    queueNavigationReport.stageOnlyStorageBefore = {
      savedPackageSha256: digest(packageBeforeAcceptance),
      cleanShadowSha256: cleanShadowBefore === null ? null : digest(cleanShadowBefore),
      candidateFiles: candidateFilesBefore.map((file) => ({
        path: file.path,
        sha256: digest(file.bytes),
      })),
      queueRows: queueRowsBefore,
      seedRows: seedRowsBefore,
    }

    // With no unsaved document changes, Cancel must still preserve the independent staging
    // recovery and consume Queue's exact target. A later Home Open asks again from fresh state.
    await openClosedQueueResult(acceptanceWindow, acceptedCandidates[1])
    const stageOnlyDialog = acceptanceWindow.getByRole('dialog', { name: 'Recovery available' })
    await expect(stageOnlyDialog).toBeVisible()
    await expect(
      acceptanceWindow.getByRole('tab', { exact: true, name: projectTitle }),
    ).toHaveCount(0)
    await queueNavigationScreenshot(acceptanceWindow, '02-staging-only-cancel-intent')
    await stageOnlyDialog.getByRole('button', { exact: true, name: 'Cancel' }).click()
    await expect(stageOnlyDialog).toHaveCount(0)
    await expect(
      acceptanceWindow.getByRole('tab', { exact: true, name: projectTitle }),
    ).toHaveCount(0)
    assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
    for (const file of candidateFilesBefore) assert.deepEqual(readFileSync(file.path), file.bytes)
    assert.deepEqual(
      existsSync(cleanShadowPath) ? readFileSync(cleanShadowPath) : null,
      cleanShadowBefore,
    )
    assert.deepEqual(
      await stageOnlyDatabase.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .orderBy('id')
        .execute(),
      queueRowsBefore,
    )
    assert.deepEqual(
      await stageOnlyDatabase.db
        .selectFrom('generation_seed_cursor')
        .selectAll()
        .orderBy('local_project_key')
        .execute(),
      seedRowsBefore,
    )
    await acceptanceWindow
      .getByRole('button', { name: `Open ${projectTitle}`, exact: true })
      .click()
    await expect(stageOnlyDialog).toBeVisible()
    await expect(
      acceptanceWindow.getByRole('tab', { exact: true, name: projectTitle }),
    ).toHaveCount(0)
    await stageOnlyDialog.getByRole('button', { exact: true, name: 'Recover' }).click()
    await acceptanceWindow.getByRole('tab', { name: projectTitle, exact: true }).waitFor()
    const recoveredClean = await acceptanceWindow.evaluate(
      (id) => window.api.projects.open(id),
      project.id,
    )
    assert.equal(recoveredClean.ok, true)
    assert.equal(recoveredClean.value.kind, 'opened')
    assert.equal(recoveredClean.value.tab.dirty, false)
    assert.equal(recoveredClean.value.tab.canUndo, false)
    assert.equal(recoveredClean.value.tab.layers.length, 0)
    assert.deepEqual(recoveredClean.value.tab.primaryBbox, acceptanceSource.primaryBbox)
    await expect(acceptanceWindow.locator('.candidate')).toHaveCount(3)
    await expect(
      candidateCard(acceptanceWindow, acceptedCandidates[0]).locator('.candidate-button'),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(acceptanceWindow.getByLabel('Result session', { exact: true })).toContainText(
      'All results',
    )
    acceptanceSnapshot = await acceptanceWindow.evaluate(
      (id) => window.api.projects.listGenerationResults(id),
      project.id,
    )
    assert.equal(acceptanceSnapshot.ok, true)
    assert.deepEqual(
      acceptanceSnapshot.value.candidates.map((item) => item.candidateId),
      acceptedCandidates.map((item) => item.candidateId),
    )
    assert.deepEqual(acceptanceSnapshot.value.unfinishedSiblingJobIds, [])
    assert.equal(acceptanceSnapshot.value.lastActualSeed, 73)
    for (const file of candidateFilesBefore) assert.deepEqual(readFileSync(file.path), file.bytes)
    assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
    await queueNavigationScreenshot(acceptanceWindow, '02-staging-only-home-recover-clean')
    queueNavigationReport.checks.push({
      name: 'Stage-only Cancel leaves the Project closed and preserves storage; later Home Recover opens saved clean with All focus and no stale Queue intent',
      canceledQueueItemId: acceptedCandidates[1].queueItemId,
      candidateIds: acceptedCandidates.map((item) => item.candidateId),
    })

    acceptanceWindow = await crashAndRestartResultsApplication()
    await openClosedQueueResult(acceptanceWindow, acceptedCandidates[1])
    const exactStageOnlyDialog = acceptanceWindow.getByRole('dialog', {
      name: 'Recovery available',
    })
    await expect(exactStageOnlyDialog).toBeVisible()
    await expect(
      acceptanceWindow.getByRole('tab', { exact: true, name: projectTitle }),
    ).toHaveCount(0)
    await exactStageOnlyDialog.getByRole('button', { exact: true, name: 'Recover' }).click()
    await acceptanceWindow.getByRole('tab', { exact: true, name: projectTitle }).waitFor()
    await expect(
      candidateCard(acceptanceWindow, acceptedCandidates[1]).locator('.candidate-button'),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(acceptanceWindow.locator('.candidate')).toHaveCount(1)
    await expect(acceptanceWindow.getByLabel('Result session', { exact: true })).toContainText(
      'Session 2',
    )
    const exactCleanTab = await acceptanceWindow.evaluate(
      (id) => window.api.projects.open(id),
      project.id,
    )
    assert.equal(exactCleanTab.ok, true)
    assert.equal(exactCleanTab.value.tab.dirty, false)
    assert.equal(exactCleanTab.value.tab.canUndo, false)
    assert.equal(exactCleanTab.value.tab.layers.length, 0)
    const exactStageResults = await acceptanceWindow.evaluate(
      (id) => window.api.projects.listGenerationResults(id),
      project.id,
    )
    assert.deepEqual(
      durableResultsSnapshot(exactStageResults),
      durableResultsSnapshot(acceptanceSnapshot),
    )
    assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
    await queueNavigationScreenshot(acceptanceWindow, '03-staging-only-queue-recover-exact')
    queueNavigationReport.checks.push({
      name: 'Stage-only Queue Open resumes its exact session and candidate only after explicit Recover; document remains saved clean',
      queueItemId: acceptedCandidates[1].queueItemId,
      candidateId: acceptedCandidates[1].candidateId,
    })

    // The destructive choice must cover every temporary session even without a dirty shadow.
    acceptanceWindow = await crashAndRestartResultsApplication()
    await openClosedQueueResult(acceptanceWindow, acceptedCandidates[2])
    const discardStageOnlyDialog = acceptanceWindow.getByRole('dialog', {
      name: 'Recovery available',
    })
    await expect(discardStageOnlyDialog).toBeVisible()
    await discardStageOnlyDialog
      .getByRole('button', { exact: true, name: 'Discard Recovery and Open Saved' })
      .click()
    await acceptanceWindow.getByRole('tab', { exact: true, name: projectTitle }).waitFor()
    await expect(
      acceptanceWindow.getByRole('region', { exact: true, name: 'Generation Results' }),
    ).toHaveCount(0)
    await expect(
      acceptanceWindow.getByRole('toolbar', { exact: true, name: 'Temporary generation results' }),
    ).toHaveCount(0)
    await expect(acceptanceWindow.locator('.candidate')).toHaveCount(0)
    const stageDiscardTab = await acceptanceWindow.evaluate(
      (id) => window.api.projects.open(id),
      project.id,
    )
    assert.equal(stageDiscardTab.ok, true)
    assert.equal(stageDiscardTab.value.tab.dirty, false)
    assert.equal(stageDiscardTab.value.tab.canUndo, false)
    assert.equal(stageDiscardTab.value.tab.layers.length, 0)
    assert.deepEqual(stageDiscardTab.value.tab.primaryBbox, acceptanceSource.primaryBbox)
    const stageDiscardResults = await acceptanceWindow.evaluate(
      (id) => window.api.projects.listGenerationResults(id),
      project.id,
    )
    assert.equal(stageDiscardResults.ok, true)
    assert.deepEqual(stageDiscardResults.value.candidates, [])
    assert.equal(stageDiscardResults.value.lastActualSeed, 73)
    const tombstones = await stageOnlyDatabase.db
      .selectFrom('generation_staging_discarded_session')
      .select(['local_project_key', 'staging_session_id'])
      .execute()
    assert.ok(
      acceptedCandidates.every((item) =>
        tombstones.some(
          (row) =>
            row.local_project_key === item.localProjectKey &&
            row.staging_session_id === item.stagingSessionId,
        ),
      ),
    )
    assert.equal(
      tombstones.some(
        (row) =>
          row.local_project_key === recoveryNeighbor.localProjectKey &&
          row.staging_session_id === recoveryNeighbor.stagingSessionId,
      ),
      false,
    )
    await expect
      .poll(() => acceptedCandidates.every((item) => !existsSync(item.assetPath)))
      .toBe(true)
    assert.deepEqual(
      await stageOnlyDatabase.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .orderBy('id')
        .execute(),
      queueRowsBefore,
    )
    assert.deepEqual(
      await stageOnlyDatabase.db
        .selectFrom('generation_seed_cursor')
        .selectAll()
        .orderBy('local_project_key')
        .execute(),
      seedRowsBefore,
    )
    assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
    assert.deepEqual(readFileSync(recoveryNeighborPackagePath), packageBeforeAcceptance)
    assert.deepEqual(readFileSync(recoveryNeighbor.assetPath), output)
    const queue = new GenerationQueueRepository(stageOnlyDatabase.db, appDataRoot)
    await queue.recoverAfterRestart()
    const staging = new GenerationStagingRepository(stageOnlyDatabase.db, appDataRoot)
    await staging.recoverAfterRestart()
    assert.equal((await staging.listVerifiedCandidates(recoveryNeighbor.localProjectKey)).length, 1)
    await queueNavigationScreenshot(acceptanceWindow, '03-staging-only-discard-saved-no-results')
    queueNavigationReport.checks.push({
      name: 'Stage-only Discard tombstones and removes every Project temporary session without Queue autofocus; saved package, seed, queue rows and neighbor remain unchanged',
      discardedCandidateIds: acceptedCandidates.map((item) => item.candidateId),
      preservedNeighborCandidateId: recoveryNeighbor.candidateId,
    })

    // New production publication supplies distinct candidates for the retained dirty-shadow
    // controls below. Tombstoned identities are never revived after the destructive decision.
    acceptedCandidates.splice(
      0,
      acceptedCandidates.length,
      ...(await publishRecoveryCandidates({ queue, staging })),
    )
    await acceptanceWindow.getByRole('button', { exact: true, name: 'Open Queue Manager' }).click()
    const refreshStageOnlyQueue = acceptanceWindow.getByRole('dialog', {
      exact: true,
      name: 'Queue Manager',
    })
    await refreshStageOnlyQueue
      .getByRole('button', { exact: true, name: 'Close Queue Manager' })
      .click()
    await expect(acceptanceWindow.locator('.candidate')).toHaveCount(3)
    acceptanceSnapshot = await acceptanceWindow.evaluate(
      (id) => window.api.projects.listGenerationResults(id),
      project.id,
    )
    assert.equal(acceptanceSnapshot.ok, true)
    assert.deepEqual(
      acceptanceSnapshot.value.candidates.map((item) => item.candidateId),
      acceptedCandidates.map((item) => item.candidateId),
    )
    assert.deepEqual(acceptanceSnapshot.value.unfinishedSiblingJobIds, [])
  } finally {
    await stageOnlyDatabase.close()
  }

  // Recovery is an ordinary document decision before the one-use result intent resumes. Build a
  // real dirty shadow through Canvas, then crash without accepting or saving any candidate.
  const shadowBbox = { ...acceptanceSource.primaryBbox, x: acceptanceSource.primaryBbox.x + 1 }
  const acceptanceCanvas = acceptanceWindow.getByRole('region', {
    exact: true,
    name: 'Project Canvas',
  })
  await acceptanceCanvas.getByRole('button', { exact: true, name: 'Bounding Box tool' }).click()
  await acceptanceCanvas.locator('.canvas-area').focus()
  await acceptanceCanvas.locator('.canvas-area').press('ArrowRight')
  await expect
    .poll(async () => {
      const opened = await acceptanceWindow.evaluate(
        (id) => window.api.projects.open(id),
        project.id,
      )
      return opened.ok && opened.value.kind === 'opened' ? opened.value.tab.primaryBbox : null
    })
    .toEqual(shadowBbox)
  await expect(
    acceptanceWindow
      .getByRole('region', { name: `Project ${projectTitle}` })
      .getByText('Unsaved changes', {
        exact: true,
      }),
  ).toBeVisible()
  // Dirty renderer state precedes the debounced autosave. Establish a real committed recovery
  // precondition before SIGKILL rather than assuming the visible edit is already on disk.
  const navigationShadowManifest = path.join(appDataRoot, 'autosave', project.id, 'manifest.json')
  await expect
    .poll(() => {
      try {
        const manifest = JSON.parse(readFileSync(navigationShadowManifest, 'utf8'))
        if (manifest.state !== 'dirty' || typeof manifest.snapshotId !== 'string') return null
        const shadow = JSON.parse(
          readFileSync(
            path.join(
              path.dirname(navigationShadowManifest),
              'snapshots',
              manifest.snapshotId,
              'project.json',
            ),
            'utf8',
          ),
        )
        return shadow.documentRevision === manifest.documentRevision ? shadow.primaryBbox : null
      } catch (cause) {
        if (cause.code === 'ENOENT') return null
        throw cause
      }
    })
    .toEqual(shadowBbox)
  assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
  acceptanceWindow = await crashAndRestartResultsApplication()
  await openClosedQueueResult(acceptanceWindow, acceptedCandidates[1])
  const canceledRecovery = acceptanceWindow.getByRole('dialog', { name: 'Recovery available' })
  await expect(canceledRecovery).toBeVisible()
  await queueNavigationScreenshot(acceptanceWindow, '04-recovery-cancel-intent')
  await canceledRecovery.getByRole('button', { exact: true, name: 'Cancel' }).click()
  await expect(canceledRecovery).toHaveCount(0)
  await expect(acceptanceWindow.getByRole('tab', { exact: true, name: projectTitle })).toHaveCount(
    0,
  )
  // Opening independently after Cancel must not resurrect the target Session 2 intent.
  await acceptanceWindow.getByRole('button', { name: `Open ${projectTitle}` }).click()
  await canceledRecovery.getByRole('button', { exact: true, name: 'Recover' }).click()
  await acceptanceWindow.getByRole('tab', { exact: true, name: projectTitle }).waitFor()
  await expect(acceptanceWindow.locator('.candidate')).toHaveCount(3)
  await expect(
    candidateCard(acceptanceWindow, acceptedCandidates[0]).locator('.candidate-button'),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(acceptanceWindow.getByLabel('Result session', { exact: true })).toContainText(
    'All results',
  )
  assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
  queueNavigationReport.checks.push({
    name: 'Cancel recovery consumes closed-Project result intent; ordinary later Recover keeps default All focus',
    queueItemId: acceptedCandidates[1].queueItemId,
  })

  {
    const decision = 'Recover'
    const index = 1
    acceptanceWindow = await crashAndRestartResultsApplication()
    await openClosedQueueResult(acceptanceWindow, acceptedCandidates[index])
    const dialog = acceptanceWindow.getByRole('dialog', { name: 'Recovery available' })
    await expect(dialog).toBeVisible()
    assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
    await dialog.getByRole('button', { exact: true, name: decision }).click()
    await acceptanceWindow.getByRole('tab', { exact: true, name: projectTitle }).waitFor()
    const target = acceptedCandidates[index]
    await expect(
      candidateCard(acceptanceWindow, target).locator('.candidate-button'),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(acceptanceWindow.locator('.candidate')).toHaveCount(1)
    await expect(acceptanceWindow.getByLabel('Result session', { exact: true })).toContainText(
      `Session ${index + 1}`,
    )
    const recoveredOpen = await acceptanceWindow.evaluate(
      (id) => window.api.projects.open(id),
      project.id,
    )
    assert.equal(recoveredOpen.ok, true)
    assert.deepEqual(recoveredOpen.value.tab.primaryBbox, shadowBbox)
    assert.equal(recoveredOpen.value.tab.dirty, true)
    const results = await acceptanceWindow.evaluate(
      (id) => window.api.projects.listGenerationResults(id),
      project.id,
    )
    assert.deepEqual(durableResultsSnapshot(results), durableResultsSnapshot(acceptanceSnapshot))
    assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
    assert.ok(acceptedCandidates.every((item) => readFileSync(item.assetPath).equals(output)))
    await queueNavigationScreenshot(acceptanceWindow, `05-recovery-${index}-exact-result`)
    queueNavigationReport.checks.push({
      candidateId: target.candidateId,
      decision,
      name: 'Queue Open continues through the explicit recovery decision to the exact session and candidate',
      queueItemId: target.queueItemId,
      stagingSessionId: target.stagingSessionId,
    })
  }

  // Discard is destructive for this Project's whole local recovery, including every temporary
  // session. It must consume the queue navigation intent instead of restoring its result focus.
  acceptanceWindow = await crashAndRestartResultsApplication()
  await openClosedQueueResult(acceptanceWindow, acceptedCandidates[2])
  const discardRecoveryDialog = acceptanceWindow.getByRole('dialog', { name: 'Recovery available' })
  await expect(discardRecoveryDialog).toBeVisible()
  const discardDatabase = openAppDatabase(appDataRoot, migrations)
  try {
    const queueRowsBefore = await discardDatabase.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('id')
      .execute()
    assert.ok(queueRowsBefore.every((row) => !['pending', 'running'].includes(row.status)))
    const seedRowsBefore = await discardDatabase.db
      .selectFrom('generation_seed_cursor')
      .selectAll()
      .orderBy('local_project_key')
      .execute()
    await discardRecoveryDialog
      .getByRole('button', { exact: true, name: 'Discard Recovery and Open Saved' })
      .click()
    await acceptanceWindow.getByRole('tab', { exact: true, name: projectTitle }).waitFor()
    await expect(
      acceptanceWindow.getByRole('region', { exact: true, name: 'Generation Results' }),
    ).toHaveCount(0)
    await expect(acceptanceWindow.locator('.candidate')).toHaveCount(0)
    await expect(acceptanceWindow.getByLabel('Result session', { exact: true })).toHaveCount(0)
    const discardedOpen = await acceptanceWindow.evaluate(
      (id) => window.api.projects.open(id),
      project.id,
    )
    assert.equal(discardedOpen.ok, true)
    assert.equal(discardedOpen.value.tab.dirty, false)
    assert.deepEqual(discardedOpen.value.tab.primaryBbox, acceptanceSource.primaryBbox)
    assert.equal(existsSync(navigationShadowManifest), false)
    const discardedResults = await acceptanceWindow.evaluate(
      (id) => window.api.projects.listGenerationResults(id),
      project.id,
    )
    assert.equal(discardedResults.ok, true)
    assert.deepEqual(discardedResults.value.candidates, [])
    assert.equal(discardedResults.value.lastActualSeed, 73)
    const tombstones = await discardDatabase.db
      .selectFrom('generation_staging_discarded_session')
      .select(['local_project_key', 'staging_session_id'])
      .execute()
    assert.ok(
      acceptedCandidates.every((item) =>
        tombstones.some(
          (row) =>
            row.local_project_key === item.localProjectKey &&
            row.staging_session_id === item.stagingSessionId,
        ),
      ),
    )
    assert.equal(
      tombstones.some(
        (row) =>
          row.local_project_key === recoveryNeighbor.localProjectKey &&
          row.staging_session_id === recoveryNeighbor.stagingSessionId,
      ),
      false,
    )
    await expect
      .poll(() => acceptedCandidates.every((item) => !existsSync(item.assetPath)))
      .toBe(true)
    assert.deepEqual(
      await discardDatabase.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .orderBy('id')
        .execute(),
      queueRowsBefore,
    )
    assert.deepEqual(
      await discardDatabase.db
        .selectFrom('generation_seed_cursor')
        .selectAll()
        .orderBy('local_project_key')
        .execute(),
      seedRowsBefore,
    )
    assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
    assert.deepEqual(readFileSync(recoveryNeighborPackagePath), packageBeforeAcceptance)
    assert.deepEqual(readFileSync(recoveryNeighbor.assetPath), output)
    const staging = new GenerationStagingRepository(discardDatabase.db, appDataRoot)
    await staging.recoverAfterRestart()
    assert.equal((await staging.listVerifiedCandidates(recoveryNeighbor.localProjectKey)).length, 1)
    await queueNavigationScreenshot(acceptanceWindow, '05-recovery-discard-saved-no-results')
    queueNavigationReport.checks.push({
      name: 'Discard Recovery removes this Project shadow and all temporary sessions; no result intent resumes; saved package, seed, queue history and neighbor remain unchanged',
      discardedCandidateIds: acceptedCandidates.map((item) => item.candidateId),
      preservedNeighborCandidateId: recoveryNeighbor.candidateId,
    })
    // Fresh real queue/staging publication prepares independent filter/Add regressions after the
    // destructive decision. It never revives the tombstoned old identities or their focus intent.
    const queue = new GenerationQueueRepository(discardDatabase.db, appDataRoot)
    await queue.recoverAfterRestart()
    acceptedCandidates.splice(
      0,
      acceptedCandidates.length,
      ...(await publishRecoveryCandidates({ queue, staging })),
    )
    await acceptanceWindow.getByRole('button', { exact: true, name: 'Open Queue Manager' }).click()
    const refreshedQueue = acceptanceWindow.getByRole('dialog', {
      exact: true,
      name: 'Queue Manager',
    })
    await refreshedQueue.getByRole('button', { exact: true, name: 'Close Queue Manager' }).click()
    await expect(acceptanceWindow.locator('.candidate')).toHaveCount(3)
    acceptanceSnapshot = await acceptanceWindow.evaluate(
      (id) => window.api.projects.listGenerationResults(id),
      project.id,
    )
    assert.equal(acceptanceSnapshot.ok, true)
    assert.deepEqual(
      acceptanceSnapshot.value.candidates.map((item) => item.candidateId),
      acceptedCandidates.map((item) => item.candidateId),
    )
    await expect(
      candidateCard(acceptanceWindow, acceptedCandidates[0]).locator('.candidate-button'),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(acceptanceWindow.getByLabel('Result session', { exact: true })).toContainText(
      'All results',
    )
  } finally {
    const beforeClose = queueNavigationArtifacts
      ? fixtureDatabaseDescriptors(application.process().pid)
      : null
    await discardDatabase.close()
    if (queueNavigationArtifacts) {
      writeFileSync(
        path.join(queueNavigationArtifacts, 'fixture-wal-lifetime.json'),
        `${JSON.stringify({ beforeClose, afterClose: fixtureDatabaseDescriptors(application.process().pid) }, null, 2)}\n`,
      )
    }
  }

  await chooseResultSession(acceptanceWindow, 'All results')
  const filterState = await acceptanceWindow.evaluate(
    async (id) =>
      await Promise.all([
        window.api.projects.open(id),
        window.api.projects.listGenerationResults(id),
        window.api.projects.getGenerationState(id),
        window.api.projects.getGenerationQueue(),
      ]),
    project.id,
  )
  await chooseResultSession(acceptanceWindow, 'Session 2 · 1')
  await expect(acceptanceWindow.locator('.candidate')).toHaveCount(1)
  await expect(
    candidateCard(acceptanceWindow, acceptedCandidates[1]).locator('.candidate-button'),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    candidateCard(acceptanceWindow, acceptedCandidates[1]).getByRole('checkbox'),
  ).not.toBeChecked()
  await expect(
    acceptanceWindow.getByRole('button', { exact: true, name: 'Add 1 as Layer' }),
  ).toBeEnabled()
  await expect(
    acceptanceWindow.getByText('1 selected in other sessions. Add includes these results.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    acceptanceWindow.getByRole('button', { exact: true, name: 'Previous result preview' }),
  ).toBeDisabled()
  await expect(
    acceptanceWindow.getByRole('button', { exact: true, name: 'Next result preview' }),
  ).toBeDisabled()
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(900, 620),
  )
  await queueNavigationScreenshot(acceptanceWindow, '06-filter-compact-hidden-selection')
  await acceptanceWindow
    .getByRole('button', { exact: true, name: 'Result selection actions' })
    .click()
  await acceptanceWindow
    .getByRole('menuitem', { exact: true, name: 'Select all completed across all sessions' })
    .click()
  await expect(
    acceptanceWindow.getByRole('button', { exact: true, name: 'Add 3 as Layers' }),
  ).toBeEnabled()
  await expect(
    acceptanceWindow.getByText('2 selected in other sessions. Add includes these results.', {
      exact: true,
    }),
  ).toBeVisible()
  await acceptanceWindow
    .getByRole('button', { exact: true, name: 'Result selection actions' })
    .click()
  await acceptanceWindow
    .getByRole('menuitem', { exact: true, name: 'Clear selection across all sessions' })
    .click()
  await expect(
    acceptanceWindow.getByRole('button', { exact: true, name: 'Add as Layers' }),
  ).toBeDisabled()
  await chooseResultSession(acceptanceWindow, 'All results')
  await expect(acceptanceWindow.locator('.candidate')).toHaveCount(3)
  await expect(
    acceptanceWindow.getByRole('button', { exact: true, name: 'Next result preview' }),
  ).toBeEnabled()
  await acceptanceWindow.getByRole('button', { exact: true, name: 'Next result preview' }).click()
  await expect(
    candidateCard(acceptanceWindow, acceptedCandidates[2]).locator('.candidate-button'),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    acceptanceWindow.getByRole('button', { exact: true, name: 'Add as Layers' }),
  ).toBeDisabled()
  await acceptanceWindow.getByLabel('Result session', { exact: true }).click()
  await acceptanceWindow
    .getByRole('combobox', { exact: true, name: 'Result session search' })
    .press('ArrowDown')
  await acceptanceWindow
    .getByRole('combobox', { exact: true, name: 'Result session search' })
    .press('Enter')
  await expect(acceptanceWindow.getByLabel('Result session', { exact: true })).toContainText(
    'Session 1',
  )
  await expect(candidateCard(acceptanceWindow, acceptedCandidates[0])).toBeVisible()
  assert.deepEqual(
    await acceptanceWindow.evaluate(
      async (id) =>
        await Promise.all([
          window.api.projects.open(id),
          window.api.projects.listGenerationResults(id),
          window.api.projects.getGenerationState(id),
          window.api.projects.getGenerationQueue(),
        ]),
      project.id,
    ),
    filterState,
  )
  assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
  await queueNavigationScreenshot(acceptanceWindow, '07-filter-keyboard-session')
  queueNavigationReport.checks.push({
    name: 'Session filter and keyboard navigation preserve durable state; global Select all/Clear and hidden checked count remain explicit',
    sessionIds: acceptedCandidates.map((item) => item.stagingSessionId),
  })

  // Existing genuine candidates span three sessions. Queue navigation must pin the exact job,
  // session and candidate, and change only focus even when the target is not checked for Add.
  // Home unmounts Canvas by the existing application contract, so a fresh mount keeps its normal
  // first-candidate selection default rather than promising selection persistence across mounts.
  await acceptanceWindow.getByRole('tab', { name: 'Home', exact: true }).click()
  await acceptanceWindow.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
  const homeNavigationManager = acceptanceWindow.getByRole('dialog', {
    name: 'Queue Manager',
    exact: true,
  })
  const homeTarget = acceptanceSnapshot.value.candidates[1]
  await homeNavigationManager
    .locator(`[data-testid="queue-job-row"][data-job-id="${homeTarget.queueItemId}"]`)
    .getByRole('button', { name: 'Show job details', exact: true })
    .click()
  await homeNavigationManager.getByRole('button', { name: 'View result', exact: true }).click()
  await expect(homeNavigationManager).toHaveCount(0)
  await expect(
    candidateCard(acceptanceWindow, homeTarget).locator('.candidate-button'),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(acceptanceWindow.locator('.candidate')).toHaveCount(1)
  await expect(
    acceptanceWindow.getByText('1 selected in other sessions. Add includes these results.', {
      exact: true,
    }),
  ).toBeVisible()
  await chooseResultSession(acceptanceWindow, 'All results')
  await expect(acceptanceWindow.getByLabel('Select candidate 1')).toBeChecked()
  await expect(acceptanceWindow.getByLabel('Select candidate 2')).not.toBeChecked()
  await expect(acceptanceWindow.getByLabel('Select candidate 3')).not.toBeChecked()
  assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
  queueNavigationReport.checks.push({
    candidateId: homeTarget.candidateId,
    name: 'Home View result mounts exact requested candidate without changing default Add selection',
    queueItemId: homeTarget.queueItemId,
    stagingSessionId: homeTarget.stagingSessionId,
  })
  const navigationCheckboxes = [1, 2, 3].map((index) =>
    acceptanceWindow.getByLabel(`Select candidate ${index}`),
  )
  await expect(navigationCheckboxes[0]).toBeChecked()
  await navigationCheckboxes[0].click()
  await navigationCheckboxes[2].click()
  async function navigationState() {
    return {
      api: await acceptanceWindow.evaluate(
        async (id) =>
          await Promise.all([
            window.api.projects.open(id),
            window.api.projects.listGenerationResults(id),
            window.api.projects.getGenerationState(id),
            window.api.projects.getGenerationQueue(),
          ]),
        project.id,
      ),
      packageSha256: digest(readFileSync(packagePath)),
      redoEnabled: await acceptanceWindow
        .getByRole('button', { name: 'Redo', exact: true })
        .isEnabled(),
      undoEnabled: await acceptanceWindow
        .getByRole('button', { name: 'Undo', exact: true })
        .isEnabled(),
    }
  }
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(900, 620)
  })
  const beforeQueueNavigation = await navigationState()
  assert.deepEqual(
    await Promise.all(navigationCheckboxes.map((checkbox) => checkbox.isChecked())),
    [false, false, true],
  )
  for (const [step, index] of [1, 0, 1].entries()) {
    const target = acceptanceSnapshot.value.candidates[index]
    await acceptanceWindow
      .getByRole('button', { name: 'Hide candidate preview', exact: true })
      .click()
    await acceptanceWindow
      .getByRole('button', { name: 'Collapse Generation Results', exact: true })
      .click()
    await expect(
      acceptanceWindow.getByRole('button', { name: 'Preview candidate 1', exact: true }),
    ).toHaveCount(0)
    await acceptanceWindow.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
    const navigationManager = acceptanceWindow.getByRole('dialog', {
      name: 'Queue Manager',
      exact: true,
    })
    const navigationRow = navigationManager.locator(
      `[data-testid="queue-job-row"][data-job-id="${target.queueItemId}"]`,
    )
    await navigationRow.getByRole('button', { name: 'Show job details', exact: true }).click()
    await expect(navigationRow.locator('[data-testid="queue-job-thumbnail"] img')).toHaveCount(0)
    await expect(
      navigationManager.locator('[data-testid="queue-result-thumbnail"] img'),
    ).toHaveCount(0)
    await expect(
      navigationManager.getByRole('button', { name: 'View result', exact: true }),
    ).toBeEnabled()
    await queueNavigationScreenshot(acceptanceWindow, `02-${step}-session-queue`)
    await navigationManager.getByRole('button', { name: 'View result', exact: true }).click()
    await expect(navigationManager).toHaveCount(0)
    await expect(
      candidateCard(acceptanceWindow, target).locator('.candidate-button'),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(acceptanceWindow.locator('.candidate')).toHaveCount(1)
    await expect(acceptanceWindow.getByLabel('Result session', { exact: true })).toContainText(
      `Session ${index + 1}`,
    )
    await expect(
      acceptanceWindow.getByRole('button', { exact: true, name: 'Add 1 as Layer' }),
    ).toBeEnabled()
    await expect(
      acceptanceWindow.getByText('1 selected in other sessions. Add includes these results.', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      acceptanceWindow.getByRole('button', { name: 'Hide candidate preview', exact: true }),
    ).toBeVisible()
    await expect(
      acceptanceWindow.getByRole('button', { name: 'Collapse Generation Results', exact: true }),
    ).toBeVisible()
    await expect.poll(() => renderedBlueBounds(acceptanceWindow)).not.toBeNull()
    const focusedPreviewBounds = await renderedBlueBounds(acceptanceWindow)
    const canvasViewport = await acceptanceWindow
      .getByRole('region', { name: 'Project Canvas' })
      .boundingBox()
    assert.ok(focusedPreviewBounds && canvasViewport)
    assert.ok(focusedPreviewBounds.right <= canvasViewport.width)
    assert.ok(focusedPreviewBounds.bottom <= canvasViewport.height)
    assert.deepEqual(await navigationState(), beforeQueueNavigation)
    await queueNavigationScreenshot(acceptanceWindow, `03-${step}-exact-focused-project`)
    await chooseResultSession(acceptanceWindow, 'All results')
    assert.deepEqual(
      await Promise.all(navigationCheckboxes.map((checkbox) => checkbox.isChecked())),
      [false, false, true],
    )
    for (const other of [1, 2, 3]) {
      await expect(
        acceptanceWindow.getByRole('button', { name: `Preview candidate ${other}`, exact: true }),
      ).toHaveAttribute('aria-pressed', String(other === index + 1))
    }
    queueNavigationReport.checks.push({
      candidateId: target.candidateId,
      name: 'View result pins exact candidate/session/job, shows hidden/collapsed preview and preserves independent selection',
      packageSha256: beforeQueueNavigation.packageSha256,
      queueItemId: target.queueItemId,
      stagingSessionId: target.stagingSessionId,
      step,
    })
  }
  await navigationCheckboxes[0].click()
  await navigationCheckboxes[2].click()
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900)
  })
  await chooseResultSession(acceptanceWindow, 'Session 2 · 1')
  await queueNavigationScreenshot(acceptanceWindow, '08-filter-normal-hidden-selection')
  await chooseResultSession(acceptanceWindow, 'All results')
  console.log(
    'Native queue navigation smoke passed: closed Project, three exact cross-session/repeated focus actions, independent selection and durable state.',
  )

  // Startup correctly cancels unfinished work from a previous application lifetime. Insert these
  // genuine frozen queue inputs only after recovery has completed; a second WAL connection prepares
  // the fixture, without rerunning restart recovery or replacing the production Add entry point.
  const unfinishedJobs = []
  const neighborJobs = []
  liveFixtureDatabase = openAppDatabase(appDataRoot, migrations)
  const liveFixtureQueue = new GenerationQueueRepository(liveFixtureDatabase.db, appDataRoot)
  async function enqueuePendingFixture({
    documentId,
    projectPath = packagePath,
    stagingSessionId,
  }) {
    const pendingPrepared = {
      ...prepared,
      context: {
        ...prepared.context,
        bbox: acceptanceSource.primaryBbox,
        documentId,
        documentRevision: acceptanceSource.documentRevision,
      },
    }
    return await withIllustriousTxt2ImgRequest({
      modelService: {
        resolveVerifiedGenerationCheckpointForPlan: async (reference) => ({
          managedPath: modelPath,
          reference,
        }),
      },
      prepared: pendingPrepared,
      ready,
      scratchBasePath: path.join(appDataRoot, 'scratch'),
      use: async (request) =>
        await liveFixtureQueue.enqueueIllustriousTxt2Img({
          prepared: pendingPrepared,
          projectPath,
          request,
          stagingSessionId,
        }),
    })
  }
  async function fixtureQueueRows() {
    return await liveFixtureDatabase.db
      .selectFrom('generation_queue_item')
      .select(['id', 'status', 'status_sequence', 'error_code'])
      .where(
        'id',
        'in',
        [...unfinishedJobs, ...neighborJobs].map((job) => job.id),
      )
      .orderBy('id')
      .execute()
  }
  for (const completed of [acceptedCandidates[0], acceptedCandidates[2]]) {
    unfinishedJobs.push(
      await enqueuePendingFixture({
        documentId: acceptanceSource.documentId,
        stagingSessionId: completed.stagingSessionId,
      }),
    )
  }
  neighborJobs.push(
    await enqueuePendingFixture({
      documentId: acceptanceSource.documentId,
      stagingSessionId: randomUUID(),
    }),
  )
  neighborJobs.push(
    await enqueuePendingFixture({
      documentId: randomUUID(),
      stagingSessionId: acceptedCandidates[0].stagingSessionId,
    }),
  )
  const neighborPackagePath = path.join(dataRoot, 'neighbor.igs')
  writeFileSync(neighborPackagePath, packageBeforeAcceptance)
  neighborJobs.push(
    await enqueuePendingFixture({
      documentId: acceptanceSource.documentId,
      projectPath: neighborPackagePath,
      stagingSessionId: acceptedCandidates[0].stagingSessionId,
    }),
  )
  const pendingSnapshot = await acceptanceWindow.evaluate(
    (id) => window.api.projects.listGenerationResults(id),
    project.id,
  )
  if (queueNavigationArtifacts) {
    const nativeQueue = await acceptanceWindow.evaluate(() =>
      window.api.projects.getGenerationQueue(null),
    )
    const repeatSnapshot = await acceptanceWindow.evaluate(
      (id) => window.api.projects.listGenerationResults(id),
      project.id,
    )
    const opened = await acceptanceWindow.evaluate((id) => window.api.projects.open(id), project.id)
    const rows = await liveFixtureDatabase.db
      .selectFrom('generation_queue_item')
      .select([
        'id',
        'local_project_key',
        'document_id',
        'staging_session_id',
        'status',
        'error_code',
        'status_sequence',
      ])
      .orderBy('id')
      .execute()
    writeFileSync(
      path.join(queueNavigationArtifacts, 'early-add-precondition.json'),
      `${JSON.stringify(
        {
          expectedDocumentId: acceptanceSource.documentId,
          expectedProjectKey: project.id,
          expectedCandidateSessions: acceptedCandidates.map((item) => ({
            candidateId: item.candidateId,
            documentId: item.documentId,
            projectKey: item.localProjectKey,
            sessionId: item.stagingSessionId,
          })),
          expectedSiblingJobIds: unfinishedJobs.map((job) => job.id),
          opened,
          pendingSnapshot,
          repeatSnapshot,
          nativeQueue,
          databaseDescriptors: fixtureDatabaseDescriptors(application.process().pid),
          queueRows: rows,
        },
        null,
        2,
      )}\n`,
    )
  }
  assert.equal(pendingSnapshot.ok, true, JSON.stringify(pendingSnapshot))
  assert.deepEqual(
    [...pendingSnapshot.value.unfinishedSiblingJobIds].sort(),
    unfinishedJobs.map((job) => job.id).sort(),
  )
  const pendingRows = await fixtureQueueRows()
  assert.equal(pendingRows.length, unfinishedJobs.length + neighborJobs.length)
  assert.ok(pendingRows.every((row) => row.status === 'pending' && row.status_sequence === 0))
  const firstCheckbox = acceptanceWindow.getByLabel('Select candidate 1')
  const secondCheckbox = acceptanceWindow.getByLabel('Select candidate 2')
  const thirdCheckbox = acceptanceWindow.getByLabel('Select candidate 3')
  await expect(firstCheckbox).toBeChecked()
  await expect(secondCheckbox).not.toBeChecked()
  await expect(thirdCheckbox).not.toBeChecked()
  await acceptanceWindow.getByRole('button', { name: 'Preview candidate 2' }).click()
  await expect(
    acceptanceWindow.getByRole('button', { name: 'Preview candidate 2' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(firstCheckbox).toBeChecked()
  await expect(secondCheckbox).not.toBeChecked()
  await secondCheckbox.click()
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(900, 620)
  })

  // Unfinished siblings alone require an explicit cancellation decision, even if every completed
  // result is selected. Declining must preserve the real rows, candidates and saved document.
  await thirdCheckbox.click()
  await acceptanceWindow.getByRole('button', { name: 'Add 3 as Layers' }).click()
  const acceptanceDialog = acceptanceWindow.getByRole('dialog', {
    name: 'Accept generation results',
  })
  await expect(acceptanceDialog).toBeVisible()
  await expect(
    acceptanceDialog.getByText('2 unfinished generation jobs will be canceled before Add.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    acceptanceDialog.getByRole('button', { name: 'Add 3, Cancel 2', exact: true }),
  ).toBeVisible()
  if (process.env.IMAGEGEN_SMOKE_EARLY_ADD_DIALOG_SCREENSHOT) {
    await acceptanceWindow.screenshot({
      animations: 'disabled',
      path: process.env.IMAGEGEN_SMOKE_EARLY_ADD_DIALOG_SCREENSHOT,
    })
  }
  await acceptanceDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(acceptanceDialog).toBeHidden()
  assert.deepEqual(await fixtureQueueRows(), pendingRows)
  const afterJobsOnlyCancel = await acceptanceWindow.evaluate(
    (id) => window.api.projects.listGenerationResults(id),
    project.id,
  )
  assert.equal(afterJobsOnlyCancel.ok, true)
  assert.deepEqual(
    afterJobsOnlyCancel.value.candidates.map((item) => item.candidateId),
    acceptedCandidates.map((item) => item.candidateId),
  )
  assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
  const afterJobsOnlyCancelTab = await acceptanceWindow.evaluate(
    (id) => window.api.projects.open(id),
    project.id,
  )
  assert.equal(afterJobsOnlyCancelTab.ok, true)
  assert.equal(afterJobsOnlyCancelTab.value.tab.layers.length, 0)
  assert.equal(afterJobsOnlyCancelTab.value.tab.dirty, false)
  assert.ok(acceptedCandidates.every((item) => readFileSync(item.assetPath).equals(output)))
  await thirdCheckbox.click()
  await expect(firstCheckbox).toBeChecked()
  await expect(secondCheckbox).toBeChecked()
  await expect(acceptanceWindow.getByRole('button', { name: 'Add 2 as Layers' })).toBeEnabled()
  await acceptanceWindow.getByRole('button', { name: 'Refresh results' }).click()
  await expect(firstCheckbox).toBeChecked()
  await expect(secondCheckbox).toBeChecked()
  await expect(thirdCheckbox).not.toBeChecked()
  await expect(
    acceptanceWindow.getByRole('button', { name: 'Preview candidate 2' }),
  ).toHaveAttribute('aria-pressed', 'true')

  await expect
    .poll(async () =>
      acceptanceWindow.evaluate(() => {
        const canvas = document.querySelector('[aria-label="Project Canvas"] .canvas-area')
        const tray = canvas?.querySelector('.results-tray')
        const addButton = tray?.querySelector('.results-toolbar .n-button--primary-type')
        if (!canvas || !tray || !addButton) return false
        const canvasBox = canvas.getBoundingClientRect()
        const trayBox = tray.getBoundingClientRect()
        const addBox = addButton.getBoundingClientRect()
        return (
          trayBox.left >= canvasBox.left &&
          trayBox.right <= canvasBox.right &&
          trayBox.bottom <= canvasBox.bottom &&
          addBox.left >= canvasBox.left &&
          addBox.right <= canvasBox.right
        )
      }),
    )
    .toBe(true)

  await acceptanceWindow.getByRole('button', { name: 'Add 2 as Layers' }).click()
  await expect(acceptanceDialog).toBeVisible()
  await expect(
    acceptanceDialog.getByText('2 unfinished generation jobs will be canceled before Add.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    acceptanceDialog.getByText('1 unchecked temporary result will be discarded.', {
      exact: false,
    }),
  ).toBeVisible()
  if (process.env.IMAGEGEN_SMOKE_ACCEPTANCE_DIALOG_SCREENSHOT) {
    await acceptanceWindow.screenshot({
      animations: 'disabled',
      path: process.env.IMAGEGEN_SMOKE_ACCEPTANCE_DIALOG_SCREENSHOT,
    })
  }

  // A newly admitted sibling while the dialog is open changes the destructive impact. The first
  // confirmation must update the counts and require a second decision, leaving every row pending.
  unfinishedJobs.push(
    await enqueuePendingFixture({
      documentId: acceptanceSource.documentId,
      stagingSessionId: acceptedCandidates[1].stagingSessionId,
    }),
  )
  const changedPendingRows = await fixtureQueueRows()
  await acceptanceDialog
    .getByRole('button', { name: 'Add 2, Cancel 2, Discard 1', exact: true })
    .click()
  await expect(
    acceptanceDialog.getByText(
      'Results or unfinished jobs changed while this dialog was open. Review the counts and confirm again.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    acceptanceDialog.getByText('3 unfinished generation jobs will be canceled before Add.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    acceptanceDialog.getByRole('button', {
      name: 'Add 2, Cancel 3, Discard 1',
      exact: true,
    }),
  ).toBeVisible()
  await expect(acceptanceDialog.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled()
  if (process.env.IMAGEGEN_SMOKE_EARLY_ADD_CHANGED_SCREENSHOT) {
    await acceptanceWindow.screenshot({
      animations: 'disabled',
      path: process.env.IMAGEGEN_SMOKE_EARLY_ADD_CHANGED_SCREENSHOT,
    })
  }
  assert.deepEqual(await fixtureQueueRows(), changedPendingRows)
  assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
  await acceptanceDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(acceptanceDialog).toBeHidden()
  await expect(acceptanceWindow.getByRole('region', { name: 'Generation Results' })).toBeVisible()
  const afterCanceledAdd = await acceptanceWindow.evaluate(
    (id) => window.api.projects.listGenerationResults(id),
    project.id,
  )
  assert.equal(afterCanceledAdd.ok, true)
  assert.equal(afterCanceledAdd.value.candidates.length, 3)
  assert.deepEqual(await fixtureQueueRows(), changedPendingRows)
  assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
  const tabAfterCanceledAdd = await acceptanceWindow.evaluate(
    (id) => window.api.projects.open(id),
    project.id,
  )
  assert.equal(tabAfterCanceledAdd.ok, true)
  assert.equal(tabAfterCanceledAdd.value.tab.layers.length, 0)
  assert.equal(tabAfterCanceledAdd.value.tab.dirty, false)
  assert.ok(acceptedCandidates.every((item) => readFileSync(item.assetPath).equals(output)))
  await acceptanceWindow.getByRole('button', { name: 'Add 2 as Layers' }).click()
  await expect(acceptanceDialog).toBeVisible()
  await acceptanceDialog
    .getByRole('button', { name: 'Add 2, Cancel 3, Discard 1', exact: true })
    .click()
  await expect(acceptanceWindow.getByRole('region', { name: 'Generation Results' })).toHaveCount(0)
  await expect(acceptanceDialog).toBeHidden()
  const acceptedTab = await acceptanceWindow.evaluate(
    (id) => window.api.projects.open(id),
    project.id,
  )
  assert.equal(acceptedTab.ok, true)
  assert.equal(acceptedTab.value.tab.layers.length, 2)
  assert.equal(acceptedTab.value.tab.dirty, true)
  assert.equal(acceptedTab.value.tab.layers.filter((layer) => layer.visible).length, 1)
  await queueNavigationScreenshot(acceptanceWindow, '15-accepted-results-after-add')
  assert.equal(Array.isArray(acceptedTab.value.tab.acceptedResults), true)
  assert.equal(acceptedTab.value.tab.acceptedResults.length, 2)
  assert.deepEqual(
    [...acceptedTab.value.tab.acceptedResults.map((result) => result.seed)].sort((a, b) => a - b),
    [71, 72],
  )
  const visibleAcceptedLayer = acceptedTab.value.tab.layers.find((layer) => layer.visible)
  assert.ok(visibleAcceptedLayer)
  const hiddenAcceptedLayer = acceptedTab.value.tab.layers.find((layer) => !layer.visible)
  assert.ok(hiddenAcceptedLayer)
  const acceptedDialog = acceptanceWindow.getByRole('dialog', {
    name: 'Accepted results',
    exact: true,
  })
  async function acceptedState() {
    return {
      canvasZoom: await acceptanceWindow.getByLabel('Canvas zoom', { exact: true }).textContent(),
      api: await acceptanceWindow.evaluate(
        async (id) =>
          await Promise.all([
            window.api.projects.open(id),
            window.api.projects.listGenerationResults(id),
            window.api.projects.getGenerationState(id),
            window.api.projects.getGenerationQueue(),
          ]),
        project.id,
      ),
      packageSha256: digest(readFileSync(packagePath)),
    }
  }
  const beforeHistorySelection = await acceptedState()
  await acceptanceWindow.getByRole('button', { name: 'Accepted results', exact: true }).click()
  await expect(acceptedDialog.getByRole('listitem')).toHaveCount(2)
  for (const entry of acceptedTab.value.tab.acceptedResults) {
    const row = acceptedDialog.locator(`[data-layer-id="${entry.layerId}"]`)
    await expect(row.getByText(`Seed ${entry.seed}`, { exact: true })).toBeVisible()
    await expect(row.locator('img')).toHaveAttribute('src', entry.imageUrl)
    await expect
      .poll(() => row.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0))
      .toBe(true)
  }
  const hiddenHistoryRow = acceptedDialog.locator(`[data-layer-id="${hiddenAcceptedLayer.id}"]`)
  await expect(hiddenHistoryRow.getByText('Hidden layer', { exact: true })).toBeVisible()
  await queueNavigationScreenshot(acceptanceWindow, '16-accepted-results-dialog')
  await hiddenHistoryRow.getByRole('button').focus()
  await hiddenHistoryRow.getByRole('button').press('Enter')
  await expect(acceptedDialog).toBeHidden()
  await expect(
    acceptanceWindow.locator('.entity-surface--selected .entity-preview img'),
  ).toHaveAttribute('src', hiddenAcceptedLayer.imageUrl)
  await expect(acceptanceWindow.locator('.entity-surface--selected')).toBeInViewport({ ratio: 0.8 })
  assert.deepEqual(await acceptedState(), beforeHistorySelection)
  await acceptanceWindow.getByRole('button', { name: 'Accepted results', exact: true }).click()
  await acceptedDialog
    .locator(`[data-layer-id="${visibleAcceptedLayer.id}"]`)
    .getByRole('button')
    .click()
  await expect(acceptedDialog).toBeHidden()
  assert.deepEqual(await acceptedState(), beforeHistorySelection)
  queueNavigationReport.checks.push({
    name: 'Accepted history shows each actual frozen seed and signed image; keyboard selection of a hidden layer preserves document, bbox, Undo, queue, staging and saved package',
    layerIds: acceptedTab.value.tab.acceptedResults.map((entry) => entry.layerId),
  })
  await expect(
    acceptanceWindow.locator('.entity-surface--selected .entity-preview img'),
  ).toHaveAttribute('src', visibleAcceptedLayer.imageUrl)
  if (process.env.IMAGEGEN_SMOKE_ACCEPTED_SCREENSHOT) {
    await acceptanceWindow.screenshot({ path: process.env.IMAGEGEN_SMOKE_ACCEPTED_SCREENSHOT })
  }
  const afterAddResults = await acceptanceWindow.evaluate(
    (id) => window.api.projects.listGenerationResults(id),
    project.id,
  )
  assert.equal(afterAddResults.ok, true)
  assert.equal(afterAddResults.value.candidates.length, 0)
  assert.equal(afterAddResults.value.lastActualSeed, 73)
  assert.deepEqual(afterAddResults.value.unfinishedSiblingJobIds, [])
  const afterAddRows = await fixtureQueueRows()
  assert.equal(afterAddRows.length, changedPendingRows.length)
  assert.ok(
    afterAddRows
      .filter((row) => unfinishedJobs.some((job) => job.id === row.id))
      .every((row) => row.status === 'canceled' && row.error_code === 'USER_CANCELED'),
  )
  assert.deepEqual(
    afterAddRows.filter((row) => neighborJobs.some((job) => job.id === row.id)),
    changedPendingRows.filter((row) => neighborJobs.some((job) => job.id === row.id)),
  )
  assert.deepEqual(readFileSync(neighborPackagePath), packageBeforeAcceptance)
  assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)

  // Acceptance is one document mutation, regardless of the number of candidates.
  // Rewinding it must leave staging empty; Redo must restore the real accepted assets
  // from project history before the crash-recovery and portable Save checks below.
  const acceptedLayerIds = acceptedTab.value.tab.layers.map((layer) => layer.id)
  const historyToolbar = acceptanceWindow.getByRole('toolbar', { name: 'Project history' })
  await expect(historyToolbar.getByRole('button', { name: 'Undo' })).toBeEnabled()
  await historyToolbar.getByRole('button', { name: 'Undo' }).click()
  await expect
    .poll(async () => {
      const open = await acceptanceWindow.evaluate((id) => window.api.projects.open(id), project.id)
      return open.ok ? open.value.tab.layers.length : null
    })
    .toBe(0)
  await expect(historyToolbar.getByRole('button', { name: 'Redo' })).toBeEnabled()
  const afterUndoResults = await acceptanceWindow.evaluate(
    (id) => window.api.projects.listGenerationResults(id),
    project.id,
  )
  assert.equal(afterUndoResults.ok, true)
  assert.equal(afterUndoResults.value.candidates.length, 0)
  const undoneAcceptedTab = await acceptanceWindow.evaluate(
    (id) => window.api.projects.open(id),
    project.id,
  )
  assert.equal(undoneAcceptedTab.ok, true)
  assert.deepEqual(undoneAcceptedTab.value.tab.acceptedResults, [])
  await acceptanceWindow.getByRole('button', { name: 'Accepted results', exact: true }).click()
  await expect(acceptedDialog.getByText('No accepted results yet', { exact: true })).toBeVisible()
  await expect(acceptedDialog.getByRole('listitem')).toHaveCount(0)
  await queueNavigationScreenshot(acceptanceWindow, '17-accepted-results-empty-after-undo')
  await acceptedDialog.getByRole('button', { name: 'Close', exact: true }).click()
  assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
  await historyToolbar.getByRole('button', { name: 'Redo' }).click()
  await expect
    .poll(async () => {
      const open = await acceptanceWindow.evaluate((id) => window.api.projects.open(id), project.id)
      return open.ok ? open.value.tab.layers.map((layer) => layer.id) : null
    })
    .toEqual(acceptedLayerIds)
  const redoneTab = await acceptanceWindow.evaluate(
    (id) => window.api.projects.open(id),
    project.id,
  )
  assert.equal(redoneTab.ok, true)
  assert.deepEqual(
    redoneTab.value.tab.acceptedResults.map((entry) => entry.layerId),
    acceptedTab.value.tab.acceptedResults.map((entry) => entry.layerId),
  )
  assert.deepEqual(
    redoneTab.value.tab.acceptedResults.map((entry) => entry.seed),
    acceptedTab.value.tab.acceptedResults.map((entry) => entry.seed),
  )
  const redoneVisibleLayer = redoneTab.value.tab.layers.find((layer) => layer.visible)
  assert.ok(redoneVisibleLayer)
  await expect(
    acceptanceWindow.locator('.entity-surface--selected .entity-preview img'),
  ).toHaveAttribute('src', redoneVisibleLayer.imageUrl)
  // The igs-layer scheme deliberately does not expose Fetch. Decode the same URL that
  // the selected-layer preview renders and inspect its pixels through the browser canvas.
  const redoneImage = await acceptanceWindow.evaluate(async (url) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('The restored layer could not be rendered.')
    context.drawImage(image, 0, 0)
    return {
      height: image.naturalHeight,
      pixel: [...context.getImageData(32, 32, 1, 1).data],
      width: image.naturalWidth,
    }
  }, redoneVisibleLayer.imageUrl)
  assert.deepEqual(redoneImage, { height: 64, pixel: [37, 94, 181, 255], width: 64 })
  assert.equal(
    (
      await acceptanceWindow.evaluate(
        (id) => window.api.projects.listGenerationResults(id),
        project.id,
      )
    ).value.candidates.length,
    0,
  )
  assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)

  // Clearing Project history only drops the in-memory undo/redo stacks. Accepted
  // layers remain editable and recoverable; no package write or staging resurrection occurs.
  await acceptanceWindow.getByRole('button', { name: 'Clear Project History' }).click()
  await expect(
    acceptanceWindow.getByText(
      'Clear Undo and Redo history for this open Project? The document will not change.',
      { exact: true },
    ),
  ).toBeVisible()
  await acceptanceWindow.getByRole('button', { name: 'Clear history', exact: true }).click()
  await expect(historyToolbar.getByRole('button', { name: 'Undo' })).toBeDisabled()
  await expect(historyToolbar.getByRole('button', { name: 'Redo' })).toBeDisabled()
  const afterClearTab = await acceptanceWindow.evaluate(
    (id) => window.api.projects.open(id),
    project.id,
  )
  assert.equal(afterClearTab.ok, true)
  assert.deepEqual(
    afterClearTab.value.tab.layers.map((layer) => layer.id),
    acceptedLayerIds,
  )
  assert.equal(afterClearTab.value.tab.dirty, true)
  assert.deepEqual(afterClearTab.value.tab.acceptedResults, redoneTab.value.tab.acceptedResults)
  queueNavigationReport.checks.push({
    name: 'Grouped Undo removes accepted history, Redo restores its identities and recorded seeds, and clearing Undo history preserves accepted entries',
  })
  assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)

  // Acceptance must reach the recovery shadow before staging cleanup. Crash before Save, recover
  // the document, then Save and reopen the portable package.
  const beforeRecoveryProcess = application.process()
  const beforeRecoveryExited = new Promise((resolve) => beforeRecoveryProcess.once('exit', resolve))
  assert.equal(beforeRecoveryProcess.kill('SIGKILL'), true)
  await Promise.race([
    beforeRecoveryExited,
    delay(10_000).then(() => {
      throw new Error('The acceptance app did not exit after the simulated crash.')
    }),
  ])
  await liveFixtureDatabase.close()
  liveFixtureDatabase = undefined
  // Inspect durable Main state after the actual renderer -> IPC Add, without opening another
  // database connection while Electron is alive. No pending intent remains; each captured
  // session, including the unchecked result, has a tombstone before portable Save.
  const completedAcceptanceDatabase = openAppDatabase(appDataRoot, migrations)
  try {
    assert.deepEqual(
      await completedAcceptanceDatabase.db
        .selectFrom('generation_acceptance_journal')
        .selectAll()
        .execute(),
      [],
    )
    const discarded = await completedAcceptanceDatabase.db
      .selectFrom('generation_staging_discarded_session')
      .select('staging_session_id')
      .where('local_project_key', '=', project.id)
      .execute()
    const discardedIds = new Set(discarded.map((row) => row.staging_session_id))
    assert.ok(acceptedCandidates.every((candidate) => discardedIds.has(candidate.stagingSessionId)))
  } finally {
    await completedAcceptanceDatabase.close()
  }
  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  await isolateNativeSmokeWindow(application)
  trackMainErrors(application)
  const recoveryWindow = await application.firstWindow()
  await trackPageErrors(recoveryWindow)
  await recoveryWindow.getByRole('tab', { name: 'Home' }).waitFor()
  await recoveryWindow.getByRole('button', { name: `Open ${projectTitle}` }).click()
  const recoveryDialog = recoveryWindow.getByRole('dialog', { name: 'Recovery available' })
  await recoveryDialog.waitFor()
  assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)
  await recoveryDialog.getByRole('button', { name: 'Recover', exact: true }).click()
  await recoveryWindow.getByRole('tab', { name: projectTitle }).waitFor()
  const recoveredTab = await recoveryWindow.evaluate(
    (id) => window.api.projects.open(id),
    project.id,
  )
  assert.equal(recoveredTab.ok, true)
  assert.equal(recoveredTab.value.tab.layers.length, 2)
  assert.equal(recoveredTab.value.tab.dirty, true)
  assert.equal(recoveredTab.value.tab.layers.filter((layer) => layer.visible).length, 1)
  assert.deepEqual(
    recoveredTab.value.tab.acceptedResults.map((entry) => entry.layerId),
    acceptedTab.value.tab.acceptedResults.map((entry) => entry.layerId),
  )
  assert.deepEqual(
    recoveredTab.value.tab.acceptedResults.map((entry) => entry.seed),
    acceptedTab.value.tab.acceptedResults.map((entry) => entry.seed),
  )
  await recoveryWindow.getByRole('button', { name: 'Save Project' }).click()
  await expect
    .poll(async () => {
      try {
        return (await readIgsPackage(packagePath)).project.layers.length
      } catch (error) {
        // This read may span the Save writer's atomic rename. Keep the real loader guard and
        // retry only that transient identity change; all corruption/storage errors still fail.
        if (error instanceof IgsPackageError && error.code === 'PACKAGE_CHANGED') {
          return null
        }
        throw error
      }
    })
    .toBe(2)
  const savedAcceptance = (await readIgsPackage(packagePath)).project
  assert.equal(savedAcceptance.lastActualSeedSnapshot, 73)
  assert.deepEqual(savedAcceptance.primaryBbox, acceptanceSource.primaryBbox)
  assert.deepEqual(
    savedAcceptance.layers.map(
      (layer) => layer.generationProvenance?.executionResultContext.candidateId,
    ),
    acceptedCandidates.slice(0, 2).map((item) => item.candidateId),
  )
  assert.deepEqual(
    savedAcceptance.layers.map(
      (layer) => layer.generationProvenance?.generationConfiguration.sampling.actualSeed,
    ),
    [71, 72],
  )
  assert.equal(savedAcceptance.layers.filter((layer) => layer.visible).length, 1)
  assert.equal(
    savedAcceptance.layers.find((layer) => layer.visible)?.generationProvenance
      ?.executionResultContext.candidateId,
    acceptedCandidates[1].candidateId,
  )
  await recoveryWindow.getByRole('button', { name: `Close ${projectTitle}` }).click()
  await expect(recoveryWindow.getByRole('tab', { name: projectTitle })).toHaveCount(0)
  await recoveryWindow.getByRole('button', { name: `Open ${projectTitle}` }).click()
  await recoveryWindow.getByRole('tab', { name: projectTitle }).waitFor()
  const reopened = await recoveryWindow.evaluate((id) => window.api.projects.open(id), project.id)
  assert.equal(reopened.ok, true)
  assert.equal(reopened.value.tab.layers.length, 2)
  assert.deepEqual(
    reopened.value.tab.acceptedResults.map((entry) => entry.layerId),
    acceptedTab.value.tab.acceptedResults.map((entry) => entry.layerId),
  )
  assert.deepEqual(
    reopened.value.tab.acceptedResults.map((entry) => entry.seed),
    acceptedTab.value.tab.acceptedResults.map((entry) => entry.seed),
  )
  await recoveryWindow.getByRole('button', { name: 'Accepted results', exact: true }).click()
  await expect(
    recoveryWindow
      .getByRole('dialog', { name: 'Accepted results', exact: true })
      .getByRole('listitem'),
  ).toHaveCount(2)
  await queueNavigationScreenshot(recoveryWindow, '18-accepted-results-saved-reopen')
  await recoveryWindow
    .getByRole('dialog', { name: 'Accepted results', exact: true })
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  queueNavigationReport.checks.push({
    name: 'Dirty-shadow Recover and explicit Save/reopen reconstruct accepted history from actual provenance independently of staging and Queue history',
  })
  console.log(
    'Desktop acceptance smoke passed: confirmed early Add, exact sibling cancellation, neighbor preservation, grouped Undo/Redo, shadow recovery and portable Save/reopen.',
  )
  // A real saved package exercises scroll layout and legal current-pixel changes. History owns
  // the original generated dimensions; the current layer asset and its signed preview are 16x16.
  const layoutTitle = 'Accepted history layout smoke'
  const layoutPath = path.join(path.dirname(packagePath), `${layoutTitle}.igs`)
  const layoutPng = srgbPng(16, 16, true)
  const generatedLayer = savedAcceptance.layers[0]
  const layoutLayers = Array.from({ length: 32 }, (_, index) => {
    const layerId = randomUUID()
    return {
      ...structuredClone(generatedLayer),
      asset: {
        bytes: layoutPng.length,
        height: 16,
        path: `assets/layers/${layerId}.png`,
        sha256: digest(layoutPng),
        width: 16,
      },
      generationProvenance: {
        ...structuredClone(generatedLayer.generationProvenance),
        executionResultContext: {
          ...generatedLayer.generationProvenance.executionResultContext,
          acceptedAt: new Date(Date.UTC(2026, 9, 1, 12, 0, index)).toISOString(),
          candidateId: randomUUID(),
          queueItemId: randomUUID(),
        },
        generationConfiguration: {
          ...structuredClone(generatedLayer.generationProvenance.generationConfiguration),
          model: {
            ...generatedLayer.generationProvenance.generationConfiguration.model,
            displayName: `Exact copied checkpoint ${'with a long descriptive name '.repeat(5)}`,
          },
          sampling: {
            ...generatedLayer.generationProvenance.generationConfiguration.sampling,
            actualSeed: index === 0 ? 0 : 200 + index,
          },
        },
      },
      id: layerId,
      name: `Result ${index + 1} ${'with a long layer name '.repeat(8)}`,
      visible: index % 2 === 0,
    }
  })
  await saveIgsPackage(layoutPath, {
    assets: Object.fromEntries(
      layoutLayers.map((layer) => [layer.asset.path, { bytes: layoutPng }]),
    ),
    preview: {
      merged: readFileSync('dist/main/placeholders/empty.png'),
      rect: savedAcceptance.primaryBbox,
      status: 'unavailable',
      thumbnail: readFileSync('dist/main/placeholders/empty.webp'),
    },
    project: {
      ...createEmptyProjectDocumentV1({ title: layoutTitle }),
      generationDraft: savedAcceptance.generationDraft,
      layers: layoutLayers,
    },
  })
  const layoutPackageHash = digest(readFileSync(layoutPath))
  await recoveryWindow.getByRole('tab', { name: 'Home', exact: true }).click()
  await recoveryWindow.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await recoveryWindow.getByRole('button', { name: `Open ${layoutTitle}`, exact: true }).click()
  // Wait for UI Open/reconciliation to finish before issuing another real projects:open.
  await expect(recoveryWindow.getByRole('tab', { name: layoutTitle, exact: true })).toBeVisible()
  const layoutProjects = await recoveryWindow.evaluate(() => window.api.projects.list())
  assert.equal(layoutProjects.ok, true)
  const layoutProject = layoutProjects.value.find((entry) => entry.title === layoutTitle)
  assert.ok(layoutProject)
  const layoutBefore = await recoveryWindow.evaluate(
    (id) => window.api.projects.open(id),
    layoutProject.id,
  )
  assert.equal(layoutBefore.ok, true)
  assert.equal(layoutBefore.value.tab.storageWarning, undefined)
  assert.equal(layoutBefore.value.tab.acceptedResults.length, 32)
  const layoutModal = recoveryWindow.getByRole('dialog', { name: 'Accepted results', exact: true })
  const initialGeometry = await application.evaluate(({ BrowserWindow }) => ({
    bounds: BrowserWindow.getAllWindows()[0].getBounds(),
    contentSize: BrowserWindow.getAllWindows()[0].getContentSize(),
  }))
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1380, 900),
  )
  await recoveryWindow.getByRole('button', { name: 'Accepted results', exact: true }).click()
  await expect(layoutModal.getByRole('listitem')).toHaveCount(32)
  await queueNavigationScreenshot(recoveryWindow, '19-accepted-results-long-normal')
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(900, 620),
  )
  await queueNavigationScreenshot(recoveryWindow, '20-accepted-results-long-compact')
  const oldestLayer = layoutLayers[0]
  const oldestHistoryRow = layoutModal.locator(`[data-layer-id="${oldestLayer.id}"]`)
  await oldestHistoryRow.getByRole('button').scrollIntoViewIfNeeded()
  await expect(oldestHistoryRow.getByText('Seed 0', { exact: true })).toBeVisible()
  await expect(oldestHistoryRow.getByText('Generated size: 64 × 64', { exact: true })).toBeVisible()
  await expect
    .poll(() =>
      oldestHistoryRow.locator('img').evaluate((img) => img.complete && img.naturalWidth === 16),
    )
    .toBe(true)
  await expect(layoutModal.getByRole('button', { name: 'Close', exact: true })).toBeVisible()
  await queueNavigationScreenshot(recoveryWindow, '21-accepted-results-long-bottom-seed-zero')
  await oldestHistoryRow.getByRole('button').focus()
  await oldestHistoryRow.getByRole('button').press('Space')
  await expect(layoutModal).toBeHidden()
  const oldestLayerView = layoutBefore.value.tab.layers.find((layer) => layer.id === oldestLayer.id)
  assert.ok(oldestLayerView)
  await expect(
    recoveryWindow.locator('.entity-surface--selected .entity-preview img'),
  ).toHaveAttribute('src', oldestLayerView.imageUrl)
  await expect(recoveryWindow.locator('.entity-surface--selected')).toBeInViewport({ ratio: 0.8 })
  // The newest history entry belongs to a hidden layer at the bottom of the Layers stack.
  // Navigation must reveal that selected row without revealing its pixels on Canvas.
  const distantHiddenLayer = layoutLayers[31]
  await recoveryWindow.getByRole('button', { name: 'Accepted results', exact: true }).click()
  const distantHistoryRow = layoutModal.locator(`[data-layer-id="${distantHiddenLayer.id}"]`)
  await expect(distantHistoryRow.getByText('Hidden layer', { exact: true })).toBeVisible()
  await distantHistoryRow.getByRole('button').click()
  await expect(layoutModal).toBeHidden()
  const distantLayerView = layoutBefore.value.tab.layers.find(
    (layer) => layer.id === distantHiddenLayer.id,
  )
  assert.ok(distantLayerView)
  await expect(
    recoveryWindow.locator('.entity-surface--selected .entity-preview img'),
  ).toHaveAttribute('src', distantLayerView.imageUrl)
  await expect(recoveryWindow.locator('.entity-surface--selected')).toBeInViewport({ ratio: 0.8 })
  await queueNavigationScreenshot(recoveryWindow, '22-accepted-result-hidden-layer-revealed')
  const layoutAfter = await recoveryWindow.evaluate(
    (id) => window.api.projects.open(id),
    layoutProject.id,
  )
  assert.deepEqual(layoutAfter, layoutBefore)
  assert.equal(digest(readFileSync(layoutPath)), layoutPackageHash)
  await application.evaluate(({ BrowserWindow }, geometry) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.setBounds(geometry.bounds)
    window.setContentSize(...geometry.contentSize)
  }, initialGeometry)
  queueNavigationReport.checks.push({
    name: 'A real saved 32-result Project supports normal/compact scrolling, long names, seed zero and keyboard selection; current 16x16 assets preserve original generated size 64x64',
  })

  // Supply malformed main responses through real IPC; the subject is the built preload validator.
  // No Project/storage owner is replaced or modified, and this is the final API scenario.
  const rawOpenResponse = layoutAfter
  const malformedResponses = [
    [
      'missing history',
      (() => {
        const response = structuredClone(rawOpenResponse)
        delete response.value.tab.acceptedResults
        return response
      })(),
    ],
    [
      'duplicate accepted identity',
      (() => {
        const response = structuredClone(rawOpenResponse)
        response.value.tab.acceptedResults.push(response.value.tab.acceptedResults[0])
        return response
      })(),
    ],
    [
      'foreign owning layer',
      (() => {
        const response = structuredClone(rawOpenResponse)
        response.value.tab.acceptedResults[0].layerId = randomUUID()
        return response
      })(),
    ],
    [
      'wrong signed owning image',
      (() => {
        const response = structuredClone(rawOpenResponse)
        response.value.tab.acceptedResults[0].imageUrl =
          response.value.tab.acceptedResults[1].imageUrl
        return response
      })(),
    ],
    [
      'invalid actual seed',
      (() => {
        const response = structuredClone(rawOpenResponse)
        response.value.tab.acceptedResults[0].seed = -1
        return response
      })(),
    ],
  ]
  for (const [name, response] of [
    ...malformedResponses,
    ['valid original output dimensions', rawOpenResponse],
  ]) {
    await application.evaluate(({ ipcMain }, payload) => {
      ipcMain.removeHandler('projects:open')
      ipcMain.handle('projects:open', async () => payload)
    }, response)
    const observed = await recoveryWindow.evaluate(
      (id) => window.api.projects.open(id),
      layoutProject.id,
    )
    if (response === rawOpenResponse) {
      assert.deepEqual(observed, rawOpenResponse)
    } else {
      assert.equal(observed.ok, false, name)
      assert.equal(observed.error.code, 'IPC_INVALID_RESPONSE', name)
    }
  }
  queueNavigationReport.checks.push({
    name: 'Actual preload rejects missing/duplicate/foreign accepted identity, wrong signed image and invalid seed; legal original output versus current asset dimensions remain accepted',
  })
  for (const [file, sha256] of Object.entries(testedBuild)) {
    assert.equal(
      digest(readFileSync(file)),
      sha256,
      `Built artifact changed during Results run: ${file}`,
    )
  }
  assert.equal(digest(readFileSync('scripts/smoke-generation-results.mjs')), testedScript)
  assert.equal(digest(readFileSync('scripts/native-smoke-window.mjs')), testedWindowIsolationHelper)
  assert.deepEqual(pageErrors, [])
  queueNavigationReport.outcome = 'passed'
} catch (error) {
  queueNavigationReport.outcome = 'failed'
  queueNavigationReport.error = { message: error.message, stack: error.stack }
  if (application) {
    const failureWindow = await application.firstWindow().catch(() => null)
    if (failureWindow && !failureWindow.isClosed()) {
      await queueNavigationScreenshot(failureWindow, 'failure').catch(() => undefined)
      if (queueNavigationArtifacts) {
        const inputs = await failureWindow
          .evaluate(() => window.igsSmokeInputEvents)
          .catch(() => null)
        writeFileSync(
          path.join(queueNavigationArtifacts, 'failure-input-events.json'),
          `${JSON.stringify(inputs, null, 2)}\n`,
        )
      }
    }
  }
  throw error
} finally {
  console.log(`Native Results page errors: ${JSON.stringify(pageErrors)}`)
  if (queueNavigationArtifacts) {
    writeFileSync(
      path.join(queueNavigationArtifacts, 'native-results-navigation-report.json'),
      `${JSON.stringify({ ...queueNavigationReport, buildSha256: testedBuild, scriptSha256: testedScript, windowIsolationHelperSha256: testedWindowIsolationHelper }, null, 2)}\n`,
    )
  }
  application?.process().kill('SIGKILL')
  await liveFixtureDatabase?.close()
  rmSync(dataRoot, { force: true, recursive: true })
}
