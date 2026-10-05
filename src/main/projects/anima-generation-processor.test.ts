import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { InferenceWorkerReady } from './illustrious-txt2img-job.js'

import { type AppDatabase, openAppDatabase } from '../db/database.js'
import {
  prepareAnimaGenerationBatch,
  type PreparedAnimaGenerationBatch,
} from './anima-generation-batch.js'
import { withAnimaGenerationBatchRequests } from './anima-generation-request.js'
import {
  type GenerationDispatchModelResolver,
  GenerationProcessor,
  type GenerationWorkerRequest,
  type GenerationWorkerTransport,
} from './generation-processor.js'
import { GenerationQueueRepository, type QueuedGenerationItem } from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ProjectSession } from './project-session.js'
import {
  ANIMA_BATCH_READY,
  type AnimaBatchFixture,
  animaFixturePng,
  withAnimaBatchFixture,
} from './test-fixtures/anima-batch.js'

const ready: InferenceWorkerReady = {
  ...ANIMA_BATCH_READY,
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.11.0',
}
type Fixture = AnimaBatchFixture & {
  batch: PreparedAnimaGenerationBatch
  database: AppDatabase
  models: GenerationDispatchModelResolver
  processor: GenerationProcessor
  projectPath: string
  queue: GenerationQueueRepository
  staging: GenerationStagingRepository
}

async function withFixture(
  run: (fixture: Fixture) => Promise<void>,
  options: { method?: string; strength?: number | null } = {},
): Promise<void> {
  const strength = options.strength ?? null
  await withAnimaBatchFixture(
    async (source) => {
      const prepared = source.prepared
      Object.assign(prepared.context.sampling, {
        animaMethod: options.method ?? 'heun',
        denoisingStrength: strength,
        steps: 3,
      })
      Object.assign(prepared.context.generationDraft.sampling, {
        animaMethod: options.method ?? 'heun',
        denoisingStrength: strength,
        steps: 3,
      })
      prepared.context.prompts = { negative: '(bad:0.5)', positive: '𐐀 (cat:2) dog++' }
      prepared.context.generationDraft.positivePrompt.text = prepared.context.prompts.positive
      prepared.context.generationDraft.negativePrompt.text = prepared.context.prompts.negative
      prepared.context.dynamic = { maxPrompts: 1, seedBehavior: 'per-prompt' }
      prepared.context.generationDraft.dynamicPrompt = { ...prepared.context.dynamic }
      const database = openAppDatabase(source.root, path.resolve('src/main/db/migrations'))
      try {
        const projectPath = path.join(source.root, 'Project.igs')
        const project = await ProjectSession.create(
          projectPath,
          'Anima processor fixture',
          {
            placeholdersDir: path.resolve('src/main/projects/placeholders'),
            scratchDir: source.scratch,
          },
          prepared.context.bbox,
        )
        prepared.context.documentId = project.document.documentId
        prepared.context.documentRevision = project.document.documentRevision
        const unsupported = async () => {
          throw new Error('The Anima dispatcher must not resolve Illustrious resources.')
        }
        const models: GenerationDispatchModelResolver = {
          ...source.modelService,
          assertNoUnboundGenerationEmbeddings: unsupported,
          resolveVerifiedGenerationCheckpointForPlan: unsupported,
          resolveVerifiedGenerationEmbeddingForPlan: unsupported,
          resolveVerifiedGenerationLoraForPlan: unsupported,
          resolveVerifiedGenerationVaeForPlan: unsupported,
        }
        const queue = new GenerationQueueRepository(database.db, source.root)
        const staging = new GenerationStagingRepository(database.db, source.root)
        await queue.recoverAfterRestart()
        await staging.recoverAfterRestart()
        const batch = prepareAnimaGenerationBatch({ iterations: 1, prepared })
        await run({
          ...source,
          batch,
          database,
          models,
          processor: new GenerationProcessor(queue, staging, models, source.scratch),
          projectPath,
          queue,
          staging,
        })
      } finally {
        await database.close()
      }
    },
    { opaque: strength !== null },
  )
}

async function enqueue(fixture: Fixture): Promise<QueuedGenerationItem> {
  return await withAnimaGenerationBatchRequests({
    modelService: fixture.modelService,
    prepared: fixture.batch,
    ready,
    scratchBasePath: fixture.scratch,
    use: async (requests) => {
      const session = randomUUID()
      const rows = await fixture.queue.enqueuePreparedAnimaGenerationBatch({
        preflight: async (entries) => {
          await fixture.staging.preflightBatchCapacity({
            entries,
            localProjectKey: localProjectRecoveryKey(fixture.projectPath),
            projectPath: fixture.projectPath,
            stagingSessionId: session,
          })
        },
        preparedBatch: fixture.batch,
        projectPath: fixture.projectPath,
        requests,
        stagingSessionId: session,
      })
      assert.equal(rows.length, 1)
      return rows[0]
    },
  })
}

