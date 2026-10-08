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
} from './illustrious-dynamic-batch-qualification.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio')
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const red = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
const blue = 'a (blue:1.3) ceramic cup on a wooden table, studio photograph'
const blurry = '(blurry:0.7), low quality'
const noisy = '(noisy:0.7), low quality'
const objectives = ['epsilon', 'v_prediction']

function wrapper(stage = 'iteration', objective = 'epsilon') {
  return {
    schemaVersion: 1,
    profile: 'illustrious-dynamic-batch',
    objective,
    stage,
    referenceFixture: { path: path.join(root, 'pool/all-models.json'), sha256: 'a'.repeat(64) },
    workerBaseline: {
      path: path.join(root, 'runs/entry/entry-sources.json'),
      sha256: 'd'.repeat(64),
    },
    artifacts: path.join(root, `runs/dynamic-${objective}-${stage}`),
    ...(['reuse', 'restored'].includes(stage)
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
  const definitions = {
    illustrious: {
      byteSize: 6938040794,
      sha256: 'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
      type: 'checkpoint',
      name: 'Cyberfalafel',
      versionName: 'Cyberfalafel v-pred v1.2',
      trainedObjective: 'v_prediction',
      origin: { modelId: 1147756, versionId: 2679856, fileId: 2566634 },
      managedId: 700040,
    },
    illustriousEpsilon: {
      byteSize: 6938040416,
      sha256: 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
      type: 'checkpoint',
      name: 'NoobAI-XL (NAI-XL)',
      versionName: 'Epsilon-pred 1.0-Version',
      trainedObjective: 'epsilon',
      origin: { modelId: 833294, versionId: 1022833, fileId: 928571 },
      managedId: 700140,
    },
    illustriousLora: {
      byteSize: 114437420,
      sha256: 'c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9',
      type: 'lora',
      name: 'Digital Art',
      versionName: 'Illustrious-XL v0.1',
      managedId: 700060,
    },
    externalVaeNative: {
      byteSize: 167335542,
      sha256: 'f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7',
      type: 'vae',
      name: 'NoobAI EPS derived VAE',
      versionName: 'Official EPS extracted native',
      managedId: 700080,
    },
  }
  return {
    appData,
    ...Object.fromEntries(
      Object.entries(definitions).map(([key, { managedId, ...definition }]) => [
        key,
        {
          ...definition,
          family: 'illustrious',
          path: path.join(root, `pool/sources/${key}.safetensors`),
          installed: {
            resourceId: `resource-${key}`,
            versionId: `version-${key}`,
            managedPath: path.join(appData, 'models', `qualified-${managedId}.safetensors`),
          },
        },
      ]),
    ),
  }
}

function reference(fixture, key) {
  const source = fixture[key]
  const ids = {
    illustrious: [1147756, 2679856, 2566634],
    illustriousEpsilon: [833294, 1022833, 928571],
    illustriousLora: [700060, 700061, 700062],
    externalVaeNative: [700070, 700081, 700082],
  }[key]
  return {
    baseModelFamily: 'illustrious',
    civitaiModelId: ids[0],
    civitaiVersionId: ids[1],
    civitaiFileId: ids[2],
    displayName: source.name,
    fileSha256: source.sha256,
    kind: source.type,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    predictionType: source.trainedObjective ?? null,
    versionName: source.versionName,
  }
}

function workerFile(fixture, key) {
  const source = fixture[key]
  return { byteSize: source.byteSize, path: source.installed.managedPath, sha256: source.sha256 }
}

/** Independently authored durable DTO. These are tests of the oracle, never inference evidence. */
function rawFrozen(
  objective,
  { positive = red, negative = blurry, seed = 0, reuse = false } = {},
  fixture = installedFixture(),
) {
  const modelKey = objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'
  const source = fixture[modelKey]
  const lora = reference(fixture, 'illustriousLora')
  const sampler = objective === 'epsilon' ? 'euler_a' : 'euler'
  const noise = {
    schemaVersion: 1,
    baseSchedule: 'sdxl-scaled-linear-v1',
    rescaleBetasZeroSnr: objective === 'v_prediction',
    timestepSpacing: 'leading',
  }
  const target = {
    byteSize: 2048,
    colorSpace: 'srgb',
    format: 'png',
    width: 256,
    height: 256,
    sha256: 'd'.repeat(64),
    iccSha256: icc,
  }
  const bbox = { x: 0, y: 0, width: 256, height: 256 }
  return {
    schemaVersion: 1,
    originRequestId: 'original-dynamic-request',
    kind: 'illustrious-txt2img',
    context: {
      schemaVersion: 1,
      kind: 'normal-txt2img-preparation',
      documentId: 'document-one',
      documentRevision: 'revision-one',
      bbox,
      prompts: { positive, negative },
      target,
      model: { managedPath: source.installed.managedPath, reference: reference(fixture, modelKey) },
      sampling: {
        cfgRescale: 0,
        cfgScale: 5,
        invokeScheduler: sampler,
        noiseProfile: noise,
        requestedSeedPolicy: reuse ? 'reuse' : 'fixed',
        sampler: objective === 'epsilon' ? 'Euler a' : 'Euler',
        scheduler: 'Normal',
        seed,
        seedBehavior: reuse ? 'per-prompt' : 'per-iteration',
        steps: 3,
      },
      loraStack: [{ enabled: true, resource: lora, weight: -0.5 }],
      loras: [
        {
          byteSize: fixture.illustriousLora.byteSize,
          managedPath: fixture.illustriousLora.installed.managedPath,
          reference: lora,
          weight: -0.5,
        },
      ],
      embeddingRefs: { positive: [], negative: [] },
      embeddings: { positive: [], negative: [] },
      vae: {
        byteSize: fixture.externalVaeNative.byteSize,
        managedPath: fixture.externalVaeNative.installed.managedPath,
        reference: reference(fixture, 'externalVaeNative'),
      },
      vaePrecision: 'FP32',
    },
    workerJob: {
      schemaVersion: 1,
      bbox,
      checkpoint: {
        path: source.installed.managedPath,
        predictionType: objective,
        sha256: source.sha256,
      },
      prompts: { positive, negative },
      sampling: {
        cfgRescale: 0,
        cfgScale: 5,
        noiseProfile: noise,
        scheduler: sampler,
        seed,
        steps: 3,
      },
      loras: [{ ...workerFile(fixture, 'illustriousLora'), weight: -0.5 }],
      vae: workerFile(fixture, 'externalVaeNative'),
      vaePrecision: 'FP32',
      target: { byteSize: 2048, width: 256, height: 256, sha256: 'd'.repeat(64), iccSha256: icc },
    },
  }
}

function rawConfiguration(
  objective,
  { positive = red, negative = blurry, seed = 0, reuse = false } = {},
  fixture = installedFixture(),
) {
  return {
    mode: 'txt2img',
    model: reference(fixture, objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'),
    vae: reference(fixture, 'externalVaeNative'),
    vaePrecision: 'FP32',
    cfgRescale: 0,
    loras: [{ enabled: true, resource: reference(fixture, 'illustriousLora'), weight: -0.5 }],
    positivePrompt: { text: positive, embeddingRefs: [] },
    negativePrompt: { text: negative, embeddingRefs: [] },
    sampling: {
      actualSeed: seed,
      cfgScale: 5,
      invokeScheduler: objective === 'epsilon' ? 'euler_a' : 'euler',
      noiseProfile: {
        schemaVersion: 1,
        baseSchedule: 'sdxl-scaled-linear-v1',
        rescaleBetasZeroSnr: objective === 'v_prediction',
        timestepSpacing: 'leading',
      },
      requestedSeedPolicy: reuse ? 'reuse' : 'fixed',
      seedBehavior: reuse ? 'per-prompt' : 'per-iteration',
      sampler: objective === 'epsilon' ? 'Euler a' : 'Euler',
      scheduler: 'Normal',
      steps: 3,
    },
    size: { width: 256, height: 256 },
  }
}

test('both trained objectives have literal pair-first Fixed and Reuse tuples', () => {
  const expectedPairs = [
    [red, blurry, 0],
    [red, blurry, 1],
    [red, noisy, 0],
    [red, noisy, 1],
    [blue, blurry, 0],
    [blue, blurry, 1],
    [blue, noisy, 0],
    [blue, noisy, 1],
  ]
  for (const objective of objectives) {
    const fixed = literalDynamicBatchPlan('iteration', objective)
    const reused = literalDynamicBatchPlan('reuse', objective)
    assert.deepEqual(
      fixed.items.map(({ prompts, seed }) => [prompts.positive, prompts.negative, seed]),
      expectedPairs,
    )
    assert.deepEqual(
      reused.items.map(({ promptPairIndex, iteration, seed }) => [
        promptPairIndex,
        iteration,
        seed,
      ]),
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
      fixed.items.every(
        (item) => item.requestedSeedPolicy === 'fixed' && item.seedBehavior === 'per-iteration',
      ),
    )
    assert.ok(
      reused.items.every(
        (item) => item.requestedSeedPolicy === 'reuse' && item.seedBehavior === 'per-prompt',
      ),
    )
    assert.equal(fixed.sampler, objective === 'epsilon' ? 'euler_a' : 'euler')
    assert.equal(fixed.modelKey, objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious')
    assert.equal(Object.hasOwn(fixed.items[0], 'compiledPrompts'), false)
    assert.ok(Object.isFrozen(fixed.items[0].prompts))
  }
  assert.deepEqual(dynamicBatchSourcePrompts(), {
    positive: 'a {(red:1.3)|(blue:1.3)} ceramic cup on a wooden table, studio photograph',
    negative: '{(blurry:0.7)|(noisy:0.7)}, low quality',
  })
})

test('finite crash and restored counts are distinct from dynamic batch counts', () => {
  for (const objective of objectives) {
    const plans = ['iteration', 'crash', 'reuse', 'restored'].map((stage) =>
      literalDynamicBatchPlan(stage, objective),
    )
    assert.deepEqual(
      plans.map((plan) => [
        plan.expectedCompletions,
        plan.expectedAdmissions,
        plan.expectedCanceled,
      ]),
      [
        [8, 8, 0],
        [1, 3, 2],
        [8, 8, 0],
        [2, 2, 0],
      ],
    )
    assert.deepEqual(
      plans[1].items.map(({ seed }) => seed),
      [0, 1, 2],
    )
    assert.deepEqual(
      plans[3].items.map(({ seed }) => seed),
      [0, 1],
    )
    assert.deepEqual(plans[1].sourcePrompts, { positive: red, negative: blurry })
  }
  assert.throws(() => literalDynamicBatchPlan('iteration', 'sample'))
  assert.throws(() => literalDynamicBatchPlan('random', 'epsilon'))
  assert.throws(() => literalDynamicBatchPlan('iteration'))
})

test('strict wrapper refuses unknown scope, malformed references and lexical artifact collisions', () => {
  for (const objective of objectives)
    for (const stage of ['iteration', 'crash', 'reuse', 'restored'])
      assert.equal(validateDynamicBatchFixture(wrapper(stage, objective)).objective, objective)
  const mutations = [
    (value) => {
      value.schemaVersion = 2
    },
    (value) => {
      value.profile = 'anima-dynamic-batch'
    },
    (value) => {
      value.objective = 'sample'
    },
    (value) => {
      delete value.objective
    },
    (value) => {
      value.stage = 'random'
    },
    (value) => {
      value.extra = true
    },
    (value) => {
      value.referenceFixture.extra = true
    },
    (value) => {
      value.referenceFixture.sha256 = 'A'.repeat(64)
    },
    (value) => {
      value.workerBaseline.sha256 = 'f'.repeat(63)
    },
    (value) => {
      value.artifacts = root
    },
    (value) => {
      value.artifacts = '/tmp/outside'
    },
    (value) => {
      value.artifacts += '/'
    },
    (value) => {
      value.referenceFixture.path = './relative'
    },
    (value) => {
      value.artifacts = path.dirname(value.referenceFixture.path)
    },
    (value) => {
      value.artifacts = value.workerBaseline.path
    },
  ]
  for (const mutate of mutations) {
    const value = wrapper()
    mutate(value)
    assert.throws(() => validateDynamicBatchFixture(value))
  }
  const sibling = wrapper()
  sibling.artifacts = path.join(root, 'runs/entry/native')
  validateDynamicBatchFixture(sibling)
})

test('Reuse, restored and declared installed mutation require their distinct healthy source bindings', () => {
  for (const stage of ['reuse', 'restored']) {
    const value = wrapper(stage)
    delete value[stage === 'reuse' ? 'crashSource' : 'baseline']
    assert.throws(() => validateDynamicBatchFixture(value))
  }
  const mutant = wrapper()
  mutant.baseline = wrapper('restored').baseline
  mutant.mutation = {
    module: 'inference.py',
    originalSha256: 'e'.repeat(64),
    mutatedSha256: 'f'.repeat(64),
  }
  validateDynamicBatchFixture(mutant)
  for (const mutate of [
    (value) => {
      delete value.baseline
    },
    (value) => {
      value.mutation.module = 'anima_euler.py'
    },
    (value) => {
      value.mutation.mutatedSha256 = value.mutation.originalSha256
    },
    (value) => {
      value.stage = 'restored'
    },
    (value) => {
      value.baseline.reportPath = value.artifacts
    },
  ]) {
    const value = structuredClone(mutant)
    mutate(value)
    assert.throws(() => validateDynamicBatchFixture(value))
  }
  const crash = wrapper('crash')
  crash.baseline = wrapper('restored').baseline
  assert.throws(() => validateDynamicBatchFixture(crash))
  const wrong = wrapper()
  wrong.crashSource = wrapper('reuse').crashSource
  assert.throws(() => validateDynamicBatchFixture(wrong))
})

test('oracle validates independently authored EPS and V durable DTOs and concrete portable configurations', () => {
  for (const objective of objectives) {
    for (const [index, [positive, negative, seed]] of [
      [red, blurry, 0],
      [red, blurry, 1],
      [red, noisy, 0],
      [red, noisy, 1],
      [blue, blurry, 0],
      [blue, blurry, 1],
      [blue, noisy, 0],
      [blue, noisy, 1],
    ].entries()) {
      const expected = literalDynamicBatchPlan('iteration', objective).items[index]
      assertDynamicBatchFrozen(
        rawFrozen(objective, { positive, negative, seed }),
        expected,
        installedFixture(),
      )
      assertDynamicBatchConfiguration(
        rawConfiguration(objective, { positive, negative, seed }),
        expected,
        installedFixture(),
      )
    }
    const expected = literalDynamicBatchPlan('reuse', objective).items[7]
    const options = { positive: blue, negative: noisy, seed: 7, reuse: true }
    assertDynamicBatchFrozen(rawFrozen(objective, options), expected, installedFixture())
    assertDynamicBatchConfiguration(
      rawConfiguration(objective, options),
      expected,
      installedFixture(),
    )
  }
})

test('frozen oracle detects paired seed, sign, trained objective, schedule and component substitutions', () => {
  const changes = [
    [
      'paired seed alias',
      (value) => {
        value.context.sampling.seed = value.workerJob.sampling.seed = 1
      },
    ],
    [
      'paired positive weight',
      (value) => {
        value.context.prompts.positive = value.workerJob.prompts.positive = red.replace('1.3', '1')
      },
    ],
    [
      'paired negative sign',
      (value) => {
        value.context.prompts.negative = value.workerJob.prompts.negative = noisy
      },
    ],
    [
      'same-family other checkpoint',
      (value) => {
        value.context.model.reference.fileSha256 = value.workerJob.checkpoint.sha256 = 'a'.repeat(
          64,
        )
      },
    ],
    [
      'paired prediction type',
      (value) => {
        value.context.model.reference.predictionType = value.workerJob.checkpoint.predictionType =
          'sample'
      },
    ],
    [
      'paired ZTSNR',
      (value) => {
        value.context.sampling.noiseProfile.rescaleBetasZeroSnr =
          value.workerJob.sampling.noiseProfile.rescaleBetasZeroSnr =
            !value.context.sampling.noiseProfile.rescaleBetasZeroSnr
      },
    ],
    [
      'paired spacing',
      (value) => {
        value.context.sampling.noiseProfile.timestepSpacing =
          value.workerJob.sampling.noiseProfile.timestepSpacing = 'trailing'
      },
    ],
    [
      'paired sampler',
      (value) => {
        value.context.sampling.invokeScheduler = value.workerJob.sampling.scheduler = 'heun'
      },
    ],
    [
      'paired CFG rescale',
      (value) => {
        value.context.sampling.cfgRescale = value.workerJob.sampling.cfgRescale = 0.5
      },
    ],
    [
      'paired CFG',
      (value) => {
        value.context.sampling.cfgScale = value.workerJob.sampling.cfgScale = 4
      },
    ],
    [
      'paired steps',
      (value) => {
        value.context.sampling.steps = value.workerJob.sampling.steps = 4
      },
    ],
    [
      'requested policy',
      (value) => {
        value.context.sampling.requestedSeedPolicy = 'random'
      },
    ],
    [
      'seed behavior',
      (value) => {
        value.context.sampling.seedBehavior = 'per-prompt'
      },
    ],
    [
      'paired LoRA sign',
      (value) => {
        value.context.loraStack[0].weight =
          value.context.loras[0].weight =
          value.workerJob.loras[0].weight =
            0.5
      },
    ],
    [
      'disabled configured LoRA',
      (value) => {
        value.context.loraStack[0].enabled = false
      },
    ],
    [
      'LoRA dropped from wire',
      (value) => {
        value.workerJob.loras = []
      },
    ],
    [
      'unexpected configured LoRA',
      (value) => {
        value.context.loraStack.push(structuredClone(value.context.loraStack[0]))
      },
    ],
    [
      'paired VAE precision',
      (value) => {
        value.context.vaePrecision = value.workerJob.vaePrecision = 'FP16'
      },
    ],
    [
      'embedded VAE substituted',
      (value) => {
        value.context.vae = value.workerJob.vae = null
      },
    ],
    [
      'paired VAE bytes',
      (value) => {
        value.context.vae.byteSize = value.workerJob.vae.byteSize = 167333366
      },
    ],
    [
      'unexpected wire embeddings',
      (value) => {
        value.workerJob.embeddings = { positive: [], negative: [] }
      },
    ],
    [
      'unexpected prompt sidecar',
      (value) => {
        value.context.embeddingRefs.positive.push({ token: '<photo>' })
      },
    ],
    [
      'unexpected effective embedding',
      (value) => {
        value.context.embeddings.negative.push({ token: '<photo>' })
      },
    ],
    [
      'coordinate moved',
      (value) => {
        value.context.bbox.x = value.workerJob.bbox.x = 1
      },
    ],
    [
      'target hash divergence',
      (value) => {
        value.workerJob.target.sha256 = 'c'.repeat(64)
      },
    ],
    [
      'target profile substitution',
      (value) => {
        value.context.target.iccSha256 = value.workerJob.target.iccSha256 = 'c'.repeat(64)
      },
    ],
    [
      'unbounded target bytes',
      (value) => {
        value.context.target.byteSize = value.workerJob.target.byteSize = 32 * 1024 * 1024 + 1
      },
    ],
    [
      'new worker field',
      (value) => {
        value.workerJob.fallback = true
      },
    ],
  ]
  for (const objective of objectives) {
    const expected = literalDynamicBatchPlan('iteration', objective).items[0]
    for (const [label, mutate] of changes) {
      const value = rawFrozen(objective)
      mutate(value)
      assert.throws(
        () => assertDynamicBatchFrozen(value, expected, installedFixture()),
        undefined,
        `${objective}: ${label}`,
      )
    }
  }
})

test('exact installed identities cannot be jointly substituted through the reference fixture', () => {
  for (const objective of objectives) {
    const expected = literalDynamicBatchPlan('iteration', objective).items[0]
    for (const mutate of [
      (fixture) => {
        fixture.illustriousEpsilon.sha256 = 'a'.repeat(64)
      },
      (fixture) => {
        fixture.illustrious.byteSize += 1
      },
      (fixture) => {
        fixture.illustrious.trainedObjective = 'epsilon'
      },
      (fixture) => {
        fixture.illustriousEpsilon.origin.fileId += 1
      },
      (fixture) => {
        fixture.illustriousLora.family = 'anima'
      },
      (fixture) => {
        fixture.externalVaeNative.installed.managedPath = path.join(
          fixture.appData,
          'models',
          'qualified-700070.safetensors',
        )
      },
      (fixture) => {
        fixture.illustriousLora.installed.versionId = ''
      },
    ]) {
      const fixture = installedFixture()
      mutate(fixture)
      assert.throws(() =>
        assertDynamicBatchFrozen(rawFrozen(objective, {}, fixture), expected, fixture),
      )
      assert.throws(() =>
        assertDynamicBatchConfiguration(
          rawConfiguration(objective, {}, fixture),
          expected,
          fixture,
        ),
      )
    }
  }
})

test('portable configuration rejects concrete prompt loss and hidden execution additions', () => {
  for (const objective of objectives) {
    const expected = literalDynamicBatchPlan('iteration', objective).items[0]
    for (const mutate of [
      (value) => {
        value.positivePrompt.text = dynamicBatchSourcePrompts().positive
      },
      (value) => {
        value.negativePrompt.text = ''
      },
      (value) => {
        value.sampling.actualSeed = 1
      },
      (value) => {
        value.sampling.requestedSeedPolicy = 'reuse'
      },
      (value) => {
        delete value.sampling.seedBehavior
      },
      (value) => {
        value.sampling.noiseProfile.rescaleBetasZeroSnr =
          !value.sampling.noiseProfile.rescaleBetasZeroSnr
      },
      (value) => {
        value.model.predictionType = 'sample'
      },
      (value) => {
        value.vaePrecision = 'Auto'
      },
      (value) => {
        delete value.vae
      },
      (value) => {
        value.loras[0].weight = 0.5
      },
      (value) => {
        value.loras[0].enabled = false
      },
      (value) => {
        value.cfgRescale = 0.7
      },
      (value) => {
        value.sampling.denoisingStrength = 0.6
      },
      (value) => {
        value.model.managedPath = installedFixture().illustrious.installed.managedPath
      },
    ]) {
      const value = rawConfiguration(objective)
      mutate(value)
      assert.throws(() => assertDynamicBatchConfiguration(value, expected, installedFixture()))
    }
  }
})

test('cross-Project normalization removes only document identity and keeps all native neighboring axes', () => {
  for (const objective of objectives) {
    const original = rawFrozen(objective)
    const otherDocument = structuredClone(original)
    otherDocument.originRequestId = 'new-request'
    otherDocument.context.documentId = 'other-document'
    otherDocument.context.documentRevision = 'other-revision'
    assert.deepEqual(
      normalizeDynamicNativeInputs(otherDocument),
      normalizeDynamicNativeInputs(original),
    )
    for (const mutate of [
      (value) => {
        value.context.sampling.requestedSeedPolicy = 'reuse'
      },
      (value) => {
        value.context.sampling.seedBehavior = 'per-prompt'
      },
      (value) => {
        value.workerJob.sampling.seed = 1
      },
      (value) => {
        value.workerJob.sampling.noiseProfile.timestepSpacing = 'trailing'
      },
      (value) => {
        value.workerJob.loras[0].weight = 0.5
      },
      (value) => {
        value.workerJob.vae.sha256 = 'a'.repeat(64)
      },
      (value) => {
        value.workerJob.checkpoint.predictionType = 'sample'
      },
      (value) => {
        value.context.prompts.negative = noisy
      },
      (value) => {
        value.workerJob.target.sha256 = 'c'.repeat(64)
      },
    ]) {
      const changed = structuredClone(original)
      mutate(changed)
      assert.notDeepEqual(
        normalizeDynamicNativeInputs(changed),
        normalizeDynamicNativeInputs(original),
      )
    }
    assert.equal(original.context.documentId, 'document-one')
  }
})

test('cross-policy pixel controls retain actual seed, objective and execution metadata', () => {
  for (const objective of objectives) {
    const fixed = rawFrozen(objective)
    const reused = rawFrozen(objective, { reuse: true })
    assert.notDeepEqual(normalizeDynamicNativeInputs(fixed), normalizeDynamicNativeInputs(reused))
    assert.deepEqual(
      normalizeDynamicExecutionInputs(fixed),
      normalizeDynamicExecutionInputs(reused),
    )
    for (const mutate of [
      (value) => {
        value.context.sampling.seed = value.workerJob.sampling.seed = 1
      },
      (value) => {
        value.workerJob.vaePrecision = 'FP16'
      },
      (value) => {
        value.context.loraStack[0].weight = 0
      },
      (value) => {
        value.context.sampling.noiseProfile.rescaleBetasZeroSnr =
          !value.context.sampling.noiseProfile.rescaleBetasZeroSnr
      },
    ]) {
      const changed = structuredClone(reused)
      mutate(changed)
      assert.notDeepEqual(
        normalizeDynamicExecutionInputs(fixed),
        normalizeDynamicExecutionInputs(changed),
      )
    }
    assert.equal(reused.context.sampling.requestedSeedPolicy, 'reuse')
  }
  assert.notDeepEqual(
    normalizeDynamicExecutionInputs(rawFrozen('epsilon')),
    normalizeDynamicExecutionInputs(rawFrozen('v_prediction')),
  )
})
