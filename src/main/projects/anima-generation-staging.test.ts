import type { AnimaFlowScheduler } from '../../shared/projects/anima-flow-sampling-plan.js'

import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { link, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { VerifiedGenerationCandidate } from './generation-staging.js'

import { openAppDatabase } from '../db/database.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { GENERATION_STAGING_LIMITS } from './generation-staging-limits.js'
import {
  GenerationStagingRepository,
  parseFrozenGenerationCandidatePayloadV1,
} from './generation-staging.js'
import { validateSrgbPngStream } from './igs-package.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { animaFixturePng } from './test-fixtures/anima-batch.js'
import {
  animaProvisionalOutput,
  type AnimaStagingFixture,
  enqueueAnimaStagingBatch,
  withAnimaStagingFixture,
} from './test-fixtures/anima-staging.js'

const methods: readonly AnimaFlowScheduler[] = [
  'euler',
  'heun',
  'dpmpp_2m',
  'dpmpp_2m_sde',
  'er_sde',
  'lcm',
]

async function claimOne(fixture: AnimaStagingFixture) {
  const claimed = await fixture.queue.claimNextPending()
  assert.ok(claimed, 'a real durable Anima job must be claimable')
  assert.equal(claimed.item.status, 'running')
  assert.ok(claimed.payload.kind === 'anima-txt2img' || claimed.payload.kind === 'anima-img2img')
  return claimed
}

async function assertProjectUnchanged(fixture: AnimaStagingFixture): Promise<void> {
  assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
}

for (const opaque of [false, true]) {
  for (const method of methods) {
    test(`Anima ${opaque ? 'img2img' : 'txt2img'} ${method} publishes complete concrete weighted candidates and recovers after queue pruning`, async () => {
      await withAnimaStagingFixture(
        async (fixture) => {
          fixture.prepared.context.sampling.animaMethod = method
          fixture.prepared.context.generationDraft.sampling.animaMethod = method
          const batch = await enqueueAnimaStagingBatch(fixture)
          assert.equal(batch.items.length, 4)
          const observed: VerifiedGenerationCandidate[] = []
          for (const item of batch.items) {
            const claim = await claimOne(fixture)
            assert.equal(claim.item.id, item.id)
            const output = await animaProvisionalOutput(fixture)
            const actualSeed = observed.length === 0 ? 0 : 9000 + observed.length
            const candidate = await fixture.staging.publishGenerationCandidate({
              ...output,
              actualSeed,
              expectedStatusSequence: claim.item.statusSequence,
              queueItemId: claim.item.id,
            })
            const payload = parseFrozenGenerationCandidatePayloadV1(candidate.frozenPayloadJson)
            assert.ok(payload.kind === 'anima-txt2img' || payload.kind === 'anima-img2img')
            const planned = batch.preparedBatch.items[observed.length]
            assert.equal(payload.kind, opaque ? 'anima-img2img' : 'anima-txt2img')
            assert.deepEqual(payload.context.prompts, planned.prompts)
            assert.deepEqual(payload.workerJob.prompts, planned.compiledPrompts)
            assert.deepEqual(payload.workerJob.sampling, planned.samplingPlan)
            assert.equal(payload.context.sampling.animaMethod, method)
            assert.deepEqual(payload.context.model, fixture.prepared.context.model)
            assert.deepEqual(payload.context.loras, fixture.prepared.context.loras)
            assert.equal(candidate.actualSeed, actualSeed)
            assert.deepEqual(await readFile(candidate.assetPath), fixture.outputBytes)
            assert.equal((await stat(candidate.assetPath)).mode & 0o777, 0o600)
            await fixture.queue.deleteTerminal(item.id, claim.item.statusSequence + 1)
            observed.push(candidate)
            await rm(output.expectedProvisionalRoot, { recursive: true })
          }
          const restarted = new GenerationStagingRepository(fixture.database.db, fixture.root)
          assert.deepEqual(await restarted.recoverAfterRestart(), {
            invalidCount: 0,
            reconciledCount: 0,
          })
          assert.deepEqual(
            await restarted.listVerifiedCandidates(localProjectRecoveryKey(fixture.projectPath)),
            observed,
          )
          assert.equal(
            await restarted.readLastActualSeed(
              localProjectRecoveryKey(fixture.projectPath),
              fixture.prepared.context.documentId,
            ),
            observed.at(-1)!.actualSeed,
          )
          await assertProjectUnchanged(fixture)
        },
        { opaque },
      )
    })
  }
}

test('generic publication refuses crossed scratch family, arbitrary names and linked outputs before reserving Anima completion', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    await enqueueAnimaStagingBatch(fixture)
    const claim = await claimOne(fixture)
    const outsidePath = path.join(fixture.root, 'outside.png')
    await writeFile(outsidePath, fixture.outputBytes)
    for (const scenario of [
      'illustrious-family',
      'unowned-name',
      'wrong-file',
      'symlink',
      'hardlink',
    ]) {
      const output = await animaProvisionalOutput(fixture, {
        prefix:
          scenario === 'illustrious-family'
            ? 'illustrious-request-'
            : scenario === 'unowned-name'
              ? 'arbitrary-'
              : 'anima-request-',
      })
      if (scenario === 'wrong-file') {
        output.provisionalOutputPath = path.join(output.expectedProvisionalRoot, 'result-0.png')
        await writeFile(output.provisionalOutputPath, fixture.outputBytes)
      } else if (scenario === 'symlink' || scenario === 'hardlink') {
        await rm(output.provisionalOutputPath)
        await (scenario === 'symlink'
          ? symlink(outsidePath, output.provisionalOutputPath)
          : link(outsidePath, output.provisionalOutputPath))
      }
      await assert.rejects(
        fixture.staging.publishGenerationCandidate({
          ...output,
          actualSeed: 123,
          expectedStatusSequence: claim.item.statusSequence,
          queueItemId: claim.item.id,
        }),
        { code: 'STAGING_OUTPUT_INVALID' },
        scenario,
      )
      await rm(output.expectedProvisionalRoot, { recursive: true })
    }
    assert.deepEqual(await readFile(outsidePath), fixture.outputBytes)
    assert.deepEqual(
      await fixture.database.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
      [],
    )
    const output = await animaProvisionalOutput(fixture)
    await assert.rejects(
      fixture.staging.publishIllustriousTxt2Img({
        ...output,
        actualSeed: 123,
        expectedStatusSequence: claim.item.statusSequence,
        queueItemId: claim.item.id,
      }),
      { code: 'STAGING_INPUT_INVALID' },
      'the legacy family entry cannot silently consume Anima',
    )
    assert.equal(
      (await fixture.database.db.selectFrom('generation_candidate_receipt').selectAll().execute())
        .length,
      0,
    )
    const candidate = await fixture.staging.publishGenerationCandidate({
      ...output,
      actualSeed: 123,
      expectedStatusSequence: claim.item.statusSequence,
      queueItemId: claim.item.id,
    })
    assert.equal(candidate.actualSeed, 123, 'the private correct-family neighbor is admitted')
    await assertProjectUnchanged(fixture)
  })
})

