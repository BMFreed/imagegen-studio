/**
 * Opt-in: pnpm exec tsx scripts/qualify-installed-anima-regional-img2img.mjs --fixture ABS.json
 *
 * Exactly three real Heun requests: healthy Generate, progress-observed Generate/Cancel,
 * saved/restarted frozen Queue Retry, followed by actual Results Add/Undo/Redo/Save.
 * One exact preceding canonical PNG is prepared as a source Raster through ProjectSession;
 * this setup is not an Import UI qualification and never edits or substitutes its pixels.
 * Twenty authored steps at strength0.5 contain 19 native evaluations; progress preserves that
 * established Studio frozen-plan meaning. ROOT supplies the already installed runtime,
 * catalog and hash-bound retained Main input. This script never provisions, adopts
 * models, changes availability, substitutes ML, changes worker messages, or deletes
 * artifacts. Only its new Project and operational rows may change.
 *
 * InvokeAI b0ac163b139c432aff4c51078c31c074bf292f72:
 * app/invocations/vae/anima_image_to_latents.py supplies source normalization;
 * frontend/webv2/src/features/generation/core/canvas/{compileCanvasGraph,addRegionalGuidance}.ts,
 * app/invocations/anima/anima_denoise.py, backend/anima/regional_prompting.py,
 * backend/krea2/regional_prompting.py and app/services/session_queue/session_queue_default.py.
 * Anima keeps separate positive contexts and unmasked negatives. The named Studio
 * profile adapts ONLY Krea-2's full-coverage global support predicate. Native Heun
 * uses the existing scheduler driver and the request-owned regional predictor.
 * Current Invoke emits logical-step progress; Studio retains its native-evaluation
 * contract. Current Invoke selected working bytes may differ from the recorded
 * HEAD; ROOT records their source hashes and scoped differences. Existing
 * qualify-installed-regional-generation.mjs supplies the pass-through observer,
 * resource bounds, UI Generate/Cancel/Retry/Add/Undo/Redo/Save/reopen patterns;
 * qualify-installed-generation.mjs and anima-regression-qualification.mjs supply
 * original-Anima catalog and base-provenance checks. No visual-quality claim follows.
 *
 * Fixture exact shape (every descriptor requires its actual SHA-256):
 * {schemaVersion:1,profile:'installed-anima-regional-img2img-v1',appData,artifacts,
 *  deadlineSeconds:600,provisionReport:{path,sha256},catalog:{modelId,versionId},
 *  baseline:{contract:{path,sha256},bundle:{path,sha256},input:{path,sha256},
 *            png:{path,sha256}},source:{path,sha256}}
 * baseline.input is the original seed123-assigned blue1.5 Main handoff with
 * authoredDocument, complete recipe alpha arrays, compiledPrompts and sampling.
 * baseline.png is original-png/seed123-assigned.png, never the older control-png.
 * The retained Euler handoff is never rewritten. ProjectSession authors a new
 * project with one exact source Raster, Heun and strength0.5; the existing compiler
 * independently supplies the expected complete sampling plan. Its PNG is only
 * historical context, never an expected Heun image.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync, writeFileSync } from 'node:fs'
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { inflateSync } from 'node:zlib'

import { _electron as electron, expect } from '@playwright/test'
import { sql } from 'kysely'

import { openAppDatabase } from '../src/main/db/database.ts'
import { CivitaiClient } from '../src/main/models/civitai-client.ts'
import { CivitaiTokenStore } from '../src/main/models/civitai-token-store.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { ModelService } from '../src/main/models/model-service.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { encodeProjectMaskPng } from '../src/main/projects/project-mask.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { compileAnimaFlowSamplingPlan } from '../src/shared/projects/anima-flow-sampling-plan.ts'
import { generationTargetSignature } from '../src/shared/projects/project-generation-target-state.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'
import { assertRuntimeIdle, assertUpgradeBounds, treeManifest } from './upgrade-qualification-worker.mjs'

assert.deepEqual(process.argv.slice(2, 3), ['--fixture'])
assert.equal(process.argv.length, 4)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const sharedAppData = path.join(
  artifactRoot,
  'shared/regional-public-worker-014-20261103/data/imagegen-studio',
)
const profile = 'invoke-krea2-global-support-v1'
const interpretation = 'invoke-fragments-v1'
const capability = 'anima-regional-txt2img-v1'
const samplingCapability = 'anima-regional-sampling-v1'
const imageCapability = 'anima-regional-img2img-v1'
const requestType = 'execute-current-canvas-anima-regional'
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const exec = promisify(execFile)
const within = (root, value) => {
  const relative = path.relative(root, value)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}
function canonical(value) {
  assert.ok(typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value)
}
function keys(value, expected) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort())
}
async function regular(file, maximum = Number.MAX_SAFE_INTEGER) {
  canonical(file)
  const entry = await lstat(file)
  assert.ok(entry.isFile() && !entry.isSymbolicLink() && entry.size <= maximum)
  assert.equal(await realpath(file), file)
  return entry
}
async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}
async function descriptor(value, maximum = 32 * 1024 ** 2) {
  keys(value, ['path', 'sha256'])
  assert.match(value.sha256, /^[a-f0-9]{64}$/)
  await regular(value.path, maximum)
  assert.equal(await hashFile(value.path), value.sha256)
  return value.path
}
async function json(file, maximum = 32 * 1024 ** 2) {
  await regular(file, maximum)
  return JSON.parse(await readFile(file, 'utf8'))
}
const fixturePath = process.argv[3]
const fixture = await json(fixturePath, 64 * 1024)
keys(fixture, [
  'schemaVersion', 'profile', 'appData', 'artifacts', 'deadlineSeconds', 'provisionReport',
  'catalog', 'baseline', 'source',
])
assert.equal(fixture.schemaVersion, 1)
assert.equal(fixture.profile, 'installed-anima-regional-img2img-v1')
assert.equal(fixture.appData, sharedAppData)
assert.ok(Number.isSafeInteger(fixture.deadlineSeconds) && fixture.deadlineSeconds > 0 && fixture.deadlineSeconds <= 600)
keys(fixture.catalog, ['modelId', 'versionId'])
for (const id of Object.values(fixture.catalog)) assert.match(id, /^[a-f0-9-]{36}$/i)
keys(fixture.baseline, ['contract', 'bundle', 'input', 'png'])
for (const value of [fixturePath, fixture.appData, fixture.artifacts]) {
  canonical(value)
  assert.ok(within(artifactRoot, value))
}
assert.ok(!within(fixture.appData, fixture.artifacts) && !within(fixture.artifacts, fixture.appData))
assert.equal(existsSync(fixture.artifacts), false, 'Use a fresh evidence directory; no reset is implemented')
for (const value of [fixture.provisionReport, ...Object.values(fixture.baseline), fixture.source]) await descriptor(value, 16 * 1024 ** 2)
const contract = await json(fixture.baseline.contract.path)
const bundle = await json(fixture.baseline.bundle.path)
const baseline = await json(fixture.baseline.input.path, 16 * 1024 ** 2)
assert.deepEqual(contract.regionalTexts, ['(red scarf)1.5, one white cat', '(blue scarf)1.5, one white cat'])
assert.equal(contract.globalPositive, '(two white cats)1.25 on one bench')
assert.equal(contract.globalNegative, '(blur)0.75, noise')
const bbox = { x: -13, y: 5, width: 512, height: 512 }
assert.deepEqual(baseline.recipe.bbox, bbox)
assert.equal(baseline.recipe.item.seed, 123)
assert.equal(baseline.sampling.steps, 20)
assert.equal(baseline.sampling.guidanceScale, 4)
assert.equal(baseline.sampling.scheduler, 'euler')
assert.equal(baseline.recipe.globalPrompts.positive.text, contract.globalPositive)
assert.equal(baseline.recipe.globalPrompts.negative.text, contract.globalNegative)
assert.deepEqual(baseline.recipe.regions.map(({ positive }) => positive.text), contract.regionalTexts)
assert.ok(baseline.recipe.regions.every(({ negative }) => negative.source === 'regional' && negative.prompt.text === ''))
assert.ok(baseline.authoredDocument && baseline.authoredDocument.layers.length === 0)
const sampled = { left: 0, right: 0, overlap: 0, background: 0 }
for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
  const index = y * 16 * 512 + x * 16
  const left = baseline.recipe.regions[0].coverage.alpha[index] >= 128
  const right = baseline.recipe.regions[1].coverage.alpha[index] >= 128
  sampled.left += Number(left); sampled.right += Number(right)
  sampled.overlap += Number(left && right); sampled.background += Number(!left && !right)
}
assert.deepEqual(sampled, { left: 544, right: 512, overlap: 32, background: 0 })
const expectedSampling = compileAnimaFlowSamplingPlan({
  mode: 'img2img', width: bbox.width, height: bbox.height,
  steps: baseline.sampling.steps, seed: baseline.recipe.item.seed,
  guidanceScale: baseline.sampling.guidanceScale, strength: 0.5, scheduler: 'heun',
})
assert.equal(expectedSampling.steps, 20)
assert.equal(expectedSampling.totalSteps, 19)
assert.equal(expectedSampling.startStep, 10)
assert.equal(expectedSampling.beginIndex, 20)
assert.equal(expectedSampling.posteriorSeed, (123 ^ 0x9e3779b9) >>> 0)
assert.ok(within(artifactRoot, fixture.source.path) && !within(fixture.artifacts, fixture.source.path))
const sourceStat = await regular(fixture.source.path, 16 * 1024 ** 2)
const sourceBytes = await readFile(fixture.source.path)
assert.equal(sha(sourceBytes), fixture.source.sha256)
const sourcePixels = decodePng(sourceBytes)
assert.equal(sourcePixels.channels, 3, 'The exact preceding canonical source is RGB PNG')
await mkdir(fixture.artifacts, { mode: 0o700 })
const reportPath = path.join(fixture.artifacts, 'report.json')
const started = Date.now()
const endAt = started + fixture.deadlineSeconds * 1000
const timeout = (maximum = 30_000) => {
  const remaining = endAt - Date.now()
  assert.ok(remaining > 0, 'Original whole-run deadline exceeded')
  return Math.min(maximum, remaining)
}
const report = {
  schemaVersion: 1, profile: fixture.profile, status: 'running', fixtureSha256: await hashFile(fixturePath),
  invokeRevision: 'b0ac163b139c432aff4c51078c31c074bf292f72',
  invokeSourcePins: {
    'invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts': '9db44bc894d4600b63673770a577a90e473c37abde48aee2e9a01ba5a42365df',
    'invokeai/app/invocations/vae/anima_image_to_latents.py': 'df665b42772db1aec26d487d5fdeae00bbead74e4bb1854d1762a0fb87e1f1b6',
    'invokeai/backend/anima/scheduler_driver.py': '3d2f9e3531607e2e9a42e160aefd25e8fc3aec15dab40551e04dca691408a32d',
    'invokeai/app/invocations/anima/anima_denoise.py': '34511531b56e6e589e0f7a0071a9c86d8bc1b2c78f3150ceb282185ec2511e56',
    'invokeai/backend/anima/regional_prompting.py': '42b955b97b78c1853274f81f1c42cf906501ed8992523a35aa0109bc559dcbce',
  },
  sampledCoverage: sampled,
  startedAt: new Date(started).toISOString(), requestBudget: 3, fixture, lifetimes: [], screenshots: [],
  pageErrors: [], sourcePins: {}, limits: [], checks: [], expectedSampling,
  boundaries: {
    runtime: 'Default installed RuntimeManager; no injected worker, availability, model, or ML adapter',
    pixels: 'Fresh healthy installed Heun RGB is the exact frozen Retry oracle; prior Euler PNG is context only',
    sampling: 'Genuine retained Main prompts/masks; a source Raster and ordinary Heun20/strength0.5 produce19 frozen native evaluations',
    source: 'Exact canonical preceding RGB PNG prepared through ProjectSession, not pixel-edited or an Import UI qualification; actual target composition and opaque source snapshot are verified',
    visual: 'Screenshots retained for ROOT inspection; screenshot capture alone is not visual acceptance',
    cleanup: 'No input, project, model, environment, evidence or ordinary application data deletion',
  },
}
const checkpoint = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
const check = (description, evidence) => {
  report.checks.push({ description, at: new Date().toISOString(), ...(evidence ? { evidence } : {}) })
  checkpoint()
}
let database, application, window, project, provision, marker, pointer, installedBefore, baselineSql
let timer, boundsTimer, boundsPending = Promise.resolve(), activeLifetime, error, closing
const allWires = () => report.lifetimes.flatMap(({ observers }) => wires(observers))
const workerFiles = ['anima_regional.py', 'anima_regional_worker.py', 'inference_main.py', 'anima_worker.py', 'inference_anima.py', 'anima_euler.py', 'anima_conditioning.py', 'anima_sampling.py', 'anima_flow_sampling.py']
const migrationFiles = (await readdir('src/main/db/migrations')).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort()
assert.equal(migrationFiles.length, 25)
assert.ok(migrationFiles.at(-1).startsWith('0025_'))
const sourceFiles = [
  'scripts/qualify-installed-anima-regional-img2img.mjs', 'scripts/qualify-installed-anima-regional.mjs', 'src/main/projects/anima-regional-worker-request.ts',
  'src/main/projects/anima-regional-queued-generation.ts', 'src/main/projects/project-regional-generation-coordinator.ts',
  'src/main/projects/regional-generation-processor.ts', 'src/main/projects/generation-worker-client.ts',
  'src/main/projects/generation-orchestrator.ts', 'src/shared/projects/regional-invoke-generation.ts',
  'src/main/projects/generation-queue.ts', 'src/main/projects/generation-staging.ts',
  'src/main/projects/generation-action-controller.ts', 'src/main/projects/regional-queued-generation.ts',
  'src/shared/projects/generation-queue-manager.ts', 'src/shared/projects/project-generation-actions.ts',
  ...migrationFiles.map((name) => `src/main/db/migrations/${name}`),
  'src/shared/projects/anima-flow-sampling-plan.ts', 'src/shared/projects/inference-worker-capabilities.ts',
  'src/shared/projects/project-generation-target-state.ts',
  'src/main/projects/project-generation-provenance.ts',
  'dist/main/main.cjs', ...workerFiles.map((name) => `worker-python/src/imagegen_worker/${name}`),
]
const statIdentity = (entry) => ({ device: entry.dev, inode: entry.ino, mode: entry.mode, links: entry.nlink, bytes: entry.size, modified: entry.mtimeMs, changed: entry.ctimeMs })

async function snapshotSql() {
  const names = (await sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`.execute(database.db)).rows.map(({ name }) => name)
  const result = {}
  for (const name of names) {
    assert.match(name, /^[a-zA-Z_][a-zA-Z0-9_]*$/)
    result[name] = (await sql.raw(`SELECT * FROM "${name}"`).execute(database.db)).rows
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  }
  return result
}
function preserveSql(actual) {
  assert.deepEqual(Object.keys(actual), Object.keys(baselineSql))
  // Production Home startup/Refresh reindexes every saved package. Exclude only
  // its explicitly recorded rebuildable timestamp; preserve all other fields.
  const normalized = (name, row) => JSON.stringify(name === 'project_index' ? { ...row, indexed_at: null } : row)
  report.sqlPreservation = { exclusions: [{ table: 'project_index', field: 'indexed_at', reason: 'Original Home scanWorkspace refresh timestamp only' }], cacheRefreshes: [] }
  const owned = new Set([project.id, project.file, project.document.documentId])
  for (const row of actual.generation_queue_item.filter(({ local_project_key }) => local_project_key === project.id)) {
    for (const key of ['id', 'batch_id', 'staging_session_id', 'origin_request_id']) if (row[key]) owned.add(row[key])
  }
  const own = (row) => Object.values(row).some((value) => owned.has(value))
  for (const [name, rows] of Object.entries(baselineSql)) {
    const after = actual[name]
    const beforeKeys = new Set(rows.map((row) => normalized(name, row)))
    for (const row of rows) {
      const retained = after.find((candidate) => normalized(name, candidate) === normalized(name, row))
      assert.ok(retained, `Pre-existing ${name} row changed`)
      if (name === 'project_index' && retained.indexed_at !== row.indexed_at) report.sqlPreservation.cacheRefreshes.push({ projectKey: row.local_project_key, before: row.indexed_at, after: retained.indexed_at })
    }
    const extras = after.filter((row) => !beforeKeys.has(normalized(name, row)))
    if (/^model_|^resource_/.test(name)) assert.deepEqual(extras, [], 'Catalog must remain exact')
    else for (const row of extras) assert.ok(own(row), `Unexpected non-owned ${name} row`)
  }
}
async function ownRows() {
  return await database.db.selectFrom('generation_queue_item').selectAll()
    .where('local_project_key', '=', project.id).orderBy('created_at').orderBy('id').execute()
}
async function row(id) {
  return await database.db.selectFrom('generation_queue_item').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
}
async function prepare() {
  report.launcherBounds = await assertUpgradeBounds({ maxRuntimeSeconds: fixture.deadlineSeconds })
  provision = await json(fixture.provisionReport.path)
  marker = await json(path.join(fixture.appData, 'qualification-runtime.json'))
  pointer = await json(path.join(fixture.appData, 'runtime/current-runtime.json'))
  assert.equal(provision.status, 'activated-qualified')
  assert.equal(provision.appData, fixture.appData)
  assert.equal(marker.report, fixture.provisionReport.path)
  assert.equal(marker.status, 'passed')
  assert.equal(marker.runtimeId, pointer.runtimeId)
  assert.equal(provision.runtimeId, pointer.runtimeId)
  assert.equal(provision.installed.editable, false)
  assert.equal(provision.confirmedWorkerExit, true)
  assert.equal(pointer.pythonExecutable, provision.pythonExecutable)
  assert.ok(within(path.join(fixture.appData, 'runtime'), provision.installed.workerRoot))
  await assertRuntimeIdle(fixture.appData, await realpath(pointer.pythonExecutable))
  installedBefore = await treeManifest(provision.installed.workerRoot)
  for (const name of workerFiles) {
    const installed = path.join(provision.installed.workerRoot, name)
    assert.equal(await hashFile(installed), await hashFile(`worker-python/src/imagegen_worker/${name}`), `Refresh installed ${name} before qualification`)
  }
  for (const file of sourceFiles) report.sourcePins[file] = await hashFile(file)
  database = openAppDatabase(fixture.appData, path.resolve('src/main/db/migrations'))
  baselineSql = await snapshotSql()
  report.protectedProjects = []
  for (const row of baselineSql.project_index) {
    if (!existsSync(row.canonical_path)) continue
    const entry = await regular(row.canonical_path)
    report.protectedProjects.push({ path: row.canonical_path, stat: statIdentity(entry), sha256: await hashFile(row.canonical_path) })
  }
  const pending = baselineSql.generation_queue_item.filter(({ status }) => ['pending', 'running'].includes(status))
  assert.deepEqual(pending, [], 'Do not start a qualification while pre-existing queue work can run')
  const models = new ModelService(new ModelRepository(database.db), new CivitaiClient(), new CivitaiTokenStore({}, fixture.appData))
  const reference = await models.resolveGenerationCheckpoint(fixture.catalog.modelId, fixture.catalog.versionId)
  const verified = await models.resolveVerifiedGenerationAnimaBundleForPlan(reference)
  assert.equal(verified.architecture, 'anima-base-1.0')
  for (const [role, file] of Object.entries(bundle)) {
    const component = verified[role]
    assert.equal(component.managedPath, file.path)
    assert.equal(component.byteSize, file.byteSize)
    assert.equal(role === 'checkpoint' ? component.reference.fileSha256 : component.sha256, file.sha256)
    assert.ok(!within(fixture.artifacts, file.path))
  }
  report.catalog = { reference, verified }
  report.catalog.fileStats = Object.fromEntries(await Promise.all(Object.entries(bundle).map(async ([role, file]) => [role, statIdentity(await regular(file.path))])))
  const workspace = path.join(fixture.appData, 'workspaces/Uncategorized')
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  const title = `Anima regional IMG Heun ${path.basename(fixture.artifacts)} ${randomUUID().slice(0, 8)}`
  const file = path.join(workspace, `${title}.igs`)
  assert.equal(existsSync(file), false)
  const session = await ProjectSession.create(file, title, {
    placeholdersDir: path.resolve('dist/main/placeholders'), scratchDir: path.join(fixture.artifacts, 'writer-scratch'),
  }, bbox)
  const document = session.document
  document.generationDraft = structuredClone(baseline.authoredDocument.generationDraft)
  document.generationDraft.model = reference
  document.generationDraft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
  assert.deepEqual(document.generationDraft.seed, { policy: 'fixed', value: 123 })
  assert.equal(document.generationDraft.sampling.animaMethod, 'euler')
  assert.equal(document.generationDraft.sampling.steps, 20)
  assert.equal(document.generationDraft.sampling.cfgScale, 4)
  assert.equal(document.generationDraft.vae, null)
  assert.equal(document.generationDraft.vaePrecision ?? 'Auto', 'Auto')
  document.generationDraft.sampling.animaMethod = 'heun'
  document.generationDraft.sampling.denoisingStrength = 0.5
  const sourceId = randomUUID(), sourceMember = `assets/layers/${sourceId}.png`
  const sourceAsset = { bytes: sourceBytes.length, width: 512, height: 512, path: sourceMember, sha256: sha(sourceBytes) }
  document.layers = [{
    id: sourceId, name: 'Exact prior Anima source', kind: 'raster',
    asset: sourceAsset, blendMode: 'normal', locked: false, opacity: 1, visible: true,
    transform: { x: bbox.x, y: bbox.y, scaleX: 1, scaleY: 1, rotationDegrees: 0 },
  }]
  const assets = { [sourceMember]: { bytes: sourceBytes } }
  document.regionalGuidance = baseline.authoredDocument.regionalGuidance.map((source, index) => {
    const region = structuredClone(source), coverage = baseline.recipe.regions[index].coverage
    assert.equal(region.prompts.positive.text, contract.regionalTexts[index])
    const { width, height, x, y } = region.mask.bounds
    const full = Buffer.from(coverage.alpha), cropped = Buffer.alloc(width * height)
    for (let row = 0; row < height; row++) full.copy(cropped, row * width, (y - bbox.y + row) * 512 + x - bbox.x, (y - bbox.y + row) * 512 + x - bbox.x + width)
    region.id = randomUUID()
    region.mask.id = randomUUID()
    const bytes = encodeProjectMaskPng(cropped, width, height)
    const member = `assets/masks/${region.mask.id}/${sha(bytes)}.png`
    region.mask.asset = { bytes: bytes.length, width, height, path: member, sha256: sha(bytes) }
    assets[member] = { bytes }
    return region
  })
  session.applyDocument(document)
  await session.save({ assets })
  assert.equal(session.document.generationDraft.sampling.animaMethod, 'heun')
  project = { title, file, document: session.document, sourceLayerId: sourceId, sourceAsset, initialPackageSha256: await hashFile(file) }
  report.project = project
  report.source = { descriptor: fixture.source, layerId: sourceId, asset: sourceAsset, rgbSha256: sourcePixels.rgbSha256, setup: 'ProjectSession exact canonical PNG member at identity transform; no Import UI or pixel edit' }
  const sourcePackage = await readIgsPackage(file)
  assert.ok((await sourcePackage.readMember(sourceMember)).equals(sourceBytes))
  report.initialSql = baselineSql
  await database.close()
  database = null
  check('Canonical installed runtime and genuine catalog verified; ProjectSession authors source Raster plus Heun/.5 with exact retained texts, seed and mask coverage')
}

/** Observers always call original functions once with the original receiver/arguments. */
async function installObservers() {
  await application.evaluate(({ ipcMain, webContents }, options) => {
    const cp = process.getBuiltinModule('child_process'), fs = process.getBuiltinModule('fs')
    const crypto = process.getBuiltinModule('crypto'), p = process.getBuiltinModule('path')
    const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
    const state = { workers: [], ipc: [], progress: [], faults: [], restores: [], order: 0 }
    const fault = (error) => state.faults.push(String(error.stack ?? error))
    if (globalThis.__installedAnimaRegional) throw new Error('Observer already installed')
    globalThis.__installedAnimaRegional = state
    const restoreProperty = (owner, name, original, descriptor, wrapper) => () => {
      if (owner[name] !== wrapper) throw new Error(`Observer ownership changed: ${name}`)
      if (descriptor) Object.defineProperty(owner, name, descriptor)
      else delete owner[name]
      if (owner[name] !== original) throw new Error(`Observer restoration changed: ${name}`)
    }
    const checked = (descriptor, root, maximum) => {
      const entry = fs.lstatSync(descriptor.path)
      if (p.dirname(descriptor.path) !== root || fs.realpathSync(descriptor.path) !== descriptor.path || !entry.isFile() || entry.isSymbolicLink() || entry.size !== descriptor.byteSize || entry.size > maximum) throw new Error('Observed descriptor is not exact owned storage')
      const bytes = fs.readFileSync(descriptor.path)
      if (hash(bytes) !== descriptor.sha256) throw new Error('Observed bytes differ from descriptor')
      return bytes
    }
    const wireSnapshot = (wire, workerPid) => {
      if (wire.type !== options.type) return { type: wire.type, requestId: wire.requestId }
      const count = state.workers.reduce((total, worker) => total + worker.writes.filter(({ type }) => type === options.type).length, 0)
      if (count >= 3) throw new Error('Anima regional whole-run request budget exceeded')
      const bytes = checked(wire.bundle, wire.stagingRoot, 1024 ** 2)
      const bundle = JSON.parse(bytes.toString('utf8')), target = bundle.request.job.target
      const targetBytes = checked(target, p.dirname(target.path), 32 * 1024 ** 2)
      const prefix = `${options.lifetime}-wire-${count + 1}`
      fs.writeFileSync(p.join(options.evidence, `${prefix}.json`), bytes, { flag: 'wx', mode: 0o600 })
      fs.writeFileSync(p.join(options.evidence, `${prefix}-target.png`), targetBytes, { flag: 'wx', mode: 0o600 })
      const alphas = bundle.recipe.regions.map((region, index) => {
        const descriptor = region.coverage.alpha.$alpha8
        const bytes = checked(descriptor, wire.stagingRoot, 64 * 1024 ** 2)
        const file = p.join(options.evidence, `${prefix}-region-${index}.alpha8`)
        fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 })
        return { ...descriptor, retained: file }
      })
      const ownerPath = p.join(wire.stagingRoot, '.owner-v1.json')
      const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'))
      if (owner.kind !== 'regional-transport-owner-v1' || owner.main.pid !== process.pid || owner.worker.pid !== workerPid) throw new Error('Actual Main/worker do not own transport')
      return { ...wire, bundleJson: bundle, alphas, owner, target: { ...target, retained: p.join(options.evidence, `${prefix}-target.png`) } }
    }
    const originalSpawn = cp.spawn, spawnDescriptor = Object.getOwnPropertyDescriptor(cp, 'spawn')
    const spawnWrapper = function (...args) {
      const child = Reflect.apply(originalSpawn, this, args)
      try {
        if (!args[1]?.some((value) => typeof value === 'string' && value.startsWith('imagegen_worker'))) return child
        if (state.workers.length >= 32) throw new Error('Worker observation exceeds bound')
        const worker = { pid: child.pid, executable: args[0], args: args[1], writes: [], frames: [], ready: null, exit: null, close: null, originalCalls: 1 }
        state.workers.push(worker)
        const originalWrite = child.stdin.write, descriptor = Object.getOwnPropertyDescriptor(child.stdin, 'write')
        let pending = '', response = ''
        const writeWrapper = function (...writeArgs) {
          try {
            pending += Buffer.from(writeArgs[0]).toString('utf8')
            if (pending.length > 128 * 1024) throw new Error('Incomplete observed JSONL exceeds bound')
            let newline
            while ((newline = pending.indexOf('\n')) >= 0) {
              const line = pending.slice(0, newline)
              pending = pending.slice(newline + 1)
              if (line) worker.writes.push({ ...wireSnapshot(JSON.parse(line), child.pid), originalCalls: 1, receiverMatches: this === child.stdin, order: ++state.order })
            }
          } catch (error) { fault(error) }
          return Reflect.apply(originalWrite, this, writeArgs)
        }
        child.stdin.write = writeWrapper
        state.restores.push(restoreProperty(child.stdin, 'write', originalWrite, descriptor, writeWrapper))
        const onData = (bytes) => {
          try {
            response += bytes.toString('utf8')
            if (response.length > 128 * 1024) throw new Error('Incomplete observed response exceeds bound')
            let newline
            while ((newline = response.indexOf('\n')) >= 0) {
              const line = response.slice(0, newline)
              response = response.slice(newline + 1)
              if (!line) continue
              const message = JSON.parse(line)
              if (message.type === 'ready') worker.ready = message
              else if (['generation-progress', 'generation-done', 'error'].includes(message.type)) {
                if (worker.frames.length >= 256) throw new Error('Worker frame observation exceeds bound')
                worker.frames.push({ message, order: ++state.order })
              }
            }
          } catch (error) { fault(error) }
        }
        child.stdout.on('data', onData)
        state.restores.push(() => child.stdout.removeListener('data', onData))
        child.once('exit', (code, signal) => { worker.exit = { code, signal } })
        child.once('close', (code, signal) => { worker.close = { code, signal } })
      } catch (error) { fault(error) }
      return child
    }
    cp.spawn = spawnWrapper
    process.getBuiltinModule('module').syncBuiltinESMExports()
    state.restores.push(() => {
      restoreProperty(cp, 'spawn', originalSpawn, spawnDescriptor, spawnWrapper)()
      process.getBuiltinModule('module').syncBuiltinESMExports()
    })
    for (const contents of webContents.getAllWebContents()) {
      const original = contents.send, descriptor = Object.getOwnPropertyDescriptor(contents, 'send')
      const wrapper = function (channel, ...args) {
        try {
          if (channel === 'projects:generation-progress') {
            if (state.progress.length >= 512) throw new Error('Main progress observation exceeds bound')
            state.progress.push({ order: ++state.order, snapshot: structuredClone(args[0]) })
          }
        } catch (error) { fault(error) }
        return Reflect.apply(original, this, [channel, ...args])
      }
      contents.send = wrapper
      state.restores.push(restoreProperty(contents, 'send', original, descriptor, wrapper))
    }
    for (const channel of ['projects:generate', 'projects:cancel-generation-job', 'projects:retry-generation-job', 'projects:accept-generation-candidates', 'projects:save', 'projects:close', 'projects:undo', 'projects:redo', 'projects:update-generation-draft', 'projects:update-regional-guidance', 'projects:update-regional-guidance-prompt', 'projects:edit-regional-guidance-mask', 'projects:update-raster-layer', 'projects:set-generation-model']) {
      const original = ipcMain._invokeHandlers.get(channel)
      if (!original) throw new Error(`Missing original handler ${channel}`)
      const wrapper = async function (...args) {
        let record
        try {
          if (state.ipc.length >= 4096) throw new Error('IPC observation exceeds finite bound')
          record = { channel, args: structuredClone(args.slice(1)), originalCalls: 1, order: ++state.order, progressBefore: structuredClone(state.progress.at(-1) ?? null), finished: false }
          state.ipc.push(record)
        } catch (error) { fault(error) }
        try {
          const result = await Reflect.apply(original, this, args)
          if (record) record.ok = result?.ok
          return result
        } finally { if (record) record.finished = true }
      }
      ipcMain._invokeHandlers.set(channel, wrapper)
      state.restores.push(() => {
        if (ipcMain._invokeHandlers.get(channel) !== wrapper) throw new Error('IPC observer owner changed')
        ipcMain._invokeHandlers.set(channel, original)
      })
    }
  }, { evidence: fixture.artifacts, lifetime: activeLifetime.number, type: requestType })
}
async function observed(restore = false) {
  return await application.evaluate((_electron, restore) => {
    const state = globalThis.__installedAnimaRegional
    if (restore) {
      for (const callback of state.restores.toReversed()) callback()
      state.restored = true
    }
    return { workers: state.workers, ipc: state.ipc, progress: state.progress, faults: state.faults, restored: state.restored ?? false }
  }, restore)
}
function wires(snapshot) {
  return (snapshot?.workers ?? []).flatMap((worker) => worker.writes.filter(({ type }) => type === requestType).map((wire) => ({ ...wire, pid: worker.pid })))
}
async function bounds(label) {
  const value = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds: activeLifetime.deadlineSeconds,
    execute: (file, args, options) => exec(file, args.map((arg) => arg === 'MemoryMax=12G' ? 'MemoryMax=10G' : arg), options),
  })
  const groups = new Map(value.groups.map(({ group, memoryMax }) => [group, BigInt(memoryMax)]))
  groups.set(report.launcherBounds.group, BigInt(report.launcherBounds.memoryMax))
  const aggregate = [...groups.values()].reduce((sum, limit) => sum + limit, 0n)
  assert.ok(aggregate <= 12n * 1024n ** 3n, 'Combined launcher/native group ceilings exceed 12GiB')
  activeLifetime.checks.push(value)
  report.limits.push({ label, lifetime: activeLifetime.number, aggregateUniqueMax: String(aggregate), ...value })
  checkpoint()
}
async function launch() {
  assert.equal(application, undefined)
  activeLifetime = { number: report.lifetimes.length + 1, deadlineSeconds: Math.max(1, Math.floor(timeout(600_000) / 1000)), checks: [] }
  report.lifetimes.push(activeLifetime)
  const env = { ...process.env, NODE_ENV: 'production', XDG_DATA_HOME: path.dirname(fixture.appData), XDG_CONFIG_HOME: path.join(fixture.artifacts, 'config'), XDG_CACHE_HOME: path.join(fixture.artifacts, 'cache') }
  for (const name of ['ELECTRON_RUN_AS_NODE', 'IMAGEGEN_TEST_IMAGE_WORKER', 'IMAGEGEN_DEV_SERVER_URL', 'PYTHONPATH', 'PYTHONHOME', 'CUDA_VISIBLE_DEVICES']) delete env[name]
  application = await electron.launch({ args: ['--ozone-platform=x11', '.'], cwd: process.cwd(), env, timeout: timeout() })
  await bounds('launch')
  window = await isolateNativeSmokeWindow(application)
  window.setDefaultTimeout(15_000)
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await application.evaluate(({ app, BrowserWindow }, appData) => {
    if (app.getPath('userData') !== appData) throw new Error('Default Electron appData differs')
    BrowserWindow.getAllWindows()[0].setSize(1440, 900)
  }, fixture.appData)
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  await installObservers()
  database = openAppDatabase(fixture.appData, path.resolve('src/main/db/migrations'))
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await expect.poll(async () => (await database.db.selectFrom('project_index').selectAll().where('canonical_path', '=', project.file).execute()).length, { timeout: timeout() }).toBe(1)
  project.id = (await database.db.selectFrom('project_index').selectAll().where('canonical_path', '=', project.file).executeTakeFirstOrThrow()).local_project_key
  const runtime = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(runtime.ok, true)
  assert.equal(runtime.value.kind, 'ready')
  activeLifetime.runtime = runtime.value
  boundsTimer = setInterval(() => {
    boundsPending = boundsPending.then(() => bounds('periodic')).catch((error) => { report.boundsError = String(error.stack ?? error); checkpoint() })
  }, 5000)
  await openProject()
}
async function closeNative(label) {
  if (closing) return await closing
  closing = closeNativeBody(label).finally(() => { closing = undefined })
  return await closing
}
async function closeNativeBody(label) {
  if (!application) return
  clearInterval(boundsTimer)
  await boundsPending
  await bounds(`${label}-before-close`)
  activeLifetime.observers = await observed(true)
  assert.deepEqual(activeLifetime.observers.faults, [])
  assert.equal(activeLifetime.observers.restored, true)
  if (database) { await database.close(); database = null }
  const native = application, nativeProcess = native.process()
  let closeTimer
  try {
    await Promise.race([native.close(), new Promise((_, reject) => { closeTimer = setTimeout(() => reject(new Error('Owned Electron close exceeded 10s')), 10_000) })])
  } catch (error) {
    activeLifetime.closeError = String(error.stack ?? error)
    const latest = activeLifetime.checks.findLast(({ processIdentities }) => processIdentities.some(({ pid }) => pid === nativeProcess.pid))
    const identity = latest?.processIdentities.find(({ pid }) => pid === nativeProcess.pid)
    const group = latest?.groups.find(({ ownedScope, pids }) => ownedScope && pids.includes(nativeProcess.pid))
    assert.ok(identity && group, 'Failure stop requires exact owned native identity/scope')
    activeLifetime.stop = await stopExpiredQualificationProcess({ ...identity, group: group.group })
  } finally { clearTimeout(closeTimer) }
  activeLifetime.physicalExit = await confirmQualificationProcessExit(activeLifetime.checks)
  assert.equal(activeLifetime.physicalExit.confirmed, true)
  application = undefined
  window = undefined
  await assertRuntimeIdle(fixture.appData, await realpath(pointer.pythonExecutable))
  checkpoint()
}
async function api(method, ...args) {
  const result = await window.evaluate(({ method, args }) => window.api.projects[method](...args), { method, args })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function current() {
  const result = await api('open', project.id)
  assert.equal(result.kind, 'opened')
  return result.tab
}
const canvas = () => window.getByRole('region', { name: 'Project Canvas', exact: true })
const tray = () => window.getByRole('region', { name: 'Generation Results', exact: true })
const queueRow = (id) => window.locator(`[data-testid="queue-job-row"][data-job-id="${id}"]`)
async function screenshot(name) {
  const file = path.join(fixture.artifacts, `${name}.png`)
  await window.screenshot({ path: file, animations: 'disabled', timeout: timeout() })
  report.screenshots.push({ path: file, inspection: 'ROOT must open the screenshot; capture is not visual acceptance' })
  checkpoint()
}
async function openProject() {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toBeVisible({ timeout: timeout() })
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true', { timeout: timeout() })
}
async function targetState() {
  const tab = await current(), signature = generationTargetSignature(tab)
  assert.ok(signature)
  return await api('getGenerationTargetState', project.id, tab.documentId, sha(Buffer.from(signature)))
}
async function setInput(label, value) {
  const input = window.locator(`input[aria-label="${label}"]`)
  await expect(input).toBeEnabled({ timeout: timeout() })
  await input.fill(String(value))
  await input.press('Tab')
}
async function save() {
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await current()).dirty, { timeout: timeout() }).toBe(false)
}
async function openQueue() {
  await window.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
  await expect(window.getByRole('dialog', { name: 'Queue Manager', exact: true })).toBeVisible()
}
async function closeQueue() {
  await window.getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
}
async function generate(expectedCount) {
  await setInput('Images per click', 1)
  const button = window.getByRole('button', { name: 'Generate', exact: true })
  await expect(button).toBeEnabled({ timeout: timeout() })
  await button.click()
  await expect.poll(async () => (await ownRows()).length, { timeout: timeout(120_000) }).toBe(expectedCount)
  const result = (await ownRows()).find(({ id }) => !report.admitted?.includes(id))
  assert.ok(result)
  report.admitted = [...(report.admitted ?? []), result.id]
  checkpoint()
  return result
}
async function completed(id) {
  await expect.poll(async () => {
    const value = await row(id)
    assert.ok(!['failed', 'canceled'].includes(value.status), JSON.stringify(value))
    return value.status
  }, { timeout: timeout(600_000), intervals: [100, 250, 500] }).toBe('completed')
  await expect.poll(async () => (await api('getGenerationState', project.id)).phase, { timeout: timeout() }).toBe('idle')
}

