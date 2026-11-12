/**
 * Finite built accepted Compare → exact Models → retained Compare qualification.
 * Root runs after a fresh app:build under a 2 GiB/zero-swap/600s launcher:
 * pnpm exec tsx scripts/smoke-comparison-models.mjs --report-file ABSOLUTE_NEW_REPORT
 *
 * Accepted Raster/active Smart/converted Smart records and literal ICC PNGs are declared
 * portable preconditions. This does not exercise Generate, Add, conversion or inference.
 * Existing ProjectService/package/catalog owners create those preconditions; no acceptance
 * wrapper is introduced. Eight tiny managed files are catalog fixtures, not loadable weights.
 * Two serial, normally closed physical Electron lifetimes; 16 checks and three screenshots.
 * Root owns execution, screenshot inspection and disposal after physical exit/restoration.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, realpathSync, renameSync, writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron, expect } from '@playwright/test'
import Database from 'better-sqlite3'

import { openAppDatabase } from '../src/main/db/database.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import { ProjectShadowStore } from '../src/main/projects/project-shadow.ts'
import { withSmartComparisonProject } from '../src/main/projects/test-fixtures/smart-result-comparison.ts'
import { isRasterGenerationData } from '../src/shared/projects/generation-settings-comparison.ts'
import { parseProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import { isSmartResultComparisonDataForRequest } from '../src/shared/projects/smart-result-comparison.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import { boundQualificationProcess, confirmQualificationProcessExit } from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4, 'Use --report-file ABSOLUTE_NEW_OWNED_REPORT')
assert.equal(process.argv[2], '--report-file')
const reportFile = process.argv[3]
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Never overwrite another report')
const evidenceRoot = path.dirname(reportFile)
const relativeEvidence = path.relative(path.join(os.homedir(), '.codex/artifacts/imagegen-studio'), evidenceRoot)
assert.ok(relativeEvidence && !relativeEvidence.startsWith('..') && !path.isAbsolute(relativeEvidence))
assert.equal(realpathSync(evidenceRoot), evidenceRoot)
assert.ok(lstatSync(evidenceRoot).isDirectory() && !lstatSync(evidenceRoot).isSymbolicLink())

const payload = mkdtempSync(path.join(evidenceRoot, 'native-comparison-models-'))
const appData = path.join(payload, 'data/imagegen-studio')
const workspace = path.join(appData, 'workspaces/Uncategorized')
const rollback = path.join(payload, 'original-model-bytes')
for (const directory of [appData, workspace, rollback]) mkdirSync(directory, { recursive: true, mode: 0o700 })
const execute = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashes = (files) => Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const projectTitle = 'Native accepted comparison Models'
const wrongSha = 'f'.repeat(64)
const sourceFiles = [
  'scripts/smoke-comparison-models.mjs', 'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs', 'src/renderer/App.vue',
  'src/renderer/components/ProjectView.vue', 'src/renderer/components/ProjectRasterLayerRow.vue',
  'src/renderer/components/ProjectSmartPatchLayerRow.vue',
  'src/renderer/components/ProjectEntitySurface.vue', 'src/renderer/components/ProjectLayerStack.vue',
  'src/renderer/components/ProjectSortableLayerRow.vue', 'src/renderer/components/project-entity-row.ts',
  'src/renderer/components/GenerationSettingsComparison.vue',
  'src/renderer/components/generation-comparison-source.ts',
  'src/renderer/components/model-manager-focus.ts', 'src/renderer/components/model-manager-read-guard.ts',
  'src/renderer/components/ModelManager.vue', 'src/shared/projects/generation-settings-comparison.ts',
  'src/shared/projects/smart-result-comparison.ts', 'src/shared/projects/resource-identity.ts',
  'src/shared/projects/project-schema.ts', 'src/shared/api.ts', 'src/preload/index.ts',
  'src/main/index.ts', 'src/main/models/model-repository.ts', 'src/main/models/model-service.ts',
  'src/main/projects/project-service.ts', 'src/main/projects/project-session.ts',
  'src/main/projects/igs-package.ts', 'src/main/projects/test-fixtures/smart-result-comparison.ts',
  'src/main/projects/test-fixtures/accepted-provenance.ts',
  'src/main/projects/test-fixtures/smart-patch-variant.ts',
]
const bundleFiles = [
  'dist/main/main.cjs', 'dist/preload/preload.cjs', 'dist/renderer/index.html',
  ...readdirSync('dist/renderer/assets').filter((name) => /\.(?:js|css)$/.test(name)).map((name) => `dist/renderer/assets/${name}`),
]
assert.equal(bundleFiles.length, 5, 'Freeze the five actual built delivery members')
const report = {
  outcome: 'running', startedAt: new Date().toISOString(), payloads: [payload],
  command: { cwd: process.cwd(), executable: process.execPath, argv: process.argv },
  checks: [], screenshots: [], readbacks: [], baselines: [], witnesses: [], controls: [], catalogProbes: [],
  nativeClosures: [], resourceChecks: [], fileRestorations: [], pageErrors: [], vueWarnings: [],
  sourceSha256: hashes(sourceFiles), bundleSha256: hashes(bundleFiles),
  finiteScope: { checks: 16, normalPhysicalLifetimes: 2, screenshots: 3, catalogOnlyFiles: 8, family: 'illustrious', owners: ['ordinary Raster', 'active Smart variant', 'converted Smart Raster'] },
  sourceBasis: { baseRevision: '1bf4a92a602f5c85b29abd36d2fe4df3777b6751', fixture: 'withSmartComparisonProject: declared accepted portable state, existing ProjectService/Save/package reader; fixture callback copies only its verified package bytes before its own cleanup', catalog: 'Existing ModelRepository.publishVerifiedInstallation/setDefaultVersion; genuine Main ModelService catalog reads; no independent identity, acceptance or persistence mechanism' },
  boundary: {
    actual: 'Built renderer/preload/Main, original typed comparison reads and Models catalog reads, actual SQLite catalog/index, managed stat/hash metadata, .igs package/assets, original layer menu and retained comparison, two normal physical app lifetimes.',
    fixtures: 'One declared accepted portable Illustrious Project with ordinary Raster, active/inactive Smart members and converted Smart Raster. Eight tiny A/B checkpoint/LoRA/VAE/embedding files; A remains Default, B is initially absent. Current checkpoint uses actual A IDs with a deliberately incorrect SHA. Same display labels never select a resource.',
    controls: 'Held unchanged original Main catalog successes, one IPC rejection after a successful original read, typed completed notification for a newer actual read. Original Main active-member/revision/Undo and Project close/reopen operations are declared external controls, not UI interactions or acceptance evidence.',
    limits: 'Launcher <=2 GiB/zero swap/600s, TimeoutStop <=90s/KillMode control-group; every observed actual native group <=2 GiB/zero swap and existing helper 480s deadline. No forced termination qualifies as PASS.',
    negativeScope: 'No Add, Generate, ML/runtime/SHARED, weights, installs, network, full history or orphan matrix, Anima native claim, Apply/Recall/Restore, new acceptance wrapper or public readiness claim.',
    cleanup: 'Restore captured handlers and await in-flight reads FIRST. Dismiss owned topmost Compare/Models, explicitly discard only the owned Project if a declared control left it dirty, then normal close and physical exit. Restore remaining owned B bytes only after physical exit. Payload is retained for root disposal.',
  },
}
let application, window, fixture, baseline, nativeChecks = [], observerInstalled = false, probeInstalled = false
const withdrawn = new Map()
const categories = { checkpoint: 'Checkpoints', embedding: 'Embeddings', lora: 'LoRA', vae: 'VAE' }
const sideLabel = (side) => side === 'generated' ? 'Generated with' : 'Current Canvas'
const project = () => window.getByLabel(`Project ${projectTitle}`, { exact: true })
const comparison = () => window.getByRole('dialog', { name: 'Compare generation settings', exact: true })
const models = () => window.getByRole('dialog', { name: 'Model Manager', exact: true })
const closeComparisonButton = () => comparison().getByRole('button', { name: 'Close generation settings comparison', exact: true })
const action = (key, side, resource) => comparison().locator(`[data-setting="${key}"]`).getByRole('button', { name: `Open ${sideLabel(side)} ${resource.name} in Models`, exact: true })
const persist = () => writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
function check(name, evidence = {}) { report.checks.push({ name, ...evidence }); persist(); console.log(`PASS ${name}`) }
persist()

async function prepare() {
  const database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
  const resources = {}
  try {
    const repository = new ModelRepository(database.db)
    for (const [index, kind] of ['checkpoint', 'lora', 'vae', 'embedding'].entries()) {
      const pair = {}
      for (const suffix of ['A', 'B']) {
        const remote = 989_000 + index * 10 + (suffix === 'A' ? 1 : 2)
        const bytes = Buffer.from(`Owned accepted comparison catalog-only ${kind} ${suffix}; not loadable weights.`)
        const filename = `comparison-${kind}-${suffix.toLowerCase()}.safetensors`
        const managedPath = path.join(appData, 'models', filename)
        mkdirSync(path.dirname(managedPath), { recursive: true, mode: 0o700 })
        writeFileSync(managedPath, bytes, { mode: 0o600 })
        const name = `Comparison ${kind}`, versionName = `Exact ${suffix}`, sha256 = digest(bytes)
        const published = await repository.publishVerifiedInstallation({ primary: {
          file: { managedPath, originalFilename: filename, sha256, sizeBytes: bytes.length, verifiedAt: new Date().toISOString() },
          resource: { creator: 'Owned native fixture', displayName: name, source: { kind: 'civitai', modelId: 989_000 + index * 10 }, sourceMetadata: { fixture: true }, type: kind },
          version: { baseModelFamily: 'illustrious', format: 'safetensors', name: versionName, predictionType: kind === 'checkpoint' ? 'epsilon' : null, source: { kind: 'civitai', fileId: remote + 1000, versionId: remote, expectedSha256: sha256 }, sourceMetadata: { fixture: true } },
        } })
        const backup = path.join(rollback, filename)
        copyFileSync(managedPath, backup)
        pair[suffix.toLowerCase()] = { ...published, name, kind, versionName, managedPath, backup, sha256, portable: {
          baseModelFamily: 'illustrious', civitaiFileId: remote + 1000, civitaiModelId: 989_000 + index * 10, civitaiVersionId: remote, displayName: name, fileSha256: sha256, kind, localModelId: published.resourceId, localVersionId: published.versionId, predictionType: kind === 'checkpoint' ? 'epsilon' : null, versionName,
        } }
      }
      assert.equal(pair.a.resourceId, pair.b.resourceId)
      assert.notEqual(pair.a.sha256, pair.b.sha256)
      await repository.setDefaultVersion(pair.a.resourceId, pair.a.versionId)
      resources[kind] = pair
    }
  } finally { await database.close() }
  const packagePath = path.join(workspace, `${projectTitle}.igs`)
  let sources
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    const document = structuredClone(f.owner.document)
    document.title = projectTitle
    const draft = document.generationDraft
    const prompt = (suffix, negative = false) => ({ text: `<comparison-${suffix}>, ${negative ? 'negative' : 'positive'} ${suffix === 'b' ? 'concrete (lantern:-0.5)' : '{raw|authored}'}, 日本語`, embeddingRefs: [{ token: `<comparison-${suffix}>`, resource: structuredClone(resources.embedding[suffix].portable) }] })
    Object.assign(draft, { model: { ...resources.checkpoint.a.portable, fileSha256: wrongSha }, positivePrompt: prompt('a'), negativePrompt: prompt('a', true), loras: [{ enabled: true, resource: resources.lora.a.portable, weight: 0.25 }], vae: resources.vae.a.portable, vaePrecision: 'FP32', cfgRescale: 0, seed: { policy: 'fixed', value: 0 } })
    Object.assign(draft.sampling, { steps: 17, cfgScale: 4, sampler: 'Euler', scheduler: 'Normal' })
    for (const layer of document.layers) {
      const records = layer.kind === 'smart-patch' ? layer.rasterSubLayers : [layer]
      for (const record of records) {
        if (!record.generationProvenance) continue
        const configuration = record.generationProvenance.generationConfiguration
        Object.assign(configuration, { model: structuredClone(resources.checkpoint.b.portable), positivePrompt: prompt('b'), negativePrompt: prompt('b', true), loras: [{ enabled: true, resource: structuredClone(resources.lora.b.portable), weight: -0.5 }], vae: structuredClone(resources.vae.b.portable), vaePrecision: 'FP32', cfgRescale: 0 })
        Object.assign(configuration.sampling, { actualSeed: 0, requestedSeedPolicy: 'fixed', seedBehavior: 'per-iteration', steps: 4, cfgScale: 4, sampler: 'Euler', scheduler: 'Normal', invokeScheduler: 'euler' })
        if ('generationDraft' in record.generationProvenance.layerSourceContext) record.generationProvenance.layerSourceContext.generationDraft.model = structuredClone(configuration.model)
      }
      if (layer.kind === 'smart-patch') {
        layer.locked = false // Only the declared original Main active-member control may mutate it.
        layer.generationDraft.sampling.steps = 67
        layer.generationDraft.positivePrompt = { text: 'Selected Patch authoring differs from current Project', embeddingRefs: [] }
      }
    }
    await f.owner.applyDocument(parseProjectDocumentV1(document))
    await f.service.save(f.tabId)
    copyFileSync(f.owner.filePath, packagePath)
    const ordinary = document.layers.find((layer) => layer.id === f.ordinary.id)
    const patch = document.layers.find((layer) => layer.id === f.patch.id)
    const converted = document.layers.find((layer) => layer.id === f.converted.id)
    assert.ok(ordinary && patch?.kind === 'smart-patch' && converted)
    sources = {
      ordinary: { kind: 'raster', id: ordinary.id, name: ordinary.name, resultId: ordinary.id, configuration: ordinary.generationProvenance.generationConfiguration },
      active: { kind: 'smart-patch', id: patch.id, name: patch.name, resultId: patch.activeRasterSubLayerId, configuration: patch.rasterSubLayers[0].generationProvenance.generationConfiguration },
      converted: { kind: 'smart-patch', id: converted.id, name: converted.name, resultId: converted.id, configuration: converted.generationProvenance.generationConfiguration },
      alternateId: patch.rasterSubLayers[1].id,
    }
  })
  const saved = await readIgsPackage(packagePath)
  const assets = []
  for (const layer of saved.project.layers) for (const record of layer.kind === 'smart-patch' ? layer.rasterSubLayers : [layer]) {
    const bytes = await saved.readMember(record.asset.path)
    assert.equal(digest(bytes), record.asset.sha256)
    const retained = path.join(payload, `source-${record.id}.png`)
    writeFileSync(retained, bytes, { flag: 'wx', mode: 0o600 })
    assets.push({ id: record.id, path: record.asset.path, sha256: record.asset.sha256, retained })
  }
  for (const pair of Object.values(resources)) {
    const withheld = path.join(rollback, `withdrawn-${path.basename(pair.b.managedPath)}`)
    renameSync(pair.b.managedPath, withheld)
    withdrawn.set(pair.b.versionId, { resource: pair.b, withheld })
  }
  return { resources, sources, projectId: localProjectRecoveryKey(packagePath), packagePath, packageSha256: digest(readFileSync(packagePath)), savedDocument: saved.project, assets }
}

function assertFiles() {
  assert.equal(digest(readFileSync(fixture.packagePath)), fixture.packageSha256, 'Saved package changed')
  for (const asset of fixture.assets) assert.equal(digest(readFileSync(asset.retained)), asset.sha256)
  for (const pair of Object.values(fixture.resources)) for (const resource of Object.values(pair)) {
    assert.equal(digest(readFileSync(resource.backup)), resource.sha256)
    if (withdrawn.has(resource.versionId)) assert.equal(existsSync(resource.managedPath), false)
    else assert.equal(digest(readFileSync(resource.managedPath)), resource.sha256)
  }
}
function restoreFile(resource, live = false) {
  const entry = withdrawn.get(resource.versionId)
  if (!entry) return
  assert.ok(!application || live, 'Remaining byte restoration requires physical Main exit')
  assert.equal(digest(readFileSync(entry.withheld)), resource.sha256)
  assert.equal(existsSync(resource.managedPath), false)
  copyFileSync(entry.withheld, resource.managedPath)
  assert.equal(digest(readFileSync(resource.managedPath)), resource.sha256)
  withdrawn.delete(resource.versionId)
  report.fileRestorations.push({ versionId: resource.versionId, sha256: resource.sha256, exact: true, liveModelsRepair: live }); persist()
}
async function api(scope, method, ...args) {
  const result = await window.evaluate(({ scope, method, args }) => window.api[scope][method](...args), { scope, method, args })
  assert.equal(result.ok, true, JSON.stringify(result)); return result.value
}
async function current() { const opened = await api('projects', 'open', fixture.projectId); assert.equal(opened.kind, 'opened'); return opened.tab }
async function publishControlTabs(tabs, label) {
  // Direct harness IPC does not run App's ordinary replaceTab caller. Publish
  // the unchanged genuine Main responses through the existing typed tabs event
  // so the declared external control actually reaches the renderer owner.
  await application.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('projects:tabs-changed', value), tabs)
  await frames()
  report.controls.push({ label, declared: true, rendererPublication: 'Existing typed projects:tabs-changed; original Main tab response, no Vue state injection', tabs: tabs.map(({ id, documentId, documentRevision }) => ({ id, documentId, documentRevision })) }); persist()
}
async function frames() { await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))) }
function seconds(value) {
  const text = value.replace(/\s+/g, ''), token = /(\d+(?:\.\d+)?)(us|ms|min|s|h|d)/g
  if (text === '0') return 0
  assert.equal(text.replace(token, ''), '', `Unrecognized duration ${value}`)
  const scale = { us: 0.000001, ms: 0.001, s: 1, min: 60, h: 3600, d: 86400 }
  return [...text.matchAll(token)].reduce((sum, match) => sum + Number(match[1]) * scale[match[2]], 0)
}
async function launcherProof() {
  const group = readFileSync('/proc/self/cgroup', 'utf8').trim().split('\n').find((line) => line.startsWith('0::'))?.slice(3)
  assert.ok(group?.startsWith('/') && group !== '/')
  const memoryMax = readFileSync(`/sys/fs/cgroup${group}/memory.max`, 'utf8').trim()
  assert.match(memoryMax, /^\d+$/); assert.ok(BigInt(memoryMax) <= 2n * 1024n ** 3n)
  assert.equal(readFileSync(`/sys/fs/cgroup${group}/memory.swap.max`, 'utf8').trim(), '0')
  const { stdout } = await execute('systemctl', ['--user', 'show', '--property=ControlGroup,RuntimeMaxUSec,TimeoutStopUSec,KillMode', path.basename(group)], { timeout: 10_000, maxBuffer: 16 * 1024 })
  const properties = Object.fromEntries(stdout.trim().split('\n').map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)] }))
  assert.equal(properties.ControlGroup, group); assert.equal(properties.KillMode, 'control-group')
  assert.ok(seconds(properties.RuntimeMaxUSec) > 0 && seconds(properties.RuntimeMaxUSec) <= 600)
  assert.ok(seconds(properties.TimeoutStopUSec) <= 90)
  return { group, memoryMax, swapMax: '0', properties }
}
async function bound(label) {
  const proof = await boundQualificationProcess(application.process().pid, { deadlineSeconds: 480, execute: (file, args, options) => execute(file, args.map((value) => value === 'MemoryMax=12G' ? 'MemoryMax=2G' : value), options) })
  for (const group of proof.groups) { assert.ok(BigInt(group.memoryMax) <= 2n * 1024n ** 3n); assert.equal(group.swapMax, '0') }
  nativeChecks.push(proof); report.resourceChecks.push({ label, ...proof }); persist()
}
const readChannels = [
  'models:get-catalog', 'models:get-install-jobs', 'models:get-storage-summary', 'models:get-token-status',
  'runtime:get-status', 'presets:get', 'presets:list', 'projects:list', 'projects:open',
  'projects:get-accepted-result-history', 'projects:get-close-impact', 'projects:get-generation-progress',
  'projects:get-generation-queue', 'projects:get-generation-state', 'projects:get-generation-target-state',
  'projects:get-raster-generation-data', 'projects:get-raster-preset-data', 'projects:get-smart-result-comparison-data',
  'projects:get-smart-patch-generation-target-state', 'projects:get-smart-patch-variants',
  'projects:get-smart-result-preset-data', 'projects:list-generation-results', 'projects:list-smart-patch-generation-results',
]
async function installObserver() {
  await application.evaluate(({ ipcMain }, allowed) => {
    const state = { originals: new Map(ipcMain._invokeHandlers), calls: [], inFlight: 0, allowed }
    globalThis.igsComparisonModelsObserver = state
    for (const [channel, original] of state.originals) ipcMain._invokeHandlers.set(channel, async (event, ...args) => {
      const call = { channel, args: structuredClone(args), finished: false }; state.calls.push(call); ++state.inFlight
      try {
        const response = await original(event, ...args)
        if (channel === 'projects:get-raster-generation-data' || channel === 'projects:get-smart-result-comparison-data') call.response = structuredClone(response)
        call.ok = response?.ok ?? null; return response
      } finally { call.finished = true; --state.inFlight }
    })
  }, readChannels)
  observerInstalled = true
}
async function calls() { return application.evaluate(() => structuredClone(globalThis.igsComparisonModelsObserver.calls)) }
async function mutations() { return application.evaluate(() => { const state = globalThis.igsComparisonModelsObserver; return structuredClone(state.calls.filter(({ channel }) => !state.allowed.includes(channel))) }) }
async function restoreObserver() {
  if (!observerInstalled) return
  await expect.poll(() => application.evaluate(() => globalThis.igsComparisonModelsObserver.inFlight)).toBe(0)
  const exact = await application.evaluate(({ ipcMain }) => {
    const state = globalThis.igsComparisonModelsObserver
    for (const [channel, original] of state.originals) ipcMain._invokeHandlers.set(channel, original)
    return [...state.originals].every(([channel, original]) => ipcMain._invokeHandlers.get(channel) === original)
  })
  assert.equal(exact, true); observerInstalled = false
}
async function launch(label) {
  const env = { ...process.env, NODE_ENV: 'test', CUDA_VISIBLE_DEVICES: '', XDG_CONFIG_HOME: path.join(payload, 'config'), XDG_DATA_HOME: path.join(payload, 'data') }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'IMAGEGEN_DEV_SERVER_URL', 'IMAGEGEN_TEST_IMAGE_WORKER']) delete env[key]
  nativeChecks = []
  application = await electron.launch({ args: ['--ozone-platform=x11', '.'], cwd: process.cwd(), env, timeout: 30_000 })
  await bound(`${label}-launch`)
  window = await isolateNativeSmokeWindow(application); window.setDefaultTimeout(10_000)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  window.on('console', (message) => { if (message.text().includes('[Vue warn]')) report.vueWarnings.push(message.text()) })
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await window.waitForFunction(() => typeof window.api?.projects?.getSmartResultComparisonData === 'function')
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await expect(window.getByRole('button', { name: `Open ${projectTitle}`, exact: true })).toBeVisible()
  await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  await expect(project()).toBeVisible()
  await expect(project().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  await installObserver()
}
function databaseState() {
  const database = new Database(path.join(appData, 'database/app.sqlite'), { readonly: true, fileMustExist: true })
  try {
    const schema = database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()
    const tables = Object.fromEntries(schema.filter(({ type }) => type === 'table').map(({ name }) => {
      assert.match(name, /^[a-z_0-9]+$/)
      return [name, database.prepare(`SELECT * FROM "${name}"`).all().sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]
    }))
    return { schema, tables }
  } finally { database.close() }
}
async function witness() {
  await frames(); assertFiles()
  const tab = await current(), saved = await readIgsPackage(fixture.packagePath)
  const inspectedShadow = await new ProjectShadowStore(path.join(appData, 'autosave')).inspect({ projectPath: fixture.packagePath, savedPackage: saved })
  // Exact Undo may remove a semantically clean shadow on its existing debounce. Both
  // statuses mean no unsaved document; retain the full payload for a recoverable shadow.
  const shadow = ['absent', 'clean'].includes(inspectedShadow.status) ? { status: 'saved' } : inspectedShadow
  const ui = await project().evaluate((node) => {
    const canvas = node.querySelector('.canvas-area')
    return { camera: canvas ? { x: canvas.dataset.cameraX, y: canvas.dataset.cameraY, scale: canvas.dataset.cameraScale } : null, selected: [...node.querySelectorAll('.entity-select[aria-pressed="true"]')].map((button) => button.getAttribute('aria-label')).sort() }
  })
  return { tab, ui, savedDocument: saved.project, shadow, database: databaseState(), mutations: await mutations(), packageSha256: digest(readFileSync(fixture.packagePath)) }
}
async function unchanged(before, label) {
  const after = await witness(); assert.deepEqual(after, before, `${label}: document/history/draft/active/pixels/package/SQLite/selection/camera or mutation IPC changed`)
  report.witnesses.push({ label, sha256: digest(Buffer.from(JSON.stringify(after))), documentRevision: after.tab.documentRevision, mutations: after.mutations }); persist()
}
async function establishBaseline(label) {
  baseline = await witness()
  report.baselines.push({ label, sha256: digest(Buffer.from(JSON.stringify(baseline))), state: baseline }); persist()
}
async function rebaseAfterResize(label) {
  const after = await witness()
  const beforeDocument = structuredClone(baseline), afterDocument = structuredClone(after)
  delete beforeDocument.ui.camera; delete afterDocument.ui.camera
  assert.deepEqual(afterDocument, beforeDocument, `${label}: resize changed more than view pan`)
  assert.equal(after.ui.camera.scale, baseline.ui.camera.scale, `${label}: fixture scale changed`)
  report.controls.push({ label, declared: true, uiOnly: true, beforeCamera: baseline.ui.camera, afterCamera: after.ui.camera,
    meaning: 'Explicit native screenshot resizing can clamp pane widths and recenter screen pan; compare every document/SQL/history/pixel/selection/mutation witness exactly. Navigation at fixed viewport still compares raw camera exactly.' })
  await establishBaseline(label)
}
async function settled(surface) {
  await expect(surface).toBeVisible()
  await expect.poll(() => surface.evaluate((node) => {
    const carrier = node.closest('.n-popover, .n-modal') ?? node
    return [node, carrier].every((element) => getComputedStyle(element).opacity === '1' && getComputedStyle(element).transform === 'none')
  })).toBe(true)
  await frames()
}
async function comparisonState() {
  await settled(comparison())
  return comparison().evaluate((node) => ({ showSame: node.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'), scroll: node.querySelector('.comparison-scroll').scrollTop }))
}
async function openComparison(source) {
  await expect(window.getByRole('menuitem')).toHaveCount(0)
  const offset = (await calls()).length, tab = await current()
  const trigger = project().getByRole('button', { name: `Layer actions for ${source.name}`, exact: true })
  await trigger.scrollIntoViewIfNeeded(); await trigger.click()
  await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
  await settled(comparison()); await expect(comparison().locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
  let call
  const channel = source.kind === 'raster' ? 'projects:get-raster-generation-data' : 'projects:get-smart-result-comparison-data'
  await expect.poll(async () => {
    call = (await calls()).slice(offset).find((entry) => entry.channel === channel && entry.finished && entry.response?.ok && (source.kind === 'raster' ? entry.args[2] === source.id : entry.args[1]?.owner?.layerId === source.id))
    return Boolean(call)
  }).toBe(true)
  const data = call.response.value
  if (source.kind === 'raster') { assert.ok(isRasterGenerationData(data)); assert.deepEqual(call.args, [tab.id, tab.documentId, source.id]); await expect(comparison().locator('[data-setting="size.dimensions"]')).toHaveCount(1) }
  else {
    assert.equal(isSmartResultComparisonDataForRequest(data, call.args[1]), true)
    assert.equal(data.resultId, source.resultId); assert.equal('size' in data.generationConfiguration, false)
    await expect(comparison().locator('[data-setting="size.dimensions"]')).toHaveCount(0)
    assert.equal(call.args[1].documentId, tab.documentId); assert.equal(call.args[1].documentRevision, tab.documentRevision)
    const accepted = tab.acceptedResults.find(({ layerId }) => layerId === source.resultId)
    assert.ok(accepted?.imageUrl.includes(`/${source.resultId}/${call.args[1].assetSha256}/`))
  }
  assert.deepEqual(data.generationConfiguration, source.configuration)
  assert.equal(Object.hasOwn(data, 'layerSourceContext'), false); assert.equal(Object.hasOwn(data, 'executionResultContext'), false)
  await comparison().getByRole('checkbox', { name: 'Show unchanged settings', exact: true }).check()
  await expect(comparison().locator('[data-setting="guidance.steps"] .comparison-values > div > p').nth(0)).toHaveText('4')
  await expect(comparison().locator('[data-setting="guidance.steps"] .comparison-values > div > p').nth(1)).toHaveText('17')
  report.readbacks.push({ source: source.id, channel, call }); persist(); return data
}
async function closeComparison() { await closeComparisonButton().click(); await expect(comparison()).toBeHidden() }
async function closeModels(mode = 'button') {
  if (mode === 'escape') await models().press('Escape')
  else await models().getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(models()).toBeHidden()
}
async function exactCatalog(resource, status) {
  const item = (await api('models', 'getCatalog')).find((entry) => entry.id === resource.resourceId)
  assert.ok(item); assert.equal(item.resourceType, resource.kind)
  const pair = fixture.resources[resource.kind]
  assert.equal(item.defaultVersionId, pair.a.versionId)
  const version = item.versions.find((entry) => entry.id === resource.versionId)
  assert.ok(version); assert.equal(version.sha256, resource.sha256); assert.equal(version.fileStatus, status)
  assert.equal(item.versions.find((entry) => entry.id === pair.a.versionId).fileStatus, 'ready')
  return { item, version }
}
async function focusedModels(resource, side, { mismatch = false, ready = false } = {}) {
  await settled(models()); await expect(comparison()).toBeHidden()
  await expect(models().getByRole('complementary', { name: 'Model filters', exact: true }).getByRole('button', { name: new RegExp(`^${categories[resource.kind]} `) })).toHaveAttribute('aria-pressed', 'true')
  await expect(models().getByPlaceholder('Search installed models')).toHaveValue('')
  await expect(models().getByRole('complementary', { name: 'Model details', exact: true }).locator('h2')).toHaveText(resource.name)
  await expect(models().locator('.version-row').filter({ hasText: 'Exact A' })).toContainText('Default')
  if (ready && !mismatch) await expect(models().getByText(`Referenced by ${sideLabel(side)}`, { exact: true })).toBeVisible()
  else {
    await expect(models()).toContainText('Compare resource unavailable')
    await expect(models()).toContainText('The saved result and Current Canvas are unchanged.')
    await expect(models().getByText(/^Referenced by (Generated with|Current Canvas)$/)).toHaveCount(0)
    await expect(models().locator('.version-row--project')).toHaveCount(0)
  }
  if (mismatch) { await expect(models().locator('.version-row').filter({ hasText: resource.versionName })).toContainText('ready'); await expect(models()).toContainText('does not match') }
  await expect(window.locator('[role="dialog"]:visible')).toHaveCount(1)
  assert.equal(await window.locator('.app-shell').evaluate((node) => node.inert), true, 'App shell stays inert during Models')
}
async function roundtrip(key, side, resource, mode = 'button', options = {}) {
  const before = await witness(), button = action(key, side, resource)
  await expect(button).toHaveCount(1); await button.scrollIntoViewIfNeeded(); await button.focus()
  const state = await comparisonState(), actionKey = await button.getAttribute('data-comparison-model-action')
  assert.ok(actionKey); await button.click(); await focusedModels(resource, side, options)
  await closeModels(mode); await expect.poll(comparisonState).toEqual(state)
  await expect(action(key, side, resource)).toHaveAttribute('data-comparison-model-action', actionKey)
  await expect(action(key, side, resource)).toBeFocused(); await unchanged(before, `${key}/${side}/${mode}`)
  return { key, side, actionKey, state, mode }
}
async function screenshot(label, surface, width, height) {
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width, height })
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]); await settled(surface)
  const geometry = await surface.evaluate((node) => {
    const rect = node.getBoundingClientRect(), scroll = node.querySelector('.comparison-scroll, .model-manager-body')?.getBoundingClientRect()
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, overflow: document.documentElement.scrollWidth > innerWidth, scroll: scroll ? { y: scroll.y, bottom: scroll.bottom } : null }
  })
  assert.equal(geometry.overflow, false); assert.ok(geometry.x >= -1 && geometry.y >= -1 && geometry.right <= width + 1 && geometry.bottom <= height + 1)
  if (geometry.scroll) assert.ok(geometry.scroll.y >= geometry.y && geometry.scroll.bottom <= geometry.bottom + 1)
  const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-${label}-${width}x${height}.png`)
  assert.equal(existsSync(file), false); await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push({ label, path: file, sha256: digest(readFileSync(file)), geometry }); await bound(label); persist()
}
async function notifyCatalog(id) {
  const notification = { id, modelName: 'Owned Compare catalog read control', versionName: 'No installation claimed', bytesDownloaded: 0, totalBytes: 0, error: null, status: 'completed' }
  await application.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('models:install-changed', value), notification)
  return notification
}
async function installCatalogProbe(mode) {
  assert.equal(probeInstalled, false); assert.ok(['hold', 'error'].includes(mode))
  await application.evaluate(({ ipcMain }, selectedMode) => {
    const channel = 'models:get-catalog', original = ipcMain._invokeHandlers.get(channel)
    if (typeof original !== 'function' || globalThis.igsComparisonModelsCatalog) throw new Error('Actual catalog handler unavailable or probe already installed')
    const owned = { original, mode: selectedMode, calls: 0, inFlight: 0, intercepted: false, completed: false, delivered: false, originalOk: false, release: null }
    const held = new Promise((resolve) => { owned.release = resolve })
    globalThis.igsComparisonModelsCatalog = owned; ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      ++owned.calls; ++owned.inFlight
      const intercept = !owned.intercepted; if (intercept) owned.intercepted = true
      try {
        const result = await original(event, ...args)
        if (intercept) {
          owned.completed = true; owned.originalOk = result.ok === true
          if (owned.mode === 'hold') await held
          owned.delivered = true
          if (owned.mode === 'error') throw new Error('Owned Compare catalog rejection after genuine Main read')
        }
        return result
      } finally { --owned.inFlight }
    })
  }, mode)
  probeInstalled = true
}
async function probeState() { return application.evaluate(() => { const { mode, calls, inFlight, intercepted, completed, delivered, originalOk } = globalThis.igsComparisonModelsCatalog; return { mode, calls, inFlight, intercepted, completed, delivered, originalOk } }) }
async function restoreCatalogProbe() {
  if (!probeInstalled || !application) return
  const exact = await application.evaluate(({ ipcMain }) => {
    const owned = globalThis.igsComparisonModelsCatalog, channel = 'models:get-catalog'
    ipcMain.removeHandler(channel); ipcMain.handle(channel, owned.original); owned.release()
    return ipcMain._invokeHandlers.get(channel) === owned.original
  })
  assert.equal(exact, true); await expect.poll(async () => (await probeState()).inFlight).toBe(0)
  const evidence = await probeState()
  if (evidence.intercepted) { assert.equal(evidence.completed, true); assert.equal(evidence.delivered, true); assert.equal(evidence.originalOk, true) }
  report.catalogProbes.push({ ...evidence, restoredExactly: exact })
  await application.evaluate(() => { delete globalThis.igsComparisonModelsCatalog }); probeInstalled = false; persist()
}
async function restoredControl(before, label, expectedChannels) {
  const after = await current()
  assert.deepEqual(after.layers, before.layers); assert.deepEqual(after.generationDraft, before.generationDraft)
  assert.deepEqual(after.acceptedResults, before.acceptedResults); assert.deepEqual(after.primaryBbox, before.primaryBbox)
  assert.equal(after.documentRevision, before.documentRevision); assert.equal(after.dirty, before.dirty)
  assertFiles()
  const changes = (await mutations()).slice(baseline.mutations.length)
  assert.deepEqual(changes.map(({ channel }) => channel), expectedChannels)
  const saved = await readIgsPackage(fixture.packagePath)
  const shadow = new ProjectShadowStore(path.join(appData, 'autosave'))
  await expect.poll(async () => ['absent', 'clean'].includes((await shadow.inspect({ projectPath: fixture.packagePath, savedPackage: saved })).status)).toBe(true)
  report.controls.push({ label, channels: changes, restoredRevision: after.documentRevision, savedPackageUnchanged: true })
  await establishBaseline(label)
}
async function normalClose(label) {
  if (!application) return
  // R3 cleanup order: release old handler reads before awaiting a resumed owned popover;
  // dismiss the actual topmost owned surface first if a regression exposed both surfaces.
  await restoreCatalogProbe(); await restoreObserver()
  if (window && !window.isClosed()) {
    if (await comparison().isVisible() && await models().isVisible()) {
      const compareIsTop = await closeComparisonButton().evaluate((button) => {
        const rect = button.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        return hit !== null && button.contains(hit)
      })
      if (compareIsTop) await closeComparison()
    }
    if (await models().isVisible()) await closeModels()
    await expect.poll(() => window.locator('.app-shell').evaluate((node) => node.inert)).toBe(false)
    await frames()
    if (await comparison().isVisible()) await closeComparison()
    const tab = window.getByRole('tab', { name: projectTitle, exact: true })
    if (await tab.count()) {
      await window.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
      const guard = window.getByRole('dialog', { name: 'Close Project', exact: true })
      await expect.poll(async () => !(await tab.count()) ? 'closed' : await guard.isVisible() ? 'guard' : 'pending').not.toBe('pending')
      if (await guard.isVisible()) { report.controls.push({ label: 'Explicit owned-Project dirty discard during cleanup', declared: true }); await guard.getByRole('button', { name: 'Discard Changes', exact: true }).click() }
      await expect(tab).toHaveCount(0)
    }
  }
  await bound(`${label}-before-close`)
  await application.close()
  report.nativeClosures.push({ label, normal: true, ...(await confirmQualificationProcessExit(nativeChecks)) })
  application = null; window = null; persist()
}

try {
  report.launcher = await launcherProof()
  fixture = await prepare(); report.fixture = fixture; persist()
  await launch('first')
  const refs = fixture.resources, sources = fixture.sources
  const catalog = []
  for (const pair of Object.values(refs)) catalog.push(await exactCatalog(pair.b, 'missing'))
  assert.deepEqual(await api('presets', 'list'), [])
  await establishBaseline('initial declared accepted Project'); assert.equal(baseline.tab.dirty, false)
  assert.equal(baseline.tab.generationDraft.model.fileSha256, wrongSha)
  check('01 Original Main discovers one declared accepted package and eight catalog-only files: B missing, A ready/default, no runtime or presets; strict package/asset/SQLite baseline', { catalog, documentRevision: baseline.tab.documentRevision })

  await openComparison(sources.ordinary); await unchanged(baseline, 'ordinary actual comparison read')
  await expect(comparison().locator('[data-comparison-model-action]')).toHaveCount(6)
  check('02 Ordinary Raster layer menu crosses original preload/Main strict portable read, with independent Generated-with B and Current-Canvas wrong-SHA A actions and six exact resource diagnostics')

  await screenshot('ordinary-comparison', comparison(), 1440, 900)
  await rebaseAfterResize('Declared initial screenshot viewport')
  const generated = await roundtrip('model.resource', 'generated', refs.checkpoint.b)
  assert.equal(generated.state.showSame, 'true'); assert.ok(generated.state.scroll > 0, 'Exercise retained nonzero comparison scroll')
  check('03 Generated-with checkpoint Models Close preserves Show unchanged, nonzero scroll, exact action key/focus, immutable result/current draft and all read-only witnesses', generated)

  const currentSide = await roundtrip('model.resource', 'current', refs.checkpoint.a, 'escape', { mismatch: true })
  check('04 Current-Canvas exact A IDs with wrong SHA remain unavailable despite ready Default A and identical display label; no reference badge or fallback/default choice, Escape restores the current-side action', currentSide)

  const resourceRoutes = []
  for (const [key, resource] of [['loras.stack', refs.lora.b], ['vae.resource', refs.vae.b], ['prompt.embeddings', refs.embedding.b], ['negativePrompt.embeddings', refs.embedding.b]]) resourceRoutes.push(await roundtrip(key, 'generated', resource, 'escape'))
  await action('negativePrompt.embeddings', 'generated', refs.embedding.b).click(); await focusedModels(refs.embedding.b, 'generated')
  const beforeNarrowModels = await window.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  await screenshot('negative-prompt-models', models(), 900, 620)
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), beforeNarrowModels)
  await expect.poll(() => window.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(beforeNarrowModels)
  await frames()
  await closeModels(); await settled(comparison())
  await rebaseAfterResize('Declared narrow Models screenshot and viewport restoration')
  await unchanged(baseline, 'all resource polarity routes')
  check('05 Ordered LoRA, external VAE and separate positive/negative TI row actions cross exact Models categories and preserve polarity, stable focus, raw prompts, history, pixels and package', { resourceRoutes })

  await closeComparison()
  await project().getByRole('button', { name: `Select ${sources.active.name}`, exact: true }).click()
  await expect(project().getByRole('textbox', { name: 'Steps', exact: true })).toHaveValue('67')
  await establishBaseline('explicit initial Patch selection')
  await openComparison(sources.active)
  const smart = await roundtrip('model.resource', 'generated', refs.checkpoint.b)
  check('06 Active Smart owner reads its exact accepted member; selected Patch Steps 67 cannot replace Project 17 or saved 4, Smart Size remains absent through genuine Models return', smart)

  await closeComparison(); await openComparison(sources.converted)
  const converted = await roundtrip('loras.stack', 'generated', refs.lora.b, 'escape')
  await unchanged(baseline, 'converted Smart read and handoff')
  check('07 Converted Smart Raster uses strict Smart read/owner/hash identity with no Size, then exact generated LoRA Models Escape without changing its provenance or active Patch', converted)

  await screenshot('converted-comparison', comparison(), 900, 620)
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900))
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([1440, 900]); await settled(comparison())
  await rebaseAfterResize('Declared narrow converted comparison screenshot and viewport restoration')
  await unchanged(baseline, 'bounded comparison layouts')
  check('08 Three actual prefixed screenshots cover settled NPopover/NModal at 1440×900 and 900×620 with bounded geometry and usable scroll; root owns visual inspection')

  const beforeHeld = await witness()
  await action('loras.stack', 'generated', refs.lora.b).scrollIntoViewIfNeeded()
  const heldState = await comparisonState()
  await action('loras.stack', 'generated', refs.lora.b).click(); await focusedModels(refs.lora.b, 'generated')
  await installCatalogProbe('hold'); await closeModels()
  await expect.poll(async () => (await probeState()).completed).toBe(true)
  await expect(comparison()).toBeHidden(); await expect(models()).toBeHidden()
  const backgroundClicks = []
  for (const label of ['Models menu', 'Project menu', 'Open Queue Manager', 'Open saved generations']) {
    const button = window.locator(`.app-chrome button[aria-label="${label}"]`), box = await button.boundingBox()
    assert.ok(box, `Missing background chrome control ${label}`)
    assert.equal(await window.locator('.app-shell').evaluate((node) => node.inert), true)
    await window.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await frames()
    await expect(comparison()).toBeHidden(); await expect(models()).toBeHidden()
    await expect(window.locator('[role="dialog"]:visible')).toHaveCount(0)
    backgroundClicks.push({ label, point: [box.x + box.width / 2, box.y + box.height / 2] })
  }
  const backgroundShortcuts = ['Control+s', 'Control+z', 'Control+Shift+z', 'Control+y']
  for (const shortcut of backgroundShortcuts) {
    await window.keyboard.press(shortcut)
    await api('runtime', 'getStatus'); await frames()
    await expect(comparison()).toBeHidden(); await expect(models()).toBeHidden()
    assert.equal((await mutations()).length, beforeHeld.mutations.length)
  }
  assert.equal((await probeState()).delivered, false)
  await restoreCatalogProbe(); await expect.poll(comparisonState).toEqual(heldState)
  await expect(action('loras.stack', 'generated', refs.lora.b)).toBeFocused(); await unchanged(beforeHeld, 'held catalog gap background control')
  check('09 Parent comparison stays hidden through held genuine catalog finalizer, actual background clicks and Save/Undo/Redo shortcuts; exact retained source/focus returns only after settlement without a mutation', { backgroundClicks, backgroundShortcuts, probe: report.catalogProbes.at(-1) })

  await action('loras.stack', 'generated', refs.lora.b).scrollIntoViewIfNeeded(); const beforeNewer = await comparisonState()
  await action('loras.stack', 'generated', refs.lora.b).click(); await focusedModels(refs.lora.b, 'generated')
  await installCatalogProbe('hold'); await closeModels(); await expect.poll(async () => (await probeState()).completed).toBe(true)
  await expect(comparison()).toBeHidden()
  const notification = await notifyCatalog('owned-compare-newer-catalog')
  await expect.poll(async () => (await probeState()).calls).toBeGreaterThan(1)
  await expect.poll(comparisonState).toEqual(beforeNewer)
  assert.equal((await probeState()).delivered, false)
  await restoreCatalogProbe(); await expect.poll(comparisonState).toEqual(beforeNewer); await unchanged(baseline, 'newer actual read then old catalog reply')
  check('10 Typed completion requests a newer genuine Main catalog read; it settles current return before held old delivery, and late original reply cannot reset source, scroll, focus or state', { notification, probe: report.catalogProbes.at(-1) })

  await action('vae.resource', 'generated', refs.vae.b).click(); await focusedModels(refs.vae.b, 'generated')
  await installCatalogProbe('error'); await closeModels()
  await expect(comparison().locator('[data-setting="vae.resource"]')).toHaveAttribute('data-status', 'Unavailable')
  await expect(comparison().locator('[data-setting="model.resource"]')).toHaveAttribute('data-status', 'Unavailable')
  await expect(action('vae.resource', 'generated', refs.vae.b)).toBeVisible()
  await expect(comparison()).toContainText('Model catalog unavailable')
  await restoreCatalogProbe(); await unchanged(baseline, 'catalog error after actual success')
  await action('vae.resource', 'generated', refs.vae.b).click(); await focusedModels(refs.vae.b, 'generated'); await closeModels('escape')
  await expect(comparison().locator('[data-setting="vae.resource"]')).toHaveAttribute('data-status', 'Missing resource')
  await expect(comparison()).not.toContainText('Model catalog unavailable'); await unchanged(baseline, 'normal exact VAE retry')
  check('11 Controlled rejection after genuine successful Main read exposes unknown catalog with known browsable refs; normal exact VAE retry restores missing-resource distinction without editing saved/current settings', { probe: report.catalogProbes.at(-1) })

  await action('model.resource', 'generated', refs.checkpoint.b).click(); await focusedModels(refs.checkpoint.b, 'generated')
  restoreFile(refs.checkpoint.b, true)
  await notifyCatalog('owned-compare-exact-live-byte-repair')
  await exactCatalog(refs.checkpoint.b, 'ready'); await focusedModels(refs.checkpoint.b, 'generated', { ready: true })
  await closeModels(); await settled(comparison())
  await expect(action('model.resource', 'generated', refs.checkpoint.b)).toHaveCount(0)
  await expect(closeComparisonButton()).toBeFocused()
  await expect(action('model.resource', 'current', refs.checkpoint.a)).toHaveCount(1)
  await unchanged(baseline, 'exact repair only removes generated checkpoint action')
  check('12 Exact B bytes restored during owned Models visit become Referenced by Generated with; returning removes only its action and focuses Compare Close while wrong-SHA current A and library Defaults remain unchanged')

  await closeComparison(); await openComparison(sources.active)
  const beforeActive = await current()
  await action('loras.stack', 'generated', refs.lora.b).click(); await focusedModels(refs.lora.b, 'generated')
  const alternateTab = await api('projects', 'updateSmartPatchVariant', fixture.projectId, sources.active.id, { kind: 'select', variantId: sources.alternateId, documentId: beforeActive.documentId, documentRevision: beforeActive.documentRevision })
  await publishControlTabs([alternateTab], 'Publish genuine Main active-member control response')
  await expect.poll(() => window.locator('.app-shell').evaluate((node) => node.inert)).toBe(false)
  await expect(models()).toBeVisible()
  await frames(); if (await models().isVisible()) await closeModels()
  await expect(comparison()).toBeHidden()
  const activeUndone = await api('projects', 'undo', fixture.projectId)
  await publishControlTabs([activeUndone], 'Publish genuine Main active-member Undo response'); await expect(comparison()).toBeHidden()
  await restoredControl(beforeActive, 'Original Main active-member invalidation then Undo', ['projects:update-smart-patch-variant', 'projects:undo'])
  await openComparison(sources.converted)
  const beforeRevision = await current()
  await action('loras.stack', 'generated', refs.lora.b).click(); await focusedModels(refs.lora.b, 'generated')
  const editedTab = await api('projects', 'updateGenerationDraft', fixture.projectId, { kind: 'positive-prompt', text: 'Declared external document-revision invalidation' })
  await publishControlTabs([editedTab], 'Publish genuine Main revision-edit control response')
  await api('projects', 'sealPromptHistory', fixture.projectId)
  const revisionUndone = await api('projects', 'undo', fixture.projectId)
  await publishControlTabs([revisionUndone], 'Publish genuine Main revision Undo response')
  await expect.poll(() => window.locator('.app-shell').evaluate((node) => node.inert)).toBe(false)
  if (await models().isVisible()) await closeModels()
  await expect(comparison()).toBeHidden()
  await restoredControl(beforeRevision, 'Original Main revision edit/Undo ABA invalidates old owner', ['projects:update-generation-draft', 'projects:seal-prompt-history', 'projects:undo'])
  check('13 Original Main active-member change and document-revision edit invalidate a Models-owned comparison; exact Undo restoration cannot resurrect either old owner; only declared control mutations occurred')

  await openComparison(sources.converted)
  await action('loras.stack', 'generated', refs.lora.b).click(); await focusedModels(refs.lora.b, 'generated')
  await installCatalogProbe('hold'); await closeModels(); await expect.poll(async () => (await probeState()).completed).toBe(true)
  const beforeAba = await current()
  await api('projects', 'discardAndClose', fixture.projectId)
  await publishControlTabs([], 'Publish genuine Main Project close as empty tabs')
  await expect(project()).toBeHidden()
  const reopened = await api('projects', 'open', fixture.projectId); assert.equal(reopened.kind, 'opened')
  await publishControlTabs([reopened.tab], 'Publish genuine Main reopened Project response')
  await window.getByRole('tab', { name: projectTitle, exact: true }).click()
  assert.equal(reopened.tab.documentRevision, beforeAba.documentRevision)
  await expect(project()).toBeVisible(); await expect(comparison()).toBeHidden()
  await restoreCatalogProbe(); await frames(); await expect(comparison()).toBeHidden()
  assertFiles()
  const abaMutations = (await mutations()).slice(baseline.mutations.length)
  assert.deepEqual(abaMutations.map(({ channel }) => channel), ['projects:discard-and-close'])
  report.controls.push({ label: 'Declared original Main Project close/reopen ABA during held old catalog read', beforeRevision: beforeAba.documentRevision, reopenedRevision: reopened.tab.documentRevision, mutations: abaMutations, probe: report.catalogProbes.at(-1) })
  await establishBaseline('declared Project close/reopen ABA')
  check('14 Actual Main Project discard/close/reopen returns identical saved revision under a new physical owner; delayed old catalog response cannot reopen comparison across the ABA boundary')

  await unchanged(baseline, 'first lifetime final owner')
  await normalClose('first-normal')
  await launch('second')
  await establishBaseline('second physical app lifetime')
  assert.equal(baseline.tab.documentId, fixture.savedDocument.documentId)
  assert.equal(baseline.tab.documentRevision, fixture.savedDocument.documentRevision)
  assert.deepEqual(baseline.tab.generationDraft, fixture.savedDocument.generationDraft)
  await openComparison(sources.ordinary)
  const restarted = await roundtrip('negativePrompt.embeddings', 'generated', refs.embedding.b, 'escape')
  await unchanged(baseline, 'second physical lifetime handoff')
  check('15 Second normal physical app lifetime reopens the same portable package through original Main and repeats exact negative-prompt resource handoff with unchanged identities, pixels, settings and history', { firstClosure: report.nativeClosures[0], restarted })

  await closeComparison(); await normalClose('second-normal')
  for (const pair of Object.values(refs)) for (const resource of Object.values(pair)) restoreFile(resource)
  assertFiles(); assert.equal(withdrawn.size, 0)
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256); assert.deepEqual(hashes(bundleFiles), report.bundleSha256)
  assert.equal(report.nativeClosures.length, 2); assert.equal(report.screenshots.length, 3)
  assert.ok(report.catalogProbes.every((probe) => probe.restoredExactly && probe.inFlight === 0))
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.vueWarnings, [])
  check('16 Both native lifetimes closed normally with physical exit proof; captured handlers/in-flight calls settled, every managed fixture/rollback byte and all source/five bundle hashes restored/unchanged')
  assert.equal(report.checks.length, 16)
  report.outcome = 'passed'
} catch (error) {
  process.exitCode = 1; report.outcome = 'failed'; report.failure = { message: error.message, stack: error.stack }; persist()
  if (window && !window.isClosed()) try {
    const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-failure.png`)
    if (!existsSync(file)) await window.screenshot({ path: file, animations: 'disabled', timeout: 5_000 })
    report.failureScreenshot = { path: file, sha256: digest(readFileSync(file)) }
  } catch (captureError) { report.failureScreenshotError = String(captureError) }
} finally {
  if (application) {
    try { await normalClose('failure-normal-cleanup') }
    catch (error) { process.exitCode = 1; report.outcome = 'failed'; report.normalCleanupFailure = { message: error.message, stack: error.stack } }
  }
  if (!application) {
    try { for (const { resource } of [...withdrawn.values()]) restoreFile(resource); if (fixture) assertFiles() }
    catch (error) { process.exitCode = 1; report.outcome = 'failed'; report.restorationFailure = { message: error.message, stack: error.stack } }
  }
  report.finishedAt = new Date().toISOString(); report.physicallyClosed = !application
  report.retainedDependencies = application ? ['Live owned native actors and rollback data; do not delete payload'] : ['Declared fixture package/assets/catalog/rollback and compact report/screenshots retained for root verification and disposal']
  persist()
}
