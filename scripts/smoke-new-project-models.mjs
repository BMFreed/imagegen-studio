/** Finite built New Project → exact Models → retained editor qualification. No ML/install. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, realpathSync, renameSync, writeFileSync,
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
import { boundQualificationProcess, confirmQualificationProcessExit } from './qualification-resource-limits.mjs'

assert.equal(process.argv.length, 4, 'Use --report-file ABSOLUTE_NEW_OWNED_REPORT')
assert.equal(process.argv[2], '--report-file')
const reportFile = process.argv[3]
assert.ok(path.isAbsolute(reportFile) && path.resolve(reportFile) === reportFile)
assert.equal(existsSync(reportFile), false, 'Report destination must be new')
const evidenceRoot = path.dirname(reportFile)
const relativeEvidence = path.relative(path.join(os.homedir(), '.codex/artifacts/imagegen-studio'), evidenceRoot)
assert.ok(relativeEvidence && !relativeEvidence.startsWith('..') && !path.isAbsolute(relativeEvidence))
assert.equal(realpathSync(evidenceRoot), evidenceRoot)
assert.ok(lstatSync(evidenceRoot).isDirectory() && !lstatSync(evidenceRoot).isSymbolicLink())

// The root actor inventories artifacts and supplies a 2 GiB/zero-swap/600s launcher guard.
// Actual Electron groups are independently verified by the existing identity helper below.
const payload = mkdtempSync(path.join(evidenceRoot, 'native-new-project-models-'))
const appData = path.join(payload, 'data/imagegen-studio')
const rollback = path.join(payload, 'original-model-bytes')
mkdirSync(appData, { recursive: true, mode: 0o700 })
mkdirSync(rollback, { recursive: true, mode: 0o700 })
const execute = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashFiles = (files) => Object.fromEntries(files.map((file) => [file, digest(readFileSync(file))]))
const sourceFiles = [
  'scripts/smoke-new-project-models.mjs', 'scripts/native-smoke-window.mjs',
  'scripts/qualification-resource-limits.mjs', 'src/renderer/App.vue',
  'src/renderer/components/AppChrome.vue', 'src/renderer/components/HomeView.vue',
  'src/renderer/components/NewProjectModal.vue', 'src/renderer/components/new-project-preset-draft.ts',
  'src/renderer/components/PresetManager.vue', 'src/renderer/components/preset-manager-session.ts',
  'src/renderer/components/PresetPayloadEditor.vue', 'src/renderer/components/PresetNumberInput.vue',
  'src/renderer/components/PlainPromptEditor.vue', 'src/renderer/components/ModelManager.vue',
  'src/renderer/components/preset-editor.ts', 'src/renderer/components/preset-model-handoff.ts',
  'src/renderer/components/model-manager-focus.ts', 'src/renderer/components/model-manager-read-guard.ts',
  'src/renderer/components/project-model-picker.ts', 'src/renderer/components/project-workspace-destinations.ts',
  'src/main/index.ts', 'src/preload/index.ts', 'src/shared/api.ts', 'src/shared/window-close.ts',
  'src/shared/presets/preset-schema.ts', 'src/shared/presets/preset-application.ts',
  'src/shared/projects/project-create.ts', 'src/shared/projects/resource-identity.ts',
  'src/main/models/model-repository.ts', 'src/main/models/model-service.ts',
  'src/main/presets/preset-service.ts', 'src/main/presets/preset-repository.ts',
  'src/main/presets/preset-ipc.ts', 'src/main/projects/project-service.ts',
  'src/main/projects/project-session.ts', 'src/main/projects/igs-package.ts',
]
const bundleFiles = [
  'dist/main/main.cjs', 'dist/preload/preload.cjs', 'dist/renderer/index.html',
  ...readdirSync('dist/renderer/assets').filter((name) => /\.(?:js|css)$/.test(name)).map((name) => `dist/renderer/assets/${name}`),
]
assert.equal(bundleFiles.length, 5, 'Freeze exactly the five built delivery members')
const report = {
  outcome: 'running', startedAt: new Date().toISOString(), payloads: [payload],
  checks: [], screenshots: [], nativeClosures: [], resourceChecks: [], catalogProbes: [],
  fileRestorations: [], pageErrors: [], vueWarnings: [],
  sourceSha256: hashFiles(sourceFiles), bundleSha256: hashFiles(bundleFiles),
  finiteScope: { checks: 14, normalPhysicalLifetimes: 2, screenshots: 3, catalogOnlyFiles: 8, sourcePresets: 2 },
  sourceBasis: {
    baseRevision: 'a5a9fa90a47201469075af7644c054d1ba37f0ac',
    invokeRevision: '4875d96531ca6712b288f6e660fcbb34143408c1',
    invokePaths: ['invokeai/app/api/routers/model_manager.py', 'invokeai/app/services/model_records/model_records_sql.py', 'invokeai/frontend/webv2/src/features/models/data/api.ts', 'invokeai/frontend/webv2/src/features/models/data/modelsStore.ts'],
    studioOwners: ['ModelRepository.publishVerifiedInstallation/setDefaultVersion', 'ModelService.getCatalog/catalogFileStatus', 'PresetService.create/get', 'ProjectSession.create/save', 'ProjectService.create/open', 'App tagged presetModelHandoff/current catalog request', 'NewProjectModal detached editor', 'native WindowCloseDirtyGuard'],
    note: 'Current Invoke model record/list/store callers preserve backend-owned identity and loaded/error distinctions. This harness reuses the existing closed catalog fixture, genuine Main catalog probes and package owners from smoke-preset-manager-models and smoke-new-project-preset; no new queue, identity, acceptance or storage implementation.',
  },
  boundary: {
    actual: 'Built renderer/preload/Main, SQLite presets/catalog/index, managed files, .igs writer/reader, Home New Project UI, five selected-section exact-resource diagnostics, canonical Models, retained modal DOM, a dirty neighboring Project and normal native close/reopen.',
    fixtures: 'Eight tiny owned catalog-only A/B checkpoint/LoRA/VAE/embedding files. A is each library Default, B initially absent with exact rollback bytes. Two actual IPC-created source presets: all references and same LoRA IDs with wrong SHA. One closed authored neighboring .igs; one declared UI prompt edit is discarded. Only the final explicit UI Create may allocate a Project.',
    syntheticControls: 'Captured genuine Main getCatalog responses may be held unchanged or rejected after their actual read. A typed completed notification requests a newer real Main read and never claims an installation. DOM marker attributes only measure retained nodes; no application state is scripted.',
    limits: 'Launcher 2 GiB/zero swap/600s; actual native groups 2 GiB/zero swap and existing helper deadline 480s. Two serial normal lifetimes. No forced termination qualifies as PASS.',
    negativeScope: 'No ML/SHARED runtime, worker substitute, network, install, weights, inference, ordinary app data, generic recovery/corruption, full diagnostic matrix or public readiness claim. Embedding B is referenced separately by Prompt and Negative Prompt. Catalog-only readiness does not prove model loading.',
    cleanup: 'Restore all captured Main handlers and await in-flight calls; dismiss only owned modals and explicitly discard only the owned neighboring dirty Project before normal close. Restore remaining B bytes only after physical exit. Retain this payload for the root owner dependency/cleanup pass.',
  },
}
let application, window, database, fixture, sourcePreset, mismatchPreset, presetRows, presetRecords, modelRows
let baseline, neighboringBytes, created, nativeChecks = [], probeInstalled = false
let ownedNewProjectOpen = false, ownedManagerOpen = false
const withdrawn = new Map()
const neighboringTitle = 'Native New Project Models neighbor'
const createdTitle = 'Native New Project exact Models creation'
const presetName = 'Native New Project exact resources'
const mismatchName = 'Native New Project same IDs wrong SHA'
const sourcePrompt = '<new-project-vector-b>, saved {blue|red} portrait'
const editedPrompt = '<new-project-vector-b>, edited {blue|red} portrait, 日本語'
const negativeText = '<new-project-vector-b>, saved negative'
const dirtyPrompt = 'Owned neighboring dirty prompt, {one|two}, 日本語'
const labels = { prompt: 'Prompt', negativePrompt: 'Negative Prompt', model: 'Model', loras: 'LoRAs', size: 'Size', sampling: 'Sampler & Scheduler', guidance: 'Steps & CFG', seed: 'Seed', vae: 'VAE' }
const categories = { checkpoint: 'Checkpoints', embedding: 'Embeddings', lora: 'LoRA', vae: 'VAE' }
const modal = () => window.getByRole('dialog', { name: 'New Project', exact: true })
const manager = () => window.getByRole('dialog', { name: 'Preset Manager', exact: true })
const models = () => window.getByRole('dialog', { name: 'Model Manager', exact: true })
const titleInput = () => modal().getByRole('textbox', { name: 'Project name', exact: true })
const prompt = () => modal().getByRole('textbox', { name: 'Preset prompt', exact: true })
const createButton = () => modal().getByRole('button', { name: 'Create Project', exact: true })
const use = (key) => modal().getByRole('checkbox', { name: `Use ${labels[key]}`, exact: true })
const action = (resource, section) => modal().getByRole('button', { name: `Open ${resource.name} in Models`, exact: true }).and(modal().locator(`[data-new-project-model-action^='["${section}",']`))
const projectState = (tab) => ({ acceptedResults: tab.acceptedResults, canRedo: tab.canRedo, canUndo: tab.canUndo, dirty: tab.dirty, documentId: tab.documentId, documentRevision: tab.documentRevision, generationDraft: tab.generationDraft, lastActualSeedSnapshot: tab.lastActualSeedSnapshot, layers: tab.layers, primaryBbox: tab.primaryBbox, title: tab.title })
function persist() { writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }) }
function check(name, evidence = {}) { report.checks.push({ name, ...evidence }); persist(); console.log(`PASS ${name}`) }
persist()

async function prepare() {
  assert.equal(application, undefined, 'Fixture publication requires Main physically closed')
  database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
  const repository = new ModelRepository(database.db), resources = {}
  for (const [index, [kind, role]] of [['checkpoint', 'checkpoint'], ['lora', 'LoRA'], ['vae', 'VAE'], ['embedding', 'embedding']].entries()) {
    const pair = {}
    for (const suffix of ['A', 'B']) {
      const remote = 988_000 + index * 10 + (suffix === 'A' ? 1 : 2)
      const bytes = Buffer.from(`Owned native New Project catalog-only ${kind} ${suffix}.`)
      const filename = `new-project-${kind}-${suffix.toLowerCase()}.safetensors`
      const managedPath = path.join(appData, 'models', filename)
      mkdirSync(path.dirname(managedPath), { recursive: true, mode: 0o700 })
      writeFileSync(managedPath, bytes, { mode: 0o600 })
      const name = `New Project ${role}`, versionName = `Exact ${suffix}`, sha256 = digest(bytes)
      const published = await repository.publishVerifiedInstallation({ primary: {
        file: { managedPath, originalFilename: filename, sha256, sizeBytes: bytes.length, verifiedAt: new Date().toISOString() },
        resource: { creator: 'Owned native fixture', displayName: name, previewUrl: null, source: { kind: 'civitai', modelId: 988_000 + index * 10 }, sourceMetadata: { fixture: true }, type: kind },
        version: { baseModelFamily: 'illustrious', format: 'safetensors', name: versionName, predictionType: kind === 'checkpoint' ? 'epsilon' : null, source: { kind: 'civitai', fileId: remote + 1000, versionId: remote, expectedSha256: sha256 }, sourceMetadata: { fixture: true, trainedWords: [`new-project-vector-${suffix.toLowerCase()}`] } },
      } })
      const backup = path.join(rollback, filename)
      copyFileSync(managedPath, backup)
      pair[suffix.toLowerCase()] = { ...published, name, kind, versionName, managedPath, backup, sha256, portable: {
        baseModelFamily: 'illustrious', civitaiFileId: remote + 1000, civitaiModelId: 988_000 + index * 10, civitaiVersionId: remote, displayName: name, fileSha256: sha256, kind, localModelId: published.resourceId, localVersionId: published.versionId, predictionType: kind === 'checkpoint' ? 'epsilon' : null, versionName,
      } }
    }
    assert.equal(pair.a.resourceId, pair.b.resourceId)
    await repository.setDefaultVersion(pair.a.resourceId, pair.a.versionId)
    resources[role] = pair
  }
  const workspaceDirectory = path.join(appData, 'workspaces/Uncategorized')
  mkdirSync(workspaceDirectory, { recursive: true, mode: 0o700 })
  const session = await ProjectSession.create(path.join(workspaceDirectory, `${neighboringTitle}.igs`), neighboringTitle, { placeholdersDir: path.resolve('dist/main/placeholders'), scratchDir: path.join(payload, 'closed-project-scratch') })
  session.applyDocument({ ...session.document, generationDraft: { ...session.document.generationDraft, model: resources.checkpoint.b.portable, positivePrompt: { text: 'Saved neighboring prompt', embeddingRefs: [] }, seed: { policy: 'fixed', value: 0 } }, primaryBbox: { x: -32, y: 48, width: 768, height: 640 } })
  await session.save()
  const result = { resources, projectId: session.localRecoveryKey, packagePath: session.filePath, workspaceDirectory }
  neighboringBytes = readFileSync(result.packagePath)
  for (const pair of Object.values(resources)) {
    const withheld = path.join(rollback, `withdrawn-${path.basename(pair.b.managedPath)}`)
    renameSync(pair.b.managedPath, withheld)
    withdrawn.set(pair.b.versionId, { resource: pair.b, withheld })
  }
  await database.close(); database = null
  report.fixture = result; persist(); return result
}
function restoreFile(resource, modelsVisible = false) {
  const entry = withdrawn.get(resource.versionId)
  if (!entry) return
  assert.ok(application ? modelsVisible : true, 'Live byte repair requires the owned Models visit')
  assert.equal(digest(readFileSync(entry.withheld)), resource.sha256)
  assert.equal(digest(readFileSync(resource.backup)), resource.sha256)
  assert.equal(existsSync(resource.managedPath), false)
  copyFileSync(entry.withheld, resource.managedPath)
  assert.equal(digest(readFileSync(resource.managedPath)), resource.sha256)
  withdrawn.delete(resource.versionId)
  report.fileRestorations.push({ versionId: resource.versionId, path: resource.managedPath, sha256: resource.sha256, rollbackSha256: digest(readFileSync(entry.withheld)), exact: true, modelsVisible: application ? modelsVisible : null }); persist()
}
function assertFiles() {
  assert.equal(readFileSync(fixture.packagePath).equals(neighboringBytes), true, 'Neighbor saved .igs bytes changed')
  for (const pair of Object.values(fixture.resources)) for (const resource of Object.values(pair)) {
    assert.equal(digest(readFileSync(resource.backup)), resource.sha256)
    if (withdrawn.has(resource.versionId)) assert.equal(existsSync(resource.managedPath), false)
    else assert.equal(digest(readFileSync(resource.managedPath)), resource.sha256)
  }
  if (created) assert.equal(digest(readFileSync(created.packagePath)), created.sha256)
}
async function bound(label) {
  const proof = await boundQualificationProcess(application.process().pid, { deadlineSeconds: 480, execute: (file, args, options) => execute(file, args.map((value) => value === 'MemoryMax=12G' ? 'MemoryMax=2G' : value), options) })
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
  await api('projects', 'list')
  database = openAppDatabase(appData, path.resolve('src/main/db/migrations'))
  const workspace = await database.db.selectFrom('project_workspace').selectAll().where('is_default', '=', 1).executeTakeFirstOrThrow()
  assert.equal(workspace.directory_path, fixture.workspaceDirectory)
  assert.equal(realpathSync(workspace.directory_path), workspace.directory_path)
}
async function api(scope, method, ...args) {
  const result = await window.evaluate(({ scope, method, args }) => window.api[scope][method](...args), { scope, method, args })
  assert.equal(result.ok, true, JSON.stringify(result)); return result.value
}
async function rows(table, orderBy = 'id') { return await database.db.selectFrom(table).selectAll().orderBy(orderBy).execute() }
async function neighboring() { const result = await api('projects', 'open', fixture.projectId); assert.equal(result.kind, 'opened'); return result.tab }
async function unchanged({ projectOpen = true } = {}) {
  assertFiles(); assert.deepEqual(await rows('presets'), presetRows)
  for (const record of presetRecords) assert.deepEqual(await api('presets', 'get', record.id, { includeDeleted: true }), record)
  for (const [table, value] of Object.entries(modelRows)) assert.deepEqual(await rows(table), value)
  if (projectOpen) assert.deepEqual(projectState(await neighboring()), baseline)
}
async function homeSnapshot() {
  return {
    rows: (await rows('project_index', 'local_project_key')).map(({ indexed_at: _indexedAt, last_opened_at: _lastOpenedAt, ...record }) => record),
    packages: readdirSync(fixture.workspaceDirectory).filter((name) => name.endsWith('.igs')).sort().map((name) => ({ name, sha256: digest(readFileSync(path.join(fixture.workspaceDirectory, name))) })),
  }
}
async function tabs() { return await window.getByRole('tablist', { name: 'Open documents', exact: true, includeHidden: true }).getByRole('tab', { includeHidden: true }).evaluateAll((nodes) => nodes.map((node) => ({ label: node.getAttribute('aria-label'), selected: node.getAttribute('aria-selected') }))) }
async function settled(dialog) { await expect(dialog).toBeVisible(); await expect.poll(() => dialog.evaluate((element) => ({ opacity: getComputedStyle(element).opacity, transform: getComputedStyle(element).transform }))).toEqual({ opacity: '1', transform: 'none' }) }
async function mark(dialog) {
  const marker = randomUUID()
  await dialog.evaluate((element, value) => {
    element.setAttribute('data-native-retained', value)
    for (const [index, node] of [...element.querySelectorAll('input, textarea, .cm-content')].entries()) node.setAttribute('data-native-retained', `${value}:${index}`)
  }, marker)
  return marker
}
async function editorState(dialog = modal()) {
  await settled(dialog)
  return await dialog.evaluate((element) => ({
    marker: element.getAttribute('data-native-retained'),
    inputs: [...element.querySelectorAll('input, textarea')].map((node) => ({ label: node.getAttribute('aria-label'), value: node.value, marker: node.getAttribute('data-native-retained') })),
    selections: [...element.querySelectorAll('[role="checkbox"], [role="switch"]')].map((node) => ({ label: node.getAttribute('aria-label') ?? node.textContent.trim(), checked: node.getAttribute('aria-checked') })),
    comboboxes: [...element.querySelectorAll('[role="combobox"]')].map((node) => ({ label: node.getAttribute('aria-label'), text: node.textContent.trim().replace(/\s*· unavailable\b/g, '') })),
    prompts: [...element.querySelectorAll('.cm-content')].map((node) => ({ label: node.getAttribute('aria-label'), marker: node.getAttribute('data-native-retained'), text: [...node.querySelectorAll('.cm-line')].map((line) => line.textContent).join('\n') })),
    sections: [...element.querySelectorAll('[data-preset-section]')].map((node) => ({ section: node.getAttribute('data-preset-section'), expanded: node.classList.contains('n-collapse-item--active') })),
    resets: [...element.querySelectorAll('button[aria-label^="Reset "]')].map((node) => ({ label: node.getAttribute('aria-label'), disabled: node.disabled })),
    source: element.querySelector('[aria-label="Temporary preset copy"]')?.textContent.trim() ?? null,
  }))
}
async function openNew(title) {
  if (!(await window.getByRole('tab', { name: 'Home', exact: true }).count())) {
    await window.locator('.app-chrome').getByRole('button', { name: 'Open Home', exact: true }).click()
  }
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByLabel('Workspace navigation', { exact: true }).getByRole('button', { name: 'New Project', exact: true }).click()
  ownedNewProjectOpen = true
  await settled(modal()); await titleInput().fill(title)
}
async function choosePreset(name) {
  await modal().getByLabel('Generation preset', { exact: true }).click()
  await window.locator('.n-base-select-option').filter({ hasText: new RegExp(`^${name}$`) }).click()
  await expect(modal().getByLabel('Generation preset', { exact: true })).toContainText(name)
}
async function expand(section) {
  const item = modal().locator(`[data-preset-section="${section}"]`)
  if (!(await item.evaluate((node) => node.classList.contains('n-collapse-item--active')))) await item.getByText(labels[section], { exact: true }).click()
  await expect(item).toHaveClass(/n-collapse-item--active/)
}
async function cancelNew() { await modal().getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(modal()).toBeHidden(); ownedNewProjectOpen = false }
async function closeModels(mode = 'button') {
  if (mode === 'escape') await models().press('Escape')
  else await models().getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(models()).toBeHidden()
}
async function exactCatalog(resource, status) {
  const item = (await api('models', 'getCatalog')).find((entry) => entry.id === resource.resourceId)
  assert.ok(item); assert.equal(item.resourceType, resource.kind)
  const pair = Object.values(fixture.resources).find((candidate) => candidate.a.resourceId === item.id)
  assert.equal(item.defaultVersionId, pair.a.versionId)
  const version = item.versions.find((entry) => entry.id === resource.versionId)
  assert.ok(version); assert.equal(version.sha256, resource.sha256); assert.equal(version.fileStatus, status)
  assert.equal(item.versions.find((entry) => entry.id === pair.a.versionId).fileStatus, 'ready')
  return { item, version }
}
async function focusedModels(resource, { wrongSha = false, ready = false } = {}) {
  await settled(models()); await expect(modal()).toBeHidden()
  await expect(models().getByRole('complementary', { name: 'Model filters', exact: true }).getByRole('button', { name: new RegExp(`^${categories[resource.kind]} `) })).toHaveAttribute('aria-pressed', 'true')
  await expect(models().getByPlaceholder('Search installed models')).toHaveValue('')
  await expect(models().getByRole('complementary', { name: 'Model details', exact: true }).locator('h2')).toHaveText(resource.name)
  await expect(models().locator('.version-row').filter({ hasText: 'Exact A' })).toContainText('Default')
  if (ready && !wrongSha) await expect(models().getByText('Used by New Project', { exact: true })).toBeVisible()
  else {
    await expect(models()).toContainText('The New Project settings are unchanged.')
    await expect(models()).toContainText('unavailable')
    await expect(models().getByText('Used by New Project', { exact: true })).toHaveCount(0)
    await expect(models().locator('.version-row--project')).toHaveCount(0)
  }
  if (wrongSha) { await expect(models().locator('.version-row').filter({ hasText: 'Exact B' })).toContainText('ready'); await expect(models()).toContainText('does not match') }
  await expect(window.locator('[role="dialog"]:visible')).toHaveCount(1)
}
async function roundtrip(resource, section, mode = 'button') {
  const before = await editorState(), button = action(resource, section)
  const key = await button.getAttribute('data-new-project-model-action'); assert.ok(key)
  await button.focus(); await button.click(); await focusedModels(resource)
  await closeModels(mode); await expect.poll(editorState).toEqual(before)
  await expect(button).toHaveAttribute('data-new-project-model-action', key); await expect(button).toBeFocused()
  await unchanged(); return { section, key, marker: before.marker, mode }
}
async function screenshot(label, dialog, width, height) {
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width, height })
  await expect.poll(() => window.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]); await settled(dialog)
  await window.mouse.move(width - 5, 5)
  const geometry = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect(), footer = element.querySelector('.modal-actions')?.getBoundingClientRect(), scroll = element.querySelector('.modal-scroll')?.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom, viewport: [innerWidth, innerHeight], overflow: document.documentElement.scrollWidth > innerWidth, footer: footer ? { y: footer.y, bottom: footer.bottom } : null, scroll: scroll ? { y: scroll.y, bottom: scroll.bottom } : null, primaryButtons: [...element.querySelectorAll('button.n-button--primary-type')].map((button) => button.textContent.trim()) }
  })
  assert.equal(geometry.overflow, false); assert.ok(geometry.x >= -1 && geometry.y >= -1)
  assert.ok(geometry.right <= width + 1 && geometry.bottom <= height + 1)
  if (geometry.footer) { assert.deepEqual(geometry.primaryButtons, ['Create Project']); assert.ok(geometry.footer.bottom <= geometry.bottom + 1); assert.ok(geometry.scroll.bottom <= geometry.footer.y + 2) }
  const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-${label}-${width}x${height}.png`)
  assert.equal(existsSync(file), false); await window.screenshot({ path: file, animations: 'disabled' })
  report.screenshots.push({ label, path: file, sha256: digest(readFileSync(file)), geometry }); persist()
}
async function notifyCatalog(id) {
  const notification = { id, modelName: 'Owned catalog UI read control', versionName: 'No installation claimed', bytesDownloaded: 0, totalBytes: 0, error: null, status: 'completed' }
  await application.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('models:install-changed', value), notification)
  return notification
}
async function installCatalogProbe(mode) {
  assert.equal(probeInstalled, false); assert.ok(['hold', 'error'].includes(mode))
  await application.evaluate(({ ipcMain }, selectedMode) => {
    const channel = 'models:get-catalog', original = ipcMain._invokeHandlers.get(channel)
    if (typeof original !== 'function' || globalThis.igsNewProjectModelsCatalog) throw new Error('Actual catalog handler unavailable or owned probe already installed')
    const owned = { original, mode: selectedMode, calls: 0, inFlight: 0, intercepted: false, completed: false, delivered: false, originalOk: false, identities: [], release: null }
    const held = new Promise((resolve) => { owned.release = resolve })
    globalThis.igsNewProjectModelsCatalog = owned; ipcMain.removeHandler(channel)
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
          if (owned.mode === 'error') throw new Error('Owned New Project UI catalog rejection after genuine Main read')
        }
        return result
      } finally { --owned.inFlight }
    })
  }, mode)
  probeInstalled = true
}
async function probeState() { return await application.evaluate(() => { const { mode, calls, inFlight, intercepted, completed, delivered, originalOk, identities } = globalThis.igsNewProjectModelsCatalog; return { mode, calls, inFlight, intercepted, completed, delivered, originalOk, identities } }) }
async function restoreCatalogProbe() {
  if (!probeInstalled || !application) return
  const restored = await application.evaluate(({ ipcMain }) => {
    const owned = globalThis.igsNewProjectModelsCatalog, channel = 'models:get-catalog'
    if (!owned) throw new Error('Owned catalog probe missing at restoration')
    ipcMain.removeHandler(channel); ipcMain.handle(channel, owned.original); owned.release()
    return ipcMain._invokeHandlers.get(channel) === owned.original
  })
  assert.equal(restored, true); await expect.poll(async () => (await probeState()).inFlight).toBe(0)
  const evidence = await probeState()
  if (evidence.intercepted) { assert.equal(evidence.completed, true); assert.equal(evidence.delivered, true); assert.equal(evidence.originalOk, true) }
  report.catalogProbes.push({ ...evidence, restoredExactly: restored })
  await application.evaluate(() => { delete globalThis.igsNewProjectModelsCatalog }); probeInstalled = false; persist()
}
async function closeProjectUi(title, allowDiscard = false) {
  const tab = window.getByRole('tab', { name: title, exact: true })
  if (!(await tab.count())) return
  await window.getByRole('button', { name: `Close ${title}`, exact: true }).click()
  const discard = window.getByRole('dialog', { name: 'Close Project', exact: true }).getByRole('button', { name: 'Discard Changes', exact: true })
  await expect.poll(async () => (await tab.count()) === 0 ? 'closed' : (await discard.isVisible()) ? 'guard' : 'pending').not.toBe('pending')
  if (await tab.count()) { assert.equal(allowDiscard, true, 'Created Project must be clean'); await discard.click() }
  await expect(tab).toHaveCount(0)
}
async function closeNative(label) {
  if (!application) return
  await restoreCatalogProbe()
  if (window && !window.isClosed()) {
    // The unguarded regression control can expose the higher New Project modal
    // over Models. Dismiss our actual topmost form before its covered manager.
    if (ownedNewProjectOpen && await modal().isVisible() && await models().isVisible()) {
      await cancelNew()
    }
    if (await models().isVisible()) await closeModels()
    // A captured read can finish before the renderer's resume/enter transition.
    // Wait for the owned logical flow to become actionable before its real Cancel.
    if (ownedNewProjectOpen) { await expect(modal()).toBeVisible(); await cancelNew() }
    if (ownedManagerOpen) {
      await expect(manager()).toBeVisible()
      await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
      const guard = window.getByRole('dialog', { name: 'Unsaved preset changes', exact: true })
      await expect.poll(async () => (await guard.isVisible()) ? 'guard' : (await manager().isVisible()) ? 'pending' : 'closed').not.toBe('pending')
      if (await guard.isVisible()) await guard.getByRole('button', { name: /^(Discard Draft|Discard)$/ }).click()
      await expect(manager()).toBeHidden(); ownedManagerOpen = false
    }
    await closeProjectUi(createdTitle)
    await closeProjectUi(neighboringTitle, true)
  }
  await bound(`${label}-before-close`)
  if (database) { await database.close(); database = null }
  await application.close()
  report.nativeClosures.push({ label, ...(await confirmQualificationProcessExit(nativeChecks)) })
  application = null; window = null; persist()
}
function assertCreated(document) {
  assert.equal(document.title, createdTitle)
  assert.deepEqual(document.primaryBbox, { x: 0, y: 0, width: 832, height: 576 })
  assert.deepEqual(document.generationDraft.model, fixture.resources.checkpoint.b.portable)
  assert.deepEqual(document.generationDraft.positivePrompt, { ...sourcePreset.payload.prompt, text: editedPrompt })
  assert.deepEqual(document.generationDraft.negativePrompt, { text: '', embeddingRefs: [] })
  assert.deepEqual(document.generationDraft.loras, [])
  assert.deepEqual(document.generationDraft.vae, fixture.resources.VAE.b.portable)
  assert.deepEqual(document.generationDraft.seed, { policy: 'random', value: null })
  assert.deepEqual(document.generationDraft.sampling, { steps: null, cfgScale: null, denoisingStrength: null, sampler: 'Euler', scheduler: 'Normal', animaMethod: 'heun' })
  assert.deepEqual(document.layers, []); assert.equal(document.lastActualSeedSnapshot, null)
}

try {
  fixture = await prepare(); await launch('new-project-models')
  const refs = fixture.resources
  const embedding = { token: '<new-project-vector-b>', resource: refs.embedding.b.portable }
  sourcePreset = await api('presets', 'create', { name: presetName, description: 'Source must remain byte exact', favorite: false, tags: ['native-new-project-models'], workflow: 'textToImage', payload: {
    prompt: { text: sourcePrompt, embeddingRefs: [embedding] }, negativePrompt: { text: negativeText, embeddingRefs: [embedding] }, model: refs.checkpoint.b.portable, loras: [{ enabled: false, resource: refs.LoRA.b.portable, weight: -0.35 }], vae: refs.VAE.b.portable,
    size: { width: 768, height: 640 }, guidance: { steps: 24, cfgScale: 6.5 }, sampling: { sampler: 'Euler', scheduler: 'Normal', animaMethod: 'heun' }, seed: { policy: 'fixed', value: 77 },
  } })
  const wrongRef = { ...refs.LoRA.b.portable, fileSha256: 'f'.repeat(64) }
  assert.notEqual(wrongRef.fileSha256, refs.LoRA.b.sha256)
  mismatchPreset = await api('presets', 'create', { name: mismatchName, description: 'Same nominal IDs, different immutable SHA', favorite: false, tags: [], workflow: 'textToImage', payload: { loras: [{ enabled: true, resource: wrongRef, weight: 0.5 }] } })
  presetRows = await rows('presets'); presetRecords = [sourcePreset, mismatchPreset]
  modelRows = Object.fromEntries(await Promise.all(['model_resource', 'model_resource_version', 'local_model_file'].map(async (table) => [table, await rows(table)])))
  const initialCatalog = []
  for (const pair of Object.values(refs)) initialCatalog.push(await exactCatalog(pair.b, 'missing'))
  await unchanged({ projectOpen: false }); assert.equal((await homeSnapshot()).packages.length, 1)
  check('Actual Main reports all missing exact B references and ready/default A siblings; two source preset records and the neighboring saved package form the immutable baseline', { catalog: initialCatalog, presetIds: presetRecords.map((record) => record.id) })

  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${neighboringTitle}`, exact: true }).click()
  await window.getByRole('textbox', { name: 'Positive prompt', exact: true }).fill(dirtyPrompt)
  await window.getByRole('heading', { name: 'Current Canvas', exact: true }).click()
  await expect.poll(async () => (await neighboring()).generationDraft.positivePrompt.text).toBe(dirtyPrompt)
  await expect.poll(async () => (await neighboring()).canUndo).toBe(true)
  baseline = projectState(await neighboring()); assert.equal(baseline.dirty, true)
  await openNew(createdTitle); await choosePreset(presetName)
  for (const key of Object.keys(sourcePreset.payload).filter((key) => key !== 'size')) {
    if (key === 'seed') await expect(use(key)).not.toBeChecked()
    else await expect(use(key)).toBeChecked()
  }
  const focusedResources = [[refs.checkpoint.b, 'model'], [refs.LoRA.b, 'loras'], [refs.VAE.b, 'vae'], [refs.embedding.b, 'prompt'], [refs.embedding.b, 'negativePrompt']]
  await expect(modal().getByLabel('New Project resource diagnostics', { exact: true })).toBeVisible()
  await expect(modal().locator('[data-new-project-model-action]')).toHaveCount(5)
  for (const [resource, section] of focusedResources) await expect(action(resource, section)).toBeVisible()
  await expect(createButton()).toBeEnabled()
  await expand('prompt'); await prompt().fill(editedPrompt)
  await expand('size'); await modal().getByLabel('Preset width', { exact: true }).fill('832'); await modal().getByLabel('Preset height', { exact: true }).fill('576')
  await expand('guidance'); await modal().getByLabel('Preset steps', { exact: true }).fill('-'); await modal().getByLabel('Preset width', { exact: true }).fill('')
  await titleInput().focus(); await expect(createButton()).toBeDisabled(); await mark(modal())
  const beforeCreation = await homeSnapshot(), retainedTabs = await tabs()
  await modal().getByLabel('New Project resource diagnostics', { exact: true }).scrollIntoViewIfNeeded()
  await screenshot('new-project-invalid-diagnostics', modal(), 1440, 900)
  check('Home New Project selects a detached TXT source, excludes Seed by default and retains edited prompt/reference, Size and unrelated invalid raw Steps/Width while exposing five typed resource actions')

  const allSelected = await editorState()
  for (const [resource, section] of focusedResources) {
    await use(section).uncheck(); await expect(action(resource, section)).toHaveCount(0)
    await use(section).check(); await expect(action(resource, section)).toBeVisible()
  }
  await expect.poll(editorState).toEqual(allSelected)
  await expect(modal().getByLabel('Preset steps', { exact: true })).toHaveValue('-')
  await expect(modal().getByLabel('Preset width', { exact: true })).toHaveValue('')
  await modal().getByLabel('New Project resource diagnostics', { exact: true }).scrollIntoViewIfNeeded()
  await screenshot('new-project-used-sections', modal(), 900, 620)
  check('Only used sections supply actions; unchecking each resource section hides its action without erasing values, and rechecking restores the same draft even with invalid unrelated raw inputs')

  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900))
  const checkpointRoundtrip = await roundtrip(refs.checkpoint.b, 'model')
  await modal().getByRole('button', { name: 'Reset Prompt', exact: true }).click()
  await expect.poll(async () => (await prompt().locator('.cm-line').allTextContents()).join('\n')).toBe(sourcePrompt)
  await prompt().fill(editedPrompt)
  await modal().getByRole('button', { name: 'Reset Size', exact: true }).click()
  await expect(modal().getByLabel('Preset width', { exact: true })).toHaveValue('768')
  await expect(modal().getByLabel('Preset height', { exact: true })).toHaveValue('640')
  await modal().getByLabel('Preset height', { exact: true }).fill('576'); await modal().getByLabel('Preset width', { exact: true }).fill('')
  await titleInput().focus(); await mark(modal())
  check('Exact checkpoint Models Close retains the same modal/editor DOM, title, workspace, Use mask, expansion, raw fields and source; row Reset still uses the frozen original prompt and Size baselines', checkpointRoundtrip)

  const promptReturn = await roundtrip(refs.embedding.b, 'prompt', 'escape')
  const negativeReturn = await roundtrip(refs.embedding.b, 'negativePrompt', 'escape')
  assert.notEqual(promptReturn.key, negativeReturn.key)
  assert.deepEqual(await tabs(), retainedTabs); assert.deepEqual(await homeSnapshot(), beforeCreation)
  check('Prompt and Negative Prompt sidecars have distinct stable section actions into exact Embeddings; Escape returns each precise action focus while preserving source, neighboring Project and Home/package state', { promptReturn, negativeReturn })

  const beforeHeld = await editorState()
  await action(refs.LoRA.b, 'loras').click(); await focusedModels(refs.LoRA.b)
  await installCatalogProbe('hold'); await closeModels()
  await expect.poll(async () => (await probeState()).completed).toBe(true)
  const held = await probeState(); assert.equal(held.originalOk, true); assert.equal(held.delivered, false)
  await expect(modal()).toBeHidden(); await expect(models()).toBeHidden()
  // Real pointer input is intentional: the background shell is inert during this
  // handoff, so an accessibility locator click would wait for enabled interaction.
  // The former reachable menu path still opens on an unguarded built control.
  const backgroundClicks = []
  for (const [label, selector] of [
    ...['Models menu', 'Project menu', 'Open Queue Manager', 'Open saved generations'].map((label) => [label, `.app-chrome button[aria-label="${label}"]`]),
    ['Home New Project', '.workspace-sidebar button.new-project'],
  ]) {
    const button = window.locator(selector)
    const box = await button.boundingBox(); assert.ok(box, `Missing background control: ${label}`)
    await window.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    const globalModelsOption = window.locator('.n-dropdown-option:visible').filter({ hasText: /^Manage Models$/ })
    const selectedModelsOption = await globalModelsOption.isVisible()
    if (selectedModelsOption) { await globalModelsOption.click(); await expect(globalModelsOption).toBeHidden() }
    await api('runtime', 'getStatus')
    await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(modal()).toBeHidden(); await expect(models()).toBeHidden()
    await expect(window.locator('[role="dialog"]:visible')).toHaveCount(0)
    assert.deepEqual(await tabs(), retainedTabs)
    backgroundClicks.push({ label, selectedModelsOption, point: [box.x + box.width / 2, box.y + box.height / 2] })
  }
  assert.equal((await probeState()).delivered, false, 'Global Models reentry must leave the pending handoff and genuine reply held')
  await restoreCatalogProbe(); await expect.poll(editorState).toEqual(beforeHeld); await expect(action(refs.LoRA.b, 'loras')).toBeFocused(); await unchanged()
  check('New Project remains hidden through actual background chrome pointer input while its genuine Main catalog reply is held; global Models cannot replace the handoff and only settlement resumes the exact draft and LoRA action focus', { held, backgroundClicks, restored: report.catalogProbes.at(-1) })

  const beforeNewer = await editorState()
  await action(refs.LoRA.b, 'loras').click(); await focusedModels(refs.LoRA.b)
  await installCatalogProbe('hold'); await closeModels(); await expect.poll(async () => (await probeState()).completed).toBe(true)
  await expect(modal()).toBeHidden()
  const notification = await notifyCatalog('owned-new-project-newer-catalog')
  await expect.poll(async () => (await probeState()).calls).toBeGreaterThan(1)
  await expect.poll(editorState).toEqual(beforeNewer)
  const newer = await probeState(); assert.equal(newer.delivered, false)
  await expect(action(refs.LoRA.b, 'loras')).toBeFocused()
  await restoreCatalogProbe(); await expect.poll(editorState).toEqual(beforeNewer); await unchanged()
  check('A typed completion notification settles a newer actual Main catalog reply before the older held reply; late delivery neither resets the New Project editor nor rewrites references', { notification, newer, actualInstallationClaimed: false, restored: report.catalogProbes.at(-1) })

  const beforeError = await editorState()
  await action(refs.VAE.b, 'vae').click(); await focusedModels(refs.VAE.b)
  await installCatalogProbe('error'); await closeModels()
  await expect(modal()).toContainText('Resource catalog is unavailable. Selected references remain unchanged.')
  await expect.poll(editorState).toEqual(beforeError); await restoreCatalogProbe()
  await expect(modal().locator('[data-new-project-model-action]')).toHaveCount(5)
  await action(refs.VAE.b, 'vae').click(); await focusedModels(refs.VAE.b); await closeModels('escape')
  await expect(modal()).not.toContainText('Resource catalog is unavailable.')
  await expect.poll(editorState).toEqual(beforeError); await expect(action(refs.VAE.b, 'vae')).toBeFocused(); await unchanged()
  check('Rejection after a genuine Main read returns the unchanged draft with explicit unknown-catalog wording and browsable selected refs; normal exact VAE retry clears only that warning', { restored: report.catalogProbes.at(-1) })

  const beforeRepair = await editorState()
  await action(refs.checkpoint.b, 'model').click(); await focusedModels(refs.checkpoint.b)
  await screenshot('models-exact-checkpoint', models(), 900, 620)
  restoreFile(refs.checkpoint.b, await models().isVisible()); await exactCatalog(refs.checkpoint.b, 'ready')
  await notifyCatalog('owned-new-project-exact-byte-repair')
  await focusedModels(refs.checkpoint.b, { ready: true })
  await closeModels(); await expect.poll(editorState).toEqual(beforeRepair)
  await expect(action(refs.checkpoint.b, 'model')).toHaveCount(0); await expect(titleInput()).toBeFocused()
  await expect(modal().locator('[data-new-project-model-action]')).toHaveCount(4); await unchanged()
  check('Exact checkpoint B byte repair while Models is open receives real Main readiness and Used by New Project; return removes only that diagnostic and focuses Project name without replacing B with Default A')

  await cancelNew(); assert.deepEqual(await homeSnapshot(), beforeCreation)
  await openNew('Owned wrong SHA New Project'); await choosePreset(mismatchName); await mark(modal())
  await action(refs.LoRA.b, 'loras').click(); await focusedModels(refs.LoRA.b)
  restoreFile(refs.LoRA.b, await models().isVisible()); await exactCatalog(refs.LoRA.b, 'ready')
  await notifyCatalog('owned-new-project-wrong-sha-read')
  await focusedModels(refs.LoRA.b, { wrongSha: true })
  await closeModels(); const wrongState = await editorState()
  await expect(action(refs.LoRA.b, 'loras')).toBeVisible(); await expect(createButton()).toBeEnabled()
  await action(refs.LoRA.b, 'loras').click(); await focusedModels(refs.LoRA.b, { wrongSha: true }); await closeModels('escape')
  await expect.poll(editorState).toEqual(wrongState); await expect(action(refs.LoRA.b, 'loras')).toBeFocused(); await unchanged()
  check('Ready actual B with identical nominal LoRA IDs still fails the selected wrong SHA; Models shows no Used badge, the diagnostic persists and Create remains available without default substitution', { sameVersionId: refs.LoRA.b.versionId, expectedSha256: wrongRef.fileSha256, actualSha256: refs.LoRA.b.sha256 })

  await cancelNew(); assert.deepEqual(await homeSnapshot(), beforeCreation)
  await openNew(''); await expect(titleInput()).toHaveValue('')
  await expect(modal().getByLabel('Generation preset', { exact: true })).toContainText('No preset')
  await expect(modal().getByLabel('Project width', { exact: true })).toHaveValue('1024')
  await expect(modal().getByLabel('Project height', { exact: true })).toHaveValue('1024')
  await expect(modal().locator('[data-preset-section]')).toHaveCount(0)
  await choosePreset(presetName); await expand('guidance'); await expect(modal().getByLabel('Preset steps', { exact: true })).toHaveValue('24')
  await expect(use('seed')).not.toBeChecked(); await cancelNew(); await unchanged()
  check('Cancel allocates no Project/package or source record; a true New Project reopen resets title, source choice, raw inputs, dimensions and mask instead of restoring the abandoned customization')

  await window.getByRole('button', { name: 'Project menu', exact: true }).click()
  await window.locator('.n-dropdown-option:visible').filter({ hasText: /^Presets$/ }).click()
  ownedManagerOpen = true
  await manager().getByRole('button', { name: `Select preset ${presetName}`, exact: true }).click()
  await manager().getByRole('textbox', { name: 'Preset description', exact: true }).fill('Owned unsaved neighboring manager edit')
  await mark(manager()); const managerBefore = await editorState(manager())
  const managerAction = manager().getByRole('button', { name: `Open ${refs.VAE.b.name} in Models`, exact: true })
  await managerAction.click(); await settled(models()); await expect(manager()).toBeHidden()
  await expect(models()).toContainText('The Preset draft is unchanged.'); await expect(models()).not.toContainText('The New Project settings are unchanged.')
  await closeModels('escape'); await expect.poll(() => editorState(manager())).toEqual(managerBefore); await expect(managerAction).toBeFocused()
  await manager().getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  const managerGuard = window.getByRole('dialog', { name: 'Unsaved preset changes', exact: true })
  await expect(managerGuard).toBeVisible(); await managerGuard.getByRole('button', { name: /^(Discard Draft|Discard)$/ }).click()
  await expect(manager()).toBeHidden(); ownedManagerOpen = false; await unchanged(); assert.deepEqual(await homeSnapshot(), beforeCreation)
  check('Existing Preset Manager keeps its original copy, exact retained session/editor DOM and action focus through a neighboring Models roundtrip; explicit Discard sends no preset update')

  await openNew(createdTitle); await choosePreset(presetName)
  await expand('prompt'); await prompt().fill(editedPrompt)
  await expand('size'); await modal().getByLabel('Preset width', { exact: true }).fill('832'); await modal().getByLabel('Preset height', { exact: true }).fill('576')
  await expand('guidance'); await modal().getByLabel('Preset steps', { exact: true }).fill('-')
  for (const section of ['guidance', 'loras', 'negativePrompt']) await use(section).uncheck()
  await expect(use('seed')).not.toBeChecked(); await expect(modal().getByLabel('Preset steps', { exact: true })).toHaveValue('-')
  await expect(modal().getByLabel('New Project preset resources need attention', { exact: true })).toBeVisible()
  await expect(modal().locator('[data-new-project-model-action]')).toHaveCount(2)
  await expect(createButton()).toBeEnabled(); assert.deepEqual(await homeSnapshot(), beforeCreation); await unchanged()
  await createButton().click(); await expect(modal()).toBeHidden()
  ownedNewProjectOpen = false
  await expect(window.getByRole('tab', { name: createdTitle, exact: true })).toBeVisible()
  const records = (await api('projects', 'list')).filter((record) => record.title === createdTitle); assert.equal(records.length, 1)
  const opened = await api('projects', 'open', records[0].id); assert.equal(opened.kind, 'opened')
  const indexed = await database.db.selectFrom('project_index').selectAll().where('local_project_key', '=', opened.tab.id).executeTakeFirstOrThrow()
  assert.equal(path.dirname(indexed.canonical_path), fixture.workspaceDirectory)
  const packageRead = await readIgsPackage(indexed.canonical_path)
  assertCreated(packageRead.project); assert.deepEqual(packageRead.project.generationDraft, opened.tab.generationDraft)
  assert.equal(opened.tab.dirty, false); assert.equal(opened.tab.canUndo, false); assert.equal(opened.tab.canRedo, false)
  assert.equal(packageRead.manifest.preview.status, 'empty')
  created = { id: opened.tab.id, title: createdTitle, packagePath: indexed.canonical_path, sha256: digest(readFileSync(indexed.canonical_path)), document: packageRead.project }
  report.created = created
  const createdTabs = await tabs(); assert.equal(createdTabs.filter((tab) => tab.selected === 'true').length, 1)
  assert.equal(createdTabs.find((tab) => tab.label === createdTitle)?.selected, 'true')
  assert.equal(createdTabs.some((tab) => tab.label === 'Home'), false, 'Current Home placement replaces Home with the created Project')
  assert.equal(createdTabs[0].label, createdTitle)
  assert.equal(createdTabs.find((tab) => tab.label === neighboringTitle)?.selected, 'false')
  assert.equal((await homeSnapshot()).packages.length, beforeCreation.packages.length + 1)
  assert.equal((await homeSnapshot()).rows.length, beforeCreation.rows.length + 1)
  await unchanged(); await closeNative('new-project-create-normal')
  assert.equal(report.nativeClosures.at(-1).confirmed, true)
  check('Only explicit enabled UI Create writes one clean first .igs and Home record with exact edited selected settings/bbox, omitted unchecked resources and random default Seed; neighboring dirty Project is explicitly discarded before normal physical close', { created: { id: created.id, packagePath: created.packagePath, sha256: created.sha256 }, tabs: createdTabs, closure: report.nativeClosures.at(-1) })

  assert.equal(application, null)
  for (const pair of Object.values(refs)) restoreFile(pair.b)
  await launch('new-project-readback')
  for (const pair of Object.values(refs)) await exactCatalog(pair.b, 'ready')
  await window.getByRole('button', { name: `Open ${createdTitle}`, exact: true }).click()
  const reopened = await api('projects', 'open', created.id); assert.equal(reopened.kind, 'opened')
  assertCreated((await readIgsPackage(created.packagePath)).project)
  assert.deepEqual(reopened.tab.generationDraft, created.document.generationDraft)
  assert.deepEqual(reopened.tab.primaryBbox, created.document.primaryBbox)
  assert.equal(reopened.tab.dirty, false); assert.equal(reopened.tab.canUndo, false); assert.equal(reopened.tab.canRedo, false)
  await unchanged({ projectOpen: false }); await closeNative('new-project-readback-normal'); assertFiles()
  assert.deepEqual(hashFiles(sourceFiles), report.sourceSha256); assert.deepEqual(hashFiles(bundleFiles), report.bundleSha256)
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.vueWarnings, [])
  assert.equal(withdrawn.size, 0); assert.equal(report.nativeClosures.length, 2); assert.equal(report.screenshots.length, 3)
  assert.equal(report.catalogProbes.length, 3); assert.ok(report.catalogProbes.every((probe) => probe.restoredExactly && probe.inFlight === 0))
  report.finalState = { normalPhysicalLifetimes: 2, ownedFilesAndRollbackBytesExact: true, sourcePresetsUnchanged: true, neighboringSavedPackageExact: true, createdPackageExact: true, sourceAndFiveBundlesUnchanged: true, capturedMainHandlersRestored: true, inFlightCalls: 0, noInferenceClaim: true }
  check('Second physical app lifetime reopens the created .igs through actual Main with identical selected settings/references, omitted unselected sections, unchanged sources and package bytes; normal close confirms full file/handler/source/bundle restoration', report.finalState)
  assert.equal(report.checks.length, 14); report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'; report.error = error.stack ?? String(error)
  if (window && !window.isClosed()) try {
    const file = path.join(evidenceRoot, `${path.basename(reportFile, '.json')}-failure.png`)
    if (!existsSync(file)) await window.screenshot({ path: file, animations: 'disabled', timeout: 5_000 })
    report.failureScreenshot = { path: file, sha256: digest(readFileSync(file)) }
  } catch (captureError) { report.failureScreenshotError = String(captureError) }
  throw error
} finally {
  try {
    await closeNative('failure-cleanup-normal')
    if (database) { await database.close(); database = null }
    assert.ok(!application, 'Remaining file restoration requires confirmed physical Main exit')
    for (const entry of [...withdrawn.values()]) restoreFile(entry.resource)
    if (fixture) assertFiles()
    report.restoration = { noOwnedApplicationHandle: !application, confirmedPhysicalClosures: report.nativeClosures.length, remainingWithdrawnFiles: withdrawn.size, probeInstalled }
  } catch (closeError) {
    report.outcome = 'failed'; report.closeError = closeError.stack ?? String(closeError); process.exitCode = 1
  }
  try {
    report.terminalSourceSha256 = hashFiles(sourceFiles); report.terminalBundleSha256 = hashFiles(bundleFiles)
    assert.deepEqual(report.terminalSourceSha256, report.sourceSha256)
    assert.deepEqual(report.terminalBundleSha256, report.bundleSha256)
    report.terminalSourceAndBundlesUnchanged = true
  } catch (freezeError) { report.outcome = 'failed'; report.freezeError = freezeError.stack ?? String(freezeError); process.exitCode = 1 }
  report.finishedAt = new Date().toISOString(); persist()
  console.log(JSON.stringify({ report: reportFile, outcome: report.outcome, checks: report.checks.length, payload }))
}
