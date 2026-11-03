/**
 * Opt-in installed Regional Guidance qualification; run with tsx after the production build. Does
 * not provision, repair, copy weights, inject a runtime, or clean up retained evidence. InvokeAI
 * source: a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd, canvas graph regional conditioning,
 * session_queue_default.py, session_processor_default.py, and staging-area acceptance callers.
 * Resource/physical-exit and UI patterns adapt qualify-installed-smart-patch.mjs.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { deflateSync, inflateSync } from 'node:zlib'

import { _electron as electron, expect } from '@playwright/test'
import yauzl from 'yauzl'

import { openAppDatabase } from '../src/main/db/database.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { qualifySdxlCheckpoint } from '../src/main/models/sdxl-checkpoint-qualification.ts'
import { encodeProjectMaskPng } from '../src/main/projects/project-mask.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { isQualifiedInferenceWorkerReady } from '../src/shared/projects/inference-worker-capabilities.ts'
import { generationTargetSignature } from '../src/shared/projects/project-generation-target-state.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  signalQualificationMain,
  stopExpiredQualificationProcess,
  stopOwnedQualificationScope,
} from './qualification-resource-limits.mjs'
import {
  assertRuntimeIdle,
  assertUpgradeBounds,
  treeManifest,
} from './upgrade-qualification-worker.mjs'

assert.deepEqual(process.argv.slice(2, 3), ['--fixture'])
assert.equal(process.argv.length, 4)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const canonical = (value) =>
  assert.ok(typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value)
const within = (root, value) => {
  const relative = path.relative(root, value)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}
async function regular(file) {
  canonical(file)
  const stat = await lstat(file)
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), `Expected a regular file: ${file}`)
  assert.equal(await realpath(file), file)
  return stat
}
async function directory(file) {
  canonical(file)
  const stat = await lstat(file)
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink())
  assert.equal(await realpath(file), file)
}
async function jsonFile(file, maximum = 32 * 1024 ** 2) {
  assert.ok((await regular(file)).size <= maximum)
  return JSON.parse(await readFile(file, 'utf8'))
}
async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}
const fixturePath = process.argv[3]
const fixture = await jsonFile(fixturePath, 64 * 1024)
assert.deepEqual(Object.keys(fixture).sort(), [
  'appData',
  'artifacts',
  'checkpoint',
  'deadlineSeconds',
  'profile',
  'provisionReport',
  'schemaVersion',
])
assert.equal(fixture.schemaVersion, 1)
assert.ok(
  [
    'installed-regional-invoke-v1',
    'installed-regional-invoke-recovery-v1',
    'installed-regional-invoke-main-death-v1',
  ].includes(fixture.profile),
)
const mainDeathProfile = fixture.profile === 'installed-regional-invoke-main-death-v1'
const recoveryProfile =
  mainDeathProfile || fixture.profile === 'installed-regional-invoke-recovery-v1'
assert.ok(
  Number.isSafeInteger(fixture.deadlineSeconds) &&
    fixture.deadlineSeconds > 0 &&
    fixture.deadlineSeconds <= 1800,
)
const appDataRoot = fixture.appData
const evidenceRoot = fixture.artifacts
for (const value of [
  fixturePath,
  appDataRoot,
  evidenceRoot,
  fixture.provisionReport.path,
  fixture.checkpoint.path,
]) {
  canonical(value)
  assert.ok(within(artifactRoot, value))
}
assert.match(fixture.provisionReport.sha256, /^[a-f0-9]{64}$/)
assert.match(fixture.checkpoint.sha256, /^[a-f0-9]{64}$/)
assert.equal(
  fixture.checkpoint.sha256,
  '3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9',
)
assert.equal(fixture.checkpoint.byteSize, 6938040760)
assert.deepEqual(
  [
    fixture.checkpoint.civitaiModelId,
    fixture.checkpoint.civitaiVersionId,
    fixture.checkpoint.civitaiFileId,
  ],
  [795765, 889818, 798303],
)
for (const key of ['modelName', 'versionName'])
  assert.ok(typeof fixture.checkpoint[key] === 'string' && fixture.checkpoint[key].length > 0)
await directory(appDataRoot)
assert.equal(path.basename(appDataRoot), 'imagegen-studio')
assert.equal(path.basename(path.dirname(appDataRoot)), 'data')
const fixtureRoot = path.dirname(path.dirname(appDataRoot))
assert.ok(!within(fixtureRoot, evidenceRoot) && !within(evidenceRoot, fixtureRoot))
assert.ok(!within(evidenceRoot, fixture.checkpoint.path))
await directory(path.dirname(evidenceRoot))
assert.equal(
  existsSync(evidenceRoot),
  false,
  'Use a new evidence directory; this runner never resets a prior run',
)
await mkdir(evidenceRoot, { mode: 0o700 })
const reportFile = path.join(evidenceRoot, 'report.json')
const exec = promisify(execFile)
const started = Date.now()
const endAt = started + fixture.deadlineSeconds * 1000
const timeout = (maximum = 30_000) => {
  const left = endAt - Date.now()
  assert.ok(left > 0, 'Overall qualification deadline exceeded')
  return Math.min(maximum, left)
}
const bbox = { height: 1024, width: 1024, x: -13, y: 5 }
const globalPrompt =
  'a still life of a red apple and a blue ceramic mug on a plain table, two separate objects, soft studio lighting'
const localPrompts = ['a single red apple', 'a single blue ceramic mug']
const policy = {
  schemaVersion: 1,
  baseSchedule: 'sdxl-scaled-linear-v1',
  rescaleBetasZeroSnr: false,
  timestepSpacing: 'leading',
}
const report = {
  schemaVersion: 1,
  profile: fixture.profile,
  outcome: 'running',
  startedAt: new Date(started).toISOString(),
  fixturePath,
  fixtureSha256: await hashFile(fixturePath),
  appDataRoot,
  evidenceRoot,
  checks: [],
  screenshots: [],
  pageErrors: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  memoryObservations: {},
  boundary: {
    actual:
      'Built renderer UI -> original IPC/Main -> default installed RuntimeManager -> public regional SQL/frozen request -> Python -> staging/signed Results -> Raster Add/Undo/Redo -> explicit Save and reopen.',
    preconditions:
      'Original pinned official epsilon checkpoint is adopted by real ModelRepository after full SHA and bounded SDXL header verification. CivitAI IDs/family are declared fixture identity, not a download or lineage qualification. Three real portable ProjectSession documents, masks and two source Raster assets are setup; no caller-supplied worker recipe.',
    calls:
      'One UI Generate canceled after a witnessed original regional JSONL request; one Queue Retry of original frozen 30-step seed123 recipe after current authoring changes. Exactly two regional wires and one completion receipt are required; physical exits are verified separately.',
    progress:
      'Running/busy/Cancel are checked. Regional numerical denoising step telemetry is unqualified and is not required by this runner.',
    exclusions:
      'No visual quality PASS, full Invoke parity, generic SDXL, Anima, LoRA, regional reference/TI, installer/Repair or CivitAI delivery claim. Negative historical visual conclusions remain unchanged.',
    retention:
      'No cleanup. Original weights, installed runtime and failed payloads are retained; ROOT owns disposal after physical exit proof.',
  },
}
let application,
  window,
  database,
  provision,
  marker,
  pointer,
  installedTree,
  model,
  catalogBefore,
  modelStat
let sampler, closing, deadlineTimer
let activeLifetime = null,
  baselineSql = null,
  recoveryProject = null,
  previousTransport = null,
  mainDeathControls = null
const baselinePackages = []
let sampling = Promise.resolve()
const nativeChecks = []
const projects = []
const memoryGroups = new Map()
function checkpoint() {
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
}
function check(name, evidence = {}) {
  const entry = {
    name,
    ...(recoveryProfile && activeLifetime ? { lifetime: activeLifetime.number } : {}),
    ...evidence,
  }
  report.checks.push(entry)
  if (recoveryProfile && activeLifetime) (activeLifetime.checks ??= []).push(entry)
  checkpoint()
  console.log(`PASS ${name}`)
}
const sourceFiles = [
  'scripts/qualify-installed-regional-generation.mjs',
  'scripts/qualify-installed-smart-patch.mjs',
  'scripts/smart-patch-qualification-oracles.mjs',
  'scripts/qualification-resource-limits.mjs',
  'scripts/native-smoke-window.mjs',
  'scripts/upgrade-qualification-worker.mjs',
  'src/main/index.ts',
  'src/main/app-paths.ts',
  'src/preload/index.ts',
  'src/shared/api.ts',
  'src/main/runtime/index.ts',
  'src/main/projects/generation-worker-client.ts',
  'src/main/projects/inference-worker-ownership.ts',
  'src/main/projects/generation-action-controller.ts',
  'src/main/projects/generation-dispatch-coordinator.ts',
  'src/main/projects/generation-orchestrator.ts',
  'src/main/projects/project-regional-generation-coordinator.ts',
  'src/main/projects/regional-generation-processor.ts',
  'src/main/projects/regional-worker-request.ts',
  'src/main/projects/regional-queued-generation.ts',
  'src/main/projects/generation-queue.ts',
  'src/main/projects/generation-staging.ts',
  'src/main/projects/generation-bootstrap.ts',
  'src/main/projects/generation-app-context.ts',
  'src/main/projects/project-generation-recovery.ts',
  'src/main/projects/project-temporary-recovery.ts',
  'src/main/projects/project-generation-staging-lifecycle.ts',
  'src/main/projects/project-generation-result-resource.ts',
  'src/main/projects/project-generation-acceptance.ts',
  'src/main/projects/project-generation-provenance.ts',
  'src/main/projects/project-generation-preparation.ts',
  'src/main/projects/project-service.ts',
  'src/main/projects/project-session.ts',
  'src/main/projects/igs-package.ts',
  'src/main/models/model-repository.ts',
  'src/main/models/model-service.ts',
  'src/main/models/sdxl-checkpoint-qualification.ts',
  'src/main/db/migrations/0021_public_regional_generation_queue.sql',
  'src/renderer/App.vue',
  'src/renderer/components/ProjectView.vue',
  'src/renderer/components/ProjectCanvas.vue',
  'src/renderer/components/GenerationQueueManager.vue',
  'src/renderer/components/ProjectGenerationResultsTray.vue',
  'worker-python/pyproject.toml',
  'worker-python/uv.lock',
  'worker-python/src/imagegen_worker/inference_lifetime.py',
  'worker-python/src/imagegen_worker/owned_inference.py',
]
let bundleFiles
async function captureFiles(files) {
  return Object.fromEntries(
    await Promise.all(files.map(async (file) => [file, await hashFile(file)])),
  )
}
async function verifyProvision() {
  assert.equal(await hashFile(fixture.provisionReport.path), fixture.provisionReport.sha256)
  provision = await jsonFile(fixture.provisionReport.path)
  marker = await jsonFile(path.join(appDataRoot, 'qualification-runtime.json'))
  pointer = await jsonFile(path.join(appDataRoot, 'runtime/current-runtime.json'))
  assert.equal(provision.status, 'activated-qualified')
  assert.equal(provision.appData, appDataRoot)
  assert.equal(provision.confirmedWorkerExit, true)
  assert.equal(marker.report, fixture.provisionReport.path)
  assert.equal(marker.status, 'passed')
  assert.equal(marker.appData, appDataRoot)
  assert.equal(marker.runtimeId, provision.runtimeId)
  assert.equal(marker.confirmedWorkerExit, true)
  assert.equal(pointer.runtimeId, provision.runtimeId)
  assert.equal(pointer.pythonExecutable, provision.pythonExecutable)
  assert.equal(provision.installed.editable, false)
  assert.equal(provision.installed.pythonVersion, '3.12.13')
  for (const value of [
    provision.installed.prefix,
    provision.installed.basePrefix,
    provision.installed.workerRoot,
  ]) {
    assert.ok(within(path.join(appDataRoot, 'runtime'), value))
    assert.equal(await realpath(value), value)
  }
  assert.ok(within(provision.installed.prefix, provision.installed.workerRoot))
  assert.ok(within(path.join(appDataRoot, 'runtime'), await realpath(pointer.pythonExecutable)))
  assert.equal(isQualifiedInferenceWorkerReady(provision.ready), true)
  assert.equal(provision.ready.workerVersion, '0.14.0')
  for (const cap of ['illustrious-regional-invoke-v1', 'private-current-canvas-regional-v1'])
    assert.ok(provision.ready.capabilities.includes(cap), `Missing installed capability ${cap}`)
  if (mainDeathProfile) assert.ok(provision.ready.capabilities.includes('linux-owned-inference-v1'))
  assert.equal(
    await hashFile('worker-python/pyproject.toml'),
    provision.inputs.worker.pyprojectSha256,
  )
  assert.equal(await hashFile('worker-python/uv.lock'), provision.inputs.worker.lockSha256)
  const checkout = await treeManifest(path.resolve('worker-python/src/imagegen_worker'))
  installedTree = await treeManifest(provision.installed.workerRoot)
  assert.deepEqual(installedTree, checkout)
  assert.deepEqual(installedTree, provision.installed.workerFiles)
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(provision.inputs.worker.files).map(([key, value]) => [
        key.replace(/^imagegen_worker\//, ''),
        value,
      ]),
    ),
    checkout,
  )
  const modules = Object.fromEntries(
    Object.entries(installedTree).filter(([name]) => name.endsWith('.py')),
  )
  const sourceModuleCount = Object.keys(checkout).filter((name) => name.endsWith('.py')).length
  assert.equal(Object.keys(modules).length, sourceModuleCount)
  if (mainDeathProfile) {
    assert.equal(sourceModuleCount, 50)
    assert.ok(modules['inference_lifetime.py'] && modules['owned_inference.py'])
  }
  assert.deepEqual(
    await treeManifest(path.join(provision.installed.prefix, 'resources/sdxl-config')),
    provision.inputs.config.files,
  )
  report.provision = {
    report: fixture.provisionReport,
    marker,
    pointer,
    installed: provision.installed,
    ready: provision.ready,
    installedModules: modules,
  }
  bundleFiles = [
    'dist/main/main.cjs',
    'dist/preload/preload.cjs',
    'dist/renderer/index.html',
    ...(await readdir('dist/renderer/assets'))
      .filter((name) => /\.(js|css)$/.test(name))
      .sort()
      .map((name) => `dist/renderer/assets/${name}`),
  ]
  report.sourceSha256 = await captureFiles(sourceFiles)
  report.bundleSha256 = await captureFiles(bundleFiles)
  report.sourceRevision = (
    await exec('git', ['rev-parse', 'HEAD'], { timeout: timeout(10_000) })
  ).stdout.trim()
  report.invokeSource = {
    revision: 'a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd',
    paths: [
      'invokeai/frontend/webv1/src/features/controlLayers/konva/CanvasEntity/CanvasEntityAdapterRegionalGuidance.ts',
      'invokeai/app/services/session_queue/session_queue_default.py',
      'invokeai/app/services/shared/database/queries/session_queue.py',
      'invokeai/app/api/routers/session_queue.py',
      'invokeai/app/services/session_processor/session_processor_default.py',
      'invokeai/frontend/webv1/src/features/controlLayers/components/StagingArea/StagingAreaToolbarAcceptButton.tsx',
    ],
  }
  report.launcherBounds = await assertUpgradeBounds({ maxRuntimeSeconds: fixture.deadlineSeconds })
  assert.ok(BigInt(report.launcherBounds.memoryMax) <= 2n * 1024n ** 3n)
  await assertRuntimeIdle(appDataRoot, provision.installed.basePrefix)
  check(
    `Pinned noneditable installed worker, ${sourceModuleCount} Python module hashes, config tree, built bundle and finite launcher agree`,
  )
}

// Adapted from smart-patch-qualification-oracles.mjs: standard PNG filters, explicit 1024 bound.
// This independent decoder never calls the production PNG reader or Pillow.
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex')
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc(bytes) {
  let value = 0xffffffff
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}
function chunk(type, bytes) {
  const output = Buffer.alloc(bytes.length + 12)
  output.writeUInt32BE(bytes.length)
  output.write(type, 4, 'ascii')
  bytes.copy(output, 8)
  output.writeUInt32BE(crc(output.subarray(4, -4)), output.length - 4)
  return output
}
function fixturePng(width, height, rgba, profile) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++)
    rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  return Buffer.concat([
    pngSignature,
    chunk('IHDR', header),
    chunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(profile)])),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
function decodePng(input) {
  const bytes = Buffer.from(input)
  assert.ok(bytes.length >= 45 && bytes.length <= 32 * 1024 ** 2)
  assert.ok(bytes.subarray(0, 8).equals(pngSignature))
  let width,
    height,
    channels,
    iccSha256,
    ended = false,
    idatEnded = false
  const parts = []
  for (let offset = 8, count = 0; offset < bytes.length; count++) {
    assert.ok(count < 4096 && offset + 12 <= bytes.length)
    const length = bytes.readUInt32BE(offset),
      next = offset + length + 12
    assert.ok(next <= bytes.length)
    const type = bytes.toString('ascii', offset + 4, offset + 8),
      body = bytes.subarray(offset + 8, next - 4)
    assert.equal(crc(bytes.subarray(offset + 4, next - 4)), bytes.readUInt32BE(next - 4))
    assert.ok(count !== 0 || type === 'IHDR')
    if (type === 'IHDR') {
      assert.equal(count, 0)
      assert.equal(length, 13)
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      assert.ok(width > 0 && height > 0 && width <= 1024 && height <= 1024)
      assert.equal(body[8], 8)
      assert.ok(body[9] === 2 || body[9] === 6)
      assert.deepEqual([...body.subarray(10)], [0, 0, 0])
      channels = body[9] === 6 ? 4 : 3
    } else if (type === 'IDAT') {
      assert.ok(!idatEnded)
      parts.push(body)
    } else if (type === 'IEND') {
      assert.equal(length, 0)
      assert.equal(next, bytes.length)
      ended = true
      break
    } else {
      assert.ok(/^[a-z]/.test(type), `Unsupported critical PNG chunk ${type}`)
      if (parts.length) idatEnded = true
      if (type === 'iCCP') {
        assert.equal(iccSha256, undefined)
        const zero = body.indexOf(0)
        assert.ok(zero > 0 && zero <= 79)
        assert.equal(body[zero + 1], 0)
        iccSha256 = digest(inflateSync(body.subarray(zero + 2), { maxOutputLength: 1024 * 1024 }))
      }
    }
    offset = next
  }
  assert.ok(ended && parts.length)
  const stride = width * channels
  const encoded = inflateSync(Buffer.concat(parts), { maxOutputLength: (stride + 1) * height })
  assert.equal(encoded.length, (stride + 1) * height)
  const raw = Buffer.alloc(stride * height)
  const paeth = (a, b, c) => {
    const p = a + b - c,
      x = Math.abs(p - a),
      y = Math.abs(p - b),
      z = Math.abs(p - c)
    return x <= y && x <= z ? a : y <= z ? b : c
  }
  for (let y = 0; y < height; y++) {
    const filter = encoded[y * (stride + 1)]
    assert.ok(filter <= 4)
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? raw[y * stride + x - channels] : 0
      const up = y ? raw[(y - 1) * stride + x] : 0
      const diagonal = y && x >= channels ? raw[(y - 1) * stride + x - channels] : 0
      raw[y * stride + x] =
        (encoded[y * (stride + 1) + x + 1] +
          [0, left, up, Math.floor((left + up) / 2), paeth(left, up, diagonal)][filter]) &
        255
    }
  }
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    raw.copy(rgba, i * 4, i * channels, i * channels + 3)
    rgba[i * 4 + 3] = channels === 4 ? raw[i * 4 + 3] : 255
  }
  return { width, height, channels, rgba, iccSha256, rgbaSha256: digest(rgba) }
}

async function catalogSnapshot(db) {
  return {
    resources: await db.selectFrom('model_resource').selectAll().orderBy('id').execute(),
    versions: await db.selectFrom('model_resource_version').selectAll().orderBy('id').execute(),
  }
}
function statIdentity(stat) {
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  }
}
async function prepareCatalogAndProjects() {
  modelStat = statIdentity(await regular(fixture.checkpoint.path))
  assert.equal(modelStat.size, fixture.checkpoint.byteSize)
  assert.equal(await hashFile(fixture.checkpoint.path), fixture.checkpoint.sha256)
  await qualifySdxlCheckpoint(fixture.checkpoint.path)
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  if (recoveryProfile) {
    baselineSql = await sqlSnapshot()
    const priorCount = mainDeathProfile ? 3 : 1
    assert.equal(baselineSql.queue.length, priorCount * 2, 'Reuse the qualified historical pool')
    assert.equal(baselineSql.receipts.length, priorCount)
    assert.equal(baselineSql.cursors.length, priorCount)
    assert.ok(
      baselineSql.queue.every(({ operation }) => operation === 'illustrious-regional-txt2img'),
    )
    assert.equal(baselineSql.queue.filter(({ status }) => status === 'canceled').length, priorCount)
    const priorCompleted = baselineSql.queue.filter(({ status }) => status === 'completed')
    assert.equal(priorCompleted.length, priorCount)
    for (const completed of priorCompleted) {
      const receipts = baselineSql.receipts.filter(
        ({ queue_item_id }) => queue_item_id === completed.id,
      )
      assert.equal(receipts.length, 1)
      assert.equal(receipts[0].status, 'completed')
      assert.equal(receipts[0].actual_seed, 123)
      const cursors = baselineSql.cursors.filter(
        ({ local_project_key }) => local_project_key === completed.local_project_key,
      )
      assert.equal(cursors.length, 1)
      assert.equal(cursors[0].actual_seed, 123)
    }
    assert.ok(
      baselineSql.queue.every(({ status }) => ['completed', 'failed', 'canceled'].includes(status)),
      'Existing pool must be physically idle with terminal historical work',
    )
    const acceptedPackages = []
    for (const record of await database.db
      .selectFrom('project_index')
      .selectAll()
      .orderBy('canonical_path')
      .execute()) {
      if (record.file_health !== 'ready') continue
      assert.ok(within(path.join(appDataRoot, 'workspaces'), record.canonical_path))
      await regular(record.canonical_path)
      baselinePackages.push({
        path: record.canonical_path,
        sha256: await hashFile(record.canonical_path),
      })
      const saved = await readZip(record.canonical_path)
      for (const layer of saved.project.layers) {
        const provenance = layer.generationProvenance
        const prior = priorCompleted.find(
          ({ id }) => id === provenance?.executionResultContext?.queueItemId,
        )
        if (layer.kind !== 'raster' || !prior) continue
        const receipt = baselineSql.receipts.find(({ queue_item_id }) => queue_item_id === prior.id)
        assert.equal(layer.asset.sha256, receipt.image_sha256)
        assert.equal(digest(saved.members.get(layer.asset.path)), layer.asset.sha256)
        assert.equal(provenance.generationConfiguration.model.fileSha256, fixture.checkpoint.sha256)
        acceptedPackages.push({
          path: record.canonical_path,
          layerId: layer.id,
          pngSha256: layer.asset.sha256,
          queueItemId: prior.id,
        })
      }
    }
    assert.ok(
      acceptedPackages.length > 0,
      'Preservation needs a previously accepted Raster package',
    )
    if (!mainDeathProfile)
      assert.deepEqual(
        new Set(acceptedPackages.map(({ queueItemId }) => queueItemId)),
        new Set(priorCompleted.map(({ id }) => id)),
      )
    if (mainDeathProfile) {
      // Nine original packages + three native-r1 setup + three native-r2 packages. R2's
      // healthy completed candidate stays unaccepted; only the two earlier jobs have Rasters.
      assert.equal(baselinePackages.length, 15)
      assert.equal(acceptedPackages.length, 2)
      assert.equal(new Set(acceptedPackages.map(({ queueItemId }) => queueItemId)).size, 2)
      assert.equal(priorCompleted.length - acceptedPackages.length, 1)
    }
    report.baseline = { sql: baselineSql, packages: baselinePackages, acceptedPackages }
    report.lifetimes = []
    report.boundary.actual =
      'Three real built Electron lifetimes using the same installed RuntimeManager/catalog: active regional wire -> owned-scope crash -> APP_RESTART/frozen Queue Retry -> completed temporary candidate -> second owned-scope crash -> real Home Recover -> signed Results/Raster Add/Undo/Redo/explicit Save/reopen.'
    report.boundary.calls =
      'Exactly two witnessed regional wires, one interrupted attempt, one healthy 30-step seed123 completion, two owned-scope SIGKILL events, no automatic resume or replacement Generate, and one final healthy exit. Numerical progress and image quality remain unqualified.'
    report.boundary.exclusions +=
      ' This profile kills a verified owned Electron scope including its execution child. Main-only SIGKILL with a surviving Python worker, worker-only faults, automatic orphan reaping, and immediate restart safety before independently confirmed exit are not qualified.'
    report.boundary.progress =
      'Real Running/busy state is observed; deliberate owned-scope faults do not invoke Cancel. Regional numerical denoising step telemetry remains unqualified.'
    report.boundary.preconditions =
      'Reuse the existing original-file ModelRepository catalog entry, installed runtime, protected model bytes and provision/config companions. Three new real portable ProjectSession fixtures and masks are setup; existing pool SQL and saved packages are immutable baseline controls. No caller-supplied worker recipe or CivitAI download/install claim.'
    if (mainDeathProfile) {
      report.fallbackSignals = []
      report.boundary.actual =
        'Three installed Electron lifetimes: actual regional wire -> pidfd Main-only SIGKILL -> independent native/Python exit -> APP_RESTART and frozen UI Retry -> completed candidate -> second Main-only SIGKILL -> real Home Recover/Add/Undo/Redo/Save/reopen.'
      report.boundary.calls =
        'Exactly two regional wires, two Main-only pidfd SIGKILLs, one original 30-step seed123 completion, one final healthy Electron exit and zero fallback child/scope signals. Previous journaled lease is automatically reclaimed before the next owned worker Ready; unmarked/unrelated controls survive.'
      report.boundary.exclusions =
        'Linux creating-parent-thread ownership only; no fork-descendant reaping, worker-only crash, quality, Anima, numeric progress, installer/Repair or capacity claim. Emergency captured-scope cleanup is failure evidence and can never satisfy this profile.'
    }
  }
  const repository = new ModelRepository(database.db)
  let entry = await repository.findExactFileDuplicate({ sha256: fixture.checkpoint.sha256 })
  if (recoveryProfile)
    assert.ok(
      entry,
      'Recovery reuses the existing exact original-file catalog entry; no new model adoption',
    )
  if (entry) {
    assert.equal(entry.status, 'ready')
    assert.equal(entry.managedPath, fixture.checkpoint.path)
    model = { resourceId: entry.resourceId, versionId: entry.versionId }
  } else {
    model = await repository.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath: fixture.checkpoint.path,
          originalFilename: path.basename(fixture.checkpoint.path),
          sha256: fixture.checkpoint.sha256,
          sizeBytes: fixture.checkpoint.byteSize,
          verifiedAt: new Date().toISOString(),
        },
        resource: {
          type: 'checkpoint',
          displayName: fixture.checkpoint.modelName,
          source: { kind: 'civitai', modelId: fixture.checkpoint.civitaiModelId },
          sourceMetadata: { qualificationPrecondition: true },
        },
        version: {
          baseModelFamily: 'illustrious',
          format: 'safetensors',
          name: fixture.checkpoint.versionName,
          predictionType: 'epsilon',
          source: {
            kind: 'civitai',
            expectedSha256: fixture.checkpoint.sha256,
            versionId: fixture.checkpoint.civitaiVersionId,
            fileId: fixture.checkpoint.civitaiFileId,
          },
          sourceMetadata: { qualificationPrecondition: true },
        },
      },
    })
  }
  catalogBefore = await catalogSnapshot(database.db)
  const reference = {
    kind: 'checkpoint',
    baseModelFamily: 'illustrious',
    civitaiFileId: fixture.checkpoint.civitaiFileId,
    civitaiModelId: fixture.checkpoint.civitaiModelId,
    civitaiVersionId: fixture.checkpoint.civitaiVersionId,
    displayName: fixture.checkpoint.modelName,
    versionName: fixture.checkpoint.versionName,
    fileSha256: fixture.checkpoint.sha256,
    localModelId: model.resourceId,
    localVersionId: model.versionId,
    predictionType: 'epsilon',
  }
  report.catalog = {
    setupOnly: true,
    managedPath: fixture.checkpoint.path,
    model,
    originalStat: modelStat,
    sdxlHeaderVerified: true,
    snapshot: catalogBefore,
  }
  const profile = await readFile('worker-python/src/imagegen_worker/srgb.icc')
  assert.equal(digest(profile), IGS_SRGB_ICC_SHA256)
  const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  await directory(workspace)
  for (const mode of ['transparent', 'opaque', 'partial']) {
    const title = `Regional ${mode} ${path.basename(evidenceRoot)} ${randomUUID().slice(0, 8)}`
    const file = path.join(workspace, `${title}.igs`)
    assert.equal(existsSync(file), false)
    const session = await ProjectSession.create(
      file,
      title,
      {
        placeholdersDir: path.resolve('dist/main/placeholders'),
        scratchDir: path.join(evidenceRoot, 'writer-scratch'),
      },
      bbox,
    )
    const doc = structuredClone(session.document),
      assets = {},
      regionAlphas = []
    doc.generationDraft = {
      ...doc.generationDraft,
      model: reference,
      positivePrompt: { text: globalPrompt, embeddingRefs: [] },
      negativePrompt: { text: '', embeddingRefs: [] },
      dynamicPrompt: { maxPrompts: 1, seedBehavior: 'per-iteration' },
      seed: { policy: 'fixed', value: 123 },
      loras: [],
      vae: null,
      vaePrecision: 'FP16',
      cfgRescale: 0,
      sampling: {
        cfgScale: 5,
        denoisingStrength: null,
        steps: 30,
        sampler: 'Euler',
        scheduler: 'Normal',
      },
    }
    doc.regionalGuidance = localPrompts.map((text, index) => {
      const id = randomUUID(),
        maskId = randomUUID()
      const alpha = Buffer.from(
        Array.from({ length: 1024 ** 2 }, (_, i) => (i % 1024 < 512 === (index === 0) ? 255 : 0)),
      )
      // Project mask assets use tight nonzero bounds; the recipe projects them into world alpha.
      const bytes = encodeProjectMaskPng(Buffer.alloc(512 * 1024, 255), 512, 1024)
      const asset = {
        bytes: bytes.length,
        height: 1024,
        width: 512,
        path: `assets/masks/${maskId}/${digest(bytes)}.png`,
        sha256: digest(bytes),
      }
      assets[asset.path] = { bytes }
      regionAlphas.push(digest(alpha))
      return {
        enabled: true,
        id,
        locked: false,
        mask: {
          asset,
          bounds: { ...bbox, x: bbox.x + index * 512, width: 512 },
          id: maskId,
          revision: 1,
        },
        name: index === 0 ? 'Left subject' : 'Right subject',
        overlayOpacity: 0,
        prompts: {
          positive: { text, embeddingRefs: [] },
          negative: { text: '', embeddingRefs: [] },
          useGlobalNegativePrompt: false,
        },
      }
    })
    if (mode !== 'transparent') {
      const id = randomUUID(),
        rgba = Buffer.alloc(64 * 64 * 4)
      for (let i = 0; i < 64 * 64; i++) {
        rgba[i * 4] = 70
        rgba[i * 4 + 1] = 80
        rgba[i * 4 + 2] = 90
        rgba[i * 4 + 3] = mode === 'opaque' || i % 64 < 32 ? 255 : 0
      }
      const bytes = fixturePng(64, 64, rgba, profile)
      const asset = {
        bytes: bytes.length,
        height: 64,
        width: 64,
        path: `assets/layers/${id}.png`,
        sha256: digest(bytes),
      }
      assets[asset.path] = { bytes }
      doc.layers = [
        {
          asset,
          blendMode: 'normal',
          id,
          kind: 'raster',
          locked: false,
          name: `${mode} source precondition`,
          opacity: 1,
          transform: { x: bbox.x, y: bbox.y, scaleX: 16, scaleY: 16, rotationDegrees: 0 },
          visible: true,
        },
      ]
    }
    session.applyDocument(doc)
    await session.save({ assets })
    projects.push({
      mode,
      title,
      file,
      document: doc,
      initialPackageSha256: await hashFile(file),
      regionAlphas,
    })
  }
  report.projectSetup = projects.map(
    ({ mode, title, file, document, initialPackageSha256, regionAlphas }) => ({
      mode,
      title,
      file,
      documentId: document.documentId,
      initialPackageSha256,
      regionIds: document.regionalGuidance.map(({ id }) => id),
      maskPngSha256: document.regionalGuidance.map(({ mask }) => mask.asset.sha256),
      alphaSha256: regionAlphas,
    }),
  )
  await database.close()
  database = null
  check(
    'Real catalog header/SHA adoption references the immutable original; real portable masks and target controls authored without worker recipes',
  )
}

async function observeMemory(label) {
  for (const [group, role] of memoryGroups) {
    try {
      const root = `/sys/fs/cgroup${group}`
      const current = (await readFile(path.join(root, 'memory.current'), 'utf8')).trim()
      const peak = (await readFile(path.join(root, 'memory.peak'), 'utf8')).trim()
      assert.match(current, /^\d+$/)
      assert.match(peak, /^\d+$/)
      const prior = report.memoryObservations[group] ?? { role, samples: 0, maxCurrent: '0' }
      report.memoryObservations[group] = {
        ...prior,
        samples: prior.samples + 1,
        maxCurrent: String(
          BigInt(current) > BigInt(prior.maxCurrent) ? BigInt(current) : BigInt(prior.maxCurrent),
        ),
        last: { label, at: new Date().toISOString(), current, peak },
      }
    } catch (error) {
      if (!['ENOENT', 'ESRCH', 'ENODEV'].includes(error.code)) throw error
    }
  }
}
async function bounds(label, refreshMainDeathProof = false) {
  const value = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds: recoveryProfile ? activeLifetime.deadlineSeconds : fixture.deadlineSeconds,
    ...(mainDeathProfile
      ? { surviveMainDeath: true, refreshMainDeathProof, deadlineAt: endAt }
      : {}),
    execute: (file, args, options) =>
      exec(
        file,
        args.map((item) => (item === 'MemoryMax=12G' ? 'MemoryMax=10G' : item)),
        options,
      ),
  })
  const launcher = report.launcherBounds
  const unique = new Map(value.groups.map((group) => [group.group, BigInt(group.memoryMax)]))
  for (const group of value.groups) {
    assert.ok(BigInt(group.memoryMax) <= 10n * 1024n ** 3n && group.swapMax === '0')
    memoryGroups.set(group.group, 'native')
  }
  unique.set(launcher.group, BigInt(launcher.memoryMax))
  const total = [...unique.values()].reduce((sum, limit) => sum + limit, 0n)
  assert.ok(total <= 12n * 1024n ** 3n)
  memoryGroups.set(launcher.group, 'launcher')
  await observeMemory(label)
  nativeChecks.push(value)
  report.resourceLimitChecks.push({
    label,
    ...(activeLifetime ? { lifetime: activeLifetime.number } : {}),
    ...value,
    aggregateUniqueMax: String(total),
  })
  checkpoint()
}

/** Pass-through observers: no IPC result, spawn option, stdin argument or worker response changes. */
async function installObservers() {
  await application.evaluate(
    async ({ ipcMain }, ownership) => {
      if (globalThis.__regionalInstalledObserver) throw new Error('Observer already installed')
      const cp = process.getBuiltinModule('child_process')
      const fs = process.getBuiltinModule('fs')
      const crypto = process.getBuiltinModule('crypto')
      const p = process.getBuiltinModule('path')
      const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
      const state = {
        originalSpawn: cp.spawn,
        spawnDescriptor: Object.getOwnPropertyDescriptor(cp, 'spawn'),
        workers: [],
        ipc: [],
        faults: [],
        originals: new Map(),
        wrappers: new Map(),
        restores: [],
      }
      globalThis.__regionalInstalledObserver = state
      const fault = (error) => state.faults.push(String(error.stack ?? error))
      const absent = (file) => {
        try {
          fs.lstatSync(file)
          return false
        } catch (error) {
          if (error.code === 'ENOENT') return true
          throw error
        }
      }
      const readIdentity = (pid) => {
        try {
          const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
          return {
            pid,
            start: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19],
            group: fs
              .readFileSync(`/proc/${pid}/cgroup`, 'utf8')
              .trim()
              .split('\n')
              .find((line) => line.startsWith('0::'))
              ?.slice(3),
            executable: fs.readlinkSync(`/proc/${pid}/exe`),
          }
        } catch (error) {
          if (!['ENOENT', 'ESRCH'].includes(error.code)) fault(error)
          return null
        }
      }
      const checkedBytes = (descriptor, root, maximum) => {
        if (!descriptor || typeof descriptor.path !== 'string')
          throw new Error('Missing owned descriptor')
        const rel = p.relative(root, descriptor.path)
        if (!rel || rel.startsWith('..') || p.isAbsolute(rel))
          throw new Error('Descriptor escaped owned root')
        const stat = fs.lstatSync(descriptor.path)
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.size > maximum ||
          stat.size !== descriptor.byteSize ||
          fs.realpathSync(descriptor.path) !== descriptor.path
        )
          throw new Error('Invalid observed owned file')
        const bytes = fs.readFileSync(descriptor.path)
        if (bytes.length !== descriptor.byteSize || sha(bytes) !== descriptor.sha256)
          throw new Error('Observed owned bytes differ')
        return bytes
      }
      const captureWire = (wire, workerPid) => {
        if (wire.type !== 'execute-current-canvas-regional')
          return { type: wire.type ?? null, requestId: wire.requestId ?? null }
        const bytes = checkedBytes(wire.bundle, wire.stagingRoot, 1024 * 1024)
        const bundle = JSON.parse(bytes.toString('utf8'))
        const target = bundle.request.job.target
        // Target belongs to the request lease, which is a sibling of the transport bundle.
        const targetRoot = p.dirname(target.path)
        const targetBytes = checkedBytes(target, targetRoot, 32 * 1024 * 1024)
        const alpha = bundle.recipe.regions.map((region) => {
          const descriptor = region.coverage.alpha.$alpha8
          const samples = checkedBytes(descriptor, wire.stagingRoot, 64 * 1024 * 1024)
          let positive = 0,
            opaque = 0
          for (const value of samples) {
            if (value > 0) positive++
            if (value === 255) opaque++
          }
          return { ...descriptor, positive, opaque }
        })
        let ownerMarker
        if (ownership.required) {
          const directory = fs.lstatSync(wire.stagingRoot, { bigint: true })
          const file = p.join(wire.stagingRoot, '.owner-v1.json')
          const entry = fs.lstatSync(file)
          if (
            !entry.isFile() ||
            entry.isSymbolicLink() ||
            entry.nlink !== 1 ||
            (entry.mode & 0o777) !== 0o600 ||
            entry.size > 4096
          ) {
            throw new Error('Regional transport ownership marker is unsafe')
          }
          const bytes = fs.readFileSync(file)
          const value = JSON.parse(bytes.toString('utf8'))
          const main = readIdentity(process.pid),
            child = readIdentity(workerPid)
          if (
            value.schemaVersion !== 1 ||
            value.kind !== 'regional-transport-owner-v1' ||
            value.main.pid !== process.pid ||
            value.main.startTicks !== main?.start ||
            value.worker.pid !== workerPid ||
            value.worker.startTicks !== child?.start ||
            value.directory.device !== String(directory.dev) ||
            value.directory.inode !== String(directory.ino) ||
            value.bootId !== fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
          ) {
            throw new Error('Regional ownership marker differs from the real dispatch identities')
          }
          ownerMarker = { value, sha256: sha(bytes), capturedMainPid: process.pid }
        }
        return {
          ...wire,
          bundleJson: bundle,
          target: { ...target, observedSha256: sha(targetBytes) },
          alpha,
          ...(ownerMarker ? { ownerMarker } : {}),
        }
      }
      const spawnWrapper = function (...args) {
        const child = Reflect.apply(state.originalSpawn, this, args)
        try {
          if (
            Array.isArray(args[1]) &&
            args[1].some((arg) => typeof arg === 'string' && arg.startsWith('imagegen_worker'))
          ) {
            if (state.workers.length >= 128)
              throw new Error('Worker observation exceeds finite bound')
            const worker = {
              pid: child.pid ?? null,
              identity: child.pid ? readIdentity(child.pid) : null,
              executable: args[0],
              args: args[1],
              originalSpawnCalls: 1,
              writes: [],
              exit: null,
              close: null,
              writeRestored: false,
              ready: null,
              stdoutRestored: false,
            }
            state.workers.push(worker)
            const originalWrite = child.stdin.write
            const descriptor = Object.getOwnPropertyDescriptor(child.stdin, 'write')
            let pending = ''
            const writeWrapper = function (...writeArgs) {
              let record
              try {
                const bytes =
                  typeof writeArgs[0] === 'string'
                    ? Buffer.from(
                        writeArgs[0],
                        typeof writeArgs[1] === 'string' ? writeArgs[1] : 'utf8',
                      )
                    : Buffer.from(writeArgs[0])
                if (bytes.length > 64 * 1024 || worker.writes.length >= 1024)
                  throw new Error('Worker request observation exceeds bound')
                record = {
                  receiverMatches: this === child.stdin,
                  originalCalls: 1,
                  byteSize: bytes.length,
                  sha256: sha(bytes),
                  at: new Date().toISOString(),
                  lines: [],
                }
                worker.writes.push(record)
                pending += bytes.toString('utf8')
                if (pending.length > 128 * 1024)
                  throw new Error('Incomplete JSONL observation exceeds bound')
                let newline
                while ((newline = pending.indexOf('\n')) >= 0) {
                  const line = pending.slice(0, newline)
                  pending = pending.slice(newline + 1)
                  if (line) record.lines.push(captureWire(JSON.parse(line), child.pid))
                }
              } catch (error) {
                fault(error)
              }
              try {
                const result = Reflect.apply(originalWrite, this, writeArgs)
                if (record) record.returned = result
                return result
              } catch (error) {
                if (record) record.thrown = { name: error.name, message: error.message }
                throw error
              }
            }
            child.stdin.write = writeWrapper
            let response = ''
            const onData = (chunk) => {
              try {
                response += chunk.toString('utf8')
                if (response.length > 128 * 1024)
                  throw new Error('Worker response observation exceeds bound')
                let newline
                while ((newline = response.indexOf('\n')) >= 0) {
                  const line = response.slice(0, newline)
                  response = response.slice(newline + 1)
                  if (!line) continue
                  const message = JSON.parse(line)
                  if (message.type !== 'ready') continue
                  worker.ready = message
                  const inference =
                    worker.args.includes('imagegen_worker.owned_inference') ||
                    worker.args.includes('imagegen_worker.inference_main')
                  if (!inference) continue
                  const guarded =
                    message.capabilities?.includes('linux-owned-inference-v1') === true
                  const expected = guarded
                    ? [
                        '-I',
                        '-m',
                        'imagegen_worker.owned_inference',
                        '--parent-pid',
                        String(process.pid),
                        '--scratch-base',
                        ownership.scratch,
                      ]
                    : ['-I', '-m', 'imagegen_worker.inference_main']
                  if (
                    JSON.stringify(worker.args) !== JSON.stringify(expected) ||
                    (ownership.required &&
                      (!guarded ||
                        message.workerVersion !== '0.14.0' ||
                        message.protocolVersion !== '1'))
                  ) {
                    throw new Error(
                      'Actual inference module/arguments disagree with lifetime capability',
                    )
                  }
                  if (ownership.required) {
                    const previous = ownership.previous
                    if (previous && !absent(previous.path)) {
                      throw new Error(
                        'Journaled previous transport survived until owned worker Ready',
                      )
                    }
                    if (previous) {
                      const entries = fs.readdirSync(ownership.scratch)
                      if (entries.length > 4096)
                        throw new Error('Scratch recovery observation exceeds bound')
                      for (const name of entries) {
                        if (
                          !name.startsWith('regional-request-') &&
                          !name.startsWith('.regional-reclaim-v1-')
                        )
                          continue
                        const entry = fs.lstatSync(p.join(ownership.scratch, name), {
                          bigint: true,
                        })
                        if (
                          String(entry.dev) === previous.marker.directory.device &&
                          String(entry.ino) === previous.marker.directory.inode
                        ) {
                          throw new Error(
                            'Previous transport inode remains under a renamed recovery entry',
                          )
                        }
                      }
                    }
                    for (const control of ownership.controls.files) {
                      const entry = fs.lstatSync(control.path)
                      if (
                        !entry.isFile() ||
                        entry.isSymbolicLink() ||
                        entry.nlink !== 1 ||
                        entry.size !== control.byteSize ||
                        (entry.mode & 0o777) !== 0o600 ||
                        entry.uid !== process.getuid() ||
                        entry.ino !== control.inode ||
                        fs.realpathSync(control.path) !== control.path ||
                        sha(fs.readFileSync(control.path)) !== control.sha256
                      ) {
                        throw new Error(
                          'Unmarked or unrelated retention control changed before Ready',
                        )
                      }
                    }
                    const unmarked = fs.lstatSync(ownership.controls.unmarkedRoot)
                    if (
                      !unmarked.isDirectory() ||
                      unmarked.isSymbolicLink() ||
                      unmarked.ino !== ownership.controls.unmarkedInode
                    ) {
                      throw new Error('The unmarked control directory changed identity')
                    }
                    if (!absent(p.join(ownership.controls.unmarkedRoot, '.owner-v1.json'))) {
                      throw new Error('The unmarked retention control acquired an ownership marker')
                    }
                    worker.startupRecovery = {
                      at: new Date().toISOString(),
                      previousTransport: previous?.path ?? null,
                      previousAbsent: previous !== null,
                      previousDirectoryInodeAbsent: previous !== null,
                      controls: ownership.controls.files,
                    }
                  }
                }
              } catch (error) {
                fault(error)
              }
            }
            child.stdout.on('data', onData)
            const onExit = (code, signal) => {
              worker.exit = { at: new Date().toISOString(), code, signal }
            }
            const onClose = (code, signal) => {
              worker.close = { at: new Date().toISOString(), code, signal }
            }
            child.once('exit', onExit)
            child.once('close', onClose)
            state.restores.push(() => {
              if (child.stdin.write !== writeWrapper)
                throw new Error('Observed stdin slot changed owner')
              if (descriptor) Object.defineProperty(child.stdin, 'write', descriptor)
              else delete child.stdin.write
              if (child.stdin.write !== originalWrite) throw new Error('stdin restoration differs')
              child.removeListener('exit', onExit)
              child.removeListener('close', onClose)
              child.stdout.removeListener('data', onData)
              worker.writeRestored = true
              worker.stdoutRestored = true
            })
          }
        } catch (error) {
          fault(error)
        }
        return child
      }
      state.spawnWrapper = spawnWrapper
      cp.spawn = spawnWrapper
      process.getBuiltinModule('module').syncBuiltinESMExports()
      if (ownership.required) {
        if (ownership.previous && absent(ownership.previous.path)) {
          throw new Error('Previous lease disappeared before the Ready observer was installed')
        }
        const children = fs.readFileSync(`/proc/self/task/${process.pid}/children`, 'utf8').trim()
        for (const pid of children ? children.split(/\s+/) : []) {
          try {
            const argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')
            if (
              argv.includes('imagegen_worker.owned_inference') ||
              argv.includes('imagegen_worker.inference_main')
            ) {
              throw new Error('An inference child predates the Main-death Ready observer')
            }
          } catch (error) {
            if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
          }
        }
      }
      const channels = [
        'projects:generate',
        'projects:cancel-current-generation',
        'projects:cancel-generation-job',
        'projects:retry-generation-job',
        'projects:resolve-recovery',
        'projects:accept-generation-candidates',
        'projects:save',
        'projects:open',
        'projects:close',
        'projects:undo',
        'projects:redo',
        'projects:update-generation-draft',
        'projects:update-regional-guidance',
      ]
      for (const channel of channels) {
        const deadline = Date.now() + 15_000
        while (ownership.required && !ipcMain._invokeHandlers.has(channel) && Date.now() < deadline)
          await new Promise((resolve) => setTimeout(resolve, 10))
        const original = ipcMain._invokeHandlers.get(channel)
        if (!original) throw new Error(`Missing production IPC handler ${channel}`)
        const wrapper = async function (...args) {
          let record
          try {
            if (state.ipc.length >= 1024) throw new Error('IPC observation exceeds bound')
            record = {
              channel,
              args: structuredClone(args.slice(1)),
              originalCalls: 1,
              startedAt: new Date().toISOString(),
              finished: false,
            }
            state.ipc.push(record)
          } catch (error) {
            fault(error)
          }
          try {
            const result = await Reflect.apply(original, this, args)
            try {
              if (record) {
                record.ok = result?.ok ?? null
                record.response = structuredClone(result)
              }
            } catch (error) {
              fault(error)
            }
            return result
          } catch (error) {
            if (record) record.thrown = { name: error.name, message: error.message }
            throw error
          } finally {
            if (record) {
              record.finished = true
              record.finishedAt = new Date().toISOString()
            }
          }
        }
        state.originals.set(channel, original)
        state.wrappers.set(channel, wrapper)
        ipcMain._invokeHandlers.set(channel, wrapper)
      }
    },
    {
      required: mainDeathProfile,
      scratch: path.join(appDataRoot, 'scratch'),
      previous: previousTransport,
      controls: mainDeathControls,
    },
  )
}
async function observerSnapshot(restore = false) {
  return await application.evaluate(({ ipcMain }, restore) => {
    const state = globalThis.__regionalInstalledObserver
    if (!state) return { installed: false, workers: [], ipc: [], faults: [] }
    if (restore) {
      const cp = process.getBuiltinModule('child_process')
      if (cp.spawn !== state.spawnWrapper) throw new Error('Spawn observer ownership changed')
      Object.defineProperty(cp, 'spawn', state.spawnDescriptor)
      process.getBuiltinModule('module').syncBuiltinESMExports()
      for (const callback of state.restores) callback()
      for (const [channel, original] of state.originals) {
        if (ipcMain._invokeHandlers.get(channel) !== state.wrappers.get(channel))
          throw new Error(`IPC observer ownership changed: ${channel}`)
        ipcMain._invokeHandlers.set(channel, original)
        if (ipcMain._invokeHandlers.get(channel) !== original)
          throw new Error('IPC restore differs')
      }
      state.restored = cp.spawn === state.originalSpawn
    }
    return {
      installed: true,
      restored: state.restored ?? false,
      workers: state.workers,
      ipc: state.ipc,
      faults: state.faults,
    }
  }, restore)
}
function regionalWires(snapshot) {
  return snapshot.workers.flatMap((worker) =>
    worker.writes.flatMap((write) =>
      write.lines
        .filter(({ type }) => type === 'execute-current-canvas-regional')
        .map((wire) => ({ pid: worker.pid, ...wire })),
    ),
  )
}

