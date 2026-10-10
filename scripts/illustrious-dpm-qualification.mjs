/** Independent finite EPS DPM oracle; no filesystem, native solver or production compiler calls. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'

// The selected geometry, alpha policy and opaque Save composition are family-independent.
// Illustrious DTO/resource/sampling/conditioning semantics are asserted below without projection.
export {
  assertAnimaHeunImageOutputPixels as assertIllustriousDpmImageOutputPixels,
  assertAnimaHeunImageSavedPixels as assertIllustriousDpmImageSavedPixels,
  assertAnimaHeunImageTargetPixels as assertIllustriousDpmImageTargetPixels,
  literalAnimaHeunImageContributionAlpha as literalIllustriousDpmContributionAlpha,
  literalAnimaHeunImageTargetAlpha as literalIllustriousDpmTargetAlpha,
} from './anima-heun-image-qualification.mjs'
import { literalAnimaHeunImageTargetAlpha } from './anima-heun-image-qualification.mjs'

const artifactRoot = path.join(homedir(), '.codex/artifacts/imagegen-studio')
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const sources = {
  illustriousEpsilon: {
    byteSize: 6938040416,
    sha256: 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
    type: 'checkpoint',
    managedId: 700140,
    modelId: 833294,
    versionId: 1022833,
    fileId: 928571,
    trainedObjective: 'epsilon',
  },
  illustriousLora: {
    byteSize: 114437420,
    sha256: 'c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9',
    type: 'lora',
    managedId: 700060,
    modelId: 700060,
    versionId: 700061,
    fileId: 700062,
  },
  externalVaeNative: {
    byteSize: 167335542,
    sha256: 'f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7',
    type: 'vae',
    managedId: 700080,
    modelId: 700070,
    versionId: 700081,
    fileId: 700082,
  },
}
const prompts = {
  positive: 'a (red:1.3) ceramic cup on a wooden table, studio photograph',
  negative: '(blurry:0.7), low quality',
}
const lama = {
  byteSize: 205669692,
  role: 'outpaint-infill',
  sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
}
const policy = {
  edgeRadius: 16,
  fadeDistance: 16,
  infillMethod: 'lama',
  maskBlur: 'gaussian-weighted-max',
  minimumDenoise: 0,
  outputMode: 'contribution',
  version: 1,
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

/** Explicit finite registry; native keys, UI labels and raw callback counts are separate fields. */
export const illustriousDpmPairs = freeze([
  {
    algorithm: 'dpmpp_2m',
    schedule: 'Normal',
    sampler: 'DPM++ 2M',
    invokeScheduler: 'dpmpp_2m',
    steps: 4,
    txtObservedSteps: 4,
    historyObservedSteps: 3,
    neighborObservedSteps: 2,
  },
  {
    algorithm: 'dpmpp_2m',
    schedule: 'Karras',
    sampler: 'DPM++ 2M',
    invokeScheduler: 'dpmpp_2m_k',
    steps: 4,
    txtObservedSteps: 4,
    historyObservedSteps: 3,
    neighborObservedSteps: 2,
  },
  {
    algorithm: 'dpmpp_sde',
    schedule: 'Normal',
    sampler: 'DPM++ SDE',
    invokeScheduler: 'dpmpp_sde',
    steps: 4,
    txtObservedSteps: 7,
    historyObservedSteps: 5,
    neighborObservedSteps: 1,
  },
  {
    algorithm: 'dpmpp_sde',
    schedule: 'Karras',
    sampler: 'DPM++ SDE',
    invokeScheduler: 'dpmpp_sde_k',
    steps: 4,
    txtObservedSteps: 7,
    historyObservedSteps: 5,
    neighborObservedSteps: 1,
  },
])

export function illustriousDpmPair(algorithm, schedule) {
  const pair = illustriousDpmPairs.find(
    (candidate) => candidate.algorithm === algorithm && candidate.schedule === schedule,
  )
  assert.ok(pair, 'Only the four declared DPM algorithm/schedule pairs are qualified.')
  return pair
}

function exactKeys(value, required, optional = []) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  assert.deepEqual(
    Object.keys(value).sort(),
    [...required, ...optional.filter((key) => Object.hasOwn(value, key))].sort(),
    'The qualification object must contain exactly its declared fields.',
  )
}

