/** Pure exported qualification boundaries with independent fixed identities/pixels/counts; no ML. */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import {
  assertNoobaiComponentCatalog,
  assertNoobaiComponentFrozen,
  assertNoobaiComponentPixels,
  assertNoobaiComponentStageOutcome,
  componentStagePlan,
  normalizeNoobaiComponentInputs,
  validateNoobaiComponentsFixture,
} from './noobai-components-qualification.mjs'

const epsSha = 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1'
const trainedSha = '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36'
const ldmSha = '642ca8780b893744a5a66f9dc762768186bb3c4d7a4b17fde2de3845377b7481'
const nativeSha = 'f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7'
const choices = [
  'fullstack',
  'lora-disabled',
  'positive-zero',
  'negative-zero',
  'vae-control',
  'ldm-layout',
]
const ids = {
  illustrious: [700040, 1147756, 2679856, 2566634],
  illustriousEpsilon: [700140, 833294, 1022833, 928571],
  illustriousLora: [700060, 700060, 700061, 700062],
  embeddingTrained: [700100, 2360940, 2655289, 2542976],
  embeddingControl: [700110, 2360940, 700111, 700112],
  externalVaeLdm: [700070, 700070, 700071, 700072],
  externalVaeNative: [700080, 700070, 700081, 700082],
  externalVaeControl: [700090, 700070, 700091, 700092],
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
function fixture(stage = 'txt2img', objective = 'v_prediction') {
  const value = {
    schemaVersion: 1,
    profile: 'noobai-components',
    stage,
    objective,
    appData: '/owned/data/imagegen-studio',
    artifacts: '/owned/evidence',
    side: 256,
    steps: 3,
    illustrious: {
      path: '/original/cyber.safetensors',
      sha256: 'a'.repeat(64),
      byteSize: 999,
      type: 'checkpoint',
      family: 'illustrious',
      name: 'Cyber',
      versionName: 'v-trained',
      predictionType: null,
      trainedObjective: 'v_prediction',
      origin: checkpointOrigin(1147756, 2679856, 2566634, 'Knightus_Ai'),
    },
    illustriousEpsilon: {
      path: '/original/noob-eps.safetensors',
      sha256: epsSha,
      byteSize: 6938040416,
      type: 'checkpoint',
      family: 'illustrious',
      name: 'Noob',
      versionName: 'eps1.0',
      predictionType: null,
      trainedObjective: 'epsilon',
      origin: checkpointOrigin(833294, 1022833, 928571, 'L_A_X'),
    },
    illustriousLora: {
      path: '/original/lora.safetensors',
      sha256: 'b'.repeat(64),
      byteSize: 123,
      type: 'lora',
      family: 'illustrious',
      name: 'ordinary LoRA',
      versionName: 'trained',
    },
    embeddingTrained: {
      path: '/trained/Photo.safetensors',
      sha256: trainedSha,
      byteSize: 49736,
      type: 'embedding',
      family: 'illustrious',
      name: 'Photo',
      versionName: 'trained',
      origin: {
        kind: 'civitai-trained',
        modelId: 2360940,
        versionId: 2655289,
        fileId: 2542976,
        url: 'https://civitai.com/api/download/models/2655289?fileId=2542976',
        creator: 'CautionMergeAhead',
        creditRequired: true,
      },
    },
    embeddingControl: {
      path: '/zero/Photo.safetensors',
      sha256: 'c'.repeat(64),
      byteSize: 49736,
      type: 'embedding',
      family: 'illustrious',
      name: 'Photo',
      versionName: 'zero',
      origin: { kind: 'artificial-zero-control', sourceEmbeddingSha256: trainedSha },
    },
    externalVaeLdm: {
      path: '/derived/ldm.safetensors',
      sha256: ldmSha,
      byteSize: 167333366,
      type: 'vae',
      family: 'illustrious',
      name: 'Noob extracted VAE',
      versionName: 'LDM',
      origin: { kind: 'checkpoint-extraction', checkpointSha256: epsSha, format: 'original-ldm' },
    },
    externalVaeNative: {
      path: '/derived/native.safetensors',
      sha256: nativeSha,
      byteSize: 167335542,
      type: 'vae',
      family: 'illustrious',
      name: 'Noob extracted VAE',
      versionName: 'native',
      origin: { kind: 'checkpoint-extraction', checkpointSha256: epsSha, format: 'diffusers' },
    },
    externalVaeControl: {
      path: '/derived/control.safetensors',
      sha256: 'd'.repeat(64),
      byteSize: 167335542,
      type: 'vae',
      family: 'illustrious',
      name: 'Noob extracted VAE',
      versionName: 'decoder control',
      origin: {
        kind: 'artificial-causal-control',
        sourceVaeSha256: nativeSha,
        format: 'diffusers',
        decoderBiasAdd: 0.15,
      },
    },
    authorRecipes: {
      illustrious: {
        sourceRevision: '66aa55e3469c27c29a89813cd35dd95fb7485fa1',
        sourceSha256: 'aaab159149a518c3366dd9da14798a64e3672a7147d67ff247582116f3624537',
        sourceUrl:
          'https://huggingface.co/Laxhar/noobai-XL-Vpred-1.0/resolve/66aa55e3469c27c29a89813cd35dd95fb7485fa1/README.md',
        attribution: 'upstream-on-credited-derivative',
        assumedFields: ['timestepSpacing'],
        execution: {
          width: 832,
          height: 1216,
          steps: 28,
          cfgScale: 5,
          sampler: 'euler',
          scheduler: 'normal',
          predictionType: 'v_prediction',
          noiseProfile: {
            schemaVersion: 1,
            baseSchedule: 'sdxl-scaled-linear-v1',
            rescaleBetasZeroSnr: true,
            timestepSpacing: 'leading',
          },
        },
      },
      illustriousEpsilon: {
        sourceRevision: '70dee4d903b83cc6d1e8d12e65051cfdbcf54ab3',
        sourceSha256: '4359aa848981aa7f8c1a2e28f9b6a692f829a184f1995431630f9c1751e6fd87',
        sourceUrl:
          'https://huggingface.co/Laxhar/noobai-XL-1.0/resolve/70dee4d903b83cc6d1e8d12e65051cfdbcf54ab3/README.md',
        attribution: 'checkpoint-author',
        assumedFields: ['timestepSpacing'],
        execution: {
          width: 832,
          height: 1216,
          steps: 28,
          cfgScale: 5,
          sampler: 'euler_a',
          scheduler: 'normal',
          predictionType: 'epsilon',
          noiseProfile: {
            schemaVersion: 1,
            baseSchedule: 'sdxl-scaled-linear-v1',
            rescaleBetasZeroSnr: false,
            timestepSpacing: 'leading',
          },
        },
      },
    },
  }
  if (stage !== 'txt2img')
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
function installedFixture(stage = 'txt2img', objective = 'v_prediction') {
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
  const noiseProfile = {
    schemaVersion: 1,
    baseSchedule: 'sdxl-scaled-linear-v1',
    rescaleBetasZeroSnr: value.objective !== 'epsilon',
    timestepSpacing: 'leading',
  }
  const sampler = value.objective === 'epsilon' ? 'euler_a' : 'euler'
  const vaeKey =
    choice === 'ldm-layout'
      ? 'externalVaeLdm'
      : choice === 'vae-control'
        ? 'externalVaeControl'
        : 'externalVaeNative'
  const vae = value[vaeKey]
  const lora = value.illustriousLora
  const enabled = choice !== 'lora-disabled'
  const result = {
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
        invokeScheduler: sampler,
        sampler: value.objective === 'epsilon' ? 'Euler a' : 'Euler',
        scheduler: 'Normal',
        noiseProfile,
        seed: 0,
        requestedSeedPolicy: 'fixed',
      },
      target: { sha256: 'e'.repeat(64), byteSize: 2345, width: 256, height: 256 },
      vaePrecision: 'FP32',
      vae: {
        byteSize: vae.byteSize,
        managedPath: vae.installed.managedPath,
        reference: reference(value, vaeKey),
      },
      loraStack: [{ enabled, resource: reference(value, 'illustriousLora'), weight: -0.5 }],
      loras: enabled
        ? [
            {
              byteSize: lora.byteSize,
              managedPath: lora.installed.managedPath,
              reference: reference(value, 'illustriousLora'),
              weight: -0.5,
            },
          ]
        : [],
      embeddingRefs: { positive: [], negative: [] },
      embeddings: { positive: [], negative: [] },
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
        scheduler: sampler,
        noiseProfile: structuredClone(noiseProfile),
        seed: 0,
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
      loras: enabled
        ? [
            {
              byteSize: lora.byteSize,
              path: lora.installed.managedPath,
              sha256: lora.sha256,
              weight: -0.5,
            },
          ]
        : [],
      embeddings: { positive: [], negative: [] },
    },
  }
  for (const polarity of ['positive', 'negative']) {
    const key = choice === `${polarity}-zero` ? 'embeddingControl' : 'embeddingTrained'
    const source = value[key]
    result.context.embeddingRefs[polarity] = [{ token: '<Photo>', resource: reference(value, key) }]
    result.context.embeddings[polarity] = [
      {
        token: '<Photo>',
        byteSize: source.byteSize,
        managedPath: source.installed.managedPath,
        reference: reference(value, key),
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
function catalog(value) {
  const resources = new Map()
  for (const [key, [managedId, modelId, versionId, fileId]] of Object.entries(ids)) {
    const source = value[key]
    let resource = resources.get(modelId)
    if (!resource) {
      resource = {
        id: source.installed.resourceId,
        type: source.type,
        displayName: source.name,
        source: { kind: 'civitai', modelId },
        sourceMetadata: { qualificationPrecondition: true },
        defaultVersionId: source.installed.versionId,
        versions: [],
      }
      if (key === 'embeddingTrained') {
        resource.creator = 'CautionMergeAhead'
        resource.sourceMetadata.origin = value.embeddingTrained.origin
      }
      if (key === 'illustrious' || key === 'illustriousEpsilon') {
        resource.creator = source.origin.creator
        resource.sourceMetadata.origin = source.origin
      }
      resources.set(modelId, resource)
    }
    resource.versions.push({
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
function pixelCases(mode = 'txt2img') {
  const value = installedFixture()
  return choices.map((choice, index) => {
    const result = {
      choice,
      frozen: frozen(value, choice),
      target: { sha256: 'e'.repeat(64), pixelSha256: 'f'.repeat(64) },
      dimensions: { pixelSha256: (choice === 'ldm-layout' ? '1' : String(index + 1)).repeat(64) },
    }
    if (mode === 'outpaint') {
      result.bbox = { x: 2, y: 0, width: 2, height: 1 }
      result.previewRect = { x: 1, y: 0, width: 4, height: 1 }
      const red = choice === 'ldm-layout' ? 30 : 30 + index
      result.contribution = {
        width: 2,
        height: 1,
        rgba: new Uint8Array([1, 2, 3, 0, red, 40, 50, 255]),
      }
      result.preview = {
        width: 4,
        height: 1,
        rgba: new Uint8Array([7, 8, 9, 255, 10, 11, 12, 255, red, 40, 50, 255, 13, 14, 15, 255]),
      }
    }
    return result
  })
}

test('joint strict fixture binds both trained objectives, current worker and five resources/eight exact versions', () => {
  for (const objective of ['epsilon', 'v_prediction'])
    for (const stage of ['txt2img', 'img2img', 'outpaint', 'lifecycle']) {
      const checked = validateNoobaiComponentsFixture(fixture(stage, objective), ready)
      assert.equal(checked.modelKey, objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious')
      assert.equal(checked.execution.predictionType, objective)
      assert.equal(checked.execution.steps, 3)
      assert.equal(checked.execution.width, 256)
      assert.equal(checked.mode, stage === 'lifecycle' ? 'img2img' : stage)
      assert.equal(checked.expectedCatalogResources, 5)
      assert.equal(checked.expectedCatalogVersions, 8)
      assert.deepEqual(checked.choices, stage === 'lifecycle' ? ['fullstack'] : choices)
    }
})

test('joint fixture rejects undeclared sources, borrowed objective provenance, encoder alteration and incomplete ready', () => {
  for (const mutate of [
    (value) => {
      value.unknown = value.embeddingTrained
    },
    (value) => {
      value.objective = 'sample'
    },
    (value) => {
      value.commonSource.objective = 'epsilon'
    },
    (value) => {
      value.commonSource.sourceQueueItemId = ''
    },
    (value) => {
      value.externalVaeLdm.origin.checkpointSha256 = value.illustrious.sha256
    },
    (value) => {
      value.externalVaeControl.origin.encoderBiasAdd = 0.1
    },
    (value) => {
      value.externalVaeControl.origin.decoderBiasAdd = 0
    },
    (value) => {
      value.embeddingControl.origin.tensorScale = 1
    },
    (value) => {
      value.embeddingControl.path = '/zero/Other.safetensors'
    },
    (value) => {
      value.embeddingTrained.origin.creator = 'anonymous'
    },
    (value) => {
      value.embeddingTrained.sha256 = '9'.repeat(64)
    },
    (value) => {
      value.externalVaeNative.byteSize--
    },
    (value) => {
      value.embeddingControl.sha256 = value.embeddingTrained.sha256
    },
  ]) {
    const value = fixture('img2img')
    mutate(value)
    assert.throws(() => validateNoobaiComponentsFixture(value, ready))
  }
  assert.throws(() =>
    validateNoobaiComponentsFixture(fixture(), { ...ready, workerVersion: '0.13.0' }),
  )
  for (const missing of [
    'illustrious-embeddings',
    'illustrious-external-vae',
    'illustrious-noise-profile',
  ])
    assert.throws(() =>
      validateNoobaiComponentsFixture(fixture(), {
        ...ready,
        capabilities: ready.capabilities.filter((value) => value !== missing),
      }),
    )
})

test('one component stage independently requires six completions/admissions; lifecycle requires 1/2/1/3 and cannot promote matrix', () => {
  for (const stage of ['txt2img', 'img2img', 'outpaint', 'lifecycle']) {
    const lifecycle = stage === 'lifecycle'
    const expected = {
      finiteCompletions: lifecycle ? 1 : 6,
      actualAdmissions: lifecycle ? 2 : 6,
      canceledOriginals: lifecycle ? 1 : 0,
      preservingRetryRefusals: lifecycle ? 3 : 0,
    }
    const plan = componentStagePlan(stage)
    assert.deepEqual(plan.expectedOutcome, expected)
    const summary = {
      stage,
      objective: 'epsilon',
      ...expected,
      matchedPixelControlCases: lifecycle ? 0 : 5,
      fullMvpClaim: false,
      combinedMatrixClaim: false,
    }
    assertNoobaiComponentStageOutcome(summary)
    for (const field of Object.keys(expected))
      assert.throws(() =>
        assertNoobaiComponentStageOutcome({ ...summary, [field]: summary[field] + 1 }),
      )
    for (const field of ['fullMvpClaim', 'combinedMatrixClaim'])
      assert.throws(() => assertNoobaiComponentStageOutcome({ ...summary, [field]: true }))
    assert.throws(() =>
      assertNoobaiComponentStageOutcome({ ...summary, matchedPixelControlCases: 6 }),
    )
  }
})

test('component catalog preserves original exact IDs and one two-version embedding/one three-version VAE closure', () => {
  const value = installedFixture()
  const rows = catalog(value)
  assert.equal(rows.length, 5)
  assert.equal(rows.flatMap(({ versions }) => versions).length, 8)
  assert.equal(assertNoobaiComponentCatalog(rows, value).size, 5)
  assertNoobaiComponentCatalog(rows.slice(0, 3), value, { adopting: true })
  assert.throws(() => assertNoobaiComponentCatalog(rows.slice(0, 3), value))
  for (const mutate of [
    (rows) => {
      rows[0].id = 'replaced-original'
    },
    (rows) => {
      rows[3].versions[0].civitaiVersionId = 700101
    },
    (rows) => {
      rows[3].versions[1].file.sha256 = rows[3].versions[0].file.sha256
    },
    (rows) => {
      rows[4].versions[1].file.managedPath = '/unexpected/copy'
    },
    (rows) => {
      rows[4].versions[2].sourceMetadata.origin.encoderBiasAdd = 0.1
    },
    (rows) => {
      rows[4].versions[1].predictionType = 'epsilon'
    },
    (rows) => {
      rows[3].defaultVersionId = 'nonexistent'
    },
    (rows) => {
      rows[3].versions[1].file.status = 'missing'
    },
    (rows) => {
      rows.push(structuredClone(rows[3]))
    },
  ]) {
    const changed = structuredClone(rows)
    mutate(changed)
    assert.throws(() => assertNoobaiComponentCatalog(changed, value))
  }
})

test('joint frozen tuple independently checks both objectives, exact external resources and disabled signed LoRA', () => {
  for (const objective of ['epsilon', 'v_prediction']) {
    const value = installedFixture('txt2img', objective)
    for (const choice of choices) assertNoobaiComponentFrozen(frozen(value, choice), value, choice)
  }
  const value = installedFixture()
  for (const mutate of [
    (job) => {
      job.context.model.reference.localVersionId = 'default'
    },
    (job) => {
      job.context.model.reference.displayName = 'another checkpoint'
    },
    (job) => {
      job.context.model.reference.versionName = 'another version'
    },
    (job) => {
      job.workerJob.checkpoint.predictionType = 'epsilon'
    },
    (job) => {
      job.workerJob.sampling.noiseProfile.rescaleBetasZeroSnr = false
    },
    (job) => {
      job.context.vae = null
      job.workerJob.vae = null
    },
    (job) => {
      job.workerJob.vae.sha256 = '9'.repeat(64)
    },
    (job) => {
      job.context.embeddingRefs.negative = job.context.embeddingRefs.positive.map((entry) => ({
        ...entry,
        token: '<wrong>',
      }))
    },
    (job) => {
      job.workerJob.embeddings.negative[0].path = '/default/embedding'
    },
    (job) => {
      job.workerJob.embeddings.positive = []
    },
    (job) => {
      job.context.loraStack[0].weight = 0.5
    },
    (job) => {
      job.workerJob.loras[0].weight = 0.5
    },
    (job) => {
      job.context.sampling.seed = 1
    },
    (job) => {
      job.context.prompts.positive = 'no activation'
    },
  ]) {
    const job = frozen(value)
    mutate(job)
    assert.throws(() => assertNoobaiComponentFrozen(job, value, 'fullstack'))
  }
  const disabled = frozen(value, 'lora-disabled')
  disabled.workerJob.loras = frozen(value).workerJob.loras
  assert.throws(() => assertNoobaiComponentFrozen(disabled, value, 'lora-disabled'))
})

test('one-axis normalizer preserves the opposite embedding polarity, authored LoRA identity/weight and complete noise policy', () => {
  const value = installedFixture()
  const full = frozen(value)
  const before = structuredClone(full)
  for (const choice of choices.slice(1))
    assert.deepEqual(
      normalizeNoobaiComponentInputs(frozen(value, choice), choice),
      normalizeNoobaiComponentInputs(full, choice),
    )
  assert.deepEqual(full, before, 'Normalization must not mutate the actual frozen record.')
  for (const [choice, mutate] of [
    [
      'positive-zero',
      (job) => {
        job.context.embeddingRefs.negative[0].resource.fileSha256 = '9'.repeat(64)
      },
    ],
    [
      'negative-zero',
      (job) => {
        job.workerJob.embeddings.positive[0].sha256 = '9'.repeat(64)
      },
    ],
    [
      'positive-zero',
      (job) => {
        job.context.prompts.positive = 'a different prompt, <Photo>'
      },
    ],
    [
      'lora-disabled',
      (job) => {
        job.context.loraStack[0].resource.localVersionId = 'wrong'
      },
    ],
    [
      'lora-disabled',
      (job) => {
        job.context.loraStack[0].weight = 0.5
      },
    ],
    [
      'vae-control',
      (job) => {
        job.context.sampling.noiseProfile.timestepSpacing = 'trailing'
      },
    ],
    [
      'ldm-layout',
      (job) => {
        job.workerJob.checkpoint.sha256 = '9'.repeat(64)
      },
    ],
  ]) {
    const job = frozen(value, choice)
    mutate(job)
    assert.notDeepEqual(
      normalizeNoobaiComponentInputs(job, choice),
      normalizeNoobaiComponentInputs(full, choice),
    )
  }
  const ignored = frozen(value)
  ignored.workerJob.loras[0].weight = 0
  assert.throws(() => normalizeNoobaiComponentInputs(ignored, 'lora-disabled'))
})

test('matched component pixels require exactly six controls, same target, four causal differences and same-weight layout equality', () => {
  for (const mode of ['txt2img', 'img2img'])
    assert.equal(assertNoobaiComponentPixels(pixelCases(), mode).length, 5)
  for (const mutate of [
    (cases) => {
      cases.pop()
    },
    (cases) => {
      cases[2].choice = 'negative-zero'
    },
    (cases) => {
      cases[2].target.sha256 = '9'.repeat(64)
    },
    (cases) => {
      cases[1].dimensions.pixelSha256 = cases[0].dimensions.pixelSha256
    },
    (cases) => {
      cases[5].dimensions.pixelSha256 = '9'.repeat(64)
    },
    (cases) => {
      cases[2].frozen.workerJob.embeddings.negative[0].sha256 = '9'.repeat(64)
    },
    (cases) => {
      cases[4].frozen.context.sampling.seed = 7
    },
  ]) {
    const cases = pixelCases()
    mutate(cases)
    assert.throws(() => assertNoobaiComponentPixels(cases, 'txt2img'))
  }
})

test('outpaint controls independently require alpha-equal visible contribution and saved merged pixel changes at world coordinates', () => {
  const evidence = assertNoobaiComponentPixels(pixelCases('outpaint'), 'outpaint')
  assert.deepEqual(evidence, [
    {
      choice: 'lora-disabled',
      visiblePixels: 1,
      changedContributionPixels: 1,
      changedMergedPixels: 1,
    },
    {
      choice: 'positive-zero',
      visiblePixels: 1,
      changedContributionPixels: 1,
      changedMergedPixels: 1,
    },
    {
      choice: 'negative-zero',
      visiblePixels: 1,
      changedContributionPixels: 1,
      changedMergedPixels: 1,
    },
    {
      choice: 'vae-control',
      visiblePixels: 1,
      changedContributionPixels: 1,
      changedMergedPixels: 1,
    },
    {
      choice: 'ldm-layout',
      visiblePixels: 1,
      changedContributionPixels: 0,
      changedMergedPixels: 0,
    },
  ])
  for (const mutate of [
    (cases) => {
      cases[1].contribution.rgba[4] = 30
      cases[1].contribution.rgba[0] = 99
    },
    (cases) => {
      cases[2].preview.rgba[8] = 30
      cases[2].preview.rgba[0] = 99
    },
    (cases) => {
      cases[3].contribution.rgba[7] = 0
    },
    (cases) => {
      cases[4].previewRect.x = 2
    },
    (cases) => {
      for (const value of cases) value.previewRect.x = 100
    },
    (cases) => {
      cases[5].contribution.rgba[0] = 99
    },
    (cases) => {
      cases[5].preview.rgba[0] = 99
    },
  ]) {
    const cases = pixelCases('outpaint')
    mutate(cases)
    assert.throws(() => assertNoobaiComponentPixels(cases, 'outpaint'))
  }
})
