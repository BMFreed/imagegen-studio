/**
 * Public renderer/Main Smart Patch generation with real CPU preparation/output; controlled
 * inference.
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
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { gunzipSync } from 'node:zlib'

import { _electron as electron, expect } from '@playwright/test'

import { ModelRepository } from '../src/main/models/model-repository.ts'
import { qualifySdxlCheckpoint } from '../src/main/models/sdxl-checkpoint-qualification.ts'
import { createRuntimeRoots } from '../src/main/runtime/index.ts'
import {
  fixtureMaskPng,
  paintedPatchFixture,
} from '../src/main/projects/test-fixtures/project-mask.ts'
import { decodeTargetPngAlpha } from '../src/main/projects/target-png-mode.ts'
import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { literalSmartPatchColorPng } from '../src/main/projects/test-fixtures/smart-patch-input-material.ts'
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
assert.equal(existsSync(reportFile), false)
const evidenceParent = path.dirname(reportFile)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const relative = path.relative(artifactRoot, evidenceParent)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
assert.equal(realpathSync(evidenceParent), evidenceParent)
assert.ok(lstatSync(evidenceParent).isDirectory() && !lstatSync(evidenceParent).isSymbolicLink())
// Every report owns its screenshots and exported package, including retries in the same parent.
const evidenceRoot = path.join(evidenceParent, `${path.basename(reportFile)}.artifacts`)
assert.equal(existsSync(evidenceRoot), false)
mkdirSync(evidenceRoot, { mode: 0o700 })

const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'native-public-smart-patch-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
mkdirSync(workspace, { recursive: true, mode: 0o700 })
const title = 'Public Smart Patch generation'
const patchName = 'Public Smart Patch'
const packagePath = path.join(workspace, `${title}.igs`)
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashes = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const sourceFiles = [
  'scripts/smoke-smart-patch-public-generation.mjs',
  'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs',
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/shared/api.ts',
  'src/shared/projects/smart-patch-public-generation.ts',
  'src/main/projects/project-service.ts',
  'src/main/projects/project-smart-patch-generation-action-controller.ts',
  'src/main/projects/project-smart-patch-result-resource.ts',
  'src/main/projects/project-smart-patch-result-actions.ts',
  'src/main/projects/project-smart-patch-acceptance.ts',
  'src/main/projects/project-smart-patch-execution.ts',
  'src/main/projects/project-smart-patch-preparation.ts',
  'src/main/projects/smart-patch-generation-processor.ts',
  'src/main/projects/smart-patch-generation-staging.ts',
  'src/main/projects/generation-dispatch-coordinator.ts',
  'src/main/projects/project-generation-staging-lifecycle.ts',
  'src/main/projects/project-generation-close.ts',
  'src/main/projects/project-generation-recovery.ts',
  'src/main/projects/igs-package.ts',
  'src/main/runtime/index.ts',
  'src/renderer/components/ProjectView.vue',
  'src/renderer/components/ProjectSmartPatchResultsTray.vue',
  'src/renderer/components/ProjectCanvas.vue',
  'src/renderer/App.vue',
  'worker-python/src/imagegen_worker/smart_patch_preparation.py',
  'worker-python/src/imagegen_worker/smart_patch_conditioning.py',
  'worker-python/src/imagegen_worker/smart_patch_output.py',
]
const bundleFiles = [
  'dist/main/main.cjs',
  'dist/preload/preload.cjs',
  'dist/renderer/index.html',
  ...readdirSync('dist/renderer/assets')
    .filter((name) => /\.(?:js|css)$/.test(name))
    .map((name) => `dist/renderer/assets/${name}`),
]
const rect = { height: 128, width: 128, x: 160, y: 120 }
const greenColor = [40, 180, 90, 255]
const purpleColor = [120, 40, 180, 255]
const checkpointName = 'Public native structural checkpoint'
const peerRequests = path.join(fixtureRoot, 'peer-requests.jsonl')
const peerLaunches = path.join(fixtureRoot, 'peer-launches.jsonl')
const holdMarker = path.join(fixtureRoot, 'hold-mode')
const report = {
  outcome: 'running',
  startedAt: new Date().toISOString(),
  fixtureRoot,
  payloads: [fixtureRoot],
  sourceSha256: hashes(sourceFiles),
  bundleSha256: hashes(bundleFiles),
  checks: [],
  screenshots: [],
  canvasPixels: [],
  dialogGeometry: [],
  pageErrors: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  boundary: {
    actual:
      'Built Electron renderer Generate, typed IPC, Main Smart controller and automatic shared dispatch; actual managed structural model qualification, RuntimeManager and child exit; checkout Python CPU source/preparation/conditioning/world output; SQLite staging, signed resources/native thumbnails, focused preview versus acceptance selection, typed Add, Undo/Redo, native Save/ZIP/reopen, cancel/Close, physical crash and recovery.',
    fixtures:
      'Writer-created empty Smart Patch, owned2×2 soft mask, lower literal opaque Raster and separate above-target Raster. A zero-weight miniature checkpoint passes actual anchor/header qualification but is not trained. The app-owned wrapper uses the existing repo Python environment without copying it. Only readiness and numerical inference are controlled JSONL: fixed64×64 RGB by seed; no CUDA or trained model loading/quality claim.',
    oracle:
      'Independent literal first16×16 world alpha from fixed128world/64processing/8latent geometry, green/purple generated core, preserved lower and above-target pixels; immutable frozen inputs and actual PNG bytes survive explicit Add/Save/reopen/recovery. Preview is independent of checked candidates.',
    limits:
      'Root bounds launcher; unique launcher/native groups at most4GiB total, native at most2GiB, zero swap, finite300s deadline. No downloads or runtime copies.',
    cleanup:
      'Root disposes only this owned payload after all observed PID/start identities and owned scopes physically exit; compact evidence stays outside payload.',
  },
}
let application, window, database, projectId, patchId, authored, baseline, installed
let accepted = []
const nativeChecks = []

function checkpoint() {
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
}
function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence })
  checkpoint()
  console.log(`PASS ${name}`)
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

async function bounds(label) {
  const value = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds: 300,
    execute: (file, args, options) =>
      nativeExec(
        file,
        args.map((item) => (item === 'MemoryMax=12G' ? 'MemoryMax=2G' : item)),
        options,
      ),
  })
  assert.ok(
    value.groups.every(
      (group) => BigInt(group.memoryMax) <= 2n * 1024n ** 3n && group.swapMax === '0',
    ),
  )
  const launcherGroup = readFileSync('/proc/self/cgroup', 'utf8')
    .trim()
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3)
  assert.ok(launcherGroup && launcherGroup.startsWith('/') && launcherGroup !== '/')
  const launcherRoot = `/sys/fs/cgroup${launcherGroup}`
  const launcherMax = readFileSync(path.join(launcherRoot, 'memory.max'), 'utf8').trim()
  assert.match(launcherMax, /^\d+$/)
  assert.equal(readFileSync(path.join(launcherRoot, 'memory.swap.max'), 'utf8').trim(), '0')
  const unique = new Map(value.groups.map((group) => [group.group, BigInt(group.memoryMax)]))
  unique.set(launcherGroup, BigInt(launcherMax))
  const total = [...unique.values()].reduce((sum, limit) => sum + limit, 0n)
  assert.ok(total <= 4n * 1024n ** 3n)
  nativeChecks.push(value)
  report.resourceLimitChecks.push({
    label,
    ...value,
    launcherGroup,
    launcherMax,
    uniqueTotalMax: String(total),
  })
  checkpoint()
}
async function launch() {
  const environment = {
    ...process.env,
    NODE_ENV: 'production',
    CUDA_VISIBLE_DEVICES: '',
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
  ])
    delete environment[name]
  application = await electron.launch({
    args: ['--ozone-platform=x11', '.'],
    cwd: process.cwd(),
    env: environment,
    timeout: 30_000,
  })
  await bounds('launch')
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(15_000)
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await application.evaluate(({ BrowserWindow }) => {
    const native = BrowserWindow.getAllWindows()[0]
    native.setSize(1440, 900)
    native.focus()
  })
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  await expect.poll(async () => (await api('list')).some(({ id }) => id === projectId)).toBe(true)
  const record = await database.db
    .selectFrom('project_index')
    .selectAll()
    .where('local_project_key', '=', projectId)
    .executeTakeFirstOrThrow()
  assert.equal(record.file_health, 'ready')
  check('Actual isolated startup indexed portable variants through SQLite')
}

async function openProject(recover = false) {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  if (recover) {
    const dialog = window.getByRole('dialog', { name: 'Recovery available', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Recover', exact: true }).click()
  }
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
  await window
    .locator(`[data-layer-id="${patchId}"]`)
    .getByRole('button', { name: `Select ${patchName}`, exact: true })
    .click()
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  const overlay = window.getByRole('button', { name: 'Hide mask overlay', exact: true })
  if (await overlay.isVisible()) await overlay.click()
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
async function resizeNative(width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0].setSize(size.width, size.height)
    },
    { width, height },
  )
  await expect
    .poll(
      () => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize()),
      { timeout: 5000 },
    )
    .toEqual([width, height])
  const contentSize = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getContentSize(),
  )
  await expect
    .poll(() => window.evaluate(() => [innerWidth, innerHeight]), { timeout: 5000 })
    .toEqual(contentSize)
  return { outer: [width, height], content: contentSize }
}
async function compactVisualEvidence() {
  const originalSize = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getSize(),
  )
  assert.deepEqual(originalSize, [1440, 900])
  try {
    const size = await resizeNative(900, 620)
    await screenshot('01b-public-smart-results-minimum-window')
    const geometry = await canvas().evaluate((root) => {
      const rect = (element) => {
        const r = element.getBoundingClientRect()
        return {
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        }
      }
      const elements = [
        ...root.querySelectorAll(
          '[role="toolbar"], [role="toolbar"] *, [data-smart-candidate-id], [data-smart-candidate-id] *, .canvas-context-bar, .canvas-context-bar > *',
        ),
      ].filter((element) => {
        const bounds = element.getBoundingClientRect()
        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        )
      })
      return {
        viewport: { width: innerWidth, height: innerHeight },
        canvas: rect(root),
        children: elements.map((element) => ({
          tag: element.tagName,
          role: element.getAttribute('role'),
          ariaLabel: element.getAttribute('aria-label'),
          className: element.getAttribute('class'),
          bounds: rect(element),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })),
      }
    })
    report.dialogGeometry.push({
      label: '900x620 public Smart results toolbar/candidate bounds',
      size,
      ...geometry,
    })
    checkpoint()
    const escaped = geometry.children.filter(
      ({ bounds }) =>
        bounds.left < geometry.canvas.left - 1 ||
        bounds.top < geometry.canvas.top - 1 ||
        bounds.right > geometry.canvas.right + 1 ||
        bounds.bottom > geometry.canvas.bottom + 1,
    )
    assert.deepEqual(
      escaped,
      [],
      'Every visible Canvas toolbar/candidate child must remain inside the Canvas at the actual minimum native window size.',
    )
    assert.ok(
      geometry.children.some(({ ariaLabel }) => ariaLabel === 'Temporary Smart Patch results'),
    )
    assert.ok(
      geometry.children.some(({ ariaLabel }) => ariaLabel === 'Preview Smart Patch candidate 2'),
    )
    check(
      'Actual 900x620 native window keeps every visible Canvas toolbar/candidate child inside Canvas bounds',
      { size, childCount: geometry.children.length },
    )
  } finally {
    await resizeNative(...originalSize)
  }
}
const canvas = () => window.getByRole('region', { name: 'Project Canvas', exact: true })
async function sample(label, point) {
  const actual = await canvas()
    .locator('.canvas-area')
    .evaluate((host, point) => {
      const bitmap = host.querySelector('.konvajs-content canvas')
      if (!(bitmap instanceof HTMLCanvasElement)) throw new Error('Live Konva scene is absent')
      const rect = bitmap.getBoundingClientRect()
      const camera = {
        x: Number(host.dataset.cameraX),
        y: Number(host.dataset.cameraY),
        scale: Number(host.dataset.cameraScale),
      }
      const x = ((camera.x + point.x * camera.scale) * bitmap.width) / rect.width
      const y = ((camera.y + point.y * camera.scale) * bitmap.height) / rect.height
      if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height)
        throw new Error('Requested frozen world pixel is outside the live Canvas')
      return {
        camera,
        world: point,
        canvas: { width: bitmap.width, height: bitmap.height, x, y },
        rgba: [...bitmap.getContext('2d').getImageData(Math.floor(x), Math.floor(y), 1, 1).data],
      }
    }, point)
  report.canvasPixels.push({ label, ...actual })
  checkpoint()
  return actual.rgba
}

async function closeNative(label) {
  if (!application) return
  await bounds(`${label}-before-close`)
  if (database) {
    await database.close()
    database = null
  }
  let closeTimer
  try {
    await Promise.race([
      application.close(),
      new Promise((_, reject) => {
        closeTimer = setTimeout(
          () => reject(new Error('Native close did not finish within 10 seconds.')),
          10_000,
        )
      }),
    ])
  } catch (error) {
    report.closeUiError = String(error)
    const latest = nativeChecks.at(-1)
    const identity = latest.processIdentities.find(({ pid }) => pid === application.process().pid)
    const group = latest.groups.find(
      ({ ownedScope, pids }) => ownedScope && pids.includes(identity?.pid),
    )
    assert.ok(identity && group)
    report.ownedSignal = await stopExpiredQualificationProcess({ ...identity, group: group.group })
  } finally {
    clearTimeout(closeTimer)
  }
  const exit = await confirmQualificationProcessExit(nativeChecks)
  assert.equal(exit.confirmed, true)
  report.nativeClosures.push({ label, ...exit })
  // The helper also stops this launch's watchdog timers. Historical proof remains
  // in the report, while the next launch owns a fresh process/timer set.
  nativeChecks.length = 0
  application = null
  window = null
  checkpoint()
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
  const lower = raster('Literal lower source', rect, [70, 80, 90, 255])
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
  const runtimeId = 'public-smart-patch-controlled-linux-nvidia'
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
append(${JSON.stringify(peerLaunches)}, {'pid': os.getpid(), 'start': start, 'role': role, 'args': args, 'offline': True, 'cudaVisibleDevices': os.environ.get('CUDA_VISIBLE_DEVICES')})
atexit.register(lambda: append(${JSON.stringify(path.join(fixtureRoot, 'peer-exits.jsonl'))}, {'pid': os.getpid(), 'start': start, 'role': role}))
if role == 'derivatives':
    sys.path.insert(0, ${JSON.stringify(path.resolve('worker-python/src'))})
    from imagegen_worker.__main__ import main
    raise SystemExit(main())
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
    while hold.exists() and (hold.read_text() == 'all' or seed == 1):
        time.sleep(0.01)
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

const tray = () =>
  window.getByRole('region', { name: 'Smart Patch Generation Results', exact: true })
async function results() {
  return await api('listSmartPatchGenerationResults', projectId)
}
async function rows() {
  return await database.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('local_project_key', '=', projectId)
    .orderBy('created_at')
    .orderBy('id')
    .execute()
}
function readLines(file) {
  return existsSync(file)
    ? readFileSync(file, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : []
}
async function fetchImage(url) {
  return await application.evaluate(async ({ net, nativeImage }, url) => {
    const response = await net.fetch(url)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (response.status !== 200) return { status: response.status, bytes: [...bytes] }
    const image = nativeImage.createFromBuffer(bytes)
    const size = image.getSize()
    const bitmap = image.toBitmap()
    const pixel = (x, y) => {
      const offset = (y * size.width + x) * 4
      return [bitmap[offset + 2], bitmap[offset + 1], bitmap[offset], bitmap[offset + 3]]
    }
    return {
      status: response.status,
      bytes: [...bytes],
      size,
      core: pixel(8, 8),
      lower: pixel(96, 64),
    }
  }, url)
}
async function assertUnaccepted(label, count) {
  const tab = await current()
  assert.equal(tab.dirty, false)
  assert.equal(tab.canUndo, false)
  assert.equal(patch(tab).rasterSubLayers.length, count)
  assert.equal(
    digest(readFileSync(packagePath)),
    report.savedPackageSha256 ?? report.fixture.originalPackageSha256,
  )
  check(label)
}
async function generate() {
  // The transient UI default is four iterations. This fixture's two-choice prompt
  // needs exactly one iteration, including after Close resets UI-only settings.
  const count = window.locator('input[aria-label="Images per click"]')
  await count.fill('1')
  await count.press('Enter')
  await expect(count).toHaveValue('1')
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled({
    timeout: 20_000,
  })
  await window.getByRole('button', { name: 'Generate', exact: true }).click()
}
async function assertStack(color, label) {
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  await expect.poll(() => sample(`${label}-core`, { x: rect.x + 8, y: rect.y + 8 })).toEqual(color)
  await expect
    .poll(() => sample(`${label}-lower`, { x: rect.x + 96, y: rect.y + 64 }))
    .toEqual([70, 80, 90, 255])
  await expect
    .poll(() => sample(`${label}-above`, { x: rect.x + 120, y: rect.y + 120 }))
    .toEqual([220, 30, 20, 255])
}
async function saveAndRead(label, expected = accepted) {
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await current()).dirty).toBe(false)
  const loaded = await readIgsPackage(packagePath)
  const target = loaded.project.layers.find(({ id }) => id === patchId)
  assert.equal(target.kind, 'smart-patch')
  assert.deepEqual(
    target.rasterSubLayers.map(({ id }) => id),
    expected.map(({ id }) => id),
  )
  for (const key of [
    'boundingBox',
    'internalResolution',
    'generationDraft',
    'mask',
    'maskSettings',
    'coherenceSettings',
  ])
    assert.deepEqual(target[key], authored[key])
  assert.deepEqual(loaded.project.generationDraft, baseline.generationDraft)
  assert.deepEqual(loaded.project.primaryBbox, baseline.primaryBbox)
  assert.deepEqual(
    loaded.project.layers.filter(({ id }) => id !== patchId),
    baseline.layers.filter(({ id }) => id !== patchId),
  )
  for (const variant of expected) {
    const actual = target.rasterSubLayers.find(({ id }) => id === variant.id)
    assert.deepEqual(actual, variant)
    const bytes = await loaded.readMember(actual.asset.path)
    assert.equal(digest(bytes), actual.asset.sha256)
    assert.equal(
      bytes.equals(
        Buffer.from(
          report.candidateImages.find(
            ({ seed }) =>
              seed === actual.generationProvenance.generationConfiguration.sampling.actualSeed,
          ).bytes,
        ),
      ),
      true,
    )
    const source = actual.generationProvenance.layerSourceContext
    assert.equal(source.layerId, patchId)
    assert.deepEqual(source.bbox, rect)
    assert.deepEqual(source.generationDraft, authored.generationDraft)
  }
  report.savedPackageSha256 = digest(readFileSync(packagePath))
  check(label, { packageSha256: report.savedPackageSha256, variants: target.rasterSubLayers })
  return target.rasterSubLayers
}
async function cleanClose() {
  await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
}
async function requestClose() {
  await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
  const dialog = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}
async function crashNative() {
  await bounds('intentional-crash-before-signal')
  await database.close()
  database = null
  const latest = nativeChecks.at(-1)
  const identity = latest.nativeIdentity
  const group = latest.groups.find(
    ({ ownedScope, pids }) => ownedScope && pids.includes(identity.pid),
  )
  assert.ok(group, 'Intentional fault requires the verified isolated owned KDE scope')
  report.intentionalCrash = await stopExpiredQualificationProcess({
    ...identity,
    group: group.group,
  })
  report.nativeClosures.push({
    label: 'intentional-crash',
    ...(await confirmQualificationProcessExit(nativeChecks)),
  })
  nativeChecks.length = 0
  application = null
  window = null
  checkpoint()
}

checkpoint()
try {
  await prepare()
  await launch()
  await openProject()
  const status = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(status.ok, true)
  assert.equal(status.value.kind, 'ready')
  await generate()
  await expect.poll(async () => (await results()).candidates.length, { timeout: 30_000 }).toBe(2)
  await expect
    .poll(async () => (await rows()).map(({ status }) => status))
    .toEqual(['completed', 'completed'])
  const snapshot = await results()
  assert.deepEqual(
    snapshot.candidates.map(({ actualSeed }) => actualSeed),
    [0, 1],
  )
  assert.ok(
    snapshot.candidates.every(
      ({ kind, layerId, disposition }) =>
        kind === 'smart-patch-world-candidate' &&
        layerId === patchId &&
        disposition === 'available',
    ),
  )
  assert.equal(snapshot.lastActualSeed, 1)
  const alpha = Buffer.alloc(128 * 128)
  for (let y = 0; y < 16; y++) alpha.fill(255, y * 128, y * 128 + 16)
  report.candidateImages = []
  for (const candidate of snapshot.candidates) {
    const image = await fetchImage(candidate.imageUrl)
    assert.equal(image.status, 200)
    assert.deepEqual(image.size, { width: 128, height: 128 })
    assert.deepEqual(image.core, candidate.actualSeed === 0 ? greenColor : purpleColor)
    assert.deepEqual(decodeTargetPngAlpha(Buffer.from(image.bytes), 128, 128), alpha)
    assert.equal(image.lower[3], 0)
    assert.ok(candidate.thumbnailUrl)
    const thumbnail = await fetchImage(candidate.thumbnailUrl)
    assert.equal(thumbnail.status, 200)
    assert.ok(
      thumbnail.size.width <= 256 &&
        thumbnail.size.height <= 256 &&
        thumbnail.bytes.length <= 256 * 1024,
    )
    report.candidateImages.push({
      id: candidate.candidateId,
      seed: candidate.actualSeed,
      sha256: digest(Buffer.from(image.bytes)),
      bytes: image.bytes,
      thumbnailSha256: digest(Buffer.from(thumbnail.bytes)),
    })
    writeFileSync(
      path.join(evidenceRoot, `actual-world-candidate-seed-${candidate.actualSeed}.png`),
      Buffer.from(image.bytes),
      { flag: 'wx', mode: 0o600 },
    )
    writeFileSync(
      path.join(evidenceRoot, `actual-native-thumbnail-seed-${candidate.actualSeed}.png`),
      Buffer.from(thumbnail.bytes),
      { flag: 'wx', mode: 0o600 },
    )
  }
  await assertUnaccepted(
    'Public Generate automatically drains two typed Smart candidates through actual CPU source/output and leaves Project/Save unchanged',
    0,
  )
  await bounds('generated-candidates')
  await expect(tray()).toBeVisible()
  const first = tray().getByRole('checkbox', {
    name: 'Select Smart Patch candidate 1',
    exact: true,
  })
  const second = tray().getByRole('checkbox', {
    name: 'Select Smart Patch candidate 2',
    exact: true,
  })
  await expect(first).not.toBeChecked()
  await expect(second).not.toBeChecked()
  await first.check()
  await tray().getByRole('button', { name: 'Preview Smart Patch candidate 2', exact: true }).click()
  await expect(first).toBeChecked()
  await expect(second).not.toBeChecked()
  await assertStack(purpleColor, 'focused-unaccepted-purple')
  await screenshot('01-public-smart-results-focus-versus-selection')
  await compactVisualEvidence()
  check(
    'Focused candidate changes actual Canvas contribution while checked acceptance selection stays independent; lower and above-target pixels remain exact',
  )
  await second.check()
  await tray().getByRole('button', { name: 'Add 2 as Variants', exact: true }).click()
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(2)
  assert.equal((await results()).candidates.length, 0)
  const added = patch(await current())
  assert.equal(added.activeRasterSubLayerId, added.rasterSubLayers[1].id)
  assert.equal((await current()).dirty, true)
  await assertStack(purpleColor, 'added-focused-purple')
  await canvas().getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(0)
  assert.equal((await current()).canUndo, false)
  await canvas().getByRole('button', { name: 'Redo', exact: true }).click()
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(2)
  const saved = await readIgsPackage(packagePath)
  assert.equal(saved.project.layers.find(({ id }) => id === patchId).rasterSubLayers.length, 0)
  // Capture actual accepted immutable metadata from the portable writer only after native Save.
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await current()).dirty).toBe(false)
  accepted = (await readIgsPackage(packagePath)).project.layers.find(
    ({ id }) => id === patchId,
  ).rasterSubLayers
  await saveAndRead(
    'Typed public Add2 creates one Undo transaction; native Save owns exact world PNGs/frozen provenance and preserves authoring/neighbors',
  )
  for (const candidate of snapshot.candidates)
    assert.notEqual((await fetchImage(candidate.imageUrl)).status, 200)
  await cleanClose()
  await openProject()
  await assertStack(purpleColor, 'save-reopen-purple')
  assert.equal(patch(await current()).rasterSubLayers.length, 2)
  check(
    'Save/reopen keeps both explicitly accepted variants, active frozen pixels and no temporary candidates',
  )
  await screenshot('02-public-smart-added-reopened')

  writeFileSync(holdMarker, 'all', { mode: 0o600 })
  const beforeCancel = (await rows()).map(({ id }) => id)
  await generate()
  await expect.poll(async () => readLines(peerRequests).length).toBe(3)
  await bounds('held-public-cancel')
  await window.getByRole('button', { name: 'Cancel current generation', exact: true }).click()
  await expect
    .poll(
      async () =>
        (await rows()).filter(
          ({ id, status }) => !beforeCancel.includes(id) && status === 'canceled',
        ).length,
    )
    .toBe(1)
  await expect.poll(async () => readLines(peerRequests).length).toBe(4)
  const close = await requestClose()
  await close.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal((await rows()).filter(({ status }) => status === 'running').length, 1)
  check(
    'Public Cancel physically stops the current peer; remaining batch continues, and declining combined Close preserves it',
  )
  const confirmedClose = await requestClose()
  await confirmedClose.getByRole('button', { name: 'Cancel Jobs and Close', exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
  await expect
    .poll(
      async () =>
        (await rows()).filter(
          ({ id, status }) => !beforeCancel.includes(id) && status === 'canceled',
        ).length,
    )
    .toBe(2)
  assert.equal(digest(readFileSync(packagePath)), report.savedPackageSha256)
  rmSync(holdMarker)
  await openProject()
  assert.equal((await results()).candidates.length, 0)
  assert.equal(patch(await current()).rasterSubLayers.length, 2)
  check(
    'Confirmed Project Close cancels remaining Smart work and preserves saved accepted variants without late candidates',
  )

  writeFileSync(holdMarker, 'seed1', { mode: 0o600 })
  const beforeCrash = (await rows()).map(({ id }) => id)
  await generate()
  await expect.poll(async () => (await results()).candidates.length, { timeout: 30_000 }).toBe(1)
  await expect.poll(async () => readLines(peerRequests).length).toBe(6)
  const recoverCandidate = (await results()).candidates[0]
  const partialClose = await requestClose()
  await expect(
    partialClose.getByRole('button', { name: 'Discard Candidates and Close', exact: true }),
  ).toBeVisible()
  await partialClose.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal((await results()).candidates.length, 1)
  assert.equal(
    (await rows()).filter(({ id, status }) => !beforeCrash.includes(id) && status === 'running')
      .length,
    1,
  )
  await assertUnaccepted(
    'Partial Smart batch and declined Close stay temporary beside two saved accepted variants',
    2,
  )
  await screenshot('03-public-smart-partial-before-crash')
  await crashNative()
  rmSync(holdMarker)
  await launch()
  await openProject(true)
  await expect.poll(async () => (await results()).candidates.length).toBe(1)
  const recovered = await results()
  assert.equal(recovered.candidates[0].candidateId, recoverCandidate.candidateId)
  assert.equal(recovered.candidates[0].actualSeed, 0)
  assert.equal(patch(await current()).rasterSubLayers.length, 2)
  const interrupted = (await rows()).filter(({ id }) => !beforeCrash.includes(id))
  assert.deepEqual(interrupted.map(({ status }) => status).sort(), ['canceled', 'completed'])
  assert.equal(interrupted.find(({ status }) => status === 'canceled').error_code, 'APP_RESTART')
  assert.equal(digest(readFileSync(packagePath)), report.savedPackageSha256)
  await expect(tray()).toBeVisible()
  await screenshot('04-public-smart-recovered-review')
  check(
    'Actual process crash/restart restores completed typed Smart result for explicit review and marks unfinished sibling APP_RESTART; saved Project remains unchanged',
  )
  await tray()
    .getByRole('checkbox', { name: 'Select Smart Patch candidate 1', exact: true })
    .check()
  await tray().getByRole('button', { name: 'Add 1 as Variant', exact: true }).click()
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(3)
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await current()).dirty).toBe(false)
  const finalPackage = await readIgsPackage(packagePath)
  const finalVariants = finalPackage.project.layers.find(({ id }) => id === patchId).rasterSubLayers
  assert.deepEqual(finalVariants.slice(0, 2), accepted)
  accepted = finalVariants
  await saveAndRead(
    'Only explicit Add accepts recovered candidate; actual Save retains all three exact images/provenances',
  )
  await assertStack(greenColor, 'recovered-explicit-add-green')
  const evidencePackage = path.join(evidenceRoot, 'native-public-smart-patch.igs')
  writeFileSync(evidencePackage, readFileSync(packagePath), { flag: 'wx', mode: 0o600 })
  report.evidencePackage = evidencePackage
  await cleanClose()
  await openProject()
  assert.equal(patch(await current()).rasterSubLayers.length, 3)
  await assertStack(greenColor, 'final-save-reopen-green')
  await cleanClose()
  await closeNative('final')
  const launches = readLines(peerLaunches)
  report.peerLaunches = launches
  report.peerRequests = readLines(peerRequests)
  report.peerExits = readLines(path.join(fixtureRoot, 'peer-exits.jsonl'))
  const identities = launches.map(({ pid, start }) => ({ pid, start }))
  report.nativeClosures.push({
    label: 'all-recorded-cpu-and-inference-actors',
    ...(await confirmQualificationProcessExit([{ processIdentities: identities, groups: [] }])),
  })
  assert.ok(launches.some(({ role }) => role === 'derivatives'))
  assert.ok(launches.some(({ role }) => role === 'inference'))
  report.actualSourceImages = [0, 1].map((seed) => {
    const file = path.join(evidenceRoot, `actual-cpu-model-source-seed-${seed}.png`)
    assert.ok(existsSync(file))
    return { seed, file, sha256: digest(readFileSync(file)) }
  })
  assert.equal(report.peerRequests.length, 6)
  assert.ok(
    report.peerRequests.every(
      ({ verifiedSourcePixel }) => JSON.stringify(verifiedSourcePixel) === '[70,80,90]',
    ),
  )
  assert.deepEqual(report.pageErrors, [])
  report.finalSourceSha256 = hashes(sourceFiles)
  report.finalBundleSha256 = hashes(bundleFiles)
  assert.deepEqual(report.finalSourceSha256, report.sourceSha256)
  assert.deepEqual(report.finalBundleSha256, report.bundleSha256)
  report.outcome = 'passed'
  report.completedAt = new Date().toISOString()
  check(
    'All observed native/CPU/inference PID-start actors physically exited; source and built bundles stayed byte-exact during qualification',
  )
} catch (error) {
  report.outcome = 'failed'
  report.error = { name: error.name, message: error.message, stack: error.stack }
  checkpoint()
  if (window && !window.isClosed())
    await screenshot('failure-before-cleanup').catch(() => undefined)
  throw error
} finally {
  if (application) {
    await closeNative('finally').catch((error) => {
      report.cleanupError = String(error)
      report.outcome = 'failed'
      checkpoint()
    })
  }
  if (database) await database.close()
  checkpoint()
}
