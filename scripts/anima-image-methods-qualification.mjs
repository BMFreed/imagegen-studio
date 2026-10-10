/** Independent finite native literals; common image/resource assertions retain their boundary. */
import assert from 'node:assert/strict'

import {
  assertAnimaHeunImageConfiguration as assertCommonConfiguration,
  assertAnimaHeunImageFrozen as assertCommonFrozen,
  literalAnimaHeunImageNativePlan as commonNativePlan,
  literalAnimaHeunImagePlan as commonPlan,
  validateAnimaHeunImageFixture as validateCommonFixture,
} from './anima-heun-image-qualification.mjs'

export {
  assertAnimaHeunImageOutputPixels as assertAnimaImageMethodsOutputPixels,
  assertAnimaHeunImageSavedPixels as assertAnimaImageMethodsSavedPixels,
  assertAnimaHeunImageTargetPixels as assertAnimaImageMethodsTargetPixels,
  literalAnimaHeunImageContributionAlpha as literalAnimaImageMethodsContributionAlpha,
  literalAnimaHeunImageTargetAlpha as literalAnimaImageMethodsTargetAlpha,
} from './anima-heun-image-qualification.mjs'

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

/**
 * Closed three-method registry. Every native object is independently literal, including seed
 * domains, authored-N clipping, float32 sigmas and the method's native timestep representation. ER
 * retains the same N5 grid for both cases; LCM's grid has already received shift3 exactly once.
 */
export const ANIMA_IMAGE_METHODS_REGISTRY = freeze({
  dpmpp_2m_sde: {
    label: 'DPM++ 2M SDE',
    mutationModule: 'anima_sampling.py',
    native: {
      neighbor: {
        beginIndex: 2,
        guidanceScale: 4,
        height: 256,
        initialSigma: 0.7496247887611389,
        mode: 'img2img',
        posteriorSeed: 2654435769,
        scheduler: 'dpmpp_2m_sde',
        seed: 0,
        sigmas: [0.7496247887611389, 0.4996665418148041, 0],
        startStep: 2,
        steps: 4,
        stepSeed: 0,
        strength: 0.5,
        timesteps: [749, 499],
        totalSteps: 2,
        version: 'anima-flow-denoising-v1',
        width: 256,
      },
      history: {
        beginIndex: 1,
        guidanceScale: 4,
        height: 256,
        initialSigma: 0.8996397852897644,
        mode: 'img2img',
        posteriorSeed: 2654435769,
        scheduler: 'dpmpp_2m_sde',
        seed: 0,
        sigmas: [0.8996397852897644, 0.7496247887611389, 0.4996665418148041, 0],
        startStep: 1,
        steps: 4,
        stepSeed: 0,
        strength: 0.75,
        timesteps: [899, 749, 499],
        totalSteps: 3,
        version: 'anima-flow-denoising-v1',
        width: 256,
      },
    },
  },
  er_sde: {
    label: 'ER-SDE',
    mutationModule: 'vendor/er_sde_scheduler.py',
    native: {
      neighbor: {
        beginIndex: 2,
        guidanceScale: 4,
        height: 256,
        initialSigma: 0.8181818127632141,
        mode: 'img2img',
        posteriorSeed: 2654435769,
        scheduler: 'er_sde',
        seed: 0,
        sigmas: [0.8181818127632141, 0.6666666865348816, 0.4285714328289032, 0],
        startStep: 2,
        steps: 5,
        stepSeed: 0,
        strength: 0.5,
        timesteps: [818.1818237304688, 666.6666870117188, 428.5714416503906],
        totalSteps: 3,
        version: 'anima-flow-denoising-v1',
        width: 256,
      },
      history: {
        beginIndex: 1,
        guidanceScale: 4,
        height: 256,
        initialSigma: 0.9230769276618958,
        mode: 'img2img',
        posteriorSeed: 2654435769,
        scheduler: 'er_sde',
        seed: 0,
        sigmas: [0.9230769276618958, 0.8181818127632141, 0.6666666865348816, 0.4285714328289032, 0],
        startStep: 1,
        steps: 5,
        stepSeed: 0,
        strength: 0.75,
        timesteps: [923.076904296875, 818.1818237304688, 666.6666870117188, 428.5714416503906],
        totalSteps: 4,
        version: 'anima-flow-denoising-v1',
        width: 256,
      },
    },
  },
  lcm: {
    label: 'LCM',
    mutationModule: 'anima_sampling.py',
    native: {
      neighbor: {
        beginIndex: 2,
        guidanceScale: 4,
        height: 256,
        initialSigma: 0.75,
        mode: 'img2img',
        posteriorSeed: 2654435769,
        scheduler: 'lcm',
        seed: 0,
        sigmas: [0.75, 0.5, 0],
        startStep: 2,
        steps: 4,
        stepSeed: 0,
        strength: 0.5,
        timesteps: [750, 500],
        totalSteps: 2,
        version: 'anima-flow-denoising-v1',
        width: 256,
      },
      history: {
        beginIndex: 1,
        guidanceScale: 4,
        height: 256,
        initialSigma: 0.8999999761581421,
        mode: 'img2img',
        posteriorSeed: 2654435769,
        scheduler: 'lcm',
        seed: 0,
        sigmas: [0.8999999761581421, 0.75, 0.5, 0],
        startStep: 1,
        steps: 4,
        stepSeed: 0,
        strength: 0.75,
        timesteps: [900, 750, 500],
        totalSteps: 3,
        version: 'anima-flow-denoising-v1',
        width: 256,
      },
    },
  },
})

