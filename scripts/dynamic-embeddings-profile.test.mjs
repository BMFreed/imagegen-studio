/** Exercise the real injected profile: routing, full authored refs and post-admission pruning. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { illustriousDynamicEmbeddingsProfile as adapter } from './illustrious-dynamic-embeddings-profile.mjs'
import {
  assertDynamicBatchConfiguration,
  assertDynamicBatchFrozen,
  normalizeDynamicExecutionInputs,
  normalizeDynamicNativeInputs,
  validateDynamicBatchFixture,
} from './illustrious-dynamic-embeddings-qualification.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/embedding-adapter-unit')
function fixture(objective, stage = 'iteration') {
  return {
    schemaVersion: 1,
    profile: 'illustrious-dynamic-embeddings',
    stage,
    objective,
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    artifacts: path.join(root, 'output'),
    ...(stage === 'restored'
      ? { baseline: { reportPath: path.join(root, 'healthy.json'), reportSha256: 'c'.repeat(64) } }
      : {}),
  }
}

function reference() {
  const appData = path.join(root, 'data/imagegen-studio')
  const result = { appData }
  for (const [key, managedId, sha256, byteSize, type, origin, trainedObjective] of [
    [
      'illustriousEpsilon',
      700140,
      'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
      6938040416,
      'checkpoint',
      { modelId: 833294, versionId: 1022833, fileId: 928571 },
      'epsilon',
    ],
    [
      'illustrious',
      700040,
      'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
      6938040794,
      'checkpoint',
      { modelId: 1147756, versionId: 2679856, fileId: 2566634 },
      'v_prediction',
    ],
    [
      'illustriousLora',
      700060,
      'c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9',
      114437420,
      'lora',
    ],
    [
      'externalVaeNative',
      700080,
      'f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7',
      167335542,
      'vae',
    ],
    [
      'embeddingTrained',
      700100,
      '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
      49736,
      'embedding',
      {
        kind: 'civitai-trained',
        modelId: 2360940,
        versionId: 2655289,
        fileId: 2542976,
        url: 'https://civitai.com/api/download/models/2655289?fileId=2542976',
        creator: 'CautionMergeAhead',
        creditRequired: true,
      },
    ],
  ]) {
    result[key] = {
      path: path.join(
        root,
        key === 'embeddingTrained' ? 'illustriousphoto.safetensors' : `${key}.safetensors`,
      ),
      sha256,
      byteSize,
      type,
      family: 'illustrious',
      name: key === 'embeddingTrained' ? 'IllustriousPhoto Embedding' : key,
      versionName: key === 'embeddingTrained' ? 'WAIv15 1152steps' : 'exact version',
      ...(origin ? { origin } : {}),
      ...(trainedObjective ? { trainedObjective } : {}),
      installed: {
        resourceId: `${key}-resource`,
        versionId: `${key}-version`,
        managedPath: path.join(appData, 'models', `qualified-${managedId}.safetensors`),
      },
    }
  }
  return result
}

function embeddingRef() {
  return {
    token: '<illustriousphoto>',
    resource: {
      baseModelFamily: 'illustrious',
      civitaiFileId: 2542976,
      civitaiModelId: 2360940,
      civitaiVersionId: 2655289,
      displayName: 'IllustriousPhoto Embedding',
      fileSha256: '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
      kind: 'embedding',
      localModelId: 'embeddingTrained-resource',
      localVersionId: 'embeddingTrained-version',
      predictionType: null,
      versionName: 'WAIv15 1152steps',
    },
  }
}

test('new embedding adapter binds its independent literal oracle and exact guarded source', () => {
  assert.equal(adapter.validateFixture, validateDynamicBatchFixture)
  assert.equal(adapter.assertFrozen, assertDynamicBatchFrozen)
  assert.equal(adapter.assertConfiguration, assertDynamicBatchConfiguration)
  assert.equal(adapter.normalizeNativeInputs, normalizeDynamicNativeInputs)
  assert.equal(adapter.normalizeExecutionInputs, normalizeDynamicExecutionInputs)
  for (const [objective, modelKey, sampler, edited] of [
    ['epsilon', 'illustriousEpsilon', 'Euler a', 'Euler'],
    ['v_prediction', 'illustrious', 'Euler', 'Euler a'],
  ]) {
    const input = fixture(objective)
    const plan = adapter.validateFixture(input)
    assert.equal(plan.expectedAdmissions, 4)
    assert.equal(plan.iterations, 1)
    assert.deepEqual(
      plan.items.map(({ seed }) => seed),
      [0, 0, 0, 0],
    )
    assert.deepEqual(
      plan.items.map(({ promptPairIndex }) => promptPairIndex),
      [0, 1, 2, 3],
    )
    const restored = adapter.validateFixture(fixture(objective, 'restored'))
    assert.equal(restored.maxPrompts, 2)
    assert.deepEqual(restored.sourcePrompts, plan.sourcePrompts)
    assert.deepEqual(restored.items, plan.items.slice(0, 2))
    assert.equal(adapter.modelKey(input), modelKey)
    assert.equal(adapter.loraKey, 'illustriousLora')
    assert.equal(adapter.operation, 'illustrious-txt2img')
    assert.equal(adapter.cfgScale, 5)
    assert.deepEqual(adapter.originalSourceKeys(input), [
      modelKey,
      'illustriousLora',
      'externalVaeNative',
      'embeddingTrained',
    ])
    assert.deepEqual(adapter.sampling(input), {
      label: 'Sampler',
      draftKey: 'sampler',
      value: sampler,
      code: sampler,
      editedValue: edited,
      editedCode: edited,
      scheduler: 'Normal',
    })
  }
})

test('actual authored adapter assertion rejects a dropped sign or default-version substitution', () => {
  const draft = {
    sampling: { scheduler: 'Normal' },
    vaePrecision: 'FP32',
    vae: {
      localModelId: 'externalVaeNative-resource',
      localVersionId: 'externalVaeNative-version',
      fileSha256: 'f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7',
    },
    positivePrompt: { embeddingRefs: [embeddingRef()] },
    negativePrompt: { embeddingRefs: [embeddingRef()] },
    cfgRescale: 0,
  }
  adapter.assertAuthored(draft, reference())
  for (const sign of ['positivePrompt', 'negativePrompt']) {
    const missing = structuredClone(draft)
    missing[sign].embeddingRefs = []
    assert.throws(() => adapter.assertAuthored(missing, reference()))
    const wrongVersion = structuredClone(draft)
    wrongVersion[sign].embeddingRefs[0].resource.localVersionId = 'zero-control-default-version'
    assert.throws(() => adapter.assertAuthored(wrongVersion, reference()))
  }
})

test('post-admission authoring assertion requires actual sidecar removal on both signs', () => {
  const edited = {
    positivePrompt: { text: 'a (green:1.1) glass bowl, later authoring edit', embeddingRefs: [] },
    negativePrompt: { text: '(grainy:0.8), later authoring edit', embeddingRefs: [] },
    seed: { policy: 'fixed', value: 37 },
  }
  adapter.assertEdited(edited)
  for (const sign of ['positivePrompt', 'negativePrompt']) {
    const stale = structuredClone(edited)
    stale[sign].embeddingRefs = [embeddingRef()]
    assert.throws(() => adapter.assertEdited(stale))
    const textOnly = structuredClone(edited)
    textOnly[sign].text += ', <illustriousphoto>'
    assert.throws(() => adapter.assertEdited(textOnly))
  }
})

test('embedding profile rejects old profiles, unsupported objectives and unsupported stages', () => {
  for (const profile of ['illustrious-dynamic-batch', 'anima-dynamic-batch'])
    assert.throws(() => adapter.validateFixture({ ...fixture('epsilon'), profile }))
  for (const value of [undefined, 'anima', 'sdxl', 'EPS', 'v-prediction']) {
    assert.throws(() => adapter.validateFixture(fixture(value)))
    assert.throws(() => adapter.modelKey({ objective: value }), /Unknown dynamic objective/)
    assert.throws(() => adapter.sampling({ objective: value }), /Unknown dynamic objective/)
  }
  for (const value of ['crash', 'reuse', 'random', 'unknown'])
    assert.throws(() => adapter.validateFixture(fixture('epsilon', value)))
})
