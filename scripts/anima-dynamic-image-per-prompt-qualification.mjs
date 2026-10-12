/** Independent full-pair per-prompt image seeds and whole DTOs; no producer/compiler oracle. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  assertAnimaDynamicImageConfiguration as assertRecipe,
  assertAnimaDynamicImageFrozen as assertEnvelope,
  literalAnimaDynamicImagePlan as foundationPlan,
  validateAnimaDynamicImageFixture as validateFoundation,
} from './anima-dynamic-image-qualification.mjs'
export {
  assertAnimaDynamicImageSavedPixels as assertAnimaDynamicImagePerPromptSavedPixels,
  expectedAnimaDynamicImageLoraStack,
} from './anima-dynamic-image-qualification.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio')
const ownIndices = Object.freeze([0, 1, 10, 11, 20, 21, 30, 31])
const stages = ['numeric-control', 'per-prompt']
const modes = ['img2img', 'outpaint']
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
function sha(value) {
  assert.equal(typeof value, 'string')
  assert.match(value, /^[a-f0-9]{64}$/)
}
function owned(value) {
  assert.equal(typeof value, 'string')
  assert.ok(path.isAbsolute(value) && path.resolve(value) === value)
  assert.ok(value.startsWith(root + path.sep))
}
const overlap = (left, right) =>
  left === right || left.startsWith(right + path.sep) || right.startsWith(left + path.sep)

/** These two tables are handwritten; no planner supplies expected seed or pair membership. */
export function literalAnimaDynamicImagePerPromptPlan(stage, mode) {
  assert.ok(stages.includes(stage), 'Unknown finite per-prompt image stage.')
  assert.ok(modes.includes(mode), 'Only common-source IMG and normal OUT are qualified.')
  const controls = [
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
  const subjects = [
    [0, 0, 0],
    [0, 1, 1],
    [1, 0, 2],
    [1, 1, 3],
    [2, 0, 4],
    [2, 1, 5],
    [3, 0, 6],
    [3, 1, 7],
  ]
  // The foundation's literal prompt/span constants are independent of the production compiler.
  const source = foundationPlan('baseline', mode)
  const seedBehavior = stage === 'numeric-control' ? 'per-iteration' : 'per-prompt'
  const items = (stage === 'numeric-control' ? controls : subjects).map(
    ([promptPairIndex, iteration, seed]) => ({
      ...structuredClone(source.items[promptPairIndex * 2]),
      promptPairIndex,
      iteration,
      seed,
      seedBehavior,
    }),
  )
  return freeze({
    stage,
    mode,
    modelKey: 'anima',
    animaMethod: 'euler',
    steps: 3,
    observedSteps: 2,
    denoisingStrength: 0.5,
    bbox: { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 },
    iterations: stage === 'numeric-control' ? 8 : 2,
    maxPrompts: 4,
    truncated: false,
    seedBehavior,
    requestedSeedPolicy: 'fixed',
    fixedSeed: 0,
    baseSeed: 0,
    sourcePrompts: structuredClone(source.sourcePrompts),
    items,
    expectedAdmissions: items.length,
    expectedCompletions: items.length,
    expectedCanceled: 0,
  })
}

export function validateAnimaDynamicImagePerPromptFixture(fixture) {
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
    ...(fixture?.stage === 'per-prompt' ? ['baseline'] : []),
  ])
  assert.equal(fixture.profile, 'anima-dynamic-image-per-prompt')
  const plan = literalAnimaDynamicImagePerPromptPlan(fixture.stage, fixture.mode)
  // Reuse only the foundation's strict path/resource envelope, never its seed table/DTO oracle.
  const common = { ...fixture, profile: 'anima-dynamic-image', stage: 'baseline' }
  delete common.baseline
  validateFoundation(common)
  if (fixture.stage === 'per-prompt') {
    exactKeys(fixture.baseline, ['reportPath', 'reportSha256'])
    owned(fixture.baseline.reportPath)
    sha(fixture.baseline.reportSha256)
    assert.equal(overlap(fixture.artifacts, fixture.baseline.reportPath), false)
  }
  return plan
}

