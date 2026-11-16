/**
 * Finite actual built-Main generation close-impact qualification. ROOT owns execution/retention.
 * pnpm exec tsx scripts/smoke-generation-app-close-impact.mjs --report-file ABSOLUTE_NEW_REPORT
 * Requires MemoryMax<=4GiB, zero swap, RuntimeMaxSec<=600; native scopes<=4GiB/120s.
 * No inference, runtime/model provisioning, network or application installer is used.
 *
 * Fresh Invoke4875d965: shared/database/queries/session_queue.py status_counts/_status_counts
 * -> session_queue/session_queue_default.py get_queue_status -> api/routers/session_queue.py;
 * cancel_waiting_work -> cancel_all_except_current and its router caller. The processor stop
 * owner joins worker exit before disposal. This observes Studio's existing real queue and close
 * barrier, adapting smoke-model-install-shutdown.mjs capture/resource/physical-exit guards.
 *
 * Fixture rows are inserted after real startup recovery via the captured real database. Their
 * metadata belongs to two actual closed owned Projects, but their frozen payloads are deliberately
 * unusable and have no input files. This qualifies metadata-only preview/cancellation, not job
 * admission, inference or terminal-result provenance. No queue/preview/drain method is replaced.
 * Native dialog choices are controlled and actual options recorded; no native visual claim follows.
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
assert.ok(lstatSync(temporaryRoot).isDirectory() && !lstatSync(temporaryRoot).isSymbolicLink())
const mutation = process.env.IMAGEGEN_GENERATION_CLOSE_MUTATION ?? null
assert.ok(mutation === null || mutation === 'omit-global-count')
const repo = process.cwd()
const execute = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashes = (files) => Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const payload = mkdtempSync(path.join(evidenceRoot, 'native-generation-app-close-impact-'))
const appData = path.join(payload, 'data/imagegen-studio')
mkdirSync(appData, { recursive: true, mode: 0o700 })
cpSync(path.join(repo, 'dist'), path.join(payload, 'dist'), { recursive: true })
copyFileSync(path.join(repo, 'package.json'), path.join(payload, 'package.json'))
symlinkSync(path.join(repo, 'node_modules'), path.join(payload, 'node_modules'), 'dir')
const entry = path.join(payload, 'dist/main/main.cjs')
const sourceMain = readFileSync(entry, 'utf8')
const declaration = '    generationShutdown = appShutdown;'
assert.equal(sourceMain.split(declaration).length, 2, 'Capture must reach one existing Main declaration.')
const capture = '\n    globalThis.__igsGenerationCloseImpactOwners = { queue: recoveredGeneration?.queue ?? null, database, projectService };'
let instrumentedMain = sourceMain.replace(declaration, declaration + capture)
assert.equal(instrumentedMain.replace(capture, ''), sourceMain)
const mutationNeedle = 'const unfinishedJobCount = queueCloseImpact?.unfinishedJobCount ?? 0;'
const mutatedCount = 'const unfinishedJobCount = 0;'
assert.equal(sourceMain.split(mutationNeedle).length, 2, 'The exact new Main close-count consumer must be built.')
if (mutation) {
  instrumentedMain = instrumentedMain.replace(mutationNeedle, mutatedCount)
}
assert.equal(
  mutation ? instrumentedMain.replace(capture, '').replace(mutatedCount, mutationNeedle) : instrumentedMain.replace(capture, ''),
  sourceMain,
  'Only the declaration capture and selected count mutation may change copied Main bytes.',
)
writeFileSync(entry, instrumentedMain)
const sourceFiles = [
  'package.json', 'scripts/smoke-generation-app-close-impact.mjs',
  'scripts/smoke-model-install-shutdown.mjs', 'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs', 'src/main/index.ts',
  'src/main/projects/generation-queue.ts', 'src/main/projects/generation-app-shutdown.ts',
  'src/main/projects/project-generation-close.ts', 'src/main/projects/generation-app-context.ts',
  'src/main/db/database.ts', 'src/preload/index.ts', 'src/shared/api.ts',
]
const bundleFiles = [
  'dist/main/main.cjs', 'dist/preload/preload.cjs', 'dist/renderer/index.html',
  ...readdirSync('dist/renderer/assets').filter((name) => /\.(?:js|css)$/.test(name)).map((name) => `dist/renderer/assets/${name}`),
]
const report = {
  outcome: 'running', startedAt: new Date().toISOString(), mutation, payloads: [payload],
  nativeDialogVisualQualified: false,
  sourceSha256: hashes(sourceFiles), bundleSha256: hashes(bundleFiles),
  capture: {
    declarationOnly: true, declaration, capture,
    originalMainSha256: digest(Buffer.from(sourceMain)), capturedMainSha256: digest(Buffer.from(instrumentedMain)),
    mutationNeedle: mutation ? mutationNeedle : null, mutationReplacement: mutation ? mutatedCount : null,
  },
  boundary: 'Actual isolated copied built Main/preload/renderer, recovered queue, database and native close consumer. One declaration-only owner capture; fixture metadata is inserted directly through the real database after startup recovery. Native dialog choices and error presentation are controlled and recorded. No queue/preview/drain method, inference worker or transport is mocked. Not pristine/fused AppImage, native-dialog visual, real inference, installer or public-release qualification.',
  sourceBasis: {
    invokeRevision: '4875d96531ca6712b288f6e660fcbb34143408c1',
    paths: [
      'invokeai/app/services/shared/database/queries/session_queue.py:status_counts/_status_counts/cancel_waiting_work',
      'invokeai/app/services/session_queue/session_queue_default.py:get_queue_status/cancel_all_except_current',
      'invokeai/app/api/routers/session_queue.py:get_queue_status/cancel_all_except_current',
      'invokeai/app/services/session_processor/session_processor_default.py:stop',
    ],
  },
  checks: [], nativeClosures: [], resourceChecks: [], pageErrors: [], vueWarnings: [], closeRequestErrors: [],
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
  const groups = new Map([[report.launcher.group, BigInt(report.launcher.memoryMax)]])
  for (const check of currentLifetime.nativeChecks) {
    for (const group of check.groups) groups.set(group.group, BigInt(group.memoryMax))
  }
  const aggregate = [...groups.values()].reduce((sum, value) => sum + value, 0n)
  assert.ok(aggregate <= 8n * 1024n ** 3n, 'Observed launcher/native aggregate must remain within8GiB.')
  proof.aggregateMemoryMaxBytes = String(aggregate)
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
  await window.waitForFunction(() => typeof window.api?.projects?.create === 'function')
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  assert.equal(await application.evaluate(() => typeof globalThis.__igsGenerationCloseImpactOwners?.queue?.getAppCloseImpact), 'function')
  check(`${label}: actual copied built Main, recovered queue and renderer are ready without ML`)
}

async function api(scope, method, ...args) {
  const result = await window.evaluate(({ scope, method, args }) => globalThis.api[scope][method](...args), { scope, method, args })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}

function projectWitness(filename) {
  assert.equal(realpathSync(filename), filename)
  const info = lstatSync(filename)
  assert.ok(info.isFile() && !info.isSymbolicLink())
  return { filename, sizeBytes: info.size, sha256: digest(readFileSync(filename)) }
}

async function createProject(title, closeAfterCreate) {
  const directory = path.join(appData, 'workspaces/Uncategorized')
  const before = existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith('.igs')) : []
  await window.getByRole('button', { name: 'New Project', exact: true }).first().click()
  const modal = window.getByRole('dialog', { name: 'New Project', exact: true })
  await expect(modal).toBeVisible()
  await modal.locator('input[aria-label="Project name"]').fill(title)
  await modal.getByRole('button', { name: 'Create Project', exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
  const tab = await application.evaluate((_electron, title) => globalThis.__igsGenerationCloseImpactOwners.projectService.getOpenTabs().find((tab) => tab.title === title), title)
  assert.ok(tab && !tab.dirty)
  const project = (await api('projects', 'list')).find((item) => item.title === title)
  assert.equal(project?.health, 'ready')
  const added = readdirSync(directory).filter((name) => name.endsWith('.igs') && !before.includes(name))
  assert.equal(added.length, 1)
  const bytes = projectWitness(path.join(directory, added[0]))
  if (closeAfterCreate) {
    await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
    await expect(window.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
    if (await window.getByRole('tab', { name: 'Home', exact: true }).count() === 0) {
      await window.getByRole('button', { name: 'Open Home', exact: true }).first().click()
    }
    await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
    // Removing a tab precedes the renderer's async Project-list refresh. Tab activation
    // is deliberately refused while that close action is pending; observe selection.
    await expect(async () => {
      await window.getByRole('tab', { name: 'Home', exact: true }).click()
      await expect(window.getByRole('tab', { name: 'Home', exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 500 })
    }).toPass({ timeout: 10_000 })
  }
  check(`Explicit built UI Create ${closeAfterCreate ? 'and UI clean Close' : 'leaves unrelated clean Project open'}`, { title, project, tab, bytes })
  return { title, project, tab, bytes }
}

async function installProbe(label) {
  const telemetry = path.join(payload, `${label}-main-telemetry.json`)
  await application.evaluate(({ app, dialog }, { telemetry }) => {
    const owners = globalThis.__igsGenerationCloseImpactOwners
    const fs = process.getBuiltinModule('node:fs')
    const state = { dialogs: [], choice: 'cancel', errors: [], dbCloseEntered: false, dbCloseSettled: false, rowsAtDatabaseClose: null, portsRestored: false }
    const saved = { dialog: dialog.showMessageBoxSync, error: dialog.showErrorBox, close: owners.database.close }
    const persistState = () => fs.writeFileSync(telemetry, JSON.stringify(state, null, 2) + '\n')
    dialog.showMessageBoxSync = (_window, options) => {
      state.dialogs.push({ options: structuredClone(options), choice: state.choice, at: new Date().toISOString() })
      persistState()
      if (options.message !== 'Close ImageGen Studio?') throw new Error('Unexpected native dialog.')
      return state.choice === 'cancel' ? options.cancelId : 0
    }
    dialog.showErrorBox = (title, content) => { state.errors.push({ title, content }); persistState() }
    owners.database.close = async () => {
      state.dbCloseEntered = true
      state.rowsAtDatabaseClose = await owners.database.db.selectFrom('generation_queue_item').selectAll().orderBy('id').execute()
      persistState()
      await saved.close.call(owners.database)
      state.dbCloseSettled = true
      persistState()
    }
    app.on('will-quit', () => {
      dialog.showMessageBoxSync = saved.dialog
      dialog.showErrorBox = saved.error
      owners.database.close = saved.close
      state.portsRestored = dialog.showMessageBoxSync === saved.dialog && dialog.showErrorBox === saved.error && owners.database.close === saved.close
      persistState()
    })
    globalThis.__igsGenerationCloseImpactProbe = {
      confirm: () => { state.choice = 'confirm'; persistState() },
      snapshot: async () => {
        const tables = await owners.database.db.selectFrom('sqlite_master').select('name').where('type', '=', 'table').orderBy('name').execute()
        const result = {}
        for (const { name } of tables) {
          const rows = await owners.database.db.selectFrom(name).selectAll().execute()
          result[name] = rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
        }
        return result
      },
    }
    persistState()
  }, { telemetry })
  return telemetry
}

async function seedMetadata(closedOrdinary, closedPrivate) {
  return await application.evaluate(async (_electron, { closedOrdinary, closedPrivate }) => {
    const owners = globalThis.__igsGenerationCloseImpactOwners
    const crypto = process.getBuiltinModule('node:crypto')
    const now = new Date().toISOString()
    const metadata = (project, operation, status, sequence, marker) => ({
      id: crypto.randomUUID(), batch_id: crypto.randomUUID(), local_project_key: project.tab.id,
      canonical_project_path: project.bytes.filename, document_id: project.tab.documentId,
      document_revision: project.tab.documentRevision, staging_session_id: crypto.randomUUID(),
      operation, status, status_sequence: sequence,
      frozen_payload_json: marker, created_at: now, updated_at: now,
      started_at: status === 'pending' ? null : now, finished_at: status === 'pending' ? null : now,
      error_code: status === 'canceled' ? 'APP_RESTART' : null,
      error_message: status === 'canceled' ? 'The application closed before this job completed.' : null,
    })
    const rows = [
      metadata(closedOrdinary, 'illustrious-txt2img', 'pending', 2, '{"ownedFixture":"missing-input-files"}'),
      metadata(closedPrivate, 'illustrious-regional', 'pending', 3, 'owned-invalid-json-private-payload'),
      metadata(closedOrdinary, 'illustrious-txt2img', 'canceled', 7, 'owned-terminal-APP_RESTART-no-payload'),
      metadata(closedPrivate, 'illustrious-regional', 'completed', 11, 'owned-terminal-completed-no-payload'),
    ]
    await owners.database.db.insertInto('generation_queue_item').values(rows).execute()
    return { rows: await owners.database.db.selectFrom('generation_queue_item').selectAll().orderBy('id').execute(), impact: await owners.queue.getAppCloseImpact(), openTabs: owners.projectService.getOpenTabs() }
  }, { closedOrdinary, closedPrivate })
}

function readTelemetry(filename) { return JSON.parse(readFileSync(filename, 'utf8')) }

async function requestNativeClose() {
  try {
    await application.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close() })
  } catch (error) {
    // Normal silent close may destroy the evaluate reply. Physical exit decides its outcome.
    report.closeRequestErrors.push({ lifetime: currentLifetime.label, message: error.message })
    persist()
  }
}

/** Missing warning is an observed normal exit, never a missing-dialog timeout semantic RED. */
async function dialogOrExit(telemetry, expectedCount) {
  const lifetime = currentLifetime
  return await new Promise((resolve, reject) => {
    let settled = false
    const finish = (value, error) => {
      if (settled) return
      settled = true
      clearInterval(interval)
      clearTimeout(deadline)
      if (error) reject(error)
      else resolve(value)
    }
    const interval = setInterval(() => {
      try {
        if (readTelemetry(telemetry).dialogs.length >= expectedCount) finish({ kind: 'dialog' })
      } catch (error) { finish(null, error) }
    }, 25)
    const deadline = setTimeout(() => finish(null, new Error('Native close produced neither a dialog nor normal process exit within30000ms.')), 30_000)
    lifetime.exit.then((exit) => finish({ kind: 'exited', exit }))
  })
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
    const jobs = database.prepare('SELECT * FROM generation_queue_item ORDER BY id').all()
    const migrations = database.prepare('SELECT name,sha256 FROM schema_migrations ORDER BY name').all()
    const retained = path.join(payload, `${label}.sqlite`)
    copyFileSync(filename, retained)
    return { jobs, migrations, integrity: 'ok', retained, sha256: digest(readFileSync(retained)) }
  } finally { database.close() }
}

