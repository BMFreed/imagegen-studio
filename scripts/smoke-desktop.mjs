import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron as electron } from '@playwright/test'
import electronBinary from 'electron'

const dataRoot = mkdtempSync(path.join(os.tmpdir(), 'igs-electron-smoke-'))
const environment = {
  ...process.env,
  IMAGEGEN_DEV_SERVER_URL: 'http://127.0.0.1:5174',
  NODE_ENV: 'production',
  XDG_CONFIG_HOME: path.join(dataRoot, 'config'),
  XDG_DATA_HOME: path.join(dataRoot, 'data'),
}
delete environment.ELECTRON_RUN_AS_NODE

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
  const invalidModelRequest = await window.evaluate(() => window.api.models.previewImport('file:///etc/passwd'))
  assert.equal(invalidModelRequest.ok, false)
  assert.ok(['CIVITAI_TOKEN_REQUIRED', 'TOKEN_SECURE_STORAGE_UNAVAILABLE'].includes(invalidModelRequest.error.code))
  await window.getByRole('button', { name: 'Close Model Manager' }).click()
  await window.getByRole('dialog', { name: 'Model Manager' }).waitFor({ state: 'detached' })

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
  const windows = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  assert.equal(windows, 1)
  if (secondProcess.exitCode === null) {
    await Promise.race([
      new Promise((resolve) => secondProcess.once('exit', resolve)),
      delay(5_000).then(() => {
        throw new Error('The second app process did not exit.')
      }),
    ])
  }
  console.log('Desktop smoke passed: Home, Model Manager IPC, keyboard navigation, one instance.')

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
  console.log('Desktop smoke passed: damaged runtime storage still opens Home and exposes repair state.')
} finally {
  secondProcess?.kill()
  await application?.close()
  rmSync(dataRoot, { force: true, recursive: true })
}
