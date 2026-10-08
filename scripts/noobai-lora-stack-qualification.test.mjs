/** Literal fixtures test pure guards only; no installed runtime, trained inference or UI jobs. */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import { validateNoobaiComponentsFixture } from './noobai-components-qualification.mjs'
import {
  assertNoobaiLoraStackCatalog,
  assertNoobaiLoraStackCatalogPreserved,
  assertNoobaiLoraStackConfiguration,
  assertNoobaiLoraStackDescription,
  assertNoobaiLoraStackFrozen,
  assertNoobaiLoraStackPixels,
  assertNoobaiLoraStackStageOutcome,
  loraStackChoices,
  loraStackPublicationIds,
  normalizeNoobaiLoraStackInputs,
  validateNoobaiLoraStackFixture,
} from './noobai-lora-stack-qualification.mjs'
import { validateNoobaiVaeEncoderFixture } from './noobai-vae-encoder-qualification.mjs'

const epsSha = 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1'
const firstSha = 'c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9'
const secondSha = '90f9f879ff2e27fcaec5723a2c3e5db53ec5ffbdd4c7df49159c0ccbfe63b1ca'
const nativeSha = 'f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7'
const trainedSha = '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36'
const ids = {
  illustrious: [700040, 1147756, 2679856, 2566634],
  illustriousEpsilon: [700140, 833294, 1022833, 928571],
  illustriousLora: [700060, 700060, 700061, 700062],
  embeddingTrained: [700100, 2360940, 2655289, 2542976],
  embeddingControl: [700110, 2360940, 700111, 700112],
  externalVaeLdm: [700070, 700070, 700071, 700072],
  externalVaeNative: [700080, 700070, 700081, 700082],
  externalVaeControl: [700090, 700070, 700091, 700092],
  externalVaeEncoderControl: [700085, 700070, 700083, 700084],
  illustriousLoraSecond: [700150, 1795307, 2031703, 1934353],
}
const ready = {
  workerVersion: '0.14.0',
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  capabilities: [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
    'illustrious-lora',
    'illustrious-vae-precision',
    'illustrious-external-vae',
    'illustrious-embeddings',
    'illustrious-outpaint',
    'illustrious-euler',
    'illustrious-noise-profile',
  ],
}
function checkpointOrigin(modelId, versionId, fileId, creator) {
  return {
    kind: 'civitai-trained',
    modelId,
    versionId,
    fileId,
    creator,
    baseModel: 'NoobAI',
    url: `https://civitai.com/api/download/models/${versionId}?fileId=${fileId}`,
    modelApi: `https://civitai.com/api/v1/models/${modelId}`,
    versionApi: `https://civitai.com/api/v1/model-versions/${versionId}`,
  }
}
function policy(objective, author = false) {
  return {
    width: author ? 832 : 256,
    height: author ? 1216 : 256,
    steps: author ? 28 : 3,
    cfgScale: 5,
    sampler: objective === 'epsilon' ? 'euler_a' : 'euler',
    scheduler: 'normal',
    predictionType: objective,
    noiseProfile: {
      schemaVersion: 1,
      baseSchedule: 'sdxl-scaled-linear-v1',
      rescaleBetasZeroSnr: objective !== 'epsilon',
      timestepSpacing: 'leading',
    },
  }
}
function descriptor(type, filename, sha256, byteSize, name, versionName, origin) {
  return {
    path: `/original/${filename}.safetensors`,
    sha256,
    byteSize,
    type,
    family: 'illustrious',
    name,
    versionName,
    ...(origin ? { origin } : {}),
  }
}
function fixture(objective = 'epsilon', installed = false) {
  const value = {
    schemaVersion: 1,
    profile: 'noobai-lora-stack',
    stage: 'txt2img',
    objective,
    appData: '/owned/data/imagegen-studio',
    artifacts: '/owned/evidence',
    side: 256,
    steps: 3,
    illustrious: {
      ...descriptor('checkpoint', 'cyber', 'a'.repeat(64), 999, 'Cyber', 'v-trained'),
      predictionType: null,
      trainedObjective: 'v_prediction',
      origin: checkpointOrigin(1147756, 2679856, 2566634, 'Knightus_Ai'),
    },
    illustriousEpsilon: {
      ...descriptor('checkpoint', 'noob-eps', epsSha, 6938040416, 'Noob', 'eps1.0'),
      predictionType: null,
      trainedObjective: 'epsilon',
      origin: checkpointOrigin(833294, 1022833, 928571, 'L_A_X'),
    },
    illustriousLora: descriptor(
      'lora',
      'Digital_Art',
      firstSha,
      114437420,
      'Digital Art',
      'trained',
    ),
    illustriousLoraSecond: descriptor(
      'lora',
      'Lineless_Digital_Painting_Style',
      secondSha,
      171540060,
      'Lineless Digital Painting',
      'Lineless Digital Painting Style',
      {
        kind: 'civitai-trained',
        modelId: 1795307,
        versionId: 2031703,
        fileId: 1934353,
        url: 'https://civitai.com/api/download/models/2031703?fileId=1934353',
        creator: 'Underdorks',
        creditRequired: true,
      },
    ),
    embeddingTrained: descriptor('embedding', 'Photo', trainedSha, 49736, 'Photo', 'trained', {
      kind: 'civitai-trained',
      modelId: 2360940,
      versionId: 2655289,
      fileId: 2542976,
      url: 'https://civitai.com/api/download/models/2655289?fileId=2542976',
      creator: 'CautionMergeAhead',
      creditRequired: true,
    }),
    embeddingControl: {
      ...descriptor('embedding', 'Photo', 'c'.repeat(64), 49552, 'Photo', 'zero', {
        kind: 'artificial-zero-control',
        sourceEmbeddingSha256: trainedSha,
      }),
      path: '/zero/Photo.safetensors',
    },
    externalVaeLdm: descriptor(
      'vae',
      'ldm',
      '642ca8780b893744a5a66f9dc762768186bb3c4d7a4b17fde2de3845377b7481',
      167333366,
      'Noob extracted VAE',
      'LDM',
      { kind: 'checkpoint-extraction', checkpointSha256: epsSha, format: 'original-ldm' },
    ),
    externalVaeNative: descriptor(
      'vae',
      'native',
      nativeSha,
      167335542,
      'Noob extracted VAE',
      'native',
      { kind: 'checkpoint-extraction', checkpointSha256: epsSha, format: 'diffusers' },
    ),
    externalVaeControl: descriptor(
      'vae',
      'decoder-control',
      'd'.repeat(64),
      167335598,
      'Noob extracted VAE',
      'decoder control',
      {
        kind: 'artificial-causal-control',
        sourceVaeSha256: nativeSha,
        format: 'diffusers',
        decoderBiasAdd: 0.15,
      },
    ),
    externalVaeEncoderControl: descriptor(
      'vae',
      'encoder-control',
      '9'.repeat(64),
      167335598,
      'Noob extracted VAE',
      'encoder control',
      {
        kind: 'artificial-encoder-control',
        sourceVaeSha256: nativeSha,
        format: 'diffusers',
        encoderOutputBiasAdd: 0.5,
      },
    ),
    authorRecipes: {
      illustrious: {
        sourceRevision: '66aa55e3469c27c29a89813cd35dd95fb7485fa1',
        sourceSha256: 'aaab159149a518c3366dd9da14798a64e3672a7147d67ff247582116f3624537',
        sourceUrl:
          'https://huggingface.co/Laxhar/noobai-XL-Vpred-1.0/resolve/66aa55e3469c27c29a89813cd35dd95fb7485fa1/README.md',
        attribution: 'upstream-on-credited-derivative',
        assumedFields: ['timestepSpacing'],
        execution: policy('v_prediction', true),
      },
      illustriousEpsilon: {
        sourceRevision: '70dee4d903b83cc6d1e8d12e65051cfdbcf54ab3',
        sourceSha256: '4359aa848981aa7f8c1a2e28f9b6a692f829a184f1995431630f9c1751e6fd87',
        sourceUrl:
          'https://huggingface.co/Laxhar/noobai-XL-1.0/resolve/70dee4d903b83cc6d1e8d12e65051cfdbcf54ab3/README.md',
        attribution: 'checkpoint-author',
        assumedFields: ['timestepSpacing'],
        execution: policy('epsilon', true),
      },
    },
  }
  if (installed)
    for (const [key, [managedId, modelId]] of Object.entries(ids))
      value[key].installed = {
        resourceId: `resource-${modelId}`,
        versionId: `version-${managedId}`,
        managedPath: `/owned/data/imagegen-studio/models/qualified-${managedId}.safetensors`,
      }
  return value
}
function reference(value, key, predictionType = null) {
  const source = value[key]
  const [, modelId, versionId, fileId] = ids[key]
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: fileId,
    civitaiModelId: modelId,
    civitaiVersionId: versionId,
    displayName: source.name,
    fileSha256: source.sha256,
    kind: source.type,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    predictionType,
    versionName: source.versionName,
  }
}
// This independent literal case table does not call the subject's selector or normalizer.
function configured(value, choice) {
  const a = { enabled: true, resource: reference(value, 'illustriousLora'), weight: -0.5 }
  const b = { enabled: true, resource: reference(value, 'illustriousLoraSecond'), weight: 0.75 }
  if (choice === 'ab') return [a, b]
  if (choice === 'ba') return [b, a]
  if (choice === 'b-zero') return [a, { ...b, weight: 0 }]
  assert.equal(choice, 'b-disabled')
  return [a, { ...b, enabled: false }]
}
function frozen(value, choice = 'ab') {
  const modelKey = value.objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'
  const checkpoint = value[modelKey]
  const vae = value.externalVaeNative
  const stack = configured(value, choice)
  const active = stack.filter(({ enabled }) => enabled)
  const sourceFor = (entry) =>
    entry.resource.fileSha256 === firstSha ? value.illustriousLora : value.illustriousLoraSecond
  const sampling = policy(value.objective)
  const target = { sha256: 'e'.repeat(64), byteSize: 2345, width: 256, height: 256 }
  const prompts = { positive: 'a cup, <Photo>', negative: 'blurry, <Photo>' }
  const result = {
    kind: 'illustrious-txt2img',
    context: {
      documentId: `document-${choice}`,
      documentRevision: 2,
      bbox: { x: 0, y: 0, width: 256, height: 256 },
      model: {
        managedPath: checkpoint.installed.managedPath,
        reference: reference(value, modelKey, value.objective),
      },
      prompts,
      target,
      vaePrecision: 'FP32',
      vae: {
        byteSize: vae.byteSize,
        managedPath: vae.installed.managedPath,
        reference: reference(value, 'externalVaeNative'),
      },
      sampling: {
        steps: 3,
        cfgScale: 5,
        cfgRescale: 0,
        invokeScheduler: sampling.sampler,
        sampler: value.objective === 'epsilon' ? 'Euler a' : 'Euler',
        scheduler: 'Normal',
        noiseProfile: structuredClone(sampling.noiseProfile),
        seed: 0,
        requestedSeedPolicy: 'fixed',
        seedBehavior: 'per-iteration',
      },
      loraStack: stack,
      loras: active.map((entry) => ({
        byteSize: sourceFor(entry).byteSize,
        managedPath: sourceFor(entry).installed.managedPath,
        reference: entry.resource,
        weight: entry.weight,
      })),
      embeddingRefs: {},
      embeddings: {},
    },
    workerJob: {
      requestId: `request-${choice}`,
      schemaVersion: 1,
      bbox: { x: 0, y: 0, width: 256, height: 256 },
      checkpoint: {
        path: checkpoint.installed.managedPath,
        predictionType: value.objective,
        sha256: checkpoint.sha256,
      },
      prompts: structuredClone(prompts),
      sampling: {
        steps: 3,
        cfgScale: 5,
        cfgRescale: 0,
        scheduler: sampling.sampler,
        noiseProfile: structuredClone(sampling.noiseProfile),
        seed: 0,
      },
      target: { ...target, path: `/private/${choice}/target.png` },
      vaePrecision: 'FP32',
      vae: { byteSize: vae.byteSize, path: vae.installed.managedPath, sha256: vae.sha256 },
      loras: active.map((entry) => ({
        byteSize: sourceFor(entry).byteSize,
        path: sourceFor(entry).installed.managedPath,
        sha256: sourceFor(entry).sha256,
        weight: entry.weight,
      })),
      embeddings: {},
    },
  }
  for (const polarity of ['positive', 'negative']) {
    const source = value.embeddingTrained
    const resource = reference(value, 'embeddingTrained')
    result.context.embeddingRefs[polarity] = [{ token: '<Photo>', resource }]
    result.context.embeddings[polarity] = [
      {
        token: '<Photo>',
        byteSize: source.byteSize,
        managedPath: source.installed.managedPath,
        reference: resource,
      },
    ]
    result.workerJob.embeddings[polarity] = [
      {
        token: '<Photo>',
        byteSize: source.byteSize,
        path: source.installed.managedPath,
        sha256: source.sha256,
      },
    ]
  }
  return result
}
function configuration(value, choice) {
  const sampling = policy(value.objective)
  return {
    mode: 'txt2img',
    model: reference(
      value,
      value.objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious',
      value.objective,
    ),
    vae: reference(value, 'externalVaeNative'),
    vaePrecision: 'FP32',
    cfgRescale: 0,
    loras: configured(value, choice),
    positivePrompt: {
      text: 'a cup, <Photo>',
      embeddingRefs: [{ token: '<Photo>', resource: reference(value, 'embeddingTrained') }],
    },
    negativePrompt: {
      text: 'blurry, <Photo>',
      embeddingRefs: [{ token: '<Photo>', resource: reference(value, 'embeddingTrained') }],
    },
    sampling: {
      actualSeed: 0,
      cfgScale: 5,
      invokeScheduler: sampling.sampler,
      requestedSeedPolicy: 'fixed',
      seedBehavior: 'per-iteration',
      sampler: value.objective === 'epsilon' ? 'Euler a' : 'Euler',
      scheduler: 'Normal',
      steps: 3,
      noiseProfile: structuredClone(sampling.noiseProfile),
    },
    size: { width: 256, height: 256 },
  }
}
function catalog(value, second = true) {
  const resources = new Map()
  for (const [key, [managedId, modelId, versionId, fileId]] of Object.entries(ids)) {
    if (!second && key === 'illustriousLoraSecond') continue
    const source = value[key]
    if (!resources.has(modelId)) {
      const resource = {
        id: source.installed.resourceId,
        type: source.type,
        displayName: source.name,
        source: { kind: 'civitai', modelId },
        sourceMetadata: { qualificationPrecondition: true },
        defaultVersionId: source.installed.versionId,
        sourceCheckedAt: '2026-10-08T10:00:00.000Z',
        versions: [],
      }
      if (
        ['illustrious', 'illustriousEpsilon', 'embeddingTrained', 'illustriousLoraSecond'].includes(
          key,
        )
      ) {
        resource.creator = source.origin.creator
        resource.sourceMetadata.origin = structuredClone(source.origin)
      }
      resources.set(modelId, resource)
    }
    resources.get(modelId).versions.push({
      id: `version-${managedId}`,
      name: source.versionName,
      createdAt: '2026-10-08T10:00:00.000Z',
      file: {
        sha256: source.sha256,
        sizeBytes: source.byteSize,
        status: 'ready',
        originalFilename: path.basename(source.path),
        managedPath: source.installed.managedPath,
      },
      expectedSha256: source.sha256,
      format: 'safetensors',
      baseModelFamily: 'illustrious',
      predictionType: null,
      civitaiVersionId: versionId,
      civitaiFileId: fileId,
      dependencyVersionIds: {},
      sourceMetadata: {
        qualificationPrecondition: true,
        ...(source.origin ? { origin: structuredClone(source.origin) } : {}),
      },
    })
  }
  return [...resources.values()]
}
function cases(value) {
  return ['ab', 'ba', 'b-zero', 'b-disabled'].map((choice, index) => ({
    choice,
    frozen: frozen(value, choice),
    target: { width: 256, height: 256, sha256: 'e'.repeat(64), pixelSha256: 'f'.repeat(64) },
    dimensions: {
      width: 256,
      height: 256,
      pixelSha256: (index >= 2 ? '3' : String(index + 1)).repeat(64),
    },
  }))
}

