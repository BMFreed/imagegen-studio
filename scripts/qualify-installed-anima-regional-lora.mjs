/**
 * Opt-in installed Anima Regional global-LoRA qualification; ROOT supplies --fixture ABS.json.
 * Reuses existing batch/OUT/IMG observers and real UI/queue/resource owners. Each mode compares
 * fixed seed123 / static prompts under enabled exact LoRA weight-0.5 versus enabled weight0.
 * TXT/IMG accept A first, hide only that accepted Raster for exact-target zero controlB, then
 * explicitly discardB and show/save A. OUT explicitly replaces temporary A with B, then discardsB;
 * it additionally cancels one pending sibling and one running request, then restarts and retries
 * only its frozen seed123 member. Total8 requests/7 PNGs.
 *
 * InvokeAI b0ac163b139c432aff4c51078c31c074bf292f72: core/graph.ts connects Anima LoRA collection
 * output to global Qwen encoding/transformer; addRegionalGuidance.ts copies those encoder edges to
 * regional conditioning. anima_text_encoder.py and anima_denoise.py apply the stack before encoding
 * and regional denoising. Studio reuses its existing ordinary scoped LoRA owner.
 *
 * Fixture: existing installed OUT fixture keys plus mode:'txt2img'|'img2img'|'outpaint' and
 * lora:{modelId,versionId,managedPath,sha256,byteSize}; profile installed-anima-regional-lora-v1,
 * schemaVersion1. ROOT owns all execution,600-second/2+10GiB/no-swap guards and cleanup. No
 * runtime, model or source image copies; no new numeric loop, Python fake or availability
 * override.
 *
 * The additive installed-anima-regional-negative-v1 profile reuses these mode/lifetime owners
 * without LoRAs. InvokeAI4875d96531ca6712b288f6e660fcbb34143408c1 routes the negative collector
 * through anima_denoise.py and backend/anima/{regional_prompting,anima_transformer_patch}.py:
 * global negative stays image-wide; regional signed ranges keep their own masks on even blocks.
 * Its fixture omits only lora. A/B changes one local nonempty negative from(red scarf)1.5 to
 * (green scarf)1.5, with the neighboring region inheriting the unchanged global negative.
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
import { InferenceAuxiliaryResources } from '../src/main/runtime/inference-auxiliary-resources.ts'
import { assertOutpaintContribution } from '../src/main/projects/outpaint-contribution.ts'
import {
  INVOKE_ALPHA_OUTPAINT_POLICY_V1,
  LAMA_OUTPAINT_IDENTITY_V1,
} from '../src/shared/projects/alpha-outpaint.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { compileAnimaFlowSamplingPlan } from '../src/shared/projects/anima-flow-sampling-plan.ts'
import { generationTargetSignature } from '../src/shared/projects/project-generation-target-state.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  stopExpiredQualificationProcess,
} from './qualification-resource-limits.mjs'
import {
  assertRuntimeIdle,
  assertUpgradeBounds,
  treeManifest,
} from './upgrade-qualification-worker.mjs'

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
const outpaintCapability = 'anima-regional-outpaint-v1'
const loraCapability = 'anima-regional-lora-v1'
const negativeCapability = 'anima-regional-negative-v1'
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
const negativeProfile = fixture.profile === 'installed-anima-regional-negative-v1'
keys(fixture, [
  'schemaVersion',
  'profile',
  'appData',
  'artifacts',
  'deadlineSeconds',
  'provisionReport',
  'catalog',
  'baseline',
  'source',
  'mode',
  ...(!negativeProfile ? ['lora'] : []),
])
assert.equal(fixture.schemaVersion, 1)
assert.ok(
  negativeProfile || fixture.profile === 'installed-anima-regional-lora-v1',
  'Use an explicitly supported installed Anima profile',
)
assert.ok(['txt2img', 'img2img', 'outpaint'].includes(fixture.mode))
const outpaint = fixture.mode === 'outpaint'
const imageInput = fixture.mode !== 'txt2img'
const requestBudget = outpaint ? 4 : 2
const globalPositive = '(two white cats)1.25 on one bench'
const activeWeight = -0.5
const controlWeight = 0
const activeNegative = '(red scarf)1.5'
const controlNegative = '(green scarf)1.5'
const dormantNegative = 'dormant local negative preserved'
const activeSetting = negativeProfile ? activeNegative : activeWeight
const controlSetting = negativeProfile ? controlNegative : controlWeight
assert.equal(fixture.appData, sharedAppData)
assert.ok(
  Number.isSafeInteger(fixture.deadlineSeconds) &&
    fixture.deadlineSeconds > 0 &&
    fixture.deadlineSeconds <= 600,
)
keys(fixture.catalog, ['modelId', 'versionId'])
for (const id of Object.values(fixture.catalog)) assert.match(id, /^[a-f0-9-]{36}$/i)
if (!negativeProfile) {
  keys(fixture.lora, ['modelId', 'versionId', 'managedPath', 'sha256', 'byteSize'])
  for (const key of ['modelId', 'versionId']) assert.match(fixture.lora[key], /^[a-f0-9-]{36}$/i)
  canonical(fixture.lora.managedPath)
  assert.match(fixture.lora.sha256, /^[a-f0-9]{64}$/)
  assert.ok(Number.isSafeInteger(fixture.lora.byteSize) && fixture.lora.byteSize > 0)
  assert.ok(!within(fixture.artifacts, fixture.lora.managedPath))
}
keys(fixture.baseline, ['contract', 'bundle', 'input', 'png'])
for (const value of [fixturePath, fixture.appData, fixture.artifacts]) {
  canonical(value)
  assert.ok(within(artifactRoot, value))
}
assert.ok(
  !within(fixture.appData, fixture.artifacts) && !within(fixture.artifacts, fixture.appData),
)
assert.equal(
  existsSync(fixture.artifacts),
  false,
  'Use a fresh evidence directory; no reset is implemented',
)
for (const value of [fixture.provisionReport, ...Object.values(fixture.baseline), fixture.source])
  await descriptor(value, 16 * 1024 ** 2)
const contract = await json(fixture.baseline.contract.path)
const bundle = await json(fixture.baseline.bundle.path)
const baseline = await json(fixture.baseline.input.path, 16 * 1024 ** 2)
assert.deepEqual(contract.regionalTexts, [
  '(red scarf)1.5, one white cat',
  '(blue scarf)1.5, one white cat',
])
assert.equal(contract.globalPositive, '(two white cats)1.25 on one bench')
assert.equal(contract.globalNegative, '(blur)0.75, noise')
const bbox = { x: -13, y: 5, width: 512, height: 512 }
const sourceOffset = outpaint ? 128 : 0
const sourceTransform = {
  x: bbox.x + sourceOffset,
  y: bbox.y + sourceOffset,
  scaleX: 1,
  scaleY: 1,
  rotationDegrees: 0,
}
assert.deepEqual(baseline.recipe.bbox, bbox)
assert.equal(baseline.recipe.item.seed, 123)
assert.equal(baseline.sampling.steps, 20)
assert.equal(baseline.sampling.guidanceScale, 4)
assert.equal(baseline.sampling.scheduler, 'euler')
assert.equal(baseline.recipe.globalPrompts.positive.text, contract.globalPositive)
assert.equal(baseline.recipe.globalPrompts.negative.text, contract.globalNegative)
assert.deepEqual(
  baseline.recipe.regions.map(({ positive }) => positive.text),
  contract.regionalTexts,
)
assert.ok(
  baseline.recipe.regions.every(
    ({ negative }) => negative.source === 'regional' && negative.prompt.text === '',
  ),
)
assert.ok(baseline.authoredDocument && baseline.authoredDocument.layers.length === 0)
const sampled = { left: 0, right: 0, overlap: 0, background: 0 }
for (let y = 0; y < 32; y++)
  for (let x = 0; x < 32; x++) {
    const index = y * 16 * 512 + x * 16
    const left = baseline.recipe.regions[0].coverage.alpha[index] >= 128
    const right = baseline.recipe.regions[1].coverage.alpha[index] >= 128
    sampled.left += Number(left)
    sampled.right += Number(right)
    sampled.overlap += Number(left && right)
    sampled.background += Number(!left && !right)
  }
assert.deepEqual(sampled, { left: 544, right: 512, overlap: 32, background: 0 })
const samplingFor = (seed) =>
  compileAnimaFlowSamplingPlan({
    mode: imageInput ? 'img2img' : 'txt2img',
    width: bbox.width,
    height: bbox.height,
    steps: 20,
    seed,
    guidanceScale: 4,
    strength: imageInput ? 0.5 : null,
    scheduler: 'heun',
  })
const expectedSampling = samplingFor(123)
assert.equal(expectedSampling.totalSteps, imageInput ? 19 : 39)
if (imageInput) {
  assert.equal(expectedSampling.startStep, 10)
  assert.equal(expectedSampling.posteriorSeed, (123 ^ 0x9e3779b9) >>> 0)
}
assert.ok(
  within(artifactRoot, fixture.source.path) && !within(fixture.artifacts, fixture.source.path),
)
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
  schemaVersion: 1,
  profile: fixture.profile,
  status: 'running',
  fixtureSha256: await hashFile(fixturePath),
  invokeRevision: negativeProfile
    ? '4875d96531ca6712b288f6e660fcbb34143408c1'
    : 'b0ac163b139c432aff4c51078c31c074bf292f72',
  invokeSourcePins: negativeProfile ? {
    'invokeai/app/invocations/anima/anima_denoise.py':
      '8adb45e054d0425547fd4db3fcdf95e20396ca28e0fb72b52a9d6e71d230cdcf',
    'invokeai/backend/anima/regional_prompting.py':
      '92c7436d039bbea68d0bc802fc708bff1a2f13b462343f936ee6eef50ca059fc',
    'invokeai/backend/anima/anima_transformer_patch.py':
      '76d1a69b873c857f41b8e5a4ebc9ea3734e681b36dc7d48422c4e8a452795f03',
    'invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts':
      '4465a25022b33be040ed41cb6d207014fe10c24696357131c1b299a406b93f98',
    'invokeai/backend/architectures/defs/anima.py':
      'd05e063f0406263c034adcebac6a177bae3874228dc69141843e5cf6df9e325c',
  } : {
    'invokeai/frontend/webv2/src/features/generation/core/graph.ts':
      '98b965560da36e51d5c3156792af9e5c304d89374296a7404c424bb56c46c8b2',
    'invokeai/app/invocations/text_encoder/anima_text_encoder.py':
      '0f83ee0120a297caa6a0ebaeb54ca7aabc9c579f196dd6a08d71a1ea5c7d3ec1',
    'invokeai/app/invocations/anima/anima_lora_loader.py':
      'e3382e947b532716020be82e11f4bc00b541c253f6a1f5b7876ef93fd0c33148',
    'invokeai/frontend/webv2/src/features/queue/core/promptBatch.ts':
      '63d418074937fc31bd1c737e26d145621c4042363e88671023dfc8c780ed3b4a',
    'invokeai/frontend/webv2/src/features/queue/data/submissionApi.ts':
      '0e29acfee5074ea05cf4b7e313e23ec1ede3d7c2187aaf72992ed03d855ead84',
    'invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts':
      'dc4ed5ba778ebfdb868fda3d21c62980bb6630c512f4dc1f7694e62537ffed60',
    'invokeai/app/services/session_queue/session_queue_common.py':
      '04d2ca9c86b16ffbe8683f2d0f4358146f0b3f1f6b43f55196f501882b8ea616',
    'invokeai/app/services/session_queue/session_queue_default.py':
      '1d683578c72030a6d15789e3b0e6ccc1e831b50d99dcde4bbaf4127fdb8defaa',
    'invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts':
      '9db44bc894d4600b63673770a577a90e473c37abde48aee2e9a01ba5a42365df',
    'invokeai/app/invocations/vae/anima_image_to_latents.py':
      'df665b42772db1aec26d487d5fdeae00bbead74e4bb1854d1762a0fb87e1f1b6',
    'invokeai/backend/anima/scheduler_driver.py':
      '3d2f9e3531607e2e9a42e160aefd25e8fc3aec15dab40551e04dca691408a32d',
    'invokeai/app/invocations/anima/anima_denoise.py':
      '34511531b56e6e589e0f7a0071a9c86d8bc1b2c78f3150ceb282185ec2511e56',
    'invokeai/backend/anima/regional_prompting.py':
      '42b955b97b78c1853274f81f1c42cf906501ed8992523a35aa0109bc559dcbce',
    'invokeai/backend/rectified_flow/rectified_flow_inpaint_extension.py':
      'a7a77d7ac6433b5ad930716bf21852a97a81960688e8670a8120e8d26f94e721',
    'invokeai/app/invocations/sd/create_gradient_mask.py':
      '8d841f7bc6ab7678232baa3d42fb87d2fd50534b48b128a52ca4c6ac24557e7c',
    'invokeai/app/invocations/infill.py':
      '41e7b795833c59ba2063299a0f049a49f72cbec1a5e1f75f438cfc19274759bc',
  },
  sampledCoverage: sampled,
  startedAt: new Date(started).toISOString(),
  requestBudget,
  fixture,
  lifetimes: [],
  screenshots: [],
  pageErrors: [],
  sourcePins: {},
  limits: [],
  checks: [],
  expectedSampling,
  planAdaptation:
    negativeProfile
      ? 'Separate local-negative settings require separate Generate actions. TXT/IMG accept A first and hide only that Raster for B; OUT explicitly replaces temporary A with B, then selected frozen Retry recreates A. No implicit acceptance or Add1/Discard1 claim.'
      : 'Separate weight settings require separate Generate actions. Existing temporary-result replacement prevents retaining A and B together. TXT/IMG accept A first and hide only that Raster for B; OUT uses explicit Discard and Generate after retaining A, then frozen Retry recreates A. No Add1/Discard1 claim for this slice.',
  boundaries: {
    runtime:
      'Default installed RuntimeManager; no injected worker, availability, model, or ML adapter',
    pixels:
      negativeProfile
        ? 'A/B changes only local region0 negative text, retaining nonempty signed bank length/global/inherited/positive/masks/source/seed/arrays. Visible reopened RGB must differ. OUT selected frozen Retry equals its own A RGBA; alpha/source-over remain exact.'
        : 'Healthy nonzero versus enabled-zero exact LoRA share seed/text/masks/source/arrays; RGB must differ. OUT frozen Retry equals its own nonzero healthy RGBA. Original source-over is independently checked.',
    composite: outpaint
      ? 'Saved640-square source/contribution union checks exact alpha/protected/generated/source-only pixels, existing1-unit soft RGB rounding only'
      : 'Saved512-square opaque accepted Raster is checked against every reopened published RGB byte',
    sampling:
      negativeProfile
        ? 'Unchanged ordinary Heun20 compiler: TXT39 evaluations; IMG/OUT strength0.5 gives19. Negative A/B controls use seed123 and exact arrays; canceled pending sibling alone has seed124.'
        : 'Unchanged ordinary Heun20 compiler: TXT39 evaluations; IMG/OUT strength0.5 gives19. Healthy and enabled-zero controls use identical seed123/arrays; canceled pending sibling alone has seed124.',
    source: imageInput
      ? 'Exact canonical preceding RGB PNG prepared through ProjectSession without pixel edits/resampling; actual source composition and frozen snapshot verified; not Import UI qualification'
      : 'Genuine transparent Current Canvas, no source Raster; original source descriptor is protected but unused',
    visual:
      'Screenshots retained for ROOT inspection; screenshot capture alone is not visual acceptance',
    cleanup:
      'No input, project, model, environment, evidence or ordinary application data deletion',
  },
}
const checkpoint = () =>
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
const check = (description, evidence) => {
  report.checks.push({
    description,
    at: new Date().toISOString(),
    ...(evidence ? { evidence } : {}),
  })
  checkpoint()
}
let database,
  application,
  window,
  project,
  provision,
  marker,
  pointer,
  installedBefore,
  baselineSql,
  outpaintInfill
let timer,
  boundsTimer,
  boundsPending = Promise.resolve(),
  activeLifetime,
  error,
  closing
const allWires = () => report.lifetimes.flatMap(({ observers }) => wires(observers))
const frozenNegativeInputs = new Map()
const workerFiles = [
  'anima_outpaint.py',
  'outpaint_worker_assets.py',
  'outpaint_conditioning.py',
  'lama_infill.py',
  'anima_regional.py',
  'anima_regional_worker.py',
  'inference_main.py',
  'anima_worker.py',
  'inference_anima.py',
  'anima_euler.py',
  'anima_conditioning.py',
  'anima_sampling.py',
  'anima_flow_sampling.py',
  'anima_lora.py',
]
const migrationFiles = (await readdir('src/main/db/migrations'))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
  .sort()
assert.equal(migrationFiles.length, 26)
assert.ok(migrationFiles.at(-1).startsWith('0026_'))
const sourceFiles = [
  'scripts/qualify-installed-anima-regional-lora.mjs',
  'scripts/qualify-installed-anima-regional-batch.mjs',
  'scripts/qualify-installed-anima-regional-outpaint.mjs',
  'scripts/qualify-installed-anima-regional.mjs',
  'src/main/projects/anima-regional-worker-request.ts',
  ...(negativeProfile ? ['src/main/projects/project-current-canvas-anima-regional-input.ts'] : []),
  'src/main/projects/anima-regional-queued-generation.ts',
  'src/main/projects/project-regional-generation-coordinator.ts',
  'src/main/projects/regional-generation-processor.ts',
  'src/main/projects/generation-worker-client.ts',
  'src/main/projects/generation-orchestrator.ts',
  'src/shared/projects/regional-invoke-generation.ts',
  'src/main/projects/generation-queue.ts',
  'src/main/projects/generation-staging.ts',
  'src/main/projects/generation-action-controller.ts',
  'src/main/projects/regional-queued-generation.ts',
  'src/shared/projects/generation-queue-manager.ts',
  'src/shared/projects/project-generation-actions.ts',
  ...migrationFiles.map((name) => `src/main/db/migrations/${name}`),
  'src/shared/projects/anima-flow-sampling-plan.ts',
  'src/shared/projects/inference-worker-capabilities.ts',
  'src/shared/projects/project-generation-target-state.ts',
  'src/main/projects/project-generation-provenance.ts',
  'scripts/qualify-installed-anima-regional-img2img.mjs',
  'src/main/runtime/inference-auxiliary-resources.ts',
  'src/main/runtime/lama-manifest.ts',
  'src/main/projects/outpaint-worker-request.ts',
  'src/main/projects/outpaint-conditioning.ts',
  'src/main/projects/outpaint-contribution.ts',
  'src/shared/projects/alpha-outpaint.ts',
  'dist/main/main.cjs',
  ...workerFiles.map((name) => `worker-python/src/imagegen_worker/${name}`),
]
const statIdentity = (entry) => ({
  device: entry.dev,
  inode: entry.ino,
  mode: entry.mode,
  links: entry.nlink,
  bytes: entry.size,
  modified: entry.mtimeMs,
  changed: entry.ctimeMs,
})

async function snapshotSql() {
  const names = (
    await sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`.execute(
      database.db,
    )
  ).rows.map(({ name }) => name)
  const result = {}
  for (const name of names) {
    assert.match(name, /^[a-zA-Z_][a-zA-Z0-9_]*$/)
    result[name] = (await sql.raw(`SELECT * FROM "${name}"`).execute(database.db)).rows.sort(
      (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)),
    )
  }
  return result
}
function preserveSql(actual) {
  assert.deepEqual(Object.keys(actual), Object.keys(baselineSql))
  // Production Home startup/Refresh reindexes every saved package. Exclude only
  // its explicitly recorded rebuildable timestamp; preserve all other fields.
  const normalized = (name, row) =>
    JSON.stringify(name === 'project_index' ? { ...row, indexed_at: null } : row)
  report.sqlPreservation = {
    exclusions: [
      {
        table: 'project_index',
        field: 'indexed_at',
        reason: 'Original Home scanWorkspace refresh timestamp only',
      },
    ],
    cacheRefreshes: [],
  }
  const owned = new Set([project.id, project.file, project.document.documentId])
  for (const row of actual.generation_queue_item.filter(
    ({ local_project_key }) => local_project_key === project.id,
  )) {
    for (const key of ['id', 'batch_id', 'staging_session_id', 'origin_request_id'])
      if (row[key]) owned.add(row[key])
  }
  const own = (row) => Object.values(row).some((value) => owned.has(value))
  for (const [name, rows] of Object.entries(baselineSql)) {
    const after = actual[name]
    const beforeKeys = new Set(rows.map((row) => normalized(name, row)))
    for (const row of rows) {
      const retained = after.find(
        (candidate) => normalized(name, candidate) === normalized(name, row),
      )
      assert.ok(retained, `Pre-existing ${name} row changed`)
      if (name === 'project_index' && retained.indexed_at !== row.indexed_at)
        report.sqlPreservation.cacheRefreshes.push({
          projectKey: row.local_project_key,
          before: row.indexed_at,
          after: retained.indexed_at,
        })
    }
    const extras = after.filter((row) => !beforeKeys.has(normalized(name, row)))
    if (/^model_|^resource_/.test(name)) assert.deepEqual(extras, [], 'Catalog must remain exact')
    else for (const row of extras) assert.ok(own(row), `Unexpected non-owned ${name} row`)
  }
}
async function ownRows() {
  return await database.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('local_project_key', '=', project.id)
    .orderBy('created_at')
    .orderBy('id')
    .execute()
}
async function row(id) {
  return await database.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
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
    assert.equal(
      await hashFile(installed),
      await hashFile(`worker-python/src/imagegen_worker/${name}`),
      `Refresh installed ${name} before qualification`,
    )
  }
  for (const file of sourceFiles) report.sourcePins[file] = await hashFile(file)
  database = openAppDatabase(fixture.appData, path.resolve('src/main/db/migrations'))
  baselineSql = await snapshotSql()
  report.protectedProjects = []
  for (const row of baselineSql.project_index) {
    if (!existsSync(row.canonical_path)) continue
    const entry = await regular(row.canonical_path)
    report.protectedProjects.push({
      path: row.canonical_path,
      stat: statIdentity(entry),
      sha256: await hashFile(row.canonical_path),
    })
  }
  const pending = baselineSql.generation_queue_item.filter(({ status }) =>
    ['pending', 'running'].includes(status),
  )
  assert.deepEqual(
    pending,
    [],
    'Do not start a qualification while pre-existing queue work can run',
  )
  const models = new ModelService(
    new ModelRepository(database.db),
    new CivitaiClient(),
    new CivitaiTokenStore({}, fixture.appData),
  )
  const reference = await models.resolveGenerationCheckpoint(
    fixture.catalog.modelId,
    fixture.catalog.versionId,
  )
  const verified = await models.resolveVerifiedGenerationAnimaBundleForPlan(reference)
  assert.equal(verified.architecture, 'anima-base-1.0')
  for (const [role, file] of Object.entries(bundle)) {
    const component = verified[role]
    assert.equal(component.managedPath, file.path)
    assert.equal(component.byteSize, file.byteSize)
    assert.equal(
      role === 'checkpoint' ? component.reference.fileSha256 : component.sha256,
      file.sha256,
    )
    assert.ok(!within(fixture.artifacts, file.path))
  }
  let loraReference
  if (!negativeProfile) {
    loraReference = await models.resolveGenerationLora(
      fixture.lora.modelId,
      fixture.lora.versionId,
    )
    assert.equal(loraReference.kind, 'lora')
    assert.equal(loraReference.baseModelFamily, 'anima')
    assert.equal(loraReference.predictionType, null)
    const loraVerified = await models.resolveVerifiedAnimaGenerationLoraForPlan(loraReference)
    assert.deepEqual(
      {
        managedPath: loraVerified.managedPath,
        byteSize: loraVerified.byteSize,
        sha256: loraVerified.reference.fileSha256,
      },
      {
        managedPath: fixture.lora.managedPath,
        byteSize: fixture.lora.byteSize,
        sha256: fixture.lora.sha256,
      },
    )
    assert.equal((await regular(fixture.lora.managedPath)).size, fixture.lora.byteSize)
    assert.equal(await hashFile(fixture.lora.managedPath), fixture.lora.sha256)
    report.catalog = {
      reference,
      verified,
      lora: {
        reference: loraReference,
        verified: loraVerified,
        stat: statIdentity(await regular(fixture.lora.managedPath)),
      },
    }
  } else report.catalog = { reference, verified }
  report.catalog.fileStats = Object.fromEntries(
    await Promise.all(
      Object.entries(bundle).map(async ([role, file]) => [
        role,
        statIdentity(await regular(file.path)),
      ]),
    ),
  )
  for (const required of [
    capability,
    imageCapability,
    samplingCapability,
    outpaintCapability,
    ...(negativeProfile ? [negativeCapability] : [loraCapability, 'anima-lora']),
    'anima-outpaint',
  ])
    assert.ok(provision.ready.capabilities.includes(required), `Installed worker lacks ${required}`)
  const infill = await new InferenceAuxiliaryResources(
    path.join(fixture.appData, 'inference-resources'),
  ).resolveVerifiedOutpaintInfill()
  const { managedPath, ...infillIdentity } = infill
  assert.deepEqual(infillIdentity, LAMA_OUTPAINT_IDENTITY_V1)
  assert.ok(within(fixture.appData, managedPath) && !within(fixture.artifacts, managedPath))
  outpaintInfill = { ...infill, stat: statIdentity(await regular(managedPath)) }
  report.outpaintInfill = outpaintInfill
  const workspace = path.join(fixture.appData, 'workspaces/Uncategorized')
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  const title = `Anima regional ${negativeProfile ? 'negative' : 'LoRA'} ${fixture.mode} ${path.basename(fixture.artifacts)} ${randomUUID().slice(0, 8)}`
  const file = path.join(workspace, `${title}.igs`)
  assert.equal(existsSync(file), false)
  const session = await ProjectSession.create(
    file,
    title,
    {
      placeholdersDir: path.resolve('dist/main/placeholders'),
      scratchDir: path.join(fixture.artifacts, 'writer-scratch'),
    },
    bbox,
  )
  const document = session.document
  document.generationDraft = structuredClone(baseline.authoredDocument.generationDraft)
  document.generationDraft.model = reference
  document.generationDraft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-prompt' }
  document.generationDraft.positivePrompt.text = globalPositive
  document.generationDraft.loras = negativeProfile ? [] : [
    { resource: structuredClone(loraReference), enabled: true, weight: activeWeight },
    {
      resource: {
        ...structuredClone(loraReference),
        localModelId: randomUUID(),
        localVersionId: randomUUID(),
        fileSha256: '0'.repeat(64),
        displayName: 'Disabled missing Anima control',
        versionName: 'Not installed control',
      },
      enabled: false,
      weight: 0.75,
    },
  ]
  assert.deepEqual(document.generationDraft.seed, { policy: 'fixed', value: 123 })
  assert.equal(document.generationDraft.sampling.animaMethod, 'euler')
  assert.equal(document.generationDraft.sampling.steps, 20)
  assert.equal(document.generationDraft.sampling.cfgScale, 4)
  assert.equal(document.generationDraft.vae, null)
  assert.equal(document.generationDraft.vaePrecision ?? 'Auto', 'Auto')
  document.generationDraft.sampling.animaMethod = 'heun'
  document.generationDraft.sampling.denoisingStrength = imageInput ? 0.5 : null
  const sourceId = randomUUID(),
    sourceMember = `assets/layers/${sourceId}.png`
  const sourceAsset = {
    bytes: sourceBytes.length,
    width: 512,
    height: 512,
    path: sourceMember,
    sha256: sha(sourceBytes),
  }
  document.layers = imageInput
    ? [
        {
          id: sourceId,
          name: 'Exact prior Anima source',
          kind: 'raster',
          asset: sourceAsset,
          blendMode: 'normal',
          locked: false,
          opacity: 1,
          visible: true,
          transform: { ...sourceTransform },
        },
      ]
    : []
  const assets = imageInput ? { [sourceMember]: { bytes: sourceBytes } } : {}
  document.regionalGuidance = baseline.authoredDocument.regionalGuidance.map((source, index) => {
    const region = structuredClone(source),
      coverage = baseline.recipe.regions[index].coverage
    assert.equal(region.prompts.positive.text, contract.regionalTexts[index])
    const { width, height, x, y } = region.mask.bounds
    const full = Buffer.from(coverage.alpha),
      cropped = Buffer.alloc(width * height)
    for (let row = 0; row < height; row++)
      full.copy(
        cropped,
        row * width,
        (y - bbox.y + row) * 512 + x - bbox.x,
        (y - bbox.y + row) * 512 + x - bbox.x + width,
      )
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
  project = {
    title,
    file,
    document: session.document,
    sourceLayerId: imageInput ? sourceId : null,
    sourceAsset: imageInput ? sourceAsset : null,
    initialPackageSha256: await hashFile(file),
  }
  report.project = project
  if (negativeProfile) report.negative = {
    capability: negativeCapability,
    activeLocalText: activeNegative,
    controlLocalText: controlNegative,
    globalText: contract.globalNegative,
    inheritedRegionIndex: 1,
    rowsPerSource: 512,
    expectedSignedSources: 6,
    expectedKeysPerSign: 1536,
    frozenInputs: [],
  }
  report.source = {
    descriptor: fixture.source,
    layerId: imageInput ? sourceId : null,
    asset: imageInput ? sourceAsset : null,
    rgbSha256: sourcePixels.rgbSha256,
    setup: imageInput
      ? `ProjectSession exact canonical PNG member at bbox+${sourceOffset}, scale1; no Import UI/resampling/pixel edit`
      : 'Transparent target, no source Raster; canonical source descriptor remains a protected control only',
  }
  const sourcePackage = await readIgsPackage(file)
  if (imageInput) assert.ok((await sourcePackage.readMember(sourceMember)).equals(sourceBytes))
  else assert.deepEqual(sourcePackage.project.layers, [])
  report.initialSql = baselineSql
  await database.close()
  database = null
  check(
    negativeProfile
      ? 'Canonical installed runtime/catalog verified; ProjectSession preserves source/masks/Heun plan with no LoRAs; genuine UI will author local/inherited negatives and the nonempty text-only neighbor'
      : 'Canonical installed runtime/catalog verified; ProjectSession prepares exact regional source geometry and unchanged Heun plan and exact signed/disabled LoRA stack; genuine UI will author enabled-zero control',
  )
}

/** Observers always call original functions once with the original receiver/arguments. */
async function installObservers() {
  await application.evaluate(
    ({ ipcMain, webContents }, options) => {
      const cp = process.getBuiltinModule('child_process'),
        fs = process.getBuiltinModule('fs')
      const crypto = process.getBuiltinModule('crypto'),
        p = process.getBuiltinModule('path')
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
        if (
          p.dirname(descriptor.path) !== root ||
          fs.realpathSync(descriptor.path) !== descriptor.path ||
          !entry.isFile() ||
          entry.isSymbolicLink() ||
          entry.size !== descriptor.byteSize ||
          entry.size > maximum
        )
          throw new Error('Observed descriptor is not exact owned storage')
        const bytes = fs.readFileSync(descriptor.path)
        if (hash(bytes) !== descriptor.sha256)
          throw new Error('Observed bytes differ from descriptor')
        return bytes
      }
      const wireSnapshot = (wire, workerPid) => {
        if (wire.type !== options.type) return { type: wire.type, requestId: wire.requestId }
        const count = state.workers.reduce(
          (total, worker) =>
            total + worker.writes.filter(({ type }) => type === options.type).length,
          0,
        )
        if (count >= options.remainingBudget)
          throw new Error('Anima regional whole-run request budget exceeded')
        const bytes = checked(wire.bundle, wire.stagingRoot, 1024 ** 2)
        const bundle = JSON.parse(bytes.toString('utf8')),
          target = bundle.request.job.target
        const targetBytes = checked(target, p.dirname(target.path), 32 * 1024 ** 2)
        const prefix = `${options.lifetime}-wire-${count + 1}`
        fs.writeFileSync(p.join(options.evidence, `${prefix}.json`), bytes, {
          flag: 'wx',
          mode: 0o600,
        })
        fs.writeFileSync(p.join(options.evidence, `${prefix}-target.png`), targetBytes, {
          flag: 'wx',
          mode: 0o600,
        })
        const alphas = bundle.recipe.regions.map((region, index) => {
          const descriptor = region.coverage.alpha.$alpha8
          const bytes = checked(descriptor, wire.stagingRoot, 64 * 1024 ** 2)
          const file = p.join(options.evidence, `${prefix}-region-${index}.alpha8`)
          fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 })
          return { ...descriptor, retained: file }
        })
        const ownerPath = p.join(wire.stagingRoot, '.owner-v1.json')
        const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'))
        if (
          owner.kind !== 'regional-transport-owner-v1' ||
          owner.main.pid !== process.pid ||
          owner.worker.pid !== workerPid
        )
          throw new Error('Actual Main/worker do not own transport')
        return {
          ...wire,
          bundleJson: bundle,
          alphas,
          owner,
          target: { ...target, retained: p.join(options.evidence, `${prefix}-target.png`) },
        }
      }
      const originalSpawn = cp.spawn,
        spawnDescriptor = Object.getOwnPropertyDescriptor(cp, 'spawn')
      const spawnWrapper = function (...args) {
        const child = Reflect.apply(originalSpawn, this, args)
        try {
          if (
            !args[1]?.some(
              (value) => typeof value === 'string' && value.startsWith('imagegen_worker'),
            )
          )
            return child
          if (state.workers.length >= 32) throw new Error('Worker observation exceeds bound')
          const worker = {
            pid: child.pid,
            executable: args[0],
            args: args[1],
            writes: [],
            frames: [],
            ready: null,
            exit: null,
            close: null,
            originalCalls: 1,
          }
          state.workers.push(worker)
          const originalWrite = child.stdin.write,
            descriptor = Object.getOwnPropertyDescriptor(child.stdin, 'write')
          let pending = '',
            response = ''
          const writeWrapper = function (...writeArgs) {
            try {
              pending += Buffer.from(writeArgs[0]).toString('utf8')
              if (pending.length > 128 * 1024)
                throw new Error('Incomplete observed JSONL exceeds bound')
              let newline
              while ((newline = pending.indexOf('\n')) >= 0) {
                const line = pending.slice(0, newline)
                pending = pending.slice(newline + 1)
                if (line)
                  worker.writes.push({
                    ...wireSnapshot(JSON.parse(line), child.pid),
                    originalCalls: 1,
                    receiverMatches: this === child.stdin,
                    order: ++state.order,
                  })
              }
            } catch (error) {
              fault(error)
            }
            return Reflect.apply(originalWrite, this, writeArgs)
          }
          child.stdin.write = writeWrapper
          state.restores.push(
            restoreProperty(child.stdin, 'write', originalWrite, descriptor, writeWrapper),
          )
          const onData = (bytes) => {
            try {
              response += bytes.toString('utf8')
              if (response.length > 128 * 1024)
                throw new Error('Incomplete observed response exceeds bound')
              let newline
              while ((newline = response.indexOf('\n')) >= 0) {
                const line = response.slice(0, newline)
                response = response.slice(newline + 1)
                if (!line) continue
                const message = JSON.parse(line)
                if (message.type === 'ready') worker.ready = message
                else if (
                  ['generation-progress', 'generation-done', 'error'].includes(message.type)
                ) {
                  if (worker.frames.length >= 256)
                    throw new Error('Worker frame observation exceeds bound')
                  worker.frames.push({ message, order: ++state.order })
                }
              }
            } catch (error) {
              fault(error)
            }
          }
          child.stdout.on('data', onData)
          state.restores.push(() => child.stdout.removeListener('data', onData))
          child.once('exit', (code, signal) => {
            worker.exit = { code, signal }
          })
          child.once('close', (code, signal) => {
            worker.close = { code, signal }
          })
        } catch (error) {
          fault(error)
        }
        return child
      }
      cp.spawn = spawnWrapper
      process.getBuiltinModule('module').syncBuiltinESMExports()
      state.restores.push(() => {
        restoreProperty(cp, 'spawn', originalSpawn, spawnDescriptor, spawnWrapper)()
        process.getBuiltinModule('module').syncBuiltinESMExports()
      })
      for (const contents of webContents.getAllWebContents()) {
        const original = contents.send,
          descriptor = Object.getOwnPropertyDescriptor(contents, 'send')
        const wrapper = function (channel, ...args) {
          try {
            if (channel === 'projects:generation-progress') {
              if (state.progress.length >= 512)
                throw new Error('Main progress observation exceeds bound')
              state.progress.push({ order: ++state.order, snapshot: structuredClone(args[0]) })
            }
          } catch (error) {
            fault(error)
          }
          return Reflect.apply(original, this, [channel, ...args])
        }
        contents.send = wrapper
        state.restores.push(restoreProperty(contents, 'send', original, descriptor, wrapper))
      }
      for (const channel of [
        'projects:generate',
        'projects:cancel-generation-job',
        'projects:retry-generation-job',
        'projects:accept-generation-candidates',
        'projects:save',
        'projects:close',
        'projects:undo',
        'projects:redo',
        'projects:update-generation-draft',
        'projects:update-regional-guidance',
        'projects:update-regional-guidance-prompt',
        'projects:edit-regional-guidance-mask',
        'projects:update-raster-layer',
        'projects:set-generation-model',
      ]) {
        const original = ipcMain._invokeHandlers.get(channel)
        if (!original) throw new Error(`Missing original handler ${channel}`)
        const wrapper = async function (...args) {
          let record
          try {
            if (state.ipc.length >= 4096) throw new Error('IPC observation exceeds finite bound')
            record = {
              channel,
              args: structuredClone(args.slice(1)),
              originalCalls: 1,
              order: ++state.order,
              progressBefore: structuredClone(state.progress.at(-1) ?? null),
              finished: false,
            }
            state.ipc.push(record)
          } catch (error) {
            fault(error)
          }
          try {
            const result = await Reflect.apply(original, this, args)
            if (record) {
              record.ok = result?.ok
              if (channel === 'projects:generate')
                record.generateResult = structuredClone(result?.value)
            }
            return result
          } finally {
            if (record) record.finished = true
          }
        }
        ipcMain._invokeHandlers.set(channel, wrapper)
        state.restores.push(() => {
          if (ipcMain._invokeHandlers.get(channel) !== wrapper)
            throw new Error('IPC observer owner changed')
          ipcMain._invokeHandlers.set(channel, original)
        })
      }
    },
    {
      evidence: fixture.artifacts,
      lifetime: activeLifetime.number,
      type: requestType,
      remainingBudget: requestBudget - allWires().length,
    },
  )
}
async function observed(restore = false) {
  return await application.evaluate((_electron, restore) => {
    const state = globalThis.__installedAnimaRegional
    if (restore) {
      for (const callback of state.restores.toReversed()) callback()
      state.restored = true
    }
    return {
      workers: state.workers,
      ipc: state.ipc,
      progress: state.progress,
      faults: state.faults,
      restored: state.restored ?? false,
    }
  }, restore)
}
function wires(snapshot) {
  return (snapshot?.workers ?? []).flatMap((worker) =>
    worker.writes
      .filter(({ type }) => type === requestType)
      .map((wire) => ({ ...wire, pid: worker.pid })),
  )
}
async function bounds(label) {
  const value = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds: activeLifetime.deadlineSeconds,
    execute: (file, args, options) =>
      exec(
        file,
        args.map((arg) => (arg === 'MemoryMax=12G' ? 'MemoryMax=10G' : arg)),
        options,
      ),
  })
  const groups = new Map(value.groups.map(({ group, memoryMax }) => [group, BigInt(memoryMax)]))
  groups.set(report.launcherBounds.group, BigInt(report.launcherBounds.memoryMax))
  const aggregate = [...groups.values()].reduce((sum, limit) => sum + limit, 0n)
  assert.ok(aggregate <= 12n * 1024n ** 3n, 'Combined launcher/native group ceilings exceed 12GiB')
  activeLifetime.checks.push(value)
  report.limits.push({
    label,
    lifetime: activeLifetime.number,
    aggregateUniqueMax: String(aggregate),
    ...value,
  })
  checkpoint()
}
async function launch() {
  assert.equal(application, undefined)
  activeLifetime = {
    number: report.lifetimes.length + 1,
    deadlineSeconds: Math.max(1, Math.floor(timeout(600_000) / 1000)),
    checks: [],
  }
  report.lifetimes.push(activeLifetime)
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    XDG_DATA_HOME: path.dirname(fixture.appData),
    XDG_CONFIG_HOME: path.join(fixture.artifacts, 'config'),
    XDG_CACHE_HOME: path.join(fixture.artifacts, 'cache'),
  }
  for (const name of [
    'ELECTRON_RUN_AS_NODE',
    'IMAGEGEN_TEST_IMAGE_WORKER',
    'IMAGEGEN_DEV_SERVER_URL',
    'PYTHONPATH',
    'PYTHONHOME',
    'CUDA_VISIBLE_DEVICES',
  ])
    delete env[name]
  application = await electron.launch({
    args: ['--ozone-platform=x11', '.'],
    cwd: process.cwd(),
    env,
    timeout: timeout(),
  })
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
  await expect
    .poll(
      async () =>
        (
          await database.db
            .selectFrom('project_index')
            .selectAll()
            .where('canonical_path', '=', project.file)
            .execute()
        ).length,
      { timeout: timeout() },
    )
    .toBe(1)
  project.id = (
    await database.db
      .selectFrom('project_index')
      .selectAll()
      .where('canonical_path', '=', project.file)
      .executeTakeFirstOrThrow()
  ).local_project_key
  const runtime = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(runtime.ok, true)
  assert.equal(runtime.value.kind, 'ready')
  activeLifetime.runtime = runtime.value
  boundsTimer = setInterval(() => {
    boundsPending = boundsPending
      .then(() => bounds('periodic'))
      .catch((error) => {
        report.boundsError = String(error.stack ?? error)
        checkpoint()
      })
  }, 5000)
  await openProject()
}
async function closeNative(label) {
  if (closing) return await closing
  closing = closeNativeBody(label).finally(() => {
    closing = undefined
  })
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
  if (database) {
    await database.close()
    database = null
  }
  const native = application,
    nativeProcess = native.process()
  let closeTimer
  try {
    await Promise.race([
      native.close(),
      new Promise((_, reject) => {
        closeTimer = setTimeout(
          () => reject(new Error('Owned Electron close exceeded 10s')),
          10_000,
        )
      }),
    ])
  } catch (error) {
    activeLifetime.closeError = String(error.stack ?? error)
    const latest = activeLifetime.checks.findLast(({ processIdentities }) =>
      processIdentities.some(({ pid }) => pid === nativeProcess.pid),
    )
    const identity = latest?.processIdentities.find(({ pid }) => pid === nativeProcess.pid)
    const group = latest?.groups.find(
      ({ ownedScope, pids }) => ownedScope && pids.includes(nativeProcess.pid),
    )
    assert.ok(identity && group, 'Failure stop requires exact owned native identity/scope')
    activeLifetime.stop = await stopExpiredQualificationProcess({ ...identity, group: group.group })
  } finally {
    clearTimeout(closeTimer)
  }
  activeLifetime.physicalExit = await confirmQualificationProcessExit(activeLifetime.checks)
  assert.equal(activeLifetime.physicalExit.confirmed, true)
  application = undefined
  window = undefined
  await assertRuntimeIdle(fixture.appData, await realpath(pointer.pythonExecutable))
  checkpoint()
}
async function api(method, ...args) {
  const result = await window.evaluate(({ method, args }) => window.api.projects[method](...args), {
    method,
    args,
  })
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
  report.screenshots.push({
    path: file,
    inspection: 'ROOT must open the screenshot; capture is not visual acceptance',
  })
  checkpoint()
}
async function openProject() {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toBeVisible({
    timeout: timeout(),
  })
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true', {
    timeout: timeout(),
  })
}
async function targetState() {
  const tab = await current(),
    signature = generationTargetSignature(tab)
  assert.ok(signature)
  return await api(
    'getGenerationTargetState',
    project.id,
    tab.documentId,
    sha(Buffer.from(signature)),
  )
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
async function setLoraWeight(weight, persist = true) {
  const name = report.catalog.lora.reference.displayName
  const row = window
    .getByRole('region', { name: 'LoRAs', exact: true })
    .getByRole('article', { name: `LoRA ${name}`, exact: true })
  const input = row.getByRole('textbox', { name: `${name} weight`, exact: true })
  await expect(input).toBeEnabled({ timeout: timeout() })
  await input.fill(String(weight))
  await input.press('Tab')
  await expect.poll(async () => (await current()).generationDraft.loras[0].weight).toBe(weight)
  assert.equal((await current()).generationDraft.loras[0].enabled, true)
  if (persist) {
    await save()
    project.initialPackageSha256 = await hashFile(project.file)
  }
}
async function setNegativeSource(index, inherited) {
  const region = (await current()).regionalGuidance[index]
  const row = window.locator(`[data-regional-guidance-id="${region.id}"]`)
  const control = row.getByRole('switch', { name: 'Use global negative prompt', exact: true })
  await expect(control).toBeEnabled({ timeout: timeout() })
  if ((await control.getAttribute('aria-checked')) !== String(inherited)) await control.click()
  await expect(control).toHaveAttribute('aria-checked', String(inherited))
  await expect
    .poll(async () => (await current()).regionalGuidance[index].prompts.useGlobalNegativePrompt)
    .toBe(inherited)
}
async function setNegativeText(text, persist = true) {
  assert.ok(negativeProfile && [activeNegative, controlNegative].includes(text))
  const first = (await current()).regionalGuidance[0]
  const row = window.locator(`[data-regional-guidance-id="${first.id}"]`)
  const input = row.getByRole('textbox', { name: 'Regional negative prompt', exact: true })
  await expect(input).toBeEnabled({ timeout: timeout() })
  await input.fill(text)
  await input.press('Tab')
  await expect
    .poll(async () => (await current()).regionalGuidance[0].prompts.negative.text)
    .toBe(text)
  assert.equal((await current()).regionalGuidance[0].prompts.useGlobalNegativePrompt, false)
  assert.equal((await current()).regionalGuidance[1].prompts.useGlobalNegativePrompt, true)
  if (persist) {
    await save()
    project.initialPackageSha256 = await hashFile(project.file)
  }
}
async function setControl(setting) {
  if (negativeProfile) await setNegativeText(setting)
  else await setLoraWeight(setting)
}
async function authorStaticUi() {
  const editor = window.getByRole('textbox', { name: 'Positive prompt', exact: true })
  await editor.fill(globalPositive)
  await editor.press('Tab')
  await expect
    .poll(async () => (await current()).generationDraft.positivePrompt.text)
    .toBe(globalPositive)
  await setInput('Images per click', 1)
  if (negativeProfile) {
    const firstRegion = (await current()).regionalGuidance[0]
    if (firstRegion.locked) {
      const firstRow = window.locator(`[data-regional-guidance-id="${firstRegion.id}"]`)
      await firstRow.getByRole('button', { name: `Unlock ${firstRegion.name}`, exact: true }).click()
      await expect.poll(async () => (await current()).regionalGuidance[0].locked).toBe(false)
      report.negative.unlockedForAuthoring = firstRegion.id
    }
    const negative = window.getByRole('textbox', { name: 'Negative prompt', exact: true })
    await negative.fill(contract.globalNegative)
    await negative.press('Tab')
    await expect
      .poll(async () => (await current()).generationDraft.negativePrompt.text)
      .toBe(contract.globalNegative)
    await setNegativeSource(0, false)
    await setNegativeSource(1, false)
    const right = (await current()).regionalGuidance[1]
    const dormant = window.locator(`[data-regional-guidance-id="${right.id}"]`)
      .getByRole('textbox', { name: 'Regional negative prompt', exact: true })
    await dormant.fill(dormantNegative)
    await dormant.press('Tab')
    await expect
      .poll(async () => (await current()).regionalGuidance[1].prompts.negative.text)
      .toBe(dormantNegative)
    await setNegativeSource(1, true)
    await setNegativeText(activeNegative)
  } else await setLoraWeight(activeWeight)
  const authored = await current(),
    stored = await readIgsPackage(project.file)
  assert.deepEqual(authored.generationDraft.dynamicPrompt, {
    maxPrompts: 1,
    seedBehavior: 'per-prompt',
  })
  assert.deepEqual(stored.project.generationDraft, authored.generationDraft)
  assert.deepEqual(authored.generationDraft.loras, project.document.generationDraft.loras)
  if (!negativeProfile) assert.equal(authored.generationDraft.loras[1].enabled, false)
  else {
    assert.deepEqual(authored.generationDraft.loras, [])
    assert.equal(authored.regionalGuidance[0].prompts.negative.text, activeNegative)
    assert.equal(authored.regionalGuidance[0].prompts.useGlobalNegativePrompt, false)
    assert.equal(authored.regionalGuidance[1].prompts.useGlobalNegativePrompt, true)
    assert.equal(authored.regionalGuidance[1].prompts.negative.text, dormantNegative)
    assert.deepEqual(stored.project.regionalGuidance, authored.regionalGuidance.map(
      ({ maskImageUrl: _maskImageUrl, ...region }) => region,
    ))
  }
  report.authoring = {
    generationDraft: authored.generationDraft,
    packageSha256: project.initialPackageSha256,
    globalPositive,
    ...(negativeProfile
      ? { activeLocalNegative: activeNegative, controlLocalNegative: controlNegative }
      : { activeWeight, controlWeight }),
    seed: 123,
    iterations: 1,
  }
  checkpoint()
}
function frozenSeed(frozen) {
  const seed = frozen.context.sampling.seed
  assert.ok(seed === 123 || seed === 124)
  assert.equal(frozen.context.prompts.positive, globalPositive)
  assert.equal(frozen.context.prompts.negative, contract.globalNegative)
  return seed
}
function assertFrozenLora(frozen, expectedWeight) {
  if (negativeProfile) {
    assert.deepEqual(frozen.context.loraStack, [])
    assert.deepEqual(frozen.context.loras, [])
    assert.deepEqual(frozen.workerJob.loras, [])
    return []
  }
  assert.equal(frozen.context.loraStack.length, 2)
  assert.deepEqual(frozen.context.loraStack[1], project.document.generationDraft.loras[1])
  assert.deepEqual(frozen.context.loraStack[0], {
    resource: report.catalog.lora.reference,
    enabled: true,
    weight: expectedWeight,
  })
  assert.deepEqual(frozen.context.loras, [
    {
      ...report.catalog.lora.verified,
      weight: expectedWeight,
    },
  ])
  const expected = [
    {
      byteSize: fixture.lora.byteSize,
      path: fixture.lora.managedPath,
      sha256: fixture.lora.sha256,
      weight: expectedWeight,
    },
  ]
  assert.deepEqual(frozen.workerJob.loras, expected)
  return expected
}
function negativeCompiled(text) {
  assert.ok([activeNegative, controlNegative].includes(text))
  const cleanedText = text === activeNegative ? 'red scarf' : 'green scarf'
  return {
    version: 'anima-prompt-weighting-v1',
    cleanedText,
    spans: [{ start: 0, end: cleanedText.length, weight: 1.5 }],
  }
}
function assertNegativeRecords(value, expectedText) {
  assert.ok(negativeProfile && [activeNegative, controlNegative].includes(expectedText))
  assert.equal(value.recipe.regions.length, 2)
  const [left, right] = value.recipe.regions
  assert.deepEqual(left.negative, {
    source: 'regional', prompt: { text: expectedText, embeddingRefs: [] },
  })
  assert.equal(left.authoredPrompts.useGlobalNegativePrompt, false)
  assert.deepEqual(left.authoredPrompts.negative, left.negative.prompt)
  assert.deepEqual(right.negative, {
    source: 'current-canvas', prompt: { text: contract.globalNegative, embeddingRefs: [] },
  })
  assert.equal(right.authoredPrompts.useGlobalNegativePrompt, true)
  assert.deepEqual(right.authoredPrompts.negative, { text: dormantNegative, embeddingRefs: [] })
  assert.deepEqual(value.compiledPrompts.map(({ polarity, sourceId, text }) => ({ polarity, sourceId, text })), [
    { polarity: 'positive', sourceId: 'current-canvas', text: globalPositive },
    { polarity: 'negative', sourceId: 'current-canvas', text: contract.globalNegative },
    { polarity: 'positive', sourceId: left.regionId, text: contract.regionalTexts[0] },
    { polarity: 'negative', sourceId: left.regionId, text: expectedText },
    { polarity: 'positive', sourceId: right.regionId, text: contract.regionalTexts[1] },
    { polarity: 'negative', sourceId: right.regionId, text: contract.globalNegative },
  ])
  assert.deepEqual(value.compiledPrompts[3].prompt, negativeCompiled(expectedText))
  assert.deepEqual(value.compiledPrompts[5].prompt, baseline.compiledPrompts[1].prompt)
  assert.deepEqual(value.compiledPrompts[1].prompt, value.compiledPrompts[5].prompt)
  assert.notEqual(value.compiledPrompts[1].sourceId, value.compiledPrompts[5].sourceId)
}
async function captureFrozenNegative(entry, expectedText) {
  const frozen = JSON.parse(entry.frozen_payload_json)
  assertFrozenLora(frozen)
  const file = path.join(fixture.appData, 'generation-inputs', entry.id, 'regional.json')
  await regular(file, 1024 * 1024)
  const bytes = await readFile(file)
  assert.equal(bytes.length, frozen.regional.byteSize)
  assert.equal(sha(bytes), frozen.regional.sha256)
  const value = JSON.parse(bytes)
  assertNegativeRecords(value, expectedText)
  assert.equal(value.recipe.documentId, frozen.context.documentId)
  assert.equal(value.recipe.documentRevision, frozen.context.documentRevision)
  assert.equal(value.recipe.item.seed, frozen.context.sampling.seed)
  const preserved = structuredClone(value)
  frozenNegativeInputs.set(entry.id, preserved)
  report.negative.frozenInputs.push({ queueItemId: entry.id, sha256: sha(bytes), value: preserved })
}
async function generateItems(expectedTotal, iterations = 1) {
  const before = new Set((await ownRows()).map(({ id }) => id)),
    document = await current()
  await setInput('Images per click', iterations)
  const existing = (await api('listGenerationResults', project.id)).candidates
  const button = window.getByRole('button', { name: 'Generate', exact: true })
  await expect(button).toBeEnabled({ timeout: timeout() })
  await button.click()
  if (existing.length) {
    assert.equal(outpaint, true, negativeProfile
      ? 'TXT/IMG accept A before creating the negative-B control'
      : 'TXT/IMG accept A before creating the zero control')
    assert.equal(existing.length, 1)
    const dialog = window.getByRole('dialog', {
      name: 'Replace temporary generation results',
      exact: true,
    })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('1 temporary result will be discarded.')
    await dialog.getByRole('button', { name: 'Discard and Generate', exact: true }).click()
    report.explicitReplacements ??= []
    report.explicitReplacements.push({
      queueItemIds: existing.map(({ queueItemId }) => queueItemId),
      candidateIds: existing.map(({ candidateId }) => candidateId),
      decision: 'Discard and Generate',
    })
  }
  await expect
    .poll(async () => (await ownRows()).length, { timeout: timeout(120_000) })
    .toBe(expectedTotal)
  const fresh = (await ownRows())
    .filter(({ id }) => !before.has(id))
    .sort(
      (a, b) =>
        frozenSeed(JSON.parse(a.frozen_payload_json)) -
        frozenSeed(JSON.parse(b.frozen_payload_json)),
    )
  assert.equal(fresh.length, iterations)
  assert.equal(new Set(fresh.map(({ batch_id }) => batch_id)).size, 1)
  assert.equal(new Set(fresh.map(({ staging_session_id }) => staging_session_id)).size, 1)
  assert.equal(
    new Set(fresh.map(({ frozen_payload_json }) => JSON.parse(frozen_payload_json).originRequestId))
      .size,
    iterations,
  )
  assert.equal(new Set(fresh.map(({ id }) => id)).size, iterations)
  for (const [index, entry] of fresh.entries()) {
    const frozen = JSON.parse(entry.frozen_payload_json)
    assert.equal(frozenSeed(frozen), 123 + index)
    assert.equal(frozen.context.documentId, document.documentId)
    assert.equal(frozen.context.documentRevision, document.documentRevision)
    assert.equal(frozen.kind, `anima-regional-${fixture.mode}`)
    assert.deepEqual(frozen.workerJob.sampling, samplingFor(123 + index))
    if (negativeProfile) await captureFrozenNegative(entry, document.regionalGuidance[0].prompts.negative.text)
    else assertFrozenLora(frozen, document.generationDraft.loras[0].weight)
  }
  report.admitted = [...(report.admitted ?? []), ...fresh.map(({ id }) => id)]
  report.submissions ??= []
  report.submissions.push({
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    jobIds: fresh.map(({ id }) => id),
    batchId: fresh[0].batch_id,
    loraStack: document.generationDraft.loras,
    seedAndPrompt: fresh.map(({ id, frozen_payload_json }) => ({
      id,
      seed: JSON.parse(frozen_payload_json).context.sampling.seed,
      prompts: JSON.parse(frozen_payload_json).context.prompts,
    })),
  })
  checkpoint()
  return fresh
}
async function completed(id) {
  await expect
    .poll(
      async () => {
        const value = await row(id)
        assert.ok(
          !['failed', 'canceled'].includes(value.status),
          `Queue job ${id} failed: ${value.error_code ?? ''} ${value.error_message ?? ''}`,
        )
        return value.status
      },
      { timeout: timeout(600_000), intervals: [100, 250, 500] },
    )
    .toBe('completed')
}
async function idle() {
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).phase, { timeout: timeout() })
    .toBe('idle')
}

