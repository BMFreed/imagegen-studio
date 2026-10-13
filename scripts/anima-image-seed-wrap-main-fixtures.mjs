/**
 * Actual Anima IMG/normal OUT preparation, expansion, SQLite/private inputs, requests, staging and
 * accepted-provenance projection. Exact resource/LaMa/Project ownership, source composition and
 * output PNGs are controlled preconditions. No native inference, public Add/Undo or Save claim. The
 * one-pair recipes author literal weighted prompts; production owns the seed schedule.
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
  assert.ok(['control-max', 'control-zero', 'wrap', 'zero-two', 'plain'].includes(stage))
  return {
    recipe:
      stage === 'plain'
        ? { iterations: 8, seedBehavior: 'per-iteration' }
        : {
            iterations: stage === 'wrap' || stage === 'zero-two' ? 2 : 1,
            seedBehavior: 'per-prompt',
          },
    seed: {
      policy: 'fixed',
      value: stage === 'control-max' || stage === 'wrap' ? 4294967295 : 0,
    },
    // Conflicting scalar preconditions must not change any Fixed input. They are not SQL reads.
    lastActualSeed: 31,
    lastActualSeedSnapshot: 91,
    ...(stage === 'plain' ? { plain: true } : {}),
  }
}

export function authoring(reference, stage, mode) {
  const options = inputs(stage)
  const draft = baseAuthoring(reference, stage === 'plain' ? 'baseline' : 'prefix', mode, options)
  if (stage === 'plain') {
    draft.positivePrompt.text = 'a red ceramic cup on a wooden table, studio photograph'
    draft.negativePrompt.text = 'blurry, low quality'
  }
  return draft
}

export async function produced(reference, stage, mode) {
  const caller = inputs(stage)
  const authoredCallerOptions = structuredClone(caller)
  const pending = baseProduced(reference, stage === 'plain' ? 'baseline' : 'prefix', mode, caller)
  // Aliases change during real asynchronous PNG construction, before qualification/publication.
  // Captured Fixed seed and recipe must survive independently of these retained caller edits.
  caller.seed.policy = 'random'
  caller.seed.value = null
  caller.recipe.iterations = 8
  caller.recipe.seedBehavior = 'per-iteration'
  caller.lastActualSeed = 765
  caller.lastActualSeedSnapshot = 766
  const actual = await pending
  return {
    ...actual,
    authoredCallerOptions,
    callerOptionsAfterFirstAwait: structuredClone(caller),
  }
}