for (const failure of ['manifest-crash', 'sqlite-abort'] as const) {
  test(`Anima ${failure} retains an exact reserved completion and advances document seed only during restart commit`, async () => {
    await withAnimaStagingFixture(
      async (fixture) => {
        await enqueueAnimaStagingBatch(fixture)
        const claim = await claimOne(fixture)
        const output = await animaProvisionalOutput(fixture)
        if (failure === 'sqlite-abort') {
          await sql`
          CREATE TRIGGER fail_anima_completion
          BEFORE UPDATE OF status ON generation_queue_item
          WHEN NEW.status = 'completed'
          BEGIN SELECT RAISE(ABORT, 'injected Anima completion abort'); END
        `.execute(fixture.database.db)
        }
        await assert.rejects(
          fixture.staging.publishGenerationCandidate({
            ...output,
            actualSeed: 0,
            expectedStatusSequence: claim.item.statusSequence,
            queueItemId: claim.item.id,
          }),
          /injected Anima/,
        )
        const key = claim.item.localProjectKey
        assert.deepEqual(await fixture.staging.listVerifiedCandidates(key), [])
        assert.equal(
          await fixture.staging.readLastActualSeed(key, fixture.prepared.context.documentId),
          null,
        )
        const receipt = await fixture.database.db
          .selectFrom('generation_candidate_receipt')
          .selectAll()
          .where('candidate_id', '=', claim.item.id)
          .executeTakeFirstOrThrow()
        assert.equal(receipt.status, 'reserved')
        assert.equal(receipt.actual_seed, 0)
        assert.equal((await fixture.queue.loadVerifiedInput(claim.item.id)).item.status, 'running')
        assert.equal((await fixture.queue.getManagerEntry(claim.item.id)).publicationPending, true)
        assert.equal(await fixture.queue.claimNextPending(), null)
        if (failure === 'sqlite-abort') {
          await sql`DROP TRIGGER fail_anima_completion`.execute(fixture.database.db)
        }
        await fixture.database.close()
        const reopened = openAppDatabase(fixture.root, path.resolve('src/main/db/migrations'))
        try {
          const queue = new GenerationQueueRepository(reopened.db, fixture.root)
          await queue.recoverAfterRestart()
          const recovered = new GenerationStagingRepository(reopened.db, fixture.root)
          assert.deepEqual(await recovered.recoverAfterRestart(), {
            invalidCount: 0,
            reconciledCount: 1,
          })
          assert.equal(
            await recovered.readLastActualSeed(key, fixture.prepared.context.documentId),
            0,
          )
          const [candidate] = await recovered.listVerifiedCandidates(key)
          assert.equal(candidate.candidateId, claim.item.id)
          assert.deepEqual(await readFile(candidate.assetPath), fixture.outputBytes)
          assert.deepEqual(await recovered.recoverAfterRestart(), {
            invalidCount: 0,
            reconciledCount: 0,
          })
          assert.equal((await queue.loadVerifiedInput(claim.item.id)).item.status, 'completed')
        } finally {
          await reopened.close()
        }
        await assertProjectUnchanged(fixture)
      },
      {
        stagingHooks:
          failure === 'manifest-crash'
            ? {
                afterManifestPublish: async () => {
                  throw new Error('injected Anima manifest crash')
                },
              }
            : undefined,
      },
    )
  })
}

