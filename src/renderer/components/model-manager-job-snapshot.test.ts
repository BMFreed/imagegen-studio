import type { ModelInstallJobView } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mergeModelManagerJobSnapshot } from './model-manager-job-snapshot.js'

function job(
  id: string,
  status: ModelInstallJobView['status'],
  bytesDownloaded = 0,
): ModelInstallJobView {
  return {
    bytesDownloaded,
    error: null,
    id,
    modelName: `Model ${id}`,
    status,
    totalBytes: 100,
    versionName: 'v1',
  }
}

test('a progress event during a list read preserves both current progress and unobserved neighbors', () => {
  const old = job('active', 'downloading', 10)
  const current = job('active', 'verifying', 100)
  const neighbor = job('neighbor', 'waiting')
  const snapshot = [old, neighbor]
  const before = structuredClone(snapshot)
  const observed = new Map([[current.id, current]])

  assert.deepEqual(mergeModelManagerJobSnapshot(snapshot, observed), [current, neighbor])
  assert.deepEqual(snapshot, before)
  assert.equal(observed.get(current.id), current)
})

test('newly observed jobs absent from the snapshot retain the existing prepend order', () => {
  const existing = job('existing', 'failed')
  const first = job('first', 'waiting')
  const second = job('second', 'downloading', 20)
  const observed = new Map([
    [first.id, first],
    [second.id, second],
  ])

  assert.deepEqual(mergeModelManagerJobSnapshot([existing], observed), [second, first, existing])
})

test('the latest observed update wins once without duplicating its job row', () => {
  const initial = job('active', 'waiting')
  const progress = job('active', 'downloading', 20)
  const finished = job('active', 'completed', 100)
  const observed = new Map([[progress.id, progress]])
  observed.set(finished.id, finished)

  assert.deepEqual(mergeModelManagerJobSnapshot([initial], observed), [finished])
})

test('a new read with no observed events returns the new complete Main snapshot', () => {
  const latest = job('active', 'completed', 100)
  const removedHistory = job('old-history', 'failed')
  const oldResult = mergeModelManagerJobSnapshot([removedHistory], new Map())
  const latestResult = mergeModelManagerJobSnapshot([latest], new Map())

  assert.deepEqual(oldResult, [removedHistory])
  assert.deepEqual(latestResult, [latest])
  assert.notEqual(latestResult, oldResult)
})
