import type { AnimaWorkerRequest } from '../../shared/projects/anima-worker-request.js'
import { isGenerationQueuePage } from '../../shared/projects/generation-queue-manager.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { PreparedAnimaGenerationBatch } from './anima-generation-batch.js'
import type { AnimaStagingFixture } from './test-fixtures/anima-staging.js'

import { openAppDatabase } from '../db/database.js'
import { prepareAnimaGenerationBatch } from './anima-generation-batch.js'
import { withAnimaGenerationBatchRequests } from './anima-generation-request.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ANIMA_BATCH_READY } from './test-fixtures/anima-batch.js'
import { enqueueAnimaStagingBatch, withAnimaStagingFixture } from './test-fixtures/anima-staging.js'

type Mutable<T> = T extends ((...args: never[]) => unknown) | Buffer
  ? T
  : { -readonly [K in keyof T]: Mutable<T[K]> }

async function qualified(
  fixture: AnimaStagingFixture,
  use: (
    batch: PreparedAnimaGenerationBatch,
    requests: readonly AnimaWorkerRequest[],
  ) => Promise<void>,
  iterations = 1,
) {
  const batch = prepareAnimaGenerationBatch({ iterations, prepared: fixture.prepared })
  await withAnimaGenerationBatchRequests({
    modelService: fixture.modelService,
    prepared: batch,
    ready: ANIMA_BATCH_READY,
    scratchBasePath: fixture.scratch,
    use: async (requests) => await use(batch, requests),
  })
}
function preflight(fixture: AnimaStagingFixture, stagingSessionId: string) {
  return async (entries: readonly { frozenPayloadJson: string; queueItemId: string }[]) =>
    await fixture.staging.preflightBatchCapacity({
      entries,
      localProjectKey: localProjectRecoveryKey(fixture.projectPath),
      projectPath: fixture.projectPath,
      stagingSessionId,
    })
}
async function noPublication(fixture: AnimaStagingFixture) {
  assert.equal(
    (await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute()).length,
    0,
  )
  assert.equal(
    (await fixture.database.db.selectFrom('generation_candidate_receipt').selectAll().execute())
      .length,
    0,
  )
  assert.equal(
    (await fixture.database.db.selectFrom('generation_seed_cursor').selectAll().execute()).length,
    0,
  )
  assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
  const inputRoot = path.join(fixture.root, 'generation-inputs')
  assert.deepEqual(await readdir(inputRoot).catch(() => []), [])
}

