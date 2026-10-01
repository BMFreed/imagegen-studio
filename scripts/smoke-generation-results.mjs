import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
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

import { openAppDatabase } from '../src/main/db/database.ts'
import { GenerationQueueRepository } from '../src/main/projects/generation-queue.ts'
import { GenerationStagingRepository } from '../src/main/projects/generation-staging.ts'
import { IgsPackageError, readIgsPackage } from '../src/main/projects/igs-package.ts'
import { withIllustriousTxt2ImgRequest } from '../src/main/projects/illustrious-txt2img-job.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'

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
async function queueNavigationScreenshot(window, name) {
  if (!queueNavigationArtifacts) return
  const file = path.join(queueNavigationArtifacts, `${name}.png`)
  await window.screenshot({ animations: 'disabled', path: file })
  queueNavigationReport.screenshots.push(file)
}
function trackPageErrors(window) {
  window.on('pageerror', (error) => pageErrors.push(error.message))
}
function trackMainErrors(application) {
  application.process().stderr?.on('data', (chunk) => process.stderr.write(chunk))
}

let application
let liveFixtureDatabase
try {
  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  trackMainErrors(application)
  const initialWindow = await application.firstWindow()
  trackPageErrors(initialWindow)
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
  trackMainErrors(application)
  const window = await application.firstWindow()
  trackPageErrors(window)
  await window.getByRole('tab', { name: 'Home' }).waitFor()
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
  queueNavigationReport.checks.push({
    name: 'Closed Project completed job exposes Open Project without View result or private image',
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
  const recovered = snapshot.value.candidates[0]
  assert.equal(recovered.candidateId, candidate.candidateId)
  assert.deepEqual(recovered.bbox, bbox)
  assert.equal(recovered.actualSeed, 42)
  assert.match(recovered.imageUrl, /^igs-staging:\/\/asset\//)
  assert.equal('assetPath' in recovered || 'frozenPayloadJson' in recovered, false)
  await expect(window.getByRole('region', { name: 'Project Canvas' })).toBeVisible()
  await expect(window.getByRole('toolbar', { name: 'Temporary generation results' })).toBeVisible()
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
  const acceptanceDatabase = openAppDatabase(appDataRoot, migrations)
  try {
    const queue = new GenerationQueueRepository(acceptanceDatabase.db, appDataRoot)
    const staging = new GenerationStagingRepository(acceptanceDatabase.db, appDataRoot)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    for (const seed of [71, 72, 73]) {
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
            projectPath: packagePath,
            request,
            stagingSessionId: randomUUID(),
          })
          const claim = await queue.claimNextPending()
          assert.equal(claim?.item.id, queued.id)
          writeFileSync(request.job.output.pngPath, output)
          acceptedCandidates.push(
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
  } finally {
    await acceptanceDatabase.close()
  }
  assert.equal(acceptedCandidates.length, 3)
  assert.notEqual(acceptedCandidates[0].stagingSessionId, acceptedCandidates[1].stagingSessionId)
  assert.deepEqual(readFileSync(packagePath), packageBeforeAcceptance)

  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  trackMainErrors(application)
  const acceptanceWindow = await application.firstWindow()
  trackPageErrors(acceptanceWindow)
  await acceptanceWindow.getByRole('tab', { name: 'Home' }).waitFor()
  await acceptanceWindow.getByRole('button', { name: `Open ${projectTitle}` }).click()
  await acceptanceWindow.getByRole('tab', { name: projectTitle }).waitFor()
  const acceptanceSnapshot = await acceptanceWindow.evaluate(
    (id) => window.api.projects.listGenerationResults(id),
    project.id,
  )
  assert.equal(acceptanceSnapshot.ok, true)
  assert.deepEqual(
    acceptanceSnapshot.value.candidates.map((item) => item.candidateId),
    acceptedCandidates.map((item) => item.candidateId),
  )
  assert.deepEqual(acceptanceSnapshot.value.unfinishedSiblingJobIds, [])

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
    acceptanceWindow.getByRole('button', { name: 'Preview candidate 2', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
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
      selected: await Promise.all(navigationCheckboxes.map((checkbox) => checkbox.isChecked())),
      undoEnabled: await acceptanceWindow
        .getByRole('button', { name: 'Undo', exact: true })
        .isEnabled(),
    }
  }
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(900, 620)
  })
  const beforeQueueNavigation = await navigationState()
  assert.deepEqual(beforeQueueNavigation.selected, [false, false, true])
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
    for (const other of [1, 2, 3]) {
      await expect(
        acceptanceWindow.getByRole('button', { name: `Preview candidate ${other}`, exact: true }),
      ).toHaveAttribute('aria-pressed', String(other === index + 1))
    }
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
    BrowserWindow.getAllWindows()[0].setContentSize(1380, 900)
  })
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
  const visibleAcceptedLayer = acceptedTab.value.tab.layers.find((layer) => layer.visible)
  assert.ok(visibleAcceptedLayer)
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
  trackMainErrors(application)
  const recoveryWindow = await application.firstWindow()
  trackPageErrors(recoveryWindow)
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
  console.log(
    'Desktop acceptance smoke passed: confirmed early Add, exact sibling cancellation, neighbor preservation, grouped Undo/Redo, shadow recovery and portable Save/reopen.',
  )
  for (const [file, sha256] of Object.entries(testedBuild)) {
    assert.equal(
      digest(readFileSync(file)),
      sha256,
      `Built artifact changed during Results run: ${file}`,
    )
  }
  assert.equal(digest(readFileSync('scripts/smoke-generation-results.mjs')), testedScript)
  assert.deepEqual(pageErrors, [])
  queueNavigationReport.outcome = 'passed'
} catch (error) {
  queueNavigationReport.outcome = 'failed'
  queueNavigationReport.error = { message: error.message, stack: error.stack }
  if (application) {
    const failureWindow = await application.firstWindow().catch(() => null)
    if (failureWindow && !failureWindow.isClosed()) {
      await queueNavigationScreenshot(failureWindow, 'failure').catch(() => undefined)
    }
  }
  throw error
} finally {
  console.log(`Native Results page errors: ${JSON.stringify(pageErrors)}`)
  if (queueNavigationArtifacts) {
    writeFileSync(
      path.join(queueNavigationArtifacts, 'native-results-navigation-report.json'),
      `${JSON.stringify({ ...queueNavigationReport, buildSha256: testedBuild, scriptSha256: testedScript }, null, 2)}\n`,
    )
  }
  application?.process().kill('SIGKILL')
  await liveFixtureDatabase?.close()
  rmSync(dataRoot, { force: true, recursive: true })
}
