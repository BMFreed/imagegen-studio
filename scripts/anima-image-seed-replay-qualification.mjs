/** Independent arbitrary-uint32 Anima image Random/Fixed oracle; no app planner/compiler/RNG. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  assertAnimaDynamicImageConfiguration as assertRecipe,
  assertAnimaDynamicImageFrozen as assertEnvelope,
} from './anima-dynamic-image-qualification.mjs'
import {
  literalAnimaDynamicImagePerPromptPlan as fixedPlan,
  normalizeAnimaDynamicImagePerPromptNativeInputs as normalize,
  validateAnimaDynamicImagePerPromptFixture as validateImage,
} from './anima-dynamic-image-per-prompt-qualification.mjs'
export { expectedAnimaDynamicImageLoraStack } from './anima-dynamic-image-qualification.mjs'
const modulus = 4294967296
const offsets = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7])
export const animaImageSeedReplayBaselineSources = Object.freeze([
  'scripts/installed-dynamic-batch-driver.mjs',
  'scripts/anima-image-seed-replay-profile.mjs',
  'scripts/anima-image-seed-replay-qualification.mjs',
])
function uint32(value) {
  assert.ok(Number.isSafeInteger(value) && value >= 0 && value < modulus, 'Expected uint32.')
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
function exactKeys(value, fields) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort())
}
export function literalAnimaImageSeedReplayPlan(stage, mode, replaySeed = null) {
  assert.ok(['random', 'replay', 'crash', 'reuse'].includes(stage))
  if (stage === 'random') assert.equal(replaySeed, null)
  else uint32(replaySeed)
  const source = fixedPlan('per-prompt', mode)
  const policy = stage === 'random' ? 'random' : stage === 'reuse' ? 'reuse' : 'fixed'
  const items =
    stage === 'crash'
      ? [0, 1, 2].map((iteration) => ({ ...structuredClone(source.items[0]), iteration }))
      : source.items
  return freeze({
    ...structuredClone(source),
    stage,
    requestedSeedPolicy: policy,
    fixedSeed: stage === 'reuse' ? null : replaySeed,
    baseSeed: replaySeed,
    randomBaseSource: null,
    ...(stage === 'crash'
      ? {
          iterations: 3,
          maxPrompts: 1,
          sourcePrompts: structuredClone(source.items[0].prompts),
          expectedAdmissions: 3,
          expectedCompletions: 1,
          expectedCanceled: 2,
        }
      : {}),
    items: items.map((item, index) => ({
      ...structuredClone(item),
      stage,
      baseSeed: replaySeed,
      seed: replaySeed === null ? null : (replaySeed + offsets[index]) % modulus,
      requestedSeedPolicy: policy,
    })),
  })
}
export function validateAnimaImageSeedReplayFixture(fixture) {
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
    ...(fixture?.stage === 'replay' ? ['baseline', 'replaySeed'] : []),
    ...(['crash', 'reuse'].includes(fixture?.stage)
      ? ['baseline', 'baseSeed', 'baselineSourceSnapshots']
      : []),
    ...(fixture?.stage === 'reuse' ? ['crashSource'] : []),
  ])
  assert.equal(fixture.profile, 'anima-image-seed-replay')
  const plan = literalAnimaImageSeedReplayPlan(
    fixture.stage,
    fixture.mode,
    fixture.replaySeed ?? fixture.baseSeed ?? null,
  )
  const common = { ...fixture, profile: 'anima-dynamic-image-per-prompt', stage: 'numeric-control' }
  delete common.baseline
  delete common.replaySeed
  delete common.baseSeed
  delete common.baselineSourceSnapshots
  delete common.crashSource
  validateImage(common)
  const checkReference = (descriptor, fields) => {
    exactKeys(descriptor, fields)
    const filename = descriptor[fields[0]]
    assert.ok(
      typeof filename === 'string' &&
        path.isAbsolute(filename) &&
        path.resolve(filename) === filename,
    )
    assert.ok(
      filename.startsWith(path.join(homedir(), '.codex/artifacts/imagegen-studio') + path.sep),
    )
    assert.ok(
      filename !== fixture.artifacts &&
        !filename.startsWith(fixture.artifacts + path.sep) &&
        !fixture.artifacts.startsWith(filename + path.sep),
    )
    assert.match(descriptor[fields[1]], /^[a-f0-9]{64}$/)
  }
  if (fixture.stage !== 'random') checkReference(fixture.baseline, ['reportPath', 'reportSha256'])
  if (['crash', 'reuse'].includes(fixture.stage)) {
    exactKeys(fixture.baselineSourceSnapshots, animaImageSeedReplayBaselineSources)
    for (const descriptor of Object.values(fixture.baselineSourceSnapshots))
      checkReference(descriptor, ['path', 'sha256'])
  }
  if (fixture.stage === 'reuse') checkReference(fixture.crashSource, ['reportPath', 'reportSha256'])
  return plan
}
function resolvedRandom(original, baseSeed, queueItemId) {
  uint32(baseSeed)
  assert.ok(typeof queueItemId === 'string' && queueItemId.length > 0)
  return freeze({
    ...structuredClone(original),
    baseSeed,
    randomBaseSource: { kind: 'first-admitted-frozen-request', queueItemId, seed: baseSeed },
    items: original.items.map((item, index) => ({
      ...structuredClone(item),
      baseSeed,
      seed: (baseSeed + offsets[index]) % modulus,
    })),
  })
}
export function assertAnimaImageSeedReplayResolvedPlan(plan) {
  const original = literalAnimaImageSeedReplayPlan(
    plan.stage,
    plan.mode,
    plan.stage === 'random' ? null : plan.baseSeed,
  )
  const expected =
    plan.stage === 'random'
      ? resolvedRandom(original, plan.baseSeed, plan.randomBaseSource?.queueItemId)
      : original
  assert.deepEqual(plan, expected)
  return expected
}
function frozenOf(row) {
  assert.ok(typeof row?.id === 'string' && row.id.length > 0)
  assert.equal(typeof row.frozen_payload_json, 'string')
  return JSON.parse(row.frozen_payload_json)
}
export function resolveAnimaImageSeedReplayPlan(plan, admitted) {
  const original = literalAnimaImageSeedReplayPlan(
    plan.stage,
    plan.mode,
    plan.stage === 'random' ? null : plan.baseSeed,
  )
  if (plan.stage === 'random' && plan.baseSeed !== null)
    assertAnimaImageSeedReplayResolvedPlan(plan)
  else assert.deepEqual(plan, original)
  assert.equal(admitted.length, original.expectedAdmissions)
  assert.equal(new Set(admitted.map(({ id }) => id)).size, original.expectedAdmissions)
  const first = frozenOf(admitted[0])
  const resolved =
    plan.stage === 'random'
      ? resolvedRandom(original, first.context?.sampling?.seed, admitted[0].id)
      : original
  if (plan.baseSeed !== null) assert.deepEqual(plan, resolved)
  for (const [index, row] of admitted.entries()) {
    const frozen = frozenOf(row),
      item = resolved.items[index]
    assert.deepEqual(frozen.context?.prompts, item.prompts)
    assert.deepEqual(frozen.workerJob?.prompts, item.compiledPrompts)
    assert.equal(frozen.context?.sampling?.seed, item.seed)
    assert.equal(frozen.context?.sampling?.requestedSeedPolicy, item.requestedSeedPolicy)
    assert.equal(frozen.context?.sampling?.seedBehavior, 'per-prompt')
    assert.deepEqual(frozen.workerJob?.sampling, literalAnimaImageSeedReplayNativePlan(item.seed))
  }
  return resolved
}
/** Full membership is established before any raw/native/portable projection or normalization. */
export function assertAnimaImageSeedReplayItem(item) {
  uint32(item?.baseSeed)
  assert.ok(['random', 'replay', 'crash', 'reuse'].includes(item.stage))
  const canonical = literalAnimaImageSeedReplayPlan(
    item.stage === 'random' ? 'replay' : item.stage,
    item.mode,
    item.baseSeed,
  ).items.find(
    (entry) => entry.promptPairIndex === item.promptPairIndex && entry.iteration === item.iteration,
  )
  assert.ok(canonical, 'Independent full-pair/iteration/base/actual-seed membership is required.')
  assert.deepEqual(
    item,
    {
      ...canonical,
      stage: item.stage,
      requestedSeedPolicy:
        item.stage === 'random' ? 'random' : item.stage === 'reuse' ? 'reuse' : 'fixed',
    },
    'Independent full-pair/iteration/base/actual-seed membership is required.',
  )
}
export function literalAnimaImageSeedReplayNativePlan(seed) {
  uint32(seed)
  // Independent integer-domain arithmetic, without importing the production sampling compiler.
  const posteriorSeed = Number(BigInt(seed) ^ 0x9e3779b9n)
  return freeze({
    beginIndex: 1,
    guidanceScale: 4,
    height: 256,
    initialSigma: 0.8571428571428571,
    mode: 'img2img',
    posteriorSeed,
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
export function assertAnimaImageSeedReplayFrozen(frozen, item, reference) {
  return assertEnvelope(frozen, item, reference, {
    assertExpectedItem: assertAnimaImageSeedReplayItem,
    nativePlanForSeed: literalAnimaImageSeedReplayNativePlan,
  })
}
export function assertAnimaImageSeedReplayConfiguration(config, item, reference) {
  return assertRecipe(config, item, reference, {
    assertExpectedItem: assertAnimaImageSeedReplayItem,
  })
}
export const normalizeAnimaImageSeedReplayNativeInputs = normalize
/** Keep seedBehavior, all numerical seed domains and schemaVersion; only policy differs. */
export function normalizeAnimaImageSeedReplayReferenceInputs(frozen) {
  const value = normalize(frozen)
  assert.equal(value.context.sampling.seedBehavior, 'per-prompt')
  assert.ok(['random', 'fixed', 'reuse'].includes(value.context.sampling.requestedSeedPolicy))
  delete value.context.sampling.requestedSeedPolicy
  return value
}
export function assertAnimaImageSeedReplayBaseline({ baseline, fixture, plan, reference }) {
  assert.ok(['replay', 'crash', 'reuse'].includes(fixture.stage))
  assert.deepEqual(plan, validateAnimaImageSeedReplayFixture(fixture))
  assert.equal(baseline.status, 'passed')
  assert.equal(baseline.profile, fixture.profile)
  const expectedStage = fixture.stage === 'replay' ? 'random' : 'replay'
  assert.equal(baseline.stage, expectedStage)
  assert.deepEqual(
    baseline.literalPlan,
    literalAnimaImageSeedReplayPlan(
      expectedStage,
      fixture.mode,
      expectedStage === 'random' ? null : fixture.baseSeed,
    ),
  )
  const resolved = assertAnimaImageSeedReplayResolvedPlan(baseline.resolvedPlan)
  assert.equal(resolved.stage, expectedStage)
  assert.equal(resolved.mode, fixture.mode)
  assert.equal(
    resolved.baseSeed,
    fixture.replaySeed ?? fixture.baseSeed,
    'Replay uses actual Random base, not last completed seed.',
  )
  assert.equal(baseline.nativePhysicalExit?.confirmed, true)
  for (const key of ['admissions', 'generations', 'comparisons'])
    assert.equal(baseline[key].length, 8)
  assert.equal(baseline.savedPackage?.acceptedLayers, 8)
  assert.equal(baseline.savedPackage?.sourceLayers, 1)
  assert.equal(baseline.savedPackage?.totalLayers, 9)
  assert.equal(baseline.savedPackage?.reopened, true)
  assert.equal(baseline.savedPackage?.lastActualSeedSnapshot, resolved.items.at(-1).seed)
  if (expectedStage === 'random') {
    const observed = baseline.seedAdmissionObservation
    assert.equal(observed?.producer, 'Main node:crypto.randomBytes(4).readUInt32LE(0)')
    assert.equal(observed.outputSubstitution, false)
    assert.equal(observed.originalIdentityRestored, true)
    assert.equal(observed.calls.length, 1)
    const call = observed.calls[0]
    assert.equal(call.seed, resolved.baseSeed)
    assert.equal(call.argumentCount, 1)
    assert.equal(call.byteSize, 4)
    assert.equal(call.synchronous, true)
    assert.ok(typeof call.stack === 'string' && /prepareAnimaGenerationInternal/.test(call.stack))
    assert.equal(observed.firstAdmittedQueueItemId, resolved.randomBaseSource.queueItemId)
  }
  assert.equal(new Set(baseline.generations.map(({ queueItemId }) => queueItemId)).size, 8)
  for (const [index, generation] of baseline.generations.entries()) {
    const item = resolved.items[index]
    assert.deepEqual(generation.expectedItem, item)
    assert.equal(generation.queueItemId, baseline.admissions[index].row.id)
    assert.deepEqual(generation.frozen, frozenOf(baseline.admissions[index].row))
    assert.equal(generation.row.status, 'completed')
    assert.equal(generation.accepted, true)
    assert.equal(baseline.comparisons[index].queueItemId, generation.queueItemId)
    assert.equal(baseline.comparisons[index].readOnly, true)
    assert.match(generation.dimensions.pixelSha256, /^[a-f0-9]{64}$/)
    assertAnimaImageSeedReplayFrozen(generation.frozen, item, reference)
    assertAnimaImageSeedReplayConfiguration(
      generation.provenance.generationConfiguration,
      item,
      reference,
    )
  }
  if (expectedStage === 'random')
    assert.equal(baseline.generations[0].queueItemId, resolved.randomBaseSource.queueItemId)
  return {
    [expectedStage === 'random' ? 'pinnedRandomBaseSeed' : 'pinnedFixedBaseSeed']:
      resolved.baseSeed,
    allEightOwningResultsVerified: true,
  }
}
/** Adjacent seeds within each literal weighted pair only; no cross-pair/weight/quality claim. */
export function assertAnimaImageSeedReplayPixels(generations, plan) {
  assertAnimaImageSeedReplayResolvedPlan(plan)
  assert.equal(generations.length, 8)
  const common = generations.map(({ frozen }) => {
    const value = normalize(frozen)
    delete value.context.prompts
    delete value.workerJob.prompts
    delete value.context.sampling.seed
    for (const key of ['seed', 'stepSeed', 'posteriorSeed']) delete value.workerJob.sampling[key]
    return value
  })
  for (const [index, generation] of generations.entries()) {
    assert.deepEqual(generation.expectedItem, plan.items[index])
    assert.deepEqual(common[index], common[0])
    assert.equal(generation.rgba.length, 65536 * 4)
  }
  const contrasts = []
  for (const [leftIndex, rightIndex] of [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
  ]) {
    const left = generations[leftIndex],
      right = generations[rightIndex]
    assert.deepEqual(left.frozen.context.prompts, right.frozen.context.prompts)
    assert.deepEqual(left.frozen.workerJob.prompts, right.frozen.workerJob.prompts)
    let changed = 0
    for (let pixel = 0; pixel < 65536; pixel++) {
      const at = pixel * 4
      assert.equal(left.rgba[at + 3], right.rgba[at + 3])
      if (left.rgba[at + 3] && [0, 1, 2].some((c) => left.rgba[at + c] !== right.rgba[at + c]))
        changed++
    }
    assert.ok(changed > 0, 'These adjacent actual seeds differ in visible RGB.')
    contrasts.push({ leftIndex, rightIndex, visibleChangedPixels: changed })
  }
  return contrasts
}
