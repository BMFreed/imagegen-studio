/** Built Electron detached Apply → exact Model Manager → same Apply draft. No ML/download. */
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
import { ModelRepository } from '../src/main/models/model-repository.ts'
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

const fixtureRoot = mkdtempSync(path.join(evidenceRoot, 'native-preset-model-handoff-payload-'))
const appDataRoot = path.join(fixtureRoot, 'data/imagegen-studio')
const projectRoot = path.join(appDataRoot, 'workspaces/Uncategorized')
mkdirSync(projectRoot, { recursive: true, mode: 0o700 })
const nativeExec = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashFiles = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
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
  catalogProbes: [],
  sourceSha256: hashFiles([
    'scripts/smoke-preset-model-handoff.mjs',
    'scripts/native-smoke-window.mjs',
    'scripts/qualification-resource-limits.mjs',
    'src/renderer/App.vue',
    'src/renderer/components/ApplyPresetModal.vue',
    'src/renderer/components/ModelManager.vue',
    'src/renderer/components/PresetPayloadEditor.vue',
    'src/renderer/components/PresetNumberInput.vue',
    'src/renderer/components/model-manager-focus.ts',
    'src/renderer/components/preset-model-handoff.ts',
    'src/shared/presets/preset-application.ts',
    'src/main/models/model-service.ts',
    'src/main/projects/project-service.ts',
    'src/main/projects/project-session.ts',
    'src/main/projects/igs-package.ts',
    'src/main/index.ts',
    'src/preload/index.ts',
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
      'Built renderer → real preload/Main/SQLite catalog and presets; Project picker → selected-resource diagnostic → exact categorized Model Manager → refreshed catalog → same detached Apply DOM; final selected-only Apply through real exact-file verification and one Project Undo/Redo step.',
    fixtures:
      'Ten tiny independently authored catalog-only files represent exact checkpoint/LoRA/VAE/positive and negative embedding versions A/B. Genuine ModelRepository publication precedes native launch. Withdrawing/restoring exact local_model_file rows changes the actual Main catalog without deleting model bytes or substituting API responses. The production closed-package writer prepares the saved Project, fixed seed 0 and its existing checkpoint A; a SQLite seed cursor 0 is fixture setup. Presets are created through actual Main IPC. Owned probes call the real catalog IPC handler and either delay its unchanged successful response or throw a controlled transport error after the real read. No inference tensors, worker, runtime, network download, install or GPU execution.',
    limits:
      'Bounded launching actor; each actual native scope is capped at 2 GiB, zero swap, 300 seconds by the existing process-identity guard.',
    cleanup:
      'All withdrawn rows are restored before native/database close, including failure. Only this owned Apply draft and Project tab are discarded. Payload stays under the registered evidence root for root cleanup after confirmed physical exit.',
    notQualified:
      'This proves navigation and refresh after a controlled exact catalog repair, not the resource download/install mechanism or compatibility of the catalog-only bytes with ML. Smart Patch Apply, New Project handoff and release packaging remain outside this slice.',
  },
}
let application
let window
let database
let nativeChecks = []
let fixture
let baseline
let savedBytes
let sourceRows
let sourceRecords
let catalogProbeInstalled = false
const withdrawn = new Map()
const projectTitle = 'Native preset Models roundtrip'
const presetName = 'Native exact preset Models roundtrip'
const editedPrompt = 'edited <handoff-positive-b>, (soft light:1.3)\nliteral 日本語'
const sectionLabels = {
  guidance: 'Steps & CFG',
  loras: 'LoRAs',
  model: 'Model',
  negativePrompt: 'Negative Prompt',
  prompt: 'Prompt',
  seed: 'Seed',
  size: 'Size',
  vae: 'VAE',
}
const categoryLabels = {
  checkpoint: 'Checkpoints',
  embedding: 'Embeddings',
  lora: 'LoRA',
  vae: 'VAE',
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

async function prepareFixture() {
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  const repository = new ModelRepository(database.db)
  async function publish(kind, modelId, remoteVersion, suffix, role) {
    const bytes = Buffer.from(`Independent handoff catalog fixture ${kind} ${remoteVersion}.`)
    const filename = `handoff-${role}-${suffix.toLowerCase()}.safetensors`
    const managedPath = path.join(appDataRoot, 'models', filename)
    mkdirSync(path.dirname(managedPath), { recursive: true, mode: 0o700 })
    writeFileSync(managedPath, bytes, { mode: 0o600 })
    const name = `Handoff ${role}`
    const versionName = `Exact ${suffix}`
    const result = await repository.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath,
          originalFilename: filename,
          sha256: digest(bytes),
          sizeBytes: bytes.length,
          verifiedAt: new Date().toISOString(),
        },
        resource: {
          creator: 'Native catalog fixture',
          displayName: name,
          previewUrl: null,
          source: { kind: 'civitai', modelId },
          sourceMetadata: { fixture: true },
          type: kind,
        },
        version: {
          baseModelFamily: 'illustrious',
          format: 'safetensors',
          name: versionName,
          predictionType: kind === 'checkpoint' ? 'epsilon' : null,
          source: {
            kind: 'civitai',
            fileId: remoteVersion + 1000,
            versionId: remoteVersion,
            expectedSha256: digest(bytes),
          },
          sourceMetadata: { fixture: true, trainedWords: [`handoff-${role}-${suffix}`] },
        },
      },
    })
    return {
      ...result,
      name,
      kind,
      filename,
      versionName,
      portable: {
        baseModelFamily: 'illustrious',
        civitaiFileId: remoteVersion + 1000,
        civitaiModelId: modelId,
        civitaiVersionId: remoteVersion,
        displayName: name,
        fileSha256: digest(bytes),
        kind,
        localModelId: result.resourceId,
        localVersionId: result.versionId,
        predictionType: kind === 'checkpoint' ? 'epsilon' : null,
        versionName,
      },
    }
  }
  const resources = {}
  for (const [index, [kind, role]] of [
    ['checkpoint', 'checkpoint'],
    ['lora', 'LoRA'],
    ['vae', 'VAE'],
    ['embedding', 'positive'],
    ['embedding', 'negative'],
  ].entries()) {
    const base = 98200 + index * 10
    const a = await publish(kind, base, base + 1, 'A', role)
    const b = await publish(kind, base, base + 2, 'B', role)
    assert.equal(a.resourceId, b.resourceId)
    assert.notEqual(a.versionId, b.versionId)
    await repository.setDefaultVersion(a.resourceId, a.versionId)
    resources[role] = { a, b }
  }
  const session = await ProjectSession.create(
    path.join(projectRoot, `${projectTitle}.igs`),
    projectTitle,
    {
      placeholdersDir: path.resolve('dist/main/placeholders'),
      scratchDir: path.join(fixtureRoot, 'closed-project-scratch'),
    },
  )
  session.applyDocument({
    ...session.document,
    generationDraft: {
      ...session.document.generationDraft,
      model: resources.checkpoint.a.portable,
      positivePrompt: { text: 'Saved Project prompt', embeddingRefs: [] },
      negativePrompt: { text: 'Saved Project negative', embeddingRefs: [] },
      seed: { policy: 'fixed', value: 0 },
    },
    primaryBbox: { x: -32, y: 48, width: 1024, height: 768 },
  })
  await session.save()
  await database.db
    .insertInto('generation_seed_cursor')
    .values({
      actual_seed: 0,
      candidate_id: randomUUID(),
      completion_order: 1,
      document_id: session.document.documentId,
      local_project_key: session.localRecoveryKey,
      updated_at: new Date().toISOString(),
    })
    .execute()
  for (const resource of Object.values(resources)) await withdraw(resource.b)
  return {
    resources,
    projectId: session.localRecoveryKey,
    packagePath: session.filePath,
  }
}
async function withdraw(resource) {
  const row = await database.db
    .selectFrom('local_model_file')
    .selectAll()
    .where('resource_version_id', '=', resource.versionId)
    .executeTakeFirstOrThrow()
  withdrawn.set(resource.versionId, row)
  await database.db
    .deleteFrom('local_model_file')
    .where('resource_version_id', '=', resource.versionId)
    .execute()
}
async function restore(resource) {
  const row = withdrawn.get(resource.versionId)
  assert.ok(row, 'Only a row withdrawn by this script may be restored')
  await database.db.insertInto('local_model_file').values(row).execute()
  withdrawn.delete(resource.versionId)
}
async function restoreAll() {
  if (!database) return
  for (const [versionId, row] of withdrawn) {
    await database.db.insertInto('local_model_file').values(row).execute()
    withdrawn.delete(versionId)
  }
  report.catalogRowsRestored = withdrawn.size === 0
  writeReport()
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
async function launch() {
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
  await limitCheck('handoff-launch')
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(10_000)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await window.waitForFunction(() => typeof window.api?.presets?.create === 'function')
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toBeVisible()
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
  const result = await api('projects', 'open', fixture.projectId)
  assert.equal(result.kind, 'opened')
  return result.tab
}
async function catalog() {
  return await api('models', 'getCatalog')
}
async function installCatalogProbe(mode) {
  assert.equal(catalogProbeInstalled, false)
  assert.ok(mode === 'hold' || mode === 'transport-error')
  await application.evaluate(({ ipcMain }, selectedMode) => {
    const channel = 'models:get-catalog'
    const original = ipcMain._invokeHandlers.get(channel)
    if (typeof original !== 'function') throw new Error('Actual catalog handler missing')
    if (globalThis.igsPresetModelCatalogProbe) throw new Error('Owned catalog probe already exists')
    const probe = {
      original,
      mode: selectedMode,
      intercepted: false,
      completed: false,
      delivered: false,
      originalOk: false,
      originalCatalogIdentities: [],
      calls: 0,
      restored: false,
      release: null,
    }
    const delivery = new Promise((resolve) => {
      probe.release = resolve
    })
    globalThis.igsPresetModelCatalogProbe = probe
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      ++probe.calls
      const intercept = !probe.intercepted
      if (intercept) probe.intercepted = true
      const result = await original(event, ...args)
      if (intercept) {
        probe.completed = true
        probe.originalOk = result.ok === true
        probe.originalCatalogIdentities =
          result.ok === true
            ? result.value.map((item) => ({
                resourceId: item.id,
                versions: item.versions.map((version) => version.id),
              }))
            : []
        if (probe.mode === 'transport-error') {
          probe.delivered = true
          throw new Error('Owned preset handoff catalog transport rejection')
        }
        await delivery
        probe.delivered = true
      }
      return result
    })
  }, mode)
  catalogProbeInstalled = true
}
async function catalogProbeState() {
  return await application.evaluate(() => {
    const probe = globalThis.igsPresetModelCatalogProbe
    if (!probe) throw new Error('Owned catalog probe missing')
    return {
      mode: probe.mode,
      intercepted: probe.intercepted,
      completed: probe.completed,
      delivered: probe.delivered,
      originalOk: probe.originalOk,
      originalCatalogIdentities: probe.originalCatalogIdentities,
      calls: probe.calls,
      restored: probe.restored,
    }
  })
}
async function restoreCatalogProbe() {
  if (!catalogProbeInstalled || !application) return
  await application.evaluate(({ ipcMain }) => {
    const channel = 'models:get-catalog'
    const probe = globalThis.igsPresetModelCatalogProbe
    if (!probe) throw new Error('Owned catalog probe missing at restoration')
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, probe.original)
    probe.restored = ipcMain._invokeHandlers.get(channel) === probe.original
    probe.release()
  })
  const proof = await catalogProbeState()
  assert.equal(proof.restored, true, 'Actual original catalog handler must be restored')
  if (proof.completed)
    await expect.poll(async () => (await catalogProbeState()).delivered).toBe(true)
  report.catalogProbes.push(await catalogProbeState())
  await application.evaluate(() => {
    delete globalThis.igsPresetModelCatalogProbe
  })
  catalogProbeInstalled = false
  writeReport()
}
async function seed() {
  const result = await api('projects', 'listGenerationResults', fixture.projectId)
  assert.equal(Object.hasOwn(result, 'lastActualSeed'), true)
  return result.lastActualSeed
}
const projectState = (tab) => ({
  acceptedResults: tab.acceptedResults,
  canRedo: tab.canRedo,
  canUndo: tab.canUndo,
  dirty: tab.dirty,
  documentId: tab.documentId,
  generationDraft: tab.generationDraft,
  lastActualSeedSnapshot: tab.lastActualSeedSnapshot,
  layers: tab.layers,
  primaryBbox: tab.primaryBbox,
  title: tab.title,
})
async function preserved() {
  assert.deepEqual(projectState(await project()), baseline)
  assert.equal(await seed(), 0)
  assert.equal(readFileSync(fixture.packagePath).equals(savedBytes), true)
  assert.deepEqual(
    (await readIgsPackage(fixture.packagePath)).project.generationDraft,
    baseline.generationDraft,
  )
  assert.deepEqual(
    await database.db.selectFrom('presets').selectAll().orderBy('id').execute(),
    sourceRows,
  )
  for (const source of sourceRecords)
    assert.deepEqual(await api('presets', 'get', source.id, { includeDeleted: true }), source)
}
const applyDialog = (name = presetName) =>
  window.getByRole('dialog', { name: `Apply Preset: ${name}`, exact: true })
