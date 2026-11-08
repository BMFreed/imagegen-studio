import type { ProjectGenerateOptions } from '../../shared/projects/project-generation-actions.js'

import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'

import type { RegionalWorkerInput } from './regional-worker-request.js'
import type { RegionalProjectFixture } from './test-fixtures/regional-project.js'

import { openAppDatabase } from '../db/database.js'
import { ProjectGenerationActionController } from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { ProjectRegionalGenerationCoordinator } from './project-regional-generation-coordinator.js'
import {
  createRegionalProjectFixture,
  regionalProjectDeferred,
} from './test-fixtures/regional-project.js'

type ActionRuntime = ConstructorParameters<typeof ProjectGenerationActionController>[0]['runtime']
type WorkerRuntime = ConstructorParameters<typeof GenerationDispatchCoordinator>[0]
type Fixture = Awaited<ReturnType<typeof publicBatchFixture>>
type FixtureOptions = Parameters<typeof createRegionalProjectFixture>[0]
type BatchSubmission = Parameters<
  ProjectRegionalGenerationCoordinator['submitInvokeBatchUnderGate']
>[1]

/**
 * Real public action/capture/planner/admission/SQLite/files/receipt owners. The existing explicit
 * fixture substitutes model qualification, target computation and native PNG computation only.
 * InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd: promptBatch.ts, submissionApi.ts,
 * session_queue_default.py::_enqueue_batch and session_queue_common.py::prepare_values_to_insert.
 * Studio selects all-or-none through its existing atomic batch owner, not Invoke's UI default.
 */
async function publicBatchFixture(options: FixtureOptions = {}) {
  const f = await createRegionalProjectFixture(options)
  const publicCoordinator = new ProjectRegionalGenerationCoordinator({
    compositionProfile: 'invoke-canvas-v1',
    gate: f.gate,
    models: f.models,
    orchestrator: f.orchestrator,
    projects: f.projects,
    scratchBasePath: f.scratch,
  })
  const controls: {
    afterPreparation?: () => Promise<void>
    beforePreparation?: () => Promise<void>
    beforeWorker?: () => Promise<void>
    failSeeds: Set<number>
    ready: ReturnType<RegionalProjectFixture['input']>['ready']
  } = {
    failSeeds: new Set(),
    ready: {
      ...f.input().ready,
      capabilities: [
        ...f.input().ready.capabilities,
        'illustrious-regional-invoke-v1',
        'illustrious-regional-invoke-init-v1',
      ],
    },
  }
  const counters = { admission: 0, preparation: 0, worker: 0 }
  const consumed: RegionalWorkerInput[] = []
  const runtime: ActionRuntime & WorkerRuntime = {
    getStatus: async () => null,
    readQualifiedInferenceReady: async () => structuredClone(controls.ready),
    retryUnconfirmedGenerationExit: async () => true,
    withGenerationAdmission: async (_scratch, use) => {
      counters.admission++
      return await use(structuredClone(controls.ready))
    },
    withGenerationPreparation: async (_scratch, use) => {
      counters.preparation++
      await controls.beforePreparation?.()
      const result = await use({
        inferenceReady: structuredClone(controls.ready),
        targetWorker: f.compositionWorker,
      })
      await controls.afterPreparation?.()
      return result
    },
    withGenerationWorker: async (_scratch, use) => {
      counters.worker++
      await controls.beforeWorker?.()
      return await use({
        ...f.transport({
          executeCurrentCanvasRegional: async (input) => {
            assert.ok(input.compositionProfile !== 'invoke-krea2-global-support-v1')
            consumed.push(structuredClone(input))
            if (controls.failSeeds.has(input.request.job.sampling.seed)) {
              throw new Error('Controlled concrete regional item failure')
            }
            return f.resultFor(input)
          },
          ready: structuredClone(controls.ready),
        }),
        generate: async () => assert.fail('Regional batches cannot use ordinary inference.'),
      })
    },
  }
  const dispatch = new GenerationDispatchCoordinator(
    runtime,
    f.orchestrator,
    f.processor,
    f.scratch,
    undefined,
    publicCoordinator,
  )
  const actions = new ProjectGenerationActionController({
    dispatch,
    gate: f.gate,
    models: f.models,
    orchestrator: f.orchestrator,
    processor: f.processor,
    projects: f.projects,
    queue: f.queue,
    regional: publicCoordinator,
    runtime,
    scratchBasePath: f.scratch,
    staging: f.staging,
  })
  return { ...f, actions, consumed, controls, counters, publicCoordinator }
}

