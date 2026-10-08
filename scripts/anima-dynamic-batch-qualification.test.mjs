import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  assertDynamicBatchConfiguration,
  assertDynamicBatchFrozen,
  dynamicBatchSourcePrompts,
  literalDynamicBatchPlan,
  normalizeDynamicExecutionInputs,
  normalizeDynamicNativeInputs,
  validateDynamicBatchFixture,
} from './anima-dynamic-batch-qualification.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio')
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const red = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
const blue = 'a (blue:1.3) ceramic cup on a wooden table, studio photograph'
const blurry = '(blurry:0.7), low quality'
const noisy = '(noisy:0.7), low quality'

function wrapper(stage = 'iteration') {
  return {
    schemaVersion: 1,
    profile: 'anima-dynamic-batch',
    stage,
    referenceFixture: { path: path.join(root, 'pool/anima.json'), sha256: 'a'.repeat(64) },
    workerBaseline: {
      path: path.join(root, 'runs/source-entry/entry-sources.json'),
      sha256: 'd'.repeat(64),
    },
    artifacts: path.join(root, `runs/dynamic-${stage}`),
    ...(stage === 'restored'
      ? {
          baseline: {
            reportPath: path.join(root, 'runs/healthy/report.json'),
            reportSha256: 'b'.repeat(64),
          },
        }
      : {}),
    ...(stage === 'reuse'
      ? {
          crashSource: {
            reportPath: path.join(root, 'runs/crash/report.json'),
            reportSha256: 'c'.repeat(64),
          },
        }
      : {}),
  }
}

function installedFixture() {
  const appData = path.join(root, 'pool/data/imagegen-studio')
  const fields = {
    encoder: [
      700010,
      1192135096,
      'cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba',
      'qwen3_encoder',
      'Qwen3 encoder',
      'Anima Qwen3 0.6B',
    ],
    vae: [
      700020,
      253806246,
      'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f',
      'vae',
      'Anima VAE',
      'Anima Qwen Image VAE',
    ],
    anima: [
      700030,
      4182275752,
      '0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941',
      'checkpoint',
      'Cyberfalafel',
      'Cyberfalafel anima v1.0',
    ],
    animaLora: [
      700050,
      138663759,
      'cd9639b03d4458323e696e3792ff7535ae03f9f70368d6d0dc17fe86fa4f354f',
      'lora',
      'Myth Portrait',
      'Anima Portrait Style',
    ],
  }
  return {
    appData,
    ...Object.fromEntries(
      Object.entries(fields).map(([key, [id, byteSize, sha256, type, name, versionName]]) => [
        key,
        {
          byteSize,
          sha256,
          type,
          name,
          versionName,
          family: 'anima',
          path: path.join(root, `pool/sources/${key}.safetensors`),
          origin:
            key === 'anima'
              ? { modelId: 1147756, versionId: 3120487, fileId: 3000817 }
              : key === 'animaLora'
                ? { modelId: 599757, versionId: 3084665, fileId: 2964030 }
                : {},
          installed: {
            resourceId: `resource-${key}`,
            versionId: `version-${key}`,
            managedPath: path.join(appData, 'models', `qualified-${id}.safetensors`),
          },
        },
      ]),
    ),
  }
}

function modelReference(fixture, key) {
  const source = fixture[key]
  const ids = key === 'anima' ? [1147756, 3120487, 3000817] : [599757, 3084665, 2964030]
  return {
    baseModelFamily: 'anima',
    civitaiModelId: ids[0],
    civitaiVersionId: ids[1],
    civitaiFileId: ids[2],
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
    sha256: source.sha256,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    ...(portable ? {} : { managedPath: source.installed.managedPath }),
  }
}

function workerFile(fixture, key) {
  const source = fixture[key]
  return { byteSize: source.byteSize, path: source.installed.managedPath, sha256: source.sha256 }
}

function compiled(prompts) {
  const isBlue = prompts.positive === blue
  const isNoisy = prompts.negative === noisy
  return {
    positive: {
      version: 'anima-prompt-weighting-v1',
      cleanedText: isBlue
        ? 'a blue ceramic cup on a wooden table, studio photograph'
        : 'a red ceramic cup on a wooden table, studio photograph',
      spans: isBlue
        ? [
            { start: 0, end: 2, weight: 1 },
            { start: 2, end: 6, weight: 1.3 },
            { start: 6, end: 55, weight: 1 },
          ]
        : [
            { start: 0, end: 2, weight: 1 },
            { start: 2, end: 5, weight: 1.3 },
            { start: 5, end: 54, weight: 1 },
          ],
    },
    negative: {
      version: 'anima-prompt-weighting-v1',
      cleanedText: isNoisy ? 'noisy, low quality' : 'blurry, low quality',
      spans: isNoisy
        ? [
            { start: 0, end: 5, weight: 0.7 },
            { start: 5, end: 18, weight: 1 },
          ]
        : [
            { start: 0, end: 6, weight: 0.7 },
            { start: 6, end: 19, weight: 1 },
          ],
    },
  }
}