test('profile pins two genuine sources, four TXT cases and separate 6/10 catalog', () => {
  assert.deepEqual(loraStackChoices, ['ab', 'ba', 'b-zero', 'b-disabled'])
  assert.deepEqual(loraStackPublicationIds, {
    managedId: 700150,
    modelId: 1795307,
    versionId: 2031703,
    fileId: 1934353,
  })
  for (const objective of ['epsilon', 'v_prediction']) {
    const plan = validateNoobaiLoraStackFixture(fixture(objective), ready)
    assert.deepEqual(plan.choices, ['ab', 'ba', 'b-zero', 'b-disabled'])
    assert.deepEqual(plan.expectedOutcome, {
      finiteCompletions: 4,
      actualAdmissions: 4,
      canceledOriginals: 0,
      preservingRetryRefusals: 0,
    })
    assert.equal(plan.expectedCatalogResources, 6)
    assert.equal(plan.expectedCatalogVersions, 10)
    assert.equal(plan.maximumAdditionalManagedFiles, 1)
    assert.equal(plan.matchedPixelControlCases, 2)
    assert.equal(plan.fullMvpClaim, false)
    assert.equal(plan.combinedMatrixClaim, false)
  }
})

test('fixture refuses unsupported stages, substitutes, origin drift and malformed baseline', async (t) => {
  const neighbors = [
    (v) => {
      v.stage = 'img2img'
    },
    (v) => {
      v.stage = 'outpaint'
    },
    (v) => {
      v.objective = 'unknown'
    },
    (v) => {
      v.side = 512
    },
    (v) => {
      v.steps = 4
    },
    (v) => {
      v.illustriousLora.sha256 = 'b'.repeat(64)
    },
    (v) => {
      v.illustriousLoraSecond.sha256 = firstSha
    },
    (v) => {
      v.illustriousLoraSecond.byteSize++
    },
    (v) => {
      v.illustriousLoraSecond.origin.creditRequired = false
    },
    (v) => {
      v.illustriousLoraSecond.origin.fileId++
    },
    (v) => {
      v.illustriousLoraSecond.family = 'sdxl'
    },
    (v) => {
      v.illustriousLoraSecond.origin.creator = 'anonymous'
    },
    (v) => {
      v.illustriousLoraSecond.path = '/original/../Lineless.safetensors'
    },
    (v) => {
      v.illustriousLoraSecond.extra = true
    },
    (v) => {
      v.loraPixelBaseline = { reportPath: 'relative.json', reportSha256: 'a'.repeat(64) }
    },
    (v) => {
      v.loraPixelBaseline = { reportPath: '/owned/normal.json', reportSha256: 'wrong' }
    },
    (v) => {
      v.loraPixelBaseline = {
        reportPath: '/owned/normal.json',
        reportSha256: 'a'.repeat(64),
        trusted: true,
      }
    },
  ]
  for (const [index, mutate] of neighbors.entries())
    await t.test(`neighbor ${index}`, () => {
      const value = fixture()
      mutate(value)
      assert.throws(() => validateNoobaiLoraStackFixture(value, ready))
    })
  const baseline = fixture()
  baseline.loraPixelBaseline = { reportPath: '/owned/normal.json', reportSha256: 'a'.repeat(64) }
  assert.doesNotThrow(() => validateNoobaiLoraStackFixture(baseline, ready))
  assert.throws(() =>
    validateNoobaiLoraStackFixture(fixture(), { ...ready, workerVersion: '0.13.0' }),
  )
  assert.throws(() =>
    validateNoobaiLoraStackFixture(fixture(), {
      ...ready,
      capabilities: ready.capabilities.filter((value) => value !== 'illustrious-lora'),
    }),
  )
})