for (const opaque of [false, true]) {
  test(`real Anima ${opaque ? 'img2img' : 'txt2img'} queue stores complete concrete order, exact signed LoRA and immutable portable Project`, async () => {
    await withAnimaStagingFixture(
      async (fixture) => {
        fixture.prepared.context.generationDraft.loras.splice(1, 0, {
          enabled: false,
          resource: {
            ...fixture.prepared.context.loras[0].reference,
            baseModelFamily: 'illustrious',
            localModelId: 'missing-other-family',
            predictionType: 'epsilon',
          },
          weight: -5,
        })
        const { items, preparedBatch } = await enqueueAnimaStagingBatch(fixture, { iterations: 2 })
        assert.equal(items.length, 8)
        assert.equal(new Set(items.map((item) => item.batchId)).size, 1)
        assert.equal(new Set(items.map((item) => item.stagingSessionId)).size, 1)
        assert.equal(new Set(items.map((item) => item.id)).size, 8)
        const rows = await fixture.database.db
          .selectFrom('generation_queue_item')
          .selectAll()
          .orderBy('created_at')
          .orderBy('id')
          .execute()
        assert.deepEqual(
          rows.map((row) => row.id),
          items.map((item) => item.id),
        )
        for (const [index, item] of items.entries()) {
          const loaded = await fixture.queue.loadVerifiedInput(item.id)
          assert.equal(loaded.payload.kind, opaque ? 'anima-img2img' : 'anima-txt2img')
          assert.ok(
            loaded.payload.kind === 'anima-txt2img' || loaded.payload.kind === 'anima-img2img',
          )
          assert.deepEqual(loaded.payload.context.prompts, preparedBatch.items[index].prompts)
          assert.equal(loaded.payload.context.sampling.seed, preparedBatch.items[index].seed)
          assert.equal(loaded.payload.context.sampling.seedBehavior, 'per-iteration')
          assert.deepEqual(
            loaded.payload.workerJob.sampling,
            preparedBatch.items[index].samplingPlan,
          )
          assert.deepEqual(
            loaded.payload.workerJob.prompts,
            preparedBatch.items[index].compiledPrompts,
          )
          assert.deepEqual(loaded.payload.context.model, preparedBatch.context.model)
          assert.deepEqual(
            loaded.payload.context.loraStack,
            preparedBatch.context.generationDraft.loras,
          )
          assert.deepEqual(
            loaded.payload.workerJob.loras.map((entry) => entry.weight),
            [-0.7, 0, 1.2],
          )
          assert.deepEqual(await readFile(loaded.targetPath), preparedBatch.targetPngBytes)
          assert.equal('generationDraft' in loaded.payload.context, false)
          assert.equal('output' in loaded.payload.workerJob, false)
          assert.equal('path' in loaded.payload.workerJob.target, false)
        }
        const page = await fixture.queue.listManagerPage()
        assert.equal(isGenerationQueuePage(page), true)
        assert.equal(page.counts.pending, 8)
        for (const row of page.items) {
          assert.equal(row.operation, opaque ? 'anima-img2img' : 'anima-txt2img')
          assert.equal(row.details?.sampling.animaMethod, 'euler')
          assert.equal(row.details?.sampling.predictionType, undefined)
          assert.equal(row.details?.sampling.sampler, undefined)
          assert.equal(row.details?.sampling.scheduler, undefined)
        }
        const actionJobs = await fixture.queue.listUnfinishedActionJobsByProjectDocument(
          localProjectRecoveryKey(fixture.projectPath),
          preparedBatch.context.documentId,
        )
        assert.deepEqual(
          actionJobs.map((item) => [item.prompt, item.seed]),
          preparedBatch.items.map((item) => [item.prompts.positive, item.seed]),
        )
        assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
        assert.equal(
          (await fixture.database.db.selectFrom('generation_seed_cursor').selectAll().execute())
            .length,
          0,
        )
      },
      { opaque },
    )
  })
}

test('Anima queue actual close/reopen cancels unfinished attempts and frozen Retry retains concrete seed, companions and entire native plan', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const { items } = await enqueueAnimaStagingBatch(fixture)
    const original = await fixture.queue.loadVerifiedInput(items[0].id)
    const originalRow = await fixture.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', items[0].id)
      .executeTakeFirstOrThrow()
    fixture.prepared.context.sampling.seed = 999
    fixture.prepared.context.sampling.animaMethod = 'lcm'
    fixture.prepared.context.prompts.positive = 'later authoring'
    await fixture.database.close()
    const reopened = openAppDatabase(fixture.root, path.resolve('src/main/db/migrations'))
    try {
      const queue = new GenerationQueueRepository(reopened.db, fixture.root)
      await queue.recoverAfterRestart()
      const terminal = await queue.loadVerifiedRetryInput(items[0].id)
      assert.equal(terminal.item.status, 'canceled')
      assert.deepEqual(terminal.payload, original.payload)
      const retried = await queue.retryTerminal(items[0].id, terminal.item.statusSequence)
      assert.notEqual(retried.id, items[0].id)
      assert.notEqual(retried.batchId, items[0].batchId)
      assert.notEqual(retried.stagingSessionId, items[0].stagingSessionId)
      const frozen = await queue.loadVerifiedInput(retried.id)
      assert.deepEqual(frozen.payload, original.payload)
      assert.deepEqual(await readFile(frozen.targetPath), await readFile(original.targetPath))
      const retriedRow = await reopened.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', retried.id)
        .executeTakeFirstOrThrow()
      assert.equal(retriedRow.frozen_payload_json, originalRow.frozen_payload_json)
      await assert.rejects(queue.retryTerminal(items[0].id, terminal.item.statusSequence), {
        code: 'QUEUE_STATUS_CONFLICT',
      })
      assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
      assert.equal(
        (await reopened.db.selectFrom('generation_seed_cursor').selectAll().execute()).length,
        0,
      )
    } finally {
      await reopened.close()
    }
  })
})

