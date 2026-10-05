import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MODEL_MANAGER_READ_KINDS, ModelManagerReadGuard } from './model-manager-read-guard.js'

for (const kind of MODEL_MANAGER_READ_KINDS) {
  test(`a newer ${kind} request supersedes only its own pending read`, () => {
    const guard = new ModelManagerReadGuard(() => true)
    const pending = new Map(MODEL_MANAGER_READ_KINDS.map((key) => [key, guard.begin(key)]))
    const latest = guard.begin(kind)

    assert.equal(latest(), true)
    for (const [key, current] of pending) {
      assert.equal(current(), key !== kind)
    }
  })
}

test('closing and reopening invalidate every earlier read and loading owner', () => {
  let visible = true
  const guard = new ModelManagerReadGuard(() => visible)
  const pending = MODEL_MANAGER_READ_KINDS.map((kind) => guard.begin(kind))
  visible = false
  assert.ok(pending.every((current) => !current()))
  guard.invalidateAll()
  visible = true

  assert.ok(pending.every((current) => !current()))
  assert.ok(MODEL_MANAGER_READ_KINDS.every((kind) => guard.begin(kind)()))
})

test('explicit invalidation supersedes one pending read without invalidating sibling reads', () => {
  const guard = new ModelManagerReadGuard(() => true)
  const jobs = guard.begin('jobs')
  const catalog = guard.begin('catalog')
  const refresh = guard.begin('refresh')
  guard.invalidate('jobs')

  assert.equal(jobs(), false)
  assert.equal(catalog(), true)
  assert.equal(refresh(), true)
  assert.equal(guard.begin('jobs')(), true)
})

test('a saved token status supersedes an older status read without discarding another resource read', () => {
  const guard = new ModelManagerReadGuard(() => true)
  const token = guard.begin('token')
  const catalog = guard.begin('catalog')
  guard.invalidate('token')

  assert.equal(token(), false)
  assert.equal(catalog(), true)
  assert.equal(guard.begin('token')(), true)
})

test('disposed presentation cannot accept an existing or later read even if visibility becomes true', () => {
  const guard = new ModelManagerReadGuard(() => true)
  const pending = MODEL_MANAGER_READ_KINDS.map((kind) => guard.begin(kind))
  guard.dispose()

  assert.ok(pending.every((current) => !current()))
  assert.ok(MODEL_MANAGER_READ_KINDS.every((kind) => !guard.begin(kind)()))
})
