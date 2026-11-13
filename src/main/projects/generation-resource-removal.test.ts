import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { QueuedResourceRemovalTarget } from './queue-resource-usage.js'

import { GenerationQueueRepository, type QueueResourcePendingWitness } from './generation-queue.js'
import { enqueueAnimaStagingBatch, withAnimaStagingFixture } from './test-fixtures/anima-staging.js'
import {
  createRegionalQueueFixture,
  enqueueRegionalFixture,
  type RegionalQueueFixture,
} from './test-fixtures/regional-queue.js'
import { admitSmartPatch, withSmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'

/**
 * Real migrated SQLite, queue publication/claim, frozen files and strict payload projection.
 * Existing fixtures use declared tiny exact resources; no model inference or hard unlink.
 */
function failure(code: string) {
  return (error: unknown) => error instanceof Error && 'code' in error && error.code === code
}

function signal() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function target(f: RegionalQueueFixture): QueuedResourceRemovalTarget {
  const { managedPath, reference } = f.prepared.context.model
  return {
    resourceId: reference.localModelId,
    unsharedPaths: [managedPath],
    versionIds: [reference.localVersionId],
  }
}

function unusedTarget(): QueuedResourceRemovalTarget {
  return { resourceId: randomUUID(), unsharedPaths: [], versionIds: [randomUUID()] }
}

async function enqueueNormal(f: RegionalQueueFixture, alias?: 'different-path' | 'same-path') {
  const prepared = {
    context: structuredClone(f.prepared.context),
    targetPngBytes: Buffer.from(f.prepared.targetPngBytes),
  }
  const request = structuredClone(f.request)
  if (alias) {
    prepared.context.model.reference.localModelId = randomUUID()
    prepared.context.model.reference.localVersionId = randomUUID()
    if (alias === 'different-path') {
      const file = path.join(f.root, 'same-sha-other-path.safetensors')
      await copyFile(prepared.context.model.managedPath, file)
      prepared.context.model.managedPath = file
      request.job.checkpoint.path = file
    }
  }
  return await f.queue.enqueueIllustriousGeneration({
    prepared,
    projectPath: f.projectPath,
    request,
    stagingSessionId: randomUUID(),
  })
}

async function queueRows(f: RegionalQueueFixture) {
  return await f.db.selectFrom('generation_queue_item').selectAll().orderBy('id').execute()
}

async function frozenFiles(f: RegionalQueueFixture, id: string) {
  const root = path.join(f.root, 'generation-inputs', id)
  const entries: Record<string, string> = {}
  async function read(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      assert.equal(entry.isSymbolicLink(), false)
      if (entry.isDirectory()) {
        await read(file)
      } else {
        entries[path.relative(root, file)] = createHash('sha256')
          .update(await readFile(file))
          .digest('hex')
      }
    }
  }
  await read(root)
  return entries
}

test('resource inspection needs the recovered owner and never treats corrupt unrelated work as unused', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const unrecovered = new GenerationQueueRepository(f.db, f.root)
    await assert.rejects(
      unrecovered.inspectResourceUsage(target(f)),
      failure('QUEUE_NOT_RECONCILED'),
    )
    const queued = await enqueueNormal(f)
    await f.db
      .updateTable('generation_queue_item')
      .set({ frozen_payload_json: '{}' })
      .where('id', '=', queued.id)
      .execute()
    const before = await queueRows(f)
    await assert.rejects(
      f.queue.inspectResourceUsage(unusedTarget()),
      failure('QUEUE_INPUT_INVALID'),
    )
    await assert.rejects(
      f.queue.withResourceRemoval(unusedTarget(), [], false, async () =>
        assert.fail('Unknown usage'),
      ),
      failure('QUEUE_INPUT_INVALID'),
    )
    assert.deepEqual(await queueRows(f), before)
  } finally {
    await f.close()
  }
})

