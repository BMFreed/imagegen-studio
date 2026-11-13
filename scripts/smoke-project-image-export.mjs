/**
 * Built File-menu image export qualification. Authored harness; ROOT executes and views screenshots.
 * Run with an owned canonical TMPDIR under the artifact root and a <=2GiB/zero-swap controller:
 * pnpm exec tsx scripts/smoke-project-image-export.mjs --report-file ABSOLUTE_NEW_REPORT
 * Uses the existing explicitly opted-in CPU source adapter; no ML, model/runtime copies or SHARED.
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

import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { parseProjectDocumentV1, projectRasterAssets } from '../src/shared/projects/project-schema.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import { withSmartComparisonProject } from '../src/main/projects/test-fixtures/smart-result-comparison.ts'
import { literalSmartPatchColorPng } from '../src/main/projects/test-fixtures/smart-patch-input-material.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import { boundQualificationProcess, confirmQualificationProcessExit } from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4)
assert.equal(process.argv[2], '--report-file')
const reportFile = process.argv[3], evidenceRoot = path.dirname(reportFile)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false)
for (const directory of [evidenceRoot, os.tmpdir()]) {
  const relative = path.relative(artifactRoot, directory)
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Use owned evidence/TMPDIR within the artifact root')
  assert.equal(realpathSync(directory), directory)
  assert.ok(lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink())
}
const payload = mkdtempSync(path.join(evidenceRoot, 'native-project-export-'))
const appData = path.join(payload, 'data/imagegen-studio'), workspace = path.join(appData, 'workspaces/Uncategorized')
const destinations = path.join(payload, 'exports')
for (const directory of [workspace, destinations]) mkdirSync(directory, { recursive: true, mode: 0o700 })
const execute = promisify(execFile), digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashes = (files) => Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const sourceFiles = [
  'scripts/smoke-project-image-export.mjs', 'scripts/native-smoke-window.mjs', 'scripts/qualification-resource-limits.mjs',
  'src/main/index.ts', 'src/preload/index.ts', 'src/shared/api.ts', 'src/shared/projects/project-image-export.ts',
  'src/main/projects/project-service.ts', 'src/main/projects/project-image-export.ts',
  'src/main/projects/project-candidate-image-export.ts', 'src/main/projects/project-raster-snapshot.ts',
  'src/main/projects/project-session.ts', 'src/main/projects/project-autosave.ts',
  'src/main/projects/worker-client.ts', 'src/main/projects/development-image-worker.ts',
  'src/main/projects/project-target-inspection-owner.ts', 'src/main/projects/igs-package.ts',
  'src/main/projects/test-fixtures/smart-result-comparison.ts', 'src/main/projects/test-fixtures/smart-patch-input-material.ts',
  'src/shared/projects/project-schema.ts', 'src/shared/projects/color-profile.ts',
  'src/renderer/App.vue', 'src/renderer/components/AppChrome.vue', 'src/renderer/components/ProjectView.vue',
  'worker-python/src/imagegen_worker/__main__.py', 'worker-python/src/imagegen_worker/protocol.py',
  'worker-python/src/imagegen_worker/compositor.py', 'worker-python/src/imagegen_worker/srgb.icc',
]
const bundleFiles = ['dist/main/main.cjs', 'dist/preload/preload.cjs', 'dist/renderer/index.html', ...readdirSync('dist/renderer/assets').filter((name) => /\.(?:js|css)$/.test(name)).map((name) => `dist/renderer/assets/${name}`)]
assert.equal(bundleFiles.length, 5)
const report = {
  outcome: 'running', startedAt: new Date().toISOString(), payloads: [payload],
  sourceSha256: hashes(sourceFiles), bundleSha256: hashes(bundleFiles),
  checks: [], screenshots: [], controls: [], nativeClosures: [], resourceChecks: [], readbacks: [], witnesses: [], outputs: [], pageErrors: [], vueWarnings: [],
  sourceBasis: {
    invokeRevision: '4875d96531ca6712b288f6e660fcbb34143408c1',
    invokePaths: [
      'invokeai/frontend/webv2/src/workbench/canvas-operations/exportCanvasComposite.ts',
      'invokeai/frontend/webv2/src/workbench/canvas-operations/saveCanvasToGallery.ts',
      'invokeai/frontend/webv2/src/workbench/canvas-engine/exportRasterComposite.ts',
      'invokeai/frontend/webv2/src/workbench/canvas-engine/render/rasterComposite.ts',
    ],
    adaptation: 'Content/bbox selection and current-snapshot checks; existing Studio active-Smart projection, frozen assets, CPU sRGB compositor and create-only synced image writer. No new compositor, acceptance or storage owner.',
  },
  finiteScope: { checks: 12, normalPhysicalLifetimes: 2, screenshots: 3, fullResolutionCanvas: { x: -19, y: 0, width: 2075, height: 36 }, primaryBbox: { x: -20, y: 30, width: 64, height: 64 } },
  boundary: 'Actual built renderer/preload/Main/CPU worker/File actions and real PNG publication. Native Save dialog selection is the only export replacement and is restored exactly. Fixture preparation uses declared accepted Smart metadata and literal imported pixels, not Generate/Add evidence. Child spawn observation delegates the original unchanged to capture short-lived CPU PID/start/group/close; the real worker and export consumer are never replaced. Existing CPU close can use managed SIGTERM; signals and healthyExit are recorded separately, not called healthy code0. Explicit source-CPU development adapter, not installed release runtime, GPU/inference, overwrite, arbitrary-capacity or full MVP qualification. ROOT owns execution, actual screenshot inspection, independent audit, retention and exact cleanup.',
}
const title = 'Owned image export source', emptyTitle = 'Owned empty export source'
let application, window, fixture, emptyFixture, currentFixture, baseline, nativeChecks = [], observerInstalled = false, spawnObserverInstalled = false
const persist = () => writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
const check = (name, evidence = {}) => { report.checks.push({ name, ...evidence }); persist(); console.log(`PASS ${name}`) }
const project = (item = currentFixture) => window.getByLabel(`Project ${item.title}`, { exact: true })
persist()

async function retainPackage(filePath, name, metadata = {}) {
  const saved = await readIgsPackage(filePath), assets = []
  for (const { asset } of projectRasterAssets(saved.project)) {
    if (assets.some((item) => item.path === asset.path)) continue
    const bytes = await saved.readMember(asset.path)
    assert.equal(digest(bytes), asset.sha256)
    const retained = path.join(payload, `${name}-asset-${assets.length}.png`)
    writeFileSync(retained, bytes, { flag: 'wx', mode: 0o600 })
    assets.push({ path: asset.path, sha256: asset.sha256, retained })
  }
  return { ...metadata, title: saved.project.title, packagePath: filePath, packageSha256: digest(readFileSync(filePath)), savedDocument: saved.project, projectId: localProjectRecoveryKey(filePath), assets }
}
async function prepare() {
  let patchId, ordinaryId
  await withSmartComparisonProject('illustrious', 'txt2img', async (f) => {
    const document = structuredClone(f.owner.document)
    document.title = title
    document.primaryBbox = { x: -20, y: 30, width: 64, height: 64 }
    const patch = document.layers.find((layer) => layer.id === f.patch.id)
    patch.name = 'Export Smart owner'; patch.visible = true; patch.opacity = 1
    patch.rasterSubLayers = f.sources.map(({ variant }) => structuredClone(variant))
    patch.activeRasterSubLayerId = f.sources[1].variant.id
    const ordinary = document.layers.find((layer) => layer.id === f.ordinary.id)
    const wide = literalSmartPatchColorPng(2056, 8, Array.from({ length: 2056 * 8 }, () => [180, 30, 60, 255]).flat(), 4)
    ordinary.name = 'Wide imported Raster control'
    delete ordinary.generationProvenance
    Object.assign(ordinary.asset, { bytes: wide.length, width: 2056, height: 8, sha256: digest(wide) })
    const hidden = document.layers.find((layer) => layer.id === f.imported.id)
    hidden.name = 'Hidden far Raster control'; hidden.visible = false
    hidden.transform = { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 600, y: 600 }
    const zeroOpacity = { ...structuredClone(hidden), id: randomUUID(), name: 'Zero-opacity far Raster control', opacity: 0, visible: true, transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 900, y: 900 } }
    const emptyPatch = { ...structuredClone(patch), id: randomUUID(), name: 'Empty far Smart control', mask: { asset: null, id: randomUUID(), revision: 0 }, activeRasterSubLayerId: null, rasterSubLayers: [], boundingBox: { x: 1200, y: 1200, width: 128, height: 128 } }
    document.layers = [patch, emptyPatch, ordinary, hidden, zeroOpacity]
    await f.owner.applyDocument(parseProjectDocumentV1(document), { [ordinary.asset.path]: { bytes: wide } })
    await f.service.save(f.tabId); await f.service.clearHistory(f.tabId)
    copyFileSync(f.owner.filePath, path.join(workspace, `${title}.igs`))
    patchId = patch.id; ordinaryId = ordinary.id
    const empty = await f.service.create({ title: emptyTitle, width: 64, height: 64 })
    await f.service.save(empty.id)
    copyFileSync(f.service.getOpenDocumentForAcceptance(empty.id).filePath, path.join(workspace, `${emptyTitle}.igs`))
  })
  fixture = await retainPackage(path.join(workspace, `${title}.igs`), 'content', { patchId, ordinaryId })
  emptyFixture = await retainPackage(path.join(workspace, `${emptyTitle}.igs`), 'empty')
  assert.equal(emptyFixture.savedDocument.layers.length, 0)
  report.fixture = fixture; report.emptyFixture = emptyFixture; persist()
}
async function rawApi(method, ...args) { return await window.evaluate(({ method, args }) => window.api.projects[method](...args), { method, args }) }
async function api(method, ...args) { const result = await rawApi(method, ...args); assert.equal(result.ok, true, JSON.stringify(result)); return result.value }
async function frames() { await window.evaluate(() => document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))) }
async function bound(label) {
  const proof = await boundQualificationProcess(application.process().pid, { deadlineSeconds: 480, execute: (file, args, options) => execute(file, args.map((value) => value === 'MemoryMax=12G' ? 'MemoryMax=2G' : value), options) })
  for (const group of proof.groups) { assert.ok(BigInt(group.memoryMax) <= 2n * 1024n ** 3n); assert.equal(group.swapMax, '0') }
  nativeChecks.push(proof); report.resourceChecks.push({ label, ...proof }); persist()
}
async function launcherProof() {
  const group = readFileSync('/proc/self/cgroup', 'utf8').trim().split('\n').find((line) => line.startsWith('0::'))?.slice(3)
  assert.ok(group && group !== '/')
  const memoryMax = readFileSync(`/sys/fs/cgroup${group}/memory.max`, 'utf8').trim()
  assert.match(memoryMax, /^\d+$/); assert.ok(BigInt(memoryMax) <= 2n * 1024n ** 3n)
  assert.equal(readFileSync(`/sys/fs/cgroup${group}/memory.swap.max`, 'utf8').trim(), '0')
  const { stdout } = await execute('systemctl', ['--user', 'show', '--property=RuntimeMaxUSec,KillMode', path.basename(group)], { timeout: 10_000, maxBuffer: 16 * 1024 })
  assert.match(stdout, /KillMode=control-group/)
  assert.match(stdout, /RuntimeMaxUSec=(?:10min|[1-9]\d?s|[1-9]min)/)
  return { group, memoryMax, swapMax: '0', properties: stdout }
}
async function installSpawnObserver() {
  await application.evaluate(() => {
    const childProcess = process.getBuiltinModule('child_process'), fs = process.getBuiltinModule('fs')
    const state = { originalSpawn: childProcess.spawn, children: [], failures: [] }
    globalThis.igsImageExportCpuObserver = state
    childProcess.spawn = function (...args) {
      const child = Reflect.apply(state.originalSpawn, this, args)
      if (Array.isArray(args[1]) && args[1].includes('imagegen_worker')) {
        const record = { executable: args[0], args: [...args[1]], cuda: args[2]?.env?.CUDA_VISIBLE_DEVICES, closed: false, pid: child.pid, messages: [] }
        state.children.push(record)
        try {
          const stat = fs.readFileSync(`/proc/${child.pid}/stat`, 'utf8')
          record.start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
          record.group = fs.readFileSync(`/proc/${child.pid}/cgroup`, 'utf8').trim().split('\n').find((line) => line.startsWith('0::')).slice(3)
          record.memoryMax = fs.readFileSync(`/sys/fs/cgroup${record.group}/memory.max`, 'utf8').trim()
          record.swapMax = fs.readFileSync(`/sys/fs/cgroup${record.group}/memory.swap.max`, 'utf8').trim()
        } catch (error) { state.failures.push({ pid: child.pid, message: String(error) }) }
        let pending = ''
        child.stdout.on('data', (chunk) => {
          pending += chunk.toString('utf8')
          if (pending.length > 1024 * 1024) { state.failures.push({ pid: child.pid, message: 'CPU observation exceeded bounded protocol-line allowance' }); pending = ''; return }
          for (let newline; (newline = pending.indexOf('\n')) >= 0;) {
            const line = pending.slice(0, newline); pending = pending.slice(newline + 1)
            try {
              const value = JSON.parse(line)
              record.messages.push({ type: value.type, requestId: value.requestId ?? null, capabilities: value.capabilities ?? null, status: value.status ?? null, rect: value.rect ?? null })
            } catch (error) { state.failures.push({ pid: child.pid, message: `CPU observation could not parse a complete line: ${String(error)}` }) }
          }
        })
        child.once('close', (code, signal) => { record.closed = true; record.code = code; record.signal = signal; record.healthyExit = code === 0 && signal === null; record.managedSigterm = code === null && signal === 'SIGTERM'; record.trailingProtocolBytes = pending.length })
      }
      return child
    }
  })
  spawnObserverInstalled = true
}
async function installObserver() {
  await application.evaluate(({ ipcMain, dialog }) => {
    const state = { originals: new Map(ipcMain._invokeHandlers), originalSaveDialog: dialog.showSaveDialog, calls: [], dialogs: [], inFlight: 0, choice: null }
    globalThis.igsImageExportObserver = state
    for (const [channel, original] of state.originals) ipcMain._invokeHandlers.set(channel, async (event, ...args) => {
      const call = { channel, args: structuredClone(args), finished: false }; state.calls.push(call); ++state.inFlight
      try { const response = await original(event, ...args); call.response = structuredClone(response); return response }
      finally { call.finished = true; --state.inFlight }
    })
    dialog.showSaveDialog = async (...args) => {
      state.dialogAttempts = (state.dialogAttempts ?? 0) + 1
      try {
      const options = args.at(-1)
      if (!state.choice) throw new Error('Unprepared native Save dialog in bounded export harness')
      const choice = state.choice; state.choice = null
      state.dialogs.push({ options: structuredClone(options), choice: structuredClone(choice) })
      return structuredClone(choice)
      } catch (error) { state.dialogError = { message: error.message, stack: error.stack }; throw error }
    }
  })
  observerInstalled = true
}
async function restoreObservers() {
  if (observerInstalled) {
    await expect.poll(() => application.evaluate(() => globalThis.igsImageExportObserver.inFlight)).toBe(0)
    const proof = await application.evaluate(({ ipcMain, dialog }) => {
      const state = globalThis.igsImageExportObserver
      for (const [channel, original] of state.originals) ipcMain._invokeHandlers.set(channel, original)
      dialog.showSaveDialog = state.originalSaveDialog
      return { restoredExactly: [...state.originals].every(([channel, original]) => ipcMain._invokeHandlers.get(channel) === original) && dialog.showSaveDialog === state.originalSaveDialog, inFlight: state.inFlight, calls: structuredClone(state.calls), dialogs: structuredClone(state.dialogs), dialogAttempts: state.dialogAttempts ?? 0, dialogError: state.dialogError ?? null }
    })
    assert.equal(proof.restoredExactly, true); report.readbacks.push(proof); observerInstalled = false; persist()
  }
  if (spawnObserverInstalled) {
    await expect.poll(() => application.evaluate(() => globalThis.igsImageExportCpuObserver.children.every((child) => child.closed))).toBe(true)
    const proof = await application.evaluate(() => {
      const childProcess = process.getBuiltinModule('child_process'), state = globalThis.igsImageExportCpuObserver
      childProcess.spawn = state.originalSpawn
      return { restoredExactly: childProcess.spawn === state.originalSpawn, children: structuredClone(state.children), failures: structuredClone(state.failures) }
    })
    assert.equal(proof.restoredExactly, true); assert.deepEqual(proof.failures, [])
    // An early failed Home prerequisite may have no CPU child. Successful qualification below
    // independently requires observed export responses and nonempty worker readbacks.
    for (const child of proof.children) {
      assert.ok(Number.isSafeInteger(child.pid) && /^\d+$/.test(child.start))
      assert.equal(child.cuda, ''); assert.equal(child.closed, true); assert.ok(child.healthyExit || child.managedSigterm, 'Only observed normal EOF or the existing owner SIGTERM close is allowed; no SIGKILL or harness termination'); assert.equal(child.trailingProtocolBytes, 0)
      assert.ok(/^\d+$/.test(child.memoryMax) && BigInt(child.memoryMax) <= 2n * 1024n ** 3n); assert.equal(child.swapMax, '0')
      nativeChecks.push({ processIdentities: [{ pid: child.pid, start: child.start }], groups: [] })
    }
    report.cpuReadbacks ??= []; report.cpuReadbacks.push(proof); spawnObserverInstalled = false; persist()
  }
}
async function launch(label) {
  const env = { ...process.env, NODE_ENV: 'test', IMAGEGEN_TEST_IMAGE_WORKER: '1', CUDA_VISIBLE_DEVICES: '', XDG_CONFIG_HOME: path.join(payload, 'config'), XDG_DATA_HOME: path.join(payload, 'data') }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'IMAGEGEN_DEV_SERVER_URL']) delete env[key]
  nativeChecks = []; application = await electron.launch({ args: ['--ozone-platform=x11', '.'], cwd: process.cwd(), env, timeout: 30_000 })
  await bound(`${label}-launch`); await installSpawnObserver()
  window = await isolateNativeSmokeWindow(application); window.setDefaultTimeout(15_000)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  window.on('console', (message) => { if (message.text().includes('[Vue warn]')) report.vueWarnings.push(message.text()) })
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await window.waitForFunction(() => typeof window.api?.projects?.exportImage === 'function')
  await installObserver()
}
async function openProject(item) {
  currentFixture = item
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${item.title}`, exact: true }).click()
  await expect(project()).toBeVisible()
  await expect(project().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  const opened = await api('open', item.projectId); assert.equal(opened.kind, 'opened')
  return opened.tab
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
async function documentWitness(item = currentFixture) {
  const opened = await api('open', item.projectId); assert.equal(opened.kind, 'opened')
  const saved = await readIgsPackage(item.packagePath)
  assert.equal(digest(readFileSync(item.packagePath)), item.packageSha256)
  assert.deepEqual(saved.project, item.savedDocument)
  for (const asset of item.assets) { assert.equal(digest(await saved.readMember(asset.path)), asset.sha256); assert.equal(digest(readFileSync(asset.retained)), asset.sha256) }
  return { tab: opened.tab, packageSha256: item.packageSha256, savedDocument: saved.project, database: databaseState() }
}
async function unchanged(label) { const value = await documentWitness(); assert.deepEqual(value, baseline); report.witnesses.push({ label, value }); persist() }
const fileAction = (label) => window.locator('.n-dropdown-option-body').filter({ has: window.getByText(label, { exact: true }) })
async function menu() { await window.getByRole('button', { name: 'File menu', exact: true }).click(); await expect(fileAction('Export As…')).toBeVisible() }
async function performExport(region, choice) {
  const before = await application.evaluate(() => globalThis.igsImageExportObserver.calls.length)
  await application.evaluate((_, selection) => { globalThis.igsImageExportObserver.choice = selection }, choice)
  await menu(); await fileAction(region === 'canvas' ? 'Export As…' : 'Export Generation BBox…').click()
  await expect.poll(() => application.evaluate((_, index) => globalThis.igsImageExportObserver.calls.slice(index).filter((call) => call.channel === 'projects:export-image' && call.finished).length, before)).toBe(1)
  const call = await application.evaluate((_, index) => structuredClone(globalThis.igsImageExportObserver.calls.slice(index).find((entry) => entry.channel === 'projects:export-image')), before)
  assert.equal(call.finished, true); assert.deepEqual(call.args, [currentFixture.projectId, region])
  await frames(); await bound(`export-${region}`)
  report.controls.push({ label: 'Actual File action with controlled native destination selection', declared: true, region, choice, call }); persist()
  return call.response
}
async function verifyPng(filePath, region) {
  const python = path.resolve('worker-python/.venv/bin/python')
  const oracle = String.raw`
import hashlib,json,sys
from PIL import Image
image=Image.open(sys.argv[1]); image.load()
assert image.mode == 'RGBA'
assert hashlib.sha256(image.info.get('icc_profile',b'')).hexdigest() == sys.argv[3]
patch=Image.new('RGBA',(7,5));patch.putdata([(25,47,91,[0,64,128,255][i%4]) for i in range(35)])
# Existing CPU rasterization includes Pillow premultiplied-alpha identity rounding.
# Independently pin the public identity primitive; do not import the production compositor.
patch=patch.transform(patch.size,Image.Transform.AFFINE,(1,0,0,0,1,0),resample=Image.Resampling.BICUBIC)
if sys.argv[2] == 'canvas':
 expected=Image.new('RGBA',(2075,36));expected.alpha_composite(Image.new('RGBA',(2056,8),(180,30,60,255)),(19,0));expected.alpha_composite(patch,(0,31))
else:
 expected=Image.new('RGBA',(64,64));expected.alpha_composite(patch,(1,1))
assert image.size == expected.size, (image.size,expected.size)
assert image.tobytes() == expected.tobytes(), 'Exact visible-world RGBA differs from literal nonoverlapping Raster/active-Smart oracle'
print(json.dumps({'width':image.width,'height':image.height,'rgbaSha256':hashlib.sha256(image.tobytes()).hexdigest(),'iccSha256':sys.argv[3],'oracle':'Literal independent nonoverlapping source rectangles and authored active Smart pixels; no production compositor import'}))
`
  const { stdout } = await execute(python, ['-I', '-c', oracle, filePath, region, IGS_SRGB_ICC_SHA256], { timeout: 20_000, maxBuffer: 64 * 1024 })
  const decoded = JSON.parse(stdout)
  const output = { path: filePath, sha256: digest(readFileSync(filePath)), ...decoded, region }
  report.outputs.push(output); persist(); return output
}
async function screenshot(label, width, height) {
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width, height })
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]); await frames()
  const geometry = await window.locator('.app-shell').evaluate((node) => {
    const r = node.getBoundingClientRect(), content = node.querySelector('main')?.getBoundingClientRect()
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, scrollWidth: node.scrollWidth, width: node.clientWidth, content: content ? { top: content.top, bottom: content.bottom, height: content.height } : null }
  })
  assert.ok(geometry.x >= -1 && geometry.y >= -1 && geometry.right <= width + 1 && geometry.bottom <= height + 1 && geometry.scrollWidth <= geometry.width)
  assert.ok(geometry.content && geometry.content.height > 200 && geometry.content.bottom <= height + 1, 'Success/error feedback must leave the real Project content area visible inside the application grid')
  const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-${label}-${width}x${height}.png`)
  assert.equal(existsSync(file), false); await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push({ label, path: file, sha256: digest(readFileSync(file)), geometry }); await bound(label); persist()
}
async function closeCurrentProject() {
  const before = await application.evaluate(() => globalThis.igsImageExportObserver.calls.length)
  const tab = window.getByRole('tab', { name: currentFixture.title, exact: true })
  if (await tab.count()) { await tab.getByRole('button', { name: `Close ${currentFixture.title}`, exact: true }).click(); await expect(tab).toHaveCount(0) }
  // Close clears its Renderer action only after the actual Home catalog refresh settles.
  await expect.poll(() => application.evaluate((_, index) => {
    const state = globalThis.igsImageExportObserver, calls = state.calls.slice(index)
    return calls.some((call) => call.channel === 'projects:list' && call.finished) && state.inFlight === 0
  }, before)).toBe(true)
  await frames()
  await window.locator('.app-chrome').getByRole('button', { name: 'Open Home', exact: true }).click()
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toHaveAttribute('aria-selected', 'true')
}
async function normalClose(label) {
  if (!application) return
  await restoreObservers()
  if (window && !window.isClosed()) {
    await window.keyboard.press('Escape')
    for (const item of [fixture, emptyFixture].filter(Boolean)) {
      const tab = window.getByRole('tab', { name: item.title, exact: true })
      if (await tab.count()) {
        await tab.getByRole('button', { name: `Close ${item.title}`, exact: true }).click()
        const guard = window.getByRole('dialog', { name: 'Close project?', exact: true })
        await expect.poll(async () => !(await tab.count()) ? 'closed' : await guard.isVisible() ? 'guard' : 'pending').not.toBe('pending')
        if (await guard.isVisible()) await guard.getByRole('button', { name: 'Discard Changes', exact: true }).click()
        await expect(tab).toHaveCount(0)
      }
    }
  }
  await bound(`${label}-before-close`); await application.close()
  report.nativeClosures.push({ label, normal: true, ...(await confirmQualificationProcessExit(nativeChecks)) }); application = null; window = null; persist()
}

try {
  report.launcher = await launcherProof(); persist(); await prepare(); await launch('first')
  await menu()
  await expect(fileAction('Export As…')).toHaveClass(/n-dropdown-option-body--disabled/)
  await expect(fileAction('Export Generation BBox…')).toHaveClass(/n-dropdown-option-body--disabled/)
  await window.keyboard.press('Escape')
  check('01 Both actual File export actions are disabled on Home without a Project')

  await openProject(fixture)
  await project().getByRole('button', { name: 'Select Export Smart owner', exact: true }).click()
  await expect(project().getByRole('button', { name: 'Select Export Smart owner', exact: true })).toHaveAttribute('aria-pressed', 'true')
  baseline = await documentWitness()
  assert.equal(baseline.tab.dirty, false); assert.deepEqual(baseline.tab.primaryBbox, report.finiteScope.primaryBbox)
  assert.equal(baseline.database.tables.generation_queue_item.length, 0)
  await menu(); await screenshot('file-menu', 1440, 900); await window.keyboard.press('Escape')
  check('02 Real saved wide Raster and active Smart contribution open; the selected Smart authoring bbox differs from primary export bbox', { activeVariant: fixture.savedDocument.layers[0].activeRasterSubLayerId, primaryBbox: baseline.tab.primaryBbox, smartAuthoringBbox: fixture.savedDocument.layers[0].boundingBox })

  const canceledPath = path.join(destinations, 'cancel-must-not-exist.png')
  const canceled = await performExport('canvas', { canceled: true, filePath: canceledPath })
  assert.deepEqual(canceled, { ok: true, value: { kind: 'canceled' } }); assert.equal(existsSync(canceledPath), false)
  assert.deepEqual(readdirSync(destinations), []); await unchanged('Native Save Cancel')
  check('03 Actual File Export As Cancel writes no destination or temp and preserves Project/package/assets/history/queue')

  const canvasPath = path.join(destinations, 'canvas.png')
  const canvas = await performExport('canvas', { canceled: false, filePath: canvasPath })
  assert.deepEqual(canvas, { ok: true, value: { kind: 'exported', fileName: 'canvas.png', rect: report.finiteScope.fullResolutionCanvas } })
  const canvasOutput = await verifyPng(canvasPath, 'canvas')
  await expect(window.getByText('Exported canvas.png (2075 × 36).', { exact: true })).toBeVisible()
  await unchanged('Full-resolution visible-content export')
  check('04 Actual Export As publishes exact2075×36 sRGB RGBA above preview/generation side limits; only active Smart and visible Raster contribute', { output: canvasOutput })

  const bboxPath = path.join(destinations, 'primary-bbox.png')
  const bbox = await performExport('bbox', { canceled: false, filePath: bboxPath })
  assert.deepEqual(bbox, { ok: true, value: { kind: 'exported', fileName: 'primary-bbox.png', rect: report.finiteScope.primaryBbox } })
  const bboxOutput = await verifyPng(bboxPath, 'bbox')
  await expect(window.getByText('Exported primary-bbox.png (64 × 64).', { exact: true })).toBeVisible()
  await screenshot('primary-bbox-export', 900, 620); await unchanged('Primary bbox export while Smart selected')
  check('05 Actual Export Generation BBox preserves the primary64×64 rectangle while Smart is selected; exact active contribution and transparent margins survive', { output: bboxOutput })

  const beforeExisting = digest(readFileSync(canvasPath))
  const existing = await performExport('canvas', { canceled: false, filePath: canvasPath })
  assert.equal(existing.ok, false); assert.equal(existing.error.code, 'CANDIDATE_EXPORT_EXISTS')
  await expect(window.getByText('A file with that name already exists. Choose a different filename.', { exact: true })).toBeVisible()
  assert.equal(digest(readFileSync(canvasPath)), beforeExisting)
  assert.deepEqual(readdirSync(destinations).sort(), ['canvas.png', 'primary-bbox.png']); await unchanged('Existing destination refusal')
  check('06 Existing destination is refused through real Main/create-only publication with exact bytes and no leftover temporary file')

  const invalid = await rawApi('exportImage', fixture.projectId, 'selected-smart')
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error.code, 'PROJECT_INVALID_INPUT')
  assert.deepEqual(readdirSync(destinations).sort(), ['canvas.png', 'primary-bbox.png']); await unchanged('Unsupported region rejection')
  check('07 Typed preload rejects unsupported export regions without silently substituting selected Smart or canvas')

  await closeCurrentProject(); await openProject(emptyFixture); baseline = await documentWitness()
  const beforeEmptyDialogs = await application.evaluate(() => globalThis.igsImageExportObserver.dialogs.length)
  const empty = await performExport('canvas', { canceled: false, filePath: path.join(destinations, 'empty-must-not-exist.png') })
  assert.equal(empty.ok, false); assert.equal(empty.error.code, 'PROJECT_IMAGE_EXPORT_EMPTY')
  assert.equal(await application.evaluate(() => globalThis.igsImageExportObserver.dialogs.length), beforeEmptyDialogs)
  await expect(window.getByText('There is no visible raster content to export. You can still save the Project.', { exact: true })).toBeVisible()
  assert.equal(existsSync(path.join(destinations, 'empty-must-not-exist.png')), false)
  await screenshot('empty-export-refusal', 900, 620); await unchanged('Empty Project export refusal')
  check('08 Empty Project export gives a visible explanation before destination selection and preserves its independently valid saved .igs')

  await closeCurrentProject(); await menu()
  await expect(fileAction('Export As…')).toHaveClass(/n-dropdown-option-body--disabled/)
  await window.keyboard.press('Escape')
  check('09 Closing the last Project restores disabled File actions; both exported files remain user-owned and unchanged')

  await normalClose('first-normal')
  assert.equal(report.nativeClosures.length, 1)
  check('10 First native lifetime closes normally after exact handler/dialog/spawn restoration; observed CPU PID/start identities physically exit')

  await launch('second'); await openProject(fixture); baseline = await documentWitness()
  const restartedPath = path.join(destinations, 'reopened-canvas.png')
  const reopened = await performExport('canvas', { canceled: false, filePath: restartedPath })
  assert.equal(reopened.ok, true); assert.equal(reopened.value.kind, 'exported')
  const restartedOutput = await verifyPng(restartedPath, 'canvas')
  assert.equal(restartedOutput.sha256, canvasOutput.sha256)
  await unchanged('Restarted independent image export')
  check('11 A new physical lifetime reopens unchanged Project/accepted assets and exports the exact same whole PNG without relinking, Add or Save', { output: restartedOutput })

  await normalClose('second-normal')
  assert.equal(report.nativeClosures.length, 2); assert.equal(report.screenshots.length, 3)
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256); assert.deepEqual(hashes(bundleFiles), report.bundleSha256)
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.vueWarnings, [])
  assert.ok(report.cpuReadbacks.every((item) => item.restoredExactly && item.children.length > 0 && item.children.every((child) => child.closed)))
  assert.ok(report.cpuReadbacks.flatMap((item) => item.children).flatMap((child) => child.messages).filter((message) => message.type === 'export-done').length >= 5, 'Observe actual CPU export responses for Cancel, canvas, bbox, existing-file refusal and restarted export')
  assert.equal(digest(readFileSync(fixture.packagePath)), fixture.packageSha256)
  assert.equal(digest(readFileSync(emptyFixture.packagePath)), emptyFixture.packageSha256)
  check('12 Both normal physical lifetimes preserve source/five bundles and all original handlers; actual observed CPU workers physically exit through existing managed close without harness kills or SIGKILL')
  report.outcome = 'passed'
} catch (error) {
  process.exitCode = 1; report.outcome = 'failed'; report.failure = { message: error.message, stack: error.stack }
  if (window && !window.isClosed()) try {
    const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-failure.png`)
    if (!existsSync(file)) await window.screenshot({ path: file, animations: 'disabled', timeout: 5_000 })
    report.failureScreenshot = { path: file, sha256: digest(readFileSync(file)) }
  } catch (captureError) { report.failureScreenshotError = String(captureError) }
} finally {
  if (application) try { await normalClose('failure-normal-cleanup') } catch (error) { process.exitCode = 1; report.outcome = 'failed'; report.normalCleanupFailure = { message: error.message, stack: error.stack } }
  report.physicallyClosed = !application && report.nativeClosures.every((proof) => proof.confirmed)
  report.finishedAt = new Date().toISOString(); persist()
}
