/** Built Electron Save Current as Preset qualification; no ML or result-to-preset claim. */
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

const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'native-save-current-payload-'))
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
  sourceActivations: [],
  pageErrors: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  sourceSha256: hashFiles([
    'scripts/smoke-preset-save-current.mjs',
    'scripts/native-smoke-window.mjs',
    'scripts/qualification-resource-limits.mjs',
    'src/renderer/App.vue',
    'src/renderer/components/ProjectView.vue',
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
      'Real Home creation and Project Save/open/close → Save Current as Preset → shared source-aware Preset Manager transient create, guards and real preload/Main/SQLite Create. Exact authored text/resources, incomplete source repair, immutable Project/.igs/model state and physical native restart.',
    fixtures:
      'A Home-created Project is saved/closed through App UI before the production .igs writer copies exact deliberately missing checkpoint/LoRA/embedding references and named typed generation settings. A second closed-package fixture adds one 2×2 opaque PNG and an incomplete guidance field. One real Main draft command runs normally while its original reply is held, then released unchanged, to expose renderer acknowledgement timing. No model files, runtime, inference, downloads or new workers. An owned SQLite INSERT trigger provides a real recoverable Create failure.',
    limits:
      'The launching actor must have finite RAM and zero swap. The existing native owner helper enforces 2 GiB per actual native scope, zero swap and a finite 300-second deadline.',
    notQualified:
      'Result-to-preset, Smart Patch capture, worker-backed pixel-mode classification, installed-resource resolution, release packaging and arbitrary storage corruption are outside this finite slice. A missing worker makes nonempty Canvas workflow explicit; this test never infers generation mode from nonexistent ML output.',
    cleanup:
      'Only the owned manager draft and owned Project tab are discarded on failure via actual App UI. The owned INSERT trigger is removed before database close; payloads remain for root cleanup after independently confirmed physical exit.',
  },
}
let application
let window
let database
let nativeChecks = []
let projectId
let packagePath
let packageBytes
let projectBaseline
let triggerInstalled = false
let draftReplyHeld = false
let created
let retried
let incompleteCreated
const projectTitle = 'Native Save Current Project'
const sourcePrompt = 'portrait <saved-vector>, {blue|red}\n(soft light:1.2), literal 日本語'
const sourceNegative = 'negative <neg-vector>, {soft|hard}'
const opaqueRaster = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const sourceReferences = {
  model: reference('checkpoint', 'Missing source checkpoint', 'a'),
  lora: reference('lora', 'Missing source LoRA', 'b'),
  disabledLora: reference('lora', 'Disabled copied LoRA', 'c'),
  embedding: reference('embedding', 'Saved source embedding', 'd'),
  negativeEmbedding: reference('embedding', 'Saved negative embedding', 'e'),
}
let fixtureLayerId

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
async function saveProjectUi() {
  const save = projectView().getByRole('button', { name: 'Save Project', exact: true })
  await save.click()
  await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  await expect(save).toBeEnabled()
  await expect(projectView().locator('.document-state')).toHaveText('Saved')
  await expect.poll(async () => (await project()).dirty).toBe(false)
  return await project()
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
const sourceBanner = () => manager().getByRole('alert', { name: 'Source project', exact: true })
const promptEditor = () => manager().getByRole('textbox', { name: 'Preset prompt', exact: true })
async function expectPrompt(editor, value) {
  await expect
    .poll(async () => (await editor.locator('.cm-line').allTextContents()).join('\n'))
    .toBe(value)
}
async function rows(table) {
  return await database.db.selectFrom(table).selectAll().orderBy('id').execute()
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
    'Save Current changed the saved Project package',
  )
  assert.deepEqual(await modelRows(), {
    model_resource: [],
    model_resource_version: [],
    local_model_file: [],
  })
}
async function openSourceDraft(traceActivation = false) {
  if (traceActivation) {
    await window.evaluate(() => {
      const source = () => document.querySelector('button[aria-label="Save Current as Preset"]')
      const describe = (element) => {
        if (!(element instanceof Element)) return null
        const button = element.closest('button')
        return {
          tag: element.tagName,
          ariaLabel: element.getAttribute('aria-label'),
          buttonLabel: button?.getAttribute('aria-label') ?? null,
          buttonText: button?.textContent?.trim().slice(0, 120) ?? null,
        }
      }
      const state = () => {
        const button = source()
        const rect = button?.getBoundingClientRect()
        const seed = document.querySelector('input[aria-label="Generation seed"]')
        return {
          sourceDisabled: button?.disabled ?? null,
          sourceRect: rect
            ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            : null,
          seedValue: seed?.value ?? null,
          activeControl: describe(document.activeElement),
        }
      }
      const probe = { before: state(), events: [], totalEvents: 0, state, listener: null }
      probe.listener = (event) => {
        probe.totalEvents += 1
        if (probe.events.length < 32) {
          probe.events.push({ type: event.type, target: describe(event.target), ...state() })
        }
      }
      globalThis.igsSaveCurrentActivationProbe = probe
      for (const type of ['pointerdown', 'mousedown', 'click', 'focusout', 'focusin']) {
        document.addEventListener(type, probe.listener, true)
      }
    })
  }
  try {
    await projectView().getByRole('button', { name: 'Save Current as Preset', exact: true }).click()
  } finally {
    if (traceActivation) {
      try {
        const activation = await window.evaluate(() => {
          const probe = globalThis.igsSaveCurrentActivationProbe
          for (const type of ['pointerdown', 'mousedown', 'click', 'focusout', 'focusin']) {
            document.removeEventListener(type, probe.listener, true)
          }
          const result = {
            before: probe.before,
            events: probe.events,
            totalEvents: probe.totalEvents,
            after: probe.state(),
          }
          delete globalThis.igsSaveCurrentActivationProbe
          return result
        })
        report.sourceActivations.push({ case: 'excluded-empty-seed-pointer', ...activation })
      } catch (error) {
        report.diagnosticFailures.push({ kind: 'sourceActivation', message: error.message })
      }
      writeReport()
    }
  }
  await expect(manager()).toBeVisible()
  if (traceActivation) {
    const activation = report.sourceActivations.at(-1)
    assert.ok(activation, 'Source pointer activation must have actual event evidence')
    const down = activation.events.find((event) => event.type === 'mousedown')
    const click = activation.events.find((event) => event.type === 'click')
    assert.equal(click?.target?.buttonLabel, 'Save Current as Preset')
    assert.ok(down?.sourceRect && click?.sourceRect)
    assert.ok(
      Math.abs(down.sourceRect.y - click.sourceRect.y) <= 1,
      'The source button must remain still between press and release',
    )
  }
  await expect(manager().getByRole('article', { name: 'Preset draft', exact: true })).toBeVisible()
  await expect(sourceBanner()).toContainText(projectTitle)
  await expect(sourceBanner()).toContainText('Seed is not included by default')
  await expect(nameInput()).toHaveValue(`${projectTitle} Baseline`)
  await expect(
    manager().getByRole('checkbox', { name: 'Include Seed', exact: true }),
  ).not.toBeChecked()
  await expectPrompt(promptEditor(), sourcePrompt)
  await assertProjectUnchanged()
}
async function cancelDraft() {
  await footer().getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(manager()).toHaveCount(0)
  await expect(projectView()).toBeVisible()
  await expect(
    projectView().getByRole('button', { name: 'Save Current as Preset', exact: true }),
  ).toBeFocused()
  await assertProjectUnchanged()
}
async function chooseWorkflow(label) {
  await manager().getByLabel('Preset workflow', { exact: true }).click()
  await window
    .locator('.n-base-select-option')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click()
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
function expectedPayload() {
  const draft = projectBaseline.generationDraft
  return {
    cfgRescale: 0,
    guidance: { steps: draft.sampling.steps, cfgScale: draft.sampling.cfgScale },
    loras: draft.loras,
    model: draft.model,
    negativePrompt: draft.negativePrompt,
    prompt: draft.positivePrompt,
    sampling: {
      sampler: draft.sampling.sampler,
      scheduler: draft.sampling.scheduler,
      animaMethod: draft.sampling.animaMethod,
    },
    size: { width: projectBaseline.primaryBbox.width, height: projectBaseline.primaryBbox.height },
    vae: null,
    vaePrecision: 'Auto',
  }
}
function assertNoSourceLink(record) {
  const serialized = JSON.stringify(record)
  for (const id of [projectId, projectBaseline.documentId, fixtureLayerId].filter(Boolean))
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
  ])
    assert.equal(Object.hasOwn(record.payload, key), false)
  if (record.payload.size)
    assert.deepEqual(Object.keys(record.payload.size).sort(), ['height', 'width'])
}
async function removeFailureTrigger() {
  if (!triggerInstalled || !database) return
  await sql`DROP TRIGGER IF EXISTS preset_save_current_owned_failure`.execute(database.db)
  triggerInstalled = false
  assert.equal(
    (
      await sql`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'preset_save_current_owned_failure'`.execute(
        database.db,
      )
    ).rows.length,
    0,
  )
}
async function holdActualDraftReply(value) {
  await application.evaluate(
    ({ ipcMain }, target) => {
      const channel = 'projects:update-generation-draft'
      const original = ipcMain._invokeHandlers.get(channel)
      if (typeof original !== 'function')
        throw new Error('Actual Project draft handler is missing.')
      const probe = {
        original,
        held: false,
        completed: false,
        ok: false,
        args: null,
        release: null,
      }
      const delivery = new Promise((resolve) => {
        probe.release = resolve
      })
      globalThis.igsSaveCurrentDraftReplyProbe = probe
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, async (event, ...args) => {
        const hold =
          !probe.held &&
          args[0] === target.projectId &&
          args[1]?.kind === 'sampling-steps' &&
          args[1].value === target.value
        if (hold) {
          probe.held = true
          probe.args = structuredClone(args)
        }
        const result = await original(event, ...args)
        if (hold) {
          probe.completed = true
          probe.ok = result.ok === true
          await delivery
        }
        return result
      })
    },
    { projectId, value },
  )
  draftReplyHeld = true
}
async function releaseActualDraftReply() {
  if (!draftReplyHeld || !application) return
  await application.evaluate(({ ipcMain }) => {
    const probe = globalThis.igsSaveCurrentDraftReplyProbe
    if (!probe) throw new Error('Owned draft reply probe is missing during restoration.')
    ipcMain.removeHandler('projects:update-generation-draft')
    ipcMain.handle('projects:update-generation-draft', probe.original)
    probe.release()
    delete globalThis.igsSaveCurrentDraftReplyProbe
  })
  draftReplyHeld = false
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
  await releaseActualDraftReply()
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
      source: rect(element.querySelector('[aria-label="Source project"]')),
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
    geometry.footer.bottom <= geometry.modal.bottom + 1 && geometry.source.y >= geometry.modal.y,
  )
  assert.deepEqual(geometry.primaryActions, ['Create Preset'])
  const file = path.join(evidenceRoot, `${label}-${width}x${height}.png`)
  await manager().screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push({ label, path: file, geometry })
  writeReport()
}
async function installClosedFixture(nonempty = false, incomplete = false) {
  const session = await ProjectSession.open(packagePath, {
    placeholdersDir: path.resolve('dist/main/placeholders'),
    scratchDir: path.join(fixtureRoot, 'closed-project-scratch'),
  })
  const generationDraft = {
    ...session.document.generationDraft,
    cfgRescale: 0,
    dynamicPrompt: { maxPrompts: 3, seedBehavior: 'per-prompt' },
    model: sourceReferences.model,
    positivePrompt: {
      text: sourcePrompt,
      embeddingRefs: [{ token: '<saved-vector>', resource: sourceReferences.embedding }],
    },
    negativePrompt: {
      text: sourceNegative,
      embeddingRefs: [{ token: '<neg-vector>', resource: sourceReferences.negativeEmbedding }],
    },
    loras: [
      { enabled: true, resource: sourceReferences.lora, weight: -0.35 },
      { enabled: false, resource: sourceReferences.disabledLora, weight: 0 },
    ],
    sampling: {
      steps: incomplete ? null : 31,
      cfgScale: 7.25,
      denoisingStrength: 0.45,
      sampler: 'DPM++ SDE',
      scheduler: 'Karras',
      animaMethod: 'heun',
    },
    seed: { policy: 'fixed', value: 0 },
    vae: null,
    vaePrecision: 'Auto',
  }
  const assetPath = `assets/layers/${(fixtureLayerId ??= randomUUID())}.png`
  const layers = nonempty
    ? [
        {
          asset: {
            path: assetPath,
            bytes: opaqueRaster.length,
            sha256: digest(opaqueRaster),
            width: 2,
            height: 2,
          },
          blendMode: 'normal',
          id: fixtureLayerId,
          kind: 'raster',
          locked: false,
          name: 'Owned opaque mode fixture',
          opacity: 1,
          transform: { x: 104, y: -42, scaleX: 1, scaleY: 1, rotationDegrees: 0 },
          visible: true,
        },
      ]
    : []
  session.applyDocument({
    ...session.document,
    generationDraft,
    layers,
    primaryBbox: { x: 104, y: -42, width: 768, height: 512 },
  })
  await session.save(nonempty ? { assets: { [assetPath]: { bytes: opaqueRaster } } } : {})
  await openProjectUi()
  projectBaseline = await project()
  packageBytes = readFileSync(packagePath)
  assert.equal(projectBaseline.dirty, false)
  assert.equal(projectBaseline.canUndo, false)
  assert.deepEqual(projectBaseline.generationDraft.seed, { policy: 'fixed', value: 0 })
  assert.deepEqual(projectBaseline.generationDraft.model, sourceReferences.model)
  assert.deepEqual(projectBaseline.generationDraft.positivePrompt, generationDraft.positivePrompt)
  assert.deepEqual(projectBaseline.generationDraft.negativePrompt, generationDraft.negativePrompt)
  assert.deepEqual(projectBaseline.generationDraft.loras, generationDraft.loras)
  assert.deepEqual(projectBaseline.generationDraft.sampling, generationDraft.sampling)
  assert.deepEqual(projectBaseline.generationDraft.dynamicPrompt, {
    maxPrompts: 3,
    seedBehavior: 'per-prompt',
  })
  assert.equal(projectBaseline.generationDraft.cfgRescale, 0)
  assert.equal(projectBaseline.generationDraft.vaePrecision, 'Auto')
}

