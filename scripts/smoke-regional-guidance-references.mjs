/**
 * ROOT-ONLY AUTHORING REGRESSION -- NOT EXECUTED BY ITS AUTHOR. After root supplies a fresh build:
 * pnpm exec tsx scripts/smoke-regional-guidance-references.mjs --report-file ABSOLUTE_NEW_REPORT
 *
 * Exactly twelve finite offline checks; built UI, original preload/Main, durable shadow, SQLite,
 * real CPU normalization/full-frame thumbnails, actual .igs writer/loader and two physical Electron
 * lifetimes (dirty crash, healthy code 0). One overall <=300s deadline across restart;
 * launcher/each owned scope <=2GiB, zero swap, explicit aggregate <=4GiB, launcher stop <=30s. No
 * provisioning, catalog injection, ML, conditioning, successful admission, active-work or installed
 * embedding-completion claim. The inherited observer stays original pass-through; no delay gate is
 * armed. Root alone runs, inspects screenshots/evidence, verifies retention and disposes owned
 * payloads. This script performs no deletion and never substitutes a prepared document for a tested
 * UI import. The OS picker is deliberately controlled by an exact-title owned fixture
 * selection/cancel queue. Root alone executes and views all screenshots. Authored readiness is not
 * a native execution claim.
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
  renameSync,
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
import { crc32, deflateSync, inflateSync } from 'node:zlib'

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
const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'regional-references-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
mkdirSync(workspace, { recursive: true, mode: 0o700 })
// Short Unix socket paths; this companion remains root-owned and is never removed here.
const temporaryDirectory = mkdtempSync(path.join(artifactRoot, 'rgr-tmp-'))
const previousTemporaryDirectory = process.env.TMPDIR
process.env.TMPDIR = temporaryDirectory
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const PREFIX_ENCODING_FORMAT = 'portable-tagged-json-v1'
const prefixEncodingDiagnosticKeys = new Set()
const mono = () => Number(process.hrtime.bigint() / 1_000_000n)
let overallDeadline = startedMono + 300_000
let projectTitle = 'Regional Guidance references'
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
  references: 'Regional reference images',
  addReference: 'Add regional reference image',
  dialogTitle: 'Add Regional Guidance reference image',
  channels: {
    add: ipcChannels.projects.addRegionalGuidance,
    update: ipcChannels.projects.updateRegionalGuidance,
    duplicate: ipcChannels.projects.duplicateRegionalGuidance,
    delete: ipcChannels.projects.deleteRegionalGuidance,
    // Deliberately literal agreed public API, never a fabricated test endpoint.
    prompt: 'projects:update-regional-guidance-prompt',
    mask: ipcChannels.projects.editRegionalGuidanceMask,
    importReference: ipcChannels.projects.importRegionalGuidanceReferenceImage,
    updateReference: ipcChannels.projects.updateRegionalGuidanceReferenceImage,
  },
}
const report = {
  schemaVersion: 2,
  qualificationScope: 'regional-reference-authoring-real-cpu-offline-only',
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
  masks: [],
  productObjects: {},
  resourceChecks: [],
  promptGateRestorations: [],
  referenceImports: [],
  referenceAssets: {},
  dialogSelections: [],
  dialogRestorations: [],
  spawnRestorations: [],
  cpuWorkers: [],
  cpuDisposals: {},
  workerBytecodeWitnesses: [],
  externalInputs: [],
  preparedFamilyControls: [],
  deletionCount: 0,
  boundary: {
    actual:
      'Built native Add/keyboard reorder/remove/Duplicate/Delete/Undo/Redo through original preload/Main, actual CPU normalizer and import-thumbnail workers; full-frame canonical pixels/ICC, signed thumbnail images plus diagnostic Main protocol GETs, actual Save/loader/reopen and dirty-reference crash/Recover.',
    fixtures:
      'Production ProjectSession writer prepares two legacy referenceImages-absent regions (A enabled/B disabled), masks/regional prompts, literal Raster, both accepted Smart families/provenance and seed0; separate closed Anima/unknown Current Canvas packages contain declared pre-existing owned references for repair controls. Controlled exact-title file selections use owned raw fixtures. Empty real catalog/not-installed runtime replies stay unchanged. Preparation is neither UI-import nor generation evidence.',
    oracle:
      'Independent literal full-frame RGBA/PNG CRC/filter/ICC decoder, Chromium WebP/image decoding, raw input and canonical/hash/member oracles; full expected documents preserving all regional masks/prompts/other references, all 20 SQL tables plus sqlite_sequence and schema; canonical tagged prefix hashes, all seals, complete linear portable IPC journals and worker output journals.',
    limits:
      'One overall <=300s across both launches, <=2GiB per launcher/owned group, zero swap, explicit <=4GiB aggregate, stop <=30s. Root provides fresh build and owns serial execution.',
    excluded:
      'OS-native picker UI, installed/packaged worker availability, inference/conditioning, installed-model family transition/autocomplete, successful admission, active-work/frozen Retry, significant async capture/ABA/failure atomicity and capacity boundaries remain separate focused-suite owners. No synthetic enabling, model/runtime/catalog reply or private publication seam.',
    cleanup:
      'No deletion; root verifies physical exits, restored original handlers and complete retained bytes before disposing only declared owned payloads.',
  },
}
const lifecycle = {
  schemaVersion: 1,
  owner: { repository: root, task: 'regional-guidance-references', run: reportFile },
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
let firstReferenceUrl, mainFixture, animaFixture, unknownFixture
let dialogInstalled = false
let spawnObserverInstalled = false
let activeWorkerLaunch
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
  // Restoration must not depend on a renderer frame clock that may be the failing boundary.
  let drainError
  try {
    await drainOriginalCalls()
    await calls()
  } catch (error) {
    drainError = error
  }
  const restored = await application.evaluate(({ ipcMain }) => {
    const inFlightBefore = globalThis.igsRegionalCalls.filter(({ finished }) => !finished).length
    const restored = []
    const failures = []
    for (const [channel, original] of globalThis.igsRegionalOriginals) {
      if (ipcMain._invokeHandlers.get(channel) !== globalThis.igsRegionalObservers.get(channel)) {
        failures.push('Observer ownership changed: ' + channel)
        continue
      }
      ipcMain._invokeHandlers.set(channel, original)
      if (ipcMain._invokeHandlers.get(channel) !== original) {
        failures.push('Original handler not restored: ' + channel)
        continue
      }
      restored.push(channel)
    }
    const inFlight = globalThis.igsRegionalCalls.filter(({ finished }) => !finished).length
    return {
      restored,
      allOriginalHandlersRestored: failures.length === 0,
      failures,
      inFlightBefore,
      inFlight,
    }
  })
  report.observerRestorations.push(restored)
  observerInstalled = !restored.allOriginalHandlersRestored
  checkpoint()
  assert.deepEqual(restored.failures, [], 'Every independently owned Main handler is restored')
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
  assert.equal(restored.inFlightBefore, 0)
  assert.equal(restored.inFlight, 0)
  if (drainError) throw drainError
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
              references: [...row.querySelectorAll('[data-regional-reference-id]')].map((node) =>
                node.getAttribute('data-regional-reference-id'),
              ),
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
        references: (item.referenceImages ?? []).map(({ id }) => id),
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
        ...(Object.hasOwn(item, 'referenceImages') ? ['referenceImages'] : []),
      ].sort(),
    )
    for (const reference of item.referenceImages ?? []) assertStoredReference(reference)
    if (Object.hasOwn(item, 'referenceImages')) assert.ok(item.referenceImages.length > 0)
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
  const actualAllowances = normalizeVerifiedIndexTimes(before, normalized, allowedIndexColumns)
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
    preview_status: loaded.manifest.preview.status,
    preview_thumbnail_sha256: loaded.manifest.members.find(
      ({ path: member }) => member === 'preview/thumbnail.webp',
    ).sha256,
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
  const timestampNormalizedAfter = clone(after.sql)
  actualAllowances.push(
    ...normalizeVerifiedIndexTimes(expected, timestampNormalizedAfter, ['indexed_at'], {
      project: loaded.project,
      sha256,
    }),
  )
  for (const name of ['project_index', 'project_accepted_result_index'])
    expected.tables[name].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  assert.deepEqual(
    timestampNormalizedAfter,
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
    ...(document.regionalGuidance ?? []).flatMap((item) => [
      item.id,
      item.mask.id,
      ...(item.referenceImages ?? []).map(({ id }) => id),
    ]),
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
    NODE_ENV: 'test',
    IMAGEGEN_TEST_IMAGE_WORKER: '1',
    CUDA_VISIBLE_DEVICES: '',
    PYTHONDONTWRITEBYTECODE: '1',
    XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
    XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
    XDG_CACHE_HOME: path.join(fixtureRoot, 'cache'),
    XDG_STATE_HOME: path.join(fixtureRoot, 'state'),
    TMPDIR: temporaryDirectory,
  }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'IMAGEGEN_DEV_SERVER_URL', 'PYTHONPATH', 'PYTHONHOME'])
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
  await installRuntimeAdapters()
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
  await settleAllHomeThumbnails()
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
  regionA = randomUUID()
  regionB = randomUUID()
  const preparedRegions = [regionA, regionB].map((id, index) => {
    const maskId = randomUUID()
    const bytes = encodeProjectMaskPng(Uint8Array.of(32 + index, 128, 64, 255), 2, 2)
    const sha256 = digest(bytes)
    const mask = {
      id: maskId,
      revision: 2 + index,
      asset: {
        path: 'assets/masks/' + maskId + '/' + sha256 + '.png',
        sha256,
        bytes: bytes.length,
        width: 2,
        height: 2,
      },
      bounds: { x: -7 + index * 20, y: 11, width: 2, height: 2 },
    }
    inputs.push({ member: mask.asset.path, bytes, ownerId: id, kind: 'prepared-regional-mask' })
    const retained = keepObject(bytes, 'Declared pre-existing regional mask')
    report.masks.push({ regionId: id, mask, retained, fixtureOnly: true })
    return {
      id,
      name: index ? 'Region B disabled' : 'Region A enabled',
      enabled: index === 0,
      locked: false,
      overlayOpacity: index ? 0.35 : 0.5,
      mask,
      prompts: {
        positive: {
          text: index ? '  Disabled B β\n{霧|雲}  ' : '  Region A α {sun|moon}\nexact  spaces  ',
          embeddingRefs: [],
        },
        negative: {
          text: index ? '  Local B negative β  ' : '  Dormant local α\n{雨|雪}  ',
          embeddingRefs: [],
        },
        useGlobalNegativePrompt: index === 0,
      },
    }
  })
  session.applyDocument({
    ...session.document,
    regionalGuidance: preparedRegions,
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
  assert.ok(
    session.document.regionalGuidance.every((item) => !Object.hasOwn(item, 'referenceImages')),
  )
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
    loaded.project.regionalGuidance.every((item) => !Object.hasOwn(item, 'referenceImages')),
    true,
    'Legacy absence stays absent',
  )
  fixture = {
    title: projectTitle,
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
    keepObject(input.bytes, 'Declared prepared neighbor ' + input.member)
    assert.ok((await loaded.readMember(input.member)).equals(input.bytes))
    const file = path.join(fixtureRoot, 'source-' + index + '.png')
    writeFileSync(file, input.bytes, { flag: 'wx', mode: 0o600 })
    input.retained = retain(file, 'prepared/inputs/' + index + '.png')
  }
  mainFixture = fixture
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
async function screenshot(name, { preservePointer = false } = {}) {
  await window.evaluate(() => document.fonts.ready.then(() => undefined))
  await frames()
  if (!preservePointer) await window.mouse.move(0, 0)
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
  const members = assetRefs(loaded.project)
  assert.deepEqual(
    loaded.manifest.members
      .filter(({ path: member }) => member.startsWith('assets/'))
      .map(({ path: member }) => member)
      .sort(),
    members.map(({ path: member }) => member).sort(),
    'Exact all-owner package asset/profile inventory',
  )
  for (const input of fixture.inputs)
    assert.ok(
      (await loaded.readMember(input.member)).equals(input.bytes),
      'Prepared neighbor bytes changed: ' + input.member,
    )
  for (const member of members) {
    const bytes = await loaded.readMember(member.path)
    assert.equal(bytes.length, member.bytes)
    assert.equal(digest(bytes), member.sha256)
    const kept = report.productObjects[member.sha256]
    assert.ok(kept, 'Every current asset must have retained original bytes before overwrites')
    assert.ok(readFileSync(kept.path).equals(bytes))
  }
  for (const item of loaded.project.regionalGuidance ?? []) {
    if (item.mask.asset) validateMaskBytes(item.mask, await loaded.readMember(item.mask.asset.path))
    for (const reference of item.referenceImages ?? [])
      await verifyReferenceBytes(reference, (member) => loaded.readMember(member.path))
  }
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
  await settleAllHomeThumbnails()
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
  const thumbnailMember = loaded.manifest.members.find(
    ({ path: member }) => member === 'preview/thumbnail.webp',
  )
  const thumbnailCache = 'previews/project-thumbnails/' + thumbnailMember.sha256 + '.webp'
  if (!Object.hasOwn(before.files, thumbnailCache) && Object.hasOwn(after.files, thumbnailCache)) {
    const bytes = readFileSync(path.join(appDataRoot, thumbnailCache))
    assert.ok(bytes.equals(await loaded.readMember(thumbnailMember.path)))
    assert.equal(after.files[thumbnailCache], thumbnailMember.sha256)
    keepObject(bytes, 'Verified saved-package Home thumbnail materialized by clean close')
    expectedFiles[thumbnailCache] = thumbnailMember.sha256
    record.fileAllowances.push({
      member: thumbnailCache,
      before: null,
      after: thumbnailMember.sha256,
      reason: 'Exact new content-addressed Home cache bytes from this verified saved package',
    })
  }
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
        Object.hasOwn(report.referenceAssets, sha256) ||
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
  assert.ok(
    original.liveDocument.regionalGuidance.every((item) => !Object.hasOwn(item, 'referenceImages')),
  )
  await saveUi('01-clean-legacy-noop', { meaningful: false })
  await cleanCloseProject('Clean legacy Save authorized close')
  await reopenSaved('01-clean-legacy-noop-reopened')
  const reopened = await witness()
  assert.deepEqual(
    reopened.liveDocument,
    original.liveDocument,
    'Clean Save/read/reopen must preserve the complete legacy document',
  )
  assert.ok(
    reopened.liveDocument.regionalGuidance.every((item) => !Object.hasOwn(item, 'referenceImages')),
  )
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
  if (meaningful && report.cleanLegacySave) {
    const old = await readIgsPackage(report.productObjects[before.packageSha256].path)
    for (const member of ['preview/merged.png', 'preview/thumbnail.webp'])
      assert.ok(
        (await loaded.readMember(member)).equals(await old.readMember(member)),
        'Reference authoring must stay outside composition/preview',
      )
  }
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
  fixture.latestSaved = latestSaved
  assertNeighbors(after)
  if (
    !meaningful &&
    before.liveDocument.regionalGuidance.every((item) => !Object.hasOwn(item, 'referenceImages'))
  ) {
    assert.ok(
      loaded.project.regionalGuidance.every((item) => !Object.hasOwn(item, 'referenceImages')),
    )
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
    'docs/engineering/phase-4-regional-guidance-masks-research.md',
    'docs/engineering/phase-4-regional-guidance-references-research.md',
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
      'Complete source/build/config/lock/ICC bytes, literal imports and worker protocol output. Existing and newly produced worker bytecode is retained separately by path and content hash before/after CPU operations; dependency metadata/interpreter paths and versions are retained without copying .venv/node_modules or exposing environment values.',
    buildFreshness:
      'Root supplies fresh build. Frozen before/after complete source/config/helper and dist membership/bytes are retained; the author did not build or execute this harness.',
    sourceExclusions: [
      'Worker __pycache__ and .pyc are mapped and retained separately in workerBytecodeWitnesses; never treated as unexecuted',
    ],
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
  await restoreAll()
  await closeNative('final-healthy-references-close')
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
    loaded.project.layers,
    fixture.saved.layers,
    'All original Raster/Smart/provenance neighbors remain exact',
  )
  assert.deepEqual(loaded.project.generationDraft, fixture.saved.generationDraft)
  assert.deepEqual(loaded.project.primaryBbox, fixture.saved.primaryBbox)
  assert.equal(loaded.project.lastActualSeedSnapshot, 0)
  for (const original of fixture.saved.regionalGuidance) {
    const found = loaded.project.regionalGuidance.find(({ id }) => id === original.id)
    assert.ok(found)
    for (const key of ['mask', 'prompts', 'name', 'overlayOpacity', 'locked', 'enabled'])
      assert.deepEqual(found[key], original[key], 'Final preserved regional neighbor ' + key)
  }
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
  assert.equal(dialogInstalled, false)
  assert.equal(spawnObserverInstalled, false)
  assert.equal(report.dialogRestorations.length, 2)
  assert.equal(report.spawnRestorations.length, 2)
  assert.ok(report.cpuWorkers.flatMap(({ workers }) => workers).length > 0)
  for (const launch of report.cpuWorkers)
    for (const worker of launch.workers) {
      assert.equal(worker.originalCalls, 1)
      assert.ok(worker.identity)
      assert.equal(
        identity(worker.identity.pid)?.start === worker.identity.start,
        false,
        'Every actual CPU actor physically exited',
      )
      assert.equal(worker.closed, true)
      assertCpuDisposal(worker)
      assert.equal(
        worker.methodsRestored,
        true,
        'Exact original CPU kill/write references restored',
      )
    }
  assert.equal(report.deletionCount, 0)
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
  return regions?.map(({ maskImageUrl: _url, referenceImages, ...stored }) => ({
    ...stored,
    ...(referenceImages
      ? {
          referenceImages: referenceImages.map(
            ({ thumbnailUrl: _thumbnail, ...reference }) => reference,
          ),
        }
      : {}),
  }))
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
    for (const reference of item.referenceImages ?? []) assertReferenceView(tab, item, reference)
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
    ...(document.regionalGuidance ?? []).flatMap(({ mask, referenceImages }) => [
      ...(mask.asset ? [mask.asset] : []),
      ...(referenceImages ?? []).flatMap((reference) => [
        reference.asset,
        reference.thumbnail,
        ...(reference.sourceIccProfile ? [reference.sourceIccProfile] : []),
      ]),
    ]),
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
    ...Object.keys(report.referenceAssets),
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

const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const profilePath = path.join(root, 'worker-python/src/imagegen_worker/srgb.icc')
const pinnedProfileSha256 = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const externalInputsRoot = path.join(fixtureRoot, 'authorized-inputs')
const imageOracles = new Map()
let imageFixtures

function pngChunk(tag, data) {
  const result = Buffer.alloc(data.length + 12)
  result.writeUInt32BE(data.length)
  result.write(tag, 4, 'ascii')
  data.copy(result, 8)
  result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4)
  return result
}
function fixturePng(width, height, pixels, channels = 4, profile = null) {
  assert.equal(pixels.length, width * height * channels)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = channels === 4 ? 6 : 2
  const rows = Buffer.alloc((width * channels + 1) * height)
  for (let y = 0; y < height; y++)
    pixels.copy(
      rows,
      y * (width * channels + 1) + 1,
      y * width * channels,
      (y + 1) * width * channels,
    )
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    ...(profile
      ? [pngChunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(profile)]))]
      : []),
    pngChunk('IDAT', deflateSync(rows, { level: 0 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}
/** Independent PNG-standard decoder: CRCs, unfiltering, complete RGB(A) frame and exact ICC. */
function decodedPng(bytes) {
  assert.ok(bytes.length <= 512 * 1024 * 1024)
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
  let width,
    height,
    channels,
    profile = null,
    ended = false
  const blocks = [],
    tags = []
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset),
      end = offset + length + 12
    assert.ok(end <= bytes.length)
    const tag = bytes.toString('ascii', offset + 4, offset + 8)
    const data = bytes.subarray(offset + 8, end - 4)
    assert.equal(
      crc32(bytes.subarray(offset + 4, end - 4)),
      bytes.readUInt32BE(end - 4),
      'PNG CRC ' + tag,
    )
    tags.push(tag)
    if (tag === 'IHDR') {
      assert.equal(offset, 8)
      assert.equal(length, 13)
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      assert.ok(
        width > 0 &&
          height > 0 &&
          width <= 16384 &&
          height <= 16384 &&
          width * height <= 64_000_000,
      )
      assert.equal(data[8], 8)
      assert.ok([2, 6].includes(data[9]))
      channels = data[9] === 6 ? 4 : 3
      assert.deepEqual([...data.subarray(10)], [0, 0, 0])
    } else if (tag === 'iCCP') {
      assert.equal(profile, null)
      const zero = data.indexOf(0)
      assert.ok(zero > 0 && zero <= 79)
      assert.equal(data[zero + 1], 0)
      profile = inflateSync(data.subarray(zero + 2), { maxOutputLength: 4 * 1024 * 1024 })
    } else if (tag === 'IDAT') blocks.push(data)
    else if (tag === 'IEND') {
      assert.equal(length, 0)
      assert.equal(end, bytes.length)
      ended = true
    } else assert.fail('Unexpected canonical PNG chunk: ' + tag)
    offset = end
  }
  assert.equal(ended, true)
  const stride = width * channels
  const rows = inflateSync(Buffer.concat(blocks), { maxOutputLength: (stride + 1) * height })
  assert.equal(rows.length, (stride + 1) * height)
  const pixels = Buffer.alloc(stride * height)
  const paeth = (a, b, c) => {
    const p = a + b - c,
      da = Math.abs(p - a),
      db = Math.abs(p - b),
      dc = Math.abs(p - c)
    return da <= db && da <= dc ? a : db <= dc ? b : c
  }
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (stride + 1)]
    assert.ok(filter <= 4)
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x
      const left = x < channels ? 0 : pixels[i - channels],
        up = y ? pixels[i - stride] : 0
      const corner = y && x >= channels ? pixels[i - stride - channels] : 0
      pixels[i] =
        (rows[y * (stride + 1) + x + 1] +
          [0, left, up, Math.floor((left + up) / 2), paeth(left, up, corner)][filter]) &
        255
    }
  }
  const rgba = Buffer.alloc(width * height * 4),
    alpha = Buffer.alloc(width * height)
  for (let i = 0; i < alpha.length; i++) {
    pixels.copy(rgba, i * 4, i * channels, i * channels + 3)
    alpha[i] = rgba[i * 4 + 3] = channels === 4 ? pixels[i * channels + 3] : 255
  }
  return { width, height, rgba, alpha, profile, tags }
}
function validateMaskBytes(mask, bytes) {
  assertStoredMask(mask)
  assert.equal(digest(bytes), mask.asset.sha256)
  assert.equal(bytes.length, mask.asset.bytes)
  const image = decodedPng(bytes)
  assert.equal(image.profile, null)
  assert.deepEqual([image.width, image.height], [mask.bounds.width, mask.bounds.height])
  for (let i = 0; i < image.alpha.length; i++)
    assert.deepEqual([...image.rgba.subarray(i * 4, i * 4 + 3)], [255, 255, 255])
  assert.ok(image.alpha.subarray(0, image.width).some(Boolean))
  assert.ok(image.alpha.subarray((image.height - 1) * image.width).some(Boolean))
  assert.ok(
    Array.from({ length: image.height }, (_, y) => image.alpha[y * image.width]).some(Boolean),
  )
  assert.ok(
    Array.from({ length: image.height }, (_, y) => image.alpha[(y + 1) * image.width - 1]).some(
      Boolean,
    ),
  )
  return image
}
function assertStoredReference(reference) {
  assert.deepEqual(
    Object.keys(reference).sort(),
    [
      'asset',
      'id',
      'name',
      'sourceFormat',
      'thumbnail',
      ...(reference.sourceIccProfile ? ['sourceIccProfile'] : []),
    ].sort(),
  )
  assert.match(reference.id, uuidPattern)
  assert.ok(reference.name.length > 0)
  assert.ok(['PNG', 'JPEG', 'WEBP'].includes(reference.sourceFormat))
  for (const [role, member, suffix, maxBytes, maxSide] of [
    ['image', reference.asset, 'png', 512 * 1024 * 1024, 16384],
    ['thumbnail', reference.thumbnail, 'webp', 128000, 128],
  ]) {
    assert.deepEqual(Object.keys(member).sort(), ['bytes', 'height', 'path', 'sha256', 'width'])
    assert.match(member.sha256, /^[a-f0-9]{64}$/)
    assert.equal(
      member.path,
      'assets/regional-references/' + reference.id + '/' + member.sha256 + '.' + suffix,
      role + ' exact role/owner namespace',
    )
    assert.ok(Number.isSafeInteger(member.bytes) && member.bytes > 0 && member.bytes <= maxBytes)
    assert.ok(
      Number.isSafeInteger(member.width) &&
        Number.isSafeInteger(member.height) &&
        member.width > 0 &&
        member.height > 0 &&
        member.width <= maxSide &&
        member.height <= maxSide,
    )
  }
  assert.ok(reference.asset.width * reference.asset.height <= 64_000_000)
  assert.ok(
    reference.thumbnail.width <= reference.asset.width &&
      reference.thumbnail.height <= reference.asset.height,
    'No thumbnail upscale',
  )
  if (reference.sourceIccProfile) {
    const profile = reference.sourceIccProfile
    assert.deepEqual(Object.keys(profile).sort(), ['bytes', 'path', 'sha256'])
    assert.equal(profile.path, 'assets/profiles/' + profile.sha256 + '.icc')
    assert.ok(profile.bytes >= 128 && profile.bytes <= 4 * 1024 * 1024)
  }
}
function assertReferenceView(tab, item, reference) {
  const { thumbnailUrl, ...stored } = reference
  assertStoredReference(stored)
  const url = new URL(thumbnailUrl)
  assert.equal(url.protocol, 'igs-layer:')
  assert.equal(url.hostname, 'regional-reference')
  assert.equal(url.search + url.hash + url.username + url.password + url.port, '')
  assert.deepEqual(url.pathname.split('/').slice(1, -1), [
    tab.id,
    tab.documentRevision,
    item.id,
    reference.id,
    reference.thumbnail.sha256,
  ])
  assert.match(url.pathname.split('/').at(-1), /^[a-f0-9]{64}\.webp$/)
}
function webpProfile(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP')
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length)
  let profile = null
  for (let i = 12; i < bytes.length;) {
    const tag = bytes.toString('ascii', i, i + 4),
      size = bytes.readUInt32LE(i + 4)
    assert.ok(i + 8 + size <= bytes.length)
    if (tag === 'ICCP') {
      assert.equal(profile, null)
      profile = bytes.subarray(i + 8, i + 8 + size)
    }
    i += 8 + size + (size & 1)
    assert.ok(i <= bytes.length)
  }
  return profile
}
function independentWebpDimensions(bytes) {
  for (let i = 12; i < bytes.length;) {
    const tag = bytes.toString('ascii', i, i + 4)
    const size = bytes.readUInt32LE(i + 4)
    assert.ok(i + size + 8 <= bytes.length)
    if (tag === 'VP8X') {
      assert.equal(size, 10)
      const frame = bytes.subarray(i + 8, i + 18)
      assert.equal(frame[0] & 0x20, 0x20, 'Profiled full-frame WebP')
      return { width: frame.readUIntLE(4, 3) + 1, height: frame.readUIntLE(7, 3) + 1, rgba: null }
    }
    i += size + 8 + (size & 1)
  }
  assert.fail('A canonical profiled thumbnail needs a VP8X full-frame descriptor')
}
async function decodeThumbnail(bytes, mime = 'image/webp') {
  return window.evaluate(
    async ({ encoded, mime }) => {
      const image = new Image()
      image.src = 'data:' + mime + ';base64,' + encoded
      await image.decode()
      const surface = document.createElement('canvas')
      surface.width = image.naturalWidth
      surface.height = image.naturalHeight
      const context = surface.getContext('2d', { willReadFrequently: true })
      context.drawImage(image, 0, 0)
      return {
        width: surface.width,
        height: surface.height,
        rgba: [...context.getImageData(0, 0, surface.width, surface.height).data],
      }
    },
    { encoded: bytes.toString('base64'), mime },
  )
}
async function memberBytes(value, member) {
  if (value.tab.dirty) {
    const manifestName = 'autosave/' + fixture.key + '/manifest.json'
    const manifest = JSON.parse(readFileSync(report.productObjects[value.files[manifestName]].path))
    const changed = manifest.dirtyAssets.find(({ path: memberPath }) => memberPath === member.path)
    if (changed) {
      assert.equal(changed.sha256, member.sha256)
      const name =
        'autosave/' + fixture.key + '/snapshots/' + manifest.snapshotId + '/' + member.path
      assert.equal(value.files[name], member.sha256)
      return readFileSync(report.productObjects[value.files[name]].path)
    }
  }
  // Historical content-addressed package retained by witness(), before any overwrite.
  const archive = await readIgsPackage(report.productObjects[value.packageSha256].path)
  assert.deepEqual(archive.project, value.savedDocument)
  return archive.readMember(member.path)
}
async function verifyReferenceBytes(reference, read) {
  const { thumbnailUrl: _url, ...stored } = reference
  assertStoredReference(stored)
  const original = Buffer.from(await read(reference.asset)),
    thumbnail = Buffer.from(await read(reference.thumbnail))
  for (const [member, bytes] of [
    [reference.asset, original],
    [reference.thumbnail, thumbnail],
  ]) {
    assert.equal(bytes.length, member.bytes)
    assert.equal(digest(bytes), member.sha256)
    const kept = keepObject(bytes, member.path)
    report.referenceAssets[member.sha256] = { member, retained: kept.path }
  }
  const image = decodedPng(original)
  assert.ok(
    image.profile?.equals(readFileSync(profilePath)),
    'Canonical PNG carries exact pinned sRGB ICC',
  )
  assert.deepEqual([image.width, image.height], [reference.asset.width, reference.asset.height])
  assert.ok(
    webpProfile(thumbnail)?.equals(readFileSync(profilePath)),
    'Thumbnail retains pinned sRGB ICC',
  )
  const independentFrame = independentWebpDimensions(thumbnail)
  // Post-exit gates remain independently runnable without a renderer. Whole WebP bytes are
  // compared to the already retained, Chromium-decoded authoring/read/reopen witnesses.
  const decoded = window ? await decodeThumbnail(thumbnail) : independentFrame
  assert.deepEqual(
    [decoded.width, decoded.height],
    [independentFrame.width, independentFrame.height],
  )
  assert.deepEqual(
    [decoded.width, decoded.height],
    [reference.thumbnail.width, reference.thumbnail.height],
  )
  const scale = Math.min(1, 128 / image.width, 128 / image.height)
  assert.ok(
    Math.abs(decoded.width - image.width * scale) <= 1 &&
      Math.abs(decoded.height - image.height * scale) <= 1,
    'Bounded full-frame aspect ratio',
  )
  const oracle = imageOracles.get(reference.asset.sha256)
  if (oracle) {
    const expectedPixels = readFileSync(oracle.rgba.path)
    if (oracle.decoderTolerance) {
      assert.equal(image.rgba.length, expectedPixels.length)
      for (let index = 0; index < image.rgba.length; index++)
        assert.ok(
          Math.abs(image.rgba[index] - expectedPixels[index]) <= oracle.decoderTolerance,
          'Independent Chromium vs CPU lossy-format decode within declared two-level color rounding',
        )
    } else
      assert.ok(
        image.rgba.equals(expectedPixels),
        'Exact whole canonical RGBA, including transparent margins',
      )
    if (oracle.sourceProfile) {
      assert.ok(reference.sourceIccProfile)
      const profile = Buffer.from(await read(reference.sourceIccProfile))
      assert.ok(profile.equals(readFileSync(oracle.sourceProfile.path)))
      assert.equal(profile.length, reference.sourceIccProfile.bytes)
      assert.equal(digest(profile), reference.sourceIccProfile.sha256)
      const kept = keepObject(profile, reference.sourceIccProfile.path)
      report.referenceAssets[reference.sourceIccProfile.sha256] = {
        member: reference.sourceIccProfile,
        retained: kept.path,
      }
    } else assert.equal(Object.hasOwn(reference, 'sourceIccProfile'), false)
    if (scale === 1 && decoded.rgba) {
      assert.deepEqual(
        [decoded.width, decoded.height],
        [image.width, image.height],
        'No crop/no upscale including all-transparent input',
      )
      for (let i = 0; i < image.alpha.length; i++) {
        assert.equal(decoded.rgba[i * 4 + 3], image.alpha[i], 'Full-frame thumbnail alpha')
        if (image.alpha[i] >= 64)
          for (let channel = 0; channel < 3; channel++)
            assert.ok(
              Math.abs(decoded.rgba[i * 4 + channel] - image.rgba[i * 4 + channel]) <= 2,
              'Lossless thumbnail color within Chromium premultiplication rounding',
            )
      }
    }
    if (decoded.rgba && oracle.thumbnailMarkers) {
      for (const { x, y, rgba } of oracle.thumbnailMarkers) {
        const index =
          (Math.round(y * (decoded.height - 1)) * decoded.width +
            Math.round(x * (decoded.width - 1))) *
          4
        for (let channel = 0; channel < 4; channel++)
          assert.ok(
            Math.abs(decoded.rgba[index + channel] - rgba[channel]) <= 2,
            'Independent full-frame edge marker survives downsampling without crop',
          )
      }
    }
  } else if (reference.sourceIccProfile) {
    const profile = Buffer.from(await read(reference.sourceIccProfile))
    assert.equal(digest(profile), reference.sourceIccProfile.sha256)
    assert.equal(profile.length, reference.sourceIccProfile.bytes)
    keepObject(profile, reference.sourceIccProfile.path)
    report.referenceAssets[reference.sourceIccProfile.sha256] = {
      member: reference.sourceIccProfile,
    }
  }
  return {
    pngSha256: digest(original),
    rgbaSha256: digest(image.rgba),
    thumbnailSha256: digest(thumbnail),
    thumbnailWidth: decoded.width,
    thumbnailHeight: decoded.height,
    thumbnailAlphaSha256: decoded.rgba
      ? digest(Buffer.from(decoded.rgba.filter((_, i) => i % 4 === 3)))
      : null,
    thumbnailDecoder: window
      ? 'Actual Chromium RGBA decode plus independent RIFF/VP8X frame metadata'
      : 'Post-exit independent RIFF/VP8X metadata and exact retained previously decoded bytes',
  }
}
const referenceSection = (id) =>
  regionalRow(null, id).getByRole('region', { name: adapter.references, exact: true })
