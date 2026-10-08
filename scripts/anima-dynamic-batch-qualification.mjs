/** Independent bounded dynamic-batch oracle. No filesystem, worker or production compiler calls. */
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

/** Lexical checks precede all reads; the runner separately verifies physical containment and SHA. */
export function validateDynamicBatchFixture(fixture) {
  exactKeys(
    fixture,
    ['schemaVersion', 'profile', 'stage', 'referenceFixture', 'workerBaseline', 'artifacts'],
    ['baseline', 'crashSource', 'mutation'],
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'anima-dynamic-batch')
  const plan = literalDynamicBatchPlan(fixture.stage)
  artifactPath(fixture.artifacts)
  reference(fixture.referenceFixture, ['path', 'sha256'])
  reference(fixture.workerBaseline, ['path', 'sha256'])
  assert.ok(
    !overlap(fixture.artifacts, fixture.referenceFixture.path),
    'Evidence must not overwrite or enclose the reference fixture.',
  )
  assert.ok(!overlap(fixture.artifacts, fixture.workerBaseline.path))
  if (Object.hasOwn(fixture, 'baseline')) {
    assert.ok(
      ['iteration', 'reuse', 'restored'].includes(fixture.stage),
      'Only iteration/reuse/restored use a baseline.',
    )
    reference(fixture.baseline, ['reportPath', 'reportSha256'])
    assert.ok(!overlap(fixture.artifacts, fixture.baseline.reportPath))
  }
  if (fixture.stage === 'restored')
    assert.ok(fixture.baseline, 'Restored requires a healthy baseline.')
  if (Object.hasOwn(fixture, 'crashSource')) {
    assert.equal(fixture.stage, 'reuse', 'Only reuse consumes a crash source.')
    reference(fixture.crashSource, ['reportPath', 'reportSha256'])
    assert.ok(!overlap(fixture.artifacts, fixture.crashSource.reportPath))
  }
  if (fixture.stage === 'reuse')
    assert.ok(fixture.crashSource, 'Reuse requires an actual crash source.')
  if (Object.hasOwn(fixture, 'mutation')) {
    assert.equal(
      fixture.stage,
      'iteration',
      'Only iteration can execute the declared seed mutation.',
    )
    assert.ok(fixture.baseline, 'A declared installed mutation requires a healthy baseline.')
    exactKeys(fixture.mutation, ['module', 'originalSha256', 'mutatedSha256'])
    assert.equal(fixture.mutation.module, 'anima_euler.py')
    sha(fixture.mutation.originalSha256)
    sha(fixture.mutation.mutatedSha256)
    assert.notEqual(fixture.mutation.originalSha256, fixture.mutation.mutatedSha256)
  }
  return plan
}

export function dynamicBatchSourcePrompts() {
  return freeze({
    positive: 'a {(red:1.3)|(blue:1.3)} ceramic cup on a wooden table, studio photograph',
    negative: '{(blurry:0.7)|(noisy:0.7)}, low quality',
  })
}

