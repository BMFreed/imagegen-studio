import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { access, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import { GenerationQueueRepository } from './generation-queue.js'
import {
  createRegionalQueueFixture,
  enqueueRegionalFixture,
} from './test-fixtures/regional-queue.js'

test('regional frozen reload survives caller edits and removal of the original target', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const expected = structuredClone(fixture.regional.recipe)
    const pending = fixture.queue.enqueueCurrentCanvasRegional({
      prepared: fixture.prepared,
      projectPath: fixture.projectPath,
      regional: fixture.regional,
      request: fixture.request,
      stagingSessionId: randomUUID(),
    })
    fixture.regional.recipe.regions[0].coverage.alpha.fill(77)
    fixture.regional.recipe.regions[0].positive!.text = 'later project edit'
    fixture.request.job.sampling.seed = 999
    const item = await pending
    await rm(fixture.request.job.target.path)
    const reopened = new GenerationQueueRepository(fixture.db, fixture.root)
    const loaded = await reopened.loadVerifiedRegionalInput(item.id)
    assert.deepEqual(loaded.input.recipe, expected)
    assert.equal(loaded.input.request.job.sampling.seed, 123)
    assert.ok((await readFile(loaded.targetPath)).equals(fixture.prepared.targetPngBytes))
    await assert.rejects(reopened.loadVerifiedInput(item.id), { code: 'QUEUE_INPUT_INVALID' })
    await assert.rejects(fixture.queue.getManagerEntry(item.id), { code: 'QUEUE_ITEM_NOT_FOUND' })
    assert.deepEqual((await fixture.queue.listManagerPage()).items, [])
    assert.equal((await fixture.queue.listManagerPage()).counts.pending, 0)
    assert.equal(await fixture.queue.nextDispatchableKind(), null)
    assert.equal(await fixture.queue.claimNextPending(), null)
  } finally {
    await fixture.close()
  }
})

test('regional restart cancels old work and Retry owns an independent exact input copy', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const source = await enqueueRegionalFixture(fixture)
    const running = await fixture.queue.claimNextPendingRegional()
    assert.equal(running?.item.id, source.id)
    const restarted = new GenerationQueueRepository(fixture.db, fixture.root)
    assert.equal((await restarted.recoverAfterRestart()).canceledCount, 1)
    const canceled = await restarted.loadVerifiedRegionalInput(source.id)
    assert.equal(canceled.item.status, 'canceled')
    const retry = await restarted.retryCurrentCanvasRegionalTerminal(
      source.id,
      canceled.item.statusSequence,
    )
    const copied = await restarted.loadVerifiedRegionalInput(retry.id)
    assert.notEqual(retry.id, source.id)
    assert.notEqual(retry.stagingSessionId, source.stagingSessionId)
    assert.notEqual(copied.targetPath, canceled.targetPath)
    assert.deepEqual(copied.payload, canceled.payload)
    assert.deepEqual(copied.input.recipe, canceled.input.recipe)
    await assert.rejects(
      restarted.retryCurrentCanvasRegionalTerminal(source.id, canceled.item.statusSequence),
      { code: 'QUEUE_STATUS_CONFLICT' },
    )
    await assert.rejects(restarted.retryTerminal(source.id, canceled.item.statusSequence + 1), {
      code: 'QUEUE_INPUT_INVALID',
    })
    await restarted.deleteTerminal(source.id, canceled.item.statusSequence + 1)
    await assert.rejects(access(canceled.targetPath))
    assert.deepEqual(
      (await restarted.loadVerifiedRegionalInput(retry.id)).input.recipe,
      copied.input.recipe,
    )
    assert.equal((await restarted.claimNextPendingRegional())?.item.id, retry.id)
  } finally {
    await fixture.close()
  }
})

