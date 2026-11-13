/**
 * Finite built resource-specific Remove and reviewed pending-only cancellation qualification; ROOT executes and inspects screenshots.
 * pnpm exec tsx scripts/smoke-model-removal-usage.mjs --report-file ABSOLUTE_NEW_REPORT
 * Run under <=2 GiB/zero-swap/600s controller; actual owned native groups <=2 GiB/480s.
 * Tiny catalog-only files and declared accepted .igs records are preconditions, not ML/Add evidence.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron, expect } from '@playwright/test'
import Database from 'better-sqlite3'

import { openAppDatabase } from '../src/main/db/database.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { GenerationQueueRepository } from '../src/main/projects/generation-queue.ts'
import { createRegionalQueueFixture } from '../src/main/projects/test-fixtures/regional-queue.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import { withSmartComparisonProject } from '../src/main/projects/test-fixtures/smart-result-comparison.ts'
import { isRasterGenerationData } from '../src/shared/projects/generation-settings-comparison.ts'
import { parseProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import { boundQualificationProcess, confirmQualificationProcessExit } from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4)
assert.equal(process.argv[2], '--report-file')
const reportFile = process.argv[3], evidenceRoot = path.dirname(reportFile)
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Never overwrite another run')
const relative = path.relative(path.join(os.homedir(), '.codex/artifacts/imagegen-studio'), evidenceRoot)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
assert.equal(realpathSync(evidenceRoot), evidenceRoot)
assert.ok(lstatSync(evidenceRoot).isDirectory() && !lstatSync(evidenceRoot).isSymbolicLink())
const temporaryRoot = os.tmpdir(), temporaryRelative = path.relative(path.join(os.homedir(), '.codex/artifacts/imagegen-studio'), temporaryRoot)
assert.ok(temporaryRelative && !temporaryRelative.startsWith('..') && !path.isAbsolute(temporaryRelative), 'Use an exact owned TMPDIR inside the artifact root')
assert.equal(realpathSync(temporaryRoot), temporaryRoot)
assert.equal(lstatSync(temporaryRoot).isSymbolicLink(), false)
const payload = mkdtempSync(path.join(evidenceRoot, 'native-resource-usage-'))
const appData = path.join(payload, 'data/imagegen-studio'), originals = path.join(payload, 'original-bytes')
const workspace = path.join(appData, 'workspaces/Uncategorized')
for (const directory of [appData, originals, workspace]) mkdirSync(directory, { recursive: true, mode: 0o700 })
const execute = promisify(execFile), digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashes = (files) => Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const sourceFiles = [
  'scripts/smoke-model-removal-usage.mjs', 'scripts/native-smoke-window.mjs', 'scripts/qualification-resource-limits.mjs',
  'src/shared/model-removal.ts', 'src/shared/api.ts', 'src/preload/index.ts', 'src/main/index.ts',
  'src/main/models/model-removal-service.ts', 'src/main/models/model-repository.ts',
  'src/main/models/model-service.ts', 'src/main/models/model-install-coordinator.ts',
  'src/main/db/database.ts', 'src/main/db/database.types.ts', 'src/main/db/migrations/0030_model_reference_identity.sql',
  'src/main/projects/generation-action-controller.ts', 'src/main/projects/generation-queue.ts',
  'src/main/projects/queue-resource-usage.ts', 'src/main/projects/regional-queued-generation.ts',
  'src/main/projects/smart-patch-frozen-input.ts', 'src/main/projects/anima-queued-generation.ts',
  'src/main/projects/anima-regional-queued-generation.ts', 'src/main/projects/test-fixtures/regional-queue.ts',
  'src/main/projects/project-service.ts', 'src/main/projects/igs-package.ts',
  'src/main/projects/test-fixtures/smart-result-comparison.ts', 'src/renderer/App.vue',
  'src/renderer/components/ModelManager.vue', 'src/renderer/components/model-manager-read-guard.ts',
  'src/renderer/components/GenerationSettingsComparison.vue', 'src/shared/projects/generation-settings-comparison.ts',
]
const bundleFiles = ['dist/main/main.cjs', 'dist/preload/preload.cjs', 'dist/renderer/index.html', ...readdirSync('dist/renderer/assets').filter((name) => /\.(?:js|css)$/.test(name)).map((name) => `dist/renderer/assets/${name}`)]
assert.equal(bundleFiles.length, 5)
const report = {
  outcome: 'running', startedAt: new Date().toISOString(), payloads: [payload],
  sourceSha256: hashes(sourceFiles), bundleSha256: hashes(bundleFiles), checks: [], screenshots: [], controls: [],
  nativeClosures: [], resourceChecks: [], readbacks: [], witnesses: [], restorations: [], pageErrors: [], vueWarnings: [],
  sourceBasis: {
    invokeRevision: '4875d96531ca6712b288f6e660fcbb34143408c1',
    invokePaths: ['invokeai/app/services/shared/database/queries/session_queue.py:cancel_waiting_work/pending CAS', 'invokeai/app/services/session_queue/session_queue_default.py:cancel_all_except_current', 'invokeai/app/api/routers/session_queue.py:cancel_all_except_current', 'invokeai/app/api/routers/model_manager.py:_claim_model_key/delete_model'],
    studio: 'Existing ModelRepository verified publication and withSmartComparisonProject declared accepted package; existing ordinary enqueue/claim owners create valid frozen queue preconditions after Main startup. Actual built Main reviews and cancels the confirmed resource scope. No independent queue/classifier/acceptance owner.',
  },
  finiteScope: { checks: 14, normalPhysicalLifetimes: 2, screenshots: 3, family: 'illustrious', catalogOnlyVersions: 3, managedPaths: 2, queueOperation: 'illustrious-txt2img' },
  boundary: 'Actual built Main resource-specific Remove and pending-only cancellation. Queue preconditions use a separate trusted existing repository on the owned app database after startup while it is empty; they are not public Generate evidence. Running controls are genuine queue claims with no worker started, then explicitly terminalized only as owned fixture cleanup. No running worker cancellation, inference, ML, network, Anima native or full matrix qualification. Unrelated running/pending rows and all frozen inputs are checked exactly at the consumer before cleanup. Root owns execution, screenshots, physical exit, retention and disposal.',
}
let application, window, fixture, baseline, nativeChecks = [], observerInstalled = false
let queueTemplate, queueDatabase, queueOwner
const ownedQueueIds = []
const title = 'Owned resource usage source'
const models = () => window.getByRole('dialog', { name: 'Model Manager', exact: true })
const removal = () => window.getByRole('dialog', { name: 'Remove Local Resource', exact: true })
const project = () => window.getByLabel(`Project ${title}`, { exact: true })
const comparison = () => window.getByRole('dialog', { name: 'Compare generation settings', exact: true })
const persist = () => writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
const check = (name, evidence = {}) => { report.checks.push({ name, ...evidence }); persist(); console.log(`PASS ${name}`) }
persist()

async function prepare() {
  const database = openAppDatabase(appData, path.resolve('src/main/db/migrations')), resources = []
  try {
    const repository = new ModelRepository(database.db)
    for (const [index, suffix] of ['A', 'B', 'shared A'].entries()) {
      const bytes = Buffer.from(`Owned hard-removal catalog-only ${index === 1 ? 'B' : 'A'}; not loadable weights.`)
      const sha256 = digest(bytes), managedPath = path.join(appData, 'models', sha256.slice(0, 2), `${sha256}.safetensors`)
      mkdirSync(path.dirname(managedPath), { recursive: true, mode: 0o700 })
      if (!existsSync(managedPath)) writeFileSync(managedPath, bytes, { flag: 'wx', mode: 0o600 })
      const backup = path.join(originals, `${index}.safetensors`); copyFileSync(managedPath, backup)
      const modelId = index === 2 ? 989_220 : 989_210, remote = 989_211 + index
      const name = index === 2 ? 'Retained shared checkpoint' : 'Remove owned checkpoint'
      const artifact = {
        file: { managedPath, originalFilename: `owned-${index}.safetensors`, sha256, sizeBytes: bytes.length, verifiedAt: new Date().toISOString() },
        resource: { displayName: name, creator: 'Owned native fixture', source: { kind: 'civitai', modelId }, sourceMetadata: { fixture: true }, type: 'checkpoint' },
        version: { baseModelFamily: 'illustrious', format: 'safetensors', name: `Exact ${suffix}`, predictionType: 'epsilon', source: { kind: 'civitai', versionId: remote, fileId: remote + 1000, expectedSha256: sha256 }, sourceMetadata: { fixture: true } },
      }
      const installed = await repository.publishVerifiedInstallation({ primary: artifact })
      resources.push({ ...installed, name, backup, artifact, sha256, managedPath, portable: { baseModelFamily: 'illustrious', civitaiFileId: remote + 1000, civitaiModelId: modelId, civitaiVersionId: remote, displayName: name, fileSha256: sha256, kind: 'checkpoint', localModelId: installed.resourceId, localVersionId: installed.versionId, predictionType: 'epsilon', versionName: artifact.version.name } })
    }
    assert.equal(resources[0].resourceId, resources[1].resourceId)
    assert.equal(resources[0].managedPath, resources[2].managedPath)
    await repository.setDefaultVersion(resources[0].resourceId, resources[0].versionId)
  } finally { await database.close() }
  const packagePath = path.join(workspace, `${title}.igs`)
  let ordinary
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    const document = structuredClone(f.owner.document); document.title = title
    document.generationDraft.model = structuredClone(resources[1].portable)
    const layer = document.layers.find((candidate) => candidate.id === f.ordinary.id)
    layer.generationProvenance.generationConfiguration.model = structuredClone(resources[1].portable)
    await f.owner.applyDocument(parseProjectDocumentV1(document)); await f.service.save(f.tabId)
    copyFileSync(f.owner.filePath, packagePath)
    ordinary = { id: layer.id, name: layer.name }
  })
  const saved = await readIgsPackage(packagePath), assets = []
  for (const layer of saved.project.layers) for (const record of layer.kind === 'smart-patch' ? layer.rasterSubLayers : [layer]) {
    const bytes = await saved.readMember(record.asset.path); assert.equal(digest(bytes), record.asset.sha256)
    const retained = path.join(payload, `${record.id}.png`); writeFileSync(retained, bytes, { flag: 'wx', mode: 0o600 })
    assets.push({ path: record.asset.path, sha256: record.asset.sha256, retained })
  }
  const source = await createRegionalQueueFixture()
  try {
    const targetPath = path.join(payload, 'queue-target.png')
    writeFileSync(targetPath, source.prepared.targetPngBytes, { flag: 'wx', mode: 0o600 })
    queueTemplate = { prepared: structuredClone(source.prepared), request: structuredClone(source.request) }
    queueTemplate.prepared.targetPngBytes = Buffer.from(source.prepared.targetPngBytes)
    queueTemplate.prepared.context.documentId = saved.project.documentId
    queueTemplate.prepared.context.documentRevision = saved.project.documentRevision
    queueTemplate.request.job.target.path = targetPath
    queueTemplate.request.job.output = { pngPath: path.join(payload, 'result.png'), stagingRoot: payload }
  } finally { await source.close() }
  return { resources, ordinary, packagePath, packageSha256: digest(readFileSync(packagePath)), savedDocument: saved.project, projectId: localProjectRecoveryKey(packagePath), assets }
}
async function rawApi(scope, method, ...args) { return await window.evaluate(({ scope, method, args }) => window.api[scope][method](...args), { scope, method, args }) }
async function api(scope, method, ...args) { const response = await rawApi(scope, method, ...args); assert.equal(response.ok, true, JSON.stringify(response)); return response.value }
async function frames() { await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))) }
function seconds(value) {
  const text = value.replace(/\s+/g, ''), token = /(\d+(?:\.\d+)?)(us|ms|min|s|h|d)/g
  if (text === '0') return 0
  assert.equal(text.replace(token, ''), '')
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
async function installObserver() {
  await application.evaluate(({ ipcMain }) => {
    const state = { originals: new Map(ipcMain._invokeHandlers), calls: [], inFlight: 0 }; globalThis.igsResourceUsageObserver = state
    for (const [channel, original] of state.originals) ipcMain._invokeHandlers.set(channel, async (event, ...args) => {
      const call = { channel, args: structuredClone(args), finished: false }; state.calls.push(call); ++state.inFlight
      try { const result = await original(event, ...args); call.response = structuredClone(result); return result }
      finally { call.finished = true; --state.inFlight }
    })
  }); observerInstalled = true
}
async function restoreObserver() {
  if (!observerInstalled) return
  await expect.poll(() => application.evaluate(() => globalThis.igsResourceUsageObserver.inFlight)).toBe(0)
  const proof = await application.evaluate(({ ipcMain }) => {
    const state = globalThis.igsResourceUsageObserver
    for (const [channel, original] of state.originals) ipcMain._invokeHandlers.set(channel, original)
    return { restoredExactly: [...state.originals].every(([channel, original]) => ipcMain._invokeHandlers.get(channel) === original), inFlight: state.inFlight, calls: structuredClone(state.calls) }
  })
  assert.equal(proof.restoredExactly, true); report.readbacks.push(proof); observerInstalled = false; persist()
}
async function launch(label) {
  const env = { ...process.env, NODE_ENV: 'test', CUDA_VISIBLE_DEVICES: '', XDG_CONFIG_HOME: path.join(payload, 'config'), XDG_DATA_HOME: path.join(payload, 'data') }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'IMAGEGEN_DEV_SERVER_URL', 'IMAGEGEN_TEST_IMAGE_WORKER']) delete env[key]
  nativeChecks = []; application = await electron.launch({ args: ['--ozone-platform=x11', '.'], cwd: process.cwd(), env, timeout: 30_000 }); await bound(`${label}-launch`)
  window = await isolateNativeSmokeWindow(application); window.setDefaultTimeout(10_000)
  window.on('pageerror', (error) => report.pageErrors.push(error.message)); window.on('console', (message) => { if (message.text().includes('[Vue warn]')) report.vueWarnings.push(message.text()) })
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await window.waitForFunction(() => typeof window.api?.models?.reviewRemoval === 'function')
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${title}`, exact: true }).click(); await expect(project()).toBeVisible()
  await expect(project().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true'); await installObserver()
}
function databaseState() {
  const database = new Database(path.join(appData, 'database/app.sqlite'), { readonly: true, fileMustExist: true })
  try {
    const schema = database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()
    const tables = Object.fromEntries(schema.filter(({ type }) => type === 'table').map(({ name }) => { assert.match(name, /^[a-z_0-9]+$/); return [name, database.prepare(`SELECT * FROM "${name}"`).all().sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))] }))
    return { schema, tables }
  } finally { database.close() }
}
async function documentWitness() {
  const opened = await api('projects', 'open', fixture.projectId); assert.equal(opened.kind, 'opened')
  const saved = await readIgsPackage(fixture.packagePath)
  assert.equal(digest(readFileSync(fixture.packagePath)), fixture.packageSha256)
  assert.deepEqual(saved.project, fixture.savedDocument)
  for (const asset of fixture.assets) { assert.equal(digest(await saved.readMember(asset.path)), asset.sha256); assert.equal(digest(readFileSync(asset.retained)), asset.sha256) }
  return { tab: opened.tab, savedDocument: saved.project, packageSha256: fixture.packageSha256 }
}
async function unchangedDocument(label) { const witness = await documentWitness(); assert.deepEqual(witness, baseline); report.witnesses.push({ label, value: witness }); persist() }
async function openModels(resource) {
  await window.getByRole('button', { name: 'Models menu', exact: true }).click()
  await window.locator('.n-dropdown-menu').getByText('Manage Models', { exact: true }).click()
  await expect(models()).toBeVisible()
  const row = models().locator('.resource-row').filter({ has: window.getByRole('button', { name: new RegExp(resource.name) }) })
  await expect(row).toHaveCount(1); await row.locator('.resource-select').click()
  await expect(models().locator('h2').filter({ hasText: resource.name })).toBeVisible()
}
async function closeModels() { await models().getByRole('button', { name: 'Close Model Manager', exact: true }).click(); await expect(models()).toBeHidden(); await frames() }
async function openComparison() {
  await project().getByRole('button', { name: `Layer actions for ${fixture.ordinary.name}`, exact: true }).click()
  await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click(); await expect(comparison()).toBeVisible()
}
async function openRemoval() {
  await models().getByRole('button', { name: 'Remove Local Resource', exact: true }).click(); await expect(removal()).toBeVisible()
  await expect(removal().getByRole('button', { name: 'Remove permanently', exact: true })).toBeDisabled()
}
async function screenshot(label, surface, width, height) {
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width, height })
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]); await frames()
  await expect.poll(() => surface.evaluate((node) => {
    const carrier = node.closest('.n-popover, .n-modal') ?? node
    return [node, carrier].every((element) => getComputedStyle(element).opacity === '1' && getComputedStyle(element).transform === 'none')
  })).toBe(true)
  const geometry = await surface.evaluate((node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height } })
  assert.ok(geometry.x >= -1 && geometry.y >= -1 && geometry.right <= width + 1 && geometry.bottom <= height + 1)
  const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-${label}-${width}x${height}.png`)
  assert.equal(existsSync(file), false); await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push({ label, path: file, sha256: digest(readFileSync(file)), geometry }); await bound(label); persist()
}
async function normalClose(label) {
  if (!application) return
  await restoreObserver()
  if (window && !window.isClosed()) {
    const importDialog = window.getByRole('dialog', { name: 'Add from CivitAI URL', exact: true })
    if (await removal().isVisible()) { await removal().getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(removal()).toBeHidden() }
    if (await importDialog.isVisible()) await importDialog.getByRole('button', { name: 'Close import dialog', exact: true }).click()
    if (await models().isVisible()) await closeModels()
    if (await comparison().isVisible()) { await comparison().getByRole('button', { name: 'Close generation settings comparison', exact: true }).click(); await expect(comparison()).toBeHidden() }
    await cleanupQueueControls(`${label}: explicit owned queue-state cleanup before Project close`)
    const tab = window.getByRole('tab', { name: title, exact: true })
    if (await tab.count()) {
      await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
      const guard = window.getByRole('dialog', { name: 'Close Project', exact: true })
      await expect.poll(async () => !(await tab.count()) ? 'closed' : await guard.isVisible() ? 'guard' : 'pending').not.toBe('pending')
      if (await guard.isVisible()) { report.controls.push({ label: 'Explicit discard only owned dirty Project during cleanup', declared: true }); await guard.getByRole('button', { name: 'Discard Changes', exact: true }).click() }
      await expect(tab).toHaveCount(0)
    }
  }
  await bound(`${label}-before-close`); await application.close()
  report.nativeClosures.push({ label, normal: true, ...(await confirmQualificationProcessExit(nativeChecks)) }); application = null; window = null; persist()
}
async function restoreExactFixture(label) {
  assert.equal(Boolean(application), false, 'Verified republish requires physical Main exit')
  const database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
  try {
    const repository = new ModelRepository(database.db)
    // Exact B first deliberately tests identity recovery without preserving a deleted Default.
    for (const resource of [fixture.resources[1], fixture.resources[0], fixture.resources[2]]) {
      assert.equal(digest(readFileSync(resource.backup)), resource.sha256)
      if (!existsSync(resource.managedPath)) copyFileSync(resource.backup, resource.managedPath)
      assert.equal(digest(readFileSync(resource.managedPath)), resource.sha256)
      const installed = await repository.listInstalled()
      const existing = installed.find((item) => item.id === resource.resourceId)?.versions.find((item) => item.id === resource.versionId)
      if (!existing) {
        const restored = await repository.publishVerifiedInstallation({ primary: resource.artifact })
        assert.equal(restored.resourceId, resource.resourceId); assert.equal(restored.versionId, resource.versionId)
        report.restorations.push({ label, sha256: resource.sha256, ...restored, newVerifiedPublication: true, networkDownloadClaimed: false })
      }
    }
  } finally { await database.close() }
  persist()
}

function queueRows() {
  return databaseState().tables.generation_queue_item.filter((row) => ownedQueueIds.includes(row.id)).sort((left, right) => left.id.localeCompare(right.id))
}
function queueInputWitness() {
  const result = {}
  const visit = (directory, prefix) => {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name), relative = `${prefix}/${name}`, info = lstatSync(file)
      assert.equal(info.isSymbolicLink(), false, `Never follow a queue fixture symlink: ${relative}`)
      if (info.isDirectory()) visit(file, relative)
      else { assert.equal(info.isFile(), true); result[relative] = { size: info.size, sha256: digest(readFileSync(file)) } }
    }
  }
  for (const id of [...ownedQueueIds].sort()) visit(path.join(appData, 'generation-inputs', id), id)
  return result
}
async function notifyQueueFixture(label) {
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('projects:generation-changed'))
  await frames()
  report.controls.push({ label, declared: true, publication: 'Existing typed projects:generation-changed after a trusted fixture queue operation; not public Generate or worker progress' }); persist()
}
async function openQueueFixtureOwner() {
  assert.equal(queueRows().length, 0)
  assert.equal(databaseState().tables.generation_queue_item.length, 0, 'Recover the fixture producer only while Main has no work')
  queueDatabase = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
  queueOwner = new GenerationQueueRepository(queueDatabase.db, appData)
  await queueOwner.recoverAfterRestart()
  report.controls.push({ label: 'Trusted existing queue owner opened after Main startup on empty owned app database', declared: true, publicGenerateClaimed: false, runtimeInstalled: false }); persist()
}
async function enqueueFor(resource, label) {
  assert.ok(queueOwner && queueTemplate)
  const prepared = structuredClone(queueTemplate.prepared), request = structuredClone(queueTemplate.request)
  prepared.targetPngBytes = Buffer.from(queueTemplate.prepared.targetPngBytes)
  prepared.context.model = { managedPath: resource.managedPath, reference: structuredClone(resource.portable) }
  request.job.checkpoint = { path: resource.managedPath, sha256: resource.sha256, predictionType: 'epsilon' }
  request.requestId = randomUUID()
  const item = await queueOwner.enqueueIllustriousGeneration({ prepared, request, projectPath: fixture.packagePath, stagingSessionId: randomUUID() })
  ownedQueueIds.push(item.id)
  report.controls.push({ label, declared: true, source: 'Existing enqueueIllustriousGeneration with the copied literal ICC PNG/strict prepared fixture and actual catalog binding', queueItem: item, resourceId: resource.resourceId, versionId: resource.versionId, workerStarted: false }); persist()
  return item
}
async function claimRunningControl(item, label) {
  const claimed = await queueOwner.claimNextPending()
  assert.ok(claimed); assert.equal(claimed.item.id, item.id); assert.equal(claimed.item.status, 'running')
  report.controls.push({ label, declared: true, source: 'Genuine queue claim only; no transport/worker or inference invocation', queueItem: claimed.item, workerStarted: false }); persist()
  return claimed.item
}
async function terminalizeFixtureRows(ids, label) {
  if (!queueDatabase || ids.length === 0) return
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  const changes = []
  for (const id of ids) {
    assert.ok(ownedQueueIds.includes(id), 'Only explicitly returned owned fixture IDs may be restored')
    const before = await queueDatabase.db.selectFrom('generation_queue_item').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    if (before.status !== 'pending' && before.status !== 'running') continue
    const now = new Date().toISOString()
    const after = await queueDatabase.db.updateTable('generation_queue_item').set({
      status: 'canceled', error_code: 'USER_CANCELED', error_message: 'Declared fixture restoration; no worker was started.',
      finished_at: now, updated_at: now, status_sequence: before.status_sequence + 1,
    }).where('id', '=', id).where('status', '=', before.status).where('status_sequence', '=', before.status_sequence).returningAll().executeTakeFirstOrThrow()
    changes.push({ before, after })
  }
  if (changes.length) {
    report.controls.push({ label, declared: true, fixtureRestorationOnly: true, runningCancellationQualified: false, workerStarted: false, changes }); persist()
    await notifyQueueFixture(`${label}: publish actual restored fixture rows`)
  }
}
async function cleanupQueueControls(label) {
  if (!queueDatabase) return
  const inputBefore = queueInputWitness()
  await terminalizeFixtureRows(ownedQueueIds, label)
  assert.deepEqual(queueInputWitness(), inputBefore, 'Fixture restoration must retain frozen inputs')
  report.queueCleanup = { label, rows: queueRows(), inputs: inputBefore, noWorkerStarted: true, noProductRunningCancellationClaim: true }; persist()
  await queueDatabase.close(); queueDatabase = null; queueOwner = null
}
function assertApprovedCancellation(before, affectedIds) {
  const after = queueRows()
  assert.equal(after.length, before.length)
  for (const original of before) {
    const actual = after.find((row) => row.id === original.id)
    assert.ok(actual)
    if (!affectedIds.includes(original.id)) { assert.deepEqual(actual, original); continue }
    assert.equal(original.status, 'pending'); assert.equal(actual.status, 'canceled')
    assert.equal(actual.error_code, 'USER_CANCELED'); assert.equal(actual.error_message, 'The job was canceled.')
    assert.equal(actual.status_sequence, original.status_sequence + 1)
    assert.ok(Number.isFinite(Date.parse(actual.finished_at))); assert.equal(actual.updated_at, actual.finished_at)
    const stable = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !['status', 'error_code', 'error_message', 'finished_at', 'updated_at', 'status_sequence'].includes(key)))
    assert.deepEqual(stable(actual), stable(original))
  }
  return after
}

try {
  report.launcher = await launcherProof(); fixture = await prepare(); report.fixture = fixture; persist()
  await launch('first'); baseline = await documentWitness(); report.baseline = baseline
  const [a, b, shared] = fixture.resources
  assert.equal((await api('models', 'getCatalog')).length, 2); assert.equal(baseline.tab.dirty, false)
  check('01 Built Main opens the unchanged declared accepted package and real catalog; runtime is absent and no worker/inference is started')

  await openQueueFixtureOwner()
  const raced = await enqueueFor(b, 'Declared affected pending prerequisite')
  const beforeClaim = await api('models', 'reviewRemoval', b.resourceId)
  assert.equal(beforeClaim.pendingJobs, 1); assert.equal(beforeClaim.runningJobs, 0)
  check('02 Existing ordinary queue admission creates one valid exact-B pending prerequisite after startup; genuine Main resource review counts it')

  await claimRunningControl(raced, 'Declared pending→running queue claim before confirmation')
  const runningBefore = queueRows(), runningInputs = queueInputWitness()
  const blockedRace = await rawApi('models', 'removeLocalResource', beforeClaim.token, true)
  assert.equal(blockedRace.ok, false); assert.equal(blockedRace.error.code, 'MODEL_REMOVAL_USAGE_CHANGED')
  assert.deepEqual(queueRows(), runningBefore); assert.deepEqual(queueInputWitness(), runningInputs)
  await openModels(b); await openRemoval()
  await expect(removal()).toContainText('1 running jobs use this resource')
  await removal().getByRole('checkbox', { name: 'I understand that referenced settings will become unavailable', exact: true }).check()
  await expect(removal().getByRole('button', { name: 'Remove permanently', exact: true })).toBeDisabled()
  await screenshot('running-block', removal(), 1440, 900)
  await removal().getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(removal()).toBeHidden()
  report.controls.push({ label: 'Actual Main rejects reviewed pending after genuine queue claim; no running cancel', declared: true, review: beforeClaim, rejection: blockedRace, rows: runningBefore }); persist()
  await unchangedDocument('Running-use refusal leaves copied settings and package unchanged')
  check('03 Pending→running race rejects even explicit true; actual UI blocks running use and no queue row/input/model/reference is changed')

  await terminalizeFixtureRows([raced.id], 'Restore only the no-worker running prerequisite before next case')
  const unrelatedRunning = await enqueueFor(shared, 'Declared unrelated shared-alias queue prerequisite')
  await claimRunningControl(unrelatedRunning, 'Declared unrelated queue running slot without a worker')
  const affected = [await enqueueFor(b, 'Affected pending one'), await enqueueFor(b, 'Affected pending two')]
  const unrelatedPending = await enqueueFor(shared, 'Declared unrelated shared-alias pending prerequisite')
  const counted = await api('models', 'reviewRemoval', b.resourceId)
  assert.equal(counted.pendingJobs, 2); assert.equal(counted.runningJobs, 0)
  assert.equal(counted.sharedFileCount, 1); assert.equal(counted.versionCount, 2)
  check('04 Main counts exactly two affected pending bindings and excludes unrelated running/pending alias bindings whose shared bytes will survive', { review: counted, unrelatedRunning: unrelatedRunning.id, unrelatedPending: unrelatedPending.id })

  const beforeCancel = queueRows(), cancelInputs = queueInputWitness()
  await openRemoval(); await expect(removal()).toContainText('2 affected pending jobs')
  await removal().getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(removal()).toBeHidden()
  assert.deepEqual(queueRows(), beforeCancel); assert.deepEqual(queueInputWitness(), cancelInputs)
  for (const resource of fixture.resources) assert.equal(digest(readFileSync(resource.managedPath)), resource.sha256)
  await unchangedDocument('Review Cancel leaves all pending/running and copied references unchanged')
  check('05 Actual confirmation Cancel preserves all queue rows, frozen inputs, managed bytes and immutable Project/result references')

  await openRemoval()
  await removal().getByRole('checkbox', { name: 'I understand that referenced settings will become unavailable', exact: true }).check()
  await expect(removal().getByRole('button', { name: 'Remove permanently', exact: true })).toBeDisabled()
  await expect(removal().getByRole('checkbox', { name: 'Cancel these 2 affected pending jobs before removing the resource', exact: true })).not.toBeChecked()
  await removal().getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(removal()).toBeHidden()
  assert.deepEqual(queueRows(), beforeCancel)
  check('06 Reference acknowledgement alone cannot authorize queue cancellation; the actual pending-only acknowledgement remains independently required')

  const withoutConsent = await api('models', 'reviewRemoval', b.resourceId)
  const refused = await rawApi('models', 'removeLocalResource', withoutConsent.token, false)
  assert.equal(refused.ok, false); assert.equal(refused.error.code, 'MODEL_REMOVAL_USAGE_CHANGED')
  assert.deepEqual(queueRows(), beforeCancel); assert.deepEqual(queueInputWitness(), cancelInputs)
  const consumed = await rawApi('models', 'removeLocalResource', withoutConsent.token, true)
  assert.equal(consumed.ok, false); assert.equal(consumed.error.code, 'MODEL_REMOVAL_STALE')
  check('07 Actual Main refuses pending removal without explicit cancellation consent; the consumed token cannot be retried with expanded authority')

  const stale = await api('models', 'reviewRemoval', b.resourceId)
  affected.push(await enqueueFor(b, 'Declared new affected pending after review'))
  const afterNewPending = queueRows(), afterNewInputs = queueInputWitness()
  const staleRefused = await rawApi('models', 'removeLocalResource', stale.token, true)
  assert.equal(staleRefused.ok, false); assert.equal(staleRefused.error.code, 'MODEL_REMOVAL_USAGE_CHANGED')
  assert.deepEqual(queueRows(), afterNewPending); assert.deepEqual(queueInputWitness(), afterNewInputs)
  report.controls.push({ label: 'New affected pending row after genuine Main capture', declared: true, review: stale, newId: affected.at(-1).id, rejection: staleRefused }); persist()
  check('08 A new affected job invalidates the reviewed set without canceling its old subset or silently expanding consent')

  const beforeDelete = databaseState(); await openRemoval()
  await expect(removal()).toContainText('3 affected pending jobs')
  await removal().getByRole('checkbox', { name: 'I understand that referenced settings will become unavailable', exact: true }).check()
  const cancelPending = removal().getByRole('checkbox', { name: 'Cancel these 3 affected pending jobs before removing the resource', exact: true })
  await expect(cancelPending).not.toBeChecked(); await expect(removal().getByRole('button', { name: 'Remove permanently', exact: true })).toBeDisabled()
  await cancelPending.check(); await expect(removal().getByRole('button', { name: 'Remove permanently', exact: true })).toBeEnabled()
  await screenshot('pending-consent', removal(), 900, 620)
  await removal().getByRole('button', { name: 'Remove permanently', exact: true }).click(); await expect(removal()).toBeHidden()
  const canceledRows = assertApprovedCancellation(afterNewPending, affected.map((item) => item.id))
  assert.deepEqual(queueInputWitness(), afterNewInputs)
  report.consumerQueueWitness = { before: afterNewPending, after: canceledRows, affectedIds: affected.map((item) => item.id), unrelatedIds: [unrelatedRunning.id, unrelatedPending.id], inputs: afterNewInputs }; persist()
  check('09 Both actual acknowledgements lead Main to cancel exactly three reviewed pending jobs; unrelated running/pending rows and every frozen input remain exact')

  await expect.poll(async () => (await api('models', 'getCatalog')).some((item) => item.id === b.resourceId)).toBe(false)
  assert.equal(existsSync(b.managedPath), false); assert.equal(digest(readFileSync(shared.managedPath)), shared.sha256)
  const afterDelete = databaseState()
  assert.equal(afterDelete.tables.model_resource.some((row) => row.id === b.resourceId), false)
  assert.equal(afterDelete.tables.model_resource_version.some((row) => [a.versionId, b.versionId].includes(row.id)), false)
  assert.equal(afterDelete.tables.model_reference_identity.length, 2)
  for (const name of Object.keys(beforeDelete.tables)) if (!['generation_queue_item', 'model_resource', 'model_resource_version', 'local_model_file', 'model_version_dependency', 'model_reference_identity'].includes(name)) assert.deepEqual(afterDelete.tables[name], beforeDelete.tables[name], name)
  report.deletedState = afterDelete; persist(); await unchangedDocument('Actual resource-specific hard Remove')
  check('10 Actual managed unlink and hard registry removal preserve shared A, unrelated SQL tables and all Project/result/reference bytes')

  await closeModels()
  await cleanupQueueControls('Explicit terminal fixture restoration after consumer witnesses; no worker existed')
  await openComparison()
  await expect(comparison().locator('[data-setting="model.resource"]')).toHaveAttribute('data-status', 'Missing resource')
  await expect(comparison().locator('[data-setting="model.resource"]')).toContainText(b.sha256)
  await screenshot('missing-reference', comparison(), 900, 620)
  const accepted = await api('projects', 'getRasterGenerationData', fixture.projectId, baseline.tab.documentId, fixture.ordinary.id)
  assert.equal(isRasterGenerationData(accepted), true); assert.deepEqual(accepted.generationConfiguration.model, b.portable)
  await unchangedDocument('Missing exact accepted/current binding remains copied and readable')
  check('11 Actual accepted Compare shows missing exact B without alias/default substitution; cancellation did not rewrite accepted/current settings')

  const retainedQueue = queueRows(), retainedInputs = queueInputWitness()
  assert.ok(retainedQueue.every((row) => row.status === 'canceled'))
  await normalClose('first-normal'); await restoreExactFixture('Explicit new verified publication after first physical exit')
  assert.equal(report.restorations.length, 2)
  check('12 First application closes normally after explicit owned no-worker fixture cleanup; exact fresh verified installation reclaims prior UUIDs without a product Restore')

  await launch('second'); baseline = await documentWitness(); assert.deepEqual(baseline.savedDocument, fixture.savedDocument)
  assert.deepEqual(queueRows(), retainedQueue); assert.deepEqual(queueInputWitness(), retainedInputs)
  const repaired = (await api('models', 'getCatalog')).find((item) => item.id === b.resourceId)
  assert.ok(repaired); assert.ok(repaired.versions.every((version) => version.fileStatus === 'ready'))
  await openComparison(); await comparison().getByRole('checkbox', { name: 'Show unchanged settings', exact: true }).check()
  await expect(comparison().locator('[data-setting="model.resource"]')).toHaveAttribute('data-status', 'Same')
  await expect(comparison().locator('[data-setting="model.resource"] [data-comparison-model-action]')).toHaveCount(0)
  await unchangedDocument('Restarted exact references and retained canceled inputs')
  check('13 Second physical lifetime preserves durable canceled rows/frozen inputs and sees exact reinstalled UUIDs in actual Compare without relinking')

  await normalClose('second-normal'); await restoreExactFixture('Final no-op verified restoration')
  assert.equal(report.nativeClosures.length, 2); assert.equal(report.screenshots.length, 3)
  assert.ok(report.readbacks.every((entry) => entry.restoredExactly && entry.inFlight === 0))
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.vueWarnings, [])
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256); assert.deepEqual(hashes(bundleFiles), report.bundleSha256)
  for (const resource of fixture.resources) { assert.equal(digest(readFileSync(resource.backup)), resource.sha256); assert.equal(digest(readFileSync(resource.managedPath)), resource.sha256) }
  report.finalQueue = { rows: queueRows(), inputs: queueInputWitness() }
  check('14 Both native lifetimes close normally with physical exit, original handlers restored, owned fixture bytes restored and source/five bundles unchanged')
  assert.equal(report.checks.length, 14); report.outcome = 'passed'
} catch (error) {
  process.exitCode = 1; report.outcome = 'failed'; report.failure = { message: error.message, stack: error.stack }; persist()
  if (window && !window.isClosed()) try { const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-failure.png`); if (!existsSync(file)) await window.screenshot({ path: file, animations: 'disabled', timeout: 5_000 }); report.failureScreenshot = { path: file, sha256: digest(readFileSync(file)) } } catch (captureError) { report.failureScreenshotError = String(captureError) }
} finally {
  if (application) try { await normalClose('failure-normal-cleanup') } catch (error) { process.exitCode = 1; report.outcome = 'failed'; report.normalCleanupFailure = { message: error.message, stack: error.stack } }
  if (!application && queueDatabase) try { await queueDatabase.close(); queueDatabase = null; queueOwner = null } catch (error) { process.exitCode = 1; report.restorationFailure = { message: error.message, stack: error.stack } }
  if (!application && fixture) try { await restoreExactFixture('Failure/final fixture byte restoration after physical exit') } catch (error) { process.exitCode = 1; report.outcome = 'failed'; report.restorationFailure = { message: error.message, stack: error.stack } }
  report.finishedAt = new Date().toISOString(); report.physicallyClosed = !application
  report.retainedDependencies = application ? ['Live owned native actors/fixture restoration state; do not clean payload'] : ['Own prepared package/catalog/queue inputs/original bytes and compact report retained for Root audit/disposal']
  persist()
}
