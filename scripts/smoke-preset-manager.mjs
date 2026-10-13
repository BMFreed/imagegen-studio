/** Built Electron Preset Manager UI qualification. No Apply, worker or ML claim. */
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

const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'native-preset-manager-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
mkdirSync(appDataRoot, { recursive: true, mode: 0o700 })
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashFiles = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const report = {
  outcome: 'running',
  fixtureRoot,
  payloads: [fixtureRoot],
  checks: [],
  screenshots: [],
  pageErrors: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  sourceSha256: hashFiles([
    'scripts/smoke-preset-manager.mjs',
    'scripts/native-smoke-window.mjs',
    'scripts/qualification-resource-limits.mjs',
    'src/renderer/components/PresetManager.vue',
    'src/renderer/components/PresetPayloadEditor.vue',
    'src/renderer/components/PresetNumberInput.vue',
    'src/renderer/components/ResolutionControl.vue',
    'src/renderer/components/preset-manager-session.ts',
    'src/renderer/components/preset-editor.ts',
    'src/renderer/App.vue',
    'src/renderer/components/AppChrome.vue',
    'src/renderer/components/HomeView.vue',
    'src/renderer/components/ProjectView.vue',
    'src/main/index.ts',
    'src/preload/index.ts',
    'src/shared/api.ts',
    'src/shared/window-close.ts',
    'src/shared/presets/preset-schema.ts',
    'src/main/presets/preset-repository.ts',
    'src/main/presets/preset-service.ts',
    'src/main/presets/preset-ipc.ts',
    'src/main/db/migrations/0017_presets.sql',
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
      'Built Home/Project/menu entrypoints → Preset Manager controls, keyboard routing and unsaved-navigation guards → real preload/Main API → SQLite create/edit/duplicate/soft-delete/restore. Genuine native BrowserWindow.close with zero open Project tabs, actual physical Electron restart, saved .igs bytes, Project history, fixed/operational seed 0 and neighboring model/database records.',
    fixtures:
      'One actual Project created/saved through IPC, a document-scoped lastActualSeed cursor of 0 inserted as an explicitly synthetic neighboring fixture, twenty literal-prompt presets for list overflow and one deliberately unavailable exact-resource preset. A temporary trigger refuses only the owned preset INSERT to prove real write failure preserves a retryable UI draft. A native error-box observation spy is attached only after the actual close guard appears; it records zero calls and avoids blocking if cancellation regresses. No model files, worker, inference or download.',
    limits:
      'Existing owned process/cgroup helper applies a 2 GiB native cap, zero swap and a finite 300-second deadline. The launching actor must already have bounded aggregate RAM and zero swap.',
    notQualified:
      'Preset Apply/result-to-preset/resource picker completeness, trained inference, arbitrary storage corruption, migration from an older release and distribution packaging remain outside this finite UI slice. Cross-restart history is intentionally not compared because undo/redo is session-local; its preservation is checked before actual exit.',
    cleanup:
      'Payload is retained under the owned run root for root-controlled cleanup after actual process exit. Failure cleanup cancels any pending native close before explicitly discarding the owned UI draft, restores the observation spy and drops the temporary trigger before the owned database closes. No external application data is modified or removed.',
  },
}
let application
let window
let nativeChecks = []
let database
let projectId
const projectTitle = 'Preset Manager neighboring Project'
let packagePath
let packageBytes
let durableNeighbors
let triggerInstalled = false
let createdId
let duplicateId
let missingId
let errorBoxSpyInstalled = false

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
  await window.waitForFunction(() => typeof window.api?.presets?.list === 'function')
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  await api('projects', 'list')
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
}
async function removeFailureTrigger() {
  if (!triggerInstalled || !database) return
  await sql`DROP TRIGGER IF EXISTS preset_manager_owned_failure`.execute(database.db)
  triggerInstalled = false
  assert.equal(
    (
      await sql`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'preset_manager_owned_failure'`.execute(
        database.db,
      )
    ).rows.length,
    0,
  )
}
async function removeErrorBoxSpy() {
  if (!errorBoxSpyInstalled || !application) return
  await application.evaluate(({ dialog }) => {
    const spy = globalThis.__igsPresetManagerErrorBoxSpy
    if (spy) dialog.showErrorBox = spy.original
    delete globalThis.__igsPresetManagerErrorBoxSpy
  })
  errorBoxSpyInstalled = false
}
async function discardOwnedManagerForCleanup() {
  if (!window || window.isClosed()) return
  if (await guard().isVisible()) {
    // Cancel any in-flight native Close first; Discard there would exit before the owned
    // process guard can capture the normal cleanup/closure evidence.
    await guard().getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(guard()).toHaveCount(0)
  }
  if (await modal().isVisible()) {
    await closeButton().click()
    if (await guard().isVisible()) {
      await guard()
        .getByRole('button', { name: /^(Discard Draft|Discard)$/ })
        .click()
    }
    await expect(modal()).toHaveCount(0)
  }
}
async function closeNative(label) {
  if (!application) return
  await discardOwnedManagerForCleanup()
  await removeErrorBoxSpy()
  await removeFailureTrigger()
  if (database) {
    await database.close()
    database = null
  }
  await limitCheck(`${label}-before-close`)
  await application.close()
  const closure = await confirmQualificationProcessExit(nativeChecks)
  report.nativeClosures.push({ label, ...closure })
  application = null
  window = null
  writeReport()
}
async function api(scope, method, ...args) {
  const result = await window.evaluate(
    ({ scope, method, args }) => window.api[scope][method](...args),
    { scope, method, args },
  )
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function rows(durable = false) {
  const tables = (
    await sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'presets' ORDER BY name`.execute(
      database.db,
    )
  ).rows
  const result = {}
  for (const { name } of tables) {
    if (durable && ['project_index', 'project_accepted_result_index'].includes(name)) continue
    const entries = await database.db.selectFrom(name).selectAll().execute()
    result[name] = entries.sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    )
  }
  return result
}
async function neighboringState() {
  return {
    database: await rows(),
    project: (await api('projects', 'open', projectId)).tab,
    results: await api('projects', 'listGenerationResults', projectId),
  }
}
async function unchangedNeighbors(before) {
  assert.deepEqual(await neighboringState(), before)
  assert.equal(
    readFileSync(packagePath).equals(packageBytes),
    true,
    'Preset Manager changed saved .igs bytes',
  )
}
async function operation(run) {
  const before = await neighboringState()
  const value = await run()
  await unchangedNeighbors(before)
  return value
}
const modal = () => window.getByRole('dialog', { name: 'Preset Manager', exact: true })
const guard = () => window.getByRole('dialog', { name: 'Unsaved preset changes', exact: true })
const footer = () => modal().locator('.editor-actions')
const nameField = () => modal().getByRole('textbox', { name: 'Preset name', exact: true })
const descriptionField = () =>
  modal().getByRole('textbox', { name: 'Preset description', exact: true })
const promptField = () => modal().getByRole('textbox', { name: 'Preset prompt', exact: true })
const closeButton = () => modal().getByRole('button', { name: 'Close Preset Manager', exact: true })
const row = (name) => modal().getByRole('button', { name: `Select preset ${name}`, exact: true })
const activeRecord = async (id) => api('presets', 'get', id)

async function assertStoredRecord(record) {
  const stored = await database.db
    .selectFrom('presets')
    .selectAll()
    .where('id', '=', record.id)
    .executeTakeFirstOrThrow()
  assert.equal(stored.name, record.name)
  assert.equal(stored.description ?? '', record.description)
  assert.equal(stored.favorite, record.favorite ? 1 : 0)
  assert.equal(
    stored.workflow_type,
    {
      textToImage: 'txt2img',
      imageToImage: 'img2img',
      smartPatch: 'inpaint',
    }[record.workflow],
  )
  assert.deepEqual(JSON.parse(stored.payload_json), record.payload)
  assert.deepEqual(JSON.parse(stored.tags_json), record.tags)
  assert.equal(stored.deleted_at, record.deletedAt)
  assert.equal(stored.updated_at, record.updatedAt)
}

function definition(record) {
  const { description, favorite, name, payload, tags, workflow } = record
  return { description, favorite, name, payload, tags, workflow }
}
function missingRef(kind, letter) {
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: null,
    civitaiModelId: null,
    civitaiVersionId: null,
    displayName: `Unavailable ${kind}`,
    fileSha256: letter.repeat(64),
    kind,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: kind === 'checkpoint' ? 'epsilon' : null,
    versionName: 'Exact absent version',
  }
}
function literalDefinition(name) {
  return {
    description: '',
    favorite: false,
    name,
    payload: { prompt: { text: 'literal fixture', embeddingRefs: [] } },
    tags: [],
    workflow: 'textToImage',
  }
}
async function openManagerFromHome() {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Manage Presets', exact: true }).click()
  await expect(modal()).toBeVisible()
}
async function newDraft(name, prompt) {
  await modal().getByRole('button', { name: 'New Preset', exact: true }).click()
  await expect(modal().getByRole('article', { name: 'Preset draft', exact: true })).toBeVisible()
  await nameField().fill(name)
  await expect(nameField()).toHaveValue(name)
  await promptField().fill(prompt)
  await expect(nameField()).toHaveValue(name)
  await expect(modal().getByRole('article', { name: 'Preset draft', exact: true })).toContainText(
    name,
  )
}
async function chooseWorkflow(label) {
  await modal().getByLabel('Preset workflow', { exact: true }).click()
  // This is the existing NSelect menu surface used by the approved prototype tests.
  await window
    .locator('.n-base-select-option')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click()
}
async function saveNewDraft(name) {
  await footer().getByRole('button', { name: 'Create Preset', exact: true }).click()
  await expect(row(name)).toBeVisible()
  const matches = (await api('presets', 'list')).filter((record) => record.name === name)
  assert.equal(matches.length, 1)
  return matches[0]
}
async function screenshot(label, width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) =>
      BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
    { width, height },
  )
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
  await expect(modal()).toBeVisible()
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
  const geometry = await modal().evaluate((element) => {
    const rect = (target) => {
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
    const actions = element.querySelector('.editor-actions')
    assertDom(actions, 'Missing editor footer')
    const dimensions = {
      modal: rect(element),
      footer: rect(actions),
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
      primaryButtons: [...element.querySelectorAll('button.n-button--primary-type')].map(
        (button) => ({ text: button.textContent.trim(), rect: rect(button) }),
      ),
      scrollRegions: [...element.querySelectorAll('.n-scrollbar-container')].map((region) => ({
        rect: rect(region),
        clientHeight: region.clientHeight,
        scrollHeight: region.scrollHeight,
      })),
      list: rect(element.querySelector('[aria-label="Preset list"]')),
      editor: rect(element.querySelector('[aria-label="Preset editor"]')),
      listScroll: rect(element.querySelector('.preset-scroll .n-scrollbar-container')),
      editorScroll: rect(element.querySelector('.editor-scroll .n-scrollbar-container')),
      listBottomPadding:
        Number.parseFloat(
          getComputedStyle(element.querySelector('[aria-label="Preset list"]')).paddingBottom,
        ) || 0,
      listOverflow: {
        clientHeight: element.querySelector('.preset-scroll .n-scrollbar-container').clientHeight,
        scrollHeight: element.querySelector('.preset-scroll .n-scrollbar-container').scrollHeight,
      },
    }
    function assertDom(value, message) {
      if (!value) throw new Error(message)
    }
    return dimensions
  })
  assert.ok(geometry.modal.x >= -1 && geometry.modal.y >= -1)
  assert.deepEqual(geometry.viewport, { width, height })
  assert.equal(geometry.documentOverflow, false)
  assert.ok(geometry.modal.right <= width + 1 && geometry.modal.bottom <= height + 1)
  assert.ok(geometry.footer.width > 0 && geometry.footer.height > 0)
  assert.ok(geometry.footer.bottom <= geometry.modal.bottom + 1)
  assert.ok(geometry.footer.y >= geometry.modal.y)
  assert.ok(geometry.editor.right <= geometry.modal.right + 1, 'Editor extends outside modal')
  assert.ok(geometry.footer.right <= geometry.modal.right + 1, 'Footer extends outside modal')
  assert.ok(
    Math.abs(geometry.editorScroll.bottom - geometry.footer.y) <= 3,
    'Editor scroll area leaves unused space above its fixed footer',
  )
  assert.ok(
    Math.abs(geometry.listScroll.bottom - geometry.list.bottom) <= 3 + geometry.listBottomPadding,
    'Preset list scroll area does not reach its containing panel bottom',
  )
  assert.ok(geometry.primaryButtons.length <= 1, 'Competing primary actions in Preset Manager')
  for (const button of geometry.primaryButtons) {
    assert.ok(button.rect.x >= geometry.modal.x - 1)
    assert.ok(button.rect.right <= geometry.modal.right + 1)
    assert.ok(button.rect.width < geometry.modal.width / 2, 'An action stretches across the editor')
  }
  const file = path.join(evidenceRoot, `${label}.png`)
  await modal().screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push({ label, path: file, width, height, geometry })
  writeReport()
  return geometry
}

try {
  await launch('ui-crud')
  const project = await api('projects', 'create', {
    title: projectTitle,
    width: 640,
    height: 512,
  })
  projectId = project.id
  await api('projects', 'updateGenerationDraft', projectId, {
    kind: 'seed',
    policy: 'fixed',
    value: 0,
  })
  await api('projects', 'updateGenerationDraft', projectId, {
    kind: 'positive-prompt',
    text: 'Independent actual Project prompt',
  })
  await api('projects', 'sealPromptHistory', projectId)
  const saved = await api('projects', 'save', projectId)
  assert.equal(saved.committed, true)
  assert.equal(saved.tab.dirty, false)
  assert.equal(saved.tab.canUndo, true, 'Neighbor needs real history for its preservation control')
  const indexed = await database.db
    .selectFrom('project_index')
    .select('canonical_path')
    .where('local_project_key', '=', projectId)
    .executeTakeFirstOrThrow()
  packagePath = indexed.canonical_path
  const relativePackage = path.relative(fixtureRoot, packagePath)
  assert.ok(
    relativePackage && !relativePackage.startsWith('..') && !path.isAbsolute(relativePackage),
  )
  packageBytes = readFileSync(packagePath)
  assert.equal((await readIgsPackage(packagePath)).project.documentId, project.documentId)
  await database.db
    .insertInto('generation_seed_cursor')
    .values({
      actual_seed: 0,
      candidate_id: randomUUID(),
      completion_order: 1,
      document_id: project.documentId,
      local_project_key: projectId,
      updated_at: new Date().toISOString(),
    })
    .execute()
  assert.equal((await api('projects', 'listGenerationResults', projectId)).lastActualSeed, 0)
  assert.deepEqual(await api('models', 'getCatalog'), [])
  await api('projects', 'close', projectId, true)
  await expect(window.getByRole('tab')).toHaveCount(1)
  await window.getByRole('button', { name: 'Project menu', exact: true }).click()
  await window.getByText('Presets', { exact: true }).click()
  await expect(modal()).toBeVisible()
  await newDraft('Native Home close guarded draft', 'Unsaved draft with no Project tab')
  const beforeNativeClose = { database: await rows(), presets: await api('presets', 'list') }
  const nativeWindowId = await application.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length !== 1) throw new Error('Expected the single owned native window')
    const nativeWindow = windows[0]
    nativeWindow.close()
    return nativeWindow.id
  })
  await expect(guard()).toBeVisible()
  // Observe the real Main cancellation path after its actual UI guard has been reached.
  // Prevent a regression from displaying a blocking system error box during qualification.
  await application.evaluate(({ dialog }) => {
    if (globalThis.__igsPresetManagerErrorBoxSpy) throw new Error('Error-box spy already exists')
    globalThis.__igsPresetManagerErrorBoxSpy = { original: dialog.showErrorBox, calls: [] }
    dialog.showErrorBox = (title, content) => {
      globalThis.__igsPresetManagerErrorBoxSpy.calls.push({ title, content })
    }
  })
  errorBoxSpyInstalled = true
  // A Main timer provides an independent heartbeat past the old ten-second watchdog.
  const decisionWait = await application.evaluate(
    () =>
      new Promise((resolve) => {
        const started = performance.now()
        setTimeout(
          () =>
            resolve({
              elapsedMs: performance.now() - started,
              errorBoxes: globalThis.__igsPresetManagerErrorBoxSpy.calls,
            }),
          11_000,
        )
      }),
  )
  assert.ok(decisionWait.elapsedMs >= 10_000)
  assert.deepEqual(decisionWait.errorBoxes, [])
  await expect(guard()).toBeVisible()
  await guard().getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(guard()).toHaveCount(0)
  await expect(modal()).toBeVisible()
  await expect(nameField()).toHaveValue('Native Home close guarded draft')
  await expect(promptField()).toHaveText('Unsaved draft with no Project tab')
  assert.deepEqual(await api('presets', 'list'), beforeNativeClose.presets)
  assert.deepEqual(await rows(), beforeNativeClose.database)
  assert.equal(readFileSync(packagePath).equals(packageBytes), true)
  const nativeCancel = await application.evaluate(({ BrowserWindow }) => ({
    windows: BrowserWindow.getAllWindows().map((value) => ({
      id: value.id,
      destroyed: value.isDestroyed(),
    })),
    errorBoxes: globalThis.__igsPresetManagerErrorBoxSpy.calls,
  }))
  assert.deepEqual(nativeCancel.windows, [{ id: nativeWindowId, destroyed: false }])
  assert.deepEqual(nativeCancel.errorBoxes, [])
  await expect(window.getByRole('tab')).toHaveCount(1)
  await removeErrorBoxSpy()
  await closeButton().click()
  await expect(guard()).toBeVisible()
  await guard().getByRole('button', { name: 'Discard Draft', exact: true }).click()
  await expect(modal()).toHaveCount(0)
  check(
    'Project menu opens Presets on Home; actual native-window Close with zero Project tabs permits human decision beyond the flush watchdog, and Cancel retains the window/draft without a system error box or storage write',
    { ...nativeCancel, decisionWait },
  )

  const reopenedNeighbor = await api('projects', 'open', projectId)
  assert.equal(reopenedNeighbor.kind, 'opened')
  await api('projects', 'updateGenerationDraft', projectId, {
    kind: 'positive-prompt',
    text: 'Independent actual Project prompt with real history control',
  })
  await api('projects', 'sealPromptHistory', projectId)
  const reSaved = await api('projects', 'save', projectId)
  assert.equal(reSaved.tab.canUndo, true)
  assert.equal(reSaved.tab.dirty, false)
  packageBytes = readFileSync(packagePath)
  for (let index = 0; index < 20; index += 1) {
    await operation(() => api('presets', 'create', literalDefinition(`List fixture ${index + 1}`)))
  }
  const missingDefinition = {
    ...literalDefinition('Missing exact resources'),
    payload: {
      model: missingRef('checkpoint', 'a'),
      prompt: {
        text: 'literal <missing-vector>',
        embeddingRefs: [{ token: '<missing-vector>', resource: missingRef('embedding', 'b') }],
      },
      loras: [{ enabled: true, resource: missingRef('lora', 'c'), weight: -0.4 }],
      seed: { policy: 'fixed', value: 0 },
      vae: null,
    },
  }
  const missing = await operation(() => api('presets', 'create', missingDefinition))
  missingId = missing.id
  await operation(openManagerFromHome)
  check('Home opens the actual native manager with real SQLite records and no installed runtime')

  await operation(async () => {
    await newDraft('Manual UI preset', '(soft light:1.2), {red|blue}\nliteral 日本語')
    await descriptionField().fill('Saved through production UI')
    await chooseWorkflow('Image to Image')
    await modal().getByRole('checkbox', { name: 'Include Denoising Strength', exact: true }).check()
    const record = await saveNewDraft('Manual UI preset')
    createdId = record.id
    assert.equal(record.description, 'Saved through production UI')
    assert.equal(record.workflow, 'imageToImage')
    assert.equal(record.payload.denoisingStrength, 0.75)
    assert.deepEqual(record.payload.prompt, {
      text: '(soft light:1.2), {red|blue}\nliteral 日本語',
      embeddingRefs: [],
    })
    await assertStoredRecord(record)
    await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
    await expect(footer().locator('.save-state')).toHaveText('Saved')
  })
  check(
    'UI Create writes the literal prompt, metadata and selected workflow/Included field and transitions from pinned draft to saved record',
  )

  await operation(async () => {
    const before = await activeRecord(createdId)
    await descriptionField().fill('Detached edit must not mutate storage before Save')
    await chooseWorkflow('Text to Image')
    await expect(
      modal().getByRole('checkbox', { name: 'Include Denoising Strength', exact: true }),
    ).toHaveCount(0)
    assert.deepEqual(await activeRecord(createdId), before)
    await footer().getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
    await expect(footer().locator('.save-state')).toHaveText('Saved')
    assert.equal(
      (await activeRecord(createdId)).description,
      'Detached edit must not mutate storage before Save',
    )
    assert.equal((await activeRecord(createdId)).workflow, 'textToImage')
    assert.equal((await activeRecord(createdId)).payload.denoisingStrength, undefined)
  })
  check(
    'Metadata/workflow edits remain detached until Save; Text to Image removes the strength section from its stored payload',
  )

  await operation(async () => {
    await modal().getByRole('checkbox', { name: 'Include Steps & CFG', exact: true }).check()
    await footer().getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
    await expect(footer().locator('.save-state')).toHaveText('Saved')
    const storedBeforeRawInput = await activeRecord(createdId)
    assert.deepEqual(storedBeforeRawInput.payload.guidance, { steps: 30, cfgScale: 7 })
    await nameField().fill('Raw invalid draft name')
    const steps = modal().getByLabel('Preset steps', { exact: true })
    await steps.fill('-')
    await expect(steps).toHaveValue('-')
    await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
    await window.keyboard.press('Control+s')
    assert.deepEqual(await activeRecord(createdId), storedBeforeRawInput)
    await closeButton().click()
    await expect(guard()).toBeVisible()
    await expect(guard().getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
    await guard().getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(steps).toHaveValue('-')
    await expect(nameField()).toHaveValue('Raw invalid draft name')
    await steps.fill('31')
    await steps.press('Tab')
    await nameField().fill('Manual UI preset')
    await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeEnabled()
    await footer().getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
    await expect(footer().locator('.save-state')).toHaveText('Saved')
    assert.deepEqual((await activeRecord(createdId)).payload.guidance, { steps: 31, cfgScale: 7 })
    await modal().getByRole('checkbox', { name: 'Include Steps & CFG', exact: true }).uncheck()
    await footer().getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
    await expect(footer().locator('.save-state')).toHaveText('Saved')
    assert.equal((await activeRecord(createdId)).payload.guidance, undefined)
  })
  check(
    'A real numeric raw draft "-" blocks footer, Ctrl+S and guard Save without writing the old model value; guard Cancel retains it and correcting the field permits canonical Save',
  )

  await operation(async () => {
    const includeSize = modal().getByRole('checkbox', { name: 'Include Size', exact: true })
    await includeSize.check()
    await footer().getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(footer().locator('.save-state')).toHaveText('Saved')
    const before = await activeRecord(createdId)
    assert.deepEqual(before.payload.size, { width: 1024, height: 1024 })
    const width = modal().getByLabel('Preset width', { exact: true })
    await width.fill('-')
    await expect(width).toHaveValue('-')
    await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
    await window.keyboard.press('Control+s')
    await expect(width).toHaveValue('-')
    assert.deepEqual(await activeRecord(createdId), before)
    await width.fill('1152')
    await width.press('Tab')
    await footer().getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(footer().locator('.save-state')).toHaveText('Saved')
    assert.deepEqual((await activeRecord(createdId)).payload.size, { width: 1152, height: 1024 })
    await includeSize.uncheck()
    await footer().getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(footer().locator('.save-state')).toHaveText('Saved')
    assert.equal((await activeRecord(createdId)).payload.size, undefined)
  })
  check(
    'The shared resolution control preserves invalid raw width on Ctrl+S and writes the corrected dimensions only after explicit Save',
  )

  await operation(async () => {
    await descriptionField().fill('Guarded unsaved content')
    await closeButton().click()
    await expect(guard()).toBeVisible()
    await guard().getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(guard()).toHaveCount(0)
    await expect(descriptionField()).toHaveValue('Guarded unsaved content')
    await window.keyboard.press('Escape')
    await expect(guard()).toBeVisible()
    await guard().getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(descriptionField()).toHaveValue('Guarded unsaved content')
    await row('List fixture 1').click()
    await expect(guard()).toBeVisible()
    await guard().getByRole('button', { name: 'Discard', exact: true }).click()
    await expect(nameField()).toHaveValue('List fixture 1')
    await row('Manual UI preset').click()
    await expect(descriptionField()).toHaveValue(
      'Detached edit must not mutate storage before Save',
    )
  })
  check(
    'Close, Escape and row navigation use the same guard; Cancel keeps the draft and Discard leaves storage untouched',
  )

  await operation(async () => {
    await descriptionField().fill('Committed by the real navigation guard')
    await closeButton().click()
    await expect(guard()).toBeVisible()
    await guard().getByRole('button', { name: 'Save', exact: true }).click()
    await expect(modal()).toHaveCount(0)
    assert.equal(
      (await activeRecord(createdId)).description,
      'Committed by the real navigation guard',
    )
    await openManagerFromHome()
    await row('Manual UI preset').click()
    await expect(descriptionField()).toHaveValue('Committed by the real navigation guard')
    await descriptionField().fill('Detached edit must not mutate storage before Save')
    await footer().getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
    await expect(footer().locator('.save-state')).toHaveText('Saved')
  })
  check(
    'The real navigation guard commits Save before closing and reopening reads that stored definition',
  )

  await operation(async () => {
    await footer().getByRole('button', { name: 'Duplicate', exact: true }).click()
    await expect(row('Manual UI preset (copy)')).toBeVisible()
    const duplicates = (await api('presets', 'list')).filter(
      (record) => record.name === 'Manual UI preset (copy)',
    )
    assert.equal(duplicates.length, 1)
    duplicateId = duplicates[0].id
    assert.notEqual(duplicateId, createdId)
    assert.deepEqual(definition(duplicates[0]), {
      ...definition(await activeRecord(createdId)),
      name: 'Manual UI preset (copy)',
    })
    await footer().getByRole('button', { name: 'Delete', exact: true }).click()
    const deleteDialog = window.getByRole('dialog', { name: 'Delete preset', exact: true })
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(row('Manual UI preset (copy)')).toHaveCount(0)
    assert.equal(await activeRecord(duplicateId), null)
    const deleted = await api('presets', 'get', duplicateId, { includeDeleted: true })
    assert.ok(deleted.deletedAt)
    assert.equal(
      Date.parse(deleted.expiresAt) - Date.parse(deleted.deletedAt),
      30 * 24 * 60 * 60 * 1000,
    )
    await modal()
      .getByRole('button', { name: /^Deleted(?:\s|$)/ })
      .click()
    await row('Manual UI preset (copy)').click()
    await expect(
      modal()
        .locator('[aria-label="Preset editor"]')
        .getByText(/Recoverable until/),
    ).toBeVisible()
    await modal().getByRole('button', { name: 'Restore', exact: true }).click()
    const restored = await activeRecord(duplicateId)
    assert.equal(restored.id, duplicateId)
    assert.equal(restored.deletedAt, null)
    assert.equal(restored.expiresAt, null)
    await modal()
      .getByRole('button', { name: /^All Presets(?:\s|$)/ })
      .click()
    await row('Manual UI preset').click()
  })
  check(
    'Real UI Duplicate creates an independent identity and confirmed Delete/Deleted/Restore retains the payload and 30-day deadline',
  )

  await operation(async () => {
    await modal().getByRole('button', { name: 'New Preset', exact: true }).click()
    await expect(
      footer().getByRole('button', { name: 'Create Preset', exact: true }),
    ).toBeDisabled()
    await closeButton().click()
    await expect(guard()).toBeVisible()
    await expect(guard().getByRole('button', { name: 'Create Preset', exact: true })).toBeDisabled()
    await guard().getByRole('button', { name: 'Cancel', exact: true }).click()
    await nameField().fill('Invalid no-section draft')
    await modal().getByRole('checkbox', { name: 'Include Prompt', exact: true }).uncheck()
    await expect(
      footer().getByRole('button', { name: 'Create Preset', exact: true }),
    ).toBeDisabled()
    await closeButton().click()
    await expect(guard().getByRole('button', { name: 'Create Preset', exact: true })).toBeDisabled()
    await guard().getByRole('button', { name: 'Discard Draft', exact: true }).click()
    await expect(modal()).toHaveCount(0)
  })
  check(
    'Invalid manual drafts cannot be created through either the footer or the unsaved-navigation guard',
  )

  await operation(async () => {
    await openManagerFromHome()
    await newDraft('Pinned under filters', 'Unsaved filtered draft')
    await modal()
      .getByRole('textbox', { name: 'Search presets', exact: true })
      .fill('__no_saved_match__')
    await modal()
      .getByRole('button', { name: /^Smart Patch(?:\s|$)/ })
      .click()
    await expect(modal().getByRole('article', { name: 'Preset draft', exact: true })).toBeVisible()
    await expect(nameField()).toHaveValue('Pinned under filters')
    await expect(promptField()).toHaveText('Unsaved filtered draft')
    await expect(footer().getByRole('button', { name: 'Create Preset', exact: true })).toBeEnabled()
    await expect(row('Manual UI preset')).toHaveCount(0)
    await modal().getByRole('textbox', { name: 'Search presets', exact: true }).fill('')
    await modal()
      .getByRole('button', { name: /^All Presets(?:\s|$)/ })
      .click()
    await closeButton().click()
    await expect(guard()).toBeVisible()
    await guard().getByRole('button', { name: 'Create Preset', exact: true }).click()
    await expect(modal()).toHaveCount(0)
    const pinned = (await api('presets', 'list')).find(
      (record) => record.name === 'Pinned under filters',
    )
    assert.ok(pinned)
    assert.deepEqual(pinned.payload, {
      prompt: { text: 'Unsaved filtered draft', embeddingRefs: [] },
    })
    await assertStoredRecord(pinned)
  })
  check(
    'An unsaved pinned draft remains accessible under nonmatching search/workflow filters and its guard can persist Create before closing',
  )

  await operation(async () => {
    await openManagerFromHome()
    await newDraft('Failed write retained draft', 'Must survive the real SQLite failure')
    const before = await api('presets', 'list')
    await sql`CREATE TRIGGER preset_manager_owned_failure BEFORE INSERT ON presets BEGIN SELECT RAISE(ABORT, 'Owned UI qualification refusal'); END`.execute(
      database.db,
    )
    triggerInstalled = true
    await footer().getByRole('button', { name: 'Create Preset', exact: true }).click()
    await expect(
      modal().getByRole('alert', { name: 'Preset action failed', exact: true }),
    ).toContainText('PRESET_STORAGE_FAILED')
    await expect(footer().getByRole('button', { name: 'Create Preset', exact: true })).toBeEnabled()
    assert.deepEqual(await api('presets', 'list'), before)
    await expect(nameField()).toHaveValue('Failed write retained draft')
    await expect(promptField()).toHaveText('Must survive the real SQLite failure')
    await expect(modal().getByRole('article', { name: 'Preset draft', exact: true })).toBeVisible()
    await removeFailureTrigger()
    const retried = await saveNewDraft('Failed write retained draft')
    assert.equal(retried.payload.prompt.text, 'Must survive the real SQLite failure')
  })
  check(
    'An actual SQLite INSERT refusal leaves the exact draft retryable; removing only the owned trigger permits the same UI Create',
  )

  await operation(async () => {
    await row('Missing exact resources').click()
    await expect(
      modal().getByText(/Unavailable(?: or incompatible)? resources remain saved/),
    ).toBeVisible()
    const before = await activeRecord(missingId)
    await descriptionField().fill('Metadata edit retains absent resource snapshots')
    await footer().getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
    await expect(footer().locator('.save-state')).toHaveText('Saved')
    const after = await activeRecord(missingId)
    assert.deepEqual(after.payload, before.payload)
    assert.equal(after.description, 'Metadata edit retains absent resource snapshots')
  })
  check(
    'Unavailable exact resources show a warning and survive real metadata Save without substitution or reference loss',
  )

  await operation(async () => {
    await row('Manual UI preset').click()
    await screenshot('preset-manager-wide', 1380, 900)
    const compact = await screenshot('preset-manager-compact', 900, 680)
    assert.ok(
      compact.listOverflow.scrollHeight > compact.listOverflow.clientHeight + 1,
      'The fixture must exercise an actual overflowing preset list',
    )
    const last = modal()
      .locator('[aria-label="Preset list"]')
      .getByRole('button', { name: /^Select preset / })
      .last()
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeVisible()
    await expect(footer()).toBeVisible()
    await screenshot('preset-manager-list-bottom', 900, 680)
    for (const selector of [
      '.manager-body > .n-split__resize-trigger-wrapper',
      '.manager-content-split > .n-split__resize-trigger-wrapper',
    ]) {
      const separator = await modal().locator(selector).boundingBox()
      const frame = await modal().boundingBox()
      assert.ok(separator && frame)
      await window.mouse.move(separator.x + separator.width / 2, separator.y + 30)
      await window.mouse.down()
      await window.mouse.move(frame.x + frame.width - 5, separator.y + 30, { steps: 8 })
      await window.mouse.up()
    }
    const resized = await screenshot('preset-manager-compact-resized', 900, 680)
    assert.ok(resized.list.width >= 249)
    await expect(footer()).toBeVisible()
    await closeButton().click()
    await expect(modal()).toHaveCount(0)
  })
  check(
    'Wide and compact layouts keep the footer inside the modal, one primary action and the overflowing list end reachable',
  )

  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toBeVisible()
  await operation(async () => {
    await window.getByRole('tab', { name: projectTitle, exact: true }).click()
    await window.getByRole('button', { name: 'Manage Presets', exact: true }).click()
    await expect(modal()).toBeVisible()
    await expect(row('Manual UI preset')).toBeVisible()
    await row('Manual UI preset').click()
    await descriptionField().fill('Keyboard Save scoped to preset manager')
    await window.keyboard.press('Control+s')
    await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
    await expect(footer().locator('.save-state')).toHaveText('Saved')
    assert.equal(
      (await activeRecord(createdId)).description,
      'Keyboard Save scoped to preset manager',
    )
    await modal().getByRole('button', { name: 'Refresh presets', exact: true }).focus()
    await window.keyboard.press('Control+z')
    await window.keyboard.press('Control+Shift+z')
    await expect(modal()).toBeVisible()
    await expect(descriptionField()).toHaveValue('Keyboard Save scoped to preset manager')
    await descriptionField().fill('Detached edit must not mutate storage before Save')
    await window.keyboard.press('Control+s')
    await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
    await expect(footer().locator('.save-state')).toHaveText('Saved')
    await closeButton().click()
    await expect(modal()).toHaveCount(0)
  })
  check(
    'The actual Project entrypoint opens the same durable manager; Ctrl+S writes only its preset while Ctrl+Z/redo outside local text inputs leave Project draft/history/seed 0 untouched',
  )
  durableNeighbors = await rows(true)
  const activeBeforeRestart = await api('presets', 'list')
  await closeNative('ui-crud')

  await launch('ui-restart')
  assert.deepEqual(await rows(true), durableNeighbors)
  const reopened = await api('projects', 'open', projectId)
  assert.equal(reopened.kind, 'opened')
  assert.equal(reopened.tab.dirty, false)
  assert.deepEqual(reopened.tab.generationDraft.seed, { policy: 'fixed', value: 0 })
  assert.equal((await api('projects', 'listGenerationResults', projectId)).lastActualSeed, 0)
  assert.equal(readFileSync(packagePath).equals(packageBytes), true)
  assert.deepEqual(await api('presets', 'list'), activeBeforeRestart)
  for (const record of activeBeforeRestart) await assertStoredRecord(record)
  await operation(async () => {
    await openManagerFromHome()
    await row('Manual UI preset').click()
    await expect(nameField()).toHaveValue('Manual UI preset')
    await expect(descriptionField()).toHaveValue(
      'Detached edit must not mutate storage before Save',
    )
    await row('Failed write retained draft').click()
    await expect(promptField()).toHaveText('Must survive the real SQLite failure')
    await row('Missing exact resources').click()
    await expect(
      modal().getByText(/Unavailable(?: or incompatible)? resources remain saved/),
    ).toBeVisible()
    assert.deepEqual((await activeRecord(missingId)).payload, missingDefinition.payload)
    await screenshot('preset-manager-restarted', 1380, 900)
    await closeButton().click()
    await expect(modal()).toHaveCount(0)
  })
  check(
    'Physical Electron restart reopens UI-saved/duplicated/restored presets and absent exact refs while .igs bytes and document-scoped seed 0 remain intact',
    {
      projectId,
      packageSha256: digest(packageBytes),
      createdId,
      duplicateId,
      missingId,
    },
  )
  await closeNative('ui-restart')
  assert.equal(report.nativeClosures.length, 2)
  assert.deepEqual(report.pageErrors, [])
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'
  report.failure = { message: error.message, stack: error.stack }
  if (window && !window.isClosed()) {
    try {
      report.failure.ariaSnapshot = await window.locator('body').ariaSnapshot()
      const failureScreenshot = path.join(evidenceRoot, 'failure.png')
      await window.screenshot({ path: failureScreenshot })
      report.failure.screenshot = failureScreenshot
    } catch (captureError) {
      report.failure.captureError = captureError.message
    }
  }
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