async function done(request: GenerationWorkerRequest, actualSeed = 0) {
  assert.ok(request.type === 'generate-anima-txt2img' || request.type === 'generate-anima-img2img')
  await writeFile(request.job.output.pngPath, await animaFixturePng(255), {
    flag: 'wx',
    mode: 0o600,
  })
  return {
    outputPath: request.job.output.pngPath,
    protocolVersion: '1',
    requestId: request.requestId,
    seed: actualSeed,
    type: 'generation-done',
  }
}

// Boundary: actual Main batch admission, durable SQLite/files, recovered Processor and staging.
// Tiny exact resource resolvers and inference pixels are controlled; no trained/CUDA claim.
test('all six frozen Anima methods and clipped modes dispatch through real durable queue, publication and restart with exact weighting and seed', async () => {
  for (const method of ['euler', 'heun', 'dpmpp_2m', 'dpmpp_2m_sde', 'er_sde', 'lcm']) {
    for (const strength of [null, 0, 0.5, 1]) {
      await withFixture(
        async (fixture) => {
          let queued = await enqueue(fixture)
          const frozen = await fixture.queue.loadVerifiedInput(queued.id)
          await fixture.queue.recoverAfterRestart()
          await fixture.staging.recoverAfterRestart()
          const canceled = await fixture.queue.loadVerifiedInput(queued.id)
          assert.equal(canceled.item.status, 'canceled')
          queued = await fixture.queue.retryTerminal(
            queued.id,
            canceled.item.statusSequence,
            async (input) => {
              await fixture.staging.preflightBatchCapacity({
                entries: [
                  { frozenPayloadJson: input.frozenPayloadJson, queueItemId: input.queueItemId },
                ],
                localProjectKey: input.source.localProjectKey,
                projectPath: input.source.projectPath,
                stagingSessionId: input.stagingSessionId,
              })
            },
          )
          const observations: unknown[] = []
          const dispose = fixture.processor.onProgress((snapshot) => {
            if (snapshot.current) {
              observations.push(snapshot.current)
            }
          })
          const result = await fixture.processor.runOne({
            close: async () => {},
            generate: async (request, onProgress) => {
              assert.ok(
                request.type === 'generate-anima-txt2img' ||
                  request.type === 'generate-anima-img2img',
              )
              assert.equal(
                request.type,
                strength === null ? 'generate-anima-txt2img' : 'generate-anima-img2img',
              )
              assert.equal(request.job.sampling.scheduler, method)
              assert.deepEqual(request.job.prompts, frozen.payload.workerJob.prompts)
              assert.deepEqual(request.job.sampling, frozen.payload.workerJob.sampling)
              assert.deepEqual(
                request.job.loras.map((entry) => entry.weight),
                [-0.7, 0, 1.2],
              )
              assert.equal(path.basename(request.job.output.pngPath), 'result.png')
              assert.ok(path.basename(request.job.output.stagingRoot).startsWith('anima-request-'))
              assert.notEqual(
                request.requestId,
                JSON.parse(
                  (
                    await fixture.database.db
                      .selectFrom('generation_queue_item')
                      .select('frozen_payload_json')
                      .where('id', '=', queued.id)
                      .executeTakeFirstOrThrow()
                  ).frozen_payload_json,
                ).originRequestId,
              )
              const total = request.job.sampling.totalSteps
              onProgress?.({ step: 1, totalSteps: total + 1 })
              assert.equal(fixture.processor.getProgressSnapshot().current, null)
              for (let step = 1; step <= total; step++) {
                onProgress?.({ step, totalSteps: total })
              }
              return await done(request)
            },
            ready,
          })
          dispose()
          assert.equal(result.kind, 'completed')
          assert.equal(observations.length, fixture.batch.items[0].samplingPlan.totalSteps)
          assert.equal(fixture.processor.getProgressSnapshot().current, null)
          assert.equal((await fixture.queue.loadVerifiedInput(queued.id)).item.status, 'completed')
          const restarted = new GenerationStagingRepository(fixture.database.db, fixture.root)
          await restarted.recoverAfterRestart()
          const candidates = await restarted.listVerifiedCandidates(queued.localProjectKey)
          assert.equal(candidates.length, 1)
          assert.equal(candidates[0].actualSeed, 0)
          assert.equal(
            await restarted.readLastActualSeed(
              queued.localProjectKey,
              fixture.prepared.context.documentId,
            ),
            0,
          )
          assert.equal(
            await restarted.readLastActualSeed(queued.localProjectKey, randomUUID()),
            null,
          )
          assert.equal(
            JSON.parse(candidates[0].frozenPayloadJson).kind,
            strength === null ? 'anima-txt2img' : 'anima-img2img',
          )
          assert.deepEqual(await readdir(fixture.scratch), [])
        },
        { method, strength },
      )
    }
  }
})