async function withFixture(use: (f: Fixture) => Promise<void>, options: FixtureOptions = {}) {
  const f = await publicBatchFixture(options)
  try {
    await use(f)
  } finally {
    f.controls.beforePreparation = undefined
    f.controls.afterPreparation = undefined
    f.controls.beforeWorker = undefined
    await f.actions.shutdown()
    await f.publicCoordinator.shutdown()
    await f.close()
  }
}

function request(f: Fixture, iterations: number): ProjectGenerateOptions {
  return { documentId: f.document().documentId, iterations }
}

async function queued(
  f: Fixture,
  iterations: number,
  confirmation?: ProjectGenerateOptions['confirmation'],
) {
  const result = await f.actions.generate(f.tabId, {
    ...request(f, iterations),
    ...(confirmation ? { confirmation } : {}),
  })
  assert.equal(result.kind, 'queued')
  if (result.kind !== 'queued') {
    assert.fail('Expected the complete reviewed static batch.')
  }
  assert.equal(result.jobIds.length, iterations)
  assert.equal(result.truncated, false)
  return result
}

async function rows(f: Fixture) {
  return await f.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .orderBy('created_at')
    .orderBy('id')
    .execute()
}

/** Wait for exact durable outcomes and the settled owner, never elapsed sleep. */
async function settled(f: Fixture, ids: readonly string[]) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    // One independent SQL observation avoids filling the queue owner's serialized mailbox
    // with N metadata reads on every poll while that same owner is dispatching N jobs.
    const found = await f.db
      .selectFrom('generation_queue_item')
      .select(['id', 'status'])
      .where('id', 'in', [...ids])
      .execute()
    assert.equal(found.length, ids.length, 'Every planned queue row must exist.')
    const jobs = ids.map((id) => {
      const job = found.find((row) => row.id === id)
      assert.ok(job)
      return job
    })
    const state = await f.actions.getState(f.tabId)
    if (
      state.phase === 'idle' &&
      jobs.every((job) => ['canceled', 'completed', 'failed'].includes(job.status))
    ) {
      return jobs
    }
    if (state.phase === 'blocked') {
      assert.fail(`Unexpected blocked batch: ${state.error?.code}: ${state.error?.message}`)
    }
    await setImmediate()
  }
  assert.fail('The exact batch did not settle before its bounded fixture deadline.')
}

async function confirmation(f: Fixture, iterations: number) {
  const reviewed = await f.actions.generate(f.tabId, request(f, iterations))
  assert.equal(reviewed.kind, 'confirmation-required')
  if (reviewed.kind !== 'confirmation-required') {
    assert.fail('Expected prior-work confirmation.')
  }
  return { candidateIds: reviewed.candidateIds, unfinishedJobIds: reviewed.unfinishedJobIds }
}

function submission(f: Fixture, iterations: number): BatchSubmission {
  return {
    ...f.owner(),
    iterations,
    withPreparation: async (use) =>
      await use({
        inferenceReady: structuredClone(f.controls.ready),
        targetWorker: f.compositionWorker,
      }),
  }
}

