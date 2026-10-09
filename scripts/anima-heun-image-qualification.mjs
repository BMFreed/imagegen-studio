/** Independent finite Heun image-mode oracle; no filesystem, worker or production compiler calls. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'

const artifactRoot = path.join(homedir(), '.codex/artifacts/imagegen-studio')
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const sources = {
  encoder: {
    byteSize: 1192135096,
    sha256: 'cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba',
    type: 'qwen3_encoder',
    managedId: 700010,
  },
  vae: {
    byteSize: 253806246,
    sha256: 'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f',
    type: 'vae',
    managedId: 700020,
  },
  anima: {
    byteSize: 4182275752,
    sha256: '0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941',
    type: 'checkpoint',
    managedId: 700030,
    modelId: 1147756,
    versionId: 3120487,
    fileId: 3000817,
  },
  animaLora: {
    byteSize: 138663759,
    sha256: 'cd9639b03d4458323e696e3792ff7535ae03f9f70368d6d0dc17fe86fa4f354f',
    type: 'lora',
    managedId: 700050,
    modelId: 599757,
    versionId: 3084665,
    fileId: 2964030,
  },
}

const prompts = {
  positive: 'a (red:1.3) ceramic cup on a wooden table, studio photograph',
  negative: '(blurry:0.7), low quality',
}
const compiledPrompts = {
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
}
const lama = {
  byteSize: 205669692,
  role: 'outpaint-infill',
  sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
}
const policy = {
  edgeRadius: 16,
  fadeDistance: 16,
  infillMethod: 'lama',
  maskBlur: 'gaussian-weighted-max',
  minimumDenoise: 0,
  outputMode: 'contribution',
  version: 1,
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

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
    'Image qualification paths must strictly descend from the owned artifact root.',
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

/** Exact finite Heun image-mode envelope before external reads; Main owns physical path checks. */
export function validateAnimaHeunImageFixture(fixture) {
  exactKeys(
    fixture,
    [
      'schemaVersion',
      'profile',
      'stage',
      'mode',
      'sourceImage',
      'lamaSource',
      'referenceFixture',
      'workerBaseline',
      'artifacts',
    ],
    ['baseline', 'mutation'],
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'anima-heun-image')
  const plan = literalAnimaHeunImagePlan(fixture.stage, fixture.mode)
  artifactPath(fixture.artifacts)
  exactKeys(fixture.sourceImage, ['path', 'sha256', 'byteSize', 'pixelSha256'])
  artifactPath(fixture.sourceImage.path)
  sha(fixture.sourceImage.sha256)
  sha(fixture.sourceImage.pixelSha256)
  assert.ok(
    Number.isSafeInteger(fixture.sourceImage.byteSize) &&
      fixture.sourceImage.byteSize > 0 &&
      fixture.sourceImage.byteSize <= 32 * 1024 * 1024,
  )
  exactKeys(fixture.lamaSource, ['path', 'sha256', 'byteSize'])
  artifactPath(fixture.lamaSource.path)
  assert.equal(fixture.lamaSource.sha256, lama.sha256)
  assert.equal(fixture.lamaSource.byteSize, lama.byteSize)
  reference(fixture.referenceFixture, ['path', 'sha256'])
  reference(fixture.workerBaseline, ['path', 'sha256'])
  for (const source of [
    fixture.referenceFixture.path,
    fixture.workerBaseline.path,
    fixture.sourceImage.path,
    fixture.lamaSource.path,
  ])
    assert.ok(!overlap(fixture.artifacts, source), 'Evidence must not enclose a source fixture.')
  if (fixture.stage === 'baseline') {
    assert.equal(Object.hasOwn(fixture, 'baseline'), false)
    assert.equal(Object.hasOwn(fixture, 'mutation'), false)
  } else {
    assert.ok(fixture.baseline, 'Restored/control requires a pinned same-mode healthy baseline.')
    reference(fixture.baseline, ['reportPath', 'reportSha256'])
    assert.ok(!overlap(fixture.artifacts, fixture.baseline.reportPath))
  }
  if (fixture.stage === 'control') {
    assert.ok(fixture.mutation, 'Control must declare its one installed sampling source delta.')
    exactKeys(fixture.mutation, ['module', 'originalSha256', 'mutatedSha256'])
    assert.equal(fixture.mutation.module, 'anima_sampling.py')
    sha(fixture.mutation.originalSha256)
    sha(fixture.mutation.mutatedSha256)
    assert.notEqual(fixture.mutation.originalSha256, fixture.mutation.mutatedSha256)
  } else assert.equal(Object.hasOwn(fixture, 'mutation'), false)
  return plan
}

