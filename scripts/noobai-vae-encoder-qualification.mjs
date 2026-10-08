/** Selected encoder controls; pure guards, without ML, filesystem reads or broader readiness claims. */
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  assertNoobaiComponentCatalog,
  assertNoobaiComponentFrozen,
  componentKeys,
  componentPublicationIds,
  normalizeNoobaiComponentInputs,
  validateNoobaiComponentsFixture,
  visibleOutpaint,
} from './noobai-components-qualification.mjs'
import { noiseModelKeys } from './noobai-noise-qualification.mjs'

export const encoderPublicationIds = {
  managedId: 700_085,
  modelId: 700_070,
  versionId: 700_083,
  fileId: 700_084,
}
const encoderKey = 'externalVaeEncoderControl'
const choices = ['fullstack', 'encoder-control']
const stages = ['txt2img', 'img2img', 'outpaint']

function stagePlan(stage) {
  assert.ok(
    stages.includes(stage),
    'Encoder qualification requires txt2img, img2img or normal outpaint.',
  )
  return {
    mode: stage,
    choices: [...choices],
    matchedPixelControlCases: 1,
    fullMvpClaim: false,
    combinedMatrixClaim: false,
    expectedOutcome: {
      finiteCompletions: 2,
      actualAdmissions: 2,
      canceledOriginals: 0,
      preservingRetryRefusals: 0,
    },
  }
}
function baseFixture(fixture) {
  const base = { ...fixture, profile: 'noobai-components' }
  delete base[encoderKey]
  return base
}
function expectedOrigin(fixture) {
  return {
    kind: 'artificial-encoder-control',
    sourceVaeSha256: fixture.externalVaeNative.sha256,
    format: 'diffusers',
    encoderOutputBiasAdd: 0.5,
  }
}
function sha(value) {
  assert.ok(typeof value === 'string')
  assert.match(value, /^[a-f0-9]{64}$/)
}
function assertMode(frozen, mode) {
  assert.equal(frozen.kind, `illustrious-${mode}`)
  if (mode === 'img2img' || mode === 'outpaint') {
    assert.equal(frozen.context.sampling.denoisingStrength, 0.5)
    assert.equal(frozen.workerJob.sampling.denoisingStrength, 0.5)
  } else assert.equal(frozen.workerJob.sampling.denoisingStrength, undefined)
}
function assertEncoderSource(fixture, { installed = false } = {}) {
  const source = fixture[encoderKey]
  assert.ok(source && typeof source === 'object' && !Array.isArray(source))
  const fields = [
    'path',
    'sha256',
    'byteSize',
    'type',
    'family',
    'name',
    'versionName',
    'origin',
    ...(installed && source.installed ? ['installed'] : []),
  ]
  assert.deepEqual(
    Object.keys(source).sort(),
    fields.sort(),
    'Encoder control source fields must be exact.',
  )
  assert.ok(
    typeof source.path === 'string' &&
      path.isAbsolute(source.path) &&
      path.normalize(source.path) === source.path &&
      source.path.endsWith('.safetensors'),
  )
  const filename = path.basename(source.path)
  assert.ok(!/[<>\x00-\x1f\x7f/\\]/u.test(filename))
  assert.ok(filename.slice(0, -'.safetensors'.length).trim())
  sha(source.sha256)
  assert.ok(Number.isSafeInteger(source.byteSize) && source.byteSize > 0)
  assert.equal(source.type, 'vae')
  assert.equal(source.family, 'illustrious')
  assert.equal(source.name, fixture.externalVaeNative.name)
  assert.ok(
    typeof source.versionName === 'string' &&
      source.versionName.trim() === source.versionName &&
      source.versionName,
  )
  assert.deepEqual(source.origin, expectedOrigin(fixture))
  for (const key of ['externalVaeLdm', 'externalVaeNative', 'externalVaeControl']) {
    assert.notEqual(source.versionName, fixture[key].versionName)
    assert.notEqual(filename, path.basename(fixture[key].path))
  }
  assert.equal(
    new Set([...noiseModelKeys, ...componentKeys, encoderKey].map((key) => fixture[key].sha256))
      .size,
    9,
    'The encoder control must add exactly one distinct ninth file identity.',
  )
}