test('regional static batch keeps every planned item atomic through one public Generate', async () => {
  let publications = 0
  let beforeCommit = -1
  const visibleCounts: number[] = []
  let inspect = async (): Promise<number> => assert.fail('Independent observer is not installed.')
  await withFixture(
    async (f) => {
      const observer = openAppDatabase(f.root, path.resolve('src/main/db/migrations'))
      inspect = async () =>
        (await observer.db.selectFrom('generation_queue_item').select('id').execute()).length
      const saved = await readFile(f.packagePath)
      const original = structuredClone(f.document())
      const capture = f.projects.withCapturedCurrentCanvasRegionalGenerationInput.bind(f.projects)
      let captures = 0
      f.projects.withCapturedCurrentCanvasRegionalGenerationInput = async (...args) => {
        captures++
        return await capture(...args)
      }
      try {
        const result = await queued(f, 3)
        assert.deepEqual(
          (await settled(f, result.jobIds)).map((job) => job.status),
          ['completed', 'completed', 'completed'],
        )
        const stored = await rows(f)
        assert.equal(stored.length, 3)
        assert.deepEqual(
          stored.map((row) => row.id),
          result.jobIds,
        )
        assert.equal(new Set(stored.map((row) => row.batch_id)).size, 1)
        assert.equal(stored[0].batch_id, result.batchId)
        assert.equal(new Set(stored.map((row) => row.staging_session_id)).size, 1)
        assert.equal(new Set(stored.map((row) => row.created_at)).size, 1)
        assert.equal(captures, 1)
        assert.equal(f.calls.compose.length, 1)
        assert.equal(f.counters.preparation, 1)
        assert.equal(publications, 3)
        assert.deepEqual(visibleCounts, [0, 0, 0])
        assert.equal(beforeCommit, 0, 'Other SQL connections cannot observe a partial batch.')
        assert.deepEqual(
          f.consumed.map((input) => input.request.job.sampling.seed),
          [123, 124, 125],
        )
        for (const [index, id] of result.jobIds.entries()) {
          const owned = await f.queue.loadVerifiedRegionalInput(id)
          assert.equal(owned.payload.kind, 'illustrious-regional-txt2img')
          assert.equal(owned.payload.context.sampling.seed, 123 + index)
          assert.equal(owned.input.recipe.item.seed, 123 + index)
          assert.equal(owned.input.recipe.item.iteration, index)
          assert.equal(owned.input.recipe.item.promptPairIndex, 0)
          assert.equal(owned.input.request.job.sampling.seed, 123 + index)
          assert.equal(owned.input.request.job.sampling.scheduler, 'euler')
          assert.equal(Object.hasOwn(owned.payload, 'initializationProfile'), false)
          assert.equal(owned.input.recipe.globalPrompts.positive.text, 'global positive')
          assert.equal(owned.input.recipe.regions[0].positive?.text, 'regional subject')
          assert.ok(
            Buffer.from(owned.input.recipe.regions[0].coverage.alpha).equals(Buffer.from(f.alpha)),
          )
          assert.ok((await readFile(owned.targetPath)).equals(f.targetBytes))
        }
        assert.deepEqual(
          (await f.staging.listVerifiedCandidates(f.tabId)).map(
            (candidate) => candidate.queueItemId,
          ),
          result.jobIds,
        )
        assert.deepEqual(f.document(), original)
        assert.ok((await readFile(f.packagePath)).equals(saved), 'Batch completion cannot Save.')
      } finally {
        f.projects.withCapturedCurrentCanvasRegionalGenerationInput = capture
        await observer.close()
      }
    },
    {
      queueHooks: {
        afterInputPublish: async () => {
          publications++
          visibleCounts.push(await inspect())
        },
        beforeBatchCommit: async () => {
          beforeCommit = await inspect()
        },
      },
    },
  )
})

test('regional static batch single-item control remains valid', async () => {
  await withFixture(async (f) => {
    const result = await queued(f, 1)
    assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
    assert.equal((await rows(f)).length, 1)
    assert.equal(f.consumed.length, 1)
    assert.equal(f.consumed[0].recipe.item.seed, 123)
    assert.equal(f.consumed[0].request.job.sampling.seed, 123)
    assert.equal(f.calls.compose.length, 1)
  })
})