/** One independently authored ordinary signed case. No dynamic source expansion or RNG. */
export function literalAnimaHeunImagePlan(stage, mode) {
  assert.ok(['baseline', 'restored', 'control'].includes(stage), 'Unknown Heun image-mode stage.')
  assert.ok(
    ['img2img', 'outpaint'].includes(mode),
    'Only opaque IMG and mixed-alpha OUT are qualified.',
  )
  const item = {
    promptPairIndex: 0,
    iteration: 0,
    seed: 0,
    requestedSeedPolicy: 'fixed',
    seedBehavior: 'per-iteration',
    animaMethod: 'heun',
    mode,
    steps: 4,
    prompts: { ...prompts },
    compiledPrompts: structuredClone(compiledPrompts),
  }
  return freeze({
    stage,
    mode,
    steps: 4,
    observedSteps: 3,
    bbox: { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 },
    modelKey: 'anima',
    animaMethod: 'heun',
    iterations: 1,
    maxPrompts: 1,
    seedBehavior: 'per-iteration',
    requestedSeedPolicy: 'fixed',
    fixedSeed: 0,
    baseSeed: 0,
    sourcePrompts: { ...item.prompts },
    items: [item],
    expectedCompletions: 1,
    expectedAdmissions: 1,
    expectedCanceled: 0,
  })
}

function selectedReference(fixture, key) {
  const source = fixture[key]
  const pinned = sources[key]
  return {
    baseModelFamily: 'anima',
    civitaiFileId: pinned.fileId,
    civitaiModelId: pinned.modelId,
    civitaiVersionId: pinned.versionId,
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
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    ...(portable ? {} : { managedPath: source.installed.managedPath }),
    sha256: source.sha256,
  }
}

function workerFile(fixture, key) {
  const source = fixture[key]
  return { byteSize: source.byteSize, path: source.installed.managedPath, sha256: source.sha256 }
}

function assertInstalledSources(fixture) {
  absolute(fixture.appData)
  for (const [key, pinned] of Object.entries(sources)) {
    const source = fixture[key]
    assert.ok(source, `The exact ${key} descriptor is required.`)
    for (const field of ['byteSize', 'sha256', 'type']) assert.equal(source[field], pinned[field])
    assert.equal(source.family, 'anima')
    for (const field of ['name', 'versionName'])
      assert.ok(typeof source[field] === 'string' && source[field].trim())
    exactKeys(source.installed, ['resourceId', 'versionId', 'managedPath'])
    for (const field of ['resourceId', 'versionId'])
      assert.ok(typeof source.installed[field] === 'string' && source.installed[field].trim())
    assert.equal(
      source.installed.managedPath,
      path.join(fixture.appData, 'models', `qualified-${pinned.managedId}.safetensors`),
    )
    if (pinned.modelId) {
      for (const field of ['modelId', 'versionId', 'fileId'])
        assert.equal(source.origin[field], pinned[field])
    }
  }
}

// Independent literal clip of the full authored N4 native Heun grid. Both image modes
// execute IMG numerics: startStep2/beginIndex4, predictor/corrector followed by the terminal predictor.
export function literalAnimaHeunImageNativePlan() {
  return freeze({
    beginIndex: 4,
    guidanceScale: 4,
    height: 256,
    initialSigma: 0.602150559425354,
    mode: 'img2img',
    posteriorSeed: 2654435769,
    scheduler: 'heun',
    seed: 0,
    sigmas: [0.602150559425354, 0.008928571827709675, 0.008928571827709675, 0],
    startStep: 2,
    steps: 4,
    stepSeed: 0,
    strength: 0.5,
    timesteps: [602.1505737304688, 8.928571701049805, 8.928571701049805],
    totalSteps: 3,
    version: 'anima-flow-denoising-v1',
    width: 256,
  })
}

