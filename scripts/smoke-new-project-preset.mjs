/** Built Electron New Project preset customization qualification; no ML or mock Project owner. */
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
import { sql } from 'kysely'

import { openAppDatabase } from '../src/main/db/database.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
} from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4, 'Use --report-file ABSOLUTE_NEW_OWNED_REPORT')
assert.equal(process.argv[2], '--report-file')
const reportFile = process.argv[3]
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Report destination must be new')
const evidenceRoot = path.dirname(reportFile)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const relativeEvidence = path.relative(artifactRoot, evidenceRoot)
assert.ok(
  relativeEvidence && !relativeEvidence.startsWith('..') && !path.isAbsolute(relativeEvidence),
)
assert.equal(realpathSync(evidenceRoot), evidenceRoot)
assert.ok(lstatSync(evidenceRoot).isDirectory() && !lstatSync(evidenceRoot).isSymbolicLink())

const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'native-new-project-preset-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
mkdirSync(appDataRoot, { recursive: true, mode: 0o700 })
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashFiles = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const relatedFiles = (directory, pattern) =>
  readdirSync(directory)
    .filter((name) => pattern.test(name) && !name.endsWith('.test.ts'))
    .map((name) => `${directory}/${name}`)
const report = {
  outcome: 'running',
  startedAt: new Date().toISOString(),
  fixtureRoot,
  payloads: [fixtureRoot],
  checks: [],
  screenshots: [],
  diagnostics: [],
  diagnosticFailures: [],
  pageErrors: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  sourceSha256: hashFiles([
    'scripts/smoke-new-project-preset.mjs',
    'scripts/native-smoke-window.mjs',
    'scripts/qualification-resource-limits.mjs',
    'src/renderer/App.vue',
    'src/renderer/components/HomeView.vue',
    'src/renderer/components/NewProjectModal.vue',
    'src/main/index.ts',
    'src/preload/index.ts',
    'src/shared/api.ts',
    'src/main/projects/project-service.ts',
    'src/main/projects/project-session.ts',
    'src/main/projects/igs-package.ts',
    ...relatedFiles('src/renderer/components', /(?:Preset|preset).*\.(?:vue|ts)$/),
    ...relatedFiles('src/shared/presets', /\.ts$/),
    ...relatedFiles('src/shared/projects', /project-create.*\.ts$/),
  ]),
  bundleSha256: hashFiles([
    'dist/main/main.cjs',
    'dist/preload/preload.cjs',
    'dist/renderer/index.html',
    ...readdirSync('dist/renderer/assets')
      .filter((name) => /\.(?:js|css)$/.test(name))
      .map((name) => `dist/renderer/assets/${name}`),
  ]),
  boundary: {
    actual:
      'Real Home New Project → Text to Image preset select → detached reusable editor/selection/reset → real preload/Main Project creation → first committed .igs and SQLite index. Actual Cancel, missing-reference authoring, raw selected/deselected validation, clean initial history, native restart and source-library immutability.',
    fixtures:
      'Six small reusable definitions are stored through the actual Main preset API, including deliberately missing exact resource snapshots. No Project is created or mutated through an API-only setup. One owned project_index INSERT trigger refuses indexing after the production .igs writer commits; the committed configured package is preserved and later rediscovered through actual Home refresh.',
    limits:
      'The launching actor must have finite RAM and zero swap. Existing process guards enforce 2 GiB per actual native scope, zero swap and a finite 300-second deadline.',
    notQualified:
      'Model inference, runtime installation, resource resolution, worker-backed previews, Smart Patch initialization, arbitrary filesystem corruption and release packaging are outside this finite native slice. Missing resources remain authoring references, not proof of executable generation.',
    cleanup:
      'Only the owned New Project modal and owned Project tabs are closed on failure. The exact owned index trigger is removed before database close. Root retains payloads until native physical exit is independently confirmed; no external application data is touched.',
  },
}
let application
let window
let database
let nativeChecks = []
let workspaceDirectory
let indexTriggerInstalled = false
let sourceSnapshot
const sourceRecords = []
const projects = []
const ownedProjectTitles = new Set()
const sourcePrompt = 'portrait <new-vector>, {blue|red}\n(soft light:1.2), literal 日本語'
const sourceNegative = 'negative <negative-vector>, {soft|hard}'
const labels = {
  prompt: 'Prompt',
  negativePrompt: 'Negative Prompt',
  model: 'Model',
  loras: 'LoRAs',
  size: 'Size',
  sampling: 'Sampler & Scheduler',
  guidance: 'Steps & CFG',
  cfgRescale: 'CFG Rescale',
  seed: 'Seed',
  vae: 'VAE',
  vaePrecision: 'VAE Precision',
}

