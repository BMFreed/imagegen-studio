import type { ProjectSmartPatchVariantsInspection } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  SmartPatchFreshnessReader,
  type SmartPatchFreshnessRequest,
  type SmartPatchFreshnessState,
} from './smart-patch-freshness-reader.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, reject, resolve }
}

function owner(overrides: Partial<SmartPatchFreshnessRequest> = {}): SmartPatchFreshnessRequest {
  return {
    documentId: 'document-a',
    documentRevision: 'revision-a',
    layerId: 'patch-a',
    tabId: 'tab-a',
    variantIds: ['variant-a', 'variant-b'],
    ...overrides,
  }
}

function inspection(request: SmartPatchFreshnessRequest): ProjectSmartPatchVariantsInspection {
  return {
    documentId: request.documentId,
    documentRevision: request.documentRevision,
    layerId: request.layerId,
    resourceDiagnostics: [{ code: 'CATALOG_UNAVAILABLE', message: 'Availability unknown.' }],
    resourcesChecked: false,
    sourceUnavailableReason: null,
    variants: request.variantIds.map((id) => ({
      changedInputs: [],
      id,
      sourceVerified: true,
      status: 'ready',
    })),
  }
}

function harness() {
  const states: SmartPatchFreshnessState[] = []
  const calls: {
    fail: (cause: unknown) => Promise<void>
    owner: SmartPatchFreshnessRequest
    pending: boolean
    succeed: (response?: ProjectSmartPatchVariantsInspection) => Promise<void>
  }[] = []
  let peakRunning = 0
  const reader = new SmartPatchFreshnessReader({
    onState: (state) => states.push(state),
    read: (request) => {
      const result = deferred<ProjectSmartPatchVariantsInspection>()
      const call = {
        fail: async (cause: unknown) => {
          call.pending = false
          result.reject(cause)
          await assert.rejects(result.promise)
        },
        owner: request,
        pending: true,
        succeed: async (response = inspection(request)) => {
          call.pending = false
          result.resolve(response)
          // The reader awaits this same barrier before this observer is registered.
          await result.promise
        },
      }
      calls.push(call)
      peakRunning = Math.max(peakRunning, calls.filter(({ pending }) => pending).length)
      return result.promise
    },
  })
  return { calls, peakRunning: () => peakRunning, reader, states }
}

function latest(states: SmartPatchFreshnessState[]): SmartPatchFreshnessState {
  const state = states.at(-1)
  assert.ok(state)
  return state
}

test('change immediately publishes cleared loading state; a matching response publishes diagnostics', async () => {
  const { calls, reader, states } = harness()
  assert.deepEqual(states, [])
  const request = owner()
  reader.change(request)
  assert.deepEqual(states, [{ error: null, inspection: null, loading: true, owner: request }])
  assert.deepEqual(
    calls.map(({ owner }) => owner),
    [request],
  )
  await calls[0]!.succeed()
  assert.deepEqual(latest(states), {
    error: null,
    inspection: inspection(request),
    loading: false,
    owner: request,
  })
  reader.change({ ...request, documentRevision: 'revision-b' })
  assert.deepEqual(latest(states), {
    error: null,
    inspection: null,
    loading: true,
    owner: { ...request, documentRevision: 'revision-b' },
  })
  await calls[1]!.succeed()
  reader.dispose()
})

for (const staleOutcome of ['success', 'failure'] as const) {
  test(`only the newest queued owner runs after stale ${staleOutcome}, with peak concurrency one`, async () => {
    const { calls, peakRunning, reader, states } = harness()
    const first = owner()
    const skipped = owner({ documentRevision: 'revision-b' })
    const newest = owner({ documentRevision: 'revision-c' })
    reader.change(first)
    reader.change(skipped)
    reader.change(newest)
    assert.equal(calls.length, 1)
    assert.equal(states.length, 3)
    await (staleOutcome === 'success'
      ? calls[0]!.succeed()
      : calls[0]!.fail(new Error('Stale failure')))
    assert.equal(states.length, 3, 'Settled stale work must not publish any state.')
    assert.deepEqual(
      calls.map(({ owner }) => owner),
      [first, newest],
    )
    assert.equal(peakRunning(), 1)
    await calls[1]!.succeed()
    assert.deepEqual(latest(states).inspection, inspection(newest))
    assert.equal(latest(states).error, null)
    reader.dispose()
  })
}