function assertExpectedItem(expected) {
  assert.ok(expected && typeof expected === 'object')
  assert.deepEqual(
    expected,
    literalAnimaHeunImagePlan('baseline', expected.mode).items[0],
    'The expected Heun image-mode item must match the complete independent literal case.',
  )
}

export function assertAnimaHeunImageFrozen(frozen, expectedItem, fixture) {
  assertInstalledSources(fixture)
  assertExpectedItem(expectedItem)
  exactKeys(frozen, ['schemaVersion', 'originRequestId', 'kind', 'context', 'workerJob'])
  assert.equal(frozen.schemaVersion, 1)
  assert.equal(frozen.kind, `anima-${expectedItem.mode}`)
  assert.ok(typeof frozen.originRequestId === 'string' && frozen.originRequestId.length > 0)
  const { context, workerJob: job } = frozen
  exactKeys(
    context,
    [
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
      'target',
    ],
    ['cfgRescale', 'vaePrecision', ...(expectedItem.mode === 'outpaint' ? ['conditioning'] : [])],
  )
  exactKeys(job, ['schemaVersion', 'bbox', 'prompts', 'sampling', 'model', 'loras', 'target'])
  assert.equal(context.schemaVersion, 1)
  assert.equal(job.schemaVersion, 1)
  assert.equal(context.kind, `anima-${expectedItem.mode}-preparation`)
  for (const field of ['documentId', 'documentRevision'])
    assert.ok(typeof context[field] === 'string' && context[field].length > 0)
  const bbox = literalAnimaHeunImagePlan('baseline', expectedItem.mode).bbox
  assert.deepEqual(context.bbox, bbox)
  assert.deepEqual(job.bbox, bbox)
  assert.deepEqual(context.prompts, expectedItem.prompts)
  assert.deepEqual(job.prompts, expectedItem.compiledPrompts)
  assert.deepEqual(context.sampling, {
    animaMethod: 'heun',
    cfgScale: 4,
    requestedSeedPolicy: expectedItem.requestedSeedPolicy,
    seed: expectedItem.seed,
    seedBehavior: expectedItem.seedBehavior,
    steps: 4,
    denoisingStrength: 0.5,
  })
  assert.deepEqual(job.sampling, literalAnimaHeunImageNativePlan())
  assert.deepEqual(context.model, {
    architecture: 'anima-base-1.0',
    checkpoint: {
      byteSize: fixture.anima.byteSize,
      managedPath: fixture.anima.installed.managedPath,
      reference: selectedReference(fixture, 'anima'),
    },
    qwen3Encoder: component(fixture, 'encoder'),
    vae: component(fixture, 'vae'),
  })
  assert.deepEqual(job.model, {
    architecture: 'anima-base-1.0',
    checkpoint: workerFile(fixture, 'anima'),
    qwen3Encoder: workerFile(fixture, 'encoder'),
    vae: workerFile(fixture, 'vae'),
  })
  const lora = selectedReference(fixture, 'animaLora')
  assert.deepEqual(context.loraStack, [{ enabled: true, resource: lora, weight: -0.5 }])
  assert.deepEqual(context.loras, [
    {
      byteSize: fixture.animaLora.byteSize,
      managedPath: fixture.animaLora.installed.managedPath,
      reference: lora,
      weight: -0.5,
    },
  ])
  assert.deepEqual(job.loras, [{ ...workerFile(fixture, 'animaLora'), weight: -0.5 }])
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
  if (Object.hasOwn(context, 'cfgRescale')) assert.equal(context.cfgRescale, 0)
  if (Object.hasOwn(context, 'vaePrecision')) assert.equal(context.vaePrecision, 'Auto')
  if (expectedItem.mode === 'outpaint')
    assertConditioning(context.conditioning, context.target, bbox)
  else assert.equal(context.conditioning, undefined)
}