async function api(method, ...args) {
  let timer
  try {
    const result = await Promise.race([
      window.evaluate(({ method, args }) => window.api.projects[method](...args), { method, args }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Read-only projects.${method} observation timed out`)),
          timeout(30_000),
        )
      }),
    ])
    assert.equal(result.ok, true, JSON.stringify(result))
    return result.value
  } finally {
    clearTimeout(timer)
  }
}
const canvas = () => window.getByRole('region', { name: 'Project Canvas', exact: true })
const tray = () => window.getByRole('region', { name: 'Generation Results', exact: true })
async function current(project) {
  const opened = await api('open', project.id)
  assert.equal(opened.kind, 'opened')
  return opened.tab
}
async function screenshot(name) {
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const file = path.join(evidenceRoot, `${name}.png`)
  await window.screenshot({ path: file, animations: 'disabled', timeout: timeout() })
  report.screenshots.push(file)
  checkpoint()
}
async function launch() {
  if (recoveryProfile) {
    assert.ok(!application, 'A previous native lifetime must finish physically before relaunch')
    assert.equal(nativeChecks.length, 0, 'Physical checks/watchdogs must be scoped to one lifetime')
    activeLifetime = {
      number: report.lifetimes.length + 1,
      startedAt: new Date().toISOString(),
      // Keep each PID/start watchdog within the original overall budget, never reset it at relaunch.
      deadlineSeconds: Math.max(1, Math.floor(timeout(fixture.deadlineSeconds * 1000) / 1000)),
    }
    sampling = Promise.resolve()
    memoryGroups.clear()
  }
  const scratch = path.join(appDataRoot, 'scratch')
  const beforeScratch = await lstat(scratch).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (beforeScratch) {
    assert.ok(beforeScratch.isDirectory() && !beforeScratch.isSymbolicLink())
    assert.equal(await realpath(scratch), scratch)
  }
  report.startupScratch = {
    path: scratch,
    beforeMode: beforeScratch ? (beforeScratch.mode & 0o777).toString(8) : null,
    beforeInode: beforeScratch?.ino ?? null,
    harnessChangedPermissions: false,
  }
  checkpoint()
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
    XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
    XDG_CACHE_HOME: path.join(fixtureRoot, 'cache'),
  }
  for (const name of [
    'ELECTRON_RUN_AS_NODE',
    'IMAGEGEN_TEST_IMAGE_WORKER',
    'IMAGEGEN_DEV_SERVER_URL',
    'PYTHONPATH',
    'PYTHONHOME',
    'CUDA_VISIBLE_DEVICES',
  ])
    delete env[name]
  application = await electron.launch({
    args: ['--ozone-platform=x11', '.'],
    cwd: process.cwd(),
    env,
    timeout: timeout(),
  })
  const observing = mainDeathProfile ? installObservers() : null
  if (observing) void observing.catch(() => {})
  await bounds('launch')
  if (observing) await observing
  window = await isolateNativeSmokeWindow(application)
  const afterScratch = await lstat(scratch)
  assert.ok(afterScratch.isDirectory() && !afterScratch.isSymbolicLink())
  assert.equal(await realpath(scratch), scratch)
  assert.equal(
    afterScratch.mode & 0o777,
    0o700,
    'Production startup owner must establish private scratch; the harness never chmods it',
  )
  if (beforeScratch) assert.equal(afterScratch.ino, beforeScratch.ino)
  report.startupScratch.afterMode = (afterScratch.mode & 0o777).toString(8)
  report.startupScratch.afterInode = afterScratch.ino
  window.setDefaultTimeout(15_000)
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await application.evaluate(({ BrowserWindow, app }) => {
    if (app.getPath('userData') !== process.env.XDG_DATA_HOME + '/imagegen-studio')
      throw new Error('Electron uses unexpected appData')
    const native = BrowserWindow.getAllWindows()[0]
    native.setSize(1440, 900)
    native.focus()
  })
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  if (!mainDeathProfile) await installObservers()
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  await expect
    .poll(
      async () =>
        (await database.db.selectFrom('project_index').select('canonical_path').execute()).filter(
          ({ canonical_path }) => projects.some(({ file }) => file === canonical_path),
        ).length,
      { timeout: timeout() },
    )
    .toBe(3)
  const indexed = await database.db.selectFrom('project_index').selectAll().execute()
  for (const project of projects) {
    const record = indexed.find((entry) => entry.canonical_path === project.file)
    assert.ok(record, `Missing genuine indexed fixture ${project.title}`)
    assert.equal(record.file_health, 'ready')
    project.id = record.local_project_key
  }
  const runtime = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(runtime.ok, true)
  assert.equal(runtime.value.kind, 'ready')
  report.actualRuntime = runtime.value
  const catalog = await window.evaluate(() => window.api.models.getCatalog())
  assert.equal(catalog.ok, true)
  const actualVersion = catalog.value
    .find(({ id }) => id === model.resourceId)
    ?.versions.find(({ id }) => id === model.versionId)
  assert.equal(actualVersion?.fileStatus, 'ready')
  assert.equal(actualVersion.sha256, fixture.checkpoint.sha256)
  assert.equal(actualVersion.baseModelFamily, 'illustrious')
  report.actualCatalogVersion = actualVersion
  sampler = setInterval(() => {
    sampling = sampling
      .then(async () => {
        await bounds('periodic')
        checkpoint()
      })
      .catch((error) => {
        report.samplerError = String(error.stack ?? error)
        checkpoint()
      })
  }, 5000)
  check(
    'Real production Electron startup/default installed RuntimeManager and genuine catalog are ready',
  )
}
async function openProject(project) {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toBeVisible()
  await expect(window.locator('input[aria-label="Images per click"]')).toBeEnabled({
    timeout: timeout(),
  })
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true', {
    timeout: timeout(),
  })
  const tab = await current(project)
  assert.equal(tab.documentId, project.document.documentId)
  return tab
}
async function sqlSnapshot(db = database.db) {
  return {
    queue: await db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('created_at')
      .orderBy('id')
      .execute(),
    receipts: await db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .orderBy('completion_order')
      .execute(),
    cursors: await db
      .selectFrom('generation_seed_cursor')
      .selectAll()
      .orderBy('local_project_key')
      .execute(),
  }
}
async function job(id) {
  return await database.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}
async function targetState(project) {
  const tab = await current(project)
  const signature = generationTargetSignature(tab)
  assert.ok(signature)
  return await api(
    'getGenerationTargetState',
    project.id,
    tab.documentId,
    digest(Buffer.from(signature)),
  )
}
async function targetRefusalControls() {
  report.targetControls = []
  for (const project of projects.filter(({ mode }) => mode !== 'transparent')) {
    await openProject(project)
    const count = window.locator('input[aria-label="Images per click"]')
    await count.fill('1')
    await count.press('Enter')
    await expect(count).toHaveValue('1')
    const before = await sqlSnapshot(),
      observed = await observerSnapshot()
    const state = await targetState(project)
    assert.equal(state.mode, project.mode === 'opaque' ? 'img2img' : 'outpaint')
    const reason =
      'Regional Guidance requires an empty Current Canvas generation area. Hide or move raster input before generating.'
    await expect(window.getByText(reason, { exact: true })).toBeVisible({ timeout: timeout() })
    const generate = window.getByRole('button', { name: 'Generate', exact: true })
    await expect(generate).toBeDisabled()
    // Real browser activation of a disabled control must not dispatch a Main command.
    await generate.evaluate((button) => button.click())
    await window.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
    assert.deepEqual(await sqlSnapshot(), before)
    assert.equal(
      (await observerSnapshot()).ipc.filter(({ channel }) => channel === 'projects:generate')
        .length,
      observed.ipc.filter(({ channel }) => channel === 'projects:generate').length,
    )
    assert.equal(regionalWires(await observerSnapshot()).length, regionalWires(observed).length)
    assert.equal(await hashFile(project.file), project.initialPackageSha256)
    report.targetControls.push({
      mode: project.mode,
      state,
      generateDisabled: true,
      noSqlReceiptCursorMutation: true,
      noGenerateIpc: true,
      noRegionalWire: true,
      packageSha256: project.initialPackageSha256,
    })
    await screenshot(`target-refusal-${project.mode}`)
    await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  }
  check(
    'Opaque and partially transparent real-compositor targets refuse in the UI before SQL/inference; portable sources unchanged',
  )
}

function assertFrozen(frozen, project) {
  assert.equal(frozen.schemaVersion, 1)
  assert.equal(frozen.kind, 'illustrious-regional-txt2img')
  assert.equal(frozen.compositionProfile, 'invoke-canvas-v1')
  assert.equal(frozen.context.documentId, project.document.documentId)
  assert.deepEqual(frozen.context.bbox, bbox)
  assert.equal(frozen.context.prompts.positive, globalPrompt)
  assert.equal(frozen.context.prompts.negative, '')
  assert.equal(frozen.workerJob.checkpoint.sha256, fixture.checkpoint.sha256)
  assert.equal(frozen.workerJob.checkpoint.predictionType, 'epsilon')
  assert.equal(frozen.context.model.managedPath, fixture.checkpoint.path)
  assert.equal(frozen.workerJob.sampling.steps, 30)
  assert.equal(frozen.workerJob.sampling.seed, 123)
  assert.equal(frozen.workerJob.sampling.cfgScale, 5)
  assert.equal(frozen.workerJob.sampling.scheduler, 'euler')
  assert.deepEqual(frozen.workerJob.sampling.noiseProfile, policy)
  assert.equal(frozen.workerJob.vaePrecision, 'FP16')
  assert.equal(frozen.workerJob.vae, null)
  assert.equal((frozen.workerJob.loras ?? []).length, 0)
  assert.equal(frozen.workerJob.target.width, 1024)
  assert.equal(frozen.workerJob.target.height, 1024)
  assert.equal(frozen.workerJob.target.iccSha256, IGS_SRGB_ICC_SHA256)
}
async function captureFrozen(row, project) {
  assert.equal(row.operation, 'illustrious-regional-txt2img')
  const frozen = JSON.parse(row.frozen_payload_json)
  assertFrozen(frozen, project)
  const root = path.join(appDataRoot, 'generation-inputs', row.id)
  await directory(root)
  const targetBytes = await readFile(path.join(root, 'target.png'))
  assert.equal(digest(targetBytes), frozen.workerJob.target.sha256)
  assert.equal(targetBytes.length, frozen.workerJob.target.byteSize)
  const target = decodePng(targetBytes)
  assert.equal(target.width, 1024)
  assert.equal(target.height, 1024)
  assert.equal(target.iccSha256, IGS_SRGB_ICC_SHA256)
  for (let i = 3; i < target.rgba.length; i += 4) assert.equal(target.rgba[i], 0)
  const regionalBytes = await readFile(path.join(root, 'regional.json'))
  assert.equal(regionalBytes.length, frozen.regional.byteSize)
  assert.equal(digest(regionalBytes), frozen.regional.sha256)
  const regional = JSON.parse(regionalBytes.toString('utf8'))
  assert.equal(regional.compositionProfile, 'invoke-canvas-v1')
  assert.equal(regional.layout, 'cfg-negative-first')
  assert.deepEqual(regional.globalNegativeCoverage, { kind: 'everywhere' })
  assert.deepEqual(regional.globalPositiveCoverage, { kind: 'everywhere' })
  assert.equal(regional.negativePooledSourceId, 'current-canvas')
  assert.equal(regional.positivePooledSourceId, 'current-canvas')
  assert.equal(regional.recipe.regions.length, 2)
  assert.deepEqual(regional.recipe.bbox, bbox)
  assert.equal(regional.recipe.globalPrompts.positive.text, globalPrompt)
  const alphas = []
  for (const [index, region] of regional.recipe.regions.entries()) {
    assert.equal(region.regionId, project.document.regionalGuidance[index].id)
    assert.equal(region.positive.text, localPrompts[index])
    assert.equal(region.negative.prompt.text, '')
    const descriptor = region.coverage.alpha.$alpha8
    assert.match(descriptor.file, /^region-[01]\.alpha8$/)
    const bytes = await readFile(path.join(root, descriptor.file))
    assert.equal(bytes.length, 1024 ** 2)
    assert.equal(bytes.length, descriptor.byteSize)
    assert.equal(digest(bytes), descriptor.sha256)
    assert.equal(descriptor.sha256, project.regionAlphas[index])
    // Independent authored geometry, not a recipe-derived expected mask.
    for (let i = 0; i < bytes.length; i++)
      assert.equal(bytes[i], i % 1024 < 512 === (index === 0) ? 255 : 0)
    alphas.push(descriptor)
  }
  return {
    row,
    frozen,
    frozenPayloadSha256: digest(Buffer.from(row.frozen_payload_json)),
    regional,
    alphas,
    targetRgbaSha256: target.rgbaSha256,
    targetSha256: digest(targetBytes),
  }
}
async function openQueue() {
  await window.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
  await expect(window.getByRole('dialog', { name: 'Queue Manager', exact: true })).toBeVisible()
}
async function closeQueue() {
  await window.getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
}
const queueRow = (id) => window.locator(`[data-testid="queue-job-row"][data-job-id="${id}"]`)
async function save(project) {
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect
    .poll(async () => (await current(project)).dirty, { timeout: timeout(120_000) })
    .toBe(false)
}
async function generateCancelEditRetry(project) {
  await openProject(project)
  const beforeGeneratePackageSha256 = await hashFile(project.file)
  assert.equal(beforeGeneratePackageSha256, project.initialPackageSha256)
  assert.equal((await targetState(project)).mode, 'txt2img')
  const advisory = await api('getGenerationState', project.id)
  assert.equal(advisory.regionalSupported, true)
  await expect(window.locator('input[aria-label="Steps"]')).toHaveValue('30')
  await expect(window.locator('input[aria-label="CFG scale"]')).toHaveValue('5')
  await expect(window.locator('input[aria-label="Generation seed"]')).toHaveValue('123')
  const count = window.locator('input[aria-label="Images per click"]')
  await count.fill('1')
  await count.press('Enter')
  await expect(count).toHaveValue('1')
  const generate = window.getByRole('button', { name: 'Generate', exact: true })
  await expect(generate).toBeEnabled({ timeout: timeout(120_000) })
  const baseline = await sqlSnapshot()
  assert.deepEqual(
    baseline,
    { queue: [], receipts: [], cursors: [] },
    'Fresh appData must have no prior operational generation work',
  )
  await generate.click()
  await expect
    .poll(async () => (await sqlSnapshot()).queue.length, { timeout: timeout(180_000) })
    .toBe(1)
  const first = (await sqlSnapshot()).queue[0]
  await expect
    .poll(async () => (await job(first.id)).status, { timeout: timeout(180_000) })
    .toBe('running')
  const firstCaptured = await captureFrozen(await job(first.id), project)
  const state = await api('getGenerationState', project.id)
  assert.equal(state.phase, 'processing')
  assert.equal(state.runningJobId, first.id)
  await openQueue()
  await expect(queueRow(first.id)).toContainText('Running')
  await expect(
    queueRow(first.id).getByRole('button', { name: 'Cancel job', exact: true }),
  ).toBeEnabled()
  // SQL Running precedes transport. Missing observer evidence is an incomplete/failed run,
  // never permission to substitute a timing guess or a mocked native request.
  await expect
    .poll(
      async () => {
        const row = await job(first.id)
        assert.equal(
          row.status,
          'running',
          `First job finished before UI cancellation: ${row.error_message ?? row.status}`,
        )
        const observed = await observerSnapshot()
        assert.deepEqual(observed.faults, [])
        return regionalWires(observed).length
      },
      { timeout: timeout(240_000), intervals: [100, 250, 500] },
    )
    .toBe(1)
  report.cancellationBoundary =
    'Actual Main-to-Python regional JSONL request witnessed before UI Cancel; no completed denoising-step count is inferred.'
  const snapshot = await observerSnapshot()
  assert.deepEqual(snapshot.faults, [])
  report.beforeCancel = {
    actionState: state,
    captured: firstCaptured,
    observedRegionalWires: regionalWires(snapshot),
  }
  await screenshot('running-before-cancel')
  await queueRow(first.id).getByRole('button', { name: 'Cancel job', exact: true }).click()
  await expect
    .poll(async () => (await job(first.id)).status, { timeout: timeout(120_000) })
    .toBe('canceled')
  await expect(queueRow(first.id)).toContainText('Canceled')
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).phase, {
      timeout: timeout(120_000),
    })
    .toBe('idle')
  const canceled = await sqlSnapshot()
  assert.equal(canceled.queue.length, 1)
  assert.deepEqual(canceled.receipts, [])
  assert.deepEqual(canceled.cursors, [])
  assert.equal(canceled.queue[0].frozen_payload_json, first.frozen_payload_json)
  assert.equal(
    await hashFile(project.file),
    beforeGeneratePackageSha256,
    'Generate and Cancel must not implicitly Save the portable Project',
  )
  report.noImplicitSave = {
    beforeGeneratePackageSha256,
    afterCancelPackageSha256: await hashFile(project.file),
  }
  report.canceled = canceled.queue[0]
  await closeQueue()
  // These are renderer-owned edits delivered by original IPC, deliberately differing from Retry.
  const steps = window.locator('input[aria-label="Steps"]')
  await steps.fill('2')
  await steps.press('Enter')
  const seed = window.locator('input[aria-label="Generation seed"]')
  await seed.fill('124')
  await seed.press('Enter')
  for (const region of project.document.regionalGuidance)
    await window
      .locator(`[data-regional-guidance-id="${region.id}"]`)
      .getByRole('button', { name: `Hide ${region.name}`, exact: true })
      .click()
  await expect
    .poll(
      async () => {
        const tab = await current(project)
        return {
          steps: tab.generationDraft.sampling.steps,
          seed: tab.generationDraft.seed,
          enabled: tab.regionalGuidance.map(({ enabled }) => enabled),
        }
      },
      { timeout: timeout() },
    )
    .toEqual({ steps: 2, seed: { policy: 'fixed', value: 124 }, enabled: [false, false] })
  await expect(generate).toBeEnabled({ timeout: timeout(120_000) })
  report.ordinaryNeighbor = {
    regionsDisabled: true,
    transparentCurrentCanvas: true,
    generateEnabled: true,
    noOrdinaryInferenceRequested: true,
  }
  await save(project)
  const edited = await current(project)
  assert.deepEqual(edited.layers, project.document.layers)
  assert.deepEqual(edited.primaryBbox, bbox)
  report.currentAuthoringAfterEdit = {
    generationDraft: edited.generationDraft,
    regionalGuidance: edited.regionalGuidance,
    packageSha256: await hashFile(project.file),
  }
  const afterEditSavePackageSha256 = report.currentAuthoringAfterEdit.packageSha256
  await screenshot('edited-saved-current-draft')
  await openQueue()
  await expect(queueRow(first.id)).toContainText('Seed 123')
  const retry = queueRow(first.id).getByRole('button', { name: 'Retry job', exact: true })
  await expect(retry).toBeEnabled({ timeout: timeout(120_000) })
  await retry.click()
  await expect
    .poll(async () => (await sqlSnapshot()).queue.length, { timeout: timeout(180_000) })
    .toBe(2)
  const retried = (await sqlSnapshot()).queue.find(({ id }) => id !== first.id)
  assert.ok(retried)
  assert.equal(retried.operation, 'illustrious-regional-txt2img')
  assert.equal(
    retried.frozen_payload_json,
    first.frozen_payload_json,
    'Retry preserves exact original frozen recipe/profile/policies after authoring edits',
  )
  const secondCaptured = await captureFrozen(retried, project)
  assert.equal(secondCaptured.frozenPayloadSha256, firstCaptured.frozenPayloadSha256)
  assert.equal(secondCaptured.targetSha256, firstCaptured.targetSha256)
  report.retry = {
    firstJobId: first.id,
    retryJobId: retried.id,
    originalFrozen: firstCaptured,
    retryFrozen: secondCaptured,
  }
  await closeQueue()
  await expect
    .poll(
      async () => {
        const row = await job(retried.id)
        if (row.status === 'failed' || row.status === 'canceled')
          assert.fail(`Frozen Retry did not complete: ${row.error_code}: ${row.error_message}`)
        return row.status
      },
      { timeout: timeout(900_000), intervals: [250, 500, 1000] },
    )
    .toBe('completed')
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).phase, {
      timeout: timeout(120_000),
    })
    .toBe('idle')
  assert.equal(
    await hashFile(project.file),
    afterEditSavePackageSha256,
    'Frozen Retry and native completion must not implicitly Save before Add',
  )
  report.noImplicitSave.afterExplicitEditSavePackageSha256 = afterEditSavePackageSha256
  report.noImplicitSave.afterRetryCompletionPackageSha256 = await hashFile(project.file)
  assert.equal((await current(project)).generationDraft.sampling.steps, 2)
  assert.deepEqual((await current(project)).generationDraft.seed, { policy: 'fixed', value: 124 })
  const final = await sqlSnapshot()
  assert.equal(final.queue.length, 2)
  assert.equal(final.receipts.length, 1)
  assert.equal(final.cursors.length, 1)
  assert.equal(final.receipts[0].queue_item_id, retried.id)
  assert.equal(final.receipts[0].status, 'completed')
  assert.equal(final.receipts[0].actual_seed, 123)
  assert.equal(final.receipts[0].frozen_payload_sha256, firstCaptured.frozenPayloadSha256)
  assert.equal(final.cursors[0].actual_seed, 123)
  const observed = await observerSnapshot()
  assert.deepEqual(observed.faults, [])
  const wires = regionalWires(observed)
  assert.ok(wires.length <= 2, 'No extra regional inference requests are authorized')
  assert.equal(new Set(wires.map(({ requestId }) => requestId)).size, wires.length)
  for (const wire of wires) {
    assert.equal(wire.bundleJson.compositionProfile, 'invoke-canvas-v1')
    assert.equal(wire.bundleJson.layout, 'cfg-negative-first')
    assert.deepEqual(wire.bundleJson.globalPositiveCoverage, { kind: 'everywhere' })
    assert.deepEqual(wire.bundleJson.globalNegativeCoverage, { kind: 'everywhere' })
    assert.equal(wire.bundleJson.positivePooledSourceId, 'current-canvas')
    assert.equal(wire.bundleJson.negativePooledSourceId, 'current-canvas')
    assert.equal(wire.bundleJson.request.job.sampling.steps, 30)
    assert.equal(wire.bundleJson.request.job.sampling.seed, 123)
    assert.equal(wire.bundleJson.request.job.sampling.cfgScale, 5)
    assert.deepEqual(wire.bundleJson.request.job.sampling.noiseProfile, policy)
    assert.equal(wire.target.sha256, firstCaptured.targetSha256)
    assert.deepEqual(
      wire.alpha.map(({ sha256 }) => sha256),
      project.regionAlphas,
    )
    for (const alpha of wire.alpha) {
      assert.equal(alpha.positive, 1024 ** 2 / 2)
      assert.equal(alpha.opaque, alpha.positive)
    }
  }
  assert.equal(
    wires.length,
    2,
    'Generate and Retry each require one witnessed original regional command',
  )
  assert.equal(
    observed.workers
      .flatMap(({ writes }) => writes.flatMap(({ lines }) => lines))
      .filter(({ type }) => type === 'generate-illustrious-txt2img').length,
    0,
    'No ordinary inference command may replace regional execution',
  )
  report.nativeAccounting = {
    regionalWireCount: wires.length,
    completedReceiptCount: final.receipts.length,
    canceledSqlCount: final.queue.filter(({ status }) => status === 'canceled').length,
    workerSpawnCount: observed.workers.length,
    observerUnavailable: observed.workers.length === 0,
    stepCounterQualified: false,
  }
  check(
    'UI Generate/Cancel and original-op frozen Queue Retry preserve 30-step seed123 policies after saved steps2/seed124 and disabled regions',
    report.nativeAccounting,
  )
  return {
    row: await job(retried.id),
    receipt: final.receipts[0],
    frozen: firstCaptured.frozen,
    edited,
  }
}

function ownRecoverySql(whole) {
  assert.ok(recoveryProject?.id)
  return Object.fromEntries(
    Object.entries(whole).map(([name, rows]) => [
      name,
      rows.filter(({ local_project_key }) => local_project_key === recoveryProject.id),
    ]),
  )
}
function assertBaselineSql(whole) {
  assert.ok(baselineSql && recoveryProject?.id)
  for (const [name, rows] of Object.entries(whole))
    assert.deepEqual(
      rows.filter(({ local_project_key }) => local_project_key !== recoveryProject.id),
      baselineSql[name],
      `Historical pool ${name} must remain unchanged`,
    )
}
async function recoverySql() {
  const whole = await sqlSnapshot()
  assertBaselineSql(whole)
  return ownRecoverySql(whole)
}
async function assertLifetimePins() {
  assert.deepEqual(await captureFiles(sourceFiles), report.sourceSha256)
  assert.deepEqual(await captureFiles(bundleFiles), report.bundleSha256)
  assert.deepEqual(await treeManifest(provision.installed.workerRoot), installedTree)
  assert.deepEqual(await jsonFile(path.join(appDataRoot, 'qualification-runtime.json')), marker)
  assert.deepEqual(await jsonFile(path.join(appDataRoot, 'runtime/current-runtime.json')), pointer)
  assert.equal(await hashFile(fixture.provisionReport.path), fixture.provisionReport.sha256)
  assert.deepEqual(statIdentity(await regular(fixture.checkpoint.path)), modelStat)
  for (const file of baselinePackages) assert.equal(await hashFile(file.path), file.sha256)
  await assertRuntimeIdle(appDataRoot, provision.installed.basePrefix)
  if (mainDeathProfile) await assertMainDeathControls()
}
async function prepareMainDeathControls() {
  if (!mainDeathProfile) return
  const scratch = path.join(appDataRoot, 'scratch')
  await directory(scratch)
  const unmarkedRoot = path.join(
    scratch,
    `regional-request-${randomUUID().replaceAll('-', '').slice(0, 6)}`,
  )
  await mkdir(unmarkedRoot, { mode: 0o700 })
  const descriptors = [
    {
      path: path.join(unmarkedRoot, 'target.png'),
      bytes: Buffer.from('unmarked private legacy control'),
    },
    {
      path: path.join(scratch, `main-death-unrelated-${randomUUID()}.txt`),
      bytes: Buffer.from('unrelated scratch control'),
    },
  ]
  const files = []
  for (const item of descriptors) {
    await writeFile(item.path, item.bytes, { flag: 'wx', mode: 0o600 })
    files.push({
      path: item.path,
      sha256: digest(item.bytes),
      byteSize: item.bytes.length,
      inode: (await lstat(item.path)).ino,
    })
  }
  mainDeathControls = { unmarkedRoot, unmarkedInode: (await lstat(unmarkedRoot)).ino, files }
  report.mainDeathControls = mainDeathControls
  checkpoint()
}
async function assertMainDeathControls() {
  await directory(mainDeathControls.unmarkedRoot)
  assert.equal((await lstat(mainDeathControls.unmarkedRoot)).ino, mainDeathControls.unmarkedInode)
  await assertPathAbsent(path.join(mainDeathControls.unmarkedRoot, '.owner-v1.json'))
  for (const item of mainDeathControls.files) {
    const entry = await regular(item.path)
    assert.equal(entry.ino, item.inode)
    assert.equal(entry.nlink, 1)
    assert.equal(entry.size, item.byteSize)
    assert.equal(await hashFile(item.path), item.sha256)
  }
}
async function assertPathAbsent(file) {
  const entry = await lstat(file).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  assert.equal(entry, null, `Expected no retained pathname: ${file}`)
}
function assertRecoveryWire(wire, captured, project) {
  assert.equal(wire.type, 'execute-current-canvas-regional')
  assert.equal(wire.requestId, wire.bundleJson.request.requestId)
  assert.equal(wire.bundleJson.compositionProfile, 'invoke-canvas-v1')
  assert.equal(wire.bundleJson.layout, 'cfg-negative-first')
  for (const sign of ['Positive', 'Negative']) {
    assert.deepEqual(wire.bundleJson[`global${sign}Coverage`], { kind: 'everywhere' })
    assert.equal(wire.bundleJson[`${sign.toLowerCase()}PooledSourceId`], 'current-canvas')
  }
  assert.deepEqual(wire.bundleJson.request.job.bbox, bbox)
  assert.equal(wire.bundleJson.request.job.sampling.steps, 30)
  assert.equal(wire.bundleJson.request.job.sampling.seed, 123)
  assert.equal(wire.bundleJson.request.job.sampling.cfgScale, 5)
  assert.deepEqual(wire.bundleJson.request.job.sampling.noiseProfile, policy)
  assert.equal(wire.bundleJson.request.job.checkpoint.sha256, fixture.checkpoint.sha256)
  assert.equal(wire.target.sha256, captured.targetSha256)
  assert.equal(wire.target.observedSha256, captured.targetSha256)
  assert.deepEqual(
    wire.alpha.map(({ sha256 }) => sha256),
    project.regionAlphas,
  )
  assert.deepEqual(
    wire.bundleJson.recipe.regions.map(({ regionId }) => regionId),
    project.document.regionalGuidance.map(({ id }) => id),
  )
  if (mainDeathProfile) {
    assert.equal(wire.ownerMarker.value.main.pid, wire.ownerMarker.capturedMainPid)
    assert.equal(wire.ownerMarker.value.worker.pid, wire.pid)
    assert.equal(wire.ownerMarker.value.kind, 'regional-transport-owner-v1')
  }
}
async function originalIpcFinished(channel, expectedCount = 1) {
  await expect
    .poll(
      async () => {
        const calls = (await observerSnapshot()).ipc.filter((call) => call.channel === channel)
        assert.ok(calls.length <= expectedCount)
        for (const call of calls)
          if (call.finished) assert.equal(call.ok, true, JSON.stringify(call))
        return (
          calls.length === expectedCount &&
          calls.every(({ finished, ok }) => finished && ok === true)
        )
      },
      { timeout: timeout(180_000) },
    )
    .toBe(true)
}
async function originalRegionalWire(id, captured) {
  let evidence
  await expect
    .poll(
      async () => {
        const row = await job(id)
        if (row.status === 'pending') return false
        assert.equal(
          row.status,
          'running',
          `The native interruption cut was missed: ${row.status}: ${row.error_message}`,
        )
        const sql = await recoverySql()
        assert.equal(
          sql.receipts.some(({ queue_item_id }) => queue_item_id === id),
          false,
        )
        const observed = await observerSnapshot()
        assert.deepEqual(observed.faults, [])
        const wires = regionalWires(observed)
        assert.ok(wires.length <= 1)
        if (wires.length !== 1) return false
        assertRecoveryWire(wires[0], captured, recoveryProject)
        const worker = observed.workers.find(({ pid }) => pid === wires[0].pid)
        assert.ok(worker?.identity)
        const guarded = worker.ready?.capabilities?.includes('linux-owned-inference-v1') === true
        assert.ok(
          worker.args.includes(
            guarded ? 'imagegen_worker.owned_inference' : 'imagegen_worker.inference_main',
          ),
        )
        if (mainDeathProfile) assert.equal(guarded, true)
        for (const write of worker.writes) {
          assert.equal(write.originalCalls, 1)
          assert.equal(write.receiverMatches, true)
          assert.equal(write.thrown, undefined)
        }
        assert.equal(worker.exit, null)
        evidence = { row, wire: wires[0], worker: structuredClone(worker) }
        return true
      },
      { timeout: timeout(240_000), intervals: [100, 250, 500] },
    )
    .toBe(true)
  return evidence
}
async function readProcessIdentity(pid) {
  const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
  const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  assert.match(start, /^\d+$/)
  const group = (await readFile(`/proc/${pid}/cgroup`, 'utf8'))
    .trim()
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3)
  assert.ok(group?.startsWith('/') && group !== '/')
  return { pid, start, group }
}
async function ownedGpuRows(pid) {
  assert.ok(Number.isSafeInteger(pid) && pid > 1)
  const { stdout } = await exec(
    'nvidia-smi',
    ['--query-compute-apps=pid,used_gpu_memory', '--format=csv,noheader,nounits'],
    { timeout: timeout(10_000), maxBuffer: 64 * 1024 },
  )
  const rows = []
  for (const line of stdout.split('\n')) {
    const fields = line.split(',').map((value) => value.trim())
    if (fields[0] !== String(pid)) continue
    assert.equal(fields.length, 2)
    assert.match(fields[1], /^\d+$/)
    const usedGpuMemoryMiB = Number(fields[1])
    assert.ok(Number.isSafeInteger(usedGpuMemoryMiB))
    rows.push({ pid, usedGpuMemoryMiB })
  }
  return rows
}
/** Deliberate failure only: never invokes native.close or any production cancellation action. */
async function crashNative(label, beforeSignal, afterExit, activeWorker = null) {
  assert.ok(recoveryProfile && activeLifetime && application)
  clearInterval(sampler)
  await sampling
  const nativeProcess = application.process()
  await beforeSignal()
  const observed = await retainObservers(true)
  assert.deepEqual(observed.faults, [])
  await database.close()
  database = null
  // Re-read actual bounds after removing the diagnostic connection; never reuse a previous life.
  await bounds(`${label}-before-signal`, mainDeathProfile)
  const bounded = nativeChecks.findLast(({ processIdentities }) =>
    processIdentities.some(({ pid }) => pid === nativeProcess.pid),
  )
  const identity = bounded?.processIdentities.find(({ pid }) => pid === nativeProcess.pid)
  const scope = bounded?.groups.find(
    ({ ownedScope, pids }) => ownedScope && pids.includes(nativeProcess.pid),
  )
  assert.ok(identity && scope, 'Fault requires the exact owned PID-named Electron scope')
  assert.deepEqual(await readProcessIdentity(nativeProcess.pid), {
    ...identity,
    group: scope.group,
  })
  if (activeWorker) {
    assert.deepEqual(
      await readProcessIdentity(activeWorker.pid),
      { pid: activeWorker.pid, start: activeWorker.identity.start, group: scope.group },
      'The original wire worker must still be alive in the owned crash scope',
    )
  }
  activeLifetime.crashCut = {
    label,
    main: identity,
    group: scope.group,
    activeWorker: activeWorker?.identity ?? null,
    at: new Date().toISOString(),
  }
  if (mainDeathProfile && activeWorker) {
    activeLifetime.crashCut.ownedGpu = {
      identity: activeWorker.identity,
      before: await ownedGpuRows(activeWorker.pid),
      beforeAt: new Date().toISOString(),
    }
  }
  checkpoint()
  const signaled = mainDeathProfile
    ? await signalQualificationMain({ ...identity, group: scope.group })
    : await stopExpiredQualificationProcess({ ...identity, group: scope.group })
  assert.equal(signaled.signalRequested, true)
  const exited = await confirmQualificationProcessExit(nativeChecks)
  assert.equal(exited.confirmed, true)
  if (mainDeathProfile && activeWorker) {
    activeLifetime.crashCut.ownedGpu.after = await ownedGpuRows(activeWorker.pid)
    activeLifetime.crashCut.ownedGpu.afterAt = new Date().toISOString()
    assert.deepEqual(activeLifetime.crashCut.ownedGpu.after, [])
  }
  assert.equal(nativeProcess.signalCode, 'SIGKILL')
  const closure = {
    label,
    intentional: true,
    ...(mainDeathProfile ? { mainOnly: true, scopeProof: scope.scopeProof } : {}),
    ...exited,
    signal: signaled,
    processExitCode: nativeProcess.exitCode,
    signalCode: nativeProcess.signalCode,
  }
  report.nativeClosures.push(closure)
  activeLifetime.closure = closure
  activeLifetime.resourceChecks = structuredClone(nativeChecks)
  activeLifetime.finishedAt = new Date().toISOString()
  application = null
  window = null
  nativeChecks.length = 0
  memoryGroups.clear()
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  try {
    await afterExit()
  } finally {
    await database.close()
    database = null
  }
  await assertLifetimePins()
  checkpoint()
}
async function editAndSaveRecoveryDraft(project) {
  const steps = window.locator('input[aria-label="Steps"]')
  await steps.fill('2')
  await steps.press('Enter')
  const seed = window.locator('input[aria-label="Generation seed"]')
  await seed.fill('124')
  await seed.press('Enter')
  for (const region of project.document.regionalGuidance)
    await window
      .locator(`[data-regional-guidance-id="${region.id}"]`)
      .getByRole('button', { name: `Hide ${region.name}`, exact: true })
      .click()
  await expect
    .poll(
      async () => {
        const tab = await current(project)
        return {
          steps: tab.generationDraft.sampling.steps,
          seed: tab.generationDraft.seed,
          enabled: tab.regionalGuidance.map(({ enabled }) => enabled),
        }
      },
      { timeout: timeout() },
    )
    .toEqual({ steps: 2, seed: { policy: 'fixed', value: 124 }, enabled: [false, false] })
  await save(project)
  await originalIpcFinished('projects:save')
  const tab = await current(project)
  assert.equal(tab.dirty, false)
  assert.deepEqual(tab.layers, [])
  const packageSha256 = await hashFile(project.file)
  report.currentAuthoringAfterEdit = {
    generationDraft: tab.generationDraft,
    regionalGuidance: portableRegions(tab),
    packageSha256,
  }
  await screenshot('recovery-edited-saved-current-draft')
  return { tab, packageSha256 }
}
async function captureRecoveryCandidate(project, completed) {
  await expect
    .poll(async () => (await api('listGenerationResults', project.id)).candidates.length, {
      timeout: timeout(120_000),
    })
    .toBe(1)
  const snapshot = await api('listGenerationResults', project.id),
    candidate = snapshot.candidates[0]
  assert.equal(candidate.queueItemId, completed.row.id)
  assert.equal(candidate.actualSeed, 123)
  assert.equal(candidate.sourceDocumentMismatch, false)
  assert.equal(snapshot.lastActualSeed, 123)
  assert.deepEqual(snapshot.unfinishedSiblingJobIds, [])
  const bytes = await fetchPng(candidate.imageUrl),
    decoded = decodePng(bytes)
  assert.equal(digest(bytes), completed.receipt.image_sha256)
  assert.equal(bytes.length, completed.receipt.image_byte_size)
  assert.equal(decoded.width, 1024)
  assert.equal(decoded.height, 1024)
  assert.equal(decoded.channels, 3)
  assert.equal(decoded.iccSha256, IGS_SRGB_ICC_SHA256)
  assert.equal((await browserDecode(candidate.imageUrl)).rgbaSha256, decoded.rgbaSha256)
  return {
    candidate,
    bytes,
    rgbaSha256: decoded.rgbaSha256,
    receipt: completed.receipt,
    cursor: (await recoverySql()).cursors[0],
  }
}
function stableCandidate(candidate) {
  const value = structuredClone(candidate)
  delete value.imageUrl
  delete value.thumbnailUrl
  return value
}
async function recoveryThreeLifetimes() {
  const project = projects.find(({ mode }) => mode === 'transparent')
  recoveryProject = project
  await openProject(project)
  assert.deepEqual(await recoverySql(), { queue: [], receipts: [], cursors: [] })
  const count = window.locator('input[aria-label="Images per click"]')
  await count.fill('1')
  await count.press('Enter')
  await expect(count).toHaveValue('1')
  await expect(window.locator('input[aria-label="Steps"]')).toHaveValue('30')
  await expect(window.locator('input[aria-label="Generation seed"]')).toHaveValue('123')
  const generate = window.getByRole('button', { name: 'Generate', exact: true })
  await expect(generate).toBeEnabled({ timeout: timeout(120_000) })
  await generate.click()
  await expect
    .poll(async () => (await recoverySql()).queue.length, { timeout: timeout(180_000) })
    .toBe(1)
  const first = (await recoverySql()).queue[0],
    captured = await captureFrozen(first, project)
  const dispatch = await originalRegionalWire(first.id, captured)
  await originalIpcFinished('projects:generate')
  report.recovery = {
    interrupted: captured,
    activeWire: dispatch,
    initialPackageSha256: project.initialPackageSha256,
  }
  if (mainDeathProfile) {
    previousTransport = {
      path: dispatch.wire.stagingRoot,
      markerSha256: dispatch.wire.ownerMarker.sha256,
      marker: dispatch.wire.ownerMarker.value,
    }
    report.previousTransport = previousTransport
    assert.equal(
      await hashFile(path.join(previousTransport.path, '.owner-v1.json')),
      previousTransport.markerSha256,
    )
  }
  await crashNative(
    mainDeathProfile ? 'lifetime-1-main-only-crash' : 'lifetime-1-active-regional-crash',
    async () => {
      const sql = await recoverySql()
      assert.equal(sql.queue.length, 1)
      assert.equal(sql.queue[0].status, 'running')
      assert.deepEqual(sql.receipts, [])
      assert.deepEqual(sql.cursors, [])
      assert.equal(await hashFile(project.file), project.initialPackageSha256)
    },
    async () => {
      const sql = await recoverySql()
      assert.equal(
        sql.queue[0].status,
        'running',
        'A completed or canceled pre-signal row is a missed crash cut',
      )
      assert.equal(sql.queue[0].frozen_payload_json, first.frozen_payload_json)
      assert.deepEqual(sql.receipts, [])
      assert.deepEqual(sql.cursors, [])
      report.recovery.afterActiveCrash = sql
      if (mainDeathProfile) {
        await directory(previousTransport.path)
        assert.equal(
          await hashFile(path.join(previousTransport.path, '.owner-v1.json')),
          previousTransport.markerSha256,
        )
      }
    },
    dispatch.worker,
  )
  check(
    mainDeathProfile
      ? 'First real regional wire interrupted by verified Main-only pidfd SIGKILL; Python/all observed processes exited without child or scope signals'
      : 'First real regional wire interrupted by exact owned-scope SIGKILL; no receipt/cursor/Save and independent physical exit confirmed',
  )

  await launch()
  const restarted = await recoverySql()
  assert.equal(restarted.queue.length, 1)
  const canceled = restarted.queue[0]
  assert.equal(canceled.status, 'canceled')
  assert.equal(canceled.error_code, 'APP_RESTART')
  assert.equal(canceled.status_sequence, dispatch.row.status_sequence + 1)
  assert.equal(canceled.frozen_payload_json, first.frozen_payload_json)
  assert.deepEqual(restarted.receipts, [])
  assert.deepEqual(restarted.cursors, [])
  assert.equal(
    regionalWires(await observerSnapshot()).length,
    0,
    'Startup never automatically resumes interrupted regional work',
  )
  await openProject(project)
  await expect(window.getByRole('dialog', { name: 'Recovery available', exact: true })).toHaveCount(
    0,
  )
  assert.equal(await hashFile(project.file), project.initialPackageSha256)
  const edited = await editAndSaveRecoveryDraft(project)
  await openQueue()
  await expect(queueRow(first.id)).toContainText('Canceled')
  await expect(queueRow(first.id)).toContainText('Seed 123')
  await queueRow(first.id).getByRole('button', { name: 'Retry job', exact: true }).click()
  await originalIpcFinished('projects:retry-generation-job')
  await expect
    .poll(async () => (await recoverySql()).queue.length, { timeout: timeout(180_000) })
    .toBe(2)
  const retried = (await recoverySql()).queue.find(({ id }) => id !== first.id)
  assert.equal(retried.operation, 'illustrious-regional-txt2img')
  assert.equal(retried.frozen_payload_json, first.frozen_payload_json)
  const retryCaptured = await captureFrozen(retried, project)
  assert.equal(retryCaptured.frozenPayloadSha256, captured.frozenPayloadSha256)
  assert.equal(retryCaptured.targetSha256, captured.targetSha256)
  report.retry = {
    firstJobId: first.id,
    retryJobId: retried.id,
    originalFrozen: captured,
    retryFrozen: retryCaptured,
  }
  await closeQueue()
  await expect
    .poll(
      async () => {
        const row = await job(retried.id)
        if (['failed', 'canceled'].includes(row.status))
          assert.fail(`Frozen regional Retry failed: ${row.error_code}: ${row.error_message}`)
        return row.status
      },
      { timeout: timeout(900_000), intervals: [250, 500, 1000] },
    )
    .toBe('completed')
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).phase, {
      timeout: timeout(120_000),
    })
    .toBe('idle')
  const completedSql = await recoverySql()
  assert.equal(completedSql.queue.length, 2)
  assert.equal(completedSql.receipts.length, 1)
  assert.equal(completedSql.cursors.length, 1)
  assert.equal(
    completedSql.queue.find(({ id }) => id === first.id).status_sequence,
    canceled.status_sequence + 1,
  )
  const receipt = completedSql.receipts[0]
  assert.equal(receipt.status, 'completed')
  assert.equal(receipt.queue_item_id, retried.id)
  assert.equal(receipt.actual_seed, 123)
  assert.equal(receipt.frozen_payload_sha256, captured.frozenPayloadSha256)
  const completed = {
    row: await job(retried.id),
    receipt,
    frozen: captured.frozen,
    edited: edited.tab,
  }
  const survivor = await captureRecoveryCandidate(project, completed)
  assert.equal(survivor.cursor.actual_seed, 123)
  assert.equal(
    await hashFile(project.file),
    edited.packageSha256,
    'Completion must not Save or accept the surviving candidate',
  )
  assert.equal((await current(project)).dirty, false)
  assert.deepEqual((await current(project)).layers, [])
  const secondObserved = await observerSnapshot(),
    secondWires = regionalWires(secondObserved)
  if (mainDeathProfile) {
    const ready = secondObserved.workers.filter(({ startupRecovery }) => startupRecovery)
    assert.ok(ready.length > 0, 'The next actual owned worker Ready must be witnessed')
    assert.ok(
      ready.every(
        ({ startupRecovery }) =>
          startupRecovery.previousAbsent &&
          startupRecovery.previousDirectoryInodeAbsent &&
          startupRecovery.previousTransport === previousTransport.path,
      ),
    )
    await assertPathAbsent(previousTransport.path)
    await assertMainDeathControls()
    report.automaticLeaseRecovery = {
      previousTransport,
      ready: ready.map(({ pid, ready, startupRecovery }) => ({ pid, ready, startupRecovery })),
    }
    // This lease has now been witnessed absent before Ready. Later lifetimes retain this
    // report, rather than incorrectly demanding the already-reclaimed lease exist again.
    previousTransport = null
  }
  assert.equal(secondWires.length, 1)
  assertRecoveryWire(secondWires[0], captured, project)
  assert.notEqual(secondWires[0].requestId, dispatch.wire.requestId)
  let successfulWorker
  await expect
    .poll(
      async () => {
        const observed = await observerSnapshot()
        assert.deepEqual(observed.faults, [])
        successfulWorker = observed.workers.find(({ pid }) => pid === secondWires[0].pid)
        assert.ok(successfulWorker?.identity)
        return successfulWorker.exit !== null && successfulWorker.close !== null
      },
      { timeout: timeout() },
    )
    .toBe(true)
  const successfulWorkerExit = await confirmQualificationProcessExit([
    {
      processIdentities: [{ pid: successfulWorker.pid, start: successfulWorker.identity.start }],
      groups: [],
    },
  ])
  assert.equal(successfulWorkerExit.confirmed, true)
  report.recovery.successfulExecutionExitBeforeSecondCrash = {
    identity: successfulWorker.identity,
    exit: successfulWorker.exit,
    close: successfulWorker.close,
    physicalExit: successfulWorkerExit,
  }
  report.recovery.survivor = {
    candidate: stableCandidate(survivor.candidate),
    pngSha256: digest(survivor.bytes),
    byteSize: survivor.bytes.length,
    rgbaSha256: survivor.rgbaSha256,
    receipt: survivor.receipt,
    cursor: survivor.cursor,
    packageSha256: edited.packageSha256,
  }
  await screenshot('recovery-unaccepted-before-second-crash')
  await crashNative(
    mainDeathProfile
      ? 'lifetime-2-main-only-candidate-crash'
      : 'lifetime-2-unaccepted-candidate-crash',
    async () => {
      assert.deepEqual(await recoverySql(), completedSql)
      assert.equal((await api('listGenerationResults', project.id)).candidates.length, 1)
      assert.equal(await hashFile(project.file), edited.packageSha256)
    },
    async () => {
      assert.deepEqual(await recoverySql(), completedSql)
      assert.equal(await hashFile(project.file), edited.packageSha256)
    },
  )
  check(
    'Startup APP_RESTART and explicit frozen UI Retry preserve original 30-step/123 recipe after edited Save; completed candidate retained through a second physical crash',
  )

  await launch()
  assert.deepEqual(await recoverySql(), completedSql)
  assert.equal(regionalWires(await observerSnapshot()).length, 0)
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
  const recovery = window.getByRole('dialog', { name: 'Recovery available', exact: true })
  await expect(recovery).toBeVisible({ timeout: timeout() })
  await recovery.getByRole('button', { name: 'Recover', exact: true }).click()
  await originalIpcFinished('projects:resolve-recovery')
  await expect(recovery).toHaveCount(0)
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toBeVisible()
  await expect(window.locator('input[aria-label="Images per click"]')).toBeEnabled({
    timeout: timeout(),
  })
  const recovered = await current(project)
  assert.equal(recovered.dirty, false)
  assert.deepEqual(recovered.layers, [])
  assert.deepEqual(recovered.generationDraft, edited.tab.generationDraft)
  assert.deepEqual(portableRegions(recovered), portableRegions(edited.tab))
  assert.deepEqual(recovered.primaryBbox, bbox)
  assert.equal(
    await hashFile(project.file),
    edited.packageSha256,
    'Home Recover must not Save the portable Project',
  )
  const restored = await captureRecoveryCandidate(project, completed)
  assert.deepEqual(stableCandidate(restored.candidate), stableCandidate(survivor.candidate))
  assert.equal(restored.bytes.equals(survivor.bytes), true)
  assert.equal(restored.rgbaSha256, survivor.rgbaSha256)
  assert.deepEqual(restored.receipt, survivor.receipt)
  assert.deepEqual(restored.cursor, survivor.cursor)
  assert.deepEqual(await recoverySql(), completedSql)
  await screenshot('recovery-surviving-results')
  check(
    'Third lifetime real Home Recover preserves exact temporary candidate/receipt/cursor and saved edited authoring without auto-resume, acceptance or Save',
  )
  await resultsAddSaveReopen(project, completed)
}

async function assertRecoveryActions() {
  const currentObserved = await retainObservers(false)
  const observed = [...report.lifetimes.map(({ observers }) => observers), currentObserved]
  assert.equal(observed.length, 3)
  const calls = observed.flatMap(({ ipc }) => ipc),
    wires = observed.flatMap(regionalWires)
  for (const value of observed) assert.deepEqual(value.faults, [])
  for (const call of calls) {
    assert.equal(call.originalCalls, 1)
    assert.equal(call.finished, true, `Unfinished original IPC: ${call.channel}`)
    assert.equal(call.ok, true, JSON.stringify(call))
  }
  const expected = {
    'projects:generate': 1,
    'projects:retry-generation-job': 1,
    'projects:accept-generation-candidates': 1,
    'projects:undo': 1,
    'projects:redo': 1,
    'projects:save': 2,
    'projects:resolve-recovery': 1,
    'projects:cancel-current-generation': 0,
    'projects:cancel-generation-job': 0,
  }
  for (const [channel, count] of Object.entries(expected))
    assert.equal(
      calls.filter((call) => call.channel === channel).length,
      count,
      `Unexpected original UI ${channel} count`,
    )
  const generated = calls.find(({ channel }) => channel === 'projects:generate')
  assert.deepEqual(generated.args[1], {
    documentId: recoveryProject.document.documentId,
    iterations: 1,
  })
  assert.equal(
    calls.find(({ channel }) => channel === 'projects:retry-generation-job').args[0].id,
    report.retry.firstJobId,
  )
  assert.deepEqual(calls.find(({ channel }) => channel === 'projects:resolve-recovery').args, [
    recoveryProject.id,
    'recover',
  ])
  assert.equal(wires.length, 2)
  assert.equal(new Set(wires.map(({ requestId }) => requestId)).size, 2)
  for (const wire of wires) assertRecoveryWire(wire, report.retry.originalFrozen, recoveryProject)
  const ordinary = observed
    .flatMap(({ workers }) => workers.flatMap(({ writes }) => writes.flatMap(({ lines }) => lines)))
    .filter(({ type }) => type === 'generate-illustrious-txt2img')
  assert.deepEqual(ordinary, [])
  const sql = await recoverySql()
  assert.equal(sql.queue.length, 2)
  assert.equal(sql.receipts.length, 1)
  assert.equal(sql.cursors.length, 1)
  report.nativeAccounting = {
    regionalWireCount: 2,
    completedReceiptCount: 1,
    canceledSqlCount: 1,
    intentionalScopeCrashes: mainDeathProfile ? 0 : 2,
    ...(mainDeathProfile
      ? {
          intentionalMainOnlyCrashes: 2,
          fallbackChildOrScopeSignals: report.fallbackSignals.length,
        }
      : {}),
    lifetimeCount: 3,
    workerSpawnCountWholeRun: observed.reduce((sum, value) => sum + value.workers.length, 0),
    stepCounterQualified: false,
  }
  if (mainDeathProfile) assert.deepEqual(report.fallbackSignals, [])
  check(
    'Three real UI lifetimes retain prior pool and exact frozen request/candidate through two physical crashes, one explicit Retry and one explicit Recover',
    report.nativeAccounting,
  )
}

async function fetchPng(url) {
  const response = await application.evaluate(async ({ net }, url) => {
    const response = await net.fetch(url)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > 32 * 1024 ** 2)
      throw new Error('Signed image exceeds qualification bound')
    return { status: response.status, bytes: Array.from(bytes) }
  }, url)
  assert.equal(response.status, 200)
  return Buffer.from(response.bytes)
}
async function browserDecode(url) {
  return await window.evaluate(async (url) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = url
    await image.decode()
    if (image.naturalWidth !== 1024 || image.naturalHeight !== 1024)
      throw new Error('Browser decoded unexpected image size')
    const bitmap = document.createElement('canvas')
    bitmap.width = image.naturalWidth
    bitmap.height = image.naturalHeight
    const context = bitmap.getContext('2d', { willReadFrequently: true })
    context.drawImage(image, 0, 0)
    const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', rgba))]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
    return { width: image.naturalWidth, height: image.naturalHeight, rgbaSha256: sha256 }
  }, url)
}
async function observeCanvas(label, decoded, imageUrl) {
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true', {
    timeout: timeout(),
  })
  let samples
  await expect
    .poll(
      async () => {
        samples = await canvas()
          .locator('.canvas-area')
          .evaluate(
            async (host, { bbox, imageUrl }) => {
              const bitmap = host.querySelector('.konvajs-content canvas')
              if (!(bitmap instanceof HTMLCanvasElement))
                throw new Error('Actual Konva scene is absent')
              const rect = bitmap.getBoundingClientRect()
              const camera = {
                x: Number(host.dataset.cameraX),
                y: Number(host.dataset.cameraY),
                scale: Number(host.dataset.cameraScale),
              }
              const image = new Image()
              image.crossOrigin = 'anonymous'
              image.src = imageUrl
              await image.decode()
              const reference = document.createElement('canvas')
              reference.width = bitmap.width
              reference.height = bitmap.height
              const context = reference.getContext('2d', { willReadFrequently: true })
              context.scale(bitmap.width / rect.width, bitmap.height / rect.height)
              context.translate(camera.x, camera.y)
              context.scale(camera.scale, camera.scale)
              context.drawImage(image, bbox.x, bbox.y, bbox.width, bbox.height)
              return {
                camera,
                bitmap: { width: bitmap.width, height: bitmap.height },
                samples: [256, 512, 768].map((position) => {
                  const x =
                    ((camera.x + (bbox.x + position) * camera.scale) * bitmap.width) / rect.width
                  const y =
                    ((camera.y + (bbox.y + 512) * camera.scale) * bitmap.height) / rect.height
                  if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height)
                    throw new Error('Frozen world location is outside actual Canvas')
                  const actual = Array.from(
                    bitmap.getContext('2d').getImageData(Math.floor(x), Math.floor(y), 1, 1).data,
                  )
                  const expected = Array.from(
                    context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data,
                  )
                  return {
                    world: { x: bbox.x + position, y: bbox.y + 512 },
                    rgba: actual,
                    independentlyRenderedRgba: expected,
                    maxChannelDifference: Math.max(
                      ...actual.map((value, index) => Math.abs(value - expected[index])),
                    ),
                  }
                }),
              }
            },
            { bbox, imageUrl },
          )
        return Math.max(...samples.samples.map(({ maxChannelDifference }) => maxChannelDifference))
      },
      { timeout: timeout(), intervals: [100, 250, 500] },
    )
    .toBeLessThanOrEqual(8)
  for (const sample of samples.samples) {
    assert.equal(sample.rgba[3], 255)
    const offset = ((sample.world.y - bbox.y) * 1024 + sample.world.x - bbox.x) * 4
    sample.rawOutputNeighbor = [...decoded.rgba.subarray(offset, offset + 4)]
  }
  // An independent browser draw at the observed zoom verifies consumer delivery, not image quality.
  report.canvasObservations ??= []
  report.canvasObservations.push({ label, ...samples })
  await screenshot(label)
}

/** Independent bounded ZIP consumer: verifies the bytes that explicit Save actually persisted. */
async function readZip(file) {
  const zip = await new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (error, zip) =>
      error ? reject(error) : resolve(zip),
    ),
  )
  const members = new Map()
  let total = 0,
    entries = 0
  await new Promise((resolve, reject) => {
    zip.on('error', reject)
    zip.on('end', resolve)
    zip.on('entry', (entry) => {
      try {
        assert.ok(++entries <= 10_000)
        assert.ok(
          !path.posix.isAbsolute(entry.fileName) &&
            !entry.fileName.split('/').includes('..') &&
            !entry.fileName.includes('\\'),
        )
        if (entry.fileName.endsWith('/')) {
          zip.readEntry()
          return
        }
        assert.equal(members.has(entry.fileName), false)
        assert.ok(entry.uncompressedSize <= 32 * 1024 ** 2)
        total += entry.uncompressedSize
        assert.ok(total <= 64 * 1024 ** 2)
        zip.openReadStream(entry, (error, stream) => {
          if (error) {
            reject(error)
            return
          }
          const chunks = []
          let size = 0
          stream.on('error', reject)
          stream.on('data', (bytes) => {
            size += bytes.length
            if (size > entry.uncompressedSize) {
              stream.destroy(new Error('ZIP member exceeds declared size'))
              return
            }
            chunks.push(bytes)
          })
          stream.on('end', () => {
            try {
              assert.equal(size, entry.uncompressedSize)
              members.set(entry.fileName, Buffer.concat(chunks))
              zip.readEntry()
            } catch (error) {
              reject(error)
            }
          })
        })
      } catch (error) {
        reject(error)
      }
    })
    zip.readEntry()
  })
  assert.ok(members.has('project.json'))
  return { project: JSON.parse(members.get('project.json').toString('utf8')), members }
}
function assertBaseProvenance(provenance, candidate, frozen) {
  assert.equal(provenance.schemaVersion, 1)
  assert.equal(provenance.kind, 'illustrious-txt2img')
  assert.equal(provenance.executionResultContext.candidateId, candidate.candidateId)
  assert.equal(provenance.executionResultContext.queueItemId, candidate.queueItemId)
  assert.equal(provenance.executionResultContext.output.sha256, candidate.pngSha256)
  assert.deepEqual(provenance.executionResultContext.output, {
    byteSize: candidate.byteSize,
    colorSpace: 'srgb',
    format: 'png',
    height: 1024,
    width: 1024,
    iccSha256: IGS_SRGB_ICC_SHA256,
    sha256: candidate.pngSha256,
  })
  assert.equal(provenance.layerSourceContext.sourceDocumentId, frozen.context.documentId)
  assert.equal(
    provenance.layerSourceContext.sourceDocumentRevision,
    frozen.context.documentRevision,
  )
  assert.equal(provenance.layerSourceContext.sourceTargetSha256, frozen.workerJob.target.sha256)
  assert.deepEqual(provenance.layerSourceContext.bbox, bbox)
  const config = provenance.generationConfiguration
  assert.deepEqual(config, {
    cfgRescale: 0,
    loras: [],
    mode: 'txt2img',
    model: {
      kind: 'checkpoint',
      baseModelFamily: 'illustrious',
      civitaiFileId: fixture.checkpoint.civitaiFileId,
      civitaiModelId: fixture.checkpoint.civitaiModelId,
      civitaiVersionId: fixture.checkpoint.civitaiVersionId,
      displayName: fixture.checkpoint.modelName,
      versionName: fixture.checkpoint.versionName,
      fileSha256: fixture.checkpoint.sha256,
      localModelId: model.resourceId,
      localVersionId: model.versionId,
      predictionType: 'epsilon',
    },
    negativePrompt: { text: '', embeddingRefs: [] },
    positivePrompt: { text: globalPrompt, embeddingRefs: [] },
    sampling: {
      actualSeed: 123,
      cfgScale: 5,
      invokeScheduler: 'euler',
      noiseProfile: policy,
      requestedSeedPolicy: 'fixed',
      sampler: 'Euler',
      scheduler: 'Normal',
      steps: 30,
    },
    size: { height: 1024, width: 1024 },
    vae: null,
    vaePrecision: 'FP16',
  })
  assert.equal(config.positivePrompt.text, globalPrompt)
  assert.equal(config.negativePrompt.text, '')
  assert.equal(config.sampling.actualSeed, 123)
  assert.equal(config.sampling.steps, 30)
  assert.equal(config.sampling.cfgScale, 5)
  assert.deepEqual(config.sampling.noiseProfile, policy)
  assert.equal(config.vaePrecision, 'FP16')
  assert.equal(config.vae, null)
  assert.equal(config.model.fileSha256, fixture.checkpoint.sha256)
  const json = JSON.stringify(provenance)
  for (const forbidden of [
    'regional',
    'invoke-canvas-v1',
    'alpha8',
    'maskId',
    'regionId',
    'compositionProfile',
    fixture.checkpoint.path,
    appDataRoot,
    ...localPrompts,
  ])
    assert.equal(
      json.includes(forbidden),
      false,
      `Portable accepted base provenance leaks ${forbidden}`,
    )
}
function portableRegions(tab) {
  return (tab.regionalGuidance ?? []).map((value) => {
    const region = structuredClone(value)
    delete region.maskImageUrl
    return region
  })
}
function assertRasterGeometry(layer, portable = false) {
  if (portable) {
    assert.equal(layer.kind, 'raster')
  } else {
    // ProjectRasterLayerView exposes source roles; only the portable layer has a kind.
    assert.equal(layer.kind, undefined)
    assert.equal(layer.resultComparisonSourceKind, 'raster')
    assert.equal(layer.resultPresetSourceKind, 'raster')
  }
  assert.deepEqual(layer.transform, { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -13, y: 5 })
  const image = portable ? layer.asset : layer
  assert.equal(image.width, 1024)
  assert.equal(image.height, 1024)
  assert.equal(layer.opacity, 1)
  assert.equal(layer.blendMode, 'normal')
  assert.equal(layer.visible, true)
  assert.equal(layer.locked, false)
  if (portable) {
    assert.equal(layer.asset.sha256, report.output.pngSha256)
    assert.equal(layer.asset.bytes, report.output.byteSize)
  }
}
async function resultsAddSaveReopen(project, completed) {
  await expect
    .poll(async () => (await api('listGenerationResults', project.id)).candidates.length, {
      timeout: timeout(120_000),
    })
    .toBe(1)
  const results = await api('listGenerationResults', project.id),
    candidate = results.candidates[0]
  assert.equal(candidate.queueItemId, completed.row.id)
  assert.equal(candidate.actualSeed, 123)
  assert.equal(candidate.sourceDocumentMismatch, false)
  assert.deepEqual(candidate.bbox, bbox)
  assert.equal(results.lastActualSeed, 123)
  assert.deepEqual(results.unfinishedSiblingJobIds, [])
  await tray().getByRole('button', { name: 'Preview candidate 1', exact: true }).click()
  await expect(
    tray().getByRole('button', { name: 'Preview candidate 1', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  const bytes = await fetchPng(candidate.imageUrl),
    decoded = decodePng(bytes)
  assert.equal(decoded.width, 1024)
  assert.equal(decoded.height, 1024)
  assert.equal(decoded.channels, 3)
  assert.equal(decoded.iccSha256, IGS_SRGB_ICC_SHA256)
  assert.equal(digest(bytes), completed.receipt.image_sha256)
  assert.equal(bytes.length, completed.receipt.image_byte_size)
  for (let i = 3; i < decoded.rgba.length; i += 4) assert.equal(decoded.rgba[i], 255)
  const rendered = await browserDecode(candidate.imageUrl)
  assert.equal(rendered.rgbaSha256, decoded.rgbaSha256)
  await writeFile(path.join(evidenceRoot, 'regional-output.png'), bytes, {
    flag: 'wx',
    mode: 0o600,
  })
  report.output = {
    ...candidate,
    pngSha256: digest(bytes),
    byteSize: bytes.length,
    rgbaSha256: decoded.rgbaSha256,
    iccSha256: decoded.iccSha256,
    browser: rendered,
  }
  await observeCanvas('results-preview', decoded, candidate.imageUrl)
  const before = await current(project),
    packageBefore = await hashFile(project.file)
  assert.equal(before.dirty, false)
  assert.equal(before.layers.length, 0)
  await tray().getByRole('checkbox', { name: 'Select candidate 1', exact: true }).check()
  await tray().getByRole('button', { name: 'Add 1 as Layer', exact: true }).click()
  await expect
    .poll(
      async () => {
        const calls = (await observerSnapshot()).ipc.filter(
          ({ channel }) => channel === 'projects:accept-generation-candidates',
        )
        assert.ok(calls.length <= 1)
        return calls.length === 1 && calls[0].finished && calls[0].ok === true
      },
      { timeout: timeout() },
    )
    .toBe(true)
  await expect
    .poll(async () => (await current(project)).layers.length, { timeout: timeout() })
    .toBe(1)
  const added = await current(project),
    layer = added.layers[0]
  assertRasterGeometry(layer)
  assert.equal(added.dirty, true)
  assert.equal((await api('listGenerationResults', project.id)).candidates.length, 0)
  assert.equal(await hashFile(project.file), packageBefore, 'Add must not implicitly Save')
  assert.deepEqual(added.generationDraft, before.generationDraft)
  assert.deepEqual(portableRegions(added), portableRegions(before))
  assert.deepEqual(added.primaryBbox, before.primaryBbox)
  assert.equal((await fetchPng(layer.imageUrl)).equals(bytes), true)
  await canvas().getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await current(project)).layers.length).toBe(0)
  assert.deepEqual((await current(project)).generationDraft, before.generationDraft)
  assert.deepEqual(portableRegions(await current(project)), portableRegions(before))
  await canvas().getByRole('button', { name: 'Redo', exact: true }).click()
  await expect
    .poll(async () => (await current(project)).layers.map(({ id }) => id))
    .toEqual([layer.id])
  assertRasterGeometry((await current(project)).layers[0])
  assert.equal((await fetchPng((await current(project)).layers[0].imageUrl)).equals(bytes), true)
  assert.equal(await hashFile(project.file), packageBefore)
  await save(project)
  const saved = await readZip(project.file),
    accepted = saved.project.layers[0]
  assert.equal(saved.project.layers.length, 1)
  assert.equal(accepted.id, layer.id)
  assert.equal(accepted.kind, 'raster')
  assertRasterGeometry(accepted, true)
  assert.ok(
    saved.members.get(accepted.asset.path)?.equals(bytes),
    'Independent ZIP member bytes must equal signed result/Raster bytes',
  )
  assert.equal(accepted.asset.sha256, digest(bytes))
  assert.deepEqual(saved.project.generationDraft, before.generationDraft)
  // ProjectTab region views contain resource URLs; compare portable authoring against the saved draft.
  for (const [index, region] of saved.project.regionalGuidance.entries()) {
    assert.equal(region.enabled, false)
    assert.deepEqual(region.mask, project.document.regionalGuidance[index].mask)
    assert.deepEqual(region.prompts, project.document.regionalGuidance[index].prompts)
    assert.equal(digest(saved.members.get(region.mask.asset.path)), region.mask.asset.sha256)
  }
  assert.deepEqual(saved.project.regionalGuidance, portableRegions(before))
  assertBaseProvenance(accepted.generationProvenance, report.output, completed.frozen)
  assert.equal(saved.project.lastActualSeedSnapshot, 123)
  assert.deepEqual(
    await database.db
      .selectFrom('generation_acceptance_journal')
      .selectAll()
      .where('local_project_key', '=', project.id)
      .execute(),
    [],
  )
  report.accepted = {
    layerId: layer.id,
    asset: accepted.asset,
    provenance: accepted.generationProvenance,
    savedPackageSha256: await hashFile(project.file),
    zipMemberSha256: digest(saved.members.get(accepted.asset.path)),
    noImplicitSave: true,
    undoRedoSameLayer: true,
  }
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveCount(0)
  const reopened = await openProject(project)
  assert.equal(reopened.dirty, false)
  assert.equal(reopened.layers.length, 1)
  assert.equal(reopened.layers[0].id, layer.id)
  assertRasterGeometry(reopened.layers[0])
  assert.equal((await fetchPng(reopened.layers[0].imageUrl)).equals(bytes), true)
  assert.deepEqual(reopened.generationDraft, before.generationDraft)
  assert.deepEqual(portableRegions(reopened), portableRegions(before))
  await expect(
    window.getByRole('heading', { name: 'Image generation needs repair', exact: true }),
  ).toHaveCount(0)
  // The accepted Raster changes the real target; the preserved txt2img draft has no strength.
  assert.equal((await targetState(project)).mode, 'img2img')
  await expect(
    window.getByText('Set Denoising Strength before generating from this raster input.', {
      exact: true,
    }),
  ).toBeVisible({ timeout: timeout(120_000) })
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  await observeCanvas('saved-reopened-raster', decoded, reopened.layers[0].imageUrl)
  check(
    'Signed Results/browser PNG, actual preview, Raster Add/Undo/Redo and independently read Save ZIP/reopen preserve exact output and base-only provenance',
    { outputSha256: digest(bytes), layerId: layer.id },
  )
}

async function retainObservers(restore) {
  if (restore && recoveryProfile && activeLifetime?.observers) return activeLifetime.observers
  const observed = await observerSnapshot(restore)
  report.observers = observed
  assert.deepEqual(observed.faults, [])
  if (restore) {
    assert.equal(observed.restored, true)
    for (const worker of observed.workers) {
      assert.equal(worker.writeRestored, true)
      assert.equal(worker.stdoutRestored, true)
    }
  }
  const identities = observed.workers.map(({ identity }) => identity).filter(Boolean)
  for (const worker of observed.workers)
    assert.ok(worker.identity, `Observed worker lacks a physical PID/start identity: ${worker.pid}`)
  for (const identity of identities) {
    assert.match(identity.start, /^\d+$/)
    assert.ok(within(path.join(appDataRoot, 'runtime'), identity.executable))
  }
  if (identities.length)
    nativeChecks.push({
      processIdentities: identities.map(({ pid, start }) => ({ pid, start })),
      groups: [],
    })
  if (recoveryProfile && restore) {
    assert.ok(
      activeLifetime && !activeLifetime.observers,
      'Original slots can be restored only once per lifetime',
    )
    activeLifetime.observers = observed
    activeLifetime.runtime = report.actualRuntime
    activeLifetime.catalogVersion = report.actualCatalogVersion
    activeLifetime.resourceChecks = structuredClone(nativeChecks)
    report.lifetimes.push(activeLifetime)
  }
  checkpoint()
  return observed
}
async function fallbackOwnedScope(label) {
  assert.ok(mainDeathProfile)
  const proof = nativeChecks
    .flatMap(({ groups }) => groups)
    .findLast(({ scopeProof }) => scopeProof)?.scopeProof
  assert.ok(proof, 'Emergency cleanup requires the independently captured scope proof')
  const record = { label, scopeProof: proof, attemptedAt: new Date().toISOString() }
  report.fallbackSignals.push(record)
  checkpoint()
  try {
    record.result = await stopOwnedQualificationScope(proof)
    return record.result
  } catch (error) {
    record.error = String(error.stack ?? error)
    throw error
  } finally {
    checkpoint()
  }
}
async function closeNative(label) {
  if (!application) return
  if (closing) return await closing
  closing = (async () => {
    clearInterval(sampler)
    await sampling
    let originalError
    try {
      await bounds(`${label}-before-close`)
    } catch (error) {
      originalError = error
      report.finalBoundsError = String(error.stack ?? error)
    }
    try {
      await retainObservers(true)
    } catch (error) {
      originalError ??= error
      report.observerRestoreError = String(error.stack ?? error)
    }
    if (database) {
      await database.close()
      database = null
    }
    const native = application
    // Playwright disposes its channel during close; retain the original process handle.
    const nativeProcess = native.process()
    let closeTimer, closeError
    try {
      if (!(
        mainDeathProfile &&
        (nativeProcess.exitCode !== null || nativeProcess.signalCode !== null)
      ))
        await Promise.race([
          native.close(),
          new Promise((_, reject) => {
            closeTimer = setTimeout(
              () => reject(new Error('Owned Electron did not close within 10s')),
              10_000,
            )
          }),
        ])
    } catch (error) {
      closeError = error
      report.closeUiError = String(error.stack ?? error)
      const identityCheck = nativeChecks.findLast(({ processIdentities }) =>
        processIdentities.some(({ pid }) => pid === nativeProcess.pid),
      )
      const identity = identityCheck?.processIdentities.find(({ pid }) => pid === nativeProcess.pid)
      const group = identityCheck?.groups.find(
        ({ ownedScope, pids }) => ownedScope && pids.includes(identity?.pid),
      )
      if (mainDeathProfile) await fallbackOwnedScope(`${label}-close-error`)
      else if (identity && group)
        report.ownedSignal = await stopExpiredQualificationProcess({
          ...identity,
          group: group.group,
        })
    } finally {
      clearTimeout(closeTimer)
    }
    let exit
    try {
      exit = await confirmQualificationProcessExit(nativeChecks)
    } catch (error) {
      if (!mainDeathProfile) throw error
      closeError ??= error
      await fallbackOwnedScope(`${label}-unconfirmed-exit`)
      exit = await confirmQualificationProcessExit(nativeChecks)
    }
    report.nativeClosures.push({
      label,
      ...exit,
      processExitCode: nativeProcess.exitCode,
      signalCode: nativeProcess.signalCode,
    })
    if (recoveryProfile && activeLifetime) {
      activeLifetime.closure = report.nativeClosures.at(-1)
      activeLifetime.finishedAt = new Date().toISOString()
    }
    assert.equal(exit.confirmed, true)
    application = null
    window = null
    checkpoint()
    if (originalError) throw originalError
    if (closeError) throw closeError
    assert.equal(
      nativeProcess.exitCode,
      0,
      'Successful qualification requires healthy Electron exit',
    )
  })()
  try {
    await closing
  } finally {
    closing = null
  }
}
async function finalIdentities() {
  assert.deepEqual(await captureFiles(sourceFiles), report.sourceSha256)
  assert.deepEqual(await captureFiles(bundleFiles), report.bundleSha256)
  assert.deepEqual(await treeManifest(provision.installed.workerRoot), installedTree)
  assert.deepEqual(
    await treeManifest(path.join(provision.installed.prefix, 'resources/sdxl-config')),
    provision.inputs.config.files,
  )
  assert.deepEqual(await jsonFile(path.join(appDataRoot, 'qualification-runtime.json')), marker)
  assert.deepEqual(await jsonFile(path.join(appDataRoot, 'runtime/current-runtime.json')), pointer)
  assert.equal(await hashFile(fixture.provisionReport.path), fixture.provisionReport.sha256)
  assert.equal(await hashFile(fixturePath), report.fixtureSha256)
  assert.deepEqual(statIdentity(await regular(fixture.checkpoint.path)), modelStat)
  assert.equal(await hashFile(fixture.checkpoint.path), fixture.checkpoint.sha256)
  const db = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  try {
    assert.deepEqual(await catalogSnapshot(db.db), catalogBefore)
    const whole = recoveryProfile ? await sqlSnapshot(db.db) : null
    if (recoveryProfile) assertBaselineSql(whole)
    const rows = recoveryProfile
      ? ownRecoverySql(whole).queue
      : await db.db.selectFrom('generation_queue_item').selectAll().execute()
    assert.equal(rows.length, 2)
    assert.equal(rows.filter(({ status }) => status === 'canceled').length, 1)
    assert.equal(rows.filter(({ status }) => status === 'completed').length, 1)
    if (recoveryProfile)
      assert.equal(rows.find(({ status }) => status === 'canceled').error_code, 'APP_RESTART')
    assert.ok(rows.every(({ operation }) => operation === 'illustrious-regional-txt2img'))
    for (const row of rows)
      assert.equal(row.frozen_payload_json, report.retry.originalFrozen.row.frozen_payload_json)
    const receipts = recoveryProfile
      ? ownRecoverySql(whole).receipts
      : await db.db.selectFrom('generation_candidate_receipt').selectAll().execute()
    assert.equal(receipts.length, 1)
    assert.equal(receipts[0].image_sha256, report.output.pngSha256)
    report.finalSql = {
      queue: rows,
      receipts,
      cursors: recoveryProfile
        ? ownRecoverySql(whole).cursors
        : await db.db.selectFrom('generation_seed_cursor').selectAll().execute(),
    }
    if (recoveryProfile) {
      report.finalWholePoolSql = whole
      for (const file of baselinePackages)
        assert.equal(
          await hashFile(file.path),
          file.sha256,
          'A previous saved Project must remain byte-identical',
        )
    }
  } finally {
    await db.close()
  }
  for (const project of projects.filter(({ mode }) => mode !== 'transparent'))
    assert.equal(await hashFile(project.file), project.initialPackageSha256)
  check(
    'Original model inode/stat/full SHA, installed wheel/config/provision/pointer, source/bundle and control Project bytes remain unchanged',
  )
}
async function failureContext() {
  if (!window || window.isClosed()) return
  report.failureContext = await window.evaluate(() => ({
    title: document.title,
    blockingReasons: [...document.querySelectorAll('.generation-blocking-reason')].map(
      (element) => element.textContent,
    ),
    runtimeNotices: [...document.querySelectorAll('[aria-label="Image generation status"]')].map(
      (element) => element.textContent?.slice(0, 4096),
    ),
    queueRows: [...document.querySelectorAll('[data-job-id]')].map((element) => ({
      id: element.getAttribute('data-job-id'),
      text: element.textContent?.slice(0, 2048),
    })),
    active: {
      tag: document.activeElement?.tagName,
      ariaLabel: document.activeElement?.getAttribute('aria-label'),
    },
  }))
  if (database) report.failureSql = await sqlSnapshot()
  await retainObservers(false)
  await screenshot('failure-retained')
}

checkpoint()
// Independent inherited systemd and native owned-scope watchdogs survive this launcher.
// This local guard also closes the owned app and retains a report if a UI/IPC wait stalls.
deadlineTimer = setTimeout(() => {
  report.outcome = 'failed'
  report.deadlineExpired = true
  checkpoint()
  void closeNative('overall-deadline')
    .catch((error) => {
      report.deadlineCloseError = String(error.stack ?? error)
      checkpoint()
    })
    .finally(() => process.exit(1))
}, fixture.deadlineSeconds * 1000)
try {
  await verifyProvision()
  await prepareCatalogAndProjects()
  await prepareMainDeathControls()
  await launch()
  await targetRefusalControls()
  if (recoveryProfile) {
    await recoveryThreeLifetimes()
    await assertRecoveryActions()
  } else {
    const project = projects.find(({ mode }) => mode === 'transparent')
    const completed = await generateCancelEditRetry(project)
    await resultsAddSaveReopen(project, completed)
    const observed = await retainObservers(false)
    const mutationCalls = observed.ipc.filter(({ channel }) => channel !== 'projects:open')
    assert.ok(
      mutationCalls.every(
        ({ originalCalls, finished, ok }) => originalCalls === 1 && finished && ok === true,
      ),
    )
    assert.equal(observed.ipc.filter(({ channel }) => channel === 'projects:generate').length, 1)
    assert.equal(
      observed.ipc.filter(({ channel }) => channel === 'projects:retry-generation-job').length,
      1,
    )
    const generate = observed.ipc.find(({ channel }) => channel === 'projects:generate')
    assert.deepEqual(
      generate.args[1],
      { documentId: project.document.documentId, iterations: 1 },
      'Public renderer sends options without an injected recipe',
    )
    const retry = observed.ipc.find(({ channel }) => channel === 'projects:retry-generation-job')
    assert.equal(retry.args[0].id, report.retry.firstJobId)
    assert.equal(
      observed.ipc.filter(({ channel }) => channel === 'projects:accept-generation-candidates')
        .length,
      1,
    )
    assert.equal(observed.ipc.filter(({ channel }) => channel === 'projects:undo').length, 1)
    assert.equal(observed.ipc.filter(({ channel }) => channel === 'projects:redo').length, 1)
    assert.equal(observed.ipc.filter(({ channel }) => channel === 'projects:save').length, 2)
    assert.equal(
      observed.ipc.filter(({ channel }) =>
        ['projects:cancel-generation-job', 'projects:cancel-current-generation'].includes(channel),
      ).length,
      1,
    )
  }
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.samplerError, undefined)
  await closeNative('healthy-final')
  if (recoveryProfile) {
    assert.equal(report.lifetimes.length, 3)
    assert.equal(report.nativeClosures.length, 3)
    assert.equal(
      report.nativeClosures.filter(
        ({ intentional, signalCode, confirmed }) =>
          intentional && signalCode === 'SIGKILL' && confirmed,
      ).length,
      2,
    )
    assert.equal(report.nativeClosures.at(-1).processExitCode, 0)
    if (mainDeathProfile) {
      assert.equal(
        report.nativeClosures.filter(({ mainOnly, signal }) => mainOnly && signal.pidfd).length,
        2,
      )
      assert.deepEqual(report.fallbackSignals, [])
      await assertMainDeathControls()
    }
  }
  await finalIdentities()
  report.outcome = 'passed'
  report.completedAt = new Date().toISOString()
  report.elapsedSeconds = (Date.now() - started) / 1000
  check(
    'Finite installed public UI Regional qualification completed; evidence supports this exact matrix and no visual-quality or numerical-step claim',
  )
} catch (error) {
  report.outcome = 'failed'
  report.error = { name: error.name, message: error.message, stack: error.stack }
  checkpoint()
  await failureContext().catch((cause) => {
    report.failureContextError = String(cause.stack ?? cause)
    checkpoint()
  })
  process.exitCode = 1
} finally {
  clearTimeout(deadlineTimer)
  clearInterval(sampler)
  await sampling
  if (application)
    await closeNative('failure-finally').catch((error) => {
      report.physicalExitError = String(error.stack ?? error)
      report.outcome = 'failed'
      process.exitCode = 1
    })
  if (database) await database.close()
  report.finishedAt = new Date().toISOString()
  checkpoint()
}