function sha(value) {
  assert.equal(typeof value, 'string')
  assert.match(value, /^[a-f0-9]{64}$/)
}

function absolute(value) {
  assert.ok(
    typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value,
    'Qualification paths must be canonical absolute paths.',
  )
}

function artifactPath(value) {
  absolute(value)
  assert.ok(
    value.startsWith(`${artifactRoot}${path.sep}`),
    'DPM qualification paths must strictly descend from the owned artifact root.',
  )
}

function overlap(left, right) {
  return (
    left === right ||
    left.startsWith(`${right}${path.sep}`) ||
    right.startsWith(`${left}${path.sep}`)
  )
}

function reference(value, fields) {
  exactKeys(value, fields)
  artifactPath(value[fields[0]])
  sha(value[fields[1]])
}

/** Envelope validation precedes every external read; the runner verifies physical containment. */
export function validateIllustriousDpmFixture(fixture) {
  const imageFields = fixture?.mode === 'txt2img' ? [] : ['sourceImage']
  const outpaintFields = fixture?.mode === 'outpaint' ? ['lamaSource'] : []
  exactKeys(
    fixture,
    [
      'schemaVersion',
      'profile',
      'algorithm',
      'schedule',
      'mode',
      'case',
      'stage',
      'referenceFixture',
      'workerBaseline',
      'artifacts',
      ...imageFields,
      ...outpaintFields,
    ],
    ['baseline', 'mutation'],
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'illustrious-dpm')
  const plan = literalIllustriousDpmPlan(
    fixture.stage,
    fixture.algorithm,
    fixture.schedule,
    fixture.mode,
    fixture.case,
  )
  artifactPath(fixture.artifacts)
  reference(fixture.referenceFixture, ['path', 'sha256'])
  reference(fixture.workerBaseline, ['path', 'sha256'])
  const inputs = [fixture.referenceFixture.path, fixture.workerBaseline.path]
  if (fixture.mode !== 'txt2img') {
    exactKeys(fixture.sourceImage, ['path', 'sha256', 'byteSize', 'pixelSha256'])
    artifactPath(fixture.sourceImage.path)
    sha(fixture.sourceImage.sha256)
    sha(fixture.sourceImage.pixelSha256)
    assert.ok(
      Number.isSafeInteger(fixture.sourceImage.byteSize) &&
        fixture.sourceImage.byteSize > 0 &&
        fixture.sourceImage.byteSize <= 32 * 1024 * 1024,
    )
    inputs.push(fixture.sourceImage.path)
  }
  if (fixture.mode === 'outpaint') {
    exactKeys(fixture.lamaSource, ['path', 'sha256', 'byteSize'])
    artifactPath(fixture.lamaSource.path)
    assert.equal(fixture.lamaSource.sha256, lama.sha256)
    assert.equal(fixture.lamaSource.byteSize, lama.byteSize)
    inputs.push(fixture.lamaSource.path)
  }
  if (fixture.stage === 'baseline') {
    assert.equal(Object.hasOwn(fixture, 'baseline'), false)
    assert.equal(Object.hasOwn(fixture, 'mutation'), false)
  } else {
    assert.ok(fixture.baseline, 'Control/restored requires a pinned healthy same-case baseline.')
    reference(fixture.baseline, ['reportPath', 'reportSha256'])
    inputs.push(fixture.baseline.reportPath)
  }
  if (fixture.stage === 'control') {
    assert.ok(fixture.mutation, 'Control must declare one installed numerical source delta.')
    exactKeys(fixture.mutation, ['module', 'originalSha256', 'mutatedSha256'])
    assert.equal(fixture.mutation.module, 'inference.py')
    sha(fixture.mutation.originalSha256)
    sha(fixture.mutation.mutatedSha256)
    assert.notEqual(fixture.mutation.originalSha256, fixture.mutation.mutatedSha256)
  } else assert.equal(Object.hasOwn(fixture, 'mutation'), false)
  for (const source of inputs)
    assert.ok(
      !overlap(fixture.artifacts, source),
      'Evidence must not enclose or overwrite a source.',
    )
  return plan
}

