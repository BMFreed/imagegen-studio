/**
 * Bounded built-Electron freshness regression; run only after a fresh app:build.
 *
 * NODE_ENV=test + IMAGEGEN_TEST_IMAGE_WORKER=1 explicitly enables the current source-checkout CPU
 * worker. Composition is real; installed runtime readiness, model inference, generation and public
 * acceptance are NOT qualified here. The stored accepted variant is an explicit writer-prepared
 * precondition.
 *
 * Root supplies a finite launcher service (2 GiB, zero swap, RuntimeMaxSec <= 600, TimeoutStopSec
 * <= 90, KillMode=control-group), then runs: pnpm exec tsx scripts/smoke-smart-patch-freshness.mjs
 * --report-file ABS_NEW Root owns final disposal of report.payloads after confirmed physical exit.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
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

import { openAppDatabase } from '../src/main/db/database.ts'
import { developmentImageWorkerLocation } from '../src/main/projects/development-image-worker.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { withFrozenSmartPatchGenerationInput } from '../src/main/projects/project-smart-patch-generation-input.ts'
import { literalSmartPatchColorPng } from '../src/main/projects/test-fixtures/smart-patch-input-material.ts'
import { smartPatchVariantMetadataFixture } from '../src/main/projects/test-fixtures/smart-patch-variant.ts'
import { ProjectWorkerClient } from '../src/main/projects/worker-client.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4, 'Use --report-file ABSOLUTE_NEW_OWNED_REPORT')
assert.equal(process.argv[2], '--report-file')
const reportFile = process.argv[3]
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Do not overwrite earlier evidence')
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const evidenceParent = path.dirname(reportFile)
const relative = path.relative(artifactRoot, evidenceParent)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
assert.equal(realpathSync(evidenceParent), evidenceParent)
assert.ok(lstatSync(evidenceParent).isDirectory() && !lstatSync(evidenceParent).isSymbolicLink())
const evidenceRoot = path.join(evidenceParent, `${path.basename(reportFile)}.artifacts`)
assert.equal(existsSync(evidenceRoot), false)
mkdirSync(evidenceRoot, { mode: 0o700 })
const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'freshness-payload-'))
const lifecycleFile = path.join(evidenceRoot, 'artifact-lifecycle.json')
const root = process.cwd()
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashes = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const title = 'Stored Patch freshness'
const patchName = 'Stored Smart Patch'
const lowerName = 'Lower source Raster'
const upperName = 'Upper display Raster'
const bbox = { height: 128, width: 128, x: 160, y: 120 }
const color = [40, 180, 90, 255]
const patchId = randomUUID()
const sourceFiles = [
  'scripts/smoke-smart-patch-freshness.mjs',
  'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs',
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/shared/api.ts',
  'src/shared/projects/project-schema.ts',
  'src/shared/projects/project-layer-views.ts',
  'src/shared/projects/smart-patch-variants.ts',
  'src/main/projects/development-image-worker.ts',
  'src/main/projects/project-target-inspection-owner.ts',
  'src/main/projects/project-smart-patch-generation-input.ts',
  'src/main/projects/project-smart-patch-variant-inspection.ts',
  'src/main/projects/project-smart-patch-variant-state.ts',
  'src/main/projects/project-raster-snapshot.ts',
  'src/main/projects/project-generation-target.ts',
  'src/main/projects/project-service.ts',
  'src/main/projects/project-session.ts',
  'src/main/projects/project-autosave.ts',
  'src/main/projects/project-shadow.ts',
  'src/main/projects/project-layer-resource.ts',
  'src/main/projects/igs-package.ts',
  'src/main/projects/worker-client.ts',
  'src/main/projects/test-fixtures/smart-patch-input-material.ts',
  'src/main/projects/test-fixtures/smart-patch-variant.ts',
  'src/renderer/App.vue',
  'src/renderer/components/ProjectView.vue',
  'src/renderer/components/ProjectLayerStack.vue',
  'src/renderer/components/ProjectSortableLayerRow.vue',
  'src/renderer/components/ProjectSmartPatchLayerRow.vue',
  'src/renderer/components/SmartPatchVariantsBrowser.vue',
  'src/renderer/components/ProjectCanvas.vue',
  // Include the selected-read owner without depending on its eventual filename.
  ...readdirSync('src/renderer/components')
    .filter((name) => /smart-patch.*freshness.*\.(?:ts|vue)$/.test(name))
    .map((name) => `src/renderer/components/${name}`),
  ...readdirSync('worker-python/src/imagegen_worker')
    .filter((name) => /\.(?:py|icc)$/.test(name))
    .map((name) => `worker-python/src/imagegen_worker/${name}`),
]
const bundleFiles = [
  'dist/main/main.cjs',
  'dist/preload/preload.cjs',
  'dist/renderer/index.html',
  ...readdirSync('dist/renderer/assets')
    .filter((name) => /\.(?:js|css)$/.test(name))
    .map((name) => `dist/renderer/assets/${name}`),
]
const report = {
  schemaVersion: 1,
  outcome: 'running',
  startedAt: new Date().toISOString(),
  fixtureRoot,
  payloads: [fixtureRoot],
  sourceSha256: hashes(sourceFiles),
  bundleSha256: hashes(bundleFiles),
  checks: [],
  screenshots: [],
  inspections: [],
  unchangedStates: [],
  canvasPixels: [],
  geometry: [],
  pageErrors: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  pythonProcesses: [],
  nativeLogs: [],
  boundary: {
    actual:
      'Built Electron UI -> real Main IPC -> current source-checkout CPU composition; actual .igs writer/loader, SQLite index, selected row, shared browser diagnostics, lower/upper layer UI visibility, Undo, Save/close/reopen, signed image bytes and live Canvas.',
    fixture:
      'One small portable stored accepted variant is writer-prepared. Its sourceTarget is copied from actual Main capture/CPU composition before adoption, never from an assumed PNG encoding. Frozen output/configuration/prepared-input metadata are declared fixture data, not proof of generation or acceptance.',
    worker:
      'Available launch uses NODE_ENV=test IMAGEGEN_TEST_IMAGE_WORKER=1. Real CPU composition is qualified, not installed runtime, model inference or Generate readiness. Production control uses a separate empty XDG tree with no installed runtime/models and no test opt-in.',
    invariants:
      'Inspection must preserve document revision/content, dirty/Undo/Redo, package hash, frozen provenance and exact asset bytes. Missing model diagnostics cannot turn matching inputs into outdated/unverified.',
    limits:
      'Verified launcher service <=2 GiB, RuntimeMaxSec<=600 plus TimeoutStopSec<=90; native groups <=2 GiB each, aggregate unique groups <=4 GiB, zero swap. Moved KDE scopes have an independent 240 s timer; actors staying in the launcher have its verified outer deadline. Launches are sequential; no ML downloads/provisioning.',
    excluded:
      'ML inference, installed worker qualification, generation, public Add, crash recovery, Compare/Preset, full resource matrix, quality and release readiness.',
    cleanup:
      'Only fixtureRoot is disposable payload. Root handles final cleanup after physical exits; compact reports/screenshots stay outside it. User data, package caches and the existing source venv remain untouched.',
  },
}
const lifecycle = {
  schemaVersion: 1,
  owner: { repository: root, task: 'selected-smart-patch-freshness', run: reportFile },
  state: 'running',
  lastUsedAt: report.startedAt,
  evidence: [reportFile, evidenceRoot],
  payloads: [fixtureRoot],
  dependsOn: [
    path.resolve('worker-python/.venv'),
    path.resolve('worker-python/src/imagegen_worker'),
  ],
  usedBy: [],
  pins: [
    {
      path: fixtureRoot,
      reason: 'Root may dispose after all recorded native/Python physical exits.',
    },
  ],
}
let application, window, database, context, writerWorker
let nativeChecks = []
let sampler,
  sampling = Promise.resolve()
const observed = new Map()
let originalVariant, variantBytes, lower, upper, originalDocument

function checkpoint() {
  lifecycle.lastUsedAt = new Date().toISOString()
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  writeFileSync(lifecycleFile, JSON.stringify(lifecycle, null, 2) + '\n', { mode: 0o600 })
}
function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence })
  checkpoint()
  console.log(`PASS ${name}`)
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
function physicallyExited(value) {
  return identity(value.pid)?.start !== value.start
}
async function confirmPythonExit(value) {
  await expect.poll(() => physicallyExited(value), { timeout: 10_000 }).toBe(true)
  value.physicalExit = true
  value.confirmedAt = new Date().toISOString()
  checkpoint()
}
function descendants(parent) {
  const parents = new Map()
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    try {
      const status = readFileSync(`/proc/${entry}/status`, 'utf8')
      parents.set(Number(entry), Number(status.match(/^PPid:\s+(\d+)$/m)?.[1]))
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
    }
  }
  const ids = new Set([parent])
  for (let changed = true; changed;) {
    changed = false
    for (const [child, owner] of parents) {
      if (ids.has(owner) && !ids.has(child)) {
        ids.add(child)
        changed = true
      }
    }
  }
  return [...ids].flatMap((pid) => {
    const value = identity(pid)
    return value ? [value] : []
  })
}
function launcherBound() {
  const group = readFileSync('/proc/self/cgroup', 'utf8')
    .trim()
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3)
  assert.ok(group?.startsWith('/') && group !== '/')
  const directory = `/sys/fs/cgroup${group}`
  const memoryMax = readFileSync(path.join(directory, 'memory.max'), 'utf8').trim()
  assert.match(memoryMax, /^\d+$/)
  assert.ok(BigInt(memoryMax) <= 2n * 1024n ** 3n)
  assert.equal(readFileSync(path.join(directory, 'memory.swap.max'), 'utf8').trim(), '0')
  return { group, memoryMax, swapMax: '0' }
}
function durationSeconds(value) {
  const text = value.replace(/\s+/g, '')
  if (text === '0') return 0
  const token = /(\d+(?:\.\d+)?)(us|ms|min|s|h|d)/g
  assert.equal(text.replace(token, ''), '', `Unrecognized systemd duration: ${value}`)
  const scale = { us: 0.000001, ms: 0.001, s: 1, min: 60, h: 3600, d: 86400 }
  const seconds = [...text.matchAll(token)].reduce(
    (sum, match) => sum + Number(match[1]) * scale[match[2]],
    0,
  )
  assert.ok(Number.isFinite(seconds))
  return seconds
}
async function verifyLauncherDeadline() {
  const launcher = launcherBound()
  const unit = path.basename(launcher.group)
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
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
  assert.equal(properties.ControlGroup, launcher.group)
  assert.equal(properties.KillMode, 'control-group')
  const runtimeSeconds = durationSeconds(properties.RuntimeMaxUSec)
  const stopSeconds = durationSeconds(properties.TimeoutStopUSec)
  assert.ok(runtimeSeconds > 0 && runtimeSeconds <= 600)
  assert.ok(stopSeconds >= 0 && stopSeconds <= 90)
  return {
    ...launcher,
    unit,
    properties,
    runtimeSeconds,
    stopSeconds,
    outerTerminationCeilingSeconds: runtimeSeconds + stopSeconds,
  }
}
async function bounds(label) {
  const value = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds: 240,
    execute: (file, args, options) =>
      nativeExec(
        file,
        args.map((item) => (item === 'MemoryMax=12G' ? 'MemoryMax=2G' : item)),
        options,
      ),
  })
  const launcher = launcherBound()
  assert.equal(launcher.group, report.launcher.group)
  const groups = new Map(value.groups.map((group) => [group.group, BigInt(group.memoryMax)]))
  groups.set(launcher.group, BigInt(launcher.memoryMax))
  assert.ok(value.groups.every((group) => BigInt(group.memoryMax) <= 2n * 1024n ** 3n))
  const uniqueTotalMax = [...groups.values()].reduce((sum, size) => sum + size, 0n)
  assert.ok(uniqueTotalMax <= 4n * 1024n ** 3n)
  for (const group of value.groups) {
    assert.ok(
      (group.ownedScope && group.deadlineTimer) || group.group === launcher.group,
      'Every native actor needs either the verified launcher deadline or its owned KDE timer',
    )
  }
  nativeChecks.push(value)
  report.resourceLimitChecks.push({
    label,
    phase: context.phase,
    ...value,
    launcher,
    uniqueTotalMax: String(uniqueTotalMax),
    effectiveDeadlines: value.groups.map((group) => ({
      group: group.group,
      seconds: group.deadlineTimer ? 240 : report.launcher.outerTerminationCeilingSeconds,
      boundary: group.deadlineTimer
        ? 'owned KDE scope timer'
        : 'verified launcher service including stop allowance',
    })),
  })
  checkpoint()
}
function literal(colorValue) {
  return literalSmartPatchColorPng(
    bbox.width,
    bbox.height,
    Array.from({ length: bbox.width * bbox.height }, () => colorValue).flat(),
    4,
  )
}
function raster(bytes, name) {
  const id = randomUUID()
  return {
    asset: {
      bytes: bytes.length,
      height: bbox.height,
      path: `assets/layers/${id}.png`,
      sha256: digest(bytes),
      width: bbox.width,
    },
    blendMode: 'normal',
    id,
    kind: 'raster',
    locked: false,
    name,
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: bbox.x, y: bbox.y },
    visible: true,
  }
}
function makeContext(phase) {
  const directory = path.join(fixtureRoot, phase)
  const appData = path.join(directory, 'data/imagegen-studio')
  const workspace = path.join(appData, 'workspaces/Uncategorized')
  mkdirSync(workspace, { recursive: true, mode: 0o700 })
  return {
    phase,
    directory,
    appData,
    packagePath: path.join(workspace, `${title}.igs`),
    projectId: null,
  }
}
async function pythonPreflight(python) {
  // Hold stdin until PID/start is recorded; this probe performs no image composition or inference.
  const program = String.raw`
import json, os, sys
from pathlib import Path
sys.stdin.read()
import PIL
from imagegen_worker import compositor, protocol
print(json.dumps({'pid':os.getpid(),'pythonVersion':sys.version.split()[0],
  'pillowVersion':PIL.__version__,
  'modulePaths':{module.__name__:str(Path(module.__file__).resolve()) for module in [compositor,protocol]},
  'mlModules':[name for name in ['torch','diffusers','transformers','compel'] if name in sys.modules]}))
`
  const execution = nativeExec(python, ['-I', '-B', '-c', program], {
    cwd: root,
    timeout: 15_000,
    killSignal: 'SIGKILL',
    maxBuffer: 64 * 1024,
    env: { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', CUDA_VISIBLE_DEVICES: '' },
  })
  const record = {
    ...identity(execution.child.pid),
    phase: 'python-preflight',
    physicalExit: false,
  }
  assert.ok(record.start)
  report.pythonProcesses.push(record)
  execution.child.stdin.end('inspect source-checkout dependencies')
  let stdout
  try {
    ;({ stdout } = await execution)
  } finally {
    await confirmPythonExit(record)
  }
  const value = JSON.parse(stdout)
  assert.equal(value.pid, record.pid)
  assert.match(value.pythonVersion, /^3\.12\./)
  assert.equal(value.pillowVersion, '12.2.0')
  assert.deepEqual(value.mlModules, [])
  const sourceRoot = realpathSync('worker-python/src/imagegen_worker') + path.sep
  for (const modulePath of Object.values(value.modulePaths))
    assert.ok(modulePath.startsWith(sourceRoot))
  report.pythonPreflight = value
  checkpoint()
}
async function prepare() {
  context = makeContext('cpu-available')
  const roots = {
    placeholdersDir: path.resolve('dist/main/placeholders'),
    scratchDir: path.join(fixtureRoot, 'writer-scratch'),
  }
  mkdirSync(roots.scratchDir, { recursive: true, mode: 0o700 })
  const session = await ProjectSession.create(context.packagePath, title, roots, { ...bbox })
  context.projectId = session.localRecoveryKey
  const metadata = smartPatchVariantMetadataFixture('illustrious')
  variantBytes = literal(color)
  const lowerBytes = literal([32, 64, 96, 255])
  const upperBytes = literal([200, 40, 50, 255])
  lower = raster(lowerBytes, lowerName)
  upper = raster(upperBytes, upperName)
  // Upper covers only the right half; the left center remains a live variant pixel oracle.
  upper.transform.x += bbox.width / 2
  const authored = {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { ...bbox },
    coherenceSettings: { edgeSize: 16, minimumDenoise: 0, mode: 'Gaussian Blur' },
    generationDraft: structuredClone(
      metadata.generationProvenance.layerSourceContext.generationDraft,
    ),
    id: patchId,
    internalResolution: { height: 64, width: 64 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    maskSettings: { blur: 16, padding: 8 },
    name: patchName,
    opacity: 1,
    rasterSubLayers: [],
    visible: true,
  }
  session.applyDocument({ ...session.document, layers: [upper, authored, lower] })
  const assets = {
    [lower.asset.path]: { bytes: lowerBytes },
    [upper.asset.path]: { bytes: upperBytes },
  }
  const location = developmentImageWorkerLocation({
    isPackaged: false,
    mainDirectory: path.resolve('dist/main'),
    nodeEnv: 'test',
    smokeOptIn: '1',
    scratchDirectory: roots.scratchDir,
  })
  assert.ok(
    location,
    'Existing source-checkout Python worker is required; do not provision it here',
  )
  report.workerLocation = location
  await pythonPreflight(location.pythonExecutable)
  writerWorker = await ProjectWorkerClient.start(location, {
    environment: { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', CUDA_VISIBLE_DEVICES: '' },
    requestTimeoutMs: 30_000,
  })
  const children = descendants(process.pid)
    .filter(({ pid }) => pid !== process.pid)
    .filter(({ pid }) => {
      try {
        return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').includes('imagegen_worker')
      } catch (error) {
        if (['ENOENT', 'ESRCH'].includes(error.code)) return false
        throw error
      }
    })
  assert.equal(children.length, 1, 'Record the exact fixture compositor process before capture')
  const workerIdentity = { ...children[0], phase: 'fixture-capture', physicalExit: false }
  report.pythonProcesses.push(workerIdentity)
  report.cpuWorkerReady = structuredClone(writerWorker.ready)
  const frozen = await withFrozenSmartPatchGenerationInput(
    {
      document: session.document,
      layerId: patchId,
      maskSource: null,
      packagePath: session.filePath,
      pendingSource: (asset) => assets[asset.path] ?? null,
      projectKey: session.localRecoveryKey,
      scratchBasePath: roots.scratchDir,
    },
    (capture) => capture.composeSource(writerWorker),
  )
  await writerWorker.close()
  writerWorker = null
  await confirmPythonExit(workerIdentity)
  assert.equal(frozen.sourceAlpha, 'opaque')
  assert.equal(digest(frozen.source.bytes), frozen.source.sha256)
  assert.equal(frozen.source.bytes.length, frozen.source.byteSize)
  assert.deepEqual(frozen.context.sourceLayerIds, [lower.id])
  // Retain the actual CPU PNG as compact evidence; it is the hash oracle, not an alternate encoder.
  const capturedSource = path.join(evidenceRoot, 'captured-main-cpu-source.png')
  writeFileSync(capturedSource, frozen.source.bytes, { flag: 'wx', mode: 0o600 })
  Object.assign(metadata, { name: 'Writer-prepared stored variant', bbox: { ...bbox } })
  Object.assign(metadata.asset, {
    bytes: variantBytes.length,
    height: bbox.height,
    sha256: digest(variantBytes),
    width: bbox.width,
  })
  const source = metadata.generationProvenance.layerSourceContext
  const frozenContext = frozen.context
  Object.assign(source, {
    bbox: { ...frozenContext.bbox },
    coherenceSettings: structuredClone(frozenContext.coherenceSettings),
    generationDraft: structuredClone(frozenContext.generationDraft),
    internalResolution: { ...frozenContext.internalResolution },
    layerId: frozenContext.layerId,
    mask: structuredClone(frozenContext.mask),
    maskBlur: frozenContext.maskSettings.blur,
    sourceDocumentId: frozenContext.documentId,
    sourceDocumentRevision: frozenContext.documentRevision,
    sourceLayerIds: [...frozenContext.sourceLayerIds],
    sourceTarget: {
      byteSize: frozen.source.byteSize,
      height: frozen.source.height,
      sha256: frozen.source.sha256,
      width: frozen.source.width,
    },
  })
  Object.assign(source.preparedInputs.finalContributionMask, {
    height: bbox.height,
    width: bbox.width,
  })
  metadata.generationProvenance.generationConfiguration.mode = 'img2img'
  Object.assign(metadata.generationProvenance.executionResultContext.output, {
    byteSize: variantBytes.length,
    height: bbox.height,
    sha256: digest(variantBytes),
    width: bbox.width,
    contributionAlpha8: {
      byteSize: bbox.width * bbox.height,
      height: bbox.height,
      sha256: digest(Buffer.alloc(bbox.width * bbox.height, 255)),
      width: bbox.width,
    },
  })
  const document = session.document
  const target = document.layers.find(({ id }) => id === patchId)
  target.rasterSubLayers = [metadata]
  target.activeRasterSubLayerId = metadata.id
  session.applyDocument(document)
  await session.save({ assets: { ...assets, [metadata.asset.path]: { bytes: variantBytes } } })
  originalVariant = structuredClone(metadata)
  originalDocument = session.document
  report.fixture = {
    ...context,
    documentId: originalDocument.documentId,
    patchId,
    lowerId: lower.id,
    upperId: upper.id,
    sourceTarget: source.sourceTarget,
    capturedSource,
    originalPackageSha256: digest(readFileSync(context.packagePath)),
    variant: metadata,
    precondition: 'Writer-prepared existing accepted variant; no generation/acceptance claim.',
  }
  check('Writer adopts matching frozen authoring and exact Main/CPU-composed source identity')
}
async function api(method, ...args) {
  const result = await window.evaluate(({ method, args }) => window.api.projects[method](...args), {
    method,
    args,
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function current() {
  const value = await api('open', context.projectId)
  assert.equal(value.kind, 'opened')
  return value.tab
}
function patch(tab) {
  const value = tab.layers.find(({ id }) => id === patchId)
  assert.equal(value?.kind, 'smart-patch')
  return value
}
function patchAuthoring(tab) {
  const value = structuredClone(patch(tab))
  // Signed display capabilities correctly follow the document revision, including a source edit.
  if (value.activeRaster) delete value.activeRaster.imageUrl
  delete value.maskImageUrl
  delete value.status
  return value
}
const card = (id = patchId) => window.locator(`[data-layer-id="${id}"]`)
const canvas = () => window.getByRole('region', { name: 'Project Canvas', exact: true })
const browser = () => window.getByRole('dialog', { name: 'Smart Patch variants', exact: true })
const variantRow = () => browser().locator(`[data-smart-patch-variant-id="${originalVariant.id}"]`)
const selectButton = () => card().getByRole('button', { name: `Select ${patchName}`, exact: true })
async function selected() {
  // Open may publish the tab before its guarded action finishes. An enabled control is the busy fence.
  await expect(selectButton()).toBeEnabled()
  await selectButton().click()
  await expect(selectButton()).toHaveAttribute('aria-pressed', 'true')
  await expect(selectButton()).toBeEnabled()
}
async function rowStatus(label) {
  // The browser temporarily hides the mounted layer stack. Inspect its summary directly;
  // outside the browser also require the actual row to be visible to the user.
  const summary = card().locator('.entity-info > span')
  await expect(summary).toHaveText(
    `1 variant · ${label === 'Matches current inputs' ? 'Inputs match' : label}`,
  )
  if (!(await browser().isVisible())) await expect(summary).toBeVisible()
}
async function storedExact() {
  const saved = await readIgsPackage(context.packagePath)
  const target = saved.project.layers.find(({ id }) => id === patchId)
  assert.deepEqual(
    target.rasterSubLayers,
    [originalVariant],
    'Inspection preserves frozen provenance and stored metadata',
  )
  assert.equal((await saved.readMember(originalVariant.asset.path)).equals(variantBytes), true)
  return saved
}
async function snapshot() {
  return { tab: await current(), packageSha256: digest(readFileSync(context.packagePath)) }
}
async function unchanged(before, label) {
  const after = await snapshot()
  assert.deepEqual(
    after,
    before,
    `${label}: inspection changed document/dirty/Undo/Redo or package bytes`,
  )
  await storedExact()
  report.unchangedStates.push({
    label,
    phase: context.phase,
    documentRevision: after.tab.documentRevision,
    dirty: after.tab.dirty,
    canUndo: after.tab.canUndo,
    canRedo: after.tab.canRedo,
    packageSha256: after.packageSha256,
    provenanceSha256: digest(JSON.stringify(originalVariant.generationProvenance)),
    assetSha256: digest(variantBytes),
  })
  checkpoint()
}
async function inspect() {
  const tab = await current()
  const value = await api(
    'getSmartPatchVariants',
    tab.id,
    patchId,
    tab.documentId,
    tab.documentRevision,
  )
  assert.equal(value.documentId, tab.documentId)
  assert.equal(value.documentRevision, tab.documentRevision)
  assert.equal(value.layerId, patchId)
  assert.equal(value.variants.length, 1)
  assert.equal(value.variants[0].id, originalVariant.id)
  report.inspections.push({ phase: context.phase, ...value })
  checkpoint()
  return value
}
async function openBrowser() {
  const trigger = card().getByRole('button', {
    name: `Browse variants for ${patchName}`,
    exact: true,
  })
  await expect(trigger).toBeEnabled()
  await trigger.click()
  await expect(browser()).toBeVisible()
}
async function hideBrowser() {
  await window.keyboard.press('Escape')
  await expect(browser()).toBeHidden()
}
async function refreshBrowser() {
  const button = browser().getByRole('button', { name: 'Refresh variant diagnostics', exact: true })
  await expect(button).toBeEnabled()
  await button.evaluate((node) => {
    const state = { started: false, completed: false, disabledTransitions: [] }
    const observer = new MutationObserver(() => {
      state.disabledTransitions.push(node.disabled)
      if (node.disabled) state.started = true
      if (state.started && !node.disabled) {
        state.completed = true
        observer.disconnect()
      }
    })
    observer.observe(node, { attributes: true, attributeFilter: ['disabled'] })
    window.__freshnessRefreshObservation = { state, observer }
  })
  try {
    await button.click()
    await expect
      .poll(() => window.evaluate(() => window.__freshnessRefreshObservation.state.completed), {
        timeout: 20_000,
      })
      .toBe(true)
    report.rendererRefresh = await window.evaluate(() => window.__freshnessRefreshObservation.state)
    assert.equal(report.rendererRefresh.started, true)
    await expect(variantRow().getByText('Matches current inputs', { exact: true })).toBeVisible()
    await expect(button).toBeFocused()
  } finally {
    await window.evaluate(() => {
      window.__freshnessRefreshObservation?.observer.disconnect()
      delete window.__freshnessRefreshObservation
    })
  }
}
async function screenshot(name) {
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const file = path.join(evidenceRoot, `${name}.png`)
  await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push(file)
  checkpoint()
}
async function size(width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) => {
      const native = BrowserWindow.getAllWindows()[0]
      native.setContentSize(size.width, size.height)
      native.focus()
    },
    { width, height },
  )
  await expect
    .poll(() => window.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    .toEqual({ width, height })
}
async function geometry(label) {
  const value = await browser().evaluate((dialog) => {
    const rect = dialog.getBoundingClientRect()
    return {
      viewport: { width: innerWidth, height: innerHeight },
      dialog: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
      overflow: [
        dialog,
        ...dialog.querySelectorAll(
          '.variants-content, .variants-scroll, .variants-list, .variant-row',
        ),
      ].map((node) => ({
        className: node.className,
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
      })),
    }
  })
  assert.ok(value.dialog.x >= 0 && value.dialog.y >= 0)
  assert.ok(
    value.dialog.right <= value.viewport.width + 1 &&
      value.dialog.bottom <= value.viewport.height + 1,
  )
  assert.ok(value.overflow.every(({ clientWidth, scrollWidth }) => scrollWidth <= clientWidth + 1))
  report.geometry.push({ label, ...value })
}
async function usableVariant(label) {
  const layer = patch(await current())
  assert.equal(layer.activeRasterSubLayerId, originalVariant.id)
  const resource = await application.evaluate(async ({ net }, url) => {
    const response = await net.fetch(url)
    return { status: response.status, bytes: [...new Uint8Array(await response.arrayBuffer())] }
  }, layer.activeRaster.imageUrl)
  assert.equal(resource.status, 200)
  assert.equal(Buffer.from(resource.bytes).equals(variantBytes), true)
  const image = card().getByRole('img', {
    name: `Active variant: ${originalVariant.name}`,
    exact: true,
  })
  await expect
    .poll(() =>
      image.evaluate(
        (node) => node.complete && node.naturalWidth === 128 && node.naturalHeight === 128,
      ),
    )
    .toBe(true)
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  const pixel = () =>
    canvas()
      .locator('.canvas-area')
      .evaluate(
        (host, point) => {
          const bitmap = host.querySelector('.konvajs-content canvas')
          if (!(bitmap instanceof HTMLCanvasElement)) throw new Error('Live Canvas is absent')
          const rect = bitmap.getBoundingClientRect()
          const x =
            ((Number(host.dataset.cameraX) + point.x * Number(host.dataset.cameraScale)) *
              bitmap.width) /
            rect.width
          const y =
            ((Number(host.dataset.cameraY) + point.y * Number(host.dataset.cameraScale)) *
              bitmap.height) /
            rect.height
          if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height)
            throw new Error('Frozen variant pixel is outside Canvas')
          return [...bitmap.getContext('2d').getImageData(Math.floor(x), Math.floor(y), 1, 1).data]
        },
        { x: bbox.x + 24, y: bbox.y + 64 },
      )
  await expect.poll(pixel).toEqual(color)
  report.canvasPixels.push({
    label,
    phase: context.phase,
    rgba: await pixel(),
    assetSha256: digest(variantBytes),
  })
  checkpoint()
}
async function launch() {
  const environment = {
    ...process.env,
    NODE_ENV: context.phase === 'cpu-available' ? 'test' : 'production',
    CUDA_VISIBLE_DEVICES: '',
    XDG_CONFIG_HOME: path.join(context.directory, 'config'),
    XDG_DATA_HOME: path.join(context.directory, 'data'),
    XDG_CACHE_HOME: path.join(context.directory, 'cache'),
  }
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'IMAGEGEN_TEST_IMAGE_WORKER',
    'IMAGEGEN_DEV_SERVER_URL',
    'PYTHONPATH',
    'PYTHONHOME',
  ])
    delete environment[key]
  if (context.phase === 'cpu-available') environment.IMAGEGEN_TEST_IMAGE_WORKER = '1'
  try {
    application = await electron.launch({
      args: ['--ozone-platform=x11', '.'],
      cwd: root,
      env: environment,
      timeout: 30_000,
    })
  } catch (error) {
    // A lost launch response supplies no independent process-exit evidence.
    report.nativeLaunchError = String(error)
    throw error
  }
  const process_ = application.process()
  const launched = identity(process_.pid)
  assert.ok(launched)
  // Keep an exit witness even if the first cgroup guard rejects the launch.
  nativeChecks = [{ processIdentities: [launched], groups: [] }]
  observed.clear()
  await bounds('launch')
  const sample = () => {
    for (const value of descendants(process_.pid))
      observed.set(`${value.pid}:${value.start}`, value)
  }
  sample()
  sampler = setInterval(() => {
    sampling = sampling.then(sample).catch((error) => {
      report.samplerError = String(error)
    })
  }, 50)
  const log = { phase: context.phase, pid: process_.pid, text: '' }
  report.nativeLogs.push(log)
  for (const stream of [process_.stdout, process_.stderr])
    stream?.on('data', (bytes) => {
      if (log.text.length < 96 * 1024)
        log.text += String(bytes).slice(0, 96 * 1024 - log.text.length)
    })
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(20_000)
  window.on('pageerror', (error) =>
    report.pageErrors.push({ phase: context.phase, error: String(error) }),
  )
  await size(1440, 900)
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await expect
    .poll(async () => (await api('list')).some(({ id }) => id === context.projectId))
    .toBe(true)
  database = openAppDatabase(context.appData, path.resolve('src/main/db/migrations'))
  const record = await database.db
    .selectFrom('project_index')
    .selectAll()
    .where('local_project_key', '=', context.projectId)
    .executeTakeFirstOrThrow()
  assert.equal(record.file_health, 'ready')
  const runtime = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(runtime.ok, true)
  assert.equal(runtime.value.kind, 'not-installed')
  const catalog = await window.evaluate(() => window.api.models.getCatalog())
  assert.deepEqual(catalog, { ok: true, value: [] })
  report.launches ??= []
  report.launches.push({
    ...context,
    nodeEnv: environment.NODE_ENV,
    smokeOptIn: environment.IMAGEGEN_TEST_IMAGE_WORKER ?? null,
    runtime: runtime.value,
    catalog: catalog.value,
  })
  checkpoint()
}
async function openProject() {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
  await selected()
}
async function closeProject(discard = false) {
  await window.keyboard.press('Escape')
  const tab = window.getByRole('tab', { name: title, exact: true })
  await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
  const dialog = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect
    .poll(async () =>
      (await tab.count()) === 0 ? 'closed' : (await dialog.isVisible()) ? 'decision' : 'waiting',
    )
    .not.toBe('waiting')
  if (await tab.count()) {
    assert.equal(discard, true, 'An inspection unexpectedly dirtied the Project')
    await dialog.getByRole('button', { name: 'Discard Changes', exact: true }).click()
  }
  await expect(tab).toHaveCount(0)
}
async function closeNative(label) {
  if (!application) return
  let boundFailure
  try {
    await bounds(`${label}-before-close`)
  } catch (error) {
    boundFailure = error
    report.closeBoundError = String(error)
  } finally {
    clearInterval(sampler)
    sampler = null
    await sampling
  }
  for (const value of observed.values()) {
    // Supplement the bounded cgroup evidence with short-lived workers observed between actions.
    nativeChecks.push({ processIdentities: [value], groups: [] })
  }
  if (database) {
    await database.close()
    database = null
  }
  const native = application
  const nativeProcess = native.process()
  const closed = new Promise((resolve) =>
    nativeProcess.once('exit', (code, signal) => resolve({ code, signal })),
  )
  try {
    await native.close()
  } catch (error) {
    report.closeUiError = String(error)
    const latest = nativeChecks.findLast((value) => value.nativeIdentity)
    const owned = latest?.groups.find(
      ({ ownedScope, pids }) => ownedScope && pids.includes(nativeProcess.pid),
    )
    if (owned)
      report.ownedSignal = await stopExpiredQualificationProcess({
        ...latest.nativeIdentity,
        group: owned.group,
      })
    else throw error
  }
  const exit = await confirmQualificationProcessExit(nativeChecks)
  assert.equal(exit.confirmed, true)
  const actualExit =
    nativeProcess.exitCode !== null || nativeProcess.signalCode !== null
      ? { code: nativeProcess.exitCode, signal: nativeProcess.signalCode }
      : await closed
  report.nativeClosures.push({ label, phase: context.phase, ...exit, ...actualExit })
  application = null
  window = null
  checkpoint()
  assert.equal(
    actualExit.code,
    0,
    'Native Electron must exit normally; forced exit is a failed qualification',
  )
  assert.equal(actualExit.signal, null)
  if (boundFailure) throw boundFailure
}
async function noGeneration() {
  for (const table of ['generation_queue_item', 'generation_candidate_receipt']) {
    assert.deepEqual(
      await database.db.selectFrom(table).selectAll().execute(),
      [],
      'Freshness must not enqueue or accept generation',
    )
  }
}

checkpoint()
try {
  report.launcher = await verifyLauncherDeadline()
  const inventory = await Promise.all([
    nativeExec('du', ['-sh', artifactRoot], { timeout: 20_000, maxBuffer: 64 * 1024 }),
    nativeExec('du', ['-h', '--max-depth=1', artifactRoot], {
      timeout: 20_000,
      maxBuffer: 64 * 1024,
    }),
    nativeExec('df', ['-h', artifactRoot], { timeout: 10_000, maxBuffer: 16 * 1024 }),
    nativeExec('git', ['rev-parse', 'HEAD'], { timeout: 10_000 }),
    nativeExec('git', ['status', '--short'], { timeout: 10_000 }),
  ])
  report.inventory = inventory.slice(0, 3).map(({ stdout }) => stdout)
  report.revision = {
    base: '10115df581d9e07049478dee3866a280886794fd',
    head: inventory[3].stdout.trim(),
    status: inventory[4].stdout,
  }
  await prepare()
  await launch()
  await openProject()
  const initial = await snapshot()
  assert.equal(initial.tab.dirty, false)
  assert.equal(initial.tab.canUndo, false)
  assert.equal(initial.tab.canRedo, false)
  await expect(browser()).toHaveCount(0)
  await rowStatus('Matches current inputs')
  await usableVariant('initial-selected')
  await unchanged(initial, 'automatic selected-row read before browser')
  await screenshot('01-selected-matches-1440x900')
  check(
    'Selected stored Patch automatically matches without opening its browser or mutating Project',
  )

  await openBrowser()
  await expect(variantRow().getByText('Matches current inputs', { exact: true })).toBeVisible()
  const matching = await inspect()
  assert.deepEqual(matching.variants[0], {
    id: originalVariant.id,
    changedInputs: [],
    sourceVerified: true,
    status: 'ready',
  })
  assert.equal(matching.sourceUnavailableReason, null)
  assert.equal(matching.resourcesChecked, true)
  assert.ok(matching.resourceDiagnostics.some(({ code }) => code === 'RESOURCE_MISSING'))
  const missingModel = matching.resourceDiagnostics.find(({ code }) => code === 'RESOURCE_MISSING')
  await expect(
    browser().getByRole('region', { name: 'Current generation resources', exact: true }),
  ).toContainText(missingModel.message)
  await rowStatus('Matches current inputs')
  await geometry('wide-matching-browser')
  await screenshot('02-browser-matches-missing-model-1440x900')
  await unchanged(initial, 'browser plus genuine IPC source read with absent model')
  await hideBrowser()
  check('Browser and selected row match while missing-model diagnostics remain independent')

  const hideLower = card(lower.id).getByRole('button', { name: `Hide ${lowerName}`, exact: true })
  await expect(hideLower).toBeEnabled()
  await hideLower.click()
  await expect
    .poll(async () => (await current()).layers.find(({ id }) => id === lower.id).visible)
    .toBe(false)
  await rowStatus('Outdated')
  const changed = await snapshot()
  assert.equal(changed.tab.dirty, true)
  assert.equal(changed.tab.canUndo, true)
  assert.deepEqual(
    patchAuthoring(changed.tab),
    patchAuthoring(initial.tab),
    'Changing lower source must preserve Patch authoring',
  )
  const outdated = await inspect()
  assert.deepEqual(outdated.variants[0], {
    id: originalVariant.id,
    changedInputs: ['source-composite'],
    sourceVerified: true,
    status: 'outdated',
  })
  await unchanged(changed, 'outdated source inspection')
  await screenshot('03-lower-source-outdated-1440x900')
  const undo = canvas().getByRole('button', { name: 'Undo', exact: true })
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect
    .poll(async () => (await current()).layers.find(({ id }) => id === lower.id).visible)
    .toBe(true)
  await rowStatus('Matches current inputs')
  const restored = await snapshot()
  assert.equal(restored.tab.documentRevision, initial.tab.documentRevision)
  assert.equal(restored.tab.dirty, false)
  await unchanged(restored, 'automatic revalidation after lower source Undo')
  check('Actual lower-layer visibility changes source to Outdated; one Undo restores Matches')

  const hideUpper = card(upper.id).getByRole('button', { name: `Hide ${upperName}`, exact: true })
  await expect(hideUpper).toBeEnabled()
  await hideUpper.click()
  await expect
    .poll(async () => (await current()).layers.find(({ id }) => id === upper.id).visible)
    .toBe(false)
  await rowStatus('Matches current inputs')
  const upperChanged = await snapshot()
  assert.equal(upperChanged.tab.dirty, true)
  assert.notEqual(upperChanged.tab.documentRevision, initial.tab.documentRevision)
  assert.deepEqual(patchAuthoring(upperChanged.tab), patchAuthoring(initial.tab))
  await openBrowser()
  await expect(variantRow().getByText('Matches current inputs', { exact: true })).toBeVisible()
  await refreshBrowser()
  const upperInspection = await inspect()
  assert.deepEqual(upperInspection.variants, matching.variants)
  await unchanged(upperChanged, 'upper display edit and explicit browser refresh')
  await hideBrowser()
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect
    .poll(async () => (await current()).layers.find(({ id }) => id === upper.id).visible)
    .toBe(true)
  await rowStatus('Matches current inputs')
  check(
    'Upper display change and its different document revision preserve Matches; refresh preserves history',
  )

  const beforeSave = await current()
  const packageBeforeSave = digest(readFileSync(context.packagePath))
  const save = window.getByRole('button', { name: 'Save Project', exact: true })
  await expect(save).toBeEnabled()
  await save.click()
  // The writer fixture has placeholder previews. Real CPU Save must replace those derivatives,
  // giving this otherwise-clean Save an independent completion observation.
  await expect
    .poll(() => digest(readFileSync(context.packagePath)), { timeout: 30_000 })
    .not.toBe(packageBeforeSave)
  // Wait through the real guarded Save, even when the Project was already clean.
  await expect(selectButton()).toBeEnabled()
  await expect(window.locator('.document-state')).toHaveText('Saved')
  await expect.poll(async () => (await current()).dirty).toBe(false)
  const saved = await storedExact()
  assert.equal(saved.manifest.preview.status, 'rendered')
  assert.deepEqual(
    saved.project,
    originalDocument,
    'Save preserves all portable authoring and frozen provenance',
  )
  assert.equal((await current()).documentRevision, beforeSave.documentRevision)
  await closeProject()
  await openProject()
  await expect(browser()).toHaveCount(0)
  const reopened = await snapshot()
  await rowStatus('Matches current inputs')
  assert.equal(reopened.tab.dirty, false)
  assert.equal(reopened.tab.canUndo, false)
  assert.equal(reopened.tab.canRedo, false)
  await unchanged(reopened, 'automatic selected-row read after Save/close/reopen')
  await screenshot('04-reopened-matches-1440x900')
  check(
    'Save/close/reopen automatically returns Matches with unchanged stored image and provenance',
  )

  await size(1000, 640)
  await rowStatus('Matches current inputs')
  const summaryGeometry = await card()
    .locator('.entity-info > span')
    .evaluate((node) => ({
      text: node.textContent,
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
    }))
  assert.ok(
    summaryGeometry.scrollWidth <= summaryGeometry.clientWidth + 1,
    JSON.stringify(summaryGeometry),
  )
  report.selectedSummaryGeometry = summaryGeometry
  await screenshot('05-selected-matches-1000x640')
  await openBrowser()
  await expect(variantRow().getByText('Matches current inputs', { exact: true })).toBeVisible()
  await geometry('narrow-matching-browser')
  await screenshot('06-browser-matches-1000x640')
  await unchanged(reopened, 'narrow browser viewing')
  await hideBrowser()
  await noGeneration()
  await closeProject()
  const portable = context.packagePath
  await closeNative('cpu-available-complete')
  check('Wide and narrow screenshots/layout checks complete; CPU launch physically exits normally')

  context = makeContext('production-unavailable')
  writeFileSync(context.packagePath, readFileSync(portable), { flag: 'wx', mode: 0o600 })
  const copied = await ProjectSession.open(context.packagePath, {
    placeholdersDir: path.resolve('dist/main/placeholders'),
    scratchDir: path.join(fixtureRoot, 'unused-production-writer'),
  })
  context.projectId = copied.localRecoveryKey
  assert.deepEqual(copied.document, originalDocument)
  assert.equal(digest(readFileSync(context.packagePath)), digest(readFileSync(portable)))
  await launch()
  await openProject()
  const unavailableBefore = await snapshot()
  await rowStatus('Unverified')
  await expect(browser()).toHaveCount(0)
  await usableVariant('production-worker-unavailable')
  await unchanged(unavailableBefore, 'unavailable automatic selected-row read')
  await screenshot('07-production-unverified-1440x900')
  await openBrowser()
  await expect(variantRow().getByText('Unverified', { exact: true })).toBeVisible()
  await expect(
    variantRow().getByText('Source composite could not be verified.', { exact: true }),
  ).toBeVisible()
  const unavailable = await inspect()
  assert.deepEqual(unavailable.variants[0], {
    id: originalVariant.id,
    changedInputs: [],
    sourceVerified: false,
    status: 'unverified',
  })
  assert.ok(unavailable.sourceUnavailableReason)
  await expect(
    browser().getByRole('region', { name: 'Current generation resources', exact: true }),
  ).toContainText(unavailable.sourceUnavailableReason)
  assert.ok(unavailable.resourceDiagnostics.some(({ code }) => code === 'RESOURCE_MISSING'))
  await unchanged(unavailableBefore, 'production unavailable browser and IPC inspection')
  check(
    'Independent production/no-runtime launch reports Unverified and explicit source diagnostic while variant stays usable',
  )

  await size(1000, 640)
  await geometry('narrow-unavailable-browser')
  await screenshot('08-production-unverified-browser-1000x640')
  await hideBrowser()
  await rowStatus('Unverified')
  await noGeneration()
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.samplerError, undefined)
  await closeProject()
  await closeNative('production-unavailable-complete')
  report.finalSourceSha256 = hashes(sourceFiles)
  report.finalBundleSha256 = hashes(bundleFiles)
  assert.deepEqual(report.finalSourceSha256, report.sourceSha256)
  assert.deepEqual(report.finalBundleSha256, report.bundleSha256)
  assert.ok(report.pythonProcesses.every(({ physicalExit }) => physicalExit))
  assert.equal(report.nativeClosures.length, 2)
  check(
    'All inspections preserve document/history/package/provenance; no generation; all observed processes physically exited',
  )
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'
  report.error = { name: error.name, message: error.message, stack: error.stack }
  if (window && !window.isClosed()) {
    try {
      report.failureDiagnostics = {
        inspection: await inspect(),
        rowSummary: await card().locator('.entity-info > span').textContent(),
      }
    } catch (diagnosticError) {
      report.failureDiagnosticsError = String(diagnosticError)
    }
  }
  if (window && !window.isClosed())
    await screenshot('failure-before-cleanup').catch(() => undefined)
  process.exitCode = 1
} finally {
  if (writerWorker) {
    try {
      await writerWorker.close()
      for (const value of report.pythonProcesses)
        if (!value.physicalExit) await confirmPythonExit(value)
    } catch (error) {
      report.workerCleanupError = String(error)
      report.outcome = 'failed'
      process.exitCode = 1
    }
  }
  if (application) {
    try {
      if (
        window &&
        !window.isClosed() &&
        (await window.getByRole('tab', { name: title, exact: true }).count())
      )
        await closeProject(true)
    } catch (error) {
      report.uiCleanupError = String(error)
    }
    try {
      await closeNative('failure-cleanup')
    } catch (error) {
      report.cleanupError = String(error)
      report.outcome = 'failed'
      process.exitCode = 1
    }
  }
  clearInterval(sampler)
  if (database) await database.close()
  if (ProjectWorkerClient.hasUnconfirmedExit()) {
    report.workerCleanupError = 'ProjectWorkerClient retains an unconfirmed child exit.'
    report.outcome = 'failed'
    process.exitCode = 1
  }
  report.completedAt = new Date().toISOString()
  report.cleanup = {
    owner: 'root',
    payloads: [fixtureRoot],
    removedByRunner: [],
    physicalExitConfirmed:
      !report.nativeLaunchError &&
      !report.cleanupError &&
      !report.workerCleanupError &&
      !application &&
      report.pythonProcesses.every(({ physicalExit }) => physicalExit),
  }
  lifecycle.state = 'retained'
  lifecycle.pins.push({
    path: evidenceRoot,
    reason:
      'Compact evidence retained. Root handles final disposal of fixtureRoot only after physical-exit proof.',
  })
  checkpoint()
}
