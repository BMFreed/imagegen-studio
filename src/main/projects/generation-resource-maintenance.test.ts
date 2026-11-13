import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { ProjectGenerationActionController } from './generation-action-controller.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import {
  createRegionalQueueFixture,
  enqueueRegionalFixture,
  type RegionalQueueFixture,
} from './test-fixtures/regional-queue.js'

function signal() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function code(value: string) {
  return (error: unknown) => error instanceof Error && 'code' in error && error.code === value
}

/**
 * Real migrated queue/storage and actual action admission; runtime/dispatch are explicit inert
 * substitutes. No worker, resource deletion or inference is exercised by these barrier tests.
 */
function controllerFixture(fixture: RegionalQueueFixture) {
  const calls = { dispatch: 0, shutdown: 0 }
  const controller = new ProjectGenerationActionController({
    dispatch: {
      runNext: async () => {
        calls.dispatch++
        return { kind: 'idle' }
      },
      shutdown: async () => {
        calls.shutdown++
      },
    },
    gate: new ProjectGenerationOperationGate(),
    models: {
      ...fixture.models,
      resolveVerifiedGenerationLoraForPlan: async () => assert.fail('No LoRA is prepared.'),
      resolveVerifiedGenerationVaeForPlan: async () => assert.fail('No VAE is prepared.'),
    },
    orchestrator: { enqueuePreparedBatch: async () => assert.fail('No batch is admitted.') },
    processor: {
      cancelAndWait: async () => assert.fail('No running worker is canceled.'),
      onChanged: () => () => {},
    },
    projects: {
      getOpenDocumentId: () => null,
      withCapturedNormalGenerationInput: async () => assert.fail('No Project is captured.'),
    },
    queue: fixture.queue,
    runtime: {
      getStatus: async () => null,
      readQualifiedInferenceReady: async () => null,
      withGenerationAdmission: async () => assert.fail('No runtime admission is opened.'),
      withGenerationPreparation: async () => assert.fail('No runtime preparation is opened.'),
    },
    scratchBasePath: fixture.root,
    staging: fixture.staging,
  })
  return { calls, controller }
}

test('idle resource maintenance refuses an unreconciled queue before work', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const unreconciled = new GenerationQueueRepository(f.db, f.root)
    let touched = false
    await assert.rejects(
      unreconciled.withIdleResourceMaintenance(async () => {
        touched = true
      }),
      code('QUEUE_NOT_RECONCILED'),
    )
    assert.equal(touched, false)
  } finally {
    await f.close()
  }
})

test('every schema operation with pending/running status blocks removal, including private regional', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const schema = await sql<{
      sql: string
    }>`SELECT sql FROM sqlite_master WHERE name = 'generation_queue_item'`.execute(f.db)
    const operationCheck = schema.rows[0].sql.match(/operation IN \(([^)]+)\)/)
    assert.ok(operationCheck, 'The actual migrated queue CHECK owns the finite operation set.')
    const operations = [...operationCheck[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
    assert.ok(operations.includes('illustrious-regional'))
    for (const operation of operations) {
      for (const status of ['pending', 'running']) {
        const now = new Date().toISOString()
        const id = randomUUID()
        // Deliberately malformed frozen metadata is a queue-inspection precondition: status alone
        // must block maintenance, without interpreting invalid input as proof of no resource use.
        await f.db
          .insertInto('generation_queue_item')
          .values({
            batch_id: randomUUID(),
            canonical_project_path: f.projectPath,
            created_at: now,
            document_id: randomUUID(),
            document_revision: randomUUID(),
            error_code: null,
            error_message: null,
            finished_at: null,
            frozen_payload_json: '{}',
            id,
            local_project_key: `project-v1-${'a'.repeat(64)}`,
            operation,
            staging_session_id: randomUUID(),
            started_at: status === 'running' ? now : null,
            status,
            updated_at: now,
          })
          .execute()
        const before = await f.db.selectFrom('generation_queue_item').selectAll().execute()
        let touched = false
        await assert.rejects(
          f.queue.withIdleResourceMaintenance(async () => {
            touched = true
          }),
          code('QUEUE_STATUS_CONFLICT'),
        )
        assert.equal(touched, false, `${operation}/${status}`)
        assert.deepEqual(
          await f.db.selectFrom('generation_queue_item').selectAll().execute(),
          before,
        )
        await f.db.deleteFrom('generation_queue_item').where('id', '=', id).execute()
      }
    }
    assert.equal(await f.queue.withIdleResourceMaintenance(async () => 'idle'), 'idle')
  } finally {
    await f.close()
  }
})

test('queue maintenance holds later claim and real private enqueue until its work exits', async () => {
  const f = await createRegionalQueueFixture()
  const entered = signal()
  const release = signal()
  const order: string[] = []
  try {
    const maintenance = f.queue.withIdleResourceMaintenance(async () => {
      order.push('maintenance-enter')
      entered.resolve()
      await release.promise
      order.push('maintenance-exit')
    })
    await entered.promise
    const claim = f.queue.claimNextPendingRegional().then((value) => {
      order.push('claim')
      return value
    })
    const enqueue = enqueueRegionalFixture(f).then((value) => {
      order.push('enqueue')
      return value
    })
    // This independent completed SQL read is not queued behind the maintenance serializer.
    assert.deepEqual(await f.db.selectFrom('generation_queue_item').select('id').execute(), [])
    release.resolve()
    await maintenance
    assert.equal(await claim, null)
    assert.equal((await enqueue).status, 'pending')
    assert.deepEqual(order, ['maintenance-enter', 'maintenance-exit', 'claim', 'enqueue'])
  } finally {
    release.resolve()
    await f.close()
  }
})

