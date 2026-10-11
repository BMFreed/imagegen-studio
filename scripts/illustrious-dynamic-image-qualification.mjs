/** Independent finite EPS/V dynamic image oracle; no filesystem or native compiler calls. */
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
const positives = [
  'a (red:1.3) ceramic cup on a wooden table, studio photograph',
  'a (blue:1.3) ceramic cup on a wooden table, studio photograph',
]
const negatives = ['(blurry:0.7), low quality', '(noisy:0.7), low quality']
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
const baselineSourceKeys = Object.freeze([
  'scripts/illustrious-dynamic-image-qualification.mjs',
  'scripts/illustrious-dynamic-image-profile.mjs',
  'scripts/installed-dynamic-batch-driver.mjs',
  'scripts/qualification-resource-limits.mjs',
])

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
    'Dynamic image qualification paths must strictly descend from the owned artifact root.',
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
export function validateIllustriousDynamicImageFixture(fixture) {
  exactKeys(
    fixture,
    [
      'schemaVersion',
      'profile',
      'objective',
      'mode',
      'stage',
      'referenceFixture',
      'workerBaseline',
      'artifacts',
      'sourceImage',
      ...(fixture?.mode === 'outpaint' ? ['lamaSource'] : []),
    ],
    ['baseline', 'mutation', 'seedBehavior', 'baselineSourceSnapshots'],
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'illustrious-dynamic-image')
  const plan = literalIllustriousDynamicImagePlan(
    fixture.stage,
    fixture.objective,
    fixture.mode,
    fixture.seedBehavior,
  )
  if (Object.hasOwn(fixture, 'seedBehavior')) {
    assert.equal(fixture.seedBehavior, 'per-prompt')
    assert.equal(fixture.stage, 'baseline', 'The per-prompt extension admits healthy batches only.')
  }
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
  if (Object.hasOwn(fixture, 'baselineSourceSnapshots')) {
    assert.equal(fixture.stage, 'baseline')
    assert.equal(fixture.seedBehavior, 'per-prompt')
    exactKeys(fixture.baselineSourceSnapshots, baselineSourceKeys)
    for (const key of baselineSourceKeys) {
      reference(fixture.baselineSourceSnapshots[key], ['path', 'sha256'])
      inputs.push(fixture.baselineSourceSnapshots[key].path)
    }
  }
  if (fixture.mode === 'outpaint') {
    exactKeys(fixture.lamaSource, ['path', 'sha256', 'byteSize'])
    artifactPath(fixture.lamaSource.path)
    assert.equal(fixture.lamaSource.sha256, lama.sha256)
    assert.equal(fixture.lamaSource.byteSize, lama.byteSize)
    inputs.push(fixture.lamaSource.path)
  }
  if (fixture.stage === 'baseline' && plan.seedBehavior === 'per-iteration')
    assert.equal(Object.hasOwn(fixture, 'baseline'), false)
  else {
    assert.ok(
      fixture.baseline,
      'Control/restored and per-prompt require a pinned healthy same-input reference.',
    )
    reference(fixture.baseline, ['reportPath', 'reportSha256'])
    inputs.push(fixture.baseline.reportPath)
  }
  if (fixture.stage === 'control') {
    exactKeys(fixture.mutation, ['module', 'originalSha256', 'mutatedSha256'])
    assert.equal(fixture.mutation.module, 'inference.py')
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

/** Handwritten cartesian pairs and seeds; no production planner supplies expected output. */
export function literalIllustriousDynamicImagePlan(
  stage,
  objective,
  mode,
  seedBehavior = 'per-iteration',
) {
  assert.ok(['baseline', 'control', 'restored'].includes(stage))
  assert.ok(['epsilon', 'v_prediction'].includes(objective))
  assert.ok(['img2img', 'outpaint'].includes(mode))
  assert.ok(['per-iteration', 'per-prompt'].includes(seedBehavior))
  const sampler = objective === 'epsilon' ? 'Euler a' : 'Euler'
  const invokeScheduler = objective === 'epsilon' ? 'euler_a' : 'euler'
  const tuples =
    seedBehavior === 'per-iteration'
      ? [
          [0, 0, 0, 0, 0],
          [0, 1, 1, 0, 0],
          [1, 0, 0, 0, 1],
          [1, 1, 1, 0, 1],
          [2, 0, 0, 1, 0],
          [2, 1, 1, 1, 0],
          [3, 0, 0, 1, 1],
          [3, 1, 1, 1, 1],
        ]
      : [
          [0, 0, 0, 0, 0],
          [0, 1, 1, 0, 0],
          [1, 0, 2, 0, 1],
          [1, 1, 3, 0, 1],
          [2, 0, 4, 1, 0],
          [2, 1, 5, 1, 0],
          [3, 0, 6, 1, 1],
          [3, 1, 7, 1, 1],
        ]
  const selected = stage === 'baseline' ? tuples : tuples.slice(0, 2)
  const items = selected.map(([promptPairIndex, iteration, seed, positive, negative]) => ({
    promptPairIndex,
    iteration,
    seed,
    requestedSeedPolicy: 'fixed',
    seedBehavior,
    objective,
    mode,
    sampler,
    invokeScheduler,
    schedule: 'Normal',
    steps: 3,
    denoisingStrength: 0.5,
    prompts: { positive: positives[positive], negative: negatives[negative] },
  }))
  return freeze({
    stage,
    objective,
    mode,
    modelKey: objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious',
    sampler,
    invokeScheduler,
    steps: 3,
    observedSteps: 2,
    denoisingStrength: 0.5,
    bbox: { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 },
    iterations: 2,
    maxPrompts: stage === 'baseline' ? 4 : 1,
    seedBehavior,
    requestedSeedPolicy: 'fixed',
    fixedSeed: 0,
    baseSeed: 0,
    sourcePrompts: {
      positive: 'a {(red:1.3)|(blue:1.3)} ceramic cup on a wooden table, studio photograph',
      negative: '{(blurry:0.7)|(noisy:0.7)}, low quality',
    },
    items,
    expectedCompletions: items.length,
    expectedAdmissions: items.length,
    expectedCanceled: 0,
  })
}
function assertExpectedItem(expected) {
  const possibilities = literalIllustriousDynamicImagePlan(
    'baseline',
    expected?.objective,
    expected?.mode,
    expected?.seedBehavior,
  ).items
  const item = possibilities.find(
    (value) =>
      value.promptPairIndex === expected.promptPairIndex && value.iteration === expected.iteration,
  )
  assert.ok(item, 'An exact literal prompt/iteration/seed tuple is required.')
  assert.deepEqual(expected, item)
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
    ...(portable ? {} : { seed: expected.seed }),
    seedBehavior: expected.seedBehavior,
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

export function assertIllustriousDynamicImageFrozen(frozen, expected, fixture) {
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
    seed: expected.seed,
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
  const stack = expectedIllustriousDynamicImageLoraStack(fixture)
  assert.deepEqual(
    context.loraStack,
    stack,
    'Dynamic expansion cannot change frozen resources or source-bound weights.',
  )
  const active = stack.filter(({ enabled }) => enabled)
  const keyFor = (resource) => {
    assert.equal(resource.fileSha256, sources.illustriousLora.sha256)
    return 'illustriousLora'
  }
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
    'Frozen signed LoRA must retain the exact source and weight.',
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

export function assertIllustriousDynamicImageConfiguration(config, expected, fixture) {
  assertExpectedItem(expected)
  assertInstalledSources(fixture, expected.objective)
  const checkpointKey = expected.objective === 'v_prediction' ? 'illustrious' : 'illustriousEpsilon'
  const { cfgRescale: _rescale, ...portableSampling } = sampling(expected, true)
  assert.deepEqual(
    config,
    {
      cfgRescale: 0,
      loras: expectedIllustriousDynamicImageLoraStack(fixture),
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
      sampling: { actualSeed: expected.seed, ...portableSampling },
      size: { height: 256, width: 256 },
      vae: selectedReference(fixture, 'externalVaeNative'),
      vaePrecision: 'FP32',
    },
    'Accepted configuration must preserve its concrete dynamic pair, actual seed and all frozen image inputs.',
  )
  const serialized = JSON.stringify(config)
  for (const key of [checkpointKey, 'illustriousLora', 'externalVaeNative']) {
    assert.equal(serialized.includes(fixture[key].installed.managedPath), false)
    if (fixture[key].path) assert.equal(serialized.includes(fixture[key].path), false)
  }
}

/** Retain all executed semantics; cross-Project replay omits only document identity/revision. */
export function normalizeIllustriousDynamicImageNativeInputs(frozen) {
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

/** Same executed first-pair inputs; only the explicitly changed authoring metadata is omitted. */
export function normalizeIllustriousDynamicImageReferenceInputs(frozen, { fixture } = {}) {
  const normalized = normalizeIllustriousDynamicImageNativeInputs(frozen)
  if (fixture?.seedBehavior === 'per-prompt') delete normalized.context.sampling.seedBehavior
  return normalized
}

/** Only frozen qualification helpers may differ from the earlier healthy producer-bound report. */
export function expectedIllustriousDynamicImageBaselineSourceChanges(fixture) {
  return fixture?.seedBehavior === 'per-prompt' ? [...baselineSourceKeys] : []
}

/** Exact signed single-LoRA precondition, independent from current authoring edits. */
export function expectedIllustriousDynamicImageLoraStack(fixture) {
  assertExactSources(fixture, ['illustriousLora'])
  return freeze([
    { enabled: true, resource: selectedReference(fixture, 'illustriousLora'), weight: -0.5 },
  ])
}

/** All saved pixels, in bottom-to-top document order; raw Pillow equality is checked separately. */
export function assertIllustriousDynamicImageSavedPixels({ source, contributions, preview, mode }) {
  assert.ok(['img2img', 'outpaint'].includes(mode))
  assert.ok([2, 8].includes(contributions.length))
  const width = mode === 'outpaint' ? 320 : 256
  assert.equal(source.width, 256)
  assert.equal(source.height, 256)
  assert.equal(source.rgba.length, 256 * 256 * 4)
  assert.equal(preview.width, width)
  assert.equal(preview.height, 256)
  assert.equal(preview.rgba.length, width * 256 * 4)
  const expected = Buffer.alloc(width * 256 * 4)
  const partial = new Uint8Array(width * 256)
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const from = (y * 256 + x) * 4
      const to = (y * width + x) * 4
      assert.equal(source.rgba[from + 3], 255)
      for (let c = 0; c < 4; c++) expected[to + c] = source.rgba[from + c]
    }
  for (const contribution of contributions) {
    assert.equal(contribution.width, 256)
    assert.equal(contribution.height, 256)
    assert.equal(contribution.rgba.length, 256 * 256 * 4)
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const from = (y * 256 + x) * 4
        const to = (y * width + x + (mode === 'outpaint' ? 64 : 0)) * 4
        const alpha = contribution.rgba[from + 3]
        if (alpha === 0) continue
        if (alpha !== 255) {
          assert.equal(expected[to + 3], 255, 'Soft contribution has an opaque source backdrop.')
          partial[to / 4] = 1
        }
        for (let c = 0; c < 3; c++)
          expected[to + c] =
            alpha === 255
              ? contribution.rgba[from + c]
              : Math.round(
                  (contribution.rgba[from + c] * alpha + expected[to + c] * (255 - alpha)) / 255,
                )
        expected[to + 3] = 255
      }
  }
  let softPixels = 0
  for (let pixel = 0; pixel < width * 256; pixel++) {
    const at = pixel * 4
    assert.equal(expected[at + 3], 255)
    assert.equal(preview.rgba[at + 3], 255, 'Every saved preview alpha is exact.')
    if (partial[pixel]) softPixels++
    const tolerance = partial[pixel] ? contributions.length : 0
    for (let c = 0; c < 3; c++)
      assert.ok(
        Math.abs(preview.rgba[at + c] - expected[at + c]) <= tolerance,
        `Saved composition RGB differs at pixel ${pixel}, channel ${c}.`,
      )
  }
  assert.equal(softPixels, mode === 'outpaint' ? 15 * 256 : 0)
  return {
    width,
    height: 256,
    allBrowserPixelsChecked: width * 256,
    protectedPixels: mode === 'outpaint' ? 217 * 256 : 0,
    softPixels,
    browserSoftRgbTolerance: mode === 'outpaint' ? contributions.length : 0,
    exactRawPillowClaim: false,
  }
}

/** Common image inputs and independent visible sensitivity for each dynamic axis. */
export function assertIllustriousDynamicImagePixels(generations, plan) {
  assert.equal(generations.length, plan.expectedCompletions)
  const common = generations.map(({ frozen }) => {
    const value = normalizeIllustriousDynamicImageNativeInputs(frozen)
    delete value.context.prompts
    delete value.workerJob.prompts
    delete value.context.sampling.seed
    delete value.workerJob.sampling.seed
    return value
  })
  for (const [index, generation] of generations.entries()) {
    assert.deepEqual(generation.expectedItem, plan.items[index])
    assert.deepEqual(
      common[index],
      common[0],
      'Every batch item uses the same frozen image target/resources.',
    )
    assert.equal(generation.rgba.length, 256 * 256 * 4)
    if (plan.seedBehavior === 'per-prompt')
      for (let at = 3; at < generation.rgba.length; at += 4)
        assert.equal(
          generation.rgba[at],
          generations[0].rgba[at],
          'Dynamic changes cannot alter contribution alpha.',
        )
  }
  const visibleDifference = (left, right) => {
    let changed = 0
    for (let pixel = 0; pixel < 65536; pixel++) {
      const at = pixel * 4
      assert.equal(
        left.rgba[at + 3],
        right.rgba[at + 3],
        'Dynamic changes cannot alter contribution alpha.',
      )
      if (left.rgba[at + 3] && [0, 1, 2].some((c) => left.rgba[at + c] !== right.rgba[at + c]))
        changed++
    }
    assert.ok(
      changed > 0,
      'A declared dynamic axis must change visible RGB, not only hidden pixels.',
    )
    return changed
  }
  // These finite, selected inputs must remain distinguishable; this is not a universal prompt law.
  const evidence = {
    iterationSeed: [],
    positiveAlternatives: [],
    negativeAlternatives: [],
    combinedAlternatives: [],
    pairwiseDistinct: plan.stage === 'baseline' && plan.seedBehavior === 'per-iteration',
  }
  for (let pair = 0; pair < (plan.stage === 'baseline' ? 4 : 1); pair++)
    evidence.iterationSeed.push(visibleDifference(generations[pair * 2], generations[pair * 2 + 1]))
  // Per-prompt changes the seed between pairs. Those contrasts cannot isolate a prompt effect.
  if (plan.stage === 'baseline' && plan.seedBehavior === 'per-iteration')
    for (let seed = 0; seed < 2; seed++) {
      evidence.positiveAlternatives.push(
        visibleDifference(generations[seed], generations[4 + seed]),
        visibleDifference(generations[2 + seed], generations[6 + seed]),
      )
      evidence.negativeAlternatives.push(
        visibleDifference(generations[seed], generations[2 + seed]),
        visibleDifference(generations[4 + seed], generations[6 + seed]),
      )
      evidence.combinedAlternatives.push(
        visibleDifference(generations[seed], generations[6 + seed]),
        visibleDifference(generations[2 + seed], generations[4 + seed]),
      )
    }
  return evidence
}
