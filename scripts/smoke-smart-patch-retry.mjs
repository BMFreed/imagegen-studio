/**
 * Actual built-Electron Queue Manager frozen Smart Patch Retry regression.
 *
 * Prerequisites: fresh app:build, existing worker-python/.venv (Pillow), graphical Linux session,
 * and a root-owned launcher service: MemoryMax<=2G, MemorySwapMax=0, RuntimeMaxSec<=600,
 * TimeoutStopSec<=90, KillMode=control-group. Native actors receive <=2G and a finite timer. Run:
 * pnpm exec tsx scripts/smoke-smart-patch-retry.mjs --report-file ABSOLUTE_NEW_OWNED_REPORT
 *
 * Real: public Generate/Cancel/Queue Retry clicks, IPC/Main/SQLite/FIFO, structural checkpoint
 * qualification, current checkout CPU composition/preparation/output, signed staging images.
 * Controlled collaborator: installed readiness and JSONL numerical inference return fixed RGB
 * pixels by seed. The structural zero-weight checkpoint is not trained; this does not qualify
 * trained inference, Anima, GPU, quality, capacity or release. No downloads or runtime copies. Root
 * inspects retained screenshots and owns disposal of report.payloads after physical exit.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { gunzipSync } from 'node:zlib'

import { _electron as electron, expect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { qualifySdxlCheckpoint } from '../src/main/models/sdxl-checkpoint-qualification.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import {
  fixtureMaskPng,
  paintedPatchFixture,
} from '../src/main/projects/test-fixtures/project-mask.ts'
import { literalSmartPatchColorPng } from '../src/main/projects/test-fixtures/smart-patch-input-material.ts'
import { decodeTargetPngAlpha } from '../src/main/projects/target-png-mode.ts'
import { createRuntimeRoots } from '../src/main/runtime/index.ts'
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
const root = process.cwd()
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const evidenceParent = path.dirname(reportFile)
const relative = path.relative(artifactRoot, evidenceParent)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
assert.equal(realpathSync(evidenceParent), evidenceParent)
assert.ok(lstatSync(evidenceParent).isDirectory() && !lstatSync(evidenceParent).isSymbolicLink())
const evidenceRoot = path.join(evidenceParent, `${path.basename(reportFile)}.artifacts`)
assert.equal(existsSync(evidenceRoot), false)
writeFileSync(reportFile, '{}\n', { flag: 'wx', mode: 0o600 })
mkdirSync(evidenceRoot, { mode: 0o700 })
// Payload is a sibling of compact evidence, never a reusable environment or user library.
const fixtureRoot = mkdtempSync(
  path.join(evidenceParent, `${path.basename(reportFile)}.retry-payload-`),
)
const lifecycleFile = path.join(evidenceRoot, 'artifact-lifecycle.json')
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
const title = 'Frozen Smart Patch Retry'
const patchName = 'Retry Smart Patch'
const packagePath = path.join(workspace, `${title}.igs`)
const managedPath = path.join(appDataRoot, 'models/native-structural.safetensors')
const withheldPath = `${managedPath}.retry-withheld`
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashes = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
function filesBelow(directory, accept) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(directory, entry.name)
      assert.equal(entry.isSymbolicLink(), false, `Do not follow symlink ${file}`)
      return entry.isDirectory() ? filesBelow(file, accept) : accept(file) ? [file] : []
    })
    .sort()
}
const compiledSources = ['src/main', 'src/preload', 'src/shared', 'src/renderer'].flatMap(
  (directory) =>
    filesBelow(
      directory,
      (file) =>
        /\.(?:ts|vue|css)$/.test(file) &&
        !file.includes('.test.') &&
        !file.includes('/test-fixtures/'),
    ),
)
const sourceFiles = [
  ...new Set([
    'scripts/smoke-smart-patch-retry.mjs',
    'scripts/native-smoke-window.mjs',
    'scripts/qualification-resource-limits.mjs',
    'src/main/models/test-fixtures/illustrious-v01-safetensors-header.gz',
    'src/main/projects/test-fixtures/project-mask.ts',
    'src/main/projects/test-fixtures/smart-patch-input-material.ts',
    ...compiledSources,
    ...filesBelow('worker-python/src/imagegen_worker', (file) => /\.(?:py|icc)$/.test(file)),
  ]),
]
const bundleFiles = [
  'dist/main/main.cjs',
  'dist/preload/preload.cjs',
  'dist/renderer/index.html',
  ...filesBelow('dist/renderer/assets', (file) => /\.(?:js|css)$/.test(file)),
]
const rect = { height: 128, width: 128, x: 160, y: 120 }
const greenColor = [40, 180, 90, 255]
const purpleColor = [120, 40, 180, 255]
const checkpointName = 'Retry native structural checkpoint'
const peerRequests = path.join(fixtureRoot, 'peer-requests.jsonl')
const peerLaunches = path.join(fixtureRoot, 'peer-launches.jsonl')
const cpuRequests = path.join(fixtureRoot, 'cpu-requests.jsonl')
const holdMarker = path.join(fixtureRoot, 'hold-mode')
const report = {
  schemaVersion: 1,
  outcome: 'running',
  startedAt: new Date().toISOString(),
  fixtureRoot,
  payloads: [fixtureRoot],
  checks: [],
  screenshots: [],
  pageErrors: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  nativeLogs: [],
  boundary: {
    actual:
      'Built Electron Generate/Cancel/Queue Manager Retry; real typed IPC/Main/SQLite source CAS and FIFO dispatch; actual structural resource qualification and checkout Python CPU source/preparation/world output; signed temporary candidate bytes and frozen manifests.',
    collaborator:
      'Runtime readiness and numerical inference are explicitly controlled JSONL. A structurally qualified miniature zero-weight Illustrious checkpoint is not trained. Real CPU handlers are delegated to the existing checkout worker. Fixed RGB output depends only on the concrete original seed. No GPU or trained-model claim.',
    oracle:
      'Independent literal source pixels, fixed dynamic prompt expansion seeds0/1, frozen queue JSON/input hashes, independently decoded world alpha, candidate manifests/receipts, live Project/history snapshots and exact saved package bytes.',
    limits:
      'Root launcher <=2GiB, zero swap, finite <=600s plus <=90s stop; native groups <=2GiB, owned moved scopes get240s timer; aggregate unique groups<=4GiB. One serial controlled inference peer; no second GPU worker.',
    excluded:
      'Trained inference, Anima numerical execution, installed runtime qualification, quality, arbitrary resource/capacity matrix, full Smart Patch MVP and release. Screenshots are captured for root visual inspection; DOM checks alone do not establish appearance.',
    cleanup:
      'Only fixtureRoot is disposable. Root cleans it after all observed PID/start identities and owned scopes exit. Compact evidence, source venv and user libraries are preserved.',
  },
}
const lifecycle = {
  schemaVersion: 1,
  owner: { repository: root, task: 'smart-patch-frozen-retry', run: reportFile },
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
      reason:
        'Root may dispose after recorded native/CPU/inference physical exit and exact resource restoration.',
    },
  ],
}
let application, window, database, projectId, patchId, authored, baseline, installed, lower
let nativeProcess,
  sampler,
  sampling = Promise.resolve()
const nativeChecks = []
const observed = new Map()
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
  const value = await boundQualificationProcess(nativeProcess.pid, {
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
  const memorySamples = [...groups.keys()].map((group) => {
    const directory = `/sys/fs/cgroup${group}`
    const stat = Object.fromEntries(
      readFileSync(`${directory}/memory.stat`, 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split(' ')),
    )
    assert.match(stat.anon, /^\d+$/)
    assert.match(stat.file, /^\d+$/)
    return {
      group,
      memoryCurrent: readFileSync(`${directory}/memory.current`, 'utf8').trim(),
      memoryPeak: readFileSync(`${directory}/memory.peak`, 'utf8').trim(),
      memoryStat: { anon: stat.anon, file: stat.file, kernel: stat.kernel, slab: stat.slab },
    }
  })
  for (const group of value.groups) {
    assert.ok(
      (group.ownedScope && group.deadlineTimer) || group.group === launcher.group,
      'Every native actor needs either the verified launcher deadline or its owned KDE timer',
    )
  }
  nativeChecks.push(value)
  report.resourceLimitChecks.push({
    label,
    ...value,
    launcher,
    memorySamples,
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
function miniatureCheckpoint() {
  const official = JSON.parse(
    gunzipSync(readFileSync('src/main/models/test-fixtures/illustrious-v01-safetensors-header.gz'))
      .subarray(8)
      .toString(),
  )
  const keys = [
    'model.diffusion_model.input_blocks.0.0.weight',
    'model.diffusion_model.input_blocks.4.1.transformer_blocks.0.attn2.to_k.weight',
    'model.diffusion_model.out.2.weight',
    'conditioner.embedders.0.transformer.text_model.encoder.layers.0.layer_norm1.weight',
    'conditioner.embedders.1.model.ln_final.weight',
    'first_stage_model.encoder.conv_in.weight',
    'first_stage_model.decoder.conv_out.weight',
  ]
  let offset = 0
  const header = { __metadata__: official.__metadata__ }
  for (const key of keys) {
    const tensor = official[key]
    assert.ok(tensor)
    const length =
      tensor.shape.reduce((product, dimension) => product * dimension, 1) *
      (tensor.dtype === 'F32' ? 4 : 2)
    header[key] = {
      data_offsets: [offset, offset + length],
      dtype: tensor.dtype,
      shape: tensor.shape,
    }
    offset += length
  }
  const json = Buffer.from(JSON.stringify(header))
  const bytes = Buffer.alloc(8 + json.length + offset)
  bytes.writeBigUInt64LE(BigInt(json.length))
  json.copy(bytes, 8)
  return bytes
}

async function seedCheckpoint() {
  const managedPath = path.join(appDataRoot, 'models', 'native-structural.safetensors')
  mkdirSync(path.dirname(managedPath), { mode: 0o700, recursive: true })
  const bytes = miniatureCheckpoint()
  writeFileSync(managedPath, bytes, { mode: 0o600 })
  await qualifySdxlCheckpoint(managedPath)
  const database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  try {
    return await new ModelRepository(database.db).publishVerifiedInstallation({
      primary: {
        file: {
          managedPath,
          originalFilename: path.basename(managedPath),
          sha256: digest(bytes),
          sizeBytes: bytes.length,
          verifiedAt: new Date().toISOString(),
        },
        resource: {
          creator: 'Native smoke fixture',
          displayName: checkpointName,
          source: { kind: 'civitai', modelId: 90001 },
          sourceMetadata: { source: 'native smoke fixture' },
          type: 'checkpoint',
        },
        version: {
          baseModelFamily: 'illustrious',
          format: 'safetensors',
          name: 'Structural fixture v1',
          predictionType: 'epsilon',
          source: {
            expectedSha256: digest(bytes),
            fileId: 90003,
            kind: 'civitai',
            versionId: 90002,
          },
          sourceMetadata: { source: 'native smoke fixture' },
        },
      },
    })
  } finally {
    await database.close()
  }
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
  const result = await api('open', projectId)
  assert.equal(result.kind, 'opened')
  return result.tab
}
function patch(tab) {
  const found = tab.layers.find(({ id }) => id === patchId)
  assert.equal(found?.kind, 'smart-patch')
  return found
}

function rgba(width, height, color) {
  return literalSmartPatchColorPng(
    width,
    height,
    Array.from({ length: width * height }, () => color).flat(),
    color.length,
  )
}
function raster(name, bbox, color) {
  const id = randomUUID()
  const bytes = rgba(bbox.width, bbox.height, color)
  return {
    bytes,
    value: {
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
    },
  }
}
async function prepare() {
  mkdirSync(workspace, { recursive: true, mode: 0o700 })
  assert.ok(
    existsSync(path.resolve('worker-python/.venv/bin/python')),
    'Existing CPU environment required; no download allowed.',
  )
  installed = await seedCheckpoint()
  const session = await ProjectSession.create(packagePath, title, {
    placeholdersDir: path.resolve('dist/main/placeholders'),
    scratchDir: path.join(fixtureRoot, 'writer-scratch'),
  })
  projectId = session.localRecoveryKey
  authored = paintedPatchFixture(session.document)
  patchId = authored.id
  authored.name = patchName
  authored.boundingBox = { ...rect }
  authored.internalResolution = { height: 64, width: 64 }
  authored.mask.bounds = { height: 2, width: 2, x: rect.x, y: rect.y }
  authored.maskSettings = { blur: 0, padding: 8 }
  authored.coherenceSettings = { edgeSize: 0, minimumDenoise: 0, mode: 'Gaussian Blur' }
  const modelBytes = readFileSync(path.join(appDataRoot, 'models/native-structural.safetensors'))
  const draft = authored.generationDraft
  draft.model = {
    baseModelFamily: 'illustrious',
    civitaiFileId: 90003,
    civitaiModelId: 90001,
    civitaiVersionId: 90002,
    displayName: checkpointName,
    fileSha256: digest(modelBytes),
    kind: 'checkpoint',
    localModelId: installed.resourceId,
    localVersionId: installed.versionId,
    predictionType: 'epsilon',
    versionName: 'Structural fixture v1',
  }
  draft.positivePrompt = { embeddingRefs: [], text: '{first|second}' }
  draft.negativePrompt = { embeddingRefs: [], text: 'blur' }
  draft.dynamicPrompt = { maxPrompts: 2, seedBehavior: 'per-prompt' }
  draft.seed = { policy: 'fixed', value: 0 }
  draft.sampling = {
    cfgScale: 4,
    denoisingStrength: 0.5,
    sampler: 'Euler',
    scheduler: 'Normal',
    steps: 2,
  }
  lower = raster('Literal lower source', rect, [70, 80, 90, 255])
  const above = raster(
    'Above target marker',
    { height: 16, width: 16, x: rect.x + 112, y: rect.y + 112 },
    [220, 30, 20, 255],
  )
  baseline = structuredClone(session.document)
  baseline.generationDraft.positivePrompt.text = 'Independent normal authoring'
  baseline.primaryBbox = { height: 64, width: 64, x: -300, y: -200 }
  baseline.layers = [above.value, authored, lower.value]
  session.applyDocument(baseline)
  await session.save({
    assets: {
      [authored.mask.asset.path]: { bytes: fixtureMaskPng() },
      [lower.value.asset.path]: { bytes: lower.bytes },
      [above.value.asset.path]: { bytes: above.bytes },
    },
  })
  report.fixture = {
    localProjectKey: projectId,
    documentId: session.document.documentId,
    patchId,
    packagePath,
    installed,
    originalPackageSha256: digest(readFileSync(packagePath)),
    document: baseline,
  }
  check(
    'Real writer created an empty Patch with independent normal/lower/above state; managed miniature checkpoint is structurally qualified',
  )
  await installControlledRuntime()
}

async function installControlledRuntime() {
  const roots = await createRuntimeRoots(appDataRoot)
  const runtimeId = 'retry-smart-patch-controlled-linux-nvidia'
  const runtime = path.join(roots.environmentsDir, runtimeId)
  const executable = path.join(runtime, 'bin/python')
  const config = path.join(runtime, 'resources/sdxl-config')
  mkdirSync(path.dirname(executable), { recursive: true, mode: 0o700 })
  mkdirSync(config, { recursive: true, mode: 0o700 })
  writeFileSync(
    path.join(config, 'model_index.json'),
    '{"fixture":"controlled inference peer; real CPU derivatives"}',
  )
  const outputs = [greenColor, purpleColor].map((color) =>
    rgba(64, 64, color.slice(0, 3)).toString('base64'),
  )
  const script = `#!${path.resolve('worker-python/.venv/bin/python')}
import atexit, base64, hashlib, json, os, signal, sys, time
from pathlib import Path
sys.dont_write_bytecode = True
args = sys.argv[1:]
role = 'inference' if args == ['-I', '-m', 'imagegen_worker.inference_main'] else 'derivatives' if args == ['-I', '-m', 'imagegen_worker'] else None
assert role is not None
assert role != 'inference' or os.environ.get('IGS_SDXL_CONFIG_DIR') == ${JSON.stringify(config)}
assert os.environ.get('HF_HOME') == ${JSON.stringify(roots.cacheDir)}
assert all(os.environ.get(key) == '1' for key in ['HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'HF_DATASETS_OFFLINE'])
assert role != 'derivatives' or os.environ.get('CUDA_VISIBLE_DEVICES') == ''
def append(file, value):
    with open(file, 'a') as stream:
        stream.write(json.dumps(value) + '\\n')
start = Path('/proc/self/stat').read_text().rsplit(')', 1)[1].strip().split()[19]
other_live = []
launch_log = Path(${JSON.stringify(peerLaunches)})
for previous in [json.loads(line) for line in launch_log.read_text().splitlines()] if launch_log.exists() else []:
    if previous['role'] != 'inference':
        continue
    try:
        stat = Path('/proc/' + str(previous['pid']) + '/stat').read_text().rsplit(')', 1)[1].strip().split()
        if stat[19] == previous['start'] and stat[0] != 'Z':
            other_live.append({'pid':previous['pid'],'start':previous['start']})
    except (FileNotFoundError, ProcessLookupError):
        pass
append(${JSON.stringify(peerLaunches)}, {'pid': os.getpid(), 'start': start, 'role': role, 'args': args, 'offline': True, 'cudaVisibleDevices': os.environ.get('CUDA_VISIBLE_DEVICES'), 'otherLiveInference':other_live})
assert role != 'inference' or not other_live, 'Inference children overlapped outside the single FIFO owner'
atexit.register(lambda: append(${JSON.stringify(path.join(fixtureRoot, 'peer-exits.jsonl'))}, {'pid': os.getpid(), 'start': start, 'role': role}))
if role == 'derivatives':
    sys.path.insert(0, ${JSON.stringify(path.resolve('worker-python/src'))})
    import imagegen_worker.__main__ as worker
    original = worker.process_request
    def traced(value):
        append(${JSON.stringify(cpuRequests)}, {'pid':os.getpid(),'start':start,'request':value})
        return original(value)
    worker.process_request = traced
    append(${JSON.stringify(path.join(fixtureRoot, 'cpu-source.jsonl'))}, {'modules':{name:str(Path(module.__file__).resolve()) for name,module in sys.modules.copy().items() if name.startswith('imagegen_worker') and getattr(module,'__file__',None)}})
    raise SystemExit(worker.main())
from PIL import Image
signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
def emit(value):
    print(json.dumps(value), flush=True)
emit({'type':'ready', 'protocolVersion':'1', 'pythonVersion':'3.12.13', 'workerVersion':'0.14.0', 'runtimeProfile':'linux-nvidia', 'capabilities': ['illustrious-txt2img','target-composition','denoising-progress','candidate-thumbnails','illustrious-cfg-rescale','illustrious-img2img','illustrious-lora','illustrious-vae-precision','illustrious-external-vae','illustrious-embeddings','illustrious-outpaint','illustrious-euler','illustrious-noise-profile','smart-patch-execution','smart-patch-seed-confirmation']})
outputs = ${JSON.stringify(outputs)}
for line in sys.stdin:
    request = json.loads(line)
    assert request['type'] == 'execute-smart-patch' and request['family'] == 'illustrious'
    assert request['mode'] == 'inpaint' and request['internalResolution'] == {'width':64,'height':64}
    assert request['inference']['prompts']['positive'] in ['first', 'second']
    for resource in [request['inference']['checkpoint'], request['latentKeepMask'], request['modelSource']]:
        assert hashlib.sha256(Path(resource['path']).read_bytes()).hexdigest() == resource['sha256']
    with Image.open(request['modelSource']['path']) as source:
        assert source.mode == 'RGB' and source.size == (64,64)
        # Above-target red must never enter the frozen below-target model source.
        assert source.getpixel((60,60)) == (70,80,90)
        assert source.getpixel((32,32)) == (70,80,90)
    seed = request['inference']['sampling']['seed']
    evidence_source = Path(${JSON.stringify(evidenceRoot)}) / ('actual-cpu-model-source-seed-' + str(seed) + '.png')
    if not evidence_source.exists():
        with evidence_source.open('xb') as stream:
            stream.write(Path(request['modelSource']['path']).read_bytes())
    append(${JSON.stringify(peerRequests)}, {'pid':os.getpid(),'start':start,'role':role,'request':request,'verifiedSourcePixel':[70,80,90]})
    hold = Path(${JSON.stringify(holdMarker)})
    deadline = time.monotonic() + 120
    while hold.exists() and (hold.read_text() == 'all' or seed == 1):
        assert time.monotonic() < deadline, 'Controlled inference hold exceeded120s'
        time.sleep(0.01)
    append(${JSON.stringify(path.join(fixtureRoot, 'peer-release.jsonl'))}, {'pid':os.getpid(),'start':start,'requestId':request['requestId']})
    data = base64.b64decode(outputs[seed % 2])
    with open(request['output']['pngPath'], 'xb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    emit({'type':'smart-patch-executed','protocolVersion':'1','requestId':request['requestId'],'actualSeed':seed,'output':{'width':64,'height':64,'byteSize':len(data),'sha256':hashlib.sha256(data).hexdigest(),'colorSpace':'srgb'}})
`
  writeFileSync(executable, script, { mode: 0o700 })
  chmodSync(executable, 0o700)
  writeFileSync(
    roots.pointerFile,
    JSON.stringify({ schemaVersion: 1, runtimeId, pythonExecutable: executable }),
    { mode: 0o600 },
  )
  report.runtimeFixture = {
    runtimeId,
    executable,
    sha256: digest(Buffer.from(script)),
    cpuPython: path.resolve('worker-python/.venv/bin/python'),
    outputs: outputs.map((value) => digest(Buffer.from(value, 'base64'))),
  }
  check(
    'One app-owned runtime wrapper delegates actual CPU work to existing checkout environment and declares only numerical inference/readiness as controlled',
  )
}

const canvas = () => window.getByRole('region', { name: 'Project Canvas', exact: true })
const tray = () =>
  window.getByRole('region', { name: 'Smart Patch Generation Results', exact: true })
const queue = () => window.getByRole('dialog', { name: 'Queue Manager', exact: true })
const queueRow = (id) => queue().locator(`[data-job-id="${id}"]`)
const results = () => api('listSmartPatchGenerationResults', projectId)
async function rows() {
  return database.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('local_project_key', '=', projectId)
    .orderBy('created_at')
    .orderBy('id')
    .execute()
}
async function receipts() {
  return database.db
    .selectFrom('generation_candidate_receipt')
    .selectAll()
    .where('local_project_key', '=', projectId)
    .orderBy('completion_order')
    .execute()
}
function readLines(file) {
  return existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : []
}
function liveInference() {
  return readLines(peerLaunches).filter(
    (value) => value.role === 'inference' && !physicallyExited(value),
  )
}
function generationPreparationRequests() {
  // Read-only targetState also composes/prepares source after generation notifications. Actual
  // execution admission additionally conditions masks and prepares model-source RGB; Retry must
  // never repeat those steps. Exact bundle/request/Project assertions separately prove replay.
  return readLines(cpuRequests).filter(
    ({ request }) =>
      request.type === 'condition-smart-patch' ||
      request.type === 'prepare-smart-patch-model-source',
  )
}
function bundleFilesFor(row) {
  const payload = JSON.parse(row.frozen_payload_json)
  const directory = path.join(
    appDataRoot,
    'generation-queued-inputs/smart-patch',
    payload.bundle.id,
  )
  assert.equal(
    digest(readFileSync(path.join(directory, 'manifest.json'))),
    payload.bundle.manifestSha256,
  )
  return Object.fromEntries(
    Object.keys(payload.files).map((name) => {
      const file = path.join(directory, name)
      const bytes = readFileSync(file)
      assert.equal(digest(bytes), payload.files[name].sha256)
      assert.equal(bytes.length, payload.files[name].byteSize)
      return [name, { sha256: digest(bytes), bytes: bytes.length }]
    }),
  )
}
function requestSemantics(request) {
  const metadata = ({ path: ignored, ...rest }) => rest
  return {
    type: request.type,
    family: request.family,
    mode: request.mode,
    inference: request.inference,
    internalResolution: request.internalResolution,
    latentKeepMask: metadata(request.latentKeepMask),
    modelSource: metadata(request.modelSource),
  }
}
function documentState(tab) {
  // Operational seed cursors may advance on completion; Project authoring and history must not.
  const { lastActualSeedSnapshot: ignored, ...document } = tab
  return document
}
function historyLayers(layers) {
  return JSON.parse(
    JSON.stringify(layers, (key, value) => {
      if ((key === 'imageUrl' || key === 'maskImageUrl') && typeof value === 'string') {
        const url = new URL(value)
        assert.ok(['igs-layer:', 'igs-mask:'].includes(url.protocol))
        const parts = url.pathname.split('/')
        // ProjectTab URLs bind the current document revision and HMAC. Retain every asset,
        // layer/mask identity and content hash while ignoring only those derived revision tokens.
        assert.ok(parts.length >= 6)
        parts[2] = '<document-revision>'
        parts[parts.length - 1] = '<signature>'
        return `${url.protocol}//${url.host}${parts.join('/')}`
      }
      return value
    }),
  )
}
function historyAuthoring(state) {
  const { documentRevision: ignored, layers, ...tab } = state.tab
  return { ...state, tab: { ...tab, layers: historyLayers(layers) } }
}
async function authoringState() {
  return { tab: documentState(await current()), savedSha256: digest(readFileSync(packagePath)) }
}
async function assertAuthoring(expected) {
  assert.deepEqual(await authoringState(), expected)
  assert.equal(patch(await current()).rasterSubLayers.length, 0, 'Retry must never auto Add')
}
async function screenshot(name) {
  await window.evaluate(() =>
    document.fonts.ready.then(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    ),
  )
  const file = path.join(evidenceRoot, `${name}.png`)
  await window.mouse.move(0, 0)
  await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push(file)
  checkpoint()
}
async function showQueue() {
  await window.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
  await expect(queue()).toBeVisible()
  await expect.poll(() => queue().evaluate((node) => getComputedStyle(node).transform)).toBe('none')
}
async function refreshQueue() {
  const refresh = queue().getByRole('button', { name: 'Refresh', exact: true })
  await expect(refresh).toBeEnabled()
  await refresh.click()
  await expect(
    queue().getByRole('region', { name: 'Generation jobs', exact: true }),
  ).toHaveAttribute('aria-busy', 'false')
}
async function hideQueue() {
  await queue().getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
  await expect(queue()).toHaveCount(0)
}
async function launch() {
  const environment = {
    ...process.env,
    NODE_ENV: 'production',
    CUDA_VISIBLE_DEVICES: '',
    PYTHONDONTWRITEBYTECODE: '1',
    XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
    XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
    XDG_CACHE_HOME: path.join(fixtureRoot, 'cache'),
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
  await bounds('launch')
  const sample = () => {
    for (const value of descendants(nativeProcess.pid))
      observed.set(`${value.pid}:${value.start}`, value)
  }
  sample()
  sampler = setInterval(() => {
    sampling = sampling.then(sample).catch((error) => {
      report.samplerError = String(error)
    })
  }, 50)
  const log = { pid: nativeProcess.pid, text: '' }
  report.nativeLogs.push(log)
  for (const stream of [nativeProcess.stdout, nativeProcess.stderr])
    stream?.on('data', (bytes) => {
      if (log.text.length < 96 * 1024)
        log.text += String(bytes).slice(0, 96 * 1024 - log.text.length)
    })
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(15_000)
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await application.evaluate(({ BrowserWindow }) => {
    const native = BrowserWindow.getAllWindows()[0]
    native.setSize(1440, 900)
    native.show()
    native.focus()
  })
  report.viewport = await window.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
  }))
  report.nativeVisible = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].isVisible(),
  )
  assert.equal(report.nativeVisible, true)
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await expect.poll(async () => (await api('list')).some(({ id }) => id === projectId)).toBe(true)
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
  await window
    .locator(`[data-layer-id="${patchId}"]`)
    .getByRole('button', { name: `Select ${patchName}`, exact: true })
    .click()
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  const overlay = window.getByRole('button', { name: 'Hide mask overlay', exact: true })
  if (await overlay.isVisible()) await overlay.click()
  const runtime = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(runtime.ok, true)
  assert.equal(runtime.value.kind, 'ready')
  report.runtime = runtime.value
  check('Visible isolated built Electron opens real Project and declared controlled ready runtime')
}
async function closeProject() {
  if (!window || window.isClosed()) return
  if (await queue().count()) await hideQueue()
  if (!(await window.getByRole('tab', { name: title, exact: true }).count())) return
  await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
  const dialog = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect
    .poll(async () =>
      (await window.getByRole('tab', { name: title, exact: true }).count()) === 0
        ? 'closed'
        : (await dialog.isVisible())
          ? 'decision'
          : 'waiting',
    )
    .not.toBe('waiting')
  if (await dialog.isVisible()) {
    const discard = dialog.getByRole('button', { name: 'Discard Changes', exact: true })
    if (await discard.count()) await discard.click()
    else
      await dialog
        .getByRole('button', {
          name: /^(Discard Candidates and Close|Cancel Jobs and Close|Close and Keep Recovery)$/,
        })
        .click()
  }
  await expect(window.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
}
async function closeNative(label) {
  if (!application) return
  let boundFailure
  try {
    await bounds(`${label}-before-close`)
  } catch (error) {
    boundFailure = error
    report.closeBoundError = String(error)
  }
  clearInterval(sampler)
  await sampling
  for (const value of observed.values())
    nativeChecks.push({ processIdentities: [value], groups: [] })
  for (const value of readLines(peerLaunches))
    nativeChecks.push({ processIdentities: [value], groups: [] })
  if (database) {
    await database.close()
    database = null
  }
  // Capture BEFORE close: application.process() is not usable after Playwright closes its transport.
  const native = application
  const child = nativeProcess
  const closed = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  )
  let timer
  try {
    await Promise.race([
      native.close(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Native close exceeded10s')), 10_000)
      }),
    ])
  } catch (error) {
    report.closeUiError = String(error)
    const latest = nativeChecks.findLast((value) => value.nativeIdentity)
    const owned = latest?.groups.find(
      ({ ownedScope, pids }) => ownedScope && pids.includes(child.pid),
    )
    if (owned)
      report.ownedSignal = await stopExpiredQualificationProcess({
        ...latest.nativeIdentity,
        group: owned.group,
      })
    else throw error
  } finally {
    clearTimeout(timer)
  }
  const exit = await confirmQualificationProcessExit(nativeChecks)
  assert.equal(exit.confirmed, true)
  const actualExit =
    child.exitCode !== null || child.signalCode !== null
      ? { code: child.exitCode, signal: child.signalCode }
      : await closed
  report.nativeClosures.push({ label, ...exit, ...actualExit })
  application = null
  window = null
  checkpoint()
  assert.equal(actualExit.code, 0, 'Forced native termination is a failed qualification')
  assert.equal(actualExit.signal, null)
  if (boundFailure) throw boundFailure
}
async function fetchImage(url) {
  return application.evaluate(async ({ net, nativeImage }, url) => {
    const response = await net.fetch(url)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (response.status !== 200) return { status: response.status }
    const image = nativeImage.createFromBuffer(bytes)
    const size = image.getSize()
    const bitmap = image.toBitmap()
    const offset = (8 * size.width + 8) * 4
    return {
      status: response.status,
      bytes: [...bytes],
      size,
      core: [bitmap[offset + 2], bitmap[offset + 1], bitmap[offset], bitmap[offset + 3]],
    }
  }, url)
}
async function verifyCandidate(candidate, row, color) {
  assert.equal(candidate.queueItemId, row.id)
  assert.equal(candidate.candidateId, row.id)
  assert.equal(candidate.stagingSessionId, row.staging_session_id)
  assert.equal(candidate.actualSeed, JSON.parse(row.frozen_payload_json).item.item.seed)
  assert.deepEqual(candidate.bbox, rect)
  const directory = path.join(
    appDataRoot,
    'recovery/smart-patch-staging',
    projectId,
    row.staging_session_id,
    candidate.candidateId,
  )
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
  assert.equal(manifest.frozenPayloadJson, row.frozen_payload_json)
  assert.equal(manifest.frozenPayloadSha256, digest(Buffer.from(row.frozen_payload_json)))
  assert.equal(manifest.documentRevision, row.document_revision)
  assert.equal(manifest.documentId, row.document_id)
  const finalMask = readFileSync(path.join(directory, 'final-contribution-mask.png'))
  assert.equal(
    digest(finalMask),
    JSON.parse(row.frozen_payload_json).files['final-contribution-mask.png'].sha256,
  )
  const image = await fetchImage(candidate.imageUrl)
  assert.equal(image.status, 200)
  assert.deepEqual(image.size, { width: 128, height: 128 })
  assert.deepEqual(image.core, color)
  const bytes = Buffer.from(image.bytes)
  assert.equal(digest(bytes), manifest.image.sha256)
  const expectedAlpha = Buffer.alloc(128 * 128)
  for (let y = 0; y < 16; y++) expectedAlpha.fill(255, y * 128, y * 128 + 16)
  assert.equal(
    decodeTargetPngAlpha(bytes, 128, 128).equals(expectedAlpha),
    true,
    'World alpha must use the original frozen mask and geometry',
  )
  writeFileSync(path.join(evidenceRoot, `candidate-${row.id}.png`), bytes, {
    flag: 'wx',
    mode: 0o600,
  })
  writeFileSync(
    path.join(evidenceRoot, `candidate-${row.id}.json`),
    JSON.stringify(manifest, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  )
  return {
    candidateId: candidate.candidateId,
    sha256: digest(bytes),
    manifestSha256: digest(readFileSync(path.join(directory, 'manifest.json'))),
    finalMaskSha256: digest(finalMask),
  }
}
async function clickRetry(source, expectedCount) {
  await refreshQueue()
  await queueRow(source.id).getByRole('button', { name: 'Show job details', exact: true }).click()
  const button = queueRow(source.id).getByRole('button', { name: 'Retry job', exact: true })
  await expect(button).toBeEnabled({ timeout: 20_000 })
  await button.click()
  await expect(
    queue().getByText('A new job was queued with the original frozen settings.', { exact: true }),
  ).toBeVisible()
  await expect.poll(async () => (await rows()).length).toBe(expectedCount)
  await expect
    .poll(async () => (await rows()).find(({ id }) => id === source.id)?.status_sequence)
    .toBe(source.status_sequence + 1)
}
function assertReplay(source, next, priorRows) {
  const originalPayload = JSON.parse(source.frozen_payload_json)
  const nextPayload = JSON.parse(next.frozen_payload_json)
  assert.deepEqual({ ...nextPayload, bundle: originalPayload.bundle }, originalPayload)
  assert.notEqual(nextPayload.bundle.id, originalPayload.bundle.id)
  assert.equal(nextPayload.bundle.itemIndex, originalPayload.bundle.itemIndex)
  assert.ok(
    priorRows.every(
      (row) => JSON.parse(row.frozen_payload_json).bundle.id !== nextPayload.bundle.id,
    ),
    'Each Retry owns a fresh copied input bundle',
  )
  for (const name of Object.keys(originalPayload.files)) {
    const directory = path.join(appDataRoot, 'generation-queued-inputs/smart-patch')
    assert.equal(
      readFileSync(path.join(directory, originalPayload.bundle.id, name)).equals(
        readFileSync(path.join(directory, nextPayload.bundle.id, name)),
      ),
      true,
      `Retry must copy exact original ${name} bytes`,
    )
  }
  for (const key of [
    'canonical_project_path',
    'document_id',
    'document_revision',
    'local_project_key',
    'operation',
  ])
    assert.equal(next[key], source[key])
  for (const key of ['id', 'batch_id', 'staging_session_id']) {
    assert.notEqual(next[key], source[key])
    assert.ok(
      priorRows.every((row) => row[key] !== next[key]),
      `Retry needs new ${key}`,
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
  report.revision = { head: inventory[3].stdout.trim(), dirtyWorkingTree: inventory[4].stdout }
  check(
    'Launcher has verified2GiB zero-swap finite service deadline; inventory and dirty revision retained',
  )
  report.sourceSha256 = hashes(sourceFiles)
  report.bundleSha256 = hashes(bundleFiles)
  const sourceMtime = Math.max(...compiledSources.map((file) => statSync(file).mtimeMs))
  const bundleMtime = Math.min(...bundleFiles.map((file) => statSync(file).mtimeMs))
  assert.ok(bundleMtime >= sourceMtime, 'Run a fresh app:build after implementation changes')
  report.buildFreshness = {
    newestCompiledSourceMtimeMs: sourceMtime,
    oldestBundleMtimeMs: bundleMtime,
  }
  check('Source and built bundle hashes captured; bundles are newer than compiled sources')
  await prepare()
  writeFileSync(holdMarker, 'seed1', { flag: 'wx', mode: 0o600 })
  await launch()
  const count = window.locator('input[aria-label="Images per click"]')
  await count.fill('1')
  await count.press('Enter')
  await expect(count).toHaveValue('1')
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled({
    timeout: 20_000,
  })
  await window.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect.poll(async () => readLines(peerRequests).length, { timeout: 30_000 }).toBe(2)
  await expect.poll(async () => (await results()).candidates.length).toBe(1)
  const initialRows = await rows()
  assert.equal(initialRows.length, 2)
  const running = initialRows.find(({ status }) => status === 'running')
  const completed = initialRows.find(({ status }) => status === 'completed')
  assert.ok(running && completed)
  assert.equal(JSON.parse(running.frozen_payload_json).item.item.seed, 1)
  assert.equal(JSON.parse(completed.frozen_payload_json).item.item.seed, 0)
  const originalRequest = readLines(peerRequests)[1].request
  assert.equal(originalRequest.inference.sampling.seed, 1)
  const priorCandidate = (await results()).candidates[0]
  const priorImage = await verifyCandidate(priorCandidate, completed, greenColor)
  const priorReceipt = (await receipts()).find(
    ({ queue_item_id }) => queue_item_id === completed.id,
  )
  assert.ok(priorReceipt)
  await showQueue()
  await expect(queueRow(running.id)).toHaveAttribute('data-status', 'running')
  await queueRow(running.id).getByRole('button', { name: 'Cancel job', exact: true }).click()
  await expect
    .poll(async () => (await rows()).find(({ id }) => id === running.id)?.status)
    .toBe('canceled')
  await expect.poll(() => liveInference().length).toBe(0)
  const original = (await rows()).find(({ id }) => id === running.id)
  assert.equal(
    (await receipts()).some(({ queue_item_id }) => queue_item_id === original.id),
    false,
  )
  const originalPeer = readLines(peerRequests)[1]
  assert.equal(physicallyExited(originalPeer), true)
  const originalInputs = bundleFilesFor(original)
  report.original = {
    row: original,
    inputFiles: originalInputs,
    request: originalRequest,
    priorCandidate,
    priorImage,
  }
  check(
    'Public Generate completes seed0; Queue Manager actual Cancel yields terminal seed1 without receipt and confirmed child exit',
  )
  await hideQueue()

  // These are real UI authoring edits, so App owns the returned snapshots and history.
  const prompt = window.getByRole('textbox', { name: 'Positive prompt', exact: true })
  await prompt.fill('Changed live prompt must never enter Retry')
  await prompt.press('Tab')
  await expect
    .poll(async () => patch(await current()).generationDraft.positivePrompt.text)
    .toBe('Changed live prompt must never enter Retry')
  const seed = window.locator('input[aria-label="Generation seed"]')
  await seed.fill('99')
  await seed.press('Tab')
  await expect.poll(async () => patch(await current()).generationDraft.seed.value).toBe(99)
  const steps = window.locator('input[aria-label="Steps"]')
  await steps.fill('7')
  await steps.press('Tab')
  await expect.poll(async () => patch(await current()).generationDraft.sampling.steps).toBe(7)
  await window
    .locator(`[data-layer-id="${lower.value.id}"]`)
    .getByRole('button', { name: 'Hide Literal lower source', exact: true })
    .click()
  await expect
    .poll(async () => (await current()).layers.find(({ id }) => id === lower.value.id).visible)
    .toBe(false)
  const beforeMaskEdit = await authoringState()
  await window.getByRole('button', { name: 'Clear mask', exact: true }).click()
  await expect.poll(async () => patch(await current()).mask.asset).toBe(null)
  // Wait for the renderer's source-classification reader from these deliberate edits to settle.
  // Its CPU work is an authoring precondition, not a Retry recapture.
  await expect(window.locator('.denoising-diagnostic')).toHaveText(
    'Denoising Strength is available when the generation area contains raster input.',
  )
  const changed = await authoringState()
  assert.equal(changed.tab.dirty, true)
  assert.equal(changed.tab.canUndo, true)
  assert.notEqual(changed.tab.documentRevision, original.document_revision)
  assert.equal(changed.savedSha256, report.fixture.originalPackageSha256)
  assert.equal(patch(changed.tab).rasterSubLayers.length, 0)
  report.changedAuthoring = changed
  check(
    'Live UI edits prompt seed steps lower-source visibility and Patch mask after original freeze; original saved bytes stay exact',
  )
  await showQueue()
  await refreshQueue()
  await expect(
    queueRow(original.id).getByRole('button', { name: 'Retry job', exact: true }),
  ).toBeEnabled({ timeout: 20_000 })
  await queueRow(original.id).getByRole('button', { name: 'Show job details', exact: true }).click()
  await screenshot('01-queue-original-retry-enabled')
  check(
    'Actual Queue Manager exposes enabled Retry for reviewed canceled Smart job despite current authoring changes',
  )

  const preparationBefore = generationPreparationRequests()
  const beforeFirst = await rows()
  const staleReview = { id: original.id, statusSequence: original.status_sequence }
  writeFileSync(holdMarker, 'all', { mode: 0o600 })
  await clickRetry(original, 3)
  const firstRetry = (await rows()).find(({ id }) => !beforeFirst.some((row) => row.id === id))
  assert.ok(firstRetry)
  assertReplay(original, firstRetry, beforeFirst)
  const sourceAfterFirst = (await rows()).find(({ id }) => id === original.id)
  assert.equal(sourceAfterFirst.status, 'canceled')
  assert.equal(sourceAfterFirst.frozen_payload_json, original.frozen_payload_json)
  await expect.poll(() => readLines(peerRequests).length, { timeout: 30_000 }).toBe(3)
  await expect
    .poll(async () => (await rows()).find(({ id }) => id === firstRetry.id)?.status)
    .toBe('running')
  assert.deepEqual(
    requestSemantics(readLines(peerRequests)[2].request),
    requestSemantics(originalRequest),
  )
  assert.deepEqual(bundleFilesFor(firstRetry), originalInputs)
  assert.deepEqual(
    generationPreparationRequests(),
    preparationBefore,
    'Retry cannot condition masks or prepare model-source RGB for another execution',
  )
  await assertAuthoring(changed)
  report.firstRetry = firstRetry
  check(
    'Idle Queue Retry creates exactly one fresh ID batch session and consumes original review once with exact frozen job and worker request',
  )

  const beforeStale = {
    rows: await rows(),
    receipts: await receipts(),
    candidates: (await results()).candidates,
  }
  const stale = await window.evaluate(
    (review) => window.api.projects.retryGenerationJob(review),
    staleReview,
  )
  assert.equal(stale.ok, false)
  assert.equal(stale.error.code, 'GENERATION_INVALID_REQUEST')
  assert.match(stale.error.message, /queue item changed/i)
  // The raw reviewed IPC has settled; the first Retry remains independently blocked at inference.
  assert.deepEqual(
    { rows: await rows(), receipts: await receipts(), candidates: (await results()).candidates },
    beforeStale,
  )
  await assertAuthoring(changed)
  report.staleRefusal = stale
  check(
    'Second stale raw reviewed IPC refuses changed review with no extra attempt receipt candidate or document change',
  )

  const busyPeer = liveInference()
  assert.equal(busyPeer.length, 1)
  const inferenceLaunches = readLines(peerLaunches).filter(
    ({ role }) => role === 'inference',
  ).length
  const beforeBusy = await rows()
  await clickRetry(sourceAfterFirst, 4)
  const busyRetry = (await rows()).find(({ id }) => !beforeBusy.some((row) => row.id === id))
  assert.ok(busyRetry)
  assertReplay(original, busyRetry, beforeBusy)
  assert.equal(busyRetry.status, 'pending')
  assert.equal((await rows()).find(({ id }) => id === firstRetry.id).status, 'running')
  assert.equal(readLines(peerRequests).length, 3)
  assert.equal(
    readLines(peerLaunches).filter(({ role }) => role === 'inference').length,
    inferenceLaunches,
  )
  assert.deepEqual(
    liveInference(),
    busyPeer,
    'Busy admission must reuse readiness, never start a second inference child',
  )
  assert.deepEqual(generationPreparationRequests(), preparationBefore)
  assert.deepEqual(bundleFilesFor(busyRetry), originalInputs)
  await assertAuthoring(changed)
  report.busyRetry = busyRetry
  await queueRow(busyRetry.id)
    .getByRole('button', { name: 'Show job details', exact: true })
    .click()
  await screenshot('02-queue-busy-retry-pending')
  await bounds('busy-retry-shared-FIFO')
  check(
    'Busy Queue Retry creates one pending concrete replay behind held active Retry without second inference process or target preparation',
  )

  rmSync(holdMarker)
  await expect
    .poll(async () => (await rows()).filter(({ status }) => status === 'completed').length, {
      timeout: 30_000,
    })
    .toBe(3)
  await expect.poll(async () => (await results()).candidates.length).toBe(3)
  await expect.poll(() => liveInference().length).toBe(0)
  assert.equal(
    readLines(peerRequests).length,
    4,
    'Two originals plus two concrete retries; no replayed batch',
  )
  assert.deepEqual(
    readLines(peerRequests).map(({ request }) => request.inference.sampling.seed),
    [0, 1, 1, 1],
  )
  for (const value of readLines(peerRequests).slice(2))
    assert.deepEqual(requestSemantics(value.request), requestSemantics(originalRequest))
  const allRows = await rows()
  const firstDone = allRows.find(({ id }) => id === firstRetry.id)
  const busyDone = allRows.find(({ id }) => id === busyRetry.id)
  assert.ok(
    Date.parse(busyDone.started_at) >= Date.parse(firstDone.finished_at),
    'Second retry dispatch follows first completion',
  )
  const firstPeer = readLines(peerRequests)[2]
  assert.equal(physicallyExited(firstPeer), true)
  const sourceFinal = allRows.find(({ id }) => id === original.id)
  assert.equal(sourceFinal.status, 'canceled')
  assert.equal(sourceFinal.status_sequence, original.status_sequence + 2)
  const snapshot = await results()
  const firstCandidate = snapshot.candidates.find(
    ({ queueItemId }) => queueItemId === firstRetry.id,
  )
  const busyCandidate = snapshot.candidates.find(({ queueItemId }) => queueItemId === busyRetry.id)
  report.retryCandidates = [
    await verifyCandidate(firstCandidate, firstDone, purpleColor),
    await verifyCandidate(busyCandidate, busyDone, purpleColor),
  ]
  assert.ok(firstCandidate.completionOrder < busyCandidate.completionOrder)
  assert.equal(report.retryCandidates[0].sha256, report.retryCandidates[1].sha256)
  assert.deepEqual(generationPreparationRequests(), preparationBefore)
  check(
    'One FIFO drain completes exactly two seed1 replays with original source settings pixels mask and durable frozen provenance',
  )
  const preserved = snapshot.candidates.find(
    ({ candidateId }) => candidateId === priorCandidate.candidateId,
  )
  assert.deepEqual(preserved, priorCandidate)
  assert.equal(digest(Buffer.from((await fetchImage(preserved.imageUrl)).bytes)), priorImage.sha256)
  assert.deepEqual(
    (await receipts()).find(({ queue_item_id }) => queue_item_id === completed.id),
    priorReceipt,
  )
  assert.equal(
    (await receipts()).some(({ queue_item_id }) => queue_item_id === original.id),
    false,
  )
  await assertAuthoring(changed)
  report.completedRows = allRows
  report.completedReceipts = await receipts()
  check(
    'Original candidate bytes identity and receipt survive both retries; no auto Add document draft history or saved-package change',
  )
  await refreshQueue()
  await queueRow(busyRetry.id)
    .getByRole('button', { name: 'Show job details', exact: true })
    .click()
  await expect(queueRow(busyRetry.id)).toHaveAttribute('data-status', 'completed')
  await screenshot('03-queue-retried-result-completed')
  await hideQueue()
  await expect(tray()).toBeVisible()
  const retryCard = tray().locator(`[data-smart-candidate-id="${busyRetry.id}"]`)
  await expect(retryCard).toBeVisible()
  await retryCard.getByRole('button', { name: /^Preview Smart Patch candidate / }).click()
  await screenshot('04-original-frozen-retry-result-after-live-edits')
  check(
    'Completed Queue row and real temporary Results candidate remain viewable in visible native window',
  )

  await canvas().getByRole('button', { name: 'Undo', exact: true }).click()
  await expect
    .poll(async () => historyLayers((await current()).layers))
    .toEqual(historyLayers(beforeMaskEdit.tab.layers))
  const undone = await current()
  assert.deepEqual(historyLayers(undone.layers), historyLayers(beforeMaskEdit.tab.layers))
  assert.equal(undone.canRedo, true)
  await canvas().getByRole('button', { name: 'Redo', exact: true }).click()
  await expect
    .poll(async () => historyLayers((await current()).layers))
    .toEqual(historyLayers(changed.tab.layers))
  // Undo/Redo of dirty intermediate content creates fresh revisions; only exact saved content
  // reuses its saved revision. Compare authoring exactly while admitting that intentional UUID.
  const afterHistory = await authoringState()
  assert.deepEqual(historyAuthoring(afterHistory), historyAuthoring(changed))
  report.historyRevisions = {
    before: changed.tab.documentRevision,
    undo: undone.documentRevision,
    redo: afterHistory.tab.documentRevision,
  }
  assert.equal((await results()).candidates.length, 3)
  check(
    'One ordinary Undo and Redo still own the last authored mask edit; retries introduce no history entry or candidate adoption',
  )

  await showQueue()
  await refreshQueue()
  const beforeMissing = {
    rows: await rows(),
    receipts: await receipts(),
    candidates: (await results()).candidates,
    inputs: bundleFilesFor(original),
  }
  const modelHash = digest(readFileSync(managedPath))
  assert.equal(existsSync(withheldPath), false)
  await expect(
    queueRow(original.id).getByRole('button', { name: 'Retry job', exact: true }),
  ).toBeEnabled({ timeout: 20_000 })
  // Only our idle fixture resource is withheld; the old terminal review is otherwise current.
  renameSync(managedPath, withheldPath)
  report.resourceWithheld = { managedPath, withheldPath, sha256: modelHash, restored: false }
  checkpoint()
  try {
    await queueRow(original.id).getByRole('button', { name: 'Retry job', exact: true }).click()
    const feedback = queue().locator('.manager-feedback .n-alert')
    await expect(feedback).toContainText(/missing|repair|unavailable|model|checkpoint|resource/i)
    await expect(queue().getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
    report.missingResourceFeedback = await feedback.innerText()
    assert.deepEqual(
      {
        rows: await rows(),
        receipts: await receipts(),
        candidates: (await results()).candidates,
        inputs: bundleFilesFor(original),
      },
      beforeMissing,
    )
    assert.equal(readLines(peerRequests).length, 4)
    await assertAuthoring(afterHistory)
    await screenshot('05-queue-missing-resource-preserving-refusal')
    check(
      'Queue Retry with missing exact managed resource refuses visibly while preserving source sequence inputs candidates settings history and saved bytes',
    )
  } finally {
    assert.equal(existsSync(managedPath), false)
    renameSync(withheldPath, managedPath)
    assert.equal(digest(readFileSync(managedPath)), modelHash)
    report.resourceWithheld.restored = true
    checkpoint()
  }
  assert.deepEqual(bundleFilesFor(original), originalInputs)
  check('Owned withheld model is byte-exact restored and original frozen bundle remains intact')
  const saved = await readIgsPackage(packagePath)
  assert.deepEqual(
    saved.project.layers.find(({ id }) => id === patchId),
    authored,
  )
  assert.deepEqual(
    saved.project.layers.find(({ id }) => id === lower.value.id),
    lower.value,
  )
  assert.deepEqual(saved.project.generationDraft, baseline.generationDraft)
  assert.equal(digest(readFileSync(packagePath)), report.fixture.originalPackageSha256)
  check(
    'Actual saved .igs readback retains original Patch source authoring and zero accepted variants',
  )
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.samplerError, undefined)
  assert.deepEqual(hashes(sourceFiles), report.sourceSha256, 'Source changed during the run')
  assert.deepEqual(hashes(bundleFiles), report.bundleSha256, 'Bundle changed during the run')
  report.cpuRequestTypes = readLines(cpuRequests).map(({ request }) => request.type)
  report.cpuSourceModules = readLines(path.join(fixtureRoot, 'cpu-source.jsonl'))
  assert.ok(report.cpuSourceModules.length > 0)
  const checkoutWorker = realpathSync('worker-python/src/imagegen_worker') + path.sep
  for (const { modules } of report.cpuSourceModules)
    for (const file of Object.values(modules)) assert.ok(file.startsWith(checkoutWorker))
  report.inferenceRequests = readLines(peerRequests)
  assert.ok(
    readLines(peerLaunches)
      .filter(({ role }) => role === 'inference')
      .every(({ otherLiveInference }) => otherLiveInference.length === 0),
  )
  check(
    'Current checkout CPU handlers are attested and source bundle hashes stay unchanged with no renderer errors',
  )
  await closeProject()
  await closeNative('completed-retry-regression')
  report.peers = readLines(peerLaunches).map((value) => ({
    ...value,
    physicalExit: physicallyExited(value),
  }))
  assert.ok(report.peers.length > 0 && report.peers.every(({ physicalExit }) => physicalExit))
  check(
    'Native process captured before close exits normally and all observed CPU inference actors have physical-exit proof',
  )
  report.expectedCheckCount = 20
  assert.equal(report.checks.length, report.expectedCheckCount)
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'
  report.error = { name: error.name, message: error.message, stack: error.stack }
  if (window && !window.isClosed()) {
    try {
      report.failureDiagnostics = {
        rows: database ? await rows() : null,
        tab: projectId ? await current() : null,
        queueText: (await queue().count()) ? await queue().innerText() : null,
      }
    } catch (diagnosticError) {
      report.failureDiagnosticsError = String(diagnosticError)
    }
    await screenshot('failure-before-cleanup').catch(() => undefined)
  }
  process.exitCode = 1
} finally {
  // Release only this run's controlled hold before asking native lifecycle owners to close.
  if (existsSync(holdMarker)) rmSync(holdMarker)
  if (existsSync(withheldPath)) {
    try {
      assert.equal(existsSync(managedPath), false)
      renameSync(withheldPath, managedPath)
      assert.equal(digest(readFileSync(managedPath)), report.resourceWithheld.sha256)
      report.resourceWithheld.restored = true
    } catch (error) {
      report.restorationError = String(error)
      report.outcome = 'failed'
      process.exitCode = 1
    }
  }
  if (application) {
    try {
      await closeProject()
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
  report.peers = readLines(peerLaunches).map((value) => ({
    ...value,
    physicalExit: physicallyExited(value),
  }))
  report.observedProcesses = [...observed.values()].map((value) => ({
    ...value,
    physicalExit: physicallyExited(value),
  }))
  report.completedAt = new Date().toISOString()
  report.checkCount = report.checks.length
  report.cleanup = {
    owner: 'root',
    payloads: [fixtureRoot],
    removedByRunner: [],
    physicalExitConfirmed:
      !report.nativeLaunchError &&
      !report.cleanupError &&
      !application &&
      report.nativeClosures.length > 0 &&
      report.peers.every(({ physicalExit }) => physicalExit) &&
      report.observedProcesses.every(({ physicalExit }) => physicalExit),
    resourceRestorationConfirmed:
      !report.restorationError &&
      !existsSync(withheldPath) &&
      (!report.resourceWithheld || report.resourceWithheld.restored),
  }
  if (!report.cleanup.physicalExitConfirmed || !report.cleanup.resourceRestorationConfirmed) {
    report.outcome = 'failed'
    process.exitCode = 1
  }
  lifecycle.state = 'retained'
  checkpoint()
  console.log(
    JSON.stringify({
      outcome: report.outcome,
      checkCount: report.checkCount,
      reportFile,
      payloads: report.payloads,
    }),
  )
}
