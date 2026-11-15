/**
 * Finite built Main model-install shutdown qualification. ROOT owns execution/retention.
 * pnpm exec tsx scripts/smoke-model-install-shutdown.mjs --report-file ABSOLUTE_NEW_REPORT
 * Run under MemoryMax<=4GiB, zero swap, RuntimeMaxSec<=600. Native scopes use the same4GiB
 * ceiling and a120s deadline. No ML, real CivitAI token, live network or app installer is used.
 *
 * Invoke4875d965 model_install_default.py:stop, download_default.py:stop and callers
 * model_manager_default.py:stop -> invoker.py:stop -> dependencies.py:shutdown are the source
 * for the production drain. This helper observes that actual built consumer. An isolated copy
 * adds one declaration exposing its existing owners; no coordinator/shutdown method is stubbed.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, realpathSync, symlinkSync, writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron, expect } from '@playwright/test'
import Database from 'better-sqlite3'

import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import { boundQualificationProcess, confirmQualificationProcessExit } from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4)
assert.equal(process.argv[2], '--report-file')
const reportFile = process.argv[3]
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Never overwrite another run.')
const evidenceRoot = path.dirname(reportFile)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const relative = path.relative(artifactRoot, evidenceRoot)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
assert.equal(realpathSync(evidenceRoot), evidenceRoot)
assert.ok(lstatSync(evidenceRoot).isDirectory() && !lstatSync(evidenceRoot).isSymbolicLink())
const temporaryRoot = os.tmpdir()
const temporaryRelative = path.relative(artifactRoot, temporaryRoot)
assert.ok(temporaryRelative && !temporaryRelative.startsWith('..') && !path.isAbsolute(temporaryRelative))
assert.equal(realpathSync(temporaryRoot), temporaryRoot)
assert.equal(lstatSync(temporaryRoot).isSymbolicLink(), false)
const mutation = process.env.IMAGEGEN_MODEL_SHUTDOWN_MUTATION ?? null
assert.ok(mutation === null || mutation === 'skip-model-drain')
const repo = process.cwd()
const execute = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashes = (files) => Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const payload = mkdtempSync(path.join(evidenceRoot, 'native-model-install-shutdown-'))
const appData = path.join(payload, 'data/imagegen-studio')
mkdirSync(appData, { recursive: true, mode: 0o700 })
cpSync(path.join(repo, 'dist'), path.join(payload, 'dist'), { recursive: true })
copyFileSync(path.join(repo, 'package.json'), path.join(payload, 'package.json'))
// Existing dev/runtime dependencies are referenced read-only, never copied/rebuilt or removed.
symlinkSync(path.join(repo, 'node_modules'), path.join(payload, 'node_modules'), 'dir')
const entry = path.join(payload, 'dist/main/main.cjs')
const sourceMain = readFileSync(entry, 'utf8')
const construction = /    const installCoordinator = new ModelInstallCoordinator\(\n      modelRepository,\n      modelService,\n      new ModelDownloader\(\),\n      paths\.dataRoot\n    \);/g
const constructorMatches = [...sourceMain.matchAll(construction)]
assert.equal(constructorMatches.length, 1, 'The declaration-only capture must match one real construction.')
const capture = '\n    globalThis.__igsModelInstallShutdownOwners = { installCoordinator, modelService, modelRepository, database };'
let instrumentedMain = sourceMain.replace(construction, (original) => original + capture)
assert.equal(instrumentedMain.replace(capture, ''), sourceMain)
const mutationNeedle = 'modelInstalls: installCoordinator,'
if (mutation) {
  assert.equal(instrumentedMain.split(mutationNeedle).length, 2, 'Mutation must reach the actual Main dependency.')
  instrumentedMain = instrumentedMain.replace(mutationNeedle, 'modelInstalls: null,')
}
writeFileSync(entry, instrumentedMain)
const sourceFiles = [
  'package.json',
  'scripts/smoke-model-install-shutdown.mjs', 'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs', 'src/main/index.ts',
  'src/main/projects/generation-app-shutdown.ts', 'src/main/models/model-install-coordinator.ts',
  'src/main/models/model-downloader.ts', 'src/main/models/model-service.ts',
  'src/main/models/model-repository.ts', 'src/main/models/civitai-client.ts',
  'src/main/db/database.ts', 'src/preload/index.ts', 'src/shared/api.ts',
]
const bundleFiles = [
  'dist/main/main.cjs', 'dist/preload/preload.cjs', 'dist/renderer/index.html',
  ...readdirSync('dist/renderer/assets').filter((name) => /\.(?:js|css)$/.test(name)).map((name) => `dist/renderer/assets/${name}`),
]
const report = {
  outcome: 'running', startedAt: new Date().toISOString(), payloads: [payload],
  sourceSha256: hashes(sourceFiles), bundleSha256: hashes(bundleFiles), mutation,
  capture: { declarationOnly: true, originalMainSha256: digest(Buffer.from(sourceMain)), capturedMainSha256: digest(Buffer.from(instrumentedMain)), constructorMatches: 1, capture, mutationNeedle: mutation ? mutationNeedle : null },
  boundary: 'Actual copied built Main/preload/renderer, real model coordinator/repository/SQLite/downloader and app close barrier. One declaration-only owner capture is instrumented in the isolated bundle. Token/source metadata and DNS/HTTP body are controlled nondeterministic ports. Native close dialog choice is controlled and its actual options recorded. This is not pristine/fused AppImage, real CivitAI, ML, installer or public release qualification.',
  checks: [], nativeClosures: [], resourceChecks: [], sourceBasis: {
    invokeRevision: '4875d96531ca6712b288f6e660fcbb34143408c1',
    paths: ['invokeai/app/services/model_install/model_install_default.py:stop', 'invokeai/app/services/download/download_default.py:stop', 'invokeai/app/services/model_manager/model_manager_default.py:stop', 'invokeai/app/services/invoker.py:stop', 'invokeai/app/api/dependencies.py:shutdown'],
  },
  pageErrors: [], vueWarnings: [], screenshots: [],
}
let application = null
let window = null
let currentLifetime = null
const persist = () => writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
const check = (name, data = {}) => { report.checks.push({ name, ...data }); persist(); console.log(`PASS ${name}`) }
persist()

function seconds(value) {
  const text = value.replace(/\s+/g, '')
  const token = /(\d+(?:\.\d+)?)(us|ms|min|s|h|d)/g
  if (text === '0') return 0
  assert.equal(text.replace(token, ''), '')
  const scale = { us: 0.000001, ms: 0.001, s: 1, min: 60, h: 3600, d: 86400 }
  return [...text.matchAll(token)].reduce((sum, match) => sum + Number(match[1]) * scale[match[2]], 0)
}

async function launcherProof() {
  const group = readFileSync('/proc/self/cgroup', 'utf8').trim().split('\n').find((line) => line.startsWith('0::'))?.slice(3)
  assert.ok(group?.startsWith('/') && group !== '/')
  const memoryMax = readFileSync(`/sys/fs/cgroup${group}/memory.max`, 'utf8').trim()
  assert.match(memoryMax, /^\d+$/)
  assert.ok(BigInt(memoryMax) <= 4n * 1024n ** 3n)
  assert.equal(readFileSync(`/sys/fs/cgroup${group}/memory.swap.max`, 'utf8').trim(), '0')
  const { stdout } = await execute('systemctl', ['--user', 'show', '--property=ControlGroup,RuntimeMaxUSec,TimeoutStopUSec,KillMode', path.basename(group)], { timeout: 10_000, maxBuffer: 16 * 1024 })
  const properties = Object.fromEntries(stdout.trim().split('\n').map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)] }))
  assert.equal(properties.ControlGroup, group)
  assert.equal(properties.KillMode, 'control-group')
  assert.ok(seconds(properties.RuntimeMaxUSec) > 0 && seconds(properties.RuntimeMaxUSec) <= 600)
  assert.ok(seconds(properties.TimeoutStopUSec) <= 90)
  return { group, memoryMax, swapMax: '0', properties }
}

async function bound(label) {
  const proof = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds: 120,
    execute: (file, args, options) => execute(file, args.map((value) => value === 'MemoryMax=12G' ? 'MemoryMax=4G' : value), options),
  })
  for (const group of proof.groups) { assert.ok(BigInt(group.memoryMax) <= 4n * 1024n ** 3n); assert.equal(group.swapMax, '0') }
  currentLifetime.nativeChecks.push(proof)
  report.resourceChecks.push({ label, ...proof })
  persist()
}

async function launch(label) {
  const env = { ...process.env, NODE_ENV: 'test', CUDA_VISIBLE_DEVICES: '', XDG_CONFIG_HOME: path.join(payload, 'config'), XDG_DATA_HOME: path.join(payload, 'data'), XDG_CACHE_HOME: path.join(payload, 'cache') }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'IMAGEGEN_DEV_SERVER_URL', 'IMAGEGEN_TEST_IMAGE_WORKER', 'NODE_OPTIONS']) delete env[key]
  currentLifetime = { label, nativeChecks: [], normalPhysicalExit: false, forcedCleanup: false }
  application = await electron.launch({ args: ['--ozone-platform=x11', payload], cwd: repo, env, timeout: 30_000 })
  const child = application.process()
  currentLifetime.pid = child.pid
  currentLifetime.exit = new Promise((resolve) => child.once('exit', (code, signal) => { currentLifetime.closed = { code, signal }; resolve({ code, signal }) }))
  await bound(`${label}: launch`)
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(10_000)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  window.on('console', (message) => { if (message.text().includes('[Vue warn]')) report.vueWarnings.push(message.text()) })
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await window.waitForFunction(() => typeof window.api?.models?.startInstall === 'function')
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  assert.equal(await application.evaluate(() => Boolean(globalThis.__igsModelInstallShutdownOwners?.installCoordinator)), true)
  check(`${label}: actual copied built Main, preload and renderer are ready without ML`)
}

async function rawApi(scope, method, ...args) {
  return await window.evaluate(({ scope, method, args }) => globalThis.api[scope][method](...args), { scope, method, args })
}
async function api(scope, method, ...args) {
  const result = await rawApi(scope, method, ...args)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}

function projectWitness() {
  const directory = path.join(appData, 'workspaces/Uncategorized')
  assert.equal(realpathSync(directory), directory)
  const names = readdirSync(directory).filter((name) => name.endsWith('.igs'))
  assert.equal(names.length, 1)
  const filename = path.join(directory, names[0])
  assert.ok(lstatSync(filename).isFile() && !lstatSync(filename).isSymbolicLink())
  return { filename, sizeBytes: lstatSync(filename).size, sha256: digest(readFileSync(filename)) }
}

async function createProject() {
  await window.getByRole('button', { name: 'New Project', exact: true }).first().click()
  const modal = window.getByRole('dialog', { name: 'New Project', exact: true })
  await expect(modal).toBeVisible()
  await modal.locator('input[aria-label="Project name"]').fill('Owned installer shutdown')
  await modal.getByRole('button', { name: 'Create Project', exact: true }).click()
  await expect(window.getByRole('tab', { name: 'Owned installer shutdown', exact: true })).toBeVisible()
  const listed = await api('projects', 'list')
  assert.equal(listed.length, 1)
  const result = { project: listed[0], bytes: projectWitness() }
  assert.equal(result.project.health, 'ready')
  check('Explicit built UI Create saves its own empty Project before resource work', result)
  return result
}

async function installControlledPorts() {
  const telemetry = path.join(payload, 'first-main-telemetry.json')
  await application.evaluate(({ app, dialog }, { telemetry }) => {
    const owners = globalThis.__igsModelInstallShutdownOwners
    const fs = process.getBuiltinModule('node:fs')
    const crypto = process.getBuiltinModule('node:crypto')
    const body = Buffer.alloc(256, 71)
    const fakeToken = 'imagegen-owned-shutdown-qualification-not-an-account-token'
    const state = {
      metadataRequests: [], transportCalls: 0, chunks: 0, cancelEntered: false, cancelSettled: false,
      dialogs: [], choice: 'cancel', errors: [], dbCloseEntered: false, dbCloseSettled: false,
      dbCloseRows: null, dbCloseWhileCancelPending: false, sourcePortRestored: false,
    }
    const saved = {
      requireToken: owners.modelService.requireToken,
      metadata: owners.modelService.civitai.transport,
      transport: owners.installCoordinator.downloader.transport,
      resolve: owners.installCoordinator.downloader.resolveAddresses,
      dialog: dialog.showMessageBoxSync,
      error: dialog.showErrorBox,
      close: owners.database.close,
    }
    const persistState = () => fs.writeFileSync(telemetry, JSON.stringify(state, null, 2) + '\n')
    let releaseCancel
    const canceled = new Promise((resolve) => { releaseCancel = resolve })
    let streamController
    let offset = 0
    owners.modelService.requireToken = async () => fakeToken
    owners.modelService.civitai.transport = async (input, options) => {
      const url = new URL(String(input))
      if (url.origin !== 'https://civitai.com' || new Headers(options.headers).get('authorization') !== `Bearer ${fakeToken}`) throw new Error('Unexpected controlled metadata source/token.')
      state.metadataRequests.push(url.pathname)
      const model = /^\/api\/v1\/models\/(42|43)$/.exec(url.pathname)
      const version = /^\/api\/v1\/model-versions\/(7|8)$/.exec(url.pathname)
      let value = { id: 1 }
      if (model) {
        const id = Number(model[1]), versionId = id === 42 ? 7 : 8
        value = { id, modelVersions: [{ baseModel: 'Any', id: versionId, name: 'Exact' }], name: `Owned shutdown upscaler ${id}`, type: 'Upscaler' }
      } else if (version) {
        const id = Number(version[1]), modelId = id === 7 ? 42 : 43, fileId = id * 100 + 1
        value = { baseModel: 'Any', id, images: [], modelId, name: 'Exact', files: [{ downloadUrl: `https://civitai.com/api/download/models/${id}?fileId=${fileId}`, hashes: { SHA256: crypto.createHash('sha256').update(body).digest('hex') }, id: fileId, metadata: { format: 'PickleTensor' }, name: 'owned-shutdown.pth', primary: true, sizeKB: body.length / 1024 }] }
      }
      persistState()
      return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
    }
    owners.installCoordinator.downloader.resolveAddresses = async () => ['1.1.1.1']
    owners.installCoordinator.downloader.transport = async (input, options) => {
      const url = new URL(String(input))
      if (url.origin !== 'https://civitai.com' || !/^\/api\/download\/models\/(7|8)$/.test(url.pathname) || new Headers(options.headers).get('authorization') !== `Bearer ${fakeToken}`) throw new Error('Unexpected controlled body source/token.')
      state.transportCalls++
      const stream = new ReadableStream({
        start(controller) {
          streamController = controller
          offset = 64
          state.chunks++
          controller.enqueue(body.subarray(0, offset))
          persistState()
        },
        async cancel() {
          state.cancelEntered = true
          persistState()
          await canceled
          state.cancelSettled = true
          persistState()
        },
      })
      return new Response(stream, { headers: { 'content-length': String(body.length), 'content-type': 'application/octet-stream' } })
    }
    dialog.showMessageBoxSync = (_window, options) => {
      state.dialogs.push(structuredClone(options))
      persistState()
      if (options.message !== 'Close ImageGen Studio?') throw new Error('Unexpected native close dialog.')
      return state.choice === 'cancel' ? options.cancelId : 0
    }
    dialog.showErrorBox = (title, content) => { state.errors.push({ title, content }); persistState() }
    owners.database.close = async () => {
      state.dbCloseEntered = true
      state.dbCloseWhileCancelPending = state.cancelEntered && !state.cancelSettled
      state.dbCloseRows = await owners.modelRepository.listInstallJobs()
      persistState()
      await saved.close.call(owners.database)
      state.dbCloseSettled = true
      persistState()
    }
    app.on('will-quit', () => {
      owners.modelService.requireToken = saved.requireToken
      owners.modelService.civitai.transport = saved.metadata
      owners.installCoordinator.downloader.transport = saved.transport
      owners.installCoordinator.downloader.resolveAddresses = saved.resolve
      dialog.showMessageBoxSync = saved.dialog
      dialog.showErrorBox = saved.error
      owners.database.close = saved.close
      state.sourcePortRestored = owners.modelService.requireToken === saved.requireToken && owners.modelService.civitai.transport === saved.metadata && owners.installCoordinator.downloader.transport === saved.transport && owners.installCoordinator.downloader.resolveAddresses === saved.resolve && dialog.showMessageBoxSync === saved.dialog && owners.database.close === saved.close
      persistState()
    })
    globalThis.__igsModelShutdownProbe = {
      state,
      confirm: () => { state.choice = 'confirm'; persistState() },
      releaseCancel: () => releaseCancel(),
      pushChunk: () => {
        const end = Math.min(offset + 64, body.length - 1)
        streamController.enqueue(body.subarray(offset, end))
        offset = end
        state.chunks++
        persistState()
      },
    }
    persistState()
  }, { telemetry })
  return telemetry
}

function readTelemetry(filename) { return JSON.parse(readFileSync(filename, 'utf8')) }
function staging() {
  const directory = path.join(appData, 'models/.staging')
  assert.equal(realpathSync(directory), directory)
  return readdirSync(directory).map((name) => {
    const filename = path.join(directory, name), info = lstatSync(filename)
    assert.ok(info.isFile() && !info.isSymbolicLink())
    return { name, sizeBytes: info.size }
  })
}

async function requestNativeClose() {
  await application.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close() })
}

async function observeNormalExit(label) {
  const lifetime = currentLifetime
  const result = await Promise.race([
    lifetime.exit,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('Normal physical app exit exceeded30000ms.')), 30_000)
      lifetime.exit.finally(() => clearTimeout(timer))
    }),
  ])
  assert.equal(result.code, 0)
  assert.equal(result.signal, null)
  const proof = await confirmQualificationProcessExit(lifetime.nativeChecks)
  assert.equal(proof.confirmed, true)
  lifetime.normalPhysicalExit = true
  report.nativeClosures.push({ label, pid: lifetime.pid, closed: result, normalPhysicalExit: true, forcedCleanup: false, ...proof })
  application = null
  window = null
  persist()
}

function inspectStore(label) {
  const filename = path.join(appData, 'database/app.sqlite')
  const database = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    assert.equal(database.pragma('integrity_check', { simple: true }), 'ok')
    const names = database.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({ name }) => name)
    const table = names.find((name) => /model_install_jobs?$/.test(name))
    assert.ok(table, JSON.stringify(names))
    const jobs = database.prepare(`SELECT * FROM "${table}" ORDER BY id`).all()
    const migrations = database.prepare('SELECT name,sha256 FROM schema_migrations ORDER BY name').all()
    assert.equal(migrations.length, 30)
    const retained = path.join(payload, `${label}.sqlite`)
    copyFileSync(filename, retained)
    return { jobs, migrations, integrity: 'ok', retained, sha256: digest(readFileSync(retained)), staging: staging() }
  } finally { database.close() }
}

let failure = null
let semantic = null
try {
  report.launcher = await launcherProof()
  await launch('first')
  assert.deepEqual(await api('models', 'getInstallJobs'), [])
  const originalProject = await createProject()
  report.project = originalProject
  const telemetryFile = await installControlledPorts()
  const preview = await api('models', 'previewImport', 'https://civitai.com/models/42?modelVersionId=7')
  const otherPreview = await api('models', 'previewImport', 'https://civitai.com/models/43?modelVersionId=8')
  assert.equal(preview.kind, 'select-file')
  assert.equal(otherPreview.kind, 'select-file')
  const running = await api('models', 'startInstall', preview.previewId, 701, false)
  await expect.poll(async () => (await api('models', 'getInstallJobs')).find((job) => job.id === running.id)?.bytesDownloaded).toBeGreaterThan(0)
  const queued = await api('models', 'startInstall', otherPreview.previewId, 801, false)
  await expect.poll(async () => (await api('models', 'getInstallJobs')).find((job) => job.id === queued.id)?.status).toBe('waiting')
  assert.equal(readTelemetry(telemetryFile).transportCalls, 1)
  check('Public preview/start reaches real coordinator and downloader; second exact file stays queued', { running, queued, staging: staging() })

  await requestNativeClose()
  await expect.poll(() => readTelemetry(telemetryFile).dialogs.length).toBe(1)
  await expect.poll(() => window.getByRole('tab', { name: 'Owned installer shutdown', exact: true }).isVisible()).toBe(true)
  const canceledClose = readTelemetry(telemetryFile)
  assert.match(canceledClose.dialogs[0].detail, /model installation/i)
  assert.equal(canceledClose.cancelEntered, false)
  assert.equal(canceledClose.dbCloseEntered, false)
  const beforeSize = staging()[0]?.sizeBytes
  await application.evaluate(() => globalThis.__igsModelShutdownProbe.pushChunk())
  await expect.poll(() => staging()[0]?.sizeBytes).toBeGreaterThan(beforeSize)
  assert.equal((await api('models', 'getInstallJobs')).find((job) => job.id === queued.id).status, 'waiting')
  assert.equal(readTelemetry(telemetryFile).transportCalls, 1)
  const image = path.join(payload, 'after-canceled-close.png')
  await window.screenshot({ path: image })
  report.screenshots.push(image)
  check('Native close warning Cancel preserves active transfer, queued job, SQLite and own Project', { dialog: canceledClose.dialogs[0], stagingAfterNextRealChunk: staging() })

  await application.evaluate(() => globalThis.__igsModelShutdownProbe.confirm())
  await bound('first: before confirmed native close')
  await requestNativeClose()
  await expect.poll(() => {
    const state = readTelemetry(telemetryFile)
    return state.cancelEntered ? 'cancel-cleanup' : state.dbCloseEntered ? 'early-db-close' : 'pending'
  }).not.toBe('pending')
  const pending = readTelemetry(telemetryFile)
  if (pending.cancelEntered && !pending.dbCloseEntered) {
    const visibleJobs = await api('models', 'getInstallJobs')
    const refused = await rawApi('models', 'startInstall', otherPreview.previewId, 801, false)
    assert.equal(refused.ok, false)
    assert.equal(refused.error.code, 'MODEL_APP_CLOSING')
    assert.equal(staging().length, 1)
    assert.equal(window.isClosed(), false)
    check('Confirmed close waits for real downloader cancel cleanup with SQLite still readable and new mutation refused', { visibleJobs, refused, pending, staging: staging() })
    await application.evaluate(() => globalThis.__igsModelShutdownProbe.releaseCancel())
  }
  await observeNormalExit('first')
  const firstFinal = readTelemetry(telemetryFile)
  const firstStore = inspectStore('after-first-normal-close')
  report.firstFinal = firstFinal
  report.firstStore = firstStore
  assert.deepEqual(projectWitness(), originalProject.bytes)
  semantic = {
    dbClosedWhileCancelPending: firstFinal.dbCloseWhileCancelPending,
    canceledCleanupSettled: firstFinal.cancelSettled,
    rowsAtCloseTerminal: Array.isArray(firstFinal.dbCloseRows) && firstFinal.dbCloseRows.every((job) => ['canceled', 'completed', 'failed'].includes(job.status)),
    bothOwnJobsCanceled: firstStore.jobs.filter((job) => [running.id, queued.id].includes(job.id)).length === 2 && firstStore.jobs.filter((job) => [running.id, queued.id].includes(job.id)).every((job) => job.status === 'canceled'),
    noStaging: firstStore.staging.length === 0,
  }
  report.semantic = semantic
  persist()

  await launch('restarted')
  const reopened = await api('projects', 'open', originalProject.project.id)
  assert.equal(reopened.kind, 'opened')
  assert.deepEqual(projectWitness(), originalProject.bytes)
  const restartedJobs = await api('models', 'getInstallJobs')
  report.restartedJobs = restartedJobs
  check('Normal restarted Main preserves Project and reads durable installer terminal rows without reinstalling', { restartedJobs, project: projectWitness() })
  await application.evaluate(({ dialog }) => { dialog.showMessageBoxSync = (_window, options) => options.defaultId === 1 ? 0 : options.defaultId ?? 0 })
  await bound('restarted: before normal close')
  await requestNativeClose()
  await observeNormalExit('restarted')
  report.restartedStore = inspectStore('after-restarted-normal-close')
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256)
  assert.deepEqual(hashes(bundleFiles), report.bundleSha256)
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.vueWarnings, [])
  assert.equal(firstFinal.sourcePortRestored, true)
  // All physical exits and durable witnesses precede the semantic assertion.
  // A skipped actual Main barrier must fail on early database/terminal state,
  // not on a cleanup timeout or missing process.
  assert.equal(semantic.dbClosedWhileCancelPending, false)
  assert.equal(semantic.canceledCleanupSettled, true, 'The database must wait for the real downloader cancellation cleanup.')
  assert.equal(semantic.rowsAtCloseTerminal, true, 'SQLite must not close with active model installation rows.')
  assert.equal(semantic.bothOwnJobsCanceled, true)
  assert.equal(semantic.noStaging, true)
  report.outcome = 'PASS'
  report.completedAt = new Date().toISOString()
  persist()
} catch (error) {
  failure = error
  report.outcome = 'FAIL'
  report.failure = { message: error.message, stack: error.stack }
  if (semantic) report.semantic = semantic
  persist()
} finally {
  if (application) {
    try {
      await application.evaluate(() => globalThis.__igsModelShutdownProbe?.releaseCancel())
      await application.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 0 })
      await bound('failure cleanup: before normal close')
      await requestNativeClose()
      await observeNormalExit('failure cleanup')
    } catch (error) {
      report.cleanupFailure = { message: error.message, stack: error.stack }
      persist()
      // No forced close is relabeled as success. The bounded outer/native owner
      // controls a broken process; keep its payload and rollback data for root.
      failure ??= error
    }
  }
}
if (failure) throw failure
console.log('PASS actual built model-install shutdown, native Cancel/Confirm and two normal physical lifetimes')