test('normal exact logical binding stays affected even when shared bytes will be retained', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const queued = await enqueueNormal(f)
    const row = (await queueRows(f))[0]
    const reviewed = await f.queue.inspectResourceUsage({ ...target(f), unsharedPaths: [] })
    assert.deepEqual(reviewed, {
      pending: [
        {
          id: queued.id,
          payloadSha256: createHash('sha256').update(row.frozen_payload_json).digest('hex'),
          statusSequence: queued.statusSequence,
        },
      ],
      running: [],
    })
    // Inspection must not hash/read managed ML weights just to classify their frozen binding.
    await rm(f.prepared.context.model.managedPath)
    assert.deepEqual(await f.queue.inspectResourceUsage(target(f)), reviewed)
  } finally {
    await f.close()
  }
})

for (const alias of ['different-path', 'same-path'] as const) {
  test(`same SHA under another logical binding is unrelated with ${alias} when no physical path is deleted`, async () => {
    const f = await createRegionalQueueFixture()
    try {
      const queued = await enqueueNormal(f, alias)
      const before = await queueRows(f)
      const keptShared = { ...target(f), unsharedPaths: [] }
      assert.deepEqual(await f.queue.inspectResourceUsage(keptShared), { pending: [], running: [] })
      assert.equal(
        await f.queue.withResourceRemoval(keptShared, [], false, async () => 'allowed'),
        'allowed',
      )
      assert.deepEqual(await queueRows(f), before)
      if (alias === 'same-path') {
        assert.deepEqual(
          (await f.queue.inspectResourceUsage(target(f))).pending.map(({ id }) => id),
          [queued.id],
        )
      }
    } finally {
      await f.close()
    }
  })
}

test('only approved pending jobs are canceled; unrelated pending/running rows and every frozen file remain exact', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const running = await enqueueNormal(f, 'different-path')
    assert.equal((await f.queue.claimNextPending())?.item.id, running.id)
    const affected = await enqueueNormal(f)
    const unrelated = await enqueueNormal(f, 'different-path')
    const before = await queueRows(f)
    const files = await frozenFiles(f, affected.id)
    const reviewed = await f.queue.inspectResourceUsage(target(f))
    assert.deepEqual(
      reviewed.pending.map(({ id }) => id),
      [affected.id],
    )
    assert.deepEqual(reviewed.running, [])
    await assert.rejects(
      f.queue.withResourceRemoval(target(f), reviewed.pending, false, async () =>
        assert.fail('No cancel consent'),
      ),
      failure('QUEUE_STATUS_CONFLICT'),
    )
    assert.deepEqual(await queueRows(f), before)
    let reached = false
    await f.queue.withResourceRemoval(target(f), reviewed.pending, true, async () => {
      reached = true
      const changed = await queueRows(f)
      const item = changed.find(({ id }) => id === affected.id)!
      assert.equal(item.status, 'canceled')
      assert.equal(item.status_sequence, affected.statusSequence + 1)
      assert.equal(item.error_code, 'USER_CANCELED')
      assert.equal(item.error_message, 'The job was canceled.')
      assert.ok(item.finished_at)
      for (const id of [running.id, unrelated.id]) {
        assert.deepEqual(
          changed.find((row) => row.id === id),
          before.find((row) => row.id === id),
        )
      }
    })
    assert.equal(reached, true)
    assert.deepEqual(await frozenFiles(f, affected.id), files)
  } finally {
    await f.close()
  }
})

test('affected running work blocks removal without requesting running cancellation or changing any row', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const running = await enqueueNormal(f)
    assert.equal((await f.queue.claimNextPending())?.item.id, running.id)
    const pending = await enqueueNormal(f)
    const reviewed = await f.queue.inspectResourceUsage(target(f))
    assert.deepEqual(
      reviewed.running.map(({ id }) => id),
      [running.id],
    )
    assert.deepEqual(
      reviewed.pending.map(({ id }) => id),
      [pending.id],
    )
    const before = await queueRows(f)
    await assert.rejects(
      f.queue.withResourceRemoval(target(f), reviewed.pending, true, async () =>
        assert.fail('Running use'),
      ),
      failure('QUEUE_STATUS_CONFLICT'),
    )
    assert.deepEqual(await queueRows(f), before)
    const stopping = await f.queue.cancel(running.id, reviewed.running[0].statusSequence)
    assert.equal(stopping.status, 'running')
    assert.equal(stopping.cancelRequested, true)
    const beforeExit = await queueRows(f)
    const stoppingUsage = await f.queue.inspectResourceUsage(target(f))
    assert.deepEqual(
      stoppingUsage.running.map(({ id }) => id),
      [running.id],
    )
    await assert.rejects(
      f.queue.withResourceRemoval(target(f), stoppingUsage.pending, true, async () =>
        assert.fail('Unconfirmed running exit'),
      ),
      failure('QUEUE_STATUS_CONFLICT'),
    )
    assert.deepEqual(await queueRows(f), beforeExit)
  } finally {
    await f.close()
  }
})

