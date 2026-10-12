/**
 * Authored Random/Fixed seed inputs enter the actual Anima Main image owners. Only entropy,
 * resource/LaMa resolution, Project/index ownership, composed source and output pixels are
 * controlled. No expanded rows, resolved native plans or accepted configurations are supplied. This
 * CPU fixture does not prove native crypto, installed ML, public Add or Save.
 */
import assert from 'node:assert/strict'
import {
  authoring as baseAuthoring,
  installedFixture,
  produced as baseProduced,
  resource,
} from './anima-dynamic-image-main-fixtures.mjs'

export { installedFixture, resource }

const controlledBase = 2147483664
const uint32 = (value) => {
  assert.ok(Number.isSafeInteger(value) && value >= 0 && value <= 4294967295)
  return value
}
const seedFor = (stage, baseSeed) => {
  assert.ok(stage === 'random' || stage === 'replay')
  uint32(baseSeed)
  return stage === 'random'
    ? { policy: 'random', value: null }
    : { policy: 'fixed', value: baseSeed }
}

export function authoring(reference, stage, mode, baseSeed = controlledBase) {
  return baseAuthoring(reference, 'baseline', mode, {
    recipe: { iterations: 2, seedBehavior: 'per-prompt' },
    seed: seedFor(stage, baseSeed),
  })
}

export async function produced(reference, stage, mode, options = {}) {
  assert.ok(Object.keys(options).every((key) => key === 'baseSeed' || key === 'plain'))
  const baseSeed = uint32(options.baseSeed === undefined ? controlledBase : options.baseSeed)
  assert.ok(
    options.plain === undefined || (options.plain === true && stage === 'replay' && baseSeed === 0),
  )
  const caller = {
    recipe: options.plain
      ? { iterations: 8, seedBehavior: 'per-iteration' }
      : { iterations: 2, seedBehavior: 'per-prompt' },
    seed: seedFor(stage, baseSeed),
    ...(stage === 'random' ? { randomSeed: baseSeed } : {}),
    ...(options.plain ? { plain: true } : {}),
  }
  const authoredCallerOptions = structuredClone(caller)
  const pending = baseProduced(reference, 'baseline', mode, caller)
  // The real producer has reached PNG construction's first await. These retained caller inputs
  // change before preparation; later actual before-publication edits also exercise its capture.
  caller.seed.policy = 'fixed'
  caller.seed.value = 91
  caller.recipe.iterations = 8
  caller.recipe.seedBehavior = 'per-iteration'
  if (stage === 'random') caller.randomSeed = 91
  const actual = await pending
  return {
    ...actual,
    authoredCallerOptions,
    callerOptionsAfterFirstAwait: structuredClone(caller),
  }
}