// Independent PNG decoder: the same bounded filter reconstruction as the established
// installed harness. Production publishing/browser decoding are separate consumers.
function decodePng(bytes, expectedAlpha = 255) {
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
  let offset = 8, width, height, channels, icc, parts = []
  while (offset < bytes.length) {
    const size = bytes.readUInt32BE(offset), kind = bytes.toString('ascii', offset + 4, offset + 8)
    const data = bytes.subarray(offset + 8, offset + 8 + size)
    assert.equal(data.length, size)
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      assert.equal(data[8], 8); assert.ok([2, 6].includes(data[9])); assert.equal(data[12], 0)
      channels = data[9] === 2 ? 3 : 4
    } else if (kind === 'iCCP') icc = sha(inflateSync(data.subarray(data.indexOf(0) + 2), { maxOutputLength: 1024 ** 2 }))
    else if (kind === 'IDAT') parts.push(data)
    offset += size + 12
  }
  assert.equal(width, 512); assert.equal(height, 512); assert.equal(icc, IGS_SRGB_ICC_SHA256)
  const stride = width * channels, raw = inflateSync(Buffer.concat(parts), { maxOutputLength: (stride + 1) * height })
  assert.equal(raw.length, (stride + 1) * height)
  const output = Buffer.alloc(stride * height)
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    assert.ok(filter <= 4)
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? output[y * stride + x - channels] : 0
      const up = y ? output[(y - 1) * stride + x] : 0
      const corner = y && x >= channels ? output[(y - 1) * stride + x - channels] : 0
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, corner)][filter]
      output[y * stride + x] = (raw[y * (stride + 1) + x + 1] + predictor) & 255
    }
  }
  const rgb = Buffer.alloc(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    output.copy(rgb, i * 3, i * channels, i * channels + 3)
    if (channels === 4) assert.equal(output[i * 4 + 3], expectedAlpha)
  }
  return { width, height, channels, rgb, rgbSha256: sha(rgb), iccSha256: icc }
}
async function candidateOutput(jobId, name) {
  const results = await api('listGenerationResults', project.id)
  assert.equal(results.candidates.length, 1)
  const candidate = results.candidates[0]
  assert.equal(candidate.queueItemId, jobId)
  assert.equal(candidate.actualSeed, 123)
  assert.deepEqual(candidate.bbox, bbox)
  const fetched = await window.evaluate(async (url) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Signed Result PNG unavailable')
    return [...new Uint8Array(await response.arrayBuffer())]
  }, candidate.imageUrl)
  const bytes = Buffer.from(fetched), decoded = decodePng(bytes)
  assert.equal(decoded.channels, 3)
  const receipt = await database.db.selectFrom('generation_candidate_receipt').selectAll().where('queue_item_id', '=', jobId).executeTakeFirstOrThrow()
  assert.equal(receipt.image_sha256, sha(bytes))
  assert.equal(receipt.image_byte_size, bytes.length)
  assert.equal(receipt.actual_seed, 123)
  await writeFile(path.join(fixture.artifacts, `${name}.png`), bytes, { flag: 'wx', mode: 0o600 })
  return { candidate, receipt, bytes, decoded }
}
function semanticInput(value) {
  return {
    bbox: value.recipe.bbox, item: value.recipe.item,
    globalPrompts: value.recipe.globalPrompts,
    regions: value.recipe.regions.map(({ positive, negative, authoredPrompts, coverage }) => ({
      positive, negative, authoredPrompts,
      coverage: { ...coverage, alpha: undefined },
    })),
    compiledPrompts: value.compiledPrompts.map(({ sourceId: _sourceId, ...record }) => record),
    sampling: value.request?.job.sampling ?? value.sampling,
  }
}
async function verifyWire(wire) {
  assert.equal(wire.reportProgress, true)
  assert.equal(wire.originalCalls, 1)
  assert.equal(wire.receiverMatches, true)
  const value = wire.bundleJson
  assert.equal(value.compositionProfile, profile)
  assert.equal(value.promptInterpretation, interpretation)
  assert.equal(value.request.type, 'generate-anima-img2img')
  const actual = semanticInput(value), retained = semanticInput(baseline)
  const { sampling: actualSampling, ...actualRecipe } = actual
  const { sampling: retainedSampling, ...retainedRecipe } = retained
  assert.deepEqual(actualRecipe, retainedRecipe)
  assert.equal(retainedSampling.scheduler, 'euler')
  assert.deepEqual(actualSampling, expectedSampling)
  assert.equal(actualSampling.scheduler, 'heun')
  assert.equal(actualSampling.totalSteps, 19)
  assert.equal(actualSampling.strength, 0.5)
  assert.equal(value.request.job.sampling.mode, 'img2img')
  assert.equal(actualSampling.mode, 'img2img')
  assert.equal(actualSampling.posteriorSeed, expectedSampling.posteriorSeed)
  for (const [index, alpha] of wire.alphas.entries()) {
    const bytes = await readFile(alpha.retained)
    assert.ok(bytes.equals(Buffer.from(baseline.recipe.regions[index].coverage.alpha)), 'Frozen alpha differs from retained Main input')
  }
  const { request } = value
  for (const [role, file] of Object.entries(bundle)) assert.deepEqual(request.job.model[role], file)
  assert.deepEqual(request.job.loras, [])
  const target = await readFile(wire.target.retained)
  assert.equal(sha(target), wire.target.sha256)
  const decodedTarget = decodePng(target)
  assert.equal(decodedTarget.channels, 4, 'Original public IMG target must be wholly opaque RGBA')
  assert.ok(decodedTarget.rgb.equals(sourcePixels.rgb), 'Actual Main target composition changed source RGB')
  if (report.source.targetSha256 === undefined) report.source.targetSha256 = wire.target.sha256
  else assert.equal(wire.target.sha256, report.source.targetSha256, 'Frozen image source differs after saved authoring edits')
  const state = await api('getGenerationState', project.id)
  assert.equal(state.animaRegionalSupported, true)
  assert.equal(state.animaRegionalSamplingSupported, true)
  assert.equal(state.animaRegionalImg2ImgSupported, true)
}
async function progressBeforeCancel(id) {
  let evidence
  await expect.poll(async () => {
    const progress = await api('getGenerationProgress'), running = await row(id)
    if (running.status === 'pending') return false
    assert.equal(running.status, 'running', 'Cancel must observe real numerical progress before completion')
    const numeric = progress.current
    if (numeric?.jobId !== id || numeric.step < 1) return false
    assert.equal(numeric.totalSteps, expectedSampling.totalSteps)
    assert.equal(numeric.projectKey, project.id)
    assert.equal(numeric.documentId, project.document.documentId)
    assert.equal(numeric.statusSequence, running.status_sequence)
    const nodes = window.locator('[data-testid="generation-progress"]')
    await expect(nodes.first()).toBeVisible()
    evidence = { progress, row: running, text: await nodes.allTextContents() }
    // Cancel immediately on observed native progress. PNG capture and full wire
    // verification can outlast this short nineteen-evaluation run.
    await queueRow(id).getByRole('button', { name: 'Cancel job', exact: true }).click()
    return true
  }, { timeout: timeout(600_000), intervals: [100, 250] }).toBe(true)
  report.cancelProgress = evidence
  await screenshot('02-real-progress-cancel-requested')
}
async function editCurrent() {
  const before = await current(), second = before.regionalGuidance[1]
  const global = window.getByRole('textbox', { name: 'Positive prompt', exact: true })
  await global.fill('later ordinary authoring after frozen Anima cancellation')
  await global.press('Tab')
  await expect.poll(async () => (await current()).generationDraft.positivePrompt.text).toBe('later ordinary authoring after frozen Anima cancellation')
  const regionRow = window.locator(`[data-regional-guidance-id="${second.id}"]`)
  const prompt = regionRow.getByRole('textbox', { name: 'Regional prompt', exact: true })
  await expect(prompt).toBeEnabled({ timeout: timeout() })
  await prompt.fill('later green scarf authoring')
  await prompt.press('Tab')
  await regionRow.getByRole('button', { name: `Select ${second.name}`, exact: true }).click()
  await window.getByRole('button', { name: 'Clear mask', exact: true }).click()
  await expect.poll(async () => (await current()).regionalGuidance[1].mask.asset).toBe(null)
  for (const region of before.regionalGuidance) await window.locator(`[data-regional-guidance-id="${region.id}"]`).getByRole('button', { name: `Hide ${region.name}`, exact: true }).click()
  await setInput('Denoising Strength', 1)
  await window.getByRole('button', { name: `Hide ${before.layers.find(({ id }) => id === project.sourceLayerId).name}`, exact: true }).click()
  await expect.poll(async () => (await current()).layers.find(({ id }) => id === project.sourceLayerId).visible).toBe(false)
  await setInput('Steps', 2)
  await setInput('Generation seed', 999)
  await window.locator('[aria-label="Anima method"]').click()
  await window.getByText('Euler', { exact: true }).last().click()
  const model = window.locator('[aria-label="Generation model"]')
  await model.hover()
  await model.locator('.n-base-clear').click()
  await expect.poll(async () => (await current()).generationDraft.model).toBe(null)
  assert.equal((await targetState()).mode, 'txt2img')
  await save()
  const after = await current()
  assert.equal(after.generationDraft.sampling.steps, 2)
  assert.equal(after.generationDraft.sampling.denoisingStrength, 1)
  assert.equal(after.layers.length, 1)
  assert.equal(after.layers[0].id, project.sourceLayerId)
  assert.equal(after.layers[0].visible, false)
  assert.ok((await readIgsPackage(project.file)).project.layers[0].asset.sha256 === project.sourceAsset.sha256)
  assert.equal(after.generationDraft.sampling.animaMethod, 'euler')
  assert.deepEqual(after.generationDraft.seed, { policy: 'fixed', value: 999 })
  assert.ok(after.regionalGuidance.every(({ enabled }) => !enabled))
  assert.equal(after.regionalGuidance[1].prompts.positive.text, 'later green scarf authoring')
  report.edited = { sourceLayer: sourceUiState(after.layers[0]), generationDraft: after.generationDraft, regionalGuidance: after.regionalGuidance.map(({ maskImageUrl: _maskImageUrl, ...region }) => region), packageSha256: await hashFile(project.file) }
  await screenshot('03-edited-saved-before-restart')
}
function assertProvenance(provenance, candidate, frozen, pngSha256) {
  assert.equal(provenance.kind, 'anima-img2img')
  assert.equal(provenance.executionResultContext.queueItemId, candidate.queueItemId)
  assert.equal(provenance.executionResultContext.output.sha256, pngSha256)
  const config = provenance.generationConfiguration
  assert.equal(config.model.fileSha256, bundle.checkpoint.sha256)
  assert.equal(config.model.baseModelFamily, 'anima')
  assert.equal(config.positivePrompt.text, contract.globalPositive)
  assert.equal(config.negativePrompt.text, contract.globalNegative)
  assert.deepEqual(config.loras, [])
  assert.equal(config.anima.architecture, 'anima-base-1.0')
  assert.equal(config.anima.qwen3Encoder.sha256, bundle.qwen3Encoder.sha256)
  assert.equal(config.anima.vae.sha256, bundle.vae.sha256)
  assert.equal(config.sampling.steps, 20)
  assert.equal(config.sampling.cfgScale, 4)
  assert.equal(config.sampling.actualSeed, 123)
  assert.equal(config.sampling.animaMethod, 'heun')
  assert.equal(config.mode, 'img2img')
  assert.equal(config.sampling.denoisingStrength, 0.5)
  assert.equal(frozen.promptInterpretation, interpretation)
  assert.equal(frozen.context.animaPromptInterpretation, interpretation)
  assert.equal(frozen.context.sampling.animaMethod, 'heun')
  assert.equal(frozen.kind, 'anima-regional-img2img')
  assert.equal(frozen.context.kind, 'anima-img2img-preparation')
  assert.equal(frozen.context.sampling.denoisingStrength, 0.5)
  assert.deepEqual(frozen.workerJob.sampling, expectedSampling)
  assert.equal(provenance.layerSourceContext.sourceDocumentId, frozen.context.documentId)
  assert.equal(provenance.layerSourceContext.sourceDocumentRevision, frozen.context.documentRevision)
  const encoded = JSON.stringify(provenance)
  for (const forbidden of ['regionalGuidance', 'compositionProfile', 'compiledPrompts', 'regional:', ...contract.regionalTexts, fixture.appData]) assert.ok(!encoded.includes(forbidden), `Regional/internal field leaked into base provenance: ${forbidden}`)
}
function sourceUiState(layer) {
  assert.ok(layer)
  return Object.fromEntries(['id', 'name', 'visible', 'locked', 'opacity', 'blendMode', 'width', 'height', 'transform'].map((key) => [key, structuredClone(layer[key])]))
}
async function rasterBytes(layer) {
  return Buffer.from(await application.evaluate(async ({ net }, url) => {
    const response = await net.fetch(url)
    if (!response.ok) throw new Error('Signed Raster PNG unavailable')
    return [...new Uint8Array(await response.arrayBuffer())]
  }, layer.imageUrl))
}
async function assertSavedSource(saved, visible) {
  const source = saved.project.layers.find(({ id }) => id === project.sourceLayerId)
  assert.ok(source)
  assert.equal(source.kind, 'raster')
  assert.equal(source.visible, visible)
  assert.deepEqual(source.asset, project.sourceAsset)
  assert.deepEqual(source.transform, { x: bbox.x, y: bbox.y, scaleX: 1, scaleY: 1, rotationDegrees: 0 })
  assert.equal(source.opacity, 1)
  assert.equal(source.blendMode, 'normal')
  assert.equal(source.generationProvenance, undefined)
  assert.ok((await saved.readMember(source.asset.path)).equals(sourceBytes), 'Original source member changed')
  return source
}
async function acceptUndoSaveReopen(output, frozen) {
  await tray().getByRole('button', { name: 'Preview candidate 1', exact: true }).click()
  await expect(tray().getByRole('button', { name: 'Preview candidate 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await screenshot('05-retry-results-preview')
  const before = await current(), packageBefore = await hashFile(project.file)
  assert.equal(before.layers.length, 1)
  const originalSource = before.layers.find(({ id }) => id === project.sourceLayerId)
  const originalSourceState = sourceUiState(originalSource)
  assert.deepEqual(originalSourceState, report.edited.sourceLayer)
  assert.equal(originalSource.visible, false)
  assert.ok((await rasterBytes(originalSource)).equals(sourceBytes))
  await tray().getByRole('checkbox', { name: 'Select candidate 1', exact: true }).check()
  await tray().getByRole('button', { name: 'Add 1 as Layer', exact: true }).click()
  await expect.poll(async () => (await current()).layers.length, { timeout: timeout() }).toBe(2)
  const added = await current(), layer = added.layers.find(({ id }) => id !== project.sourceLayerId)
  assert.ok(layer)
  assert.equal(layer.kind, undefined)
  assert.equal(layer.resultComparisonSourceKind, 'raster')
  assert.equal(layer.resultPresetSourceKind, 'raster')
  assert.deepEqual(sourceUiState(added.layers.find(({ id }) => id === project.sourceLayerId)), originalSourceState)
  assert.equal(await hashFile(project.file), packageBefore, 'Add must not save implicitly')
  await canvas().getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await current()).layers.map(({ id }) => id)).toEqual([project.sourceLayerId])
  assert.deepEqual(sourceUiState((await current()).layers[0]), originalSourceState)
  await canvas().getByRole('button', { name: 'Redo', exact: true }).click()
  await expect.poll(async () => (await current()).layers.map(({ id }) => id)).toEqual([layer.id, project.sourceLayerId])
  assert.deepEqual(sourceUiState((await current()).layers.find(({ id }) => id === project.sourceLayerId)), originalSourceState)
  assert.equal(await hashFile(project.file), packageBefore)
  await save()
  const saved = await readIgsPackage(project.file), raster = saved.project.layers.find(({ id }) => id === layer.id)
  assert.equal(saved.project.layers.length, 2)
  assert.ok(raster)
  assert.equal(raster.kind, 'raster')
  assert.deepEqual(raster.transform, { x: bbox.x, y: bbox.y, scaleX: 1, scaleY: 1, rotationDegrees: 0 })
  assert.equal(raster.asset.sha256, sha(output.bytes))
  assert.ok((await saved.readMember(raster.asset.path)).equals(output.bytes))
  await assertSavedSource(saved, false)
  assertProvenance(raster.generationProvenance, output.candidate, frozen, sha(output.bytes))
  assert.deepEqual(saved.project.generationDraft, before.generationDraft)
  assert.equal(saved.project.lastActualSeedSnapshot, 123)
  const merged = decodePng(await saved.readMember('preview/merged.png'))
  assert.ok(merged.rgb.equals(output.decoded.rgb), 'Merged preview must consume the visible accepted layer, with source hidden')
  report.accepted = { layerId: layer.id, asset: raster.asset, provenance: raster.generationProvenance, sourceLayerId: project.sourceLayerId, sourceState: originalSourceState, mergedRgbSha256: merged.rgbSha256, packageSha256: await hashFile(project.file) }
  await screenshot('06-raster-after-add-undo-redo-save')
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveCount(0)
  await openProject()
  const reopened = await current()
  assert.equal(reopened.dirty, false)
  assert.deepEqual(reopened.layers.map(({ id }) => id), [layer.id, project.sourceLayerId])
  assert.deepEqual(sourceUiState(reopened.layers.find(({ id }) => id === project.sourceLayerId)), originalSourceState)
  assert.deepEqual(reopened.generationDraft, before.generationDraft)
  assert.ok((await rasterBytes(reopened.layers.find(({ id }) => id === layer.id))).equals(output.bytes))
  assert.ok((await rasterBytes(reopened.layers.find(({ id }) => id === project.sourceLayerId))).equals(sourceBytes))
  await screenshot('07-reopened-raster')
  check('Actual Results Add1to2, Undo2to1, Redo1to2, explicit Save/reopen preserve the source Raster, base-only Anima IMG provenance and exact accepted/merged RGB')
}
async function verifyObservers() {
  const snapshots = report.lifetimes.map(({ observers }) => observers)
  const observedWires = allWires()
  assert.equal(observedWires.length, 3)
  for (const snapshot of snapshots) {
    assert.deepEqual(snapshot.faults, [])
    assert.equal(snapshot.restored, true)
    for (const worker of snapshot.workers.filter(({ writes }) => writes.some(({ type }) => type === requestType))) {
      assert.equal(await realpath(worker.executable), await realpath(pointer.pythonExecutable))
      assert.ok(worker.args.includes('imagegen_worker.owned_inference'))
      assert.ok(worker.ready.capabilities.includes(capability))
      assert.ok(worker.ready.capabilities.includes(samplingCapability))
      assert.ok(worker.ready.capabilities.includes(imageCapability))
      assert.equal(worker.ready.runtimeProfile, 'linux-nvidia')
      assert.equal(worker.originalCalls, 1)
    }
  }
  const calls = snapshots.flatMap(({ ipc }) => ipc)
  for (const [channel, count] of Object.entries({
    'projects:generate': 2, 'projects:cancel-generation-job': 1, 'projects:retry-generation-job': 1,
    'projects:accept-generation-candidates': 1, 'projects:undo': 1, 'projects:redo': 1,
    'projects:edit-regional-guidance-mask': 1, 'projects:update-raster-layer': 1, 'projects:set-generation-model': 1, 'projects:save': 2,
  })) {
    const selected = calls.filter((call) => call.channel === channel)
    assert.equal(selected.length, count, channel)
    assert.ok(selected.every(({ originalCalls, finished, ok }) => originalCalls === 1 && finished && ok === true))
  }
  const cancel = calls.find(({ channel }) => channel === 'projects:cancel-generation-job')
  assert.equal(cancel.progressBefore.snapshot.current.jobId, report.canceled.id)
  assert.ok(cancel.progressBefore.snapshot.current.step >= 1)
  for (const [index, wire] of observedWires.entries()) {
    const worker = snapshots.flatMap(({ workers }) => workers).find(({ pid }) => pid === wire.pid)
    const frames = worker.frames.filter(({ message }) => message.requestId === wire.requestId)
    const progress = frames.filter(({ message }) => message.type === 'generation-progress').map(({ message }) => message)
    assert.ok(progress.length > 0)
    assert.deepEqual(progress.map(({ step }) => step), Array.from({ length: progress.length }, (_, index) => index + 1))
    for (const message of progress) {
      keys(message, ['type', 'protocolVersion', 'requestId', 'step', 'totalSteps'])
      assert.equal(message.totalSteps, expectedSampling.totalSteps)
    }
    const done = frames.filter(({ message }) => message.type === 'generation-done')
    assert.equal(done.length, index === 1 ? 0 : 1)
    if (index !== 1) assert.equal(progress.length, expectedSampling.totalSteps)
  }
  report.requestCount = observedWires.length
}
async function run() {
  await prepare()
  await launch()
  assert.equal((await targetState()).mode, 'img2img')
  const initial = await current()
  assert.equal(initial.layers.length, 1)
  assert.equal(initial.layers[0].id, project.sourceLayerId)
  assert.ok((await rasterBytes(initial.layers[0])).equals(sourceBytes))
  await screenshot('00-public-anima-ready')
  const healthy = await generate(1)
  await completed(healthy.id)
  const control = await candidateOutput(healthy.id, 'healthy-control')
  const firstObserved = await observed(), firstWire = wires(firstObserved)[0]
  assert.equal(wires(firstObserved).length, 1)
  await verifyWire(firstWire)
  await tray().getByRole('button', { name: 'Preview candidate 1', exact: true }).click()
  await screenshot('01-healthy-results')
  const historical = decodePng(await readFile(fixture.baseline.png.path))
  report.control = { id: healthy.id, pngSha256: sha(control.bytes), rgbSha256: control.decoded.rgbSha256, historicalRgbSha256: historical.rgbSha256, historicalRgbExact: control.decoded.rgb.equals(historical.rgb), historicalScope: 'Context only; current worker and float environment may differ' }
  assert.equal(await hashFile(project.file), project.initialPackageSha256)
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  const close = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect(close).toBeVisible()
  await close.getByRole('button', { name: 'Discard Candidates and Close', exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveCount(0)
  await openProject()
  const canceled = await generate(2)
  await openQueue()
  await progressBeforeCancel(canceled.id)
  await bounds('actual-progress-before-cancel')
  const before = await observed(), secondWire = wires(before)[1]
  assert.equal(wires(before).length, 2)
  await verifyWire(secondWire)
  await expect.poll(async () => (await row(canceled.id)).status, { timeout: timeout() }).toBe('canceled')
  await expect.poll(async () => (await api('getGenerationState', project.id)).phase, { timeout: timeout() }).toBe('idle')
  assert.equal((await api('getGenerationProgress')).current, null)
  await expect(queueRow(canceled.id).locator('[data-testid="generation-progress"]')).toHaveCount(0)
  report.canceled = await row(canceled.id)
  assert.equal(report.canceled.frozen_payload_json, canceled.frozen_payload_json)
  assert.equal(await hashFile(project.file), project.initialPackageSha256)
  assert.equal((await database.db.selectFrom('generation_candidate_receipt').selectAll().where('local_project_key', '=', project.id).execute()).length, 1)
  await closeQueue()
  await editCurrent()
  await closeNative('saved-authoring-restart')
  await launch()
  assert.equal(await hashFile(project.file), report.edited.packageSha256)
  assert.deepEqual((await current()).generationDraft, report.edited.generationDraft)
  assert.equal((await targetState()).mode, 'txt2img')
  assert.deepEqual(sourceUiState((await current()).layers.find(({ id }) => id === project.sourceLayerId)), report.edited.sourceLayer)
  await openQueue()
  await expect(queueRow(canceled.id)).toContainText('Canceled')
  const retry = queueRow(canceled.id).getByRole('button', { name: 'Retry job', exact: true })
  await expect(retry).toBeEnabled({ timeout: timeout() })
  await retry.click()
  await expect.poll(async () => (await ownRows()).length, { timeout: timeout() }).toBe(3)
  const retried = (await ownRows()).find(({ id }) => id !== healthy.id && id !== canceled.id)
  assert.ok(retried)
  assert.equal(retried.frozen_payload_json, canceled.frozen_payload_json)
  assert.notEqual(retried.batch_id, canceled.batch_id)
  assert.notEqual(retried.staging_session_id, canceled.staging_session_id)
  report.retry = { id: retried.id, canceledId: canceled.id, frozenPayloadSha256: sha(Buffer.from(retried.frozen_payload_json)) }
  await screenshot('04-explicit-frozen-queue-retry')
  await closeQueue()
  await completed(retried.id)
  const retryObserved = await observed(), thirdWire = wires(retryObserved)[0]
  assert.equal(wires(retryObserved).length, 1)
  await verifyWire(thirdWire)
  assert.deepEqual(semanticInput(thirdWire.bundleJson), semanticInput(secondWire.bundleJson))
  const output = await candidateOutput(retried.id, 'frozen-retry')
  assert.ok(output.decoded.rgb.equals(control.decoded.rgb), 'Frozen Retry RGB must equal every decoded healthy-control channel')
  report.retry.rgbExactHealthyControl = true
  assert.equal(await hashFile(project.file), report.edited.packageSha256, 'Completion must not save or rewrite current authoring')
  await acceptUndoSaveReopen(output, JSON.parse(retried.frozen_payload_json))
  report.finalSql = await snapshotSql()
  preserveSql(report.finalSql)
  report.finalOwnRows = await ownRows()
  assert.deepEqual(report.finalOwnRows.map(({ status }) => status).sort(), ['canceled', 'completed', 'completed'])
  assert.ok(report.finalOwnRows.every(({ operation }) => operation === 'anima-regional-img2img'))
  const receipts = await database.db.selectFrom('generation_candidate_receipt').selectAll().where('local_project_key', '=', project.id).execute()
  assert.equal(receipts.length, 2)
  assert.ok(receipts.every(({ actual_seed, status }) => actual_seed === 123 && status === 'completed'))
  assert.equal((await database.db.selectFrom('generation_seed_cursor').selectAll().where('local_project_key', '=', project.id).executeTakeFirstOrThrow()).actual_seed, 123)
  await closeNative('finished')
  await verifyObservers()
  assert.deepEqual(await treeManifest(provision.installed.workerRoot), installedBefore)
  assert.deepEqual(await json(path.join(fixture.appData, 'qualification-runtime.json')), marker)
  assert.deepEqual(await json(path.join(fixture.appData, 'runtime/current-runtime.json')), pointer)
  for (const file of sourceFiles) assert.equal(await hashFile(file), report.sourcePins[file])
  for (const [role, file] of Object.entries(bundle)) assert.deepEqual(statIdentity(await regular(file.path)), report.catalog.fileStats[role], 'Protected original model storage changed')
  for (const file of report.protectedProjects) {
    assert.deepEqual(statIdentity(await regular(file.path)), file.stat)
    assert.equal(await hashFile(file.path), file.sha256)
  }
  for (const value of [fixture.provisionReport, ...Object.values(fixture.baseline), fixture.source]) await descriptor(value)
  assert.deepEqual(statIdentity(await regular(fixture.source.path)), statIdentity(sourceStat), 'Protected original source PNG storage changed')
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.boundsError, undefined)
  report.status = 'passed'
  check('Three real installed Heun IMG requests, 19-evaluation progress, frozen retry RGB equality, original Results Add1to2/Undo2to1/Redo1to2/Save/reopen preserving source, restored observers, unchanged pre-existing SQL/runtime and physical exit confirmed')
}

checkpoint()
timer = setTimeout(() => {
  report.deadlineExceeded = true
  report.status = 'failed'
  checkpoint()
  // The inherited/systemd native watchdogs remain authoritative if this launcher
  // cannot service its timer. No signals target unrelated processes or app data.
  void closeNative('deadline').catch((error) => { report.deadlineCloseError = String(error.stack ?? error); checkpoint() })
}, fixture.deadlineSeconds * 1000)
try { await run() }
catch (caught) {
  error = caught
  report.status = 'failed'
  report.error = String(caught.stack ?? caught)
  if (window) await screenshot('failure-context').catch(() => {})
} finally {
  clearTimeout(timer)
  if (application) {
    try { await closeNative('failure') }
    catch (caught) { report.physicalExitError = String(caught.stack ?? caught); error ??= caught }
  }
  if (database) await database.close()
  report.finishedAt = new Date().toISOString()
  report.elapsedSeconds = (Date.now() - started) / 1000
  checkpoint()
}
process.stdout.write(JSON.stringify({ status: report.status, report: reportPath, requestCount: report.requestCount ?? null }) + '\n')
if (error || report.status !== 'passed') process.exitCode = 1