test('old component and encoder fixture validators retain strict source closure', () => {
  const value = fixture()
  value.profile = 'noobai-vae-encoder'
  assert.throws(() => validateNoobaiVaeEncoderFixture(value, ready))
  delete value.illustriousLoraSecond
  assert.doesNotThrow(() => validateNoobaiVaeEncoderFixture(value, ready))
  value.profile = 'noobai-components'
  assert.throws(() => validateNoobaiComponentsFixture(value, ready))
  delete value.externalVaeEncoderControl
  assert.doesNotThrow(() => validateNoobaiComponentsFixture(value, ready))
})

test('one explicit Lineless adoption preserves all original 5/9 owners and exact IDs', () => {
  const value = fixture('epsilon', true)
  const old = catalog(value, false)
  const current = catalog(value)
  assert.equal(old.length, 5)
  assert.equal(old.flatMap(({ versions }) => versions).length, 9)
  assert.equal(assertNoobaiLoraStackCatalog(old, value, { adopting: true }).size, 6)
  assert.throws(() => assertNoobaiLoraStackCatalog(old, value))
  assert.equal(assertNoobaiLoraStackCatalog(current, value).size, 7)
  assert.deepEqual(assertNoobaiLoraStackCatalogPreserved(current, old, value), [
    {
      resourceId: 'resource-1795307',
      versionId: 'version-700150',
      sourceCheckedAt: '2026-10-08T10:00:00.000Z',
      createdAt: '2026-10-08T10:00:00.000Z',
    },
  ])
  assert.deepEqual(
    assertNoobaiLoraStackCatalogPreserved(current, structuredClone(current), value),
    [],
  )
})