/** Emulated raw durable DTO, independently specified; these tests do not execute inference. */
function frozen(expected, fixture = installedFixture()) {
  const bbox = { x: 0, y: 0, width: 256, height: 256 }
  const source = fixture.anima
  const target = {
    byteSize: 2048,
    colorSpace: 'srgb',
    format: 'png',
    width: 256,
    height: 256,
    sha256: 'd'.repeat(64),
    iccSha256: icc,
  }
  const model = {
    architecture: 'anima-base-1.0',
    checkpoint: {
      byteSize: source.byteSize,
      managedPath: source.installed.managedPath,
      reference: modelReference(fixture, 'anima'),
    },
    qwen3Encoder: component(fixture, 'encoder'),
    vae: component(fixture, 'vae'),
  }
  const lora = modelReference(fixture, 'animaLora')
  return {
    schemaVersion: 1,
    originRequestId: 'original-dynamic-request',
    kind: 'anima-txt2img',
    context: {
      schemaVersion: 1,
      kind: 'anima-txt2img-preparation',
      documentId: 'document-one',
      documentRevision: 'revision-one',
      bbox,
      prompts: { ...expected.prompts },
      target,
      model,
      sampling: {
        animaMethod: 'euler',
        cfgScale: 4,
        requestedSeedPolicy: expected.requestedSeedPolicy,
        seed: expected.seed,
        seedBehavior: expected.seedBehavior,
        steps: 3,
      },
      loraStack: [{ enabled: true, resource: lora, weight: -0.5 }],
      loras: [
        {
          byteSize: fixture.animaLora.byteSize,
          managedPath: fixture.animaLora.installed.managedPath,
          reference: lora,
          weight: -0.5,
        },
      ],
    },
    workerJob: {
      schemaVersion: 1,
      bbox,
      target: { byteSize: 2048, width: 256, height: 256, sha256: 'd'.repeat(64), iccSha256: icc },
      model: {
        architecture: 'anima-base-1.0',
        checkpoint: workerFile(fixture, 'anima'),
        qwen3Encoder: workerFile(fixture, 'encoder'),
        vae: workerFile(fixture, 'vae'),
      },
      loras: [{ ...workerFile(fixture, 'animaLora'), weight: -0.5 }],
      prompts: compiled(expected.prompts),
      sampling: {
        beginIndex: 0,
        guidanceScale: 4,
        height: 256,
        initialSigma: 1,
        mode: 'txt2img',
        posteriorSeed: null,
        scheduler: 'euler',
        seed: expected.seed,
        sigmas: [1, 0.8571428571428571, 0.6, 0],
        startStep: 0,
        steps: 3,
        stepSeed: expected.seed,
        strength: null,
        timesteps: [1000, 857.1428571428571, 600],
        totalSteps: 3,
        version: 'anima-flow-denoising-v1',
        width: 256,
      },
    },
  }
}

function configuration(expected, fixture = installedFixture()) {
  return {
    anima: {
      architecture: 'anima-base-1.0',
      checkpointByteSize: fixture.anima.byteSize,
      qwen3Encoder: component(fixture, 'encoder', true),
      vae: component(fixture, 'vae', true),
    },
    loras: [{ enabled: true, resource: modelReference(fixture, 'animaLora'), weight: -0.5 }],
    mode: 'txt2img',
    model: modelReference(fixture, 'anima'),
    positivePrompt: { text: expected.prompts.positive, embeddingRefs: [] },
    negativePrompt: { text: expected.prompts.negative, embeddingRefs: [] },
    size: { width: 256, height: 256 },
    sampling: {
      actualSeed: expected.seed,
      animaMethod: 'euler',
      cfgScale: 4,
      requestedSeedPolicy: expected.requestedSeedPolicy,
      seedBehavior: expected.seedBehavior,
      steps: 3,
    },
  }
}

