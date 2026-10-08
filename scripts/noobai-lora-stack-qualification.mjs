/** Exact two-adapter authoring and publication guards; native numerical evidence is separate. */
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  assertNoobaiComponentFrozen,
  componentKeys,
  normalizeNoobaiComponentInputs,
} from './noobai-components-qualification.mjs'
import { executionFor, noiseModelKeys } from './noobai-noise-qualification.mjs'
import {
  assertNoobaiVaeEncoderCatalog,
  assertNoobaiVaeEncoderCatalogPreserved,
  validateNoobaiVaeEncoderFixture,
} from './noobai-vae-encoder-qualification.mjs'

export const loraStackChoices = ['ab', 'ba', 'b-zero', 'b-disabled']
export const loraStackPublicationIds = {
  managedId: 700_150,
  modelId: 1_795_307,
  versionId: 2_031_703,
  fileId: 1_934_353,
}
const secondKey = 'illustriousLoraSecond'
const firstIds = { managedId: 700_060, modelId: 700_060, versionId: 700_061, fileId: 700_062 }
const firstSha = 'c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9'
const secondSha = '90f9f879ff2e27fcaec5723a2c3e5db53ec5ffbdd4c7df49159c0ccbfe63b1ca'
const secondOrigin = {
  kind: 'civitai-trained',
  modelId: 1_795_307,
  versionId: 2_031_703,
  fileId: 1_934_353,
  url: 'https://civitai.com/api/download/models/2031703?fileId=1934353',
  creator: 'Underdorks',
  creditRequired: true,
}

function sha(value) {
  assert.ok(typeof value === 'string')
  assert.match(value, /^[a-f0-9]{64}$/)
}
function absolutePath(value) {
  assert.ok(
    typeof value === 'string' && path.isAbsolute(value) && path.normalize(value) === value,
    'Qualification paths must be canonical absolute paths.',
  )
}
function assertStage(fixture) {
  assert.equal(fixture.profile, 'noobai-lora-stack')
  assert.equal(fixture.stage, 'txt2img', 'Multiple-LoRA qualification requires only txt2img.')
}
function borrowedFixture(fixture) {
  const value = { ...fixture, profile: 'noobai-vae-encoder' }
  delete value[secondKey]
  delete value.loraPixelBaseline
  return value
}
function componentFixture(fixture) {
  const value = { ...borrowedFixture(fixture), profile: 'noobai-components' }
  delete value.externalVaeEncoderControl
  return value
}
function stagePlan() {
  return {
    mode: 'txt2img',
    choices: [...loraStackChoices],
    matchedPixelControlCases: 2,
    fullMvpClaim: false,
    combinedMatrixClaim: false,
    expectedOutcome: {
      finiteCompletions: 4,
      actualAdmissions: 4,
      canceledOriginals: 0,
      preservingRetryRefusals: 0,
    },
  }
}
function assertSources(fixture, { installed = false } = {}) {
  assert.equal(fixture.illustriousLora.sha256, firstSha)
  assert.equal(fixture.illustriousLora.byteSize, 114_437_420)
  const source = fixture[secondKey]
  assert.ok(source && typeof source === 'object' && !Array.isArray(source))
  assert.deepEqual(
    Object.keys(source).sort(),
    [
      'path',
      'sha256',
      'byteSize',
      'type',
      'family',
      'name',
      'versionName',
      'origin',
      ...(installed && source.installed ? ['installed'] : []),
    ].sort(),
    'The second trained LoRA descriptor must have exact fields.',
  )
  absolutePath(source.path)
  const filename = path.basename(source.path)
  assert.ok(
    filename.endsWith('.safetensors') &&
      filename.slice(0, -'.safetensors'.length).trim() &&
      !/[<>\x00-\x1f\x7f/\\]/u.test(filename),
  )
  assert.equal(source.sha256, secondSha)
  assert.equal(source.byteSize, 171_540_060)
  assert.equal(source.type, 'lora')
  assert.equal(source.family, 'illustrious')
  assert.equal(source.name, 'Lineless Digital Painting')
  assert.equal(source.versionName, 'Lineless Digital Painting Style')
  assert.deepEqual(source.origin, secondOrigin)
  assert.equal(
    new Set(
      [...noiseModelKeys, ...componentKeys, 'externalVaeEncoderControl', secondKey].map(
        (key) => fixture[key].sha256,
      ),
    ).size,
    10,
    'The new stack requires two distinct trained sources and all ten distinct file identities.',
  )
  if (fixture.loraPixelBaseline !== undefined) {
    const baseline = fixture.loraPixelBaseline
    assert.ok(baseline && typeof baseline === 'object' && !Array.isArray(baseline))
    assert.deepEqual(Object.keys(baseline).sort(), ['reportPath', 'reportSha256'])
    absolutePath(baseline.reportPath)
    sha(baseline.reportSha256)
  }
}