test('dispatch requalifies every original companion and ordered adapter after enqueue without invoking another family', async () => {
  for (const role of ['checkpoint', 'qwen3Encoder', 'vae', 'lora0', 'lora1', 'lora2']) {
    await withFixture(async (fixture) => {
      const queued = await enqueue(fixture)
      const target = role.startsWith('lora')
        ? fixture.prepared.context.loras[Number(role.at(-1))].managedPath
        : fixture.prepared.context.model[role as 'checkpoint' | 'qwen3Encoder' | 'vae'].managedPath
      const original = await readFile(target)
      const changed = Buffer.from(original)
      changed[0] ^= 1
      await writeFile(target, changed)
      let dispatched = 0
      const transport: GenerationWorkerTransport = {
        close: async () => {},
        generate: async (request) => {
          dispatched++
          return await done(request)
        },
        ready,
      }
      const result = await fixture.processor.runOne(transport)
      assert.equal(result.kind, 'failed', role)
      assert.equal(dispatched, 0, role)
      assert.equal((await fixture.queue.loadVerifiedInput(queued.id)).item.status, 'failed')
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(queued.localProjectKey), [])
      assert.equal(
        await fixture.staging.readLastActualSeed(
          queued.localProjectKey,
          fixture.prepared.context.documentId,
        ),
        null,
      )
      await writeFile(target, original)
      const neighbor = await enqueue(fixture)
      assert.equal((await fixture.processor.runOne(transport)).kind, 'completed')
      assert.equal(dispatched, 1)
      assert.equal((await fixture.queue.loadVerifiedInput(neighbor.id)).item.status, 'completed')
    })
  }
})

test('incomplete Anima runtime or missing family resolver cannot dispatch while a qualified neighbor can', async () => {
  for (const missing of ['anima-capability', 'family-resolver']) {
    await withFixture(async (fixture) => {
      const queued = await enqueue(fixture)
      const models =
        missing === 'family-resolver'
          ? { ...fixture.models, resolveVerifiedGenerationAnimaBundleForPlan: undefined }
          : fixture.models
      const processor = new GenerationProcessor(
        fixture.queue,
        fixture.staging,
        models,
        fixture.scratch,
      )
      let calls = 0
      assert.equal(
        (
          await processor.runOne({
            close: async () => {},
            generate: async (request) => {
              calls++
              return await done(request)
            },
            ready:
              missing === 'anima-capability'
                ? {
                    ...ready,
                    capabilities: ready.capabilities.filter(
                      (entry) => entry !== 'anima-flow-sampling',
                    ),
                  }
                : ready,
          })
        ).kind,
        'failed',
      )
      assert.equal(calls, 0)
      assert.equal((await fixture.queue.loadVerifiedInput(queued.id)).item.status, 'failed')
      await enqueue(fixture)
      assert.equal(
        (
          await fixture.processor.runOne({
            close: async () => {},
            generate: async (request) => {
              calls++
              return await done(request)
            },
            ready,
          })
        ).kind,
        'completed',
      )
      assert.equal(calls, 1)
    })
  }
})

test('target replacement during final resource qualification is refused before inference handoff', async () => {
  await withFixture(async (fixture) => {
    const queued = await enqueue(fixture)
    let dispatched = 0
    const original = fixture.models.resolveVerifiedGenerationAnimaBundleForPlan!
    const processor = new GenerationProcessor(
      fixture.queue,
      fixture.staging,
      {
        ...fixture.models,
        resolveVerifiedGenerationAnimaBundleForPlan: async (reference) => {
          const result = await original(reference)
          const stage = (await readdir(fixture.scratch)).find((entry) =>
            entry.startsWith('anima-request-'),
          )!
          assert.ok(stage)
          await writeFile(path.join(fixture.scratch, stage, 'target.png'), 'late replacement')
          return result
        },
      },
      fixture.scratch,
    )
    assert.equal(
      (
        await processor.runOne({
          close: async () => {},
          generate: async (request) => {
            dispatched++
            return await done(request)
          },
          ready,
        })
      ).kind,
      'failed',
    )
    assert.equal(dispatched, 0)
    assert.equal((await fixture.queue.loadVerifiedInput(queued.id)).item.status, 'failed')
    assert.deepEqual(await readdir(fixture.scratch), [])
  })
})

