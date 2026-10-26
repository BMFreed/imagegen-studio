/**
 * ROOT-ONLY AUTHORING REGRESSION -- NOT EXECUTED BY ITS AUTHOR. After root supplies a fresh build:
 * pnpm exec tsx scripts/smoke-regional-guidance-masks.mjs --report-file ABSOLUTE_NEW_REPORT
 *
 * Exactly twelve finite offline checks; built UI, original preload/Main, durable shadow, SQLite,
 * actual .igs writer/loader and two physical Electron lifetimes (dirty crash, healthy code 0). One
 * overall <=300s deadline across restart; launcher/each owned scope <=2GiB, zero swap, explicit
 * aggregate <=4GiB, launcher stop <=30s. No provisioning, catalog injection, ML, conditioning,
 * successful admission, active-work or installed embedding-completion claim. The inherited observer
 * stays original pass-through; no delay gate is armed. Root alone runs, inspects
 * screenshots/evidence, verifies retention and disposes owned payloads. This script performs no
 * deletion and never substitutes a prepared document for a tested UI edit.
 */

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { isProxy } from 'node:util/types'
import { serialize } from 'node:v8'
import { crc32, inflateSync } from 'node:zlib'

const require = createRequire('/home/user/Work/imagegen-studio/package.json')
const { _electron: electron, expect } = require('@playwright/test')
const Database = require('better-sqlite3')

import { openAppDatabase } from '/home/user/Work/imagegen-studio/src/main/db/database.ts'
import { readIgsPackage } from '/home/user/Work/imagegen-studio/src/main/projects/igs-package.ts'
import { encodeProjectMaskPng } from '/home/user/Work/imagegen-studio/src/main/projects/project-mask.ts'
import { ProjectSession } from '/home/user/Work/imagegen-studio/src/main/projects/project-session.ts'
import { ProjectShadowStore } from '/home/user/Work/imagegen-studio/src/main/projects/project-shadow.ts'
import { acceptedRasterProvenanceFixture } from '/home/user/Work/imagegen-studio/src/main/projects/test-fixtures/accepted-provenance.ts'
import { literalSmartPatchColorPng } from '/home/user/Work/imagegen-studio/src/main/projects/test-fixtures/smart-patch-input-material.ts'
import { smartPatchVariantMetadataFixture } from '/home/user/Work/imagegen-studio/src/main/projects/test-fixtures/smart-patch-variant.ts'
import { ipcChannels } from '/home/user/Work/imagegen-studio/src/shared/api.ts'
import { isolateNativeSmokeWindow } from '/home/user/Work/imagegen-studio/scripts/native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from '/home/user/Work/imagegen-studio/scripts/qualification-resource-limits.mjs'

const startedMono = Number(process.hrtime.bigint() / 1_000_000n)
const root = realpathSync(process.cwd())
assert.equal(
  root,
  '/home/user/Work/imagegen-studio',
  'Run this external draft from its repository',
)
assert.equal(process.argv.length, 4, 'Use --report-file ABSOLUTE_NEW_REPORT')
const candidateFile = fileURLToPath(import.meta.url)
assert.equal(process.argv[2], '--report-file')
const reportFile = process.argv[3]
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Never overwrite evidence')
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const evidenceParent = path.dirname(reportFile)
const relativeParent = path.relative(artifactRoot, evidenceParent)
assert.ok(relativeParent && !relativeParent.startsWith('..') && !path.isAbsolute(relativeParent))
assert.equal(realpathSync(artifactRoot), artifactRoot)
assert.equal(realpathSync(evidenceParent), evidenceParent)
assert.ok(lstatSync(evidenceParent).isDirectory() && !lstatSync(evidenceParent).isSymbolicLink())
const evidenceRoot = reportFile + '.artifacts'
assert.equal(existsSync(evidenceRoot), false)
writeFileSync(reportFile, '{}\n', { flag: 'wx', mode: 0o600 })
mkdirSync(evidenceRoot, { mode: 0o700 })
const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'regional-masks-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
mkdirSync(workspace, { recursive: true, mode: 0o700 })
// Short Unix socket paths; this companion remains root-owned and is never removed here.
const temporaryDirectory = mkdtempSync(path.join(artifactRoot, 'rgm-tmp-'))
const previousTemporaryDirectory = process.env.TMPDIR
process.env.TMPDIR = temporaryDirectory
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const PREFIX_ENCODING_FORMAT = 'portable-tagged-json-v1'
const prefixEncodingDiagnosticKeys = new Set()
const mono = () => Number(process.hrtime.bigint() / 1_000_000n)
let overallDeadline = startedMono + 300_000
const projectTitle = 'Regional Guidance masks'
const regionalReason =
  'Regional Guidance generation is not available yet. Disable or delete all enabled regions before generating.'
const regionalCode = 'GENERATION_REGIONAL_GUIDANCE_UNSUPPORTED'
const roots = {
  placeholdersDir: path.join(root, 'dist/main/placeholders'),
  scratchDir: path.join(fixtureRoot, 'writer-scratch'),
}

const adapter = {
  add: 'Add Regional Guidance',
  regionGroup: 'Regional Guidance',
  rowAttribute: 'data-regional-guidance-id',
  positive: 'Regional prompt',
  negative: 'Regional negative prompt',
  inherit: 'Use global negative prompt',
  inherited: 'Current Canvas negative prompt',
  removePositive: 'Remove regional prompt',
  removeNegative: 'Remove regional negative prompt',
  brush: 'Brush tool',
  eraser: 'Eraser tool',
  lasso: 'Lasso tool',
  polygon: 'Polygon Lasso tool',
  transform: 'Transform Region',
  diameter: 'Mask brush size',
  operation: 'Mask lasso operation',
  clear: 'Clear mask',
  hideOverlay: 'Hide mask overlay',
  showOverlay: 'Show mask overlay',
  applyTransform: 'Apply mask transform',
  cancelTransform: 'Cancel mask transform',
  regionOpacity: 'Region opacity',
  channels: {
    add: ipcChannels.projects.addRegionalGuidance,
    update: ipcChannels.projects.updateRegionalGuidance,
    duplicate: ipcChannels.projects.duplicateRegionalGuidance,
    delete: ipcChannels.projects.deleteRegionalGuidance,
    // Deliberately literal agreed public API, never a fabricated test endpoint.
    prompt: 'projects:update-regional-guidance-prompt',
    mask: 'projects:edit-regional-guidance-mask',
  },
}
const report = {
  schemaVersion: 2,
  qualificationScope: 'regional-mask-authoring-offline-only',
  fullTwelveCheckQualification: false,
  regionalInferenceQualified: false,
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
  snapshots: [],
  databaseCheckpoints: [],
  stateCheckpoints: [],
  witnesses: [],
  expectedActions: [],
  refusals: [],
  screenshots: [],
  layoutChecks: [],
  viewportChecks: [],
  pageErrors: [],
  nativeLogs: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  observerRestorations: [],
  ipcCalls: [],
  prefixEncodingDiagnostics: [],
  prefixCodecSelfCheck: null,
  ipcEvidenceModel: {
    prefixFormat: PREFIX_ENCODING_FORMAT,
    registry:
      'ipcCalls[].calls retains one compact current record per launch/callId, including exact args, state and byte/hash references.',
    witness:
      'mutations {format,launch,length,sha256,v8DiagnosticSha256} binds the entire ordered mutating metadata prefix with SHA256 of UTF8 JSON.stringify(strict portable tagged values), including every seal, argument, state, error, property presence/order and original journal byte/hash reference. V8 hashes are diagnostic only. No cumulative reply arrays are embedded in witnesses.',
    originals:
      'Each JSONL event has readable launch/callId/channel/event and a portable tagged-JSON payload. Every value has an explicit tag, preserving undefined/void, null, booleans, strings, numbers (including -0/nonfinite), dense arrays and ordered plain-object properties. Unsupported DTO types/shapes are refused explicitly. Retain complete journals with the report; they also cover calls appended after the last launcher checkpoint. The Main journal codec is unchanged. Launcher prefix identity uses the same tagged value semantics; V8 serialization is diagnostic only, never identity or journal transport.',
  },
  navigationActions: [],
  homeThumbnailReadiness: [],
  sqlTransitions: [],
  retainedBuildFiles: [],
  promptTransactions: [],
  maskActions: [],
  masks: [],
  productObjects: {},
  pointerDiagnostics: [],
  resourceChecks: [],
  promptGateRestorations: [],
  boundary: {
    actual:
      'Built native pointer Brush/Eraser/Lasso/Polygon Lasso/Transform Region/Clear, original regional mask IPC, Project Undo/Redo, real Save/loader/reopen, durable dirty PNG crash/Recover, enabled ordinary/Smart refusal and disabled authoring/offline controls.',
    fixtures:
      'ProjectSession prepares a legacy-absent portable Project, literal Raster and accepted Illustrious/Anima Smart PNGs/provenance, distinct drafts/bboxes, seed0. Queue/catalog empty; runtime not installed. Fixture preparation is not inference or acceptance evidence.',
    oracle:
      'Independent literal alpha/bounds and PNG-standard plus Chromium decoders; full before/after expected documents; all SQLite schema objects and tables including sqlite_sequence; original handler calls and complete raw SQL/package/PNG/shadow/source/build evidence. Every seal is accounted for.',
    limits:
      'One overall <=300s across both launches, <=2GiB per launcher/owned group, zero swap, explicit <=4GiB aggregate, stop <=30s. Root provides fresh build and owns serial execution.',
    excluded:
      'Regional inference, job-freeze inheritance resolution, reference images, successful admission, active-work/frozen Retry, installed-resource autocomplete, Main async ABA/failure atomicity, quality/release/full promises. Lower-level owners qualify these separately.',
    cleanup:
      'No deletion; root verifies physical exits, restored original handlers and complete retained bytes before disposing only declared owned payloads.',
  },
}
const lifecycle = {
  schemaVersion: 1,
  owner: { repository: root, task: 'regional-guidance-masks', run: reportFile },
  state: 'running',
  lastUsedAt: report.startedAt,
  evidence: [reportFile, evidenceRoot],
  payloads: [fixtureRoot, temporaryDirectory],
  dependsOn: [],
  usedBy: [],
  pins: [fixtureRoot, temporaryDirectory].map((file) => ({
    path: file,
    reason:
      'Root release only after physical exit, handler restoration and full retained-byte checks',
  })),
}
let application, window, nativeProcess, sampler, fixture, baseline, latestSaved
let regionA, regionB, duplicateRegion, sourceFiles, bundleFiles, expectedSql
let expectedCanvasNegative, expectedLiveDocument
let polygonPng, transformedPng, firstBrushMaskUrl
let observerInstalled = false
let activeIpcLaunch
let promptGateArmed = false
let sampling = Promise.resolve()
let scopeDeadlineSeconds
const nativeChecks = []
const observed = new Map()
const view = () => window.getByLabel('Project ' + projectTitle, { exact: true })
const canvas = () => view().getByRole('region', { name: 'Project Canvas', exact: true })
const button = (name) => view().getByRole('button', { name, exact: true })
const selectButton = (name) => button('Select ' + name)
const regionalSection = () => view().getByRole('region', { name: adapter.regionGroup, exact: true })
const regionalRow = (_tab, id) =>
  regionalSection().locator('[' + adapter.rowAttribute + '="' + id + '"]')
const region = (tab, id) => {
  const found = tab.regionalGuidance?.find((item) => item.id === id)
  assert.ok(found, 'Missing regional owner ' + id)
  return found
}
const editor = (id, polarity) =>
  regionalRow(null, id).getByRole('textbox', {
    name: polarity === 'positive' ? adapter.positive : adapter.negative,
    exact: true,
  })
const emptyPrompt = () => ({ embeddingRefs: [], text: '' })
const clone = (value) => structuredClone(value)
async function bounded(operation, maximumMs, label) {
  let timer
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label + ' timed out')), maximumMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

const documentOwner = (tab) => ({
  documentId: tab.documentId,
  documentRevision: tab.documentRevision,
})
const entityOwner = (tab, id) => ({ ...documentOwner(tab), regionId: id })
function checkpoint() {
  lifecycle.lastUsedAt = new Date().toISOString()
  writeFileSync(reportFile, JSON.stringify(report) + '\n', { mode: 0o600 })
  writeFileSync(
    path.join(evidenceRoot, 'artifact-lifecycle.json'),
    JSON.stringify(lifecycle, null, 2) + '\n',
    { mode: 0o600 },
  )
}
function withinDeadline() {
  assert.ok(mono() < overallDeadline, 'Overall 300s deadline exhausted; recovery cannot reset it')
}
function check(name, evidence = {}) {
  withinDeadline()
  assert.ok(report.checks.length < 12, 'Exactly twelve finite checks')
  report.checks.push({ name, at: new Date().toISOString(), ...evidence })
  checkpoint()
  console.log('PASS ' + name)
}
function filesBelow(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(directory, entry.name)
      assert.equal(entry.isSymbolicLink(), false, 'Refuse symlink ' + file)
      if (entry.isDirectory()) return filesBelow(file)
      assert.equal(entry.isFile(), true, 'Refuse nonregular file ' + file)
      return [file]
    })
    .sort()
}
const hashes = (files) =>
  Object.fromEntries(files.map((file) => [path.relative(root, file), digest(readFileSync(file))]))
function retain(source, relativeName) {
  const target = path.join(evidenceRoot, relativeName)
  const relative = path.relative(evidenceRoot, target)
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  assert.equal(existsSync(target), false, 'Never replace retained bytes')
  assert.ok(lstatSync(source).isFile() && !lstatSync(source).isSymbolicLink())
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  copyFileSync(source, target)
  const bytes = readFileSync(source)
  assert.ok(readFileSync(target).equals(bytes), 'Retained bytes differ: ' + relativeName)
  report.snapshots.push({ path: target, bytes: bytes.length, sha256: digest(bytes) })
  return target
}
function retainJson(relativeName, value) {
  const file = path.join(evidenceRoot, relativeName)
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const bytes = Buffer.from(JSON.stringify(value) + '\n')
  writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 })
  report.snapshots.push({ path: file, bytes: bytes.length, sha256: digest(bytes) })
  return file
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
function databaseState(database) {
  // Include sqlite_sequence, internal indexes and every other actual schema object/table.
  const schema = database
    .prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name')
    .all()
  const tables = {}
  for (const { name } of schema.filter(({ type }) => type === 'table')) {
    assert.match(name, /^[a-z_0-9]+$/)
    tables[name] = database
      .prepare('SELECT * FROM "' + name + '"')
      .all()
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  }
  return { schema, tables }
}
const sqlState = () => withDatabase(databaseState)
function dataFiles() {
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
    'scratch',
    'staging',
    'workspaces',
  ].flatMap((name) => {
    const directory = path.join(appDataRoot, name)
    if (!existsSync(directory)) return []
    assert.ok(lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink())
    return filesBelow(directory)
  })
}
const dataHashes = () =>
  Object.fromEntries(
    dataFiles().map((file) => [path.relative(appDataRoot, file), digest(readFileSync(file))]),
  )
