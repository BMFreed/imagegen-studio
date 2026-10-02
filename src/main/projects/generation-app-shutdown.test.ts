import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { GenerationAppShutdown, GenerationAppShutdownError } from './generation-app-shutdown.js'

const migrations = path.resolve('src/main/db/migrations')

test(
  'CPU inspection cleanup fences shutdown before coordinator and real SQLite, and a failed exit can retry',
  { timeout: 10_000 },
  async () => {
    await withDatabase(async ({ close, query }) => {
      const entered = deferred()
      const release = deferred()
      let reads = 0
      let coordinated = false
      let closed = false
      const shutdown = new GenerationAppShutdown({
        closeDatabase: async () => {
          await close()
          closed = true
        },
        context: { shutdown: () => undefined },
        coordinator: {
          shutdown: async () => {
            coordinated = true
          },
        },
        pendingJobs: null,
        shutdownImageReads: async () => {
          reads++
          if (reads === 1) {
            entered.resolve()
            await release.promise
            throw new Error('CPU child exit is unconfirmed')
          }
        },
      })
      const first = shutdown.finalize()
      try {
        assert.equal(reads, 1, 'shutdown must enter the CPU lease before starting later owners')
        assert.equal(coordinated, false)
        await entered.promise
        await query()
        assert.equal(closed, false)
        assert.equal(coordinated, false)
        release.resolve()
        await assert.rejects(first, /CPU child exit is unconfirmed/)
        await query()
        assert.equal(closed, false)
        assert.equal(coordinated, false)
        await shutdown.finalize()
        assert.equal(reads, 2)
        assert.equal(coordinated, true)
        assert.equal(closed, true)
        await assert.rejects(query)
      } finally {
        release.resolve()
        await first.catch(() => undefined)
      }
    })
  },
)

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function withDatabase(
  run: (fixture: { close: () => Promise<void>; query: () => Promise<void> }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-shutdown-'))
  const database = openAppDatabase(root, migrations)
  let closed = false
  const close = async (): Promise<void> => {
    if (!closed) {
      await database.close()
      closed = true
    }
  }
  try {
    await run({
      close,
      query: async () => {
        await database.db.selectFrom('app_metadata').selectAll().execute()
      },
    })
  } finally {
    await close()
    await rm(root, { force: true, recursive: true })
  }
}

test('finalize holds the real SQLite connection until worker exit and pending cancellation', async () => {
  await withDatabase(async ({ close, query }) => {
    const entered = deferred()
    const exit = deferred()
    const actions: string[] = []
    let databaseClosed = false
    const shutdown = new GenerationAppShutdown({
      closeDatabase: async () => {
        actions.push('database-close')
        await close()
        databaseClosed = true
      },
      context: { shutdown: () => actions.push('context-close') },
      coordinator: {
        shutdown: async () => {
          actions.push('worker-stop-requested')
          entered.resolve()
          await exit.promise
          actions.push('worker-exit-confirmed')
        },
      },
      pendingJobs: {
        cancelPendingForShutdown: async () => {
          await query()
          actions.push('pending-canceled')
          return 2
        },
      },
      runtimeExit: {
        preventNewGenerationWork: () => actions.push('runtime-fenced'),
        retryUnconfirmedGenerationExit: async () => {
          actions.push('runtime-exit-checked')
          return true
        },
      },
    })
    const finalizing = shutdown.finalize()
    assert.deepEqual(actions, ['runtime-fenced', 'worker-stop-requested'])
    try {
      await entered.promise
      // Advance past ready microtasks while the independent child-exit signal is still blocked.
      await new Promise<void>((resolve) => setImmediate(resolve))
      await query()
      assert.equal(databaseClosed, false)
      assert.deepEqual(actions, ['runtime-fenced', 'worker-stop-requested'])
    } finally {
      exit.resolve()
    }
    await finalizing
    assert.deepEqual(actions, [
      'runtime-fenced',
      'worker-stop-requested',
      'worker-exit-confirmed',
      'pending-canceled',
      'runtime-exit-checked',
      'context-close',
      'database-close',
    ])
    await assert.rejects(query)
    await shutdown.finalize()
    assert.equal(actions.filter((action) => action === 'database-close').length, 1)
  })
})

test('failed worker shutdown keeps SQLite open and coalesced callers can retry', async () => {
  await withDatabase(async ({ close, query }) => {
    let workerStops = 0
    let pendingCancels = 0
    let contextCloses = 0
    let databaseCloses = 0
    const shutdown = new GenerationAppShutdown({
      closeDatabase: async () => {
        databaseCloses += 1
        await close()
      },
      context: {
        shutdown: () => {
          contextCloses += 1
        },
      },
      coordinator: {
        shutdown: async () => {
          workerStops += 1
          if (workerStops === 1) {
            throw new Error('Worker exit is unconfirmed.')
          }
        },
      },
      pendingJobs: {
        cancelPendingForShutdown: async () => {
          pendingCancels += 1
          return 1
        },
      },
    })
    const first = shutdown.prepareWindowClose()
    const concurrent = shutdown.prepareWindowClose()
    assert.strictEqual(first, concurrent)
    await assert.rejects(first, /Worker exit is unconfirmed/)
    await assert.rejects(concurrent, /Worker exit is unconfirmed/)
    await query()
    assert.equal(workerStops, 1)
    assert.equal(pendingCancels, 0)
    assert.equal(contextCloses, 0)
    assert.equal(databaseCloses, 0)

    await shutdown.finalize()
    assert.equal(workerStops, 2)
    assert.equal(pendingCancels, 1)
    assert.equal(contextCloses, 1)
    assert.equal(databaseCloses, 1)
    await assert.rejects(query)
  })
})

test('failed pending cancellation retries without closing context or database', async () => {
  await withDatabase(async ({ close, query }) => {
    let workerStops = 0
    let pendingCancels = 0
    let contextCloses = 0
    let databaseCloses = 0
    const shutdown = new GenerationAppShutdown({
      closeDatabase: async () => {
        databaseCloses += 1
        await close()
      },
      context: {
        shutdown: () => {
          contextCloses += 1
        },
      },
      coordinator: {
        shutdown: async () => {
          workerStops += 1
        },
      },
      pendingJobs: {
        cancelPendingForShutdown: async () => {
          pendingCancels += 1
          if (pendingCancels === 1) {
            throw new Error('Pending queue cancellation failed.')
          }
          return 3
        },
      },
    })
    await assert.rejects(shutdown.finalize(), /Pending queue cancellation failed/)
    await query()
    assert.equal(contextCloses, 0)
    assert.equal(databaseCloses, 0)

    await shutdown.finalize()
    assert.equal(workerStops, 2)
    assert.equal(pendingCancels, 2)
    assert.equal(contextCloses, 1)
    assert.equal(databaseCloses, 1)
  })
})

test('database close failure retries finalization without repeating an already closed context', async () => {
  await withDatabase(async ({ close, query }) => {
    let closeAttempts = 0
    let contextCloses = 0
    let workerStops = 0
    const shutdown = new GenerationAppShutdown({
      closeDatabase: async () => {
        closeAttempts += 1
        if (closeAttempts === 1) {
          throw new Error('SQLite close failed before destroying the connection.')
        }
        await close()
      },
      context: {
        shutdown: () => {
          contextCloses += 1
        },
      },
      coordinator: {
        shutdown: async () => {
          workerStops += 1
        },
      },
      pendingJobs: null,
    })
    await assert.rejects(shutdown.finalize(), /SQLite close failed/)
    await query()
    await shutdown.finalize()
    assert.equal(closeAttempts, 2)
    assert.equal(contextCloses, 1)
    assert.equal(workerStops, 1)
  })
})

test('recovery-unavailable context closes without calling a worker or queue', async () => {
  await withDatabase(async ({ close, query }) => {
    let contextCloses = 0
    let databaseCloses = 0
    const shutdown = new GenerationAppShutdown({
      closeDatabase: async () => {
        databaseCloses += 1
        await close()
      },
      context: {
        shutdown: () => {
          contextCloses += 1
        },
      },
      coordinator: null,
      pendingJobs: null,
    })
    await query()
    const first = shutdown.finalize()
    const concurrent = shutdown.finalize()
    assert.strictEqual(first, concurrent)
    await Promise.all([first, concurrent])
    assert.equal(contextCloses, 1)
    assert.equal(databaseCloses, 1)
    await assert.rejects(query)
  })
})

test('unconfirmed runtime status child blocks close even without a generation coordinator', async () => {
  await withDatabase(async ({ close, query }) => {
    let runtimeExitAttempts = 0
    let runtimeFenceCalls = 0
    let contextCloses = 0
    let databaseCloses = 0
    const shutdown = new GenerationAppShutdown({
      closeDatabase: async () => {
        databaseCloses += 1
        await close()
      },
      context: {
        shutdown: () => {
          contextCloses += 1
        },
      },
      coordinator: null,
      pendingJobs: null,
      runtimeExit: {
        preventNewGenerationWork: () => {
          runtimeFenceCalls += 1
        },
        retryUnconfirmedGenerationExit: async () => {
          runtimeExitAttempts += 1
          return runtimeExitAttempts > 1
        },
      },
    })

    await assert.rejects(
      shutdown.finalize(),
      (error: unknown) =>
        error instanceof GenerationAppShutdownError && error.code === 'WORKER_EXIT_UNCONFIRMED',
    )
    await query()
    assert.equal(runtimeFenceCalls, 1)
    assert.equal(contextCloses, 0)
    assert.equal(databaseCloses, 0)

    await shutdown.finalize()
    assert.equal(runtimeFenceCalls, 2)
    assert.equal(runtimeExitAttempts, 2)
    assert.equal(contextCloses, 1)
    assert.equal(databaseCloses, 1)
  })
})
