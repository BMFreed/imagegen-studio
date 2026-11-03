import assert from 'node:assert/strict'
import test from 'node:test'

import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import {
  createRegionalProjectFixture,
  regionalProjectDeferred,
} from './test-fixtures/regional-project.js'

test('app shutdown drains registered private regional execution outside public routing', async () => {
  const f = await createRegionalProjectFixture()
  const entered = regionalProjectDeferred()
  const closing = regionalProjectDeferred()
  const permitExit = regionalProjectDeferred()
  const workerExit = regionalProjectDeferred()
  const physicallyIdle = regionalProjectDeferred()
  let physicalChecks = 0
  const dispatch = new GenerationDispatchCoordinator(
    {
      retryUnconfirmedGenerationExit: async () => {
        physicalChecks++
        return true
      },
      withGenerationWorker: async () =>
        assert.fail('Private jobs are not public dispatch entries.'),
    },
    f.orchestrator,
    f.processor,
    f.scratch,
  )
  try {
    const queued = await f.coordinator.submit(f.tabId, f.input())
    assert.equal((await dispatch.runNext()).kind, 'idle')
    const running = f.coordinator.runNext(
      f.transport({
        close: async () => {
          closing.resolve()
          await permitExit.promise
          physicallyIdle.resolve()
          workerExit.resolve()
        },
        executeCurrentCanvasRegional: async () => {
          entered.resolve()
          await workerExit.promise
          throw new Error('Explicit fixture child exited.')
        },
      }),
    )
    await entered.promise
    let stopped = false
    const shutdown = dispatch.shutdown().then(() => {
      stopped = true
    })
    await closing.promise
    assert.equal(stopped, false)
    assert.equal(physicalChecks, 0)
    assert.equal((await f.queue.getRegionalQueueItem(queued.id))?.status, 'running')
    permitExit.resolve()
    await physicallyIdle.promise
    await shutdown
    assert.equal((await running).kind, 'canceled')
    assert.equal(physicalChecks, 1)
    assert.equal((await f.queue.getRegionalQueueItem(queued.id))?.status, 'canceled')
    assert.equal((await f.staging.listVerifiedRegionalCandidates(f.tabId)).length, 0)
    await assert.rejects(dispatch.runNext(), { code: 'CLOSED' })
    const composed = f.calls.compose.length
    await assert.rejects(f.coordinator.submit(f.tabId, f.input()), {
      code: 'PROJECT_GENERATION_CLOSING',
    })
    assert.equal(f.calls.compose.length, composed)
  } finally {
    permitExit.resolve()
    workerExit.resolve()
    await dispatch.shutdown()
    await f.close()
  }
})

test('failed app exit confirmation keeps private admission closed until shutdown retry', async () => {
  const f = await createRegionalProjectFixture()
  let confirm = false
  let checks = 0
  const dispatch = new GenerationDispatchCoordinator(
    {
      retryUnconfirmedGenerationExit: async () => {
        checks++
        return confirm
      },
      withGenerationWorker: async () => assert.fail('No public dispatch.'),
    },
    f.orchestrator,
    f.processor,
    f.scratch,
  )
  try {
    await assert.rejects(dispatch.shutdown(), { code: 'WORKER_EXIT_UNCONFIRMED' })
    const composed = f.calls.compose.length
    await assert.rejects(f.coordinator.submit(f.tabId, f.input()), {
      code: 'PROJECT_GENERATION_CLOSING',
    })
    assert.equal(f.calls.compose.length, composed)
    confirm = true
    await dispatch.shutdown()
    assert.equal(checks, 2)
  } finally {
    confirm = true
    await dispatch.shutdown()
    await f.close()
  }
})