let failure = null
let semantic = null
try {
  report.launcher = await launcherProof()
  await launch('first')
  const closedOrdinary = await createProject('Owned closed ordinary queue', true)
  const closedPrivate = await createProject('Owned closed private queue', true)
  const unrelated = await createProject('Owned close impact witness', false)
  report.projects = [closedOrdinary, closedPrivate, unrelated]
  const telemetry = await installProbe('first')
  const fixture = await seedMetadata(closedOrdinary, closedPrivate)
  report.fixture = fixture
  assert.equal(fixture.rows.length, 4)
  assert.equal(fixture.openTabs.length, 1)
  assert.equal(fixture.openTabs[0].id, unrelated.tab.id)
  assert.equal(fixture.impact.unfinishedJobCount, 2)
  const databaseBefore = await application.evaluate(() => globalThis.__igsGenerationCloseImpactProbe.snapshot())
  report.databaseBeforeClose = databaseBefore
  check('Real recovered queue counts two closed-project pending rows without hydrating either invalid frozen payload', { impact: fixture.impact, rows: fixture.rows })

  await bound('first: before native close requesting Cancel')
  await requestNativeClose()
  const firstOutcome = await dialogOrExit(telemetry, 1)
  report.firstCloseOutcome = firstOutcome
  let cancelPreserved = false
  if (firstOutcome.kind === 'dialog') {
    await expect(window.getByRole('tab', { name: unrelated.title, exact: true })).toBeVisible()
    const canceled = readTelemetry(telemetry)
    const databaseAfterCancel = await application.evaluate(() => globalThis.__igsGenerationCloseImpactProbe.snapshot())
    const stillOpen = await application.evaluate(() => globalThis.__igsGenerationCloseImpactOwners.projectService.getOpenTabs())
    const stillPending = await application.evaluate(() => globalThis.__igsGenerationCloseImpactOwners.queue.getAppCloseImpact())
    assert.equal(canceled.dbCloseEntered, false)
    assert.deepEqual(databaseAfterCancel, databaseBefore)
    assert.deepEqual(stillOpen, fixture.openTabs)
    assert.equal(stillPending.unfinishedJobCount, 2)
    for (const project of report.projects) assert.deepEqual(projectWitness(project.bytes.filename), project.bytes)
    report.canceledClose = { telemetry: canceled, impact: stillPending, databaseAfterCancel, openTabs: stillOpen }
    cancelPreserved = true
    check('Native Cancel preserves all database rows, both pending jobs and three own Project files', { impact: stillPending, dialog: canceled.dialogs[0] })
    await application.evaluate(() => globalThis.__igsGenerationCloseImpactProbe.confirm())
    await bound('first: before confirmed native close')
    await requestNativeClose()
    report.confirmedCloseOutcome = await dialogOrExit(telemetry, 2)
  }
  await observeNormalExit('first')
  const firstFinal = readTelemetry(telemetry)
  const firstStore = inspectStore('after-first-normal-close')
  report.firstFinal = firstFinal
  report.firstStore = firstStore
  const pendingBefore = fixture.rows.filter((row) => row.status === 'pending')
  const terminalBefore = fixture.rows.filter((row) => row.status !== 'pending')
  const afterById = new Map(firstStore.jobs.map((row) => [row.id, row]))
  const warning = firstFinal.dialogs[0]
  semantic = {
    warnedBeforeShutdown: warning?.options.type === 'warning' && warning.options.buttons[0] === 'Cancel Jobs and Close' && warning.choice === 'cancel' && /2 unfinished generation jobs will be canceled\./.test(warning.options.detail),
    firstDialogCount: firstFinal.dialogs.length,
    cancelPreserved,
    confirmedSecondDialog: firstFinal.dialogs[1]?.choice === 'confirm',
    everyPendingCanceled: pendingBefore.every((row) => {
      const after = afterById.get(row.id)
      return after?.status === 'canceled' && after.error_code === 'USER_CANCELED' && after.error_message === 'The job was canceled.' && after.status_sequence === row.status_sequence + 1 && Boolean(after.finished_at) && after.frozen_payload_json === row.frozen_payload_json
    }),
    terminalRowsUnchanged: terminalBefore.every((row) => JSON.stringify(afterById.get(row.id)) === JSON.stringify(row)),
    rowsAtDatabaseCloseTerminal: firstFinal.rowsAtDatabaseClose?.length === 4 && firstFinal.rowsAtDatabaseClose.every((row) => ['canceled', 'completed'].includes(row.status)),
  }
  report.semantic = semantic
  for (const project of report.projects) assert.deepEqual(projectWitness(project.bytes.filename), project.bytes)
  check('First actual Main closes normally; durable queue and missing-or-present warning are recorded before semantic verdict', { firstDialogCount: firstFinal.dialogs.length, firstStore })

  await launch('restarted')
  const restartedTelemetry = await installProbe('restarted')
  await application.evaluate(() => globalThis.__igsGenerationCloseImpactProbe.confirm())
  await window.getByRole('button', { name: `Select ${unrelated.title}`, exact: true }).dblclick()
  await expect(window.getByRole('tab', { name: unrelated.title, exact: true })).toBeVisible()
  const reopened = await application.evaluate(() => globalThis.__igsGenerationCloseImpactOwners.projectService.getOpenTabs())
  assert.ok(reopened.some((tab) => tab.id === unrelated.tab.id && tab.documentId === unrelated.tab.documentId))
  for (const project of report.projects) assert.deepEqual(projectWitness(project.bytes.filename), project.bytes)
  const restarted = await application.evaluate(async () => {
    const owners = globalThis.__igsGenerationCloseImpactOwners
    return { impact: await owners.queue.getAppCloseImpact(), rows: await owners.database.db.selectFrom('generation_queue_item').selectAll().orderBy('id').execute() }
  })
  assert.equal(restarted.impact.unfinishedJobCount, 0)
  assert.deepEqual(restarted.rows, firstStore.jobs)
  report.restarted = restarted
  check('Normal restart reads the same terminal queue and reopens the unchanged unrelated Project', restarted)
  await bound('restarted: before normal close')
  await requestNativeClose()
  await observeNormalExit('restarted')
  report.restartedFinal = readTelemetry(restartedTelemetry)
  report.restartedStore = inspectStore('after-restarted-normal-close')
  assert.deepEqual(report.restartedStore.jobs, firstStore.jobs)
  assert.deepEqual(report.restartedStore.migrations, firstStore.migrations)
  for (const project of report.projects) assert.deepEqual(projectWitness(project.bytes.filename), project.bytes)
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256)
  assert.deepEqual(hashes(bundleFiles), report.bundleSha256)
  assert.equal(firstFinal.portsRestored, true)
  assert.equal(report.restartedFinal.portsRestored, true)
  assert.deepEqual(firstFinal.errors, [])
  assert.deepEqual(report.restartedFinal.errors, [])
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.vueWarnings, [])
  assert.equal(report.nativeClosures.length, 2)
  // Both normal physical exits, durable rows and restoration precede the semantic verdict.
  // omit-global-count must RED here for silently closing, never for a missing-dialog timeout.
  assert.equal(semantic.warnedBeforeShutdown, true, 'Actual Main must warn about both closed-project pending jobs before it can cancel them.')
  assert.equal(semantic.firstDialogCount, 2)
  assert.equal(semantic.cancelPreserved, true)
  assert.equal(semantic.confirmedSecondDialog, true)
  assert.equal(semantic.everyPendingCanceled, true)
  assert.equal(semantic.terminalRowsUnchanged, true)
  assert.equal(semantic.rowsAtDatabaseCloseTerminal, true)
  assert.equal(firstFinal.dbCloseSettled, true)
  assert.equal(report.restartedFinal.dbCloseSettled, true)
  assert.equal(report.restartedFinal.dialogs.length, 0, 'Terminal APP_RESTART/completed rows do not warn on a later close.')
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
      await application.evaluate(({ dialog }) => {
        globalThis.__igsGenerationCloseImpactProbe?.confirm()
        dialog.showMessageBoxSync = () => 0
      })
      await bound('failure cleanup: before normal close')
      await requestNativeClose()
      await observeNormalExit('failure cleanup')
    } catch (error) {
      report.cleanupFailure = { message: error.message, stack: error.stack }
      persist()
      // The outer/native deadline owns a broken process. Keep all payload and rollback data;
      // no forced exit is relabeled as normal and no unrelated process is touched.
      failure ??= error
    }
  }
}
if (failure) throw failure
console.log('PASS actual built global generation close impact, native Cancel/Confirm and two normal physical lifetimes')
