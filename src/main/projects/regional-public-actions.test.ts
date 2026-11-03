import type { ProjectGenerateOptions } from '../../shared/projects/project-generation-actions.js'

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'

import type { RegionalWorkerInput } from './regional-worker-request.js'
import type { RegionalProjectFixture } from './test-fixtures/regional-project.js'

import {
  ProjectGenerationActionController,
  toProjectGenerationActionApiError,
} from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import {
  ProjectRegionalGenerationCoordinator,
  ProjectRegionalGenerationError,
} from './project-regional-generation-coordinator.js'
import {
  createRegionalProjectFixture,
  regionalProjectDeferred,
} from './test-fixtures/regional-project.js'

type ActionRuntime = ConstructorParameters<typeof ProjectGenerationActionController>[0]['runtime']
type WorkerRuntime = ConstructorParameters<typeof GenerationDispatchCoordinator>[0]
type Fixture = Awaited<ReturnType<typeof publicActionsFixture>>

/**
 * Real public controller/capture/queue/dispatch/staging; only runtime/model/PNG computation is
 * controlled.
 */
async function publicActionsFixture() {
  const f = await createRegionalProjectFixture()
  const coordinator = new ProjectRegionalGenerationCoordinator({
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
    failInference?: boolean
    ready: ReturnType<RegionalProjectFixture['input']>['ready']
  } = {
    ready: {
      ...f.input().ready,
      capabilities: [...f.input().ready.capabilities, 'illustrious-regional-invoke-v1'],
    },
  }
  const consumed: RegionalWorkerInput[] = []
  const counters = { admission: 0, preparation: 0, worker: 0 }
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
            consumed.push(structuredClone(input))
            if (controls.failInference) {
              throw new Error('Controlled first regional inference refusal')
            }
            return f.resultFor(input)
          },
          ready: structuredClone(controls.ready),
        }),
        generate: async () => assert.fail('Public regional work cannot enter the ordinary worker.'),
      })
    },
  }
  const dispatch = new GenerationDispatchCoordinator(
    runtime,
    f.orchestrator,
    f.processor,
    f.scratch,
    undefined,
    coordinator,
  )
  const actions = new ProjectGenerationActionController({
    dispatch,
    gate: f.gate,
    models: f.models,
    orchestrator: f.orchestrator,
    processor: f.processor,
    projects: f.projects,
    queue: f.queue,
    regional: coordinator,
    runtime,
    scratchBasePath: f.scratch,
    staging: f.staging,
  })
  return { ...f, actions, consumed, controls, counters, publicCoordinator: coordinator }
}

async function withActions(use: (f: Fixture) => Promise<void>) {
  const f = await publicActionsFixture()
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

const options = (f: Fixture): ProjectGenerateOptions => ({
  documentId: f.document().documentId,
  iterations: 1,
})

async function rows(f: Fixture) {
  return await f.db.selectFrom('generation_queue_item').selectAll().orderBy('created_at').execute()
}

async function queued(f: Fixture, request = options(f)) {
  const result = await f.actions.generate(f.tabId, request)
  assert.equal(result.kind, 'queued')
  if (result.kind !== 'queued') {
    assert.fail('Expected one reviewed public job.')
  }
  assert.equal(result.jobIds.length, 1)
  return result.jobIds[0]
}

/**
 * Completion is evidenced by the exact durable job and the controller's settled drain, never
 * elapsed sleep.
 */
async function settled(f: Fixture, id: string) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const job = await f.queue.getManagerEntry(id)
    const state = await f.actions.getState(f.tabId)
    if (['canceled', 'completed', 'failed'].includes(job.status) && state.phase === 'idle') {
      return job
    }
    if (state.phase === 'blocked') {
      assert.fail(`Public dispatch blocked: ${state.error?.code}: ${state.error?.message}`)
    }
    await setImmediate()
  }
  assert.fail('The exact public job did not settle before the bounded test deadline.')
}

test('public Generate derives the captured regional job and automatic dispatch consumes only its new operation', async () => {
  await withActions(async (f) => {
    const saved = await readFile(f.packagePath)
    const original = structuredClone(f.document())
    const privateJob = await f.coordinator.submit(f.tabId, f.input())
    const id = await queued(f)
    assert.equal((await settled(f, id)).status, 'completed')
    assert.equal(f.consumed.length, 1)
    const input = f.consumed[0]
    assert.equal(input.compositionProfile, 'invoke-canvas-v1')
    assert.equal(input.recipe.globalPrompts.positive.text, 'global positive')
    assert.equal(input.recipe.regions[0].positive?.text, 'regional subject')
    assert.ok(Buffer.from(input.recipe.regions[0].coverage.alpha).equals(Buffer.from(f.alpha)))
    assert.equal(input.request.job.sampling.seed, 123)
    const publicJob = await f.queue.getManagerEntry(id)
    assert.equal(publicJob.operation, 'illustrious-regional-txt2img')
    const privateAfter = await f.queue.getRegionalQueueItem(privateJob.id)
    assert.equal(privateAfter?.status, 'pending', 'Automatic dispatch cannot promote private work')
    assert.equal(await f.queue.claimNextPending(), null)
    assert.equal(await f.queue.claimNextPendingInvokeCanvasRegional(), null)
    assert.deepEqual(
      (await f.actions.getQueue()).items.map(({ id }) => id),
      [id],
    )
    assert.equal((await f.staging.listVerifiedCandidates(f.tabId)).length, 1)
    assert.equal((await f.staging.listVerifiedRegionalCandidates(f.tabId)).length, 0)
    assert.deepEqual(f.document(), original)
    assert.ok((await readFile(f.packagePath)).equals(saved), 'Completion cannot implicitly Save')
    assert.equal((await f.actions.getState(f.tabId)).regionalSupported, true)
  })
})

