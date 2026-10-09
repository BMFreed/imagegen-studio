/** Independent seed oracle. Production planners, RNG, filesystem and worker code are not inputs. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'

import * as anima from './anima-dynamic-batch-qualification.mjs'
import * as illustrious from './illustrious-dynamic-batch-qualification.mjs'

const artifactRoot = path.join(homedir(), '.codex/artifacts/imagegen-studio')
const uint32Max = 0xffff_ffff
const uint32Modulus = 0x1_0000_0000

function exactKeys(value, required, optional = []) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  assert.deepEqual(
    Object.keys(value).sort(),
    [...required, ...optional.filter((key) => Object.hasOwn(value, key))].sort(),
    'The seed qualification object must contain exactly its declared fields.',
  )
}

function uint32(value) {
  assert.ok(
    Number.isSafeInteger(value) && value >= 0 && value <= uint32Max,
    'An actual uint32 seed, including zero, is required.',
  )
}

function sha(value) {
  assert.equal(typeof value, 'string')
  assert.match(value, /^[a-f0-9]{64}$/)
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

function reference(value, fields) {
  exactKeys(value, fields)
  artifactPath(value[fields[0]])
  sha(value[fields[1]])
}

function overlap(left, right) {
  return (
    left === right ||
    left.startsWith(`${right}${path.sep}`) ||
    right.startsWith(`${left}${path.sep}`)
  )
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

function oracle(objective) {
  assert.ok(['anima', 'epsilon', 'v_prediction'].includes(objective), 'Unknown seed objective.')
  return objective === 'anima' ? anima : illustrious
}

function literalPlan(stage, objective, replaySeed = null) {
  const selected = oracle(objective)
  assert.ok(['random', 'replay', 'wrap', 'restored'].includes(stage), 'Unknown seed stage.')
  if (stage === 'replay') uint32(replaySeed)
  else assert.equal(replaySeed, null)
  const exemplar = selected.literalDynamicBatchPlan('iteration', objective)
  const seedBehavior = ['wrap', 'restored'].includes(stage) ? 'per-prompt' : 'per-iteration'
  const requestedSeedPolicy = stage === 'random' ? 'random' : 'fixed'
  const fixedSeed = stage === 'random' ? null : stage === 'replay' ? replaySeed : uint32Max
  // Literal pair-major prefix: red/blurry 0,1 then red/noisy 0,1. Restored keeps one pair.
  const tuples =
    stage === 'restored'
      ? [
          [0, 0],
          [0, 1],
        ]
      : [
          [0, 0],
          [0, 1],
          [1, 0],
          [1, 1],
        ]
  const seeds = stage === 'wrap' ? [uint32Max, 0, 1, 2] : [uint32Max, 0]
  const items = tuples.map(([promptPairIndex, iteration], index) => ({
    ...structuredClone(exemplar.items[index]),
    promptPairIndex,
    iteration,
    seed:
      stage === 'random'
        ? null
        : stage === 'replay'
          ? (replaySeed + iteration) % uint32Modulus
          : seeds[index],
    requestedSeedPolicy,
    seedBehavior,
  }))
  return freeze({
    stage,
    objective,
    modelKey: objective === 'anima' ? 'anima' : exemplar.modelKey,
    ...(objective === 'anima' ? { animaMethod: 'euler' } : { sampler: exemplar.sampler }),
    iterations: 2,
    maxPrompts: stage === 'restored' ? 1 : 2,
    seedBehavior,
    requestedSeedPolicy,
    fixedSeed,
    baseSeed: fixedSeed,
    randomBaseSource: null,
    sourcePrompts: structuredClone(selected.dynamicBatchSourcePrompts()),
    items,
    expectedCompletions: items.length,
    expectedAdmissions: items.length,
    expectedCanceled: 0,
  })
}

/** Lexical validation before reads. The runner owns physical containment and referenced SHA. */
export function validateSeedBoundaryFixture(fixture) {
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
    ['baseline', 'mutation', 'replaySeed'],
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'generation-seed-boundary')
  if (fixture.stage === 'replay') {
    assert.ok(Object.hasOwn(fixture, 'replaySeed'), 'Replay requires the observed Random base.')
    uint32(fixture.replaySeed)
  } else assert.equal(Object.hasOwn(fixture, 'replaySeed'), false)
  const plan = literalPlan(fixture.stage, fixture.objective, fixture.replaySeed ?? null)
  artifactPath(fixture.artifacts)
  reference(fixture.referenceFixture, ['path', 'sha256'])
  reference(fixture.workerBaseline, ['path', 'sha256'])
  for (const source of [fixture.referenceFixture.path, fixture.workerBaseline.path])
    assert.ok(!overlap(fixture.artifacts, source), 'Evidence must not enclose a source fixture.')
  if (Object.hasOwn(fixture, 'baseline')) {
    assert.ok(['replay', 'wrap', 'restored'].includes(fixture.stage))
    reference(fixture.baseline, ['reportPath', 'reportSha256'])
    assert.ok(!overlap(fixture.artifacts, fixture.baseline.reportPath))
    if (fixture.stage === 'wrap')
      assert.ok(fixture.mutation, 'Healthy wrap does not consume another baseline.')
  }
  if (['replay', 'restored'].includes(fixture.stage))
    assert.ok(fixture.baseline, 'Replay/restored requires the corresponding healthy baseline.')
  if (Object.hasOwn(fixture, 'mutation')) {
    assert.equal(fixture.stage, 'wrap', 'Only wrap executes the declared generation-RNG mutation.')
    assert.ok(fixture.baseline, 'An installed mutation requires a healthy wrap baseline.')
    exactKeys(fixture.mutation, ['module', 'originalSha256', 'mutatedSha256'])
    assert.equal(
      fixture.mutation.module,
      fixture.objective === 'anima' ? 'anima_euler.py' : 'inference.py',
    )
    sha(fixture.mutation.originalSha256)
    sha(fixture.mutation.mutatedSha256)
    assert.notEqual(fixture.mutation.originalSha256, fixture.mutation.mutatedSha256)
  }
  return plan
}

