import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { crc32, deflateSync } from 'node:zlib'
import { _electron as electron } from '@playwright/test'
import electronBinary from 'electron'
import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage, saveIgsPackage } from '../src/main/projects/igs-package.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'

const untaggedRasterPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const srgbIcc = readFileSync('worker-python/src/imagegen_worker/srgb.icc')
assert.equal(createHash('sha256').update(srgbIcc).digest('hex'), IGS_SRGB_ICC_SHA256)
const iccPayload = Buffer.concat([Buffer.from('profile\0\0', 'ascii'), deflateSync(srgbIcc)])
const iccChunk = Buffer.alloc(12 + iccPayload.length)
iccChunk.writeUInt32BE(iccPayload.length, 0)
iccChunk.write('iCCP', 4, 'ascii')
iccPayload.copy(iccChunk, 8)
iccChunk.writeUInt32BE(crc32(iccChunk.subarray(4, -4)), iccChunk.length - 4)
const rasterPng = Buffer.concat([
  untaggedRasterPng.subarray(0, 33),
  iccChunk,
  untaggedRasterPng.subarray(33),
])
for (const kind of ['empty', 'unavailable']) {
  const root = path.join('dist', 'main', 'placeholders', kind)
  assert.equal(readFileSync(`${root}.png`).subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(readFileSync(`${root}.webp`).toString('ascii', 8, 12), 'WEBP')
}

const dataRoot = mkdtempSync(path.join(os.tmpdir(), 'igs-electron-smoke-'))
const environment = {
  ...process.env,
  IMAGEGEN_DEV_SERVER_URL: 'http://127.0.0.1:5174',
  // Permit the source-checkout derivatives worker in this disposable Electron process only.
  IMAGEGEN_TEST_IMAGE_WORKER: '1',
  NODE_ENV: 'test',
  XDG_CONFIG_HOME: path.join(dataRoot, 'config'),
  XDG_DATA_HOME: path.join(dataRoot, 'data'),
}
delete environment.ELECTRON_RUN_AS_NODE

async function seedInstalledCheckpointVersions() {
  const appDataRoot = path.join(dataRoot, 'data', 'imagegen-studio')
  const modelRoot = path.join(appDataRoot, 'models')
  mkdirSync(modelRoot, { recursive: true })
  const database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  const repository = new ModelRepository(database.db)
  const publish = async (
    versionId,
    fileId,
    predictionType,
    modelId = 90_001,
    displayName = 'Illustrious Smoke Checkpoint',
  ) => {
    const filename = `smoke-checkpoint-v${versionId}.safetensors`
    const managedPath = path.join(modelRoot, filename)
    const bytes = Buffer.from(`verified smoke checkpoint version ${versionId}`)
    writeFileSync(managedPath, bytes)
    return await repository.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath,
          originalFilename: filename,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          sizeBytes: bytes.length,
          verifiedAt: new Date().toISOString(),
        },
        resource: {
          creator: 'Smoke fixture',
          displayName,
          source: { kind: 'civitai', modelId },
          sourceMetadata: { source: 'smoke' },
          type: 'checkpoint',
        },
        version: {
          baseModelFamily: 'illustrious',
          format: 'safetensors',
          name: `v${versionId}`,
          predictionType,
          source: {
            expectedSha256: createHash('sha256').update(bytes).digest('hex'),
            fileId,
            kind: 'civitai',
            versionId,
          },
          sourceMetadata: { source: 'smoke' },
        },
      },
    })
  }
  try {
    const first = await publish(901, 9_001, 'epsilon')
    const second = await publish(902, 9_002, 'v_prediction')
    const alternate = await publish(903, 9_003, 'epsilon', 90_002, 'Alternate Smoke Checkpoint')
    const unavailableDefault = await publish(
      904,
      9_004,
      'epsilon',
      90_002,
      'Alternate Smoke Checkpoint',
    )
    await repository.setDefaultVersion(alternate.resourceId, unavailableDefault.versionId)
    return {
      alternate,
      first,
      firstPath: path.join(modelRoot, 'smoke-checkpoint-v901.safetensors'),
      second,
      secondPath: path.join(modelRoot, 'smoke-checkpoint-v902.safetensors'),
      unavailableDefaultPath: path.join(modelRoot, 'smoke-checkpoint-v904.safetensors'),
    }
  } finally {
    await database.close()
  }
}

async function waitForShadowBbox(manifestPath, expectedBbox) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (manifest.state === 'dirty' && typeof manifest.snapshotId === 'string') {
        const snapshotPath = path.join(
          path.dirname(manifestPath),
          'snapshots',
          manifest.snapshotId,
          'project.json',
        )
        const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'))
        if (
          snapshot.documentRevision === manifest.documentRevision &&
          Object.keys(expectedBbox).every(
            (key) => snapshot.primaryBbox?.[key] === expectedBbox[key],
          )
        ) {
          return
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
    await delay(100)
  }
  throw new Error('Autosave did not publish the edited generation area to the shadow snapshot.')
}

async function waitForOpenTab(window, tabId, predicate, description) {
  const deadline = Date.now() + 10_000
  let last
  while (Date.now() < deadline) {
    last = await window.evaluate((id) => window.api.projects.open(id), tabId)
    if (last.ok && last.value.kind === 'opened' && predicate(last.value.tab)) {
      return last.value.tab
    }
    await delay(50)
  }
  throw new Error(`${description}: ${JSON.stringify(last)}`)
}

async function sampleImageAtWorld(window, bytes, mimeType, rect, worldX, worldY) {
  return await window.evaluate(
    async ({ base64, mimeType, rect, worldX, worldY }) => {
      const image = new Image()
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = () => reject(new Error('A saved preview image could not be decoded.'))
        image.src = `data:${mimeType};base64,${base64}`
      })
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      context.drawImage(image, 0, 0)
      const x = Math.floor(((worldX - rect.x) * canvas.width) / rect.width)
      const y = Math.floor(((worldY - rect.y) * canvas.height) / rect.height)
      const pixel = [...context.getImageData(x, y, 1, 1).data]
      return { pixel, width: canvas.width, height: canvas.height }
    },
    { base64: bytes.toString('base64'), mimeType, rect, worldX, worldY },
  )
}

async function waitForHomeThumbnail(window, projectTitle) {
  const row = window.getByRole('listitem').filter({ hasText: projectTitle })
  const thumbnail = row.locator('img')
  await thumbnail.waitFor()
  await window.waitForFunction((title) => {
    const projectRow = [...document.querySelectorAll('.project-row')].find((candidate) =>
      candidate.textContent?.includes(title),
    )
    const image = projectRow?.querySelector('img')
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
  }, projectTitle)
  return await thumbnail.getAttribute('src')
}

