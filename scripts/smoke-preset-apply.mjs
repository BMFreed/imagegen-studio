/** Built Electron Project preset Apply qualification. No ML, Smart Patch or release claim. */
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

const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'native-preset-apply-payload-'))
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
  pageErrors: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  sourceSha256: hashFiles([
    'scripts/smoke-preset-apply.mjs',
    'scripts/native-smoke-window.mjs',
    'scripts/qualification-resource-limits.mjs',
    'src/renderer/App.vue',
    'src/renderer/components/ProjectView.vue',
    'src/main/index.ts',
    'src/preload/index.ts',
    'src/shared/api.ts',
    'src/main/projects/project-service.ts',
    'src/main/projects/project-autosave.ts',
    'src/main/projects/project-session.ts',
    'src/main/projects/igs-package.ts',
    ...relatedFiles('src/renderer/components', /(?:Preset|preset).*\.(?:vue|ts)$/),
    ...relatedFiles('src/shared/presets', /\.ts$/),
    ...relatedFiles('src/main/projects', /preset.*\.ts$/),
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
      'Real Home New Project UI, Project preset chooser/detached Apply preview, selected-section validation and one Project undo step through built renderer → real preload/Main → .igs Project owner. Real Preset Manager source navigation, native restart, explicit Save and immutable source preset rows/payloads.',
    fixtures:
      'Tiny literal-prompt definitions are created through real Main preset IPC. The actual Home-created Project is saved and its clean tab closed before the production package writer seeds one copied missing LoRA reference into that owned .igs. It is reopened through real Project IPC. Missing checkpoint/LoRA/embedding snapshots test selected-section diagnostics; no model bytes, runtime, worker or inference exist.',
    limits:
      'The launching actor must have a finite RAM budget and zero swap. Existing owned native process guards enforce 2 GiB per actual native scope, zero swap and a finite 300-second deadline.',
    notQualified:
      'Model execution, installed resource pickers, New Project preset customization, Save Current/result-to-preset, Smart Patch Apply, arbitrary asynchronous verifier failures and distributed release packaging remain outside this finite slice. Main stale-document/conflict cases are covered by separate owner tests; this script does not delay or replace production IPC responses.',
    cleanup:
      'Root retains the owned payload for cleanup after confirmed native physical exit. On failure this script cancels its owned Apply dialog and discards only its owned Project tab before closing Electron, without touching external app data.',
  },
}
let application
let window
let nativeChecks = []
let database
let projectId
let packagePath
let savedBytes
let baseline
let sourceSnapshots
const projectTitle = 'Native preset Apply Project'
const editedPrompt = '(detached light:1.3), temporary preview 日本語'

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
  await window.waitForFunction(
    () =>
      typeof window.api?.presets?.list === 'function' &&
      typeof window.api?.projects?.applyPreset === 'function',
  )
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
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
  const result = await api('projects', 'open', projectId)
  assert.equal(result.kind, 'opened')
  return result.tab
}
async function openProjectUi() {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toBeVisible()
}
async function saveProjectUi() {
  const save = window.getByRole('button', { name: 'Save Project', exact: true })
  await save.click()
  await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  await expect(save).toBeEnabled()
  await expect(window.locator('.document-state')).toHaveText('Saved')
  await expect.poll(async () => (await project()).dirty).toBe(false)
  return await project()
}
async function closeProjectUi(discard = false) {
  const tab = window.getByRole('tab', { name: projectTitle, exact: true })
  await window.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
  const discardButton = window.getByRole('button', { name: 'Discard Changes', exact: true })
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
    assert.equal(discard, true, 'Routine saved close should not need a discard decision')
    await discardButton.click()
  }
  await expect(tab).toHaveCount(0)
}
async function historyUi(action) {
  await window.getByRole('button', { name: 'Edit menu', exact: true }).click()
  await window
    .getByText(action === 'undo' ? 'Undo · Ctrl+Z' : 'Redo · Ctrl+Shift+Z / Ctrl+Y', {
      exact: true,
    })
    .click()
  await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  await expect(window.getByRole('button', { name: 'Save Project', exact: true })).toBeEnabled()
  return await project()
}
function content(tab) {
  return {
    acceptedResults: tab.acceptedResults,
    documentId: tab.documentId,
    generationDraft: tab.generationDraft,
    lastActualSeedSnapshot: tab.lastActualSeedSnapshot,
    layers: tab.layers,
    primaryBbox: tab.primaryBbox,
    title: tab.title,
  }
}
async function presetRows() {
  return await database.db.selectFrom('presets').selectAll().orderBy('id').execute()
}
async function assertSourcesUnchanged() {
  assert.deepEqual(await presetRows(), sourceSnapshots.rows)
  for (const record of sourceSnapshots.records) {
    assert.deepEqual(await api('presets', 'get', record.id, { includeDeleted: true }), record)
  }
}
const applyDialog = (name) =>
  window.getByRole('dialog', { name: `Apply Preset: ${name}`, exact: true })