const referenceCard = (id, referenceId) =>
  referenceSection(id).locator('[data-regional-reference-id="' + referenceId + '"]')
const addReferenceButton = (id) =>
  regionalRow(null, id).getByRole('button', { name: adapter.addReference, exact: true })
async function renderedReference(tab, id, reference) {
  const card = referenceCard(id, reference.id),
    image = card.getByRole('img', { name: reference.name, exact: true })
  await card.scrollIntoViewIfNeeded()
  await expect(card).toContainText(
    reference.sourceFormat + ' · ' + reference.asset.width + ' × ' + reference.asset.height + ' px',
  )
  await expect(image).toBeVisible()
  await expect
    .poll(() =>
      image.evaluate((node) => node.complete && node.naturalWidth > 0 && node.naturalHeight > 0),
    )
    .toBe(true)
  const rendered = await image.evaluate((node) => ({
    currentSrc: node.currentSrc,
    width: node.naturalWidth,
    height: node.naturalHeight,
    objectFit: getComputedStyle(node).objectFit,
  }))
  assert.equal(rendered.currentSrc, reference.thumbnailUrl)
  assert.deepEqual(
    [rendered.width, rendered.height],
    [reference.thumbnail.width, reference.thumbnail.height],
  )
  assert.equal(rendered.objectFit, 'contain')
  assertReferenceView(tab, region(tab, id), reference)
  return rendered
}
function sourceIdentity(file) {
  const stat = statSync(file, { bigint: true })
  return {
    path: file,
    size: String(stat.size),
    dev: String(stat.dev),
    ino: String(stat.ino),
    mtimeNs: String(stat.mtimeNs),
    ctimeNs: String(stat.ctimeNs),
    sha256: digest(readFileSync(file)),
  }
}
function declareInput(name, width, height, rgba, channels = 4, profile = null) {
  const pixels = channels === 4 ? rgba : Buffer.from(rgba.filter((_, i) => i % 4 !== 3))
  const bytes = fixturePng(width, height, pixels, channels, profile)
  const file = path.join(externalInputsRoot, name)
  writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 })
  const entry = {
    path: file,
    name,
    width,
    height,
    channels,
    sourceFormat: 'PNG',
    raw: keepObject(bytes, 'Authorized owned raw input ' + name),
    rgba: keepObject(rgba, 'Independent literal full-frame RGBA oracle ' + name),
    sourceProfile: profile ? keepObject(profile, 'Exact source ICC ' + name) : null,
    identity: sourceIdentity(file),
  }
  report.externalInputs.push(entry)
  return entry
}
function prepareInputFixtures() {
  mkdirSync(externalInputsRoot, { mode: 0o700 })
  const profile = readFileSync(profilePath)
  assert.equal(digest(profile), pinnedProfileSha256)
  const mixed = Buffer.alloc(96 * 48 * 4)
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 96; x++) {
      const index = (y * 96 + x) * 4
      mixed[index] = 32
      mixed[index + 1] = 96
      mixed[index + 2] = 160
      mixed[index + 3] = x >= 12 && x < 84 && y >= 8 && y < 40 ? [64, 128, 255][(x + y) % 3] : 0
    }
  const large = Buffer.alloc(1024 * 640 * 4)
  let entropy = 0x13579bdf
  for (let i = 0; i < large.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      entropy ^= entropy << 13
      entropy ^= entropy >>> 17
      entropy ^= entropy << 5
      large[i + channel] = entropy & 255
    }
    large[i + 3] = 255
  }
  for (let y = 0; y < 640; y++)
    for (let x = 0; x < 1024; x++) {
      const color =
        y < 48
          ? [224, 32, 32, 255]
          : y >= 592
            ? [32, 64, 224, 255]
            : x < 48
              ? [32, 192, 64, 255]
              : x >= 976
                ? [224, 192, 32, 255]
                : null
      if (color) large.set(color, (y * 1024 + x) * 4)
    }
  const differentProfile = Buffer.from(profile)
  // Header timestamp changes only source-profile identity; RGB sRGB tags/curves stay exact.
  differentProfile.writeUInt16BE(profile.readUInt16BE(24) === 2025 ? 2024 : 2025, 24)
  assert.notEqual(digest(differentProfile), digest(profile))
  const dirtyPixels = Buffer.alloc(52 * 31 * 4)
  for (let i = 0; i < dirtyPixels.length; i += 4) {
    dirtyPixels[i] = 180
    dirtyPixels[i + 1] = 60
    dirtyPixels[i + 2] = 24
    dirtyPixels[i + 3] = i % 20 ? 255 : 0
  }
  const invalidPath = path.join(externalInputsRoot, 'invalid-not-a-png.png')
  const unsupportedPath = path.join(externalInputsRoot, 'unsupported-selection.gif')
  writeFileSync(invalidPath, Buffer.from('This is deliberately not a PNG.\n'), { flag: 'wx' })
  writeFileSync(unsupportedPath, Buffer.from('GIF89a deliberately unsupported image input'), {
    flag: 'wx',
  })
  for (const file of [invalidPath, unsupportedPath]) {
    const entry = {
      path: file,
      raw: keepObject(readFileSync(file), 'Declared rejected raw input'),
      identity: sourceIdentity(file),
    }
    report.externalInputs.push(entry)
  }
  imageFixtures = {
    mixed: declareInput('mixed-alpha-margins.png', 96, 48, mixed),
    large: declareInput('rgb-srgb-icc-over-preview-limit.png', 1024, 640, large, 3, profile),
    transparent: declareInput('fully-transparent-41x23.png', 41, 23, Buffer.alloc(41 * 23 * 4)),
    dirty: declareInput(
      'unsaved-new-image-and-original-icc.png',
      52,
      31,
      dirtyPixels,
      4,
      differentProfile,
    ),
    invalidPath,
    unsupportedPath,
  }
  imageFixtures.large.thumbnailMarkers = [
    { x: 0.5, y: 0.02, rgba: [224, 32, 32, 255] },
    { x: 0.5, y: 0.98, rgba: [32, 64, 224, 255] },
    { x: 0.01, y: 0.5, rgba: [32, 192, 64, 255] },
    { x: 0.99, y: 0.5, rgba: [224, 192, 32, 255] },
  ]
  retainJson('prepared/authorized-inputs-and-oracles.json', report.externalInputs)
}
function fixtureWebp(profile) {
  const original = Buffer.from(
    'UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAIAAUAmJaACdLoB+AAETAAA/q4X/0mzxNnibPkkf/OwbEu14AAA',
    'base64',
  )
  const extended = Buffer.alloc(18)
  extended.write('VP8X')
  extended.writeUInt32LE(10, 4)
  extended[8] = 0x20
  extended.writeUIntLE(1, 12, 3)
  extended.writeUIntLE(1, 15, 3)
  const header = Buffer.alloc(8),
    icc = Buffer.alloc(8)
  icc.write('ICCP')
  icc.writeUInt32LE(profile.length, 4)
  const body = Buffer.concat([
    Buffer.from('WEBP'),
    extended,
    icc,
    profile,
    Buffer.alloc(profile.length & 1),
    original.subarray(12),
  ])
  header.write('RIFF')
  header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}
