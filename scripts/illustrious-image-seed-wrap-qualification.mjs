/** Literal image uint32 oracle; production planners and runtime observations are not expectations. */
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

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio')
const maximum = 4294967295
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
function reportReference(value, artifacts) {
  exactKeys(value, ['reportPath', 'reportSha256'])
  assert.ok(
    path.isAbsolute(value.reportPath) && path.resolve(value.reportPath) === value.reportPath,
  )
  assert.ok(value.reportPath.startsWith(`${root}${path.sep}`))
  assert.match(value.reportSha256, /^[a-f0-9]{64}$/)
  assert.ok(
    value.reportPath !== artifacts &&
      !value.reportPath.startsWith(`${artifacts}${path.sep}`) &&
      !artifacts.startsWith(`${value.reportPath}${path.sep}`),
    'Control evidence must remain outside the new run payload.',
  )
}

/** One concrete weighted pair: independent schedules[MAX], [0], and[MAX,0]. */
export function literalIllustriousImageSeedWrapPlan(stage, objective, mode) {
  assert.ok(['control-max', 'control-zero', 'wrap'].includes(stage))
  const exemplar = literalIllustriousDynamicImagePlan('baseline', objective, mode, 'per-prompt')
  const seeds = stage === 'control-max' ? [maximum] : stage === 'control-zero' ? [0] : [maximum, 0]
  const fixedSeed = stage === 'control-zero' ? 0 : maximum
  return freeze({
    ...structuredClone(exemplar),
    stage,
    iterations: seeds.length,
    maxPrompts: 1,
    fixedSeed,
    baseSeed: fixedSeed,
    sourcePrompts: structuredClone(exemplar.items[0].prompts),
    items: seeds.map((seed, iteration) => ({
      ...structuredClone(exemplar.items[iteration]),
      stage,
      baseSeed: fixedSeed,
      seed,
    })),
    expectedAdmissions: seeds.length,
    expectedCompletions: seeds.length,
  })
}

/** The shared image envelope retains its exact resource/path/LaMa lexical checks. */
export function validateIllustriousImageSeedWrapFixture(fixture) {
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
    ...(fixture?.stage === 'wrap' ? ['baseline', 'zeroControl'] : []),
  ])
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'illustrious-image-seed-wrap')
  const plan = literalIllustriousImageSeedWrapPlan(fixture.stage, fixture.objective, fixture.mode)
  const { baseline, zeroControl, ...image } = fixture
  validateIllustriousDynamicImageFixture({
    ...image,
    profile: 'illustrious-dynamic-image',
    stage: 'baseline',
  })
  if (fixture.stage === 'wrap') {
    reportReference(baseline, fixture.artifacts)
    reportReference(zeroControl, fixture.artifacts)
    assert.notEqual(baseline.reportPath, zeroControl.reportPath)
  }
  return plan
}
function frozenOf(row) {
  assert.ok(typeof row?.id === 'string' && row.id.length > 0)
  assert.notEqual(Object.hasOwn(row, 'frozen'), Object.hasOwn(row, 'frozen_payload_json'))
  return Object.hasOwn(row, 'frozen') ? row.frozen : JSON.parse(row.frozen_payload_json)
}
export function resolveIllustriousImageSeedWrapPlan(plan, admitted) {
  assert.deepEqual(plan, literalIllustriousImageSeedWrapPlan(plan.stage, plan.objective, plan.mode))
  assert.equal(admitted.length, plan.expectedAdmissions)
  assert.equal(new Set(admitted.map(({ id }) => id)).size, plan.expectedAdmissions)
  for (const [index, row] of admitted.entries()) {
    const frozen = frozenOf(row)
    assert.equal(frozen.context?.sampling?.seed, plan.items[index].seed)
    assert.equal(frozen.workerJob?.sampling?.seed, plan.items[index].seed)
    assert.equal(frozen.context?.sampling?.requestedSeedPolicy, 'fixed')
    assert.equal(frozen.context?.sampling?.seedBehavior, 'per-prompt')
  }
  return plan
}
function canonicalItem(expected) {
  const plan = literalIllustriousImageSeedWrapPlan(
    expected?.stage,
    expected?.objective,
    expected?.mode,
  )
  const item = plan.items.find(({ iteration }) => iteration === expected.iteration)
  assert.deepEqual(expected, item, 'Exact finite seed/prompt/iteration tuple is required.')
  return literalIllustriousDynamicImagePlan(
    'baseline',
    expected.objective,
    expected.mode,
    'per-prompt',
  ).items[expected.iteration]
}
export function assertIllustriousImageSeedWrapFrozen(frozen, expected, reference) {
  const canonical = canonicalItem(expected)
  assert.equal(frozen?.context?.sampling?.seed, expected.seed)
  assert.equal(frozen?.workerJob?.sampling?.seed, expected.seed)
  const value = structuredClone(frozen)
  value.context.sampling.seed = canonical.seed
  value.workerJob.sampling.seed = canonical.seed
  assertIllustriousDynamicImageFrozen(value, canonical, reference)
}
export function assertIllustriousImageSeedWrapConfiguration(config, expected, reference) {
  const canonical = canonicalItem(expected)
  assert.equal(config?.sampling?.actualSeed, expected.seed)
  const value = structuredClone(config)
  value.sampling.actualSeed = canonical.seed
  assertIllustriousDynamicImageConfiguration(value, canonical, reference)
}
export const normalizeIllustriousImageSeedWrapInputs = normalizeIllustriousDynamicImageNativeInputs

