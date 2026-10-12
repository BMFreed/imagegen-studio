/** Independent finite signed image-subset tables; no production planner or native calls. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import { expectedEmbeddingRef } from './illustrious-dynamic-embeddings-qualification.mjs'
import {
  assertIllustriousDynamicImageConfiguration,
  assertIllustriousDynamicImageFrozen,
  literalIllustriousDynamicImagePlan,
  normalizeIllustriousDynamicImageNativeInputs,
  validateIllustriousDynamicImageFixture,
} from './illustrious-dynamic-image-qualification.mjs'

const positive = [
  'a ceramic cup on a wooden table, studio photograph',
  'a ceramic cup on a wooden table, studio photograph, (<illustriousphoto>:1.3)',
]
const negative = ['low quality', 'low quality, (<illustriousphoto>:0.7)']
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
function ownedPath(value) {
  assert.equal(typeof value, 'string')
  assert.ok(path.isAbsolute(value) && path.resolve(value) === value)
  assert.ok(value.startsWith(path.join(homedir(), '.codex/artifacts/imagegen-studio') + path.sep))
}
const overlap = (left, right) =>
  left === right || left.startsWith(right + path.sep) || right.startsWith(left + path.sep)

/** Full authored templates survive prefix selection; concrete sign order is handwritten. */
export function literalIllustriousDynamicEmbeddingsImagePlan(stage, objective, mode) {
  assert.ok(['baseline', 'prefix'].includes(stage), 'Unknown signed image-subset stage.')
  assert.ok(['epsilon', 'v_prediction'].includes(objective))
  assert.ok(['img2img', 'outpaint'].includes(mode))
  const sampler = objective === 'epsilon' ? 'Euler a' : 'Euler'
  const invokeScheduler = objective === 'epsilon' ? 'euler_a' : 'euler'
  const pairs =
    stage === 'baseline'
      ? [
          [0, 0],
          [0, 1],
          [1, 0],
          [1, 1],
        ]
      : [
          [0, 0],
          [0, 1],
        ]
  const items = pairs.map(([p, n]) => ({
    promptPairIndex: p * 2 + n,
    iteration: 0,
    seed: 0,
    requestedSeedPolicy: 'fixed',
    seedBehavior: 'per-iteration',
    objective,
    mode,
    sampler,
    invokeScheduler,
    schedule: 'Normal',
    steps: 3,
    denoisingStrength: 0.5,
    prompts: { positive: positive[p], negative: negative[n] },
    positiveEmbedding: p ? 'embeddingTrained' : null,
    negativeEmbedding: n ? 'embeddingTrained' : null,
  }))
  return freeze({
    stage,
    objective,
    mode,
    modelKey: objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious',
    sampler,
    invokeScheduler,
    steps: 3,
    observedSteps: 2,
    denoisingStrength: 0.5,
    bbox: { x: mode === 'outpaint' ? 64 : 0, y: 0, width: 256, height: 256 },
    iterations: 1,
    maxPrompts: stage === 'baseline' ? 4 : 2,
    truncated: stage === 'prefix',
    seedBehavior: 'per-iteration',
    requestedSeedPolicy: 'fixed',
    fixedSeed: 0,
    baseSeed: 0,
    sourcePrompts: {
      positive:
        '{a ceramic cup on a wooden table, studio photograph|a ceramic cup on a wooden table, studio photograph, (<illustriousphoto>:1.3)}',
      negative: '{low quality|low quality, (<illustriousphoto>:0.7)}',
    },
    items,
    expectedAdmissions: items.length,
    expectedCompletions: items.length,
    expectedCanceled: 0,
  })
}
export function validateIllustriousDynamicEmbeddingsImageFixture(fixture) {
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
  assert.equal(fixture.profile, 'illustrious-dynamic-embeddings-image')
  const plan = literalIllustriousDynamicEmbeddingsImagePlan(
    fixture.stage,
    fixture.objective,
    fixture.mode,
  )
  const { baseline, ...image } = fixture
  validateIllustriousDynamicImageFixture({
    ...image,
    profile: 'illustrious-dynamic-image',
    stage: 'baseline',
  })
  if (fixture.stage === 'prefix') {
    exactKeys(baseline, ['reportPath', 'reportSha256'])
    ownedPath(baseline.reportPath)
    assert.match(baseline.reportSha256, /^[a-f0-9]{64}$/)
    assert.ok(!overlap(fixture.artifacts, baseline.reportPath))
  }
  return plan
}
function assertItem(item) {
  const plan = literalIllustriousDynamicEmbeddingsImagePlan('baseline', item?.objective, item?.mode)
  const member = plan.items.find(({ promptPairIndex }) => promptPairIndex === item.promptPairIndex)
  assert.ok(member, 'Exact signed image tuple membership is required before projection.')
  assert.deepEqual(
    item,
    member,
    'Exact signed image tuple membership is required before projection.',
  )
  return literalIllustriousDynamicImagePlan('baseline', item.objective, item.mode).items[
    item.promptPairIndex * 2
  ]
}
export const expectedIllustriousDynamicImageEmbeddingRef = expectedEmbeddingRef
export function effectiveIllustriousDynamicImageEmbeddingRefs(item, reference) {
  assertItem(item)
  const ref = expectedEmbeddingRef(reference)
  return {
    positive: item.positiveEmbedding === null ? [] : [ref],
    negative: item.negativeEmbedding === null ? [] : [ref],
  }
}
/** Assert every sign before projecting only those validated fields onto the common image oracle. */
export function assertIllustriousDynamicEmbeddingsImageFrozen(frozen, item, reference) {
  const canonical = assertItem(item)
  const ref = expectedEmbeddingRef(reference)
  const effective = effectiveIllustriousDynamicImageEmbeddingRefs(item, reference)
  assert.deepEqual(frozen?.context?.prompts, item.prompts)
  assert.deepEqual(frozen?.workerJob?.prompts, item.prompts)
  assert.deepEqual(frozen?.context?.embeddingRefs, { positive: [ref], negative: [ref] })
  const source = reference.embeddingTrained
  const descriptors = (worker) =>
    Object.fromEntries(
      ['positive', 'negative'].map((polarity) => [
        polarity,
        effective[polarity].map(() =>
          worker
            ? {
                byteSize: source.byteSize,
                path: source.installed.managedPath,
                sha256: source.sha256,
                token: ref.token,
              }
            : {
                byteSize: source.byteSize,
                managedPath: source.installed.managedPath,
                reference: ref.resource,
                token: ref.token,
              },
        ),
      ]),
    )
  assert.deepEqual(frozen?.context?.embeddings, descriptors(false))
  if (effective.positive.length || effective.negative.length) {
    assert.ok(
      Object.hasOwn(frozen.workerJob, 'embeddings'),
      'Every active sign needs native embeddings.',
    )
    assert.deepEqual(frozen.workerJob.embeddings, descriptors(true))
  } else {
    assert.equal(
      Object.hasOwn(frozen.workerJob, 'embeddings'),
      false,
      'Ordinary wire must omit embeddings.',
    )
  }
  const projected = structuredClone(frozen)
  projected.context.prompts = structuredClone(canonical.prompts)
  projected.workerJob.prompts = structuredClone(canonical.prompts)
  projected.context.embeddingRefs = { positive: [], negative: [] }
  projected.context.embeddings = { positive: [], negative: [] }
  delete projected.workerJob.embeddings
  assertIllustriousDynamicImageFrozen(projected, canonical, reference)
}
export function assertIllustriousDynamicEmbeddingsImageConfiguration(config, item, reference) {
  const canonical = assertItem(item)
  const refs = effectiveIllustriousDynamicImageEmbeddingRefs(item, reference)
  for (const polarity of ['positive', 'negative'])
    assert.deepEqual(config?.[`${polarity}Prompt`], {
      text: item.prompts[polarity],
      embeddingRefs: refs[polarity],
    })
  const projected = structuredClone(config)
  for (const polarity of ['positive', 'negative'])
    projected[`${polarity}Prompt`] = { text: canonical.prompts[polarity], embeddingRefs: [] }
  assertIllustriousDynamicImageConfiguration(projected, canonical, reference)
  const serialized = JSON.stringify(config)
  assert.equal(serialized.includes(reference.embeddingTrained.installed.managedPath), false)
  assert.equal(serialized.includes(reference.embeddingTrained.path), false)
}
/** Full same-input comparison preserves prompts, weights, signs and requested metadata. */
export const normalizeIllustriousDynamicEmbeddingsImageNativeInputs =
  normalizeIllustriousDynamicImageNativeInputs