function jpegWithoutEncoderIcc(jpeg) {
  assert.ok(jpeg.subarray(0, 2).equals(Buffer.from([0xff, 0xd8])))
  const chunks = [jpeg.subarray(0, 2)]
  let offset = 2,
    removedProfiles = 0
  while (offset < jpeg.length) {
    const start = offset
    assert.equal(jpeg[offset++], 0xff, 'Valid declared JPEG header marker')
    while (jpeg[offset] === 0xff) offset++
    const marker = jpeg[offset++]
    if (marker === 0xda || marker === 0xd9) {
      chunks.push(jpeg.subarray(start))
      return { bytes: Buffer.concat(chunks), removedProfiles }
    }
    assert.ok(marker !== 0 && marker !== 0xd8)
    if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(jpeg.subarray(start, offset))
      continue
    }
    assert.ok(offset + 2 <= jpeg.length)
    const length = jpeg.readUInt16BE(offset)
    assert.ok(length >= 2 && offset + length <= jpeg.length)
    const end = offset + length
    if (
      marker === 0xe2 &&
      length >= 14 &&
      jpeg.subarray(offset + 2, offset + 14).equals(Buffer.from('ICC_PROFILE\0'))
    )
      removedProfiles++
    else chunks.push(jpeg.subarray(start, end))
    offset = end
  }
  throw new Error('Declared JPEG encoder omitted its scan/end marker')
}
async function prepareAdditionalEncodedInputs() {
  const profile = readFileSync(profilePath)
  const png = fixturePng(
    2,
    2,
    Buffer.from([32, 96, 160, 255, 32, 96, 160, 255, 32, 96, 160, 255, 32, 96, 160, 255]),
  )
  keepObject(png, 'Literal PNG encoder input for the declared JPEG fixture')
  const jpeg = Buffer.from(
    await application.evaluate(({ nativeImage }, encoded) => {
      const image = nativeImage.createFromBuffer(Buffer.from(encoded, 'base64'))
      if (image.isEmpty()) throw new Error('Declared JPEG fixture encoder rejected its input')
      return [...image.toJPEG(100)]
    }, png.toString('base64')),
  )
  assert.ok(jpeg.subarray(0, 2).equals(Buffer.from([0xff, 0xd8])))
  // Chromium may supply its own ICC APP2. Replace those headers instead of creating
  // conflicting sequences; keep every other JPEG byte, including the encoded scan, exact.
  const encoderJpeg = keepObject(jpeg, 'Unchanged Chromium JPEG encoder output')
  const stripped = jpegWithoutEncoderIcc(jpeg)
  report.jpegFixtureIcc = {
    encoderJpeg,
    removedProfiles: stripped.removedProfiles,
    beforePinnedIcc: keepObject(stripped.bytes, 'JPEG with only encoder ICC APP2 headers removed'),
    insertedProfiles: 1,
    profileSha256: digest(profile),
  }
  const payload = Buffer.concat([Buffer.from('ICC_PROFILE\0'), Buffer.from([1, 1]), profile])
  const segment = Buffer.alloc(4)
  segment[0] = 0xff
  segment[1] = 0xe2
  segment.writeUInt16BE(payload.length + 2, 2)
  const taggedJpeg = Buffer.concat([
    stripped.bytes.subarray(0, 2),
    segment,
    payload,
    stripped.bytes.subarray(2),
  ])
  for (const [name, sourceFormat, bytes, mime] of [
    ['valid-retry-source.jpeg', 'JPEG', taggedJpeg, 'image/jpeg'],
    ['valid-retry-source.webp', 'WEBP', fixtureWebp(profile), 'image/webp'],
  ]) {
    const decoded = await decodeThumbnail(bytes, mime)
    assert.deepEqual([decoded.width, decoded.height], [2, 2])
    const file = path.join(externalInputsRoot, name)
    writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 })
    const entry = {
      name,
      path: file,
      width: 2,
      height: 2,
      sourceFormat,
      decoderTolerance: 2,
      raw: keepObject(bytes, 'Declared real ' + sourceFormat + ' authorized input'),
      rgba: keepObject(
        Buffer.from(decoded.rgba),
        'Independent Chromium source decode oracle ' + name,
      ),
      sourceProfile: keepObject(profile, 'Exact original ICC in ' + name),
      identity: sourceIdentity(file),
      preparationBoundary:
        'Fixture encoding/independent source decoding only; normal UI Add and original Main/CPU remain the tested import boundary.',
    }
    report.externalInputs.push(entry)
    imageFixtures[sourceFormat.toLowerCase()] = entry
  }
  retainJson(
    'prepared/additional-jpeg-webp-inputs-and-decoder-boundary.json',
    report.externalInputs,
  )
}
async function prepareFamilyControl(family) {
  const title = 'Prepared regional reference repair ' + (family ?? 'unknown')
  const packagePath = path.join(workspace, title + '.igs')
  const session = await ProjectSession.create(packagePath, title, roots)
  const profile = readFileSync(profilePath),
    thumb = fixtureWebp(profile)
  const pixels = Buffer.from([32, 64, 96, 255, 40, 80, 120, 255, 10, 20, 30, 255, 80, 90, 100, 255])
  const png = fixturePng(2, 2, pixels, 4, profile),
    inputs = []
  const references = ['Existing first', 'Existing second'].map((name) => {
    const id = randomUUID(),
      prefix = 'assets/regional-references/' + id + '/'
    const image = {
      id,
      name,
      sourceFormat: 'PNG',
      asset: {
        path: prefix + digest(png) + '.png',
        sha256: digest(png),
        bytes: png.length,
        width: 2,
        height: 2,
      },
      thumbnail: {
        path: prefix + digest(thumb) + '.webp',
        sha256: digest(thumb),
        bytes: thumb.length,
        width: 2,
        height: 2,
      },
      sourceIccProfile: {
        path: 'assets/profiles/' + digest(profile) + '.icc',
        sha256: digest(profile),
        bytes: profile.length,
      },
    }
    for (const [member, bytes] of [
      [image.asset, png],
      [image.thumbnail, thumb],
      [image.sourceIccProfile, profile],
    ]) {
      if (!inputs.some((input) => input.member === member.path))
        inputs.push({
          member: member.path,
          bytes,
          ownerId: id,
          kind: 'declared-pre-existing-family-control',
        })
      const kept = keepObject(bytes, 'Prepared ' + title + ' ' + member.path)
      report.referenceAssets[member.sha256] = { member, retained: kept.path }
    }
    return image
  })
  const regionId = randomUUID()
  session.applyDocument({
    ...session.document,
    generationDraft: {
      ...session.document.generationDraft,
      model: family ? reference(family, 'Absent prepared ' + family + ' Current Canvas') : null,
      sampling: {
        ...session.document.generationDraft.sampling,
        ...(family === 'anima' ? { animaMethod: 'euler', sampler: null, scheduler: null } : {}),
      },
    },
    regionalGuidance: [
      {
        id: regionId,
        name: 'Prepared existing references',
        enabled: true,
        locked: false,
        overlayOpacity: 0.5,
        mask: { id: randomUUID(), revision: 0, asset: null },
        referenceImages: references,
        prompts: {
          positive: { text: 'Prepared repair prompt remains exact', embeddingRefs: [] },
          negative: null,
          useGlobalNegativePrompt: true,
        },
      },
    ],
  })
  await session.save({
    assets: Object.fromEntries(inputs.map(({ member, bytes }) => [member, { bytes }])),
  })
  const loaded = await readIgsPackage(packagePath)
  const control = {
    title,
    key: session.localRecoveryKey,
    path: packagePath,
    saved: loaded.project,
    inputs,
    patches: [],
    regionId,
    packageSha256: digest(readFileSync(packagePath)),
  }
  for (const [index, input] of inputs.entries()) {
    const kept = keepObject(input.bytes, title + '/' + input.member)
    input.retained = kept.path
    assert.ok((await loaded.readMember(input.member)).equals(input.bytes))
    report.referenceAssets[digest(input.bytes)] = { member: input.member, retained: kept.path }
    assert.ok(index < 20)
  }
  keepObject(readFileSync(packagePath), title)
  report.preparedFamilyControls.push({
    title,
    path: packagePath,
    key: control.key,
    regionId,
    document: loaded.project,
    packageSha256: control.packageSha256,
    boundary:
      'Production writer fixture only; this is not a UI import, model-catalog transition, or runtime reply replacement.',
  })
  return control
}