/** One signed Fixed0 case, independent of production prompt expansion and inference output. */
export function literalIllustriousDpmPlan(stage, algorithm, schedule, mode, caseName) {
  assert.ok(['baseline', 'control', 'restored'].includes(stage), 'Unknown DPM qualification stage.')
  assert.ok(['txt2img', 'img2img', 'outpaint'].includes(mode), 'Unknown DPM generation mode.')
  assert.ok(['history', 'neighbor'].includes(caseName), 'Unknown DPM finite case.')
  const pair = illustriousDpmPair(algorithm, schedule)
  assert.ok(
    caseName !== 'neighbor' || mode === 'img2img',
    'The numerical neighbor is an opaque IMG case only.',
  )
  assert.ok(
    caseName !== 'neighbor' || stage !== 'restored',
    'The finite neighbor has baseline/control stages only.',
  )
  const strength =
    mode === 'txt2img'
      ? undefined
      : caseName === 'neighbor'
        ? algorithm === 'dpmpp_2m'
          ? 0.5
          : 0.05
        : 0.75
  const observedSteps =
    mode === 'txt2img'
      ? pair.txtObservedSteps
      : caseName === 'neighbor'
        ? pair.neighborObservedSteps
        : pair.historyObservedSteps
  const item = {
    promptPairIndex: 0,
    iteration: 0,
    seed: 0,
    requestedSeedPolicy: 'fixed',
    seedBehavior: 'per-iteration',
    objective: 'epsilon',
    algorithm,
    schedule,
    sampler: pair.sampler,
    invokeScheduler: pair.invokeScheduler,
    mode,
    case: caseName,
    steps: pair.steps,
    ...(strength === undefined ? {} : { denoisingStrength: strength }),
    prompts: { ...prompts },
  }
  return freeze({
    stage,
    algorithm,
    schedule,
    mode,
    case: caseName,
    objective: 'epsilon',
    modelKey: 'illustriousEpsilon',
    sampler: pair.sampler,
    invokeScheduler: pair.invokeScheduler,
    steps: pair.steps,
    observedSteps,
    ...(strength === undefined ? {} : { denoisingStrength: strength }),
    bbox: { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 },
    iterations: 1,
    maxPrompts: 1,
    seedBehavior: 'per-iteration',
    requestedSeedPolicy: 'fixed',
    fixedSeed: 0,
    baseSeed: 0,
    sourcePrompts: { ...prompts },
    items: [item],
    expectedCompletions: 1,
    expectedAdmissions: 1,
    expectedCanceled: 0,
  })
}

function assertExpectedItem(expected) {
  assert.deepEqual(
    expected,
    literalIllustriousDpmPlan(
      'baseline',
      expected?.algorithm,
      expected?.schedule,
      expected?.mode,
      expected?.case,
    ).items[0],
    'The expected item must be the complete independent finite EPS DPM case.',
  )
}

function selectedReference(fixture, key) {
  const source = fixture[key]
  const pinned = sources[key]
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: pinned.fileId,
    civitaiModelId: pinned.modelId,
    civitaiVersionId: pinned.versionId,
    displayName: source.name,
    fileSha256: source.sha256,
    kind: source.type,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    predictionType: pinned.trainedObjective ?? null,
    versionName: source.versionName,
  }
}

function workerFile(fixture, key) {
  const source = fixture[key]
  return { byteSize: source.byteSize, path: source.installed.managedPath, sha256: source.sha256 }
}

function assertInstalledSources(fixture) {
  absolute(fixture.appData)
  for (const [key, pinned] of Object.entries(sources)) {
    const source = fixture[key]
    assert.ok(source, `The exact ${key} descriptor is required.`)
    for (const field of ['byteSize', 'sha256', 'type']) assert.equal(source[field], pinned[field])
    assert.equal(source.family, 'illustrious')
    for (const field of ['name', 'versionName'])
      assert.ok(typeof source[field] === 'string' && source[field].trim())
    exactKeys(source.installed, ['resourceId', 'versionId', 'managedPath'])
    for (const field of ['resourceId', 'versionId'])
      assert.ok(typeof source.installed[field] === 'string' && source.installed[field].trim())
    assert.equal(
      source.installed.managedPath,
      path.join(fixture.appData, 'models', `qualified-${pinned.managedId}.safetensors`),
    )
    if (pinned.trainedObjective) {
      assert.equal(source.trainedObjective, pinned.trainedObjective)
      for (const field of ['modelId', 'versionId', 'fileId'])
        assert.equal(source.origin[field], pinned[field])
    }
  }
}