test('regional static batch keeps distinct planned seeds and frozen Euler a after current edits', async () => {
  await withFixture(async (f) => {
    await f.edit((document) => {
      document.generationDraft.sampling.sampler = 'Euler a'
      document.generationDraft.seed.value = 0xff_ff_ff_fe
    })
    const release = regionalProjectDeferred()
    f.controls.beforeWorker = async () => await release.promise
    try {
      const result = await queued(f, 3)
      const expected = [0xff_ff_ff_fe, 0xff_ff_ff_ff, 0]
      const frozen = await Promise.all(
        result.jobIds.map(async (id) => await f.queue.loadVerifiedRegionalInput(id)),
      )
      assert.deepEqual(
        frozen.map((entry) => entry.input.recipe.item.seed),
        expected,
      )
      assert.deepEqual(
        frozen.map((entry) => entry.payload.context.sampling.seed),
        expected,
      )
      await f.edit((document) => {
        document.generationDraft.sampling.sampler = 'Euler'
        document.generationDraft.seed.value = 999
        document.generationDraft.positivePrompt.text = 'Later draft is not a batch input'
        document.regionalGuidance = []
      })
      const authored = structuredClone(f.document())
      release.resolve()
      assert.ok((await settled(f, result.jobIds)).every((job) => job.status === 'completed'))
      assert.deepEqual(
        f.consumed.map((input) => input.request.job.sampling.seed),
        expected,
      )
      assert.equal(new Set(f.consumed.map((input) => input.request.requestId)).size, 3)
      for (const [index, input] of f.consumed.entries()) {
        assert.equal(input.initializationProfile, 'invoke-cpu-f32-add-noise-v1')
        assert.equal(input.request.job.sampling.scheduler, 'euler_a')
        assert.deepEqual(input.recipe, frozen[index].input.recipe)
        assert.equal(input.recipe.item.iteration, index)
      }
      assert.equal(f.calls.compose.length, 1)
      assert.deepEqual(f.document(), authored)
    } finally {
      release.resolve()
    }
  })
})

test('regional static batch admits the existing 32-job endpoint without truncation', async () => {
  await withFixture(async (f) => {
    const result = await queued(f, 32)
    assert.ok((await settled(f, result.jobIds)).every((job) => job.status === 'completed'))
    assert.equal((await rows(f)).length, 32)
    assert.equal(f.calls.compose.length, 1)
    assert.equal(f.counters.preparation, 1)
    assert.equal(f.consumed.length, 32)
    assert.deepEqual(
      f.consumed.map((input) => input.recipe.item.iteration),
      Array.from({ length: 32 }, (_, i) => i),
    )
    assert.deepEqual(
      f.consumed.map((input) => input.request.job.sampling.seed),
      Array.from({ length: 32 }, (_, i) => 123 + i),
    )
    assert.equal((await f.staging.listVerifiedCandidates(f.tabId)).length, 32)
  })
})

test('regional static batch refuses count33 before capture composition and durable publication', async () => {
  await withFixture(async (f) => {
    const original = structuredClone(f.document())
    const saved = await readFile(f.packagePath)
    await assert.rejects(f.actions.generate(f.tabId, request(f, 33)), {
      code: 'GENERATION_INVALID_REQUEST',
    })
    assert.equal(f.calls.compose.length, 0)
    assert.equal(f.calls.checkpoint, 0)
    assert.equal(f.counters.preparation, 0)
    assert.deepEqual(await rows(f), [])
    assert.deepEqual(await readdir(f.scratch), [])
    assert.deepEqual(f.document(), original)
    assert.ok((await readFile(f.packagePath)).equals(saved))
  })
})

test('regional static batch requires Euler-a capability while the Euler batch neighbor stays available', async () => {
  await withFixture(async (f) => {
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (cap) => cap !== 'illustrious-regional-invoke-init-v1',
    )
    await f.edit((document) => {
      document.generationDraft.sampling.sampler = 'Euler a'
    })
    await assert.rejects(f.actions.generate(f.tabId, request(f, 2)), {
      code: 'GENERATION_RUNTIME_UNAVAILABLE',
    })
    assert.equal(f.calls.compose.length, 0)
    assert.deepEqual(await rows(f), [])
    await f.edit((document) => {
      document.generationDraft.sampling.sampler = 'Euler'
    })
    const result = await queued(f, 2)
    assert.ok((await settled(f, result.jobIds)).every((job) => job.status === 'completed'))
    assert.ok(f.consumed.every((input) => !Object.hasOwn(input, 'initializationProfile')))
  })
})