test('Anima queue snapshots complete caller inputs before preflight await and preserves actual seed zero', async () => {
  await withAnimaStagingFixture(
    async (fixture) =>
      await qualified(fixture, async (batch, requests) => {
        const mutable = {
          ...structuredClone({
            context: batch.context,
            items: batch.items,
            iterations: batch.iterations,
            truncated: batch.truncated,
          }),
          targetPngBytes: Buffer.from(batch.targetPngBytes),
        } as unknown as Mutable<PreparedAnimaGenerationBatch>
        const commands = structuredClone(requests) as Mutable<AnimaWorkerRequest>[]
        let enter!: () => void, release!: () => void
        const entered = new Promise<void>((resolve) => {
          enter = resolve
        })
        const waiting = new Promise<void>((resolve) => {
          release = resolve
        })
        const session = randomUUID()
        const operation = fixture.queue.enqueuePreparedAnimaGenerationBatch({
          preflight: async (entries) => {
            enter()
            await waiting
            await preflight(fixture, session)(entries)
          },
          preparedBatch: mutable,
          projectPath: fixture.projectPath,
          requests: commands,
          stagingSessionId: session,
        })
        await Promise.race([
          entered,
          operation.then(() => {
            throw new Error('Admission finished before the expected preflight barrier.')
          }),
        ])
        mutable.context.prompts.positive = 'later'
        mutable.context.sampling.seed = 123
        mutable.items.splice(0)
        mutable.targetPngBytes[0] = 0
        commands[0].job.prompts.positive.cleanedText = 'late command'
        commands.splice(1)
        release()
        const items = await operation
        assert.equal(items.length, 4)
        const first = await fixture.queue.loadVerifiedInput(items[0].id)
        assert.deepEqual(first.payload.context.prompts, batch.items[0].prompts)
        assert.equal(first.payload.context.sampling.seed, 0)
        assert.deepEqual(await readFile(first.targetPath), batch.targetPngBytes)
      }),
  )
})

test('Anima queue refuses incomplete/reordered/injected requests and altered frozen interpretations atomically', async () => {
  await withAnimaStagingFixture(
    async (fixture) =>
      await qualified(fixture, async (batch, requests) => {
        const invoke = async (
          preparedBatch: PreparedAnimaGenerationBatch,
          commands: readonly AnimaWorkerRequest[],
        ) => {
          const session = randomUUID()
          await assert.rejects(
            fixture.queue.enqueuePreparedAnimaGenerationBatch({
              preflight: preflight(fixture, session),
              preparedBatch,
              projectPath: fixture.projectPath,
              requests: commands,
              stagingSessionId: session,
            }),
            { code: 'QUEUE_INPUT_INVALID' },
          )
          await noPublication(fixture)
        }
        await invoke({ ...batch, items: batch.items.slice(0, 1) }, requests.slice(0, 1))
        await invoke(batch, [...requests].reverse())
        await invoke(batch, [...requests, requests[0]])
        await invoke({ ...batch, items: [...batch.items].reverse() }, requests)
        const changed = structuredClone(batch.items) as Mutable<typeof batch.items>
        changed[0].samplingPlan.sigmas[1] += 0.01
        await invoke({ ...batch, items: changed }, requests)
        const altered = structuredClone(requests) as Mutable<typeof requests>
        altered[0].job.prompts.positive.spans[0].weight += 1
        await invoke(batch, altered)
      }),
  )
})

