import { isGenerationQueuePage } from '../../shared/projects/generation-queue-manager.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { FrozenQueuedOutpaintV1, PreparedOutpaintGeneration } from './generation-queue.js'
import type { OutpaintConsumerFixture } from './test-fixtures/outpaint-consumers.js'

import { openAppDatabase } from '../db/database.js'
import {
  prepareAnimaGeneration,
  prepareAnimaOutpaintGeneration,
} from './anima-generation-preparation.js'
import {
  buildFrozenQueuedOutpaintV1,
  GenerationQueueRepository,
  isQueuedOutpaint,
  parseFrozenGenerationPayloadV1,
} from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import {
  prepareNormalGeneration,
  prepareNormalOutpaintGeneration,
} from './project-generation-preparation.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { animaFixturePng } from './test-fixtures/anima-batch.js'
import { capturedEmbeddingFieldsFixture } from './test-fixtures/generation-embeddings.js'
import {
  enqueueOutpaintConsumerBatch,
  withOutpaintConsumerFixture,
} from './test-fixtures/outpaint-consumers.js'

function sha256(bytes: string | Buffer) {
  return createHash('sha256').update(bytes).digest('hex')
}
function barrier() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('outpaint batch retains branch-specific embedding subsets but refuses one captured literal changing files before resource awaits', async () => {
  await withOutpaintConsumerFixture('illustrious', async (fixture) => {
    assert.equal(fixture.outpaintPrepared.context.kind, 'normal-outpaint-preparation')
    if (fixture.outpaintPrepared.context.kind !== 'normal-outpaint-preparation') {
      assert.fail('Expected Illustrious')
    }
    const fields = capturedEmbeddingFieldsFixture(fixture.root)
    for (const polarity of ['positive', 'negative'] as const) {
      const entry = fields.embeddings[polarity][0]
      const bytes = Buffer.alloc(entry.byteSize, polarity === 'positive' ? 23 : 47)
      await writeFile(entry.managedPath, bytes)
      entry.reference.fileSha256 = sha256(bytes)
      fields.embeddingRefs[polarity][0].resource.fileSha256 = entry.reference.fileSha256
    }
    const prepared = {
      context: { ...fixture.outpaintPrepared.context, ...fields },
      targetPngBytes: fixture.outpaintPrepared.targetPngBytes,
    }
    let resolved = 0
    const models = {
      ...fixture.outpaintModels,
      resolveVerifiedGenerationEmbeddingForPlan: async (
        reference: Parameters<
          typeof fixture.outpaintModels.resolveVerifiedGenerationEmbeddingForPlan
        >[0],
      ) => {
        resolved++
        const entry = [...fields.embeddings.positive, ...fields.embeddings.negative].find(
          (item) => item.reference.localVersionId === reference.localVersionId,
        )!
        assert.deepEqual(entry.reference, reference)
        assert.equal(sha256(await readFile(entry.managedPath)), reference.fileSha256)
        return {
          byteSize: entry.byteSize,
          managedPath: entry.managedPath,
          reference: entry.reference,
        }
      },
    }
    const changed = {
      context: structuredClone(prepared.context),
      targetPngBytes: prepared.targetPngBytes,
    }
    changed.context.embeddings.positive[0].managedPath = path.join(
      fixture.root,
      'alternate-embedding.safetensors',
    )
    await writeFile(
      changed.context.embeddings.positive[0].managedPath,
      await readFile(fields.embeddings.positive[0].managedPath),
    )
    await assert.rejects(
      fixture.queue.enqueuePreparedOutpaintBatch({
        ...admission(fixture, [prepared, changed]),
        modelService: models,
      }),
      { code: 'QUEUE_INPUT_INVALID' },
    )
    assert.equal(resolved, 0)
    await noPublication(fixture)
    const inactive = {
      context: structuredClone(prepared.context),
      targetPngBytes: prepared.targetPngBytes,
    }
    inactive.context.prompts.positive = 'branch without the captured literal'
    inactive.context.embeddings.positive = []
    const group = await fixture.queue.enqueuePreparedOutpaintBatch({
      ...admission(fixture, [prepared, inactive]),
      modelService: models,
    })
    assert.equal(group.length, 2)
    assert.equal(resolved, 4)
    const first = await fixture.queue.loadVerifiedInput(group[0].id)
    const second = await fixture.queue.loadVerifiedInput(group[1].id)
    assert.equal(first.payload.kind, 'illustrious-outpaint')
    assert.equal(second.payload.kind, 'illustrious-outpaint')
    if (
      first.payload.kind !== 'illustrious-outpaint' ||
      second.payload.kind !== 'illustrious-outpaint'
    ) {
      assert.fail('Expected frozen outpaint')
    }
    assert.equal(first.payload.context.embeddings?.positive.length, 1)
    assert.equal(second.payload.context.embeddings?.positive.length, 0)
    assert.deepEqual(first.payload.context.embeddingRefs, second.payload.context.embeddingRefs)
  })
})
function copyPrepared(prepared: PreparedOutpaintGeneration): PreparedOutpaintGeneration {
  const context = structuredClone(prepared.context)
  return context.kind === 'normal-outpaint-preparation'
    ? { context, targetPngBytes: prepared.targetPngBytes }
    : { context, targetPngBytes: prepared.targetPngBytes }
}
function capacity(fixture: OutpaintConsumerFixture, stagingSessionId: string) {
  return async (entries: readonly { frozenPayloadJson: string; queueItemId: string }[]) =>
    await fixture.staging.preflightInternalOutpaintBatchCapacity({
      entries,
      localProjectKey: localProjectRecoveryKey(fixture.projectPath),
      projectPath: fixture.projectPath,
      stagingSessionId,
    })
}
function admission(
  fixture: OutpaintConsumerFixture,
  items: readonly PreparedOutpaintGeneration[] = [fixture.outpaintPrepared],
) {
  const stagingSessionId = randomUUID()
  return {
    infillResolver: fixture.infillResolver,
    items,
    modelService: fixture.outpaintModels,
    preflight: capacity(fixture, stagingSessionId),
    projectPath: fixture.projectPath,
    stagingSessionId,
  }
}
async function noPublication(fixture: OutpaintConsumerFixture) {
  for (const table of [
    'generation_queue_item',
    'generation_candidate_receipt',
    'generation_seed_cursor',
  ] as const) {
    assert.deepEqual(await fixture.database.db.selectFrom(table).selectAll().execute(), [])
  }
  assert.deepEqual(await readdir(path.join(fixture.root, 'generation-inputs')), [])
  assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
}
async function retry(
  fixture: OutpaintConsumerFixture,
  id: string,
  sequence: number,
  queue = fixture.queue,
) {
  return await queue.retryPreparedOutpaintTerminal(id, sequence, {
    infillResolver: fixture.infillResolver,
    modelService: fixture.outpaintModels,
    preflight: async (input) =>
      await fixture.staging.preflightInternalOutpaintBatchCapacity({
        entries: [{ frozenPayloadJson: input.frozenPayloadJson, queueItemId: input.queueItemId }],
        localProjectKey: input.source.localProjectKey,
        projectPath: input.source.projectPath,
        stagingSessionId: input.stagingSessionId,
      }),
  })
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} actual 128 KiB frozen payload and 8 MiB escaped session limits refuse before a batch prefix`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const selected =
        fixture.outpaintPrepared.context.kind === 'normal-outpaint-preparation'
          ? fixture.outpaintPrepared.context.model.reference
          : fixture.outpaintPrepared.context.model.checkpoint.reference
      function configured(count: number) {
        const prepared = copyPrepared(fixture.outpaintPrepared)
        const rows = Array.from({ length: count }, (_, index) => ({
          enabled: false,
          resource: {
            ...selected,
            displayName: '"'.repeat(900),
            kind: 'lora' as const,
            localModelId: `disabled-model-${index}`,
            localVersionId: `disabled-version-${index}`,
            versionName: '"'.repeat(900),
          },
          weight: 1,
        }))
        if (prepared.context.kind === 'normal-outpaint-preparation') {
          prepared.context.loraStack = rows
        } else {
          prepared.context.generationDraft.loras = rows
        }
        return prepared
      }
      let largest = configured(0)
      let largestBytes = 0
      let firstOversized = configured(0)
      for (let count = 1; count <= 150; count++) {
        const prepared = configured(count)
        try {
          const json = JSON.stringify(buildFrozenQueuedOutpaintV1(prepared, randomUUID()))
          largest = prepared
          largestBytes = Buffer.byteLength(json)
        } catch {
          firstOversized = prepared
          break
        }
      }
      assert.ok(largestBytes > 120 * 1024 && largestBytes <= 128 * 1024)
      await assert.rejects(
        fixture.queue.enqueuePreparedOutpaintBatch(
          admission(fixture, [fixture.outpaintPrepared, firstOversized]),
        ),
        { code: 'QUEUE_INPUT_INVALID' },
      )
      await noPublication(fixture)
      const input = admission(
        fixture,
        Array.from({ length: 32 }, () => largest),
      )
      const group = await fixture.queue.enqueuePreparedOutpaintBatch(input)
      assert.equal(group.length, 32)
      const beforeRows = await fixture.database.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .orderBy('id')
        .execute()
      const beforeDirectories = await readdir(path.join(fixture.root, 'generation-inputs'))
      await assert.rejects(
        fixture.staging.preflightInternalOutpaintBatchCapacity({
          entries: Array.from({ length: 64 }, () => ({
            frozenPayloadJson: JSON.stringify(buildFrozenQueuedOutpaintV1(largest, randomUUID())),
            queueItemId: randomUUID(),
          })),
          localProjectKey: localProjectRecoveryKey(fixture.projectPath),
          projectPath: fixture.projectPath,
          stagingSessionId: randomUUID(),
        }),
        { code: 'STAGING_INPUT_INVALID', message: 'The batch staging manifest is too large.' },
      )
      assert.deepEqual(
        await fixture.database.db
          .selectFrom('generation_queue_item')
          .selectAll()
          .orderBy('id')
          .execute(),
        beforeRows,
      )
      assert.deepEqual(
        await readdir(path.join(fixture.root, 'generation-inputs')),
        beforeDirectories,
      )
      assert.deepEqual(
        await fixture.database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
        [],
      )
    })
  })
  for (const initialSeed of [0, 1]) {
    test(`${family} retained caller edits during preparation cannot alter captured Reuse seed ${initialSeed}/mode/pixels`, async () => {
      await withOutpaintConsumerFixture(family, async (fixture) => {
        const entered = barrier()
        const held = barrier()
        const models = {
          ...fixture.outpaintModels,
          assertNoUnboundGenerationEmbeddings: async () => {
            if (family === 'illustrious') {
              entered.resolve()
              await held.promise
            }
          },
          resolveVerifiedGenerationAnimaBundleForPlan: async (
            ...args: Parameters<
              typeof fixture.outpaintModels.resolveVerifiedGenerationAnimaBundleForPlan
            >
          ) => {
            if (family === 'anima') {
              entered.resolve()
              await held.promise
            }
            return await fixture.outpaintModels.resolveVerifiedGenerationAnimaBundleForPlan(...args)
          },
        }
        fixture.target.generationDraft.seed = { policy: 'reuse', value: null }
        const input = { lastActualSeed: initialSeed, modelService: models, target: fixture.target }
        const expectedBytes = Buffer.from(input.target.composite.bytes)
        const pending =
          family === 'anima'
            ? prepareAnimaOutpaintGeneration(input)
            : prepareNormalOutpaintGeneration(input)
        await entered.promise
        input.lastActualSeed = 99
        input.target.mode = 'txt2img'
        input.target.composite.bytes.fill(0)
        input.target.generationDraft.positivePrompt.text = 'late authoring'
        held.resolve()
        const prepared = await pending
        assert.equal(prepared.context.sampling.seed, initialSeed)
        assert.equal(prepared.context.prompts.positive, 'frozen outpaint (cat:1.5)')
        assert.deepEqual(prepared.targetPngBytes, expectedBytes)
        assert.equal(prepared.context.conditioning.sourceTarget.sha256, sha256(expectedBytes))
        await noPublication(fixture)
      })
    })
  }
  test(`${family} internal preparation keeps actual mixed alpha while ordinary public preparation refuses`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const input = { modelService: fixture.outpaintModels, target: fixture.target }
      await assert.rejects(
        family === 'anima' ? prepareAnimaGeneration(input) : prepareNormalGeneration(input),
        { code: 'GENERATION_MODE_UNSUPPORTED' },
      )
      const original = Buffer.from(fixture.target.composite.bytes)
      assert.deepEqual(fixture.outpaintPrepared.targetPngBytes, original)
      assert.equal(fixture.outpaintPrepared.context.conditioning.keepMask.polarity, 'keep')
      assert.equal(
        fixture.outpaintPrepared.context.conditioning.keepMask.sha256,
        sha256(Buffer.alloc(64 * 64, 128)),
      )
      fixture.target.composite.bytes.fill(0)
      fixture.target.generationDraft.positivePrompt.text = 'changed authoring'
      assert.deepEqual(fixture.outpaintPrepared.targetPngBytes, original)
      assert.equal(fixture.outpaintPrepared.context.prompts.positive, 'frozen outpaint (cat:1.5)')
      for (const alpha of [0, 255]) {
        const target = structuredClone(fixture.target)
        const bytes = await animaFixturePng(alpha)
        target.composite.bytes = bytes
        target.composite.byteSize = bytes.length
        target.composite.sha256 = sha256(bytes)
        target.mode = alpha === 0 ? 'txt2img' : 'img2img'
        await assert.rejects(
          family === 'anima'
            ? prepareAnimaOutpaintGeneration({ ...input, target })
            : prepareNormalOutpaintGeneration({ ...input, target }),
          { code: 'GENERATION_MODE_UNSUPPORTED' },
        )
      }
      await noPublication(fixture)
    })
  })

  test(`${family} real outpaint queue preserves concrete order/source/mask and exposes truthful metadata`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const next = copyPrepared(fixture.outpaintPrepared)
      next.context.prompts.positive = 'second concrete prompt'
      next.context.sampling.seed = 1
      if (next.context.kind === 'anima-outpaint-preparation') {
        next.context.generationDraft.positivePrompt.text = next.context.prompts.positive
        next.context.generationDraft.seed = { policy: 'fixed', value: 1 }
      }
      const { items } = await enqueueOutpaintConsumerBatch(fixture, {
        items: [fixture.outpaintPrepared, next],
      })
      const page = await fixture.queue.listManagerPage()
      assert.equal(isGenerationQueuePage(page), true)
      assert.deepEqual(
        page.items.map((item) => item.operation),
        [`${family}-outpaint`, `${family}-outpaint`],
      )
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
        const restored = await fixture.queue.loadVerifiedRetryInput(item.id)
        assert.ok(isQueuedOutpaint(restored.payload))
        assert.deepEqual(restored.targetPngBytes, fixture.outpaintPrepared.targetPngBytes)
        assert.equal(restored.payload.context.sampling.seed, index)
        assert.deepEqual(
          restored.payload.context.conditioning,
          fixture.outpaintPrepared.context.conditioning,
        )
        assert.deepEqual(await readdir(path.dirname(restored.targetPath)), [
          'manifest.json',
          'target.png',
        ])
        assert.equal('output' in restored.payload.workerJob, false)
        assert.equal('path' in restored.payload.workerJob.target, false)
        if (restored.payload.kind === 'anima-outpaint') {
          assert.equal(restored.payload.workerJob.sampling.mode, 'img2img')
          assert.deepEqual(
            restored.payload.workerJob.prompts.positive.spans,
            index === 0
              ? [
                  { end: 16, start: 0, weight: 1 },
                  { end: 19, start: 16, weight: 1.5 },
                ]
              : [{ end: 22, start: 0, weight: 1 }],
          )
        }
      }
      assert.deepEqual(
        await fixture.database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
        [],
      )
      assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
    })
  })

  test(`${family} actual SQLite reopen cancels old jobs and internal Retry retains byte-exact source and no current draft`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const { items } = await enqueueOutpaintConsumerBatch(fixture)
      const before = await fixture.queue.loadVerifiedRetryInput(items[0].id)
      await fixture.database.close()
      const reopened = openAppDatabase(fixture.root, path.resolve('src/main/db/migrations'))
      try {
        const queue = new GenerationQueueRepository(reopened.db, fixture.root)
        assert.equal((await queue.recoverAfterRestart()).canceledCount, 1)
        const staging = new GenerationStagingRepository(reopened.db, fixture.root)
        await staging.recoverAfterRestart()
        const canceled = await queue.getManagerEntry(items[0].id)
        fixture.outpaintPrepared.context.prompts.positive = 'today draft'
        fixture.outpaintPrepared.context.sampling.seed = 19
        fixture.outpaintPrepared.targetPngBytes.fill(0)
        const retried = await queue.retryPreparedOutpaintTerminal(
          canceled.id,
          canceled.statusSequence,
          {
            infillResolver: fixture.infillResolver,
            modelService: fixture.outpaintModels,
            preflight: async (input) => {
              assert.equal(input.frozenPayloadJson, JSON.stringify(before.payload))
              await staging.preflightInternalOutpaintBatchCapacity({
                entries: [
                  { frozenPayloadJson: input.frozenPayloadJson, queueItemId: input.queueItemId },
                ],
                localProjectKey: input.source.localProjectKey,
                projectPath: input.source.projectPath,
                stagingSessionId: input.stagingSessionId,
              })
            },
          },
        )
        const after = await queue.loadVerifiedRetryInput(retried.id)
        assert.deepEqual(after.payload, before.payload)
        assert.deepEqual(after.targetPngBytes, before.targetPngBytes)
        assert.notEqual(retried.id, items[0].id)
        assert.notEqual(retried.stagingSessionId, items[0].stagingSessionId)
        assert.equal(after.payload.context.sampling.seed, 0)
        assert.deepEqual(
          await reopened.db.selectFrom('generation_seed_cursor').selectAll().execute(),
          [],
        )
        await assert.rejects(
          queue.retryPreparedOutpaintTerminal(canceled.id, canceled.statusSequence, {
            infillResolver: fixture.infillResolver,
            modelService: fixture.outpaintModels,
            preflight: async () => {},
          }),
          { code: 'QUEUE_STATUS_CONFLICT' },
        )
      } finally {
        await reopened.close()
      }
      assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
    })
  })

  test(`${family} ordinary Retry cannot bypass outpaint exact-resource ownership`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const { items } = await enqueueOutpaintConsumerBatch(fixture)
      const canceled = await fixture.queue.cancel(items[0].id, 0)
      const rows = await fixture.database.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .execute()
      const files = await readdir(path.join(fixture.root, 'generation-inputs'))
      await assert.rejects(fixture.queue.retryTerminal(canceled.id, canceled.statusSequence), {
        code: 'QUEUE_INPUT_INVALID',
      })
      await assert.rejects(
        fixture.queue.retryTerminal(canceled.id, canceled.statusSequence, async () => {}),
        { code: 'QUEUE_INPUT_INVALID' },
      )
      assert.deepEqual(
        await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute(),
        rows,
      )
      assert.deepEqual(await readdir(path.join(fixture.root, 'generation-inputs')), files)
      const copied = await retry(fixture, canceled.id, canceled.statusSequence)
      assert.equal(copied.status, 'pending')
      assert.equal(
        (await fixture.queue.loadVerifiedInput(copied.id)).payload.context.sampling.seed,
        0,
      )
    })
  })

  test(`${family} missing/changed LaMa refuses enqueue and Retry without consuming source or publishing partial directories`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const unavailable = {
        resolveVerifiedOutpaintInfill: async (): Promise<never> => {
          throw new Error('Missing frozen LaMa')
        },
      }
      await assert.rejects(
        fixture.queue.enqueuePreparedOutpaintBatch({
          ...admission(fixture),
          infillResolver: unavailable,
        }),
        /Missing frozen LaMa/,
      )
      await noPublication(fixture)
      const { items } = await enqueueOutpaintConsumerBatch(fixture)
      const canceled = await fixture.queue.cancel(items[0].id, 0)
      const rows = await fixture.database.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .execute()
      const directories = await readdir(path.join(fixture.root, 'generation-inputs'))
      await assert.rejects(
        fixture.queue.retryPreparedOutpaintTerminal(canceled.id, canceled.statusSequence, {
          infillResolver: unavailable,
          modelService: fixture.outpaintModels,
          preflight: async () => {},
        }),
        /Missing frozen LaMa/,
      )
      assert.deepEqual(
        await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute(),
        rows,
      )
      assert.deepEqual(await readdir(path.join(fixture.root, 'generation-inputs')), directories)
      const wrong = {
        resolveVerifiedOutpaintInfill: async () => ({
          ...(await fixture.infillResolver.resolveVerifiedOutpaintInfill()),
          sha256: 'a'.repeat(64),
        }),
      }
      await assert.rejects(
        fixture.queue.retryPreparedOutpaintTerminal(canceled.id, canceled.statusSequence, {
          infillResolver: wrong,
          modelService: fixture.outpaintModels,
          preflight: async () => {},
        }),
        { code: 'QUEUE_INPUT_INVALID' },
      )
      assert.equal((await retry(fixture, canceled.id, canceled.statusSequence)).status, 'pending')
    })
  })

  test(`${family} frozen alpha/policy/source metadata corruption is rejected at actual durable reload`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const { items } = await enqueueOutpaintConsumerBatch(fixture)
      const input = await fixture.queue.loadVerifiedInput(items[0].id)
      assert.ok(isQueuedOutpaint(input.payload))
      const originalJson = JSON.stringify(input.payload)
      for (const mutate of [
        (value: FrozenQueuedOutpaintV1) =>
          Reflect.set(value.context.conditioning.keepMask, 'sha256', 'a'.repeat(64)),
        (value: FrozenQueuedOutpaintV1) =>
          Reflect.set(value.context.conditioning.policy, 'fadeDistance', 15),
        (value: FrozenQueuedOutpaintV1) =>
          Reflect.set(value.context.conditioning.infillResource, 'byteSize', 1),
        (value: FrozenQueuedOutpaintV1) => Reflect.set(value.context.conditioning.bbox, 'x', 0),
      ]) {
        const value = structuredClone(input.payload)
        mutate(value)
        const changedJson = JSON.stringify(value)
        await fixture.database.db
          .updateTable('generation_queue_item')
          .set({ frozen_payload_json: changedJson })
          .where('id', '=', input.item.id)
          .execute()
        const manifestPath = path.join(path.dirname(input.targetPath), 'manifest.json')
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
          payloadSha256: string
        }
        manifest.payloadSha256 = sha256(changedJson)
        await writeFile(manifestPath, JSON.stringify(manifest))
        await assert.rejects(fixture.queue.loadVerifiedInput(input.item.id), {
          code: 'QUEUE_INPUT_INVALID',
        })
        await fixture.database.db
          .updateTable('generation_queue_item')
          .set({ frozen_payload_json: originalJson })
          .where('id', '=', input.item.id)
          .execute()
        manifest.payloadSha256 = sha256(originalJson)
        await writeFile(manifestPath, JSON.stringify(manifest))
        assert.deepEqual(
          (await fixture.queue.loadVerifiedInput(input.item.id)).payload,
          input.payload,
        )
      }
      const bytes = await readFile(input.targetPath)
      await writeFile(input.targetPath, await animaFixturePng(129))
      await assert.rejects(fixture.queue.loadVerifiedInput(input.item.id), {
        code: 'QUEUE_INPUT_INVALID',
      })
      await writeFile(input.targetPath, bytes)
      assert.deepEqual(
        (await fixture.queue.loadVerifiedInput(input.item.id)).payload,
        input.payload,
      )
    })
  })

  test(`${family} whole-batch late failure rolls back inputs while lost committed acknowledgement returns complete group`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const queue = new GenerationQueueRepository(fixture.database.db, fixture.root, {
        beforeBatchCommit: async () => {
          throw new Error('Controlled commit interruption')
        },
      })
      await queue.recoverAfterRestart()
      await assert.rejects(
        queue.enqueuePreparedOutpaintBatch(
          admission(fixture, [fixture.outpaintPrepared, fixture.outpaintPrepared]),
        ),
        /Controlled commit interruption/,
      )
      await noPublication(fixture)
      const committed = new GenerationQueueRepository(fixture.database.db, fixture.root, {
        afterBatchCommit: async () => {
          throw new Error('Lost successful acknowledgement')
        },
      })
      await committed.recoverAfterRestart()
      const group = await committed.enqueuePreparedOutpaintBatch(
        admission(fixture, [fixture.outpaintPrepared, fixture.outpaintPrepared]),
      )
      assert.equal(group.length, 2)
      for (const item of group) {
        assert.equal(
          (await committed.loadVerifiedInput(item.id)).payload.kind,
          `${family}-outpaint`,
        )
      }
    })
  })

  test(`${family} late exact checkpoint change before commit leaves no partial durable batch`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const checkpointPath =
        family === 'anima'
          ? fixture.prepared.context.model.checkpoint.managedPath
          : fixture.outpaintPrepared.context.kind === 'normal-outpaint-preparation'
            ? fixture.outpaintPrepared.context.model.managedPath
            : ''
      const original = await readFile(checkpointPath)
      const queue = new GenerationQueueRepository(fixture.database.db, fixture.root)
      await queue.recoverAfterRestart()
      await assert.rejects(
        queue.enqueuePreparedOutpaintBatch({
          ...admission(fixture),
          beforeCommit: async () => {
            await writeFile(checkpointPath, 'changed resource')
          },
        }),
      )
      await noPublication(fixture)
      await writeFile(checkpointPath, original)
      assert.equal((await enqueueOutpaintConsumerBatch(fixture)).items.length, 1)
    })
  })

  test(`${family} invalid later job and inherited payload/batch ceilings publish no prefix`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const invalid = copyPrepared(fixture.outpaintPrepared)
      invalid.context.prompts.positive = 'x'.repeat(16 * 1024 + 1)
      if (invalid.context.kind === 'anima-outpaint-preparation') {
        invalid.context.generationDraft.positivePrompt.text = invalid.context.prompts.positive
      }
      await assert.rejects(
        fixture.queue.enqueuePreparedOutpaintBatch(
          admission(fixture, [fixture.outpaintPrepared, invalid]),
        ),
      )
      await noPublication(fixture)
      await assert.rejects(
        fixture.queue.enqueuePreparedOutpaintBatch(
          admission(
            fixture,
            Array.from({ length: 33 }, () => fixture.outpaintPrepared),
          ),
        ),
        { code: 'QUEUE_INPUT_INVALID' },
      )
      await noPublication(fixture)
      const group = await fixture.queue.enqueuePreparedOutpaintBatch(
        admission(
          fixture,
          Array.from({ length: 32 }, () => fixture.outpaintPrepared),
        ),
      )
      assert.equal(group.length, 32)
      const original = await fixture.queue.loadVerifiedInput(group[0].id)
      assert.deepEqual(
        parseFrozenGenerationPayloadV1(JSON.stringify(original.payload)),
        original.payload,
      )
    })
  })
}