test('literal four-pair order and both seed plans remain independent of production planning', () => {
  const iteration = literalDynamicBatchPlan('iteration')
  assert.deepEqual(
    iteration.items.map((item) => [item.prompts.positive, item.prompts.negative, item.seed]),
    [
      [red, blurry, 0],
      [red, blurry, 1],
      [red, noisy, 0],
      [red, noisy, 1],
      [blue, blurry, 0],
      [blue, blurry, 1],
      [blue, noisy, 0],
      [blue, noisy, 1],
    ],
  )
  const reuse = literalDynamicBatchPlan('reuse')
  assert.deepEqual(
    reuse.items.map((item) => [item.promptPairIndex, item.iteration, item.seed]),
    [
      [0, 0, 0],
      [0, 1, 1],
      [1, 0, 2],
      [1, 1, 3],
      [2, 0, 4],
      [2, 1, 5],
      [3, 0, 6],
      [3, 1, 7],
    ],
  )
  assert.ok(
    iteration.items.every(
      (item) => item.requestedSeedPolicy === 'fixed' && item.seedBehavior === 'per-iteration',
    ),
  )
  assert.ok(
    reuse.items.every(
      (item) => item.requestedSeedPolicy === 'reuse' && item.seedBehavior === 'per-prompt',
    ),
  )
  assert.deepEqual(iteration.sourcePrompts, dynamicBatchSourcePrompts())
  assert.ok(Object.isFrozen(reuse.items[0].compiledPrompts.positive.spans))
})

test('actual crash completion is separated from two restart cancellations and finite restored controls', () => {
  const plans = ['iteration', 'crash', 'reuse', 'restored'].map(literalDynamicBatchPlan)
  assert.deepEqual(
    plans.map((plan) => [plan.expectedCompletions, plan.expectedAdmissions, plan.expectedCanceled]),
    [
      [8, 8, 0],
      [1, 3, 2],
      [8, 8, 0],
      [2, 2, 0],
    ],
  )
  assert.deepEqual(
    plans[1].items.map((item) => item.seed),
    [0, 1, 2],
  )
  assert.deepEqual(
    plans[3].items.map((item) => item.seed),
    [0, 1],
  )
  assert.deepEqual(plans[1].sourcePrompts, { positive: red, negative: blurry })
})

test('strict stage references refuse malformed wrappers and artifact overlap before any filesystem call', () => {
  for (const stage of ['iteration', 'crash', 'reuse', 'restored']) {
    assert.equal(validateDynamicBatchFixture(wrapper(stage)).stage, stage)
  }
  const mutant = wrapper()
  mutant.baseline = {
    reportPath: path.join(root, 'runs/healthy/report.json'),
    reportSha256: 'b'.repeat(64),
  }
  validateDynamicBatchFixture(mutant)
  const changes = [
    [
      'unsupported schema version',
      (value) => {
        value.schemaVersion = 2
      },
    ],
    [
      'different profile',
      (value) => {
        value.profile = 'anima-regression'
      },
    ],
    [
      'unknown stage',
      (value) => {
        value.stage = 'random'
      },
    ],
    [
      'extra wrapper field',
      (value) => {
        value.extra = true
      },
    ],
    [
      'extra reference field',
      (value) => {
        value.referenceFixture.extra = true
      },
    ],
    [
      'uppercase reference hash',
      (value) => {
        value.referenceFixture.sha256 = 'A'.repeat(64)
      },
    ],
    [
      'reference outside owned root',
      (value) => {
        value.referenceFixture.path = '/tmp/reference.json'
      },
    ],
    [
      'missing worker baseline',
      (value) => {
        delete value.workerBaseline
      },
    ],
    [
      'short worker baseline hash',
      (value) => {
        value.workerBaseline.sha256 = 'd'.repeat(63)
      },
    ],
    [
      'worker baseline outside owned root',
      (value) => {
        value.workerBaseline.path = '/tmp/source-entry.json'
      },
    ],
    [
      'artifact root itself',
      (value) => {
        value.artifacts = root
      },
    ],
    [
      'artifact ancestor enclosing reference',
      (value) => {
        value.artifacts = path.join(root, 'pool')
      },
    ],
    [
      'dot traversal artifact path',
      (value) => {
        value.artifacts = `${root}/runs/../evidence`
      },
    ],
    [
      'trailing slash artifact path',
      (value) => {
        value.artifacts = `${value.artifacts}/`
      },
    ],
    [
      'short healthy baseline hash',
      (value) => {
        value.baseline = {
          reportPath: path.join(root, 'runs/healthy/report.json'),
          reportSha256: 'b'.repeat(63),
        }
      },
    ],
    [
      'crash source on iteration stage',
      (value) => {
        value.crashSource = wrapper('reuse').crashSource
      },
    ],
  ]
  for (const [label, change] of changes) {
    const value = wrapper()
    change(value)
    assert.throws(() => validateDynamicBatchFixture(value), undefined, label)
  }
  for (const stage of ['restored', 'reuse']) {
    const value = wrapper(stage)
    delete value[stage === 'restored' ? 'baseline' : 'crashSource']
    assert.throws(
      () => validateDynamicBatchFixture(value),
      undefined,
      `missing ${stage} source reference`,
    )
  }
  const overlap = wrapper('reuse')
  overlap.crashSource.reportPath = path.join(overlap.artifacts, 'report.json')
  assert.throws(
    () => validateDynamicBatchFixture(overlap),
    undefined,
    'crash report enclosed by evidence',
  )
  const reuseBaseline = wrapper('reuse')
  reuseBaseline.baseline = {
    reportPath: path.join(root, 'runs/healthy/report.json'),
    reportSha256: 'b'.repeat(64),
  }
  validateDynamicBatchFixture(reuseBaseline)
  delete reuseBaseline.crashSource
  assert.throws(
    () => validateDynamicBatchFixture(reuseBaseline),
    undefined,
    'healthy baseline cannot substitute for crash source',
  )
})

