/** Actual shared completion cache; collectors double only external capture/verification work. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  awaitVerifiedCompletions,
  createStickyCompletionCache,
} from './installed-dynamic-batch-driver.mjs'

test('a retained raw completion cannot clear numerical RED on repeated or concurrent observation', async () => {
  const cache = createStickyCompletionCache()
  const raw = []
  const numericalRed = new Error('same-input pixels differ')
  let verificationCalls = 0
  let release
  const barrier = new Promise((resolve) => {
    release = resolve
  })
  const first = cache.observe('seed-1', async () => {
    raw.push({ accepted: false, pixelSha256: 'mutant' })
    await barrier
    verificationCalls++
    throw numericalRed
  })
  const pendingRetry = cache.observe('seed-1', async () =>
    assert.fail('Concurrent retry cannot recapture.'),
  )
  const observed = Promise.allSettled([first, pendingRetry])
  release()
  for (const result of await observed) {
    assert.equal(result.status, 'rejected')
    assert.equal(result.reason, numericalRed)
  }
  for (let attempt = 0; attempt < 3; attempt++)
    await assert.rejects(
      cache.observe('seed-1', async () => assert.fail('Retry cannot bypass RED.')),
      (error) => error === numericalRed,
    )
  assert.equal(raw.length, 1)
  assert.equal(raw[0].accepted, false)
  assert.equal(verificationCalls, 1)
  let neighborCalls = 0
  const neighbor = { accepted: false, pixelSha256: 'healthy' }
  assert.equal(
    await cache.observe('seed-0', async () => {
      neighborCalls++
      return neighbor
    }),
    neighbor,
  )
  assert.equal(
    await cache.observe('seed-0', async () => assert.fail('GREEN is observed once.')),
    neighbor,
  )
  assert.equal(neighborCalls, 1)
  await assert.rejects(
    cache.observe('seed-1', () => neighbor),
    (error) => error === numericalRed,
  )
})

test('capture failure stays closed and invalid identities cannot alias another completion', async () => {
  const cache = createStickyCompletionCache()
  const captureFailure = new Error('receipt unavailable')
  let calls = 0
  await assert.rejects(
    cache.observe('job', () => {
      calls++
      throw captureFailure
    }),
    (error) => error === captureFailure,
  )
  await assert.rejects(
    cache.observe('job', () => ({ accepted: true })),
    (error) => error === captureFailure,
  )
  assert.equal(calls, 1)
  for (const id of ['', undefined, null, 1]) assert.throws(() => cache.observe(id, () => {}))
  assert.throws(() => cache.observe('other-job', null))
})

test('batch waits for terminal completion then numerical RED rejects directly before acceptance', async () => {
  let release
  const terminal = new Promise((resolve) => {
    release = resolve
  })
  const events = []
  const numericalRed = new Error('seed1 pixels differ')
  let accepted = false
  const verification = awaitVerifiedCompletions({
    waitForCompleted: async () => {
      events.push('waiting')
      await terminal
      events.push('completed')
    },
    admitted: [{ id: 'seed0' }, { id: 'seed1' }],
    observeCompleted: async (row, index) => {
      events.push(`${row.id}/${index}`)
      if (row.id === 'seed1') throw numericalRed
    },
  }).then(() => {
    accepted = true
  })
  const rejected = assert.rejects(verification, (error) => error === numericalRed)
  await Promise.resolve()
  assert.deepEqual(events, ['waiting'])
  release()
  await rejected
  assert.deepEqual(events, ['waiting', 'completed', 'seed0/0', 'seed1/1'])
  assert.equal(accepted, false)
  const neighbor = []
  await awaitVerifiedCompletions({
    waitForCompleted: async () => neighbor.push('complete'),
    admitted: [{ id: 'a' }, { id: 'b' }],
    observeCompleted: async (row) => neighbor.push(row.id),
  })
  assert.deepEqual(neighbor, ['complete', 'a', 'b'])
  let observed = false
  await assert.rejects(
    awaitVerifiedCompletions({
      waitForCompleted: async () => {
        throw new Error('failed queue')
      },
      admitted: [{ id: 'a' }],
      observeCompleted: () => {
        observed = true
      },
    }),
    /failed queue/,
  )
  assert.equal(observed, false)
})