// Independent PNG decoder: the same bounded filter reconstruction as the established
// installed harness. Production publishing/browser decoding are separate consumers.
function decodePng(bytes, expectedAlpha = null, expectedSize = { width: 512, height: 512 }) {
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
  let offset = 8,
    width,
    height,
    channels,
    icc,
    parts = []
  while (offset < bytes.length) {
    const size = bytes.readUInt32BE(offset),
      kind = bytes.toString('ascii', offset + 4, offset + 8)
    const data = bytes.subarray(offset + 8, offset + 8 + size)
    assert.equal(data.length, size)
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      assert.equal(data[8], 8)
      assert.ok([2, 6].includes(data[9]))
      assert.equal(data[12], 0)
      channels = data[9] === 2 ? 3 : 4
    } else if (kind === 'iCCP')
      icc = sha(inflateSync(data.subarray(data.indexOf(0) + 2), { maxOutputLength: 1024 ** 2 }))
    else if (kind === 'IDAT') parts.push(data)
    offset += size + 12
  }
  assert.equal(width, expectedSize.width)
  assert.equal(height, expectedSize.height)
  assert.equal(icc, IGS_SRGB_ICC_SHA256)
  const stride = width * channels,
    raw = inflateSync(Buffer.concat(parts), { maxOutputLength: (stride + 1) * height })
  assert.equal(raw.length, (stride + 1) * height)
  const output = Buffer.alloc(stride * height)
  const paeth = (a, b, c) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c)
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
  const rgb = Buffer.alloc(width * height * 3),
    rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    output.copy(rgb, i * 3, i * channels, i * channels + 3)
    output.copy(rgba, i * 4, i * channels, i * channels + 3)
    rgba[i * 4 + 3] = channels === 4 ? output[i * 4 + 3] : 255
    if (channels === 4 && expectedAlpha !== null) assert.equal(output[i * 4 + 3], expectedAlpha)
  }
  return {
    width,
    height,
    channels,
    rgb,
    rgba,
    rgbSha256: sha(rgb),
    rgbaSha256: sha(rgba),
    iccSha256: icc,
  }
}
function assertFrozenOutpaint(frozen) {
  assert.equal(frozen.schemaVersion, 1)
  assert.equal(frozen.kind, 'anima-regional-outpaint')
  assert.equal(frozen.context.kind, 'anima-outpaint-preparation')
  assert.equal(frozen.compositionProfile, profile)
  assert.equal(frozen.promptInterpretation, interpretation)
  assert.equal(frozen.context.animaPromptInterpretation, interpretation)
  assert.equal(frozen.context.sampling.animaMethod, 'heun')
  assert.equal(frozen.context.sampling.steps, 20)
  assert.equal(frozen.context.sampling.denoisingStrength, 0.5)
  assert.deepEqual(frozen.workerJob.sampling, samplingFor(frozen.context.sampling.seed))
  assert.deepEqual(frozen.context.bbox, bbox)
  assert.deepEqual(frozen.context.conditioning.bbox, bbox)
  assert.deepEqual(frozen.context.conditioning.policy, INVOKE_ALPHA_OUTPAINT_POLICY_V1)
  assert.deepEqual(frozen.context.conditioning.infillResource, LAMA_OUTPAINT_IDENTITY_V1)
  assert.deepEqual(frozen.outpaintInfill, {
    byteSize: outpaintInfill.byteSize,
    path: outpaintInfill.managedPath,
    role: outpaintInfill.role,
    sha256: outpaintInfill.sha256,
  })
  const { sourceTarget, keepMask } = frozen.context.conditioning
  assert.equal(sourceTarget.sha256, frozen.context.target.sha256)
  assert.equal(sourceTarget.sha256, frozen.workerJob.target.sha256)
  assert.equal(sourceTarget.byteSize, frozen.context.target.byteSize)
  assert.equal(sourceTarget.width, 512)
  assert.equal(sourceTarget.height, 512)
  assert.equal(sourceTarget.iccSha256, IGS_SRGB_ICC_SHA256)
  assert.deepEqual(
    { ...keepMask, sha256: undefined },
    {
      byteSize: 512 * 512,
      format: 'alpha8',
      height: 512,
      polarity: 'keep',
      sha256: undefined,
      width: 512,
    },
  )
  assert.equal(Object.hasOwn(frozen, 'initializationProfile'), false)
}
function assertComposedTarget(target) {
  assert.equal(target.channels, 4)
  assert.deepEqual({ width: target.width, height: target.height }, { width: 512, height: 512 })
  let opaque = 0,
    transparent = 0
  const alpha = Buffer.alloc(512 * 512)
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const offset = (y * 512 + x) * 4
      const visible = x >= sourceOffset && y >= sourceOffset
      const expectedAlpha = visible ? 255 : 0
      assert.equal(target.rgba[offset + 3], expectedAlpha)
      alpha[y * 512 + x] = expectedAlpha
      if (visible) {
        const sourceOffsetBytes = ((y - sourceOffset) * 512 + x - sourceOffset) * 3
        assert.ok(
          target.rgba
            .subarray(offset, offset + 3)
            .equals(sourcePixels.rgb.subarray(sourceOffsetBytes, sourceOffsetBytes + 3)),
          'Main translated-source RGB differs at visible source pixel',
        )
        opaque++
      } else transparent++
    }
  assert.equal(opaque, 384 * 384)
  assert.equal(transparent, 512 * 512 - opaque)
  const result = {
    sourceOffset,
    sourceScale: 1,
    opaquePixels: opaque,
    transparentPixels: transparent,
    rawAlphaSha256: sha(alpha),
    visibleSourceRgbExact: true,
    transparentRgb: 'not an identity oracle',
  }
  report.source.targetComposition = result
  return result
}
function sourcePixel(x, y) {
  if (x < sourceOffset || y < sourceOffset || x >= sourceOffset + 512 || y >= sourceOffset + 512)
    return [0, 0, 0, 0]
  const offset = ((y - sourceOffset) * 512 + x - sourceOffset) * 3
  return [sourcePixels.rgb[offset], sourcePixels.rgb[offset + 1], sourcePixels.rgb[offset + 2], 255]
}
function contributionOracle(target, output) {
  assert.equal(target.channels, 4)
  assert.equal(output.channels, 4)
  let protectedPixels = 0,
    generatedPixels = 0,
    softPixels = 0,
    protectedInterior = 0
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const offset = (y * 512 + x) * 4
      const sourceAlpha = target.rgba[offset + 3],
        a = output.rgba[offset + 3]
      if (x >= 192 && y >= 192) {
        assert.equal(sourceAlpha, 255)
        assert.equal(a, 0, 'Deep protected interior must have no generated contribution')
        protectedInterior++
      }
      if (x < 64 || y < 64) assert.equal(a, 255, 'Far generated border must have full contribution')
      if (a === 0 && sourceAlpha === 255) protectedPixels++
      if (a === 255) generatedPixels++
      else if (a > 0) softPixels++
    }
  assert.equal(protectedInterior, 320 * 320)
  assert.ok(protectedPixels > 0 && generatedPixels > 0 && softPixels > 0)
  return {
    protectedPixels,
    protectedInterior,
    generatedPixels,
    softPixels,
    policyVerifiedByExistingMainOwner: true,
    contributionSemantics: 'generated RGB plus inverse-faded-keep alpha; never source pasted',
  }
}
function assertMergedPreview(merged, output) {
  assert.deepEqual({ width: merged.width, height: merged.height }, { width: 640, height: 640 })
  let protectedPixels = 0,
    sourceOnlyPixels = 0,
    generatedPixels = 0,
    softPixels = 0,
    transparentPixels = 0,
    maximumSoftRgbError = 0
  const expected = Buffer.alloc(640 * 640 * 4)
  for (let y = 0; y < 640; y++)
    for (let x = 0; x < 640; x++) {
      const base = sourcePixel(x, y),
        offset = (y * 640 + x) * 4
      const inside = x < 512 && y < 512,
        inputOffset = (y * 512 + x) * 4
      const alphaByte = inside ? output.rgba[inputOffset + 3] : 0
      const a = alphaByte / 255,
        b = (base[3] / 255) * (1 - a),
        total = a + b
      expected[offset + 3] = Math.round(total * 255)
      assert.equal(
        merged.rgba[offset + 3],
        expected[offset + 3],
        'Saved union preview alpha differs from independent source-over',
      )
      for (let channel = 0; channel < 3; channel++) {
        // Pillow12.2 identity bicubic RGBA affine passes through RGBa. Preserve
        // that existing integer roundtrip before the independent source-over.
        const raw = inside ? output.rgba[inputOffset + channel] : 0
        const transformed = alphaByte
          ? Math.floor((Math.floor((raw * alphaByte + 127) / 255) * 255) / alphaByte)
          : 0
        const value = total ? Math.round((transformed * a + base[channel] * b) / total) : 0
        expected[offset + channel] = value
        if (!total) continue // Hidden RGB does not establish source identity.
        const error = Math.abs(merged.rgba[offset + channel] - value)
        if (alphaByte > 0 && alphaByte < 255)
          maximumSoftRgbError = Math.max(maximumSoftRgbError, error)
        else assert.equal(error, 0, 'Opaque/protected/source-only saved RGB must be exact')
      }
      if (alphaByte === 0 && base[3] === 255) {
        protectedPixels++
        for (let channel = 0; channel < 3; channel++)
          assert.equal(merged.rgba[offset + channel], base[channel])
        if (!inside) sourceOnlyPixels++
      }
      if (alphaByte === 255) generatedPixels++
      else if (alphaByte > 0) softPixels++
      if (!total) transparentPixels++
    }
  assert.ok(
    protectedPixels > 0 &&
      sourceOnlyPixels > 0 &&
      generatedPixels > 0 &&
      softPixels > 0 &&
      transparentPixels > 0,
  )
  assert.equal(sourceOnlyPixels, 512 * 512 - 384 * 384)
  // Existing normal source-over integer rounding allowance: one RGB unit at
  // soft contribution pixels only; alpha and every other visible RGB are exact.
  assert.ok(maximumSoftRgbError <= 1)
  return {
    rect: { x: bbox.x, y: bbox.y, width: 640, height: 640 },
    protectedPixels,
    sourceOnlyPixels,
    generatedPixels,
    softPixels,
    transparentPixels,
    maximumSoftRgbError,
    softRgbRoundingBound: 1,
    alphaExact: true,
    protectedSourceExact: true,
    generatedAndSourceOnlyExact: true,
    expectedRgbaSha256: sha(expected),
    actualRgbaSha256: merged.rgbaSha256,
  }
}
async function candidateOutput(jobId, name) {
  const results = await api('listGenerationResults', project.id)
  const matching = results.candidates.filter((candidate) => candidate.queueItemId === jobId)
  assert.equal(
    matching.length,
    1,
    'Each completed queue item must own exactly one corresponding candidate',
  )
  const candidate = matching[0],
    frozen = JSON.parse((await row(jobId)).frozen_payload_json)
  const seed = frozenSeed(frozen)
  assert.equal(candidate.actualSeed, seed)
  assert.deepEqual(candidate.bbox, bbox)
  const fetched = await window.evaluate(async (url) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Signed Result PNG unavailable')
    return [...new Uint8Array(await response.arrayBuffer())]
  }, candidate.imageUrl)
  const bytes = Buffer.from(fetched),
    decoded = decodePng(bytes)
  assert.equal(decoded.channels, outpaint ? 4 : 3)
  const targetPath = path.join(fixture.appData, 'generation-inputs', jobId, 'target.png')
  const targetBytes = await readFile(targetPath),
    target = decodePng(targetBytes)
  assert.equal(sha(targetBytes), frozen.workerJob.target.sha256)
  assertTarget(target)
  let alphaIdentity
  if (outpaint) {
    assertFrozenOutpaint(frozen)
    alphaIdentity = await assertOutpaintContribution(
      frozen.context.conditioning,
      targetBytes,
      bytes,
    )
    report.contributions ??= []
    report.contributions.push({
      jobId,
      name,
      alphaIdentity,
      ...contributionOracle(target, decoded),
      rawRgbaSha256: decoded.rgbaSha256,
    })
  }
  const receipt = await database.db
    .selectFrom('generation_candidate_receipt')
    .selectAll()
    .where('queue_item_id', '=', jobId)
    .executeTakeFirstOrThrow()
  assert.equal(receipt.image_sha256, sha(bytes))
  assert.equal(receipt.image_byte_size, bytes.length)
  assert.equal(receipt.actual_seed, seed)
  await writeFile(path.join(fixture.artifacts, `${name}.png`), bytes, { flag: 'wx', mode: 0o600 })
  return {
    candidate,
    receipt,
    bytes,
    decoded,
    target,
    alphaIdentity,
    frozen,
    ...(negativeProfile
      ? { localNegative: frozenNegativeInputs.get(jobId).recipe.regions[0].negative.prompt.text }
      : { weight: frozen.context.loras[0].weight }),
  }
}
function assertTarget(target) {
  assert.equal(target.channels, 4, 'Actual Canvas target must be pinned-sRGB RGBA')
  if (outpaint) return assertComposedTarget(target)
  if (imageInput) {
    for (let index = 0; index < 512 * 512; index++) assert.equal(target.rgba[index * 4 + 3], 255)
    assert.ok(
      target.rgb.equals(sourcePixels.rgb),
      'Opaque Main target must preserve exact source RGB',
    )
  } else for (let index = 0; index < 512 * 512; index++) assert.equal(target.rgba[index * 4 + 3], 0)
}

