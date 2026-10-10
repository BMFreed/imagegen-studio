/** Independent DPM++2M schedules plus the existing method-independent image/resource oracle. */
import assert from 'node:assert/strict'

import {
  assertAnimaHeunImageConfiguration as assertCommonConfiguration,
  assertAnimaHeunImageFrozen as assertCommonFrozen,
  literalAnimaHeunImageNativePlan as commonNativePlan,
  literalAnimaHeunImagePlan as commonPlan,
  validateAnimaHeunImageFixture as validateCommonFixture,
} from './anima-heun-image-qualification.mjs'

// These are intentionally aliases: alpha, source overlap and opaque Save composition do not
// depend on the denoising method. Native DPM slots below never use a production compiler.
export {
  assertAnimaHeunImageOutputPixels as assertAnimaDpmpp2mImageOutputPixels,
  assertAnimaHeunImageSavedPixels as assertAnimaDpmpp2mImageSavedPixels,
  assertAnimaHeunImageTargetPixels as assertAnimaDpmpp2mImageTargetPixels,
  literalAnimaHeunImageContributionAlpha as literalAnimaDpmpp2mImageContributionAlpha,
  literalAnimaHeunImageTargetAlpha as literalAnimaDpmpp2mImageTargetAlpha,
} from './anima-heun-image-qualification.mjs'

export function validateAnimaDpmpp2mImageFixture(fixture) {
  assert.equal(fixture?.profile, 'anima-dpmpp2m-image')
  const { case: caseName, ...common } = fixture
  const plan = literalAnimaDpmpp2mImagePlan(fixture.stage, fixture.mode, caseName)
  // Reuse exact envelope/path/resource-source/one-delta guards; no unknown input key is removed.
  // Only the separately validated case and profile discriminate this new finite matrix.
  validateCommonFixture({ ...common, profile: 'anima-heun-image' })
  return plan
}

export function literalAnimaDpmpp2mImagePlan(stage, mode, caseName) {
  assert.ok(['neighbor', 'history'].includes(caseName), 'Unknown DPM++2M image case.')
  assert.ok(
    caseName !== 'neighbor' || mode === 'img2img',
    'The neighbor qualifies opaque IMG only.',
  )
  assert.ok(
    caseName !== 'neighbor' || stage !== 'restored',
    'The declared neighbor has baseline/control stages only.',
  )
  const common = commonPlan(stage, mode)
  const strength = caseName === 'neighbor' ? 0.5 : 0.75
  return Object.freeze({
    ...common,
    case: caseName,
    denoisingStrength: strength,
    animaMethod: 'dpmpp_2m',
    observedSteps: caseName === 'neighbor' ? 2 : 3,
    items: Object.freeze([
      Object.freeze({
        ...common.items[0],
        case: caseName,
        denoisingStrength: strength,
        animaMethod: 'dpmpp_2m',
      }),
    ]),
  })
}

/** Independently captured full-N4 flow grid, clipped before execution, with integer timesteps. */
export function literalAnimaDpmpp2mImageNativePlan(caseName) {
  assert.ok(['neighbor', 'history'].includes(caseName), 'Unknown DPM++2M native case.')
  const neighbor = caseName === 'neighbor'
  return Object.freeze({
    beginIndex: neighbor ? 2 : 1,
    guidanceScale: 4,
    height: 256,
    initialSigma: neighbor ? 0.7496247887611389 : 0.8996397852897644,
    mode: 'img2img',
    posteriorSeed: 2654435769,
    scheduler: 'dpmpp_2m',
    seed: 0,
    sigmas: Object.freeze(
      neighbor
        ? [0.7496247887611389, 0.4996665418148041, 0]
        : [0.8996397852897644, 0.7496247887611389, 0.4996665418148041, 0],
    ),
    startStep: neighbor ? 2 : 1,
    steps: 4,
    stepSeed: 0,
    strength: neighbor ? 0.5 : 0.75,
    timesteps: Object.freeze(neighbor ? [749, 499] : [899, 749, 499]),
    totalSteps: neighbor ? 2 : 3,
    version: 'anima-flow-denoising-v1',
    width: 256,
  })
}

function assertExpectedItem(expected) {
  assert.deepEqual(
    expected,
    literalAnimaDpmpp2mImagePlan('baseline', expected?.mode, expected?.case).items[0],
    'The expected DPM++2M item must be the complete independent finite case.',
  )
}

function contextSampling(caseName) {
  return {
    animaMethod: 'dpmpp_2m',
    cfgScale: 4,
    requestedSeedPolicy: 'fixed',
    seed: 0,
    seedBehavior: 'per-iteration',
    steps: 4,
    denoisingStrength: caseName === 'neighbor' ? 0.5 : 0.75,
  }
}

export function assertAnimaDpmpp2mImageFrozen(frozen, expectedItem, reference) {
  assertExpectedItem(expectedItem)
  // Validate every changed semantic slot against our own literals BEFORE projecting a common
  // validation view. Replacing these fields must never conceal actual native input corruption.
  assert.deepEqual(frozen?.context?.sampling, contextSampling(expectedItem.case))
  assert.deepEqual(
    frozen?.workerJob?.sampling,
    literalAnimaDpmpp2mImageNativePlan(expectedItem.case),
  )
  const commonView = structuredClone(frozen)
  commonView.context.sampling.animaMethod = 'heun'
  commonView.context.sampling.denoisingStrength = 0.5
  commonView.workerJob.sampling = commonNativePlan()
  assertCommonFrozen(commonView, commonPlan('baseline', expectedItem.mode).items[0], reference)
}

export function assertAnimaDpmpp2mImageConfiguration(config, expectedItem, reference) {
  assertExpectedItem(expectedItem)
  assert.deepEqual(config?.sampling, {
    actualSeed: 0,
    animaMethod: 'dpmpp_2m',
    cfgScale: 4,
    requestedSeedPolicy: 'fixed',
    seedBehavior: 'per-iteration',
    steps: 4,
    denoisingStrength: expectedItem.denoisingStrength,
  })
  const commonView = structuredClone(config)
  commonView.sampling.animaMethod = 'heun'
  commonView.sampling.denoisingStrength = 0.5
  assertCommonConfiguration(
    commonView,
    commonPlan('baseline', expectedItem.mode).items[0],
    reference,
  )
}

/** Retain original DPM method/strength/grid/resource/target semantics; omit only document IDs. */
export function normalizeAnimaDpmpp2mImageNativeInputs(frozen) {
  assert.ok(['anima-img2img', 'anima-outpaint'].includes(frozen?.kind))
  const strength = frozen?.context?.sampling?.denoisingStrength
  assert.ok(
    [0.5, 0.75].includes(strength),
    'Only the finite authored DPM++2M strengths are allowed.',
  )
  const caseName = strength === 0.5 ? 'neighbor' : 'history'
  literalAnimaDpmpp2mImagePlan('baseline', frozen.kind.slice('anima-'.length), caseName)
  assert.deepEqual(frozen.context.sampling, contextSampling(caseName))
  assert.deepEqual(frozen.workerJob?.sampling, literalAnimaDpmpp2mImageNativePlan(caseName))
  const normalized = structuredClone({
    kind: frozen.kind,
    context: frozen.context,
    workerJob: frozen.workerJob,
  })
  delete normalized.context.documentId
  delete normalized.context.documentRevision
  return normalized
}
