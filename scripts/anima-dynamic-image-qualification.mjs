/** Independent finite Euler IMG/OUT batch tables and complete DTOs; no producer/compiler calls. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'

// The geometry/source-over algorithm is family-independent; this alias adds no Anima inference.
export { assertIllustriousDynamicImageSavedPixels as assertAnimaDynamicImageSavedPixels } from './illustrious-dynamic-image-qualification.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio')
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const pins = {
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
const positives = [
  'a (red:1.3) ceramic cup on a wooden table, studio photograph',
  'a (blue:1.3) ceramic cup on a wooden table, studio photograph',
]
const negatives = ['(blurry:0.7), low quality', '(noisy:0.7), low quality']
const positiveCompiled = [
  {
    version: 'anima-prompt-weighting-v1',
    cleanedText: 'a red ceramic cup on a wooden table, studio photograph',
    spans: [
      { start: 0, end: 2, weight: 1 },
      { start: 2, end: 5, weight: 1.3 },
      { start: 5, end: 54, weight: 1 },
    ],
  },
  {
    version: 'anima-prompt-weighting-v1',
    cleanedText: 'a blue ceramic cup on a wooden table, studio photograph',
    spans: [
      { start: 0, end: 2, weight: 1 },
      { start: 2, end: 6, weight: 1.3 },
      { start: 6, end: 55, weight: 1 },
    ],
  },
]
const negativeCompiled = [
  {
    version: 'anima-prompt-weighting-v1',
    cleanedText: 'blurry, low quality',
    spans: [
      { start: 0, end: 6, weight: 0.7 },
      { start: 6, end: 19, weight: 1 },
    ],
  },
  {
    version: 'anima-prompt-weighting-v1',
    cleanedText: 'noisy, low quality',
    spans: [
      { start: 0, end: 5, weight: 0.7 },
      { start: 5, end: 18, weight: 1 },
    ],
  },
]
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
const digest = (value) => createHash('sha256').update(value).digest('hex')
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
function exactKeys(value, required, optional = []) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  assert.deepEqual(
    Object.keys(value).sort(),
    [...required, ...optional.filter((key) => Object.hasOwn(value, key))].sort(),
  )
}
function sha(value) {
  assert.equal(typeof value, 'string')
  assert.match(value, /^[a-f0-9]{64}$/)
}
function absolute(value) {
  assert.equal(typeof value, 'string')
  assert.ok(path.isAbsolute(value) && path.resolve(value) === value)
}
function owned(value) {
  absolute(value)
  assert.ok(value.startsWith(root + path.sep))
}
const overlap = (left, right) =>
  left === right || left.startsWith(right + path.sep) || right.startsWith(left + path.sep)
function reference(value, pathKey, shaKey) {
  exactKeys(value, [pathKey, shaKey])
  owned(value[pathKey])
  sha(value[shaKey])
}

/** Four independently handwritten pairs and two iterations, never derived from expansion. */
export function literalAnimaDynamicImagePlan(stage, mode) {
  assert.ok(['baseline', 'prefix'].includes(stage), 'Unknown finite Anima dynamic image stage.')
  assert.ok(
    ['img2img', 'outpaint'].includes(mode),
    'Only common-source IMG and normal OUT are in this gate.',
  )
  const all = [
    [0, 0, 0, 0, 0],
    [0, 1, 1, 0, 0],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 0, 1],
    [2, 0, 0, 1, 0],
    [2, 1, 1, 1, 0],
    [3, 0, 0, 1, 1],
    [3, 1, 1, 1, 1],
  ]
  const items = (stage === 'baseline' ? all : all.slice(0, 2)).map(
    ([promptPairIndex, iteration, seed, p, n]) => ({
      promptPairIndex,
      iteration,
      seed,
      requestedSeedPolicy: 'fixed',
      seedBehavior: 'per-iteration',
      animaMethod: 'euler',
      mode,
      steps: 3,
      denoisingStrength: 0.5,
      prompts: { positive: positives[p], negative: negatives[n] },
      compiledPrompts: {
        positive: structuredClone(positiveCompiled[p]),
        negative: structuredClone(negativeCompiled[n]),
      },
    }),
  )
  return freeze({
    stage,
    mode,
    modelKey: 'anima',
    animaMethod: 'euler',
    steps: 3,
    observedSteps: 2,
    denoisingStrength: 0.5,
    bbox: { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 },
    iterations: 2,
    maxPrompts: stage === 'baseline' ? 4 : 1,
    truncated: stage === 'prefix',
    seedBehavior: 'per-iteration',
    requestedSeedPolicy: 'fixed',
    fixedSeed: 0,
    baseSeed: 0,
    sourcePrompts: {
      positive: 'a {(red:1.3)|(blue:1.3)} ceramic cup on a wooden table, studio photograph',
      negative: '{(blurry:0.7)|(noisy:0.7)}, low quality',
    },
    items,
    expectedAdmissions: items.length,
    expectedCompletions: items.length,
    expectedCanceled: 0,
  })
}
export function validateAnimaDynamicImageFixture(fixture) {
  exactKeys(fixture, [
    'schemaVersion',
    'profile',
    'stage',
    'mode',
    'sourceImage',
    'referenceFixture',
    'workerBaseline',
    'artifacts',
    ...(fixture?.mode === 'outpaint' ? ['lamaSource'] : []),
    ...(fixture?.stage === 'prefix' ? ['baseline'] : []),
  ])
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'anima-dynamic-image')
  const plan = literalAnimaDynamicImagePlan(fixture.stage, fixture.mode)
  owned(fixture.artifacts)
  reference(fixture.referenceFixture, 'path', 'sha256')
  reference(fixture.workerBaseline, 'path', 'sha256')
  exactKeys(fixture.sourceImage, ['path', 'sha256', 'byteSize', 'pixelSha256'])
  owned(fixture.sourceImage.path)
  sha(fixture.sourceImage.sha256)
  sha(fixture.sourceImage.pixelSha256)
  assert.ok(
    Number.isSafeInteger(fixture.sourceImage.byteSize) &&
      fixture.sourceImage.byteSize > 0 &&
      fixture.sourceImage.byteSize <= 32 * 1024 * 1024,
  )
  const inputs = [
    fixture.referenceFixture.path,
    fixture.workerBaseline.path,
    fixture.sourceImage.path,
  ]
  if (fixture.mode === 'outpaint') {
    exactKeys(fixture.lamaSource, ['path', 'sha256', 'byteSize'])
    owned(fixture.lamaSource.path)
    assert.equal(fixture.lamaSource.sha256, lama.sha256)
    assert.equal(fixture.lamaSource.byteSize, lama.byteSize)
    inputs.push(fixture.lamaSource.path)
  }
  if (fixture.stage === 'prefix') {
    reference(fixture.baseline, 'reportPath', 'reportSha256')
    inputs.push(fixture.baseline.reportPath)
  }
  for (const input of inputs)
    assert.ok(
      !overlap(fixture.artifacts, input),
      'Evidence cannot enclose or overwrite a qualification input.',
    )
  return plan
}
function assertItem(item) {
  const full = literalAnimaDynamicImagePlan('baseline', item?.mode)
  const member = full.items.find(
    (entry) => entry.promptPairIndex === item.promptPairIndex && entry.iteration === item.iteration,
  )
  assert.ok(member, 'Exact independent Anima tuple membership is required.')
  assert.deepEqual(item, member, 'Exact independent Anima tuple membership is required.')
}
function assertSources(fixture) {
  absolute(fixture.appData)
  for (const [key, pin] of Object.entries(pins)) {
    const source = fixture[key]
    assert.ok(source, `Exact Anima ${key} is required.`)
    for (const field of ['byteSize', 'sha256', 'type']) assert.equal(source[field], pin[field])
    assert.equal(source.family, 'anima')
    for (const field of ['name', 'versionName'])
      assert.ok(typeof source[field] === 'string' && source[field].trim())
    exactKeys(source.installed, ['resourceId', 'versionId', 'managedPath'])
    for (const field of ['resourceId', 'versionId'])
      assert.ok(typeof source.installed[field] === 'string' && source.installed[field].trim())
    assert.equal(
      source.installed.managedPath,
      path.join(fixture.appData, 'models', `qualified-${pin.managedId}.safetensors`),
    )
    if (pin.modelId)
      for (const field of ['modelId', 'versionId', 'fileId'])
        assert.equal(source.origin[field], pin[field])
  }
}
function selected(fixture, key) {
  const source = fixture[key],
    pin = pins[key]
  return {
    baseModelFamily: 'anima',
    civitaiFileId: pin.fileId,
    civitaiModelId: pin.modelId,
    civitaiVersionId: pin.versionId,
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
export function expectedAnimaDynamicImageLoraStack(fixture) {
  assertSources(fixture)
  return freeze([{ enabled: true, resource: selected(fixture, 'animaLora'), weight: -0.5 }])
}
/** Source-confirmed original Euler N3 grid, clipped at strength.5; posterior domains are literal. */
export function literalAnimaDynamicImageNativePlan(seed) {
  assert.ok(seed === 0 || seed === 1)
  return freeze({
    beginIndex: 1,
    guidanceScale: 4,
    height: 256,
    initialSigma: 0.8571428571428571,
    mode: 'img2img',
    posteriorSeed: seed === 0 ? 2654435769 : 2654435768,
    scheduler: 'euler',
    seed,
    sigmas: [0.8571428571428571, 0.6, 0],
    startStep: 1,
    steps: 3,
    stepSeed: seed,
    strength: 0.5,
    timesteps: [857.1428571428571, 600],
    totalSteps: 2,
    version: 'anima-flow-denoising-v1',
    width: 256,
  })
}
function assertConditioning(conditioning, target, bbox) {
  const alpha = Buffer.alloc(65536)
  for (let row = 0; row < 256; row++) alpha.fill(255, row * 256, row * 256 + 192)
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
      sha256: digest(alpha),
      width: 256,
    },
  })
}
/** Whole frozen envelope; no Euler→Heun projection or producer plan can hide a semantic field. */
export function assertAnimaDynamicImageFrozen(frozen, item, fixture, oracle = {}) {
  exactKeys(oracle, [], ['assertExpectedItem', 'nativePlanForSeed'])
  const validateItem = oracle.assertExpectedItem ?? assertItem
  const nativePlan = oracle.nativePlanForSeed ?? literalAnimaDynamicImageNativePlan
  assert.equal(typeof validateItem, 'function')
  assert.equal(typeof nativePlan, 'function')
  // A specialized independent table must validate the whole item before any DTO is inspected.
  validateItem(item)
  assertSources(fixture)
  exactKeys(frozen, ['schemaVersion', 'originRequestId', 'kind', 'context', 'workerJob'])
  assert.equal(frozen.schemaVersion, 1)
  assert.equal(frozen.kind, `anima-${item.mode}`)
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
      ...(item.mode === 'outpaint' ? ['conditioning'] : []),
    ],
    ['cfgRescale', 'vaePrecision'],
  )
  exactKeys(job, ['schemaVersion', 'bbox', 'prompts', 'sampling', 'model', 'loras', 'target'])
  assert.equal(context.schemaVersion, 1)
  assert.equal(job.schemaVersion, 1)
  assert.equal(context.kind, `anima-${item.mode}-preparation`)
  for (const field of ['documentId', 'documentRevision'])
    assert.ok(typeof context[field] === 'string' && context[field].length > 0)
  const bbox = { x: item.mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 }
  assert.deepEqual(context.bbox, bbox)
  assert.deepEqual(job.bbox, bbox)
  assert.deepEqual(context.prompts, item.prompts)
  assert.deepEqual(job.prompts, item.compiledPrompts)
  assert.deepEqual(context.sampling, {
    animaMethod: 'euler',
    cfgScale: 4,
    denoisingStrength: 0.5,
    requestedSeedPolicy: item.requestedSeedPolicy,
    seed: item.seed,
    seedBehavior: item.seedBehavior,
    steps: 3,
  })
  assert.deepEqual(job.sampling, nativePlan(item.seed))
  assert.deepEqual(context.model, {
    architecture: 'anima-base-1.0',
    checkpoint: {
      byteSize: fixture.anima.byteSize,
      managedPath: fixture.anima.installed.managedPath,
      reference: selected(fixture, 'anima'),
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
  assert.deepEqual(context.loraStack, expectedAnimaDynamicImageLoraStack(fixture))
  assert.deepEqual(context.loras, [
    {
      byteSize: fixture.animaLora.byteSize,
      managedPath: fixture.animaLora.installed.managedPath,
      reference: selected(fixture, 'animaLora'),
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
  if (item.mode === 'outpaint') assertConditioning(context.conditioning, context.target, bbox)
}
export function assertAnimaDynamicImageConfiguration(config, item, fixture, oracle = {}) {
  exactKeys(oracle, [], ['assertExpectedItem'])
  const validateItem = oracle.assertExpectedItem ?? assertItem
  assert.equal(typeof validateItem, 'function')
  validateItem(item)
  assertSources(fixture)
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
      loras: expectedAnimaDynamicImageLoraStack(fixture),
      mode: item.mode,
      model: selected(fixture, 'anima'),
      negativePrompt: { embeddingRefs: [], text: item.prompts.negative },
      positivePrompt: { embeddingRefs: [], text: item.prompts.positive },
      sampling: {
        actualSeed: item.seed,
        animaMethod: 'euler',
        cfgScale: 4,
        denoisingStrength: 0.5,
        requestedSeedPolicy: item.requestedSeedPolicy,
        seedBehavior: item.seedBehavior,
        steps: 3,
      },
      size: { height: 256, width: 256 },
    },
    'Whole portable recipe retains concrete weighted raw text, never compiled arrays/private paths.',
  )
  const serialized = JSON.stringify(config)
  for (const key of Object.keys(pins)) {
    assert.equal(serialized.includes(fixture[key].installed.managedPath), false)
    if (fixture[key].path) assert.equal(serialized.includes(fixture[key].path), false)
  }
}
/** Keep every raw/compiled/resource/numerical/conditioning field; omit only owning identifiers. */
export function normalizeAnimaDynamicImageNativeInputs(frozen) {
  assert.ok(['anima-img2img', 'anima-outpaint'].includes(frozen?.kind))
  assert.equal(frozen?.context?.sampling?.animaMethod, 'euler')
  assert.equal(frozen?.workerJob?.sampling?.scheduler, 'euler')
  const result = structuredClone({
    kind: frozen.kind,
    context: frozen.context,
    workerJob: frozen.workerJob,
  })
  delete result.context.documentId
  delete result.context.documentRevision
  return result
}
function frozenOf(row) {
  assert.ok(typeof row?.id === 'string' && row.id.length > 0)
  assert.equal(typeof row.frozen_payload_json, 'string')
  return JSON.parse(row.frozen_payload_json)
}
export function resolveAnimaDynamicImagePlan(plan, admitted) {
  assert.deepEqual(plan, literalAnimaDynamicImagePlan(plan.stage, plan.mode))
  assert.equal(admitted.length, plan.expectedAdmissions)
  assert.equal(new Set(admitted.map(({ id }) => id)).size, plan.expectedAdmissions)
  for (const [index, row] of admitted.entries()) {
    const frozen = frozenOf(row),
      item = plan.items[index]
    assert.deepEqual(frozen.context?.prompts, item.prompts)
    assert.deepEqual(frozen.workerJob?.prompts, item.compiledPrompts)
    assert.equal(frozen.context?.sampling?.seed, item.seed)
    assert.deepEqual(frozen.workerJob?.sampling, literalAnimaDynamicImageNativePlan(item.seed))
  }
  return plan
}
export function assertAnimaDynamicImageBaseline({ baseline, fixture, plan, reference: resources }) {
  assert.equal(fixture.stage, 'prefix')
  assert.deepEqual(plan, validateAnimaDynamicImageFixture(fixture))
  const full = literalAnimaDynamicImagePlan('baseline', fixture.mode)
  assert.equal(baseline.status, 'passed')
  assert.equal(baseline.profile, fixture.profile)
  assert.equal(baseline.stage, 'baseline')
  assert.deepEqual(baseline.literalPlan, full)
  assert.deepEqual(baseline.resolvedPlan, full)
  assert.equal(baseline.nativePhysicalExit?.confirmed, true)
  for (const field of ['admissions', 'generations', 'comparisons'])
    assert.equal(baseline[field].length, 8)
  assert.equal(baseline.savedPackage?.acceptedLayers, 8)
  assert.equal(baseline.savedPackage?.sourceLayers, 1)
  assert.equal(baseline.savedPackage?.totalLayers, 9)
  assert.equal(baseline.savedPackage?.reopened, true)
  assert.equal(baseline.savedPackage?.lastActualSeedSnapshot, 1)
  assert.equal(new Set(baseline.generations.map(({ queueItemId }) => queueItemId)).size, 8)
  for (const [index, generation] of baseline.generations.entries()) {
    assert.deepEqual(generation.expectedItem, full.items[index])
    assert.equal(generation.queueItemId, baseline.admissions[index].row.id)
    assert.deepEqual(generation.frozen, frozenOf(baseline.admissions[index].row))
    assert.equal(generation.row.status, 'completed')
    assert.equal(generation.accepted, true)
    assert.equal(baseline.comparisons[index].queueItemId, generation.queueItemId)
    assert.equal(baseline.comparisons[index].readOnly, true)
    sha(generation.dimensions.pixelSha256)
    assertAnimaDynamicImageFrozen(generation.frozen, full.items[index], resources)
    assertAnimaDynamicImageConfiguration(
      generation.provenance.generationConfiguration,
      full.items[index],
      resources,
    )
  }
  return full
}
/** Joint text/conditioning and seed contrasts for these finite inputs; no quality/weight causality. */
export function assertAnimaDynamicImagePixels(generations, plan) {
  assert.deepEqual(plan, literalAnimaDynamicImagePlan(plan.stage, plan.mode))
  assert.equal(generations.length, plan.expectedCompletions)
  const common = generations.map(({ frozen }) => {
    const result = normalizeAnimaDynamicImageNativeInputs(frozen)
    delete result.context.prompts
    delete result.workerJob.prompts
    delete result.context.sampling.seed
    delete result.workerJob.sampling.seed
    delete result.workerJob.sampling.stepSeed
    delete result.workerJob.sampling.posteriorSeed
    return result
  })
  for (const [index, generation] of generations.entries()) {
    assert.deepEqual(generation.expectedItem, plan.items[index])
    assert.deepEqual(
      common[index],
      common[0],
      'Every pair retains the same frozen source/resources/numerical grid.',
    )
    assert.equal(generation.rgba.length, 65536 * 4)
  }
  const difference = (leftIndex, rightIndex) => {
    const left = generations[leftIndex],
      right = generations[rightIndex]
    let changed = 0
    for (let pixel = 0; pixel < 65536; pixel++) {
      const at = pixel * 4
      assert.equal(
        left.rgba[at + 3],
        right.rgba[at + 3],
        'Dynamic choices must preserve the complete alpha plane.',
      )
      if (left.rgba[at + 3] && [0, 1, 2].some((c) => left.rgba[at + c] !== right.rgba[at + c]))
        changed++
    }
    assert.ok(changed > 0, 'These declared alternatives must differ in visible RGB.')
    return { leftIndex, rightIndex, visibleChangedPixels: changed }
  }
  const evidence = {
    iterationSeed: [],
    positiveAlternatives: [],
    negativeAlternatives: [],
    combinedAlternatives: [],
    scalarWeightCausalityClaim: false,
    tensorDirectionClaim: false,
    qualityClaim: false,
  }
  for (let pair = 0; pair < (plan.stage === 'baseline' ? 4 : 1); pair++)
    evidence.iterationSeed.push(difference(pair * 2, pair * 2 + 1))
  if (plan.stage === 'baseline')
    for (let seed = 0; seed < 2; seed++) {
      evidence.positiveAlternatives.push(difference(seed, 4 + seed), difference(2 + seed, 6 + seed))
      evidence.negativeAlternatives.push(difference(seed, 2 + seed), difference(4 + seed, 6 + seed))
      evidence.combinedAlternatives.push(difference(seed, 6 + seed), difference(2 + seed, 4 + seed))
    }
  return evidence
}