test('regional static batch replacement excludes every new ID and retains old work until full admission', async () => {
  await withFixture(async (f) => {
    const first = await queued(f, 1)
    await settled(f, first.jobIds)
    const old = (await f.staging.listVerifiedCandidates(f.tabId))[0]
    const oldRows = await rows(f)
    const review = await confirmation(f, 2)
    assert.deepEqual(review.candidateIds, [old.candidateId])
    f.controls.beforePreparation = async () => {
      assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [old])
      assert.deepEqual(await rows(f), oldRows)
    }
    const replacement = await queued(f, 2, review)
    f.controls.beforePreparation = undefined
    assert.ok((await settled(f, replacement.jobIds)).every((job) => job.status === 'completed'))
    const stored = await rows(f)
    assert.equal(stored.find((row) => row.id === first.jobIds[0])?.status, 'completed')
    assert.equal(stored.length, 3)
    assert.deepEqual(
      (await f.staging.listVerifiedCandidates(f.tabId)).map((candidate) => candidate.queueItemId),
      replacement.jobIds,
    )
    assert.equal(f.consumed.length, 3)
  })
})

for (const failure of ['second-file', 'second-sql-row'] as const) {
  test(`regional static batch ${failure} refusal rolls back the whole new set and preserves prior results`, async () => {
    let armed = false
    let publications = 0
    await withFixture(
      async (f) => {
        const first = await queued(f, 1)
        await settled(f, first.jobIds)
        const old = (await f.staging.listVerifiedCandidates(f.tabId))[0]
        const before = await rows(f)
        const files = await readdir(path.join(f.root, 'generation-inputs'))
        const saved = await readFile(f.packagePath)
        const review = await confirmation(f, 2)
        if (failure === 'second-sql-row') {
          await sql`CREATE TRIGGER refuse_second_regional_batch_row BEFORE INSERT ON generation_queue_item
          WHEN (SELECT COUNT(*) FROM generation_queue_item WHERE staging_session_id=NEW.staging_session_id)=1
          BEGIN SELECT RAISE(ABORT,'second regional batch row refused'); END`.execute(f.db)
        }
        armed = true
        await assert.rejects(
          f.actions.generate(f.tabId, { ...request(f, 2), confirmation: review }),
          failure === 'second-file'
            ? /second regional file publication refused/
            : /second regional batch row refused/,
        )
        assert.deepEqual(await rows(f), before)
        assert.deepEqual(await readdir(path.join(f.root, 'generation-inputs')), files)
        assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [old])
        assert.equal(f.consumed.length, 1)
        assert.ok((await readFile(f.packagePath)).equals(saved))
        armed = false
        if (failure === 'second-sql-row') {
          await sql`DROP TRIGGER refuse_second_regional_batch_row`.execute(f.db)
        }
        const healthy = await queued(f, 2, review)
        assert.ok((await settled(f, healthy.jobIds)).every((job) => job.status === 'completed'))
      },
      {
        queueHooks: {
          afterInputPublish: async () => {
            if (armed && failure === 'second-file' && ++publications === 2) {
              throw new Error('second regional file publication refused')
            }
          },
        },
      },
    )
  })
}

test('regional static batch aggregate preflight refusal preserves the existing candidate and every input directory', async () => {
  await withFixture(async (f) => {
    const first = await queued(f, 1)
    await settled(f, first.jobIds)
    const old = (await f.staging.listVerifiedCandidates(f.tabId))[0]
    const before = await rows(f)
    const files = await readdir(path.join(f.root, 'generation-inputs'))
    const review = await confirmation(f, 2)
    const preflight = f.staging.preflightRegionalBatchCapacity.bind(f.staging)
    let calls = 0
    f.staging.preflightRegionalBatchCapacity = async (input) => {
      calls++
      assert.equal(input.entries.length, 2)
      assert.deepEqual(await rows(f), before)
      assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [old])
      await preflight(input)
      throw new Error('Controlled aggregate staging-capacity refusal')
    }
    try {
      await assert.rejects(
        f.actions.generate(f.tabId, { ...request(f, 2), confirmation: review }),
        /Controlled aggregate staging-capacity refusal/,
      )
      assert.equal(calls, 1)
      assert.deepEqual(await rows(f), before)
      assert.deepEqual(await readdir(path.join(f.root, 'generation-inputs')), files)
      assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [old])
    } finally {
      f.staging.preflightRegionalBatchCapacity = preflight
    }
    const healthy = await queued(f, 2, review)
    assert.ok((await settled(f, healthy.jobIds)).every((job) => job.status === 'completed'))
  })
})