test('Anima cancel holds its actual running slot and stage until confirmed transport exit, and rejects late done and progress', async () => {
  await withFixture(async (fixture) => {
    const queued = await enqueue(fixture)
    let entered!: () => void
    const dispatched = new Promise<void>((resolve) => {
      entered = resolve
    })
    let exit!: () => void
    const confirmedExit = new Promise<void>((resolve) => {
      exit = resolve
    })
    let finished!: () => void
    const terminal = new Promise<void>((resolve) => {
      finished = resolve
    })
    let closing!: () => void
    const closeEntered = new Promise<void>((resolve) => {
      closing = resolve
    })
    let returned!: () => void
    const lateDoneReturned = new Promise<void>((resolve) => {
      returned = resolve
    })
    let progress: ((value: { step: number; totalSteps: number }) => void) | undefined
    const run = fixture.processor.runOne({
      close: async () => {
        closing()
        await confirmedExit
      },
      generate: async (request, onProgress) => {
        progress = onProgress
        entered()
        await terminal
        const response = await done(request)
        returned()
        return response
      },
      ready,
    })
    await dispatched
    progress?.({ step: 1, totalSteps: 5 })
    assert.equal(fixture.processor.getProgressSnapshot().current?.jobId, queued.id)
    const cancel = fixture.processor.cancelAndWait(queued.id)
    await closeEntered
    assert.equal((await fixture.queue.loadVerifiedInput(queued.id)).item.status, 'running')
    assert.equal(fixture.processor.getProgressSnapshot().current, null)
    assert.equal((await readdir(fixture.scratch)).length, 1)
    finished()
    await lateDoneReturned
    exit()
    await cancel
    assert.equal((await run).kind, 'canceled')
    progress?.({ step: 2, totalSteps: 5 })
    assert.equal(fixture.processor.getProgressSnapshot().current, null)
    assert.equal((await fixture.queue.loadVerifiedInput(queued.id)).item.status, 'canceled')
    assert.deepEqual(await fixture.staging.listVerifiedCandidates(queued.localProjectKey), [])
    assert.equal(
      await fixture.staging.readLastActualSeed(
        queued.localProjectKey,
        fixture.prepared.context.documentId,
      ),
      null,
    )
    assert.deepEqual(await readdir(fixture.scratch), [])
  })
})

test('Anima publication uncertainty retains a receipt-owned running row and actual restart reconciliation completes it', async () => {
  await withFixture(async (fixture) => {
    const queued = await enqueue(fixture)
    const staging = new GenerationStagingRepository(fixture.database.db, fixture.root, {
      afterManifestPublish: async () => {
        throw new Error('controlled crash window')
      },
    })
    await staging.recoverAfterRestart()
    const processor = new GenerationProcessor(
      fixture.queue,
      staging,
      fixture.models,
      fixture.scratch,
    )
    await assert.rejects(
      processor.runOne({
        close: async () => {},
        generate: async (request) => await done(request, 123),
        ready,
      }),
      { code: 'PUBLICATION_UNCERTAIN' },
    )
    assert.equal((await fixture.queue.loadVerifiedInput(queued.id)).item.status, 'running')
    assert.equal(await staging.hasPublicationReceipt(queued.id), true)
    assert.equal(
      await staging.readLastActualSeed(queued.localProjectKey, fixture.prepared.context.documentId),
      null,
    )
    await fixture.queue.recoverAfterRestart()
    const restored = new GenerationStagingRepository(fixture.database.db, fixture.root)
    const recovery = await restored.recoverAfterRestart()
    assert.equal(recovery.invalidCount, 0)
    assert.equal(recovery.reconciledCount, 1)
    assert.equal((await fixture.queue.loadVerifiedInput(queued.id)).item.status, 'completed')
    assert.equal((await restored.listVerifiedCandidates(queued.localProjectKey))[0].actualSeed, 123)
    assert.equal(
      await restored.readLastActualSeed(
        queued.localProjectKey,
        fixture.prepared.context.documentId,
      ),
      123,
    )
  })
})

test('Anima response correlation rejects a valid provisional PNG for another request or output without publishing seed', async () => {
  for (const mismatch of ['requestId', 'outputPath', 'seed']) {
    await withFixture(async (fixture) => {
      const queued = await enqueue(fixture)
      let closes = 0
      const result = await fixture.processor.runOne({
        close: async () => {
          closes++
        },
        generate: async (request) => {
          const response = await done(request)
          Object.assign(response, {
            [mismatch]:
              mismatch === 'seed' ? -1 : mismatch === 'requestId' ? randomUUID() : '/tmp/other.png',
          })
          return response
        },
        ready,
      })
      assert.equal(result.kind, 'failed')
      assert.equal(closes, 1)
      assert.equal((await fixture.queue.loadVerifiedInput(queued.id)).item.status, 'failed')
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(queued.localProjectKey), [])
      assert.equal(
        await fixture.staging.readLastActualSeed(
          queued.localProjectKey,
          fixture.prepared.context.documentId,
        ),
        null,
      )
    })
  }
})
