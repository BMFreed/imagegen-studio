/** Independent literal oracle; no filesystem, worker, production planner or compiler calls. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'

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
  embeddingTrained: {
    byteSize: 49736,
    sha256: '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
    type: 'embedding',
    managedId: 700100,
    modelId: 2360940,
    versionId: 2655289,
    fileId: 2542976,
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
const token = '<illustriousphoto>'
const positivePrompts = [
  'a ceramic cup on a wooden table, studio photograph',
  'a ceramic cup on a wooden table, studio photograph, (<illustriousphoto>:1.3)',
]
const negativePrompts = ['low quality', 'low quality, (<illustriousphoto>:0.7)']
const embeddingOrigin = {
  kind: 'civitai-trained',
  modelId: 2360940,
  versionId: 2655289,
  fileId: 2542976,
  url: 'https://civitai.com/api/download/models/2655289?fileId=2542976',
  creator: 'CautionMergeAhead',
  creditRequired: true,
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

function objectiveModelKey(objective) {
  assert.ok(
    ['epsilon', 'v_prediction'].includes(objective),
    'An exact trained EPS or V objective is required.',
  )
  return objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'
}

/** Lexical checks precede all reads; the runner verifies physical containment and referenced SHA. */
export function validateDynamicBatchFixture(fixture) {
  exactKeys(
    fixture,
    [
      'schemaVersion',
      'profile',
      'objective',
      'stage',
      'referenceFixture',
      'workerBaseline',
      'artifacts',
    ],
    ['baseline', 'mutation'],
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'illustrious-dynamic-embeddings')
  const plan = literalDynamicBatchPlan(fixture.stage, fixture.objective)
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
      ['iteration', 'restored'].includes(fixture.stage),
      'Only iteration/restored use a baseline.',
    )
    reference(fixture.baseline, ['reportPath', 'reportSha256'])
    assert.ok(!overlap(fixture.artifacts, fixture.baseline.reportPath))
  }
  if (fixture.stage === 'restored')
    assert.ok(fixture.baseline, 'Restored requires a healthy baseline.')
  if (Object.hasOwn(fixture, 'mutation')) {
    assert.equal(
      fixture.stage,
      'iteration',
      'Only iteration can execute the negative embedding mutation.',
    )
    assert.ok(fixture.baseline, 'An installed mutation requires a healthy baseline.')
    exactKeys(fixture.mutation, ['module', 'originalSha256', 'mutatedSha256'])
    assert.equal(fixture.mutation.module, 'inference_embeddings.py')
    sha(fixture.mutation.originalSha256)
    sha(fixture.mutation.mutatedSha256)
    assert.notEqual(fixture.mutation.originalSha256, fixture.mutation.mutatedSha256)
  }
  return plan
}

export function dynamicBatchSourcePrompts() {
  return freeze({
    positive:
      '{a ceramic cup on a wooden table, studio photograph|a ceramic cup on a wooden table, studio photograph, (<illustriousphoto>:1.3)}',
    negative: '{low quality|low quality, (<illustriousphoto>:0.7)}',
  })
}

/** Literal pair order and activation axes are independent of the production expansion planner. */
export function literalDynamicBatchPlan(stage, objective) {
  const modelKey = objectiveModelKey(objective)
  assert.ok(['iteration', 'restored'].includes(stage), 'Unknown dynamic embedding stage.')
  const sampler = objective === 'epsilon' ? 'euler_a' : 'euler'
  const tuples =
    stage === 'iteration'
      ? [
          [0, 0],
          [0, 1],
          [1, 0],
          [1, 1],
        ]
      : [
          [0, 0],
          [0, 1],
        ]
  const items = tuples.map(([positive, negative]) => ({
    promptPairIndex: positive * 2 + negative,
    iteration: 0,
    seed: 0,
    requestedSeedPolicy: 'fixed',
    seedBehavior: 'per-iteration',
    objective,
    sampler,
    prompts: { positive: positivePrompts[positive], negative: negativePrompts[negative] },
  }))
  return freeze({
    stage,
    objective,
    modelKey,
    sampler,
    iterations: 1,
    maxPrompts: stage === 'iteration' ? 4 : 2,
    seedBehavior: 'per-iteration',
    requestedSeedPolicy: 'fixed',
    sourcePrompts: dynamicBatchSourcePrompts(),
    items,
    expectedCompletions: items.length,
    expectedAdmissions: items.length,
    expectedCanceled: 0,
  })
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
  artifactPath(fixture.appData)
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
    if (key === 'embeddingTrained') {
      assert.equal(source.name, 'IllustriousPhoto Embedding')
      assert.equal(source.versionName, 'WAIv15 1152steps')
      assert.equal(path.basename(source.path), 'illustriousphoto.safetensors')
      assert.deepEqual(
        source.origin,
        embeddingOrigin,
        'Trained origin and required creator credit must remain exact.',
      )
    }
    if (pinned.trainedObjective) {
      assert.equal(source.trainedObjective, pinned.trainedObjective)
      for (const field of ['modelId', 'versionId', 'fileId'])
        assert.equal(source.origin[field], pinned[field])
    }
  }
}