const ownerChanges: [string, Partial<SmartPatchFreshnessRequest>][] = [
  ['tab', { tabId: 'tab-b' }],
  ['document', { documentId: 'document-b' }],
  ['revision', { documentRevision: 'revision-b' }],
  ['layer', { layerId: 'patch-b' }],
  ['variant membership', { variantIds: ['variant-b', 'variant-c'] }],
  ['same-owner refresh', {}],
]
for (const [axis, changes] of ownerChanges) {
  test(`a ${axis} change supersedes a running response even if its other fields match`, async () => {
    const { calls, reader, states } = harness()
    const next = owner(changes)
    reader.change(owner())
    reader.change(next)
    await calls[0]!.succeed()
    assert.equal(states.length, 2)
    assert.deepEqual(calls[1]!.owner, next)
    await calls[1]!.succeed()
    assert.deepEqual(latest(states).owner, next)
    assert.deepEqual(latest(states).inspection, inspection(next))
    reader.dispose()
  })
}

for (const staleOutcome of ['success', 'failure'] as const) {
  test(`A to B to A requires a fresh read rather than reusing the first A ${staleOutcome}`, async () => {
    const { calls, reader, states } = harness()
    const request = owner()
    reader.change(request)
    reader.change(owner({ tabId: 'tab-b' }))
    reader.change(request)
    await (staleOutcome === 'success'
      ? calls[0]!.succeed()
      : calls[0]!.fail(new Error('Old A failed')))
    assert.equal(states.length, 3)
    assert.equal(calls.length, 2)
    assert.deepEqual(calls[1]!.owner, request)
    await calls[1]!.succeed()
    assert.equal(states.length, 4)
    assert.equal(latest(states).inspection?.variants[0]?.status, 'ready')
    reader.dispose()
  })
}

const mismatches: [string, (response: ProjectSmartPatchVariantsInspection) => void][] = [
  [
    'document',
    (value) => {
      value.documentId = 'foreign-document'
    },
  ],
  [
    'revision',
    (value) => {
      value.documentRevision = 'foreign-revision'
    },
  ],
  [
    'layer',
    (value) => {
      value.layerId = 'foreign-layer'
    },
  ],
  [
    'missing member',
    (value) => {
      value.variants.pop()
    },
  ],
  [
    'extra member',
    (value) => {
      value.variants.push({ ...value.variants[0]!, id: 'extra' })
    },
  ],
  [
    'substituted member',
    (value) => {
      value.variants[1]!.id = 'foreign-member'
    },
  ],
  [
    'duplicate member',
    (value) => {
      value.variants[1]!.id = value.variants[0]!.id
    },
  ],
]
for (const [mismatch, mutate] of mismatches) {
  test(`a response with a ${mismatch} mismatch fails closed and a valid refresh recovers`, async () => {
    const { calls, reader, states } = harness()
    const request = owner()
    const response = inspection(request)
    mutate(response)
    reader.change(request)
    await calls[0]!.succeed(response)
    assert.equal(latest(states).inspection, null)
    assert.equal(latest(states).loading, false)
    assert.match(latest(states).error ?? '', /changed.*Refresh/)
    reader.change(request)
    assert.equal(latest(states).error, null)
    assert.equal(latest(states).loading, true)
    await calls[1]!.succeed()
    assert.deepEqual(latest(states).inspection, inspection(request))
    reader.dispose()
  })
}

test('member order is irrelevant, the empty set is valid, and duplicate requested IDs are refused', async () => {
  const { calls, reader, states } = harness()
  const request = owner()
  reader.change(request)
  const reordered = inspection(request)
  reordered.variants.reverse()
  await calls[0]!.succeed(reordered)
  assert.deepEqual(latest(states).inspection, reordered)
  reader.change(owner({ variantIds: [] }))
  await calls[1]!.succeed()
  assert.deepEqual(latest(states).inspection?.variants, [])
  reader.change(owner({ variantIds: ['variant-a', 'variant-a'] }))
  await calls[2]!.succeed(inspection(owner({ variantIds: ['variant-a'] })))
  assert.equal(latest(states).inspection, null)
  assert.ok(latest(states).error)
  reader.dispose()
})