test('catalog refuses missing old identities, arbitrary owners, new-source drift and owner mutation', async (t) => {
  const value = fixture('epsilon', true)
  const neighbors = [
    (v) => {
      v.splice(
        v.findIndex((r) => r.type === 'checkpoint'),
        1,
      )
    },
    (v) => {
      const r = v.find((r) => r.type === 'vae')
      r.versions.pop()
    },
    (v) => {
      v.push({ ...structuredClone(v[0]), id: 'extra' })
    },
    (v) => {
      const r = v.at(-1)
      r.versions.push({ ...structuredClone(r.versions[0]), id: 'extra-version' })
    },
    (v) => {
      v.at(-1).defaultVersionId = 'missing'
    },
    (v) => {
      v.at(-1).source.modelId = 700060
    },
    (v) => {
      v.at(-1).sourceMetadata.origin.creditRequired = false
    },
    (v) => {
      v.at(-1).versions[0].civitaiFileId++
    },
    (v) => {
      v.at(-1).versions[0].file.managedPath = '/owned/wrong.safetensors'
    },
    (v) => {
      v.at(-1).versions[0].predictionType = 'epsilon'
    },
    (v) => {
      v.at(-1).id = v[0].id
    },
    (v) => {
      v.at(-1).versions[0].id = v[0].versions[0].id
    },
  ]
  for (const [index, mutate] of neighbors.entries())
    await t.test(`catalog neighbor ${index}`, () => {
      const subject = catalog(value)
      mutate(subject)
      assert.throws(() => assertNoobaiLoraStackCatalog(subject, value, { adopting: true }))
    })
  const old = catalog(value, false)
  const current = catalog(value)
  current[0].sourceCheckedAt = '2026-10-08T11:00:00.000Z'
  assert.throws(() => assertNoobaiLoraStackCatalogPreserved(current, old, value))
  const badTimestamp = catalog(value)
  badTimestamp.at(-1).sourceCheckedAt = '2026-10-08T11:00:00.000Z'
  assert.throws(() => assertNoobaiLoraStackCatalogPreserved(badTimestamp, old, value))
  const reused = catalog(value)
  reused.at(-1).versions[0].createdAt = '2026-10-08T11:00:00.000Z'
  assert.throws(() => assertNoobaiLoraStackCatalogPreserved(reused, catalog(value), value))
})

