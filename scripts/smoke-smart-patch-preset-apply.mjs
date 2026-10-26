/**
 * ROOT-ONLY native qualification after a fresh build: pnpm exec tsx
 * scripts/smoke-smart-patch-preset-apply.mjs --report-file ABSOLUTE_NEW_REPORT
 *
 * Twelve finite checks. Authoring/node --check/Prettier do not qualify native behavior. Root owns
 * serial execution, screenshot inspection and all cleanup. No provisioning, ML, inference,
 * acceptance, native restart, async reply injection or cleanup by this script. Literal accepted
 * fixtures are declared inputs. Original Main handlers only pass through an invocation observer;
 * strict preload, resource verifier, document owner and Save/loader stay real. Only named product
 * directories are walked. Exact source PNGs, .igs, all autosave/input/receipt dependencies and
 * every standalone SQLite checkpoint remain independent of disposable payloads. Final database
 * retention runs after last UI action + physical exit even if another witness fails. API/target
 * copy assumptions are intentionally isolated in adapter below.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFileSync,
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
import { promisify } from 'node:util'
import { _electron as electron, expect } from '@playwright/test'
import Database from 'better-sqlite3'
import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { encodeProjectMaskPng } from '../src/main/projects/project-mask.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { ProjectShadowStore } from '../src/main/projects/project-shadow.ts'
import { literalSmartPatchColorPng } from '../src/main/projects/test-fixtures/smart-patch-input-material.ts'
import { smartPatchVariantMetadataFixture } from '../src/main/projects/test-fixtures/smart-patch-variant.ts'
import { parseSmartPatchGenerationProvenanceV1 } from '../src/shared/projects/project-schema.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4, 'Use --report-file ABSOLUTE_NEW_REPORT')
assert.equal(process.argv[2], '--report-file')
const root = realpathSync(process.cwd())
const reportFile = process.argv[3]
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Never overwrite evidence')
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const ownedRun = path.join(artifactRoot, 'runs/smart-patch-preset-apply/20261022-target')
const evidenceParent = path.dirname(reportFile)
const relativeParent = path.relative(ownedRun, evidenceParent)
assert.ok(!relativeParent.startsWith('..') && !path.isAbsolute(relativeParent))
assert.equal(realpathSync(evidenceParent), evidenceParent, 'Existing canonical parent required')
assert.ok(lstatSync(evidenceParent).isDirectory() && !lstatSync(evidenceParent).isSymbolicLink())
assert.equal(realpathSync(artifactRoot), artifactRoot)
const evidenceRoot = `${reportFile}.artifacts`
assert.equal(existsSync(evidenceRoot), false)
writeFileSync(reportFile, '{}\n', { flag: 'wx', mode: 0o600 })
mkdirSync(evidenceRoot, { mode: 0o700 })
const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'apply-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
mkdirSync(workspace, { recursive: true, mode: 0o700 })
const temporaryDirectory = mkdtempSync(path.join(artifactRoot, 'sp-ap-tmp-'))
const previousTemporaryDirectory = process.env.TMPDIR
process.env.TMPDIR = temporaryDirectory
const nativeDeadlineSeconds = 360
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const projectTitle = 'Smart preset target Project'
const roots = {
  placeholdersDir: path.join(root, 'dist/main/placeholders'),
  scratchDir: path.join(fixtureRoot, 'writer-scratch'),
}
const nativeChecks = [],
  observed = new Map()
let application, window, nativeProcess, sampler, fixture, sourceFiles, bundleFiles
let sampling = Promise.resolve(),
  lastOpenWitness,
  sourcePresets
let observerInstalled = false
const report = {
  schemaVersion: 1,
  outcome: 'running',
  startedAt: new Date().toISOString(),
  command: {
    cwd: root,
    executable: process.execPath,
    execArgv: process.execArgv,
    argv: process.argv,
  },
  evidenceRoot,
  fixtureRoot,
  payloads: [fixtureRoot, temporaryDirectory],
  checks: [],
  screenshots: [],
  snapshots: [],
  stateCheckpoints: [],
  databaseCheckpoints: [],
  witnesses: [],
  expectedActions: [],
  layoutChecks: [],
  viewportChecks: [],
  refusals: [],
  pageErrors: [],
  nativeLogs: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  boundary: {
    actual:
      'Built selected Smart Patch chooser -> shared detached Apply -> real preload/original Main/resource verifier -> one layer generationDraft history mutation; explicit UI Save, real .igs loader and close/reopen.',
    fixtures:
      'Production ProjectSession create/applyDocument/save seeds strict accepted Illustrious/Anima variant metadata, literal ICC PNGs, authored masks, distinct Project/otherPatch drafts and a nonempty seed cursor. No inference or acceptance is exercised.',
    oracle:
      'Complete durable document/assets, public history flags, every mutation IPC including seals, SQL schema/tables, exact source preset rows, package bytes, target selection and camera. Intentional navigation seals have their own witnesses.',
    limits:
      'Launcher <=2GiB/zero swap/RuntimeMaxSec<=600/TimeoutStopSec<=90/KillMode=control-group; actual native <=2GiB/zero swap/deadline<=360s; aggregate unique group limits<=4GiB; one launch.',
    excluded:
      'Async Main/renderer race matrices and forged direct DTO refusals belong to root unit suites. Selected Size/unknown-envelope public refusals stop at preload; unselected malformed Size is projected out by preload before Main. No stale-reply interception, runtime provision, installed-resource success, Generate/inference/acceptance, independent screenshot review, release or full PP readiness claim.',
    cleanup:
      'No deletion. Root retains original payloads until physical process exit, observer restoration, exact bytes and all standalone DB checkpoints/dependencies have been verified.',
  },
}
const lifecycle = {
  schemaVersion: 1,
  owner: { repository: root, task: 'smart-patch-preset-apply', run: reportFile },
  state: 'running',
  lastUsedAt: report.startedAt,
  evidence: [reportFile, evidenceRoot],
  payloads: [fixtureRoot, temporaryDirectory],
  dependsOn: [],
  usedBy: [],
  pins: [fixtureRoot, temporaryDirectory].map((file) => ({
    path: file,
    reason: 'Root disposal only after physical exit and retained dependency verification',
  })),
}
function checkpoint() {
  lifecycle.lastUsedAt = new Date().toISOString()
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  writeFileSync(
    path.join(evidenceRoot, 'artifact-lifecycle.json'),
    JSON.stringify(lifecycle, null, 2) + '\n',
    { mode: 0o600 },
  )
}
function check(name, evidence = {}) {
  assert.ok(report.checks.length < 12, 'Keep the native cut finite')
  report.checks.push({ name, ...evidence })
  checkpoint()
  console.log(`PASS ${name}`)
}

function filesBelow(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(directory, entry.name)
      assert.equal(entry.isSymbolicLink(), false, `Do not follow symlink ${file}`)
      return entry.isDirectory() ? filesBelow(file) : [file]
    })
    .sort()
}
const hashes = (files) =>
  Object.fromEntries(files.map((file) => [path.relative(root, file), digest(readFileSync(file))]))
function retain(source, relativeName) {
  const target = path.join(evidenceRoot, relativeName)
  const relative = path.relative(evidenceRoot, target)
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  assert.equal(existsSync(target), false, `Snapshot already exists: ${relativeName}`)
  assert.ok(lstatSync(source).isFile() && !lstatSync(source).isSymbolicLink())
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  copyFileSync(source, target)
  const bytes = readFileSync(source)
  assert.ok(readFileSync(target).equals(bytes), 'Retained snapshot differs from source')
  report.snapshots.push({ path: target, bytes: bytes.length, sha256: digest(bytes) })
  return target
}
function retainJson(relativeName, value) {
  const file = path.join(evidenceRoot, relativeName)
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n')
  writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 })
  report.snapshots.push({ path: file, bytes: bytes.length, sha256: digest(bytes) })
}

function withDatabase(use) {
  const database = new Database(path.join(appDataRoot, 'database/app.sqlite'), {
    readonly: true,
    fileMustExist: true,
  })
  try {
    return use(database)
  } finally {
    database.close()
  }
}
function tableRows(database, table) {
  assert.match(table, /^[a-z_0-9]+$/)
  return database
    .prepare(`SELECT * FROM "${table}"`)
    .all()
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}
function databaseState(database) {
  const schema = database
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    )
    .all()
  const tables = schema.filter(({ type }) => type === 'table').map(({ name }) => name)
  return {
    schema,
    tables: Object.fromEntries(tables.map((table) => [table, tableRows(database, table)])),
  }
}
function sourceRows() {
  return withDatabase(databaseState)
}
function dataFiles() {
  // Electron shares userData with the product and creates volatile Chromium files and
  // Singleton symlinks. Product byte witnesses enumerate only durable product owners;
  // database contents are compared independently through all SQL tables/schema.
  return [
    'autosave',
    'generation-inputs',
    'generation-prepared-inputs',
    'generation-queued-inputs',
    'generation-staging',
    'inference-resources',
    'models',
    'previews',
    'recovery',
    'runtime',
    'staging',
    'workspaces',
  ].flatMap((name) => {
    const directory = path.join(appDataRoot, name)
    if (!existsSync(directory)) return []
    const entry = lstatSync(directory)
    assert.ok(entry.isDirectory() && !entry.isSymbolicLink(), `Invalid product owner ${name}`)
    return filesBelow(directory)
  })
}
function dataHashes() {
  return Object.fromEntries(
    dataFiles().map((file) => [path.relative(appDataRoot, file), digest(readFileSync(file))]),
  )
}

function identity(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return { pid, start: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] }
  } catch (error) {
    if (['ENOENT', 'ESRCH'].includes(error.code)) return null
    throw error
  }
}
function sampleDescendants() {
  const parents = new Map()
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    try {
      const text = readFileSync(`/proc/${entry}/status`, 'utf8')
      parents.set(Number(entry), Number(text.match(/^PPid:\s+(\d+)$/m)?.[1]))
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
    }
  }
  const ids = new Set([nativeProcess.pid])
  for (let changed = true; changed;) {
    changed = false
    for (const [child, parent] of parents) {
      if (ids.has(parent) && !ids.has(child)) {
        ids.add(child)
        changed = true
      }
    }
  }
  for (const pid of ids) {
    const value = identity(pid)
    if (value) observed.set(`${pid}:${value.start}`, value)
  }
}
function launcherBound() {
  const group = readFileSync('/proc/self/cgroup', 'utf8')
    .trim()
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3)
  assert.ok(group?.startsWith('/') && group !== '/')
  const directory = `/sys/fs/cgroup${group}`
  const memoryMax = readFileSync(`${directory}/memory.max`, 'utf8').trim()
  assert.match(memoryMax, /^\d+$/)
  assert.ok(BigInt(memoryMax) <= 2n * 1024n ** 3n)
  assert.equal(readFileSync(`${directory}/memory.swap.max`, 'utf8').trim(), '0')
  return { group, memoryMax, swapMax: '0' }
}
function durationSeconds(value) {
  const text = value.replace(/\s+/g, '')
  if (text === '0') return 0
  const token = /(\d+(?:\.\d+)?)(us|ms|min|s|h|d)/g
  assert.equal(text.replace(token, ''), '', `Unrecognized duration ${value}`)
  const scale = { us: 0.000001, ms: 0.001, s: 1, min: 60, h: 3600, d: 86400 }
  return [...text.matchAll(token)].reduce(
    (sum, match) => sum + Number(match[1]) * scale[match[2]],
    0,
  )
}
async function verifyLauncherDeadline() {
  const value = launcherBound()
  const unit = path.basename(value.group)
  const { stdout } = await nativeExec(
    'systemctl',
    ['--user', 'show', '--property=ControlGroup,RuntimeMaxUSec,TimeoutStopUSec,KillMode', unit],
    { timeout: 10_000, maxBuffer: 16 * 1024 },
  )
  const properties = Object.fromEntries(
    stdout
      .trim()
      .split('\n')
      .map((line) => {
        const at = line.indexOf('=')
        return [line.slice(0, at), line.slice(at + 1)]
      }),
  )
  assert.equal(properties.ControlGroup, value.group)
  assert.equal(properties.KillMode, 'control-group')
  const runtimeSeconds = durationSeconds(properties.RuntimeMaxUSec)
  const stopSeconds = durationSeconds(properties.TimeoutStopUSec)
  assert.ok(runtimeSeconds > 0 && runtimeSeconds <= 600)
  assert.ok(stopSeconds >= 0 && stopSeconds <= 90)
  return { ...value, unit, properties, runtimeSeconds, stopSeconds }
}
async function bounds(label) {
  const value = await boundQualificationProcess(nativeProcess.pid, {
    deadlineSeconds: nativeDeadlineSeconds,
    execute: (file, args, options) =>
      nativeExec(
        file,
        args.map((item) => (item === 'MemoryMax=12G' ? 'MemoryMax=2G' : item)),
        options,
      ),
  })
  const launcher = launcherBound()
  assert.ok(
    value.groups.some(({ ownedScope, deadlineTimer }) => ownedScope && deadlineTimer) ||
      report.launcher.runtimeSeconds <= nativeDeadlineSeconds,
    'Inherited native groups require launcher deadline <=360s; otherwise an independent owned native deadline is mandatory',
  )
  assert.equal(launcher.group, report.launcher.group)
  const groups = new Map(value.groups.map((group) => [group.group, BigInt(group.memoryMax)]))
  groups.set(launcher.group, BigInt(launcher.memoryMax))
  assert.ok(value.groups.every((group) => BigInt(group.memoryMax) <= 2n * 1024n ** 3n))
  const uniqueTotalMax = [...groups.values()].reduce((sum, size) => sum + size, 0n)
  assert.ok(uniqueTotalMax <= 4n * 1024n ** 3n)
  for (const group of value.groups) {
    assert.equal(group.swapMax, '0')
    assert.ok((group.ownedScope && group.deadlineTimer) || group.group === launcher.group)
  }
  const nativeUnitProperties = []
  for (const { group } of value.groups) {
    const { stdout } = await nativeExec(
      'systemctl',
      ['--user', 'show', '--property=ControlGroup,TimeoutStopUSec,KillMode', path.basename(group)],
      { timeout: 10_000, maxBuffer: 16 * 1024 },
    )
    const properties = Object.fromEntries(
      stdout
        .trim()
        .split('\n')
        .map((line) => {
          const at = line.indexOf('=')
          return [line.slice(0, at), line.slice(at + 1)]
        }),
    )
    assert.equal(properties.ControlGroup, group)
    assert.equal(properties.KillMode, 'control-group')
    assert.ok(durationSeconds(properties.TimeoutStopUSec) <= 90)
    nativeUnitProperties.push({ group, properties })
  }
  const memorySamples = [...groups.keys()].map((group) => {
    const directory = `/sys/fs/cgroup${group}`
    const stat = Object.fromEntries(
      readFileSync(`${directory}/memory.stat`, 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split(' ')),
    )
    assert.match(stat.anon, /^\d+$/)
    assert.match(stat.file, /^\d+$/)
    return {
      group,
      memoryCurrent: readFileSync(`${directory}/memory.current`, 'utf8').trim(),
      memoryPeak: readFileSync(`${directory}/memory.peak`, 'utf8').trim(),
      memoryStat: { anon: stat.anon, file: stat.file, kernel: stat.kernel, slab: stat.slab },
    }
  })
  nativeChecks.push(value)
  report.resourceLimitChecks.push({
    label,
    ...value,
    memorySamples,
    nativeUnitProperties,
    uniqueTotalMax: String(uniqueTotalMax),
  })
  checkpoint()
}

async function closeNative(label, aborted = false) {
  if (!application) return
  if (aborted) {
    report.outcome = 'failed'
    process.exitCode = 1
    report.abortCleanup = {
      label,
      startedAt: new Date().toISOString(),
      reason:
        'Qualification aborted; explicitly terminate only the owned actor without an unsaved-close decision',
      intentionalSignal: 'SIGKILL',
    }
    checkpoint()
  }
  let boundError
  try {
    await bounds(`${label}-before-exit`)
  } catch (error) {
    boundError = error
  }
  clearInterval(sampler)
  await sampling
  sampleDescendants()
  try {
    report.ipcCalls ??= []
    report.ipcCalls.push({
      label,
      calls: await application.evaluate(() => globalThis.igsSmartApplyCalls ?? []),
    })
  } catch (error) {
    if (!aborted) throw error
    report.abortCleanup.ipcObservationError = String(error)
  }
  for (const value of observed.values())
    nativeChecks.push({ processIdentities: [value], groups: [] })
  const child = nativeProcess
  const native = application
  let timer
  const exitPromise = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  )
  try {
    if (aborted) {
      const known = nativeChecks
        .flatMap(({ processIdentities = [] }) => processIdentities)
        .find(({ pid }) => pid === child.pid)
      assert.ok(known, 'Abort cleanup requires the actor recorded at launch')
      const live = identity(child.pid)
      if (live) {
        assert.deepEqual(live, known, 'Abort cleanup refuses a reused PID')
        const latest = nativeChecks.findLast((value) => value.nativeIdentity)
        const owned = latest?.groups.find(
          ({ ownedScope, pids }) => ownedScope && pids.includes(child.pid),
        )
        // The existing helper revalidates PID/start and the exact owned KDE scope before
        // killing all its descendants. In the launcher cgroup, signal only our own child.
        if (owned)
          report.abortCleanup.termination = await stopExpiredQualificationProcess({
            ...known,
            group: owned.group,
          })
        else {
          assert.equal(child.kill('SIGKILL'), true)
          report.abortCleanup.termination = { ...known, signalRequested: true, signal: 'SIGKILL' }
        }
      } else report.abortCleanup.termination = { ...known, alreadyPhysicallyExited: true }
    } else
      await Promise.race([
        native.close(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Native close exceeded10s')), 10_000)
        }),
      ])
  } catch (error) {
    const latest = nativeChecks.findLast((value) => value.nativeIdentity)
    const owned = latest?.groups.find(
      ({ ownedScope, pids }) => ownedScope && pids.includes(child.pid),
    )
    if (!owned) throw error
    report.forcedFailureCleanup = await stopExpiredQualificationProcess({
      ...latest.nativeIdentity,
      group: owned.group,
    })
    report.closeUiError = String(error)
  } finally {
    clearTimeout(timer)
  }
  const exit = await confirmQualificationProcessExit(nativeChecks)
  assert.equal(exit.confirmed, true)
  const actualExit =
    child.exitCode !== null || child.signalCode !== null
      ? { code: child.exitCode, signal: child.signalCode }
      : await exitPromise
  report.nativeClosures.push({
    label,
    aborted,
    intentionalSignal: aborted ? 'SIGKILL' : null,
    ...exit,
    ...actualExit,
  })
  // Exit evidence remains in nativeClosures/resourceLimitChecks. Do not ask a later restart
  // to stop an already-released transient KDE timer a second time.
  nativeChecks.length = 0
  application = null
  window = null
  checkpoint()
  if (aborted) {
    report.abortCleanup.physicalExitConfirmed = exit.confirmed
    report.abortCleanup.completedAt = new Date().toISOString()
    if (boundError) report.abortCleanup.boundError = String(boundError)
  } else {
    assert.equal(actualExit.code, 0, 'Unexpected forced exit fails qualification')
    assert.equal(actualExit.signal, null)
  }
  if (boundError && !aborted) throw boundError
}

async function launch() {
  observed.clear()
  report.nativeLaunchAttempts = (report.nativeLaunchAttempts ?? 0) + 1
  const environment = {
    ...process.env,
    NODE_ENV: 'production',
    CUDA_VISIBLE_DEVICES: '',
    PYTHONDONTWRITEBYTECODE: '1',
    XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
    XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
    XDG_CACHE_HOME: path.join(fixtureRoot, 'cache'),
    XDG_STATE_HOME: path.join(fixtureRoot, 'state'),
    TMPDIR: temporaryDirectory,
  }
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'IMAGEGEN_TEST_IMAGE_WORKER',
    'IMAGEGEN_DEV_SERVER_URL',
    'PYTHONPATH',
    'PYTHONHOME',
  ])
    delete environment[key]
  try {
    application = await electron.launch({
      args: ['--ozone-platform=x11', '.'],
      cwd: root,
      env: environment,
      timeout: 30_000,
    })
  } catch (error) {
    report.nativeLaunchError = String(error)
    throw error
  }
  nativeProcess = application.process()
  const launched = identity(nativeProcess.pid)
  assert.ok(launched)
  nativeChecks.push({ processIdentities: [launched], groups: [] })
  await bounds('launch')
  sampleDescendants()
  sampler = setInterval(() => {
    sampling = sampling.then(sampleDescendants).catch((error) => {
      report.samplerError = String(error)
    })
  }, 100)
  const log = { pid: nativeProcess.pid, text: '' }
  report.nativeLogs.push(log)
  for (const stream of [nativeProcess.stdout, nativeProcess.stderr])
    stream?.on('data', (bytes) => {
      if (log.text.length < 96 * 1024)
        log.text += String(bytes).slice(0, 96 * 1024 - log.text.length)
    })
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(15_000)
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await application.evaluate(({ BrowserWindow }) => {
    const owned = BrowserWindow.getAllWindows()[0]
    owned.show()
    owned.focus()
  })
  await setNativeSize(1440, 900)
  await installObserver()
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await expect.poll(async () => (await api('projects', 'list')).length).toBe(1)
  await bounds('native-ui-ready')
}

async function screenshot(name) {
  await window.evaluate(() =>
    document.fonts.ready.then(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    ),
  )
  const file = path.join(evidenceRoot, `${name}.png`)
  await window.mouse.move(0, 0)
  await window.screenshot({ path: file, animations: 'disabled' })
  const size = await window.evaluate(() => [innerWidth, innerHeight])
  const png = readFileSync(file)
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], size)
  report.screenshots.push({ path: file, width: size[0], height: size[1], sha256: digest(png) })
  checkpoint()
}
async function setNativeSize(width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size),
    [width, height],
  )
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
  const native = await application.evaluate(({ BrowserWindow }) => {
    const owned = BrowserWindow.getAllWindows()[0]
    return {
      size: owned.getSize(),
      contentSize: owned.getContentSize(),
      minimumSize: owned.getMinimumSize(),
      visible: owned.isVisible(),
    }
  })
  assert.deepEqual(native.size, [width, height])
  assert.deepEqual(native.contentSize, [width, height])
  assert.deepEqual(native.minimumSize, [900, 620])
  assert.equal(native.visible, true)
  native.canvasSettlement = await window.evaluate(async () => {
    const samples = []
    let previous = '',
      stableFrames = 0
    for (let frame = 0; frame < 120; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const area = document.querySelector('.canvas-area')
      if (!area) return { canvasAbsent: true }
      const content = area.querySelector('.konvajs-content')
      const sample = {
        width: area.clientWidth,
        height: area.clientHeight,
        stageWidth: content ? Number.parseFloat(content.style.width) : null,
        stageHeight: content ? Number.parseFloat(content.style.height) : null,
        camera: [area.dataset.cameraX, area.dataset.cameraY, area.dataset.cameraScale],
      }
      const current = JSON.stringify(sample)
      const matches =
        content &&
        Math.abs(sample.width - sample.stageWidth) <= 1 &&
        Math.abs(sample.height - sample.stageHeight) <= 1
      stableFrames = matches && current === previous ? stableFrames + 1 : 0
      samples.push(sample)
      if (stableFrames >= 3) return { frameCount: samples.length, final: sample }
      previous = current
    }
    throw new Error(
      `Canvas ResizeObserver did not settle after native resize: ${JSON.stringify(samples.slice(-4))}`,
    )
  })
  report.viewportChecks.push(native)
  checkpoint()
}

// Stable root-owned API/copy adapter. Ordinary projects.applyPreset remains untouched.
const adapter = {
  reviewMethod: 'getSmartPatchPresetApplicationReview',
  reviewChannel: 'projects:get-smart-patch-preset-application-review',
  method: 'applySmartPatchPreset',
  channel: 'projects:apply-smart-patch-preset',
  launcher: 'Apply preset',
  context: (patch) => `Smart Patch: ${patch.name}`,
  lockedReason: 'Unlock this Smart Patch before editing it.',
  sizeNote:
    'Size is not applied to Smart Patches. Bounds and internal resolution stay with the Patch.',
  review: (tab, patch) => ({
    documentId: tab.documentId,
    documentRevision: tab.documentRevision,
    layerId: patch.id,
  }),
  request: (review, preset, payload, selectedSections) => ({
    documentId: review.documentId,
    documentRevision: review.documentRevision,
    layerId: review.layerId,
    reviewToken: review.reviewToken,
    sourcePresetId: preset.id,
    payload,
    selectedSections,
  }),
}
const view = () => window.getByLabel(`Project ${projectTitle}`, { exact: true })
const canvas = () => view().getByRole('region', { name: 'Project Canvas', exact: true })
const modal = (preset) =>
  window.getByRole('dialog', { name: `Apply Preset: ${preset.name}`, exact: true })
const chooser = () => window.getByRole('dialog', { name: 'Choose preset to apply', exact: true })
const manager = () => window.getByRole('dialog', { name: 'Preset Manager', exact: true })
const checkbox = (dialog, label) =>
  dialog.getByRole('checkbox', { name: `Apply ${label}`, exact: true })
const promptEditor = (dialog) => dialog.getByRole('textbox', { name: 'Preset prompt', exact: true })
const sectionLabels = {
  prompt: 'Prompt',
  negativePrompt: 'Negative Prompt',
  model: 'Model',
  loras: 'LoRAs',
  sampling: 'Sampler & Scheduler',
  guidance: 'Steps & CFG',
  cfgRescale: 'CFG Rescale',
  denoisingStrength: 'Denoising Strength',
  seed: 'Seed',
  vae: 'VAE',
  vaePrecision: 'VAE Precision',
}
const sectionOrder = [
  'prompt',
  'negativePrompt',
  'model',
  'loras',
  'size',
  'sampling',
  'guidance',
  'cfgRescale',
  'denoisingStrength',
  'seed',
  'vae',
  'vaePrecision',
]
async function rawApi(scope, method, ...args) {
  return window.evaluate(({ scope, method, args }) => window.api[scope][method](...args), {
    scope,
    method,
    args,
  })
}
async function api(scope, method, ...args) {
  const result = await rawApi(scope, method, ...args)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function current() {
  const result = await api('projects', 'open', fixture.key)
  assert.equal(result.kind, 'opened')
  return result.tab
}
async function frames() {
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
}
const readChannels = [
  'models:get-catalog',
  'models:get-install-jobs',
  'models:get-storage-summary',
  'models:get-token-status',
  'runtime:get-status',
  'presets:get',
  'presets:list',
  'projects:list',
  'projects:open',
  'projects:get-close-impact',
  'projects:get-generation-progress',
  'projects:get-generation-queue',
  'projects:get-generation-state',
  'projects:get-generation-target-state',
  'projects:get-smart-patch-generation-target-state',
  'projects:get-smart-patch-variants',
  'projects:get-accepted-result-history',
  'projects:list-generation-results',
  'projects:list-smart-patch-generation-results',
  'projects:get-smart-result-preset-data',
  'projects:get-smart-result-comparison-data',
  'projects:get-raster-generation-data',
  'projects:get-raster-preset-data',
  'projects:review-accepted-result',
  adapter.reviewChannel,
]
async function installObserver() {
  await application.evaluate(({ ipcMain }, channels) => {
    globalThis.igsSmartApplyCalls = []
    globalThis.igsSmartApplyOriginals = new Map()
    globalThis.igsSmartApplyObservers = new Map()
    globalThis.igsSmartApplyReads = channels
    for (const [channel, original] of ipcMain._invokeHandlers) {
      const observed = async (event, ...args) => {
        const call = {
          id: globalThis.igsSmartApplyCalls.length,
          channel,
          args: structuredClone(args),
          finished: false,
        }
        globalThis.igsSmartApplyCalls.push(call)
        try {
          const response = await original(event, ...args)
          call.ok = response?.ok ?? null
          call.response = structuredClone(response)
          return response
        } finally {
          call.finished = true
        }
      }
      globalThis.igsSmartApplyOriginals.set(channel, original)
      globalThis.igsSmartApplyObservers.set(channel, observed)
      ipcMain._invokeHandlers.set(channel, observed)
    }
  }, readChannels)
  observerInstalled = true
}
async function restoreObserver() {
  if (!observerInstalled || !application) return
  report.observerRestoration = await application.evaluate(({ ipcMain }) => {
    const restored = []
    for (const [channel, original] of globalThis.igsSmartApplyOriginals) {
      if (ipcMain._invokeHandlers.get(channel) !== globalThis.igsSmartApplyObservers.get(channel))
        throw new Error(`Observer owner changed: ${channel}`)
      ipcMain._invokeHandlers.set(channel, original)
      if (ipcMain._invokeHandlers.get(channel) !== original)
        throw new Error(`Failed restoration: ${channel}`)
      restored.push(channel)
    }
    return { restored, unchangedOriginalBehavior: true }
  })
  observerInstalled = false
  checkpoint()
}
async function calls() {
  return application.evaluate(() => structuredClone(globalThis.igsSmartApplyCalls))
}
async function mutations() {
  return application.evaluate(() =>
    globalThis.igsSmartApplyCalls.filter(
      ({ channel }) => !globalThis.igsSmartApplyReads.includes(channel),
    ),
  )
}
function reference(family, kind, name) {
  return {
    baseModelFamily: family,
    civitaiFileId: null,
    civitaiModelId: null,
    civitaiVersionId: null,
    displayName: name,
    fileSha256: digest(Buffer.from(name)),
    kind,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: kind === 'checkpoint' && family === 'illustrious' ? 'epsilon' : null,
    versionName: 'Exact absent fixture version',
  }
}
async function prepare() {
  const packagePath = path.join(workspace, `${projectTitle}.igs`)
  const session = await ProjectSession.create(packagePath, projectTitle, roots)
  const inputs = [],
    patches = []
  for (const [index, family] of ['illustrious', 'anima', 'illustrious'].entries()) {
    const value = smartPatchVariantMetadataFixture(family)
    const pixels = Array.from({ length: 35 }, () => [45 + index * 30, 100, 185, 255]).flat()
    const bytes = literalSmartPatchColorPng(7, 5, pixels, 4)
    Object.assign(value.asset, { bytes: bytes.length, sha256: digest(bytes) })
    value.name = `${family} immutable accepted input ${index}`
    const maskId = randomUUID()
    const maskBytes = encodeProjectMaskPng(Uint8Array.from([0, 64, 128, 255]), 2, 2)
    const maskSha = digest(maskBytes)
    const patch = {
      id: randomUUID(),
      name: index === 2 ? 'Locked Smart target' : `${family} selected Smart target`,
      kind: 'smart-patch',
      activeRasterSubLayerId: value.id,
      blendMode: 'normal',
      boundingBox: { x: -73 + index * 128, y: 51, width: 512, height: 384 },
      internalResolution: { width: 256, height: 192 },
      generationDraft: structuredClone(session.document.generationDraft),
      mask: {
        id: maskId,
        revision: 3 + index,
        asset: {
          path: `assets/masks/${maskId}/${maskSha}.png`,
          bytes: maskBytes.length,
          width: 2,
          height: 2,
          sha256: maskSha,
        },
        bounds: { x: -9 + index * 4, y: 13, width: 2, height: 2 },
      },
      maskSettings: { blur: 9 + index, padding: 4 + index },
      coherenceSettings: { edgeSize: 16, minimumDenoise: 0, mode: 'Gaussian Blur' },
      locked: index === 2,
      visible: index !== 1,
      opacity: 0.8,
      rasterSubLayers: [value],
    }
    Object.assign(patch.generationDraft, {
      model: reference(family, 'checkpoint', `${family} current Patch checkpoint ${index}`),
      positivePrompt: {
        text: `Current PATCH ${index} authored {day|night} template`,
        embeddingRefs: [],
      },
      negativePrompt: { text: `Current PATCH ${index} negative`, embeddingRefs: [] },
      seed: { policy: 'fixed', value: 71 + index },
      loras: [
        {
          enabled: true,
          weight: -0.35,
          resource: reference(family, 'lora', `${family} existing missing LoRA ${index}`),
        },
      ],
      cfgRescale: index === 0 ? 0.35 : 0,
      vae: index === 0 ? reference(family, 'vae', 'Existing absent Patch external VAE') : null,
      vaePrecision: index === 0 ? 'FP32' : 'Auto',
    })
    Object.assign(patch.generationDraft.sampling, {
      cfgScale: 6 + index,
      steps: 31 + index,
      denoisingStrength: 0.63,
      sampler: 'Euler',
      scheduler: 'Normal',
      animaMethod: 'euler',
    })
    const provenance = value.generationProvenance
    Object.assign(provenance.layerSourceContext, {
      layerId: patch.id,
      sourceDocumentId: session.document.documentId,
      sourceDocumentRevision: session.document.documentRevision,
    })
    Object.assign(provenance.executionResultContext.output, {
      byteSize: bytes.length,
      sha256: digest(bytes),
    })
    provenance.executionResultContext.output.contributionAlpha8.sha256 = digest(
      Buffer.alloc(35, 255),
    )
    parseSmartPatchGenerationProvenanceV1(provenance)
    patches.push(patch)
    inputs.push({
      member: value.asset.path,
      bytes,
      ownerId: patch.id,
      variantId: value.id,
      kind: 'accepted-raster',
    })
    inputs.push({
      member: patch.mask.asset.path,
      bytes: maskBytes,
      ownerId: patch.id,
      kind: 'authored-mask',
    })
  }
  session.applyDocument({
    ...session.document,
    layers: patches,
    primaryBbox: { x: -301, y: 207, width: 640, height: 448 },
    generationDraft: {
      ...session.document.generationDraft,
      model: reference('anima', 'checkpoint', 'Distinct current PROJECT checkpoint'),
      positivePrompt: { text: 'PROJECT authored {red|green} must stay exact', embeddingRefs: [] },
      negativePrompt: { text: 'PROJECT negative must stay exact', embeddingRefs: [] },
      seed: { policy: 'reuse', value: null },
      sampling: {
        ...session.document.generationDraft.sampling,
        cfgScale: 9,
        steps: 64,
        animaMethod: 'lcm',
      },
    },
  })
  await session.save({
    assets: Object.fromEntries(inputs.map(({ member, bytes }) => [member, { bytes }])),
  })
  const database = openAppDatabase(appDataRoot, path.join(root, 'src/main/db/migrations'))
  try {
    await database.db
      .insertInto('generation_seed_cursor')
      .values({
        actual_seed: 0,
        candidate_id: randomUUID(),
        completion_order: 1,
        document_id: session.document.documentId,
        local_project_key: session.localRecoveryKey,
        updated_at: '2026-10-22T00:00:00.000Z',
      })
      .execute()
  } finally {
    await database.close()
  }
  const loaded = await readIgsPackage(packagePath)
  fixture = {
    key: session.localRecoveryKey,
    path: packagePath,
    saved: loaded.project,
    patches,
    inputs,
    originalPackageSha256: digest(readFileSync(packagePath)),
  }
  for (const [index, input] of inputs.entries()) {
    assert.ok(
      (await loaded.readMember(input.member)).equals(input.bytes),
      `Prepared input ${index} differs`,
    )
    const file = path.join(fixtureRoot, `source-${index}.png`)
    writeFileSync(file, input.bytes, { flag: 'wx', mode: 0o600 })
    input.retained = retain(file, `prepared/inputs/${index}.png`)
  }
  retain(packagePath, 'prepared/source.igs')
  retainJson('prepared/fixture.json', {
    key: fixture.key,
    saved: fixture.saved,
    inputs: inputs.map(({ bytes, ...input }) => ({
      ...input,
      sha256: digest(bytes),
      byteSize: bytes.length,
    })),
    boundary: report.boundary.fixtures,
  })
}
async function createPresets() {
  const literal = '(detached light:-0.5), {blue|red}\nliteral 日本語 ++ --'
  const model = reference('illustrious', 'checkpoint', 'Selected absent preset checkpoint')
  const definition = (name, payload, workflow = 'smartPatch') => ({
    name,
    payload,
    workflow,
    description: 'Detached selected Smart Patch native qualification',
    favorite: false,
    tags: ['smart-apply-native'],
  })
  const style = await api(
    'presets',
    'create',
    definition(
      'Smart native Illustrious style',
      {
        prompt: { text: literal, embeddingRefs: [] },
        negativePrompt: { text: '', embeddingRefs: [] },
        model,
        loras: [],
        size: { width: 640, height: 512 },
        sampling: { sampler: 'DPM++ SDE' },
        guidance: { steps: 17, cfgScale: 0 },
        cfgRescale: 0,
        denoisingStrength: 0,
        seed: { policy: 'fixed', value: 0 },
        vae: null,
        vaePrecision: 'Auto',
      },
      'imageToImage',
    ),
  )
  const anima = await api(
    'presets',
    'create',
    definition('Smart native Anima style', {
      prompt: { text: 'Anima literal (moon:1.5) 日本語', embeddingRefs: [] },
      sampling: { animaMethod: 'heun' },
      guidance: { steps: 23, cfgScale: 0 },
      loras: [],
      denoisingStrength: 0,
      seed: { policy: 'fixed', value: 0 },
      size: { width: 896, height: 640 },
    }),
  )
  const embedding = reference('illustrious', 'embedding', 'Selected absent negative embedding')
  const missing = await api(
    'presets',
    'create',
    definition('Smart native missing resources', {
      prompt: { text: literal, embeddingRefs: [] },
      model,
      negativePrompt: {
        text: '<absent-negative>',
        embeddingRefs: [{ token: '<absent-negative>', resource: embedding }],
      },
      loras: [
        {
          enabled: true,
          weight: -0.5,
          resource: reference('illustrious', 'lora', 'Selected absent preset LoRA'),
        },
      ],
      vae: reference('illustrious', 'vae', 'Selected absent external VAE'),
    }),
  )
  const sizeOnly = await api(
    'presets',
    'create',
    definition('Smart native Size only', { size: { width: 640, height: 512 } }, 'textToImage'),
  )
  sourcePresets = {
    records: [style, anima, missing, sizeOnly],
    rows: sourceRows().tables.presets,
  }
  retainJson('prepared/source-presets.json', sourcePresets)
  return { style, anima, missing, sizeOnly }
}
async function sourcesUnchanged() {
  assert.deepEqual(sourceRows().tables.presets, sourcePresets.rows, 'Source preset SQL changed')
  for (const record of sourcePresets.records)
    assert.deepEqual(await api('presets', 'get', record.id, { includeDeleted: true }), record)
}
async function witness() {
  await frames()
  const tab = await current(),
    saved = await readIgsPackage(fixture.path)
  const shadowStore = new ProjectShadowStore(path.join(appDataRoot, 'autosave'))
  let shadow
  await expect
    .poll(async () => {
      shadow = await shadowStore.inspect({ projectPath: fixture.path, savedPackage: saved })
      return tab.dirty
        ? shadow.status === 'recoverable' &&
            shadow.document.documentRevision === tab.documentRevision
        : ['absent', 'clean'].includes(shadow.status)
    })
    .toBe(true)
  const liveDocument = tab.dirty ? shadow.document : saved.project
  assert.equal(liveDocument.documentRevision, tab.documentRevision)
  assert.deepEqual(liveDocument.generationDraft, tab.generationDraft)
  const ui = await canvas()
    .locator('.canvas-area')
    .evaluate((area) => ({
      camera: { x: area.dataset.cameraX, y: area.dataset.cameraY, scale: area.dataset.cameraScale },
      selected: [...document.querySelectorAll('.entity-select[aria-pressed="true"]')]
        .map((node) => node.getAttribute('aria-label'))
        .sort(),
    }))
  assert.ok(
    Object.values(ui.camera).every(
      (value) => value !== undefined && Number.isFinite(Number(value)),
    ),
  )
  return {
    tab,
    liveDocument,
    savedDocument: saved.project,
    packageSha256: digest(readFileSync(fixture.path)),
    files: dataHashes(),
    sql: sourceRows(),
    ui,
    mutations: await mutations(),
  }
}
function mutationDelta(before, after, expected, label) {
  assert.deepEqual(after.mutations.slice(0, before.mutations.length), before.mutations)
  const actual = after.mutations.slice(before.mutations.length)
  assert.deepEqual(
    actual.map(({ channel, args, finished, ok }) => ({ channel, args, finished, ok })),
    expected.map(({ channel, args, ok = true }) => ({ channel, args, finished: true, ok })),
    label,
  )
  return actual
}
async function unchanged(before, label, expected = []) {
  const after = await witness()
  mutationDelta(before, after, expected, label)
  assert.deepEqual(
    { ...after, mutations: [] },
    { ...before, mutations: [] },
    `${label}: full state changed`,
  )
  report.witnesses.push({ label, before, after })
  lastOpenWitness = after
  await sourcesUnchanged()
  checkpoint()
  return after
}
async function selectPatch(patch, { underModal = false } = {}) {
  const button = view().getByRole('button', { name: `Select ${patch.name}`, exact: true })
  if ((await button.getAttribute('aria-pressed')) === 'true') return
  const before = await witness()
  if (underModal) {
    // Deliberate real DOM context-change event while the modal masks pointer input. It invokes
    // the production selection handler; it does not replace App state or any IPC response.
    await button.evaluate((element) => element.click())
  } else {
    await button.scrollIntoViewIfNeeded()
    await button.click()
  }
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  const after = await witness()
  const expected = [{ channel: 'projects:seal-prompt-history', args: [before.tab.id, null] }]
  mutationDelta(before, after, expected, 'Intentional selected-layer navigation seal')
  assert.deepEqual({ ...after, ui: before.ui, mutations: [] }, { ...before, mutations: [] })
  assert.deepEqual(after.ui, { ...before.ui, selected: [`Select ${patch.name}`] })
  report.expectedActions.push({ kind: 'selection', underModal, before, after, expected })
  checkpoint()
}
async function inspectChooserGeometry(stage, inspectRows = false) {
  const settlement = await chooser().evaluate(async (surface) => {
    await document.fonts.ready
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
    const samples = []
    let previous = '',
      stableFrames = 0
    for (let frame = 0; frame < 12; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const targets = [
        surface,
        surface.querySelector('.picker-search'),
        surface.querySelector('.preset-results'),
        ...surface.querySelectorAll('.preset-result'),
      ]
      const sample = targets.map((node) => {
        if (!node) return null
        const box = node.getBoundingClientRect()
        return {
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          scrollTop: node.scrollTop,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
        }
      })
      const serialized = JSON.stringify(sample)
      stableFrames = serialized === previous ? stableFrames + 1 : 0
      samples.push(sample)
      if (stableFrames >= 2) return { stable: true, samples }
      previous = serialized
    }
    return { stable: false, samples }
  })
  const geometry = await chooser().evaluate((surface, inspectRows) => {
    const rect = (value) => ({
      left: value.left,
      top: value.top,
      right: value.right,
      bottom: value.bottom,
      width: value.width,
      height: value.height,
    })
    const outer = surface.getBoundingClientRect(),
      popover = (surface.closest('.n-popover') ?? surface).getBoundingClientRect(),
      violations = [],
      controls = [],
      rows = [],
      adjacency = []
    const viewport = { width: innerWidth, height: innerHeight }
    const enclosed = (inner, owner) =>
      inner.left >= owner.left - 1 &&
      inner.right <= owner.right + 1 &&
      inner.top >= owner.top - 1 &&
      inner.bottom <= owner.bottom + 1
    const viewportBox = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
    if (!outer.width || !outer.height || !enclosed(outer, viewportBox))
      violations.push({ owner: 'picker', clipping: 'viewport', rect: rect(outer) })
    if (!popover.width || !popover.height || !enclosed(popover, viewportBox))
      violations.push({ owner: 'popover-shell', clipping: 'viewport', rect: rect(popover) })
    for (const [label, selector] of [
      ['Search presets to apply', 'input[aria-label="Search presets to apply"]'],
      ['Refresh presets to apply', 'button[aria-label="Refresh presets to apply"]'],
    ]) {
      const control = surface.querySelector(selector)
      if (!control) {
        violations.push({ missingControl: label })
        continue
      }
      const bounds = control.getBoundingClientRect(),
        style = getComputedStyle(control)
      const hit = document.elementFromPoint(
        (bounds.left + bounds.right) / 2,
        (bounds.top + bounds.bottom) / 2,
      )
      const reachable = Boolean(hit && (hit === control || control.contains(hit)))
      const state = {
        label,
        rect: rect(bounds),
        disabled: Boolean(control.disabled),
        reachable,
        display: style.display,
        visibility: style.visibility,
        hit: hit
          ? {
              tag: hit.tagName,
              label: hit.getAttribute('aria-label'),
              text: hit.textContent?.trim().slice(0, 120),
            }
          : null,
      }
      controls.push(state)
      if (
        !bounds.width ||
        !bounds.height ||
        style.display === 'none' ||
        style.visibility !== 'visible' ||
        !enclosed(bounds, viewportBox) ||
        !enclosed(bounds, outer)
      )
        violations.push({ control: label, clipping: 'picker-or-viewport', ...state })
      if (!reachable) violations.push({ coveredControl: label, ...state })
      for (let owner = control.parentElement; owner; owner = owner.parentElement) {
        const ownerStyle = getComputedStyle(owner),
          ownerBox = owner.getBoundingClientRect()
        const left = ownerBox.left + owner.clientLeft,
          top = ownerBox.top + owner.clientTop
        if (
          /^(hidden|clip|scroll|auto)$/.test(ownerStyle.overflowX) &&
          (bounds.left < left - 1 || bounds.right > left + owner.clientWidth + 1)
        )
          violations.push({
            control: label,
            clipping: `x:${owner.className}`,
            rect: rect(bounds),
            owner: rect(ownerBox),
          })
        if (
          /^(hidden|clip|scroll|auto)$/.test(ownerStyle.overflowY) &&
          (bounds.top < top - 1 || bounds.bottom > top + owner.clientHeight + 1)
        )
          violations.push({
            control: label,
            clipping: `y:${owner.className}`,
            rect: rect(bounds),
            owner: rect(ownerBox),
          })
      }
    }
    const list = surface.querySelector('.preset-results')
    let scrollList = null
    if (list) {
      const bounds = list.getBoundingClientRect(),
        style = getComputedStyle(list)
      scrollList = {
        rect: rect(bounds),
        clientWidth: list.clientWidth,
        clientHeight: list.clientHeight,
        scrollWidth: list.scrollWidth,
        scrollHeight: list.scrollHeight,
        scrollLeft: list.scrollLeft,
        scrollTop: list.scrollTop,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      }
      if (
        inspectRows &&
        (!bounds.width ||
          !bounds.height ||
          !enclosed(bounds, outer) ||
          !enclosed(bounds, viewportBox))
      )
        violations.push({ owner: 'scroll-list', clipping: 'picker-or-viewport', ...scrollList })
      if (inspectRows)
        for (const button of list.querySelectorAll('button.preset-result')) {
          const rowBounds = button.getBoundingClientRect()
          const logical = {
            left: rowBounds.left - bounds.left + list.scrollLeft,
            right: rowBounds.right - bounds.left + list.scrollLeft,
            top: rowBounds.top - bounds.top + list.scrollTop,
            bottom: rowBounds.bottom - bounds.top + list.scrollTop,
          }
          const row = {
            label: button.getAttribute('aria-label'),
            rect: rect(rowBounds),
            logical,
            content: [
              ...button.querySelectorAll('.preset-copy strong,.preset-copy small,.n-tag'),
            ].map((node) => ({
              text: node.textContent.trim(),
              rect: rect(node.getBoundingClientRect()),
            })),
            glyphs: [],
          }
          if (!rowBounds.width || !rowBounds.height)
            violations.push({ emptyRow: row.label, rect: row.rect })
          const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT)
          let nodeIndex = 0
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            nodeIndex++
            if (
              !node.textContent.trim() ||
              getComputedStyle(node.parentElement).visibility !== 'visible'
            )
              continue
            let offset = 0
            for (const glyph of node.textContent) {
              const start = offset
              offset += glyph.length
              if (!glyph.trim()) continue
              const range = document.createRange()
              range.setStart(node, start)
              range.setEnd(node, offset)
              for (const glyphBounds of range.getClientRects()) {
                if (!glyphBounds.width || !glyphBounds.height) continue
                const entry = { id: `${nodeIndex}:${start}`, text: glyph, rect: rect(glyphBounds) }
                row.glyphs.push(entry)
                // Offscreen scrolled rows remain logical rows. Only containment by their own
                // button is asserted here; glyph viewport visibility is intentionally not required.
                if (!enclosed(glyphBounds, rowBounds))
                  violations.push({
                    row: row.label,
                    glyphOutsideButton: entry,
                    button: row.rect,
                    logical,
                  })
              }
            }
          }
          if (!row.glyphs.length) violations.push({ noRowContentGlyphs: row.label })
          const previous = rows.at(-1)
          if (previous) {
            const overlapX =
              Math.min(previous.logical.right, logical.right) -
              Math.max(previous.logical.left, logical.left)
            const overlapY =
              Math.min(previous.logical.bottom, logical.bottom) -
              Math.max(previous.logical.top, logical.top)
            const pair = {
              previous: previous.label,
              next: row.label,
              previousLogical: previous.logical,
              nextLogical: logical,
              overlapX,
              overlapY,
            }
            adjacency.push(pair)
            if (overlapX > 1 && overlapY > 1) violations.push({ adjacentRowsOverlap: pair })
          }
          rows.push(row)
        }
    } else if (inspectRows) violations.push({ missingScrollList: true })
    if (inspectRows && !rows.length) violations.push({ missingPresetRows: true })
    return {
      viewport,
      picker: rect(outer),
      popover: rect(popover),
      controls,
      scrollList,
      rows,
      adjacency,
      violations,
    }
  }, inspectRows)
  const record = { stage, inspectRows, settlement, geometry }
  report.chooserChecks ??= []
  report.chooserChecks.push(record)
  checkpoint()
  const key = `${geometry.viewport.width}x${geometry.viewport.height}`
  report.chooserScreenshots ??= []
  if (
    (inspectRows || geometry.violations.length || !settlement.stable) &&
    !report.chooserScreenshots.includes(key)
  ) {
    await screenshot(`chooser-${key}-${stage}`)
    report.chooserScreenshots.push(key)
    checkpoint()
  }
  assert.equal(
    settlement.stable,
    true,
    `${stage}: chooser did not settle: ${JSON.stringify(settlement.samples.at(-1))}`,
  )
  assert.deepEqual(
    geometry.violations,
    [],
    `${stage}: picker/control/row geometry: ${JSON.stringify(geometry.violations)}`,
  )
  return record
}
async function openPreset(preset, patch) {
  // Naive keeps leaving popovers mounted. Detach the previous generation before matching again.
  await expect(chooser()).toHaveCount(0)
  await expect(window.getByRole('dialog', { name: /^Apply Preset: / })).toHaveCount(0)
  await view().getByRole('button', { name: adapter.launcher, exact: true }).click()
  await expect(chooser()).toBeVisible()
  await inspectChooserGeometry('before-refresh')
  const refreshOffset = (await calls()).length
  await chooser().getByRole('button', { name: 'Refresh presets to apply', exact: true }).click()
  await expect
    .poll(async () =>
      (await calls())
        .slice(refreshOffset)
        .some((call) => call.channel === 'presets:list' && call.finished && call.response?.ok),
    )
    .toBe(true)
  await expect(
    chooser().getByRole('button', { name: 'Refresh presets to apply', exact: true }),
  ).toBeEnabled()
  await expect(chooser().getByRole('button', { name: /^Choose preset / })).toHaveCount(
    sourcePresets.records.length,
  )
  await window.mouse.move(0, 0)
  await inspectChooserGeometry('after-refresh-before-filter', true)
  await chooser()
    .getByRole('textbox', { name: 'Search presets to apply', exact: true })
    .fill(preset.name)
  const offset = (await calls()).length
  await chooser()
    .getByRole('button', { name: `Choose preset ${preset.name}`, exact: true })
    .click()
  await expect(chooser()).toHaveCount(0)
  const dialog = modal(preset)
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(adapter.context(patch))
  await expect(dialog).toContainText('The saved preset will not change.')
  await expect(dialog).toContainText(adapter.sizeNote)
  let review
  await expect
    .poll(async () => {
      review = (await calls())
        .slice(offset)
        .findLast(
          (call) => call.channel === adapter.reviewChannel && call.finished && call.response?.ok,
        )
      return Boolean(review)
    })
    .toBe(true)
  const tab = await current(),
    reply = review.response.value
  assert.deepEqual(review.args, [tab.id, adapter.review(tab, patch)])
  assert.deepEqual(
    Object.keys(reply).sort(),
    ['documentId', 'documentRevision', 'layerId', 'reviewToken', 'generationDraft'].sort(),
  )
  assert.match(reply.reviewToken, /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i)
  for (const key of ['documentId', 'documentRevision', 'layerId'])
    assert.equal(reply[key], review.args[1][key])
  assert.deepEqual(
    reply.generationDraft,
    tab.layers.find(({ id }) => id === patch.id).generationDraft,
  )
  return { dialog, review: reply, preset, patch }
}
async function cancelApply(opened, escape = false) {
  if (escape) await opened.dialog.press('Escape')
  else await opened.dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(opened.dialog).toHaveCount(0)
}
async function expand(dialog, section) {
  const row = dialog.locator(`[data-preset-section="${section}"]`)
  await row.getByText(sectionLabels[section], { exact: true }).click()
  return row
}
async function expectPrompt(dialog, text) {
  await expect
    .poll(async () => (await promptEditor(dialog).locator('.cm-line').allTextContents()).join('\n'))
    .toBe(text)
}
async function freshReview(patch) {
  const tab = await current()
  return api('projects', adapter.reviewMethod, tab.id, adapter.review(tab, patch))
}
async function refused(method, request, code, label, boundary = 'main') {
  assert.ok(['main', 'preload'].includes(boundary))
  const before = await witness()
  const channel = method === adapter.method ? adapter.channel : adapter.reviewChannel
  const callOffset = (await calls()).length
  const reply = await rawApi('projects', method, before.tab.id, request)
  assert.equal(reply.ok, false, `${label}: should refuse`)
  assert.equal(reply.error.code, code, JSON.stringify(reply))
  const mainInvocations = (await calls())
    .slice(callOffset)
    .filter((call) => call.channel === channel)
  assert.deepEqual(
    mainInvocations.map(({ args, finished, ok }) => ({ args, finished, ok })),
    boundary === 'main' ? [{ args: [before.tab.id, request], finished: true, ok: false }] : [],
    `${label}: exact ${boundary} refusal boundary`,
  )
  report.refusals.push({ label, boundary, method, request, reply, mainInvocations })
  await unchanged(
    before,
    label,
    boundary === 'main' && method === adapter.method
      ? [{ channel, args: [before.tab.id, request], ok: false }]
      : [],
  )
  return reply
}
// Backup is independent of every other witness: a damaged/missing product file cannot prevent
// retention of the last consistent final SQL state after physical native exit.
async function retainDatabase(label, afterNativeExit = false) {
  const directory = path.join(evidenceRoot, label)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const file = path.join(directory, 'app.sqlite')
  assert.equal(existsSync(file), false)
  const source = new Database(path.join(appDataRoot, 'database/app.sqlite'), {
    readonly: true,
    fileMustExist: true,
  })
  try {
    await source.backup(file)
  } finally {
    source.close()
  }
  // Register bytes immediately so an integrity/readback failure still cannot lose the backup.
  report.snapshots.push({
    path: file,
    bytes: lstatSync(file).size,
    sha256: digest(readFileSync(file)),
  })
  const copy = new Database(file, { readonly: true, fileMustExist: true })
  let state
  try {
    assert.deepEqual(copy.prepare('PRAGMA integrity_check').all(), [{ integrity_check: 'ok' }])
    state = databaseState(copy)
  } finally {
    copy.close()
  }
  const record = { label, path: file, afterNativeExit, integrity: 'ok', state }
  report.databaseCheckpoints.push(record)
  checkpoint()
  return record
}
async function snapshot(label, closed = false) {
  const database = await retainDatabase(label, closed)
  const beforeFiles = dataHashes(),
    expected = sourceRows()
  assert.deepEqual(database.state, expected, 'Standalone SQLite state changed during backup')
  const retainedFiles = dataFiles().map((file) => ({
    original: file,
    path: retain(file, `${label}/data/${path.relative(appDataRoot, file)}`),
    sha256: digest(readFileSync(file)),
  }))
  assert.deepEqual(dataHashes(), beforeFiles)
  assert.deepEqual(sourceRows(), expected)
  retainJson(`${label}/readback.json`, {
    database,
    tab: closed ? null : await current(),
    lastOpenWitness,
    retainedFiles,
    dependencies: fixture.inputs.map(({ bytes, ...input }) => ({
      ...input,
      sha256: digest(bytes),
    })),
  })
  report.stateCheckpoints.push({
    label,
    afterNativeExit: closed,
    database: database.path,
    retainedFiles,
  })
  checkpoint()
}

async function inspectLayout(dialog, label) {
  await window.evaluate(async () => {
    await document.fonts.ready
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
  const scroll = dialog.locator('.modal-scroll .n-scrollbar-container').first()
  const dimensions = await scroll.evaluate((node) => ({
    height: node.clientHeight,
    total: node.scrollHeight,
  }))
  assert.ok(dimensions.height > 0)
  const positions = []
  for (
    let top = 0;
    top < dimensions.total - dimensions.height;
    top += Math.max(1, Math.floor(dimensions.height / 2))
  )
    positions.push(top)
  positions.push(Math.max(0, dimensions.total - dimensions.height))
  assert.ok(positions.length <= 48, 'Finite overflow traversal')
  const samples = [],
    allGlyphs = new Set(),
    seenGlyphs = new Set()
  for (const top of positions) {
    await scroll.evaluate((node, top) => {
      node.scrollTop = top
    }, top)
    await frames()
    const sample = await dialog.evaluate((surface) => {
      const body = surface.querySelector('.modal-scroll .n-scrollbar-container')
      const box = body.getBoundingClientRect(),
        violations = [],
        controls = [],
        glyphs = [],
        all = [],
        seen = [],
        summaries = []
      const rect = (value) => ({
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
      })
      const withinBody = (bounds) => bounds.top >= box.top - 1 && bounds.bottom <= box.bottom + 1
      const check = (bounds, node, label) => {
        if (
          bounds.left < -1 ||
          bounds.top < -1 ||
          bounds.right > innerWidth + 1 ||
          bounds.bottom > innerHeight + 1
        )
          violations.push({ label, clipping: 'viewport', rect: rect(bounds) })
        for (let owner = node; owner instanceof HTMLElement; owner = owner.parentElement) {
          const style = getComputedStyle(owner),
            boundsOwner = owner.getBoundingClientRect()
          const ellipsis =
            style.textOverflow === 'ellipsis' && owner.title.trim() === owner.textContent.trim()
          const x = boundsOwner.left + owner.clientLeft,
            y = boundsOwner.top + owner.clientTop
          if (
            !ellipsis &&
            /^(hidden|clip|scroll|auto)$/.test(style.overflowX) &&
            (bounds.left < x - 1 || bounds.right > x + owner.clientWidth + 1)
          )
            violations.push({ label, clipping: `x:${owner.className}`, rect: rect(bounds) })
          if (
            /^(hidden|clip|scroll|auto)$/.test(style.overflowY) &&
            (bounds.top < y - 1 || bounds.bottom > y + owner.clientHeight + 1)
          )
            violations.push({ label, clipping: `y:${owner.className}`, rect: rect(bounds) })
        }
      }
      check(surface.getBoundingClientRect(), surface.parentElement, 'Apply dialog')
      const headerElement = surface.querySelector('.modal-header')
      let header = null
      if (!headerElement) violations.push({ missingApplyHeader: true })
      else {
        const headerBounds = headerElement.getBoundingClientRect()
        header = { rect: rect(headerBounds), text: headerElement.textContent.trim(), parts: [] }
        check(headerBounds, headerElement.parentElement, 'Apply header')
        for (const [label, selector] of [
          ['title', 'h2'],
          ['context', '.application-context'],
        ]) {
          const element = headerElement.querySelector(selector)
          if (!element) {
            violations.push({ missingHeaderPart: label })
            continue
          }
          const bounds = element.getBoundingClientRect()
          const part = { label, text: element.textContent.trim(), rect: rect(bounds), glyphs: [] }
          header.parts.push(part)
          check(bounds, element.parentElement, `Apply header ${label}`)
          if (
            bounds.left < headerBounds.left - 1 ||
            bounds.right > headerBounds.right + 1 ||
            bounds.top < headerBounds.top - 1 ||
            bounds.bottom > headerBounds.bottom + 1
          )
            violations.push({
              headerPartOutsideHeader: label,
              rect: part.rect,
              header: header.rect,
            })
          const textWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
          let nodeIndex = 0
          for (let node = textWalker.nextNode(); node; node = textWalker.nextNode()) {
            nodeIndex++
            if (
              !node.textContent.trim() ||
              getComputedStyle(node.parentElement).visibility !== 'visible'
            )
              continue
            let offset = 0
            for (const glyph of node.textContent) {
              const start = offset
              offset += glyph.length
              if (!glyph.trim()) continue
              const range = document.createRange()
              range.setStart(node, start)
              range.setEnd(node, offset)
              for (const glyphBounds of range.getClientRects()) {
                if (!glyphBounds.width || !glyphBounds.height) continue
                const entry = { id: `${nodeIndex}:${start}`, text: glyph, rect: rect(glyphBounds) }
                part.glyphs.push(entry)
                check(glyphBounds, node.parentElement, `Apply header ${label} glyph ${glyph}`)
                if (
                  glyphBounds.left < bounds.left - 1 ||
                  glyphBounds.right > bounds.right + 1 ||
                  glyphBounds.top < bounds.top - 1 ||
                  glyphBounds.bottom > bounds.bottom + 1
                )
                  violations.push({ headerGlyphOutsidePart: label, glyph: entry, owner: part.rect })
              }
            }
          }
          if (!part.glyphs.length) violations.push({ missingHeaderGlyphs: label, rect: part.rect })
        }
      }
      for (const control of surface.querySelectorAll(
        'button,[role="button"],[role="checkbox"],input,[role="textbox"]',
      )) {
        const bounds = control.getBoundingClientRect()
        if (!bounds.width || !bounds.height || getComputedStyle(control).visibility !== 'visible')
          continue
        if (body.contains(control) && !withinBody(bounds)) continue
        const label =
          control.getAttribute('aria-label') ||
          control.textContent.trim() ||
          control.getAttribute('placeholder') ||
          control.tagName
        check(bounds, control.parentElement, label)
        const hit = document.elementFromPoint(
          (bounds.left + bounds.right) / 2,
          (bounds.top + bounds.bottom) / 2,
        )
        const reachable = Boolean(hit && (hit === control || control.contains(hit)))
        controls.push({ label, disabled: Boolean(control.disabled), reachable, rect: rect(bounds) })
        if (!control.disabled && !reachable) violations.push({ coveredControl: label })
      }
      for (const icon of surface.querySelectorAll('button svg')) {
        const bounds = icon.getBoundingClientRect()
        if (!bounds.width || !bounds.height || (body.contains(icon) && !withinBody(bounds)))
          continue
        const button = icon.closest('button').getBoundingClientRect()
        check(bounds, icon.parentElement, 'action icon')
        if (
          bounds.left < button.left - 1 ||
          bounds.top < button.top - 1 ||
          bounds.right > button.right + 1 ||
          bounds.bottom > button.bottom + 1
        )
          violations.push({ iconOutsideHitTarget: rect(bounds), button: rect(button) })
      }
      const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT)
      let nodeIndex = 0
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        nodeIndex++
        if (
          !node.textContent.trim() ||
          getComputedStyle(node.parentElement).visibility !== 'visible'
        )
          continue
        // Intentional single-line summaries expose their full exact value through title.
        const ellipsis = node.parentElement.closest('[title]')
        if (
          ellipsis &&
          getComputedStyle(ellipsis).textOverflow === 'ellipsis' &&
          ellipsis.title.trim() === ellipsis.textContent.trim().replace(/^(Current|Apply):\s*/, '')
        ) {
          summaries.push({
            text: ellipsis.textContent.trim(),
            exactTitle: ellipsis.title,
            rect: rect(ellipsis.getBoundingClientRect()),
          })
          continue
        }
        let offset = 0
        for (const glyph of node.textContent) {
          const start = offset
          offset += glyph.length
          if (!glyph.trim()) continue
          const range = document.createRange()
          range.setStart(node, start)
          range.setEnd(node, offset)
          for (const bounds of range.getClientRects()) {
            if (!bounds.width || !bounds.height) continue
            const id = `${nodeIndex}:${start}`
            all.push(id)
            if (body.contains(node) && !withinBody(bounds)) continue
            seen.push(id)
            check(bounds, node.parentElement, glyph)
            glyphs.push({ id, text: glyph, rect: rect(bounds) })
          }
        }
      }
      return {
        top: body.scrollTop,
        modal: rect(surface.getBoundingClientRect()),
        header,
        body: rect(box),
        footer: rect(surface.querySelector('footer').getBoundingClientRect()),
        viewport: [innerWidth, innerHeight],
        overflowX: document.documentElement.scrollWidth > innerWidth,
        all,
        seen,
        controls,
        glyphs,
        summaries,
        violations,
      }
    })
    samples.push(sample)
    sample.all.forEach((id) => allGlyphs.add(id))
    sample.seen.forEach((id) => seenGlyphs.add(id))
  }
  report.layoutChecks.push({ label, dimensions, samples, glyphCount: allGlyphs.size })
  checkpoint()
  assert.deepEqual(
    samples.flatMap(({ violations }) => violations),
    [],
    `${label}: glyph clipping or unreachable controls`,
  )
  assert.ok(allGlyphs.size > 30)
  assert.deepEqual(
    [...allGlyphs].filter((id) => !seenGlyphs.has(id)),
    [],
    'Every untruncated glyph is visible during traversal',
  )
  assert.ok(samples.every(({ overflowX }) => !overflowX))
  assert.deepEqual(
    samples[0].footer,
    samples.at(-1).footer,
    'Footer must stay fixed during modal scroll',
  )
  await screenshot(`${label}-bottom`)
  await scroll.evaluate((node) => {
    node.scrollTop = 0
  })
  await frames()
  await screenshot(`${label}-top`)
}
async function detachedControls(preset) {
  const patch = fixture.patches[0]
  await selectPatch(patch)
  const before = await witness(),
    opened = await openPreset(preset, patch),
    dialog = opened.dialog
  await expect(checkbox(dialog, 'Size')).toHaveCount(0)
  await expect(checkbox(dialog, 'Seed')).not.toBeChecked()
  await expect(promptEditor(dialog)).toBeHidden()
  await checkbox(dialog, 'Model').uncheck()
  await expand(dialog, 'prompt')
  await promptEditor(dialog).fill('Temporary detached 日本語')
  await checkbox(dialog, 'Prompt').uncheck()
  await expectPrompt(dialog, 'Temporary detached 日本語')
  await checkbox(dialog, 'Prompt').check()
  await expectPrompt(dialog, 'Temporary detached 日本語')
  await dialog.getByRole('button', { name: 'Reset Prompt', exact: true }).click()
  await expectPrompt(dialog, preset.payload.prompt.text)
  await expect(checkbox(dialog, 'Prompt')).toBeChecked()
  await expand(dialog, 'guidance')
  const steps = dialog.getByLabel('Preset steps', { exact: true })
  await steps.fill('-')
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await checkbox(dialog, 'Steps & CFG').uncheck()
  await expect(steps).toHaveValue('-')
  await expect(steps).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled()
  await checkbox(dialog, 'Steps & CFG').check()
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Reset Steps & CFG', exact: true }).click()
  await expect(steps).toHaveValue('17')
  await promptEditor(dialog).fill('Reset all temporary content')
  await checkbox(dialog, 'Prompt').uncheck()
  await dialog.getByRole('button', { name: 'Reset all', exact: true }).click()
  await expect(checkbox(dialog, 'Prompt')).not.toBeChecked()
  await checkbox(dialog, 'Prompt').check()
  await expectPrompt(dialog, preset.payload.prompt.text)
  const master = dialog.getByRole('checkbox', { name: 'Select all sections', exact: true })
  const selectable = sectionOrder.filter(
    (section) => preset.payload[section] !== undefined && section !== 'size',
  )
  const expectMask = async (selected) => {
    for (const section of selectable) {
      const control = checkbox(dialog, sectionLabels[section])
      if (selected.includes(section)) await expect(control).toBeChecked()
      else await expect(control).not.toBeChecked()
    }
  }
  await expectMask(selectable.filter((section) => !['model', 'seed'].includes(section)))
  await expect(master).toHaveAttribute('aria-checked', 'mixed')
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled()
  // Playwright treats mixed as unchecked. Establish an all-selected master before clearing it.
  await master.check()
  await expect(master).toBeChecked()
  await expectMask(selectable)
  await master.uncheck()
  await expect(master).not.toBeChecked()
  await expectMask([])
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await master.check()
  await expect(master).toBeChecked()
  await expectMask(selectable)
  await expect(checkbox(dialog, 'Size')).toHaveCount(0)
  await cancelApply(opened)
  await unchanged(
    before,
    'Detached resets, raw invalidity, section/master masks and Cancel are exact no-ops',
  )
  check(
    '02 Actual chooser/target review -> detached shared reset/master/raw-input controls -> Cancel leaves every durable owner and all mutation IPC unchanged',
  )
}
async function layoutAndKeyboard(preset) {
  const patch = fixture.patches[0]
  for (const [width, height] of [
    [1440, 900],
    [900, 620],
  ]) {
    await setNativeSize(width, height)
    const before = await witness(),
      opened = await openPreset(preset, patch),
      dialog = opened.dialog
    await checkbox(dialog, 'Model').uncheck()
    await inspectLayout(dialog, `apply-${width}x${height}-collapsed`)
    await dialog.getByRole('button', { name: 'Expand all', exact: true }).click()
    await inspectLayout(dialog, `apply-${width}x${height}-expanded`)
    await dialog.getByRole('button', { name: 'Collapse all', exact: true }).click()
    await dialog.getByRole('button', { name: 'Close Apply Preset', exact: true }).focus()
    const focus = []
    const probe = { label: `keyboard-${width}x${height}`, states: [] }
    report.keyboardProbes ??= []
    report.keyboardProbes.push(probe)
    const readFocus = () =>
      dialog.evaluate((surface) => {
        const active = document.activeElement
        const context = surface.querySelector('.application-context')
        const style = context && getComputedStyle(context)
        return {
          inside: surface.contains(active),
          documentFocused: document.hasFocus(),
          element: active?.outerHTML.slice(0, 600),
          name: active?.getAttribute('aria-label') || active?.textContent?.trim(),
          context: context
            ? {
                whiteSpace: style.whiteSpace,
                width: context.getBoundingClientRect().width,
                scrollWidth: context.scrollWidth,
                clientWidth: context.clientWidth,
                text: context.textContent,
              }
            : null,
        }
      })
    for (let index = 0; index < 56; index++) {
      const before = await readFocus()
      await window.keyboard.press('Tab')
      const immediate = await readFocus()
      await frames()
      const settled = await readFocus()
      probe.states.push({ index, before, immediate, settled })
      checkpoint()
      assert.equal(
        settled.inside,
        true,
        `Real settled keyboard focus escapes Apply: ${JSON.stringify(probe.states.at(-1))}`,
      )
      focus.push(settled.name)
    }
    assert.ok(
      focus.includes('Apply') && focus.includes('Cancel') && focus.includes('Close Apply Preset'),
    )
    report.layoutChecks.push({ label: `keyboard-${width}x${height}`, focus })
    await cancelApply(opened, true)
    await expect(view().getByRole('button', { name: adapter.launcher, exact: true })).toBeFocused()
    await unchanged(before, `Native ${width}x${height} layout/keyboard/Escape remains a no-op`)
  }
  await setNativeSize(1440, 900)
  check(
    '03 Real native1440x900 and900x620 collapsed/expanded scrolling, exact text-range glyph/icon/hit geometry, keyboard containment and restored launcher focus; screenshots retained for root visual inspection',
  )
}
async function originalAndModels(preset, missing) {
  const patch = fixture.patches[0],
    before = await witness()
  let opened = await openPreset(preset, patch),
    dialog = opened.dialog
  await expand(dialog, 'prompt')
  await promptEditor(dialog).fill('Do not write this temporary copy')
  await dialog.getByRole('button', { name: 'Edit original', exact: true }).click()
  const guard = window.getByRole('dialog', { name: 'Edit saved preset', exact: true })
  await expect(guard).toBeVisible()
  await guard.getByRole('button', { name: 'Keep editing here', exact: true }).click()
  await expect(guard).toHaveCount(0)
  await expectPrompt(dialog, 'Do not write this temporary copy')
  await dialog.getByRole('button', { name: 'Edit original', exact: true }).click()
  await guard.getByRole('button', { name: 'Open original', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(manager()).toBeVisible()
  await expect(manager().getByRole('textbox', { name: 'Preset name', exact: true })).toHaveValue(
    preset.name,
  )
  await expectPrompt(manager(), preset.payload.prompt.text)
  await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await expect(manager()).toHaveCount(0)
  await unchanged(before, 'Guarded Edit original only opens the exact unchanged saved source')
  const modelBefore = await witness()
  opened = await openPreset(missing, patch)
  dialog = opened.dialog
  await expand(dialog, 'prompt')
  await promptEditor(dialog).fill('Same detached draft after Models')
  await checkbox(dialog, 'Negative Prompt').uncheck()
  const action = dialog.getByRole('button', {
    name: `Open ${missing.payload.model.displayName} in Models`,
    exact: true,
  })
  await action.click()
  const models = window.getByRole('dialog', { name: 'Model Manager', exact: true })
  await expect(models).toBeVisible()
  await expect(dialog).toBeHidden()
  await expect(models).toContainText(/unavailable|not installed|could not be found/i)
  await models.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(models).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expectPrompt(dialog, 'Same detached draft after Models')
  await expect(checkbox(dialog, 'Negative Prompt')).not.toBeChecked()
  await expect(action).toBeFocused()
  await cancelApply(opened)
  await unchanged(
    modelBefore,
    'Missing exact-resource Models roundtrip preserves the same Smart detached copy and target',
  )
  check(
    '04 Edit original confirmation/keep/open and real Models handoff preserve detached ownership, exact source SQL and every document/history owner',
  )
}
let pendingStyle
async function missingResources(style, missing, sizeOnly) {
  const patch = fixture.patches[0]
  let before = await witness(),
    opened = await openPreset(sizeOnly, patch)
  await expect(opened.dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await expect(checkbox(opened.dialog, 'Size')).toHaveCount(0)
  await cancelApply(opened)
  await unchanged(before, 'Size-only preset has no Smart selectable sections')
  before = await witness()
  opened = await openPreset(missing, patch)
  const attention = opened.dialog.getByRole('alert', {
    name: 'Selected preset settings need attention',
    exact: true,
  })
  await expect(attention).toBeVisible()
  for (const name of ['Model', 'Negative Prompt', 'LoRAs', 'VAE'])
    await expect(attention).toContainText(name)
  await expect(opened.dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  for (const name of ['Model', 'Negative Prompt', 'LoRAs', 'VAE'])
    await checkbox(opened.dialog, name).uncheck()
  await expect(opened.dialog.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled()
  await cancelApply(opened)
  await unchanged(
    before,
    'Only selected missing nested/resource sections block; deselection permits literal text without runtime',
  )
  pendingStyle = await openPreset(style, patch)
  await expect(
    pendingStyle.dialog.getByRole('button', { name: 'Apply', exact: true }),
  ).toBeDisabled()
  // Use precisely the original UI-issued token; a replacement review here would invalidate UI.
  const request = adapter.request(pendingStyle.review, style, { model: style.payload.model }, [
    'model',
  ])
  await refused(
    adapter.method,
    request,
    'MODEL_PRESET_RESOURCE_UNAVAILABLE',
    'Actual original Main selected-model verification refuses without consuming the current UI review',
  )
  await checkbox(pendingStyle.dialog, 'Model').uncheck()
  await checkbox(pendingStyle.dialog, 'Seed').check()
  await expect(
    pendingStyle.dialog.getByRole('button', { name: 'Apply', exact: true }),
  ).toBeEnabled()
  check(
    '05 Runtime/catalog absent: selected Model/LoRA/VAE/nested embedding warnings block, deselection permits authoring; genuine Main missing-resource refusal leaves same UI token ready for retry; Size-only cannot Apply',
  )
}
function expectedDraft(before, payload, sections) {
  // Independent small literal oracle. Never call the production preset mapper as expectation.
  const result = structuredClone(before)
  if (sections.includes('prompt')) result.positivePrompt = structuredClone(payload.prompt)
  if (sections.includes('negativePrompt'))
    result.negativePrompt = structuredClone(payload.negativePrompt)
  if (sections.includes('loras')) result.loras = structuredClone(payload.loras)
  if (sections.includes('sampling'))
    for (const [key, value] of Object.entries(payload.sampling)) result.sampling[key] = value
  if (sections.includes('guidance')) {
    result.sampling.steps = payload.guidance.steps
    result.sampling.cfgScale = payload.guidance.cfgScale
  }
  if (sections.includes('cfgRescale')) result.cfgRescale = payload.cfgRescale
  if (sections.includes('denoisingStrength'))
    result.sampling.denoisingStrength = payload.denoisingStrength
  if (sections.includes('seed')) result.seed = structuredClone(payload.seed)
  if (sections.includes('vae')) result.vae = structuredClone(payload.vae)
  if (sections.includes('vaePrecision')) result.vaePrecision = payload.vaePrecision
  return result
}
function exactTargetMutation(before, after, patch, draft) {
  const expected = structuredClone(before.liveDocument)
  expected.documentRevision = after.liveDocument.documentRevision
  expected.layers.find(({ id }) => id === patch.id).generationDraft = draft
  assert.notEqual(after.tab.documentRevision, before.tab.documentRevision)
  assert.deepEqual(after.liveDocument, expected, 'Only intended Patch generationDraft may change')
  assert.deepEqual(after.savedDocument, before.savedDocument)
  assert.equal(after.packageSha256, before.packageSha256, 'Apply must not Save')
  assert.deepEqual(after.ui, before.ui)
  assert.deepEqual(after.sql, before.sql, 'Preset/cursor/library/queue/receipt SQL must stay exact')
  assert.deepEqual(after.tab.generationDraft, before.tab.generationDraft, 'Project draft changed')
  assert.deepEqual(after.tab.primaryBbox, before.tab.primaryBbox)
  assert.equal(after.tab.lastActualSeedSnapshot, before.tab.lastActualSeedSnapshot)
  assert.equal(after.tab.dirty, true)
  // Signed layer/mask URLs derive from revision; the raw durable document above verifies every
  // neighbor, mask, bbox, internal size, active member, variant/provenance and unknown extra field.
}
async function applyUi(opened, payload, sections, double = false) {
  const before = await witness()
  const button = opened.dialog.getByRole('button', { name: 'Apply', exact: true })
  await expect(button).toBeEnabled()
  if (double)
    await button.evaluate((element) => {
      element.click()
      element.click()
    })
  else await button.click()
  await expect(opened.dialog).toHaveCount(0)
  const after = await witness(),
    request = adapter.request(opened.review, opened.preset, payload, sections)
  const expected = [{ channel: adapter.channel, args: [before.tab.id, request] }]
  mutationDelta(
    before,
    after,
    expected,
    'One exact reviewed Smart Apply invocation without any flush/seal',
  )
  exactTargetMutation(
    before,
    after,
    opened.patch,
    expectedDraft(
      before.liveDocument.layers.find(({ id }) => id === opened.patch.id).generationDraft,
      payload,
      sections,
    ),
  )
  const renderedPrompt = view().getByRole('textbox', { name: 'Positive prompt', exact: true })
  if (sections.includes('prompt'))
    await expect
      .poll(async () => (await renderedPrompt.locator('.cm-line').allTextContents()).join('\n'))
      .toBe(payload.prompt.text)
  if (sections.includes('guidance')) {
    await expect(view().getByLabel('Steps', { exact: true })).toHaveValue(
      String(payload.guidance.steps),
    )
    await expect(view().getByLabel('CFG scale', { exact: true })).toHaveValue(
      String(payload.guidance.cfgScale),
    )
  }
  await sourcesUnchanged()
  report.expectedActions.push({ kind: 'smart-apply', double, before, after, request, expected })
  checkpoint()
  return { before, after, request }
}
async function historyUi(action) {
  const before = await witness()
  await expect(window.getByRole('menuitem')).toHaveCount(0)
  await window.getByRole('button', { name: 'Edit menu', exact: true }).click()
  await window
    .getByText(action === 'undo' ? 'Undo · Ctrl+Z' : 'Redo · Ctrl+Shift+Z / Ctrl+Y', {
      exact: true,
    })
    .click()
  await expect(window.getByRole('menuitem')).toHaveCount(0)
  await frames()
  const after = await witness()
  mutationDelta(
    before,
    after,
    [
      { channel: 'projects:seal-prompt-history', args: [before.tab.id, null] },
      { channel: `projects:${action}`, args: [before.tab.id] },
    ],
    `Intentional ${action} and its own flush/seal`,
  )
  return after
}
async function illustriousApply(style) {
  const opened = pendingStyle
  const sections = sectionOrder.filter(
    (key) => style.payload[key] !== undefined && !['model', 'size', 'seed'].includes(key),
  )
  sections.push('seed')
  const payload = Object.fromEntries(sections.map((key) => [key, style.payload[key]]))
  const { before, after, request } = await applyUi(opened, payload, sections, true)
  pendingStyle = null
  assert.equal(before.tab.canUndo, false)
  assert.equal(after.tab.canUndo, true)
  const undone = await historyUi('undo')
  assert.deepEqual(undone.liveDocument, before.liveDocument)
  assert.equal(undone.tab.canUndo, false, 'Rapid double Apply must add only one Undo step')
  assert.equal(undone.tab.canRedo, true)
  assert.deepEqual(undone.sql, before.sql)
  const redone = await historyUi('redo')
  const redoneExpected = { ...after.liveDocument, documentRevision: redone.tab.documentRevision }
  assert.deepEqual(redone.liveDocument, redoneExpected)
  assert.equal(redone.tab.canUndo, true)
  assert.equal(redone.tab.canRedo, false)
  assert.deepEqual(redone.sql, before.sql)
  assert.equal(redone.packageSha256, fixture.originalPackageSha256)
  report.expectedActions.push({ kind: 'one-undo-redo', before, after, undone, redone })
  // Consumed-token replay is a real stale owner refusal with zero additional document edits.
  await refused(
    adapter.method,
    request,
    'EDIT_CONFLICT',
    'Successful UI Apply consumes its ephemeral review token',
  )
  await snapshot('01-illustrious-apply-undo-redo')
  check(
    '06 Real Illustrious UI Apply retries the same refused review token, copies literal/empty/zero/empty-LoRA/supplied-only sampling values, double activation yields one exact Patch Undo/Redo and never saves or rewrites sources',
  )
}
async function animaApply(preset) {
  const patch = fixture.patches[1]
  assert.equal(
    patch.visible,
    false,
    'Declared hidden target exercises authoring independently of visibility',
  )
  await selectPatch(patch)
  const opened = await openPreset(preset, patch)
  await checkbox(opened.dialog, 'Seed').check()
  const sections = sectionOrder.filter(
    (key) => preset.payload[key] !== undefined && !['size', 'seed'].includes(key),
  )
  sections.push('seed')
  const payload = Object.fromEntries(sections.map((key) => [key, preset.payload[key]]))
  const { before, after } = await applyUi(opened, payload, sections)
  const previous = before.liveDocument.layers.find(({ id }) => id === patch.id).generationDraft
  const actual = after.liveDocument.layers.find(({ id }) => id === patch.id).generationDraft
  assert.equal(actual.sampling.animaMethod, 'heun')
  assert.equal(actual.sampling.sampler, previous.sampling.sampler)
  assert.equal(actual.sampling.scheduler, previous.sampling.scheduler)
  assert.deepEqual(actual.negativePrompt, previous.negativePrompt)
  await snapshot('02-anima-apply')
  check(
    '07 Hidden Anima target authors without runtime: native method changes only its supplied member; Project, Illustrious otherPatch, inactive SD settings, geometry/mask/accepted provenance and seed cursor remain exact',
  )
}
async function lockedTarget() {
  const patch = fixture.patches[2]
  await selectPatch(patch)
  const before = await witness(),
    launcher = view().getByRole('button', { name: adapter.launcher, exact: true })
  await expect(launcher).toBeDisabled()
  await launcher.locator('..').hover()
  await expect(window.getByText(adapter.lockedReason, { exact: true })).toBeVisible()
  await screenshot('locked-target-visible-refusal')
  await window.mouse.move(0, 0)
  const reply = await refused(
    adapter.reviewMethod,
    adapter.review(before.tab, patch),
    'PROJECT_LAYER_LOCKED',
    'Already locked target refuses before issuing any review token',
  )
  assert.equal(reply.error.message, adapter.lockedReason)
  await unchanged(before, 'Locked launcher/real Main review refusal preserves every owner')
  check(
    '08 Locked target remains visible with explicit unlock reason; actual Main refuses review before token issuance; locked-after-review Apply race stays assigned to root unit coverage',
  )
}
async function contextInvalidation(preset) {
  const first = fixture.patches[0],
    other = fixture.patches[1]
  await selectPatch(first)
  const opened = await openPreset(preset, first)
  await expand(opened.dialog, 'prompt')
  await promptEditor(opened.dialog).fill('Must never follow selection to otherPatch')
  await selectPatch(other, { underModal: true })
  await expect(opened.dialog).toHaveCount(0)
  const before = await witness()
  const replacement = await openPreset(preset, other)
  await expand(replacement.dialog, 'prompt')
  await expectPrompt(replacement.dialog, preset.payload.prompt.text)
  assert.notEqual(replacement.review.reviewToken, opened.review.reviewToken)
  await cancelApply(replacement)
  await unchanged(before, 'New otherPatch preview never inherits an obsolete detached copy')
  check(
    '09 Deliberate actual DOM same-document layer-context change closes old Smart preview; separate navigation-seal witness preserves state and a new owner gets fresh source values/token',
  )
}
async function directRefusals(preset) {
  const patch = fixture.patches[0],
    other = fixture.patches[1]
  await selectPatch(patch)
  const tab = await current(),
    review = await freshReview(patch)
  const base = adapter.request(review, preset, { prompt: preset.payload.prompt }, ['prompt'])
  await refused(
    adapter.method,
    { ...base, documentRevision: randomUUID() },
    'EDIT_CONFLICT',
    'Stale document revision never mutates current owner',
  )
  await refused(
    adapter.method,
    { ...base, layerId: other.id },
    'EDIT_CONFLICT',
    'Token cannot be retargeted to otherPatch in the same document',
  )
  const newer = await freshReview(patch)
  assert.notEqual(newer.reviewToken, review.reviewToken)
  await refused(
    adapter.method,
    base,
    'EDIT_CONFLICT',
    'New review invalidates older token even at identical document revision',
  )
  for (const [label, request] of [
    [
      'Public preload refuses selected Size alone before IPC',
      adapter.request(newer, preset, { size: { width: 640, height: 512 } }, ['size']),
    ],
    [
      'Public preload refuses selected Size with prompt before IPC',
      adapter.request(
        newer,
        preset,
        { prompt: preset.payload.prompt, size: { width: 640, height: 512 } },
        ['prompt', 'size'],
      ),
    ],
    [
      'Public preload refuses an unknown Smart envelope field before IPC',
      {
        ...adapter.request(newer, preset, { prompt: preset.payload.prompt }, ['prompt']),
        owner: { layerId: patch.id },
      },
    ],
  ])
    await refused(adapter.method, request, 'PROJECT_INVALID_INPUT', label, 'preload')
  const unchangedPrompt = (await current()).layers.find(({ id }) => id === patch.id).generationDraft
    .positivePrompt
  const positiveControl = adapter.request(
    newer,
    preset,
    {
      prompt: unchangedPrompt,
      size: { width: -1, height: 'unfinished' },
    },
    ['prompt'],
  )
  const beforeControl = await witness()
  const sourceRequestWitness = await window.evaluate(
    async ({ tabId, method, request }) => {
      const before = structuredClone(request)
      const reply = await window.api.projects[method](tabId, request)
      return { before, after: structuredClone(request), reply }
    },
    { tabId: beforeControl.tab.id, method: adapter.method, request: positiveControl },
  )
  assert.deepEqual(sourceRequestWitness.before, positiveControl)
  assert.deepEqual(
    sourceRequestWitness.after,
    sourceRequestWitness.before,
    'Public preload must not mutate the renderer source request',
  )
  const positiveReply = sourceRequestWitness.reply
  assert.equal(positiveReply.ok, true, JSON.stringify(positiveReply))
  const projectedMainRequest = {
    ...positiveControl,
    payload: { prompt: structuredClone(unchangedPrompt) },
  }
  await unchanged(
    beforeControl,
    'Preload projects malformed unselected Size out; original Main receives only selected prompt and adds no history or geometry edit',
    [{ channel: adapter.channel, args: [beforeControl.tab.id, projectedMainRequest] }],
  )
  report.expectedActions.push({
    kind: 'preload-selection-projection-noop-control',
    sourceRequestWitness,
    projectedMainRequest,
    reply: positiveReply,
  })
  assert.equal((await current()).documentRevision, tab.documentRevision)
  await snapshot('03-after-direct-refusals')
  check(
    '10 Original Main refuses stale revision/owner/token; public preload refuses selected Size/unknown envelope without Main invocation and projects unselected malformed Size before a genuine Main no-op; exact state preserved',
  )
}
async function saveAndReopen() {
  const before = await witness()
  assert.equal(
    before.packageSha256,
    fixture.originalPackageSha256,
    'Package unchanged through every Apply/Undo/refusal',
  )
  await snapshot('04-dirty-before-explicit-save')
  const save = view().getByRole('button', { name: 'Save Project', exact: true })
  await save.click()
  await expect(save).toBeEnabled()
  await expect(view().locator('.document-state')).toHaveText('Saved')
  await expect.poll(async () => (await current()).dirty).toBe(false)
  const loaded = await readIgsPackage(fixture.path),
    saved = await current()
  const expected = { ...before.liveDocument, lastActualSeedSnapshot: 0 }
  assert.deepEqual(
    loaded.project,
    expected,
    'Explicit real Save must preserve the exact applied document',
  )
  assert.deepEqual(loaded.project.generationDraft, fixture.saved.generationDraft)
  for (const input of fixture.inputs)
    assert.ok(
      (await loaded.readMember(input.member)).equals(input.bytes),
      'Source PNG changed after Save',
    )
  assert.notEqual(digest(readFileSync(fixture.path)), fixture.originalPackageSha256)
  await sourcesUnchanged()
  const cursorBefore = before.sql.tables.generation_seed_cursor
  assert.deepEqual(sourceRows().tables.generation_seed_cursor, cursorBefore)
  report.expectedActions.push({
    kind: 'explicit-save',
    before,
    saved,
    loadedDocument: loaded.project,
    ipc: (await mutations()).slice(before.mutations.length),
  })
  await snapshot('05-saved-real-loader')
  await window.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveCount(0)
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  await expect(view()).toBeVisible()
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  const reopened = await witness()
  assert.equal(reopened.tab.dirty, false)
  assert.equal(reopened.tab.canUndo, false)
  assert.equal(reopened.tab.canRedo, false)
  assert.deepEqual(reopened.liveDocument, loaded.project)
  assert.deepEqual(reopened.sql.tables.generation_seed_cursor, cursorBefore)
  await sourcesUnchanged()
  await snapshot('06-clean-reopened')
  check(
    '11 Package stays byte-exact until explicit UI Save; actual loader and UI close/reopen preserve both applied Patch drafts, original assets/provenance and seed cursor with no preset link; runtime-free placeholder preview is permitted',
  )
}
function verifyRetainedBytes() {
  for (const item of report.snapshots) {
    assert.ok(lstatSync(item.path).isFile() && !lstatSync(item.path).isSymbolicLink())
    const bytes = readFileSync(item.path)
    assert.equal(bytes.length, item.bytes)
    assert.equal(digest(bytes), item.sha256)
  }
  for (const input of fixture.inputs)
    assert.ok(readFileSync(input.retained).equals(input.bytes), 'Full source PNG not retained')
  for (const entry of report.databaseCheckpoints) {
    const db = new Database(entry.path, { readonly: true, fileMustExist: true })
    try {
      assert.deepEqual(db.prepare('PRAGMA integrity_check').all(), [{ integrity_check: 'ok' }])
      assert.deepEqual(databaseState(db), entry.state)
    } finally {
      db.close()
    }
  }
}
async function finish() {
  lastOpenWitness = await witness()
  await snapshot('07-final-open-before-close')
  const offset = (await mutations()).length
  await window.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveCount(0)
  report.expectedActions.push({ kind: 'last-ui-close', calls: (await mutations()).slice(offset) })
  await restoreObserver()
  await closeNative('smart-preset-apply-complete')
  // DB first: retained even if product payload enumeration/readback fails afterward.
  await snapshot('08-final-after-last-ui-and-physical-exit', true)
  report.finalDatabaseAfterLastUiAndNativeExit = true
  verifyRetainedBytes()
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.samplerError, undefined)
  assert.equal(report.nativeClosures.length, 1)
  assert.equal(report.nativeClosures[0].confirmed, true)
  check(
    '12 Full source PNGs/presets/packages/autosaves/input dependencies and all standalone SQLite checkpoints retained; final SQL taken after last UI action and healthy physical exit; original Main handlers restored; no cleanup',
  )
}
async function diagnostics() {
  if (!window || window.isClosed()) return
  for (const [name, operation] of [
    ['failure.aria.txt', () => window.locator('body').ariaSnapshot()],
    ['failure.html', () => window.content()],
  ])
    try {
      const file = path.join(evidenceRoot, name)
      writeFileSync(file, await operation(), { flag: 'wx', mode: 0o600 })
      report.snapshots.push({
        path: file,
        bytes: lstatSync(file).size,
        sha256: digest(readFileSync(file)),
      })
    } catch (error) {
      ;(report.diagnosticErrors ??= []).push({ name, error: String(error) })
    }
  await screenshot('failure').catch((error) => {
    report.failureScreenshotError = String(error)
  })
  if (existsSync(path.join(appDataRoot, 'database/app.sqlite')))
    await snapshot('failure-before-exit').catch((error) => {
      report.failureSnapshotError = String(error)
    })
}
try {
  // Root executes this; authoring/syntax/Prettier never enters this block.
  report.inventory = await Promise.all(
    [
      ['du', ['-sk', artifactRoot]],
      ['du', ['-k', '--max-depth=1', artifactRoot]],
      ['df', ['-Pk', artifactRoot]],
      ['git', ['rev-parse', 'HEAD']],
      ['git', ['status', '--short']],
    ].map(async ([file, args]) => ({
      command: [file, ...args],
      ...(await nativeExec(file, args, { timeout: 15_000, maxBuffer: 64 * 1024 })),
    })),
  )
  report.launcher = await verifyLauncherDeadline()
  sourceFiles = [
    ...new Set([
      ...['src', 'docs/prototype-app/src'].flatMap((directory) =>
        filesBelow(path.join(root, directory)),
      ),
      ...[
        'src/main/index.ts',
        'src/preload/index.ts',
        'scripts/smoke-smart-patch-preset-apply.mjs',
        'scripts/smoke-preset-apply.mjs',
        'scripts/smoke-smart-patch-comparison.mjs',
        'scripts/native-smoke-window.mjs',
        'scripts/qualification-resource-limits.mjs',
        'package.json',
        'pnpm-lock.yaml',
        'vite.desktop.config.ts',
        'worker-python/src/imagegen_worker/srgb.icc',
      ].map((file) => path.join(root, file)),
    ]),
  ].sort()
  bundleFiles = ['dist/main/main.cjs', 'dist/preload/preload.cjs', 'dist/renderer/index.html'].map(
    (file) => path.join(root, file),
  )
  bundleFiles.push(
    ...['dist/renderer/assets', 'dist/main/migrations', 'dist/main/placeholders'].flatMap(
      (directory) => filesBelow(path.join(root, directory)),
    ),
  )
  report.sourceSha256 = hashes(sourceFiles)
  report.bundleSha256 = hashes(bundleFiles)
  retainJson('source-build-script-hashes.json', {
    source: report.sourceSha256,
    build: report.bundleSha256,
  })
  await prepare()
  await launch()
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  assert.deepEqual(await api('models', 'getCatalog'), [])
  await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  await expect(view()).toBeVisible()
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  const presets = await createPresets()
  const initial = await witness()
  assert.equal(initial.tab.canUndo, false)
  assert.equal(initial.tab.dirty, false)
  assert.deepEqual(initial.liveDocument, fixture.saved)
  assert.equal(initial.sql.tables.generation_seed_cursor.length, 1)
  assert.equal(initial.sql.tables.generation_seed_cursor[0].actual_seed, 0)
  for (const table of ['generation_queue_item', 'generation_candidate_receipt'])
    assert.deepEqual(initial.sql.tables[table], [])
  report.baseline = initial
  await snapshot('00-initial-native')
  check(
    '01 Strict accepted portable fixtures/source PNGs and distinct Project/Illustrious/Anima/locked drafts survive real Main startup; no runtime/catalog/queue and seed0 cursor exact under verified finite limits',
  )
  await detachedControls(presets.style)
  await layoutAndKeyboard(presets.style)
  await originalAndModels(presets.style, presets.missing)
  await missingResources(presets.style, presets.missing, presets.sizeOnly)
  await illustriousApply(presets.style)
  await animaApply(presets.anima)
  await lockedTarget()
  await contextInvalidation(presets.style)
  await directRefusals(presets.style)
  await saveAndReopen()
  await finish()
  assert.equal(report.checks.length, 12)
  assert.deepEqual(
    hashes(sourceFiles),
    report.sourceSha256,
    'Source changed during native qualification',
  )
  assert.deepEqual(
    hashes(bundleFiles),
    report.bundleSha256,
    'Build changed during native qualification',
  )
  report.outcome = 'passed'
} catch (error) {
  process.exitCode = 1
  report.outcome = 'failed'
  report.failure = { message: error.message, stack: error.stack }
  checkpoint()
  await diagnostics().catch((error) => {
    report.diagnosticsFailure = String(error)
  })
} finally {
  if (application) {
    try {
      await restoreObserver()
    } catch (error) {
      report.observerRestorationFailure = String(error)
    }
    try {
      await closeNative('failure-owned-actor', true)
    } catch (error) {
      report.physicalExitFailure = String(error)
    }
    if (report.observerRestorationFailure || report.physicalExitFailure) {
      process.exitCode = 1
      report.outcome = 'failed'
    }
  }
  clearInterval(sampler)
  if (
    existsSync(path.join(appDataRoot, 'database/app.sqlite')) &&
    !report.finalDatabaseAfterLastUiAndNativeExit
  ) {
    // Do not call snapshot() here: its other witnesses may be precisely what failed.
    const physicallyExited =
      !application &&
      !report.nativeLaunchError &&
      report.nativeClosures.length === (report.nativeLaunchAttempts ?? 0) &&
      report.nativeClosures.every(({ confirmed }) => confirmed)
    try {
      await retainDatabase(
        physicallyExited
          ? 'failure-final-after-last-ui-and-physical-exit'
          : 'failure-final-native-exit-unconfirmed',
        physicallyExited,
      )
      report.failureFinalDatabaseRetained = physicallyExited
      if (!physicallyExited) report.finalDatabaseNeedsRootPhysicalExitCheckpoint = true
    } catch (error) {
      report.failureFinalDatabaseError = String(error)
    }
    try {
      const files = dataFiles().map((file) =>
        retain(file, `failure-final-payload/data/${path.relative(appDataRoot, file)}`),
      )
      report.failureFinalRetainedPayloads = files
    } catch (error) {
      report.failureFinalPayloadError = String(error)
    }
  }
  lifecycle.state = 'retained'
  lifecycle.disposition = {
    retainedEvidence: evidenceRoot,
    disposablePayloads: [fixtureRoot, temporaryDirectory],
    owner: 'root',
    deletedBytes: 0,
    physicalExitConfirmed:
      !application &&
      !report.nativeLaunchError &&
      report.nativeClosures.length === (report.nativeLaunchAttempts ?? 0) &&
      report.nativeClosures.every(({ confirmed }) => confirmed),
    observerRestored: !observerInstalled && !report.observerRestorationFailure,
    finalDatabaseRetained:
      report.finalDatabaseAfterLastUiAndNativeExit === true ||
      report.failureFinalDatabaseRetained === true,
    releaseCondition:
      'Root verifies all retained PNG/preset/package/autosave/queue/receipt/input bytes, every consistent standalone SQLite checkpoint and PID/start/cgroup exit before disposing only declared payloads/TMPDIR. No runner deletion.',
  }
  report.finishedAt = new Date().toISOString()
  if (previousTemporaryDirectory === undefined) delete process.env.TMPDIR
  else process.env.TMPDIR = previousTemporaryDirectory
  checkpoint()
  console.log(`${report.outcome.toUpperCase()} ${reportFile}`)
}