for (const cause of [new Error('Connection lost'), 'Connection lost']) {
  test(`a current ${cause instanceof Error ? 'Error' : 'non-Error'} failure clears loading and allows recovery`, async () => {
    const { calls, reader, states } = harness()
    reader.change(owner())
    await calls[0]!.fail(cause)
    assert.deepEqual(latest(states), {
      error: cause instanceof Error ? cause.message : 'Variant diagnostics could not be read.',
      inspection: null,
      loading: false,
      owner: owner(),
    })
    reader.change(owner())
    assert.equal(latest(states).error, null)
    await calls[1]!.succeed()
    assert.deepEqual(latest(states).inspection, inspection(owner()))
    reader.dispose()
  })
}

for (const staleOutcome of ['success', 'failure'] as const) {
  test(`change(null) discards queued work and a late ${staleOutcome}; a later owner can resume`, async () => {
    const { calls, reader, states } = harness()
    reader.change(owner())
    reader.change(owner({ layerId: 'queued' }))
    reader.change(null)
    assert.deepEqual(latest(states), { error: null, inspection: null, loading: false, owner: null })
    await (staleOutcome === 'success'
      ? calls[0]!.succeed()
      : calls[0]!.fail(new Error('Stopped read failed')))
    assert.equal(states.length, 3)
    assert.equal(calls.length, 1)
    reader.change(owner({ layerId: 'resumed' }))
    await calls[1]!.succeed()
    assert.equal(latest(states).inspection?.layerId, 'resumed')
    reader.dispose()
  })

  test(`dispose discards queued work and emits nothing after a late ${staleOutcome}`, async () => {
    const { calls, reader, states } = harness()
    reader.change(owner())
    reader.change(owner({ layerId: 'queued' }))
    reader.dispose()
    reader.dispose()
    reader.change(owner({ layerId: 'ignored' }))
    reader.change(null)
    await (staleOutcome === 'success'
      ? calls[0]!.succeed()
      : calls[0]!.fail(new Error('Disposed read failed')))
    assert.equal(states.length, 2)
    assert.equal(calls.length, 1)
  })
}

test('caller, queued owner, read argument, response, and published nested state stay detached', async () => {
  const { calls, reader, states } = harness()
  reader.change(owner({ layerId: 'running' }))
  const request = owner()
  const captured = structuredClone(request)
  reader.change(request)
  request.documentId = 'caller-mutated'
  ;(request.variantIds as string[]).push('caller-added')
  latest(states).owner!.layerId = 'callback-mutated'
  ;(latest(states).owner!.variantIds as string[]).push('callback-added')
  await calls[0]!.succeed()
  assert.deepEqual(calls[1]!.owner, captured)
  calls[1]!.owner.documentRevision = 'read-mutated'
  ;(calls[1]!.owner.variantIds as string[]).push('read-added')
  const response = inspection(captured)
  await calls[1]!.succeed(response)
  const publication = latest(states)
  assert.deepEqual(publication.owner, captured)
  assert.deepEqual(publication.inspection, response)
  const originalResponse = structuredClone(response)
  publication.owner.documentId = 'publication-mutated'
  publication.inspection.variants[0]!.changedInputs.push('bbox')
  publication.inspection.resourceDiagnostics[0]!.message = 'Publication changed'
  assert.deepEqual(response, originalResponse)
  response.variants[1]!.changedInputs.push('mask')
  response.resourceDiagnostics[0]!.message = 'Response changed'
  assert.deepEqual(publication.inspection.variants[1]!.changedInputs, [])
  assert.equal(publication.inspection.resourceDiagnostics[0]!.message, 'Publication changed')
  reader.change(captured)
  assert.deepEqual(latest(states).owner, captured)
  assert.equal(latest(states).inspection, null)
  await calls[2]!.succeed()
  assert.deepEqual(latest(states).inspection, inspection(captured))
  assert.deepEqual(publication.inspection.variants[0]!.changedInputs, ['bbox'])
  reader.dispose()
})

