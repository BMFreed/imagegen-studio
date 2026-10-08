/** Independent identities, outcome counts and pixel relations; fixture data only, without ML. */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import { validateNoobaiComponentsFixture } from './noobai-components-qualification.mjs'
import { validateNoobaiVaeEncoderFixture } from './noobai-vae-encoder-qualification.mjs'
import {
  assertNoobaiEmbeddingPolarityCatalog,
  assertNoobaiEmbeddingPolarityCatalogPreserved,
  assertNoobaiEmbeddingPolarityFrozen,
  assertNoobaiEmbeddingPolarityOracle,
  assertNoobaiEmbeddingPolarityPixels,
  assertNoobaiEmbeddingPolarityStageOutcome,
  normalizeNoobaiEmbeddingPolarityInputs,
  polarityChoices,
  validateNoobaiEmbeddingPolarityFixture,
} from './noobai-embedding-polarity-qualification.mjs'

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
    profile: 'noobai-embedding-polarity',
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
function frozen(value, choice = 'positive-zero') {
  const modelKey = value.objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'
  const checkpoint = value[modelKey]
  const vaeKey = 'externalVaeNative'
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
    const key =
      (polarity === 'positive' && choice === 'positive-zero') ||
      (polarity === 'negative' && choice === 'negative-zero')
        ? 'embeddingControl'
        : 'embeddingTrained'
    const source = value[key]
    const resource = reference(value, key)
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
function pixelCases(objective = 'epsilon') {
  const value = installedFixture('txt2img', objective)
  return ['positive-zero', 'negative-zero'].map((choice, index) => ({
    choice,
    frozen: frozen(value, choice),
    target: { width: 256, height: 256, sha256: 'e'.repeat(64), pixelSha256: 'f'.repeat(64) },
    dimensions: { width: 256, height: 256, pixelSha256: String(index + 1).repeat(64) },
  }))
}
function nativeInput() {
  const value = installedFixture()
  const source = (key) => ({
    path: value[key].installed.managedPath,
    sha256: value[key].sha256,
    byteSize: value[key].byteSize,
  })
  return {
    schemaVersion: 1,
    workerRootPath: '/owned/runtime/lib/python3.12/site-packages/imagegen_worker',
    configDir: '/owned/runtime/resources/sdxl-config',
    workerSourceFiles: Object.fromEntries(
      Array.from({ length: 43 }, (_, index) => [
        `payload-${index}.py`,
        { sha256: 'a'.repeat(64), byteSize: index + 1 },
      ]),
    ),
    sources: {
      checkpoint: source('illustriousEpsilon'),
      vae: source('externalVaeNative'),
      lora: source('illustriousLora'),
      embeddingTrained: source('embeddingTrained'),
      embeddingControl: source('embeddingControl'),
    },
    cases: [
      {
        choice: 'positive-zero',
        requestId: 'actual-positive-zero',
        job: frozen(value, 'positive-zero').workerJob,
      },
      {
        choice: 'negative-zero',
        requestId: 'actual-negative-zero',
        job: frozen(value, 'negative-zero').workerJob,
      },
    ],
  }
}
function nativeResult(input) {
  const matched = {
    hiddenPositiveMatches: true,
    hiddenNegativeMatches: true,
    pooledPositiveMatches: true,
    pooledNegativeMatches: true,
  }
  const assignments = [
    ['trained/trained', true, 'derived-trained', 'derived-trained', trainedSha, trainedSha],
    ['trained/zero', false, 'negative-zero', 'actual-negative-zero', trainedSha, 'c'.repeat(64)],
    ['zero/trained', false, 'positive-zero', 'actual-positive-zero', 'c'.repeat(64), trainedSha],
    ['zero/zero', true, 'derived-zero', 'derived-zero', 'c'.repeat(64), 'c'.repeat(64)],
  ]
  return {
    schemaVersion: 1,
    status: 'passed',
    observedCommands: 2,
    nativeAssignments: 4,
    workerRootPath: input.workerRootPath,
    configDir: input.configDir,
    workerSourceFiles: structuredClone(input.workerSourceFiles),
    checkpoint: structuredClone(input.sources.checkpoint),
    cases: assignments.map(
      ([assignment, derived, choice, requestId, positiveSha256, negativeSha256]) => ({
        assignment,
        derived,
        choice,
        requestId,
        positiveSha256,
        negativeSha256,
        ...matched,
        handoff: {
          observations: 1,
          ...matched,
          generatorStateUnchanged: true,
          methodRestored: true,
        },
      }),
    ),
    branchIsolation: Object.fromEntries(
      ['positiveHidden', 'negativeHidden', 'positivePooled', 'negativePooled'].map((key) => [
        key,
        { oppositeUnchanged: true, ownResourceChanges: true },
      ]),
    ),
  }
}

test('polarity profile independently fixes TXT-only crossed choices, 2 UI cycles, 4 native assignments and 5/9 read-only reuse', () => {
  assert.deepEqual(polarityChoices, ['positive-zero', 'negative-zero'])
  for (const objective of ['epsilon', 'v_prediction']) {
    const input = fixture('txt2img', objective)
    const before = structuredClone(input)
    const plan = validateNoobaiEmbeddingPolarityFixture(input, ready)
    assert.equal(plan.mode, 'txt2img')
    assert.equal(plan.modelKey, objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious')
    assert.deepEqual(plan.execution, execution(objective))
    assert.deepEqual(plan.choices, ['positive-zero', 'negative-zero'])
    assert.deepEqual(plan.expectedOutcome, {
      finiteCompletions: 2,
      actualAdmissions: 2,
      canceledOriginals: 0,
      preservingRetryRefusals: 0,
    })
    assert.equal(plan.matchedPixelControlCases, 1)
    assert.equal(plan.expectedDirectionalNativeAssignments, 4)
    assert.equal(plan.expectedCatalogResources, 5)
    assert.equal(plan.expectedCatalogVersions, 9)
    assert.equal(plan.maximumAdditionalManagedFiles, 0)
    assert.equal(plan.fullMvpClaim, false)
    assert.equal(plan.combinedMatrixClaim, false)
    assert.deepEqual(input, before)
  }
})

test('unsupported polarity modes refuse before borrowed descriptor validation', () => {
  for (const stage of ['img2img', 'outpaint', 'lifecycle', 'inpaint', 'bounded', '']) {
    const input = fixture(stage)
    delete input.externalVaeEncoderControl
    assert.throws(() => validateNoobaiEmbeddingPolarityFixture(input, ready), /only txt2img/)
  }
})

test('polarity fixture retains exact ninth origin, unique identity, labels and source closure', () => {
  for (const mutate of [
    (input) => {
      delete input.externalVaeEncoderControl
    },
    (input) => {
      input.externalVaeEncoderControl.origin.decoderBiasAdd = 0.5
    },
    (input) => {
      input.externalVaeEncoderControl.origin.sourceVaeSha256 = input.externalVaeLdm.sha256
    },
    (input) => {
      input.externalVaeEncoderControl.sha256 = input.externalVaeNative.sha256
    },
    (input) => {
      input.externalVaeEncoderControl.path = 'relative.safetensors'
    },
    (input) => {
      input.embeddingControl.path = '/zero/Different.safetensors'
    },
    (input) => {
      input.embeddingControl.origin.sourceEmbeddingSha256 = '0'.repeat(64)
    },
    (input) => {
      input.selections = ['positive-zero', 'negative-zero']
    },
    (input) => {
      input.profile = 'noobai-components'
    },
  ]) {
    const input = fixture()
    mutate(input)
    assert.throws(() => validateNoobaiEmbeddingPolarityFixture(input, ready))
  }
})

test('polarity requires exact qualified worker and retained embedding capability', () => {
  assert.throws(() =>
    validateNoobaiEmbeddingPolarityFixture(fixture(), { ...ready, workerVersion: '0.13.0' }),
  )
  assert.throws(() =>
    validateNoobaiEmbeddingPolarityFixture(fixture(), {
      ...ready,
      capabilities: ready.capabilities.filter((value) => value !== 'illustrious-embeddings'),
    }),
  )
})

test('old component and encoder plans keep their existing modes and choice counts', () => {
  const encoder = { ...fixture(), profile: 'noobai-vae-encoder' }
  assert.deepEqual(validateNoobaiVaeEncoderFixture(encoder, ready).choices, [
    'fullstack',
    'encoder-control',
  ])
  const components = { ...encoder, profile: 'noobai-components' }
  delete components.externalVaeEncoderControl
  assert.deepEqual(validateNoobaiComponentsFixture(components, ready).choices, [
    'fullstack',
    'lora-disabled',
    'positive-zero',
    'negative-zero',
    'vae-control',
    'ldm-layout',
  ])
  assert.throws(() => validateNoobaiComponentsFixture(encoder, ready))
})

test('read-only polarity catalog requires all5 resources/9 versions even with an adoption request', () => {
  const input = installedFixture()
  const full = catalog(input)
  assert.equal(full.length, 5)
  assert.equal(full.flatMap(({ versions }) => versions).length, 9)
  const before = structuredClone(full)
  // The return value lists component keys; checkpoint/LoRA identities remain in the 5/9 catalog.
  assert.deepEqual([...assertNoobaiEmbeddingPolarityCatalog(full, input)].sort(), [
    'embeddingControl',
    'embeddingTrained',
    'externalVaeControl',
    'externalVaeEncoderControl',
    'externalVaeLdm',
    'externalVaeNative',
  ])
  assert.deepEqual(full, before)
  assert.throws(() =>
    assertNoobaiEmbeddingPolarityCatalog(catalog(input, false), input, { adopting: true }),
  )
  const unknown = structuredClone(full)
  unknown[0].versions.push({
    ...unknown[0].versions[0],
    id: 'undeclared',
    file: { ...unknown[0].versions[0].file, sha256: '0'.repeat(64) },
  })
  assert.throws(() => assertNoobaiEmbeddingPolarityCatalog(unknown, input))
})

test('polarity catalog forbids publication and changes to existing owners/defaults/files/metadata', () => {
  const input = installedFixture()
  const original = catalog(input)
  assert.deepEqual(
    assertNoobaiEmbeddingPolarityCatalogPreserved(structuredClone(original), original, input),
    [],
  )
  for (const mutate of [
    (current) => {
      current.find(({ type }) => type === 'embedding').defaultVersionId = 'version-700110'
    },
    (current) => {
      current.find(({ type }) => type === 'vae').sourceCheckedAt = '2026-10-09T00:00:00.000Z'
    },
    (current) => {
      current[0].displayName += 'changed'
    },
    (current) => {
      current[0].versions[0].file.managedPath = '/changed/file.safetensors'
    },
    (current) => {
      current[0].sourceMetadata.qualificationPrecondition = false
    },
    (current) => {
      current.find(({ type }) => type === 'vae').versions.pop()
    },
  ]) {
    const current = structuredClone(original)
    mutate(current)
    assert.throws(() => assertNoobaiEmbeddingPolarityCatalogPreserved(current, original, input))
  }
  assert.throws(() =>
    assertNoobaiEmbeddingPolarityCatalogPreserved(original, catalog(input, false), input),
  )
})

test('crossed frozen choices retain literal text and independently expected opposite exact resource identities', () => {
  for (const objective of ['epsilon', 'v_prediction']) {
    const input = installedFixture('txt2img', objective)
    for (const choice of ['positive-zero', 'negative-zero']) {
      const value = frozen(input, choice)
      const before = structuredClone(value)
      assertNoobaiEmbeddingPolarityFrozen(value, input, choice)
      assert.equal(
        value.context.embeddingRefs.positive[0].resource.fileSha256,
        choice === 'positive-zero' ? 'c'.repeat(64) : trainedSha,
      )
      assert.equal(
        value.context.embeddingRefs.negative[0].resource.fileSha256,
        choice === 'negative-zero' ? 'c'.repeat(64) : trainedSha,
      )
      assert.deepEqual(value, before)
    }
  }
})

test('frozen polarity rejects dropped, same-sign, swapped or substituted references before normalization', () => {
  const input = installedFixture()
  for (const mutate of [
    (value) => {
      value.context.embeddingRefs.negative = []
    },
    (value) => {
      value.workerJob.embeddings.positive = []
    },
    (value) => {
      value.workerJob.embeddings.positive = structuredClone(value.workerJob.embeddings.negative)
    },
    (value) => {
      ;[value.workerJob.embeddings.positive, value.workerJob.embeddings.negative] = [
        value.workerJob.embeddings.negative,
        value.workerJob.embeddings.positive,
      ]
    },
    (value) => {
      value.context.embeddings.positive[0].reference.civitaiVersionId++
    },
    (value) => {
      value.context.embeddingRefs.positive[0].token = '<PHOTO>'
    },
    (value) => {
      value.kind = 'illustrious-img2img'
    },
    (value) => {
      value.context.sampling.denoisingStrength = 0.5
    },
    (value) => {
      value.workerJob.sampling.denoisingStrength = 0.5
    },
  ]) {
    const value = frozen(input)
    mutate(value)
    assert.throws(() => normalizeNoobaiEmbeddingPolarityInputs(value, input, 'positive-zero'))
  }
  assert.throws(() =>
    assertNoobaiEmbeddingPolarityFrozen(frozen(input, 'fullstack'), input, 'fullstack'),
  )
})

test('matched polarity normalization permits only both verified embedding version axes', () => {
  const input = installedFixture()
  const left = frozen(input, 'positive-zero')
  const right = frozen(input, 'negative-zero')
  const before = structuredClone([left, right])
  assert.deepEqual(
    normalizeNoobaiEmbeddingPolarityInputs(left, input, 'positive-zero'),
    normalizeNoobaiEmbeddingPolarityInputs(right, input, 'negative-zero'),
  )
  assert.deepEqual([left, right], before)
  assert.equal(
    normalizeNoobaiEmbeddingPolarityInputs(left, input, 'positive-zero').context.prompts.positive,
    'a cup, <Photo>',
  )
})

test('crossed pixels require matched sources/saved shape and inequality without claiming directional proof', () => {
  for (const objective of ['epsilon', 'v_prediction']) {
    const input = installedFixture('txt2img', objective)
    assert.deepEqual(assertNoobaiEmbeddingPolarityPixels(pixelCases(objective), input), [
      {
        choices: ['positive-zero', 'negative-zero'],
        mode: 'txt2img',
        directionalOracleRequired: true,
      },
    ])
  }
  for (const mutate of [
    (cases) => {
      cases.reverse()
    },
    (cases) => {
      cases.pop()
    },
    (cases) => {
      cases[1].dimensions.pixelSha256 = cases[0].dimensions.pixelSha256
    },
    (cases) => {
      cases[1].dimensions.width--
    },
    (cases) => {
      cases[1].target.pixelSha256 = '0'.repeat(64)
    },
    (cases) => {
      cases[1].target.sha256 = 'malformed'
    },
  ]) {
    const cases = pixelCases()
    mutate(cases)
    assert.throws(() => assertNoobaiEmbeddingPolarityPixels(cases, installedFixture()))
  }
})

test('matched crossed cases retain seed/source/decoder/LoRA/noise and literal neighboring inputs', () => {
  for (const mutate of [
    (value) => {
      value.context.sampling.seed = value.workerJob.sampling.seed = 37
    },
    (value) => {
      value.context.target.sha256 = value.workerJob.target.sha256 = '0'.repeat(64)
    },
    (value) => {
      value.context.vae.reference.versionName += 'wrong decoder'
    },
    (value) => {
      value.context.loraStack[0].weight = -0.4
    },
    (value) => {
      value.context.sampling.noiseProfile.rescaleBetasZeroSnr = true
    },
    (value) => {
      value.context.prompts.negative += ', neighbor drift'
      value.workerJob.prompts.negative = value.context.prompts.negative
    },
    (value) => {
      value.context.prompts.positive = value.workerJob.prompts.positive = 'a cup, <PHOTO>'
    },
  ]) {
    const cases = pixelCases()
    mutate(cases[1].frozen)
    assert.throws(() => assertNoobaiEmbeddingPolarityPixels(cases, installedFixture()))
  }
})

test('independent native result requires all four signed tensors/handoff and isolates every branch', () => {
  const input = nativeInput()
  assert.deepEqual(assertNoobaiEmbeddingPolarityOracle(nativeResult(input), input), {
    observedCommands: 2,
    nativeAssignments: 4,
    directionalOraclePassed: true,
  })
  for (const field of [
    'hiddenPositiveMatches',
    'hiddenNegativeMatches',
    'pooledPositiveMatches',
    'pooledNegativeMatches',
  ]) {
    const value = nativeResult(input)
    value.cases[1][field] = false
    assert.throws(() => assertNoobaiEmbeddingPolarityOracle(value, input))
    value.cases[1][field] = true
    value.cases[1].handoff[field] = false
    assert.throws(() => assertNoobaiEmbeddingPolarityOracle(value, input))
  }
  for (const field of ['positiveHidden', 'negativeHidden', 'positivePooled', 'negativePooled']) {
    const value = nativeResult(input)
    value.branchIsolation[field].oppositeUnchanged = false
    assert.throws(() => assertNoobaiEmbeddingPolarityOracle(value, input))
    value.branchIsolation[field].oppositeUnchanged = true
    value.branchIsolation[field].ownResourceChanges = false
    assert.throws(() => assertNoobaiEmbeddingPolarityOracle(value, input))
  }
})

test('native oracle refuses wrong counts/assignments/actual requests/source pins and incomplete handoff', () => {
  const input = nativeInput()
  for (const mutate of [
    (value) => {
      value.status = 'failed'
    },
    (value) => {
      value.observedCommands = 4
    },
    (value) => {
      value.nativeAssignments = 2
    },
    (value) => {
      value.cases.pop()
    },
    (value) => {
      value.cases.reverse()
    },
    (value) => {
      value.cases[1].positiveSha256 = 'c'.repeat(64)
    },
    (value) => {
      value.cases[1].requestId = 'unobserved-request'
    },
    (value) => {
      value.cases[1].derived = true
    },
    (value) => {
      value.workerRootPath = '/repo/worker-python/src/imagegen_worker'
    },
    (value) => {
      value.workerSourceFiles['payload-0.py'].sha256 = 'b'.repeat(64)
    },
    (value) => {
      value.checkpoint.sha256 = '0'.repeat(64)
    },
    (value) => {
      value.configDir = '/wrong/config'
    },
    (value) => {
      value.cases[0].handoff.observations = 0
    },
    (value) => {
      value.cases[0].handoff.generatorStateUnchanged = false
    },
    (value) => {
      value.cases[0].handoff.methodRestored = false
    },
    (value) => {
      delete value.cases[0].pooledNegativeMatches
    },
  ]) {
    const value = nativeResult(input)
    mutate(value)
    assert.throws(() => assertNoobaiEmbeddingPolarityOracle(value, input))
  }
})

test('stage outcome requires two finite UI cycles plus independent direction, without a combined/MVP claim', () => {
  const summary = {
    stage: 'txt2img',
    objective: 'epsilon',
    finiteCompletions: 2,
    actualAdmissions: 2,
    canceledOriginals: 0,
    preservingRetryRefusals: 0,
    matchedPixelControlCases: 1,
    fullMvpClaim: false,
    combinedMatrixClaim: false,
    directionalNativeAssignments: 4,
    directionalOraclePassed: true,
  }
  assertNoobaiEmbeddingPolarityStageOutcome(summary)
  for (const [key, wrong] of [
    ['finiteCompletions', 1],
    ['actualAdmissions', 4],
    ['canceledOriginals', 1],
    ['preservingRetryRefusals', 1],
    ['matchedPixelControlCases', 2],
    ['fullMvpClaim', true],
    ['combinedMatrixClaim', true],
    ['directionalNativeAssignments', 2],
    ['directionalOraclePassed', false],
    ['stage', 'img2img'],
    ['objective', 'anima'],
  ])
    assert.throws(() => assertNoobaiEmbeddingPolarityStageOutcome({ ...summary, [key]: wrong }))
  const missingDirection = { ...summary }
  delete missingDirection.directionalOraclePassed
  assert.throws(() => assertNoobaiEmbeddingPolarityStageOutcome(missingDirection))
})