export function animaImageMethodDefinition(method) {
  assert.ok(
    typeof method === 'string' && Object.hasOwn(ANIMA_IMAGE_METHODS_REGISTRY, method),
    'Only the three declared Anima image methods are qualified.',
  )
  return ANIMA_IMAGE_METHODS_REGISTRY[method]
}

export function literalAnimaImageMethodsNativePlan(method, caseName) {
  const definition = animaImageMethodDefinition(method)
  assert.ok(['neighbor', 'history'].includes(caseName), 'Unknown Anima image-method case.')
  return definition.native[caseName]
}

/** Exactly eight admitted stages/modes/cases per method; one ordinary signed item per run. */
export function literalAnimaImageMethodsPlan(stage, method, mode, caseName) {
  const native = literalAnimaImageMethodsNativePlan(method, caseName)
  assert.ok(caseName !== 'neighbor' || mode === 'img2img', 'Neighbor OUT is outside the matrix.')
  assert.ok(
    caseName !== 'neighbor' || stage !== 'restored',
    'The neighbor admits baseline/control stages only.',
  )
  const common = commonPlan(stage, mode)
  return freeze({
    ...common,
    method,
    case: caseName,
    steps: native.steps,
    denoisingStrength: native.strength,
    animaMethod: method,
    observedSteps: native.totalSteps,
    items: [
      {
        ...common.items[0],
        case: caseName,
        steps: native.steps,
        denoisingStrength: native.strength,
        animaMethod: method,
      },
    ],
  })
}

export function validateAnimaImageMethodsFixture(fixture) {
  assert.equal(fixture?.profile, 'anima-image-methods')
  const { method, case: caseName, ...common } = fixture
  const definition = animaImageMethodDefinition(method)
  const plan = literalAnimaImageMethodsPlan(fixture.stage, method, fixture.mode, caseName)
  if (fixture.stage === 'control') {
    assert.equal(fixture.mutation?.module, definition.mutationModule)
    common.mutation = { ...fixture.mutation, module: 'anima_sampling.py' }
  }
  // The exact changed discriminator/module was checked first. Retain every other input key so
  // common envelope/resource/path/source/one-delta guards still reject unknown fields.
  validateCommonFixture({ ...common, profile: 'anima-heun-image' })
  return plan
}

function assertExpectedItem(expected) {
  assert.deepEqual(
    expected,
    literalAnimaImageMethodsPlan('baseline', expected?.animaMethod, expected?.mode, expected?.case)
      .items[0],
    'Expected item must equal the complete independent finite case.',
  )
}

function contextSampling(method, caseName) {
  const native = literalAnimaImageMethodsNativePlan(method, caseName)
  return {
    animaMethod: method,
    cfgScale: 4,
    requestedSeedPolicy: 'fixed',
    seed: 0,
    seedBehavior: 'per-iteration',
    steps: native.steps,
    denoisingStrength: native.strength,
  }
}

export function assertAnimaImageMethodsFrozen(frozen, expectedItem, reference) {
  assertExpectedItem(expectedItem)
  // Validate the full actual native object BEFORE replacing any slot in the common view.
  assert.deepEqual(
    frozen?.context?.sampling,
    contextSampling(expectedItem.animaMethod, expectedItem.case),
  )
  assert.deepEqual(
    frozen?.workerJob?.sampling,
    literalAnimaImageMethodsNativePlan(expectedItem.animaMethod, expectedItem.case),
  )
  const commonView = structuredClone(frozen)
  commonView.context.sampling.animaMethod = 'heun'
  commonView.context.sampling.steps = 4
  commonView.context.sampling.denoisingStrength = 0.5
  commonView.workerJob.sampling = commonNativePlan()
  assertCommonFrozen(commonView, commonPlan('baseline', expectedItem.mode).items[0], reference)
}

export function assertAnimaImageMethodsConfiguration(config, expectedItem, reference) {
  assertExpectedItem(expectedItem)
  const { seed, ...sampling } = contextSampling(expectedItem.animaMethod, expectedItem.case)
  assert.deepEqual(config?.sampling, { actualSeed: seed, ...sampling })
  const commonView = structuredClone(config)
  commonView.sampling.animaMethod = 'heun'
  commonView.sampling.steps = 4
  commonView.sampling.denoisingStrength = 0.5
  assertCommonConfiguration(
    commonView,
    commonPlan('baseline', expectedItem.mode).items[0],
    reference,
  )
}

/** Preserve all execution semantics; omit only document identity from captured native inputs. */
export function normalizeAnimaImageMethodsNativeInputs(frozen) {
  assert.ok(['anima-img2img', 'anima-outpaint'].includes(frozen?.kind))
  const method = frozen?.context?.sampling?.animaMethod
  const strength = frozen?.context?.sampling?.denoisingStrength
  assert.ok([0.5, 0.75].includes(strength), 'Only the two authored finite strengths are allowed.')
  const caseName = strength === 0.5 ? 'neighbor' : 'history'
  literalAnimaImageMethodsPlan('baseline', method, frozen.kind.slice('anima-'.length), caseName)
  assert.deepEqual(frozen.context.sampling, contextSampling(method, caseName))
  assert.deepEqual(frozen.workerJob?.sampling, literalAnimaImageMethodsNativePlan(method, caseName))
  const normalized = structuredClone({
    kind: frozen.kind,
    context: frozen.context,
    workerJob: frozen.workerJob,
  })
  delete normalized.context.documentId
  delete normalized.context.documentRevision
  return normalized
}
