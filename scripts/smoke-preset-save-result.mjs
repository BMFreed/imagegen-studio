/** Built Electron accepted Raster provenance → detached Preset Manager → real SQLite Create. */
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
import { ProjectSession } from '../src/main/projects/project-session.ts'
import {
  acceptedAnimaProvenanceFixture,
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from '../src/main/projects/test-fixtures/accepted-provenance.ts'
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

const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'native-save-result-payload-'))
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
    'scripts/smoke-preset-save-result.mjs',
    'scripts/native-smoke-window.mjs',
    'scripts/qualification-resource-limits.mjs',
    'src/renderer/App.vue',
    'src/renderer/components/ProjectView.vue',
    'src/renderer/components/ProjectRasterLayerRow.vue',
    'src/renderer/components/ProjectSortableRasterLayerRow.vue',
    'src/renderer/components/ProjectLayerStack.vue',
    'src/main/projects/test-fixtures/accepted-provenance.ts',
    'src/shared/projects/generation-settings-comparison.ts',
    'src/shared/projects/project-schema.ts',
    'src/renderer/components/HomeView.vue',
    'src/main/index.ts',
    'src/preload/index.ts',
    'src/shared/api.ts',
    'src/main/projects/project-service.ts',
    'src/main/projects/project-session.ts',
    'src/main/projects/igs-package.ts',
    ...relatedFiles('src/renderer/components', /(?:Preset|preset).*\.(?:vue|ts)$/),
    ...relatedFiles('src/shared/presets', /\.ts$/),
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
      'Real production .igs writer/read, built Electron Home/Project layer menu, worker-independent typed preload/Main read, source-aware shared Preset Manager transient create and real SQLite persistence/retry. Frozen portable settings remain detached from current Project edits; physical native restart verifies created rows.',
    fixtures:
      'A closed package contains actual ICC PNG bytes and strict accepted Illustrious/Anima provenance fixtures, plus an imported neighboring Raster without provenance. Current authored prompts and generation settings deliberately differ. No model files, image worker, ML runtime, downloads or inference. A genuine original Main reply is held and released unchanged; an owned SQLite INSERT trigger provides a recoverable Create failure.',
    limits:
      'The launching actor must have finite RAM and zero swap. Native scopes have 2 GiB ceilings, zero swap and a finite 300-second deadline.',
    notQualified:
      'This proves accepted Raster authoring, not actual ML generation, Smart Patch variants, outpaint execution, resource installation, release packaging or arbitrary storage corruption. Historical missing fields are covered by focused tests, not inferred from current Project settings.',
    cleanup:
      'Only owned manager drafts and the owned Project tab are discarded through actual App UI. The owned INSERT trigger and reply probe are restored before database/process exit. Disposable payloads remain for root cleanup after independent physical-exit confirmation.',
  },
}
let application
let window
let database
let nativeChecks = []
let fixture
let projectId
let packagePath
let packageBytes
let projectBaseline
let modelBaseline
let seedBaseline
let predictionBaseline
let noiseBaseline
let triggerInstalled = false
let resultReplyHeld = false
let created
let retried
let animaCreated
const projectTitle = 'Native Accepted Result Presets'
const concretePrompt = 'portrait <result-vector>, blue lantern\n(soft light:1.2), literal 日本語'
const concreteNegative = 'negative <result-negative-vector>, soft'
const authoredPrompt = 'portrait <current-vector>, {blue|red} lantern'
const authoredNegative = 'negative <current-negative-vector>, {soft|hard}'

function writeReport() {
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
}
function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence })
  writeReport()
  console.log(`PASS ${name}`)
}
writeReport()

