/** Independent finite ER-SDE oracle; no filesystem, worker or production compiler calls. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'

const artifactRoot = path.join(homedir(), '.codex/artifacts/imagegen-studio')
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const sources = {
  encoder: {
    byteSize: 1192135096,
    sha256: 'cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba',
    type: 'qwen3_encoder',
    managedId: 700010,
  },
  vae: {
    byteSize: 253806246,
    sha256: 'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f',
    type: 'vae',
    managedId: 700020,
  },
  anima: {
    byteSize: 4182275752,
    sha256: '0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941',
    type: 'checkpoint',
    managedId: 700030,
    modelId: 1147756,
    versionId: 3120487,
    fileId: 3000817,
  },
  animaLora: {
    byteSize: 138663759,
    sha256: 'cd9639b03d4458323e696e3792ff7535ae03f9f70368d6d0dc17fe86fa4f354f',
    type: 'lora',
    managedId: 700050,
    modelId: 599757,
    versionId: 3084665,
    fileId: 2964030,
  },
}

const positivePrompts = [
  'a (red:1.3) ceramic cup on a wooden table, studio photograph',
  'a (blue:1.3) ceramic cup on a wooden table, studio photograph',
]
const negativePrompts = ['(blurry:0.7), low quality', '(noisy:0.7), low quality']
const positiveCompiled = [
  {
    version: 'anima-prompt-weighting-v1',
    cleanedText: 'a red ceramic cup on a wooden table, studio photograph',
    spans: [
      { start: 0, end: 2, weight: 1 },
      { start: 2, end: 5, weight: 1.3 },
      { start: 5, end: 54, weight: 1 },
    ],
  },
  {
    version: 'anima-prompt-weighting-v1',
    cleanedText: 'a blue ceramic cup on a wooden table, studio photograph',
    spans: [
      { start: 0, end: 2, weight: 1 },
      { start: 2, end: 6, weight: 1.3 },
      { start: 6, end: 55, weight: 1 },
    ],
  },
]
const negativeCompiled = [
  {
    version: 'anima-prompt-weighting-v1',
    cleanedText: 'blurry, low quality',
    spans: [
      { start: 0, end: 6, weight: 0.7 },
      { start: 6, end: 19, weight: 1 },
    ],
  },
  {
    version: 'anima-prompt-weighting-v1',
    cleanedText: 'noisy, low quality',
    spans: [
      { start: 0, end: 5, weight: 0.7 },
      { start: 5, end: 18, weight: 1 },
    ],
  },
]

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
    'Dynamic qualification paths must strictly descend from the owned artifact root.',
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

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

/** Exact finite ER-SDE envelope before external reads; Main owns physical path checks. */
export function validateAnimaErSdeFixture(fixture) {
  exactKeys(
    fixture,
    [
      'schemaVersion',
      'profile',
      'stage',
      'steps',
      'referenceFixture',
      'workerBaseline',
      'artifacts',
    ],
    ['baseline', 'mutation'],
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'anima-er-sde')
  const plan = literalAnimaErSdePlan(fixture.stage, fixture.steps)
  artifactPath(fixture.artifacts)
  reference(fixture.referenceFixture, ['path', 'sha256'])
  reference(fixture.workerBaseline, ['path', 'sha256'])
  for (const source of [fixture.referenceFixture.path, fixture.workerBaseline.path])
    assert.ok(!overlap(fixture.artifacts, source), 'Evidence must not enclose a source fixture.')
  if (fixture.stage === 'baseline') {
    assert.equal(Object.hasOwn(fixture, 'baseline'), false)
    assert.equal(Object.hasOwn(fixture, 'mutation'), false)
  } else {
    assert.ok(fixture.baseline, 'Restored/control requires a pinned same-step healthy baseline.')
    reference(fixture.baseline, ['reportPath', 'reportSha256'])
    assert.ok(!overlap(fixture.artifacts, fixture.baseline.reportPath))
  }
  if (fixture.stage === 'control') {
    assert.ok(fixture.mutation, 'Control must declare its one installed scheduler source delta.')
    exactKeys(fixture.mutation, ['module', 'originalSha256', 'mutatedSha256'])
    assert.equal(fixture.mutation.module, 'vendor/er_sde_scheduler.py')
    sha(fixture.mutation.originalSha256)
    sha(fixture.mutation.mutatedSha256)
    assert.notEqual(fixture.mutation.originalSha256, fixture.mutation.mutatedSha256)
  } else assert.equal(Object.hasOwn(fixture, 'mutation'), false)
  return plan
}

