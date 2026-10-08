/** Independent identities, outcome counts and pixel relations; fixture data only, without ML. */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import {
  validateNoobaiComponentsFixture,
  visibleOutpaint,
} from './noobai-components-qualification.mjs'
import {
  assertNoobaiVaeEncoderCatalog,
  assertNoobaiVaeEncoderCatalogPreserved,
  assertNoobaiVaeEncoderFrozen,
  assertNoobaiVaeEncoderPixels,
  assertNoobaiVaeEncoderStageOutcome,
  encoderPublicationIds,
  validateNoobaiVaeEncoderFixture,
} from './noobai-vae-encoder-qualification.mjs'

const epsSha = 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1'
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
function execution(objective, author = false) {
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
function fixture(stage = 'txt2img', objective = 'epsilon') {
  const value = {
    schemaVersion: 1,
    profile: 'noobai-vae-encoder',
    stage,
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
    illustriousLora: descriptor('lora', 'lora', 'b'.repeat(64), 123, 'ordinary LoRA', 'trained'),
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
      ...descriptor('embedding', 'Photo', 'c'.repeat(64), 49736, 'Photo', 'zero', {
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
      167335542,
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
      167335542,
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
        execution: execution('v_prediction', true),
      },
      illustriousEpsilon: {
        sourceRevision: '70dee4d903b83cc6d1e8d12e65051cfdbcf54ab3',
        sourceSha256: '4359aa848981aa7f8c1a2e28f9b6a692f829a184f1995431630f9c1751e6fd87',
        sourceUrl:
          'https://huggingface.co/Laxhar/noobai-XL-1.0/resolve/70dee4d903b83cc6d1e8d12e65051cfdbcf54ab3/README.md',
        attribution: 'checkpoint-author',
        assumedFields: ['timestepSpacing'],
        execution: execution('epsilon', true),
      },
    },
  }
  if (stage === 'img2img' || stage === 'outpaint')
    value.commonSource = {
      path: '/owned/source.png',
      sha256: 'e'.repeat(64),
      byteSize: 2345,
      pixelSha256: 'f'.repeat(64),
      width: 256,
      height: 256,
      sourceQueueItemId: 'source-queue-id',
      sourcePackagePath: '/owned/source.igs',
      objective,
    }
  if (stage === 'outpaint')
    value.lama = {
      path: '/owned/lama.pt',
      sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
      byteSize: 205669692,
    }
  return value
}
function installedFixture(stage = 'txt2img', objective = 'epsilon') {
  const value = fixture(stage, objective)
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
function frozen(value, choice = 'fullstack') {
  const modelKey = value.objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'
  const checkpoint = value[modelKey]
  const vaeKey = choice === 'encoder-control' ? 'externalVaeEncoderControl' : 'externalVaeNative'
  const vae = value[vaeKey]
  const lora = value.illustriousLora
  const policy = execution(value.objective)
  const imageSampling = value.stage === 'txt2img' ? {} : { denoisingStrength: 0.5 }
  const result = {
    kind: `illustrious-${value.stage}`,
    context: {
      documentId: `document-${choice}`,
      documentRevision: 2,
      bbox: { x: 0, y: 0, width: 256, height: 256 },
      model: {
        managedPath: checkpoint.installed.managedPath,
        reference: reference(value, modelKey, value.objective),
      },
      prompts: { positive: 'a cup, <Photo>', negative: 'blurry, <Photo>' },
      sampling: {
        steps: 3,
        cfgScale: 5,
        invokeScheduler: policy.sampler,
        sampler: value.objective === 'epsilon' ? 'Euler a' : 'Euler',
        scheduler: 'Normal',
        noiseProfile: structuredClone(policy.noiseProfile),
        seed: 0,
        requestedSeedPolicy: 'fixed',
        ...imageSampling,
      },
      target: { sha256: 'e'.repeat(64), byteSize: 2345, width: 256, height: 256 },
      vaePrecision: 'FP32',
      vae: {
        byteSize: vae.byteSize,
        managedPath: vae.installed.managedPath,
        reference: reference(value, vaeKey),
      },
      loraStack: [{ enabled: true, resource: reference(value, 'illustriousLora'), weight: -0.5 }],
      loras: [
        {
          byteSize: lora.byteSize,
          managedPath: lora.installed.managedPath,
          reference: reference(value, 'illustriousLora'),
          weight: -0.5,
        },
      ],
      embeddingRefs: {},
      embeddings: {},
    },
    workerJob: {
      bbox: { x: 0, y: 0, width: 256, height: 256 },
      checkpoint: {
        path: checkpoint.installed.managedPath,
        predictionType: value.objective,
        sha256: checkpoint.sha256,
      },
      prompts: { positive: 'a cup, <Photo>', negative: 'blurry, <Photo>' },
      sampling: {
        steps: 3,
        cfgScale: 5,
        scheduler: policy.sampler,
        noiseProfile: structuredClone(policy.noiseProfile),
        seed: 0,
        ...imageSampling,
      },
      target: {
        path: '/private/target.png',
        sha256: 'e'.repeat(64),
        byteSize: 2345,
        width: 256,
        height: 256,
      },
      vaePrecision: 'FP32',
      vae: { byteSize: vae.byteSize, path: vae.installed.managedPath, sha256: vae.sha256 },
      loras: [
        {
          byteSize: lora.byteSize,
          path: lora.installed.managedPath,
          sha256: lora.sha256,
          weight: -0.5,
        },
      ],
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
function catalog(value, encoder = true) {
  const resources = new Map()
  for (const [key, [managedId, modelId, versionId, fileId]] of Object.entries(ids)) {
    if (!encoder && key === 'externalVaeEncoderControl') continue
    const source = value[key]
    if (!resources.has(modelId)) {
      const resource = {
        id: source.installed.resourceId,
        type: source.type,
        displayName: source.name,
        source: { kind: 'civitai', modelId },
        sourceMetadata: { qualificationPrecondition: true },
        defaultVersionId: source.installed.versionId,
        versions: [],
      }
      if (key === 'embeddingTrained' || key === 'illustrious' || key === 'illustriousEpsilon') {
        resource.creator = source.origin.creator
        resource.sourceMetadata.origin = source.origin
      }
      resources.set(modelId, resource)
    }
    resources.get(modelId).versions.push({
      id: `version-${managedId}`,
      name: source.versionName,
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
        ...(source.origin ? { origin: source.origin } : {}),
      },
    })
  }
  return [...resources.values()]
}
function pixelCases(mode = 'txt2img', objective = 'epsilon') {
  const value = installedFixture(mode, objective)
  return ['fullstack', 'encoder-control'].map((choice, index) => ({
    choice,
    frozen: frozen(value, choice),
    target: { sha256: 'e'.repeat(64), pixelSha256: 'f'.repeat(64) },
    dimensions: {
      width: 256,
      height: 256,
      pixelSha256: (mode === 'txt2img' ? '1' : String(index + 1)).repeat(64),
    },
  }))
}

test('encoder fixture independently declares 5/9, two choices, both objectives and exact publication IDs', () => {
  assert.deepEqual(encoderPublicationIds, {
    managedId: 700085,
    modelId: 700070,
    versionId: 700083,
    fileId: 700084,
  })
  for (const objective of ['epsilon', 'v_prediction'])
    for (const stage of ['txt2img', 'img2img', 'outpaint']) {
      const source = fixture(stage, objective)
      const before = structuredClone(source)
      const plan = validateNoobaiVaeEncoderFixture(source, ready)
      assert.equal(plan.mode, stage)
      assert.equal(plan.modelKey, objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious')
      assert.deepEqual(plan.execution, execution(objective))
      assert.deepEqual(plan.choices, ['fullstack', 'encoder-control'])
      assert.deepEqual(plan.expectedOutcome, {
        finiteCompletions: 2,
        actualAdmissions: 2,
        canceledOriginals: 0,
        preservingRetryRefusals: 0,
      })
      assert.equal(plan.matchedPixelControlCases, 1)
      assert.equal(plan.expectedCatalogResources, 5)
      assert.equal(plan.expectedCatalogVersions, 9)
      assert.equal(plan.fullMvpClaim, false)
      assert.equal(plan.combinedMatrixClaim, false)
      assert.deepEqual(source, before)
    }
})

test('encoder fixture rejects altered origins, decoder transforms, aliases and undeclared fields', () => {
  for (const mutate of [
    (v) => {
      v.profile = 'noobai-components'
    },
    (v) => {
      v.stage = 'inpaint'
    },
    (v) => {
      v.stage = 'lifecycle'
    },
    (v) => {
      v.extra = v.externalVaeEncoderControl
    },
    (v) => {
      delete v.externalVaeEncoderControl
    },
    (v) => {
      v.externalVaeEncoderControl.origin.decoderBiasAdd = 0.5
    },
    (v) => {
      v.externalVaeEncoderControl.origin.encoderOutputBiasAdd = 0.15
    },
    (v) => {
      v.externalVaeEncoderControl.origin.sourceVaeSha256 = v.externalVaeLdm.sha256
    },
    (v) => {
      v.externalVaeEncoderControl.origin.format = 'original-ldm'
    },
    (v) => {
      v.externalVaeEncoderControl.type = 'embedding'
    },
    (v) => {
      v.externalVaeEncoderControl.family = 'anima'
    },
    (v) => {
      v.externalVaeEncoderControl.name = 'other VAE'
    },
    (v) => {
      v.externalVaeEncoderControl.versionName = v.externalVaeControl.versionName
    },
    (v) => {
      v.externalVaeEncoderControl.path = '/another/native.safetensors'
    },
    (v) => {
      v.externalVaeEncoderControl.path = '/original/../encoder.safetensors'
    },
    (v) => {
      v.externalVaeEncoderControl.sha256 = v.illustriousLora.sha256
    },
    (v) => {
      v.externalVaeEncoderControl.byteSize = 0
    },
  ]) {
    const value = fixture()
    mutate(value)
    assert.throws(() => validateNoobaiVaeEncoderFixture(value, ready))
  }
})

test('encoder fixture delegates original source, objective, common-source and ready restrictions', () => {
  for (const mutate of [
    (v) => {
      v.objective = 'sample'
    },
    (v) => {
      v.commonSource.objective = 'v_prediction'
    },
    (v) => {
      v.commonSource.sourceQueueItemId = ''
    },
    (v) => {
      v.externalVaeNative.byteSize--
    },
    (v) => {
      v.externalVaeControl.origin.decoderBiasAdd = 0
    },
    (v) => {
      v.embeddingControl.origin.extra = true
    },
    (v) => {
      v.authorRecipes.illustriousEpsilon.execution.sampler = 'euler'
    },
  ]) {
    const value = fixture('img2img')
    mutate(value)
    assert.throws(() => validateNoobaiVaeEncoderFixture(value, ready))
  }
  assert.throws(() =>
    validateNoobaiVaeEncoderFixture(fixture(), { ...ready, workerVersion: '0.13.0' }),
  )
  assert.throws(() =>
    validateNoobaiVaeEncoderFixture(fixture(), {
      ...ready,
      capabilities: ready.capabilities.filter((name) => name !== 'illustrious-external-vae'),
    }),
  )
})

test('original component fixture keeps rejecting the ninth identity', () => {
  const value = fixture()
  value.profile = 'noobai-components'
  assert.throws(() => validateNoobaiComponentsFixture(value, ready))
  delete value.externalVaeEncoderControl
  assert.equal(validateNoobaiComponentsFixture(value, ready).expectedCatalogVersions, 8)
})

test('encoder catalog adoption preserves full original 5/8 and admits exactly one same-resource version', () => {
  const value = installedFixture()
  const prior = catalog(value, false)
  const final = catalog(value)
  assert.equal(prior.length, 5)
  assert.equal(prior.flatMap((r) => r.versions).length, 8)
  assert.equal(final.length, 5)
  assert.equal(final.flatMap((r) => r.versions).length, 9)
  assert.equal(assertNoobaiVaeEncoderCatalog(prior, value, { adopting: true }).size, 5)
  assert.equal(assertNoobaiVaeEncoderCatalog(final, value, { adopting: true }).size, 6)
  const before = structuredClone(final)
  assert.equal(assertNoobaiVaeEncoderCatalog(final, value).size, 6)
  assert.deepEqual(final, before)
  assert.throws(() => assertNoobaiVaeEncoderCatalog(prior, value))
})

test('encoder adoption cannot weaken original closure or move the declared version to another resource', () => {
  const value = installedFixture()
  for (const mutate of [
    (rows) => {
      rows.pop()
    },
    (rows) => {
      rows[4].versions.splice(1, 1)
    },
    (rows) => {
      rows[3].versions.pop()
    },
    (rows) => {
      rows[0].id = 'replacement-checkpoint'
    },
    (rows) => {
      rows[3].versions.push(rows[4].versions.pop())
    },
    (rows) => {
      rows.push(structuredClone(rows[4]))
    },
  ]) {
    const rows = catalog(value)
    mutate(rows)
    assert.throws(() => assertNoobaiVaeEncoderCatalog(rows, value, { adopting: true }))
  }
})

test('encoder catalog refuses undeclared duplicates, Default substitution and invalid exact version metadata', () => {
  const value = installedFixture()
  for (const mutate of [
    (r, v) => {
      r.versions.push(structuredClone(v))
    },
    (r, v) => {
      r.defaultVersionId = v.id
    },
    (_r, v) => {
      v.id = 'wrong-local-version'
    },
    (_r, v) => {
      v.file.sha256 = '8'.repeat(64)
    },
    (_r, v) => {
      v.expectedSha256 = nativeSha
    },
    (_r, v) => {
      v.file.status = 'missing'
    },
    (_r, v) => {
      v.file.managedPath = '/elsewhere/encoder.safetensors'
    },
    (_r, v) => {
      v.file.originalFilename = 'native.safetensors'
    },
    (_r, v) => {
      v.file.sizeBytes--
    },
    (_r, v) => {
      v.civitaiVersionId = 700081
    },
    (_r, v) => {
      v.civitaiFileId = 700082
    },
    (_r, v) => {
      v.baseModelFamily = 'anima'
    },
    (_r, v) => {
      v.predictionType = 'epsilon'
    },
    (_r, v) => {
      v.dependencyVersionIds.vae = 'other'
    },
    (_r, v) => {
      v.sourceMetadata.qualificationPrecondition = false
    },
    (_r, v) => {
      v.sourceMetadata.origin.decoderBiasAdd = 0.5
    },
  ]) {
    const rows = catalog(value)
    mutate(rows[4], rows[4].versions[3])
    assert.throws(() => assertNoobaiVaeEncoderCatalog(rows, value))
    assert.throws(() => assertNoobaiVaeEncoderCatalog(rows, value, { adopting: true }))
  }
  for (const mutate of [
    (v) => {
      v.externalVaeEncoderControl.installed.resourceId = 'other-resource'
    },
    (v) => {
      v.externalVaeEncoderControl.installed.versionId = 'version-700080'
    },
    (v) => {
      v.externalVaeEncoderControl.installed.managedPath = '/other/encoder.safetensors'
    },
  ]) {
    const changed = structuredClone(value)
    mutate(changed)
    assert.throws(() =>
      assertNoobaiVaeEncoderCatalog(catalog(value, false), changed, { adopting: true }),
    )
    assert.throws(() => assertNoobaiVaeEncoderCatalog(catalog(value), changed))
  }
})

test('encoder frozen guards retain exact independent identities and do not replace actual owners', () => {
  for (const objective of ['epsilon', 'v_prediction'])
    for (const mode of ['txt2img', 'img2img', 'outpaint']) {
      const value = installedFixture(mode, objective)
      for (const choice of ['fullstack', 'encoder-control']) {
        const job = frozen(value, choice)
        const before = structuredClone(job)
        assertNoobaiVaeEncoderFrozen(job, value, choice)
        assert.deepEqual(job, before)
        if (choice === 'encoder-control') {
          assert.equal(job.context.vae.reference.civitaiModelId, 700070)
          assert.equal(job.context.vae.reference.civitaiVersionId, 700083)
          assert.equal(job.context.vae.reference.civitaiFileId, 700084)
          assert.equal(
            job.workerJob.vae.path,
            '/owned/data/imagegen-studio/models/qualified-700085.safetensors',
          )
          assert.equal(job.workerJob.vae.sha256, '9'.repeat(64))
        }
      }
    }
})

test('encoder frozen validation checks the complete VAE axis before base delegation', () => {
  const value = installedFixture()
  for (const mutate of [
    (j) => {
      j.context.vae.reference.civitaiVersionId = 700081
    },
    (j) => {
      j.context.vae.reference.civitaiFileId = 700082
    },
    (j) => {
      j.context.vae.reference.localVersionId = 'default'
    },
    (j) => {
      j.context.vae.reference.localModelId = 'other-resource'
    },
    (j) => {
      j.context.vae.reference.fileSha256 = nativeSha
    },
    (j) => {
      j.context.vae.reference.versionName = 'native'
    },
    (j) => {
      j.context.vae.reference.predictionType = 'epsilon'
    },
    (j) => {
      j.context.vae.extra = true
    },
    (j) => {
      j.context.vae.managedPath = '/default/native.safetensors'
    },
    (j) => {
      j.workerJob.vae.sha256 = nativeSha
    },
    (j) => {
      j.workerJob.vae.byteSize--
    },
    (j) => {
      j.workerJob.vae.path = '/default/native.safetensors'
    },
  ]) {
    const job = frozen(value, 'encoder-control')
    mutate(job)
    assert.throws(() => assertNoobaiVaeEncoderFrozen(job, value, 'encoder-control'))
  }
  const badBinding = structuredClone(value)
  badBinding.externalVaeEncoderControl.installed.resourceId = 'other-resource'
  assert.throws(() =>
    assertNoobaiVaeEncoderFrozen(
      frozen(badBinding, 'encoder-control'),
      badBinding,
      'encoder-control',
    ),
  )
  assert.throws(() => assertNoobaiVaeEncoderFrozen(frozen(value), value, 'vae-control'))
})

test('encoder frozen delegation rejects neighboring polarity, noise, checkpoint, LoRA and seed changes', () => {
  const value = installedFixture('img2img')
  for (const mutate of [
    (j) => {
      j.context.model.reference.localVersionId = 'default'
    },
    (j) => {
      j.workerJob.checkpoint.predictionType = 'v_prediction'
    },
    (j) => {
      j.workerJob.sampling.noiseProfile.rescaleBetasZeroSnr = true
    },
    (j) => {
      j.context.embeddingRefs.negative[0].token = '<wrong>'
    },
    (j) => {
      j.workerJob.embeddings.positive[0].path = '/other/Photo.safetensors'
    },
    (j) => {
      j.context.loraStack[0].weight = 0.5
    },
    (j) => {
      j.workerJob.loras[0].weight = 0.5
    },
    (j) => {
      j.context.sampling.seed = 37
    },
    (j) => {
      j.workerJob.sampling.seed = 37
    },
    (j) => {
      j.workerJob.sampling.denoisingStrength = 0
    },
    (j) => {
      j.kind = 'illustrious-txt2img'
    },
  ]) {
    const job = frozen(value, 'encoder-control')
    mutate(job)
    assert.throws(() => assertNoobaiVaeEncoderFrozen(job, value, 'encoder-control'))
  }
})

test('encoder pixels require TXT equality and nonzero IMG inequality on exactly two independent cases', () => {
  for (const objective of ['epsilon', 'v_prediction']) {
    const text = pixelCases('txt2img', objective)
    const image = pixelCases('img2img', objective)
    const before = structuredClone(image)
    assert.deepEqual(assertNoobaiVaeEncoderPixels(text, 'txt2img'), [
      { choice: 'encoder-control', mode: 'txt2img', equal: true },
    ])
    assert.deepEqual(assertNoobaiVaeEncoderPixels(image, 'img2img'), [
      { choice: 'encoder-control', mode: 'img2img', equal: false },
    ])
    assert.deepEqual(image, before)
    text[1].dimensions.pixelSha256 = '2'.repeat(64)
    assert.throws(() => assertNoobaiVaeEncoderPixels(text, 'txt2img'), /unchanged decoder/)
    image[1].dimensions.pixelSha256 = image[0].dimensions.pixelSha256
    assert.throws(
      () => assertNoobaiVaeEncoderPixels(image, 'img2img'),
      /Selected VAE encoder must change nonzero img2img pixels while decoder and neighboring inputs stay matched\./,
    )
  }
})

test('encoder pixel controls reject changed other polarity, noise, source, seed and strength-zero false GREEN', () => {
  for (const mutate of [
    (c) => {
      c.frozen.context.embeddingRefs.negative[0].resource.fileSha256 = '8'.repeat(64)
    },
    (c) => {
      c.frozen.workerJob.embeddings.positive[0].sha256 = '8'.repeat(64)
    },
    (c) => {
      c.frozen.workerJob.sampling.noiseProfile.timestepSpacing = 'trailing'
    },
    (c) => {
      c.frozen.context.sampling.seed = 37
    },
    (c) => {
      c.frozen.workerJob.target.sha256 = '8'.repeat(64)
    },
    (c) => {
      c.target.pixelSha256 = '8'.repeat(64)
    },
    (c) => {
      c.frozen.context.loraStack[0].weight = 0.5
    },
    (c) => {
      c.dimensions.width = 128
    },
    (c) => {
      c.dimensions.height = 128
    },
    (c) => {
      c.frozen.workerJob.sampling.denoisingStrength = 0
    },
  ]) {
    const cases = pixelCases('img2img')
    mutate(cases[1])
    assert.throws(() => assertNoobaiVaeEncoderPixels(cases, 'img2img'))
  }
  const zero = pixelCases('img2img')
  for (const c of zero) {
    c.frozen.context.sampling.denoisingStrength = 0
    c.frozen.workerJob.sampling.denoisingStrength = 0
  }
  assert.throws(() => assertNoobaiVaeEncoderPixels(zero, 'img2img'))
})

test('encoder pixel controls retain hash shape, fixed order, count and real operation guards', () => {
  for (const mutate of [
    (c) => {
      c.pop()
    },
    (c) => {
      c.reverse()
    },
    (c) => {
      c.push(structuredClone(c[0]))
    },
    (c) => {
      c[1].choice = 'vae-control'
    },
    (c) => {
      c[0].target.sha256 = 'not-a-hash'
    },
    (c) => {
      c[1].target.pixelSha256 = '1'.repeat(63)
    },
    (c) => {
      c[1].dimensions.pixelSha256 = null
    },
    (c) => {
      c[1].dimensions.width = 128
    },
    (c) => {
      c[1].dimensions.height = 128
    },
    (c) => {
      c[1].dimensions.width = 0
    },
    (c) => {
      for (const v of c) v.frozen.kind = 'illustrious-img2img'
    },
  ]) {
    const cases = pixelCases()
    mutate(cases)
    assert.throws(() => assertNoobaiVaeEncoderPixels(cases, 'txt2img'))
  }
  assert.throws(() => assertNoobaiVaeEncoderPixels(pixelCases(), 'inpaint'))
})

test('encoder stage outcomes independently require 2/2/0/0, one control and no broader claim', () => {
  for (const stage of ['txt2img', 'img2img', 'outpaint']) {
    const summary = {
      stage,
      objective: 'epsilon',
      finiteCompletions: 2,
      actualAdmissions: 2,
      canceledOriginals: 0,
      preservingRetryRefusals: 0,
      matchedPixelControlCases: 1,
      fullMvpClaim: false,
      combinedMatrixClaim: false,
    }
    assertNoobaiVaeEncoderStageOutcome(summary)
    for (const field of [
      'finiteCompletions',
      'actualAdmissions',
      'canceledOriginals',
      'preservingRetryRefusals',
      'matchedPixelControlCases',
    ])
      assert.throws(() =>
        assertNoobaiVaeEncoderStageOutcome({ ...summary, [field]: summary[field] + 1 }),
      )
    for (const field of ['fullMvpClaim', 'combinedMatrixClaim'])
      assert.throws(() => assertNoobaiVaeEncoderStageOutcome({ ...summary, [field]: true }))
    assert.throws(() => assertNoobaiVaeEncoderStageOutcome({ ...summary, stage: 'lifecycle' }))
    assert.throws(() => assertNoobaiVaeEncoderStageOutcome({ ...summary, objective: 'sample' }))
  }
})

function publicationCatalogs() {
  const value = installedFixture()
  const previous = catalog(value, false)
  const current = catalog(value)
  for (const rows of [previous, current])
    for (const resource of rows) {
      resource.sourceCheckedAt = '2026-10-08T10:00:00.000Z'
      for (const version of resource.versions) version.createdAt = '2026-10-08T09:00:00.000Z'
    }
  current[4].sourceCheckedAt = '2026-10-08T10:05:00.000Z'
  current[4].versions[3].createdAt = '2026-10-08T10:05:00.000Z'
  return { value, previous: structuredClone(previous), current: structuredClone(current) }
}

test('encoder preservation permits only its exact new-version publication timestamp and checkpoint policies', () => {
  const { value, previous, current } = publicationCatalogs()
  current[0].versions[0].predictionType = 'v_prediction'
  current[0].versions[0].predictionTypeSource = 'user'
  current[0].versions[0].noiseProfile = { timestepSpacing: 'leading', rescaleBetasZeroSnr: true }
  const before = structuredClone({ previous, current })
  assert.deepEqual(assertNoobaiVaeEncoderCatalogPreserved(current, previous, value), [
    {
      resourceId: 'resource-700070',
      versionId: 'version-700085',
      previousSourceCheckedAt: '2026-10-08T10:00:00.000Z',
      sourceCheckedAt: '2026-10-08T10:05:00.000Z',
      createdAt: '2026-10-08T10:05:00.000Z',
    },
  ])
  assert.deepEqual({ previous, current }, before)
})

test('encoder preservation refuses neighboring owner changes and arbitrary publication timestamps', () => {
  for (const mutate of [
    (rows) => {
      rows[4].defaultVersionId = 'version-700080'
    },
    (rows) => {
      rows[4].versions[0].file.originalFilename = 'replacement.safetensors'
    },
    (rows) => {
      rows[4].versions[0].sourceMetadata.origin.extra = true
    },
    (rows) => {
      rows[4].displayName = 'replacement resource'
    },
    (rows) => {
      rows[4].sourceCheckedAt = '2026-10-08T10:06:00.000Z'
    },
    (rows) => {
      rows[4].sourceCheckedAt = rows[4].versions[3].createdAt = '2026-10-08T09:59:00.000Z'
    },
    (rows) => {
      rows[4].sourceCheckedAt = rows[4].versions[3].createdAt = 'invalid-timestamp'
    },
    (rows) => {
      rows[3].sourceCheckedAt = '2026-10-08T10:05:00.000Z'
    },
    (rows) => {
      rows[0].sourceMetadata.extra = true
    },
    (rows) => {
      rows[4].versions[0].createdAt = '2026-10-08T09:01:00.000Z'
    },
  ]) {
    const { value, previous, current } = publicationCatalogs()
    mutate(current)
    assert.throws(() => assertNoobaiVaeEncoderCatalogPreserved(current, previous, value))
  }
})

test('encoder preservation forbids timestamp changes after the ninth version already exists', () => {
  const { value, current } = publicationCatalogs()
  const previous = structuredClone(current)
  assert.deepEqual(assertNoobaiVaeEncoderCatalogPreserved(current, previous, value), [])
  current[4].sourceCheckedAt = '2026-10-08T10:06:00.000Z'
  assert.throws(() => assertNoobaiVaeEncoderCatalogPreserved(current, previous, value))
})

function outpaintPixelCases(objective = 'epsilon') {
  const cases = pixelCases('outpaint', objective)
  for (const value of cases) {
    value.bbox = { x: 2, y: 1, width: 2, height: 2 }
    value.previewRect = { x: 1, y: 0, width: 3, height: 3 }
    value.frozen.context.bbox = structuredClone(value.bbox)
    value.frozen.workerJob.bbox = structuredClone(value.bbox)
    value.dimensions.width = 2
    value.dimensions.height = 2
    value.contribution = {
      width: 2,
      height: 2,
      rgba: new Uint8Array([10, 20, 30, 0, 30, 40, 50, 255, 60, 70, 80, 128, 90, 100, 110, 255]),
    }
    value.preview = {
      width: 3,
      height: 3,
      rgba: new Uint8Array([
        10, 10, 10, 255, 10, 10, 10, 255, 10, 10, 10, 255, 10, 10, 10, 255, 10, 10, 10, 255, 10, 10,
        10, 255, 10, 10, 10, 255, 10, 10, 10, 255, 10, 10, 10, 255,
      ]),
    }
  }
  // Contribution pixel (1,0) is world (3,1), hence saved-preview pixel (2,1).
  cases[1].contribution.rgba[4] = 31
  cases[1].preview.rgba[20] = 11
  return cases
}

test('encoder outpaint fixture requires pinned LaMa descriptor and delegated native capability', () => {
  for (const objective of ['epsilon', 'v_prediction']) {
    const value = fixture('outpaint', objective)
    const plan = validateNoobaiVaeEncoderFixture(value, ready)
    assert.equal(plan.mode, 'outpaint')
    assert.equal(plan.expectedCatalogResources, 5)
    assert.equal(plan.expectedCatalogVersions, 9)
    assert.deepEqual(plan.choices, ['fullstack', 'encoder-control'])
    assert.deepEqual(plan.expectedOutcome, {
      finiteCompletions: 2,
      actualAdmissions: 2,
      canceledOriginals: 0,
      preservingRetryRefusals: 0,
    })
  }
  for (const mutate of [
    (v) => {
      delete v.lama
    },
    (v) => {
      v.lama.sha256 = '8'.repeat(64)
    },
    (v) => {
      v.lama.byteSize--
    },
    (v) => {
      v.lama.path = 'relative/lama.pt'
    },
    (v) => {
      v.lama.extra = true
    },
    (v) => {
      v.commonSource.objective = 'v_prediction'
    },
    (v) => {
      v.externalVaeEncoderControl.origin.decoderBiasAdd = 0.5
    },
  ]) {
    const value = fixture('outpaint')
    mutate(value)
    assert.throws(() => validateNoobaiVaeEncoderFixture(value, ready))
  }
  assert.throws(() =>
    validateNoobaiVaeEncoderFixture(fixture('outpaint'), {
      ...ready,
      capabilities: ready.capabilities.filter((value) => value !== 'illustrious-outpaint'),
    }),
  )
})

test('encoder outpaint frozen guard requires actual outpaint kind and both captured strengths', () => {
  const value = installedFixture('outpaint')
  for (const choice of ['fullstack', 'encoder-control']) {
    const valid = frozen(value, choice)
    assertNoobaiVaeEncoderFrozen(valid, value, choice)
    for (const mutate of [
      (j) => {
        j.kind = 'illustrious-img2img'
      },
      (j) => {
        j.context.sampling.denoisingStrength = 0
      },
      (j) => {
        j.workerJob.sampling.denoisingStrength = 0
      },
      (j) => {
        delete j.workerJob.sampling.denoisingStrength
      },
    ]) {
      const job = structuredClone(valid)
      mutate(job)
      assert.throws(() => assertNoobaiVaeEncoderFrozen(job, value, choice))
    }
  }
})

test('encoder outpaint pixels independently measure exact alpha and same-coordinate visible merged change', () => {
  for (const objective of ['epsilon', 'v_prediction']) {
    const cases = outpaintPixelCases(objective)
    const before = structuredClone(cases)
    assert.deepEqual(assertNoobaiVaeEncoderPixels(cases, 'outpaint'), [
      {
        choice: 'encoder-control',
        mode: 'outpaint',
        equal: false,
        visiblePixels: 3,
        changedContributionPixels: 1,
        changedMergedPixels: 1,
        changedCorrespondingMergedPixels: 1,
      },
    ])
    assert.deepEqual(cases, before)
  }
})

test('encoder outpaint visible guards reject invisible-only RGB, alpha changes and missing saved change', () => {
  for (const [mutate, message] of [
    [
      (c) => {
        c[1].contribution.rgba.set(c[0].contribution.rgba)
        c[1].preview.rgba.set(c[0].preview.rgba)
        c[1].dimensions.pixelSha256 = c[0].dimensions.pixelSha256
      },
      /A component control must change visible generated RGB, not only invisible RGB\./,
    ],
    [
      (c) => {
        c[1].contribution.rgba[4] = c[0].contribution.rgba[4]
        c[1].contribution.rgba[0] = 11
      },
      /visible generated RGB/,
    ],
    [
      (c) => {
        c[1].contribution.rgba[7] = 254
      },
      /exact contribution alpha mask/,
    ],
    [
      (c) => {
        c[1].preview.rgba.set(c[0].preview.rgba)
      },
      /saved merged preview/,
    ],
    [
      (c) => {
        c[1].bbox.x++
      },
      undefined,
    ],
    [
      (c) => {
        c[1].previewRect.x++
      },
      undefined,
    ],
    [
      (c) => {
        for (const value of c) value.previewRect.x = 10
      },
      /covered by the saved merged preview/,
    ],
    [
      (c) => {
        c[1].preview.width = 2
      },
      undefined,
    ],
    [
      (c) => {
        c[1].dimensions.pixelSha256 = c[0].dimensions.pixelSha256
      },
      /Selected VAE encoder must change normal outpaint pixels/,
    ],
  ]) {
    const cases = outpaintPixelCases()
    mutate(cases)
    if (message) assert.throws(() => assertNoobaiVaeEncoderPixels(cases, 'outpaint'), message)
    else assert.throws(() => assertNoobaiVaeEncoderPixels(cases, 'outpaint'))
  }
})

test('encoder outpaint rejects disjoint visible footprints without widening default component evidence', () => {
  const cases = outpaintPixelCases()
  // Move the saved change from generated (1,0) to generated (0,1), world (2,2).
  cases[1].preview.rgba[20] = 10
  cases[1].preview.rgba[28] = 11
  assert.deepEqual(visibleOutpaint(cases[0], cases[1], false), {
    visiblePixels: 3,
    changedContributionPixels: 1,
    changedMergedPixels: 1,
  })
  assert.throws(
    () => assertNoobaiVaeEncoderPixels(cases, 'outpaint'),
    /corresponding saved merged RGB pixel/,
  )
})

test('encoder outpaint keeps seed, source, opposite polarity and decoder resource metadata matched', () => {
  for (const mutate of [
    (c) => {
      c[1].frozen.context.sampling.seed = 37
    },
    (c) => {
      c[1].frozen.workerJob.target.sha256 = '8'.repeat(64)
    },
    (c) => {
      c[1].target.pixelSha256 = '8'.repeat(64)
    },
    (c) => {
      c[1].frozen.context.vae.reference.displayName = 'different decoder resource'
    },
    (c) => {
      c[1].frozen.context.embeddingRefs.negative[0].resource.fileSha256 = '8'.repeat(64)
    },
    (c) => {
      c[1].frozen.workerJob.sampling.noiseProfile.timestepSpacing = 'trailing'
    },
    (c) => {
      for (const value of c) value.frozen.kind = 'illustrious-img2img'
    },
    (c) => {
      c[1].frozen.workerJob.sampling.denoisingStrength = 0
    },
  ]) {
    const cases = outpaintPixelCases()
    mutate(cases)
    assert.throws(() => assertNoobaiVaeEncoderPixels(cases, 'outpaint'))
  }
})