async function retainDatabase(label, afterNativeExit = false) {
  if (afterNativeExit) assert.equal(allExited(), true, 'Physical-exit checkpoint requires proof')
  const directory = path.join(evidenceRoot, label)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const file = path.join(directory, 'app.sqlite')
  assert.equal(existsSync(file), false)
  const source = new Database(path.join(appDataRoot, 'database/app.sqlite'), {
    readonly: true,
    fileMustExist: true,
  })
  try {
    await bounded(source.backup(file), 8000, 'consistent SQLite backup')
  } finally {
    source.close()
  }
  report.snapshots.push({
    path: file,
    bytes: lstatSync(file).size,
    sha256: digest(readFileSync(file)),
  })
  checkpoint()
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
async function snapshot(label, { closed = false, afterNativeExit = false } = {}) {
  // SQL backup is deliberately first and independent of document/asset enumeration.
  const database = await retainDatabase(label, afterNativeExit)
  const beforeSql = sqlState(),
    beforeFiles = dataHashes()
  assert.deepEqual(database.state, beforeSql, 'SQL changed during checkpoint')
  const retainedFiles = dataFiles().map((file) => ({
    original: file,
    path: retain(file, label + '/data/' + path.relative(appDataRoot, file)),
    sha256: digest(readFileSync(file)),
  }))
  assert.deepEqual(sqlState(), beforeSql)
  assert.deepEqual(dataHashes(), beforeFiles)
  const record = { label, afterNativeExit, database: database.path, retainedFiles }
  retainJson(label + '/readback.json', {
    ...record,
    tab: closed ? null : await current(),
    inputs: fixture?.inputs.map(({ bytes, ...input }) => ({
      ...input,
      sha256: digest(bytes),
      byteSize: bytes.length,
    })),
  })
  report.stateCheckpoints.push(record)
  checkpoint()
}

async function rawApi(method, ...args) {
  return bounded(
    window.evaluate(({ method, args }) => window.api.projects[method](...args), { method, args }),
    8000,
    'Public projects.' + method,
  )
}
async function api(method, ...args) {
  const result = await rawApi(method, ...args)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function current() {
  const result = await api('open', fixture.key)
  assert.equal(result.kind, 'opened')
  return result.tab
}
async function frames() {
  try {
    await bounded(
      window.evaluate(
        () =>
          new Promise((resolve) => {
            const state = {
              startedAt: performance.now(),
              hidden: document.hidden,
              visibility: document.visibilityState,
              focused: document.hasFocus(),
              fonts: document.fonts.status,
              firstAt: null,
              secondAt: null,
              timerAt: null,
            }
            globalThis.igsMaskFrameProbe = state
            setTimeout(() => {
              state.timerAt = performance.now()
            }, 100)
            requestAnimationFrame(() => {
              state.firstAt = performance.now()
              requestAnimationFrame(() => {
                state.secondAt = performance.now()
                resolve()
              })
            })
          }),
      ),
      2000,
      'Renderer frame settlement',
    )
  } catch (error) {
    const diagnostics = await Promise.allSettled([
      bounded(
        window.evaluate(() => ({
          probe: globalThis.igsMaskFrameProbe,
          hidden: document.hidden,
          visibility: document.visibilityState,
          focused: document.hasFocus(),
          fonts: document.fonts.status,
          readyState: document.readyState,
          now: performance.now(),
          viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        })),
        1000,
        'Renderer frame diagnostic',
      ),
      bounded(
        application.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().map((native) => ({
            id: native.id,
            visible: native.isVisible(),
            minimized: native.isMinimized(),
            focused: native.isFocused(),
            bounds: native.getBounds(),
            contentBounds: native.getContentBounds(),
            webContentsId: native.webContents.id,
            rendererPid: native.webContents.getOSProcessId(),
            backgroundThrottling: native.webContents.getBackgroundThrottling(),
            loading: native.webContents.isLoadingMainFrame(),
            destroyed: native.webContents.isDestroyed(),
          })),
        ),
        1000,
        'Native frame diagnostic',
      ),
    ])
    ;(report.frameFailures ??= []).push({
      at: new Date().toISOString(),
      diagnostics: diagnostics.map((entry) =>
        entry.status === 'fulfilled'
          ? { status: entry.status, value: entry.value }
          : { status: entry.status, reason: String(entry.reason) },
      ),
    })
    checkpoint()
    throw error
  }
}

const readChannels = new Set([
  ...Object.values(ipcChannels.projects).filter((channel) =>
    /^projects:(get-|list(?:-|$)|open$|review-accepted-result$)/.test(channel),
  ),
  ...Object.values(ipcChannels.models).filter((channel) => /^models:get-/.test(channel)),
  ...Object.values(ipcChannels.runtime).filter((channel) => /^runtime:get-/.test(channel)),
  'presets:get',
  'presets:list',
])
async function installObserver() {
  const launch = report.nativeLaunchAttempts
  const journalPath = path.join(evidenceRoot, 'ipc', 'launch-' + launch + '.jsonl')
  mkdirSync(path.dirname(journalPath), { recursive: true, mode: 0o700 })
  writeFileSync(journalPath, '', { flag: 'wx', mode: 0o600 })
  activeIpcLaunch = {
    launch,
    journal: {
      path: journalPath,
      format: 'append-only-jsonl-tagged-v1',
      bytes: 0,
      events: 0,
      sha256: digest(Buffer.alloc(0)),
      retention:
        'Every original argument/result is retained here once. Checkpoint metadata names an observed prefix; Main appends synchronously before invoking/returning, including calls not yet polled by the launcher. Keep this journal with all report references.',
    },
    calls: [],
    restored: false,
  }
  report.ipcCalls.push(activeIpcLaunch)
  lifecycle.evidence.push(journalPath)
  checkpoint()
  await application.evaluate(
    ({ ipcMain }, { promptChannel, launch, journalPath }) => {
      const { appendFileSync } = process.getBuiltinModule('fs')
      const { createHash } = process.getBuiltinModule('crypto')
      const encode = (value, ancestors = new Set()) => {
        if (value === undefined) return ['undefined']
        if (value === null) return ['null']
        if (typeof value === 'boolean') return ['boolean', value]
        if (typeof value === 'string') return ['string', value]
        if (typeof value === 'number')
          return ['number', Object.is(value, -0) ? '-0' : String(value)]
        if (typeof value !== 'object')
          throw new TypeError('Unsupported IPC DTO primitive: ' + typeof value)
        if (ancestors.has(value)) throw new TypeError('Cyclic IPC DTO values are unsupported')
        ancestors.add(value)
        try {
          const keys = Reflect.ownKeys(value)
          const array = Array.isArray(value)
          if (array) {
            if (Object.getPrototypeOf(value) !== Array.prototype)
              throw new TypeError('Only plain IPC DTO arrays are supported')
            if (keys.length !== value.length + 1)
              throw new TypeError('Sparse or extended IPC DTO arrays are unsupported')
          } else if (Object.getPrototypeOf(value) !== Object.prototype) {
            throw new TypeError('Only plain IPC DTO objects are supported')
          }
          const entries = []
          for (const key of keys) {
            if (array && key === 'length') continue
            const descriptor = Object.getOwnPropertyDescriptor(value, key)
            if (
              typeof key !== 'string' ||
              !descriptor.enumerable ||
              !Object.hasOwn(descriptor, 'value')
            )
              throw new TypeError(
                'Only enumerable string-keyed IPC DTO data properties are supported',
              )
            if (array && key !== String(entries.length))
              throw new TypeError('Only dense IPC DTO array indices are supported')
            const encoded = encode(descriptor.value, ancestors)
            entries.push(array ? encoded : [key, encoded])
          }
          return [array ? 'array' : 'object', entries]
        } finally {
          ancestors.delete(value)
        }
      }
      const journalHash = createHash('sha256')
      globalThis.igsRegionalJournal = {
        bytes: 0,
        events: 0,
        sha256: journalHash.copy().digest('hex'),
      }
      const append = (call, event, fields) => {
        const bytes = Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            launch,
            id: call.id,
            callId: call.callId,
            channel: call.channel,
            event,
            // Tag every value; actual DTO data cannot collide with an undefined marker.
            // Encode only this event; the full original payload is retained exactly once.
            payload: encode(fields),
          }) + '\n',
        )
        const reference = {
          offset: globalThis.igsRegionalJournal.bytes,
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        }
        // The original result never accumulates in Main's call registry or witness history.
        // This synchronous append survives a launcher OOM and does not depend on final restoration.
        appendFileSync(journalPath, bytes)
        journalHash.update(bytes)
        globalThis.igsRegionalJournal.bytes += bytes.length
        globalThis.igsRegionalJournal.events += 1
        globalThis.igsRegionalJournal.sha256 = journalHash.copy().digest('hex')
        return reference
      }
      if (!ipcMain._invokeHandlers.has(promptChannel))
        throw new Error(
          'Missing agreed regional prompt Main handler; build the final implementation first',
        )
      globalThis.igsRegionalCalls = []
      globalThis.igsRegionalOriginals = new Map()
      globalThis.igsRegionalObservers = new Map()
      globalThis.igsRegionalPromptGate = null
      for (const [channel, original] of ipcMain._invokeHandlers) {
        const observer = async (event, ...args) => {
          const call = {
            id: globalThis.igsRegionalCalls.length,
            launch,
            callId: 'launch-' + launch + '/call-' + globalThis.igsRegionalCalls.length,
            channel,
            args: structuredClone(args),
            finished: false,
            delivered: false,
            originalCalls: 0,
            evidence: { path: journalPath },
          }
          call.evidence.started = append(call, 'started', {
            args: call.args,
            finished: false,
            delivered: false,
            originalCalls: 0,
          })
          globalThis.igsRegionalCalls.push(call)
          let held
          let response
          let hasResponse = false
          try {
            const gate = globalThis.igsRegionalPromptGate
            if (
              gate &&
              !gate.held &&
              args[0] === gate.tabId &&
              ((gate.kind === 'regional-text' &&
                channel === promptChannel &&
                args[1]?.regionId === gate.regionId &&
                args[1]?.documentId === gate.documentId &&
                args[2]?.kind === 'text' &&
                args[2]?.polarity === gate.polarity) ||
                (gate.kind === 'ordinary-seal' &&
                  channel === 'projects:seal-prompt-history' &&
                  args.length === 2 &&
                  typeof args[1] === 'string' &&
                  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(args[1])))
            ) {
              gate.held = true
              gate.callId = call.id
              gate.args = structuredClone(args)
              held = gate
              await gate.delivery
            }
            call.originalCalls += 1
            call.evidence.invoked = append(call, 'invoked', { originalCalls: call.originalCalls })
            response = await original(event, ...args)
            hasResponse = true
            call.ok = response?.ok ?? null
            if (response?.ok === false) call.error = structuredClone(response.error)
            // This is not renderer adoption: all readers separately await DOM and durable revision.
            call.delivered = true
            return response
          } catch (error) {
            call.thrown = { name: error.name, message: error.message }
            throw error
          } finally {
            call.finished = true
            call.evidence.finished = append(call, 'finished', {
              finished: call.finished,
              delivered: call.delivered,
              originalCalls: call.originalCalls,
              ok: call.ok,
              error: call.error,
              thrown: call.thrown,
              hasResponse,
              ...(hasResponse ? { response } : {}),
            })
            if (held) held.completed = true
          }
        }
        globalThis.igsRegionalOriginals.set(channel, original)
        globalThis.igsRegionalObservers.set(channel, observer)
        ipcMain._invokeHandlers.set(channel, observer)
      }
    },
    { promptChannel: adapter.channels.prompt, launch, journalPath },
  )
  observerInstalled = true
}
async function calls() {
  assert.ok(activeIpcLaunch)
  const registry = activeIpcLaunch.calls
  const update = await bounded(
    application.evaluate(
      (_, { cursor, pending }) => ({
        total: globalThis.igsRegionalCalls.length,
        records: [
          ...pending.map((id) => globalThis.igsRegionalCalls[id]),
          ...globalThis.igsRegionalCalls.slice(cursor),
        ],
        journal: globalThis.igsRegionalJournal,
      }),
      {
        cursor: registry.length,
        pending: registry.filter(({ finished }) => !finished).map(({ id }) => id),
      },
    ),
    4000,
    'Original IPC observer read',
  )
  for (const call of update.records) {
    assert.equal(call.launch, activeIpcLaunch.launch)
    const previous = registry[call.id]
    if (previous) {
      assert.equal(previous.finished, false, 'Completed call metadata is immutable')
      for (const key of ['id', 'launch', 'callId', 'channel', 'args'])
        assert.deepEqual(call[key], previous[key], 'Pending call identity/arguments changed')
      assert.deepEqual(call.evidence.started, previous.evidence.started)
      assert.ok(call.originalCalls >= previous.originalCalls)
    } else
      assert.equal(call.id, registry.length, 'Every original call must be inventoried in order')
    registry[call.id] = call
  }
  assert.equal(registry.length, update.total, 'No observed invocation may be omitted')
  Object.assign(activeIpcLaunch.journal, update.journal)
  // Match the previous observer read's array snapshot semantics across awaits. Individual
  // metadata records are replaced, never mutated; copying this metadata-only array is bounded.
  return registry.slice()
}
// Launcher-only copy of the Main journal's strict tagged value semantics. Property order and
// key presence are intentional evidence; engine storage kinds and object aliases are not DTO
// values. Proxies are additionally refused before their traps can impersonate a plain DTO.
function encodePrefixValue(value, ancestors = new Set()) {
  if (value === undefined) return ['undefined']
  if (value === null) return ['null']
  if (typeof value === 'boolean') return ['boolean', value]
  if (typeof value === 'string') return ['string', value]
  if (typeof value === 'number') return ['number', Object.is(value, -0) ? '-0' : String(value)]
  if (typeof value !== 'object')
    throw new TypeError('Unsupported IPC DTO primitive: ' + typeof value)
  if (isProxy(value)) throw new TypeError('Proxy IPC DTO values are unsupported')
  if (ancestors.has(value)) throw new TypeError('Cyclic IPC DTO values are unsupported')
  ancestors.add(value)
  try {
    const keys = Reflect.ownKeys(value)
    const array = Array.isArray(value)
    if (array) {
      if (Object.getPrototypeOf(value) !== Array.prototype)
        throw new TypeError('Only plain IPC DTO arrays are supported')
      if (keys.length !== value.length + 1)
        throw new TypeError('Sparse or extended IPC DTO arrays are unsupported')
    } else if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError('Only plain IPC DTO objects are supported')
    }
    const entries = []
    for (const key of keys) {
      if (array && key === 'length') continue
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
        throw new TypeError('Only enumerable string-keyed IPC DTO data properties are supported')
      if (array && key !== String(entries.length))
        throw new TypeError('Only dense IPC DTO array indices are supported')
      const encoded = encodePrefixValue(descriptor.value, ancestors)
      entries.push(array ? encoded : [key, encoded])
    }
    return [array ? 'array' : 'object', entries]
  } finally {
    ancestors.delete(value)
  }
}
function canonicalPrefixSha256(prefix) {
  return digest(Buffer.from(JSON.stringify(encodePrefixValue(prefix)), 'utf8'))
}
function prefixCodecSelfCheck() {
  withinDeadline()
  const started = mono()
  // Synthetic codec metadata only: never sent to preload/Main and never counted as UI evidence.
  const reference = { offset: 0, bytes: 32, sha256: 'a'.repeat(64) }
  const prefix = [
    {
      id: 0,
      launch: 1,
      callId: 'codec-only/0',
      channel: 'codec-only:first',
      args: [
        {
          text: 'exact α',
          presentUndefined: undefined,
          numbers: [-0, 0, NaN, Infinity, -Infinity],
          flags: [null, true, false],
        },
      ],
      finished: true,
      delivered: true,
      originalCalls: 1,
      ok: true,
      error: undefined,
      thrown: undefined,
      evidence: {
        path: 'codec-only.jsonl',
        started: reference,
        invoked: { ...reference, offset: 32 },
        finished: { ...reference, offset: 64 },
      },
    },
    {
      id: 1,
      launch: 1,
      callId: 'codec-only/1',
      channel: 'codec-only:second',
      args: ['different argument'],
      finished: true,
      delivered: true,
      originalCalls: 1,
      ok: false,
      error: { code: 'CODEC_ONLY', message: 'exact error', detail: undefined },
      thrown: undefined,
      evidence: {
        path: 'codec-only.jsonl',
        started: { ...reference, offset: 96 },
        invoked: { ...reference, offset: 128 },
        finished: { ...reference, offset: 160 },
      },
    },
  ]
  const baseline = canonicalPrefixSha256(prefix)
  const cloned = canonicalPrefixSha256(structuredClone(prefix))
  assert.equal(cloned, baseline, 'Equal cloned DTO values retain canonical prefix identity')
  const controls = []
  const differences = [
    [
      'omitted versus present undefined',
      (value) => {
        delete value[0].args[0].presentUndefined
      },
    ],
    [
      'negative zero versus zero',
      (value) => {
        value[0].args[0].numbers[0] = 0
      },
    ],
    [
      'undefined void versus null',
      (value) => {
        value[0].thrown = null
      },
    ],
    [
      'NaN versus Infinity',
      (value) => {
        value[0].args[0].numbers[2] = Infinity
      },
    ],
    [
      'positive versus negative Infinity',
      (value) => {
        value[0].args[0].numbers[3] = -Infinity
      },
    ],
    [
      'argument mutation',
      (value) => {
        value[0].args[0].text = 'changed α'
      },
    ],
    [
      'finished state flip',
      (value) => {
        value[0].finished = false
      },
    ],
    [
      'delivered state flip',
      (value) => {
        value[0].delivered = false
      },
    ],
    [
      'original call count mutation',
      (value) => {
        value[0].originalCalls = 2
      },
    ],
    [
      'error mutation',
      (value) => {
        value[1].error.message = 'changed error'
      },
    ],
    [
      'evidence reference hash mutation',
      (value) => {
        value[0].evidence.finished.sha256 = 'b'.repeat(64)
      },
    ],
    [
      'evidence reference offset mutation',
      (value) => {
        value[0].evidence.finished.offset += 1
      },
    ],
    [
      'evidence reference byte length mutation',
      (value) => {
        value[0].evidence.finished.bytes += 1
      },
    ],
    [
      'call order mutation',
      (value) => {
        value.reverse()
      },
    ],
    [
      'array order mutation',
      (value) => {
        value[0].args[0].flags.reverse()
      },
    ],
    [
      'property order mutation',
      (value) => {
        value[0].args[0] = Object.fromEntries(Object.entries(value[0].args[0]).reverse())
      },
    ],
  ]
  for (const [label, mutate] of differences) {
    const changed = structuredClone(prefix)
    mutate(changed)
    const sha256 = canonicalPrefixSha256(changed)
    assert.notEqual(sha256, baseline, 'Canonical prefix must detect ' + label)
    controls.push({ label, baselineSha256: baseline, changedSha256: sha256 })
  }
  const unsupported = [
    ['custom object prototype', () => Object.create({ inherited: true })],
    ['null object prototype', () => Object.create(null)],
    ['custom array prototype', () => Object.setPrototypeOf([], {})],
    [
      'accessor property',
      () =>
        Object.defineProperty({}, 'value', {
          enumerable: true,
          get() {
            throw new Error('A rejected accessor must never execute')
          },
        }),
    ],
    ['nonenumerable property', () => Object.defineProperty({}, 'value', { value: 1 })],
    ['sparse array', () => new Array(1)],
    ['extended array', () => Object.assign([], { extra: true })],
    ['symbol property', () => ({ [Symbol('codec-only')]: 1 })],
    [
      'cycle',
      () => {
        const value = {}
        value.self = value
        return value
      },
    ],
    ['Date instance', () => new Date(0)],
    ['typed array', () => Uint8Array.of(1)],
    ['Map instance', () => new Map()],
    ['Set instance', () => new Set()],
    ['BigInt primitive', () => 1n],
    ['function primitive', () => () => undefined],
    ['symbol primitive', () => Symbol('codec-only')],
    ['proxy', () => new Proxy({}, {})],
  ]
  const rejections = []
  for (const [label, make] of unsupported) {
    assert.throws(() => canonicalPrefixSha256(make()), TypeError, 'Strict prefix rejects ' + label)
    rejections.push(label)
  }
  withinDeadline()
  return {
    format: PREFIX_ENCODING_FORMAT,
    algorithm: 'sha256-utf8-tagged-json',
    baselineSha256: baseline,
    structuredCloneSha256: cloned,
    controls,
    rejections,
    fixtureRecordCount: prefix.length,
    elapsedMs: mono() - started,
    productUiOrIpcCalls: 0,
    passed: true,
  }
}
const mutationRecords = (inventory) => {
  assert.equal(inventory.format, PREFIX_ENCODING_FORMAT, 'Explicit mutation prefix encoding format')
  const launch = report.ipcCalls.find((entry) => entry.launch === inventory.launch)
  assert.ok(launch, 'Mutation inventory requires its retained launch registry')
  const records = launch.calls.filter(({ channel }) => !readChannels.has(channel))
  assert.ok(inventory.length <= records.length)
  const prefix = records.slice(0, inventory.length)
  const canonicalSha256 = canonicalPrefixSha256(prefix)
  assert.equal(
    canonicalSha256,
    inventory.sha256,
    'Exact mutation prefix changed, including every argument/result reference/state/seal',
  )
  // Node's V8 Serialization API explicitly permits different bytes for equal JavaScript values:
  // https://nodejs.org/docs/latest-v24.x/api/v8.html#serialization-api
  // Keep runtime evidence if this recurs; V8 bytes never determine semantic prefix identity.
  assert.match(inventory.v8DiagnosticSha256, /^[a-f0-9]{64}$/)
  const observedV8 = digest(serialize(prefix))
  if (observedV8 !== inventory.v8DiagnosticSha256) {
    const diagnostic = {
      launch: inventory.launch,
      length: inventory.length,
      canonicalSha256,
      createdV8: inventory.v8DiagnosticSha256,
      observedV8,
    }
    const key = JSON.stringify(diagnostic)
    if (!prefixEncodingDiagnosticKeys.has(key)) {
      prefixEncodingDiagnosticKeys.add(key)
      report.prefixEncodingDiagnostics.push(diagnostic)
    }
  }
  return prefix
}
const mutations = async () => {
  const records = (await calls()).filter(({ channel }) => !readChannels.has(channel))
  return {
    format: PREFIX_ENCODING_FORMAT,
    launch: activeIpcLaunch.launch,
    length: records.length,
    sha256: canonicalPrefixSha256(records),
    v8DiagnosticSha256: digest(serialize(records)),
  }
}
function mutationsSince(before, after) {
  assert.equal(after.launch, before.launch, 'Mutation deltas cannot cross native lifetimes')
  assert.ok(after.length >= before.length)
  const previous = mutationRecords(before)
  const current = mutationRecords(after)
  assert.deepEqual(current.slice(0, previous.length), previous, 'Exact complete mutation prefix')
  return current.slice(previous.length)
}
function readIpcEvent(call, event) {
  const reference = call.evidence[event]
  assert.ok(reference, 'Missing retained original IPC ' + event + ': ' + call.callId)
  assert.ok(Number.isSafeInteger(reference.bytes) && reference.bytes > 0)
  const bytes = Buffer.alloc(reference.bytes)
  const file = openSync(call.evidence.path, 'r')
  try {
    let read = 0
    while (read < bytes.length) {
      const count = readSync(file, bytes, read, bytes.length - read, reference.offset + read)
      assert.ok(count > 0, 'Incomplete retained IPC event')
      read += count
    }
  } finally {
    closeSync(file)
  }
  assert.equal(digest(bytes), reference.sha256, 'Original IPC bytes differ')
  const { payload, ...record } = JSON.parse(bytes.toString('utf8'))
  for (const key of ['launch', 'id', 'callId', 'channel']) assert.equal(record[key], call[key])
  assert.equal(record.event, event)
  return { ...record, ...decodeIpcPayload(payload) }
}
function decodeIpcPayload(encoded) {
  assert.ok(
    Array.isArray(encoded) && encoded.length >= 1 && encoded.length <= 2,
    'Malformed tagged IPC DTO value',
  )
  const [tag, value] = encoded
  if (tag === 'undefined' || tag === 'null') {
    assert.equal(encoded.length, 1)
    return tag === 'undefined' ? undefined : null
  }
  assert.equal(encoded.length, 2)
  if (tag === 'boolean' || tag === 'string') {
    assert.equal(typeof value, tag)
    return value
  }
  if (tag === 'number') {
    assert.equal(typeof value, 'string')
    const number = value === '-0' ? -0 : Number(value)
    assert.equal(
      Object.is(number, -0) ? '-0' : String(number),
      value,
      'Noncanonical tagged IPC DTO number',
    )
    return number
  }
  assert.ok(tag === 'array' || tag === 'object', 'Unsupported tagged IPC DTO type: ' + tag)
  assert.ok(Array.isArray(value))
  if (tag === 'array') return value.map((item) => decodeIpcPayload(item))
  const result = {}
  for (const entry of value) {
    assert.ok(Array.isArray(entry) && entry.length === 2)
    const [key, item] = entry
    assert.equal(typeof key, 'string')
    assert.equal(Object.hasOwn(result, key), false, 'Duplicate tagged IPC DTO property')
    // Define data properties so a literal __proto__ key cannot alter the decoded prototype.
    Object.defineProperty(result, key, {
      value: decodeIpcPayload(item),
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  return result
}
function callResponse(call) {
  const record = readIpcEvent(call, 'finished')
  assertIpcTerminal(call, record)
  assert.equal(record.hasResponse, true, 'The original Main response must be retained')
  return record.response
}
function assertIpcTerminal(call, record) {
  for (const key of ['finished', 'delivered', 'originalCalls', 'ok', 'error', 'thrown'])
    assert.deepEqual(record[key], call[key], 'Retained IPC terminal state differs')
  assert.equal(typeof record.hasResponse, 'boolean')
  if (record.hasResponse) {
    assert.equal(record.response?.ok ?? null, call.ok)
    if (record.response?.ok === false) assert.deepEqual(record.response.error, call.error)
  } else assert.ok(call.thrown, 'An absent original response requires its original thrown error')
}
function verifyIpcEvidence(entry) {
  const bytes = readFileSync(entry.journal.path)
  assert.equal(bytes.length, entry.journal.bytes)
  assert.equal(digest(bytes), entry.journal.sha256)
  let offset = 0
  let events = 0
  const references = entry.calls
    .flatMap((call) =>
      ['started', 'invoked', 'finished'].map((event) => ({ call, event, ...call.evidence[event] })),
    )
    .sort((a, b) => a.offset - b.offset)
  for (const { call, event, ...reference } of references) {
    assert.equal(reference.offset, offset, 'Every retained IPC event is accounted for exactly once')
    const record = readIpcEvent(call, event)
    if (event === 'started') assert.deepEqual(record.args, call.args)
    if (event === 'invoked') assert.equal(record.originalCalls, call.originalCalls)
    if (event === 'finished') assertIpcTerminal(call, record)
    offset += reference.bytes
    events += 1
  }
  assert.equal(offset, bytes.length)
  assert.equal(events, entry.journal.events)
}
async function drainOriginalCalls() {
  await expect.poll(async () => (await calls()).filter(({ finished }) => !finished).length).toBe(0)
}
async function drainObserver() {
  await drainOriginalCalls()
  await frames()
}
async function gateState() {
  return application.evaluate(() => {
    const gate = globalThis.igsRegionalPromptGate
    if (!gate) return null
    const { delivery, release, ...serializable } = gate
    return serializable
  })
}
async function releasePromptGate() {
  if (!promptGateArmed) return
  const state = await gateState()
  await application.evaluate(() => globalThis.igsRegionalPromptGate?.release())
  if (state?.held) await expect.poll(async () => (await gateState())?.completed).toBe(true)
}
async function restorePromptGate() {
  if (!promptGateArmed) return
  assert.ok(application, 'An armed gate requires its owned native actor')
  await releasePromptGate()
  report.promptGateRestorations.push(await gateState())
  await application.evaluate(() => {
    globalThis.igsRegionalPromptGate = null
  })
  assert.equal(await gateState(), null)
  promptGateArmed = false
  checkpoint()
}
async function restoreObserver() {
  if (!observerInstalled || !application) return
  await restorePromptGate()
  // Restoration must not depend on a renderer frame clock that may be the failing boundary.
  await drainOriginalCalls()
  await calls()
  const restored = await application.evaluate(({ ipcMain }) => {
    const inFlightBefore = globalThis.igsRegionalCalls.filter(({ finished }) => !finished).length
    if (inFlightBefore !== 0)
      throw new Error('Original IPC calls remain in flight before restoration')
    const restored = []
    for (const [channel, original] of globalThis.igsRegionalOriginals) {
      if (ipcMain._invokeHandlers.get(channel) !== globalThis.igsRegionalObservers.get(channel))
        throw new Error('Observer ownership changed: ' + channel)
      ipcMain._invokeHandlers.set(channel, original)
      if (ipcMain._invokeHandlers.get(channel) !== original)
        throw new Error('Original handler not restored: ' + channel)
      restored.push(channel)
    }
    const inFlight = globalThis.igsRegionalCalls.filter(({ finished }) => !finished).length
    if (inFlight !== 0) throw new Error('Original IPC calls remain in flight after restoration')
    return { restored, allOriginalHandlersRestored: true, inFlight }
  })
  report.observerRestorations.push(restored)
  observerInstalled = false
  // Originals are restored before the final drain, so no later call can escape this final index.
  await drainOriginalCalls()
  await calls()
  activeIpcLaunch.restored = true
  verifyIpcEvidence(activeIpcLaunch)
  report.snapshots.push({
    path: activeIpcLaunch.journal.path,
    bytes: activeIpcLaunch.journal.bytes,
    sha256: activeIpcLaunch.journal.sha256,
  })
  checkpoint()
}
async function adopted(tab) {
  // This is a renderer-owned pending signal in ProjectLayerStack, not observer completion.
  await expect(button(adapter.add)).toBeEnabled()
  await expect(button('Save Project')).toBeEnabled()
  await expect
    .poll(() =>
      regionalSection()
        .locator('[' + adapter.rowAttribute + ']')
        .evaluateAll((rows) =>
          rows.map((row) => {
            const names = [...row.querySelectorAll('button')].map((node) =>
              node.getAttribute('aria-label'),
            )
            const name = names.find((name) => name?.startsWith('Select '))?.slice(7)
            const text = (label) => {
              const input = [...row.querySelectorAll('.cm-content')].find(
                (node) => node.getAttribute('aria-label') === label,
              )
              return input
                ? [...input.querySelectorAll('.cm-line')].map((line) => line.textContent).join('\n')
                : null
            }
            return {
              id: row.getAttribute('data-regional-guidance-id'),
              name,
              enabled: names.includes('Hide ' + name),
              locked: names.includes('Unlock ' + name),
              positive: text('Regional prompt'),
              negative: text('Regional negative prompt'),
            }
          }),
        ),
    )
    .toEqual(
      (tab.regionalGuidance ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        enabled: item.enabled,
        locked: item.locked,
        positive: item.prompts?.positive?.text ?? null,
        negative:
          item.prompts?.useGlobalNegativePrompt === false ? item.prompts.negative.text : null,
      })),
    )
  await expect(
    regionalSection().getByRole('heading', {
      name: 'Regional Guidance (' + (tab.regionalGuidance ?? []).length + ')',
      exact: true,
    }),
  ).toBeVisible()
  await expect(button(adapter.add)).toBeEnabled()
  await expect(button('Save Project')).toBeEnabled()
  await drainObserver()
}
async function idle() {
  // Wait for the overlay to leave the actual renderer before capturing a Main projection.
  await expect(button(adapter.add)).toBeEnabled()
  await expect(button('Save Project')).toBeEnabled()
  await drainObserver()
  await adopted(await current())
}
async function assertPrompt(text) {
  await expect
    .poll(() =>
      view()
        .getByRole('textbox', { name: 'Positive prompt', exact: true })
        .locator('.cm-line')
        .allTextContents()
        .then((lines) => lines.join('\n')),
    )
    .toBe(text)
}
function assertRegionalShape(document) {
  const ids = ownedIds(document)
  assert.equal(new Set(ids).size, ids.length, 'All current owned IDs remain unique')
  for (const item of document.regionalGuidance ?? []) {
    assert.deepEqual(
      Object.keys(item).sort(),
      [
        'enabled',
        'id',
        'locked',
        'mask',
        'name',
        'overlayOpacity',
        ...(Object.hasOwn(item, 'prompts') ? ['prompts'] : []),
      ].sort(),
    )
    assertStoredMask(item.mask)
    if (!Object.hasOwn(item, 'prompts')) continue
    const prompts = item.prompts
    assert.deepEqual(Object.keys(prompts).sort(), [
      'negative',
      'positive',
      'useGlobalNegativePrompt',
    ])
    assert.equal(typeof prompts.useGlobalNegativePrompt, 'boolean')
    assert.ok(
      prompts.positive !== null || prompts.negative !== null,
      'Both-null wrapper is forbidden',
    )
    if (prompts.negative === null) assert.equal(prompts.useGlobalNegativePrompt, true)
    for (const prompt of [prompts.positive, prompts.negative]) {
      if (prompt === null) continue
      assert.deepEqual(Object.keys(prompt).sort(), ['embeddingRefs', 'text'])
      assert.equal(typeof prompt.text, 'string')
      assert.ok(Buffer.byteLength(prompt.text) <= 1024 * 1024)
      assert.ok(Array.isArray(prompt.embeddingRefs))
    }
  }
}
function withoutRegions(document) {
  const value = clone(document)
  delete value.regionalGuidance
  delete value.documentRevision
  return value
}
function assertProtectedSql(sql, label) {
  assert.ok(expectedSql, 'A complete verified SQL baseline is required')
  assert.deepEqual(sql, expectedSql, label + ': complete schema/tables/internal state changed')
}
function assertNeighbors(value) {
  assertRegionalShape(value.liveDocument)
  assert.deepEqual(
    content(value.liveDocument),
    content(expectedLiveDocument ?? fixture.saved),
    'Complete expected document: all regions/masks/prompts/metadata plus ordinary and Smart neighbors',
  )
  if (expectedSql) assertProtectedSql(value.sql, 'Neighbor SQL')
}
function assertSqlTransition(before, after, label, allowedIndexColumns = []) {
  assert.equal(
    digest(readFileSync(fixture.path)),
    latestSaved.sha256,
    label + ': timestamp allowance requires unchanged verified package',
  )
  if (expectedSql)
    assert.deepEqual(before, expectedSql, label + ': before differs from last verified SQL')
  const normalized = clone(after)
  const identifies = (row) =>
    row.local_project_key === fixture.key &&
    row.canonical_path === fixture.path &&
    row.document_id === latestSaved.project.documentId
  const previous = before.tables.project_index.filter(identifies)
  const next = normalized.tables.project_index.filter(identifies)
  assert.equal(previous.length, 1)
  assert.equal(next.length, 1)
  const actualAllowances = []
  for (const column of allowedIndexColumns) {
    assert.ok(['indexed_at', 'last_opened_at'].includes(column))
    if (previous[0][column] === next[0][column]) continue
    const oldTime =
      previous[0][column] === null && column === 'last_opened_at'
        ? -Infinity
        : Date.parse(previous[0][column])
    const newTime = Date.parse(next[0][column])
    assert.ok(Number.isFinite(newTime) && newTime >= oldTime)
    actualAllowances.push({
      table: 'project_index',
      key: fixture.key,
      column,
      before: previous[0][column],
      after: next[0][column],
    })
    next[0][column] = previous[0][column]
  }
  normalized.tables.project_index.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  assert.deepEqual(
    normalized,
    before,
    label + ': SQL differs beyond reviewed navigation timestamps',
  )
  report.sqlTransitions.push({ label, before, after, actualAllowances, passed: true })
  expectedSql = clone(after)
  checkpoint()
}
function assertSaveSql(before, after, loaded, sha256, label) {
  assertProtectedSql(before.sql, label + ' before')
  assert.equal(digest(readFileSync(fixture.path)), sha256)
  assert.deepEqual(loaded.project, before.liveDocument)
  const physical = statSync(fixture.path, { bigint: true })
  const expected = clone(before.sql)
  const rows = expected.tables.project_index.filter(
    (row) =>
      row.local_project_key === fixture.key &&
      row.canonical_path === fixture.path &&
      row.document_id === loaded.project.documentId,
  )
  assert.equal(rows.length, 1)
  const row = rows[0]
  const replacement = {
    document_revision: loaded.project.documentRevision,
    file_size_bytes: Number(physical.size),
    file_mtime_ns: physical.mtimeNs.toString(),
    file_fingerprint: `${physical.dev}:${physical.ino}:${physical.size}:${physical.mtimeNs}:${physical.ctimeNs}`,
  }
  const actualAllowances = []
  for (const [column, value] of Object.entries(replacement)) {
    if (row[column] !== value)
      actualAllowances.push({
        table: 'project_index',
        key: fixture.key,
        column,
        before: row[column],
        after: value,
      })
    row[column] = value
  }
  const current = after.sql.tables.project_index.find(
    (item) => item.local_project_key === fixture.key,
  )
  assert.ok(current)
  assert.ok(
    Number.isFinite(Date.parse(current.indexed_at)) &&
      Date.parse(current.indexed_at) >= Date.parse(row.indexed_at),
  )
  if (row.indexed_at !== current.indexed_at)
    actualAllowances.push({
      table: 'project_index',
      key: fixture.key,
      column: 'indexed_at',
      before: row.indexed_at,
      after: current.indexed_at,
    })
  row.indexed_at = current.indexed_at
  const acceptedIds = new Set([
    fixture.raster.id,
    ...fixture.patches.flatMap((patch) => patch.rasterSubLayers.map((variant) => variant.id)),
  ])
  let count = 0
  for (const item of expected.tables.project_accepted_result_index) {
    if (item.local_project_key !== fixture.key) continue
    assert.equal(item.document_id, loaded.project.documentId)
    assert.ok(acceptedIds.has(item.layer_id))
    count += 1
    if (item.document_revision !== loaded.project.documentRevision)
      actualAllowances.push({
        table: 'project_accepted_result_index',
        key: fixture.key,
        layerId: item.layer_id,
        column: 'document_revision',
        before: item.document_revision,
        after: loaded.project.documentRevision,
      })
    item.document_revision = loaded.project.documentRevision
  }
  assert.equal(count, acceptedIds.size)
  for (const name of ['project_index', 'project_accepted_result_index'])
    expected.tables[name].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  assert.deepEqual(
    after.sql,
    expected,
    label + ': only verified package-owned index facts may change',
  )
  report.sqlTransitions.push({
    label,
    before: before.sql,
    after: after.sql,
    verifiedPackage: {
      path: fixture.path,
      sha256,
      documentId: loaded.project.documentId,
      documentRevision: loaded.project.documentRevision,
    },
    actualAllowances,
    passed: true,
  })
  expectedSql = clone(after.sql)
  checkpoint()
}
function exactRegionalChange(before, after, change, label) {
  assertNeighbors(before)
  const expected = clone(before.liveDocument)
  change(expected, after)
  expected.documentRevision = after.liveDocument.documentRevision
  assert.deepEqual(after.liveDocument, expected, label + ': complete expected document')
  assert.notEqual(after.tab.documentRevision, before.tab.documentRevision)
  assert.deepEqual(after.savedDocument, before.savedDocument)
  assert.equal(after.packageSha256, before.packageSha256, 'Authoring must not Save')
  assert.deepEqual(after.sql, before.sql, 'Authoring must not mutate SQL')
  assertAuthoringFiles(before, after, label)
  assertExpectedDirty(after, expected, label)
  expectedLiveDocument = clone(expected)
  assertNeighbors(after)
}

async function witness() {
  withinDeadline()
  await expect(button(adapter.add)).toBeEnabled()
  await expect(button('Save Project')).toBeEnabled()
  const tab = await current()
  await adopted(tab)
  const saved = await readIgsPackage(fixture.path)
  const store = new ProjectShadowStore(path.join(appDataRoot, 'autosave'))
  let shadow
  await expect
    .poll(async () => {
      shadow = await store.inspect({ projectPath: fixture.path, savedPackage: saved })
      return tab.dirty
        ? shadow.status === 'recoverable' &&
            shadow.document.documentRevision === tab.documentRevision
        : ['absent', 'clean'].includes(shadow.status)
    })
    .toBe(true)
  const liveDocument = tab.dirty ? shadow.document : saved.project
  assert.equal(liveDocument.documentRevision, tab.documentRevision)
  assert.deepEqual(liveDocument.regionalGuidance, storedRegions(tab.regionalGuidance))
  assertRegionalViews(tab)
  const ui = await canvas()
    .locator('.canvas-area')
    .evaluate((area) => ({
      selected: [...document.querySelectorAll('.entity-select[aria-pressed="true"]')]
        .map((node) => node.getAttribute('aria-label'))
        .sort(),
      selectedRegionIndex: [
        ...document.querySelectorAll('.regional-section .entity-surface'),
      ].findIndex((row) => row.querySelector('.entity-select[aria-pressed="true"]')),
      selectedCompositingId:
        document
          .querySelector('[data-layer-id] .entity-select[aria-pressed="true"]')
          ?.closest('[data-layer-id]')
          ?.getAttribute('data-layer-id') ?? null,
      camera: { x: area.dataset.cameraX, y: area.dataset.cameraY, scale: area.dataset.cameraScale },
    }))
  ui.selectedId =
    ui.selectedRegionIndex >= 0
      ? tab.regionalGuidance[ui.selectedRegionIndex].id
      : ui.selectedCompositingId
  assert.ok(
    Object.values(ui.camera).every(
      (value) => value !== undefined && Number.isFinite(Number(value)),
    ),
  )
  const value = {
    tab,
    liveDocument,
    savedDocument: saved.project,
    packageSha256: digest(readFileSync(fixture.path)),
    files: retainProductFiles(),
    sql: sqlState(),
    ui,
    mutations: await mutations(),
  }
  assertOwnedShadowFiles(value)
  return value
}
function mutationDelta(before, after, expected, label) {
  const actual = mutationsSince(before.mutations, after.mutations)
  assert.deepEqual(
    actual.map(({ channel, args, finished, delivered, ok }) => ({
      channel,
      args,
      finished,
      delivered,
      ok,
    })),
    expected.map(({ channel, args, ok = true }) => ({
      channel,
      args,
      finished: true,
      delivered: true,
      ok,
    })),
    label,
  )
  report.expectedActions.push({ label, actual, before, after })
  checkpoint()
}
async function unchanged(before, label, expected = []) {
  await drainObserver()
  const after = await witness()
  mutationDelta(before, after, expected, label)
  assert.deepEqual({ ...after, mutations: [] }, { ...before, mutations: [] }, label)
  report.witnesses.push({ label, before, after })
  checkpoint()
  return after
}
function ownedIds(document) {
  return [
    ...document.layers.flatMap((layer) =>
      layer.kind === 'smart-patch'
        ? [layer.id, layer.mask.id, ...layer.rasterSubLayers.map(({ id }) => id)]
        : [layer.id],
    ),
    ...(document.regionalGuidance ?? []).flatMap((item) => [item.id, item.mask.id]),
  ]
}

function assertExpectedDirty(value, expectedDocument, label) {
  // Match ProjectSession.contentKey exactly: revision and portable Save seed metadata do not
  // define editable content. An exact return to saved content restores its saved revision.
  const sessionContentKey = (document) =>
    JSON.stringify({ ...document, documentRevision: null, lastActualSeedSnapshot: null })
  const expectedDirty =
    sessionContentKey(expectedDocument) !== sessionContentKey(value.savedDocument)
  assert.equal(
    value.tab.dirty,
    expectedDirty,
    label + ': dirty differs from full session content equality',
  )
  if (!expectedDirty)
    assert.deepEqual(
      value.liveDocument,
      value.savedDocument,
      label + ': clean content must equal the complete saved document, including its revision',
    )
}

function identity(pid) {
  try {
    const stat = readFileSync('/proc/' + pid + '/stat', 'utf8')
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
      const status = readFileSync('/proc/' + entry + '/status', 'utf8')
      parents.set(Number(entry), Number(status.match(/^PPid:\s+(\d+)$/m)?.[1]))
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
    }
  }
  const pids = new Set([nativeProcess.pid])
  for (let changed = true; changed;) {
    changed = false
    for (const [pid, parent] of parents) {
      if (pids.has(parent) && !pids.has(pid)) {
        pids.add(pid)
        changed = true
      }
    }
  }
  for (const pid of pids) {
    const value = identity(pid)
    if (value) observed.set(String(pid) + ':' + value.start, value)
  }
}
function launcherBound() {
  const group = readFileSync('/proc/self/cgroup', 'utf8')
    .trim()
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3)
  assert.ok(group?.startsWith('/') && group !== '/')
  const directory = '/sys/fs/cgroup' + group
  const memoryMax = readFileSync(directory + '/memory.max', 'utf8').trim()
  assert.match(memoryMax, /^\d+$/)
  assert.ok(BigInt(memoryMax) <= 2n * 1024n ** 3n)
  assert.equal(readFileSync(directory + '/memory.swap.max', 'utf8').trim(), '0')
  return { group, memoryMax, swapMax: '0' }
}
function durationSeconds(value) {
  const text = value.replace(/\s+/g, '')
  if (text === '0') return 0
  const token = /(\d+(?:\.\d+)?)(us|ms|min|s|h|d|w)/g
  assert.equal(text.replace(token, ''), '', 'Unrecognized finite duration ' + value)
  const scale = { us: 0.000001, ms: 0.001, s: 1, min: 60, h: 3600, d: 86400, w: 604800 }
  return [...text.matchAll(token)].reduce(
    (sum, match) => sum + Number(match[1]) * scale[match[2]],
    0,
  )
}
async function properties(unit, names) {
  const { stdout } = await nativeExec(
    'systemctl',
    ['--user', 'show', '--property=' + names.join(','), unit],
    { timeout: 5000, maxBuffer: 16 * 1024 },
  )
  return Object.fromEntries(
    stdout
      .trim()
      .split('\n')
      .map((line) => {
        const at = line.indexOf('=')
        return [line.slice(0, at), line.slice(at + 1)]
      }),
  )
}
async function verifyLauncherDeadline() {
  const launcher = launcherBound()
  const unit = path.basename(launcher.group)
  const value = await properties(unit, [
    'ControlGroup',
    'RuntimeMaxUSec',
    'TimeoutStopUSec',
    'KillMode',
    'ActiveEnterTimestampMonotonic',
  ])
  assert.equal(value.ControlGroup, launcher.group)
  assert.equal(value.KillMode, 'control-group')
  const runtimeSeconds = durationSeconds(value.RuntimeMaxUSec)
  const stopSeconds = durationSeconds(value.TimeoutStopUSec)
  assert.ok(runtimeSeconds > 0 && runtimeSeconds <= 300)
  assert.ok(stopSeconds >= 0 && stopSeconds <= 30)
  assert.match(value.ActiveEnterTimestampMonotonic, /^\d+$/)
  const activeMono = Number(value.ActiveEnterTimestampMonotonic) / 1000
  assert.ok(activeMono > 0 && activeMono <= mono())
  overallDeadline = Math.min(overallDeadline, activeMono + runtimeSeconds * 1000)
  withinDeadline()
  return {
    ...launcher,
    unit,
    properties: value,
    activeMono,
    runtimeSeconds,
    stopSeconds,
    overallDeadline,
  }
}
async function bounds(label) {
  withinDeadline()
  const value = await boundQualificationProcess(nativeProcess.pid, {
    deadlineSeconds: scopeDeadlineSeconds,
    execute: (file, args, options) => {
      // Recompute at timer creation, not at launch. Recovery never obtains another 300s.
      const actualArgs = args.map((item) => {
        if (item === 'MemoryMax=12G') return 'MemoryMax=2G'
        if (item.startsWith('--on-active=')) {
          const remaining = Math.floor((overallDeadline - mono()) / 1000) - 1
          assert.ok(remaining > 0, 'Insufficient global deadline for owned timer')
          return '--on-active=' + remaining + 's'
        }
        return item
      })
      if (file === 'systemd-run' && actualArgs.some((item) => item.startsWith('--on-active='))) {
        actualArgs.unshift(
          '--timer-property=AccuracySec=1us',
          '--timer-property=RandomizedDelaySec=0',
        )
      }
      return nativeExec(file, actualArgs, options)
    },
  })
  // Register identities/timers before any later assertion can fail.
  nativeChecks.push(value)
  const launcher = launcherBound()
  assert.equal(launcher.group, report.launcher.group)
  const groups = new Map(value.groups.map((group) => [group.group, BigInt(group.memoryMax)]))
  groups.set(launcher.group, BigInt(launcher.memoryMax))
  const uniqueTotalMax = [...groups.values()].reduce((sum, amount) => sum + amount, 0n)
  assert.ok(uniqueTotalMax <= 4n * 1024n ** 3n, 'Explicit aggregate ceiling is 4GiB')
  const timers = []
  for (const group of value.groups) {
    assert.ok(BigInt(group.memoryMax) <= 2n * 1024n ** 3n)
    assert.equal(group.swapMax, '0')
    assert.ok(group.group === launcher.group || (group.ownedScope && group.deadlineTimer))
    if (group.deadlineTimer) {
      const timer = await properties(group.deadlineTimer + '.timer', [
        'ActiveState',
        'NextElapseUSecMonotonic',
        'AccuracyUSec',
        'RandomizedDelayUSec',
      ])
      assert.equal(timer.ActiveState, 'active')
      assert.ok(durationSeconds(timer.AccuracyUSec) <= 0.000001)
      assert.equal(durationSeconds(timer.RandomizedDelayUSec), 0)
      const deadlineMono = durationSeconds(timer.NextElapseUSecMonotonic) * 1000
      assert.ok(
        deadlineMono > mono() && deadlineMono <= overallDeadline,
        'Actual native timer exceeds the one overall deadline',
      )
      timers.push({
        group: group.group,
        timer: group.deadlineTimer,
        deadlineMono,
        properties: timer,
      })
    }
  }
  const memorySamples = [...groups.keys()].map((group) => {
    const directory = '/sys/fs/cgroup' + group
    const stat = Object.fromEntries(
      readFileSync(directory + '/memory.stat', 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split(' ')),
    )
    assert.match(stat.anon, /^\d+$/)
    assert.match(stat.file, /^\d+$/)
    return {
      group,
      memoryCurrent: readFileSync(directory + '/memory.current', 'utf8').trim(),
      memoryPeak: readFileSync(directory + '/memory.peak', 'utf8').trim(),
      memoryStat: { anon: stat.anon, file: stat.file, kernel: stat.kernel, slab: stat.slab },
    }
  })
  report.resourceLimitChecks.push({
    label,
    ...value,
    overallDeadline,
    timers,
    memorySamples,
    uniqueTotalMax: String(uniqueTotalMax),
    explicitAggregateCeilingBytes: String(4n * 1024n ** 3n),
  })
  checkpoint()
}
function allExited() {
  return (
    !application &&
    !report.nativeLaunchError &&
    report.nativeClosures.length === (report.nativeLaunchAttempts ?? 0) &&
    report.nativeClosures.every(({ confirmed }) => confirmed)
  )
}
async function closeNative(label, kind = 'healthy') {
  if (!application) return
  assert.ok(['healthy', 'intentional-dirty-crash', 'abort'].includes(kind))
  if (kind === 'intentional-dirty-crash') {
    assert.ok(report.dirtyCrashPrecondition?.durableShadowRetained)
    assert.ok(report.dirtyCrashPrecondition.packageUnchanged)
  }
  let causalError
  try {
    await bounds(label + '-before-exit')
  } catch (error) {
    causalError = error
  }
  clearInterval(sampler)
  await sampling
  sampleDescendants()
  for (const value of observed.values())
    nativeChecks.push({ processIdentities: [value], groups: [] })
  const child = nativeProcess
  const known = nativeChecks
    .flatMap(({ processIdentities }) => processIdentities)
    .find(({ pid }) => pid === child.pid)
  assert.ok(known, 'Owned actor identity must have been recorded')
  const exited = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  )
  let timer
  try {
    if (kind === 'healthy') {
      await Promise.race([
        application.close(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Native healthy close exceeded10s')), 10_000)
        }),
      ])
    } else {
      const live = identity(child.pid)
      if (live) {
        assert.deepEqual(live, known, 'Refuse a reused PID')
        const owned = nativeChecks
          .findLast(({ nativeIdentity }) => nativeIdentity)
          ?.groups.find(({ ownedScope, pids }) => ownedScope && pids.includes(child.pid))
        if (kind === 'abort' && owned)
          report.abortTermination = await stopExpiredQualificationProcess({
            ...known,
            group: owned.group,
          })
        else assert.equal(child.kill('SIGKILL'), true)
      }
    }
  } catch (error) {
    causalError ??= error
    const live = identity(child.pid)
    if (live) {
      assert.deepEqual(live, known)
      const owned = nativeChecks
        .findLast(({ nativeIdentity }) => nativeIdentity)
        ?.groups.find(({ ownedScope, pids }) => ownedScope && pids.includes(child.pid))
      if (owned) await stopExpiredQualificationProcess({ ...known, group: owned.group })
      else assert.equal(child.kill('SIGKILL'), true)
    }
  } finally {
    clearTimeout(timer)
  }
  const physical = await bounded(
    confirmQualificationProcessExit(nativeChecks),
    20000,
    'physical native exit',
  )
  assert.equal(physical.confirmed, true)
  const actual =
    child.exitCode !== null || child.signalCode !== null
      ? { code: child.exitCode, signal: child.signalCode }
      : await exited
  report.nativeClosures.push({ label, kind, ...physical, ...actual, at: new Date().toISOString() })
  nativeChecks.length = 0
  application = null
  window = null
  observerInstalled = false
  checkpoint()
  if (kind === 'healthy') {
    assert.equal(actual.code, 0, 'Healthy close requires exit code0')
    assert.equal(actual.signal, null)
  } else if (kind === 'intentional-dirty-crash') {
    assert.equal(actual.signal, 'SIGKILL')
  }
  if (causalError) throw causalError
}
async function launch(label) {
  withinDeadline()
  assert.ok(application === undefined || application === null, 'Only one serial native actor')
  if (report.nativeLaunchAttempts) assert.equal(allExited(), true, 'Restart requires physical exit')
  scopeDeadlineSeconds = Math.floor((overallDeadline - mono()) / 1000)
  assert.ok(scopeDeadlineSeconds > 0 && scopeDeadlineSeconds <= 300)
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
      args: [
        '--ozone-platform=x11',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        // Same owned-only compositor profile as smoke-smart-patch-mask.mjs.
        // Keep real rAF callbacks running independently of an idle desktop's frame clock.
        '--disable-frame-rate-limit',
        '--disable-gpu-vsync',
        '.',
      ],
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
  await bounds(label + '-launch')
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
  const compositorProfile = await application.evaluate(({ app }) =>
    Object.fromEntries(
      [
        'disable-backgrounding-occluded-windows',
        'disable-renderer-backgrounding',
        'disable-frame-rate-limit',
        'disable-gpu-vsync',
      ].map((name) => [name, app.commandLine.hasSwitch(name)]),
    ),
  )
  assert.ok(Object.values(compositorProfile).every((value) => value === true))
  ;(report.nativeCompositorProfiles ??= []).push({ label, switches: compositorProfile })
  window.setDefaultTimeout(8000)
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await application.evaluate(({ BrowserWindow }) => {
    const owned = BrowserWindow.getAllWindows()[0]
    owned.show()
    owned.focus()
  })
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await installObserver()
  await setNativeSize(1440, 900)
  report.actualNativeVersions ??= []
  report.actualNativeVersions.push({
    label,
    versions: await application.evaluate(() => process.versions),
  })
  const offline = await window.evaluate(async () => ({
    runtime: await window.api.runtime.getStatus(),
    catalog: await window.api.models.getCatalog(),
  }))
  assert.equal(offline.runtime.ok, true)
  assert.equal(offline.runtime.value.kind, 'not-installed')
  assert.deepEqual(offline.catalog, { ok: true, value: [] })
  report.offlineChecks ??= []
  report.offlineChecks.push({ label, ...offline })
  // A rendered Home row, not only a nonbusy flag, proves initial index discovery has completed.
  await expect(
    window.getByRole('button', { name: 'Open ' + projectTitle, exact: true }),
  ).toBeVisible()
  checkpoint()
}

