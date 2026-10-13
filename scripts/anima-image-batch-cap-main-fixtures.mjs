/**
 * Real Anima image preparation/expansion, SQLite/private inputs, request reconstruction,
 * staging/receipt/cursor and accepted projection. Resources, LaMa identity, source composition,
 * Project ownership and output PNGs are controlled collaborators. No installed ML or public
 * Add/Save claim. Refusal observes an empty own database; native tests own preserving32 results.
 */
import assert from 'node:assert/strict'
import {
  authoring as baseAuthoring,
  installedFixture,
  produced as baseProduced,
  resource,
} from './anima-dynamic-image-main-fixtures.mjs'

export { installedFixture, resource }

function inputs(stage) {
  assert.ok(['boundary', 'prefix', 'concrete31', 'plain', 'refusal'].includes(stage))
  const concretePair = stage === 'concrete31' || stage === 'refusal'
  return {
    recipe:
      stage === 'prefix'
        ? { iterations: 2, maxPrompts: 3, seedBehavior: 'per-prompt' }
        : concretePair
          ? {
              iterations: stage === 'refusal' ? 33 : 31,
              maxPrompts: 1,
              seedBehavior: 'per-iteration',
            }
          : { iterations: 8, seedBehavior: 'per-iteration' },
    seed: { policy: 'fixed', value: 0 },
    ...(concretePair ? { concretePair: true } : {}),
    ...(stage === 'refusal' ? { observeRefusal: true } : {}),
    ...(stage === 'plain' ? { plain: true } : {}),
  }
}

export function authoring(reference, stage, mode) {
  const options = inputs(stage)
  const draft = baseAuthoring(reference, 'baseline', mode, options)
  if (stage === 'plain') {
    draft.positivePrompt.text = 'a red ceramic cup on a wooden table, studio photograph'
    draft.negativePrompt.text = 'blurry, low quality'
  }
  return draft
}

export async function produced(reference, stage, mode) {
  const caller = inputs(stage)
  const authoredCallerOptions = structuredClone(caller)
  const pending = baseProduced(reference, 'baseline', mode, caller)
  // Retained caller aliases change at the first real asynchronous PNG construction.
  // No expanded item, compiled span, prepared plan, frozen context or refusal is supplied.
  caller.seed.value = 37
  caller.recipe.iterations = 7
  caller.recipe.maxPrompts = 1
  caller.recipe.seedBehavior =
    authoredCallerOptions.recipe.seedBehavior === 'per-prompt' ? 'per-iteration' : 'per-prompt'
  caller.concretePair = false
  caller.observeRefusal = false
  const actual = await pending
  return { ...actual, authoredCallerOptions, callerOptionsAfterFirstAwait: structuredClone(caller) }
}