test('replacement confirmation preserves old candidate through unqualified runtime refusal and discards only after new admission', async () => {
  await withActions(async (f) => {
    const originalId = await queued(f)
    await settled(f, originalId)
    const original = (await f.staging.listVerifiedCandidates(f.tabId))[0]
    const beforeRows = await rows(f)
    const beforeCompose = f.calls.compose.length
    const review = await f.actions.generate(f.tabId, options(f))
    assert.equal(review.kind, 'confirmation-required')
    if (review.kind !== 'confirmation-required') {
      assert.fail('Expected exact candidate confirmation.')
    }
    assert.deepEqual(review.candidateIds, [original.candidateId])
    assert.equal(f.calls.compose.length, beforeCompose)
    const request = {
      ...options(f),
      confirmation: {
        candidateIds: review.candidateIds,
        unfinishedJobIds: review.unfinishedJobIds,
      },
    }
    const capable = structuredClone(f.controls.ready)
    f.controls.ready.capabilities = capable.capabilities.filter(
      (cap) => cap !== 'illustrious-regional-invoke-v1',
    )
    await assert.rejects(f.actions.generate(f.tabId, request), {
      code: 'GENERATION_RUNTIME_UNAVAILABLE',
    })
    assert.equal(
      f.calls.compose.length,
      beforeCompose,
      'Capability refusal precedes target composition',
    )
    assert.deepEqual(await rows(f), beforeRows)
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [original])
    f.controls.ready = capable
    f.controls.beforePreparation = async () => {
      assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [original])
      assert.deepEqual(await rows(f), beforeRows)
    }
    const nextId = await queued(f, request)
    f.controls.beforePreparation = undefined
    assert.equal((await settled(f, nextId)).status, 'completed')
    const candidates = await f.staging.listVerifiedCandidates(f.tabId)
    assert.deepEqual(
      candidates.map(({ queueItemId }) => queueItemId),
      [nextId],
    )
    assert.equal(f.consumed.length, 2)
  })
})

for (const change of ['revision', 'epoch-ABA'] as const) {
  test(`public runtime acquisition refuses a ${change} Project change before target or SQL publication`, async () => {
    await withActions(async (f) => {
      const original = structuredClone(f.document())
      const beforeEpoch = f.projects.getOpenDocumentForAcceptance(f.tabId)!.documentEpoch
      f.controls.beforePreparation = async () => {
        await f.edit((document) => {
          document.regionalGuidance![0].name = 'Changed while runtime acquired'
        })
        if (change === 'epoch-ABA') {
          await f.projects.getOpenDocumentForAcceptance(f.tabId)!.undo()
          assert.deepEqual(f.document(), original)
          assert.notEqual(
            f.projects.getOpenDocumentForAcceptance(f.tabId)!.documentEpoch,
            beforeEpoch,
          )
        }
      }
      await assert.rejects(f.actions.generate(f.tabId, options(f)), { code: 'PROJECT_CHANGED' })
      assert.equal(f.calls.compose.length, 0)
      assert.deepEqual(await rows(f), [])
      assert.equal(f.consumed.length, 0)
      f.controls.beforePreparation = undefined
      assert.equal(
        (await settled(f, await queued(f))).status,
        'completed',
        'Current-owner neighbor remains valid',
      )
    })
  })
}

test('late preparation failure cancels the newly admitted public job before dispatch and retains frozen input', async () => {
  await withActions(async (f) => {
    f.controls.afterPreparation = async () => {
      throw new Error('Controlled runtime exit after public admission')
    }
    await assert.rejects(f.actions.generate(f.tabId, options(f)), /Controlled runtime exit/)
    const published = await rows(f)
    assert.equal(published.length, 1)
    assert.equal(published[0].operation, 'illustrious-regional-txt2img')
    assert.equal(published[0].status, 'canceled')
    assert.equal(f.consumed.length, 0)
    assert.equal(
      (await f.queue.loadVerifiedRegionalInput(published[0].id)).input.compositionProfile,
      'invoke-canvas-v1',
    )
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [])
    f.controls.afterPreparation = undefined
    assert.equal((await settled(f, await queued(f))).status, 'completed')
  })
})

