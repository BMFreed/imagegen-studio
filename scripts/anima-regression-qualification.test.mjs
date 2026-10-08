/** Independent literal guard fixtures; no installed runtime, model reads or inference. */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import {
  animaRegressionExecution,
  animaRegressionMethods,
  animaRegressionModelKeys,
  animaRegressionPublicationIds,
  animaRegressionStagePlan,
  assertAnimaRegressionCatalog,
  assertAnimaRegressionCatalogPreserved,
  assertAnimaRegressionConfiguration,
  assertAnimaRegressionFrozen,
  assertAnimaRegressionStageOutcome,
  normalizeAnimaRegressionInputs,
  validateAnimaRegressionFixture,
} from './anima-regression-qualification.mjs'
import { assertNoobaiLoraStackCatalog } from './noobai-lora-stack-qualification.mjs'

const checkpointSha = '0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941'
const encoderSha = 'cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba'
const vaeSha = 'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f'
const mythSha = 'cd9639b03d4458323e696e3792ff7535ae03f9f70368d6d0dc17fe86fa4f354f'
const epsSha = 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1'
const nativeSha = 'f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7'
const trainedSha = '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36'
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const positive = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
const negative = '(blurry:0.7), low quality'
const oldTime = '2026-10-08T10:00:00.000Z'
const publishedTime = '2026-10-08T11:00:00.000Z'
const priorIds = {
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
const newIds = {
  encoder: [700010],
  vae: [700020],
  anima: [700030, 1147756, 3120487, 3000817],
  animaLora: [700050, 599757, 3084665, 2964030],
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
    'anima-txt2img',
    'anima-img2img',
    'anima-lora',
    'anima-prompt-weighting',
    'anima-flow-sampling',
    'anima-outpaint',
  ],
}
function civitai(modelId, versionId, fileId, creator, creditRequired = false) {
  return {
    kind: 'civitai-trained',
    modelId,
    versionId,
    fileId,
    creator,
    creditRequired,
    url: `https://civitai.com/api/download/models/${versionId}?fileId=${fileId}`,
  }
}
function noobOrigin(modelId, versionId, fileId, creator) {
  const value = civitai(modelId, versionId, fileId, creator)
  delete value.creditRequired
  return {
    ...value,
    baseModel: 'NoobAI',
    modelApi: `https://civitai.com/api/v1/models/${modelId}`,
    versionApi: `https://civitai.com/api/v1/model-versions/${versionId}`,
  }
}
function dependency(relativePath) {
  return {
    kind: 'reference-artifact',
    repository: 'circlestone-labs/Anima',
    revision: 'f973fc41ec7545364ac9776c2440285f43ff2a30',
    path: relativePath,
    url: `https://huggingface.co/circlestone-labs/Anima/resolve/f973fc41ec7545364ac9776c2440285f43ff2a30/${relativePath}`,
  }
}
function descriptor(
  type,
  filename,
  sha256,
  byteSize,
  name,
  versionName,
  origin,
  family = 'illustrious',
) {
  return {
    path: `/original/${filename}.safetensors`,
    sha256,
    byteSize,
    type,
    family,
    name,
    versionName,
    ...(origin ? { origin } : {}),
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
function fixture(stage = 'sampling', installed = false) {
  const value = {
    schemaVersion: 1,
    profile: 'anima-regression',
    stage,
    objective: 'epsilon',
    appData: '/owned/data/imagegen-studio',
    artifacts: '/owned/evidence',
    side: 256,
    steps: 3,
    illustrious: {
      ...descriptor('checkpoint', 'cyber', 'a'.repeat(64), 999, 'Cyberfalafel', 'v-trained'),
      predictionType: null,
      trainedObjective: 'v_prediction',
      origin: noobOrigin(1147756, 2679856, 2566634, 'Knightus_Ai'),
    },
    illustriousEpsilon: {
      ...descriptor('checkpoint', 'noob-eps', epsSha, 6938040416, 'Noob', 'eps1.0'),
      predictionType: null,
      trainedObjective: 'epsilon',
      origin: noobOrigin(833294, 1022833, 928571, 'L_A_X'),
    },
    illustriousLora: descriptor(
      'lora',
      'Digital_Art',
      'c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9',
      114437420,
      'Digital Art',
      'trained',
    ),
    illustriousLoraSecond: descriptor(
      'lora',
      'Lineless_Digital_Painting_Style',
      '90f9f879ff2e27fcaec5723a2c3e5db53ec5ffbdd4c7df49159c0ccbfe63b1ca',
      171540060,
      'Lineless Digital Painting',
      'Lineless Digital Painting Style',
      civitai(1795307, 2031703, 1934353, 'Underdorks', true),
    ),
    embeddingTrained: descriptor(
      'embedding',
      'Photo',
      trainedSha,
      49736,
      'Photo',
      'trained',
      civitai(2360940, 2655289, 2542976, 'CautionMergeAhead', true),
    ),
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
    encoder: descriptor(
      'qwen3_encoder',
      'qwen_3_06b_base',
      encoderSha,
      1192135096,
      'Qwen3 encoder',
      'Anima Qwen3 0.6B',
      dependency('split_files/text_encoders/qwen_3_06b_base.safetensors'),
      'anima',
    ),
    vae: descriptor(
      'vae',
      'qwen_image_vae',
      vaeSha,
      253806246,
      'Anima VAE',
      'Anima Qwen Image VAE',
      dependency('split_files/vae/qwen_image_vae.safetensors'),
      'anima',
    ),
    anima: descriptor(
      'checkpoint',
      'cyber-anima',
      checkpointSha,
      4182275752,
      'Cyberfalafel',
      'Cyberfalafel anima v1.0',
      civitai(1147756, 3120487, 3000817, 'Knightus_Ai'),
      'anima',
    ),
    animaLora: descriptor(
      'lora',
      'Myth',
      mythSha,
      138663759,
      'Myth Portrait',
      'Anima Portrait Style',
      civitai(599757, 3084665, 2964030, 'VelvetS'),
      'anima',
    ),
  }
  if (stage !== 'sampling') {
    value.commonSource = {
      path: '/owned/source.png',
      sha256: 'e'.repeat(64),
      byteSize: 2048,
      pixelSha256: 'f'.repeat(64),
      width: 256,
      height: 256,
      originQueueItemId: 'healthy-euler-txt',
    }
    value.lama = {
      path: '/owned/lama.pt',
      byteSize: 205669692,
      sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
    }
  }
  if (stage === 'restored')
    value.animaPixelBaselines = {
      sampling: { reportPath: '/owned/sampling/report.json', reportSha256: '1'.repeat(64) },
      imageModes: { reportPath: '/owned/image-modes/report.json', reportSha256: '2'.repeat(64) },
    }
  if (installed) {
    for (const [key, [managedId, modelId]] of Object.entries(priorIds))
      value[key].installed = {
        resourceId: `resource-${modelId}`,
        versionId: `version-${managedId}`,
        managedPath: `/owned/data/imagegen-studio/models/qualified-${managedId}.safetensors`,
      }
    for (const [key, [managedId, modelId]] of Object.entries(newIds))
      value[key].installed = {
        resourceId: `resource-${modelId ?? managedId}`,
        versionId: `version-${managedId}`,
        managedPath: `/owned/data/imagegen-studio/models/qualified-${managedId}.safetensors`,
      }
  }
  return value
}
function borrowed(value) {
  const copy = structuredClone(value)
  for (const key of [
    'encoder',
    'vae',
    'anima',
    'animaLora',
    'commonSource',
    'lama',
    'animaPixelBaselines',
  ])
    delete copy[key]
  copy.profile = 'noobai-lora-stack'
  copy.stage = 'txt2img'
  return copy
}
function version(value, key, ids, family = 'illustrious', createdAt = oldTime) {
  const source = value[key]
  return {
    id: source.installed.versionId,
    name: source.versionName,
    createdAt,
    file: {
      sha256: source.sha256,
      sizeBytes: source.byteSize,
      status: 'ready',
      originalFilename: path.basename(source.path),
      managedPath: source.installed.managedPath,
    },
    expectedSha256: source.sha256,
    format: 'safetensors',
    baseModelFamily: family,
    predictionType: null,
    civitaiVersionId: ids[2] ?? null,
    civitaiFileId: ids[3] ?? null,
    dependencyVersionIds: {},
    sourceMetadata: {
      qualificationPrecondition: true,
      ...(source.origin ? { origin: structuredClone(source.origin) } : {}),
    },
  }
}
function catalog(value, keys = ['encoder', 'vae', 'anima', 'animaLora']) {
  const resources = new Map()
  for (const [key, ids] of Object.entries(priorIds)) {
    const source = value[key],
      modelId = ids[1]
    if (!resources.has(modelId)) {
      const resource = {
        id: source.installed.resourceId,
        type: source.type,
        displayName: source.name,
        source: { kind: 'civitai', modelId },
        sourceMetadata: { qualificationPrecondition: true },
        defaultVersionId: source.installed.versionId,
        sourceCheckedAt: oldTime,
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
    resources.get(modelId).versions.push(version(value, key, ids))
  }
  for (const key of keys) {
    const source = value[key],
      ids = newIds[key]
    const item = version(value, key, ids, 'anima', publishedTime)
    if (key === 'anima') {
      item.dependencyVersionIds = {
        qwen3_encoder: value.encoder.installed.versionId,
        vae: value.vae.installed.versionId,
      }
      const owner = resources.get(1147756)
      owner.versions.push(item)
      owner.sourceCheckedAt = publishedTime
    } else
      resources.set(ids[1] ?? ids[0], {
        id: source.installed.resourceId,
        type: source.type,
        displayName: source.name,
        source: ids[1]
          ? { kind: 'civitai', modelId: ids[1] }
          : { kind: 'supported_dependency', key: `qualification-${ids[0]}` },
        sourceMetadata: { qualificationPrecondition: true, origin: structuredClone(source.origin) },
        creator: ids[1] ? source.origin.creator : null,
        defaultVersionId: item.id,
        sourceCheckedAt: publishedTime,
        versions: [item],
      })
  }
  return [...resources.values()]
}
function reference(value, key) {
  const source = value[key],
    ids = newIds[key]
  return {
    baseModelFamily: 'anima',
    civitaiFileId: ids[3],
    civitaiModelId: ids[1],
    civitaiVersionId: ids[2],
    displayName: source.name,
    fileSha256: source.sha256,
    kind: source.type,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    predictionType: null,
    versionName: source.versionName,
  }
}
function companion(value, key) {
  const source = value[key]
  return {
    byteSize: source.byteSize,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    managedPath: source.installed.managedPath,
    sha256: source.sha256,
  }
}
function workerFile(value, key) {
  const source = value[key]
  return { byteSize: source.byteSize, path: source.installed.managedPath, sha256: source.sha256 }
}
// Literal native N3 schedules: no production compiler or exported guard constructs expectations.
const schedules = {
  euler: [
    [1, 0.8571428571428571, 0.6, 0],
    [1000, 857.1428571428571, 600],
  ],
  heun: [
    [1, 0.7511211037635803, 0.7511211037635803, 0.008928571827709675, 0.008928571827709675, 0],
    [1000, 751.12109375, 751.12109375, 8.928571701049805, 8.928571701049805],
  ],
  dpmpp_2m: [
    [0.9996664524078369, 0.8567752838134766, 0.5996398329734802, 0],
    [999, 856, 599],
  ],
  dpmpp_2m_sde: [
    [0.9996664524078369, 0.8567752838134766, 0.5996398329734802, 0],
    [999, 856, 599],
  ],
  er_sde: [
    [1, 0.8571428656578064, 0.6000000238418579, 0],
    [1000, 857.1428833007812, 600],
  ],
  lcm: [
    [1, 0.8571428656578064, 0.6000000238418579, 0],
    [1000, 857.1428833007812, 600],
  ],
}
function frozen(value, choice) {
  const mode = choice.slice(choice.lastIndexOf('-') + 1),
    method = choice.slice(0, choice.lastIndexOf('-'))
  const image = mode !== 'txt2img',
    offset = image ? 1 : 0
  const [fullSigmas, fullTimesteps] = schedules[method]
  const bbox = { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 }
  const target = {
    byteSize: 2048,
    colorSpace: 'srgb',
    format: 'png',
    width: 256,
    height: 256,
    sha256: 'e'.repeat(64),
    iccSha256: icc,
  }
  const context = {
    schemaVersion: 1,
    kind: `anima-${mode}-preparation`,
    documentId: '00000000-0000-4000-8000-000000000001',
    documentRevision: '00000000-0000-4000-8000-000000000002',
    bbox,
    prompts: { positive, negative },
    target,
    sampling: {
      animaMethod: method,
      cfgScale: 4,
      requestedSeedPolicy: 'fixed',
      seed: 0,
      seedBehavior: 'per-iteration',
      steps: 3,
      ...(image ? { denoisingStrength: 0.5 } : {}),
    },
    model: {
      architecture: 'anima-base-1.0',
      checkpoint: {
        byteSize: 4182275752,
        managedPath: value.anima.installed.managedPath,
        reference: reference(value, 'anima'),
      },
      qwen3Encoder: companion(value, 'encoder'),
      vae: companion(value, 'vae'),
    },
    loraStack: [{ enabled: true, resource: reference(value, 'animaLora'), weight: -0.5 }],
    loras: [
      {
        byteSize: 138663759,
        managedPath: value.animaLora.installed.managedPath,
        reference: reference(value, 'animaLora'),
        weight: -0.5,
      },
    ],
  }
  if (mode === 'outpaint')
    context.conditioning = {
      kind: 'alpha-outpaint-conditioning',
      schemaVersion: 1,
      bbox,
      sourceTarget: {
        byteSize: 2048,
        format: 'png',
        width: 256,
        height: 256,
        sha256: 'e'.repeat(64),
        iccSha256: icc,
      },
      infillResource: { byteSize: 205669692, role: 'outpaint-infill', sha256: value.lama.sha256 },
      keepMask: {
        byteSize: 65536,
        format: 'alpha8',
        width: 256,
        height: 256,
        polarity: 'keep',
        sha256: '7'.repeat(64),
      },
      policy: {
        edgeRadius: 16,
        fadeDistance: 16,
        infillMethod: 'lama',
        maskBlur: 'gaussian-weighted-max',
        minimumDenoise: 0,
        outputMode: 'contribution',
        version: 1,
      },
    }
  return {
    schemaVersion: 1,
    originRequestId: 'initial-anima-request',
    kind: `anima-${mode}`,
    context,
    workerJob: {
      schemaVersion: 1,
      bbox,
      target: { byteSize: 2048, width: 256, height: 256, sha256: 'e'.repeat(64), iccSha256: icc },
      model: {
        architecture: 'anima-base-1.0',
        checkpoint: workerFile(value, 'anima'),
        qwen3Encoder: workerFile(value, 'encoder'),
        vae: workerFile(value, 'vae'),
      },
      loras: [{ ...workerFile(value, 'animaLora'), weight: -0.5 }],
      prompts: {
        positive: {
          version: 'anima-prompt-weighting-v1',
          cleanedText: 'a red ceramic cup on a wooden table, studio photograph',
          spans: [
            { start: 0, end: 2, weight: 1 },
            { start: 2, end: 5, weight: 1.3 },
            { start: 5, end: 54, weight: 1 },
          ],
        },
        negative: {
          version: 'anima-prompt-weighting-v1',
          cleanedText: 'blurry, low quality',
          spans: [
            { start: 0, end: 6, weight: 0.7 },
            { start: 6, end: 19, weight: 1 },
          ],
        },
      },
      sampling: {
        beginIndex: offset,
        guidanceScale: 4,
        height: 256,
        initialSigma: image ? fullSigmas[1] : 1,
        mode: image ? 'img2img' : 'txt2img',
        posteriorSeed: image ? 2654435769 : null,
        scheduler: method,
        seed: 0,
        sigmas: fullSigmas.slice(offset),
        startStep: offset,
        steps: 3,
        stepSeed: 0,
        strength: image ? 0.5 : null,
        timesteps: fullTimesteps.slice(offset),
        totalSteps: image ? 2 : fullTimesteps.length,
        version: 'anima-flow-denoising-v1',
        width: 256,
      },
    },
  }
}
function configuration(value, choice) {
  const mode = choice.slice(choice.lastIndexOf('-') + 1),
    method = choice.slice(0, choice.lastIndexOf('-'))
  const portable = (key) => {
    const { managedPath: _path, ...fields } = companion(value, key)
    return fields
  }
  return {
    anima: {
      architecture: 'anima-base-1.0',
      checkpointByteSize: 4182275752,
      qwen3Encoder: portable('encoder'),
      vae: portable('vae'),
    },
    loras: [{ enabled: true, resource: reference(value, 'animaLora'), weight: -0.5 }],
    mode,
    model: reference(value, 'anima'),
    positivePrompt: { text: positive, embeddingRefs: [] },
    negativePrompt: { text: negative, embeddingRefs: [] },
    size: { width: 256, height: 256 },
    sampling: {
      actualSeed: 0,
      animaMethod: method,
      cfgScale: 4,
      requestedSeedPolicy: 'fixed',
      seedBehavior: 'per-iteration',
      steps: 3,
      ...(mode === 'txt2img' ? {} : { denoisingStrength: 0.5 }),
    },
  }
}

test('declared Anima sources preserve exact publication identities and six native method names', () => {
  assert.deepEqual(animaRegressionModelKeys, ['encoder', 'vae', 'anima', 'animaLora'])
  assert.deepEqual(animaRegressionMethods, [
    'euler',
    'heun',
    'dpmpp_2m',
    'dpmpp_2m_sde',
    'er_sde',
    'lcm',
  ])
  assert.deepEqual(animaRegressionPublicationIds, {
    encoder: { managedId: 700010 },
    vae: { managedId: 700020 },
    anima: { managedId: 700030, modelId: 1147756, versionId: 3120487, fileId: 3000817 },
    animaLora: { managedId: 700050, modelId: 599757, versionId: 3084665, fileId: 2964030 },
  })
})
for (const [stage, choices, admissions, canceled] of [
  [
    'sampling',
    [
      'euler-txt2img',
      'heun-txt2img',
      'dpmpp_2m-txt2img',
      'dpmpp_2m_sde-txt2img',
      'er_sde-txt2img',
      'lcm-txt2img',
    ],
    6,
    0,
  ],
  ['image-modes', ['euler-img2img', 'euler-outpaint'], 3, 1],
  ['restored', ['euler-txt2img', 'euler-img2img', 'euler-outpaint'], 3, 0],
])
  test(`strict ${stage} plan counts finite completions separately from Cancel admission`, () => {
    const plan = validateAnimaRegressionFixture(fixture(stage), ready)
    assert.deepEqual(plan.choices, choices)
    assert.deepEqual(plan.expectedOutcome, {
      finiteCompletions: choices.length,
      actualAdmissions: admissions,
      canceledOriginals: canceled,
      preservingRetryRefusals: 0,
    })
    assert.equal(plan.expectedCatalogResources, 9)
    assert.equal(plan.expectedCatalogVersions, 14)
    assert.equal(plan.fullMvpClaim, false)
    assert.equal(plan.combinedMatrixClaim, false)
    assertAnimaRegressionStageOutcome({
      stage,
      finiteCompletions: choices.length,
      actualAdmissions: admissions,
      canceledOriginals: canceled,
      preservingRetryRefusals: 0,
      fullMvpClaim: false,
      combinedMatrixClaim: false,
    })
  })
test('image execution preserves authored three steps with nonzero half strength', () => {
  assert.deepEqual(animaRegressionExecution('euler-outpaint'), {
    width: 256,
    height: 256,
    steps: 3,
    cfgScale: 4,
    animaMethod: 'euler',
    mode: 'outpaint',
    denoisingStrength: 0.5,
  })
  assert.deepEqual(animaRegressionExecution('heun-txt2img'), {
    width: 256,
    height: 256,
    steps: 3,
    cfgScale: 4,
    animaMethod: 'heun',
    mode: 'txt2img',
  })
  for (const choice of ['heun-img2img', 'lcm-outpaint', 'euler', 'euler-inpaint', 'Euler-txt2img'])
    assert.throws(() => animaRegressionExecution(choice))
})
for (const stage of ['txt2img', 'outpaint', 'lifecycle', 'sampling-extra'])
  test(`unsupported ${stage} refuses before inspecting absent sources`, () => {
    assert.throws(
      () => validateAnimaRegressionFixture({ profile: 'anima-regression', stage }, ready),
      /Unsupported Anima regression stage/,
    )
  })
for (const capability of [
  'anima-txt2img',
  'anima-img2img',
  'anima-lora',
  'anima-prompt-weighting',
  'anima-flow-sampling',
  'anima-outpaint',
])
  test(`preflight requires installed ${capability}`, () => {
    const value = structuredClone(ready)
    value.capabilities = value.capabilities.filter((name) => name !== capability)
    assert.throws(() => validateAnimaRegressionFixture(fixture(), value), new RegExp(capability))
  })
test('worker/profile and undeclared descriptor fields fail closed', () => {
  for (const alter of [
    (value) => {
      value.encoder.origin.revision = 'unqualified'
    },
    (value) => {
      value.vae.sha256 = '0'.repeat(64)
    },
    (value) => {
      value.anima.name = 'separate fake Cyber resource'
    },
    (value) => {
      value.animaLora.origin.fileId = 3000817
    },
    (value) => {
      value.encoder.path = 'relative.safetensors'
    },
    (value) => {
      value.anima.installed = { resourceId: 'r', versionId: 'v', managedPath: '/owned/a' }
    },
    (value) => {
      value.extra = true
    },
    (value) => {
      value.objective = 'v_prediction'
    },
  ]) {
    const value = fixture()
    alter(value)
    assert.throws(() => validateAnimaRegressionFixture(value, ready))
  }
  for (const alter of [
    (value) => {
      value.workerVersion = '0.12.0'
    },
    (value) => {
      value.protocolVersion = '2'
    },
    (value) => {
      value.runtimeProfile = 'linux-cpu'
    },
  ]) {
    const value = structuredClone(ready)
    alter(value)
    assert.throws(() => validateAnimaRegressionFixture(fixture(), value))
  }
})
test('sampling refuses fabricated source/LaMa and restored requires both healthy reports', () => {
  const value = fixture()
  value.commonSource = fixture('image-modes').commonSource
  assert.throws(() => validateAnimaRegressionFixture(value, ready))
  const restored = fixture('restored')
  delete restored.animaPixelBaselines.imageModes
  assert.throws(() => validateAnimaRegressionFixture(restored, ready))
  const mutation = fixture()
  mutation.animaPixelBaselines = {
    sampling: { reportPath: '/owned/normal/report.json', reportSha256: '4'.repeat(64) },
  }
  validateAnimaRegressionFixture(mutation, ready)
})
test('image source and pinned LaMa descriptors reject malformed one-axis neighbors', () => {
  for (const alter of [
    (value) => {
      delete value.lama
    },
    (value) => {
      value.lama.sha256 = '0'.repeat(64)
    },
    (value) => {
      value.lama.byteSize -= 1
    },
    (value) => {
      value.lama.path = 'relative/lama.pt'
    },
    (value) => {
      value.commonSource.width = 512
    },
    (value) => {
      value.commonSource.originQueueItemId = ''
    },
    (value) => {
      value.commonSource.pixelSha256 = 'bad'
    },
    (value) => {
      value.commonSource.byteSize = 0
    },
  ]) {
    const value = fixture('image-modes')
    alter(value)
    assert.throws(() => validateAnimaRegressionFixture(value, ready))
  }
})
test('catalog adopts three owners plus a same-Cyber Anima version, final nine/fourteen', () => {
  const value = fixture('sampling', true),
    current = catalog(value)
  assert.equal(current.length, 9)
  assert.equal(current.flatMap(({ versions }) => versions).length, 14)
  assert.deepEqual([...assertAnimaRegressionCatalog(current, value)].sort(), [
    'anima',
    'animaLora',
    'encoder',
    'vae',
  ])
  const owner = current.find(({ id }) => id === value.illustrious.installed.resourceId)
  assert.equal(owner.defaultVersionId, value.illustrious.installed.versionId)
  assert.equal(owner.displayName, 'Cyberfalafel')
  assert.equal(owner.sourceMetadata.origin.versionId, 2679856)
  assert.equal(
    owner.versions.find(({ id }) => id === value.anima.installed.versionId).sourceMetadata.origin
      .versionId,
    3120487,
  )
  assert.throws(() => assertNoobaiLoraStackCatalog(current, borrowed(value)))
})
test('adoption prefixes preserve complete original six/ten and exact companion dependencies', () => {
  const value = fixture('sampling', true)
  for (const keys of [
    [],
    ['encoder'],
    ['encoder', 'vae'],
    ['encoder', 'vae', 'anima'],
    ['encoder', 'vae', 'anima', 'animaLora'],
  ]) {
    assertAnimaRegressionCatalog(catalog(value, keys), value, { adopting: true })
  }
  assert.throws(() =>
    assertAnimaRegressionCatalog(catalog(value, ['anima']), value, { adopting: true }),
  )
  assert.throws(() => assertAnimaRegressionCatalog(catalog(value, []), value))
  const partial = catalog(value, [])
  partial[0].versions = []
  assert.throws(() => assertAnimaRegressionCatalog(partial, value, { adopting: true }))
})
test('catalog rejects duplicate fake Cyber owner rather than inventing a tenth resource', () => {
  const value = fixture('sampling', true),
    current = catalog(value)
  const cyber = current.find(({ id }) => id === value.anima.installed.resourceId)
  const added = cyber.versions.pop()
  current.push({
    ...structuredClone(cyber),
    id: 'fake-anima-owner',
    defaultVersionId: added.id,
    versions: [added],
  })
  assert.throws(() => assertAnimaRegressionCatalog(current, value))
})
test('frozen descriptor identities refuse fake Cyber or reused companion owners even before catalog lookup', () => {
  for (const alter of [
    (value) => {
      value.anima.installed.resourceId = 'fake-Cyber'
    },
    (value) => {
      value.vae.installed.resourceId = value.encoder.installed.resourceId
    },
    (value) => {
      value.animaLora.installed.versionId = value.illustriousLora.installed.versionId
    },
  ]) {
    const value = fixture('sampling', true)
    alter(value)
    assert.throws(() =>
      assertAnimaRegressionFrozen(frozen(value, 'euler-txt2img'), value, 'euler-txt2img'),
    )
  }
})
for (const [name, alter] of [
  [
    'default Anima replacing Noob',
    (entries, value) => {
      entries.find(({ id }) => id === value.anima.installed.resourceId).defaultVersionId =
        value.anima.installed.versionId
    },
  ],
  [
    'resource origin replacing old truth',
    (entries, value) => {
      entries.find(({ id }) => id === value.anima.installed.resourceId).sourceMetadata.origin =
        value.anima.origin
    },
  ],
  [
    'new version original bytes',
    (entries, value) => {
      entries.find(({ id }) => id === value.vae.installed.resourceId).versions[0].file.sizeBytes +=
        1
    },
  ],
  [
    'new version companion dependency',
    (entries, value) => {
      entries.find(
        ({ id }) => id === value.anima.installed.resourceId,
      ).versions[1].dependencyVersionIds.vae = value.encoder.installed.versionId
    },
  ],
  [
    'new LoRA foreign creator',
    (entries, value) => {
      entries.find(({ id }) => id === value.animaLora.installed.resourceId).creator = 'Other'
    },
  ],
  [
    'new encoder wrong source key',
    (entries, value) => {
      entries.find(({ id }) => id === value.encoder.installed.resourceId).source.key = 'other'
    },
  ],
  [
    'new version duplicate local ID',
    (entries, value) => {
      entries.find(({ id }) => id === value.vae.installed.resourceId).versions[0].id =
        value.encoder.installed.versionId
    },
  ],
  [
    'undeclared version',
    (entries) => {
      entries[0].versions.push({
        ...structuredClone(entries[0].versions[0]),
        id: 'undeclared',
        file: { ...entries[0].versions[0].file, sha256: '0'.repeat(64) },
      })
    },
  ],
])
  test(`strict catalog refuses ${name}`, () => {
    const value = fixture('sampling', true),
      current = catalog(value)
    alter(current, value)
    assert.throws(() => assertAnimaRegressionCatalog(current, value))
  })
test('preservation permits only exact shared-Cyber publication timestamps when adding its version', () => {
  const value = fixture('sampling', true),
    previous = catalog(value, []),
    current = catalog(value)
  assert.deepEqual(assertAnimaRegressionCatalogPreserved(current, previous, value), [
    {
      resourceId: 'resource-1147756',
      versionId: 'version-700030',
      sourceCheckedAt: publishedTime,
      createdAt: publishedTime,
    },
  ])
  previous[0].updatedAt = oldTime
  current[0].updatedAt = publishedTime
  assert.deepEqual(
    assertAnimaRegressionCatalogPreserved(current, previous, value)[0].updatedAt,
    publishedTime,
  )
})
for (const [name, alter] of [
  [
    'wrong publication timestamp',
    (current) => {
      current[0].sourceCheckedAt = '2026-10-08T12:00:00.000Z'
    },
  ],
  [
    'publication earlier than old',
    (current) => {
      current[0].sourceCheckedAt = '2026-10-08T09:00:00.000Z'
      current[0].versions[1].createdAt = current[0].sourceCheckedAt
    },
  ],
  [
    'other original resource timestamp',
    (current) => {
      current[1].sourceCheckedAt = publishedTime
    },
  ],
  [
    'old filename',
    (current) => {
      current[0].versions[0].file.originalFilename = 'changed.safetensors'
    },
  ],
  [
    'old default owner metadata',
    (current) => {
      current[0].displayName = 'Changed'
    },
  ],
])
  test(`preservation refuses ${name}`, () => {
    const value = fixture('sampling', true),
      previous = catalog(value, []),
      current = catalog(value)
    alter(current)
    assert.throws(() => assertAnimaRegressionCatalogPreserved(current, previous, value))
  })
test('already fourteen versions forbids repeated resource timestamp or original Anima changes', () => {
  const value = fixture('sampling', true),
    previous = catalog(value),
    current = structuredClone(previous)
  assert.deepEqual(assertAnimaRegressionCatalogPreserved(current, previous, value), [])
  current[0].sourceCheckedAt = '2026-10-08T12:00:00.000Z'
  assert.throws(() => assertAnimaRegressionCatalogPreserved(current, previous, value))
  const another = structuredClone(previous)
  another[0].versions[1].createdAt = oldTime
  assert.throws(() => assertAnimaRegressionCatalogPreserved(another, previous, value))
})
for (const method of ['euler', 'heun', 'dpmpp_2m', 'dpmpp_2m_sde', 'er_sde', 'lcm'])
  test(`frozen ${method} independently preserves native arrays, both weighted signs and bundle`, () => {
    const value = fixture('sampling', true),
      choice = `${method}-txt2img`,
      job = frozen(value, choice)
    assertAnimaRegressionFrozen(job, value, choice)
    assertAnimaRegressionConfiguration(configuration(value, choice), job, value, choice)
    assert.equal(job.workerJob.sampling.totalSteps, method === 'heun' ? 5 : 3)
    assert.equal(job.context.sampling.steps, 3)
  })
for (const choice of ['euler-img2img', 'euler-outpaint'])
  test(`frozen ${choice} preserves source frame and two effective Euler evaluations`, () => {
    const value = fixture('image-modes', true),
      job = frozen(value, choice)
    assertAnimaRegressionFrozen(job, value, choice)
    assertAnimaRegressionConfiguration(configuration(value, choice), job, value, choice)
    assert.equal(job.workerJob.sampling.totalSteps, 2)
    assert.equal(job.workerJob.sampling.posteriorSeed, 2654435769)
    assert.deepEqual(job.workerJob.sampling.sigmas, [0.8571428571428571, 0.6, 0])
  })
for (const [name, alter] of [
  [
    'positive raw weight',
    (job) => {
      job.context.prompts.positive = 'a red ceramic cup on a wooden table, studio photograph'
    },
  ],
  [
    'positive compiled weight',
    (job) => {
      job.workerJob.prompts.positive.spans[1].weight = 1
    },
  ],
  [
    'negative compiled weight',
    (job) => {
      job.workerJob.prompts.negative.spans[0].weight = 1
    },
  ],
  [
    'Qwen unclean markup',
    (job) => {
      job.workerJob.prompts.positive.cleanedText = positive
    },
  ],
  [
    'negative swapped literal',
    (job) => {
      job.workerJob.prompts.negative = structuredClone(job.workerJob.prompts.positive)
    },
  ],
  [
    'actual seed zero lost',
    (job) => {
      job.context.sampling.seed = 37
    },
  ],
  [
    'step random seed',
    (job) => {
      job.workerJob.sampling.stepSeed = 37
    },
  ],
  [
    'sigma rounding',
    (job) => {
      job.workerJob.sampling.sigmas[1] = 0.8571428656578064
    },
  ],
  [
    'method identity',
    (job) => {
      job.context.sampling.animaMethod = 'lcm'
    },
  ],
  [
    'LoRA enabled row',
    (job) => {
      job.context.loraStack[0].enabled = false
    },
  ],
  [
    'effective LoRA signed weight',
    (job) => {
      job.workerJob.loras[0].weight = 0.5
    },
  ],
  [
    'extra LoRA',
    (job) => {
      job.context.loraStack.push(structuredClone(job.context.loraStack[0]))
    },
  ],
  [
    'ordinary LoRA source',
    (job) => {
      job.workerJob.loras[0].sha256 = '0'.repeat(64)
    },
  ],
  [
    'decoder source metadata',
    (job) => {
      job.context.model.vae.byteSize += 1
    },
  ],
  [
    'Qwen managed owner',
    (job) => {
      job.context.model.qwen3Encoder.localVersionId = 'foreign-version'
    },
  ],
  [
    'checkpoint path',
    (job) => {
      job.workerJob.model.checkpoint.path = '/original/cyber-anima.safetensors'
    },
  ],
  [
    'worker target ICC',
    (job) => {
      job.workerJob.target.iccSha256 = '0'.repeat(64)
    },
  ],
  [
    'target bytes mismatch',
    (job) => {
      job.workerJob.target.byteSize += 1
    },
  ],
  [
    'unknown context setting',
    (job) => {
      job.context.promptEmbeddings = []
    },
  ],
  [
    'transient output injected',
    (job) => {
      job.workerJob.output = { pngPath: '/owned/result.png' }
    },
  ],
  [
    'undeclared VAE precision',
    (job) => {
      job.context.vaePrecision = 'FP32'
    },
  ],
])
  test(`frozen exact neighboring control refuses ${name}`, () => {
    const value = fixture('sampling', true),
      job = frozen(value, 'euler-txt2img')
    alter(job)
    assert.throws(() => assertAnimaRegressionFrozen(job, value, 'euler-txt2img'))
  })
test('Heun refuses requested-step count substituted for actual five native evaluations', () => {
  const value = fixture('sampling', true),
    job = frozen(value, 'heun-txt2img')
  job.workerJob.sampling.totalSteps = 3
  assert.throws(() => assertAnimaRegressionFrozen(job, value, 'heun-txt2img'))
})
for (const [name, alter] of [
  [
    'strength zero',
    (job) => {
      job.context.sampling.denoisingStrength = 0
    },
  ],
  [
    'native strength zero',
    (job) => {
      job.workerJob.sampling.strength = 0
    },
  ],
  [
    'posterior domain',
    (job) => {
      job.workerJob.sampling.posteriorSeed = 0
    },
  ],
  [
    'outpaint bbox shift',
    (job) => {
      job.context.bbox.x = 0
    },
  ],
  [
    'infill identity',
    (job) => {
      job.context.conditioning.infillResource.sha256 = '0'.repeat(64)
    },
  ],
  [
    'source target hash',
    (job) => {
      job.context.conditioning.sourceTarget.sha256 = '0'.repeat(64)
    },
  ],
  [
    'mask polarity',
    (job) => {
      job.context.conditioning.keepMask.polarity = 'generate'
    },
  ],
  [
    'mask byte size',
    (job) => {
      job.context.conditioning.keepMask.byteSize -= 1
    },
  ],
  [
    'output policy',
    (job) => {
      job.context.conditioning.policy.outputMode = 'merged'
    },
  ],
])
  test(`outpaint guard refuses ${name}`, () => {
    const value = fixture('image-modes', true),
      job = frozen(value, 'euler-outpaint')
    alter(job)
    assert.throws(() => assertAnimaRegressionFrozen(job, value, 'euler-outpaint'))
  })
test('stage cannot silently borrow the other mode or six-method matrix', () => {
  const value = fixture('image-modes', true)
  assert.throws(() =>
    assertAnimaRegressionFrozen(frozen(value, 'euler-txt2img'), value, 'euler-txt2img'),
  )
  const sampling = fixture('sampling', true)
  assert.throws(() =>
    assertAnimaRegressionFrozen(frozen(sampling, 'euler-img2img'), sampling, 'euler-img2img'),
  )
})
test('portable configuration preserves neutral legacy settings only when captured', () => {
  const value = fixture('sampling', true),
    job = frozen(value, 'euler-txt2img'),
    recorded = configuration(value, 'euler-txt2img')
  job.context.cfgRescale = 0
  job.context.vaePrecision = 'Auto'
  recorded.cfgRescale = 0
  recorded.vaePrecision = 'Auto'
  assertAnimaRegressionConfiguration(recorded, job, value, 'euler-txt2img')
  delete recorded.cfgRescale
  assert.throws(() => assertAnimaRegressionConfiguration(recorded, job, value, 'euler-txt2img'))
})
test('portable provenance refuses changed raw signs, exact source IDs, seed and filesystem paths', () => {
  const value = fixture('sampling', true),
    job = frozen(value, 'euler-txt2img')
  for (const alter of [
    (recorded) => {
      recorded.positivePrompt.text = 'red'
    },
    (recorded) => {
      recorded.model.civitaiVersionId = 2679856
    },
    (recorded) => {
      recorded.anima.qwen3Encoder.sha256 = vaeSha
    },
    (recorded) => {
      recorded.sampling.actualSeed = 37
    },
    (recorded) => {
      recorded.anima.vae.managedPath = value.vae.installed.managedPath
    },
    (recorded) => {
      recorded.positivePrompt.embeddingRefs = [{ token: 'Photo' }]
    },
    (recorded) => {
      recorded.loras[0].weight = 0.5
    },
  ]) {
    const recorded = configuration(value, 'euler-txt2img')
    alter(recorded)
    assert.throws(() => assertAnimaRegressionConfiguration(recorded, job, value, 'euler-txt2img'))
  }
})
test('healthy-input normalization removes document owners only after exact semantic verification', () => {
  const value = fixture('sampling', true),
    original = frozen(value, 'euler-txt2img'),
    retry = structuredClone(original)
  retry.originRequestId = 'fresh-owner'
  retry.context.documentId = '00000000-0000-4000-8000-000000000003'
  retry.context.documentRevision = '00000000-0000-4000-8000-000000000004'
  const first = normalizeAnimaRegressionInputs(original, value, 'euler-txt2img')
  assert.deepEqual(normalizeAnimaRegressionInputs(retry, value, 'euler-txt2img'), first)
  assert.equal(first.workerJob.model.vae.path, value.vae.installed.managedPath)
  assert.equal(first.workerJob.target.sha256, 'e'.repeat(64))
  assert.equal(first.context.loraStack[0].weight, -0.5)
  assert.equal(first.workerJob.sampling.seed, 0)
  assert.equal(Object.hasOwn(first.context, 'documentId'), false)
  assert.notEqual(original.context.documentId, undefined)
  retry.workerJob.sampling.seed = 37
  assert.throws(() => normalizeAnimaRegressionInputs(retry, value, 'euler-txt2img'))
})
test('stage outcomes refuse synthesized admissions, erased Cancel and broader MVP claims', () => {
  const original = {
    stage: 'image-modes',
    finiteCompletions: 2,
    actualAdmissions: 3,
    canceledOriginals: 1,
    preservingRetryRefusals: 0,
    fullMvpClaim: false,
    combinedMatrixClaim: false,
  }
  for (const field of [
    'finiteCompletions',
    'actualAdmissions',
    'canceledOriginals',
    'preservingRetryRefusals',
    'fullMvpClaim',
    'combinedMatrixClaim',
  ]) {
    const summary = structuredClone(original)
    summary[field] = typeof summary[field] === 'boolean' ? true : summary[field] + 1
    assert.throws(() => assertAnimaRegressionStageOutcome(summary))
  }
})