export function validateNoobaiVaeEncoderFixture(fixture, ready) {
  assert.equal(fixture.profile, 'noobai-vae-encoder')
  const plan = stagePlan(fixture.stage)
  assertEncoderSource(fixture)
  if (fixture.stage === 'outpaint') {
    // Qualification pin matches Main's LAMA_OUTPAINT_ARTIFACT in
    // src/shared/projects/alpha-outpaint.ts; this helper remains native Node only.
    const lama = fixture.lama
    assert.ok(lama && typeof lama === 'object' && !Array.isArray(lama))
    assert.deepEqual(
      Object.keys(lama).sort(),
      ['byteSize', 'path', 'sha256'],
      'Encoder outpaint requires the exact pinned LaMa descriptor.',
    )
    assert.ok(
      typeof lama.path === 'string' &&
        path.isAbsolute(lama.path) &&
        path.normalize(lama.path) === lama.path,
    )
    assert.equal(
      lama.sha256,
      '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
      'Encoder outpaint requires the pinned LaMa SHA.',
    )
    assert.equal(lama.byteSize, 205_669_692)
  }
  const base = validateNoobaiComponentsFixture(baseFixture(fixture), ready)
  return {
    ...base,
    ...plan,
    expectedCatalogResources: 5,
    expectedCatalogVersions: 9,
  }
}

function managedPath(fixture, ids) {
  return path.join(fixture.appData, 'models', `qualified-${ids.managedId}.safetensors`)
}
function reference(fixture, key, ids) {
  const source = fixture[key]
  assert.ok(
    source.installed &&
      typeof source.installed.resourceId === 'string' &&
      source.installed.resourceId &&
      typeof source.installed.versionId === 'string' &&
      source.installed.versionId,
  )
  assert.equal(source.installed.managedPath, managedPath(fixture, ids))
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: ids.fileId,
    civitaiModelId: ids.modelId,
    civitaiVersionId: ids.versionId,
    displayName: source.name,
    fileSha256: source.sha256,
    kind: 'vae',
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    predictionType: null,
    versionName: source.versionName,
  }
}

/** Adoption may add the new version only after preserving the entire original 5/8 catalog. */
export function assertNoobaiVaeEncoderCatalog(catalog, fixture, { adopting = false } = {}) {
  assert.ok(Array.isArray(catalog))
  assertEncoderSource(fixture, { installed: true })
  const source = fixture[encoderKey]
  const matches = catalog.flatMap((resource) =>
    resource.versions
      .filter(({ file }) => file.sha256 === source.sha256)
      .map((version) => ({ resource, version })),
  )
  assert.ok(
    adopting ? matches.length <= 1 : matches.length === 1,
    'Exactly one declared encoder-control version may be present.',
  )
  const prior = catalog.map((resource) => ({
    ...resource,
    versions: resource.versions.filter(({ file }) => file.sha256 !== source.sha256),
  }))
  // The base guard remains strict even during adoption: no original version may disappear.
  const seen = assertNoobaiComponentCatalog(prior, baseFixture(fixture))
  const native = prior.find(({ versions }) =>
    versions.some(({ file }) => file.sha256 === fixture.externalVaeNative.sha256),
  )
  if (source.installed) {
    const expected = reference(fixture, encoderKey, encoderPublicationIds)
    assert.equal(expected.localModelId, native.id)
    assert.ok(
      !prior.flatMap(({ versions }) => versions).some(({ id }) => id === expected.localVersionId),
      'The captured encoder-control local version ID must be distinct.',
    )
  }
  if (matches.length === 0) return seen
  const { resource, version } = matches[0]
  assert.equal(resource.id, native.id)
  assert.equal(resource.type, 'vae')
  assert.notEqual(resource.defaultVersionId, version.id)
  assert.ok(
    !prior.flatMap(({ versions }) => versions).some(({ id }) => id === version.id),
    'The encoder-control local version ID must be distinct.',
  )
  assert.equal(version.name, source.versionName)
  assert.equal(version.file.sizeBytes, source.byteSize)
  assert.equal(version.file.status, 'ready')
  assert.equal(version.file.originalFilename, path.basename(source.path))
  assert.equal(version.file.managedPath, managedPath(fixture, encoderPublicationIds))
  assert.equal(version.expectedSha256, source.sha256)
  assert.equal(version.format, 'safetensors')
  assert.equal(version.baseModelFamily, 'illustrious')
  assert.equal(version.predictionType, null)
  assert.equal(version.civitaiVersionId, encoderPublicationIds.versionId)
  assert.equal(version.civitaiFileId, encoderPublicationIds.fileId)
  assert.deepEqual(version.dependencyVersionIds, {})
  assert.equal(version.sourceMetadata.qualificationPrecondition, true)
  assert.deepEqual(version.sourceMetadata.origin, expectedOrigin(fixture))
  if (source.installed) {
    const expected = reference(fixture, encoderKey, encoderPublicationIds)
    assert.equal(resource.id, expected.localModelId)
    assert.equal(version.id, expected.localVersionId)
    assert.equal(version.file.managedPath, source.installed.managedPath)
  }
  assert.equal(catalog.length, 5)
  assert.equal(catalog.flatMap(({ versions }) => versions).length, 9)
  seen.add(encoderKey)
  return seen
}

