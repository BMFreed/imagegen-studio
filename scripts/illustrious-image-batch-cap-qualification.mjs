/** Independent finite image32/prefix tables; no production planner, RNG or filesystem input. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  assertIllustriousDynamicImageConfiguration,
  assertIllustriousDynamicImageFrozen,
  literalIllustriousDynamicImagePlan,
  normalizeIllustriousDynamicImageNativeInputs,
  validateIllustriousDynamicImageFixture,
} from './illustrious-dynamic-image-qualification.mjs'

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
function exactKeys(value, keys) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort())
}

export function literalIllustriousImageBatchCapPlan(stage, objective, mode) {
  assert.ok(['boundary', 'prefix'].includes(stage))
  const boundary = stage === 'boundary'
  const seedBehavior = boundary ? 'per-iteration' : 'per-prompt'
  const exemplar = literalIllustriousDynamicImagePlan('baseline', objective, mode, seedBehavior)
  const items = (boundary ? boundaryTuples : prefixTuples).map(
    ([promptPairIndex, iteration, seed]) => ({
      ...structuredClone(exemplar.items[promptPairIndex * 2]),
      stage,
      promptPairIndex,
      iteration,
      seed,
    }),
  )
  return freeze({
    ...structuredClone(exemplar),
    stage,
    iterations: boundary ? 8 : 2,
    maxPrompts: boundary ? 4 : 3,
    maxJobs: 32,
    truncated: !boundary,
    boundaryBaselineIndices: boundary ? null : [...baselineIndices],
    items,
    expectedAdmissions: boundary ? 32 : 6,
    expectedCompletions: boundary ? 32 : 6,
  })
}
export function validateIllustriousImageBatchCapFixture(fixture) {
  exactKeys(fixture, [
    'schemaVersion',
    'profile',
    'stage',
    'objective',
    'mode',
    'referenceFixture',
    'workerBaseline',
    'artifacts',
    'sourceImage',
    ...(fixture?.mode === 'outpaint' ? ['lamaSource'] : []),
    ...(fixture?.stage === 'prefix' ? ['baseline'] : []),
  ])
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'illustrious-image-batch-cap')
  const plan = literalIllustriousImageBatchCapPlan(fixture.stage, fixture.objective, fixture.mode)
  const { baseline, ...image } = fixture
  validateIllustriousDynamicImageFixture({
    ...image,
    profile: 'illustrious-dynamic-image',
    stage: 'baseline',
  })
  if (fixture.stage === 'prefix') {
    exactKeys(baseline, ['reportPath', 'reportSha256'])
    assert.ok(
      path.isAbsolute(baseline.reportPath) &&
        path.resolve(baseline.reportPath) === baseline.reportPath,
    )
    assert.ok(
      baseline.reportPath.startsWith(
        path.join(homedir(), '.codex/artifacts/imagegen-studio') + path.sep,
      ),
    )
    assert.match(baseline.reportSha256, /^[a-f0-9]{64}$/)
    assert.ok(
      baseline.reportPath !== fixture.artifacts &&
        !baseline.reportPath.startsWith(fixture.artifacts + path.sep) &&
        !fixture.artifacts.startsWith(baseline.reportPath + path.sep),
    )
  }
  return plan
}
function assertPlan(plan) {
  assert.deepEqual(plan, literalIllustriousImageBatchCapPlan(plan.stage, plan.objective, plan.mode))
}
function frozenOf(row) {
  assert.ok(typeof row?.id === 'string' && row.id.length > 0)
  assert.notEqual(Object.hasOwn(row, 'frozen'), Object.hasOwn(row, 'frozen_payload_json'))
  return Object.hasOwn(row, 'frozen') ? row.frozen : JSON.parse(row.frozen_payload_json)
}
export function resolveIllustriousImageBatchCapPlan(plan, admitted) {
  assertPlan(plan)
  assert.equal(admitted.length, plan.expectedAdmissions)
  assert.equal(new Set(admitted.map(({ id }) => id)).size, plan.expectedAdmissions)
  for (const [index, row] of admitted.entries()) {
    const frozen = frozenOf(row)
    assert.equal(frozen.context?.sampling?.seed, plan.items[index].seed)
    assert.equal(frozen.workerJob?.sampling?.seed, plan.items[index].seed)
    assert.equal(frozen.context?.sampling?.requestedSeedPolicy, 'fixed')
    assert.equal(frozen.context?.sampling?.seedBehavior, plan.seedBehavior)
  }
  return plan
}
function canonicalItem(expected) {
  const plan = literalIllustriousImageBatchCapPlan(
    expected?.stage,
    expected?.objective,
    expected?.mode,
  )
  const item = plan.items.find(
    ({ promptPairIndex, iteration }) =>
      promptPairIndex === expected.promptPairIndex && iteration === expected.iteration,
  )
  assert.deepEqual(
    expected,
    item,
    'Exact image-cap tuple membership is required before metadata projection.',
  )
  return literalIllustriousDynamicImagePlan(
    'baseline',
    expected.objective,
    expected.mode,
    expected.seedBehavior,
  ).items[expected.promptPairIndex * 2]
}
export function assertIllustriousImageBatchCapFrozen(frozen, expected, reference) {
  const canonical = canonicalItem(expected)
  assert.equal(frozen?.context?.sampling?.seed, expected.seed)
  assert.equal(frozen?.workerJob?.sampling?.seed, expected.seed)
  assert.equal(frozen?.context?.sampling?.seedBehavior, expected.seedBehavior)
  const value = structuredClone(frozen)
  value.context.sampling.seed = canonical.seed
  value.workerJob.sampling.seed = canonical.seed
  assertIllustriousDynamicImageFrozen(value, canonical, reference)
}
export function assertIllustriousImageBatchCapConfiguration(config, expected, reference) {
  const canonical = canonicalItem(expected)
  assert.equal(config?.sampling?.actualSeed, expected.seed)
  assert.equal(config?.sampling?.seedBehavior, expected.seedBehavior)
  const value = structuredClone(config)
  value.sampling.actualSeed = canonical.seed
  assertIllustriousDynamicImageConfiguration(value, canonical, reference)
}
export const normalizeIllustriousImageBatchCapNativeInputs =
  normalizeIllustriousDynamicImageNativeInputs
/** Prefix comparisons omit only the explicitly changed seed-behavior metadata and document IDs. */
export function normalizeIllustriousImageBatchCapExecutionInputs(frozen, plan) {
  assertPlan(plan)
  assert.equal(plan.stage, 'prefix')
  const value = normalizeIllustriousImageBatchCapNativeInputs(frozen)
  assert.equal(value.context.sampling.requestedSeedPolicy, 'fixed')
  assert.ok(['per-iteration', 'per-prompt'].includes(value.context.sampling.seedBehavior))
  delete value.context.sampling.seedBehavior
  return value
}
export function assertIllustriousImageBatchCapBaseline({ baseline, fixture, plan, reference }) {
  assert.equal(fixture.stage, 'prefix')
  assert.deepEqual(plan, validateIllustriousImageBatchCapFixture(fixture))
  const boundary = literalIllustriousImageBatchCapPlan('boundary', fixture.objective, fixture.mode)
  assert.equal(baseline.status, 'passed')
  assert.equal(baseline.profile, fixture.profile)
  assert.equal(baseline.stage, 'boundary')
  assert.equal(baseline.objective, fixture.objective)
  assert.deepEqual(baseline.literalPlan, boundary)
  assert.deepEqual(baseline.resolvedPlan, boundary)
  assert.equal(baseline.nativePhysicalExit?.confirmed, true)
  assert.equal(baseline.savedPackage?.acceptedLayers, 32)
  assert.equal(baseline.savedPackage?.sourceLayers, 1)
  assert.equal(baseline.savedPackage?.totalLayers, 33)
  assert.equal(baseline.savedPackage?.reopened, true)
  assert.equal(baseline.savedPackage?.lastActualSeedSnapshot, 7)
  assert.equal(baseline.refusal33?.unchanged, true)
  for (const phase of ['before', 'after']) {
    assert.equal(baseline.refusal33[phase].projectCandidateCount, 32)
    assert.equal(baseline.refusal33[phase].layerCount, 1)
  }
  assert.equal(baseline.refusal33.ui?.reviewCount, 32)
  assert.equal(baseline.refusal33.ui?.mainStateObservation?.value?.error?.code, 'BATCH_TOO_LARGE')
  assert.equal(baseline.admissions.length, 32)
  assert.equal(baseline.generations.length, 32)
  assert.equal(baseline.comparisons.length, 32)
  assert.equal(new Set(baseline.generations.map(({ queueItemId }) => queueItemId)).size, 32)
  for (const [index, generation] of baseline.generations.entries()) {
    assert.deepEqual(generation.expectedItem, boundary.items[index])
    assert.equal(generation.accepted, true)
    assert.equal(generation.row.status, 'completed')
    assert.equal(generation.queueItemId, baseline.admissions[index].row.id)
    assert.deepEqual(generation.frozen, frozenOf(baseline.admissions[index].row))
    assert.equal(baseline.comparisons[index].queueItemId, generation.queueItemId)
    assert.equal(baseline.comparisons[index].readOnly, true)
    assert.match(generation.dimensions.pixelSha256, /^[a-f0-9]{64}$/)
    assertIllustriousImageBatchCapFrozen(generation.frozen, boundary.items[index], reference)
    assertIllustriousImageBatchCapConfiguration(
      generation.provenance.generationConfiguration,
      boundary.items[index],
      reference,
    )
  }
  return boundary
}
