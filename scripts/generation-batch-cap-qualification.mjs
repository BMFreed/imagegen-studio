/** Independent literal cap/prefix oracle; no production planner, compiler, RNG or I/O. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import * as anima from './anima-dynamic-batch-qualification.mjs'
import * as illustrious from './illustrious-dynamic-batch-qualification.mjs'

const artifactRoot = path.join(homedir(), '.codex/artifacts/imagegen-studio')

// Handwritten pair-major tables. Production expansion and admitted rows never supply expectations.
const boundaryTuples = [
  [0, 0, 0],
  [0, 1, 1],
  [0, 2, 2],
  [0, 3, 3],
  [0, 4, 4],
  [0, 5, 5],
  [0, 6, 6],
  [0, 7, 7],
  [1, 0, 0],
  [1, 1, 1],
  [1, 2, 2],
  [1, 3, 3],
  [1, 4, 4],
  [1, 5, 5],
  [1, 6, 6],
  [1, 7, 7],
  [2, 0, 0],
  [2, 1, 1],
  [2, 2, 2],
  [2, 3, 3],
  [2, 4, 4],
  [2, 5, 5],
  [2, 6, 6],
  [2, 7, 7],
  [3, 0, 0],
  [3, 1, 1],
  [3, 2, 2],
  [3, 3, 3],
  [3, 4, 4],
  [3, 5, 5],
  [3, 6, 6],
  [3, 7, 7],
]
const prefixTuples = [
  [0, 0, 0],
  [0, 1, 1],
  [1, 0, 2],
  [1, 1, 3],
  [2, 0, 4],
  [2, 1, 5],
]
const baselineIndices = [0, 1, 10, 11, 20, 21]

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
    'The cap qualification object must contain exactly its declared fields.',
  )
}

function artifactPath(value) {
  assert.ok(
    typeof value === 'string' &&
      path.isAbsolute(value) &&
      path.resolve(value) === value &&
      value.startsWith(`${artifactRoot}${path.sep}`),
    'Qualification paths must canonically descend from the owned artifact root.',
  )
}

function pinnedReference(value, pathKey, digestKey) {
  exactKeys(value, [pathKey, digestKey])
  artifactPath(value[pathKey])
  assert.equal(typeof value[digestKey], 'string')
  assert.match(value[digestKey], /^[a-f0-9]{64}$/)
}

function overlap(left, right) {
  return (
    left === right ||
    left.startsWith(`${right}${path.sep}`) ||
    right.startsWith(`${left}${path.sep}`)
  )
}

function oracle(objective) {
  assert.ok(['anima', 'epsilon', 'v_prediction'].includes(objective), 'Unknown cap objective.')
  return objective === 'anima' ? anima : illustrious
}

/** Full literal table with legacy exact resources and signed prompt/span expectations. */
export function literalBatchCapPlan(stage, objective) {
  assert.ok(['boundary', 'prefix'].includes(stage), 'Unknown cap stage.')
  const selected = oracle(objective)
  const exemplar = selected.literalDynamicBatchPlan('iteration', objective)
  const boundary = stage === 'boundary'
  const seedBehavior = boundary ? 'per-iteration' : 'per-prompt'
  const tuples = boundary ? boundaryTuples : prefixTuples
  const items = tuples.map(([promptPairIndex, iteration, seed]) => ({
    ...structuredClone(exemplar.items[promptPairIndex * 2]),
    promptPairIndex,
    iteration,
    seed,
    requestedSeedPolicy: 'fixed',
    seedBehavior,
  }))
  return freeze({
    stage,
    objective,
    modelKey: objective === 'anima' ? 'anima' : exemplar.modelKey,
    ...(objective === 'anima' ? { animaMethod: 'euler' } : { sampler: exemplar.sampler }),
    iterations: boundary ? 8 : 2,
    maxPrompts: boundary ? 4 : 3,
    maxJobs: 32,
    requestedSeedPolicy: 'fixed',
    fixedSeed: 0,
    baseSeed: 0,
    seedBehavior,
    truncated: !boundary,
    sourcePrompts: structuredClone(selected.dynamicBatchSourcePrompts()),
    items,
    boundaryBaselineIndices: boundary ? null : [...baselineIndices],
    expectedCompletions: boundary ? 32 : 6,
    expectedAdmissions: boundary ? 32 : 6,
    expectedCanceled: 0,
  })
}