for (const tamper of ['user-cancel', 'stale-restart-sequence', 'wrong-operation'] as const) {
  test(`Anima reserved manifest cannot revive after ${tamper}`, async () => {
    await withAnimaStagingFixture(
      async (fixture) => {
        await enqueueAnimaStagingBatch(fixture)
        const claim = await claimOne(fixture)
        const output = await animaProvisionalOutput(fixture)
        await assert.rejects(
          fixture.staging.publishGenerationCandidate({
            ...output,
            actualSeed: 77,
            expectedStatusSequence: claim.item.statusSequence,
            queueItemId: claim.item.id,
          }),
          /injected Anima manifest crash/,
        )
        if (tamper === 'user-cancel') {
          await fixture.queue.cancel(claim.item.id, claim.item.statusSequence)
        }
        await fixture.queue.recoverAfterRestart()
        if (tamper === 'stale-restart-sequence') {
          await fixture.database.db
            .updateTable('generation_queue_item')
            .set({ status_sequence: claim.item.statusSequence + 2 })
            .where('id', '=', claim.item.id)
            .execute()
        } else if (tamper === 'wrong-operation') {
          await fixture.database.db
            .updateTable('generation_queue_item')
            .set({ operation: 'illustrious-txt2img' })
            .where('id', '=', claim.item.id)
            .execute()
        }
        const recovered = new GenerationStagingRepository(fixture.database.db, fixture.root)
        assert.deepEqual(await recovered.recoverAfterRestart(), {
          invalidCount: 1,
          reconciledCount: 0,
        })
        assert.deepEqual(await recovered.listVerifiedCandidates(claim.item.localProjectKey), [])
        assert.equal(
          await recovered.readLastActualSeed(
            claim.item.localProjectKey,
            fixture.prepared.context.documentId,
          ),
          null,
        )
        await assertProjectUnchanged(fixture)
      },
      {
        stagingHooks: {
          afterManifestPublish: async () => {
            throw new Error('injected Anima manifest crash')
          },
        },
      },
    )
  })
}