for (const transition of [
  'claim',
  'new-pending',
  'cancel',
  'sequence',
  'payload',
  'delete',
] as const) {
  test(`reviewed pending scope refuses ${transition} changes without partial cancellation or removal`, async () => {
    const f = await createRegionalQueueFixture()
    try {
      const queued = await enqueueNormal(f)
      const reviewed = await f.queue.inspectResourceUsage(target(f))
      switch (transition) {
        case 'cancel': {
          await f.queue.cancel(queued.id, queued.statusSequence)
          break
        }
        case 'claim': {
          await f.queue.claimNextPending()
          break
        }
        case 'delete': {
          await f.db.deleteFrom('generation_queue_item').where('id', '=', queued.id).execute()
          break
        }
        case 'new-pending': {
          await enqueueNormal(f)
          break
        }
        case 'sequence': {
          await f.db
            .updateTable('generation_queue_item')
            .set({ status_sequence: 2 })
            .where('id', '=', queued.id)
            .execute()
          break
        }
        default: {
          const row = (await queueRows(f))[0]
          const parsed = JSON.parse(row.frozen_payload_json)
          parsed.originRequestId = randomUUID()
          await f.db
            .updateTable('generation_queue_item')
            .set({ frozen_payload_json: JSON.stringify(parsed) })
            .where('id', '=', queued.id)
            .execute()
        }
      }
      const before = await queueRows(f)
      await assert.rejects(
        f.queue.withResourceRemoval(target(f), reviewed.pending, true, async () =>
          assert.fail('Stale consent'),
        ),
        failure('QUEUE_STATUS_CONFLICT'),
      )
      assert.deepEqual(await queueRows(f), before)
    } finally {
      await f.close()
    }
  })
}

test('pending-only CAS failure rolls back the entire approved set before filesystem work', async () => {
  const f = await createRegionalQueueFixture()
  try {
    await enqueueNormal(f)
    await enqueueNormal(f)
    const reviewed = await f.queue.inspectResourceUsage(target(f))
    assert.equal(reviewed.pending.length, 2)
    const second = reviewed.pending[1].id
    await sql
      .raw(
        `CREATE TRIGGER refuse_second_removal_cancel BEFORE UPDATE OF status ON generation_queue_item WHEN OLD.id = '${second}' AND NEW.status = 'canceled' BEGIN SELECT RAISE(IGNORE); END`,
      )
      .execute(f.db)
    const before = await queueRows(f)
    await assert.rejects(
      f.queue.withResourceRemoval(target(f), reviewed.pending, true, async () =>
        assert.fail('Partial CAS'),
      ),
      failure('QUEUE_STATUS_CONFLICT'),
    )
    assert.deepEqual(await queueRows(f), before)
  } finally {
    await f.close()
  }
})

test('later filesystem failure preserves explicitly canceled pending state and releases the queue owner', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const queued = await enqueueNormal(f)
    const reviewed = await f.queue.inspectResourceUsage(target(f))
    const files = await frozenFiles(f, queued.id)
    const refused = new Error('Declared later filesystem failure')
    await assert.rejects(
      f.queue.withResourceRemoval(target(f), reviewed.pending, true, async () => {
        throw refused
      }),
      (error) => error === refused,
    )
    const row = (await queueRows(f))[0]
    assert.equal(row.status, 'canceled')
    assert.equal(row.error_code, 'USER_CANCELED')
    assert.equal(row.status_sequence, queued.statusSequence + 1)
    assert.deepEqual(await frozenFiles(f, queued.id), files)
    assert.equal(
      await f.queue.withResourceRemoval(target(f), [], false, async () => 'retry'),
      'retry',
    )
  } finally {
    await f.close()
  }
})