export function validateNoobaiLoraStackFixture(fixture, ready) {
  // Fail unsupported modes before delegated source reads or any native startup.
  assertStage(fixture)
  assertSources(fixture)
  const base = validateNoobaiVaeEncoderFixture(borrowedFixture(fixture), ready)
  return {
    ...base,
    ...stagePlan(),
    expectedCatalogResources: 6,
    expectedCatalogVersions: 10,
    maximumAdditionalManagedFiles: 1,
  }
}
function managedPath(fixture, ids) {
  return path.join(fixture.appData, 'models', `qualified-${ids.managedId}.safetensors`)
}
function loraReference(fixture, key, ids) {
  const source = fixture[key]
  const installed = source.installed
  assert.ok(installed && typeof installed === 'object' && !Array.isArray(installed))
  assert.deepEqual(Object.keys(installed).sort(), ['managedPath', 'resourceId', 'versionId'])
  for (const field of ['resourceId', 'versionId'])
    assert.ok(
      typeof installed[field] === 'string' &&
        installed[field].trim() === installed[field] &&
        installed[field],
    )
  assert.equal(installed.managedPath, managedPath(fixture, ids))
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: ids.fileId,
    civitaiModelId: ids.modelId,
    civitaiVersionId: ids.versionId,
    displayName: source.name,
    fileSha256: source.sha256,
    kind: 'lora',
    localModelId: installed.resourceId,
    localVersionId: installed.versionId,
    predictionType: null,
    versionName: source.versionName,
  }
}
function splitCatalog(catalog, fixture) {
  assert.ok(Array.isArray(catalog))
  const added = catalog.filter(({ versions }) =>
    versions.some(({ file }) => file.sha256 === fixture[secondKey].sha256),
  )
  assert.ok(added.length <= 1, 'The second LoRA may own exactly one distinct resource.')
  return { prior: catalog.filter((resource) => !added.includes(resource)), added }
}