test('reference files may share an evidence parent while file collisions and ancestor evidence remain forbidden', () => {
  const shared = path.join(root, 'runs/anima-dynamic-batch/checks')
  const value = wrapper('reuse')
  value.artifacts = path.join(shared, 'native-reuse')
  value.workerBaseline.path = path.join(shared, 'entry-sources.json')
  value.crashSource.reportPath = path.join(shared, 'crash-report.json')
  value.referenceFixture.path = path.join(shared, 'source-fixture.json')
  assert.equal(validateDynamicBatchFixture(value).stage, 'reuse')
  const iteration = wrapper()
  iteration.artifacts = path.join(shared, 'native-iteration')
  iteration.workerBaseline.path = path.join(shared, 'entry-sources.json')
  iteration.baseline = {
    reportPath: path.join(shared, 'healthy-report.json'),
    reportSha256: 'e'.repeat(64),
  }
  assert.equal(validateDynamicBatchFixture(iteration).stage, 'iteration')
  for (const [object, key] of [
    ['referenceFixture', 'path'],
    ['workerBaseline', 'path'],
    ['crashSource', 'reportPath'],
  ]) {
    for (const artifactPath of [value[object][key], shared]) {
      const collision = structuredClone(value)
      collision.artifacts = artifactPath
      assert.throws(() => validateDynamicBatchFixture(collision))
    }
  }
  const collision = structuredClone(iteration)
  collision.artifacts = iteration.baseline.reportPath
  assert.throws(() => validateDynamicBatchFixture(collision))
})

test('declared installed seed mutation requires its sole module, distinct source hashes and a healthy iteration baseline', () => {
  const value = wrapper()
  value.baseline = {
    reportPath: path.join(root, 'runs/healthy/report.json'),
    reportSha256: 'b'.repeat(64),
  }
  value.mutation = {
    module: 'anima_euler.py',
    originalSha256: 'e'.repeat(64),
    mutatedSha256: 'f'.repeat(64),
  }
  validateDynamicBatchFixture(value)
  for (const change of [
    (entry) => {
      delete entry.baseline
    },
    (entry) => {
      entry.mutation.module = 'anima_sampling.py'
    },
    (entry) => {
      entry.mutation.originalSha256 = entry.mutation.mutatedSha256
    },
    (entry) => {
      entry.mutation.mutatedSha256 = 'f'.repeat(63)
    },
    (entry) => {
      entry.mutation.extra = 'unbounded'
    },
    (entry) => {
      entry.stage = 'restored'
    },
  ]) {
    const entry = structuredClone(value)
    change(entry)
    assert.throws(() => validateDynamicBatchFixture(entry))
  }
})

test('every bounded stage item retains exact raw signs, weights, native grids and portable seed zero', () => {
  const fixture = installedFixture()
  for (const stage of ['iteration', 'crash', 'reuse', 'restored']) {
    for (const item of literalDynamicBatchPlan(stage).items) {
      assertDynamicBatchFrozen(frozen(item, fixture), item, fixture)
      assertDynamicBatchConfiguration(configuration(item, fixture), item, fixture)
    }
  }
  const zero = literalDynamicBatchPlan('iteration').items[0]
  assert.equal(configuration(zero).sampling.actualSeed, 0)
})

