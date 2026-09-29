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
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
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
  await window.getByRole('button', { name: 'Result 1 actions' }).click()
  await window.getByRole('menuitem', { name: 'Save Candidate Image' }).click()
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

let application
try {
  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  const initialWindow = await application.firstWindow()
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
  const window = await application.firstWindow()
  await window.getByRole('tab', { name: 'Home' }).waitFor()
  await window.getByRole('button', { name: `Open ${projectTitle}` }).click()
  await window.getByRole('tab', { name: projectTitle }).waitFor()
  const snapshot = await window.evaluate((id) => window.api.projects.listGenerationResults(id), project.id)
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.value.recoveryUnavailable, false)
  assert.equal(snapshot.value.candidates.length, 1)
  const recovered = snapshot.value.candidates[0]
  assert.equal(recovered.candidateId, candidate.candidateId)
  assert.deepEqual(recovered.bbox, bbox)
  assert.equal(recovered.actualSeed, 42)
  assert.match(recovered.imageUrl, /^igs-staging:\/\/asset\//)
  assert.equal('assetPath' in recovered || 'frozenPayloadJson' in recovered, false)
  await expect(window.getByRole('region', { name: 'Project Canvas' })).toBeVisible()
  await expect(window.getByRole('toolbar', { name: 'Temporary generation results' })).toBeVisible()
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
  await expect.poll(async () => {
    const bounds = await renderedBlueBounds(window)
    return bounds ? bounds.right - bounds.left : 0
  }).toBeGreaterThan(initialPreviewBounds.right - initialPreviewBounds.left + 1)
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
  await expect.poll(async () => {
    const open = await window.evaluate((id) => window.api.projects.open(id), project.id)
    return open.ok ? open.value.tab.primaryBbox.x : null
  }).toBe(movedBbox.x)
  await expect.poll(async () => await renderedBlueBounds(window)).toEqual(frozenPreviewBounds)
  await window.getByRole('button', { name: 'Save Project' }).click()
  await expect.poll(async () => (await readIgsPackage(packagePath)).project.primaryBbox.x).toBe(movedBbox.x)
  const savedProject = (await readIgsPackage(packagePath)).project
  assert.deepEqual(savedProject.primaryBbox, movedBbox)
  assert.equal(savedProject.layers.length, 0)
  const afterSave = await window.evaluate((id) => window.api.projects.listGenerationResults(id), project.id)
  assert.equal(afterSave.ok, true)
  assert.equal(afterSave.value.candidates.length, 1)

  // The actual Results menu calls renderer → preload → main. Replace only the native Save picker;
  // candidate verification, path handling and output publication stay in the production code.
  const packageBeforeExport = readFileSync(packagePath)
  const candidateBeforeExport = readFileSync(candidate.assetPath)
  const stagingManifestPath = path.join(path.dirname(path.dirname(candidate.assetPath)), 'manifest.json')
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
  await expect.poll(() => canvas.locator('.konva-stage').boundingBox()).toEqual(canvasBoundsBeforeExport)
  await expect.poll(() => existsSync(exportedPath)).toBe(true)
  assert.deepEqual(readFileSync(exportedPath), output)
  assert.deepEqual(readFileSync(packagePath), packageBeforeExport)
  assert.deepEqual(readFileSync(candidate.assetPath), candidateBeforeExport)
  assert.deepEqual(readFileSync(stagingManifestPath), manifestBeforeExport)
  const afterExport = await window.evaluate((id) => window.api.projects.listGenerationResults(id), project.id)
  assert.equal(afterExport.ok, true)
  assert.deepEqual(afterExport.value.candidates.map((item) => item.candidateId), [candidate.candidateId])
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
  await expect.poll(() => canvas.locator('.konva-stage').boundingBox()).toEqual(canvasBoundsBeforeExport)
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
  await expect.poll(() => canvas.locator('.konva-stage').boundingBox()).toEqual(canvasBoundsBeforeExport)
  assert.deepEqual(readFileSync(existingPath), existingBytes)
  assert.deepEqual(readdirSync(exportDirectory).sort(), [path.basename(existingPath), path.basename(exportedPath)].sort())
  assert.deepEqual(readFileSync(packagePath), packageBeforeExport)
  assert.deepEqual(readFileSync(candidate.assetPath), candidateBeforeExport)
  assert.deepEqual(readFileSync(stagingManifestPath), manifestBeforeExport)
  const afterFailedExport = await window.evaluate(
    (id) => window.api.projects.listGenerationResults(id),
    project.id,
  )
  assert.equal(afterFailedExport.ok, true)
  assert.deepEqual(afterFailedExport.value.candidates.map((item) => item.candidateId), [candidate.candidateId])
  const afterFailedExportTab = await window.evaluate((id) => window.api.projects.open(id), project.id)
  assert.equal(afterFailedExportTab.ok, true)
  assert.equal(afterFailedExportTab.value.tab.layers.length, 0)
  assert.equal(afterFailedExportTab.value.tab.dirty, false)

  await window.getByRole('button', { name: `Close ${projectTitle}` }).click()
  const closeDialog = window.getByRole('dialog', { name: 'Close Project' })
  await expect(closeDialog.getByText('Unaccepted generation results', { exact: false })).toBeVisible()
  await closeDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(window.getByRole('toolbar', { name: 'Temporary generation results' })).toBeVisible()
  const afterCancel = await window.evaluate((id) => window.api.projects.listGenerationResults(id), project.id)
  assert.equal(afterCancel.ok, true)
  assert.deepEqual(afterCancel.value.candidates.map((item) => item.candidateId), [candidate.candidateId])
  await window.evaluate(async (url) => await (await fetch(url)).arrayBuffer(), recovered.imageUrl)
  await window.getByRole('button', { name: `Close ${projectTitle}` }).click()
  await closeDialog.getByRole('button', { name: 'Discard Candidates and Close' }).click()
  await expect(window.getByRole('tab', { name: projectTitle })).toHaveCount(0)
  const revokedStatus = await window.evaluate(async (url) => (await fetch(url)).status, recovered.imageUrl)
  assert.equal(revokedStatus, 404)
  await window.getByRole('button', { name: `Open ${projectTitle}` }).click()
  await window.getByRole('tab', { name: projectTitle }).waitFor()
  const afterClose = await window.evaluate((id) => window.api.projects.listGenerationResults(id), project.id)
  assert.equal(afterClose.ok, true)
  assert.equal(afterClose.value.candidates.length, 0)
  assert.equal(existsSync(candidate.assetPath), false)
  console.log(
    'Desktop Results smoke passed: verified recovery, preview, exact image export, Save, Cancel and discard.',
  )
} finally {
  application?.process().kill('SIGKILL')
  rmSync(dataRoot, { force: true, recursive: true })
}