test('cancel-requested Anima attempt refuses publication even with the updated sequence and does not reserve receipt', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    await enqueueAnimaStagingBatch(fixture)
    const claim = await claimOne(fixture)
    const canceled = await fixture.queue.cancel(claim.item.id, claim.item.statusSequence)
    const output = await animaProvisionalOutput(fixture)
    await assert.rejects(
      fixture.staging.publishGenerationCandidate({
        ...output,
        actualSeed: 55,
        expectedStatusSequence: canceled.statusSequence,
        queueItemId: claim.item.id,
      }),
      { code: 'STAGING_STATUS_CONFLICT' },
    )
    assert.deepEqual(
      await fixture.database.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
      [],
    )
    assert.equal(
      await fixture.staging.readLastActualSeed(
        claim.item.localProjectKey,
        fixture.prepared.context.documentId,
      ),
      null,
    )
    const acknowledged = await fixture.queue.acknowledgeCanceledRunning(
      canceled.id,
      canceled.statusSequence,
    )
    assert.equal(acknowledged.status, 'canceled')
    await assertProjectUnchanged(fixture)
  })
})

test('Anima Retry preserves frozen target and native context in independent owned files and leaves its sibling candidate visible', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const batch = await enqueueAnimaStagingBatch(fixture)
    const claim = await claimOne(fixture)
    const candidate = await fixture.staging.publishGenerationCandidate({
      ...(await animaProvisionalOutput(fixture)),
      actualSeed: 4321,
      expectedStatusSequence: claim.item.statusSequence,
      queueItemId: claim.item.id,
    })
    const sourceItem = batch.items[1]
    const canceled = await fixture.queue.cancel(sourceItem.id, sourceItem.statusSequence)
    const source = await fixture.queue.loadVerifiedInput(sourceItem.id)
    const retry = await fixture.queue.retryTerminal(
      sourceItem.id,
      canceled.statusSequence,
      async (input) => {
        await fixture.staging.preflightBatchCapacity({
          entries: [{ frozenPayloadJson: input.frozenPayloadJson, queueItemId: input.queueItemId }],
          localProjectKey: sourceItem.localProjectKey,
          projectPath: fixture.projectPath,
          stagingSessionId: input.stagingSessionId,
        })
      },
    )
    const retried = await fixture.queue.loadVerifiedInput(retry.id)
    assert.deepEqual(retried.payload, source.payload)
    assert.notEqual(retried.targetPath, source.targetPath)
    assert.notEqual((await stat(retried.targetPath)).ino, (await stat(source.targetPath)).ino)
    assert.equal((await stat(retried.targetPath)).nlink, 1)
    assert.equal((await stat(retried.targetPath)).mode & 0o777, 0o600)
    assert.deepEqual(await readFile(retried.targetPath), fixture.prepared.targetPngBytes)
    assert.notEqual(retry.stagingSessionId, sourceItem.stagingSessionId)
    assert.deepEqual(await fixture.staging.listVerifiedCandidates(sourceItem.localProjectKey), [
      candidate,
    ])
    assert.equal(
      await fixture.staging.readLastActualSeed(
        sourceItem.localProjectKey,
        fixture.prepared.context.documentId,
      ),
      4321,
    )
    await assertProjectUnchanged(fixture)
  })
})

test('Anima discard hides exact old session and signed candidate reads while preserving a later session and seed', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const first = await enqueueAnimaStagingBatch(fixture)
    const firstClaim = await claimOne(fixture)
    const old = await fixture.staging.publishGenerationCandidate({
      ...(await animaProvisionalOutput(fixture)),
      actualSeed: 10,
      expectedStatusSequence: firstClaim.item.statusSequence,
      queueItemId: firstClaim.item.id,
    })
    for (const item of first.items.slice(1)) {
      await fixture.queue.cancel(item.id, item.statusSequence)
    }
    const second = await enqueueAnimaStagingBatch(fixture)
    const secondClaim = await claimOne(fixture)
    const fresh = await fixture.staging.publishGenerationCandidate({
      ...(await animaProvisionalOutput(fixture)),
      actualSeed: 11,
      expectedStatusSequence: secondClaim.item.statusSequence,
      queueItemId: secondClaim.item.id,
    })
    const key = old.localProjectKey
    await fixture.staging.discardSessions(key, [first.stagingSessionId])
    assert.equal(
      await fixture.staging.readVerifiedCandidatePng({
        candidateId: old.candidateId,
        imageSha256: old.image.sha256,
        localProjectKey: key,
        stagingSessionId: old.stagingSessionId,
      }),
      null,
    )
    assert.deepEqual(await fixture.staging.listVerifiedCandidates(key), [fresh])
    assert.equal(fresh.stagingSessionId, second.stagingSessionId)
    assert.equal(
      await fixture.staging.readLastActualSeed(key, fixture.prepared.context.documentId),
      11,
    )
    assert.equal(await fixture.staging.readLastActualSeed(key, randomUUID()), null)
    assert.deepEqual(await readFile(fresh.assetPath), fixture.outputBytes)
    await assertProjectUnchanged(fixture)
  })
})