test('continuous resource serializer holds later claims and admissions until removal work exits', async () => {
  const f = await createRegionalQueueFixture()
  const entered = signal()
  const release = signal()
  const order: string[] = []
  try {
    const original = await enqueueNormal(f, 'different-path')
    const maintenance = f.queue.withResourceRemoval(target(f), [], false, async () => {
      order.push('remove-enter')
      entered.resolve()
      await release.promise
      order.push('remove-exit')
    })
    await entered.promise
    const claim = f.queue.claimNextPending().then((value) => {
      order.push('claim')
      return value
    })
    const enqueue = enqueueNormal(f).then((value) => {
      order.push('enqueue')
      return value
    })
    assert.deepEqual(
      (await queueRows(f)).map(({ id }) => id),
      [original.id],
    )
    release.resolve()
    await maintenance
    assert.equal((await claim)?.item.id, original.id)
    assert.equal((await enqueue).status, 'pending')
    assert.deepEqual(order, ['remove-enter', 'remove-exit', 'claim', 'enqueue'])
  } finally {
    release.resolve()
    await f.close()
  }
})

test('an already-entered private claim becomes running before resource maintenance and blocks it', async () => {
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
  try {
    const queued = await enqueueRegionalFixture(f)
    const reviewed = await f.queue.inspectResourceUsage(target(f))
    const claim = f.queue.claimNextPendingRegional()
    await entered.promise
    const maintenance = f.queue.withResourceRemoval(target(f), reviewed.pending, true, async () =>
      assert.fail('Running private use'),
    )
    const refused = assert.rejects(maintenance, failure('QUEUE_STATUS_CONFLICT'))
    release.resolve()
    assert.equal((await claim)?.item.id, queued.id)
    await refused
    assert.equal((await f.queue.getRegionalQueueItem(queued.id))?.status, 'running')
  } finally {
    release.resolve()
    await f.close()
  }
})

