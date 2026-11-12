/** Finite built Preset Manager → exact Models → retained editor qualification. No ML/install. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
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
const relativeRoot = path.relative(artifactRoot, evidenceRoot)
assert.ok(relativeRoot && !relativeRoot.startsWith('..') && !path.isAbsolute(relativeRoot))
assert.equal(realpathSync(evidenceRoot), evidenceRoot)
assert.ok(lstatSync(evidenceRoot).isDirectory() && !lstatSync(evidenceRoot).isSymbolicLink())

// The launching actor must already have its own 2 GiB/zero-swap/600s guard.
// The existing helper separately verifies and bounds every actual Electron scope.
const payload = mkdtempSync(path.join(evidenceRoot, 'native-preset-manager-models-'))
const appData = path.join(payload, 'data/imagegen-studio')
const rollback = path.join(payload, 'original-model-bytes')
mkdirSync(rollback, { recursive: true, mode: 0o700 })
mkdirSync(appData, { recursive: true, mode: 0o700 })
const execute = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashFiles = (files) =>
  Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const sourceFiles = [
  'scripts/smoke-preset-manager-models.mjs',
  'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs',
  'src/renderer/App.vue',
  'src/renderer/components/AppChrome.vue',
  'src/renderer/components/PresetManager.vue',
  'src/renderer/components/ApplyPresetModal.vue',
  'src/renderer/components/PresetPayloadEditor.vue',
  'src/renderer/components/PresetNumberInput.vue',
  'src/renderer/components/ModelManager.vue',
  'src/renderer/components/preset-manager-session.ts',
  'src/renderer/components/preset-editor.ts',
  'src/renderer/components/preset-model-handoff.ts',
  'src/renderer/components/model-manager-focus.ts',
  'src/renderer/components/preset-create-intent.ts',
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/shared/api.ts',
  'src/shared/window-close.ts',
  'src/shared/presets/preset-schema.ts',
  'src/shared/presets/preset-application.ts',
  'src/main/models/model-repository.ts',
  'src/main/models/model-service.ts',
  'src/main/presets/preset-service.ts',
  'src/main/presets/preset-repository.ts',
  'src/main/presets/preset-ipc.ts',
  'src/main/projects/project-session.ts',
  'src/main/projects/igs-package.ts',
]
const bundleFiles = [
  'dist/main/main.cjs',
  'dist/preload/preload.cjs',
  'dist/renderer/index.html',
  ...readdirSync('dist/renderer/assets')
    .filter((name) => /\.(?:js|css)$/.test(name))
    .map((name) => `dist/renderer/assets/${name}`),
]
const report = {
  outcome: 'running',
  startedAt: new Date().toISOString(),
  payloads: [payload],
  checks: [],
  screenshots: [],
  nativeClosures: [],
  resourceChecks: [],
  catalogProbes: [],
  handlerRestorations: [],
  fileRestorations: [],
  pageErrors: [],
  vueWarnings: [],
  sourceSha256: hashFiles(sourceFiles),
  bundleSha256: hashFiles(bundleFiles),
  sourceBasis: {
    baseRevision: '6ffb35e13412ac93fa21e7c78c268926d34d3a73',
    invokeRevision: '4875d96531ca6712b288f6e660fcbb34143408c1',
    invokePaths: [
      'invokeai/app/api/routers/model_manager.py',
      'invokeai/app/services/model_records/model_records_sql.py',
      'invokeai/frontend/webv2/src/features/models/data/api.ts',
      'invokeai/frontend/webv2/src/features/models/data/modelsStore.ts',
    ],
    studioOwners: [
      'ModelRepository.publishVerifiedInstallation/setDefaultVersion',
      'ModelService.getCatalog/catalogFileStatus',
      'ProjectSession.create/save',
      'PresetService.create/update/get/list',
      'PresetManagerSession',
      'App presetModelHandoff/native WindowCloseDirtyGuard',
    ],
    note: 'Fresh Invoke model record/list/store callers retain backend-owned identities and distinguish unknown/error from loaded data. This harness adapts existing Studio closed fixture publication and actual Main catalog/preset/package consumers; it introduces no installer, scanner, queue or storage implementation.',
  },
  boundary: {
    actual: 'Two normal built app lifetimes; real renderer/preload/Main, SQLite PresetService, ModelRepository catalog, files, package writer/reader, exact-resource diagnostics, global Models menu, dirty Project history, retained Preset Manager DOM, and actual native Window close guard.',
    fixtures: 'Eight tiny authored catalog-only A/B checkpoint/LoRA/VAE/negative-embedding files are published while Main is physically closed; A is each library Default. B bytes are retained in owned rollback storage and their managed files are withdrawn before launch. Actual getCatalog returns expected SHA/status. Real IPC creates two source presets; one intentionally records the same nominal LoRA B IDs with a different immutable SHA. The closed .igs writer supplies exact B refs and seed 0. One UI Project prompt edit and one explicit UI Save Changes are declared writer actions.',
    syntheticControls: 'A captured actual Main getCatalog handler is observed and either has its unchanged real response held or rejects after its genuine read; exact handler restoration and in-flight completion are checked. Preset create/update handlers are transparent receipt observers only. DOM marker attributes measure retained nodes without replacing application state.',
    limits: 'Launching actor: 2 GiB, zero swap, 600s. Each actual native scope: 2 GiB, zero swap, 600s through the existing process-identity helper. Heavy runs stay serial.',
    negativeScope: 'No ML, SHARED runtime, worker, tensor, model-weight download, network install/repair, implicit preset replacement, Apply mutation, generic storage corruption or release qualification. Catalog-only bytes do not prove model loading or inference. Typed unit coverage owns the full diagnostic matrix; native UI samples checkpoint, LoRA, VAE and negative embedding.',
    cleanup: 'All owned model bytes are restored exactly, handlers restored, and owned dirty drafts/tabs explicitly discarded before ordinary close and physical-exit confirmation. This harness retains its payload for the root owner to dispose after recording dependencies; it never deletes another run or ordinary app data.',
  },
}
let application, window, database, fixture, sourcePreset, mismatchPreset, baseline, savedBytes
let presetRows, presetRecords, nativeChecks = [], probeInstalled = false, observerInstalled = false, flowOwner = null
const withdrawn = new Map()
const projectTitle = 'Native manager Models neighboring Project'
const presetName = 'Native manager exact resources'
const wrongShaName = 'Native manager same IDs wrong SHA'
const dirtyPrompt = 'Owned dirty Project prompt, {blue|red}, literal 日本語'
const editedDescription = 'Retained manager description before explicit Save Changes'
const categoryLabels = { checkpoint: 'Checkpoints', embedding: 'Embeddings', lora: 'LoRA', vae: 'VAE' }
const manager = () => window.getByRole('dialog', { name: 'Preset Manager', exact: true })
const models = () => window.getByRole('dialog', { name: 'Model Manager', exact: true })
const importDialog = () => window.getByRole('dialog', { name: 'Add from CivitAI URL', exact: true })
const guard = () => window.getByRole('dialog', { name: 'Unsaved preset changes', exact: true })
const footer = () => manager().getByLabel('Preset editor actions', { exact: true })
const nameInput = () => manager().getByRole('textbox', { name: 'Preset name', exact: true })
const descriptionInput = () => manager().getByRole('textbox', { name: 'Preset description', exact: true })
const action = (resource) => manager().getByRole('button', { name: `Open ${resource.name} in Models`, exact: true })
const closeManager = () => manager().getByRole('button', { name: 'Close Preset Manager', exact: true })
function persist() { writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }) }
function check(name, evidence = {}) { report.checks.push({ name, ...evidence }); persist(); console.log(`PASS ${name}`) }
persist()

async function prepare() {
  assert.equal(application, undefined, 'Fixture publication requires Main physically closed')
  database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
  const repository = new ModelRepository(database.db), resources = {}
  for (const [index, [kind, role]] of [
    ['checkpoint', 'checkpoint'], ['lora', 'LoRA'], ['vae', 'VAE'], ['embedding', 'negative'],
  ].entries()) {
    const pair = {}
    for (const suffix of ['A', 'B']) {
      const remote = 989_000 + index * 10 + (suffix === 'A' ? 1 : 2)
      const bytes = Buffer.from(`Owned native manager catalog-only ${kind} ${suffix}.`)
      const filename = `manager-${role.toLowerCase()}-${suffix.toLowerCase()}.safetensors`
      const managedPath = path.join(appData, 'models', filename)
      mkdirSync(path.dirname(managedPath), { recursive: true, mode: 0o700 })
      writeFileSync(managedPath, bytes, { mode: 0o600 })
      const name = `Manager ${role}`, versionName = `Exact ${suffix}`, sha256 = digest(bytes)
      const published = await repository.publishVerifiedInstallation({ primary: {
        file: { managedPath, originalFilename: filename, sha256, sizeBytes: bytes.length, verifiedAt: new Date().toISOString() },
        resource: { creator: 'Owned native fixture', displayName: name, previewUrl: null, source: { kind: 'civitai', modelId: 989_000 + index * 10 }, sourceMetadata: { fixture: true }, type: kind },
        version: { baseModelFamily: 'illustrious', format: 'safetensors', name: versionName, predictionType: kind === 'checkpoint' ? 'epsilon' : null, source: { kind: 'civitai', fileId: remote + 1000, versionId: remote, expectedSha256: sha256 }, sourceMetadata: { fixture: true, trainedWords: [`manager-${role.toLowerCase()}-${suffix.toLowerCase()}`] } },
      } })
      const backup = path.join(rollback, filename)
      copyFileSync(managedPath, backup)
      pair[suffix.toLowerCase()] = { ...published, name, kind, versionName, managedPath, backup, sha256, portable: {
        baseModelFamily: 'illustrious', civitaiFileId: remote + 1000, civitaiModelId: 989_000 + index * 10, civitaiVersionId: remote, displayName: name, fileSha256: sha256, kind, localModelId: published.resourceId, localVersionId: published.versionId, predictionType: kind === 'checkpoint' ? 'epsilon' : null, versionName,
      } }
    }
    assert.equal(pair.a.resourceId, pair.b.resourceId)
    await repository.setDefaultVersion(pair.a.resourceId, pair.a.versionId)
    resources[role] = pair
  }
  const packageDirectory = path.join(appData, 'workspaces/Uncategorized')
  mkdirSync(packageDirectory, { recursive: true, mode: 0o700 })
  const session = await ProjectSession.create(path.join(packageDirectory, `${projectTitle}.igs`), projectTitle, {
    placeholdersDir: path.resolve('dist/main/placeholders'), scratchDir: path.join(payload, 'closed-project-scratch'),
  })
  session.applyDocument({ ...session.document, generationDraft: {
    ...session.document.generationDraft,
    model: resources.checkpoint.b.portable,
    positivePrompt: { text: 'Saved manager neighboring prompt', embeddingRefs: [] },
    negativePrompt: { text: '<manager-negative-b>, saved negative', embeddingRefs: [{ token: '<manager-negative-b>', resource: resources.negative.b.portable }] },
    loras: [{ enabled: true, resource: resources.LoRA.b.portable, weight: -0.35 }],
    vae: resources.VAE.b.portable,
    seed: { policy: 'fixed', value: 0 },
  }, primaryBbox: { x: -32, y: 48, width: 768, height: 640 } })
  await session.save()
  const result = { resources, projectId: session.localRecoveryKey, packagePath: session.filePath, documentId: session.document.documentId }
  savedBytes = readFileSync(result.packagePath)
  for (const pair of Object.values(resources)) {
    const withheld = path.join(rollback, `withdrawn-${path.basename(pair.b.managedPath)}`)
    renameSync(pair.b.managedPath, withheld)
    withdrawn.set(pair.b.versionId, { resource: pair.b, withheld })
  }
  await database.close(); database = null
  report.fixture = result
  persist()
  return result
}
function restoreFile(resource) {
  const entry = withdrawn.get(resource.versionId)
  if (!entry) return
  assert.equal(digest(readFileSync(entry.withheld)), resource.sha256)
  assert.equal(digest(readFileSync(resource.backup)), resource.sha256)
  assert.equal(existsSync(resource.managedPath), false)
  copyFileSync(entry.withheld, resource.managedPath)
  assert.equal(digest(readFileSync(resource.managedPath)), resource.sha256)
  withdrawn.delete(resource.versionId)
  report.fileRestorations.push({ versionId: resource.versionId, path: resource.managedPath, sha256: resource.sha256, rollbackSha256: digest(readFileSync(entry.withheld)), exact: true, modelsVisible: application ? true : null })
  persist()
}
function assertFiles() {
  assert.equal(readFileSync(fixture.packagePath).equals(savedBytes), true, 'Saved .igs bytes changed')
  for (const pair of Object.values(fixture.resources)) for (const resource of Object.values(pair)) {
    assert.equal(digest(readFileSync(resource.backup)), resource.sha256)
    if (withdrawn.has(resource.versionId)) assert.equal(existsSync(resource.managedPath), false)
    else assert.equal(digest(readFileSync(resource.managedPath)), resource.sha256)
  }
}
async function bound(label) {
  const proof = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds: 480,
    execute: (file, args, options) => execute(file, args.map((value) => value === 'MemoryMax=12G' ? 'MemoryMax=2G' : value), options),
  })
  for (const group of proof.groups) assert.ok(BigInt(group.memoryMax) <= 2n * 1024n ** 3n, `Native/launcher group exceeds 2 GiB: ${group.group}`)
  nativeChecks.push(proof); report.resourceChecks.push({ label, ...proof }); persist()
}
async function launch(label) {
  const env = { ...process.env, NODE_ENV: 'test', CUDA_VISIBLE_DEVICES: '', XDG_CONFIG_HOME: path.join(payload, 'config'), XDG_DATA_HOME: path.join(payload, 'data') }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'IMAGEGEN_DEV_SERVER_URL', 'IMAGEGEN_TEST_IMAGE_WORKER']) delete env[key]
  nativeChecks = []
  application = await electron.launch({ args: ['--ozone-platform=x11', '.'], cwd: process.cwd(), env, timeout: 30_000 })
  await bound(`${label}-launch`)
  window = await isolateNativeSmokeWindow(application); window.setDefaultTimeout(10_000)
  window.on('pageerror', (error) => report.pageErrors.push(error.message))
  window.on('console', (message) => { if (message.text().includes('[Vue warn]')) report.vueWarnings.push(message.text()) })
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await window.waitForFunction(() => typeof window.api?.presets?.create === 'function')
  assert.equal((await api('runtime', 'getStatus')).kind, 'not-installed')
  database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
}
async function api(scope, method, ...args) {
  const result = await window.evaluate(({ scope, method, args }) => window.api[scope][method](...args), { scope, method, args })
  assert.equal(result.ok, true, JSON.stringify(result)); return result.value
}
async function presetSnapshot() { return await database.db.selectFrom('presets').selectAll().orderBy('id').execute() }
async function refreshPresetBaseline() {
  presetRows = await presetSnapshot()
  presetRecords = await Promise.all([sourcePreset, mismatchPreset].map((record) => api('presets', 'get', record.id, { includeDeleted: true })))
}
const projectState = (tab) => ({ acceptedResults: tab.acceptedResults, canRedo: tab.canRedo, canUndo: tab.canUndo, dirty: tab.dirty, documentId: tab.documentId, documentRevision: tab.documentRevision, generationDraft: tab.generationDraft, lastActualSeedSnapshot: tab.lastActualSeedSnapshot, layers: tab.layers, primaryBbox: tab.primaryBbox, title: tab.title })
async function project() { const result = await api('projects', 'open', fixture.projectId); assert.equal(result.kind, 'opened'); return result.tab }
async function unchanged({ projectOpen = true } = {}) {
  assertFiles()
  assert.deepEqual(await presetSnapshot(), presetRows)
  for (const record of presetRecords) assert.deepEqual(await api('presets', 'get', record.id, { includeDeleted: true }), record)
  if (projectOpen) assert.deepEqual(projectState(await project()), baseline)
}
async function tabs() { return await window.getByRole('tablist', { name: 'Open documents', exact: true }).getByRole('tab').evaluateAll((nodes) => nodes.map((node) => ({ label: node.getAttribute('aria-label'), selected: node.getAttribute('aria-selected') }))) }
async function frames() { await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))) }
async function globalModels() {
  await window.getByRole('button', { name: 'Models menu', exact: true }).click()
  await window.locator('.n-dropdown-option:visible').filter({ hasText: /^Manage Models$/ }).click()
  await expect(models()).toBeVisible(); await expect(manager()).toBeHidden()
  await expect(models().getByPlaceholder('Search installed models')).toBeVisible()
}
async function closeModels(mode = 'button') {
  if (mode === 'escape') await models().press('Escape')
  else await models().getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(models()).toBeHidden()
}
async function openSaved(record = sourcePreset) {
  await window.getByRole('button', { name: 'Project menu', exact: true }).click()
  await window.locator('.n-dropdown-option:visible').filter({ hasText: /^Presets$/ }).click()
  await expect(manager()).toBeVisible()
  await manager().getByRole('button', { name: `Select preset ${record.name}`, exact: true }).click()
  await expect(nameInput()).toHaveValue(record.name)
  flowOwner = 'manager'
}
async function expandAuthoringSections() {
  for (const [section, label] of [['guidance', 'Steps & CFG'], ['size', 'Size'], ['negativePrompt', 'Negative Prompt'], ['vae', 'VAE']]) {
    const item = manager().locator(`[data-preset-section="${section}"]`)
    if (!(await item.evaluate((node) => node.classList.contains('n-collapse-item--active')))) await item.getByText(label, { exact: true }).click()
    await expect(item).toHaveClass(/n-collapse-item--active/)
  }
}
async function markEditor() {
  const marker = randomUUID()
  await manager().evaluate((element, value) => {
    element.setAttribute('data-native-retained', value)
    for (const [index, node] of [...element.querySelectorAll('.payload-card input, .cm-content')].entries()) node.setAttribute('data-native-retained', `${value}:${index}`)
  }, marker)
  return marker
}
async function editorState() {
  // Visible is true during Naive's enter scale transition. Compare pane
  // geometry only after the modal reaches its settled presentation.
  await expect.poll(() => manager().evaluate((element) => {
    const style = getComputedStyle(element)
    return { opacity: style.opacity, transform: style.transform }
  })).toEqual({ opacity: '1', transform: 'none' })
  return await manager().evaluate((element) => ({
    marker: element.getAttribute('data-native-retained'),
    inputs: [...element.querySelectorAll('input, textarea')].map((node) => ({ label: node.getAttribute('aria-label'), value: node.value, marker: node.getAttribute('data-native-retained') })),
    selections: [...element.querySelectorAll('[role="checkbox"], [role="switch"], [aria-pressed]')].map((node) => ({ label: node.getAttribute('aria-label') ?? node.textContent.trim(), checked: node.getAttribute('aria-checked'), pressed: node.getAttribute('aria-pressed') })),
    comboboxes: [...element.querySelectorAll('[role="combobox"]')].map((node) => ({ label: node.getAttribute('aria-label'), text: node.textContent.trim() })),
    prompts: [...element.querySelectorAll('.cm-content')].map((node) => ({ label: node.getAttribute('aria-label'), marker: node.getAttribute('data-native-retained'), text: [...node.querySelectorAll('.cm-line')].map((line) => line.textContent).join('\n') })),
    sections: [...element.querySelectorAll('[data-preset-section]')].map((node) => ({ section: node.getAttribute('data-preset-section'), expanded: node.classList.contains('n-collapse-item--active') })),
    errors: [...element.querySelectorAll('.number-error, .n-form-item-feedback')].map((node) => node.textContent.trim()),
    filters: [...element.querySelectorAll('.filter-actions button, .manager-navigation button')].map((node) => ({ text: node.textContent.trim(), selected: node.classList.contains('n-button--secondary') })),
    split: ['Preset workflows', 'Preset list', 'Preset editor'].map((label) => {
      const node = element.querySelector(`[aria-label="${label}"]`)
      if (!node) throw new Error(`Missing retained split pane: ${label}`)
      return { label, width: Math.round(node.getBoundingClientRect().width) }
    }),
    draft: element.querySelector('[aria-label="Preset draft"]')?.textContent.trim() ?? null,
    source: element.querySelector('[aria-label="Source project"]')?.textContent.trim() ?? null,
  }))
}
async function resizeSplits() {
  const widths = () => manager().evaluate((element) => ['Preset workflows', 'Preset list'].map((label) => Math.round(element.querySelector(`[aria-label="${label}"]`).getBoundingClientRect().width)))
  const before = await widths()
  for (const selector of ['.manager-body > .n-split__resize-trigger-wrapper', '.manager-content-split > .n-split__resize-trigger-wrapper']) {
    const separator = await manager().locator(selector).boundingBox()
    assert.ok(separator)
    await window.mouse.move(separator.x + separator.width / 2, separator.y + 30)
    await window.mouse.down(); await window.mouse.move(separator.x + separator.width / 2 + 18, separator.y + 30, { steps: 6 }); await window.mouse.up()
  }
  const after = await widths()
  assert.notDeepEqual(after, before, 'Actual split drag must change at least one pane')
  report.resizedSplits = { before, after }; persist()
}
async function applyState(dialog) {
  return await dialog.locator('.payload-card').evaluate((element) => ({
    inputs: [...element.querySelectorAll('input')].map((node) => ({ label: node.getAttribute('aria-label'), value: node.value, disabled: node.disabled })),
    selections: [...element.querySelectorAll('[role="checkbox"]')].map((node) => ({ label: node.getAttribute('aria-label'), checked: node.getAttribute('aria-checked') })),
    prompts: [...element.querySelectorAll('.cm-content')].map((node) => ({ label: node.getAttribute('aria-label'), text: [...node.querySelectorAll('.cm-line')].map((line) => line.textContent).join('\n') })),
    sections: [...element.querySelectorAll('[data-preset-section]')].map((node) => ({ section: node.getAttribute('data-preset-section'), expanded: node.classList.contains('n-collapse-item--active') })),
  }))
}
async function exactCatalog(resource, status) {
  const item = (await api('models', 'getCatalog')).find((entry) => entry.id === resource.resourceId)
  assert.ok(item); assert.equal(item.resourceType, resource.kind)
  const pair = Object.values(fixture.resources).find((candidate) => candidate.a.resourceId === item.id)
  assert.equal(item.defaultVersionId, pair.a.versionId)
  const actual = item.versions.find((version) => version.id === resource.versionId)
  assert.ok(actual); assert.equal(actual.sha256, resource.sha256); assert.equal(actual.fileStatus, status)
  assert.equal(item.versions.find((version) => version.id === pair.a.versionId).fileStatus, 'ready')
  return { item, version: actual }
}
async function focusedModels(resource, { wrongSha = false } = {}) {
  await expect(models()).toBeVisible(); await expect(manager()).toBeHidden()
  await expect(models().getByRole('complementary', { name: 'Model filters', exact: true }).getByRole('button', { name: new RegExp(`^${categoryLabels[resource.kind]} `) })).toHaveAttribute('aria-pressed', 'true')
  await expect(models().getByPlaceholder('Search installed models')).toHaveValue('')
  await expect(models().getByRole('complementary', { name: 'Model details', exact: true }).locator('h2')).toHaveText(resource.name)
  await expect(models()).toContainText('Preset draft')
  await expect(models()).toContainText('unavailable')
  await expect(models().locator('.version-row--project')).toHaveCount(0)
  await expect(models().getByText('Referenced by Preset draft', { exact: true })).toHaveCount(0)
  const rows = models().locator('.version-row')
  await expect(rows.filter({ hasText: 'Exact A' })).toContainText('Default')
  if (wrongSha) {
    await expect(rows.filter({ hasText: 'Exact B' })).toContainText('ready')
    await expect(models()).toContainText('does not match')
  }
  await expect(window.locator('[role="dialog"]:visible')).toHaveCount(1)
}
async function roundtrip(resource, { mode = 'button', repaired = false, beforeClose } = {}) {
  const before = await editorState(), key = await action(resource).getAttribute('data-preset-manager-model-action')
  assert.ok(key, 'Diagnostic must carry stable exact-resource action identity')
  await action(resource).focus(); await action(resource).click(); await focusedModels(resource)
  if (beforeClose) await beforeClose()
  await closeModels(mode); await expect(manager()).toBeVisible()
  await expect.poll(editorState).toEqual(before)
  if (repaired) {
    await expect(action(resource)).toHaveCount(0); await expect(closeManager()).toBeFocused()
  } else {
    await expect(action(resource)).toHaveAttribute('data-preset-manager-model-action', key)
    await expect(action(resource)).toBeFocused()
  }
  await unchanged()
  return { key, marker: before.marker, mode, repaired }
}
async function screenshot(label, dialog, width, height) {
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width, height })
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
  await expect(dialog).toBeVisible(); await frames()
  const geometry = await dialog.evaluate((element) => {
    const value = element.getBoundingClientRect()
    return { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom, viewport: [innerWidth, innerHeight], overflow: document.documentElement.scrollWidth > innerWidth, primaryButtons: [...element.querySelectorAll('button.n-button--primary-type')].map((button) => button.textContent.trim()) }
  })
  assert.equal(geometry.overflow, false); assert.ok(geometry.x >= -1 && geometry.y >= -1)
  assert.ok(geometry.right <= width + 1 && geometry.bottom <= height + 1)
  const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-${label}-${width}x${height}.png`)
  assert.equal(existsSync(file), false)
  await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push({ label, path: file, sha256: digest(readFileSync(file)), geometry }); persist()
}

async function observePresetWrites() {
  assert.equal(observerInstalled, false)
  await application.evaluate(({ ipcMain }) => {
    const channels = ['presets:create', 'presets:update'], originals = new Map(), calls = []
    if (globalThis.igsManagerModelsWrites) throw new Error('Owned preset observer already exists')
    for (const channel of channels) {
      const original = ipcMain._invokeHandlers.get(channel)
      if (typeof original !== 'function') throw new Error(`Actual handler missing: ${channel}`)
      originals.set(channel, original); ipcMain.removeHandler(channel)
      ipcMain.handle(channel, async (event, ...args) => {
        const call = { channel, id: args[0]?.name ?? args[0], completed: false, ok: null }
        calls.push(call)
        try { const result = await original(event, ...args); call.ok = result.ok; return result }
        finally { call.completed = true }
      })
    }
    globalThis.igsManagerModelsWrites = { originals, calls }
  })
  observerInstalled = true
}
async function writes() { return await application.evaluate(() => globalThis.igsManagerModelsWrites.calls) }
async function restoreWriteObserver() {
  if (!observerInstalled || !application) return
  const evidence = await application.evaluate(({ ipcMain }) => {
    const owned = globalThis.igsManagerModelsWrites
    if (!owned || owned.calls.some((call) => !call.completed)) throw new Error('Preset observer still has active calls')
    const restored = []
    for (const [channel, original] of owned.originals) { ipcMain.removeHandler(channel); ipcMain.handle(channel, original); restored.push({ channel, exact: ipcMain._invokeHandlers.get(channel) === original }) }
    delete globalThis.igsManagerModelsWrites
    return { restored, calls: owned.calls }
  })
  assert.ok(evidence.restored.every((entry) => entry.exact)); report.handlerRestorations.push({ kind: 'preset-write-observer', ...evidence }); observerInstalled = false; persist()
}
async function installCatalogProbe(mode) {
  assert.equal(probeInstalled, false); assert.ok(['hold', 'error'].includes(mode))
  await application.evaluate(({ ipcMain }, selectedMode) => {
    const channel = 'models:get-catalog', original = ipcMain._invokeHandlers.get(channel)
    if (typeof original !== 'function' || globalThis.igsManagerModelsCatalog) throw new Error('Actual catalog handler unavailable or probe already installed')
    const owned = { original, mode: selectedMode, calls: 0, inFlight: 0, intercepted: false, completed: false, delivered: false, originalOk: false, identities: [], release: null }
    const held = new Promise((resolve) => { owned.release = resolve })
    globalThis.igsManagerModelsCatalog = owned
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      ++owned.calls; ++owned.inFlight
      const intercept = !owned.intercepted; if (intercept) owned.intercepted = true
      try {
        const result = await original(event, ...args)
        if (intercept) {
          owned.completed = true; owned.originalOk = result.ok === true
          owned.identities = result.ok ? result.value.map((item) => ({ id: item.id, versions: item.versions.map((version) => ({ id: version.id, sha256: version.sha256, fileStatus: version.fileStatus })) })) : []
          if (owned.mode === 'hold') await held
          owned.delivered = true
          if (owned.mode === 'error') throw new Error('Owned manager Models UI catalog transport rejection after genuine Main read')
        }
        return result
      } finally { --owned.inFlight }
    })
  }, mode)
  probeInstalled = true
}
async function probeState() {
  return await application.evaluate(() => {
    const { mode, calls, inFlight, intercepted, completed, delivered, originalOk, identities } = globalThis.igsManagerModelsCatalog
    return { mode, calls, inFlight, intercepted, completed, delivered, originalOk, identities }
  })
}
async function restoreCatalogProbe() {
  if (!probeInstalled || !application) return
  const restored = await application.evaluate(({ ipcMain }) => {
    const owned = globalThis.igsManagerModelsCatalog, channel = 'models:get-catalog'
    if (!owned) throw new Error('Owned catalog probe missing at restoration')
    ipcMain.removeHandler(channel); ipcMain.handle(channel, owned.original); owned.release()
    return ipcMain._invokeHandlers.get(channel) === owned.original
  })
  assert.equal(restored, true)
  await expect.poll(async () => (await probeState()).inFlight).toBe(0)
  const evidence = await probeState()
  if (evidence.intercepted) { assert.equal(evidence.completed, true); assert.equal(evidence.delivered, true); assert.equal(evidence.originalOk, true) }
  report.catalogProbes.push({ ...evidence, restoredExactly: restored })
  await application.evaluate(() => { delete globalThis.igsManagerModelsCatalog })
  probeInstalled = false; persist()
}
async function discardManager() {
  if (!window || window.isClosed()) return
  // Failure cleanup may be entered precisely because the nested import covered the
  // real close guard. Activate only its actual owned Close control, then cancel
  // the pending native close before ordinary draft/tab disposal. This is cleanup,
  // never the user-path stacking assertion above.
  if (await importDialog().isVisible()) { await importDialog().getByRole('button', { name: 'Close import dialog', exact: true }).evaluate((button) => button.click()); await expect(importDialog()).toBeHidden() }
  if (await guard().isVisible()) { await guard().getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(guard()).toBeHidden() }
  if (await models().isVisible()) await closeModels()
  if (flowOwner === 'apply') {
    const dialog = window.getByRole('dialog', { name: /^Apply Preset: / })
    await expect(dialog).toBeVisible(); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(dialog).toBeHidden(); flowOwner = null
  }
  if (flowOwner === 'manager') await expect(manager()).toBeVisible()
  if (await manager().isVisible()) {
    await closeManager().click()
    await expect.poll(async () => (await guard().isVisible()) ? 'guard' : (await manager().isVisible()) ? 'pending' : 'closed').not.toBe('pending')
    if (await guard().isVisible()) await guard().getByRole('button', { name: /^(Discard Draft|Discard)$/ }).click()
    await expect(manager()).toBeHidden()
    flowOwner = null
  }
}
async function closeNative(label) {
  if (!application) return
  await restoreCatalogProbe(); await discardManager(); await restoreWriteObserver()
  if (window && !window.isClosed()) {
    const tab = window.getByRole('tab', { name: projectTitle, exact: true })
    if (await tab.count()) {
      await window.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
      const discard = window.getByRole('button', { name: 'Discard Changes', exact: true })
      await expect.poll(async () => (await tab.count()) === 0 ? 'closed' : (await discard.isVisible()) ? 'guard' : 'pending').not.toBe('pending')
      if (await tab.count()) await discard.click()
      await expect(tab).toHaveCount(0)
    }
  }
  await bound(`${label}-before-close`)
  if (database) { await database.close(); database = null }
  await application.close()
  report.nativeClosures.push({ label, ...(await confirmQualificationProcessExit(nativeChecks)) })
  application = null; window = null; persist()
}

try {
  fixture = await prepare()
  await launch('manager-navigation')
  const refs = fixture.resources
  sourcePreset = await api('presets', 'create', {
    name: presetName, description: 'Saved manager source remains exact until explicit Save Changes', favorite: true, tags: ['manager-models-native'], workflow: 'textToImage',
    payload: { prompt: { text: 'Saved literal source portrait', embeddingRefs: [] }, negativePrompt: { text: '<manager-negative-b>, saved negative', embeddingRefs: [{ token: '<manager-negative-b>', resource: refs.negative.b.portable }] }, model: refs.checkpoint.b.portable, loras: [{ enabled: true, resource: refs.LoRA.b.portable, weight: -0.35 }], vae: refs.VAE.b.portable, guidance: { steps: 24, cfgScale: 6.5 }, size: { width: 768, height: 640 }, seed: { policy: 'fixed', value: 77 } },
  })
  const wrongRef = { ...refs.LoRA.b.portable, fileSha256: 'f'.repeat(64) }
  assert.notEqual(wrongRef.fileSha256, refs.LoRA.b.sha256)
  mismatchPreset = await api('presets', 'create', { name: wrongShaName, description: 'Same nominal IDs, different immutable file SHA', favorite: false, tags: [], workflow: 'textToImage', payload: { loras: [{ enabled: true, resource: wrongRef, weight: 0.5 }] } })
  await refreshPresetBaseline()
  const initialCatalog = []
  for (const pair of Object.values(refs)) initialCatalog.push(await exactCatalog(pair.b, 'missing'))
  assert.deepEqual(await tabs(), [{ label: 'Home', selected: 'true' }])
  await unchanged({ projectOpen: false })
  check('Real Main catalog reports exact missing B files and ready/default A siblings; IPC-created preset rows and saved .igs bytes form the immutable navigation baseline', { catalog: initialCatalog, presetIds: presetRecords.map((record) => record.id), runtime: 'not-installed' })

  const homeTabs = await tabs()
  await globalModels(); await screenshot('global-models-from-home', models(), 1440, 900)
  await closeModels(); await frames()
  assert.deepEqual(await tabs(), homeTabs); await unchanged({ projectOpen: false })
  check('Global Models → Manage Models opens canonical Model Manager from Home without a document and returns without creating tabs, presets or changing package bytes')

  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: projectTitle, exact: true })).toBeVisible()
  await window.getByRole('textbox', { name: 'Positive prompt', exact: true }).fill(dirtyPrompt)
  await window.getByRole('heading', { name: 'Current Canvas', exact: true }).click()
  await expect.poll(async () => (await project()).generationDraft.positivePrompt.text).toBe(dirtyPrompt)
  await expect.poll(async () => (await project()).canUndo).toBe(true)
  baseline = projectState(await project()); assert.equal(baseline.dirty, true)
  const dirtyTabs = await tabs()
  await globalModels(); await closeModels('escape'); await frames()
  assert.deepEqual(await tabs(), dirtyTabs); await unchanged()
  check('Global Models from a dirty Project preserves active tabs, exact draft/history/seed/layers/bbox and saved .igs bytes after Escape return')

  await observePresetWrites(); await openSaved()
  await expandAuthoringSections()
  await manager().getByRole('textbox', { name: 'Search presets', exact: true }).fill('Native manager exact')
  await manager().getByRole('button', { name: 'Favorites', exact: true }).click()
  await resizeSplits()
  await descriptionInput().fill(editedDescription)
  await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeEnabled()
  await markEditor()
  const validDraft = await editorState(), writeCount = (await writes()).length
  await action(refs.checkpoint.b).click(); await focusedModels(refs.checkpoint.b)
  await models().getByPlaceholder('Search installed models').focus(); await window.keyboard.press('Control+s')
  await frames(); await api('presets', 'get', sourcePreset.id)
  assert.equal((await writes()).length, writeCount)
  await unchanged(); await closeModels(); await expect(manager()).toBeVisible()
  await expect.poll(editorState).toEqual(validDraft); await expect(action(refs.checkpoint.b)).toBeFocused()
  check('A valid dirty saved editor suspends into Models; Ctrl+S with Models input focused sends zero preset writes and returns the same editor DOM, filters, Included state, expansion and values')

  await nameInput().fill('')
  await manager().getByLabel('Preset steps', { exact: true }).fill('-')
  await manager().getByLabel('Preset width', { exact: true }).fill('')
  await descriptionInput().focus()
  await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
  await expect(manager().locator('[data-preset-manager-model-action]')).toHaveCount(4)
  for (const pair of Object.values(refs)) await expect(action(pair.b)).toBeVisible()
  await expect(manager().getByLabel('Preset steps', { exact: true })).toHaveValue('-')
  await expect(manager().getByLabel('Preset width', { exact: true })).toHaveValue('')
  await screenshot('manager-invalid-retained-diagnostics', manager(), 1440, 900)
  await unchanged()
  check('Empty unrelated Name and invalid included raw Steps/Width keep all four current-draft typed diagnostics visible while Save remains disabled; validation does not erase exact-resource actions')

  check('Negative Prompt embedding diagnostic focuses Embeddings and returns on Escape with stable exact action focus and unchanged invalid raw fields/source/Project', await roundtrip(refs.negative.b, { mode: 'escape' }))

  const beforeHeld = await editorState()
  await action(refs.LoRA.b).click(); await focusedModels(refs.LoRA.b)
  await installCatalogProbe('hold'); await closeModels()
  await expect.poll(async () => (await probeState()).completed).toBe(true)
  const held = await probeState(); assert.equal(held.originalOk, true); assert.equal(held.delivered, false)
  await frames(); await expect(manager()).toBeHidden(); await expect(models()).toBeHidden()
  await restoreCatalogProbe(); await expect(manager()).toBeVisible()
  await expect.poll(editorState).toEqual(beforeHeld); await expect(action(refs.LoRA.b)).toBeFocused(); await unchanged()
  check('Models return waits for the actual held Main catalog read to settle before revealing the retained draft; delayed unchanged reply preserves raw values and precise LoRA action focus', { held, restored: report.catalogProbes.at(-1) })

  const beforeNewest = await editorState()
  await action(refs.LoRA.b).click(); await focusedModels(refs.LoRA.b)
  await installCatalogProbe('hold'); await closeModels()
  await expect.poll(async () => (await probeState()).completed).toBe(true)
  await expect(manager()).toBeHidden()
  const notification = { id: 'owned-preset-manager-ui-refresh', modelName: 'UI read control only', versionName: 'No actual installation', bytesDownloaded: 0, totalBytes: 0, error: null, status: 'completed' }
  await application.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('models:install-changed', value), notification)
  await expect.poll(async () => (await probeState()).calls).toBeGreaterThan(1)
  await expect(manager()).toBeVisible()
  const newest = await probeState(); assert.equal(newest.delivered, false, 'The older read remains held while a newer real Main read settles')
  await expect.poll(editorState).toEqual(beforeNewest); await expect(action(refs.LoRA.b)).toBeFocused()
  await restoreCatalogProbe(); await expect.poll(editorState).toEqual(beforeNewest); await unchanged()
  check('A typed completion notification allows the newer actual Main catalog read to settle the handoff while an older read remains held; late delivery keeps the same draft and exact focus', { newest, notification, actualInstallClaimed: false, restored: report.catalogProbes.at(-1) })

  const beforeError = await editorState()
  await action(refs.VAE.b).click(); await focusedModels(refs.VAE.b)
  await installCatalogProbe('error'); await closeModels()
  await expect(manager()).toBeVisible(); await expect(manager()).toContainText('Resource catalog is unavailable. Saved references remain unchanged.')
  await expect(manager().getByRole('button', { name: 'Needs Attention', exact: true })).toBeDisabled()
  await expect.poll(editorState).toEqual(beforeError)
  await restoreCatalogProbe(); await unchanged()
  await action(refs.VAE.b).click(); await focusedModels(refs.VAE.b); await closeModels('escape')
  await expect(manager()).toBeVisible(); await expect(manager()).not.toContainText('Resource catalog is unavailable.')
  await expect.poll(editorState).toEqual(beforeError); await unchanged()
  check('Controlled transport rejection after a genuine Main read returns the same invalid draft with an explicit unavailable-catalog warning; a normal exact VAE retry clears it without replacing references', { errorControl: report.catalogProbes.at(-1) })

  const repaired = await roundtrip(refs.checkpoint.b, { repaired: true, beforeClose: async () => {
    await screenshot('models-exact-missing-checkpoint', models(), 900, 620)
    await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width: 1440, height: 900 })
    await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([1440, 900])
    restoreFile(refs.checkpoint.b); await exactCatalog(refs.checkpoint.b, 'ready')
  } })
  check('Restoring the exact owned checkpoint B bytes while Models is open resolves that diagnostic on fresh Main return and focuses Close Preset Manager without choosing Default A', repaired)

  await nameInput().fill(presetName)
  await manager().getByLabel('Preset steps', { exact: true }).fill('24')
  await manager().getByLabel('Preset width', { exact: true }).fill('768')
  await descriptionInput().focus()
  await expect(footer().getByRole('button', { name: 'Save Changes', exact: true })).toBeEnabled()
  await footer().getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(footer().getByText('Saved', { exact: true })).toBeVisible()
  const savedSource = await api('presets', 'get', sourcePreset.id)
  assert.equal(savedSource.description, editedDescription); assert.deepEqual(savedSource.payload, sourcePreset.payload)
  assert.equal((await writes()).length, writeCount + 1); assert.equal((await writes()).at(-1).channel, 'presets:update')
  sourcePreset = savedSource; await refreshPresetBaseline(); await unchanged(); await closeManager().click(); await expect(manager()).toBeHidden(); flowOwner = null
  check('After return, only explicit UI Save Changes updates the retained saved editor once through actual Main/SQLite; exact copied resource payload and neighboring Project/package remain unchanged', { writer: (await writes()).at(-1), savedId: sourcePreset.id })

  await openSaved(mismatchPreset); await markEditor()
  await action(refs.LoRA.b).click(); await focusedModels(refs.LoRA.b)
  restoreFile(refs.LoRA.b); await exactCatalog(refs.LoRA.b, 'ready'); await closeModels(); await expect(manager()).toBeVisible()
  const wrongDraft = await editorState()
  await action(refs.LoRA.b).click(); await focusedModels(refs.LoRA.b, { wrongSha: true })
  await closeModels('escape'); await expect(manager()).toBeVisible(); await expect.poll(editorState).toEqual(wrongDraft)
  await expect(action(refs.LoRA.b)).toBeFocused(); await unchanged(); await closeManager().click(); await expect(manager()).toBeHidden(); flowOwner = null
  check('Known wrong SHA remains unavailable when actual ready B has identical nominal IDs; canonical Models shows Default A and ready B without a selected-for-draft row, replacement or preset write', { expectedSha256: wrongRef.fileSha256, actualSha256: refs.LoRA.b.sha256, sameVersionId: refs.LoRA.b.versionId })

  await window.getByRole('button', { name: 'Apply preset', exact: true }).click()
  await window.getByRole('textbox', { name: 'Search presets to apply', exact: true }).fill(sourcePreset.name)
  await window.getByRole('button', { name: `Choose preset ${sourcePreset.name}`, exact: true }).click()
  const applyDialog = window.getByRole('dialog', { name: `Apply Preset: ${sourcePreset.name}`, exact: true })
  await expect(applyDialog).toBeVisible()
  flowOwner = 'apply'
  await applyDialog.getByRole('button', { name: 'Expand all', exact: true }).click()
  await applyDialog.getByRole('textbox', { name: 'Preset prompt', exact: true }).fill('Neighbor Apply edited literal prompt, (soft light:1.3)')
  await applyDialog.getByLabel('Preset steps', { exact: true }).fill('-')
  await applyDialog.getByRole('checkbox', { name: 'Apply Steps & CFG', exact: true }).uncheck()
  const applyBefore = await applyState(applyDialog)
  const applyAction = applyDialog.getByRole('button', { name: `Open ${refs.negative.b.name} in Models`, exact: true })
  const applyKey = await applyAction.getAttribute('data-preset-model-action')
  assert.ok(applyKey)
  await applyAction.click(); await expect(models()).toBeVisible(); await expect(applyDialog).toBeHidden()
  await expect(models()).toContainText('The Apply selection is unchanged.')
  await expect(models()).not.toContainText('The Preset draft is unchanged.')
  await expect(models().getByRole('complementary', { name: 'Model filters', exact: true }).getByRole('button', { name: /^Embeddings / })).toHaveAttribute('aria-pressed', 'true')
  await expect(models().getByRole('complementary', { name: 'Model details', exact: true }).locator('h2')).toHaveText(refs.negative.b.name)
  await expect(window.locator('[role="dialog"]:visible')).toHaveCount(1)
  await closeModels('escape'); await expect(applyDialog).toBeVisible()
  await expect.poll(() => applyState(applyDialog)).toEqual(applyBefore)
  await expect(applyAction).toHaveAttribute('data-preset-model-action', applyKey); await expect(applyAction).toBeFocused()
  await unchanged(); await applyDialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(applyDialog).toBeHidden(); flowOwner = null
  check('Existing Project Apply owner still enters exact Embeddings Models with its original Apply wording and returns its edited prompt, selection, excluded invalid raw Steps and action focus without applying or changing source/Project')

  await window.getByRole('button', { name: 'Save Current as Preset', exact: true }).click()
  await expect(manager()).toBeVisible()
  flowOwner = 'manager'
  await expect(manager().getByRole('article', { name: 'Preset draft', exact: true })).toBeVisible()
  await expect(manager().getByRole('alert', { name: 'Source project', exact: true })).toContainText(projectTitle)
  await expect(manager().getByRole('checkbox', { name: 'Include Seed', exact: true })).not.toBeChecked()
  await nameInput().fill('Owned unsaved source-create Models draft')
  await expandAuthoringSections()
  await manager().getByLabel('Preset steps', { exact: true }).fill('-')
  await descriptionInput().focus(); await markEditor()
  const createDraft = await editorState(), beforeCreateWrites = (await writes()).length
  await roundtrip(refs.negative.b, { mode: 'escape' })
  await expect.poll(editorState).toEqual(createDraft)
  assert.equal((await writes()).length, beforeCreateWrites); await unchanged()
  check('Real Save Current create intent retains its source banner, pinned Draft, excluded Seed, exact negative sidecar, validation and actual editor DOM across Models without allocating a preset record')

  await action(refs.negative.b).click(); await focusedModels(refs.negative.b)
  await models().getByRole('button', { name: 'Add from CivitAI URL', exact: true }).first().click()
  await expect(importDialog()).toBeVisible()
  const ownedWindowId = await application.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows(); if (windows.length !== 1) throw new Error('Expected one owned native window')
    windows[0].close(); return windows[0].id
  })
  await expect(guard()).toBeVisible()
  await expect(guard()).toHaveCSS('transform', 'none')
  const guardStacking = await guard().evaluate((element) => {
    const rect = element.getBoundingClientRect(), target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return { ownCenterReceivesInput: !!target && element.contains(target), topDialog: target?.closest('[role="dialog"]')?.getAttribute('aria-label') ?? null,
      visibleDialogs: [...document.querySelectorAll('[role="dialog"]')].filter((node) => node.getBoundingClientRect().width > 0).map((node) => ({ name: node.getAttribute('aria-label') ?? node.getAttribute('aria-labelledby'), containerZIndex: getComputedStyle(node.closest('.n-modal-container') ?? node).zIndex })) }
  })
  report.dirtyGuardStacking = guardStacking; persist()
  assert.equal(guardStacking.ownCenterReceivesInput, true, JSON.stringify(guardStacking))
  await guard().getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(guard()).toBeHidden()
  const liveWindow = await application.evaluate(({ BrowserWindow }, id) => {
    const nativeWindow = BrowserWindow.fromId(id); return nativeWindow ? { id: nativeWindow.id, destroyed: nativeWindow.isDestroyed() } : null
  }, ownedWindowId)
  assert.deepEqual(liveWindow, { id: ownedWindowId, destroyed: false })
  await expect(importDialog()).toBeVisible()
  await importDialog().getByRole('button', { name: 'Close import dialog', exact: true }).click(); await expect(importDialog()).toBeHidden()
  if (await models().isVisible()) await closeModels()
  await expect(manager()).toBeVisible(); await expect.poll(editorState).toEqual(createDraft)
  assert.equal((await writes()).length, beforeCreateWrites); await unchanged()
  await closeManager().click(); await expect(guard()).toBeVisible()
  await guard().getByRole('button', { name: 'Discard Draft', exact: true }).click(); await expect(manager()).toBeHidden(); flowOwner = null
  await frames(); await expect(models()).toBeHidden(); await expect(manager()).toBeHidden()
  await unchanged(); await closeNative('manager-navigation-normal')
  check('Actual native Window close with Models nested Add from CivitAI URL open puts the real dirty-preset guard above both dialogs; Cancel retains the physical window and source draft, explicit import Close/Models Close return it, and Discard Draft writes nothing', { ownedWindowId, liveWindow, guardStacking })

  // Repair remaining catalog-only fixture files only after the previous Main is physically gone.
  assert.equal(application, null); assert.equal(report.nativeClosures.at(-1).confirmed, true)
  for (const pair of Object.values(refs)) restoreFile(pair.b)
  await launch('readback')
  await unchanged({ projectOpen: false })
  for (const pair of Object.values(refs)) await exactCatalog(pair.b, 'ready')
  await openSaved(sourcePreset)
  await expect(descriptionInput()).toHaveValue(editedDescription)
  await expect(manager().locator('[data-preset-manager-model-action]')).toHaveCount(0)
  await closeManager().click(); await expect(manager()).toBeHidden(); flowOwner = null
  await expect(models()).toBeHidden(); assert.deepEqual(await tabs(), [{ label: 'Home', selected: 'true' }])
  assert.deepEqual((await readIgsPackage(fixture.packagePath)).project.generationDraft.positivePrompt.text, 'Saved manager neighboring prompt')
  assert.deepEqual(hashFiles(sourceFiles), report.sourceSha256); assert.deepEqual(hashFiles(bundleFiles), report.bundleSha256)
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors)); assert.equal(report.vueWarnings.length, 0, JSON.stringify(report.vueWarnings))
  await closeNative('readback-normal'); assertFiles()
  assert.equal(withdrawn.size, 0); assert.equal(report.nativeClosures.length, 2); assert.equal(report.screenshots.length, 3)
  assert.equal(report.catalogProbes.length, 3); assert.equal(report.handlerRestorations.length, 1)
  report.finalState = { normalPhysicalLifetimes: 2, allOwnedModelAndRollbackBytesExact: true, packageBytesExact: true, sourceAndBundlesUnchanged: true, exactMainHandlersRestored: true, noInferenceClaim: true }
  check('Second physical app lifetime reads the single explicit saved edit through real PresetService/SQLite, sees all restored exact files ready, preserves saved .igs bytes and closes normally with source/bundle/handler restoration proof', report.finalState)
  assert.equal(report.checks.length, 16); report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'; report.error = error.stack ?? String(error)
  if (window && !window.isClosed()) try {
    const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-failure.png`)
    if (!existsSync(file)) await window.screenshot({ path: file, animations: 'disabled' })
    report.failureScreenshot = { path: file, sha256: digest(readFileSync(file)) }
  } catch (captureError) { report.failureScreenshotError = String(captureError) }
  throw error
} finally {
  try {
    await closeNative('failure-cleanup-normal')
    if (database) { await database.close(); database = null }
    if (fixture) { for (const pair of Object.values(fixture.resources)) restoreFile(pair.b); assertFiles() }
  } catch (closeError) {
    report.outcome = 'failed'; report.closeError = closeError.stack ?? String(closeError); process.exitCode = 1
  }
  report.finishedAt = new Date().toISOString(); persist()
}