test('regional static batch lost commit acknowledgement recognizes all exact committed rows', async () => {
  let commits = 0
  await withFixture(
    async (f) => {
      const result = await queued(f, 2)
      assert.ok((await settled(f, result.jobIds)).every((job) => job.status === 'completed'))
      assert.equal(commits, 1)
      assert.deepEqual(
        (await rows(f)).map((row) => row.id),
        result.jobIds,
      )
      assert.equal((await f.staging.listVerifiedCandidates(f.tabId)).length, 2)
      for (const id of result.jobIds) {
        assert.equal((await f.queue.loadVerifiedRegionalInput(id)).item.status, 'completed')
      }
    },
    {
      queueHooks: {
        afterBatchCommit: async () => {
          commits++
          throw new Error('Controlled batch commit acknowledgement loss')
        },
      },
    },
  )
})

for (const failure of ['runtime-release', 'capture-release'] as const) {
  test(`regional static batch late ${failure} failure cancels every newly admitted row before dispatch`, async () => {
    await withFixture(async (f) => {
      const capture = f.projects.withCapturedCurrentCanvasRegionalGenerationInput.bind(f.projects)
      const sentinel = new Error(`Controlled batch ${failure} failure`)
      if (failure === 'runtime-release') {
        f.controls.afterPreparation = async () => {
          throw sentinel
        }
      } else {
        f.projects.withCapturedCurrentCanvasRegionalGenerationInput = async (...args) => {
          await capture(...args)
          throw sentinel
        }
      }
      try {
        await assert.rejects(f.actions.generate(f.tabId, request(f, 3)), sentinel)
        const stored = await rows(f)
        assert.equal(stored.length, 3)
        assert.ok(stored.every((row) => row.status === 'canceled'))
        assert.equal(f.consumed.length, 0)
        assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [])
        for (const row of stored) {
          assert.equal((await f.queue.loadVerifiedRegionalInput(row.id)).item.status, 'canceled')
        }
      } finally {
        f.controls.afterPreparation = undefined
        f.projects.withCapturedCurrentCanvasRegionalGenerationInput = capture
      }
      const healthy = await queued(f, 2)
      assert.ok((await settled(f, healthy.jobIds)).every((job) => job.status === 'completed'))
    })
  })
}

test('regional static batch refuses a changed capture owner before composing any item', async () => {
  await withFixture(async (f) => {
    const before = structuredClone(f.document())
    f.controls.beforePreparation = async () => {
      await f.edit((document) => {
        document.regionalGuidance![0].name = 'Temporary owner change'
      })
      await f.projects.undo(f.tabId)
      assert.deepEqual(f.document(), before)
    }
    await assert.rejects(f.actions.generate(f.tabId, request(f, 2)), { code: 'PROJECT_CHANGED' })
    assert.equal(f.calls.compose.length, 0)
    assert.deepEqual(await rows(f), [])
    f.controls.beforePreparation = undefined
    const healthy = await queued(f, 2)
    assert.ok((await settled(f, healthy.jobIds)).every((job) => job.status === 'completed'))
  })
})

