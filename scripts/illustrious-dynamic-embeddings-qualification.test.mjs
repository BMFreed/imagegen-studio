import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  assertDynamicBatchConfiguration,
  assertDynamicBatchFrozen,
  dynamicBatchSourcePrompts,
  expectedEmbeddingRef,
  literalDynamicBatchPlan,
  normalizeDynamicExecutionInputs,
  normalizeDynamicNativeInputs,
  validateDynamicBatchFixture,
} from './illustrious-dynamic-embeddings-qualification.mjs'

import { planGenerationBatch } from '../src/shared/projects/generation-batch-plan.ts'
import {
  effectiveGenerationEmbeddings,
  workerEmbeddings,
} from '../src/main/projects/illustrious-generation-embeddings.ts'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio')
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const plain = 'a ceramic cup on a wooden table, studio photograph'
const photo = 'a ceramic cup on a wooden table, studio photograph, (<illustriousphoto>:1.3)'
const low = 'low quality'
const negativePhoto = 'low quality, (<illustriousphoto>:0.7)'
const token = '<illustriousphoto>'
const objectives = ['epsilon', 'v_prediction']

function wrapper(stage = 'iteration', objective = 'epsilon') {
  return {
    schemaVersion: 1,
    profile: 'illustrious-dynamic-embeddings',
    objective,
    stage,
    referenceFixture: { path: path.join(root, 'pool/all-models.json'), sha256: 'a'.repeat(64) },
    workerBaseline: {
      path: path.join(root, 'runs/entry/entry-sources.json'),
      sha256: 'd'.repeat(64),
    },
    artifacts: path.join(root, `runs/dynamic-${objective}-${stage}`),
    ...(stage === 'restored'
      ? {
          baseline: {
            reportPath: path.join(root, 'runs/healthy/report.json'),
            reportSha256: 'b'.repeat(64),
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
    embeddingTrained: {
      byteSize: 49736,
      sha256: '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
      type: 'embedding',
      name: 'IllustriousPhoto Embedding',
      versionName: 'WAIv15 1152steps',
      origin: {
        kind: 'civitai-trained',
        modelId: 2360940,
        versionId: 2655289,
        fileId: 2542976,
        url: 'https://civitai.com/api/download/models/2655289?fileId=2542976',
        creator: 'CautionMergeAhead',
        creditRequired: true,
      },
      managedId: 700100,
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
          path: path.join(
            root,
            `pool/sources/${key === 'embeddingTrained' ? 'illustriousphoto' : key}.safetensors`,
          ),
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
    embeddingTrained: [2360940, 2655289, 2542976],
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

/**
 * DTO envelope fixture; effective context and native wire are built by actual production functions.
 * This is a module-boundary check, never an installed inference or persistence claim.
 */
function rawFrozen(
  objective,
  { positive = plain, negative = low, seed = 0 } = {},
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
  const embedding = { token, resource: reference(fixture, 'embeddingTrained') }
  const refs = { positive: [structuredClone(embedding)], negative: [structuredClone(embedding)] }
  const descriptor = {
    token,
    byteSize: fixture.embeddingTrained.byteSize,
    managedPath: fixture.embeddingTrained.installed.managedPath,
    reference: reference(fixture, 'embeddingTrained'),
  }
  const pool = { positive: [structuredClone(descriptor)], negative: [structuredClone(descriptor)] }
  const effective = effectiveGenerationEmbeddings({ positive, negative }, refs, pool)
  const wire = workerEmbeddings({ embeddings: effective })
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
        requestedSeedPolicy: 'fixed',
        sampler: objective === 'epsilon' ? 'Euler a' : 'Euler',
        scheduler: 'Normal',
        seed,
        seedBehavior: 'per-iteration',
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
      embeddingRefs: refs,
      embeddings: effective,
      vae: {
        byteSize: fixture.externalVaeNative.byteSize,
        managedPath: fixture.externalVaeNative.installed.managedPath,
        reference: reference(fixture, 'externalVaeNative'),
      },
      vaePrecision: 'FP32',
    },
    workerJob: {
      schemaVersion: 1,
      ...(wire ? { embeddings: wire } : {}),
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
  { positive = plain, negative = low, seed = 0 } = {},
  fixture = installedFixture(),
) {
  return {
    mode: 'txt2img',
    model: reference(fixture, objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'),
    vae: reference(fixture, 'externalVaeNative'),
    vaePrecision: 'FP32',
    cfgRescale: 0,
    loras: [{ enabled: true, resource: reference(fixture, 'illustriousLora'), weight: -0.5 }],
    positivePrompt: {
      text: positive,
      embeddingRefs:
        positive === photo ? [{ token, resource: reference(fixture, 'embeddingTrained') }] : [],
    },
    negativePrompt: {
      text: negative,
      embeddingRefs:
        negative === negativePhoto
          ? [{ token, resource: reference(fixture, 'embeddingTrained') }]
          : [],
    },
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
      requestedSeedPolicy: 'fixed',
      seedBehavior: 'per-iteration',
      sampler: objective === 'epsilon' ? 'Euler a' : 'Euler',
      scheduler: 'Normal',
      steps: 3,
    },
    size: { width: 256, height: 256 },
  }
}

const literalPairs = [
  [plain, low, false, false],
  [plain, negativePhoto, false, true],
  [photo, low, true, false],
  [photo, negativePhoto, true, true],
]

test('literal four-axis plan and restored prefix match the real dynamic planner with full source templates', () => {
  const source = {
    positive:
      '{a ceramic cup on a wooden table, studio photograph|a ceramic cup on a wooden table, studio photograph, (<illustriousphoto>:1.3)}',
    negative: '{low quality|low quality, (<illustriousphoto>:0.7)}',
  }
  assert.deepEqual(dynamicBatchSourcePrompts(), source)
  for (const objective of objectives) {
    for (const stage of ['iteration', 'restored']) {
      const literal = literalDynamicBatchPlan(stage, objective)
      const count = stage === 'iteration' ? 4 : 2
      const produced = planGenerationBatch({
        baseSeed: 0,
        iterations: 1,
        maxJobs: 32,
        maxPrompts: count,
        negativePrompt: source.negative,
        positivePrompt: source.positive,
        seedBehavior: 'per-iteration',
      })
      const expected = literalPairs.slice(0, count).map(([positive, negative], index) => ({
        promptPairIndex: index,
        iteration: 0,
        seed: 0,
        prompts: { positive, negative },
      }))
      assert.deepEqual(produced.items, expected)
      assert.deepEqual(
        literal.items.map(({ promptPairIndex, iteration, seed, prompts }) => ({
          promptPairIndex,
          iteration,
          seed,
          prompts,
        })),
        expected,
      )
      assert.deepEqual(literal.sourcePrompts, source)
      assert.equal(literal.iterations, 1)
      assert.equal(literal.maxPrompts, count)
      assert.equal(literal.expectedAdmissions, count)
      assert.equal(literal.expectedCompletions, count)
      assert.equal(literal.expectedCanceled, 0)
      assert.equal(literal.sampler, objective === 'epsilon' ? 'euler_a' : 'euler')
      assert.ok(
        literal.items.every(
          (item) => item.requestedSeedPolicy === 'fixed' && item.seedBehavior === 'per-iteration',
        ),
      )
      assert.ok(Object.isFrozen(literal.items[0].prompts))
      assert.throws(() => {
        literal.items[0].prompts.positive = 'substituted'
      })
    }
  }
  for (const stage of ['crash', 'reuse', 'random', '', null])
    assert.throws(() => literalDynamicBatchPlan(stage, 'epsilon'))
  for (const objective of ['sample', 'sdxl', '', undefined])
    assert.throws(() => literalDynamicBatchPlan('iteration', objective))
})

test('strict fixture refuses scope extensions, malformed references and lexical evidence overlap before native work', () => {
  for (const objective of objectives)
    for (const stage of ['iteration', 'restored'])
      validateDynamicBatchFixture(wrapper(stage, objective))
  const changes = [
    (value) => {
      value.schemaVersion = 2
    },
    (value) => {
      value.profile = 'illustrious-dynamic-batch'
    },
    (value) => {
      value.objective = 'sample'
    },
    (value) => {
      delete value.objective
    },
    (value) => {
      value.stage = 'reuse'
    },
    (value) => {
      value.extra = true
    },
    (value) => {
      value.crashSource = wrapper('restored').baseline
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
  for (const change of changes) {
    const value = wrapper()
    change(value)
    assert.throws(() => validateDynamicBatchFixture(value))
  }
  const sibling = wrapper()
  sibling.artifacts = path.join(root, 'runs/entry/native')
  validateDynamicBatchFixture(sibling)
  const restored = wrapper('restored')
  delete restored.baseline
  assert.throws(() => validateDynamicBatchFixture(restored))
})

test('negative tensor mutation is restricted to iteration with distinct pinned source hashes and healthy baseline', () => {
  const mutant = wrapper()
  mutant.baseline = wrapper('restored').baseline
  mutant.mutation = {
    module: 'inference_embeddings.py',
    originalSha256: 'e'.repeat(64),
    mutatedSha256: 'f'.repeat(64),
  }
  validateDynamicBatchFixture(mutant)
  for (const change of [
    (value) => {
      delete value.baseline
    },
    (value) => {
      value.stage = 'restored'
    },
    (value) => {
      value.mutation.module = 'inference.py'
    },
    (value) => {
      value.mutation.extra = true
    },
    (value) => {
      value.mutation.originalSha256 = 'F'.repeat(64)
    },
    (value) => {
      value.mutation.mutatedSha256 = value.mutation.originalSha256
    },
    (value) => {
      value.baseline.reportPath = value.artifacts
    },
    (value) => {
      value.baseline.reportSha256 = 'g'.repeat(64)
    },
  ]) {
    const value = structuredClone(mutant)
    change(value)
    assert.throws(() => validateDynamicBatchFixture(value))
  }
})

test('real effective-subset and worker-wire producers preserve four concrete sign combinations against literal oracle', () => {
  for (const objective of objectives) {
    for (const [
      index,
      [positive, negative, positiveActive, negativeActive],
    ] of literalPairs.entries()) {
      const fixture = installedFixture()
      const produced = rawFrozen(objective, { positive, negative }, fixture)
      const expected = literalDynamicBatchPlan('iteration', objective).items[index]
      assertDynamicBatchFrozen(produced, expected, fixture)
      const fullRef = { token, resource: reference(fixture, 'embeddingTrained') }
      assert.deepEqual(produced.context.embeddingRefs, { positive: [fullRef], negative: [fullRef] })
      assert.deepEqual(
        [produced.context.embeddings.positive.length, produced.context.embeddings.negative.length],
        [positiveActive ? 1 : 0, negativeActive ? 1 : 0],
      )
      assert.equal(
        Object.hasOwn(produced.workerJob, 'embeddings'),
        positiveActive || negativeActive,
      )
      if (positiveActive || negativeActive) {
        const exact = { ...workerFile(fixture, 'embeddingTrained'), token }
        assert.deepEqual(produced.workerJob.embeddings, {
          positive: positiveActive ? [exact] : [],
          negative: negativeActive ? [exact] : [],
        })
      }
      assertDynamicBatchConfiguration(
        rawConfiguration(objective, { positive, negative }, fixture),
        expected,
        fixture,
      )
      const captured = structuredClone(produced)
      produced.context.embeddingRefs.positive[0].resource.displayName = 'later edit'
      produced.context.embeddingRefs.negative.length = 0
      produced.context.prompts.positive = 'later no embedding'
      assert.deepEqual(produced.context.embeddings, captured.context.embeddings)
      assert.deepEqual(produced.workerJob, captured.workerJob)
    }
  }
})

test('frozen oracle detects inactive leakage, missing active inputs and wrong sign even when context and wire agree', () => {
  for (const objective of objectives) {
    for (const [
      index,
      [positive, negative, positiveActive, negativeActive],
    ] of literalPairs.entries()) {
      const fixture = installedFixture()
      const expected = literalDynamicBatchPlan('iteration', objective).items[index]
      const original = rawFrozen(objective, { positive, negative }, fixture)
      const signedChanges = [
        [
          'positive authored source discarded',
          (value) => {
            value.context.embeddingRefs.positive = []
          },
        ],
        [
          'negative authored source discarded',
          (value) => {
            value.context.embeddingRefs.negative = []
          },
        ],
        [
          'authored reference copied twice',
          (value) => {
            value.context.embeddingRefs.positive.push(
              structuredClone(value.context.embeddingRefs.positive[0]),
            )
          },
        ],
        [
          'deduplicated literal substituted',
          (value) => {
            value.context.embeddingRefs.negative[0].token = '<wrong>'
          },
        ],
      ]
      for (const [sign, active] of [
        ['positive', positiveActive],
        ['negative', negativeActive],
      ]) {
        signedChanges.push([
          `${sign} ${active ? 'active removal' : 'inactive leakage'}`,
          (value) => {
            const full = value.context.embeddingRefs[sign][0]
            value.context.embeddings[sign] = active
              ? []
              : [
                  {
                    byteSize: fixture.embeddingTrained.byteSize,
                    managedPath: fixture.embeddingTrained.installed.managedPath,
                    reference: structuredClone(full.resource),
                    token,
                  },
                ]
            value.workerJob.embeddings ??= { positive: [], negative: [] }
            value.workerJob.embeddings[sign] = active
              ? []
              : [{ ...workerFile(fixture, 'embeddingTrained'), token }]
          },
        ])
        if (active) {
          signedChanges.push([
            `${sign} trained identity replaced`,
            (value) => {
              value.context.embeddings[sign][0].reference.fileSha256 = 'a'.repeat(64)
              value.workerJob.embeddings[sign][0].sha256 = 'a'.repeat(64)
            },
          ])
          signedChanges.push([
            `${sign} byte size replaced`,
            (value) => {
              value.context.embeddings[sign][0].byteSize = value.workerJob.embeddings[
                sign
              ][0].byteSize = 1
            },
          ])
          signedChanges.push([
            `${sign} duplicate file`,
            (value) => {
              value.context.embeddings[sign].push(
                structuredClone(value.context.embeddings[sign][0]),
              )
              value.workerJob.embeddings[sign].push(
                structuredClone(value.workerJob.embeddings[sign][0]),
              )
            },
          ])
        }
      }
      if (!positiveActive && !negativeActive)
        signedChanges.push([
          'empty wire field leaks into ordinary',
          (value) => {
            value.workerJob.embeddings = { positive: [], negative: [] }
          },
        ])
      if (positiveActive !== negativeActive)
        signedChanges.push([
          'sign descriptors swapped',
          (value) => {
            ;[value.context.embeddings.positive, value.context.embeddings.negative] = [
              value.context.embeddings.negative,
              value.context.embeddings.positive,
            ]
            ;[value.workerJob.embeddings.positive, value.workerJob.embeddings.negative] = [
              value.workerJob.embeddings.negative,
              value.workerJob.embeddings.positive,
            ]
          },
        ])
      for (const [label, change] of signedChanges) {
        const value = structuredClone(original)
        change(value)
        assert.throws(
          () => assertDynamicBatchFrozen(value, expected, fixture),
          undefined,
          `${objective} pair${index}: ${label}`,
        )
      }
    }
  }
})

test('fixed sampler, noise, signed LoRA, external VAE and target axes cannot be jointly substituted', () => {
  const changes = [
    (value) => {
      value.context.sampling.seed = value.workerJob.sampling.seed = 37
    },
    (value) => {
      value.context.sampling.requestedSeedPolicy = 'reuse'
    },
    (value) => {
      value.context.sampling.seedBehavior = 'per-prompt'
    },
    (value) => {
      value.context.sampling.invokeScheduler = value.workerJob.sampling.scheduler = 'heun'
    },
    (value) => {
      value.context.sampling.cfgScale = value.workerJob.sampling.cfgScale = 4
    },
    (value) => {
      value.context.sampling.cfgRescale = value.workerJob.sampling.cfgRescale = 0.5
    },
    (value) => {
      value.context.sampling.steps = value.workerJob.sampling.steps = 4
    },
    (value) => {
      value.context.sampling.noiseProfile.rescaleBetasZeroSnr =
        value.workerJob.sampling.noiseProfile.rescaleBetasZeroSnr =
          !value.context.sampling.noiseProfile.rescaleBetasZeroSnr
    },
    (value) => {
      value.context.sampling.noiseProfile.timestepSpacing =
        value.workerJob.sampling.noiseProfile.timestepSpacing = 'trailing'
    },
    (value) => {
      value.context.model.reference.predictionType = value.workerJob.checkpoint.predictionType =
        'sample'
    },
    (value) => {
      value.context.model.reference.fileSha256 = value.workerJob.checkpoint.sha256 = 'a'.repeat(64)
    },
    (value) => {
      value.context.loraStack[0].weight =
        value.context.loras[0].weight =
        value.workerJob.loras[0].weight =
          0.5
    },
    (value) => {
      value.context.loraStack[0].enabled = false
    },
    (value) => {
      value.workerJob.loras = []
    },
    (value) => {
      value.context.vae = value.workerJob.vae = null
    },
    (value) => {
      value.context.vaePrecision = value.workerJob.vaePrecision = 'FP16'
    },
    (value) => {
      value.context.vae.byteSize = value.workerJob.vae.byteSize = 167333366
    },
    (value) => {
      value.context.bbox.x = value.workerJob.bbox.x = 1
    },
    (value) => {
      value.workerJob.target.sha256 = 'c'.repeat(64)
    },
    (value) => {
      value.context.target.iccSha256 = value.workerJob.target.iccSha256 = 'c'.repeat(64)
    },
    (value) => {
      value.context.target.byteSize = value.workerJob.target.byteSize = 32 * 1024 * 1024 + 1
    },
    (value) => {
      value.workerJob.fallback = true
    },
  ]
  for (const objective of objectives) {
    const expected = literalDynamicBatchPlan('iteration', objective).items[3]
    for (const change of changes) {
      const value = rawFrozen(objective, { positive: photo, negative: negativePhoto })
      change(value)
      assert.throws(() => assertDynamicBatchFrozen(value, expected, installedFixture()))
    }
  }
})

test('joint fixture substitutions cannot change the exact trained embedding or required origin and credit', () => {
  const changes = [
    (fixture) => {
      fixture.embeddingTrained.sha256 = 'a'.repeat(64)
    },
    (fixture) => {
      fixture.embeddingTrained.byteSize = 49735
    },
    (fixture) => {
      fixture.embeddingTrained.type = 'lora'
    },
    (fixture) => {
      fixture.embeddingTrained.family = 'anima'
    },
    (fixture) => {
      fixture.embeddingTrained.name = 'Different title'
    },
    (fixture) => {
      fixture.embeddingTrained.versionName = 'Different version'
    },
    (fixture) => {
      fixture.embeddingTrained.path = path.join(root, 'pool/ILLUSTRIOUSPHOTO.safetensors')
    },
    (fixture) => {
      fixture.embeddingTrained.installed.managedPath = path.join(root, 'pool/trained.safetensors')
    },
    (fixture) => {
      fixture.embeddingTrained.installed.extra = true
    },
    (fixture) => {
      fixture.embeddingTrained.origin.creditRequired = false
    },
    (fixture) => {
      fixture.embeddingTrained.origin.creator = 'Someone else'
    },
    (fixture) => {
      fixture.embeddingTrained.origin.fileId = 1
    },
    (fixture) => {
      fixture.embeddingTrained.origin.extra = true
    },
  ]
  for (const change of changes) {
    const fixture = installedFixture()
    change(fixture)
    assert.throws(() => expectedEmbeddingRef(fixture))
    const expected = literalDynamicBatchPlan('iteration', 'epsilon').items[3]
    assert.throws(() =>
      assertDynamicBatchFrozen(
        rawFrozen('epsilon', { positive: photo, negative: negativePhoto }, fixture),
        expected,
        fixture,
      ),
    )
  }
  const ref = expectedEmbeddingRef(installedFixture())
  assert.equal(ref.token, token)
  assert.equal(
    ref.resource.fileSha256,
    '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
  )
  assert.equal(ref.resource.civitaiFileId, 2542976)
  assert.equal(ref.resource.civitaiVersionId, 2655289)
  assert.equal(ref.resource.civitaiModelId, 2360940)
  assert.ok(Object.isFrozen(ref.resource))
})

test('portable oracle requires only concrete active signed refs and rejects all operational leakage', () => {
  for (const objective of objectives) {
    for (const [
      index,
      [positive, negative, positiveActive, negativeActive],
    ] of literalPairs.entries()) {
      const fixture = installedFixture()
      const original = rawConfiguration(objective, { positive, negative }, fixture)
      const expected = literalDynamicBatchPlan('iteration', objective).items[index]
      assertDynamicBatchConfiguration(original, expected, fixture)
      for (const [sign, active] of [
        ['positive', positiveActive],
        ['negative', negativeActive],
      ]) {
        const value = structuredClone(original)
        value[`${sign}Prompt`].embeddingRefs = active
          ? []
          : [{ token, resource: reference(fixture, 'embeddingTrained') }]
        assert.throws(() => assertDynamicBatchConfiguration(value, expected, fixture))
      }
      for (const change of [
        (value) => {
          value.positivePrompt.text = 'later authoring'
        },
        (value) => {
          value.sampling.actualSeed = 37
        },
        (value) => {
          value.workerAlias = '__igs_embedding_0'
        },
        (value) => {
          value.embeddingPath = fixture.embeddingTrained.installed.managedPath
        },
        (value) => {
          value.template = dynamicBatchSourcePrompts().positive
        },
      ]) {
        const value = structuredClone(original)
        change(value)
        assert.throws(() => assertDynamicBatchConfiguration(value, expected, fixture))
      }
    }
  }
})

test('normalizers detach and preserve authored refs, concrete signs and exact native files while omitting document identity only', () => {
  const frozen = rawFrozen('epsilon', { positive: plain, negative: negativePhoto })
  const otherDocument = structuredClone(frozen)
  otherDocument.originRequestId = 'different request'
  otherDocument.context.documentId = 'different document'
  otherDocument.context.documentRevision = 'different revision'
  assert.deepEqual(
    normalizeDynamicNativeInputs(frozen),
    normalizeDynamicNativeInputs(otherDocument),
  )
  const normalized = normalizeDynamicNativeInputs(frozen)
  assert.deepEqual(normalized.context.embeddingRefs, frozen.context.embeddingRefs)
  assert.deepEqual(normalized.context.embeddings, frozen.context.embeddings)
  assert.deepEqual(normalized.workerJob.embeddings, frozen.workerJob.embeddings)
  normalized.context.embeddingRefs.negative[0].resource.displayName = 'local change'
  normalized.workerJob.embeddings.negative[0].sha256 = 'a'.repeat(64)
  assert.equal(
    frozen.context.embeddingRefs.negative[0].resource.displayName,
    'IllustriousPhoto Embedding',
  )
  assert.equal(
    frozen.workerJob.embeddings.negative[0].sha256,
    '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
  )
  for (const change of [
    (value) => {
      value.context.embeddingRefs.positive = []
    },
    (value) => {
      value.context.embeddings.negative[0].managedPath = '/different-file'
    },
    (value) => {
      value.workerJob.embeddings.negative[0].path = '/different-file'
    },
    (value) => {
      value.context.embeddings.positive = value.context.embeddings.negative
      value.context.embeddings.negative = []
    },
  ]) {
    const changed = structuredClone(frozen)
    change(changed)
    assert.notDeepEqual(normalizeDynamicNativeInputs(changed), normalizeDynamicNativeInputs(frozen))
    assert.notDeepEqual(
      normalizeDynamicExecutionInputs(changed),
      normalizeDynamicExecutionInputs(frozen),
    )
  }
  const policy = structuredClone(frozen)
  policy.context.sampling.requestedSeedPolicy = 'reuse'
  policy.context.sampling.seedBehavior = 'per-prompt'
  assert.notDeepEqual(normalizeDynamicNativeInputs(policy), normalizeDynamicNativeInputs(frozen))
  assert.deepEqual(normalizeDynamicExecutionInputs(policy), normalizeDynamicExecutionInputs(frozen))
})
