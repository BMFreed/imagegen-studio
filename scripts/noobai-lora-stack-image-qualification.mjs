/** Independent finite EPS/V multiple-LoRA image oracle; no filesystem or native compiler calls. */
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
  illustrious: {
    byteSize: 6938040794,
    sha256: 'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
    type: 'checkpoint',
    managedId: 700040,
    modelId: 1147756,
    versionId: 2679856,
    fileId: 2566634,
    trainedObjective: 'v_prediction',
  },
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
  illustriousLoraSecond: {
    byteSize: 171540060,
    sha256: '90f9f879ff2e27fcaec5723a2c3e5db53ec5ffbdd4c7df49159c0ccbfe63b1ca',
    type: 'lora',
    managedId: 700150,
    modelId: 1795307,
    versionId: 2031703,
    fileId: 1934353,
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
  positive: 'a red ceramic cup on a wooden table, studio photograph',
  negative: 'blurry, low quality',
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
    'LoRA image qualification paths must strictly descend from the owned artifact root.',
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

/** Strict finite image envelope; every rejection precedes fixture/native reads. */
export function validateNoobaiLoraStackImageFixture(fixture) {
  exactKeys(
    fixture,
    [
      'schemaVersion',
      'profile',
      'objective',
      'mode',
      'case',
      'stage',
      'referenceFixture',
      'workerBaseline',
      'artifacts',
      'sourceImage',
      ...(fixture?.mode === 'outpaint' ? ['lamaSource'] : []),
    ],
    ['baseline', 'mutation'],
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'noobai-lora-stack-image')
  const plan = literalNoobaiLoraStackImagePlan(
    fixture.stage,
    fixture.objective,
    fixture.mode,
    fixture.case,
  )
  artifactPath(fixture.artifacts)
  reference(fixture.referenceFixture, ['path', 'sha256'])
  reference(fixture.workerBaseline, ['path', 'sha256'])
  exactKeys(fixture.sourceImage, ['path', 'sha256', 'byteSize', 'pixelSha256'])
  artifactPath(fixture.sourceImage.path)
  sha(fixture.sourceImage.sha256)
  sha(fixture.sourceImage.pixelSha256)
  assert.ok(
    Number.isSafeInteger(fixture.sourceImage.byteSize) &&
      fixture.sourceImage.byteSize > 0 &&
      fixture.sourceImage.byteSize <= 32 * 1024 * 1024,
  )
  const inputs = [
    fixture.referenceFixture.path,
    fixture.workerBaseline.path,
    fixture.sourceImage.path,
  ]
  if (fixture.mode === 'outpaint') {
    exactKeys(fixture.lamaSource, ['path', 'sha256', 'byteSize'])
    artifactPath(fixture.lamaSource.path)
    assert.equal(fixture.lamaSource.sha256, lama.sha256)
    assert.equal(fixture.lamaSource.byteSize, lama.byteSize)
    inputs.push(fixture.lamaSource.path)
  }
  if (fixture.stage === 'baseline') assert.equal(Object.hasOwn(fixture, 'baseline'), false)
  else {
    assert.ok(fixture.baseline, 'Control/restored requires a healthy same-input baseline.')
    reference(fixture.baseline, ['reportPath', 'reportSha256'])
    inputs.push(fixture.baseline.reportPath)
  }
  if (fixture.stage === 'control') {
    exactKeys(fixture.mutation, ['module', 'originalSha256', 'mutatedSha256'])
    assert.equal(fixture.mutation.module, 'inference_lora.py')
    sha(fixture.mutation.originalSha256)
    sha(fixture.mutation.mutatedSha256)
    assert.notEqual(fixture.mutation.originalSha256, fixture.mutation.mutatedSha256)
  } else assert.equal(Object.hasOwn(fixture, 'mutation'), false)
  for (const input of inputs)
    assert.ok(
      !overlap(fixture.artifacts, input),
      'Evidence cannot enclose or overwrite its inputs.',
    )
  return plan
}

/** EPS/V × IMG/OUT × AB/BA/B-zero/B-disabled; one installed EPS cycle is declared. */
export function literalNoobaiLoraStackImagePlan(stage, objective, mode, caseName) {
  assert.ok(['baseline', 'control', 'restored'].includes(stage))
  assert.ok(['epsilon', 'v_prediction'].includes(objective))
  assert.ok(['img2img', 'outpaint'].includes(mode))
  assert.ok(['ab', 'ba', 'b-zero', 'b-disabled'].includes(caseName))
  if (stage !== 'baseline') {
    assert.equal(
      objective,
      'epsilon',
      'Only EPS installed source-bound weight controls are declared.',
    )
    assert.ok(['ab', 'b-disabled'].includes(caseName))
    if (stage === 'restored') assert.equal(caseName, 'ab')
  }
  const sampler = objective === 'epsilon' ? 'Euler a' : 'Euler'
  const invokeScheduler = objective === 'epsilon' ? 'euler_a' : 'euler'
  const concrete = { ...prompts }
  const item = {
    promptPairIndex: 0,
    iteration: 0,
    seed: 0,
    requestedSeedPolicy: 'fixed',
    seedBehavior: 'per-iteration',
    objective,
    mode,
    case: caseName,
    sampler,
    invokeScheduler,
    schedule: 'Normal',
    steps: 3,
    denoisingStrength: 0.5,
    prompts: concrete,
  }
  return freeze({
    stage,
    objective,
    mode,
    case: caseName,
    modelKey: objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious',
    sampler,
    invokeScheduler,
    steps: 3,
    observedSteps: 2,
    denoisingStrength: 0.5,
    bbox: { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 },
    iterations: 1,
    maxPrompts: 1,
    seedBehavior: 'per-iteration',
    requestedSeedPolicy: 'fixed',
    fixedSeed: 0,
    baseSeed: 0,
    sourcePrompts: concrete,
    items: [item],
    expectedCompletions: 1,
    expectedAdmissions: 1,
    expectedCanceled: 0,
  })
}
function assertExpectedItem(expected) {
  assert.deepEqual(
    expected,
    literalNoobaiLoraStackImagePlan('baseline', expected?.objective, expected?.mode, expected?.case)
      .items[0],
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

function assertExactSources(fixture, keys) {
  absolute(fixture.appData)
  for (const key of keys) {
    const pinned = sources[key]
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
    if (key === 'illustriousLoraSecond') {
      assert.equal(source.name, 'Lineless Digital Painting')
      assert.equal(source.versionName, 'Lineless Digital Painting Style')
      assert.deepEqual(source.origin, {
        kind: 'civitai-trained',
        modelId: 1795307,
        versionId: 2031703,
        fileId: 1934353,
        url: 'https://civitai.com/api/download/models/2031703?fileId=1934353',
        creator: 'Underdorks',
        creditRequired: true,
      })
    }
    if (pinned.trainedObjective) {
      assert.equal(source.trainedObjective, pinned.trainedObjective)
      for (const field of ['modelId', 'versionId', 'fileId'])
        assert.equal(source.origin[field], pinned[field])
    }
  }
}

function assertInstalledSources(fixture, objective) {
  assertExactSources(fixture, [
    objective === 'v_prediction' ? 'illustrious' : 'illustriousEpsilon',
    'illustriousLora',
    'externalVaeNative',
    'illustriousLoraSecond',
  ])
}

function noiseProfile(objective) {
  return {
    schemaVersion: 1,
    baseSchedule: 'sdxl-scaled-linear-v1',
    rescaleBetasZeroSnr: objective === 'v_prediction',
    timestepSpacing: 'leading',
  }
}

function sampling(expected, portable = false) {
  return {
    cfgRescale: 0,
    cfgScale: 5,
    invokeScheduler: expected.invokeScheduler,
    noiseProfile: noiseProfile(expected.objective),
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

export function assertNoobaiLoraStackImageFrozen(frozen, expected, fixture) {
  assertExpectedItem(expected)
  assertInstalledSources(fixture, expected.objective)
  const checkpointKey = expected.objective === 'v_prediction' ? 'illustrious' : 'illustriousEpsilon'
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
  assert.deepEqual(context.prompts, expected.prompts)
  assert.deepEqual(job.prompts, expected.prompts)
  assert.deepEqual(context.sampling, sampling(expected))
  assert.deepEqual(job.sampling, {
    cfgRescale: 0,
    cfgScale: 5,
    noiseProfile: noiseProfile(expected.objective),
    scheduler: expected.invokeScheduler,
    seed: 0,
    steps: expected.steps,
    ...(expected.mode === 'txt2img' ? {} : { denoisingStrength: expected.denoisingStrength }),
  })
  assert.deepEqual(context.model, {
    managedPath: fixture[checkpointKey].installed.managedPath,
    reference: selectedReference(fixture, checkpointKey),
  })
  assert.deepEqual(job.checkpoint, {
    path: fixture[checkpointKey].installed.managedPath,
    predictionType: expected.objective,
    sha256: fixture[checkpointKey].sha256,
  })
  const stack = expectedNoobaiImageLoraStack(fixture, expected.case)
  assert.deepEqual(
    context.loraStack,
    stack,
    'Configured resource identities, source-bound weights and order must be exact.',
  )
  const active = stack.filter(({ enabled }) => enabled)
  const keyFor = (resource) =>
    resource.fileSha256 === sources.illustriousLora.sha256
      ? 'illustriousLora'
      : 'illustriousLoraSecond'
  assert.deepEqual(
    context.loras,
    active.map(({ resource, weight }) => {
      const source = fixture[keyFor(resource)]
      return {
        byteSize: source.byteSize,
        managedPath: source.installed.managedPath,
        reference: resource,
        weight,
      }
    }),
    'Effective ordered subset must include enabled zero and exclude disabled B.',
  )
  assert.deepEqual(
    job.loras,
    active.map(({ resource, weight }) => ({
      ...workerFile(fixture, keyFor(resource)),
      weight,
    })),
    'Worker source-to-weight association and order must remain exact.',
  )
  assert.deepEqual(context.embeddingRefs, { positive: [], negative: [] })
  assert.deepEqual(context.embeddings, { positive: [], negative: [] })
  assert.equal(Object.hasOwn(job, 'embeddings'), false, 'Ordinary wire input omits embeddings.')
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

export function assertNoobaiLoraStackImageConfiguration(config, expected, fixture) {
  assertExpectedItem(expected)
  assertInstalledSources(fixture, expected.objective)
  const checkpointKey = expected.objective === 'v_prediction' ? 'illustrious' : 'illustriousEpsilon'
  const { cfgRescale: _rescale, ...portableSampling } = sampling(expected, true)
  assert.deepEqual(
    config,
    {
      cfgRescale: 0,
      loras: expectedNoobaiImageLoraStack(fixture, expected.case),
      mode: expected.mode,
      model: selectedReference(fixture, checkpointKey),
      negativePrompt: {
        embeddingRefs: [],
        text: expected.prompts.negative,
      },
      positivePrompt: {
        embeddingRefs: [],
        text: expected.prompts.positive,
      },
      sampling: { actualSeed: 0, ...portableSampling },
      size: { height: 256, width: 256 },
      vae: selectedReference(fixture, 'externalVaeNative'),
      vaePrecision: 'FP32',
    },
    'Accepted configuration must preserve ordered configured source/weight tuples and every image input.',
  )
  const serialized = JSON.stringify(config)
  for (const key of [
    checkpointKey,
    'illustriousLora',
    'externalVaeNative',
    'illustriousLoraSecond',
  ]) {
    assert.equal(serialized.includes(fixture[key].installed.managedPath), false)
    if (fixture[key].path) assert.equal(serialized.includes(fixture[key].path), false)
  }
}

/** Retain all executed semantics; cross-Project replay omits only document identity/revision. */
export function normalizeNoobaiLoraStackImageNativeInputs(frozen) {
  assert.ok(['illustrious-img2img', 'illustrious-outpaint'].includes(frozen?.kind))
  assert.ok(['euler', 'euler_a'].includes(frozen?.workerJob?.sampling?.scheduler))
  assert.equal(frozen.context?.sampling?.invokeScheduler, frozen.workerJob.sampling.scheduler)
  assert.equal(
    frozen.context?.sampling?.sampler,
    frozen.workerJob.sampling.scheduler === 'euler' ? 'Euler' : 'Euler a',
  )
  assert.equal(frozen.context?.sampling?.scheduler, 'Normal')
  const normalized = structuredClone({
    kind: frozen.kind,
    context: frozen.context,
    workerJob: frozen.workerJob,
  })
  delete normalized.context.documentId
  delete normalized.context.documentRevision
  return normalized
}

/** Two distinct exact trained sources; zero and disabled keep their authored tuple. */
export function expectedNoobaiImageLoraStack(fixture, choice) {
  assert.ok(['ab', 'ba', 'b-zero', 'b-disabled'].includes(choice))
  assertExactSources(fixture, ['illustriousLora', 'illustriousLoraSecond'])
  const first = {
    enabled: true,
    resource: selectedReference(fixture, 'illustriousLora'),
    weight: -0.5,
  }
  const second = {
    enabled: choice !== 'b-disabled',
    resource: selectedReference(fixture, 'illustriousLoraSecond'),
    weight: choice === 'b-zero' ? 0 : 0.75,
  }
  assert.notEqual(first.resource.localModelId, second.resource.localModelId)
  assert.notEqual(first.resource.localVersionId, second.resource.localVersionId)
  return freeze(choice === 'ba' ? [second, first] : [first, second])
}

/** Preserve target/bbox/prompts/all settings, reducing only the separately checked stack axis. */
export function normalizeNoobaiLoraStackImageAxis(frozen, expected, fixture) {
  assertNoobaiLoraStackImageFrozen(frozen, expected, fixture)
  const copy = normalizeNoobaiLoraStackImageNativeInputs(frozen)
  const first = expectedNoobaiImageLoraStack(fixture, 'ab')[0]
  copy.context.loraStack = [first]
  copy.context.loras = [
    {
      byteSize: fixture.illustriousLora.byteSize,
      managedPath: fixture.illustriousLora.installed.managedPath,
      reference: first.resource,
      weight: first.weight,
    },
  ]
  copy.workerJob.loras = [{ ...workerFile(fixture, 'illustriousLora'), weight: first.weight }]
  return copy
}

/** Full decoded output relation; AB/BA order is recorded without assuming pixel inequality. */
export function assertNoobaiLoraStackImagePixels(cases, fixture) {
  assert.deepEqual(
    cases.map(({ expectedItem }) => expectedItem.case),
    ['ab', 'ba', 'b-zero', 'b-disabled'],
  )
  const normalized = cases.map(({ frozen, expectedItem }) =>
    normalizeNoobaiLoraStackImageAxis(frozen, expectedItem, fixture),
  )
  for (const [index, entry] of cases.entries()) {
    assert.equal(entry.dimensions.width, 256)
    assert.equal(entry.dimensions.height, 256)
    sha(entry.dimensions.pixelSha256)
    if (index)
      assert.deepEqual(
        normalized[index],
        normalized[0],
        'Only the declared stack may differ, including exact common target and geometry.',
      )
  }
  assert.equal(
    cases[2].dimensions.pixelSha256,
    cases[3].dimensions.pixelSha256,
    'Enabled zero-weight B and disabled B must have identical complete RGBA.',
  )
  for (const index of [0, 1])
    assert.notEqual(
      cases[index].dimensions.pixelSha256,
      cases[2].dimensions.pixelSha256,
      'Nonzero trained B must change complete RGBA.',
    )
  return {
    enabledZeroEqualsDisabled: true,
    trainedSecondChangesPixels: true,
    abBaPixelRelationRequired: false,
  }
}