test('all four ordered stacks agree with their enabled subset in EPS and V', () => {
  for (const objective of ['epsilon', 'v_prediction']) {
    const value = fixture(objective, true)
    for (const choice of ['ab', 'ba', 'b-zero', 'b-disabled']) {
      const subject = frozen(value, choice)
      assert.doesNotThrow(() => assertNoobaiLoraStackFrozen(subject, value, choice))
      assert.doesNotThrow(() =>
        assertNoobaiLoraStackConfiguration(configuration(value, choice), subject, value, choice),
      )
      assert.equal(subject.context.loraStack.length, 2)
      assert.equal(subject.workerJob.loras.length, choice === 'b-disabled' ? 1 : 2)
    }
  }
})

test('strict stack checks refuse omitted adapters, reordering, swapped weights and neighboring axes', async (t) => {
  const value = fixture('epsilon', true)
  const neighbors = [
    (s) => {
      s.context.loraStack.reverse()
    },
    (s) => {
      s.context.loras.reverse()
    },
    (s) => {
      s.workerJob.loras.reverse()
    },
    (s) => {
      s.context.loraStack.pop()
    },
    (s) => {
      s.context.loras.pop()
      s.workerJob.loras.pop()
    },
    (s) => {
      s.context.loraStack[0].weight = 0.75
      s.context.loraStack[1].weight = -0.5
    },
    (s) => {
      s.workerJob.loras[0].weight = 0.75
      s.workerJob.loras[1].weight = -0.5
    },
    (s) => {
      s.context.loraStack[1].enabled = false
    },
    (s) => {
      s.workerJob.loras[1].sha256 = firstSha
    },
    (s) => {
      s.context.loras[1].reference.localVersionId = 'wrong'
    },
    (s) => {
      s.workerJob.vae.sha256 = 'd'.repeat(64)
    },
    (s) => {
      s.workerJob.embeddings.negative[0].sha256 = 'c'.repeat(64)
    },
    (s) => {
      s.context.sampling.noiseProfile.rescaleBetasZeroSnr = true
    },
    (s) => {
      s.workerJob.sampling.cfgScale = 6
    },
    (s) => {
      s.context.sampling.cfgRescale = 0.2
    },
    (s) => {
      s.workerJob.sampling.denoisingStrength = 0.5
    },
  ]
  for (const [index, mutate] of neighbors.entries())
    await t.test(`frozen neighbor ${index}`, () => {
      const subject = frozen(value)
      mutate(subject)
      assert.throws(() => normalizeNoobaiLoraStackInputs(subject, value, 'ab'))
    })
  const zero = frozen(value, 'b-zero')
  zero.context.loras.pop()
  zero.workerJob.loras.pop()
  assert.throws(() => assertNoobaiLoraStackFrozen(zero, value, 'b-zero'))
  const disabled = frozen(value, 'b-disabled')
  disabled.context.loraStack[1].weight = 0
  assert.throws(() => assertNoobaiLoraStackFrozen(disabled, value, 'b-disabled'))
  assert.throws(() => assertNoobaiLoraStackFrozen(frozen(value), value, 'unknown'))
})