test('Anima batch capacity checks complete escaped manifest serialization before any new reservation or queue publication', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const batch = await enqueueAnimaStagingBatch(fixture)
    const row = await fixture.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', batch.items[0].id)
      .executeTakeFirstOrThrow()
    const entries = Array.from({ length: 64 }, () => ({
      frozenPayloadJson: row.frozen_payload_json,
      queueItemId: randomUUID(),
    }))
    const input = {
      entries,
      localProjectKey: batch.items[0].localProjectKey,
      projectPath: fixture.projectPath,
      stagingSessionId: randomUUID(),
    }
    await fixture.staging.preflightBatchCapacity(input)
    await assert.rejects(
      fixture.staging.preflightBatchCapacity({
        ...input,
        entries: [...entries, { ...entries[0], queueItemId: randomUUID() }],
      }),
      { code: 'STAGING_INPUT_INVALID' },
    )
    await assert.rejects(
      fixture.staging.preflightBatchCapacity({
        ...input,
        entries: [
          {
            frozenPayloadJson: ' '.repeat(GENERATION_STAGING_LIMITS.frozenPayloadBytes + 1),
            queueItemId: randomUUID(),
          },
        ],
      }),
      { code: 'STAGING_INPUT_INVALID' },
    )
    assert.equal(
      (await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute()).length,
      4,
    )
    assert.deepEqual(
      await fixture.database.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
      [],
    )
    await assertProjectUnchanged(fixture)
  })
})

test('valid Anima payload below 128 KiB still refuses a 64-candidate manifest whose escaped JSON exceeds 8 MiB', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const text = '"'.repeat(9000)
    fixture.prepared.context.prompts = { negative: text, positive: text }
    fixture.prepared.context.generationDraft.positivePrompt.text = text
    fixture.prepared.context.generationDraft.negativePrompt.text = text
    const batch = await enqueueAnimaStagingBatch(fixture)
    assert.equal(batch.items.length, 1)
    const row = await fixture.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', batch.items[0].id)
      .executeTakeFirstOrThrow()
    const payloadBytes = Buffer.byteLength(row.frozen_payload_json)
    assert.ok(payloadBytes < GENERATION_STAGING_LIMITS.frozenPayloadBytes)
    assert.ok(
      payloadBytes * 64 < GENERATION_STAGING_LIMITS.manifestBytes,
      'raw payload sum is insufficient to detect this actual escaped manifest overflow',
    )
    const input = {
      entries: Array.from({ length: 64 }, () => ({
        frozenPayloadJson: row.frozen_payload_json,
        queueItemId: randomUUID(),
      })),
      localProjectKey: batch.items[0].localProjectKey,
      projectPath: fixture.projectPath,
      stagingSessionId: randomUUID(),
    }
    await assert.rejects(fixture.staging.preflightBatchCapacity(input), {
      code: 'STAGING_INPUT_INVALID',
    })
    await fixture.staging.preflightBatchCapacity({ ...input, entries: input.entries.slice(0, 32) })
    assert.equal(
      (await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute()).length,
      1,
    )
    assert.deepEqual(
      await fixture.database.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
      [],
    )
    await assertProjectUnchanged(fixture)
  })
})