/** Adoption adds one explicit source resource; none of the original nine versions may disappear. */
export function assertNoobaiLoraStackCatalog(catalog, fixture, { adopting = false } = {}) {
  assertStage(fixture)
  assertSources(fixture, { installed: true })
  const { prior, added } = splitCatalog(catalog, fixture)
  const seen = assertNoobaiVaeEncoderCatalog(prior, borrowedFixture(fixture))
  assert.equal(prior.length, 5)
  assert.equal(prior.flatMap(({ versions }) => versions).length, 9)
  assert.ok(
    adopting ? added.length <= 1 : added.length === 1,
    'Exactly the declared sixth resource may be adopted.',
  )
  const source = fixture[secondKey]
  const selected = source.installed
    ? loraReference(fixture, secondKey, loraStackPublicationIds)
    : null
  if (selected) {
    assert.ok(
      !prior.some(({ id }) => id === selected.localModelId),
      'The second LoRA must have a distinct local resource ID.',
    )
    assert.ok(
      !prior.flatMap(({ versions }) => versions).some(({ id }) => id === selected.localVersionId),
      'The second LoRA must have a distinct local version ID.',
    )
  }
  if (!added.length) {
    assert.equal(catalog.length, 5)
    return seen
  }
  const resource = added[0]
  assert.equal(resource.versions.length, 1)
  assert.ok(!prior.some(({ id }) => id === resource.id))
  const version = resource.versions[0]
  assert.ok(!prior.flatMap(({ versions }) => versions).some(({ id }) => id === version.id))
  assert.equal(resource.type, 'lora')
  assert.equal(resource.displayName, source.name)
  assert.equal(resource.creator, secondOrigin.creator)
  assert.deepEqual(resource.source, { kind: 'civitai', modelId: loraStackPublicationIds.modelId })
  assert.equal(resource.sourceMetadata.qualificationPrecondition, true)
  assert.deepEqual(resource.sourceMetadata.origin, secondOrigin)
  assert.equal(resource.defaultVersionId, version.id)
  assert.equal(version.name, source.versionName)
  assert.equal(version.file.sha256, secondSha)
  assert.equal(version.expectedSha256, secondSha)
  assert.equal(version.file.sizeBytes, source.byteSize)
  assert.equal(version.file.status, 'ready')
  assert.equal(version.file.originalFilename, path.basename(source.path))
  assert.equal(version.file.managedPath, managedPath(fixture, loraStackPublicationIds))
  assert.equal(version.format, 'safetensors')
  assert.equal(version.baseModelFamily, 'illustrious')
  assert.equal(version.predictionType, null)
  assert.equal(version.civitaiVersionId, loraStackPublicationIds.versionId)
  assert.equal(version.civitaiFileId, loraStackPublicationIds.fileId)
  assert.deepEqual(version.dependencyVersionIds, {})
  assert.equal(version.sourceMetadata.qualificationPrecondition, true)
  assert.deepEqual(version.sourceMetadata.origin, secondOrigin)
  if (selected) {
    assert.equal(resource.id, selected.localModelId)
    assert.equal(version.id, selected.localVersionId)
  }
  assert.equal(catalog.length, 6)
  assert.equal(catalog.flatMap(({ versions }) => versions).length, 10)
  seen.add(secondKey)
  return seen
}

export function assertNoobaiLoraStackCatalogPreserved(current, previous, fixture) {
  assertNoobaiLoraStackCatalog(current, fixture)
  assertNoobaiLoraStackCatalog(previous, fixture, { adopting: true })
  const next = splitCatalog(current, fixture)
  const before = splitCatalog(previous, fixture)
  const oldPublications = assertNoobaiVaeEncoderCatalogPreserved(
    next.prior,
    before.prior,
    borrowedFixture(fixture),
  )
  assert.deepEqual(oldPublications, [], 'The original nine versions must already exist.')
  if (before.added.length) {
    assert.deepEqual(
      next.added,
      before.added,
      'Existing second-LoRA ownership must be preserved exactly.',
    )
    return []
  }
  const resource = next.added[0]
  const version = resource.versions[0]
  assert.equal(
    resource.sourceCheckedAt,
    version.createdAt,
    'The new LoRA source check must equal its version publication timestamp.',
  )
  assert.ok(
    typeof version.createdAt === 'string' &&
      Number.isFinite(Date.parse(version.createdAt)) &&
      new Date(version.createdAt).toISOString() === version.createdAt,
  )
  return [
    {
      resourceId: resource.id,
      versionId: version.id,
      sourceCheckedAt: resource.sourceCheckedAt,
      createdAt: version.createdAt,
    },
  ]
}

function expectedStack(fixture, choice) {
  assert.ok(loraStackChoices.includes(choice), 'An exact multiple-LoRA choice is required.')
  const first = { key: 'illustriousLora', ids: firstIds, enabled: true, weight: -0.5 }
  const second = {
    key: secondKey,
    ids: loraStackPublicationIds,
    enabled: choice !== 'b-disabled',
    weight: choice === 'b-zero' ? 0 : 0.75,
  }
  return (choice === 'ba' ? [second, first] : [first, second]).map((entry) => ({
    ...entry,
    resource: loraReference(fixture, entry.key, entry.ids),
  }))
}
function reduceCheckedStack(frozen, fixture) {
  const copy = structuredClone(frozen)
  const source = fixture.illustriousLora
  const reference = loraReference(fixture, 'illustriousLora', firstIds)
  copy.context.loraStack = [{ enabled: true, resource: reference, weight: -0.5 }]
  copy.context.loras = [
    {
      byteSize: source.byteSize,
      managedPath: source.installed.managedPath,
      reference,
      weight: -0.5,
    },
  ]
  copy.workerJob.loras = [
    {
      byteSize: source.byteSize,
      path: source.installed.managedPath,
      sha256: source.sha256,
      weight: -0.5,
    },
  ]
  return copy
}