test('normalization preserves prompts, signed embedding identities and all non-LoRA fields', () => {
  const value = fixture('epsilon', true)
  const original = cases(value)
  const snapshot = structuredClone(original)
  const normalized = original.map((item) =>
    normalizeNoobaiLoraStackInputs(item.frozen, value, item.choice),
  )
  for (const candidate of normalized) assert.deepEqual(candidate, normalized[0])
  assert.deepEqual(original, snapshot)
  const changedText = frozen(value, 'ba')
  changedText.context.prompts.positive += ', daylight'
  changedText.workerJob.prompts.positive = changedText.context.prompts.positive
  const neighbor = normalizeNoobaiLoraStackInputs(changedText, value, 'ba')
  assert.notDeepEqual(neighbor, normalized[0])
  assert.equal(neighbor.context.embeddings.negative[0].reference.fileSha256, trainedSha)
  assert.equal(neighbor.context.vae.reference.fileSha256, nativeSha)
  assert.deepEqual(neighbor.workerJob.sampling.noiseProfile, policy('epsilon').noiseProfile)
})

test('portable provenance retains disabled resource/weight, full order and every neighboring policy', async (t) => {
  const value = fixture('epsilon', true)
  const neighbors = [
    (s) => {
      s.loras.reverse()
    },
    (s) => {
      s.loras.pop()
    },
    (s) => {
      s.loras[1].enabled = false
    },
    (s) => {
      s.loras[1].weight = 0
    },
    (s) => {
      s.loras[1].resource.fileSha256 = firstSha
    },
    (s) => {
      s.loras[1].resource.localVersionId = 'wrong'
    },
    (s) => {
      s.sampling.actualSeed = 37
    },
    (s) => {
      s.sampling.steps = 4
    },
    (s) => {
      s.negativePrompt.embeddingRefs[0].resource.fileSha256 = 'c'.repeat(64)
    },
    (s) => {
      s.vae = null
    },
    (s) => {
      s.size.width = 512
    },
    (s) => {
      s.managedPath = '/owned/data/imagegen-studio/models/qualified-700150.safetensors'
    },
  ]
  for (const [index, mutate] of neighbors.entries())
    await t.test(`portable neighbor ${index}`, () => {
      const subject = configuration(value, 'ab')
      mutate(subject)
      assert.throws(() => assertNoobaiLoraStackConfiguration(subject, frozen(value), value, 'ab'))
    })
  const disabled = configuration(value, 'b-disabled')
  disabled.loras[1].weight = 0
  assert.throws(() =>
    assertNoobaiLoraStackConfiguration(disabled, frozen(value, 'b-disabled'), value, 'b-disabled'),
  )
})

