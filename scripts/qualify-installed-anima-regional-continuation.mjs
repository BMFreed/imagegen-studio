/**
 * Opt-in, zero-generation continuation of the failed installed Anima regional run:
 * pnpm exec tsx scripts/qualify-installed-anima-regional-continuation.mjs \
 *   --previous ABS_REPORT --sha256 REPORT_SHA256 --artifacts FRESH_OWNED_DIR
 *
 * The previous report remains FAILED. It supplies measured three-request/frozen
 * RGB evidence and a successful Results Add stopped by a harness-only DTO assertion.
 * This script uses actual Home Recover, recovered-Raster visibility edit history,
 * explicit Save and reopen. Recovery intentionally starts a new history; ordinary
 * Raster has no Remove action. Original Add Undo/Redo remains UNVERIFIED here.
 * No Generate, Retry, Cancel, acceptance, model mutation, runtime injection, worker
 * replacement, provisioning, manual shadow rewrite or artifact cleanup is performed.
 *
 * Reuses existing installed harness patterns and exported resource/window/IGS
 * owners. InvokeAI source basis remains ae06c1bd36218100f89a48ff5b8855751d06a898;
 * this continuation changes no inference, queue or persistence implementation.
 * UI evidence follows .codex/skills/ui-audit: screenshots need ROOT visual review.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, writeFileSync } from 'node:fs'
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { inflateSync } from 'node:zlib'

import { _electron as electron, expect } from '@playwright/test'
import { sql } from 'kysely'

import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'
import { assertRuntimeIdle, assertUpgradeBounds, treeManifest } from './upgrade-qualification-worker.mjs'

assert.equal(process.argv.length, 8)
assert.deepEqual([process.argv[2], process.argv[4], process.argv[6]], ['--previous', '--sha256', '--artifacts'])
const previousPath = process.argv[3], previousSha256 = process.argv[5], artifacts = process.argv[7]
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const exec = promisify(execFile)
const within = (root, value) => {
  const relative = path.relative(root, value)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}
async function regular(file, maximum = Number.MAX_SAFE_INTEGER) {
  assert.ok(path.isAbsolute(file) && path.resolve(file) === file)
  const entry = await lstat(file)
  assert.ok(entry.isFile() && !entry.isSymbolicLink() && entry.size <= maximum)
  assert.equal(await realpath(file), file)
  return entry
}
async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}
async function verifyPreviousSourcePins(phase) {
  const verified = {}
  for (const [name, expected] of Object.entries(previous.sourcePins)) {
    // Only the qualified observer's disclosed DTO/wait assertions were corrected.
    if (name === 'scripts/qualify-installed-anima-regional.mjs') continue
    assert.ok(!path.isAbsolute(name) && within(process.cwd(), path.resolve(name)))
    assert.equal(await hashFile(path.resolve(name)), expected, `Prior production/build source changed: ${name}`)
    verified[name] = expected
  }
  report.previousSourceBinding ??= {}
  report.previousSourceBinding[phase] = verified
  checkpoint()
}
async function json(file) {
  await regular(file, 16 * 1024 ** 2)
  return JSON.parse(await readFile(file, 'utf8'))
}
assert.match(previousSha256, /^[a-f0-9]{64}$/)
await regular(previousPath, 16 * 1024 ** 2)
assert.equal(await hashFile(previousPath), previousSha256)
const previous = await json(previousPath)
assert.equal(previous.profile, 'installed-anima-regional-v1')
assert.equal(previous.status, 'failed')
assert.equal(previous.retry.rgbExactHealthyControl, true)
const appData = previous.fixture.appData, project = previous.project
assert.equal(appData, path.join(artifactRoot, 'shared/regional-public-worker-014-20261103/data/imagegen-studio'))
for (const value of [previousPath, artifacts]) assert.ok(path.isAbsolute(value) && path.resolve(value) === value && within(artifactRoot, value))
assert.ok(!within(appData, artifacts) && !within(artifacts, appData))
assert.equal(existsSync(artifacts), false, 'Continuation requires fresh evidence; no reset exists')
const priorSnapshots = previous.lifetimes.map(({ observers }) => observers)
for (const snapshot of priorSnapshots) { assert.equal(snapshot.restored, true); assert.deepEqual(snapshot.faults, []) }
const priorWires = priorSnapshots.flatMap(({ workers }) => workers.flatMap(({ writes }) => writes.filter(({ type }) => type === 'execute-current-canvas-anima-regional')))
assert.equal(priorWires.length, 3)
const priorCalls = priorSnapshots.flatMap(({ ipc }) => ipc)
const acceptedCalls = priorCalls.filter(({ channel }) => channel === 'projects:accept-generation-candidates')
assert.equal(acceptedCalls.length, 1)
assert.equal(acceptedCalls[0].ok, true)
assert.equal(acceptedCalls[0].finished, true)
assert.equal(priorCalls.filter(({ channel }) => channel === 'projects:undo' || channel === 'projects:redo').length, 0)
assert.ok(previous.lifetimes.every(({ physicalExit }) => physicalExit?.confirmed === true))
const frozen = JSON.parse(previous.canceled.frozen_payload_json)
assert.equal(frozen.kind, 'anima-regional-txt2img')
assert.equal(frozen.compositionProfile, 'invoke-krea2-global-support-v1')
assert.equal(frozen.promptInterpretation, 'invoke-fragments-v1')
assert.equal(sha(Buffer.from(previous.canceled.frozen_payload_json)), previous.retry.frozenPayloadSha256)
const pngPath = path.join(path.dirname(previousPath), 'frozen-retry.png')
const controlPath = path.join(path.dirname(previousPath), 'healthy-control.png')
const started = Date.now(), endAt = started + 600_000
const timeout = (maximum = 30_000) => {
  const remaining = endAt - Date.now()
  assert.ok(remaining > 0, 'Original 600-second continuation deadline exceeded')
  return Math.min(maximum, remaining)
}
await mkdir(artifacts, { mode: 0o700 })
const reportPath = path.join(artifacts, 'report.json')
const report = {
  schemaVersion: 1, profile: 'installed-anima-regional-continuation-v1', status: 'running',
  previous: { path: previousPath, sha256: previousSha256, status: previous.status, requestCount: 3, frozenRgbExact: previous.retry.rgbExactHealthyControl, successfulResultsAdd: true },
  scope: { generationBudget: 0, originalAddUndoRedo: 'UNVERIFIED: prior run stopped before Undo; recovery starts a new history', recoveredHistory: 'Hide, Undo Show, Redo Hide, Undo Show; same Raster and bytes throughout', visual: 'Screenshots retained for ROOT inspection, not automatic visual acceptance', cleanup: 'No manual deletion or cleanup' },
  appData, project: { id: project.id, file: project.file, title: project.title },
  startedAt: new Date(started).toISOString(), screenshots: [], pageErrors: [], limits: [], checks: [],
}
const checkpoint = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
const statIdentity = (entry) => ({ device: entry.dev, inode: entry.ino, mode: entry.mode, links: entry.nlink, bytes: entry.size, modified: entry.mtimeMs, changed: entry.ctimeMs })
let application, window, database, provision, marker, pointer, installed, initialSql
let periodic, timer, pending = Promise.resolve(), closing, error
const checks = []
async function snapshotSql() {
  const names = (await sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`.execute(database.db)).rows.map(({ name }) => name)
  const result = {}
  for (const name of names) {
    assert.match(name, /^[a-zA-Z_][a-zA-Z0-9_]*$/)
    result[name] = (await sql.raw(`SELECT * FROM "${name}"`).execute(database.db)).rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  }
  return result
}
function assertSqlPreserved(after) {
  assert.deepEqual(Object.keys(after), Object.keys(initialSql))
  const cache = (name, row) => JSON.stringify(name === 'project_index' ? { ...row, indexed_at: null } : row)
  report.sqlExceptions = [
    { table: 'project_index', field: 'indexed_at', scope: 'Original Home scan timestamp only' },
    { table: 'project_index', projectKey: project.id, scope: 'Owned recovered Project explicit Save updates its own document/index' },
    { table: 'project_accepted_result_index', projectKey: project.id, scope: 'Owned saved Raster creates one accepted-result index row' },
  ]
  for (const [name, rows] of Object.entries(initialSql)) {
    if (name === 'project_index' || name === 'project_accepted_result_index') {
      const old = rows.filter(({ local_project_key }) => local_project_key !== project.id)
      const retained = after[name].filter(({ local_project_key }) => local_project_key !== project.id)
      assert.deepEqual(retained.map((row) => cache(name, row)).sort(), old.map((row) => cache(name, row)).sort(), `Pre-existing ${name} changed`)
    } else assert.deepEqual(after[name], rows, `Continuation changed protected ${name}`)
  }
  assert.equal(after.project_accepted_result_index.filter(({ local_project_key }) => local_project_key === project.id).length, 1)
}
/** Observe originals without withholding or modifying any call or wire. */
async function installObservers() {
  await application.evaluate(({ ipcMain }, artifact) => {
    const cp = process.getBuiltinModule('child_process')
    const state = { workers: [], calls: [], faults: [], restores: [] }
    if (globalThis.__animaContinuation) throw new Error('Observer already installed')
    globalThis.__animaContinuation = state
    const fault = (error) => state.faults.push(String(error.stack ?? error))
    const originalSpawn = cp.spawn, descriptor = Object.getOwnPropertyDescriptor(cp, 'spawn')
    const wrapper = function (...args) {
      const child = Reflect.apply(originalSpawn, this, args)
      try {
        if (!args[1]?.some((value) => typeof value === 'string' && value.startsWith('imagegen_worker'))) return child
        if (state.workers.length >= 64) throw new Error('Worker observer exceeds finite bound')
        const worker = { pid: child.pid, executable: args[0], args: args[1], writes: [], originalCalls: 1 }
        state.workers.push(worker)
        const original = child.stdin.write, before = Object.getOwnPropertyDescriptor(child.stdin, 'write')
        let pending = ''
        const write = function (...values) {
          try {
            pending += Buffer.from(values[0]).toString('utf8')
            if (pending.length > 128 * 1024) throw new Error('Observed JSONL exceeds bound')
            let newline
            while ((newline = pending.indexOf('\n')) >= 0) {
              const line = pending.slice(0, newline)
              pending = pending.slice(newline + 1)
              if (!line) continue
              const message = JSON.parse(line)
              worker.writes.push({ type: message.type, requestId: message.requestId, originalCalls: 1, receiverMatches: this === child.stdin })
              if (/^(generate-|execute-)/.test(message.type)) fault(new Error(`Forbidden new inference wire: ${message.type}`))
            }
          } catch (error) { fault(error) }
          return Reflect.apply(original, this, values)
        }
        child.stdin.write = write
        state.restores.push(() => {
          if (child.stdin.write !== write) throw new Error('stdin observer owner changed')
          if (before) Object.defineProperty(child.stdin, 'write', before)
          else delete child.stdin.write
          if (child.stdin.write !== original) throw new Error('stdin restoration differs')
        })
      } catch (error) { fault(error) }
      return child
    }
    cp.spawn = wrapper
    process.getBuiltinModule('module').syncBuiltinESMExports()
    state.restores.push(() => {
      if (cp.spawn !== wrapper) throw new Error('spawn observer owner changed')
      Object.defineProperty(cp, 'spawn', descriptor)
      process.getBuiltinModule('module').syncBuiltinESMExports()
    })
    for (const channel of ['projects:generate', 'projects:retry-generation-job', 'projects:cancel-generation-job', 'projects:accept-generation-candidates', 'projects:resolve-recovery', 'projects:update-raster-layer', 'projects:undo', 'projects:redo', 'projects:save', 'projects:close']) {
      const original = ipcMain._invokeHandlers.get(channel)
      if (!original) throw new Error(`Missing original handler ${channel}`)
      const wrapper = async function (...args) {
        let record
        try {
          if (state.calls.length >= 256) throw new Error('IPC observation exceeds bound')
          record = { channel, args: structuredClone(args.slice(1)), originalCalls: 1, finished: false }
          state.calls.push(record)
        } catch (error) { fault(error) }
        try {
          const result = await Reflect.apply(original, this, args)
          if (record) record.ok = result?.ok
          return result
        } finally { if (record) record.finished = true }
      }
      ipcMain._invokeHandlers.set(channel, wrapper)
      state.restores.push(() => {
        if (ipcMain._invokeHandlers.get(channel) !== wrapper) throw new Error('IPC observer owner changed')
        ipcMain._invokeHandlers.set(channel, original)
      })
    }
    state.artifact = artifact
  }, artifacts)
}
async function observers(restore = false) {
  return await application.evaluate((_electron, restore) => {
    const state = globalThis.__animaContinuation
    if (restore) { for (const callback of state.restores.toReversed()) callback(); state.restored = true }
    return { workers: state.workers, calls: state.calls, faults: state.faults, restored: state.restored ?? false }
  }, restore)
}
async function bounds(label) {
  const value = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds: report.nativeDeadlineSeconds,
    execute: (file, args, options) => exec(file, args.map((arg) => arg === 'MemoryMax=12G' ? 'MemoryMax=10G' : arg), options),
  })
  const groups = new Map(value.groups.map(({ group, memoryMax }) => [group, BigInt(memoryMax)]))
  groups.set(report.launcherBounds.group, BigInt(report.launcherBounds.memoryMax))
  const total = [...groups.values()].reduce((sum, limit) => sum + limit, 0n)
  assert.ok(total <= 12n * 1024n ** 3n)
  checks.push(value)
  report.limits.push({ label, aggregateUniqueMax: String(total), ...value })
  checkpoint()
}
async function closeNative() {
  if (closing) return await closing
  closing = (async () => {
    if (!application) return
    clearInterval(periodic)
    await pending
    await bounds('before-close')
    report.observers = await observers(true)
    assert.deepEqual(report.observers.faults, [])
    if (database) { await database.close(); database = undefined }
    const native = application, processHandle = native.process()
    let closeTimer
    try {
      await Promise.race([native.close(), new Promise((_, reject) => { closeTimer = setTimeout(() => reject(new Error('Owned native close exceeded 10s')), 10_000) })])
    } catch (caught) {
      report.closeError = String(caught.stack ?? caught)
      const last = checks.findLast(({ processIdentities }) => processIdentities.some(({ pid }) => pid === processHandle.pid))
      const identity = last?.processIdentities.find(({ pid }) => pid === processHandle.pid)
      const group = last?.groups.find(({ ownedScope, pids }) => ownedScope && pids.includes(processHandle.pid))
      assert.ok(identity && group, 'Failure stop requires exact owned scope/PID/start')
      report.stop = await stopExpiredQualificationProcess({ ...identity, group: group.group })
    } finally { clearTimeout(closeTimer) }
    report.physicalExit = await confirmQualificationProcessExit(checks)
    assert.equal(report.physicalExit.confirmed, true)
    application = undefined
    window = undefined
    await assertRuntimeIdle(appData, await realpath(pointer.pythonExecutable))
  })().finally(() => { closing = undefined })
  return await closing
}
async function api(method, ...args) {
  const result = await window.evaluate(({ method, args }) => window.api.projects[method](...args), { method, args })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function current() {
  const value = await api('open', project.id)
  assert.equal(value.kind, 'opened')
  return value.tab
}
const canvas = () => window.getByRole('region', { name: 'Project Canvas', exact: true })
async function screenshot(name) {
  const file = path.join(artifacts, `${name}.png`)
  await window.screenshot({ path: file, animations: 'disabled', timeout: timeout() })
  report.screenshots.push({ path: file, inspection: 'Pending ROOT visual review' })
  checkpoint()
}
async function fetchImage(url) {
  return Buffer.from(await application.evaluate(async ({ net }, url) => {
    const response = await net.fetch(url)
    if (!response.ok) throw new Error('Signed Raster PNG unavailable')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > 32 * 1024 ** 2) throw new Error('Signed Raster PNG exceeds the existing bound')
    return [...bytes]
  }, url))
}
function decodeRgb(bytes) {
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
  let offset = 8, width, height, channels, icc, parts = []
  while (offset < bytes.length) {
    const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8)
    const data = bytes.subarray(offset + 8, offset + 8 + size)
    assert.equal(data.length, size)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      assert.equal(data[8], 8); assert.equal(data[9], 2); assert.equal(data[12], 0); channels = 3
    } else if (type === 'iCCP') icc = sha(inflateSync(data.subarray(data.indexOf(0) + 2), { maxOutputLength: 1024 ** 2 }))
    else if (type === 'IDAT') parts.push(data)
    offset += size + 12
  }
  assert.equal(width, 512); assert.equal(height, 512); assert.equal(icc, IGS_SRGB_ICC_SHA256)
  const stride = width * channels, raw = inflateSync(Buffer.concat(parts), { maxOutputLength: (stride + 1) * height })
  assert.equal(raw.length, (stride + 1) * height)
  const rgb = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < stride; x++) {
    const filter = raw[y * (stride + 1)], left = x >= 3 ? rgb[y * stride + x - 3] : 0
    const up = y ? rgb[(y - 1) * stride + x] : 0, corner = y && x >= 3 ? rgb[(y - 1) * stride + x - 3] : 0
    const p = left + up - corner, distances = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)]
    const paeth = distances[0] <= distances[1] && distances[0] <= distances[2] ? left : distances[1] <= distances[2] ? up : corner
    assert.ok(filter <= 4)
    rgb[y * stride + x] = (raw[y * (stride + 1) + x + 1] + [0, left, up, Math.floor((left + up) / 2), paeth][filter]) & 255
  }
  return rgb
}
function assertRaster(layer, visible = true) {
  assert.equal(layer.kind, undefined)
  assert.equal(layer.resultComparisonSourceKind, 'raster')
  assert.equal(layer.resultPresetSourceKind, 'raster')
  assert.equal(layer.visible, visible)
  assert.equal(layer.opacity, 1); assert.equal(layer.blendMode, 'normal'); assert.equal(layer.locked, false)
  assert.equal(layer.width, 512); assert.equal(layer.height, 512)
  assert.deepEqual(layer.transform, { x: -13, y: 5, scaleX: 1, scaleY: 1, rotationDegrees: 0 })
}
function assertProvenance(provenance, bytes) {
  const context = frozen.context, component = ({ byteSize, localModelId, localVersionId, sha256 }) => ({ byteSize, localModelId, localVersionId, sha256 })
  assert.equal(provenance.kind, 'anima-txt2img')
  assert.equal(provenance.schemaVersion, 1)
  assert.deepEqual(provenance.generationConfiguration, {
    anima: { architecture: 'anima-base-1.0', checkpointByteSize: context.model.checkpoint.byteSize, qwen3Encoder: component(context.model.qwen3Encoder), vae: component(context.model.vae) },
    ...(context.cfgRescale !== undefined ? { cfgRescale: context.cfgRescale } : {}),
    ...(context.vaePrecision !== undefined ? { vaePrecision: context.vaePrecision } : {}),
    loras: [], mode: 'txt2img', model: context.model.checkpoint.reference,
    negativePrompt: { embeddingRefs: [], text: context.prompts.negative }, positivePrompt: { embeddingRefs: [], text: context.prompts.positive },
    sampling: { actualSeed: 123, animaMethod: 'euler', cfgScale: 4, requestedSeedPolicy: 'fixed', seedBehavior: 'per-iteration', steps: 20 },
    size: { width: 512, height: 512 },
  })
  assert.equal(provenance.executionResultContext.queueItemId, previous.retry.id)
  assert.equal(provenance.executionResultContext.candidateId, previous.retry.id)
  assert.deepEqual(provenance.executionResultContext.output, { byteSize: bytes.length, colorSpace: 'srgb', format: 'png', width: 512, height: 512, iccSha256: IGS_SRGB_ICC_SHA256, sha256: sha(bytes) })
  assert.equal(provenance.layerSourceContext.sourceDocumentId, context.documentId)
  assert.equal(provenance.layerSourceContext.sourceDocumentRevision, context.documentRevision)
  assert.equal(provenance.layerSourceContext.sourceTargetSha256, frozen.workerJob.target.sha256)
  const encoded = JSON.stringify(provenance)
  for (const word of ['regionalGuidance', 'compositionProfile', 'compiledPrompts', 'regional:', '(red scarf)1.5', '(blue scarf)1.5', appData]) assert.ok(!encoded.includes(word), `Non-base field leaked into provenance: ${word}`)
}
async function run() {
  await verifyPreviousSourcePins('before')
  report.launcherBounds = await assertUpgradeBounds({ maxRuntimeSeconds: 600 })
  assert.ok(BigInt(report.launcherBounds.memoryMax) <= 2n * 1024n ** 3n, 'Launcher requires at most2GiB; native scope retains10GiB')
  provision = await json(previous.fixture.provisionReport.path)
  assert.equal(await hashFile(previous.fixture.provisionReport.path), previous.fixture.provisionReport.sha256)
  assert.equal(provision.installed.editable, false)
  marker = await json(path.join(appData, 'qualification-runtime.json'))
  pointer = await json(path.join(appData, 'runtime/current-runtime.json'))
  assert.equal(pointer.runtimeId, provision.runtimeId); assert.equal(marker.runtimeId, provision.runtimeId)
  assert.equal(marker.report, previous.fixture.provisionReport.path)
  for (const file of Object.values(previous.fixture.baseline)) { await regular(file.path, 16 * 1024 ** 2); assert.equal(await hashFile(file.path), file.sha256) }
  await assertRuntimeIdle(appData, await realpath(pointer.pythonExecutable))
  installed = await treeManifest(provision.installed.workerRoot)
  report.scriptSha256 = await hashFile(path.resolve('scripts/qualify-installed-anima-regional-continuation.mjs'))
  assert.equal(await hashFile(project.file), previous.edited.packageSha256)
  const disk = await readIgsPackage(project.file)
  assert.deepEqual(disk.project.layers, [])
  assert.deepEqual(disk.project.generationDraft, previous.edited.generationDraft)
  const bytes = await readFile(pngPath), control = await readFile(controlPath)
  assert.equal(sha(bytes), previous.control.pngSha256); assert.equal(sha(control), previous.control.pngSha256)
  assert.ok(decodeRgb(bytes).equals(decodeRgb(control)))
  assert.equal(sha(decodeRgb(bytes)), previous.control.rgbSha256)
  report.control = { path: pngPath, pngSha256: sha(bytes), rgbSha256: sha(decodeRgb(bytes)) }
  database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
  initialSql = await snapshotSql(); report.initialSql = initialSql
  const retries = initialSql.generation_queue_item.filter(({ local_project_key }) => local_project_key === project.id)
  assert.equal(retries.length, 3)
  assert.deepEqual(retries.map(({ status }) => status).sort(), ['canceled', 'completed', 'completed'])
  assert.equal(retries.find(({ id }) => id === previous.retry.id).frozen_payload_json, previous.canceled.frozen_payload_json)
  assert.deepEqual(initialSql.generation_queue_item.filter(({ status }) => ['pending', 'running'].includes(status)), [])
  report.protectedProjects = []
  for (const row of initialSql.project_index.filter(({ local_project_key }) => local_project_key !== project.id)) {
    if (!existsSync(row.canonical_path)) continue
    report.protectedProjects.push({ path: row.canonical_path, stat: statIdentity(await regular(row.canonical_path)), sha256: await hashFile(row.canonical_path) })
  }
  await database.close(); database = undefined
  report.nativeDeadlineSeconds = Math.max(1, Math.floor(timeout(600_000) / 1000))
  const env = { ...process.env, NODE_ENV: 'production', XDG_DATA_HOME: path.dirname(appData), XDG_CONFIG_HOME: path.join(artifacts, 'config'), XDG_CACHE_HOME: path.join(artifacts, 'cache') }
  for (const name of ['ELECTRON_RUN_AS_NODE', 'IMAGEGEN_TEST_IMAGE_WORKER', 'IMAGEGEN_DEV_SERVER_URL', 'PYTHONPATH', 'PYTHONHOME', 'CUDA_VISIBLE_DEVICES']) delete env[name]
  application = await electron.launch({ args: ['--ozone-platform=x11', '.'], cwd: process.cwd(), env, timeout: timeout() })
  await bounds('launch')
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(15_000)
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await application.evaluate(({ app, BrowserWindow }, root) => { if (app.getPath('userData') !== root) throw new Error('Unexpected default appData'); BrowserWindow.getAllWindows()[0].setSize(1440, 900) }, appData)
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await installObservers()
  const runtime = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(runtime.ok, true); assert.equal(runtime.value.kind, 'ready'); report.actualRuntime = runtime.value
  periodic = setInterval(() => { pending = pending.then(() => bounds('periodic')).catch((error) => { report.boundsError = String(error.stack ?? error); checkpoint() }) }, 5000)
  database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
  const recovery = window.getByRole('dialog', { name: 'Recovery available', exact: true })
  await expect(recovery).toBeVisible({ timeout: timeout() })
  await screenshot('01-recovery-available')
  await recovery.getByRole('button', { name: 'Recover', exact: true }).click()
  await expect(recovery).toHaveCount(0)
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toBeVisible()
  await expect.poll(async () => (await current()).layers.length, { timeout: timeout() }).toBe(1)
  const recovered = await current(), layer = recovered.layers[0]
  assertRaster(layer)
  assert.deepEqual(recovered.generationDraft, previous.edited.generationDraft)
  assert.deepEqual(recovered.generationDraft.seed, { policy: 'fixed', value: 999 })
  assert.equal(recovered.generationDraft.model, null)
  assert.equal(recovered.canUndo, false, 'Recovery starts a new history; prior Add Undo is not restored')
  assert.equal(recovered.canRedo, false)
  assert.ok((await fetchImage(layer.imageUrl)).equals(bytes))
  assert.equal(await hashFile(project.file), previous.edited.packageSha256, 'Recover must not implicitly Save')
  report.recovered = { layerId: layer.id, dirty: recovered.dirty, canUndo: recovered.canUndo, canRedo: recovered.canRedo, generationDraft: recovered.generationDraft }
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  await screenshot('02-recovered-raster-before-new-history')
  const history = [['Hide', false], ['Undo', true], ['Redo', false], ['Undo', true]]
  report.visibilityHistory = []
  for (const [action, visible] of history) {
    if (action === 'Hide') await window.getByRole('button', { name: `Hide ${layer.name}`, exact: true }).click()
    else await canvas().getByRole('button', { name: action, exact: true }).click()
    await expect.poll(async () => (await current()).layers[0]?.visible).toBe(visible)
    const tab = await current()
    assert.equal(tab.layers.length, 1); assert.equal(tab.layers[0].id, layer.id)
    assertRaster(tab.layers[0], visible)
    assert.ok((await fetchImage(tab.layers[0].imageUrl)).equals(bytes))
    assert.deepEqual(tab.generationDraft, previous.edited.generationDraft)
    assert.equal(await hashFile(project.file), previous.edited.packageSha256)
    report.visibilityHistory.push({ action, visible, layerId: layer.id, layerCount: 1, exactPng: true })
  }
  await screenshot('03-visibility-undo-redo-restored')
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await current()).dirty, { timeout: timeout() }).toBe(false)
  const saved = await readIgsPackage(project.file), raster = saved.project.layers[0]
  assert.equal(saved.project.layers.length, 1); assert.equal(raster.kind, 'raster'); assert.equal(raster.id, layer.id)
  assert.equal(raster.visible, true)
  assert.deepEqual(raster.transform, layer.transform)
  assert.deepEqual(saved.project.generationDraft, previous.edited.generationDraft)
  assert.deepEqual(saved.project.regionalGuidance, previous.edited.regionalGuidance)
  assert.equal(saved.project.lastActualSeedSnapshot, 123)
  assert.equal(raster.asset.sha256, sha(bytes)); assert.equal(raster.asset.bytes, bytes.length)
  assert.ok((await saved.readMember(raster.asset.path)).equals(bytes))
  assertProvenance(raster.generationProvenance, bytes)
  report.saved = { layerId: raster.id, asset: raster.asset, provenance: raster.generationProvenance, packageSha256: await hashFile(project.file) }
  await screenshot('04-explicit-save')
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveCount(0)
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toBeVisible()
  const reopened = await current()
  assert.equal(reopened.dirty, false); assert.equal(reopened.layers.length, 1)
  assert.equal(reopened.layers[0].id, layer.id); assertRaster(reopened.layers[0])
  assert.deepEqual(reopened.generationDraft, previous.edited.generationDraft)
  const delivered = await fetchImage(reopened.layers[0].imageUrl)
  assert.ok(delivered.equals(bytes)); assert.ok(decodeRgb(delivered).equals(decodeRgb(control)))
  await screenshot('05-reopened-signed-raster')
  report.finalSql = await snapshotSql(); assertSqlPreserved(report.finalSql)
  await closeNative()
  assert.equal(report.observers.restored, true)
  for (const channel of ['projects:generate', 'projects:retry-generation-job', 'projects:cancel-generation-job', 'projects:accept-generation-candidates']) assert.equal(report.observers.calls.filter((call) => call.channel === channel).length, 0)
  for (const [channel, count] of [['projects:resolve-recovery', 1], ['projects:update-raster-layer', 1], ['projects:undo', 2], ['projects:redo', 1], ['projects:save', 1]]) {
    const calls = report.observers.calls.filter((call) => call.channel === channel)
    assert.equal(calls.length, count); assert.ok(calls.every(({ ok, finished, originalCalls }) => ok === true && finished && originalCalls === 1))
  }
  const newInference = report.observers.workers.flatMap(({ writes }) => writes).filter(({ type }) => /^(generate-|execute-)/.test(type))
  assert.deepEqual(newInference, []); report.newGenerationWireCount = 0
  for (const worker of report.observers.workers) {
    assert.equal(await realpath(worker.executable), await realpath(pointer.pythonExecutable))
    assert.equal(worker.originalCalls, 1)
    assert.ok(worker.writes.every(({ originalCalls, receiverMatches }) => originalCalls === 1 && receiverMatches))
  }
  assert.deepEqual(await treeManifest(provision.installed.workerRoot), installed)
  assert.deepEqual(await json(path.join(appData, 'qualification-runtime.json')), marker)
  assert.deepEqual(await json(path.join(appData, 'runtime/current-runtime.json')), pointer)
  assert.equal(await hashFile(previousPath), previousSha256)
  assert.equal(await hashFile(previous.fixture.provisionReport.path), previous.fixture.provisionReport.sha256)
  for (const file of Object.values(previous.fixture.baseline)) assert.equal(await hashFile(file.path), file.sha256)
  assert.equal(await hashFile(path.resolve('scripts/qualify-installed-anima-regional-continuation.mjs')), report.scriptSha256)
  await verifyPreviousSourcePins('after')
  for (const [role, component] of Object.entries(previous.catalog.verified).filter(([role]) => role !== 'architecture')) assert.deepEqual(statIdentity(await regular(component.managedPath)), previous.catalog.fileStats[role])
  for (const file of report.protectedProjects) { assert.deepEqual(statIdentity(await regular(file.path)), file.stat); assert.equal(await hashFile(file.path), file.sha256) }
  for (const file of [pngPath, controlPath]) assert.equal(await hashFile(file), previous.control.pngSha256)
  assert.deepEqual(report.pageErrors, []); assert.equal(report.boundsError, undefined)
  report.status = 'passed'
  report.conjunction = { previousRunStatus: 'failed', priorMeasuredRequests: 3, priorSuccessfulResultsAdd: true, continuationNewRequests: 0, recoveredVisibilityHistory: 'passed', explicitSaveReopenExactRgbAndBaseProvenance: 'passed', originalAddUndoRedo: 'unverified', previousReportUnchanged: true }
}

checkpoint()
timer = setTimeout(() => { report.deadlineExceeded = true; report.status = 'failed'; checkpoint(); void closeNative().catch((caught) => { report.deadlineCloseError = String(caught.stack ?? caught); checkpoint() }) }, 600_000)
try { await run() }
catch (caught) { error = caught; report.status = 'failed'; report.error = String(caught.stack ?? caught); if (window) await screenshot('failure-context').catch(() => {}) }
finally {
  clearTimeout(timer)
  if (application) try { await closeNative() } catch (caught) { error ??= caught; report.physicalExitError = String(caught.stack ?? caught) }
  if (database) await database.close()
  report.finishedAt = new Date().toISOString(); report.elapsedSeconds = (Date.now() - started) / 1000; checkpoint()
}
process.stdout.write(JSON.stringify({ status: report.status, report: reportPath, newGenerationWireCount: report.newGenerationWireCount ?? null }) + '\n')
if (error || report.status !== 'passed') process.exitCode = 1