export function assertAnimaHeunImageConfiguration(config, expectedItem, fixture) {
  assertInstalledSources(fixture)
  assertExpectedItem(expectedItem)
  assert.deepEqual(
    config,
    {
      anima: {
        architecture: 'anima-base-1.0',
        checkpointByteSize: fixture.anima.byteSize,
        qwen3Encoder: component(fixture, 'encoder', true),
        vae: component(fixture, 'vae', true),
      },
      ...(Object.hasOwn(config, 'cfgRescale') ? { cfgRescale: 0 } : {}),
      ...(Object.hasOwn(config, 'vaePrecision') ? { vaePrecision: 'Auto' } : {}),
      loras: [{ enabled: true, resource: selectedReference(fixture, 'animaLora'), weight: -0.5 }],
      mode: expectedItem.mode,
      model: selectedReference(fixture, 'anima'),
      negativePrompt: { embeddingRefs: [], text: expectedItem.prompts.negative },
      positivePrompt: { embeddingRefs: [], text: expectedItem.prompts.positive },
      sampling: {
        actualSeed: expectedItem.seed,
        animaMethod: 'heun',
        cfgScale: 4,
        requestedSeedPolicy: expectedItem.requestedSeedPolicy,
        seedBehavior: expectedItem.seedBehavior,
        steps: 4,
        denoisingStrength: 0.5,
      },
      size: { height: 256, width: 256 },
    },
    'Accepted configuration must preserve concrete signs, actual seed, requested policy and native inputs.',
  )
  const serialized = JSON.stringify(config)
  for (const key of Object.keys(sources)) {
    assert.equal(serialized.includes(fixture[key].installed.managedPath), false)
    if (fixture[key].path) assert.equal(serialized.includes(fixture[key].path), false)
  }
}

/** Preserve every native semantic axis; only document identity is omitted for cross-Project replay. */
export function normalizeAnimaHeunImageNativeInputs(frozen) {
  assert.ok(frozen && frozen.context && frozen.workerJob)
  assert.equal(
    ['anima-img2img', 'anima-outpaint'].includes(frozen.kind),
    true,
    'Only the qualified Heun image modes can be normalized.',
  )
  assert.deepEqual(frozen.workerJob.sampling, literalAnimaHeunImageNativePlan())
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

function assertConditioning(conditioning, target, bbox) {
  exactKeys(conditioning, [
    'bbox',
    'infillResource',
    'keepMask',
    'kind',
    'policy',
    'schemaVersion',
    'sourceTarget',
  ])
  assert.deepEqual(conditioning, {
    bbox,
    infillResource: { ...lama },
    kind: 'alpha-outpaint-conditioning',
    policy: { ...policy },
    schemaVersion: 1,
    sourceTarget: {
      byteSize: target.byteSize,
      format: 'png',
      height: 256,
      iccSha256: icc,
      sha256: target.sha256,
      width: 256,
    },
    keepMask: {
      byteSize: 65536,
      format: 'alpha8',
      height: 256,
      polarity: 'keep',
      sha256: digest(literalAnimaHeunImageTargetAlpha()),
      width: 256,
    },
  })
}

/** The selected OUT input has 192 opaque source columns and 64 transparent extension columns. */
export function literalAnimaHeunImageTargetAlpha() {
  const alpha = Buffer.alloc(256 * 256)
  for (let y = 0; y < 256; y++) alpha.fill(255, y * 256, y * 256 + 192)
  return alpha
}

/**
 * Finite vertical-edge literal from the documented policy; independent native pin is a run
 * precondition.
 */
export function literalAnimaHeunImageContributionAlpha() {
  const row = Buffer.alloc(256)
  row.set([0, 5, 12, 23, 36, 52, 70, 89, 109, 130, 151, 172, 193, 212, 230, 247], 152)
  row.fill(255, 168)
  return Buffer.concat(Array.from({ length: 256 }, () => row))
}

function rgbaImage(image, width, height) {
  assert.equal(image.width, width)
  assert.equal(image.height, height)
  assert.ok(Buffer.isBuffer(image.rgba) || image.rgba instanceof Uint8Array)
  assert.equal(image.rgba.length, width * height * 4)
}

export function assertAnimaHeunImageTargetPixels({ source, target, mode }) {
  assert.ok(['img2img', 'outpaint'].includes(mode))
  rgbaImage(source, 256, 256)
  rgbaImage(target, 256, 256)
  const shift = mode === 'outpaint' ? 64 : 0
  let opaquePixels = 0,
    transparentPixels = 0
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const offset = (y * 256 + x) * 4
      assert.equal(source.rgba[offset + 3], 255, 'The pinned source must be wholly opaque.')
      if (x + shift < 256) {
        const original = (y * 256 + x + shift) * 4
        for (let channel = 0; channel < 4; channel++)
          assert.equal(
            target.rgba[offset + channel],
            source.rgba[original + channel],
            'Target overlap must retain exact source RGBA.',
          )
        opaquePixels++
      } else {
        assert.equal(target.rgba[offset + 3], 0, 'The target extension must be transparent.')
        transparentPixels++
      }
    }
  assert.equal(opaquePixels, (256 - shift) * 256)
  assert.equal(transparentPixels, shift * 256)
  return { opaquePixels, transparentPixels, sourceShift: shift }
}