try {
  await launch('save-current')
  await window
    .getByLabel('Workspace navigation', { exact: true })
    .getByRole('button', { name: 'New Project', exact: true })
    .click()
  const create = window.getByRole('dialog', { name: 'New Project', exact: true })
  await create.getByRole('textbox', { name: 'Project name', exact: true }).fill(projectTitle)
  await create.getByRole('button', { name: 'Create Project', exact: true }).click()
  await expect(create).toHaveCount(0)
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toBeVisible()
  const matches = (await api('projects', 'list')).filter((record) => record.title === projectTitle)
  assert.equal(matches.length, 1)
  projectId = matches[0].id
  await saveProjectUi()
  packagePath = (
    await database.db
      .selectFrom('project_index')
      .select('canonical_path')
      .where('local_project_key', '=', projectId)
      .executeTakeFirstOrThrow()
  ).canonical_path
  assert.ok(
    path.relative(fixtureRoot, packagePath) &&
      !path.relative(fixtureRoot, packagePath).startsWith('..'),
  )
  await closeProjectUi()
  await installClosedFixture()
  assert.deepEqual(await rows('presets'), [])
  check(
    'Real Home UI creates/saves/closes the Project; a closed production package fixture reopens with authored templates, exact missing resources, signed/disabled LoRAs, both sampling choices, advanced zero/Auto and seed 0',
  )

  const saveCurrent = projectView().getByRole('button', {
    name: 'Save Current as Preset',
    exact: true,
  })
  const liveSteps = projectView().getByLabel('Steps', { exact: true })
  const savedBaseline = projectBaseline
  await holdActualDraftReply(32)
  await liveSteps.fill('32')
  await expect
    .poll(async () =>
      application.evaluate(() => Boolean(globalThis.igsSaveCurrentDraftReplyProbe?.completed)),
    )
    .toBe(true)
  const heldReply = await application.evaluate(() => {
    const probe = globalThis.igsSaveCurrentDraftReplyProbe
    return { ok: probe.ok, args: probe.args }
  })
  assert.equal(heldReply.ok, true, 'Actual Main command must succeed before holding its reply')
  assert.equal(heldReply.args[0], projectId)
  assert.deepEqual(heldReply.args[1], { kind: 'sampling-steps', value: 32 })
  assert.equal((await project()).generationDraft.sampling.steps, 32)
  await expect(saveCurrent).toBeDisabled()
  await projectView().getByRole('group', { name: 'Save Current as Preset', exact: true }).hover()
  await expect(
    window.getByText(
      'Wait for the current settings to finish updating before saving them as a preset.',
      { exact: true },
    ),
  ).toBeVisible()
  assert.deepEqual(await rows('presets'), [])
  assert.equal(readFileSync(packagePath).equals(packageBytes), true)
  await releaseActualDraftReply()
  await expect(saveCurrent).toBeEnabled()
  projectBaseline = await project()
  assert.deepEqual(
    projectBaseline.generationDraft.positivePrompt,
    savedBaseline.generationDraft.positivePrompt,
  )
  assert.deepEqual(
    projectBaseline.generationDraft.negativePrompt,
    savedBaseline.generationDraft.negativePrompt,
  )
  await openSourceDraft()
  await manager()
    .locator('[data-preset-section="guidance"]')
    .getByText('Steps & CFG', { exact: true })
    .click()
  await expect(manager().getByLabel('Preset steps', { exact: true })).toHaveValue('32')
  await cancelDraft()
  await liveSteps.fill('31')
  await liveSteps.press('Tab')
  await expect(saveCurrent).toBeEnabled()
  await closeProjectUi(true)
  await openProjectUi()
  projectBaseline = await project()
  assert.deepEqual(projectBaseline.generationDraft, savedBaseline.generationDraft)
  assert.equal(projectBaseline.dirty, false)
  assert.equal(projectBaseline.canUndo, false)
  await assertProjectUnchanged()
  check(
    'Save Current refuses a real UI draft awaiting its actual Main reply, explains the pending state, and becomes available after the unchanged reply arrives; source text/sidecars survive and actual discard/reopen restores the saved fixture and history',
    { heldDraftChange: heldReply.args[1] },
  )
  await liveSteps.fill('-')
  await expect(saveCurrent).toBeDisabled()
  await projectView().getByRole('group', { name: 'Save Current as Preset', exact: true }).hover()
  await expect(
    window.getByText('Correct invalid generation settings before saving them as a preset.', {
      exact: true,
    }),
  ).toBeVisible()
  await liveSteps.fill('31')
  await liveSteps.press('Tab')
  await expect(saveCurrent).toBeEnabled()
  await assertProjectUnchanged()
  const liveSeed = projectView().getByLabel('Generation seed', { exact: true })
  // An empty fixed-seed input is reachable through Naive's numeric filtering.
  await liveSeed.fill('')
  await expect(liveSeed).toHaveValue('')
  await expect(
    projectView().getByRole('button', { name: 'Save Project', exact: true }),
  ).toBeDisabled()
  assert.deepEqual((await project()).generationDraft.seed, { policy: 'fixed', value: 0 })
  await expect(saveCurrent).toBeEnabled()
  await openSourceDraft(true)
  assert.deepEqual(await rows('presets'), [])
  await cancelDraft()
  await liveSeed.fill('0')
  await liveSeed.press('Tab')
  await expect(liveSeed).toHaveValue('0')
  await assertProjectUnchanged()
  check(
    'A reusable Steps raw error disables Save Current with its actual reason; an excluded empty fixed Seed draft disables Project Save but leaves Save Current available and its transient capture omits Seed without writing the Project',
  )

  const countBefore = await rows('presets')
  await openSourceDraft()
  await expect(manager().getByLabel('Preset workflow', { exact: true })).toContainText(
    'Text to Image',
  )
  await expect(sourceBanner()).toContainText('768')
  await expect(sourceBanner()).toContainText('512')
  await expect(
    manager().getByText(/Unavailable or incompatible resources remain saved/),
  ).toBeVisible()
  assert.deepEqual(await rows('presets'), countBefore)
  const allNavigation = manager().getByRole('button', { name: /^All Presets/ })
  assert.equal((await allNavigation.innerText()).replace(/\s/g, ''), 'AllPresets0')
  for (const label of [
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
  ])
    await expect(
      manager().getByRole('checkbox', { name: `Include ${label}`, exact: true }),
    ).toBeChecked()
  await screenshot('source-draft', 1380, 900)
  await screenshot('source-draft', 900, 680)
  await cancelDraft()
  assert.deepEqual(await rows('presets'), countBefore)
  check(
    'Source capture is a counted-out transient pinned draft with context, reusable sections and Seed excluded; empty Canvas is safely Text to Image and Cancel writes nothing',
  )

  await openSourceDraft()
  await nameInput().fill('Discarded source draft')
  await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await expect(guard()).toBeVisible()
  await guard().getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(nameInput()).toHaveValue('Discarded source draft')
  await expect(sourceBanner()).toContainText(projectTitle)
  await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await guard().getByRole('button', { name: 'Discard Draft', exact: true }).click()
  await expect(manager()).toHaveCount(0)
  assert.deepEqual(await rows('presets'), countBefore)
  await assertProjectUnchanged()
  check(
    'Source draft Close uses Cancel/Discard guards while retaining context and never creates a catalog ID or changes Project state',
  )

  await openSourceDraft()
  await manager()
    .getByRole('textbox', { name: 'Preset description', exact: true })
    .fill('Edited before source preset creation')
  await manager().getByRole('switch', { name: 'Favorite preset', exact: true }).click()
  await promptEditor().fill(`${sourcePrompt}, extra reusable style`)
  await manager().getByRole('checkbox', { name: 'Include Steps & CFG', exact: true }).uncheck()
  assert.deepEqual(await rows('presets'), countBefore)
  created = await createDraft('Created source recipe')
  const expected = expectedPayload()
  delete expected.guidance
  expected.prompt = { ...expected.prompt, text: `${sourcePrompt}, extra reusable style` }
  assert.deepEqual(created.payload, expected)
  assert.equal(created.workflow, 'textToImage')
  assert.equal(created.favorite, true)
  assert.equal(created.description, 'Edited before source preset creation')
  assertNoSourceLink(created)
  await expect(sourceBanner()).toHaveCount(0)
  await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await expect(manager()).toHaveCount(0)
  check(
    'Create stores editable metadata, prompt/embedding sidecars and explicit inclusion without changing source; payload excludes seed, batch policy, bbox position and Project/layer identity',
  )

  await openSourceDraft()
  await nameInput().fill('Retryable captured recipe')
  const beforeFailure = await rows('presets')
  await sql`CREATE TRIGGER preset_save_current_owned_failure BEFORE INSERT ON presets BEGIN SELECT RAISE(ABORT, 'Owned Save Current failure'); END`.execute(
    database.db,
  )
  triggerInstalled = true
  await footer().getByRole('button', { name: 'Create Preset', exact: true }).click()
  await expect(
    manager().getByRole('alert', { name: 'Preset action failed', exact: true }),
  ).toContainText('PRESET_STORAGE_FAILED')
  await expect(nameInput()).toHaveValue('Retryable captured recipe')
  await expect(sourceBanner()).toContainText(projectTitle)
  await expectPrompt(promptEditor(), sourcePrompt)
  assert.deepEqual(await rows('presets'), beforeFailure)
  await assertProjectUnchanged()
  await removeFailureTrigger()
  retried = await createDraft('Retryable captured recipe')
  assert.deepEqual(retried.payload, expectedPayload())
  assertNoSourceLink(retried)
  await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await expect(manager()).toHaveCount(0)
  check(
    'Actual SQLite INSERT failure retains the same captured draft/context and writes no partial row; retry creates exact complete reusable fields with missing references intact',
  )

  await closeProjectUi()
  await installClosedFixture(true, true)
  const beforeUnknown = await rows('presets')
  await openSourceDraft()
  await expect(manager().getByLabel('Preset workflow', { exact: true })).toContainText(
    'Choose a workflow',
  )
  await expect(
    manager().getByText('Choose a workflow before creating this preset.', { exact: true }).first(),
  ).toBeVisible()
  await expect(footer().getByRole('button', { name: 'Create Preset', exact: true })).toBeDisabled()
  await chooseWorkflow('Image to Image')
  await expect(footer().getByRole('button', { name: 'Create Preset', exact: true })).toBeDisabled()
  await manager()
    .locator('[data-preset-section="guidance"]')
    .getByText('Steps & CFG', { exact: true })
    .click()
  const sourceSteps = manager().getByLabel('Preset steps', { exact: true })
  await expect(sourceSteps).toHaveValue('')
  await sourceSteps.fill('27')
  await sourceSteps.press('Tab')
  await expect(footer().getByRole('button', { name: 'Create Preset', exact: true })).toBeEnabled()
  assert.deepEqual(await rows('presets'), beforeUnknown)
  incompleteCreated = await createDraft('Explicit unknown-mode recipe')
  const expectedUnknown = expectedPayload()
  expectedUnknown.guidance.steps = 27
  expectedUnknown.denoisingStrength = 0.45
  assert.deepEqual(incompleteCreated.payload, expectedUnknown)
  assert.equal(incompleteCreated.workflow, 'imageToImage')
  assertNoSourceLink(incompleteCreated)
  await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await expect(manager()).toHaveCount(0)
  await assertProjectUnchanged()
  check(
    'Without a worker, visible nonempty Canvas requires explicit workflow; incomplete captured steps remain visible and must be repaired or excluded before actual Create',
  )

  const beforeRestart = await rows('presets')
  await closeNative('save-current')
  await launch('restart')
  assert.deepEqual(await rows('presets'), beforeRestart)
  await openProjectUi()
  projectBaseline = await project()
  packageBytes = readFileSync(packagePath)
  await projectView().getByRole('button', { name: 'Manage Presets', exact: true }).click()
  await expect(manager()).toBeVisible()
  for (const record of [created, retried, incompleteCreated]) {
    await manager()
      .getByRole('button', { name: `Select preset ${record.name}`, exact: true })
      .click()
    await expect(nameInput()).toHaveValue(record.name)
    assert.deepEqual(await api('presets', 'get', record.id), record)
    assertNoSourceLink(record)
  }
  await expect(sourceBanner()).toHaveCount(0)
  await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await expect(manager()).toHaveCount(0)
  await assertProjectUnchanged()
  await closeNative('restart')
  assert.equal(report.nativeClosures.length, 2)
  assert.deepEqual(report.pageErrors, [])
  check(
    'Physical native restart restores only explicitly created source presets, with no transient source banner/link and no change to the Project package',
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
      const snapshot = await window.locator('body').ariaSnapshot({ timeout: 5_000 })
      writeFileSync(snapshotFile, snapshot)
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