test('staging parser recomputes Anima conditioning and sampling and refuses changed bundle or ordered adapter agreement', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    await enqueueAnimaStagingBatch(fixture)
    const claim = await claimOne(fixture)
    const candidate = await fixture.staging.publishGenerationCandidate({
      ...(await animaProvisionalOutput(fixture)),
      actualSeed: 19,
      expectedStatusSequence: claim.item.statusSequence,
      queueItemId: claim.item.id,
    })
    const payload = parseFrozenGenerationCandidatePayloadV1(candidate.frozenPayloadJson)
    assert.ok(payload.kind === 'anima-txt2img' || payload.kind === 'anima-img2img')
    const changed = [
      {
        ...payload,
        workerJob: {
          ...payload.workerJob,
          sampling: { ...payload.workerJob.sampling, seed: 1234 },
        },
      },
      {
        ...payload,
        workerJob: {
          ...payload.workerJob,
          prompts: {
            ...payload.workerJob.prompts,
            positive: {
              ...payload.workerJob.prompts.positive,
              cleanedText: 'different conditioning',
            },
          },
        },
      },
      {
        ...payload,
        workerJob: {
          ...payload.workerJob,
          prompts: {
            ...payload.workerJob.prompts,
            negative: { ...payload.workerJob.prompts.negative, spans: [] },
          },
        },
      },
      {
        ...payload,
        workerJob: {
          ...payload.workerJob,
          model: {
            ...payload.workerJob.model,
            qwen3Encoder: { ...payload.workerJob.model.qwen3Encoder, sha256: 'f'.repeat(64) },
          },
        },
      },
      {
        ...payload,
        workerJob: { ...payload.workerJob, loras: [...payload.workerJob.loras].reverse() },
      },
      {
        ...payload,
        context: {
          ...payload.context,
          prompts: { ...payload.context.prompts, positive: '(different raw prompt:3)' },
        },
      },
    ]
    for (const value of changed) {
      await assert.rejects(
        async () => parseFrozenGenerationCandidatePayloadV1(JSON.stringify(value)),
        {
          code: 'STAGING_INPUT_INVALID',
        },
      )
    }
    assert.deepEqual(
      parseFrozenGenerationCandidatePayloadV1(candidate.frozenPayloadJson),
      claim.payload,
    )
    await assertProjectUnchanged(fixture)
  })
})

for (const corruption of ['receipt-seed', 'manifest-seed', 'asset-pixels'] as const) {
  test(`recovered Anima candidate refuses ${corruption} without changing the recorded cursor or portable Project`, async () => {
    await withAnimaStagingFixture(async (fixture) => {
      await enqueueAnimaStagingBatch(fixture)
      const claim = await claimOne(fixture)
      const candidate = await fixture.staging.publishGenerationCandidate({
        ...(await animaProvisionalOutput(fixture)),
        actualSeed: 0,
        expectedStatusSequence: claim.item.statusSequence,
        queueItemId: claim.item.id,
      })
      if (corruption === 'receipt-seed') {
        await fixture.database.db
          .updateTable('generation_candidate_receipt')
          .set({ actual_seed: 42 })
          .where('candidate_id', '=', candidate.candidateId)
          .execute()
      } else if (corruption === 'asset-pixels') {
        await writeFile(candidate.assetPath, await animaFixturePng(254))
      } else {
        const manifestPath = path.join(
          path.dirname(path.dirname(candidate.assetPath)),
          'manifest.json',
        )
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
          candidates: { actualSeed: number }[]
        }
        manifest.candidates[0].actualSeed = 42
        await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 })
      }
      const restarted = new GenerationStagingRepository(fixture.database.db, fixture.root)
      assert.deepEqual(await restarted.recoverAfterRestart(), {
        invalidCount: 1,
        reconciledCount: 0,
      })
      assert.deepEqual(await restarted.listVerifiedCandidates(claim.item.localProjectKey), [])
      assert.equal(
        await restarted.readLastActualSeed(
          claim.item.localProjectKey,
          fixture.prepared.context.documentId,
        ),
        0,
      )
      await assertProjectUnchanged(fixture)
    })
  })
}

test('invalid optional Anima thumbnail remains a disposable cache and cannot reject or mutate its real candidate', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    await enqueueAnimaStagingBatch(fixture)
    const claim = await claimOne(fixture)
    const output = await animaProvisionalOutput(fixture)
    const outsidePath = path.join(fixture.root, 'unowned-thumbnail.webp')
    const bytes = Buffer.from('unowned thumbnail sentinel')
    await writeFile(outsidePath, bytes)
    const candidate = await fixture.staging.publishGenerationCandidate({
      ...output,
      actualSeed: 88,
      expectedStatusSequence: claim.item.statusSequence,
      queueItemId: claim.item.id,
      thumbnail: {
        byteSize: bytes.length,
        height: 64,
        outputPath: outsidePath,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        width: 64,
      },
    })
    assert.equal(candidate.thumbnail, undefined)
    assert.equal((await fixture.queue.loadVerifiedInput(claim.item.id)).item.status, 'completed')
    assert.deepEqual(
      await fixture.staging.readVerifiedCandidatePng({
        candidateId: candidate.candidateId,
        imageSha256: candidate.image.sha256,
        localProjectKey: candidate.localProjectKey,
        stagingSessionId: candidate.stagingSessionId,
      }),
      fixture.outputBytes,
    )
    assert.deepEqual(await readFile(outsidePath), bytes)
    assert.equal(
      await fixture.staging.readLastActualSeed(
        claim.item.localProjectKey,
        fixture.prepared.context.documentId,
      ),
      88,
    )
    await assertProjectUnchanged(fixture)
  })
})

