/** Independent concrete-pair Anima image MAX/0 oracle; no production seed or sampling planner. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  assertAnimaDynamicImageConfiguration,
  assertAnimaDynamicImageFrozen,
  literalAnimaDynamicImagePlan,
  validateAnimaDynamicImageFixture,
} from './anima-dynamic-image-qualification.mjs'

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
  assert.equal(typeof value.reportPath, 'string')
  assert.ok(
    path.isAbsolute(value.reportPath) && path.resolve(value.reportPath) === value.reportPath,
  )
  assert.ok(value.reportPath.startsWith(root + path.sep))
  assert.match(value.reportSha256, /^[a-f0-9]{64}$/)
  assert.ok(
    value.reportPath !== artifacts &&
      !value.reportPath.startsWith(artifacts + path.sep) &&
      !artifacts.startsWith(value.reportPath + path.sep),
    'Control evidence must remain outside the new run payload.',
  )
}

/** One handwritten schedule for each healthy stage, never derived from the producer's expansion. */
export function literalAnimaImageSeedWrapPlan(stage, mode) {
  assert.ok(['control-max', 'control-zero', 'wrap'].includes(stage))
  const source = literalAnimaDynamicImagePlan('baseline', mode)
  const seeds = stage === 'control-max' ? [maximum] : stage === 'control-zero' ? [0] : [maximum, 0]
  const baseSeed = stage === 'control-zero' ? 0 : maximum
  return freeze({
    ...structuredClone(source),
    stage,
    iterations: seeds.length,
    maxPrompts: 1,
    truncated: false,
    seedBehavior: 'per-prompt',
    fixedSeed: baseSeed,
    baseSeed,
    sourcePrompts: structuredClone(source.items[0].prompts),
    items: seeds.map((seed, iteration) => ({
      ...structuredClone(source.items[iteration]),
      stage,
      baseSeed,
      seedBehavior: 'per-prompt',
      seed,
    })),
    expectedAdmissions: seeds.length,
    expectedCompletions: seeds.length,
  })
}
export function validateAnimaImageSeedWrapFixture(fixture) {
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
    ...(fixture?.stage === 'wrap' ? ['baseline', 'zeroControl'] : []),
  ])
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.profile, 'anima-image-seed-wrap')
  const plan = literalAnimaImageSeedWrapPlan(fixture.stage, fixture.mode)
  const { baseline, zeroControl, ...common } = fixture
  validateAnimaDynamicImageFixture({ ...common, profile: 'anima-dynamic-image', stage: 'baseline' })
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
export function resolveAnimaImageSeedWrapPlan(plan, admitted) {
  assert.deepEqual(plan, literalAnimaImageSeedWrapPlan(plan.stage, plan.mode))
  assert.equal(admitted.length, plan.expectedAdmissions)
  assert.equal(new Set(admitted.map(({ id }) => id)).size, plan.expectedAdmissions)
  for (const [index, row] of admitted.entries()) {
    const frozen = frozenOf(row),
      item = plan.items[index]
    assert.equal(frozen.context?.sampling?.requestedSeedPolicy, 'fixed')
    assert.equal(frozen.context?.sampling?.seedBehavior, 'per-prompt')
    assert.equal(frozen.context?.sampling?.seed, item.seed)
    assert.deepEqual(frozen.workerJob?.sampling, literalAnimaImageSeedWrapNativePlan(item.seed))
  }
  return plan
}
export function assertAnimaImageSeedWrapItem(item) {
  const plan = literalAnimaImageSeedWrapPlan(item?.stage, item?.mode)
  const member = plan.items.find(({ iteration }) => iteration === item.iteration)
  assert.ok(member, 'Exact finite Anima seed/prompt/iteration tuple is required.')
  assert.deepEqual(item, member, 'Exact finite Anima seed/prompt/iteration tuple is required.')
}
/** Explicit UINT32 endpoint domains retain genuine seed, stepSeed and unsigned posteriorSeed. */
export function literalAnimaImageSeedWrapNativePlan(seed) {
  assert.ok(seed === maximum || seed === 0)
  return freeze({
    beginIndex: 1,
    guidanceScale: 4,
    height: 256,
    initialSigma: 0.8571428571428571,
    mode: 'img2img',
    posteriorSeed: seed === maximum ? 1640531526 : 2654435769,
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
export function assertAnimaImageSeedWrapFrozen(frozen, item, reference) {
  return assertAnimaDynamicImageFrozen(frozen, item, reference, {
    assertExpectedItem: assertAnimaImageSeedWrapItem,
    nativePlanForSeed: literalAnimaImageSeedWrapNativePlan,
  })
}
export function assertAnimaImageSeedWrapConfiguration(config, item, reference) {
  return assertAnimaDynamicImageConfiguration(config, item, reference, {
    assertExpectedItem: assertAnimaImageSeedWrapItem,
  })
}
/** Whole DTO clone, including schemaVersion and unknown outer fields; only three owner IDs omitted. */
export function normalizeAnimaImageSeedWrapInputs(frozen) {
  assert.ok(['anima-img2img', 'anima-outpaint'].includes(frozen?.kind))
  assert.equal(frozen?.context?.sampling?.animaMethod, 'euler')
  assert.equal(frozen?.workerJob?.sampling?.scheduler, 'euler')
  const value = structuredClone(frozen)
  delete value.originRequestId
  delete value.context.documentId
  delete value.context.documentRevision
  return value
}
export function assertAnimaImageSeedWrapControl(report, fixture, stage, reference) {
  assert.ok(['control-max', 'control-zero'].includes(stage))
  const plan = literalAnimaImageSeedWrapPlan(stage, fixture.mode)
  assert.equal(report.status, 'passed')
  assert.equal(report.profile, fixture.profile)
  assert.equal(report.stage, stage)
  assert.deepEqual(report.literalPlan, plan)
  assert.deepEqual(report.resolvedPlan, plan)
  assert.equal(report.nativePhysicalExit?.confirmed, true)
  assert.equal(report.savedPackage?.acceptedLayers, 1)
  assert.equal(report.savedPackage?.sourceLayers, 1)
  assert.equal(report.savedPackage?.totalLayers, 2)
  assert.equal(report.savedPackage?.reopened, true)
  assert.equal(report.savedPackage?.lastActualSeedSnapshot, plan.items[0].seed)
  for (const key of ['admissions', 'generations', 'comparisons'])
    assert.equal(report[key].length, 1)
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
    normalizeAnimaImageSeedWrapInputs(generation.frozen),
  )
  assertAnimaImageSeedWrapFrozen(generation.frozen, plan.items[0], reference)
  assertAnimaImageSeedWrapConfiguration(
    generation.provenance.generationConfiguration,
    plan.items[0],
    reference,
  )
  return generation
}
export function assertAnimaImageSeedWrapControlBindings(maxControl, zeroControl) {
  assert.deepEqual(zeroControl.sourceSha256, maxControl.sourceSha256)
  assert.deepEqual(zeroControl.bundleSha256, maxControl.bundleSha256)
  assert.equal(zeroControl.appData, maxControl.appData)
  assert.equal(zeroControl.runtimeId, maxControl.runtimeId)
}
/** Every wrapped output retains its own same-input standalone control before explicit Add. */
export function assertAnimaImageSeedWrapMatches(generations, plan, controls) {
  assert.deepEqual(plan, literalAnimaImageSeedWrapPlan('wrap', plan.mode))
  assert.equal(generations.length, 2)
  assert.equal(controls.length, 2)
  const evidence = []
  for (const [index, generation] of generations.entries()) {
    assert.deepEqual(generation.expectedItem, plan.items[index])
    assert.equal(generation.accepted, false, 'Numerical matching precedes every explicit Add.')
    const control = controls[index]
    assert.deepEqual(
      control.generation.expectedItem,
      literalAnimaImageSeedWrapPlan(index === 0 ? 'control-max' : 'control-zero', plan.mode)
        .items[0],
    )
    assert.deepEqual(
      normalizeAnimaImageSeedWrapInputs(generation.frozen),
      normalizeAnimaImageSeedWrapInputs(control.generation.frozen),
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