test('regional static batch Retry selects the failed second item after opposite saved authoring edits', async () => {
  await withFixture(async (f) => {
    await f.edit((document) => {
      document.generationDraft.sampling.sampler = 'Euler a'
    })
    f.controls.failSeeds.add(124)
    const result = await queued(f, 2)
    const done = await settled(f, result.jobIds)
    assert.deepEqual(
      done.map((job) => job.status),
      ['completed', 'failed'],
    )
    const firstCandidate = (await f.staging.listVerifiedCandidates(f.tabId))[0]
    assert.equal(firstCandidate.queueItemId, result.jobIds[0])
    const source = await f.queue.loadVerifiedRegionalInput(result.jobIds[1])
    assert.equal(source.input.recipe.item.seed, 124)
    assert.equal(source.input.recipe.item.iteration, 1)
    const originalRows = await rows(f)
    await f.edit((document) => {
      document.generationDraft.sampling.sampler = 'Euler'
      document.generationDraft.seed.value = 999
      document.generationDraft.positivePrompt.text = 'Later authoring is not the second item'
      document.regionalGuidance = []
    })
    await f.projects.save(f.tabId)
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (cap) => cap !== 'illustrious-regional-invoke-init-v1',
    )
    await assert.rejects(
      f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence }),
      { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
    )
    assert.deepEqual(await rows(f), originalRows)
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [firstCandidate])
    f.controls.ready = {
      ...f.controls.ready,
      capabilities: [...f.controls.ready.capabilities, 'illustrious-regional-invoke-init-v1'],
    }
    f.controls.failSeeds.clear()
    await f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence })
    const retry = (await rows(f)).find((row) => !result.jobIds.includes(row.id))
    assert.ok(retry)
    assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
    const restored = await f.queue.loadVerifiedRegionalInput(retry.id)
    assert.deepEqual(restored.payload, source.payload)
    assert.equal(f.consumed[2].request.job.sampling.seed, 124)
    assert.equal(f.consumed[2].initializationProfile, 'invoke-cpu-f32-add-noise-v1')
    assert.deepEqual(f.consumed[2].recipe, source.input.recipe)
    assert.equal(f.calls.compose.length, 1)
    assert.deepEqual(
      (await f.staging.listVerifiedCandidates(f.tabId)).map((candidate) => candidate.queueItemId),
      [firstCandidate.queueItemId, retry.id],
    )
  })
})

test('regional static batch bootstrap recovery retains independent per-item frozen recipes', async () => {
  await withFixture(async (f) => {
    await f.edit((document) => {
      document.generationDraft.sampling.sampler = 'Euler a'
    })
    const admitted = await f.gate.run(
      f.tabId,
      async () => await f.publicCoordinator.submitInvokeBatchUnderGate(f.tabId, submission(f, 2)),
    )
    assert.equal(admitted.length, 2)
    const original = await f.queue.loadVerifiedRegionalInput(admitted[1].id)
    const connection = openAppDatabase(f.root, path.resolve('src/main/db/migrations'))
    try {
      const recovered = new GenerationQueueRepository(connection.db, f.root)
      const outcome = await recovered.recoverAfterRestart()
      assert.equal(outcome.canceledCount, 2)
      for (const [index, item] of admitted.entries()) {
        const owned = await recovered.loadVerifiedRegionalInput(item.id)
        assert.equal(owned.item.status, 'canceled')
        assert.equal(owned.input.recipe.item.seed, 123 + index)
        assert.equal(owned.input.recipe.item.iteration, index)
        assert.equal(owned.input.initializationProfile, 'invoke-cpu-f32-add-noise-v1')
      }
      await f.edit((document) => {
        document.generationDraft.seed.value = 999
        document.regionalGuidance = []
      })
      const second = await recovered.getManagerEntry(admitted[1].id)
      const retried = await recovered.retryInvokeCanvasRegionalTerminal(
        second.id,
        second.statusSequence,
      )
      assert.deepEqual(
        (await recovered.loadVerifiedRegionalInput(retried.id)).payload,
        original.payload,
      )
      assert.equal(
        (await recovered.loadVerifiedRegionalInput(admitted[0].id)).item.status,
        'canceled',
      )
      assert.equal((await rows(f)).length, 3)
      assert.equal(f.consumed.length, 0, 'Bootstrap recovery does not automatically dispatch.')
    } finally {
      await connection.close()
    }
  })
})
