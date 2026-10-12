/**
 * Actual Anima IMG/normal OUT preparation, expansion, queue, requests, staging and provenance.
 * Operational seed and saved snapshot are supplied scalar preconditions, not recovered SQLite
 * state. Existing scoped-reader tests and the native crash/recovery gate own that separate proof.
 * Exact resources/LaMa/Project ownership/source composition/output PNGs are controlled; no ML,
 * native crypto, public Add/Undo, explicit Save or physical crash claim.
 */
import assert from 'node:assert/strict'
import {
  authoring as baseAuthoring,
  installedFixture,
  produced as baseProduced,
  resource,
} from './anima-dynamic-image-main-fixtures.mjs'

export { installedFixture, resource }

const uint32 = (value) => {
  assert.ok(Number.isSafeInteger(value) && value >= 0 && value <= 4294967295)
  return value
}

export function authoring(reference, stage, mode, baseSeed = 0) {
  assert.ok(['reuse', 'fixed', 'crash'].includes(stage))
  uint32(baseSeed)
  return baseAuthoring(reference, stage === 'crash' ? 'prefix' : 'baseline', mode, {
    recipe: { iterations: stage === 'crash' ? 3 : 2, seedBehavior: 'per-prompt' },
    seed:
      stage === 'reuse' ? { policy: 'reuse', value: null } : { policy: 'fixed', value: baseSeed },
  })
}

export async function produced(reference, stage, mode, options = {}) {
  assert.ok(['reuse', 'fixed', 'crash'].includes(stage))
  assert.ok(Object.keys(options).every((key) => key === 'baseSeed' || key === 'plain'))
  const baseSeed = uint32(options.baseSeed === undefined ? 0 : options.baseSeed)
  assert.ok(
    options.plain === undefined || (options.plain === true && stage === 'fixed' && baseSeed === 0),
  )
  const caller = {
    recipe: options.plain
      ? { iterations: 8, seedBehavior: 'per-iteration' }
      : { iterations: stage === 'crash' ? 3 : 2, seedBehavior: 'per-prompt' },
    seed:
      stage === 'reuse' ? { policy: 'reuse', value: null } : { policy: 'fixed', value: baseSeed },
    // Fixed0's neighbor sees a conflicting operational31/saved91 but must ignore both.
    lastActualSeed: stage === 'crash' ? undefined : stage === 'reuse' ? baseSeed : 31,
    lastActualSeedSnapshot: stage === 'crash' ? null : 91,
    ...(options.plain ? { plain: true } : {}),
  }
  const authoredCallerOptions = structuredClone(caller)
  // 'crash' supplies the actual three-admission input precondition only. All three controlled
  // candidate PNGs are published normally here; this API never simulates a physical crash.
  const pending = baseProduced(reference, stage === 'crash' ? 'prefix' : 'baseline', mode, caller)
  // Mutate aliases during the real producer's first async PNG construction. Its captured scalar
  // seed preconditions must remain distinct from these caller edits and later publication edits.
  caller.seed.policy = 'fixed'
  caller.seed.value = 91
  caller.recipe.iterations = 8
  caller.recipe.seedBehavior = 'per-iteration'
  caller.lastActualSeed = 765
  caller.lastActualSeedSnapshot = 766
  const actual = await pending
  return {
    ...actual,
    authoredCallerOptions,
    callerOptionsAfterFirstAwait: structuredClone(caller),
    suppliedSeedPreconditions: {
      kind: 'supplied operational/saved scalar preconditions',
      scopedSqliteReadClaim: false,
      crashRecoveryClaim: false,
      operationalSeed: authoredCallerOptions.lastActualSeed,
      savedSnapshot: authoredCallerOptions.lastActualSeedSnapshot,
    },
  }
}