/** The app-defined token remains ordinary text; copied exact identity is the sidecar. */
export function expectedEmbeddingRef(fixture) {
  assertInstalledSources(fixture)
  return freeze({ token, resource: selectedReference(fixture, 'embeddingTrained') })
}

function effectiveEmbeddingRefs(expectedItem, fixture) {
  const ref = expectedEmbeddingRef(fixture)
  return {
    positive: expectedItem.prompts.positive === positivePrompts[1] ? [ref] : [],
    negative: expectedItem.prompts.negative === negativePrompts[1] ? [ref] : [],
  }
}

function effectiveEmbeddingDescriptors(expectedItem, fixture) {
  const refs = effectiveEmbeddingRefs(expectedItem, fixture)
  const descriptor = (ref) => ({
    byteSize: sources.embeddingTrained.byteSize,
    managedPath: fixture.embeddingTrained.installed.managedPath,
    reference: ref.resource,
    token: ref.token,
  })
  return { positive: refs.positive.map(descriptor), negative: refs.negative.map(descriptor) }
}

function effectiveWorkerEmbeddings(expectedItem, fixture) {
  const refs = effectiveEmbeddingRefs(expectedItem, fixture)
  const descriptor = () => ({ ...workerFile(fixture, 'embeddingTrained'), token })
  return { positive: refs.positive.map(descriptor), negative: refs.negative.map(descriptor) }
}

function assertExpectedItem(expected) {
  exactKeys(expected, [
    'promptPairIndex',
    'iteration',
    'seed',
    'requestedSeedPolicy',
    'seedBehavior',
    'objective',
    'sampler',
    'prompts',
  ])
  const modelKey = objectiveModelKey(expected.objective)
  assert.equal(expected.sampler, expected.objective === 'epsilon' ? 'euler_a' : 'euler')
  assert.equal(expected.seed, 0)
  assert.equal(expected.requestedSeedPolicy, 'fixed')
  assert.equal(expected.seedBehavior, 'per-iteration')
  exactKeys(expected.prompts, ['positive', 'negative'])
  assert.ok(positivePrompts.includes(expected.prompts.positive))
  assert.ok(negativePrompts.includes(expected.prompts.negative))
  assert.equal(
    expected.promptPairIndex,
    positivePrompts.indexOf(expected.prompts.positive) * 2 +
      negativePrompts.indexOf(expected.prompts.negative),
  )
  assert.equal(expected.iteration, 0)
  return modelKey
}

function noiseProfile(objective) {
  return {
    schemaVersion: 1,
    baseSchedule: 'sdxl-scaled-linear-v1',
    rescaleBetasZeroSnr: objective === 'v_prediction',
    timestepSpacing: 'leading',
  }
}

