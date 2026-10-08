/** Exact crossed embedding identities; directional numerical proof remains a native oracle. */
import assert from 'node:assert/strict'

import {
  assertNoobaiComponentFrozen,
  normalizeNoobaiComponentInputs,
} from './noobai-components-qualification.mjs'
import {
  assertNoobaiVaeEncoderCatalog,
  assertNoobaiVaeEncoderCatalogPreserved,
  validateNoobaiVaeEncoderFixture,
} from './noobai-vae-encoder-qualification.mjs'

export const polarityChoices = ['positive-zero', 'negative-zero']

function assertStage(fixture) {
  assert.equal(fixture.profile, 'noobai-embedding-polarity')
  assert.equal(fixture.stage, 'txt2img', 'Embedding polarity qualification requires only txt2img.')
}
function borrowedFixture(fixture) {
  return { ...fixture, profile: 'noobai-vae-encoder' }
}
function componentFixture(fixture) {
  const base = { ...fixture, profile: 'noobai-components' }
  delete base.externalVaeEncoderControl
  return base
}
function stagePlan() {
  return {
    mode: 'txt2img',
    choices: [...polarityChoices],
    matchedPixelControlCases: 1,
    expectedDirectionalNativeAssignments: 4,
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
function sha(value) {
  assert.ok(typeof value === 'string')
  assert.match(value, /^[a-f0-9]{64}$/)
}

export function validateNoobaiEmbeddingPolarityFixture(fixture, ready) {
  // Reject modes before delegated source descriptors, source reads or native startup.
  assertStage(fixture)
  const borrowed = validateNoobaiVaeEncoderFixture(borrowedFixture(fixture), ready)
  return {
    ...borrowed,
    ...stagePlan(),
    expectedCatalogResources: 5,
    expectedCatalogVersions: 9,
    maximumAdditionalManagedFiles: 0,
  }
}

/** All nine existing identities are mandatory; this profile never adopts a missing version. */
export function assertNoobaiEmbeddingPolarityCatalog(catalog, fixture) {
  assertStage(fixture)
  return assertNoobaiVaeEncoderCatalog(catalog, borrowedFixture(fixture))
}

export function assertNoobaiEmbeddingPolarityCatalogPreserved(current, previous, fixture) {
  assertNoobaiEmbeddingPolarityCatalog(previous, fixture)
  assertNoobaiEmbeddingPolarityCatalog(current, fixture)
  const publications = assertNoobaiVaeEncoderCatalogPreserved(
    current,
    previous,
    borrowedFixture(fixture),
  )
  assert.deepEqual(publications, [], 'Polarity qualification must not publish a model version.')
  return publications
}

export function assertNoobaiEmbeddingPolarityFrozen(frozen, fixture, choice) {
  assertStage(fixture)
  assert.ok(polarityChoices.includes(choice), 'An exact crossed embedding choice is required.')
  assert.equal(frozen.kind, 'illustrious-txt2img')
  assert.equal(frozen.context.sampling.denoisingStrength, undefined)
  assert.equal(frozen.workerJob.sampling.denoisingStrength, undefined)
  assertNoobaiComponentFrozen(frozen, componentFixture(fixture), choice)
}

/** Validate each signed exact tuple before permitting both declared embedding version axes. */
export function normalizeNoobaiEmbeddingPolarityInputs(frozen, fixture, choice) {
  assertNoobaiEmbeddingPolarityFrozen(frozen, fixture, choice)
  return normalizeNoobaiComponentInputs(
    normalizeNoobaiComponentInputs(frozen, 'positive-zero'),
    'negative-zero',
  )
}

export function assertNoobaiEmbeddingPolarityPixels(cases, fixture) {
  assertStage(fixture)
  assert.ok(Array.isArray(cases))
  assert.deepEqual(
    cases.map(({ choice }) => choice),
    polarityChoices,
    'Exactly positive-zero and negative-zero cases are required in fixed order.',
  )
  const normalized = []
  for (const value of cases) {
    normalized.push(normalizeNoobaiEmbeddingPolarityInputs(value.frozen, fixture, value.choice))
    sha(value.target.sha256)
    sha(value.target.pixelSha256)
    sha(value.dimensions.pixelSha256)
    for (const owner of [value.target, value.dimensions])
      for (const axis of ['width', 'height'])
        assert.equal(owner[axis], fixture.side, 'Decoded source and saved dimensions must match.')
  }
  assert.deepEqual(
    normalized[1],
    normalized[0],
    'Only exact embedding version choices may cross; literals, signs and all neighboring inputs stay matched.',
  )
  assert.deepEqual(cases[1].target, cases[0].target, 'Crossed cases require one identical target.')
  assert.notEqual(
    cases[1].dimensions.pixelSha256,
    cases[0].dimensions.pixelSha256,
    'Crossed trained/zero embedding selections must produce different decoded pixels.',
  )
  return [{ choices: [...polarityChoices], mode: 'txt2img', directionalOracleRequired: true }]
}

/** Consume explicit native observations; a passed scalar or changed pixels are insufficient. */
export function assertNoobaiEmbeddingPolarityOracle(result, input) {
  assert.equal(result.schemaVersion, 1)
  assert.equal(result.status, 'passed')
  assert.equal(result.observedCommands, 2)
  assert.equal(result.nativeAssignments, 4)
  assert.equal(result.workerRootPath, input.workerRootPath)
  assert.equal(result.configDir, input.configDir)
  assert.deepEqual(result.workerSourceFiles, input.workerSourceFiles)
  assert.equal(Object.keys(result.workerSourceFiles).length, 43)
  assert.deepEqual(result.checkpoint, input.sources.checkpoint)
  assert.deepEqual(
    input.cases.map(({ choice }) => choice),
    polarityChoices,
  )
  const assignments = [
    ['trained/trained', true, 'derived-trained', 'embeddingTrained', 'embeddingTrained'],
    ['trained/zero', false, 'negative-zero', 'embeddingTrained', 'embeddingControl'],
    ['zero/trained', false, 'positive-zero', 'embeddingControl', 'embeddingTrained'],
    ['zero/zero', true, 'derived-zero', 'embeddingControl', 'embeddingControl'],
  ]
  assert.ok(Array.isArray(result.cases))
  assert.equal(result.cases.length, 4)
  const requests = new Set()
  for (const [index, expected] of assignments.entries()) {
    const [assignment, derived, choice, positive, negative] = expected
    const observed = result.cases[index]
    assert.equal(observed.assignment, assignment)
    assert.equal(observed.derived, derived)
    assert.equal(observed.choice, choice)
    assert.equal(observed.positiveSha256, input.sources[positive].sha256)
    assert.equal(observed.negativeSha256, input.sources[negative].sha256)
    assert.ok(typeof observed.requestId === 'string' && observed.requestId)
    assert.equal(requests.has(observed.requestId), false)
    requests.add(observed.requestId)
    if (!derived)
      assert.equal(
        observed.requestId,
        input.cases.find((value) => value.choice === choice).requestId,
        'Native directional observations must bind the actual completed UI request.',
      )
    for (const field of [
      'hiddenPositiveMatches',
      'hiddenNegativeMatches',
      'pooledPositiveMatches',
      'pooledNegativeMatches',
    ]) {
      assert.equal(
        observed[field],
        true,
        'Every signed native tensor must match its independent reference.',
      )
      assert.equal(
        observed.handoff?.[field],
        true,
        'Actual pipeline handoff must retain each signed tensor.',
      )
    }
    assert.equal(observed.handoff.observations, 1)
    assert.equal(observed.handoff.generatorStateUnchanged, true)
    assert.equal(observed.handoff.methodRestored, true)
  }
  for (const field of ['positiveHidden', 'negativeHidden', 'positivePooled', 'negativePooled'])
    assert.deepEqual(result.branchIsolation?.[field], {
      oppositeUnchanged: true,
      ownResourceChanges: true,
    })
  return { observedCommands: 2, nativeAssignments: 4, directionalOraclePassed: true }
}

export function assertNoobaiEmbeddingPolarityStageOutcome(summary) {
  assertStage({ profile: 'noobai-embedding-polarity', stage: summary.stage })
  assert.ok(['epsilon', 'v_prediction'].includes(summary.objective))
  const plan = stagePlan()
  for (const [field, expected] of Object.entries(plan.expectedOutcome))
    assert.equal(summary[field], expected, `Polarity qualification requires exact ${field}.`)
  for (const field of ['matchedPixelControlCases', 'fullMvpClaim', 'combinedMatrixClaim'])
    assert.equal(summary[field], plan[field])
  assert.equal(summary.directionalNativeAssignments, 4)
  assert.equal(
    summary.directionalOraclePassed,
    true,
    'Pixel inequality alone must not qualify embedding polarity direction.',
  )
}