test('frozen oracle rejects reordered pairs, wrong seed domains/policy/behavior, method, LoRA and companion bindings', () => {
  const expected = literalDynamicBatchPlan('iteration').items[2]
  const fixture = installedFixture()
  const changes = [
    (value) => {
      value.context.prompts.negative = blurry
      value.workerJob.prompts.negative = compiled({ positive: red, negative: blurry }).negative
    },
    (value) => {
      value.context.sampling.seed = 2
      value.workerJob.sampling.seed = 2
      value.workerJob.sampling.stepSeed = 2
    },
    (value) => {
      value.context.sampling.requestedSeedPolicy = 'reuse'
    },
    (value) => {
      value.context.sampling.seedBehavior = 'per-prompt'
    },
    (value) => {
      value.context.sampling.animaMethod = 'heun'
      value.workerJob.sampling.scheduler = 'heun'
    },
    (value) => {
      value.workerJob.prompts.positive.spans[1].weight = 1
    },
    (value) => {
      value.workerJob.prompts.negative.spans[0].weight = 1
    },
    (value) => {
      value.context.loras = []
      value.context.loraStack = []
      value.workerJob.loras = []
    },
    (value) => {
      value.workerJob.loras[0].weight = 0.5
      value.context.loras[0].weight = 0.5
      value.context.loraStack[0].weight = 0.5
    },
    (value) => {
      value.workerJob.model.qwen3Encoder.sha256 = fixture.vae.sha256
    },
    (value) => {
      value.context.model.vae.localVersionId = 'replacement-vae'
    },
    (value) => {
      value.context.model.checkpoint.reference.civitaiFileId += 1
    },
    (value) => {
      value.workerJob.model.checkpoint.path = path.join(root, 'other.safetensors')
    },
    (value) => {
      value.workerJob.sampling.sigmas[1] = 0.8
    },
    (value) => {
      value.workerJob.sampling.stepSeed = 1
    },
    (value) => {
      value.workerJob.target.sha256 = 'f'.repeat(64)
    },
  ]
  for (const change of changes) {
    const neighbor = frozen(expected, fixture)
    assertDynamicBatchFrozen(neighbor, expected, fixture)
    const value = structuredClone(neighbor)
    change(value)
    assert.throws(() => assertDynamicBatchFrozen(value, expected, fixture))
    assertDynamicBatchFrozen(neighbor, expected, fixture)
  }
  const badSource = installedFixture()
  badSource.anima.sha256 = 'f'.repeat(64)
  assert.throws(() => assertDynamicBatchFrozen(frozen(expected, badSource), expected, badSource))
})

test('accepted configuration rejects current draft/template substitutions and altered actual identities', () => {
  const expected = literalDynamicBatchPlan('reuse').items[6]
  const fixture = installedFixture()
  const changes = [
    (value) => {
      value.positivePrompt.text = dynamicBatchSourcePrompts().positive
    },
    (value) => {
      value.negativePrompt.text = blurry
    },
    (value) => {
      value.sampling.actualSeed = 37
    },
    (value) => {
      value.sampling.requestedSeedPolicy = 'fixed'
    },
    (value) => {
      value.sampling.seedBehavior = 'per-iteration'
    },
    (value) => {
      value.sampling.animaMethod = 'lcm'
    },
    (value) => {
      value.loras[0].weight = -0.25
    },
    (value) => {
      value.anima.qwen3Encoder.sha256 = fixture.vae.sha256
    },
    (value) => {
      value.model.localVersionId = 'new-checkpoint'
    },
    (value) => {
      value.anima.vae.managedPath = fixture.vae.installed.managedPath
    },
    (value) => {
      value.cfgRescale = 0.1
    },
    (value) => {
      value.vaePrecision = 'FP32'
    },
  ]
  for (const change of changes) {
    const value = configuration(expected, fixture)
    assertDynamicBatchConfiguration(value, expected, fixture)
    change(value)
    assert.throws(() => assertDynamicBatchConfiguration(value, expected, fixture))
  }
  const neutral = configuration(expected, fixture)
  Object.assign(neutral, { cfgRescale: 0, vaePrecision: 'Auto' })
  assertDynamicBatchConfiguration(neutral, expected, fixture)
})