/** Configured order and effective ordered subset are checked independently before base delegation. */
export function assertNoobaiLoraStackFrozen(frozen, fixture, choice) {
  assertStage(fixture)
  assertSources(fixture, { installed: true })
  assert.equal(frozen.kind, 'illustrious-txt2img')
  assert.equal(frozen.context.sampling.denoisingStrength, undefined)
  assert.equal(frozen.workerJob.sampling.denoisingStrength, undefined)
  assert.equal(frozen.context.sampling.cfgRescale, 0)
  assert.equal(frozen.workerJob.sampling.cfgRescale, 0)
  assert.equal(frozen.context.sampling.requestedSeedPolicy, 'fixed')
  assert.equal(frozen.context.sampling.seedBehavior, 'per-iteration')
  const stack = expectedStack(fixture, choice)
  assert.notEqual(stack[0].resource.localModelId, stack[1].resource.localModelId)
  assert.notEqual(stack[0].resource.localVersionId, stack[1].resource.localVersionId)
  assert.deepEqual(
    frozen.context.loraStack,
    stack.map(({ enabled, resource, weight }) => ({ enabled, resource, weight })),
    'Captured configured LoRA identities, order and weights must be exact.',
  )
  const active = stack.filter(({ enabled }) => enabled)
  assert.deepEqual(
    frozen.context.loras,
    active.map(({ key, resource, weight }) => ({
      byteSize: fixture[key].byteSize,
      managedPath: fixture[key].installed.managedPath,
      reference: resource,
      weight,
    })),
    'Captured effective LoRAs must equal the ordered enabled subset, including enabled zero.',
  )
  assert.deepEqual(
    frozen.workerJob.loras,
    active.map(({ key, weight }) => ({
      byteSize: fixture[key].byteSize,
      path: fixture[key].installed.managedPath,
      sha256: fixture[key].sha256,
      weight,
    })),
    'Worker LoRAs must preserve exact source-to-weight association and order.',
  )
  assertNoobaiComponentFrozen(
    reduceCheckedStack(frozen, fixture),
    componentFixture(fixture),
    'fullstack',
  )
}

/** Only the independently validated LoRA axis is reduced; all neighboring semantic inputs remain. */
export function normalizeNoobaiLoraStackInputs(frozen, fixture, choice) {
  assertNoobaiLoraStackFrozen(frozen, fixture, choice)
  return normalizeNoobaiComponentInputs(reduceCheckedStack(frozen, fixture), 'fullstack')
}

export function assertNoobaiLoraStackConfiguration(configuration, frozen, fixture, choice) {
  assertNoobaiLoraStackFrozen(frozen, fixture, choice)
  const execution = executionFor(
    fixture.objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious',
    'bounded',
  )
  const prompt = (polarity) => ({
    text: frozen.context.prompts[polarity],
    embeddingRefs: structuredClone(frozen.context.embeddingRefs[polarity]),
  })
  const expected = {
    mode: 'txt2img',
    model: structuredClone(frozen.context.model.reference),
    vae: structuredClone(frozen.context.vae.reference),
    vaePrecision: 'FP32',
    cfgRescale: 0,
    loras: expectedStack(fixture, choice).map(({ enabled, resource, weight }) => ({
      enabled,
      resource,
      weight,
    })),
    positivePrompt: prompt('positive'),
    negativePrompt: prompt('negative'),
    sampling: {
      actualSeed: 0,
      cfgScale: 5,
      invokeScheduler: execution.sampler,
      requestedSeedPolicy: 'fixed',
      seedBehavior: 'per-iteration',
      sampler: execution.sampler === 'euler' ? 'Euler' : 'Euler a',
      scheduler: 'Normal',
      steps: 3,
      noiseProfile: structuredClone(execution.noiseProfile),
    },
    size: { width: 256, height: 256 },
  }
  assert.deepEqual(
    configuration,
    expected,
    'Portable provenance must preserve the full configured LoRA order, identities and weights.',
  )
  const serialized = JSON.stringify(configuration)
  assert.equal(serialized.includes('igs_ti_private_'), false)
  for (const key of [...noiseModelKeys, ...componentKeys, 'externalVaeEncoderControl', secondKey])
    for (const filename of [fixture[key].path, fixture[key].installed.managedPath])
      assert.equal(
        serialized.includes(filename),
        false,
        'Portable provenance must not contain model paths.',
      )
}