function captureCpuCloseContract() {
  const sourceName = 'src/main/projects/worker-client.ts'
  const buildName = 'dist/main/main.cjs'
  const sites = []
  for (const [name, sha256, built] of [
    [sourceName, report.sourceSha256[sourceName], false],
    [buildName, report.bundleSha256[buildName], true],
  ]) {
    const file = path.join(root, name),
      bytes = readFileSync(file)
    assert.equal(digest(bytes), sha256, 'CPU close caller contract uses frozen production bytes')
    const text = bytes.toString('utf8')
    const classStart = text.indexOf(
      built ? 'var ProjectWorkerClient = class ' : 'export class ProjectWorkerClient ',
    )
    assert.ok(classStart >= 0)
    const className = built
      ? /^var ProjectWorkerClient = class (\w+) \{/.exec(text.slice(classStart))?.[1]
      : 'ProjectWorkerClient'
    assert.ok(className)
    const scope = (start, end) => {
      const offset = text.indexOf(start, classStart),
        finish = text.indexOf(end, offset + start.length)
      assert.ok(offset >= classStart && finish > offset, 'Exact frozen client method boundaries')
      return { offset, finish, text: text.slice(offset, finish) }
    }
    const locate = (method, expression) => {
      const matches = [...method.text.matchAll(expression)]
      assert.equal(matches.length, 1, 'One exact production close/request call site')
      return text.slice(0, method.offset + matches[0].index).split('\n').length
    }
    const closeOne = scope(
      built ? '\n  async closeOne()' : '\n  private async closeOne()',
      built ? '\n  async exclusive(' : '\n  private async exclusive<',
    )
    const fail = scope(
      built ? '\n  fail(error)' : '\n  private fail(error:',
      built ? '\n  observeExit()' : '\n  private observeExit()',
    )
    const close = scope(
      built ? '\n  async close()' : '\n  async close():',
      built ? '\n  async composePreview(' : '\n  async composePreview(',
    )
    const request = scope(
      built ? '\n  request(' : '\n  private request(',
      built ? '\n  async validateOutputPaths(' : '\n  private async validateOutputPaths(',
    )
    const constructor = {
      offset: classStart,
      text: text.slice(
        classStart,
        text.indexOf(
          built ? '\n  get ready()' : '\n  /** Established Main image children',
          classStart,
        ),
      ),
    }
    sites.push({
      file,
      sha256,
      className,
      failSignalLine: locate(fail, /this\.child\.kill\((['"])SIGTERM\1\)/g),
      closeOneClosedLine: locate(
        closeOne,
        /this\.fail\(new ProjectWorkerError\((['"])CLOSED\1,\s*(['"])The image worker was closed\.\2\)\)/g,
      ),
      closeCallLine: locate(close, /this\.closePromise \?\?= this\.closeOne\(\)/g),
      exitFailLine: locate(
        constructor,
        /this\.fail\(new ProjectWorkerError\((['"])WORKER_EXITED\1,\s*(['"])The image worker exited\.\2\)\)/g,
      ),
      requestStartLine: text.slice(0, request.offset).split('\n').length,
      requestEndLine: text.slice(0, request.finish).split('\n').length,
    })
  }
  const ownerSites = []
  for (const [name, built] of [
    ['src/main/projects/project-target-inspection-owner.ts', false],
    [buildName, true],
  ]) {
    const file = path.join(root, name),
      bytes = readFileSync(file)
    const sha256 = (built ? report.bundleSha256 : report.sourceSha256)[name]
    assert.equal(digest(bytes), sha256)
    const text = bytes.toString('utf8')
    const start = text.indexOf(
      built
        ? 'var ProjectTargetInspectionOwner = class '
        : 'export class ProjectTargetInspectionOwner ',
    )
    assert.ok(start >= 0)
    const finish = built ? text.indexOf('\n// src/', start) : text.length
    assert.ok(finish > start)
    const matches = [...text.slice(start, finish).matchAll(/await lease\.client\.close\(\)/g)]
    assert.equal(matches.length, 1, 'Exactly one frozen withLease finally close call')
    ownerSites.push({
      file,
      sha256,
      name: 'ProjectTargetInspectionOwner.withLease',
      line: text.slice(0, start + matches[0].index).split('\n').length,
    })
  }
  report.cpuCloseContract = {
    sites,
    ownerSites,
    boundary:
      'Source/build call-site witness only. Actual raw stacks, unchanged kill/write calls, original Main owner calls, wire requests/replies and physical exit must independently match at runtime. No stack or exit event is fabricated.',
  }
  checkpoint()
}
function cpuStackFrames(stack) {
  assert.equal(typeof stack, 'string', 'Actual raw production caller stack is required')
  return stack.split('\n').flatMap((line) => {
    const match = /^\s*at (?:(.*?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line)
    if (!match) return []
    const file = match[2].startsWith('file:') ? fileURLToPath(match[2]) : match[2]
    return [
      {
        name: (match[1] ?? '').replace(/^async /, ''),
        file,
        line: Number(match[3]),
        column: Number(match[4]),
      },
    ]
  })
}
function cpuFrameMatches(frame, method, field) {
  return (
    frame &&
    report.cpuCloseContract.sites.some(
      (site) =>
        frame.file === site.file &&
        frame.line === site[field] &&
        [site.className, 'ProjectWorkerClient'].some((name) => frame.name === name + '.' + method),
    )
  )
}
function cpuClosePath(stack) {
  const frames = cpuStackFrames(stack)
  for (let index = 0; index < frames.length; index++) {
    if (!cpuFrameMatches(frames[index], 'fail', 'failSignalLine')) continue
    if (
      cpuFrameMatches(frames[index + 1], 'closeOne', 'closeOneClosedLine') &&
      cpuFrameMatches(frames[index + 2], 'close', 'closeCallLine') &&
      report.cpuCloseContract.ownerSites.some((site) => {
        const frame = frames[index + 3]
        return (
          frame && frame.name === site.name && frame.file === site.file && frame.line === site.line
        )
      })
    )
      return 'normal-CLOSED-closeOne'
    const origin = frames[index + 1]
    if (
      origin &&
      report.cpuCloseContract.sites.some(
        (site) => origin.file === site.file && origin.line === site.exitFailLine,
      )
    )
      return 'already-exited-fail'
  }
  return null
}
function assertCpuDisposal(worker) {
  assert.equal(worker.closed, true)
  assert.equal(worker.exited, true, 'Actual exit event is required in addition to close')
  assert.ok(worker.exitSequence < worker.closeSequence)
  assert.equal(worker.error, undefined, 'A failed spawn cannot qualify as normal disposal')
  const stdout = readFileSync(worker.stdout),
    stdin = readFileSync(worker.stdin)
  const messages = workerMessages(worker)
  const ready = messages[0]
  assert.equal(ready.type, 'ready')
  assert.equal(ready.pythonVersion, '3.12.13')
  assert.equal(ready.workerVersion, '0.1.0')
  assert.equal(ready.runtimeProfile, 'derivatives-only')
  for (const capability of [
    'image-derivatives',
    'import-normalization',
    'import-thumbnail',
    'self-test',
  ])
    assert.ok(ready.capabilities.includes(capability))
  for (const message of messages) assert.equal(message.protocolVersion, '1')
  assert.equal(messages.filter(({ type }) => type === 'ready').length, 1)
  const replies = {
    'compose-preview': 'preview-done',
    'compose-target': 'target-done',
    'compose-smart-patch-output': 'smart-patch-output-composed',
    'condition-smart-patch': 'smart-patch-conditioned',
    'create-import-thumbnail': 'import-thumbnail-done',
    'create-resource-preview': 'resource-preview-done',
    'derive-image': 'derivative-done',
    'fade-smart-patch': 'smart-patch-faded',
    'normalize-import': 'import-done',
    'prepare-smart-patch': 'smart-patch-prepared',
    'prepare-smart-patch-model-source': 'smart-patch-model-source-prepared',
    'self-test': 'self-test-result',
  }
  const launch = report.ipcCalls.find(({ launch }) => launch === worker.launch)
  assert.ok(launch)
  const ownerIds = new Set(worker.ownerCalls.map(({ callId }) => callId))
  assert.ok(ownerIds.size > 0, 'CPU actor belongs to observed original Main request(s)')
  const actualOwner = (owners) =>
    owners
      .filter(({ callId }) => ownerIds.has(callId))
      .map(({ callId, channel }) => {
        const call = launch.calls.find((entry) => entry.callId === callId)
        assert.ok(call)
        assert.equal(call.channel, channel)
        assert.equal(call.originalCalls, 1)
        assert.equal(
          call.finished && call.delivered,
          true,
          'Original service finishes naturally before disposition assertion',
        )
        return callId
      })
  const requestIds = new Set(),
    requestSummaries = []
  let offset = 0
  for (const write of worker.writes) {
    assert.equal(write.receiverMatches, true)
    assert.equal(write.originalCalls, 1)
    assert.equal(write.thrown, undefined)
    assert.equal(
      typeof write.result,
      'boolean',
      'Original write backpressure result retained unchanged',
    )
    assert.equal(write.offset, offset)
    const bytes = stdin.subarray(write.offset, write.offset + write.bytes)
    assert.equal(bytes.length, write.bytes)
    assert.equal(digest(bytes), write.sha256)
    assert.equal(bytes.at(-1), 10)
    assert.equal(bytes.toString('utf8').trim().split('\n').length, 1)
    const request = JSON.parse(bytes)
    assert.equal(request.protocolVersion, '1')
    assert.match(request.requestId, uuidPattern)
    assert.equal(requestIds.has(request.requestId), false)
    requestIds.add(request.requestId)
    assert.ok(Object.hasOwn(replies, request.type), 'Only existing derivative protocol requests')
    assert.ok(
      cpuStackFrames(write.stack).some((frame) =>
        report.cpuCloseContract.sites.some(
          (site) =>
            frame.file === site.file &&
            frame.line >= site.requestStartLine &&
            frame.line <= site.requestEndLine &&
            [site.className, 'ProjectWorkerClient'].some(
              (name) => frame.name === name + '.request',
            ),
        ),
      ),
      'Actual stdin write originates in the frozen ProjectWorkerClient.request method',
    )
    assert.ok(
      actualOwner(write.ownerCalls).length > 0,
      'Wire request correlates to original Main owner',
    )
    const responses = messages.filter(({ requestId }) => requestId === request.requestId)
    assert.equal(responses.length, 1, 'One actual terminal reply for each original wire request')
    const response = responses[0]
    assert.ok(response.type === replies[request.type] || response.type === 'error')
    if (response.type === 'error') {
      assert.ok(
        typeof response.code === 'string' &&
          response.code.length > 0 &&
          response.code.length <= 128,
      )
      assert.ok(typeof response.message === 'string' && response.message.length <= 512)
    }
    requestSummaries.push({
      requestId: request.requestId,
      request: request.type,
      reply: response.type,
      write: write.id,
    })
    offset += write.bytes
  }
  assert.equal(offset, stdin.length, 'Every original input byte is accounted for')
  assert.equal(messages.length, requestIds.size + 1, 'No unsolicited or missing CPU response')
  const normalCloses = []
  const expectedShutdown = []
  for (const kill of worker.kills) {
    assert.equal(kill.receiverMatches, true)
    assert.equal(kill.originalCalls, 1)
    assert.equal(kill.thrown, undefined)
    assert.equal(typeof kill.result, 'boolean')
    assert.deepEqual(
      kill.args,
      [['string', 'SIGTERM']],
      'SIGKILL or an arbitrary signal is never a normal close',
    )
    const { result: _result, thrown: _thrown, ...requested } = kill
    expectedShutdown.push(
      { event: 'kill-requested', ...requested },
      { event: 'kill-returned', ...kill },
    )
    const path = cpuClosePath(kill.stack)
    if (kill.exitedBefore) {
      assert.equal(kill.result, false, 'An already-exited original child kill is a no-op')
      assert.ok(kill.sequence > worker.exitSequence)
      assert.ok(path === 'already-exited-fail' || path === 'normal-CLOSED-closeOne')
      continue
    }
    assert.equal(kill.closedBefore, false)
    assert.equal(
      path,
      'normal-CLOSED-closeOne',
      'Require actual fail(CLOSED) -> closeOne -> close stack at frozen call sites',
    )
    assert.ok(kill.sequence < worker.exitSequence)
    if (kill.identityBefore) assert.deepEqual(kill.identityBefore, worker.identity)
    assert.ok(
      actualOwner(kill.ownerCalls).length > 0,
      'Normal close stays inside the same original Main request',
    )
    assert.equal(kill.stdinBytes, stdin.length)
    assert.equal(
      kill.stdoutBytes,
      stdout.length,
      'All real replies precede close; no pending wire request is excused',
    )
    assert.ok(worker.writes.every(({ sequence }) => sequence < kill.sequence))
    normalCloses.push(kill)
  }
  expectedShutdown.push(
    {
      event: 'actual-exit',
      sequence: worker.exitSequence,
      code: worker.code,
      signal: worker.signal,
    },
    { event: 'actual-close', sequence: worker.closeSequence },
  )
  expectedShutdown.sort((a, b) => a.sequence - b.sequence)
  const shutdownBytes = readFileSync(worker.shutdown)
  assert.equal(shutdownBytes.at(-1), 10)
  assert.deepEqual(
    shutdownBytes
      .toString('utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
    expectedShutdown,
    'Complete shutdown journal independently retains every original kill request/result, raw stack and actual exit/close event',
  )
  if (worker.signal === 'SIGTERM') {
    assert.equal(worker.code, null)
    assert.equal(
      normalCloses.length,
      1,
      'Exactly one independently observed normal client close requests SIGTERM',
    )
    assert.equal(
      normalCloses[0].result,
      true,
      'Original child.kill accepted the actual normal close request',
    )
  } else {
    assert.equal(
      worker.signal,
      null,
      'Unrequested SIGTERM/SIGKILL or another terminating signal fails',
    )
    assert.equal(worker.code, 0, 'Natural CPU termination still requires code zero')
    assert.ok(normalCloses.length <= 1)
  }
  report.cpuDisposals[worker.launch + '/' + worker.id] = {
    launch: worker.launch,
    workerId: worker.id,
    identity: worker.identity,
    code: worker.code,
    signal: worker.signal,
    mode:
      worker.signal === 'SIGTERM' ? 'witnessed-original-client-CLOSED-disposal' : 'natural-code0',
    normalCloseIds: normalCloses.map(({ id }) => id),
    ownerCalls: worker.ownerCalls,
    requests: requestSummaries,
    readyOnly: requestSummaries.length === 0,
    boundary:
      'Disposal/transport evidence only; a ready-only preflight lease proves no import. Operation-specific success/error/PNG/thumbnail assertions remain separate.',
    evidence: { input: worker.stdin, output: worker.stdout, shutdown: worker.shutdown },
  }
}
async function installRuntimeAdapters() {
  assert.equal(dialogInstalled, false)
  assert.equal(spawnObserverInstalled, false)
  const launch = report.nativeLaunchAttempts
  const directory = path.join(evidenceRoot, 'worker-transport/launch-' + launch)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  activeWorkerLaunch = { launch, directory, workers: [], restored: false }
  report.cpuWorkers.push(activeWorkerLaunch)
  await application.evaluate(
    ({ dialog }, { launch, directory, title }) => {
      const fs = process.getBuiltinModule('fs')
      const cp = process.getBuiltinModule('child_process')
      const { syncBuiltinESMExports } = process.getBuiltinModule('module')
      const readIdentity = (pid) => {
        try {
          const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8')
          return { pid, start: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] }
        } catch {
          return null
        }
      }
      const groupFor = (pid) => {
        const group = fs
          .readFileSync('/proc/' + pid + '/cgroup', 'utf8')
          .trim()
          .split('\n')
          .find((line) => line.startsWith('0::'))
          ?.slice(3)
        if (!group || group === '/') throw new Error('CPU worker lacks an actual finite cgroup')
        return {
          group,
          memoryMax: fs.readFileSync('/sys/fs/cgroup' + group + '/memory.max', 'utf8').trim(),
          swapMax: fs.readFileSync('/sys/fs/cgroup' + group + '/memory.swap.max', 'utf8').trim(),
        }
      }
      globalThis.igsReferenceAdapterFaults = []
      globalThis.igsReferenceDialogQueue = []
      globalThis.igsReferenceDialogs = []
      globalThis.igsReferenceOriginalDialog = dialog.showOpenDialog
      globalThis.igsReferenceDialogObserver = function (...args) {
        const options = args.at(-1)
        // All unrelated dialogs remain the exact original pass-through; only this explicit
        // test-owned OS-selection seam is controlled. Main authorization/handler is unchanged.
        if (options?.title !== title)
          return Reflect.apply(globalThis.igsReferenceOriginalDialog, this, args)
        const selection = globalThis.igsReferenceDialogQueue.shift()
        if (!selection) {
          globalThis.igsReferenceAdapterFaults.push(
            'Unexpected regional reference dialog without a declared selection',
          )
          return Promise.reject(new Error('Missing declared reference file selection'))
        }
        globalThis.igsReferenceDialogs.push({
          launch,
          id: selection.id,
          boundary: 'Controlled OS file-selection/cancel result only',
          options: structuredClone(options),
          nativeWindowId: args.length === 2 ? args[0].id : null,
          result: structuredClone(selection.result),
        })
        return Promise.resolve(structuredClone(selection.result))
      }
      dialog.showOpenDialog = globalThis.igsReferenceDialogObserver
      globalThis.igsReferenceWorkers = []
      globalThis.igsReferenceWorkerListeners = []
      globalThis.igsReferenceOriginalSpawn = cp.spawn
      globalThis.igsReferenceSpawnObserver = function (...args) {
        // Exactly once, same this/arguments/result. No fake child, wire response or runtime status.
        const child = Reflect.apply(globalThis.igsReferenceOriginalSpawn, this, args)
        try {
          if (
            Array.isArray(args[1]) &&
            args[1].length === 3 &&
            args[1].join(' ') === '-I -m imagegen_worker'
          ) {
            const index = globalThis.igsReferenceWorkers.length
            const worker = {
              launch,
              id: index,
              pid: child.pid ?? null,
              identity: child.pid ? readIdentity(child.pid) : null,
              executable: args[0],
              args: [...args[1]],
              cwd: args[2]?.cwd ?? null,
              originalCalls: 1,
              group: child.pid ? groupFor(child.pid) : null,
              closed: false,
              exited: false,
              code: null,
              signal: null,
              ownerCalls: (globalThis.igsRegionalCalls ?? [])
                .filter((call) => call.originalCalls === 1 && !call.finished)
                .map(({ callId, channel }) => ({ callId, channel })),
              writes: [],
              kills: [],
              methodsRestored: false,
              stdin: directory + '/worker-' + index + '.stdin.jsonl',
              shutdown: directory + '/worker-' + index + '.shutdown.jsonl',
              stdout: directory + '/worker-' + index + '.stdout.jsonl',
              stderr: directory + '/worker-' + index + '.stderr.log',
            }
            fs.writeFileSync(worker.stdout, '', { flag: 'wx', mode: 0o600 })
            fs.writeFileSync(worker.stderr, '', { flag: 'wx', mode: 0o600 })
            fs.writeFileSync(worker.stdin, '', { flag: 'wx', mode: 0o600 })
            fs.writeFileSync(worker.shutdown, '', { flag: 'wx', mode: 0o600 })
            globalThis.igsReferenceWorkers.push(worker)
            let stdoutBytes = 0,
              stderrBytes = 0
            let stdinBytes = 0,
              sequence = 0
            const ownerCalls = () =>
              (globalThis.igsRegionalCalls ?? [])
                .filter((call) => call.originalCalls === 1 && !call.finished)
                .map(({ callId, channel }) => ({ callId, channel }))
            const fault = (error) => globalThis.igsReferenceAdapterFaults.push(String(error))
            const appendShutdown = (event, record) => {
              try {
                fs.appendFileSync(worker.shutdown, JSON.stringify({ event, ...record }) + '\n')
              } catch (error) {
                fault(error)
              }
            }
            const originalKill = child.kill
            const killDescriptor = Object.getOwnPropertyDescriptor(child, 'kill')
            const originalWrite = child.stdin.write
            const writeDescriptor = Object.getOwnPropertyDescriptor(child.stdin, 'write')
            const writeObserver = function (...writeArgs) {
              let record
              try {
                const bytes =
                  typeof writeArgs[0] === 'string'
                    ? Buffer.from(
                        writeArgs[0],
                        typeof writeArgs[1] === 'string' ? writeArgs[1] : 'utf8',
                      )
                    : Buffer.from(writeArgs[0])
                record = {
                  id: worker.writes.length,
                  sequence: ++sequence,
                  receiverMatches: this === child.stdin,
                  originalCalls: 1,
                  offset: stdinBytes,
                  bytes: bytes.length,
                  sha256: process
                    .getBuiltinModule('crypto')
                    .createHash('sha256')
                    .update(bytes)
                    .digest('hex'),
                  ownerCalls: ownerCalls(),
                  stack: new Error('Observed original CPU request write').stack,
                }
                worker.writes.push(record)
                stdinBytes += bytes.length
                if (stdinBytes > 8 * 1024 * 1024)
                  fault('CPU input witness exceeds bounded 8MiB; fail and retain')
                else fs.appendFileSync(worker.stdin, bytes)
              } catch (error) {
                fault(error)
              }
              try {
                // Same receiver, argument identities (including callback), result and one call.
                const result = Reflect.apply(originalWrite, this, writeArgs)
                if (record) record.result = result
                return result
              } catch (error) {
                if (record) record.thrown = { name: error.name, message: error.message }
                throw error
              }
            }
            const killObserver = function (...killArgs) {
              let record
              try {
                record = {
                  id: worker.kills.length,
                  sequence: ++sequence,
                  args: killArgs.map((value) =>
                    value === undefined
                      ? ['undefined']
                      : value === null
                        ? ['null']
                        : [typeof value, typeof value === 'number' ? String(value) : value],
                  ),
                  receiverMatches: this === child,
                  originalCalls: 1,
                  identityBefore: child.pid ? readIdentity(child.pid) : null,
                  exitedBefore: worker.exited,
                  closedBefore: worker.closed,
                  codeBefore: child.exitCode,
                  signalBefore: child.signalCode,
                  stdinBytes,
                  stdoutBytes,
                  ownerCalls: ownerCalls(),
                  stack: new Error('Observed original CPU child.kill call').stack,
                }
                worker.kills.push(record)
                appendShutdown('kill-requested', record)
              } catch (error) {
                fault(error)
              }
              try {
                // Observation never requests a signal itself or changes the production request.
                const result = Reflect.apply(originalKill, this, killArgs)
                if (record) {
                  record.result = result
                  appendShutdown('kill-returned', record)
                }
                return result
              } catch (error) {
                if (record) {
                  record.thrown = { name: error.name, message: error.message }
                  appendShutdown('kill-threw', record)
                }
                throw error
              }
            }
            child.kill = killObserver
            child.stdin.write = writeObserver
            const output = (stream, bytes) => {
              try {
                if (stream === 'stdout') stdoutBytes += bytes.length
                else stderrBytes += bytes.length
                if (stdoutBytes > 8 * 1024 * 1024 || stderrBytes > 1024 * 1024) {
                  globalThis.igsReferenceAdapterFaults.push(
                    'Bounded worker transport exceeded; root retains actor/payload and reviews the failed run',
                  )
                  return
                }
                fs.appendFileSync(worker[stream], bytes)
              } catch (error) {
                globalThis.igsReferenceAdapterFaults.push(String(error))
              }
            }
            const onOutput = (bytes) => output('stdout', bytes),
              onErrorOutput = (bytes) => output('stderr', bytes)
            child.stdout.on('data', onOutput)
            child.stderr.on('data', onErrorOutput)
            globalThis.igsReferenceWorkerListeners.push({
              child,
              onOutput,
              onErrorOutput,
              originalKill,
              killDescriptor,
              killObserver,
              originalWrite,
              writeDescriptor,
              writeObserver,
            })
            child.once('spawn', () => {
              try {
                worker.identity ??= readIdentity(child.pid)
                worker.group ??= groupFor(child.pid)
              } catch (error) {
                globalThis.igsReferenceAdapterFaults.push(String(error))
              }
            })
            child.once('error', (error) => {
              worker.error = { name: error.name, message: error.message }
            })
            child.once('exit', (code, signal) => {
              worker.exited = true
              worker.code = code
              worker.signal = signal
              worker.exitSequence = ++sequence
              appendShutdown('actual-exit', { sequence: worker.exitSequence, code, signal })
            })
            child.once('close', () => {
              worker.closed = true
              worker.closeSequence = ++sequence
              appendShutdown('actual-close', { sequence: worker.closeSequence })
            })
          }
        } catch (error) {
          globalThis.igsReferenceAdapterFaults.push(String(error))
        }
        return child
      }
      cp.spawn = globalThis.igsReferenceSpawnObserver
      syncBuiltinESMExports()
    },
    { launch, directory, title: adapter.dialogTitle },
  )
  dialogInstalled = true
  spawnObserverInstalled = true
  checkpoint()
}
async function runtimeAdapterState({ validate = true } = {}) {
  const state = await bounded(
    application.evaluate(() => ({
      faults: globalThis.igsReferenceAdapterFaults,
      dialogs: globalThis.igsReferenceDialogs,
      queued: globalThis.igsReferenceDialogQueue.length,
      workers: globalThis.igsReferenceWorkers,
    })),
    4000,
    'Main CPU/dialog observer state',
  )
  activeWorkerLaunch.workers = state.workers
  for (const worker of state.workers) {
    if (worker.identity)
      observed.set(worker.identity.pid + ':' + worker.identity.start, worker.identity)
    if (!validate) continue
    assert.equal(worker.originalCalls, 1)
    assert.deepEqual(worker.args, ['-I', '-m', 'imagegen_worker'])
    assert.ok(worker.group)
    assert.match(worker.group.memoryMax, /^\d+$/)
    assert.ok(BigInt(worker.group.memoryMax) <= 2n * 1024n ** 3n)
    assert.equal(worker.group.swapMax, '0')
    const knownGroups = new Set([
      report.launcher.group,
      ...report.resourceLimitChecks.flatMap(({ groups }) => groups.map(({ group }) => group)),
    ])
    assert.ok(
      knownGroups.has(worker.group.group),
      'CPU child inherits a verified actual bounded group',
    )
  }
  if (validate)
    assert.deepEqual(
      state.faults,
      [],
      'Pass-through instrumentation must not change or lose production evidence',
    )
  return state
}
async function queueDialog(file = null) {
  const id = randomUUID()
  if (file !== null) {
    assert.ok(
      file.startsWith(externalInputsRoot + path.sep),
      'Only declared owned input fixtures can be selected',
    )
    assert.ok(
      report.externalInputs.some((entry) => entry.path === file),
      'Selection requires retained raw source bytes',
    )
  }
  const result = { canceled: file === null, filePaths: file === null ? [] : [file] }
  const state = await runtimeAdapterState()
  assert.equal(state.queued, 0, 'One file per Add; no stray queued reply')
  await application.evaluate(
    (_, selection) => {
      globalThis.igsReferenceDialogQueue.push(selection)
    },
    { id, result },
  )
  return { id, result, dialogOffset: state.dialogs.length, workerOffset: state.workers.length }
}
async function settleCpu(label, { healthy = true } = {}) {
  await drainOriginalCalls()
  await expect
    .poll(async () => (await runtimeAdapterState()).workers.filter(({ closed }) => !closed).length)
    .toBe(0)
  const state = await runtimeAdapterState()
  for (const worker of state.workers) {
    assert.ok(
      worker.identity,
      'Actual CPU PID/start identity required, including short-lived actors',
    )
    assert.equal(
      identity(worker.identity.pid)?.start === worker.identity.start,
      false,
      'Physical CPU exit',
    )
    if (healthy) {
      assertCpuDisposal(worker)
    }
  }
  captureWorkerBytecode(label)
  return state
}
function workerMessages(worker) {
  const bytes = readFileSync(worker.stdout)
  assert.ok(
    bytes.length > 0 && bytes.at(-1) === 10,
    'Complete actual CPU JSONL, no fabricated ready/output',
  )
  return bytes
    .toString('utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
}
function assertCpuImport(workers, { failed = false } = {}) {
  assert.ok(workers.length > 0, 'Real CPU worker children are required')
  const dependency = report.workerDependencyWitness
  assert.ok(dependency, 'Captured configured executable and interpreter identity are required')
  const messages = workers.flatMap((worker) => {
    // Preserve the configured virtualenv path as the spawn argument; resolve only for identity.
    assert.equal(
      worker.executable,
      dependency.executable,
      'Original spawn uses the exact configured development executable path',
    )
    const interpreter = realpathSync(worker.executable)
    assert.equal(
      interpreter,
      dependency.interpreter,
      'Recorded executable resolves to captured interpreter',
    )
    assert.equal(
      digest(readFileSync(interpreter)),
      dependency.interpreterSha256,
      'Recorded executable resolves to the exact captured interpreter bytes',
    )
    const messages = workerMessages(worker)
    const ready = messages.find(({ type }) => type === 'ready')
    assert.ok(ready, 'Real ready received')
    assert.equal(ready.pythonVersion, '3.12.13')
    assert.equal(ready.workerVersion, '0.1.0')
    assert.equal(ready.runtimeProfile, 'derivatives-only')
    assert.ok(ready.capabilities.includes('import-normalization'))
    assert.ok(ready.capabilities.includes('import-thumbnail'))
    return messages
  })
  if (failed)
    assert.ok(
      messages.some(({ type }) => type === 'error'),
      'Actual worker decode/unsupported-image failure',
    )
  else {
    assert.ok(
      messages.some(({ type }) => type === 'import-done'),
      'Actual CPU normalization response',
    )
    assert.ok(
      messages.some(({ type }) => type === 'import-thumbnail-done'),
      'Actual new CPU thumbnail response',
    )
  }
  return messages
}
function captureWorkerBytecode(label) {
  const directory = path.join(root, 'worker-python/src/imagegen_worker')
  const entries = filesBelow(directory)
    .filter((file) => file.endsWith('.pyc'))
    .map((file) => {
      const bytes = readFileSync(file),
        name = path.basename(file).replace(/\.cpython-\d+(?:\.opt-\d+)?\.pyc$/, '.py')
      const source = path.join(path.dirname(path.dirname(file)), name)
      assert.ok(existsSync(source), 'Every retained worker bytecode maps to its retained source')
      const kept = keepObject(bytes, 'Actual worker bytecode ' + path.relative(root, file))
      return {
        path: file,
        sha256: kept.sha256,
        retained: kept.path,
        bytes: bytes.length,
        headerHex: bytes.subarray(0, 16).toString('hex'),
        source,
        sourceSha256: digest(readFileSync(source)),
        interpreter: report.workerDependencyWitness?.interpreter ?? null,
      }
    })
  report.workerBytecodeWitnesses.push({
    label,
    entries,
    boundary:
      'Retained complete candidate bytecode before/after real CPU operations, mapped by exact path/source/interpreter. This is byte retention, not a claim that all candidate cache files were imported or compile-equivalent.',
  })
  checkpoint()
}
function captureWorkerDependencies() {
  const environment = path.join(root, 'worker-python/.venv')
  const executable = path.join(environment, 'bin/python')
  const interpreter = realpathSync(executable)
  const metadata = []
  const paths = [path.join(environment, 'pyvenv.cfg')]
  const libraries = readdirSync(path.join(environment, 'lib'), { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && /^python3\.12$/.test(entry.name),
  )
  assert.equal(libraries.length, 1)
  const packages = path.join(environment, 'lib', libraries[0].name, 'site-packages')
  for (const entry of readdirSync(packages, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      /imagegen_worker|editable/.test(entry.name) &&
      /\.(pth|py)$/.test(entry.name)
    )
      paths.push(path.join(packages, entry.name))
    if (entry.isDirectory() && /^(pillow|imagegen_worker)-.*\.dist-info$/i.test(entry.name))
      for (const filename of [
        'METADATA',
        'direct_url.json',
        'INSTALLER',
        'RECORD',
        'entry_points.txt',
      ])
        if (existsSync(path.join(packages, entry.name, filename)))
          paths.push(path.join(packages, entry.name, filename))
  }
  assert.ok(
    paths.some((file) => /pillow-.*METADATA$/i.test(file)),
    'Retain actual Pillow version metadata',
  )
  assert.ok(
    paths.some((file) => /imagegen_worker-.*METADATA$/i.test(file)),
    'Retain actual editable worker metadata',
  )
  for (const file of paths) {
    if (file.endsWith('/METADATA')) {
      const metadataText = readFileSync(file, 'utf8')
      const expectedVersion = /pillow-/i.test(file) ? '12.2.0' : '0.1.0'
      assert.ok(
        metadataText.split(/\r?\n/).includes('Version: ' + expectedVersion),
        'Actual reusable dependency metadata matches the declared version',
      )
    }
    const kept = keepObject(
      readFileSync(file),
      'Protected reusable worker dependency metadata ' + file,
    )
    metadata.push({ path: file, retained: kept.path, sha256: kept.sha256 })
  }
  report.workerDependencyWitness = {
    executable,
    interpreter,
    interpreterSha256: digest(readFileSync(interpreter)),
    metadata,
    metadataOnlyBeforeExecution: true,
    protectedDependencies: [environment, path.join(root, 'node_modules'), interpreter],
    versionsExpected: { python: '3.12.13', pillow: '12.2.0', worker: '0.1.0' },
    boundary:
      'Exact dependency/interpreter identity plus actual subsequent ready/operation output. No environment provisioning, copying or removal.',
  }
  lifecycle.dependsOn.push(
    ...report.workerDependencyWitness.protectedDependencies.map((file) => ({
      path: file,
      reason: 'Protected external reusable runtime/package dependency; no runner cleanup',
    })),
  )
  captureWorkerBytecode('before-first-native-launch')
}
async function restoreDialog() {
  if (!dialogInstalled || !application) return
  const state = await runtimeAdapterState({ validate: false })
  const restored = await application.evaluate(({ dialog }) => {
    if (dialog.showOpenDialog !== globalThis.igsReferenceDialogObserver)
      throw new Error('Dialog observer ownership changed')
    const queued = structuredClone(globalThis.igsReferenceDialogQueue)
    dialog.showOpenDialog = globalThis.igsReferenceOriginalDialog
    globalThis.igsReferenceDialogQueue = []
    if (dialog.showOpenDialog !== globalThis.igsReferenceOriginalDialog)
      throw new Error('Exact dialog function restoration failed')
    return {
      exactOriginalRestored: true,
      queuedUnconsumed: queued,
      faultGatesInstalled: 0,
      faultGatesArmed: 0,
    }
  })
  report.dialogSelections.push({ launch: activeWorkerLaunch.launch, selections: state.dialogs })
  report.dialogRestorations.push(restored)
  dialogInstalled = false
  checkpoint()
  assert.equal(state.queued, 0, 'Successful flow consumes every deliberately controlled selection')
  assert.deepEqual(state.faults, [], 'Dialog was restored even when adapter diagnostics failed')
}
async function restoreSpawnObserver() {
  if (!spawnObserverInstalled || !application) return
  let drainError
  try {
    await settleCpu('before-spawn-observer-restoration')
  } catch (error) {
    drainError = error
  }
  const state = await runtimeAdapterState({ validate: false })
  const restored = await application.evaluate(() => {
    const cp = process.getBuiltinModule('child_process')
    const failures = [],
      methods = []
    if (cp.spawn !== globalThis.igsReferenceSpawnObserver)
      failures.push('Spawn observer ownership changed')
    else {
      cp.spawn = globalThis.igsReferenceOriginalSpawn
      process.getBuiltinModule('module').syncBuiltinESMExports()
    }
    const restoreMethod = (target, key, observer, original, descriptor) => {
      if (target[key] !== observer && target[key] !== original)
        throw new Error('Worker method observer ownership changed: ' + key)
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else if (!Reflect.deleteProperty(target, key))
        throw new Error('Worker own-method removal failed: ' + key)
      const actual = Object.getOwnPropertyDescriptor(target, key)
      const sameDescriptor = descriptor
        ? actual &&
          Reflect.ownKeys(descriptor).length === Reflect.ownKeys(actual).length &&
          Reflect.ownKeys(descriptor).every((name) => descriptor[name] === actual[name])
        : actual === undefined
      if (target[key] !== original || !sameDescriptor)
        throw new Error('Exact original worker method/reference not restored: ' + key)
      return true
    }
    for (const [
      index,
      {
        child,
        onOutput,
        onErrorOutput,
        originalKill,
        killDescriptor,
        killObserver,
        originalWrite,
        writeDescriptor,
        writeObserver,
      },
    ] of globalThis.igsReferenceWorkerListeners.entries()) {
      const record = { workerId: index, killRestored: false, writeRestored: false }
      // Restore every owned method independently, including already-dead children and error
      // leases. No renderer frame, successful health assertion or next method is a prerequisite.
      try {
        record.killRestored = restoreMethod(
          child,
          'kill',
          killObserver,
          originalKill,
          killDescriptor,
        )
      } catch (error) {
        failures.push(String(error))
      }
      try {
        record.writeRestored = restoreMethod(
          child.stdin,
          'write',
          writeObserver,
          originalWrite,
          writeDescriptor,
        )
      } catch (error) {
        failures.push(String(error))
      }
      globalThis.igsReferenceWorkers[index].methodsRestored =
        record.killRestored && record.writeRestored
      methods.push(record)
      // A failing child still needs its output retained through physical exit. Restoring spawn
      // itself is independent; closed children no longer need our extra stream listeners.
      if (globalThis.igsReferenceWorkers[index].closed) {
        child.stdout.off('data', onOutput)
        child.stderr.off('data', onErrorOutput)
      }
    }
    if (cp.spawn !== globalThis.igsReferenceOriginalSpawn)
      failures.push('Exact spawn restoration failed')
    return {
      exactOriginalRestored: cp.spawn === globalThis.igsReferenceOriginalSpawn,
      exactWorkerMethodsRestored:
        methods.length === globalThis.igsReferenceWorkers.length &&
        methods.every(({ killRestored, writeRestored }) => killRestored && writeRestored),
      methods,
      failures,
      allKnownCpuClosed: globalThis.igsReferenceWorkers.every(({ closed }) => closed),
      workerCount: globalThis.igsReferenceWorkers.length,
    }
  })
  const finalState = await runtimeAdapterState({ validate: false })
  assert.equal(
    state.workers.length,
    finalState.workers.length,
    'No CPU child escapes restoration inventory',
  )
  for (const worker of finalState.workers)
    for (const file of [worker.stdin, worker.stdout, worker.stderr, worker.shutdown]) {
      if (!worker.closed) continue
      const bytes = readFileSync(file)
      report.snapshots.push({ path: file, bytes: bytes.length, sha256: digest(bytes) })
    }
  report.spawnRestorations.push(restored)
  activeWorkerLaunch.restored =
    restored.exactOriginalRestored && restored.exactWorkerMethodsRestored
  spawnObserverInstalled = !restored.exactOriginalRestored
  checkpoint()
  assert.deepEqual(restored.failures, [])
  assert.equal(restored.exactWorkerMethodsRestored, true)
  assert.equal(restored.allKnownCpuClosed, true)
  if (drainError) throw drainError
}
async function restoreAll() {
  // Each restoration is attempted even if another fails. No frame callback is a dependency.
  const errors = []
  for (const [name, operation] of [
    ['prompt/fault gate', restorePromptGate],
    ['IPC drain', drainOriginalCalls],
    ['dialog', restoreDialog],
    ['spawn', restoreSpawnObserver],
    ['original Main handlers', restoreObserver],
  ]) {
    try {
      await operation()
    } catch (error) {
      errors.push({ name, message: String(error) })
    }
  }
  if (errors.length) {
    report.independentRestorationFailures = errors
    checkpoint()
    throw new Error('Independent restoration failed: ' + JSON.stringify(errors))
  }
}

async function capturePromptMounts() {
  await window.evaluate(() => {
    globalThis.igsReferencePromptMounts = [
      ...document.querySelectorAll('[data-regional-guidance-id] .cm-content'),
    ].map((node) => ({
      node,
      parent: node.closest('[data-regional-guidance-id]'),
      label: node.ariaLabel,
      text: node.textContent,
    }))
  })
}
async function assertPromptMounts() {
  const state = await window.evaluate(() =>
    (globalThis.igsReferencePromptMounts ?? []).map(({ node, parent, label, text }) => ({
      label,
      connected: node.isConnected,
      sameParent: node.closest('[data-regional-guidance-id]') === parent,
      sameText: node.textContent === text,
    })),
  )
  assert.ok(state.length > 0, 'Actual regional prompt mounts are present')
  assert.ok(
    state.every(({ connected, sameParent, sameText }) => connected && sameParent && sameText),
    'Reference edits preserve mounted regional prompts',
  )
  return state
}
function assertReferenceSelection(before, after, label) {
  assert.deepEqual(after.ui, before.ui, label + ': selection, Smart target and camera stay exact')
  assert.deepEqual(after.liveDocument.generationDraft, before.liveDocument.generationDraft)
  assert.deepEqual(after.liveDocument.layers, before.liveDocument.layers)
  for (const original of before.liveDocument.regionalGuidance ?? []) {
    const next = after.liveDocument.regionalGuidance.find(({ id }) => id === original.id)
    if (next)
      for (const key of ['mask', 'prompts', 'enabled', 'locked', 'name', 'overlayOpacity'])
        assert.deepEqual(next[key], original[key], label + ': same-owner regional ' + key)
  }
}
async function referenceViewport() {
  return view().evaluate((root) => {
    const area = root.querySelector('.canvas-area'),
      stage = area?.querySelector('.konvajs-content'),
      notices = root.querySelector('.project-notices')
    if (!area || !stage || !notices) throw new Error('Actual reference viewport is required')
    const rect = (node) => {
      const r = node.getBoundingClientRect()
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      }
    }
    const style = getComputedStyle(notices)
    return {
      window: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      host: rect(area),
      stage: { width: parseFloat(stage.style.width), height: parseFloat(stage.style.height) },
      camera: { x: area.dataset.cameraX, y: area.dataset.cameraY, scale: area.dataset.cameraScale },
      notices: {
        ...rect(notices),
        paddingTop: parseFloat(style.paddingTop),
        paddingBottom: parseFloat(style.paddingBottom),
        gap: parseFloat(style.rowGap),
        alerts: [...notices.querySelectorAll('[role="alert"]')].map((alert) => ({
          title: alert.querySelector('.n-alert-body__title')?.textContent?.trim() ?? null,
          height: alert.getBoundingClientRect().height,
        })),
      },
    }
  })
}
function assertReferenceViewport(before, after, from, to, label) {
  ;(report.referenceViewportTransitions ??= []).push({ label, before: from, after: to })
  checkpoint()
  const close = (actual, expected, reason) =>
    assert.ok(Math.abs(actual - expected) < 0.01, reason + ': ' + actual + ' vs ' + expected)
  assert.deepEqual(from.camera, before.ui.camera)
  assert.deepEqual(to.camera, after.ui.camera)
  assert.deepEqual(to.window, from.window, 'Import does not resize the native window')
  for (const key of ['left', 'right', 'width', 'bottom'])
    close(to.host[key], from.host[key], 'Unchanged Canvas ' + key)
  for (const layout of [from, to]) {
    assert.ok(layout.stage.width > 0 && layout.stage.height > 0)
    assert.ok(layout.notices.alerts.length <= 1)
    assert.ok(layout.notices.alerts.every(({ title }) => title === 'Project action failed'))
    const contents = layout.notices.alerts.reduce((sum, { height }) => sum + height, 0)
    close(
      layout.notices.height,
      contents +
        layout.notices.paddingTop +
        layout.notices.paddingBottom +
        Math.max(0, layout.notices.alerts.length - 1) * layout.notices.gap,
      'Actual notice height is fully accounted by the measured error alert and padding',
    )
  }
  const noticeDelta = to.notices.height - from.notices.height,
    widthDelta = to.stage.width - from.stage.width,
    heightDelta = to.stage.height - from.stage.height
  close(widthDelta, 0, 'Error feedback does not change Canvas width')
  close(to.notices.top, from.notices.top, 'Error notice stack keeps its origin')
  close(to.host.top - from.host.top, noticeDelta, 'Canvas moves only by measured notice flow')
  close(heightDelta, -noticeDelta, 'Canvas height changes only by measured notice flow')
  assert.equal(to.camera.scale, from.camera.scale, 'Manual viewport retains its exact scale')
  const expectedCamera = {
    x: String(Number(from.camera.x) + widthDelta / 2),
    y: String(Number(from.camera.y) + heightDelta / 2),
    scale: from.camera.scale,
  }
  assert.deepEqual(
    to.camera,
    expectedCamera,
    'Exact production resize-centre law; no extra camera move',
  )
  for (const axis of ['x', 'y']) {
    const dimension = axis === 'x' ? 'width' : 'height'
    close(
      (to.stage[dimension] / 2 - Number(to.camera[axis])) / Number(to.camera.scale),
      (from.stage[dimension] / 2 - Number(from.camera[axis])) / Number(from.camera.scale),
      'Same world point stays at the Canvas centre: ' + axis,
    )
  }
  // This expected camera is derived from independent measured viewport geometry, never copied
  // from the observed camera. All document/history/SQL/files/selection fields stay exact.
  return { ...before, ui: { ...before.ui, camera: expectedCamera } }
}
async function importUi(
  id,
  source,
  { cancel = false, error = false, label = source?.name ?? 'Dialog cancellation' } = {},
) {
  await neutral()
  await settleCpu(label + '-before')
  const add = addReferenceButton(id)
  await expect(add).toBeEnabled()
  await add.scrollIntoViewIfNeeded()
  await capturePromptMounts()
  const before = await witness()
  const viewportBefore = await referenceViewport()
  const selection = await queueDialog(cancel ? null : source.path)
  const sourceBefore = cancel ? null : sourceIdentity(source.path)
  await add.click()
  // The original import's terminal event, not a fixed timeout or frame, proves operation settlement.
  await expect
    .poll(async () => {
      const delta = mutationsSince(before.mutations, await mutations())
      return delta.some(
        (call) =>
          call.channel === adapter.channels.importReference && call.finished && call.delivered,
      )
    })
    .toBe(true)
  await idle()
  await expect(add).toBeEnabled()
  await expect(add).toBeFocused()
  const after = await witness()
  const state = await settleCpu(label + '-after')
  const viewportAfter = await referenceViewport()
  const beforeAtSameViewport = assertReferenceViewport(
    before,
    after,
    viewportBefore,
    viewportAfter,
    label,
  )
  if (!error)
    assert.equal(
      viewportAfter.notices.alerts.length,
      0,
      'Successful import or Cancel clears previous Project action error feedback',
    )
  assert.equal(state.queued, 0)
  assert.equal(state.dialogs.length, selection.dialogOffset + 1)
  const selected = state.dialogs.at(-1)
  assert.equal(selected.id, selection.id)
  assert.deepEqual(selected.result, selection.result)
  assert.deepEqual(selected.options, {
    filters: [{ extensions: ['png', 'jpg', 'jpeg', 'webp'], name: 'Images' }],
    properties: ['openFile'],
    title: adapter.dialogTitle,
  })
  assert.ok(Number.isSafeInteger(selected.nativeWindowId) && selected.nativeWindowId > 0)
  if (sourceBefore)
    assert.deepEqual(
      sourceIdentity(source.path),
      sourceBefore,
      'Authorized source bytes/stat identity are immutable',
    )
  const delta = mutationsSince(before.mutations, after.mutations)
  mutationDelta(
    before,
    after,
    [
      { channel: ipcChannels.projects.sealPromptHistory, args: [before.tab.id, null] },
      {
        channel: adapter.channels.importReference,
        args: [before.tab.id, entityOwner(before.tab, id)],
        ok: !error,
      },
    ],
    label + ': exact seal and original import',
  )
  for (const call of delta) assert.equal(call.originalCalls, 1)
  const importCall = delta.at(-1)
  const reply = callResponse(importCall),
    temporalWorkers = state.workers.slice(selection.workerOffset),
    workers = [],
    backgroundWorkers = []
  const importLaunch = report.ipcCalls.find(({ launch }) => launch === importCall.launch)
  assert.ok(importLaunch, 'Exact import launch registry is required')
  const launchCalls = importLaunch.calls
  const readChannels = new Set([
    ipcChannels.projects.getGenerationTargetState,
    ipcChannels.projects.getSmartPatchVariants,
    ipcChannels.projects.getSmartPatchGenerationTargetState,
  ])
  for (const worker of temporalWorkers) {
    const requests = readFileSync(worker.stdin, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line).type)
    const owners = [...worker.ownerCalls, ...worker.writes.flatMap(({ ownerCalls }) => ownerCalls)]
    const importOwned = owners.some(({ callId }) => callId === importCall.callId)
    const importWork = requests.some(
      (type) => type === 'normalize-import' || type === 'create-import-thumbnail',
    )
    if (importOwned || importWork) {
      assert.equal(
        importOwned,
        true,
        'Every import CPU request belongs to this exact original import',
      )
      workers.push(worker)
      continue
    }
    // A renderer refresh can inspect the selected Smart after a cancelled Add. Time alone
    // does not make its CPU child an import child. Retain and validate every such read instead
    // of dropping it; the shared disposal/wire validator already checks every actual worker.
    assert.ok(owners.length > 0)
    for (const owner of owners) {
      const call = launchCalls.find(({ callId }) => callId === owner.callId)
      assert.ok(call)
      assert.equal(call.channel, owner.channel)
      assert.ok(readChannels.has(call.channel), 'Only the existing read-only target/variant owners')
      assert.equal(call.args[0], before.tab.id)
      assert.ok(call.args.includes(before.tab.documentId))
      assert.equal(call.originalCalls, 1)
      assert.equal(call.finished && call.delivered, true)
      if (call.ok !== true) {
        // A read started at the exact pre-import revision can lose its epoch while the
        // successful import publishes. The renderer requests the new revision immediately.
        // Accept only that specific fenced read plus its successful current counterpart.
        assert.equal(call.channel, ipcChannels.projects.getSmartPatchVariants)
        assert.deepEqual(call.error, {
          code: 'EDIT_CONFLICT',
          message: 'The Project changed while checking its variants. Refresh the browser.',
        })
        assert.notEqual(before.tab.documentRevision, after.tab.documentRevision)
        assert.equal(call.args[3], before.tab.documentRevision)
        const replacementArgs = [...call.args.slice(0, 3), after.tab.documentRevision]
        const replacement = launchCalls.find(
          (candidate) =>
            candidate.channel === call.channel &&
            candidate.id > call.id &&
            JSON.stringify(candidate.args) === JSON.stringify(replacementArgs) &&
            candidate.originalCalls === 1 &&
            candidate.finished &&
            candidate.delivered &&
            candidate.ok === true,
        )
        assert.ok(
          replacement,
          'The superseded variants read has an actual successful current reply',
        )
        ;(report.supersededReferenceReads ??= []).push({
          importCallId: importCall.callId,
          refusedCallId: call.callId,
          refusal: call.error,
          replacementCallId: replacement.callId,
          beforeRevision: before.tab.documentRevision,
          afterRevision: after.tab.documentRevision,
        })
      }
    }
    assert.equal(importWork, false, 'Background reads cannot hide normalization or thumbnail work')
    backgroundWorkers.push({ id: worker.id, owners, requests })
  }
  ;(report.referenceWorkerAttributions ??= []).push({
    launch: importCall.launch,
    importCallId: importCall.callId,
    temporalWorkerIds: temporalWorkers.map(({ id }) => id),
    importWorkerIds: workers.map(({ id }) => id),
    backgroundWorkers,
    boundary:
      'Every temporal CPU child remains validated. Only exact original import ownership is counted as import work; unrelated read-only target/variant work is separately retained.',
  })
  let stored = null,
    bytes = null,
    cpuBinding = null
  if (cancel || error) {
    if (cancel) {
      assert.deepEqual(reply, { ok: true, value: null })
      assert.equal(workers.length, 0, 'Cancel starts no import-owned CPU actor or import work')
    } else {
      assert.equal(reply.ok, false)
      assertCpuImport(workers, { failed: true })
      // Naive renders the title as a div inside role=alert. Require its exact visible
      // title and the returned Main error text rather than inventing a heading role.
      const actionAlert = view()
        .getByRole('alert')
        .filter({
          has: window.getByText('Project action failed', { exact: true }),
        })
      await expect(actionAlert).toHaveCount(1)
      await expect(actionAlert.getByText('Project action failed', { exact: true })).toBeVisible()
      await expect(actionAlert.getByText(reply.error.message, { exact: true })).toBeVisible()
    }
    assert.deepEqual(
      { ...after, mutations: [] },
      { ...beforeAtSameViewport, mutations: [] },
      'Settled cancel/error leaves all data and world-centre selection exact; only measured notice-flow resize is allowed',
    )
    await unchanged(after, label + ': independent post-settlement no-effect recheck')
  } else {
    const messages = assertCpuImport(workers)
    const references = region(after.liveDocument, id).referenceImages
    assert.equal(
      references.length,
      (region(before.liveDocument, id).referenceImages?.length ?? 0) + 1,
    )
    stored = references.at(-1)
    const normalized = messages.filter(({ type }) => type === 'import-done')
    const thumbnails = messages.filter(({ type }) => type === 'import-thumbnail-done')
    assert.equal(normalized.length, 1, 'Exactly one real CPU normalizer result for this Add')
    assert.equal(thumbnails.length, 1, 'Exactly one new CPU thumbnail result for this Add')
    for (const [actual, member] of [
      [normalized[0].normalized, stored.asset],
      [thumbnails[0].thumbnail, stored.thumbnail],
    ]) {
      assert.deepEqual(
        {
          byteSize: actual.byteSize,
          width: actual.width,
          height: actual.height,
          sha256: actual.sha256,
        },
        {
          byteSize: member.bytes,
          width: member.width,
          height: member.height,
          sha256: member.sha256,
        },
      )
      assert.equal(actual.colorSpace, 'srgb')
    }
    assert.equal(normalized[0].sourceFormat, stored.sourceFormat)
    assert.deepEqual(
      normalized[0].originalIcc,
      stored.sourceIccProfile
        ? { byteSize: stored.sourceIccProfile.bytes, sha256: stored.sourceIccProfile.sha256 }
        : null,
    )
    cpuBinding = {
      normalizedRequestId: normalized[0].requestId,
      thumbnailRequestId: thumbnails[0].requestId,
      assetSha256: stored.asset.sha256,
      thumbnailSha256: stored.thumbnail.sha256,
      sourceFormat: stored.sourceFormat,
    }
    assert.equal(stored.name, source.name)
    assert.equal(stored.sourceFormat, source.sourceFormat)
    assert.equal(ownedIds(before.liveDocument).includes(stored.id), false, 'Fresh reference UUID')
    assert.deepEqual([stored.asset.width, stored.asset.height], [source.width, source.height])
    imageOracles.set(stored.asset.sha256, source)
    bytes = await verifyReferenceBytes(stored, (member) => memberBytes(after, member))
    exactRegionalChange(
      before,
      after,
      (expected) => {
        const owner = expected.regionalGuidance.find(({ id: regionId }) => regionId === id)
        owner.referenceImages = [...(owner.referenceImages ?? []), clone(stored)]
      },
      label + ': only the appended owned attachment changes',
    )
    assert.deepEqual(
      reply,
      { ok: true, value: after.tab },
      'Retained original Main acknowledgement equals actual owner',
    )
    await renderedReference(after.tab, id, region(after.tab, id).referenceImages.at(-1))
  }
  assertReferenceSelection(beforeAtSameViewport, after, label)
  const mounts = await assertPromptMounts()
  const record = {
    label,
    id,
    before,
    after,
    selection: selected,
    viewportBefore,
    viewportAfter,
    workers: workers.map(({ id, identity, stdout }) => ({ id, identity, stdout })),
    cancel,
    error,
    stored,
    bytes,
    cpuBinding,
    mounts,
  }
  report.referenceImports.push(record)
  checkpoint()
  return record
}
async function oneReferenceHistory(result) {
  const undone = await historyUi('undo', result.before.liveDocument)
  assert.equal(
    content(undone.liveDocument)
      .regionalGuidance.find(({ id }) => id === result.id)
      .referenceImages?.some(({ id }) => id === result.stored.id) ?? false,
    false,
  )
  const redone = await historyUi('redo', result.after.liveDocument)
  const reference = region(redone.tab, result.id).referenceImages.find(
    ({ id }) => id === result.stored.id,
  )
  await verifyReferenceBytes(reference, (member) => memberBytes(redone, member))
  return redone
}
function applyReferenceChange(document, id, change) {
  const owner = document.regionalGuidance.find(({ id: regionId }) => regionId === id)
  const references = [...owner.referenceImages]
  const index = references.findIndex(({ id }) => id === change.referenceId)
  assert.ok(index >= 0)
  const [reference] = references.splice(index, 1)
  if (change.kind === 'move') references.splice(change.targetIndex, 0, reference)
  if (references.length) owner.referenceImages = references
  else delete owner.referenceImages
}
async function tabTo(target) {
  await neutral('Settle any focused prompt before keyboard traversal')
  await target.scrollIntoViewIfNeeded()
  const before = await witness(),
    blurred = []
  let reached = false
  for (let index = 0; index < 180; index++) {
    if (await target.evaluate((node) => node === document.activeElement)) {
      reached = true
      break
    }
    const focused = await window.evaluate(() => {
      const node = document.activeElement
      return node?.matches('.cm-content')
        ? {
            label: node.ariaLabel,
            regionId:
              node
                .closest('[data-regional-guidance-id]')
                ?.getAttribute('data-regional-guidance-id') ?? null,
          }
        : null
    })
    await window.keyboard.press('Tab')
    if (focused) blurred.push(focused)
  }
  assert.equal(reached, true, 'Real keyboard traversal reaches enabled reference control')
  await drainObserver()
  const after = await witness(),
    actual = mutationsSince(before.mutations, after.mutations)
  assert.equal(
    actual.length,
    blurred.length,
    'Every keyboard-crossed prompt blur owns exactly one accounted seal',
  )
  for (let i = 0; i < actual.length; i++) {
    const call = actual[i],
      owner = blurred[i]
    assert.equal(call.channel, ipcChannels.projects.sealPromptHistory)
    assert.equal(call.args[0], before.tab.id)
    assert.equal(call.args.length, 2)
    if (owner.regionId) {
      const polarity = owner.label === adapter.positive ? 'positive' : 'negative'
      assert.match(
        call.args[1],
        new RegExp('^regional:' + owner.regionId + ':' + polarity + ':[a-f0-9-]{36}$'),
      )
    } else assert.match(call.args[1], uuidPattern)
    assert.equal(call.originalCalls, 1)
    assert.equal(call.finished && call.delivered && call.ok, true)
    assert.deepEqual(callResponse(call), { ok: true, value: after.tab })
  }
  assert.deepEqual(
    { ...after, mutations: [] },
    { ...before, mutations: [] },
    'Keyboard traversal is focus-only',
  )
  const record = {
    label: 'Real Tab traversal with exact prompt-blur seals',
    before,
    after,
    blurred,
    actual,
  }
  ;(report.keyboardTraversals ??= []).push(record)
  checkpoint()
  return record
}
async function referenceChangeUi(id, change, label) {
  await neutral()
  const currentTab = await current()
  const reference = region(currentTab, id).referenceImages.find(
    ({ id }) => id === change.referenceId,
  )
  const index = region(currentTab, id).referenceImages.findIndex(
    ({ id }) => id === change.referenceId,
  )
  const action =
    change.kind === 'remove'
      ? 'Remove reference ' + reference.name
      : 'Move reference ' + reference.name + (change.targetIndex < index ? ' earlier' : ' later')
  const target = referenceCard(id, change.referenceId).getByRole('button', {
    name: action,
    exact: true,
  })
  await expect(target).toBeEnabled()
  await tabTo(target)
  await capturePromptMounts()
  const before = await witness()
  await window.keyboard.press('Enter')
  await expect
    .poll(async () => (await current()).documentRevision)
    .not.toBe(before.tab.documentRevision)
  await idle()
  const after = await witness()
  checkedDelta(before, after, label, {
    writes: [
      {
        channel: adapter.channels.updateReference,
        args: [before.tab.id, entityOwner(before.tab, id), change],
      },
    ],
    maxSeals: 1,
  })
  exactRegionalChange(
    before,
    after,
    (expected) => applyReferenceChange(expected, id, change),
    label,
  )
  assertReferenceSelection(before, after, label)
  await assertPromptMounts()
  return { before, after, id, change }
}
async function exactNoOpMove(id) {
  await neutral()
  const before = await witness()
  const referenceId = region(before.tab, id).referenceImages[0].id
  const args = [
    before.tab.id,
    entityOwner(before.tab, id),
    { kind: 'move', referenceId, targetIndex: 0 },
  ]
  const reply = await rawApi('updateRegionalGuidanceReferenceImage', ...args)
  assert.equal(reply.ok, true)
  await unchanged(before, 'Named public-preload equal-index move, original Main no-op', [
    { channel: adapter.channels.updateReference, args },
  ])
}
async function keyboardOrderRemove() {
  const tab = await current(),
    refs = region(tab, regionA).referenceImages
  assert.equal(refs.length, 2)
  const first = referenceCard(regionA, refs[0].id),
    second = referenceCard(regionA, refs[1].id)
  await expect(
    first.getByRole('button', { name: 'Move reference ' + refs[0].name + ' earlier', exact: true }),
  ).toBeDisabled()
  await expect(
    second.getByRole('button', { name: 'Move reference ' + refs[1].name + ' later', exact: true }),
  ).toBeDisabled()
  await exactNoOpMove(regionA)
  const moved = await referenceChangeUi(
    regionA,
    { kind: 'move', referenceId: refs[1].id, targetIndex: 0 },
    'Keyboard Move reference earlier',
  )
  await historyUi('undo', moved.before.liveDocument)
  await historyUi('redo', moved.after.liveDocument)
  const removed = await referenceChangeUi(
    regionA,
    { kind: 'remove', referenceId: refs[1].id },
    'Keyboard Remove reference',
  )
  await historyUi('undo', removed.before.liveDocument)
  await historyUi('redo', removed.after.liveDocument)
  // The only remaining A attachment is removed, proving omission rather than [].
  const remaining = region(await current(), regionA).referenceImages[0]
  const last = await referenceChangeUi(
    regionA,
    { kind: 'remove', referenceId: remaining.id },
    'Keyboard remove-last omits referenceImages',
  )
  assert.equal(Object.hasOwn(region(last.after.liveDocument, regionA), 'referenceImages'), false)
  await historyUi('undo', last.before.liveDocument)
  await historyUi('redo', last.after.liveDocument)
  await historyUi('undo', last.before.liveDocument)
  await historyUi('undo', removed.before.liveDocument)
  check(
    '05 Keyboard move/remove and disabled boundary controls; Main equal-index no-op; one Undo/Redo per edit and remove-last omission',
  )
}
async function duplicateReferences() {
  await selectEntity(regionA)
  const before = await witness()
  await menuItem(regionA, 'Duplicate region')
  await idle()
  const after = await witness()
  checkedDelta(before, after, 'Actual Duplicate region', {
    writes: [
      {
        channel: adapter.channels.duplicate,
        args: [before.tab.id, entityOwner(before.tab, regionA)],
      },
    ],
    maxSeals: 1,
  })
  const source = region(before.liveDocument, regionA)
  const copy = after.liveDocument.regionalGuidance.find(
    (item) => !before.liveDocument.regionalGuidance.some(({ id }) => id === item.id),
  )
  assert.ok(copy)
  duplicateRegion = copy.id
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
        path: 'assets/masks/' + copy.mask.id + '/' + source.mask.asset.sha256 + '.png',
      },
    },
    referenceImages: source.referenceImages.map((reference, index) => {
      const next = copy.referenceImages[index]
      assert.equal(ownedIds(before.liveDocument).includes(next.id), false)
      assert.notEqual(next.id, reference.id)
      return {
        ...clone(reference),
        id: next.id,
        asset: {
          ...reference.asset,
          path: 'assets/regional-references/' + next.id + '/' + reference.asset.sha256 + '.png',
        },
        thumbnail: {
          ...reference.thumbnail,
          path:
            'assets/regional-references/' + next.id + '/' + reference.thumbnail.sha256 + '.webp',
        },
      }
    }),
  }
  const maskBytes = await memberBytes(after, copy.mask.asset)
  validateMaskBytes(copy.mask, maskBytes)
  report.masks.push({
    regionId: copy.id,
    mask: copy.mask,
    retained: keepObject(maskBytes, 'Actual duplicate regional mask'),
  })
  for (const reference of copy.referenceImages)
    await verifyReferenceBytes(reference, (member) => memberBytes(after, member))
  exactRegionalChange(
    before,
    after,
    (expected) =>
      expected.regionalGuidance.splice(
        expected.regionalGuidance.findIndex(({ id }) => id === regionA) + 1,
        0,
        expectedCopy,
      ),
    'Duplicate fresh IDs/path copies exact PNG/thumb/mask/prompts and deduplicates immutable ICC',
  )
  assert.deepEqual(region(after.liveDocument, regionA), source)
  await selectEntity(copy.id)
  const edit = await referenceChangeUi(
    copy.id,
    { kind: 'remove', referenceId: copy.referenceImages[0].id },
    'Copy removal independent of source',
  )
  assert.deepEqual(region(edit.after.liveDocument, regionA), source)
  await historyUi('undo', edit.before.liveDocument)
  const deleteBefore = await witness()
  await menuItem(copy.id, 'Delete region')
  await idle()
  const deleted = await witness()
  checkedDelta(deleteBefore, deleted, 'Actual Delete region', {
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
    'Delete only copy',
  )
  assert.deepEqual(region(deleted.liveDocument, regionA), source)
  const restored = await historyUi('undo', deleteBefore.liveDocument)
  for (const reference of region(restored.tab, copy.id).referenceImages)
    await verifyReferenceBytes(reference, (member) => memberBytes(restored, member))
  await historyUi('redo', deleted.liveDocument)
  await selectEntity(fixture.patches[1].id)
  check(
    '06 Duplicate fresh region/reference/mask UUIDs and PNG/thumb owner paths; exact prompt/byte copies and shared ICC policy; copy edit/Delete/Undo preserve source',
  )
}
async function cancelAndFailure() {
  // An error banner changes the available Canvas height. Auto Fit intentionally recentres
  // its viewport; choose a real manual viewport before testing exact camera preservation.
  await neutral()
  const viewportBefore = await witness()
  await canvas().getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect
    .poll(async () =>
      Number(await canvas().locator('.canvas-area').getAttribute('data-camera-scale')),
    )
    .toBe(Number(viewportBefore.ui.camera.scale) * 1.25)
  const viewportSettlement = await window.evaluate(async () => {
    let previous = '',
      stableFrames = 0
    for (let frame = 0; frame < 120; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const node = document.querySelector('.canvas-area'),
        stage = node?.querySelector('.konvajs-content')
      const value = JSON.stringify({
        width: node?.clientWidth,
        height: node?.clientHeight,
        stageWidth: stage?.style.width,
        stageHeight: stage?.style.height,
        camera: [node?.dataset.cameraX, node?.dataset.cameraY, node?.dataset.cameraScale],
      })
      stableFrames = value === previous ? stableFrames + 1 : 0
      if (stableFrames >= 2) return { frame, stableFrames, value }
      previous = value
    }
    throw new Error('Manual reference-error Canvas viewport did not settle')
  })
  const viewportAfter = await witness()
  report.manualReferenceErrorViewport = {
    before: viewportBefore,
    after: viewportAfter,
    viewportSettlement,
  }
  checkpoint()
  checkedDelta(
    viewportBefore,
    viewportAfter,
    'Intentional public manual Zoom before Cancel/error camera controls',
    { writes: [], maxSeals: 0 },
  )
  assert.equal(Number(viewportAfter.ui.camera.scale), Number(viewportBefore.ui.camera.scale) * 1.25)
  assert.deepEqual(
    {
      ...viewportAfter,
      ui: { ...viewportAfter.ui, camera: viewportBefore.ui.camera },
      mutations: [],
    },
    { ...viewportBefore, mutations: [] },
    'Manual viewport preparation changes only camera; every mutation/seal remains counted',
  )
  await importUi(regionA, null, { cancel: true })
  for (const sourcePath of [imageFixtures.invalidPath, imageFixtures.unsupportedPath]) {
    const entry = report.externalInputs.find(({ path: file }) => file === sourcePath)
    await importUi(
      regionA,
      { ...entry, name: path.basename(sourcePath) },
      { error: true, label: 'Actual worker refuses ' + path.basename(sourcePath) },
    )
  }
  for (const source of [imageFixtures.jpeg, imageFixtures.webp]) {
    const retry = await importUi(regionA, source, {
      label: 'Real valid ' + source.sourceFormat + ' retry after actual worker errors',
    })
    const removed = await referenceChangeUi(
      regionA,
      { kind: 'remove', referenceId: retry.stored.id },
      'Remove valid retry attachment',
    )
    assert.equal(
      region(removed.after.tab, regionA).referenceImages.some(({ id }) => id === retry.stored.id),
      false,
    )
  }
  check(
    '07 Exact-title controlled dialog Cancel and actual invalid/unsupported-file CPU failures settle with strict no effect/focus; real valid retry',
  )
}
async function referenceRefusal(
  method,
  args,
  code,
  label,
  { reachesMain = true, noDialogOrCpu = true } = {},
) {
  await neutral()
  await settleCpu(label + '-before')
  const before = await witness(),
    adapterBefore = await runtimeAdapterState()
  const reply = await rawApi(method, ...args)
  assert.equal(reply.ok, false)
  assert.equal(reply.error.code, code)
  const channel =
    method === 'importRegionalGuidanceReferenceImage'
      ? adapter.channels.importReference
      : adapter.channels.updateReference
  const after = await unchanged(before, label, reachesMain ? [{ channel, args, ok: false }] : [])
  if (reachesMain)
    assert.equal(mutationsSince(before.mutations, after.mutations)[0].originalCalls, 1)
  const adapterAfter = await settleCpu(label + '-after')
  if (noDialogOrCpu) {
    assert.deepEqual(adapterAfter.dialogs, adapterBefore.dialogs)
    assert.deepEqual(adapterAfter.workers, adapterBefore.workers)
    assert.equal(adapterAfter.queued, 0)
  }
  report.refusals.push({ label, method, args, reply, reachesMain, noDialogOrCpu })
}
async function familyRepairControl(control) {
  await neutral()
  if ((await current()).dirty) await saveUi('08-before-prepared-family-control')
  await cleanCloseProject('Main clean close before declared family fixture')
  const main = { fixture, projectTitle, latestSaved, expectedLiveDocument, expectedCanvasNegative }
  fixture = control
  projectTitle = control.title
  latestSaved = { project: control.saved, sha256: control.packageSha256 }
  expectedLiveDocument = clone(control.saved)
  expectedCanvasNegative = clone(control.saved.generationDraft.negativePrompt)
  await openProject(
    '08-prepared-' +
      (control.saved.generationDraft.model?.baseModelFamily ?? 'unknown') +
      '-repair-open',
  )
  const id = control.regionId,
    before = await witness()
  await expect(addReferenceButton(id)).toBeDisabled()
  await expect(regionalRow(null, id).locator('.regional-help')).toContainText(
    control.saved.generationDraft.model
      ? 'Anima does not support regional reference images.'
      : 'Choose an Illustrious model in Current Canvas',
  )
  for (const reference of region(before.tab, id).referenceImages)
    await renderedReference(before.tab, id, reference)
  await referenceRefusal(
    'importRegionalGuidanceReferenceImage',
    [before.tab.id, entityOwner(before.tab, id)],
    'PROJECT_INVALID_INPUT',
    'Prepared wrong/unknown Current Canvas family Main refusal before dialog/CPU',
  )
  if (control.saved.generationDraft.model?.baseModelFamily === 'anima') {
    const references = region(before.tab, id).referenceImages
    const moved = await referenceChangeUi(
      id,
      { kind: 'move', referenceId: references[1].id, targetIndex: 0 },
      'Existing Anima references remain keyboard reorderable',
    )
    const removed = await referenceChangeUi(
      id,
      { kind: 'remove', referenceId: references[0].id },
      'Existing Anima references remain keyboard removable',
    )
    await historyUi('undo', removed.before.liveDocument)
    await historyUi('undo', moved.before.liveDocument)
  }
  assert.deepEqual(
    (await witness()).liveDocument,
    control.saved,
    'Control fixture restored to its exact saved revision',
  )
  await cleanCloseProject('Prepared family repair control exact clean close')
  control.finalSha256 = digest(readFileSync(control.path))
  assert.equal(control.finalSha256, control.packageSha256)
  fixture = main.fixture
  projectTitle = main.projectTitle
  latestSaved = main.latestSaved
  expectedLiveDocument = main.expectedLiveDocument
  expectedCanvasNegative = main.expectedCanvasNegative
  await reopenSaved(
    '08-main-after-prepared-family-control-' +
      (control.saved.generationDraft.model?.baseModelFamily ?? 'unknown'),
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
    const method = smart ? 'generateSmartPatch' : 'generate',
      reply = await rawApi(method, before.tab.id, request)
    assert.equal(reply.ok, false)
    assert.notEqual(reply.error.code, regionalCode)
    assert.match(reply.error.message, /model|runtime|engine|checkpoint/i)
    await unchanged(
      before,
      'All-disabled references preserve ordinary offline queue/cursor policy',
      [
        {
          channel: smart ? ipcChannels.projects.generateSmartPatch : ipcChannels.projects.generate,
          args: [before.tab.id, request],
          ok: false,
        },
      ],
    )
    report.refusals.push({
      label: 'All-disabled reference authoring offline control',
      smart,
      reply,
    })
  }
  await updateUi(regionA, { kind: 'enabled', enabled: true })
}
async function refusalsFamiliesGeneration() {
  const tab = await current(),
    owner = entityOwner(tab, regionA),
    referenceId = region(tab, regionA).referenceImages[0].id
  for (const malformed of [
    { ...owner, path: imageFixtures.mixed.path },
    { ...owner, bytes: [1, 2, 3] },
    { ...owner, asset: { path: '/private/forged.png' } },
    { ...owner, documentEpoch: 1 },
    { ...owner, regionId: 'invalid' },
  ])
    await referenceRefusal(
      'importRegionalGuidanceReferenceImage',
      [tab.id, malformed],
      'IPC_INVALID_CALLER',
      'Malformed/private owner blocked in preload: zero Main',
      { reachesMain: false },
    )
  for (const change of [
    { kind: 'move', referenceId, targetIndex: -1 },
    { kind: 'move', referenceId, targetIndex: 0, thumbnail: '/private' },
    { kind: 'remove', referenceId, path: '/private' },
    { kind: 'add', referenceId, bytes: [1] },
  ])
    await referenceRefusal(
      'updateRegionalGuidanceReferenceImage',
      [tab.id, owner, change],
      'IPC_INVALID_CALLER',
      'Malformed/private change blocked in preload: zero Main',
      { reachesMain: false },
    )
  for (const [change, code] of [
    [{ documentRevision: fixture.saved.documentRevision }, 'EDIT_CONFLICT'],
    [{ documentId: randomUUID() }, 'EDIT_CONFLICT'],
    [{ regionId: randomUUID() }, 'PROJECT_LAYER_NOT_FOUND'],
    [{ regionId: fixture.raster.id }, 'PROJECT_LAYER_NOT_FOUND'],
  ])
    await referenceRefusal(
      'importRegionalGuidanceReferenceImage',
      [tab.id, { ...owner, ...change }],
      code,
      'Valid shape stale/missing/wrong-owner Main refusal, no dialog/CPU',
    )
  await updateUi(regionA, { kind: 'lock', locked: true })
  const locked = await current(),
    lockedOwner = entityOwner(locked, regionA)
  await expect(addReferenceButton(regionA)).toBeDisabled()
  for (const button of await referenceSection(regionA).getByRole('button').all())
    await expect(button).toBeDisabled()
  await referenceRefusal(
    'importRegionalGuidanceReferenceImage',
    [locked.id, lockedOwner],
    'PROJECT_LAYER_LOCKED',
    'Locked Add Main refusal before dialog/CPU',
  )
  for (const change of [
    { kind: 'remove', referenceId },
    { kind: 'move', referenceId, targetIndex: 1 },
  ])
    await referenceRefusal(
      'updateRegionalGuidanceReferenceImage',
      [locked.id, lockedOwner, change],
      'PROJECT_LAYER_LOCKED',
      'Locked existing-reference mutation Main refusal',
    )
  await updateUi(regionA, { kind: 'lock', locked: false })
  await familyRepairControl(animaFixture)
  await familyRepairControl(unknownFixture)
  await generationControls()
  check(
    '08 Strict malformed/private preload zero Main; locked/stale/missing/wrong-family original Main once before dialog/CPU; prepared Anima repair/unknown-family explanation; enabled NEW refusal and disabled offline queue/cursor controls',
  )
}

function preparedProjects() {
  return [mainFixture, animaFixture, unknownFixture].filter(Boolean)
}
function normalizeVerifiedIndexTimes(before, normalized, columns, currentSaved = latestSaved) {
  const allowances = []
  for (const candidate of preparedProjects()) {
    const saved =
      candidate.key === fixture?.key
        ? currentSaved
        : (candidate.latestSaved ?? {
            project: candidate.saved,
            sha256: candidate.finalSha256 ?? candidate.packageSha256,
          })
    assert.equal(
      digest(readFileSync(candidate.path)),
      saved.sha256,
      'Timestamp allowance requires a verified current saved package',
    )
    const identifies = (row) =>
      row.local_project_key === candidate.key &&
      row.canonical_path === candidate.path &&
      row.document_id === saved.project.documentId
    const previous = before.tables.project_index.filter(identifies),
      next = normalized.tables.project_index.filter(identifies)
    assert.equal(previous.length, 1)
    assert.equal(next.length, 1)
    assert.equal(next[0].document_revision, saved.project.documentRevision)
    for (const column of columns) {
      assert.ok(['indexed_at', 'last_opened_at'].includes(column))
      if (column === 'last_opened_at' && candidate.key !== fixture.key) continue
      if (previous[0][column] === next[0][column]) continue
      const old =
        previous[0][column] === null && column === 'last_opened_at'
          ? -Infinity
          : Date.parse(previous[0][column])
      const actual = Date.parse(next[0][column])
      assert.ok(Number.isFinite(actual) && actual >= old)
      allowances.push({
        table: 'project_index',
        key: candidate.key,
        column,
        before: previous[0][column],
        after: next[0][column],
        verifiedPackageSha256: saved.sha256,
        verifiedSavedRevision: saved.project.documentRevision,
      })
      next[0][column] = previous[0][column]
    }
  }
  normalized.tables.project_index.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return allowances
}
async function settleAllHomeThumbnails() {
  for (const candidate of preparedProjects()) {
    const card = window
      .locator('.home-view .project-row')
      .filter({ has: window.getByRole('button', { name: 'Open ' + candidate.title, exact: true }) })
    await expect(card).toHaveCount(1)
    await card.scrollIntoViewIfNeeded()
    const image = card.locator('.project-thumbnail img')
    await expect
      .poll(() =>
        image.evaluate((node) => node.complete && node.naturalWidth > 0 && node.naturalHeight > 0),
      )
      .toBe(true)
    const archive = await readIgsPackage(candidate.path)
    const member = archive.manifest.members.find(
      ({ path: name }) => name === 'preview/thumbnail.webp',
    )
    const bytes = await archive.readMember(member.path)
    const cached = path.join(appDataRoot, 'previews/project-thumbnails', member.sha256 + '.webp')
    await expect.poll(() => existsSync(cached) && readFileSync(cached).equals(bytes)).toBe(true)
    keepObject(bytes, 'Actual prepared Home thumbnail ' + candidate.key)
  }
}
async function diagnosticProtocolGet(url) {
  return bounded(
    application.evaluate(async ({ net }, url) => {
      const response = await net.fetch(url, { method: 'GET' })
      return {
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
        bytes: response.ok ? [...new Uint8Array(await response.arrayBuffer())] : null,
      }
    }, url),
    5000,
    'Diagnostic Main net.fetch actual protocol GET',
  )
}
async function signedResources() {
  await neutral()
  const before = await witness(),
    tab = before.tab
  const reference = region(tab, regionA).referenceImages[0],
    other = region(tab, regionA).referenceImages[1]
  const raster = tab.layers.find(({ id }) => id === fixture.raster.id)
  assert.ok(firstReferenceUrl && firstReferenceUrl !== reference.thumbnailUrl)
  await renderedReference(tab, regionA, reference)
  // Preserve product privileges. Browser fetch is neither granted nor used for igs-layer.
  const source = readFileSync(path.join(root, 'src/main/index.ts'), 'utf8')
  const match = source.match(/scheme:\s*'igs-layer'[\s\S]*?\},/)
  assert.ok(match && !match[0].includes('supportFetchAPI'))
  const cases = [
    ['current reference thumbnail', reference.thumbnailUrl, reference.thumbnail.sha256],
    ['current Raster positive control', raster.imageUrl, fixture.raster.asset.sha256],
    ['stale signed thumbnail revision', firstReferenceUrl, null],
    [
      'tampered signature',
      reference.thumbnailUrl.replace(
        /([a-f0-9])\.webp$/,
        (all, digit) => (digit === '0' ? '1' : '0') + '.webp',
      ),
      null,
    ],
    ['cross-region owner', reference.thumbnailUrl.replace(regionA, regionB), null],
    ['cross-reference owner', reference.thumbnailUrl.replace(reference.id, other.id), null],
    [
      'reference in Raster namespace',
      reference.thumbnailUrl.replace('://regional-reference/', '://asset/'),
      null,
    ],
    [
      'Raster in regional-reference namespace',
      raster.imageUrl.replace('://asset/', '://regional-reference/'),
      null,
    ],
    [
      'reference image hash cannot authorize thumbnail',
      reference.thumbnailUrl.replace(reference.thumbnail.sha256, reference.asset.sha256),
      null,
    ],
  ]
  for (const [label, url, sha256] of cases) {
    const result = await diagnosticProtocolGet(url)
    if (sha256) {
      assert.equal(result.ok, true)
      assert.equal(result.status, 200)
      const bytes = Buffer.from(result.bytes)
      assert.equal(digest(bytes), sha256)
      keepObject(bytes, label)
    } else {
      assert.equal(result.ok, false)
      assert.equal(result.status, 404)
    }
    report.resourceChecks.push({
      label,
      url,
      status: result.status,
      sha256,
      transport:
        'Diagnostic Main net.fetch GET through actual registered protocol; no renderer FetchAPI privilege',
      contentType: result.contentType,
    })
  }
  await unchanged(
    before,
    'Signed image display and diagnostic protocol GETs preserve full document/history/SQL/product bytes',
  )
  check(
    '09 Actual decoded UI thumbnail plus Main net.fetch protocol GET: current/stale/tampered/cross-owner/cross-namespace isolation with valid Raster control; product privileges unchanged',
  )
}
async function referenceLayout() {
  await selectEntity(fixture.patches[1].id)
  await neutral()
  for (const [width, height] of [
    [1440, 900],
    [900, 620],
  ]) {
    await setNativeSize(width, height)
    await idle()
    const before = await witness()
    await expect(addReferenceButton(regionA)).toBeEnabled()
    await expect(addReferenceButton(regionB)).toBeEnabled()
    assert.equal(before.liveDocument.generationDraft.model.baseModelFamily, 'illustrious')
    const selected = before.tab.layers.find(({ id }) => id === before.ui.selectedId)
    assert.equal(
      selected.generationDraft.model.baseModelFamily,
      'anima',
      'Selected Smart family differs from Current Canvas authoring family',
    )
    await assertPrompt(selected.generationDraft.positivePrompt.text)
    await capturePromptMounts()
    for (const id of [regionA, regionB]) {
      const row = regionalRow(before.tab, id)
      const references = region(before.tab, id).referenceImages
      for (const reference of references) {
        const card = referenceCard(id, reference.id)
        await card.scrollIntoViewIfNeeded()
        await renderedReference(before.tab, id, reference)
        await layout(
          card,
          'Reference card/glyph/buttons ' + width + 'x' + height + '/' + id + '/' + reference.id,
        )
        const image = card.locator('img')
        const bounds = await image.evaluate((node) => {
          const r = node.getBoundingClientRect(),
            outer = node.parentElement.getBoundingClientRect()
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            outer: { left: outer.left, right: outer.right, top: outer.top, bottom: outer.bottom },
          }
        })
        assert.ok(
          bounds.left >= bounds.outer.left - 1 &&
            bounds.right <= bounds.outer.right + 1 &&
            bounds.top >= bounds.outer.top - 1 &&
            bounds.bottom <= bounds.outer.bottom + 1,
        )
        await screenshot(
          '10-reference-card-' + width + 'x' + height + '-' + id + '-' + reference.id,
        )
      }
      await addReferenceButton(id).scrollIntoViewIfNeeded()
      await layout(
        addReferenceButton(id),
        'Add reference footer action ' + width + 'x' + height + '/' + id,
      )
      // Prompt blocks stay mounted while scrolling cards/footer under a selected Anima Smart.
      await expect(row.getByRole('textbox', { name: adapter.positive, exact: true })).toHaveCount(1)
    }
    const first = region(before.tab, regionA).referenceImages[0]
    const action = referenceCard(regionA, first.id).getByRole('button', {
      name: 'Move reference ' + first.name + ' later',
      exact: true,
    })
    await expect(action).toBeEnabled()
    const traversal = await tabTo(action)
    await expect(action).toBeFocused()
    await layout(action, 'Keyboard-focusable reference glyph ' + width + 'x' + height, 'icon')
    await action.hover()
    const tooltipText = 'Move reference ' + first.name + ' later'
    // Installed NTooltip renders a portalled .n-tooltip div, without role=tooltip.
    const tooltip = window.locator('.n-tooltip').filter({ hasText: tooltipText })
    await expect(tooltip).toHaveCount(1)
    await expect(tooltip).toHaveText(tooltipText)
    await expect(tooltip).toBeVisible()
    await layout(tooltip, 'Actual reference tooltip ' + width + 'x' + height)
    await screenshot('10-reference-keyboard-tooltip-' + width + 'x' + height, {
      preservePointer: true,
    })
    await window.mouse.move(0, 0)
    await window.keyboard.press('Tab')
    await expect(tooltip).toHaveCount(0)
    await assertPromptMounts()
    await unchanged(
      before,
      'Normal scroll/keyboard/tooltip references leave complete selected Smart/Canvas document exact at ' +
        width +
        'x' +
        height,
      traversal.actual.map(({ channel, args }) => ({ channel, args })),
    )
  }
  await setNativeSize(1440, 900)
  await idle()
  await screenshot('10-reference-overview-1440x900')
  report.visualReview = {
    status: 'root-must-view',
    screenshots: report.screenshots.slice(),
    boundary:
      'Geometry/interaction checks do not qualify appearance. Root views actual retained screenshots before accepting visual readiness.',
  }
  check(
    '10 Actual 1440x900 and 900x620 cards/thumbnails/glyphs/buttons/footer/scroll/keyboard/tooltip; stable prompt mounts and selected Anima Smart with Illustrious Current Canvas controls; root visual review pending',
  )
}
function hideAuthorizedInputs() {
  const destination = path.join(fixtureRoot, 'hidden-authorized-inputs-after-import')
  assert.equal(existsSync(destination), false)
  for (const input of report.externalInputs) {
    assert.deepEqual(sourceIdentity(input.path), input.identity)
    assert.ok(
      readFileSync(input.raw.path).equals(readFileSync(input.path)),
      'Raw source bytes retained outside disposable payload',
    )
  }
  renameSync(externalInputsRoot, destination)
  for (const input of report.externalInputs) {
    assert.equal(existsSync(input.path), false)
    input.hiddenPath = path.join(destination, path.basename(input.path))
    assert.ok(readFileSync(input.hiddenPath).equals(readFileSync(input.raw.path)))
  }
  report.portabilityInputBoundary = {
    originalDirectory: externalInputsRoot,
    hiddenDirectory: destination,
    deletionCount: 0,
    rawOraclesRetained: true,
    originalPathsUnavailable: true,
    boundary:
      'Only this run-owned raw input directory is moved; all original path-based inputs disappear. Original files outside the owned fixture are never touched.',
  }
  checkpoint()
}
async function saveReferencesAndRecover() {
  await selectEntity(fixture.patches[1].id)
  await importUi(regionA, imageFixtures.mixed, {
    label: 'Actual additional attachment before the explicit reference Save checkpoint',
  })
  await saveUi('11-actual-reference-save')
  await snapshot('11-reference-save-full-loader')
  const saved = clone(latestSaved)
  await cleanCloseProject('Saved regional references clean close')
  await reopenSaved('11-saved-references-reopened')
  await selectEntity(fixture.patches[1].id)
  const dirtyImport = await importUi(regionB, imageFixtures.dirty, {
    label: 'Actual unsaved additional reference PNG/thumbnail/new ICC',
  })
  const dirty = await witness()
  assert.equal(dirty.tab.dirty, true)
  assert.equal(dirty.packageSha256, saved.sha256)
  assert.equal(region(dirty.tab, regionB).enabled, false)
  assert.ok(dirtyImport.stored.sourceIccProfile)
  const savedArchive = await readIgsPackage(fixture.path)
  assert.deepEqual(savedArchive.project, saved.project)
  const manifestPath = path.join(appDataRoot, 'autosave', fixture.key, 'manifest.json')
  const manifestBytes = readFileSync(manifestPath),
    manifest = JSON.parse(manifestBytes)
  assert.equal(manifest.state, 'dirty')
  const expectedDirtyMembers = [
    dirtyImport.stored.asset,
    dirtyImport.stored.thumbnail,
    dirtyImport.stored.sourceIccProfile,
  ]
  assert.deepEqual(
    manifest.dirtyAssets,
    expectedDirtyMembers
      .map(({ path: name, bytes, sha256 }) => ({ path: name, bytes, sha256 }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    'Exactly the unsaved new PNG/thumb/new ICC are shadow-owned; every other asset resolves from the real saved package',
  )
  const documentFile = path.join(
    path.dirname(manifestPath),
    'snapshots',
    manifest.snapshotId,
    'project.json',
  )
  const documentBytes = readFileSync(documentFile)
  assert.equal(digest(documentBytes), manifest.documentHash)
  assert.deepEqual(JSON.parse(documentBytes), dirty.liveDocument)
  const assetSources = []
  for (const member of assetRefs(dirty.liveDocument)) {
    const inShadow = manifest.dirtyAssets.some(({ path: name }) => name === member.path)
    const bytes = await memberBytes(dirty, member)
    if (!inShadow) {
      const savedMember = assetRefs(saved.project).find(({ path: name }) => name === member.path)
      assert.deepEqual(savedMember, member)
      assert.ok(bytes.equals(await savedArchive.readMember(member.path)))
    }
    assert.equal(digest(bytes), member.sha256)
    assert.equal(bytes.length, member.bytes)
    assert.ok(readFileSync(report.productObjects[member.sha256].path).equals(bytes))
    assetSources.push({
      member,
      source: inShadow ? 'actual-dirty-shadow' : 'actual-saved-package',
      sha256: digest(bytes),
    })
  }
  assertOwnedShadowFiles(dirty)
  hideAuthorizedInputs()
  await snapshot('11-unsaved-reference-before-declared-crash')
  report.dirtyCrashPrecondition = {
    documentId: dirty.tab.documentId,
    documentRevision: dirty.tab.documentRevision,
    manifest,
    assetSources,
    shadowDocumentSha256: digest(documentBytes),
    durableShadowRetained: true,
    packageUnchanged: digest(readFileSync(fixture.path)) === saved.sha256,
    dirtyDocument: dirty.liveDocument,
    sourcePackageSha256: saved.sha256,
    newUnsavedReference: dirtyImport.stored,
    sourcesHiddenWithoutDeletion: true,
  }
  checkpoint()
  await restoreAll()
  await closeNative('declared-unsaved-reference-crash', 'intentional-dirty-crash')
  // Independent post-crash SQL first, before any source/package/thumbnail gate.
  await snapshot('11-after-unsaved-reference-physical-exit', {
    closed: true,
    afterNativeExit: true,
  })
  assertProtectedSql(sqlState(), 'Dirty reference crash preserves all SQL tables/cursor/queue')
  await launch('references-recovery-same-overall-deadline')
  assertSqlTransition(expectedSql, sqlState(), 'Recovery startup verified saved-package indexes', [
    'indexed_at',
  ])
  const recovered = await openProject('11-explicit-reference-home-recover', true)
  assert.deepEqual(content(recovered.liveDocument), content(dirty.liveDocument))
  assert.equal(recovered.tab.canUndo, false)
  assert.equal(recovered.tab.canRedo, false)
  assert.equal(recovered.packageSha256, saved.sha256)
  expectedLiveDocument = clone(recovered.liveDocument)
  const restored = region(recovered.tab, regionB).referenceImages.find(
    ({ id }) => id === dirtyImport.stored.id,
  )
  assert.ok(restored)
  await verifyReferenceBytes(restored, (member) => memberBytes(recovered, member))
  await renderedReference(recovered.tab, regionB, restored)
  await screenshot('11-recovered-unsaved-regional-reference')
  await saveUi('11-recovered-source-independent-reference-save')
  await cleanCloseProject('Recovered regional reference saved clean close')
  await reopenSaved('11-recovered-references-source-independent-reopened')
  for (const input of report.externalInputs) assert.equal(existsSync(input.path), false)
  const final = await witness()
  assert.deepEqual(content(final.liveDocument), content(dirty.liveDocument))
  const reference = region(final.tab, regionB).referenceImages.find(({ id }) => id === restored.id)
  await verifyReferenceBytes(reference, (member) => memberBytes(final, member))
  await renderedReference(final.tab, regionB, reference)
  check(
    '11 Actual Save/read/reopen, unsaved new PNG/thumb/new ICC exact shadow vs saved-base inventory, hidden owned inputs/raw oracles, restored-observer physical crash/Home Recover and portable Save/reopen',
  )
}

function compactEvidenceBytes() {
  return (
    filesBelow(evidenceRoot)
      .filter((file) => !file.startsWith(fixtureRoot + path.sep))
      .reduce((sum, file) => sum + lstatSync(file).size, 0) + lstatSync(reportFile).size
  )
}
async function run() {
  report.baseEngine = {
    source: 'scripts/smoke-regional-guidance-masks.mjs',
    sha256: '26215dbae471ea7fabfbfb17739dc9cd689212f02897610960abcf91300401c4',
    reused:
      'Canonical tagged prefix hashes, all seals, linear tagged journals, real 2rAF/2s, X11 compositor, strict navigation, SQL before/after/final and content-addressed byte retention',
  }
  assert.equal(
    digest(readFileSync(path.join(root, report.baseEngine.source))),
    report.baseEngine.sha256,
    'Pinned reusable engine source boundary',
  )
  report.launcher = await verifyLauncherDeadline()
  report.prefixCodecSelfCheck = prefixCodecSelfCheck()
  await captureSources()
  captureCpuCloseContract()
  report.toolVersions = {
    node: process.version,
    playwright: require('@playwright/test/package.json').version,
    electron: require('electron/package.json').version,
    sqlite: require('better-sqlite3/package.json').version,
  }
  report.compactEvidenceBudget = {
    aimBytes: 300 * 1024 * 1024,
    afterSourceBuild: compactEvidenceBytes(),
    policy:
      'Bounded failure retains all evidence and owned payloads; root reviews exceptions/releases. No deletion or selective weakening.',
  }
  assert.ok(report.compactEvidenceBudget.afterSourceBuild < 250 * 1024 * 1024)
  captureWorkerDependencies()
  await prepare()
  prepareInputFixtures()
  animaFixture = await prepareFamilyControl('anima')
  unknownFixture = await prepareFamilyControl(null)
  fixture = mainFixture
  expectedLiveDocument = clone(fixture.saved)
  expectedCanvasNegative = clone(fixture.saved.generationDraft.negativePrompt)
  await launch('regional-references-real-cpu')
  await prepareAdditionalEncodedInputs()
  for (const method of [
    'importRegionalGuidanceReferenceImage',
    'updateRegionalGuidanceReferenceImage',
  ])
    assert.equal(
      await window.evaluate((method) => typeof window.api.projects[method], method),
      'function',
    )
  await openProject('01-initial-reference-legacy-exact-open')
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  await frames()
  baseline = await witness()
  assert.deepEqual(baseline.liveDocument, fixture.saved)
  assert.equal(baseline.tab.dirty, false)
  assert.equal(baseline.tab.canUndo, false)
  assert.equal(baseline.tab.canRedo, false)
  assert.ok(
    baseline.liveDocument.regionalGuidance.every((item) => !Object.hasOwn(item, 'referenceImages')),
  )
  assert.deepEqual(baseline.sql.tables.generation_queue_item, [])
  assert.deepEqual(baseline.sql.tables.generation_candidate_receipt, [])
  assert.equal(baseline.sql.tables.generation_seed_cursor.length, 1)
  assert.equal(baseline.sql.tables.generation_seed_cursor[0].actual_seed, 0)
  assert.ok(Object.hasOwn(baseline.sql.tables, 'sqlite_sequence'))
  report.sqlBoundary = {
    allTables: Object.keys(baseline.sql.tables).sort(),
    allSchemaObjects: baseline.sql.schema,
    projection: 'none',
  }
  expectedSql = clone(baseline.sql)
  report.baseline = baseline
  await snapshot('01-original-reference-legacy-full-sql-baseline')
  await cleanLegacySaveAndReopen()
  check(
    '01 Production writer Raster/both Smart families/masks/regional prompts/seed0/A enabled/B disabled with absent referenceImages; actual legacy clean Save/read/reopen preserves absence/history/all neighbors',
  )
  await selectEntity(regionA)
  const first = await importUi(regionA, imageFixtures.mixed, {
    label: 'Normal UI Add A, actual CPU mixed-alpha PNG',
  })
  firstReferenceUrl = region(first.after.tab, regionA).referenceImages[0].thumbnailUrl
  await oneReferenceHistory(first)
  check(
    '02 Normal UI Add A, real CPU normalization/new thumbnail, exact complete RGBA/canonical ICC/hash, full-frame alpha margins/no upscale, dialog arguments/source immutability and one Undo/Redo',
  )
  const large = await importUi(regionA, imageFixtures.large, {
    label: 'Second Add: true RGB sRGB/ICC source exceeding old preview ceiling',
  })
  assert.ok(
    large.stored.asset.bytes > 1_000_000,
    'Actual canonical original exceeds createResourcePreview input ceiling',
  )
  assert.ok(large.stored.sourceIccProfile)
  assert.equal(large.stored.sourceIccProfile.sha256, pinnedProfileSha256)
  await renderedReference(
    large.after.tab,
    regionA,
    region(large.after.tab, regionA).referenceImages.at(-1),
  )
  check(
    '03 Repeated one-file Add: >1MB actual canonical original, true RGB sRGB/ICC source, independent metadata and actual decoded bounded full-frame thumbnail',
  )
  await selectEntity(fixture.patches[1].id)
  const transparent = await importUi(regionB, imageFixtures.transparent, {
    label: 'Unselected disabled B Add while Anima Smart selected and Illustrious Current Canvas',
  })
  assert.equal(transparent.after.ui.selectedId, fixture.patches[1].id)
  assert.equal(region(transparent.after.tab, regionB).enabled, false)
  assert.deepEqual(
    [transparent.stored.thumbnail.width, transparent.stored.thumbnail.height],
    [41, 23],
  )
  const transparentBytes = await memberBytes(transparent.after, transparent.stored.asset)
  assert.ok(decodedPng(transparentBytes).alpha.every((value) => value === 0))
  check(
    '04 Disabled unselected B Add while Anima Smart selected uses stable Illustrious Current Canvas; fully transparent full-frame thumbnail; unchanged selection/global draft/owner prompts/masks/geometry',
  )
  await keyboardOrderRemove()
  await duplicateReferences()
  await cancelAndFailure()
  await refusalsFamiliesGeneration()
  await signedResources()
  await referenceLayout()
  await saveReferencesAndRecover()
  await finish()
  for (const control of [animaFixture, unknownFixture]) {
    assert.equal(digest(readFileSync(control.path)), control.packageSha256)
    assert.deepEqual((await readIgsPackage(control.path)).project, control.saved)
  }
  for (const entry of report.workerDependencyWitness.metadata)
    assert.equal(digest(readFileSync(entry.path)), entry.sha256)
  assert.equal(
    digest(readFileSync(report.workerDependencyWitness.interpreter)),
    report.workerDependencyWitness.interpreterSha256,
  )
  captureWorkerBytecode('final-after-all-native-and-cpu-physical-exits')
  report.compactEvidenceBudget.finalBytes = compactEvidenceBytes()
  assert.ok(
    report.compactEvidenceBudget.finalBytes <= report.compactEvidenceBudget.aimBytes,
    'Over 300MiB: fail and retain every byte for root exception review',
  )
  check(
    '12 Healthy Main code0 and independently witnessed normal CPU disposal/physical exits, exact original dialog/spawn/worker kill+write/Main/fault-gate restoration/inflight0/pageerrors0; independent final full SQL, latest package/neighbors/source/build/worker code+ICC+metadata, complete portable journals and retained bytes; deletion0',
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
      await restoreAll()
    } catch (error) {
      report.observerRestorationFailure = String(error)
    }
    try {
      await closeNative('failure-owned-references-actors', 'abort')
    } catch (error) {
      report.physicalExitFailure = String(error)
    }
  }
  clearInterval(sampler)
  // Independently retain final SQLite before every later package/source/byte assertion.
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
      report.failureFinalRetainedFiles = retainProductFiles()
    } catch (error) {
      report.failureFinalPayloadError = String(error)
    }
  }
  try {
    if (report.workerDependencyWitness)
      captureWorkerBytecode('finally-retained-actual-candidate-worker-code')
  } catch (error) {
    report.failureFinalWorkerCodeError = String(error)
  }
  if (
    report.observerRestorationFailure ||
    report.physicalExitFailure ||
    promptGateArmed ||
    dialogInstalled ||
    spawnObserverInstalled ||
    !allExited()
  ) {
    process.exitCode = 1
    report.outcome = 'failed'
  }
  lifecycle.state = 'retained'
  lifecycle.disposition = {
    owner: 'root',
    deletedBytes: 0,
    deletionCount: 0,
    retainedEvidence: evidenceRoot,
    disposablePayloads: [fixtureRoot, temporaryDirectory],
    physicalExitConfirmed: allExited(),
    observerRestored: !observerInstalled && !report.observerRestorationFailure,
    dialogRestored: !dialogInstalled,
    spawnRestored: !spawnObserverInstalled,
    workerMethodsRestored: report.cpuWorkers.every(
      ({ workers, restored }) =>
        restored && workers.every(({ methodsRestored }) => methodsRestored === true),
    ),
    promptGateRestored: !promptGateArmed,
    faultGatesInstalled: 0,
    finalDatabaseRetained:
      report.finalDatabaseAfterLastUiAndPhysicalExit === true ||
      report.failureFinalDatabaseRetainedAfterPhysicalExit === true,
    releaseCondition:
      'Root independently views screenshots, audits complete compact evidence/raw input/canonical PNG/thumbnail/ICC/historical packages/shadows/SQL/linear journals and Python bytecode mappings; confirms all PID/start/cgroup physical exits and exact originals before release. .venv/node_modules/interpreter remain protected external dependencies. Runner deletion count is zero.',
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