function reference(family, name) {
  return {
    baseModelFamily: family,
    civitaiFileId: null,
    civitaiModelId: null,
    civitaiVersionId: null,
    displayName: name,
    fileSha256: digest(Buffer.from(name)),
    kind: 'checkpoint',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: family === 'anima' ? null : 'epsilon',
    versionName: 'Absent portable fixture',
  }
}
async function prepare() {
  const packagePath = path.join(workspace, projectTitle + '.igs')
  const session = await ProjectSession.create(packagePath, projectTitle, roots)
  const inputs = [],
    patches = []
  for (const [index, family] of ['illustrious', 'anima'].entries()) {
    const patchId = randomUUID(),
      maskId = randomUUID()
    const maskBytes = encodeProjectMaskPng(Uint8Array.of(0, 64, 128, 255), 2, 2)
    const maskSha = digest(maskBytes)
    const variants = []
    for (let position = 0; position < 2; position++) {
      const value = smartPatchVariantMetadataFixture(family)
      const pixels = Array.from({ length: 35 }, () => [
        40 + index * 60,
        80 + position * 30,
        170,
        255,
      ]).flat()
      const bytes = literalSmartPatchColorPng(7, 5, pixels, 4)
      Object.assign(value.asset, { bytes: bytes.length, sha256: digest(bytes) })
      value.name = family + ' accepted contribution ' + position
      Object.assign(value.generationProvenance.layerSourceContext, {
        layerId: patchId,
        sourceDocumentId: session.document.documentId,
        sourceDocumentRevision: session.document.documentRevision,
      })
      Object.assign(value.generationProvenance.executionResultContext.output, {
        byteSize: bytes.length,
        sha256: digest(bytes),
      })
      value.generationProvenance.executionResultContext.output.contributionAlpha8.sha256 = digest(
        Buffer.alloc(35, 255),
      )
      variants.push(value)
      inputs.push({ member: value.asset.path, bytes, ownerId: patchId, kind: 'accepted-smart' })
    }
    const patch = {
      id: patchId,
      kind: 'smart-patch',
      name: family + ' Smart neighbor',
      activeRasterSubLayerId: variants[0].id,
      blendMode: 'normal',
      boundingBox: { x: -73 + index * 128, y: 51, width: 512, height: 384 },
      internalResolution: { width: 256, height: 192 },
      generationDraft: structuredClone(session.document.generationDraft),
      mask: {
        id: maskId,
        revision: 3 + index,
        asset: {
          path: 'assets/masks/' + maskId + '/' + maskSha + '.png',
          bytes: maskBytes.length,
          width: 2,
          height: 2,
          sha256: maskSha,
        },
        bounds: { x: -9 + index * 4, y: 13, width: 2, height: 2 },
      },
      maskSettings: { blur: 9 + index, padding: 4 + index },
      coherenceSettings: { edgeSize: 16, minimumDenoise: 0, mode: 'Gaussian Blur' },
      locked: false,
      visible: true,
      opacity: 0.8,
      rasterSubLayers: variants,
    }
    Object.assign(patch.generationDraft, {
      model: reference(family, family + ' absent current Smart checkpoint'),
      positivePrompt: { text: 'SMART ' + index + ' {day|night}', embeddingRefs: [] },
      negativePrompt: { text: 'SMART negative ' + index, embeddingRefs: [] },
      seed: { policy: 'fixed', value: 71 + index },
      cfgRescale: 0,
      vae: null,
      vaePrecision: 'Auto',
    })
    Object.assign(patch.generationDraft.sampling, {
      cfgScale: 6 + index,
      steps: 31 + index,
      denoisingStrength: 0.63,
      sampler: family === 'anima' ? null : 'Euler',
      scheduler: family === 'anima' ? null : 'Normal',
      ...(family === 'anima' ? { animaMethod: 'euler' } : {}),
    })
    inputs.push({
      member: patch.mask.asset.path,
      bytes: maskBytes,
      ownerId: patchId,
      kind: 'smart-mask',
    })
    patches.push(patch)
  }
  const rasterId = randomUUID()
  const rasterBytes = literalSmartPatchColorPng(
    8,
    8,
    Array.from({ length: 64 }, () => [33, 99, 155, 255]).flat(),
    4,
  )
  const raster = {
    id: rasterId,
    kind: 'raster',
    name: 'Ordinary Raster neighbor',
    blendMode: 'normal',
    asset: {
      path: 'assets/layers/' + rasterId + '.png',
      bytes: rasterBytes.length,
      sha256: digest(rasterBytes),
      width: 8,
      height: 8,
    },
    generationProvenance: acceptedRasterProvenanceFixture(session.document, rasterBytes, {
      x: 3,
      y: 5,
      width: 8,
      height: 8,
    }),
    locked: false,
    visible: true,
    opacity: 1,
    transform: { x: 3, y: 5, scaleX: 1, scaleY: 1, rotationDegrees: 0 },
  }
  inputs.push({
    member: raster.asset.path,
    bytes: rasterBytes,
    ownerId: rasterId,
    kind: 'ordinary-raster',
  })
  session.applyDocument({
    ...session.document,
    layers: [...patches, raster],
    lastActualSeedSnapshot: 0,
    primaryBbox: { x: -301, y: 207, width: 640, height: 448 },
    generationDraft: {
      ...session.document.generationDraft,
      model: reference('illustrious', 'Distinct absent PROJECT checkpoint'),
      positivePrompt: { text: 'PROJECT {red|green} remains exact', embeddingRefs: [] },
      negativePrompt: { text: 'PROJECT negative remains exact', embeddingRefs: [] },
      seed: { policy: 'reuse', value: null },
    },
  })
  assert.equal(Object.hasOwn(session.document, 'regionalGuidance'), false)
  await session.save({
    assets: Object.fromEntries(inputs.map(({ member, bytes }) => [member, { bytes }])),
    // ProjectSession.applyDocument preserves the old portable seed snapshot. Seed0 is genuine
    // Save metadata, so establish it here rather than letting the clean legacy control add it.
    lastActualSeedSnapshot: 0,
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
        updated_at: '2026-10-23T00:00:00.000Z',
      })
      .execute()
  } finally {
    await database.close()
  }
  const loaded = await readIgsPackage(packagePath)
  assert.equal(loaded.project.lastActualSeedSnapshot, 0)
  assert.equal(
    Object.hasOwn(loaded.project, 'regionalGuidance'),
    false,
    'Legacy absence stays absent',
  )
  fixture = {
    key: session.localRecoveryKey,
    path: packagePath,
    saved: loaded.project,
    patches,
    raster,
    inputs,
    packageSha256: digest(readFileSync(packagePath)),
  }
  latestSaved = { project: loaded.project, sha256: fixture.packageSha256 }
  for (const [index, input] of inputs.entries()) {
    assert.ok((await loaded.readMember(input.member)).equals(input.bytes))
    const file = path.join(fixtureRoot, 'source-' + index + '.png')
    writeFileSync(file, input.bytes, { flag: 'wx', mode: 0o600 })
    input.retained = retain(file, 'prepared/inputs/' + index + '.png')
  }
  retain(packagePath, 'prepared/legacy-source.igs')
  retainJson('prepared/fixture.json', {
    key: fixture.key,
    saved: fixture.saved,
    inputs: inputs.map(({ bytes, ...input }) => ({
      ...input,
      sha256: digest(bytes),
      byteSize: bytes.length,
    })),
    declaredPrecondition: report.boundary.fixtures,
  })
}