test('private regional inspection verifies its sidecar and fails closed for corrupt metadata', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const queued = await enqueueRegionalFixture(f)
    const reviewed = await f.queue.inspectResourceUsage(target(f))
    assert.deepEqual(
      reviewed.pending.map(({ id }) => id),
      [queued.id],
    )
    await writeFile(path.join(f.root, 'generation-inputs', queued.id, 'regional.json'), '{}')
    const before = await queueRows(f)
    await assert.rejects(
      f.queue.withResourceRemoval(unusedTarget(), [], false, async () =>
        assert.fail('Unknown sidecar use'),
      ),
      failure('QUEUE_INPUT_INVALID'),
    )
    assert.deepEqual(await queueRows(f), before)
  } finally {
    await f.close()
  }
})

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} Smart frozen members are inspected and canceled without adopting current selection`, async () => {
    await withSmartPatchQueueFixture(family, async (f) => {
      const items = await admitSmartPatch(f)
      const model = f.material.manifest.context.generationDraft.model!
      const selected: QueuedResourceRemovalTarget = {
        resourceId: model.localModelId,
        unsharedPaths: [],
        versionIds: [model.localVersionId],
      }
      const reviewed = await f.queue.inspectResourceUsage(selected)
      assert.deepEqual(
        reviewed.pending.map(({ id }) => id).sort(),
        items.map(({ id }) => id).sort(),
      )
      await f.queue.withResourceRemoval(selected, reviewed.pending, true, async () => undefined)
      const rows = await f.database.db.selectFrom('generation_queue_item').selectAll().execute()
      assert.ok(
        rows.every((row) => row.status === 'canceled' && row.error_code === 'USER_CANCELED'),
      )
    })
  })
}

test('ordinary Anima companion use is preserved independently of checkpoint selection', async () => {
  await withAnimaStagingFixture(async (f) => {
    const { items } = await enqueueAnimaStagingBatch(f)
    const component = f.prepared.context.model.qwen3Encoder
    const selected: QueuedResourceRemovalTarget = {
      resourceId: component.localModelId,
      unsharedPaths: [component.managedPath],
      versionIds: [component.localVersionId],
    }
    const reviewed = await f.queue.inspectResourceUsage(selected)
    assert.deepEqual(
      reviewed.pending.map(({ id }) => id),
      items.map(({ id }) => id),
    )
    await f.queue.withResourceRemoval(selected, reviewed.pending, true, async () => undefined)
  })
})

test('queued inspection and consent defensively capture caller-owned targets and witnesses before awaits', async () => {
  const f = await createRegionalQueueFixture()
  const entered = signal()
  const release = signal()
  try {
    const queued = await enqueueNormal(f)
    const original = target(f)
    const reviewed = await f.queue.inspectResourceUsage(original)
    const hold = f.queue.withResourceRemoval(unusedTarget(), [], false, async () => {
      entered.resolve()
      await release.promise
    })
    await entered.promise
    const mutableTarget = {
      ...original,
      unsharedPaths: [...original.unsharedPaths],
      versionIds: [...original.versionIds],
    }
    const mutableConsent: QueueResourcePendingWitness[] = structuredClone(reviewed.pending)
    const removal = f.queue.withResourceRemoval(
      mutableTarget,
      mutableConsent,
      true,
      async () => undefined,
    )
    mutableTarget.resourceId = randomUUID()
    mutableTarget.versionIds = [randomUUID()]
    mutableTarget.unsharedPaths = []
    mutableConsent[0].statusSequence = 99
    mutableConsent.push({ id: randomUUID(), payloadSha256: 'a'.repeat(64), statusSequence: 0 })
    release.resolve()
    await hold
    await removal
    assert.equal((await queueRows(f)).find(({ id }) => id === queued.id)?.status, 'canceled')
  } finally {
    release.resolve()
    await f.close()
  }
})

test('target-version disagreement, row-owner drift and malformed consent fail closed before cancellation', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const queued = await enqueueNormal(f)
    const reviewed = await f.queue.inspectResourceUsage(target(f))
    const wrongVersion = { ...target(f), versionIds: [randomUUID()] }
    await assert.rejects(f.queue.inspectResourceUsage(wrongVersion), failure('QUEUE_INPUT_INVALID'))
    await assert.rejects(
      f.queue.withResourceRemoval(
        target(f),
        [...reviewed.pending, ...reviewed.pending],
        true,
        async () => assert.fail('Duplicate consent'),
      ),
      failure('QUEUE_INPUT_INVALID'),
    )
    await f.db
      .updateTable('generation_queue_item')
      .set({ document_revision: randomUUID() })
      .where('id', '=', queued.id)
      .execute()
    const before = await queueRows(f)
    await assert.rejects(
      f.queue.withResourceRemoval(target(f), reviewed.pending, true, async () =>
        assert.fail('Owner mismatch'),
      ),
      failure('QUEUE_INPUT_INVALID'),
    )
    assert.deepEqual(await queueRows(f), before)
  } finally {
    await f.close()
  }
})

test('unknown future operations cannot be silently skipped by resource-specific usage inspection', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const queued = await enqueueNormal(f)
    // Explicit corrupted/newer-store fixture. Normal SQLite writers cannot bypass the enum.
    await sql`PRAGMA ignore_check_constraints = ON`.execute(f.db)
    try {
      await f.db
        .updateTable('generation_queue_item')
        .set({ operation: 'future-unrecognized-resource-owner' })
        .where('id', '=', queued.id)
        .execute()
    } finally {
      await sql`PRAGMA ignore_check_constraints = OFF`.execute(f.db)
    }
    const before = await queueRows(f)
    await assert.rejects(
      f.queue.inspectResourceUsage(unusedTarget()),
      failure('QUEUE_INPUT_INVALID'),
    )
    await assert.rejects(
      f.queue.withResourceRemoval(unusedTarget(), [], false, async () =>
        assert.fail('Future operation'),
      ),
      failure('QUEUE_INPUT_INVALID'),
    )
    assert.deepEqual(await queueRows(f), before)
  } finally {
    await f.close()
  }
})
