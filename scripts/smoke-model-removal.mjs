/**
 * Finite built hard Remove qualification; ROOT executes and inspects screenshots.
 * pnpm exec tsx scripts/smoke-model-removal.mjs --report-file ABSOLUTE_NEW_REPORT
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
const payload = mkdtempSync(path.join(evidenceRoot, 'native-model-removal-'))
const appData = path.join(payload, 'data/imagegen-studio'), originals = path.join(payload, 'original-bytes')
const workspace = path.join(appData, 'workspaces/Uncategorized')
for (const directory of [appData, originals, workspace]) mkdirSync(directory, { recursive: true, mode: 0o700 })
const execute = promisify(execFile), digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashes = (files) => Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const sourceFiles = [
  'scripts/smoke-model-removal.mjs', 'scripts/native-smoke-window.mjs', 'scripts/qualification-resource-limits.mjs',
  'src/shared/model-removal.ts', 'src/shared/api.ts', 'src/preload/index.ts', 'src/main/index.ts',
  'src/main/models/model-removal-service.ts', 'src/main/models/model-repository.ts',
  'src/main/models/model-service.ts', 'src/main/models/model-install-coordinator.ts',
  'src/main/db/database.ts', 'src/main/db/database.types.ts', 'src/main/db/migrations/0030_model_reference_identity.sql',
  'src/main/projects/generation-action-controller.ts', 'src/main/projects/generation-queue.ts',
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
    invokePaths: ['invokeai/app/api/routers/model_manager.py:_claim_model_key/delete_model', 'invokeai/app/services/model_install/model_install_default.py:delete/unconditionally_delete', 'invokeai/frontend/webv2/src/features/models/ui/shared/ModelActionsMenu.tsx:confirmation caller'],
    studio: 'Existing ModelRepository verified publication, withSmartComparisonProject declared accepted package and actual Main remove consumer. No independent acceptance or registry implementation.',
  },
  finiteScope: { checks: 10, normalPhysicalLifetimes: 2, screenshots: 3, family: 'illustrious', catalogOnlyVersions: 3, managedPaths: 2 },
  boundary: 'Idle-only hard Remove through built renderer/preload/Main/SQLite/files. Shared path and exact verified reinstall identities are real. Queue/installer/failure races remain lower-test evidence; no Anima native, ML, download, Add, conversion or public readiness claim. Direct setDefault controls are declared original Main commands. Explicit screenshot resizing does not assert preservation of screen camera pan.',
}
let application, window, fixture, baseline, nativeChecks = [], observerInstalled = false, reviewProbeInstalled = false
const title = 'Owned hard removal source'
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
    const state = { originals: new Map(ipcMain._invokeHandlers), calls: [], inFlight: 0 }; globalThis.igsRemovalObserver = state
    for (const [channel, original] of state.originals) ipcMain._invokeHandlers.set(channel, async (event, ...args) => {
      const call = { channel, args: structuredClone(args), finished: false }; state.calls.push(call); ++state.inFlight
      try { const result = await original(event, ...args); call.response = structuredClone(result); return result }
      finally { call.finished = true; --state.inFlight }
    })
  }); observerInstalled = true
}
async function restoreObserver() {
  if (!observerInstalled) return
  await expect.poll(() => application.evaluate(() => globalThis.igsRemovalObserver.inFlight)).toBe(0)
  const proof = await application.evaluate(({ ipcMain }) => {
    const state = globalThis.igsRemovalObserver
    for (const [channel, original] of state.originals) ipcMain._invokeHandlers.set(channel, original)
    return { restoredExactly: [...state.originals].every(([channel, original]) => ipcMain._invokeHandlers.get(channel) === original), inFlight: state.inFlight, calls: structuredClone(state.calls) }
  })
  assert.equal(proof.restoredExactly, true); report.readbacks.push(proof); observerInstalled = false; persist()
}
async function holdReview() {
  await application.evaluate(({ ipcMain }) => {
    const channel = 'models:review-removal', original = ipcMain._invokeHandlers.get(channel)
    const state = { original, completed: false, originalOk: false, release: null }
    const held = new Promise((resolve) => { state.release = resolve })
    globalThis.igsHeldRemovalReview = state
    ipcMain._invokeHandlers.set(channel, async (...args) => {
      const result = await original(...args); state.completed = true; state.originalOk = result?.ok === true
      await held; return result
    })
  })
  reviewProbeInstalled = true
}
async function releaseReview() {
  if (!reviewProbeInstalled) return
  const proof = await application.evaluate(({ ipcMain }) => {
    const state = globalThis.igsHeldRemovalReview
    ipcMain._invokeHandlers.set('models:review-removal', state.original); state.release()
    return { completed: state.completed, originalOk: state.originalOk, restoredExactly: ipcMain._invokeHandlers.get('models:review-removal') === state.original }
  })
  assert.equal(proof.restoredExactly, true); report.controls.push({ label: 'Held genuine Main removal review', ...proof }); reviewProbeInstalled = false; persist()
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
  await releaseReview()
  await restoreObserver()
  if (window && !window.isClosed()) {
    const importDialog = window.getByRole('dialog', { name: 'Add from CivitAI URL', exact: true })
    if (await removal().isVisible()) { await removal().getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(removal()).toBeHidden() }
    if (await importDialog.isVisible()) await importDialog.getByRole('button', { name: 'Close import dialog', exact: true }).click()
    if (await models().isVisible()) await closeModels()
    if (await comparison().isVisible()) { await comparison().getByRole('button', { name: 'Close generation settings comparison', exact: true }).click(); await expect(comparison()).toBeHidden() }
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

try {
  report.launcher = await launcherProof(); fixture = await prepare(); report.fixture = fixture; persist()
  await launch('first'); baseline = await documentWitness(); report.baseline = baseline
  const [a, b, shared] = fixture.resources
  assert.equal((await api('models', 'getCatalog')).length, 2); assert.equal(baseline.tab.dirty, false)
  check('01 Original built Main opens owned accepted package and two ready resource records backed by two managed paths; no runtime or inference')

  const beforeCancel = databaseState(); await openModels(b)
  await holdReview()
  await models().getByRole('button', { name: 'Remove Local Resource', exact: true }).click()
  await expect.poll(() => application.evaluate(() => globalThis.igsHeldRemovalReview.completed && globalThis.igsHeldRemovalReview.originalOk)).toBe(true)
  const add = models().getByRole('button', { name: 'Add from CivitAI URL', exact: true }), box = await add.boundingBox()
  assert.ok(box); await window.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await releaseReview(); await expect(removal()).toBeVisible()
  await expect(window.getByRole('dialog', { name: 'Add from CivitAI URL', exact: true })).toBeHidden()
  await expect(add).toBeDisabled()
  await expect(removal().getByRole('button', { name: 'Remove permanently', exact: true })).toBeDisabled()
  await expect(removal()).toContainText(b.name); await expect(removal()).toContainText(/referenc/i)
  await screenshot('confirmation', removal(), 1440, 900); await screenshot('narrow-confirmation', removal(), 900, 620)
  await removal().getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(removal()).toBeHidden()
  assert.deepEqual(databaseState(), beforeCancel); for (const resource of fixture.resources) assert.equal(digest(readFileSync(resource.managedPath)), resource.sha256)
  await unchangedDocument('Cancel preserves all Project and provenance witnesses')
  check('02 Actual Remove action captures whole resource, requires acknowledgement and Cancel preserves every registry/file/reference byte')

  const reviewed = await api('models', 'reviewRemoval', b.resourceId)
  assert.equal(reviewed.resourceId, b.resourceId); assert.equal(reviewed.versionCount, 2); assert.equal(reviewed.fileCount, 2); assert.equal(reviewed.sharedFileCount, 1)
  await api('models', 'setDefaultVersion', a.resourceId, b.versionId)
  const stale = await rawApi('models', 'removeLocalResource', reviewed.token); assert.equal(stale.ok, false)
  assert.equal(stale.error.code, 'MODEL_REMOVAL_FAILED')
  await api('models', 'setDefaultVersion', a.resourceId, a.versionId)
  for (const resource of fixture.resources) assert.equal(digest(readFileSync(resource.managedPath)), resource.sha256)
  await unchangedDocument('Declared original Main default edit stale review control')
  report.controls.push({ label: 'Original Main setDefault A→B invalidates capture; explicit A restoration', declared: true, reviewed, rejected: stale }); persist()
  check('03 Authoritative review reports two versions, two paths and one shared path; actual Default edit invalidates old removal token without unlinking')

  const invalidToken = await rawApi('models', 'removeLocalResource', randomUUID()), invalidPath = await rawApi('models', 'reviewRemoval', '../models')
  assert.equal(invalidToken.ok, false); assert.equal(invalidPath.ok, false)
  assert.equal(invalidToken.error.code, 'MODEL_REMOVAL_STALE')
  await unchangedDocument('Invalid token/path-shaped input refusal')
  check('04 Unknown token and path-shaped resource ID fail at real API authority without touching Project, catalog or managed bytes', { invalidToken, invalidPath })

  const beforeDelete = databaseState(); await openRemoval()
  await removal().getByRole('checkbox', { name: 'I understand that referenced settings will become unavailable', exact: true }).check()
  await removal().getByRole('button', { name: 'Remove permanently', exact: true }).click(); await expect(removal()).toBeHidden()
  await expect.poll(async () => (await api('models', 'getCatalog')).some((item) => item.id === b.resourceId)).toBe(false)
  await expect(models().locator('.resource-row').filter({ hasText: b.name })).toHaveCount(0)
  await expect(models().getByRole('button', { name: /^(?:Restore|Trash)(?: |$)/ })).toHaveCount(0)
  assert.equal(existsSync(b.managedPath), false); assert.equal(digest(readFileSync(shared.managedPath)), shared.sha256)
  assert.equal((await api('models', 'getStorageSummary')).totalBytes, shared.artifact.file.sizeBytes)
  const afterDelete = databaseState(), ledger = afterDelete.tables.model_reference_identity
  assert.equal(afterDelete.tables.model_resource.some((row) => row.id === b.resourceId), false)
  assert.equal(afterDelete.tables.model_resource_version.some((row) => [a.versionId, b.versionId].includes(row.id)), false)
  assert.equal(afterDelete.tables.local_model_file.some((row) => [a.versionId, b.versionId].includes(row.resource_version_id)), false)
  assert.equal(ledger.length, 2)
  assert.deepEqual(Object.keys(ledger[0]).sort(), ['version_id', 'resource_id', 'source_kind', 'source_key', 'civitai_model_id', 'civitai_model_version_id', 'civitai_file_id', 'source_revision', 'type', 'base_model_family', 'sha256', 'size_bytes'].sort())
  for (const name of Object.keys(beforeDelete.tables)) if (!['model_resource', 'model_resource_version', 'local_model_file', 'model_version_dependency', 'model_reference_identity'].includes(name)) assert.deepEqual(afterDelete.tables[name], beforeDelete.tables[name], name)
  report.deletedState = afterDelete; persist(); await unchangedDocument('Actual hard Remove')
  check('05 Explicit built UI hard Remove unlinks only unique B, hard-deletes both installed versions and preserves shared A plus all unrelated tables and immutable references', { ledger })

  await closeModels(); await openComparison()
  await expect(comparison().locator('[data-setting="model.resource"]')).toHaveAttribute('data-status', 'Missing resource')
  await expect(comparison().locator('[data-setting="model.resource"]')).toContainText(b.sha256)
  await screenshot('missing-reference', comparison(), 900, 620)
  const accepted = await api('projects', 'getRasterGenerationData', fixture.projectId, baseline.tab.documentId, fixture.ordinary.id)
  assert.equal(isRasterGenerationData(accepted), true); assert.equal(accepted.documentId, baseline.tab.documentId); assert.equal(accepted.layerId, fixture.ordinary.id)
  assert.deepEqual(accepted.generationConfiguration.model, b.portable)
  await unchangedDocument('Missing accepted/current exact reference remains copied and readable')
  check('06 Actual accepted Compare diagnoses missing exact B on unchanged accepted/current bindings; surviving shared A never substitutes and no Restore/Trash exists')

  await normalClose('first-normal'); assert.equal(report.nativeClosures[0].confirmed, true)
  assert.equal(existsSync(b.managedPath), false); assert.equal(digest(readFileSync(shared.managedPath)), shared.sha256)
  check('07 First application closes normally with confirmed physical exit; removed bytes stay absent until explicit new verified publication')

  await restoreExactFixture('Explicit fresh verified fixture installation after physical exit')
  assert.equal(report.restorations.length, 2)
  check('08 Existing repository freshly verifies/publishes original A/B bytes and reclaims only their exact previous resource/version UUIDs; backups are fixture evidence, not a product Restore')

  await launch('second'); baseline = await documentWitness(); assert.deepEqual(baseline.savedDocument, fixture.savedDocument)
  const restarted = await api('models', 'getCatalog'), repaired = restarted.find((item) => item.id === b.resourceId)
  assert.ok(repaired); assert.deepEqual(repaired.versions.map(({ id }) => id).sort(), [a.versionId, b.versionId].sort())
  assert.ok(repaired.versions.every((version) => version.fileStatus === 'ready'))
  await openComparison(); await comparison().getByRole('checkbox', { name: 'Show unchanged settings', exact: true }).check()
  await expect(comparison().locator('[data-setting="model.resource"]')).toHaveAttribute('data-status', 'Same')
  await expect(comparison().locator('[data-setting="model.resource"] [data-comparison-model-action]')).toHaveCount(0)
  await unchangedDocument('Second physical lifetime exact repaired identities')
  check('09 Second physical app lifetime reopens unchanged portable references, both exact repaired UUIDs are ready and actual Compare reports Same without a missing action; no relink/default substitution')

  await normalClose('second-normal'); await restoreExactFixture('Final no-op restoration verification')
  assert.equal(report.nativeClosures.length, 2); assert.equal(report.screenshots.length, 3)
  assert.ok(report.readbacks.every((entry) => entry.restoredExactly && entry.inFlight === 0))
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.vueWarnings, [])
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256); assert.deepEqual(hashes(bundleFiles), report.bundleSha256)
  for (const resource of fixture.resources) { assert.equal(digest(readFileSync(resource.backup)), resource.sha256); assert.equal(digest(readFileSync(resource.managedPath)), resource.sha256) }
  check('10 Both native lifetimes closed normally, captured handlers settled/restored, fixture bytes restored and all source/five built bundles unchanged')
  assert.equal(report.checks.length, 10); report.outcome = 'passed'
} catch (error) {
  process.exitCode = 1; report.outcome = 'failed'; report.failure = { message: error.message, stack: error.stack }; persist()
  if (window && !window.isClosed()) try { const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-failure.png`); if (!existsSync(file)) await window.screenshot({ path: file, animations: 'disabled', timeout: 5_000 }); report.failureScreenshot = { path: file, sha256: digest(readFileSync(file)) } } catch (captureError) { report.failureScreenshotError = String(captureError) }
} finally {
  if (application) try { await normalClose('failure-normal-cleanup') } catch (error) { process.exitCode = 1; report.outcome = 'failed'; report.normalCleanupFailure = { message: error.message, stack: error.stack } }
  if (!application && fixture) try { await restoreExactFixture('Failure/final exact fixture restoration after physical exit') } catch (error) { process.exitCode = 1; report.outcome = 'failed'; report.restorationFailure = { message: error.message, stack: error.stack } }
  report.finishedAt = new Date().toISOString(); report.physicallyClosed = !application
  report.retainedDependencies = application ? ['Live owned native actors/rollback bytes; do not clean payload'] : ['Owned prepared package/catalog/original bytes and evidence retained for Root audit/disposal']
  persist()
}
