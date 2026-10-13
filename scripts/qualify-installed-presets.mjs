/** Opt-in real Project Apply → installed EPS/V worker → accepted .igs → result-preset gate. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, mkdir, open, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import { _electron as electron, expect as baseExpect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import {
  assertInstalledPresetConfiguration,
  assertInstalledPresetDraft,
  assertInstalledPresetFrozen,
  assertInstalledPresetResultPayload,
  assertInstalledPresetRetainedRows,
  installedPresetCases,
  normalizeInstalledPresetExecutionInputs,
  validateInstalledPresetFixture,
} from './installed-preset-qualification.mjs'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'
import { assertUpgradeBounds } from './upgrade-qualification-worker.mjs'

assert.equal(process.argv.length, 4, 'Expected exactly --fixture ABS.')
assert.equal(process.argv[2], '--fixture', 'Expected exactly --fixture ABS.')
assert.ok(path.isAbsolute(process.argv[3]), 'Fixture must be an absolute path.')
assert.equal(path.resolve(process.argv[3]), process.argv[3], 'Fixture must be normalized.')

const expect = baseExpect.configure({ timeout: 120_000 })
const fixturePath = process.argv[3]
const fixture = await readJson(fixturePath, 64 * 1024)
const plan = validateInstalledPresetFixture(fixture)
const reference = await readPinnedJson(fixture.referenceFixture)
assert.equal(reference.profile, 'anima-regression')
assert.equal(reference.stage, 'sampling')
const appData = reference.appData
await canonicalDirectory(appData)
assert.equal(path.basename(appData), 'imagegen-studio')
assert.equal(path.basename(path.dirname(appData)), 'data')
const poolRoot = path.dirname(path.dirname(appData))
const artifactRoot = path.join(homedir(), '.codex/artifacts/imagegen-studio')
assert.ok(poolRoot.startsWith(artifactRoot + path.sep))
assert.ok(fixture.artifacts.startsWith(artifactRoot + path.sep))
assert.ok(
  !fixture.artifacts.startsWith(poolRoot + path.sep) &&
    !poolRoot.startsWith(fixture.artifacts + path.sep) &&
    fixture.artifacts !== poolRoot,
  'Fresh evidence must be separate from the protected runtime/catalog pool.',
)
const provision = await readJson(path.join(appData, 'qualification-runtime.json'))
assert.equal(provision.status, 'passed')
assert.equal(provision.appData, appData)
const pointer = await readJson(path.join(appData, 'runtime/current-runtime.json'))
assert.equal(pointer.runtimeId, provision.runtimeId)
const installed = await readJson(provision.report, 32 * 1024 * 1024)
assert.equal(installed.status, 'activated-qualified')
assert.equal(installed.confirmedWorkerExit, true)
assert.equal(installed.ready.workerVersion, '0.14.0')
assert.equal(installed.ready.runtimeProfile, 'linux-nvidia')
const workerRoot = installed.installed.workerRoot
await canonicalDirectory(workerRoot)
assert.ok(workerRoot.startsWith(path.join(appData, 'runtime') + path.sep))
const workerBaseline = await readPinnedJson(fixture.workerBaseline)
assert.equal(workerBaseline.status, 'passed')
assert.equal(workerBaseline.workerVersion, '0.14.0')
assert.equal(Object.keys(workerBaseline.workerFiles).length, 44)
const launcherBounds = await assertUpgradeBounds({ maxRuntimeSeconds: 1800 })
assert.ok(BigInt(launcherBounds.memoryMax) <= BigInt(2 * 1024 ** 3))

const sectionLabels = {
  cfgRescale: 'CFG Rescale',
  guidance: 'Steps & CFG',
  loras: 'LoRAs',
  model: 'Model',
  negativePrompt: 'Negative Prompt',
  prompt: 'Prompt',
  sampling: 'Sampler & Scheduler',
  seed: 'Seed',
  size: 'Size',
  vae: 'VAE',
  vaePrecision: 'VAE Precision',
}
const sourceFiles = [
  'scripts/qualify-installed-presets.mjs',
  'scripts/installed-preset-qualification.mjs',
  'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs',
  'scripts/upgrade-qualification-worker.mjs',
  'src/renderer/App.vue',
  'src/renderer/components/ApplyPresetModal.vue',
  'src/renderer/components/PresetPayloadEditor.vue',
  'src/renderer/components/ProjectView.vue',
  'src/renderer/components/PresetManager.vue',
  'src/renderer/components/result-preset-draft.ts',
  'src/shared/presets/preset-application.ts',
  'src/shared/presets/preset-schema.ts',
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/main/projects/project-service.ts',
  'src/main/projects/project-session.ts',
  'src/main/projects/igs-package.ts',
  'src/main/projects/generation-bootstrap.ts',
  'src/main/projects/generation-queue.ts',
  'src/main/projects/generation-processor.ts',
  'src/main/projects/generation-orchestrator.ts',
  'src/main/projects/generation-worker-client.ts',
  'src/main/projects/project-generation-preparation.ts',
  'src/main/projects/project-generation-target.ts',
  'src/main/projects/project-generation-provenance.ts',
  'src/main/projects/project-generation-acceptance.ts',
  'src/main/projects/generation-staging.ts',
  'src/main/projects/illustrious-generation-loras.ts',
  'src/main/projects/illustrious-generation-vae.ts',
  'src/main/models/model-repository.ts',
  'src/main/models/model-service.ts',
  'src/main/presets/preset-repository.ts',
  'src/shared/projects/project-schema.ts',
  'src/shared/projects/illustrious-noise-profile.ts',
  'src/shared/projects/generation-settings-comparison.ts',
  'worker-python/uv.lock',
  ...Object.keys(workerBaseline.workerFiles).map((relative) => {
    assert.ok(
      !path.isAbsolute(relative) &&
        path.normalize(relative) === relative &&
        !relative.startsWith('..'),
    )
    return `worker-python/src/imagegen_worker/${relative}`
  }),
]
const report = {
  schemaVersion: 1,
  profile: fixture.profile,
  status: 'running',
  startedAt: new Date().toISOString(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  fixturePath,
  fixtureSha256: await hashFile(fixturePath),
  referenceFixture: fixture.referenceFixture,
  workerBaseline: fixture.workerBaseline,
  appData,
  runtimeId: pointer.runtimeId,
  installedReady: installed.ready,
  launcherBounds,
  literalPlan: plan,
  sourceSha256: Object.fromEntries(
    await Promise.all(sourceFiles.map(async (file) => [file, await hashFile(file)])),
  ),
  bundleSha256: Object.fromEntries(
    await Promise.all(
      [
        'dist/main/main.cjs',
        'dist/preload/preload.cjs',
        'dist/renderer/index.html',
        ...(await readdir('dist/renderer/assets'))
          .filter((name) => /\.(js|css)$/.test(name))
          .map((name) => `dist/renderer/assets/${name}`),
      ].map(async (file) => [file, await hashFile(file)]),
    ),
  ),
  checks: [],
  generations: [],
  pairs: [],
  ownedProjects: [],
  sourcePresets: [],
  resultPresets: [],
  pageErrors: [],
  screenshots: [],
  resourceLimitChecks: [],
  boundary: {
    actual:
      'Built Project preset picker and editable selected-section Apply through real Main resource verification; trained installed NoobAI EPS/V completions; independent manually authored Fixed0 controls; explicit Add Raster/Save/close/reopen/Compare/Save Preset from Result through real SQLite.',
    preconditions:
      'One existing protected qualified runtime/catalog, unchanged exact checkpoint/LoRA/native external VAE files and the explicitly pinned current worker0.14 source manifest. No installation, downloads, copied runtimes, mocked handlers, fixture workers or library policy edits.',
    limits:
      'Four finite full/partial EPS/V Apply cases and four same-execution manual controls. TXT256²/EulerNormal/N3/CFG4/Fixed0/DigitalArt−0.5/externalVAEFP32 only; no image/outpaint/Anima/SmartPatch/quality/Invoke pixel/release parity claim.',
    cleanup:
      'Fresh reports and images are compact evidence. Generated Project files/rows, source/result presets and temporary generation inputs remain explicitly listed for root cleanup after physical native/worker exit; the reusable runtime/catalog is protected.',
  },
}
let reportHandle
let database
let repository
let application
let window
let nativeProcess
let mainLog
let initialCatalog
let initialModelRows
let initialQueue
let initialCursors
let initialPresets
let modelFiles
let workerFiles
let workerAssets
let cases
let activeProject

const environment = {
  ...process.env,
  NODE_ENV: 'production',
  XDG_DATA_HOME: path.join(poolRoot, 'data'),
  XDG_CONFIG_HOME: path.join(poolRoot, 'config'),
  XDG_CACHE_HOME: path.join(poolRoot, 'cache'),
}
for (const name of [
  'ELECTRON_RUN_AS_NODE',
  'IMAGEGEN_TEST_IMAGE_WORKER',
  'IMAGEGEN_DEV_SERVER_URL',
  'PYTHONPATH',
  'PYTHONHOME',
])
  delete environment[name]

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}
async function hashFile(filename) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(filename)) hash.update(bytes)
  return hash.digest('hex')
}
async function canonicalDirectory(directory) {
  const entry = await lstat(directory)
  assert.ok(entry.isDirectory() && !entry.isSymbolicLink())
  assert.equal(await realpath(directory), directory)
}
async function readJson(filename, maximum = 1024 * 1024) {
  const entry = await lstat(filename)
  assert.ok(entry.isFile() && !entry.isSymbolicLink())
  assert.equal(await realpath(filename), filename)
  assert.ok(entry.size > 0 && entry.size <= maximum)
  return JSON.parse(await readFile(filename, 'utf8'))
}
async function readPinnedJson(descriptor) {
  const value = await readJson(descriptor.path, 32 * 1024 * 1024)
  assert.equal(await hashFile(descriptor.path), descriptor.sha256)
  return value
}
function metadata(entry) {
  return {
    dev: entry.dev,
    ino: entry.ino,
    mode: entry.mode,
    size: entry.size,
    mtimeMs: entry.mtimeMs,
    ctimeMs: entry.ctimeMs,
  }
}
async function snapshotFile(filename, expectedSha = null) {
  const entry = await lstat(filename)
  assert.ok(entry.isFile() && !entry.isSymbolicLink())
  assert.equal(await realpath(filename), filename)
  const digest = await hashFile(filename)
  if (expectedSha !== null) assert.equal(digest, expectedSha)
  assert.deepEqual(metadata(await lstat(filename)), metadata(entry))
  return { path: filename, sha256: digest, ...metadata(entry) }
}
async function snapshotWorker() {
  const result = {}
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert.equal(entry.isSymbolicLink(), false)
      if (entry.name === '__pycache__' || entry.name.endsWith('.pyc')) continue
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(filename)
      else if (entry.isFile())
        result[path.relative(workerRoot, filename)] = await snapshotFile(filename)
    }
  }
  await visit(workerRoot)
  assert.equal(Object.keys(result).length, Object.keys(workerBaseline.workerFiles).length)
  return result
}
async function checkpoint() {
  if (!reportHandle) return
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n')
  let offset = 0
  while (offset < bytes.length) {
    const { bytesWritten } = await reportHandle.write(bytes, offset, bytes.length - offset, offset)
    assert.ok(bytesWritten > 0)
    offset += bytesWritten
  }
  await reportHandle.truncate(bytes.length)
  await reportHandle.sync()
}
async function check(name, evidence = {}) {
  report.checks.push({ name, at: new Date().toISOString(), ...evidence })
  console.log(`PASS ${name}`)
  await checkpoint()
}
async function tableRows(table) {
  return (await database.db.selectFrom(table).selectAll().execute()).sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  )
}
async function modelRows() {
  const result = {}
  for (const table of [
    'model_resource',
    'model_resource_version',
    'local_model_file',
    'checkpoint_prediction_override',
    'checkpoint_noise_profile_override',
  ])
    result[table] = await tableRows(table)
  return result
}
async function bounds(phase) {
  const value = await boundQualificationProcess(nativeProcess.pid, { deadlineSeconds: 1800 })
  const aggregateMax = value.groups.reduce((total, group) => total + BigInt(group.memoryMax), 0n)
  assert.ok(
    aggregateMax <= BigInt(14 * 1024 ** 3),
    'Actual native groups cannot collectively exceed 14GiB including the bounded actor.',
  )
  report.resourceLimitChecks.push({ phase, ...value })
  await checkpoint()
}
async function runtimeUsers() {
  const users = []
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue
    try {
      const args = (await readFile(`/proc/${name}/cmdline`, 'utf8')).split('\0').filter(Boolean)
      if (!args[0]?.startsWith(path.join(appData, 'runtime') + path.sep)) continue
      const stat = await readFile(`/proc/${name}/stat`, 'utf8')
      users.push({
        pid: Number(name),
        start: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19],
        command: args,
      })
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
    }
  }
  return users
}
async function api(scope, method, ...args) {
  const value = await window.evaluate(
    ({ scope, method, args }) => window.api[scope][method](...args),
    { scope, method, args },
  )
  assert.equal(value.ok, true, JSON.stringify(value))
  return value.value
}
async function tab(project) {
  const value = await api('projects', 'open', project.id)
  assert.equal(value.kind, 'opened')
  return value.tab
}
async function setInput(label, value, scope = window) {
  const input = scope.locator(`input[aria-label="${label}"]`)
  await input.fill(String(value))
  await input.press('Tab')
}
async function setSelect(label, value, scope = window) {
  const control = scope.locator(`[aria-label="${label}"]`)
  const trigger = control
    .locator(
      'xpath=ancestor-or-self::*[contains(concat(" ",normalize-space(@class)," ")," n-select ")][1]',
    )
    .locator('.n-base-selection')
  await expect(trigger).not.toHaveClass(/n-base-selection--disabled/)
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()
  const menu = window.locator('.n-base-select-menu:visible')
  await expect(menu).toHaveCount(1)
  const escaped = value
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+')
  const option = menu
    .locator('.n-base-select-option')
    .filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`) })
  await expect(option).toHaveCount(1)
  await expect(option).not.toHaveClass(/n-base-select-option--disabled/)
  await option.click()
}
async function screenshot(name, surface = null) {
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const filename = path.join(fixture.artifacts, name)
  const clip = surface ? await surface.boundingBox() : null
  assert.ok(!surface || clip)
  await window.screenshot({ path: filename, animations: 'disabled', ...(clip ? { clip } : {}) })
  report.screenshots.push({ path: filename, ...(clip ? { clip } : {}) })
  await checkpoint()
}
async function packageFor(project) {
  const indexed = await database.db
    .selectFrom('project_index')
    .select('canonical_path')
    .where('local_project_key', '=', project.id)
    .executeTakeFirstOrThrow()
  const saved = await readIgsPackage(indexed.canonical_path)
  assert.equal(saved.project.documentId, project.documentId)
  return { path: indexed.canonical_path, sha256: await hashFile(indexed.canonical_path), saved }
}
async function saveProject(project) {
  const button = window.getByRole('button', { name: 'Save Project', exact: true })
  await expect(button).toBeEnabled()
  await button.click()
  await expect.poll(async () => (await tab(project)).dirty).toBe(false)
  await expect(window.locator('.document-state')).toHaveText('Saved')
  return await packageFor(project)
}
async function createProject(caseId, role) {
  const title = `Installed preset ${caseId} ${role} ${Date.now().toString(36)}`
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window
    .getByLabel('Workspace navigation')
    .getByRole('button', { name: 'New Project', exact: true })
    .click()
  const dialog = window.getByRole('dialog', { name: 'New Project', exact: true })
  await dialog.getByRole('textbox', { name: 'Project name', exact: true }).fill(title)
  await setInput('Project width', 256, dialog)
  await setInput('Project height', 256, dialog)
  await dialog.getByRole('button', { name: 'Create Project', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
  const listed = (await api('projects', 'list')).filter((entry) => entry.title === title)
  assert.equal(listed.length, 1)
  const opened = await tab(listed[0])
  const project = { ...listed[0], documentId: opened.documentId }
  activeProject = project
  const stored = await packageFor(project)
  report.ownedProjects.push({
    id: project.id,
    title,
    documentId: project.documentId,
    path: stored.path,
    role,
    caseId,
  })
  await checkpoint()
  return project
}
async function closeProject(project, { discardCandidate = null } = {}) {
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  const projectTab = window.getByRole('tab', { name: project.title, exact: true })
  const guard = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect
    .poll(async () =>
      (await projectTab.count()) === 0
        ? 'closed'
        : (await guard.isVisible())
          ? 'decision'
          : 'waiting',
    )
    .not.toBe('waiting')
  if (await projectTab.count()) {
    assert.ok(
      discardCandidate,
      'Routine saved accepted-result close cannot invent a discard decision.',
    )
    await guard.getByRole('button', { name: 'Discard Candidates and Close', exact: true }).click()
  }
  await expect(projectTab).toHaveCount(0)
  if (discardCandidate) {
    assert.deepEqual(
      (await tableRows('generation_queue_item')).find(
        ({ id }) => id === discardCandidate.queueItemId,
      ),
      discardCandidate.row,
    )
    assert.deepEqual(
      (await tableRows('generation_candidate_receipt')).find(
        ({ queue_item_id }) => queue_item_id === discardCandidate.queueItemId,
      ),
      discardCandidate.receipt,
    )
    const tombstone = (await tableRows('generation_staging_discarded_session')).find(
      (row) =>
        row.local_project_key === project.id &&
        row.staging_session_id === discardCandidate.row.staging_session_id,
    )
    assert.ok(
      tombstone,
      'Explicit control close must durably discard its provisional staging session.',
    )
    const stagingPath = path.join(
      appData,
      'recovery',
      'generation-staging',
      project.id,
      discardCandidate.row.staging_session_id,
    )
    await assert.rejects(lstat(stagingPath), { code: 'ENOENT' })
    discardCandidate.discardedAtCleanClose = {
      tombstone,
      stagingPath,
      originalQueueAndReceiptRetained: true,
    }
    await checkpoint()
  }
  activeProject = null
}
async function reopenProject(project) {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toBeVisible()
  activeProject = project
}
async function manualAuthor(project, payload) {
  const model = payload.model
  if ((await tab(project)).generationDraft.model?.localVersionId !== model.localVersionId) {
    await window.locator('[aria-label="Generation model"]').click()
    await window.getByText(model.displayName, { exact: true }).last().click()
    await expect
      .poll(async () => (await tab(project)).generationDraft.model?.localModelId)
      .toBe(model.localModelId)
    await setSelect('Model version', model.versionName)
  }
  await expect
    .poll(async () => (await tab(project)).generationDraft.model?.localVersionId)
    .toBe(model.localVersionId)
  await setSelect('Sampler', payload.sampling.sampler)
  await setSelect('Scheduler', payload.sampling.scheduler)
  await setInput('Steps', payload.guidance.steps)
  await setInput('CFG scale', payload.guidance.cfgScale)
  const random = window.getByRole('switch', { name: 'Random seed switch', exact: true })
  if ((await random.getAttribute('aria-checked')) === 'true') await random.click()
  await setInput('Generation seed', payload.seed.value)
  for (const [dimension, value] of Object.entries(payload.size)) {
    const label = `Generation area ${dimension}`
    const input = window.locator(`input[aria-label="${label}"]`)
    await input.fill(String(value))
    await input.press('Enter')
    await expect.poll(async () => (await tab(project)).primaryBbox[dimension]).toBe(value)
  }
  await setInput('Images per click', 1)
  await window
    .getByRole('textbox', { name: 'Positive prompt', exact: true })
    .fill(payload.prompt.text)
  await window
    .getByRole('textbox', { name: 'Negative prompt', exact: true })
    .fill(payload.negativePrompt.text)
  const current = await tab(project)
  assert.equal(
    current.generationDraft.loras.length,
    0,
    'Fresh manual authoring must begin with no LoRAs.',
  )
  for (const lora of payload.loras) {
    await window.locator('[aria-label="Add LoRA"]').click()
    await window.getByText(lora.resource.displayName, { exact: true }).last().click()
    await setInput(`${lora.resource.displayName} weight`, lora.weight)
  }
  const vae = window.locator('input[aria-label="VAE"]')
  if (!(await vae.isVisible())) await window.getByText('Advanced Options', { exact: true }).click()
  if (payload.vae !== null) {
    await expect(vae).toBeEnabled()
    await vae.click()
    const option = window
      .locator('.model-option:visible')
      .filter({ hasText: payload.vae.displayName })
      .filter({ hasText: `· ${payload.vae.versionName} ·` })
    await expect(option).toHaveCount(1)
    await option.click()
  }
  await setSelect('VAE precision', payload.vaePrecision)
  await setInput('CFG Rescale', payload.cfgRescale)
  await expect
    .poll(async () => ({
      positive: (await tab(project)).generationDraft.positivePrompt.text,
      negative: (await tab(project)).generationDraft.negativePrompt.text,
    }))
    .toEqual({ positive: payload.prompt.text, negative: payload.negativePrompt.text })
  await saveProject(project)
}
function projectContent(value) {
  return {
    acceptedResults: value.acceptedResults,
    autosaveError: value.autosaveError,
    documentId: value.documentId,
    generationDraft: value.generationDraft,
    id: value.id,
    lastActualSeedSnapshot: value.lastActualSeedSnapshot,
    layers: value.layers,
    primaryBbox: value.primaryBbox,
    storageWarning: value.storageWarning,
    title: value.title,
  }
}
async function clearHistory(project) {
  await window.getByRole('button', { name: 'Clear Project History', exact: true }).click()
  await window.getByRole('button', { name: 'Clear history', exact: true }).click()
  await expect.poll(async () => (await tab(project)).canUndo).toBe(false)
  await expect.poll(async () => (await tab(project)).canRedo).toBe(false)
}
async function history(project, action) {
  await window.getByRole('button', { name: 'Edit menu', exact: true }).click()
  await window
    .getByText(action === 'undo' ? 'Undo · Ctrl+Z' : 'Redo · Ctrl+Shift+Z / Ctrl+Y', {
      exact: true,
    })
    .click()
  await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  await expect(window.getByRole('button', { name: 'Save Project', exact: true })).toBeEnabled()
  return await tab(project)
}
async function applyPreset(project, scenario, source) {
  await clearHistory(project)
  const before = await tab(project)
  assert.deepEqual(before.primaryBbox, { x: 0, y: 0, ...scenario.baselinePayload.size })
  assert.deepEqual(before.generationDraft.seed, scenario.baselinePayload.seed)
  assert.equal(before.generationDraft.sampling.sampler, scenario.baselinePayload.sampling.sampler)
  const beforePackage = await packageFor(project)
  await window.getByRole('button', { name: 'Apply preset', exact: true }).click()
  const search = window.getByRole('textbox', { name: 'Search presets to apply', exact: true })
  await expect(search).toBeVisible()
  await window.getByRole('button', { name: 'Refresh presets to apply', exact: true }).click()
  await search.fill(source.name)
  await window.getByRole('button', { name: `Choose preset ${source.name}`, exact: true }).click()
  const dialog = window.getByRole('dialog', { name: `Apply Preset: ${source.name}`, exact: true })
  await expect(dialog).toBeVisible()
  for (const key of Object.keys(scenario.sourcePayload)) {
    const checkbox = dialog.getByRole('checkbox', {
      name: `Apply ${sectionLabels[key]}`,
      exact: true,
    })
    await checkbox.setChecked(scenario.selectedSections.includes(key))
  }
  await dialog
    .locator('[data-preset-section="cfgRescale"]')
    .getByText('CFG Rescale', { exact: true })
    .click()
  await setInput('Preset CFG Rescale', 0, dialog)
  const button = dialog.getByRole('button', { name: 'Apply', exact: true })
  await expect(button).toBeEnabled()
  const warning = dialog.getByRole('alert', {
    name: 'Selected preset settings need attention',
    exact: true,
  })
  if (scenario.scope === 'full') {
    await expect(warning).toContainText('The saved prediction type differs from Model Manager.')
    await expect(warning).toContainText('The saved noise profile differs from Model Manager.')
  } else await expect(warning).toHaveCount(0)
  assert.deepEqual(await tab(project), before, 'Detached editing must not mutate the Project.')
  assert.equal(await hashFile(beforePackage.path), beforePackage.sha256)
  assert.deepEqual(
    await api('presets', 'get', source.id),
    source,
    'Detached editing must not mutate the source preset.',
  )
  await screenshot(`${scenario.id}-apply-${scenario.scope}.png`, dialog)
  await button.click()
  await expect(dialog).toHaveCount(0)
  const after = await tab(project)
  assertInstalledPresetDraft(after, scenario)
  assert.equal(after.canUndo, true)
  assert.equal(after.canRedo, false)
  const undone = await history(project, 'undo')
  assert.deepEqual(
    projectContent(undone),
    projectContent(before),
    'One Undo must restore the entire editable baseline, including all unselected fields.',
  )
  assert.equal(
    undone.canUndo,
    false,
    'Selected sections must be one real Project history mutation.',
  )
  assert.equal(undone.canRedo, true)
  const redone = await history(project, 'redo')
  assert.deepEqual(
    projectContent(redone),
    projectContent(after),
    'One Redo must restore precisely the applied payload without a live preset link.',
  )
  assert.equal(redone.canUndo, true)
  assert.equal(redone.canRedo, false)
  assertInstalledPresetDraft(redone, scenario)
  assert.deepEqual(
    await modelRows(),
    initialModelRows,
    'Apply cannot change exact-file library policy.',
  )
  assert.equal(
    await hashFile(beforePackage.path),
    beforePackage.sha256,
    'Apply cannot Save the Project.',
  )
  assert.deepEqual(await api('presets', 'get', source.id), source)
  const saved = await saveProject(project)
  await check(
    `${scenario.id}: real detached ${scenario.scope} Apply with one Undo/Redo and unchanged source/library`,
    {
      projectId: project.id,
      presetId: source.id,
      before,
      after,
      undone,
      redone,
      savedSha256: saved.sha256,
    },
  )
}
async function decodeImage(url) {
  const value = await window.evaluate(async (imageUrl) => {
    const inline = imageUrl.match(/^data:(image\/(?:png|webp));base64,(.+)$/)
    const response = inline ? null : await fetch(imageUrl)
    const bytes = inline
      ? Uint8Array.from(atob(inline[2]), (character) => character.charCodeAt(0))
      : new Uint8Array(await response.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 8192)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
    const image = new Image()
    image.src = `data:${inline?.[1] ?? response.headers.get('content-type')};base64,${btoa(binary)}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Actual image decoding failed.')
    context.drawImage(image, 0, 0)
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', rgba))
    let opaquePixels = 0
    for (let index = 3; index < rgba.length; index += 4) if (rgba[index] === 255) opaquePixels++
    return {
      encoded: Array.from(bytes),
      width: canvas.width,
      height: canvas.height,
      status: response?.status ?? 200,
      mime: inline?.[1] ?? response.headers.get('content-type'),
      pixelSha256: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
      opaquePixels,
    }
  }, url)
  const { encoded, ...dimensions } = value
  const bytes = Buffer.from(encoded)
  return { bytes, dimensions: { ...dimensions, bytes: bytes.length, sha256: sha256(bytes) } }
}
async function generate(project, scenario, role) {
  const before = await tab(project)
  assertInstalledPresetDraft(before, scenario, { manualControl: role === 'manual-control' })
  assert.equal(before.layers.length, 0)
  const portable = await packageFor(project)
  const previous = new Set((await tableRows('generation_queue_item')).map(({ id }) => id))
  await bounds(`${scenario.id}-${role}-before-Generate`)
  await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled({
    timeout: 180_000,
  })
  await window.getByRole('button', { name: 'Generate', exact: true }).click()
  let admitted
  await expect
    .poll(
      async () => {
        admitted = (await tableRows('generation_queue_item')).filter(({ id }) => !previous.has(id))
        return admitted.length
      },
      { timeout: 180_000 },
    )
    .toBe(1)
  const original = admitted[0]
  assert.equal(original.local_project_key, project.id)
  assert.equal(original.document_id, project.documentId)
  assert.equal(original.document_revision, portable.saved.project.documentRevision)
  const frozen = JSON.parse(original.frozen_payload_json)
  assertInstalledPresetFrozen(frozen, scenario, reference)
  const generation = {
    caseId: scenario.id,
    role,
    projectId: project.id,
    queueItemId: original.id,
    row: original,
    frozen,
    accepted: false,
  }
  report.generations.push(generation)
  await checkpoint()
  await expect
    .poll(
      async () => {
        const row = (await tableRows('generation_queue_item')).find(({ id }) => id === original.id)
        assert.ok(row, 'Admitted native queue row must persist.')
        assert.ok(
          !['failed', 'canceled'].includes(row.status),
          JSON.stringify({
            status: row.status,
            errorCode: row.error_code,
            message: row.error_message,
          }),
        )
        return row.status
      },
      { timeout: 600_000, intervals: [1000, 2000, 5000] },
    )
    .toBe('completed')
  await expect
    .poll(async () => (await api('projects', 'getGenerationState', project.id)).phase)
    .toBe('idle')
  await expect.poll(runtimeUsers).toEqual([])
  const row = (await tableRows('generation_queue_item')).find(({ id }) => id === original.id)
  assert.equal(row.frozen_payload_json, original.frozen_payload_json)
  const receipt = (await tableRows('generation_candidate_receipt')).find(
    ({ queue_item_id }) => queue_item_id === row.id,
  )
  assert.equal(receipt.status, 'completed')
  assert.equal(receipt.actual_seed, 0)
  assert.equal(receipt.frozen_payload_sha256, sha256(Buffer.from(row.frozen_payload_json)))
  const results = await api('projects', 'listGenerationResults', project.id)
  const candidate = results.candidates.find(({ queueItemId }) => queueItemId === row.id)
  assert.ok(candidate)
  assert.equal(candidate.actualSeed, 0)
  assert.equal(results.lastActualSeed, 0)
  const image = await decodeImage(candidate.imageUrl)
  assert.equal(image.dimensions.width, 256)
  assert.equal(image.dimensions.height, 256)
  assert.equal(image.dimensions.opaquePixels, 256 * 256)
  assert.equal(image.dimensions.sha256, receipt.image_sha256)
  assert.equal(image.dimensions.bytes, receipt.image_byte_size)
  assert.ok(candidate.thumbnailUrl)
  const thumbnail = await decodeImage(candidate.thumbnailUrl)
  assert.equal(thumbnail.dimensions.mime, 'image/webp')
  assert.equal(thumbnail.dimensions.status, 200)
  const progress = await window.evaluate(
    (id) => window.__installedPresetProgress.filter(({ current }) => current.jobId === id),
    row.id,
  )
  assert.ok(progress.length > 0)
  assert.equal(progress.at(-1).current.step, 3)
  for (const entry of progress) {
    assert.equal(entry.current.totalSteps, 3)
    assert.equal(entry.current.projectKey, project.id)
    assert.equal(entry.current.documentId, project.documentId)
  }
  assert.deepEqual((await tab(project)).layers, before.layers, 'Completion cannot add a layer.')
  assert.deepEqual(
    (await tab(project)).generationDraft,
    before.generationDraft,
    'Completion cannot rewrite settings.',
  )
  assert.equal(await hashFile(portable.path), portable.sha256, 'Completion cannot implicitly Save.')
  const outputPath = path.join(fixture.artifacts, `${scenario.id}-${role}.png`)
  await writeFile(outputPath, image.bytes, { flag: 'wx', mode: 0o600 })
  Object.assign(generation, {
    row,
    receipt,
    candidateId: candidate.candidateId,
    dimensions: image.dimensions,
    thumbnail: thumbnail.dimensions,
    progress,
    outputPath,
    completionPhysicallyExited: true,
  })
  await check(`${scenario.id}: genuine ${role} Fixed0 completion uses current library policy`, {
    queueItemId: row.id,
    pixelSha256: image.dimensions.pixelSha256,
    predictionType: frozen.workerJob.checkpoint.predictionType,
    sampling: frozen.workerJob.sampling,
  })
  return generation
}
async function acceptAndSave(project, scenario, generation) {
  await window.getByRole('button', { name: 'Result selection actions', exact: true }).click()
  await window
    .getByRole('menuitem', { name: 'Select all completed across all sessions', exact: true })
    .click()
  await window.getByRole('button', { name: 'Add 1 as Layer', exact: true }).click()
  await expect.poll(async () => (await tab(project)).layers.length).toBe(1)
  const saved = await saveProject(project)
  assert.equal(saved.saved.project.layers.length, 1)
  const layer = saved.saved.project.layers[0]
  const provenance = layer.generationProvenance
  assert.ok(provenance)
  assertInstalledPresetConfiguration(provenance.generationConfiguration, scenario, reference)
  assert.equal(provenance.executionResultContext.queueItemId, generation.queueItemId)
  assert.equal(provenance.executionResultContext.candidateId, generation.candidateId)
  const bytes = await saved.saved.readMember(layer.asset.path)
  assert.equal(sha256(bytes), generation.receipt.image_sha256)
  assert.equal(bytes.length, generation.receipt.image_byte_size)
  const copy = path.join(fixture.artifacts, `${scenario.id}-accepted.igs`)
  await writeFile(copy, await readFile(saved.path), { flag: 'wx', mode: 0o600 })
  await closeProject(project)
  await reopenProject(project)
  const reopened = await tab(project)
  assert.equal(reopened.documentId, project.documentId)
  assert.equal(reopened.layers.length, 1)
  const data = await api(
    'projects',
    'getRasterGenerationData',
    project.id,
    project.documentId,
    layer.id,
  )
  assert.deepEqual(data.generationConfiguration, provenance.generationConfiguration)
  assert.equal(await hashFile(saved.path), saved.sha256)
  generation.accepted = true
  generation.layerId = layer.id
  generation.provenance = provenance
  generation.savedPackage = {
    path: saved.path,
    sha256: saved.sha256,
    evidenceCopy: copy,
    reopened: true,
  }
  await check(`${scenario.id}: explicit Add/Save/reopen preserves executed result provenance`, {
    layerId: layer.id,
    packageSha256: saved.sha256,
    previewStatus: saved.saved.manifest.preview.status,
  })
  return { layer: reopened.layers[0], portable: saved }
}
async function compare(project, scenario, layer, portable) {
  const before = await tab(project)
  await window.getByRole('button', { name: `Layer actions for ${layer.name}`, exact: true }).click()
  await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
  const dialog = window.getByRole('dialog', { name: 'Compare generation settings', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
  await dialog.getByRole('checkbox', { name: 'Show unchanged settings', exact: true }).check()
  const same = [
    'model.predictionType',
    'noiseProfile.baseSchedule',
    'noiseProfile.rescaleBetasZeroSnr',
    'noiseProfile.timestepSpacing',
    'sampling.sampler',
    'sampling.scheduler',
    'sampling.invokeScheduler',
    'guidance.steps',
    'guidance.cfg',
    'seed.actual',
  ]
  for (const key of same)
    await expect(dialog.locator(`[data-setting="${key}"]`)).toHaveAttribute('data-status', 'Same')
  await expect(dialog.locator('[data-setting="context.mode"]')).toHaveAttribute(
    'data-status',
    'Changed',
  )
  await screenshot(`${scenario.id}-comparison.png`, dialog)
  await dialog
    .getByRole('button', { name: 'Close generation settings comparison', exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  assert.deepEqual(await tab(project), before)
  assert.equal(await hashFile(portable.path), portable.sha256)
  await check(`${scenario.id}: reopened read-only comparison reflects current exact noise policy`, {
    same,
    modeChangedAfterRasterAdd: true,
  })
}
async function saveResultPreset(project, scenario, layer, portable) {
  const before = await tab(project)
  const cursorBefore = await tableRows('generation_seed_cursor')
  await window.getByRole('button', { name: `Layer actions for ${layer.name}`, exact: true }).click()
  await window.getByRole('menuitem', { name: 'Save Preset from Result', exact: true }).click()
  const manager = window.getByRole('dialog', { name: 'Preset Manager', exact: true })
  await expect(manager).toBeVisible()
  const banner = manager.getByRole('alert', { name: 'Source result', exact: true })
  await expect(banner).toContainText(layer.name)
  await expect(banner).toContainText('expanded prompts')
  await expect(
    manager.getByRole('checkbox', { name: 'Include Seed', exact: true }),
  ).not.toBeChecked()
  const name = `Installed ${scenario.id} recorded result`
  await manager.getByRole('textbox', { name: 'Preset name', exact: true }).fill(name)
  await screenshot(`${scenario.id}-result-preset.png`, manager)
  await manager
    .getByLabel('Preset editor actions', { exact: true })
    .getByRole('button', { name: 'Create Preset', exact: true })
    .click()
  await expect(
    manager.getByRole('button', { name: `Select preset ${name}`, exact: true }),
  ).toBeVisible()
  const matches = (await api('presets', 'list')).filter((row) => row.name === name)
  assert.equal(matches.length, 1)
  const created = matches[0]
  assertInstalledPresetResultPayload(created.payload, scenario)
  assert.equal(created.workflow, 'textToImage')
  const stored = await database.db
    .selectFrom('presets')
    .selectAll()
    .where('id', '=', created.id)
    .executeTakeFirstOrThrow()
  assert.equal(stored.name, created.name)
  assert.equal(stored.workflow_type, 'txt2img')
  assert.equal(stored.updated_at, created.updatedAt)
  assert.equal(stored.deleted_at, null)
  assertInstalledPresetResultPayload(JSON.parse(stored.payload_json), scenario)
  assert.deepEqual(JSON.parse(stored.payload_json), created.payload)
  report.resultPresets.push(created)
  report.resultPresetRows ??= []
  report.resultPresetRows.push(stored)
  await checkpoint()
  await manager.getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await expect(manager).toHaveCount(0)
  assert.deepEqual(await tab(project), before)
  assert.deepEqual(await tableRows('generation_seed_cursor'), cursorBefore)
  assert.deepEqual(await modelRows(), initialModelRows)
  assert.equal(await hashFile(portable.path), portable.sha256)
  await check(
    `${scenario.id}: genuine accepted result creates portable immutable preset without Seed/context`,
    { resultPresetId: created.id, sourceLayerId: layer.id },
  )
}
async function preserveNeighbors() {
  assert.deepEqual(await repository.listInstalled(), initialCatalog)
  assert.deepEqual(await modelRows(), initialModelRows)
  const [queueRows, cursorRows, presetRows] = await Promise.all([
    tableRows('generation_queue_item'),
    tableRows('generation_seed_cursor'),
    tableRows('presets'),
  ])
  assertInstalledPresetRetainedRows(initialQueue, queueRows, 'id')
  assertInstalledPresetRetainedRows(initialCursors, cursorRows, 'local_project_key')
  assertInstalledPresetRetainedRows(initialPresets, presetRows, 'id')
  for (const record of report.sourcePresets)
    assert.deepEqual(await api('presets', 'get', record.id), record)
  for (const record of modelFiles)
    assert.deepEqual(await snapshotFile(record.path, record.sha256), record)
  assert.deepEqual(await snapshotWorker(), workerFiles)
  assert.deepEqual(await readJson(path.join(appData, 'runtime/current-runtime.json')), pointer)
  await check(
    'Protected catalog, exact-file overrides, model bytes, pinned worker sources and neighboring preset/queue/seed rows remain unchanged',
  )
}
async function cleanupUi() {
  if (!window || window.isClosed()) return
  const apply = window.getByRole('dialog', { name: /^Apply Preset: / })
  if (await apply.isVisible())
    await apply.getByRole('button', { name: 'Cancel', exact: true }).click()
  const comparison = window.getByRole('dialog', {
    name: 'Compare generation settings',
    exact: true,
  })
  if (await comparison.isVisible())
    await comparison
      .getByRole('button', { name: 'Close generation settings comparison', exact: true })
      .click()
  const manager = window.getByRole('dialog', { name: 'Preset Manager', exact: true })
  if (await manager.isVisible()) {
    const cancel = manager
      .getByLabel('Preset editor actions', { exact: true })
      .getByRole('button', { name: 'Cancel', exact: true })
    if (await cancel.isVisible()) await cancel.click()
    else await manager.getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  }
  if (activeProject) await saveProject(activeProject)
}
async function closeNative() {
  if (!application) return
  await bounds('before-native-close')
  try {
    await cleanupUi()
    await application.close()
  } catch (error) {
    report.closeUiError = String(error)
    const latest = report.resourceLimitChecks.at(-1)
    const identity = latest.processIdentities.find(({ pid }) => pid === nativeProcess.pid)
    const group = latest.groups.find(
      ({ ownedScope, pids }) => ownedScope && pids.includes(nativeProcess.pid),
    )
    assert.ok(
      identity && group,
      'Failure cleanup must target the exact verified owned native scope.',
    )
    report.nativeSignal = await stopExpiredQualificationProcess({ ...identity, group: group.group })
  }
  report.nativePhysicalExit = await confirmQualificationProcessExit(report.resourceLimitChecks)
  assert.equal(report.nativePhysicalExit.confirmed, true)
  assert.deepEqual(await runtimeUsers(), [])
  application = null
  window = null
  await checkpoint()
}

try {
  await canonicalDirectory(path.dirname(fixture.artifacts))
  await mkdir(fixture.artifacts, { mode: 0o700 })
  await canonicalDirectory(fixture.artifacts)
  reportHandle = await open(path.join(fixture.artifacts, 'report.json'), 'wx', 0o600)
  await checkpoint()
  database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
  repository = new ModelRepository(database.db)
  initialCatalog = await repository.listInstalled()
  initialModelRows = await modelRows()
  initialQueue = await tableRows('generation_queue_item')
  assert.ok(
    initialQueue.every(({ status }) => !['pending', 'running'].includes(status)),
    'Protected pool must have no unfinished jobs before launch.',
  )
  initialCursors = await tableRows('generation_seed_cursor')
  initialPresets = await tableRows('presets')
  for (const key of ['illustrious', 'illustriousEpsilon', 'illustriousLora', 'externalVaeNative']) {
    const source = reference[key]
    const matches = initialCatalog.flatMap((resource) =>
      resource.versions
        .filter((version) => version.file?.sha256 === source.sha256)
        .map((version) => ({ resource, version })),
    )
    assert.equal(matches.length, 1)
    const { resource, version } = matches[0]
    assert.equal(version.file.sizeBytes, source.byteSize)
    source.installed = {
      resourceId: resource.id,
      versionId: version.id,
      managedPath: version.file.managedPath,
    }
  }
  cases = installedPresetCases(reference)
  assert.equal(cases.length, 4)
  modelFiles = []
  for (const key of ['illustrious', 'illustriousEpsilon', 'illustriousLora', 'externalVaeNative'])
    modelFiles.push(await snapshotFile(reference[key].installed.managedPath, reference[key].sha256))
  workerFiles = await snapshotWorker()
  workerAssets = Object.fromEntries(
    Object.entries(workerFiles).filter(([relative]) => !relative.endsWith('.py')),
  )
  assert.equal(Object.keys(workerFiles).filter((relative) => relative.endsWith('.py')).length, 31)
  assert.equal(Object.keys(workerAssets).length, 13)
  assert.deepEqual(Object.keys(workerFiles).sort(), Object.keys(workerBaseline.workerFiles).sort())
  for (const [relative, value] of Object.entries(workerFiles)) {
    assert.equal(value.sha256, workerBaseline.workerFiles[relative].sha256)
    assert.equal(value.size, workerBaseline.workerFiles[relative].bytes)
    assert.equal(
      report.sourceSha256[`worker-python/src/imagegen_worker/${relative}`],
      value.sha256,
      'Every installed payload member must match the exact current repository producer or resource.',
    )
  }
  report.preconditions = {
    catalog: initialCatalog,
    modelRows: initialModelRows,
    modelFiles,
    workerFiles,
    workerAssets,
    cases,
  }
  await checkpoint()
  assert.deepEqual(await runtimeUsers(), [])
  application = await electron.launch({
    args: [
      '--ozone-platform=x11',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '.',
    ],
    cwd: process.cwd(),
    env: environment,
  })
  nativeProcess = application.process()
  report.nativeProcessPid = nativeProcess.pid
  nativeProcess.on('exit', (code, signal) => {
    report.nativeExit = { code, signal, at: new Date().toISOString() }
  })
  await bounds('native-launch')
  mainLog = createWriteStream(path.join(fixture.artifacts, 'electron-main.log'), { flags: 'wx' })
  nativeProcess.stderr.pipe(mainLog, { end: false })
  window = await isolateNativeSmokeWindow(application)
  await application.evaluate(({ BrowserWindow, screen }) => {
    const displays = screen.getAllDisplays()
    for (const nativeWindow of BrowserWindow.getAllWindows()) {
      const isolate = () =>
        nativeWindow.setPosition(
          Math.min(...displays.map(({ bounds }) => bounds.x)) -
            nativeWindow.getBounds().width -
            1000,
          Math.min(...displays.map(({ bounds }) => bounds.y)) -
            nativeWindow.getBounds().height -
            1000,
        )
      nativeWindow.setFocusable(false)
      nativeWindow.setSkipTaskbar(true)
      nativeWindow.on('show', isolate)
      isolate()
      nativeWindow.showInactive()
    }
  })
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await window.evaluate(() => {
    window.__installedPresetProgress = []
    window.api.projects.onGenerationProgress((snapshot) => {
      if (snapshot.current) window.__installedPresetProgress.push(snapshot)
    })
  })
  const ready = await api('runtime', 'getStatus')
  assert.equal(ready.kind, 'ready')
  assert.equal(ready.runtimeId, pointer.runtimeId)
  report.runtime = ready
  await check(
    'Built Electron qualifies the retained installed runtime without install/copy or fixture-worker fallback',
    { runtime: ready },
  )
  for (const scenario of cases) {
    const source = await api('presets', 'create', {
      name: `Installed ${scenario.id} source`,
      description:
        'Exact installed checkpoint selected-section qualification; copied policy snapshots are advisory.',
      favorite: false,
      tags: ['installed-presets'],
      workflow: 'textToImage',
      payload: scenario.sourcePayload,
    })
    report.sourcePresets.push(source)
    await checkpoint()
    const manual = await createProject(scenario.id, 'manual-control')
    await manualAuthor(manual, scenario.expectedPayload)
    const control = await generate(manual, scenario, 'manual-control')
    await saveProject(manual)
    await closeProject(manual, { discardCandidate: control })
    const project = await createProject(scenario.id, 'preset-apply')
    await manualAuthor(project, scenario.baselinePayload)
    await applyPreset(project, scenario, source)
    const applied = await generate(project, scenario, 'preset-apply')
    assert.deepEqual(
      normalizeInstalledPresetExecutionInputs(applied.frozen),
      normalizeInstalledPresetExecutionInputs(control.frozen),
      'Manual and Apply controls must differ only in independently verified Project identity/revision/request ID.',
    )
    assert.equal(
      applied.dimensions.pixelSha256,
      control.dimensions.pixelSha256,
      'Identical manually authored and Apply native execution inputs must produce identical genuine trained pixels.',
    )
    report.pairs.push({
      caseId: scenario.id,
      objective: scenario.objective,
      scope: scenario.scope,
      manualQueueId: control.queueItemId,
      applyQueueId: applied.queueItemId,
      normalizedInputsIdentical: true,
      actualPixelSha256: applied.dimensions.pixelSha256,
      expectedPixelSha256: control.dimensions.pixelSha256,
    })
    await check(
      `${scenario.id}: same-input manual control and Apply genuine trained pixels match exactly`,
    )
    const accepted = await acceptAndSave(project, scenario, applied)
    await compare(project, scenario, accepted.layer, accepted.portable)
    await saveResultPreset(project, scenario, accepted.layer, accepted.portable)
    await closeProject(project)
  }
  assert.equal(report.generations.length, 8)
  assert.equal(report.pairs.length, 4)
  assert.equal(report.generations.filter(({ accepted }) => accepted).length, 4)
  assert.equal(report.resultPresets.length, 4)
  const initialQueueIds = new Set(initialQueue.map(({ id }) => id))
  const newQueue = (await tableRows('generation_queue_item')).filter(
    ({ id }) => !initialQueueIds.has(id),
  )
  assert.deepEqual(
    newQueue.map(({ id }) => id).sort(),
    report.generations.map(({ queueItemId }) => queueItemId).sort(),
    'Raw SQLite must show exactly eight actual admissions, with no unobserved late job.',
  )
  assert.ok(newQueue.every(({ status }) => status === 'completed'))
  const generationIds = new Set(report.generations.map(({ queueItemId }) => queueItemId))
  const newReceipts = (await tableRows('generation_candidate_receipt')).filter(
    ({ queue_item_id }) => generationIds.has(queue_item_id),
  )
  assert.equal(newReceipts.length, 8)
  assert.ok(
    newReceipts.every(({ status, actual_seed }) => status === 'completed' && actual_seed === 0),
  )
  report.actualOutcome = {
    admissions: newQueue.length,
    completions: newQueue.filter(({ status }) => status === 'completed').length,
    receipts: newReceipts.length,
    accepted: report.generations.filter(({ accepted }) => accepted).length,
    matchingPairs: report.pairs.length,
  }
  await preserveNeighbors()
  assert.deepEqual(report.pageErrors, [])
  report.status = 'passed'
  report.completedAt = new Date().toISOString()
} catch (error) {
  report.status = 'failed'
  report.error =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) }
  await checkpoint()
  throw error
} finally {
  try {
    await closeNative()
  } catch (error) {
    report.status = 'failed'
    report.cleanupError = String(error)
    process.exitCode = 1
  }
  if (database) {
    await database.close()
    database = null
  }
  if (mainLog) await new Promise((resolve) => mainLog.end(resolve))
  await checkpoint()
  await reportHandle?.close()
}