/** Handwritten pair/iteration/seed tuples; neither production planner nor compiler is an oracle. */
export function literalDynamicBatchPlan(stage) {
  assert.ok(['iteration', 'crash', 'reuse', 'restored'].includes(stage), 'Unknown dynamic stage.')
  const requestedSeedPolicy = stage === 'reuse' ? 'reuse' : 'fixed'
  const seedBehavior = ['reuse', 'crash'].includes(stage) ? 'per-prompt' : 'per-iteration'
  const tuples = {
    iteration: [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 0, 0],
      [1, 0, 0, 0, 1],
      [1, 1, 1, 0, 1],
      [2, 0, 0, 1, 0],
      [2, 1, 1, 1, 0],
      [3, 0, 0, 1, 1],
      [3, 1, 1, 1, 1],
    ],
    crash: [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 0, 0],
      [0, 2, 2, 0, 0],
    ],
    reuse: [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 0, 0],
      [1, 0, 2, 0, 1],
      [1, 1, 3, 0, 1],
      [2, 0, 4, 1, 0],
      [2, 1, 5, 1, 0],
      [3, 0, 6, 1, 1],
      [3, 1, 7, 1, 1],
    ],
    restored: [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 0, 0],
    ],
  }
  const dynamic = ['iteration', 'reuse'].includes(stage)
  const items = tuples[stage].map(([promptPairIndex, iteration, seed, positive, negative]) => ({
    promptPairIndex,
    iteration,
    seed,
    requestedSeedPolicy,
    seedBehavior,
    animaMethod: 'euler',
    prompts: { positive: positivePrompts[positive], negative: negativePrompts[negative] },
    compiledPrompts: {
      positive: structuredClone(positiveCompiled[positive]),
      negative: structuredClone(negativeCompiled[negative]),
    },
  }))
  return freeze({
    stage,
    iterations: stage === 'crash' ? 3 : 2,
    maxPrompts: dynamic ? 4 : 1,
    seedBehavior,
    requestedSeedPolicy,
    sourcePrompts: dynamic
      ? dynamicBatchSourcePrompts()
      : { positive: positivePrompts[0], negative: negativePrompts[0] },
    items,
    expectedCompletions: stage === 'crash' ? 1 : items.length,
    expectedAdmissions: items.length,
    expectedCanceled: stage === 'crash' ? 2 : 0,
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

function nativePlan(seed) {
  return {
    beginIndex: 0,
    guidanceScale: 4,
    height: 256,
    initialSigma: 1,
    mode: 'txt2img',
    posteriorSeed: null,
    scheduler: 'euler',
    seed,
    sigmas: [1, 0.8571428571428571, 0.6, 0],
    startStep: 0,
    steps: 3,
    stepSeed: seed,
    strength: null,
    timesteps: [1000, 857.1428571428571, 600],
    totalSteps: 3,
    version: 'anima-flow-denoising-v1',
    width: 256,
  }
}

function assertExpectedItem(expected) {
  exactKeys(expected, [
    'promptPairIndex',
    'iteration',
    'seed',
    'requestedSeedPolicy',
    'seedBehavior',
    'animaMethod',
    'prompts',
    'compiledPrompts',
  ])
  assert.equal(expected.animaMethod, 'euler')
  assert.ok(
    Number.isSafeInteger(expected.seed) && expected.seed >= 0 && expected.seed <= 0xffff_ffff,
  )
  assert.ok(['fixed', 'reuse'].includes(expected.requestedSeedPolicy))
  assert.ok(['per-iteration', 'per-prompt'].includes(expected.seedBehavior))
  const positive = positivePrompts.indexOf(expected.prompts.positive)
  const negative = negativePrompts.indexOf(expected.prompts.negative)
  assert.ok(positive >= 0 && negative >= 0)
  assert.deepEqual(expected.compiledPrompts, {
    positive: positiveCompiled[positive],
    negative: negativeCompiled[negative],
  })
}

export function assertDynamicBatchFrozen(frozen, expectedItem, fixture) {
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
    animaMethod: 'euler',
    cfgScale: 4,
    requestedSeedPolicy: expectedItem.requestedSeedPolicy,
    seed: expectedItem.seed,
    seedBehavior: expectedItem.seedBehavior,
    steps: 3,
  })
  assert.deepEqual(job.sampling, nativePlan(expectedItem.seed))
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

export function assertDynamicBatchConfiguration(config, expectedItem, fixture) {
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
        animaMethod: 'euler',
        cfgScale: 4,
        requestedSeedPolicy: expectedItem.requestedSeedPolicy,
        seedBehavior: expectedItem.seedBehavior,
        steps: 3,
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
export function normalizeDynamicNativeInputs(frozen) {
  assert.ok(frozen && frozen.context && frozen.workerJob)
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

/** Cross-policy controls omit only requested main policy metadata; every executed input remains. */
export function normalizeDynamicExecutionInputs(frozen) {
  const normalized = normalizeDynamicNativeInputs(frozen)
  assert.ok(normalized.context.sampling && typeof normalized.context.sampling === 'object')
  delete normalized.context.sampling.requestedSeedPolicy
  delete normalized.context.sampling.seedBehavior
  return normalized
}