/** Validate genuine standalone accepted control shape before admitting a wrap batch. */
export function assertIllustriousImageSeedWrapControl(report, fixture, stage, reference) {
  assert.ok(['control-max', 'control-zero'].includes(stage))
  const plan = literalIllustriousImageSeedWrapPlan(stage, fixture.objective, fixture.mode)
  assert.equal(report.status, 'passed')
  assert.equal(report.profile, 'illustrious-image-seed-wrap')
  assert.equal(report.stage, stage)
  assert.equal(report.objective, fixture.objective)
  assert.deepEqual(report.literalPlan, plan)
  assert.deepEqual(report.resolvedPlan, plan)
  assert.equal(report.nativePhysicalExit?.confirmed, true)
  assert.equal(report.savedPackage?.acceptedLayers, 1)
  assert.equal(report.savedPackage?.sourceLayers, 1)
  assert.equal(report.savedPackage?.totalLayers, 2)
  assert.equal(report.savedPackage?.reopened, true)
  assert.equal(report.savedPackage?.lastActualSeedSnapshot, plan.items[0].seed)
  assert.equal(report.admissions.length, 1)
  assert.equal(report.generations.length, 1)
  assert.equal(report.comparisons.length, 1)
  const generation = report.generations[0]
  assert.deepEqual(generation.expectedItem, plan.items[0])
  assert.equal(generation.accepted, true)
  assert.equal(generation.row.status, 'completed')
  assert.equal(report.admissions[0].row.id, generation.queueItemId)
  assert.deepEqual(frozenOf(report.admissions[0].row), generation.frozen)
  assert.equal(report.comparisons[0].queueItemId, generation.queueItemId)
  assert.equal(report.comparisons[0].readOnly, true)
  assert.match(generation.dimensions.pixelSha256, /^[a-f0-9]{64}$/)
  assert.equal(generation.qualification.beforeExplicitAdd, true)
  assert.deepEqual(
    generation.qualification.normalizedInputs,
    normalizeIllustriousImageSeedWrapInputs(generation.frozen),
  )
  assertIllustriousImageSeedWrapFrozen(generation.frozen, plan.items[0], reference)
  assertIllustriousImageSeedWrapConfiguration(
    generation.provenance.generationConfiguration,
    plan.items[0],
    reference,
  )
  return generation
}

/** Numeric0 and MAX controls bind the complete current source set through the driver's MAX check. */
export function assertIllustriousImageSeedWrapControlBindings(maximumControl, zeroControl) {
  assert.deepEqual(zeroControl.sourceSha256, maximumControl.sourceSha256)
  assert.deepEqual(zeroControl.bundleSha256, maximumControl.bundleSha256)
  assert.equal(zeroControl.appData, maximumControl.appData)
  assert.equal(zeroControl.runtimeId, maximumControl.runtimeId)
}

/** Match every completion by exact executed inputs, not its batch iteration or a later queue seed. */
export function assertIllustriousImageSeedWrapMatches(generations, plan, controls) {
  assert.equal(plan.stage, 'wrap')
  assert.deepEqual(plan, literalIllustriousImageSeedWrapPlan('wrap', plan.objective, plan.mode))
  assert.equal(generations.length, 2)
  const evidence = []
  for (const [index, generation] of generations.entries()) {
    assert.deepEqual(generation.expectedItem, plan.items[index])
    assert.equal(generation.accepted, false, 'Numerical matching precedes every explicit Add.')
    const control = controls[index]
    assert.equal(control.generation.expectedItem.seed, [maximum, 0][index])
    assert.deepEqual(
      normalizeIllustriousImageSeedWrapInputs(generation.frozen),
      normalizeIllustriousImageSeedWrapInputs(control.generation.frozen),
      'Same-seed image control must preserve every executed input.',
    )
    assert.equal(
      generation.dimensions.pixelSha256,
      control.generation.dimensions.pixelSha256,
      'Wrapped image pixels differ from the standalone numeric control.',
    )
    const binding = {
      ...control.descriptor,
      queueItemId: control.generation.queueItemId,
      beforeExplicitAdd: true,
      expectedPixelSha256: control.generation.dimensions.pixelSha256,
      actualPixelSha256: generation.dimensions.pixelSha256,
      allowedMetadataDifferences: [],
    }
    if (generation.baseline) assert.deepEqual(generation.baseline, binding)
    generation.baseline = binding
    evidence.push({
      queueItemId: generation.queueItemId,
      seed: plan.items[index].seed,
      control: binding,
    })
  }
  assert.notEqual(
    generations[0].dimensions.pixelSha256,
    generations[1].dimensions.pixelSha256,
    'Same-prompt MAX and0 controls must have observable different wholeRGBA pixels.',
  )
  return evidence
}
