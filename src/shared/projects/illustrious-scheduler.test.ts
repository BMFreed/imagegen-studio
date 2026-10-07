import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ILLUSTRIOUS_SCHEDULER_PAIRS,
  isIllustriousSamplingDraftPair,
  resolveIllustriousScheduler,
} from './illustrious-scheduler.js'

test('ordinary Euler and Euler ancestral retain distinct exact keys and valid draft pairs', () => {
  for (const { invokeKey, sampler, scheduler } of ILLUSTRIOUS_SCHEDULER_PAIRS) {
    assert.equal(isIllustriousSamplingDraftPair(sampler, null), true)
    assert.equal(isIllustriousSamplingDraftPair(sampler, scheduler), true)
    assert.deepEqual(resolveIllustriousScheduler(sampler, scheduler), {
      key: invokeKey,
      kind: 'supported',
    })
  }
  assert.deepEqual(resolveIllustriousScheduler('Euler', 'Normal'), {
    key: 'euler',
    kind: 'supported',
  })
  assert.deepEqual(resolveIllustriousScheduler('Euler a', 'Normal'), {
    key: 'euler_a',
    kind: 'supported',
  })
  assert.equal(isIllustriousSamplingDraftPair(null, null), true)
  assert.deepEqual(resolveIllustriousScheduler(null, null), { kind: 'missing' })
  assert.deepEqual(resolveIllustriousScheduler('Euler', null), { kind: 'unsupported' })
})

test('Euler rejects Karras and display/key aliases rather than borrowing ancestral or Anima spelling', () => {
  for (const [sampler, scheduler] of [
    ['Euler', 'Karras'],
    ['Euler a', 'Karras'],
    ['euler', 'Normal'],
    ['euler_a', 'Normal'],
    ['Euler A', 'Normal'],
    ['Euler', 'normal'],
    [null, 'Normal'],
  ] as const) {
    assert.equal(isIllustriousSamplingDraftPair(sampler, scheduler), false)
    assert.deepEqual(resolveIllustriousScheduler(sampler, scheduler), { kind: 'unsupported' })
  }
})