test('normalization retains the whole native input and requested metadata while omitting only document identity', () => {
  const fixture = installedFixture()
  const expected = literalDynamicBatchPlan('iteration').items[1]
  const original = frozen(expected, fixture)
  const changedIdentity = structuredClone(original)
  changedIdentity.originRequestId = 'new-request'
  changedIdentity.context.documentId = 'another-document'
  changedIdentity.context.documentRevision = 'another-revision'
  const normalized = normalizeDynamicNativeInputs(original)
  assert.deepEqual(normalizeDynamicNativeInputs(changedIdentity), normalized)
  assert.deepEqual(normalized.workerJob, original.workerJob)
  assert.equal(normalized.context.sampling.requestedSeedPolicy, 'fixed')
  assert.equal(normalized.context.sampling.seedBehavior, 'per-iteration')
  assert.equal(original.context.documentId, 'document-one')
  const restored = frozen(literalDynamicBatchPlan('restored').items[1], fixture)
  assert.deepEqual(normalizeDynamicNativeInputs(restored), normalized)
  for (const change of [
    (value) => {
      value.workerJob.sampling.seed = 0
    },
    (value) => {
      value.workerJob.sampling.stepSeed = 0
    },
    (value) => {
      value.workerJob.prompts.negative.spans[0].weight = 1
    },
    (value) => {
      value.workerJob.model.vae.path = 'changed-native-path'
    },
    (value) => {
      value.context.sampling.requestedSeedPolicy = 'reuse'
    },
  ]) {
    const value = structuredClone(original)
    change(value)
    assert.notDeepEqual(normalizeDynamicNativeInputs(value), normalized)
  }
})

test('cross-policy execution controls remove only requested policy metadata and retain actual native differences', () => {
  const fixture = installedFixture()
  const fixed = frozen(literalDynamicBatchPlan('iteration').items[1], fixture)
  const reuse = frozen(literalDynamicBatchPlan('reuse').items[1], fixture)
  const normalized = normalizeDynamicExecutionInputs(fixed)
  assert.deepEqual(normalizeDynamicExecutionInputs(reuse), normalized)
  assert.notDeepEqual(normalizeDynamicNativeInputs(reuse), normalizeDynamicNativeInputs(fixed))
  assert.deepEqual(normalized.workerJob, fixed.workerJob)
  assert.equal(normalized.context.sampling.seed, 1)
  assert.equal(fixed.context.sampling.requestedSeedPolicy, 'fixed')
  assert.equal(reuse.context.sampling.seedBehavior, 'per-prompt')
  const changes = [
    [
      'actual context seed',
      (value) => {
        value.context.sampling.seed = 0
      },
    ],
    [
      'native worker seed',
      (value) => {
        value.workerJob.sampling.seed = 0
      },
    ],
    [
      'native step seed',
      (value) => {
        value.workerJob.sampling.stepSeed = 0
      },
    ],
    [
      'raw positive prompt',
      (value) => {
        value.context.prompts.positive = blue
      },
    ],
    [
      'raw negative prompt',
      (value) => {
        value.context.prompts.negative = noisy
      },
    ],
    [
      'compiled attention weight',
      (value) => {
        value.workerJob.prompts.positive.spans[1].weight = 1
      },
    ],
    [
      'compiled negative text',
      (value) => {
        value.workerJob.prompts.negative.cleanedText = 'noisy, low quality'
      },
    ],
    [
      'native sigma',
      (value) => {
        value.workerJob.sampling.sigmas[1] = 0.8
      },
    ],
    [
      'target digest',
      (value) => {
        value.workerJob.target.sha256 = 'f'.repeat(64)
      },
    ],
    [
      'source target',
      (value) => {
        value.context.target.sha256 = 'f'.repeat(64)
      },
    ],
    [
      'native model companion',
      (value) => {
        value.workerJob.model.vae.path = 'different-native-vae'
      },
    ],
    [
      'model identity',
      (value) => {
        value.context.model.checkpoint.reference.localVersionId = 'different-checkpoint'
      },
    ],
    [
      'native LoRA weight',
      (value) => {
        value.workerJob.loras[0].weight = -0.25
      },
    ],
    [
      'configured LoRA',
      (value) => {
        value.context.loraStack[0].enabled = false
      },
    ],
  ]
  for (const [label, change] of changes) {
    const value = structuredClone(reuse)
    change(value)
    assert.notDeepEqual(normalizeDynamicExecutionInputs(value), normalized, label)
  }
})