test('Anima batch rollback, Project fences and lost commit acknowledgement use durable atomic queue boundaries', async () => {
  for (const kind of ['rollback', 'fence', 'lost-ack'] as const) {
    await withAnimaStagingFixture(async (fixture) => {
      const key = localProjectRecoveryKey(fixture.projectPath)
      const queue = new GenerationQueueRepository(fixture.database.db, fixture.root, {
        ...(kind === 'lost-ack'
          ? {
              afterBatchCommit: async () => {
                throw new Error('lost acknowledgement')
              },
            }
          : {
              beforeBatchCommit: async () => {
                if (kind === 'fence') {
                  queue.fenceProject(key)
                } else {
                  throw new Error('injected rollback')
                }
              },
            }),
      })
      await queue.recoverAfterRestart()
      await qualified(fixture, async (batch, requests) => {
        const session = randomUUID()
        const pending = queue.enqueuePreparedAnimaGenerationBatch({
          preflight: preflight(fixture, session),
          preparedBatch: batch,
          projectPath: fixture.projectPath,
          requests,
          stagingSessionId: session,
        })
        if (kind === 'lost-ack') {
          const items = await pending
          assert.equal(items.length, 4)
          assert.equal(
            (await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute())
              .length,
            4,
          )
          assert.equal((await readdir(path.join(fixture.root, 'generation-inputs'))).length, 4)
        } else {
          await assert.rejects(
            pending,
            kind === 'fence' ? { code: 'QUEUE_PROJECT_CLOSING' } : /injected rollback/,
          )
          await noPublication(fixture)
        }
      })
    })
  }
})

test('Anima queue never deletes published inputs after a mismatched lost-ack outcome and fences dispatch', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const queue = new GenerationQueueRepository(fixture.database.db, fixture.root, {
      afterBatchCommit: async () => {
        const row = await fixture.database.db
          .selectFrom('generation_queue_item')
          .select('id')
          .orderBy('id')
          .executeTakeFirstOrThrow()
        await fixture.database.db
          .updateTable('generation_queue_item')
          .set({ batch_id: randomUUID() })
          .where('id', '=', row.id)
          .execute()
        throw new Error('unreadable committed outcome')
      },
    })
    await queue.recoverAfterRestart()
    await qualified(fixture, async (batch, requests) => {
      const session = randomUUID()
      await assert.rejects(
        queue.enqueuePreparedAnimaGenerationBatch({
          preflight: preflight(fixture, session),
          preparedBatch: batch,
          projectPath: fixture.projectPath,
          requests,
          stagingSessionId: session,
        }),
        { code: 'QUEUE_PUBLICATION_UNCERTAIN' },
      )
      assert.equal(
        (await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute())
          .length,
        4,
      )
      assert.equal((await readdir(path.join(fixture.root, 'generation-inputs'))).length, 4)
      assert.throws(() => queue.assertReadyForDispatch(), { code: 'QUEUE_PUBLICATION_UNCERTAIN' })
      assert.equal(await queue.claimNextPending(), null)
      assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
    })
  })
})

test('Anima queue revalidates durable target bytes, manifests and parsed concrete plans on reload', async () => {
  for (const corruption of ['target', 'symlink', 'manifest', 'plan'] as const) {
    await withAnimaStagingFixture(async (fixture) => {
      const { items } = await enqueueAnimaStagingBatch(fixture)
      const original = await fixture.queue.loadVerifiedInput(items[0].id)
      if (corruption === 'target') {
        await writeFile(original.targetPath, fixture.outputBytes)
      }
      if (corruption === 'symlink') {
        const fs = await import('node:fs/promises')
        await fs.unlink(original.targetPath)
        await symlink(path.join(fixture.root, 'outside.png'), original.targetPath)
      }
      if (corruption === 'manifest') {
        const file = path.join(path.dirname(original.targetPath), 'manifest.json')
        const manifest = JSON.parse(await readFile(file, 'utf8'))
        manifest.payloadSha256 = 'a'.repeat(64)
        await writeFile(file, JSON.stringify(manifest))
      }
      if (corruption === 'plan') {
        const payload = structuredClone(original.payload) as Mutable<typeof original.payload>
        assert.ok(payload.kind === 'anima-img2img' || payload.kind === 'anima-txt2img')
        payload.workerJob.sampling.stepSeed += 1
        const json = JSON.stringify(payload)
        await fixture.database.db
          .updateTable('generation_queue_item')
          .set({ frozen_payload_json: json })
          .where('id', '=', items[0].id)
          .execute()
        const file = path.join(path.dirname(original.targetPath), 'manifest.json')
        const manifest = JSON.parse(await readFile(file, 'utf8'))
        manifest.payloadSha256 = createHash('sha256').update(json).digest('hex')
        await writeFile(file, JSON.stringify(manifest))
      }
      await assert.rejects(fixture.queue.loadVerifiedInput(items[0].id), {
        code: 'QUEUE_INPUT_INVALID',
      })
      assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
    })
  }
})