function reference(kind, displayName, letter) {
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: 10401 + letter.charCodeAt(0),
    civitaiModelId: 10501 + letter.charCodeAt(0),
    civitaiVersionId: 10601 + letter.charCodeAt(0),
    displayName,
    fileSha256: letter.repeat(64),
    kind,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: kind === 'checkpoint' ? 'v_prediction' : null,
    versionName: 'Exact absent source version',
  }
}
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
  await window.waitForFunction(() => typeof window.api?.presets?.list === 'function')
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  assert.deepEqual(await api('models', 'getCatalog'), [])
  await api('projects', 'list')
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
}
async function api(scope, method, ...args) {
  const result = await window.evaluate(
    ({ scope, method, args }) => window.api[scope][method](...args),
    { scope, method, args },
  )
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function project() {
  const value = await api('projects', 'open', projectId)
  assert.equal(value.kind, 'opened')
  return value.tab
}
const projectView = () => window.getByLabel(`Project ${projectTitle}`, { exact: true })
async function openProjectUi() {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toBeVisible()
  await expect(projectView()).toBeVisible()
}
async function closeProjectUi(discard = false) {
  const tab = window.getByRole('tab', { name: projectTitle, exact: true })
  await window.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
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
    assert.equal(discard, true, 'Clean close should not ask to discard')
    await discardButton.click()
  }
  await expect(tab).toHaveCount(0)
}
const manager = () => window.getByRole('dialog', { name: 'Preset Manager', exact: true })
const guard = () => window.getByRole('dialog', { name: 'Unsaved preset changes', exact: true })
const footer = () => manager().getByLabel('Preset editor actions', { exact: true })
const nameInput = () => manager().getByRole('textbox', { name: 'Preset name', exact: true })
const sourceBanner = () => manager().getByRole('alert', { name: 'Source result', exact: true })
const promptEditor = () => manager().getByRole('textbox', { name: 'Preset prompt', exact: true })
async function expectPrompt(editor, value) {
  await expect
    .poll(async () => (await editor.locator('.cm-line').allTextContents()).join('\n'))
    .toBe(value)
}
async function rows(table) {
  return (await database.db.selectFrom(table).selectAll().execute()).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  )
}
async function modelRows() {
  const tables = ['model_resource', 'model_resource_version', 'local_model_file']
  const result = {}
  for (const name of tables) result[name] = await rows(name)
  return result
}
async function assertProjectUnchanged() {
  assert.deepEqual(await project(), projectBaseline)
  assert.equal(
    readFileSync(packagePath).equals(packageBytes),
    true,
    'Result preset creation changed the saved Project package',
  )
  assert.deepEqual(await modelRows(), modelBaseline)
  assert.deepEqual(await rows('generation_seed_cursor'), seedBaseline)
  assert.deepEqual(await rows('checkpoint_prediction_override'), predictionBaseline)
  assert.deepEqual(await rows('checkpoint_noise_profile_override'), noiseBaseline)
}
async function openLayerMenu(layer) {
  await projectView()
    .getByRole('button', { name: `Layer actions for ${layer.name}`, exact: true })
    .click()
}
async function activateResult(layer) {
  await openLayerMenu(layer)
  await window
    .getByRole('menuitem', { name: 'Save Preset from Result', exact: true })
    .and(window.locator('[aria-disabled="false"]'))
    .click()
}
async function openSourceDraft(layer = fixture.generated) {
  await activateResult(layer)
  await expect(manager()).toBeVisible()
  await expect(manager().getByRole('article', { name: 'Preset draft', exact: true })).toBeVisible()
  await expect(sourceBanner()).toContainText(projectTitle)
  await expect(sourceBanner()).toContainText(layer.name)
  await expect(sourceBanner()).toContainText('expanded prompts')
  await expect(sourceBanner()).toContainText('Seed is not included by default')
  await expect(nameInput()).toHaveValue(`${layer.name} Preset`)
  await expect(
    manager().getByRole('checkbox', { name: 'Include Seed', exact: true }),
  ).not.toBeChecked()
  await expectPrompt(
    promptEditor(),
    layer.generationProvenance.generationConfiguration.positivePrompt.text,
  )
  await assertProjectUnchanged()
}
async function cancelDraft() {
  await footer().getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(manager()).toHaveCount(0)
  await expect(projectView()).toBeVisible()
  await assertProjectUnchanged()
}
async function createDraft(name) {
  await nameInput().fill(name)
  await expect(
    manager().getByRole('button', { name: 'Select preset draft', exact: true }),
  ).toContainText(name)
  await footer().getByRole('button', { name: 'Create Preset', exact: true }).click()
  await expect(
    manager().getByRole('button', { name: `Select preset ${name}`, exact: true }),
  ).toBeVisible()
  const matches = (await api('presets', 'list')).filter((record) => record.name === name)
  assert.equal(matches.length, 1)
  await assertProjectUnchanged()
  return matches[0]
}
function expectedPayload(layer = fixture.generated) {
  const config = layer.generationProvenance.generationConfiguration
  const payload = {
    guidance: { steps: config.sampling.steps, cfgScale: config.sampling.cfgScale },
    model: structuredClone(config.model),
    negativePrompt: structuredClone(config.negativePrompt),
    prompt: structuredClone(config.positivePrompt),
    sampling:
      'anima' in config
        ? { animaMethod: config.sampling.animaMethod }
        : { sampler: config.sampling.sampler, scheduler: config.sampling.scheduler },
    size: structuredClone(config.size),
  }
  for (const field of ['cfgRescale', 'loras', 'vae', 'vaePrecision'])
    if (Object.hasOwn(config, field)) payload[field] = structuredClone(config[field])
  if (config.sampling.noiseProfile)
    payload.model.noiseProfile = structuredClone(config.sampling.noiseProfile)
  if (config.mode !== 'txt2img') payload.denoisingStrength = config.sampling.denoisingStrength
  return payload
}
function assertNoSourceLink(record) {
  const serialized = JSON.stringify(record)
  for (const layer of [fixture.generated, fixture.anima]) {
    const provenance = layer.generationProvenance
    for (const id of [
      layer.id,
      provenance.executionResultContext.candidateId,
      provenance.executionResultContext.queueItemId,
      provenance.layerSourceContext.sourceDocumentRevision,
    ])
      assert.equal(serialized.includes(id), false, `Preset leaked source identity ${id}`)
  }
  for (const id of [projectId, projectBaseline.documentId])
    assert.equal(serialized.includes(id), false)
  assert.equal(Object.hasOwn(record.payload, 'seed'), false)
  for (const key of [
    'dynamicPrompt',
    'maxPrompts',
    'seedBehavior',
    'batchSize',
    'bbox',
    'layers',
    'sourceId',
    'projectId',
    'documentId',
    'anima',
    'mode',
    'executionResultContext',
    'layerSourceContext',
    'internalResolution',
    'actualSeed',
    'requestedSeedPolicy',
    'invokeScheduler',
  ])
    assert.equal(Object.hasOwn(record.payload, key), false)
  assert.deepEqual(Object.keys(record.payload.size).sort(), ['height', 'width'])
  for (const key of [
    'actualSeed',
    'requestedSeedPolicy',
    'seedBehavior',
    'invokeScheduler',
    'noiseProfile',
  ])
    assert.equal(Object.hasOwn(record.payload.sampling, key), false)
}
async function removeFailureTrigger() {
  if (!triggerInstalled || !database) return
  await sql`DROP TRIGGER IF EXISTS preset_save_result_owned_failure`.execute(database.db)
  triggerInstalled = false
  assert.equal(
    (
      await sql`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'preset_save_result_owned_failure'`.execute(
        database.db,
      )
    ).rows.length,
    0,
  )
}
async function holdActualResultReply() {
  await application.evaluate(
    ({ ipcMain }, owner) => {
      const channel = 'projects:get-raster-preset-data'
      const original = ipcMain._invokeHandlers.get(channel)
      if (typeof original !== 'function')
        throw new Error('Actual result-preset handler is missing.')
      const probe = {
        original,
        held: false,
        completed: false,
        delivered: false,
        ok: false,
        args: null,
        response: null,
        release: null,
      }
      const delivery = new Promise((resolve) => {
        probe.release = resolve
      })
      globalThis.igsSaveResultReplyProbe = probe
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, async (event, ...args) => {
        const hold =
          !probe.held &&
          args[0] === owner.projectId &&
          args[1] === owner.documentId &&
          args[2] === owner.layerId
        if (hold) {
          probe.held = true
          probe.args = structuredClone(args)
        }
        const result = await original(event, ...args)
        if (hold) {
          probe.completed = true
          probe.ok = result.ok === true
          probe.response = structuredClone(result)
          await delivery
          probe.delivered = true
        }
        return result
      })
    },
    { projectId, documentId: projectBaseline.documentId, layerId: fixture.generated.id },
  )
  resultReplyHeld = true
}
async function releaseActualResultReply() {
  if (!resultReplyHeld || !application) return
  const released = await application.evaluate(({ ipcMain }) => {
    const probe = globalThis.igsSaveResultReplyProbe
    if (!probe) throw new Error('Owned result reply probe missing during restoration.')
    ipcMain.removeHandler('projects:get-raster-preset-data')
    ipcMain.handle('projects:get-raster-preset-data', probe.original)
    probe.release()
    return { held: probe.held }
  })
  // Installation may be unwound before activation reaches Main; no reply exists to await then.
  if (released.held) {
    await expect
      .poll(async () => application.evaluate(() => globalThis.igsSaveResultReplyProbe.delivered))
      .toBe(true)
  }
  await application.evaluate(() => {
    delete globalThis.igsSaveResultReplyProbe
  })
  resultReplyHeld = false
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
}
async function cleanupOwnedUi() {
  if (!window || window.isClosed()) return
  if (await guard().isVisible()) {
    await guard().getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(guard()).toHaveCount(0)
  }
  if (await manager().isVisible()) {
    await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
    if (await guard().isVisible())
      await guard()
        .getByRole('button', { name: /^(Discard Draft|Discard)$/ })
        .click()
    await expect(manager()).toHaveCount(0)
  }
  if (projectId && (await window.getByRole('tab', { name: projectTitle, exact: true }).count()))
    await closeProjectUi(true)
}
async function closeNative(label) {
  if (!application) return
  await releaseActualResultReply()
  await cleanupOwnedUi()
  await removeFailureTrigger()
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
async function screenshot(label, width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) =>
      BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
    { width, height },
  )
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
  await manager()
    .locator('.editor-scroll .n-scrollbar-container')
    .evaluate((element) => {
      element.scrollTop = 0
    })
  await expect(sourceBanner()).toBeVisible()
  await expect(footer()).toBeVisible()
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
  const geometry = await manager().evaluate((element) => {
    const rect = (target) => {
      if (!target) throw new Error('Missing source draft geometry')
      const value = target.getBoundingClientRect()
      return {
        x: value.x,
        y: value.y,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      }
    }
    return {
      modal: rect(element),
      footer: rect(element.querySelector('.editor-actions')),
      source: rect(element.querySelector('[aria-label="Source result"]')),
      heading: rect(element.querySelector('.manager-header h1')),
      rootScrollTop: element.scrollTop,
      viewport: [innerWidth, innerHeight],
      primaryActions: [...element.querySelectorAll('button.n-button--primary-type')].map((button) =>
        button.textContent.trim(),
      ),
    }
  })
  assert.deepEqual(geometry.viewport, [width, height])
  assert.ok(
    geometry.modal.x >= -1 &&
      geometry.modal.y >= -1 &&
      geometry.modal.right <= width + 1 &&
      geometry.modal.bottom <= height + 1,
  )
  assert.ok(
    geometry.footer.bottom <= geometry.modal.bottom + 1 &&
      geometry.source.y >= geometry.modal.y &&
      geometry.heading.y >= geometry.modal.y &&
      geometry.heading.bottom <= geometry.modal.bottom,
  )
  assert.equal(geometry.rootScrollTop, 0)
  assert.deepEqual(geometry.primaryActions, ['Create Preset'])
  const file = path.join(evidenceRoot, `${label}-${width}x${height}.png`)
  await window.screenshot({
    path: file,
    animations: 'disabled',
    clip: {
      x: geometry.modal.x,
      y: geometry.modal.y,
      width: geometry.modal.width,
      height: geometry.modal.height,
    },
  })
  report.screenshots.push({ label, path: file, geometry })
  writeReport()
}
async function prepareClosedFixture() {
  const projectRoot = path.join(appDataRoot, 'workspaces/Uncategorized')
  mkdirSync(projectRoot, { recursive: true })
  const session = await ProjectSession.create(
    path.join(projectRoot, `${projectTitle}.igs`),
    projectTitle,
    {
      placeholdersDir: path.resolve('dist/main/placeholders'),
      scratchDir: path.join(fixtureRoot, 'scratch'),
    },
  )
  const bbox = { width: 64, height: 96, x: 16, y: -8 }
  const original = await acceptedOutputPngFixture(bbox.width, bbox.height)
  const changed = await acceptedOutputPngFixture(bbox.width * 2, bbox.height * 2)
  const provenance = acceptedRasterProvenanceFixture(session.document, original, bbox)
  const config = provenance.generationConfiguration
  config.model = reference('checkpoint', 'Recorded NoobAI checkpoint', 'a')
  config.positivePrompt = {
    text: concretePrompt,
    embeddingRefs: [
      { token: '<result-vector>', resource: reference('embedding', 'Result vector', 'b') },
    ],
  }
  config.negativePrompt = {
    text: concreteNegative,
    embeddingRefs: [
      {
        token: '<result-negative-vector>',
        resource: reference('embedding', 'Result negative vector', 'c'),
      },
    ],
  }
  config.loras = [
    { enabled: true, weight: -0.35, resource: reference('lora', 'Recorded signed LoRA', 'd') },
    { enabled: false, weight: 0, resource: reference('lora', 'Recorded disabled LoRA', 'e') },
  ]
  config.cfgRescale = 0
  config.vae = reference('vae', 'Recorded missing VAE', 'f')
  config.vaePrecision = 'FP32'
  Object.assign(config.sampling, {
    actualSeed: 0,
    requestedSeedPolicy: 'reuse',
    seedBehavior: 'per-prompt',
    cfgScale: 7.25,
    steps: 31,
    noiseProfile: {
      baseSchedule: 'sdxl-scaled-linear-v1',
      rescaleBetasZeroSnr: true,
      schemaVersion: 1,
      timestepSpacing: 'trailing',
    },
  })
  const animaBbox = { width: 64, height: 64, x: -64, y: 0 }
  const animaPng = await acceptedOutputPngFixture(animaBbox.width, animaBbox.height)
  const animaProvenance = acceptedAnimaProvenanceFixture(session.document, animaPng, animaBbox, {
    mode: 'img2img',
    actualSeed: 0,
    animaMethod: 'heun',
  })
  const layer = (name, image, width, height, generationProvenance) => {
    const id = randomUUID()
    return {
      id,
      name,
      kind: 'raster',
      visible: true,
      locked: Boolean(generationProvenance),
      opacity: 1,
      blendMode: 'normal',
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
      asset: {
        path: `assets/layers/${id}.png`,
        bytes: image.length,
        sha256: digest(image),
        width,
        height,
      },
      ...(generationProvenance ? { generationProvenance } : {}),
    }
  }
  const generated = layer(
    'Accepted dynamic lantern',
    changed,
    bbox.width * 2,
    bbox.height * 2,
    provenance,
  )
  const anima = layer(
    'Accepted Anima img2img',
    animaPng,
    animaBbox.width,
    animaBbox.height,
    animaProvenance,
  )
  const legacy = layer('Imported neighboring image', original, bbox.width, bbox.height)
  const currentModel = reference('checkpoint', 'Current different checkpoint', '9')
  session.applyDocument({
    ...session.document,
    primaryBbox: { width: 768, height: 512, x: 120, y: -32 },
    lastActualSeedSnapshot: 918273,
    generationDraft: {
      ...session.document.generationDraft,
      cfgRescale: 0.35,
      dynamicPrompt: { maxPrompts: 4, seedBehavior: 'per-iteration' },
      model: currentModel,
      positivePrompt: { text: authoredPrompt, embeddingRefs: [] },
      negativePrompt: { text: authoredNegative, embeddingRefs: [] },
      loras: [],
      sampling: {
        cfgScale: 6,
        denoisingStrength: 0.45,
        sampler: 'Euler',
        scheduler: 'Normal',
        animaMethod: 'euler',
        steps: 24,
      },
      seed: { policy: 'fixed', value: 918273 },
      vae: null,
      vaePrecision: 'Auto',
    },
    layers: [generated, anima, legacy],
  })
  await session.save({
    assets: {
      [generated.asset.path]: { bytes: changed },
      [anima.asset.path]: { bytes: animaPng },
      [legacy.asset.path]: { bytes: original },
    },
  })
  const saved = (await readIgsPackage(session.filePath)).project
  assert.equal(saved.layers.length, 3)
  assert.deepEqual(saved.layers[0].generationProvenance, provenance)
  assert.deepEqual(saved.layers[1].generationProvenance, animaProvenance)
  assert.equal(Object.hasOwn(saved.layers[2], 'generationProvenance'), false)
  packagePath = session.filePath
  packageBytes = readFileSync(packagePath)
  projectId = session.localRecoveryKey
  return { generated, anima, legacy, path: packagePath, document: saved }
}
async function captureSourceBaseline() {
  projectBaseline = await project()
  assert.equal(projectBaseline.dirty, false)
  assert.equal(projectBaseline.canUndo, false)
  modelBaseline = await modelRows()
  seedBaseline = await rows('generation_seed_cursor')
  predictionBaseline = await rows('checkpoint_prediction_override')
  noiseBaseline = await rows('checkpoint_noise_profile_override')
}
async function closeManager() {
  await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await expect(manager()).toHaveCount(0)
}
async function readResult() {
  return await window.evaluate(
    (owner) =>
      window.api.projects.getRasterPresetData(owner.projectId, owner.documentId, owner.layerId),
    { projectId, documentId: projectBaseline.documentId, layerId: fixture.generated.id },
  )
}
async function preloadCorrelationProbe() {
  const malformed = await window.evaluate(
    (owner) =>
      window.api.projects.getRasterPresetData(owner.projectId, 'malformed-owner', owner.layerId),
    { projectId, layerId: fixture.generated.id },
  )
  assert.equal(malformed.ok, false)
  const foreignDocument = await window.evaluate(
    (owner) =>
      window.api.projects.getRasterPresetData(
        owner.projectId,
        '00112233-4455-4677-8899-aabbccddeeff',
        owner.layerId,
      ),
    { projectId, layerId: fixture.generated.id },
  )
  assert.equal(foreignDocument.ok, false)
  await application.evaluate(({ ipcMain }) => {
    const channel = 'projects:get-raster-preset-data'
    const original = ipcMain._invokeHandlers.get(channel)
    if (typeof original !== 'function') throw new Error('Real result-preset handler is missing.')
    globalThis.igsSaveResultCorrelationProbe = { original, mode: null }
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      const response = await original(event, ...args)
      if (!response.ok) return response
      const changed = structuredClone(response)
      const mode = globalThis.igsSaveResultCorrelationProbe.mode
      if (mode === 'document') changed.value.documentId = '00112233-4455-4677-8899-aabbccddeeff'
      if (mode === 'layer') changed.value.layerId = '00112233-4455-4677-8899-aabbccddeeff'
      if (mode === 'private')
        changed.value.generationConfiguration.model.managedPath = '/private/fixture/model'
      return changed
    })
  })
  try {
    for (const mode of ['document', 'layer', 'private']) {
      await application.evaluate((_, value) => {
        globalThis.igsSaveResultCorrelationProbe.mode = value
      }, mode)
      const response = await readResult()
      assert.equal(response.ok, false, mode)
      assert.equal(response.error.code, 'IPC_INVALID_RESPONSE', mode)
    }
  } finally {
    await application.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('projects:get-raster-preset-data')
      ipcMain.handle(
        'projects:get-raster-preset-data',
        globalThis.igsSaveResultCorrelationProbe.original,
      )
      delete globalThis.igsSaveResultCorrelationProbe
    })
  }
  const restored = await readResult()
  assert.equal(restored.ok, true)
  assert.deepEqual(
    restored.value.generationConfiguration,
    fixture.generated.generationProvenance.generationConfiguration,
  )
  assert.equal(restored.value.currentMode, null)
  await assertProjectUnchanged()
  check(
    'Actual owner guards reject malformed/foreign requests; preload correlation rejects foreign document/layer and private fields on real responses, and restored worker-free read remains exact',
    { malformedCode: malformed.error.code, foreignDocumentCode: foreignDocument.error.code },
  )
}