function writeReport() {
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
}
function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence })
  writeReport()
  console.log(`PASS ${name}`)
}
writeReport()

async function limitCheck(label) {
  const value = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds: 300,
    execute: (file, args, options) =>
      nativeExec(
        file,
        args.map((item) => (item === 'MemoryMax=12G' ? 'MemoryMax=2G' : item)),
        options,
      ),
  })
  nativeChecks.push(value)
  report.resourceLimitChecks.push({ ...value, label })
  writeReport()
}
async function launch(label) {
  const environment = {
    ...process.env,
    CUDA_VISIBLE_DEVICES: '',
    NODE_ENV: 'test',
    XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
    XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
  }
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.IMAGEGEN_DEV_SERVER_URL
  delete environment.IMAGEGEN_TEST_IMAGE_WORKER
  nativeChecks = []
  application = await electron.launch({
    args:
      process.env.IMAGEGEN_SMOKE_OZONE_PLATFORM === 'x11' ? ['--ozone-platform=x11', '.'] : ['.'],
    cwd: process.cwd(),
    env: environment,
    timeout: 30_000,
  })
  await limitCheck(`${label}-launch`)
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(10_000)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await window.waitForFunction(() => typeof window.api?.presets?.create === 'function')
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  assert.deepEqual(await api('models', 'getCatalog'), [])
  await api('projects', 'list')
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  const workspace = await database.db
    .selectFrom('project_workspace')
    .selectAll()
    .where('is_default', '=', 1)
    .executeTakeFirstOrThrow()
  workspaceDirectory = workspace.directory_path
  const relative = path.relative(fixtureRoot, workspaceDirectory)
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  assert.equal(realpathSync(workspaceDirectory), workspaceDirectory)
}
async function api(scope, method, ...args) {
  const result = await window.evaluate(
    ({ scope, method, args }) => window.api[scope][method](...args),
    { scope, method, args },
  )
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function rows(table, orderBy = 'id') {
  return await database.db.selectFrom(table).selectAll().orderBy(orderBy).execute()
}
async function homeSnapshot() {
  const autosaveRoot = path.join(appDataRoot, 'autosave')
  return {
    // Home rescans may refresh these read/open timestamps without changing indexed content.
    rows: (await rows('project_index', 'local_project_key')).map(
      ({ indexed_at: _indexedAt, last_opened_at: _lastOpenedAt, ...record }) => record,
    ),
    packages: readdirSync(workspaceDirectory)
      .filter((name) => name.endsWith('.igs'))
      .sort()
      .map((name) => ({ name, sha256: digest(readFileSync(path.join(workspaceDirectory, name))) })),
    recoveryEntries: existsSync(autosaveRoot) ? readdirSync(autosaveRoot).sort() : [],
  }
}
async function assertSourcesUnchanged() {
  assert.deepEqual(await rows('presets'), sourceSnapshot)
  for (const record of sourceRecords) {
    assert.deepEqual(await api('presets', 'get', record.id, { includeDeleted: true }), record)
  }
  for (const table of ['model_resource', 'model_resource_version', 'local_model_file']) {
    assert.deepEqual(await rows(table), [])
  }
}
const modal = () => window.getByRole('dialog', { name: 'New Project', exact: true })
const createButton = () => modal().getByRole('button', { name: 'Create Project', exact: true })
const use = (key) => modal().getByRole('checkbox', { name: `Use ${labels[key]}`, exact: true })
const prompt = () => modal().getByRole('textbox', { name: 'Preset prompt', exact: true })
async function expectPrompt(value) {
  await expect
    .poll(async () => (await prompt().locator('.cm-line').allTextContents()).join('\n'))
    .toBe(value)
}
async function openNew(title) {
  ownedProjectTitles.add(title)
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window
    .getByLabel('Workspace navigation', { exact: true })
    .getByRole('button', { name: 'New Project', exact: true })
    .click()
  await expect(modal()).toBeVisible()
  await modal().getByRole('textbox', { name: 'Project name', exact: true }).fill(title)
}
async function choosePreset(name) {
  await modal().getByLabel('Generation preset', { exact: true }).click()
  await window
    .locator('.n-base-select-option')
    .filter({ hasText: new RegExp(`^${name}$`) })
    .click()
  await expect(modal().getByLabel('Generation preset', { exact: true })).toContainText(name)
}
async function expand(key) {
  await modal()
    .locator(`[data-preset-section="${key}"]`)
    .getByText(labels[key], { exact: true })
    .click()
}
async function cancelNew() {
  await modal().getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(modal()).toHaveCount(0)
}
async function closeProjectUi(title, discard = false) {
  const tab = window.getByRole('tab', { name: title, exact: true })
  await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
  const discardButton = window
    .getByRole('dialog', { name: 'Close Project', exact: true })
    .getByRole('button', { name: 'Discard Changes', exact: true })
  await expect
    .poll(async () =>
      (await tab.count()) === 0
        ? 'closed'
        : (await discardButton.isVisible())
          ? 'decision'
          : 'waiting',
    )
    .not.toBe('waiting')
  if (await tab.count()) {
    assert.equal(discard, true, 'Initial configured Project must already be clean')
    await discardButton.click()
  }
  await expect(tab).toHaveCount(0)
}
async function captureCreated(title) {
  await expect(window.getByRole('tab', { name: title, exact: true })).toBeVisible()
  const records = (await api('projects', 'list')).filter((record) => record.title === title)
  assert.equal(records.length, 1)
  const opened = await api('projects', 'open', records[0].id)
  assert.equal(opened.kind, 'opened')
  const tab = opened.tab
  const indexed = await database.db
    .selectFrom('project_index')
    .selectAll()
    .where('local_project_key', '=', tab.id)
    .executeTakeFirstOrThrow()
  const packagePath = indexed.canonical_path
  const relative = path.relative(workspaceDirectory, packagePath)
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  const bundle = await readIgsPackage(packagePath)
  assert.equal(tab.dirty, false)
  assert.equal(tab.canUndo, false)
  assert.equal(tab.canRedo, false)
  assert.deepEqual(bundle.project.generationDraft, tab.generationDraft)
  assert.deepEqual(bundle.project.primaryBbox, tab.primaryBbox)
  assert.equal(bundle.project.title, title)
  assert.deepEqual(bundle.project.layers, [])
  assert.equal(bundle.project.lastActualSeedSnapshot, null)
  assert.equal(bundle.manifest.preview.status, 'empty')
  assert.deepEqual(await rows('generation_seed_cursor', 'local_project_key'), [])
  const value = {
    id: tab.id,
    title,
    packagePath,
    sha256: digest(readFileSync(packagePath)),
    document: bundle.project,
  }
  projects.push(value)
  await expect(
    window.getByLabel(`Project ${title}`, { exact: true }).locator('.document-state'),
  ).toHaveText('Saved')
  await assertSourcesUnchanged()
  return value
}
async function submitProject(title) {
  await expect(createButton()).toBeEnabled()
  await createButton().click()
  await expect(modal()).toHaveCount(0)
  return await captureCreated(title)
}
function assertDefaults(document, width = 1024, height = 1024) {
  assert.deepEqual(document.primaryBbox, { x: 0, y: 0, width, height })
  const draft = document.generationDraft
  assert.deepEqual(draft.positivePrompt, { text: '', embeddingRefs: [] })
  assert.deepEqual(draft.negativePrompt, { text: '', embeddingRefs: [] })
  assert.equal(draft.model, null)
  assert.deepEqual(draft.loras, [])
  assert.deepEqual(draft.seed, { policy: 'random', value: null })
  assert.equal(draft.vae, null)
  assert.deepEqual(draft.sampling, {
    steps: null,
    cfgScale: null,
    denoisingStrength: null,
    sampler: null,
    scheduler: null,
  })
}
function assertFull(document, payload, { fixedSeed = false, guidance = true } = {}) {
  const draft = document.generationDraft
  assert.deepEqual(document.primaryBbox, { x: 0, y: 0, ...payload.size })
  assert.deepEqual(draft.positivePrompt, payload.prompt)
  assert.deepEqual(draft.negativePrompt, payload.negativePrompt)
  assert.deepEqual(draft.model, payload.model)
  assert.deepEqual(draft.loras, payload.loras)
  assert.deepEqual(
    draft.seed,
    fixedSeed ? { policy: 'fixed', value: 0 } : { policy: 'random', value: null },
  )
  assert.equal(draft.cfgRescale, 0)
  assert.equal(draft.vae, null)
  assert.equal(draft.vaePrecision, 'Auto')
  assert.deepEqual(draft.sampling, {
    sampler: payload.sampling.sampler,
    scheduler: payload.sampling.scheduler,
    animaMethod: payload.sampling.animaMethod,
    steps: guidance ? payload.guidance.steps : null,
    cfgScale: guidance ? payload.guidance.cfgScale : null,
    denoisingStrength: null,
  })
  for (const key of ['sourcePresetId', 'generationPresetId', 'selectedSections', 'workflow']) {
    assert.equal(Object.hasOwn(document, key), false)
    assert.equal(Object.hasOwn(draft, key), false)
  }
  assert.equal(JSON.stringify(document).includes(sourceRecords[0].id), false)
}
async function screenshot(label, width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) =>
      BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
    { width, height },
  )
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
  await window.mouse.move(width - 5, 5)
  await window.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    )
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  const geometry = await modal().evaluate((element) => {
    const rect = (target) => {
      if (!target) throw new Error('Required New Project geometry element is missing')
      const value = target.getBoundingClientRect()
      return {
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
        right: value.right,
        bottom: value.bottom,
      }
    }
    const scroll = element.querySelector('.modal-scroll .n-scrollbar-container')
    return {
      modal: rect(element),
      heading: rect(element.querySelector('.modal-header h2')),
      rootScrollTop: element.scrollTop,
      footer: rect(element.querySelector('[aria-label="New Project actions"]')),
      scroll: scroll
        ? {
            ...rect(scroll),
            scrollHeight: scroll.scrollHeight,
            clientHeight: scroll.clientHeight,
            scrollTop: scroll.scrollTop,
          }
        : null,
      primary: [...element.querySelectorAll('button.n-button--primary-type')].map((button) =>
        button.textContent.trim(),
      ),
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
    }
  })
  assert.equal(geometry.documentOverflow, false)
  assert.ok(geometry.modal.x >= -1 && geometry.modal.y >= -1)
  assert.ok(geometry.modal.right <= width + 1 && geometry.modal.bottom <= height + 1)
  assert.ok(geometry.footer.bottom <= geometry.modal.bottom + 1)
  assert.ok(geometry.footer.y >= geometry.modal.y)
  assert.ok(geometry.heading.y >= geometry.modal.y && geometry.heading.bottom <= geometry.scroll.y)
  assert.equal(geometry.rootScrollTop, 0)
  assert.deepEqual(geometry.primary, ['Create Project'])
  assert.ok(geometry.scroll && geometry.scroll.clientHeight > 100)
  assert.ok(geometry.scroll.bottom <= geometry.footer.y + 2)
  const file = path.join(evidenceRoot, `${label}-${width}x${height}.png`)
  // Capture the visible native viewport without locator.scrollIntoView changing nested scroll state.
  await window.screenshot({
    path: file,
    clip: {
      x: geometry.modal.x,
      y: geometry.modal.y,
      width: geometry.modal.width,
      height: geometry.modal.height,
    },
    animations: 'disabled',
    timeout: 5_000,
  })
  report.screenshots.push({ label, path: file, geometry })
  writeReport()
}
async function removeIndexTrigger() {
  if (!indexTriggerInstalled || !database) return
  await sql`DROP TRIGGER IF EXISTS new_project_preset_owned_index_failure`.execute(database.db)
  indexTriggerInstalled = false
  assert.equal(
    (
      await sql`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'new_project_preset_owned_index_failure'`.execute(
        database.db,
      )
    ).rows.length,
    0,
  )
}
async function closeNative(label) {
  if (!application) return
  await removeIndexTrigger()
  if (window && !window.isClosed()) {
    if (await modal().isVisible()) await cancelNew()
    for (const title of ownedProjectTitles) {
      if (await window.getByRole('tab', { name: title, exact: true }).count()) {
        await closeProjectUi(title, true)
      }
    }
  }
  if (database) {
    await database.close()
    database = null
  }
  await limitCheck(`${label}-before-close`)
  await application.close()
  report.nativeClosures.push({ label, ...(await confirmQualificationProcessExit(nativeChecks)) })
  application = null
  window = null
  writeReport()
}
function reference(kind, name, letter) {
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: null,
    civitaiModelId: null,
    civitaiVersionId: null,
    displayName: name,
    fileSha256: letter.repeat(64),
    kind,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: kind === 'checkpoint' ? 'v_prediction' : null,
    versionName: 'Exact absent New Project version',
  }
}
function definition(name, payload, workflow = 'textToImage') {
  return {
    description: 'Native New Project detached customization',
    favorite: false,
    name,
    payload,
    tags: ['native-new-project'],
    workflow,
  }
}