/** The worker consumes raw signed weights; no Anima compiled-spans DTO is fabricated here. */
export function assertDynamicBatchFrozen(frozen, expectedItem, fixture) {
  assertInstalledSources(fixture)
  const modelKey = assertExpectedItem(expectedItem)
  exactKeys(frozen, ['schemaVersion', 'originRequestId', 'kind', 'context', 'workerJob'])
  assert.equal(frozen.schemaVersion, 1)
  assert.equal(frozen.kind, 'illustrious-txt2img')
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
  ])
  exactKeys(
    job,
    [
      'schemaVersion',
      'bbox',
      'prompts',
      'sampling',
      'checkpoint',
      'loras',
      'vae',
      'vaePrecision',
      'target',
    ],
    ['embeddings'],
  )
  assert.equal(context.schemaVersion, 1)
  assert.equal(job.schemaVersion, 1)
  assert.equal(context.kind, 'normal-txt2img-preparation')
  for (const field of ['documentId', 'documentRevision'])
    assert.ok(typeof context[field] === 'string' && context[field].length > 0)
  const bbox = { x: 0, y: 0, width: 256, height: 256 }
  assert.deepEqual(context.bbox, bbox)
  assert.deepEqual(job.bbox, bbox)
  assert.deepEqual(context.prompts, expectedItem.prompts)
  assert.deepEqual(job.prompts, expectedItem.prompts)
  assert.deepEqual(context.sampling, {
    cfgRescale: 0,
    cfgScale: 5,
    invokeScheduler: expectedItem.sampler,
    noiseProfile: noiseProfile(expectedItem.objective),
    requestedSeedPolicy: expectedItem.requestedSeedPolicy,
    sampler: expectedItem.sampler === 'euler' ? 'Euler' : 'Euler a',
    scheduler: 'Normal',
    seed: expectedItem.seed,
    seedBehavior: expectedItem.seedBehavior,
    steps: 3,
  })
  assert.deepEqual(job.sampling, {
    cfgRescale: 0,
    cfgScale: 5,
    noiseProfile: noiseProfile(expectedItem.objective),
    scheduler: expectedItem.sampler,
    seed: expectedItem.seed,
    steps: 3,
  })
  assert.deepEqual(context.model, {
    managedPath: fixture[modelKey].installed.managedPath,
    reference: selectedReference(fixture, modelKey),
  })
  assert.deepEqual(job.checkpoint, {
    path: fixture[modelKey].installed.managedPath,
    predictionType: expectedItem.objective,
    sha256: fixture[modelKey].sha256,
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
  const ref = expectedEmbeddingRef(fixture)
  assert.deepEqual(context.embeddingRefs, { positive: [ref], negative: [ref] })
  assert.deepEqual(context.embeddings, effectiveEmbeddingDescriptors(expectedItem, fixture))
  const nativeEmbeddings = effectiveWorkerEmbeddings(expectedItem, fixture)
  if (nativeEmbeddings.positive.length || nativeEmbeddings.negative.length) {
    assert.deepEqual(job.embeddings, nativeEmbeddings)
  } else {
    assert.equal(
      Object.hasOwn(job, 'embeddings'),
      false,
      'Ordinary concrete jobs must omit embedding wire input.',
    )
  }
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
}

export function assertDynamicBatchConfiguration(config, expectedItem, fixture) {
  assertInstalledSources(fixture)
  const modelKey = assertExpectedItem(expectedItem)
  assert.deepEqual(
    config,
    {
      cfgRescale: 0,
      loras: [
        { enabled: true, resource: selectedReference(fixture, 'illustriousLora'), weight: -0.5 },
      ],
      mode: 'txt2img',
      model: selectedReference(fixture, modelKey),
      negativePrompt: {
        embeddingRefs: effectiveEmbeddingRefs(expectedItem, fixture).negative,
        text: expectedItem.prompts.negative,
      },
      positivePrompt: {
        embeddingRefs: effectiveEmbeddingRefs(expectedItem, fixture).positive,
        text: expectedItem.prompts.positive,
      },
      sampling: {
        actualSeed: expectedItem.seed,
        cfgScale: 5,
        invokeScheduler: expectedItem.sampler,
        noiseProfile: noiseProfile(expectedItem.objective),
        requestedSeedPolicy: expectedItem.requestedSeedPolicy,
        sampler: expectedItem.sampler === 'euler' ? 'Euler' : 'Euler a',
        scheduler: 'Normal',
        seedBehavior: expectedItem.seedBehavior,
        steps: 3,
      },
      size: { height: 256, width: 256 },
      vae: selectedReference(fixture, 'externalVaeNative'),
      vaePrecision: 'FP32',
    },
    'Accepted configuration must preserve concrete signs, exact objective, actual seed and native inputs.',
  )
  const serialized = JSON.stringify(config)
  for (const key of Object.keys(sources)) {
    assert.equal(serialized.includes(fixture[key].installed.managedPath), false)
    if (fixture[key].path) assert.equal(serialized.includes(fixture[key].path), false)
  }
}

/** Keep every native semantic axis; omit only document identity for cross-Project replay. */
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

/** Cross-policy control omits only requested policy metadata; all executed inputs remain. */
export function normalizeDynamicExecutionInputs(frozen) {
  const normalized = normalizeDynamicNativeInputs(frozen)
  assert.ok(normalized.context.sampling && typeof normalized.context.sampling === 'object')
  delete normalized.context.sampling.requestedSeedPolicy
  delete normalized.context.sampling.seedBehavior
  return normalized
}