try {
  fixture = await prepareClosedFixture()
  await launch('result-preset')
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1380, 900),
  )
  await openProjectUi()
  await captureSourceBaseline()
  assert.equal(projectBaseline.acceptedResults.length, 2)
  assert.deepEqual(await rows('presets'), [])
  assert.notEqual(projectBaseline.generationDraft.positivePrompt.text, concretePrompt)
  assert.notDeepEqual(
    projectBaseline.primaryBbox,
    fixture.generated.generationProvenance.layerSourceContext.bbox,
  )
  check(
    'Built Home opens strict saved accepted Illustrious/Anima results and legacy neighbor while current authored template/settings/size differ; runtime and model catalog remain absent',
  )

  await openLayerMenu(fixture.legacy)
  const unavailable = window.getByRole('menuitem', {
    name: 'Save Preset from Result',
    exact: true,
  })
  await expect(unavailable).toHaveAttribute('aria-disabled', 'true')
  await expect(
    window.getByRole('menuitem', {
      name: 'Compare generation settings · No generation data',
      exact: true,
    }),
  ).toHaveAttribute('aria-disabled', 'true')
  // This uncontrolled click dropdown closes by toggling its real trigger.
  // Escape is not a qualified dismissal mechanism for this primitive.
  await openLayerMenu(fixture.legacy)
  await expect(unavailable).toHaveCount(0)
  await expect(manager()).toHaveCount(0)
  assert.deepEqual(await rows('presets'), [])
  await assertProjectUnchanged()
  check(
    'Imported legacy layer disables Save Preset from Result with the neighboring Compare action explaining No generation data; no transient editor or preset row',
  )

  await preloadCorrelationProbe()

  await holdActualResultReply()
  await activateResult(fixture.generated)
  await expect
    .poll(async () => application.evaluate(() => globalThis.igsSaveResultReplyProbe.completed))
    .toBe(true)
  const held = await application.evaluate(() => {
    const probe = globalThis.igsSaveResultReplyProbe
    return { ok: probe.ok, args: probe.args, response: probe.response }
  })
  assert.equal(held.ok, true)
  assert.deepEqual(held.args, [projectId, projectBaseline.documentId, fixture.generated.id])
  assert.deepEqual(
    held.response.value.generationConfiguration,
    fixture.generated.generationProvenance.generationConfiguration,
  )
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await releaseActualResultReply()
  await expect(manager()).toHaveCount(0)
  assert.deepEqual(await rows('presets'), [])
  await window.getByRole('tab', { name: projectTitle, exact: true }).click()
  await assertProjectUnchanged()
  check(
    'After Home switching, a held successful original Main result reply is released unchanged and cannot open a stale source editor or allocate a row',
    { heldOwner: held.args },
  )

  await openSourceDraft()
  await expect(manager().getByLabel('Preset workflow', { exact: true })).toContainText(
    'Text to Image',
  )
  await expect(sourceBanner()).toContainText('64 × 96')
  await expect(sourceBanner()).toContainText('Recorded NoobAI checkpoint')
  const sections = [
    'Prompt',
    'Negative Prompt',
    'Model',
    'LoRAs',
    'Size',
    'Sampler & Scheduler',
    'Steps & CFG',
    'CFG Rescale',
    'VAE',
    'VAE Precision',
  ]
  for (const label of sections)
    await expect(
      manager().getByRole('checkbox', { name: `Include ${label}`, exact: true }),
    ).toBeChecked()
  assert.deepEqual(await rows('presets'), [])
  await screenshot('result-source-draft', 1380, 900)
  await screenshot('result-source-draft', 900, 680)
  await cancelDraft()
  assert.deepEqual(await rows('presets'), [])
  check(
    'Result action opens counted-out detached source draft with frozen concrete prompts, saved original size and recorded resources/advanced settings, Seed excluded, no ID before Create; Cancel writes nothing',
  )

  await openSourceDraft()
  await nameInput().fill('Discarded accepted result recipe')
  await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await expect(guard()).toBeVisible()
  await guard().getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(nameInput()).toHaveValue('Discarded accepted result recipe')
  await expect(sourceBanner()).toContainText(fixture.generated.name)
  await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await guard().getByRole('button', { name: 'Discard Draft', exact: true }).click()
  await expect(manager()).toHaveCount(0)
  assert.deepEqual(await rows('presets'), [])
  await assertProjectUnchanged()
  check(
    'Edited source draft retains frozen result context on Cancel guard; Discard closes without a stored ID or source mutation',
  )

  await openSourceDraft()
  await manager()
    .getByRole('textbox', { name: 'Preset description', exact: true })
    .fill('Reusable concrete accepted-result recipe')
  await manager().getByRole('switch', { name: 'Favorite preset', exact: true }).click()
  await promptEditor().fill(`${concretePrompt}, detached style`)
  await manager().getByRole('checkbox', { name: 'Include Steps & CFG', exact: true }).uncheck()
  assert.deepEqual(await rows('presets'), [])
  created = await createDraft('Created accepted result recipe')
  const editedExpected = expectedPayload()
  delete editedExpected.guidance
  editedExpected.prompt.text = `${concretePrompt}, detached style`
  assert.deepEqual(created.payload, editedExpected)
  assert.equal(created.workflow, 'textToImage')
  assert.deepEqual(created.tags, ['result'])
  assert.equal(created.favorite, true)
  assert.equal(created.description, 'Reusable concrete accepted-result recipe')
  assertNoSourceLink(created)
  await expect(sourceBanner()).toHaveCount(0)
  await closeManager()
  check(
    'Actual Create saves editable detached metadata, concrete prompt/embedding sidecars and selected sections; historical objective/noise/VAE remain portable hints while source/execution/batch/seed context is excluded',
  )

  await openSourceDraft()
  await nameInput().fill('Retryable accepted result recipe')
  const beforeFailure = await rows('presets')
  await sql`CREATE TRIGGER preset_save_result_owned_failure BEFORE INSERT ON presets BEGIN SELECT RAISE(ABORT, 'Owned Save Result failure'); END`.execute(
    database.db,
  )
  triggerInstalled = true
  await footer().getByRole('button', { name: 'Create Preset', exact: true }).click()
  await expect(
    manager().getByRole('alert', { name: 'Preset action failed', exact: true }),
  ).toContainText('PRESET_STORAGE_FAILED')
  await expect(nameInput()).toHaveValue('Retryable accepted result recipe')
  await expect(sourceBanner()).toContainText(fixture.generated.name)
  await expectPrompt(promptEditor(), concretePrompt)
  assert.deepEqual(await rows('presets'), beforeFailure)
  await assertProjectUnchanged()
  await removeFailureTrigger()
  retried = await createDraft('Retryable accepted result recipe')
  assert.deepEqual(retried.payload, expectedPayload())
  assertNoSourceLink(retried)
  await closeManager()
  check(
    'Real SQLite INSERT failure leaves no partial row, retains exact expanded prompts/context and edits, and retry persists every recorded portable field',
  )

  await openSourceDraft(fixture.anima)
  await expect(manager().getByLabel('Preset workflow', { exact: true })).toContainText(
    'Image to Image',
  )
  await expect(
    manager().getByRole('checkbox', { name: 'Include Denoising Strength', exact: true }),
  ).toBeChecked()
  animaCreated = await createDraft('Created Anima result recipe')
  assert.deepEqual(animaCreated.payload, expectedPayload(fixture.anima))
  assert.deepEqual(animaCreated.payload.sampling, { animaMethod: 'heun' })
  assert.equal(animaCreated.payload.denoisingStrength, 0)
  assert.equal(animaCreated.payload.cfgRescale, 0)
  assert.equal(animaCreated.payload.vaePrecision, 'Auto')
  assert.deepEqual(animaCreated.payload.loras, [])
  assert.equal(animaCreated.workflow, 'imageToImage')
  assertNoSourceLink(animaCreated)
  await closeManager()
  check(
    'Native Anima accepted img2img maps to Image to Image with Heun and denoising zero, preserving recorded empty LoRAs/zero/Auto and excluding dormant SD sampling and pinned companion context',
  )

  const beforeRestart = await rows('presets')
  await closeNative('result-preset')
  await launch('restart')
  assert.deepEqual(await rows('presets'), beforeRestart)
  await openProjectUi()
  await captureSourceBaseline()
  assert.equal(readFileSync(packagePath).equals(packageBytes), true)
  await projectView().getByRole('button', { name: 'Manage Presets', exact: true }).click()
  await expect(manager()).toBeVisible()
  for (const record of [created, retried, animaCreated]) {
    await manager()
      .getByRole('button', { name: `Select preset ${record.name}`, exact: true })
      .click()
    await expect(nameInput()).toHaveValue(record.name)
    assert.deepEqual(await api('presets', 'get', record.id), record)
    assertNoSourceLink(record)
  }
  await expect(sourceBanner()).toHaveCount(0)
  await closeManager()
  await assertProjectUnchanged()
  await closeNative('restart')
  assert.equal(report.nativeClosures.length, 2)
  assert.deepEqual(report.pageErrors, [])
  check(
    'Physical Electron restart restores only explicitly created result presets through the ordinary manager; no transient source link or Project/.igs/history/seed/model-policy change',
  )
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'
  report.failure = { message: error.message, stack: error.stack }
  if (window && !window.isClosed()) {
    const screenshotFile = path.join(evidenceRoot, 'failure.png')
    try {
      await window.screenshot({ path: screenshotFile, animations: 'disabled', timeout: 5_000 })
      report.diagnostics.push({ kind: 'screenshot', path: screenshotFile })
      report.screenshots.push({ label: 'failure-before-cleanup', path: screenshotFile })
    } catch (diagnosticError) {
      report.diagnosticFailures.push({ kind: 'screenshot', message: diagnosticError.message })
    }
    const snapshotFile = path.join(evidenceRoot, 'failure.aria.yml')
    try {
      writeFileSync(snapshotFile, await window.locator('body').ariaSnapshot({ timeout: 5_000 }))
      report.diagnostics.push({ kind: 'ariaSnapshot', path: snapshotFile })
    } catch (diagnosticError) {
      report.diagnosticFailures.push({ kind: 'ariaSnapshot', message: diagnosticError.message })
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