function noiseProfile() {
  return {
    schemaVersion: 1,
    baseSchedule: 'sdxl-scaled-linear-v1',
    rescaleBetasZeroSnr: false,
    timestepSpacing: 'leading',
  }
}

function sampling(expected, portable = false) {
  return {
    cfgRescale: 0,
    cfgScale: 4,
    invokeScheduler: expected.invokeScheduler,
    noiseProfile: noiseProfile(),
    requestedSeedPolicy: 'fixed',
    sampler: expected.sampler,
    scheduler: expected.schedule,
    ...(portable ? {} : { seed: 0 }),
    seedBehavior: 'per-iteration',
    steps: expected.steps,
    ...(expected.mode === 'txt2img' ? {} : { denoisingStrength: expected.denoisingStrength }),
  }
}

function assertConditioning(conditioning, target, bbox) {
  assert.deepEqual(conditioning, {
    bbox,
    infillResource: { ...lama },
    kind: 'alpha-outpaint-conditioning',
    policy: { ...policy },
    schemaVersion: 1,
    sourceTarget: {
      byteSize: target.byteSize,
      format: 'png',
      height: 256,
      iccSha256: icc,
      sha256: target.sha256,
      width: 256,
    },
    keepMask: {
      byteSize: 65536,
      format: 'alpha8',
      height: 256,
      polarity: 'keep',
      sha256: digest(literalAnimaHeunImageTargetAlpha()),
      width: 256,
    },
  })
}

export function assertIllustriousDpmFrozen(frozen, expected, fixture) {
  assertExpectedItem(expected)
  assertInstalledSources(fixture)
  exactKeys(frozen, ['schemaVersion', 'originRequestId', 'kind', 'context', 'workerJob'])
  assert.equal(frozen.schemaVersion, 1)
  assert.equal(frozen.kind, `illustrious-${expected.mode}`)
  assert.ok(typeof frozen.originRequestId === 'string' && frozen.originRequestId.length > 0)
  const { context, workerJob: job } = frozen
  exactKeys(context, [
    'schemaVersion',
    'kind',
    'documentId',
    'documentRevision',
    'bbox',
    'prompts',
    'sampling',
    'model',
    'loraStack',
    'loras',
    'embeddingRefs',
    'embeddings',
    'vae',
    'vaePrecision',
    'target',
    ...(expected.mode === 'outpaint' ? ['conditioning'] : []),
  ])
  exactKeys(job, [
    'schemaVersion',
    'bbox',
    'prompts',
    'sampling',
    'checkpoint',
    'loras',
    'vae',
    'vaePrecision',
    'target',
  ])
  assert.equal(context.schemaVersion, 1)
  assert.equal(job.schemaVersion, 1)
  assert.equal(context.kind, `normal-${expected.mode}-preparation`)
  for (const field of ['documentId', 'documentRevision'])
    assert.ok(typeof context[field] === 'string' && context[field].length > 0)
  const bbox = { x: expected.mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 }
  assert.deepEqual(context.bbox, bbox)
  assert.deepEqual(job.bbox, bbox)
  assert.deepEqual(context.prompts, prompts)
  assert.deepEqual(job.prompts, prompts)
  assert.deepEqual(context.sampling, sampling(expected))
  assert.deepEqual(job.sampling, {
    cfgRescale: 0,
    cfgScale: 4,
    noiseProfile: noiseProfile(),
    scheduler: expected.invokeScheduler,
    seed: 0,
    steps: expected.steps,
    ...(expected.mode === 'txt2img' ? {} : { denoisingStrength: expected.denoisingStrength }),
  })
  assert.deepEqual(context.model, {
    managedPath: fixture.illustriousEpsilon.installed.managedPath,
    reference: selectedReference(fixture, 'illustriousEpsilon'),
  })
  assert.deepEqual(job.checkpoint, {
    path: fixture.illustriousEpsilon.installed.managedPath,
    predictionType: 'epsilon',
    sha256: fixture.illustriousEpsilon.sha256,
  })
  const lora = selectedReference(fixture, 'illustriousLora')
  assert.deepEqual(context.loraStack, [{ enabled: true, resource: lora, weight: -0.5 }])
  assert.deepEqual(context.loras, [
    {
      byteSize: fixture.illustriousLora.byteSize,
      managedPath: fixture.illustriousLora.installed.managedPath,
      reference: lora,
      weight: -0.5,
    },
  ])
  assert.deepEqual(job.loras, [{ ...workerFile(fixture, 'illustriousLora'), weight: -0.5 }])
  assert.deepEqual(context.embeddingRefs, { positive: [], negative: [] })
  assert.deepEqual(context.embeddings, { positive: [], negative: [] })
  assert.deepEqual(context.vae, {
    byteSize: fixture.externalVaeNative.byteSize,
    managedPath: fixture.externalVaeNative.installed.managedPath,
    reference: selectedReference(fixture, 'externalVaeNative'),
  })
  assert.deepEqual(job.vae, workerFile(fixture, 'externalVaeNative'))
  assert.equal(context.vaePrecision, 'FP32')
  assert.equal(job.vaePrecision, 'FP32')
  exactKeys(context.target, [
    'byteSize',
    'colorSpace',
    'format',
    'height',
    'iccSha256',
    'sha256',
    'width',
  ])
  assert.equal(context.target.width, 256)
  assert.equal(context.target.height, 256)
  assert.equal(context.target.colorSpace, 'srgb')
  assert.equal(context.target.format, 'png')
  assert.equal(context.target.iccSha256, icc)
  sha(context.target.sha256)
  assert.ok(
    Number.isSafeInteger(context.target.byteSize) &&
      context.target.byteSize > 0 &&
      context.target.byteSize <= 32 * 1024 * 1024,
  )
  assert.deepEqual(job.target, {
    byteSize: context.target.byteSize,
    height: 256,
    iccSha256: icc,
    sha256: context.target.sha256,
    width: 256,
  })
  if (expected.mode === 'outpaint') assertConditioning(context.conditioning, context.target, bbox)
}