function checkedDelta(
  before,
  after,
  label,
  {
    writes = [],
    textOwner = null,
    finalText = null,
    maxSeals = 2,
    allowGlobalGroup = false,
    trailingSave = false,
    sealPolicy = 'document',
    focusOwner = null,
  } = {},
) {
  const delta = mutationsSince(before.mutations, after.mutations)
  assert.ok(delta.length <= 32, label + ': bounded exact invocation inventory')
  let revision = before.tab.documentRevision
  const actualWrites = [],
    seals = [],
    groups = new Set(),
    saves = []
  for (const call of delta) {
    assert.equal(call.finished, true)
    assert.equal(call.delivered, true)
    assert.equal(call.originalCalls, 1, label + ': original Main exactly once')
    assert.equal(call.ok, true, JSON.stringify(call.error))
    assert.equal(call.args[0], before.tab.id)
    if (call.channel === ipcChannels.projects.sealPromptHistory) {
      assert.equal(call.args.length, 2)
      const group = call.args[1]
      if (!textOwner && sealPolicy === 'document' && !allowGlobalGroup)
        assert.equal(group, null, 'Only the explicit document-action seal is expected')
      if (textOwner && !trailingSave)
        assert.notEqual(group, null, 'Typing cannot insert an unrelated document-wide seal')
      if (group !== null) {
        assert.equal(typeof group, 'string')
        assert.ok(
          /^regional:[0-9a-f-]{36}:(positive|negative):[0-9a-f-]{36}$/.test(group) ||
            (allowGlobalGroup && /^[0-9a-f-]{36}$/.test(group)),
          'Unrecognised history seal owner ' + group,
        )
        if (textOwner)
          assert.ok(group.startsWith('regional:' + textOwner.id + ':' + textOwner.polarity + ':'))
      }
      seals.push({ id: call.id, args: call.args, precedingWriteCount: actualWrites.length })
    } else if (trailingSave && call.channel === ipcChannels.projects.save) {
      assert.deepEqual(call.args, [before.tab.id])
      assert.equal(saves.length, 0)
      saves.push(call)
    } else {
      assert.equal(saves.length, 0, 'No authoring write may follow the dependent Save')
      if (textOwner) {
        assert.equal(call.channel, adapter.channels.prompt)
        assert.equal(call.args.length, 3)
        const [tabId, owner, change] = call.args
        assert.deepEqual(owner, {
          documentId: before.tab.documentId,
          documentRevision: revision,
          regionId: textOwner.id,
        })
        assert.deepEqual(Object.keys(change).sort(), ['historyGroupId', 'kind', 'polarity', 'text'])
        assert.equal(change.kind, 'text')
        assert.equal(change.polarity, textOwner.polarity)
        assert.ok(
          change.historyGroupId.startsWith(
            'regional:' + owner.regionId + ':' + change.polarity + ':',
          ),
        )
        if (focusOwner)
          assert.ok(
            change.historyGroupId.startsWith(
              'regional:' + focusOwner.id + ':' + focusOwner.polarity + ':',
            ),
          )
        assert.match(
          change.historyGroupId,
          /^regional:[0-9a-f-]{36}:(positive|negative):[0-9a-f-]{36}$/,
        )
        assert.equal(typeof change.text, 'string')
        groups.add(change.historyGroupId)
      }
      actualWrites.push({ channel: call.channel, args: call.args })
    }
    const response = callResponse(call)
    const responseTab = response?.value?.tab ?? response?.value
    assert.equal(responseTab?.id, before.tab.id, label + ': retain original real acknowledgement')
    assert.equal(responseTab.documentId, before.tab.documentId)
    if (
      call.channel === ipcChannels.projects.sealPromptHistory ||
      call.channel === ipcChannels.projects.save
    )
      assert.equal(
        responseTab.documentRevision,
        revision,
        'Seal/Save cannot rewrite editable content',
      )
    revision = responseTab.documentRevision
  }
  assert.ok(seals.length <= maxSeals, label + ': unexpected extra seals')
  if (sealPolicy === 'document' && !textOwner && !allowGlobalGroup)
    assert.equal(seals.length, maxSeals, 'Exact document-action seal count')
  if (textOwner)
    assert.equal(seals.length, trailingSave ? 2 : 1, 'Exact typed group/document seal count')
  assert.equal(saves.length, trailingSave ? 1 : 0)
  if (textOwner) {
    assert.ok(actualWrites.length > 0)
    assert.equal(groups.size, 1, 'One focus transaction owns one regional history group')
    assert.equal(actualWrites.at(-1).args[2].text, finalText)
    const lastWrite = delta.findLastIndex((call) => call.channel === adapter.channels.prompt)
    const group = [...groups][0]
    assert.ok(
      delta
        .slice(lastWrite + 1)
        .some(
          (call) =>
            call.channel === ipcChannels.projects.sealPromptHistory && call.args[1] === group,
        ),
      'Matching blur seal must follow the final write',
    )
    if (trailingSave) {
      const documentSeal = delta.findIndex(
        (call) => call.channel === ipcChannels.projects.sealPromptHistory && call.args[1] === null,
      )
      const saveAt = delta.findIndex((call) => call.channel === ipcChannels.projects.save)
      assert.ok(
        documentSeal > lastWrite && documentSeal < saveAt,
        'Dependent Save seals only after every regional write',
      )
    }
  } else assert.deepEqual(actualWrites, writes, label + ': exact non-seal calls')
  assert.equal(after.tab.documentRevision, revision, label + ': no unaccounted document revision')
  report.expectedActions.push({
    label,
    before,
    after,
    actualOrderedSequence: delta,
    seals,
    saves,
    writeCount: actualWrites.length,
  })
  checkpoint()
  return delta
}
async function neutral(label = 'Explicit empty focus boundary') {
  await idle()
  const focused = await window.evaluate(() => {
    const node = document.activeElement
    return node?.matches('.cm-content')
      ? {
          label: node.getAttribute('aria-label'),
          regionId:
            node
              .closest('[data-regional-guidance-id]')
              ?.getAttribute('data-regional-guidance-id') ?? null,
        }
      : null
  })
  if (!focused) return
  const before = await witness()
  await window.keyboard.press('Tab')
  await idle()
  const after = await witness()
  checkedDelta(before, after, label, {
    maxSeals: 1,
    allowGlobalGroup: !focused.regionId,
    sealPolicy: 'focus',
    focusOwner: focused.regionId
      ? {
          id: focused.regionId,
          polarity: focused.label === adapter.positive ? 'positive' : 'negative',
        }
      : null,
  })
  assert.deepEqual(
    { ...after, mutations: [] },
    { ...before, mutations: [] },
    label + ': focus-only operation must preserve all state',
  )
}
async function selectEntity(id) {
  await neutral('Blur before intentional entity selection')
  const before = await witness()
  const item =
    before.tab.regionalGuidance?.find((item) => item.id === id) ??
    before.tab.layers.find((item) => item.id === id)
  assert.ok(item)
  const target = before.tab.regionalGuidance?.some((item) => item.id === id)
    ? regionalRow(before.tab, id).getByRole('button', { name: 'Select ' + item.name, exact: true })
    : selectButton(item.name)
  if ((await target.getAttribute('aria-pressed')) === 'true') return before
  await target.scrollIntoViewIfNeeded()
  await target.click()
  await expect(target).toHaveAttribute('aria-pressed', 'true')
  await idle()
  const after = await witness()
  checkedDelta(before, after, 'Intentional entity selection, including every seal', {
    writes: [],
    maxSeals: 1,
  })
  assert.deepEqual({ ...after, ui: before.ui, mutations: [] }, { ...before, mutations: [] })
  assert.deepEqual(after.ui.camera, before.ui.camera)
  assert.equal(after.ui.selectedId, id)
  assert.deepEqual(after.ui.selected, ['Select ' + item.name])
  return after
}
async function addRegion() {
  await neutral()
  const before = await witness()
  await button(adapter.add).click()
  await expect
    .poll(async () => (await current()).regionalGuidance?.length)
    .toBe((before.tab.regionalGuidance?.length ?? 0) + 1)
  await idle()
  const after = await witness()
  checkedDelta(before, after, 'Actual Add Regional Guidance', {
    writes: [{ channel: adapter.channels.add, args: [before.tab.id, documentOwner(before.tab)] }],
    maxSeals: 1,
  })
  const added = after.liveDocument.regionalGuidance.at(-1)
  assert.deepEqual(added, {
    id: added.id,
    name: 'Regional Guidance',
    enabled: true,
    locked: false,
    overlayOpacity: 0.5,
    mask: { id: added.mask.id, revision: 0, asset: null },
  })
  assert.equal(ownedIds(before.liveDocument).includes(added.id), false)
  assert.equal(ownedIds(before.liveDocument).includes(added.mask.id), false)
  exactRegionalChange(
    before,
    after,
    (expected) => {
      expected.regionalGuidance = [...(expected.regionalGuidance ?? []), clone(added)]
    },
    'Add exact metadata-only region',
  )
  assert.equal(after.ui.selectedId, added.id)
  return added.id
}
async function updateUi(id, change) {
  await neutral()
  const before = await witness()
  const item = region(before.tab, id)
  const row = regionalRow(before.tab, id)
  assert.ok(['enabled', 'lock'].includes(change.kind), 'Finite metadata adapter')
  await row
    .getByRole('button', {
      name:
        change.kind === 'enabled'
          ? (item.enabled ? 'Hide ' : 'Show ') + item.name
          : (item.locked ? 'Unlock ' : 'Lock ') + item.name,
      exact: true,
    })
    .click()
  await expect
    .poll(async () => (await current()).documentRevision)
    .not.toBe(before.tab.documentRevision)
  await idle()
  const after = await witness()
  checkedDelta(before, after, 'Metadata ' + change.kind, {
    writes: [
      {
        channel: adapter.channels.update,
        args: [before.tab.id, entityOwner(before.tab, id), change],
      },
    ],
    maxSeals: 1,
  })
  exactRegionalChange(
    before,
    after,
    (expected) => {
      const next = expected.regionalGuidance.find((entry) => entry.id === id)
      if (change.kind === 'enabled') next.enabled = change.enabled
      else next.locked = change.locked
    },
    'Only requested metadata changes',
  )
  assert.deepEqual(after.ui, before.ui)
  return { before, after }
}
function applyPromptChange(document, id, change) {
  const item = document.regionalGuidance.find((entry) => entry.id === id)
  const prompts = item.prompts ?? { positive: null, negative: null, useGlobalNegativePrompt: true }
  if (change.kind === 'block') {
    if (change.present) {
      prompts[change.polarity] ??= emptyPrompt()
      if (change.polarity === 'negative') prompts.useGlobalNegativePrompt = false
    } else {
      prompts[change.polarity] = null
      if (change.polarity === 'negative') prompts.useGlobalNegativePrompt = true
    }
  } else if (change.kind === 'text')
    prompts[change.polarity] = { ...prompts[change.polarity], text: change.text }
  else prompts.useGlobalNegativePrompt = change.useGlobalNegativePrompt
  if (prompts.positive === null && prompts.negative === null) delete item.prompts
  else item.prompts = prompts
}
async function promptUi(id, change) {
  await neutral()
  const before = await witness()
  const row = regionalRow(before.tab, id)
  if (change.kind === 'block') {
    const label = change.present
      ? change.polarity === 'positive'
        ? 'Prompt'
        : 'Negative Prompt'
      : change.polarity === 'positive'
        ? adapter.removePositive
        : adapter.removeNegative
    await row.getByRole('button', { name: label, exact: true }).click()
  } else {
    assert.equal(change.kind, 'negative-source')
    const toggle = row.getByRole('switch', { name: adapter.inherit, exact: true })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', String(change.useGlobalNegativePrompt))
  }
  await expect
    .poll(async () => (await current()).documentRevision)
    .not.toBe(before.tab.documentRevision)
  await idle()
  const after = await witness()
  checkedDelta(before, after, 'Regional prompt ' + change.kind, {
    writes: [
      {
        channel: adapter.channels.prompt,
        args: [before.tab.id, entityOwner(before.tab, id), change],
      },
    ],
    maxSeals: 0,
  })
  exactRegionalChange(
    before,
    after,
    (expected) => applyPromptChange(expected, id, change),
    'Prompt action exact document',
  )
  assert.deepEqual(after.ui, before.ui, 'Inline prompt action cannot select or retarget a layer')
  if (change.kind === 'block') {
    if (change.present) await expect(editor(id, change.polarity)).toBeFocused()
    else
      await expect(
        row.getByRole('button', {
          name: change.polarity === 'positive' ? 'Prompt' : 'Negative Prompt',
          exact: true,
        }),
      ).toBeFocused()
  }
  return { before, after }
}
async function writePrompt(id, polarity, text, suffix = '') {
  await neutral()
  const before = await witness()
  const input = editor(id, polarity)
  await input.fill(text)
  if (suffix) {
    await input.press('Control+End')
    await input.pressSequentially(suffix)
  }
  const finalText = text + suffix
  await expect(input).toBeFocused()
  await expect
    .poll(() =>
      input
        .locator('.cm-line')
        .allTextContents()
        .then((lines) => lines.join('\n')),
    )
    .toBe(finalText)
  await input.press('Tab')
  await idle()
  const after = await witness()
  checkedDelta(before, after, 'Live regional ' + polarity + ' typing and ordered blur', {
    textOwner: { id, polarity },
    finalText,
    maxSeals: 1,
  })
  exactRegionalChange(
    before,
    after,
    (expected) => applyPromptChange(expected, id, { kind: 'text', polarity, text: finalText }),
    'Typing changes exactly one owned prompt',
  )
  assert.deepEqual(after.ui, before.ui)
  return { before, after }
}
async function refused(method, args, code, label, channel, message = null) {
  await neutral()
  const before = await witness()
  const reply = await rawApi(method, ...args)
  assert.equal(reply.ok, false)
  assert.equal(reply.error.code, code)
  if (message !== null) assert.equal(reply.error.message, message)
  const after = await unchanged(before, label, [{ channel, args, ok: false }])
  const invocation = mutationRecords(after.mutations).at(-1)
  assert.equal(invocation.originalCalls, 1, 'Refusal reaches original Main once')
  report.refusals.push({ label, method, args, reply, invocation })
}
async function openProject(label, recover = false) {
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveCount(0)
  // Await initial Home indexing before capturing the action. The before state is never replaced
  // with an after-Open/Recover baseline; every original invocation, including extra seals, is kept.
  const refresh = window.getByRole('button', { name: 'Refresh projects', exact: true })
  await expect(refresh).toBeEnabled()
  await drainObserver()
  // Home's lazy igs-preview request materializes its verified package thumbnail after list
  // adoption. Settle that exact existing renderer image/cache before the strict Open baseline.
  // This also applies to later reopen/recovery; the expected thumbnail always belongs to Save.
  const readyPackage = await readIgsPackage(fixture.path)
  assert.deepEqual(readyPackage.project, latestSaved.project)
  assert.equal(digest(readFileSync(fixture.path)), latestSaved.sha256)
  const thumbnailMember = readyPackage.manifest.members.find(
    ({ path: member }) => member === 'preview/thumbnail.webp',
  )
  assert.ok(thumbnailMember)
  const thumbnailBytes = await readyPackage.readMember(thumbnailMember.path)
  assert.equal(thumbnailBytes.length, thumbnailMember.bytes)
  assert.equal(digest(thumbnailBytes), thumbnailMember.sha256)
  const card = window.locator('.home-view .project-row').filter({
    has: window.getByRole('button', { name: 'Open ' + projectTitle, exact: true }),
  })
  await expect(card).toHaveCount(1)
  await card.scrollIntoViewIfNeeded()
  const image = card.locator('.project-thumbnail img')
  await expect(image).toHaveCount(1)
  await image.scrollIntoViewIfNeeded()
  await expect
    .poll(() =>
      image.evaluate((node) => node.complete && node.naturalWidth > 0 && node.naturalHeight > 0),
    )
    .toBe(true)
  const renderedImage = await image.evaluate((node) => ({
    complete: node.complete,
    naturalWidth: node.naturalWidth,
    naturalHeight: node.naturalHeight,
    currentSrc: node.currentSrc,
  }))
  const thumbnailUrl = new URL(renderedImage.currentSrc)
  assert.equal(thumbnailUrl.protocol, 'igs-preview:')
  assert.equal(thumbnailUrl.hostname, 'thumbnail')
  assert.match(
    thumbnailUrl.pathname,
    new RegExp('^/' + fixture.key + '/' + thumbnailMember.sha256 + '/[a-f0-9]{64}\\.webp$'),
  )
  const thumbnailCachePath = path.join(
    appDataRoot,
    'previews/project-thumbnails',
    thumbnailMember.sha256 + '.webp',
  )
  await expect
    .poll(() => {
      if (!existsSync(thumbnailCachePath)) return false
      assert.ok(
        lstatSync(thumbnailCachePath).isFile() && !lstatSync(thumbnailCachePath).isSymbolicLink(),
      )
      return readFileSync(thumbnailCachePath).equals(thumbnailBytes)
    })
    .toBe(true)
  const thumbnailIndex = sqlState().tables.project_index.filter(
    (row) =>
      row.local_project_key === fixture.key &&
      row.canonical_path === fixture.path &&
      row.document_id === readyPackage.project.documentId,
  )
  assert.equal(thumbnailIndex.length, 1)
  assert.equal(thumbnailIndex[0].document_revision, readyPackage.project.documentRevision)
  assert.equal(thumbnailIndex[0].preview_thumbnail_sha256, thumbnailMember.sha256)
  report.homeThumbnailReadiness.push({
    label,
    packagePath: fixture.path,
    packageSha256: latestSaved.sha256,
    documentId: readyPackage.project.documentId,
    documentRevision: readyPackage.project.documentRevision,
    member: thumbnailMember,
    renderedImage,
    indexRow: thumbnailIndex[0],
    cachePath: thumbnailCachePath,
    cacheSha256: digest(readFileSync(thumbnailCachePath)),
    retained: retain(
      thumbnailCachePath,
      'home-thumbnail-readiness/' + report.homeThumbnailReadiness.length + '.webp',
    ),
  })
  checkpoint()
  // Every original reply is retained once in the launch journal; this raw navigation window
  // still counts every Open/Recover/seal independently of diagnostic current() calls.
  const invocationOffset = (await calls()).length
  const beforeSql = sqlState()
  const beforeFiles = dataHashes()
  const expectedDocument = structuredClone(
    recover ? report.dirtyCrashPrecondition.dirtyDocument : latestSaved.project,
  )
  const beforePackage = await readIgsPackage(fixture.path)
  assert.deepEqual(beforePackage.project, latestSaved.project)
  assert.equal(digest(readFileSync(fixture.path)), latestSaved.sha256)
  const record = {
    label,
    recover,
    invocationOffset,
    expectedDocument,
    beforeSql,
    beforeFiles,
    expected: [
      { channel: ipcChannels.projects.open, args: [fixture.key] },
      ...(recover
        ? [{ channel: ipcChannels.projects.resolveRecovery, args: [fixture.key, 'recover'] }]
        : []),
    ],
    passed: false,
  }
  report.navigationActions.push(record)
  checkpoint()
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await refresh.click()
  await expect(refresh).toBeEnabled()
  await window.getByRole('button', { name: 'Open ' + projectTitle, exact: true }).click()
  await expect
    .poll(async () => {
      const opened = (await calls())
        .slice(invocationOffset)
        .find(({ channel }) => channel === ipcChannels.projects.open)
      return opened?.finished && opened.delivered
    })
    .toBe(true)
  const openCall = (await calls())
    .slice(invocationOffset)
    .find(({ channel }) => channel === ipcChannels.projects.open)
  const openResponse = callResponse(openCall)
  assert.equal(openResponse?.ok, true, 'Original Main Open must succeed')
  assert.equal(openResponse.value.kind, recover ? 'recovery-required' : 'opened')
  if (recover) {
    assert.equal(openResponse.value.projectId, fixture.key)
    assert.equal(openResponse.value.recoveryStatus, 'recoverable')
    const dialog = window.getByRole('dialog', { name: 'Recovery available', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Recover', exact: true }).click()
    await expect(dialog).toHaveCount(0)
  }
  const adoptionChannel = recover ? ipcChannels.projects.resolveRecovery : ipcChannels.projects.open
  await expect
    .poll(async () => {
      const invocation = (await calls())
        .slice(invocationOffset)
        .find(({ channel }) => channel === adoptionChannel)
      return invocation?.finished && invocation.delivered
    })
    .toBe(true)
  const adoptionCall = (await calls())
    .slice(invocationOffset)
    .find(({ channel }) => channel === adoptionChannel)
  const adoptionResponse = callResponse(adoptionCall)
  assert.equal(adoptionResponse?.ok, true)
  const originalTab = recover ? adoptionResponse.value : adoptionResponse.value.tab
  assert.equal(originalTab.id, fixture.key)
  assert.equal(originalTab.documentId, expectedDocument.documentId)
  if (recover) {
    // ProjectAutosaveCoordinator.recover applies the saved shadow through ProjectSession,
    // which assigns and durably republishes a fresh revision. Every source property stays exact.
    assert.match(originalTab.documentRevision, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
    assert.notEqual(originalTab.documentRevision, expectedDocument.documentRevision)
    assert.notEqual(originalTab.documentRevision, latestSaved.project.documentRevision)
    record.recoveryRevision = {
      source: expectedDocument.documentRevision,
      adopted: originalTab.documentRevision,
      reason:
        'ProjectAutosaveCoordinator.recover -> ProjectSession.applyDocument republishes a fresh revision.',
    }
    expectedDocument.documentRevision = originalTab.documentRevision
  }
  assert.equal(originalTab.documentRevision, expectedDocument.documentRevision)
  assert.deepEqual(storedRegions(originalTab.regionalGuidance), expectedDocument.regionalGuidance)
  assertRegionalViews(originalTab)
  assert.deepEqual(originalTab.generationDraft, expectedDocument.generationDraft)
  assert.equal(originalTab.dirty, recover)
  assert.equal(originalTab.canUndo, false)
  assert.equal(originalTab.canRedo, false)
  await expect(view()).toBeVisible()
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  await adopted(originalTab)
  await expect(view().locator('.document-state')).toHaveText(recover ? 'Unsaved changes' : 'Saved')
  const selectedCompositingId = await view()
    .locator('.entity-select[aria-pressed="true"]')
    .evaluateAll(
      (nodes) => nodes[0]?.closest('[data-layer-id]')?.getAttribute('data-layer-id') ?? null,
    )
  const selectedPatch = originalTab.layers.find(
    (item) => item.id === selectedCompositingId && item.kind === 'smart-patch',
  )
  await assertPrompt(
    (selectedPatch?.generationDraft ?? originalTab.generationDraft).positivePrompt.text,
  )
  const adoptedDraft = selectedPatch?.generationDraft ?? originalTab.generationDraft
  await expect
    .poll(() =>
      view()
        .getByRole('textbox', { name: 'Negative prompt', exact: true })
        .locator('.cm-line')
        .allTextContents()
        .then((lines) => lines.join('\n')),
    )
    .toBe(adoptedDraft.negativePrompt.text)
  await expect(window.getByRole('tab', { name: originalTab.title, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  // Reuse the actual UI Open/Recover reply. idle() would call current() and emit another Open.
  // adopted() waits for real renderer controls/rows, including terminal busy settlement after
  // refreshProjects; completion of the observing Main wrapper alone is insufficient.
  await adopted(originalTab)
  record.rendererAdoption = {
    view: await view().getAttribute('aria-label'),
    documentState: await view().locator('.document-state').textContent(),
    selectedCompositingId,
    positivePrompt: adoptedDraft.positivePrompt,
    negativePrompt: adoptedDraft.negativePrompt,
    regionalOwnerIds: await regionalSection()
      .locator('[' + adapter.rowAttribute + ']')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-regional-guidance-id'))),
    pendingControlsSettled: true,
  }
  assert.equal(record.rendererAdoption.view, 'Project ' + originalTab.title)
  // current()/witness() are intentionally outside this window: diagnostic reads cannot mask an
  // extra real Open, recovery mutation or prompt-history seal emitted by the UI navigation.
  record.invocations = (await calls()).slice(invocationOffset)
  const actual = record.invocations.filter(
    ({ channel }) => channel === ipcChannels.projects.open || !readChannels.has(channel),
  )
  record.actualNavigation = actual
  record.originalAdoptedTab = originalTab
  record.afterSql = sqlState()
  record.afterFiles = dataHashes()
  checkpoint()
  assert.deepEqual(
    actual.map(({ channel, args, finished, delivered, ok }) => ({
      channel,
      args,
      finished,
      delivered,
      ok,
    })),
    record.expected.map(({ channel, args }) => ({
      channel,
      args,
      finished: true,
      delivered: true,
      ok: true,
    })),
    label + ': exact original Open/Recover sequence; no extra/ignored seals',
  )
  assertSqlTransition(beforeSql, record.afterSql, label + ' SQL', ['indexed_at', 'last_opened_at'])
  assert.equal(digest(readFileSync(fixture.path)), latestSaved.sha256, label + ': package changed')
  assert.deepEqual((await readIgsPackage(fixture.path)).project, latestSaved.project)
  // Clean Open must preserve all product bytes. Recovery owns its shadow reconciliation; exact
  // recovered document/assets and unchanged saved package are checked immediately below.
  if (!recover)
    assert.deepEqual(record.afterFiles, beforeFiles, label + ': clean Open changed product bytes')
  const after = await witness()
  if (recover) assertAuthoringFiles({ files: beforeFiles }, after, label + ' recovered files')
  assert.deepEqual(
    after.tab,
    originalTab,
    label + ': captured UI reply remains the exact open owner',
  )
  assert.deepEqual(
    after.liveDocument,
    expectedDocument,
    label + ': actual recovered/open document differs',
  )
  assert.deepEqual(after.savedDocument, latestSaved.project)
  if (baseline) assertNeighbors(after)
  record.passed = true
  checkpoint()
  return after
}

async function menuItem(id, label, activate = true) {
  await expect(window.getByRole('menuitem')).toHaveCount(0)
  const tab = await current(),
    item = region(tab, id)
  const trigger = regionalRow(tab, id).getByRole('button', {
    name: 'Layer actions for ' + item.name,
    exact: true,
  })
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()
  const option = window.getByRole('menuitem', { name: label, exact: true })
  await expect(option).toBeVisible()
  if (activate) {
    await expect(option).toHaveAttribute('aria-disabled', 'false')
    await option.click()
    await expect(window.getByRole('menuitem')).toHaveCount(0)
  }
  return option
}

const sealed = (tab, channel, ...args) => [
  { channel: ipcChannels.projects.sealPromptHistory, args: [tab.id, null] },
  { channel, args: [tab.id, ...args] },
]
async function historyUi(action, expectedDocument) {
  assert.ok(expectedDocument, 'History requires an independently expected full document')
  const before = await witness()
  await expect(window.getByRole('menuitem')).toHaveCount(0)
  await window.getByRole('button', { name: 'Edit menu', exact: true }).click()
  await window
    .getByText(action === 'undo' ? 'Undo · Ctrl+Z' : 'Redo · Ctrl+Shift+Z / Ctrl+Y', {
      exact: true,
    })
    .click()
  await expect(window.getByRole('menuitem')).toHaveCount(0)
  await idle()
  const after = await witness()
  mutationDelta(
    before,
    after,
    sealed(before.tab, ipcChannels.projects[action]),
    'Intentional ' + action,
  )
  assert.deepEqual(content(after.liveDocument), content(expectedDocument))
  expectedLiveDocument = clone(after.liveDocument)
  assertNeighbors(after)
  assert.equal(after.packageSha256, before.packageSha256, 'History cannot Save')
  assert.deepEqual(after.sql, before.sql)
  assertAuthoringFiles(before, after, 'History files')
  return after
}
const content = (document) => {
  const value = structuredClone(document)
  delete value.documentRevision
  return value
}

async function blockedGeneration(smart) {
  const target = smart ? fixture.patches[0] : fixture.raster
  await selectEntity(target.id)
  const before = await witness()
  await expect(button('Generate')).toBeDisabled()
  await expect(view().locator('.generation-blocking-reason')).toHaveText(regionalReason, {
    useInnerText: true,
  })
  // Inspect actual disabled UI; no synthetic click/force option is used.
  await unchanged(before, 'Actual ' + (smart ? 'Smart' : 'ordinary') + ' disabled Generate')
  const tab = await current()
  const request = smart
    ? { ...documentOwner(tab), iterations: 1, kind: 'smart-patch', layerId: target.id }
    : { documentId: tab.documentId, iterations: 1 }
  await refused(
    smart ? 'generateSmartPatch' : 'generate',
    [tab.id, request],
    regionalCode,
    (smart ? 'Smart' : 'Ordinary') + ' regional Main guard',
    smart ? ipcChannels.projects.generateSmartPatch : ipcChannels.projects.generate,
    regionalReason,
  )
  assertNeighbors(await witness())
}

async function setNativeSize(width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0].setSize(...size)
    },
    [width, height],
  )
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
  assert.deepEqual(native.minimumSize, [900, 620])
  assert.equal(native.visible, true)
  await expect
    .poll(() => window.evaluate(() => [innerWidth, innerHeight]))
    .toEqual(native.contentSize)
  native.canvasSettlement = await window.evaluate(async () => {
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
      if (stableFrames >= 3) return { frames: frame + 1, final: sample }
      previous = current
    }
    throw new Error('Native Canvas ResizeObserver did not settle')
  })
  report.viewportChecks.push({ requested: [width, height], ...native })
  checkpoint()
}
async function screenshot(name) {
  await window.evaluate(() => document.fonts.ready.then(() => undefined))
  await frames()
  await window.mouse.move(0, 0)
  const file = path.join(evidenceRoot, name + '.png')
  await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push(file)
  report.snapshots.push({
    path: file,
    bytes: lstatSync(file).size,
    sha256: digest(readFileSync(file)),
  })
  checkpoint()
}

async function exactPngs(loaded) {
  for (const input of fixture.inputs)
    assert.ok(
      (await loaded.readMember(input.member)).equals(input.bytes),
      'Full original PNG changed: ' + input.member,
    )
  const regionalAssets = (loaded.project.regionalGuidance ?? []).flatMap(({ mask }) =>
    mask.asset ? [mask.asset] : [],
  )
  for (const item of loaded.project.regionalGuidance ?? []) {
    if (!item.mask.asset) continue
    const bytes = await loaded.readMember(item.mask.asset.path)
    validateMaskBytes(item.mask, bytes)
    const original = report.productObjects[item.mask.asset.sha256]
    assert.ok(original, 'Every published regional PNG must have retained original bytes')
    assert.ok(readFileSync(original.path).equals(bytes))
  }
  assert.deepEqual(
    loaded.manifest.members
      .filter(({ path: member }) => member.startsWith('assets/'))
      .map(({ path: member }) => member)
      .sort(),
    [
      ...fixture.inputs.map(({ member }) => member),
      ...regionalAssets.map(({ path: member }) => member),
    ].sort(),
    'Exact original plus regional asset inventory; no fabricated Raster, mask or other package members',
  )
}
async function cleanCloseProject(label) {
  const before = await witness()
  assert.equal(before.tab.dirty, false, 'Clean close cannot hide a discard')
  assertProtectedSql(before.sql, label + ': before clean close')
  assert.deepEqual(before.liveDocument, before.savedDocument)
  const closeNumber = (report.closeActions?.length ?? 0) + 1
  const cleanManifestMember = path.join('autosave', fixture.key, 'manifest.json')
  let cleanManifest = null
  if (Object.hasOwn(before.files, cleanManifestMember)) {
    const file = path.join(appDataRoot, cleanManifestMember)
    const bytes = readFileSync(file)
    assert.equal(digest(bytes), before.files[cleanManifestMember])
    const manifest = JSON.parse(bytes)
    assert.deepEqual(manifest, {
      documentRevision: latestSaved.project.documentRevision,
      localProjectKey: fixture.key,
      shadowVersion: 1,
      state: 'clean',
    })
    cleanManifest = {
      manifest,
      retained: retain(file, 'close-witness/' + closeNumber + '-prior-clean-manifest.json'),
    }
  }
  const invocationOffset = (await calls()).length
  await window.getByRole('button', { name: 'Close ' + projectTitle, exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveCount(0)
  await expect(window.getByRole('dialog', { name: 'Close Project', exact: true })).toHaveCount(0)
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const refresh = window.getByRole('button', { name: 'Refresh projects', exact: true })
  const open = window.getByRole('button', { name: 'Open ' + projectTitle, exact: true })
  await expect(window.locator('.home-view')).toBeVisible()
  // removeTab renders Home before closeProjectTab's awaited refreshProjects finishes. Home's
  // Open stays disabled until requestClose finally clears busy, after list adoption/loading.
  await expect(open).toBeEnabled()
  await expect(open).not.toHaveClass(/\bn-button--loading\b/)
  await expect(refresh).toBeEnabled()
  await expect(refresh).not.toHaveClass(/\bn-button--loading\b/)
  await drainObserver()
  const invocations = (await calls()).slice(invocationOffset)
  const closeCall = invocations.find((call) => call.channel === ipcChannels.projects.close)
  assert.ok(closeCall)
  assert.ok(
    invocations.some(
      (call) =>
        call.channel === ipcChannels.projects.list &&
        call.id > closeCall.id &&
        call.finished &&
        call.delivered &&
        call.ok === true &&
        call.originalCalls === 1,
    ),
    'Clean close must finish its real Home refresh/list and adopt the nonbusy Home UI',
  )
  // Keep diagnostic-looking Opens visible inside this actual close window too. No helper in
  // this window issues one; an unexpected UI Open or extra seal must fail the exact sequence.
  const delta = invocations.filter(
    ({ channel }) => channel === ipcChannels.projects.open || !readChannels.has(channel),
  )
  assert.deepEqual(
    delta.map(({ channel, args, ok, finished, delivered }) => ({
      channel,
      args,
      ok,
      finished,
      delivered,
    })),
    [
      {
        channel: ipcChannels.projects.sealPromptHistory,
        args: [before.tab.id, null],
        ok: true,
        finished: true,
        delivered: true,
      },
      {
        channel: ipcChannels.projects.close,
        args: [before.tab.id, false],
        ok: true,
        finished: true,
        delivered: true,
      },
    ],
    label + ': exact close navigation calls',
  )
  const loaded = await readIgsPackage(fixture.path)
  const after = {
    sql: sqlState(),
    files: dataHashes(),
    packageSha256: digest(readFileSync(fixture.path)),
    savedDocument: loaded.project,
    manifest: loaded.manifest,
  }
  const record = {
    label,
    before,
    after,
    delta,
    invocations,
    cleanManifest,
    verifiedPackage: {
      key: fixture.key,
      path: fixture.path,
      documentId: latestSaved.project.documentId,
      documentRevision: latestSaved.project.documentRevision,
      sha256: latestSaved.sha256,
    },
    terminalHomeAdopted: true,
    passed: false,
  }
  ;(report.closeActions ??= []).push(record)
  report.expectedActions.push({ label, before, after, delta })
  checkpoint()
  assert.equal(after.packageSha256, before.packageSha256, label + ': clean close cannot Save')
  assert.equal(after.packageSha256, latestSaved.sha256)
  assert.deepEqual(after.savedDocument, before.savedDocument)
  assert.deepEqual(after.savedDocument, latestSaved.project)
  const expectedFiles = clone(before.files)
  record.fileAllowances = []
  if (cleanManifest && !Object.hasOwn(after.files, cleanManifestMember)) {
    // Coordinator.close -> writeCurrent may discard this already-saved clean marker. No dirty
    // shadow, snapshot, image, package or arbitrary autosave-tree exclusion is permitted.
    delete expectedFiles[cleanManifestMember]
    record.fileAllowances.push({
      member: cleanManifestMember,
      before: before.files[cleanManifestMember],
      after: null,
      reason: 'Verified saved-revision clean marker disposed by explicit clean close',
    })
  }
  for (const [name, sha256] of Object.entries(before.files)) {
    if (
      Object.hasOwn(after.files, name) ||
      !/^scratch\/igs-(?:pending|save-base)-[A-Za-z0-9]+\/\d+\.asset$/.test(name)
    )
      continue
    assert.ok(
      fixture.inputs.some(({ bytes }) => digest(bytes) === sha256) ||
        report.masks.some(({ retained }) => retained.sha256 === sha256),
      'Close may release only retained verified Project history staging PNGs',
    )
    assert.ok(report.productObjects[sha256])
    delete expectedFiles[name]
    record.fileAllowances.push({
      member: name,
      before: sha256,
      after: null,
      reason: 'Explicit clean close releases verified Project-owned immutable history staging',
    })
  }
  assert.deepEqual(
    after.files,
    expectedFiles,
    label + ': clean close changed protected product bytes',
  )
  await exactPngs(loaded)
  // Only now promote expectedSql. The helper retains the complete raw before/after schema and
  // every table/column, permitting only this verified package owner's indexed_at refresh.
  assertSqlTransition(before.sql, after.sql, label + ': terminal close-owned Home refresh', [
    'indexed_at',
  ])
  record.passed = true
  retainJson('close-witness/' + report.closeActions.length + '.json', record)
  checkpoint()
  return record
}
async function reopenSaved(label) {
  const reopened = await openProject(label + '-exact-open')
  assert.equal(reopened.tab.dirty, false)
  assert.equal(reopened.tab.canUndo, false)
  assert.equal(reopened.tab.canRedo, false)
  assert.deepEqual(reopened.liveDocument, latestSaved.project)
  assert.equal(reopened.packageSha256, latestSaved.sha256)
  await exactPngs(await readIgsPackage(fixture.path))
  assertNeighbors(reopened)
  await snapshot(label)
}
async function cleanLegacySaveAndReopen() {
  const original = await witness()
  assert.equal(Object.hasOwn(original.liveDocument, 'regionalGuidance'), false)
  await saveUi('01-clean-legacy-noop', { meaningful: false })
  await cleanCloseProject('Clean legacy Save authorized close')
  await reopenSaved('01-clean-legacy-noop-reopened')
  const reopened = await witness()
  assert.deepEqual(
    reopened.liveDocument,
    original.liveDocument,
    'Clean Save/read/reopen must preserve the complete legacy document',
  )
  assert.equal(Object.hasOwn(reopened.liveDocument, 'regionalGuidance'), false)
  assert.equal(reopened.tab.dirty, false)
  assert.equal(reopened.tab.canUndo, false)
  assert.equal(reopened.tab.canRedo, false)
  assertNeighbors(reopened)
  report.cleanLegacySave.reopened = reopened
  report.cleanLegacySave.exactLegacyDocumentAndHistoryPreserved = true
  checkpoint()
}

function verifyRetainedBytes() {
  for (const item of report.snapshots) {
    assert.ok(lstatSync(item.path).isFile() && !lstatSync(item.path).isSymbolicLink())
    const bytes = readFileSync(item.path)
    assert.equal(bytes.length, item.bytes)
    assert.equal(digest(bytes), item.sha256)
  }
  for (const input of fixture.inputs)
    assert.ok(
      readFileSync(input.retained).equals(input.bytes),
      'Retain full source PNG, not only hash',
    )
  for (const entry of report.databaseCheckpoints) {
    const database = new Database(entry.path, { readonly: true, fileMustExist: true })
    try {
      assert.deepEqual(database.prepare('PRAGMA integrity_check').all(), [
        { integrity_check: 'ok' },
      ])
      assert.deepEqual(databaseState(database), entry.state)
    } finally {
      database.close()
    }
  }
}

async function saveUi(label, { meaningful = true } = {}) {
  await neutral('Blur before explicit Save')
  const before = await witness()
  assertNeighbors(before)
  const save = button('Save Project')
  await expect(save).toBeEnabled()
  await save.click()
  await expect.poll(async () => (await current()).dirty).toBe(false)
  await idle()
  await expect(view().locator('.document-state')).toHaveText('Saved')
  const loaded = await readIgsPackage(fixture.path)
  assert.deepEqual(
    loaded.project,
    before.liveDocument,
    'Actual loader must read the complete acknowledged document',
  )
  const sha256 = digest(readFileSync(fixture.path))
  if (meaningful) assert.notEqual(sha256, before.packageSha256)
  await exactPngs(loaded)
  retainProductFiles()
  const after = await witness()
  checkedDelta(before, after, label + ' exact Save/seals', {
    writes: [{ channel: ipcChannels.projects.save, args: [before.tab.id] }],
    maxSeals: 1,
  })
  assert.deepEqual(after.liveDocument, before.liveDocument)
  assert.equal(after.tab.canUndo, before.tab.canUndo)
  assert.equal(after.tab.canRedo, before.tab.canRedo)
  assertSaveSql(before, after, loaded, sha256, label)
  assertAuthoringFiles(before, after, label, { save: true })
  latestSaved = { project: loaded.project, sha256 }
  assertNeighbors(after)
  if (!meaningful && !Object.hasOwn(before.liveDocument, 'regionalGuidance')) {
    assert.equal(Object.hasOwn(loaded.project, 'regionalGuidance'), false)
    assert.equal(after.tab.canUndo, false)
    assert.equal(after.tab.canRedo, false)
    report.cleanLegacySave = {
      before,
      after,
      semanticNoOp: true,
      packageBytesMayBeRewrittenByExplicitSave: true,
    }
  }
  report.witnesses.push({ label, before, after, actualLoaderProject: loaded.project })
  checkpoint()
  return loaded
}
function collectSourceFiles() {
  const directories = ['src', 'scripts', 'docs/prototype-app/src', 'worker-python/src']
  const topLevel = readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        (/\.(?:json|[cm]?[jt]s|ya?ml|toml)$/.test(entry.name) ||
          ['AGENTS.md', '.npmrc', '.prettierignore'].includes(entry.name)),
    )
    .map((entry) => path.join(root, entry.name))
  const docs = [
    'docs/engineering/artifact-lifecycle.md',
    'docs/engineering/research-protocol.md',
    'docs/engineering/review-protocol.md',
    'docs/engineering/ui-component-contracts.md',
    'docs/engineering/phase-4-regional-guidance-foundation-research.md',
    'docs/engineering/phase-4-regional-guidance-prompts-research.md',
    'docs/features/project/generate-mode/regional-guidance.md',
    'docs/product-promises.md',
  ].map((file) => path.join(root, file))
  const adjacentConfigs = ['docs/prototype-app', 'worker-python'].flatMap((directory) =>
    readdirSync(path.join(root, directory), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(root, directory, entry.name)),
  )
  return [
    ...new Set([
      ...directories
        .flatMap((directory) => filesBelow(path.join(root, directory)))
        .filter((file) => !file.split(path.sep).includes('__pycache__') && !file.endsWith('.pyc')),
      ...topLevel,
      ...docs,
      ...adjacentConfigs,
    ]),
  ].sort()
}
async function captureSources() {
  sourceFiles = collectSourceFiles()
  bundleFiles = filesBelow(path.join(root, 'dist'))
  for (const required of [
    'dist/main/main.cjs',
    'dist/preload/preload.cjs',
    'dist/renderer/index.html',
  ])
    assert.ok(
      bundleFiles.includes(path.join(root, required)),
      'Root must supply a fresh complete build',
    )
  report.candidateScript = { path: candidateFile, sha256: digest(readFileSync(candidateFile)) }
  report.sourceSha256 = hashes(sourceFiles)
  report.bundleSha256 = hashes(bundleFiles)
  const revision = await nativeExec('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    timeout: 5000,
    maxBuffer: 4096,
  })
  const dirty = await nativeExec('git', ['status', '--porcelain=v1'], {
    cwd: root,
    timeout: 5000,
    maxBuffer: 128 * 1024,
  })
  const literalImports = {}
  for (const file of sourceFiles.filter((file) => /\.(?:[cm]?[jt]sx?|vue)$/.test(file))) {
    const specifiers = [
      ...readFileSync(file, 'utf8').matchAll(
        /\b(?:from\s*|import\s*\(\s*|import\s*|require\s*\(\s*)['"]([^'"]+)['"]/g,
      ),
    ].map((match) => match[1])
    if (specifiers.length)
      literalImports[path.relative(root, file)] = [...new Set(specifiers)].sort()
  }
  retainJson('source-build-script-version-maps.json', {
    head: revision.stdout.trim(),
    dirtyWorkingTree: dirty.stdout,
    node: process.version,
    processVersions: process.versions,
    adapter,
    candidateScript: report.candidateScript,
    source: report.sourceSha256,
    build: report.bundleSha256,
    literalImports,
    dependencyBoundary:
      'Literal source import/require inventory plus complete local source/build bytes and package/lock/config files; package versions recorded separately. No worker/bytecode executes in this offline flow.',
    buildFreshness:
      'Root supplies fresh build. Frozen before/after complete source/config/helper and dist membership/bytes are retained; the author did not build or execute this harness.',
    sourceExclusions: ['Ignored __pycache__ and .pyc: offline app flow executes no worker payload'],
    compactEvidenceAimBytes: 300 * 1024 * 1024,
    unitOwned: [
      'strict malformed/private request matrices',
      'UTF8 and aggregate document limits',
      'Main async ABA and controlled failure atomicity',
      'installed embedding verification/completion',
      'successful queue admission and frozen Retry',
    ],
  })
  for (const file of sourceFiles) {
    withinDeadline()
    retain(file, 'exact-source/' + path.relative(root, file))
  }
  for (const file of bundleFiles) {
    withinDeadline()
    const source = path.relative(root, file)
    const retained = retain(file, 'exact-build/' + source)
    report.retainedBuildFiles.push({
      source,
      path: retained,
      sha256: digest(readFileSync(retained)),
    })
  }
  assert.deepEqual(collectSourceFiles(), sourceFiles)
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256)
  assert.deepEqual(filesBelow(path.join(root, 'dist')), bundleFiles)
  assert.deepEqual(hashes(bundleFiles), report.bundleSha256)
  checkpoint()
}
function verifyRetainedBuild() {
  for (const file of sourceFiles) {
    const kept = path.join(evidenceRoot, 'exact-source', path.relative(root, file))
    assert.ok(
      readFileSync(kept).equals(readFileSync(file)),
      'Complete retained source changed: ' + file,
    )
  }
  assert.deepEqual(
    report.retainedBuildFiles.map(({ source }) => source).sort(),
    Object.keys(report.bundleSha256).sort(),
  )
  for (const entry of report.retainedBuildFiles) {
    assert.equal(digest(readFileSync(entry.path)), report.bundleSha256[entry.source])
    assert.ok(
      readFileSync(entry.path).equals(readFileSync(path.join(root, entry.source))),
      'Complete retained dist member changed: ' + entry.source,
    )
  }
}
async function finish() {
  await neutral()
  await snapshot('12-final-open-before-last-ui')
  const finalClose = await cleanCloseProject('Final clean Project close')
  report.shutdownBefore = { sql: finalClose.after.sql, saved: latestSaved, close: finalClose }
  await restoreObserver()
  await closeNative('final-healthy-masks-close')
  // Independent first post-exit DB backup, before any document/PNG/source assertion can fail.
  const finalDatabase = await retainDatabase('12-final-after-last-ui-and-physical-exit', true)
  report.finalDatabaseAfterLastUiAndPhysicalExit = true
  checkpoint()
  assertSqlTransition(
    finalClose.after.sql,
    finalDatabase.state,
    'Final shutdown after verified close-owned Home refresh',
    ['indexed_at'],
  )
  assertProtectedSql(finalDatabase.state, 'Final complete protected SQL')
  assert.deepEqual(sqlState(), finalDatabase.state)
  await snapshot('12-final-product-bytes', { closed: true, afterNativeExit: true })
  assert.deepEqual(
    dataHashes(),
    finalClose.after.files,
    'Healthy physical exit preserves all final protected product files',
  )
  assert.equal(digest(readFileSync(fixture.path)), latestSaved.sha256)
  const loaded = await readIgsPackage(fixture.path)
  assert.deepEqual(loaded.project, latestSaved.project)
  assert.deepEqual(expectedCanvasNegative, fixture.saved.generationDraft.negativePrompt)
  assert.deepEqual(content(loaded.project), content(expectedLiveDocument))
  assert.deepEqual(
    withoutRegions(loaded.project),
    withoutRegions(fixture.saved),
    'Final full original neighbors/provenance/seed remain exact',
  )
  await exactPngs(loaded)
  verifyRetainedBytes()
  verifyRetainedBuild()
  assert.deepEqual(collectSourceFiles(), sourceFiles)
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256)
  assert.deepEqual(filesBelow(path.join(root, 'dist')), bundleFiles)
  assert.deepEqual(hashes(bundleFiles), report.bundleSha256)
  assert.equal(digest(readFileSync(candidateFile)), report.candidateScript.sha256)
  assert.equal(allExited(), true)
  assert.equal(report.nativeClosures.length, 2)
  assert.deepEqual(
    report.nativeClosures.map(({ kind }) => kind),
    ['intentional-dirty-crash', 'healthy'],
  )
  assert.equal(report.nativeClosures[1].code, 0)
  assert.equal(report.observerRestorations.length, 2)
  assert.equal(observerInstalled, false)
  assert.equal(promptGateArmed, false)
  assert.ok(
    report.ipcCalls
      .flatMap(({ calls: entries }) => entries)
      .every(({ originalCalls }) => originalCalls === 1),
  )
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.samplerError, undefined)
  report.finalProtectedStateCompared = true
  report.finalPackageComparedToLatestSaved = true
  checkpoint()
}
async function diagnostics() {
  if (window && !window.isClosed()) {
    for (const [name, operation] of [
      ['failure-aria.json', () => window.locator('body').ariaSnapshot({ timeout: 2000 })],
      ['failure-html.json', () => window.content()],
    ]) {
      try {
        retainJson(name, { content: await bounded(operation(), 3000, name) })
      } catch (error) {
        ;(report.diagnosticErrors ??= []).push({ name, message: String(error) })
      }
    }
    try {
      await bounded(screenshot('failure-before-exit'), 3000, 'failure screenshot')
    } catch (error) {
      report.failureScreenshotError = String(error)
    }
    try {
      // Failure-only capture: this does not satisfy any frame, geometry or qualification assertion.
      const bytes = await bounded(
        application.evaluate(async ({ BrowserWindow }) => {
          const windows = BrowserWindow.getAllWindows()
          if (windows.length !== 1) throw new Error('Expected one owned native window')
          const image = await windows[0].webContents.capturePage(undefined, {
            stayHidden: true,
            stayAwake: true,
          })
          return image.toPNG().toString('base64')
        }),
        3000,
        'Independent failure native capture',
      )
      const file = path.join(evidenceRoot, 'failure-independent-native.png')
      writeFileSync(file, Buffer.from(bytes, 'base64'), { flag: 'wx' })
      report.snapshots.push({
        path: file,
        bytes: lstatSync(file).size,
        sha256: digest(readFileSync(file)),
      })
      report.failureIndependentNativeCapture = file
    } catch (error) {
      report.failureIndependentNativeCaptureError = String(error)
    }
  }
}

// The adapter above is the complete public label/channel contract. Everything below uses
// genuine native input or a clearly named public-preload refusal/control probe.
function storedRegions(regions) {
  return regions?.map(({ maskImageUrl: _url, ...stored }) => stored)
}
function assertStoredMask(mask) {
  assert.match(mask.id, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i)
  assert.ok(Number.isSafeInteger(mask.revision) && mask.revision >= 0)
  if (mask.asset === null) {
    assert.deepEqual(Object.keys(mask).sort(), ['asset', 'id', 'revision'])
    return
  }
  assert.deepEqual(Object.keys(mask).sort(), ['asset', 'bounds', 'id', 'revision'])
  assert.ok(mask.revision > 0)
  assert.deepEqual(Object.keys(mask.asset).sort(), ['bytes', 'height', 'path', 'sha256', 'width'])
  assert.equal(mask.asset.path, `assets/masks/${mask.id}/${mask.asset.sha256}.png`)
  assert.deepEqual([mask.asset.width, mask.asset.height], [mask.bounds.width, mask.bounds.height])
  assert.ok(mask.asset.width <= 4096 && mask.asset.height <= 4096)
  assert.ok(mask.asset.width * mask.asset.height <= 4_000_000)
  assert.ok(mask.asset.bytes > 0 && mask.asset.bytes <= 32 * 1024 * 1024)
}
function assertRegionalViews(tab) {
  for (const item of tab.regionalGuidance ?? []) {
    assertStoredMask(item.mask)
    if (!item.mask.asset) {
      assert.ok(!Object.hasOwn(item, 'maskImageUrl') || item.maskImageUrl === null)
      continue
    }
    const url = new URL(item.maskImageUrl)
    assert.equal(url.protocol, 'igs-mask:')
    assert.equal(url.hostname, 'regional')
    assert.equal(url.search + url.hash, '')
    assert.equal(url.username + url.password + url.port, '')
    assert.deepEqual(url.pathname.split('/').slice(1, -1), [
      tab.id,
      tab.documentRevision,
      item.id,
      item.mask.id,
      String(item.mask.revision),
      item.mask.asset.sha256,
    ])
    assert.match(url.pathname.split('/').at(-1), /^[a-f0-9]{64}\.png$/)
  }
}
function keepObject(bytes, origin) {
  const sha256 = digest(bytes)
  const previous = report.productObjects[sha256]
  if (previous) {
    assert.equal(previous.bytes, bytes.length)
    assert.ok(readFileSync(previous.path).equals(bytes))
    return previous
  }
  const file = path.join(evidenceRoot, 'objects', sha256)
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 })
  assert.ok(readFileSync(file).equals(bytes))
  const entry = { path: file, bytes: bytes.length, sha256, firstOrigin: origin }
  report.productObjects[sha256] = entry
  report.snapshots.push(entry)
  return entry
}
function retainProductFiles() {
  // Each witness retains exact historical bytes before any later Save/shadow replacement.
  // Content addressing avoids copying unchanged packages/PNGs into every witness.
  const files = dataFiles()
  const result = {}
  for (const file of files) {
    const bytes = readFileSync(file)
    const entry = keepObject(bytes, path.relative(appDataRoot, file))
    result[path.relative(appDataRoot, file)] = entry.sha256
  }
  assert.deepEqual(dataFiles(), files, 'Product file membership changed during retention')
  assert.deepEqual(dataHashes(), result, 'Product bytes changed during retention')
  return result
}
function assetRefs(document) {
  const members = document.layers.flatMap((layer) =>
    layer.kind === 'smart-patch'
      ? [
          ...layer.rasterSubLayers.map(({ asset }) => asset),
          ...(layer.mask.asset ? [layer.mask.asset] : []),
        ]
      : [layer.asset, ...(layer.sourceIccProfile ? [layer.sourceIccProfile] : [])],
  )
  members.push(
    ...(document.regionalGuidance ?? []).flatMap(({ mask }) => (mask.asset ? [mask.asset] : [])),
  )
  return [...new Map(members.map((member) => [member.path, member])).values()]
}
function assertOwnedShadowFiles(value) {
  const prefix = `autosave/${fixture.key}/`
  const own = Object.fromEntries(
    Object.entries(value.files).filter(([name]) => name.startsWith(prefix)),
  )
  const manifestName = prefix + 'manifest.json'
  if (!Object.hasOwn(own, manifestName)) {
    assert.equal(value.tab.dirty, false, 'Dirty Project needs a published complete shadow')
    assert.deepEqual(own, {})
    return
  }
  const manifest = JSON.parse(readFileSync(report.productObjects[own[manifestName]].path, 'utf8'))
  assert.equal(manifest.localProjectKey, fixture.key)
  assert.equal(manifest.shadowVersion, 1)
  assert.equal(manifest.documentRevision, value.liveDocument.documentRevision)
  if (!value.tab.dirty) {
    assert.deepEqual(manifest, {
      documentRevision: value.savedDocument.documentRevision,
      localProjectKey: fixture.key,
      shadowVersion: 1,
      state: 'clean',
    })
    assert.deepEqual(Object.keys(own), [manifestName])
    return
  }
  assert.equal(manifest.state, 'dirty')
  assert.equal(manifest.documentId, value.liveDocument.documentId)
  assert.equal(manifest.baseDocumentRevision, value.savedDocument.documentRevision)
  assert.equal(
    Object.hasOwn(manifest, 'committingDocument'),
    false,
    'No Save is in flight at a witness',
  )
  const savedRefs = new Map(assetRefs(value.savedDocument).map((member) => [member.path, member]))
  const changed = assetRefs(value.liveDocument)
    .filter((member) => {
      const old = savedRefs.get(member.path)
      return (
        !old ||
        old.sha256 !== member.sha256 ||
        old.bytes !== member.bytes ||
        old.width !== member.width ||
        old.height !== member.height
      )
    })
    .map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }))
    .sort((a, b) => a.path.localeCompare(b.path))
  assert.deepEqual(
    manifest.dirtyAssets,
    changed,
    'Exact changed-asset plan includes regional and Smart owners',
  )
  assert.deepEqual(
    manifest.baseRequiredAssetPaths,
    changed.map(({ path }) => path),
  )
  const snapshotPrefix = prefix + 'snapshots/' + manifest.snapshotId + '/'
  const documentName = snapshotPrefix + 'project.json'
  assert.equal(own[documentName], manifest.documentHash)
  const documentBytes = readFileSync(report.productObjects[own[documentName]].path)
  assert.deepEqual(JSON.parse(documentBytes), value.liveDocument)
  assert.deepEqual(
    Object.keys(own).sort(),
    [manifestName, documentName, ...changed.map(({ path }) => snapshotPrefix + path)].sort(),
    'Exact current shadow tree: manifest, full document and only required original PNG bytes',
  )
  for (const member of changed) {
    assert.equal(own[snapshotPrefix + member.path], member.sha256)
    assert.equal(report.productObjects[member.sha256].bytes, member.bytes)
  }
}
function assertAuthoringFiles(before, after, label, { save = false } = {}) {
  const prefix = `autosave/${fixture.key}/`
  const packageName = path.relative(appDataRoot, fixture.path)
  const knownAssets = new Set([
    ...fixture.inputs.map(({ bytes }) => digest(bytes)),
    ...report.masks.map(({ retained }) => retained.sha256),
  ])
  const stagingAllowances = []
  const reviewedStaging = new Set()
  for (const name of new Set([...Object.keys(before.files), ...Object.keys(after.files)])) {
    if (!/^scratch\/igs-(?:pending|save-base)-[A-Za-z0-9]+\/\d+\.asset$/.test(name)) continue
    for (const state of [before, after]) {
      const sha256 = state.files[name]
      if (!sha256) continue
      assert.ok(
        knownAssets.has(sha256),
        label + ': staging bytes must be verified original/authored PNGs',
      )
      assert.ok(report.productObjects[sha256], label + ': staging PNG bytes are retained')
    }
    reviewedStaging.add(name)
    if (before.files[name] !== after.files[name])
      stagingAllowances.push({
        name,
        before: before.files[name] ?? null,
        after: after.files[name] ?? null,
        reason:
          'Exact immutable PNG in Project-owned history/Save-base staging; all bytes retained',
      })
  }
  const protectedFiles = (files) =>
    Object.fromEntries(
      Object.entries(files).filter(
        ([name]) =>
          !name.startsWith(prefix) && !reviewedStaging.has(name) && !(save && name === packageName),
      ),
    )
  assert.deepEqual(
    protectedFiles(after.files),
    protectedFiles(before.files),
    label + ': every other product file stays exact',
  )
  assertOwnedShadowFiles(after)
  ;(report.fileTransitions ??= []).push({
    label,
    stagingAllowances,
    beforeFiles: before.files,
    afterFiles: after.files,
    passed: true,
  })
}
const host = () => canvas().locator('.canvas-area')
const maskSettings = () =>
  view().getByRole('region', { name: 'Regional Guidance mask', exact: true })
