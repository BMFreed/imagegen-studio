import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import { GenerationQueueRepository } from './generation-queue.js'
import {
  createRegionalQueueFixture,
  enqueueRegionalFixture,
  type RegionalQueueFixture,
} from './test-fixtures/regional-queue.js'
import { admitSmartPatch, withSmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'

async function withFixture(run: (fixture: RegionalQueueFixture) => Promise<void>): Promise<void> {
  const fixture = await createRegionalQueueFixture()
  try {
    await run(fixture)
  } finally {
    await fixture.close()
  }
}

async function enqueueNormal(fixture: RegionalQueueFixture, projectPath = fixture.projectPath) {
  return await fixture.queue.enqueueIllustriousGeneration({
    prepared: fixture.prepared,
    projectPath,
    request: fixture.request,
    stagingSessionId: randomUUID(),
  })
}

// The real migrated SQLite/recovered queue owns the count. Existing queue fixtures provide valid
// admission only; no ProjectService, open-tab list, worker or app-close implementation is replaced.
test('app close counts ordinary and private regional jobs across Projects without open-tab or index membership', async () => {
  await withFixture(async (fixture) => {
    assert.deepEqual(await fixture.queue.getAppCloseImpact(), { unfinishedJobCount: 0 })
    const regional = await enqueueRegionalFixture(fixture)
    const otherPath = path.join(fixture.root, 'Other.igs')
    await writeFile(otherPath, 'a separate closed queue Project identity fixture')
    const normal = await enqueueNormal(fixture, otherPath)
    assert.notEqual(regional.localProjectKey, normal.localProjectKey)
    assert.deepEqual(await fixture.db.selectFrom('project_index').selectAll().execute(), [])
    assert.deepEqual(await fixture.queue.getAppCloseImpact(), { unfinishedJobCount: 2 })
    // Manager visibility excludes the private regional operation; shutdown impact must include it.
    assert.equal((await fixture.queue.listManagerPage()).counts.pending, 1)
    await fixture.queue.cancel(normal.id)
    assert.deepEqual(await fixture.queue.getAppCloseImpact(), { unfinishedJobCount: 1 })
  })
})

test('app close includes pending and running only, excluding terminal APP_RESTART history', async () => {
  await withFixture(async (fixture) => {
    const item = await enqueueNormal(fixture)
    // Controlled status preconditions isolate the count from worker execution and cancellation.
    for (const status of ['pending', 'running', 'completed', 'failed', 'canceled'] as const) {
      await fixture.db
        .updateTable('generation_queue_item')
        .set({ error_code: status === 'canceled' ? 'APP_RESTART' : null, status })
        .where('id', '=', item.id)
        .execute()
      assert.deepEqual(await fixture.queue.getAppCloseImpact(), {
        unfinishedJobCount: status === 'pending' || status === 'running' ? 1 : 0,
      })
    }
  })
})

for (const family of ['anima', 'illustrious'] as const) {
  test(`app close counts actual ${family} Smart Patch batch rows`, async () => {
    await withSmartPatchQueueFixture(family, async (fixture) => {
      const items = await admitSmartPatch(fixture)
      assert.equal(items.length, 2)
      const rows = await fixture.database.db
        .selectFrom('generation_queue_item')
        .select('operation')
        .where(
          'id',
          'in',
          items.map((item) => item.id),
        )
        .execute()
      assert.ok(rows.every((row) => row.operation === `${family}-smart-patch`))
      assert.deepEqual(await fixture.queue.getAppCloseImpact(), { unfinishedJobCount: 2 })
      await fixture.queue.cancel(items[0].id)
      assert.deepEqual(await fixture.queue.getAppCloseImpact(), { unfinishedJobCount: 1 })
    })
  })
}

test('startup recovery removes old pending/running from future close impact while preserving APP_RESTART history', async () => {
  await withFixture(async (fixture) => {
    const pending = await enqueueNormal(fixture)
    const running = await enqueueNormal(fixture)
    await fixture.db
      .updateTable('generation_queue_item')
      .set({ status: 'running' })
      .where('id', '=', running.id)
      .execute()
    assert.deepEqual(await fixture.queue.getAppCloseImpact(), { unfinishedJobCount: 2 })
    const recovered = new GenerationQueueRepository(fixture.db, fixture.root)
    await recovered.recoverAfterRestart()
    assert.deepEqual(await recovered.getAppCloseImpact(), { unfinishedJobCount: 0 })
    const rows = await fixture.db
      .selectFrom('generation_queue_item')
      .select(['id', 'status', 'error_code'])
      .where('id', 'in', [pending.id, running.id])
      .execute()
    assert.equal(rows.length, 2)
    assert.ok(rows.every((row) => row.status === 'canceled' && row.error_code === 'APP_RESTART'))
    await enqueueNormal(fixture)
    assert.deepEqual(await recovered.getAppCloseImpact(), { unfinishedJobCount: 1 })
  })
})

test('malformed payload and missing input still count without changing queue rows or SQLite bytes', async () => {
  await withFixture(async (fixture) => {
    const malformed = await enqueueNormal(fixture)
    const missing = await enqueueNormal(fixture)
    await fixture.db
      .updateTable('generation_queue_item')
      .set({ frozen_payload_json: '{invalid' })
      .where('id', '=', malformed.id)
      .execute()
    await rm(path.join(fixture.root, 'generation-inputs', missing.id), { recursive: true })
    // Actual input consumers refuse both controls. Operational close impact must remain inspectable.
    await assert.rejects(fixture.queue.loadVerifiedInput(malformed.id))
    await assert.rejects(fixture.queue.loadVerifiedInput(missing.id))
    const rowsBefore = await fixture.db.selectFrom('generation_queue_item').selectAll().execute()
    const files = [fixture.database.filePath, `${fixture.database.filePath}-wal`]
    const bytesBefore = await Promise.all(files.map((filename) => readFile(filename)))
    assert.deepEqual(await fixture.queue.getAppCloseImpact(), { unfinishedJobCount: 2 })
    assert.deepEqual(await fixture.queue.getAppCloseImpact(), { unfinishedJobCount: 2 })
    assert.deepEqual(
      await fixture.db.selectFrom('generation_queue_item').selectAll().execute(),
      rowsBefore,
    )
    const bytesAfter = await Promise.all(files.map((filename) => readFile(filename)))
    for (const [index, bytes] of bytesBefore.entries()) {
      assert.ok(
        bytes.equals(bytesAfter[index]),
        'Metadata-only close impact must not write SQLite.',
      )
    }
  })
})

test('unreconciled queue refuses close impact instead of reporting an empty queue', async () => {
  await withFixture(async (fixture) => {
    await enqueueNormal(fixture)
    const before = await fixture.db.selectFrom('generation_queue_item').selectAll().execute()
    const unreconciled = new GenerationQueueRepository(fixture.db, fixture.root)
    await assert.rejects(unreconciled.getAppCloseImpact(), { code: 'QUEUE_NOT_RECONCILED' })
    assert.deepEqual(
      await fixture.db.selectFrom('generation_queue_item').selectAll().execute(),
      before,
    )
  })
})
