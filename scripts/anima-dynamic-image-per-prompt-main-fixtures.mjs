/**
 * Only the finite authoring recipe changes. Actual preparation, expansion, queue/request/staging
 * and accepted projection remain the shared real Main owners, with the same declared collaborators.
 * No expanded prompt, resolved seed, frozen row or accepted configuration is supplied by this
 * file.
 */
import assert from 'node:assert/strict'
import {
  authoring as baseAuthoring,
  installedFixture,
  produced as baseProduced,
  resource,
} from './anima-dynamic-image-main-fixtures.mjs'

export { installedFixture, resource }

function recipe(stage) {
  assert.ok(['numeric-control', 'per-prompt'].includes(stage))
  return stage === 'numeric-control'
    ? { iterations: 8, seedBehavior: 'per-iteration' }
    : { iterations: 2, seedBehavior: 'per-prompt' }
}

export function authoring(reference, stage, mode) {
  return baseAuthoring(reference, 'baseline', mode, { recipe: recipe(stage) })
}

export async function produced(reference, stage, mode, options = {}) {
  assert.deepEqual(Object.keys(options), options.plain === undefined ? [] : ['plain'])
  assert.ok(options.plain === undefined || (options.plain === true && stage === 'numeric-control'))
  return await baseProduced(reference, 'baseline', mode, { ...options, recipe: recipe(stage) })
}