export function assertAnimaHeunImageOutputPixels({ image, mode }) {
  assert.ok(['img2img', 'outpaint'].includes(mode))
  rgbaImage(image, 256, 256)
  const actual = Buffer.from(Array.from({ length: 65536 }, (_, index) => image.rgba[index * 4 + 3]))
  const expected =
    mode === 'outpaint' ? literalAnimaHeunImageContributionAlpha() : Buffer.alloc(65536, 255)
  assert.ok(
    actual.equals(expected),
    'Output alpha must equal the independent complete literal mask.',
  )
  return { byteSize: 65536, format: 'alpha8', height: 256, sha256: digest(actual), width: 256 }
}

export function assertAnimaHeunImageSavedPixels({ source, contribution, preview, mode }) {
  rgbaImage(source, 256, 256)
  const width = mode === 'outpaint' ? 320 : 256
  rgbaImage(preview, width, 256)
  assertAnimaHeunImageOutputPixels({ image: contribution, mode })
  if (mode === 'img2img')
    assert.ok(
      Buffer.from(preview.rgba).equals(Buffer.from(contribution.rgba)),
      'The fully opaque IMG result must replace every saved preview RGBA pixel.',
    )
  let protectedPixels = 0
  let opaqueContributionPixels = 0
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < width; x++) {
      const merged = (y * width + x) * 4
      assert.equal(preview.rgba[merged + 3], 255, 'Saved preview must be fully opaque.')
      if (
        mode === 'outpaint' &&
        x < 256 &&
        (x < 64 || contribution.rgba[(y * 256 + x - 64) * 4 + 3] === 0)
      ) {
        const original = (y * 256 + x) * 4
        for (let channel = 0; channel < 4; channel++)
          assert.equal(
            preview.rgba[merged + channel],
            source.rgba[original + channel],
            'Protected source pixels must survive Save composition.',
          )
        protectedPixels++
      }
      if (mode === 'outpaint' && x >= 64) {
        const generated = (y * 256 + x - 64) * 4
        if (contribution.rgba[generated + 3] === 255) {
          for (let channel = 0; channel < 4; channel++)
            assert.equal(
              preview.rgba[merged + channel],
              contribution.rgba[generated + channel],
              'Every fully visible generated OUT pixel must survive Save at its world position.',
            )
          opaqueContributionPixels++
        }
      }
    }
  if (mode === 'outpaint') {
    assert.equal(protectedPixels, 217 * 256)
    assert.equal(opaqueContributionPixels, 88 * 256)
  }
  return { width, height: 256, protectedPixels }
}