function frozenOf(row) {
  assert.ok(typeof row?.id === 'string' && row.id.length)
  assert.equal(typeof row.frozen_payload_json, 'string')
  return JSON.parse(row.frozen_payload_json)
}
/** Bind the same finite table to actual admissions before completion and baseline publication. */
export function resolveIllustriousDynamicEmbeddingsImagePlan(plan, admitted) {
  assert.deepEqual(
    plan,
    literalIllustriousDynamicEmbeddingsImagePlan(plan.stage, plan.objective, plan.mode),
  )
  assert.equal(admitted.length, plan.expectedAdmissions)
  assert.equal(new Set(admitted.map(({ id }) => id)).size, plan.expectedAdmissions)
  for (const [index, row] of admitted.entries()) {
    const frozen = frozenOf(row)
    assert.equal(frozen.context?.sampling?.seed, 0)
    assert.equal(frozen.workerJob?.sampling?.seed, 0)
    assert.equal(frozen.context?.sampling?.requestedSeedPolicy, 'fixed')
    assert.equal(frozen.context?.sampling?.seedBehavior, 'per-iteration')
    assert.deepEqual(frozen.context?.prompts, plan.items[index].prompts)
    assert.deepEqual(frozen.workerJob?.prompts, plan.items[index].prompts)
  }
  return plan
}
export function assertIllustriousDynamicEmbeddingsImageBaseline({
  baseline,
  fixture,
  plan,
  reference,
}) {
  assert.equal(fixture.stage, 'prefix')
  assert.deepEqual(plan, validateIllustriousDynamicEmbeddingsImageFixture(fixture))
  const full = literalIllustriousDynamicEmbeddingsImagePlan(
    'baseline',
    fixture.objective,
    fixture.mode,
  )
  assert.equal(baseline.status, 'passed')
  assert.equal(baseline.profile, fixture.profile)
  assert.equal(baseline.stage, 'baseline')
  assert.equal(baseline.objective, fixture.objective)
  assert.deepEqual(baseline.literalPlan, full)
  assert.deepEqual(baseline.resolvedPlan, full)
  assert.equal(baseline.nativePhysicalExit?.confirmed, true)
  assert.equal(baseline.savedPackage?.acceptedLayers, 4)
  assert.equal(baseline.savedPackage?.sourceLayers, 1)
  assert.equal(baseline.savedPackage?.totalLayers, 5)
  assert.equal(baseline.savedPackage?.reopened, true)
  assert.equal(baseline.savedPackage?.lastActualSeedSnapshot, 0)
  for (const field of ['admissions', 'generations', 'comparisons'])
    assert.equal(baseline[field].length, 4)
  assert.equal(new Set(baseline.generations.map(({ queueItemId }) => queueItemId)).size, 4)
  for (const [index, generation] of baseline.generations.entries()) {
    assert.deepEqual(generation.expectedItem, full.items[index])
    assert.equal(generation.accepted, true)
    assert.equal(generation.row.status, 'completed')
    assert.equal(generation.queueItemId, baseline.admissions[index].row.id)
    assert.deepEqual(generation.frozen, frozenOf(baseline.admissions[index].row))
    assert.equal(baseline.comparisons[index].queueItemId, generation.queueItemId)
    assert.equal(baseline.comparisons[index].readOnly, true)
    assert.match(generation.dimensions.pixelSha256, /^[a-f0-9]{64}$/)
    assertIllustriousDynamicEmbeddingsImageFrozen(generation.frozen, full.items[index], reference)
    assertIllustriousDynamicEmbeddingsImageConfiguration(
      generation.provenance.generationConfiguration,
      full.items[index],
      reference,
    )
  }
  return full
}
/** Visible finite contrasts describe these inputs, never causal tensor direction or quality. */
export function assertIllustriousDynamicEmbeddingsImagePixels(generations, plan) {
  assert.deepEqual(
    plan,
    literalIllustriousDynamicEmbeddingsImagePlan(plan.stage, plan.objective, plan.mode),
  )
  assert.equal(generations.length, plan.expectedCompletions)
  const common = generations.map(({ frozen }) => {
    const value = normalizeIllustriousDynamicImageNativeInputs(frozen)
    delete value.context.prompts
    delete value.workerJob.prompts
    delete value.context.embeddings
    delete value.workerJob.embeddings
    return value
  })
  for (const [index, generation] of generations.entries()) {
    assert.deepEqual(generation.expectedItem, plan.items[index])
    assert.deepEqual(
      common[index],
      common[0],
      'Signed subsets must preserve common image/resource inputs.',
    )
    assert.equal(generation.rgba.length, 65536 * 4)
  }
  const difference = (leftIndex, rightIndex) => {
    const left = generations[leftIndex],
      right = generations[rightIndex]
    let pixels = 0
    for (let pixel = 0; pixel < 65536; pixel++) {
      const at = pixel * 4
      assert.equal(
        left.rgba[at + 3],
        right.rgba[at + 3],
        'Signed subset changes cannot alter alpha.',
      )
      if (left.rgba[at + 3] && [0, 1, 2].some((c) => left.rgba[at + c] !== right.rgba[at + c]))
        pixels++
    }
    assert.ok(pixels > 0, 'Finite signed alternatives must differ in visible RGB.')
    return { leftPair: leftIndex, rightPair: rightIndex, visibleChangedPixels: pixels }
  }
  return {
    negativeAlternatives:
      plan.stage === 'baseline' ? [difference(0, 1), difference(2, 3)] : [difference(0, 1)],
    positiveAlternatives: plan.stage === 'baseline' ? [difference(0, 2), difference(1, 3)] : [],
    combinedAlternatives: plan.stage === 'baseline' ? [difference(0, 3), difference(1, 2)] : [],
    causalTensorDirectionClaim: false,
    qualityClaim: false,
  }
}
