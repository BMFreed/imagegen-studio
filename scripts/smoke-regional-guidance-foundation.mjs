/**
 * ROOT-ONLY, after a fresh build: pnpm exec tsx scripts/smoke-regional-guidance-foundation.mjs
 * --report-file ABSOLUTE_NEW_REPORT
 *
 * Twelve finite checks through the built renderer, real preload, original Main, SQLite and .igs
 * writer/loader. Portable Raster/accepted Smart PNGs are declared storage inputs, not inference or
 * acceptance evidence. No ML, catalog/runtime provisioning, successful admission, frozen Retry
 * execution, active-work preservation claim, forced disabled click, fabricated IPC/DTO or deletion.
 * Root owns serial execution, screenshot inspection, artifact inventory and all cleanup.
 *
 * The one overall physical deadline is at most 300s, including recovery: launcher RuntimeMax<=300s,
 * TimeoutStop<=30s; each native timer targets the same deadline. Every unique cgroup <=2GiB and
 * zero swap, with an EXPLICIT 4GiB aggregate ceiling. Healthy closes require code0; the one
 * intentional dirty crash requires retained durable shadow and independent physical-exit proof.
 *
 * DRAFT --scenario rename-focus is NOT full foundation qualification. Only that scenario may inject
 * one declared Electron Main IPC transport exception BEFORE the original Rename handler: original
 * calls=0 for that one fault, no fabricated ApiResult/ProjectTab and no Main/service
 * failure-atomicity claim. Its delayed success and ordinary success call the original exactly once.
 * Full mode keeps every original Main handler pass-through and never arms the transport fault.
 * Invoke this external draft from the repository with --report-file ABSENT_ABSOLUTE_REPORT
 * --scenario rename-focus. Dependencies resolve from that repository, not the artifact parent.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

const require = createRequire('/home/user/Work/imagegen-studio/package.json')
const { _electron: electron, expect } = require('@playwright/test')
const Database = require('better-sqlite3')
const yazl = require('yazl')

import { openAppDatabase } from '/home/user/Work/imagegen-studio/src/main/db/database.ts'
import { readIgsPackage } from '/home/user/Work/imagegen-studio/src/main/projects/igs-package.ts'
import { encodeProjectMaskPng } from '/home/user/Work/imagegen-studio/src/main/projects/project-mask.ts'
import { ProjectSession } from '/home/user/Work/imagegen-studio/src/main/projects/project-session.ts'
import { ProjectShadowStore } from '/home/user/Work/imagegen-studio/src/main/projects/project-shadow.ts'
import { acceptedRasterProvenanceFixture } from '/home/user/Work/imagegen-studio/src/main/projects/test-fixtures/accepted-provenance.ts'
import { literalSmartPatchColorPng } from '/home/user/Work/imagegen-studio/src/main/projects/test-fixtures/smart-patch-input-material.ts'
import { smartPatchVariantMetadataFixture } from '/home/user/Work/imagegen-studio/src/main/projects/test-fixtures/smart-patch-variant.ts'
import { ipcChannels } from '/home/user/Work/imagegen-studio/src/shared/api.ts'
import { IGS_MIMETYPE } from '/home/user/Work/imagegen-studio/src/shared/projects/project-schema.ts'
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
assert.ok(
  [4, 6].includes(process.argv.length),
  'Use --report-file ABSOLUTE_NEW_REPORT [--scenario rename-focus]',
)
const scenario = process.argv.length === 6 ? process.argv[5] : 'full'
if (process.argv.length === 6) {
  assert.equal(process.argv[4], '--scenario')
  assert.equal(scenario, 'rename-focus')
}
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
const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'regional-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
mkdirSync(workspace, { recursive: true, mode: 0o700 })
// Short Unix socket paths; this companion remains root-owned and is never removed here.
const temporaryDirectory = mkdtempSync(path.join(artifactRoot, 'rg-tmp-'))
const previousTemporaryDirectory = process.env.TMPDIR
process.env.TMPDIR = temporaryDirectory
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const mono = () => Number(process.hrtime.bigint() / 1_000_000n)
let overallDeadline = startedMono + 300_000
const projectTitle = 'Regional Guidance foundation'
const regionalReason =
  'Regional Guidance generation is not available yet. Disable or delete all enabled regions before generating.'
const regionalCode = 'GENERATION_REGIONAL_GUIDANCE_UNSUPPORTED'
const roots = {
  placeholdersDir: path.join(root, 'dist/main/placeholders'),
  scratchDir: path.join(fixtureRoot, 'writer-scratch'),
}
// API/copy adapter follows the inspected UI owner, not guessed dialog/input positions.
const adapter = {
  add: 'Add Regional Guidance',
  display: 'Region display',
  opacity: 'Region opacity',
  rename: 'Rename region',
  duplicate: 'Duplicate region',
  delete: 'Delete region',
  renameDialog: 'Rename region',
  renameInput: 'Regional Guidance name',
  renameSubmit: 'Rename',
  unsupportedReason: 'Regional prompts, reference images and mask editing are not available yet.',
  promptActions: ['Prompt', 'Negative Prompt', 'Reference Image'],
  regionTools: [
    'Transform Region',
    'Brush tool',
    'Eraser tool',
    'Lasso tool',
    'Polygon Lasso tool',
  ],
  regionGroup: 'Regional Guidance',
  channels: {
    add: ipcChannels.projects.addRegionalGuidance,
    update: ipcChannels.projects.updateRegionalGuidance,
    duplicate: ipcChannels.projects.duplicateRegionalGuidance,
    delete: ipcChannels.projects.deleteRegionalGuidance,
  },
}
const report = {
  schemaVersion: 1,
  scenario,
  qualificationScope:
    scenario === 'rename-focus'
      ? 'rename-focus-ui-transport-only'
      : 'empty-regional-guidance-foundation-only',
  fullTwelveCheckQualification: false,
  fullQualification: false,
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
  renameFocusProbes: [],
  renameFocusFaults: [],
  observerRestorations: [],
  ipcCalls: [],
  navigationActions: [],
  homeThumbnailReadiness: [],
  sqlTransitions: [],
  savedIndexRevisionTransitions: [],
  retainedBuildFiles: [],
  boundary: {
    actual:
      'Built Regional Guidance add/select/edit/lock/duplicate/delete/history, ordinary and Smart generation refusal, genuine Save/loader/reopen, durable dirty crash/Recover/Save/reopen.',
    fixtures:
      'Production ProjectSession prepares legacy-absent .igs, literal ICC Raster and accepted Illustrious/Anima Smart variants/masks/provenance, distinct drafts/bboxes and seed0. Queue and catalog are empty. No acceptance or inference is exercised.',
    oracle:
      'Independent literal regional shape; complete raw durable documents/assets, renderer-adoption barrier, original Main invocations, all SQL schema/tables, package/product bytes, selection/camera. Navigation/history seals have separate exact witnesses.',
    limits:
      'One overall <=300s deadline without recovery reset; launcher RuntimeMax<=300s/TimeoutStop<=30s/KillMode=control-group, each owned native timer <=same deadline; <=2GiB per unique group/zero swap, explicit aggregate <=4GiB, actual anon/file samples.',
    excluded:
      'ML, installed-resource success, successful admission, Random-call/cancel collaborator counting, active-work preservation with empty queue, frozen Retry/CAS execution, mask editing, prompts/references/inference, release/full promise or independent screenshot qualification.',
    cleanup:
      'No deletion. Root verifies retained source/build/PNG/.igs/shadow/input/SQLite bytes, observer restoration and every physical exit before disposing declared payloads only.',
  },
}
const lifecycle = {
  schemaVersion: 1,
  owner: { repository: root, task: 'regional-guidance-foundation', run: reportFile },
  state: 'running',
  lastUsedAt: report.startedAt,
  evidence: [reportFile, evidenceRoot],
  payloads: [fixtureRoot, temporaryDirectory],
  dependsOn: [],
  usedBy: [],
  pins: [fixtureRoot, temporaryDirectory].map((file) => ({
    path: file,
    reason: 'Root release only after physical exit, exact restoration and complete retained bytes',
  })),
}
if (scenario === 'rename-focus') {
  report.boundary.actual =
    'Focused actual Rename modal, delayed original Main invocation after modal DOM disposal, real Electron/preload/App transport-error handling, original-row return focus, normal success and exact name-only Undo.'
  report.boundary.controlledFault =
    'Exactly one owned wrapper throws an actual Error before its original update-regional-guidance handler; zero original calls expected for that one fault. Real preload maps the rejection to IPC_UNAVAILABLE. This qualifies UI return-focus/error behavior only, not a genuine Main/service refusal or mutation atomicity.'
  report.boundary.excluded +=
    ' Focused mode does not execute the full twelve checks, native minimum-size matrix, Save/recovery campaign or Main/service failure atomicity.'
}
let renameGateArmed = false
let application, window, nativeProcess, sampler, fixture, baseline, latestSaved
let regionA, regionB, duplicateRegion, sourceFiles, bundleFiles
let observerInstalled = false
let sampling = Promise.resolve()
let scopeDeadlineSeconds
const nativeChecks = []
const observed = new Map()
const view = () => window.getByLabel('Project ' + projectTitle, { exact: true })
const canvas = () => view().getByRole('region', { name: 'Project Canvas', exact: true })
const button = (name) => view().getByRole('button', { name, exact: true })
const selectButton = (name) => button('Select ' + name)
const region = (tab, id) => {
  const found = tab.regionalGuidance?.find((item) => item.id === id)
  assert.ok(found, 'Missing regional owner ' + id)
  return found
}
const documentOwner = (tab) => ({
  documentId: tab.documentId,
  documentRevision: tab.documentRevision,
})
const entityOwner = (tab, id) => ({ ...documentOwner(tab), regionId: id })
function checkpoint() {
  lifecycle.lastUsedAt = new Date().toISOString()
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
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
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n')
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
  const schema = database
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    )
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
    await source.backup(file)
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
  return window.evaluate(({ method, args }) => window.api.projects[method](...args), {
    method,
    args,
  })
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
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
}
async function adopted(tab) {
  // Production Vue need not expose development component internals. Observe actual DOM adoption,
  // not only a completed Main call or a second API read of an already-updated document.
  await expect
    .poll(() =>
      regionalSection()
        .locator('.entity-surface')
        .evaluateAll((rows) =>
          rows.map((row) => {
            const names = [...row.querySelectorAll('button')].map((node) =>
              node.getAttribute('aria-label'),
            )
            const select = names.find((name) => name?.startsWith('Select '))
            return {
              name: select?.slice(7),
              enabled: names.includes('Hide ' + select?.slice(7)),
              locked: names.includes('Unlock ' + select?.slice(7)),
            }
          }),
        ),
    )
    .toEqual(
      (tab.regionalGuidance ?? []).map(({ name, enabled, locked }) => ({ name, enabled, locked })),
    )
  await expect(
    regionalSection().getByRole('heading', {
      name: 'Regional Guidance (' + (tab.regionalGuidance ?? []).length + ')',
      exact: true,
    }),
  ).toBeVisible()
  const selectedIndex = await regionalSection()
    .locator('.entity-surface')
    .evaluateAll((rows) =>
      rows.findIndex((row) => row.querySelector('.entity-select[aria-pressed="true"]')),
    )
  if (selectedIndex >= 0) {
    const selected = tab.regionalGuidance[selectedIndex]
    const input = view().getByRole('textbox', { name: adapter.opacity, exact: true })
    await expect(input).toHaveValue(String(Number((selected.overlayOpacity * 100).toPrecision(12))))
    if (selected.locked) await expect(input).toBeDisabled()
    else await expect(input).toBeEnabled()
  }
  await expect(button(adapter.add)).toBeEnabled()
  await frames()
}
async function installObserver() {
  await application.evaluate(
    ({ ipcMain }, contract) => {
      globalThis.igsRegionalCalls = []
      globalThis.igsRegionalOriginals = new Map()
      globalThis.igsRegionalObservers = new Map()
      globalThis.igsRegionalCaptureNavigation = false
      globalThis.igsRegionalRenameGate = null
      globalThis.igsRegionalFocusContract = contract
      for (const [channel, original] of ipcMain._invokeHandlers) {
        const observer = async (event, ...args) => {
          const call = {
            id: globalThis.igsRegionalCalls.length,
            channel,
            args: structuredClone(args),
            finished: false,
            delivered: false,
            originalCalls: 0,
          }
          globalThis.igsRegionalCalls.push(call)
          let heldGate
          try {
            const gate = globalThis.igsRegionalRenameGate
            if (
              gate &&
              !gate.held &&
              channel === contract.updateChannel &&
              args[0] === gate.tabId &&
              args[1]?.documentId === gate.documentId &&
              args[1]?.documentRevision === gate.documentRevision &&
              args[1]?.regionId === gate.regionId &&
              args[2]?.kind === 'rename' &&
              args[2]?.name === gate.name
            ) {
              if (contract.scenario !== 'rename-focus')
                throw new Error('Rename gate is focused-only')
              heldGate = gate
              gate.held = true
              gate.callId = call.id
              gate.args = structuredClone(args)
              call.focusProbeMode = gate.mode
              await gate.delivery
              if (gate.mode === 'transport-error') {
                call.transportFault = true
                call.ok = null
                throw new Error(gate.throwMessage)
              }
            }
            call.originalCalls += 1
            if (heldGate) heldGate.originalCalls = call.originalCalls
            const response = await original(event, ...args)
            call.ok = response?.ok ?? null
            if (response?.ok === false) call.error = structuredClone(response.error)
            if (
              ['projects:resolve-recovery', 'projects:save'].includes(channel) ||
              (channel === 'projects:open' && globalThis.igsRegionalCaptureNavigation)
            )
              call.response = structuredClone(response)
            call.delivered = true
            return response
          } catch (error) {
            call.thrown = { name: error.name, message: error.message }
            throw error
          } finally {
            call.finished = true
            if (heldGate) heldGate.completed = true
          }
        }
        globalThis.igsRegionalOriginals.set(channel, original)
        globalThis.igsRegionalObservers.set(channel, observer)
        ipcMain._invokeHandlers.set(channel, observer)
      }
    },
    { scenario, updateChannel: adapter.channels.update },
  )
  observerInstalled = true
}
const calls = () => application.evaluate(() => structuredClone(globalThis.igsRegionalCalls))
const readChannels = new Set([
  ...Object.values(ipcChannels.projects).filter((channel) =>
    /^projects:(get-|list(?:-|$)|open$|review-accepted-result$)/.test(channel),
  ),
  ...Object.values(ipcChannels.models).filter((channel) => /^models:get-/.test(channel)),
  ...Object.values(ipcChannels.runtime).filter((channel) => /^runtime:get-/.test(channel)),
  'presets:get',
  'presets:list',
])
// current() reads the already-open owner. Real UI Open/Recover use a separate raw-call window
// which includes projects:open explicitly and permits exactly the declared navigation sequence.
async function mutations() {
  return (await calls()).filter(({ channel }) => !readChannels.has(channel))
}
async function drainObserver() {
  await expect.poll(async () => (await calls()).filter(({ finished }) => !finished).length).toBe(0)
  await frames()
}
async function restoreObserver() {
  if (!observerInstalled || !application) return
  await restoreRenameGate()
  await drainObserver()
  await application.evaluate(() => {
    globalThis.igsRegionalCaptureNavigation = false
  })
  report.ipcCalls.push({ launch: report.nativeLaunchAttempts, calls: await calls() })
  const restored = await application.evaluate(({ ipcMain }) => {
    const restored = []
    for (const [channel, original] of globalThis.igsRegionalOriginals) {
      if (ipcMain._invokeHandlers.get(channel) !== globalThis.igsRegionalObservers.get(channel))
        throw new Error('Observer ownership changed: ' + channel)
      ipcMain._invokeHandlers.set(channel, original)
      if (ipcMain._invokeHandlers.get(channel) !== original)
        throw new Error('Original handler restoration failed: ' + channel)
      restored.push(channel)
    }
    return { restored, allOriginalHandlersRestored: true, inFlight: 0 }
  })
  report.observerRestorations.push(restored)
  observerInstalled = false
  checkpoint()
}
async function witness() {
  withinDeadline()
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
  assert.deepEqual(liveDocument.regionalGuidance, tab.regionalGuidance)
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
    files: dataHashes(),
    sql: sqlState(),
    ui,
    mutations: await mutations(),
  }
  return value
}
function mutationDelta(before, after, expected, label) {
  assert.deepEqual(after.mutations.slice(0, before.mutations.length), before.mutations)
  const actual = after.mutations.slice(before.mutations.length)
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
function assertRegionalShape(document) {
  const ids = ownedIds(document)
  assert.equal(new Set(ids).size, ids.length, 'All durable owned IDs must be globally unique')
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
  for (const item of document.regionalGuidance ?? []) {
    assert.deepEqual(Object.keys(item).sort(), [
      'enabled',
      'id',
      'locked',
      'mask',
      'name',
      'overlayOpacity',
    ])
    assert.deepEqual(item.mask, { id: item.mask.id, revision: 0, asset: null })
    assert.ok(item.overlayOpacity >= 0 && item.overlayOpacity <= 1)
  }
}
function withoutRegions(document) {
  const value = structuredClone(document)
  delete value.regionalGuidance
  delete value.documentRevision
  return value
}
function assertNeighbors(value, verifiedSaved = latestSaved) {
  assertRegionalShape(value.liveDocument)
  assert.deepEqual(
    withoutRegions(value.liveDocument),
    withoutRegions(fixture.saved),
    'Every Project/Smart draft, bbox, variant, provenance and seed snapshot must remain exact',
  )
  assertProtectedSql(value.sql, 'Project neighbor preservation', verifiedSaved)
}
function projectSavedIndexRows(rows, verifiedSaved) {
  const ids = new Set([
    fixture.raster.id,
    ...fixture.patches.flatMap((patch) => patch.rasterSubLayers.map(({ id }) => id)),
  ])
  const owned = rows.filter(
    (row) =>
      row.local_project_key === fixture.key &&
      row.document_id === verifiedSaved.project.documentId &&
      ids.has(row.layer_id),
  )
  assert.equal(
    owned.length,
    ids.size,
    'Every fixture accepted-result row must remain present exactly once',
  )
  assert.equal(new Set(owned.map((row) => row.layer_id)).size, ids.size)
  return rows
    .map((row) =>
      owned.includes(row)
        ? { ...row, document_revision: verifiedSaved.project.documentRevision }
        : { ...row },
    )
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}
function assertProtectedSql(sql, label, verifiedSaved = latestSaved) {
  assert.deepEqual(sql.schema, baseline.sql.schema, label + ': schema changed')
  assert.deepEqual(
    Object.keys(sql.tables),
    Object.keys(baseline.sql.tables),
    label + ': tables changed',
  )
  for (const [table, rows] of Object.entries(baseline.sql.tables)) {
    if (table === 'project_index') continue
    if (table === 'project_accepted_result_index') {
      // This derived index follows the last verified package, never the unsaved live revision.
      // Bind its owning Project row to the exact canonical path/key/document/revision and bytes.
      assert.equal(verifiedSaved.project.documentId, fixture.saved.documentId)
      assert.equal(
        digest(readFileSync(fixture.path)),
        verifiedSaved.sha256,
        label + ': verified saved package bytes changed',
      )
      const parent = sql.tables.project_index.filter(
        (row) =>
          row.local_project_key === fixture.key &&
          row.canonical_path === fixture.path &&
          row.document_id === verifiedSaved.project.documentId,
      )
      assert.equal(parent.length, 1, label + ': saved-index Project owner is not unique')
      assert.equal(
        parent[0].document_revision,
        verifiedSaved.project.documentRevision,
        label + ': saved-index owner differs from verified package revision',
      )
      assert.deepEqual(
        sql.tables[table],
        projectSavedIndexRows(rows, verifiedSaved),
        label + ': saved index changed beyond the exact verified package revision',
      )
    } else {
      assert.deepEqual(sql.tables[table], rows, label + ': protected SQL changed: ' + table)
    }
  }
}
function assertSavedIndexRevisionTransition(before, after, verifiedSaved, label) {
  const table = 'project_accepted_result_index'
  const record = {
    label,
    before: before.sql,
    after: after.sql,
    verifiedPackage: {
      path: fixture.path,
      localProjectKey: fixture.key,
      documentId: verifiedSaved.project.documentId,
      documentRevision: verifiedSaved.project.documentRevision,
      sha256: verifiedSaved.sha256,
    },
    actualAllowances: [],
    passed: false,
  }
  report.savedIndexRevisionTransitions.push(record)
  checkpoint()
  const expected = projectSavedIndexRows(before.sql.tables[table], verifiedSaved)
  for (const row of before.sql.tables[table]) {
    const projected = expected.find(
      (item) => item.local_project_key === row.local_project_key && item.layer_id === row.layer_id,
    )
    assert.ok(projected)
    if (projected.document_revision === row.document_revision) continue
    assert.equal(row.local_project_key, fixture.key)
    assert.equal(row.document_id, before.savedDocument.documentId)
    assert.equal(row.document_revision, before.savedDocument.documentRevision)
    record.actualAllowances.push({
      table,
      row: {
        local_project_key: row.local_project_key,
        layer_id: row.layer_id,
        document_id: row.document_id,
      },
      column: 'document_revision',
      before: row.document_revision,
      after: projected.document_revision,
      reason:
        'Explicit Save reindexes this exact fixture result under the newly verified saved package revision; every other column remains exact.',
    })
  }
  checkpoint()
  assert.deepEqual(after.sql.schema, before.sql.schema, label + ': Save changed schema')
  assert.deepEqual(
    after.sql.tables[table],
    expected,
    label + ': Save changed accepted-result rows beyond their exact verified revision',
  )
  record.passed = true
  checkpoint()
}
function assertSqlTransition(before, after, label, allowedIndexColumns = []) {
  // Never omit a table/row from this comparison. Only these explicitly named, derived timestamps
  // on the one reviewed Project row may differ; raw states and each actual allowance survive.
  const record = { label, before, after, allowedIndexColumns, actualAllowances: [], passed: false }
  report.sqlTransitions.push(record)
  checkpoint()
  const normalized = structuredClone(after)
  const identifiesProject = (row) =>
    row.local_project_key === fixture.key &&
    row.canonical_path === fixture.path &&
    row.document_id === latestSaved.project.documentId
  const beforeRows = before.tables.project_index.filter(identifiesProject)
  const afterRows = normalized.tables.project_index.filter(identifiesProject)
  assert.equal(beforeRows.length, 1, label + ': reviewed before row is not unique')
  assert.equal(afterRows.length, 1, label + ': reviewed after row is not unique')
  for (const column of allowedIndexColumns) {
    assert.ok(['indexed_at', 'last_opened_at'].includes(column))
    const previous = beforeRows[0][column],
      current = afterRows[0][column]
    if (previous === current) continue
    const previousTime =
      previous === null && column === 'last_opened_at' ? -Infinity : Date.parse(previous)
    const currentTime = Date.parse(current)
    assert.ok(
      (Number.isFinite(previousTime) || previousTime === -Infinity) &&
        Number.isFinite(currentTime) &&
        currentTime >= previousTime,
      label + ': invalid or backwards derived timestamp ' + column,
    )
    record.actualAllowances.push({
      table: 'project_index',
      row: {
        local_project_key: fixture.key,
        canonical_path: fixture.path,
        document_id: latestSaved.project.documentId,
      },
      column,
      before: previous,
      after: current,
      reason:
        column === 'indexed_at'
          ? 'Explicit Home refresh after this navigation reindexes the unchanged saved package.'
          : 'Successful actual Open/Recover calls ProjectIndex.markOpened for this exact Project.',
    })
    afterRows[0][column] = previous
  }
  normalized.tables.project_index.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  checkpoint()
  assert.deepEqual(normalized, before, label + ': SQL changed beyond recorded derived timestamps')
  record.passed = true
  checkpoint()
}
function exactRegionalChange(before, after, change, label) {
  const expected = structuredClone(before.liveDocument)
  change(expected, after)
  expected.documentRevision = after.liveDocument.documentRevision
  assert.notEqual(after.tab.documentRevision, before.tab.documentRevision)
  assert.deepEqual(after.liveDocument, expected, label)
  assert.deepEqual(after.savedDocument, before.savedDocument, 'Editing cannot Save')
  assert.equal(after.packageSha256, before.packageSha256, 'Editing cannot rewrite .igs')
  assert.deepEqual(after.sql, before.sql, 'Document edit changed SQL')
  assertExpectedDirty(after, expected, label)
  assert.equal(after.tab.canUndo, true, label + ': document mutation must remain undoable')
  assertNeighbors(after)
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
  const physical = await confirmQualificationProcessExit(nativeChecks)
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

const regionalSection = () => view().getByRole('region', { name: adapter.regionGroup, exact: true })
function regionalRow(tab, id) {
  const index = (tab.regionalGuidance ?? []).findIndex((item) => item.id === id)
  assert.ok(index >= 0)
  return regionalSection().locator('.entity-surface').nth(index)
}
async function idle() {
  await expect(button(adapter.add)).toBeEnabled()
  await drainObserver()
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
  // Capture full original replies only for this action's Open, not every diagnostic current()
  // read in the campaign. This changes observer retention only, never invocation or delivery.
  await application.evaluate(() => {
    globalThis.igsRegionalCaptureNavigation = true
  })
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
  assert.equal(openCall.response?.ok, true, 'Original Main Open must succeed')
  assert.equal(openCall.response.value.kind, recover ? 'recovery-required' : 'opened')
  if (recover) {
    assert.equal(openCall.response.value.projectId, fixture.key)
    assert.equal(openCall.response.value.recoveryStatus, 'recoverable')
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
  assert.equal(adoptionCall.response?.ok, true)
  const originalTab = recover ? adoptionCall.response.value : adoptionCall.response.value.tab
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
  assert.deepEqual(originalTab.regionalGuidance, expectedDocument.regionalGuidance)
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
  await idle()
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
  await application.evaluate(() => {
    globalThis.igsRegionalCaptureNavigation = false
  })
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
async function selectEntity(id) {
  const before = await witness()
  const item =
    (before.tab.regionalGuidance ?? []).find((value) => value.id === id) ??
    before.tab.layers.find((value) => value.id === id)
  assert.ok(item)
  const target = before.tab.regionalGuidance?.some((value) => value.id === id)
    ? regionalRow(before.tab, id).getByRole('button', { name: 'Select ' + item.name, exact: true })
    : selectButton(item.name)
  if ((await target.getAttribute('aria-pressed')) === 'true') return before
  await target.scrollIntoViewIfNeeded()
  await target.click()
  await expect(target).toHaveAttribute('aria-pressed', 'true')
  await idle()
  const after = await witness()
  mutationDelta(
    before,
    after,
    [{ channel: ipcChannels.projects.sealPromptHistory, args: [before.tab.id, null] }],
    'Intentional entity selection and its separate seal',
  )
  assert.deepEqual({ ...after, ui: before.ui, mutations: [] }, { ...before, mutations: [] })
  assert.deepEqual(after.ui, {
    ...before.ui,
    selected: ['Select ' + item.name],
    selectedId: id,
    selectedRegionIndex: (after.tab.regionalGuidance ?? []).findIndex((entry) => entry.id === id),
    selectedCompositingId: after.tab.layers.some((entry) => entry.id === id) ? id : null,
  })
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
async function changedUi(label, action, expectedCalls, change) {
  const before = await witness()
  await action(before.tab)
  await expect
    .poll(async () => (await current()).documentRevision)
    .not.toBe(before.tab.documentRevision)
  await idle()
  const after = await witness()
  mutationDelta(before, after, expectedCalls(before.tab), label)
  exactRegionalChange(before, after, change, label)
  return { before, after }
}
const sealed = (tab, channel, ...args) => [
  { channel: ipcChannels.projects.sealPromptHistory, args: [tab.id, null] },
  { channel, args: [tab.id, ...args] },
]
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
  await idle()
  const after = await witness()
  mutationDelta(
    before,
    after,
    sealed(before.tab, ipcChannels.projects[action]),
    'Intentional ' + action,
  )
  assertNeighbors(after)
  assert.equal(after.packageSha256, before.packageSha256, 'History cannot Save')
  assert.deepEqual(after.sql, before.sql)
  return after
}
const content = (document) => {
  const value = structuredClone(document)
  delete value.documentRevision
  return value
}
async function historyRoundTrip(result, label) {
  const undone = await historyUi('undo')
  assert.deepEqual(
    content(undone.liveDocument),
    content(result.before.liveDocument),
    label + ' Undo',
  )
  assert.equal(undone.tab.canRedo, true)
  assert.equal(undone.tab.canUndo, result.before.tab.canUndo)
  assertExpectedDirty(undone, result.before.liveDocument, label + ' Undo')
  const redone = await historyUi('redo')
  assert.deepEqual(
    content(redone.liveDocument),
    content(result.after.liveDocument),
    label + ' Redo',
  )
  assert.equal(redone.tab.canRedo, false)
  assert.equal(redone.tab.canUndo, result.after.tab.canUndo)
  assertExpectedDirty(redone, result.after.liveDocument, label + ' Redo')
  return redone
}
async function addRegion() {
  let added
  const result = await changedUi(
    'One explicit Add Regional Guidance',
    () => button(adapter.add).click(),
    (tab) => sealed(tab, adapter.channels.add, documentOwner(tab)),
    (expected, after) => {
      const existing = new Set(ownedIds(expected))
      const old = expected.regionalGuidance ?? []
      assert.equal(after.liveDocument.regionalGuidance.length, old.length + 1)
      added = after.liveDocument.regionalGuidance.at(-1)
      assert.deepEqual(added, {
        id: added.id,
        name: 'Regional Guidance',
        enabled: true,
        locked: false,
        overlayOpacity: 0.5,
        mask: { id: added.mask.id, revision: 0, asset: null },
      })
      assert.equal(existing.has(added.id), false)
      assert.equal(existing.has(added.mask.id), false)
      expected.regionalGuidance = [...old, structuredClone(added)]
    },
  )
  await expect(
    regionalRow(result.after.tab, added.id).getByRole('button', {
      name: 'Select ' + added.name,
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true')
  await historyRoundTrip(result, 'Add owns exactly one history step')
  return added.id
}
async function updateUi(id, change) {
  await selectEntity(id)
  const result = await changedUi(
    'Regional ' + change.kind,
    async (tab) => {
      const item = region(tab, id),
        row = regionalRow(tab, id)
      switch (change.kind) {
        case 'rename': {
          await menuItem(id, adapter.rename)
          const dialog = window.getByRole('dialog', { name: adapter.renameDialog, exact: true })
          await expect(dialog).toBeVisible()
          const input = dialog.getByRole('textbox', { name: adapter.renameInput, exact: true })
          await input.fill(change.name)
          await expect(input).toBeFocused()
          await dialog.getByRole('button', { name: adapter.renameSubmit, exact: true }).click()
          await expect(dialog).toHaveCount(0)
          break
        }
        case 'enabled':
          await row
            .getByRole('button', {
              name: (item.enabled ? 'Hide ' : 'Show ') + item.name,
              exact: true,
            })
            .click()
          break
        case 'lock':
          await row
            .getByRole('button', {
              name: (item.locked ? 'Unlock ' : 'Lock ') + item.name,
              exact: true,
            })
            .click()
          break
        case 'overlay-opacity': {
          const input = view().getByRole('textbox', { name: adapter.opacity, exact: true })
          await input.fill(String(change.overlayOpacity * 100))
          await input.press('Enter')
          break
        }
        default:
          assert.fail('Unsupported authored change')
      }
    },
    (tab) => sealed(tab, adapter.channels.update, entityOwner(tab, id), change),
    (expected) => {
      const item = expected.regionalGuidance.find((value) => value.id === id)
      if (change.kind === 'rename') item.name = change.name
      if (change.kind === 'enabled') item.enabled = change.enabled
      if (change.kind === 'lock') item.locked = change.locked
      if (change.kind === 'overlay-opacity') item.overlayOpacity = change.overlayOpacity
    },
  )
  const item = region(result.after.tab, id)
  const row = regionalRow(result.after.tab, id)
  await expect(
    row.getByRole('button', { name: 'Select ' + item.name, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    row.getByRole('button', { name: (item.enabled ? 'Hide ' : 'Show ') + item.name, exact: true }),
  ).toBeEnabled()
  await expect(
    row.getByRole('button', { name: (item.locked ? 'Unlock ' : 'Lock ') + item.name, exact: true }),
  ).toBeEnabled()
  await expect(view().getByRole('textbox', { name: adapter.opacity, exact: true })).toHaveValue(
    String(Number((item.overlayOpacity * 100).toPrecision(12))),
  )
  await historyRoundTrip(result, change.kind + ' owns one history step')
  return result
}
async function duplicateUi(id) {
  await selectEntity(id)
  let copy
  const result = await changedUi(
    'Duplicate regional owner with independent mask',
    () => menuItem(id, adapter.duplicate),
    (tab) => sealed(tab, adapter.channels.duplicate, entityOwner(tab, id)),
    (expected, after) => {
      const index = expected.regionalGuidance.findIndex((item) => item.id === id)
      const source = expected.regionalGuidance[index]
      copy = after.liveDocument.regionalGuidance[index + 1]
      const ids = new Set(ownedIds(expected))
      assert.equal(ids.has(copy.id), false)
      assert.equal(ids.has(copy.mask.id), false)
      assert.notEqual(copy.id, copy.mask.id)
      const proposed = source.name + ' copy'
      assert.deepEqual(copy, {
        ...source,
        id: copy.id,
        mask: { id: copy.mask.id, revision: 0, asset: null },
        name: Buffer.byteLength(proposed) <= 1024 ? proposed : source.name,
      })
      expected.regionalGuidance.splice(index + 1, 0, structuredClone(copy))
    },
  )
  await historyRoundTrip(result, 'Duplicate restores the same entity and mask IDs')
  return copy.id
}
async function deleteUi(id) {
  await selectEntity(id)
  const result = await changedUi(
    'Delete only the selected regional owner',
    () => menuItem(id, adapter.delete),
    (tab) => sealed(tab, adapter.channels.delete, entityOwner(tab, id)),
    (expected) => {
      expected.regionalGuidance = expected.regionalGuidance.filter((item) => item.id !== id)
      if (!expected.regionalGuidance.length) delete expected.regionalGuidance
    },
  )
  await historyRoundTrip(result, 'Delete restores exact owner and mask')
  return result
}
async function refused(method, args, expectedCode, label, channel, exactMessage = null) {
  const before = await witness()
  const offset = (await calls()).length
  const reply = await rawApi(method, ...args)
  assert.equal(reply.ok, false, label + ': expected refusal')
  assert.equal(reply.error.code, expectedCode, JSON.stringify(reply))
  if (exactMessage !== null) assert.equal(reply.error.message, exactMessage)
  const invocations = (await calls()).slice(offset).filter((call) => call.channel === channel)
  assert.equal(invocations.length, 1, 'Refusal must reach the original Main handler exactly once')
  assert.deepEqual(invocations[0].args, args)
  report.refusals.push({ label, method, args, reply, invocations })
  await unchanged(before, label, [{ channel, args, ok: false }])
  return reply
}
async function lockedControls() {
  await updateUi(regionA, { kind: 'lock', locked: true })
  await selectEntity(fixture.raster.id)
  await selectEntity(regionA)
  const before = await witness()
  await expect(view().getByRole('textbox', { name: adapter.opacity, exact: true })).toBeDisabled()
  await menuItem(regionA, adapter.rename, false)
  for (const label of [adapter.rename, adapter.duplicate, adapter.delete])
    await expect(window.getByRole('menuitem', { name: label, exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  await window.keyboard.press('Escape')
  await expect(window.getByRole('menuitem')).toHaveCount(0)
  await unchanged(before, 'Locked menus and opacity inspection are strict no-ops')
  for (const [method, change, channel] of [
    [
      'updateRegionalGuidance',
      { kind: 'rename', name: 'Forbidden locked rename' },
      adapter.channels.update,
    ],
    [
      'updateRegionalGuidance',
      { kind: 'overlay-opacity', overlayOpacity: 0.91 },
      adapter.channels.update,
    ],
    ['duplicateRegionalGuidance', null, adapter.channels.duplicate],
    ['deleteRegionalGuidance', null, adapter.channels.delete],
  ]) {
    const tab = await current()
    const args = [tab.id, entityOwner(tab, regionA), ...(change ? [change] : [])]
    await refused(method, args, 'PROJECT_LAYER_LOCKED', 'Locked ' + method, channel)
  }
  await updateUi(regionA, { kind: 'enabled', enabled: false })
  await updateUi(regionA, { kind: 'enabled', enabled: true })
  await updateUi(regionA, { kind: 'lock', locked: false })
  await updateUi(regionA, { kind: 'overlay-opacity', overlayOpacity: 0.37 })
  check(
    '04 Locked selection/enabled/unlock remain usable; rename/opacity/duplicate/delete refuse at Main; unlocked edit succeeds',
  )
}
async function assertPrompt(text) {
  const editor = view().getByRole('textbox', { name: 'Positive prompt', exact: true })
  await expect
    .poll(async () => (await editor.locator('.cm-line').allTextContents()).join('\n'))
    .toBe(text)
}
async function unsupportedControls() {
  const tab = await current()
  const selected = region(tab, regionA)
  const row = regionalRow(tab, selected.id)
  const before = await witness()
  await expect(view().getByText(adapter.display, { exact: true })).toBeVisible()
  await assertPrompt(fixture.saved.generationDraft.positivePrompt.text)
  await expect(row.getByText(adapter.unsupportedReason, { exact: true })).toBeVisible()
  for (const label of adapter.promptActions) {
    const action = row.getByRole('button', { name: label, exact: true })
    await expect(action).toBeDisabled()
    const group = row.getByRole('group', { name: label + ' unavailable', exact: true })
    await group.focus()
    await expect(group).toBeFocused()
    const description = await group.getAttribute('aria-describedby')
    assert.ok(description)
    assert.equal(
      await window.locator('[id="' + description + '"]').innerText(),
      adapter.unsupportedReason,
    )
  }
  for (const label of adapter.regionTools) {
    await expect(canvas().getByRole('button', { name: label, exact: true })).toBeDisabled()
    const group = canvas().getByRole('group', { name: label + ' unavailable', exact: true })
    await group.focus()
    await expect(group).toBeFocused()
  }
  await expect(
    canvas().getByText('Regional mask editing is not available yet.', { exact: true }),
  ).toBeVisible()
  for (const label of ['Bounding Box tool', 'Fit BBox to Mask', 'Fit Patch BBox to Mask'])
    await expect(canvas().getByRole('button', { name: label, exact: true })).toHaveCount(0)
  await unchanged(before, 'Unsupported controls explain their limits and issue no mutation/seal')
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
async function disabledControls() {
  for (const id of (await current()).regionalGuidance.map((item) => item.id)) {
    if (region(await current(), id).locked) await updateUi(id, { kind: 'lock', locked: false })
    if (region(await current(), id).enabled) await updateUi(id, { kind: 'enabled', enabled: false })
  }
  for (const smart of [false, true]) {
    await selectEntity(smart ? fixture.patches[0].id : fixture.raster.id)
    const before = await witness()
    await expect(view().locator('.generation-blocking-reason')).not.toHaveText(regionalReason, {
      useInnerText: true,
    })
    await expect(view().locator('.generation-blocking-reason')).toContainText(
      /model|runtime|engine/i,
    )
    await expect(button('Generate')).toBeDisabled()
    const tab = before.tab
    const request = smart
      ? {
          ...documentOwner(tab),
          iterations: 1,
          kind: 'smart-patch',
          layerId: fixture.patches[0].id,
        }
      : { documentId: tab.documentId, iterations: 1 }
    const channel = smart ? ipcChannels.projects.generateSmartPatch : ipcChannels.projects.generate
    const offset = (await calls()).length
    const reply = await rawApi(smart ? 'generateSmartPatch' : 'generate', tab.id, request)
    assert.equal(reply.ok, false, 'Offline control cannot admit a job')
    assert.notEqual(reply.error.code, regionalCode)
    assert.match(reply.error.message, /model|runtime|engine|checkpoint/i)
    const actual = (await calls()).slice(offset).filter((call) => call.channel === channel)
    assert.equal(actual.length, 1)
    assert.deepEqual(actual[0].args, [tab.id, request])
    report.refusals.push({
      label: 'Disabled regions fall through normal offline refusal',
      smart,
      reply,
      actual,
    })
    await unchanged(before, 'Disabled region is inert at real Main boundary', [
      { channel, args: [tab.id, request], ok: false },
    ])
  }
  await updateUi(regionA, { kind: 'enabled', enabled: true })
  await blockedGeneration(false)
  check(
    '08 All-disabled regions reach existing offline/model refusal; re-enabled region restores guard; no successful admission claim',
  )
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
async function armRenameGate(mode, tab, id, name) {
  assert.equal(scenario, 'rename-focus', 'Controlled Rename gates are focused-only')
  assert.ok(['delayed-original', 'transport-error'].includes(mode))
  assert.equal(renameGateArmed, false)
  await application.evaluate(
    (_, contract) => {
      if (globalThis.igsRegionalRenameGate) throw new Error('An owned Rename gate is already armed')
      const gate = {
        ...contract,
        held: false,
        released: false,
        completed: false,
        originalCalls: 0,
        throwMessage: 'Owned rename-focus IPC transport failure before original Main handler',
      }
      gate.delivery = new Promise((resolve) => {
        gate.release = resolve
      })
      globalThis.igsRegionalRenameGate = gate
    },
    { mode, tabId: tab.id, ...entityOwner(tab, id), name },
  )
  renameGateArmed = true
}
async function renameGateState() {
  return application.evaluate(() => {
    const gate = globalThis.igsRegionalRenameGate
    if (!gate) return null
    const { mode, held, released, completed, originalCalls, callId, args, throwMessage } = gate
    return { mode, held, released, completed, originalCalls, callId, args, throwMessage }
  })
}
async function releaseRenameGate() {
  if (!renameGateArmed || !application) return
  await application.evaluate(() => {
    const gate = globalThis.igsRegionalRenameGate
    if (!gate) throw new Error('Owned Rename gate disappeared')
    gate.released = true
    gate.release()
  })
  const state = await renameGateState()
  if (state?.held) await expect.poll(async () => (await renameGateState())?.completed).toBe(true)
}
async function restoreRenameGate() {
  if (!renameGateArmed) return
  if (!application) throw new Error('Cannot restore an armed Rename gate without its owned actor')
  await releaseRenameGate()
  const state = await renameGateState()
  report.renameFocusGateRestorations ??= []
  report.renameFocusGateRestorations.push(state)
  await application.evaluate(() => {
    globalThis.igsRegionalRenameGate = null
  })
  assert.equal(await renameGateState(), null)
  renameGateArmed = false
  checkpoint()
}
async function renameFocusProbes() {
  assert.equal(scenario, 'rename-focus')
  await selectEntity(regionA)
  // Execute all three fixed subcases even when a focus assertion is RED. Every substantial state
  // assertion still fails immediately; a focus-only RED retains its successful Undo/control.
  for (const mode of ['delayed-original', 'transport-error', 'ordinary-original']) {
    const before = await witness()
    const originalRegion = region(before.tab, regionA)
    const name =
      mode === 'delayed-original'
        ? 'Delayed acknowledged Rename owner'
        : mode === 'transport-error'
          ? 'Transport-refused Rename owner'
          : 'Ordinary successful Rename owner'
    const change = { kind: 'rename', name }
    const requestArgs = [before.tab.id, entityOwner(before.tab, regionA), change]
    const record = {
      mode,
      regionId: regionA,
      before,
      requestArgs,
      focusPassed: false,
      boundary:
        mode === 'transport-error'
          ? 'DECLARED UI TRANSPORT FAULT ONLY: actual Error before original Main; expected original calls0. Not a Main/service refusal/atomicity qualification.'
          : 'Actual original Main handler exactly once; no response replacement.',
    }
    report.renameFocusProbes.push(record)
    checkpoint()
    let retiringBody
    try {
      if (mode !== 'ordinary-original') await armRenameGate(mode, before.tab, regionA, name)
      await menuItem(regionA, adapter.rename)
      const dialog = window.getByRole('dialog', { name: adapter.renameDialog, exact: true })
      await expect(dialog).toBeVisible()
      retiringBody = await dialog.elementHandle()
      assert.ok(retiringBody)
      const input = dialog.getByRole('textbox', { name: adapter.renameInput, exact: true })
      await input.fill(name)
      await expect(input).toBeFocused()
      await dialog.getByRole('button', { name: adapter.renameSubmit, exact: true }).click()
      if (mode !== 'ordinary-original') {
        await expect.poll(async () => (await renameGateState())?.held).toBe(true)
        await expect(button(adapter.add)).toBeDisabled()
        record.busyWhileOriginalNotCalled = true
        const held = await renameGateState()
        assert.equal(held.originalCalls, 0)
        assert.equal(held.completed, false)
        assert.deepEqual(held.args, requestArgs)
        assert.deepEqual(await current(), before.tab, 'Held invocation cannot publish a document')
        await expect(dialog).toHaveCount(0)
        await expect.poll(() => retiringBody.evaluate((node) => !node.isConnected)).toBe(true)
        await frames()
        record.afterLeaveBarrier = {
          modalBodyDisconnected: await retiringBody.evaluate((node) => !node.isConnected),
          originalStillNotCalled: (await renameGateState()).originalCalls === 0,
          gate: await renameGateState(),
          evidence:
            'Actual retiring NDialog body was removed; two renderer frames passed after its transition/afterLeave cleanup before release.',
        }
        assert.equal(record.afterLeaveBarrier.modalBodyDisconnected, true)
        assert.equal(record.afterLeaveBarrier.originalStillNotCalled, true)
        await releaseRenameGate()
      } else {
        await expect(dialog).toHaveCount(0)
        await expect.poll(() => retiringBody.evaluate((node) => !node.isConnected)).toBe(true)
      }
      await idle()
      const after = await witness()
      record.after = after
      const delta = after.mutations.slice(before.mutations.length)
      assert.deepEqual(after.mutations.slice(0, before.mutations.length), before.mutations)
      record.actualCalls = delta
      if (mode === 'transport-error') {
        const errorCopy = 'The application could not reach the Project service.'
        await expect(view().getByText('Project action failed', { exact: true })).toBeVisible()
        await expect(view().getByText(errorCopy, { exact: true })).toBeVisible()
        record.actualVisibleError = errorCopy
        record.preloadExpectedCodeFromSource = 'IPC_UNAVAILABLE'
        assert.equal(delta.length, 2)
        assert.deepEqual(
          delta.map(({ channel, args, originalCalls, finished, delivered, ok }) => ({
            channel,
            args,
            originalCalls,
            finished,
            delivered,
            ok,
          })),
          [
            {
              channel: ipcChannels.projects.sealPromptHistory,
              args: [before.tab.id, null],
              originalCalls: 1,
              finished: true,
              delivered: true,
              ok: true,
            },
            {
              channel: adapter.channels.update,
              args: requestArgs,
              originalCalls: 0,
              finished: true,
              delivered: false,
              ok: null,
            },
          ],
        )
        assert.equal(delta[1].transportFault, true)
        assert.equal(delta[1].thrown.name, 'Error')
        assert.equal(
          delta[1].thrown.message,
          'Owned rename-focus IPC transport failure before original Main handler',
        )
        // The real error banner changes Canvas viewport height; ProjectCanvas's ResizeObserver
        // may re-fit/recenter its transient camera. Keep both raw witnesses and compare every
        // other field, including selection, full document/history/SQL/package/product bytes.
        const normalizeErrorLayout = (value) => ({
          ...value,
          mutations: [],
          ui: { ...value.ui, camera: null },
        })
        assert.deepEqual(
          normalizeErrorLayout(after),
          normalizeErrorLayout(before),
          'Transport error changed owner/document/history/SQL/package/product bytes',
        )
        record.transientErrorLayout = {
          before: before.ui.camera,
          after: after.ui.camera,
          reason:
            'Actual Project action failed banner resizes Canvas; no camera or document command is injected.',
        }
        report.renameFocusFaults.push({
          mode,
          originalCalls: 0,
          thrown: delta[1].thrown,
          actualVisibleError: errorCopy,
          before,
          after,
        })
      } else {
        mutationDelta(
          before,
          after,
          sealed(before.tab, adapter.channels.update, entityOwner(before.tab, regionA), change),
          mode + ' exact original Rename invocation',
        )
        assert.ok(delta.every(({ originalCalls }) => originalCalls === 1))
        exactRegionalChange(
          before,
          after,
          (expected) => {
            expected.regionalGuidance.find(({ id }) => id === regionA).name = name
          },
          mode + ' changes only the intended region name',
        )
      }
      const expectedName = mode === 'transport-error' ? originalRegion.name : name
      const trigger = regionalRow(after.tab, regionA).getByRole('button', {
        name: 'Layer actions for ' + expectedName,
        exact: true,
      })
      await expect(trigger).toBeEnabled()
      record.actualFocus = await window.evaluate(() => ({
        tag: document.activeElement?.tagName,
        name: document.activeElement?.getAttribute('aria-label'),
        connected: document.activeElement?.isConnected ?? false,
      }))
      try {
        await expect(trigger).toBeFocused({ timeout: 1800 })
        record.focusPassed = true
      } catch (error) {
        record.focusFailure = { message: error.message }
      }
      await screenshot('rename-focus-' + mode)
      if (mode !== 'transport-error') {
        const undone = await historyUi('undo')
        assert.deepEqual(
          content(undone.liveDocument),
          content(before.liveDocument),
          mode + ' Undo restores the exact original region name and all neighbors',
        )
        assertExpectedDirty(undone, before.liveDocument, mode + ' Undo')
        assert.equal(undone.tab.canUndo, before.tab.canUndo)
        record.undone = undone
      }
      record.stateAssertionsPassed = true
    } finally {
      await restoreRenameGate()
      await retiringBody?.dispose()
      checkpoint()
    }
  }
}
async function finishRenameFocus() {
  assert.equal(scenario, 'rename-focus')
  assert.equal(report.renameFocusProbes.length, 3)
  assert.equal(report.renameFocusFaults.length, 1)
  assert.equal(report.checks.length, 0, 'Focused mode must never emit completion PASS12')
  await restoreRenameGate()
  const beforeRemove = await witness()
  const removed = await historyUi('undo')
  assert.deepEqual(
    removed.liveDocument,
    latestSaved.project,
    'One final Undo removes the sole Add and restores the exact saved baseline',
  )
  assert.equal(beforeRemove.tab.regionalGuidance.length, 1)
  assert.equal(removed.tab.canUndo, false)
  assert.equal(removed.tab.dirty, false)
  await snapshot('rename-focus-final-before-close')
  const beforeClose = await cleanCloseProject('Focused final clean close')
  await restoreObserver()
  await closeNative('rename-focus-healthy-close')
  const finalDatabase = await retainDatabase('rename-focus-final-after-physical-exit', true)
  report.finalDatabaseAfterLastUiAndPhysicalExit = true
  checkpoint()
  await snapshot('rename-focus-final-full-payload', { closed: true, afterNativeExit: true })
  assertProtectedSql(finalDatabase.state, 'Focused final protected state')
  assertSqlTransition(beforeClose.sql, finalDatabase.state, 'Focused shutdown exact SQL', [
    'indexed_at',
  ])
  assert.equal(digest(readFileSync(fixture.path)), latestSaved.sha256)
  const loaded = await readIgsPackage(fixture.path)
  assert.deepEqual(loaded.project, latestSaved.project)
  await exactPngs(loaded)
  verifyRetainedBytes()
  verifyRetainedBuild()
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256)
  assert.deepEqual(hashes(bundleFiles), report.bundleSha256)
  assert.equal(digest(readFileSync(candidateFile)), report.candidateScript.sha256)
  assert.equal(report.nativeClosures.length, 1)
  assert.equal(report.nativeClosures[0].kind, 'healthy')
  assert.equal(report.nativeClosures[0].code, 0)
  assert.equal(report.nativeClosures[0].confirmed, true)
  assert.equal(report.observerRestorations.length, 1)
  assert.equal(renameGateArmed, false)
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.samplerError, undefined)
  const allCalls = report.ipcCalls.flatMap(({ calls: records }) => records)
  assert.equal(allCalls.filter(({ transportFault }) => transportFault).length, 1)
  assert.ok(allCalls.every((call) => call.originalCalls === (call.transportFault ? 0 : 1)))
  report.focusedUiOnly = true
  report.fullTwelveCheckQualification = false
  report.focusedSummary = report.renameFocusProbes.map(
    ({ mode, stateAssertionsPassed, focusPassed }) => ({
      mode,
      stateAssertionsPassed,
      focusPassed,
    }),
  )
  checkpoint()
  withinDeadline()
  assert.ok(
    report.renameFocusProbes.every(
      ({ stateAssertionsPassed, focusPassed }) => stateAssertionsPassed && focusPassed,
    ),
    'Rename return-focus regression: state controls passed, but one or more actual row triggers did not receive focus',
  )
}

async function layoutAndFocus() {
  await selectEntity(regionA)
  for (const [width, height] of [
    [1440, 900],
    [900, 620],
  ]) {
    await setNativeSize(width, height)
    const before = await witness()
    const tab = before.tab,
      item = region(tab, regionA)
    const row = regionalRow(tab, regionA)
    await button(adapter.add).scrollIntoViewIfNeeded()
    await layout(button(adapter.add), 'regional-add-' + width, 'icon')
    await row.scrollIntoViewIfNeeded()
    await layout(row, 'regional-row-' + width)
    const input = view().getByRole('textbox', { name: adapter.opacity, exact: true })
    await input.scrollIntoViewIfNeeded()
    const opacitySurface = view()
      .locator('.opacity-input')
      .filter({
        has: window.getByRole('textbox', { name: adapter.opacity, exact: true }),
      })
    await layout(opacitySurface, 'regional-opacity-' + width)
    await unsupportedControls()
    await row.scrollIntoViewIfNeeded()
    const select = row.getByRole('button', { name: 'Select ' + item.name, exact: true })
    await select.focus()
    await expect(select).toBeFocused()
    await window.keyboard.press('Tab')
    const focused = await window.evaluate(() => ({
      name: document.activeElement?.getAttribute('aria-label'),
      tag: document.activeElement?.tagName,
    }))
    assert.equal(focused.name, 'Lock ' + item.name, 'Tab must reach the next actual row control')
    await menuItem(regionA, adapter.rename)
    const dialog = window.getByRole('dialog', { name: adapter.renameDialog, exact: true })
    const rename = dialog.getByRole('textbox', { name: adapter.renameInput, exact: true })
    await expect(dialog).toBeVisible()
    await rename.focus()
    await expect(rename).toBeFocused()
    await layout(dialog, 'rename-dialog-' + width)
    await screenshot('regional-' + width + '-rename-focus')
    await rename.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(window.getByRole('menuitem')).toHaveCount(0)
    const focusReturn = await window.evaluate(() => ({
      tag: document.activeElement?.tagName,
      name: document.activeElement?.getAttribute('aria-label'),
    }))
    report.layoutChecks.push({ label: 'Rename Escape focus return ' + width, ...focusReturn })
    await expect(
      row.getByRole('button', {
        name: 'Layer actions for ' + item.name,
        exact: true,
      }),
    ).toBeFocused()
    // Focus/scroll are transient. Document/history/SQL/selection/camera/seals stay exact.
    await unchanged(before, 'Native resize/focus/canceled rename ' + width)
    const stack = view().getByRole('complementary', { name: 'Project layers', exact: true })
    const reach = await stack.evaluate((node) => {
      const top = node.scrollTop
      node.scrollTop = node.scrollHeight
      return {
        before: top,
        after: node.scrollTop,
        maximum: node.scrollHeight - node.clientHeight,
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        viewport: [innerWidth, innerHeight],
      }
    })
    assert.ok(reach.scrollWidth <= reach.clientWidth + 1, 'Layer panel horizontally overflows')
    if (height === 620) {
      assert.ok(
        reach.maximum > 0 && reach.after > 0,
        'Minimum native window must exercise actual scrolling',
      )
      assert.ok(Math.abs(reach.after - reach.maximum) <= 1)
    }
    report.layoutChecks.push({ label: 'Actual layer panel scroll reach ' + width, ...reach })
    await screenshot('regional-' + width + '-scrolled-neighbors')
    await row.scrollIntoViewIfNeeded()
    await screenshot('regional-' + width + '-selected-entity')
    await assertPrompt(fixture.saved.generationDraft.positivePrompt.text)
  }
  await setNativeSize(1440, 900)
  await selectEntity(fixture.raster.id)
  await screenshot('regional-unselected-group-and-ordinary-neighbor')
  await selectEntity(regionA)
  check(
    '09 Actual native 1440x900/900x620 sizing, selected/unselected grouped surfaces, glyphs/icons/hits, keyboard focus, disabled reasons and scrolling; screenshots await root inspection',
  )
}
async function writeMetadataPackage(sourcePackage, document, file) {
  const projectBytes = Buffer.from(JSON.stringify(document))
  const manifest = structuredClone(sourcePackage.manifest)
  const entry = manifest.members.find(({ path: member }) => member === 'project.json')
  assert.ok(entry)
  entry.bytes = projectBytes.length
  entry.sha256 = digest(projectBytes)
  const zip = new yazl.ZipFile()
  zip.addBuffer(Buffer.from(IGS_MIMETYPE), 'mimetype', { compress: false })
  zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json', { compress: false })
  for (const member of manifest.members) {
    zip.addBuffer(
      member.path === 'project.json' ? projectBytes : await sourcePackage.readMember(member.path),
      member.path,
      { compress: false },
    )
  }
  zip.end()
  await pipeline(zip.outputStream, createWriteStream(file, { flags: 'wx', mode: 0o600 }))
}
async function strictLoaderControls() {
  const saved = await readIgsPackage(fixture.path)
  assert.ok(saved.project.regionalGuidance?.length)
  const directory = path.join(fixtureRoot, 'strict-loader-controls')
  mkdirSync(directory, { mode: 0o700 })
  const cases = [
    [
      'unknown-document-field',
      (doc) => {
        doc.unknownRegionalFoundation = true
      },
    ],
    [
      'unknown-entity-field',
      (doc) => {
        doc.regionalGuidance[0].kind = 'regional-guidance'
      },
    ],
    [
      'unsupported-prompt-field',
      (doc) => {
        doc.regionalGuidance[0].positivePrompt = ''
      },
    ],
    [
      'nonnull-mask',
      (doc) => {
        doc.regionalGuidance[0].mask.asset = structuredClone(fixture.patches[0].mask.asset)
      },
    ],
    [
      'nonzero-mask-revision',
      (doc) => {
        doc.regionalGuidance[0].mask.revision = 1
      },
    ],
    [
      'raster-id-collision',
      (doc) => {
        doc.regionalGuidance[0].id = fixture.raster.id
      },
    ],
    [
      'smart-id-collision',
      (doc) => {
        doc.regionalGuidance[0].id = fixture.patches[0].id
      },
    ],
    [
      'smart-mask-id-collision',
      (doc) => {
        doc.regionalGuidance[0].mask.id = fixture.patches[0].mask.id
      },
    ],
    [
      'variant-id-collision',
      (doc) => {
        doc.regionalGuidance[0].mask.id = fixture.patches[0].rasterSubLayers[0].id
      },
    ],
    [
      'regional-id-collision',
      (doc) => {
        doc.regionalGuidance[1].mask.id = doc.regionalGuidance[0].id
      },
    ],
    [
      'oversized-regional-array',
      (doc) => {
        doc.regionalGuidance = Array.from({ length: 10_001 }, () => ({
          ...doc.regionalGuidance[0],
          id: randomUUID(),
          mask: { id: randomUUID(), revision: 0, asset: null },
        }))
      },
    ],
  ]
  report.loaderRefusals = []
  for (const [name, mutate] of cases) {
    withinDeadline()
    const document = structuredClone(saved.project)
    mutate(document)
    const file = path.join(directory, name + '.igs')
    await writeMetadataPackage(saved, document, file)
    let refusal
    try {
      await readIgsPackage(file)
    } catch (error) {
      refusal = { name: error.name, code: error.code, message: error.message }
    }
    assert.equal(
      refusal?.code,
      'INVALID_PROJECT',
      name + ': real ZIP loader must reject the schema',
    )
    const retained = retain(file, 'strict-loader/' + name + '.igs')
    report.loaderRefusals.push({ name, retained, refusal })
    checkpoint()
  }
}
async function exactPngs(loaded) {
  for (const input of fixture.inputs)
    assert.ok(
      (await loaded.readMember(input.member)).equals(input.bytes),
      'Full input PNG changed: ' + input.member,
    )
  const assets = loaded.manifest.members
    .filter(({ path: member }) => member.startsWith('assets/'))
    .map(({ path: member }) => member)
    .sort()
  assert.deepEqual(
    assets,
    fixture.inputs.map(({ member }) => member).sort(),
    'Empty regional masks must not create package asset members',
  )
}
async function saveUi(label, { meaningful = true } = {}) {
  const before = await witness()
  assertNeighbors(before)
  if (!meaningful) {
    assert.equal(before.tab.dirty, false)
    assert.equal(before.tab.canUndo, false)
    assert.equal(before.tab.canRedo, false)
    assert.equal(Object.hasOwn(before.liveDocument, 'regionalGuidance'), false)
  }
  await snapshot(label + '-before-save')
  const save = button('Save Project')
  // Current ProjectView disables Save for reload/busy/invalid inputs, not for a clean document.
  // This is a real admitted button click, not a forced click or an internal Main call.
  await expect(save).toBeEnabled()
  const boundary = meaningful
    ? 'Built renderer dirty Save button'
    : 'Built renderer clean legacy Save button'
  await save.click()
  await idle()
  await expect.poll(async () => (await current()).dirty).toBe(false)
  await expect(view().locator('.document-state')).toHaveText('Saved')
  const loaded = await readIgsPackage(fixture.path)
  assert.deepEqual(
    loaded.project,
    before.liveDocument,
    'Real package loader differs from acknowledged current document',
  )
  const sha256 = digest(readFileSync(fixture.path))
  if (meaningful)
    assert.notEqual(
      sha256,
      before.packageSha256,
      'Meaningful Save must actually replace package bytes',
    )
  await exactPngs(loaded)
  const after = await witness()
  mutationDelta(
    before,
    after,
    sealed(before.tab, ipcChannels.projects.save),
    boundary + ' and its own exact seal',
  )
  assert.deepEqual(after.liveDocument, before.liveDocument)
  assert.equal(after.tab.canUndo, before.tab.canUndo, 'Save cannot add a history step')
  assert.equal(after.tab.canRedo, before.tab.canRedo, 'Save cannot clear redo history')
  if (!meaningful) {
    assert.equal(Object.hasOwn(loaded.project, 'regionalGuidance'), false)
    assert.equal(Object.hasOwn(after.liveDocument, 'regionalGuidance'), false)
    const originalSavedTab = (await calls()).findLast(
      ({ channel }) => channel === ipcChannels.projects.save,
    )?.response?.value?.tab
    assert.ok(originalSavedTab, 'Clean Save must retain its original successful Main ProjectTab')
    assert.equal(originalSavedTab.documentId, before.tab.documentId)
    assert.equal(originalSavedTab.documentRevision, before.tab.documentRevision)
    assert.equal(originalSavedTab.dirty, false)
    assert.equal(originalSavedTab.canUndo, false)
    assert.equal(originalSavedTab.canRedo, false)
    report.cleanLegacySave = {
      boundary,
      buttonEnabled: true,
      semanticNoOp: true,
      originalSavedTab,
      before,
      after,
      packageBefore: before.packageSha256,
      packageAfter: sha256,
      packageBytesMayBeRewrittenByExplicitSave: true,
    }
  }
  const verifiedSaved = { project: loaded.project, sha256 }
  assertSavedIndexRevisionTransition(before, after, verifiedSaved, boundary)
  assertNeighbors(after, verifiedSaved)
  latestSaved = verifiedSaved
  await snapshot(label + '-after-save-real-loader')
  return loaded
}
async function cleanCloseProject(label) {
  const before = await witness()
  assert.equal(before.tab.dirty, false, 'Clean close cannot hide a discard')
  await window.getByRole('button', { name: 'Close ' + projectTitle, exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveCount(0)
  await expect(window.getByRole('dialog', { name: 'Close Project', exact: true })).toHaveCount(0)
  await expect(window.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled()
  await drainObserver()
  const delta = (await mutations()).slice(before.mutations.length)
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
  report.expectedActions.push({ label, before, delta })
  assert.equal(digest(readFileSync(fixture.path)), latestSaved.sha256)
  checkpoint()
  return before
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
async function saveAndReopen() {
  const loaded = await saveUi('10-edited-regions')
  assert.deepEqual(
    loaded.project.regionalGuidance.find((item) => item.id === duplicateRegion),
    region(await current(), duplicateRegion),
    'The independently edited duplicate and its fresh mask must persist',
  )
  await strictLoaderControls()
  await cleanCloseProject('Clean close after meaningful Save')
  await reopenSaved('10-clean-reopened')
  await selectEntity(regionA)
  await expect(view().getByRole('textbox', { name: adapter.opacity, exact: true })).toHaveValue('0')
  check(
    '10 Meaningful UI Save changes .igs; strict actual loader/reopen retains edited regions and exact ordinary/Smart PNG/provenance without new assets; malformed schema/collisions refuse',
  )
}
async function recovery() {
  await updateUi(regionA, { kind: 'rename', name: 'Recovered regional owner α' })
  const dirty = await witness()
  assert.equal(dirty.tab.dirty, true)
  assert.equal(dirty.packageSha256, latestSaved.sha256)
  const store = new ProjectShadowStore(path.join(appDataRoot, 'autosave'))
  const saved = await readIgsPackage(fixture.path)
  const inspected = await store.inspect({ projectPath: fixture.path, savedPackage: saved })
  assert.equal(inspected.status, 'recoverable')
  assert.deepEqual(inspected.document, dirty.liveDocument)
  const manifestPath = path.join(appDataRoot, 'autosave', fixture.key, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.state, 'dirty')
  assert.equal(manifest.documentRevision, dirty.tab.documentRevision)
  const shadowDocumentPath = path.join(
    path.dirname(manifestPath),
    'snapshots',
    manifest.snapshotId,
    'project.json',
  )
  const shadowBytes = readFileSync(shadowDocumentPath)
  assert.equal(digest(shadowBytes), manifest.documentHash)
  assert.deepEqual(JSON.parse(shadowBytes), dirty.liveDocument)
  await snapshot('11-dirty-before-intentional-crash')
  report.dirtyCrashPrecondition = {
    documentId: dirty.tab.documentId,
    documentRevision: dirty.tab.documentRevision,
    manifest,
    shadowDocumentSha256: digest(shadowBytes),
    durableShadowRetained: true,
    packageUnchanged: dirty.packageSha256 === latestSaved.sha256,
    dirtyDocument: dirty.liveDocument,
    sourcePackageSha256: latestSaved.sha256,
  }
  checkpoint()
  await restoreObserver()
  await closeNative('declared-dirty-crash', 'intentional-dirty-crash')
  await snapshot('11-after-dirty-physical-exit', { closed: true, afterNativeExit: true })
  await launch('recovery-same-overall-deadline')
  const recovered = await openProject('11-explicit-dirty-recovery', true)
  assert.equal(recovered.tab.dirty, true)
  assert.equal(recovered.tab.canUndo, false)
  assert.equal(recovered.tab.canRedo, false)
  assert.deepEqual(
    content(recovered.liveDocument),
    content(dirty.liveDocument),
    'Recover must retain every exact source property apart from the declared fresh document revision',
  )
  assert.notEqual(recovered.liveDocument.documentRevision, dirty.liveDocument.documentRevision)
  assert.deepEqual(recovered.savedDocument, latestSaved.project)
  assert.equal(recovered.packageSha256, latestSaved.sha256, 'Recover cannot implicitly Save')
  assert.deepEqual(
    recovered.sql.tables.generation_seed_cursor,
    dirty.sql.tables.generation_seed_cursor,
  )
  assertNeighbors(recovered)
  await selectEntity(regionA)
  await expect(
    regionalRow(await current(), regionA).getByRole('button', {
      name: 'Select Recovered regional owner α',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true')
  await screenshot('recovered-dirty-regional-owner')
  await snapshot('11-recovered-dirty')
  await saveUi('11-recovered')
  await cleanCloseProject('Recovered explicit Save clean close')
  await reopenSaved('11-recovered-saved-reopened')
  check(
    '11 Durable dirty shadow and unchanged package precede intentional owned crash; physical exit, real Home Recover, exact source properties, explicit Save and reopen succeed without resetting deadline',
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
async function finish() {
  await snapshot('12-final-open-before-last-ui')
  const justBeforeClose = await cleanCloseProject('Final authorized clean Project close')
  report.shutdownBefore = { sql: justBeforeClose.sql, saved: latestSaved }
  checkpoint()
  await restoreObserver()
  await closeNative('final-healthy-native-close')
  // This backup remains first after exit, independent of every package/PNG/source witness.
  const finalDatabase = await retainDatabase('12-final-after-last-ui-and-physical-exit', true)
  report.finalDatabaseAfterLastUiAndPhysicalExit = true
  checkpoint()
  await snapshot('12-final-full-product-bytes', { closed: true, afterNativeExit: true })
  assertProtectedSql(finalDatabase.state, 'Final physically closed state vs original baseline')
  assertSqlTransition(
    justBeforeClose.sql,
    finalDatabase.state,
    'Final clean close and shutdown vs just-before-close full SQL',
    ['indexed_at'],
  )
  assert.deepEqual(
    sqlState(),
    finalDatabase.state,
    'SQL changed after the final physical-exit backup',
  )
  assert.equal(
    digest(readFileSync(fixture.path)),
    latestSaved.sha256,
    'Healthy close/shutdown rewrote the last explicitly saved package',
  )
  const finalPackage = await readIgsPackage(fixture.path)
  assert.deepEqual(
    finalPackage.project,
    latestSaved.project,
    'Healthy close/shutdown changed the complete saved document/provenance/regions',
  )
  assert.deepEqual(
    withoutRegions(finalPackage.project),
    withoutRegions(fixture.saved),
    'Final source Raster/Smart provenance, drafts, masks, variants or seed snapshot changed',
  )
  await exactPngs(finalPackage)
  report.finalProtectedStateCompared = true
  report.finalPackageComparedToLatestSaved = true
  verifyRetainedBytes()
  verifyRetainedBuild()
  assert.equal(
    digest(readFileSync(candidateFile)),
    report.candidateScript.sha256,
    'Candidate script changed during run',
  )
  assert.equal(allExited(), true)
  assert.equal(report.nativeClosures.length, 2)
  assert.deepEqual(
    report.nativeClosures.map(({ kind }) => kind),
    ['intentional-dirty-crash', 'healthy'],
  )
  assert.equal(report.observerRestorations.length, 2)
  assert.equal(observerInstalled, false)
  assert.equal(report.renameFocusProbes.length, 0)
  assert.equal(report.renameFocusFaults.length, 0)
  assert.equal(renameGateArmed, false)
  assert.ok(
    report.ipcCalls
      .flatMap(({ calls: entries }) => entries)
      .every(({ originalCalls }) => originalCalls === 1),
    'Full foundation mode calls every original handler exactly once, with no transport fault',
  )
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.samplerError, undefined)
  assert.deepEqual(
    hashes(sourceFiles),
    report.sourceSha256,
    'Source changed during native qualification',
  )
  assert.deepEqual(
    filesBelow(path.join(root, 'dist')),
    bundleFiles,
    'Complete dist file membership changed',
  )
  assert.deepEqual(
    hashes(bundleFiles),
    report.bundleSha256,
    'Complete build changed during native qualification',
  )
  check(
    '12 Final protected SQL matches baseline and full SQL matches just-before-close apart from recorded reviewed indexed_at refresh; latest saved package/document/source PNG/provenance and all complete retained dist bytes verified after healthy physical exit; exact observers restored; no deletion',
  )
}
async function captureSources() {
  const suffix = /\.(?:[cm]?[jt]sx?|vue|json|css|sql|icc|png|webp)$/
  sourceFiles = [
    ...new Set([
      ...['src', 'docs/prototype-app/src']
        .flatMap((directory) => filesBelow(path.join(root, directory)))
        .filter((file) => suffix.test(file)),
      ...[
        'scripts/smoke-regional-guidance-foundation.mjs',
        'scripts/native-smoke-window.mjs',
        'scripts/qualification-resource-limits.mjs',
        'package.json',
        'pnpm-lock.yaml',
        'vite.desktop.config.ts',
        'prettier.config.ts',
        'AGENTS.md',
        'docs/engineering/artifact-lifecycle.md',
        'docs/engineering/review-protocol.md',
        'docs/engineering/research-protocol.md',
        'docs/engineering/ui-component-contracts.md',
        'docs/features/project/generate-mode/regional-guidance.md',
        'worker-python/src/imagegen_worker/srgb.icc',
      ].map((file) => path.join(root, file)),
    ]),
  ].sort()
  const buildRoot = path.join(root, 'dist')
  assert.ok(lstatSync(buildRoot).isDirectory() && !lstatSync(buildRoot).isSymbolicLink())
  // No suffix/selected-directory filter: include main/preload source maps and every other regular
  // dist file, as well as renderer assets, migrations and placeholders.
  bundleFiles = filesBelow(buildRoot)
  for (const required of [
    'dist/main/main.cjs',
    'dist/preload/preload.cjs',
    'dist/renderer/index.html',
  ])
    assert.ok(bundleFiles.includes(path.join(root, required)), 'Missing built entry: ' + required)
  report.candidateScript = { path: candidateFile, sha256: digest(readFileSync(candidateFile)) }
  retain(candidateFile, 'exact-source/native-focus-probes-draft.mjs')
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
  const versions = {
    head: revision.stdout.trim(),
    dirtyWorkingTree: dirty.stdout,
    node: process.version,
    processVersions: process.versions,
    package: JSON.parse(readFileSync('package.json', 'utf8')),
    schema: { package: 1, emptyRegionalMaskRevision: 0, defensiveRegionalArrayCeiling: 10000 },
    adapter,
    candidateScript: report.candidateScript,
    source: report.sourceSha256,
    build: report.bundleSha256,
    buildFreshness:
      'Root supplies fresh build; before/after source and bundle maps detect changes during this run.',
  }
  retainJson('source-build-script-version-maps.json', versions)
  for (const file of sourceFiles) retain(file, 'exact-source/' + path.relative(root, file))
  for (const file of bundleFiles) {
    const source = path.relative(root, file)
    const retained = retain(file, 'exact-build/' + source)
    const sha256 = digest(readFileSync(retained))
    assert.equal(
      sha256,
      report.bundleSha256[source],
      'Retained build differs from initial source map',
    )
    report.retainedBuildFiles.push({ source, path: retained, sha256 })
  }
  assert.deepEqual(
    filesBelow(buildRoot),
    bundleFiles,
    'Complete dist membership changed during capture',
  )
  assert.deepEqual(
    hashes(bundleFiles),
    report.bundleSha256,
    'Build changed while retaining all dist bytes',
  )
  checkpoint()
}
function verifyRetainedBuild() {
  assert.deepEqual(
    report.retainedBuildFiles.map(({ source }) => source).sort(),
    Object.keys(report.bundleSha256).sort(),
    'Every complete dist file must have an independent retained copy',
  )
  for (const item of report.retainedBuildFiles) {
    assert.equal(
      digest(readFileSync(item.path)),
      report.bundleSha256[item.source],
      'Retained complete build file changed: ' + item.source,
    )
    assert.ok(
      readFileSync(item.path).equals(readFileSync(path.join(root, item.source))),
      'Retained build file differs from original frozen dist bytes: ' + item.source,
    )
  }
}
async function diagnostics() {
  if (window && !window.isClosed()) {
    for (const [name, operation] of [
      ['failure.aria.txt', () => window.locator('body').ariaSnapshot()],
      ['failure.html', () => window.content()],
    ]) {
      try {
        retainJson(name + '.json', { content: await operation() })
      } catch (error) {
        ;(report.diagnosticErrors ??= []).push({ name, message: String(error) })
      }
    }
    await screenshot('failure-before-exit').catch((error) => {
      report.failureScreenshotError = String(error)
    })
  }
  if (existsSync(path.join(appDataRoot, 'database/app.sqlite')))
    await snapshot('failure-before-exit', { closed: !window || window.isClosed() }).catch(
      (error) => {
        report.failureSnapshotError = String(error)
      },
    )
}
async function run() {
  report.launcher = await verifyLauncherDeadline()
  for (const [name, value] of Object.entries(adapter.channels))
    assert.equal(typeof value, 'string', 'Missing agreed IPC channel: ' + name)
  await captureSources()
  await prepare()
  await launch('foundation')
  await openProject('01-initial-exact-open')
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  await frames()
  baseline = await witness()
  assert.equal(baseline.tab.dirty, false)
  assert.equal(baseline.tab.canUndo, false)
  assert.equal(baseline.tab.canRedo, false)
  assert.equal(Object.hasOwn(baseline.liveDocument, 'regionalGuidance'), false)
  assert.deepEqual(baseline.liveDocument, fixture.saved)
  assert.deepEqual(baseline.sql.tables.generation_queue_item, [])
  assert.deepEqual(baseline.sql.tables.generation_candidate_receipt, [])
  assert.equal(baseline.sql.tables.generation_seed_cursor.length, 1)
  assert.equal(baseline.sql.tables.generation_seed_cursor[0].actual_seed, 0)
  await exactPngs(await readIgsPackage(fixture.path))
  report.baseline = baseline
  await snapshot('01-before-native-mutations')
  if (scenario === 'rename-focus') {
    regionA = await addRegion()
    await renameFocusProbes()
    await finishRenameFocus()
    report.outcome = 'passed'
    return
  }
  await cleanLegacySaveAndReopen()
  check(
    '01 Real legacy-absent loader/native Project and admitted clean UI Save/read/reopen preserve absence, clean history, full ordinary/Smart PNG/provenance/drafts/bboxes/seed0/policy SQL; empty queue/catalog and no runtime',
  )
  regionA = await addRegion()
  regionB = await addRegion()
  await selectEntity(fixture.patches[0].id)
  await assertPrompt(fixture.patches[0].generationDraft.positivePrompt.text)
  await selectEntity(regionA)
  await assertPrompt(fixture.saved.generationDraft.positivePrompt.text)
  await selectEntity(fixture.patches[1].id)
  await assertPrompt(fixture.patches[1].generationDraft.positivePrompt.text)
  await selectEntity(regionB)
  await assertPrompt(fixture.saved.generationDraft.positivePrompt.text)
  check(
    '02 Two real Add actions own fresh globally unique entities/null masks; Undo/Redo preserve identities and legacy absence; region selection uses Current Canvas draft without changing neighbors',
  )
  await updateUi(regionA, { kind: 'rename', name: 'Region A α — independent owner' })
  await updateUi(regionA, { kind: 'enabled', enabled: false })
  await updateUi(regionA, { kind: 'enabled', enabled: true })
  await updateUi(regionA, { kind: 'overlay-opacity', overlayOpacity: 0.23 })
  check(
    '03 Rename/enabled/overlay opacity alter only the intended regional fields, each with one exact Undo/Redo; source package and every Project/Smart draft remain unchanged',
  )
  await lockedControls()
  const sourceBefore = structuredClone(region(await current(), regionA))
  const neighborBefore = structuredClone(region(await current(), regionB))
  const copy = await duplicateUi(regionA)
  duplicateRegion = copy
  await updateUi(copy, { kind: 'overlay-opacity', overlayOpacity: 0.81 })
  const copyBefore = structuredClone(region(await current(), copy))
  assert.deepEqual(
    region(await current(), regionA),
    sourceBefore,
    'Editing a duplicate changed its source',
  )
  await deleteUi(copy)
  await deleteUi(regionB)
  await deleteUi(regionA)
  assert.equal(
    Object.hasOwn((await witness()).liveDocument, 'regionalGuidance'),
    false,
    'Deleting final region must omit the optional document property',
  )
  await historyUi('undo')
  await historyUi('undo')
  assert.deepEqual((await witness()).liveDocument.regionalGuidance, [sourceBefore, neighborBefore])
  await historyUi('undo')
  assert.deepEqual((await witness()).liveDocument.regionalGuidance, [
    sourceBefore,
    copyBefore,
    neighborBefore,
  ])
  check(
    '05 Adjacent duplicate owns fresh entity/mask IDs and independent values; source exact; delete/history restores exact identities and final deletion omits property',
  )
  await updateUi(regionB, { kind: 'enabled', enabled: false })
  await updateUi(duplicateRegion, { kind: 'enabled', enabled: false })
  await updateUi(regionA, { kind: 'overlay-opacity', overlayOpacity: 0 })
  await updateUi(regionA, { kind: 'lock', locked: true })
  await blockedGeneration(false)
  check(
    '06 Only enabled region is zero-opacity, locked and unselected; actual ordinary UI and original Main refuse specifically before queue/cursor/input mutation',
  )
  await blockedGeneration(true)
  check(
    '07 Same unselected enabled region blocks actual Smart UI and direct Main request; exact empty queue/receipts, seed0, all model policy and document bytes preserved',
  )
  await disabledControls()
  await layoutAndFocus()
  await saveAndReopen()
  await recovery()
  await finish()
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
  await diagnostics().catch((cause) => {
    report.diagnosticsFailure = String(cause)
  })
} finally {
  if (application && renameGateArmed) {
    try {
      await restoreRenameGate()
    } catch (error) {
      report.renameFocusRestorationFailure = String(error)
    }
  }
  if (application) {
    try {
      await restoreObserver()
    } catch (error) {
      report.observerRestorationFailure = String(error)
    }
    try {
      await closeNative('failure-owned-actor', 'abort')
    } catch (error) {
      report.physicalExitFailure = String(error)
    }
  }
  clearInterval(sampler)
  // This cannot depend on any source-document/PNG/shadow witness that may have caused failure.
  if (
    existsSync(path.join(appDataRoot, 'database/app.sqlite')) &&
    !report.finalDatabaseAfterLastUiAndPhysicalExit
  ) {
    const physical = allExited()
    try {
      await retainDatabase(
        physical
          ? 'failure-final-after-last-ui-and-physical-exit'
          : 'failure-final-exit-unconfirmed',
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
  if (
    report.renameFocusRestorationFailure ||
    report.observerRestorationFailure ||
    report.physicalExitFailure
  ) {
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
    renameFocusInstrumentationRestored: !renameGateArmed && !report.renameFocusRestorationFailure,
    finalDatabaseRetained:
      report.finalDatabaseAfterLastUiAndPhysicalExit === true ||
      report.failureFinalDatabaseRetainedAfterPhysicalExit === true,
    releaseCondition:
      'Root verifies complete PNG/.igs/shadow/input/source/build bytes, every standalone consistent SQLite checkpoint, exact handler restoration and every PID/start/cgroup exit. No runner deletion.',
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