/** One independently authored ordinary signed case. No dynamic source expansion or RNG. */
export function literalAnimaErSdePlan(stage, steps) {
  assert.ok(['baseline', 'restored', 'control'].includes(stage), 'Unknown ER-SDE stage.')
  assert.ok([3, 5].includes(steps), 'Only the three/five-step ER-SDE cases are qualified.')
  const item = {
    promptPairIndex: 0,
    iteration: 0,
    seed: 0,
    requestedSeedPolicy: 'fixed',
    seedBehavior: 'per-iteration',
    animaMethod: 'er_sde',
    steps,
    prompts: { positive: positivePrompts[0], negative: negativePrompts[0] },
    compiledPrompts: {
      positive: structuredClone(positiveCompiled[0]),
      negative: structuredClone(negativeCompiled[0]),
    },
  }
  return freeze({
    stage,
    steps,
    modelKey: 'anima',
    animaMethod: 'er_sde',
    iterations: 1,
    maxPrompts: 1,
    seedBehavior: 'per-iteration',
    requestedSeedPolicy: 'fixed',
    fixedSeed: 0,
    baseSeed: 0,
    sourcePrompts: { ...item.prompts },
    items: [item],
    expectedCompletions: 1,
    expectedAdmissions: 1,
    expectedCanceled: 0,
  })
}

function selectedReference(fixture, key) {
  const source = fixture[key]
  const pinned = sources[key]
  return {
    baseModelFamily: 'anima',
    civitaiFileId: pinned.fileId,
    civitaiModelId: pinned.modelId,
    civitaiVersionId: pinned.versionId,
    displayName: source.name,
    fileSha256: source.sha256,
    kind: source.type,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    predictionType: null,
    versionName: source.versionName,
  }
}

function component(fixture, key, portable = false) {
  const source = fixture[key]
  return {
    byteSize: source.byteSize,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    ...(portable ? {} : { managedPath: source.installed.managedPath }),
    sha256: source.sha256,
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
    assert.equal(source.family, 'anima')
    for (const field of ['name', 'versionName'])
      assert.ok(typeof source[field] === 'string' && source[field].trim())
    exactKeys(source.installed, ['resourceId', 'versionId', 'managedPath'])
    for (const field of ['resourceId', 'versionId'])
      assert.ok(typeof source.installed[field] === 'string' && source.installed[field].trim())
    assert.equal(
      source.installed.managedPath,
      path.join(fixture.appData, 'models', `qualified-${pinned.managedId}.safetensors`),
    )
    if (pinned.modelId) {
      for (const field of ['modelId', 'versionId', 'fileId'])
        assert.equal(source.origin[field], pinned[field])
    }
  }
}

// Independently written float32 shift-three grids: sigma fractions at N5 are
// 1,12/13,9/11,2/3,3/7,0. Model timesteps are separately rounded float32 products.
export function literalAnimaErSdeNativePlan(steps) {
  assert.ok([3, 5].includes(steps), 'Only the three/five-step ER-SDE grids are qualified.')
  return freeze({
    beginIndex: 0,
    guidanceScale: 4,
    height: 256,
    initialSigma: 1,
    mode: 'txt2img',
    posteriorSeed: null,
    scheduler: 'er_sde',
    seed: 0,
    sigmas:
      steps === 3
        ? [1, 0.8571428656578064, 0.6000000238418579, 0]
        : [1, 0.9230769276618958, 0.8181818127632141, 0.6666666865348816, 0.4285714328289032, 0],
    startStep: 0,
    steps,
    stepSeed: 0,
    strength: null,
    timesteps:
      steps === 3
        ? [1000, 857.1428833007812, 600]
        : [1000, 923.076904296875, 818.1818237304688, 666.6666870117188, 428.5714416503906],
    totalSteps: steps,
    version: 'anima-flow-denoising-v1',
    width: 256,
  })
}

function assertExpectedItem(expected) {
  assert.ok(expected && typeof expected === 'object')
  assert.deepEqual(
    expected,
    literalAnimaErSdePlan('baseline', expected.steps).items[0],
    'The expected ER-SDE item must match the complete independent literal case.',
  )
}

