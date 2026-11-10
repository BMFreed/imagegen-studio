/**
 * Opt-in installed Regional Guidance qualification; run with tsx after the production build. Does
 * not provision, repair, copy weights, inject a runtime, or clean up retained evidence. InvokeAI
 * source: a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd, canvas graph regional conditioning,
 * session_queue_default.py, session_processor_default.py, and staging-area acceptance callers.
 * Resource/physical-exit and UI patterns adapt qualify-installed-smart-patch.mjs. The
 * initialization profile additionally consults noise.py, latent_noise.py, devices.py and
 * sd/denoise_latents.py; it observes public selection/frozen identity, not raw initializer math.
 * Static batches additionally trace current webv2 queue promptBatch/submissionApi and the backend
 * all_or_none admission mechanism, adapted to Studio's existing atomic batch contract. Global LoRAs
 * additionally trace SDXLLoRACollectionLoader, Compel and UNet callers, LayerPatcher and LoRALayer
 * at that same revision. The installed proof observes exact ordered resource handoff, not numerical
 * LoRA causality or borrowed-weight restoration. Selected VAE/precision additionally follows
 * current Invoke graph.ts, VAELoaderInvocation and vae/latents_to_image.py; UI helper patterns
 * adapt qualify-installed-generation.mjs. Dynamic global positive additionally follows current
 * workbench/invocationSubmit.ts and queue promptBatch/submissionApi; only selected concrete
 * positives reach the unchanged static regional worker. Its preparation pool is the selected-plan
 * union, while ordinary preparation retains its broader authored-resource contract. CFG Rescale
 * additionally follows Invoke's RescaleCFGExt after CFG combination and before the native scheduler
 * step. It uses the existing Advanced Options control and frozen base field. Opaque img2img follows
 * current invokeai/frontend/webv2 canvas compileCanvasGraph graftImageToImage ->
 * addRegionalGuidance, sd/denoise_latents.py::init_scheduler and saved-root Queue Retry. It reuses
 * the existing imported-Raster, numeric progress and explicit Add/Save owners. The separate opaque
 * IMG CFG Rescale profile selects 0.7 through Advanced Options, then saves 0.2 after Cancel; both
 * image encoding and the rescale extension retain their existing native owners. The separate IMG
 * VAE profile reuses the exact selected-VAE/precision controls and Invoke's image_to_latents.py
 * encode/scale ordering through the existing prepared regional VAE owner. Mixed-alpha outpaint
 * additionally follows graftOutpaint, create_gradient_mask and InpaintExt before the same regional
 * conditioning; ordinary contribution verification and portable source provenance remain their
 * owners. The additive V-prediction profile consults current InvokeAI
 * b0ac163b139c432aff4c51078c31c074bf292f72 sd/denoise_latents.py::get_scheduler: the verified model
 * objective reaches the existing scheduler, independently of noise policy. The additive V-sampling
 * profiles consult current InvokeAI4875d96531ca6712b288f6e660fcbb34143408c1 get_scheduler,
 * init_scheduler, SCHEDULER_MAP and StableDiffusionBackend: existing Euler-a/DPM++2M selection,
 * initializer/source window and native history remain separate from the UNet objective.
 * Reference-image profile freshly follows InvokeAI4875d96531ca6712b288f6e660fcbb34143408c1
 * compileCanvasGraph -> addRegionalGuidance -> sd/ip_adapter.py and sd/denoise_latents.py callers.
 * It uses original canonical imported PNGs and the existing Main queue/Retry/acceptance owners.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { deflateSync, inflateSync } from 'node:zlib'

import { _electron as electron, expect } from '@playwright/test'
import yauzl from 'yauzl'

import { openAppDatabase } from '../src/main/db/database.ts'
import { CivitaiClient } from '../src/main/models/civitai-client.ts'
import { CivitaiTokenStore } from '../src/main/models/civitai-token-store.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { ModelService } from '../src/main/models/model-service.ts'
import { InferenceAuxiliaryResources } from '../src/main/runtime/inference-auxiliary-resources.ts'
import { assertOutpaintContribution } from '../src/main/projects/outpaint-contribution.ts'
import {
  INVOKE_ALPHA_OUTPAINT_POLICY_V1,
  LAMA_OUTPAINT_IDENTITY_V1,
} from '../src/shared/projects/alpha-outpaint.ts'
import { qualifySdxlCheckpoint } from '../src/main/models/sdxl-checkpoint-qualification.ts'
import { encodeProjectMaskPng } from '../src/main/projects/project-mask.ts'
import { ProjectSession } from '../src/main/projects/project-session.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { isQualifiedInferenceWorkerReady } from '../src/shared/projects/inference-worker-capabilities.ts'
import { REGIONAL_REFERENCE_INFERENCE_PROFILE } from '../src/shared/projects/regional-reference-inference.ts'
import { generationTargetSignature } from '../src/shared/projects/project-generation-target-state.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
  signalQualificationMain,
  stopExpiredQualificationProcess,
  stopOwnedQualificationScope,
} from './qualification-resource-limits.mjs'
import {
  assertRuntimeIdle,
  assertUpgradeBounds,
  treeManifest,
} from './upgrade-qualification-worker.mjs'

assert.deepEqual(process.argv.slice(2, 3), ['--fixture'])
assert.equal(process.argv.length, 4)
const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const canonical = (value) =>
  assert.ok(typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value)
const within = (root, value) => {
  const relative = path.relative(root, value)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}
async function regular(file) {
  canonical(file)
  const stat = await lstat(file)
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), `Expected a regular file: ${file}`)
  assert.equal(await realpath(file), file)
  return stat
}
async function directory(file) {
  canonical(file)
  const stat = await lstat(file)
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink())
  assert.equal(await realpath(file), file)
}
async function jsonFile(file, maximum = 32 * 1024 ** 2) {
  assert.ok((await regular(file)).size <= maximum)
  return JSON.parse(await readFile(file, 'utf8'))
}
async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}
const fixturePath = process.argv[3]
const fixture = await jsonFile(fixturePath, 64 * 1024)
assert.deepEqual(
  Object.keys(fixture).sort(),
  [
    'appData',
    'artifacts',
    'checkpoint',
    'deadlineSeconds',
    'profile',
    'provisionReport',
    'schemaVersion',
    ...(fixture.profile === 'installed-regional-invoke-reference-images-v1'
      ? ['referenceImages']
      : []),
  ].sort(),
)
assert.equal(fixture.schemaVersion, 1)
assert.ok(
  [
    'installed-regional-invoke-v1',
    'installed-regional-invoke-recovery-v1',
    'installed-regional-invoke-main-death-v1',
    'installed-regional-invoke-progress-v1',
    'installed-regional-invoke-worker-fault-v1',
    'installed-regional-invoke-initialization-v1',
    'installed-regional-invoke-static-batch-v1',
    'installed-regional-invoke-global-embeddings-v1',
    'installed-regional-invoke-global-loras-v1',
    'installed-regional-invoke-vae-v1',
    'installed-regional-invoke-dynamic-positive-v1',
    'installed-regional-invoke-dpmpp-2m-v1',
    'installed-regional-invoke-cfg-rescale-v1',
    'installed-regional-invoke-img2img-v1',
    'installed-regional-invoke-img2img-cfg-rescale-v1',
    'installed-regional-invoke-img2img-euler-a-v1',
    'installed-regional-invoke-img2img-dpmpp-2m-v1',
    'installed-regional-invoke-img2img-vae-v1',
    'installed-regional-invoke-outpaint-v1',
    'installed-regional-invoke-v-prediction-v1',
    'installed-regional-invoke-v-prediction-img2img-v1',
    'installed-regional-invoke-v-prediction-outpaint-v1',
    'installed-regional-invoke-v-prediction-euler-a-v1',
    'installed-regional-invoke-v-prediction-dpmpp-2m-img2img-v1',
    'installed-regional-invoke-v-prediction-dpmpp-2m-outpaint-v1',
    'installed-regional-invoke-reference-images-v1',
  ].includes(fixture.profile),
)
const referenceImagesProfile = fixture.profile === 'installed-regional-invoke-reference-images-v1'
const vPredictionEulerAProfile =
  fixture.profile === 'installed-regional-invoke-v-prediction-euler-a-v1'
const vPredictionNormalDpmProfile =
  fixture.profile === 'installed-regional-invoke-v-prediction-dpmpp-2m-img2img-v1'
const vPredictionKarrasDpmProfile =
  fixture.profile === 'installed-regional-invoke-v-prediction-dpmpp-2m-outpaint-v1'
const vPredictionDpmProfile = vPredictionNormalDpmProfile || vPredictionKarrasDpmProfile
const vPredictionSamplingProfile = vPredictionEulerAProfile || vPredictionDpmProfile
const vPredictionImageProfile = [
  'installed-regional-invoke-v-prediction-img2img-v1',
  'installed-regional-invoke-v-prediction-outpaint-v1',
  'installed-regional-invoke-v-prediction-dpmpp-2m-img2img-v1',
  'installed-regional-invoke-v-prediction-dpmpp-2m-outpaint-v1',
].includes(fixture.profile)
const vPredictionProfile =
  vPredictionSamplingProfile ||
  vPredictionImageProfile ||
  fixture.profile === 'installed-regional-invoke-v-prediction-v1'
const predictionType = vPredictionProfile ? 'v_prediction' : 'epsilon'
const outpaintProfile =
  fixture.profile === 'installed-regional-invoke-outpaint-v1' ||
  fixture.profile === 'installed-regional-invoke-v-prediction-outpaint-v1' ||
  vPredictionKarrasDpmProfile
const imgEulerAProfile = fixture.profile === 'installed-regional-invoke-img2img-euler-a-v1'
const imgDpmProfile = fixture.profile === 'installed-regional-invoke-img2img-dpmpp-2m-v1'
const imgVaeProfile = fixture.profile === 'installed-regional-invoke-img2img-vae-v1'
const imgSamplerProfile = imgEulerAProfile || imgDpmProfile
const imgSamplerCapability = imgDpmProfile
  ? 'illustrious-regional-img2img-dpmpp-2m-v1'
  : 'illustrious-regional-img2img-euler-a-v1'
const imageCfgRescaleProfile =
  (outpaintProfile && !vPredictionImageProfile) ||
  imgSamplerProfile ||
  imgVaeProfile ||
  fixture.profile === 'installed-regional-invoke-img2img-cfg-rescale-v1'
const imageProfile =
  vPredictionImageProfile ||
  imageCfgRescaleProfile ||
  fixture.profile === 'installed-regional-invoke-img2img-v1'
const generationMode = outpaintProfile ? 'outpaint' : imageProfile ? 'img2img' : 'txt2img'
const regionalOperation = `illustrious-regional-${generationMode}`
const generationRequestType = `generate-illustrious-${generationMode}`
const mainDeathProfile = fixture.profile === 'installed-regional-invoke-main-death-v1'
const workerFaultProfile = fixture.profile === 'installed-regional-invoke-worker-fault-v1'
const staticBatchProfile = fixture.profile === 'installed-regional-invoke-static-batch-v1'
const cfgRescaleProfile = fixture.profile === 'installed-regional-invoke-cfg-rescale-v1'
const dpmpp2mProfile =
  cfgRescaleProfile || fixture.profile === 'installed-regional-invoke-dpmpp-2m-v1'
const dynamicPositiveProfile =
  dpmpp2mProfile || fixture.profile === 'installed-regional-invoke-dynamic-positive-v1'
const globalVaeProfile =
  dynamicPositiveProfile || fixture.profile === 'installed-regional-invoke-vae-v1'
const vaeSelectionProfile = globalVaeProfile || imgVaeProfile
const globalLoraProfile =
  globalVaeProfile || fixture.profile === 'installed-regional-invoke-global-loras-v1'
const globalTiProfile =
  globalLoraProfile || fixture.profile === 'installed-regional-invoke-global-embeddings-v1'
const multipleResultsProfile = staticBatchProfile || globalTiProfile
const initializationProfile =
  vPredictionEulerAProfile ||
  multipleResultsProfile ||
  fixture.profile === 'installed-regional-invoke-initialization-v1'
const progressProfile =
  referenceImagesProfile ||
  vPredictionProfile ||
  imageProfile ||
  initializationProfile ||
  workerFaultProfile ||
  fixture.profile === 'installed-regional-invoke-progress-v1'
const recoveryProfile =
  mainDeathProfile || fixture.profile === 'installed-regional-invoke-recovery-v1'
const multipleLifetimesProfile = recoveryProfile || vPredictionProfile || referenceImagesProfile
const generationSteps = referenceImagesProfile ? 6 : 30
const initialization = 'invoke-cpu-f32-add-noise-v1'
const generationSampler =
  vPredictionDpmProfile || dpmpp2mProfile || imgDpmProfile
    ? 'DPM++ 2M'
    : initializationProfile || imgEulerAProfile
      ? 'Euler a'
      : 'Euler'
const generationScheduler = vPredictionNormalDpmProfile
  ? 'dpmpp_2m'
  : vPredictionKarrasDpmProfile || dpmpp2mProfile || imgDpmProfile
    ? 'dpmpp_2m_k'
    : initializationProfile || imgEulerAProfile
      ? 'euler_a'
      : 'euler'
const generationScheduleLabel =
  vPredictionKarrasDpmProfile || dpmpp2mProfile || imgDpmProfile ? 'Karras' : 'Normal'
const generationCfgRescale = cfgRescaleProfile || imageCfgRescaleProfile ? 0.7 : 0
assert.ok(
  Number.isSafeInteger(fixture.deadlineSeconds) &&
    fixture.deadlineSeconds > 0 &&
    fixture.deadlineSeconds <= 1800,
)
if (imageProfile || vPredictionProfile || referenceImagesProfile)
  assert.ok(fixture.deadlineSeconds <= 600)
const appDataRoot = fixture.appData
const evidenceRoot = fixture.artifacts
for (const value of [
  fixturePath,
  appDataRoot,
  evidenceRoot,
  fixture.provisionReport.path,
  fixture.checkpoint.path,
]) {
  canonical(value)
  // These profiles read the pinned original checkpoint without copying it into owned scratch.
  if (!((vPredictionProfile || referenceImagesProfile) && value === fixture.checkpoint.path))
    assert.ok(within(artifactRoot, value))
}
assert.match(fixture.provisionReport.sha256, /^[a-f0-9]{64}$/)
assert.match(fixture.checkpoint.sha256, /^[a-f0-9]{64}$/)
if (!vPredictionProfile) {
  assert.equal(
    fixture.checkpoint.sha256,
    '3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9',
  )
  assert.equal(fixture.checkpoint.byteSize, 6938040760)
  assert.deepEqual(
    [
      fixture.checkpoint.civitaiModelId,
      fixture.checkpoint.civitaiVersionId,
      fixture.checkpoint.civitaiFileId,
    ],
    [795765, 889818, 798303],
  )
} else {
  assert.ok(Number.isSafeInteger(fixture.checkpoint.byteSize) && fixture.checkpoint.byteSize > 0)
  for (const key of ['civitaiModelId', 'civitaiVersionId', 'civitaiFileId'])
    assert.ok(Number.isSafeInteger(fixture.checkpoint[key]) && fixture.checkpoint[key] > 0)
}
if (vPredictionImageProfile || vPredictionSamplingProfile) {
  assert.equal(
    fixture.checkpoint.sha256,
    'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
  )
  assert.equal(fixture.checkpoint.byteSize, 6938040794)
  assert.deepEqual(
    [
      fixture.checkpoint.civitaiModelId,
      fixture.checkpoint.civitaiVersionId,
      fixture.checkpoint.civitaiFileId,
    ],
    [1147756, 2679856, 2566634],
  )
}
for (const key of ['modelName', 'versionName'])
  assert.ok(typeof fixture.checkpoint[key] === 'string' && fixture.checkpoint[key].length > 0)
await directory(appDataRoot)
assert.equal(path.basename(appDataRoot), 'imagegen-studio')
assert.equal(path.basename(path.dirname(appDataRoot)), 'data')
const fixtureRoot = path.dirname(path.dirname(appDataRoot))
assert.ok(!within(fixtureRoot, evidenceRoot) && !within(evidenceRoot, fixtureRoot))
assert.ok(!within(evidenceRoot, fixture.checkpoint.path))
await directory(path.dirname(evidenceRoot))
assert.equal(
  existsSync(evidenceRoot),
  false,
  'Use a new evidence directory; this runner never resets a prior run',
)
await mkdir(evidenceRoot, { mode: 0o700 })
const reportFile = path.join(evidenceRoot, 'report.json')
const exec = promisify(execFile)
const started = Date.now()
const endAt = started + fixture.deadlineSeconds * 1000
const timeout = (maximum = 30_000) => {
  const left = endAt - Date.now()
  assert.ok(left > 0, 'Overall qualification deadline exceeded')
  return Math.min(maximum, left)
}
const side = imageProfile || vPredictionProfile || referenceImagesProfile ? 512 : 1024
const bbox = { height: side, width: side, x: -13, y: 5 }
const imageStrength = 0.5
// Fixed30 native DPM Karras reference, independently constructed/retained for this
// fixture; Euler keeps its literal leading oracle. Neither calls the worker selector.
// DPM Normal uses N+1 spacing (the existing native N4 test pins801,601,401,201);
// ROOT's original-native fixed-config probe independently confirms both full N30 grids.
const imageTimesteps = vPredictionNormalDpmProfile
  ? Array.from({ length: 30 }, (_, index) => 1 + (30 - index) * Math.floor(1000 / 31))
  : imgDpmProfile || vPredictionKarrasDpmProfile
    ? [
        999, 975, 949, 923, 894, 863, 830, 795, 757, 716, 672, 624, 572, 517, 458, 397, 334, 273,
        214, 162, 117, 80, 53, 33, 20, 11, 6, 3, 1, 0,
      ]
    : Array.from({ length: 30 }, (_, index) => 1 + (29 - index) * Math.floor(1000 / 30))
const imageSelectedTimesteps = imageTimesteps.filter(
  (value) => value < Math.round(1000 * imageStrength),
)
const progressTotal = imageProfile ? imageSelectedTimesteps.length : generationSteps
if (imageProfile) assert.equal(progressTotal, vPredictionNormalDpmProfile ? 15 : 16)
const baseGlobalPrompt =
  'a still life of a red apple and a blue ceramic mug on a plain table, two separate objects, soft studio lighting'
const globalPrompt = dynamicPositiveProfile
  ? `${baseGlobalPrompt} {<variant-a>|<variant-c>|unused ordinary detail}`
  : globalTiProfile
    ? `${baseGlobalPrompt} <shared>`
    : baseGlobalPrompt
const globalNegativePrompt = globalTiProfile ? '<shared>' : ''
const localPrompts = [
  globalTiProfile ? `${baseGlobalPrompt} <shared>` : 'a single red apple',
  'a single blue ceramic mug',
]
const policy = {
  schemaVersion: 1,
  baseSchedule: 'sdxl-scaled-linear-v1',
  rescaleBetasZeroSnr: false,
  timestepSpacing: 'leading',
}
const report = {
  schemaVersion: 1,
  profile: fixture.profile,
  outcome: 'running',
  startedAt: new Date(started).toISOString(),
  fixturePath,
  fixtureSha256: await hashFile(fixturePath),
  harnessSource: {
    path: fileURLToPath(import.meta.url),
    byteSize: (await regular(fileURLToPath(import.meta.url))).size,
    sha256: await hashFile(fileURLToPath(import.meta.url)),
  },
  appDataRoot,
  evidenceRoot,
  checks: [],
  screenshots: [],
  pageErrors: [],
  resourceLimitChecks: [],
  nativeClosures: [],
  memoryObservations: {},
  boundary: {
    actual:
      'Built renderer UI -> original IPC/Main -> default installed RuntimeManager -> public regional SQL/frozen request -> Python -> staging/signed Results -> Raster Add/Undo/Redo -> explicit Save and reopen.',
    preconditions:
      'Original pinned official epsilon checkpoint is adopted by real ModelRepository after full SHA and bounded SDXL header verification. CivitAI IDs/family are declared fixture identity, not a download or lineage qualification. Three real portable ProjectSession documents, masks and two source Raster assets are setup; no caller-supplied worker recipe.',
    calls:
      'One UI Generate canceled after a witnessed original regional JSONL request; one Queue Retry of original frozen 30-step seed123 recipe after current authoring changes. Exactly two regional wires and one completion receipt are required; physical exits are verified separately.',
    progress:
      'Running/busy/Cancel are checked. Regional numerical denoising step telemetry is unqualified and is not required by this runner.',
    exclusions:
      'No visual quality PASS, full Invoke parity, generic SDXL, Anima, LoRA, regional reference/TI, installer/Repair or CivitAI delivery claim. Negative historical visual conclusions remain unchanged.',
    retention:
      'No cleanup. Original weights, installed runtime and failed payloads are retained; ROOT owns disposal after physical exit proof.',
  },
}
let application,
  window,
  database,
  provision,
  marker,
  pointer,
  installedTree,
  model,
  catalogBefore,
  modelStat
let sampler, closing, deadlineTimer
let activeLifetime = null,
  baselineSql = null,
  recoveryProject = null,
  previousTransport = null,
  mainDeathControls = null
const baselinePackages = []
let preservationBaseline = null,
  progressProject = null,
  progressDomInstalled = false
let globalTi = null
let globalLoras = null
let globalVae = null
let outpaintInfill = null
let referenceResources = null
let sampling = Promise.resolve()
const nativeChecks = []
const projects = []
const memoryGroups = new Map()
function checkpoint() {
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
}
function check(name, evidence = {}) {
  const entry = {
    name,
    ...(recoveryProfile && activeLifetime ? { lifetime: activeLifetime.number } : {}),
    ...evidence,
  }
  report.checks.push(entry)
  if (recoveryProfile && activeLifetime) (activeLifetime.checks ??= []).push(entry)
  checkpoint()
  console.log(`PASS ${name}`)
}
const sourceFiles = [
  'scripts/qualify-installed-regional-generation.mjs',
  'scripts/qualify-installed-smart-patch.mjs',
  'scripts/smart-patch-qualification-oracles.mjs',
  'scripts/qualification-resource-limits.mjs',
  'scripts/native-smoke-window.mjs',
  'scripts/upgrade-qualification-worker.mjs',
  'src/main/index.ts',
  'src/main/app-paths.ts',
  'src/preload/index.ts',
  'src/shared/api.ts',
  'src/main/runtime/index.ts',
  'src/main/projects/generation-worker-client.ts',
  'src/main/projects/inference-worker-ownership.ts',
  'src/main/projects/generation-action-controller.ts',
  'src/main/projects/generation-dispatch-coordinator.ts',
  'src/main/projects/generation-orchestrator.ts',
  'src/main/projects/project-regional-generation-coordinator.ts',
  'src/main/projects/regional-generation-processor.ts',
  'src/main/projects/regional-worker-request.ts',
  'src/main/projects/regional-queued-generation.ts',
  'src/main/projects/generation-queue.ts',
  'src/main/projects/generation-staging.ts',
  'src/main/projects/generation-bootstrap.ts',
  'src/main/projects/generation-app-context.ts',
  'src/main/projects/project-generation-recovery.ts',
  'src/main/projects/project-temporary-recovery.ts',
  'src/main/projects/project-generation-staging-lifecycle.ts',
  'src/main/projects/project-generation-result-resource.ts',
  'src/main/projects/project-generation-acceptance.ts',
  'src/main/projects/project-generation-provenance.ts',
  'src/main/projects/project-generation-preparation.ts',
  'src/main/projects/project-service.ts',
  'src/main/projects/project-session.ts',
  'src/main/projects/igs-package.ts',
  'src/main/models/model-repository.ts',
  'src/main/models/model-service.ts',
  'src/main/models/sdxl-checkpoint-qualification.ts',
  'src/main/db/migrations/0021_public_regional_generation_queue.sql',
  'src/renderer/App.vue',
  'src/renderer/components/ProjectView.vue',
  'src/renderer/components/ProjectCanvas.vue',
  'src/renderer/components/GenerationQueueManager.vue',
  'src/renderer/components/ProjectGenerationResultsTray.vue',
  'worker-python/pyproject.toml',
  'worker-python/uv.lock',
  'worker-python/src/imagegen_worker/inference_lifetime.py',
  'worker-python/src/imagegen_worker/owned_inference.py',
]
if (referenceImagesProfile)
  sourceFiles.push(
    'src/shared/projects/regional-reference-inference.ts',
    'src/shared/projects/regional-invoke-generation.ts',
    'src/shared/projects/inference-worker-capabilities.ts',
    'src/main/projects/project-current-canvas-regional-references.ts',
    'src/main/runtime/inference-auxiliary-resources.ts',
    'src/main/runtime/regional-reference-manifest.ts',
    'src/renderer/components/ProjectRegionalGuidanceRow.vue',
    'src/renderer/components/ProjectRegionalReferenceImages.vue',
    'src/renderer/components/result-preset-draft.ts',
    'worker-python/src/imagegen_worker/illustrious_regional_references.py',
    'worker-python/src/imagegen_worker/illustrious_regional_attention_adapter.py',
  )
if (imageProfile)
  sourceFiles.push(
    'src/shared/projects/regional-invoke-generation.ts',
    'src/shared/projects/inference-worker-capabilities.ts',
    'src/shared/projects/project-generation-actions.ts',
    'src/renderer/components/generation-queue-retry.ts',
    'src/renderer/components/PlainPromptEditor.vue',
    'src/renderer/components/ProjectRasterLayerRow.vue',
    'src/renderer/components/ProjectRegionalGuidanceRow.vue',
    'src/main/db/migrations/0022_regional_img2img_queue.sql',
  )
if (vPredictionImageProfile || vPredictionSamplingProfile)
  sourceFiles.push(
    'src/main/projects/illustrious-generation-vae.ts',
    'src/renderer/components/ProjectGenerationAdvancedOptions.vue',
    'src/renderer/components/vae-precision-control.ts',
    'worker-python/src/imagegen_worker/illustrious_regional_vae.py',
    'worker-python/src/imagegen_worker/inference.py',
    'worker-python/src/imagegen_worker/inference_vae.py',
  )
if (outpaintProfile)
  sourceFiles.push(
    'src/main/db/migrations/0023_regional_outpaint_queue.sql',
    'src/main/projects/outpaint-contribution.ts',
    'src/main/projects/outpaint-conditioning.ts',
    'src/main/runtime/inference-auxiliary-resources.ts',
    'src/shared/projects/alpha-outpaint.ts',
    'worker-python/src/imagegen_worker/outpaint_conditioning.py',
    'worker-python/src/imagegen_worker/outpaint_worker_assets.py',
    'worker-python/src/imagegen_worker/sdxl_outpaint.py',
  )
if (initializationProfile)
  sourceFiles.push(
    'src/shared/projects/inference-worker-capabilities.ts',
    'src/shared/projects/project-generation-actions.ts',
    'src/shared/projects/regional-initialization-profile.ts',
    'src/shared/projects/regional-invoke-generation.ts',
    'src/renderer/components/generation-queue-retry.ts',
  )
if (multipleResultsProfile)
  sourceFiles.push(
    'src/shared/projects/generation-batch-plan.ts',
    'src/shared/projects/generation-batch-policy.ts',
    'src/main/projects/project-current-canvas-regional-recipe.ts',
    'src/main/projects/generation-staging-limits.ts',
  )
if (globalTiProfile)
  sourceFiles.push(
    'src/main/models/civitai-client.ts',
    'src/main/models/civitai-token-store.ts',
    'src/main/models/illustrious-embedding-qualification.ts',
    'src/main/projects/illustrious-generation-embeddings.ts',
  )
if (globalLoraProfile)
  sourceFiles.push(
    'src/main/models/illustrious-lora-qualification.ts',
    'src/main/models/illustrious-lora-target-profile.ts',
    'src/main/projects/illustrious-generation-loras.ts',
    'worker-python/src/imagegen_worker/illustrious_regional_lora.py',
    'worker-python/src/imagegen_worker/illustrious_regional_worker.py',
  )
if (vaeSelectionProfile)
  sourceFiles.push(
    'src/main/models/illustrious-vae-qualification.ts',
    'src/main/projects/illustrious-generation-vae.ts',
    'src/renderer/components/ProjectVaePicker.vue',
    'src/renderer/components/project-vae-picker.ts',
    'src/renderer/components/ProjectGenerationAdvancedOptions.vue',
    'src/renderer/components/vae-precision-control.ts',
    'worker-python/src/imagegen_worker/inference_external_vae.py',
    'worker-python/src/imagegen_worker/inference_vae.py',
  )
if (imgVaeProfile)
  sourceFiles.push(
    'worker-python/src/imagegen_worker/illustrious_regional_vae.py',
    'worker-python/src/imagegen_worker/illustrious_regional_denoising.py',
    'worker-python/src/imagegen_worker/illustrious_regional_worker.py',
  )
if (dynamicPositiveProfile)
  sourceFiles.push(
    'src/shared/projects/generation-dynamic-settings.ts',
    'src/renderer/components/DynamicPromptPreview.vue',
    'src/renderer/components/project-draft-sync.ts',
  )
let bundleFiles
async function captureFiles(files) {
  return Object.fromEntries(
    await Promise.all(files.map(async (file) => [file, await hashFile(file)])),
  )
}
async function verifyProvision() {
  assert.equal(await hashFile(fixture.provisionReport.path), fixture.provisionReport.sha256)
  provision = await jsonFile(fixture.provisionReport.path)
  marker = await jsonFile(path.join(appDataRoot, 'qualification-runtime.json'))
  pointer = await jsonFile(path.join(appDataRoot, 'runtime/current-runtime.json'))
  assert.equal(provision.status, 'activated-qualified')
  assert.equal(provision.appData, appDataRoot)
  assert.equal(provision.confirmedWorkerExit, true)
  assert.equal(marker.report, fixture.provisionReport.path)
  assert.equal(marker.status, 'passed')
  assert.equal(marker.appData, appDataRoot)
  assert.equal(marker.runtimeId, provision.runtimeId)
  assert.equal(marker.confirmedWorkerExit, true)
  assert.equal(pointer.runtimeId, provision.runtimeId)
  assert.equal(pointer.pythonExecutable, provision.pythonExecutable)
  assert.equal(provision.installed.editable, false)
  assert.equal(provision.installed.pythonVersion, '3.12.13')
  for (const value of [
    provision.installed.prefix,
    provision.installed.basePrefix,
    provision.installed.workerRoot,
  ]) {
    assert.ok(within(path.join(appDataRoot, 'runtime'), value))
    assert.equal(await realpath(value), value)
  }
  assert.ok(within(provision.installed.prefix, provision.installed.workerRoot))
  assert.ok(within(path.join(appDataRoot, 'runtime'), await realpath(pointer.pythonExecutable)))
  assert.equal(isQualifiedInferenceWorkerReady(provision.ready), true)
  assert.equal(provision.ready.workerVersion, '0.14.0')
  for (const cap of ['illustrious-regional-invoke-v1', 'private-current-canvas-regional-v1'])
    assert.ok(provision.ready.capabilities.includes(cap), `Missing installed capability ${cap}`)
  if (referenceImagesProfile) {
    assert.ok(provision.ready.capabilities.includes('illustrious-regional-reference-txt2img-v1'))
    referenceResources = await new InferenceAuxiliaryResources(
      path.join(appDataRoot, 'inference-resources'),
    ).resolveVerifiedRegionalReferenceResources()
    report.referenceResources = {}
    for (const [key, resource] of Object.entries(referenceResources)) {
      assert.ok(
        within(appDataRoot, resource.managedPath) && !within(evidenceRoot, resource.managedPath),
      )
      report.referenceResources[key] = {
        ...resource,
        stat: statIdentity(await regular(resource.managedPath)),
      }
    }
  }
  if (imageProfile)
    assert.ok(provision.ready.capabilities.includes('illustrious-regional-img2img-v1'))
  if (outpaintProfile) {
    for (const capability of ['illustrious-outpaint', 'illustrious-regional-outpaint-v1'])
      assert.ok(provision.ready.capabilities.includes(capability))
    const verified = await new InferenceAuxiliaryResources(
      path.join(appDataRoot, 'inference-resources'),
    ).resolveVerifiedOutpaintInfill()
    const { managedPath, ...identity } = verified
    assert.deepEqual(identity, LAMA_OUTPAINT_IDENTITY_V1)
    assert.ok(within(appDataRoot, managedPath) && !within(evidenceRoot, managedPath))
    outpaintInfill = { ...verified, stat: statIdentity(await regular(managedPath)) }
    report.outpaintInfill = outpaintInfill
  }
  if (imageCfgRescaleProfile)
    for (const capability of [
      'illustrious-regional-img2img-cfg-rescale-v1',
      'illustrious-regional-cfg-rescale-v1',
    ])
      assert.ok(provision.ready.capabilities.includes(capability))
  if (imgSamplerProfile)
    for (const capability of [
      imgSamplerCapability,
      imgDpmProfile ? 'illustrious-regional-dpmpp-2m-v1' : 'illustrious-regional-invoke-init-v1',
    ])
      assert.ok(provision.ready.capabilities.includes(capability))
  if (initializationProfile)
    assert.ok(provision.ready.capabilities.includes('illustrious-regional-invoke-init-v1'))
  if (globalTiProfile) assert.ok(provision.ready.capabilities.includes('illustrious-embeddings'))
  if (globalLoraProfile)
    assert.ok(provision.ready.capabilities.includes('illustrious-regional-lora-v1'))
  if (vaeSelectionProfile || vPredictionProfile)
    assert.ok(provision.ready.capabilities.includes('illustrious-regional-vae-v1'))
  if (vPredictionProfile)
    assert.ok(provision.ready.capabilities.includes('illustrious-regional-v-prediction-v1'))
  if (vPredictionSamplingProfile)
    for (const capability of [
      'illustrious-regional-v-prediction-sampling-v1',
      ...(vPredictionEulerAProfile
        ? ['illustrious-regional-invoke-init-v1']
        : ['illustrious-regional-dpmpp-2m-v1', 'illustrious-regional-img2img-dpmpp-2m-v1']),
    ])
      assert.ok(provision.ready.capabilities.includes(capability))
  if (vPredictionImageProfile)
    for (const capability of [
      'illustrious-regional-v-prediction-image-v1',
      'illustrious-regional-img2img-vae-v1',
      'illustrious-img2img',
      'illustrious-vae-precision',
    ])
      assert.ok(provision.ready.capabilities.includes(capability))
  if (imgVaeProfile)
    assert.ok(provision.ready.capabilities.includes('illustrious-regional-img2img-vae-v1'))
  if (dpmpp2mProfile)
    assert.ok(provision.ready.capabilities.includes('illustrious-regional-dpmpp-2m-v1'))
  if (cfgRescaleProfile)
    assert.ok(provision.ready.capabilities.includes('illustrious-regional-cfg-rescale-v1'))
  if (mainDeathProfile || workerFaultProfile)
    assert.ok(provision.ready.capabilities.includes('linux-owned-inference-v1'))
  if (progressProfile)
    assert.ok(provision.ready.capabilities.includes('illustrious-regional-progress-v1'))
  assert.equal(
    await hashFile('worker-python/pyproject.toml'),
    provision.inputs.worker.pyprojectSha256,
  )
  assert.equal(await hashFile('worker-python/uv.lock'), provision.inputs.worker.lockSha256)
  const checkout = await treeManifest(path.resolve('worker-python/src/imagegen_worker'))
  installedTree = await treeManifest(provision.installed.workerRoot)
  assert.deepEqual(installedTree, checkout)
  assert.deepEqual(installedTree, provision.installed.workerFiles)
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(provision.inputs.worker.files).map(([key, value]) => [
        key.replace(/^imagegen_worker\//, ''),
        value,
      ]),
    ),
    checkout,
  )
  const modules = Object.fromEntries(
    Object.entries(installedTree).filter(([name]) => name.endsWith('.py')),
  )
  const sourceModuleCount = Object.keys(checkout).filter((name) => name.endsWith('.py')).length
  assert.equal(Object.keys(modules).length, sourceModuleCount)
  if (mainDeathProfile || workerFaultProfile) {
    assert.ok(modules['inference_lifetime.py'] && modules['owned_inference.py'])
  }
  if (globalLoraProfile) assert.ok(modules['illustrious_regional_lora.py'])
  assert.deepEqual(
    await treeManifest(path.join(provision.installed.prefix, 'resources/sdxl-config')),
    provision.inputs.config.files,
  )
  report.provision = {
    report: fixture.provisionReport,
    marker,
    pointer,
    installed: provision.installed,
    ready: provision.ready,
    installedModules: modules,
  }
  bundleFiles = [
    'dist/main/main.cjs',
    'dist/preload/preload.cjs',
    'dist/renderer/index.html',
    ...(await readdir('dist/renderer/assets'))
      .filter((name) => /\.(js|css)$/.test(name))
      .sort()
      .map((name) => `dist/renderer/assets/${name}`),
  ]
  report.sourceSha256 = await captureFiles(sourceFiles)
  if (progressProfile)
    report.progressSourceSha256 = await captureFiles([
      'src/main/projects/generation-progress-source.ts',
      'src/shared/projects/generation-progress.ts',
      'src/renderer/components/GenerationProgressIndicator.vue',
      'worker-python/src/imagegen_worker/inference_main.py',
      'worker-python/src/imagegen_worker/illustrious_regional_worker.py',
      'worker-python/src/imagegen_worker/illustrious_regional_output.py',
      'worker-python/src/imagegen_worker/illustrious_regional_denoising.py',
      'worker-python/src/imagegen_worker/inference.py',
    ])
  report.bundleSha256 = await captureFiles(bundleFiles)
  report.sourceRevision = (
    await exec('git', ['rev-parse', 'HEAD'], { timeout: timeout(10_000) })
  ).stdout.trim()
  report.invokeSource = {
    revision: vPredictionSamplingProfile
      ? '4875d96531ca6712b288f6e660fcbb34143408c1'
      : vPredictionProfile
        ? 'b0ac163b139c432aff4c51078c31c074bf292f72'
        : 'a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd',
    paths: [
      'invokeai/frontend/webv1/src/features/controlLayers/konva/CanvasEntity/CanvasEntityAdapterRegionalGuidance.ts',
      'invokeai/app/services/session_queue/session_queue_default.py',
      'invokeai/app/services/shared/database/queries/session_queue.py',
      'invokeai/app/api/routers/session_queue.py',
      'invokeai/app/services/session_processor/session_processor_default.py',
      'invokeai/frontend/webv1/src/features/controlLayers/components/StagingArea/StagingAreaToolbarAcceptButton.tsx',
      ...(imageProfile
        ? [
            'invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts',
            'invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts',
            'invokeai/frontend/webv2/src/features/generation/core/baseGenerationPolicies.ts',
            'invokeai/frontend/webv2/src/workbench/widgets/canvas/invoke/prepareCanvasInvocation.ts',
          ]
        : []),
      ...(multipleResultsProfile
        ? [
            'invokeai/frontend/webv2/src/features/queue/core/promptBatch.ts',
            'invokeai/frontend/webv2/src/features/queue/data/submissionApi.ts',
            'invokeai/frontend/webv2/src/features/generation/core/graph.ts',
            'invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts',
            'invokeai/app/services/session_queue/session_queue_common.py',
          ]
        : []),
      ...(globalTiProfile
        ? [
            'invokeai/app/invocations/text_encoder/compel.py',
            'invokeai/app/util/ti_utils.py',
            'invokeai/backend/model_patcher.py',
          ]
        : []),
      ...(globalLoraProfile
        ? [
            'invokeai/app/invocations/model.py',
            'invokeai/backend/patches/layer_patcher.py',
            'invokeai/backend/patches/layers/lora_layer.py',
            'invokeai/backend/patches/layers/lora_layer_base.py',
            'invokeai/backend/patches/lora_conversions/sdxl_lora_conversion_utils.py',
            'invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts',
          ]
        : []),
      ...(vaeSelectionProfile ? ['invokeai/app/invocations/vae/latents_to_image.py'] : []),
      ...(imgVaeProfile
        ? ['invokeai/app/invocations/model.py', 'invokeai/app/invocations/vae/image_to_latents.py']
        : []),
      ...(outpaintProfile
        ? [
            'invokeai/app/invocations/sd/create_gradient_mask.py',
            'invokeai/backend/stable_diffusion/extensions/inpaint.py',
          ]
        : []),
      ...(dynamicPositiveProfile
        ? ['invokeai/frontend/webv2/src/workbench/invocationSubmit.ts']
        : []),
      ...(imageCfgRescaleProfile
        ? [
            'invokeai/frontend/webv2/src/features/generation/core/graph.ts',
            'invokeai/backend/stable_diffusion/extensions/rescale_cfg.py',
            'invokeai/backend/stable_diffusion/diffusion_backend.py',
          ]
        : []),
      ...(progressProfile
        ? [
            'invokeai/app/invocations/sd/denoise_latents.py',
            'invokeai/backend/stable_diffusion/extensions/preview.py',
            'invokeai/app/services/shared/invocation_context.py',
            'invokeai/app/util/step_callback.py',
            'invokeai/app/services/events/events_base.py',
          ]
        : []),
    ],
  }
  report.launcherBounds = await assertUpgradeBounds({ maxRuntimeSeconds: fixture.deadlineSeconds })
  assert.ok(BigInt(report.launcherBounds.memoryMax) <= 2n * 1024n ** 3n)
  await assertRuntimeIdle(appDataRoot, provision.installed.basePrefix)
  if (vPredictionProfile)
    report.invokeSource = {
      revision: vPredictionSamplingProfile
        ? '4875d96531ca6712b288f6e660fcbb34143408c1'
        : 'b0ac163b139c432aff4c51078c31c074bf292f72',
      paths: [
        'invokeai/app/invocations/sd/denoise_latents.py',
        'invokeai/frontend/webv2/src/features/generation/core/graph.ts',
        'invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts',
        'invokeai/app/services/session_queue/session_queue_default.py',
        'invokeai/app/invocations/vae/latents_to_image.py',
        ...(vPredictionSamplingProfile
          ? [
              'invokeai/backend/stable_diffusion/schedulers/schedulers.py',
              'invokeai/backend/stable_diffusion/diffusion_backend.py',
              'invokeai/app/invocations/latent_noise.py',
            ]
          : []),
        ...(vPredictionImageProfile
          ? [
              'invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts',
              'invokeai/app/invocations/vae/image_to_latents.py',
              ...(outpaintProfile
                ? [
                    'invokeai/app/invocations/sd/create_gradient_mask.py',
                    'invokeai/backend/stable_diffusion/extensions/inpaint.py',
                  ]
                : []),
            ]
          : []),
      ],
    }

  if (referenceImagesProfile)
    report.invokeSource = {
      revision: '4875d96531ca6712b288f6e660fcbb34143408c1',
      paths: [
        'invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts',
        'invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts',
        'invokeai/app/invocations/sd/ip_adapter.py',
        'invokeai/app/invocations/sd/denoise_latents.py',
        'invokeai/backend/stable_diffusion/extensions/ip_adapter.py',
      ],
    }
  check(
    `Pinned noneditable installed worker, ${sourceModuleCount} Python module hashes, config tree, built bundle and finite launcher agree`,
  )
}

// Adapted from smart-patch-qualification-oracles.mjs: standard PNG filters, explicit 1024 bound.
// This independent decoder never calls the production PNG reader or Pillow.
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex')
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc(bytes) {
  let value = 0xffffffff
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}
function chunk(type, bytes) {
  const output = Buffer.alloc(bytes.length + 12)
  output.writeUInt32BE(bytes.length)
  output.write(type, 4, 'ascii')
  bytes.copy(output, 8)
  output.writeUInt32BE(crc(output.subarray(4, -4)), output.length - 4)
  return output
}
function fixturePng(width, height, rgba, profile) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++)
    rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  return Buffer.concat([
    pngSignature,
    chunk('IHDR', header),
    chunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(profile)])),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
function decodePng(input) {
  const bytes = Buffer.from(input)
  assert.ok(bytes.length >= 45 && bytes.length <= 32 * 1024 ** 2)
  assert.ok(bytes.subarray(0, 8).equals(pngSignature))
  let width,
    height,
    channels,
    iccSha256,
    ended = false,
    idatEnded = false
  const parts = []
  for (let offset = 8, count = 0; offset < bytes.length; count++) {
    assert.ok(count < 4096 && offset + 12 <= bytes.length)
    const length = bytes.readUInt32BE(offset),
      next = offset + length + 12
    assert.ok(next <= bytes.length)
    const type = bytes.toString('ascii', offset + 4, offset + 8),
      body = bytes.subarray(offset + 8, next - 4)
    assert.equal(crc(bytes.subarray(offset + 4, next - 4)), bytes.readUInt32BE(next - 4))
    assert.ok(count !== 0 || type === 'IHDR')
    if (type === 'IHDR') {
      assert.equal(count, 0)
      assert.equal(length, 13)
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      assert.ok(width > 0 && height > 0 && width <= 1024 && height <= 1024)
      assert.equal(body[8], 8)
      assert.ok(body[9] === 2 || body[9] === 6)
      assert.deepEqual([...body.subarray(10)], [0, 0, 0])
      channels = body[9] === 6 ? 4 : 3
    } else if (type === 'IDAT') {
      assert.ok(!idatEnded)
      parts.push(body)
    } else if (type === 'IEND') {
      assert.equal(length, 0)
      assert.equal(next, bytes.length)
      ended = true
      break
    } else {
      assert.ok(/^[a-z]/.test(type), `Unsupported critical PNG chunk ${type}`)
      if (parts.length) idatEnded = true
      if (type === 'iCCP') {
        assert.equal(iccSha256, undefined)
        const zero = body.indexOf(0)
        assert.ok(zero > 0 && zero <= 79)
        assert.equal(body[zero + 1], 0)
        iccSha256 = digest(inflateSync(body.subarray(zero + 2), { maxOutputLength: 1024 * 1024 }))
      }
    }
    offset = next
  }
  assert.ok(ended && parts.length)
  const stride = width * channels
  const encoded = inflateSync(Buffer.concat(parts), { maxOutputLength: (stride + 1) * height })
  assert.equal(encoded.length, (stride + 1) * height)
  const raw = Buffer.alloc(stride * height)
  const paeth = (a, b, c) => {
    const p = a + b - c,
      x = Math.abs(p - a),
      y = Math.abs(p - b),
      z = Math.abs(p - c)
    return x <= y && x <= z ? a : y <= z ? b : c
  }
  for (let y = 0; y < height; y++) {
    const filter = encoded[y * (stride + 1)]
    assert.ok(filter <= 4)
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? raw[y * stride + x - channels] : 0
      const up = y ? raw[(y - 1) * stride + x] : 0
      const diagonal = y && x >= channels ? raw[(y - 1) * stride + x - channels] : 0
      raw[y * stride + x] =
        (encoded[y * (stride + 1) + x + 1] +
          [0, left, up, Math.floor((left + up) / 2), paeth(left, up, diagonal)][filter]) &
        255
    }
  }
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    raw.copy(rgba, i * 4, i * channels, i * channels + 3)
    rgba[i * 4 + 3] = channels === 4 ? raw[i * 4 + 3] : 255
  }
  return { width, height, channels, rgba, iccSha256, rgbaSha256: digest(rgba) }
}

async function catalogSnapshot(db) {
  return {
    resources: await db.selectFrom('model_resource').selectAll().orderBy('id').execute(),
    versions: await db.selectFrom('model_resource_version').selectAll().orderBy('id').execute(),
  }
}
function statIdentity(stat) {
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  }
}
async function allSqlTables(db) {
  const tables = await db
    .selectFrom('sqlite_master')
    .select(['name', 'sql'])
    .where('type', '=', 'table')
    .orderBy('name')
    .execute()
  assert.ok(tables.length > 0 && tables.length <= 128)
  return await Promise.all(
    tables.map(async ({ name, sql }) => {
      assert.match(name, /^[a-zA-Z_][a-zA-Z0-9_]*$/)
      const rows = await db.selectFrom(name).selectAll().execute()
      assert.ok(rows.length <= 100_000)
      rows.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      return { name, sql, rows }
    }),
  )
}
async function preservedFiles(root) {
  const result = []
  if (!existsSync(root)) return result
  await directory(root)
  let total = 0
  const visit = async (parent) => {
    for (const name of (await readdir(parent)).sort()) {
      const file = path.join(parent, name),
        stat = await lstat(file)
      assert.ok(!stat.isSymbolicLink(), 'Preservation never follows symbolic links')
      if (stat.isDirectory()) {
        await directory(file)
        await visit(file)
      } else {
        assert.ok(stat.isFile() && stat.nlink === 1)
        assert.ok(result.length < 8192 && stat.size <= 128 * 1024 ** 2)
        total += stat.size
        assert.ok(total <= 512 * 1024 ** 2, 'Existing preservation payload exceeds finite bound')
        await regular(file)
        result.push({ path: file, byteSize: stat.size, sha256: await hashFile(file) })
      }
    }
  }
  await visit(root)
  return result
}
async function staticBatchControl(row, saved, layer) {
  const frozen = JSON.parse(row.frozen_payload_json)
  if (
    frozen.initializationProfile !== initialization ||
    frozen.context.sampling.sampler !== 'Euler a' ||
    frozen.workerJob.sampling.scheduler !== 'euler_a' ||
    frozen.workerJob.sampling.steps !== 30 ||
    frozen.workerJob.sampling.seed !== 123 ||
    frozen.context.prompts.positive !== globalPrompt ||
    frozen.context.prompts.negative !== ''
  )
    return null
  const file = path.join(appDataRoot, 'generation-inputs', row.id, 'regional.json')
  if (!existsSync(file)) return null
  const metadata = await jsonFile(file, 1024 ** 2)
  const expectedAlpha = [0, 1].map((index) =>
    digest(
      Buffer.from(
        Array.from({ length: 1024 ** 2 }, (_, i) => (i % 1024 < 512 === (index === 0) ? 255 : 0)),
      ),
    ),
  )
  if (
    metadata.recipe.family !== 'illustrious' ||
    [metadata.recipe.globalPrompts.positive, metadata.recipe.globalPrompts.negative].some(
      ({ embeddingRefs }) => embeddingRefs.length !== 0,
    ) ||
    ['positive', 'negative'].some(
      (sign) => (metadata.recipe.globalEmbeddings?.[sign]?.length ?? 0) !== 0,
    ) ||
    metadata.recipe.regions.length !== 2 ||
    metadata.recipe.regions.some(
      (region, index) =>
        region.positive?.text !== localPrompts[index] ||
        region.negative.prompt.text !== '' ||
        (region.positive?.embeddingRefs.length ?? 0) !== 0 ||
        region.negative.prompt.embeddingRefs.length !== 0 ||
        ['positive', 'negative'].some((sign) => (region.embeddings?.[sign]?.length ?? 0) !== 0) ||
        (region.referenceImages?.length ?? 0) !== 0 ||
        region.coverage.alpha.$alpha8.sha256 !== expectedAlpha[index],
    )
  )
    return null
  const captured = await captureFrozen(row, {
    document: saved.project,
    regionAlphas: expectedAlpha,
  })
  const bytes = saved.members.get(layer.asset.path)
  assert.ok(bytes)
  const decoded = decodePng(bytes)
  assert.equal(digest(bytes), layer.asset.sha256)
  return {
    queueItemId: row.id,
    pngSha256: digest(bytes),
    rgbaSha256: decoded.rgbaSha256,
    byteSize: bytes.length,
    frozenPayloadSha256: captured.frozenPayloadSha256,
    regionAlphas: expectedAlpha,
    predeclaredBeforeGenerate: true,
  }
}
async function captureImagePreservation() {
  const sql = await sqlSnapshot()
  // The reused pool currently has176 protected receipts. Bound this new profile's inventory
  // explicitly; never delete prior rows or loosen an inference/queue capacity guard to fit it.
  assert.ok(sql.queue.length <= 256 && sql.receipts.length <= (referenceImagesProfile ? 256 : 128) && sql.cursors.length <= 128)
  assert.ok(
    sql.queue.every(({ status }) => ['completed', 'failed', 'canceled'].includes(status)),
    'Reuse only a physically idle terminal pool',
  )
  const indexed = await database.db
    .selectFrom('project_index')
    .selectAll()
    .orderBy('canonical_path')
    .execute()
  assert.ok(indexed.length <= 1024)
  for (const record of indexed) {
    assert.equal(record.file_health, 'ready')
    assert.ok(within(path.join(appDataRoot, 'workspaces'), record.canonical_path))
    await regular(record.canonical_path)
    baselinePackages.push({
      path: record.canonical_path,
      sha256: await hashFile(record.canonical_path),
    })
    await readZip(record.canonical_path)
  }
  preservationBaseline = {
    sql,
    tables: await allSqlTables(database.db),
    packages: structuredClone(baselinePackages),
    files: [
      ...(await preservedFiles(path.join(appDataRoot, 'autosave'))),
      ...(await preservedFiles(path.join(appDataRoot, 'recovery'))),
      ...(await preservedFiles(path.join(appDataRoot, 'generation-inputs'))),
    ],
  }
  report.preservationBaseline = preservationBaseline
  report.boundary.calls =
    'Three original installed regional IMG starts: healthy30-requested/strength0.5 control, live UI Cancel after genuine selected-step progress, and frozen Retry after saved source/text/strength edits. Two completed PNGs have exact RGB; no additional generation.'
  report.boundary.progress = `${imgDpmProfile ? 'Independently pinned native Karras' : 'Independent leading-grid'}/training-cutoff expectation is16 selected steps from30 requested at strength0.5; original scalar JSONL -> Main -> existing Project/Queue counter. No fabricated progress or copied native loop.`
  report.boundary.preconditions = `Reuse terminal pool of${sql.queue.length} jobs/${sql.receipts.length} receipts and${indexed.length} real packages, pinning all previous SQL/file bytes. Two new empty Project fixtures import the same real PNG through UI/original Main/installed normalizer; one separate partial-alpha control is portable setup.`
  report.boundary.exclusions =
    'No visual-quality PASS, generic SDXL, Anima, broader IMG samplers/VAE/precision/partial-alpha, Install/Repair or capacity claim. Existing source/noise numerical owner is reused; strength0 and semantic native mutations remain historical evidence.'
  if (imageCfgRescaleProfile) {
    report.boundary.calls +=
      ' Real Advanced Options selects CFG Rescale0.7 for the independent healthy IMG control and original Generate. After observed Cancel, saved current authoring changes rescale to0.2 along with source/text/strength. Frozen Retry and ordinary IMG accepted provenance retain0.7; all three executing workers must advertise the separate IMG-rescale capability.'
    report.boundary.cfgRescale = {
      original: generationCfgRescale,
      edited: 0.2,
      newCapability: outpaintProfile
        ? 'illustrious-regional-outpaint-v1'
        : 'illustrious-regional-img2img-cfg-rescale-v1',
      nativeFormulaCopied: false,
      numericalCausalityClaimed: false,
    }
  }
  if (imgSamplerProfile) {
    report.boundary.calls += ` The Sampler UI explicitly changes Euler to ${generationSampler}/${generationScheduleLabel} for both requests. After Cancel, saved current authoring returns to ${imgDpmProfile ? 'Euler with cleared scheduler' : 'Euler/Normal'}; frozen Retry and accepted ordinary IMG provenance retain the selected pair.`
    report.boundary.exclusions += ` This profile additionally qualifies only ${generationSampler}/${generationScheduleLabel} for opaque IMG; other sampling/VAE lanes remain excluded.`
  }
  if (imgVaeProfile) {
    report.boundary.preconditions +=
      ' Reuse the two existing immutable complete native VAE files without copying, extraction or download: trained extracted A and artificial decoder-bias control B. Synthetic catalog IDs declare applicability; Default B never replaces saved exact A.'
    report.boundary.calls +=
      ' Actual VAE picker and precision controls reset/reselect exact A and select Auto then FP32 for both the independent healthy IMG control and original Generate. After observed Cancel, saved current authoring resets to Embedded/FP16 with the existing source/text/strength/rescale edits. All three original IMG wires and accepted ordinary IMG provenance retain A/FP32.'
    report.boundary.exclusions =
      ' No visual-quality PASS, generic SDXL, Anima, broader IMG samplers/VAE/precision/partial-alpha, Install/Repair or capacity claim. This profile qualifies only the exact selected A/FP32 with Euler/Normal and CFG Rescale0.7; no installed VAE pixel-causality, full loader-key census or precision-quality claim. Existing prepared source/scale/decode owners remain authoritative.'
    report.boundary.retention +=
      ' Both original VAE files, their historical source dependencies and exact catalog entries remain protected beyond this RUN for frozen Retry; preserve descriptors, stat/hash pins and accepted A/FP32 provenance.'
    report.boundary.vae = {
      original: 'A/FP32',
      edited: 'Embedded/FP16',
      default: 'B',
      newCapability: 'illustrious-regional-img2img-vae-v1',
      preparedVaeOwnerReused: true,
      numericalCausalityClaimed: false,
    }
  }
  if (outpaintProfile) {
    report.boundary.calls =
      'Three original installed regional outpaint starts: independent healthy30-requested/strength0.5 control, actual UI Cancel after selected-step progress, and exact frozen Retry after saved source opacity/text/steps/seed/strength/rescale/region edits. Exactly three regional wires and two completed RGBA contributions; no extra native generation.'
    report.boundary.preconditions = `Reuse terminal pool of${sql.queue.length} jobs/${sql.receipts.length} receipts and${indexed.length} packages without reset. Two real Project fixtures import the same mixed-alpha PNG through original UI/Main/installed normalization; fixed local LaMa is independently verified through the actual auxiliary resolver before the baseline.`
    report.boundary.exclusions =
      'Finite official Illustriousepsilon, EmbeddedFP16, Euler/Normal, CFG5/rescale0.7, strength0.5,512-square masked regional consumption. No visual/human-quality, general soft-mask semantics, other installed sampling/VAE combinations, Anima, Install/Repair or capacity qualification. Lower native cases retain their distinct scope.'
    report.boundary.outpaint = {
      operation: regionalOperation,
      requestType: generationRequestType,
      newCapability: 'illustrious-regional-outpaint-v1',
      keepMaskPolarity: 'keep',
      outputMode: 'contribution',
      existingPolicy: INVOKE_ALPHA_OUTPAINT_POLICY_V1,
      exactInfill: outpaintInfill,
      independentMainContributionVerification: true,
      rawControlRetryRgbaExact: true,
      browserAlphaExact: true,
      browserOpaqueCompositeRgbRoundingBound: 1,
      actualCanvasSourcePlusContributionReference: true,
      noTxtInitialization: true,
    }
    report.boundary.retention +=
      ' The managed fixed LaMa file, its original source and frozen target/input/project bytes remain protected cross-run dependencies.'
  }
  check('Existing mixed-operation terminal SQL/package/candidate/input pool pinned without reset')
}
async function captureProgressPreservation() {
  const sql = await sqlSnapshot(),
    completed = sql.queue.filter(({ status }) => status === 'completed')
  assert.ok(sql.queue.length >= (workerFaultProfile ? 12 : 8) && sql.queue.length <= 256)
  if (workerFaultProfile || initializationProfile) {
    assert.ok(completed.length >= (initializationProfile ? 4 : 5) && completed.length <= 128)
    if (multipleResultsProfile) {
      assert.equal(sql.receipts.length, completed.length)
      assert.equal(
        sql.cursors.length,
        new Set(completed.map(({ local_project_key }) => local_project_key)).size,
      )
      for (const cursor of sql.cursors) {
        const latest = sql.receipts
          .filter(({ local_project_key }) => local_project_key === cursor.local_project_key)
          .at(-1)
        assert.ok(latest)
        assert.equal(cursor.completion_order, latest.completion_order)
        assert.equal(cursor.candidate_id, latest.candidate_id)
        assert.equal(cursor.actual_seed, latest.actual_seed)
      }
    } else {
      assert.deepEqual(
        [sql.receipts.length, sql.cursors.length],
        [completed.length, completed.length],
      )
    }
    assert.ok(sql.queue.every(({ status }) => ['completed', 'canceled', 'failed'].includes(status)))
  } else {
    assert.deepEqual([sql.receipts.length, sql.cursors.length], [4, 4])
    assert.equal(completed.length, 4)
    assert.equal(
      sql.queue.filter(({ status }) => status === 'canceled').length,
      sql.queue.length - 4,
    )
  }
  assert.ok(sql.queue.every(({ operation }) => operation === 'illustrious-regional-txt2img'))
  const indexed = await database.db
    .selectFrom('project_index')
    .selectAll()
    .orderBy('canonical_path')
    .execute()
  assert.ok(indexed.length >= (workerFaultProfile ? 27 : 18) && indexed.length <= 1024)
  const accepted = []
  let initializationControl = null
  for (const record of indexed) {
    assert.equal(record.file_health, 'ready')
    assert.ok(within(path.join(appDataRoot, 'workspaces'), record.canonical_path))
    await regular(record.canonical_path)
    baselinePackages.push({
      path: record.canonical_path,
      sha256: await hashFile(record.canonical_path),
    })
    const saved = await readZip(record.canonical_path)
    for (const layer of saved.project.layers) {
      const id = layer.generationProvenance?.executionResultContext?.queueItemId
      if (layer.kind !== 'raster' || !completed.some((row) => row.id === id)) continue
      const receipt = sql.receipts.find(({ queue_item_id }) => queue_item_id === id)
      assert.ok(receipt)
      assert.equal(layer.asset.sha256, receipt.image_sha256)
      assert.equal(digest(saved.members.get(layer.asset.path)), receipt.image_sha256)
      accepted.push({ queueItemId: id, path: record.canonical_path, layerId: layer.id })
      if (staticBatchProfile) {
        const candidate = await staticBatchControl(
          completed.find((row) => row.id === id),
          saved,
          layer,
        )
        if (candidate) {
          if (initializationControl)
            assert.equal(candidate.pngSha256, initializationControl.pngSha256)
          initializationControl = { ...candidate, sourcePackage: record.canonical_path }
        }
      }
    }
  }
  if (multipleResultsProfile) {
    assert.ok(accepted.length > 0 && accepted.length <= completed.length)
    if (staticBatchProfile)
      assert.ok(initializationControl, 'A verified prior same-policy seed123 output is required')
  } else {
    assert.equal(
      accepted.length,
      workerFaultProfile || initializationProfile ? completed.length - 1 : 3,
    )
  }
  assert.equal(new Set(accepted.map(({ queueItemId }) => queueItemId)).size, accepted.length)
  const recoveryFiles = await preservedFiles(path.join(appDataRoot, 'recovery')),
    inputFiles = await preservedFiles(path.join(appDataRoot, 'generation-inputs')),
    unaccepted = completed.filter(
      (row) => !accepted.some(({ queueItemId }) => queueItemId === row.id),
    )
  const tombstones = multipleResultsProfile
    ? await database.db.selectFrom('generation_staging_discarded_session').selectAll().execute()
    : []
  if (multipleResultsProfile) assert.ok(unaccepted.length >= 1 && unaccepted.length <= 128)
  else assert.equal(unaccepted.length, 1)
  let controlPng
  for (const row of completed) {
    const receipt = sql.receipts.find(({ queue_item_id }) => queue_item_id === row.id)
    assert.ok(receipt && receipt.status === 'completed')
    const outputs = recoveryFiles.filter(({ path: file }) =>
      file.endsWith(`/assets/${receipt.candidate_id}.png`),
    )
    if (unaccepted.some(({ id }) => id === row.id)) {
      if (
        multipleResultsProfile &&
        tombstones.some(
          (entry) =>
            entry.local_project_key === row.local_project_key &&
            entry.staging_session_id === row.staging_session_id,
        )
      ) {
        assert.equal(outputs.length, 0, 'Discarded historical sessions must have no candidate')
        continue
      }
      assert.equal(outputs.length, 1)
      const decoded = decodePng(await readFile(outputs[0].path))
      assert.equal(decoded.iccSha256, IGS_SRGB_ICC_SHA256)
      controlPng = { ...outputs[0], rgbaSha256: decoded.rgbaSha256, queueItemId: row.id }
    }
    for (const output of outputs) {
      assert.equal(output.sha256, receipt.image_sha256)
      assert.equal(output.byteSize, receipt.image_byte_size)
    }
  }
  preservationBaseline = {
    sql,
    tables: await allSqlTables(database.db),
    packages: structuredClone(baselinePackages),
    files: [...recoveryFiles, ...inputFiles],
    accepted,
    unacceptedJobIds: unaccepted.map(({ id }) => id),
    controlPng,
    ...(multipleResultsProfile ? { initializationControl, tombstones } : {}),
  }
  report.preservationBaseline = preservationBaseline
  report.boundary.calls =
    'One original 30-step seed123 Generate canceled after genuine completed-step/UI observations >=5/30, followed by one explicit frozen Queue Retry and one healthy PNG; one Electron lifetime, exactly two regional wires.'
  report.boundary.progress =
    'Original numeric JSONL from the pinned unchanged native callback path -> original Main transient IPC -> existing Project/Queue counter/bar. No Python callback interception, tensor requests, previews, fabricated events or denoising loop; final30/30 precedes completion and clears on settlement.'
  report.boundary.preconditions = `Reuse the terminal${sql.queue.length}/receipt${sql.receipts.length}/cursor${sql.cursors.length}/${indexed.length}-package pool, including ${accepted.length} accepted jobs and one unaccepted candidate. Prior excluded attempts remain retained. All prior SQL/package/candidate/input bytes are dynamically pinned; three new Project fixtures are authored without resetting prior state.`
  if (initializationProfile) {
    report.boundary.calls =
      'One original public Euler-a/30-step/seed123 Generate canceled after genuine completed-step/UI observations >=5/30, followed by explicit frozen Queue Retry and one healthy PNG. One Electron lifetime and exactly two regional wires; current authoring changes to Euler before Retry.'
    report.boundary.initialization = {
      profile: initialization,
      sampler: generationSampler,
      scheduler: generationScheduler,
      unchangedLegacyEuler: true,
      independentInitializerObservation: false,
    }
    report.boundary.exclusions +=
      ' The prior Euler control remains immutable baseline data, not a byte-equality oracle for this different Euler-a initialization. No raw-noise/initial-sample observation, independent healthy Euler-a replay, default change or new visual qualification is claimed.'
  }
  if (staticBatchProfile) {
    report.boundary.calls =
      'One actual UI Generate with Images per click2 publishes one ordered batch/session and exactly two original Euler-a30 requests, seeds123/124. Both complete; no Cancel, Retry, repeat or additional baseline generation.'
    report.boundary.preconditions = `Reuse terminal${sql.queue.length}/receipt${sql.receipts.length}/cursor${sql.cursors.length}/${indexed.length}-package pool. Every prior SQL row, package, accepted history and live or discarded unaccepted result is pinned; no reset. Same-policy seed123 control is verified before Generate.`
    report.boundary.progress =
      'Both original requests emit scalar1..30 frames before their terminal output. No tensor or initializer interception, fabricated events, numeric quality or GPU-throughput claim.'
    report.boundary.exclusions =
      'No visual quality PASS, full Invoke parity, generic SDXL, Anima, LoRA, regional reference/TI, installer/Repair, raw initializer observation or capacity claim. Existing Add closes the shared session: both PNGs are retained first, one selected output becomes a Raster and the other is explicitly discarded. Prior external candidates are unchanged.'
  }
  if (globalTiProfile) {
    report.boundary.calls =
      'One real UI Generate admits Euler-a30 seeds123/124. First completes; second is canceled only after original native steps >=5 and >=6, then original frozen Queue Retry124 completes after saved global prompt/ref, sampler/seed/region edits. Exactly three regional wires and two healthy PNGs.'
    report.boundary.preconditions =
      'Reuse all pinned historical SQL/packages/candidates and the installed runtime/checkpoint. Before the preservation baseline, register four deterministic real paired F32 TI files at stable catalog-owned SHARED paths and resolve them using real ModelService. No downloads, model/runtime copies or catalog fallback.'
    report.boundary.exclusions =
      'No new native vector/context observer, numerical TI-causality claim, quality PASS, generic SDXL, Anima, LoRA, references, installer/Repair or capacity qualification. Existing zero-TI controls remain preserved and are not output-equality oracles for this distinct resource input. Accepted base provenance keeps only global A/B refs; regional C/D stays excluded.'
  }
  if (globalLoraProfile) {
    report.boundary.preconditions +=
      ' Register four tiny deterministic real Kohya F32 LoRAs at stable SHARED global-lora-fixtures-v1 paths through the actual ModelRepository/ModelService, with no network, secrets, copies or Default fallback. Existing TI fixtures remain shared.'
    report.boundary.calls +=
      ' Original configured LoRA order/weights/enabled states and exact versions survive saved current LoRA reorder/weight/disable/remove edits; all three logical native commands retain the enabled A/B/Z stack including signed and zero weights.'
    report.boundary.exclusions =
      'No installed LoRA numerical/weight/context/prediction causality claim: the two PNGs have different seeds. Numerical qualification requires separate actual-Invoke Python weight/context/prediction oracles. No PEFT wrappers, sidecars or borrowed-weight restoration promise; fresh job-owned native components receive Invoke FP32 direct prefusion before regional borrowing. No quality PASS, full Invoke parity, generic SDXL, Anima, references, installer/Repair or capacity claim. Accepted base provenance retains the original full configured LoRA stack including disabled missing data and only global A/B TI refs; regional C/D stays excluded.'
    report.boundary.retention +=
      ' All four managed LoRA files and existing TI files are protected dependencies for future frozen Retry, including the alternate Default version.'
  }
  if (globalVaeProfile) {
    report.boundary.preconditions +=
      ' Register the two existing immutable complete native VAE files from the historical NoobAI epsilon component fixture, without copying, extraction or download. A is the trained extracted component; B is an artificial decoder-bias control. Synthetic catalog IDs declare applicability, not CivitAI download/training attestation; Default B never replaces saved A.'
    report.boundary.calls +=
      ' Actual VAE picker and precision controls select exact A/FP32 before Generate. After observed Cancel the UI resets to Embedded and selects FP16, then saves with the other authoring edits. Both outputs retain original frozen A/FP32; the one accepted Raster records that original base provenance.'
    report.boundary.exclusions +=
      ' No installed VAE pixel-causality, full loader-key census, precision-quality or maximum-memory claim. Other VAE precision modes require separate lower/native evidence. Original selected VAE preparation occurs before borrowed regional execution.'
    report.boundary.retention +=
      ' Both original VAE files, their historical source dependencies and exact catalog entries remain protected beyond this RUN; preserve complete descriptors, stat/hash pins and accepted A/FP32 provenance.'
  }
  if (dynamicPositiveProfile) {
    report.boundary.calls =
      'One real UI Generate with Images per click1, Max prompts2 and Per prompt seeds admits only the first two of three global-positive alternatives: pair0/iteration0/A123 and pair1/iteration0/C124. A123 completes; C124 is canceled after genuine native steps5/6, then frozen Retry C124 completes after saved template/options/TI/mask/LoRA/VAE edits. Exactly three original regional wires and two healthy PNGs; the third alternative is truncated.'
    report.boundary.preconditions +=
      ' Reuse the same four existing TI files with distinct authored global literals <variant-a>/<variant-c>, the same four LoRAs, both original VAE files and unchanged installed worker/runtime. Global negative and regional texts/resources remain static. The new regional route verifies the selected-plan resource union; discarded alternatives stay authored without being resolved or consumed, while ordinary preparation is unchanged.'
    report.boundary.exclusions +=
      ' No dynamic regional/negative prompting, wildcard packs, additional worker capability, runtime refresh, resource/model copy, extra generation or numerical/visual causality claim. Accepted provenance contains only concrete A123 and its active global A/B refs, never the source template, maxPrompts, inactive global C or regional owners.'
  }
  if (dpmpp2mProfile) {
    report.boundary.calls +=
      ' Both original requests and frozen Retry use DPM++2M/Karras30 despite saved Euler/Normal2. Actual sampler/scheduler UI controls select the original policy. Normal native mechanics are qualified separately by the focused CPU/CUDA suite.'
    report.boundary.preconditions = report.boundary.preconditions.replace(
      'unchanged installed worker/runtime',
      'the same installed runtime with a verified in-place DPM worker payload refresh',
    )
    report.boundary.exclusions = report.boundary.exclusions
      .replace('additional worker capability, runtime refresh, ', '')
      .replace('different Euler-a initialization', 'different DPM++2M/Karras initialization')
      .replace('independent healthy Euler-a replay', 'independent healthy DPM++2M replay')
    report.boundary.dpmpp2m = {
      sampler: generationSampler,
      scheduler: generationScheduleLabel,
      invokeScheduler: generationScheduler,
      initialization,
      newCapability: 'illustrious-regional-dpmpp-2m-v1',
      numericCausalityClaimed: false,
    }
  }
  if (cfgRescaleProfile) {
    report.boundary.calls +=
      ' Actual Advanced Options sets CFG Rescale0.7 before Generate and0.2 after Cancel. All three original wires and accepted base provenance must retain0.7 after the saved edit.'
    report.boundary.preconditions = report.boundary.preconditions.replace(
      'in-place DPM worker payload refresh',
      'in-place regional CFG Rescale worker payload refresh',
    )
    report.boundary.cfgRescale = {
      original: generationCfgRescale,
      edited: 0.2,
      newCapability: 'illustrious-regional-cfg-rescale-v1',
      nativeFormulaCopied: false,
      numericalCausalityClaimed: false,
    }
  }
  if (workerFaultProfile) {
    report.boundary.calls =
      'One original 30-step seed123 Generate faulted after completed-step/UI observations >=5/30 by a verified worker-only pidfd SIGKILL while Main stays alive, followed by explicit frozen Queue Retry and one healthy PNG. One Electron lifetime and exactly two regional wires.'
    report.boundary.exclusions +=
      ' Worker-only SIGKILL qualifies this finite failure/retry path, not arbitrary GPU-context poisoning or automatic retry. Production error/completion/queue/result owners remain unchanged.'
  }
  check('Existing terminal pool, all SQL tables, packages and candidate/input files pinned')
}
function ownProgressSql(whole) {
  assert.ok(progressProject?.id && preservationBaseline)
  const ownKeys = imageProfile
    ? [progressProject.id, report.img2img.controlProjectKey]
    : referenceImagesProfile
      ? [progressProject.id, report.referenceImages.controlProjectKey]
      : vPredictionProfile
        ? [progressProject.id, report.vPrediction.controlProjectKey]
        : [progressProject.id]
  for (const [name, rows] of Object.entries(whole))
    assert.deepEqual(
      rows.filter(({ local_project_key }) => !ownKeys.includes(local_project_key)),
      preservationBaseline.sql[name],
      `Prior operational ${name} rows must remain exact`,
    )
  return Object.fromEntries(
    Object.entries(whole).map(([name, rows]) => [
      name,
      rows.filter(({ local_project_key }) => local_project_key === progressProject.id),
    ]),
  )
}
async function progressSql() {
  return ownProgressSql(await sqlSnapshot())
}
async function verifyProgressPreservation(db) {
  const tables = await allSqlTables(db)
  assert.deepEqual(
    tables.map(({ name, sql }) => ({ name, sql })),
    preservationBaseline.tables.map(({ name, sql }) => ({ name, sql })),
  )
  for (const before of preservationBaseline.tables) {
    const after = tables.find(({ name }) => name === before.name)
    const normalized = (row) => {
      const value = { ...row }
      // Home's rebuildable index refreshes indexed_at on a real rescan; retain raw observations.
      if (before.name === 'project_index') delete value.indexed_at
      return JSON.stringify(value)
    }
    for (const row of before.rows) {
      if (before.name === 'sqlite_sequence') {
        const current = after.rows.find(({ name }) => name === row.name)
        assert.ok(current)
        assert.equal(
          current.seq,
          row.seq +
            (row.name === 'generation_candidate_receipt'
              ? referenceImagesProfile
                ? 3
                : multipleResultsProfile || imageProfile || vPredictionProfile
                  ? 2
                  : 1
              : 0),
        )
      } else {
        assert.ok(
          after.rows.some((value) => normalized(value) === normalized(row)),
          `Historical SQL row changed: ${before.name}`,
        )
      }
    }
  }
  for (const file of [...preservationBaseline.packages, ...preservationBaseline.files]) {
    const stat = await regular(file.path)
    if (file.byteSize !== undefined) assert.equal(stat.size, file.byteSize)
    assert.equal(await hashFile(file.path), file.sha256, `Historical bytes changed: ${file.path}`)
  }
  report.preservationAfter = { tables, sql: await sqlSnapshot(db) }
  ownProgressSql(report.preservationAfter.sql)
  check('All prior SQL rows, packages, accepted history and unaccepted candidate bytes preserved')
}
// InvokeAI's Compel/TI owner is shared by global and regional streams. These fixtures exercise
// Studio's saved exact identities at that existing owner, without a name/default fallback.
function pairedGlobalTiBytes(salt) {
  const widths = [768, 1280],
    payload = Buffer.alloc(2 * (768 + 1280) * 4)
  let offset = 0
  for (const width of widths)
    for (let row = 0; row < 2; row++)
      for (let column = 0; column < width; column++, offset += 4)
        payload.writeFloatLE(
          (((row * 37 + column * 17 + salt * 13) % 257) - 128) / 256 + row / 32,
          offset,
        )
  const json = Buffer.from(
    JSON.stringify({
      clip_l: { dtype: 'F32', shape: [2, 768], data_offsets: [0, 6144] },
      clip_g: { dtype: 'F32', shape: [2, 1280], data_offsets: [6144, 16384] },
    }),
  )
  const header = Buffer.alloc(Math.ceil(json.length / 8) * 8, 32)
  json.copy(header)
  const length = Buffer.alloc(8)
  length.writeBigUInt64LE(BigInt(header.length))
  return Buffer.concat([length, header, payload])
}
function globalPositiveInput(seed = 123) {
  if (!dynamicPositiveProfile) return { key: 'A', text: globalPrompt, token: '<shared>' }
  assert.ok(seed === 123 || seed === 124)
  const key = seed === 123 ? 'A' : 'C',
    token = key === 'A' ? '<variant-a>' : '<variant-c>'
  return { key, text: `${baseGlobalPrompt} ${token}`, token }
}
function authoredGlobalPositiveRefs() {
  return dynamicPositiveProfile
    ? [globalTiRef('A', '<variant-a>'), globalTiRef('C', '<variant-c>')]
    : [globalTiRef('A')]
}
function globalTiRef(key, token = '<shared>') {
  assert.ok(globalTiProfile && globalTi?.[key])
  return { resource: structuredClone(globalTi[key].reference), token }
}
function globalTiDescriptor(key, token = '<shared>') {
  const { byteSize, managedPath, reference } = globalTi[key]
  return { byteSize, managedPath, reference: structuredClone(reference), token }
}
function globalTiPair(positive, negative, positiveToken = '<shared>') {
  return {
    positive: positive ? [globalTiDescriptor(positive, positiveToken)] : [],
    negative: negative ? [globalTiDescriptor(negative)] : [],
  }
}
function globalTiWirePair(seed = 123) {
  const positive = globalPositiveInput(seed)
  const project = (key, token = '<shared>') => {
    const { byteSize, managedPath, reference } = globalTi[key]
    return { byteSize, path: managedPath, sha256: reference.fileSha256, token }
  }
  return { positive: [project(positive.key, positive.token)], negative: [project('B')] }
}
function assertGlobalEmbeddingRecipe(recipe, seed = recipe.item.seed) {
  const positive = globalPositiveInput(seed)
  if (globalVaeProfile) {
    assert.equal(Object.hasOwn(recipe, 'vae'), false)
    assert.equal(Object.hasOwn(recipe, 'vaePrecision'), false)
  }
  if (globalLoraProfile) {
    assert.equal(Object.hasOwn(recipe, 'loras'), false)
    assert.equal(Object.hasOwn(recipe, 'loraStack'), false)
  }
  assert.deepEqual(recipe.globalPrompts, {
    positive: {
      text: positive.text,
      embeddingRefs: [globalTiRef(positive.key, positive.token)],
    },
    negative: { text: '<shared>', embeddingRefs: [globalTiRef('B')] },
  })
  assert.deepEqual(recipe.globalEmbeddings, globalTiPair(positive.key, 'B', positive.token))
  const [first, second] = recipe.regions
  assert.deepEqual(first.positive, { text: localPrompts[0], embeddingRefs: [globalTiRef('C')] })
  assert.deepEqual(first.negative, {
    source: 'current-canvas',
    prompt: recipe.globalPrompts.negative,
  })
  assert.deepEqual(first.embeddings, globalTiPair('C', 'B'))
  assert.deepEqual(second.positive, { text: localPrompts[1], embeddingRefs: [] })
  assert.deepEqual(second.negative, {
    source: 'regional',
    prompt: { text: '<shared>', embeddingRefs: [globalTiRef('D')] },
  })
  assert.deepEqual(second.embeddings, globalTiPair(null, 'D'))
  if (dynamicPositiveProfile) {
    assert.notEqual(first.positive.text, recipe.globalPrompts.positive.text)
    assert.equal(
      Object.values(recipe.item.prompts).some((text) => /[{}]/.test(text)),
      false,
    )
  } else assert.equal(first.positive.text, recipe.globalPrompts.positive.text)
  assert.notEqual(
    first.positive.embeddingRefs[0].resource.localVersionId,
    globalTi.A.reference.localVersionId,
  )
  assert.equal(
    [recipe.globalEmbeddings, first.embeddings, second.embeddings].reduce(
      (count, pair) => count + pair.positive.length + pair.negative.length,
      0,
    ),
    5,
  )
}
async function verifyGlobalEmbeddingFiles() {
  assert.ok(globalTiProfile && globalTi)
  for (const resource of Object.values(globalTi)) {
    assert.deepEqual(statIdentity(await regular(resource.managedPath)), resource.stat)
    assert.equal(await realpath(resource.managedPath), resource.managedPath)
    assert.equal((await regular(resource.managedPath)).size, resource.byteSize)
    assert.equal(await hashFile(resource.managedPath), resource.reference.fileSha256)
    assert.equal(resource.reference.fileSha256, digest(pairedGlobalTiBytes(resource.salt)))
    assert.ok(
      within(fixtureRoot, resource.managedPath) && !within(evidenceRoot, resource.managedPath),
    )
  }
}
async function prepareGlobalEmbeddingCatalog(repository) {
  const before = await allSqlTables(database.db)
  const prior = await repository.listInstalled()
  const root = path.join(fixtureRoot, 'global-embedding-fixtures-v1')
  await mkdir(root, { recursive: true, mode: 0o700 })
  await directory(root)
  const definitions = [
    { key: 'A', salt: 1, modelId: 900000101, versionId: 900001001, fileId: 900002001 },
    { key: 'B', salt: 7, modelId: 900000102, versionId: 900001002, fileId: 900002002 },
    { key: 'C', salt: 19, modelId: 900000101, versionId: 900001003, fileId: 900002003 },
    { key: 'D', salt: 37, modelId: 900000103, versionId: 900001004, fileId: 900002004 },
  ]
  // A reserved synthetic identity may be reused only as the already complete exact fixture.
  // Refuse namespace collisions before publishing; never repair or overwrite historical rows.
  for (const resource of prior.filter(
    ({ source }) =>
      source.kind === 'civitai' && definitions.some(({ modelId }) => modelId === source.modelId),
  )) {
    const expected = definitions.filter(({ modelId }) => modelId === resource.source.modelId)
    assert.equal(resource.type, 'embedding')
    assert.equal(resource.versions.length, expected.length)
    for (const definition of expected) {
      const version = resource.versions.find(
        ({ civitaiVersionId }) => civitaiVersionId === definition.versionId,
      )
      assert.ok(version, 'Reserved fixture identity is incomplete; preserve the existing catalog')
      const sha256 = digest(pairedGlobalTiBytes(definition.salt))
      assert.equal(version.civitaiFileId, definition.fileId)
      assert.equal(version.file.sha256, sha256)
      assert.equal(
        version.file.managedPath,
        path.join(root, `${definition.key.toLowerCase()}-${sha256}.safetensors`),
      )
      assert.equal(version.file.status, 'ready')
    }
    if (expected.some(({ key }) => key === 'C'))
      assert.equal(
        resource.defaultVersionId,
        resource.versions.find(({ civitaiVersionId }) => civitaiVersionId === 900001003).id,
      )
  }
  globalTi = {}
  for (const definition of definitions) {
    const { key, salt, modelId, versionId, fileId } = definition
    const bytes = pairedGlobalTiBytes(salt),
      sha256 = digest(bytes)
    const managedPath = path.join(root, `${key.toLowerCase()}-${sha256}.safetensors`)
    if (existsSync(managedPath)) {
      await regular(managedPath)
      assert.ok((await readFile(managedPath)).equals(bytes), 'Never replace an existing fixture')
    } else await writeFile(managedPath, bytes, { flag: 'wx', mode: 0o600 })
    let installed = await repository.findExactFileDuplicate({ sha256 })
    if (!installed)
      installed = await repository.publishVerifiedInstallation({
        primary: {
          file: {
            managedPath,
            originalFilename: path.basename(managedPath),
            sha256,
            sizeBytes: bytes.length,
            verifiedAt: new Date().toISOString(),
          },
          resource: {
            type: 'embedding',
            displayName: `Qualification exact TI ${modelId}`,
            source: { kind: 'civitai', modelId },
            sourceMetadata: { qualificationPrecondition: true },
          },
          version: {
            baseModelFamily: 'illustrious',
            format: 'safetensors',
            name: `Qualification ${key}`,
            predictionType: null,
            source: { kind: 'civitai', expectedSha256: sha256, versionId, fileId },
            sourceMetadata: { qualificationPrecondition: true, trainedWords: ['shared'] },
          },
        },
      })
    const catalog = await repository.listInstalled()
    const resource = catalog.find(({ id }) => id === installed.resourceId)
    const version = resource?.versions.find(({ id }) => id === installed.versionId)
    assert.ok(resource && version)
    assert.deepEqual(resource.source, { kind: 'civitai', modelId })
    assert.equal(resource.type, 'embedding')
    assert.equal(version.civitaiVersionId, versionId)
    assert.equal(version.civitaiFileId, fileId)
    assert.equal(version.predictionType, null)
    assert.equal(version.baseModelFamily, 'illustrious')
    assert.equal(version.file.status, 'ready')
    assert.equal(version.file.managedPath, managedPath)
    assert.equal(version.file.sha256, sha256)
    assert.equal(version.file.sizeBytes, bytes.length)
    globalTi[key] = {
      salt,
      managedPath,
      byteSize: bytes.length,
      stat: statIdentity(await regular(managedPath)),
      reference: {
        kind: 'embedding',
        baseModelFamily: 'illustrious',
        predictionType: null,
        civitaiModelId: modelId,
        civitaiVersionId: versionId,
        civitaiFileId: fileId,
        displayName: resource.displayName,
        versionName: version.name,
        fileSha256: sha256,
        localModelId: resource.id,
        localVersionId: version.id,
      },
    }
  }
  assert.equal(globalTi.A.reference.localModelId, globalTi.C.reference.localModelId)
  assert.notEqual(globalTi.A.reference.localVersionId, globalTi.C.reference.localVersionId)
  const sameResource = (await repository.listInstalled()).find(
    ({ id }) => id === globalTi.A.reference.localModelId,
  )
  if (prior.some(({ id }) => id === sameResource.id))
    assert.equal(
      sameResource.defaultVersionId,
      globalTi.C.reference.localVersionId,
      'A reused fixture must already have its pinned C Default',
    )
  else await repository.setDefaultVersion(sameResource.id, globalTi.C.reference.localVersionId)
  let networkAttempts = 0,
    secretAttempts = 0
  const forbiddenSecret = async () => {
    secretAttempts++
    throw new Error('No credential operation belongs to fixture resolution')
  }
  const models = new ModelService(
    repository,
    new CivitaiClient(async () => {
      networkAttempts++
      throw new Error('No download belongs to fixture resolution')
    }),
    new CivitaiTokenStore(
      {
        decryptStringAsync: forbiddenSecret,
        encryptStringAsync: forbiddenSecret,
        getSelectedStorageBackend: () => 'qualification-only',
        isAsyncEncryptionAvailable: async () => false,
      },
      appDataRoot,
    ),
  )
  for (const resource of Object.values(globalTi)) {
    const verified = await models.resolveVerifiedGenerationEmbeddingForPlan(resource.reference)
    assert.deepEqual(verified, {
      byteSize: resource.byteSize,
      managedPath: resource.managedPath,
      reference: resource.reference,
    })
  }
  assert.equal(networkAttempts, 0)
  assert.equal(secretAttempts, 0)
  assert.equal(
    (await repository.listInstalled()).find(({ id }) => id === sameResource.id).defaultVersionId,
    globalTi.C.reference.localVersionId,
  )
  await verifyGlobalEmbeddingFiles()
  const after = await allSqlTables(database.db)
  for (const table of before) {
    const current = after.find(({ name }) => name === table.name)
    assert.equal(current.sql, table.sql)
    for (const row of table.rows)
      assert.ok(
        current.rows.some((value) => JSON.stringify(value) === JSON.stringify(row)),
        `Fixture registration changed historical SQL: ${table.name}`,
      )
  }
  report.globalEmbeddingFixtures = {
    root,
    formula: '(((row*37 + column*17 + salt*13) % 257) - 128)/256 + row/32',
    tensorShapes: { clip_l: [2, 768], clip_g: [2, 1280] },
    dtype: 'F32',
    resources: structuredClone(globalTi),
    defaultVersionId: globalTi.C.reference.localVersionId,
    savedGlobalVersionId: globalTi.A.reference.localVersionId,
    modelServiceStructuralQualification: true,
    networkAttempts,
    secretAttempts,
    retainedForFutureFrozenRetry: true,
    historicalRowsPreservedBeforeBaseline: true,
  }
  check(
    'Four real paired F32 TI files are registered and exactly qualified; Default C does not replace saved A',
    report.globalEmbeddingFixtures,
  )
}

// Real, tiny Kohya tensors for the same native UNet/CLIP targets consumed by Invoke.
// Row/column indices are flattened only within each down/up matrix, including Conv2d.
function globalLoraBytes({ salt, alpha }) {
  const descriptors = {},
    payloads = []
  let offset = 0
  const tensor = (name, shape, values) => {
    const bytes = Buffer.alloc(values.length * 4)
    values.forEach((value, index) => bytes.writeFloatLE(value, index * 4))
    descriptors[name] = { dtype: 'F32', shape, data_offsets: [offset, offset + bytes.length] }
    payloads.push(bytes)
    offset += bytes.length
  }
  for (const [stem, inputs, outputs, convolution] of [
    ['lora_unet_conv_in', 36, 320, true],
    ['lora_te1_text_model_encoder_layers_0_self_attn_out_proj', 768, 768, false],
    ['lora_te2_text_model_encoder_layers_0_self_attn_out_proj', 1280, 1280, false],
  ]) {
    tensor(
      `${stem}.lora_down.weight`,
      convolution ? [2, 4, 3, 3] : [2, inputs],
      Array.from({ length: 2 * inputs }, (_, index) => {
        const row = Math.floor(index / inputs),
          column = index % inputs
        return (((17 * column + 29 * row + 13 * salt) % 257) - 128) / 2048
      }),
    )
    tensor(
      `${stem}.lora_up.weight`,
      convolution ? [outputs, 2, 1, 1] : [outputs, 2],
      Array.from({ length: outputs * 2 }, (_, index) => {
        const output = Math.floor(index / 2),
          rank = index % 2
        return (((19 * output + 31 * rank + 11 * salt) % 263) - 131) / 2048
      }),
    )
    if (alpha !== undefined) tensor(`${stem}.alpha`, [], [alpha])
  }
  const json = Buffer.from(JSON.stringify(descriptors)),
    header = Buffer.alloc(Math.ceil(json.length / 8) * 8, 32),
    length = Buffer.alloc(8)
  json.copy(header)
  length.writeBigUInt64LE(BigInt(header.length))
  return Buffer.concat([length, header, ...payloads])
}
function configuredGlobalLoraStack() {
  assert.ok(globalLoraProfile && globalLoras)
  return [
    ...[
      ['A', 0.7],
      ['B', -0.5],
      ['Z', 0],
    ].map(([key, weight]) => ({
      enabled: true,
      resource: structuredClone(globalLoras[key].reference),
      weight,
    })),
    {
      enabled: false,
      resource: {
        kind: 'lora',
        baseModelFamily: null,
        predictionType: null,
        civitaiModelId: null,
        civitaiVersionId: null,
        civitaiFileId: null,
        displayName: 'Disabled missing compatibility-unknown fixture',
        versionName: 'Authored only',
        fileSha256: 'a'.repeat(64),
        localModelId: 'qualification-disabled-missing-lora-model',
        localVersionId: 'qualification-disabled-missing-lora-version',
      },
      weight: 1.25,
    },
  ]
}
function resolvedGlobalLoras() {
  return configuredGlobalLoraStack()
    .filter(({ enabled }) => enabled)
    .map(({ resource: reference, weight }) => {
      const { byteSize, managedPath } = Object.values(globalLoras).find(
        ({ reference: saved }) => saved.localVersionId === reference.localVersionId,
      )
      return { byteSize, managedPath, reference, weight }
    })
}
function globalLoraWireStack() {
  return resolvedGlobalLoras().map(({ byteSize, managedPath, reference, weight }) => ({
    byteSize,
    path: managedPath,
    sha256: reference.fileSha256,
    weight,
  }))
}
async function verifyGlobalLoraFiles() {
  assert.ok(globalLoraProfile && globalLoras)
  for (const resource of Object.values(globalLoras)) {
    assert.deepEqual(statIdentity(await regular(resource.managedPath)), resource.stat)
    assert.equal((await regular(resource.managedPath)).size, resource.byteSize)
    assert.equal(await hashFile(resource.managedPath), resource.reference.fileSha256)
    assert.equal(resource.reference.fileSha256, digest(globalLoraBytes(resource)))
    assert.ok(
      within(fixtureRoot, resource.managedPath) && !within(evidenceRoot, resource.managedPath),
    )
  }
}
async function prepareGlobalLoraCatalog(repository) {
  const before = await allSqlTables(database.db),
    prior = await repository.listInstalled(),
    root = path.join(fixtureRoot, 'global-lora-fixtures-v1'),
    definitions = [
      { key: 'A', salt: 3, alpha: 2, modelId: 900100101, versionId: 900101001, fileId: 900102001 },
      { key: 'B', salt: 11, modelId: 900100102, versionId: 900101002, fileId: 900102002 },
      { key: 'Z', salt: 23, alpha: 1, modelId: 900100103, versionId: 900101003, fileId: 900102003 },
      {
        key: 'A2',
        salt: 41,
        alpha: 2,
        modelId: 900100101,
        versionId: 900101004,
        fileId: 900102004,
      },
    ].map((definition) => {
      const bytes = globalLoraBytes(definition),
        sha256 = digest(bytes)
      return {
        ...definition,
        bytes,
        sha256,
        managedPath: path.join(root, `${definition.key.toLowerCase()}-${sha256}.safetensors`),
      }
    }),
    reserved = prior.filter(
      ({ source }) =>
        source.kind === 'civitai' && definitions.some(({ modelId }) => modelId === source.modelId),
    )
  assert.ok(within(fixtureRoot, root) && !within(evidenceRoot, root))
  await mkdir(root, { recursive: true, mode: 0o700 })
  await directory(root)
  const existingFiles = await readdir(root)
  if (reserved.length || existingFiles.length) {
    assert.equal(reserved.length, 3, 'Never repair a partial reserved LoRA namespace')
    assert.deepEqual(
      existingFiles.sort(),
      definitions.map(({ managedPath }) => path.basename(managedPath)).sort(),
    )
    for (const resource of reserved) {
      const expected = definitions.filter(({ modelId }) => modelId === resource.source.modelId)
      assert.equal(resource.type, 'lora')
      assert.equal(resource.versions.length, expected.length)
      for (const definition of expected) {
        const version = resource.versions.find(
          ({ civitaiVersionId }) => civitaiVersionId === definition.versionId,
        )
        assert.ok(version, 'Reserved LoRA namespace must already be complete')
        assert.equal(version.civitaiFileId, definition.fileId)
        assert.equal(version.file.status, 'ready')
        assert.equal(version.file.managedPath, definition.managedPath)
        assert.equal(version.file.sha256, definition.sha256)
        assert.equal(version.file.sizeBytes, definition.bytes.length)
        await regular(definition.managedPath)
        assert.ok((await readFile(definition.managedPath)).equals(definition.bytes))
      }
      if (expected.some(({ key }) => key === 'A2'))
        assert.equal(
          resource.defaultVersionId,
          resource.versions.find(({ civitaiVersionId }) => civitaiVersionId === 900101004).id,
        )
    }
  }
  globalLoras = {}
  for (const definition of definitions) {
    const { key, salt, alpha, modelId, versionId, fileId, bytes, sha256, managedPath } = definition
    if (!existsSync(managedPath)) await writeFile(managedPath, bytes, { flag: 'wx', mode: 0o600 })
    assert.ok((await readFile(managedPath)).equals(bytes), 'Never replace an existing LoRA fixture')
    let installed = await repository.findExactFileDuplicate({ sha256 })
    if (!installed)
      installed = await repository.publishVerifiedInstallation({
        primary: {
          file: {
            managedPath,
            originalFilename: path.basename(managedPath),
            sha256,
            sizeBytes: bytes.length,
            verifiedAt: new Date().toISOString(),
          },
          resource: {
            type: 'lora',
            displayName: `Qualification exact LoRA ${modelId}`,
            source: { kind: 'civitai', modelId },
            sourceMetadata: { qualificationPrecondition: true },
          },
          version: {
            baseModelFamily: 'illustrious',
            format: 'safetensors',
            name: `Qualification ${key}`,
            predictionType: null,
            source: { kind: 'civitai', expectedSha256: sha256, versionId, fileId },
            sourceMetadata: { qualificationPrecondition: true },
          },
        },
      })
    const resource = (await repository.listInstalled()).find(
        ({ id }) => id === installed.resourceId,
      ),
      version = resource?.versions.find(({ id }) => id === installed.versionId)
    assert.ok(resource && version)
    assert.deepEqual(resource.source, { kind: 'civitai', modelId })
    assert.equal(resource.type, 'lora')
    assert.equal(version.civitaiVersionId, versionId)
    assert.equal(version.civitaiFileId, fileId)
    assert.equal(version.predictionType, null)
    assert.equal(version.baseModelFamily, 'illustrious')
    assert.equal(version.file.status, 'ready')
    assert.equal(version.file.managedPath, managedPath)
    assert.equal(version.file.sha256, sha256)
    assert.equal(version.file.sizeBytes, bytes.length)
    globalLoras[key] = {
      salt,
      ...(alpha !== undefined ? { alpha } : {}),
      byteSize: bytes.length,
      managedPath,
      stat: statIdentity(await regular(managedPath)),
      reference: {
        kind: 'lora',
        baseModelFamily: 'illustrious',
        predictionType: null,
        civitaiModelId: modelId,
        civitaiVersionId: versionId,
        civitaiFileId: fileId,
        displayName: resource.displayName,
        versionName: version.name,
        fileSha256: sha256,
        localModelId: resource.id,
        localVersionId: version.id,
      },
    }
  }
  assert.equal(globalLoras.A.reference.localModelId, globalLoras.A2.reference.localModelId)
  assert.notEqual(globalLoras.A.reference.localVersionId, globalLoras.A2.reference.localVersionId)
  if (!reserved.length)
    await repository.setDefaultVersion(
      globalLoras.A.reference.localModelId,
      globalLoras.A2.reference.localVersionId,
    )
  let networkAttempts = 0,
    secretAttempts = 0
  const forbiddenSecret = async () => {
    secretAttempts++
    throw new Error('No credential operation belongs to LoRA fixture resolution')
  }
  const models = new ModelService(
    repository,
    new CivitaiClient(async () => {
      networkAttempts++
      throw new Error('No download belongs to LoRA fixture resolution')
    }),
    new CivitaiTokenStore(
      {
        decryptStringAsync: forbiddenSecret,
        encryptStringAsync: forbiddenSecret,
        getSelectedStorageBackend: () => 'qualification-only',
        isAsyncEncryptionAvailable: async () => false,
      },
      appDataRoot,
    ),
  )
  for (const { byteSize, managedPath, reference } of Object.values(globalLoras))
    assert.deepEqual(await models.resolveVerifiedGenerationLoraForPlan(reference), {
      byteSize,
      managedPath,
      reference,
    })
  assert.equal(networkAttempts, 0)
  assert.equal(secretAttempts, 0)
  assert.equal(
    (await repository.listInstalled()).find(({ id }) => id === globalLoras.A.reference.localModelId)
      .defaultVersionId,
    globalLoras.A2.reference.localVersionId,
  )
  await verifyGlobalLoraFiles()
  const after = await allSqlTables(database.db)
  for (const table of before) {
    const current = after.find(({ name }) => name === table.name)
    assert.equal(current.sql, table.sql)
    for (const row of table.rows)
      assert.ok(
        current.rows.some((value) => JSON.stringify(value) === JSON.stringify(row)),
        `LoRA registration changed historical SQL: ${table.name}`,
      )
  }
  report.globalLoraFixtures = {
    root,
    requiredCapability: 'illustrious-regional-lora-v1',
    rank: 2,
    dtype: 'F32',
    tensorShapes: {
      unetConvIn: { down: [2, 4, 3, 3], up: [320, 2, 1, 1] },
      clip1OutProjection: { down: [2, 768], up: [768, 2] },
      clip2OutProjection: { down: [2, 1280], up: [1280, 2] },
      alpha: [],
    },
    alpha: { A: 2, B: 'omitted: rank fallback', Z: 1, A2: 2 },
    downFormula: '(((17*c + 29*r + 13*salt) % 257) - 128)/2048',
    upFormula: '(((19*o + 31*r + 11*salt) % 263) - 131)/2048',
    resources: structuredClone(globalLoras),
    configuredStack: configuredGlobalLoraStack(),
    resolvedStack: resolvedGlobalLoras(),
    workerStack: globalLoraWireStack(),
    defaultVersionId: globalLoras.A2.reference.localVersionId,
    savedGlobalVersionId: globalLoras.A.reference.localVersionId,
    modelServiceStructuralQualification: true,
    disabledMissingReferenceResolved: false,
    networkAttempts,
    secretAttempts,
    historicalRowsPreservedBeforeBaseline: true,
    retainedForFutureFrozenRetry: true,
    preparation:
      'Fresh native owned components; Invoke FP32 direct prefusion before Borrow; no PEFT or borrowed-weight restoration',
  }
  check(
    'Four real Kohya LoRAs qualify exactly; Default A2 preserves saved A and disabled missing authoring',
    report.globalLoraFixtures,
  )
}

function selectedVaeReference() {
  assert.ok(vaeSelectionProfile && globalVae)
  return structuredClone(globalVae.A.reference)
}
function selectedVaeWire() {
  assert.ok(vaeSelectionProfile && globalVae)
  return {
    byteSize: globalVae.A.byteSize,
    path: globalVae.A.managedPath,
    sha256: globalVae.A.reference.fileSha256,
  }
}
async function verifyGlobalVaeFiles() {
  assert.ok(vaeSelectionProfile && globalVae)
  for (const resource of Object.values(globalVae)) {
    assert.deepEqual(statIdentity(await regular(resource.managedPath)), resource.stat)
    assert.equal((await regular(resource.managedPath)).size, resource.byteSize)
    assert.equal(await hashFile(resource.managedPath), resource.reference.fileSha256)
    assert.ok(within(artifactRoot, resource.managedPath))
    assert.equal(within(evidenceRoot, resource.managedPath), false)
    assert.equal(within(fixtureRoot, resource.managedPath), false)
  }
}
async function prepareGlobalVaeCatalog(repository) {
  const before = await allSqlTables(database.db),
    prior = await repository.listInstalled(),
    root = path.join(
      path.dirname(fixtureRoot),
      'illustrious-vpred-worker-012-20261007/component-sources',
    ),
    modelId = 900200101,
    definitions = [
      {
        key: 'A',
        versionId: 900201001,
        fileId: 900202001,
        versionName: 'Qualification native VAE A',
        filename: 'noobai-epsilon-vae-native.safetensors',
        sha256: 'f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7',
        byteSize: 167335542,
        source:
          'Existing trained NoobAI epsilon embedded VAE extracted in the historical component fixture',
      },
      {
        key: 'B',
        versionId: 900201002,
        fileId: 900202002,
        versionName: 'Qualification decoder control B',
        filename: 'noobai-epsilon-vae-decoder-control.safetensors',
        sha256: '3ba90e86a596d52f3000cd5bd586034dddd016b94d466bda2cf53348d9f54b21',
        byteSize: 167335598,
        source: 'Existing artificial decoder-bias control; not a trained VAE quality claim',
      },
    ].map((definition) => ({
      ...definition,
      managedPath: path.join(root, definition.filename),
    })),
    reserved = prior.filter(({ source }) => source.kind === 'civitai' && source.modelId === modelId)
  assert.ok(within(artifactRoot, root) && !within(evidenceRoot, root))
  await directory(root)
  for (const definition of definitions) {
    assert.equal((await regular(definition.managedPath)).size, definition.byteSize)
    assert.equal(await hashFile(definition.managedPath), definition.sha256)
  }
  if (reserved.length) {
    assert.equal(reserved.length, 1)
    const resource = reserved[0]
    assert.equal(resource.type, 'vae')
    assert.equal(resource.versions.length, 2, 'Never repair a partial reserved VAE namespace')
    for (const definition of definitions) {
      const version = resource.versions.find(
        ({ civitaiVersionId }) => civitaiVersionId === definition.versionId,
      )
      assert.ok(version, 'Reserved VAE namespace must already be complete')
      assert.equal(version.civitaiFileId, definition.fileId)
      assert.equal(version.name, definition.versionName)
      assert.equal(version.baseModelFamily, 'illustrious')
      assert.equal(version.predictionType, null)
      assert.equal(version.file.status, 'ready')
      assert.equal(version.file.managedPath, definition.managedPath)
      assert.equal(version.file.sha256, definition.sha256)
      assert.equal(version.file.sizeBytes, definition.byteSize)
    }
    assert.equal(
      resource.defaultVersionId,
      resource.versions.find(({ civitaiVersionId }) => civitaiVersionId === 900201002).id,
    )
  }
  globalVae = {}
  for (const definition of definitions) {
    const { key, versionId, fileId, managedPath, sha256, byteSize, versionName } = definition
    // Existing immutable component paths are registered directly: no copy, download or extraction.
    const installed = reserved.length
      ? await repository.findExactFileDuplicate({ civitai: { modelId, versionId, fileId } })
      : await repository.publishVerifiedInstallation({
          primary: {
            file: {
              managedPath,
              originalFilename: path.basename(managedPath),
              sha256,
              sizeBytes: byteSize,
              verifiedAt: new Date().toISOString(),
            },
            resource: {
              type: 'vae',
              displayName: 'Qualification exact VAE 900200101',
              source: { kind: 'civitai', modelId },
              sourceMetadata: { qualificationPrecondition: true, syntheticCatalogIdentity: true },
            },
            version: {
              baseModelFamily: 'illustrious',
              format: 'safetensors',
              name: versionName,
              predictionType: null,
              source: { kind: 'civitai', expectedSha256: sha256, versionId, fileId },
              sourceMetadata: {
                qualificationPrecondition: true,
                historicalSource: definition.source,
                ...(key === 'A'
                  ? {
                      parentCheckpointSha256:
                        'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
                    }
                  : { artificialControl: 'decoder-bias' }),
              },
            },
          },
        })
    assert.ok(installed)
    const resource = (await repository.listInstalled()).find(
        ({ id }) => id === installed.resourceId,
      ),
      version = resource?.versions.find(({ id }) => id === installed.versionId)
    assert.ok(resource && version)
    assert.equal(resource.type, 'vae')
    assert.deepEqual(resource.source, { kind: 'civitai', modelId })
    assert.equal(version.civitaiVersionId, versionId)
    assert.equal(version.civitaiFileId, fileId)
    assert.equal(version.name, versionName)
    assert.equal(version.baseModelFamily, 'illustrious')
    assert.equal(version.predictionType, null)
    assert.equal(version.file.status, 'ready')
    assert.equal(version.file.managedPath, managedPath)
    assert.equal(version.file.sha256, sha256)
    assert.equal(version.file.sizeBytes, byteSize)
    globalVae[key] = {
      byteSize,
      managedPath,
      stat: statIdentity(await regular(managedPath)),
      source: definition.source,
      reference: {
        kind: 'vae',
        baseModelFamily: 'illustrious',
        predictionType: null,
        civitaiModelId: modelId,
        civitaiVersionId: versionId,
        civitaiFileId: fileId,
        displayName: resource.displayName,
        versionName: version.name,
        fileSha256: sha256,
        localModelId: resource.id,
        localVersionId: version.id,
      },
    }
  }
  assert.equal(globalVae.A.reference.localModelId, globalVae.B.reference.localModelId)
  assert.notEqual(globalVae.A.reference.localVersionId, globalVae.B.reference.localVersionId)
  if (!reserved.length)
    await repository.setDefaultVersion(
      globalVae.A.reference.localModelId,
      globalVae.B.reference.localVersionId,
    )
  let networkAttempts = 0,
    secretAttempts = 0
  const forbiddenSecret = async () => {
    secretAttempts++
    throw new Error('No credential operation belongs to VAE fixture resolution')
  }
  const models = new ModelService(
    repository,
    new CivitaiClient(async () => {
      networkAttempts++
      throw new Error('No download belongs to VAE fixture resolution')
    }),
    new CivitaiTokenStore(
      {
        decryptStringAsync: forbiddenSecret,
        encryptStringAsync: forbiddenSecret,
        getSelectedStorageBackend: () => 'qualification-only',
        isAsyncEncryptionAvailable: async () => false,
      },
      appDataRoot,
    ),
  )
  for (const { byteSize, managedPath, reference } of Object.values(globalVae))
    assert.deepEqual(await models.resolveVerifiedGenerationVaeForPlan(reference), {
      byteSize,
      managedPath,
      reference,
    })
  assert.equal(networkAttempts, 0)
  assert.equal(secretAttempts, 0)
  assert.equal(
    (await repository.listInstalled()).find(({ id }) => id === globalVae.A.reference.localModelId)
      .defaultVersionId,
    globalVae.B.reference.localVersionId,
  )
  await verifyGlobalVaeFiles()
  const after = await allSqlTables(database.db)
  for (const table of before) {
    const current = after.find(({ name }) => name === table.name)
    assert.equal(current.sql, table.sql)
    for (const row of table.rows)
      assert.ok(
        current.rows.some((value) => JSON.stringify(value) === JSON.stringify(row)),
        `VAE registration changed historical SQL: ${table.name}`,
      )
  }
  report.globalVaeFixtures = {
    root,
    resources: structuredClone(globalVae),
    declaredNativeTensorCountPerFile: 248,
    requiredCapability: 'illustrious-regional-vae-v1',
    savedVersionId: globalVae.A.reference.localVersionId,
    defaultVersionId: globalVae.B.reference.localVersionId,
    selectedPrecision: 'FP32',
    sourceFilesRegisteredWithoutCopies: true,
    syntheticCatalogIdentity: true,
    modelServiceStructuralQualification: true,
    networkAttempts,
    secretAttempts,
    historicalRowsPreservedBeforeBaseline: true,
    retainedForFutureFrozenRetry: true,
    numericalCausalityClaimed: false,
  }
  check(
    'Existing full native VAE A and artificial decoder control B qualify exactly without copies; saved A differs from Default B',
    report.globalVaeFixtures,
  )
}

async function prepareCatalogAndProjects() {
  modelStat = statIdentity(await regular(fixture.checkpoint.path))
  assert.equal(modelStat.size, fixture.checkpoint.byteSize)
  assert.equal(await hashFile(fixture.checkpoint.path), fixture.checkpoint.sha256)
  await qualifySdxlCheckpoint(fixture.checkpoint.path)
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  if (globalTiProfile) await prepareGlobalEmbeddingCatalog(new ModelRepository(database.db))
  if (globalLoraProfile) await prepareGlobalLoraCatalog(new ModelRepository(database.db))
  if (vaeSelectionProfile) await prepareGlobalVaeCatalog(new ModelRepository(database.db))
  if (imageProfile || vPredictionProfile || referenceImagesProfile) await captureImagePreservation()
  else if (progressProfile) await captureProgressPreservation()
  if (referenceImagesProfile) {
    assert.deepEqual(Object.keys(fixture.referenceImages).sort(), ['A', 'B'])
    report.lifetimes = []
    report.referenceImages = { sources: {}, imports: [], controls: {}, controlProjectKey: null }
    for (const [key, source] of Object.entries(fixture.referenceImages)) {
      assert.deepEqual(Object.keys(source).sort(), ['byteSize', 'path', 'sha256'])
      assert.match(source.sha256, /^[a-f0-9]{64}$/)
      assert.ok(
        Number.isSafeInteger(source.byteSize) &&
          source.byteSize > 0 &&
          source.byteSize <= 32 * 1024 ** 2,
      )
      assert.equal((await regular(source.path)).size, source.byteSize)
      assert.equal(await hashFile(source.path), source.sha256)
      assert.ok(!within(evidenceRoot, source.path))
      const decoded = decodePng(await readFile(source.path))
      assert.equal(decoded.iccSha256, IGS_SRGB_ICC_SHA256)
      report.referenceImages.sources[key] = {
        ...source,
        stat: statIdentity(await regular(source.path)),
        width: decoded.width,
        height: decoded.height,
        rgbaSha256: decoded.rgbaSha256,
      }
    }
    assert.notEqual(
      report.referenceImages.sources.A.rgbaSha256,
      report.referenceImages.sources.B.rgbaSha256,
    )
    report.boundary.preconditions =
      'Original official Illustrious XL v0.1 epsilon checkpoint, existing fixed Standard ViT-H adapter/vision pair, canonical original sRGB PNG A/B, and the preserved installed runtime/catalog. Actual regional reference import/remove UI and installed normalizer run; no recipe, model path or image pixels are injected through IPC. Qualification source PNGs are bounded to1024 per side by the independent decoder.'
    report.boundary.calls =
      'Exactly four original regional requests across three physically closed Electron lifetimes: same-Project A and B controls with only the reference changed; A canceled after witnessed native/Main/DOM step1 of6; restarted exact frozen A Retry after saved B/settings edits. Three PNGs; each control is retained then explicitly discarded; only Retry is accepted.'
    report.boundary.progress =
      'Native scalar steps1..6 reach Main and existing Project/Queue UI; Cancel follows a genuine step>=1 before completion. No elapsed-time estimate or fabricated native progress.'
    report.boundary.exclusions =
      'Finite epsilon TXT512/EulerNormal/N6/CFG5/Fixed123/embeddedFP16/one item/one reference only. Visible RGB inequality establishes reference influence, not aesthetic quality, spatial final-RGB isolation, general capacity, other methods/modes, Smart/Anima references, generic IPAdapter, Install/Repair or public release readiness.'
  }
  if (recoveryProfile) {
    baselineSql = await sqlSnapshot()
    const priorCount = mainDeathProfile ? 3 : 1
    assert.equal(baselineSql.queue.length, priorCount * 2, 'Reuse the qualified historical pool')
    assert.equal(baselineSql.receipts.length, priorCount)
    assert.equal(baselineSql.cursors.length, priorCount)
    assert.ok(
      baselineSql.queue.every(({ operation }) => operation === 'illustrious-regional-txt2img'),
    )
    assert.equal(baselineSql.queue.filter(({ status }) => status === 'canceled').length, priorCount)
    const priorCompleted = baselineSql.queue.filter(({ status }) => status === 'completed')
    assert.equal(priorCompleted.length, priorCount)
    for (const completed of priorCompleted) {
      const receipts = baselineSql.receipts.filter(
        ({ queue_item_id }) => queue_item_id === completed.id,
      )
      assert.equal(receipts.length, 1)
      assert.equal(receipts[0].status, 'completed')
      assert.equal(receipts[0].actual_seed, 123)
      const cursors = baselineSql.cursors.filter(
        ({ local_project_key }) => local_project_key === completed.local_project_key,
      )
      assert.equal(cursors.length, 1)
      assert.equal(cursors[0].actual_seed, 123)
    }
    assert.ok(
      baselineSql.queue.every(({ status }) => ['completed', 'failed', 'canceled'].includes(status)),
      'Existing pool must be physically idle with terminal historical work',
    )
    const acceptedPackages = []
    for (const record of await database.db
      .selectFrom('project_index')
      .selectAll()
      .orderBy('canonical_path')
      .execute()) {
      if (record.file_health !== 'ready') continue
      assert.ok(within(path.join(appDataRoot, 'workspaces'), record.canonical_path))
      await regular(record.canonical_path)
      baselinePackages.push({
        path: record.canonical_path,
        sha256: await hashFile(record.canonical_path),
      })
      const saved = await readZip(record.canonical_path)
      for (const layer of saved.project.layers) {
        const provenance = layer.generationProvenance
        const prior = priorCompleted.find(
          ({ id }) => id === provenance?.executionResultContext?.queueItemId,
        )
        if (layer.kind !== 'raster' || !prior) continue
        const receipt = baselineSql.receipts.find(({ queue_item_id }) => queue_item_id === prior.id)
        assert.equal(layer.asset.sha256, receipt.image_sha256)
        assert.equal(digest(saved.members.get(layer.asset.path)), layer.asset.sha256)
        assert.equal(provenance.generationConfiguration.model.fileSha256, fixture.checkpoint.sha256)
        acceptedPackages.push({
          path: record.canonical_path,
          layerId: layer.id,
          pngSha256: layer.asset.sha256,
          queueItemId: prior.id,
        })
      }
    }
    assert.ok(
      acceptedPackages.length > 0,
      'Preservation needs a previously accepted Raster package',
    )
    if (!mainDeathProfile)
      assert.deepEqual(
        new Set(acceptedPackages.map(({ queueItemId }) => queueItemId)),
        new Set(priorCompleted.map(({ id }) => id)),
      )
    if (mainDeathProfile) {
      // Nine original packages + three native-r1 setup + three native-r2 packages. R2's
      // healthy completed candidate stays unaccepted; only the two earlier jobs have Rasters.
      assert.equal(baselinePackages.length, 15)
      assert.equal(acceptedPackages.length, 2)
      assert.equal(new Set(acceptedPackages.map(({ queueItemId }) => queueItemId)).size, 2)
      assert.equal(priorCompleted.length - acceptedPackages.length, 1)
    }
    report.baseline = { sql: baselineSql, packages: baselinePackages, acceptedPackages }
    report.lifetimes = []
    report.boundary.actual =
      'Three real built Electron lifetimes using the same installed RuntimeManager/catalog: active regional wire -> owned-scope crash -> APP_RESTART/frozen Queue Retry -> completed temporary candidate -> second owned-scope crash -> real Home Recover -> signed Results/Raster Add/Undo/Redo/explicit Save/reopen.'
    report.boundary.calls =
      'Exactly two witnessed regional wires, one interrupted attempt, one healthy 30-step seed123 completion, two owned-scope SIGKILL events, no automatic resume or replacement Generate, and one final healthy exit. Numerical progress and image quality remain unqualified.'
    report.boundary.exclusions +=
      ' This profile kills a verified owned Electron scope including its execution child. Main-only SIGKILL with a surviving Python worker, worker-only faults, automatic orphan reaping, and immediate restart safety before independently confirmed exit are not qualified.'
    report.boundary.progress =
      'Real Running/busy state is observed; deliberate owned-scope faults do not invoke Cancel. Regional numerical denoising step telemetry remains unqualified.'
    report.boundary.preconditions =
      'Reuse the existing original-file ModelRepository catalog entry, installed runtime, protected model bytes and provision/config companions. Three new real portable ProjectSession fixtures and masks are setup; existing pool SQL and saved packages are immutable baseline controls. No caller-supplied worker recipe or CivitAI download/install claim.'
    if (mainDeathProfile) {
      report.fallbackSignals = []
      report.boundary.actual =
        'Three installed Electron lifetimes: actual regional wire -> pidfd Main-only SIGKILL -> independent native/Python exit -> APP_RESTART and frozen UI Retry -> completed candidate -> second Main-only SIGKILL -> real Home Recover/Add/Undo/Redo/Save/reopen.'
      report.boundary.calls =
        'Exactly two regional wires, two Main-only pidfd SIGKILLs, one original 30-step seed123 completion, one final healthy Electron exit and zero fallback child/scope signals. Previous journaled lease is automatically reclaimed before the next owned worker Ready; unmarked/unrelated controls survive.'
      report.boundary.exclusions =
        'Linux creating-parent-thread ownership only; no fork-descendant reaping, worker-only crash, quality, Anima, numeric progress, installer/Repair or capacity claim. Emergency captured-scope cleanup is failure evidence and can never satisfy this profile.'
    }
  }
  const repository = new ModelRepository(database.db)
  let entry = await repository.findExactFileDuplicate({ sha256: fixture.checkpoint.sha256 })
  if (recoveryProfile || progressProfile)
    assert.ok(
      entry,
      'Recovery reuses the existing exact original-file catalog entry; no new model adoption',
    )
  if (entry) {
    assert.equal(entry.status, 'ready')
    assert.equal(entry.managedPath, fixture.checkpoint.path)
    model = { resourceId: entry.resourceId, versionId: entry.versionId }
  } else {
    model = await repository.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath: fixture.checkpoint.path,
          originalFilename: path.basename(fixture.checkpoint.path),
          sha256: fixture.checkpoint.sha256,
          sizeBytes: fixture.checkpoint.byteSize,
          verifiedAt: new Date().toISOString(),
        },
        resource: {
          type: 'checkpoint',
          displayName: fixture.checkpoint.modelName,
          source: { kind: 'civitai', modelId: fixture.checkpoint.civitaiModelId },
          sourceMetadata: { qualificationPrecondition: true },
        },
        version: {
          baseModelFamily: 'illustrious',
          format: 'safetensors',
          name: fixture.checkpoint.versionName,
          predictionType,
          source: {
            kind: 'civitai',
            expectedSha256: fixture.checkpoint.sha256,
            versionId: fixture.checkpoint.civitaiVersionId,
            fileId: fixture.checkpoint.civitaiFileId,
          },
          sourceMetadata: { qualificationPrecondition: true },
        },
      },
    })
  }
  catalogBefore = await catalogSnapshot(database.db)
  const reference = {
    kind: 'checkpoint',
    baseModelFamily: 'illustrious',
    civitaiFileId: fixture.checkpoint.civitaiFileId,
    civitaiModelId: fixture.checkpoint.civitaiModelId,
    civitaiVersionId: fixture.checkpoint.civitaiVersionId,
    displayName: fixture.checkpoint.modelName,
    versionName: fixture.checkpoint.versionName,
    fileSha256: fixture.checkpoint.sha256,
    localModelId: model.resourceId,
    localVersionId: model.versionId,
    predictionType,
  }
  report.catalog = {
    setupOnly: true,
    managedPath: fixture.checkpoint.path,
    model,
    originalStat: modelStat,
    sdxlHeaderVerified: true,
    snapshot: catalogBefore,
  }
  const profile = await readFile('worker-python/src/imagegen_worker/srgb.icc')
  assert.equal(digest(profile), IGS_SRGB_ICC_SHA256)
  const workspace = path.join(appDataRoot, 'workspaces/Uncategorized')
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  await directory(workspace)
  for (const mode of referenceImagesProfile
    ? ['transparent', 'reference-control', 'partial']
    : vPredictionImageProfile
      ? ['transparent', 'v-control', outpaintProfile ? 'partial' : 'opaque']
      : vPredictionProfile
        ? ['transparent', 'v-control', 'partial']
        : ['transparent', 'opaque', 'partial']) {
    const title = `Regional ${mode} ${path.basename(evidenceRoot)} ${randomUUID().slice(0, 8)}`
    const file = path.join(workspace, `${title}.igs`)
    assert.equal(existsSync(file), false)
    const session = await ProjectSession.create(
      file,
      title,
      {
        placeholdersDir: path.resolve('dist/main/placeholders'),
        scratchDir: path.join(evidenceRoot, 'writer-scratch'),
      },
      bbox,
    )
    const doc = structuredClone(session.document),
      assets = {},
      regionAlphas = []
    doc.generationDraft = {
      ...doc.generationDraft,
      model: reference,
      positivePrompt: {
        text: globalPrompt,
        embeddingRefs: globalTiProfile ? authoredGlobalPositiveRefs() : [],
      },
      negativePrompt: {
        text: globalNegativePrompt,
        embeddingRefs: globalTiProfile ? [globalTiRef('B')] : [],
      },
      dynamicPrompt: { maxPrompts: 1, seedBehavior: 'per-iteration' },
      seed: { policy: 'fixed', value: 123 },
      loras: globalLoraProfile ? configuredGlobalLoraStack() : [],
      vae: vaeSelectionProfile ? selectedVaeReference() : null,
      vaePrecision: vaeSelectionProfile || vPredictionProfile ? 'FP32' : 'FP16',
      cfgRescale: 0,
      sampling: {
        cfgScale: 5,
        denoisingStrength: imageProfile ? imageStrength : null,
        steps: generationSteps,
        sampler: imgSamplerProfile || vPredictionSamplingProfile ? 'Euler' : generationSampler,
        scheduler: 'Normal',
      },
    }
    doc.regionalGuidance = localPrompts.map((text, index) => {
      const id = randomUUID(),
        maskId = randomUUID()
      const alpha = Buffer.from(
        Array.from({ length: side ** 2 }, (_, i) =>
          i % side < side / 2 === (index === 0) ? 255 : 0,
        ),
      )
      // Project mask assets use tight nonzero bounds; the recipe projects them into world alpha.
      const bytes = encodeProjectMaskPng(Buffer.alloc((side / 2) * side, 255), side / 2, side)
      const asset = {
        bytes: bytes.length,
        height: side,
        width: side / 2,
        path: `assets/masks/${maskId}/${digest(bytes)}.png`,
        sha256: digest(bytes),
      }
      assets[asset.path] = { bytes }
      regionAlphas.push(digest(alpha))
      return {
        enabled: true,
        id,
        locked: false,
        mask: {
          asset,
          bounds: { ...bbox, x: bbox.x + (index * side) / 2, width: side / 2 },
          id: maskId,
          revision: 1,
        },
        name: index === 0 ? 'Left subject' : 'Right subject',
        overlayOpacity: 0,
        prompts: {
          positive: {
            text,
            embeddingRefs: globalTiProfile && index === 0 ? [globalTiRef('C')] : [],
          },
          negative: {
            text: globalTiProfile && index === 1 ? '<shared>' : '',
            embeddingRefs: globalTiProfile && index === 1 ? [globalTiRef('D')] : [],
          },
          useGlobalNegativePrompt: globalTiProfile && index === 0,
        },
      }
    })
    if (
      mode !== 'transparent' &&
      mode !== 'v-control' &&
      mode !== 'reference-control' &&
      !(imageProfile && mode === (outpaintProfile ? 'partial' : 'opaque'))
    ) {
      const id = randomUUID(),
        rgba = Buffer.alloc(64 * 64 * 4)
      for (let i = 0; i < 64 * 64; i++) {
        rgba[i * 4] = 70
        rgba[i * 4 + 1] = 80
        rgba[i * 4 + 2] = 90
        rgba[i * 4 + 3] = mode === 'opaque' || i % 64 < 32 ? 255 : 0
      }
      const bytes = fixturePng(64, 64, rgba, profile)
      const asset = {
        bytes: bytes.length,
        height: 64,
        width: 64,
        path: `assets/layers/${id}.png`,
        sha256: digest(bytes),
      }
      assets[asset.path] = { bytes }
      doc.layers = [
        {
          asset,
          blendMode: 'normal',
          id,
          kind: 'raster',
          locked: false,
          name: `${mode} source precondition`,
          opacity: 1,
          transform: {
            x: bbox.x,
            y: bbox.y,
            scaleX: side / 64,
            scaleY: side / 64,
            rotationDegrees: 0,
          },
          visible: true,
        },
      ]
    }
    session.applyDocument(doc)
    await session.save({ assets })
    projects.push({
      mode,
      title,
      file,
      document: doc,
      initialPackageSha256: await hashFile(file),
      regionAlphas,
    })
  }
  if (imageProfile) {
    const rgba = Buffer.alloc(side * side * 4)
    for (let y = 0; y < side; y++)
      for (let x = 0; x < side; x++) {
        const offset = (y * side + x) * 4
        rgba[offset] = x < side / 2 ? 180 : 35
        rgba[offset + 1] = 40 + Math.floor((y * 100) / side)
        rgba[offset + 2] = x < side / 2 ? 30 : 185
        rgba[offset + 3] = outpaintProfile
          ? x < side / 2 - 8
            ? 255
            : x < side / 2 + 8
              ? 127
              : 0
          : 255
        if (rgba[offset + 3] === 0) rgba.fill(0, offset, offset + 3)
      }
    const source = path.join(evidenceRoot, 'import-source.png')
    const bytes = fixturePng(side, side, rgba, profile)
    await writeFile(source, bytes, { flag: 'wx', mode: 0o600 })
    report.img2img = {
      source: {
        path: source,
        sha256: digest(bytes),
        rgbaSha256: digest(rgba),
        width: side,
        height: side,
      },
      strength: imageStrength,
      sourceMode: generationMode,
      requestedSteps: 30,
      selectedTimesteps: imageSelectedTimesteps,
      expectedProgressTotal: progressTotal,
    }
  }
  if (vPredictionProfile) {
    report.lifetimes = []
    report.vPrediction = {
      predictionType,
      controlProjectKey: null,
      nativeRequestBudget: 3,
      pngBudget: 2,
      currentNoiseEdit:
        'Clearing the current model removes the current objective/policy selection; no catalog override is mutated.',
    }
    report.boundary.calls = `Three original native requests across three serial physically closed Electron lifetimes: independent healthy ${generationMode} control, progress-observed Cancel, then restarted frozen Queue Retry; exactly two PNGs.`
    report.boundary.preconditions =
      'ROOT registered the exact existing NoobAI V file/version through real ModelRepository before this preserved catalog baseline. Reuse the original file and canonical runtime; no download, model/environment copy, alternate source or injected worker recipe.'
    report.boundary.progress = `Original scalar JSONL and Main/DOM observe ${progressTotal} selected ${generationSampler}/${generationScheduleLabel} steps from30 requested; Cancel after real completed steps; fresh Retry starts at1 and completes${progressTotal} before PNG.`
    report.boundary.exclusions = vPredictionImageProfile
      ? `Only exact V checkpoint/${generationMode}/Euler-Normal/EmbeddedFP32/strength0.5 at512-square/CFG5/seed123, with existing source/posterior and ${outpaintProfile ? 'LaMa/keep-mask/RGBA contribution' : 'opaque source/RGB'} owners. No other V samplers, initializer, Smart/reference, visual-quality, Install/Repair, general capacity or public-readiness claim.`
      : 'Only exact V checkpoint/TXT/Euler-Normal/EmbeddedFP32 at512-square/CFG5/seed123. No V IMG/OUT/other samplers, scene quality, spatial-negative/reference, Install/Repair, general capacity or public-readiness claim.'
    if (vPredictionSamplingProfile) {
      report.vPrediction.sampling = {
        combinationCapability: 'illustrious-regional-v-prediction-sampling-v1',
        sampler: generationSampler,
        scheduler: generationScheduleLabel,
        invokeScheduler: generationScheduler,
        initialization: initializationProfile ? initialization : null,
        expectedFullTimesteps: imageTimesteps,
        expectedSelectedTimesteps: imageProfile ? imageSelectedTimesteps : imageTimesteps,
        expectedProgressTotal: progressTotal,
        uiChanges: [],
        originalNativeOwnerReused: true,
      }
      report.boundary.exclusions = `Only exact V checkpoint/${generationMode}/${generationSampler}-${generationScheduleLabel}/EmbeddedFP32${imageProfile ? '/strength0.5' : ''} at512-square/CFG5/seed123; explicit existing ${initializationProfile ? 'Invoke TXT initialization' : 'image source/window'} owner. No new numerical solver, history reset, sampler inference, source/noise override, Smart/reference, trained visual quality, all-method/per-mode cross-product, Install/Repair, capacity or public-readiness claim.`
      report.boundary.preconditions +=
        ' The new V-sampling capability and existing method/initializer/image prerequisites must be advertised by every executing peer. Actual Sampler/Scheduler UI selection precedes both Generate actions; saved current authoring changes back to Euler/Normal before restarted frozen Retry.'
    }
    if (vPredictionImageProfile) {
      report.boundary.preconditions +=
        ' Each healthy/canceled Project imports the same retained original PNG through actual UI/Main/installed normalization. Saved source visibility/strength/model/text/region/seed edits cannot replace the frozen image, keep mask, exact resources or policy.'
      report.vPrediction.image = {
        mode: generationMode,
        combinationCapability: 'illustrious-regional-v-prediction-image-v1',
        precision: 'FP32',
        strength: imageStrength,
        selectedTimesteps: imageSelectedTimesteps,
        expectedProgressTotal: progressTotal,
        noTxtInitialization: true,
        sourceVaeOwnerReused: true,
      }
    }
  }
  report.projectSetup = projects.map(
    ({ mode, title, file, document, initialPackageSha256, regionAlphas }) => ({
      mode,
      title,
      file,
      documentId: document.documentId,
      initialPackageSha256,
      regionIds: document.regionalGuidance.map(({ id }) => id),
      maskPngSha256: document.regionalGuidance.map(({ mask }) => mask.asset.sha256),
      alphaSha256: regionAlphas,
    }),
  )
  await database.close()
  database = null
  check(
    'Real catalog header/SHA adoption references the immutable original; real portable masks and target controls authored without worker recipes',
  )
}

async function observeMemory(label) {
  for (const [group, role] of memoryGroups) {
    try {
      const root = `/sys/fs/cgroup${group}`
      const current = (await readFile(path.join(root, 'memory.current'), 'utf8')).trim()
      const peak = (await readFile(path.join(root, 'memory.peak'), 'utf8')).trim()
      assert.match(current, /^\d+$/)
      assert.match(peak, /^\d+$/)
      const prior = report.memoryObservations[group] ?? { role, samples: 0, maxCurrent: '0' }
      report.memoryObservations[group] = {
        ...prior,
        samples: prior.samples + 1,
        maxCurrent: String(
          BigInt(current) > BigInt(prior.maxCurrent) ? BigInt(current) : BigInt(prior.maxCurrent),
        ),
        last: { label, at: new Date().toISOString(), current, peak },
      }
    } catch (error) {
      if (!['ENOENT', 'ESRCH', 'ENODEV'].includes(error.code)) throw error
    }
  }
}
async function bounds(label, refreshMainDeathProof = false) {
  const value = await boundQualificationProcess(application.process().pid, {
    deadlineSeconds:
      recoveryProfile || referenceImagesProfile
        ? activeLifetime.deadlineSeconds
        : fixture.deadlineSeconds,
    ...(mainDeathProfile
      ? { surviveMainDeath: true, refreshMainDeathProof, deadlineAt: endAt }
      : {}),
    execute: (file, args, options) =>
      exec(
        file,
        args.map((item) => (item === 'MemoryMax=12G' ? 'MemoryMax=10G' : item)),
        options,
      ),
  })
  const launcher = report.launcherBounds
  const unique = new Map(value.groups.map((group) => [group.group, BigInt(group.memoryMax)]))
  for (const group of value.groups) {
    assert.ok(BigInt(group.memoryMax) <= 10n * 1024n ** 3n && group.swapMax === '0')
    memoryGroups.set(group.group, 'native')
  }
  unique.set(launcher.group, BigInt(launcher.memoryMax))
  const total = [...unique.values()].reduce((sum, limit) => sum + limit, 0n)
  assert.ok(total <= 12n * 1024n ** 3n)
  memoryGroups.set(launcher.group, 'launcher')
  await observeMemory(label)
  nativeChecks.push(value)
  report.resourceLimitChecks.push({
    label,
    ...(activeLifetime ? { lifetime: activeLifetime.number } : {}),
    ...value,
    aggregateUniqueMax: String(total),
  })
  checkpoint()
}

/** Pass-through observers: no IPC result, spawn option, stdin argument or worker response changes. */
async function installObservers() {
  await application.evaluate(
    async ({ ipcMain, webContents }, ownership) => {
      if (globalThis.__regionalInstalledObserver) throw new Error('Observer already installed')
      const cp = process.getBuiltinModule('child_process')
      const fs = process.getBuiltinModule('fs')
      const crypto = process.getBuiltinModule('crypto')
      const p = process.getBuiltinModule('path')
      const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
      const state = {
        originalSpawn: cp.spawn,
        spawnDescriptor: Object.getOwnPropertyDescriptor(cp, 'spawn'),
        workers: [],
        ipc: [],
        faults: [],
        originals: new Map(),
        wrappers: new Map(),
        restores: [],
        ...(ownership.progress ? { order: 0, progress: [], terminals: [] } : {}),
      }
      globalThis.__regionalInstalledObserver = state
      const fault = (error) => state.faults.push(String(error.stack ?? error))
      if (ownership.progress) {
        for (const contents of webContents.getAllWebContents()) {
          const original = contents.send,
            descriptor = Object.getOwnPropertyDescriptor(contents, 'send')
          const wrapper = function (channel, ...args) {
            let record
            try {
              if (channel === 'projects:generation-progress') {
                if (state.progress.length >= 2048)
                  throw new Error('Progress IPC observation exceeds bound')
                record = {
                  order: ++state.order,
                  at: new Date().toISOString(),
                  snapshot: structuredClone(args[0]),
                  originalCalls: 1,
                  receiverMatches: this === contents,
                  terminalCount: state.terminals.length,
                }
                state.progress.push(record)
              }
            } catch (error) {
              fault(error)
            }
            return Reflect.apply(original, this, [channel, ...args])
          }
          contents.send = wrapper
          state.restores.push(() => {
            if (contents.send !== wrapper) throw new Error('Progress send observer changed owner')
            if (descriptor) Object.defineProperty(contents, 'send', descriptor)
            else delete contents.send
            if (contents.send !== original) throw new Error('Progress send restoration differs')
          })
        }
      }
      const absent = (file) => {
        try {
          fs.lstatSync(file)
          return false
        } catch (error) {
          if (error.code === 'ENOENT') return true
          throw error
        }
      }
      const readIdentity = (pid) => {
        try {
          const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
          return {
            pid,
            start: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19],
            group: fs
              .readFileSync(`/proc/${pid}/cgroup`, 'utf8')
              .trim()
              .split('\n')
              .find((line) => line.startsWith('0::'))
              ?.slice(3),
            executable: fs.readlinkSync(`/proc/${pid}/exe`),
          }
        } catch (error) {
          if (!['ENOENT', 'ESRCH'].includes(error.code)) fault(error)
          return null
        }
      }
      const checkedBytes = (descriptor, root, maximum) => {
        if (!descriptor || typeof descriptor.path !== 'string')
          throw new Error('Missing owned descriptor')
        const rel = p.relative(root, descriptor.path)
        if (!rel || rel.startsWith('..') || p.isAbsolute(rel))
          throw new Error('Descriptor escaped owned root')
        const stat = fs.lstatSync(descriptor.path)
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.size > maximum ||
          stat.size !== descriptor.byteSize ||
          fs.realpathSync(descriptor.path) !== descriptor.path
        )
          throw new Error('Invalid observed owned file')
        const bytes = fs.readFileSync(descriptor.path)
        if (bytes.length !== descriptor.byteSize || sha(bytes) !== descriptor.sha256)
          throw new Error('Observed owned bytes differ')
        return bytes
      }
      const captureWire = (wire, workerPid) => {
        if (wire.type !== 'execute-current-canvas-regional')
          return { type: wire.type ?? null, requestId: wire.requestId ?? null }
        const bytes = checkedBytes(wire.bundle, wire.stagingRoot, 1024 * 1024)
        const bundle = JSON.parse(bytes.toString('utf8'))
        const target = bundle.request.job.target
        // Target belongs to the request lease, which is a sibling of the transport bundle.
        const targetRoot = p.dirname(target.path)
        const targetBytes = checkedBytes(target, targetRoot, 32 * 1024 * 1024)
        const alpha = bundle.recipe.regions.map((region) => {
          const descriptor = region.coverage.alpha.$alpha8
          const samples = checkedBytes(descriptor, wire.stagingRoot, 64 * 1024 * 1024)
          let positive = 0,
            opaque = 0
          for (const value of samples) {
            if (value > 0) positive++
            if (value === 255) opaque++
          }
          return { ...descriptor, positive, opaque }
        })
        const referenceImages = ownership.references
          ? bundle.references.images.map((entry, index) => {
              const descriptor = entry.image.$referencePng
              const original = checkedBytes(descriptor, wire.stagingRoot, 32 * 1024 * 1024)
              if (
                p.basename(descriptor.path) !== `reference-${index}.png` ||
                !original.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
                original.readUInt32BE(16) !== descriptor.width ||
                original.readUInt32BE(20) !== descriptor.height
              )
                throw new Error('Original regional reference PNG metadata differs')
              return {
                regionId: entry.regionId,
                referenceId: entry.referenceId,
                index,
                ...descriptor,
                observedSha256: sha(original),
              }
            })
          : undefined
        let ownerMarker
        if (ownership.required || ownership.workerFault) {
          const directory = fs.lstatSync(wire.stagingRoot, { bigint: true })
          const file = p.join(wire.stagingRoot, '.owner-v1.json')
          const entry = fs.lstatSync(file)
          if (
            !entry.isFile() ||
            entry.isSymbolicLink() ||
            entry.nlink !== 1 ||
            (entry.mode & 0o777) !== 0o600 ||
            entry.size > 4096
          ) {
            throw new Error('Regional transport ownership marker is unsafe')
          }
          const bytes = fs.readFileSync(file)
          const value = JSON.parse(bytes.toString('utf8'))
          const main = readIdentity(process.pid),
            child = readIdentity(workerPid)
          if (
            value.schemaVersion !== 1 ||
            value.kind !== 'regional-transport-owner-v1' ||
            value.main.pid !== process.pid ||
            value.main.startTicks !== main?.start ||
            value.worker.pid !== workerPid ||
            value.worker.startTicks !== child?.start ||
            value.directory.device !== String(directory.dev) ||
            value.directory.inode !== String(directory.ino) ||
            value.bootId !== fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
          ) {
            throw new Error('Regional ownership marker differs from the real dispatch identities')
          }
          ownerMarker = { value, sha256: sha(bytes), capturedMainPid: process.pid }
        }
        return {
          ...wire,
          bundleJson: bundle,
          target: { ...target, observedSha256: sha(targetBytes) },
          alpha,
          ...(referenceImages ? { referenceImages } : {}),
          ...(ownerMarker ? { ownerMarker } : {}),
        }
      }
      const spawnWrapper = function (...args) {
        const child = Reflect.apply(state.originalSpawn, this, args)
        try {
          if (
            Array.isArray(args[1]) &&
            args[1].some((arg) => typeof arg === 'string' && arg.startsWith('imagegen_worker'))
          ) {
            if (state.workers.length >= 128)
              throw new Error('Worker observation exceeds finite bound')
            const worker = {
              pid: child.pid ?? null,
              identity: child.pid ? readIdentity(child.pid) : null,
              executable: args[0],
              args: args[1],
              originalSpawnCalls: 1,
              writes: [],
              exit: null,
              close: null,
              writeRestored: false,
              ready: null,
              stdoutRestored: false,
              ...(ownership.progress ? { frames: [] } : {}),
              ...(ownership.workerFault ? { stderrTail: '', stderrRestored: false } : {}),
            }
            state.workers.push(worker)
            const originalWrite = child.stdin.write
            const descriptor = Object.getOwnPropertyDescriptor(child.stdin, 'write')
            let pending = ''
            const writeWrapper = function (...writeArgs) {
              let record
              try {
                const bytes =
                  typeof writeArgs[0] === 'string'
                    ? Buffer.from(
                        writeArgs[0],
                        typeof writeArgs[1] === 'string' ? writeArgs[1] : 'utf8',
                      )
                    : Buffer.from(writeArgs[0])
                if (bytes.length > 64 * 1024 || worker.writes.length >= 1024)
                  throw new Error('Worker request observation exceeds bound')
                record = {
                  receiverMatches: this === child.stdin,
                  originalCalls: 1,
                  byteSize: bytes.length,
                  sha256: sha(bytes),
                  at: new Date().toISOString(),
                  lines: [],
                }
                worker.writes.push(record)
                pending += bytes.toString('utf8')
                if (pending.length > 128 * 1024)
                  throw new Error('Incomplete JSONL observation exceeds bound')
                let newline
                while ((newline = pending.indexOf('\n')) >= 0) {
                  const line = pending.slice(0, newline)
                  pending = pending.slice(newline + 1)
                  if (line) record.lines.push(captureWire(JSON.parse(line), child.pid))
                }
              } catch (error) {
                fault(error)
              }
              try {
                const result = Reflect.apply(originalWrite, this, writeArgs)
                if (record) record.returned = result
                return result
              } catch (error) {
                if (record) record.thrown = { name: error.name, message: error.message }
                throw error
              }
            }
            child.stdin.write = writeWrapper
            let response = ''
            const onData = (chunk) => {
              try {
                response += chunk.toString('utf8')
                if (response.length > 128 * 1024)
                  throw new Error('Worker response observation exceeds bound')
                let newline
                while ((newline = response.indexOf('\n')) >= 0) {
                  const line = response.slice(0, newline)
                  response = response.slice(newline + 1)
                  if (!line) continue
                  const message = JSON.parse(line)
                  if (
                    ownership.progress &&
                    ['generation-progress', 'generation-done', 'error'].includes(message.type)
                  ) {
                    if (Buffer.byteLength(line) > 64 * 1024 || worker.frames.length >= 1024)
                      throw new Error('Progress frame observation exceeds bound')
                    if (message.type === 'generation-progress') {
                      const expected = [
                        'protocolVersion',
                        'requestId',
                        'step',
                        'totalSteps',
                        'type',
                      ]
                      if (JSON.stringify(Object.keys(message).sort()) !== JSON.stringify(expected))
                        throw new Error('Numeric progress must not contain tensors or previews')
                    }
                    const record = {
                      order: ++state.order,
                      at: new Date().toISOString(),
                      message,
                      byteSize: Buffer.byteLength(line),
                      sha256: sha(Buffer.from(line)),
                    }
                    worker.frames.push(record)
                    if (message.type !== 'generation-progress') state.terminals.push(record)
                  }
                  if (message.type !== 'ready') continue
                  worker.ready = message
                  const inference =
                    worker.args.includes('imagegen_worker.owned_inference') ||
                    worker.args.includes('imagegen_worker.inference_main')
                  if (!inference) continue
                  if (
                    ownership.progress &&
                    !message.capabilities?.includes('illustrious-regional-progress-v1')
                  )
                    throw new Error('Original inference Ready lacks regional progress capability')
                  const guarded =
                    message.capabilities?.includes('linux-owned-inference-v1') === true
                  if (ownership.workerFault && !guarded)
                    throw new Error('Worker-only fault requires actual Linux ownership capability')
                  const expected = guarded
                    ? [
                        '-I',
                        '-m',
                        'imagegen_worker.owned_inference',
                        '--parent-pid',
                        String(process.pid),
                        '--scratch-base',
                        ownership.scratch,
                      ]
                    : ['-I', '-m', 'imagegen_worker.inference_main']
                  if (
                    JSON.stringify(worker.args) !== JSON.stringify(expected) ||
                    (ownership.required &&
                      (!guarded ||
                        message.workerVersion !== '0.14.0' ||
                        message.protocolVersion !== '1'))
                  ) {
                    throw new Error(
                      'Actual inference module/arguments disagree with lifetime capability',
                    )
                  }
                  if (ownership.required) {
                    const previous = ownership.previous
                    if (previous && !absent(previous.path)) {
                      throw new Error(
                        'Journaled previous transport survived until owned worker Ready',
                      )
                    }
                    if (previous) {
                      const entries = fs.readdirSync(ownership.scratch)
                      if (entries.length > 4096)
                        throw new Error('Scratch recovery observation exceeds bound')
                      for (const name of entries) {
                        if (
                          !name.startsWith('regional-request-') &&
                          !name.startsWith('.regional-reclaim-v1-')
                        )
                          continue
                        const entry = fs.lstatSync(p.join(ownership.scratch, name), {
                          bigint: true,
                        })
                        if (
                          String(entry.dev) === previous.marker.directory.device &&
                          String(entry.ino) === previous.marker.directory.inode
                        ) {
                          throw new Error(
                            'Previous transport inode remains under a renamed recovery entry',
                          )
                        }
                      }
                    }
                    for (const control of ownership.controls.files) {
                      const entry = fs.lstatSync(control.path)
                      if (
                        !entry.isFile() ||
                        entry.isSymbolicLink() ||
                        entry.nlink !== 1 ||
                        entry.size !== control.byteSize ||
                        (entry.mode & 0o777) !== 0o600 ||
                        entry.uid !== process.getuid() ||
                        entry.ino !== control.inode ||
                        fs.realpathSync(control.path) !== control.path ||
                        sha(fs.readFileSync(control.path)) !== control.sha256
                      ) {
                        throw new Error(
                          'Unmarked or unrelated retention control changed before Ready',
                        )
                      }
                    }
                    const unmarked = fs.lstatSync(ownership.controls.unmarkedRoot)
                    if (
                      !unmarked.isDirectory() ||
                      unmarked.isSymbolicLink() ||
                      unmarked.ino !== ownership.controls.unmarkedInode
                    ) {
                      throw new Error('The unmarked control directory changed identity')
                    }
                    if (!absent(p.join(ownership.controls.unmarkedRoot, '.owner-v1.json'))) {
                      throw new Error('The unmarked retention control acquired an ownership marker')
                    }
                    worker.startupRecovery = {
                      at: new Date().toISOString(),
                      previousTransport: previous?.path ?? null,
                      previousAbsent: previous !== null,
                      previousDirectoryInodeAbsent: previous !== null,
                      controls: ownership.controls.files,
                    }
                  }
                }
              } catch (error) {
                fault(error)
              }
            }
            child.stdout.on('data', onData)
            const onStderr = ownership.workerFault
              ? (bytes) => {
                  worker.stderrTail = (worker.stderrTail + bytes.toString('utf8')).slice(-64 * 1024)
                }
              : null
            if (onStderr) child.stderr.on('data', onStderr)
            const onExit = (code, signal) => {
              worker.exit = {
                at: new Date().toISOString(),
                code,
                signal,
                ...(ownership.progress ? { order: ++state.order } : {}),
              }
            }
            const onClose = (code, signal) => {
              worker.close = {
                at: new Date().toISOString(),
                code,
                signal,
                ...(ownership.progress ? { order: ++state.order } : {}),
              }
            }
            child.once('exit', onExit)
            child.once('close', onClose)
            state.restores.push(() => {
              if (child.stdin.write !== writeWrapper)
                throw new Error('Observed stdin slot changed owner')
              if (descriptor) Object.defineProperty(child.stdin, 'write', descriptor)
              else delete child.stdin.write
              if (child.stdin.write !== originalWrite) throw new Error('stdin restoration differs')
              child.removeListener('exit', onExit)
              child.removeListener('close', onClose)
              child.stdout.removeListener('data', onData)
              if (onStderr) {
                child.stderr.removeListener('data', onStderr)
                worker.stderrRestored = true
              }
              worker.writeRestored = true
              worker.stdoutRestored = true
            })
          }
        } catch (error) {
          fault(error)
        }
        return child
      }
      state.spawnWrapper = spawnWrapper
      cp.spawn = spawnWrapper
      process.getBuiltinModule('module').syncBuiltinESMExports()
      if (ownership.required) {
        if (ownership.previous && absent(ownership.previous.path)) {
          throw new Error('Previous lease disappeared before the Ready observer was installed')
        }
        const children = fs.readFileSync(`/proc/self/task/${process.pid}/children`, 'utf8').trim()
        for (const pid of children ? children.split(/\s+/) : []) {
          try {
            const argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')
            if (
              argv.includes('imagegen_worker.owned_inference') ||
              argv.includes('imagegen_worker.inference_main')
            ) {
              throw new Error('An inference child predates the Main-death Ready observer')
            }
          } catch (error) {
            if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
          }
        }
      }
      const channels = [
        'projects:generate',
        'projects:cancel-current-generation',
        'projects:cancel-generation-job',
        'projects:retry-generation-job',
        'projects:resolve-recovery',
        'projects:accept-generation-candidates',
        'projects:save',
        'projects:open',
        'projects:close',
        'projects:undo',
        'projects:redo',
        'projects:update-generation-draft',
        'projects:update-regional-guidance',
        ...(ownership.img2img
          ? ['projects:import-raster-image', 'projects:update-raster-layer']
          : []),
        ...(ownership.dynamicPositive ? ['projects:edit-regional-guidance-mask'] : []),
        ...(ownership.loras
          ? ['projects:add-generation-lora', 'projects:remove-generation-lora']
          : []),
        ...(ownership.vae ? ['projects:set-generation-vae'] : []),
        ...(ownership.references
          ? [
              'projects:import-regional-guidance-reference-image',
              'projects:update-regional-guidance-reference-image',
            ]
          : []),
      ]
      for (const channel of channels) {
        const deadline = Date.now() + 15_000
        while (ownership.required && !ipcMain._invokeHandlers.has(channel) && Date.now() < deadline)
          await new Promise((resolve) => setTimeout(resolve, 10))
        const original = ipcMain._invokeHandlers.get(channel)
        if (!original) throw new Error(`Missing production IPC handler ${channel}`)
        const wrapper = async function (...args) {
          let record
          try {
            if (state.ipc.length >= 1024) throw new Error('IPC observation exceeds bound')
            record = {
              channel,
              args: structuredClone(args.slice(1)),
              originalCalls: 1,
              startedAt: new Date().toISOString(),
              finished: false,
              ...(ownership.progress
                ? {
                    startedOrder: ++state.order,
                    progressBeforeInvoke: structuredClone(state.progress.at(-1) ?? null),
                  }
                : {}),
            }
            state.ipc.push(record)
          } catch (error) {
            fault(error)
          }
          try {
            const pending = Reflect.apply(original, this, args)
            if (
              ownership.progress &&
              record &&
              ['projects:cancel-generation-job', 'projects:cancel-current-generation'].includes(
                channel,
              )
            )
              record.synchronousProgressAfterInvoke = structuredClone(state.progress.at(-1) ?? null)
            const result = await pending
            try {
              if (record) {
                record.ok = result?.ok ?? null
                record.response = structuredClone(result)
              }
            } catch (error) {
              fault(error)
            }
            return result
          } catch (error) {
            if (record) record.thrown = { name: error.name, message: error.message }
            throw error
          } finally {
            if (record) {
              record.finished = true
              record.finishedAt = new Date().toISOString()
              if (ownership.progress) record.finishedOrder = ++state.order
            }
          }
        }
        state.originals.set(channel, original)
        state.wrappers.set(channel, wrapper)
        ipcMain._invokeHandlers.set(channel, wrapper)
      }
    },
    {
      required: mainDeathProfile,
      progress: progressProfile,
      workerFault: workerFaultProfile,
      loras: globalLoraProfile,
      vae: vaeSelectionProfile,
      dynamicPositive: dynamicPositiveProfile,
      img2img: imageProfile,
      references: referenceImagesProfile,
      scratch: path.join(appDataRoot, 'scratch'),
      previous: previousTransport,
      controls: mainDeathControls,
    },
  )
}
async function observerSnapshot(restore = false) {
  return await application.evaluate(({ ipcMain }, restore) => {
    const state = globalThis.__regionalInstalledObserver
    if (!state) return { installed: false, workers: [], ipc: [], faults: [] }
    if (restore) {
      const cp = process.getBuiltinModule('child_process')
      if (cp.spawn !== state.spawnWrapper) throw new Error('Spawn observer ownership changed')
      Object.defineProperty(cp, 'spawn', state.spawnDescriptor)
      process.getBuiltinModule('module').syncBuiltinESMExports()
      for (const callback of state.restores) callback()
      for (const [channel, original] of state.originals) {
        if (ipcMain._invokeHandlers.get(channel) !== state.wrappers.get(channel))
          throw new Error(`IPC observer ownership changed: ${channel}`)
        ipcMain._invokeHandlers.set(channel, original)
        if (ipcMain._invokeHandlers.get(channel) !== original)
          throw new Error('IPC restore differs')
      }
      state.restored = cp.spawn === state.originalSpawn
    }
    return {
      installed: true,
      restored: state.restored ?? false,
      workers: state.workers,
      ipc: state.ipc,
      faults: state.faults,
      ...(state.progress ? { progress: state.progress, terminals: state.terminals } : {}),
    }
  }, restore)
}
function regionalWires(snapshot) {
  return snapshot.workers.flatMap((worker) =>
    worker.writes.flatMap((write) =>
      write.lines
        .filter(({ type }) => type === 'execute-current-canvas-regional')
        .map((wire) => ({ pid: worker.pid, ...wire })),
    ),
  )
}

async function installProgressDomObserver() {
  await window.evaluate(() => {
    if (globalThis.__regionalProgressDom) throw new Error('DOM observer already installed')
    const state = { records: [], faults: [], last: null }
    const observe = () => {
      try {
        const counters = [...document.querySelectorAll('[data-testid="generation-progress"]')]
          .filter((node) => node.getBoundingClientRect().width > 0)
          .map((node) => ({
            text: node.querySelector('span')?.textContent?.trim(),
            percentage: Number(
              node.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
            ),
            jobId: node.closest('[data-job-id]')?.getAttribute('data-job-id') ?? null,
            projectFooter: node.classList.contains('generation-footer-progress'),
          }))
        const value = {
          counters,
          cancelEnabled:
            document.querySelector('[aria-label="Cancel current generation"]')?.disabled === false,
        }
        const key = JSON.stringify(value)
        if (key === state.last) return
        if (state.records.length >= 2048) throw new Error('DOM progress observation exceeds bound')
        state.records.push({ at: new Date().toISOString(), ...value })
        state.last = key
      } catch (error) {
        state.faults.push(String(error.stack ?? error))
      }
    }
    state.observer = new MutationObserver(observe)
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    })
    globalThis.__regionalProgressDom = state
    observe()
  })
  progressDomInstalled = true
}
async function retainProgressDom(restore = false) {
  return await window.evaluate((restore) => {
    const state = globalThis.__regionalProgressDom
    if (!state) throw new Error('DOM progress observer missing')
    if (restore) state.observer.disconnect()
    return { records: state.records, faults: state.faults, restored: restore }
  }, restore)
}
async function progressProbe(project, row, minimumStep) {
  let evidence
  await expect
    .poll(
      async () => {
        const value = await api('getGenerationProgress'),
          running = await job(row.id)
        if (running.status === 'pending') return false
        assert.equal(
          running.status,
          'running',
          'Progress must be observed before terminal completion',
        )
        const current = value.current
        if (!current || current.jobId !== row.id || current.step < minimumStep) return false
        assert.equal(current.documentId, project.document.documentId)
        assert.equal(current.projectKey, project.id)
        assert.equal(current.statusSequence, running.status_sequence)
        assert.equal(current.totalSteps, progressTotal)
        assert.ok(
          current.step < progressTotal,
          'A genuine intermediate step is required before Cancel',
        )
        const dom = await retainProgressDom(),
          latest = dom.records.at(-1),
          wanted = `Denoising step ${current.step} of ${progressTotal}`,
          projectCounter = latest?.counters.find(
            (counter) => counter.projectFooter && counter.text === wanted,
          ),
          queueCounter = latest?.counters.find(
            (counter) => counter.jobId === row.id && counter.text === wanted,
          )
        assert.deepEqual(dom.faults, [])
        if (!projectCounter || !queueCounter) return false
        for (const counter of [projectCounter, queueCounter])
          assert.ok(Math.abs(counter.percentage - (current.step / progressTotal) * 100) < 1e-8)
        assert.equal(latest.cancelEnabled, true)
        evidence = {
          snapshot: value,
          row: running,
          projectCounter,
          queueCounter,
          observedAt: latest.at,
        }
        return true
      },
      { timeout: timeout(300_000), intervals: [50, 100, 200] },
    )
    .toBe(true)
  return evidence
}
async function progressBeforeCancel(project, row) {
  const first = await progressProbe(project, row, 5),
    before = await progressSql(),
    second = await progressProbe(project, row, first.snapshot.current.step + 1)
  assert.deepEqual(await progressSql(), before, 'Step events cannot mutate queue/receipt/seed rows')
  const observed = await observerSnapshot(),
    wires = regionalWires(observed)
  assert.deepEqual(observed.faults, [])
  const priorControlInLifetime = (globalTiProfile || imageProfile) && !vPredictionProfile
  assert.equal(wires.length, priorControlInLifetime ? 2 : 1)
  const wire = wires[priorControlInLifetime ? 1 : 0]
  assert.equal(wire.reportProgress, true)
  const worker = observed.workers.find(({ pid }) => pid === wire.pid)
  assert.ok(worker.ready.capabilities.includes('illustrious-regional-progress-v1'))
  report.progress = { beforeCancel: { first, second, sql: before, requestId: wire.requestId } }
  report.cancellationBoundary = workerFaultProfile
    ? `Worker-only SIGKILL follows two genuine native-path JSONL/Main/UI step observations >=5/${progressTotal}; no elapsed-time estimate or Cancel action.`
    : `Cancel follows two genuine native-path JSONL/Main/UI step observations >=5/${progressTotal}; no elapsed-time estimate.`
  check(
    workerFaultProfile
      ? 'Original scalar JSONL and Main snapshot reach existing Project/Queue counter and bar before worker-only fault'
      : 'Original scalar JSONL and Main snapshot reach existing Project/Queue counter and bar before Cancel',
    report.progress.beforeCancel,
  )
}
/** Developer fault only: reuse the Main-only pidfd pattern, validating the actual wire child. */
async function signalRegionalWorkerOnly(worker, wire) {
  assert.ok(workerFaultProfile && application && worker && wire.ownerMarker)
  const mainPid = application.process().pid,
    main = await readProcessIdentity(mainPid),
    child = await readProcessIdentity(worker.pid),
    expectedArgs = [
      '-I',
      '-m',
      'imagegen_worker.owned_inference',
      '--parent-pid',
      String(mainPid),
      '--scratch-base',
      path.join(appDataRoot, 'scratch'),
    ],
    owner = wire.ownerMarker.value,
    bootId = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
    canonicalPython = await realpath(pointer.pythonExecutable)
  assert.equal(wire.ownerMarker.capturedMainPid, mainPid)
  assert.equal(owner.bootId, bootId)
  assert.equal(owner.main.pid, mainPid)
  assert.equal(owner.main.startTicks, main.start)
  assert.equal(owner.worker.pid, worker.pid)
  assert.equal(owner.worker.startTicks, child.start)
  assert.equal(worker.identity.start, child.start)
  assert.equal(worker.executable, pointer.pythonExecutable)
  assert.deepEqual(worker.args, expectedArgs)
  assert.equal(await realpath(worker.executable), canonicalPython)
  assert.equal(child.group, main.group)
  assert.equal(nativeChecks[0].nativeIdentity.pid, mainPid)
  assert.equal(nativeChecks[0].nativeIdentity.start, main.start)
  const expected = { main, child, bootId, canonicalPython, argv: expectedArgs }
  report.workerFault = { before: expected, requestId: wire.requestId, signalRequested: false }
  checkpoint()
  const script = `import json,os,signal,sys
expected=json.loads(sys.argv[1]);main=expected['main'];child=expected['child']
assert main['pid']!=child['pid'] and main['pid']>1 and child['pid']>1
mainfd=os.pidfd_open(main['pid'],0);fd=os.pidfd_open(child['pid'],0)
def identity(pid):
 with open('/proc/'+str(pid)+'/stat') as stream: text=stream.read()
 fields=text[text.rfind(')')+2:].split()
 assert fields[0] not in ('Z','X'), 'Owner already exited'
 return {'start':fields[19],'ppid':int(fields[1])}
try:
 with open('/proc/sys/kernel/random/boot_id') as stream: assert stream.read().strip()==expected['bootId']
 assert identity(main['pid'])['start']==main['start'], 'Main birth changed'
 value=identity(child['pid'])
 assert value['start']==child['start'] and value['ppid']==main['pid'], 'Wire child or parent changed'
 for item in (main,child):
  with open('/proc/'+str(item['pid'])+'/cgroup') as stream: assert '0::'+item['group'] in stream.read().splitlines()
 with open('/proc/'+str(child['pid'])+'/cmdline','rb') as stream: argv=stream.read().decode().rstrip('\\0').split('\\0')
 assert argv[1:]==expected['argv'] and os.path.realpath(argv[0])==expected['canonicalPython'], 'Native module arguments changed'
 assert os.readlink('/proc/'+str(child['pid'])+'/exe')==expected['canonicalPython'], 'Native interpreter changed'
 signal.pidfd_send_signal(mainfd,0)
 signal.pidfd_send_signal(fd,signal.SIGKILL)
 signal.pidfd_send_signal(mainfd,0)
 print(json.dumps({'signalRequested':True,'pidfd':True,'pid':child['pid'],'start':child['start'],'mainPid':main['pid'],'mainStart':main['start'],'bootId':expected['bootId'],'signal':'SIGKILL','mainAliveAtSignal':True}))
finally:
 os.close(fd);os.close(mainfd)
`
  const result = await exec(
      '/usr/bin/python3',
      ['-I', '-B', '-c', script, JSON.stringify(expected)],
      {
        timeout: timeout(10_000),
        maxBuffer: 32 * 1024,
      },
    ),
    signaled = JSON.parse(result.stdout)
  assert.deepEqual(signaled, {
    signalRequested: true,
    pidfd: true,
    pid: child.pid,
    start: child.start,
    mainPid: main.pid,
    mainStart: main.start,
    bootId,
    signal: 'SIGKILL',
    mainAliveAtSignal: true,
  })
  report.workerFault.signalRequested = true
  report.workerFault.signal = signaled
  checkpoint()
}
async function faultRegionalWorker(project, row) {
  assert.ok(workerFaultProfile)
  await bounds('before-worker-only-fault')
  const before = await observerSnapshot(),
    wire = regionalWires(before)[0],
    worker = before.workers.find(({ pid }) => pid === wire.pid),
    gpu = await ownedGpuRows(worker.pid)
  assert.deepEqual(before.faults, [])
  assert.ok(worker.ready.capabilities.includes('linux-owned-inference-v1'))
  assert.equal(worker.exit, null)
  assert.equal(worker.close, null)
  assert.equal(gpu.length, 1)
  assert.ok(gpu[0].usedGpuMemoryMiB > 0)
  assert.equal(
    worker.frames.some(({ message }) => message.type === 'generation-done'),
    false,
  )
  await signalRegionalWorkerOnly(worker, wire)
  report.workerFault.gpuBefore = gpu
  await expect
    .poll(
      async () => {
        const current = await job(row.id)
        assert.notEqual(current.status, 'completed', 'Killed worker cannot publish a completion')
        assert.notEqual(current.status, 'canceled', 'Worker-only fault must not use cancellation')
        if (current.status !== 'failed') return false
        const observed = await observerSnapshot(),
          exited = observed.workers.find(({ pid }) => pid === worker.pid)
        assert.ok(
          exited.exit && exited.close,
          'First observed failed row follows physical worker close',
        )
        report.workerFault.firstFailedObservation = {
          at: new Date().toISOString(),
          row: current,
          exit: exited.exit,
          close: exited.close,
        }
        return true
      },
      { timeout: timeout(120_000), intervals: [20, 50, 100] },
    )
    .toBe(true)
  const failed = await job(row.id),
    observed = await observerSnapshot(),
    exited = observed.workers.find(({ pid }) => pid === worker.pid),
    previous = report.progress.beforeCancel.second.snapshot,
    cleared = observed.progress.find(
      ({ order, snapshot }) => order > exited.exit.order && snapshot.current === null,
    )
  assert.equal(failed.error_code, 'GENERATION_WORKER_FAILED')
  assert.equal(failed.frozen_payload_json, row.frozen_payload_json)
  assert.equal(exited.exit.signal, 'SIGKILL')
  assert.equal(exited.close.signal, 'SIGKILL')
  assert.ok(cleared && cleared.snapshot.revision > previous.revision)
  assert.ok(
    observed.progress
      .filter(({ order }) => order > cleared.order)
      .every(({ snapshot }) => snapshot.current?.jobId !== row.id),
  )
  assert.equal(
    exited.frames.some(({ message }) => message.type !== 'generation-progress'),
    false,
  )
  assert.equal((await api('getGenerationProgress')).current, null)
  await expect(window.getByTestId('generation-progress')).toHaveCount(0)
  await expect(queueRow(row.id)).toContainText('Failed')
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).phase, {
      timeout: timeout(120_000),
    })
    .toBe('idle')
  assert.deepEqual((await progressSql()).receipts, [])
  assert.deepEqual((await progressSql()).cursors, [])
  assert.deepEqual((await api('listGenerationResults', project.id)).candidates, [])
  await assertPathAbsent(wire.stagingRoot)
  await assertPathAbsent(wire.bundleJson.request.job.output.pngPath)
  await expect
    .poll(async () => await ownedGpuRows(worker.pid), { timeout: timeout(30_000) })
    .toEqual([])
  const sameMain = await readProcessIdentity(application.process().pid)
  assert.deepEqual(sameMain, report.workerFault.before.main)
  assert.equal(report.startupTrace.exit, null)
  assert.equal(await application.evaluate(() => process.pid), sameMain.pid)
  report.workerFault = {
    ...report.workerFault,
    cleared,
    failed,
    workerExit: exited.exit,
    workerClose: exited.close,
    sameMainAfterFailure: sameMain,
    gpuAfter: [],
    stageAbsent: true,
    outputAbsent: true,
    progressAfterFailure: await api('getGenerationProgress'),
    noCandidates: true,
    stderrTail: exited.stderrTail,
  }
  report.failureBoundary =
    'Only the verified original native wire child receives pidfd SIGKILL after completed-step/UI progress; normal production close/failure handling runs while the same Main stays alive. No Cancel or injected error.'
  check(
    'Verified worker-only SIGKILL fails the original job, clears progress and releases its native resources while Main survives',
    report.workerFault,
  )
}
async function progressAfterCancel(row) {
  assert.equal((await api('getGenerationProgress')).current, null)
  await expect(window.getByTestId('generation-progress')).toHaveCount(0)
  const observed = await observerSnapshot(),
    call = observed.ipc.find(({ channel }) =>
      ['projects:cancel-generation-job', 'projects:cancel-current-generation'].includes(channel),
    ),
    before = call?.progressBeforeInvoke,
    cleared = observed.progress.find(
      ({ order, snapshot }) => order > call.startedOrder && snapshot.current === null,
    ),
    wire =
      globalTiProfile || imageProfile
        ? regionalWires(observed).find(
            ({ requestId }) => requestId === report.progress.beforeCancel.requestId,
          )
        : regionalWires(observed)[0],
    worker = observed.workers.find(({ pid }) => pid === wire.pid)
  assert.ok(call?.finished && call.ok === true)
  assert.equal(before.snapshot.current.jobId, row.id)
  assert.ok(cleared && cleared.snapshot.revision > before.snapshot.revision)
  assert.ok(worker.exit && worker.close, 'Cancel acknowledgment follows physical child exit')
  assert.ok(cleared.order < worker.exit.order && worker.close.order < call.finishedOrder)
  assert.ok(
    observed.progress
      .filter(({ order }) => order > cleared.order)
      .every(({ snapshot }) => snapshot.current?.jobId !== row.id),
  )
  report.progress.cancel = { call, cleared, workerExit: worker.exit, workerClose: worker.close }
  check(
    'Cancel invalidates progress before child exit and acknowledgment, without stale-owner repaint',
    report.progress.cancel,
  )
}
async function verifyInstalledProgress(project, retryRow) {
  const observed = await observerSnapshot(),
    wires = regionalWires(observed),
    framesFor = (id) =>
      observed.workers
        .flatMap(({ frames }) => frames ?? [])
        .filter(({ message }) => message.requestId === id),
    firstFrames = framesFor(wires[imageProfile ? 1 : 0].requestId),
    retryFrames = framesFor(wires[imageProfile ? 2 : 1].requestId)
  assert.deepEqual(observed.faults, [])
  assert.equal(wires.length, imageProfile ? 3 : 2)
  assert.notEqual(wires[imageProfile ? 1 : 0].requestId, wires[imageProfile ? 2 : 1].requestId)
  for (const wire of wires) assert.equal(wire.reportProgress, true)
  const numeric = (frames) => frames.filter(({ message }) => message.type === 'generation-progress')
  const first = numeric(firstFrames),
    retry = numeric(retryFrames)
  assert.ok(first.length >= 5 && first.length < progressTotal)
  assert.deepEqual(
    first.map(({ message }) => message.step),
    Array.from({ length: first.length }, (_, index) => index + 1),
  )
  assert.deepEqual(
    retry.map(({ message }) => message.step),
    Array.from({ length: progressTotal }, (_, index) => index + 1),
  )
  for (const frame of [...first, ...retry]) {
    assert.deepEqual(Object.keys(frame.message).sort(), [
      'protocolVersion',
      'requestId',
      'step',
      'totalSteps',
      'type',
    ])
    assert.equal(frame.message.protocolVersion, '1')
    assert.equal(frame.message.totalSteps, progressTotal)
  }
  assert.equal(
    firstFrames.filter(({ message }) => message.type !== 'generation-progress').length,
    0,
  )
  const done = retryFrames.filter(({ message }) => message.type === 'generation-done')
  assert.equal(done.length, 1)
  assert.equal(retryFrames.filter(({ message }) => message.type === 'error').length, 0)
  assert.ok(
    retry.at(-1).order < done[0].order,
    `${progressTotal}/${progressTotal} is a denoising event before terminal PNG completion`,
  )
  const main = observed.progress.filter(({ snapshot }) => snapshot.current?.jobId === retryRow.id)
  assert.ok(
    observed.progress
      .filter(
        ({ order }) =>
          order >
          (workerFaultProfile
            ? report.workerFault.cleared.order
            : report.progress.cancel.cleared.order),
      )
      .every(({ snapshot }) => snapshot.current?.jobId !== report.retry.firstJobId),
  )
  assert.deepEqual(
    main.map(({ snapshot }) => snapshot.current.step),
    Array.from({ length: progressTotal }, (_, index) => index + 1),
  )
  for (const record of main) {
    assert.equal(record.originalCalls, 1)
    assert.equal(record.receiverMatches, true)
    assert.equal(record.snapshot.current.documentId, project.document.documentId)
    assert.equal(record.snapshot.current.projectKey, project.id)
    assert.equal(record.snapshot.current.totalSteps, progressTotal)
  }
  // The transparent stdout listener can see several lines before the production
  // parser consumes the same chunk. Compare wire order within that stream and
  // Main order within its stream; cross-listener callback order is not a fence.
  assert.ok(
    observed.progress.some(
      ({ order, snapshot }) => order > main.at(-1).order && snapshot.current === null,
    ),
  )
  assert.equal((await api('getGenerationProgress')).current, null)
  await expect(window.getByTestId('generation-progress')).toHaveCount(0)
  const dom = await retainProgressDom()
  assert.deepEqual(dom.faults, [])
  assert.ok(
    dom.records.some(
      ({ counters, cancelEnabled }) =>
        cancelEnabled &&
        counters.some(
          ({ text, projectFooter }) =>
            projectFooter && text === `Denoising step ${progressTotal} of ${progressTotal}`,
        ),
    ),
    'Final denoising counter remains Running before decode/publication',
  )
  report.progress.completed = {
    firstFrames,
    retryFrames,
    main,
    dom,
    final: await api('getGenerationProgress'),
  }
  check(
    `Frozen Retry restarts at1, reports original1..${progressTotal} selected steps before terminal PNG, then clears`,
    { originalFrameCount: retry.length, mainEventCount: main.length },
  )
}

async function api(method, ...args) {
  let timer
  try {
    const result = await Promise.race([
      window.evaluate(({ method, args }) => window.api.projects[method](...args), { method, args }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Read-only projects.${method} observation timed out`)),
          timeout(30_000),
        )
      }),
    ])
    assert.equal(result.ok, true, JSON.stringify(result))
    return result.value
  } finally {
    clearTimeout(timer)
  }
}
const canvas = () => window.getByRole('region', { name: 'Project Canvas', exact: true })
const tray = () => window.getByRole('region', { name: 'Generation Results', exact: true })
async function current(project) {
  const opened = await api('open', project.id)
  assert.equal(opened.kind, 'opened')
  return opened.tab
}
async function screenshot(name) {
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const file = path.join(evidenceRoot, `${name}.png`)
  await window.screenshot({ path: file, animations: 'disabled', timeout: timeout() })
  report.screenshots.push(file)
  checkpoint()
}
async function launch() {
  if (multipleLifetimesProfile) {
    assert.ok(!application, 'A previous native lifetime must finish physically before relaunch')
    assert.equal(nativeChecks.length, 0, 'Physical checks/watchdogs must be scoped to one lifetime')
    activeLifetime = {
      number: report.lifetimes.length + 1,
      startedAt: new Date().toISOString(),
      // Keep each PID/start watchdog within the original overall budget, never reset it at relaunch.
      deadlineSeconds: Math.max(
        1,
        Math.floor(
          timeout(
            (referenceImagesProfile
              ? Math.min(600, fixture.deadlineSeconds)
              : fixture.deadlineSeconds) * 1000,
          ) / 1000,
        ),
      ),
    }
    sampling = Promise.resolve()
    memoryGroups.clear()
  }
  const scratch = path.join(appDataRoot, 'scratch')
  const beforeScratch = await lstat(scratch).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (beforeScratch) {
    assert.ok(beforeScratch.isDirectory() && !beforeScratch.isSymbolicLink())
    assert.equal(await realpath(scratch), scratch)
  }
  report.startupScratch = {
    path: scratch,
    beforeMode: beforeScratch ? (beforeScratch.mode & 0o777).toString(8) : null,
    beforeInode: beforeScratch?.ino ?? null,
    harnessChangedPermissions: false,
  }
  checkpoint()
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
    XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
    XDG_CACHE_HOME: path.join(fixtureRoot, 'cache'),
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
  if (progressProfile) {
    const child = application.process(),
      trace = { pid: child.pid, stdout: '', stderr: '', exit: null }
    report.startupTrace = trace
    for (const name of ['stdout', 'stderr'])
      child[name]?.on('data', (bytes) => {
        trace[name] = (trace[name] + bytes.toString('utf8')).slice(-64 * 1024)
      })
    child.once('exit', (code, signal) => {
      trace.exit = { code, signal, at: new Date().toISOString() }
      checkpoint()
    })
  }
  const observing = mainDeathProfile ? installObservers() : null
  if (observing) void observing.catch(() => {})
  await bounds('launch')
  if (observing) await observing
  window = await isolateNativeSmokeWindow(application)
  const afterScratch = await lstat(scratch)
  assert.ok(afterScratch.isDirectory() && !afterScratch.isSymbolicLink())
  assert.equal(await realpath(scratch), scratch)
  assert.equal(
    afterScratch.mode & 0o777,
    0o700,
    'Production startup owner must establish private scratch; the harness never chmods it',
  )
  if (beforeScratch) assert.equal(afterScratch.ino, beforeScratch.ino)
  report.startupScratch.afterMode = (afterScratch.mode & 0o777).toString(8)
  report.startupScratch.afterInode = afterScratch.ino
  window.setDefaultTimeout(15_000)
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await application.evaluate(({ BrowserWindow, app }) => {
    if (app.getPath('userData') !== process.env.XDG_DATA_HOME + '/imagegen-studio')
      throw new Error('Electron uses unexpected appData')
    const native = BrowserWindow.getAllWindows()[0]
    native.setSize(1440, 900)
    native.focus()
  })
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toBeVisible()
  if (!mainDeathProfile) await installObservers()
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  await expect
    .poll(
      async () =>
        (await database.db.selectFrom('project_index').select('canonical_path').execute()).filter(
          ({ canonical_path }) => projects.some(({ file }) => file === canonical_path),
        ).length,
      { timeout: timeout() },
    )
    .toBe(3)
  const indexed = await database.db.selectFrom('project_index').selectAll().execute()
  for (const project of projects) {
    const record = indexed.find((entry) => entry.canonical_path === project.file)
    assert.ok(record, `Missing genuine indexed fixture ${project.title}`)
    assert.equal(record.file_health, 'ready')
    project.id = record.local_project_key
  }
  const runtime = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(runtime.ok, true)
  assert.equal(runtime.value.kind, 'ready')
  report.actualRuntime = runtime.value
  const catalog = await window.evaluate(() => window.api.models.getCatalog())
  assert.equal(catalog.ok, true)
  const actualVersion = catalog.value
    .find(({ id }) => id === model.resourceId)
    ?.versions.find(({ id }) => id === model.versionId)
  assert.equal(actualVersion?.fileStatus, 'ready')
  assert.equal(actualVersion.sha256, fixture.checkpoint.sha256)
  assert.equal(actualVersion.baseModelFamily, 'illustrious')
  report.actualCatalogVersion = actualVersion
  sampler = setInterval(() => {
    sampling = sampling
      .then(async () => {
        await bounds('periodic')
        checkpoint()
      })
      .catch((error) => {
        report.samplerError = String(error.stack ?? error)
        checkpoint()
      })
  }, 5000)
  check(
    'Real production Electron startup/default installed RuntimeManager and genuine catalog are ready',
  )
}
async function openProject(project) {
  const requestedTab = window.getByRole('tab', { name: project.title, exact: true })
  // Preparing an image already leaves its Project selected. Reopening it through Home
  // is unnecessary; retain ordinary cross-Project navigation and validate the real tab.
  const alreadySelected =
    imageCfgRescaleProfile &&
    (await requestedTab.count()) === 1 &&
    (await requestedTab.getAttribute('aria-selected')) === 'true'
  if (!alreadySelected) {
    const home = window.getByRole('tab', { name: 'Home', exact: true })
    await home.click()
    if (imageCfgRescaleProfile)
      await expect(home).toHaveAttribute('aria-selected', 'true', { timeout: timeout() })
    await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
    await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
  }
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toBeVisible({
    timeout: timeout(),
  })
  await expect(window.locator('input[aria-label="Images per click"]')).toBeEnabled({
    timeout: timeout(),
  })
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true', {
    timeout: timeout(),
  })
  const tab = await current(project)
  assert.equal(tab.documentId, project.document.documentId)
  return tab
}
async function sqlSnapshot(db = database.db) {
  return {
    queue: await db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('created_at')
      .orderBy('id')
      .execute(),
    receipts: await db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .orderBy('completion_order')
      .execute(),
    cursors: await db
      .selectFrom('generation_seed_cursor')
      .selectAll()
      .orderBy('local_project_key')
      .execute(),
  }
}
async function job(id) {
  return await database.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}
async function targetState(project) {
  const tab = await current(project)
  const signature = generationTargetSignature(tab)
  assert.ok(signature)
  return await api(
    'getGenerationTargetState',
    project.id,
    tab.documentId,
    digest(Buffer.from(signature)),
  )
}
async function targetRefusalControls() {
  // This profile admits all three alpha-derived modes; missing-peer/LaMa refusals
  // are covered by the bounded admission suite, without extra installed inference.
  if (outpaintProfile) return
  report.targetControls = []
  for (const project of projects.filter(
    ({ mode }) =>
      mode !== 'transparent' &&
      (!imageProfile || mode === (outpaintProfile ? 'opaque' : 'partial')),
  )) {
    await openProject(project)
    const count = window.locator('input[aria-label="Images per click"]')
    await count.fill('1')
    await count.press('Enter')
    await expect(count).toHaveValue('1')
    const before = await sqlSnapshot(),
      observed = await observerSnapshot()
    const state = await targetState(project)
    assert.equal(state.mode, project.mode === 'opaque' ? 'img2img' : 'outpaint')
    const reason =
      project.mode === 'partial'
        ? 'Regional Guidance does not support partially transparent Current Canvas input. Use an empty or fully opaque generation area.'
        : initializationProfile || globalVaeProfile
          ? 'Regional img2img requires Euler/Normal and Embedded FP16 VAE.'
          : 'Set Denoising Strength from 0 to 1 before generating with Regional Guidance from this raster input.'
    await expect(window.getByText(reason, { exact: true })).toBeVisible({ timeout: timeout() })
    const generate = window.getByRole('button', { name: 'Generate', exact: true })
    await expect(generate).toBeDisabled()
    // Real browser activation of a disabled control must not dispatch a Main command.
    await generate.evaluate((button) => button.click())
    await window.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
    assert.deepEqual(await sqlSnapshot(), before)
    assert.equal(
      (await observerSnapshot()).ipc.filter(({ channel }) => channel === 'projects:generate')
        .length,
      observed.ipc.filter(({ channel }) => channel === 'projects:generate').length,
    )
    assert.equal(regionalWires(await observerSnapshot()).length, regionalWires(observed).length)
    assert.equal(await hashFile(project.file), project.initialPackageSha256)
    report.targetControls.push({
      mode: project.mode,
      state,
      generateDisabled: true,
      noSqlReceiptCursorMutation: true,
      noGenerateIpc: true,
      noRegionalWire: true,
      packageSha256: project.initialPackageSha256,
    })
    await screenshot(`target-refusal-${project.mode}`)
    await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  }
  check(
    imageProfile
      ? 'Partial-alpha real-compositor input refuses before SQL/inference; its portable source remains unchanged'
      : 'Opaque and partially transparent real-compositor targets refuse in the UI before SQL/inference; portable sources unchanged',
  )
}

function assertFrozen(frozen, project, expectedSeed = 123) {
  const positive = globalPositiveInput(expectedSeed)
  assert.equal(frozen.schemaVersion, 1)
  assert.equal(frozen.kind, regionalOperation)
  if (imageProfile) {
    assert.equal(
      frozen.context.kind,
      outpaintProfile ? 'normal-outpaint-preparation' : 'normal-img2img-preparation',
    )
    assert.equal(frozen.context.sampling.denoisingStrength, imageStrength)
    assert.equal(frozen.workerJob.sampling.denoisingStrength, imageStrength)
    assert.equal(frozen.context.sampling.sampler, generationSampler)
    assert.equal(frozen.context.sampling.scheduler, generationScheduleLabel)
    assert.equal(frozen.context.sampling.invokeScheduler, generationScheduler)
    assert.equal(Object.hasOwn(frozen, 'initializationProfile'), false)
  }
  if (outpaintProfile) {
    assert.deepEqual(frozen.context.conditioning.policy, INVOKE_ALPHA_OUTPAINT_POLICY_V1)
    assert.deepEqual(frozen.context.conditioning.infillResource, LAMA_OUTPAINT_IDENTITY_V1)
    assert.deepEqual(frozen.context.conditioning.bbox, bbox)
    assert.deepEqual(frozen.outpaintInfill, {
      byteSize: outpaintInfill.byteSize,
      path: outpaintInfill.managedPath,
      role: outpaintInfill.role,
      sha256: outpaintInfill.sha256,
    })
    assert.equal(frozen.context.conditioning.sourceTarget.sha256, frozen.workerJob.target.sha256)
  }
  assert.equal(frozen.compositionProfile, 'invoke-canvas-v1')
  if (initializationProfile) {
    assert.equal(frozen.initializationProfile, initialization)
    assert.equal(frozen.context.sampling.sampler, generationSampler)
    assert.equal(frozen.context.sampling.scheduler, generationScheduleLabel)
    assert.equal(frozen.context.sampling.invokeScheduler, generationScheduler)
  }
  assert.equal(frozen.context.documentId, project.document.documentId)
  assert.deepEqual(frozen.context.bbox, bbox)
  assert.equal(frozen.context.prompts.positive, positive.text)
  assert.equal(frozen.context.prompts.negative, globalNegativePrompt)
  if (dynamicPositiveProfile) {
    assert.equal(frozen.context.sampling.seedBehavior, 'per-prompt')
    assert.deepEqual(frozen.workerJob.prompts, {
      positive: positive.text,
      negative: globalNegativePrompt,
    })
    assert.equal(/[{}]/.test(frozen.context.prompts.positive), false)
    assert.equal(frozen.context.prompts.positive.includes('unused ordinary detail'), false)
  }
  assert.equal(frozen.workerJob.checkpoint.sha256, fixture.checkpoint.sha256)
  assert.equal(frozen.workerJob.checkpoint.predictionType, predictionType)
  if (vPredictionProfile) {
    assert.equal(frozen.context.model.reference.predictionType, 'v_prediction')
    assert.equal(frozen.context.vae, null)
    assert.equal(frozen.context.vaePrecision, 'FP32')
    assert.deepEqual(frozen.context.sampling.noiseProfile, policy)
  }
  assert.equal(frozen.context.model.managedPath, fixture.checkpoint.path)
  assert.equal(frozen.workerJob.sampling.steps, generationSteps)
  assert.equal(frozen.workerJob.sampling.seed, expectedSeed)
  assert.equal(frozen.workerJob.sampling.cfgScale, 5)
  if (imageCfgRescaleProfile) {
    assert.equal(frozen.context.sampling.cfgRescale, generationCfgRescale)
    assert.equal(frozen.workerJob.sampling.cfgRescale, generationCfgRescale)
  }
  assert.equal(frozen.workerJob.sampling.scheduler, generationScheduler)
  assert.deepEqual(frozen.workerJob.sampling.noiseProfile, policy)
  if (vaeSelectionProfile) {
    assert.deepEqual(frozen.context.vae, {
      byteSize: globalVae.A.byteSize,
      managedPath: globalVae.A.managedPath,
      reference: selectedVaeReference(),
    })
    assert.equal(frozen.context.vaePrecision, 'FP32')
    assert.deepEqual(frozen.workerJob.vae, selectedVaeWire())
    assert.equal(frozen.workerJob.vaePrecision, 'FP32')
    assert.notEqual(
      frozen.context.vae.reference.localVersionId,
      globalVae.B.reference.localVersionId,
    )
  } else {
    assert.equal(frozen.workerJob.vaePrecision, vPredictionProfile ? 'FP32' : 'FP16')
    assert.equal(frozen.workerJob.vae, null)
  }
  if (globalLoraProfile) {
    assert.deepEqual(frozen.context.loraStack, configuredGlobalLoraStack())
    assert.deepEqual(frozen.context.loras, resolvedGlobalLoras())
    assert.deepEqual(frozen.workerJob.loras, globalLoraWireStack())
    assert.equal(frozen.context.loraStack.length, 4)
    assert.equal(frozen.context.loras.length, 3)
  } else assert.equal((frozen.workerJob.loras ?? []).length, 0)
  assert.equal(frozen.workerJob.target.width, side)
  assert.equal(frozen.workerJob.target.height, side)
  assert.equal(frozen.workerJob.target.iccSha256, IGS_SRGB_ICC_SHA256)
}
async function captureFrozen(row, project, expectedSeed = 123) {
  const positive = globalPositiveInput(expectedSeed)
  assert.equal(row.operation, regionalOperation)
  const frozen = JSON.parse(row.frozen_payload_json)
  assertFrozen(frozen, project, expectedSeed)
  const root = path.join(appDataRoot, 'generation-inputs', row.id)
  await directory(root)
  const targetBytes = await readFile(path.join(root, 'target.png'))
  assert.equal(digest(targetBytes), frozen.workerJob.target.sha256)
  assert.equal(targetBytes.length, frozen.workerJob.target.byteSize)
  const target = decodePng(targetBytes)
  assert.equal(target.width, side)
  assert.equal(target.height, side)
  assert.equal(target.iccSha256, IGS_SRGB_ICC_SHA256)
  if (!outpaintProfile)
    for (let i = 3; i < target.rgba.length; i += 4)
      assert.equal(target.rgba[i], imageProfile ? 255 : 0)
  else {
    const alpha = Buffer.from(Array.from({ length: side * side }, (_, i) => target.rgba[i * 4 + 3]))
    assert.equal(digest(alpha), frozen.context.conditioning.keepMask.sha256)
    assert.equal(alpha.length, frozen.context.conditioning.keepMask.byteSize)
    assert.ok(alpha.includes(0) && alpha.includes(127) && alpha.includes(255))
  }
  if (outpaintProfile) {
    // Pillow's identity bicubic RGBA transform passes through premultiplied
    // RGBa. Independently calculate both integer conversions for this single
    // unscaled, unrotated source; compare every channel, including exact alpha.
    const expected = Buffer.from(decodePng(await readFile(report.img2img.source.path)).rgba)
    for (let offset = 0; offset < expected.length; offset += 4) {
      const alpha = expected[offset + 3]
      for (let channel = 0; channel < 3; channel++) {
        expected[offset + channel] = alpha
          ? Math.floor((Math.floor((expected[offset + channel] * alpha + 127) / 255) * 255) / alpha)
          : 0
      }
    }
    assert.deepEqual(target.rgba, expected)
    report.img2img.compositeSourceOracle = {
      sourceRgbaSha256: report.img2img.source.rgbaSha256,
      expectedRgbaSha256: digest(expected),
      actualRgbaSha256: target.rgbaSha256,
      formula: 'floor(floor((channel * alpha + 127) / 255) * 255 / alpha); zero at alpha0',
      alphaExact: true,
      scope: 'single identity-affine source at opacity1; Pillow12.2 RGBA premultiplication',
    }
  } else if (imageProfile) assert.equal(target.rgbaSha256, report.img2img.source.rgbaSha256)
  const regionalBytes = await readFile(path.join(root, 'regional.json'))
  assert.equal(regionalBytes.length, frozen.regional.byteSize)
  assert.equal(digest(regionalBytes), frozen.regional.sha256)
  const regional = JSON.parse(regionalBytes.toString('utf8'))
  assert.equal(regional.compositionProfile, 'invoke-canvas-v1')
  if (initializationProfile) assert.equal(regional.initializationProfile, initialization)
  assert.equal(regional.layout, 'cfg-negative-first')
  assert.deepEqual(regional.globalNegativeCoverage, { kind: 'everywhere' })
  assert.deepEqual(regional.globalPositiveCoverage, { kind: 'everywhere' })
  assert.equal(regional.negativePooledSourceId, 'current-canvas')
  assert.equal(regional.positivePooledSourceId, 'current-canvas')
  assert.equal(regional.recipe.regions.length, 2)
  if (multipleResultsProfile) {
    assert.equal(regional.recipe.item.seed, expectedSeed)
    assert.deepEqual(regional.recipe.item.prompts, {
      positive: positive.text,
      negative: globalNegativePrompt,
    })
    assert.equal(
      regional.recipe.item.promptPairIndex,
      dynamicPositiveProfile ? expectedSeed - 123 : 0,
    )
    if (dynamicPositiveProfile) assert.equal(regional.recipe.item.iteration, 0)
  }
  assert.deepEqual(regional.recipe.bbox, bbox)
  assert.equal(regional.recipe.globalPrompts.positive.text, positive.text)
  const alphas = []
  for (const [index, region] of regional.recipe.regions.entries()) {
    assert.equal(region.regionId, project.document.regionalGuidance[index].id)
    assert.equal(region.positive.text, localPrompts[index])
    assert.equal(region.negative.prompt.text, globalTiProfile ? '<shared>' : '')
    const descriptor = region.coverage.alpha.$alpha8
    assert.match(descriptor.file, /^region-[01]\.alpha8$/)
    const bytes = await readFile(path.join(root, descriptor.file))
    assert.equal(bytes.length, side ** 2)
    assert.equal(bytes.length, descriptor.byteSize)
    assert.equal(digest(bytes), descriptor.sha256)
    assert.equal(descriptor.sha256, project.regionAlphas[index])
    // Independent authored geometry, not a recipe-derived expected mask.
    for (let i = 0; i < bytes.length; i++)
      assert.equal(bytes[i], i % side < side / 2 === (index === 0) ? 255 : 0)
    alphas.push(descriptor)
  }
  if (globalTiProfile) {
    assertGlobalEmbeddingRecipe(regional.recipe, expectedSeed)
    assert.deepEqual(frozen.context.embeddingRefs, {
      positive: authoredGlobalPositiveRefs(),
      negative: [globalTiRef('B')],
    })
    assert.deepEqual(frozen.context.embeddings, globalTiPair(positive.key, 'B', positive.token))
    assert.deepEqual(frozen.workerJob.embeddings, globalTiWirePair(expectedSeed))
    await verifyGlobalEmbeddingFiles()
  }
  if (globalLoraProfile) await verifyGlobalLoraFiles()
  if (vaeSelectionProfile) await verifyGlobalVaeFiles()
  return {
    row,
    frozen,
    frozenPayloadSha256: digest(Buffer.from(row.frozen_payload_json)),
    regional,
    alphas,
    targetRgbaSha256: target.rgbaSha256,
    targetSha256: digest(targetBytes),
  }
}
async function openQueue() {
  await window.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
  await expect(window.getByRole('dialog', { name: 'Queue Manager', exact: true })).toBeVisible()
}
async function closeQueue() {
  await window.getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
}
const queueRow = (id) => window.locator(`[data-testid="queue-job-row"][data-job-id="${id}"]`)
async function save(project) {
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect
    .poll(async () => (await current(project)).dirty, { timeout: timeout(120_000) })
    .toBe(false)
}
async function prepareImageProject(project) {
  await openProject(project)
  const before = await current(project)
  assert.equal(before.layers.length, 0)
  assert.equal(await hashFile(report.img2img.source.path), report.img2img.source.sha256)
  // Only the OS chooser is controlled. The visible Import action, IPC and installed normalizer run.
  await application.evaluate(({ dialog }, selectedPath) => {
    if (globalThis.__regionalImageDialog) throw new Error('Image dialog observer already installed')
    globalThis.__regionalImageDialog = dialog.showOpenDialog
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] })
  }, report.img2img.source.path)
  try {
    await window.getByRole('button', { name: 'Import image as Raster Layer', exact: true }).click()
    await expect
      .poll(async () => (await current(project)).layers.length, { timeout: timeout(120_000) })
      .toBe(1)
  } finally {
    await application.evaluate(({ dialog }) => {
      dialog.showOpenDialog = globalThis.__regionalImageDialog
      delete globalThis.__regionalImageDialog
    })
  }
  const imported = await current(project),
    source = imported.layers[0]
  assert.deepEqual(imported.primaryBbox, bbox)
  assert.deepEqual(source.transform, {
    rotationDegrees: 0,
    scaleX: 1,
    scaleY: 1,
    x: bbox.x,
    y: bbox.y,
  })
  assert.equal(source.width, side)
  assert.equal(source.height, side)
  assert.equal(
    decodePng(await fetchPng(source.imageUrl)).rgbaSha256,
    report.img2img.source.rgbaSha256,
  )
  const strength = window.locator('input[aria-label="Denoising Strength"]')
  await expect(strength).toBeVisible({ timeout: timeout() })
  await strength.fill(String(imageStrength))
  await strength.press('Tab')
  await expect
    .poll(async () => (await current(project)).generationDraft.sampling.denoisingStrength)
    .toBe(imageStrength)
  if (imageCfgRescaleProfile) {
    assert.equal((await current(project)).generationDraft.cfgRescale, 0)
    await setCfgRescaleUi(project, generationCfgRescale)
  }
  if (imgSamplerProfile) {
    assert.equal((await current(project)).generationDraft.sampling.sampler, 'Euler')
    await window.locator('[aria-label="Sampler"]').click()
    await window.getByText(generationSampler, { exact: true }).last().click()
    if (imgDpmProfile) {
      await window.locator('[aria-label="Scheduler"]').click()
      await window.getByText('Karras', { exact: true }).last().click()
    }
    await expect
      .poll(async () => (await current(project)).generationDraft.sampling.sampler)
      .toBe(generationSampler)
    await expect
      .poll(async () => (await current(project)).generationDraft.sampling.scheduler)
      .toBe(generationScheduleLabel)
  }
  if (imgVaeProfile) {
    const initial = await current(project)
    assert.deepEqual(initial.generationDraft.vae, selectedVaeReference())
    assert.equal(initial.generationDraft.vaePrecision, 'FP32')
    // Select the saved exact version through the actual picker; Default remains B.
    await setSelectedVaeUi(project, null)
    await setSelectedVaeUi(project, 'A')
    await setVaePrecisionUi(project, 'Auto')
    await setVaePrecisionUi(project, 'FP32')
    report.imgVaeAuthoringBeforeGenerate ??= []
    report.imgVaeAuthoringBeforeGenerate.push({
      projectKey: project.id,
      initial: {
        vae: initial.generationDraft.vae,
        precision: initial.generationDraft.vaePrecision,
      },
      selected: selectedVaeReference(),
      precision: 'FP32',
      defaultVersionId: globalVae.B.reference.localVersionId,
      realPickerResetAndExactReselection: true,
      realPrecisionAutoThenFp32: true,
    })
  }
  assert.equal((await targetState(project)).mode, generationMode)
  await save(project)
  const saved = await readZip(project.file)
  project.document = saved.project
  project.initialPackageSha256 = await hashFile(project.file)
  project.sourceLayerId = source.id
  project.sourceLayerName = source.name
  report.img2img.imports ??= []
  report.img2img.imports.push({
    projectKey: project.id,
    sourceLayerId: source.id,
    sourceLayerName: source.name,
    packageSha256: project.initialPackageSha256,
    rgbaSha256: report.img2img.source.rgbaSha256,
    actualImportAndNormalization: true,
  })
  await canvas().getByRole('button', { name: 'Fit View', exact: true }).click()
  await screenshot(`opaque-import-${project.mode}`)
}
async function imageHealthyControl(project) {
  await prepareImageProject(project)
  const state = await targetState(project),
    advisory = await api('getGenerationState', project.id)
  assert.equal(state.mode, generationMode)
  assert.equal(advisory.regionalImg2ImgSupported, true)
  if (outpaintProfile) {
    assert.equal(advisory.regionalOutpaintSupported, true)
    assert.equal(advisory.outpaintSupported, true)
  }
  if (imgVaeProfile) {
    assert.equal(advisory.regionalImg2ImgVaeSupported, true)
    assert.equal(advisory.regionalVaeSupported, true)
    assert.equal(advisory.externalVaeSupported, true)
    assert.equal(advisory.vaePrecisionSupported, true)
    assert.deepEqual((await current(project)).generationDraft.vae, selectedVaeReference())
    assert.equal((await current(project)).generationDraft.vaePrecision, 'FP32')
  }
  if (imgSamplerProfile)
    assert.equal(
      advisory[
        imgDpmProfile ? 'regionalImg2ImgDpmpp2mSupported' : 'regionalImg2ImgEulerASupported'
      ],
      true,
    )
  if (imageCfgRescaleProfile) {
    assert.equal(
      advisory[
        outpaintProfile ? 'regionalOutpaintSupported' : 'regionalImg2ImgCfgRescaleSupported'
      ],
      true,
    )
    assert.equal(advisory.regionalCfgRescaleSupported, true)
    assert.equal((await current(project)).generationDraft.cfgRescale, generationCfgRescale)
  }
  report.img2img.beforeFirstGenerate = {
    target: state,
    advisory,
    layers: (await current(project)).layers.map(({ id, name, opacity, transform }) => ({
      id,
      name,
      opacity,
      transform,
    })),
  }
  // This screenshot also records the old built UI refusal before ROOT rebuilds the fix.
  await screenshot('opaque-before-generate')
  const count = window.locator('input[aria-label="Images per click"]')
  await count.fill('1')
  await count.press('Enter')
  await expect(count).toHaveValue('1')
  const generate = window.getByRole('button', { name: 'Generate', exact: true })
  await expect(generate).toBeEnabled({ timeout: timeout(120_000) })
  await targetRefusalControls()
  await openProject(project)
  await generate.click()
  const own = async () =>
    (await sqlSnapshot()).queue.filter(({ local_project_key }) => local_project_key === project.id)
  await expect.poll(async () => (await own()).length, { timeout: timeout(180_000) }).toBe(1)
  const row = (await own())[0]
  await expect
    .poll(async () => (await job(row.id)).status, { timeout: timeout(180_000) })
    .toBe('running')
  const captured = await captureFrozen(await job(row.id), project)
  await expect
    .poll(
      async () => {
        const value = await job(row.id)
        if (value.status === 'failed' || value.status === 'canceled')
          assert.fail(`Healthy IMG control failed: ${value.error_code}: ${value.error_message}`)
        return value.status
      },
      { timeout: timeout(300_000), intervals: [100, 250, 500] },
    )
    .toBe('completed')
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).phase, { timeout: timeout() })
    .toBe('idle')
  const results = await api('listGenerationResults', project.id)
  assert.equal(results.candidates.length, 1)
  const candidate = results.candidates[0],
    bytes = await fetchPng(candidate.imageUrl),
    decoded = decodePng(bytes),
    sql = await sqlSnapshot()
  const receipt = sql.receipts.find(({ queue_item_id }) => queue_item_id === row.id)
  assert.ok(receipt && receipt.status === 'completed')
  assert.equal(candidate.queueItemId, row.id)
  assert.equal(candidate.actualSeed, 123)
  assert.equal(candidate.sourceDocumentMismatch, false)
  assert.deepEqual(candidate.bbox, bbox)
  assert.equal(receipt.image_sha256, digest(bytes))
  assert.equal(decoded.width, side)
  assert.equal(decoded.height, side)
  assert.equal(decoded.channels, outpaintProfile ? 4 : 3)
  assert.equal(decoded.iccSha256, IGS_SRGB_ICC_SHA256)
  const browserPixels = await assertBrowserPixels(candidate.imageUrl, decoded)
  const contribution = outpaintProfile ? await assertInstalledOutpaint(captured, bytes) : null
  await writeFile(path.join(evidenceRoot, 'img-control.png'), bytes, { flag: 'wx', mode: 0o600 })
  const observed = await observerSnapshot(),
    wires = regionalWires(observed)
  assert.equal(wires.length, 1)
  const wire = wires[0]
  const frames = observed.workers
    .flatMap(({ frames }) => frames ?? [])
    .filter(({ message }) => message.requestId === wire.requestId)
  const progress = frames.filter(({ message }) => message.type === 'generation-progress')
  assert.deepEqual(
    progress.map(({ message }) => message.step),
    Array.from({ length: progressTotal }, (_, i) => i + 1),
  )
  for (const { message } of progress) assert.equal(message.totalSteps, progressTotal)
  assert.equal(frames.filter(({ message }) => message.type === 'generation-done').length, 1)
  assert.equal(
    await hashFile(project.file),
    project.initialPackageSha256,
    'Healthy completion does not save or Add',
  )
  assert.equal((await current(project)).layers.length, 1)
  report.img2img.control = {
    projectKey: project.id,
    row: await job(row.id),
    receipt,
    candidate,
    captured,
    pngSha256: digest(bytes),
    rgbaSha256: decoded.rgbaSha256,
    byteSize: bytes.length,
    frames,
    ...(outpaintProfile ? { contribution, browserPixels } : {}),
  }
  await tray().getByRole('button', { name: 'Preview candidate 1', exact: true }).click()
  await expect(
    tray().getByRole('button', { name: 'Preview candidate 1', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await observeCanvas(
    'img-healthy-control',
    decoded,
    candidate.imageUrl,
    outpaintProfile ? { imageUrl: (await current(project)).layers[0].imageUrl, opacity: 1 } : null,
  )
  check(
    outpaintProfile
      ? 'Actual mixed-alpha UI Generate/default RuntimeManager completes independent16-step control, verified RGBA contribution and protected-source composition without implicit Add/Save'
      : 'Actual opaque UI Generate/default RuntimeManager completes independent16-step control and a signed PNG without implicit Add/Save',
  )
}
async function editImageCurrentUi(project) {
  const source = (await current(project)).layers[0]
  await window.getByRole('button', { name: `Select ${source.name}`, exact: true }).click()
  const opacity = window.locator('input[aria-label="Layer opacity"]')
  await opacity.fill('75')
  await opacity.press('Tab')
  await expect.poll(async () => (await current(project)).layers[0].opacity).toBe(0.75)
  const global = window.getByRole('textbox', { name: 'Positive prompt', exact: true })
  await global.fill('later ordinary image authoring')
  const region = project.document.regionalGuidance[0]
  const regionalInput = window
    .locator(`[data-regional-guidance-id="${region.id}"]`)
    .getByRole('textbox', { name: 'Regional prompt', exact: true })
  if (imageCfgRescaleProfile) {
    // Global draft synchronization intentionally blocks regional prompt input.
    // Observe its acknowledgement and actual editor readiness before the next edit.
    await global.press('Tab')
    await expect
      .poll(async () => (await current(project)).generationDraft.positivePrompt.text, {
        timeout: timeout(),
      })
      .toBe('later ordinary image authoring')
    await expect(regionalInput).toBeEnabled({ timeout: timeout() })
    await regionalInput.fill('later blue teapot image authoring')
    await regionalInput.press('Tab')
    await expect
      .poll(async () => (await current(project)).regionalGuidance[0].prompts.positive.text, {
        timeout: timeout(),
      })
      .toBe('later blue teapot image authoring')
  } else {
    await regionalInput.fill('later blue teapot image authoring')
    await global.press('Tab')
  }
  for (const item of project.document.regionalGuidance)
    await window
      .locator(`[data-regional-guidance-id="${item.id}"]`)
      .getByRole('button', { name: `Hide ${item.name}`, exact: true })
      .click()
  for (const [label, value] of [
    ['Steps', '2'],
    ['Generation seed', '124'],
    ['Denoising Strength', '0.8'],
  ]) {
    const input = window.locator(`input[aria-label="${label}"]`)
    await input.fill(value)
    await input.press('Tab')
  }
  if (imgSamplerProfile) {
    await window.locator('[aria-label="Sampler"]').click()
    await window.getByText('Euler', { exact: true }).last().click()
    await expect
      .poll(async () => (await current(project)).generationDraft.sampling.sampler)
      .toBe('Euler')
  }
  if (imageCfgRescaleProfile) await setCfgRescaleUi(project, 0.2)
  if (imgVaeProfile) {
    await setSelectedVaeUi(project, null)
    await setVaePrecisionUi(project, 'FP16')
  }
  await expect
    .poll(async () => {
      const value = await current(project)
      return {
        opacity: value.layers[0].opacity,
        global: value.generationDraft.positivePrompt.text,
        regional: value.regionalGuidance[0].prompts.positive.text,
        strength: value.generationDraft.sampling.denoisingStrength,
        steps: value.generationDraft.sampling.steps,
        seed: value.generationDraft.seed,
        enabled: value.regionalGuidance.map(({ enabled }) => enabled),
        ...(imageCfgRescaleProfile ? { cfgRescale: value.generationDraft.cfgRescale } : {}),
        ...(imgSamplerProfile ? { sampler: value.generationDraft.sampling.sampler } : {}),
        ...(imgVaeProfile
          ? { vae: value.generationDraft.vae, vaePrecision: value.generationDraft.vaePrecision }
          : {}),
      }
    })
    .toEqual({
      opacity: 0.75,
      global: 'later ordinary image authoring',
      regional: 'later blue teapot image authoring',
      strength: 0.8,
      steps: 2,
      seed: { policy: 'fixed', value: 124 },
      enabled: [false, false],
      ...(imageCfgRescaleProfile ? { cfgRescale: 0.2 } : {}),
      ...(imgSamplerProfile ? { sampler: 'Euler' } : {}),
      ...(imgVaeProfile ? { vae: null, vaePrecision: 'FP16' } : {}),
    })
  const target = await targetState(project)
  assert.equal(
    target.mode,
    'outpaint',
    'Actual changed Raster opacity changes the composed source alpha',
  )
  report.img2img.editedSource = {
    id: source.id,
    opacity: 0.75,
    originalOpacity: 1,
    target,
    noNewGeneration: true,
  }
}
// The V profile reuses the same real UI, queue, observer, PNG and Results owners.
// Three clean native lifetimes keep the healthy witness independent from the
// canceled request and establish a genuine restart before frozen Retry.
async function closeVPredictionLifetime(label) {
  await closeNative(label)
  assert.equal(report.nativeClosures.at(-1).confirmed, true)
  assert.equal(report.nativeClosures.at(-1).processExitCode, 0)
  nativeChecks.length = 0
  memoryGroups.clear()
}
function assertVPredictionWire(observed, expectedCount = 1) {
  assert.deepEqual(observed.faults, [])
  const wires = regionalWires(observed)
  assert.equal(
    wires.length,
    expectedCount,
    'Every V lifetime has exactly one actual native request',
  )
  for (const wire of wires) {
    const ready = observed.workers.find(({ pid }) => pid === wire.pid)?.ready
    assert.equal(ready?.workerVersion, '0.14.0')
    for (const cap of [
      'illustrious-regional-invoke-v1',
      'illustrious-regional-v-prediction-v1',
      'illustrious-regional-vae-v1',
      'illustrious-regional-progress-v1',
      ...(vPredictionSamplingProfile
        ? [
            'illustrious-regional-v-prediction-sampling-v1',
            ...(vPredictionEulerAProfile
              ? ['illustrious-regional-invoke-init-v1']
              : ['illustrious-regional-dpmpp-2m-v1', 'illustrious-regional-img2img-dpmpp-2m-v1']),
          ]
        : []),
      ...(vPredictionImageProfile
        ? [
            'illustrious-regional-v-prediction-image-v1',
            'illustrious-regional-img2img-v1',
            'illustrious-regional-img2img-vae-v1',
            'illustrious-img2img',
            'illustrious-vae-precision',
            ...(outpaintProfile
              ? ['illustrious-outpaint', 'illustrious-regional-outpaint-v1']
              : []),
          ]
        : []),
    ])
      assert.ok(ready.capabilities.includes(cap))
    const bundle = wire.bundleJson
    assert.equal(bundle.request.type, generationRequestType)
    assert.equal(bundle.request.job.checkpoint.predictionType, 'v_prediction')
    assert.equal(bundle.request.job.checkpoint.sha256, fixture.checkpoint.sha256)
    assert.equal(bundle.request.job.vae, null)
    assert.equal(bundle.request.job.vaePrecision, 'FP32')
    assert.deepEqual(bundle.request.job.loras ?? [], [])
    assert.deepEqual(bundle.request.job.sampling.noiseProfile, policy)
    assert.equal(bundle.request.job.sampling.scheduler, generationScheduler)
    assert.equal(bundle.request.job.sampling.steps, 30)
    assert.equal(bundle.request.job.sampling.seed, 123)
    assert.equal(bundle.request.job.sampling.cfgScale, 5)
    assert.equal(bundle.request.job.sampling.cfgRescale ?? 0, 0)
    if (vPredictionImageProfile) {
      assert.equal(bundle.request.job.sampling.denoisingStrength, imageStrength)
      assert.equal(bundle.request.job.target.width, side)
      assert.equal(bundle.request.job.target.height, side)
    }
    assert.equal(bundle.compositionProfile, 'invoke-canvas-v1')
    if (initializationProfile) assert.equal(bundle.initializationProfile, initialization)
    else assert.equal(Object.hasOwn(bundle, 'initializationProfile'), false)
    assert.deepEqual(bundle.recipe.globalPrompts.positive.embeddingRefs, [])
    assert.deepEqual(bundle.recipe.globalPrompts.negative.embeddingRefs, [])
    for (const region of bundle.recipe.regions) {
      assert.deepEqual(region.positive.embeddingRefs, [])
      assert.deepEqual(region.negative.prompt.embeddingRefs, [])
    }
    assert.equal(bundle.layout, 'cfg-negative-first')
    assert.deepEqual(bundle.globalPositiveCoverage, { kind: 'everywhere' })
    assert.deepEqual(bundle.globalNegativeCoverage, { kind: 'everywhere' })
    assert.equal(bundle.positivePooledSourceId, 'current-canvas')
    assert.equal(bundle.negativePooledSourceId, 'current-canvas')
    assert.equal(wire.reportProgress, true)
    assert.equal(
      observed.workers
        .flatMap(({ writes }) => writes.flatMap(({ lines }) => lines))
        .filter(({ type }) =>
          [
            'generate-illustrious-txt2img',
            'generate-illustrious-img2img',
            'generate-illustrious-outpaint',
          ].includes(type),
        ).length,
      0,
      'An ordinary request cannot replace regional execution',
    )
  }
  return wires[0]
}
function assertVPredictionCompletion(observed, wire) {
  const frames = observed.workers
    .flatMap(({ frames }) => frames ?? [])
    .filter(({ message }) => message.requestId === wire.requestId)
  const progress = frames.filter(({ message }) => message.type === 'generation-progress')
  assert.deepEqual(
    progress.map(({ message }) => message.step),
    Array.from({ length: progressTotal }, (_, i) => i + 1),
  )
  assert.ok(progress.every(({ message }) => message.totalSteps === progressTotal))
  const done = frames.filter(({ message }) => message.type === 'generation-done')
  assert.equal(done.length, 1)
  assert.equal(frames.filter(({ message }) => message.type === 'error').length, 0)
  assert.ok(progress.at(-1).order < done[0].order)
  return frames
}
function assertVPredictionImageSource(wire, captured) {
  if (!vPredictionImageProfile) return
  const target = wire.bundleJson.request.job.target
  for (const key of ['width', 'height', 'byteSize', 'iccSha256', 'sha256'])
    assert.equal(target[key], captured.frozen.workerJob.target[key])
  assert.equal(target.sha256, captured.targetSha256)
  assert.equal(
    wire.bundleJson.request.job.sampling.denoisingStrength,
    captured.frozen.context.sampling.denoisingStrength,
  )
  assert.equal(wire.bundleJson.request.job.checkpoint.path, fixture.checkpoint.path)
  assert.deepEqual(wire.bundleJson.request.job.checkpoint, captured.frozen.workerJob.checkpoint)
  if (outpaintProfile)
    assert.equal(target.sha256, captured.frozen.context.conditioning.sourceTarget.sha256)
}
async function waitVPredictionCompletion(project, row) {
  await expect
    .poll(
      async () => {
        const value = await job(row.id)
        assert.ok(
          !['failed', 'canceled'].includes(value.status),
          `${value.error_code}: ${value.error_message}`,
        )
        return value.status
      },
      { timeout: timeout(300_000), intervals: [100, 250, 500] },
    )
    .toBe('completed')
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).phase, { timeout: timeout() })
    .toBe('idle')
  return await job(row.id)
}
async function setVPredictionSamplingUi(project, original) {
  assert.ok(vPredictionSamplingProfile)
  const before = structuredClone((await current(project)).generationDraft.sampling)
  const sampler = original ? generationSampler : 'Euler'
  const scheduler = original ? generationScheduleLabel : 'Normal'
  assert.equal(before.sampler, original ? 'Euler' : generationSampler)
  // Use the native keyboard opener so an already focused picker cannot toggle shut.
  await window.locator('[aria-label="Sampler"] [tabindex="0"]').focus()
  await window.keyboard.press('Escape')
  await window.keyboard.press('ArrowDown')
  await window.getByText(sampler, { exact: true }).last().click()
  await expect
    .poll(async () => (await current(project)).generationDraft.sampling.sampler)
    .toBe(sampler)
  if ((await current(project)).generationDraft.sampling.scheduler !== scheduler) {
    await window.locator('[aria-label="Scheduler"] [tabindex="0"]').focus()
    await window.keyboard.press('Escape')
    await window.keyboard.press('ArrowDown')
    await window.getByText(scheduler, { exact: true }).last().click()
  }
  await expect
    .poll(async () => (await current(project)).generationDraft.sampling.scheduler)
    .toBe(scheduler)
  report.vPrediction.sampling.uiChanges.push({
    projectKey: project.id,
    original,
    before,
    after: structuredClone((await current(project)).generationDraft.sampling),
    normalUi: true,
    noInjectedRecipe: true,
  })
}
async function generateVPredictionControlCancelRetry(project) {
  const control = projects.find(({ mode }) => mode === 'v-control')
  assert.ok(control && report.lifetimes.length === 0)
  if (vPredictionImageProfile) await prepareImageProject(control)
  else await openProject(control)
  await setVaePrecisionUi(control, 'Auto')
  await setVaePrecisionUi(control, 'FP32')
  if (vPredictionSamplingProfile) await setVPredictionSamplingUi(control, true)
  await save(control)
  control.initialPackageSha256 = await hashFile(control.file)
  await installProgressDomObserver()
  const generate = () => window.getByRole('button', { name: 'Generate', exact: true })
  const ownRows = async (owner) =>
    (await sqlSnapshot()).queue.filter(({ local_project_key }) => local_project_key === owner.id)
  const begin = async (owner) => {
    assert.equal((await targetState(owner)).mode, generationMode)
    const state = await api('getGenerationState', owner.id)
    assert.equal(state.regionalVPredictionSupported, true)
    assert.equal(state.regionalVaeSupported, true)
    if (vPredictionSamplingProfile) {
      assert.equal(state.regionalVPredictionSamplingSupported, true)
      if (vPredictionEulerAProfile) assert.equal(state.regionalInvokeInitializationSupported, true)
      else {
        assert.equal(state.regionalDpmSupported, true)
        assert.equal(state.regionalImg2ImgDpmpp2mSupported, true)
      }
      assert.equal((await current(owner)).generationDraft.sampling.sampler, generationSampler)
      assert.equal(
        (await current(owner)).generationDraft.sampling.scheduler,
        generationScheduleLabel,
      )
    }
    if (vPredictionImageProfile) {
      assert.equal(state.regionalVPredictionImageSupported, true)
      assert.equal(state.regionalImg2ImgSupported, true)
      assert.equal(state.regionalImg2ImgVaeSupported, true)
      assert.equal(state.vaePrecisionSupported, true)
      assert.equal((await current(owner)).generationDraft.sampling.denoisingStrength, imageStrength)
      if (outpaintProfile) {
        assert.equal(state.regionalOutpaintSupported, true)
        assert.equal(state.outpaintSupported, true)
      }
    }
    assert.equal((await current(owner)).generationDraft.vaePrecision, 'FP32')
    const count = window.locator('input[aria-label="Images per click"]')
    await count.fill('1')
    await count.press('Enter')
    await expect(generate()).toBeEnabled({ timeout: timeout(120_000) })
    assert.deepEqual(await ownRows(owner), [])
    await generate().click()
    await expect
      .poll(async () => (await ownRows(owner)).length, { timeout: timeout(180_000) })
      .toBe(1)
    const row = (await ownRows(owner))[0]
    await expect
      .poll(async () => (await job(row.id)).status, { timeout: timeout(180_000) })
      .toBe('running')
    return { row, captured: await captureFrozen(await job(row.id), owner) }
  }
  const healthy = await begin(control)
  healthy.row = await waitVPredictionCompletion(control, healthy.row)
  const result = await api('listGenerationResults', control.id)
  assert.equal(result.candidates.length, 1)
  const candidate = result.candidates[0]
  assert.equal(candidate.queueItemId, healthy.row.id)
  assert.equal(candidate.actualSeed, 123)
  assert.deepEqual(candidate.bbox, bbox)
  const bytes = await fetchPng(candidate.imageUrl),
    decoded = decodePng(bytes)
  assert.equal(decoded.width, side)
  assert.equal(decoded.height, side)
  assert.equal(decoded.channels, outpaintProfile ? 4 : 3)
  assert.equal(decoded.iccSha256, IGS_SRGB_ICC_SHA256)
  const receipt = (await sqlSnapshot()).receipts.find(
    ({ queue_item_id }) => queue_item_id === healthy.row.id,
  )
  assert.ok(receipt && receipt.status === 'completed')
  assert.equal(receipt.image_sha256, digest(bytes))
  assert.equal(receipt.image_byte_size, bytes.length)
  const browser = await assertBrowserPixels(candidate.imageUrl, decoded)
  const contribution = outpaintProfile
    ? await assertInstalledOutpaint(healthy.captured, bytes)
    : null
  await writeFile(path.join(evidenceRoot, 'v-prediction-control.png'), bytes, {
    flag: 'wx',
    mode: 0o600,
  })
  const healthyObserved = await observerSnapshot()
  const healthyWire = assertVPredictionWire(healthyObserved)
  assertVPredictionImageSource(healthyWire, healthy.captured)
  report.vPrediction.control = {
    ...healthy,
    projectKey: control.id,
    receipt,
    candidate,
    pngSha256: digest(bytes),
    rgbaSha256: decoded.rgbaSha256,
    byteSize: bytes.length,
    browser,
    ...(outpaintProfile ? { contribution } : {}),
    frames: assertVPredictionCompletion(healthyObserved, healthyWire),
  }
  if (vPredictionImageProfile) report.img2img.control = report.vPrediction.control
  assert.equal(await hashFile(control.file), control.initialPackageSha256)
  assert.equal((await current(control)).layers.length, vPredictionImageProfile ? 1 : 0)
  await tray().getByRole('button', { name: 'Preview candidate 1', exact: true }).click()
  await observeCanvas(
    'v-prediction-healthy-control',
    decoded,
    candidate.imageUrl,
    outpaintProfile ? { imageUrl: (await current(control)).layers[0].imageUrl, opacity: 1 } : null,
  )
  await window.getByRole('button', { name: `Close ${control.title}`, exact: true }).click()
  const discard = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect(discard).toBeVisible()
  await discard.getByRole('button', { name: 'Discard Candidates and Close', exact: true }).click()
  await expect(window.getByRole('tab', { name: control.title, exact: true })).toHaveCount(0)
  report.vPrediction.controlDiscardedExplicitly = true
  if (vPredictionImageProfile)
    report.img2img.controlClosedExplicitly = {
      projectKey: control.id,
      decision: 'Discard Candidates and Close',
      originalPngRetained: path.join(evidenceRoot, 'v-prediction-control.png'),
      noExtraGeneration: true,
    }
  await closeVPredictionLifetime('v-prediction-control-complete')
  await launch()
  if (vPredictionImageProfile) await prepareImageProject(project)
  else await openProject(project)
  if (vPredictionSamplingProfile) {
    await setVPredictionSamplingUi(project, true)
    await save(project)
    project.initialPackageSha256 = await hashFile(project.file)
  }
  await installProgressDomObserver()
  const first = await begin(project)
  await openQueue()
  await expect(queueRow(first.row.id)).toContainText('Running')
  await progressBeforeCancel(project, first.row)
  await queueRow(first.row.id).getByRole('button', { name: 'Cancel job', exact: true }).click()
  await expect
    .poll(async () => (await job(first.row.id)).status, { timeout: timeout(120_000) })
    .toBe('canceled')
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).phase, {
      timeout: timeout(120_000),
    })
    .toBe('idle')
  await progressAfterCancel(first.row)
  assert.equal((await progressSql()).receipts.length, 0)
  assert.equal((await progressSql()).cursors.length, 0)
  assert.equal(await hashFile(project.file), project.initialPackageSha256)
  const canceledObserved = await observerSnapshot()
  const canceledWire = assertVPredictionWire(canceledObserved)
  assertVPredictionImageSource(canceledWire, first.captured)
  assert.equal(
    canceledObserved.workers
      .flatMap(({ frames }) => frames ?? [])
      .filter(
        ({ message }) =>
          message.requestId === canceledWire.requestId && message.type === 'generation-done',
      ).length,
    0,
  )
  await closeQueue()
  for (const [label, value] of [
    ['Steps', '2'],
    ['Generation seed', '124'],
    ...(vPredictionImageProfile ? [['Denoising Strength', '0.8']] : []),
  ]) {
    const input = window.locator(`input[aria-label="${label}"]`)
    await input.fill(value)
    await input.press('Tab')
  }
  if (vPredictionSamplingProfile) await setVPredictionSamplingUi(project, false)
  const positive = window.getByRole('textbox', { name: 'Positive prompt', exact: true })
  await positive.fill('later ordinary authoring after canceled V prediction')
  await positive.press('Tab')
  await expect
    .poll(async () => (await current(project)).generationDraft.positivePrompt.text)
    .toBe('later ordinary authoring after canceled V prediction')
  const region = project.document.regionalGuidance[0]
  const regional = window
    .locator(`[data-regional-guidance-id="${region.id}"]`)
    .getByRole('textbox', { name: 'Regional prompt', exact: true })
  await expect(regional).toBeEnabled()
  await regional.fill('later blue teapot regional authoring')
  await regional.press('Tab')
  await expect
    .poll(async () => (await current(project)).regionalGuidance[0].prompts.positive.text)
    .toBe('later blue teapot regional authoring')
  for (const item of project.document.regionalGuidance)
    await window
      .locator(`[data-regional-guidance-id="${item.id}"]`)
      .getByRole('button', { name: `Hide ${item.name}`, exact: true })
      .click()
  if (vPredictionImageProfile) {
    const source = (await current(project)).layers[0]
    assert.equal(source.id, project.sourceLayerId)
    await window.getByRole('button', { name: `Hide ${source.name}`, exact: true }).click()
    await expect.poll(async () => (await current(project)).layers[0].visible).toBe(false)
    report.img2img.editedSource = {
      id: source.id,
      visible: false,
      originalVisible: true,
      opacity: source.opacity,
      target: await targetState(project),
      noNewGeneration: true,
    }
    assert.equal(report.img2img.editedSource.target.mode, 'txt2img')
  }
  await setVaePrecisionUi(project, 'FP16')
  const modelPicker = window.locator('[aria-label="Generation model"]')
  await modelPicker.hover()
  await modelPicker.locator('.n-base-clear').click()
  await expect.poll(async () => (await current(project)).generationDraft.model).toBe(null)
  await save(project)
  const edited = await current(project)
  assert.equal(edited.generationDraft.sampling.steps, 2)
  assert.deepEqual(edited.generationDraft.seed, { policy: 'fixed', value: 124 })
  assert.equal(edited.generationDraft.vaePrecision, 'FP16')
  if (vPredictionSamplingProfile) {
    assert.equal(edited.generationDraft.sampling.sampler, 'Euler')
    assert.equal(edited.generationDraft.sampling.scheduler, 'Normal')
  }
  assert.ok(edited.regionalGuidance.every(({ enabled }) => enabled === false))
  if (vPredictionImageProfile) {
    assert.equal(edited.generationDraft.sampling.denoisingStrength, 0.8)
    assert.equal(edited.layers.length, 1)
    assert.equal(edited.layers[0].visible, false)
    assert.equal(edited.layers[0].opacity, 1)
    assert.equal(
      decodePng(await fetchPng(edited.layers[0].imageUrl)).rgbaSha256,
      report.img2img.source.rgbaSha256,
    )
  }
  report.currentAuthoringAfterEdit = {
    generationDraft: edited.generationDraft,
    regionalGuidance: edited.regionalGuidance,
    packageSha256: await hashFile(project.file),
    ...(vPredictionImageProfile ? { sourceLayers: edited.layers } : {}),
  }
  await screenshot('v-prediction-edited-saved-before-restart')
  await closeVPredictionLifetime('v-prediction-canceled-edited-saved')
  await launch()
  await openProject(project)
  await installProgressDomObserver()
  assert.deepEqual((await current(project)).generationDraft, edited.generationDraft)
  assert.deepEqual(portableRegions(await current(project)), portableRegions(edited))
  if (vPredictionImageProfile) {
    const reopenedSource = (await current(project)).layers[0]
    assert.equal(reopenedSource.id, project.sourceLayerId)
    assert.equal(reopenedSource.visible, false)
    assert.equal(reopenedSource.opacity, 1)
    assert.equal(
      decodePng(await fetchPng(reopenedSource.imageUrl)).rgbaSha256,
      report.img2img.source.rgbaSha256,
    )
  }
  await expect(generate()).toBeDisabled()
  await openQueue()
  const retry = queueRow(first.row.id).getByRole('button', { name: 'Retry job', exact: true })
  await expect(retry).toBeEnabled({ timeout: timeout(120_000) })
  await retry.click()
  await expect
    .poll(async () => (await progressSql()).queue.length, { timeout: timeout(180_000) })
    .toBe(2)
  const retried = (await progressSql()).queue.find(({ id }) => id !== first.row.id)
  assert.equal(retried.frozen_payload_json, first.row.frozen_payload_json)
  const retryCaptured = await captureFrozen(retried, project)
  assert.equal(retryCaptured.frozenPayloadSha256, first.captured.frozenPayloadSha256)
  assert.equal(retryCaptured.targetSha256, first.captured.targetSha256)
  assert.deepEqual(retryCaptured.alphas, first.captured.alphas)
  report.retry = {
    firstJobId: first.row.id,
    retryJobId: retried.id,
    originalFrozen: first.captured,
    retryFrozen: retryCaptured,
  }
  await screenshot('v-prediction-explicit-frozen-retry')
  await closeQueue()
  const completed = await waitVPredictionCompletion(project, retried)
  const retryObserved = await observerSnapshot(),
    retryWire = assertVPredictionWire(retryObserved)
  assertVPredictionImageSource(retryWire, retryCaptured)
  report.vPrediction.retryFrames = assertVPredictionCompletion(retryObserved, retryWire)
  assert.equal(await hashFile(project.file), report.currentAuthoringAfterEdit.packageSha256)
  assert.deepEqual((await current(project)).generationDraft, edited.generationDraft)
  const mainSteps = retryObserved.progress.filter(
    ({ snapshot }) => snapshot.current?.jobId === retried.id,
  )
  assert.deepEqual(
    mainSteps.map(({ snapshot }) => snapshot.current.step),
    Array.from({ length: progressTotal }, (_, i) => i + 1),
  )
  assert.equal((await api('getGenerationProgress')).current, null)
  await expect(window.getByTestId('generation-progress')).toHaveCount(0)
  const own = await progressSql()
  assert.equal(own.receipts.length, 1)
  assert.equal(own.receipts[0].queue_item_id, retried.id)
  assert.equal(own.cursors.length, 1)
  assert.equal(own.cursors[0].actual_seed, 123)
  report.nativeAccounting = {
    regionalWireCount: 3,
    completedReceiptCount: 2,
    canceledSqlCount: 1,
    stepCounterQualified: true,
    nativeLifetimes: 3,
  }
  report.vPrediction.healthyAndCanceledInputs = {
    control: healthy.captured,
    canceled: first.captured,
    targetExact: healthy.captured.targetSha256 === first.captured.targetSha256,
    alphaExact: healthyWire.alpha.map(({ sha256 }) => sha256),
  }
  assert.equal(healthy.captured.targetSha256, first.captured.targetSha256)
  assert.deepEqual(
    healthyWire.alpha.map(({ sha256 }) => sha256),
    canceledWire.alpha.map(({ sha256 }) => sha256),
  )
  assert.deepEqual(
    retryWire.alpha.map(({ sha256 }) => sha256),
    canceledWire.alpha.map(({ sha256 }) => sha256),
  )
  check(
    `Exact V objective/${generationSampler}-${generationScheduleLabel}/leading/EmbeddedFP32 reaches three real regional ${generationMode} requests; healthy control and live Cancel precede clean restart and original frozen Retry without additional generation`,
  )
  return {
    row: completed,
    receipt: own.receipts[0],
    frozen: retryCaptured.frozen,
    frozenPayloadSha256: retryCaptured.frozenPayloadSha256,
  }
}

function referenceResourceWires() {
  return Object.fromEntries(
    Object.entries(referenceResources).map(([key, resource]) => [
      key,
      {
        byteSize: resource.byteSize,
        path: resource.managedPath,
        sha256: resource.sha256,
      },
    ]),
  )
}
async function assertCapturedReferences(captured, project, reference) {
  assert.equal(captured.frozen.referenceProfile, REGIONAL_REFERENCE_INFERENCE_PROFILE)
  const references = captured.regional.references
  assert.equal(references.profile, REGIONAL_REFERENCE_INFERENCE_PROFILE)
  assert.deepEqual(references.resources, referenceResourceWires())
  assert.equal(references.images.length, 1)
  const entry = references.images[0],
    descriptor = entry.image.$referencePng
  assert.equal(entry.regionId, project.document.regionalGuidance[0].id)
  assert.equal(entry.referenceId, reference.id)
  assert.deepEqual(captured.regional.recipe.regions[0].referenceImages, [reference])
  assert.equal(captured.regional.recipe.regions[1].referenceImages?.length ?? 0, 0)
  assert.equal(descriptor.file, 'reference-0.png')
  assert.deepEqual(
    {
      byteSize: descriptor.byteSize,
      width: descriptor.width,
      height: descriptor.height,
      sha256: descriptor.sha256,
    },
    {
      byteSize: reference.asset.bytes,
      width: reference.asset.width,
      height: reference.asset.height,
      sha256: reference.asset.sha256,
    },
  )
  assert.notEqual(
    descriptor.sha256,
    reference.thumbnail.sha256,
    'Inference must receive the original canonical PNG, not its thumbnail',
  )
  const file = path.join(appDataRoot, 'generation-inputs', captured.row.id, descriptor.file)
  assert.equal((await regular(file)).size, descriptor.byteSize)
  assert.equal(await hashFile(file), descriptor.sha256)
  const image = decodePng(await readFile(file))
  assert.equal(image.width, descriptor.width)
  assert.equal(image.height, descriptor.height)
  assert.equal(image.iccSha256, IGS_SRGB_ICC_SHA256)
  return {
    regionId: entry.regionId,
    referenceId: entry.referenceId,
    index: 0,
    ...descriptor,
    rgbaSha256: image.rgbaSha256,
  }
}
function assertReferenceWire(observed, captured, expectedCount) {
  assert.deepEqual(observed.faults, [])
  const wires = regionalWires(observed)
  assert.equal(wires.length, expectedCount)
  const wire = wires.at(-1),
    bundle = wire.bundleJson
  const ready = observed.workers.find(({ pid }) => pid === wire.pid)?.ready
  for (const capability of [
    'illustrious-regional-invoke-v1',
    'illustrious-regional-reference-txt2img-v1',
    'illustrious-regional-progress-v1',
  ])
    assert.ok(ready.capabilities.includes(capability))
  assert.equal(bundle.request.type, 'generate-illustrious-txt2img')
  assert.equal(bundle.request.job.checkpoint.predictionType, 'epsilon')
  assert.equal(bundle.request.job.checkpoint.sha256, fixture.checkpoint.sha256)
  assert.equal(bundle.request.job.vaePrecision, 'FP16')
  assert.equal(bundle.request.job.vae, null)
  assert.deepEqual(bundle.request.job.loras ?? [], [])
  assert.deepEqual(bundle.request.job.sampling, captured.frozen.workerJob.sampling)
  assert.equal(bundle.request.job.sampling.steps, 6)
  assert.equal(bundle.request.job.sampling.scheduler, 'euler')
  assert.deepEqual(bundle.request.job.sampling.noiseProfile, policy)
  assert.equal(bundle.compositionProfile, 'invoke-canvas-v1')
  assert.equal(bundle.references.profile, REGIONAL_REFERENCE_INFERENCE_PROFILE)
  assert.deepEqual(bundle.references.resources, referenceResourceWires())
  assert.equal(wire.referenceImages.length, 1)
  const actual = wire.referenceImages[0],
    expected = captured.regional.references.images[0]
  assert.equal(actual.index, 0)
  assert.equal(actual.regionId, expected.regionId)
  assert.equal(actual.referenceId, expected.referenceId)
  for (const key of ['byteSize', 'sha256', 'width', 'height'])
    assert.equal(actual[key], expected.image.$referencePng[key])
  assert.equal(actual.observedSha256, expected.image.$referencePng.sha256)
  assert.deepEqual(
    wire.alpha.map(({ sha256 }) => sha256),
    captured.alphas.map(({ sha256 }) => sha256),
  )
  assert.equal(wire.target.observedSha256, captured.targetSha256)
  assert.equal(wire.reportProgress, true)
  assert.equal(
    observed.workers
      .flatMap(({ writes }) => writes.flatMap(({ lines }) => lines))
      .filter(({ type }) =>
        [
          'generate-illustrious-txt2img',
          'generate-illustrious-img2img',
          'generate-illustrious-outpaint',
        ].includes(type),
      ).length,
    0,
  )
  return wire
}
async function replaceReferenceImageUi(project, key) {
  const regionId = project.document.regionalGuidance[0].id
  const surface = window.locator(`[data-regional-guidance-id="${regionId}"]`)
  const prior = (await current(project)).regionalGuidance[0].referenceImages ?? []
  for (const reference of prior)
    await surface
      .getByRole('button', { name: `Remove reference ${reference.name}`, exact: true })
      .click()
  await expect
    .poll(async () => (await current(project)).regionalGuidance[0].referenceImages?.length ?? 0)
    .toBe(0)
  const source = report.referenceImages.sources[key]
  assert.equal(await hashFile(source.path), source.sha256)
  // Only the native chooser is substituted. Existing import UI, IPC, normalization and storage run.
  await application.evaluate(({ dialog }, selectedPath) => {
    if (globalThis.__regionalReferenceDialog)
      throw new Error('Reference chooser already controlled')
    globalThis.__regionalReferenceDialog = dialog.showOpenDialog
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] })
  }, source.path)
  try {
    await surface.getByRole('button', { name: 'Add regional reference image', exact: true }).click()
    await expect
      .poll(async () => (await current(project)).regionalGuidance[0].referenceImages?.length ?? 0, {
        timeout: timeout(120_000),
      })
      .toBe(1)
  } finally {
    await application.evaluate(({ dialog }) => {
      dialog.showOpenDialog = globalThis.__regionalReferenceDialog
      delete globalThis.__regionalReferenceDialog
    })
  }
  const imported = (await current(project)).regionalGuidance[0].referenceImages[0]
  assert.equal(imported.asset.width, source.width)
  assert.equal(imported.asset.height, source.height)
  assert.notEqual(imported.asset.sha256, imported.thumbnail.sha256)
  await save(project)
  const portable = await readZip(project.file)
  const reference = portable.project.regionalGuidance[0].referenceImages[0]
  const original = portable.members.get(reference.asset.path)
  assert.equal(original.length, reference.asset.bytes)
  assert.equal(digest(original), reference.asset.sha256)
  assert.equal(decodePng(original).rgbaSha256, source.rgbaSha256)
  project.document = portable.project
  project.initialPackageSha256 = await hashFile(project.file)
  report.referenceImages.imports.push({
    projectKey: project.id,
    source: key,
    sourceFileSha256: source.sha256,
    regionId,
    reference,
    originalPngSha256: digest(original),
    originalRgbaSha256: source.rgbaSha256,
    normalUiImportAndNormalization: true,
  })
  return reference
}
async function discardReferenceControl(project) {
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  const dialog = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Discard Candidates and Close', exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveCount(0)
  assert.equal((await readZip(project.file)).project.layers.length, 0)
}
async function generateReferenceControlCancelRetry(project) {
  const control = projects.find(({ mode }) => mode === 'reference-control')
  report.referenceImages.controlProjectKey = control.id
  const generate = () => window.getByRole('button', { name: 'Generate', exact: true })
  const begin = async (owner, expectedRows, reference) => {
    assert.equal((await targetState(owner)).mode, 'txt2img')
    assert.equal((await api('getGenerationState', owner.id)).regionalReferenceImagesSupported, true)
    const count = window.locator('input[aria-label="Images per click"]')
    await count.fill('1')
    await count.press('Enter')
    const rows = async () =>
      (await sqlSnapshot()).queue.filter(({ local_project_key }) => local_project_key === owner.id)
    assert.equal((await rows()).length, expectedRows)
    await expect(generate()).toBeEnabled({ timeout: timeout(120_000) })
    await generate().click()
    await expect
      .poll(async () => (await rows()).length, { timeout: timeout(180_000) })
      .toBe(expectedRows + 1)
    const row = (await rows()).find(
      ({ id }) =>
        !report.referenceImages.controls.A || id !== report.referenceImages.controls.A.row.id,
    )
    await expect
      .poll(async () => (await job(row.id)).status, { timeout: timeout(180_000) })
      .toBe('running')
    const captured = await captureFrozen(await job(row.id), owner)
    const original = await assertCapturedReferences(captured, owner, reference)
    return { row, captured, original }
  }
  await openProject(control)
  for (const key of ['A', 'B']) {
    if (key === 'B') await openProject(control)
    const reference = await replaceReferenceImageUi(control, key)
    const started = await begin(control, key === 'A' ? 0 : 1, reference)
    const completed = await waitVPredictionCompletion(control, started.row)
    const results = await api('listGenerationResults', control.id)
    assert.equal(results.candidates.length, 1)
    const candidate = results.candidates[0]
    assert.equal(candidate.queueItemId, completed.id)
    const bytes = await fetchPng(candidate.imageUrl),
      decoded = decodePng(bytes)
    assert.equal(decoded.channels, 3)
    assert.equal(decoded.width, side)
    assert.equal(decoded.height, side)
    const receipt = (await sqlSnapshot()).receipts.find(
      ({ queue_item_id }) => queue_item_id === completed.id,
    )
    assert.equal(receipt.image_sha256, digest(bytes))
    assert.equal(receipt.image_byte_size, bytes.length)
    const observed = await observerSnapshot(),
      wire = assertReferenceWire(observed, started.captured, key === 'A' ? 1 : 2)
    const file = path.join(evidenceRoot, `reference-control-${key}.png`)
    await writeFile(file, bytes, { flag: 'wx', mode: 0o600 })
    report.referenceImages.controls[key] = {
      ...started,
      row: completed,
      reference,
      candidate,
      receipt,
      file,
      pngSha256: digest(bytes),
      rgbaSha256: decoded.rgbaSha256,
      frames: assertVPredictionCompletion(observed, wire),
      browser: await assertBrowserPixels(candidate.imageUrl, decoded),
    }
    assert.equal(
      await hashFile(control.file),
      control.initialPackageSha256,
      'Generate must not Save',
    )
    assert.equal((await current(control)).layers.length, 0, 'Generate must not Add')
    await discardReferenceControl(control)
  }
  const { A, B } = report.referenceImages.controls
  const semanticControl = (captured) => {
    const job = structuredClone(captured.frozen.workerJob),
      regional = structuredClone(captured.regional)
    delete job.target.path
    delete regional.recipe.documentRevision
    for (const region of regional.recipe.regions) delete region.referenceImages
    delete regional.references.images
    return { job, regional }
  }
  assert.deepEqual(
    semanticControl(A.captured),
    semanticControl(B.captured),
    'A/B must differ only in the authored reference and document revision',
  )
  const a = decodePng(await readFile(A.file)),
    b = decodePng(await readFile(B.file))
  let changedVisibleRgbChannels = 0
  for (let i = 0; i < a.rgba.length; i++)
    if (i % 4 !== 3 && a.rgba[i] !== b.rgba[i]) changedVisibleRgbChannels++
  assert.ok(
    changedVisibleRgbChannels > 0,
    'Changing only the original reference must influence actual visible RGB',
  )
  report.referenceImages.causality = {
    changedVisibleRgbChannels,
    sameExecutionControls: true,
    sameProjectAndMasks: true,
    onlyReferenceChanged: true,
    aestheticQualityClaimed: false,
  }
  await closeVPredictionLifetime('reference-controls-complete')
  await launch()
  await openProject(project)
  const originalA = await replaceReferenceImageUi(project, 'A')
  await installProgressDomObserver()
  const first = await begin(project, 0, originalA)
  assert.equal(first.original.sha256, A.original.sha256)
  assert.equal(first.captured.targetSha256, A.captured.targetSha256)
  assert.deepEqual(
    first.captured.alphas.map(({ sha256 }) => sha256),
    A.captured.alphas.map(({ sha256 }) => sha256),
  )
  await openQueue()
  const witnessed = await progressProbe(project, first.row, 1)
  assert.equal(
    witnessed.snapshot.current.step,
    1,
    'This profile must witness native step1 in Main and UI before Cancel',
  )
  report.progress = {
    beforeCancel: {
      first: witnessed,
      requestId: regionalWires(await observerSnapshot())[0].requestId,
    },
  }
  await queueRow(first.row.id).getByRole('button', { name: 'Cancel job', exact: true }).click()
  await expect
    .poll(async () => (await job(first.row.id)).status, { timeout: timeout(120_000) })
    .toBe('canceled')
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).phase, {
      timeout: timeout(120_000),
    })
    .toBe('idle')
  await progressAfterCancel(first.row)
  const canceled = await observerSnapshot(),
    canceledWire = assertReferenceWire(canceled, first.captured, 1)
  const frames = canceled.workers
    .flatMap(({ frames }) => frames ?? [])
    .filter(({ message }) => message.requestId === canceledWire.requestId)
  const steps = frames
    .filter(({ message }) => message.type === 'generation-progress')
    .map(({ message }) => message.step)
  assert.ok(steps.length >= 1 && steps.length < 6)
  assert.deepEqual(
    steps,
    Array.from({ length: steps.length }, (_, index) => index + 1),
  )
  assert.equal(frames.filter(({ message }) => message.type === 'generation-done').length, 0)
  assert.equal((await progressSql()).receipts.length, 0)
  assert.equal(await hashFile(project.file), project.initialPackageSha256)
  await closeQueue()
  const editedB = await replaceReferenceImageUi(project, 'B')
  for (const [label, value] of [
    ['Steps', '2'],
    ['Generation seed', '124'],
  ]) {
    const input = window.locator(`input[aria-label="${label}"]`)
    await input.fill(value)
    await input.press('Tab')
  }
  const positive = window.getByRole('textbox', { name: 'Positive prompt', exact: true })
  await positive.fill('later saved live authoring after reference A cancellation')
  await positive.press('Tab')
  for (const region of project.document.regionalGuidance)
    await window
      .locator(`[data-regional-guidance-id="${region.id}"]`)
      .getByRole('button', { name: `Hide ${region.name}`, exact: true })
      .click()
  const picker = window.locator('[aria-label="Generation model"]')
  await picker.hover()
  await picker.locator('.n-base-clear').click()
  await expect.poll(async () => (await current(project)).generationDraft.model).toBe(null)
  await save(project)
  const edited = await current(project)
  assert.equal(edited.generationDraft.sampling.steps, 2)
  assert.deepEqual(edited.generationDraft.seed, { policy: 'fixed', value: 124 })
  assert.ok(edited.regionalGuidance.every(({ enabled }) => enabled === false))
  report.currentAuthoringAfterEdit = {
    generationDraft: edited.generationDraft,
    regionalGuidance: portableRegions(edited),
    packageSha256: await hashFile(project.file),
  }
  report.referenceImages.canceled = {
    ...first,
    row: await job(first.row.id),
    steps,
    wire: canceledWire,
  }
  report.referenceImages.savedLiveReference = editedB
  await screenshot('reference-B-settings-saved-before-restart')
  await closeVPredictionLifetime('reference-canceled-B-saved')
  await launch()
  await openProject(project)
  await installProgressDomObserver()
  assert.deepEqual((await current(project)).generationDraft, edited.generationDraft)
  assert.deepEqual(portableRegions(await current(project)), portableRegions(edited))
  await expect(generate()).toBeDisabled()
  await openQueue()
  const retry = queueRow(first.row.id).getByRole('button', { name: 'Retry job', exact: true })
  await expect(retry).toBeEnabled({ timeout: timeout(120_000) })
  await retry.click()
  await expect
    .poll(async () => (await progressSql()).queue.length, { timeout: timeout(180_000) })
    .toBe(2)
  const retried = (await progressSql()).queue.find(({ id }) => id !== first.row.id)
  assert.equal(retried.frozen_payload_json, first.row.frozen_payload_json)
  const retryCaptured = await captureFrozen(retried, project)
  await assertCapturedReferences(retryCaptured, project, originalA)
  assert.equal(retryCaptured.frozenPayloadSha256, first.captured.frozenPayloadSha256)
  assert.deepEqual(retryCaptured.regional.references, first.captured.regional.references)
  report.retry = {
    firstJobId: first.row.id,
    retryJobId: retried.id,
    originalFrozen: first.captured,
    retryFrozen: retryCaptured,
  }
  await closeQueue()
  const completed = await waitVPredictionCompletion(project, retried)
  const observed = await observerSnapshot(),
    wire = assertReferenceWire(observed, retryCaptured, 1)
  report.referenceImages.retryFrames = assertVPredictionCompletion(observed, wire)
  assert.equal(
    await hashFile(project.file),
    report.currentAuthoringAfterEdit.packageSha256,
    'Retry must not Save',
  )
  assert.deepEqual((await current(project)).generationDraft, edited.generationDraft)
  assert.deepEqual(portableRegions(await current(project)), portableRegions(edited))
  const own = await progressSql()
  assert.equal(own.receipts.length, 1)
  report.nativeAccounting = {
    regionalWireCount: 4,
    completedReceiptCount: 3,
    canceledSqlCount: 1,
    nativeLifetimes: 3,
  }
  check(
    'Original canonical A/B references reach native inference with identical controls; actual RGB influence and step1 Cancel precede saved B authoring and restarted exact frozen A Retry',
    report.referenceImages.causality,
  )
  return {
    row: completed,
    receipt: own.receipts[0],
    frozen: retryCaptured.frozen,
    frozenPayloadSha256: retryCaptured.frozenPayloadSha256,
  }
}
async function saveReferenceResultPreset(project) {
  const before = await current(project),
    layer = before.layers.find(({ id }) => id === report.accepted.layerId)
  await window.getByRole('button', { name: `Layer actions for ${layer.name}`, exact: true }).click()
  await window.getByRole('menuitem', { name: 'Save Preset from Result', exact: true }).click()
  const manager = window.getByRole('dialog', { name: 'Preset Manager', exact: true })
  await expect(manager).toBeVisible()
  await expect(
    manager.getByRole('checkbox', { name: 'Include Seed', exact: true }),
  ).not.toBeChecked()
  const name = `Reference result ${randomUUID().slice(0, 8)}`
  await manager.getByRole('textbox', { name: 'Preset name', exact: true }).fill(name)
  await manager
    .getByLabel('Preset editor actions', { exact: true })
    .getByRole('button', { name: 'Create Preset', exact: true })
    .click()
  await expect(
    manager.getByRole('button', { name: `Select preset ${name}`, exact: true }),
  ).toBeVisible()
  const response = await window.evaluate(() => window.api.presets.list())
  assert.equal(response.ok, true)
  const preset = response.value.find((value) => value.name === name)
  assert.ok(preset)
  const stored = await database.db
    .selectFrom('presets')
    .selectAll()
    .where('id', '=', preset.id)
    .executeTakeFirstOrThrow()
  assert.deepEqual(JSON.parse(stored.payload_json), preset.payload)
  assert.deepEqual(preset.payload.prompt, { text: globalPrompt, embeddingRefs: [] })
  assert.deepEqual(preset.payload.guidance, { cfgScale: 5, steps: 6 })
  assert.deepEqual(preset.payload.sampling, { sampler: 'Euler', scheduler: 'Normal' })
  assert.equal(preset.payload.vaePrecision, 'FP16')
  assert.equal(Object.hasOwn(preset.payload, 'seed'), false)
  const json = JSON.stringify(preset.payload)
  for (const forbidden of [
    'regionalGuidance',
    'referenceImages',
    'referenceProfile',
    'referenceId',
    'regionId',
    REGIONAL_REFERENCE_INFERENCE_PROFILE,
    ...project.document.regionalGuidance.map(({ id }) => id),
    ...report.referenceImages.imports.map(({ reference }) => reference.asset.sha256),
    ...Object.values(referenceResources).flatMap(({ managedPath, sha256 }) => [
      managedPath,
      sha256,
    ]),
  ])
    assert.equal(json.includes(forbidden), false, `Result preset leaks ${forbidden}`)
  report.referenceImages.resultPreset = {
    preset,
    stored,
    sourceLayerId: layer.id,
    referencesExcluded: true,
  }
  await manager.getByRole('button', { name: 'Close Preset Manager', exact: true }).click()
  assert.deepEqual((await current(project)).generationDraft, before.generationDraft)
  assert.deepEqual(portableRegions(await current(project)), portableRegions(before))
  assert.equal(await hashFile(project.file), report.accepted.savedPackageSha256)
  check(
    'Accepted result creates a real SQLite preset containing frozen base settings with regional images and auxiliary identities excluded',
  )
}

async function generateCancelEditRetry(project) {
  const scenarioSql = progressProfile ? progressSql : sqlSnapshot
  await openProject(project)
  const beforeGeneratePackageSha256 = await hashFile(project.file)
  assert.equal(beforeGeneratePackageSha256, project.initialPackageSha256)
  assert.equal((await targetState(project)).mode, generationMode)
  const advisory = await api('getGenerationState', project.id)
  assert.equal(advisory.regionalSupported, true)
  if (imageProfile) assert.equal(advisory.regionalImg2ImgSupported, true)
  if (outpaintProfile) {
    assert.equal(advisory.regionalOutpaintSupported, true)
    assert.equal(advisory.outpaintSupported, true)
  }
  if (imgVaeProfile) {
    assert.equal(advisory.regionalImg2ImgVaeSupported, true)
    assert.equal(advisory.regionalVaeSupported, true)
    assert.equal(advisory.externalVaeSupported, true)
    assert.equal(advisory.vaePrecisionSupported, true)
    assert.deepEqual((await current(project)).generationDraft.vae, selectedVaeReference())
    assert.equal((await current(project)).generationDraft.vaePrecision, 'FP32')
  }
  if (imgSamplerProfile) {
    assert.equal(
      advisory[
        imgDpmProfile ? 'regionalImg2ImgDpmpp2mSupported' : 'regionalImg2ImgEulerASupported'
      ],
      true,
    )
    assert.equal((await current(project)).generationDraft.sampling.sampler, generationSampler)
  }
  if (imageCfgRescaleProfile) {
    assert.equal(
      advisory[
        outpaintProfile ? 'regionalOutpaintSupported' : 'regionalImg2ImgCfgRescaleSupported'
      ],
      true,
    )
    assert.equal((await current(project)).generationDraft.cfgRescale, generationCfgRescale)
  }
  if (initializationProfile) {
    assert.equal(advisory.regionalInvokeInitializationSupported, true)
    assert.equal((await current(project)).generationDraft.sampling.sampler, 'Euler a')
  }
  await expect(window.locator('input[aria-label="Steps"]')).toHaveValue('30')
  await expect(window.locator('input[aria-label="CFG scale"]')).toHaveValue('5')
  await expect(window.locator('input[aria-label="Generation seed"]')).toHaveValue('123')
  const count = window.locator('input[aria-label="Images per click"]')
  await count.fill('1')
  await count.press('Enter')
  await expect(count).toHaveValue('1')
  const generate = window.getByRole('button', { name: 'Generate', exact: true })
  await expect(generate).toBeEnabled({ timeout: timeout(120_000) })
  const baseline = await scenarioSql()
  assert.deepEqual(
    baseline,
    { queue: [], receipts: [], cursors: [] },
    'Fresh appData must have no prior operational generation work',
  )
  await generate.click()
  await expect
    .poll(async () => (await scenarioSql()).queue.length, { timeout: timeout(180_000) })
    .toBe(1)
  const first = (await scenarioSql()).queue[0]
  await expect
    .poll(async () => (await job(first.id)).status, { timeout: timeout(180_000) })
    .toBe('running')
  const firstCaptured = await captureFrozen(await job(first.id), project)
  const state = await api('getGenerationState', project.id)
  assert.equal(state.phase, 'processing')
  assert.equal(state.runningJobId, first.id)
  await openQueue()
  await expect(queueRow(first.id)).toContainText('Running')
  await expect(
    queueRow(first.id).getByRole('button', { name: 'Cancel job', exact: true }),
  ).toBeEnabled()
  // SQL Running precedes transport. Missing observer evidence is an incomplete/failed run,
  // never permission to substitute a timing guess or a mocked native request.
  await expect
    .poll(
      async () => {
        const row = await job(first.id)
        assert.equal(
          row.status,
          'running',
          `First job finished before UI cancellation: ${row.error_message ?? row.status}`,
        )
        const observed = await observerSnapshot()
        assert.deepEqual(observed.faults, [])
        return regionalWires(observed).length
      },
      { timeout: timeout(240_000), intervals: [100, 250, 500] },
    )
    .toBe(imageProfile ? 2 : 1)
  report.cancellationBoundary =
    'Actual Main-to-Python regional JSONL request witnessed before UI Cancel; no completed denoising-step count is inferred.'
  const snapshot = await observerSnapshot()
  assert.deepEqual(snapshot.faults, [])
  report.beforeCancel = {
    actionState: state,
    captured: firstCaptured,
    observedRegionalWires: regionalWires(snapshot),
  }
  // IMG's shorter native window can finish while the GPU-backed screenshot is encoded.
  // Capture the running UI before waiting for the two actual step observations, then click
  // Cancel immediately afterward. Keep the historical TXT/fault observation order unchanged.
  if (imageProfile) await screenshot('running-before-cancel')
  if (progressProfile) await progressBeforeCancel(project, first)
  if (!imageProfile)
    await screenshot(workerFaultProfile ? 'running-before-worker-fault' : 'running-before-cancel')
  if (workerFaultProfile) {
    await faultRegionalWorker(project, first)
  } else {
    await queueRow(first.id).getByRole('button', { name: 'Cancel job', exact: true }).click()
    await expect
      .poll(async () => (await job(first.id)).status, { timeout: timeout(120_000) })
      .toBe('canceled')
    await expect(queueRow(first.id)).toContainText('Canceled')
  }
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).phase, {
      timeout: timeout(120_000),
    })
    .toBe('idle')
  const canceled = await scenarioSql()
  assert.equal(canceled.queue.length, 1)
  assert.deepEqual(canceled.receipts, [])
  assert.deepEqual(canceled.cursors, [])
  assert.equal(canceled.queue[0].frozen_payload_json, first.frozen_payload_json)
  assert.equal(
    await hashFile(project.file),
    beforeGeneratePackageSha256,
    workerFaultProfile
      ? 'Generate and worker failure must not implicitly Save the portable Project'
      : 'Generate and Cancel must not implicitly Save the portable Project',
  )
  report.noImplicitSave = {
    beforeGeneratePackageSha256,
    ...(workerFaultProfile
      ? { afterFailurePackageSha256: await hashFile(project.file) }
      : { afterCancelPackageSha256: await hashFile(project.file) }),
  }
  if (workerFaultProfile) report.failed = canceled.queue[0]
  else report.canceled = canceled.queue[0]
  if (progressProfile && !workerFaultProfile) await progressAfterCancel(first)
  await closeQueue()
  if (imageProfile) await editImageCurrentUi(project)
  else {
    // These are renderer-owned edits delivered by original IPC, deliberately differing from Retry.
    const steps = window.locator('input[aria-label="Steps"]')
    await steps.fill('2')
    await steps.press('Enter')
    const seed = window.locator('input[aria-label="Generation seed"]')
    await seed.fill('124')
    await seed.press('Enter')
    if (initializationProfile) {
      // Reuse the original Sampler UI interaction from qualify-installed-generation.mjs.
      // The frozen Retry must keep Euler a and its initialization after this authored change.
      await window.locator('[aria-label="Sampler"]').click()
      await window.getByText('Euler', { exact: true }).last().click()
    }
    for (const region of project.document.regionalGuidance)
      await window
        .locator(`[data-regional-guidance-id="${region.id}"]`)
        .getByRole('button', { name: `Hide ${region.name}`, exact: true })
        .click()
    await expect
      .poll(
        async () => {
          const tab = await current(project)
          return {
            steps: tab.generationDraft.sampling.steps,
            seed: tab.generationDraft.seed,
            enabled: tab.regionalGuidance.map(({ enabled }) => enabled),
            ...(initializationProfile ? { sampler: tab.generationDraft.sampling.sampler } : {}),
          }
        },
        { timeout: timeout() },
      )
      .toEqual({
        steps: 2,
        seed: { policy: 'fixed', value: 124 },
        enabled: [false, false],
        ...(initializationProfile ? { sampler: 'Euler' } : {}),
      })
    await expect(generate).toBeEnabled({ timeout: timeout(120_000) })
    report.ordinaryNeighbor = {
      regionsDisabled: true,
      transparentCurrentCanvas: true,
      generateEnabled: true,
      noOrdinaryInferenceRequested: true,
    }
  }
  await save(project)
  const edited = await current(project)
  if (imageProfile) {
    assert.equal(edited.layers.length, 1)
    assert.equal(edited.layers[0].id, project.sourceLayerId)
    assert.equal(edited.layers[0].opacity, 0.75)
  } else assert.deepEqual(edited.layers, project.document.layers)
  if (imgVaeProfile) {
    assert.equal(edited.generationDraft.vae, null)
    assert.equal(edited.generationDraft.vaePrecision, 'FP16')
  }
  assert.deepEqual(edited.primaryBbox, bbox)
  report.currentAuthoringAfterEdit = {
    generationDraft: edited.generationDraft,
    regionalGuidance: edited.regionalGuidance,
    packageSha256: await hashFile(project.file),
  }
  const afterEditSavePackageSha256 = report.currentAuthoringAfterEdit.packageSha256
  await screenshot('edited-saved-current-draft')
  await openQueue()
  await expect(queueRow(first.id)).toContainText('Seed 123')
  if (initializationProfile) {
    await queueRow(first.id).getByRole('button', { name: 'Show job details', exact: true }).click()
    await expect(
      window.getByTestId('queue-job-details').getByText('Euler a', { exact: true }),
    ).toBeVisible()
  }
  const retry = queueRow(first.id).getByRole('button', { name: 'Retry job', exact: true })
  await expect(retry).toBeEnabled({ timeout: timeout(120_000) })
  await retry.click()
  await expect
    .poll(async () => (await scenarioSql()).queue.length, { timeout: timeout(180_000) })
    .toBe(2)
  const retried = (await scenarioSql()).queue.find(({ id }) => id !== first.id)
  assert.ok(retried)
  assert.equal(retried.operation, regionalOperation)
  assert.equal(
    retried.frozen_payload_json,
    first.frozen_payload_json,
    'Retry preserves exact original frozen recipe/profile/policies after authoring edits',
  )
  const secondCaptured = await captureFrozen(retried, project)
  assert.equal(secondCaptured.frozenPayloadSha256, firstCaptured.frozenPayloadSha256)
  assert.equal(secondCaptured.targetSha256, firstCaptured.targetSha256)
  report.retry = {
    firstJobId: first.id,
    retryJobId: retried.id,
    originalFrozen: firstCaptured,
    retryFrozen: secondCaptured,
  }
  if (progressProfile) report.progress.retryIntermediate = await progressProbe(project, retried, 1)
  await closeQueue()
  await expect
    .poll(
      async () => {
        const row = await job(retried.id)
        if (row.status === 'failed' || row.status === 'canceled')
          assert.fail(`Frozen Retry did not complete: ${row.error_code}: ${row.error_message}`)
        return row.status
      },
      { timeout: timeout(900_000), intervals: [250, 500, 1000] },
    )
    .toBe('completed')
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).phase, {
      timeout: timeout(120_000),
    })
    .toBe('idle')
  assert.equal(
    await hashFile(project.file),
    afterEditSavePackageSha256,
    'Frozen Retry and native completion must not implicitly Save before Add',
  )
  report.noImplicitSave.afterExplicitEditSavePackageSha256 = afterEditSavePackageSha256
  report.noImplicitSave.afterRetryCompletionPackageSha256 = await hashFile(project.file)
  assert.equal((await current(project)).generationDraft.sampling.steps, 2)
  assert.deepEqual((await current(project)).generationDraft.seed, { policy: 'fixed', value: 124 })
  if (initializationProfile)
    assert.equal((await current(project)).generationDraft.sampling.sampler, 'Euler')
  const final = await scenarioSql()
  assert.equal(final.queue.length, 2)
  assert.equal(final.receipts.length, 1)
  assert.equal(final.cursors.length, 1)
  assert.equal(final.receipts[0].queue_item_id, retried.id)
  assert.equal(final.receipts[0].status, 'completed')
  assert.equal(final.receipts[0].actual_seed, 123)
  assert.equal(final.receipts[0].frozen_payload_sha256, firstCaptured.frozenPayloadSha256)
  assert.equal(final.cursors[0].actual_seed, 123)
  const observed = await observerSnapshot()
  assert.deepEqual(observed.faults, [])
  if (progressProfile) await verifyInstalledProgress(project, retried)
  const wires = regionalWires(observed)
  assert.ok(
    wires.length <= (imageProfile ? 3 : 2),
    'No extra regional inference requests are authorized',
  )
  assert.equal(new Set(wires.map(({ requestId }) => requestId)).size, wires.length)
  for (const wire of wires) {
    if (imageProfile) {
      assert.equal(wire.bundleJson.request.type, generationRequestType)
      if (outpaintProfile) {
        assert.deepEqual(
          wire.bundleJson.request.job.conditioning,
          firstCaptured.frozen.context.conditioning,
        )
        assert.deepEqual(wire.bundleJson.request.job.infillResource, {
          byteSize: outpaintInfill.byteSize,
          path: outpaintInfill.managedPath,
          role: outpaintInfill.role,
          sha256: outpaintInfill.sha256,
        })
        const ready = observed.workers.find(({ pid }) => pid === wire.pid).ready
        for (const capability of ['illustrious-outpaint', 'illustrious-regional-outpaint-v1'])
          assert.ok(ready.capabilities.includes(capability))
      }
      assert.equal(wire.bundleJson.request.job.sampling.denoisingStrength, imageStrength)
      assert.equal(Object.hasOwn(wire.bundleJson, 'initializationProfile'), false)
      assert.ok(
        observed.workers
          .find(({ pid }) => pid === wire.pid)
          .ready.capabilities.includes('illustrious-regional-img2img-v1'),
      )
      if (imgSamplerProfile) {
        const ready = observed.workers.find(({ pid }) => pid === wire.pid).ready
        assert.ok(ready.capabilities.includes(imgSamplerCapability))
        assert.ok(
          ready.capabilities.includes(
            imgDpmProfile
              ? 'illustrious-regional-dpmpp-2m-v1'
              : 'illustrious-regional-invoke-init-v1',
          ),
        )
        assert.equal(wire.bundleJson.request.job.sampling.scheduler, generationScheduler)
      }
      if (imageCfgRescaleProfile) {
        const ready = observed.workers.find(({ pid }) => pid === wire.pid).ready
        for (const capability of [
          'illustrious-regional-invoke-v1',
          'illustrious-regional-cfg-rescale-v1',
          outpaintProfile
            ? 'illustrious-regional-outpaint-v1'
            : 'illustrious-regional-img2img-cfg-rescale-v1',
        ])
          assert.ok(ready.capabilities.includes(capability))
        assert.equal(wire.bundleJson.request.job.sampling.cfgRescale, generationCfgRescale)
      }
      if (imgVaeProfile) {
        const ready = observed.workers.find(({ pid }) => pid === wire.pid).ready
        for (const capability of [
          'illustrious-regional-vae-v1',
          'illustrious-regional-img2img-vae-v1',
        ])
          assert.ok(ready.capabilities.includes(capability))
        assert.deepEqual(wire.bundleJson.request.job.vae, selectedVaeWire())
        assert.equal(wire.bundleJson.request.job.vaePrecision, 'FP32')
        assert.equal(wire.bundleJson.request.job.sampling.scheduler, 'euler')
        assert.equal(Object.hasOwn(wire.bundleJson.recipe, 'vae'), false)
        assert.equal(Object.hasOwn(wire.bundleJson.recipe, 'vaePrecision'), false)
      }
    }
    assert.equal(wire.bundleJson.compositionProfile, 'invoke-canvas-v1')
    if (initializationProfile) {
      assert.equal(wire.bundleJson.initializationProfile, initialization)
      const worker = observed.workers.find(({ pid }) => pid === wire.pid)
      assert.ok(worker.ready.capabilities.includes('illustrious-regional-invoke-init-v1'))
      assert.equal(wire.bundleJson.request.job.sampling.scheduler, 'euler_a')
    }
    assert.equal(wire.bundleJson.layout, 'cfg-negative-first')
    assert.deepEqual(wire.bundleJson.globalPositiveCoverage, { kind: 'everywhere' })
    assert.deepEqual(wire.bundleJson.globalNegativeCoverage, { kind: 'everywhere' })
    assert.equal(wire.bundleJson.positivePooledSourceId, 'current-canvas')
    assert.equal(wire.bundleJson.negativePooledSourceId, 'current-canvas')
    assert.equal(wire.bundleJson.request.job.sampling.steps, 30)
    assert.equal(wire.bundleJson.request.job.sampling.seed, 123)
    assert.equal(wire.bundleJson.request.job.sampling.cfgScale, 5)
    assert.deepEqual(wire.bundleJson.request.job.sampling.noiseProfile, policy)
    assert.equal(wire.target.sha256, firstCaptured.targetSha256)
    assert.deepEqual(
      wire.alpha.map(({ sha256 }) => sha256),
      project.regionAlphas,
    )
    for (const alpha of wire.alpha) {
      assert.equal(alpha.positive, side ** 2 / 2)
      assert.equal(alpha.opaque, alpha.positive)
    }
  }
  if (imageCfgRescaleProfile) {
    assert.equal(edited.generationDraft.cfgRescale, 0.2)
    report.cfgRescaleFlow = {
      originalValue: generationCfgRescale,
      editedSavedValue: edited.generationDraft.cfgRescale,
      actualWireValues: wires.map(({ bundleJson }) => bundleJson.request.job.sampling.cfgRescale),
      newCapability: outpaintProfile
        ? 'illustrious-regional-outpaint-v1'
        : 'illustrious-regional-img2img-cfg-rescale-v1',
      noExtraNativeRequests: true,
    }
    check(
      outpaintProfile
        ? 'Actual outpaint CFG Rescale0.7, source conditioning and exact LaMa reach all three native wires and frozen Retry after saved0.2/source edits; every executing peer advertises the separate outpaint capability'
        : 'Actual IMG CFG Rescale0.7 reaches all three native wires and frozen Retry after a saved0.2 edit; every executing peer advertises the separate combination capability',
      report.cfgRescaleFlow,
    )
  }
  if (imgSamplerProfile) {
    assert.equal(edited.generationDraft.sampling.sampler, 'Euler')
    report[imgDpmProfile ? 'imgDpmFlow' : 'imgEulerAFlow'] = {
      originalSampler: generationSampler,
      originalSchedule: generationScheduleLabel,
      editedSavedSampler: 'Euler',
      actualWireSchedulers: wires.map(
        ({ bundleJson }) => bundleJson.request.job.sampling.scheduler,
      ),
      newCapability: imgSamplerCapability,
      noTxtInitialization: true,
      noExtraNativeRequests: true,
    }
    check(
      `Actual opaque IMG ${generationSampler}/${generationScheduleLabel} reaches all three native wires and frozen Retry after saved Euler edits; every executing peer advertises the separate combination capability`,
      report[imgDpmProfile ? 'imgDpmFlow' : 'imgEulerAFlow'],
    )
  }
  if (imgVaeProfile) {
    await verifyGlobalVaeFiles()
    report.imgVaeFlow = {
      selectedReference: selectedVaeReference(),
      selectedWorkerDescriptor: selectedVaeWire(),
      selectedPrecision: 'FP32',
      defaultVersionId: globalVae.B.reference.localVersionId,
      editedSavedVae: edited.generationDraft.vae,
      editedSavedPrecision: edited.generationDraft.vaePrecision,
      actualWireVaeDescriptors: wires.map(({ bundleJson }) => bundleJson.request.job.vae),
      actualWirePrecisions: wires.map(({ bundleJson }) => bundleJson.request.job.vaePrecision),
      originalRequestSeeds: [123, 123, 123],
      allThreeLogicalAndNativeCommandsRetainOriginalVaeAndPrecision: true,
      originalFrozenRetryPreserved: true,
      newCapability: 'illustrious-regional-img2img-vae-v1',
      noTxtInitialization: true,
      vaeAddedToRecipe: false,
      precisionAddedToRecipe: false,
      sourceFilesUnchanged: true,
      numericalCausalityClaimed: false,
      extraNativeCalls: 0,
    }
    check(
      'Actual opaque IMG exact A/FP32 reaches all three native wires and frozen Retry after saved Embedded/FP16 edits; every executing peer advertises the separate combination capability',
      report.imgVaeFlow,
    )
  }
  assert.equal(
    wires.length,
    imageProfile ? 3 : 2,
    'Generate and Retry each require one witnessed original regional command',
  )
  assert.equal(
    observed.workers
      .flatMap(({ writes }) => writes.flatMap(({ lines }) => lines))
      .filter(({ type }) =>
        [
          'generate-illustrious-txt2img',
          'generate-illustrious-img2img',
          ...(outpaintProfile ? ['generate-illustrious-outpaint'] : []),
        ].includes(type),
      ).length,
    0,
    'No ordinary inference command may replace regional execution',
  )
  report.nativeAccounting = {
    regionalWireCount: wires.length,
    completedReceiptCount: final.receipts.length,
    canceledSqlCount: final.queue.filter(({ status }) => status === 'canceled').length,
    workerSpawnCount: observed.workers.length,
    observerUnavailable: observed.workers.length === 0,
    stepCounterQualified: progressProfile,
    ...(workerFaultProfile
      ? {
          failedSqlCount: final.queue.filter(({ status }) => status === 'failed').length,
          workerCountBoundary:
            'Through generation completion; final observers include later derivative workers',
        }
      : {}),
  }
  check(
    workerFaultProfile
      ? 'UI Generate/worker-only failure and original-op frozen Queue Retry preserve 30-step seed123 policies after saved steps2/seed124 and disabled regions'
      : 'UI Generate/Cancel and original-op frozen Queue Retry preserve 30-step seed123 policies after saved steps2/seed124 and disabled regions',
    report.nativeAccounting,
  )
  return {
    row: await job(retried.id),
    receipt: final.receipts[0],
    frozen: firstCaptured.frozen,
    edited,
  }
}

async function generateStaticBatchEdit(project) {
  assert.ok(staticBatchProfile && preservationBaseline.initializationControl)
  await openProject(project)
  assert.equal(await hashFile(project.file), project.initialPackageSha256)
  assert.equal((await targetState(project)).mode, 'txt2img')
  const advisory = await api('getGenerationState', project.id)
  assert.equal(advisory.regionalSupported, true)
  assert.equal(advisory.regionalInvokeInitializationSupported, true)
  assert.equal((await current(project)).generationDraft.sampling.sampler, 'Euler a')
  await expect(window.locator('input[aria-label="Steps"]')).toHaveValue('30')
  await expect(window.locator('input[aria-label="CFG scale"]')).toHaveValue('5')
  await expect(window.locator('input[aria-label="Generation seed"]')).toHaveValue('123')
  const count = window.locator('input[aria-label="Images per click"]')
  await count.fill('2')
  await count.press('Enter')
  await expect(count).toHaveValue('2')
  const generate = window.getByRole('button', { name: 'Generate', exact: true })
  await expect(generate).toBeEnabled({ timeout: timeout(120_000) })
  assert.deepEqual(await progressSql(), { queue: [], receipts: [], cursors: [] })
  await generate.click()
  await originalIpcFinished('projects:generate')
  const admitted = (await progressSql()).queue
  assert.equal(admitted.length, 2, 'One UI Generate must publish both planned items')
  assert.equal(new Set(admitted.map(({ batch_id }) => batch_id)).size, 1)
  assert.equal(new Set(admitted.map(({ staging_session_id }) => staging_session_id)).size, 1)
  assert.ok(admitted[0].id.localeCompare(admitted[1].id) < 0)
  assert.deepEqual(
    admitted.map(
      ({ frozen_payload_json }) => JSON.parse(frozen_payload_json).workerJob.sampling.seed,
    ),
    [123, 124],
  )
  const captured = []
  for (const [index, row] of admitted.entries()) {
    captured.push(await captureFrozen(row, project, 123 + index))
    assert.equal(captured[index].regional.recipe.item.iteration, index)
  }
  assert.equal(captured[0].targetSha256, captured[1].targetSha256)
  assert.deepEqual(captured[0].alphas, captured[1].alphas)
  assert.equal(await hashFile(project.file), project.initialPackageSha256)
  const generateCall = (await observerSnapshot()).ipc.find(
    ({ channel }) => channel === 'projects:generate',
  )
  assert.equal(generateCall.response.ok, true)
  assert.equal(generateCall.response.value.kind, 'queued')
  assert.equal(generateCall.response.value.batchId, admitted[0].batch_id)
  assert.deepEqual(
    generateCall.response.value.jobIds,
    admitted.map(({ id }) => id),
  )
  assert.equal(generateCall.response.value.truncated, false)
  report.staticBatch = {
    initializationControl: preservationBaseline.initializationControl,
    captured,
    batchId: admitted[0].batch_id,
    stagingSessionId: admitted[0].staging_session_id,
    orderedJobIds: admitted.map(({ id }) => id),
    generateResponse: generateCall.response,
  }
  check(
    'One real UI Generate atomically returns two ordered seed123/124 jobs in one frozen batch/session',
  )

  // Authored edits follow durable admission, not a delay or interception of the second worker.
  const steps = window.locator('input[aria-label="Steps"]')
  await steps.fill('2')
  await steps.press('Enter')
  const seed = window.locator('input[aria-label="Generation seed"]')
  await seed.fill('999')
  await seed.press('Enter')
  await window.locator('[aria-label="Sampler"]').click()
  await window.getByText('Euler', { exact: true }).last().click()
  for (const region of project.document.regionalGuidance)
    await window
      .locator(`[data-regional-guidance-id="${region.id}"]`)
      .getByRole('button', { name: `Hide ${region.name}`, exact: true })
      .click()
  await expect
    .poll(
      async () => {
        const tab = await current(project)
        return {
          steps: tab.generationDraft.sampling.steps,
          seed: tab.generationDraft.seed,
          sampler: tab.generationDraft.sampling.sampler,
          enabled: tab.regionalGuidance.map(({ enabled }) => enabled),
        }
      },
      { timeout: timeout() },
    )
    .toEqual({
      steps: 2,
      seed: { policy: 'fixed', value: 999 },
      sampler: 'Euler',
      enabled: [false, false],
    })
  await save(project)
  const edited = await current(project)
  assert.deepEqual(edited.layers, project.document.layers)
  assert.deepEqual(edited.primaryBbox, bbox)
  const editedPackageSha256 = await hashFile(project.file)
  report.currentAuthoringAfterEdit = {
    generationDraft: edited.generationDraft,
    regionalGuidance: edited.regionalGuidance,
    packageSha256: editedPackageSha256,
  }
  report.noImplicitSave = {
    beforeGeneratePackageSha256: project.initialPackageSha256,
    afterAdmissionPackageSha256: project.initialPackageSha256,
    afterExplicitEditSavePackageSha256: editedPackageSha256,
  }
  await screenshot('batch-edited-saved-current-draft')
  await openQueue()
  for (const [index, row] of admitted.entries())
    await expect(queueRow(row.id)).toContainText(`Seed ${123 + index}`)
  await closeQueue()
  await expect
    .poll(
      async () => {
        const rows = (await progressSql()).queue
        assert.equal(rows.length, 2)
        for (const row of rows)
          assert.ok(
            ['pending', 'running', 'completed'].includes(row.status),
            `Planned batch item failed: ${row.error_code}: ${row.error_message}`,
          )
        return rows.filter(({ status }) => status === 'completed').length
      },
      { timeout: timeout(900_000), intervals: [250, 500, 1000] },
    )
    .toBe(2)
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).phase, {
      timeout: timeout(120_000),
    })
    .toBe('idle')
  assert.equal(await hashFile(project.file), editedPackageSha256)
  report.noImplicitSave.afterNativeCompletionsPackageSha256 = await hashFile(project.file)
  const final = await progressSql()
  assert.equal(final.queue.length, 2)
  assert.equal(final.receipts.length, 2)
  assert.equal(final.cursors.length, 1)
  assert.deepEqual(
    final.receipts.map(({ queue_item_id }) => queue_item_id),
    admitted.map(({ id }) => id),
  )
  assert.deepEqual(
    final.receipts.map(({ actual_seed }) => actual_seed),
    [123, 124],
  )
  assert.equal(final.cursors[0].actual_seed, 124)
  for (const [index, row] of final.queue.entries()) {
    assert.equal(row.frozen_payload_json, admitted[index].frozen_payload_json)
    assert.equal(final.receipts[index].status, 'completed')
    assert.equal(final.receipts[index].frozen_payload_sha256, captured[index].frozenPayloadSha256)
  }
  const observed = await observerSnapshot()
  assert.deepEqual(observed.faults, [])
  const wires = regionalWires(observed)
  assert.equal(wires.length, 2, 'Only the two original batch requests are authorized')
  assert.equal(new Set(wires.map(({ requestId }) => requestId)).size, 2)
  for (const [index, wire] of wires.entries()) {
    const bundle = wire.bundleJson
    assert.equal(bundle.compositionProfile, 'invoke-canvas-v1')
    assert.equal(bundle.initializationProfile, initialization)
    assert.equal(bundle.layout, 'cfg-negative-first')
    assert.deepEqual(bundle.globalPositiveCoverage, { kind: 'everywhere' })
    assert.deepEqual(bundle.globalNegativeCoverage, { kind: 'everywhere' })
    assert.equal(bundle.positivePooledSourceId, 'current-canvas')
    assert.equal(bundle.negativePooledSourceId, 'current-canvas')
    assert.deepEqual(bundle.recipe.item, captured[index].regional.recipe.item)
    assert.deepEqual(
      bundle.recipe.regions.map(({ regionId }) => regionId),
      project.document.regionalGuidance.map(({ id }) => id),
    )
    const { output: _output, target, ...job } = bundle.request.job
    const { path: _targetPath, ...descriptor } = target
    assert.deepEqual({ ...job, target: descriptor }, captured[index].frozen.workerJob)
    assert.equal(wire.target.observedSha256, captured[index].targetSha256)
    assert.deepEqual(
      wire.alpha.map(({ sha256 }) => sha256),
      project.regionAlphas,
    )
    for (const alpha of wire.alpha) {
      assert.equal(alpha.positive, 1024 ** 2 / 2)
      assert.equal(alpha.opaque, alpha.positive)
    }
    const worker = observed.workers.find(({ pid }) => pid === wire.pid)
    assert.ok(worker.ready.capabilities.includes('illustrious-regional-invoke-init-v1'))
    assert.equal(wire.reportProgress, true)
    const frames = worker.frames.filter(({ message }) => message.requestId === wire.requestId)
    const numeric = frames.filter(({ message }) => message.type === 'generation-progress')
    assert.deepEqual(
      numeric.map(({ message }) => message.step),
      Array.from({ length: 30 }, (_, i) => i + 1),
    )
    assert.ok(numeric.every(({ message }) => message.totalSteps === 30))
    const done = frames.filter(({ message }) => message.type === 'generation-done')
    assert.equal(done.length, 1)
    assert.equal(frames.filter(({ message }) => message.type === 'error').length, 0)
    assert.ok(numeric.at(-1).order < done[0].order)
  }
  assert.equal(
    observed.workers
      .flatMap(({ writes }) => writes.flatMap(({ lines }) => lines))
      .filter(({ type }) => type === 'generate-illustrious-txt2img').length,
    0,
  )
  report.staticBatch.completedRows = final.queue
  report.staticBatch.receipts = final.receipts
  report.nativeAccounting = {
    regionalWireCount: 2,
    completedReceiptCount: 2,
    canceledSqlCount: 0,
    workerSpawnCount: observed.workers.length,
    observerUnavailable: false,
    stepCounterQualified: true,
    originalScalarProgressEvents: 60,
    extraGenerateOrRetryRequested: false,
  }
  check(
    'Both original Euler-a batch jobs complete in order with individual frozen inputs despite saved Euler2/seed999/disabled-region edits',
    report.nativeAccounting,
  )
  return {
    row: final.queue[0],
    receipt: final.receipts[0],
    frozen: captured[0].frozen,
    edited,
  }
}

// Adapt the existing installed-generation VAE helpers; every edit enters the real rendered controls.
async function setSelectedVaeUi(project, key) {
  assert.ok(vaeSelectionProfile && (key === null || key === 'A'))
  const input = window.locator('input[aria-label="VAE"]')
  if (!(await input.isVisible()))
    await window.getByText('Advanced Options', { exact: true }).click()
  await expect(input).toBeEnabled({ timeout: timeout() })
  await input.scrollIntoViewIfNeeded()
  if (key === null && (await current(project)).generationDraft.vae !== null) {
    await window.getByRole('button', { name: 'Reset VAE', exact: true }).click()
  } else {
    await input.click()
    if (key === null) await window.getByText('Embedded', { exact: true }).last().click()
    else {
      const option = window
        .locator('.model-option')
        .filter({ hasText: globalVae.A.reference.displayName })
        .filter({ hasText: `· ${globalVae.A.reference.versionName} ·` })
      await expect(option).toHaveCount(1)
      await option.click()
    }
  }
  await expect
    .poll(async () => (await current(project)).generationDraft.vae ?? null, { timeout: timeout() })
    .toEqual(key === null ? null : selectedVaeReference())
  await expect(
    window.getByText(
      key === null ? 'Uses the VAE included in the checkpoint.' : 'Uses the selected external VAE.',
      { exact: true },
    ),
  ).toBeVisible()
}
async function setVaePrecisionUi(project, value) {
  assert.ok((vaeSelectionProfile || vPredictionProfile) && ['Auto', 'FP16', 'FP32'].includes(value))
  const input = window.locator('input[aria-label="VAE precision"]')
  if (!(await input.isVisible()))
    await window.getByText('Advanced Options', { exact: true }).click()
  await expect(input).toBeEnabled({ timeout: timeout() })
  await input.scrollIntoViewIfNeeded()
  if ((await current(project)).generationDraft.vaePrecision !== value) {
    await input.click()
    const option = window
      .locator('.n-base-select-option:visible')
      .filter({ has: window.getByText(value, { exact: true }) })
    await expect(option).toHaveCount(1)
    await option.click()
  }
  await expect
    .poll(async () => (await current(project)).generationDraft.vaePrecision, { timeout: timeout() })
    .toBe(value)
  await expect(
    input.locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " n-base-selection ")]',
    ),
  ).toContainText(value)
}

// Reuse the installed-generation Advanced Options helper; real input/change owns the edit.
async function setCfgRescaleUi(project, value) {
  assert.ok((cfgRescaleProfile || imageCfgRescaleProfile) && [0.2, 0.7].includes(value))
  const input = window.locator('input[aria-label="CFG Rescale"]')
  if (!(await input.isVisible()))
    await window.getByText('Advanced Options', { exact: true }).click()
  await expect(input).toBeEnabled({ timeout: timeout() })
  await input.scrollIntoViewIfNeeded()
  await input.fill(String(value))
  await input.press('Tab')
  await expect
    .poll(async () => (await current(project)).generationDraft.cfgRescale, { timeout: timeout() })
    .toBe(value)
  await expect(input).toHaveValue(String(value))
}

// Use the same existing preview/settings controls as installed-dynamic-batch-driver.mjs.
// This observes ordinary renderer -> draft IPC, never a harness-only planning argument.
async function setDynamicPositiveUi(project, maxPrompts, seedBehavior, purpose) {
  assert.ok(dynamicPositiveProfile)
  await window
    .getByRole('region', { name: 'Positive prompt editor', exact: true })
    .getByRole('button', { name: 'Preview dynamic prompt' })
    .click()
  const dialog = window.getByRole('dialog', { name: 'Dynamic Prompt Preview', exact: true })
  await expect(dialog).toBeVisible()
  const maximum = dialog.locator('input[aria-label="Maximum dynamic prompts"]')
  await maximum.fill(String(maxPrompts))
  await maximum.press('Enter')
  await expect(maximum).toHaveValue(String(maxPrompts))
  await dialog.locator('[aria-label="Dynamic prompt seed behavior"]').click()
  await window
    .getByText(seedBehavior === 'per-prompt' ? 'Per prompt' : 'Per iteration', { exact: true })
    .last()
    .click()
  await expect
    .poll(async () => (await current(project)).generationDraft.dynamicPrompt, {
      timeout: timeout(),
    })
    .toEqual({ maxPrompts, seedBehavior })
  if (purpose === 'before-generate') {
    await expect(
      dialog.getByRole('region', { name: 'Expanded prompt pairs' }).locator('article'),
    ).toHaveCount(2)
    for (const [index, seed] of [123, 124].entries()) {
      const article = dialog
        .getByRole('region', { name: 'Expanded prompt pairs' })
        .locator('article')
        .nth(index)
      await expect(article).toContainText(globalPositiveInput(seed).text)
      await expect(article).toContainText(globalNegativePrompt)
      await expect(article).not.toContainText('unused ordinary detail')
    }
    await expect(dialog).toContainText('Preview truncated at the configured maximum')
  }
  report.dynamicPositiveUi ??= []
  report.dynamicPositiveUi.push({ purpose, maxPrompts, seedBehavior, actualControls: true })
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()
}

async function generateGlobalEmbeddingBatchRetry(project) {
  assert.ok(globalTiProfile && globalTi && preservationBaseline)
  await openProject(project)
  assert.equal(await hashFile(project.file), project.initialPackageSha256)
  assert.equal((await targetState(project)).mode, 'txt2img')
  const advisory = await api('getGenerationState', project.id)
  assert.equal(advisory.regionalSupported, true)
  assert.equal(advisory.regionalInvokeInitializationSupported, true)
  assert.equal(advisory.embeddingsSupported, true)
  if (cfgRescaleProfile) {
    assert.equal(advisory.regionalCfgRescaleSupported, true)
    assert.equal(advisory.cfgRescaleSupported, true)
    assert.equal((await current(project)).generationDraft.cfgRescale, 0)
    await setCfgRescaleUi(project, generationCfgRescale)
    assert.equal(await hashFile(project.file), project.initialPackageSha256)
    report.cfgRescaleAuthoringBeforeGenerate = {
      original: generationCfgRescale,
      realAdvancedOptionsInput: true,
      savedPackageUnchanged: true,
    }
  }
  if (dpmpp2mProfile) {
    assert.equal(advisory.regionalDpmSupported, true)
    assert.equal((await current(project)).generationDraft.sampling.sampler, 'DPM++ 2M')
    assert.equal((await current(project)).generationDraft.sampling.scheduler, 'Normal')
    // Exercise original renderer -> draft IPC, without a qualification-only sampling override.
    for (const sampler of ['Euler', 'DPM++ 2M']) {
      await window.locator('[aria-label="Sampler"]').click()
      await window.getByText(sampler, { exact: true }).last().click()
      await expect
        .poll(async () => (await current(project)).generationDraft.sampling.sampler)
        .toBe(sampler)
    }
    await window.locator('[aria-label="Scheduler"]').click()
    await window.getByText('Karras', { exact: true }).last().click()
    await expect
      .poll(async () => (await current(project)).generationDraft.sampling)
      .toEqual({
        cfgScale: 5,
        denoisingStrength: null,
        sampler: 'DPM++ 2M',
        scheduler: 'Karras',
        steps: 30,
      })
    assert.equal(await hashFile(project.file), project.initialPackageSha256)
    report.dpmpp2mAuthoringBeforeGenerate = {
      initialScheduler: 'Normal',
      actualUiSamplers: ['Euler', 'DPM++ 2M'],
      selectedScheduler: 'Karras',
      savedPackageUnchanged: true,
    }
  }
  if (globalLoraProfile) {
    assert.equal(advisory.regionalLoraSupported, true)
    assert.deepEqual((await current(project)).generationDraft.loras, configuredGlobalLoraStack())
  }
  if (globalVaeProfile) {
    assert.equal(advisory.regionalVaeSupported, true)
    assert.equal(advisory.externalVaeSupported, true)
    assert.equal(advisory.vaePrecisionSupported, true)
    const initial = await current(project)
    assert.deepEqual(initial.generationDraft.vae, selectedVaeReference())
    assert.equal(initial.generationDraft.vaePrecision, 'FP32')
    // Move away and select exact A through the actual picker; the library Default is B.
    await setSelectedVaeUi(project, null)
    await setSelectedVaeUi(project, 'A')
    await setVaePrecisionUi(project, 'Auto')
    await setVaePrecisionUi(project, 'FP32')
    assert.equal(await hashFile(project.file), project.initialPackageSha256)
    report.globalVaeAuthoringBeforeGenerate = {
      initial: {
        vae: initial.generationDraft.vae,
        precision: initial.generationDraft.vaePrecision,
      },
      selected: selectedVaeReference(),
      precision: 'FP32',
      defaultVersionId: globalVae.B.reference.localVersionId,
      realPickerResetAndExactReselection: true,
      realPrecisionAutoThenFp32: true,
      packageUnchangedUntilExplicitSave: true,
    }
  }
  assert.deepEqual((await current(project)).generationDraft.positivePrompt, {
    text: globalPrompt,
    embeddingRefs: authoredGlobalPositiveRefs(),
  })
  assert.deepEqual((await current(project)).generationDraft.negativePrompt, {
    text: '<shared>',
    embeddingRefs: [globalTiRef('B')],
  })
  await expect(window.locator('input[aria-label="Steps"]')).toHaveValue('30')
  await expect(window.locator('input[aria-label="CFG scale"]')).toHaveValue('5')
  await expect(window.locator('input[aria-label="Generation seed"]')).toHaveValue('123')
  if (dynamicPositiveProfile) {
    assert.deepEqual((await current(project)).generationDraft.dynamicPrompt, {
      maxPrompts: 1,
      seedBehavior: 'per-iteration',
    })
    await setDynamicPositiveUi(project, 2, 'per-prompt', 'before-generate')
    assert.deepEqual((await current(project)).generationDraft.positivePrompt, {
      text: globalPrompt,
      embeddingRefs: authoredGlobalPositiveRefs(),
    })
    assert.equal(await hashFile(project.file), project.initialPackageSha256)
  }
  const count = window.locator('input[aria-label="Images per click"]')
  await count.fill(dynamicPositiveProfile ? '1' : '2')
  await count.press('Enter')
  await expect(count).toHaveValue(dynamicPositiveProfile ? '1' : '2')
  const generate = window.getByRole('button', { name: 'Generate', exact: true })
  await expect(generate).toBeEnabled({ timeout: timeout(120_000) })
  assert.deepEqual(await progressSql(), { queue: [], receipts: [], cursors: [] })
  await generate.click()
  await originalIpcFinished('projects:generate')
  const admitted = (await progressSql()).queue
  assert.equal(admitted.length, 2)
  assert.equal(new Set(admitted.map(({ batch_id }) => batch_id)).size, 1)
  assert.equal(new Set(admitted.map(({ staging_session_id }) => staging_session_id)).size, 1)
  assert.deepEqual(
    admitted.map(
      ({ frozen_payload_json }) => JSON.parse(frozen_payload_json).workerJob.sampling.seed,
    ),
    [123, 124],
  )
  const captured = []
  for (const [index, row] of admitted.entries()) {
    captured.push(await captureFrozen(row, project, 123 + index))
    assert.equal(captured[index].regional.recipe.item.iteration, dynamicPositiveProfile ? 0 : index)
  }
  assert.equal(captured[0].targetSha256, captured[1].targetSha256)
  assert.deepEqual(captured[0].alphas, captured[1].alphas)
  const generateCall = (await observerSnapshot()).ipc.find(
    ({ channel }) => channel === 'projects:generate',
  )
  assert.equal(generateCall.response.ok, true)
  assert.equal(generateCall.response.value.kind, 'queued')
  assert.equal(generateCall.response.value.batchId, admitted[0].batch_id)
  assert.deepEqual(
    generateCall.response.value.jobIds,
    admitted.map(({ id }) => id),
  )
  assert.equal(generateCall.response.value.truncated, dynamicPositiveProfile)
  if (dynamicPositiveProfile) {
    assert.deepEqual(generateCall.args[1], {
      documentId: project.document.documentId,
      iterations: 1,
    })
    assert.deepEqual(
      captured.map(({ regional }) => ({
        text: regional.recipe.globalPrompts.positive.text,
        pair: regional.recipe.item.promptPairIndex,
        iteration: regional.recipe.item.iteration,
        seed: regional.recipe.item.seed,
        resources: regional.recipe.globalEmbeddings.positive,
      })),
      [123, 124].map((seed, pair) => {
        const positive = globalPositiveInput(seed)
        return {
          text: positive.text,
          pair,
          iteration: 0,
          seed,
          resources: [globalTiDescriptor(positive.key, positive.token)],
        }
      }),
    )
  }
  await openQueue()
  await expect
    .poll(
      async () => {
        const row = await job(admitted[0].id)
        assert.ok(
          ['pending', 'running', 'completed'].includes(row.status),
          `${row.error_code}: ${row.error_message}`,
        )
        return row.status
      },
      { timeout: timeout(900_000), intervals: [250, 500, 1000] },
    )
    .toBe('completed')
  await expect
    .poll(async () => (await job(admitted[1].id)).status, { timeout: timeout(180_000) })
    .toBe('running')
  await expect
    .poll(
      async () => {
        const observed = await observerSnapshot()
        assert.deepEqual(observed.faults, [])
        return regionalWires(observed).length
      },
      { timeout: timeout(240_000), intervals: [100, 250, 500] },
    )
    .toBe(2)
  const firstHealthy = await progressSql()
  assert.equal(firstHealthy.receipts.length, 1)
  assert.equal(firstHealthy.receipts[0].queue_item_id, admitted[0].id)
  assert.equal(firstHealthy.receipts[0].actual_seed, 123)
  assert.equal(firstHealthy.cursors[0].actual_seed, 123)
  await progressBeforeCancel(project, admitted[1])
  await screenshot('global-ti-second-item-before-cancel')
  await queueRow(admitted[1].id).getByRole('button', { name: 'Cancel job', exact: true }).click()
  await expect
    .poll(async () => (await job(admitted[1].id)).status, { timeout: timeout(120_000) })
    .toBe('canceled')
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).phase, {
      timeout: timeout(120_000),
    })
    .toBe('idle')
  await progressAfterCancel(admitted[1])
  const canceled = await progressSql()
  assert.deepEqual(canceled.receipts, firstHealthy.receipts)
  assert.deepEqual(canceled.cursors, firstHealthy.cursors)
  assert.equal(
    canceled.queue.find(({ id }) => id === admitted[1].id).frozen_payload_json,
    admitted[1].frozen_payload_json,
  )
  assert.equal(await hashFile(project.file), project.initialPackageSha256)
  await closeQueue()

  if (globalVaeProfile) {
    await setSelectedVaeUi(project, null)
    await setVaePrecisionUi(project, 'FP16')
  }
  // Original Project IPC reconciliation removes authored refs when their literals disappear.
  // No frozen context, descriptor, command or recipe is rewritten by this harness.
  await api('updateGenerationDraft', project.id, {
    kind: 'positive-prompt',
    text: dynamicPositiveProfile
      ? 'later {ordinary|alternative|third} authoring without activation literals'
      : 'later ordinary authoring without activation literals',
  })
  await api('updateGenerationDraft', project.id, {
    kind: 'negative-prompt',
    text: 'later local authoring',
  })
  if (dynamicPositiveProfile) {
    await setDynamicPositiveUi(project, 1, 'per-iteration', 'saved-after-cancel')
    const tab = await current(project),
      region = tab.regionalGuidance[0]
    await api('editRegionalGuidanceMask', project.id, region.id, {
      documentId: tab.documentId,
      documentRevision: tab.documentRevision,
      maskId: region.mask.id,
      maskRevision: region.mask.revision,
      edit: { kind: 'clear' },
    })
    const editedMask = (await current(project)).regionalGuidance[0].mask
    assert.equal(editedMask.asset, null)
    assert.equal(editedMask.revision, region.mask.revision + 1)
    report.dynamicPositiveMaskEdit = {
      regionId: region.id,
      before: region.mask,
      after: editedMask,
    }
  }
  let editedLoraStack
  if (globalLoraProfile) {
    const identity = ({ localModelId, localVersionId }) => ({
      resourceId: localModelId,
      versionId: localVersionId,
    })
    const originalStack = configuredGlobalLoraStack()
    // Existing remove/add is the public ordering mechanism: move exact saved A to the end.
    // Supplying its version explicitly must not select the mutable library Default A2.
    await api('removeGenerationLora', project.id, identity(globalLoras.A.reference))
    await api('addGenerationLora', project.id, identity(globalLoras.A.reference))
    await api('updateGenerationDraft', project.id, {
      kind: 'lora-weight',
      ...identity(globalLoras.A.reference),
      value: 0.2,
    })
    await api('updateGenerationDraft', project.id, {
      kind: 'lora-weight',
      ...identity(globalLoras.B.reference),
      value: -0.25,
    })
    await api('updateGenerationDraft', project.id, {
      kind: 'lora-enabled',
      ...identity(globalLoras.Z.reference),
      value: false,
    })
    await api('removeGenerationLora', project.id, identity(originalStack[3].resource))
    editedLoraStack = [
      { ...originalStack[1], weight: -0.25 },
      { ...originalStack[2], enabled: false },
      { ...originalStack[0], weight: 0.2 },
    ]
    assert.deepEqual((await current(project)).generationDraft.loras, editedLoraStack)
  }
  const steps = window.locator('input[aria-label="Steps"]')
  await steps.fill('2')
  await steps.press('Enter')
  const seed = window.locator('input[aria-label="Generation seed"]')
  await seed.fill('999')
  await seed.press('Enter')
  await window.locator('[aria-label="Sampler"]').click()
  await window.getByText('Euler', { exact: true }).last().click()
  for (const region of project.document.regionalGuidance)
    await window
      .locator(`[data-regional-guidance-id="${region.id}"]`)
      .getByRole('button', { name: `Hide ${region.name}`, exact: true })
      .click()
  await expect
    .poll(
      async () => {
        const tab = await current(project)
        return {
          steps: tab.generationDraft.sampling.steps,
          seed: tab.generationDraft.seed,
          sampler: tab.generationDraft.sampling.sampler,
          enabled: tab.regionalGuidance.map(({ enabled }) => enabled),
          positive: tab.generationDraft.positivePrompt,
          negative: tab.generationDraft.negativePrompt,
        }
      },
      { timeout: timeout() },
    )
    .toEqual({
      steps: 2,
      seed: { policy: 'fixed', value: 999 },
      sampler: 'Euler',
      enabled: [false, false],
      positive: {
        text: dynamicPositiveProfile
          ? 'later {ordinary|alternative|third} authoring without activation literals'
          : 'later ordinary authoring without activation literals',
        embeddingRefs: [],
      },
      negative: { text: 'later local authoring', embeddingRefs: [] },
    })
  if (dpmpp2mProfile) {
    await window.locator('[aria-label="Scheduler"]').click()
    await window.getByText('Normal', { exact: true }).last().click()
    await expect
      .poll(async () => (await current(project)).generationDraft.sampling.scheduler)
      .toBe('Normal')
  }
  if (cfgRescaleProfile) await setCfgRescaleUi(project, 0.2)
  await save(project)
  const edited = await current(project),
    editedPackageSha256 = await hashFile(project.file)
  if (globalLoraProfile) assert.deepEqual(edited.generationDraft.loras, editedLoraStack)
  if (globalVaeProfile) {
    assert.equal(edited.generationDraft.vae, null)
    assert.equal(edited.generationDraft.vaePrecision, 'FP16')
  }
  if (dynamicPositiveProfile) {
    assert.deepEqual(edited.generationDraft.dynamicPrompt, {
      maxPrompts: 1,
      seedBehavior: 'per-iteration',
    })
    assert.notEqual(edited.generationDraft.positivePrompt.text, globalPrompt)
    assert.deepEqual(edited.generationDraft.positivePrompt.embeddingRefs, [])
    assert.equal(edited.regionalGuidance[0].mask.asset, null)
  }
  assert.deepEqual(edited.layers, project.document.layers)
  assert.deepEqual(edited.primaryBbox, bbox)
  report.currentAuthoringAfterEdit = {
    generationDraft: edited.generationDraft,
    regionalGuidance: edited.regionalGuidance,
    packageSha256: editedPackageSha256,
  }
  report.noImplicitSave = {
    beforeGeneratePackageSha256: project.initialPackageSha256,
    afterAdmissionPackageSha256: project.initialPackageSha256,
    afterCancelPackageSha256: project.initialPackageSha256,
    afterExplicitEditSavePackageSha256: editedPackageSha256,
  }
  await screenshot('global-ti-edited-saved-before-frozen-retry')
  await openQueue()
  await expect(queueRow(admitted[1].id)).toContainText('Seed 124')
  const retry = queueRow(admitted[1].id).getByRole('button', { name: 'Retry job', exact: true })
  await expect(retry).toBeEnabled({ timeout: timeout(120_000) })
  await retry.click()
  await expect
    .poll(async () => (await progressSql()).queue.length, { timeout: timeout(180_000) })
    .toBe(3)
  const retried = (await progressSql()).queue.find(
    ({ id }) => !admitted.some((row) => row.id === id),
  )
  assert.ok(retried)
  assert.equal(retried.frozen_payload_json, admitted[1].frozen_payload_json)
  assert.notEqual(retried.batch_id, admitted[1].batch_id)
  assert.notEqual(retried.staging_session_id, admitted[1].staging_session_id)
  const retryCaptured = await captureFrozen(retried, project, 124)
  assert.equal(retryCaptured.frozenPayloadSha256, captured[1].frozenPayloadSha256)
  assert.equal(retryCaptured.targetSha256, captured[1].targetSha256)
  assert.deepEqual(retryCaptured.alphas, captured[1].alphas)
  captured.push(retryCaptured)
  report.retry = {
    firstJobId: admitted[1].id,
    retryJobId: retried.id,
    originalFrozen: captured[1],
    retryFrozen: retryCaptured,
  }
  report.progress.retryIntermediate = await progressProbe(project, retried, 1)
  await closeQueue()
  await expect
    .poll(
      async () => {
        const row = await job(retried.id)
        assert.ok(
          !['failed', 'canceled'].includes(row.status),
          `${row.error_code}: ${row.error_message}`,
        )
        return row.status
      },
      { timeout: timeout(900_000), intervals: [250, 500, 1000] },
    )
    .toBe('completed')
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).phase, {
      timeout: timeout(120_000),
    })
    .toBe('idle')
  assert.equal(await hashFile(project.file), editedPackageSha256)
  assert.deepEqual((await current(project)).generationDraft, edited.generationDraft)
  report.noImplicitSave.afterRetryCompletionPackageSha256 = await hashFile(project.file)
  const final = await progressSql()
  assert.equal(final.queue.length, 3)
  assert.equal(final.queue.filter(({ status }) => status === 'canceled').length, 1)
  assert.equal(final.queue.find(({ id }) => id === admitted[1].id).status, 'canceled')
  assert.deepEqual(
    final.receipts.map(({ queue_item_id, actual_seed }) => ({ queue_item_id, actual_seed })),
    [
      { queue_item_id: admitted[0].id, actual_seed: 123 },
      { queue_item_id: retried.id, actual_seed: 124 },
    ],
  )
  assert.equal(final.cursors.length, 1)
  assert.equal(final.cursors[0].actual_seed, 124)
  assert.deepEqual(final.receipts[0], firstHealthy.receipts[0])
  for (const row of final.queue) {
    const frozen = captured.find(({ row: source }) => source.id === row.id)
    assert.equal(row.frozen_payload_json, frozen.row.frozen_payload_json)
    const receipt = final.receipts.find(({ queue_item_id }) => queue_item_id === row.id)
    if (row.status === 'completed') {
      assert.equal(receipt.status, 'completed')
      assert.equal(receipt.frozen_payload_sha256, frozen.frozenPayloadSha256)
    } else assert.equal(receipt, undefined)
  }
  const observed = await observerSnapshot(),
    wires = regionalWires(observed)
  assert.deepEqual(observed.faults, [])
  assert.equal(wires.length, 3)
  assert.equal(new Set(wires.map(({ requestId }) => requestId)).size, 3)
  let scalarCount = 0
  for (const [index, wire] of wires.entries()) {
    const bundle = wire.bundleJson,
      frozen = captured[index]
    assert.equal(bundle.compositionProfile, 'invoke-canvas-v1')
    assert.equal(bundle.initializationProfile, initialization)
    assert.equal(bundle.layout, 'cfg-negative-first')
    assert.deepEqual(bundle.globalPositiveCoverage, { kind: 'everywhere' })
    assert.deepEqual(bundle.globalNegativeCoverage, { kind: 'everywhere' })
    assert.equal(bundle.positivePooledSourceId, 'current-canvas')
    assert.equal(bundle.negativePooledSourceId, 'current-canvas')
    assert.equal(bundle.request.job.sampling.seed, [123, 124, 124][index])
    if (globalLoraProfile) {
      assert.deepEqual(bundle.request.job.loras, globalLoraWireStack())
      assert.deepEqual(frozen.frozen.context.loraStack, configuredGlobalLoraStack())
      assert.deepEqual(frozen.frozen.context.loras, resolvedGlobalLoras())
      assert.deepEqual(frozen.frozen.workerJob.loras, globalLoraWireStack())
    }
    if (globalVaeProfile) {
      assert.deepEqual(bundle.request.job.vae, selectedVaeWire())
      assert.equal(bundle.request.job.vaePrecision, 'FP32')
      assert.deepEqual(frozen.frozen.workerJob.vae, selectedVaeWire())
      assert.equal(frozen.frozen.workerJob.vaePrecision, 'FP32')
      assert.deepEqual(frozen.frozen.context.vae.reference, selectedVaeReference())
      assert.equal(frozen.frozen.context.vaePrecision, 'FP32')
    }
    assertGlobalEmbeddingRecipe(bundle.recipe, [123, 124, 124][index])
    assert.deepEqual(bundle.recipe.item, frozen.regional.recipe.item)
    assert.deepEqual(bundle.recipe.bbox, bbox)
    assert.deepEqual(
      bundle.recipe.regions.map(({ regionId }) => regionId),
      project.document.regionalGuidance.map(({ id }) => id),
    )
    // Logical frozen command retains its concrete pair. Only native serialization clears resources.
    const {
      output: _output,
      target,
      embeddings: executionEmbeddings,
      ...execution
    } = bundle.request.job
    assert.ok(
      executionEmbeddings === undefined ||
        (executionEmbeddings.positive.length === 0 && executionEmbeddings.negative.length === 0),
    )
    const { embeddings: logicalEmbeddings, ...logical } = frozen.frozen.workerJob
    assert.deepEqual(logicalEmbeddings, globalTiWirePair([123, 124, 124][index]))
    const { path: _targetPath, ...descriptor } = target
    assert.deepEqual({ ...execution, target: descriptor }, logical)
    assert.equal(wire.target.observedSha256, frozen.targetSha256)
    assert.deepEqual(
      wire.alpha.map(({ sha256 }) => sha256),
      project.regionAlphas,
    )
    for (const alpha of wire.alpha) {
      assert.equal(alpha.positive, 1024 ** 2 / 2)
      assert.equal(alpha.opaque, alpha.positive)
    }
    const worker = observed.workers.find(({ pid }) => pid === wire.pid)
    for (const cap of [
      'illustrious-regional-invoke-init-v1',
      'illustrious-embeddings',
      'illustrious-regional-progress-v1',
      ...(globalLoraProfile ? ['illustrious-regional-lora-v1'] : []),
      ...(globalVaeProfile ? ['illustrious-regional-vae-v1'] : []),
      ...(dpmpp2mProfile ? ['illustrious-regional-dpmpp-2m-v1'] : []),
      ...(cfgRescaleProfile ? ['illustrious-regional-cfg-rescale-v1'] : []),
    ])
      assert.ok(worker.ready.capabilities.includes(cap))
    assert.equal(wire.reportProgress, true)
    const frames = worker.frames.filter(({ message }) => message.requestId === wire.requestId)
    const numeric = frames.filter(({ message }) => message.type === 'generation-progress')
    assert.deepEqual(
      numeric.map(({ message }) => message.step),
      Array.from({ length: numeric.length }, (_, i) => i + 1),
    )
    if (index === 1) {
      assert.ok(numeric.length >= 6 && numeric.length < 30)
      assert.ok(frames.every(({ message }) => message.type === 'generation-progress'))
    } else {
      assert.equal(numeric.length, 30)
      const done = frames.filter(({ message }) => message.type === 'generation-done')
      assert.equal(done.length, 1)
      assert.ok(numeric.at(-1).order < done[0].order)
      assert.equal(frames.filter(({ message }) => message.type === 'error').length, 0)
    }
    for (const { message } of numeric) {
      assert.deepEqual(Object.keys(message).sort(), [
        'protocolVersion',
        'requestId',
        'step',
        'totalSteps',
        'type',
      ])
      assert.equal(message.protocolVersion, '1')
      assert.equal(message.totalSteps, 30)
    }
    const main = observed.progress.filter(
      ({ snapshot }) => snapshot.current?.jobId === frozen.row.id,
    )
    assert.deepEqual(
      main.map(({ snapshot }) => snapshot.current.step),
      numeric.map(({ message }) => message.step),
    )
    for (const record of main) {
      assert.equal(record.originalCalls, 1)
      assert.equal(record.receiverMatches, true)
      assert.equal(record.snapshot.current.documentId, project.document.documentId)
      assert.equal(record.snapshot.current.projectKey, project.id)
      assert.equal(record.snapshot.current.totalSteps, 30)
    }
    scalarCount += numeric.length
  }
  assert.equal((await api('getGenerationProgress')).current, null)
  assert.equal(
    observed.workers
      .flatMap(({ writes }) => writes.flatMap(({ lines }) => lines))
      .filter(({ type }) => type === 'generate-illustrious-txt2img').length,
    0,
  )
  await verifyGlobalEmbeddingFiles()
  if (globalLoraProfile) {
    await verifyGlobalLoraFiles()
    report.globalLoraFlow = {
      configuredStack: configuredGlobalLoraStack(),
      resolvedStack: resolvedGlobalLoras(),
      workerStack: globalLoraWireStack(),
      editedSavedStack: editedLoraStack,
      allThreeLogicalCommandsRetainOriginalStack: true,
      frozenFullContextRetainsOriginalStack: true,
      nativeGlobalTiAbsentOrEmptyWithRecipeBindingsPreserved: true,
      lorasAddedToRecipe: false,
      originalRequestSeeds: [123, 124, 124],
      targetAndAlphaSourcesPreserved: true,
      numericalCausalityClaimed: false,
      extraNativeCalls: 0,
    }
  }
  if (globalVaeProfile) {
    await verifyGlobalVaeFiles()
    report.globalVaeFlow = {
      selectedReference: selectedVaeReference(),
      selectedWorkerDescriptor: selectedVaeWire(),
      selectedPrecision: 'FP32',
      defaultVersionId: globalVae.B.reference.localVersionId,
      editedSavedVae: edited.generationDraft.vae,
      editedSavedPrecision: edited.generationDraft.vaePrecision,
      originalRequestSeeds: [123, 124, 124],
      allThreeLogicalAndNativeCommandsRetainOriginalVaeAndPrecision: true,
      originalFrozenRetryPreserved: true,
      vaeAddedToRecipe: false,
      precisionAddedToRecipe: false,
      sourceFilesUnchanged: true,
      numericalCausalityClaimed: false,
      extraNativeCalls: 0,
    }
  }
  report.globalEmbeddingFlow = {
    priorZeroTiControlsPreserved: {
      packages: preservationBaseline.packages,
      controlPng: preservationBaseline.controlPng,
      comparedForEquality: false,
    },
    generateResponse: generateCall.response,
    originalBatchJobIds: admitted.map(({ id }) => id),
    canceledJobId: admitted[1].id,
    retryJobId: retried.id,
    stagingSessionIds: [admitted[0].staging_session_id, retried.staging_session_id],
    captured,
    finalQueue: final.queue,
    savedGlobalRefsRemovedOnlyFromCurrentDraft: true,
    originalBindingsPreservedForRetry: true,
    noNativeVectorOrContextObserver: true,
  }
  if (dynamicPositiveProfile) {
    report.dynamicPositiveFlow = {
      authoredPositive: { text: globalPrompt, embeddingRefs: authoredGlobalPositiveRefs() },
      selectedSettings: { maxPrompts: 2, seedBehavior: 'per-prompt' },
      iterations: 1,
      truncated: generateCall.response.value.truncated,
      discardedPositive: `${baseGlobalPrompt} unused ordinary detail`,
      selectedPlanResourceUnion: ['A', 'C'].map((key, index) =>
        globalTiDescriptor(key, index === 0 ? '<variant-a>' : '<variant-c>'),
      ),
      originalWirePositives: wires.map(({ bundleJson }) => ({
        text: bundleJson.recipe.globalPrompts.positive.text,
        item: bundleJson.recipe.item,
        resources: bundleJson.recipe.globalEmbeddings.positive,
      })),
      staticRegionalPrompts: localPrompts,
      savedEditedSettings: edited.generationDraft.dynamicPrompt,
      savedEditedPositive: edited.generationDraft.positivePrompt,
      originalMaskCoveragePreservedForRetry: true,
      authoredRefsRetainedButOnlyItemEffectiveGlobalsConsumed: true,
      exactFrozenRetryPreserved: true,
      noAdditionalCapabilityOrWorkerRefresh: true,
      extraNativeCalls: 0,
    }
    assert.deepEqual(
      wires.map(({ bundleJson }) => bundleJson.recipe.globalEmbeddings.positive[0].token),
      ['<variant-a>', '<variant-c>', '<variant-c>'],
    )
    assert.ok(
      wires.every(
        ({ bundleJson }) =>
          !bundleJson.recipe.globalPrompts.positive.text.includes('unused ordinary detail'),
      ),
    )
  }
  report.staticBatch = {
    captured: [captured[0], retryCaptured],
    orderedJobIds: [admitted[0].id, retried.id],
    stagingSessionId: admitted[0].staging_session_id,
    completedRows: final.queue.filter(({ status }) => status === 'completed'),
    receipts: final.receipts,
  }
  report.nativeAccounting = {
    regionalWireCount: 3,
    completedReceiptCount: 2,
    canceledSqlCount: 1,
    workerSpawnCount: observed.workers.length,
    originalScalarProgressEvents: scalarCount,
    stepCounterQualified: true,
    extraGenerateOrRetryRequested: false,
  }
  if (dpmpp2mProfile) {
    assert.equal(edited.generationDraft.sampling.sampler, 'Euler')
    assert.equal(edited.generationDraft.sampling.scheduler, 'Normal')
    assert.equal(edited.generationDraft.sampling.steps, 2)
    assert.ok(
      wires.every(({ bundleJson }) => bundleJson.request.job.sampling.scheduler === 'dpmpp_2m_k'),
    )
    report.dpmpp2mFlow = {
      originalSampler: 'DPM++ 2M',
      originalScheduler: 'Karras',
      originalSteps: 30,
      originalWireKeys: wires.map(({ bundleJson }) => bundleJson.request.job.sampling.scheduler),
      editedSavedSampling: edited.generationDraft.sampling,
      requiredInitialization: initialization,
      requiredCapability: 'illustrious-regional-dpmpp-2m-v1',
      nativeLoopCopied: false,
      numericalOrVisualCausalityClaimed: false,
    }
    check(
      'Original DPM++2M/Karras30 and explicit Invoke initialization survive saved Euler/Normal2 and frozen Retry; every executing peer advertises DPM support',
      report.dpmpp2mFlow,
    )
  }
  if (cfgRescaleProfile) {
    assert.equal(edited.generationDraft.cfgRescale, 0.2)
    assert.ok(wires.every(({ bundleJson }) => bundleJson.request.job.sampling.cfgRescale === 0.7))
    report.cfgRescaleFlow = {
      original: generationCfgRescale,
      editedSavedValue: edited.generationDraft.cfgRescale,
      actualWireValues: wires.map(({ bundleJson }) => bundleJson.request.job.sampling.cfgRescale),
      frozenRetryPreserved: true,
      newCapability: 'illustrious-regional-cfg-rescale-v1',
      numericalOrVisualCausalityClaimed: false,
    }
    check(
      'Actual CFG Rescale0.7 reaches all three native wires and frozen Retry after a real saved0.2 edit; executing peers advertise the regional capability',
      report.cfgRescaleFlow,
    )
  }
  check(
    dynamicPositiveProfile
      ? 'Two selected global-positive expansions retain A/C-specific resources, static regions and exact frozen C124 Retry after saved template/options/mask/LoRA/VAE edits; third alternative is truncated'
      : globalVaeProfile
        ? 'Original exact VAE A/FP32 with LoRA/TI survives observed Cancel and frozen Retry after real UI Embedded/FP16 and other saved authoring edits'
        : globalLoraProfile
          ? 'Original configured LoRA stack and effective A/B/Z commands survive observed Cancel and frozen Retry after saved LoRA/TI/seed/sampler/region edits'
          : 'Original global A/B and regional C/inherited B/local D survive the real batch, observed Cancel and frozen Retry after saved authoring edits',
    report.nativeAccounting,
  )
  return {
    row: final.queue.find(({ id }) => id === admitted[0].id),
    receipt: final.receipts[0],
    frozen: captured[0].frozen,
    edited,
  }
}

function ownRecoverySql(whole) {
  assert.ok(recoveryProject?.id)
  return Object.fromEntries(
    Object.entries(whole).map(([name, rows]) => [
      name,
      rows.filter(({ local_project_key }) => local_project_key === recoveryProject.id),
    ]),
  )
}
function assertBaselineSql(whole) {
  assert.ok(baselineSql && recoveryProject?.id)
  for (const [name, rows] of Object.entries(whole))
    assert.deepEqual(
      rows.filter(({ local_project_key }) => local_project_key !== recoveryProject.id),
      baselineSql[name],
      `Historical pool ${name} must remain unchanged`,
    )
}
async function recoverySql() {
  const whole = await sqlSnapshot()
  assertBaselineSql(whole)
  return ownRecoverySql(whole)
}
async function assertLifetimePins() {
  assert.deepEqual(await captureFiles(sourceFiles), report.sourceSha256)
  assert.deepEqual(await captureFiles(bundleFiles), report.bundleSha256)
  assert.deepEqual(await treeManifest(provision.installed.workerRoot), installedTree)
  assert.deepEqual(await jsonFile(path.join(appDataRoot, 'qualification-runtime.json')), marker)
  assert.deepEqual(await jsonFile(path.join(appDataRoot, 'runtime/current-runtime.json')), pointer)
  assert.equal(await hashFile(fixture.provisionReport.path), fixture.provisionReport.sha256)
  assert.deepEqual(statIdentity(await regular(fixture.checkpoint.path)), modelStat)
  for (const file of baselinePackages) assert.equal(await hashFile(file.path), file.sha256)
  await assertRuntimeIdle(appDataRoot, provision.installed.basePrefix)
  if (mainDeathProfile) await assertMainDeathControls()
}
async function prepareMainDeathControls() {
  if (!mainDeathProfile) return
  const scratch = path.join(appDataRoot, 'scratch')
  await directory(scratch)
  const unmarkedRoot = path.join(
    scratch,
    `regional-request-${randomUUID().replaceAll('-', '').slice(0, 6)}`,
  )
  await mkdir(unmarkedRoot, { mode: 0o700 })
  const descriptors = [
    {
      path: path.join(unmarkedRoot, 'target.png'),
      bytes: Buffer.from('unmarked private legacy control'),
    },
    {
      path: path.join(scratch, `main-death-unrelated-${randomUUID()}.txt`),
      bytes: Buffer.from('unrelated scratch control'),
    },
  ]
  const files = []
  for (const item of descriptors) {
    await writeFile(item.path, item.bytes, { flag: 'wx', mode: 0o600 })
    files.push({
      path: item.path,
      sha256: digest(item.bytes),
      byteSize: item.bytes.length,
      inode: (await lstat(item.path)).ino,
    })
  }
  mainDeathControls = { unmarkedRoot, unmarkedInode: (await lstat(unmarkedRoot)).ino, files }
  report.mainDeathControls = mainDeathControls
  checkpoint()
}
async function assertMainDeathControls() {
  await directory(mainDeathControls.unmarkedRoot)
  assert.equal((await lstat(mainDeathControls.unmarkedRoot)).ino, mainDeathControls.unmarkedInode)
  await assertPathAbsent(path.join(mainDeathControls.unmarkedRoot, '.owner-v1.json'))
  for (const item of mainDeathControls.files) {
    const entry = await regular(item.path)
    assert.equal(entry.ino, item.inode)
    assert.equal(entry.nlink, 1)
    assert.equal(entry.size, item.byteSize)
    assert.equal(await hashFile(item.path), item.sha256)
  }
}
async function assertPathAbsent(file) {
  const entry = await lstat(file).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  assert.equal(entry, null, `Expected no retained pathname: ${file}`)
}
function assertRecoveryWire(wire, captured, project) {
  assert.equal(wire.type, 'execute-current-canvas-regional')
  assert.equal(wire.requestId, wire.bundleJson.request.requestId)
  assert.equal(wire.bundleJson.compositionProfile, 'invoke-canvas-v1')
  assert.equal(wire.bundleJson.layout, 'cfg-negative-first')
  for (const sign of ['Positive', 'Negative']) {
    assert.deepEqual(wire.bundleJson[`global${sign}Coverage`], { kind: 'everywhere' })
    assert.equal(wire.bundleJson[`${sign.toLowerCase()}PooledSourceId`], 'current-canvas')
  }
  assert.deepEqual(wire.bundleJson.request.job.bbox, bbox)
  assert.equal(wire.bundleJson.request.job.sampling.steps, 30)
  assert.equal(wire.bundleJson.request.job.sampling.seed, 123)
  assert.equal(wire.bundleJson.request.job.sampling.cfgScale, 5)
  assert.deepEqual(wire.bundleJson.request.job.sampling.noiseProfile, policy)
  assert.equal(wire.bundleJson.request.job.checkpoint.sha256, fixture.checkpoint.sha256)
  assert.equal(wire.target.sha256, captured.targetSha256)
  assert.equal(wire.target.observedSha256, captured.targetSha256)
  assert.deepEqual(
    wire.alpha.map(({ sha256 }) => sha256),
    project.regionAlphas,
  )
  assert.deepEqual(
    wire.bundleJson.recipe.regions.map(({ regionId }) => regionId),
    project.document.regionalGuidance.map(({ id }) => id),
  )
  if (mainDeathProfile) {
    assert.equal(wire.ownerMarker.value.main.pid, wire.ownerMarker.capturedMainPid)
    assert.equal(wire.ownerMarker.value.worker.pid, wire.pid)
    assert.equal(wire.ownerMarker.value.kind, 'regional-transport-owner-v1')
  }
}
async function originalIpcFinished(channel, expectedCount = 1) {
  await expect
    .poll(
      async () => {
        const calls = (await observerSnapshot()).ipc.filter((call) => call.channel === channel)
        assert.ok(calls.length <= expectedCount)
        for (const call of calls)
          if (call.finished) assert.equal(call.ok, true, JSON.stringify(call))
        return (
          calls.length === expectedCount &&
          calls.every(({ finished, ok }) => finished && ok === true)
        )
      },
      { timeout: timeout(180_000) },
    )
    .toBe(true)
}
async function originalRegionalWire(id, captured) {
  let evidence
  await expect
    .poll(
      async () => {
        const row = await job(id)
        if (row.status === 'pending') return false
        assert.equal(
          row.status,
          'running',
          `The native interruption cut was missed: ${row.status}: ${row.error_message}`,
        )
        const sql = await recoverySql()
        assert.equal(
          sql.receipts.some(({ queue_item_id }) => queue_item_id === id),
          false,
        )
        const observed = await observerSnapshot()
        assert.deepEqual(observed.faults, [])
        const wires = regionalWires(observed)
        assert.ok(wires.length <= 1)
        if (wires.length !== 1) return false
        assertRecoveryWire(wires[0], captured, recoveryProject)
        const worker = observed.workers.find(({ pid }) => pid === wires[0].pid)
        assert.ok(worker?.identity)
        const guarded = worker.ready?.capabilities?.includes('linux-owned-inference-v1') === true
        assert.ok(
          worker.args.includes(
            guarded ? 'imagegen_worker.owned_inference' : 'imagegen_worker.inference_main',
          ),
        )
        if (mainDeathProfile) assert.equal(guarded, true)
        for (const write of worker.writes) {
          assert.equal(write.originalCalls, 1)
          assert.equal(write.receiverMatches, true)
          assert.equal(write.thrown, undefined)
        }
        assert.equal(worker.exit, null)
        evidence = { row, wire: wires[0], worker: structuredClone(worker) }
        return true
      },
      { timeout: timeout(240_000), intervals: [100, 250, 500] },
    )
    .toBe(true)
  return evidence
}
async function readProcessIdentity(pid) {
  const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
  const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  assert.match(start, /^\d+$/)
  const group = (await readFile(`/proc/${pid}/cgroup`, 'utf8'))
    .trim()
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3)
  assert.ok(group?.startsWith('/') && group !== '/')
  return { pid, start, group }
}
async function ownedGpuRows(pid) {
  assert.ok(Number.isSafeInteger(pid) && pid > 1)
  const { stdout } = await exec(
    'nvidia-smi',
    ['--query-compute-apps=pid,used_gpu_memory', '--format=csv,noheader,nounits'],
    { timeout: timeout(10_000), maxBuffer: 64 * 1024 },
  )
  const rows = []
  for (const line of stdout.split('\n')) {
    const fields = line.split(',').map((value) => value.trim())
    if (fields[0] !== String(pid)) continue
    assert.equal(fields.length, 2)
    assert.match(fields[1], /^\d+$/)
    const usedGpuMemoryMiB = Number(fields[1])
    assert.ok(Number.isSafeInteger(usedGpuMemoryMiB))
    rows.push({ pid, usedGpuMemoryMiB })
  }
  return rows
}
/** Deliberate failure only: never invokes native.close or any production cancellation action. */
async function crashNative(label, beforeSignal, afterExit, activeWorker = null) {
  assert.ok(recoveryProfile && activeLifetime && application)
  clearInterval(sampler)
  await sampling
  const nativeProcess = application.process()
  await beforeSignal()
  const observed = await retainObservers(true)
  assert.deepEqual(observed.faults, [])
  await database.close()
  database = null
  // Re-read actual bounds after removing the diagnostic connection; never reuse a previous life.
  await bounds(`${label}-before-signal`, mainDeathProfile)
  const bounded = nativeChecks.findLast(({ processIdentities }) =>
    processIdentities.some(({ pid }) => pid === nativeProcess.pid),
  )
  const identity = bounded?.processIdentities.find(({ pid }) => pid === nativeProcess.pid)
  const scope = bounded?.groups.find(
    ({ ownedScope, pids }) => ownedScope && pids.includes(nativeProcess.pid),
  )
  assert.ok(identity && scope, 'Fault requires the exact owned PID-named Electron scope')
  assert.deepEqual(await readProcessIdentity(nativeProcess.pid), {
    ...identity,
    group: scope.group,
  })
  if (activeWorker) {
    assert.deepEqual(
      await readProcessIdentity(activeWorker.pid),
      { pid: activeWorker.pid, start: activeWorker.identity.start, group: scope.group },
      'The original wire worker must still be alive in the owned crash scope',
    )
  }
  activeLifetime.crashCut = {
    label,
    main: identity,
    group: scope.group,
    activeWorker: activeWorker?.identity ?? null,
    at: new Date().toISOString(),
  }
  if (mainDeathProfile && activeWorker) {
    activeLifetime.crashCut.ownedGpu = {
      identity: activeWorker.identity,
      before: await ownedGpuRows(activeWorker.pid),
      beforeAt: new Date().toISOString(),
    }
  }
  checkpoint()
  const signaled = mainDeathProfile
    ? await signalQualificationMain({ ...identity, group: scope.group })
    : await stopExpiredQualificationProcess({ ...identity, group: scope.group })
  assert.equal(signaled.signalRequested, true)
  const exited = await confirmQualificationProcessExit(nativeChecks)
  assert.equal(exited.confirmed, true)
  if (mainDeathProfile && activeWorker) {
    activeLifetime.crashCut.ownedGpu.after = await ownedGpuRows(activeWorker.pid)
    activeLifetime.crashCut.ownedGpu.afterAt = new Date().toISOString()
    assert.deepEqual(activeLifetime.crashCut.ownedGpu.after, [])
  }
  assert.equal(nativeProcess.signalCode, 'SIGKILL')
  const closure = {
    label,
    intentional: true,
    ...(mainDeathProfile ? { mainOnly: true, scopeProof: scope.scopeProof } : {}),
    ...exited,
    signal: signaled,
    processExitCode: nativeProcess.exitCode,
    signalCode: nativeProcess.signalCode,
  }
  report.nativeClosures.push(closure)
  activeLifetime.closure = closure
  activeLifetime.resourceChecks = structuredClone(nativeChecks)
  activeLifetime.finishedAt = new Date().toISOString()
  application = null
  window = null
  nativeChecks.length = 0
  memoryGroups.clear()
  database = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  try {
    await afterExit()
  } finally {
    await database.close()
    database = null
  }
  await assertLifetimePins()
  checkpoint()
}
async function editAndSaveRecoveryDraft(project) {
  const steps = window.locator('input[aria-label="Steps"]')
  await steps.fill('2')
  await steps.press('Enter')
  const seed = window.locator('input[aria-label="Generation seed"]')
  await seed.fill('124')
  await seed.press('Enter')
  for (const region of project.document.regionalGuidance)
    await window
      .locator(`[data-regional-guidance-id="${region.id}"]`)
      .getByRole('button', { name: `Hide ${region.name}`, exact: true })
      .click()
  await expect
    .poll(
      async () => {
        const tab = await current(project)
        return {
          steps: tab.generationDraft.sampling.steps,
          seed: tab.generationDraft.seed,
          enabled: tab.regionalGuidance.map(({ enabled }) => enabled),
        }
      },
      { timeout: timeout() },
    )
    .toEqual({ steps: 2, seed: { policy: 'fixed', value: 124 }, enabled: [false, false] })
  await save(project)
  await originalIpcFinished('projects:save')
  const tab = await current(project)
  assert.equal(tab.dirty, false)
  assert.deepEqual(tab.layers, [])
  const packageSha256 = await hashFile(project.file)
  report.currentAuthoringAfterEdit = {
    generationDraft: tab.generationDraft,
    regionalGuidance: portableRegions(tab),
    packageSha256,
  }
  await screenshot('recovery-edited-saved-current-draft')
  return { tab, packageSha256 }
}
async function captureRecoveryCandidate(project, completed) {
  await expect
    .poll(async () => (await api('listGenerationResults', project.id)).candidates.length, {
      timeout: timeout(120_000),
    })
    .toBe(1)
  const snapshot = await api('listGenerationResults', project.id),
    candidate = snapshot.candidates[0]
  assert.equal(candidate.queueItemId, completed.row.id)
  assert.equal(candidate.actualSeed, 123)
  assert.equal(candidate.sourceDocumentMismatch, false)
  assert.equal(snapshot.lastActualSeed, 123)
  assert.deepEqual(snapshot.unfinishedSiblingJobIds, [])
  const bytes = await fetchPng(candidate.imageUrl),
    decoded = decodePng(bytes)
  assert.equal(digest(bytes), completed.receipt.image_sha256)
  assert.equal(bytes.length, completed.receipt.image_byte_size)
  assert.equal(decoded.width, 1024)
  assert.equal(decoded.height, 1024)
  assert.equal(decoded.channels, 3)
  assert.equal(decoded.iccSha256, IGS_SRGB_ICC_SHA256)
  assert.equal((await browserDecode(candidate.imageUrl)).rgbaSha256, decoded.rgbaSha256)
  return {
    candidate,
    bytes,
    rgbaSha256: decoded.rgbaSha256,
    receipt: completed.receipt,
    cursor: (await recoverySql()).cursors[0],
  }
}
function stableCandidate(candidate) {
  const value = structuredClone(candidate)
  delete value.imageUrl
  delete value.thumbnailUrl
  return value
}
async function recoveryThreeLifetimes() {
  const project = projects.find(({ mode }) => mode === 'transparent')
  recoveryProject = project
  await openProject(project)
  assert.deepEqual(await recoverySql(), { queue: [], receipts: [], cursors: [] })
  const count = window.locator('input[aria-label="Images per click"]')
  await count.fill('1')
  await count.press('Enter')
  await expect(count).toHaveValue('1')
  await expect(window.locator('input[aria-label="Steps"]')).toHaveValue('30')
  await expect(window.locator('input[aria-label="Generation seed"]')).toHaveValue('123')
  const generate = window.getByRole('button', { name: 'Generate', exact: true })
  await expect(generate).toBeEnabled({ timeout: timeout(120_000) })
  await generate.click()
  await expect
    .poll(async () => (await recoverySql()).queue.length, { timeout: timeout(180_000) })
    .toBe(1)
  const first = (await recoverySql()).queue[0],
    captured = await captureFrozen(first, project)
  const dispatch = await originalRegionalWire(first.id, captured)
  await originalIpcFinished('projects:generate')
  report.recovery = {
    interrupted: captured,
    activeWire: dispatch,
    initialPackageSha256: project.initialPackageSha256,
  }
  if (mainDeathProfile) {
    previousTransport = {
      path: dispatch.wire.stagingRoot,
      markerSha256: dispatch.wire.ownerMarker.sha256,
      marker: dispatch.wire.ownerMarker.value,
    }
    report.previousTransport = previousTransport
    assert.equal(
      await hashFile(path.join(previousTransport.path, '.owner-v1.json')),
      previousTransport.markerSha256,
    )
  }
  await crashNative(
    mainDeathProfile ? 'lifetime-1-main-only-crash' : 'lifetime-1-active-regional-crash',
    async () => {
      const sql = await recoverySql()
      assert.equal(sql.queue.length, 1)
      assert.equal(sql.queue[0].status, 'running')
      assert.deepEqual(sql.receipts, [])
      assert.deepEqual(sql.cursors, [])
      assert.equal(await hashFile(project.file), project.initialPackageSha256)
    },
    async () => {
      const sql = await recoverySql()
      assert.equal(
        sql.queue[0].status,
        'running',
        'A completed or canceled pre-signal row is a missed crash cut',
      )
      assert.equal(sql.queue[0].frozen_payload_json, first.frozen_payload_json)
      assert.deepEqual(sql.receipts, [])
      assert.deepEqual(sql.cursors, [])
      report.recovery.afterActiveCrash = sql
      if (mainDeathProfile) {
        await directory(previousTransport.path)
        assert.equal(
          await hashFile(path.join(previousTransport.path, '.owner-v1.json')),
          previousTransport.markerSha256,
        )
      }
    },
    dispatch.worker,
  )
  check(
    mainDeathProfile
      ? 'First real regional wire interrupted by verified Main-only pidfd SIGKILL; Python/all observed processes exited without child or scope signals'
      : 'First real regional wire interrupted by exact owned-scope SIGKILL; no receipt/cursor/Save and independent physical exit confirmed',
  )

  await launch()
  const restarted = await recoverySql()
  assert.equal(restarted.queue.length, 1)
  const canceled = restarted.queue[0]
  assert.equal(canceled.status, 'canceled')
  assert.equal(canceled.error_code, 'APP_RESTART')
  assert.equal(canceled.status_sequence, dispatch.row.status_sequence + 1)
  assert.equal(canceled.frozen_payload_json, first.frozen_payload_json)
  assert.deepEqual(restarted.receipts, [])
  assert.deepEqual(restarted.cursors, [])
  assert.equal(
    regionalWires(await observerSnapshot()).length,
    0,
    'Startup never automatically resumes interrupted regional work',
  )
  await openProject(project)
  await expect(window.getByRole('dialog', { name: 'Recovery available', exact: true })).toHaveCount(
    0,
  )
  assert.equal(await hashFile(project.file), project.initialPackageSha256)
  const edited = await editAndSaveRecoveryDraft(project)
  await openQueue()
  await expect(queueRow(first.id)).toContainText('Canceled')
  await expect(queueRow(first.id)).toContainText('Seed 123')
  await queueRow(first.id).getByRole('button', { name: 'Retry job', exact: true }).click()
  await originalIpcFinished('projects:retry-generation-job')
  await expect
    .poll(async () => (await recoverySql()).queue.length, { timeout: timeout(180_000) })
    .toBe(2)
  const retried = (await recoverySql()).queue.find(({ id }) => id !== first.id)
  assert.equal(retried.operation, 'illustrious-regional-txt2img')
  assert.equal(retried.frozen_payload_json, first.frozen_payload_json)
  const retryCaptured = await captureFrozen(retried, project)
  assert.equal(retryCaptured.frozenPayloadSha256, captured.frozenPayloadSha256)
  assert.equal(retryCaptured.targetSha256, captured.targetSha256)
  report.retry = {
    firstJobId: first.id,
    retryJobId: retried.id,
    originalFrozen: captured,
    retryFrozen: retryCaptured,
  }
  await closeQueue()
  await expect
    .poll(
      async () => {
        const row = await job(retried.id)
        if (['failed', 'canceled'].includes(row.status))
          assert.fail(`Frozen regional Retry failed: ${row.error_code}: ${row.error_message}`)
        return row.status
      },
      { timeout: timeout(900_000), intervals: [250, 500, 1000] },
    )
    .toBe('completed')
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).phase, {
      timeout: timeout(120_000),
    })
    .toBe('idle')
  const completedSql = await recoverySql()
  assert.equal(completedSql.queue.length, 2)
  assert.equal(completedSql.receipts.length, 1)
  assert.equal(completedSql.cursors.length, 1)
  assert.equal(
    completedSql.queue.find(({ id }) => id === first.id).status_sequence,
    canceled.status_sequence + 1,
  )
  const receipt = completedSql.receipts[0]
  assert.equal(receipt.status, 'completed')
  assert.equal(receipt.queue_item_id, retried.id)
  assert.equal(receipt.actual_seed, 123)
  assert.equal(receipt.frozen_payload_sha256, captured.frozenPayloadSha256)
  const completed = {
    row: await job(retried.id),
    receipt,
    frozen: captured.frozen,
    edited: edited.tab,
  }
  const survivor = await captureRecoveryCandidate(project, completed)
  assert.equal(survivor.cursor.actual_seed, 123)
  assert.equal(
    await hashFile(project.file),
    edited.packageSha256,
    'Completion must not Save or accept the surviving candidate',
  )
  assert.equal((await current(project)).dirty, false)
  assert.deepEqual((await current(project)).layers, [])
  const secondObserved = await observerSnapshot(),
    secondWires = regionalWires(secondObserved)
  if (mainDeathProfile) {
    const ready = secondObserved.workers.filter(({ startupRecovery }) => startupRecovery)
    assert.ok(ready.length > 0, 'The next actual owned worker Ready must be witnessed')
    assert.ok(
      ready.every(
        ({ startupRecovery }) =>
          startupRecovery.previousAbsent &&
          startupRecovery.previousDirectoryInodeAbsent &&
          startupRecovery.previousTransport === previousTransport.path,
      ),
    )
    await assertPathAbsent(previousTransport.path)
    await assertMainDeathControls()
    report.automaticLeaseRecovery = {
      previousTransport,
      ready: ready.map(({ pid, ready, startupRecovery }) => ({ pid, ready, startupRecovery })),
    }
    // This lease has now been witnessed absent before Ready. Later lifetimes retain this
    // report, rather than incorrectly demanding the already-reclaimed lease exist again.
    previousTransport = null
  }
  assert.equal(secondWires.length, 1)
  assertRecoveryWire(secondWires[0], captured, project)
  assert.notEqual(secondWires[0].requestId, dispatch.wire.requestId)
  let successfulWorker
  await expect
    .poll(
      async () => {
        const observed = await observerSnapshot()
        assert.deepEqual(observed.faults, [])
        successfulWorker = observed.workers.find(({ pid }) => pid === secondWires[0].pid)
        assert.ok(successfulWorker?.identity)
        return successfulWorker.exit !== null && successfulWorker.close !== null
      },
      { timeout: timeout() },
    )
    .toBe(true)
  const successfulWorkerExit = await confirmQualificationProcessExit([
    {
      processIdentities: [{ pid: successfulWorker.pid, start: successfulWorker.identity.start }],
      groups: [],
    },
  ])
  assert.equal(successfulWorkerExit.confirmed, true)
  report.recovery.successfulExecutionExitBeforeSecondCrash = {
    identity: successfulWorker.identity,
    exit: successfulWorker.exit,
    close: successfulWorker.close,
    physicalExit: successfulWorkerExit,
  }
  report.recovery.survivor = {
    candidate: stableCandidate(survivor.candidate),
    pngSha256: digest(survivor.bytes),
    byteSize: survivor.bytes.length,
    rgbaSha256: survivor.rgbaSha256,
    receipt: survivor.receipt,
    cursor: survivor.cursor,
    packageSha256: edited.packageSha256,
  }
  await screenshot('recovery-unaccepted-before-second-crash')
  await crashNative(
    mainDeathProfile
      ? 'lifetime-2-main-only-candidate-crash'
      : 'lifetime-2-unaccepted-candidate-crash',
    async () => {
      assert.deepEqual(await recoverySql(), completedSql)
      assert.equal((await api('listGenerationResults', project.id)).candidates.length, 1)
      assert.equal(await hashFile(project.file), edited.packageSha256)
    },
    async () => {
      assert.deepEqual(await recoverySql(), completedSql)
      assert.equal(await hashFile(project.file), edited.packageSha256)
    },
  )
  check(
    'Startup APP_RESTART and explicit frozen UI Retry preserve original 30-step/123 recipe after edited Save; completed candidate retained through a second physical crash',
  )

  await launch()
  assert.deepEqual(await recoverySql(), completedSql)
  assert.equal(regionalWires(await observerSnapshot()).length, 0)
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'Refresh projects', exact: true }).click()
  await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
  const recovery = window.getByRole('dialog', { name: 'Recovery available', exact: true })
  await expect(recovery).toBeVisible({ timeout: timeout() })
  await recovery.getByRole('button', { name: 'Recover', exact: true }).click()
  await originalIpcFinished('projects:resolve-recovery')
  await expect(recovery).toHaveCount(0)
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toBeVisible()
  await expect(window.locator('input[aria-label="Images per click"]')).toBeEnabled({
    timeout: timeout(),
  })
  const recovered = await current(project)
  assert.equal(recovered.dirty, false)
  assert.deepEqual(recovered.layers, [])
  assert.deepEqual(recovered.generationDraft, edited.tab.generationDraft)
  assert.deepEqual(portableRegions(recovered), portableRegions(edited.tab))
  assert.deepEqual(recovered.primaryBbox, bbox)
  assert.equal(
    await hashFile(project.file),
    edited.packageSha256,
    'Home Recover must not Save the portable Project',
  )
  const restored = await captureRecoveryCandidate(project, completed)
  assert.deepEqual(stableCandidate(restored.candidate), stableCandidate(survivor.candidate))
  assert.equal(restored.bytes.equals(survivor.bytes), true)
  assert.equal(restored.rgbaSha256, survivor.rgbaSha256)
  assert.deepEqual(restored.receipt, survivor.receipt)
  assert.deepEqual(restored.cursor, survivor.cursor)
  assert.deepEqual(await recoverySql(), completedSql)
  await screenshot('recovery-surviving-results')
  check(
    'Third lifetime real Home Recover preserves exact temporary candidate/receipt/cursor and saved edited authoring without auto-resume, acceptance or Save',
  )
  await resultsAddSaveReopen(project, completed)
}

async function assertRecoveryActions() {
  const currentObserved = await retainObservers(false)
  const observed = [...report.lifetimes.map(({ observers }) => observers), currentObserved]
  assert.equal(observed.length, 3)
  const calls = observed.flatMap(({ ipc }) => ipc),
    wires = observed.flatMap(regionalWires)
  for (const value of observed) assert.deepEqual(value.faults, [])
  for (const call of calls) {
    assert.equal(call.originalCalls, 1)
    assert.equal(call.finished, true, `Unfinished original IPC: ${call.channel}`)
    assert.equal(call.ok, true, JSON.stringify(call))
  }
  const expected = {
    'projects:generate': 1,
    'projects:retry-generation-job': 1,
    'projects:accept-generation-candidates': 1,
    'projects:undo': 1,
    'projects:redo': 1,
    'projects:save': 2,
    'projects:resolve-recovery': 1,
    'projects:cancel-current-generation': 0,
    'projects:cancel-generation-job': 0,
  }
  for (const [channel, count] of Object.entries(expected))
    assert.equal(
      calls.filter((call) => call.channel === channel).length,
      count,
      `Unexpected original UI ${channel} count`,
    )
  const generated = calls.find(({ channel }) => channel === 'projects:generate')
  assert.deepEqual(generated.args[1], {
    documentId: recoveryProject.document.documentId,
    iterations: 1,
  })
  assert.equal(
    calls.find(({ channel }) => channel === 'projects:retry-generation-job').args[0].id,
    report.retry.firstJobId,
  )
  assert.deepEqual(calls.find(({ channel }) => channel === 'projects:resolve-recovery').args, [
    recoveryProject.id,
    'recover',
  ])
  assert.equal(wires.length, 2)
  assert.equal(new Set(wires.map(({ requestId }) => requestId)).size, 2)
  for (const wire of wires) assertRecoveryWire(wire, report.retry.originalFrozen, recoveryProject)
  const ordinary = observed
    .flatMap(({ workers }) => workers.flatMap(({ writes }) => writes.flatMap(({ lines }) => lines)))
    .filter(({ type }) => type === 'generate-illustrious-txt2img')
  assert.deepEqual(ordinary, [])
  const sql = await recoverySql()
  assert.equal(sql.queue.length, 2)
  assert.equal(sql.receipts.length, 1)
  assert.equal(sql.cursors.length, 1)
  report.nativeAccounting = {
    regionalWireCount: 2,
    completedReceiptCount: 1,
    canceledSqlCount: 1,
    intentionalScopeCrashes: mainDeathProfile ? 0 : 2,
    ...(mainDeathProfile
      ? {
          intentionalMainOnlyCrashes: 2,
          fallbackChildOrScopeSignals: report.fallbackSignals.length,
        }
      : {}),
    lifetimeCount: 3,
    workerSpawnCountWholeRun: observed.reduce((sum, value) => sum + value.workers.length, 0),
    stepCounterQualified: false,
  }
  if (mainDeathProfile) assert.deepEqual(report.fallbackSignals, [])
  check(
    'Three real UI lifetimes retain prior pool and exact frozen request/candidate through two physical crashes, one explicit Retry and one explicit Recover',
    report.nativeAccounting,
  )
}

async function fetchPng(url) {
  const response = await application.evaluate(async ({ net }, url) => {
    const response = await net.fetch(url)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > 32 * 1024 ** 2)
      throw new Error('Signed image exceeds qualification bound')
    return { status: response.status, bytes: Array.from(bytes) }
  }, url)
  assert.equal(response.status, 200)
  return Buffer.from(response.bytes)
}
async function browserDecode(url) {
  return await window.evaluate(
    async ({ url, side }) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.src = url
      await image.decode()
      if (image.naturalWidth !== side || image.naturalHeight !== side)
        throw new Error('Browser decoded unexpected image size')
      const bitmap = document.createElement('canvas')
      bitmap.width = image.naturalWidth
      bitmap.height = image.naturalHeight
      const context = bitmap.getContext('2d', { willReadFrequently: true })
      context.drawImage(image, 0, 0)
      const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', rgba))]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')
      return { width: image.naturalWidth, height: image.naturalHeight, rgbaSha256: sha256 }
    },
    { url, side },
  )
}
async function assertBrowserPixels(url, decoded) {
  if (!outpaintProfile) {
    const observed = await browserDecode(url)
    assert.equal(observed.rgbaSha256, decoded.rgbaSha256)
    return observed
  }
  // Canvas premultiplies soft-alpha RGB, so compare the independently decoded
  // PNG after opaque-black compositing. Integer rounding may differ by one RGB
  // unit; alpha must remain exact. Raw PNG/control equality stays byte-exact.
  const observed = await window.evaluate(
    async ({ url, width, height, expectedBase64 }) => {
      const raw = Uint8Array.from(atob(expectedBase64), (value) => value.charCodeAt(0))
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.src = url
      await image.decode()
      if (image.naturalWidth !== width || image.naturalHeight !== height)
        throw new Error('Browser decoded unexpected contribution size')
      const surface = document.createElement('canvas')
      surface.width = width
      surface.height = height
      const context = surface.getContext('2d', { willReadFrequently: true })
      context.drawImage(image, 0, 0)
      const transparent = context.getImageData(0, 0, width, height).data
      let differentAlpha = 0
      for (let i = 3; i < raw.length; i += 4) differentAlpha += Number(transparent[i] !== raw[i])
      context.fillStyle = '#000000'
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, 0)
      const opaque = context.getImageData(0, 0, width, height).data
      let maximumCompositeRgbError = 0
      for (let i = 0; i < raw.length; i += 4)
        for (let channel = 0; channel < 3; channel++)
          maximumCompositeRgbError = Math.max(
            maximumCompositeRgbError,
            Math.abs(opaque[i + channel] - Math.round((raw[i + channel] * raw[i + 3]) / 255)),
          )
      return {
        width,
        height,
        differentAlpha,
        maximumCompositeRgbError,
        rgbRoundingBound: 1,
        alphaExact: differentAlpha === 0,
      }
    },
    {
      url,
      width: decoded.width,
      height: decoded.height,
      expectedBase64: decoded.rgba.toString('base64'),
    },
  )
  assert.equal(observed.differentAlpha, 0)
  assert.ok(observed.maximumCompositeRgbError <= observed.rgbRoundingBound)
  return observed
}
async function assertInstalledOutpaint(captured, outputBytes) {
  assert.ok(outpaintProfile && captured.frozen.context.kind === 'normal-outpaint-preparation')
  const sourcePath = path.join(appDataRoot, 'generation-inputs', captured.row.id, 'target.png')
  const sourceBytes = await readFile(sourcePath)
  assert.equal(digest(sourceBytes), captured.frozen.context.conditioning.sourceTarget.sha256)
  const alpha = await assertOutpaintContribution(
    captured.frozen.context.conditioning,
    sourceBytes,
    outputBytes,
  )
  const source = decodePng(sourceBytes),
    output = decodePng(outputBytes),
    merged = Buffer.alloc(source.rgba.length)
  assert.equal(source.channels, 4)
  assert.equal(output.channels, 4)
  let protectedPixels = 0,
    generatedPixels = 0,
    softPixels = 0,
    authoredProtectedInteriorPixels = 0
  for (let i = 0; i < source.rgba.length; i += 4) {
    const sourceAlpha = source.rgba[i + 3],
      contributionAlpha = output.rgba[i + 3],
      a = contributionAlpha / 255,
      b = (sourceAlpha / 255) * (1 - a),
      total = a + b
    if ((i / 4) % side < side / 4) {
      assert.equal(sourceAlpha, 255)
      assert.equal(contributionAlpha, 0)
      authoredProtectedInteriorPixels++
    }
    merged[i + 3] = Math.round(total * 255)
    for (let channel = 0; channel < 3; channel++)
      merged[i + channel] = total
        ? Math.round((output.rgba[i + channel] * a + source.rgba[i + channel] * b) / total)
        : 0
    if (contributionAlpha === 0 && sourceAlpha === 255) {
      protectedPixels++
      assert.equal(merged[i + 3], 255)
      assert.ok(merged.subarray(i, i + 4).equals(source.rgba.subarray(i, i + 4)))
    }
    if (contributionAlpha === 255) generatedPixels++
    else if (contributionAlpha > 0) softPixels++
  }
  assert.ok(protectedPixels > 0 && generatedPixels > 0 && softPixels > 0)
  assert.equal(authoredProtectedInteriorPixels, (side * side) / 4)
  return {
    alpha,
    sourceSha256: digest(sourceBytes),
    sourceRgbaSha256: source.rgbaSha256,
    rawContributionRgbaSha256: output.rgbaSha256,
    mergedRgbaSha256: digest(merged),
    protectedPixels,
    authoredProtectedInteriorPixels,
    generatedPixels,
    softPixels,
    protectedSourceExact: true,
    policyVerifiedByIndependentMainOwner: true,
  }
}
async function observeCanvas(label, decoded, imageUrl, source = null) {
  await expect(canvas().locator('.canvas-area')).toHaveAttribute('data-scene-ready', 'true', {
    timeout: timeout(),
  })
  let samples
  await expect
    .poll(
      async () => {
        samples = await canvas()
          .locator('.canvas-area')
          .evaluate(
            async (host, { bbox, imageUrl, exactBackingScale, source }) => {
              const bitmap = host.querySelector('.konvajs-content canvas')
              if (!(bitmap instanceof HTMLCanvasElement))
                throw new Error('Actual Konva scene is absent')
              const rect = bitmap.getBoundingClientRect()
              // Konva retains its backing-store transform; integer canvas dimensions
              // and fractional CSS bounds need not recover that exact transform.
              const surface = bitmap.getContext('2d').getTransform()
              if (
                exactBackingScale &&
                (surface.b !== 0 ||
                  surface.c !== 0 ||
                  surface.e !== 0 ||
                  surface.f !== 0 ||
                  !Number.isFinite(surface.a) ||
                  surface.a <= 0 ||
                  surface.a !== surface.d ||
                  Math.abs(bitmap.width - rect.width * surface.a) >= 1 ||
                  Math.abs(bitmap.height - rect.height * surface.d) >= 1)
              )
                throw new Error('Unexpected native Canvas backing-store transform')
              const scaleX = exactBackingScale ? surface.a : bitmap.width / rect.width
              const scaleY = exactBackingScale ? surface.d : bitmap.height / rect.height
              const camera = {
                x: Number(host.dataset.cameraX),
                y: Number(host.dataset.cameraY),
                scale: Number(host.dataset.cameraScale),
              }
              const image = new Image()
              image.crossOrigin = 'anonymous'
              image.src = imageUrl
              await image.decode()
              const reference = document.createElement('canvas')
              reference.width = bitmap.width
              reference.height = bitmap.height
              const context = reference.getContext('2d', { willReadFrequently: true })
              context.scale(scaleX, scaleY)
              context.translate(camera.x, camera.y)
              context.scale(camera.scale, camera.scale)
              if (source) {
                const original = new Image()
                original.crossOrigin = 'anonymous'
                original.src = source.imageUrl
                await original.decode()
                context.globalAlpha = source.opacity
                context.drawImage(original, bbox.x, bbox.y, bbox.width, bbox.height)
                context.globalAlpha = 1
              }
              context.drawImage(image, bbox.x, bbox.y, bbox.width, bbox.height)
              return {
                camera,
                bitmap: { width: bitmap.width, height: bitmap.height },
                backingScale: exactBackingScale
                  ? {
                      x: scaleX,
                      y: scaleY,
                      legacyX: bitmap.width / rect.width,
                      legacyY: bitmap.height / rect.height,
                      cssWidth: rect.width,
                      cssHeight: rect.height,
                      devicePixelRatio: window.devicePixelRatio,
                    }
                  : undefined,
                samples: [bbox.width / 4, bbox.width / 2, (bbox.width * 3) / 4].map((position) => {
                  const x = (camera.x + (bbox.x + position) * camera.scale) * scaleX
                  const y = (camera.y + (bbox.y + bbox.height / 2) * camera.scale) * scaleY
                  if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height)
                    throw new Error('Frozen world location is outside actual Canvas')
                  const actual = Array.from(
                    bitmap.getContext('2d').getImageData(Math.floor(x), Math.floor(y), 1, 1).data,
                  )
                  const expected = Array.from(
                    context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data,
                  )
                  return {
                    world: { x: bbox.x + position, y: bbox.y + bbox.height / 2 },
                    rgba: actual,
                    independentlyRenderedRgba: expected,
                    maxChannelDifference: Math.max(
                      ...actual.map((value, index) => Math.abs(value - expected[index])),
                    ),
                  }
                }),
              }
            },
            {
              bbox,
              imageUrl,
              exactBackingScale: imgSamplerProfile || imgVaeProfile || outpaintProfile,
              source,
            },
          )
        if (imgSamplerProfile || imgVaeProfile || outpaintProfile) {
          report.canvasDiagnostics ??= {}
          report.canvasDiagnostics[label] = samples
          checkpoint()
        }
        return Math.max(...samples.samples.map(({ maxChannelDifference }) => maxChannelDifference))
      },
      { timeout: timeout(), intervals: [100, 250, 500] },
    )
    .toBeLessThanOrEqual(8)
  for (const sample of samples.samples) {
    assert.equal(sample.rgba[3], outpaintProfile ? sample.independentlyRenderedRgba[3] : 255)
    const offset = ((sample.world.y - bbox.y) * side + sample.world.x - bbox.x) * 4
    sample.rawOutputNeighbor = [...decoded.rgba.subarray(offset, offset + 4)]
  }
  // An independent browser draw at the observed zoom verifies consumer delivery, not image quality.
  report.canvasObservations ??= []
  report.canvasObservations.push({ label, ...samples })
  await screenshot(label)
}

/** Independent bounded ZIP consumer: verifies the bytes that explicit Save actually persisted. */
async function readZip(file) {
  const zip = await new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (error, zip) =>
      error ? reject(error) : resolve(zip),
    ),
  )
  const members = new Map()
  let total = 0,
    entries = 0
  await new Promise((resolve, reject) => {
    zip.on('error', reject)
    zip.on('end', resolve)
    zip.on('entry', (entry) => {
      try {
        assert.ok(++entries <= 10_000)
        assert.ok(
          !path.posix.isAbsolute(entry.fileName) &&
            !entry.fileName.split('/').includes('..') &&
            !entry.fileName.includes('\\'),
        )
        if (entry.fileName.endsWith('/')) {
          zip.readEntry()
          return
        }
        assert.equal(members.has(entry.fileName), false)
        assert.ok(entry.uncompressedSize <= 32 * 1024 ** 2)
        total += entry.uncompressedSize
        assert.ok(total <= 64 * 1024 ** 2)
        zip.openReadStream(entry, (error, stream) => {
          if (error) {
            reject(error)
            return
          }
          const chunks = []
          let size = 0
          stream.on('error', reject)
          stream.on('data', (bytes) => {
            size += bytes.length
            if (size > entry.uncompressedSize) {
              stream.destroy(new Error('ZIP member exceeds declared size'))
              return
            }
            chunks.push(bytes)
          })
          stream.on('end', () => {
            try {
              assert.equal(size, entry.uncompressedSize)
              members.set(entry.fileName, Buffer.concat(chunks))
              zip.readEntry()
            } catch (error) {
              reject(error)
            }
          })
        })
      } catch (error) {
        reject(error)
      }
    })
    zip.readEntry()
  })
  assert.ok(members.has('project.json'))
  return { project: JSON.parse(members.get('project.json').toString('utf8')), members }
}
function assertBaseProvenance(provenance, candidate, frozen) {
  const positive = globalPositiveInput(123)
  assert.equal(provenance.schemaVersion, 1)
  assert.equal(provenance.kind, `illustrious-${generationMode}`)
  assert.equal(provenance.executionResultContext.candidateId, candidate.candidateId)
  assert.equal(provenance.executionResultContext.queueItemId, candidate.queueItemId)
  assert.equal(provenance.executionResultContext.output.sha256, candidate.pngSha256)
  assert.deepEqual(provenance.executionResultContext.output, {
    byteSize: candidate.byteSize,
    colorSpace: 'srgb',
    format: 'png',
    height: side,
    width: side,
    iccSha256: IGS_SRGB_ICC_SHA256,
    sha256: candidate.pngSha256,
    ...(outpaintProfile
      ? { outputMode: 'contribution', contributionAlpha8: candidate.contributionAlpha8 }
      : {}),
  })
  if (outpaintProfile) {
    const {
      bbox: _bbox,
      kind: _kind,
      schemaVersion: _schema,
      ...identity
    } = frozen.context.conditioning
    assert.deepEqual(provenance.layerSourceContext.outpaint, identity)
  }
  assert.equal(provenance.layerSourceContext.sourceDocumentId, frozen.context.documentId)
  assert.equal(
    provenance.layerSourceContext.sourceDocumentRevision,
    frozen.context.documentRevision,
  )
  assert.equal(provenance.layerSourceContext.sourceTargetSha256, frozen.workerJob.target.sha256)
  assert.deepEqual(provenance.layerSourceContext.bbox, bbox)
  const config = provenance.generationConfiguration
  assert.deepEqual(config, {
    cfgRescale: generationCfgRescale,
    loras: globalLoraProfile ? configuredGlobalLoraStack() : [],
    mode: generationMode,
    model: {
      kind: 'checkpoint',
      baseModelFamily: 'illustrious',
      civitaiFileId: fixture.checkpoint.civitaiFileId,
      civitaiModelId: fixture.checkpoint.civitaiModelId,
      civitaiVersionId: fixture.checkpoint.civitaiVersionId,
      displayName: fixture.checkpoint.modelName,
      versionName: fixture.checkpoint.versionName,
      fileSha256: fixture.checkpoint.sha256,
      localModelId: model.resourceId,
      localVersionId: model.versionId,
      predictionType,
    },
    negativePrompt: {
      text: globalNegativePrompt,
      embeddingRefs: globalTiProfile ? [globalTiRef('B')] : [],
    },
    positivePrompt: {
      text: positive.text,
      embeddingRefs: globalTiProfile ? [globalTiRef(positive.key, positive.token)] : [],
    },
    sampling: {
      actualSeed: 123,
      cfgScale: 5,
      invokeScheduler: generationScheduler,
      noiseProfile: policy,
      requestedSeedPolicy: 'fixed',
      sampler: generationSampler,
      scheduler: generationScheduleLabel,
      steps: generationSteps,
      ...(imageProfile ? { denoisingStrength: imageStrength } : {}),
      ...(multipleResultsProfile && frozen.context.sampling.seedBehavior !== undefined
        ? { seedBehavior: frozen.context.sampling.seedBehavior }
        : {}),
    },
    size: { height: side, width: side },
    vae: vaeSelectionProfile ? selectedVaeReference() : null,
    vaePrecision: vaeSelectionProfile || vPredictionProfile ? 'FP32' : 'FP16',
  })
  assert.equal(config.positivePrompt.text, positive.text)
  assert.equal(config.negativePrompt.text, globalNegativePrompt)
  assert.equal(config.sampling.actualSeed, 123)
  assert.equal(config.sampling.steps, generationSteps)
  assert.equal(config.sampling.cfgScale, 5)
  assert.deepEqual(config.sampling.noiseProfile, policy)
  assert.equal(config.vaePrecision, vaeSelectionProfile || vPredictionProfile ? 'FP32' : 'FP16')
  assert.deepEqual(config.vae, vaeSelectionProfile ? selectedVaeReference() : null)
  assert.equal(config.model.fileSha256, fixture.checkpoint.sha256)
  // Copied resource names are not regional settings; the V fixture reuses a resource
  // whose existing display name contains the word regional. Exact names are checked above.
  const json = JSON.stringify(
    vPredictionProfile
      ? {
          ...provenance,
          generationConfiguration: {
            ...config,
            model: {
              ...config.model,
              displayName: '[copied name]',
              versionName: '[copied version]',
            },
          },
        }
      : provenance,
  )
  for (const forbidden of [
    'regional',
    'invoke-canvas-v1',
    ...(outpaintProfile ? [] : ['alpha8']),
    'maskId',
    'regionId',
    'compositionProfile',
    ...(initializationProfile ? ['initializationProfile', initialization] : []),
    fixture.checkpoint.path,
    appDataRoot,
    ...(dynamicPositiveProfile
      ? ['dynamicPrompt', 'maxPrompts', globalPrompt, '<variant-c>', 'unused ordinary detail']
      : []),
    ...(globalTiProfile
      ? [
          globalTi.C.reference.localVersionId,
          globalTi.D.reference.localVersionId,
          ...Object.values(globalTi).map(({ managedPath }) => managedPath),
        ]
      : localPrompts),
    ...(globalLoraProfile ? Object.values(globalLoras).map(({ managedPath }) => managedPath) : []),
    ...(vaeSelectionProfile
      ? [
          globalVae.B.reference.localVersionId,
          ...Object.values(globalVae).map(({ managedPath }) => managedPath),
        ]
      : []),
    ...(referenceImagesProfile
      ? [
          'referenceImages',
          'referenceProfile',
          'referenceId',
          REGIONAL_REFERENCE_INFERENCE_PROFILE,
          ...report.referenceImages.imports.map(({ reference }) => reference.asset.sha256),
          ...Object.values(referenceResources).flatMap(({ managedPath, sha256 }) => [
            managedPath,
            sha256,
          ]),
        ]
      : []),
  ])
    assert.equal(
      json.includes(forbidden),
      false,
      `Portable accepted base provenance leaks ${forbidden}`,
    )
}
function portableRegions(tab) {
  return (tab.regionalGuidance ?? []).map((value) => {
    const region = structuredClone(value)
    delete region.maskImageUrl
    if (region.referenceImages)
      region.referenceImages = region.referenceImages.map(
        ({ thumbnailUrl: _url, ...image }) => image,
      )
    return region
  })
}
function assertRasterGeometry(layer, portable = false) {
  if (portable) {
    assert.equal(layer.kind, 'raster')
  } else {
    // ProjectRasterLayerView exposes source roles; only the portable layer has a kind.
    assert.equal(layer.kind, undefined)
    assert.equal(layer.resultComparisonSourceKind, 'raster')
    assert.equal(layer.resultPresetSourceKind, 'raster')
  }
  assert.deepEqual(layer.transform, { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -13, y: 5 })
  const image = portable ? layer.asset : layer
  assert.equal(image.width, side)
  assert.equal(image.height, side)
  assert.equal(layer.opacity, 1)
  assert.equal(layer.blendMode, 'normal')
  assert.equal(layer.visible, true)
  assert.equal(layer.locked, false)
  if (portable) {
    assert.equal(layer.asset.sha256, report.output.pngSha256)
    assert.equal(layer.asset.bytes, report.output.byteSize)
  }
}
async function assertSourceRasterState(actual, expected, pngBytes) {
  // ProjectTab image URLs are scoped to a document revision and rotate after edits/reopen.
  // Keep URL owner/layer/asset identity, all other fields and actual PNG bytes exact; only
  // the revision and its authorization token are transient.
  const fields = (layers) =>
    layers.map((layer) => {
      assert.ok(layer.kind === undefined || layer.kind === 'raster')
      const value = { ...layer }
      // ProjectRasterLayerView explicitly permits an omitted kind; both mean Raster.
      value.kind = 'raster'
      const url = new URL(layer.imageUrl),
        parts = url.pathname.split('/').filter(Boolean)
      assert.equal(parts.length, 5)
      assert.equal(parts[2], layer.id)
      value.imageUrl = [url.protocol, url.host, parts[0], parts[2], parts[3]]
      return value
    })
  assert.deepEqual(fields(actual), fields(expected))
  for (const layer of actual) {
    assert.ok(pngBytes)
    assert.ok(
      (await fetchPng(layer.imageUrl)).equals(pngBytes),
      'Source Raster PNG must stay exact',
    )
  }
}
async function resultsAddSaveReopen(project, completed) {
  await expect
    .poll(async () => (await api('listGenerationResults', project.id)).candidates.length, {
      timeout: timeout(120_000),
    })
    .toBe(multipleResultsProfile ? 2 : 1)
  const results = await api('listGenerationResults', project.id),
    candidate = results.candidates[0]
  assert.equal(candidate.queueItemId, completed.row.id)
  assert.equal(candidate.actualSeed, 123)
  assert.equal(candidate.sourceDocumentMismatch, false)
  assert.deepEqual(candidate.bbox, bbox)
  assert.equal(results.lastActualSeed, multipleResultsProfile ? 124 : 123)
  assert.deepEqual(results.unfinishedSiblingJobIds, [])
  if (multipleResultsProfile) {
    assert.deepEqual(
      results.candidates.map(({ queueItemId }) => queueItemId),
      report.staticBatch.orderedJobIds,
    )
    assert.deepEqual(
      results.candidates.map(({ actualSeed }) => actualSeed),
      [123, 124],
    )
    const outputs = []
    for (const [index, item] of results.candidates.entries()) {
      const receipt = report.staticBatch.receipts[index]
      const bytes = await fetchPng(item.imageUrl)
      const decoded = decodePng(bytes)
      assert.equal(item.queueItemId, receipt.queue_item_id)
      assert.equal(item.actualSeed, receipt.actual_seed)
      assert.equal(item.sourceDocumentMismatch, false)
      assert.deepEqual(item.bbox, bbox)
      assert.equal(digest(bytes), receipt.image_sha256)
      assert.equal(bytes.length, receipt.image_byte_size)
      assert.equal(decoded.width, side)
      assert.equal(decoded.height, side)
      assert.equal(decoded.channels, 3)
      assert.equal(decoded.iccSha256, IGS_SRGB_ICC_SHA256)
      const browser = await browserDecode(item.imageUrl)
      assert.equal(browser.rgbaSha256, decoded.rgbaSha256)
      const file = path.join(evidenceRoot, `batch-seed-${item.actualSeed}.png`)
      await writeFile(file, bytes, { flag: 'wx', mode: 0o600 })
      outputs.push({
        ...item,
        file,
        byteSize: bytes.length,
        pngSha256: digest(bytes),
        rgbaSha256: decoded.rgbaSha256,
        browser,
      })
    }
    assert.notEqual(
      outputs[0].pngSha256,
      outputs[1].pngSha256,
      'Fixed seed neighbors must discriminate output association',
    )
    if (staticBatchProfile) {
      assert.equal(outputs[0].pngSha256, preservationBaseline.initializationControl.pngSha256)
      assert.equal(outputs[0].rgbaSha256, preservationBaseline.initializationControl.rgbaSha256)
    }
    report.staticBatch.outputs = outputs
    check(
      globalLoraProfile
        ? 'Both LoRA/TI Results independently decode to their own receipts; seeds differ, so no LoRA-causality claim follows from their PNGs'
        : globalTiProfile
          ? 'Both TI Results independently decode to their own receipts; historical zero-TI controls remain preserved without cross-resource PNG equality'
          : 'Both signed Results independently decode to their own receipts; seed123 exactly matches the predeclared same-policy control',
      { outputs },
    )
  }
  await tray().getByRole('button', { name: 'Preview candidate 1', exact: true }).click()
  await expect(
    tray().getByRole('button', { name: 'Preview candidate 1', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  const bytes = await fetchPng(candidate.imageUrl),
    decoded = decodePng(bytes)
  assert.equal(decoded.width, side)
  assert.equal(decoded.height, side)
  assert.equal(decoded.channels, outpaintProfile ? 4 : 3)
  assert.equal(decoded.iccSha256, IGS_SRGB_ICC_SHA256)
  assert.equal(digest(bytes), completed.receipt.image_sha256)
  assert.equal(bytes.length, completed.receipt.image_byte_size)
  if (!outpaintProfile)
    for (let i = 3; i < decoded.rgba.length; i += 4) assert.equal(decoded.rgba[i], 255)
  const rendered = await assertBrowserPixels(candidate.imageUrl, decoded)
  const contribution = outpaintProfile ? await assertInstalledOutpaint(completed, bytes) : null
  await writeFile(path.join(evidenceRoot, 'regional-output.png'), bytes, {
    flag: 'wx',
    mode: 0o600,
  })
  report.output = {
    ...candidate,
    pngSha256: digest(bytes),
    byteSize: bytes.length,
    rgbaSha256: decoded.rgbaSha256,
    iccSha256: decoded.iccSha256,
    browser: rendered,
    ...(outpaintProfile ? { contributionAlpha8: contribution.alpha, contribution } : {}),
  }
  await observeCanvas(
    'results-preview',
    decoded,
    candidate.imageUrl,
    outpaintProfile
      ? vPredictionImageProfile
        ? null
        : { imageUrl: (await current(project)).layers[0].imageUrl, opacity: 0.75 }
      : null,
  )
  const before = await current(project),
    packageBefore = await hashFile(project.file)
  assert.equal(before.dirty, false)
  assert.equal(before.layers.length, imageProfile ? 1 : 0)
  const portableBefore = imageProfile ? (await readZip(project.file)).project.layers : []
  const sourceBytesBefore = imageProfile ? await fetchPng(before.layers[0].imageUrl) : null
  if (imageProfile) {
    assert.equal(
      decoded.rgbaSha256,
      report.img2img.control.rgbaSha256,
      outpaintProfile
        ? 'Frozen outpaint Retry must reproduce every raw independently decoded healthy-control RGBA channel exactly'
        : 'Frozen IMG Retry must reproduce independent healthy control RGB exactly',
    )
    report.img2img.exactControlRetryRgb = true
    if (outpaintProfile) {
      assert.deepEqual(contribution, report.img2img.control.contribution)
      report.outpaintExactControlRetryRgba = true
    }
  }
  await tray().getByRole('checkbox', { name: 'Select candidate 1', exact: true }).check()
  if (multipleResultsProfile)
    await tray().getByRole('checkbox', { name: 'Select candidate 2', exact: true }).uncheck()
  await tray().getByRole('button', { name: 'Add 1 as Layer', exact: true }).click()
  if (multipleResultsProfile) {
    const review = window.getByRole('dialog', { name: 'Accept generation results', exact: true })
    await expect(review).toBeVisible({ timeout: timeout() })
    await expect(review).toContainText('1 unchecked temporary result will be discarded.')
    assert.equal((await api('listGenerationResults', project.id)).candidates.length, 2)
    assert.equal((await current(project)).layers.length, imageProfile ? 1 : 0)
    await review.getByRole('button', { name: 'Add 1, Discard 1', exact: true }).click()
  }
  await expect
    .poll(
      async () => {
        const calls = (await observerSnapshot()).ipc.filter(
          ({ channel }) => channel === 'projects:accept-generation-candidates',
        )
        assert.ok(calls.length <= 1)
        return calls.length === 1 && calls[0].finished && calls[0].ok === true
      },
      { timeout: timeout() },
    )
    .toBe(true)
  await expect
    .poll(async () => (await current(project)).layers.length, { timeout: timeout() })
    .toBe(imageProfile ? 2 : 1)
  const added = await current(project),
    layer = added.layers.find(({ id }) => !before.layers.some((source) => source.id === id))
  assert.ok(layer)
  await assertSourceRasterState(
    added.layers.filter(({ id }) => id !== layer.id),
    before.layers,
    sourceBytesBefore,
  )
  assertRasterGeometry(layer)
  assert.equal(added.dirty, true)
  assert.equal((await api('listGenerationResults', project.id)).candidates.length, 0)
  if (multipleResultsProfile) {
    const sql = await progressSql()
    assert.deepEqual(sql.receipts, report.staticBatch.receipts)
    assert.equal(sql.cursors.length, 1)
    assert.equal(sql.cursors[0].actual_seed, 124)
    const sessionIds = globalTiProfile
      ? report.globalEmbeddingFlow.stagingSessionIds
      : [report.staticBatch.stagingSessionId]
    const tombstones = await database.db
      .selectFrom('generation_staging_discarded_session')
      .selectAll()
      .where('local_project_key', '=', project.id)
      .where('staging_session_id', 'in', sessionIds)
      .orderBy('staging_session_id')
      .execute()
    assert.equal(tombstones.length, sessionIds.length)
    assert.deepEqual(
      tombstones.map(({ staging_session_id }) => staging_session_id),
      [...sessionIds].sort(),
    )
    report.staticBatch.acceptanceDecision = {
      selectedJobId: completed.row.id,
      discardedUnselectedJobId: report.staticBatch.orderedJobIds[1],
      bothPngsRetainedBeforeAdd: true,
      bothReceiptsPreserved: true,
      ...(globalTiProfile ? { tombstones } : { tombstone: tombstones[0] }),
    }
  }
  assert.equal(await hashFile(project.file), packageBefore, 'Add must not implicitly Save')
  assert.deepEqual(added.generationDraft, before.generationDraft)
  assert.deepEqual(portableRegions(added), portableRegions(before))
  assert.deepEqual(added.primaryBbox, before.primaryBbox)
  assert.equal((await fetchPng(layer.imageUrl)).equals(bytes), true)
  await canvas().getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await current(project)).layers.length).toBe(imageProfile ? 1 : 0)
  await assertSourceRasterState((await current(project)).layers, before.layers, sourceBytesBefore)
  assert.deepEqual((await current(project)).generationDraft, before.generationDraft)
  assert.deepEqual(portableRegions(await current(project)), portableRegions(before))
  await canvas().getByRole('button', { name: 'Redo', exact: true }).click()
  await expect
    .poll(async () => (await current(project)).layers.map(({ id }) => id))
    .toEqual([layer.id, ...before.layers.map(({ id }) => id)])
  assertRasterGeometry((await current(project)).layers[0])
  assert.equal((await fetchPng((await current(project)).layers[0].imageUrl)).equals(bytes), true)
  await assertSourceRasterState(
    (await current(project)).layers.filter(({ id }) => id !== layer.id),
    before.layers,
    sourceBytesBefore,
  )
  assert.equal(await hashFile(project.file), packageBefore)
  await save(project)
  const saved = await readZip(project.file),
    accepted = saved.project.layers.find(({ id }) => id === layer.id)
  assert.ok(accepted)
  assert.equal(saved.project.layers.length, imageProfile ? 2 : 1)
  assert.deepEqual(
    saved.project.layers.filter(({ id }) => id !== layer.id),
    portableBefore,
  )
  if (imageProfile) {
    const source = saved.project.layers.find(({ id }) => id === project.sourceLayerId)
    assert.ok(source)
    assert.ok(
      saved.members.get(source.asset.path)?.equals(sourceBytesBefore),
      'Add/Save must preserve exact edited source Raster bytes',
    )
    assert.equal(source.opacity, vPredictionImageProfile ? 1 : 0.75)
    if (vPredictionImageProfile) assert.equal(source.visible, false)
  }
  assert.equal(accepted.id, layer.id)
  assert.equal(accepted.kind, 'raster')
  assertRasterGeometry(accepted, true)
  assert.ok(
    saved.members.get(accepted.asset.path)?.equals(bytes),
    'Independent ZIP member bytes must equal signed result/Raster bytes',
  )
  assert.equal(accepted.asset.sha256, digest(bytes))
  assert.deepEqual(saved.project.generationDraft, before.generationDraft)
  // ProjectTab region views contain resource URLs; compare portable authoring against the saved draft.
  for (const [index, region] of saved.project.regionalGuidance.entries()) {
    assert.equal(region.enabled, false)
    assert.deepEqual(
      region.mask,
      dynamicPositiveProfile
        ? portableRegions(before)[index].mask
        : project.document.regionalGuidance[index].mask,
    )
    assert.deepEqual(
      region.prompts,
      imageProfile || vPredictionProfile || referenceImagesProfile
        ? portableRegions(before)[index].prompts
        : project.document.regionalGuidance[index].prompts,
    )
    if (dynamicPositiveProfile && index === 0) {
      assert.equal(region.mask.asset, null)
      assert.equal(region.mask.revision, project.document.regionalGuidance[index].mask.revision + 1)
    } else assert.equal(digest(saved.members.get(region.mask.asset.path)), region.mask.asset.sha256)
  }
  assert.deepEqual(saved.project.regionalGuidance, portableRegions(before))
  assertBaseProvenance(accepted.generationProvenance, report.output, completed.frozen)
  assert.equal(saved.project.lastActualSeedSnapshot, multipleResultsProfile ? 124 : 123)
  assert.deepEqual(
    await database.db
      .selectFrom('generation_acceptance_journal')
      .selectAll()
      .where('local_project_key', '=', project.id)
      .execute(),
    [],
  )
  report.accepted = {
    layerId: layer.id,
    asset: accepted.asset,
    provenance: accepted.generationProvenance,
    savedPackageSha256: await hashFile(project.file),
    zipMemberSha256: digest(saved.members.get(accepted.asset.path)),
    noImplicitSave: true,
    undoRedoSameLayer: true,
  }
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  await expect(window.getByRole('tab', { name: project.title, exact: true })).toHaveCount(0)
  const reopened = await openProject(project)
  assert.equal(reopened.dirty, false)
  assert.equal(reopened.layers.length, imageProfile ? 2 : 1)
  await assertSourceRasterState(
    reopened.layers.filter(({ id }) => id !== layer.id),
    before.layers,
    sourceBytesBefore,
  )
  assert.equal(reopened.layers[0].id, layer.id)
  assertRasterGeometry(reopened.layers[0])
  assert.equal((await fetchPng(reopened.layers[0].imageUrl)).equals(bytes), true)
  assert.deepEqual(reopened.generationDraft, before.generationDraft)
  if (globalLoraProfile) {
    assert.deepEqual(reopened.generationDraft.loras, report.globalLoraFlow.editedSavedStack)
    assert.deepEqual(
      accepted.generationProvenance.generationConfiguration.loras,
      configuredGlobalLoraStack(),
    )
    report.globalLoraFlow.editedStackPreservedAfterSaveZipAndReopen = true
    report.globalLoraFlow.acceptedOriginalFullConfiguredStack =
      accepted.generationProvenance.generationConfiguration.loras
  }
  if (vaeSelectionProfile) {
    assert.equal(reopened.generationDraft.vae, null)
    assert.equal(reopened.generationDraft.vaePrecision, 'FP16')
    assert.deepEqual(
      accepted.generationProvenance.generationConfiguration.vae,
      selectedVaeReference(),
    )
    assert.equal(accepted.generationProvenance.generationConfiguration.vaePrecision, 'FP32')
    const flow = imgVaeProfile ? report.imgVaeFlow : report.globalVaeFlow
    flow.editedVaePreservedAfterSaveZipAndReopen = true
    flow.acceptedOriginalReference = accepted.generationProvenance.generationConfiguration.vae
    flow.acceptedOriginalPrecision = 'FP32'
  }
  if (dpmpp2mProfile) {
    assert.equal(reopened.generationDraft.sampling.sampler, 'Euler')
    assert.equal(reopened.generationDraft.sampling.scheduler, 'Normal')
    assert.equal(reopened.generationDraft.sampling.steps, 2)
    assert.equal(accepted.generationProvenance.generationConfiguration.sampling.sampler, 'DPM++ 2M')
    assert.equal(accepted.generationProvenance.generationConfiguration.sampling.scheduler, 'Karras')
    assert.equal(
      accepted.generationProvenance.generationConfiguration.sampling.invokeScheduler,
      'dpmpp_2m_k',
    )
    report.dpmpp2mFlow.savedReopenedAssociationVerified = true
  }
  if (imgSamplerProfile) {
    assert.equal(reopened.generationDraft.sampling.sampler, 'Euler')
    assert.equal(
      accepted.generationProvenance.generationConfiguration.sampling.sampler,
      generationSampler,
    )
    assert.equal(
      accepted.generationProvenance.generationConfiguration.sampling.invokeScheduler,
      generationScheduler,
    )
    assert.equal(
      accepted.generationProvenance.generationConfiguration.sampling.scheduler,
      generationScheduleLabel,
    )
    report[imgDpmProfile ? 'imgDpmFlow' : 'imgEulerAFlow'].savedReopenedAssociationVerified = true
  }
  if (cfgRescaleProfile || imageCfgRescaleProfile) {
    assert.equal(reopened.generationDraft.cfgRescale, 0.2)
    assert.equal(accepted.generationProvenance.generationConfiguration.cfgRescale, 0.7)
    report.cfgRescaleFlow.savedReopenedAssociationVerified = true
  }
  if (dynamicPositiveProfile) {
    assert.deepEqual(reopened.generationDraft.dynamicPrompt, {
      maxPrompts: 1,
      seedBehavior: 'per-iteration',
    })
    assert.deepEqual(reopened.generationDraft.positivePrompt, {
      text: 'later {ordinary|alternative|third} authoring without activation literals',
      embeddingRefs: [],
    })
    assert.equal(reopened.regionalGuidance[0].mask.asset, null)
    assert.deepEqual(accepted.generationProvenance.generationConfiguration.positivePrompt, {
      text: globalPositiveInput(123).text,
      embeddingRefs: [globalTiRef('A', '<variant-a>')],
    })
    assert.equal(
      accepted.generationProvenance.generationConfiguration.sampling.seedBehavior,
      'per-prompt',
    )
    report.dynamicPositiveFlow.editedTemplateOptionsAndMaskPreservedAfterSaveZipAndReopen = true
    report.dynamicPositiveFlow.acceptedConcretePositive =
      accepted.generationProvenance.generationConfiguration.positivePrompt
  }
  assert.deepEqual(portableRegions(reopened), portableRegions(before))
  await expect(
    window.getByRole('heading', { name: 'Image generation needs repair', exact: true }),
  ).toHaveCount(0)
  if (vPredictionSamplingProfile) {
    assert.equal(reopened.generationDraft.sampling.sampler, 'Euler')
    assert.equal(reopened.generationDraft.sampling.scheduler, 'Normal')
    assert.equal(
      accepted.generationProvenance.generationConfiguration.sampling.sampler,
      generationSampler,
    )
    assert.equal(
      accepted.generationProvenance.generationConfiguration.sampling.scheduler,
      generationScheduleLabel,
    )
    assert.equal(
      accepted.generationProvenance.generationConfiguration.sampling.invokeScheduler,
      generationScheduler,
    )
    assert.equal(report.vPrediction.sampling.uiChanges.length, 3)
    assert.deepEqual(
      report.vPrediction.sampling.uiChanges.map(({ original }) => original),
      [true, true, false],
    )
    report.vPrediction.sampling.savedReopenedAssociationVerified = true
  }
  if (vPredictionImageProfile) {
    assert.equal(reopened.generationDraft.sampling.denoisingStrength, 0.8)
    assert.equal(reopened.generationDraft.model, null)
    const retainedSource = reopened.layers.find(({ id }) => id === project.sourceLayerId)
    assert.ok(retainedSource && retainedSource.visible === false && retainedSource.opacity === 1)
    await expect(
      window.getByText('Choose an installed model before generating.', { exact: true }),
    ).toBeVisible()
    await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  } else if (imageProfile) {
    assert.equal((await targetState(project)).mode, outpaintProfile ? 'outpaint' : 'img2img')
    assert.equal(reopened.generationDraft.sampling.denoisingStrength, 0.8)
    await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled({
      timeout: timeout(120_000),
    })
  } else if (vPredictionProfile || referenceImagesProfile) {
    assert.equal((await targetState(project)).mode, 'img2img')
    assert.equal(reopened.generationDraft.model, null)
    await expect(
      window.getByText('Choose an installed model before generating.', { exact: true }),
    ).toBeVisible()
    await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  } else {
    // The accepted Raster changes the real target; the preserved txt2img draft has no strength.
    assert.equal((await targetState(project)).mode, 'img2img')
    await expect(
      window.getByText('Set Denoising Strength before generating from this raster input.', {
        exact: true,
      }),
    ).toBeVisible({ timeout: timeout(120_000) })
    await expect(window.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  }
  await observeCanvas(
    'saved-reopened-raster',
    decoded,
    reopened.layers[0].imageUrl,
    outpaintProfile && !vPredictionImageProfile
      ? { imageUrl: reopened.layers[1].imageUrl, opacity: 0.75 }
      : null,
  )
  check(
    'Signed Results/browser PNG, actual preview, Raster Add/Undo/Redo and independently read Save ZIP/reopen preserve exact output and base-only provenance',
    { outputSha256: digest(bytes), layerId: layer.id },
  )
}

async function retainObservers(restore) {
  if (restore && multipleLifetimesProfile && activeLifetime?.observers)
    return activeLifetime.observers
  const observed = await observerSnapshot(restore)
  report.observers = observed
  assert.deepEqual(observed.faults, [])
  if (restore) {
    assert.equal(observed.restored, true)
    for (const worker of observed.workers) {
      assert.equal(worker.writeRestored, true)
      assert.equal(worker.stdoutRestored, true)
    }
  }
  const identities = observed.workers.map(({ identity }) => identity).filter(Boolean)
  for (const worker of observed.workers)
    assert.ok(worker.identity, `Observed worker lacks a physical PID/start identity: ${worker.pid}`)
  for (const identity of identities) {
    assert.match(identity.start, /^\d+$/)
    assert.ok(within(path.join(appDataRoot, 'runtime'), identity.executable))
  }
  if (identities.length)
    nativeChecks.push({
      processIdentities: identities.map(({ pid, start }) => ({ pid, start })),
      groups: [],
    })
  if (multipleLifetimesProfile && restore) {
    assert.ok(
      activeLifetime && !activeLifetime.observers,
      'Original slots can be restored only once per lifetime',
    )
    activeLifetime.observers = observed
    activeLifetime.runtime = report.actualRuntime
    activeLifetime.catalogVersion = report.actualCatalogVersion
    activeLifetime.resourceChecks = structuredClone(nativeChecks)
    report.lifetimes.push(activeLifetime)
  }
  checkpoint()
  return observed
}
async function fallbackOwnedScope(label) {
  assert.ok(mainDeathProfile)
  const proof = nativeChecks
    .flatMap(({ groups }) => groups)
    .findLast(({ scopeProof }) => scopeProof)?.scopeProof
  assert.ok(proof, 'Emergency cleanup requires the independently captured scope proof')
  const record = { label, scopeProof: proof, attemptedAt: new Date().toISOString() }
  report.fallbackSignals.push(record)
  checkpoint()
  try {
    record.result = await stopOwnedQualificationScope(proof)
    return record.result
  } catch (error) {
    record.error = String(error.stack ?? error)
    throw error
  } finally {
    checkpoint()
  }
}
async function closeNative(label) {
  if (!application) return
  if (closing) return await closing
  closing = (async () => {
    clearInterval(sampler)
    await sampling
    let originalError
    try {
      await bounds(`${label}-before-close`)
    } catch (error) {
      originalError = error
      report.finalBoundsError = String(error.stack ?? error)
    }
    try {
      if (progressProfile && progressDomInstalled) {
        report.progress ??= {}
        report.progress.finalDom = await retainProgressDom(true)
        assert.deepEqual(report.progress.finalDom.faults, [])
        progressDomInstalled = false
      }
      await retainObservers(true)
    } catch (error) {
      originalError ??= error
      report.observerRestoreError = String(error.stack ?? error)
    }
    if (database) {
      await database.close()
      database = null
    }
    const native = application
    // Playwright disposes its channel during close; retain the original process handle.
    const nativeProcess = native.process()
    let closeTimer, closeError
    try {
      if (!(
        mainDeathProfile &&
        (nativeProcess.exitCode !== null || nativeProcess.signalCode !== null)
      ))
        await Promise.race([
          native.close(),
          new Promise((_, reject) => {
            closeTimer = setTimeout(
              () => reject(new Error('Owned Electron did not close within 10s')),
              10_000,
            )
          }),
        ])
    } catch (error) {
      closeError = error
      report.closeUiError = String(error.stack ?? error)
      const identityCheck = nativeChecks.findLast(({ processIdentities }) =>
        processIdentities.some(({ pid }) => pid === nativeProcess.pid),
      )
      const identity = identityCheck?.processIdentities.find(({ pid }) => pid === nativeProcess.pid)
      const group = identityCheck?.groups.find(
        ({ ownedScope, pids }) => ownedScope && pids.includes(identity?.pid),
      )
      if (mainDeathProfile) await fallbackOwnedScope(`${label}-close-error`)
      else if (identity && group)
        report.ownedSignal = await stopExpiredQualificationProcess({
          ...identity,
          group: group.group,
        })
    } finally {
      clearTimeout(closeTimer)
    }
    let exit
    try {
      exit = await confirmQualificationProcessExit(nativeChecks)
    } catch (error) {
      if (!mainDeathProfile) throw error
      closeError ??= error
      await fallbackOwnedScope(`${label}-unconfirmed-exit`)
      exit = await confirmQualificationProcessExit(nativeChecks)
    }
    report.nativeClosures.push({
      label,
      ...exit,
      processExitCode: nativeProcess.exitCode,
      signalCode: nativeProcess.signalCode,
    })
    if (multipleLifetimesProfile && activeLifetime) {
      activeLifetime.closure = report.nativeClosures.at(-1)
      activeLifetime.finishedAt = new Date().toISOString()
    }
    assert.equal(exit.confirmed, true)
    application = null
    window = null
    checkpoint()
    if (originalError) throw originalError
    if (closeError) throw closeError
    assert.equal(
      nativeProcess.exitCode,
      0,
      'Successful qualification requires healthy Electron exit',
    )
  })()
  try {
    await closing
  } finally {
    closing = null
  }
}
async function finalIdentities() {
  assert.deepEqual(await captureFiles(sourceFiles), report.sourceSha256)
  assert.deepEqual(await captureFiles(bundleFiles), report.bundleSha256)
  assert.deepEqual(await treeManifest(provision.installed.workerRoot), installedTree)
  assert.deepEqual(
    await treeManifest(path.join(provision.installed.prefix, 'resources/sdxl-config')),
    provision.inputs.config.files,
  )
  assert.deepEqual(await jsonFile(path.join(appDataRoot, 'qualification-runtime.json')), marker)
  assert.deepEqual(await jsonFile(path.join(appDataRoot, 'runtime/current-runtime.json')), pointer)
  assert.equal(await hashFile(fixture.provisionReport.path), fixture.provisionReport.sha256)
  assert.equal(await hashFile(fixturePath), report.fixtureSha256)
  assert.deepEqual(statIdentity(await regular(fixture.checkpoint.path)), modelStat)
  assert.equal(await hashFile(fixture.checkpoint.path), fixture.checkpoint.sha256)
  if (outpaintProfile) {
    const verified = await new InferenceAuxiliaryResources(
      path.join(appDataRoot, 'inference-resources'),
    ).resolveVerifiedOutpaintInfill()
    const { stat, ...original } = outpaintInfill
    assert.deepEqual(verified, original)
    assert.deepEqual(statIdentity(await regular(verified.managedPath)), stat)
  }
  if (referenceImagesProfile) {
    const verified = await new InferenceAuxiliaryResources(
      path.join(appDataRoot, 'inference-resources'),
    ).resolveVerifiedRegionalReferenceResources()
    assert.deepEqual(verified, referenceResources)
    for (const [key, resource] of Object.entries(verified))
      assert.deepEqual(
        statIdentity(await regular(resource.managedPath)),
        report.referenceResources[key].stat,
      )
    for (const source of Object.values(report.referenceImages.sources)) {
      assert.deepEqual(statIdentity(await regular(source.path)), source.stat)
      assert.equal(await hashFile(source.path), source.sha256)
    }
  }
  if (progressProfile)
    assert.deepEqual(
      await captureFiles(Object.keys(report.progressSourceSha256)),
      report.progressSourceSha256,
    )
  const db = openAppDatabase(appDataRoot, path.resolve('src/main/db/migrations'))
  try {
    assert.deepEqual(await catalogSnapshot(db.db), catalogBefore)
    const whole = recoveryProfile || progressProfile ? await sqlSnapshot(db.db) : null
    if (recoveryProfile) assertBaselineSql(whole)
    if (progressProfile) await verifyProgressPreservation(db.db)
    if (referenceImagesProfile) {
      const own = ownProgressSql(whole)
      assert.equal(own.queue.length, 2)
      assert.equal(own.queue.filter(({ status }) => status === 'canceled').length, 1)
      assert.equal(own.queue.filter(({ status }) => status === 'completed').length, 1)
      assert.ok(
        own.queue.every(
          ({ frozen_payload_json }) =>
            frozen_payload_json === report.retry.originalFrozen.row.frozen_payload_json,
        ),
      )
      assert.equal(own.receipts.length, 1)
      assert.equal(own.receipts[0].image_sha256, report.output.pngSha256)
      assert.equal(own.cursors.length, 1)
      assert.equal(own.cursors[0].actual_seed, 123)
      for (const control of Object.values(report.referenceImages.controls)) {
        assert.deepEqual(
          whole.queue.find(({ id }) => id === control.row.id),
          control.row,
        )
        assert.deepEqual(
          whole.receipts.find(({ queue_item_id }) => queue_item_id === control.row.id),
          control.receipt,
        )
        assert.equal(await hashFile(control.file), control.pngSha256)
      }
      const controlKey = report.referenceImages.controlProjectKey
      assert.equal(
        whole.queue.filter(({ local_project_key }) => local_project_key === controlKey).length,
        2,
      )
      assert.equal(
        whole.receipts.filter(({ local_project_key }) => local_project_key === controlKey).length,
        2,
      )
      const controlCursors = whole.cursors.filter(
        ({ local_project_key }) => local_project_key === controlKey,
      )
      assert.equal(controlCursors.length, 1)
      assert.equal(
        controlCursors[0].candidate_id,
        report.referenceImages.controls.B.receipt.candidate_id,
      )
      assert.equal(controlCursors[0].actual_seed, 123)
      const stored = await db.db
        .selectFrom('presets')
        .selectAll()
        .where('id', '=', report.referenceImages.resultPreset.preset.id)
        .executeTakeFirstOrThrow()
      assert.deepEqual(stored, report.referenceImages.resultPreset.stored)
      assert.equal(
        (await readZip(projects.find(({ mode }) => mode === 'reference-control').file)).project
          .layers.length,
        0,
      )
      report.finalSql = own
    } else if (vPredictionProfile) {
      if (vPredictionImageProfile)
        assert.equal(await hashFile(report.img2img.source.path), report.img2img.source.sha256)
      const own = ownProgressSql(whole)
      assert.equal(own.queue.length, 2)
      assert.equal(own.queue.filter(({ status }) => status === 'canceled').length, 1)
      assert.equal(own.queue.filter(({ status }) => status === 'completed').length, 1)
      assert.ok(
        own.queue.every(
          ({ frozen_payload_json }) =>
            frozen_payload_json === report.retry.originalFrozen.row.frozen_payload_json,
        ),
      )
      assert.equal(own.receipts.length, 1)
      assert.equal(own.receipts[0].image_sha256, report.output.pngSha256)
      assert.equal(own.cursors.length, 1)
      assert.equal(own.cursors[0].actual_seed, 123)
      const control = report.vPrediction.control
      assert.deepEqual(
        whole.queue.find(({ id }) => id === control.row.id),
        control.row,
      )
      assert.deepEqual(
        whole.receipts.find(({ queue_item_id }) => queue_item_id === control.row.id),
        control.receipt,
      )
      assert.equal(
        (await readZip(projects.find(({ id }) => id === control.projectKey).file)).project.layers
          .length,
        vPredictionImageProfile ? 1 : 0,
      )
      report.finalSql = own
    } else if (imageProfile) {
      assert.equal(await hashFile(report.img2img.source.path), report.img2img.source.sha256)
      if (imgVaeProfile) await verifyGlobalVaeFiles()
      const own = ownProgressSql(whole),
        control = report.img2img.control
      assert.equal(own.queue.length, 2)
      assert.equal(own.queue.filter(({ status }) => status === 'canceled').length, 1)
      assert.equal(own.queue.filter(({ status }) => status === 'completed').length, 1)
      assert.ok(
        own.queue.every(
          ({ operation, frozen_payload_json }) =>
            operation === regionalOperation &&
            frozen_payload_json === report.retry.originalFrozen.row.frozen_payload_json,
        ),
      )
      assert.equal(own.receipts.length, 1)
      assert.equal(own.receipts[0].image_sha256, report.output.pngSha256)
      assert.equal(own.cursors.length, 1)
      assert.equal(own.cursors[0].actual_seed, 123)
      assert.deepEqual(
        whole.queue.find(({ id }) => id === control.row.id),
        control.row,
      )
      assert.deepEqual(
        whole.receipts.find(({ queue_item_id }) => queue_item_id === control.row.id),
        control.receipt,
      )
      assert.equal(
        (await readZip(projects.find(({ id }) => id === control.projectKey).file)).project.layers
          .length,
        1,
      )
      report.finalSql = own
    } else if (globalTiProfile) {
      await verifyGlobalEmbeddingFiles()
      if (globalLoraProfile) await verifyGlobalLoraFiles()
      if (globalVaeProfile) await verifyGlobalVaeFiles()
      const own = ownProgressSql(whole)
      assert.equal(own.queue.length, 3)
      assert.deepEqual(
        own.queue.map(({ id, status }) => ({ id, status })),
        report.globalEmbeddingFlow.finalQueue.map(({ id, status }) => ({ id, status })),
      )
      for (const row of own.queue)
        assert.equal(
          row.frozen_payload_json,
          report.globalEmbeddingFlow.captured.find(
            ({ row: capturedRow }) => capturedRow.id === row.id,
          ).row.frozen_payload_json,
        )
      assert.deepEqual(own.receipts, report.staticBatch.receipts)
      assert.equal(own.receipts.length, 2)
      for (const [index, receipt] of own.receipts.entries()) {
        assert.equal(receipt.queue_item_id, report.staticBatch.outputs[index].queueItemId)
        assert.equal(receipt.image_sha256, report.staticBatch.outputs[index].pngSha256)
        assert.equal(receipt.image_byte_size, report.staticBatch.outputs[index].byteSize)
        assert.equal(receipt.actual_seed, 123 + index)
      }
      assert.equal(own.cursors.length, 1)
      assert.equal(own.cursors[0].actual_seed, 124)
      assert.equal(own.cursors[0].candidate_id, own.receipts[1].candidate_id)
      const discarded = await db.db
        .selectFrom('generation_staging_discarded_session')
        .selectAll()
        .where('local_project_key', '=', progressProject.id)
        .where('staging_session_id', 'in', report.globalEmbeddingFlow.stagingSessionIds)
        .orderBy('staging_session_id')
        .execute()
      assert.deepEqual(discarded, report.staticBatch.acceptanceDecision.tombstones)
      report.finalSql = own
    } else if (staticBatchProfile) {
      const own = ownProgressSql(whole)
      assert.equal(own.queue.length, 2)
      assert.ok(
        own.queue.every(
          ({ status, operation }) =>
            status === 'completed' && operation === 'illustrious-regional-txt2img',
        ),
      )
      assert.deepEqual(
        own.queue.map(({ id }) => id),
        report.staticBatch.orderedJobIds,
      )
      for (const [index, row] of own.queue.entries())
        assert.equal(
          row.frozen_payload_json,
          report.staticBatch.captured[index].row.frozen_payload_json,
        )
      assert.deepEqual(own.receipts, report.staticBatch.receipts)
      assert.equal(own.receipts.length, 2)
      for (const [index, receipt] of own.receipts.entries()) {
        assert.equal(receipt.queue_item_id, report.staticBatch.outputs[index].queueItemId)
        assert.equal(receipt.image_sha256, report.staticBatch.outputs[index].pngSha256)
        assert.equal(receipt.image_byte_size, report.staticBatch.outputs[index].byteSize)
        assert.equal(receipt.actual_seed, 123 + index)
      }
      assert.equal(own.cursors.length, 1)
      assert.equal(own.cursors[0].actual_seed, 124)
      assert.equal(own.cursors[0].candidate_id, own.receipts[1].candidate_id)
      const discarded = await db.db
        .selectFrom('generation_staging_discarded_session')
        .selectAll()
        .where('local_project_key', '=', progressProject.id)
        .where('staging_session_id', '=', report.staticBatch.stagingSessionId)
        .execute()
      assert.deepEqual(discarded, [report.staticBatch.acceptanceDecision.tombstone])
      report.finalSql = own
    } else {
      const rows = progressProfile
        ? ownProgressSql(whole).queue
        : recoveryProfile
          ? ownRecoverySql(whole).queue
          : await db.db.selectFrom('generation_queue_item').selectAll().execute()
      assert.equal(rows.length, 2)
      assert.equal(
        rows.filter(({ status }) => status === (workerFaultProfile ? 'failed' : 'canceled')).length,
        1,
      )
      assert.equal(rows.filter(({ status }) => status === 'completed').length, 1)
      if (workerFaultProfile) {
        assert.equal(
          rows.find(({ status }) => status === 'failed').error_code,
          'GENERATION_WORKER_FAILED',
        )
        assert.equal(rows.filter(({ status }) => status === 'canceled').length, 0)
      }
      if (recoveryProfile)
        assert.equal(rows.find(({ status }) => status === 'canceled').error_code, 'APP_RESTART')
      assert.ok(rows.every(({ operation }) => operation === 'illustrious-regional-txt2img'))
      for (const row of rows)
        assert.equal(row.frozen_payload_json, report.retry.originalFrozen.row.frozen_payload_json)
      const receipts = progressProfile
        ? ownProgressSql(whole).receipts
        : recoveryProfile
          ? ownRecoverySql(whole).receipts
          : await db.db.selectFrom('generation_candidate_receipt').selectAll().execute()
      assert.equal(receipts.length, 1)
      assert.equal(receipts[0].image_sha256, report.output.pngSha256)
      report.finalSql = {
        queue: rows,
        receipts,
        cursors: progressProfile
          ? ownProgressSql(whole).cursors
          : recoveryProfile
            ? ownRecoverySql(whole).cursors
            : await db.db.selectFrom('generation_seed_cursor').selectAll().execute(),
      }
    }
    if (recoveryProfile) {
      report.finalWholePoolSql = whole
      for (const file of baselinePackages)
        assert.equal(
          await hashFile(file.path),
          file.sha256,
          'A previous saved Project must remain byte-identical',
        )
    }
  } finally {
    await db.close()
  }
  for (const project of projects.filter(
    ({ mode }) =>
      mode !== 'transparent' &&
      (!imageProfile || mode === (outpaintProfile ? 'opaque' : 'partial')),
  ))
    assert.equal(await hashFile(project.file), project.initialPackageSha256)
  check(
    'Original model inode/stat/full SHA, installed wheel/config/provision/pointer, source/bundle and control Project bytes remain unchanged',
  )
}
async function failureContext() {
  if (!window || window.isClosed()) return
  report.failureContext = await window.evaluate(() => ({
    title: document.title,
    blockingReasons: [...document.querySelectorAll('.generation-blocking-reason')].map(
      (element) => element.textContent,
    ),
    runtimeNotices: [...document.querySelectorAll('[aria-label="Image generation status"]')].map(
      (element) => element.textContent?.slice(0, 4096),
    ),
    queueRows: [...document.querySelectorAll('[data-job-id]')].map((element) => ({
      id: element.getAttribute('data-job-id'),
      text: element.textContent?.slice(0, 2048),
    })),
    active: {
      tag: document.activeElement?.tagName,
      ariaLabel: document.activeElement?.getAttribute('aria-label'),
    },
  }))
  if (database) report.failureSql = await sqlSnapshot()
  await retainObservers(false)
  await screenshot('failure-retained')
}

async function assertStaticBatchActions(project) {
  const observed = await retainObservers(false)
  const mutationCalls = observed.ipc.filter(({ channel }) => channel !== 'projects:open')
  assert.ok(
    mutationCalls.every(
      ({ originalCalls, finished, ok }) => originalCalls === 1 && finished && ok === true,
    ),
  )
  const generate = observed.ipc.filter(({ channel }) => channel === 'projects:generate')
  assert.equal(generate.length, 1)
  assert.deepEqual(generate[0].args[1], { documentId: project.document.documentId, iterations: 2 })
  assert.deepEqual(generate[0].response.value.jobIds, report.staticBatch.orderedJobIds)
  for (const channel of [
    'projects:retry-generation-job',
    'projects:cancel-generation-job',
    'projects:cancel-current-generation',
  ])
    assert.equal(observed.ipc.filter((call) => call.channel === channel).length, 0)
  const accepts = observed.ipc.filter(
    ({ channel }) => channel === 'projects:accept-generation-candidates',
  )
  assert.equal(accepts.length, 1)
  assert.deepEqual(accepts[0].args[1], [report.staticBatch.orderedJobIds[0]])
  assert.deepEqual(accepts[0].args[3], report.staticBatch.orderedJobIds)
  assert.deepEqual(accepts[0].args[4], [])
  assert.equal(observed.ipc.filter(({ channel }) => channel === 'projects:undo').length, 1)
  assert.equal(observed.ipc.filter(({ channel }) => channel === 'projects:redo').length, 1)
  assert.equal(observed.ipc.filter(({ channel }) => channel === 'projects:save').length, 2)
  assert.equal(regionalWires(observed).length, 2)
  report.staticBatch.originalActions = {
    generate: generate[0],
    accept: accepts[0],
    noCancelOrRetry: true,
  }
  check(
    'One original UI Generate and reviewed Add/Discard use unchanged IPC owners; no extra Generate, Cancel or Retry occurs',
  )
}

async function assertGlobalEmbeddingActions(project) {
  const observed = await retainObservers(false)
  assert.ok(
    observed.ipc
      .filter(({ channel }) => channel !== 'projects:open')
      .every(({ originalCalls, finished, ok }) => originalCalls === 1 && finished && ok === true),
  )
  const generate = observed.ipc.filter(({ channel }) => channel === 'projects:generate')
  assert.equal(generate.length, 1)
  assert.deepEqual(generate[0].args[1], {
    documentId: project.document.documentId,
    iterations: dynamicPositiveProfile ? 1 : 2,
  })
  assert.equal(generate[0].response.value.truncated, dynamicPositiveProfile)
  assert.deepEqual(
    generate[0].response.value.jobIds,
    report.globalEmbeddingFlow.originalBatchJobIds,
  )
  const cancel = observed.ipc.filter(({ channel }) =>
    ['projects:cancel-generation-job', 'projects:cancel-current-generation'].includes(channel),
  )
  assert.equal(cancel.length, 1)
  assert.equal(cancel[0].channel, 'projects:cancel-generation-job')
  assert.equal(cancel[0].args[0].id, report.globalEmbeddingFlow.canceledJobId)
  const retry = observed.ipc.filter(({ channel }) => channel === 'projects:retry-generation-job')
  assert.equal(retry.length, 1)
  assert.equal(retry[0].args[0].id, report.globalEmbeddingFlow.canceledJobId)
  const accepts = observed.ipc.filter(
    ({ channel }) => channel === 'projects:accept-generation-candidates',
  )
  assert.equal(accepts.length, 1)
  assert.deepEqual(accepts[0].args[1], [report.staticBatch.orderedJobIds[0]])
  assert.deepEqual(accepts[0].args[3], report.staticBatch.orderedJobIds)
  assert.deepEqual(accepts[0].args[4], [])
  for (const [channel, count] of [
    ['projects:undo', 1],
    ['projects:redo', 1],
    ['projects:save', 2],
  ])
    assert.equal(observed.ipc.filter((call) => call.channel === channel).length, count)
  assert.equal(regionalWires(observed).length, 3)
  report.globalEmbeddingFlow.originalActions = {
    generate: generate[0],
    cancel: cancel[0],
    retry: retry[0],
    accept: accepts[0],
    noExtraGenerate: true,
  }
  if (cfgRescaleProfile) {
    const changes = observed.ipc.filter(
      ({ channel, args }) =>
        channel === 'projects:update-generation-draft' && args[1]?.kind === 'cfg-rescale',
    )
    assert.deepEqual(
      changes.map(({ args }) => args.slice(0, 2)),
      [
        [project.id, { kind: 'cfg-rescale', value: 0.7 }],
        [project.id, { kind: 'cfg-rescale', value: 0.2 }],
      ],
    )
    assert.ok(changes[0].finishedOrder < generate[0].startedOrder)
    assert.ok(cancel[0].finishedOrder < changes[1].startedOrder)
    assert.ok(changes[1].finishedOrder < retry[0].startedOrder)
    report.cfgRescaleFlow.originalAuthoringActions = changes
  }
  if (dynamicPositiveProfile) {
    const dynamicChanges = observed.ipc.filter(
        ({ channel, args }) =>
          channel === 'projects:update-generation-draft' && args[1]?.kind === 'dynamic-prompt',
      ),
      maskEdits = observed.ipc.filter(
        ({ channel }) => channel === 'projects:edit-regional-guidance-mask',
      )
    assert.deepEqual(
      dynamicChanges.map(({ args }) => args.slice(0, 2)),
      [
        { maxPrompts: 2, seedBehavior: 'per-iteration' },
        { maxPrompts: 2, seedBehavior: 'per-prompt' },
        { maxPrompts: 1, seedBehavior: 'per-prompt' },
        { maxPrompts: 1, seedBehavior: 'per-iteration' },
      ].map((value) => [project.id, { kind: 'dynamic-prompt', value }]),
    )
    assert.ok(dynamicChanges[1].finishedOrder < generate[0].startedOrder)
    assert.ok(cancel[0].finishedOrder < dynamicChanges[2].startedOrder)
    assert.ok(dynamicChanges[3].finishedOrder < retry[0].startedOrder)
    assert.equal(maskEdits.length, 1)
    assert.equal(maskEdits[0].args[0], project.id)
    assert.equal(maskEdits[0].args[1], report.dynamicPositiveMaskEdit.regionId)
    assert.equal(maskEdits[0].args[2].documentId, project.document.documentId)
    assert.equal(maskEdits[0].args[2].maskId, report.dynamicPositiveMaskEdit.before.id)
    assert.equal(maskEdits[0].args[2].maskRevision, report.dynamicPositiveMaskEdit.before.revision)
    assert.deepEqual(maskEdits[0].args[2].edit, { kind: 'clear' })
    assert.ok(cancel[0].finishedOrder < maskEdits[0].startedOrder)
    assert.ok(maskEdits[0].finishedOrder < retry[0].startedOrder)
    report.dynamicPositiveFlow.originalAuthoringActions = { dynamicChanges, maskEdits }
  }
  if (globalLoraProfile) {
    const adds = observed.ipc.filter(({ channel }) => channel === 'projects:add-generation-lora'),
      removes = observed.ipc.filter(({ channel }) => channel === 'projects:remove-generation-lora'),
      changes = observed.ipc.filter(
        ({ channel, args }) =>
          channel === 'projects:update-generation-draft' && args[1]?.kind.startsWith('lora-'),
      ),
      identity = ({ localModelId, localVersionId }) => ({
        resourceId: localModelId,
        versionId: localVersionId,
      })
    assert.equal(adds.length, 1)
    assert.deepEqual(adds[0].args.slice(0, 2), [project.id, identity(globalLoras.A.reference)])
    assert.deepEqual(
      removes.map(({ args }) => args.slice(0, 2)),
      [
        [project.id, identity(globalLoras.A.reference)],
        [project.id, identity(configuredGlobalLoraStack()[3].resource)],
      ],
    )
    assert.deepEqual(
      changes.map(({ args }) => args.slice(0, 2)),
      [
        [project.id, { kind: 'lora-weight', ...identity(globalLoras.A.reference), value: 0.2 }],
        [project.id, { kind: 'lora-weight', ...identity(globalLoras.B.reference), value: -0.25 }],
        [project.id, { kind: 'lora-enabled', ...identity(globalLoras.Z.reference), value: false }],
      ],
    )
    report.globalLoraFlow.originalAuthoringActions = { adds, removes, changes }
  }
  if (globalVaeProfile) {
    const selections = observed.ipc.filter(
        ({ channel }) => channel === 'projects:set-generation-vae',
      ),
      precisionChanges = observed.ipc.filter(
        ({ channel, args }) =>
          channel === 'projects:update-generation-draft' && args[1]?.kind === 'vae-precision',
      ),
      selectedIdentity = {
        resourceId: globalVae.A.reference.localModelId,
        versionId: globalVae.A.reference.localVersionId,
      }
    assert.deepEqual(
      selections.map(({ args }) => args.slice(0, 2)),
      [
        [project.id, null],
        [project.id, selectedIdentity],
        [project.id, null],
      ],
    )
    assert.deepEqual(
      precisionChanges.map(({ args }) => args.slice(0, 2)),
      ['Auto', 'FP32', 'FP16'].map((value) => [project.id, { kind: 'vae-precision', value }]),
    )
    assert.ok(
      selections.every(({ finished, originalCalls, ok }) => finished && originalCalls === 1 && ok),
    )
    assert.ok(
      precisionChanges.every(
        ({ finished, originalCalls, ok }) => finished && originalCalls === 1 && ok,
      ),
    )
    assert.ok(selections[0].startedOrder < generate[0].startedOrder)
    assert.ok(selections[1].finishedOrder < generate[0].startedOrder)
    assert.ok(precisionChanges[1].finishedOrder < generate[0].startedOrder)
    assert.ok(cancel[0].finishedOrder < selections[2].startedOrder)
    assert.ok(selections[2].finishedOrder < retry[0].startedOrder)
    assert.ok(precisionChanges[2].finishedOrder < retry[0].startedOrder)
    report.globalVaeFlow.originalAuthoringActions = { selections, precisionChanges }
  }
  check(
    'Exactly one original UI Generate, one observed Cancel, one original frozen Retry and reviewed Add/Discard/Undo/Redo/two Save actions',
  )
}

async function assertImageActions(project) {
  const observed = await retainObservers(false)
  assert.deepEqual(observed.faults, [])
  assert.ok(
    observed.ipc
      .filter(({ channel }) => channel !== 'projects:open')
      .every(({ originalCalls, finished, ok }) => originalCalls === 1 && finished && ok === true),
  )
  const generates = observed.ipc.filter(({ channel }) => channel === 'projects:generate')
  assert.equal(generates.length, 2)
  assert.deepEqual(
    generates.map(({ args }) => args[1]),
    [report.img2img.control.captured.frozen.context.documentId, project.document.documentId].map(
      (documentId) => ({ documentId, iterations: 1 }),
    ),
  )
  for (const [channel, count] of [
    ['projects:import-raster-image', 2],
    ['projects:retry-generation-job', 1],
    ['projects:cancel-generation-job', 1],
    ['projects:cancel-current-generation', 0],
    ['projects:accept-generation-candidates', 1],
    ['projects:undo', 1],
    ['projects:redo', 1],
    ['projects:save', 4],
  ])
    assert.equal(
      observed.ipc.filter((call) => call.channel === channel).length,
      count,
      `Original UI ${channel} count`,
    )
  const retry = observed.ipc.find(({ channel }) => channel === 'projects:retry-generation-job')
  assert.equal(retry.args[0].id, report.retry.firstJobId)
  if (imgVaeProfile) {
    const selections = observed.ipc.filter(
        ({ channel }) => channel === 'projects:set-generation-vae',
      ),
      precisionChanges = observed.ipc.filter(
        ({ channel, args }) =>
          channel === 'projects:update-generation-draft' && args[1]?.kind === 'vae-precision',
      ),
      selectedIdentity = {
        resourceId: globalVae.A.reference.localModelId,
        versionId: globalVae.A.reference.localVersionId,
      },
      cancel = observed.ipc.find(({ channel }) => channel === 'projects:cancel-generation-job')
    assert.deepEqual(
      selections.map(({ args }) => args.slice(0, 2)),
      [
        [report.img2img.controlProjectKey, null],
        [report.img2img.controlProjectKey, selectedIdentity],
        [project.id, null],
        [project.id, selectedIdentity],
        [project.id, null],
      ],
    )
    assert.deepEqual(
      precisionChanges.map(({ args }) => args.slice(0, 2)),
      [
        ...['Auto', 'FP32'].map((value) => [
          report.img2img.controlProjectKey,
          { kind: 'vae-precision', value },
        ]),
        ...['Auto', 'FP32', 'FP16'].map((value) => [project.id, { kind: 'vae-precision', value }]),
      ],
    )
    for (const [index, actionIndex] of [1, 3].entries()) {
      assert.ok(selections[actionIndex].finishedOrder < generates[index].startedOrder)
      assert.ok(precisionChanges[actionIndex].finishedOrder < generates[index].startedOrder)
    }
    assert.ok(cancel.finishedOrder < selections[4].startedOrder)
    assert.ok(cancel.finishedOrder < precisionChanges[4].startedOrder)
    assert.ok(selections[4].finishedOrder < retry.startedOrder)
    assert.ok(precisionChanges[4].finishedOrder < retry.startedOrder)
    assert.deepEqual(
      report.imgVaeAuthoringBeforeGenerate.map(({ projectKey }) => projectKey),
      [report.img2img.controlProjectKey, project.id],
    )
    report.imgVaeFlow.originalAuthoringActions = { selections, precisionChanges }
  }
  if (imageCfgRescaleProfile) {
    const changes = observed.ipc.filter(
        ({ channel, args }) =>
          channel === 'projects:update-generation-draft' && args[1]?.kind === 'cfg-rescale',
      ),
      cancel = observed.ipc.find(({ channel }) => channel === 'projects:cancel-generation-job')
    assert.deepEqual(
      changes.map(({ args }) => args.slice(0, 2)),
      [
        [report.img2img.controlProjectKey, { kind: 'cfg-rescale', value: 0.7 }],
        [project.id, { kind: 'cfg-rescale', value: 0.7 }],
        [project.id, { kind: 'cfg-rescale', value: 0.2 }],
      ],
    )
    assert.ok(changes[0].finishedOrder < generates[0].startedOrder)
    assert.ok(changes[1].finishedOrder < generates[1].startedOrder)
    assert.ok(cancel.finishedOrder < changes[2].startedOrder)
    assert.ok(changes[2].finishedOrder < retry.startedOrder)
    report.cfgRescaleFlow.originalAuthoringActions = changes
  }
  if (imgSamplerProfile) {
    const changes = observed.ipc.filter(
      ({ channel, args }) =>
        channel === 'projects:update-generation-draft' && args[1]?.kind === 'sampling-pair',
    )
    assert.deepEqual(
      changes.map(({ args }) => args.slice(0, 2)),
      [
        [
          report.img2img.controlProjectKey,
          { kind: 'sampling-pair', sampler: generationSampler, scheduler: 'Normal' },
        ],
        ...(imgDpmProfile
          ? [
              [
                report.img2img.controlProjectKey,
                { kind: 'sampling-pair', sampler: generationSampler, scheduler: 'Karras' },
              ],
            ]
          : []),
        [project.id, { kind: 'sampling-pair', sampler: generationSampler, scheduler: 'Normal' }],
        ...(imgDpmProfile
          ? [
              [
                project.id,
                { kind: 'sampling-pair', sampler: generationSampler, scheduler: 'Karras' },
              ],
            ]
          : []),
        [
          project.id,
          { kind: 'sampling-pair', sampler: 'Euler', scheduler: imgDpmProfile ? null : 'Normal' },
        ],
      ],
    )
    assert.ok(changes[imgDpmProfile ? 1 : 0].finishedOrder < generates[0].startedOrder)
    assert.ok(changes[imgDpmProfile ? 3 : 1].finishedOrder < generates[1].startedOrder)
    const cancel = observed.ipc.find(({ channel }) => channel === 'projects:cancel-generation-job')
    assert.ok(cancel.finishedOrder < changes.at(-1).startedOrder)
    assert.ok(changes.at(-1).finishedOrder < retry.startedOrder)
    report[imgDpmProfile ? 'imgDpmFlow' : 'imgEulerAFlow'].originalAuthoringActions = changes
  }
  const rasterEdits = observed.ipc.filter(
    ({ channel }) => channel === 'projects:update-raster-layer',
  )
  assert.equal(rasterEdits.length, 1)
  assert.deepEqual(rasterEdits[0].args.slice(0, 3), [
    project.id,
    project.sourceLayerId,
    { kind: 'opacity', opacity: 0.75 },
  ])
  const controlResults = await api('listGenerationResults', report.img2img.controlProjectKey)
  assert.equal(controlResults.candidates.length, 1)
  assert.equal(
    controlResults.candidates[0].candidateId,
    report.img2img.control.candidate.candidateId,
  )
  assert.equal(
    digest(await fetchPng(controlResults.candidates[0].imageUrl)),
    report.img2img.control.pngSha256,
  )
  assert.equal(regionalWires(observed).length, 3)
  report.img2img.originalActions = {
    generates,
    retry,
    rasterEdit: rasterEdits[0],
    independentControlStillUnaccepted: true,
  }
  check(
    'Two original Generate actions, real imports, one live Cancel, frozen Retry and explicit Add/Undo/Redo/four Saves complete with the independent control unchanged',
  )
}

async function closeImageControl() {
  const control = projects.find(({ id }) => id === report.img2img.controlProjectKey)
  assert.ok(control)
  assert.equal(
    await hashFile(path.join(evidenceRoot, 'img-control.png')),
    report.img2img.control.pngSha256,
  )
  await window.getByRole('button', { name: `Close ${control.title}`, exact: true }).click()
  const dialog = window.getByRole('dialog', { name: 'Close Project', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Discard Candidates and Close', exact: true }).click()
  await expect(window.getByRole('tab', { name: control.title, exact: true })).toHaveCount(0)
  await expect(dialog).toHaveCount(0)
  assert.equal(regionalWires(await observerSnapshot()).length, 3)
  report.img2img.controlClosedExplicitly = {
    projectKey: control.id,
    decision: 'Discard Candidates and Close',
    originalPngRetained: path.join(evidenceRoot, 'img-control.png'),
    noExtraGeneration: true,
  }
  check(
    'Retained healthy control is explicitly closed through the normal Discard Candidates UI before app shutdown',
  )
}

checkpoint()
// Independent inherited systemd and native owned-scope watchdogs survive this launcher.
// This local guard also closes the owned app and retains a report if a UI/IPC wait stalls.
deadlineTimer = setTimeout(() => {
  report.outcome = 'failed'
  report.deadlineExpired = true
  checkpoint()
  void closeNative('overall-deadline')
    .catch((error) => {
      report.deadlineCloseError = String(error.stack ?? error)
      checkpoint()
    })
    .finally(() => process.exit(1))
}, fixture.deadlineSeconds * 1000)
try {
  await verifyProvision()
  await prepareCatalogAndProjects()
  await prepareMainDeathControls()
  await launch()
  if (!imageProfile && !vPredictionProfile && !referenceImagesProfile) await targetRefusalControls()
  if (referenceImagesProfile) {
    const project = projects.find(({ mode }) => mode === 'transparent')
    progressProject = project
    const completed = await generateReferenceControlCancelRetry(project)
    await resultsAddSaveReopen(project, completed)
    assert.equal(report.output.pngSha256, report.referenceImages.controls.A.pngSha256)
    assert.equal(report.output.rgbaSha256, report.referenceImages.controls.A.rgbaSha256)
    report.referenceImages.exactRestartedFrozenRetryA = true
    await saveReferenceResultPreset(project)
    const observed = await observerSnapshot()
    for (const [channel, count] of [
      ['projects:generate', 0],
      ['projects:retry-generation-job', 1],
      ['projects:accept-generation-candidates', 1],
      ['projects:undo', 1],
      ['projects:redo', 1],
    ])
      assert.equal(observed.ipc.filter((entry) => entry.channel === channel).length, count)
  } else if (vPredictionProfile) {
    const project = projects.find(
      ({ mode }) =>
        mode ===
        (vPredictionImageProfile ? (outpaintProfile ? 'partial' : 'opaque') : 'transparent'),
    )
    progressProject = project
    report.vPrediction.controlProjectKey = projects.find(({ mode }) => mode === 'v-control').id
    if (vPredictionImageProfile)
      report.img2img.controlProjectKey = report.vPrediction.controlProjectKey
    const completed = await generateVPredictionControlCancelRetry(project)
    await resultsAddSaveReopen(project, completed)
    assert.equal(report.output.pngSha256, report.vPrediction.control.pngSha256)
    assert.equal(report.output.rgbaSha256, report.vPrediction.control.rgbaSha256)
    report.vPrediction.exactControlRetryRgb = true
    if (vPredictionImageProfile) report.vPrediction.exactControlRetryRgba = outpaintProfile
    const observed = await observerSnapshot()
    assert.equal(observed.ipc.filter(({ channel }) => channel === 'projects:generate').length, 0)
    assert.equal(
      observed.ipc.filter(({ channel }) => channel === 'projects:retry-generation-job').length,
      1,
    )
    assert.equal(
      observed.ipc.filter(({ channel }) => channel === 'projects:accept-generation-candidates')
        .length,
      1,
    )
    assert.equal(observed.ipc.filter(({ channel }) => channel === 'projects:undo').length, 1)
    assert.equal(observed.ipc.filter(({ channel }) => channel === 'projects:redo').length, 1)
  } else if (imageProfile) {
    const project = projects.find(({ mode }) => mode === (outpaintProfile ? 'partial' : 'opaque')),
      control = projects.find(({ mode }) => mode === 'transparent')
    progressProject = project
    report.img2img.controlProjectKey = control.id
    await installProgressDomObserver()
    await imageHealthyControl(control)
    await prepareImageProject(project)
    const completed = await generateCancelEditRetry(project)
    await resultsAddSaveReopen(project, completed)
    await assertImageActions(project)
  } else if (recoveryProfile) {
    await recoveryThreeLifetimes()
    await assertRecoveryActions()
  } else if (globalTiProfile) {
    const project = projects.find(({ mode }) => mode === 'transparent')
    progressProject = project
    await installProgressDomObserver()
    const completed = await generateGlobalEmbeddingBatchRetry(project)
    await resultsAddSaveReopen(project, completed)
    await assertGlobalEmbeddingActions(project)
  } else if (staticBatchProfile) {
    const project = projects.find(({ mode }) => mode === 'transparent')
    progressProject = project
    const completed = await generateStaticBatchEdit(project)
    await resultsAddSaveReopen(project, completed)
    await assertStaticBatchActions(project)
  } else {
    const project = projects.find(({ mode }) => mode === 'transparent')
    if (progressProfile) {
      progressProject = project
      await installProgressDomObserver()
    }
    const completed = await generateCancelEditRetry(project)
    await resultsAddSaveReopen(project, completed)
    if (initializationProfile) {
      report.initializationControl = {
        priorEulerControlPreserved: preservationBaseline.controlPng,
        newOutputPngSha256: report.output.pngSha256,
        newOutputRgbaSha256: report.output.rgbaSha256,
        comparedForEquality: false,
        reason:
          'The authored Euler-a initialization is a different execution policy. The existing Euler control is pinned and independently preserved, not used as a new-output byte oracle.',
      }
      check(
        'Public Euler-a frozen identity survives authored sampler edits and Results/Add/Undo/Save; the prior Euler control remains immutable without an invalid cross-policy output comparison',
      )
    } else if (progressProfile) {
      assert.equal(
        report.output.pngSha256,
        preservationBaseline.controlPng.sha256,
        'Progress must preserve the prior healthy original PNG bytes',
      )
      assert.equal(report.output.rgbaSha256, preservationBaseline.controlPng.rgbaSha256)
      check(
        'Telemetry preserves the independently decoded prior healthy control PNG and existing Results/Add/Undo/Save path',
      )
    }
    const observed = await retainObservers(false)
    const mutationCalls = observed.ipc.filter(({ channel }) => channel !== 'projects:open')
    assert.ok(
      mutationCalls.every(
        ({ originalCalls, finished, ok }) => originalCalls === 1 && finished && ok === true,
      ),
    )
    assert.equal(observed.ipc.filter(({ channel }) => channel === 'projects:generate').length, 1)
    assert.equal(
      observed.ipc.filter(({ channel }) => channel === 'projects:retry-generation-job').length,
      1,
    )
    const generate = observed.ipc.find(({ channel }) => channel === 'projects:generate')
    assert.deepEqual(
      generate.args[1],
      { documentId: project.document.documentId, iterations: 1 },
      'Public renderer sends options without an injected recipe',
    )
    const retry = observed.ipc.find(({ channel }) => channel === 'projects:retry-generation-job')
    assert.equal(retry.args[0].id, report.retry.firstJobId)
    assert.equal(
      observed.ipc.filter(({ channel }) => channel === 'projects:accept-generation-candidates')
        .length,
      1,
    )
    assert.equal(observed.ipc.filter(({ channel }) => channel === 'projects:undo').length, 1)
    assert.equal(observed.ipc.filter(({ channel }) => channel === 'projects:redo').length, 1)
    assert.equal(observed.ipc.filter(({ channel }) => channel === 'projects:save').length, 2)
    assert.equal(
      observed.ipc.filter(({ channel }) =>
        ['projects:cancel-generation-job', 'projects:cancel-current-generation'].includes(channel),
      ).length,
      workerFaultProfile ? 0 : 1,
    )
    if (workerFaultProfile) {
      assert.equal(report.startupTrace.exit, null)
      assert.deepEqual(
        await readProcessIdentity(application.process().pid),
        report.workerFault.before.main,
      )
      const originalWorker = observed.workers.find(
        ({ pid }) => pid === report.workerFault.before.child.pid,
      )
      const retryWire = regionalWires(observed)[1]
      assert.ok(originalWorker.exit && originalWorker.close)
      assert.notEqual(retryWire.pid, originalWorker.pid)
      assert.equal(
        observed.workers.find(({ pid }) => pid === retryWire.pid).ready.workerVersion,
        '0.14.0',
      )
      report.workerFault.finalSameMain = await readProcessIdentity(application.process().pid)
      report.workerFault.noCancelCalls = true
    }
  }
  assert.deepEqual(report.pageErrors, [])
  assert.equal(report.samplerError, undefined)
  if (imageProfile && !vPredictionImageProfile) await closeImageControl()
  await closeNative('healthy-final')
  if (vPredictionImageProfile || vPredictionSamplingProfile || referenceImagesProfile) {
    assert.equal(report.lifetimes.length, 3)
    assert.equal(report.nativeClosures.length, 3)
    assert.ok(
      report.nativeClosures.every(
        ({ confirmed, processExitCode, signalCode }) =>
          confirmed && processExitCode === 0 && signalCode === null,
      ),
    )
  }
  if (referenceImagesProfile) {
    const observed = report.lifetimes.flatMap(({ observers }) => observers.ipc)
    assert.equal(report.lifetimes.flatMap(({ observers }) => regionalWires(observers)).length, 4)
    for (const [channel, count] of [
      ['projects:generate', 3],
      ['projects:retry-generation-job', 1],
      ['projects:cancel-generation-job', 1],
      ['projects:accept-generation-candidates', 1],
      ['projects:undo', 1],
      ['projects:redo', 1],
      ['projects:import-regional-guidance-reference-image', 4],
      ['projects:update-regional-guidance-reference-image', 2],
    ])
      assert.equal(observed.filter((entry) => entry.channel === channel).length, count)
    assert.ok(
      observed.every(
        ({ originalCalls, finished, ok }) => originalCalls === 1 && finished && ok === true,
      ),
    )
    report.referenceImages.normalPhysicalCloseAndExactActionAccounting = true
  }
  if (workerFaultProfile) {
    assert.equal(report.nativeClosures.length, 1)
    assert.equal(report.nativeClosures[0].label, 'healthy-final')
    assert.equal(report.nativeClosures[0].confirmed, true)
    assert.equal(report.nativeClosures[0].processExitCode, 0)
    assert.equal(report.nativeClosures[0].signalCode, null)
    assert.equal(report.startupTrace.exit.code, 0)
    assert.equal(report.startupTrace.exit.signal, null)
    report.workerFault.finalWorkerSubprocessCount = report.observers.workers.length
    report.workerFault.workerCountBoundaries = {
      throughGenerationCompletion: report.nativeAccounting.workerSpawnCount,
      finalRestoredObserverSnapshot: report.observers.workers.length,
    }
    for (const worker of report.observers.workers) assert.equal(worker.stderrRestored, true)
  }
  if (recoveryProfile) {
    assert.equal(report.lifetimes.length, 3)
    assert.equal(report.nativeClosures.length, 3)
    assert.equal(
      report.nativeClosures.filter(
        ({ intentional, signalCode, confirmed }) =>
          intentional && signalCode === 'SIGKILL' && confirmed,
      ).length,
      2,
    )
    assert.equal(report.nativeClosures.at(-1).processExitCode, 0)
    if (mainDeathProfile) {
      assert.equal(
        report.nativeClosures.filter(({ mainOnly, signal }) => mainOnly && signal.pidfd).length,
        2,
      )
      assert.deepEqual(report.fallbackSignals, [])
      await assertMainDeathControls()
    }
  }
  await finalIdentities()
  assert.equal(await hashFile(report.harnessSource.path), report.harnessSource.sha256)
  report.outcome = 'passed'
  report.completedAt = new Date().toISOString()
  report.elapsedSeconds = (Date.now() - started) / 1000
  check(
    referenceImagesProfile
      ? 'Finite installed official Illustrious epsilon regional references: same-control A/B original PNG influence, native step1 Cancel, saved B/settings and restarted exact frozen A Retry, explicit Add/Undo/Redo/Save/reopen and actual result-preset regional exclusion. No aesthetic-quality, capacity or release-readiness claim'
      : vPredictionProfile
        ? `Finite installed exact NoobAI V-prediction ${generationMode} ${generationSampler}/${generationScheduleLabel}, EmbeddedFP32${vPredictionImageProfile ? '/strength0.5' : ''}, genuine healthy/progress-Cancel/restarted frozen-Retry, exact independently decoded control ${outpaintProfile ? 'RGBA contribution/source-over' : 'RGB'} and ordinary V provenance through Add/Undo/Redo/Save/reopen${vPredictionImageProfile ? ' with original source preserved after saved hiding' : ''}; no visual-quality/all-method/public-readiness claim`
        : outpaintProfile
          ? 'Finite installed mixed-alpha regional outpaint with EmbeddedFP16, Euler/Normal, CFG Rescale0.7, exact LaMa, actual imported source and live Cancel/frozen Retry after saved edits completed through verified RGBA contribution, protected-source composition, Results/Add/Undo/Redo/Save ZIP/reopen; no visual-quality or broader model claim'
          : imageProfile
            ? imgVaeProfile
              ? 'Finite installed opaque regional IMG exact A/FP32 with Euler/Normal and CFG Rescale0.7, actual imported source, observed Cancel/frozen Retry after saved Embedded/FP16 edits, exact healthy-control RGB and accepted ordinary IMG provenance through Add/Undo/Redo/Save/reopen completed; no installed VAE pixel-causality or quality claim'
              : 'Finite installed opaque regional IMG UI/default RuntimeManager, actual imported source, live numeric Cancel/frozen Retry and exact healthy-control RGB, explicit Add/Undo/Redo/Save/reopen completed; no visual-quality or broader IMG claim'
            : dynamicPositiveProfile
              ? 'Finite installed two-expansion global-positive prefix, exact per-item TI, original Cancel/frozen Retry and concrete accepted provenance completed after saved template/options/mask/LoRA/VAE edits; same runtime and three wires/two PNGs'
              : globalVaeProfile
                ? 'Finite installed exact VAE A/FP32 with LoRA/TI, observed Cancel, original frozen Retry, two Results and base VAE/precision provenance completed after saved Embedded/FP16 edits; no installed pixel-causality or quality claim'
                : globalLoraProfile
                  ? 'Finite installed global LoRA/TI batch, observed Cancel, original frozen Retry, two Results and full configured-LoRA/global-only-TI accepted provenance completed; no installed numerical-causality or quality claim'
                  : globalTiProfile
                    ? 'Finite installed global/region exact TI batch, observed Cancel, frozen Retry, two Results and global-only accepted provenance completed; no new native TI-causality or quality claim'
                    : staticBatchProfile
                      ? 'Finite installed two-image static batch, exact frozen identity, distinct Results and reviewed Add/Discard/Undo/Save qualification completed; no quality or throughput claim'
                      : workerFaultProfile
                        ? 'Finite installed worker-only fault/normal failure/progress clearing/frozen Retry qualification completed with the same live Main; no visual-quality or capacity claim'
                        : progressProfile
                          ? 'Finite installed original scalar progress/Cancel/frozen Retry qualification completed; no visual-quality or capacity claim'
                          : 'Finite installed public UI Regional qualification completed; evidence supports this exact matrix and no visual-quality or numerical-step claim',
  )
} catch (error) {
  report.outcome = 'failed'
  report.error = { name: error.name, message: error.message, stack: error.stack }
  checkpoint()
  await failureContext().catch((cause) => {
    report.failureContextError = String(cause.stack ?? cause)
    checkpoint()
  })
  process.exitCode = 1
} finally {
  clearTimeout(deadlineTimer)
  clearInterval(sampler)
  await sampling
  if (application)
    await closeNative('failure-finally').catch((error) => {
      report.physicalExitError = String(error.stack ?? error)
      report.outcome = 'failed'
      process.exitCode = 1
    })
  if (database) await database.close()
  report.finishedAt = new Date().toISOString()
  checkpoint()
}