function isoTimestamp(value) {
  assert.ok(
    typeof value === 'string' &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    'Publication timestamps must be valid canonical ISO timestamps.',
  )
  return Date.parse(value)
}
function catalogForComparison(catalog) {
  return structuredClone(catalog)
    .map((resource) => {
      if (resource.type === 'checkpoint')
        for (const version of resource.versions)
          for (const field of ['predictionType', 'predictionTypeSource', 'noiseProfile'])
            delete version[field]
      resource.versions.sort((left, right) => left.id.localeCompare(right.id))
      return resource
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

/** Preserve actual prior owners, allowing only the timestamp written by this exact publication. */
export function assertNoobaiVaeEncoderCatalogPreserved(currentCatalog, previousCatalog, fixture) {
  assertNoobaiVaeEncoderCatalog(currentCatalog, fixture)
  assertNoobaiVaeEncoderCatalog(previousCatalog, fixture, { adopting: true })
  const hash = fixture[encoderKey].sha256
  const previousHasEncoder = previousCatalog.some(({ versions }) =>
    versions.some(({ file }) => file.sha256 === hash),
  )
  const current = catalogForComparison(currentCatalog)
  const previous = catalogForComparison(previousCatalog)
  const publicationTimestamps = []
  if (!previousHasEncoder) {
    const resource = current.find(({ versions }) =>
      versions.some(({ file }) => file.sha256 === hash),
    )
    const version = resource.versions.find(({ file }) => file.sha256 === hash)
    const prior = previous.find(({ id }) => id === resource.id)
    assert.equal(
      resource.sourceCheckedAt,
      version.createdAt,
      'The VAE publication timestamp must equal the new encoder version creation timestamp.',
    )
    assert.ok(
      isoTimestamp(resource.sourceCheckedAt) >= isoTimestamp(prior.sourceCheckedAt),
      'The VAE publication timestamp must not precede its prior source check.',
    )
    publicationTimestamps.push({
      resourceId: resource.id,
      versionId: version.id,
      previousSourceCheckedAt: prior.sourceCheckedAt,
      sourceCheckedAt: resource.sourceCheckedAt,
      createdAt: version.createdAt,
    })
    resource.sourceCheckedAt = prior.sourceCheckedAt
    resource.versions = resource.versions.filter(({ file }) => file.sha256 !== hash)
  }
  assert.deepEqual(
    current,
    previous,
    'Encoder publication must preserve all existing resource/version owners except authored checkpoint policies.',
  )
  return publicationTimestamps
}

/** Check the new VAE identity before substituting only that checked axis for base delegation. */
export function assertNoobaiVaeEncoderFrozen(frozen, fixture, choice) {
  assert.ok(choices.includes(choice), 'An exact encoder qualification choice is required.')
  stagePlan(fixture.stage)
  assertMode(frozen, fixture.stage)
  if (choice === 'fullstack') {
    assertNoobaiComponentFrozen(frozen, baseFixture(fixture), 'fullstack')
    return
  }
  assertEncoderSource(fixture, { installed: true })
  const source = fixture[encoderKey]
  const selected = reference(fixture, encoderKey, encoderPublicationIds)
  const native = reference(fixture, 'externalVaeNative', componentPublicationIds.externalVaeNative)
  assert.equal(selected.localModelId, native.localModelId)
  assert.notEqual(selected.localVersionId, native.localVersionId)
  assert.deepEqual(frozen.context.vae, {
    byteSize: source.byteSize,
    managedPath: source.installed.managedPath,
    reference: selected,
  })
  assert.deepEqual(frozen.workerJob.vae, {
    byteSize: source.byteSize,
    path: source.installed.managedPath,
    sha256: source.sha256,
  })
  const normalized = structuredClone(frozen)
  normalized.context.vae = {
    byteSize: fixture.externalVaeNative.byteSize,
    managedPath: fixture.externalVaeNative.installed.managedPath,
    reference: native,
  }
  normalized.workerJob.vae = {
    byteSize: fixture.externalVaeNative.byteSize,
    path: fixture.externalVaeNative.installed.managedPath,
    sha256: fixture.externalVaeNative.sha256,
  }
  assertNoobaiComponentFrozen(normalized, baseFixture(fixture), 'fullstack')
}

export function assertNoobaiVaeEncoderPixels(cases, mode) {
  stagePlan(mode)
  assert.ok(Array.isArray(cases))
  assert.deepEqual(
    cases.map(({ choice }) => choice),
    choices,
    'Exactly the native full stack and encoder-control cases are required in fixed order.',
  )
  for (const value of cases) {
    assertMode(value.frozen, mode)
    sha(value.target.sha256)
    sha(value.target.pixelSha256)
    sha(value.dimensions.pixelSha256)
    assert.ok(
      Number.isSafeInteger(value.dimensions.width) &&
        value.dimensions.width > 0 &&
        Number.isSafeInteger(value.dimensions.height) &&
        value.dimensions.height > 0,
      'Saved encoder-control dimensions must be positive integer dimensions.',
    )
  }
  const [native, control] = cases
  assert.equal(
    control.dimensions.width,
    native.dimensions.width,
    'Encoder controls must preserve the saved image width.',
  )
  assert.equal(
    control.dimensions.height,
    native.dimensions.height,
    'Encoder controls must preserve the saved image height.',
  )
  assert.deepEqual(
    normalizeNoobaiComponentInputs(control.frozen, 'vae-control'),
    normalizeNoobaiComponentInputs(native.frozen, 'vae-control'),
    'Only the selected VAE axis may differ; all neighboring frozen inputs must stay matched.',
  )
  assert.deepEqual(control.target, native.target, 'Encoder controls require one identical target.')
  const visibleEvidence =
    mode === 'outpaint'
      ? visibleOutpaint(native, control, false, { requireCorrespondingChange: true })
      : {}
  if (mode === 'txt2img')
    assert.equal(
      control.dimensions.pixelSha256,
      native.dimensions.pixelSha256,
      'Encoder-only control must preserve txt2img pixels with an unchanged decoder.',
    )
  else
    assert.notEqual(
      control.dimensions.pixelSha256,
      native.dimensions.pixelSha256,
      mode === 'outpaint'
        ? 'Selected VAE encoder must change normal outpaint pixels while decoder and neighboring inputs stay matched.'
        : 'Selected VAE encoder must change nonzero img2img pixels while decoder and neighboring inputs stay matched.',
    )
  return [
    {
      choice: 'encoder-control',
      mode,
      equal: mode === 'txt2img',
      ...visibleEvidence,
    },
  ]
}

export function assertNoobaiVaeEncoderStageOutcome(summary) {
  assert.ok(['epsilon', 'v_prediction'].includes(summary.objective))
  const plan = stagePlan(summary.stage)
  for (const [field, expected] of Object.entries(plan.expectedOutcome))
    assert.equal(
      summary[field],
      expected,
      `The encoder ${summary.stage} stage requires exact ${field}.`,
    )
  for (const field of ['matchedPixelControlCases', 'fullMvpClaim', 'combinedMatrixClaim'])
    assert.equal(summary[field], plan[field], 'One encoder stage cannot promote a broader claim.')
}