export function assertAnimaErSdeFrozen(frozen, expectedItem, fixture) {
  assertInstalledSources(fixture)
  assertExpectedItem(expectedItem)
  exactKeys(frozen, ['schemaVersion', 'originRequestId', 'kind', 'context', 'workerJob'])
  assert.equal(frozen.schemaVersion, 1)
  assert.equal(frozen.kind, 'anima-txt2img')
  assert.ok(typeof frozen.originRequestId === 'string' && frozen.originRequestId.length > 0)
  const { context, workerJob: job } = frozen
  exactKeys(
    context,
    [
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
      'target',
    ],
    ['cfgRescale', 'vaePrecision'],
  )
  exactKeys(job, ['schemaVersion', 'bbox', 'prompts', 'sampling', 'model', 'loras', 'target'])
  assert.equal(context.schemaVersion, 1)
  assert.equal(job.schemaVersion, 1)
  assert.equal(context.kind, 'anima-txt2img-preparation')
  for (const field of ['documentId', 'documentRevision'])
    assert.ok(typeof context[field] === 'string' && context[field].length > 0)
  const bbox = { x: 0, y: 0, width: 256, height: 256 }
  assert.deepEqual(context.bbox, bbox)
  assert.deepEqual(job.bbox, bbox)
  assert.deepEqual(context.prompts, expectedItem.prompts)
  assert.deepEqual(job.prompts, expectedItem.compiledPrompts)
  assert.deepEqual(context.sampling, {
    animaMethod: 'er_sde',
    cfgScale: 4,
    requestedSeedPolicy: expectedItem.requestedSeedPolicy,
    seed: expectedItem.seed,
    seedBehavior: expectedItem.seedBehavior,
    steps: expectedItem.steps,
  })
  assert.deepEqual(job.sampling, literalAnimaErSdeNativePlan(expectedItem.steps))
  assert.deepEqual(context.model, {
    architecture: 'anima-base-1.0',
    checkpoint: {
      byteSize: fixture.anima.byteSize,
      managedPath: fixture.anima.installed.managedPath,
      reference: selectedReference(fixture, 'anima'),
    },
    qwen3Encoder: component(fixture, 'encoder'),
    vae: component(fixture, 'vae'),
  })
  assert.deepEqual(job.model, {
    architecture: 'anima-base-1.0',
    checkpoint: workerFile(fixture, 'anima'),
    qwen3Encoder: workerFile(fixture, 'encoder'),
    vae: workerFile(fixture, 'vae'),
  })
  const lora = selectedReference(fixture, 'animaLora')
  assert.deepEqual(context.loraStack, [{ enabled: true, resource: lora, weight: -0.5 }])
  assert.deepEqual(context.loras, [
    {
      byteSize: fixture.animaLora.byteSize,
      managedPath: fixture.animaLora.installed.managedPath,
      reference: lora,
      weight: -0.5,
    },
  ])
  assert.deepEqual(job.loras, [{ ...workerFile(fixture, 'animaLora'), weight: -0.5 }])
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
  if (Object.hasOwn(context, 'cfgRescale')) assert.equal(context.cfgRescale, 0)
  if (Object.hasOwn(context, 'vaePrecision')) assert.equal(context.vaePrecision, 'Auto')
}

export function assertAnimaErSdeConfiguration(config, expectedItem, fixture) {
  assertInstalledSources(fixture)
  assertExpectedItem(expectedItem)
  assert.deepEqual(
    config,
    {
      anima: {
        architecture: 'anima-base-1.0',
        checkpointByteSize: fixture.anima.byteSize,
        qwen3Encoder: component(fixture, 'encoder', true),
        vae: component(fixture, 'vae', true),
      },
      ...(Object.hasOwn(config, 'cfgRescale') ? { cfgRescale: 0 } : {}),
      ...(Object.hasOwn(config, 'vaePrecision') ? { vaePrecision: 'Auto' } : {}),
      loras: [{ enabled: true, resource: selectedReference(fixture, 'animaLora'), weight: -0.5 }],
      mode: 'txt2img',
      model: selectedReference(fixture, 'anima'),
      negativePrompt: { embeddingRefs: [], text: expectedItem.prompts.negative },
      positivePrompt: { embeddingRefs: [], text: expectedItem.prompts.positive },
      sampling: {
        actualSeed: expectedItem.seed,
        animaMethod: 'er_sde',
        cfgScale: 4,
        requestedSeedPolicy: expectedItem.requestedSeedPolicy,
        seedBehavior: expectedItem.seedBehavior,
        steps: expectedItem.steps,
      },
      size: { height: 256, width: 256 },
    },
    'Accepted configuration must preserve concrete signs, actual seed, requested policy and native inputs.',
  )
  const serialized = JSON.stringify(config)
  for (const key of Object.keys(sources)) {
    assert.equal(serialized.includes(fixture[key].installed.managedPath), false)
    if (fixture[key].path) assert.equal(serialized.includes(fixture[key].path), false)
  }
}

/** Preserve every native semantic axis; only document identity is omitted for cross-Project replay. */
export function normalizeAnimaErSdeNativeInputs(frozen) {
  assert.ok(frozen && frozen.context && frozen.workerJob)
  assert.equal(
    frozen.kind,
    'anima-txt2img',
    'Only the qualified ER-SDE TXT operation can be normalized.',
  )
  const normalized = structuredClone({
    kind: frozen.kind,
    context: frozen.context,
    workerJob: frozen.workerJob,
  })
  if (Object.hasOwn(normalized.context, 'documentId')) delete normalized.context.documentId
  if (Object.hasOwn(normalized.context, 'documentRevision'))
    delete normalized.context.documentRevision
  return normalized
}