const near = (actual, expected, label, epsilon = 0.000001) =>
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon,
    `${label}: expected ${expected}, got ${actual}`,
  )
async function cameraPose() {
  return host().evaluate((area) => {
    const rect = area.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      x: Number(area.dataset.cameraX),
      y: Number(area.dataset.cameraY),
      scale: Number(area.dataset.cameraScale),
    }
  })
}
async function worldPoint(point, reachable = true) {
  const pose = await cameraPose()
  assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.y) && pose.scale > 0)
  const screen = {
    x: pose.left + pose.x + point.x * pose.scale,
    y: pose.top + pose.y + point.y * pose.scale,
  }
  if (reachable)
    assert.ok(
      screen.x > pose.left + 36 &&
        screen.x < pose.left + pose.width - 36 &&
        screen.y > pose.top + 36 &&
        screen.y < pose.top + pose.height - 56,
      'Native fixture point must be reachable away from tool and viewport controls',
    )
  return screen
}
async function tool(label) {
  const control = canvas().getByRole('button', { name: label, exact: true })
  await expect(control).toBeEnabled()
  await control.click()
  await expect(control).toHaveAttribute('aria-pressed', 'true')
}
async function nativeDrag(from, to, steps = 4) {
  await window.mouse.move(from.x, from.y)
  await window.mouse.down()
  await window.mouse.move(to.x, to.y, { steps })
  await window.mouse.up()
  await frames()
}
async function establishCamera() {
  await neutral()
  const before = await witness()
  await canvas().getByLabel('Canvas zoom', { exact: true }).click()
  await window
    .locator('.n-base-select-option')
    .filter({ hasText: /^100%$/ })
    .click()
  await tool('Pan tool')
  const pose = await cameraPose()
  near(pose.scale, 1, 'Manual native 100% camera')
  const from = { x: pose.left + pose.width / 2, y: pose.top + pose.height / 2 }
  const to = { x: from.x + pose.width / 2 - 80 - pose.x, y: from.y + pose.height / 2 - 60 - pose.y }
  await nativeDrag(from, to)
  const after = await witness()
  mutationDelta(before, after, [], 'Actual zoom/pan owns no document IPC')
  assert.deepEqual({ ...after, ui: before.ui, mutations: [] }, { ...before, mutations: [] })
  report.pointerDiagnostics.push({
    label: 'Actual manual camera',
    before: before.ui.camera,
    after: after.ui.camera,
  })
}
async function setDiameter(value) {
  const input = maskSettings().getByRole('textbox', { name: adapter.diameter, exact: true })
  await input.fill(String(value))
  await input.press('Tab')
  await expect(input).toHaveValue(String(value))
}
async function setOperation(operation) {
  const before = await witness()
  await maskSettings().getByLabel(adapter.operation, { exact: true }).click()
  await window
    .locator('.n-base-select-option')
    .filter({
      hasText: operation === 'add' ? /^Add to mask$/ : /^Subtract from mask$/,
    })
    .click()
  await unchanged(before, 'Lasso operation is a local tool setting')
}
function decodedPng(bytes) {
  assert.ok(
    bytes.length < 1024 * 1024 &&
      bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  )
  let width,
    height,
    ended = false
  const blocks = []
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset)
    const tag = bytes.toString('ascii', offset + 4, offset + 8)
    const end = offset + length + 12
    assert.ok(end <= bytes.length)
    assert.equal(crc32(bytes.subarray(offset + 4, end - 4)), bytes.readUInt32BE(end - 4))
    const data = bytes.subarray(offset + 8, end - 4)
    if (tag === 'IHDR') {
      assert.equal(offset, 8)
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      assert.deepEqual([...data.subarray(8)], [8, 6, 0, 0, 0])
    } else if (tag === 'IDAT') blocks.push(data)
    else {
      assert.equal(tag, 'IEND', 'CPU-authored mask has only IHDR/IDAT/IEND')
      assert.equal(length, 0)
      assert.equal(end, bytes.length)
      ended = true
    }
    offset = end
  }
  assert.ok(ended && width > 0 && height > 0 && width * height < 100_000)
  const stride = width * 4
  const rows = inflateSync(Buffer.concat(blocks), { maxOutputLength: (stride + 1) * height })
  assert.equal(rows.length, (stride + 1) * height)
  const rgba = Buffer.alloc(stride * height)
  const paeth = (a, b, c) => {
    const p = a + b - c
    const distances = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
    return distances[0] <= distances[1] && distances[0] <= distances[2]
      ? a
      : distances[1] <= distances[2]
        ? b
        : c
  }
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (stride + 1)]
    assert.ok(filter <= 4)
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x
      const left = x < 4 ? 0 : rgba[index - 4]
      const up = y === 0 ? 0 : rgba[index - stride]
      const corner = y === 0 || x < 4 ? 0 : rgba[index - stride - 4]
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, corner)][filter]
      rgba[index] = (rows[y * (stride + 1) + 1 + x] + predictor) & 255
    }
  }
  const alpha = Buffer.alloc(width * height)
  for (let i = 0; i < alpha.length; i++) {
    assert.deepEqual([...rgba.subarray(i * 4, i * 4 + 3)], [255, 255, 255])
    alpha[i] = rgba[i * 4 + 3]
  }
  return { width, height, alpha }
}
function validateMaskBytes(mask, bytes) {
  assertStoredMask(mask)
  assert.ok(mask.asset)
  assert.equal(bytes.length, mask.asset.bytes)
  assert.equal(digest(bytes), mask.asset.sha256)
  const decoded = decodedPng(bytes)
  assert.deepEqual([decoded.width, decoded.height], [mask.bounds.width, mask.bounds.height])
  const { width, height, alpha } = decoded
  assert.ok(
    alpha.subarray(0, width).some(Boolean) &&
      alpha.subarray((height - 1) * width).some(Boolean) &&
      Array.from({ length: height }, (_, y) => alpha[y * width]).some(Boolean) &&
      Array.from({ length: height }, (_, y) => alpha[y * width + width - 1]).some(Boolean),
    'Stored mask has nonempty tight bounds',
  )
  return { ...decoded, bytes, bounds: clone(mask.bounds) }
}
async function maskPixels(tab, id, label, supplied = null) {
  assertRegionalViews(tab)
  const item = region(tab, id)
  assert.ok(item.mask.asset && item.maskImageUrl)
  const bytes =
    supplied ??
    Buffer.from(
      await window.evaluate(async (url) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error('Signed regional PNG refused: ' + response.status)
        return [...new Uint8Array(await response.arrayBuffer())]
      }, item.maskImageUrl),
    )
  const decoded = validateMaskBytes(item.mask, bytes)
  const chromium = await window.evaluate(async (encoded) => {
    const image = new Image()
    image.src = 'data:image/png;base64,' + encoded
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    return [...context.getImageData(0, 0, canvas.width, canvas.height).data].filter(
      (_, index) => index % 4 === 3,
    )
  }, bytes.toString('base64'))
  assert.ok(Buffer.from(chromium).equals(decoded.alpha), 'Independent Chromium alpha decoder')
  const retained = keepObject(bytes, label)
  report.masks.push({
    label,
    regionId: id,
    mask: item.mask,
    retained,
    alphaSha256: digest(decoded.alpha),
  })
  return decoded
}
const at = (image, x, y) =>
  x < image.bounds.x ||
  y < image.bounds.y ||
  x >= image.bounds.x + image.width ||
  y >= image.bounds.y + image.height
    ? 0
    : image.alpha[(y - image.bounds.y) * image.width + x - image.bounds.x]
