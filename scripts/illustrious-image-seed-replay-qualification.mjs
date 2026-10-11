/** Finite image Random/replay oracle; no production planners, RNG or filesystem reads. */
import assert from 'node:assert/strict'
import {
  assertIllustriousDynamicImageConfiguration,
  assertIllustriousDynamicImageFrozen,
  assertIllustriousDynamicImagePixels,
  literalIllustriousDynamicImagePlan,
  normalizeIllustriousDynamicImageNativeInputs,
  validateIllustriousDynamicImageFixture,
} from './illustrious-dynamic-image-qualification.mjs'

const modulus = 0x1_0000_0000
function uint32(value) {
  assert.ok(Number.isSafeInteger(value) && value >= 0 && value < modulus)
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
function exactKeys(value, required) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  assert.deepEqual(Object.keys(value).sort(), [...required].sort())
}

/** Handwritten offsets0..7 are pair-major; later queue rows never supply expected seeds. */
export function literalIllustriousImageSeedReplayPlan(stage, objective, mode, replaySeed = null) {
  assert.ok(['random', 'replay'].includes(stage))
  if (stage === 'replay') uint32(replaySeed)
  else assert.equal(replaySeed, null)
  const exemplar = literalIllustriousDynamicImagePlan('baseline', objective, mode, 'per-prompt')
  const policy = stage === 'random' ? 'random' : 'fixed'
  const offsets = [0, 1, 2, 3, 4, 5, 6, 7]
  return freeze({
    ...structuredClone(exemplar),
    stage,
    requestedSeedPolicy: policy,
    fixedSeed: replaySeed,
    baseSeed: replaySeed,
    randomBaseSource: null,
    items: exemplar.items.map((item, index) => ({
      ...structuredClone(item),
      stage,
      baseSeed: replaySeed,
      seed: replaySeed === null ? null : (replaySeed + offsets[index]) % modulus,
      requestedSeedPolicy: policy,
    })),
  })
}

/** Reuse only the legacy image envelope's lexical source/resource containment checks. */
export function validateIllustriousImageSeedReplayFixture(fixture) {
  exactKeys(fixture, [
    'schemaVersion',
    'profile',
    'objective',
    'mode',
    'stage',
    'referenceFixture',
    'workerBaseline',
    'artifacts',
    'sourceImage',
    ...(fixture?.mode === 'outpaint' ? ['lamaSource'] : []),
    ...(fixture?.stage === 'replay' ? ['baseline', 'replaySeed'] : []),
  ])
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'illustrious-image-seed-replay')
  const plan = literalIllustriousImageSeedReplayPlan(
    fixture.stage,
    fixture.objective,
    fixture.mode,
    fixture.replaySeed ?? null,
  )
  const { baseline, replaySeed: _seed, ...image } = fixture
  // The legacy restored envelope validates a required pinned reference without opening it.
  validateIllustriousDynamicImageFixture({
    ...image,
    profile: 'illustrious-dynamic-image',
    stage: baseline ? 'restored' : 'baseline',
    ...(baseline ? { baseline } : {}),
  })
  return plan
}

function frozenOf(row) {
  assert.ok(row && typeof row.id === 'string' && row.id.length > 0)
  assert.notEqual(Object.hasOwn(row, 'frozen_payload_json'), Object.hasOwn(row, 'frozen'))
  if (Object.hasOwn(row, 'frozen_payload_json')) {
    assert.equal(typeof row.frozen_payload_json, 'string')
    return JSON.parse(row.frozen_payload_json)
  }
  return row.frozen
}
function resolvedRandomPlan(original, baseSeed, queueItemId) {
  uint32(baseSeed)
  assert.ok(typeof queueItemId === 'string' && queueItemId.length > 0)
  return freeze({
    ...structuredClone(original),
    baseSeed,
    randomBaseSource: { kind: 'first-admitted-frozen-request', queueItemId, seed: baseSeed },
    items: original.items.map((item, index) => ({
      ...structuredClone(item),
      baseSeed,
      seed: (baseSeed + [0, 1, 2, 3, 4, 5, 6, 7][index]) % modulus,
    })),
  })
}
function assertResolvedPlan(plan) {
  const original = literalIllustriousImageSeedReplayPlan(
    plan.stage,
    plan.objective,
    plan.mode,
    plan.stage === 'replay' ? plan.fixedSeed : null,
  )
  const expected =
    plan.stage === 'random'
      ? resolvedRandomPlan(original, plan.baseSeed, plan.randomBaseSource?.queueItemId)
      : original
  assert.deepEqual(plan, expected)
  return expected
}