export function assertNoobaiLoraStackPixels(cases, fixture) {
  assertStage(fixture)
  assert.deepEqual(
    cases.map(({ choice }) => choice),
    loraStackChoices,
  )
  const normalized = cases.map(({ frozen, choice }) =>
    normalizeNoobaiLoraStackInputs(frozen, fixture, choice),
  )
  for (const item of cases) {
    assert.equal(item.dimensions.width, 256)
    assert.equal(item.dimensions.height, 256)
    assert.equal(item.target.width, 256)
    assert.equal(item.target.height, 256)
    sha(item.dimensions.pixelSha256)
    sha(item.target.sha256)
    sha(item.target.pixelSha256)
    assert.equal(item.frozen.context.target.sha256, item.target.sha256)
    assert.equal(item.frozen.context.target.width, item.target.width)
    assert.equal(item.frozen.context.target.height, item.target.height)
    assert.equal(item.frozen.workerJob.target.sha256, item.target.sha256)
    assert.equal(item.frozen.workerJob.target.width, item.target.width)
    assert.equal(item.frozen.workerJob.target.height, item.target.height)
  }
  for (let index = 1; index < cases.length; index++) {
    assert.deepEqual(
      normalized[index],
      normalized[0],
      'Only the declared LoRA stack axis may differ.',
    )
    assert.deepEqual(
      cases[index].target,
      cases[0].target,
      'All four cases must use one exact common target.',
    )
  }
  assert.equal(
    cases[2].dimensions.pixelSha256,
    cases[3].dimensions.pixelSha256,
    'Enabled zero-weight B and disabled B must produce identical decoded pixels.',
  )
  assert.notEqual(
    cases[0].dimensions.pixelSha256,
    cases[2].dimensions.pixelSha256,
    'The trained nonzero second LoRA must change decoded pixels relative to B zero/disabled.',
  )
  assert.notEqual(
    cases[1].dimensions.pixelSha256,
    cases[2].dimensions.pixelSha256,
    'The reversed trained stack must also change decoded pixels relative to B zero/disabled.',
  )
  // Ordinary additive AB/BA order is recorded, without requiring a pixel relation in FP16.
  return { enabledZeroEqualsDisabled: true, trainedSecondChangesPixels: true }
}

export function assertNoobaiLoraStackStageOutcome(summary) {
  assert.equal(summary.stage, 'txt2img')
  assert.ok(['epsilon', 'v_prediction'].includes(summary.objective))
  const plan = stagePlan()
  for (const [key, value] of Object.entries(plan.expectedOutcome)) assert.equal(summary[key], value)
  assert.equal(summary.matchedPixelControlCases, plan.matchedPixelControlCases)
  assert.equal(summary.fullMvpClaim, false)
  assert.equal(summary.combinedMatrixClaim, false)
}

/** Actual comparison text contains a multiline description within each ordered adapter. */
export function assertNoobaiLoraStackDescription(text, stack) {
  const entries = text.split(/\n(?=(?:Enabled|Disabled) · )/)
  assert.equal(entries.length, stack.length)
  for (const [position, lora] of stack.entries()) {
    const entry = entries[position]
    assert.ok(
      entry.startsWith(
        `${lora.enabled ? 'Enabled' : 'Disabled'} · ${lora.resource.displayName} · ${lora.resource.versionName}\n`,
      ),
    )
    assert.ok(entry.includes(`SHA-256 ${lora.resource.fileSha256}`))
    assert.ok(entry.endsWith(`Weight ${lora.weight}`))
  }
}
