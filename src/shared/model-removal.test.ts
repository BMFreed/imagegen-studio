import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { isModelRemovalId, isModelRemovalReview } from './model-removal.js'

const review = () => ({
  fileCount: 2,
  name: 'Exact resource',
  pendingJobs: 3,
  resourceId: randomUUID(),
  runningJobs: 1,
  sharedFileCount: 1,
  token: randomUUID(),
  versionCount: 2,
})

test('removal review admits explicit zero/nonzero use counts without exposing queue or path capabilities', () => {
  const value = review()
  assert.equal(isModelRemovalReview(structuredClone(value)), true)
  assert.equal(isModelRemovalReview({ ...value, pendingJobs: 0, runningJobs: 0 }), true)
  for (const extra of [
    { path: '/models/file' },
    { pending: [] },
    { payloadSha256: 'a'.repeat(64) },
  ]) {
    assert.equal(isModelRemovalReview({ ...value, ...extra }), false)
  }
})

test('legacy missing use counts and invalid counts cannot be treated as zero by the IPC consumer', () => {
  const value = review()
  for (const field of [
    'pendingJobs',
    'runningJobs',
    'fileCount',
    'sharedFileCount',
    'versionCount',
  ] as const) {
    const missing: Record<string, unknown> = { ...value }
    delete missing[field]
    assert.equal(isModelRemovalReview(missing), false)
    for (const invalid of [
      -1,
      0.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      '0',
      false,
      null,
      undefined,
      [],
    ]) {
      assert.equal(isModelRemovalReview({ ...value, [field]: invalid }), false, field)
    }
  }
  assert.equal(isModelRemovalReview({ ...value, sharedFileCount: 3 }), false)
  assert.equal(isModelRemovalReview({ ...value, versionCount: 0 }), false)
  assert.equal(isModelRemovalReview({ ...value, name: '' }), false)
})

test('opaque removal IDs reject paths, numbers, empty and malformed UUIDs', () => {
  assert.equal(isModelRemovalId(randomUUID()), true)
  for (const invalid of ['', '/tmp/model', '../model', 1, null, {}, `${randomUUID()}-extra`]) {
    assert.equal(isModelRemovalId(invalid), false)
    assert.equal(isModelRemovalReview({ ...review(), token: invalid }), false)
    assert.equal(isModelRemovalReview({ ...review(), resourceId: invalid }), false)
  }
})