test('Anima cap32 admission checks actual escaped recovery manifest and refuses oversized authored disabled history before file writes', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const context = fixture.prepared.context
    const prompt = '\\'.repeat(16_384)
    context.prompts = { negative: prompt, positive: prompt }
    context.generationDraft.positivePrompt.text = prompt
    context.generationDraft.negativePrompt.text = prompt
    context.sampling.steps = 200
    context.generationDraft.sampling.steps = 200
    context.sampling.animaMethod = 'heun'
    context.generationDraft.sampling.animaMethod = 'heun'
    const { items } = await enqueueAnimaStagingBatch(fixture, { iterations: 32 })
    assert.equal(items.length, 32)
    for (const item of items) {
      const row = await fixture.database.db
        .selectFrom('generation_queue_item')
        .select('frozen_payload_json')
        .where('id', '=', item.id)
        .executeTakeFirstOrThrow()
      assert.ok(Buffer.byteLength(row.frozen_payload_json) < 131_072)
    }
    assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
  })
  await withAnimaStagingFixture(async (fixture) => {
    fixture.prepared.context.generationDraft.loras.push(
      ...Array.from({ length: 1000 }, (_, index) => ({
        enabled: false,
        resource: {
          ...fixture.prepared.context.loras[0].reference,
          localModelId: `unavailable-${index}`,
        },
        weight: 0,
      })),
    )
    await assert.rejects(enqueueAnimaStagingBatch(fixture), { code: 'QUEUE_INPUT_INVALID' })
    await noPublication(fixture)
  })
})

test('Anima durable reload checks actual required ICC presence and alpha mode even when all mutable digests agree', async () => {
  for (const changedMode of [false, true]) {
    await withAnimaStagingFixture(async (fixture) => {
      const { items } = await enqueueAnimaStagingBatch(fixture)
      const original = await fixture.queue.loadVerifiedInput(items[0].id)
      let bytes = fixture.outputBytes
      if (!changedMode) {
        const png = await readFile(original.targetPath)
        const chunks = [png.subarray(0, 8)]
        let offset = 8
        while (offset + 12 <= png.length) {
          const size = png.readUInt32BE(offset)
          if (png.toString('ascii', offset + 4, offset + 8) !== 'iCCP') {
            chunks.push(png.subarray(offset, offset + size + 12))
          }
          offset += size + 12
        }
        bytes = Buffer.concat(chunks)
      }
      const payload = structuredClone(original.payload)
      assert.ok(payload.kind === 'anima-txt2img' || payload.kind === 'anima-img2img')
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      payload.context.target.byteSize = bytes.length
      payload.context.target.sha256 = sha256
      const workerTarget = { ...payload.workerJob.target, byteSize: bytes.length, sha256 }
      Object.assign(payload.workerJob, { target: workerTarget })
      const json = JSON.stringify(payload)
      await fixture.database.db
        .updateTable('generation_queue_item')
        .set({ frozen_payload_json: json })
        .where('id', '=', items[0].id)
        .execute()
      const file = path.join(path.dirname(original.targetPath), 'manifest.json')
      const manifest = JSON.parse(await readFile(file, 'utf8'))
      Object.assign(manifest, {
        payloadSha256: createHash('sha256').update(json).digest('hex'),
        targetByteSize: bytes.length,
        targetSha256: sha256,
      })
      await writeFile(file, JSON.stringify(manifest))
      await writeFile(original.targetPath, bytes)
      await assert.rejects(fixture.queue.loadVerifiedInput(items[0].id), {
        code: 'QUEUE_INPUT_INVALID',
      })
    })
  }
})