for (const action of ['replace', 'stop', 'dispose'] as const) {
  test(`a reentrant loading callback can ${action} without starting the superseded read`, async () => {
    const result = deferred<ProjectSmartPatchVariantsInspection>()
    const states: SmartPatchFreshnessState[] = []
    const calls: SmartPatchFreshnessRequest[] = []
    let redirected = false
    const next = owner({ layerId: 'next' })
    const reader = new SmartPatchFreshnessReader({
      onState: (state) => {
        states.push(state)
        if (!redirected) {
          redirected = true
          if (action === 'replace') {
            reader.change(next)
          } else if (action === 'stop') {
            reader.change(null)
          } else {
            reader.dispose()
          }
        }
      },
      read: (request) => {
        calls.push(request)
        return result.promise
      },
    })
    reader.change(owner())
    if (action === 'replace') {
      assert.deepEqual(calls, [next])
      result.resolve(inspection(next))
      await result.promise
      assert.deepEqual(latest(states).inspection, inspection(next))
    } else {
      assert.deepEqual(calls, [])
      assert.equal(states.length, action === 'stop' ? 2 : 1)
    }
    reader.dispose()
  })
}

test('a synchronous read throw after switching owner suppresses the old error and runs the newest owner', async () => {
  const result = deferred<ProjectSmartPatchVariantsInspection>()
  const states: SmartPatchFreshnessState[] = []
  const calls: SmartPatchFreshnessRequest[] = []
  const next = owner({ layerId: 'next' })
  const reader = new SmartPatchFreshnessReader({
    onState: (state) => states.push(state),
    read: (request) => {
      calls.push(request)
      if (calls.length === 1) {
        reader.change(owner({ layerId: 'skipped' }))
        reader.change(next)
        throw new Error('Superseded synchronous failure')
      }
      return result.promise
    },
  })
  reader.change(owner())
  assert.deepEqual(
    calls.map(({ layerId }) => layerId),
    ['patch-a', 'next'],
  )
  assert.equal(states.length, 3)
  assert.equal(latest(states).error, null)
  result.resolve(inspection(next))
  await result.promise
  assert.deepEqual(latest(states).inspection, inspection(next))
  reader.dispose()
})

for (const outcome of ['success', 'failure'] as const) {
  for (const action of ['replace', 'stop', 'dispose'] as const) {
    test(`a reentrant ${outcome} callback can ${action} without a later stale publication`, async () => {
      const first = deferred<ProjectSmartPatchVariantsInspection>()
      const second = deferred<ProjectSmartPatchVariantsInspection>()
      const states: SmartPatchFreshnessState[] = []
      const calls: SmartPatchFreshnessRequest[] = []
      const next = owner({ layerId: 'next' })
      let redirected = false
      const reader = new SmartPatchFreshnessReader({
        onState: (state) => {
          states.push(state)
          if (!state.loading && !redirected) {
            redirected = true
            if (action === 'stop') {
              reader.change(null)
            } else {
              reader.change(next)
              if (action === 'dispose') {
                reader.dispose()
              }
            }
          }
        },
        read: (request) => {
          calls.push(request)
          return calls.length === 1 ? first.promise : second.promise
        },
      })
      reader.change(owner())
      if (outcome === 'success') {
        first.resolve(inspection(owner()))
        await first.promise
      } else {
        first.reject(new Error('First failure'))
        await assert.rejects(first.promise)
      }
      assert.equal(states.length, 3)
      if (action === 'replace') {
        assert.deepEqual(
          calls.map(({ layerId }) => layerId),
          ['patch-a', 'next'],
        )
        assert.deepEqual(latest(states), {
          error: null,
          inspection: null,
          loading: true,
          owner: next,
        })
        second.resolve(inspection(next))
        await second.promise
        assert.deepEqual(latest(states).inspection, inspection(next))
      } else {
        assert.equal(calls.length, 1)
        assert.deepEqual(latest(states), {
          error: null,
          inspection: null,
          loading: action !== 'stop',
          owner: action === 'stop' ? null : next,
        })
      }
      reader.dispose()
    })
  }
}