export function resolveIllustriousImageSeedReplayPlan(plan, admitted) {
  const original = literalIllustriousImageSeedReplayPlan(
    plan.stage,
    plan.objective,
    plan.mode,
    plan.stage === 'replay' ? plan.fixedSeed : null,
  )
  if (plan.stage !== 'random' || plan.baseSeed === null) assert.deepEqual(plan, original)
  else assertResolvedPlan(plan)
  assert.ok(Array.isArray(admitted))
  assert.equal(admitted.length, 8)
  assert.equal(new Set(admitted.map(({ id }) => id)).size, 8)
  const first = frozenOf(admitted[0])
  const resolved =
    plan.stage === 'random'
      ? resolvedRandomPlan(original, first.context?.sampling?.seed, admitted[0].id)
      : original
  if (plan.baseSeed !== null) assert.deepEqual(plan, resolved)
  for (const [index, row] of admitted.entries()) {
    const sampling = frozenOf(row)?.context?.sampling
    uint32(sampling?.seed)
    assert.equal(
      sampling.seed,
      resolved.items[index].seed,
      `Seed ${index} must follow offsets0..7.`,
    )
    assert.equal(sampling.requestedSeedPolicy, resolved.requestedSeedPolicy)
    assert.equal(sampling.seedBehavior, 'per-prompt')
  }
  return resolved
}

/** Check the pinned Random producer and saved outcome before the first replay native launch. */
export function assertIllustriousImageSeedReplayBaseline({ baseline, fixture, plan }) {
  assert.equal(fixture.stage, 'replay')
  assert.deepEqual(plan, validateIllustriousImageSeedReplayFixture(fixture))
  assert.equal(baseline.status, 'passed')
  assert.equal(baseline.profile, fixture.profile)
  assert.equal(baseline.stage, 'random')
  assert.equal(baseline.objective, fixture.objective)
  const random = assertResolvedPlan(baseline.resolvedPlan)
  assert.equal(random.stage, 'random')
  assert.equal(random.objective, fixture.objective)
  assert.equal(random.mode, fixture.mode)
  assert.equal(
    random.baseSeed,
    fixture.replaySeed,
    'Numeric replay must use the pinned actual Random base.',
  )
  assert.equal(baseline.nativePhysicalExit?.confirmed, true)
  assert.equal(baseline.savedPackage?.acceptedLayers, 8)
  assert.equal(baseline.savedPackage?.sourceLayers, 1)
  assert.equal(baseline.savedPackage?.totalLayers, 9)
  assert.equal(baseline.savedPackage?.reopened, true)
  assert.equal(baseline.savedPackage?.lastActualSeedSnapshot, random.items.at(-1).seed)
  const observation = baseline.seedAdmissionObservation
  assert.equal(observation?.producer, 'Main node:crypto.randomBytes(4).readUInt32LE(0)')
  assert.equal(observation.outputSubstitution, false)
  assert.equal(observation.originalIdentityRestored, true)
  assert.equal(observation.calls.length, 1)
  assert.equal(observation.calls[0].seed, random.baseSeed)
  assert.equal(observation.calls[0].argumentCount, 1)
  assert.equal(observation.calls[0].byteSize, 4)
  assert.equal(observation.calls[0].synchronous, true)
  assert.equal(observation.firstAdmittedQueueItemId, random.randomBaseSource.queueItemId)
  assert.equal(baseline.admissions.length, 8)
  assert.equal(baseline.generations.length, 8)
  assert.equal(baseline.comparisons.length, 8)
  assert.equal(new Set(baseline.generations.map(({ queueItemId }) => queueItemId)).size, 8)
  for (const [index, generation] of baseline.generations.entries()) {
    assert.equal(generation.queueItemId, baseline.admissions[index].row.id)
    assert.deepEqual(generation.expectedItem, random.items[index])
    assert.equal(generation.accepted, true)
    assert.equal(generation.row.status, 'completed')
    assert.equal(generation.frozen.context.sampling.seed, random.items[index].seed)
    assert.equal(generation.frozen.workerJob.sampling.seed, random.items[index].seed)
    assert.equal(generation.frozen.context.sampling.requestedSeedPolicy, 'random')
    assert.equal(
      generation.provenance.generationConfiguration.sampling.requestedSeedPolicy,
      'random',
    )
    assert.equal(
      generation.provenance.generationConfiguration.sampling.actualSeed,
      random.items[index].seed,
    )
    assert.equal(baseline.comparisons[index].queueItemId, generation.queueItemId)
    assert.equal(baseline.comparisons[index].readOnly, true)
  }
  assert.equal(baseline.generations[0].queueItemId, random.randomBaseSource.queueItemId)
  return { pinnedRandomBaseSeed: random.baseSeed, allEightOwningResultsVerified: true }
}

