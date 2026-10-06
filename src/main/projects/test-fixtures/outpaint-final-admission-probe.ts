import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import type { OutpaintInfillResolver } from '../../runtime/inference-auxiliary-resources.js'
import type {
  GenerationQueueRetryPreflightInput,
  GenerationQueueTestHooks,
  PreparedOutpaintGeneration,
} from '../generation-queue.js'
import type { OutpaintConsumerFixture } from './outpaint-consumers.js'

import {
  buildFrozenQueuedOutpaintV1,
  GenerationQueueRepository,
  isQueuedOutpaint,
} from '../generation-queue.js'
import { localProjectRecoveryKey } from '../project-identity.js'
import { animaProvisionalOutput } from './anima-staging.js'
import { enqueueOutpaintConsumerBatch, withOutpaintConsumerFixture } from './outpaint-consumers.js'

const family = process.argv[2]
if (family !== 'illustrious' && family !== 'anima') {
  throw new Error('Expected a supported family.')
}

function barrier() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function copyPrepared(prepared: PreparedOutpaintGeneration): PreparedOutpaintGeneration {
  const context = structuredClone(prepared.context)
  const targetPngBytes = Buffer.from(prepared.targetPngBytes)
  return context.kind === 'normal-outpaint-preparation'
    ? { context, targetPngBytes }
    : { context, targetPngBytes }
}

// A waiting SQLite connection acquisition does not keep Node alive. The parent owns a hard child
// deadline, so preserve the observable hang if resource qualification accidentally enters SQL.
const keepAlive = setInterval(() => {}, 1000)
const cases: {
  action: 'generate' | 'retry'
  document: 'closed' | 'current' | 'replaced'
  hold: 'before-commit' | 'last-qualifier'
  published: boolean
}[] = []

