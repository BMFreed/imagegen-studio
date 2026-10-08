/** Bounded installed original-topology Anima regression; no inference or filesystem reads. */
import assert from 'node:assert/strict'
import path from 'node:path'

import { componentKeys } from './noobai-components-qualification.mjs'
import {
  assertNoobaiLoraStackCatalog,
  assertNoobaiLoraStackCatalogPreserved,
  validateNoobaiLoraStackFixture,
} from './noobai-lora-stack-qualification.mjs'
import { noiseModelKeys } from './noobai-noise-qualification.mjs'

export const animaRegressionModelKeys = ['encoder', 'vae', 'anima', 'animaLora']
export const animaRegressionPublicationIds = {
  encoder: { managedId: 700010 },
  vae: { managedId: 700020 },
  anima: { managedId: 700030, modelId: 1147756, versionId: 3120487, fileId: 3000817 },
  animaLora: { managedId: 700050, modelId: 599757, versionId: 3084665, fileId: 2964030 },
}
export const animaRegressionMethods = ['euler', 'heun', 'dpmpp_2m', 'dpmpp_2m_sde', 'er_sde', 'lcm']
export const animaRegressionPrompts = {
  positive: 'a (red:1.3) ceramic cup on a wooden table, studio photograph',
  negative: '(blurry:0.7), low quality',
}
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const pinnedLamaSha = '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9'
const priorKeys = [
  'schemaVersion',
  'profile',
  'stage',
  'objective',
  'appData',
  'artifacts',
  'side',
  'steps',
  ...noiseModelKeys,
  'authorRecipes',
  ...componentKeys,
  'externalVaeEncoderControl',
  'illustriousLoraSecond',
]
const revision = 'f973fc41ec7545364ac9776c2440285f43ff2a30'
function referenceOrigin(relativePath) {
  return {
    kind: 'reference-artifact',
    repository: 'circlestone-labs/Anima',
    revision,
    path: relativePath,
    url: `https://huggingface.co/circlestone-labs/Anima/resolve/${revision}/${relativePath}`,
  }
}
function civitaiOrigin(modelId, versionId, fileId, creator) {
  return {
    kind: 'civitai-trained',
    modelId,
    versionId,
    fileId,
    url: `https://civitai.com/api/download/models/${versionId}?fileId=${fileId}`,
    creator,
    creditRequired: false,
  }
}
const sources = {
  encoder: {
    sha256: 'cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba',
    byteSize: 1192135096,
    type: 'qwen3_encoder',
    name: 'Qwen3 encoder',
    versionName: 'Anima Qwen3 0.6B',
    origin: referenceOrigin('split_files/text_encoders/qwen_3_06b_base.safetensors'),
  },
  vae: {
    sha256: 'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f',
    byteSize: 253806246,
    type: 'vae',
    name: 'Anima VAE',
    versionName: 'Anima Qwen Image VAE',
    origin: referenceOrigin('split_files/vae/qwen_image_vae.safetensors'),
  },
  anima: {
    sha256: '0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941',
    byteSize: 4182275752,
    type: 'checkpoint',
    versionName: 'Cyberfalafel anima v1.0',
    origin: civitaiOrigin(1147756, 3120487, 3000817, 'Knightus_Ai'),
  },
  animaLora: {
    sha256: 'cd9639b03d4458323e696e3792ff7535ae03f9f70368d6d0dc17fe86fa4f354f',
    byteSize: 138663759,
    type: 'lora',
    name: 'Myth Portrait',
    versionName: 'Anima Portrait Style',
    origin: civitaiOrigin(599757, 3084665, 2964030, 'VelvetS'),
  },
}
// Source pins: src/shared/projects/anima-{euler,sampling,flow-sampling}-plan.ts and
// their recorded native numeric fixtures. No production compiler supplies this oracle.
const grids = {
  euler: { sigmas: [1, 0.8571428571428571, 0.6, 0], timesteps: [1000, 857.1428571428571, 600] },
  heun: {
    sigmas: [
      1, 0.7511211037635803, 0.7511211037635803, 0.008928571827709675, 0.008928571827709675, 0,
    ],
    timesteps: [1000, 751.12109375, 751.12109375, 8.928571701049805, 8.928571701049805],
  },
  dpmpp_2m: {
    sigmas: [0.9996664524078369, 0.8567752838134766, 0.5996398329734802, 0],
    timesteps: [999, 856, 599],
  },
  dpmpp_2m_sde: {
    sigmas: [0.9996664524078369, 0.8567752838134766, 0.5996398329734802, 0],
    timesteps: [999, 856, 599],
  },
  er_sde: {
    sigmas: [1, 0.8571428656578064, 0.6000000238418579, 0],
    timesteps: [1000, 857.1428833007812, 600],
  },
  lcm: {
    sigmas: [1, 0.8571428656578064, 0.6000000238418579, 0],
    timesteps: [1000, 857.1428833007812, 600],
  },
}
function exactKeys(value, keys, message) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), message)
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), message)
}
function absolute(value) {
  assert.ok(
    typeof value === 'string' && path.isAbsolute(value) && path.normalize(value) === value,
    'Qualification paths must be canonical absolute paths.',
  )
}
function sha(value) {
  assert.ok(typeof value === 'string')
  assert.match(value, /^[a-f0-9]{64}$/)
}
function iso(value) {
  assert.ok(
    typeof value === 'string' &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
  )
}
function identity(value) {
  assert.ok(typeof value === 'string' && value.trim() === value && value.length > 0)
}
function borrowedFixture(fixture) {
  return {
    ...Object.fromEntries(priorKeys.map((key) => [key, fixture[key]])),
    profile: 'noobai-lora-stack',
    stage: 'txt2img',
  }
}
function installedPath(fixture, key) {
  return path.join(
    fixture.appData,
    'models',
    `qualified-${animaRegressionPublicationIds[key].managedId}.safetensors`,
  )
}
function assertSourceDescriptors(fixture, installed = false) {
  assert.equal(fixture.profile, 'anima-regression')
  animaRegressionStagePlan(fixture.stage)
  assert.equal(fixture.objective, 'epsilon')
  for (const key of animaRegressionModelKeys) {
    const value = fixture[key]
    exactKeys(
      value,
      [
        'path',
        'sha256',
        'byteSize',
        'type',
        'family',
        'name',
        'versionName',
        'origin',
        ...(installed && value?.installed ? ['installed'] : []),
      ],
      'Anima source descriptors must have exact fields.',
    )
    absolute(value.path)
    assert.ok(path.basename(value.path).endsWith('.safetensors'))
    assert.equal(value.family, 'anima')
    for (const field of ['sha256', 'byteSize', 'type', 'versionName'])
      assert.equal(value[field], sources[key][field])
    assert.equal(value.name, key === 'anima' ? fixture.illustrious.name : sources[key].name)
    assert.deepEqual(value.origin, sources[key].origin)
    if (value.installed) {
      exactKeys(value.installed, ['resourceId', 'versionId', 'managedPath'])
      identity(value.installed.resourceId)
      identity(value.installed.versionId)
      assert.equal(value.installed.managedPath, installedPath(fixture, key))
    }
  }
  assert.equal(
    new Set(
      [
        ...noiseModelKeys,
        ...componentKeys,
        'externalVaeEncoderControl',
        'illustriousLoraSecond',
        ...animaRegressionModelKeys,
      ].map((key) => fixture[key].sha256),
    ).size,
    14,
  )
  const priorSources = [
    ...noiseModelKeys,
    ...componentKeys,
    'externalVaeEncoderControl',
    'illustriousLoraSecond',
  ]
  const previousResources = new Set(
    priorSources.map((key) => fixture[key].installed?.resourceId).filter(Boolean),
  )
  const versionIds = priorSources.map((key) => fixture[key].installed?.versionId).filter(Boolean)
  const addedResources = []
  for (const key of animaRegressionModelKeys)
    if (fixture[key].installed) {
      versionIds.push(fixture[key].installed.versionId)
      if (key === 'anima') {
        assert.ok(fixture.illustrious.installed)
        assert.equal(
          fixture.anima.installed.resourceId,
          fixture.illustrious.installed.resourceId,
          'Anima must use the existing Cyber resource, with a distinct exact version.',
        )
      } else {
        assert.ok(!previousResources.has(fixture[key].installed.resourceId))
        addedResources.push(fixture[key].installed.resourceId)
      }
    }
  assert.equal(new Set(versionIds).size, versionIds.length)
  assert.equal(new Set(addedResources).size, addedResources.length)
}
function assertBaselineDescriptors(fixture) {
  if (fixture.animaPixelBaselines === undefined) {
    assert.notEqual(fixture.stage, 'restored', 'Restored cases require both healthy stage reports.')
    return
  }
  const value = fixture.animaPixelBaselines
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  const keys = Object.keys(value)
  assert.ok(keys.length > 0 && keys.every((key) => ['sampling', 'imageModes'].includes(key)))
  if (fixture.stage === 'restored') assert.deepEqual(keys.sort(), ['imageModes', 'sampling'])
  for (const descriptor of Object.values(value)) {
    exactKeys(descriptor, ['reportPath', 'reportSha256'])
    absolute(descriptor.reportPath)
    sha(descriptor.reportSha256)
  }
}
function assertImageSources(fixture) {
  exactKeys(fixture.commonSource, [
    'path',
    'sha256',
    'byteSize',
    'pixelSha256',
    'width',
    'height',
    'originQueueItemId',
  ])
  absolute(fixture.commonSource.path)
  sha(fixture.commonSource.sha256)
  sha(fixture.commonSource.pixelSha256)
  assert.ok(
    Number.isSafeInteger(fixture.commonSource.byteSize) &&
      fixture.commonSource.byteSize > 0 &&
      fixture.commonSource.byteSize <= 32 * 1024 * 1024,
  )
  assert.equal(fixture.commonSource.width, 256)
  assert.equal(fixture.commonSource.height, 256)
  identity(fixture.commonSource.originQueueItemId)
  exactKeys(fixture.lama, ['path', 'sha256', 'byteSize'])
  absolute(fixture.lama.path)
  // Pin from src/shared/projects/alpha-outpaint.ts, kept pure native Node.
  assert.equal(fixture.lama.sha256, pinnedLamaSha)
  assert.equal(fixture.lama.byteSize, 205669692)
}
export function animaRegressionExecution(choice) {
  assert.ok(typeof choice === 'string')
  const matched = /^(euler|heun|dpmpp_2m|dpmpp_2m_sde|er_sde|lcm)-(txt2img|img2img|outpaint)$/.exec(
    choice,
  )
  assert.ok(matched, 'An exact declared Anima case is required.')
  const [, method, mode] = matched
  assert.ok(
    mode === 'txt2img' || method === 'euler',
    'Only Euler image modes belong to this regression.',
  )
  return {
    width: 256,
    height: 256,
    steps: 3,
    cfgScale: 4,
    animaMethod: method,
    mode,
    ...(mode === 'txt2img' ? {} : { denoisingStrength: 0.5 }),
  }
}
export function animaRegressionStagePlan(stage) {
  assert.ok(
    ['sampling', 'image-modes', 'restored'].includes(stage),
    'Unsupported Anima regression stage.',
  )
  const choices =
    stage === 'sampling'
      ? animaRegressionMethods.map((method) => `${method}-txt2img`)
      : stage === 'image-modes'
        ? ['euler-img2img', 'euler-outpaint']
        : ['euler-txt2img', 'euler-img2img', 'euler-outpaint']
  return {
    choices,
    executions: Object.fromEntries(
      choices.map((choice) => [choice, animaRegressionExecution(choice)]),
    ),
    fullMvpClaim: false,
    combinedMatrixClaim: false,
    expectedCatalogResources: 9,
    expectedCatalogVersions: 14,
    expectedOutcome: {
      finiteCompletions: choices.length,
      actualAdmissions: stage === 'image-modes' ? 3 : choices.length,
      canceledOriginals: stage === 'image-modes' ? 1 : 0,
      preservingRetryRefusals: 0,
    },
  }
}
export function validateAnimaRegressionFixture(fixture, ready) {
  assert.equal(fixture.profile, 'anima-regression')
  const plan = animaRegressionStagePlan(fixture.stage)
  exactKeys(fixture, [
    ...priorKeys,
    ...animaRegressionModelKeys,
    ...(fixture.stage === 'sampling' ? [] : ['commonSource', 'lama']),
    ...(fixture.animaPixelBaselines === undefined ? [] : ['animaPixelBaselines']),
  ])
  assert.equal(
    fixture.objective,
    'epsilon',
    'Objective is only the unchanged prior NoobAI catalog guard.',
  )
  assert.equal(ready?.workerVersion, '0.14.0')
  assert.equal(ready.protocolVersion, '1')
  assert.equal(ready.runtimeProfile, 'linux-nvidia')
  assert.ok(Array.isArray(ready.capabilities))
  for (const capability of [
    'anima-txt2img',
    'anima-img2img',
    'anima-lora',
    'anima-prompt-weighting',
    'anima-flow-sampling',
    'anima-outpaint',
  ])
    assert.ok(ready.capabilities.includes(capability), `Anima regression requires ${capability}.`)
  validateNoobaiLoraStackFixture(borrowedFixture(fixture), ready)
  assertSourceDescriptors(fixture)
  assertBaselineDescriptors(fixture)
  if (fixture.stage !== 'sampling') assertImageSources(fixture)
  return plan
}
function catalogParts(catalog, fixture) {
  assert.ok(Array.isArray(catalog))
  const locations = new Map()
  for (const key of animaRegressionModelKeys) {
    const matches = catalog.flatMap((resource) =>
      resource.versions
        .filter(({ file }) => file.sha256 === sources[key].sha256)
        .map((version) => ({ resource, version })),
    )
    assert.ok(matches.length <= 1, 'An exact Anima file may have only one catalog owner.')
    if (matches.length) locations.set(key, matches[0])
  }
  const newOwners = new Set(
    ['encoder', 'vae', 'animaLora']
      .filter((key) => locations.has(key))
      .map((key) => locations.get(key).resource),
  )
  const prior = catalog
    .filter((resource) => !newOwners.has(resource))
    .map((resource) => ({
      ...resource,
      versions: resource.versions.filter((version) => version !== locations.get('anima')?.version),
    }))
  return { prior, locations }
}
function assertCatalogVersion(fixture, key, resource, version) {
  const source = fixture[key],
    ids = animaRegressionPublicationIds[key]
  assert.equal(resource.type, source.type)
  if (key !== 'anima') {
    assert.equal(resource.displayName, source.name)
    assert.equal(resource.defaultVersionId, version.id)
    assert.equal(resource.versions.length, 1)
    assert.deepEqual(resource.sourceMetadata, {
      qualificationPrecondition: true,
      origin: source.origin,
    })
    if (key === 'animaLora') {
      assert.deepEqual(resource.source, { kind: 'civitai', modelId: ids.modelId })
      assert.equal(resource.creator, source.origin.creator)
    } else {
      assert.deepEqual(resource.source, {
        kind: 'supported_dependency',
        key: `qualification-${ids.managedId}`,
      })
      assert.equal(resource.creator ?? null, null)
    }
  }
  assert.equal(version.name, source.versionName)
  assert.equal(version.format, 'safetensors')
  assert.equal(version.baseModelFamily, 'anima')
  assert.equal(version.predictionType, null)
  assert.equal(version.civitaiVersionId, ids.versionId ?? null)
  assert.equal(version.civitaiFileId, ids.fileId ?? null)
  assert.deepEqual(version.sourceMetadata, {
    qualificationPrecondition: true,
    origin: source.origin,
  })
  assert.equal(version.expectedSha256, source.sha256)
  assert.equal(version.file.sha256, source.sha256)
  assert.equal(version.file.sizeBytes, source.byteSize)
  assert.equal(version.file.status, 'ready')
  assert.equal(version.file.originalFilename, path.basename(source.path))
  assert.equal(version.file.managedPath, installedPath(fixture, key))
  if (source.installed) {
    assert.equal(resource.id, source.installed.resourceId)
    assert.equal(version.id, source.installed.versionId)
  }
}
export function assertAnimaRegressionCatalog(catalog, fixture, { adopting = false } = {}) {
  assertSourceDescriptors(fixture, true)
  const { prior, locations } = catalogParts(catalog, fixture)
  assert.equal(
    new Set(catalog.map(({ id }) => id)).size,
    catalog.length,
    'Catalog resources must have distinct local IDs.',
  )
  const allVersions = catalog.flatMap(({ versions }) => versions)
  assert.equal(
    new Set(allVersions.map(({ id }) => id)).size,
    allVersions.length,
    'Catalog versions must have distinct local IDs.',
  )
  assertNoobaiLoraStackCatalog(prior, borrowedFixture(fixture))
  assert.equal(prior.length, 6)
  assert.equal(prior.flatMap(({ versions }) => versions).length, 10)
  assert.ok(
    adopting || locations.size === 4,
    'The final Anima catalog needs all four exact new versions.',
  )
  const cyber = prior.find(
    (resource) => resource.source.kind === 'civitai' && resource.source.modelId === 1147756,
  )
  assert.ok(cyber)
  const priorIds = new Set(prior.map(({ id }) => id))
  const priorVersions = new Set(prior.flatMap(({ versions }) => versions.map(({ id }) => id)))
  const newResourceIds = []
  for (const [key, { resource, version }] of locations) {
    assertCatalogVersion(fixture, key, resource, version)
    assert.ok(!priorVersions.has(version.id))
    if (key === 'anima') {
      assert.equal(
        resource.id,
        cyber.id,
        'The Anima version belongs to the existing exact CivitAI Cyber resource.',
      )
      assert.equal(resource.defaultVersionId, cyber.defaultVersionId)
      assert.deepEqual(resource.sourceMetadata, cyber.sourceMetadata)
      const encoder = locations.get('encoder'),
        vae = locations.get('vae')
      assert.ok(encoder && vae, 'Anima publication requires both exact companion owners.')
      assert.deepEqual(version.dependencyVersionIds, {
        qwen3_encoder: encoder.version.id,
        vae: vae.version.id,
      })
    } else {
      assert.ok(!priorIds.has(resource.id))
      newResourceIds.push(resource.id)
      assert.deepEqual(version.dependencyVersionIds, {})
    }
  }
  assert.equal(new Set(newResourceIds).size, newResourceIds.length)
  assert.equal(catalog.length, 6 + newResourceIds.length)
  assert.equal(catalog.flatMap(({ versions }) => versions).length, 10 + locations.size)
  return new Set(locations.keys())
}
export function assertAnimaRegressionCatalogPreserved(current, previous, fixture) {
  assertAnimaRegressionCatalog(current, fixture)
  assertAnimaRegressionCatalog(previous, fixture, { adopting: true })
  const next = catalogParts(current, fixture),
    before = catalogParts(previous, fixture)
  const records = []
  const nextPrior = structuredClone(next.prior),
    oldPrior = structuredClone(before.prior)
  if (!before.locations.has('anima')) {
    const { resource, version } = next.locations.get('anima')
    const old = oldPrior.find(({ id }) => id === resource.id)
    const selected = nextPrior.find(({ id }) => id === resource.id)
    iso(old.sourceCheckedAt)
    iso(version.createdAt)
    assert.equal(resource.sourceCheckedAt, version.createdAt)
    assert.ok(Date.parse(resource.sourceCheckedAt) >= Date.parse(old.sourceCheckedAt))
    selected.sourceCheckedAt = old.sourceCheckedAt
    if (Object.hasOwn(resource, 'updatedAt') || Object.hasOwn(old, 'updatedAt')) {
      assert.ok(Object.hasOwn(resource, 'updatedAt') && Object.hasOwn(old, 'updatedAt'))
      iso(old.updatedAt)
      assert.equal(resource.updatedAt, version.createdAt)
      selected.updatedAt = old.updatedAt
    }
    records.push({
      resourceId: resource.id,
      versionId: version.id,
      sourceCheckedAt: resource.sourceCheckedAt,
      createdAt: version.createdAt,
      ...(Object.hasOwn(resource, 'updatedAt') ? { updatedAt: resource.updatedAt } : {}),
    })
  }
  assert.deepEqual(
    assertNoobaiLoraStackCatalogPreserved(nextPrior, oldPrior, borrowedFixture(fixture)),
    [],
    'Every prior NoobAI version must already exist and remain unchanged.',
  )
  for (const [key, entry] of before.locations) {
    const actual = next.locations.get(key)
    if (key === 'anima') assert.deepEqual(actual.version, entry.version)
    else assert.deepEqual(actual, entry, 'An existing Anima resource must be preserved exactly.')
  }
  return records
}
function selectedReference(fixture, key) {
  const value = fixture[key],
    ids = animaRegressionPublicationIds[key]
  assert.ok(value.installed)
  return {
    baseModelFamily: 'anima',
    civitaiFileId: ids.fileId,
    civitaiModelId: ids.modelId,
    civitaiVersionId: ids.versionId,
    displayName: value.name,
    fileSha256: value.sha256,
    kind: value.type,
    localModelId: value.installed.resourceId,
    localVersionId: value.installed.versionId,
    predictionType: null,
    versionName: value.versionName,
  }
}
function selectedComponent(fixture, key) {
  const value = fixture[key]
  assert.ok(value.installed)
  return {
    byteSize: value.byteSize,
    localModelId: value.installed.resourceId,
    localVersionId: value.installed.versionId,
    managedPath: value.installed.managedPath,
    sha256: value.sha256,
  }
}
function selectedWorkerFile(fixture, key) {
  const value = fixture[key]
  assert.ok(value.installed)
  return { byteSize: value.byteSize, path: value.installed.managedPath, sha256: value.sha256 }
}
function nativePlan(choice) {
  const { animaMethod: scheduler, mode } = animaRegressionExecution(choice)
  const image = mode !== 'txt2img'
  const grid = grids[scheduler],
    offset = image ? 1 : 0
  const sigmas = grid.sigmas.slice(offset),
    timesteps = grid.timesteps.slice(offset)
  return {
    beginIndex: offset,
    guidanceScale: 4,
    height: 256,
    initialSigma: image ? sigmas[0] : 1,
    mode: image ? 'img2img' : 'txt2img',
    posteriorSeed: image ? 2654435769 : null,
    scheduler,
    seed: 0,
    sigmas,
    startStep: offset,
    steps: 3,
    stepSeed: 0,
    strength: image ? 0.5 : null,
    timesteps,
    totalSteps: timesteps.length,
    version: 'anima-flow-denoising-v1',
    width: 256,
  }
}
function compiledPrompts() {
  return {
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
}
export function assertAnimaRegressionFrozen(frozen, fixture, choice) {
  assert.ok(animaRegressionStagePlan(fixture.stage).choices.includes(choice))
  assertSourceDescriptors(fixture, true)
  const execution = animaRegressionExecution(choice),
    mode = execution.mode
  exactKeys(frozen, ['schemaVersion', 'originRequestId', 'kind', 'context', 'workerJob'])
  assert.equal(frozen.schemaVersion, 1)
  identity(frozen.originRequestId)
  assert.equal(frozen.kind, `anima-${mode}`)
  const context = frozen.context,
    job = frozen.workerJob
  exactKeys(context, [
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
    ...(Object.hasOwn(context, 'cfgRescale') ? ['cfgRescale'] : []),
    ...(Object.hasOwn(context, 'vaePrecision') ? ['vaePrecision'] : []),
    ...(mode === 'outpaint' ? ['conditioning'] : []),
  ])
  exactKeys(job, ['schemaVersion', 'bbox', 'prompts', 'sampling', 'model', 'loras', 'target'])
  assert.equal(context.schemaVersion, 1)
  assert.equal(job.schemaVersion, 1)
  assert.equal(context.kind, `anima-${mode}-preparation`)
  identity(context.documentId)
  identity(context.documentRevision)
  const bbox = { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 }
  assert.deepEqual(context.bbox, bbox)
  assert.deepEqual(job.bbox, bbox)
  assert.deepEqual(context.prompts, animaRegressionPrompts)
  assert.deepEqual(
    job.prompts,
    compiledPrompts(),
    'Compiled positive/negative weights and cleaned texts must remain exact.',
  )
  assert.deepEqual(context.sampling, {
    animaMethod: execution.animaMethod,
    cfgScale: 4,
    requestedSeedPolicy: 'fixed',
    seed: 0,
    seedBehavior: 'per-iteration',
    steps: 3,
    ...(mode === 'txt2img' ? {} : { denoisingStrength: 0.5 }),
  })
  assert.deepEqual(
    job.sampling,
    nativePlan(choice),
    'Native sigma/timestep arrays and seed domains must match independent literal schedules.',
  )
  const model = {
    architecture: 'anima-base-1.0',
    checkpoint: {
      byteSize: fixture.anima.byteSize,
      managedPath: fixture.anima.installed.managedPath,
      reference: selectedReference(fixture, 'anima'),
    },
    qwen3Encoder: selectedComponent(fixture, 'encoder'),
    vae: selectedComponent(fixture, 'vae'),
  }
  assert.deepEqual(context.model, model)
  assert.deepEqual(job.model, {
    architecture: 'anima-base-1.0',
    checkpoint: selectedWorkerFile(fixture, 'anima'),
    qwen3Encoder: selectedWorkerFile(fixture, 'encoder'),
    vae: selectedWorkerFile(fixture, 'vae'),
  })
  const reference = selectedReference(fixture, 'animaLora')
  assert.deepEqual(context.loraStack, [{ enabled: true, resource: reference, weight: -0.5 }])
  assert.deepEqual(context.loras, [
    {
      byteSize: fixture.animaLora.byteSize,
      managedPath: fixture.animaLora.installed.managedPath,
      reference,
      weight: -0.5,
    },
  ])
  assert.deepEqual(job.loras, [{ ...selectedWorkerFile(fixture, 'animaLora'), weight: -0.5 }])
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
  if (mode === 'outpaint') {
    assertImageSources(fixture)
    const c = context.conditioning
    exactKeys(c, [
      'bbox',
      'infillResource',
      'keepMask',
      'kind',
      'policy',
      'schemaVersion',
      'sourceTarget',
    ])
    assert.equal(c.kind, 'alpha-outpaint-conditioning')
    assert.equal(c.schemaVersion, 1)
    assert.deepEqual(c.bbox, bbox)
    assert.deepEqual(c.infillResource, {
      byteSize: 205669692,
      role: 'outpaint-infill',
      sha256: fixture.lama.sha256,
    })
    assert.deepEqual(c.policy, {
      edgeRadius: 16,
      fadeDistance: 16,
      infillMethod: 'lama',
      maskBlur: 'gaussian-weighted-max',
      minimumDenoise: 0,
      outputMode: 'contribution',
      version: 1,
    })
    assert.deepEqual(c.sourceTarget, {
      byteSize: context.target.byteSize,
      format: 'png',
      height: 256,
      iccSha256: icc,
      sha256: context.target.sha256,
      width: 256,
    })
    exactKeys(c.keepMask, ['byteSize', 'format', 'height', 'polarity', 'sha256', 'width'])
    assert.deepEqual(
      { ...c.keepMask, sha256: '' },
      { byteSize: 65536, format: 'alpha8', height: 256, polarity: 'keep', sha256: '', width: 256 },
    )
    sha(c.keepMask.sha256)
  } else assert.equal(context.conditioning, undefined)
}
export function assertAnimaRegressionConfiguration(configuration, frozen, fixture, choice) {
  assertAnimaRegressionFrozen(frozen, fixture, choice)
  const { mode, animaMethod } = animaRegressionExecution(choice)
  const component = (key) => {
    const { managedPath: _path, ...portable } = selectedComponent(fixture, key)
    return portable
  }
  assert.deepEqual(
    configuration,
    {
      anima: {
        architecture: 'anima-base-1.0',
        checkpointByteSize: fixture.anima.byteSize,
        qwen3Encoder: component('encoder'),
        vae: component('vae'),
      },
      ...(Object.hasOwn(frozen.context, 'cfgRescale') ? { cfgRescale: 0 } : {}),
      ...(Object.hasOwn(frozen.context, 'vaePrecision') ? { vaePrecision: 'Auto' } : {}),
      loras: [{ enabled: true, resource: selectedReference(fixture, 'animaLora'), weight: -0.5 }],
      mode,
      model: selectedReference(fixture, 'anima'),
      negativePrompt: { embeddingRefs: [], text: animaRegressionPrompts.negative },
      positivePrompt: { embeddingRefs: [], text: animaRegressionPrompts.positive },
      sampling: {
        actualSeed: 0,
        animaMethod,
        cfgScale: 4,
        requestedSeedPolicy: 'fixed',
        seedBehavior: 'per-iteration',
        steps: 3,
        ...(mode === 'txt2img' ? {} : { denoisingStrength: 0.5 }),
      },
      size: { height: 256, width: 256 },
    },
    'Portable Anima provenance must preserve exact bundle/raw signs/native method/LoRA and actual seed.',
  )
  const text = JSON.stringify(configuration)
  for (const key of animaRegressionModelKeys)
    for (const filename of [fixture[key].path, fixture[key].installed.managedPath])
      assert.equal(
        text.includes(filename),
        false,
        'Portable Anima provenance must not contain source or managed paths.',
      )
}
export function normalizeAnimaRegressionInputs(frozen, fixture, choice) {
  assertAnimaRegressionFrozen(frozen, fixture, choice)
  const value = structuredClone({
    kind: frozen.kind,
    context: frozen.context,
    workerJob: frozen.workerJob,
  })
  delete value.context.documentId
  delete value.context.documentRevision
  // Durable workerJob already has no target/output owner paths. Never reduce semantic axes.
  return value
}
export function assertAnimaRegressionStageOutcome(summary) {
  const plan = animaRegressionStagePlan(summary.stage)
  for (const [key, expected] of Object.entries(plan.expectedOutcome))
    assert.equal(summary[key], expected)
  assert.equal(summary.fullMvpClaim, false)
  assert.equal(summary.combinedMatrixClaim, false)
}
