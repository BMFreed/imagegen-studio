import type { GenerationProgressSnapshot } from '../../shared/projects/generation-progress.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { GenerationProgressSource } from './generation-progress-source.js'

function source() {
  let snapshot: GenerationProgressSnapshot = { current: null, revision: 0 }
  const listeners = new Set<(snapshot: GenerationProgressSnapshot) => void>()
  return {
    getProgressSnapshot: () => structuredClone(snapshot),
    listenerCount: () => listeners.size,
    onProgress: (listener: (snapshot: GenerationProgressSnapshot) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    publish: (next: GenerationProgressSnapshot) => {
      snapshot = next
      for (const listener of listeners) {
        listener(next)
      }
    },
  }
}

function current(): NonNullable<GenerationProgressSnapshot['current']> {
  return {
    documentId: randomUUID(),
    jobId: randomUUID(),
    projectKey: `project-v1-${'a'.repeat(64)}`,
    statusSequence: 1,
    step: 1,
    totalSteps: 4,
  }
}

test('app progress revisions span ordinary → Smart → ordinary without stale-source clears erasing the current job', () => {
  const normal = source()
  const smart = source()
  const merged = new GenerationProgressSource([normal, smart])
  const observed: GenerationProgressSnapshot[] = []
  merged.onProgress((snapshot) => observed.push(snapshot))
  const first = current()
  const patch = current()
  const next = current()
  try {
    normal.publish({ current: first, revision: 1 })
    smart.publish({ current: patch, revision: 1 })
    normal.publish({ current: null, revision: 2 })
    assert.deepEqual(merged.getProgressSnapshot(), { current: patch, revision: 2 })
    smart.publish({ current: null, revision: 0 })
    smart.publish({ current: null, revision: 1 })
    assert.deepEqual(merged.getProgressSnapshot(), { current: patch, revision: 2 })
    smart.publish({ current: null, revision: 2 })
    normal.publish({ current: next, revision: 3 })
    smart.publish({ current: null, revision: 3 })
    normal.publish({ current: first, revision: 2 })
    assert.deepEqual(merged.getProgressSnapshot(), { current: next, revision: 4 })
    normal.publish({ current: { ...next, step: 2 }, revision: 4 })
    normal.publish({ current: null, revision: 5 })
    assert.deepEqual(
      observed.map(({ revision }) => revision),
      [1, 2, 3, 4, 5, 6],
    )
    assert.deepEqual(
      observed.map(({ current }) => current?.jobId ?? null),
      [first.jobId, patch.jobId, null, next.jobId, next.jobId, null],
    )
  } finally {
    merged.dispose()
  }
})

test('merged progress snapshots isolate source, listener and caller mutation and detach at disposal', () => {
  const input = source()
  const initial = current()
  input.publish({ current: initial, revision: 7 })
  const merged = new GenerationProgressSource([input])
  assert.deepEqual(merged.getProgressSnapshot(), { current: initial, revision: 1 })
  const observed: GenerationProgressSnapshot[] = []
  merged.onProgress((snapshot) => {
    snapshot.current!.step = 400
    throw new Error('A broken renderer observer must not control progress.')
  })
  merged.onProgress((snapshot) => observed.push(snapshot))
  const next = { current: { ...initial, step: 2 }, revision: 8 }
  input.publish(next)
  next.current.step = 399
  assert.equal(observed[0].current?.step, 2)
  const read = merged.getProgressSnapshot()
  read.current!.step = 398
  assert.equal(merged.getProgressSnapshot().current?.step, 2)
  input.publish({ current: { ...initial, step: 9 }, revision: 9 })
  assert.equal(merged.getProgressSnapshot().revision, 2, 'Malformed source telemetry is ignored.')
  merged.dispose()
  assert.equal(input.listenerCount(), 0)
  input.publish({ current: null, revision: 10 })
  assert.equal(observed.length, 1)
  assert.equal(merged.getProgressSnapshot().current?.step, 2)
})
