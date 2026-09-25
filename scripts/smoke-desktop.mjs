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
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron as electron } from '@playwright/test'
import electronBinary from 'electron'
import { saveIgsPackage } from '../src/main/projects/igs-package.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'

const rasterPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const rasterWebp = Buffer.from(
  'UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAIAAUAmJaACdLoB+AAETAAA/q4X/0mzxNnibPkkf/OwbEu14AAA',
  'base64',
)

for (const kind of ['empty', 'unavailable']) {
  const root = path.join('dist', 'main', 'placeholders', kind)
  assert.equal(readFileSync(`${root}.png`).subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(readFileSync(`${root}.webp`).toString('ascii', 8, 12), 'WEBP')
}

const dataRoot = mkdtempSync(path.join(os.tmpdir(), 'igs-electron-smoke-'))
const environment = {
  ...process.env,
  IMAGEGEN_DEV_SERVER_URL: 'http://127.0.0.1:5174',
  NODE_ENV: 'production',
  XDG_CONFIG_HOME: path.join(dataRoot, 'config'),
  XDG_DATA_HOME: path.join(dataRoot, 'data'),
}
delete environment.ELECTRON_RUN_AS_NODE

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

  const projectTitle = 'Smoke Project'
  await window.getByRole('button', { name: 'New Project' }).first().click()
  const newProjectDialog = window.getByRole('dialog', { name: 'New Project' })
  await newProjectDialog.waitFor()
  await newProjectDialog.locator('input[aria-label="Project name"]').fill(projectTitle)
  await newProjectDialog.locator('input[aria-label="Project width"]').fill('640')
  await newProjectDialog.locator('input[aria-label="Project height"]').fill('512')
  await newProjectDialog.getByRole('button', { name: 'Create Project' }).click()
  await window.getByRole('tab', { name: projectTitle }).waitFor()

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
  await window.waitForFunction(
    async (id) => {
      const result = await window.api.projects.open(id)
      return (
        result.ok &&
        result.value.kind === 'opened' &&
        result.value.tab.dirty &&
        result.value.tab.primaryBbox.y === 96
      )
    },
    projectId,
    { timeout: 10_000 },
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
  const rasterAssetPath = `assets/layers/${rasterLayerId}.png`
  const rasterTitle = 'Raster Import Smoke'
  const rasterDocument = createEmptyProjectDocumentV1({ title: rasterTitle })
  await saveIgsPackage(externalProject, {
    assets: { [rasterAssetPath]: { bytes: rasterPng } },
    preview: {
      merged: rasterPng,
      rect: { height: 400, width: 400, x: -3, y: 4 },
      status: 'rendered',
      thumbnail: rasterWebp,
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
  assert.equal(await importDialog.getByRole('radio', { name: 'Move the file here' }).isChecked(), true)
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
  const rasterTab = await recoveryWindow.evaluate(
    (id) => window.api.projects.open(id),
    rasterProject.id,
  )
  assert.equal(rasterTab.ok, true)
  assert.equal(rasterTab.value.kind, 'opened')
  assert.equal(rasterTab.value.tab.layers.length, 1)
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
  assert.equal(existsSync(externalProject), true)
  assert.deepEqual(readFileSync(externalProject), externalBytes)
  assert.equal(readdirSync(projectDir).filter((entry) => entry.endsWith('.igs')).length, 2)
  await recoveryWindow.getByRole('button', { name: `Close ${rasterTitle}` }).click()
  console.log('Desktop smoke passed: Import Cancel/Copy and saved raster pixels through IPC.')

  await application.close()
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