function pixelsEqual(actual, expected, label) {
  assert.deepEqual(actual.bounds, expected.bounds, label + ' bounds')
  assert.ok(actual.alpha.equals(expected.alpha), label + ' whole alpha')
  assert.ok(actual.bytes.equals(expected.bytes), label + ' exact immutable PNG')
}
function exactAlpha(image, bounds, values, label) {
  assert.deepEqual(image.bounds, bounds, label + ' literal bounds')
  assert.ok(image.alpha.equals(Buffer.from(values)), label + ' complete literal alpha')
}
function maskRequest(tab, id, edit) {
  const item = region(tab, id)
  return { ...documentOwner(tab), maskId: item.mask.id, maskRevision: item.mask.revision, edit }
}
async function clearHistoryUi() {
  await neutral()
  const before = await witness()
  await button('Clear Project History').click()
  await window.getByRole('button', { name: 'Clear history', exact: true }).click()
  await idle()
  const after = await witness()
  mutationDelta(
    before,
    after,
    sealed(before.tab, ipcChannels.projects.clearHistory),
    'Explicit history clear, including its one document seal',
  )
  assert.deepEqual(after.liveDocument, before.liveDocument)
  assert.deepEqual(after.savedDocument, before.savedDocument)
  assert.equal(after.packageSha256, before.packageSha256)
  assert.deepEqual(after.sql, before.sql)
  assertAuthoringFiles(before, after, 'Explicit history clear')
  assert.equal(after.tab.canUndo, false)
  assert.equal(after.tab.canRedo, false)
  assertNeighbors(after)
}
async function verifyMaskAction(before, id, editPredicate, label, oracle, { noOp = false } = {}) {
  await idle()
  const after = await witness()
  const delta = mutationsSince(before.mutations, after.mutations)
  assert.equal(delta.length, 2, label + ': exactly one seal and one mask command')
  const editCall = delta[1]
  assert.equal(editCall.channel, adapter.channels.mask)
  assert.equal(editCall.args.length, 3)
  const request = editCall.args[2]
  assert.deepEqual(Object.keys(request).sort(), [
    'documentId',
    'documentRevision',
    'edit',
    'maskId',
    'maskRevision',
  ])
  assert.deepEqual({ ...request, edit: null }, { ...maskRequest(before.tab, id, null) })
  editPredicate(request.edit)
  mutationDelta(before, after, sealed(before.tab, adapter.channels.mask, id, request), label)
  assert.equal(editCall.originalCalls, 1)
  assert.deepEqual(callResponse(editCall), { ok: true, value: after.tab })
  let pixels = null
  if (region(after.tab, id).mask.asset) pixels = await maskPixels(after.tab, id, label)
  await oracle(pixels, after)
  if (noOp) {
    assert.deepEqual({ ...after, mutations: [] }, { ...before, mutations: [] })
  } else {
    const prior = region(before.tab, id).mask
    const next = pixels
      ? {
          asset: {
            bytes: pixels.bytes.length,
            width: pixels.width,
            height: pixels.height,
            path: `assets/masks/${prior.id}/${digest(pixels.bytes)}.png`,
            sha256: digest(pixels.bytes),
          },
          bounds: clone(pixels.bounds),
          id: prior.id,
          revision: prior.revision + 1,
        }
      : { asset: null, id: prior.id, revision: prior.revision + 1 }
    exactRegionalChange(
      before,
      after,
      (expected) => {
        expected.regionalGuidance.find((item) => item.id === id).mask = next
      },
      label,
    )
    assert.deepEqual(after.ui, before.ui, 'Mask editing preserves selection and camera')
  }
  report.maskActions.push({
    label,
    before,
    after,
    request,
    noOp,
    pixels: pixels
      ? { bounds: pixels.bounds, sha256: digest(pixels.bytes), alphaSha256: digest(pixels.alpha) }
      : null,
  })
  checkpoint()
  return { before, after, pixels }
}
async function gesture(id, label, points, oracle, diameter = 20, operation = 'add') {
  await selectEntity(id)
  await tool(label)
  await expect(host()).toHaveAttribute('data-mask-owner-kind', 'regional-guidance')
  await expect(host()).toHaveAttribute('data-mask-owner-id', id)
  await expect(host()).toHaveAttribute('data-mask-ready', 'true')
  const brush = label === adapter.brush || label === adapter.eraser
  if (brush) await setDiameter(diameter)
  const before = await witness()
  const screens = []
  for (const point of points) screens.push(await worldPoint(point))
  if (label === adapter.polygon) {
    for (const screen of screens) await window.mouse.click(screen.x, screen.y)
    await host().press('Enter')
  } else {
    await window.mouse.move(screens[0].x, screens[0].y)
    await window.mouse.down()
    for (const screen of screens.slice(1)) await window.mouse.move(screen.x, screen.y, { steps: 4 })
    await window.mouse.up()
  }
  const result = await verifyMaskAction(
    before,
    id,
    (edit) => {
      assert.equal(edit.kind, brush ? 'brush' : 'polygon')
      assert.equal(edit.operation, label === adapter.eraser ? 'subtract' : operation)
      if (brush) assert.equal(edit.diameter, diameter)
      assert.ok(edit.points.length >= points.length)
      for (const desired of points)
        assert.ok(
          edit.points.some(
            (point) =>
              Math.abs(point.x - desired.x) <= 0.000001 &&
              Math.abs(point.y - desired.y) <= 0.000001,
          ),
          'Actual pointer IPC must retain each literal intended world point',
        )
    },
    label + ' region ' + id,
    oracle,
  )
  return result
}
async function oneMaskHistory(result, id, label) {
  assert.equal(
    result.before.tab.canUndo,
    false,
    'Clear history establishes a counted one-entry baseline',
  )
  const undo = await historyUi('undo', result.before.liveDocument)
  assert.equal(undo.tab.canUndo, false, label + ': exactly one Undo entry')
  if (region(result.before.tab, id).mask.asset)
    pixelsEqual(
      await maskPixels(undo.tab, id, label + ' Undo'),
      await maskPixels(
        result.before.tab,
        id,
        label + ' retained input',
        readFileSync(report.productObjects[region(result.before.tab, id).mask.asset.sha256].path),
      ),
      label,
    )
  const redo = await historyUi('redo', result.after.liveDocument)
  assert.equal(redo.tab.canRedo, false)
  if (result.pixels)
    pixelsEqual(await maskPixels(redo.tab, id, label + ' Redo'), result.pixels, label)
  return redo
}
function declaredPolygonAlpha({ erased = false, lasso = false, subtract = false } = {}) {
  const width = lasso ? 120 : 60,
    height = 60
  const alpha = Buffer.alloc(width * height)
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      const x = column + 40,
        y = row + 40
      let value = x < 100 && (y < 80 || x < 80) ? 255 : 0
      if (erased && value) {
        // Analytic diameter20 disc at (70,70), independent of production raster/codec imports.
        const distance = Math.hypot(x + 0.5 - 70, y + 0.5 - 70)
        value = 255 - Math.round(255 * Math.max(0, Math.min(1, 10.5 - distance)))
      }
      if (lasso && x >= 120 && x < 160 && y < 80) value = 255
      if (subtract && x >= 130 && x < 150 && y >= 50 && y < 70) value = 0
      alpha[row * width + column] = value
    }
  return { bounds: { x: 40, y: 40, width, height }, alpha }
}
async function brushesAndEraser() {
  await selectEntity(regionA)
  await clearHistoryUi()
  const brush = await gesture(
    regionA,
    adapter.brush,
    [{ x: -4, y: 7 }],
    (pixels) =>
      exactAlpha(
        pixels,
        { x: -5, y: 6, width: 2, height: 2 },
        [75, 75, 75, 75],
        'Integer-corner diameter1 Brush',
      ),
    1,
  )
  firstBrushMaskUrl = region(brush.after.tab, regionA).maskImageUrl
  await oneMaskHistory(brush, regionA, 'One Brush')
  check(
    '02 Actual Brush owns literal negative-world 2x2 alpha75 PNG; exact captured owner and one whole Undo/Redo',
  )
  await clearHistoryUi()
  const erased = await gesture(
    regionA,
    adapter.eraser,
    [{ x: -4, y: 7 }],
    (pixels) =>
      exactAlpha(
        pixels,
        { x: -5, y: 6, width: 2, height: 2 },
        [53, 53, 53, 53],
        'Diameter1 Eraser over alpha75',
      ),
    1,
  )
  await oneMaskHistory(erased, regionA, 'One Eraser')
  check(
    '03 Actual Eraser yields complete alpha53 array; one exact PNG Undo/Redo; all neighbors and prompts preserved',
  )
}
async function lassosAndHole() {
  assert.equal(region(await current(), regionB).enabled, false)
  await selectEntity(regionB)
  await setOperation('add')
  await clearHistoryUi()
  const lShape = [
    { x: 40, y: 40 },
    { x: 100, y: 40 },
    { x: 100, y: 80 },
    { x: 80, y: 80 },
    { x: 80, y: 100 },
    { x: 40, y: 100 },
  ]
  const polygon = await gesture(regionB, adapter.polygon, lShape, (pixels) => {
    const expected = declaredPolygonAlpha()
    exactAlpha(pixels, expected.bounds, expected.alpha, 'Literal L-shaped Polygon')
  })
  await oneMaskHistory(polygon, regionB, 'Polygon')
  await clearHistoryUi()
  const erased = await gesture(regionB, adapter.eraser, [{ x: 70, y: 70 }], (pixels) => {
    const expected = declaredPolygonAlpha({ erased: true })
    exactAlpha(pixels, expected.bounds, expected.alpha, 'Analytical interior eraser hole')
    assert.equal(at(pixels, 70, 70), 0)
    assert.equal(at(pixels, 50, 50), 255)
  })
  await oneMaskHistory(erased, regionB, 'Interior Eraser')
  await clearHistoryUi()
  const lasso = await gesture(
    regionB,
    adapter.lasso,
    [
      { x: 120, y: 40 },
      { x: 160, y: 40 },
      { x: 160, y: 80 },
      { x: 120, y: 80 },
      { x: 120, y: 40 },
    ],
    (pixels) => {
      const expected = declaredPolygonAlpha({ erased: true, lasso: true })
      exactAlpha(pixels, expected.bounds, expected.alpha, 'Literal freehand Lasso rectangle')
    },
  )
  await oneMaskHistory(lasso, regionB, 'Freehand Lasso')
  await setOperation('subtract')
  await clearHistoryUi()
  const subtracted = await gesture(
    regionB,
    adapter.polygon,
    [
      { x: 130, y: 50 },
      { x: 150, y: 50 },
      { x: 150, y: 70 },
      { x: 130, y: 70 },
    ],
    (pixels) => {
      const expected = declaredPolygonAlpha({ erased: true, lasso: true, subtract: true })
      exactAlpha(pixels, expected.bounds, expected.alpha, 'Literal Polygon Subtract rectangle')
    },
    20,
    'subtract',
  )
  polygonPng = subtracted.pixels
  await oneMaskHistory(subtracted, regionB, 'Polygon Subtract')
  await setOperation('add')
  check(
    '04 Disabled B accepts actual Polygon, interior Eraser, freehand Lasso and Polygon Subtract; literal full alpha/bounds and one-entry history each',
  )
}
async function transformPose() {
  const pose = await host().evaluate((area) => {
    const content = area.querySelector('.konvajs-content')
    const rect = content.getBoundingClientRect()
    return {
      node: JSON.parse(area.dataset.maskTransformNode ?? 'null'),
      handles: JSON.parse(area.dataset.maskTransformHandles ?? 'null'),
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      clientWidth: content.clientWidth,
      clientHeight: content.clientHeight,
      x: Number(area.dataset.cameraX),
      y: Number(area.dataset.cameraY),
      scale: Number(area.dataset.cameraScale),
    }
  })
  assert.ok(pose.node && pose.handles && pose.clientWidth > 0 && pose.clientHeight > 0)
  return pose
}
function stageScreen(pose, point) {
  return {
    x: pose.left + (point.x * pose.width) / pose.clientWidth,
    y: pose.top + (point.y * pose.height) / pose.clientHeight,
  }
}
const transformWorldScreen = (pose, point) =>
  stageScreen(pose, { x: pose.x + point.x * pose.scale, y: pose.y + point.y * pose.scale })