try {
  await launch('new-project')
  const fullPayload = {
    prompt: {
      text: sourcePrompt,
      embeddingRefs: [
        {
          token: '<new-vector>',
          resource: reference('embedding', 'Missing creation embedding', 'd'),
        },
      ],
    },
    negativePrompt: {
      text: sourceNegative,
      embeddingRefs: [
        {
          token: '<negative-vector>',
          resource: reference('embedding', 'Missing creation negative embedding', 'e'),
        },
      ],
    },
    model: reference('checkpoint', 'Missing creation checkpoint', 'a'),
    loras: [
      {
        enabled: true,
        resource: reference('lora', 'Missing signed creation LoRA', 'b'),
        weight: -0.35,
      },
      { enabled: false, resource: reference('lora', 'Disabled creation LoRA', 'c'), weight: 0 },
    ],
    size: { width: 768, height: 512 },
    sampling: { sampler: 'DPM++ SDE', scheduler: 'Karras', animaMethod: 'heun' },
    guidance: { steps: 31, cfgScale: 0 },
    cfgRescale: 0,
    seed: { policy: 'fixed', value: 0 },
    vae: null,
    vaePrecision: 'Auto',
  }
  const full = await api(
    'presets',
    'create',
    definition('Native full creation preset', fullPayload),
  )
  const noSize = await api(
    'presets',
    'create',
    definition('Native no Size preset', {
      prompt: { text: 'native-only reusable sampler and explicit empty LoRAs', embeddingRefs: [] },
      loras: [],
      sampling: { animaMethod: 'heun' },
    }),
  )
  const image = await api(
    'presets',
    'create',
    definition(
      'Native excluded Image preset',
      { prompt: { text: 'image only', embeddingRefs: [] } },
      'imageToImage',
    ),
  )
  const smart = await api(
    'presets',
    'create',
    definition(
      'Native excluded Smart Patch preset',
      { prompt: { text: 'patch only', embeddingRefs: [] } },
      'smartPatch',
    ),
  )
  const deletedDraft = await api(
    'presets',
    'create',
    definition('Native excluded Deleted preset', {
      prompt: { text: 'deleted only', embeddingRefs: [] },
    }),
  )
  const deleted = await api('presets', 'softDelete', deletedDraft.id)
  const simple = await api(
    'presets',
    'create',
    definition('Native simple creation preset', {
      prompt: { text: 'index refusal retains configured first package', embeddingRefs: [] },
      size: { width: 640, height: 448 },
    }),
  )
  sourceRecords.push(full, noSize, image, smart, deleted, simple)
  sourceSnapshot = await rows('presets')
  assert.deepEqual((await homeSnapshot()).packages, [])
  assert.deepEqual((await homeSnapshot()).rows, [])

  for (const request of [
    { title: 'Refused extra source key', width: 1024, height: 1024, sourcePresetId: full.id },
    {
      title: 'Refused image-only payload',
      width: 1024,
      height: 1024,
      generationPayload: { denoisingStrength: 0.5 },
    },
    {
      title: 'Refused conflicting Size',
      width: 1024,
      height: 1024,
      generationPayload: { size: { width: 640, height: 448 } },
    },
  ]) {
    const before = await homeSnapshot()
    const result = await window.evaluate((request) => window.api.projects.create(request), request)
    assert.equal(result.ok, false, 'Actual create IPC must reject invalid creation input')
    assert.equal(result.error.code, 'IPC_INVALID_CALLER')
    assert.deepEqual(await homeSnapshot(), before)
    await assertSourcesUnchanged()
  }
  check(
    'Actual creation IPC rejects extra source identity, image-only denoising and conflicting Size before any package or index write',
  )

  const untouchedHome = await homeSnapshot()
  await openNew('Canceled customization')
  await modal().getByLabel('Generation preset', { exact: true }).click()
  for (const source of [full, noSize, simple]) {
    await expect(
      window.locator('.n-base-select-option').filter({ hasText: new RegExp(`^${source.name}$`) }),
    ).toBeVisible()
  }
  for (const source of [image, smart, deleted]) {
    await expect(
      window.locator('.n-base-select-option').filter({ hasText: new RegExp(`^${source.name}$`) }),
    ).toHaveCount(0)
  }
  await window
    .locator('.n-base-select-option')
    .filter({ hasText: new RegExp(`^${full.name}$`) })
    .click()
  await expect(prompt()).toBeHidden()
  for (const key of Object.keys(fullPayload).filter((key) => key !== 'size')) {
    if (key === 'seed') await expect(use(key)).not.toBeChecked()
    else await expect(use(key)).toBeChecked()
  }
  await expect(modal().getByRole('checkbox', { name: 'Use Size', exact: true })).toHaveCount(0)
  await expect(
    modal().getByRole('alert', {
      name: 'New Project preset resources need attention',
      exact: true,
    }),
  ).toBeVisible()
  await expect(createButton()).toBeEnabled()
  await screenshot('creation-collapsed', 1380, 900)
  await screenshot('creation-collapsed', 900, 680)
  check(
    'Actual chooser offers only active Text to Image presets; sections start collapsed, Size is mandatory, Seed is excluded and missing selected references warn while Create remains available',
  )

  await expand('prompt')
  await prompt().fill(`${sourcePrompt}, temporary customization`)
  await use('prompt').uncheck()
  await expect(prompt()).toHaveAttribute('contenteditable', 'false')
  await modal().getByRole('button', { name: 'Reset Prompt', exact: true }).click()
  await expectPrompt(sourcePrompt)
  await expect(use('prompt')).not.toBeChecked()
  await use('prompt').check()
  await expand('guidance')
  const steps = modal().getByLabel('Preset steps', { exact: true })
  await steps.fill('-')
  await expect(steps).toHaveValue('-')
  await expect(createButton()).toBeDisabled()
  await use('guidance').uncheck()
  await expect(steps).toHaveValue('-')
  await expect(steps).toBeDisabled()
  await expect(createButton()).toBeEnabled()
  await use('guidance').check()
  await expect(createButton()).toBeDisabled()
  await modal().getByRole('button', { name: 'Reset Steps & CFG', exact: true }).click()
  await expect(steps).toHaveValue('31')
  await expect(createButton()).toBeEnabled()
  await use('loras').uncheck()
  await steps.fill('32')
  await modal().getByRole('button', { name: 'Reset all', exact: true }).click()
  await expect(steps).toHaveValue('31')
  await expect(use('loras')).not.toBeChecked()
  await expect(use('seed')).not.toBeChecked()
  await modal().getByRole('button', { name: 'Expand all', exact: true }).click()
  await window.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    )
  })
  await modal()
    .locator('.modal-scroll .n-scrollbar-container')
    .evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
  await expect
    .poll(() =>
      modal()
        .locator('.modal-scroll .n-scrollbar-container')
        .evaluate((element) =>
          Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop),
        ),
    )
    .toBeLessThanOrEqual(2)
  await screenshot('creation-expanded-bottom', 900, 680)
  await screenshot('creation-expanded-bottom', 1380, 900)
  await assertSourcesUnchanged()
  await cancelNew()
  assert.deepEqual(await homeSnapshot(), untouchedHome)
  check(
    'Detached edits and raw errors affect only selected sections; row/all resets preserve the mask, expanded content reaches its scroll bottom and Cancel writes neither Project files nor index rows',
  )

  await openNew('No preset reset proof')
  await choosePreset(full.name)
  await expand('size')
  await modal().getByLabel('Preset width', { exact: true }).fill('832')
  await modal().getByLabel('Preset height', { exact: true }).fill('576')
  await choosePreset('No preset')
  await expect(modal().getByLabel('Project width', { exact: true })).toHaveValue('1024')
  await expect(modal().getByLabel('Project height', { exact: true })).toHaveValue('1024')
  await expect(modal().locator('[data-preset-section]')).toHaveCount(0)
  await cancelNew()
  assert.deepEqual(await homeSnapshot(), untouchedHome)
  await openNew('Native no preset defaults')
  const defaults = await submitProject('Native no preset defaults')
  assertDefaults(defaults.document)
  await closeProjectUi(defaults.title)
  check(
    'Choosing No preset restores 1024 × 1024 and removes customization; real legacy creation commits default random settings in a clean first package with no Apply history step',
  )

  await openNew('Native configured random Project')
  await choosePreset(full.name)
  await expand('prompt')
  const editedPrompt = `${sourcePrompt}, detached initial style`
  await prompt().fill(editedPrompt)
  await expect(createButton()).toBeEnabled()
  const configured = await submitProject('Native configured random Project')
  assertFull(configured.document, {
    ...fullPayload,
    prompt: { ...fullPayload.prompt, text: editedPrompt },
  })
  await closeProjectUi(configured.title)
  check(
    'Actual Create commits authored brace templates, exact prompt sidecars/model/LoRAs, signed/disabled weights, named and native sampling, CFG zero/Rescale zero/Auto and mandatory dimensions into the first .igs while excluded Seed remains random',
  )

  await openNew('Native explicit zero subset')
  await choosePreset(full.name)
  await use('seed').check()
  await expand('guidance')
  await modal().getByLabel('Preset steps', { exact: true }).fill('-')
  await expect(createButton()).toBeDisabled()
  await use('guidance').uncheck()
  await expect(createButton()).toBeEnabled()
  const zero = await submitProject('Native explicit zero subset')
  assertFull(zero.document, fullPayload, { fixedSeed: true, guidance: false })
  await closeProjectUi(zero.title)
  check(
    'Explicit Use Seed retains fixed seed 0; a deselected invalid raw guidance draft never copies its hidden previous number or blocks first-package creation',
  )

  await openNew('Native absent Size Project')
  await choosePreset(noSize.name)
  await expand('size')
  await expect(modal().getByLabel('Preset width', { exact: true })).toHaveValue('1024')
  await expect(modal().getByLabel('Preset height', { exact: true })).toHaveValue('1024')
  await modal().getByLabel('Preset width', { exact: true }).fill('640')
  await modal().getByLabel('Preset height', { exact: true }).fill('448')
  const absent = await submitProject('Native absent Size Project')
  assert.deepEqual(absent.document.primaryBbox, { x: 0, y: 0, width: 640, height: 448 })
  assert.deepEqual(absent.document.generationDraft.positivePrompt, noSize.payload.prompt)
  assert.deepEqual(absent.document.generationDraft.loras, [])
  assert.deepEqual(absent.document.generationDraft.seed, { policy: 'random', value: null })
  assert.deepEqual(absent.document.generationDraft.sampling, {
    steps: null,
    cfgScale: null,
    denoisingStrength: null,
    sampler: null,
    scheduler: null,
    animaMethod: 'heun',
  })
  await closeProjectUi(absent.title)
  check(
    'A source without Size receives the 1024 fallback, its customized mandatory size initializes the bbox, selected empty LoRAs remain empty and native-only sampling does not invent an SD pair',
  )

  const beforeIndexRefusal = await homeSnapshot()
  await sql`CREATE TRIGGER new_project_preset_owned_index_failure BEFORE INSERT ON project_index WHEN NEW.display_name = 'Native index refusal' BEGIN SELECT RAISE(ABORT, 'owned new project index refusal'); END`.execute(
    database.db,
  )
  indexTriggerInstalled = true
  await openNew('Native index refusal')
  await choosePreset(simple.name)
  await createButton().click()
  await expect(
    modal().getByRole('alert', { name: 'Project creation failed', exact: true }),
  ).toContainText('The .igs file was created in Uncategorized, but Home could not index it.')
  await expect(createButton()).toBeEnabled()
  await expect(modal().getByRole('textbox', { name: 'Project name', exact: true })).toHaveValue(
    'Native index refusal',
  )
  await expect(modal().getByLabel('Generation preset', { exact: true })).toContainText(simple.name)
  const afterIndexRefusal = await homeSnapshot()
  assert.deepEqual(afterIndexRefusal.rows, beforeIndexRefusal.rows)
  assert.deepEqual(afterIndexRefusal.recoveryEntries, beforeIndexRefusal.recoveryEntries)
  const previousNames = new Set(beforeIndexRefusal.packages.map((entry) => entry.name))
  const committed = afterIndexRefusal.packages.filter((entry) => !previousNames.has(entry.name))
  assert.equal(
    committed.length,
    1,
    'Post-commit index refusal must preserve exactly one configured package',
  )
  const orphanPath = path.join(workspaceDirectory, committed[0].name)
  const orphan = await readIgsPackage(orphanPath)
  assert.equal(orphan.project.title, 'Native index refusal')
  assert.deepEqual(orphan.project.generationDraft.positivePrompt, simple.payload.prompt)
  assert.deepEqual(orphan.project.primaryBbox, { x: 0, y: 0, width: 640, height: 448 })
  assert.deepEqual(orphan.project.generationDraft.seed, { policy: 'random', value: null })
  report.retainedIndexRefusalPackage = { path: orphanPath, sha256: committed[0].sha256 }
  await expand('prompt')
  await expectPrompt(simple.payload.prompt.text)
  await assertSourcesUnchanged()
  await removeIndexTrigger()
  await cancelNew()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await expect(
    window.getByRole('button', { name: 'Open Native index refusal', exact: true }),
  ).toBeVisible()
  await window.getByRole('button', { name: 'Open Native index refusal', exact: true }).click()
  const recovered = await captureCreated('Native index refusal')
  assert.equal(recovered.packagePath, orphanPath)
  assert.equal(recovered.sha256, committed[0].sha256)
  await closeProjectUi(recovered.title)
  check(
    'A real post-commit index refusal preserves the configured .igs and retryable modal draft without a partial index; after removing the owned trigger, actual Home refresh rediscovers the same clean file',
    { packagePath: orphanPath },
  )

  await assertSourcesUnchanged()
  const beforeRestart = await homeSnapshot()
  await closeNative('new-project')
  await launch('restart')
  const restarted = await homeSnapshot()
  assert.deepEqual(restarted.packages, beforeRestart.packages)
  assert.equal(restarted.rows.length, beforeRestart.rows.length)
  for (const created of projects) {
    await window.getByRole('button', { name: `Open ${created.title}`, exact: true }).click()
    await expect(window.getByRole('tab', { name: created.title, exact: true })).toBeVisible()
    const opened = await api('projects', 'open', created.id)
    assert.equal(opened.kind, 'opened')
    assert.deepEqual(opened.tab.generationDraft, created.document.generationDraft)
    assert.deepEqual(opened.tab.primaryBbox, created.document.primaryBbox)
    assert.equal(opened.tab.dirty, false)
    assert.equal(opened.tab.canUndo, false)
    assert.equal(digest(readFileSync(created.packagePath)), created.sha256)
    await closeProjectUi(created.title)
  }
  await assertSourcesUnchanged()
  assert.deepEqual(report.pageErrors, [])
  await closeNative('restart')
  assert.equal(report.nativeClosures.length, 2)
  check(
    'Physical native restart preserves every initial configuration and package byte identity, clean history, unchanged source presets and an empty model library',
  )
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'
  report.failure = { message: error.message, stack: error.stack }
  if (window && !window.isClosed()) {
    for (const kind of ['screenshot', 'ariaSnapshot']) {
      const file = path.join(
        evidenceRoot,
        kind === 'screenshot' ? 'failure.png' : 'failure.aria.yml',
      )
      try {
        if (kind === 'screenshot')
          await window.screenshot({ path: file, animations: 'disabled', timeout: 5_000 })
        else writeFileSync(file, await window.locator('body').ariaSnapshot({ timeout: 5_000 }))
        report.diagnostics.push({ kind, path: file })
      } catch (diagnosticError) {
        report.diagnosticFailures.push({ kind, message: diagnosticError.message })
      }
    }
  }
  writeReport()
  throw error
} finally {
  if (application) {
    try {
      await closeNative('failure-cleanup')
    } catch (error) {
      report.cleanupFailure = { message: error.message, stack: error.stack }
      report.outcome = 'failed'
    }
  }
  report.finishedAt = new Date().toISOString()
  writeReport()
  console.log(
    JSON.stringify({
      report: reportFile,
      outcome: report.outcome,
      checks: report.checks.length,
      fixtureRoot,
    }),
  )
}