function adaptedItem(expected) {
  uint32(expected?.baseSeed)
  const literal = literalIllustriousImageSeedReplayPlan(
    'replay',
    expected.objective,
    expected.mode,
    expected.baseSeed,
  )
  assert.ok(['random', 'replay'].includes(expected.stage))
  const index = literal.items.findIndex(
    (item) =>
      item.promptPairIndex === expected.promptPairIndex && item.iteration === expected.iteration,
  )
  assert.ok(index >= 0)
  const actual = {
    ...literal.items[index],
    stage: expected.stage,
    requestedSeedPolicy: expected.stage === 'random' ? 'random' : 'fixed',
  }
  assert.deepEqual(expected, actual)
  return literalIllustriousDynamicImagePlan(
    'baseline',
    expected.objective,
    expected.mode,
    'per-prompt',
  ).items[index]
}

/** Real seed/policy are checked first; the legacy DTO oracle only receives canonical metadata. */
export function assertIllustriousImageSeedReplayFrozen(frozen, expected, reference) {
  const canonical = adaptedItem(expected)
  assert.equal(frozen?.context?.sampling?.seed, expected.seed)
  assert.equal(frozen?.workerJob?.sampling?.seed, expected.seed)
  assert.equal(frozen?.context?.sampling?.requestedSeedPolicy, expected.requestedSeedPolicy)
  const value = structuredClone(frozen)
  value.context.sampling.seed = canonical.seed
  value.workerJob.sampling.seed = canonical.seed
  value.context.sampling.requestedSeedPolicy = 'fixed'
  assertIllustriousDynamicImageFrozen(value, canonical, reference)
}
export function assertIllustriousImageSeedReplayConfiguration(config, expected, reference) {
  const canonical = adaptedItem(expected)
  assert.equal(config?.sampling?.actualSeed, expected.seed)
  assert.equal(config?.sampling?.requestedSeedPolicy, expected.requestedSeedPolicy)
  const value = structuredClone(config)
  value.sampling.actualSeed = canonical.seed
  value.sampling.requestedSeedPolicy = 'fixed'
  assertIllustriousDynamicImageConfiguration(value, canonical, reference)
}

export function normalizeIllustriousImageSeedReplayNativeInputs(frozen) {
  return normalizeIllustriousDynamicImageNativeInputs(frozen)
}
/** Only a declared numeric replay omits requested policy; actual seed/behavior remain exact. */
export function normalizeIllustriousImageSeedReplayReferenceInputs(frozen, { fixture, plan }) {
  const value = normalizeIllustriousImageSeedReplayNativeInputs(frozen)
  assert.equal(fixture.stage, 'replay')
  assert.equal(plan.stage, 'replay')
  assert.ok(['random', 'fixed'].includes(value.context.sampling.requestedSeedPolicy))
  delete value.context.sampling.requestedSeedPolicy
  return value
}

/** Same-prompt seed contrasts only; different prompt pairs have different seeds. */
export function assertIllustriousImageSeedReplayPixels(generations, plan) {
  assertResolvedPlan(plan)
  assert.equal(generations.length, 8)
  const canonical = literalIllustriousDynamicImagePlan(
    'baseline',
    plan.objective,
    plan.mode,
    'per-prompt',
  )
  const adapted = generations.map((generation, index) => {
    assert.deepEqual(generation.expectedItem, plan.items[index])
    assert.equal(generation.frozen.context.sampling.seed, plan.items[index].seed)
    assert.equal(generation.frozen.workerJob.sampling.seed, plan.items[index].seed)
    assert.equal(generation.frozen.context.sampling.requestedSeedPolicy, plan.requestedSeedPolicy)
    return { ...generation, expectedItem: canonical.items[index] }
  })
  return assertIllustriousDynamicImagePixels(adapted, canonical)
}