async function beginTransform(id) {
  await selectEntity(id)
  await tool(adapter.transform)
  await expect(host()).toHaveAttribute('data-mask-transform-active', 'true')
  await expect(
    canvas().getByRole('button', { name: adapter.applyTransform, exact: true }),
  ).toBeVisible()
  await expect(
    canvas().getByRole('button', { name: 'Fit Patch BBox to Mask', exact: true }),
  ).toHaveCount(0)
  await expect(
    canvas().getByRole('button', { name: 'Bounding Box tool', exact: true }),
  ).toHaveCount(0)
  return transformPose()
}
async function commitTransform(id, before, oracle, action = 'button') {
  await unchanged(before, 'Transform pointerup remains preview-only')
  const pose = await transformPose()
  if (action === 'enter') await host().press('Enter')
  else await canvas().getByRole('button', { name: adapter.applyTransform, exact: true }).click()
  const result = await verifyMaskAction(
    before,
    id,
    (edit) => {
      assert.equal(edit.kind, 'transform')
      for (const name of ['x', 'y', 'scaleX', 'scaleY', 'rotationDegrees'])
        near(edit.transform[name], pose.node[name], 'Actual Transformer ' + name)
    },
    'Actual Transform Region Apply',
    oracle,
  )
  await expect(host()).toHaveAttribute('data-mask-transform-active', 'false')
  await oneMaskHistory(result, id, 'Transform Region')
  return result.pixels
}
async function transforms() {
  await selectEntity(regionB)
  await clearHistoryUi()
  let pose = await beginTransform(regionB)
  let before = await witness()
  let pixels = polygonPng
  await nativeDrag(
    transformWorldScreen(pose, { x: pose.node.x + 10, y: pose.node.y + 10 }),
    transformWorldScreen(pose, { x: pose.node.x + 26, y: pose.node.y + 2 }),
    8,
  )
  pixels = await commitTransform(regionB, before, (actual) => {
    assert.deepEqual(actual.bounds, { x: 56, y: 32, width: 120, height: 60 })
    assert.ok(
      actual.alpha.equals(pixels.alpha) && actual.bytes.equals(pixels.bytes),
      'Integer move preserves all bytes',
    )
  })
  await clearHistoryUi()
  pose = await beginTransform(regionB)
  before = await witness()
  await nativeDrag(
    stageScreen(pose, pose.handles['middle-right']),
    transformWorldScreen(pose, {
      x: pose.node.x + pose.node.width * 1.5,
      y: pose.node.y + pose.node.height / 2,
    }),
    8,
  )
  pixels = await commitTransform(
    regionB,
    before,
    (actual) => {
      assert.deepEqual(actual.bounds, { x: 56, y: 32, width: 180, height: 60 })
      for (const [x, y, value] of [
        [72, 42, 255],
        [102, 62, 0],
        [132, 82, 0],
        [207, 37, 255],
        [207, 52, 0],
        [162, 52, 0],
      ])
        assert.equal(at(actual, x, y), value, 'Analytical nonuniform-scale interior/exterior')
    },
    'enter',
  )
  await clearHistoryUi()
  pose = await beginTransform(regionB)
  before = await witness()
  const rotate = pose.handles.rotater
  const center = {
    x: pose.x + (pose.node.x + pose.node.width / 2) * pose.scale,
    y: pose.y + (pose.node.y + pose.node.height / 2) * pose.scale,
  }
  await nativeDrag(
    stageScreen(pose, rotate),
    stageScreen(pose, { x: center.x - (rotate.y - center.y), y: center.y + (rotate.x - center.x) }),
    8,
  )
  await screenshot('05-actual-quarterturn-preview')
  transformedPng = await commitTransform(regionB, before, (actual) => {
    assert.deepEqual(actual.bounds, { x: 116, y: -28, width: 60, height: 180 })
    const expected = Buffer.alloc(pixels.alpha.length)
    for (let row = 0; row < pixels.height; row++)
      for (let column = 0; column < pixels.width; column++)
        expected[column * pixels.height + pixels.height - 1 - row] =
          pixels.alpha[row * pixels.width + column]
    assert.ok(
      actual.alpha.equals(expected),
      'Every asymmetric quarter-turn alpha byte follows independent matrix transpose',
    )
  })
  check(
    '05 Actual Konva move/nonuniform-scale/quarter-turn preview and Apply; fixed bounds, full rotated alpha, one exact Undo/Redo each; no bbox/Fit',
  )
}
async function clearAndNoOps() {
  await selectEntity(regionA)
  await clearHistoryUi()
  const before = await witness()
  await maskSettings().getByRole('button', { name: adapter.clear, exact: true }).click()
  const cleared = await verifyMaskAction(
    before,
    regionA,
    (edit) => assert.deepEqual(edit, { kind: 'clear' }),
    'Actual Clear regional mask',
    (pixels) => assert.equal(pixels, null),
  )
  await expect(
    maskSettings().getByRole('button', { name: adapter.clear, exact: true }),
  ).toBeDisabled()
  await unchanged(await witness(), 'Disabled repeated Clear produces zero Main calls')
  const currentTab = await current()
  for (const edit of [
    { kind: 'clear' },
    { kind: 'brush', operation: 'subtract', diameter: 1, points: [{ x: -4, y: 7 }] },
  ]) {
    const state = await witness()
    const args = [currentTab.id, regionA, maskRequest(currentTab, regionA, edit)]
    const reply = await rawApi('editRegionalGuidanceMask', ...args)
    assert.deepEqual(reply, { ok: true, value: state.tab })
    await unchanged(state, 'Direct public empty mask no-op', [
      { channel: adapter.channels.mask, args },
    ])
  }
  await oneMaskHistory(cleared, regionA, 'Clear')
  // Leave A nonempty for duplicate/recovery. The counted Undo is an explicit action.
  await historyUi('undo', cleared.before.liveDocument)
  check(
    '06 Clear retains identity and increments once; repeated UI Clear disabled, direct empty Clear/Eraser no-op preserve history/files; Undo restores exact bytes',
  )
}
async function cancellation() {
  await selectEntity(regionA)
  await tool(adapter.brush)
  await setDiameter(20)
  let before = await witness()
  const start = await worldPoint({ x: 10, y: 100 })
  await window.mouse.move(start.x, start.y)
  await window.mouse.down()
  await window.mouse.move(start.x + 8, start.y + 4, { steps: 2 })
  await host().press('Escape')
  await window.mouse.up()
  await unchanged(before, 'Escape then terminal pointerup cancels without edit or history')
  await tool(adapter.polygon)
  before = await witness()
  for (const point of [
    { x: 10, y: 100 },
    { x: 30, y: 100 },
    { x: 30, y: 120 },
  ]) {
    const screen = await worldPoint(point)
    await window.mouse.click(screen.x, screen.y)
  }
  await selectEntity(regionB)
  const selected = await witness()
  assert.deepEqual(selected.liveDocument, before.liveDocument)
  await host().press('Enter')
  await unchanged(selected, 'Owner switch then terminal Enter cannot publish to either region')
  await beginTransform(regionB)
  before = await witness()
  let pose = await transformPose()
  await nativeDrag(
    transformWorldScreen(pose, { x: pose.node.x + 10, y: pose.node.y + 10 }),
    transformWorldScreen(pose, { x: pose.node.x + 18, y: pose.node.y + 2 }),
    3,
  )
  await host().press('Escape')
  await expect(host()).toHaveAttribute('data-mask-transform-active', 'false')
  await host().press('Enter')
  await unchanged(before, 'Transform Escape/terminal Enter cancels without publishing')
  await beginTransform(regionB)
  before = await witness()
  await canvas().getByRole('button', { name: adapter.cancelTransform, exact: true }).click()
  await expect(host()).toHaveAttribute('data-mask-transform-active', 'false')
  await unchanged(before, 'Transform explicit Cancel is document/history/IPC neutral')
  await beginTransform(regionB)
  before = await witness()
  pose = await cameraPose()
  await window.mouse.move(pose.left + pose.width / 2, pose.top + pose.height * 0.65)
  await window.mouse.wheel(0, 120)
  await expect.poll(async () => (await cameraPose()).scale).not.toBe(pose.scale)
  await expect(host()).toHaveAttribute('data-mask-transform-active', 'false')
  await host().press('Enter')
  const after = await witness()
  mutationDelta(
    before,
    after,
    [],
    'Actual wheel cancels Transform; terminal Enter publishes nothing',
  )
  assert.deepEqual({ ...after, ui: before.ui, mutations: [] }, { ...before, mutations: [] })
  await establishCamera()
  check(
    '07 Escape, owner change, explicit Transform Cancel and real wheel cancellation settle through terminal input with no mask publication',
  )
}
async function maskRefusal(id, request, code, label, reachesMain = true) {
  await neutral()
  const before = await witness()
  const args = [before.tab.id, id, request]
  const reply = await rawApi('editRegionalGuidanceMask', ...args)
  assert.equal(reply.ok, false)
  assert.equal(reply.error.code, code)
  const after = await unchanged(
    before,
    label,
    reachesMain ? [{ channel: adapter.channels.mask, args, ok: false }] : [],
  )
  if (reachesMain)
    assert.equal(mutationsSince(before.mutations, after.mutations)[0].originalCalls, 1)
  report.refusals.push({ label, reachesMain, args, reply, before, after })
}
async function fetchResource(url) {
  return window.evaluate(async (url) => {
    const response = await fetch(url)
    return {
      ok: response.ok,
      status: response.status,
      bytes: response.ok ? [...new Uint8Array(await response.arrayBuffer())] : null,
    }
  }, url)
}
async function refusalsAndResources() {
  await selectEntity(regionA)
  let tab = await current()
  const edit = { kind: 'brush', operation: 'add', diameter: 1, points: [{ x: -4, y: 7 }] }
  let request = maskRequest(tab, regionA, edit)
  for (const [label, change] of [
    ['foreign document', { documentId: randomUUID() }],
    ['stale document', { documentRevision: fixture.saved.documentRevision }],
    ['foreign mask', { maskId: region(tab, regionB).mask.id }],
    ['stale mask revision', { maskRevision: request.maskRevision + 1 }],
  ])
    await maskRefusal(regionA, { ...request, ...change }, 'EDIT_CONFLICT', label)
  for (const id of [randomUUID(), fixture.raster.id, fixture.patches[0].id])
    await maskRefusal(id, request, 'PROJECT_LAYER_NOT_FOUND', 'Missing/wrong-kind regional target')
  for (const malformed of [
    { ...request, edit: { kind: 'fit-bbox' } },
    { ...request, asset: { path: '/outside-owned/mask.png', pixels: [255] } },
    { ...request, edit: { ...edit, diameter: 0 } },
  ])
    await maskRefusal(
      regionA,
      malformed,
      'IPC_INVALID_CALLER',
      'Strict preload malformed/Fit refusal: zero Main calls',
      false,
    )
  await maskRefusal(
    regionA,
    {
      ...request,
      edit: {
        ...edit,
        points: [
          { x: 0, y: 0 },
          { x: 5000, y: 0 },
        ],
      },
    },
    'MASK_LIMIT',
    'Main CPU output-bound limit refuses before publication',
  )
  const oldRegional = region(tab, regionA).maskImageUrl
  const oldSmart = tab.layers.find((item) => item.id === fixture.patches[0].id).maskImageUrl
  await updateUi(regionA, { kind: 'lock', locked: true })
  tab = await current()
  request = maskRequest(tab, regionA, edit)
  for (const command of [
    edit,
    { kind: 'clear' },
    { kind: 'transform', transform: { x: -5, y: 6, scaleX: 1, scaleY: 1, rotationDegrees: 0 } },
  ])
    await maskRefusal(
      regionA,
      { ...request, edit: command },
      'PROJECT_LAYER_LOCKED',
      'Locked regional mask Main refusal',
    )
  for (const label of [
    adapter.brush,
    adapter.eraser,
    adapter.lasso,
    adapter.polygon,
    adapter.transform,
  ])
    await expect(canvas().getByRole('button', { name: label, exact: true })).toBeDisabled()
  await expect(canvas().getByRole('button', { name: 'Pan tool', exact: true })).toBeEnabled()
  await updateUi(regionA, { kind: 'lock', locked: false })
  tab = await current()
  const currentUrl = region(tab, regionA).maskImageUrl
  const state = await witness()
  const smart = tab.layers.find((item) => item.id === fixture.patches[0].id)
  const cases = [
    ['stale capability from actual Brush mask revision', firstBrushMaskUrl],
    ['stale regional capability', oldRegional],
    ['stale Smart capability', oldSmart],
    ['cross-region owner', currentUrl.replace(regionA, regionB)],
    [
      'cross-mask owner',
      currentUrl.replace(region(tab, regionA).mask.id, region(tab, regionB).mask.id),
    ],
    ['regional URL in Smart namespace', currentUrl.replace('://regional/', '://asset/')],
    ['Smart URL in regional namespace', smart.maskImageUrl.replace('://asset/', '://regional/')],
  ]
  for (const [label, url] of cases) {
    const response = await fetchResource(url)
    assert.equal(response.ok, false, label)
    assert.equal(response.status, 404)
    report.resourceChecks.push({ label, url, response })
  }
  for (const [label, url, sha256] of [
    ['current regional', currentUrl, region(tab, regionA).mask.asset.sha256],
    ['current Smart control', smart.maskImageUrl, smart.mask.asset.sha256],
  ]) {
    const response = await fetchResource(url)
    assert.equal(response.ok, true)
    const bytes = Buffer.from(response.bytes)
    assert.equal(digest(bytes), sha256)
    keepObject(bytes, label)
    report.resourceChecks.push({ label, url, status: response.status, sha256 })
  }
  await unchanged(state, 'All resource fetches preserve full document/history/SQL/files')
  check(
    '08 Original Main refuses locked/stale/foreign/missing/wrong-kind/limit; malformed/Fit preload refuses with zero Main; signed regional/Smart resources remain isolated',
  )
}
async function duplicateIndependent() {
  await selectEntity(regionB)
  await clearHistoryUi()
  const before = await witness()
  await menuItem(regionB, 'Duplicate region')
  await idle()
  const after = await witness()
  checkedDelta(before, after, 'Duplicate owned regional mask', {
    writes: [
      {
        channel: adapter.channels.duplicate,
        args: [before.tab.id, entityOwner(before.tab, regionB)],
      },
    ],
    maxSeals: 1,
  })
  const source = region(before.liveDocument, regionB)
  const copy = after.liveDocument.regionalGuidance.find(
    (item) => !before.liveDocument.regionalGuidance.some(({ id }) => id === item.id),
  )
  assert.ok(copy)
  duplicateRegion = copy.id
  assert.equal(ownedIds(before.liveDocument).includes(copy.id), false)
  assert.equal(ownedIds(before.liveDocument).includes(copy.mask.id), false)
  assert.notEqual(copy.id, copy.mask.id)
  assert.deepEqual(copy.mask.bounds, source.mask.bounds)
  assert.equal(copy.mask.revision, 1)
  const copiedPixels = await maskPixels(after.tab, copy.id, 'Fresh duplicate mask owner')
  pixelsEqual(copiedPixels, transformedPng, 'Duplicate copied exact immutable pixels')
  const expectedCopy = {
    ...clone(source),
    id: copy.id,
    name: source.name + ' copy',
    locked: false,
    mask: {
      ...clone(source.mask),
      id: copy.mask.id,
      revision: 1,
      asset: {
        ...clone(source.mask.asset),
        path: `assets/masks/${copy.mask.id}/${source.mask.asset.sha256}.png`,
      },
    },
  }
  exactRegionalChange(
    before,
    after,
    (expected) => {
      expected.regionalGuidance.splice(
        expected.regionalGuidance.findIndex(({ id }) => id === regionB) + 1,
        0,
        expectedCopy,
      )
    },
    'Duplicate changes only one inserted independently owned region',
  )
  await selectEntity(copy.id)
  const prior = await witness()
  await maskSettings().getByRole('button', { name: adapter.clear, exact: true }).click()
  const cleared = await verifyMaskAction(
    prior,
    copy.id,
    (edit) => assert.deepEqual(edit, { kind: 'clear' }),
    'Duplicate Clear cannot mutate its source',
    (pixels) => assert.equal(pixels, null),
  )
  pixelsEqual(
    await maskPixels(cleared.after.tab, regionB, 'Source after duplicate edit'),
    transformedPng,
    'Source retained',
  )
  await historyUi('undo', cleared.before.liveDocument)
  const deleteBefore = await witness()
  await menuItem(copy.id, 'Delete region')
  await idle()
  const deleted = await witness()
  checkedDelta(deleteBefore, deleted, 'Delete copied mask owner', {
    writes: [
      {
        channel: adapter.channels.delete,
        args: [deleteBefore.tab.id, entityOwner(deleteBefore.tab, copy.id)],
      },
    ],
    maxSeals: 1,
  })
  exactRegionalChange(
    deleteBefore,
    deleted,
    (expected) => {
      expected.regionalGuidance = expected.regionalGuidance.filter(({ id }) => id !== copy.id)
    },
    'Delete removes only its regional owner',
  )
  const restored = await historyUi('undo', deleteBefore.liveDocument)
  pixelsEqual(
    await maskPixels(restored.tab, copy.id, 'Deleted owner Undo'),
    copiedPixels,
    'Delete Undo restores exact owned PNG',
  )
  check(
    '09 Duplicate copies prompts/coverage under fresh entity/mask UUID and owner path; editing/deleting it preserves source and Undo retains PNG bytes',
  )
}
async function overlayAlpha(point) {
  const screen = await worldPoint(point)
  return host()
    .locator('.konva-stage')
    .evaluate((stage, screen) => {
      const canvases = [...stage.querySelectorAll('canvas')].filter(
        (item) => item.getBoundingClientRect().width > 0,
      )
      const canvas = canvases.at(-1)
      if (!canvas) throw new Error('Final isolated maskScene canvas unavailable')
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor(((screen.x - rect.left) * canvas.width) / rect.width)
      const y = Math.floor(((screen.y - rect.top) * canvas.height) / rect.height)
      return canvas.getContext('2d').getImageData(x, y, 1, 1).data[3]
    }, screen)
}
async function overlayAndLayout() {
  await selectEntity(regionB)
  await tool('Pan tool')
  await expect(maskSettings()).toBeVisible()
  const point = { x: 130, y: 0 }
  assert.equal(at(transformedPng, point.x, point.y), 255)
  await window.mouse.move(0, 0)
  await expect.poll(() => overlayAlpha(point)).toBe(128)
  const before = await witness()
  const input = view().getByRole('textbox', { name: adapter.regionOpacity, exact: true })
  await input.fill('25')
  await input.press('Tab')
  await idle()
  const after = await witness()
  checkedDelta(before, after, 'Disabled selected region overlay opacity', {
    writes: [
      {
        channel: adapter.channels.update,
        args: [
          before.tab.id,
          entityOwner(before.tab, regionB),
          { kind: 'overlay-opacity', overlayOpacity: 0.25 },
        ],
      },
    ],
    maxSeals: 1,
  })
  exactRegionalChange(
    before,
    after,
    (expected) => {
      expected.regionalGuidance.find(({ id }) => id === regionB).overlayOpacity = 0.25
    },
    'Display opacity changes no mask coverage or generation inclusion',
  )
  pixelsEqual(
    await maskPixels(after.tab, regionB, 'Opacity leaves PNG unchanged'),
    transformedPng,
    'Overlay opacity',
  )
  await window.mouse.move(0, 0)
  await expect.poll(() => overlayAlpha(point)).toBe(64)
  let state = await witness()
  await maskSettings().getByRole('button', { name: adapter.hideOverlay, exact: true }).click()
  await expect(
    maskSettings().getByRole('button', { name: adapter.showOverlay, exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => overlayAlpha(point)).toBe(0)
  await unchanged(state, 'Hide overlay is local display only')
  state = await witness()
  await maskSettings().getByRole('button', { name: adapter.showOverlay, exact: true }).click()
  await expect(
    maskSettings().getByRole('button', { name: adapter.hideOverlay, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => overlayAlpha(point)).toBe(64)
  await unchanged(state, 'Show disabled region overlay is local display only')
  await generationControls()
  await selectEntity(regionB)
  for (const [width, height] of [
    [1440, 900],
    [900, 620],
  ]) {
    await setNativeSize(width, height)
    await selectEntity(regionB)
    await layout(
      canvas().getByRole('toolbar', { name: 'Canvas tools', exact: true }),
      `Regional tool rail ${width}x${height}`,
      'icon',
    )
    await maskSettings().scrollIntoViewIfNeeded()
    await layout(maskSettings(), `Regional mask settings ${width}x${height}`)
    await expect(
      canvas().getByRole('button', { name: 'Bounding Box tool', exact: true }),
    ).toHaveCount(0)
    await expect(
      canvas().getByRole('button', { name: 'Fit Patch BBox to Mask', exact: true }),
    ).toHaveCount(0)
    await screenshot(`10-disabled-regional-mask-${width}x${height}`)
    await beginTransform(regionB)
    await layout(
      canvas().locator('.mask-transform-actions'),
      `Transform Apply/Cancel ${width}x${height}`,
    )
    await screenshot(`10-regional-transform-${width}x${height}`)
    const beforeCancel = await witness()
    await canvas().getByRole('button', { name: adapter.cancelTransform, exact: true }).click()
    await unchanged(beforeCancel, 'Viewport Transform Cancel preserves complete durable state')
  }
  await setNativeSize(1440, 900)
  await establishCamera()
  check(
    '10 Disabled selected overlay uses opacity alpha128->64 and local hide/show; generation guard/offline controls retained; actual 1440x900/900x620 UI/screenshots',
  )
}
async function generationControls() {
  await blockedGeneration(false)
  await blockedGeneration(true)
  for (const item of (await current()).regionalGuidance)
    if (item.enabled) await updateUi(item.id, { kind: 'enabled', enabled: false })
  for (const smart of [false, true]) {
    await selectEntity(smart ? fixture.patches[0].id : fixture.raster.id)
    const before = await witness()
    await expect(button('Generate')).toBeDisabled()
    await expect(view().locator('.generation-blocking-reason')).not.toHaveText(regionalReason, {
      useInnerText: true,
    })
    const request = smart
      ? {
          ...documentOwner(before.tab),
          iterations: 1,
          kind: 'smart-patch',
          layerId: fixture.patches[0].id,
        }
      : { documentId: before.tab.documentId, iterations: 1 }
    const method = smart ? 'generateSmartPatch' : 'generate'
    const reply = await rawApi(method, before.tab.id, request)
    assert.equal(reply.ok, false)
    assert.notEqual(reply.error.code, regionalCode)
    assert.match(reply.error.message, /model|runtime|engine|checkpoint/i)
    const channel = smart ? ipcChannels.projects.generateSmartPatch : ipcChannels.projects.generate
    await unchanged(before, 'All-disabled mask owners preserve normal offline control', [
      { channel, args: [before.tab.id, request], ok: false },
    ])
    report.refusals.push({ label: 'All-disabled offline control', smart, reply })
  }
  await updateUi(regionA, { kind: 'enabled', enabled: true })
}
async function saveMasksAndRecover() {
  await saveUi('11-authored-masks')
  await snapshot('11-explicit-masks-save-actual-loader')
  const saved = clone(latestSaved)
  await cleanCloseProject('Explicit saved masks clean close')
  await reopenSaved('11-saved-masks-reopened')
  pixelsEqual(
    await maskPixels(await current(), regionB, 'Reopened transformed B'),
    transformedPng,
    'Saved B',
  )
  await establishCamera()
  await selectEntity(regionA)
  const dirtyEdit = await gesture(
    regionA,
    adapter.brush,
    [{ x: -4, y: 7 }],
    (pixels) =>
      exactAlpha(
        pixels,
        { x: -5, y: 6, width: 2, height: 2 },
        [112, 112, 112, 112],
        'Unsaved Brush alpha75 over alpha53',
      ),
    1,
  )
  const dirty = await witness()
  assert.equal(dirty.tab.dirty, true)
  assert.equal(dirty.packageSha256, saved.sha256)
  assert.equal(region(dirty.tab, regionB).enabled, false)
  const store = new ProjectShadowStore(path.join(appDataRoot, 'autosave'))
  const savedArchive = await readIgsPackage(fixture.path)
  const inspected = await store.inspect({
    projectPath: fixture.path,
    savedPackage: savedArchive,
  })
  assert.equal(inspected.status, 'recoverable')
  assert.deepEqual(inspected.document, dirty.liveDocument)
  const manifestPath = path.join(appDataRoot, 'autosave', fixture.key, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const snapshotRoot = path.join(path.dirname(manifestPath), 'snapshots', manifest.snapshotId)
  const documentBytes = readFileSync(path.join(snapshotRoot, 'project.json'))
  assert.equal(manifest.state, 'dirty')
  assert.equal(manifest.documentRevision, dirty.tab.documentRevision)
  assert.equal(digest(documentBytes), manifest.documentHash)
  assert.deepEqual(JSON.parse(documentBytes), dirty.liveDocument)
  const assetSources = []
  for (const item of dirty.liveDocument.regionalGuidance) {
    if (!item.mask.asset) continue
    const member = item.mask.asset
    const inShadow = manifest.dirtyAssets.some((entry) => entry.path === member.path)
    if (!inShadow) {
      assert.deepEqual(
        savedArchive.project.regionalGuidance.find((entry) => entry.id === item.id).mask,
        item.mask,
      )
    }
    const bytes = inShadow
      ? readFileSync(path.join(snapshotRoot, member.path))
      : await savedArchive.readMember(member.path)
    validateMaskBytes(item.mask, bytes)
    assert.ok(bytes.equals(readFileSync(report.productObjects[item.mask.asset.sha256].path)))
    assetSources.push({
      regionId: item.id,
      member,
      source: inShadow ? 'dirty-shadow' : 'saved-package',
      sha256: digest(bytes),
    })
  }
  await snapshot('11-dirty-mask-before-intentional-crash')
  report.dirtyCrashPrecondition = {
    documentId: dirty.tab.documentId,
    documentRevision: dirty.tab.documentRevision,
    manifest,
    assetSources,
    shadowDocumentSha256: digest(documentBytes),
    durableShadowRetained: true,
    packageUnchanged: dirty.packageSha256 === saved.sha256,
    dirtyDocument: dirty.liveDocument,
    sourcePackageSha256: saved.sha256,
    dirtyMask: region(dirty.tab, regionA).mask,
  }
  checkpoint()
  await restoreObserver()
  await closeNative('declared-dirty-masks-crash', 'intentional-dirty-crash')
  await snapshot('11-after-dirty-mask-physical-exit', { closed: true, afterNativeExit: true })
  assertProtectedSql(sqlState(), 'Dirty mask crash preserves protected SQL')
  await launch('masks-recovery-same-overall-deadline')
  assertSqlTransition(expectedSql, sqlState(), 'Recovery startup indexes unchanged saved package', [
    'indexed_at',
  ])
  const recovered = await openProject('11-explicit-mask-recovery', true)
  assert.deepEqual(content(recovered.liveDocument), content(dirty.liveDocument))
  assert.equal(recovered.tab.canUndo, false)
  assert.equal(recovered.tab.canRedo, false)
  assert.equal(recovered.packageSha256, saved.sha256)
  expectedLiveDocument = clone(recovered.liveDocument)
  pixelsEqual(
    await maskPixels(recovered.tab, regionA, 'Recovered unblurred dirty A'),
    dirtyEdit.pixels,
    'Dirty mask recovery',
  )
  pixelsEqual(
    await maskPixels(recovered.tab, regionB, 'Recovered untouched B'),
    transformedPng,
    'Untouched B recovery',
  )
  await selectEntity(regionB)
  await screenshot('11-recovered-regional-masks')
  await snapshot('11-recovered-dirty-mask-bytes')
  await saveUi('11-recovered-masks')
  await cleanCloseProject('Recovered masks explicit Save close')
  await reopenSaved('11-recovered-masks-saved-reopened')
  pixelsEqual(
    await maskPixels(await current(), regionA, 'Saved recovered A'),
    dirtyEdit.pixels,
    'Recovered explicit Save',
  )
  check(
    '11 Actual Save/loader/reopen, verified unblurred dirty PNG shadow, physical crash/Home Recover and Save/reopen preserve every region and durable neighbor',
  )
}
function compactEvidenceBytes() {
  const files = filesBelow(evidenceRoot).filter((file) => !file.startsWith(fixtureRoot + path.sep))
  return files.reduce((total, file) => total + lstatSync(file).size, 0) + lstatSync(reportFile).size
}
async function run() {
  report.launcher = await verifyLauncherDeadline()
  report.prefixCodecSelfCheck = prefixCodecSelfCheck()
  checkpoint()
  await captureSources()
  report.toolVersions = {
    node: process.version,
    playwright: require('@playwright/test/package.json').version,
    electron: require('electron/package.json').version,
    sqlite: require('better-sqlite3/package.json').version,
  }
  report.compactEvidenceBudget = {
    aimBytes: 300 * 1024 * 1024,
    afterSourceBuild: compactEvidenceBytes(),
    policy: 'Root reviews a necessary exception before execution; no evidence is silently dropped',
  }
  assert.ok(
    report.compactEvidenceBudget.afterSourceBuild < 250 * 1024 * 1024,
    'Full sources/build leave insufficient compact-evidence headroom; root must review',
  )
  await prepare()
  expectedLiveDocument = clone(fixture.saved)
  expectedCanvasNegative = clone(fixture.saved.generationDraft.negativePrompt)
  await launch('regional-masks')
  assert.equal(
    await window.evaluate(() => typeof window.api.projects.editRegionalGuidanceMask),
    'function',
  )
  await openProject('01-initial-exact-open')
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  await frames()
  baseline = await witness()
  assert.deepEqual(baseline.liveDocument, fixture.saved)
  assert.equal(baseline.tab.dirty, false)
  assert.equal(baseline.tab.canUndo, false)
  assert.deepEqual(baseline.sql.tables.generation_queue_item, [])
  assert.deepEqual(baseline.sql.tables.generation_candidate_receipt, [])
  assert.equal(baseline.sql.tables.generation_seed_cursor.length, 1)
  assert.equal(baseline.sql.tables.generation_seed_cursor[0].actual_seed, 0)
  expectedSql = clone(baseline.sql)
  report.baseline = baseline
  await snapshot('01-original-offline-mask-baseline')
  await cleanLegacySaveAndReopen()
  await establishCamera()
  check(
    '01 Legacy absent regional collection survives real clean Save/loader/reopen; exact document/history/SQL/PNG neighbors',
  )
  // Authored prompt preconditions use the existing public UI, not synthetic mask output.
  regionA = await addRegion()
  regionB = await addRegion()
  await updateUi(regionB, { kind: 'enabled', enabled: false })
  await promptUi(regionA, { kind: 'block', polarity: 'positive', present: true })
  await writePrompt(regionA, 'positive', '  Region A α {sun|moon}\nexact  spaces  ')
  await promptUi(regionA, { kind: 'block', polarity: 'negative', present: true })
  await writePrompt(regionA, 'negative', '  Dormant local α\n{雨|雪}  ')
  await promptUi(regionA, { kind: 'negative-source', useGlobalNegativePrompt: true })
  await promptUi(regionB, { kind: 'block', polarity: 'positive', present: true })
  await writePrompt(regionB, 'positive', '  Disabled B β\n{霧|雲}  ')
  await promptUi(regionB, { kind: 'block', polarity: 'negative', present: true })
  await writePrompt(regionB, 'negative', '  Local B negative β  ')
  await saveUi('01-prompt-neighbors-before-mask-authoring')
  await establishCamera()
  await brushesAndEraser()
  await lassosAndHole()
  await transforms()
  await clearAndNoOps()
  await cancellation()
  await refusalsAndResources()
  await duplicateIndependent()
  await overlayAndLayout()
  await saveMasksAndRecover()
  await finish()
  report.compactEvidenceBudget.finalBytes = compactEvidenceBytes()
  assert.ok(
    report.compactEvidenceBudget.finalBytes <= report.compactEvidenceBudget.aimBytes,
    'Compact evidence exceeds300MiB; retain everything and ask root to review, never weaken retention',
  )
  check(
    '12 Healthy code0 physical exit, independently retained final full SQL, exact latest package/PNGs/source/build and complete portable journals; restored handlers; no deletion',
  )
  assert.equal(report.checks.length, 12)
  report.fullTwelveCheckQualification = true
  report.outcome = 'passed'
}

checkpoint()
try {
  await run()
} catch (error) {
  process.exitCode = 1
  report.outcome = 'failed'
  report.failure = {
    name: error.name,
    code: error.code,
    message: error.message,
    stack: error.stack,
  }
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
      await closeNative('failure-owned-masks-actor', 'abort')
    } catch (error) {
      report.physicalExitFailure = String(error)
    }
  }
  clearInterval(sampler)
  // This backup is deliberately independent of every prior witness, package and PNG assertion.
  if (
    existsSync(path.join(appDataRoot, 'database/app.sqlite')) &&
    !report.finalDatabaseAfterLastUiAndPhysicalExit
  ) {
    const physical = allExited()
    try {
      await retainDatabase(
        physical ? 'failure-final-after-physical-exit' : 'failure-final-exit-unconfirmed',
        physical,
      )
      report.failureFinalDatabaseRetainedAfterPhysicalExit = physical
      if (!physical) report.finalDatabaseNeedsRootPhysicalExitCheckpoint = true
    } catch (error) {
      report.failureFinalDatabaseError = String(error)
    }
    try {
      report.failureFinalRetainedFiles = dataFiles().map((file) =>
        retain(file, 'failure-final-payload/data/' + path.relative(appDataRoot, file)),
      )
    } catch (error) {
      report.failureFinalPayloadError = String(error)
    }
  }
  if (report.observerRestorationFailure || report.physicalExitFailure || promptGateArmed) {
    process.exitCode = 1
    report.outcome = 'failed'
  }
  lifecycle.state = 'retained'
  lifecycle.disposition = {
    owner: 'root',
    deletedBytes: 0,
    retainedEvidence: evidenceRoot,
    disposablePayloads: [fixtureRoot, temporaryDirectory],
    physicalExitConfirmed: allExited(),
    observerRestored: !observerInstalled && !report.observerRestorationFailure,
    promptGateRestored: !promptGateArmed,
    finalDatabaseRetained:
      report.finalDatabaseAfterLastUiAndPhysicalExit === true ||
      report.failureFinalDatabaseRetainedAfterPhysicalExit === true,
    releaseCondition:
      'Root verifies all PID/start/cgroup exits, original handlers, full PNG/package/shadow/source/config/helper/dist bytes and standalone SQLite checkpoints. No runner deletion.',
  }
  report.finishedAt = new Date().toISOString()
  if (previousTemporaryDirectory === undefined) delete process.env.TMPDIR
  else process.env.TMPDIR = previousTemporaryDirectory
  checkpoint()
  console.log(report.outcome.toUpperCase() + ' ' + reportFile)
}

// Reused glyph/ancestor clipping and hit-target measurement; root inspects screenshots.
async function layout(scope, label, contentKind = 'text') {
  await expect(scope).toBeVisible()
  await window.evaluate(() => document.fonts.ready.then(() => undefined))
  const result = await scope.evaluate((surface) => {
    const rectOf = (r) => ({
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    })
    const violations = [],
      text = [],
      controls = [],
      ellipses = [],
      icons = []
    const inspect = (rect, node, description) => {
      const clipped = []
      if (
        rect.left < -1 ||
        rect.top < -1 ||
        rect.right > innerWidth + 1 ||
        rect.bottom > innerHeight + 1
      )
        clipped.push('viewport')
      for (let outer = node; outer instanceof HTMLElement; outer = outer.parentElement) {
        const style = getComputedStyle(outer),
          bounds = outer.getBoundingClientRect()
        const left = bounds.left + outer.clientLeft,
          top = bounds.top + outer.clientTop
        if (
          /^(hidden|clip|auto|scroll)$/.test(style.overflowX) &&
          (rect.left < left - 1 || rect.right > left + outer.clientWidth + 1)
        )
          clipped.push(`x:${outer.className}`)
        if (
          /^(hidden|clip|auto|scroll)$/.test(style.overflowY) &&
          (rect.top < top - 1 || rect.bottom > top + outer.clientHeight + 1)
        )
          clipped.push(`y:${outer.className}`)
      }
      if (clipped.length) violations.push({ description, rect: rectOf(rect), clipped })
    }
    inspect(surface.getBoundingClientRect(), surface.parentElement, 'surface')
    for (const button of [
      ...(surface.matches('button') ? [surface] : []),
      ...surface.querySelectorAll('button'),
    ]) {
      const rect = button.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      inspect(rect, button.parentElement, button.ariaLabel || button.textContent.trim())
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      const reachable = hit !== null && (hit === button || button.contains(hit))
      if (!button.disabled && !reachable) violations.push({ obscured: button.ariaLabel })
      controls.push({ label: button.ariaLabel, reachable, disabled: button.disabled })
    }
    for (const svg of surface.querySelectorAll('svg')) {
      const rect = svg.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      inspect(rect, svg.parentElement, 'visible SVG icon')
      const owner = svg.closest('button')
      if (owner) {
        const button = owner.getBoundingClientRect()
        if (
          rect.left < button.left - 1 ||
          rect.top < button.top - 1 ||
          rect.right > button.right + 1 ||
          rect.bottom > button.bottom + 1
        ) {
          violations.push({ iconOutsideButton: owner.ariaLabel, rect: rectOf(rect) })
        }
      }
      icons.push({ rect: rectOf(rect), buttonLabel: owner?.ariaLabel ?? null })
    }
    const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || getComputedStyle(node.parentElement).visibility !== 'visible')
        continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rawRect of range.getClientRects()) {
        let rect = rawRect
        if (!rect.width || !rect.height) continue
        // Approved name ellipsis with the full title is not glyph-height clipping.
        // Preserve vertical range bounds; constrain only intentionally hidden horizontal text.
        const owner = node.parentElement
        if (
          getComputedStyle(owner).textOverflow === 'ellipsis' &&
          owner.title.trim() === node.textContent.trim()
        ) {
          const bounds = owner.getBoundingClientRect()
          const left = Math.max(rect.left, bounds.left + owner.clientLeft)
          const right = Math.min(rect.right, bounds.left + owner.clientLeft + owner.clientWidth)
          if (left !== rect.left || right !== rect.right) {
            ellipses.push({ title: owner.title, full: rectOf(rect), visibleWidth: right - left })
            rect = { ...rectOf(rect), left, right, width: right - left }
          }
        }
        inspect(rect, node.parentElement, node.textContent.trim())
        text.push({ value: node.textContent.trim(), rect: rectOf(rect) })
      }
    }
    return {
      rect: rectOf(surface.getBoundingClientRect()),
      text,
      controls,
      ellipses,
      icons,
      violations,
    }
  })
  report.layoutChecks.push({ label, ...result })
  checkpoint()
  if (contentKind === 'icon') {
    assert.ok(result.icons.length > 0, 'A visible SVG icon is required')
    assert.ok(
      result.controls.some(({ label, reachable }) => label && reachable),
      'The icon action needs its accessible label and reachable hit target',
    )
  } else {
    assert.ok(result.text.length > 0, 'Actual text glyph bounds required')
  }
  assert.deepEqual(result.violations, [], `${label}: clipped glyphs or unreachable controls`)
}