let application
let secondProcess
try {
  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  const window = await application.firstWindow()
  await window.locator('body').waitFor()
  if (process.env.IMAGEGEN_SMOKE_SCREENSHOT) {
    await window.screenshot({ path: process.env.IMAGEGEN_SMOKE_SCREENSHOT })
  }
  assert.equal(await window.title(), 'ImageGen Studio')
  assert.deepEqual(await window.evaluate(() => window.api.runtime.getStatus()), {
    ok: true,
    value: {
      kind: 'not-installed',
      profile: 'linux-nvidia',
      detail:
        'The Linux/NVIDIA runtime has not been installed. GPU compatibility is checked during setup.',
    },
  })
  assert.equal(
    await window.evaluate(async () => (await window.api.runtime.install()).error.code),
    'RUNTIME_INSTALL_UNAVAILABLE',
  )
  assert.equal(await window.evaluate(() => typeof window.require), 'undefined')
  await window.getByRole('button', { name: 'Close Home' }).press('Space')
  await window.getByRole('tab', { name: 'Home' }).waitFor({ state: 'detached' })
  await window.getByRole('main').getByRole('button', { name: 'Open Home' }).click()
  await window.getByRole('tab', { name: 'Home' }).waitFor()
  await window.getByRole('button', { name: 'Manage Models' }).click()
  await window.getByRole('dialog', { name: 'Model Manager' }).waitFor()
  if (process.env.IMAGEGEN_SMOKE_MODEL_SCREENSHOT) {
    await delay(300)
    await window.screenshot({ path: process.env.IMAGEGEN_SMOKE_MODEL_SCREENSHOT })
  }
  assert.deepEqual(await window.evaluate(() => window.api.models.getCatalog()), {
    ok: true,
    value: [],
  })
  assert.deepEqual(await window.evaluate(() => window.api.models.getStorageSummary()), {
    ok: true,
    value: { totalBytes: 0 },
  })
  assert.equal(await window.evaluate(() => typeof window.api.models.openModelFolder), 'function')
  assert.deepEqual(await window.evaluate(() => window.api.models.getInstallJobs()), {
    ok: true,
    value: [],
  })
  const invalidModelRequest = await window.evaluate(() =>
    window.api.models.previewImport('file:///etc/passwd'),
  )
  assert.equal(invalidModelRequest.ok, false)
  assert.ok(
    ['CIVITAI_TOKEN_REQUIRED', 'TOKEN_SECURE_STORAGE_UNAVAILABLE'].includes(
      invalidModelRequest.error.code,
    ),
  )
  await window.getByRole('button', { name: 'Close Model Manager' }).click()
  await window.getByRole('dialog', { name: 'Model Manager' }).waitFor({ state: 'detached' })
  const checkpointVersions = await seedInstalledCheckpointVersions()

  const projectTitle = 'Smoke Project'
  await window.getByRole('button', { name: 'New Project' }).first().click()
  const newProjectDialog = window.getByRole('dialog', { name: 'New Project' })
  await newProjectDialog.waitFor()
  await newProjectDialog.locator('input[aria-label="Project name"]').fill(projectTitle)
  await newProjectDialog.locator('input[aria-label="Project width"]').fill('640')
  await newProjectDialog.locator('input[aria-label="Project height"]').fill('512')
  await newProjectDialog.getByRole('button', { name: 'Create Project' }).click()
  await window.getByRole('tab', { name: projectTitle }).waitFor()

  const emptyProjectPicker = application.evaluate(
    ({ dialog }) =>
      new Promise((resolve) => {
        dialog.showOpenDialog = async () => {
          resolve(true)
          return { canceled: true, filePaths: [] }
        }
      }),
  )
  await window.getByRole('button', { name: 'Import image', exact: true }).click()
  assert.equal(await emptyProjectPicker, true)

  const createdProjects = await window.evaluate(() => window.api.projects.list())
  assert.equal(createdProjects.ok, true)
  assert.equal(createdProjects.value.length, 1)
  assert.equal(createdProjects.value[0].title, projectTitle)
  assert.deepEqual(createdProjects.value[0].bbox, { width: 640, height: 512 })
  const projectId = createdProjects.value[0].id
  const projectDir = path.join(dataRoot, 'data', 'imagegen-studio', 'workspaces', 'Uncategorized')
  const projectPackages = readdirSync(projectDir).filter((entry) => entry.endsWith('.igs'))
  assert.equal(projectPackages.length, 1)
  const packagePath = path.join(projectDir, projectPackages[0])
  assert.ok(statSync(packagePath).size > 0)
  assert.equal(readFileSync(packagePath).subarray(0, 2).toString('ascii'), 'PK')

  const invalidProjectRequest = await window.evaluate(
    (id) => window.api.projects.setPrimaryBbox(id, { x: 0, y: 0, width: 0, height: 512 }),
    projectId,
  )
  assert.equal(invalidProjectRequest.ok, false)
  assert.equal(invalidProjectRequest.error.code, 'IPC_INVALID_CALLER')
  const unchangedProject = await window.evaluate((id) => window.api.projects.open(id), projectId)
  assert.equal(unchangedProject.ok, true)
  assert.equal(unchangedProject.value.kind, 'opened')
  assert.deepEqual(unchangedProject.value.tab.primaryBbox, { x: 0, y: 0, width: 640, height: 512 })
  assert.equal(unchangedProject.value.tab.dirty, false)
  assert.equal(unchangedProject.value.tab.layers.length, 0)

  await window.locator('input[aria-label="Generation area X"]').fill('72')
  await window.locator('input[aria-label="Generation area width"]').fill('704')
  await window.getByRole('button', { name: 'Apply generation area' }).click()
  await window.getByRole('button', { name: 'Save Project' }).click()
  await window
    .getByRole('region', { name: `Project ${projectTitle}` })
    .getByText('Saved', { exact: true })
    .waitFor()
  await window.getByRole('button', { name: `Close ${projectTitle}` }).click()
  await window.getByRole('tab', { name: projectTitle }).waitFor({ state: 'detached' })
  await window.getByRole('tab', { name: 'Home' }).click()
  await window.getByRole('button', { name: `Open ${projectTitle}` }).click()
  await window.getByRole('tab', { name: projectTitle }).waitFor()
  const reopenedProject = await window.evaluate((id) => window.api.projects.open(id), projectId)
  assert.equal(reopenedProject.ok, true)
  assert.equal(reopenedProject.value.kind, 'opened')
  assert.deepEqual(reopenedProject.value.tab.primaryBbox, { x: 72, y: 0, width: 704, height: 512 })
  assert.equal(reopenedProject.value.tab.dirty, false)

  const projectRegion = window.getByRole('region', { name: `Project ${projectTitle}` })
  await projectRegion.locator('[aria-label="Generation model"]').click()
  await window.getByText('Illustrious Smoke Checkpoint', { exact: true }).last().click()
  await waitForOpenTab(
    window,
    projectId,
    (tab) => tab.generationDraft.model?.localVersionId === checkpointVersions.first.versionId,
    'The Project model selection did not reach the document',
  )
  await projectRegion.getByRole('button', { name: 'Save Project' }).click()
  await projectRegion.getByText('Saved', { exact: true }).waitFor()
  const firstModelPackage = await readIgsPackage(packagePath)
  assert.equal(
    firstModelPackage.project.generationDraft.model?.fileSha256,
    createHash('sha256').update(readFileSync(checkpointVersions.firstPath)).digest('hex'),
  )
  assert.equal(
    firstModelPackage.project.generationDraft.model?.localVersionId,
    checkpointVersions.first.versionId,
  )

  const newDefault = await window.evaluate(
    ({ resourceId, versionId }) => window.api.models.setDefaultVersion(resourceId, versionId),
    {
      resourceId: checkpointVersions.first.resourceId,
      versionId: checkpointVersions.second.versionId,
    },
  )
  assert.equal(newDefault.ok, true)
  await projectRegion.getByRole('button', { name: 'Refresh models' }).click()
  assert.equal(
    (await window.evaluate((id) => window.api.projects.open(id), projectId)).value.tab
      .generationDraft.model.localVersionId,
    checkpointVersions.first.versionId,
    'Changing Model Manager Default must not replace an existing Project reference',
  )
  await projectRegion.locator('[aria-label="Model version"]').click()
  await window.getByText('v902', { exact: true }).last().click()
  await waitForOpenTab(
    window,
    projectId,
    (tab) => tab.generationDraft.model?.localVersionId === checkpointVersions.second.versionId,
    'The exact model version change did not reach the document',
  )
  if (process.env.IMAGEGEN_SMOKE_PROJECT_MODEL_SCREENSHOT) {
    await projectRegion.getByRole('heading', { name: 'Generation', exact: true }).click()
    await delay(250)
    await window.screenshot({ path: process.env.IMAGEGEN_SMOKE_PROJECT_MODEL_SCREENSHOT })
  }
  await projectRegion.getByRole('button', { name: 'Save Project' }).click()
  await projectRegion.getByText('Saved', { exact: true }).waitFor()
  const selectedModelPackage = await readIgsPackage(packagePath)
  assert.equal(
    selectedModelPackage.project.generationDraft.model?.localVersionId,
    checkpointVersions.second.versionId,
  )
  assert.equal(selectedModelPackage.project.generationDraft.model?.predictionType, 'v_prediction')
  await window.getByRole('button', { name: `Close ${projectTitle}` }).click()
  await window.getByRole('tab', { name: 'Home' }).click()
  await window.getByRole('button', { name: `Open ${projectTitle}` }).click()
  const reopenedModel = await window.evaluate((id) => window.api.projects.open(id), projectId)
  assert.equal(reopenedModel.ok, true)
  assert.equal(
    reopenedModel.value.tab.generationDraft.model?.localVersionId,
    checkpointVersions.second.versionId,
  )
  const selectedModelBytes = readFileSync(checkpointVersions.secondPath)
  rmSync(checkpointVersions.secondPath)
  await projectRegion.getByRole('button', { name: 'Refresh models' }).click()
  await projectRegion.getByText(/exact selected model version is no longer installed/).waitFor()
  assert.equal(
    (await window.evaluate((id) => window.api.projects.open(id), projectId)).value.tab
      .generationDraft.model.localVersionId,
    checkpointVersions.second.versionId,
    'A missing exact file must not silently select the new catalog default',
  )
  writeFileSync(checkpointVersions.secondPath, selectedModelBytes)
  await projectRegion.getByRole('button', { name: 'Refresh models' }).click()
  await projectRegion
    .getByText(/exact selected model version is no longer installed/)
    .waitFor({ state: 'detached' })
  rmSync(checkpointVersions.unavailableDefaultPath)
  await projectRegion.getByRole('button', { name: 'Refresh models' }).click()
  const chooseAlternateResource = async () => {
    await projectRegion.locator('[aria-label="Generation model"]').click()
    await window.getByText('Alternate Smoke Checkpoint', { exact: true }).last().click()
    await projectRegion.getByText(/Choose a version\. Current:/).waitFor()
  }
  await chooseAlternateResource()
  if (process.env.IMAGEGEN_SMOKE_PROJECT_MODEL_CHOICE_SCREENSHOT) {
    await projectRegion.getByRole('heading', { name: 'Generation', exact: true }).click()
    await delay(250)
    await window.screenshot({ path: process.env.IMAGEGEN_SMOKE_PROJECT_MODEL_CHOICE_SCREENSHOT })
  }
  const stagedModelTab = await window.evaluate((id) => window.api.projects.open(id), projectId)
  assert.equal(stagedModelTab.ok, true)
  assert.equal(
    stagedModelTab.value.tab.generationDraft.model?.localVersionId,
    checkpointVersions.second.versionId,
  )
  assert.equal(stagedModelTab.value.tab.dirty, false)
  await projectRegion.getByRole('button', { name: 'Cancel model choice' }).click()
  await projectRegion.getByText(/Choose a version\. Current:/).waitFor({ state: 'detached' })
  await chooseAlternateResource()
  await projectRegion.locator('[aria-label="Model version"]').click()
  await window.getByText('v903', { exact: true }).last().click()
  await waitForOpenTab(
    window,
    projectId,
    (tab) => tab.generationDraft.model?.localVersionId === checkpointVersions.alternate.versionId,
    'Selecting an available alternate version did not update the Project',
  )
  const forgedModelSelection = await window.evaluate(
    ({ id, resourceId, versionId }) =>
      window.api.projects.setGenerationModel(id, {
        fileSha256: 'a'.repeat(64),
        resourceId,
        versionId,
      }),
    {
      id: projectId,
      resourceId: checkpointVersions.first.resourceId,
      versionId: checkpointVersions.first.versionId,
    },
  )
  assert.equal(forgedModelSelection.ok, false)
  assert.equal(forgedModelSelection.error.code, 'IPC_INVALID_CALLER')

  const receivedSecondInstance = application.evaluate(
    ({ app }) => new Promise((resolve) => app.once('second-instance', () => resolve(true))),
  )
  secondProcess = spawn(electronBinary, ['.'], {
    cwd: process.cwd(),
    env: { ...environment, XDG_CONFIG_HOME: path.join(dataRoot, 'second-config') },
    stdio: 'ignore',
  })
  await Promise.race([
    receivedSecondInstance,
    delay(10_000).then(() => {
      throw new Error('The first app did not receive second-instance.')
    }),
  ])
  const windows = await application.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
  )
  assert.equal(windows, 1)
  if (secondProcess.exitCode === null) {
    await Promise.race([
      new Promise((resolve) => secondProcess.once('exit', resolve)),
      delay(5_000).then(() => {
        throw new Error('The second app process did not exit.')
      }),
    ])
  }
  console.log('Desktop smoke passed: Home, Model Manager IPC, Project Save/reopen, one instance.')

  const savedPackage = readFileSync(packagePath)
  await window.locator('input[aria-label="Generation area Y"]').fill('96')
  await window.getByRole('button', { name: 'Apply generation area' }).click()
  await waitForOpenTab(
    window,
    projectId,
    (tab) => tab.dirty && tab.primaryBbox.y === 96,
    'Generation-area edit did not reach the Project tab',
  )
  const shadowManifestPath = path.join(
    dataRoot,
    'data',
    'imagegen-studio',
    'autosave',
    projectId,
    'manifest.json',
  )
  await waitForShadowBbox(shadowManifestPath, { x: 72, y: 96, width: 704, height: 512 })
  assert.ok(
    readFileSync(packagePath).equals(savedPackage),
    'Autosave must not replace the saved .igs',
  )

  const crashedProcess = application.process()
  const crashed = new Promise((resolve) => crashedProcess.once('exit', resolve))
  assert.equal(crashedProcess.kill('SIGKILL'), true)
  await Promise.race([
    crashed,
    delay(10_000).then(() => {
      throw new Error('The simulated crash did not stop Electron.')
    }),
  ])
  application = undefined
  assert.ok(readFileSync(packagePath).equals(savedPackage), 'Crash must not change the saved .igs')

  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  const recoveryWindow = await application.firstWindow()
  await recoveryWindow.getByRole('tab', { name: 'Home' }).waitFor()
  await recoveryWindow.getByRole('button', { name: `Open ${projectTitle}` }).click()
  const recoveryDialog = recoveryWindow.getByRole('dialog', { name: 'Recovery available' })
  await recoveryDialog.waitFor()
  assert.ok(
    readFileSync(packagePath).equals(savedPackage),
    'Recovery must not change the .igs before Save',
  )
  await recoveryDialog.getByRole('button', { name: 'Recover', exact: true }).click()
  await recoveryWindow.getByRole('tab', { name: projectTitle }).waitFor()
  const recoveredProject = await recoveryWindow.evaluate(
    (id) => window.api.projects.open(id),
    projectId,
  )
  assert.equal(recoveredProject.ok, true)
  assert.equal(recoveredProject.value.kind, 'opened')
  assert.deepEqual(recoveredProject.value.tab.primaryBbox, {
    x: 72,
    y: 96,
    width: 704,
    height: 512,
  })
  assert.equal(recoveredProject.value.tab.dirty, true)
  await recoveryWindow.getByRole('button', { name: 'Save Project' }).click()
  await recoveryWindow
    .getByRole('region', { name: `Project ${projectTitle}` })
    .getByText('Saved', { exact: true })
    .waitFor()
  const afterRecoverySave = await recoveryWindow.evaluate(() => window.api.projects.list())
  assert.equal(afterRecoverySave.ok, true)
  assert.equal(
    afterRecoverySave.value.find((project) => project.id === projectId)?.recoveryStatus,
    'none',
  )
  await recoveryWindow.getByRole('button', { name: `Close ${projectTitle}` }).click()
  console.log(
    'Desktop smoke passed: crash shadow recovery is explicit and Save commits the recovered edit.',
  )

  // The OS picker is the only source of import paths. Replace that nondeterministic dialog while
  // keeping renderer, preload, IPC, main validation, ZIP transfer and Home indexing real.
  const externalDirectory = path.join(dataRoot, 'external')
  mkdirSync(externalDirectory)
  const externalProject = path.join(externalDirectory, 'Portable Copy.igs')
  const rasterLayerId = randomUUID()
  const lowerRasterLayerId = randomUUID()
  const rasterAssetPath = `assets/layers/${rasterLayerId}.png`
  const lowerRasterAssetPath = `assets/layers/${lowerRasterLayerId}.png`
  const rasterTitle = 'Raster Import Smoke'
  const rasterDocument = createEmptyProjectDocumentV1({ title: rasterTitle })
  await saveIgsPackage(externalProject, {
    assets: {
      [rasterAssetPath]: { bytes: rasterPng },
      [lowerRasterAssetPath]: { bytes: rasterPng },
    },
    preview: {
      merged: readFileSync('dist/main/placeholders/unavailable.png'),
      rect: { height: 400, width: 400, x: -3, y: 4 },
      status: 'unavailable',
      thumbnail: readFileSync('dist/main/placeholders/unavailable.webp'),
    },
    project: {
      ...rasterDocument,
      layers: [
        {
          asset: {
            bytes: rasterPng.length,
            height: 2,
            path: rasterAssetPath,
            sha256: createHash('sha256').update(rasterPng).digest('hex'),
            width: 2,
          },
          blendMode: 'normal',
          id: rasterLayerId,
          kind: 'raster',
          locked: false,
          name: 'Raster smoke layer',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 200, scaleY: 200, x: -3, y: 4 },
          visible: true,
        },
        {
          asset: {
            bytes: rasterPng.length,
            height: 2,
            path: lowerRasterAssetPath,
            sha256: createHash('sha256').update(rasterPng).digest('hex'),
            width: 2,
          },
          blendMode: 'normal',
          id: lowerRasterLayerId,
          kind: 'raster',
          locked: false,
          name: 'Lower smoke layer',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 200, scaleY: 200, x: -3, y: 4 },
          visible: false,
        },
      ],
    },
  })
  const externalBytes = readFileSync(externalProject)
  await application.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] })
  }, externalProject)
  await recoveryWindow.getByRole('tab', { name: 'Home' }).click()
  await recoveryWindow.getByRole('button', { name: 'Import Project' }).click()
  const importDialog = recoveryWindow.getByRole('dialog', { name: 'Import Project' })
  await importDialog.waitFor()
  assert.equal(
    await importDialog.getByRole('radio', { name: 'Move the file here' }).isChecked(),
    true,
  )
  await importDialog.getByRole('button', { name: 'Cancel' }).click()
  await importDialog.waitFor({ state: 'detached' })
  assert.deepEqual(readFileSync(externalProject), externalBytes)
  assert.equal((await recoveryWindow.evaluate(() => window.api.projects.list())).value.length, 1)

  await recoveryWindow.getByRole('button', { name: 'Import Project' }).click()
  await importDialog.waitFor()
  await importDialog.getByText('Keep the original and copy it here').click()
  await importDialog.getByRole('button', { name: 'Copy and Open' }).click()
  await importDialog.waitFor({ state: 'detached' })
  await recoveryWindow.getByRole('tab', { name: rasterTitle }).waitFor()
  const afterImport = await recoveryWindow.evaluate(() => window.api.projects.list())
  assert.equal(afterImport.ok, true)
  assert.equal(afterImport.value.length, 2)
  const rasterProject = afterImport.value.find((project) => project.title === rasterTitle)
  assert.ok(rasterProject && rasterProject.id !== projectId)
  assert.equal(rasterProject.previewStatus, 'unavailable')
  assert.match(rasterProject.thumbnailUrl, /^igs-preview:\/\/thumbnail\//)

  const importedPackages = await Promise.all(
    readdirSync(projectDir)
      .filter((entry) => entry.endsWith('.igs'))
      .map(async (entry) => ({
        entry,
        package: await readIgsPackage(path.join(projectDir, entry)),
      })),
  )
  const importedRasterPackage = importedPackages.find(
    (candidate) => candidate.package.project.title === rasterTitle,
  )
  assert.ok(importedRasterPackage)
  const rasterPackagePath = path.join(projectDir, importedRasterPackage.entry)
  const preRebuildDocument = await importedRasterPackage.package.readMember('project.json')
  const preRebuildAssets = await Promise.all(
    [rasterAssetPath, lowerRasterAssetPath].map((member) =>
      importedRasterPackage.package.readMember(member),
    ),
  )
  const preRebuildPlaceholder = await importedRasterPackage.package.readMember('preview/merged.png')
  const preRebuildRevision = importedRasterPackage.package.project.documentRevision
  await recoveryWindow.getByRole('button', { name: `Close ${rasterTitle}` }).click()
  await recoveryWindow.getByRole('tab', { name: 'Home' }).click()
  const rasterHomeRow = recoveryWindow.getByRole('listitem').filter({ hasText: rasterTitle })
  await rasterHomeRow.getByText('Preview unavailable').waitFor()
  assert.equal(await waitForHomeThumbnail(recoveryWindow, rasterTitle), rasterProject.thumbnailUrl)
  await rasterHomeRow.getByRole('button', { name: `Rebuild preview for ${rasterTitle}` }).click()
  await rasterHomeRow.getByText('Saved preview').waitFor()
  const rebuiltThumbnailUrl = await waitForHomeThumbnail(recoveryWindow, rasterTitle)
  assert.equal(
    await rasterHomeRow.getByRole('button', { name: `Rebuild preview for ${rasterTitle}` }).count(),
    0,
  )
  const afterRebuildSummary = await recoveryWindow.evaluate(() => window.api.projects.list())
  assert.equal(afterRebuildSummary.ok, true)
  const rebuiltProjectSummary = afterRebuildSummary.value.find(
    (project) => project.id === rasterProject.id,
  )
  assert.equal(rebuiltProjectSummary?.previewStatus, 'rendered')
  assert.match(rebuiltProjectSummary.thumbnailUrl, /^igs-preview:\/\/thumbnail\//)
  assert.notEqual(rebuiltProjectSummary.thumbnailUrl, rasterProject.thumbnailUrl)
  assert.equal(rebuiltThumbnailUrl, rebuiltProjectSummary.thumbnailUrl)
  const rebuiltPackage = await readIgsPackage(rasterPackagePath)
  assert.equal(rebuiltPackage.manifest.preview.status, 'rendered')
  assert.deepEqual(rebuiltPackage.manifest.preview.rect, {
    x: -3,
    y: 4,
    width: 400,
    height: 400,
  })
  assert.equal(rebuiltPackage.project.documentRevision, preRebuildRevision)
  assert.deepEqual(await rebuiltPackage.readMember('project.json'), preRebuildDocument)
  for (const [index, member] of [rasterAssetPath, lowerRasterAssetPath].entries()) {
    assert.deepEqual(await rebuiltPackage.readMember(member), preRebuildAssets[index])
  }
  const rebuiltComposite = await rebuiltPackage.readMember('preview/merged.png')
  assert.equal(rebuiltComposite.equals(preRebuildPlaceholder), false)
  const rebuiltPixel = await sampleImageAtWorld(
    recoveryWindow,
    rebuiltComposite,
    'image/png',
    rebuiltPackage.manifest.preview.rect,
    197,
    204,
  )
  assert.ok(
    rebuiltPixel.pixel[2] > rebuiltPixel.pixel[0] + 100 && rebuiltPixel.pixel[3] > 240,
    `Rebuild Preview did not composite the saved layer: ${rebuiltPixel.pixel}`,
  )
  assert.deepEqual(readFileSync(externalProject), externalBytes)
  await rasterHomeRow.getByRole('button', { name: `Open ${rasterTitle}` }).click()
  console.log(
    'Desktop smoke passed: Home thumbnail and clean preview rebuild preserve Project bytes.',
  )

  const rasterTab = await recoveryWindow.evaluate(
    (id) => window.api.projects.open(id),
    rasterProject.id,
  )
  assert.equal(rasterTab.ok, true)
  assert.equal(rasterTab.value.kind, 'opened')
  assert.equal(rasterTab.value.tab.dirty, false)
  assert.equal(rasterTab.value.tab.layers.length, 2)
  const layerUrl = rasterTab.value.tab.layers[0].imageUrl
  const imageSize = await recoveryWindow.evaluate(
    async (url) =>
      await new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve({ height: image.naturalHeight, width: image.naturalWidth })
        image.onerror = () => reject(new Error('The saved raster did not load in the renderer.'))
        image.src = url
      }),
    layerUrl,
  )
  assert.deepEqual(imageSize, { height: 2, width: 2 })
  await recoveryWindow.getByText('Raster smoke layer').waitFor()
  const canvasRegion = recoveryWindow.getByRole('region', { name: 'Project Canvas' })
  await canvasRegion.locator('canvas').first().waitFor()
  await canvasRegion.getByRole('button', { name: 'Bounding Box tool' }).waitFor()
  assert.equal(await canvasRegion.getByText('layer image could not be displayed').count(), 0)
  if (process.env.IMAGEGEN_SMOKE_RASTER_SCREENSHOT) {
    await recoveryWindow.screenshot({ path: process.env.IMAGEGEN_SMOKE_RASTER_SCREENSHOT })
  }
  await recoveryWindow.waitForFunction(() => {
    const canvas = document.querySelector('[aria-label="Project Canvas"] canvas')
    if (!(canvas instanceof HTMLCanvasElement)) return false
    try {
      const pixel = canvas
        .getContext('2d')
        .getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data
      return pixel[3] > 0 && pixel[2] > pixel[0] + 40
    } catch {
      return false
    }
  })
  const invalidRasterChange = await recoveryWindow.evaluate(
    ([tabId, layerId]) =>
      window.api.projects.updateRasterLayer(tabId, layerId, { kind: 'opacity', opacity: 2 }),
    [rasterProject.id, rasterLayerId],
  )
  assert.equal(invalidRasterChange.ok, false)
  assert.equal(invalidRasterChange.error.code, 'IPC_INVALID_CALLER')
  const invalidDraftChange = await recoveryWindow.evaluate(
    (tabId) =>
      window.api.projects.updateGenerationDraft(tabId, {
        kind: 'seed',
        policy: 'fixed',
        value: -1,
      }),
    rasterProject.id,
  )
  assert.equal(invalidDraftChange.ok, false)
  assert.equal(invalidDraftChange.error.code, 'IPC_INVALID_CALLER')

  await recoveryWindow.getByRole('button', { name: 'Hide Raster smoke layer' }).click()
  await waitForOpenTab(
    recoveryWindow,
    rasterProject.id,
    (tab) => !tab.layers.find((layer) => layer.id === rasterLayerId)?.visible,
    'Hide did not reach the Project tab',
  )
  await recoveryWindow.waitForFunction(() => {
    const canvas = document.querySelector('[aria-label="Project Canvas"] canvas')
    if (!(canvas instanceof HTMLCanvasElement)) return false
    const pixel = canvas
      .getContext('2d')
      .getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data
    return pixel[2] <= pixel[0] + 40
  })
  await recoveryWindow.getByRole('button', { name: 'Show Raster smoke layer' }).click()
  await recoveryWindow.getByRole('button', { name: 'Select Raster smoke layer' }).click()
  const opacityInput = recoveryWindow.locator('input[aria-label="Layer opacity"]')
  await opacityInput.fill('40')
  await opacityInput.press('Tab')
  await waitForOpenTab(
    recoveryWindow,
    rasterProject.id,
    (tab) => {
      const layer = tab.layers.find((candidate) => candidate.id === rasterLayerId)
      return layer?.visible === true && layer.opacity === 0.4
    },
    'Opacity did not reach the Project tab',
  )
  await recoveryWindow.waitForFunction(() => {
    const canvas = document.querySelector('[aria-label="Project Canvas"] canvas')
    if (!(canvas instanceof HTMLCanvasElement)) return false
    const pixel = canvas
      .getContext('2d')
      .getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data
    return pixel[3] >= 80 && pixel[3] <= 125 && pixel[2] > pixel[0] + 40
  })
  await recoveryWindow.locator('[aria-label="Layer blend mode"]').click()
  await recoveryWindow.getByText('Multiply', { exact: true }).click()
  await waitForOpenTab(
    recoveryWindow,
    rasterProject.id,
    (tab) => tab.layers.find((layer) => layer.id === rasterLayerId)?.blendMode === 'multiply',
    'Blend mode did not reach the Project tab',
  )
  if (process.env.IMAGEGEN_SMOKE_RASTER_EDITED_SCREENSHOT) {
    await recoveryWindow.screenshot({ path: process.env.IMAGEGEN_SMOKE_RASTER_EDITED_SCREENSHOT })
  }
  await recoveryWindow.getByRole('button', { name: 'Lock Raster smoke layer' }).click()
  await recoveryWindow.getByRole('button', { name: 'Unlock Raster smoke layer' }).waitFor()
  assert.equal(await opacityInput.isDisabled(), true)
  await recoveryWindow.getByRole('button', { name: 'Unlock Raster smoke layer' }).click()
  assert.equal(await opacityInput.isEnabled(), true)
  await recoveryWindow.getByRole('button', { name: 'Layer actions for Raster smoke layer' }).click()
  await recoveryWindow.getByText('Move down', { exact: true }).click()
  await waitForOpenTab(
    recoveryWindow,
    rasterProject.id,
    (tab) =>
      tab.layers.map((layer) => layer.id).join(',') === `${lowerRasterLayerId},${rasterLayerId}`,
    'Menu move down did not reach the Project tab',
  )
  await recoveryWindow.waitForFunction(() => {
    const list = document.querySelector('[aria-label="Project layers"] .layer-list')
    const labels = [...(list?.querySelectorAll('button[aria-label^="Select "]') ?? [])].map(
      (button) => button.getAttribute('aria-label'),
    )
    return labels.join(',') === 'Select Lower smoke layer,Select Raster smoke layer'
  })
  await recoveryWindow.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="Hide Raster smoke layer"]')
    return button instanceof HTMLButtonElement && !button.disabled
  })
  const sourceBox = await recoveryWindow
    .getByRole('button', { name: 'Select Raster smoke layer' })
    .boundingBox()
  const targetBox = await recoveryWindow
    .getByRole('button', { name: 'Select Lower smoke layer' })
    .boundingBox()
  assert.ok(sourceBox && targetBox)
  await recoveryWindow.mouse.move(sourceBox.x + 45, sourceBox.y + sourceBox.height / 2)
  await recoveryWindow.mouse.down()
  await recoveryWindow.mouse.move(targetBox.x + 45, targetBox.y + targetBox.height * 0.25, {
    steps: 12,
  })
  await recoveryWindow.mouse.up()
  await waitForOpenTab(
    recoveryWindow,
    rasterProject.id,
    (tab) =>
      tab.layers.map((layer) => layer.id).join(',') === `${rasterLayerId},${lowerRasterLayerId}`,
    'Pointer reorder did not reach the Project tab',
  )
  await recoveryWindow.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="Hide Raster smoke layer"]')
    return button instanceof HTMLButtonElement && !button.disabled
  })
  await recoveryWindow.locator('[aria-label="Seed policy"]').click()
  await recoveryWindow.getByText('Fixed', { exact: true }).click()
  const fixedSeed = recoveryWindow.locator('input[aria-label="Fixed seed"]')
  await fixedSeed.fill('')
  assert.equal(
    await recoveryWindow.getByRole('button', { name: 'Save Project' }).isDisabled(),
    true,
  )
  await fixedSeed.fill('73421')
  await fixedSeed.press('Tab')
  await fixedSeed.fill('')
  assert.equal(
    await recoveryWindow.getByRole('button', { name: 'Save Project' }).isDisabled(),
    true,
  )
  await recoveryWindow.getByRole('heading', { name: 'Generation area' }).click()
  assert.equal(await fixedSeed.inputValue(), '73421')
  await recoveryWindow
    .getByRole('textbox', { name: 'Negative prompt' })
    .fill('soft focus, artifacts')
  await recoveryWindow
    .getByRole('textbox', { name: 'Positive prompt' })
    .fill('studio portrait, red rim light')
  if (process.env.IMAGEGEN_SMOKE_PROJECT_SCREENSHOT) {
    await recoveryWindow.screenshot({ path: process.env.IMAGEGEN_SMOKE_PROJECT_SCREENSHOT })
  }
  // Save immediately after typing: it must wait for the serialized draft IPC updates.
  await recoveryWindow.getByRole('button', { name: 'Save Project' }).click()
  await waitForOpenTab(
    recoveryWindow,
    rasterProject.id,
    (tab) =>
      !tab.dirty &&
      tab.generationDraft.positivePrompt.text === 'studio portrait, red rim light' &&
      tab.generationDraft.negativePrompt.text === 'soft focus, artifacts' &&
      tab.generationDraft.seed.policy === 'fixed' &&
      tab.generationDraft.seed.value === 73421 &&
      tab.layers.map((layer) => layer.id).join(',') === `${rasterLayerId},${lowerRasterLayerId}`,
    'Save did not commit the reordered Project',
  )
  await recoveryWindow
    .getByRole('region', { name: `Project ${rasterTitle}` })
    .getByText('Saved', { exact: true })
    .waitFor()
  const savedRasterPackages = await Promise.all(
    readdirSync(projectDir)
      .filter((entry) => entry.endsWith('.igs'))
      .map((entry) => readIgsPackage(path.join(projectDir, entry))),
  )
  const savedRasterPackage = savedRasterPackages.find(
    (candidate) => candidate.project.title === rasterTitle,
  )
  assert.ok(savedRasterPackage)
  assert.equal(
    savedRasterPackage.project.generationDraft.positivePrompt.text,
    'studio portrait, red rim light',
  )
  assert.equal(
    savedRasterPackage.project.generationDraft.negativePrompt.text,
    'soft focus, artifacts',
  )
  assert.deepEqual(savedRasterPackage.project.generationDraft.seed, {
    policy: 'fixed',
    value: 73421,
  })
  assert.deepEqual(
    savedRasterPackage.project.layers.map((layer) => layer.id),
    [rasterLayerId, lowerRasterLayerId],
  )
  assert.equal(savedRasterPackage.project.layers[0].blendMode, 'multiply')
  assert.equal(savedRasterPackage.manifest.preview.status, 'rendered')
  assert.deepEqual(savedRasterPackage.manifest.preview.rect, {
    x: -3,
    y: 4,
    width: 400,
    height: 400,
  })
  const bluePreview = await sampleImageAtWorld(
    recoveryWindow,
    await savedRasterPackage.readMember('preview/merged.png'),
    'image/png',
    savedRasterPackage.manifest.preview.rect,
    197,
    204,
  )
  assert.deepEqual(
    { width: bluePreview.width, height: bluePreview.height },
    {
      width: 400,
      height: 400,
    },
  )
  assert.ok(
    bluePreview.pixel[2] > bluePreview.pixel[0] + 100 &&
      bluePreview.pixel[3] >= 80 &&
      bluePreview.pixel[3] <= 110,
    `The saved composite lost the blue raster or its 40% opacity: ${bluePreview.pixel}`,
  )
  const blueThumbnail = await sampleImageAtWorld(
    recoveryWindow,
    await savedRasterPackage.readMember('preview/thumbnail.webp'),
    'image/webp',
    savedRasterPackage.manifest.preview.rect,
    197,
    204,
  )
  assert.deepEqual(
    { width: blueThumbnail.width, height: blueThumbnail.height },
    { width: 256, height: 256 },
  )
  assert.ok(
    blueThumbnail.pixel[2] > blueThumbnail.pixel[0] + 100 &&
      blueThumbnail.pixel[3] >= 80 &&
      blueThumbnail.pixel[3] <= 110,
    `The saved thumbnail lost the blue raster or its 40% opacity: ${blueThumbnail.pixel}`,
  )
  assert.equal(existsSync(externalProject), true)
  assert.deepEqual(readFileSync(externalProject), externalBytes)
  assert.equal(readdirSync(projectDir).filter((entry) => entry.endsWith('.igs')).length, 2)
  await recoveryWindow.getByRole('button', { name: `Close ${rasterTitle}` }).click()
  await recoveryWindow.getByRole('tab', { name: 'Home' }).click()
  await recoveryWindow.getByRole('button', { name: `Open ${rasterTitle}` }).click()
  const editedRaster = await recoveryWindow.evaluate(
    (id) => window.api.projects.open(id),
    rasterProject.id,
  )
  assert.equal(editedRaster.ok, true)
  assert.equal(editedRaster.value.kind, 'opened')
  assert.deepEqual(
    editedRaster.value.tab.layers.map((layer) => layer.id),
    [rasterLayerId, lowerRasterLayerId],
  )
  assert.equal(editedRaster.value.tab.layers[0].opacity, 0.4)
  assert.equal(editedRaster.value.tab.layers[0].blendMode, 'multiply')
  assert.equal(editedRaster.value.tab.layers[0].visible, true)
  assert.equal(editedRaster.value.tab.layers[0].locked, false)
  assert.equal(
    editedRaster.value.tab.generationDraft.positivePrompt.text,
    'studio portrait, red rim light',
  )
  assert.equal(editedRaster.value.tab.generationDraft.negativePrompt.text, 'soft focus, artifacts')
  assert.deepEqual(editedRaster.value.tab.generationDraft.seed, {
    policy: 'fixed',
    value: 73421,
  })
  assert.equal(editedRaster.value.tab.layers[1].visible, false)

  // Exercise the actual Layers action through preload, IPC, native-picker authorization, the
  // Python normalizer and the unsaved asset capability. The picker alone is replaced here.
  await application.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
  })
  await recoveryWindow.getByRole('button', { name: 'Import image as Raster Layer' }).click()
  const canceledImageImport = await recoveryWindow.evaluate(
    (id) => window.api.projects.open(id),
    rasterProject.id,
  )
  assert.equal(canceledImageImport.ok, true)
  assert.equal(canceledImageImport.value.tab.dirty, false)
  assert.equal(canceledImageImport.value.tab.layers.length, 2)

  await recoveryWindow.locator('input[aria-label="Generation area X"]').fill('31')
  await recoveryWindow.locator('input[aria-label="Generation area Y"]').fill('-17')
  await recoveryWindow.getByRole('button', { name: 'Apply generation area' }).click()
  await waitForOpenTab(
    recoveryWindow,
    rasterProject.id,
    (tab) => tab.primaryBbox.x === 31 && tab.primaryBbox.y === -17,
    'The import placement bbox did not reach the Project tab',
  )
  const sourceImage = path.join(externalDirectory, 'Selected image.png')
  const sourceImageBytes = readFileSync('src/main/projects/placeholders/unavailable.png')
  writeFileSync(sourceImage, sourceImageBytes)
  await application.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] })
  }, sourceImage)
  await recoveryWindow.getByRole('button', { name: 'Import image as Raster Layer' }).click()
  const importedImageTab = await waitForOpenTab(
    recoveryWindow,
    rasterProject.id,
    (tab) => tab.dirty && tab.layers.length === 3,
    'The selected image did not become an unsaved Raster Layer',
  )
  const importedImage = importedImageTab.layers[0]
  assert.equal(importedImage.name, 'Selected image')
  assert.deepEqual(importedImageTab.primaryBbox, {
    height: 1024,
    width: 1024,
    x: 31,
    y: -17,
  })
  assert.equal(importedImage.transform.x, 31)
  assert.equal(importedImage.transform.y, -17)
  assert.deepEqual(
    importedImageTab.layers.slice(1).map((layer) => layer.id),
    [rasterLayerId, lowerRasterLayerId],
  )
  const stagedImageSize = await recoveryWindow.evaluate(
    async (url) =>
      await new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve({ height: image.naturalHeight, width: image.naturalWidth })
        image.onerror = () => reject(new Error('The unsaved imported raster did not load.'))
        image.src = url
      }),
    importedImage.imageUrl,
  )
  assert.deepEqual(stagedImageSize, { height: 512, width: 512 })
  await recoveryWindow.waitForFunction(() => {
    const host = document.querySelector('.canvas-area')
    const canvas = document.querySelector('[aria-label="Project Canvas"] canvas')
    if (!(host instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) return false
    // The imported 512px image reaches x=543, while the prior visible raster ends at x=397.
    // Sample world (450,300): inside the imported layer, outside every old visible layer.
    const bounds = { left: -3, right: 543, top: -17, bottom: 495 }
    const scale = Math.min(
      1,
      (host.clientWidth - 128) / (bounds.right - bounds.left),
      (host.clientHeight - 128) / (bounds.bottom - bounds.top),
    )
    const screenX = host.clientWidth / 2 + (450 - (bounds.left + bounds.right) / 2) * scale
    const screenY = host.clientHeight / 2 + (300 - (bounds.top + bounds.bottom) / 2) * scale
    const pixel = canvas
      .getContext('2d')
      .getImageData(
        Math.round((screenX * canvas.width) / host.clientWidth),
        Math.round((screenY * canvas.height) / host.clientHeight),
        1,
        1,
      ).data
    return pixel[3] > 200
  })
  const importedSelection = recoveryWindow.getByRole('button', { name: 'Select Selected image' })
  await importedSelection.waitFor()
  assert.equal(await importedSelection.getAttribute('aria-pressed'), 'true')
  assert.deepEqual(
    readFileSync(sourceImage),
    sourceImageBytes,
    'Import must leave the source unchanged',
  )

  await recoveryWindow.getByRole('button', { name: 'Save Project' }).click()
  await waitForOpenTab(
    recoveryWindow,
    rasterProject.id,
    (tab) => !tab.dirty && tab.layers[0]?.id === importedImage.id,
    'Save did not commit the imported Raster Layer',
  )
  const packageWithImage = (
    await Promise.all(
      readdirSync(projectDir)
        .filter((entry) => entry.endsWith('.igs'))
        .map((entry) => readIgsPackage(path.join(projectDir, entry))),
    )
  ).find((candidate) => candidate.project.title === rasterTitle)
  assert.ok(packageWithImage)
  assert.equal(packageWithImage.project.layers[0].id, importedImage.id)
  assert.equal(packageWithImage.project.layers[0].asset.width, 512)
  assert.equal(packageWithImage.project.layers[0].asset.height, 512)
  assert.equal(packageWithImage.manifest.preview.status, 'rendered')
  assert.deepEqual(packageWithImage.manifest.preview.rect, {
    x: -3,
    y: -17,
    width: 546,
    height: 512,
  })
  const mergedWithImage = await packageWithImage.readMember('preview/merged.png')
  const importedPreviewPixel = await sampleImageAtWorld(
    recoveryWindow,
    mergedWithImage,
    'image/png',
    packageWithImage.manifest.preview.rect,
    450,
    300,
  )
  assert.deepEqual(
    { width: importedPreviewPixel.width, height: importedPreviewPixel.height },
    { width: 546, height: 512 },
  )
  const normalizedAssetPath = path.join(externalDirectory, 'normalized-import.png')
  await packageWithImage.extractMemberToFile(
    packageWithImage.project.layers[0].asset.path,
    normalizedAssetPath,
  )
  assert.equal(
    createHash('sha256').update(readFileSync(normalizedAssetPath)).digest('hex'),
    packageWithImage.project.layers[0].asset.sha256,
  )
  const importedSourcePixel = await sampleImageAtWorld(
    recoveryWindow,
    readFileSync(normalizedAssetPath),
    'image/png',
    { x: 31, y: -17, width: 512, height: 512 },
    450,
    300,
  )
  assert.deepEqual(
    importedPreviewPixel.pixel,
    importedSourcePixel.pixel,
    'The saved composite must contain the imported layer at its world position.',
  )
  const rasterOnlyPixel = await sampleImageAtWorld(
    recoveryWindow,
    mergedWithImage,
    'image/png',
    packageWithImage.manifest.preview.rect,
    20,
    200,
  )
  assert.ok(
    rasterOnlyPixel.pixel[2] > rasterOnlyPixel.pixel[0] + 100 &&
      rasterOnlyPixel.pixel[3] >= 80 &&
      rasterOnlyPixel.pixel[3] <= 110,
    `The saved composite lost the raster outside the imported image: ${rasterOnlyPixel.pixel}`,
  )
  await recoveryWindow.getByRole('button', { name: `Close ${rasterTitle}` }).click()
  await recoveryWindow.getByRole('tab', { name: 'Home' }).click()
  await recoveryWindow.getByRole('button', { name: `Open ${rasterTitle}` }).click()
  const reopenedWithImage = await recoveryWindow.evaluate(
    (id) => window.api.projects.open(id),
    rasterProject.id,
  )
  assert.equal(reopenedWithImage.ok, true)
  assert.equal(reopenedWithImage.value.tab.layers[0].id, importedImage.id)
  assert.equal(reopenedWithImage.value.tab.primaryBbox.x, 31)
  assert.equal(reopenedWithImage.value.tab.primaryBbox.y, -17)
  const rejectedImage = path.join(externalDirectory, 'Invalid image.png')
  writeFileSync(rejectedImage, 'This is not a PNG image.')
  await application.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] })
  }, rejectedImage)
  await recoveryWindow.getByRole('button', { name: 'Import image as Raster Layer' }).click()
  await recoveryWindow.getByText('Project action failed').waitFor()
  const afterRejectedImage = await recoveryWindow.evaluate(
    (id) => window.api.projects.open(id),
    rasterProject.id,
  )
  assert.equal(afterRejectedImage.ok, true)
  assert.equal(afterRejectedImage.value.tab.dirty, false)
  assert.deepEqual(
    afterRejectedImage.value.tab.layers.map((layer) => layer.id),
    reopenedWithImage.value.tab.layers.map((layer) => layer.id),
  )
  await recoveryWindow.getByRole('button', { name: `Close ${rasterTitle}` }).click()
  console.log(
    'Desktop smoke passed: Project/image import, Raster controls, canvas pixels and Save/reopen through IPC.',
  )

  await recoveryWindow.getByRole('tab', { name: 'Home' }).click()
  await recoveryWindow.getByRole('button', { name: `Open ${rasterTitle}` }).click()
  await recoveryWindow
    .getByRole('textbox', { name: 'Positive prompt' })
    .fill('saved during native window close')
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 0
  })
  const nativeWindowClosed = recoveryWindow.waitForEvent('close', { timeout: 20_000 })
  await application.evaluate(({ app }) => {
    setTimeout(() => app.quit(), 0)
  })
  await nativeWindowClosed
  const nativeClosedPackages = await Promise.all(
    readdirSync(projectDir)
      .filter((entry) => entry.endsWith('.igs'))
      .map((entry) => readIgsPackage(path.join(projectDir, entry))),
  )
  assert.equal(
    nativeClosedPackages.find((candidate) => candidate.project.title === rasterTitle)?.project
      .generationDraft.positivePrompt.text,
    'saved during native window close',
  )
  console.log(
    'Desktop smoke passed: native window close flushes and saves the latest Project draft.',
  )
  application = undefined
  const runtimeDir = path.join(dataRoot, 'data', 'imagegen-studio', 'runtime')
  const outside = path.join(dataRoot, 'outside')
  rmSync(runtimeDir, { force: true, recursive: true })
  mkdirSync(outside)
  symlinkSync(outside, runtimeDir)

  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env: environment })
  const damagedWindow = await application.firstWindow()
  await damagedWindow.getByRole('tab', { name: 'Home' }).waitFor()
  const damagedStatus = await damagedWindow.evaluate(() => window.api.runtime.getStatus())
  assert.equal(damagedStatus.ok, true)
  assert.equal(damagedStatus.value.kind, 'needs-repair')
  assert.deepEqual(readdirSync(outside), [])
  console.log(
    'Desktop smoke passed: damaged runtime storage still opens Home and exposes repair state.',
  )
} finally {
  secondProcess?.kill()
  // A failed assertion can leave a dirty tab behind and a native close dialog waiting for input.
  // Stop this disposable test instance directly so cleanup never turns into a UI deadlock.
  application?.process().kill('SIGKILL')
  rmSync(dataRoot, { force: true, recursive: true })
}