test('pixel relations establish B contribution while leaving AB/BA image relation unconstrained', () => {
  for (const objective of ['epsilon', 'v_prediction']) {
    const value = fixture(objective, true)
    const subject = cases(value)
    assert.deepEqual(assertNoobaiLoraStackPixels(subject, value), {
      enabledZeroEqualsDisabled: true,
      trainedSecondChangesPixels: true,
    })
    subject[1].dimensions.pixelSha256 = subject[0].dimensions.pixelSha256
    assert.doesNotThrow(() => assertNoobaiLoraStackPixels(subject, value))
  }
})

test('pixel guard refuses equal trained/zero, unequal zero/disabled and unrelated matched inputs', async (t) => {
  const value = fixture('epsilon', true)
  const neighbors = [
    (s) => {
      s[2].dimensions.pixelSha256 = s[0].dimensions.pixelSha256
      s[3].dimensions.pixelSha256 = s[0].dimensions.pixelSha256
    },
    (s) => {
      s[1].dimensions.pixelSha256 = s[2].dimensions.pixelSha256
    },
    (s) => {
      s[3].dimensions.pixelSha256 = '4'.repeat(64)
    },
    (s) => {
      s.reverse()
    },
    (s) => {
      s.pop()
    },
    (s) => {
      s[1].target.sha256 = '5'.repeat(64)
    },
    (s) => {
      s[1].dimensions.width = 512
    },
    (s) => {
      s[1].dimensions.pixelSha256 = 'not-a-digest'
    },
    (s) => {
      s[1].frozen.context.target.sha256 = '5'.repeat(64)
    },
    (s) => {
      s[1].frozen.context.prompts.positive += ', daylight'
      s[1].frozen.workerJob.prompts.positive = s[1].frozen.context.prompts.positive
    },
  ]
  for (const [index, mutate] of neighbors.entries())
    await t.test(`pixel neighbor ${index}`, () => {
      const subject = cases(value)
      mutate(subject)
      assert.throws(() => assertNoobaiLoraStackPixels(subject, value))
    })
})