function semanticInput(value) {
  return {
    bbox: value.recipe.bbox,
    item: value.recipe.item,
    globalPrompts: value.recipe.globalPrompts,
    regions: value.recipe.regions.map(({ positive, negative, authoredPrompts, coverage }) => ({
      positive,
      negative,
      authoredPrompts,
      coverage: { ...coverage, alpha: undefined },
    })),
    compiledPrompts: value.compiledPrompts.map(({ sourceId: _sourceId, ...record }) => record),
    sampling: value.request?.job.sampling ?? value.sampling,
  }
}
function negativeControlSemanticInput(value) {
  const normalized = structuredClone(semanticInput(value))
  assert.equal(normalized.compiledPrompts.length, 6)
  normalized.regions[0].negative.prompt.text = '<local negative A/B>'
  normalized.regions[0].authoredPrompts.negative.text = '<local negative A/B>'
  normalized.compiledPrompts[3] = {
    ...normalized.compiledPrompts[3],
    text: '<local negative A/B>',
    prompt: '<local negative A/B compilation>',
  }
  return normalized
}
async function verifyWire(wire, expectedRow) {
  assert.equal(wire.reportProgress, true)
  assert.equal(wire.originalCalls, 1)
  assert.equal(wire.receiverMatches, true)
  const value = wire.bundleJson,
    frozen = JSON.parse(expectedRow.frozen_payload_json)
  const seed = frozenSeed(frozen)
  assert.equal(value.compositionProfile, profile)
  assert.equal(value.promptInterpretation, interpretation)
  assert.equal(value.request.type, `generate-anima-${fixture.mode}`)
  assert.equal(value.recipe.documentId, frozen.context.documentId)
  assert.equal(value.recipe.documentRevision, frozen.context.documentRevision)
  assert.deepEqual(value.recipe.bbox, bbox)
  assert.deepEqual(value.recipe.item, {
    iteration: seed - 123,
    promptPairIndex: 0,
    prompts: { positive: globalPositive, negative: contract.globalNegative },
    seed,
  })
  assert.deepEqual(value.recipe.globalPrompts, {
    positive: { text: globalPositive, embeddingRefs: [] },
    negative: baseline.recipe.globalPrompts.negative,
  })
  assert.ok(
    !/[{}]/u.test(value.recipe.item.prompts.positive),
    'Worker receives concrete static authored text',
  )
  assert.deepEqual(value.request.job.sampling, samplingFor(seed))
  assert.equal(value.request.job.sampling.scheduler, 'heun')
  assert.equal(value.recipe.regions.length, 2)
  for (const [regionIndex, region] of value.recipe.regions.entries()) {
    const retained = baseline.recipe.regions[regionIndex],
      authored = project.document.regionalGuidance[regionIndex]
    assert.equal(region.regionId, authored.id)
    assert.equal(region.maskId, authored.mask.id)
    assert.equal(region.maskRevision, authored.mask.revision)
    assert.deepEqual(region.positive, retained.positive)
    if (!negativeProfile) {
      assert.deepEqual(
        { ...region.negative, source: undefined },
        { ...retained.negative, source: undefined },
      )
      assert.equal(region.negative.source, 'regional')
      assert.deepEqual(region.authoredPrompts, retained.authoredPrompts)
    } else {
      const input = frozenNegativeInputs.get(expectedRow.id)
      assert.ok(input)
      assert.deepEqual(region.negative, input.recipe.regions[regionIndex].negative)
      assert.deepEqual(region.authoredPrompts, input.recipe.regions[regionIndex].authoredPrompts)
    }
    assert.deepEqual(
      { ...region.coverage, alpha: undefined },
      { ...retained.coverage, alpha: undefined },
    )
    assert.ok(
      (await readFile(wire.alphas[regionIndex].retained)).equals(
        Buffer.from(retained.coverage.alpha),
      ),
    )
  }
  const compiled = value.compiledPrompts
  if (!negativeProfile) {
    assert.deepEqual(
      compiled.map(({ polarity, sourceId, text }) => ({ polarity, sourceId, text })),
      [
        { polarity: 'positive', sourceId: 'current-canvas', text: globalPositive },
        { polarity: 'negative', sourceId: 'current-canvas', text: contract.globalNegative },
        ...value.recipe.regions.map(({ regionId, positive }) => ({
          polarity: 'positive',
          sourceId: regionId,
          text: positive.text,
        })),
      ],
    )
  } else {
    const input = frozenNegativeInputs.get(expectedRow.id)
    assert.ok(input)
    assertNegativeRecords(value, input.recipe.regions[0].negative.prompt.text)
    assert.deepEqual(compiled, input.compiledPrompts)
    assert.deepEqual(compiled[2].prompt, baseline.compiledPrompts[2].prompt)
    assert.deepEqual(compiled[4].prompt, baseline.compiledPrompts[3].prompt)
  }
  // Fixed independent expected code-point spans for this predeclared static scene.
  assert.deepEqual(compiled[0].prompt, {
    version: 'anima-prompt-weighting-v1',
    cleanedText: 'two white cats on one bench',
    spans: [
      { start: 0, end: 14, weight: 1.25 },
      { start: 14, end: 27, weight: 1 },
    ],
  })
  if (!negativeProfile)
    for (let n = 1; n < compiled.length; n++)
      assert.deepEqual(compiled[n].prompt, baseline.compiledPrompts[n].prompt)
  else assert.deepEqual(compiled[1].prompt, baseline.compiledPrompts[1].prompt)
  assert.deepEqual(value.request.job.prompts, {
    positive: compiled[0].prompt,
    negative: compiled[1].prompt,
  })
  for (const [role, file] of Object.entries(bundle))
    assert.deepEqual(value.request.job.model[role], file)
  const expectedWeight = negativeProfile ? null : frozen.context.loras[0].weight
  if (!negativeProfile) {
    assert.ok(expectedWeight === activeWeight || expectedWeight === controlWeight)
    assert.deepEqual(value.request.job.loras, assertFrozenLora(frozen, expectedWeight))
    assert.ok(!within(wire.stagingRoot, fixture.lora.managedPath))
  } else assert.deepEqual(value.request.job.loras, assertFrozenLora(frozen))
  const bytes = await readFile(wire.target.retained),
    target = decodePng(bytes)
  assert.equal(sha(bytes), wire.target.sha256)
  assert.equal(wire.target.sha256, frozen.workerJob.target.sha256)
  assertTarget(target)
  if (outpaint) {
    assertFrozenOutpaint(frozen)
    assert.deepEqual(value.request.job.conditioning, frozen.context.conditioning)
    assert.deepEqual(value.request.job.infillResource, {
      byteSize: outpaintInfill.byteSize,
      path: outpaintInfill.managedPath,
      role: outpaintInfill.role,
      sha256: outpaintInfill.sha256,
    })
    const rawAlpha = Buffer.from(
      Array.from({ length: 512 * 512 }, (_, n) => target.rgba[n * 4 + 3]),
    )
    assert.equal(value.request.job.conditioning.keepMask.sha256, sha(rawAlpha))
    report.source.rawAlphaSha256 ??= sha(rawAlpha)
    assert.equal(sha(rawAlpha), report.source.rawAlphaSha256)
  }
  report.source.targetSha256 ??= wire.target.sha256
  assert.equal(wire.target.sha256, report.source.targetSha256)
  report.verifiedAssociations ??= []
  report.verifiedAssociations.push({
    queueItemId: expectedRow.id,
    wireRequestId: wire.requestId,
    ...(negativeProfile
      ? { localNegative: value.recipe.regions[0].negative.prompt.text, signedSources: compiled.length }
      : { loraWeight: expectedWeight }),
    seed,
    prompt: globalPositive,
    documentId: value.recipe.documentId,
    documentRevision: value.recipe.documentRevision,
    targetSha256: wire.target.sha256,
    regionAlpha: wire.alphas.map(({ sha256 }) => sha256),
  })
}

