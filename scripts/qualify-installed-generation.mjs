/**
 * Opt-in trained-model qualification through built Electron, real IPC/Main, installed worker,
 * durable queue/staging, explicit Add and portable Save/reopen. Catalog files are prepared
 * preconditions; this does not qualify CivitAI download, the release installer or model quality.
 * Run with tsx, --fixture <absolute JSON file>. Never part of the ordinary lightweight smoke suite.
 * The launcher must already have finite RAM (at most 12 GiB) and zero swap cgroup limits; the guard
 * also bounds KDE-moved native scopes and refuses unbounded descendants.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  constants,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

import { _electron as electron, expect as baseExpect } from '@playwright/test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { ModelRepository } from '../src/main/models/model-repository.ts'
import { ModelDownloader } from '../src/main/models/model-downloader.ts'
import { qualifyIllustriousEmbedding } from '../src/main/models/illustrious-embedding-qualification.ts'
import {
  ANIMA_QWEN3_0_6B_ENCODER,
  ANIMA_QWEN_IMAGE_VAE,
} from '../src/main/models/anima-manifest.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { assertOutpaintContribution } from '../src/main/projects/outpaint-contribution.ts'
import { decodeTargetPngAlpha } from '../src/main/projects/target-png-mode.ts'
import { createLamaAuxiliaryInstaller } from '../src/main/runtime/inference-auxiliary-installer.ts'
import {
  createInferenceAuxiliaryResourceRoot,
  InferenceAuxiliaryResources,
  verifyInferenceAuxiliaryFile,
} from '../src/main/runtime/inference-auxiliary-resources.ts'
import { LAMA_OUTPAINT_ARTIFACT } from '../src/main/runtime/lama-manifest.ts'
import { INVOKE_ALPHA_OUTPAINT_POLICY_V1 } from '../src/shared/projects/alpha-outpaint.ts'
import { embeddingActivationToken } from '../src/shared/projects/prompt-embeddings.ts'
import { isolateNativeSmokeWindow } from './native-smoke-window.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
} from './qualification-resource-limits.mjs'
import { assertUpgradeBounds } from './upgrade-qualification-worker.mjs'
import { stageLocalCivitaiQualification } from './qualification-local-civitai.mjs'
import {
  assertAcceptedCheckpointIdentity,
  assertNoiseCatalog,
  assertNoiseExecution,
  assertNoiseReady,
  assertNoiseStageOutcome,
  assertNoiseTxt2ImgProgress,
  boundedNoiseCases,
  executionFor,
  noiseModelKeys,
  noiseScheduleOracleProgram,
  noiseStages,
  normalizeNoiseInputs,
  validateNoiseProfileFixture,
} from './noobai-noise-qualification.mjs'

assert.deepEqual(process.argv.slice(2, 3), ['--fixture'])
assert.ok(
  process.argv.length === 4 || (process.argv.length === 5 && process.argv[4] === '--resume'),
)
const resume = process.argv[4] === '--resume'
const expect = baseExpect.configure({ timeout: 120_000 })
const runId = Date.now().toString(36)
assert.ok(path.isAbsolute(process.argv[3]))
const fixture = JSON.parse(await readFile(process.argv[3], 'utf8'))
const cfgRescaleProfile = fixture.profile === 'cfg-rescale'
const outpaintProfile = fixture.profile === 'outpaint'
const vaePrecisionProfile = fixture.profile === 'vae-precision'
const externalVaeProfile = fixture.profile === 'external-vae'
const embeddingsProfile = fixture.profile === 'embeddings'
const vPredictionProfile = fixture.profile === 'v-prediction'
const noiseProfile = fixture.profile === 'noise-profile'
const illustriousOnlyProfile =
  cfgRescaleProfile ||
  vaePrecisionProfile ||
  externalVaeProfile ||
  embeddingsProfile ||
  vPredictionProfile ||
  noiseProfile
const externalVaeKeys = ['externalVaeLdm', 'externalVaeNative', 'externalVaeControl']
const embeddingKeys = ['embeddingTrained', 'embeddingControl']
const priorModelKeys = ['encoder', 'vae', 'anima', 'illustrious', 'animaLora', 'illustriousLora']
const embeddingControlSourceIds = { versionId: 700_111, fileId: 700_112 }
assert.equal(fixture.schemaVersion, 1)
for (const value of [fixture.appData, fixture.artifacts]) {
  assert.equal(typeof value, 'string')
  assert.ok(path.isAbsolute(value))
  assert.equal(path.normalize(value), value)
}
assert.equal(path.basename(fixture.appData), 'imagegen-studio')
const fixtureRoot = path.dirname(path.dirname(fixture.appData))
assert.equal(path.basename(path.dirname(fixture.appData)), 'data')
assert.equal(await realpath(fixture.appData), fixture.appData)
const provision = JSON.parse(
  await readFile(path.join(fixture.appData, 'qualification-runtime.json'), 'utf8'),
)
assert.equal(provision.status, 'passed')
// The provisioner creates this marker only in a newly owned qualification directory.
// Do not seed a user's normal model catalog or accept an arbitrary active pointer.
assert.equal(provision.appData, fixture.appData)
const pointer = JSON.parse(
  await readFile(path.join(fixture.appData, 'runtime/current-runtime.json'), 'utf8'),
)
assert.equal(pointer.runtimeId, provision.runtimeId)
async function canonicalDirectory(directory) {
  const entry = await lstat(directory)
  if (!entry.isDirectory() || entry.isSymbolicLink() || (await realpath(directory)) !== directory) {
    throw new Error(`Expected a canonical directory: ${directory}`)
  }
}
async function createCanonicalDirectory(directory) {
  // Validate the parent before mkdir; recursive creation through an alias would already write
  // outside the declared destination before a subsequent realpath check could refuse it.
  await canonicalDirectory(path.dirname(directory))
  try {
    await mkdir(directory, { mode: 0o700 })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  await canonicalDirectory(directory)
}
await createCanonicalDirectory(path.join(fixture.appData, 'models'))
await createCanonicalDirectory(fixture.artifacts)
// Exclusive creation refuses both existing evidence and symlink targets. Keep this owned file
// descriptor for every checkpoint so a replaced pathname cannot redirect later report writes.
const reportHandle = await open(path.join(fixture.artifacts, 'report.json'), 'wx', 0o600)
const report = {
  status: 'running',
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTree: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }),
  appData: fixture.appData,
  runtimeId: pointer.runtimeId,
  profile: fixture.profile ?? 'default',
  models: [],
  checks: [],
  generations: [],
  failures: [],
  pageErrors: [],
  screenshots: [],
  stages: [],
  boundary: {
    actual:
      'Built Electron renderer/preload/Main, production model qualification and runtime leases, noneditable installed Python worker, trained CUDA models, SQLite queue/receipts, PNG staging, explicit UI Add, .igs writer/loader and close/reopen.',
    preconditions: embeddingsProfile
      ? 'The same installed runtime and seven-resource/nine-version isolated catalog are resumed unchanged. A declared CivitAI-trained Illustrious dual-CLIP embedding and a separately labeled finite zero-tensor causal control are locally verified and cataloged as two versions of one added resource. Same original filename provides one literal with explicit UI version selection. Source download, training attribution and required creator credit are declared fixture preconditions; this runner does not implement network delivery.'
      : externalVaeProfile
        ? 'The same installed runtime and six-resource isolated catalog are resumed. Three exact locally extracted/derived VAE files are verified and cataloged as versions of one qualification resource. The native and LDM files contain trained checkpoint VAE tensors; altered encoder/decoder biases are a labeled artificial causal control. No standalone CivitAI download or independently trained replacement claim.'
        : vaePrecisionProfile
          ? 'The same six-resource isolated catalog and installed runtime are resumed without new weight or runtime copies; only exact Illustrious checkpoint and signed LoRA are used. Embedded VAE, source family and prediction type are declared qualification preconditions.'
          : 'Read-only existing source weights copied and SHA-verified into isolated managed catalog; declared model family/prediction type supplied by qualification fixture. No CivitAI download or family inference claim.',
    limits: embeddingsProfile
      ? 'Installed development worker 0.12, trained Illustrious checkpoint, signed ordinary LoRA -0.5, explicit Embedded VAE/FP32, 256 pixels/3 requested steps/seed 0. Six txt2img cases exercise plain, separate trained/control polarities and weighted repeated dual-polarity literals; two common-source opaque img2img cases use strength 0.5. Genuine Cancel, UI library Default change and removal of both live embedding sidecars precede frozen trained Retry. All eight cases must complete finite pixels with explicit Add/Save/reopen/comparison. Trained-versus-zero pairs preserve literal text and all other numeric inputs; plain-versus-trained changes both prompt literals and binding. No broad embedding compatibility, image quality, network install/repair, Anima embedding, chunk-budget stress, signed release lifecycle, maximum geometry/VRAM or whole-MVP claim.'
      : externalVaeProfile
        ? 'Installed development worker 0.12, trained Illustrious checkpoint with exact LDM/native external VAE and a finite artificial bias control at 256 pixels/3 steps, explicit FP32. Matched txt2img and common-source strength-zero opaque img2img, genuine Cancel/frozen external Retry after UI library Default and draft edits, explicit Add/Save/reopen/comparison. No external VAE network install/repair, arbitrary model compatibility, independent training lineage, signed release lifecycle, maximum geometry/VRAM, image quality or whole-MVP claim.'
        : outpaintProfile
          ? 'Installed development worker 0.12, genuine pinned CPU LaMa and trained CUDA outpaint at 256 pixels. Existing local LaMa bytes replace only network transport through the fixed Main installer. No public network download, first Set up/Install/Repair, signed release lifecycle, maximum geometry, image quality, regional inference or whole-MVP claim.'
          : vaePrecisionProfile
            ? 'Installed development worker 0.12 with genuine trained Illustrious embedded VAE, 256 pixels and 3 steps. Same-input txt2img Auto/FP32/FP16 policy comparison and opaque img2img wiring, actual Cancel/frozen FP32 Retry, explicit Add/Save/reopen and recorded comparison. FP16 qualifies only by finite publication or exact native VAE non-finite refusal with no candidate, PNG, acceptance or seed mutation. Img2img inputs may differ and do not establish numerical equivalence. No signed release lifecycle, external VAE, maximum geometry/VRAM, image quality or whole-MVP claim.'
            : cfgRescaleProfile
              ? 'Development provisioner, not signed release installer/repair or relocatable bundle. Same-input trained txt2img CFG ablation and opaque img2img nonzero wiring/provenance use healthy installed-runtime Save/reopen. This profile does not exercise missing-runtime Save or Home preview rebuild, independently ablate img2img numerics, or establish full image-quality, maximum-resolution/VRAM or whole-MVP readiness.'
              : 'Development provisioner, not signed release installer/repair or relocatable bundle. No full image-quality, maximum-resolution/VRAM or whole-MVP claim. Healthy Save/rebuild uses the installed runtime; a neighboring missing-runtime Save must preserve accepted pixels/provenance with valid placeholder previews.',
    browser:
      'Existing native _electron system harness exercises genuine Electron IPC and the installed CUDA child. HTTP preview availability is outside this qualification.',
  },
}
if (vPredictionProfile) {
  report.boundary.preconditions =
    'Fresh exact two-resource catalog: declared Cyberfalafel NoobAI-derived v-trained checkpoint by Knightus_Ai and one previously qualified ordinary Illustrious LoRA. Source/API/objective descriptors and local bytes are preconditions, not live product download or reconstructed training lineage. The checkpoint starts with null prediction/assumed epsilon; only actual Model Manager UI authors the exact-file override.'
  report.boundary.limits =
    'Installed development worker 0.12, 256 pixels/three requested steps/seed 0/Euler a/Embedded FP32/signed LoRA -0.5. Four finite matched v_prediction/epsilon-policy-control txt2img and common-source strength-0.5 img2img cases. Actual Cancel, refused public Retry under changed library prediction, UI restoration and exact frozen successful Retry, explicit Add/Save/readback/reopen/comparison. Epsilon on v-trained weights is an interpretation control. No ZTSNR/trailing-schedule or full author recipe, image quality, Invoke parity, other installed samplers/outpaint, dynamic batches, live delivery, arbitrary compatibility, Anima or signed release claim.'
}
if (noiseProfile) {
  report.boundary.preconditions =
    'Reuses the original canonical installed worker0.14/runtime and exact credited Cyberfalafel v-trained checkpoint/ordinary LoRA. One distinct official NoobAI epsilon-trained checkpoint is adopted through Main ModelDownloader with local transport. Exact source cards, training attribution, original bytes and recipe snapshots are declared preconditions. Cyber execution uses separately labeled upstream NoobAI guidance on a credited derivative; it does not claim the derivative author published that same recipe.'
  report.boundary.limits =
    'Only the explicitly selected bounded, bounded-lifecycle, author or outpaint stage is qualified. Bounded-lifecycle covers four lifecycle completions and five admissions, without the five trained matched pixel controls or a full bounded claim. Bounded 256px/three-step causal controls do not prove author-resolution execution. Author 832x1216/28-step runs are separate. Normal outpaint uses fixed local LaMa; no authored masks, Regional Guidance, Smart Patch, dynamic batches, Invoke pixel parity, subjective quality, live CivitAI delivery, release Install/Repair or full component matrix.'
  report.noiseStage = fixture.stage
  report.authorRecipes = structuredClone(fixture.authorRecipes)
}
async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}
function validateVPredictionFixture() {
  assert.equal(
    fixture.side,
    256,
    'V-prediction qualification requires exactly 256 pixels per side.',
  )
  assert.equal(fixture.steps, 3, 'V-prediction qualification requires exactly 3 authored steps.')
  assert.deepEqual(
    Object.keys(fixture).sort(),
    [
      'appData',
      'artifacts',
      'illustrious',
      'illustriousLora',
      'profile',
      'schemaVersion',
      'side',
      'steps',
    ].sort(),
    'V-prediction qualification accepts only its two declared resource descriptors.',
  )
  for (const [key, type] of [
    ['illustrious', 'checkpoint'],
    ['illustriousLora', 'lora'],
  ]) {
    const value = fixture[key]
    assert.ok(
      value && typeof value === 'object' && !Array.isArray(value),
      `V-prediction qualification requires ${key}.`,
    )
    assert.deepEqual(
      Object.keys(value).sort(),
      [
        'path',
        'sha256',
        'byteSize',
        'type',
        'family',
        'name',
        'versionName',
        ...(key === 'illustrious' ? ['predictionType', 'trainedObjective', 'origin'] : []),
      ].sort(),
      'V-prediction qualification requires exact descriptor fields.',
    )
    assert.equal(
      value.type,
      type,
      'V-prediction qualification requires checkpoint and ordinary LoRA descriptors.',
    )
    assert.equal(
      value.family,
      'illustrious',
      'V-prediction qualification requires the Illustrious family.',
    )
    assert.equal(typeof value.path, 'string')
    assert.ok(
      path.isAbsolute(value.path) &&
        path.normalize(value.path) === value.path &&
        value.path.endsWith('.safetensors'),
      'V-prediction qualification requires canonical absolute safetensors paths.',
    )
    assert.ok(
      typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256),
      'V-prediction qualification requires exact SHA-256 identities.',
    )
    assert.ok(
      Number.isSafeInteger(value.byteSize) && value.byteSize > 0,
      'V-prediction qualification requires positive exact byte sizes.',
    )
    for (const label of ['name', 'versionName'])
      assert.ok(
        typeof value[label] === 'string' &&
          value[label].trim().length > 0 &&
          value[label] === value[label].trim(),
        'V-prediction qualification requires nonempty exact labels.',
      )
  }
  assert.notEqual(
    fixture.illustrious.sha256,
    fixture.illustriousLora.sha256,
    'V-prediction qualification requires two distinct file identities.',
  )
  assert.equal(
    fixture.illustrious.predictionType,
    null,
    'V-prediction qualification must begin with assumed epsilon, without a seeded override.',
  )
  assert.equal(
    fixture.illustrious.trainedObjective,
    'v_prediction',
    'V-prediction qualification requires a declared v-trained checkpoint.',
  )
  const origin = fixture.illustrious.origin
  assert.ok(
    origin && typeof origin === 'object' && !Array.isArray(origin),
    'V-prediction qualification requires the exact trained source origin.',
  )
  assert.deepEqual(
    origin,
    {
      kind: 'civitai-trained',
      modelId: 1147756,
      versionId: 2679856,
      fileId: 2566634,
      url: 'https://civitai.com/api/download/models/2679856?fileId=2566634',
      modelApi: 'https://civitai.com/api/v1/models/1147756',
      versionApi: 'https://civitai.com/api/v1/model-versions/2679856',
      creator: 'Knightus_Ai',
      baseModel: 'NoobAI',
    },
    'V-prediction qualification requires exact candidate API/source/author identity.',
  )
}
function assertPredictionCatalog(catalog) {
  assert.equal(
    catalog.length,
    2,
    'V-prediction qualification requires exactly two installed resources.',
  )
  assert.equal(catalog.flatMap(({ versions }) => versions).length, 2)
  for (const [key, id] of [
    ['illustrious', 700_040],
    ['illustriousLora', 700_060],
  ]) {
    const value = fixture[key]
    const model = catalog.find(({ versions }) =>
      versions.some(({ file }) => file.sha256 === value.sha256),
    )
    assert.ok(model, 'The exact declared prediction resource must remain installed.')
    assert.equal(model.type, value.type)
    assert.equal(model.displayName, value.name)
    assert.equal(model.versions.length, 1)
    const version = model.versions[0]
    assert.equal(model.defaultVersionId, version.id)
    assert.equal(version.name, value.versionName)
    assert.equal(version.baseModelFamily, 'illustrious')
    assert.equal(version.format, 'safetensors')
    assert.equal(version.expectedSha256, value.sha256)
    assert.equal(version.file.sha256, value.sha256)
    assert.equal(version.file.sizeBytes, value.byteSize)
    assert.equal(version.file.status, 'ready')
    assert.equal(version.file.originalFilename, path.basename(value.path))
    assert.equal(
      version.file.managedPath,
      path.join(fixture.appData, 'models', `qualified-${id}.safetensors`),
    )
    assert.deepEqual(version.dependencyVersionIds, {})
    if (key === 'illustrious') {
      assert.deepEqual(model.source, { kind: 'civitai', modelId: value.origin.modelId })
      assert.equal(model.creator, value.origin.creator)
      assert.equal(version.civitaiVersionId, value.origin.versionId)
      assert.equal(version.civitaiFileId, value.origin.fileId)
      assert.deepEqual(model.sourceMetadata.origin, value.origin)
      assert.deepEqual(version.sourceMetadata.origin, value.origin)
      assert.ok([null, 'epsilon', 'v_prediction'].includes(version.predictionType))
    } else {
      assert.deepEqual(model.source, { kind: 'civitai', modelId: id })
      assert.equal(version.civitaiVersionId, id + 1)
      assert.equal(version.civitaiFileId, id + 2)
      assert.equal(version.predictionType, null)
    }
  }
}
function validateExternalVaeFixture() {
  assert.equal(
    fixture.side,
    256,
    'External VAE qualification requires exactly 256 pixels per side.',
  )
  assert.equal(fixture.steps, 3, 'External VAE qualification requires exactly 3 authored steps.')
  const hashes = new Set()
  const versionNames = new Set()
  assert.deepEqual(
    Object.keys(fixture).filter(
      (key) => key.startsWith('externalVae') && !externalVaeKeys.includes(key),
    ),
    [],
    'External VAE qualification accepts only the three declared external descriptor keys.',
  )
  for (const key of externalVaeKeys) {
    const value = fixture[key]
    assert.ok(
      value && typeof value === 'object' && !Array.isArray(value),
      `External VAE qualification requires ${key}.`,
    )
    assert.equal(
      Object.keys(value).sort().join(','),
      'byteSize,family,name,origin,path,sha256,type,versionName',
      'External VAE descriptors must contain exactly the declared identity, labels and origin fields.',
    )
    assert.equal(value.type, 'vae')
    assert.equal(value.family, 'illustrious')
    assert.ok(
      typeof value.path === 'string' &&
        path.isAbsolute(value.path) &&
        path.normalize(value.path) === value.path,
    )
    assert.ok(typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256))
    assert.ok(Number.isSafeInteger(value.byteSize) && value.byteSize > 0)
    assert.ok(typeof value.name === 'string' && value.name.trim().length > 0)
    assert.ok(typeof value.versionName === 'string' && value.versionName.trim().length > 0)
    assert.ok(value.origin && typeof value.origin === 'object' && !Array.isArray(value.origin))
    if (key === 'externalVaeControl') {
      assert.equal(
        Object.keys(value.origin).sort().join(','),
        'decoderBiasAdd,encoderBiasAdd,format,kind,sourceVaeSha256',
        'The external VAE control origin must contain exactly the declared causal fields.',
      )
      assert.equal(value.origin.kind, 'finite-causal-control')
      assert.equal(value.origin.sourceVaeSha256, fixture.externalVaeNative.sha256)
      assert.equal(value.origin.encoderBiasAdd, 0.1)
      assert.equal(value.origin.decoderBiasAdd, 0.15)
    } else {
      assert.equal(
        Object.keys(value.origin).sort().join(','),
        'checkpointSha256,format,kind',
        'Extracted external VAE origins must contain exactly checkpointSha256, format and kind.',
      )
      assert.equal(value.origin.kind, 'checkpoint-extraction')
      assert.ok(
        typeof value.origin.checkpointSha256 === 'string' &&
          /^[0-9a-f]{64}$/.test(value.origin.checkpointSha256),
      )
      assert.equal(
        value.origin.checkpointSha256,
        fixture.illustrious?.sha256,
        'Extracted external VAE origins must match the exact qualification checkpoint SHA-256.',
      )
    }
    assert.equal(
      value.origin.format,
      key === 'externalVaeLdm' ? 'original-ldm' : 'diffusers-native',
    )
    assert.equal(
      value.name,
      fixture.externalVaeLdm.name,
      'External VAE versions must share one resource display name.',
    )
    hashes.add(value.sha256)
    versionNames.add(value.versionName)
  }
  assert.equal(
    hashes.size,
    3,
    'External VAE qualification requires three distinct file identities.',
  )
  assert.equal(
    versionNames.size,
    3,
    'External VAE qualification requires three distinct version names.',
  )
  const priorKeys = ['encoder', 'vae', 'anima', 'illustrious', 'animaLora', 'illustriousLora']
  const priorHashes = new Set()
  for (const key of priorKeys) {
    assert.ok(
      fixture[key] &&
        typeof fixture[key].sha256 === 'string' &&
        /^[0-9a-f]{64}$/.test(fixture[key].sha256),
      'External VAE qualification must declare all six prior resource identities.',
    )
    priorHashes.add(fixture[key].sha256)
  }
  assert.equal(
    priorHashes.size,
    6,
    'External VAE qualification requires six distinct prior resource identities.',
  )
  assert.ok(
    [...hashes].every((hash) => !priorHashes.has(hash)),
    'External VAE files must be distinct from the six prior resource identities.',
  )
}
function validateEmbeddingFixture() {
  assert.equal(fixture.side, 256, 'Embedding qualification requires exactly 256 pixels per side.')
  assert.equal(fixture.steps, 3, 'Embedding qualification requires exactly 3 authored steps.')
  assert.deepEqual(
    Object.keys(fixture).filter(
      (key) => key.startsWith('embedding') && !embeddingKeys.includes(key),
    ),
    [],
    'Embedding qualification accepts only the two declared embedding descriptor keys.',
  )
  const hashes = new Set()
  const versionNames = new Set()
  for (const key of embeddingKeys) {
    const value = fixture[key]
    assert.ok(
      value && typeof value === 'object' && !Array.isArray(value),
      `Embedding qualification requires ${key}.`,
    )
    assert.equal(
      Object.keys(value).sort().join(','),
      'byteSize,family,name,origin,path,sha256,type,versionName',
      'Embedding descriptors must contain exactly the declared identity, labels and origin fields.',
    )
    assert.equal(value.type, 'embedding')
    assert.equal(value.family, 'illustrious')
    assert.ok(
      typeof value.path === 'string' &&
        path.isAbsolute(value.path) &&
        path.normalize(value.path) === value.path,
    )
    assert.ok(typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256))
    assert.ok(Number.isSafeInteger(value.byteSize) && value.byteSize > 0)
    assert.ok(typeof value.name === 'string' && value.name.trim().length > 0)
    assert.ok(typeof value.versionName === 'string' && value.versionName.trim().length > 0)
    assert.ok(value.origin && typeof value.origin === 'object' && !Array.isArray(value.origin))
    if (key === 'embeddingTrained') {
      assert.equal(
        Object.keys(value.origin).sort().join(','),
        'creator,creditRequired,fileId,kind,modelId,url,versionId',
        'The trained embedding origin must contain exactly the declared CivitAI attribution fields.',
      )
      assert.equal(value.origin.kind, 'civitai-trained')
      for (const field of ['modelId', 'versionId', 'fileId'])
        assert.ok(Number.isSafeInteger(value.origin[field]) && value.origin[field] > 0)
      assert.equal(
        value.origin.url,
        `https://civitai.com/api/download/models/${value.origin.versionId}?fileId=${value.origin.fileId}`,
      )
      assert.ok(typeof value.origin.creator === 'string' && value.origin.creator.trim().length > 0)
      assert.equal(value.origin.creditRequired, true)
      assert.notEqual(value.origin.versionId, embeddingControlSourceIds.versionId)
      assert.notEqual(value.origin.fileId, embeddingControlSourceIds.fileId)
    } else {
      assert.equal(
        Object.keys(value.origin).sort().join(','),
        'kind,sourceEmbeddingSha256,tensorScale',
        'The embedding control origin must contain exactly the declared causal fields.',
      )
      assert.equal(value.origin.kind, 'finite-causal-control')
      assert.equal(value.origin.sourceEmbeddingSha256, fixture.embeddingTrained.sha256)
      assert.equal(value.origin.tensorScale, 0)
    }
    assert.equal(
      value.name,
      fixture.embeddingTrained.name,
      'Embedding versions must share one resource display name.',
    )
    const fileName = path.basename(value.path)
    assert.ok(
      embeddingActivationToken(fileName),
      'Embedding source names must define a valid safetensors activation token.',
    )
    assert.equal(
      fileName,
      path.basename(fixture.embeddingTrained.path),
      'Embedding versions must share the exact canonical filename token.',
    )
    hashes.add(value.sha256)
    versionNames.add(value.versionName)
  }
  assert.equal(hashes.size, 2, 'Embedding qualification requires two distinct file identities.')
  assert.equal(versionNames.size, 2, 'Embedding qualification requires two distinct version names.')
  // Retain the prior external-VAE manifest contract, including its checkpoint/control lineage.
  validateExternalVaeFixture()
  const priorHashes = new Set(
    [...priorModelKeys, ...externalVaeKeys].map((key) => fixture[key].sha256),
  )
  assert.equal(
    priorHashes.size,
    9,
    'Embedding qualification must declare all nine prior file identities.',
  )
  assert.ok(
    [...hashes].every((hash) => !priorHashes.has(hash)),
    'Embedding files must be distinct from the nine prior file identities.',
  )
}
function validateOutpaintFixture() {
  assert.equal(fixture.side, 256, 'Outpaint qualification requires exactly 256 pixels per side.')
  assert.equal(fixture.steps, 3, 'Outpaint qualification requires exactly 3 authored steps.')
  assert.ok(
    fixture.lama &&
      typeof fixture.lama === 'object' &&
      !Array.isArray(fixture.lama) &&
      Object.keys(fixture.lama).sort().join(',') === 'byteSize,path,sha256',
    'Outpaint qualification requires an exact local LaMa descriptor.',
  )
  assert.ok(
    typeof fixture.lama.path === 'string' &&
      path.isAbsolute(fixture.lama.path) &&
      path.normalize(fixture.lama.path) === fixture.lama.path,
    'The LaMa source must be an absolute normalized read-only path.',
  )
  assert.equal(
    fixture.lama.byteSize,
    LAMA_OUTPAINT_ARTIFACT.sizeBytes,
    'The LaMa size must match the fixed resource pin.',
  )
  assert.equal(
    fixture.lama.sha256,
    LAMA_OUTPAINT_ARTIFACT.sha256,
    'The LaMa SHA-256 must match the fixed resource pin.',
  )
}
async function installQualificationLama() {
  const source = await lstat(fixture.lama.path)
  await verifyInferenceAuxiliaryFile({
    byteSize: fixture.lama.byteSize,
    managedPath: fixture.lama.path,
    sha256: fixture.lama.sha256,
  })
  const resources = await createInferenceAuxiliaryResourceRoot(fixture.appData)
  let transportCalls = 0
  const downloader = new ModelDownloader({
    resolveAddresses: async () => ['140.82.112.3'],
    transport: async (url, options) => {
      assert.equal(String(url), LAMA_OUTPAINT_ARTIFACT.url)
      assert.equal(new Headers(options.headers).get('authorization'), null)
      transportCalls += 1
      const sourceStream = createReadStream(fixture.lama.path)
      return new Response(
        Readable.toWeb(sourceStream, {
          strategy: {
            highWaterMark: sourceStream.readableHighWaterMark,
            size: (chunk) => chunk.byteLength,
          },
        }),
        {
          headers: { 'content-length': String(fixture.lama.byteSize) },
          status: 200,
        },
      )
    },
  })
  const installer = createLamaAuxiliaryInstaller(resources, downloader)
  const preview = await installer.preview()
  assert.equal(preview.scope, 'auxiliary-weights')
  const installed = await installer.install(preview.planId)
  const verified = await new InferenceAuxiliaryResources(resources).resolveVerifiedOutpaintInfill()
  assert.equal(verified.sha256, fixture.lama.sha256)
  assert.equal(verified.byteSize, fixture.lama.byteSize)
  const sourceAfter = await lstat(fixture.lama.path)
  assert.deepEqual(
    [sourceAfter.dev, sourceAfter.ino, sourceAfter.size, sourceAfter.mtimeMs, sourceAfter.ctimeMs],
    [source.dev, source.ino, source.size, source.mtimeMs, source.ctimeMs],
  )
  report.lama = {
    source: fixture.lama,
    installed,
    verified,
    preview,
    transportCalls,
    sourceUnchanged: true,
    network:
      'Existing genuine pinned read-only LaMa bytes substitute DNS/transport only; no public network download.',
  }
  await check(
    'Fixed Main LaMa installer independently verifies real local bytes in isolated storage',
  )
}
async function checkpointEvidence(final = false) {
  try {
    const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n')
    let offset = 0
    while (offset < bytes.length) {
      const { bytesWritten } = await reportHandle.write(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      )
      if (bytesWritten === 0) throw new Error('The qualification report could not be written.')
      offset += bytesWritten
    }
    await reportHandle.truncate(bytes.length)
    await reportHandle.sync()
  } finally {
    if (final) await reportHandle.close()
  }
}
async function check(name, evidence = {}) {
  report.checks.push({ name, ...evidence })
  console.log(`PASS ${name}`)
  await checkpointEvidence()
}
async function stage(name, evidence = {}) {
  report.stage = { name, at: new Date().toISOString(), ...evidence }
  report.stages.push(report.stage)
  console.log(`STAGE ${name} ${JSON.stringify(evidence)}`)
  await checkpointEvidence()
}
async function withDeadline(operation, milliseconds, description) {
  let timer
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(description)), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
async function closeNativeQualification() {
  if (!application) return
  if (report.status !== 'failed') {
    await application.close()
    return
  }
  const child = application.process()
  const closing = application.close()
  try {
    await withDeadline(closing, 30_000, 'Failed qualification native close exceeded 30 seconds.')
    return
  } catch (cause) {
    report.cleanup = { gracefulCloseError: String(cause), forcedExit: false }
    console.error('QUALIFICATION cleanup', report.cleanup.gracefulCloseError)
    await checkpointEvidence().catch((writeError) => {
      report.cleanup.diagnosticWriteError = String(writeError?.stack ?? writeError)
      console.error(
        'QUALIFICATION cleanup diagnostic could not be checkpointed',
        report.cleanup.diagnosticWriteError,
      )
    })
  }
  // Only this explicitly provisioned disposable fixture and the child launched by this script
  // may bypass its dirty-document close prompt. Preserve recovery and never manufacture Save.
  assert.equal(report.status, 'failed')
  assert.equal(await realpath(fixture.appData), fixture.appData)
  assert.deepEqual(
    JSON.parse(await readFile(path.join(fixture.appData, 'qualification-runtime.json'), 'utf8')),
    provision,
  )
  assert.deepEqual(
    JSON.parse(await readFile(path.join(fixture.appData, 'runtime/current-runtime.json'), 'utf8')),
    pointer,
  )
  assert.equal(child.pid, report.nativeProcessPid)
  await withDeadline(
    application.evaluate(
      ({ app }, ownership) => {
        if (
          process.pid !== ownership.pid ||
          process.env.XDG_DATA_HOME !== ownership.data ||
          process.env.XDG_CONFIG_HOME !== ownership.config
        ) {
          throw new Error('Refusing forced exit outside the owned failed qualification fixture.')
        }
        app.exit(1)
      },
      { pid: child.pid, data: env.XDG_DATA_HOME, config: env.XDG_CONFIG_HOME },
    ),
    5_000,
    'Owned failed fixture app.exit exceeded 5 seconds.',
  ).catch((cause) => {
    // app.exit can close the evaluation channel before it acknowledges. The process exit below
    // is the independent observation; an evaluation rejection is never reported as success.
    report.cleanup.exitEvaluationError = String(cause)
  })
  await withDeadline(closing, 5_000, 'Owned failed fixture exit was not confirmed.').catch(
    (cause) => {
      report.cleanup.exitConfirmationError = String(cause)
    },
  )
  report.cleanup.forcedExit = child.exitCode !== null || child.signalCode !== null
  await checkpointEvidence()
}
async function installArtifact(repository, value, id, dependencies, publication = null) {
  assert.ok(path.isAbsolute(value.path))
  assert.match(value.sha256, /^[0-9a-f]{64}$/)
  const source = await lstat(value.path)
  assert.ok(source.isFile() && !source.isSymbolicLink())
  assert.equal(source.size, value.byteSize)
  const managed = path.join(fixture.appData, 'models', `qualified-${id}.safetensors`)
  if (
    resume &&
    (await lstat(managed).catch((error) => {
      if (error.code === 'ENOENT') return null
      throw error
    }))
  ) {
    assert.equal(await hashFile(managed), value.sha256)
    const existing = await repository.findExactFileDuplicate({ sha256: value.sha256 })
    assert.equal(existing?.status, 'ready')
    assert.equal(existing.managedPath, managed)
    report.models.push({ ...value, managedPath: managed, reusedQualificationPrecondition: true })
    return { resourceId: existing.resourceId, versionId: existing.versionId, managedPath: managed }
  }
  assert.equal(
    vaePrecisionProfile,
    false,
    'VAE Precision qualification must reuse existing exact managed resources without copies.',
  )
  assert.ok(
    !externalVaeProfile || publication !== null,
    'External VAE qualification must reuse the six existing resources without new copies.',
  )
  assert.ok(
    !embeddingsProfile || value.type === 'embedding',
    'Embedding qualification must reuse the seven existing resources without new copies.',
  )
  if (noiseProfile && value === fixture.illustriousEpsilon) {
    assert.equal(id, 700_140, 'Only the one new official epsilon checkpoint may be adopted.')
    await assert.rejects(lstat(managed), { code: 'ENOENT' })
    const stagingDirectory = path.join(fixture.appData, 'models', `.qualification-epsilon-${runId}`)
    const {
      verified,
      transportCalls: localTransportCalls,
      credentialBoundary,
    } = await stageLocalCivitaiQualification({
      ModelDownloader,
      stagingDirectory,
      source: {
        path: value.path,
        url: value.origin.url,
        byteSize: value.byteSize,
        sha256: value.sha256,
      },
    })
    assert.equal(verified.sha256, value.sha256)
    assert.equal(verified.sizeBytes, value.byteSize)
    await rename(verified.stagingPath, managed)
    await rm(stagingDirectory, { recursive: true })
    report.epsilonAdoption = {
      source: value.origin,
      localTransportCalls,
      bytes: verified.sizeBytes,
      sha256: verified.sha256,
      credentialBoundary,
      boundary:
        'Actual Main ModelDownloader hash/size/staging and catalog publication with local source transport; no live CivitAI delivery claim.',
    }
  } else {
    assert.ok(
      !noiseProfile,
      'Noise profile must reuse its two prior managed files; only the new epsilon checkpoint may be copied.',
    )
    await copyFile(value.path, managed, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE)
  }
  assert.equal(await hashFile(managed), value.sha256)
  const sourceAfter = await lstat(value.path)
  assert.deepEqual(
    [sourceAfter.size, sourceAfter.mtimeMs, sourceAfter.ctimeMs],
    [source.size, source.mtimeMs, source.ctimeMs],
  )
  report.models.push({ ...value, managedPath: managed, sourceUnchanged: true })
  const supported =
    value.type === 'qwen3_encoder' || (value.type === 'vae' && value.family === 'anima')
  const published = await repository.publishVerifiedInstallation({
    dependencies,
    primary: {
      file: {
        managedPath: managed,
        originalFilename: path.basename(value.path),
        sha256: value.sha256,
        sizeBytes: source.size,
        verifiedAt: new Date().toISOString(),
      },
      resource: {
        displayName: value.name,
        ...(publication?.creator ? { creator: publication.creator } : {}),
        source: supported
          ? { kind: 'supported_dependency', key: `qualification-${id}` }
          : { kind: 'civitai', modelId: publication?.sourceModelId ?? id },
        sourceMetadata: {
          qualificationPrecondition: true,
          ...(publication?.resourceOrigin ? { origin: publication.resourceOrigin } : {}),
        },
        type: value.type,
      },
      version: {
        baseModelFamily: value.family,
        format: 'safetensors',
        name: publication?.versionName ?? 'Exact local qualification weights',
        predictionType: value.predictionType ?? null,
        source: supported
          ? {
              kind: 'supported_dependency',
              expectedSha256: value.sha256,
              revision: 'qualification-local-v1',
            }
          : {
              kind: 'civitai',
              expectedSha256: value.sha256,
              versionId: publication?.sourceVersionId ?? id + 1,
              fileId: publication?.sourceFileId ?? id + 2,
            },
        sourceMetadata: {
          qualificationPrecondition: true,
          ...(publication ? { origin: value.origin } : {}),
        },
      },
    },
  })
  return { ...published, managedPath: managed }
}
let application
let window
let database
let mainLog
let preservedExternalPriorCatalog = null
let preservedEmbeddingPriorCatalog = null
let preservedNoisePriorCatalog = null
async function ensureQualificationResourceLimits(phase) {
  report.resourceLimits = await boundQualificationProcess(report.nativeProcessPid)
  report.resourceLimitChecks ??= []
  report.resourceLimitChecks.push({ phase, ...report.resourceLimits })
  await checkpointEvidence()
}
const env = {
  ...process.env,
  NODE_ENV: 'production',
  XDG_DATA_HOME: path.join(fixtureRoot, 'data'),
  XDG_CONFIG_HOME: path.join(fixtureRoot, 'config'),
  XDG_CACHE_HOME: path.join(fixtureRoot, 'cache'),
}
for (const name of [
  'ELECTRON_RUN_AS_NODE',
  'IMAGEGEN_TEST_IMAGE_WORKER',
  'IMAGEGEN_DEV_SERVER_URL',
  'PYTHONPATH',
  'PYTHONHOME',
])
  delete env[name]
async function api(method, ...args) {
  const result = await window.evaluate(({ method, args }) => window.api.projects[method](...args), {
    method,
    args,
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}
async function tab(project) {
  const result = await api('open', project.id)
  assert.equal(result.kind, 'opened')
  return result.tab
}
async function setInput(label, value) {
  const input = window.locator(`input[aria-label="${label}"]`)
  await input.fill(String(value))
  await input.press('Tab')
}
async function captureScreenshot(file, surface = null) {
  // Naive popovers/collapse panels can be visible while their finite entrance transition runs.
  // Observe actual completion and painted frames; leave infinite loading animations in place.
  await window.evaluate(async () => {
    const animations = document
      .getAnimations()
      .filter(
        (animation) =>
          (animation.playState === 'running' || animation.pending) &&
          Number.isFinite(animation.effect?.getComputedTiming().endTime),
      )
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  if (surface) {
    await expect
      .poll(async () =>
        surface.evaluate((element) => {
          for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
            if (Number(getComputedStyle(ancestor).opacity) !== 1) return false
          }
          return true
        }),
      )
      .toBe(true)
  }
  await window.screenshot({ path: file })
}
async function setCfgRescale(project, value) {
  const input = window.locator('input[aria-label="CFG Rescale"]')
  if (!(await input.isVisible())) {
    await window.getByText('Advanced Options', { exact: true }).click()
  }
  await expect(input).toBeEnabled({ timeout: 180_000 })
  if (value === null) {
    // Exercise the actual Reset action and distinguish absent draft data from displayed zero.
    await setInput('CFG Rescale', 0.3)
    await expect.poll(async () => (await tab(project)).generationDraft.cfgRescale).toBe(0.3)
    await window.getByRole('button', { name: 'Reset CFG Rescale', exact: true }).click()
    await expect
      .poll(async () => Object.hasOwn((await tab(project)).generationDraft, 'cfgRescale'))
      .toBe(false)
    await expect(input).toHaveValue('0')
  } else {
    await input.fill('')
    await setInput('CFG Rescale', value)
    await expect.poll(async () => (await tab(project)).generationDraft.cfgRescale).toBe(value)
    assert.ok(Object.hasOwn((await tab(project)).generationDraft, 'cfgRescale'))
  }
}
async function setVaePrecision(project, value) {
  assert.ok(['Auto', 'FP32', 'FP16'].includes(value))
  // Selecting the already displayed default may not emit an authored edit. Move through a real
  // manual choice first so the Auto case explicitly records Auto rather than relying on absence.
  if (value === 'Auto' && (await tab(project)).generationDraft.vaePrecision === undefined) {
    await setVaePrecision(project, 'FP32')
  }
  const input = window.locator('input[aria-label="VAE precision"]')
  if (!(await input.isVisible())) {
    await window.getByText('Advanced Options', { exact: true }).click()
  }
  await expect(input).toBeEnabled({ timeout: 180_000 })
  await input.scrollIntoViewIfNeeded()
  await input.click()
  await window.getByText(value, { exact: true }).last().click()
  await expect.poll(async () => (await tab(project)).generationDraft.vaePrecision).toBe(value)
  await expect(
    input.locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " n-base-selection ")]',
    ),
  ).toContainText(value)
}
async function setExternalVae(project, key) {
  assert.ok(key === null || externalVaeKeys.includes(key))
  const input = window.locator('input[aria-label="VAE"]')
  if (!(await input.isVisible()))
    await window.getByText('Advanced Options', { exact: true }).click()
  await expect(input).toBeEnabled({ timeout: 180_000 })
  await input.scrollIntoViewIfNeeded()
  if (key === null && (await tab(project)).generationDraft.vae !== null) {
    await window.getByRole('button', { name: 'Reset VAE', exact: true }).click()
  } else {
    await input.click()
    if (key === null) await window.getByText('Embedded', { exact: true }).last().click()
    else {
      const value = fixture[key]
      await window
        .locator('.model-option')
        .filter({ hasText: value.name })
        .filter({ hasText: `· ${value.versionName} ·` })
        .click()
    }
  }
  await expect
    .poll(async () => (await tab(project)).generationDraft.vae?.localVersionId ?? null)
    .toBe(key === null ? null : fixture[key].installed.versionId)
  const reference = structuredClone((await tab(project)).generationDraft.vae)
  if (key !== null) {
    assert.equal(reference.localModelId, fixture[key].installed.resourceId)
    assert.equal(reference.fileSha256, fixture[key].sha256)
    assert.equal(reference.versionName, fixture[key].versionName)
    assert.equal(JSON.stringify(reference).includes(fixture[key].installed.managedPath), false)
  }
  await expect(
    window.getByText(
      key === null ? 'Uses the VAE included in the checkpoint.' : 'Uses the selected external VAE.',
      { exact: true },
    ),
  ).toBeVisible()
  return reference
}
const embeddingBasePrompts = {
  positive: 'a red ceramic cup on a wooden table, studio photograph',
  negative: 'blurry, low quality',
}
function embeddingSourceIds(key) {
  return key === 'embeddingTrained'
    ? fixture.embeddingTrained.origin
    : { ...embeddingControlSourceIds, modelId: fixture.embeddingTrained.origin.modelId }
}
function expectedEmbeddingRef(key) {
  const value = fixture[key]
  const source = embeddingSourceIds(key)
  return {
    token: embeddingActivationToken(path.basename(value.path)),
    resource: {
      baseModelFamily: 'illustrious',
      civitaiFileId: source.fileId,
      civitaiModelId: source.modelId,
      civitaiVersionId: source.versionId,
      displayName: value.name,
      fileSha256: value.sha256,
      kind: 'embedding',
      localModelId: value.installed.resourceId,
      localVersionId: value.installed.versionId,
      predictionType: null,
      versionName: value.versionName,
    },
  }
}
function authoredEmbeddingPrompt(polarity, key, repeated) {
  const base = embeddingBasePrompts[polarity]
  if (key === null) return base
  const { token } = expectedEmbeddingRef(key)
  return repeated
    ? `${base}, (${token}:${polarity === 'positive' ? '1.3' : '0.7'}), ${token}${polarity === 'positive' ? `, ${token}` : ''}`
    : `${base}, ${token}`
}
async function authorEmbeddingThroughUi(project, polarity, key, repeated = false) {
  assert.ok(['positive', 'negative'].includes(polarity))
  assert.ok(key === null || embeddingKeys.includes(key))
  const field = polarity === 'positive' ? 'positivePrompt' : 'negativePrompt'
  const control = window.getByRole('textbox', {
    name: polarity === 'positive' ? 'Positive prompt' : 'Negative prompt',
    exact: true,
  })
  const expectedText = authoredEmbeddingPrompt(polarity, key, repeated)
  let phase = 'fill'
  try {
    if (key === null) await control.fill(expectedText)
    else {
      const value = fixture[key]
      const { token } = expectedEmbeddingRef(key)
      // Seal the seeded text in Main before opening an explicit version choice. The same
      // literal belongs to both versions, so only the focused editor's list owns this choice.
      const seedText = `${embeddingBasePrompts[polarity]}, ${token}`
      await control.fill(seedText)
      await expect(control).toHaveText(seedText)
      await expect.poll(async () => (await tab(project)).generationDraft[field].text).toBe(seedText)
      phase = 'seal seeded text'
      await control.press('Tab')
      await expect(control).not.toBeFocused()
      await expect(control).toHaveText(seedText)
      await expect.poll(async () => (await tab(project)).generationDraft[field].text).toBe(seedText)
      phase = 'open owned completion'
      await control.focus()
      await control.press('Control+End')
      await expect(control).toBeFocused()
      await control.press('Control+Space')
      await expect(control).toHaveAttribute('aria-controls', /^[A-Za-z0-9_-]+$/)
      const completionListId = await control.getAttribute('aria-controls')
      const list = window.locator(`[role="listbox"][id="${completionListId}"]`)
      await expect(list).toHaveCount(1)
      await expect(list).toBeVisible()
      const option = list
        .getByRole('option')
        .filter({ has: window.getByText(token, { exact: true }) })
        .filter({ hasText: `${value.name} · ${value.versionName}` })
      await expect(option).toHaveCount(1)
      await expect(option).toBeVisible()
      await expect(control).toBeFocused()
      assert.equal(await control.getAttribute('aria-controls'), completionListId)
      assert.equal(
        await option.evaluate((element) => element.closest('[role="listbox"]')?.id),
        completionListId,
      )
      phase = 'choose owned version'
      await option.click()
      await expect(control).toBeFocused()
      await expect
        .poll(async () => (await tab(project)).generationDraft[field].embeddingRefs)
        .toEqual([expectedEmbeddingRef(key)])
      if (repeated) {
        phase = 'fill weighted repeated literals'
        await control.fill(expectedText)
      }
    }
    phase = 'verify authored prompt'
    await expect(control).toHaveText(expectedText)
    await expect
      .poll(async () => (await tab(project)).generationDraft[field])
      .toEqual({
        text: expectedText,
        embeddingRefs: key === null ? [] : [expectedEmbeddingRef(key)],
      })
    phase = 'seal authored prompt'
    await control.press('Tab')
    await expect(control).not.toBeFocused()
    const decorations = control.locator('.cm-prompt-embedding')
    await expect(decorations).toHaveCount(
      key === null ? 0 : repeated ? (polarity === 'positive' ? 3 : 2) : 1,
    )
    if (key !== null) await expect(decorations.first()).toHaveText(expectedEmbeddingRef(key).token)
    await expect(control.locator('.cm-prompt-embedding-warning')).toHaveCount(0)
    return structuredClone((await tab(project)).generationDraft[field])
  } catch (error) {
    const evidence = {
      phase,
      polarity,
      key,
      repeated,
      projectId: project.id,
      expectedText,
      error: String(error),
    }
    const [dom, main] = await Promise.allSettled([
      window.evaluate(() => ({
        editors: [...document.querySelectorAll('.cm-content[role="textbox"]')].map((element) => ({
          label: element.getAttribute('aria-label'),
          text: element.textContent,
          focused: document.activeElement === element,
          controls: element.getAttribute('aria-controls'),
        })),
        lists: [...document.querySelectorAll('[role="listbox"]')].map((element) => ({
          id: element.id,
          options: [...element.querySelectorAll('[role="option"]')].map(
            (option) => option.textContent,
          ),
        })),
      })),
      tab(project).then(({ generationDraft }) => ({
        positivePrompt: generationDraft.positivePrompt,
        negativePrompt: generationDraft.negativePrompt,
      })),
    ])
    evidence.dom = dom.status === 'fulfilled' ? dom.value : { error: String(dom.reason) }
    evidence.main = main.status === 'fulfilled' ? main.value : { error: String(main.reason) }
    report.embeddingAuthoringFailures ??= []
    report.embeddingAuthoringFailures.push(evidence)
    await checkpointEvidence().catch(() => {})
    throw error
  }
}
async function setEmbeddingDefaultThroughUi(project, key) {
  const value = fixture[key]
  const before = await tab(project)
  const beforeCatalog = await window.evaluate(() => window.api.models.getCatalog())
  assert.equal(beforeCatalog.ok, true)
  const resourceBefore = beforeCatalog.value.find(({ id }) => id === value.installed.resourceId)
  assert.ok(resourceBefore)
  await window.getByRole('button', { name: 'Manage Models', exact: true }).click()
  const manager = window.getByRole('dialog', { name: 'Model Manager', exact: true })
  await expect(manager).toBeVisible()
  await manager.getByRole('button', { name: /^Embeddings/ }).click()
  const resource = manager
    .locator('.resource-row')
    .filter({ has: window.getByText(value.name, { exact: true }) })
  await expect(resource).toHaveCount(1)
  await resource.locator('.resource-select').click()
  const row = manager
    .locator('.version-row')
    .filter({ has: window.getByText(value.versionName, { exact: true }) })
  await expect(row).toBeVisible()
  if (resourceBefore.defaultVersionId !== value.installed.versionId)
    await row.getByRole('button', { name: 'Set Default', exact: true }).click()
  await expect
    .poll(async () => {
      const catalog = await window.evaluate(() => window.api.models.getCatalog())
      assert.equal(catalog.ok, true)
      return catalog.value.find(({ id }) => id === value.installed.resourceId)?.defaultVersionId
    })
    .toBe(value.installed.versionId)
  await expect(row).toContainText('Default')
  const screenshot = path.join(
    fixture.artifacts,
    `embedding-default-${key}-${report.screenshots.length}.png`,
  )
  await captureScreenshot(screenshot, manager)
  report.screenshots.push(screenshot)
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager).toBeHidden()
  const after = await tab(project)
  for (const field of [
    'documentId',
    'generationDraft',
    'primaryBbox',
    'layers',
    'dirty',
    'canUndo',
    'canRedo',
  ])
    assert.deepEqual(after[field], before[field])
  return {
    resourceId: value.installed.resourceId,
    previousVersionId: resourceBefore.defaultVersionId,
    defaultVersionId: value.installed.versionId,
    throughUi: true,
    screenshot,
  }
}
function normalizeEmbeddingInputs(frozen) {
  const normalized = structuredClone({ context: frozen.context, workerJob: frozen.workerJob })
  delete normalized.context.documentId
  delete normalized.context.documentRevision
  const normalizeReference = (reference) => {
    for (const field of [
      'fileSha256',
      'localVersionId',
      'civitaiVersionId',
      'civitaiFileId',
      'versionName',
    ])
      delete reference[field]
  }
  for (const polarity of ['positive', 'negative']) {
    for (const ref of normalized.context.embeddingRefs[polarity]) normalizeReference(ref.resource)
    for (const entry of normalized.context.embeddings[polarity]) {
      delete entry.byteSize
      delete entry.managedPath
      normalizeReference(entry.reference)
    }
    for (const entry of normalized.workerJob.embeddings?.[polarity] ?? []) {
      delete entry.byteSize
      delete entry.path
      delete entry.sha256
    }
  }
  return normalized
}
function assertPortableEmbeddingConfiguration(configuration, capturedPrompts) {
  assert.equal(configuration.vaePrecision, 'FP32')
  assert.equal(configuration.vae, null)
  for (const polarity of ['positive', 'negative']) {
    const field = polarity === 'positive' ? 'positivePrompt' : 'negativePrompt'
    assert.deepEqual(configuration[field], capturedPrompts[polarity])
  }
  const serialized = JSON.stringify(configuration)
  assert.equal(serialized.includes('igs_ti_private_'), false)
  for (const key of embeddingKeys) {
    assert.equal(serialized.includes(fixture[key].path), false)
    assert.equal(serialized.includes(fixture[key].installed.managedPath), false)
  }
}
async function compareEmbeddings(project, layer, capturedPrompts, caseName, packagePath) {
  const before = await tab(project)
  const packageSha256 = await hashFile(packagePath)
  await window.getByRole('button', { name: `Layer actions for ${layer.name}`, exact: true }).click()
  await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
  const comparison = window.getByRole('dialog', {
    name: 'Compare generation settings',
    exact: true,
  })
  try {
    await expect(comparison).toBeVisible()
    await expect(comparison.locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
    await comparison.getByRole('checkbox', { name: 'Show unchanged settings', exact: true }).check()
    const evidence = {}
    for (const polarity of ['positive', 'negative']) {
      const refs = capturedPrompts[polarity].embeddingRefs
      const row = comparison.locator(
        `[data-setting="${polarity === 'positive' ? 'prompt' : 'negativePrompt'}.embeddings"]`,
      )
      const status = refs.length ? 'Removed' : 'Same'
      await expect(row).toHaveAttribute('data-status', status)
      const values = row.locator('.comparison-values p')
      await expect(values).toHaveCount(2)
      if (refs.length) {
        await expect(values.nth(0)).toContainText(refs[0].token)
        await expect(values.nth(0)).toContainText(refs[0].resource.displayName)
        await expect(values.nth(0)).toContainText(refs[0].resource.versionName)
      } else await expect(values.nth(0)).toHaveText('None')
      await expect(values.nth(1)).toHaveText('None')
      evidence[polarity] = { status, capturedRefs: refs, currentRefs: [] }
    }
    const precision = comparison.locator('[data-setting="vaePrecision.value"]')
    await expect(precision).toHaveAttribute('data-status', 'Same')
    await expect(precision.locator('.comparison-values p')).toHaveText(['FP32', 'FP32'])
    const after = await tab(project)
    for (const field of [
      'documentId',
      'generationDraft',
      'primaryBbox',
      'layers',
      'dirty',
      'canUndo',
      'canRedo',
    ])
      assert.deepEqual(after[field], before[field])
    assert.equal(await hashFile(packagePath), packageSha256)
    const screenshot = path.join(fixture.artifacts, `${caseName}-comparison.png`)
    await captureScreenshot(screenshot, comparison)
    report.screenshots.push(screenshot)
    return { ...evidence, precision: 'FP32', screenshot }
  } finally {
    await comparison
      .getByRole('button', { name: 'Close generation settings comparison', exact: true })
      .click()
    await expect(comparison).toBeHidden()
  }
}
async function setExternalVaeDefaultThroughUi(project, key) {
  const value = fixture[key]
  const before = await tab(project)
  const beforeCatalog = await window.evaluate(() => window.api.models.getCatalog())
  assert.equal(beforeCatalog.ok, true)
  const resourceBefore = beforeCatalog.value.find(({ id }) => id === value.installed.resourceId)
  assert.ok(resourceBefore)
  await window.getByRole('button', { name: 'Open VAE in Models', exact: true }).click()
  const manager = window.getByRole('dialog', { name: 'Model Manager', exact: true })
  await expect(manager).toBeVisible()
  const row = manager
    .locator('.version-row')
    .filter({ has: window.getByText(value.versionName, { exact: true }) })
  await expect(row).toBeVisible()
  if (resourceBefore.defaultVersionId !== value.installed.versionId) {
    await row.getByRole('button', { name: 'Set Default', exact: true }).click()
  }
  await expect
    .poll(async () => {
      const catalog = await window.evaluate(() => window.api.models.getCatalog())
      assert.equal(catalog.ok, true)
      return catalog.value.find(({ id }) => id === value.installed.resourceId)?.defaultVersionId
    })
    .toBe(value.installed.versionId)
  await expect(row).toContainText('Default')
  const screenshot = path.join(
    fixture.artifacts,
    `external-vae-default-${key}-${report.screenshots.length}.png`,
  )
  await captureScreenshot(screenshot, manager)
  report.screenshots.push(screenshot)
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager).toBeHidden()
  const after = await tab(project)
  for (const field of [
    'documentId',
    'generationDraft',
    'primaryBbox',
    'layers',
    'dirty',
    'canUndo',
    'canRedo',
  ]) {
    assert.deepEqual(after[field], before[field], `Library Default must not edit Project ${field}.`)
  }
  return {
    resourceId: value.installed.resourceId,
    previousVersionId: resourceBefore.defaultVersionId,
    defaultVersionId: value.installed.versionId,
    throughUi: true,
    screenshot,
  }
}
async function compareExternalVae(project, layer, captured, current, caseName, packagePath) {
  const before = await tab(project)
  const packageSha256 = await hashFile(packagePath)
  await window.getByRole('button', { name: `Layer actions for ${layer.name}`, exact: true }).click()
  await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
  const comparison = window.getByRole('dialog', {
    name: 'Compare generation settings',
    exact: true,
  })
  try {
    await expect(comparison).toBeVisible()
    await expect(comparison.locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
    const row = comparison.locator('[data-setting="vae.resource"]')
    const status = captured === null ? 'Added' : current === null ? 'Removed' : 'Changed'
    await expect(row).toHaveAttribute('data-status', status)
    const values = row.locator('.comparison-values p')
    for (const [index, reference] of [captured, current].entries()) {
      if (reference === null) await expect(values.nth(index)).toHaveText('Embedded')
      else {
        await expect(values.nth(index)).toContainText(reference.displayName)
        await expect(values.nth(index)).toContainText(reference.versionName)
      }
    }
    // Same rows are intentionally hidden by default; expose them through the real UI before
    // requiring the captured/current FP32 invariant instead of weakening it to an absent row.
    await comparison.getByRole('checkbox', { name: 'Show unchanged settings', exact: true }).check()
    const precision = comparison.locator('[data-setting="vaePrecision.value"]')
    await expect(precision).toHaveAttribute('data-status', 'Same')
    await expect(precision.locator('.comparison-values p')).toHaveText(['FP32', 'FP32'])
    const after = await tab(project)
    for (const field of [
      'documentId',
      'generationDraft',
      'primaryBbox',
      'layers',
      'dirty',
      'canUndo',
      'canRedo',
    ]) {
      assert.deepEqual(after[field], before[field])
    }
    assert.equal(await hashFile(packagePath), packageSha256)
    const screenshot = path.join(fixture.artifacts, `${caseName}-comparison.png`)
    await captureScreenshot(screenshot, comparison)
    report.screenshots.push(screenshot)
    return { captured, current, status, precision: 'FP32', screenshot }
  } finally {
    await comparison
      .getByRole('button', { name: 'Close generation settings comparison', exact: true })
      .click()
    await expect(comparison).toBeHidden()
  }
}
async function compareVaePrecision(project, layer, captured, current, caseName) {
  const before = await tab(project)
  await window.getByRole('button', { name: `Layer actions for ${layer.name}`, exact: true }).click()
  await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
  const comparison = window.getByRole('dialog', {
    name: 'Compare generation settings',
    exact: true,
  })
  try {
    await expect(comparison).toBeVisible()
    await expect(comparison.locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
    const row = comparison.locator('[data-setting="vaePrecision.value"]')
    await expect(row).toHaveAttribute('data-status', 'Changed')
    await expect(row.locator('.comparison-values p')).toHaveText([captured, current])
    const after = await tab(project)
    assert.deepEqual(after.layers, before.layers)
    assert.deepEqual(after.generationDraft, before.generationDraft)
    assert.deepEqual(after.primaryBbox, before.primaryBbox)
    assert.equal(after.documentId, before.documentId)
    assert.equal(after.dirty, before.dirty)
    assert.equal(after.canUndo, before.canUndo)
    assert.equal(after.canRedo, before.canRedo)
    const screenshot = path.join(fixture.artifacts, `${caseName}-comparison.png`)
    await captureScreenshot(screenshot, comparison)
    report.screenshots.push(screenshot)
    return { captured, current, status: 'Changed', screenshot }
  } finally {
    await comparison
      .getByRole('button', { name: 'Close generation settings comparison', exact: true })
      .click()
    await expect(comparison).toBeHidden()
  }
}
async function liveInstalledInferenceChildren() {
  const children = []
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue
    try {
      const directory = path.join('/proc', name)
      const status = await readFile(path.join(directory, 'status'), 'utf8')
      if (Number(status.match(/^PPid:\s+(\d+)$/m)?.[1]) !== report.nativeProcessPid) continue
      const argv = (await readFile(path.join(directory, 'cmdline'), 'utf8')).split('\0')
      if (argv.includes('imagegen_worker.inference_main')) children.push(Number(name))
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error
    }
  }
  return children.sort((left, right) => left - right)
}
async function pngFiles(directory) {
  const files = []
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  for (const entry of entries) {
    assert.equal(entry.isSymbolicLink(), false)
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await pngFiles(file)))
    else if (entry.name.endsWith('.png')) files.push(file)
  }
  return files
}
async function compareCfgRescale(project, layer, captured, caseName) {
  const before = await tab(project)
  await window.getByRole('button', { name: `Layer actions for ${layer.name}`, exact: true }).click()
  await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
  const comparison = window.getByRole('dialog', {
    name: 'Compare generation settings',
    exact: true,
  })
  try {
    await expect(comparison).toBeVisible()
    await expect(comparison.locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
    const row = comparison.locator('[data-setting="cfgRescale.value"]')
    await expect(row).toHaveAttribute('data-status', 'Changed')
    await expect(row.locator('.comparison-values p')).toHaveText([String(captured), '0.2'])
    const after = await tab(project)
    assert.equal(after.documentId, before.documentId)
    assert.equal(after.canUndo, before.canUndo)
    assert.equal(after.canRedo, before.canRedo)
    assert.deepEqual(after.primaryBbox, before.primaryBbox)
    assert.deepEqual(after.generationDraft, before.generationDraft)
    assert.deepEqual(after.layers, before.layers)
    assert.equal(after.dirty, before.dirty)
    const screenshot = path.join(fixture.artifacts, `${caseName}-comparison.png`)
    await captureScreenshot(screenshot, comparison)
    report.screenshots.push(screenshot)
    return { captured, current: 0.2, status: 'Changed', screenshot }
  } finally {
    await comparison
      .getByRole('button', { name: 'Close generation settings comparison', exact: true })
      .click()
    await expect(comparison).toBeHidden()
  }
}
async function compareOutpaint(project, layer, retryCase, caseName) {
  const before = await tab(project)
  await window.getByRole('button', { name: `Layer actions for ${layer.name}`, exact: true }).click()
  await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
  const comparison = window.getByRole('dialog', {
    name: 'Compare generation settings',
    exact: true,
  })
  try {
    await expect(comparison).toBeVisible()
    await expect(comparison.locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
    const mode = comparison.locator('[data-setting="context.mode"]')
    await expect(mode).toHaveAttribute('data-status', 'Changed')
    await expect(mode.locator('.comparison-values p')).toHaveText(['outpaint', 'img2img'])
    if (retryCase) {
      const strength = comparison.locator('[data-setting="denoisingStrength.value"]')
      await expect(strength).toHaveAttribute('data-status', 'Changed')
      await expect(strength.locator('.comparison-values p')).toHaveText(['0.5', '0.25'])
    }
    const after = await tab(project)
    assert.deepEqual(after.layers, before.layers)
    assert.deepEqual(after.generationDraft, before.generationDraft)
    assert.deepEqual(after.primaryBbox, before.primaryBbox)
    assert.equal(after.dirty, before.dirty)
    assert.equal(after.canUndo, before.canUndo)
    assert.equal(after.canRedo, before.canRedo)
    const screenshot = path.join(fixture.artifacts, `${caseName}-comparison.png`)
    await captureScreenshot(screenshot, comparison)
    report.screenshots.push(screenshot)
    return { recordedMode: 'outpaint', currentMode: 'img2img', retryCase, screenshot }
  } finally {
    await comparison
      .getByRole('button', { name: 'Close generation settings comparison', exact: true })
      .click()
    await expect(comparison).toBeHidden()
  }
}
async function queueRows(project) {
  return await database.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('local_project_key', '=', project.id)
    .execute()
}
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}
async function decodedImage(url) {
  const result = await window.evaluate(async (imageUrl) => {
    // CSP permits data images but intentionally forbids fetch(data:). Local package/target bytes
    // are an inspection input; decode them directly instead of weakening the production policy.
    const inline = imageUrl.match(/^data:(image\/(?:png|webp));base64,(.+)$/)
    const response = inline ? null : await fetch(imageUrl)
    const bytes = inline
      ? Uint8Array.from(atob(inline[2]), (character) => character.charCodeAt(0))
      : new Uint8Array(await response.arrayBuffer())
    const image = new Image()
    // Decode the exact fetched bytes as a local image. Custom app protocols are a distinct origin
    // from the renderer; drawing their URL directly intentionally taints a browser canvas.
    // The genuine protocol response/status/hash is still verified independently below.
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
    }
    image.src = `data:${inline?.[1] ?? response.headers.get('content-type')};base64,${btoa(binary)}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('The actual image could not be decoded.')
    context.drawImage(image, 0, 0)
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
    let opaquePixels = 0
    let transparentPixels = 0
    for (let index = 3; index < rgba.length; index += 4) {
      if (rgba[index] === 255) opaquePixels += 1
      if (rgba[index] === 0) transparentPixels += 1
    }
    const pixelDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', rgba))
    return {
      encoded: Array.from(bytes),
      height: image.naturalHeight,
      mime: inline?.[1] ?? response.headers.get('content-type'),
      opaquePixels,
      pixelSha256: Array.from(pixelDigest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
      status: response?.status ?? 200,
      transparentPixels,
      width: image.naturalWidth,
    }
  }, url)
  const { encoded, ...metadata } = result
  return { ...metadata, bytes: encoded.length, sha256: sha256(Buffer.from(encoded)) }
}
async function layerSnapshot(layers) {
  // Main deliberately reissues revision-bound capabilities after a draft edit/import. Compare
  // every semantic layer property and the actual served bytes/pixels, rather than temporary URLs.
  return await Promise.all(
    layers.map(async ({ imageUrl, ...layer }) => {
      // Layer capabilities intentionally permit images, not renderer Fetch. Read their actual
      // registered handler through Main's net API; keep renderer CSP/protocol privileges intact.
      const response = await application.evaluate(async ({ net }, url) => {
        const result = await net.fetch(url)
        return {
          status: result.status,
          mime: result.headers.get('content-type'),
          bytes: Array.from(new Uint8Array(await result.arrayBuffer())),
        }
      }, imageUrl)
      assert.equal(response.status, 200)
      const image = await decodedImage(
        `data:${response.mime};base64,${Buffer.from(response.bytes).toString('base64')}`,
      )
      assert.equal(image.width, layer.width)
      assert.equal(image.height, layer.height)
      // Also load the unchanged capability through the same renderer image path as the UI. CORS
      // is already provided by this protocol; anonymous image loading keeps its canvas readable.
      const rendered = await window.evaluate(async (url) => {
        const current = new Image()
        current.crossOrigin = 'anonymous'
        current.src = url
        await current.decode()
        const canvas = document.createElement('canvas')
        canvas.width = current.naturalWidth
        canvas.height = current.naturalHeight
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('The layer image could not be rendered.')
        context.drawImage(current, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))
        return {
          width: current.naturalWidth,
          height: current.naturalHeight,
          pixelSha256: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
        }
      }, imageUrl)
      assert.deepEqual(rendered, {
        width: image.width,
        height: image.height,
        pixelSha256: image.pixelSha256,
      })
      return { layer, image }
    }),
  )
}
function assertNativePrompt(compiled, raw, weightedText, weight) {
  const authoredGroup = `(${weightedText}:${weight})`
  assert.ok(raw.includes(authoredGroup), 'the UI-authored explicit weight must be exercised')
  const cleanedText = raw.replace(authoredGroup, weightedText)
  const start = Array.from(raw.slice(0, raw.indexOf(authoredGroup))).length
  const end = start + Array.from(weightedText).length
  const length = Array.from(cleanedText).length
  assert.deepEqual(compiled, {
    cleanedText,
    spans: [
      ...(start === 0 ? [] : [{ end: start, start: 0, weight: 1 }]),
      { end, start, weight },
      ...(end === length ? [] : [{ end: length, start: end, weight: 1 }]),
    ],
    version: 'anima-prompt-weighting-v1',
  })
}
async function createProject(model, lora, caseName = '', execution = null) {
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: 'New Project', exact: true }).first().click()
  const dialog = window.getByRole('dialog', { name: 'New Project', exact: true })
  const title = `Installed ${model.family} qualification ${runId}${caseName ? ` ${caseName}` : ''}`
  await dialog.locator('input[aria-label="Project name"]').fill(title)
  await dialog
    .locator('input[aria-label="Project width"]')
    .fill(String(execution?.width ?? fixture.side))
  await dialog
    .locator('input[aria-label="Project height"]')
    .fill(String(execution?.height ?? fixture.side))
  await dialog.getByRole('button', { name: 'Create Project', exact: true }).click()
  await window.getByRole('tab', { name: title, exact: true }).waitFor()
  const project = (await api('list')).find((item) => item.title === title)
  assert.ok(project)
  await setInput('Images per click', 1)
  await expect(window.locator('input[aria-label="Images per click"]')).toHaveValue('1')
  await window.locator('[aria-label="Generation model"]').click()
  await window.getByText(model.name, { exact: true }).last().click()
  await expect
    .poll(async () => (await tab(project)).generationDraft.model?.localVersionId)
    .toBe(model.installed.versionId)
  if (model.family === 'anima') {
    await window.locator('[aria-label="Anima method"]').click()
    await window.getByText('Euler', { exact: true }).last().click()
  } else {
    await window.locator('[aria-label="Sampler"]').click()
    await window
      .getByText(execution?.sampler === 'euler' ? 'Euler' : 'Euler a', { exact: true })
      .last()
      .click()
    await window.locator('[aria-label="Scheduler"]').click()
    await window.getByText('Normal', { exact: true }).last().click()
  }
  await setInput('Steps', execution?.steps ?? fixture.steps)
  await setInput('CFG scale', execution?.cfgScale ?? 4)
  const random = window.getByRole('switch', { name: 'Random seed switch' })
  if ((await random.getAttribute('aria-checked')) === 'true') await random.click()
  await setInput('Generation seed', 0)
  await window
    .getByRole('textbox', { name: 'Positive prompt', exact: true })
    .fill(
      model.family === 'anima'
        ? 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
        : 'a red ceramic cup on a wooden table, studio photograph',
    )
  await window
    .getByRole('textbox', { name: 'Negative prompt', exact: true })
    .fill(model.family === 'anima' ? '(blurry:0.7), low quality' : 'blurry, low quality')
  if (lora) {
    await window.locator('[aria-label="Add LoRA"]').click()
    await window.getByText(lora.name, { exact: true }).last().click()
    await setInput(`${lora.name} weight`, -0.5)
    await expect
      .poll(async () => (await tab(project)).generationDraft.loras?.[0]?.weight)
      .toBe(-0.5)
  }
  await expect
    .poll(async () => (await tab(project)).generationDraft.sampling.steps)
    .toBe(execution?.steps ?? fixture.steps)
  return project
}
async function setPredictionThroughUi(project, predictionType, modelKey = 'illustrious') {
  assert.ok(['epsilon', 'v_prediction'].includes(predictionType))
  const before = await tab(project)
  const packagePath = noiseProfile ? await qualificationPackagePath(project) : null
  const packageSha256 = packagePath ? await hashFile(packagePath) : null
  const catalogBefore = await window.evaluate(() => window.api.models.getCatalog())
  assert.equal(catalogBefore.ok, true)
  const model = fixture[modelKey]
  const installed = model.installed
  const previous = catalogBefore.value
    .find(({ id }) => id === installed.resourceId)
    .versions.find(({ id }) => id === installed.versionId)
  await window.getByRole('button', { name: 'Manage Models', exact: true }).click()
  const manager = window.getByRole('dialog', { name: 'Model Manager', exact: true })
  await expect(manager).toBeVisible()
  await manager.getByRole('button', { name: /^Checkpoints/ }).click()
  const resource = manager
    .locator('.resource-row')
    .filter({ has: window.getByText(model.name, { exact: true }) })
  await expect(resource).toHaveCount(1)
  await resource.locator('.resource-select').click()
  const row = manager
    .locator('.version-row')
    .filter({ has: window.getByText(model.versionName, { exact: true }) })
  await expect(row).toHaveCount(1)
  const selection = row.locator('.version-prediction .n-base-selection')
  await expect(selection).toBeVisible()
  if (previous.predictionType !== predictionType || previous.predictionTypeSource === 'default') {
    await selection.click()
    await window
      .getByText(predictionType === 'v_prediction' ? 'V-prediction' : 'Epsilon', { exact: true })
      .last()
      .click()
  }
  await expect
    .poll(async () => {
      const catalog = await window.evaluate(() => window.api.models.getCatalog())
      assert.equal(catalog.ok, true)
      const version = catalog.value
        .find(({ id }) => id === installed.resourceId)
        .versions.find(({ id }) => id === installed.versionId)
      return { predictionType: version.predictionType, source: version.predictionTypeSource }
    })
    .toEqual({ predictionType, source: 'user' })
  await expect(row).toContainText('Chosen for this exact file')
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager).toBeHidden()
  const after = await tab(project)
  for (const field of [
    'documentId',
    'generationDraft',
    'primaryBbox',
    'layers',
    'dirty',
    'canUndo',
    'canRedo',
  ])
    assert.deepEqual(
      after[field],
      before[field],
      `Library prediction editing must preserve Project ${field}.`,
    )
  await expect(window.getByText(`Prediction: ${predictionType}`, { exact: false })).toBeVisible()
  let sql = null
  if (noiseProfile) {
    sql = await database.db
      .selectFrom('checkpoint_prediction_override')
      .selectAll()
      .where('sha256', '=', model.sha256)
      .where('size_bytes', '=', model.byteSize)
      .executeTakeFirstOrThrow()
    assert.equal(sql.prediction_type, predictionType)
    assert.equal(
      await hashFile(packagePath),
      packageSha256,
      'Library prediction editing must preserve saved .igs bytes.',
    )
  }
  return {
    previousPredictionType: previous.predictionType,
    predictionType,
    source: 'user',
    throughUi: true,
    ...(noiseProfile ? { sql, packageUnchanged: true } : {}),
  }
}
async function comparePrediction(project, layer, captured, current, caseName, packagePath) {
  const before = await tab(project)
  const packageSha256 = await hashFile(packagePath)
  await window.getByRole('button', { name: `Layer actions for ${layer.name}`, exact: true }).click()
  await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
  const comparison = window.getByRole('dialog', {
    name: 'Compare generation settings',
    exact: true,
  })
  try {
    await expect(comparison).toBeVisible()
    await expect(comparison.locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
    const row = comparison.locator('[data-setting="model.predictionType"]')
    await expect(row).toHaveAttribute('data-status', 'Changed')
    await expect(row.locator('.comparison-values p')).toHaveText([captured, current])
    const after = await tab(project)
    for (const field of [
      'documentId',
      'generationDraft',
      'primaryBbox',
      'layers',
      'dirty',
      'canUndo',
      'canRedo',
    ])
      assert.deepEqual(after[field], before[field])
    assert.equal(await hashFile(packagePath), packageSha256)
    const screenshot = path.join(fixture.artifacts, `${caseName}-comparison.png`)
    await captureScreenshot(screenshot, comparison)
    report.screenshots.push(screenshot)
    return { captured, current, status: 'Changed', screenshot }
  } finally {
    await comparison
      .getByRole('button', { name: 'Close generation settings comparison', exact: true })
      .click()
    await expect(comparison).toBeHidden()
  }
}
async function qualificationPackagePath(project) {
  const current = await tab(project)
  for (const name of await readdir(path.join(fixture.appData, 'workspaces/Uncategorized'))) {
    if (!name.endsWith('.igs')) continue
    const packagePath = path.join(fixture.appData, 'workspaces/Uncategorized', name)
    if ((await readIgsPackage(packagePath)).project.documentId === current.documentId)
      return packagePath
  }
  throw new Error('The qualification Project has no saved package.')
}
async function setNoiseThroughUi(project, field, value, modelKey = 'illustrious') {
  assert.ok(['rescaleBetasZeroSnr', 'timestepSpacing'].includes(field))
  if (field === 'rescaleBetasZeroSnr') assert.equal(typeof value, 'boolean')
  else assert.ok(['leading', 'linspace', 'trailing'].includes(value))
  const model = fixture[modelKey]
  const before = await tab(project)
  const packagePath = await qualificationPackagePath(project)
  const packageSha256 = await hashFile(packagePath)
  const catalogBefore = await window.evaluate(() => window.api.models.getCatalog())
  assert.equal(catalogBefore.ok, true)
  const previous = catalogBefore.value
    .find(({ id }) => id === model.installed.resourceId)
    .versions.find(({ id }) => id === model.installed.versionId)
  const sourceField =
    field === 'rescaleBetasZeroSnr' ? 'rescaleBetasZeroSnrSource' : 'timestepSpacingSource'
  const policy = async () => {
    const current = await window.evaluate(() => window.api.models.getCatalog())
    assert.equal(current.ok, true)
    return current.value
      .find(({ id }) => id === model.installed.resourceId)
      .versions.find(({ id }) => id === model.installed.versionId).noiseProfile
  }
  await window.getByRole('button', { name: 'Manage Models', exact: true }).click()
  const manager = window.getByRole('dialog', { name: 'Model Manager', exact: true })
  await expect(manager).toBeVisible()
  await manager.getByRole('button', { name: /^Checkpoints/ }).click()
  const resource = manager
    .locator('.resource-row')
    .filter({ has: window.getByText(model.name, { exact: true }) })
  await expect(resource).toHaveCount(1)
  await resource.locator('.resource-select').click()
  const row = manager
    .locator('.version-row')
    .filter({ has: window.getByText(model.versionName, { exact: true }) })
  const select = async (chosen) => {
    if (field === 'rescaleBetasZeroSnr')
      await row.getByRole('switch', { name: `ZTSNR for ${model.versionName}`, exact: true }).click()
    else {
      await row.locator('.checkpoint-noise-controls .n-base-selection').click()
      await window
        .getByText(chosen[0].toUpperCase() + chosen.slice(1), { exact: true })
        .last()
        .click()
    }
    await expect.poll(async () => (await policy()).effective[field]).toBe(chosen)
  }
  if (
    previous.noiseProfile.effective[field] === value &&
    previous.noiseProfile[sourceField] === 'assumed'
  ) {
    await select(
      field === 'rescaleBetasZeroSnr' ? !value : value === 'leading' ? 'trailing' : 'leading',
    )
    await select(value)
  } else if (previous.noiseProfile.effective[field] !== value) await select(value)
  await expect
    .poll(async () => ({
      value: (await policy()).effective[field],
      source: (await policy())[sourceField],
    }))
    .toEqual({ value, source: 'override' })
  const actual = await policy()
  const other = field === 'rescaleBetasZeroSnr' ? 'timestepSpacing' : 'rescaleBetasZeroSnr'
  assert.equal(
    actual.effective[other],
    previous.noiseProfile.effective[other],
    'Editing one exact-file noise field must preserve the other.',
  )
  const sql = await database.db
    .selectFrom('checkpoint_noise_profile_override')
    .selectAll()
    .where('sha256', '=', model.sha256)
    .where('size_bytes', '=', model.byteSize)
    .executeTakeFirstOrThrow()
  assert.equal(
    field === 'rescaleBetasZeroSnr' ? sql.rescale_betas_zero_snr : sql.timestep_spacing,
    field === 'rescaleBetasZeroSnr' ? Number(value) : value,
  )
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager).toBeHidden()
  const after = await tab(project)
  for (const key of [
    'documentId',
    'generationDraft',
    'primaryBbox',
    'layers',
    'dirty',
    'canUndo',
    'canRedo',
  ])
    assert.deepEqual(after[key], before[key], `Library noise editing must preserve Project ${key}.`)
  assert.equal(
    await hashFile(packagePath),
    packageSha256,
    'Library noise editing must preserve saved .igs bytes.',
  )
  return {
    field,
    value,
    modelKey,
    effective: actual.effective,
    throughUi: true,
    sql,
    packageUnchanged: true,
  }
}
async function authorNoiseExecution(project, modelKey, execution) {
  const prediction = await setPredictionThroughUi(project, execution.predictionType, modelKey)
  const zeroSnr = await setNoiseThroughUi(
    project,
    'rescaleBetasZeroSnr',
    execution.noiseProfile.rescaleBetasZeroSnr,
    modelKey,
  )
  const spacing = await setNoiseThroughUi(
    project,
    'timestepSpacing',
    execution.noiseProfile.timestepSpacing,
    modelKey,
  )
  await setVaePrecision(project, 'FP32')
  return { prediction, zeroSnr, spacing }
}
async function compareNoiseProfile(project, layer, captured, current, caseName, packagePath) {
  const before = await tab(project)
  const originalSha256 = await hashFile(packagePath)
  await window.getByRole('button', { name: `Layer actions for ${layer.name}`, exact: true }).click()
  await window.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
  const comparison = window.getByRole('dialog', {
    name: 'Compare generation settings',
    exact: true,
  })
  try {
    await expect(comparison).toBeVisible()
    await expect(comparison.locator('.comparison-scroll')).toHaveAttribute('aria-busy', 'false')
    const changed = comparison.locator('[data-setting="noiseProfile.rescaleBetasZeroSnr"]')
    await expect(changed).toHaveAttribute('data-status', 'Changed')
    await expect(changed.locator('.comparison-values p')).toHaveText([
      captured.rescaleBetasZeroSnr ? 'Enabled' : 'Disabled',
      current.rescaleBetasZeroSnr ? 'Enabled' : 'Disabled',
    ])
    // The production comparison intentionally hides Same rows by default.
    await comparison.getByRole('checkbox', { name: 'Show unchanged settings', exact: true }).check()
    const spacing = comparison.locator('[data-setting="noiseProfile.timestepSpacing"]')
    await expect(spacing).toHaveAttribute('data-status', 'Same')
    const screenshot = path.join(fixture.artifacts, `${caseName}-noise-comparison.png`)
    await captureScreenshot(screenshot, comparison)
    report.screenshots.push(screenshot)
    return {
      captured,
      current,
      zeroSnrStatus: 'Changed',
      spacingStatus: 'Same',
      readOnly: true,
      screenshot,
    }
  } finally {
    await comparison
      .getByRole('button', { name: 'Close generation settings comparison', exact: true })
      .click()
    await expect(comparison).toBeHidden()
    const after = await tab(project)
    for (const key of [
      'documentId',
      'generationDraft',
      'layers',
      'primaryBbox',
      'dirty',
      'canUndo',
      'canRedo',
    ])
      assert.deepEqual(after[key], before[key])
    assert.equal(await hashFile(packagePath), originalSha256)
  }
}
async function qualificationTreeSnapshot(directory) {
  const entry = await lstat(directory).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!entry) return null
  assert.equal(entry.isSymbolicLink(), false)
  const metadata = {
    dev: entry.dev,
    ino: entry.ino,
    mtimeMs: entry.mtimeMs,
    ctimeMs: entry.ctimeMs,
  }
  if (entry.isFile())
    return { ...metadata, kind: 'file', byteSize: entry.size, sha256: await hashFile(directory) }
  assert.ok(entry.isDirectory())
  const children = {}
  for (const name of (await readdir(directory)).sort())
    children[name] = await qualificationTreeSnapshot(path.join(directory, name))
  return { ...metadata, kind: 'directory', children }
}
async function qualifyChangedPredictionRetryRefusal(
  project,
  original,
  targetBytes,
  packagePath,
  caseName,
  change = () => setPredictionThroughUi(project, 'epsilon'),
  restore = () => setPredictionThroughUi(project, 'v_prediction'),
) {
  assert.equal(original.status, 'canceled')
  const changed = await change()
  const before = await tab(project)
  const layers = await layerSnapshot(before.layers)
  const rows = await queueRows(project)
  const receipts = await database.db
    .selectFrom('generation_candidate_receipt')
    .selectAll()
    .where(
      'queue_item_id',
      'in',
      rows.map(({ id }) => id),
    )
    .execute()
  const cursor = await database.db
    .selectFrom('generation_seed_cursor')
    .selectAll()
    .where('local_project_key', '=', project.id)
    .executeTakeFirst()
  const results = await api('listGenerationResults', project.id)
  const packageSha256 = await hashFile(packagePath)
  const inputDirectory = path.join(fixture.appData, 'generation-inputs', original.id)
  const stagingDirectory = path.join(fixture.appData, 'recovery/generation-staging', project.id)
  const inputs = await qualificationTreeSnapshot(inputDirectory)
  const staging = await qualificationTreeSnapshot(stagingDirectory)
  await window.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
  const manager = window.getByRole('dialog', { name: 'Queue Manager', exact: true })
  const button = manager
    .locator(`[data-testid="queue-job-row"][data-job-id="${original.id}"]`)
    .getByRole('button', { name: 'Retry job', exact: true })
  await expect(button).toBeEnabled({ timeout: 180_000 })
  await ensureQualificationResourceLimits('before refused prediction Retry')
  await button.click()
  const message =
    'The exact checkpoint, prediction type or noise profile changed after preparation.'
  await expect(manager.getByText(message, { exact: true })).toBeVisible()
  await expect
    .poll(async () => (await api('getGenerationState', project.id)).error)
    .toEqual({ code: 'GENERATION_INPUT_CHANGED', message })
  await expect.poll(async () => (await api('getGenerationState', project.id)).phase).toBe('idle')
  await expect.poll(liveInstalledInferenceChildren).toEqual([])
  assert.deepEqual(
    await queueRows(project),
    rows,
    'Refused Retry must not publish a row or consume the source sequence.',
  )
  assert.deepEqual(
    await database.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .where(
        'queue_item_id',
        'in',
        rows.map(({ id }) => id),
      )
      .execute(),
    receipts,
  )
  assert.deepEqual(
    await database.db
      .selectFrom('generation_seed_cursor')
      .selectAll()
      .where('local_project_key', '=', project.id)
      .executeTakeFirst(),
    cursor,
  )
  const afterResults = await api('listGenerationResults', project.id)
  assert.deepEqual(afterResults.candidates, results.candidates)
  assert.equal(afterResults.lastActualSeed, results.lastActualSeed)
  assert.equal(await hashFile(packagePath), packageSha256)
  assert.deepEqual(await qualificationTreeSnapshot(inputDirectory), inputs)
  assert.deepEqual(await qualificationTreeSnapshot(stagingDirectory), staging)
  assert.ok((await readFile(path.join(inputDirectory, 'target.png'))).equals(targetBytes))
  const after = await tab(project)
  for (const field of [
    'documentId',
    'generationDraft',
    'primaryBbox',
    'dirty',
    'canUndo',
    'canRedo',
    'lastActualSeedSnapshot',
  ])
    assert.deepEqual(after[field], before[field])
  assert.deepEqual(await layerSnapshot(after.layers), layers)
  const screenshot = path.join(
    fixture.artifacts,
    `${caseName}-changed-prediction-retry-refused.png`,
  )
  await captureScreenshot(screenshot, manager)
  report.screenshots.push(screenshot)
  await manager.getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
  await expect(manager).toBeHidden()
  const restored = await restore()
  const evidence = {
    originalQueueItemId: original.id,
    sourceStatusSequence: original.status_sequence,
    code: 'GENERATION_INPUT_CHANGED',
    message,
    noNewRow: true,
    inputsSha256: sha256(Buffer.from(JSON.stringify(inputs))),
    stagingSha256: sha256(Buffer.from(JSON.stringify(staging))),
    packageSha256,
    restored,
    changed,
    screenshot,
  }
  report.predictionRetryRefusals ??= []
  report.predictionRetryRefusals.push(evidence)
  await checkpointEvidence()
  return evidence
}
async function generateAndAccept(project, family, mode, qualification = null, retryCase = false) {
  // Images-per-click is transient UI state and resets when this script closes/reopens a tab.
  // Set the declared single-job qualification input for every click, including img2img.
  await setInput('Images per click', 1)
  await expect(window.locator('input[aria-label="Images per click"]')).toHaveValue('1')
  const before = await tab(project)
  const precisionQualification = qualification?.kind === 'vae-precision'
  const externalQualification = qualification?.kind === 'external-vae'
  const embeddingQualification = qualification?.kind === 'embeddings'
  const noiseQualification = qualification?.kind === 'noise-profile'
  const predictionQualification = qualification?.kind === 'v-prediction' || noiseQualification
  const execution = noiseQualification
    ? qualification.execution
    : {
        width: fixture.side,
        height: fixture.side,
        steps: fixture.steps,
        cfgScale: 4,
        sampler: 'euler_a',
      }
  const checkpoint = noiseQualification ? fixture[qualification.modelKey] : fixture.illustrious
  const modelKey = noiseQualification ? qualification.modelKey : 'illustrious'
  let currentNoiseProfile = null
  const cfgQualification = qualification?.kind === 'cfg-rescale'
  assert.ok(
    qualification === null ||
      cfgQualification ||
      precisionQualification ||
      externalQualification ||
      embeddingQualification ||
      predictionQualification,
    'Unsupported qualification tag.',
  )
  const capturedCfgRescale = qualification?.cfgRescale ?? 0
  const capturedVaePrecision = precisionQualification
    ? qualification.vaePrecision
    : externalQualification || embeddingQualification || predictionQualification
      ? 'FP32'
      : null
  const currentVaePrecision = precisionQualification ? qualification.currentVaePrecision : null
  const capturedVaeReference = externalQualification
    ? structuredClone(before.generationDraft.vae)
    : null
  const capturedVaeKey = externalQualification ? qualification.vaeKey : null
  const capturedStrength = externalQualification && mode === 'img2img' ? 0 : 0.5
  const capturedPredictionType = predictionQualification
    ? noiseQualification
      ? execution.predictionType
      : qualification.predictionType
    : checkpoint.predictionType
  const currentPredictionType = predictionQualification
    ? capturedPredictionType === 'v_prediction'
      ? 'epsilon'
      : 'v_prediction'
    : null
  let predictionRetryRefusal = null
  let currentPredictionChange = null
  let currentVaeReference = null
  let libraryDefaultChange = null
  const capturedEmbeddingPrompts = embeddingQualification
    ? {
        positive: structuredClone(before.generationDraft.positivePrompt),
        negative: structuredClone(before.generationDraft.negativePrompt),
      }
    : null
  if (cfgQualification) {
    assert.equal(family, 'illustrious')
    assert.equal(
      Object.hasOwn(before.generationDraft, 'cfgRescale'),
      qualification.cfgRescale !== null,
    )
    assert.equal(before.generationDraft.cfgRescale, qualification.cfgRescale ?? undefined)
    if (mode === 'txt2img') assert.deepEqual(before.layers, [])
  }
  if (precisionQualification) {
    assert.equal(family, 'illustrious')
    assert.equal(before.generationDraft.vaePrecision, capturedVaePrecision)
    assert.notEqual(capturedVaePrecision, currentVaePrecision)
    assert.equal(
      before.generationDraft.vae,
      null,
      'This profile qualifies explicit Embedded VAE only.',
    )
    if (mode === 'txt2img') assert.deepEqual(before.layers, [])
  }
  if (externalQualification) {
    assert.equal(family, 'illustrious')
    assert.equal(before.generationDraft.vaePrecision, 'FP32')
    if (capturedVaeKey === null) assert.equal(capturedVaeReference, null)
    else {
      assert.equal(capturedVaeReference.localVersionId, fixture[capturedVaeKey].installed.versionId)
      assert.equal(capturedVaeReference.fileSha256, fixture[capturedVaeKey].sha256)
    }
    if (mode === 'txt2img') assert.deepEqual(before.layers, [])
  }
  if (embeddingQualification) {
    assert.equal(family, 'illustrious')
    assert.equal(before.generationDraft.vae, null)
    assert.equal(before.generationDraft.vaePrecision, 'FP32')
    for (const polarity of ['positive', 'negative']) {
      const key = qualification.embeddingSelection[polarity]
      assert.deepEqual(capturedEmbeddingPrompts[polarity], {
        text: authoredEmbeddingPrompt(polarity, key, qualification.repeated),
        embeddingRefs: key === null ? [] : [expectedEmbeddingRef(key)],
      })
    }
    if (mode === 'txt2img') assert.deepEqual(before.layers, [])
  }
  const existingLayers = await layerSnapshot(before.layers)
  if (predictionQualification) {
    assert.equal(family, 'illustrious')
    assert.equal(before.generationDraft.vae, null)
    assert.equal(before.generationDraft.vaePrecision, 'FP32')
    assert.deepEqual(before.generationDraft.positivePrompt.embeddingRefs, [])
    assert.deepEqual(before.generationDraft.negativePrompt.embeddingRefs, [])
    if (mode === 'txt2img') assert.deepEqual(before.layers, [])
  }
  const workspaceDirectory = path.join(fixture.appData, 'workspaces/Uncategorized')
  let beforePackagePath
  for (const name of await readdir(workspaceDirectory)) {
    if (!name.endsWith('.igs')) continue
    const currentPath = path.join(workspaceDirectory, name)
    if ((await readIgsPackage(currentPath)).project.documentId === before.documentId) {
      beforePackagePath = currentPath
      break
    }
  }
  assert.ok(beforePackagePath)
  const previousAcceptedLayers = (await readIgsPackage(beforePackagePath)).project.layers
  const beforePackageSha256 = await hashFile(beforePackagePath)
  const previousRows = await queueRows(project)
  const previousSeedCursor =
    precisionQualification ||
    externalQualification ||
    embeddingQualification ||
    predictionQualification
      ? await database.db
          .selectFrom('generation_seed_cursor')
          .selectAll()
          .where('local_project_key', '=', project.id)
          .executeTakeFirst()
      : null
  const previousLastActualSeed =
    precisionQualification ||
    externalQualification ||
    embeddingQualification ||
    predictionQualification
      ? (await api('listGenerationResults', project.id)).lastActualSeed
      : null
  const existingJobIds = new Set(previousRows.map(({ id }) => id))
  const started = Date.now()
  const button = window.getByRole('button', { name: 'Generate', exact: true })
  // These are harness observation deadlines for cold trained weights, not product timeout promises.
  await expect(button).toBeEnabled({ timeout: 180_000 })
  await ensureQualificationResourceLimits('before Generate')
  await button.click()
  let admitted
  await expect
    .poll(
      async () => {
        const rows = (await queueRows(project)).filter(({ id }) => !existingJobIds.has(id))
        if (rows.length === 1) admitted = rows[0]
        return rows.length
      },
      { timeout: 180_000 },
    )
    .toBe(1)
  const frozen = JSON.parse(admitted.frozen_payload_json)
  const requestedSeedPolicy =
    mode === 'txt2img' ||
    externalQualification ||
    embeddingQualification ||
    (predictionQualification && mode !== 'outpaint')
      ? 'fixed'
      : 'reuse'
  assert.equal(before.generationDraft.seed.policy, requestedSeedPolicy)
  assert.equal(admitted.document_id, before.documentId)
  assert.equal(admitted.operation, `${family}-${mode}`)
  assert.equal(frozen.kind, admitted.operation)
  assert.equal(frozen.context.documentId, admitted.document_id)
  assert.equal(frozen.context.documentRevision, admitted.document_revision)
  assert.deepEqual(frozen.context.bbox, before.primaryBbox)
  assert.deepEqual(frozen.context.prompts, {
    negative: before.generationDraft.negativePrompt.text,
    positive: before.generationDraft.positivePrompt.text,
  })
  assert.equal(frozen.context.sampling.seed, 0)
  assert.equal(frozen.context.sampling.requestedSeedPolicy, requestedSeedPolicy)
  assert.equal(frozen.context.sampling.steps, execution.steps)
  assert.equal(frozen.context.sampling.cfgScale, execution.cfgScale)
  assert.deepEqual(frozen.context.loraStack, before.generationDraft.loras)
  if (cfgQualification) {
    assert.equal(frozen.context.sampling.cfgRescale, capturedCfgRescale)
    assert.equal(frozen.workerJob.sampling.cfgRescale, capturedCfgRescale)
  }
  if (precisionQualification) {
    assert.equal(frozen.context.vaePrecision, capturedVaePrecision)
    assert.equal(frozen.workerJob.vaePrecision, capturedVaePrecision)
    assert.equal(frozen.context.vae, null, 'The frozen context must use Embedded VAE.')
    assert.equal(frozen.workerJob.vae, null, 'The actual worker must use Embedded VAE.')
  }
  if (externalQualification) {
    assert.equal(frozen.context.vaePrecision, 'FP32')
    assert.equal(frozen.workerJob.vaePrecision, 'FP32')
    const value = capturedVaeKey === null ? null : fixture[capturedVaeKey]
    assert.deepEqual(
      frozen.context.vae,
      value === null
        ? null
        : {
            byteSize: value.byteSize,
            managedPath: value.installed.managedPath,
            reference: capturedVaeReference,
          },
    )
    assert.deepEqual(
      frozen.workerJob.vae,
      value === null
        ? null
        : {
            byteSize: value.byteSize,
            path: value.installed.managedPath,
            sha256: value.sha256,
          },
    )
  }
  if (embeddingQualification) {
    assert.equal(frozen.context.vaePrecision, 'FP32')
    assert.equal(frozen.workerJob.vaePrecision, 'FP32')
    assert.equal(frozen.context.vae, null)
    assert.equal(frozen.workerJob.vae, null)
    const expectedRefs = {
      positive: capturedEmbeddingPrompts.positive.embeddingRefs,
      negative: capturedEmbeddingPrompts.negative.embeddingRefs,
    }
    const expectedFiles = { positive: [], negative: [] }
    const expectedWire = { positive: [], negative: [] }
    for (const polarity of ['positive', 'negative']) {
      for (const ref of expectedRefs[polarity]) {
        const value = fixture[qualification.embeddingSelection[polarity]]
        expectedFiles[polarity].push({
          token: ref.token,
          byteSize: value.byteSize,
          managedPath: value.installed.managedPath,
          reference: ref.resource,
        })
        expectedWire[polarity].push({
          token: ref.token,
          byteSize: value.byteSize,
          path: value.installed.managedPath,
          sha256: value.sha256,
        })
      }
    }
    assert.deepEqual(frozen.context.embeddingRefs, expectedRefs)
    assert.deepEqual(frozen.context.embeddings, expectedFiles)
    if (expectedWire.positive.length || expectedWire.negative.length)
      assert.deepEqual(frozen.workerJob.embeddings, expectedWire)
    else assert.equal(Object.hasOwn(frozen.workerJob, 'embeddings'), false)
    assert.equal(JSON.stringify(frozen.context.prompts).includes('igs_ti_private_'), false)
  }
  if (noiseQualification) assertNoiseExecution(frozen, execution)
  const lora = fixture[family === 'anima' ? 'animaLora' : 'illustriousLora']
  if (predictionQualification) {
    assert.equal(frozen.context.vaePrecision, 'FP32')
    assert.equal(frozen.workerJob.vaePrecision, 'FP32')
    assert.equal(frozen.context.vae, null)
    assert.equal(frozen.workerJob.vae, null)
  }
  assert.equal(frozen.context.loras.length, 1)
  assert.equal(frozen.context.loras[0].reference.fileSha256, lora.sha256)
  assert.equal(frozen.context.loras[0].weight, -0.5)
  assert.equal(frozen.workerJob.loras[0].sha256, lora.sha256)
  assert.equal(frozen.workerJob.loras[0].weight, -0.5)
  let nativePlan = null
  if (family === 'anima') {
    assert.equal(frozen.context.model.checkpoint.reference.fileSha256, fixture.anima.sha256)
    assert.equal(frozen.context.model.checkpoint.reference.predictionType, null)
    assert.equal(frozen.context.model.qwen3Encoder.sha256, fixture.encoder.sha256)
    assert.equal(frozen.context.model.vae.sha256, fixture.vae.sha256)
    assert.equal(frozen.workerJob.model.checkpoint.sha256, fixture.anima.sha256)
    assert.equal(frozen.workerJob.model.qwen3Encoder.sha256, fixture.encoder.sha256)
    assert.equal(frozen.workerJob.model.vae.sha256, fixture.vae.sha256)
    assertNativePrompt(
      frozen.workerJob.prompts.positive,
      frozen.context.prompts.positive,
      'red',
      1.3,
    )
    assertNativePrompt(
      frozen.workerJob.prompts.negative,
      frozen.context.prompts.negative,
      'blurry',
      0.7,
    )
    nativePlan = frozen.workerJob.sampling
    const startStep = mode !== 'txt2img' ? Math.floor(0.5 * execution.steps) : 0
    assert.equal(frozen.context.sampling.animaMethod, 'euler')
    assert.equal(nativePlan.version, 'anima-flow-denoising-v1')
    assert.equal(nativePlan.scheduler, 'euler')
    assert.equal(nativePlan.mode, mode === 'outpaint' ? 'img2img' : mode)
    assert.equal(nativePlan.steps, execution.steps)
    assert.equal(nativePlan.seed, 0)
    assert.equal(nativePlan.guidanceScale, execution.cfgScale)
    assert.equal(nativePlan.width, execution.width)
    assert.equal(nativePlan.height, execution.height)
    assert.equal(nativePlan.strength, mode !== 'txt2img' ? 0.5 : null)
    assert.equal(nativePlan.startStep, startStep)
    assert.equal(nativePlan.totalSteps, execution.steps - startStep)
    assert.equal(nativePlan.timesteps.length, nativePlan.totalSteps)
    assert.equal(nativePlan.sigmas.length, nativePlan.totalSteps + 1)
    assert.equal(nativePlan.sigmas.at(-1), 0)
  } else {
    assert.equal(frozen.context.model.reference.fileSha256, checkpoint.sha256)
    assert.equal(frozen.context.model.reference.predictionType, capturedPredictionType)
    assert.equal(frozen.workerJob.checkpoint.sha256, checkpoint.sha256)
    assert.equal(frozen.workerJob.checkpoint.predictionType, capturedPredictionType)
    assert.equal(frozen.context.sampling.invokeScheduler, execution.sampler)
    assert.deepEqual(frozen.workerJob.prompts, frozen.context.prompts)
  }
  if (mode !== 'txt2img') assert.equal(frozen.context.sampling.denoisingStrength, capturedStrength)
  if (externalQualification && mode === 'img2img')
    assert.equal(frozen.workerJob.sampling.denoisingStrength, 0)
  if (embeddingQualification && mode === 'img2img')
    assert.equal(frozen.workerJob.sampling.denoisingStrength, 0.5)
  const targetPath = path.join(fixture.appData, 'generation-inputs', admitted.id, 'target.png')
  const targetEntry = await lstat(targetPath)
  assert.ok(targetEntry.isFile() && !targetEntry.isSymbolicLink())
  const targetBytes = await readFile(targetPath)
  const targetSha256 = sha256(targetBytes)
  assert.equal(targetBytes.length, frozen.context.target.byteSize)
  assert.equal(targetSha256, frozen.context.target.sha256)
  assert.equal(targetSha256, frozen.workerJob.target.sha256)
  const target = await decodedImage(`data:image/png;base64,${targetBytes.toString('base64')}`)
  assert.equal(target.sha256, targetSha256)
  assert.equal(target.width, execution.width)
  assert.equal(target.height, execution.height)
  if (mode === 'outpaint') {
    assert.equal(target.transparentPixels, 64 * execution.height)
    assert.equal(target.opaquePixels, (execution.width - 64) * execution.height)
    assert.deepEqual(frozen.context.conditioning.policy, INVOKE_ALPHA_OUTPAINT_POLICY_V1)
    assert.deepEqual(frozen.context.conditioning.infillResource, {
      byteSize: fixture.lama.byteSize,
      role: 'outpaint-infill',
      sha256: fixture.lama.sha256,
    })
    assert.equal(frozen.context.conditioning.sourceTarget.sha256, targetSha256)
    assert.equal(
      frozen.context.conditioning.keepMask.sha256,
      sha256(decodeTargetPngAlpha(targetBytes, execution.width, execution.height)),
    )
  } else {
    assert.equal(
      mode === 'img2img' ? target.opaquePixels : target.transparentPixels,
      execution.width * execution.height,
    )
  }
  if (mode === 'img2img') {
    if (externalQualification || embeddingQualification || predictionQualification)
      assert.equal(target.pixelSha256, qualification.commonSource.pixelSha256)
    else {
      const previous = report.generations.findLast(
        (generation) =>
          generation.projectKey === project.id &&
          generation.family === family &&
          (precisionQualification || generation.mode === 'txt2img'),
      )
      assert.ok(previous)
      assert.equal(target.pixelSha256, previous.dimensions.pixelSha256)
    }
  }
  // Change current authoring only after durable admission; the accepted record must retain click input.
  const changedPrompt = predictionQualification
    ? before.generationDraft.positivePrompt.text
    : `${embeddingQualification ? embeddingBasePrompts.positive : before.generationDraft.positivePrompt.text}, later authoring edit`
  const changedNegativePrompt = embeddingQualification
    ? `${embeddingBasePrompts.negative}, later authoring edit`
    : null
  const removeLiveEmbeddingPrompts = async () => {
    for (const polarity of ['positive', 'negative']) {
      const field = polarity === 'positive' ? 'positivePrompt' : 'negativePrompt'
      const text = polarity === 'positive' ? changedPrompt : changedNegativePrompt
      const control = window.getByRole('textbox', {
        name: polarity === 'positive' ? 'Positive prompt' : 'Negative prompt',
        exact: true,
      })
      await control.fill(text)
      await expect
        .poll(async () => (await tab(project)).generationDraft[field])
        .toEqual({ text, embeddingRefs: [] })
      await control.press('Tab')
      await expect(control.locator('.cm-prompt-embedding')).toHaveCount(0)
    }
  }
  if (!embeddingQualification && !predictionQualification) {
    await window.getByRole('textbox', { name: 'Positive prompt', exact: true }).fill(changedPrompt)
    await expect
      .poll(async () => (await tab(project)).generationDraft.positivePrompt.text)
      .toBe(changedPrompt)
  }
  let retry = null
  if (retryCase) {
    assert.ok(
      mode === 'outpaint' ||
        ((precisionQualification ||
          externalQualification ||
          embeddingQualification ||
          predictionQualification) &&
          mode === 'img2img'),
    )
    const original = admitted
    let nativeChildrenBeforeCancel = null
    if (embeddingQualification || predictionQualification) {
      await expect
        .poll(
          async () => {
            const current = (await queueRows(project)).find(({ id }) => id === original.id)
            nativeChildrenBeforeCancel = await liveInstalledInferenceChildren()
            return current?.status === 'running' && nativeChildrenBeforeCancel.length > 0
          },
          { timeout: 180_000 },
        )
        .toBe(true)
      await ensureQualificationResourceLimits('inference-child-running')
    }
    // Cancel the actual admitted worker through the public UI. There is no controlled peer,
    // manufactured terminal row or completion-to-canceled rewrite in this qualification.
    const cancel = window.getByRole('button', { name: 'Cancel current generation', exact: true })
    await expect(cancel).toBeEnabled({ timeout: 180_000 })
    await cancel.click()
    await expect
      .poll(async () => (await queueRows(project)).find(({ id }) => id === original.id)?.status, {
        timeout: 180_000,
      })
      .toBe('canceled')
    const canceled = (await queueRows(project)).find(({ id }) => id === original.id)
    await expect.poll(async () => (await api('getGenerationState', project.id)).phase).toBe('idle')
    assert.equal((await api('listGenerationResults', project.id)).candidates.length, 0)
    if (
      precisionQualification ||
      externalQualification ||
      embeddingQualification ||
      predictionQualification
    ) {
      assert.deepEqual(
        await database.db
          .selectFrom('generation_candidate_receipt')
          .selectAll()
          .where('queue_item_id', '=', original.id)
          .execute(),
        [],
      )
      assert.deepEqual(
        await database.db
          .selectFrom('generation_seed_cursor')
          .selectAll()
          .where('local_project_key', '=', project.id)
          .executeTakeFirst(),
        previousSeedCursor,
      )
      await expect.poll(liveInstalledInferenceChildren).toEqual([])
      assert.equal(capturedVaePrecision, 'FP32')
      if (predictionQualification) {
        assert.equal(capturedPredictionType, 'v_prediction')
        assert.equal(
          (await api('listGenerationResults', project.id)).lastActualSeed,
          previousLastActualSeed,
        )
        const canceledTab = await tab(project)
        assert.deepEqual(await layerSnapshot(canceledTab.layers), existingLayers)
        assert.deepEqual(canceledTab.generationDraft, before.generationDraft)
        assert.deepEqual(canceledTab.primaryBbox, before.primaryBbox)
        assert.equal(await hashFile(beforePackagePath), beforePackageSha256)
        if (noiseQualification) {
          predictionRetryRefusal = []
          for (const [axis, change, restore] of [
            [
              'zero-snr',
              () => setNoiseThroughUi(project, 'rescaleBetasZeroSnr', false, modelKey),
              () => setNoiseThroughUi(project, 'rescaleBetasZeroSnr', true, modelKey),
            ],
            [
              'spacing',
              () => setNoiseThroughUi(project, 'timestepSpacing', 'trailing', modelKey),
              () => setNoiseThroughUi(project, 'timestepSpacing', 'leading', modelKey),
            ],
            [
              'prediction',
              () => setPredictionThroughUi(project, 'epsilon', modelKey),
              () => setPredictionThroughUi(project, 'v_prediction', modelKey),
            ],
          ]) {
            const refusal = await qualifyChangedPredictionRetryRefusal(
              project,
              canceled,
              targetBytes,
              beforePackagePath,
              `${qualification.caseName}-${axis}`,
              change,
              restore,
            )
            predictionRetryRefusal.push({ ...refusal, axis })
          }
        } else
          predictionRetryRefusal = await qualifyChangedPredictionRetryRefusal(
            project,
            canceled,
            targetBytes,
            beforePackagePath,
            qualification.caseName,
          )
      } else if (embeddingQualification) {
        assert.equal(
          (await api('listGenerationResults', project.id)).lastActualSeed,
          previousLastActualSeed,
        )
        const canceledTab = await tab(project)
        assert.deepEqual(await layerSnapshot(canceledTab.layers), existingLayers)
        assert.deepEqual(canceledTab.primaryBbox, before.primaryBbox)
        assert.deepEqual(canceledTab.generationDraft, before.generationDraft)
        assert.equal(await hashFile(beforePackagePath), beforePackageSha256)
        assert.deepEqual(qualification.embeddingSelection, {
          positive: 'embeddingTrained',
          negative: 'embeddingTrained',
        })
        libraryDefaultChange = await setEmbeddingDefaultThroughUi(project, 'embeddingControl')
        assert.notEqual(
          libraryDefaultChange.previousVersionId,
          libraryDefaultChange.defaultVersionId,
        )
        for (const polarity of ['positive', 'negative']) {
          const field = polarity === 'positive' ? 'positivePrompt' : 'negativePrompt'
          assert.deepEqual(
            (await tab(project)).generationDraft[field],
            capturedEmbeddingPrompts[polarity],
          )
        }
        await removeLiveEmbeddingPrompts()
      } else if (externalQualification) {
        assert.equal(capturedVaeKey, 'externalVaeNative')
        libraryDefaultChange = await setExternalVaeDefaultThroughUi(project, 'externalVaeControl')
        assert.notEqual(
          libraryDefaultChange.previousVersionId,
          libraryDefaultChange.defaultVersionId,
        )
        assert.deepEqual((await tab(project)).generationDraft.vae, capturedVaeReference)
        currentVaeReference = await setExternalVae(project, qualification.currentVaeKey)
      } else {
        assert.equal(currentVaePrecision, 'FP16')
        await setVaePrecision(project, currentVaePrecision)
      }
    } else {
      await setInput('Denoising Strength', 0.25)
      await expect
        .poll(async () => (await tab(project)).generationDraft.sampling.denoisingStrength)
        .toBe(0.25)
    }
    await window.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
    const manager = window.getByRole('dialog', { name: 'Queue Manager', exact: true })
    const retryButton = manager
      .locator(`[data-testid="queue-job-row"][data-job-id="${original.id}"]`)
      .getByRole('button', { name: 'Retry job', exact: true })
    await expect(retryButton).toBeEnabled({ timeout: 180_000 })
    await ensureQualificationResourceLimits('before successful Retry')
    await retryButton.click()
    await expect
      .poll(async () => {
        const attempts = (await queueRows(project)).filter(
          ({ id }) => id !== original.id && !existingJobIds.has(id),
        )
        if (attempts.length === 1) admitted = attempts[0]
        return attempts.length
      })
      .toBe(1)
    assert.equal(admitted.frozen_payload_json, original.frozen_payload_json)
    assert.notEqual(admitted.staging_session_id, original.staging_session_id)
    const source = (await queueRows(project)).find(({ id }) => id === original.id)
    assert.equal(source.status, 'canceled')
    assert.equal(source.status_sequence, canceled.status_sequence + 1)
    const copiedTargetPath = path.join(
      fixture.appData,
      'generation-inputs',
      admitted.id,
      'target.png',
    )
    assert.ok(
      (await readFile(copiedTargetPath)).equals(targetBytes),
      'Retry must retain exact target bytes',
    )
    retry = {
      originalQueueItemId: original.id,
      retryQueueItemId: admitted.id,
      copiedTargetPath,
      ...(precisionQualification
        ? {
            capturedVaePrecision,
            currentVaePrecision: (await tab(project)).generationDraft.vaePrecision,
            canceledStatusSequence: canceled.status_sequence,
            consumedSourceStatusSequence: source.status_sequence,
          }
        : {}),
      ...(externalQualification
        ? {
            capturedVaeReference,
            currentVaeReference,
            libraryDefaultChange,
            canceledStatusSequence: canceled.status_sequence,
            consumedSourceStatusSequence: source.status_sequence,
          }
        : {}),
      ...(embeddingQualification
        ? {
            capturedEmbeddingPrompts,
            currentEmbeddingRefs: { positive: [], negative: [] },
            libraryDefaultChange,
            canceledStatusSequence: canceled.status_sequence,
            consumedSourceStatusSequence: source.status_sequence,
            originalFrozenPayloadSha256: sha256(Buffer.from(original.frozen_payload_json)),
            nativeChildrenBeforeCancel,
            nativeChildrenAfterCancel: [],
          }
        : {}),
      ...(predictionQualification
        ? {
            capturedPredictionType,
            predictionRetryRefusal,
            originalFrozenPayloadSha256: sha256(Buffer.from(original.frozen_payload_json)),
            canceledStatusSequence: canceled.status_sequence,
            consumedSourceStatusSequence: source.status_sequence,
            nativeChildrenBeforeCancel,
            nativeChildrenAfterCancel: [],
          }
        : {}),
    }
    await manager.getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
  }
  let normalizedInputs = null
  if (qualification) {
    normalizedInputs = embeddingQualification
      ? normalizeEmbeddingInputs(frozen)
      : structuredClone({ context: frozen.context, workerJob: frozen.workerJob })
    // Different fresh Projects require distinct identities; remove only the selected policy.
    delete normalizedInputs.context.documentId
    delete normalizedInputs.context.documentRevision
    if (noiseQualification) {
      normalizedInputs = normalizeNoiseInputs(frozen)
    } else if (predictionQualification) {
      delete normalizedInputs.context.model.reference.predictionType
      delete normalizedInputs.workerJob.checkpoint.predictionType
    } else if (embeddingQualification) {
      if (!retryCase) await removeLiveEmbeddingPrompts()
      assert.equal((await tab(project)).generationDraft.vaePrecision, 'FP32')
      assert.equal((await tab(project)).generationDraft.vae, null)
    } else if (externalQualification) {
      delete normalizedInputs.context.vae
      delete normalizedInputs.workerJob.vae
      if (!retryCase)
        currentVaeReference = await setExternalVae(project, qualification.currentVaeKey)
      assert.equal((await tab(project)).generationDraft.vaePrecision, 'FP32')
    } else if (precisionQualification) {
      delete normalizedInputs.context.vaePrecision
      delete normalizedInputs.workerJob.vaePrecision
      if (!retryCase) await setVaePrecision(project, currentVaePrecision)
    } else {
      delete normalizedInputs.context.sampling.cfgRescale
      delete normalizedInputs.workerJob.sampling.cfgRescale
      await setCfgRescale(project, 0.2)
    }
    const editedRow = (await queueRows(project)).find(({ id }) => id === admitted.id)
    assert.equal(editedRow.frozen_payload_json, admitted.frozen_payload_json)
  }
  const failureBaseline = precisionQualification ? await tab(project) : null
  let terminalFailure = null
  await expect
    .poll(
      async () => {
        const rows = await queueRows(project)
        const current = rows.find(({ id }) => id === admitted.id)
        if (precisionQualification && current?.status === 'failed') {
          assert.equal(capturedVaePrecision, 'FP16', 'Auto and FP32 must actually complete.')
          terminalFailure = current
          return 1
        }
        assert.ok(
          rows.every((row) => row.status !== 'failed'),
          JSON.stringify(rows.map((row) => ({ status: row.status, error: row.error_message }))),
        )
        return (await api('listGenerationResults', project.id)).candidates.length
      },
      { timeout: 600_000, intervals: [1000, 2000, 5000] },
    )
    .toBe(1)
  if (terminalFailure) {
    return await qualifyVaeNonFiniteRefusal({
      project,
      family,
      mode,
      qualification,
      admitted,
      terminalFailure,
      frozen,
      normalizedInputs,
      target,
      targetPath,
      targetBytes,
      beforePackagePath,
      beforePackageSha256,
      existingLayers,
      previousAcceptedLayers,
      previousSeedCursor,
      previousLastActualSeed,
      failureBaseline,
      started,
    })
  }
  const results = await api('listGenerationResults', project.id)
  const candidate = results.candidates[0]
  assert.equal(candidate.queueItemId, admitted.id)
  assert.equal(candidate.actualSeed, 0)
  assert.equal(results.lastActualSeed, 0)
  const completedTab = await tab(project)
  assert.deepEqual(
    await layerSnapshot(completedTab.layers),
    existingLayers,
    'completion must preserve all layer properties and exact image bytes/pixels',
  )
  assert.deepEqual(completedTab.primaryBbox, before.primaryBbox)
  assert.equal(completedTab.generationDraft.positivePrompt.text, changedPrompt)
  if (cfgQualification) assert.equal(completedTab.generationDraft.cfgRescale, 0.2)
  if (precisionQualification)
    assert.equal(completedTab.generationDraft.vaePrecision, currentVaePrecision)
  if (externalQualification) {
    assert.equal(completedTab.generationDraft.vaePrecision, 'FP32')
    assert.deepEqual(completedTab.generationDraft.vae, currentVaeReference)
  }
  if (embeddingQualification) {
    assert.equal(completedTab.generationDraft.vaePrecision, 'FP32')
    assert.equal(completedTab.generationDraft.vae, null)
    assert.deepEqual(completedTab.generationDraft.positivePrompt, {
      text: changedPrompt,
      embeddingRefs: [],
    })
    assert.deepEqual(completedTab.generationDraft.negativePrompt, {
      text: changedNegativePrompt,
      embeddingRefs: [],
    })
  }
  const receipt = await database.db
    .selectFrom('generation_candidate_receipt')
    .selectAll()
    .where('candidate_id', '=', candidate.candidateId)
    .executeTakeFirstOrThrow()
  assert.equal(receipt.status, 'completed')
  assert.equal(receipt.queue_item_id, admitted.id)
  assert.equal(receipt.actual_seed, 0)
  assert.equal(receipt.frozen_payload_sha256, sha256(Buffer.from(admitted.frozen_payload_json)))
  const row = await database.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('id', '=', candidate.queueItemId)
    .executeTakeFirstOrThrow()
  assert.equal(row.status, 'completed')
  assert.equal(row.frozen_payload_json, admitted.frozen_payload_json)
  if (
    precisionQualification ||
    externalQualification ||
    embeddingQualification ||
    predictionQualification
  ) {
    assert.ok(
      (await readFile(targetPath)).equals(targetBytes),
      'Completion must retain the exact captured source.',
    )
    if (retry) assert.ok((await readFile(retry.copiedTargetPath)).equals(targetBytes))
  }
  const progress = await window.evaluate(
    (jobId) =>
      window.__installedQualificationProgress.filter(({ current }) => current.jobId === jobId),
    admitted.id,
  )
  if (externalQualification && mode === 'img2img') {
    assert.deepEqual(
      progress,
      [],
      'Strength zero must use the VAE roundtrip without denoising progress.',
    )
  } else
    assert.ok(progress.length > 0, 'the genuine preload must deliver actual denoising progress')
  for (let index = 0; index < progress.length; index += 1) {
    const { current, revision } = progress[index]
    assert.equal(current.documentId, before.documentId)
    assert.equal(current.projectKey, project.id)
    assert.equal(current.statusSequence, receipt.expected_status_sequence)
    assert.equal(current.statusSequence + 1, row.status_sequence)
    if (nativePlan) assert.equal(current.totalSteps, nativePlan.totalSteps)
    else assert.ok(current.totalSteps >= 1 && current.totalSteps <= 2 * execution.steps)
    if (index > 0) {
      assert.ok(revision > progress[index - 1].revision)
      assert.ok(current.step > progress[index - 1].current.step)
      assert.equal(current.totalSteps, progress[index - 1].current.totalSteps)
    }
  }
  if (progress.length > 0)
    assert.equal(progress.at(-1).current.step, progress.at(-1).current.totalSteps)
  if (noiseQualification && mode === 'txt2img') assertNoiseTxt2ImgProgress(progress, execution)
  if ((embeddingQualification || predictionQualification) && mode === 'img2img')
    assert.ok(
      progress.at(-1).current.totalSteps > 0,
      'The actual installed img2img pipeline must evaluate nonzero denoising steps.',
    )
  assert.equal(
    await hashFile(beforePackagePath),
    beforePackageSha256,
    'durable trained completion must not save or modify the .igs before explicit Add/Save',
  )
  const pixels = await decodedImage(candidate.imageUrl)
  assert.equal(pixels.status, 200)
  assert.equal(pixels.bytes, receipt.image_byte_size)
  assert.equal(pixels.sha256, receipt.image_sha256)
  assert.equal(pixels.width, execution.width)
  assert.equal(pixels.height, execution.height)
  if (
    precisionQualification ||
    externalQualification ||
    embeddingQualification ||
    (predictionQualification && mode !== 'outpaint')
  )
    assert.equal(pixels.opaquePixels, execution.width * execution.height)
  let contributionAlpha8 = null
  if (mode === 'outpaint') {
    const outputBytes = Buffer.from(
      await application.evaluate(async ({ net }, url) => {
        const response = await net.fetch(url)
        if (response.status !== 200) throw new Error('The actual contribution is unavailable.')
        return Array.from(new Uint8Array(await response.arrayBuffer()))
      }, candidate.imageUrl),
    )
    assert.equal(sha256(outputBytes), receipt.image_sha256)
    contributionAlpha8 = await assertOutpaintContribution(
      frozen.context.conditioning,
      targetBytes,
      outputBytes,
    )
  }
  assert.ok(candidate.thumbnailUrl, 'actual worker thumbnail must be published')
  const thumbnail = await decodedImage(candidate.thumbnailUrl)
  assert.equal(thumbnail.status, 200)
  assert.equal(thumbnail.mime, 'image/webp')
  assert.equal(thumbnail.sha256, new URL(candidate.thumbnailUrl).pathname.split('/').at(-2))
  assert.ok(thumbnail.bytes > 0 && thumbnail.width > 0 && thumbnail.height > 0)
  if (predictionQualification) {
    await expect.poll(async () => (await api('getGenerationState', project.id)).phase).toBe('idle')
    await expect.poll(liveInstalledInferenceChildren).toEqual([])
    if (noiseQualification) {
      currentNoiseProfile = {
        ...execution.noiseProfile,
        rescaleBetasZeroSnr: !execution.noiseProfile.rescaleBetasZeroSnr,
      }
      currentPredictionChange = await setNoiseThroughUi(
        project,
        'rescaleBetasZeroSnr',
        currentNoiseProfile.rescaleBetasZeroSnr,
        modelKey,
      )
    } else currentPredictionChange = await setPredictionThroughUi(project, currentPredictionType)
    assert.equal(
      (await queueRows(project)).find(({ id }) => id === row.id).frozen_payload_json,
      row.frozen_payload_json,
    )
    assert.equal(await hashFile(beforePackagePath), beforePackageSha256)
  }
  await window.getByRole('button', { name: 'Add 1 as Layer', exact: true }).click()
  await expect.poll(async () => (await tab(project)).layers.length).toBe(before.layers.length + 1)
  const accepted = await tab(project)
  const layer = accepted.layers[0]
  const acceptedData = await api(
    'getRasterGenerationData',
    project.id,
    accepted.documentId,
    layer.id,
  )
  assert.equal(acceptedData.generationConfiguration.sampling.actualSeed, 0)
  assert.equal(
    acceptedData.generationConfiguration.sampling.requestedSeedPolicy,
    requestedSeedPolicy,
  )
  assert.equal(acceptedData.generationConfiguration.model.baseModelFamily, family)
  if (predictionQualification) {
    assert.equal(acceptedData.generationConfiguration.model.predictionType, capturedPredictionType)
    assert.equal(acceptedData.generationConfiguration.vaePrecision, 'FP32')
    assert.equal(acceptedData.generationConfiguration.vae, null)
    for (const value of [checkpoint, fixture.illustriousLora]) {
      assert.equal(JSON.stringify(acceptedData.generationConfiguration).includes(value.path), false)
      assert.equal(
        JSON.stringify(acceptedData.generationConfiguration).includes(value.installed.managedPath),
        false,
      )
    }
  }
  if (noiseQualification) {
    assert.deepEqual(
      acceptedData.generationConfiguration.sampling.noiseProfile,
      execution.noiseProfile,
    )
    assert.equal(acceptedData.generationConfiguration.sampling.steps, execution.steps)
    assert.equal(acceptedData.generationConfiguration.sampling.cfgScale, execution.cfgScale)
    assert.equal(
      acceptedData.generationConfiguration.sampling.sampler,
      execution.sampler === 'euler' ? 'Euler' : 'Euler a',
    )
  }
  if (cfgQualification) {
    assert.equal(acceptedData.generationConfiguration.cfgRescale, capturedCfgRescale)
    assert.equal(accepted.generationDraft.cfgRescale, 0.2)
  }
  if (precisionQualification) {
    assert.equal(acceptedData.generationConfiguration.vaePrecision, capturedVaePrecision)
    assert.equal(accepted.generationDraft.vaePrecision, currentVaePrecision)
  }
  if (externalQualification) {
    assert.deepEqual(acceptedData.generationConfiguration.vae, capturedVaeReference)
    assert.equal(acceptedData.generationConfiguration.vaePrecision, 'FP32')
    assert.deepEqual(accepted.generationDraft.vae, currentVaeReference)
    assert.equal(accepted.generationDraft.vaePrecision, 'FP32')
    for (const key of externalVaeKeys) {
      assert.equal(JSON.stringify(acceptedData).includes(fixture[key].installed.managedPath), false)
      assert.equal(JSON.stringify(acceptedData).includes(fixture[key].path), false)
    }
  }
  if (embeddingQualification) {
    assertPortableEmbeddingConfiguration(
      acceptedData.generationConfiguration,
      capturedEmbeddingPrompts,
    )
    assert.deepEqual(accepted.generationDraft.positivePrompt, {
      text: changedPrompt,
      embeddingRefs: [],
    })
    assert.deepEqual(accepted.generationDraft.negativePrompt, {
      text: changedNegativePrompt,
      embeddingRefs: [],
    })
  }
  assert.equal(
    acceptedData.generationConfiguration.positivePrompt.text,
    before.generationDraft.positivePrompt.text,
  )
  assert.equal(acceptedData.generationConfiguration.loras[0].weight, -0.5)
  assert.equal(acceptedData.generationConfiguration.loras[0].resource.fileSha256, lora.sha256)
  assert.equal(
    acceptedData.generationConfiguration.negativePrompt.text,
    frozen.context.prompts.negative,
  )
  assert.equal(accepted.generationDraft.positivePrompt.text, changedPrompt)
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await tab(project)).dirty).toBe(false)
  const directory = path.join(fixture.appData, 'workspaces/Uncategorized')
  let saved
  let packagePath
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.igs')) continue
    const currentPath = path.join(directory, name)
    const current = await readIgsPackage(currentPath)
    if (current.project.documentId === accepted.documentId) {
      saved = current
      packagePath = currentPath
      break
    }
  }
  assert.ok(saved)
  const provenance = saved.project.layers[0].generationProvenance
  assert.equal(provenance.kind, `${family}-${mode}`)
  assert.deepEqual(provenance.generationConfiguration, acceptedData.generationConfiguration)
  assert.equal(provenance.executionResultContext.output.sha256, receipt.image_sha256)
  assert.equal(provenance.executionResultContext.output.byteSize, receipt.image_byte_size)
  assert.equal(provenance.executionResultContext.queueItemId, admitted.id)
  assert.equal(provenance.executionResultContext.candidateId, candidate.candidateId)
  assert.equal(provenance.layerSourceContext.sourceDocumentId, before.documentId)
  assert.equal(provenance.layerSourceContext.sourceDocumentRevision, admitted.document_revision)
  assert.equal(provenance.layerSourceContext.sourceTargetSha256, targetSha256)
  assert.deepEqual(provenance.layerSourceContext.bbox, before.primaryBbox)
  assertAcceptedCheckpointIdentity(
    provenance.generationConfiguration,
    noiseQualification ? checkpoint : fixture[family],
  )
  if (family === 'anima') {
    const config = provenance.generationConfiguration
    assert.equal(config.sampling.animaMethod, 'euler')
    assert.equal(config.model.predictionType, null)
    assert.equal(config.anima.architecture, 'anima-base-1.0')
    assert.equal(config.anima.checkpointByteSize, fixture.anima.byteSize)
    for (const [key, item] of [
      ['qwen3Encoder', fixture.encoder],
      ['vae', fixture.vae],
    ]) {
      assert.deepEqual(config.anima[key], {
        byteSize: item.byteSize,
        localModelId: item.installed.resourceId,
        localVersionId: item.installed.versionId,
        sha256: item.sha256,
      })
    }
  }
  if (mode !== 'txt2img')
    assert.equal(provenance.generationConfiguration.sampling.denoisingStrength, capturedStrength)
  if (mode === 'outpaint') {
    assert.equal(provenance.generationConfiguration.mode, 'outpaint')
    assert.deepEqual(
      provenance.executionResultContext.output.contributionAlpha8,
      contributionAlpha8,
    )
    assert.equal(provenance.executionResultContext.output.outputMode, 'contribution')
    for (const field of ['infillResource', 'keepMask', 'policy', 'sourceTarget']) {
      assert.deepEqual(
        provenance.layerSourceContext.outpaint[field],
        frozen.context.conditioning[field],
      )
    }
  }
  if (
    mode === 'outpaint' ||
    precisionQualification ||
    externalQualification ||
    embeddingQualification ||
    predictionQualification
  ) {
    assert.deepEqual(await layerSnapshot(accepted.layers.slice(1)), existingLayers)
    assert.deepEqual(saved.project.layers.slice(1), previousAcceptedLayers)
  }
  const savedLayer = saved.project.layers.find(({ id }) => id === layer.id)
  assert.ok(savedLayer)
  assert.equal(sha256(await saved.readMember(savedLayer.asset.path)), receipt.image_sha256)
  assert.equal(savedLayer.asset.bytes, receipt.image_byte_size)
  assert.equal(savedLayer.asset.sha256, receipt.image_sha256)
  assert.equal(saved.manifest.preview.status, 'rendered')
  const previewRect =
    mode === 'outpaint'
      ? { height: execution.height, width: execution.width + before.primaryBbox.x, x: 0, y: 0 }
      : before.primaryBbox
  assert.deepEqual(saved.manifest.preview.rect, previewRect)
  const mergedPreviewBytes = await saved.readMember('preview/merged.png')
  const mergedPreview = await decodedImage(
    `data:image/png;base64,${mergedPreviewBytes.toString('base64')}`,
  )
  if (mode === 'outpaint') {
    // A contribution overlays the protected source. Its transparent pixels must remain in the
    // accepted asset while the real installed CPU compositor renders the complete opaque canvas.
    assert.ok(pixels.transparentPixels > 0)
    assert.equal(mergedPreview.width, previewRect.width)
    assert.equal(mergedPreview.height, previewRect.height)
    assert.equal(mergedPreview.opaquePixels, previewRect.width * previewRect.height)
    assert.notEqual(mergedPreview.pixelSha256, pixels.pixelSha256)
  } else assert.equal(mergedPreview.pixelSha256, pixels.pixelSha256)
  const previewThumbnailBytes = await saved.readMember('preview/thumbnail.webp')
  const previewThumbnail = await decodedImage(
    `data:image/webp;base64,${previewThumbnailBytes.toString('base64')}`,
  )
  assert.ok(previewThumbnail.bytes > 0 && previewThumbnail.width > 0 && previewThumbnail.height > 0)
  assert.equal(saved.project.lastActualSeedSnapshot, 0)
  assert.equal(saved.project.generationDraft.positivePrompt.text, changedPrompt)
  if (predictionQualification) {
    assert.equal(provenance.generationConfiguration.model.predictionType, capturedPredictionType)
    assert.equal(provenance.generationConfiguration.vaePrecision, 'FP32')
    assert.equal(provenance.generationConfiguration.vae, null)
  }
  if (noiseQualification)
    assert.deepEqual(
      provenance.generationConfiguration.sampling.noiseProfile,
      execution.noiseProfile,
    )
  if (cfgQualification) {
    assert.equal(provenance.generationConfiguration.cfgRescale, capturedCfgRescale)
    assert.equal(saved.project.generationDraft.cfgRescale, 0.2)
  }
  if (precisionQualification) {
    assert.equal(provenance.generationConfiguration.vaePrecision, capturedVaePrecision)
    assert.equal(saved.project.generationDraft.vaePrecision, currentVaePrecision)
  }
  if (externalQualification) {
    assert.deepEqual(provenance.generationConfiguration.vae, capturedVaeReference)
    assert.equal(provenance.generationConfiguration.vaePrecision, 'FP32')
    assert.deepEqual(saved.project.generationDraft.vae, currentVaeReference)
    assert.equal(saved.project.generationDraft.vaePrecision, 'FP32')
    for (const key of externalVaeKeys) {
      assert.equal(JSON.stringify(provenance).includes(fixture[key].installed.managedPath), false)
      assert.equal(JSON.stringify(provenance).includes(fixture[key].path), false)
    }
  }
  if (embeddingQualification) {
    assertPortableEmbeddingConfiguration(
      provenance.generationConfiguration,
      capturedEmbeddingPrompts,
    )
    assert.deepEqual(saved.project.generationDraft.positivePrompt, {
      text: changedPrompt,
      embeddingRefs: [],
    })
    assert.deepEqual(saved.project.generationDraft.negativePrompt, {
      text: changedNegativePrompt,
      embeddingRefs: [],
    })
    assert.equal(saved.project.generationDraft.vaePrecision, 'FP32')
    assert.equal(saved.project.generationDraft.vae, null)
  }
  await window.getByRole('button', { name: `Close ${project.title}`, exact: true }).click()
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
  await window.getByRole('tab', { name: project.title, exact: true }).waitFor()
  const reopened = await tab(project)
  assert.equal(reopened.generationDraft.positivePrompt.text, changedPrompt)
  if (cfgQualification) assert.equal(reopened.generationDraft.cfgRescale, 0.2)
  if (precisionQualification)
    assert.equal(reopened.generationDraft.vaePrecision, currentVaePrecision)
  if (externalQualification) {
    assert.deepEqual(reopened.generationDraft.vae, currentVaeReference)
    assert.equal(reopened.generationDraft.vaePrecision, 'FP32')
  }
  if (embeddingQualification) {
    assert.deepEqual(reopened.generationDraft.positivePrompt, {
      text: changedPrompt,
      embeddingRefs: [],
    })
    assert.deepEqual(reopened.generationDraft.negativePrompt, {
      text: changedNegativePrompt,
      embeddingRefs: [],
    })
    assert.equal(reopened.generationDraft.vaePrecision, 'FP32')
    assert.equal(reopened.generationDraft.vae, null)
  }
  assert.deepEqual(
    (await api('getRasterGenerationData', project.id, reopened.documentId, layer.id))
      .generationConfiguration,
    provenance.generationConfiguration,
  )
  const reopenedPackage = await readIgsPackage(packagePath)
  assert.deepEqual(
    reopenedPackage.project.layers.find(({ id }) => id === layer.id).generationProvenance,
    provenance,
  )
  assert.equal(
    sha256(await reopenedPackage.readMember(savedLayer.asset.path)),
    receipt.image_sha256,
  )
  if (cfgQualification) {
    const input = window.locator('input[aria-label="CFG Rescale"]')
    if (!(await input.isVisible())) {
      await window.getByText('Advanced Options', { exact: true }).click()
    }
    await expect(input).toHaveValue('0.2')
  }
  if (precisionQualification) {
    const input = window.locator('input[aria-label="VAE precision"]')
    if (!(await input.isVisible()))
      await window.getByText('Advanced Options', { exact: true }).click()
    await expect(
      input.locator(
        'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " n-base-selection ")]',
      ),
    ).toContainText(currentVaePrecision)
  }
  const caseName = qualification?.caseName ?? `${family}-${mode}${retryCase ? '-retry' : ''}`
  const screenshot = path.join(fixture.artifacts, `${caseName}.png`)
  await captureScreenshot(screenshot)
  report.screenshots.push(screenshot)
  const comparison = noiseQualification
    ? await compareNoiseProfile(
        project,
        reopened.layers.find(({ id }) => id === layer.id),
        execution.noiseProfile,
        currentNoiseProfile,
        qualification.caseName,
        packagePath,
      )
    : predictionQualification
      ? await comparePrediction(
          project,
          reopened.layers.find(({ id }) => id === layer.id),
          capturedPredictionType,
          currentPredictionType,
          caseName,
          packagePath,
        )
      : embeddingQualification
        ? await compareEmbeddings(
            project,
            reopened.layers.find(({ id }) => id === layer.id),
            capturedEmbeddingPrompts,
            caseName,
            packagePath,
          )
        : externalQualification
          ? await compareExternalVae(
              project,
              reopened.layers.find(({ id }) => id === layer.id),
              capturedVaeReference,
              currentVaeReference,
              caseName,
              packagePath,
            )
          : precisionQualification
            ? await compareVaePrecision(
                project,
                reopened.layers.find(({ id }) => id === layer.id),
                capturedVaePrecision,
                currentVaePrecision,
                caseName,
              )
            : cfgQualification
              ? await compareCfgRescale(
                  project,
                  reopened.layers.find(({ id }) => id === layer.id),
                  capturedCfgRescale,
                  caseName,
                )
              : mode === 'outpaint'
                ? await compareOutpaint(
                    project,
                    reopened.layers.find(({ id }) => id === layer.id),
                    retryCase,
                    caseName,
                  )
                : null
  const generation = {
    family,
    mode,
    projectKey: project.id,
    queueItemId: row.id,
    candidateId: candidate.candidateId,
    elapsedMs: Date.now() - started,
    outputSha256: receipt.image_sha256,
    outputBytes: receipt.image_byte_size,
    dimensions: pixels,
    existingLayers,
    thumbnail,
    target: { ...target, path: targetPath },
    nativePlan,
    progress,
    retry,
    contributionAlpha8,
    comparison,
    requestedSeedPolicy,
    mergedPreview,
    previewThumbnail,
    provenance,
    packagePath,
    previewState: saved.manifest.preview,
    qualification: predictionQualification
      ? {
          kind: 'v-prediction',
          caseName,
          outcome: 'completed-finite',
          capturedPredictionType,
          currentPredictionType,
          currentPredictionChange,
          trainedObjective: checkpoint.trainedObjective,
          checkpointOrigin: checkpoint.origin,
          precision: 'FP32',
          vae: 'Embedded',
          frozenPayloadSha256: sha256(Buffer.from(row.frozen_payload_json)),
          retainedTargetUnchanged: true,
          normalizedInputs,
          comparison,
          predictionRetryRefusal,
          ...(mode === 'img2img'
            ? {
                commonSource: qualification.commonSource,
                denoisingStrength: 0.5,
                effectiveDenoisingEvaluations: progress.at(-1).current.totalSteps,
              }
            : {}),
        }
      : embeddingQualification
        ? {
            kind: 'embeddings',
            caseName,
            outcome: 'completed-finite',
            embeddingSelection: qualification.embeddingSelection,
            repeated: qualification.repeated,
            capturedEmbeddingPrompts,
            frozenEmbeddingRefs: frozen.context.embeddingRefs,
            effectiveEmbeddings: frozen.context.embeddings,
            workerEmbeddings: frozen.workerJob.embeddings ?? null,
            currentEmbeddingRefs: { positive: [], negative: [] },
            precision: 'FP32',
            vae: 'Embedded',
            origins: Object.fromEntries(embeddingKeys.map((key) => [key, fixture[key].origin])),
            frozenPayloadSha256: sha256(Buffer.from(row.frozen_payload_json)),
            retainedTargetUnchanged: true,
            normalizedInputs,
            comparison,
            libraryDefaultChange,
            ...(mode === 'img2img'
              ? {
                  commonSource: qualification.commonSource,
                  denoisingStrength: 0.5,
                  effectiveDenoisingEvaluations: progress.at(-1).current.totalSteps,
                  progressScope:
                    'Actual nonzero installed img2img denoising progress; count observed from native progress, not inferred from requested steps times strength.',
                }
              : {}),
          }
        : externalQualification
          ? {
              kind: 'external-vae',
              caseName,
              outcome: 'completed-finite',
              capturedVaeKey,
              capturedVae: capturedVaeReference,
              workerVae: frozen.workerJob.vae,
              currentVae: reopened.generationDraft.vae,
              precision: 'FP32',
              origin:
                capturedVaeKey === null
                  ? 'trained-checkpoint-embedded'
                  : fixture[capturedVaeKey].origin,
              frozenPayloadSha256: sha256(Buffer.from(row.frozen_payload_json)),
              retainedTargetUnchanged: true,
              normalizedInputs,
              comparison,
              libraryDefaultChange,
              ...(mode === 'img2img'
                ? {
                    commonSource: qualification.commonSource,
                    denoisingStrength: 0,
                    progressScope: 'Actual native VAE roundtrip; zero denoising evaluations.',
                  }
                : {}),
            }
          : precisionQualification
            ? {
                kind: 'vae-precision',
                caseName,
                outcome: 'completed-finite',
                authoredVaePrecision: capturedVaePrecision,
                capturedVaePrecision,
                workerVaePrecision: frozen.workerJob.vaePrecision,
                currentVaePrecision: reopened.generationDraft.vaePrecision,
                frozenPayloadSha256: sha256(Buffer.from(row.frozen_payload_json)),
                retainedTargetUnchanged: true,
                normalizedInputs,
                comparison,
              }
            : cfgQualification
              ? {
                  caseName,
                  authoredCfgRescale: qualification.cfgRescale,
                  capturedCfgRescale,
                  currentCfgRescale: reopened.generationDraft.cfgRescale,
                  normalizedInputs,
                  comparison,
                }
              : null,
  }
  if (noiseQualification)
    generation.qualification = {
      ...generation.qualification,
      kind: 'noise-profile',
      execution: structuredClone(execution),
      modelKey,
      authored: qualification.authored,
      axis: qualification.axis ?? null,
      frozen: structuredClone(frozen),
      normalizedInputs,
      capturedNoiseProfile: execution.noiseProfile,
      currentNoiseProfile,
      currentPredictionType: capturedPredictionType,
      currentPredictionChange: null,
      currentNoiseChange: currentPredictionChange,
      predictionRetryRefusal,
    }
  report.generations.push(generation)
  await check(
    `${qualification?.caseName ?? `${family} ${mode}`}: UI Generate -> trained installed worker -> staging -> explicit Add -> Save/reopen${qualification ? '/comparison' : ''}`,
    { queueItemId: row.id },
  )
  return generation
}
async function qualifyVaeNonFiniteRefusal(input) {
  const {
    project,
    family,
    mode,
    qualification,
    admitted,
    terminalFailure,
    frozen,
    normalizedInputs,
    target,
    targetPath,
    targetBytes,
    beforePackagePath,
    beforePackageSha256,
    existingLayers,
    previousAcceptedLayers,
    previousSeedCursor,
    previousLastActualSeed,
    failureBaseline,
    started,
  } = input
  assert.equal(qualification.kind, 'vae-precision')
  assert.equal(qualification.vaePrecision, 'FP16')
  assert.equal(terminalFailure.error_code, 'GENERATION_VAE_NON_FINITE')
  const message =
    'The VAE produced non-finite values. Choose FP32 for a new generation; Retry uses the original precision.'
  assert.equal(terminalFailure.error_message, message)
  assert.equal(terminalFailure.frozen_payload_json, admitted.frozen_payload_json)
  await expect.poll(async () => (await api('getGenerationState', project.id)).phase).toBe('idle')
  await expect.poll(liveInstalledInferenceChildren).toEqual([])
  const results = await api('listGenerationResults', project.id)
  assert.deepEqual(results.candidates, [])
  assert.equal(results.lastActualSeed, previousLastActualSeed)
  assert.equal(await window.getByRole('button', { name: 'Add 1 as Layer', exact: true }).count(), 0)
  const receipt = await database.db
    .selectFrom('generation_candidate_receipt')
    .selectAll()
    .where('queue_item_id', '=', admitted.id)
    .execute()
  assert.deepEqual(receipt, [])
  assert.deepEqual(
    await database.db
      .selectFrom('generation_seed_cursor')
      .selectAll()
      .where('local_project_key', '=', project.id)
      .executeTakeFirst(),
    previousSeedCursor,
  )
  const after = await tab(project)
  for (const key of [
    'documentId',
    'generationDraft',
    'primaryBbox',
    'layers',
    'lastActualSeedSnapshot',
    'dirty',
    'canUndo',
    'canRedo',
  ]) {
    assert.deepEqual(after[key], failureBaseline[key], `A refused worker must preserve ${key}.`)
  }
  assert.deepEqual(await layerSnapshot(after.layers), existingLayers)
  assert.equal(await hashFile(beforePackagePath), beforePackageSha256)
  assert.deepEqual((await readIgsPackage(beforePackagePath)).project.layers, previousAcceptedLayers)
  assert.ok(
    (await readFile(targetPath)).equals(targetBytes),
    'Refusal must retain the exact Retry source.',
  )
  const stagingPngs = await pngFiles(
    path.join(
      fixture.appData,
      'recovery/generation-staging',
      project.id,
      admitted.staging_session_id,
    ),
  )
  assert.deepEqual(stagingPngs, [])
  const scratchPngs = []
  for (const name of await readdir(path.join(fixture.appData, 'scratch'))) {
    if (name.startsWith('illustrious-request-')) {
      scratchPngs.push(...(await pngFiles(path.join(fixture.appData, 'scratch', name))))
    }
  }
  assert.deepEqual(scratchPngs, [])
  await window.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
  const manager = window.getByRole('dialog', { name: 'Queue Manager', exact: true })
  const managerRow = manager.locator(`[data-testid="queue-job-row"][data-job-id="${admitted.id}"]`)
  await expect(managerRow).toHaveAttribute('data-status', 'failed')
  await managerRow.getByRole('button', { name: 'Show job details', exact: true }).click()
  await expect(manager).toContainText('GENERATION_VAE_NON_FINITE')
  await expect(manager.locator('.error-message')).toHaveText(message)
  const screenshot = path.join(
    fixture.artifacts,
    `${qualification.caseName}-non-finite-refused.png`,
  )
  await captureScreenshot(screenshot, manager)
  report.screenshots.push(screenshot)
  await manager.getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
  const failure = {
    family,
    mode,
    projectKey: project.id,
    queueItemId: admitted.id,
    outcome: 'qualified-non-finite-refused',
    errorCode: terminalFailure.error_code,
    errorMessage: terminalFailure.error_message,
    elapsedMs: Date.now() - started,
    target: { ...target, path: targetPath },
    frozenPayloadSha256: sha256(Buffer.from(admitted.frozen_payload_json)),
    frozenPayload: frozen,
    qualification: {
      kind: 'vae-precision',
      caseName: qualification.caseName,
      authoredVaePrecision: qualification.vaePrecision,
      capturedVaePrecision: frozen.context.vaePrecision,
      workerVaePrecision: frozen.workerJob.vaePrecision,
      currentVaePrecision: after.generationDraft.vaePrecision,
      normalizedInputs,
    },
    refusalEvidence: {
      inferenceChildExited: true,
      liveInferenceChildren: [],
      candidateCount: 0,
      receiptCount: 0,
      stagingPngs,
      scratchPngs,
      explicitAddCount: 0,
      seedCursorUnchanged: true,
      lastActualSeedUnchanged: true,
      documentUnchangedAfterAuthoring: true,
      savedPackageUnchanged: true,
      retainedTargetUnchanged: true,
      screenshot,
    },
  }
  report.failures.push(failure)
  await check(
    `${qualification.caseName}: actual native VAE non-finite refusal preserves Project, pixels, receipt and accepted seed`,
    failure.refusalEvidence,
  )
  // Only now save the deliberately edited authoring draft; this is not worker publication or Add.
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await tab(project)).dirty).toBe(false)
  const saved = await readIgsPackage(beforePackagePath)
  assert.deepEqual(saved.project.layers, previousAcceptedLayers)
  assert.equal(saved.project.generationDraft.vaePrecision, qualification.currentVaePrecision)
  assert.equal(saved.project.lastActualSeedSnapshot, previousLastActualSeed ?? null)
  failure.authoredDraftSavedAfterRefusal = true
  await checkpointEvidence()
  return failure
}
async function prepareImg2Img(project) {
  await stage('Prepare image-based input: manual seed', { projectKey: project.id })
  // Make the previous manual value observably different from the actual completed seed.
  await setInput('Generation seed', 123)
  await expect.poll(async () => (await tab(project)).generationDraft.seed.value).toBe(123)
  await stage('Prepare image-based input: Reuse completed seed', { projectKey: project.id })
  await window.getByRole('button', { name: 'Reuse last seed', exact: true }).click()
  await expect.poll(async () => (await tab(project)).generationDraft.seed.policy).toBe('reuse')
  await expect(window.locator('input[aria-label="Generation seed"]')).toHaveValue('0')
  await stage('Prepare image-based input: Denoising Strength', { projectKey: project.id })
  await expect(window.locator('input[aria-label="Denoising Strength"]')).toBeVisible({
    timeout: 90_000,
  })
  await setInput('Denoising Strength', 0.5)
  await expect
    .poll(async () => (await tab(project)).generationDraft.sampling.denoisingStrength)
    .toBe(0.5)
  await stage('Image-based input prepared', { projectKey: project.id })
}
async function prepareOutpaint(project) {
  await stage('Prepare outpaint: capture original bbox', { projectKey: project.id })
  const before = await tab(project)
  const beforeLayers = await layerSnapshot(before.layers)
  await stage('Prepare outpaint: Bounding Box tool and focus', {
    projectKey: project.id,
    bbox: before.primaryBbox,
  })
  await window.getByRole('button', { name: 'Bounding Box tool', exact: true }).click()
  await window.locator('.canvas-area').focus()
  await stage('Prepare outpaint: keyboard move by 64 pixels', { projectKey: project.id })
  // One held-key edit commits exactly once through the ordinary canvas keyboard handler.
  for (let index = 0; index < 64; index += 1) await window.keyboard.down('ArrowRight')
  await window.keyboard.up('ArrowRight')
  await expect.poll(async () => (await tab(project)).primaryBbox.x).toBe(before.primaryBbox.x + 64)
  const moved = await tab(project)
  await stage('Prepare outpaint: bbox committed', {
    projectKey: project.id,
    bbox: moved.primaryBbox,
  })
  assert.deepEqual(moved.primaryBbox, { ...before.primaryBbox, x: before.primaryBbox.x + 64 })
  assert.deepEqual(await layerSnapshot(moved.layers), beforeLayers)
  await prepareImg2Img(project)
  const state = await api('getGenerationState', project.id)
  assert.equal(
    state[
      before.generationDraft.model.baseModelFamily === 'anima'
        ? 'animaOutpaintSupported'
        : 'outpaintSupported'
    ],
    true,
  )
  const screenshot = path.join(
    fixture.artifacts,
    `${before.generationDraft.model.baseModelFamily}-mixed-target-${moved.primaryBbox.x}.png`,
  )
  await captureScreenshot(screenshot)
  report.screenshots.push(screenshot)
  await stage('Mixed-alpha outpaint input prepared', { projectKey: project.id, screenshot })
}
async function qualifyOutpaint() {
  for (const [family, loraKey] of [
    ['illustrious', 'illustriousLora'],
    ['anima', 'animaLora'],
  ]) {
    const project = await createProject(fixture[family], fixture[loraKey])
    await generateAndAccept(project, family, 'txt2img')
    await prepareOutpaint(project)
    await generateAndAccept(project, family, 'outpaint')
    await prepareOutpaint(project)
    await generateAndAccept(project, family, 'outpaint', null, true)
  }
  assert.equal(report.generations.length, 6)
  assert.equal(report.generations.filter(({ retry }) => retry !== null).length, 2)
}
async function qualifyCfgRescale() {
  let nonneutralProject
  for (const [caseName, cfgRescale] of [
    ['illustrious-txt2img-cfg-unset', null],
    ['illustrious-txt2img-cfg-zero', 0],
    ['illustrious-txt2img-cfg-nonneutral', 0.7],
  ]) {
    const project = await createProject(fixture.illustrious, fixture.illustriousLora, caseName)
    await setCfgRescale(project, cfgRescale)
    const screenshot = path.join(fixture.artifacts, `${caseName}-authored.png`)
    await captureScreenshot(screenshot)
    report.screenshots.push(screenshot)
    await generateAndAccept(project, 'illustrious', 'txt2img', {
      kind: 'cfg-rescale',
      caseName,
      cfgRescale,
    })
    if (cfgRescale === 0.7) nonneutralProject = project
  }
  const [unset, zero, nonneutral] = report.generations
  for (const generation of [zero, nonneutral]) {
    assert.deepEqual(
      generation.qualification.normalizedInputs,
      unset.qualification.normalizedInputs,
    )
    assert.equal(generation.target.pixelSha256, unset.target.pixelSha256)
  }
  assert.equal(
    zero.dimensions.pixelSha256,
    unset.dimensions.pixelSha256,
    'Unset and explicit zero must produce identical decoded RGBA for the same frozen inputs.',
  )
  assert.notEqual(
    nonneutral.dimensions.pixelSha256,
    zero.dimensions.pixelSha256,
    'CFG Rescale 0.7 must change decoded RGBA relative to zero for the same frozen inputs.',
  )
  await check(
    'Same-input trained txt2img decoded RGBA: unset equals zero; CFG Rescale 0.7 changes pixels',
    {
      inputs: unset.qualification.normalizedInputs,
      targetPixelSha256: unset.target.pixelSha256,
      unsetPixelSha256: unset.dimensions.pixelSha256,
      zeroPixelSha256: zero.dimensions.pixelSha256,
      nonneutralPixelSha256: nonneutral.dimensions.pixelSha256,
    },
  )
  assert.ok(nonneutralProject)
  await setCfgRescale(nonneutralProject, 0.7)
  await prepareImg2Img(nonneutralProject)
  await generateAndAccept(nonneutralProject, 'illustrious', 'img2img', {
    kind: 'cfg-rescale',
    caseName: 'illustrious-img2img-cfg-nonneutral',
    cfgRescale: 0.7,
  })
  assert.equal(report.generations.length, 4)
  report.cfgRescaleBoundary =
    'Trained installed same-input txt2img CFG ablation plus opaque img2img nonzero frozen input, Add, Save/reopen and comparison. The img2img case establishes wiring/provenance, not an independent numerical ablation or release-runtime readiness.'
}
async function qualifyVaePrecision() {
  const projects = new Map()
  const txtCases = []
  for (const vaePrecision of ['Auto', 'FP32', 'FP16']) {
    const caseName = `illustrious-txt2img-vae-${vaePrecision.toLowerCase()}`
    await stage('Installed VAE Precision txt2img case', { caseName, vaePrecision })
    const project = await createProject(fixture.illustrious, fixture.illustriousLora, caseName)
    projects.set(vaePrecision, project)
    await expect
      .poll(async () => (await api('getGenerationState', project.id)).vaePrecisionSupported)
      .toBe(true)
    await setVaePrecision(project, vaePrecision)
    const screenshot = path.join(fixture.artifacts, `${caseName}-authored.png`)
    await captureScreenshot(screenshot)
    report.screenshots.push(screenshot)
    txtCases.push(
      await generateAndAccept(project, 'illustrious', 'txt2img', {
        kind: 'vae-precision',
        caseName,
        vaePrecision,
        currentVaePrecision: vaePrecision === 'FP32' ? 'FP16' : 'FP32',
      }),
    )
  }
  const [auto, fp32, fp16] = txtCases
  for (const generation of [fp32, fp16]) {
    assert.deepEqual(generation.qualification.normalizedInputs, auto.qualification.normalizedInputs)
    assert.equal(generation.target.pixelSha256, auto.target.pixelSha256)
  }
  assert.equal(auto.qualification.outcome, 'completed-finite')
  assert.equal(fp32.qualification.outcome, 'completed-finite')
  assert.equal(
    auto.dimensions.pixelSha256,
    fp32.dimensions.pixelSha256,
    'Pinned native Auto and explicit FP32 must produce equal decoded RGBA for matched frozen inputs.',
  )
  const fp16Refused = fp16.outcome === 'qualified-non-finite-refused'
  if (!fp16Refused) {
    assert.equal(fp16.qualification.outcome, 'completed-finite')
    assert.notEqual(
      fp16.dimensions.pixelSha256,
      fp32.dimensions.pixelSha256,
      'Actual FP16 must change decoded RGBA or refuse exact native VAE non-finite output.',
    )
  }
  report.vaePrecisionNumerics = {
    scope: 'Matched trained txt2img inputs except authored/frozen VAE precision policy.',
    normalizedInputs: auto.qualification.normalizedInputs,
    targetPixelSha256: auto.target.pixelSha256,
    autoPixelSha256: auto.dimensions.pixelSha256,
    fp32PixelSha256: fp32.dimensions.pixelSha256,
    fp16PixelSha256: fp16Refused ? null : fp16.dimensions.pixelSha256,
    autoEqualsFp32: true,
    fp16ChangesPixelsOrRefusesNonFinite: fp16Refused
      ? 'refused-native-vae-non-finite'
      : 'changed-finite-pixels',
  }
  await check(
    'Matched installed txt2img Auto equals FP32; actual FP16 changes pixels or refuses native VAE non-finite output',
    report.vaePrecisionNumerics,
  )
  const imgCases = []
  for (const vaePrecision of ['Auto', 'FP32', 'FP16']) {
    const project = projects.get(vaePrecision === 'FP16' && fp16Refused ? 'Auto' : vaePrecision)
    await window.getByRole('tab', { name: project.title, exact: true }).click()
    await prepareImg2Img(project)
    await setVaePrecision(project, vaePrecision)
    const caseName = `illustrious-img2img-vae-${vaePrecision.toLowerCase()}${vaePrecision === 'FP32' ? '-retry' : ''}`
    await stage('Installed VAE Precision opaque img2img case', {
      caseName,
      vaePrecision,
      projectKey: project.id,
    })
    const screenshot = path.join(fixture.artifacts, `${caseName}-authored.png`)
    await captureScreenshot(screenshot)
    report.screenshots.push(screenshot)
    imgCases.push(
      await generateAndAccept(
        project,
        'illustrious',
        'img2img',
        {
          kind: 'vae-precision',
          caseName,
          vaePrecision,
          currentVaePrecision: vaePrecision === 'FP32' ? 'FP16' : 'FP32',
        },
        vaePrecision === 'FP32',
      ),
    )
  }
  const cases = [...txtCases, ...imgCases]
  assert.equal(cases.length, 6)
  assert.equal(report.generations.length + report.failures.length, 6)
  assert.equal(report.generations.filter(({ retry }) => retry !== null).length, 1)
  assert.equal(report.generations.find(({ retry }) => retry !== null).mode, 'img2img')
  let actualAdmissions = 0
  for (const project of projects.values()) actualAdmissions += (await queueRows(project)).length
  assert.equal(
    actualAdmissions,
    7,
    'Six base cases plus one genuine canceled FP32 source admission.',
  )
  report.vaePrecisionCases = cases.map((result) => ({
    caseName: result.qualification.caseName,
    mode: result.mode,
    outcome: result.outcome ?? result.qualification.outcome,
    queueItemId: result.queueItemId,
    projectKey: result.projectKey,
    targetPixelSha256: result.target.pixelSha256,
    authoredVaePrecision: result.qualification.authoredVaePrecision,
    capturedVaePrecision: result.qualification.capturedVaePrecision,
    workerVaePrecision: result.qualification.workerVaePrecision,
    currentVaePrecision: result.qualification.currentVaePrecision,
    normalizedInputs: result.qualification.normalizedInputs,
  }))
  report.vaePrecisionSummary = {
    baseCases: 6,
    actualAdmissions,
    canceledOriginals: 1,
    completedFinite: report.generations.length,
    qualifiedNonFiniteRefusals: report.failures.length,
    img2imgScope:
      'Opaque encode/decode policy wiring and frozen Retry/provenance; source targets differ and are not matched numerical ablations.',
    img2imgTargets: imgCases.map(({ qualification, target }) => ({
      caseName: qualification.caseName,
      pixelSha256: target.pixelSha256,
    })),
    fp16ImgSource: fp16Refused
      ? 'Latest accepted Auto project layer after txt2img FP16 refusal'
      : 'Accepted FP16 txt2img layer',
  }
  await check(
    'Six genuine installed VAE policy cases and actual Cancel/frozen FP32 Retry have distinct terminal evidence',
    report.vaePrecisionSummary,
  )
}
async function importRasterThroughUi(project, importPath) {
  const before = await tab(project)
  const existingLayers = await layerSnapshot(before.layers)
  // The OS chooser is the only controlled boundary; actual UI, Main and installed normalization run.
  await application.evaluate(({ dialog }, selectedPath) => {
    globalThis.__qualificationOpenDialog = dialog.showOpenDialog
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] })
  }, importPath)
  try {
    await window.getByRole('button', { name: 'Import image as Raster Layer', exact: true }).click()
    await expect.poll(async () => (await tab(project)).layers.length).toBe(before.layers.length + 1)
  } finally {
    await application.evaluate(({ dialog }) => {
      dialog.showOpenDialog = globalThis.__qualificationOpenDialog
      delete globalThis.__qualificationOpenDialog
    })
  }
  const imported = await tab(project)
  assert.deepEqual(imported.primaryBbox, before.primaryBbox)
  assert.equal(imported.layers[0].transform.x, before.primaryBbox.x)
  assert.equal(imported.layers[0].transform.y, before.primaryBbox.y)
  assert.deepEqual(
    await layerSnapshot(imported.layers.slice(1)),
    existingLayers,
    'import must preserve previous layer properties and exact image bytes/pixels',
  )
  return { before, existingLayers, imported }
}
async function importMatchedExternalVaeSource(project, commonSource, profile = 'external-vae') {
  const sourceHashBefore = await hashFile(commonSource.path)
  assert.equal(sourceHashBefore, commonSource.sha256)
  const { imported } = await importRasterThroughUi(project, commonSource.path)
  assert.equal(imported.layers.length, 1)
  assert.equal(imported.layers[0].width, fixture.side)
  assert.equal(imported.layers[0].height, fixture.side)
  const normalized = (await layerSnapshot(imported.layers))[0].image
  assert.equal(normalized.pixelSha256, commonSource.pixelSha256)
  assert.equal(normalized.opaquePixels, fixture.side * fixture.side)
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await tab(project)).dirty).toBe(false)
  let saved
  let packagePath
  const directory = path.join(fixture.appData, 'workspaces/Uncategorized')
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.igs')) continue
    const file = path.join(directory, name)
    const current = await readIgsPackage(file)
    if (current.project.documentId === imported.documentId) {
      saved = current
      packagePath = file
      break
    }
  }
  assert.ok(saved)
  assert.equal(saved.project.layers[0].generationProvenance, undefined)
  assert.equal(saved.project.lastActualSeedSnapshot, null)
  assert.equal(saved.manifest.preview.status, 'rendered')
  assert.equal(
    sha256(await saved.readMember(saved.project.layers[0].asset.path)),
    saved.project.layers[0].asset.sha256,
  )
  assert.equal(await hashFile(commonSource.path), sourceHashBefore)
  const evidence = {
    projectKey: project.id,
    packagePath,
    importedLayerId: imported.layers[0].id,
    normalized,
    source: commonSource,
    controlled: 'OS chooser selects the single recorded real PNG only',
  }
  const imports =
    profile === 'embeddings'
      ? report.embeddingImports
      : profile === 'v-prediction'
        ? report.predictionImports
        : profile === 'noise-profile'
          ? report.noiseImports
          : report.externalVaeImports
  imports.push(evidence)
  await check(
    `${profile === 'embeddings' ? 'Embedding' : profile === 'v-prediction' ? 'Prediction' : 'External VAE'} matched img2img source: genuine UI import/installed normalization/Save preserves exact pixels`,
    evidence,
  )
}
async function assertMatchedExternalVaePixels(generations, mode) {
  const [embedded, ldm, native, control] = generations
  for (const result of [ldm, native, control]) {
    assert.deepEqual(
      result.qualification.normalizedInputs,
      embedded.qualification.normalizedInputs,
      'Only the selected VAE may differ in matched inference inputs.',
    )
    assert.equal(result.target.sha256, embedded.target.sha256)
    assert.equal(result.target.pixelSha256, embedded.target.pixelSha256)
  }
  const evidence = {
    mode,
    normalizedInputs: embedded.qualification.normalizedInputs,
    targetSha256: embedded.target.sha256,
    targetPixelSha256: embedded.target.pixelSha256,
    embeddedPixelSha256: embedded.dimensions.pixelSha256,
    ldmPixelSha256: ldm.dimensions.pixelSha256,
    nativePixelSha256: native.dimensions.pixelSha256,
    causalControlPixelSha256: control.dimensions.pixelSha256,
    exactLdmEqualsEmbedded: ldm.dimensions.pixelSha256 === embedded.dimensions.pixelSha256,
    exactNativeEqualsEmbedded: native.dimensions.pixelSha256 === embedded.dimensions.pixelSha256,
    finiteCausalControlChangesPixels:
      control.dimensions.pixelSha256 !== embedded.dimensions.pixelSha256,
    causalControlScope:
      'Artificial F16-rounded encoder/decoder bias additions; no independent training or image-quality claim.',
  }
  report.externalVaeNumerics[mode] = evidence
  // Retain observed numerical evidence even when a production mutation makes this assertion red.
  await checkpointEvidence()
  assert.equal(
    ldm.dimensions.pixelSha256,
    embedded.dimensions.pixelSha256,
    `Exact standalone LDM VAE must reproduce Embedded ${mode} pixels for matched inputs.`,
  )
  assert.equal(
    native.dimensions.pixelSha256,
    embedded.dimensions.pixelSha256,
    `Exact standalone native VAE must reproduce Embedded ${mode} pixels for matched inputs.`,
  )
  assert.notEqual(
    control.dimensions.pixelSha256,
    embedded.dimensions.pixelSha256,
    `The finite artificial VAE causal control must change ${mode} pixels for matched inputs.`,
  )
  await check(
    `Matched installed ${mode}: exact LDM/native VAE equals Embedded; finite causal VAE changes pixels`,
    evidence,
  )
}
async function qualifyExternalVae() {
  report.externalVaeImports = []
  report.externalVaeNumerics = {}
  const choices = [
    ['embedded', null],
    ['ldm-exact', 'externalVaeLdm'],
    ['native-exact', 'externalVaeNative'],
    ['native-causal-control', 'externalVaeControl'],
  ]
  const projects = []
  const txtCases = []
  for (const [label, vaeKey] of choices) {
    const caseName = `illustrious-txt2img-external-vae-${label}`
    await stage('Installed external VAE matched txt2img case', { caseName, vaeKey })
    const project = await createProject(fixture.illustrious, fixture.illustriousLora, caseName)
    projects.push(project)
    await expect
      .poll(async () => (await api('getGenerationState', project.id)).externalVaeSupported)
      .toBe(true)
    await setVaePrecision(project, 'FP32')
    await setExternalVae(project, vaeKey)
    if (vaeKey === 'externalVaeLdm') {
      report.externalVaeInitialDefault = await setExternalVaeDefaultThroughUi(
        project,
        'externalVaeNative',
      )
    }
    txtCases.push(
      await generateAndAccept(project, 'illustrious', 'txt2img', {
        kind: 'external-vae',
        caseName,
        vaeKey,
        currentVaeKey: vaeKey === null ? 'externalVaeNative' : null,
      }),
    )
  }
  // Fail the actual selected-module causal mutation before starting four additional GPU cases.
  await assertMatchedExternalVaePixels(txtCases, 'txt2img')
  const embedded = txtCases[0]
  const embeddedPackage = await readIgsPackage(embedded.packagePath)
  const sourceLayer = embeddedPackage.project.layers[0]
  const sourceBytes = await embeddedPackage.readMember(sourceLayer.asset.path)
  assert.equal(sha256(sourceBytes), embedded.outputSha256)
  const sourcePath = path.join(fixture.artifacts, 'external-vae-common-img2img-source.png')
  await writeFile(sourcePath, sourceBytes, { flag: 'wx' })
  const commonSource = {
    path: sourcePath,
    sha256: sha256(sourceBytes),
    byteSize: sourceBytes.length,
    pixelSha256: embedded.dimensions.pixelSha256,
    width: fixture.side,
    height: fixture.side,
    sourceQueueItemId: embedded.queueItemId,
    sourcePackagePath: embedded.packagePath,
  }
  report.externalVaeCommonSource = commonSource
  const imgCases = []
  for (const [label, vaeKey] of choices) {
    const retryCase = vaeKey === 'externalVaeNative'
    const caseName = `illustrious-img2img-external-vae-${label}${retryCase ? '-retry' : ''}`
    await stage('Installed external VAE matched opaque img2img roundtrip case', {
      caseName,
      vaeKey,
      strength: 0,
    })
    const project = await createProject(fixture.illustrious, fixture.illustriousLora, caseName)
    projects.push(project)
    await importMatchedExternalVaeSource(project, commonSource)
    await setVaePrecision(project, 'FP32')
    await setExternalVae(project, vaeKey)
    await expect(window.locator('input[aria-label="Denoising Strength"]')).toBeVisible()
    await setInput('Denoising Strength', 0)
    await expect
      .poll(async () => (await tab(project)).generationDraft.sampling.denoisingStrength)
      .toBe(0)
    assert.equal((await tab(project)).generationDraft.seed.policy, 'fixed')
    imgCases.push(
      await generateAndAccept(
        project,
        'illustrious',
        'img2img',
        {
          kind: 'external-vae',
          caseName,
          vaeKey,
          commonSource,
          currentVaeKey: vaeKey === null ? 'externalVaeNative' : null,
        },
        retryCase,
      ),
    )
  }
  await assertMatchedExternalVaePixels(imgCases, 'img2img')
  assert.equal(report.generations.length, 8)
  assert.deepEqual(report.failures, [])
  assert.equal(report.generations.filter(({ retry }) => retry !== null).length, 1)
  let actualAdmissions = 0
  for (const project of projects) {
    const rows = await queueRows(project)
    actualAdmissions += rows.length
    assert.equal(rows.filter(({ status }) => status === 'completed').length, 1)
  }
  assert.equal(actualAdmissions, 9)
  assert.equal(await hashFile(sourcePath), commonSource.sha256)
  report.externalVaeSummary = {
    finiteCompletions: 8,
    actualAdmissions,
    canceledOriginals: 1,
    modes: ['matched txt2img decode', 'same-source opaque strength-zero img2img encode/decode'],
    choices: choices.map(([label, key]) => ({
      label,
      descriptor: key === null ? null : fixture[key],
    })),
    installedFormats: ['original-ldm', 'diffusers-native'],
    precision: 'FP32',
    commonSource,
    genuineUiDefaultAndResetBeforeFrozenRetry: true,
    causalControl:
      'Locally altered finite trained tensors, not an independently trained or published VAE.',
  }
  await check(
    'Eight finite installed VAE completions and genuine external Cancel/frozen Retry preserve recorded resources and portable pixels',
    report.externalVaeSummary,
  )
}
async function assertMatchedEmbeddingPixels(trained, control, label) {
  const evidence = {
    scope:
      'Identical literal prompts and complete numeric input except the exact trained/zero embedding version.',
    trainedQueueItemId: trained.queueItemId,
    controlQueueItemId: control.queueItemId,
    trainedNormalizedInputs: trained.qualification.normalizedInputs,
    controlNormalizedInputs: control.qualification.normalizedInputs,
    trainedInputSha256: sha256(Buffer.from(JSON.stringify(trained.qualification.normalizedInputs))),
    controlInputSha256: sha256(Buffer.from(JSON.stringify(control.qualification.normalizedInputs))),
    trainedTargetSha256: trained.target.sha256,
    controlTargetSha256: control.target.sha256,
    trainedTargetPixelSha256: trained.target.pixelSha256,
    controlTargetPixelSha256: control.target.pixelSha256,
    trainedPixelSha256: trained.dimensions.pixelSha256,
    controlPixelSha256: control.dimensions.pixelSha256,
    pixelsDiffer: trained.dimensions.pixelSha256 !== control.dimensions.pixelSha256,
    trainedOrigin: fixture.embeddingTrained.origin,
    causalControlOrigin: fixture.embeddingControl.origin,
  }
  report.embeddingNumerics[label] = evidence
  // Checkpoint the real observed values before a semantic mutation can fail the assertions.
  await checkpointEvidence()
  assert.deepEqual(
    control.qualification.normalizedInputs,
    trained.qualification.normalizedInputs,
    'Only the exact embedding weight identity may differ in the causal pair.',
  )
  assert.equal(control.target.sha256, trained.target.sha256)
  assert.equal(control.target.pixelSha256, trained.target.pixelSha256)
  assert.notEqual(
    control.dimensions.pixelSha256,
    trained.dimensions.pixelSha256,
    `The declared trained embedding must change ${label} pixels relative to its finite zero-tensor control.`,
  )
  await check(
    `Matched installed embedding ${label}: trained and finite zero-tensor control produce different pixels`,
    evidence,
  )
}
async function assertPlainEmbeddingPixels(plain, trained, label) {
  const normalizeNonEmbeddingInputs = (generation) => {
    const normalized = structuredClone(generation.qualification.normalizedInputs)
    delete normalized.context.embeddingRefs
    delete normalized.context.embeddings
    delete normalized.workerJob.embeddings
    // Exact authored strings and placements were checked at UI admission. This neighbor removes
    // precisely that declared prompt/embedding axis, rather than claiming weight-only causality.
    normalized.context.prompts = { ...embeddingBasePrompts }
    normalized.workerJob.prompts = { ...embeddingBasePrompts }
    return normalized
  }
  const evidence = {
    scope:
      'Same checkpoint/sampling/LoRA/Embedded FP32/target; declared literal insertion and its trained binding change together.',
    plainQueueItemId: plain.queueItemId,
    trainedQueueItemId: trained.queueItemId,
    plainPrompts: plain.qualification.capturedEmbeddingPrompts,
    trainedPrompts: trained.qualification.capturedEmbeddingPrompts,
    plainPixelSha256: plain.dimensions.pixelSha256,
    trainedPixelSha256: trained.dimensions.pixelSha256,
    pixelsDiffer: plain.dimensions.pixelSha256 !== trained.dimensions.pixelSha256,
    targetSha256: plain.target.sha256,
  }
  report.embeddingNumerics[`plain-versus-${label}`] = evidence
  await checkpointEvidence()
  assert.deepEqual(normalizeNonEmbeddingInputs(trained), normalizeNonEmbeddingInputs(plain))
  assert.equal(trained.target.sha256, plain.target.sha256)
  assert.equal(trained.target.pixelSha256, plain.target.pixelSha256)
  assert.notEqual(trained.dimensions.pixelSha256, plain.dimensions.pixelSha256)
  await check(
    `Installed plain versus ${label} trained literal/binding produces different pixels`,
    evidence,
  )
}
async function qualifyEmbeddings() {
  report.embeddingImports = []
  report.embeddingNumerics = {}
  const txtChoices = [
    { label: 'plain', positive: null, negative: null, repeated: false },
    { label: 'positive-trained', positive: 'embeddingTrained', negative: null, repeated: false },
    { label: 'positive-control', positive: 'embeddingControl', negative: null, repeated: false },
    { label: 'negative-trained', positive: null, negative: 'embeddingTrained', repeated: false },
    { label: 'negative-control', positive: null, negative: 'embeddingControl', repeated: false },
    {
      label: 'both-weighted-repeated-trained',
      positive: 'embeddingTrained',
      negative: 'embeddingTrained',
      repeated: true,
    },
  ]
  const projects = []
  const txtCases = []
  for (const choice of txtChoices) {
    const caseName = `illustrious-txt2img-embeddings-${choice.label}`
    await stage('Installed embedding exact UI txt2img case', { caseName, choice })
    const project = await createProject(fixture.illustrious, fixture.illustriousLora, caseName)
    projects.push(project)
    await expect
      .poll(async () => (await api('getGenerationState', project.id)).embeddingsSupported)
      .toBe(true)
    await setVaePrecision(project, 'FP32')
    assert.equal((await tab(project)).generationDraft.vae, null)
    // Resuming after a previous run may leave the new resource on the control Default. This
    // genuine UI action establishes a later distinct Default transition before the Retry case.
    if (choice.label === 'plain')
      report.embeddingInitialDefault = await setEmbeddingDefaultThroughUi(
        project,
        'embeddingTrained',
      )
    for (const polarity of ['positive', 'negative'])
      await authorEmbeddingThroughUi(project, polarity, choice[polarity], choice.repeated)
    const screenshot = path.join(fixture.artifacts, `${caseName}-authored.png`)
    await captureScreenshot(screenshot)
    report.screenshots.push(screenshot)
    txtCases.push(
      await generateAndAccept(project, 'illustrious', 'txt2img', {
        kind: 'embeddings',
        caseName,
        repeated: choice.repeated,
        embeddingSelection: { positive: choice.positive, negative: choice.negative },
      }),
    )
    if (choice.label === 'positive-control') {
      await assertMatchedEmbeddingPixels(txtCases[1], txtCases[2], 'positive-txt2img')
      await assertPlainEmbeddingPixels(txtCases[0], txtCases[1], 'positive-txt2img')
    }
    if (choice.label === 'negative-control') {
      await assertMatchedEmbeddingPixels(txtCases[3], txtCases[4], 'negative-txt2img')
      await assertPlainEmbeddingPixels(txtCases[0], txtCases[3], 'negative-txt2img')
    }
  }
  await assertPlainEmbeddingPixels(
    txtCases[0],
    txtCases[5],
    'weighted-repeated-dual-polarity-txt2img',
  )
  const plain = txtCases[0]
  const plainPackage = await readIgsPackage(plain.packagePath)
  const sourceLayer = plainPackage.project.layers[0]
  const sourceBytes = await plainPackage.readMember(sourceLayer.asset.path)
  assert.equal(sha256(sourceBytes), plain.outputSha256)
  const sourcePath = path.join(fixture.artifacts, 'embeddings-common-img2img-source.png')
  await writeFile(sourcePath, sourceBytes, { flag: 'wx' })
  const commonSource = {
    path: sourcePath,
    sha256: sha256(sourceBytes),
    byteSize: sourceBytes.length,
    pixelSha256: plain.dimensions.pixelSha256,
    width: fixture.side,
    height: fixture.side,
    sourceQueueItemId: plain.queueItemId,
    sourcePackagePath: plain.packagePath,
  }
  report.embeddingCommonSource = commonSource
  const imgCases = []
  for (const key of embeddingKeys) {
    const retryCase = key === 'embeddingTrained'
    const caseName = `illustrious-img2img-embeddings-both-weighted-repeated-${retryCase ? 'trained-retry' : 'control'}`
    await stage('Installed embedding matched opaque img2img case', { caseName, key, strength: 0.5 })
    const project = await createProject(fixture.illustrious, fixture.illustriousLora, caseName)
    projects.push(project)
    await expect
      .poll(async () => (await api('getGenerationState', project.id)).embeddingsSupported)
      .toBe(true)
    await importMatchedExternalVaeSource(project, commonSource, 'embeddings')
    await setVaePrecision(project, 'FP32')
    assert.equal((await tab(project)).generationDraft.vae, null)
    await setInput('Denoising Strength', 0.5)
    await expect
      .poll(async () => (await tab(project)).generationDraft.sampling.denoisingStrength)
      .toBe(0.5)
    for (const polarity of ['positive', 'negative'])
      await authorEmbeddingThroughUi(project, polarity, key, true)
    assert.equal((await tab(project)).generationDraft.seed.policy, 'fixed')
    const screenshot = path.join(fixture.artifacts, `${caseName}-authored.png`)
    await captureScreenshot(screenshot)
    report.screenshots.push(screenshot)
    imgCases.push(
      await generateAndAccept(
        project,
        'illustrious',
        'img2img',
        {
          kind: 'embeddings',
          caseName,
          repeated: true,
          commonSource,
          embeddingSelection: { positive: key, negative: key },
        },
        retryCase,
      ),
    )
  }
  await assertMatchedEmbeddingPixels(
    imgCases[0],
    imgCases[1],
    'weighted-repeated-dual-polarity-img2img',
  )
  assert.equal(report.generations.length, 8)
  assert.deepEqual(report.failures, [])
  assert.equal(report.generations.filter(({ retry }) => retry !== null).length, 1)
  let actualAdmissions = 0
  for (const project of projects) {
    const rows = await queueRows(project)
    actualAdmissions += rows.length
    assert.equal(rows.filter(({ status }) => status === 'completed').length, 1)
    assert.equal(
      rows.filter(({ status }) => status === 'canceled').length,
      project.id === imgCases[0].projectKey ? 1 : 0,
    )
  }
  assert.equal(actualAdmissions, 9)
  assert.equal(await hashFile(sourcePath), commonSource.sha256)
  report.embeddingSummary = {
    finiteCompletions: 8,
    actualAdmissions,
    canceledOriginals: 1,
    txtCases: txtChoices,
    imgCases: ['both-weighted-repeated-trained-retry', 'both-weighted-repeated-control'],
    precision: 'FP32',
    vae: 'Embedded',
    side: fixture.side,
    steps: fixture.steps,
    seed: 0,
    loraWeight: -0.5,
    img2imgStrength: 0.5,
    commonSource,
    effectiveImg2imgDenoisingEvaluations: imgCases.map(({ queueItemId, qualification }) => ({
      queueItemId,
      observedCount: qualification.effectiveDenoisingEvaluations,
    })),
    literal: embeddingActivationToken(path.basename(fixture.embeddingTrained.path)),
    positiveOccurrences: 3,
    positiveFirstWeight: 1.3,
    negativeOccurrences: 2,
    negativeFirstWeight: 0.7,
    trainedSource: fixture.embeddingTrained.origin,
    creatorCredit: `${fixture.embeddingTrained.origin.creator} — ${fixture.embeddingTrained.name}`,
    causalControl: fixture.embeddingControl.origin,
    genuineUiAuthoringBothPolarities: true,
    genuineUiDefaultAndLiteralRemovalBeforeFrozenRetry: true,
  }
  await check(
    'Eight finite installed embedding cases and one genuine Cancel/frozen trained Retry retain exact per-polarity provenance',
    report.embeddingSummary,
  )
}
async function assertMatchedPredictionPixels(cases, mode) {
  const [v, epsilon] = cases
  const evidence = {
    scope:
      'Same exact v-trained checkpoint, literal prompts, LoRA, VAE precision, seed, mode and target; only frozen prediction interpretation differs.',
    vQueueItemId: v.queueItemId,
    epsilonQueueItemId: epsilon.queueItemId,
    vNormalizedInputs: v.qualification.normalizedInputs,
    epsilonNormalizedInputs: epsilon.qualification.normalizedInputs,
    vInputSha256: sha256(Buffer.from(JSON.stringify(v.qualification.normalizedInputs))),
    epsilonInputSha256: sha256(Buffer.from(JSON.stringify(epsilon.qualification.normalizedInputs))),
    vTargetSha256: v.target.sha256,
    epsilonTargetSha256: epsilon.target.sha256,
    vTargetPixelSha256: v.target.pixelSha256,
    epsilonTargetPixelSha256: epsilon.target.pixelSha256,
    vPixelSha256: v.dimensions.pixelSha256,
    epsilonPixelSha256: epsilon.dimensions.pixelSha256,
    pixelsDiffer: v.dimensions.pixelSha256 !== epsilon.dimensions.pixelSha256,
    trainedObjective: fixture.illustrious.trainedObjective,
    source: fixture.illustrious.origin,
  }
  report.predictionNumerics ??= {}
  report.predictionNumerics[mode] = evidence
  await checkpointEvidence()
  assert.equal(v.qualification.capturedPredictionType, 'v_prediction')
  assert.equal(epsilon.qualification.capturedPredictionType, 'epsilon')
  assert.deepEqual(epsilon.qualification.normalizedInputs, v.qualification.normalizedInputs)
  assert.equal(epsilon.target.sha256, v.target.sha256)
  assert.equal(epsilon.target.pixelSha256, v.target.pixelSha256)
  assert.ok(
    (await readFile(v.target.path)).equals(await readFile(epsilon.target.path)),
    'Matched prediction targets must retain identical actual bytes.',
  )
  assert.notEqual(
    epsilon.dimensions.pixelSha256,
    v.dimensions.pixelSha256,
    'Frozen v_prediction and epsilon interpretation must change decoded pixels for this matched v-trained fixture.',
  )
  await check(
    `Matched installed ${mode} prediction: frozen v_prediction and epsilon control change decoded pixels`,
    evidence,
  )
}
async function independentNoiseScheduleOracle(executions) {
  await expect.poll(liveInstalledInferenceChildren).toEqual([])
  await ensureQualificationResourceLimits('before independent installed native schedule oracle')
  // Run from the bounded launcher. Electron's Playwright evaluation VM intentionally has no
  // dynamic Node import callback; this CPU-only child inherits the launcher's finite cgroup.
  await assertUpgradeBounds()
  const output = execFileSync(
    pointer.pythonExecutable,
    ['-I', '-c', noiseScheduleOracleProgram, JSON.stringify(executions)],
    {
      cwd: path.join(fixture.appData, 'runtime'),
      env: {
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
        CUDA_VISIBLE_DEVICES: '',
        HF_HUB_OFFLINE: '1',
        TRANSFORMERS_OFFLINE: '1',
      },
      encoding: 'utf8',
      timeout: 60_000,
      killSignal: 'SIGKILL',
      maxBuffer: 256 * 1024,
    },
  )
  const result = JSON.parse(output)
  assert.equal(result.diffusersVersion, '0.40.0')
  assert.equal(result.results.length, executions.length)
  assert.ok(
    result.results.every(
      ({ productionEqualsIndependentNative }) => productionEqualsIndependentNative,
    ),
  )
  report.noiseScheduleOracle = result
  await check(
    'Installed production schedule adapter equals independently constructed pinned native beta/alpha/timestep/sigma tensors',
    result,
  )
  return result
}
async function assertMatchedNoiseControls(cases) {
  const baseline = cases[0]
  report.noiseNumerics = []
  for (const control of cases.slice(1)) {
    const axis = control.qualification.axis
    const left = normalizeNoiseInputs(baseline.qualification.frozen, axis)
    const right = normalizeNoiseInputs(control.qualification.frozen, axis)
    const evidence = {
      axis,
      baselineQueueItemId: baseline.queueItemId,
      controlQueueItemId: control.queueItemId,
      baselineNormalizedInputs: left,
      controlNormalizedInputs: right,
      baselineTargetSha256: baseline.target.sha256,
      controlTargetSha256: control.target.sha256,
      baselinePixelSha256: baseline.dimensions.pixelSha256,
      controlPixelSha256: control.dimensions.pixelSha256,
      pixelsDiffer: baseline.dimensions.pixelSha256 !== control.dimensions.pixelSha256,
    }
    report.noiseNumerics.push(evidence)
    await checkpointEvidence()
    assert.deepEqual(
      right,
      left,
      `Matched ${axis} control must differ in only its declared semantic axis.`,
    )
    assert.equal(control.target.sha256, baseline.target.sha256)
    assert.ok(
      (await readFile(control.target.path)).equals(await readFile(baseline.target.path)),
      'Matched controls require byte-identical captured targets.',
    )
    assert.notEqual(
      control.dimensions.pixelSha256,
      baseline.dimensions.pixelSha256,
      `Installed ${axis} causal control must change actual decoded pixels.`,
    )
    await check(
      `Matched installed ${axis} control changes decoded pixels with every neighboring input preserved`,
      evidence,
    )
  }
}
async function qualifyNoiseProfile() {
  assertNoiseReady(report.installedReady)
  report.noiseImports = []
  const projects = []
  const run = async (
    modelKey,
    execution,
    caseName,
    mode = 'txt2img',
    commonSource = null,
    retry = false,
    axis = null,
  ) => {
    await stage('Installed explicit noise-profile case', {
      modelKey,
      caseName,
      mode,
      execution,
      retry,
    })
    const project = await createProject(
      fixture[modelKey],
      fixture.illustriousLora,
      caseName,
      execution,
    )
    projects.push(project)
    if (mode === 'img2img') {
      await importMatchedExternalVaeSource(project, commonSource, 'noise-profile')
      await setInput('Denoising Strength', 0.5)
    }
    const authored = await authorNoiseExecution(project, modelKey, execution)
    return generateAndAccept(
      project,
      'illustrious',
      mode,
      { kind: 'noise-profile', modelKey, caseName, execution, authored, commonSource, axis },
      retry,
    )
  }
  if (fixture.stage === 'bounded' || fixture.stage === 'bounded-lifecycle') {
    let baseline
    if (fixture.stage === 'bounded') {
      const controls = []
      for (const spec of boundedNoiseCases())
        controls.push(
          await run(
            'illustrious',
            spec.execution,
            `noise-txt2img-${spec.name}`,
            'txt2img',
            null,
            false,
            spec.axis,
          ),
        )
      await assertMatchedNoiseControls(controls)
      await independentNoiseScheduleOracle(boundedNoiseCases().map(({ execution }) => execution))
      baseline = controls[0]
    } else {
      // A separate partial run reuses evidence from previous controls only in the external
      // review. This report must qualify its own CPU oracle before any lifecycle ML case.
      await independentNoiseScheduleOracle(boundedNoiseCases().map(({ execution }) => execution))
      baseline = await run(
        'illustrious',
        executionFor('illustrious'),
        'noise-lifecycle-v-txt2img-source-precondition',
      )
      report.noiseLifecycleSourcePreconditionCompletions = 1
    }
    await run(
      'illustriousEpsilon',
      executionFor('illustriousEpsilon'),
      'noise-epsilon-trained-txt2img',
    )
    const sourcePackage = await readIgsPackage(baseline.packagePath)
    const sourceLayer =
      sourcePackage.project.layers.find(
        ({ generationProvenance }) => generationProvenance?.queueItemId === baseline.queueItemId,
      ) ?? sourcePackage.project.layers[0]
    const sourceBytes = await sourcePackage.readMember(sourceLayer.asset.path)
    const sourcePath = path.join(fixture.artifacts, 'noise-common-nonzero-img2img-source.png')
    await writeFile(sourcePath, sourceBytes, { flag: 'wx' })
    const commonSource = {
      path: sourcePath,
      sha256: sha256(sourceBytes),
      pixelSha256: baseline.dimensions.pixelSha256,
      width: 256,
      height: 256,
      originQueueItemId: baseline.queueItemId,
      byteSize: sourceBytes.length,
    }
    report.noiseCommonSource = commonSource
    await run(
      'illustrious',
      executionFor('illustrious'),
      'noise-v-img2img-cancel-three-refusals-restored-retry',
      'img2img',
      commonSource,
      true,
    )
    await run(
      'illustriousEpsilon',
      executionFor('illustriousEpsilon'),
      'noise-epsilon-trained-img2img',
      'img2img',
      commonSource,
    )
    assert.equal(report.generations.length, fixture.stage === 'bounded' ? 8 : 4)
    assert.equal(report.predictionRetryRefusals.length, 3)
    assert.equal(report.generations.filter(({ retry }) => retry !== null).length, 1)
    const refusalAxes = report.generations
      .find(({ retry }) => retry !== null)
      .qualification.predictionRetryRefusal.map(({ axis }) => axis)
    assert.deepEqual(refusalAxes, ['zero-snr', 'spacing', 'prediction'])
    assert.equal(await hashFile(sourcePath), commonSource.sha256)
  } else if (fixture.stage === 'author') {
    for (const modelKey of ['illustrious', 'illustriousEpsilon'])
      await run(
        modelKey,
        fixture.authorRecipes[modelKey].execution,
        `noise-author-${modelKey}-832x1216-28steps`,
      )
    await independentNoiseScheduleOracle(
      ['illustrious', 'illustriousEpsilon'].map((key) => fixture.authorRecipes[key].execution),
    )
    assert.equal(report.generations.length, 2)
  } else {
    assert.equal(fixture.stage, 'outpaint')
    for (const modelKey of ['illustrious', 'illustriousEpsilon']) {
      const execution = executionFor(modelKey, 'outpaint')
      const caseName = `noise-outpaint-${modelKey}`
      const project = await createProject(
        fixture[modelKey],
        fixture.illustriousLora,
        caseName,
        execution,
      )
      projects.push(project)
      let authored = await authorNoiseExecution(project, modelKey, execution)
      await generateAndAccept(project, 'illustrious', 'txt2img', {
        kind: 'noise-profile',
        modelKey,
        execution,
        authored,
        caseName: `${caseName}-source-precondition`,
      })
      authored = await authorNoiseExecution(project, modelKey, execution)
      await prepareOutpaint(project)
      await generateAndAccept(project, 'illustrious', 'outpaint', {
        kind: 'noise-profile',
        modelKey,
        execution,
        authored,
        caseName,
      })
    }
    assert.equal(report.generations.filter(({ mode }) => mode === 'outpaint').length, 2)
    report.outpaintSourcePreconditionCompletions = 2
    await independentNoiseScheduleOracle(
      ['illustrious', 'illustriousEpsilon'].map((key) => executionFor(key)),
    )
  }
  assert.deepEqual(report.failures, [])
  let actualAdmissions = 0
  let canceledOriginals = 0
  for (const project of projects) {
    const rows = await queueRows(project)
    actualAdmissions += rows.length
    canceledOriginals += rows.filter(({ status }) => status === 'canceled').length
  }
  report.noiseSummary = {
    stage: fixture.stage,
    finiteCompletions: report.generations.length,
    actualAdmissions,
    canceledOriginals,
    preservingRetryRefusals: report.predictionRetryRefusals?.length ?? 0,
    sourceRecipes: fixture.authorRecipes,
    completedScope: report.noiseFixture.completedScope,
    fullBoundedClaim: report.noiseFixture.fullBoundedClaim,
    matchedTrainedPixelControlCases: report.noiseFixture.matchedTrainedPixelControlCases,
    remainingStages: noiseStages.filter((value) => value !== fixture.stage),
    noCombinedMatrixClaim: true,
  }
  assertNoiseStageOutcome(report.noiseSummary)
  await check(
    'Declared installed noise-profile stage retains frozen inputs, exact trained objectives and immutable accepted settings',
    report.noiseSummary,
  )
}
async function qualifyVPrediction() {
  const projects = []
  const txtCases = []
  report.predictionImports = []
  for (const predictionType of ['v_prediction', 'epsilon']) {
    const caseName = `illustrious-txt2img-prediction-${predictionType}`
    await stage('Installed matched txt2img prediction case', { caseName, predictionType })
    const project = await createProject(fixture.illustrious, fixture.illustriousLora, caseName)
    projects.push(project)
    if (!resume && txtCases.length === 0) {
      const catalog = await window.evaluate(() => window.api.models.getCatalog())
      assert.equal(catalog.ok, true)
      const version = catalog.value.find(
        ({ id }) => id === fixture.illustrious.installed.resourceId,
      ).versions[0]
      assert.equal(version.predictionType, 'epsilon')
      assert.equal(version.predictionTypeSource, 'default')
    }
    const authored = await setPredictionThroughUi(project, predictionType)
    await setVaePrecision(project, 'FP32')
    txtCases.push(
      await generateAndAccept(project, 'illustrious', 'txt2img', {
        kind: 'v-prediction',
        caseName,
        predictionType,
        authored,
      }),
    )
  }
  // A plausible installed mutation that ignores prediction must fail after two healthy jobs.
  await assertMatchedPredictionPixels(txtCases, 'txt2img')
  const source = txtCases[0]
  const saved = await readIgsPackage(source.packagePath)
  const sourceBytes = await saved.readMember(saved.project.layers[0].asset.path)
  assert.equal(sha256(sourceBytes), source.outputSha256)
  const sourcePath = path.join(fixture.artifacts, 'prediction-common-img2img-source.png')
  await writeFile(sourcePath, sourceBytes, { flag: 'wx' })
  const commonSource = {
    path: sourcePath,
    sha256: sha256(sourceBytes),
    byteSize: sourceBytes.length,
    pixelSha256: source.dimensions.pixelSha256,
    width: fixture.side,
    height: fixture.side,
    sourceQueueItemId: source.queueItemId,
    sourcePackagePath: source.packagePath,
  }
  report.predictionCommonSource = commonSource
  const imgCases = []
  for (const predictionType of ['v_prediction', 'epsilon']) {
    const retryCase = predictionType === 'v_prediction'
    const caseName = `illustrious-img2img-prediction-${predictionType}${retryCase ? '-retry' : ''}`
    await stage('Installed matched opaque img2img prediction case', {
      caseName,
      predictionType,
      strength: 0.5,
    })
    const project = await createProject(fixture.illustrious, fixture.illustriousLora, caseName)
    projects.push(project)
    await importMatchedExternalVaeSource(project, commonSource, 'v-prediction')
    const authored = await setPredictionThroughUi(project, predictionType)
    await setVaePrecision(project, 'FP32')
    await setInput('Denoising Strength', 0.5)
    await expect
      .poll(async () => (await tab(project)).generationDraft.sampling.denoisingStrength)
      .toBe(0.5)
    imgCases.push(
      await generateAndAccept(
        project,
        'illustrious',
        'img2img',
        { kind: 'v-prediction', caseName, predictionType, authored, commonSource },
        retryCase,
      ),
    )
  }
  await assertMatchedPredictionPixels(imgCases, 'img2img')
  assert.equal(report.generations.length, 4)
  assert.deepEqual(report.failures, [])
  assert.equal(report.predictionRetryRefusals.length, 1)
  assert.equal(report.generations.filter(({ retry }) => retry !== null).length, 1)
  let actualAdmissions = 0
  let canceledOriginals = 0
  for (const project of projects) {
    const rows = await queueRows(project)
    actualAdmissions += rows.length
    canceledOriginals += rows.filter(({ status }) => status === 'canceled').length
    assert.equal(rows.filter(({ status }) => status === 'completed').length, 1)
  }
  assert.equal(actualAdmissions, 5)
  assert.equal(canceledOriginals, 1)
  assert.equal(await hashFile(sourcePath), commonSource.sha256)
  report.predictionSummary = {
    finiteCompletions: 4,
    actualAdmissions,
    canceledOriginals,
    refusedRetryAttempts: 1,
    side: fixture.side,
    steps: fixture.steps,
    seed: 0,
    sampler: 'Euler a',
    scheduler: 'Normal',
    precision: 'FP32',
    vae: 'Embedded',
    loraWeight: -0.5,
    img2imgStrength: 0.5,
    observedImg2imgEvaluations: imgCases.map(({ queueItemId, qualification }) => ({
      queueItemId,
      observedCount: qualification.effectiveDenoisingEvaluations,
    })),
    commonSource,
    source: fixture.illustrious.origin,
    creatorCredit: `${fixture.illustrious.origin.creator} — ${fixture.illustrious.name}`,
    trainedObjective: 'v_prediction',
    control:
      'epsilon interpretation on the same v-trained weights; not a separate trained objective',
  }
  await check(
    'Four finite installed prediction cases, actual Cancel and preserving refused/successful frozen Retry',
    report.predictionSummary,
  )
}
async function qualifyMissingRuntimeSaveAndRebuild(project) {
  const latest = report.generations.at(-1)
  assert.ok(latest && latest.family === 'anima' && latest.mode === 'img2img')
  const before = await tab(project)
  const original = await readIgsPackage(latest.packagePath)
  const pointerFile = path.join(fixture.appData, 'runtime/current-runtime.json')
  const heldPointerFile = path.join(
    fixture.appData,
    `runtime/qualification-held-pointer-${process.pid}.json`,
  )
  assert.equal(await lstat(heldPointerFile).catch(() => null), null)
  const pointerBytes = await readFile(pointerFile)
  assert.deepEqual(JSON.parse(pointerBytes.toString('utf8')), pointer)
  await rename(pointerFile, heldPointerFile)
  let fallback
  let fallbackProjectJson
  try {
    const unavailable = await window.evaluate(() => window.api.runtime.getStatus())
    assert.equal(unavailable.ok, true, JSON.stringify(unavailable))
    assert.notEqual(unavailable.value.kind, 'ready')
    const changedPrompt = `${before.generationDraft.positivePrompt.text}, worker unavailable edit`
    await window.getByRole('textbox', { name: 'Positive prompt', exact: true }).fill(changedPrompt)
    await window.getByRole('textbox', { name: 'Negative prompt', exact: true }).focus()
    await expect
      .poll(async () => (await tab(project)).generationDraft.positivePrompt.text)
      .toBe(changedPrompt)
    const save = window.getByRole('button', { name: 'Save Project', exact: true })
    await expect(save).toBeEnabled({ timeout: 90_000 })
    await save.click()
    await expect.poll(async () => (await tab(project)).dirty, { timeout: 90_000 }).toBe(false)
    // Main's durable Save settles before renderer refreshes and clears its pending action. Home
    // switching is deliberately refused during that UI action; observe its actual completion.
    await expect(save).toBeEnabled({ timeout: 90_000 })
    fallback = await readIgsPackage(latest.packagePath)
    fallbackProjectJson = await fallback.readMember('project.json')
    assert.equal(fallback.manifest.preview.status, 'unavailable')
    assert.equal(fallback.project.generationDraft.positivePrompt.text, changedPrompt)
    assert.deepEqual(fallback.project.layers, original.project.layers)
    for (const layer of fallback.project.layers) {
      assert.equal(sha256(await fallback.readMember(layer.asset.path)), layer.asset.sha256)
    }
    assert.deepEqual(
      await fallback.readMember('preview/merged.png'),
      await readFile('dist/main/placeholders/unavailable.png'),
    )
    assert.deepEqual(
      await fallback.readMember('preview/thumbnail.webp'),
      await readFile('dist/main/placeholders/unavailable.webp'),
    )
    await check(
      'Missing installed runtime: actual UI Save keeps edited Project and accepted bytes/provenance',
      {
        documentId: before.documentId,
        packagePath: latest.packagePath,
        preview: fallback.manifest.preview,
        runtime: unavailable.value,
      },
    )
  } finally {
    // Only this disposable owned fixture pointer is touched; restore it even after failed assertions.
    assert.equal(await lstat(pointerFile).catch(() => null), null)
    await rename(heldPointerFile, pointerFile)
    assert.deepEqual(await readFile(pointerFile), pointerBytes)
  }
  await window.getByRole('tab', { name: 'Home', exact: true }).click()
  await expect(window.getByRole('tab', { name: 'Home', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const rebuild = window.getByRole('button', {
    name: `Rebuild preview for ${project.title}`,
    exact: true,
  })
  await expect(rebuild).toBeEnabled({ timeout: 90_000 })
  await rebuild.click()
  await expect
    .poll(async () => (await api('list')).find(({ id }) => id === project.id)?.previewStatus, {
      timeout: 180_000,
    })
    .toBe('rendered')
  const rebuilt = await readIgsPackage(latest.packagePath)
  assert.equal(rebuilt.manifest.preview.status, 'rendered')
  assert.deepEqual(await rebuilt.readMember('project.json'), fallbackProjectJson)
  for (const layer of rebuilt.project.layers) {
    assert.equal(sha256(await rebuilt.readMember(layer.asset.path)), layer.asset.sha256)
  }
  const mergedBytes = await rebuilt.readMember('preview/merged.png')
  const merged = await decodedImage(`data:image/png;base64,${mergedBytes.toString('base64')}`)
  assert.equal(merged.pixelSha256, latest.dimensions.pixelSha256)
  const screenshot = path.join(fixture.artifacts, 'installed-runtime-preview-rebuild.png')
  await captureScreenshot(screenshot)
  report.screenshots.push(screenshot)
  await check('Restored installed runtime: actual Home Rebuild Preview changes derivatives only', {
    documentId: before.documentId,
    packagePath: latest.packagePath,
    preview: rebuilt.manifest.preview,
    merged,
  })
}
async function qualifyInstalledImport(project) {
  const latest = report.generations.at(-1)
  const savedBefore = await readIgsPackage(latest.packagePath)
  const sourceLayer = savedBefore.project.layers[0]
  const importPath = path.join(fixture.artifacts, 'import-source.png')
  await writeFile(importPath, await savedBefore.readMember(sourceLayer.asset.path), { flag: 'wx' })
  await window.getByRole('button', { name: `Open ${project.title}`, exact: true }).click()
  await window.getByRole('tab', { name: project.title, exact: true }).waitFor()
  const { existingLayers, imported } = await importRasterThroughUi(project, importPath)
  await window.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await tab(project)).dirty).toBe(false)
  const saved = await readIgsPackage(latest.packagePath)
  assert.equal(saved.manifest.preview.status, 'rendered')
  assert.equal(saved.project.layers[0].generationProvenance, undefined)
  assert.equal(saved.project.lastActualSeedSnapshot, 0)
  assert.deepEqual(saved.project.layers.slice(1), savedBefore.project.layers)
  const normalized = await decodedImage(
    `data:image/png;base64,${(await saved.readMember(saved.project.layers[0].asset.path)).toString('base64')}`,
  )
  assert.equal(normalized.pixelSha256, latest.dimensions.pixelSha256)
  await check(
    'Installed CPU worker: UI Raster import at bbox origin -> normalized pixels -> Save',
    {
      controlled: 'OS chooser returns the recorded real PNG source only',
      importedLayerId: imported.layers[0].id,
      existingLayers,
      normalized,
      preview: saved.manifest.preview,
    },
  )
}
try {
  assert.ok(
    !Object.hasOwn(fixture, 'profile') ||
      cfgRescaleProfile ||
      outpaintProfile ||
      vaePrecisionProfile ||
      externalVaeProfile ||
      embeddingsProfile ||
      vPredictionProfile ||
      noiseProfile,
    'Qualification profile must be omitted or exactly cfg-rescale, outpaint, vae-precision, external-vae, embeddings, v-prediction or noise-profile.',
  )
  assert.ok(
    Number.isInteger(fixture.side) &&
      fixture.side >= 64 &&
      fixture.side <= 2048 &&
      fixture.side % 8 === 0,
    'Qualification image side must be an integer multiple of 8 from 64 to 2048.',
  )
  assert.ok(Number.isInteger(fixture.steps) && fixture.steps >= 1 && fixture.steps <= 200)
  if (cfgRescaleProfile) {
    assert.equal(fixture.steps, 3, 'CFG Rescale qualification requires exactly 3 authored steps.')
  }
  if (vaePrecisionProfile) {
    assert.equal(
      fixture.side,
      256,
      'VAE Precision qualification requires exactly 256 pixels per side.',
    )
    assert.equal(fixture.steps, 3, 'VAE Precision qualification requires exactly 3 authored steps.')
  }
  if (externalVaeProfile) validateExternalVaeFixture()
  if (embeddingsProfile) validateEmbeddingFixture()
  if (vPredictionProfile) validateVPredictionFixture()
  if (noiseProfile) {
    const installed = JSON.parse(await readFile(provision.report, 'utf8'))
    report.noiseFixture = validateNoiseProfileFixture(fixture, installed.ready)
    assert.equal(
      resume,
      true,
      'Noise-profile qualification must reuse the original canonical runtime/catalog.',
    )
    assert.equal(installed.confirmedWorkerExit, true)
    assert.equal(installed.status, 'activated-qualified')
    report.installedReady = installed.ready
    report.launcherBounds = await assertUpgradeBounds()
    report.noiseSourceFiles = []
    for (const key of noiseModelKeys) {
      const value = fixture[key]
      const entry = await lstat(value.path)
      assert.ok(entry.isFile() && !entry.isSymbolicLink())
      assert.equal(await realpath(value.path), value.path)
      assert.equal(entry.size, value.byteSize)
      assert.equal(await hashFile(value.path), value.sha256)
      report.noiseSourceFiles.push({
        key,
        descriptor: structuredClone(value),
        sourceStat: {
          dev: entry.dev,
          ino: entry.ino,
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          ctimeMs: entry.ctimeMs,
        },
      })
    }
    if (fixture.stage === 'outpaint') {
      assert.deepEqual(Object.keys(fixture.lama).sort(), ['path', 'sha256', 'byteSize'].sort())
      assert.equal(fixture.lama.sha256, LAMA_OUTPAINT_ARTIFACT.sha256)
      assert.equal(fixture.lama.byteSize, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
      await verifyInferenceAuxiliaryFile({
        byteSize: fixture.lama.byteSize,
        managedPath: fixture.lama.path,
        sha256: fixture.lama.sha256,
      })
    }
  }
  if (outpaintProfile) {
    validateOutpaintFixture()
    // Qualify the declared local file before model copying, catalog writes or Electron startup.
    await verifyInferenceAuxiliaryFile({
      byteSize: fixture.lama.byteSize,
      managedPath: fixture.lama.path,
      sha256: fixture.lama.sha256,
    })
  }
  const families = illustriousOnlyProfile ? ['illustrious'] : ['illustrious', 'anima']
  const allModelKeys = priorModelKeys
  const modelKeys = noiseProfile
    ? noiseModelKeys
    : illustriousOnlyProfile
      ? ['illustrious', 'illustriousLora']
      : allModelKeys
  for (const family of families) {
    assert.equal(fixture[family]?.type, 'checkpoint')
    assert.equal(fixture[family]?.family, family)
    const lora = fixture[family === 'anima' ? 'animaLora' : 'illustriousLora']
    assert.equal(lora?.type, 'lora', 'this qualification requires one real LoRA for each family')
    assert.equal(lora.family, family)
  }
  if (vPredictionProfile) {
    const ready = JSON.parse(await readFile(provision.report, 'utf8')).ready
    assert.ok(
      ['0.12.0', '0.13.0', '0.14.0'].includes(ready.workerVersion),
      'V-prediction qualification requires an installed qualified contribution worker.',
    )
    for (const capability of [
      'illustrious-txt2img',
      'illustrious-img2img',
      'illustrious-lora',
      'illustrious-vae-precision',
    ])
      assert.ok(
        ready.capabilities.includes(capability),
        `V-prediction qualification requires ${capability}.`,
      )
    report.installedReady = ready
    report.predictionSourceFiles = []
    for (const key of modelKeys) {
      const value = fixture[key]
      const entry = await lstat(value.path)
      assert.ok(entry.isFile() && !entry.isSymbolicLink())
      assert.equal(await realpath(value.path), value.path)
      assert.equal(entry.size, value.byteSize)
      assert.equal(await hashFile(value.path), value.sha256)
      report.predictionSourceFiles.push({
        key,
        descriptor: structuredClone(value),
        sourceStat: {
          dev: entry.dev,
          ino: entry.ino,
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          ctimeMs: entry.ctimeMs,
        },
      })
    }
  }
  if (vaePrecisionProfile) {
    assert.equal(
      resume,
      true,
      'VAE Precision qualification must resume the same six-resource catalog.',
    )
    const ready = JSON.parse(await readFile(provision.report, 'utf8')).ready
    assert.ok(
      ['0.12.0', '0.13.0', '0.14.0'].includes(ready.workerVersion),
      'VAE Precision qualification requires an installed qualified contribution worker.',
    )
    assert.ok(ready.capabilities.includes('illustrious-vae-precision'))
    assert.ok(ready.capabilities.includes('illustrious-txt2img'))
    assert.ok(ready.capabilities.includes('illustrious-img2img'))
    assert.ok(ready.capabilities.includes('illustrious-lora'))
    report.installedReady = ready
  }
  if (externalVaeProfile) {
    assert.equal(
      resume,
      true,
      'External VAE qualification must resume the existing isolated catalog.',
    )
    const ready = JSON.parse(await readFile(provision.report, 'utf8')).ready
    assert.ok(
      ['0.12.0', '0.13.0', '0.14.0'].includes(ready.workerVersion),
      'External VAE qualification requires an installed qualified contribution worker.',
    )
    for (const capability of [
      'illustrious-external-vae',
      'illustrious-vae-precision',
      'illustrious-txt2img',
      'illustrious-img2img',
      'illustrious-lora',
    ]) {
      assert.ok(
        ready.capabilities.includes(capability),
        `External VAE qualification requires ${capability}.`,
      )
    }
    report.installedReady = ready
  }
  if (embeddingsProfile) {
    assert.equal(resume, true, 'Embedding qualification must resume the existing isolated catalog.')
    const ready = JSON.parse(await readFile(provision.report, 'utf8')).ready
    assert.ok(
      ['0.12.0', '0.13.0', '0.14.0'].includes(ready.workerVersion),
      'Embedding qualification requires an installed qualified contribution worker.',
    )
    for (const capability of [
      'illustrious-embeddings',
      'illustrious-vae-precision',
      'illustrious-txt2img',
      'illustrious-img2img',
      'illustrious-lora',
    ])
      assert.ok(
        ready.capabilities.includes(capability),
        `Embedding qualification requires ${capability}.`,
      )
    report.installedReady = ready
    report.embeddingFiles = []
    for (const key of embeddingKeys) {
      const value = fixture[key]
      const before = await lstat(value.path)
      assert.ok(before.isFile() && !before.isSymbolicLink())
      assert.equal(before.size, value.byteSize)
      assert.equal(await hashFile(value.path), value.sha256)
      await qualifyIllustriousEmbedding(value.path)
      const after = await lstat(value.path)
      assert.deepEqual(
        [after.dev, after.ino, after.size, after.mtimeMs, after.ctimeMs],
        [before.dev, before.ino, before.size, before.mtimeMs, before.ctimeMs],
      )
      report.embeddingFiles.push({
        key,
        descriptor: structuredClone(value),
        sourceStat: {
          dev: before.dev,
          ino: before.ino,
          size: before.size,
          mtimeMs: before.mtimeMs,
          ctimeMs: before.ctimeMs,
        },
        headerScope:
          'Production Main paired clip_l/clip_g bounded safetensors header qualification; actual native tensor finiteness is required by the worker.',
      })
    }
  }
  report.sourceSha256 = {
    script: await hashFile('scripts/qualify-installed-generation.mjs'),
    workerLock: await hashFile('worker-python/uv.lock'),
    ...(noiseProfile
      ? {
          noiseQualification: await hashFile('scripts/noobai-noise-qualification.mjs'),
          qualificationUpgrade: await hashFile('scripts/upgrade-qualification-worker.mjs'),
          localCivitaiTransport: await hashFile('scripts/qualification-local-civitai.mjs'),
        }
      : {}),
  }
  report.bundleSha256 = Object.fromEntries(
    await Promise.all(
      [
        'dist/main/main.cjs',
        'dist/preload/preload.cjs',
        'dist/renderer/index.html',
        ...(await readdir('dist/renderer/assets'))
          .filter((name) => /\.(js|css)$/.test(name))
          .map((name) => `dist/renderer/assets/${name}`),
      ].map(async (file) => [file, await hashFile(file)]),
    ),
  )
  database = openAppDatabase(fixture.appData, path.resolve('src/main/db/migrations'))
  const repository = new ModelRepository(database.db)
  const catalog = await repository.listInstalled()
  if (!resume) assert.equal(catalog.length, 0, 'qualification catalog must initially be empty')
  else {
    // An Illustrious-only fixture may declare the previous six-resource catalog while executing
    // only Illustrious. Unlisted installed identities still refuse; no extra resources are copied.
    const declaredKeys =
      vPredictionProfile || noiseProfile
        ? modelKeys
        : embeddingsProfile
          ? [...allModelKeys, ...externalVaeKeys, ...embeddingKeys]
          : externalVaeProfile
            ? [...allModelKeys, ...externalVaeKeys]
            : allModelKeys
    const hashes = new Set(
      declaredKeys.filter((key) => fixture[key]).map((key) => fixture[key].sha256),
    )
    assert.ok(
      catalog.every((model) => model.versions.every((version) => hashes.has(version.file.sha256))),
      'resume may only reuse the same isolated qualification catalog',
    )
    if (vPredictionProfile) {
      assert.equal(hashes.size, 2)
      assert.equal(
        catalog.length,
        2,
        'V-prediction qualification may resume only its exact two-resource catalog.',
      )
      assertPredictionCatalog(catalog)
    }
    if (noiseProfile) {
      assert.equal(hashes.size, 3)
      assertNoiseCatalog(catalog, fixture, { adopting: true })
      preservedNoisePriorCatalog = structuredClone(catalog)
    }
    if (vaePrecisionProfile) {
      assert.equal(
        hashes.size,
        6,
        'VAE Precision qualification must declare the same six resource identities.',
      )
      assert.equal(
        catalog.length,
        6,
        'VAE Precision qualification must resume the same six-resource catalog.',
      )
      assert.ok(
        catalog.every(
          (model) => model.versions.length === 1 && model.versions[0].file.status === 'ready',
        ),
      )
      report.catalogReuse = {
        resourceCount: catalog.length,
        declaredIdentityCount: hashes.size,
        copiedResources: 0,
      }
    }
    if (externalVaeProfile) {
      assert.equal(hashes.size, 9)
      const priorHashes = new Set(allModelKeys.map((key) => fixture[key].sha256))
      const prior = catalog.filter((model) =>
        model.versions.some(({ file }) => priorHashes.has(file.sha256)),
      )
      assert.equal(
        prior.length,
        6,
        'External VAE qualification must retain all six original resources.',
      )
      assert.ok(
        prior.every(
          (model) => model.versions.length === 1 && model.versions[0].file.status === 'ready',
        ),
      )
      assert.equal(new Set(prior.map(({ versions }) => versions[0].file.sha256)).size, 6)
      const added = catalog.filter((model) => !prior.includes(model))
      assert.ok(
        added.length <= 1,
        'Only the single declared external VAE qualification resource may be added.',
      )
      const actualHashes = catalog.flatMap(({ versions }) =>
        versions.map(({ file }) => file.sha256),
      )
      assert.equal(new Set(actualHashes).size, actualHashes.length)
      for (const model of added) {
        assert.equal(model.type, 'vae')
        assert.deepEqual(model.source, { kind: 'civitai', modelId: 700_070 })
        assert.equal(model.displayName, fixture.externalVaeLdm.name)
        assert.ok(model.versions.length >= 1 && model.versions.length <= 3)
        for (const version of model.versions) {
          const key = externalVaeKeys.find((key) => fixture[key].sha256 === version.file.sha256)
          assert.ok(key)
          assert.equal(version.file.status, 'ready')
          assert.equal(version.baseModelFamily, 'illustrious')
          assert.equal(version.name, fixture[key].versionName)
          assert.deepEqual(version.sourceMetadata.origin, fixture[key].origin)
          assert.equal(version.civitaiVersionId, 700_071 + externalVaeKeys.indexOf(key) * 10)
          assert.equal(version.civitaiFileId, 700_072 + externalVaeKeys.indexOf(key) * 10)
        }
      }
      preservedExternalPriorCatalog = structuredClone(prior).sort((left, right) =>
        left.id.localeCompare(right.id),
      )
      report.catalogReuse = {
        originalResourceCount: prior.length,
        initialResourceCount: catalog.length,
        declaredIdentityCount: hashes.size,
        allowedAddedResources: 1,
        allowedExternalFiles: 3,
      }
    }
    if (embeddingsProfile) {
      assert.equal(hashes.size, 11)
      const priorHashes = new Set(
        [...allModelKeys, ...externalVaeKeys].map((key) => fixture[key].sha256),
      )
      const prior = catalog.filter((model) =>
        model.versions.some(({ file }) => priorHashes.has(file.sha256)),
      )
      assert.equal(
        prior.length,
        7,
        'Embedding qualification must retain all seven prior resources.',
      )
      assert.equal(prior.flatMap(({ versions }) => versions).length, 9)
      assert.ok(
        prior.every(({ versions }) =>
          versions.every(({ file }) => file.status === 'ready' && priorHashes.has(file.sha256)),
        ),
      )
      const original = prior.filter((model) =>
        model.versions.some(({ file }) =>
          allModelKeys.some((key) => fixture[key].sha256 === file.sha256),
        ),
      )
      assert.equal(original.length, 6)
      for (const model of original) {
        assert.equal(model.versions.length, 1)
        const version = model.versions[0]
        const key = allModelKeys.find((key) => fixture[key].sha256 === version.file.sha256)
        assert.ok(key)
        assert.equal(model.type, fixture[key].type)
        assert.equal(version.baseModelFamily, fixture[key].family)
        assert.equal(version.file.sizeBytes, fixture[key].byteSize)
      }
      const external = prior.filter((model) => !original.includes(model))
      assert.equal(external.length, 1)
      const vaeResource = external[0]
      assert.equal(vaeResource.type, 'vae')
      assert.deepEqual(vaeResource.source, { kind: 'civitai', modelId: 700_070 })
      assert.equal(vaeResource.displayName, fixture.externalVaeLdm.name)
      assert.equal(vaeResource.versions.length, 3)
      for (const version of vaeResource.versions) {
        const key = externalVaeKeys.find((key) => fixture[key].sha256 === version.file.sha256)
        assert.ok(key)
        assert.equal(version.name, fixture[key].versionName)
        assert.equal(version.baseModelFamily, 'illustrious')
        assert.equal(version.file.sizeBytes, fixture[key].byteSize)
        assert.deepEqual(version.sourceMetadata.origin, fixture[key].origin)
        assert.equal(version.civitaiVersionId, 700_071 + externalVaeKeys.indexOf(key) * 10)
        assert.equal(version.civitaiFileId, 700_072 + externalVaeKeys.indexOf(key) * 10)
      }
      const added = catalog.filter((model) => !prior.includes(model))
      assert.ok(
        added.length <= 1,
        'Only the single declared embedding qualification resource may be added.',
      )
      const actualHashes = catalog.flatMap(({ versions }) =>
        versions.map(({ file }) => file.sha256),
      )
      assert.equal(new Set(actualHashes).size, actualHashes.length)
      assert.equal(
        new Set(prior.flatMap(({ versions }) => versions.map(({ file }) => file.sha256))).size,
        9,
      )
      assert.ok(
        prior.every(
          ({ source }) =>
            source.kind !== 'civitai' || source.modelId !== fixture.embeddingTrained.origin.modelId,
        ),
        'The trained embedding source must not replace a prior resource identity.',
      )
      const priorVersions = prior.flatMap(({ versions }) => versions)
      for (const key of embeddingKeys) {
        const source = embeddingSourceIds(key)
        assert.ok(
          priorVersions.every(
            (version) =>
              version.civitaiVersionId !== source.versionId &&
              version.civitaiFileId !== source.fileId,
          ),
          'Embedding version/file source IDs must not replace prior catalog identities.',
        )
      }
      for (const model of added) {
        assert.equal(model.type, 'embedding')
        assert.deepEqual(model.source, {
          kind: 'civitai',
          modelId: fixture.embeddingTrained.origin.modelId,
        })
        assert.equal(model.displayName, fixture.embeddingTrained.name)
        assert.equal(model.creator, fixture.embeddingTrained.origin.creator)
        assert.deepEqual(model.sourceMetadata.origin, fixture.embeddingTrained.origin)
        assert.ok(model.versions.length >= 1 && model.versions.length <= 2)
        for (const version of model.versions) {
          const key = embeddingKeys.find((key) => fixture[key].sha256 === version.file.sha256)
          assert.ok(key)
          const source = embeddingSourceIds(key)
          assert.equal(version.file.status, 'ready')
          assert.equal(version.baseModelFamily, 'illustrious')
          assert.equal(version.predictionType, null)
          assert.equal(version.name, fixture[key].versionName)
          assert.equal(version.file.sizeBytes, fixture[key].byteSize)
          assert.equal(version.file.originalFilename, path.basename(fixture[key].path))
          assert.deepEqual(version.sourceMetadata.origin, fixture[key].origin)
          assert.equal(version.civitaiVersionId, source.versionId)
          assert.equal(version.civitaiFileId, source.fileId)
        }
      }
      preservedEmbeddingPriorCatalog = structuredClone(prior).sort((left, right) =>
        left.id.localeCompare(right.id),
      )
      report.catalogReuse = {
        originalResourceCount: 7,
        originalVersionCount: 9,
        initialResourceCount: catalog.length,
        declaredIdentityCount: hashes.size,
        allowedAddedResources: 1,
        allowedEmbeddingFiles: 2,
      }
    }
  }
  if (!illustriousOnlyProfile) {
    for (const [key, pin] of [
      ['encoder', ANIMA_QWEN3_0_6B_ENCODER],
      ['vae', ANIMA_QWEN_IMAGE_VAE],
    ]) {
      assert.equal(fixture[key].sha256, pin.sha256)
      assert.equal(fixture[key].byteSize, pin.sizeBytes)
    }
    const encoder = await installArtifact(repository, fixture.encoder, 700_010)
    const vae = await installArtifact(repository, fixture.vae, 700_020)
    fixture.encoder.installed = encoder
    fixture.vae.installed = vae
    fixture.anima.installed = await installArtifact(repository, fixture.anima, 700_030, [
      { role: 'qwen3_encoder', existingVersionId: encoder.versionId },
      { role: 'vae', existingVersionId: vae.versionId },
    ])
  }
  fixture.illustrious.installed = await installArtifact(
    repository,
    fixture.illustrious,
    700_040,
    undefined,
    vPredictionProfile || noiseProfile
      ? {
          sourceModelId: fixture.illustrious.origin.modelId,
          sourceVersionId: fixture.illustrious.origin.versionId,
          sourceFileId: fixture.illustrious.origin.fileId,
          creator: fixture.illustrious.origin.creator,
          resourceOrigin: fixture.illustrious.origin,
          versionName: fixture.illustrious.versionName,
        }
      : null,
  )
  for (const [key, id] of [
    ['animaLora', 700_050],
    ['illustriousLora', 700_060],
  ]) {
    if (modelKeys.includes(key) && fixture[key])
      fixture[key].installed = await installArtifact(
        repository,
        fixture[key],
        id,
        undefined,
        vPredictionProfile || noiseProfile ? { versionName: fixture[key].versionName } : null,
      )
  }
  if (noiseProfile) {
    const value = fixture.illustriousEpsilon
    value.installed = await installArtifact(repository, value, 700_140, undefined, {
      sourceModelId: value.origin.modelId,
      sourceVersionId: value.origin.versionId,
      sourceFileId: value.origin.fileId,
      creator: value.origin.creator,
      resourceOrigin: value.origin,
      versionName: value.versionName,
    })
    assertNoiseCatalog(await repository.listInstalled(), fixture)
    report.catalogReuse = {
      initialResourceCount: catalog.length,
      finalResourceCount: 3,
      finalVersionCount: 3,
      declaredIdentityCount: 3,
      newManagedFiles: report.models.filter(
        ({ reusedQualificationPrecondition }) => !reusedQualificationPrecondition,
      ).length,
      maximumAdditionalManagedFiles: 1,
    }
    assert.ok(report.catalogReuse.newManagedFiles <= 1)
  }
  if (vPredictionProfile) {
    const seeded = await repository.listInstalled()
    assertPredictionCatalog(seeded)
    if (!resume)
      assert.equal(
        seeded.find(({ type }) => type === 'checkpoint').versions[0].predictionType,
        null,
      )
    report.catalogReuse = {
      initialResourceCount: catalog.length,
      finalResourceCount: 2,
      finalVersionCount: 2,
      declaredIdentityCount: 2,
      newManagedFiles: report.models.filter(
        ({ reusedQualificationPrecondition }) => !reusedQualificationPrecondition,
      ).length,
    }
  }
  if (externalVaeProfile) {
    for (const [key, id] of [
      ['externalVaeLdm', 700_070],
      ['externalVaeNative', 700_080],
      ['externalVaeControl', 700_090],
    ]) {
      fixture[key].installed = await installArtifact(repository, fixture[key], id, undefined, {
        sourceModelId: 700_070,
        versionName: fixture[key].versionName,
      })
    }
    assert.equal(new Set(externalVaeKeys.map((key) => fixture[key].installed.resourceId)).size, 1)
    const seeded = await repository.listInstalled()
    assert.equal(seeded.length, 7)
    assert.equal(seeded.flatMap(({ versions }) => versions).length, 9)
    assert.ok(seeded.every(({ versions }) => versions.every(({ file }) => file.status === 'ready')))
    report.catalogReuse.finalResourceCount = 7
    report.catalogReuse.finalVersionCount = 9
    report.catalogReuse.newManagedFiles = report.models.filter(
      ({ reusedQualificationPrecondition }) => !reusedQualificationPrecondition,
    ).length
  }
  if (embeddingsProfile) {
    for (const [key, id] of [
      ['embeddingTrained', 700_100],
      ['embeddingControl', 700_110],
    ]) {
      const source = embeddingSourceIds(key)
      fixture[key].installed = await installArtifact(repository, fixture[key], id, undefined, {
        sourceModelId: source.modelId,
        sourceVersionId: source.versionId,
        sourceFileId: source.fileId,
        versionName: fixture[key].versionName,
        creator: fixture.embeddingTrained.origin.creator,
        resourceOrigin: fixture.embeddingTrained.origin,
      })
      await qualifyIllustriousEmbedding(fixture[key].installed.managedPath)
    }
    assert.equal(new Set(embeddingKeys.map((key) => fixture[key].installed.resourceId)).size, 1)
    const seeded = await repository.listInstalled()
    assert.equal(seeded.length, 8)
    assert.equal(seeded.flatMap(({ versions }) => versions).length, 11)
    assert.ok(seeded.every(({ versions }) => versions.every(({ file }) => file.status === 'ready')))
    report.catalogReuse.finalResourceCount = 8
    report.catalogReuse.finalVersionCount = 11
    report.catalogReuse.newManagedFiles = report.models.filter(
      ({ reusedQualificationPrecondition }) => !reusedQualificationPrecondition,
    ).length
  }
  await check(
    embeddingsProfile
      ? 'Same seven resources/nine versions retained; trained embedding and finite zero-tensor control cataloged as two exact versions with required creator credit'
      : externalVaeProfile
        ? 'Same six resources retained; three exact local VAE files cataloged as versions of one added qualification resource'
        : vaePrecisionProfile
          ? 'Same six-resource catalog retained; exact Illustrious checkpoint and signed LoRA reused without new copies'
          : 'Real exact model files copied, verified and cataloged; source weights unchanged',
  )
  if (outpaintProfile || (noiseProfile && fixture.stage === 'outpaint'))
    await installQualificationLama()
  application = await electron.launch({ args: ['.'], cwd: process.cwd(), env })
  report.nativeProcessPid = application.process().pid
  await ensureQualificationResourceLimits('native-launch')
  mainLog = createWriteStream(path.join(fixture.artifacts, 'electron-main.log'), { flags: 'wx' })
  application.process().stderr.pipe(mainLog, { end: false })
  application.process().on('exit', (code, signal) => {
    report.nativeExit = { code, signal, at: new Date().toISOString() }
  })
  await application.evaluate(({ app }) => {
    app.on('before-quit', () => console.error('QUALIFICATION before-quit'))
    const quit = app.quit.bind(app)
    app.quit = () => {
      console.error('QUALIFICATION app.quit', new Error().stack)
      quit()
    }
  })
  window = await isolateNativeSmokeWindow(application)
  await application.evaluate(({ BrowserWindow }) => {
    for (const nativeWindow of BrowserWindow.getAllWindows()) {
      nativeWindow.on('close', () => console.error('QUALIFICATION window close'))
      nativeWindow.on('closed', () => console.error('QUALIFICATION window closed'))
      nativeWindow.webContents.on('render-process-gone', (_event, details) =>
        console.error('QUALIFICATION renderer gone', details),
      )
    }
  })
  // Long CUDA qualification must not compete with the user's desktop focus or window controls.
  // The actual native renderer/compositor and public IPC remain in use for all interactions.
  await application.evaluate(({ BrowserWindow }) => {
    for (const nativeWindow of BrowserWindow.getAllWindows()) nativeWindow.hide()
  })
  report.nativeWindowIsolation = 'Hidden native Electron window; real renderer and IPC'
  window.on('crash', () => console.error('QUALIFICATION renderer crash'))
  window.on('close', () => console.error('QUALIFICATION renderer page close'))
  window.on('pageerror', (error) => report.pageErrors.push(String(error)))
  await window.getByRole('tab', { name: 'Home', exact: true }).waitFor()
  // Observe genuine public preload notifications before any admitted job can emit progress.
  await window.evaluate(() => {
    window.__installedQualificationProgress = []
    window.api.projects.onGenerationProgress((snapshot) => {
      if (snapshot.current) window.__installedQualificationProgress.push(snapshot)
    })
  })
  const runtime = await window.evaluate(() => window.api.runtime.getStatus())
  assert.equal(runtime.ok, true, JSON.stringify(runtime))
  assert.equal(runtime.value.kind, 'ready')
  assert.equal(runtime.value.runtimeId, pointer.runtimeId)
  await check('Unmodified production Main qualifies activated real Linux/NVIDIA runtime', {
    runtime: runtime.value,
  })
  if (outpaintProfile) {
    const ready = JSON.parse(await readFile(provision.report, 'utf8')).ready
    assert.ok(
      ['0.12.0', '0.13.0', '0.14.0'].includes(ready.workerVersion),
      'Outpaint qualification requires an installed qualified contribution worker.',
    )
    for (const capability of ['illustrious-outpaint', 'anima-outpaint'])
      assert.ok(ready.capabilities.includes(capability))
    report.installedReady = ready
    await qualifyOutpaint()
  } else if (noiseProfile) {
    await qualifyNoiseProfile()
  } else if (vPredictionProfile) {
    await qualifyVPrediction()
  } else if (embeddingsProfile) {
    await qualifyEmbeddings()
  } else if (externalVaeProfile) {
    await qualifyExternalVae()
  } else if (vaePrecisionProfile) {
    await qualifyVaePrecision()
  } else if (cfgRescaleProfile) {
    await qualifyCfgRescale()
  } else {
    let lastProject
    for (const [family, loraKey] of [
      ['illustrious', 'illustriousLora'],
      ['anima', 'animaLora'],
    ]) {
      const project = await createProject(fixture[family], fixture[loraKey])
      lastProject = project
      await generateAndAccept(project, family, 'txt2img')
      await prepareImg2Img(project)
      await generateAndAccept(project, family, 'img2img')
    }
    await qualifyMissingRuntimeSaveAndRebuild(lastProject)
    await qualifyInstalledImport(lastProject)
  }
  assert.deepEqual(report.pageErrors, [])
  if (noiseProfile) {
    const final = await repository.listInstalled()
    assertNoiseCatalog(final, fixture)
    const policyFree = (resource) => {
      const value = structuredClone(resource)
      if (value.type === 'checkpoint')
        for (const version of value.versions)
          for (const key of ['predictionType', 'predictionTypeSource', 'noiseProfile'])
            delete version[key]
      return value
    }
    for (const previous of preservedNoisePriorCatalog)
      assert.deepEqual(
        policyFree(final.find(({ id }) => id === previous.id)),
        policyFree(previous),
        'The original catalog rows/bytes/defaults/source attribution must be preserved apart from exact-file authored policies.',
      )
    for (const { descriptor, sourceStat } of report.noiseSourceFiles) {
      assert.equal(await hashFile(descriptor.path), descriptor.sha256)
      const entry = await lstat(descriptor.path)
      assert.deepEqual(
        {
          dev: entry.dev,
          ino: entry.ino,
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          ctimeMs: entry.ctimeMs,
        },
        sourceStat,
      )
    }
    report.noiseSourcesUnchanged = true
    report.catalogReuse.exactThreeResourceClosure = true
    report.catalogReuse.priorRowsPreservedApartFromAuthoredExactFilePolicies = true
  }
  if (vPredictionProfile) {
    assertPredictionCatalog(await repository.listInstalled())
    for (const { descriptor, sourceStat } of report.predictionSourceFiles) {
      assert.equal(await hashFile(descriptor.path), descriptor.sha256)
      const entry = await lstat(descriptor.path)
      assert.deepEqual(
        {
          dev: entry.dev,
          ino: entry.ino,
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          ctimeMs: entry.ctimeMs,
        },
        sourceStat,
      )
    }
    report.predictionSourcesUnchanged = true
    report.catalogReuse.exactTwoResourceClosure = true
  }
  if (externalVaeProfile) {
    const finalCatalog = await repository.listInstalled()
    const priorIds = new Set(preservedExternalPriorCatalog.map(({ id }) => id))
    assert.deepEqual(
      finalCatalog
        .filter(({ id }) => priorIds.has(id))
        .sort((left, right) => left.id.localeCompare(right.id)),
      preservedExternalPriorCatalog,
      'The six prior resource rows, versions and defaults must remain unchanged.',
    )
    assert.equal(finalCatalog.length, 7)
    assert.equal(finalCatalog.flatMap(({ versions }) => versions).length, 9)
    assert.ok(
      finalCatalog.every(({ versions }) => versions.every(({ file }) => file.status === 'ready')),
    )
    report.catalogReuse.originalRowsUnchanged = true
  }
  if (embeddingsProfile) {
    const finalCatalog = await repository.listInstalled()
    const priorIds = new Set(preservedEmbeddingPriorCatalog.map(({ id }) => id))
    assert.deepEqual(
      finalCatalog
        .filter(({ id }) => priorIds.has(id))
        .sort((left, right) => left.id.localeCompare(right.id)),
      preservedEmbeddingPriorCatalog,
      'The seven prior resource rows, nine versions and all prior defaults must remain unchanged.',
    )
    assert.equal(finalCatalog.length, 8)
    assert.equal(finalCatalog.flatMap(({ versions }) => versions).length, 11)
    assert.ok(
      finalCatalog.every(({ versions }) => versions.every(({ file }) => file.status === 'ready')),
    )
    report.catalogReuse.originalRowsUnchanged = true
    for (const { descriptor, sourceStat } of report.embeddingFiles) {
      assert.equal(await hashFile(descriptor.path), descriptor.sha256)
      const after = await lstat(descriptor.path)
      assert.deepEqual(
        {
          dev: after.dev,
          ino: after.ino,
          size: after.size,
          mtimeMs: after.mtimeMs,
          ctimeMs: after.ctimeMs,
        },
        sourceStat,
      )
    }
    report.embeddingSourcesUnchanged = true
  }
  // Observational closure only: neither source files nor the active runtime is rewritten.
  for (const model of report.models) assert.equal(await hashFile(model.managedPath), model.sha256)
  assert.deepEqual(
    JSON.parse(await readFile(path.join(fixture.appData, 'runtime/current-runtime.json'), 'utf8')),
    pointer,
  )
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  report.error = String(error.stack ?? error)
  console.error('QUALIFICATION FAILED', report.error)
  await checkpointEvidence().catch((cause) =>
    console.error('QUALIFICATION failure report could not be checkpointed', cause),
  )
  throw error
} finally {
  const qualificationFailed = report.status === 'failed'
  const finalizationErrors = []
  const finalize = async (name, operation) => {
    try {
      await operation()
    } catch (cause) {
      const error = String(cause?.stack ?? cause)
      finalizationErrors.push(cause)
      report.cleanupErrors ??= []
      report.cleanupErrors.push({ name, error })
      console.error(`QUALIFICATION ${name} failed`, error)
      if (!qualificationFailed) {
        report.status = 'failed'
        report.error ??= error
      }
    }
  }
  await finalize('native resource limits before close', async () => {
    if (application && !report.nativeExit)
      await ensureQualificationResourceLimits('before-native-close')
  })
  await finalize('native cleanup', closeNativeQualification)
  await finalize('native physical exit', async () => {
    if (report.resourceLimitChecks?.length)
      report.nativePhysicalExit = await confirmQualificationProcessExit(report.resourceLimitChecks)
  })
  await finalize('database close', async () => {
    if (database) await database.close()
  })
  await finalize('main log close', async () => {
    if (!mainLog) return
    await new Promise((resolve, reject) => {
      const onError = (cause) => reject(cause)
      mainLog.once('error', onError)
      mainLog.end((cause) => {
        mainLog.off('error', onError)
        if (cause) reject(cause)
        else resolve()
      })
    })
  })
  await finalize('final evidence checkpoint', () => checkpointEvidence(true))
  // A pending qualification throw remains authoritative. A successful run must still reject
  // when native/database/log closure or final evidence publication fails.
  if (!qualificationFailed && finalizationErrors.length > 0) throw finalizationErrors[0]
}