test('Anima output requires the actual ICC chunk even when the general PNG validator accepts the image', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    await enqueueAnimaStagingBatch(fixture)
    const claim = await claimOne(fixture)
    const chunks = [fixture.outputBytes.subarray(0, 8)]
    let offset = 8
    while (offset < fixture.outputBytes.length) {
      const end = offset + fixture.outputBytes.readUInt32BE(offset) + 12
      if (fixture.outputBytes.toString('ascii', offset + 4, offset + 8) !== 'iCCP') {
        chunks.push(fixture.outputBytes.subarray(offset, end))
      }
      offset = end
    }
    const noProfile = Buffer.concat(chunks)
    await validateSrgbPngStream(
      (async function* () {
        yield noProfile
      })(),
      'result.png',
      fixture.outputBytes.length,
      Math.max(fixture.prepared.context.bbox.width, fixture.prepared.context.bbox.height),
    )
    const output = await animaProvisionalOutput(fixture, { bytes: noProfile })
    await assert.rejects(
      fixture.staging.publishGenerationCandidate({
        ...output,
        actualSeed: 101,
        expectedStatusSequence: claim.item.statusSequence,
        queueItemId: claim.item.id,
      }),
      { code: 'STAGING_OUTPUT_INVALID' },
    )
    assert.deepEqual(
      await fixture.database.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
      [],
    )
    assert.equal(
      await fixture.staging.readLastActualSeed(
        claim.item.localProjectKey,
        fixture.prepared.context.documentId,
      ),
      null,
    )
    await assertProjectUnchanged(fixture)
  })
})

test('a real Anima worker thumbnail is verified and remains rebuildable after queue pruning and cache loss', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    await enqueueAnimaStagingBatch(fixture)
    const claim = await claimOne(fixture)
    const output = await animaProvisionalOutput(fixture)
    const bytes = await readFile(
      path.resolve('src/main/projects/test-fixtures/candidate-thumbnail-64x64.webp'),
    )
    const outputPath = `${output.provisionalOutputPath}.thumb.webp`
    const thumbnail = {
      byteSize: bytes.length,
      height: 64,
      outputPath,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      width: 64,
    }
    await writeFile(outputPath, bytes, { flag: 'wx', mode: 0o600 })
    const candidate = await fixture.staging.publishGenerationCandidate({
      ...output,
      actualSeed: 102,
      expectedStatusSequence: claim.item.statusSequence,
      queueItemId: claim.item.id,
      thumbnail,
    })
    const { outputPath: _path, ...metadata } = thumbnail
    assert.deepEqual(candidate.thumbnail, metadata)
    const request = {
      candidateId: candidate.candidateId,
      imageSha256: candidate.image.sha256,
      localProjectKey: candidate.localProjectKey,
      stagingSessionId: candidate.stagingSessionId,
      thumbnailSha256: metadata.sha256,
    }
    assert.deepEqual(await fixture.staging.readVerifiedCandidateThumbnail(request), bytes)
    await fixture.queue.deleteTerminal(claim.item.id, claim.item.statusSequence + 1)
    const cacheRoot = path.join(path.dirname(path.dirname(candidate.assetPath)), 'thumbnail-cache')
    await rm(cacheRoot, { recursive: true })
    const restarted = new GenerationStagingRepository(fixture.database.db, fixture.root)
    await restarted.recoverAfterRestart()
    const { thumbnail: _thumbnail, ...authoritative } = candidate
    assert.deepEqual(await restarted.listVerifiedCandidates(candidate.localProjectKey), [
      authoritative,
    ])
    assert.equal(await restarted.readVerifiedCandidateThumbnail(request), null)
    assert.deepEqual(await readFile(candidate.assetPath), fixture.outputBytes)
    assert.equal(
      await restarted.readLastActualSeed(
        candidate.localProjectKey,
        fixture.prepared.context.documentId,
      ),
      102,
    )
    await assertProjectUnchanged(fixture)
  })
})