async function progressBeforeCancel(id) {
  let evidence
  await expect
    .poll(
      async () => {
        const progress = await api('getGenerationProgress'),
          running = await row(id)
        if (running.status === 'pending') return false
        assert.equal(
          running.status,
          'running',
          'Cancel must observe real numerical progress before completion',
        )
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
      },
      { timeout: timeout(600_000), intervals: [100, 250] },
    )
    .toBe(true)
  report.cancelProgress = evidence
  await screenshot('02-real-progress-cancel-requested')
}
async function editCurrent() {
  const before = await current(),
    second = before.regionalGuidance[1]
  const global = window.getByRole('textbox', { name: 'Positive prompt', exact: true })
  await global.fill('later ordinary authoring after frozen Anima cancellation')
  await global.press('Tab')
  await expect
    .poll(async () => (await current()).generationDraft.positivePrompt.text)
    .toBe('later ordinary authoring after frozen Anima cancellation')
  if (negativeProfile) {
    const globalNegative = window.getByRole('textbox', { name: 'Negative prompt', exact: true })
    await globalNegative.fill('later global negative after frozen cancellation')
    await globalNegative.press('Tab')
    await expect
      .poll(async () => (await current()).generationDraft.negativePrompt.text)
      .toBe('later global negative after frozen cancellation')
    await setNegativeSource(0, true)
    await setNegativeSource(1, false)
    const neighbor = window.locator(`[data-regional-guidance-id="${second.id}"]`)
    const localNegative = neighbor.getByRole('textbox', { name: 'Regional negative prompt', exact: true })
    await localNegative.fill('later local negative after frozen cancellation')
    await localNegative.press('Tab')
    await expect
      .poll(async () => (await current()).regionalGuidance[1].prompts.negative.text)
      .toBe('later local negative after frozen cancellation')
  }
  const regionRow = window.locator(`[data-regional-guidance-id="${second.id}"]`)
  const prompt = regionRow.getByRole('textbox', { name: 'Regional prompt', exact: true })
  await expect(prompt).toBeEnabled({ timeout: timeout() })
  await prompt.fill('later green scarf authoring')
  await prompt.press('Tab')
  await regionRow.getByRole('button', { name: `Select ${second.name}`, exact: true }).click()
  await window.getByRole('button', { name: 'Clear mask', exact: true }).click()
  await expect.poll(async () => (await current()).regionalGuidance[1].mask.asset).toBe(null)
  for (const region of before.regionalGuidance)
    await window
      .locator(`[data-regional-guidance-id="${region.id}"]`)
      .getByRole('button', { name: `Hide ${region.name}`, exact: true })
      .click()
  await setInput('Denoising Strength', 1)
  await window
    .getByRole('button', {
      name: `Hide ${before.layers.find(({ id }) => id === project.sourceLayerId).name}`,
      exact: true,
    })
    .click()
  await expect
    .poll(
      async () => (await current()).layers.find(({ id }) => id === project.sourceLayerId).visible,
    )
    .toBe(false)
  await setInput('Steps', 2)
  await setInput('Generation seed', 999)
  await window.locator('[aria-label="Anima method"]').click()
  await window.getByText('Euler', { exact: true }).last().click()
  const stack = window.getByRole('region', { name: 'LoRAs', exact: true })
  for (const entry of before.generationDraft.loras) {
    await stack
      .getByRole('button', { name: `Remove ${entry.resource.displayName}`, exact: true })
      .click()
  }
  await expect.poll(async () => (await current()).generationDraft.loras.length).toBe(0)
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
  assert.ok(
    (await readIgsPackage(project.file)).project.layers[0].asset.sha256 ===
      project.sourceAsset.sha256,
  )
  assert.equal(after.generationDraft.sampling.animaMethod, 'euler')
  assert.deepEqual(after.generationDraft.seed, { policy: 'fixed', value: 999 })
  assert.ok(after.regionalGuidance.every(({ enabled }) => !enabled))
  assert.equal(after.regionalGuidance[1].prompts.positive.text, 'later green scarf authoring')
  if (negativeProfile) {
    assert.equal(after.generationDraft.negativePrompt.text, 'later global negative after frozen cancellation')
    assert.equal(after.regionalGuidance[0].prompts.useGlobalNegativePrompt, true)
    assert.equal(after.regionalGuidance[1].prompts.useGlobalNegativePrompt, false)
    assert.equal(after.regionalGuidance[1].prompts.negative.text, 'later local negative after frozen cancellation')
  }
  report.edited = {
    sourceLayer: sourceUiState(after.layers[0]),
    generationDraft: after.generationDraft,
    regionalGuidance: after.regionalGuidance.map(
      ({ maskImageUrl: _maskImageUrl, ...region }) => region,
    ),
    packageSha256: await hashFile(project.file),
  }
  await screenshot('03-edited-saved-before-restart')
}
function assertProvenance(provenance, candidate, frozen, pngSha256) {
  const seed = frozenSeed(frozen)
  assert.equal(provenance.kind, `anima-${fixture.mode}`)
  assert.equal(provenance.executionResultContext.queueItemId, candidate.queueItemId)
  assert.equal(provenance.executionResultContext.output.sha256, pngSha256)
  const config = provenance.generationConfiguration
  assert.equal(config.model.fileSha256, bundle.checkpoint.sha256)
  assert.equal(config.model.baseModelFamily, 'anima')
  assert.equal(config.positivePrompt.text, globalPositive)
  assert.equal(config.negativePrompt.text, contract.globalNegative)
  assert.deepEqual(config.loras, frozen.context.loraStack)
  assertFrozenLora(frozen, activeWeight)
  assert.equal(config.anima.architecture, 'anima-base-1.0')
  assert.equal(config.anima.qwen3Encoder.sha256, bundle.qwen3Encoder.sha256)
  assert.equal(config.anima.vae.sha256, bundle.vae.sha256)
  assert.equal(config.sampling.steps, 20)
  assert.equal(config.sampling.cfgScale, 4)
  assert.equal(config.sampling.actualSeed, seed)
  assert.equal(config.sampling.animaMethod, 'heun')
  assert.equal(config.mode, fixture.mode)
  if (imageInput) assert.equal(config.sampling.denoisingStrength, 0.5)
  assert.equal(frozen.promptInterpretation, interpretation)
  assert.equal(frozen.context.animaPromptInterpretation, interpretation)
  assert.deepEqual(frozen.workerJob.sampling, samplingFor(seed))
  assert.equal(provenance.layerSourceContext.sourceDocumentId, frozen.context.documentId)
  assert.equal(
    provenance.layerSourceContext.sourceDocumentRevision,
    frozen.context.documentRevision,
  )
  if (outpaint) {
    assertFrozenOutpaint(frozen)
    assert.equal(provenance.executionResultContext.output.outputMode, 'contribution')
    const contribution = report.contributions.findLast(
      ({ jobId }) => jobId === candidate.queueItemId,
    )
    assert.ok(contribution)
    assert.deepEqual(
      provenance.executionResultContext.output.contributionAlpha8,
      contribution.alphaIdentity,
    )
    assert.deepEqual(provenance.layerSourceContext.outpaint, {
      infillResource: frozen.context.conditioning.infillResource,
      keepMask: frozen.context.conditioning.keepMask,
      policy: frozen.context.conditioning.policy,
      sourceTarget: frozen.context.conditioning.sourceTarget,
    })
  }
  const encoded = JSON.stringify(provenance)
  for (const forbidden of [
    'regionalGuidance',
    'compositionProfile',
    'compiledPrompts',
    'outpaintInfill',
    'regional:',
    ...contract.regionalTexts,
    ...(negativeProfile ? [activeNegative, controlNegative] : []),
    fixture.appData,
  ])
    assert.ok(
      !encoded.includes(forbidden),
      `Regional/internal/template field leaked into accepted provenance: ${forbidden}`,
    )
}