export function assertIllustriousDpmConfiguration(config, expected, fixture) {
  assertExpectedItem(expected)
  assertInstalledSources(fixture)
  const { cfgRescale: _rescale, ...portableSampling } = sampling(expected, true)
  assert.deepEqual(
    config,
    {
      cfgRescale: 0,
      loras: [
        { enabled: true, resource: selectedReference(fixture, 'illustriousLora'), weight: -0.5 },
      ],
      mode: expected.mode,
      model: selectedReference(fixture, 'illustriousEpsilon'),
      negativePrompt: { embeddingRefs: [], text: prompts.negative },
      positivePrompt: { embeddingRefs: [], text: prompts.positive },
      sampling: { actualSeed: 0, ...portableSampling },
      size: { height: 256, width: 256 },
      vae: selectedReference(fixture, 'externalVaeNative'),
      vaePrecision: 'FP32',
    },
    'Accepted configuration must preserve exact EPS/native sampler/schedule/strength/resources.',
  )
  const serialized = JSON.stringify(config)
  for (const key of Object.keys(sources)) {
    assert.equal(serialized.includes(fixture[key].installed.managedPath), false)
    if (fixture[key].path) assert.equal(serialized.includes(fixture[key].path), false)
  }
}

/** Retain all executed semantics; cross-Project replay omits only document identity/revision. */
export function normalizeIllustriousDpmNativeInputs(frozen) {
  assert.ok(
    ['illustrious-txt2img', 'illustrious-img2img', 'illustrious-outpaint'].includes(frozen?.kind),
  )
  const pair = illustriousDpmPairs.find(
    (candidate) => candidate.invokeScheduler === frozen?.workerJob?.sampling?.scheduler,
  )
  assert.ok(pair, 'Only the four declared native DPM keys may be normalized.')
  assert.equal(frozen.context?.sampling?.invokeScheduler, pair.invokeScheduler)
  assert.equal(frozen.context?.sampling?.sampler, pair.sampler)
  assert.equal(frozen.context?.sampling?.scheduler, pair.schedule)
  const normalized = structuredClone({
    kind: frozen.kind,
    context: frozen.context,
    workerJob: frozen.workerJob,
  })
  delete normalized.context.documentId
  delete normalized.context.documentRevision
  return normalized
}
