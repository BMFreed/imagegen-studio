import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isRuntimeSetupProgressSnapshot,
  RUNTIME_SETUP_PROGRESS_STAGES,
  RUNTIME_SETUP_PROGRESS_STATES,
  type RuntimeSetupProgress,
  type RuntimeSetupProgressSnapshot,
} from './runtime-setup-progress.js'

const operation = (): RuntimeSetupProgress => ({
  bytesDownloaded: null,
  bytesTotal: null,
  mode: 'install',
  operationId: '11111111-1111-4111-8111-111111111111',
  stage: 'preparing',
  state: 'running',
})
const snapshot = (): RuntimeSetupProgressSnapshot => ({ operation: operation(), revision: 1 })

test('setup progress validates the finite phase/state domain without declaring installation readiness', () => {
  assert.equal(isRuntimeSetupProgressSnapshot({ operation: null, revision: 0 }), true)
  assert.equal(isRuntimeSetupProgressSnapshot({ operation: null, revision: 12 }), true)
  for (const stage of RUNTIME_SETUP_PROGRESS_STAGES) {
    for (const state of RUNTIME_SETUP_PROGRESS_STATES) {
      for (const mode of ['install', 'repair']) {
        assert.equal(
          isRuntimeSetupProgressSnapshot({
            operation: { ...operation(), mode, stage, state },
            revision: 2,
          }),
          true,
        )
      }
    }
  }
  assert.equal(isRuntimeSetupProgressSnapshot(Object.freeze(snapshot())), true)
  assert.equal(isRuntimeSetupProgressSnapshot(Object.assign(Object.create(null), snapshot())), true)
})

test('download bytes belong only to a current constituent and never imply operation completion', () => {
  for (const stage of ['downloading-runtime', 'installing-outpaint']) {
    for (const state of ['running', 'cancelling']) {
      for (const bytesDownloaded of [0, 1, 100]) {
        assert.equal(
          isRuntimeSetupProgressSnapshot({
            ...snapshot(),
            operation: { ...operation(), bytesDownloaded, bytesTotal: 100, stage, state },
          }),
          true,
        )
      }
    }
  }
  for (const [bytesDownloaded, bytesTotal] of [
    [null, 100],
    [0, null],
    [-1, 100],
    [1, 0],
    [101, 100],
    [1.5, 100],
    [0, Number.POSITIVE_INFINITY],
    [0, Number.MAX_SAFE_INTEGER + 1],
  ]) {
    assert.equal(
      isRuntimeSetupProgressSnapshot({
        ...snapshot(),
        operation: { ...operation(), bytesDownloaded, bytesTotal, stage: 'downloading-runtime' },
      }),
      false,
    )
  }
  for (const stage of ['extracting-runtime', 'checking-runtime', 'finalizing']) {
    assert.equal(
      isRuntimeSetupProgressSnapshot({
        ...snapshot(),
        operation: { ...operation(), bytesDownloaded: 1, bytesTotal: 100, stage },
      }),
      false,
    )
  }
  for (const state of ['succeeded', 'canceled', 'failed', 'recovery-required']) {
    assert.equal(
      isRuntimeSetupProgressSnapshot({
        ...snapshot(),
        operation: {
          ...operation(),
          bytesDownloaded: 100,
          bytesTotal: 100,
          stage: 'downloading-runtime',
          state,
        },
      }),
      false,
    )
  }
})

test('progress rejects malformed identity, revision, enums and private payload fields', () => {
  for (const revision of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, '1', null]) {
    assert.equal(isRuntimeSetupProgressSnapshot({ ...snapshot(), revision }), false)
  }
  for (const patch of [
    { mode: 'update' },
    { operationId: 'private-path' },
    { stage: 'downloaded' },
    { state: 'installed' },
    { detail: '/private/native/path' },
    { error: { message: '/private/native/path' } },
    { token: 'extra' },
  ]) {
    assert.equal(
      isRuntimeSetupProgressSnapshot({ ...snapshot(), operation: { ...operation(), ...patch } }),
      false,
    )
  }
  for (const patch of [{ secret: 'key' }, { progress: 50 }, { path: '/private/path' }]) {
    assert.equal(isRuntimeSetupProgressSnapshot({ ...snapshot(), ...patch }), false)
  }
  for (const malformed of [null, undefined, true, 1, '', [], new Date(), { revision: 0 }]) {
    assert.equal(isRuntimeSetupProgressSnapshot(malformed), false)
  }
})

test('plain enumerable data records are required without executing getters or proxy failures', () => {
  let reads = 0
  const getter = snapshot()
  Object.defineProperty(getter, 'operation', {
    enumerable: true,
    get: () => {
      reads++
      return operation()
    },
  })
  const hidden = snapshot()
  Object.defineProperty(hidden, 'revision', { enumerable: false, value: 1 })
  const inherited = Object.assign(Object.create({ unrelated: true }), snapshot())
  const nested = snapshot()
  Object.defineProperty(nested.operation!, 'stage', {
    enumerable: true,
    get: () => {
      reads++
      return 'preparing'
    },
  })
  for (const invalid of [
    getter,
    hidden,
    inherited,
    nested,
    { ...snapshot(), [Symbol('extra')]: true },
    new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('private')
        },
      },
    ),
  ]) {
    assert.equal(isRuntimeSetupProgressSnapshot(invalid), false)
  }
  assert.equal(reads, 0)
})
