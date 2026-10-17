/** Fresh installed trained Smart Patch qualification. Never provisions or substitutes a worker. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants, createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'

import { _electron as electron, expect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { qualifyAnimaCheckpoint } from '../src/main/models/anima-checkpoint-qualification.ts'
import {
  ANIMA_QWEN3_0_6B_ENCODER,
  ANIMA_QWEN_IMAGE_VAE,
} from '../src/main/models/anima-manifest.ts'
import { ModelDownloader } from '../src/main/models/model-downloader.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { qualifySdxlCheckpoint } from '../src/main/models/sdxl-checkpoint-qualification.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { encodeProjectMaskPng } from '../src/main/projects/project-mask.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { literalSmartPatchColorPng } from '../src/main/projects/test-fixtures/smart-patch-input-material.ts'
import { createLamaAuxiliaryInstaller } from '../src/main/runtime/inference-auxiliary-installer.ts'
import {
  createInferenceAuxiliaryResourceRoot,
  InferenceAuxiliaryResources,
} from '../src/main/runtime/inference-auxiliary-resources.ts'
import { LAMA_OUTPAINT_ARTIFACT } from '../src/main/runtime/lama-manifest.ts'
import { isQualifiedInferenceWorkerReady } from '../src/shared/projects/inference-worker-capabilities.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'
import {
  assertSmartPatchQualificationAlpha,
  assertSmartPatchQualificationRgbPair,
  decodeSmartPatchQualificationPng as decodePng,
} from './smart-patch-qualification-oracles.mjs'
import {
  assertRuntimeIdle,
  assertUpgradeBounds,
  treeManifest,
} from './upgrade-qualification-worker.mjs'

assert.deepEqual(process.argv.slice(2, 3), ['--fixture'])
assert.equal(process.argv.length, 4)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const canonicalPath = (value) =>
  assert.ok(typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value)
const within = (root, value) => {
  const relative = path.relative(root, value)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}
async function regular(file) {
  canonicalPath(file)
  const entry = await lstat(file)
  assert.ok(entry.isFile() && !entry.isSymbolicLink())
  assert.equal(await realpath(file), file)
  return entry
}
async function directory(file) {
  canonicalPath(file)
  const entry = await lstat(file)
  assert.ok(entry.isDirectory() && !entry.isSymbolicLink())
  assert.equal(await realpath(file), file)
}
async function jsonFile(file, maximum = 32 * 1024 ** 2) {
  const stat = await regular(file)
  assert.ok(stat.size <= maximum)
  return JSON.parse(await readFile(file, 'utf8'))
}
const fixturePath = process.argv[3]
const fixture = await jsonFile(fixturePath, 64 * 1024)
assert.equal(fixture.schemaVersion, 1)
assert.equal(fixture.profile, 'installed-smart-patch')
assert.equal(fixture.deadlineSeconds, 1800)
const appDataRoot = fixture.appData
const evidenceRoot = fixture.artifacts
for (const value of [fixturePath, appDataRoot, evidenceRoot, fixture.provisionReport.path]) {
  canonicalPath(value)
  assert.ok(within(artifactRoot, value))
}
await directory(appDataRoot)
assert.equal(path.basename(appDataRoot), 'imagegen-studio')
assert.equal(path.basename(path.dirname(appDataRoot)), 'data')
const fixtureRoot = path.dirname(path.dirname(appDataRoot))
assert.ok(!within(fixtureRoot, evidenceRoot) && !within(evidenceRoot, fixtureRoot))
await directory(path.dirname(evidenceRoot))
assert.equal(existsSync(evidenceRoot), false, 'Use a new evidence directory for each run')
await mkdir(evidenceRoot, { mode: 0o700 })
const reportFile = path.join(evidenceRoot, 'report.json')
const nativeExec = promisify(execFile)
const nativeChecks = []
let application, window, database, projectId, patchId, title, patchName, packagePath, authored
const scenarios = []
const observedProcesses = new Map()
const observedMemoryGroups = new Map()
let sampler,
  sampling = Promise.resolve()
const report = {
  schemaVersion: 1,
  outcome: 'running',
  startedAt: new Date().toISOString(),
  fixturePath,
  fixtureSha256: await hashFile(fixturePath),
  appDataRoot,
  evidenceRoot,
  payloads: [appDataRoot],
  checks: [],
  screenshots: [],
  canvasPixels: [],
  pageErrors: [],
  resourceLimitChecks: [],
  memoryObservations: {},
  nativeClosures: [],
  scenarios: [],
  observedWorkers: [],
  boundary: {
    actual:
      'Built public renderer Generate/Results/Add with genuine installed current worker, trained managed originals, native CUDA Illustrious/Anima, actual CPU source/masks/LaMa/world composition, SQLite queue/receipts, explicit journaled Add, one Undo/Redo, native Save/ZIP/reopen.',
    preconditions:
      'Catalog adoption and initial empty Patch/lower/above source assets are declared setup. No inference/readiness/transport/output override, repo interpreter or imported old runtime is used. Local LaMa transport adopts exact pinned source bytes; public download is not qualified.',
    numeric:
      'Finite256processing/128world four-mode alpha oracles; wholeRGB IMG/INP contrast for identical source/model/sampling; fixedseed123 INP replay fullRGBA equality. No fullInvoke parity, image quality, maximum capacity or signed release/installer claim.',
    cleanup:
      'Runner never deletes appData/models/originals/runtime. Root owns payload disposal after physical PID/start and scope exit proof. Failed state is retained for inspection.',
  },
}
function checkpoint() {
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
}
function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence })
  checkpoint()
  console.log(`PASS ${name}`)
}
async function captureFiles(files) {
  return Object.fromEntries(
    await Promise.all(files.map(async (file) => [file, await hashFile(file)])),
  )
}
const sourceFiles = [
  'scripts/qualify-installed-smart-patch.mjs',
  'scripts/smart-patch-qualification-oracles.mjs',
  'scripts/qualification-resource-limits.mjs',
  'scripts/native-smoke-window.mjs',
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/shared/projects/smart-patch-public-generation.ts',
  'src/main/projects/project-smart-patch-generation-action-controller.ts',
  'src/main/projects/project-smart-patch-result-actions.ts',
  'src/main/projects/project-smart-patch-acceptance.ts',
  'src/main/projects/generation-progress-source.ts',
  'src/main/projects/generation-orchestrator.ts',
  'src/shared/projects/generation-progress.ts',
  'src/main/projects/smart-patch-generation-processor.ts',
  'src/main/projects/smart-patch-generation-staging.ts',
  'src/main/projects/project-smart-patch-world-output.ts',
  'src/main/runtime/index.ts',
  'src/renderer/App.vue',
  'src/renderer/components/ProjectCanvas.vue',
  'src/renderer/components/ProjectView.vue',
  'src/renderer/components/ProjectEntitySurface.vue',
  'src/renderer/components/GenerationProgressIndicator.vue',
  'src/renderer/components/ProjectSmartPatchResultsTray.vue',
  'worker-python/pyproject.toml',
  'worker-python/uv.lock',
]
const bundleFiles = [
  'dist/main/main.cjs',
  'dist/preload/preload.cjs',
  'dist/renderer/index.html',
  ...(await readdir('dist/renderer/assets'))
    .filter((name) => /\.(js|css)$/.test(name))
    .map((name) => `dist/renderer/assets/${name}`),
]
let provision, marker, pointer, installedWorkerTree, installed, originalModels, catalogSnapshot
async function verifyProvision() {
  await regular(fixture.provisionReport.path)
  assert.equal(await hashFile(fixture.provisionReport.path), fixture.provisionReport.sha256)
  provision = await jsonFile(fixture.provisionReport.path)
  marker = await jsonFile(path.join(appDataRoot, 'qualification-runtime.json'))
  pointer = await jsonFile(path.join(appDataRoot, 'runtime/current-runtime.json'))
  assert.equal(provision.status, 'activated-qualified')
  assert.equal(provision.appData, appDataRoot)
  assert.equal(marker.report, fixture.provisionReport.path)
  assert.equal(marker.status, 'passed')
  assert.equal(marker.appData, appDataRoot)
  assert.equal(marker.runtimeId, provision.runtimeId)
  assert.equal(marker.confirmedWorkerExit, true)
  assert.equal(provision.confirmedWorkerExit, true)
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
  assert.ok(within(path.join(appDataRoot, 'runtime'), await realpath(pointer.pythonExecutable)))
  assert.ok(within(provision.installed.prefix, provision.installed.workerRoot))
  assert.equal(isQualifiedInferenceWorkerReady(provision.ready), true)
  assert.equal(provision.ready.workerVersion, '0.14.0')
  for (const capability of [
    'smart-patch-execution',
    'smart-patch-seed-confirmation',
    'anima-txt2img',
    'anima-outpaint',
    'illustrious-outpaint',
  ])
    assert.ok(provision.ready.capabilities.includes(capability))
  assert.equal(
    await hashFile('worker-python/pyproject.toml'),
    provision.inputs.worker.pyprojectSha256,
  )
  assert.equal(await hashFile('worker-python/uv.lock'), provision.inputs.worker.lockSha256)
  const checkout = await treeManifest(path.resolve('worker-python/src/imagegen_worker'))
  installedWorkerTree = await treeManifest(provision.installed.workerRoot)
  assert.deepEqual(installedWorkerTree, checkout)
  assert.deepEqual(installedWorkerTree, provision.installed.workerFiles)
  const captured = Object.fromEntries(
    Object.entries(provision.inputs.worker.files).map(([name, value]) => [
      name.replace(/^imagegen_worker\//, ''),
      value,
    ]),
  )
  assert.deepEqual(captured, checkout)
  const config = path.join(provision.installed.prefix, 'resources/sdxl-config')
  assert.deepEqual(await treeManifest(config), provision.inputs.config.files)
  report.provision = {
    report: fixture.provisionReport,
    marker,
    pointer,
    installed: provision.installed,
    ready: provision.ready,
  }
  report.sourceSha256 = await captureFiles(sourceFiles)
  report.bundleSha256 = await captureFiles(bundleFiles)
  report.launcherBounds = await assertUpgradeBounds({ maxRuntimeSeconds: fixture.deadlineSeconds })
  assert.ok(BigInt(report.launcherBounds.memoryMax) <= 2n * 1024n ** 3n)
  await assertRuntimeIdle(appDataRoot, provision.installed.basePrefix)
  check(
    'Fresh noneditable app-owned CPython/current installed worker exactly matches checkout and provision manifest; finite launcher verified',
  )
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
    deadlineSeconds: fixture.deadlineSeconds,
    execute: (file, args, options) =>
      nativeExec(
        file,
        args.map((item) => (item === 'MemoryMax=12G' ? 'MemoryMax=10G' : item)),
        options,
      ),
  })
  assert.ok(
    value.groups.every(
      (group) => BigInt(group.memoryMax) <= 10n * 1024n ** 3n && group.swapMax === '0',
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
  assert.ok(BigInt(launcherMax) <= 2n * 1024n ** 3n)
  assert.equal(readFileSync(path.join(launcherRoot, 'memory.swap.max'), 'utf8').trim(), '0')
  const unique = new Map(value.groups.map((group) => [group.group, BigInt(group.memoryMax)]))
  unique.set(launcherGroup, BigInt(launcherMax))
  const total = [...unique.values()].reduce((sum, limit) => sum + limit, 0n)
  assert.ok(total <= 12n * 1024n ** 3n)
  for (const group of value.groups) observedMemoryGroups.set(group.group, 'native')
  observedMemoryGroups.set(launcherGroup, 'launcher')
  const memoryAtCheck = await observeMemory(label)
  nativeChecks.push(value)
  report.resourceLimitChecks.push({
    label,
    ...value,
    launcherGroup,
    launcherMax,
    uniqueTotalMax: String(total),
    memoryAtCheck,
  })
  checkpoint()
}
async function observeMemory(label) {
  const at = new Date().toISOString()
  const observations = await Promise.all(
    [...observedMemoryGroups].map(async ([group, role]) => {
      const root = `/sys/fs/cgroup${group}`
      try {
        const [current, stat] = await Promise.all([
          readFile(path.join(root, 'memory.current'), 'utf8'),
          readFile(path.join(root, 'memory.stat'), 'utf8'),
        ])
        const fields = Object.fromEntries(
          stat
            .trim()
            .split('\n')
            .map((line) => line.split(/\s+/)),
        )
        const sample = {
          group,
          role,
          current: current.trim(),
          anon: fields.anon,
          file: fields.file,
        }
        for (const value of [sample.current, sample.anon, sample.file]) assert.match(value, /^\d+$/)
        const prior = report.memoryObservations[group] ?? {
          role,
          samples: 0,
          maxCurrent: '0',
          maxAnon: '0',
          maxFile: '0',
        }
        for (const [field, maximum] of [
          ['current', 'maxCurrent'],
          ['anon', 'maxAnon'],
          ['file', 'maxFile'],
        ])
          if (BigInt(sample[field]) > BigInt(prior[maximum])) prior[maximum] = sample[field]
        report.memoryObservations[group] = {
          ...prior,
          samples: prior.samples + 1,
          last: { at, label, current: sample.current, anon: sample.anon, file: sample.file },
        }
        return sample
      } catch (error) {
        if (!['ENOENT', 'ESRCH', 'ENODEV'].includes(error.code)) throw error
        return { group, role, unavailable: error.code }
      }
    }),
  )
  if (observations.every((sample) => !sample.unavailable)) {
    const total = observations.reduce((sum, sample) => sum + BigInt(sample.current), 0n)
    if (total > BigInt(report.maxObservedAggregateMemory?.current ?? '0'))
      report.maxObservedAggregateMemory = { at, label, current: String(total) }
  }
  return observations
}
async function launch() {
  const environment = {
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
  ])
    delete environment[name]
  delete environment.CUDA_VISIBLE_DEVICES
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
  await window.evaluate(() => {
    window.__smartQualificationProgress = []
    window.__smartQualificationRenderedProgress = []
    window.api.projects.onGenerationProgress((value) => {
      window.__smartQualificationProgress.push(value)
      // App's existing subscription schedules Vue's flush before this read-only DOM probe.
      queueMicrotask(() => {
        window.__smartQualificationRenderedProgress.push({
          revision: value.revision,
          current: value.current,
          renderedProgressText:
            document.body.innerText.match(/Denoising step \d+ of \d+/)?.[0] ?? null,
        })
      })
    })
  })
  await expect
    .poll(async () => (await api('list')).some(({ id }) => id === projectId), { timeout: 30000 })
    .toBe(true)
  const record = await database.db
    .selectFrom('project_index')
    .selectAll()
    .where('local_project_key', '=', projectId)
    .executeTakeFirstOrThrow()
  assert.equal(record.file_health, 'ready')
  check('Actual isolated installed-runtime startup indexed portable Project through SQLite')
}

async function openProject() {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
  // The tab renders before App.openProject finishes its workspace refresh. Wait for actual
  // busy-bound controls to become available before choosing the renderer-owned target.
  await expect(window.locator('input[aria-label="Images per click"]')).toBeEnabled({
    timeout: 30_000,
  })
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  await patchSelectionButton().click()
  await assertPatchEditorOwner()
  const overlay = window.getByRole('button', { name: 'Hide mask overlay', exact: true })
  if (await overlay.isVisible()) await overlay.click()
  await assertPatchEditorOwner()
}

function patchSelectionButton() {
  return window
    .locator(`[data-layer-id="${patchId}"]`)
    .getByRole('button', { name: `Select ${patchName}`, exact: true })
}
async function assertPatchEditorOwner() {
  // Selection is renderer-owned; ProjectTab intentionally has no selectedLayerId field.
  await expect(patchSelectionButton()).toHaveAttribute('aria-pressed', 'true')
  await expect(
    window.getByRole('heading', { name: 'Smart Patch bounds', exact: true }),
  ).toBeVisible()
  await expect(window.locator('input[aria-label="Smart Patch width"]')).toHaveValue('128')
  await expect(window.locator('input[aria-label="Smart Patch height"]')).toHaveValue('128')
  await expect(window.locator('[aria-label="Model version"]')).toContainText(
    authored.generationDraft.model.versionName,
  )
}
async function captureFailureContext() {
  const state = await Promise.allSettled([
    current(),
    window.evaluate(() => ({
      activeElement: {
        tagName: document.activeElement?.tagName ?? null,
        ariaLabel: document.activeElement?.getAttribute('aria-label') ?? null,
      },
      layerSelection: [...document.querySelectorAll('[data-layer-id]')].map((row) => ({
        layerId: row.getAttribute('data-layer-id'),
        selectButtons: [...row.querySelectorAll('button[aria-pressed]')].map((button) => ({
          ariaLabel: button.getAttribute('aria-label'),
          pressed: button.getAttribute('aria-pressed'),
          disabled: button.disabled,
        })),
      })),
      model: document.querySelector('[aria-label="Generation model"]')?.textContent ?? null,
      modelVersion: document.querySelector('[aria-label="Model version"]')?.textContent ?? null,
      patchBoundsVisible: [...document.querySelectorAll('h2')].some(
        (heading) =>
          heading.textContent === 'Smart Patch bounds' && heading.getClientRects().length,
      ),
      countDisabled: document.querySelector('input[aria-label="Images per click"]')?.disabled,
      blockingReasons: [...document.querySelectorAll('.generation-blocking-reason')].map(
        (element) => element.innerText,
      ),
      runtimeNotice: (() => {
        const notice = document.querySelector('[aria-label="Image generation status"]')
        return notice
          ? {
              heading: notice.querySelector('h2')?.textContent ?? null,
              detail: notice.querySelector('.notice-detail p')?.textContent ?? null,
              detailOpen: notice.querySelector('details')?.open ?? false,
              visible: notice.getClientRects().length > 0,
            }
          : null
      })(),
    })),
  ])
  report.failureContext = {
    projectId,
    patchId,
    title,
    main: state[0].status === 'fulfilled' ? state[0].value : String(state[0].reason),
    renderer: state[1].status === 'fulfilled' ? state[1].value : String(state[1].reason),
  }
  checkpoint()
  // Preserve the pre-getter DOM observation first; an advisory check may refresh runtime state.
  try {
    report.failureContext.runtime = await window.evaluate(() =>
      Promise.race([
        window.api.runtime.getStatus(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Failure runtime status diagnostic exceeded 15s')),
            15_000,
          ),
        ),
      ]),
    )
  } catch (error) {
    report.failureContext.runtimeDiagnosticError = String(error.stack ?? error)
  }
  checkpoint()
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

async function adoptModels() {
  const db = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  const repository = new ModelRepository(db.db)
  await mkdir(path.join(appDataRoot, 'models'), { recursive: true, mode: 0o700 })
  await directory(path.join(appDataRoot, 'models'))
  installed = {}
  originalModels = {}
  try {
    for (const [key, type, family] of [
      ['encoder', 'qwen3_encoder', 'anima'],
      ['vae', 'vae', 'anima'],
      ['illustrious', 'checkpoint', 'illustrious'],
      ['anima', 'checkpoint', 'anima'],
    ]) {
      const source = fixture.models[key]
      assert.ok(source)
      assert.equal(source.type, type)
      assert.equal(source.family, family)
      const original = await regular(source.path)
      assert.equal(original.size, source.byteSize)
      assert.equal(await hashFile(source.path), source.sha256)
      originalModels[key] = {
        source,
        stat: {
          dev: original.dev,
          ino: original.ino,
          size: original.size,
          mtimeMs: original.mtimeMs,
          ctimeMs: original.ctimeMs,
        },
      }
      if (key === 'encoder' || key === 'vae') {
        const pin = key === 'encoder' ? ANIMA_QWEN3_0_6B_ENCODER : ANIMA_QWEN_IMAGE_VAE
        assert.equal(source.sha256, pin.sha256)
        assert.equal(source.byteSize, pin.sizeBytes)
      }
      const managed = path.join(appDataRoot, 'models', `smart-qualified-${key}.safetensors`)
      if (!existsSync(managed))
        await copyFile(source.path, managed, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE)
      const managedStat = await regular(managed)
      assert.equal(managedStat.size, source.byteSize)
      assert.equal(await hashFile(managed), source.sha256)
      if (key === 'illustrious') await qualifySdxlCheckpoint(managed)
      if (key === 'anima') await qualifyAnimaCheckpoint(managed)
      let entry = await repository.findExactFileDuplicate({ sha256: source.sha256 })
      if (entry) {
        assert.equal(entry.status, 'ready')
        assert.equal(entry.managedPath, managed)
        installed[key] = {
          resourceId: entry.resourceId,
          versionId: entry.versionId,
          managedPath: managed,
        }
      } else {
        const dependency = key === 'encoder' || key === 'vae'
        const origin = source.origin ?? {}
        const published = await repository.publishVerifiedInstallation({
          ...(key === 'anima'
            ? {
                dependencies: [
                  { role: 'qwen3_encoder', existingVersionId: installed.encoder.versionId },
                  { role: 'vae', existingVersionId: installed.vae.versionId },
                ],
              }
            : {}),
          primary: {
            file: {
              managedPath: managed,
              originalFilename: path.basename(source.path),
              sha256: source.sha256,
              sizeBytes: source.byteSize,
              verifiedAt: new Date().toISOString(),
            },
            resource: {
              type,
              displayName: source.name,
              ...(origin.creator ? { creator: origin.creator } : {}),
              source: dependency
                ? { kind: 'supported_dependency', key: `smart-qualification-${key}` }
                : { kind: 'civitai', modelId: origin.modelId },
              sourceMetadata: { qualificationPrecondition: true, origin },
            },
            version: {
              baseModelFamily: family,
              format: 'safetensors',
              name: source.versionName,
              predictionType: key === 'illustrious' ? source.predictionType : null,
              source: dependency
                ? {
                    kind: 'supported_dependency',
                    expectedSha256: source.sha256,
                    revision: origin.revision,
                  }
                : {
                    kind: 'civitai',
                    expectedSha256: source.sha256,
                    versionId: origin.versionId,
                    fileId: origin.fileId,
                  },
              sourceMetadata: { qualificationPrecondition: true, origin },
            },
          },
        })
        installed[key] = { ...published, managedPath: managed }
      }
    }
    // Copied version metadata is advisory; ModelService resolves an explicit exact-file override
    // before its compatibility manifest/default. The merged Cyber resource also owns Anima, so
    // bind this declared qualification policy to the Illustrious version, hash and size only.
    assert.equal(fixture.models.illustrious.predictionType, 'v_prediction')
    const predictionOverride = await repository.setPredictionOverride({
      resourceId: installed.illustrious.resourceId,
      versionId: installed.illustrious.versionId,
      expectedSha256: fixture.models.illustrious.sha256,
      expectedSizeBytes: fixture.models.illustrious.byteSize,
      predictionType: fixture.models.illustrious.predictionType,
    })
    assert.equal(predictionOverride.predictionType, 'v_prediction')
    assert.equal(predictionOverride.sha256, fixture.models.illustrious.sha256)
    assert.equal(predictionOverride.sizeBytes, fixture.models.illustrious.byteSize)
    report.catalogPredictionPolicy = {
      resourceId: installed.illustrious.resourceId,
      versionId: installed.illustrious.versionId,
      ...predictionOverride,
    }
    // Declared qualification schedule policy for these exact V-prediction bytes; prediction type and
    // library schedule policy are separate owners. This is catalog setup, not a Model Manager UI test.
    for (const change of [
      { kind: 'rescale-betas-zero-snr', value: true },
      { kind: 'timestep-spacing', value: 'leading' },
    ]) {
      await repository.setNoiseProfileOverride({
        ...installed.illustrious,
        expectedSha256: fixture.models.illustrious.sha256,
        expectedSizeBytes: fixture.models.illustrious.byteSize,
        change,
      })
    }
    catalogSnapshot = {
      resources: await db.db.selectFrom('model_resource').selectAll().orderBy('id').execute(),
      versions: await db.db
        .selectFrom('model_resource_version')
        .selectAll()
        .orderBy('id')
        .execute(),
    }
    report.models = installed
    report.modelSources = originalModels
    report.catalogSnapshot = catalogSnapshot
    check(
      'Exact genuine trained originals adopted into one current managed catalog; real checkpoint headers and pinned Anima dependency roles verified',
    )
  } finally {
    await db.close()
  }
  const lama = fixture.lamaSource
  assert.equal(lama.sha256, LAMA_OUTPAINT_ARTIFACT.sha256)
  assert.equal(lama.byteSize, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
  const before = await regular(lama.path)
  assert.equal(before.size, lama.byteSize)
  assert.equal(await hashFile(lama.path), lama.sha256)
  const resources = await createInferenceAuxiliaryResourceRoot(appDataRoot)
  const downloader = new ModelDownloader({
    resolveAddresses: async () => ['140.82.112.3'],
    transport: async (url, options) => {
      assert.equal(String(url), LAMA_OUTPAINT_ARTIFACT.url)
      assert.equal(new Headers(options.headers).get('authorization'), null)
      return new Response(Readable.toWeb(createReadStream(lama.path)), {
        status: 200,
        headers: { 'content-length': String(lama.byteSize) },
      })
    },
  })
  const installer = createLamaAuxiliaryInstaller(resources, downloader)
  const preview = await installer.preview()
  await installer.install(preview.planId)
  report.lama = {
    source: lama,
    verified: await new InferenceAuxiliaryResources(resources).resolveVerifiedOutpaintInfill(),
  }
  assert.equal((await regular(lama.path)).mtimeMs, before.mtimeMs)
  check(
    'Real auxiliary installer owns verified pinned LaMa; only its local source transport is a declared adoption precondition',
  )
}

const bbox = { height: 128, width: 128, x: 160, y: 120 }
function raster(name, rect, data) {
  const id = randomUUID()
  const bytes = literalSmartPatchColorPng(rect.width, rect.height, data, 4)
  return {
    bytes,
    layer: {
      asset: {
        bytes: bytes.length,
        height: rect.height,
        width: rect.width,
        path: `assets/layers/${id}.png`,
        sha256: digest(bytes),
      },
      blendMode: 'normal',
      id,
      kind: 'raster',
      locked: false,
      name,
      opacity: 1,
      transform: { x: rect.x, y: rect.y, scaleX: 1, scaleY: 1, rotationDegrees: 0 },
      visible: true,
    },
  }
}
async function prepareProjects() {
  const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  await directory(workspace)
  for (const family of ['illustrious', 'anima'])
    for (const mode of ['txt2img', 'img2img', 'inpaint', 'outpaint']) {
      const name = `Trained Smart ${family} ${mode} ${path.basename(evidenceRoot)}`
      const file = path.join(workspace, `${name}.igs`)
      assert.equal(existsSync(file), false)
      const session = await ProjectSession.create(file, name, {
        placeholdersDir: path.resolve('dist/main/placeholders'),
        scratchDir: path.join(evidenceRoot, 'writer-scratch'),
      })
      const document = structuredClone(session.document)
      document.generationDraft.positivePrompt.text =
        'Independent normal authoring must remain unchanged'
      document.primaryBbox = { height: 64, width: 64, x: -300, y: -200 }
      const model = fixture.models[family]
      const origin = model.origin
      const draft = structuredClone(document.generationDraft)
      draft.model = {
        kind: 'checkpoint',
        baseModelFamily: family,
        civitaiFileId: origin.fileId,
        civitaiModelId: origin.modelId,
        civitaiVersionId: origin.versionId,
        displayName: model.name,
        versionName: model.versionName,
        fileSha256: model.sha256,
        localModelId: installed[family].resourceId,
        localVersionId: installed[family].versionId,
        predictionType: family === 'illustrious' ? model.predictionType : null,
      }
      draft.positivePrompt = {
        text: 'a quiet river valley, trees, soft daylight',
        embeddingRefs: [],
      }
      draft.negativePrompt = { text: 'blur, low quality', embeddingRefs: [] }
      draft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
      draft.seed = { policy: 'fixed', value: 123 }
      draft.loras = []
      draft.vae = null
      draft.vaePrecision = 'Auto'
      draft.sampling = {
        cfgScale: 4,
        denoisingStrength: 0.75,
        steps: 4,
        sampler: family === 'illustrious' ? 'Euler' : null,
        scheduler: family === 'illustrious' ? 'Normal' : null,
        ...(family === 'anima' ? { animaMethod: 'euler' } : {}),
      }
      const maskId = randomUUID()
      const maskBytes =
        mode === 'inpaint' ? encodeProjectMaskPng(Buffer.alloc(32 * 32, 255), 32, 32) : null
      const mask = maskBytes
        ? {
            id: maskId,
            revision: 1,
            asset: {
              path: `assets/masks/${maskId}/${digest(maskBytes)}.png`,
              bytes: maskBytes.length,
              height: 32,
              width: 32,
              sha256: digest(maskBytes),
            },
            bounds: { x: bbox.x + 32, y: bbox.y + 32, height: 32, width: 32 },
          }
        : { id: maskId, revision: 0, asset: null }
      const target = {
        id: randomUUID(),
        kind: 'smart-patch',
        name: `Trained ${family} ${mode} Patch`,
        boundingBox: { ...bbox },
        internalResolution: { width: 256, height: 256 },
        generationDraft: draft,
        mask,
        maskSettings: { blur: 0, padding: 8 },
        coherenceSettings: { mode: 'Gaussian Blur', edgeSize: 0, minimumDenoise: 0 },
        blendMode: 'normal',
        opacity: 1,
        locked: false,
        visible: true,
        rasterSubLayers: [],
        activeRasterSubLayerId: null,
      }
      const pixels = []
      for (let y = 0; y < 128; y++)
        for (let x = 0; x < 128; x++)
          pixels.push(70, 80, 90, mode === 'outpaint' && x >= 64 ? 0 : 255)
      const lower = raster('Protected literal source', bbox, pixels)
      const above = raster(
        'Above-target red marker',
        { x: bbox.x + 112, y: bbox.y + 112, height: 16, width: 16 },
        Array.from({ length: 16 * 16 }, () => [220, 30, 20, 255]).flat(),
      )
      document.layers = [above.layer, target, ...(mode !== 'txt2img' ? [lower.layer] : [])]
      session.applyDocument(document)
      await session.save({
        assets: {
          [above.layer.asset.path]: { bytes: above.bytes },
          ...(mode !== 'txt2img' ? { [lower.layer.asset.path]: { bytes: lower.bytes } } : {}),
          ...(maskBytes ? { [mask.asset.path]: { bytes: maskBytes } } : {}),
        },
      })
      const scenario = {
        family,
        mode,
        title: name,
        projectId: session.localRecoveryKey,
        patchId: target.id,
        patchName: target.name,
        packagePath: file,
        authored: target,
        baseline: document,
        originalPackageSha256: await hashFile(file),
      }
      scenarios.push(scenario)
    }
  useScenario(scenarios[0])
  report.projectPreconditions = scenarios
  check(
    'Eight real portable empty Patch/source preconditions preserve independent normal inputs and above-target neighbors',
  )
}
function useScenario(scenario) {
  ;({ title, projectId, patchId, patchName, packagePath, authored } = scenario)
}

async function fetchPng(url) {
  const result = await application.evaluate(async ({ net }, url) => {
    const response = await net.fetch(url)
    return { status: response.status, bytes: [...new Uint8Array(await response.arrayBuffer())] }
  }, url)
  assert.equal(result.status, 200)
  return Buffer.from(result.bytes)
}
const tray = () =>
  window.getByRole('region', { name: 'Smart Patch Generation Results', exact: true })
async function results() {
  return await api('listSmartPatchGenerationResults', projectId)
}
async function observeProcesses() {
  if (!application) return
  const mainPid = application.process().pid
  const parents = new Map()
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue
    try {
      const status = await readFile(`/proc/${name}/status`, 'utf8')
      parents.set(Number(name), Number(status.match(/^PPid:\s+(\d+)$/m)?.[1]))
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
    }
  }
  const owned = new Set([mainPid])
  for (let changed = true; changed;) {
    changed = false
    for (const [pid, parent] of parents)
      if (owned.has(parent) && !owned.has(pid)) {
        owned.add(pid)
        changed = true
      }
  }
  const activeJobs = database
    ? await database.db
        .selectFrom('generation_queue_item')
        .select('id')
        .where('status', '=', 'running')
        .execute()
    : []
  for (const pid of owned) {
    try {
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
      const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
      const cmdline = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean)
      const role = cmdline.includes('imagegen_worker.inference_main')
        ? 'inference'
        : cmdline.includes('imagegen_worker')
          ? 'derivatives'
          : null
      observedProcesses.set(`${pid}:${start}`, { pid, start })
      if (!role) continue
      const executable = await readlink(`/proc/${pid}/exe`)
      assert.ok(within(path.join(appDataRoot, 'runtime'), executable))
      assert.ok(cmdline.includes('-I') && cmdline.includes('-m'))
      const environment = Object.fromEntries(
        (await readFile(`/proc/${pid}/environ`, 'utf8'))
          .split('\0')
          .filter(Boolean)
          .map((value) => {
            const at = value.indexOf('=')
            return [value.slice(0, at), value.slice(at + 1)]
          }),
      )
      for (const key of ['HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'HF_DATASETS_OFFLINE'])
        assert.equal(environment[key], '1')
      assert.equal(environment.PYTHONPATH, undefined)
      assert.equal(environment.PYTHONHOME, undefined)
      if (role === 'derivatives') assert.equal(environment.CUDA_VISIBLE_DEVICES, '')
      const record = {
        at: new Date().toISOString(),
        pid,
        start,
        role,
        executable,
        cmdline,
        activeJobIds: activeJobs.map(({ id }) => id),
        offline: true,
        cudaVisibleDevices: environment.CUDA_VISIBLE_DEVICES ?? null,
      }
      if (
        !report.observedWorkers.some(
          (item) =>
            item.pid === pid &&
            item.start === start &&
            JSON.stringify(item.activeJobIds) === JSON.stringify(record.activeJobIds),
        )
      )
        report.observedWorkers.push(record)
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
    }
  }
}
function startSampler() {
  sampler = setInterval(() => {
    sampling = sampling
      .then(async () => {
        await observeProcesses()
        await observeMemory('periodic')
        checkpoint()
      })
      .catch((error) => {
        report.processObservationError = String(error.stack ?? error)
      })
  }, 1000)
}
async function stopSampler() {
  clearInterval(sampler)
  await sampling
}
async function captureCandidate(scenario, label) {
  await expect.poll(async () => (await results()).candidates.length, { timeout: 150_000 }).toBe(1)
  const snapshot = await results()
  const candidate = snapshot.candidates[0]
  assert.equal(candidate.kind, 'smart-patch-world-candidate')
  assert.equal(candidate.layerId, patchId)
  assert.equal(candidate.documentId, (await current()).documentId)
  assert.equal(candidate.disposition, 'available')
  assert.equal(candidate.actualSeed, 123)
  const row = await database.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('id', '=', candidate.queueItemId)
    .executeTakeFirstOrThrow()
  assert.equal(row.status, 'completed')
  assert.equal(row.operation, `${scenario.family}-smart-patch`)
  const frozen = JSON.parse(row.frozen_payload_json)
  assert.equal(frozen.mode, scenario.mode)
  assert.equal(frozen.context.layerId, patchId)
  assert.deepEqual(frozen.context.bbox, bbox)
  assert.deepEqual(frozen.context.internalResolution, { width: 256, height: 256 })
  assert.deepEqual(frozen.context.generationDraft, authored.generationDraft)
  assert.equal(frozen.item.item.seed, 123)
  const inference = frozen.item.inference
  const modelCheckpoint =
    scenario.family === 'illustrious' ? inference.checkpoint : inference.model.checkpoint
  assert.equal(modelCheckpoint.sha256, fixture.models[scenario.family].sha256)
  if (scenario.family === 'illustrious') {
    assert.equal(modelCheckpoint.predictionType, 'v_prediction')
    assert.deepEqual(inference.sampling.noiseProfile, {
      schemaVersion: 1,
      baseSchedule: 'sdxl-scaled-linear-v1',
      rescaleBetasZeroSnr: true,
      timestepSpacing: 'leading',
    })
  } else {
    for (const [role, key] of [
      ['qwen3Encoder', 'encoder'],
      ['vae', 'vae'],
    ])
      assert.equal(inference.model[role].sha256, fixture.models[key].sha256)
  }
  const receipt = await database.db
    .selectFrom('generation_candidate_receipt')
    .selectAll()
    .where('candidate_id', '=', candidate.candidateId)
    .executeTakeFirstOrThrow()
  assert.equal(receipt.status, 'completed')
  assert.equal(receipt.queue_item_id, row.id)
  assert.equal(receipt.actual_seed, 123)
  assert.equal(receipt.frozen_payload_sha256, digest(Buffer.from(row.frozen_payload_json)))
  const caseRoot = path.join(evidenceRoot, label)
  await mkdir(caseRoot, { mode: 0o700 })
  const bundle = path.join(appDataRoot, 'generation-queued-inputs/smart-patch', frozen.bundle.id)
  const manifest = await readFile(path.join(bundle, 'manifest.json'))
  assert.equal(digest(manifest), frozen.bundle.manifestSha256)
  await writeFile(path.join(caseRoot, 'input-manifest.json'), manifest, { flag: 'wx', mode: 0o600 })
  await writeFile(
    path.join(caseRoot, 'queue-and-receipt.json'),
    JSON.stringify({ row, receipt }, null, 2),
    { flag: 'wx', mode: 0o600 },
  )
  const inputBytes = {}
  for (const [name, identity] of Object.entries(frozen.files)) {
    const bytes = await readFile(path.join(bundle, name))
    assert.equal(bytes.length, identity.byteSize)
    assert.equal(digest(bytes), identity.sha256)
    inputBytes[name] = bytes
    await writeFile(path.join(caseRoot, name), bytes, { flag: 'wx', mode: 0o600 })
  }
  const source = decodePng(inputBytes['source.png'])
  const sourcePixel = (x, y) => [...source.data.subarray((y * 128 + x) * 4, (y * 128 + x) * 4 + 4)]
  assert.deepEqual(
    sourcePixel(120, 120),
    scenario.mode === 'txt2img' || scenario.mode === 'outpaint' ? [0, 0, 0, 0] : [70, 80, 90, 255],
    'Above-target red is excluded from actual frozen source',
  )
  const bytes = await fetchPng(candidate.imageUrl)
  const decoded = decodePng(bytes)
  const alpha = assertSmartPatchQualificationAlpha({ mode: scenario.mode, ...decoded })
  assert.equal(digest(bytes), receipt.image_sha256)
  assert.equal(bytes.length, receipt.image_byte_size)
  await writeFile(path.join(caseRoot, 'world-result.png'), bytes, { flag: 'wx', mode: 0o600 })
  const colors = new Set()
  for (let offset = 0; offset < decoded.data.length; offset += 4)
    if (decoded.data[offset + 3])
      colors.add(decoded.data.subarray(offset, offset + 3).toString('hex'))
  assert.ok(colors.size > 1, 'This finite trained fixture must have nonsolid generated RGB')
  const progress = await window.evaluate(() => window.__smartQualificationProgress)
  const updates = progress
    .filter(({ current }) => current?.jobId === row.id)
    .map(({ current }) => current)
  const renderedProgress = await window.evaluate(() => window.__smartQualificationRenderedProgress)
  const renderedUpdates = renderedProgress.filter(({ current }) => current?.jobId === row.id)
  report.progressObservations ??= []
  report.progressObservations.push({
    label,
    queueItemId: row.id,
    progress: updates,
    renderedProgress: renderedUpdates,
  })
  checkpoint()
  assert.ok(
    updates.length > 0 && updates.some(({ step }) => step > 0),
    'Actual installed numerical denoising must emit correlated positive progress',
  )
  assert.ok(
    updates.every(
      (update) =>
        update.projectKey === projectId &&
        update.documentId === row.document_id &&
        update.statusSequence === receipt.expected_status_sequence,
    ),
    'Smart progress must retain the actual running Project/document/queue-attempt owner',
  )
  assert.ok(
    renderedUpdates.some(
      ({ current, renderedProgressText }) =>
        current.step > 0 &&
        renderedProgressText === `Denoising step ${current.step} of ${current.totalSteps}`,
    ),
    'Actual Smart denoising must render a positive current-job step counter after Vue updates',
  )
  await observeProcesses()
  const observation = {
    label,
    family: scenario.family,
    mode: scenario.mode,
    projectId,
    candidate,
    queueItemId: row.id,
    frozen,
    receipt,
    alpha,
    pngSha256: digest(bytes),
    rgbaSha256: digest(decoded.data),
    generatedColors: colors.size,
    progress: updates,
    renderedProgress: renderedUpdates,
    caseRoot,
  }
  report.scenarios.push(observation)
  check(
    `${label}: actual trained public completion, exact frozen inputs/receipt/seed/progress and independent full world alpha`,
    {
      queueItemId: row.id,
      pngSha256: observation.pngSha256,
      rgbaSha256: observation.rgbaSha256,
      alpha,
    },
  )
  return { observation, bytes, decoded }
}

async function generatePublic() {
  await assertPatchEditorOwner()
  const count = window.locator('input[aria-label="Images per click"]')
  await count.fill('1')
  await count.press('Enter')
  await expect(count).toHaveValue('1')
  await assertPatchEditorOwner()
  const button = window.getByRole('button', { name: 'Generate', exact: true })
  await expect(button).toBeEnabled({ timeout: 120_000 })
  await button.click()
}
async function cleanClose() {
  await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
}
async function acceptSaveReopen(scenario, captured) {
  const before = await current()
  assert.equal(before.dirty, false)
  assert.equal(before.canUndo, false)
  const originalCount = patch(before).rasterSubLayers.length
  const beforePackage = await hashFile(packagePath)
  assert.equal(beforePackage, scenario.savedPackageSha256 ?? scenario.originalPackageSha256)
  assert.deepEqual(before.generationDraft, scenario.baseline.generationDraft)
  assert.deepEqual(patch(before).generationDraft, scenario.authored.generationDraft)
  await tray()
    .getByRole('checkbox', { name: 'Select Smart Patch candidate 1', exact: true })
    .check()
  await tray().getByRole('button', { name: 'Add 1 as Variant', exact: true }).click()
  await expect
    .poll(async () => patch(await current()).rasterSubLayers.length)
    .toBe(originalCount + 1)
  assert.equal((await current()).dirty, true)
  assert.equal((await results()).candidates.length, 0)
  assert.equal(await hashFile(packagePath), beforePackage, 'Add must not implicitly Save')
  await canvas().getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => patch(await current()).rasterSubLayers.length).toBe(originalCount)
  assert.equal((await current()).canUndo, false, 'One successful Add owns exactly one Undo')
  await canvas().getByRole('button', { name: 'Redo', exact: true }).click()
  await expect
    .poll(async () => patch(await current()).rasterSubLayers.length)
    .toBe(originalCount + 1)
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await current()).dirty, { timeout: 120_000 }).toBe(false)
  const saved = await readIgsPackage(packagePath)
  const target = saved.project.layers.find(({ id }) => id === patchId)
  assert.equal(target.kind, 'smart-patch')
  assert.equal(target.rasterSubLayers.length, originalCount + 1)
  const accepted = target.rasterSubLayers.find(
    (variant) =>
      variant.generationProvenance.executionResultContext.candidateId ===
      captured.observation.candidate.candidateId,
  )
  assert.ok(accepted)
  assert.equal(target.activeRasterSubLayerId, accepted.id)
  assert.equal(accepted.generationProvenance.kind, `${scenario.family}-smart-patch`)
  assert.equal(accepted.generationProvenance.generationConfiguration.sampling.actualSeed, 123)
  assert.equal(
    accepted.generationProvenance.executionResultContext.queueItemId,
    captured.observation.queueItemId,
  )
  assert.equal(
    accepted.generationProvenance.executionResultContext.output.sha256,
    captured.observation.pngSha256,
  )
  assert.equal((await saved.readMember(accepted.asset.path)).equals(captured.bytes), true)
  assert.deepEqual(
    accepted.generationProvenance.layerSourceContext.generationDraft,
    scenario.authored.generationDraft,
  )
  assert.deepEqual(accepted.generationProvenance.layerSourceContext.bbox, bbox)
  for (const key of ['generationDraft', 'primaryBbox'])
    assert.deepEqual(saved.project[key], scenario.baseline[key])
  assert.deepEqual(
    saved.project.layers.filter(({ id }) => id !== patchId),
    scenario.baseline.layers.filter(({ id }) => id !== patchId),
  )
  for (const key of [
    'generationDraft',
    'boundingBox',
    'internalResolution',
    'mask',
    'maskSettings',
    'coherenceSettings',
    'visible',
    'locked',
    'opacity',
    'blendMode',
  ])
    assert.deepEqual(target[key], scenario.authored[key])
  const journal = await database.db
    .selectFrom('generation_acceptance_journal')
    .selectAll()
    .where('local_project_key', '=', projectId)
    .execute()
  assert.deepEqual(journal, [], 'Successful journaled Add must finish its shadow/staging handoff')
  scenario.savedPackageSha256 = await hashFile(packagePath)
  await copyFile(
    packagePath,
    path.join(captured.observation.caseRoot, 'saved.igs'),
    constants.COPYFILE_EXCL,
  )
  captured.observation.accepted = accepted
  captured.observation.savedPackageSha256 = scenario.savedPackageSha256
  await cleanClose()
  await openProject()
  const reopened = patch(await current())
  assert.equal(reopened.rasterSubLayers.length, originalCount + 1)
  assert.equal(reopened.activeRasterSubLayerId, accepted.id)
  assert.equal((await fetchPng(reopened.activeRaster.imageUrl)).equals(captured.bytes), true)
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true')
  await expect
    .poll(() =>
      sample(`${captured.observation.label}-above-preserved`, { x: bbox.x + 120, y: bbox.y + 120 }),
    )
    .toEqual([220, 30, 20, 255])
  if (scenario.mode === 'inpaint' || scenario.mode === 'outpaint')
    await expect
      .poll(() =>
        sample(`${captured.observation.label}-protected-source`, { x: bbox.x + 8, y: bbox.y + 80 }),
      )
      .toEqual([70, 80, 90, 255])
  await sample(`${captured.observation.label}-generated-core-observation`, {
    x: bbox.x + (scenario.mode === 'outpaint' ? 96 : 40),
    y: bbox.y + 48,
  })
  await assertPatchEditorOwner()
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled({
    timeout: 120_000,
  })
  await expect(
    window.getByRole('heading', { name: 'Image generation needs repair', exact: true }),
  ).toHaveCount(0)
  captured.observation.healthyReopenedUi = {
    selectedPatchId: patchId,
    generateEnabled: true,
    repairNoticeVisible: false,
    checkedBeforeDiagnosticStatusGetter: true,
  }
  await screenshot(`${captured.observation.label}-saved-reopened`)
  check(
    `${captured.observation.label}: explicit Add owns one Undo, exact journal handoff/Save assets/provenance and real reopen; neighbors preserved`,
    { variantId: accepted.id, packageSha256: scenario.savedPackageSha256 },
  )
}
function assertSameNumericalInputs(left, right) {
  assert.equal(left.frozen.files['source.png'].sha256, right.frozen.files['source.png'].sha256)
  assert.deepEqual(left.frozen.files['model-source.png'], right.frozen.files['model-source.png'])
  assert.deepEqual(left.frozen.item.inference, right.frozen.item.inference)
  assert.deepEqual(left.frozen.context.internalResolution, right.frozen.context.internalResolution)
  assert.deepEqual(left.frozen.context.bbox, right.frozen.context.bbox)
}
async function verifyFinalIdentity() {
  assert.deepEqual(await treeManifest(provision.installed.workerRoot), installedWorkerTree)
  assert.deepEqual(await jsonFile(path.join(appDataRoot, 'qualification-runtime.json')), marker)
  assert.deepEqual(await jsonFile(path.join(appDataRoot, 'runtime/current-runtime.json')), pointer)
  assert.equal(await hashFile(fixture.provisionReport.path), fixture.provisionReport.sha256)
  assert.deepEqual(await captureFiles(sourceFiles), report.sourceSha256)
  assert.deepEqual(await captureFiles(bundleFiles), report.bundleSha256)
  report.finalInstalledWorkerTree = await treeManifest(provision.installed.workerRoot)
  for (const [key, descriptor] of Object.entries(originalModels)) {
    const stat = await regular(descriptor.source.path)
    assert.deepEqual(
      {
        dev: stat.dev,
        ino: stat.ino,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        ctimeMs: stat.ctimeMs,
      },
      descriptor.stat,
    )
    assert.equal(await hashFile(descriptor.source.path), descriptor.source.sha256)
    assert.equal(await hashFile(installed[key].managedPath), descriptor.source.sha256)
  }
  assert.equal(await hashFile(fixture.lamaSource.path), fixture.lamaSource.sha256)
  assert.equal(await hashFile(report.lama.verified.managedPath), fixture.lamaSource.sha256)
  check(
    'Original trained files, exact managed copies, provision/pointer, complete installed worker/source and built bundles remain unchanged',
  )
}

checkpoint()
try {
  await verifyProvision()
  await adoptModels()
  await prepareProjects()
  report.gpuBefore = (
    await nativeExec(
      '/usr/bin/nvidia-smi',
      ['--query-gpu=name,memory.total,memory.used,driver_version', '--format=csv,noheader'],
      { timeout: 10_000 },
    )
  ).stdout.trim()
  await launch()
  startSampler()
  const runtime = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(runtime.ok, true)
  assert.equal(runtime.value.kind, 'ready')
  const models = await window.evaluate(() => window.api.models.getCatalog())
  assert.equal(models.ok, true)
  report.nativeCatalog = models.value
  for (const family of ['illustrious', 'anima']) {
    const resource = models.value.find(({ id }) => id === installed[family].resourceId)
    const version = resource?.versions.find(({ id }) => id === installed[family].versionId)
    assert.ok(version)
    assert.equal(version.fileStatus, 'ready')
    assert.equal(version.sha256, fixture.models[family].sha256)
    assert.equal(version.baseModelFamily, family)
    if (family === 'illustrious') {
      assert.equal(version.predictionType, 'v_prediction')
      assert.equal(version.predictionTypeSource, 'user')
      assert.equal(version.noiseProfile.effective.rescaleBetasZeroSnr, true)
      assert.equal(version.noiseProfile.effective.timestepSpacing, 'leading')
    } else assert.equal(version.anima.architecture, 'anima-base-1.0')
  }
  const completed = new Map()
  for (const scenario of scenarios) {
    useScenario(scenario)
    await openProject()
    const before = await current()
    assert.equal(before.dirty, false)
    await generatePublic()
    const primary = await captureCandidate(scenario, `${scenario.family}-${scenario.mode}`)
    assert.equal((await current()).documentRevision, before.documentRevision)
    assert.equal((await current()).dirty, false)
    assert.equal((await current()).canUndo, false)
    assert.equal(await hashFile(packagePath), scenario.originalPackageSha256)
    await bounds(`${scenario.family}-${scenario.mode}-completed`)
    await acceptSaveReopen(scenario, primary)
    completed.set(`${scenario.family}-${scenario.mode}`, primary)
    if (scenario.mode === 'inpaint') {
      await generatePublic()
      const replay = await captureCandidate(scenario, `${scenario.family}-inpaint-replay`)
      assertSameNumericalInputs(primary.observation, replay.observation)
      assert.deepEqual(
        primary.observation.frozen.files,
        replay.observation.frozen.files,
        'Own accepted contribution must not enter subsequent frozen below-target source/masks',
      )
      assert.equal(
        replay.bytes.equals(primary.bytes),
        true,
        'Fixed seed/public INP replay must reproduce exact whole PNG',
      )
      const img = completed.get(`${scenario.family}-img2img`)
      assertSameNumericalInputs(img.observation, primary.observation)
      report.numericControls ??= []
      report.numericControls.push({
        family: scenario.family,
        ...assertSmartPatchQualificationRgbPair({
          img: img.decoded,
          inpaint: primary.decoded,
          replay: replay.decoded,
        }),
      })
      await acceptSaveReopen(scenario, replay)
    }
    await cleanClose()
  }
  assert.equal(report.scenarios.length, 10)
  assert.equal(report.numericControls.length, 2)
  await stopSampler()
  assert.equal(report.processObservationError, undefined)
  for (const scenario of report.scenarios)
    assert.ok(
      report.observedWorkers.some(
        ({ role, activeJobIds }) =>
          role === 'inference' && activeJobIds.includes(scenario.queueItemId),
      ),
      `Actual installed inference child must be observed for ${scenario.label}`,
    )
  assert.ok(report.observedWorkers.some(({ role }) => role === 'derivatives'))
  const observed = [...observedProcesses.values()]
  await closeNative('final')
  report.nativeClosures.push({
    label: 'all-observed-native-cpu-inference-actors',
    ...(await confirmQualificationProcessExit([{ processIdentities: observed, groups: [] }])),
  })
  assert.deepEqual(report.pageErrors, [])
  await verifyFinalIdentity()
  report.gpuAfter = (
    await nativeExec(
      '/usr/bin/nvidia-smi',
      ['--query-gpu=name,memory.total,memory.used,driver_version', '--format=csv,noheader'],
      { timeout: 10_000 },
    )
  ).stdout.trim()
  report.outcome = 'passed'
  report.completedAt = new Date().toISOString()
  check(
    'Ten public trained completions, two masked RGB/replay controls and all observed physical worker exits qualified within the declared finite boundary',
  )
} catch (error) {
  report.outcome = 'failed'
  report.error = { name: error.name, message: error.message, stack: error.stack }
  checkpoint()
  if (window && !window.isClosed()) {
    await captureFailureContext().catch((cause) => {
      report.failureContextError = String(cause.stack ?? cause)
      checkpoint()
    })
    await screenshot('failure-before-cleanup').catch(() => undefined)
  }
  throw error
} finally {
  await stopSampler()
  if (application)
    await closeNative('finally').catch((error) => {
      report.cleanupError = String(error.stack ?? error)
      report.outcome = 'failed'
    })
  if (database) await database.close()
  checkpoint()
}