const manager = () => window.getByRole('dialog', { name: 'Model Manager', exact: true })
const attention = (dialog) =>
  dialog.getByRole('alert', { name: 'Selected preset settings need attention', exact: true })
const checkbox = (dialog, section) =>
  dialog.getByRole('checkbox', { name: `Apply ${sectionLabels[section]}`, exact: true })
const prompt = (dialog) => dialog.getByRole('textbox', { name: 'Preset prompt', exact: true })
async function expectPrompt(editor, text) {
  await expect
    .poll(async () => (await editor.locator('.cm-line').allTextContents()).join('\n'))
    .toBe(text)
}
async function openPreset(name = presetName) {
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
async function editorState(dialog) {
  return await dialog.locator('.payload-card').evaluate((element) => ({
    inputs: [...element.querySelectorAll('input')].map((input) => ({
      label: input.getAttribute('aria-label'),
      value: input.value,
      disabled: input.disabled,
    })),
    selection: [...element.querySelectorAll('[role="checkbox"]')].map((item) => ({
      label: item.getAttribute('aria-label'),
      checked: item.getAttribute('aria-checked'),
    })),
    prompts: [...element.querySelectorAll('.cm-content')].map((item) => ({
      label: item.getAttribute('aria-label'),
      text: [...item.querySelectorAll('.cm-line')].map((line) => line.textContent).join('\n'),
    })),
    sections: [...element.querySelectorAll('[data-preset-section]')].map((item) => ({
      section: item.getAttribute('data-preset-section'),
      expanded: !!item.querySelector('.n-collapse-item__content-inner'),
    })),
  }))
}
const authoringState = (state) => ({
  ...state,
  inputs: state.inputs.map(({ disabled: _disabled, ...input }) => input),
})
async function screenshot(label, dialog, width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) =>
      BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
    { width, height },
  )
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
  await expect(dialog).toBeVisible()
  if (label === 'apply-selected-missing-exact') {
    const viewport = dialog.locator('.modal-scroll .n-scrollbar-container')
    await viewport.evaluate((element) => {
      element.scrollTop = 0
    })
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(0)
  }
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
      if (!target) throw new Error('Required dialog geometry element missing')
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
      heading: rect(element.querySelector('h2')),
      footer: element.querySelector('footer') ? rect(element.querySelector('footer')) : null,
      rootScrollTop: element.scrollTop,
      modelActions: [...element.querySelectorAll('[data-preset-model-action]')].map((action) => ({
        label: action.getAttribute('aria-label'),
        ...rect(action),
      })),
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
      primaryButtons: [...element.querySelectorAll('button.n-button--primary-type')].map((button) =>
        button.textContent.trim(),
      ),
    }
  })
  assert.equal(geometry.documentOverflow, false)
  assert.equal(geometry.rootScrollTop, 0)
  assert.ok(geometry.modal.x >= -1 && geometry.modal.y >= -1)
  assert.ok(geometry.modal.right <= width + 1 && geometry.modal.bottom <= height + 1)
  assert.ok(
    geometry.heading.y >= geometry.modal.y && geometry.heading.bottom <= geometry.modal.bottom + 1,
  )
  if (geometry.footer)
    assert.ok(
      geometry.footer.y >= geometry.modal.y && geometry.footer.bottom <= geometry.modal.bottom + 1,
    )
  if (dialog === undefined) throw new Error('Screenshot needs actual visible dialog')
  const file = path.join(evidenceRoot, `${label}-${width}x${height}.png`)
  await window.screenshot({
    path: file,
    clip: {
      x: Math.max(0, geometry.modal.x),
      y: Math.max(0, geometry.modal.y),
      width: geometry.modal.width,
      height: geometry.modal.height,
    },
    animations: 'disabled',
  })
  report.screenshots.push({ label, path: file, geometry })
  writeReport()
}
async function exactCatalog(resource, present) {
  const item = (await catalog()).find((entry) => entry.id === resource.resourceId)
  assert.ok(item, 'Sibling A keeps the same resource installed')
  const other = item.versions.find(
    (version) => version.id === fixture.resources[resource.role].a.versionId,
  )
  assert.ok(other && other.fileStatus === 'ready')
  const exact = item.versions.find((version) => version.id === resource.versionId)
  if (present) assert.ok(exact && exact.fileStatus === 'ready')
  else assert.equal(exact, undefined)
  return item
}
async function roundtrip(
  dialog,
  resource,
  { close = 'button', repair = false, screenshotLabel } = {},
) {
  const action = attention(dialog).getByRole('button', {
    name: `Open ${resource.name} in Models`,
    exact: true,
  })
  await expect(action).toHaveCount(1)
  const detached = await editorState(dialog)
  await action.focus()
  await action.click()
  await expect(manager()).toBeVisible()
  await expect(dialog).toBeHidden()
  const filters = manager().getByRole('complementary', { name: 'Model filters', exact: true })
  await expect(
    filters.getByRole('button', { name: new RegExp(`^${categoryLabels[resource.kind]} `) }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(manager().getByPlaceholder('Search installed models')).toHaveValue('')
  const details = manager().getByRole('complementary', { name: 'Model details', exact: true })
  await expect(details.locator('h2')).toHaveText(resource.name)
  await expect(manager()).toContainText('Preset version unavailable')
  await expect(manager()).toContainText(
    `${resource.versionName} is not installed for ${resource.name}. The Apply selection is unchanged.`,
  )
  await expect(manager().locator('.version-row--project')).toHaveCount(0)
  await expect(details.locator('.metadata-list dd')).toHaveText(['—', '—'])
  await expect(manager().locator('.version-row').filter({ hasText: 'Exact A' })).toContainText(
    'Default',
  )
  await preserved()
  if (screenshotLabel) {
    await screenshot(screenshotLabel, manager(), 1380, 900)
    await screenshot(screenshotLabel, manager(), 900, 680)
  }
  if (repair) {
    await restore(resource)
    await exactCatalog(resource, true)
  }
  if (close === 'escape') await manager().press('Escape')
  else await manager().getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager()).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect.poll(() => editorState(dialog)).toEqual(detached)
  if (repair) {
    await expect(
      attention(dialog).getByRole('button', {
        name: `Open ${resource.name} in Models`,
        exact: true,
      }),
    ).toHaveCount(0)
    await expect(
      dialog.getByRole('button', { name: 'Close Apply Preset', exact: true }),
    ).toBeFocused()
  } else await expect(action).toBeFocused()
  await preserved()
  check(
    `${resource.kind} ${resource.name}: exact missing B focus and ${close} return preserve detached raw input/mask/prompts/expanded state and all Project/source boundaries`,
    { repair, versionId: resource.versionId },
  )
}
async function closeNative() {
  if (!application) return
  const closing = application
  try {
    await restoreCatalogProbe()
    await restoreAll()
    if (window && !window.isClosed()) {
      if (await manager().isVisible()) {
        await manager().getByRole('button', { name: 'Close Model Manager', exact: true }).click()
        await expect(manager()).toHaveCount(0)
      }
      const dialog = window.getByRole('dialog', { name: /^Apply Preset: / })
      if (await dialog.isVisible()) {
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
        await expect(dialog).toHaveCount(0)
      }
      const tab = window.getByRole('tab', { name: projectTitle, exact: true })
      if (await tab.count()) {
        await window.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
        const discard = window.getByRole('button', { name: 'Discard Changes', exact: true })
        await expect
          .poll(async () =>
            (await tab.count()) === 0
              ? 'closed'
              : (await discard.isVisible())
                ? 'decision'
                : 'waiting',
          )
          .not.toBe('waiting')
        if (await tab.count()) await discard.click()
        await expect(tab).toHaveCount(0)
      }
    }
    await limitCheck('handoff-before-close')
  } finally {
    if (database) {
      await database.close()
      database = null
    }
    await closing.close()
    report.nativeClosures.push({
      label: 'handoff',
      ...(await confirmQualificationProcessExit(nativeChecks)),
    })
    application = null
    window = null
    writeReport()
  }
}

try {
  fixture = await prepareFixture()
  for (const [role, pair] of Object.entries(fixture.resources)) {
    pair.a.role = role
    pair.b.role = role
  }
  await launch()
  baseline = projectState(await project())
  savedBytes = readFileSync(fixture.packagePath)
  assert.equal(baseline.dirty, false)
  assert.equal(baseline.canUndo, false)
  assert.equal(baseline.canRedo, false)
  assert.equal(await seed(), 0)
  const refs = fixture.resources
  const source = await api('presets', 'create', {
    description: 'Native selected exact resource handoff',
    favorite: false,
    name: presetName,
    tags: ['native-handoff'],
    workflow: 'textToImage',
    payload: {
      prompt: {
        text: '<handoff-positive-b>, source portrait',
        embeddingRefs: [{ token: '<handoff-positive-b>', resource: refs.positive.b.portable }],
      },
      negativePrompt: {
        text: '<handoff-negative-b>, source negative',
        embeddingRefs: [{ token: '<handoff-negative-b>', resource: refs.negative.b.portable }],
      },
      model: refs.checkpoint.b.portable,
      loras: [{ enabled: true, resource: refs.LoRA.b.portable, weight: -0.35 }],
      vae: refs.VAE.b.portable,
      guidance: { steps: 24, cfgScale: 6.5 },
      size: { width: 768, height: 640 },
      seed: { policy: 'fixed', value: 77 },
    },
  })
  const absent = {
    ...refs.LoRA.b.portable,
    civitaiModelId: 99321,
    civitaiVersionId: 99322,
    civitaiFileId: 99323,
    displayName: 'Completely absent exact LoRA',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
  }
  const missingSource = await api('presets', 'create', {
    description: 'Missing resource with no sibling',
    favorite: false,
    name: 'Native absent whole resource',
    tags: ['native-handoff'],
    workflow: 'textToImage',
    payload: { loras: [{ enabled: true, resource: absent, weight: 0.5 }] },
  })
  const mismatchSource = await api('presets', 'create', {
    description: 'Nominal IDs match, immutable bytes differ',
    favorite: false,
    name: 'Native preset wrong exact SHA',
    tags: ['native-handoff'],
    workflow: 'textToImage',
    payload: {
      loras: [
        {
          enabled: true,
          resource: { ...refs.LoRA.b.portable, fileSha256: 'f'.repeat(64) },
          weight: -0.5,
        },
      ],
    },
  })
  assert.notEqual(
    mismatchSource.payload.loras[0].resource.fileSha256,
    refs.LoRA.b.portable.fileSha256,
  )
  sourceRecords = [source, missingSource, mismatchSource]
  sourceRows = await database.db.selectFrom('presets').selectAll().orderBy('id').execute()
  for (const pair of Object.values(refs)) await exactCatalog(pair.b, false)
  await preserved()
  check(
    'Real closed Project package, seed 0 and IPC-created source presets accompany five exact missing B versions while installed/default A siblings remain real',
  )

  let dialog = await openPreset()
  await expect(attention(dialog).getByRole('button', { name: /^Open .* in Models$/ })).toHaveCount(
    5,
  )
  await dialog.getByRole('button', { name: 'Expand all', exact: true }).click()
  await prompt(dialog).fill(editedPrompt)
  await expectPrompt(prompt(dialog), editedPrompt)
  await dialog.getByLabel('Preset steps', { exact: true }).fill('-')
  await checkbox(dialog, 'guidance').uncheck()
  await expect(dialog.getByLabel('Preset steps', { exact: true })).toHaveValue('-')
  await expect(checkbox(dialog, 'size')).not.toBeChecked()
  await expect(checkbox(dialog, 'seed')).not.toBeChecked()
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await screenshot('apply-selected-missing-exact', dialog, 1380, 900)
  await screenshot('apply-selected-missing-exact', dialog, 900, 680)
  await preserved()
  check(
    'Selected-only diagnostics offer all five typed resource actions while an excluded invalid raw Steps field, edited prompt and expanded sections remain detached',
  )

  await roundtrip(dialog, refs.checkpoint.b, {
    screenshotLabel: 'models-missing-preset-checkpoint',
  })
  await roundtrip(dialog, refs.positive.b, { close: 'escape' })
  await roundtrip(dialog, refs.negative.b, { close: 'escape' })

  const beforeCatalogError = await editorState(dialog)
  const catalogRetryAction = attention(dialog).getByRole('button', {
    name: `Open ${refs.checkpoint.b.name} in Models`,
    exact: true,
  })
  await catalogRetryAction.click()
  await expect(manager()).toBeVisible()
  await expect(manager()).toContainText('Preset version unavailable')
  await installCatalogProbe('transport-error')
  await manager().getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager()).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(attention(dialog)).toContainText('Resource availability could not be checked.')
  await expect(attention(dialog)).not.toContainText('exact version unavailable')
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  const failedCatalogRead = await catalogProbeState()
  assert.equal(
    failedCatalogRead.originalOk,
    true,
    'The actual catalog read must complete before the injected transport rejection',
  )
  assert.equal(failedCatalogRead.delivered, true)
  await expect
    .poll(async () => authoringState(await editorState(dialog)))
    .toEqual(authoringState(beforeCatalogError))
  await expect(dialog.getByLabel('Preset steps', { exact: true })).toHaveValue('-')
  await expectPrompt(prompt(dialog), editedPrompt)
  await preserved()
  await restoreCatalogProbe()
  await catalogRetryAction.click()
  await expect(manager()).toBeVisible()
  await expect(manager()).toContainText('Preset version unavailable')
  await manager().press('Escape')
  await expect(manager()).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(attention(dialog)).not.toContainText('Resource availability could not be checked.')
  await expect(attention(dialog).getByRole('button', { name: /^Open .* in Models$/ })).toHaveCount(
    5,
  )
  await expect.poll(() => editorState(dialog)).toEqual(beforeCatalogError)
  await preserved()
  check(
    'Failed catalog transport returns the preserved detached draft with explicit unavailable diagnostics and disabled Apply; a normal Models retry and refreshed return recover without rewriting any copied reference',
  )

  await roundtrip(dialog, refs.VAE.b, { close: 'escape', repair: true })
  await expect(attention(dialog).getByRole('button', { name: /^Open .* in Models$/ })).toHaveCount(
    4,
  )
  await roundtrip(dialog, refs.LoRA.b, { repair: true })
  await expect(attention(dialog).getByRole('button', { name: /^Open .* in Models$/ })).toHaveCount(
    3,
  )
  for (const section of ['model', 'prompt', 'negativePrompt'])
    await checkbox(dialog, section).uncheck()
  await expect(attention(dialog)).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /^Open .* in Models$/ })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled()
  await expect(dialog.getByLabel('Preset steps', { exact: true })).toHaveValue('-')
  await expectPrompt(prompt(dialog), editedPrompt)
  await preserved()
  check(
    'Deselecting unrepaired reference sections removes only their diagnostics/actions; repaired exact LoRA/VAE and excluded raw-invalid guidance are independently applicable',
  )

  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const applied = projectState(await project())
  const expectedDraft = structuredClone(baseline.generationDraft)
  expectedDraft.loras = source.payload.loras
  expectedDraft.vae = source.payload.vae
  assert.deepEqual(applied.generationDraft, expectedDraft)
  assert.deepEqual(applied.primaryBbox, baseline.primaryBbox)
  assert.equal(applied.canUndo, true)
  assert.equal(applied.dirty, true)
  assert.equal(await seed(), 0)
  assert.equal(readFileSync(fixture.packagePath).equals(savedBytes), true)
  await window.getByRole('button', { name: 'Edit menu', exact: true }).click()
  await window.getByText('Undo · Ctrl+Z', { exact: true }).click()
  await expect
    .poll(async () => projectState(await project()))
    .toEqual({ ...baseline, canRedo: true })
  await window.getByRole('button', { name: 'Edit menu', exact: true }).click()
  await window.getByText('Redo · Ctrl+Shift+Z / Ctrl+Y', { exact: true }).click()
  await expect.poll(async () => (await project()).generationDraft).toEqual(expectedDraft)
  await window.getByRole('button', { name: 'Edit menu', exact: true }).click()
  await window.getByText('Undo · Ctrl+Z', { exact: true }).click()
  await expect
    .poll(async () => projectState(await project()))
    .toEqual({ ...baseline, canRedo: true })
  await api('projects', 'clearHistory', fixture.projectId)
  await preserved()
  check(
    'After catalog repair, real Main rehashes selected exact LoRA/VAE bytes and publishes one Apply Undo/Redo step; omitted prompt/model/guidance/Size/Seed, source rows and saved .igs are unchanged',
  )

  dialog = await openPreset(mismatchSource.name)
  const mismatchedAction = attention(dialog).getByRole('button', {
    name: `Open ${refs.LoRA.b.name} in Models`,
    exact: true,
  })
  await mismatchedAction.click()
  await expect(manager()).toBeVisible()
  await expect(manager()).toContainText('Preset resource unavailable')
  await expect(manager()).not.toContainText('Selected for Apply')
  await expect(manager().locator('.version-row--project')).toHaveCount(0)
  const matchingIds = manager().locator('.version-row').filter({ hasText: refs.LoRA.b.versionName })
  await expect(matchingIds).toBeVisible()
  const details = manager().getByRole('complementary', { name: 'Model details', exact: true })
  await expect(details.locator('.metadata-list dd')).toHaveText(['—', '—'])
  await matchingIds.getByRole('button', { name: 'Set Default', exact: true }).click()
  await expect(matchingIds).toContainText('Default')
  await expect
    .poll(
      async () =>
        (await catalog()).find((entry) => entry.id === refs.LoRA.b.resourceId).defaultVersionId,
    )
    .toBe(refs.LoRA.b.versionId)
  await expect(manager()).toContainText('Preset resource unavailable')
  await expect(manager()).not.toContainText('Selected for Apply')
  await preserved()
  await screenshot('models-nominal-B-wrong-SHA', manager(), 1380, 900)
  await manager().getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager()).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(mismatchedAction).toBeFocused()
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await expect(attention(dialog)).toContainText('exact version unavailable')
  await preserved()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  check(
    'Matching nominal version IDs with a wrong saved SHA remain unavailable through genuine Default A→B change; no selected badge, copied detail substitution, Project/source mutation or silent Apply occurs',
  )

  dialog = await openPreset(missingSource.name)
  const missingAction = attention(dialog).getByRole('button', {
    name: `Open ${absent.displayName} in Models`,
    exact: true,
  })
  await missingAction.click()
  await expect(manager()).toBeVisible()
  await expect(manager()).toContainText('Preset model unavailable')
  await expect(manager()).toContainText(
    `${absent.displayName} is not in this model library. The Apply selection is unchanged.`,
  )
  await expect(
    manager()
      .getByRole('complementary', { name: 'Model filters', exact: true })
      .getByRole('button', { name: /^LoRA / }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(manager().locator('.version-row--project')).toHaveCount(0)
  await preserved()
  await manager().press('Escape')
  await expect(manager()).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(missingAction).toBeFocused()
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await preserved()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await preserved()
  check(
    'A wholly absent resource opens its exact category with Preset-specific missing identity and Escape returns to its still-blocked Apply action without substituting Default',
  )

  dialog = await openPreset()
  await dialog.getByRole('button', { name: 'Expand all', exact: true }).click()
  await prompt(dialog).fill(editedPrompt)
  await dialog.getByLabel('Preset steps', { exact: true }).fill('-')
  await checkbox(dialog, 'guidance').uncheck()
  await attention(dialog)
    .getByRole('button', {
      name: `Open ${refs.checkpoint.b.name} in Models`,
      exact: true,
    })
    .click()
  await expect(manager()).toBeVisible()
  await expect(manager()).toContainText('Preset version unavailable')
  await installCatalogProbe('hold')
  await manager().getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager()).toHaveCount(0)
  await expect(dialog).toBeHidden()
  await expect.poll(async () => (await catalogProbeState()).completed).toBe(true)
  const heldCatalogRead = await catalogProbeState()
  assert.equal(
    heldCatalogRead.originalOk,
    true,
    'Held response must be the actual successful catalog result',
  )
  assert.equal(heldCatalogRead.delivered, false)
  const region = window.getByRole('region', { name: `Project ${projectTitle}`, exact: true })
  const ordinaryModels = region.getByRole('button', { name: 'Manage Models', exact: true })
  await ordinaryModels.click()
  await expect(manager()).toBeVisible()
  await expect(manager()).not.toContainText('Preset version unavailable')
  await expect(manager().locator('.version-row--project')).toContainText('Exact A')
  await expect(manager().locator('.version-row--project')).toContainText('Selected in Project')
  await expect(manager()).not.toContainText('Selected for Apply')
  await expect(dialog).toHaveCount(0)
  await preserved()
  await restoreCatalogProbe()
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  await expect(manager()).toBeVisible()
  await expect(dialog).toHaveCount(0)
  await expect(manager().locator('.version-row--project')).toContainText('Selected in Project')
  await preserved()
  await manager().press('Escape')
  await expect(manager()).toHaveCount(0)
  await expect(ordinaryModels).toBeFocused()
  await expect(dialog).toHaveCount(0)
  await preserved()
  check(
    'A real held close-catalog response cannot reopen cancelled Apply over a newer ordinary Project Model Manager; exact Project A focus, final trigger focus and all data owners remain unchanged',
  )

  await restoreAll()
  assert.equal(withdrawn.size, 0)
  await closeNative()
  assert.deepEqual(report.pageErrors, [])
  check(
    'All controlled missing rows are restored and owned Electron scopes physically exit without any ML/runtime or project save',
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
  if (catalogProbeInstalled && application) {
    try {
      await restoreCatalogProbe()
    } catch (error) {
      report.catalogProbeRestorationFailure = String(error)
    }
  }
  if (database) {
    try {
      await restoreAll()
    } catch (error) {
      report.catalogRestorationFailure = String(error)
    }
  }
  if (application) {
    try {
      await closeNative()
    } catch (error) {
      report.cleanupFailure = { message: error.message, stack: error.stack }
      report.outcome = 'failed'
    }
  } else if (database) {
    await database.close()
    database = null
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