test('public Retry uses the frozen operation and complete saved inputs after current authoring changes', async () => {
  await withActions(async (f) => {
    f.controls.failInference = true
    const sourceId = await queued(f)
    const source = await settled(f, sourceId)
    assert.equal(source.status, 'failed')
    const original = await f.queue.loadVerifiedRegionalInput(sourceId)
    const originalInput = f.consumed[0]
    await f.edit((document) => {
      document.regionalGuidance = []
      document.generationDraft.positivePrompt.text = 'Current authored prompt must not enter Retry'
      document.generationDraft.seed.value = 999
    })
    await f.projects.save(f.tabId)
    f.controls.failInference = false
    await f.actions.retryJob({ id: sourceId, statusSequence: source.statusSequence })
    const newRows = await rows(f)
    const retry = newRows.find(({ id }) => id !== sourceId)
    assert.ok(retry)
    assert.equal((await settled(f, retry.id)).status, 'completed')
    assert.equal(retry.operation, 'illustrious-regional-txt2img')
    assert.deepEqual((await f.queue.loadVerifiedRegionalInput(retry.id)).payload, original.payload)
    assert.deepEqual(f.consumed[1].recipe, originalInput.recipe)
    assert.equal(f.consumed[1].request.job.sampling.seed, 123)
    assert.equal(f.consumed[1].compositionProfile, 'invoke-canvas-v1')
    assert.equal(f.calls.compose.length, 1, 'Retry never recomposes current authoring')
    assert.equal(
      f.document().generationDraft.positivePrompt.text,
      'Current authored prompt must not enter Retry',
    )
  })
})

test('public cancel/delete guards reject hidden private identities while ordinary reviewed public controls succeed', async () => {
  await withActions(async (f) => {
    const legacy = await f.coordinator.submit(f.tabId, f.input())
    const before = await f.queue.getRegionalQueueItem(legacy.id)
    assert.ok(before)
    await assert.rejects(
      f.actions.cancelJob({ id: legacy.id, statusSequence: before.statusSequence }),
      { code: 'QUEUE_ITEM_NOT_FOUND' },
    )
    assert.deepEqual(await f.queue.getRegionalQueueItem(legacy.id), before)
    const canceledLegacy = await f.queue.cancel(legacy.id, before.statusSequence)
    await assert.rejects(
      f.actions.deleteJob({ id: legacy.id, statusSequence: canceledLegacy.statusSequence }),
      { code: 'QUEUE_ITEM_NOT_FOUND' },
    )
    assert.deepEqual(await f.queue.getRegionalQueueItem(legacy.id), canceledLegacy)
    const entered = regionalProjectDeferred()
    const release = regionalProjectDeferred()
    f.controls.beforeWorker = async () => {
      entered.resolve()
      await release.promise
    }
    try {
      const id = await queued(f)
      await entered.promise
      const publicJob = await f.queue.getManagerEntry(id)
      assert.equal(publicJob.status, 'pending')
      await f.actions.cancelJob({ id, statusSequence: publicJob.statusSequence })
      release.resolve()
      const canceled = await settled(f, id)
      assert.equal(canceled.status, 'canceled')
      assert.equal(f.consumed.length, 0)
      await f.actions.deleteJob({ id, statusSequence: canceled.statusSequence })
      await assert.rejects(f.queue.getManagerEntry(id), { code: 'QUEUE_ITEM_NOT_FOUND' })
      assert.ok(await f.queue.getRegionalQueueItem(legacy.id))
    } finally {
      release.resolve()
    }
  })
})

test('public regional owned refusals retain actionable renderer diagnostics without projecting arbitrary errors', () => {
  const mapping = {
    CLOSED: 'GENERATION_CLOSED',
    INFERENCE_UNAVAILABLE: 'GENERATION_RUNTIME_UNAVAILABLE',
    INPUT_INVALID: 'GENERATION_INVALID_REQUEST',
    PROJECT_CHANGED: 'GENERATION_DOCUMENT_CHANGED',
    UNSUPPORTED: 'GENERATION_REGIONAL_GUIDANCE_UNSUPPORTED',
  } as const
  for (const code of Object.keys(mapping) as (keyof typeof mapping)[]) {
    assert.deepEqual(
      toProjectGenerationActionApiError(
        new ProjectRegionalGenerationError(code, 'Literal owned diagnostic.'),
      ),
      {
        code: mapping[code],
        message: 'Literal owned diagnostic.',
      },
    )
  }
  assert.equal(
    toProjectGenerationActionApiError(
      Object.assign(new Error('/private/unknown'), { code: 'UNSUPPORTED' }),
    ).message,
    'Generation could not continue. Review the settings and try again.',
  )
})