export function assertAnimaDynamicImagePerPromptItem(item) {
  const stage = item?.seedBehavior === 'per-iteration' ? 'numeric-control' : 'per-prompt'
  const member = literalAnimaDynamicImagePerPromptPlan(stage, item?.mode).items.find(
    (entry) => entry.promptPairIndex === item.promptPairIndex && entry.iteration === item.iteration,
  )
  assert.ok(member, 'Independent full-pair/iteration/seed tuple membership is required.')
  assert.deepEqual(
    item,
    member,
    'Independent full-pair/iteration/seed tuple membership is required.',
  )
}

/** Full clipped Euler image plan and independent literal posterior domains for all eight seeds. */
export function literalAnimaDynamicImagePerPromptNativePlan(seed) {
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
export function assertAnimaDynamicImagePerPromptFrozen(frozen, item, reference) {
  return assertEnvelope(frozen, item, reference, {
    assertExpectedItem: assertAnimaDynamicImagePerPromptItem,
    nativePlanForSeed: literalAnimaDynamicImagePerPromptNativePlan,
  })
}
export function assertAnimaDynamicImagePerPromptConfiguration(config, item, reference) {
  return assertRecipe(config, item, reference, {
    assertExpectedItem: assertAnimaDynamicImagePerPromptItem,
  })
}
export function normalizeAnimaDynamicImagePerPromptNativeInputs(frozen) {
  assert.ok(['anima-img2img', 'anima-outpaint'].includes(frozen?.kind))
  assert.equal(frozen?.context?.sampling?.animaMethod, 'euler')
  assert.equal(frozen?.workerJob?.sampling?.scheduler, 'euler')
  const result = structuredClone(frozen)
  delete result.originRequestId
  delete result.context.documentId
  delete result.context.documentRevision
  return result
}
/** Numerical controls differ only in persisted authoring behavior and owning identifiers. */
export function normalizeAnimaDynamicImagePerPromptReferenceInputs(frozen) {
  const result = normalizeAnimaDynamicImagePerPromptNativeInputs(frozen)
  assert.equal(result.context.sampling.requestedSeedPolicy, 'fixed')
  assert.ok(['per-iteration', 'per-prompt'].includes(result.context.sampling.seedBehavior))
  delete result.context.sampling.seedBehavior
  return result
}
function frozenOf(row) {
  assert.ok(typeof row?.id === 'string' && row.id.length > 0)
  assert.equal(typeof row.frozen_payload_json, 'string')
  return JSON.parse(row.frozen_payload_json)
}
export function resolveAnimaDynamicImagePerPromptPlan(plan, admitted) {
  assert.deepEqual(plan, literalAnimaDynamicImagePerPromptPlan(plan.stage, plan.mode))
  assert.equal(admitted.length, plan.expectedAdmissions)
  assert.equal(new Set(admitted.map(({ id }) => id)).size, admitted.length)
  for (const [index, row] of admitted.entries()) {
    const frozen = frozenOf(row),
      item = plan.items[index]
    assert.deepEqual(frozen.context?.prompts, item.prompts)
    assert.deepEqual(frozen.workerJob?.prompts, item.compiledPrompts)
    assert.equal(frozen.context?.sampling?.seed, item.seed)
    assert.equal(frozen.context?.sampling?.seedBehavior, item.seedBehavior)
    assert.deepEqual(
      frozen.workerJob?.sampling,
      literalAnimaDynamicImagePerPromptNativePlan(item.seed),
    )
  }
  return plan
}

export function assertAnimaDynamicImagePerPromptBaseline({ baseline, fixture, plan, reference }) {
  assert.equal(fixture.stage, 'per-prompt')
  assert.deepEqual(plan, validateAnimaDynamicImagePerPromptFixture(fixture))
  const controls = literalAnimaDynamicImagePerPromptPlan('numeric-control', fixture.mode)
  assert.equal(baseline.status, 'passed')
  assert.equal(baseline.profile, fixture.profile)
  assert.equal(baseline.stage, 'numeric-control')
  assert.deepEqual(baseline.literalPlan, controls)
  assert.deepEqual(baseline.resolvedPlan, controls)
  assert.equal(baseline.nativePhysicalExit?.confirmed, true)
  for (const key of ['admissions', 'generations', 'comparisons'])
    assert.equal(baseline[key].length, 32)
  assert.equal(baseline.savedPackage?.acceptedLayers, 32)
  assert.equal(baseline.savedPackage?.sourceLayers, 1)
  assert.equal(baseline.savedPackage?.totalLayers, 33)
  assert.equal(baseline.savedPackage?.reopened, true)
  assert.equal(baseline.savedPackage?.lastActualSeedSnapshot, 7)
  assert.equal(new Set(baseline.generations.map(({ queueItemId }) => queueItemId)).size, 32)
  for (const [index, generation] of baseline.generations.entries()) {
    const item = controls.items[index]
    assert.deepEqual(generation.expectedItem, item)
    assert.equal(generation.queueItemId, baseline.admissions[index].row.id)
    assert.deepEqual(generation.frozen, frozenOf(baseline.admissions[index].row))
    assert.equal(generation.row.status, 'completed')
    assert.equal(generation.accepted, true)
    assert.equal(baseline.comparisons[index].queueItemId, generation.queueItemId)
    assert.equal(baseline.comparisons[index].readOnly, true)
    sha(generation.dimensions.pixelSha256)
    assertAnimaDynamicImagePerPromptFrozen(generation.frozen, item, reference)
    assertAnimaDynamicImagePerPromptConfiguration(
      generation.provenance.generationConfiguration,
      item,
      reference,
    )
  }
  for (const [index, subject] of plan.items.entries()) {
    const control = controls.items[ownIndices[index]]
    assert.equal(control.seedBehavior, 'per-iteration')
    const identity = ({ iteration: _iteration, seedBehavior: _behavior, ...value }) => value
    assert.deepEqual(identity(control), identity(subject))
  }
  return controls
}

/** Adjacent within-pair seed contrasts only; no cross-pair/prompt/weight or quality conclusion. */
export function assertAnimaDynamicImagePerPromptPixels(generations, plan) {
  assert.deepEqual(plan, literalAnimaDynamicImagePerPromptPlan(plan.stage, plan.mode))
  assert.equal(generations.length, plan.expectedCompletions)
  const common = generations.map(({ frozen }) => {
    const value = normalizeAnimaDynamicImagePerPromptNativeInputs(frozen)
    delete value.context.prompts
    delete value.workerJob.prompts
    delete value.context.sampling.seed
    delete value.workerJob.sampling.seed
    delete value.workerJob.sampling.stepSeed
    delete value.workerJob.sampling.posteriorSeed
    return value
  })
  for (const [index, generation] of generations.entries()) {
    assert.deepEqual(generation.expectedItem, plan.items[index])
    assert.deepEqual(
      common[index],
      common[0],
      'All pairs retain complete source/resources/numerical grid.',
    )
    assert.equal(generation.rgba.length, 65536 * 4)
  }
  const contrasts = []
  for (let pair = 0; pair < 4; pair++)
    for (let iteration = 0; iteration < plan.iterations - 1; iteration++) {
      const leftIndex = pair * plan.iterations + iteration,
        rightIndex = leftIndex + 1,
        left = generations[leftIndex],
        right = generations[rightIndex]
      assert.deepEqual(left.frozen.context.prompts, right.frozen.context.prompts)
      assert.deepEqual(left.frozen.workerJob.prompts, right.frozen.workerJob.prompts)
      let changed = 0
      for (let pixel = 0; pixel < 65536; pixel++) {
        const at = pixel * 4
        assert.equal(left.rgba[at + 3], right.rgba[at + 3], 'Seed changes preserve complete alpha.')
        if (left.rgba[at + 3] && [0, 1, 2].some((c) => left.rgba[at + c] !== right.rgba[at + c]))
          changed++
      }
      assert.ok(changed > 0, 'Declared adjacent seeds must differ in visible RGB.')
      contrasts.push({ leftIndex, rightIndex, visibleChangedPixels: changed })
    }
  return contrasts
}

export const animaDynamicImagePerPromptControlIndices = ownIndices