/** Reject a changed expected table rather than treating caller-provided tuples as truth. */
export function assertBatchCapPlan(plan) {
  assert.ok(plan && typeof plan === 'object')
  assert.deepEqual(
    plan,
    literalBatchCapPlan(plan.stage, plan.objective),
    'The complete cap plan must match the independent literal table.',
  )
}

/** Lexical checks precede reads; runner verifies physical containment, SHA and baseline scope. */
export function validateBatchCapFixture(fixture) {
  exactKeys(
    fixture,
    [
      'schemaVersion',
      'profile',
      'objective',
      'stage',
      'referenceFixture',
      'workerBaseline',
      'artifacts',
    ],
    ['baseline'],
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'generation-batch-cap')
  const plan = literalBatchCapPlan(fixture.stage, fixture.objective)
  artifactPath(fixture.artifacts)
  pinnedReference(fixture.referenceFixture, 'path', 'sha256')
  pinnedReference(fixture.workerBaseline, 'path', 'sha256')
  for (const source of [fixture.referenceFixture.path, fixture.workerBaseline.path])
    assert.ok(!overlap(fixture.artifacts, source), 'Evidence must not enclose a source fixture.')
  if (fixture.stage === 'prefix') {
    assert.ok(fixture.baseline, 'Prefix requires a pinned healthy boundary baseline.')
    pinnedReference(fixture.baseline, 'reportPath', 'reportSha256')
    assert.ok(!overlap(fixture.artifacts, fixture.baseline.reportPath))
  } else {
    assert.equal(Object.hasOwn(fixture, 'baseline'), false, 'Boundary must not consume a baseline.')
  }
  return plan
}

function adaptedItem(expected) {
  assert.ok(expected && typeof expected === 'object')
  const objective = Object.hasOwn(expected, 'objective') ? expected.objective : 'anima'
  const selected = oracle(objective)
  const stage =
    expected.seedBehavior === 'per-iteration'
      ? 'boundary'
      : expected.seedBehavior === 'per-prompt'
        ? 'prefix'
        : null
  const plan = literalBatchCapPlan(stage, objective)
  assertBatchCapPlan(plan)
  assert.ok(
    plan.items.some((item) => isDeepStrictEqual(item, expected)),
    'The expected cap item must belong to the complete independent literal table.',
  )
  // Legacy EPS assertions restrict expected iteration to 0..2. Iteration is not a stored native
  // field: full cap tuple membership above establishes it before projecting only this metadata.
  return { selected, item: { ...structuredClone(expected), iteration: 0 } }
}

export function assertBatchCapFrozen(frozen, expectedItem, fixture) {
  const { selected, item } = adaptedItem(expectedItem)
  assert.equal(frozen?.context?.sampling?.requestedSeedPolicy, 'fixed')
  assert.equal(frozen?.context?.sampling?.seedBehavior, expectedItem.seedBehavior)
  selected.assertDynamicBatchFrozen(frozen, item, fixture)
}

export function assertBatchCapConfiguration(configuration, expectedItem, fixture) {
  const { selected, item } = adaptedItem(expectedItem)
  assert.equal(configuration?.sampling?.requestedSeedPolicy, 'fixed')
  assert.equal(configuration?.sampling?.seedBehavior, expectedItem.seedBehavior)
  selected.assertDynamicBatchConfiguration(configuration, item, fixture)
}

/** Keep all settings and native inputs; only per-Project identity is omitted by legacy helper. */
export function normalizeBatchCapNativeInputs(frozen) {
  assert.ok(
    ['anima-txt2img', 'illustrious-txt2img'].includes(frozen?.kind),
    'Only the qualified txt2img operation can be normalized.',
  )
  const selected = frozen.kind === 'anima-txt2img' ? anima : illustrious
  return selected.normalizeDynamicNativeInputs(frozen)
}

/** Only the declared prefix control omits seed behavior; Fixed policy and all ML inputs remain. */
export function normalizeBatchCapExecutionInputs(frozen, plan) {
  assertBatchCapPlan(plan)
  assert.equal(plan.stage, 'prefix', 'Only the declared prefix control omits seed behavior.')
  const normalized = normalizeBatchCapNativeInputs(frozen)
  assert.equal(normalized.context?.sampling?.requestedSeedPolicy, 'fixed')
  assert.ok(['per-iteration', 'per-prompt'].includes(normalized.context.sampling.seedBehavior))
  delete normalized.context.sampling.seedBehavior
  return normalized
}