const anyApplyDialog = () => window.getByRole('dialog', { name: /^Apply Preset: / })
const checkbox = (dialog, label) =>
  dialog.getByRole('checkbox', { name: `Apply ${label}`, exact: true })
const prompt = (dialog) => dialog.getByRole('textbox', { name: 'Preset prompt', exact: true })
async function expectPrompt(editor, text) {
  // CodeMirror uses one .cm-line per document line; outer textContent drops separators.
  await expect
    .poll(async () => (await editor.locator('.cm-line').allTextContents()).join('\n'))
    .toBe(text)
}
const manager = () => window.getByRole('dialog', { name: 'Preset Manager', exact: true })
async function openPreset(name) {
  await window.getByRole('button', { name: 'Apply preset', exact: true }).click()
  const search = window.getByRole('textbox', { name: 'Search presets to apply', exact: true })
  await expect(search).toBeVisible()
  await window.getByRole('button', { name: 'Refresh presets to apply', exact: true }).click()
  await search.fill(name)
  await window.getByRole('button', { name: `Choose preset ${name}`, exact: true }).click()
  const dialog = applyDialog(name)
  await expect(dialog).toBeVisible()
  return dialog
}
async function cancelApply(dialog) {
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}
async function expandPrompt(dialog) {
  await dialog
    .locator('[data-preset-section="prompt"]')
    .getByText('Prompt', { exact: true })
    .click()
  await expect(prompt(dialog)).toBeVisible()
}
async function apply(dialog, double = false) {
  const button = dialog.getByRole('button', { name: 'Apply', exact: true })
  await expect(button).toBeEnabled()
  if (double) {
    // Two consecutive real DOM click events exercise synchronous admission before Vue can
    // render the disabled state. No preload or Main handler is replaced.
    await button.evaluate((element) => {
      element.click()
      element.click()
    })
  } else await button.click()
  await expect(dialog).toHaveCount(0)
  await assertSourcesUnchanged()
  return await project()
}
async function screenshot(label, dialog, width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) =>
      BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
    { width, height },
  )
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
  await expect(dialog).toBeVisible()
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
  const geometry = await dialog.evaluate((element) => {
    const rect = (target) => {
      if (!target) throw new Error('Required Apply geometry element is missing')
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
    return {
      modal: rect(element),
      footer: rect(element.querySelector('footer')),
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
      primaryButtons: [...element.querySelectorAll('button.n-button--primary-type')].map(
        (button) => ({ text: button.textContent.trim(), rect: rect(button) }),
      ),
    }
  })
  assert.deepEqual(geometry.viewport, { width, height })
  assert.equal(geometry.documentOverflow, false)
  assert.ok(geometry.modal.x >= -1 && geometry.modal.y >= -1)
  assert.ok(geometry.modal.right <= width + 1 && geometry.modal.bottom <= height + 1)
  assert.ok(
    geometry.footer.y >= geometry.modal.y && geometry.footer.bottom <= geometry.modal.bottom + 1,
  )
  assert.equal(geometry.primaryButtons.length, 1, 'Apply must have one primary action')
  const file = path.join(evidenceRoot, `${label}-${width}x${height}.png`)
  await dialog.screenshot({ path: file, animations: 'disabled' })
  if (label === 'apply-default-collapsed' && width === 1380) {
    const contextFile = path.join(evidenceRoot, 'apply-project-context.png')
    await window.screenshot({ path: contextFile, animations: 'disabled' })
    report.screenshots.push({ label: 'apply-project-context', path: contextFile })
  }
  report.screenshots.push({ label, path: file, geometry })
  writeReport()
}
async function cleanupOwnedUi() {
  if (!window || window.isClosed()) return
  const editGuard = window.getByRole('dialog', { name: 'Edit saved preset', exact: true })
  if (await editGuard.isVisible())
    await editGuard.getByRole('button', { name: 'Keep editing here', exact: true }).click()
  if (await anyApplyDialog().isVisible()) await cancelApply(anyApplyDialog())
  const managerGuard = window.getByRole('dialog', { name: 'Unsaved preset changes', exact: true })
  if (await managerGuard.isVisible())
    await managerGuard.getByRole('button', { name: 'Cancel', exact: true }).click()
  if (await manager().isVisible()) {
    await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
    if (await managerGuard.isVisible())
      await managerGuard.getByRole('button', { name: /^(Discard Draft|Discard)$/ }).click()
    await expect(manager()).toHaveCount(0)
  }
  if (projectId && (await window.getByRole('tab', { name: projectTitle, exact: true }).count())) {
    await closeProjectUi(true)
  }
}
async function closeNative(label) {
  if (!application) return
  await cleanupOwnedUi()
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
    predictionType: kind === 'checkpoint' ? 'epsilon' : null,
    versionName: 'Exact absent native fixture',
  }
}
function definition(name, payload) {
  return {
    description: 'Native detached Project Apply qualification',
    favorite: false,
    name,
    payload,
    tags: ['native-apply'],
    workflow: 'textToImage',
  }
}