try {
  for (const action of ['generate', 'retry'] as const) {
    for (const hold of ['last-qualifier', 'before-commit'] as const) {
      for (const document of ['closed', 'replaced', 'current'] as const) {
        await withOutpaintConsumerFixture(family, async (fixture) => {
          const entered = barrier()
          const release = barrier()
          const pause = async () => {
            entered.resolve()
            await release.promise
          }
          const hooks: GenerationQueueTestHooks =
            hold === 'before-commit'
              ? action === 'generate'
                ? { beforeBatchCommit: pause }
                : { beforeRetryCommit: pause }
              : {}
          const queue = new GenerationQueueRepository(fixture.database.db, fixture.root, hooks)
          await queue.recoverAfterRestart()
          // Keep a real completed candidate, a retryable canceled source and one old pending job.
          const old = await enqueueOutpaintConsumerBatch(fixture, {
            items: Array.from({ length: 3 }, () => fixture.outpaintPrepared),
          })
          const claimed = await fixture.queue.claimNextPending()
          assert.equal(claimed?.item.id, old.items[0].id)
          assert.ok(claimed)
          const candidate = await fixture.staging.publishGenerationCandidate({
            ...(await animaProvisionalOutput(fixture, { prefix: `${family}-request-` })),
            actualSeed: fixture.outpaintPrepared.context.sampling.seed,
            expectedStatusSequence: claimed.item.statusSequence,
            queueItemId: claimed.item.id,
          })
          const canceled = await fixture.queue.cancel(old.items[1].id, 0)
          const source = await fixture.queue.loadVerifiedRetryInput(canceled.id)
          const sessionRoot = path.dirname(path.dirname(candidate.assetPath))
          const inputRoot = path.join(fixture.root, 'generation-inputs')
          const oldDirectories = (await readdir(inputRoot)).sort()
          const retainedFiles = [
            candidate.assetPath,
            path.join(sessionRoot, 'source-target.png'),
            path.join(sessionRoot, 'manifest.json'),
            ...oldDirectories.flatMap((directory) => [
              path.join(inputRoot, directory, 'target.png'),
              path.join(inputRoot, directory, 'manifest.json'),
            ]),
          ]
          const retainedBytes = await Promise.all(retainedFiles.map((file) => readFile(file)))
          const baselineRows = await fixture.database.db
            .selectFrom('generation_queue_item')
            .selectAll()
            .orderBy('id')
            .execute()
          assert.equal(baselineRows.find((row) => row.id === old.items[2].id)?.status, 'pending')
          const receipts = await fixture.database.db
            .selectFrom('generation_candidate_receipt')
            .selectAll()
            .execute()
          const seedCursor = await fixture.database.db
            .selectFrom('generation_seed_cursor')
            .selectAll()
            .execute()
          const discarded = await fixture.database.db
            .selectFrom('generation_staging_discarded_session')
            .selectAll()
            .execute()
          let registryCalls = 0
          let infillCalls = 0
          const queryRegistry = async () => {
            await fixture.database.db.selectFrom('generation_queue_item').select('id').execute()
          }
          const models: OutpaintConsumerFixture['outpaintModels'] = {
            ...fixture.outpaintModels,
            async resolveVerifiedGenerationAnimaBundleForPlan(reference) {
              assert.equal(this, models)
              registryCalls++
              await queryRegistry()
              return await fixture.outpaintModels.resolveVerifiedGenerationAnimaBundleForPlan(
                reference,
              )
            },
            async resolveVerifiedGenerationCheckpointForPlan(reference) {
              assert.equal(this, models)
              registryCalls++
              await queryRegistry()
              return await fixture.outpaintModels.resolveVerifiedGenerationCheckpointForPlan(
                reference,
              )
            },
          }
          const infill: OutpaintInfillResolver = {
            async resolveVerifiedOutpaintInfill() {
              assert.equal(this, infill)
              infillCalls++
              await queryRegistry()
              if (hold === 'last-qualifier' && infillCalls === 2) {
                await pause()
              }
              return await fixture.infillResolver.resolveVerifiedOutpaintInfill()
            },
          }
          const capturedDocumentId = fixture.outpaintPrepared.context.documentId
          let currentDocumentId: string | null = capturedDocumentId
          let assertions = 0
          const assertCurrent = () => {
            assertions++
            if (currentDocumentId !== capturedDocumentId) {
              throw Object.assign(new Error('The captured Project document is no longer open.'), {
                code: 'PROJECT_DOCUMENT_CHANGED',
              })
            }
          }
          const prepared = copyPrepared(fixture.outpaintPrepared)
          const expectedPayload = buildFrozenQueuedOutpaintV1(prepared, randomUUID())
          const expectedBytes = Buffer.from(prepared.targetPngBytes)
          const stagingSessionId = randomUUID()
          const admission = {
            assertCurrent,
            beforeCommit: async () => assertCurrent(),
            infillResolver: infill,
            items: [prepared, copyPrepared(prepared)],
            modelService: models,
            preflight: async (
              entries: readonly { frozenPayloadJson: string; queueItemId: string }[],
            ) => {
              assertCurrent()
              await fixture.staging.preflightBatchCapacity({
                entries,
                localProjectKey: localProjectRecoveryKey(fixture.projectPath),
                projectPath: fixture.projectPath,
                stagingSessionId,
              })
              assertCurrent()
            },
            projectPath: fixture.projectPath,
            stagingSessionId,
          }
          const retryOptions = {
            assertCurrent,
            infillResolver: infill,
            modelService: models,
            preflight: async (input: GenerationQueueRetryPreflightInput) => {
              assertCurrent()
              await fixture.staging.preflightBatchCapacity({
                entries: [
                  { frozenPayloadJson: input.frozenPayloadJson, queueItemId: input.queueItemId },
                ],
                localProjectKey: input.source.localProjectKey,
                projectPath: input.source.projectPath,
                stagingSessionId: input.stagingSessionId,
              })
              assertCurrent()
            },
          }
          const operation =
            action === 'generate'
              ? queue.enqueuePreparedOutpaintBatch(admission)
              : queue
                  .retryPreparedOutpaintTerminal(canceled.id, canceled.statusSequence, retryOptions)
                  .then((item) => [item])
          // Attach the rejection observer before releasing the held boundary.
          const outcome = operation.then(
            (items) => ({ items, rejected: false as const }),
            (error: unknown) => ({ error, rejected: true as const }),
          )
          await entered.promise
          assert.equal(registryCalls, 2)
          assert.equal(infillCalls, 2)
          currentDocumentId =
            document === 'closed'
              ? null
              : document === 'replaced'
                ? randomUUID()
                : capturedDocumentId
          // An adversarial caller cannot replace the captured identity callback or later draft/PNG.
          admission.assertCurrent = () => {}
          retryOptions.assertCurrent = () => {}
          prepared.context.prompts.positive = 'changed current draft after capture'
          prepared.targetPngBytes.fill(0)
          release.resolve()
          const result = await outcome
          if (document === 'current') {
            if (result.rejected) {
              throw result.error
            }
            assert.equal(result.items.length, action === 'generate' ? 2 : 1)
            for (const item of result.items) {
              const verified = await queue.loadVerifiedInput(item.id)
              assert.ok(isQueuedOutpaint(verified.payload))
              assert.ok((await readFile(verified.targetPath)).equals(expectedBytes))
              if (action === 'generate') {
                assert.deepEqual(verified.payload.context, expectedPayload.context)
                assert.deepEqual(verified.payload.workerJob, expectedPayload.workerJob)
              } else {
                assert.deepEqual(verified.payload, source.payload)
              }
            }
            const rows = await fixture.database.db
              .selectFrom('generation_queue_item')
              .selectAll()
              .orderBy('id')
              .execute()
            const admittedIds = new Set(result.items.map((item) => item.id))
            const retainedRows = rows.filter((row) => !admittedIds.has(row.id))
            assert.equal(retainedRows.length, baselineRows.length)
            for (const row of retainedRows) {
              const baseline = baselineRows.find((entry) => entry.id === row.id)!
              if (action === 'retry' && row.id === canceled.id) {
                assert.equal(row.status_sequence, baseline.status_sequence + 1)
                assert.deepEqual(
                  {
                    ...row,
                    status_sequence: baseline.status_sequence,
                    updated_at: baseline.updated_at,
                  },
                  baseline,
                )
              } else {
                assert.deepEqual(row, baseline)
              }
            }
          } else {
            if (!result.rejected) {
              assert.fail('A stale document published a queue batch.')
            }
            assert.equal((result.error as { code?: string }).code, 'PROJECT_DOCUMENT_CHANGED')
            assert.deepEqual(
              await fixture.database.db
                .selectFrom('generation_queue_item')
                .selectAll()
                .orderBy('id')
                .execute(),
              baselineRows,
            )
            assert.deepEqual((await readdir(inputRoot)).sort(), oldDirectories)
            const retainedSource = await queue.loadVerifiedRetryInput(canceled.id)
            assert.deepEqual(retainedSource.item, source.item)
            assert.deepEqual(retainedSource.payload, source.payload)
            assert.equal(retainedSource.targetPath, source.targetPath)
            assert.ok(retainedSource.targetPngBytes.equals(source.targetPngBytes))
          }
          assert.ok(assertions >= (action === 'generate' ? 4 : 3))
          assert.deepEqual(
            await fixture.database.db
              .selectFrom('generation_candidate_receipt')
              .selectAll()
              .execute(),
            receipts,
          )
          assert.deepEqual(
            await fixture.database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
            seedCursor,
          )
          assert.deepEqual(
            await fixture.database.db
              .selectFrom('generation_staging_discarded_session')
              .selectAll()
              .execute(),
            discarded,
          )
          assert.deepEqual(
            (await fixture.staging.listVerifiedCandidates(candidate.localProjectKey)).map(
              (item) => item.candidateId,
            ),
            [candidate.candidateId],
          )
          for (const [index, file] of retainedFiles.entries()) {
            assert.ok(
              (await readFile(file)).equals(retainedBytes[index]),
              `Retained file changed: ${path.basename(file)}`,
            )
          }
          assert.ok((await readFile(fixture.projectPath)).equals(fixture.originalProjectBytes))
          cases.push({ action, document, hold, published: document === 'current' })
        })
      }
    }
  }
  process.stdout.write(`${JSON.stringify({ cases, family })}\n`)
} finally {
  clearInterval(keepAlive)
}