test('an already-entered private claim wins before nested controller/queue maintenance and prevents its work', async () => {
  const entered = signal()
  const release = signal()
  const f = await createRegionalQueueFixture({
    queueHooks: {
      beforeClaimUpdate: async () => {
        entered.resolve()
        await release.promise
      },
    },
  })
  const { controller } = controllerFixture(f)
  try {
    const queued = await enqueueRegionalFixture(f)
    const claim = f.queue.claimNextPendingRegional()
    await entered.promise
    let touched = false
    const maintenance = controller.withResourceMaintenance(() =>
      f.queue.withIdleResourceMaintenance(async () => {
        touched = true
      }),
    )
    const refused = assert.rejects(maintenance, code('QUEUE_STATUS_CONFLICT'))
    await assert.rejects(
      controller.generate('unused', { documentId: randomUUID(), iterations: 1 }),
      code('GENERATION_BUSY'),
    )
    release.resolve()
    assert.equal((await claim)?.item.id, queued.id)
    await refused
    assert.equal(touched, false)
    assert.equal((await f.queue.getRegionalQueueItem(queued.id))?.status, 'running')
    assert.equal(await controller.withResourceMaintenance(async () => 'released'), 'released')
  } finally {
    release.resolve()
    await controller.shutdown()
    await f.close()
  }
})

test('queue callback failure releases serialization without canceling or poisoning future admission', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const failure = new Error('declared resource write refusal')
    await assert.rejects(
      f.queue.withIdleResourceMaintenance(async () => {
        throw failure
      }),
      (error) => error === failure,
    )
    assert.equal(await f.queue.withIdleResourceMaintenance(async () => 17), 17)
    assert.equal((await enqueueRegionalFixture(f)).status, 'pending')
  } finally {
    await f.close()
  }
})

test('controller installs maintenance admission before work and fences Generate/Retry/Smart without a fake Project', async () => {
  const f = await createRegionalQueueFixture()
  const { calls, controller } = controllerFixture(f)
  const entered = signal()
  const release = signal()
  try {
    const maintenance = controller.withResourceMaintenance(async () => {
      await assert.rejects(
        controller.withResourceMaintenance(async () => assert.fail('Reentrant removal')),
        code('GENERATION_BUSY'),
      )
      entered.resolve()
      await release.promise
      return 'removed'
    })
    await entered.promise
    await assert.rejects(
      controller.generate('unused', { documentId: randomUUID(), iterations: 1 }),
      code('GENERATION_BUSY'),
    )
    await assert.rejects(
      controller.retryJob({ id: randomUUID(), statusSequence: 0 }),
      code('GENERATION_BUSY'),
    )
    await assert.rejects(
      controller.withExternalAdmission('unused', async () => assert.fail('Smart admitted')),
      code('GENERATION_BUSY'),
    )
    controller.requestDrain()
    assert.equal(calls.dispatch, 0)
    release.resolve()
    assert.equal(await maintenance, 'removed')
    await controller.shutdown()
    assert.equal(calls.shutdown, 1)
    assert.deepEqual(await f.db.selectFrom('generation_queue_item').selectAll().execute(), [])
  } finally {
    release.resolve()
    await controller.shutdown()
    await f.close()
  }
})

test('existing Smart admission prevents resource maintenance until its owner releases', async () => {
  const f = await createRegionalQueueFixture()
  const { controller } = controllerFixture(f)
  const entered = signal()
  const release = signal()
  try {
    const smart = controller.withExternalAdmission('selected-project', async () => {
      entered.resolve()
      await release.promise
    })
    await entered.promise
    await assert.rejects(
      controller.withResourceMaintenance(async () => assert.fail('Removal admitted')),
      code('GENERATION_BUSY'),
    )
    release.resolve()
    await smart
    assert.equal(await controller.withResourceMaintenance(async () => 23), 23)
  } finally {
    release.resolve()
    await controller.shutdown()
    await f.close()
  }
})

test('controller failure releases its admission; closed and blocking-recovery owners reject later work', async () => {
  const f = await createRegionalQueueFixture()
  const { controller } = controllerFixture(f)
  try {
    const failure = new Error('declared filesystem refusal')
    await assert.rejects(
      controller.withResourceMaintenance(async () => {
        throw failure
      }),
      (error) => error === failure,
    )
    assert.equal(await controller.withResourceMaintenance(async () => 29), 29)
    await assert.rejects(
      controller.withResourceMaintenance(async () => {
        throw Object.assign(new Error('declared existing worker-exit recovery fence'), {
          code: 'WORKER_EXIT_UNCONFIRMED',
        })
      }),
    )
    await assert.rejects(
      controller.withResourceMaintenance(async () => assert.fail('Recovery bypass')),
      code('GENERATION_BLOCKED'),
    )
    await controller.shutdown()
    await assert.rejects(
      controller.withResourceMaintenance(async () => assert.fail('Closed bypass')),
      code('GENERATION_CLOSED'),
    )
  } finally {
    await controller.shutdown()
    await f.close()
  }
})

test('shutdown waits for resource maintenance and does not fence an invented Project key', async () => {
  const f = await createRegionalQueueFixture()
  const { calls, controller } = controllerFixture(f)
  const entered = signal()
  const release = signal()
  try {
    const maintenance = controller.withResourceMaintenance(async () => {
      entered.resolve()
      await release.promise
    })
    await entered.promise
    const shutdown = controller.shutdown()
    assert.equal(calls.shutdown, 0)
    release.resolve()
    await maintenance
    await shutdown
    assert.equal(calls.shutdown, 1)
    // Existing queue validation would reject a null/non-Project fence immediately.
    assert.equal(await f.queue.withIdleResourceMaintenance(async () => 'unfenced'), 'unfenced')
  } finally {
    release.resolve()
    await controller.shutdown()
    await f.close()
  }
})