function admissionFrozen(row) {
  assert.ok(row && typeof row.id === 'string' && row.id.length > 0, 'Queue identity is required.')
  const serialized = Object.hasOwn(row, 'frozen_payload_json')
  assert.notEqual(
    serialized,
    Object.hasOwn(row, 'frozen'),
    'Use exactly one captured queue payload.',
  )
  if (serialized) {
    assert.equal(typeof row.frozen_payload_json, 'string')
    return JSON.parse(row.frozen_payload_json)
  }
  return row.frozen
}

/** Random expectations use only the first admitted request; later rows never supply expected seeds. */
export function resolveSeedBoundaryPlan(plan, admitted) {
  assert.ok(plan && typeof plan === 'object')
  const original = literalPlan(
    plan.stage,
    plan.objective,
    plan.stage === 'replay' ? plan.fixedSeed : null,
  )
  const unresolved = plan.stage === 'random' && plan.baseSeed === null
  if (plan.stage !== 'random') assert.deepEqual(plan, original)
  else if (unresolved) assert.deepEqual(plan, original)
  assert.ok(Array.isArray(admitted))
  assert.equal(
    admitted.length,
    original.expectedAdmissions,
    'Exact planned admission count is required.',
  )
  assert.equal(
    new Set(admitted.map(({ id }) => id)).size,
    admitted.length,
    'Queue IDs must be unique.',
  )
  const first = admissionFrozen(admitted[0])
  const baseSeed = plan.stage === 'random' ? first.context?.sampling?.seed : original.fixedSeed
  uint32(baseSeed)
  const resolved =
    plan.stage === 'random'
      ? freeze({
          ...structuredClone(original),
          baseSeed,
          randomBaseSource: {
            kind: 'first-admitted-frozen-request',
            queueItemId: admitted[0].id,
            seed: baseSeed,
          },
          items: original.items.map((item) => ({
            ...structuredClone(item),
            seed: (baseSeed + item.iteration) % uint32Modulus,
          })),
        })
      : original
  if (!unresolved) assert.deepEqual(plan, resolved)
  for (const [index, row] of admitted.entries()) {
    const sampling = admissionFrozen(row)?.context?.sampling
    uint32(sampling?.seed)
    assert.equal(
      sampling.seed,
      resolved.items[index].seed,
      `Queue seed ${index} must follow the independent uint32 table.`,
    )
    assert.equal(sampling.requestedSeedPolicy, resolved.requestedSeedPolicy)
    assert.equal(sampling.seedBehavior, resolved.seedBehavior)
  }
  return resolved
}

function adapted(expected) {
  assert.ok(expected && typeof expected === 'object')
  uint32(expected.seed)
  assert.ok(['random', 'fixed'].includes(expected.requestedSeedPolicy))
  const objective = Object.hasOwn(expected, 'objective') ? expected.objective : 'anima'
  return {
    selected: oracle(objective),
    item: { ...structuredClone(expected), requestedSeedPolicy: 'fixed' },
  }
}

/**
 * Existing exact resources/prompts/native oracle is reused; only unsupported Random metadata is
 * adapted.
 */
export function assertSeedBoundaryFrozen(frozen, expectedItem, fixture) {
  const { selected, item } = adapted(expectedItem)
  assert.equal(frozen?.context?.sampling?.requestedSeedPolicy, expectedItem.requestedSeedPolicy)
  const captured = structuredClone(frozen)
  captured.context.sampling.requestedSeedPolicy = 'fixed'
  selected.assertDynamicBatchFrozen(captured, item, fixture)
}

export function assertSeedBoundaryConfiguration(config, expectedItem, fixture) {
  const { selected, item } = adapted(expectedItem)
  assert.equal(config?.sampling?.requestedSeedPolicy, expectedItem.requestedSeedPolicy)
  const captured = structuredClone(config)
  captured.sampling.requestedSeedPolicy = 'fixed'
  selected.assertDynamicBatchConfiguration(captured, item, fixture)
}

export function normalizeSeedBoundaryNativeInputs(frozen) {
  assert.ok(
    ['anima-txt2img', 'illustrious-txt2img'].includes(frozen?.kind),
    'Only the qualified txt2img operation can be normalized.',
  )
  return (frozen?.kind === 'anima-txt2img' ? anima : illustrious).normalizeDynamicNativeInputs(
    frozen,
  )
}

/** Random→Fixed replay changes policy only; behavior, actual seed and every native input remain. */
export function normalizeSeedBoundaryExecutionInputs(frozen, plan) {
  assert.equal(
    plan?.stage,
    'replay',
    'Only the declared Random→Fixed replay omits requested policy metadata.',
  )
  const normalized = normalizeSeedBoundaryNativeInputs(frozen)
  assert.ok(normalized.context.sampling && typeof normalized.context.sampling === 'object')
  assert.ok(['random', 'fixed'].includes(normalized.context.sampling.requestedSeedPolicy))
  delete normalized.context.sampling.requestedSeedPolicy
  return normalized
}