try {
  await launch('apply')
  await window
    .getByLabel('Workspace navigation')
    .getByRole('button', { name: 'New Project', exact: true })
    .click()
  const newProject = window.getByRole('dialog', { name: 'New Project', exact: true })
  await expect(newProject).toBeVisible()
  await newProject.getByRole('textbox', { name: 'Project name', exact: true }).fill(projectTitle)
  await newProject.getByRole('button', { name: 'Create Project', exact: true }).click()
  await expect(newProject).toHaveCount(0)
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toBeVisible()
  const listed = await api('projects', 'list')
  const created = listed.filter((entry) => entry.title === projectTitle)
  assert.equal(created.length, 1)
  projectId = created[0].id
  await api('projects', 'updateGenerationDraft', projectId, {
    kind: 'positive-prompt',
    text: 'Original Project prompt',
  })
  await api('projects', 'updateGenerationDraft', projectId, {
    kind: 'negative-prompt',
    text: 'Original Project negative',
  })
  await api('projects', 'updateGenerationDraft', projectId, {
    kind: 'seed',
    policy: 'fixed',
    value: 0,
  })
  await api('projects', 'updateGenerationDraft', projectId, { kind: 'sampling-steps', value: 19 })
  await api('projects', 'updateGenerationDraft', projectId, {
    kind: 'sampling-cfg-scale',
    value: 6.5,
  })
  await api('projects', 'updateGenerationDraft', projectId, {
    kind: 'sampling-pair',
    sampler: 'DPM++ 2M',
    scheduler: 'Karras',
  })
  await api('projects', 'setPrimaryBbox', projectId, { x: -32, y: 48, width: 1024, height: 768 })
  await api('projects', 'sealPromptHistory', projectId)
  await saveProjectUi()
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
  await closeProjectUi()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toHaveCount(0)
  const session = await ProjectSession.open(packagePath, {
    placeholdersDir: path.resolve('dist/main/placeholders'),
    scratchDir: path.join(fixtureRoot, 'closed-project-scratch'),
  })
  session.applyDocument({
    ...session.document,
    generationDraft: {
      ...session.document.generationDraft,
      loras: [
        { enabled: true, resource: reference('lora', 'Existing missing LoRA', 'd'), weight: -0.35 },
      ],
    },
  })
  await session.save()
  await openProjectUi()
  baseline = await project()
  assert.equal(baseline.dirty, false)
  assert.equal(baseline.canUndo, false)
  assert.equal(baseline.generationDraft.loras.length, 1)
  await window.getByRole('tab', { name: projectTitle, exact: true }).click()
  savedBytes = readFileSync(packagePath)
  assert.deepEqual(
    (await readIgsPackage(packagePath)).project.generationDraft,
    baseline.generationDraft,
  )
  check(
    'Real Home UI creates the Project; the closed owned .igs writer seeds a missing LoRA and real reopen preserves seed 0, bbox position and existing sampling without loading models',
    { projectId },
  )

  const style = await api(
    'presets',
    'create',
    definition('Native style preset', {
      prompt: { text: '(source light:1.2), {blue|red}\nliteral 日本語', embeddingRefs: [] },
      sampling: { sampler: 'Euler', scheduler: 'Normal' },
      size: { width: 640, height: 512 },
      seed: { policy: 'fixed', value: 77 },
    }),
  )
  const samplerOnly = await api(
    'presets',
    'create',
    definition('Native sampler-only preset', {
      sampling: { sampler: 'DPM++ SDE' },
    }),
  )
  const missing = await api(
    'presets',
    'create',
    definition('Native missing nested resources', {
      model: reference('checkpoint', 'Absent checkpoint', 'a'),
      loras: [
        { enabled: true, resource: reference('lora', 'Absent preset LoRA', 'b'), weight: 0.6 },
      ],
      prompt: { text: 'literal prompt can be selected independently', embeddingRefs: [] },
      negativePrompt: {
        text: 'literal <absent-vector>',
        embeddingRefs: [
          {
            token: '<absent-vector>',
            resource: reference('embedding', 'Absent nested embedding', 'c'),
          },
        ],
      },
    }),
  )
  const emptyLoras = await api(
    'presets',
    'create',
    definition('Native explicit empty LoRAs', {
      prompt: { text: 'Same Project prompt is retained when unselected', embeddingRefs: [] },
      loras: [],
    }),
  )
  const rawNumeric = await api(
    'presets',
    'create',
    definition('Native raw numeric subset', {
      prompt: {
        text: 'Selected literal prompt ignores a deselected numeric raw draft',
        embeddingRefs: [],
      },
      guidance: { steps: 30, cfgScale: 7 },
    }),
  )
  const deleted = await api(
    'presets',
    'create',
    definition('Native deleted chooser subject', {
      prompt: { text: 'Deleted source must not be offered', embeddingRefs: [] },
    }),
  )
  const deletedRecord = await api('presets', 'softDelete', deleted.id)
  sourceSnapshots = {
    rows: await presetRows(),
    records: [style, samplerOnly, missing, emptyLoras, rawNumeric, deletedRecord],
  }

  for (const request of [
    {
      documentId: baseline.documentId,
      sourcePresetId: deletedRecord.id,
      payload: { prompt: style.payload.prompt },
      selectedSections: ['prompt'],
    },
    {
      documentId: baseline.documentId,
      sourcePresetId: style.id,
      payload: { prompt: style.payload.prompt },
      selectedSections: [],
    },
  ]) {
    const result = await window.evaluate(
      ({ projectId, request }) => window.api.projects.applyPreset(projectId, request),
      { projectId, request },
    )
    assert.equal(result.ok, false, 'Main must refuse deleted sources and empty selections')
    assert.equal(
      result.error.code,
      request.selectedSections.length ? 'PROJECT_INVALID_INPUT' : 'IPC_INVALID_CALLER',
    )
    assert.deepEqual(await project(), baseline)
    await assertSourcesUnchanged()
  }
  check(
    'Real Main IPC rejects an inactive source and an empty selection without changing Project, history or preset rows',
  )

  await window.getByRole('button', { name: 'Apply preset', exact: true }).click()
  const chooserSearch = window.getByRole('textbox', {
    name: 'Search presets to apply',
    exact: true,
  })
  await window.getByRole('button', { name: 'Refresh presets to apply', exact: true }).click()
  await expect(
    window.getByRole('button', { name: `Choose preset ${style.name}`, exact: true }),
  ).toBeVisible()
  await chooserSearch.fill(deleted.name)
  await expect(
    window.getByRole('button', { name: `Choose preset ${style.name}`, exact: true }),
  ).toHaveCount(0)
  await expect(
    window.getByRole('button', { name: `Choose preset ${deleted.name}`, exact: true }),
  ).toHaveCount(0)
  await chooserSearch.fill(style.name)
  await window.getByRole('button', { name: `Choose preset ${style.name}`, exact: true }).click()
  let dialog = applyDialog(style.name)
  await expect(dialog).toBeVisible()
  await expect(checkbox(dialog, 'Prompt')).toBeChecked()
  await expect(checkbox(dialog, 'Sampler & Scheduler')).toBeChecked()
  await expect(checkbox(dialog, 'Size')).not.toBeChecked()
  await expect(checkbox(dialog, 'Seed')).not.toBeChecked()
  await expect(prompt(dialog)).not.toBeVisible()
  await expect(dialog.getByLabel('Preset width', { exact: true })).not.toBeVisible()
  await expect(dialog.getByLabel('Preset seed value', { exact: true })).not.toBeVisible()
  await screenshot('apply-default-collapsed', dialog, 1380, 900)
  await screenshot('apply-default-collapsed', dialog, 900, 680)
  check(
    'Chooser omits deleted presets; Apply starts collapsed with Size and Seed excluded and one visible primary action',
  )

  await checkbox(dialog, 'Sampler & Scheduler').uncheck()
  await expandPrompt(dialog)
  await prompt(dialog).fill(editedPrompt)
  await expectPrompt(prompt(dialog), editedPrompt)
  await dialog.getByRole('button', { name: 'Reset Prompt', exact: true }).click()
  await expectPrompt(prompt(dialog), style.payload.prompt.text)
  await expect(checkbox(dialog, 'Sampler & Scheduler')).not.toBeChecked()
  await prompt(dialog).fill(editedPrompt)
  await dialog.getByRole('button', { name: 'Reset all', exact: true }).click()
  await expectPrompt(prompt(dialog), style.payload.prompt.text)
  await expect(checkbox(dialog, 'Sampler & Scheduler')).not.toBeChecked()
  await expect(checkbox(dialog, 'Size')).not.toBeChecked()
  await expect(checkbox(dialog, 'Seed')).not.toBeChecked()
  await prompt(dialog).fill(editedPrompt)
  await screenshot('apply-expanded-prompt', dialog, 900, 680)
  await assertSourcesUnchanged()
  assert.deepEqual(content(await project()), content(baseline))
  await cancelApply(dialog)
  assert.deepEqual(await project(), baseline)
  assert.equal(readFileSync(packagePath).equals(savedBytes), true)
  await assertSourcesUnchanged()
  check(
    'Section/global reset restores copied values without changing the selection mask; temporary edits and Cancel change neither Project/history/package nor source preset rows',
  )

  dialog = await openPreset(style.name)
  await checkbox(dialog, 'Sampler & Scheduler').uncheck()
  await expandPrompt(dialog)
  await prompt(dialog).fill(editedPrompt)
  const applied = await apply(dialog, true)
  const expected = structuredClone(content(baseline))
  expected.generationDraft.positivePrompt = { text: editedPrompt, embeddingRefs: [] }
  assert.deepEqual(content(applied), expected)
  assert.equal(applied.canUndo, true)
  const undone = await historyUi('undo')
  assert.deepEqual(content(undone), content(baseline))
  assert.equal(
    undone.canUndo,
    false,
    'Two rapid Apply events must produce one observable undo step',
  )
  assert.equal(undone.canRedo, true)
  const redone = await historyUi('redo')
  assert.deepEqual(content(redone), expected)
  assert.equal(redone.canUndo, true)
  assert.equal(redone.canRedo, false)
  assert.equal(readFileSync(packagePath).equals(savedBytes), true)
  await assertSourcesUnchanged()
  check(
    'Prompt-only Apply copies one selected section, preserves bbox/seed/sampling/LoRAs, and rapid double DOM activation yields one real Undo/Redo step without implicitly saving',
  )

  dialog = await openPreset(style.name)
  await dialog.getByRole('checkbox', { name: 'Select all sections', exact: true }).check()
  const beforeFull = await project()
  const full = await apply(dialog)
  const expectedFull = structuredClone(content(beforeFull))
  expectedFull.generationDraft.positivePrompt = structuredClone(style.payload.prompt)
  expectedFull.generationDraft.sampling.sampler = style.payload.sampling.sampler
  expectedFull.generationDraft.sampling.scheduler = style.payload.sampling.scheduler
  expectedFull.generationDraft.seed = structuredClone(style.payload.seed)
  expectedFull.primaryBbox.width = style.payload.size.width
  expectedFull.primaryBbox.height = style.payload.size.height
  assert.deepEqual(content(full), expectedFull)
  assert.deepEqual(content(await historyUi('undo')), content(beforeFull))
  await assertSourcesUnchanged()
  check(
    'Select all copies every included section including Size and Seed in one Undo step, preserving bbox position and unrelated settings',
  )

  dialog = await openPreset(samplerOnly.name)
  const beforeSampler = await project()
  const sampled = await apply(dialog)
  assert.equal(sampled.generationDraft.sampling.sampler, 'DPM++ SDE')
  assert.equal(
    sampled.generationDraft.sampling.scheduler,
    beforeSampler.generationDraft.sampling.scheduler,
    'An omitted scheduler must retain the current scheduler',
  )
  assert.equal(sampled.generationDraft.sampling.steps, beforeSampler.generationDraft.sampling.steps)
  assert.equal(
    sampled.generationDraft.sampling.cfgScale,
    beforeSampler.generationDraft.sampling.cfgScale,
  )
  const restoredSampling = await historyUi('undo')
  assert.deepEqual(content(restoredSampling), content(beforeSampler))
  await assertSourcesUnchanged()
  check(
    'A sampler-only selected section changes only the supplied member and preserves scheduler, steps and CFG',
  )

  dialog = await openPreset(missing.name)
  const alert = dialog.getByRole('alert', {
    name: 'Selected preset settings need attention',
    exact: true,
  })
  await expect(alert).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await expect(alert).toContainText(/Model/)
  await expect(alert).toContainText(/LoRAs/)
  await expect(alert).toContainText(/Negative Prompt/)
  await checkbox(dialog, 'Model').uncheck()
  await checkbox(dialog, 'LoRAs').uncheck()
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await checkbox(dialog, 'Negative Prompt').uncheck()
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled()
  const beforeMissing = await project()
  const promptOnly = await apply(dialog)
  const expectedMissing = structuredClone(content(beforeMissing))
  expectedMissing.generationDraft.positivePrompt = structuredClone(missing.payload.prompt)
  assert.deepEqual(content(promptOnly), expectedMissing)
  await historyUi('undo')
  await assertSourcesUnchanged()
  check(
    'Missing Model/LoRA and a nested negative-prompt embedding block only selected sections; deselecting them permits literal positive prompt Apply without substitutions',
  )

  dialog = await openPreset(emptyLoras.name)
  await checkbox(dialog, 'LoRAs').uncheck()
  await checkbox(dialog, 'Prompt').uncheck()
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await checkbox(dialog, 'LoRAs').check()
  const beforeClear = await project()
  assert.equal(beforeClear.generationDraft.loras.length, 1)
  const cleared = await apply(dialog)
  const expectedClear = structuredClone(content(beforeClear))
  expectedClear.generationDraft.loras = []
  assert.deepEqual(content(cleared), expectedClear)
  assert.deepEqual(content(await historyUi('undo')), content(beforeClear))
  await assertSourcesUnchanged()
  check(
    'Selecting no sections disables Apply; selecting the explicit empty LoRA stack clears the Project stack and Undo restores it',
  )

  dialog = await openPreset(rawNumeric.name)
  await dialog
    .locator('[data-preset-section="guidance"]')
    .getByText('Steps & CFG', { exact: true })
    .click()
  let steps = dialog.getByLabel('Preset steps', { exact: true })
  await expect(steps).toHaveValue('30')
  await steps.fill('-')
  await expect(steps).toHaveValue('-')
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await checkbox(dialog, 'Steps & CFG').uncheck()
  await expect(steps).toHaveValue('-')
  await expect(steps).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled()
  await checkbox(dialog, 'Steps & CFG').check()
  await expect(steps).toHaveValue('-')
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await checkbox(dialog, 'Steps & CFG').uncheck()
  const beforeRawSubset = await project()
  const rawSubsetApplied = await apply(dialog)
  const expectedRawSubset = structuredClone(content(beforeRawSubset))
  expectedRawSubset.generationDraft.positivePrompt = structuredClone(rawNumeric.payload.prompt)
  assert.deepEqual(content(rawSubsetApplied), expectedRawSubset)
  assert.deepEqual(content(await historyUi('undo')), content(beforeRawSubset))
  await assertSourcesUnchanged()

  dialog = await openPreset(rawNumeric.name)
  await dialog
    .locator('[data-preset-section="guidance"]')
    .getByText('Steps & CFG', { exact: true })
    .click()
  steps = dialog.getByLabel('Preset steps', { exact: true })
  await steps.fill('-')
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Reset Steps & CFG', exact: true }).click()
  await expect(steps).toHaveValue('30')
  await expect(checkbox(dialog, 'Steps & CFG')).toBeChecked()
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled()
  await cancelApply(dialog)
  await assertSourcesUnchanged()
  check(
    'Invalid raw "-" remains visible when deselected, blocks again when reselected, and cannot leak into prompt-only Apply; Reset restores a valid copied section without changing its selection',
  )

  dialog = await openPreset(style.name)
  await expandPrompt(dialog)
  await prompt(dialog).fill('Temporary content must not reach the original')
  await dialog.getByRole('button', { name: 'Edit original', exact: true }).click()
  const editGuard = window.getByRole('dialog', { name: 'Edit saved preset', exact: true })
  await expect(editGuard).toBeVisible()
  await editGuard.getByRole('button', { name: 'Keep editing here', exact: true }).click()
  await expectPrompt(prompt(dialog), 'Temporary content must not reach the original')
  await dialog.getByRole('button', { name: 'Edit original', exact: true }).click()
  await editGuard.getByRole('button', { name: 'Open original', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(manager()).toBeVisible()
  await expect(manager().getByRole('textbox', { name: 'Preset name', exact: true })).toHaveValue(
    style.name,
  )
  await expectPrompt(
    manager().getByRole('textbox', { name: 'Preset prompt', exact: true }),
    style.payload.prompt.text,
  )
  await assertSourcesUnchanged()
  await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  await expect(manager()).toHaveCount(0)
  check(
    'Dirty Edit original uses the guard, Keep editing retains the temporary copy and Open original navigates to the actual unchanged source record',
  )

  const saved = await saveProjectUi()
  assert.equal(saved.dirty, false)
  savedBytes = readFileSync(packagePath)
  const savedDocument = (await readIgsPackage(packagePath)).project
  assert.equal(savedDocument.generationDraft.positivePrompt.text, editedPrompt)
  assert.deepEqual(savedDocument.generationDraft.seed, { policy: 'fixed', value: 0 })
  assert.deepEqual(savedDocument.primaryBbox, baseline.primaryBbox)
  assert.equal(savedDocument.generationDraft.loras.length, 1)
  await assertSourcesUnchanged()
  check(
    'Explicit Save persists the applied Project values in a real .igs while every source preset and its exact absent reference remains unchanged',
    { packageSha256: digest(savedBytes) },
  )
  await closeNative('apply')

  await launch('restart')
  await openProjectUi()
  const reopened = await project()
  assert.equal(reopened.dirty, false)
  assert.deepEqual(reopened.generationDraft, savedDocument.generationDraft)
  assert.deepEqual(reopened.primaryBbox, savedDocument.primaryBbox)
  assert.equal(readFileSync(packagePath).equals(savedBytes), true)
  await assertSourcesUnchanged()
  await window.getByRole('tab', { name: projectTitle, exact: true }).click()
  dialog = await openPreset(style.name)
  await expect(checkbox(dialog, 'Size')).not.toBeChecked()
  await expect(checkbox(dialog, 'Seed')).not.toBeChecked()
  await expandPrompt(dialog)
  await expectPrompt(prompt(dialog), style.payload.prompt.text)
  await screenshot('apply-restarted-source', dialog, 1380, 900)
  await cancelApply(dialog)
  await closeNative('restart')
  assert.equal(report.nativeClosures.length, 2)
  assert.deepEqual(report.pageErrors, [])
  check(
    'Physical native restart reopens the saved Project and a fresh source-derived Apply copy without remembering previous detached edits or selection masks',
  )
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'
  report.failure = { message: error.message, stack: error.stack }
  if (window && !window.isClosed()) {
    try {
      report.failure.ariaSnapshot = await window.locator('body').ariaSnapshot()
      report.failure.screenshot = path.join(evidenceRoot, 'failure.png')
      await window.screenshot({ path: report.failure.screenshot })
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