test('multiline comparison descriptions preserve exact adapter order, enablement and weights', () => {
  const stack = configured(fixture('epsilon', true), 'b-disabled')
  const first = `Enabled · Digital Art · trained\nillustrious · lora · SHA-256 ${firstSha}\nCivitAI model 700060 · version 700061 · file 700062 · Weight -0.5`
  const second = `Disabled · Lineless Digital Painting · Lineless Digital Painting Style\nillustrious · lora · SHA-256 ${secondSha}\nCivitAI model 1795307 · version 2031703 · file 1934353 · Weight 0.75`
  const text = `${first}\n${second}`
  assert.doesNotThrow(() => assertNoobaiLoraStackDescription(text, stack))
  for (const changed of [
    text.replace('Weight -0.5', 'Weight 0.75'),
    `${second}\n${first}`,
    text.replace('Disabled ·', 'Enabled ·'),
    first,
    text.replace(secondSha, firstSha),
  ])
    assert.throws(() => assertNoobaiLoraStackDescription(changed, stack))
})

test('each partial objective report has exactly four real completions/admissions and bounded claims', () => {
  const summary = {
    stage: 'txt2img',
    objective: 'epsilon',
    finiteCompletions: 4,
    actualAdmissions: 4,
    canceledOriginals: 0,
    preservingRetryRefusals: 0,
    matchedPixelControlCases: 2,
    fullMvpClaim: false,
    combinedMatrixClaim: false,
  }
  assert.doesNotThrow(() => assertNoobaiLoraStackStageOutcome(summary))
  assert.doesNotThrow(() =>
    assertNoobaiLoraStackStageOutcome({ ...summary, objective: 'v_prediction' }),
  )
  for (const [key, replacement] of Object.entries({
    stage: 'img2img',
    objective: 'unknown',
    finiteCompletions: 3,
    actualAdmissions: 5,
    canceledOriginals: 1,
    preservingRetryRefusals: 1,
    matchedPixelControlCases: 1,
    fullMvpClaim: true,
    combinedMatrixClaim: true,
  }))
    assert.throws(() => assertNoobaiLoraStackStageOutcome({ ...summary, [key]: replacement }))
})