test('regional and ordinary claims share the existing global running slot across repositories', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const regional = await enqueueRegionalFixture(fixture)
    const normal = await fixture.queue.enqueueIllustriousGeneration({
      prepared: fixture.prepared,
      projectPath: fixture.projectPath,
      request: fixture.request,
      stagingSessionId: randomUUID(),
    })
    const other = new GenerationQueueRepository(fixture.db, fixture.root)
    await other.recoverAfterRestart()
    // Startup cancels pending rows by contract. Fresh attempts are admitted after both recoveries.
    const regionalOld = await other.loadVerifiedRegionalInput(regional.id)
    const regionalRetry = await other.retryCurrentCanvasRegionalTerminal(
      regional.id,
      regionalOld.item.statusSequence,
    )
    const normalOld = await other.loadVerifiedInput(normal.id)
    const normalRetry = await other.retryTerminal(normal.id, normalOld.item.statusSequence)
    const [regionalClaim, normalClaim] = await Promise.all([
      fixture.queue.claimNextPendingRegional(),
      other.claimNextPending(),
    ])
    assert.equal(Number(regionalClaim !== null) + Number(normalClaim !== null), 1)
    assert.equal(
      (
        await fixture.db
          .selectFrom('generation_queue_item')
          .select('id')
          .where('status', '=', 'running')
          .execute()
      ).length,
      1,
    )
    assert.ok(
      regionalClaim?.item.id === regionalRetry.id || normalClaim?.item.id === normalRetry.id,
    )
    assert.equal(await fixture.queue.claimNextPendingRegional(), null)
    assert.equal(await other.claimNextPending(), null)
  } finally {
    await fixture.close()
  }
})

for (const filename of ['regional.json', 'region-0.alpha8', 'target.png', 'manifest.json']) {
  test(`regional ${filename} corruption refuses reload and fails only the corrupt pending row`, async () => {
    const fixture = await createRegionalQueueFixture()
    try {
      const source = await enqueueRegionalFixture(fixture)
      const neighbor = await enqueueRegionalFixture(fixture)
      const loaded = await fixture.queue.loadVerifiedRegionalInput(source.id)
      await writeFile(path.join(path.dirname(loaded.targetPath), filename), 'corrupt', {
        mode: 0o600,
      })
      await assert.rejects(fixture.queue.loadVerifiedRegionalInput(source.id), {
        code: 'QUEUE_INPUT_INVALID',
      })
      assert.equal((await fixture.queue.claimNextPendingRegional())?.item.id, neighbor.id)
      const row = await fixture.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', source.id)
        .executeTakeFirstOrThrow()
      assert.equal(row.status, 'failed')
      assert.equal(row.error_code, 'QUEUE_INPUT_INVALID')
    } finally {
      await fixture.close()
    }
  })
}

test('regional admission and Retry lost acknowledgments preserve the exact committed attempt', async () => {
  const fixture = await createRegionalQueueFixture({
    queueHooks: {
      afterBatchCommit: async () => {
        throw new Error('lost admission acknowledgment')
      },
      afterRetryCommit: async () => {
        throw new Error('lost retry acknowledgment')
      },
    },
  })
  try {
    const item = await enqueueRegionalFixture(fixture)
    const canceled = await fixture.queue.cancel(item.id)
    const retry = await fixture.queue.retryCurrentCanvasRegionalTerminal(
      item.id,
      canceled.statusSequence,
    )
    assert.equal(retry.status, 'pending')
    assert.equal(
      (await fixture.queue.loadVerifiedRegionalInput(retry.id)).input.recipe.item.seed,
      123,
    )
    assert.equal(
      (await fixture.db.selectFrom('generation_queue_item').select('id').execute()).length,
      2,
    )
  } finally {
    await fixture.close()
  }
})

test('regional precommit failure publishes no row and does not affect the adjacent ordinary owner', async () => {
  const fixture = await createRegionalQueueFixture({
    queueHooks: {
      afterInputPublish: async () => {
        throw new Error('before row commit')
      },
    },
  })
  try {
    await assert.rejects(enqueueRegionalFixture(fixture), /before row commit/)
    assert.equal(
      (await fixture.db.selectFrom('generation_queue_item').select('id').execute()).length,
      0,
    )
    const queue = new GenerationQueueRepository(fixture.db, fixture.root)
    await queue.recoverAfterRestart()
    const normal = await queue.enqueueIllustriousGeneration({
      prepared: fixture.prepared,
      projectPath: fixture.projectPath,
      request: fixture.request,
      stagingSessionId: randomUUID(),
    })
    assert.equal((await queue.claimNextPending())?.item.id, normal.id)
  } finally {
    await fixture.close()
  }
})
