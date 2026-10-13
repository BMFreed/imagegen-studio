/** Independent Anima image32/prefix tables and whole DTOs; no producer planner/compiler/RNG. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  assertAnimaDynamicImageConfiguration,
  assertAnimaDynamicImageFrozen,
  literalAnimaDynamicImagePlan,
  validateAnimaDynamicImageFixture,
} from './anima-dynamic-image-qualification.mjs'

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

export const animaImageBatchCapBaselineIndices = Object.freeze([0, 1, 10, 11, 20, 21])
const root = path.join(homedir(), '.codex/artifacts/imagegen-studio')
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

/** Four independently authored weighted pairs; boundary and selected-prefix seeds are literal. */
export function literalAnimaImageBatchCapPlan(stage, mode) {
  assert.ok(['boundary', 'prefix'].includes(stage), 'Unknown finite Anima image cap stage.')
  const boundary = stage === 'boundary'
  const seedBehavior = boundary ? 'per-iteration' : 'per-prompt'
  const exemplar = literalAnimaDynamicImagePlan('baseline', mode)
  const items = (boundary ? boundaryTuples : prefixTuples).map(
    ([promptPairIndex, iteration, seed]) => ({
      ...structuredClone(exemplar.items[promptPairIndex * 2]),
      stage,
      promptPairIndex,
      iteration,
      seed,
      seedBehavior,
    }),
  )
  return freeze({
    ...structuredClone(exemplar),
    stage,
    iterations: boundary ? 8 : 2,
    maxPrompts: boundary ? 4 : 3,
    maxJobs: 32,
    truncated: !boundary,
    seedBehavior,
    boundaryBaselineIndices: boundary ? null : [...animaImageBatchCapBaselineIndices],
    items,
    expectedAdmissions: boundary ? 32 : 6,
    expectedCompletions: boundary ? 32 : 6,
  })
}
export function validateAnimaImageBatchCapFixture(fixture) {
  exactKeys(fixture, [
    'schemaVersion',
    'profile',
    'stage',
    'mode',
    'referenceFixture',
    'workerBaseline',
    'artifacts',
    'sourceImage',
    ...(fixture?.mode === 'outpaint' ? ['lamaSource'] : []),
    ...(fixture?.stage === 'prefix' ? ['baseline'] : []),
  ])
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'anima-image-batch-cap')
  const plan = literalAnimaImageBatchCapPlan(fixture.stage, fixture.mode)
  const { baseline, ...image } = fixture
  validateAnimaDynamicImageFixture({
    ...image,
    profile: 'anima-dynamic-image',
    stage: 'baseline',
  })
  if (fixture.stage === 'prefix') {
    exactKeys(baseline, ['reportPath', 'reportSha256'])
    assert.equal(typeof baseline.reportPath, 'string')
    assert.ok(
      path.isAbsolute(baseline.reportPath) &&
        path.resolve(baseline.reportPath) === baseline.reportPath,
    )
    assert.ok(baseline.reportPath.startsWith(root + path.sep))
    assert.match(baseline.reportSha256, /^[a-f0-9]{64}$/)
    assert.ok(
      baseline.reportPath !== fixture.artifacts &&
        !baseline.reportPath.startsWith(fixture.artifacts + path.sep) &&
        !fixture.artifacts.startsWith(baseline.reportPath + path.sep),
      'Own boundary evidence must remain outside the prefix payload.',
    )
  }
  return plan
}
function assertPlan(plan) {
  assert.deepEqual(plan, literalAnimaImageBatchCapPlan(plan.stage, plan.mode))
}
function frozenOf(row) {
  assert.ok(typeof row?.id === 'string' && row.id.length > 0)
  assert.notEqual(Object.hasOwn(row, 'frozen'), Object.hasOwn(row, 'frozen_payload_json'))
  return Object.hasOwn(row, 'frozen') ? row.frozen : JSON.parse(row.frozen_payload_json)
}
export function resolveAnimaImageBatchCapPlan(plan, admitted) {
  assertPlan(plan)
  assert.equal(admitted.length, plan.expectedAdmissions)
  assert.equal(new Set(admitted.map(({ id }) => id)).size, plan.expectedAdmissions)
  for (const [index, row] of admitted.entries()) {
    const frozen = frozenOf(row),
      item = plan.items[index]
    assert.deepEqual(frozen.context?.prompts, item.prompts)
    assert.deepEqual(frozen.workerJob?.prompts, item.compiledPrompts)
    assert.equal(frozen.context?.sampling?.seed, item.seed)
    assert.equal(frozen.context?.sampling?.requestedSeedPolicy, 'fixed')
    assert.equal(frozen.context?.sampling?.seedBehavior, plan.seedBehavior)
    assert.deepEqual(frozen.workerJob?.sampling, literalAnimaImageBatchCapNativePlan(item.seed))
  }
  return plan
}
export function assertAnimaImageBatchCapItem(item) {
  const plan = literalAnimaImageBatchCapPlan(item?.stage, item?.mode)
  const member = plan.items.find(
    (entry) => entry.promptPairIndex === item.promptPairIndex && entry.iteration === item.iteration,
  )
  assert.ok(member, 'Exact image-cap tuple membership is required.')
  assert.deepEqual(item, member, 'Exact image-cap tuple membership is required.')
}
/** Exact Euler image posterior domains for the finite0…7 schedule; no seed projection. */
export function literalAnimaImageBatchCapNativePlan(seed) {
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 7)
  const posterior = [
    2654435769, 2654435768, 2654435771, 2654435770, 2654435773, 2654435772, 2654435775, 2654435774,
  ]
  return freeze({
    beginIndex: 1,
    guidanceScale: 4,
    height: 256,
    initialSigma: 0.8571428571428571,
    mode: 'img2img',
    posteriorSeed: posterior[seed],
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
export function assertAnimaImageBatchCapFrozen(frozen, item, reference) {
  return assertAnimaDynamicImageFrozen(frozen, item, reference, {
    assertExpectedItem: assertAnimaImageBatchCapItem,
    nativePlanForSeed: literalAnimaImageBatchCapNativePlan,
  })
}
export function assertAnimaImageBatchCapConfiguration(config, item, reference) {
  return assertAnimaDynamicImageConfiguration(config, item, reference, {
    assertExpectedItem: assertAnimaImageBatchCapItem,
  })
}
/** Clone the entire outer DTO, including schemaVersion; omit exactly three owning identifiers. */
export function normalizeAnimaImageBatchCapNativeInputs(frozen) {
  assert.ok(['anima-img2img', 'anima-outpaint'].includes(frozen?.kind))
  assert.equal(frozen?.context?.sampling?.animaMethod, 'euler')
  assert.equal(frozen?.workerJob?.sampling?.scheduler, 'euler')
  const value = structuredClone(frozen)
  delete value.originRequestId
  delete value.context.documentId
  delete value.context.documentRevision
  return value
}
/** Prefix numeric matching additionally omits only the known persisted authoring behavior. */
export function normalizeAnimaImageBatchCapExecutionInputs(frozen, plan) {
  assertPlan(plan)
  assert.equal(plan.stage, 'prefix')
  const value = normalizeAnimaImageBatchCapNativeInputs(frozen)
  assert.equal(value.context.sampling.requestedSeedPolicy, 'fixed')
  assert.ok(['per-iteration', 'per-prompt'].includes(value.context.sampling.seedBehavior))
  delete value.context.sampling.seedBehavior
  return value
}
export function assertAnimaImageBatchCapBaseline({ baseline, fixture, plan, reference }) {
  assert.equal(fixture.stage, 'prefix')
  assert.deepEqual(plan, validateAnimaImageBatchCapFixture(fixture))
  const boundary = literalAnimaImageBatchCapPlan('boundary', fixture.mode)
  assert.equal(baseline.status, 'passed')
  assert.equal(baseline.profile, fixture.profile)
  assert.equal(baseline.stage, 'boundary')
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
    assert.equal(generation.qualification.beforeExplicitAdd, true)
    assert.deepEqual(
      generation.qualification.normalizedInputs,
      normalizeAnimaImageBatchCapNativeInputs(generation.frozen),
    )
    assertAnimaImageBatchCapFrozen(generation.frozen, boundary.items[index], reference)
    assertAnimaImageBatchCapConfiguration(
      generation.provenance.generationConfiguration,
      boundary.items[index],
      reference,
    )
  }
  return boundary
}