function sourceUiState(layer) {
  assert.ok(layer)
  return Object.fromEntries(
    ['id', 'name', 'visible', 'locked', 'opacity', 'blendMode', 'width', 'height', 'transform'].map(
      (key) => [key, structuredClone(layer[key])],
    ),
  )
}
async function rasterBytes(layer) {
  return Buffer.from(
    await application.evaluate(async ({ net }, url) => {
      const response = await net.fetch(url)
      if (!response.ok) throw new Error('Signed Raster PNG unavailable')
      return [...new Uint8Array(await response.arrayBuffer())]
    }, layer.imageUrl),
  )
}
async function assertSavedSource(saved, visible) {
  const source = saved.project.layers.find(({ id }) => id === project.sourceLayerId)
  assert.ok(source)
  assert.equal(source.kind, 'raster')
  assert.equal(source.visible, visible)
  assert.deepEqual(source.asset, project.sourceAsset)
  assert.deepEqual(source.transform, sourceTransform)
  assert.equal(source.opacity, 1)
  assert.equal(source.blendMode, 'normal')
  assert.equal(source.generationProvenance, undefined)
  assert.ok(
    (await saved.readMember(source.asset.path)).equals(sourceBytes),
    'Original source member changed',
  )
  return source
}
async function selectCandidate(jobId) {
  const results = await api('listGenerationResults', project.id)
  const index = results.candidates.findIndex(({ queueItemId }) => queueItemId === jobId)
  assert.ok(index >= 0)
  for (let n = 0; n < results.candidates.length; n++)
    await tray()
      .getByRole('checkbox', { name: `Select candidate ${n + 1}`, exact: true })
      .uncheck()
  await tray()
    .getByRole('checkbox', { name: `Select candidate ${index + 1}`, exact: true })
    .check()
  await tray()
    .getByRole('button', { name: `Preview candidate ${index + 1}`, exact: true })
    .click()
  await expect(
    tray().getByRole('button', { name: `Preview candidate ${index + 1}`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  return results.candidates
    .filter(({ queueItemId }) => queueItemId !== jobId)
    .map(({ queueItemId }) => queueItemId)
}
async function closeProjectDiscardCandidates() {
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  const dialog = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Discard Candidates and Close', exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveCount(0)
}
async function acceptUndoSaveReopen(output, frozen) {
  const unselected = await selectCandidate(output.candidate.queueItemId)
  await screenshot('05-selected-results-preview')
  if (outpaint) {
    const hidden = (await current()).layers.find(({ id }) => id === project.sourceLayerId)
    assert.equal(hidden.visible, false)
    assert.deepEqual(sourceUiState(hidden), report.edited.sourceLayer)
    await window.getByRole('button', { name: `Show ${hidden.name}`, exact: true }).click()
    await expect
      .poll(
        async () => (await current()).layers.find(({ id }) => id === project.sourceLayerId).visible,
      )
      .toBe(true)
  }
  const before = await current(),
    packageBefore = await hashFile(project.file)
  assert.equal(
    packageBefore,
    outpaint ? report.edited.packageSha256 : project.initialPackageSha256,
    'Preview/showing source must not save implicitly',
  )
  const beforeIds = before.layers.map(({ id }) => id),
    originalSource = imageInput
      ? before.layers.find(({ id }) => id === project.sourceLayerId)
      : null
  assert.deepEqual(beforeIds, imageInput ? [project.sourceLayerId] : [])
  const originalSourceState = originalSource ? sourceUiState(originalSource) : null
  if (originalSource) {
    assert.equal(originalSource.visible, true)
    assert.ok((await rasterBytes(originalSource)).equals(sourceBytes))
  }
  report.beforeAdd = {
    sourceShownThroughUi: outpaint,
    sourceState: originalSourceState,
    packageSha256: packageBefore,
    selectedQueueItemId: output.candidate.queueItemId,
    unselectedQueueItemIds: unselected,
  }
  await tray().getByRole('button', { name: 'Add 1 as Layer', exact: true }).click()
  if (unselected.length) {
    const confirmation = window.getByRole('dialog', {
      name: 'Accept generation results',
      exact: true,
    })
    await expect(confirmation).toBeVisible()
    await expect(
      confirmation.getByText(
        `${unselected.length} unchecked temporary result will be discarded. To keep one, cancel and select it or save its image first.`,
        { exact: true },
      ),
    ).toBeVisible()
    await confirmation
      .getByRole('button', { name: `Add 1, Discard ${unselected.length}`, exact: true })
      .click()
    report.unselectedTemporaryCandidatesExplicitlyDiscardedOnAdd = unselected
  }
  await expect
    .poll(async () => (await current()).layers.length, { timeout: timeout() })
    .toBe(beforeIds.length + 1)
  const added = await current(),
    layer = added.layers.find(({ id }) => !beforeIds.includes(id))
  assert.ok(layer)
  assert.equal(layer.kind, undefined)
  assert.equal(layer.resultComparisonSourceKind, 'raster')
  assert.equal(layer.resultPresetSourceKind, 'raster')
  if (imageInput)
    assert.deepEqual(
      sourceUiState(added.layers.find(({ id }) => id === project.sourceLayerId)),
      originalSourceState,
    )
  assert.equal(await hashFile(project.file), packageBefore, 'Add must not save implicitly')
  const remaining = await api('listGenerationResults', project.id)
  assert.deepEqual(
    remaining.candidates,
    [],
    'Explicit Add confirmation closes staging: selected accepted and unchecked discarded',
  )
  await canvas().getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await current()).layers.map(({ id }) => id)).toEqual(beforeIds)
  if (imageInput) assert.deepEqual(sourceUiState((await current()).layers[0]), originalSourceState)
  await canvas().getByRole('button', { name: 'Redo', exact: true }).click()
  await expect
    .poll(async () => (await current()).layers.map(({ id }) => id))
    .toEqual([layer.id, ...beforeIds])
  if (imageInput)
    assert.deepEqual(
      sourceUiState((await current()).layers.find(({ id }) => id === project.sourceLayerId)),
      originalSourceState,
    )
  assert.equal(await hashFile(project.file), packageBefore)
  await save()
  const saved = await readIgsPackage(project.file),
    raster = saved.project.layers.find(({ id }) => id === layer.id)
  assert.equal(saved.project.layers.length, beforeIds.length + 1)
  assert.ok(raster)
  assert.equal(raster.kind, 'raster')
  assert.deepEqual(raster.transform, {
    x: bbox.x,
    y: bbox.y,
    scaleX: 1,
    scaleY: 1,
    rotationDegrees: 0,
  })
  assert.equal(raster.asset.sha256, sha(output.bytes))
  assert.ok((await saved.readMember(raster.asset.path)).equals(output.bytes))
  if (imageInput) await assertSavedSource(saved, true)
  assertProvenance(raster.generationProvenance, output.candidate, frozen, sha(output.bytes))
  assert.deepEqual(saved.project.generationDraft, before.generationDraft)
  assert.equal(saved.project.lastActualSeedSnapshot, frozenSeed(frozen))
  const side = outpaint ? 640 : 512
  assert.deepEqual(saved.manifest.preview, {
    status: 'rendered',
    rect: { x: bbox.x, y: bbox.y, width: side, height: side },
  })
  const merged = decodePng(await saved.readMember('preview/merged.png'), null, {
    width: side,
    height: side,
  })
  const composite = outpaint ? assertMergedPreview(merged, output.decoded) : null
  if (!outpaint)
    assert.ok(
      merged.rgb.equals(output.decoded.rgb),
      'Opaque accepted Raster must supply every merged RGB channel',
    )
  report.accepted = {
    layerId: layer.id,
    asset: raster.asset,
    provenance: raster.generationProvenance,
    sourceLayerId: project.sourceLayerId,
    sourceState: originalSourceState,
    mergedRgbSha256: merged.rgbSha256,
    mergedRgbaSha256: merged.rgbaSha256,
    composite,
    packageSha256: await hashFile(project.file),
  }
  await screenshot('06-raster-after-add-undo-redo-save')
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveCount(0)
  await openProject()
  const reopened = await current()
  assert.equal(reopened.dirty, false)
  assert.deepEqual(
    reopened.layers.map(({ id }) => id),
    [layer.id, ...beforeIds],
  )
  if (imageInput)
    assert.deepEqual(
      sourceUiState(reopened.layers.find(({ id }) => id === project.sourceLayerId)),
      originalSourceState,
    )
  assert.deepEqual(reopened.generationDraft, before.generationDraft)
  assert.ok(
    (await rasterBytes(reopened.layers.find(({ id }) => id === layer.id))).equals(output.bytes),
  )
  if (imageInput)
    assert.ok(
      (await rasterBytes(reopened.layers.find(({ id }) => id === project.sourceLayerId))).equals(
        sourceBytes,
      ),
    )
  const reread = await readIgsPackage(project.file)
  if (imageInput) await assertSavedSource(reread, true)
  assert.deepEqual(reread.manifest.preview, saved.manifest.preview)
  const remerged = decodePng(await reread.readMember('preview/merged.png'), null, {
    width: side,
    height: side,
  })
  assert.ok(remerged.rgba.equals(merged.rgba))
  if (outpaint) assertMergedPreview(remerged, output.decoded)
  await screenshot('07-reopened-raster')
  check(
    'Actual selected-member Add/Undo/Redo/Save/reopen preserves per-item base provenance, original source where present, exact accepted PNG and independently checked saved pixels',
  )
}

async function verifyObservers() {
  const snapshots = report.lifetimes.map(({ observers }) => observers),
    observedWires = allWires()
  assert.equal(observedWires.length, requestBudget)
  assert.equal(new Set(observedWires.map(({ requestId }) => requestId)).size, requestBudget)
  assert.equal(new Set(observedWires.map(({ stagingRoot }) => stagingRoot)).size, requestBudget)
  for (const snapshot of snapshots) {
    assert.deepEqual(snapshot.faults, [])
    assert.equal(snapshot.restored, true)
    for (const worker of snapshot.workers.filter(({ writes }) =>
      writes.some(({ type }) => type === requestType),
    )) {
      assert.equal(await realpath(worker.executable), await realpath(pointer.pythonExecutable))
      assert.ok(worker.args.includes('imagegen_worker.owned_inference'))
      for (const required of [
        capability,
        samplingCapability,
        imageCapability,
        outpaintCapability,
        ...(negativeProfile ? [negativeCapability] : [loraCapability, 'anima-lora']),
        'anima-outpaint',
      ])
        assert.ok(worker.ready.capabilities.includes(required))
      assert.equal(worker.ready.runtimeProfile, 'linux-nvidia')
      assert.equal(worker.originalCalls, 1)
    }
  }
  const calls = snapshots.flatMap(({ ipc }) => ipc)
  const expectedCalls = {
    'projects:generate': outpaint ? 4 : 2,
    'projects:cancel-generation-job': outpaint ? 2 : 0,
    'projects:retry-generation-job': outpaint ? 1 : 0,
    'projects:accept-generation-candidates': 1,
    'projects:undo': 1,
    'projects:redo': 1,
    'projects:save': outpaint ? 5 : 4,
  }
  for (const [channel, count] of Object.entries(expectedCalls)) {
    const selected = calls.filter((call) => call.channel === channel)
    assert.equal(selected.length, count, channel)
    assert.ok(
      selected.every(
        ({ originalCalls, finished, ok }) => originalCalls === 1 && finished && ok === true,
      ),
    )
  }
  for (const [index, call] of calls
    .filter(
      ({ channel, generateResult }) =>
        channel === 'projects:generate' && generateResult.kind === 'queued',
    )
    .entries()) {
    assert.equal(call.generateResult.kind, 'queued')
    assert.deepEqual(
      [...call.generateResult.jobIds].sort(),
      [...report.submissions[index].jobIds].sort(),
    )
  }
  const confirmations = calls.filter(
    ({ channel, generateResult }) =>
      channel === 'projects:generate' && generateResult.kind === 'confirmation-required',
  )
  assert.equal(confirmations.length, outpaint ? 1 : 0)
  if (outpaint) {
    assert.equal(report.explicitReplacements.length, 1)
    assert.deepEqual(report.explicitReplacements[0].queueItemIds, [report.controls[0].queueItemId])
    const cancels = calls.filter(({ channel }) => channel === 'projects:cancel-generation-job')
    assert.ok(
      cancels.some(
        ({ progressBefore }) =>
          progressBefore?.snapshot.current?.jobId === report.canceled.id &&
          progressBefore.snapshot.current.step >= 1,
      ),
    )
  }
  for (const [index, wire] of observedWires.entries()) {
    const worker = snapshots.flatMap(({ workers }) => workers).find(({ pid }) => pid === wire.pid)
    const frames = worker.frames.filter(({ message }) => message.requestId === wire.requestId)
    const progress = frames
      .filter(({ message }) => message.type === 'generation-progress')
      .map(({ message }) => message)
    const expected = samplingFor(wire.bundleJson.recipe.item.seed)
    assert.ok(progress.length > 0)
    assert.deepEqual(
      progress.map(({ step }) => step),
      Array.from({ length: progress.length }, (_, n) => n + 1),
    )
    for (const message of progress) {
      keys(message, ['type', 'protocolVersion', 'requestId', 'step', 'totalSteps'])
      assert.equal(message.totalSteps, expected.totalSteps)
    }
    const canceled = outpaint && index === 2,
      done = frames.filter(({ message }) => message.type === 'generation-done')
    assert.equal(done.length, canceled ? 0 : 1)
    if (canceled)
      assert.ok(
        progress.length < expected.totalSteps,
        'Cancel must stop an actually partial numerical request',
      )
    else assert.equal(progress.length, expected.totalSteps)
    if (index < 2)
      assert.equal(
        wire.bundleJson.recipe.item.seed,
        123,
        negativeProfile
          ? 'Negative A/B controls must use the same numeric seed'
          : 'Healthy and enabled-zero controls must use the same numeric seed',
      )
    const targetJob = report.verifiedAssociations.find(
      ({ wireRequestId }) => wireRequestId === wire.requestId,
    )
    assert.ok(targetJob)
    const forwarded = snapshots
      .flatMap(({ progress }) => progress)
      .filter(({ snapshot }) => snapshot.current?.jobId === targetJob.queueItemId)
    assert.ok(
      forwarded.some(
        ({ snapshot }) =>
          snapshot.current.step >= 1 && snapshot.current.totalSteps === expected.totalSteps,
      ),
      'Actual Main progress must correlate to the corresponding concrete queue item',
    )
  }
  report.requestCount = observedWires.length
}

async function run() {
  await prepare()
  await launch()
  assert.equal((await targetState()).mode, fixture.mode)
  const initial = await current()
  assert.equal(initial.layers.length, imageInput ? 1 : 0)
  if (imageInput) {
    assert.equal(initial.layers[0].id, project.sourceLayerId)
    assert.ok((await rasterBytes(initial.layers[0])).equals(sourceBytes))
  }
  await authorStaticUi()
  if (negativeProfile) assert.equal((await api('getGenerationState', project.id)).animaRegionalNegativeSupported, true)
  await screenshot(negativeProfile ? '00-authored-regional-negatives-ready' : '00-authored-global-lora-ready')
  const first = (await generateItems(1))[0]
  await completed(first.id)
  await idle()
  const controls = [await candidateOutput(first.id, negativeProfile ? 'negative-a' : 'healthy-nonzero')]
  if (negativeProfile) assert.equal(controls[0].localNegative, activeNegative)
  assertFrozenLora(controls[0].frozen, activeWeight)
  if (!outpaint) {
    await acceptUndoSaveReopen(controls[0], controls[0].frozen)
    const accepted = (await current()).layers.find(({ id }) => id === report.accepted.layerId)
    assert.ok(accepted && accepted.visible)
    await window.getByRole('button', { name: `Hide ${accepted.name}`, exact: true }).click()
    await expect
      .poll(async () => (await current()).layers.find(({ id }) => id === accepted.id).visible)
      .toBe(false)
    report[negativeProfile ? 'acceptedHiddenForNegativeControl' : 'acceptedHiddenForZeroControl'] = {
      layerId: accepted.id,
      originalProvenance: report.accepted.provenance,
    }
    assert.equal((await targetState()).mode, fixture.mode)
  }
  await setControl(controlSetting)
  const second = (await generateItems(2))[0]
  await completed(second.id)
  await idle()
  controls.push(await candidateOutput(second.id, negativeProfile ? 'negative-b' : 'enabled-zero-control'))
  if (negativeProfile) assert.equal(controls[1].localNegative, controlNegative)
  assertFrozenLora(controls[1].frozen, controlWeight)
  const healthy = [first, second]
  const firstObserved = await observed(),
    firstWires = wires(firstObserved)
  assert.equal(firstWires.length, 2)
  for (const [index, wire] of firstWires.entries()) await verifyWire(wire, healthy[index])
  if (negativeProfile)
    assert.deepEqual(negativeControlSemanticInput(firstWires[0].bundleJson), negativeControlSemanticInput(firstWires[1].bundleJson))
  else assert.deepEqual(semanticInput(firstWires[0].bundleJson), semanticInput(firstWires[1].bundleJson))
  assert.equal(firstWires[0].target.sha256, firstWires[1].target.sha256)
  let changedRgbChannels = 0,
    changedVisibleRgbChannels = 0,
    changedFullyVisibleRgbChannels = 0
  for (let n = 0; n < controls[0].decoded.rgb.length; n++) {
    const changed = Number(controls[0].decoded.rgb[n] !== controls[1].decoded.rgb[n])
    changedRgbChannels += changed
    if (controls[0].decoded.rgba[Math.floor(n / 3) * 4 + 3] > 0)
      changedVisibleRgbChannels += changed
    if (controls[0].decoded.rgba[Math.floor(n / 3) * 4 + 3] === 255)
      changedFullyVisibleRgbChannels += changed
  }
  assert.ok(
    changedRgbChannels > 0,
    negativeProfile
      ? 'Changing only the first local nonempty negative red scarf to green scarf must change reopened published RGB'
      : 'Changing only the exact enabled LoRA weight -0.5 to0 must change reopened published RGB',
  )
  assert.ok(
    changedVisibleRgbChannels > 0,
    negativeProfile
      ? 'Local-negative contrast must reach visible RGB, not only hidden contribution channels'
      : 'LoRA contrast must reach visible output, not only RGB hidden under zero contribution alpha',
  )
  if (negativeProfile)
    assert.ok(
      changedFullyVisibleRgbChannels > 0,
      'Local-negative contrast must change opaque contribution pixels that stay visibly distinct after source-over',
    )
  if (outpaint) {
    for (let n = 0; n < 512 * 512; n++)
      assert.equal(controls[0].decoded.rgba[n * 4 + 3], controls[1].decoded.rgba[n * 4 + 3])
  }
  assert.notEqual(controls[0].receipt.image_sha256, controls[1].receipt.image_sha256)
  report.controls = controls.map((control) => ({
    queueItemId: control.candidate.queueItemId,
    ...(negativeProfile ? { localNegative: control.localNegative } : { loraWeight: control.weight }),
    actualSeed: control.candidate.actualSeed,
    pngSha256: sha(control.bytes),
    rgbSha256: control.decoded.rgbSha256,
    rgbaSha256: control.decoded.rgbaSha256,
  }))
  report[negativeProfile ? 'negativeOnlyRgbContrast' : 'loraOnlyRgbContrast'] = {
    changedRgbChannels,
    changedVisibleRgbChannels,
    fullRgbBytes: controls[0].decoded.rgb.length,
    seedExact: 123,
    ...(negativeProfile
      ? { allOtherSemanticInputsExact: true, changedOnly: 'region0.localNegativeText', signedSourceCount: 6, keysPerSign: 1536 }
      : { semanticInputsExact: true }),
    ...(negativeProfile ? { changedFullyVisibleRgbChannels } : {}),
    sourceExact: true,
    alphaExact: outpaint,
  }
  report.healthyRows = await Promise.all(healthy.map(({ id }) => row(id)))
  assert.ok(report.healthyRows.every(({ status }) => status === 'completed'))
  if (negativeProfile) assert.equal((await current()).regionalGuidance[0].prompts.negative.text, controlNegative)
  else assert.equal((await current()).generationDraft.loras[0].weight, controlWeight)
  assert.equal(
    await hashFile(project.file),
    project.initialPackageSha256,
    'Completion must not save authoring',
  )
  await screenshot(negativeProfile ? '01-negative-b-control-result' : '01-enabled-zero-control-result')
  if (!outpaint) {
    await closeProjectDiscardCandidates()
    report[negativeProfile ? 'negativeNeighborExplicitlyDiscarded' : 'zeroTemporaryCandidateExplicitlyDiscarded'] = second.id
    await openProject()
    const accepted = (await current()).layers.find(({ id }) => id === report.accepted.layerId)
    assert.ok(accepted && !accepted.visible)
    assert.ok((await rasterBytes(accepted)).equals(controls[0].bytes))
    await window.getByRole('button', { name: `Show ${accepted.name}`, exact: true }).click()
    await expect
      .poll(async () => (await current()).layers.find(({ id }) => id === accepted.id).visible)
      .toBe(true)
    await save()
    await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
    await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveCount(0)
    await openProject()
    const finalSaved = await readIgsPackage(project.file)
    const finalAccepted = finalSaved.project.layers.find(({ id }) => id === accepted.id)
    assert.ok(finalAccepted && finalAccepted.visible)
    assert.deepEqual(finalAccepted.generationProvenance, report.accepted.provenance)
    assertProvenance(
      finalAccepted.generationProvenance,
      controls[0].candidate,
      controls[0].frozen,
      sha(controls[0].bytes),
    )
    assert.ok((await finalSaved.readMember(finalAccepted.asset.path)).equals(controls[0].bytes))
    if (negativeProfile) assert.equal(finalSaved.project.regionalGuidance[0].prompts.negative.text, controlNegative)
    else assert.equal(finalSaved.project.generationDraft.loras[0].weight, controlWeight)
    if (imageInput) await assertSavedSource(finalSaved, true)
    const finalPreview = decodePng(await finalSaved.readMember('preview/merged.png'))
    assert.ok(finalPreview.rgb.equals(controls[0].decoded.rgb))
    report.accepted[negativeProfile ? 'beforeNegativeControlPackageSha256' : 'beforeZeroControlPackageSha256'] = report.accepted.packageSha256
    report.accepted.packageSha256 = await hashFile(project.file)
    report.accepted[negativeProfile ? 'afterNegativeControl' : 'afterZeroControl'] = {
      sameProvenance: true,
      sameAcceptedPng: true,
      visible: true,
      ...(negativeProfile ? { currentLocalNegative: controlNegative } : { currentWeight: controlWeight }),
      mergedRgbSha256: finalPreview.rgbSha256,
    }
    assert.deepEqual((await api('listGenerationResults', project.id)).candidates, [])
    await screenshot(negativeProfile ? '08-negative-a-accepted-after-b-discard-reopened' : '08-nonzero-accepted-after-zero-discard-reopened')
  } else {
    await closeProjectDiscardCandidates()
    report[negativeProfile ? 'negativeNeighborExplicitlyDiscardedBeforeCancel' : 'zeroTemporaryCandidateExplicitlyDiscardedBeforeCancel'] = second.id
    await openProject()
    await setControl(activeSetting)
    const [running, pending] = await generateItems(4, 2)
    await openQueue()
    assert.equal(
      (await row(pending.id)).status,
      'pending',
      'Cancel pending sibling before native dispatch',
    )
    await queueRow(pending.id).getByRole('button', { name: 'Cancel job', exact: true }).click()
    await expect
      .poll(async () => (await row(pending.id)).status, { timeout: timeout() })
      .toBe('canceled')
    report.pendingCanceled = await row(pending.id)
    assert.equal(report.pendingCanceled.frozen_payload_json, pending.frozen_payload_json)
    await progressBeforeCancel(running.id)
    await bounds('actual-progress-before-running-cancel')
    await expect
      .poll(async () => (await row(running.id)).status, { timeout: timeout() })
      .toBe('canceled')
    await idle()
    assert.equal((await api('getGenerationProgress')).current, null)
    report.canceled = await row(running.id)
    assert.equal(report.canceled.frozen_payload_json, running.frozen_payload_json)
    const cancelObserved = await observed(),
      thirdWire = wires(cancelObserved)[2]
    assert.equal(wires(cancelObserved).length, 3, 'Pending sibling must receive no native request')
    await verifyWire(thirdWire, running)
    assert.deepEqual(semanticInput(thirdWire.bundleJson), semanticInput(firstWires[0].bundleJson))
    assert.deepEqual(
      thirdWire.bundleJson.request.job.loras,
      firstWires[0].bundleJson.request.job.loras,
    )
    assert.deepEqual(await Promise.all(healthy.map(({ id }) => row(id))), report.healthyRows)
    assert.equal((await api('listGenerationResults', project.id)).candidates.length, 0)
    assert.equal(await hashFile(project.file), project.initialPackageSha256)
    assert.equal(
      (
        await database.db
          .selectFrom('generation_candidate_receipt')
          .selectAll()
          .where('local_project_key', '=', project.id)
          .execute()
      ).length,
      2,
    )
    await closeQueue()
    await editCurrent()
    await closeNative('saved-authoring-restart')
    await launch()
    assert.equal(await hashFile(project.file), report.edited.packageSha256)
    assert.deepEqual((await current()).generationDraft, report.edited.generationDraft)
    assert.deepEqual((await current()).generationDraft.loras, [])
    assert.equal((await targetState()).mode, 'txt2img')
    assert.deepEqual(
      sourceUiState((await current()).layers.find(({ id }) => id === project.sourceLayerId)),
      report.edited.sourceLayer,
    )
    await openQueue()
    await expect(queueRow(running.id)).toContainText('Canceled')
    const retry = queueRow(running.id).getByRole('button', { name: 'Retry job', exact: true })
    await expect(retry).toBeEnabled({ timeout: timeout() })
    await retry.click()
    await expect.poll(async () => (await ownRows()).length, { timeout: timeout() }).toBe(5)
    const retried = (await ownRows()).find(({ id }) => !report.admitted.includes(id))
    assert.ok(retried)
    assert.equal(retried.frozen_payload_json, running.frozen_payload_json)
    assert.notEqual(retried.batch_id, running.batch_id)
    assert.notEqual(retried.staging_session_id, running.staging_session_id)
    report.retry = {
      id: retried.id,
      canceledId: running.id,
      pendingCanceledId: pending.id,
      frozenPayloadSha256: sha(Buffer.from(retried.frozen_payload_json)),
    }
    if (negativeProfile) await captureFrozenNegative(retried, activeNegative)
    await screenshot(negativeProfile ? '04-explicit-frozen-negative-retry' : '04-explicit-frozen-lora-retry')
    await closeQueue()
    await completed(retried.id)
    await idle()
    const retriedObserved = await observed(),
      retryWire = wires(retriedObserved)[0]
    assert.equal(wires(retriedObserved).length, 1)
    await verifyWire(retryWire, retried)
    assert.deepEqual(semanticInput(retryWire.bundleJson), semanticInput(thirdWire.bundleJson))
    assert.deepEqual(retryWire.bundleJson.request.job.loras, thirdWire.bundleJson.request.job.loras)
    const output = await candidateOutput(retried.id, negativeProfile ? 'frozen-negative-retry' : 'frozen-lora-retry')
    assert.ok(
      output.decoded.rgba.equals(controls[0].decoded.rgba),
      negativeProfile
        ? 'Frozen Retry must reproduce its original exact negative-A healthy RGBA'
        : 'Frozen Retry must reproduce its original exact nonzero-LoRA healthy RGBA',
    )
    assert.ok(
      !output.decoded.rgb.equals(controls[1].decoded.rgb),
      negativeProfile
        ? 'Frozen negative-A Retry must remain different from its negative-B neighbor'
        : 'Frozen nonzero-LoRA Retry must remain different from its enabled-zero control',
    )
    report.retry[negativeProfile ? 'rgbaExactNegativeA' : 'rgbaExactHealthyNonzero'] = true
    report.retry[negativeProfile ? 'negativeNeighborRemainsDifferent' : 'zeroControlRemainsDifferent'] = true
    assert.equal(await hashFile(project.file), report.edited.packageSha256)
    await acceptUndoSaveReopen(output, JSON.parse(retried.frozen_payload_json))
    assert.deepEqual(await Promise.all(healthy.map(({ id }) => row(id))), report.healthyRows)
    assert.equal((await row(pending.id)).status, 'canceled')
  }
  report.finalSql = await snapshotSql()
  preserveSql(report.finalSql)
  report.finalOwnRows = await ownRows()
  assert.deepEqual(
    report.finalOwnRows.map(({ status }) => status).sort(),
    outpaint
      ? ['canceled', 'canceled', 'completed', 'completed', 'completed']
      : ['completed', 'completed'],
  )
  assert.ok(
    report.finalOwnRows.every(({ operation }) => operation === `anima-regional-${fixture.mode}`),
  )
  const receipts = await database.db
    .selectFrom('generation_candidate_receipt')
    .selectAll()
    .where('local_project_key', '=', project.id)
    .execute()
  assert.equal(receipts.length, outpaint ? 3 : 2)
  assert.deepEqual(
    receipts.map(({ actual_seed }) => actual_seed).sort(),
    outpaint ? [123, 123, 123] : [123, 123],
  )
  assert.ok(receipts.every(({ status }) => status === 'completed'))
  assert.equal(
    (
      await database.db
        .selectFrom('generation_seed_cursor')
        .selectAll()
        .where('local_project_key', '=', project.id)
        .executeTakeFirstOrThrow()
    ).actual_seed,
    123,
  )
  await closeNative('finished')
  await verifyObservers()
  assert.deepEqual(await treeManifest(provision.installed.workerRoot), installedBefore)
  assert.deepEqual(await json(path.join(fixture.appData, 'qualification-runtime.json')), marker)
  assert.deepEqual(await json(path.join(fixture.appData, 'runtime/current-runtime.json')), pointer)
  for (const file of sourceFiles) assert.equal(await hashFile(file), report.sourcePins[file])
  for (const [role, file] of Object.entries(bundle))
    assert.deepEqual(statIdentity(await regular(file.path)), report.catalog.fileStats[role])
  if (!negativeProfile) {
    assert.equal(await hashFile(fixture.lora.managedPath), fixture.lora.sha256)
    assert.deepEqual(statIdentity(await regular(fixture.lora.managedPath)), report.catalog.lora.stat)
  }
  for (const file of report.protectedProjects) {
    assert.deepEqual(statIdentity(await regular(file.path)), file.stat)
    assert.equal(await hashFile(file.path), file.sha256)
  }
  for (const value of [fixture.provisionReport, ...Object.values(fixture.baseline), fixture.source])
    await descriptor(value)
  assert.deepEqual(statIdentity(await regular(fixture.source.path)), statIdentity(sourceStat))
  const infillAfter = await new InferenceAuxiliaryResources(
    path.join(fixture.appData, 'inference-resources'),
  ).resolveVerifiedOutpaintInfill()
  const { stat: infillStat, ...originalInfill } = outpaintInfill
  assert.deepEqual(infillAfter, originalInfill)
  assert.deepEqual(statIdentity(await regular(infillAfter.managedPath)), infillStat)
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.boundsError, undefined)
  report.status = 'passed'
  check(
    negativeProfile
      ? 'Independent local/inherited Anima negative signed ranges reach real TXT/IMG/OUT PNGs; only local negative A/B changes visible RGB; OUT selected frozen Retry survives global/local/inheritance/mask/source/model edits, with exact alpha and ordinary-only Add/history/Save provenance'
      : 'Exact signed global Anima LoRA reaches real regional TXT/IMG/OUT output; enabled-zero numerical control, fullstack provenance and selected Add/history/Save are exact; OUT frozen Retry survives current stack/source/model edits',
  )
}

checkpoint()
timer = setTimeout(() => {
  report.deadlineExceeded = true
  report.status = 'failed'
  checkpoint()
  // The inherited/systemd native watchdogs remain authoritative if this launcher
  // cannot service its timer. No signals target unrelated processes or app data.
  void closeNative('deadline').catch((error) => {
    report.deadlineCloseError = String(error.stack ?? error)
    checkpoint()
  })
}, fixture.deadlineSeconds * 1000)
try {
  await run()
} catch (caught) {
  error = caught
  report.status = 'failed'
  report.error = String(caught.stack ?? caught)
  if (window) await screenshot('failure-context').catch(() => {})
} finally {
  clearTimeout(timer)
  if (application) {
    try {
      await closeNative('failure')
    } catch (caught) {
      report.physicalExitError = String(caught.stack ?? caught)
      error ??= caught
    }
  }
  if (database) await database.close()
  report.finishedAt = new Date().toISOString()
  report.elapsedSeconds = (Date.now() - started) / 1000
  checkpoint()
}
process.stdout.write(
  JSON.stringify({
    status: report.status,
    report: reportPath,
    requestCount: report.requestCount ?? null,
  }) + '\n',
)
if (error || report.status !== 'passed') process.exitCode = 1
