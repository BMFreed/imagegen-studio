/** The real injected adapters must route each family/objective to its existing literal oracle. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { animaDynamicBatchProfile } from './anima-dynamic-batch-profile.mjs'
import {
  assertDynamicBatchFrozen as animaFrozen,
  validateDynamicBatchFixture as animaFixture,
} from './anima-dynamic-batch-qualification.mjs'
import { illustriousDynamicBatchProfile } from './illustrious-dynamic-batch-profile.mjs'
import {
  assertDynamicBatchFrozen as illustriousFrozen,
  validateDynamicBatchFixture as illustriousFixture,
} from './illustrious-dynamic-batch-qualification.mjs'

function fixture(profile, objective) {
  const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/adapter-unit')
  return {
    schemaVersion: 1,
    profile,
    stage: 'iteration',
    ...(objective ? { objective } : {}),
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    artifacts: path.join(root, 'output'),
  }
}

test('Anima adapter preserves its existing literal validator and Euler-to-Heun UI route', () => {
  const adapter = animaDynamicBatchProfile
  assert.equal(adapter.validateFixture, animaFixture)
  assert.equal(adapter.assertFrozen, animaFrozen)
  const input = fixture('anima-dynamic-batch')
  const plan = adapter.validateFixture(input)
  assert.equal(plan.expectedAdmissions, 8)
  assert.deepEqual(
    plan.items.map(({ seed }) => seed),
    [0, 1, 0, 1, 0, 1, 0, 1],
  )
  assert.equal(adapter.modelKey(input), 'anima')
  assert.equal(adapter.loraKey, 'animaLora')
  assert.equal(adapter.operation, 'anima-txt2img')
  assert.equal(adapter.cfgScale, 4)
  assert.deepEqual(adapter.originalSourceKeys(input), ['encoder', 'vae', 'anima', 'animaLora'])
  assert.deepEqual(adapter.sampling(input), {
    label: 'Anima method',
    draftKey: 'animaMethod',
    value: 'Euler',
    code: 'euler',
    editedValue: 'Heun',
    editedCode: 'heun',
  })
})

test('Illustrious adapters preserve EPS/V checkpoint identity and opposite valid sampler edits', () => {
  const adapter = illustriousDynamicBatchProfile
  assert.equal(adapter.validateFixture, illustriousFixture)
  assert.equal(adapter.assertFrozen, illustriousFrozen)
  for (const [objective, modelKey, sampler, edited] of [
    ['epsilon', 'illustriousEpsilon', 'Euler a', 'Euler'],
    ['v_prediction', 'illustrious', 'Euler', 'Euler a'],
  ]) {
    const input = fixture('illustrious-dynamic-batch', objective)
    const plan = adapter.validateFixture(input)
    assert.equal(plan.expectedAdmissions, 8)
    assert.deepEqual(
      plan.items.map(({ seed }) => seed),
      [0, 1, 0, 1, 0, 1, 0, 1],
    )
    assert.equal(adapter.modelKey(input), modelKey)
    assert.equal(adapter.loraKey, 'illustriousLora')
    assert.equal(adapter.operation, 'illustrious-txt2img')
    assert.equal(adapter.cfgScale, 5)
    assert.deepEqual(adapter.originalSourceKeys(input), [
      modelKey,
      'illustriousLora',
      'externalVaeNative',
    ])
    assert.deepEqual(adapter.sampling(input), {
      label: 'Sampler',
      draftKey: 'sampler',
      value: sampler,
      code: sampler,
      editedValue: edited,
      editedCode: edited,
      scheduler: 'Normal',
    })
  }
})

test('profile adapters reject the neighboring family and unknown objective before native work', () => {
  assert.throws(() =>
    animaDynamicBatchProfile.validateFixture(fixture('illustrious-dynamic-batch', 'epsilon')),
  )
  assert.throws(() =>
    illustriousDynamicBatchProfile.validateFixture(fixture('anima-dynamic-batch')),
  )
  for (const value of [undefined, 'anima', 'sdxl', 'EPS', 'v-prediction']) {
    const input = fixture('illustrious-dynamic-batch', value)
    assert.throws(() => illustriousDynamicBatchProfile.validateFixture(input))
    assert.throws(() => illustriousDynamicBatchProfile.modelKey(input), /Unknown dynamic objective/)
    assert.throws(() => illustriousDynamicBatchProfile.sampling(input), /Unknown dynamic objective/)
  }
})
