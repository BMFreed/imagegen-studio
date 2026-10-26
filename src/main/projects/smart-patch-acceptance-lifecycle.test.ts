import type { ProjectTab } from '../../shared/api.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { SmartPatchAcceptanceCancellationScope } from './generation-orchestrator.js'
import type {
  SmartPatchInferenceTransport,
  SmartPatchOutputWorkerOwner,
} from './smart-patch-generation-processor.js'

import { GenerationOrchestrator } from './generation-orchestrator.js'
import { GenerationProcessor } from './generation-processor.js'
import { ProjectAutosaveCoordinator, ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'
import { SmartPatchGenerationProcessor } from './smart-patch-generation-processor.js'
import { SmartPatchGenerationStagingRepository } from './smart-patch-generation-staging.js'
import { enqueueAnimaStagingBatch } from './test-fixtures/anima-staging.js'
import { OUTPAINT_READY } from './test-fixtures/outpaint-ready.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import {
  admitSmartPatch,
  type SmartPatchQueueFixture,
  withSmartPatchQueueFixture,
} from './test-fixtures/smart-patch-queue.js'
import { withSmartPatchWorldCandidateFixture } from './test-fixtures/smart-patch-world-candidate.js'
import { createSourceOutputWorkerOwner } from './test-fixtures/source-output-worker.js'

const ready = {
  ...OUTPAINT_READY,
  capabilities: [
    ...OUTPAINT_READY.capabilities,
    'illustrious-euler',
    'illustrious-noise-profile',
    'smart-patch-execution',
    'smart-patch-seed-confirmation',
  ],
  workerVersion: '0.14.0',
}
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const unavailableOutput: SmartPatchOutputWorkerOwner = {
  start: async () => {
    throw new Error('This cancellation case cannot start CPU composition')
  },
}
function scopeFor(
  f: SmartPatchQueueFixture,
  sessionId: string,
  ids: string[],
): SmartPatchAcceptanceCancellationScope {
  return {
    documentId: f.material.manifest.context.documentId,
    expectedUnfinishedJobIds: ids,
    layerId: f.material.manifest.context.layerId,
    projectPath: f.projectPath,
    stagingSessionIds: [sessionId],
    tabId: f.material.manifest.context.projectKey,
    verifiedCandidates: [],
  }
}
function queueScope(scope: SmartPatchAcceptanceCancellationScope) {
  return { ...scope, localProjectKey: scope.tabId }
}

/** Genuine document coordinator/queue; normal processor is real, with cancellation observed only. */
async function ownerFixture(f: SmartPatchQueueFixture) {
  const roots = {
    placeholdersDir: path.resolve('src/main/projects/placeholders'),
    scratchDir: f.scratch,
  }
  const owner = await ProjectAutosaveCoordinator.attach(
    await ProjectSession.open(f.projectPath, roots),
    roots,
    new ProjectShadowStore(path.join(f.root, 'autosave')),
    { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
  )
  const tabId = f.material.manifest.context.projectKey
  const normal = new GenerationProcessor(f.queue, f.staging, f.models, f.scratch)
  let normalCancellations = 0
  normal.cancelAndWait = async () => {
    normalCancellations++
    throw new Error('Smart Patch Add must never dispatch into the Raster processor')
  }
  const tab = (): ProjectTab => ({
    acceptedResults: [],
    autosaveError: null,
    canRedo: false,
    canUndo: false,
    dirty: owner.dirty,
    documentId: owner.document.documentId,
    documentRevision: owner.document.documentRevision,
    generationDraft: owner.document.generationDraft,
    id: tabId,
    lastActualSeedSnapshot: null,
    layers: [],
    primaryBbox: owner.document.primaryBbox,
    title: owner.document.title,
  })
  const orchestrator = new GenerationOrchestrator(
    {
      getOpenDocumentForAcceptance: (id) => (id === tabId ? owner : null),
      getOpenDocumentId: (id) => (id === tabId ? owner.document.documentId : null),
      getOpenTabs: () => [tab()],
      prepareNormalGenerationContext: async () => {
        throw new Error('Normal preparation is outside this lifecycle case')
      },
    },
    { getProject: async () => null },
    f.models,
    f.queue,
    f.staging,
    normal,
    f.scratch,
  )
  return { normalCancellations: () => normalCancellations, orchestrator, owner }
}

// Boundary: actual retained queue rows. Invariant: cancellation scope has one exact document and
// target, including terminal rows. Controls: the actual target session alone; mixed normal and
// other-target sessions are rejected. Mutation: filter unfinished rows before checking ownership.
for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} Smart acceptance sessions reject normal, foreign-target and foreign-document queue rows`, async () => {
    await withSmartPatchQueueFixture(family, async (f) => {
      const jobs = await admitSmartPatch(f)
      const scope = scopeFor(
        f,
        jobs[0].stagingSessionId,
        jobs.map(({ id }) => id),
      )
      assert.deepEqual(
        (await f.queue.listSmartPatchAcceptanceSessionJobs(queueScope(scope)))
          .map(({ id }) => id)
          .sort(),
        jobs.map(({ id }) => id).sort(),
      )
      const normal = await enqueueAnimaStagingBatch(f)
      await assert.rejects(
        f.queue.listSmartPatchAcceptanceSessionJobs(
          queueScope({
            ...scope,
            stagingSessionIds: [...scope.stagingSessionIds, normal.stagingSessionId],
          }),
        ),
        { code: 'QUEUE_INPUT_INVALID' },
      )
      for (const field of ['layerId', 'documentId'] as const) {
        const material = {
          files: Object.fromEntries(
            Object.entries(f.material.files).map(([name, bytes]) => [name, Buffer.from(bytes)]),
          ),
          manifest: structuredClone(f.material.manifest),
        }
        material.manifest.context[field] = randomUUID()
        const foreign = await admitSmartPatch(f, { material })
        await f.queue.cancel(foreign[0].id)
        await assert.rejects(
          f.queue.listSmartPatchAcceptanceSessionJobs(
            queueScope({
              ...scope,
              stagingSessionIds: [...scope.stagingSessionIds, foreign[0].stagingSessionId],
            }),
          ),
          { code: 'QUEUE_INPUT_INVALID' },
        )
        assert.equal((await f.queue.getManagerEntry(foreign[1].id)).status, 'pending')
      }
      assert.ok((await readFile(f.projectPath)).equals(f.originalProjectBytes))
    })
  })
}

// Boundary: independent durable receipt after real queue pruning. Invariant: the target cannot be
// inferred from a hash-only receipt; an exact qualified witness is required. Neighbor: same receipt
// plus correct witness. Mutations: skip receipts or trust session identity without frozen hash.
test('pruned Smart receipt requires the exact verified candidate witness and survives queue history cleanup', async () => {
  await withSmartPatchWorldCandidateFixture('illustrious', async (f) => {
    const candidate = await f.publish()
    await f.queue.cancel(f.siblingId)
    await f.queue.pruneTerminal(['completed', 'canceled'])
    const scope = scopeFor(f, candidate.stagingSessionId, [])
    await assert.rejects(f.queue.listSmartPatchAcceptanceSessionJobs(queueScope(scope)), {
      code: 'QUEUE_INPUT_INVALID',
    })
    scope.verifiedCandidates = [
      {
        candidateId: candidate.candidateId,
        frozenPayloadSha256: candidate.frozenPayloadSha256,
        stagingSessionId: candidate.stagingSessionId,
      },
    ]
    assert.deepEqual(await f.queue.listSmartPatchAcceptanceSessionJobs(queueScope(scope)), [])
    await assert.rejects(
      f.queue.listSmartPatchAcceptanceSessionJobs(
        queueScope({
          ...scope,
          verifiedCandidates: [
            { ...scope.verifiedCandidates[0], frozenPayloadSha256: '0'.repeat(64) },
          ],
        }),
      ),
      { code: 'QUEUE_INPUT_INVALID' },
    )
    assert.equal((await f.patch.listVerifiedCandidates(scope.tabId)).length, 1)
  })
})

test('a reviewed frozen job witness cannot substitute for a pruned completed candidate receipt witness', async () => {
  await withSmartPatchWorldCandidateFixture('illustrious', async (f) => {
    const candidate = await f.publish()
    await f.queue.cancel(f.siblingId)
    await f.queue.pruneTerminal(['completed', 'canceled'])
    const scope = scopeFor(f, candidate.stagingSessionId, [candidate.candidateId])
    scope.reviewedJobs = [
      {
        frozenPayloadSha256: candidate.frozenPayloadSha256,
        jobId: candidate.candidateId,
        stagingSessionId: candidate.stagingSessionId,
      },
    ]
    const { orchestrator, owner } = await ownerFixture(f)
    try {
      await orchestrator.fenceProjectGeneration(scope.tabId)
      await assert.rejects(orchestrator.cancelSmartPatchAcceptanceJobs(scope), {
        code: 'QUEUE_INPUT_INVALID',
      })
      assert.throws(() => orchestrator.releaseProjectGenerationFence(scope.tabId), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      await orchestrator.cancelSmartPatchAcceptanceJobs({
        ...scope,
        verifiedCandidates: [
          {
            candidateId: candidate.candidateId,
            frozenPayloadSha256: candidate.frozenPayloadSha256,
            stagingSessionId: candidate.stagingSessionId,
          },
        ],
      })
      orchestrator.releaseProjectGenerationFence(scope.tabId)
      assert.equal((await f.patch.listVerifiedCandidates(scope.tabId)).length, 1)
    } finally {
      await owner.close()
    }
  })
})

test('failed Smart cancellation permits only qualification-witness extension for the same reviewed job scope', async () => {
  await withSmartPatchWorldCandidateFixture('illustrious', async (f) => {
    const candidate = await f.publish()
    await f.queue.pruneTerminal(['completed'])
    const scope = scopeFor(f, candidate.stagingSessionId, [f.siblingId])
    const { normalCancellations, orchestrator, owner } = await ownerFixture(f)
    try {
      await orchestrator.fenceProjectGeneration(scope.tabId)
      await assert.rejects(orchestrator.cancelSmartPatchAcceptanceJobs(scope), {
        code: 'QUEUE_INPUT_INVALID',
      })
      assert.throws(() => orchestrator.releaseProjectGenerationFence(scope.tabId), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      const extended = {
        ...scope,
        verifiedCandidates: [
          {
            candidateId: candidate.candidateId,
            frozenPayloadSha256: candidate.frozenPayloadSha256,
            stagingSessionId: candidate.stagingSessionId,
          },
        ],
      }
      await assert.rejects(
        orchestrator.cancelSmartPatchAcceptanceJobs({ ...extended, expectedUnfinishedJobIds: [] }),
        { code: 'CANCELLATION_UNCERTAIN' },
      )
      await orchestrator.cancelSmartPatchAcceptanceJobs(extended)
      assert.equal((await f.queue.getManagerEntry(f.siblingId)).status, 'canceled')
      assert.equal((await f.patch.listVerifiedCandidates(scope.tabId)).length, 1)
      assert.equal(normalCancellations(), 0)
      orchestrator.releaseProjectGenerationFence(scope.tabId)
    } finally {
      await owner.close()
    }
  })
})

test('receipt ownership is checked against retained queue rows even across SQL session chunks', async () => {
  await withSmartPatchWorldCandidateFixture('illustrious', async (f) => {
    const candidate = await f.publish()
    const laterSession = randomUUID()
    const scope = scopeFor(f, candidate.stagingSessionId, [f.siblingId])
    scope.stagingSessionIds = [
      candidate.stagingSessionId,
      ...Array.from({ length: 399 }, () => randomUUID()),
      laterSession,
    ]
    scope.verifiedCandidates = [
      {
        candidateId: candidate.candidateId,
        frozenPayloadSha256: candidate.frozenPayloadSha256,
        stagingSessionId: candidate.stagingSessionId,
      },
    ]
    assert.deepEqual(
      (await f.queue.listSmartPatchAcceptanceSessionJobs(queueScope(scope))).map(({ id }) => id),
      [f.siblingId],
    )
    await f.database.db
      .updateTable('generation_queue_item')
      .set({ staging_session_id: laterSession })
      .where('id', '=', candidate.candidateId)
      .execute()
    await assert.rejects(f.queue.listSmartPatchAcceptanceSessionJobs(queueScope(scope)), {
      code: 'QUEUE_INPUT_INVALID',
    })
    assert.equal((await f.queue.getManagerEntry(f.siblingId)).status, 'pending')
  })
})

// Boundary: real Orchestrator fence/cancel and actual pending queue. Invariant: exact scoped jobs
// terminalize without normal processor calls, detached from caller mutation. Neighbor: another
// session remains pending. Mutation: reuse mutable caller IDs or route through normal processor.
test('private Smart cancellation snapshots its exact pending scope and leaves other sessions untouched', async () => {
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    const target = await admitSmartPatch(f)
    const neighbor = await admitSmartPatch(f)
    const scope = scopeFor(
      f,
      target[0].stagingSessionId,
      target.map(({ id }) => id),
    )
    const { normalCancellations, orchestrator, owner } = await ownerFixture(f)
    const original = f.queue.listSmartPatchAcceptanceSessionJobs.bind(f.queue)
    const entered = deferred()
    const release = deferred()
    let held = false
    f.queue.listSmartPatchAcceptanceSessionJobs = async (input) => {
      if (!held) {
        held = true
        entered.resolve()
        await release.promise
      }
      return original(input)
    }
    try {
      await assert.rejects(orchestrator.cancelSmartPatchAcceptanceJobs(scope), {
        code: 'PROJECT_NOT_FENCED',
      })
      await orchestrator.fenceProjectGeneration(scope.tabId)
      const cancel = orchestrator.cancelSmartPatchAcceptanceJobs(scope)
      await entered.promise
      scope.expectedUnfinishedJobIds = []
      scope.stagingSessionIds = [neighbor[0].stagingSessionId]
      release.resolve()
      await cancel
      for (const job of target) {
        assert.equal((await f.queue.getManagerEntry(job.id)).status, 'canceled')
      }
      for (const job of neighbor) {
        assert.equal((await f.queue.getManagerEntry(job.id)).status, 'pending')
      }
      assert.equal(normalCancellations(), 0)
      orchestrator.releaseProjectGenerationFence(scope.tabId)
      f.queue.assertProjectCanEnqueue(scope.tabId)
      assert.ok((await readFile(f.projectPath)).equals(f.originalProjectBytes))
    } finally {
      release.resolve()
      await owner.close()
    }
  })
})

// Boundary: unknown real running SQL claim. Invariant: without an actual registered owner no ACK,
// scratch cleanup or fence release may be invented. Neighbor: the real fixture claim owner explicitly
// ACKs after confirming it never started a worker, then retry drains successfully.
test('unknown running Smart owner retains cancellation fence and SQL slot until explicit owner acknowledgement', async () => {
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    const jobs = await admitSmartPatch(f)
    const claimed = await f.queue.claimNextPendingSmartPatch()
    assert.ok(claimed)
    const scope = scopeFor(
      f,
      jobs[0].stagingSessionId,
      jobs.map(({ id }) => id),
    )
    const { normalCancellations, orchestrator, owner } = await ownerFixture(f)
    try {
      await orchestrator.fenceProjectGeneration(scope.tabId)
      await assert.rejects(orchestrator.cancelSmartPatchAcceptanceJobs(scope), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      const running = await f.queue.getManagerEntry(claimed.item.id)
      assert.equal(running.status, 'running')
      assert.equal(running.cancelRequested, true)
      assert.throws(() => orchestrator.releaseProjectGenerationFence(scope.tabId), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      await f.queue.acknowledgeCanceledRunning(running.id, running.statusSequence)
      await orchestrator.cancelSmartPatchAcceptanceJobs(scope)
      for (const item of jobs) {
        assert.equal((await f.queue.getManagerEntry(item.id)).status, 'canceled')
      }
      assert.equal(normalCancellations(), 0)
      orchestrator.releaseProjectGenerationFence(scope.tabId)
    } finally {
      await owner.close()
    }
  })
})

test('registered Smart cancellation drains held inference, retains an uncertain exit and remains reusable after retry', async () => {
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    const jobs = await admitSmartPatch(f)
    const { normalCancellations, orchestrator, owner } = await ownerFixture(f)
    const staging = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
    await staging.recoverAfterRestart()
    const handle = orchestrator.createSmartPatchExecution(staging, unavailableOutput)
    const closed = deferred()
    const entered = deferred()
    const release = deferred()
    let allowExit = false
    const transport: SmartPatchInferenceTransport = {
      close: async () => {
        if (!allowExit) {
          throw Object.assign(new Error('Declared physical exit uncertainty'), {
            code: 'WORKER_EXIT_UNCONFIRMED',
          })
        }
        closed.resolve()
      },
      executeSmartPatch: async () => {
        entered.resolve()
        await release.promise
        throw new Error('Declared inference ended after cancellation')
      },
      ready,
    }
    const run = handle.runNext(transport)
    try {
      await entered.promise
      const scope = scopeFor(
        f,
        jobs[0].stagingSessionId,
        jobs.map(({ id }) => id),
      )
      await orchestrator.fenceProjectGeneration(scope.tabId)
      await assert.rejects(orchestrator.cancelSmartPatchAcceptanceJobs(scope), {
        code: 'WORKER_EXIT_UNCONFIRMED',
      })
      assert.throws(() => orchestrator.releaseProjectGenerationFence(scope.tabId), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      allowExit = true
      let settled = false
      const retry = orchestrator.cancelSmartPatchAcceptanceJobs(scope).then(() => {
        settled = true
      })
      await closed.promise
      assert.equal(settled, false, 'Exit alone cannot bypass the held admitted inference work')
      assert.equal((await f.queue.getManagerEntry(jobs[0].id)).status, 'running')
      release.resolve()
      await retry
      assert.equal((await run).kind, 'canceled')
      assert.equal(normalCancellations(), 0)
      assert.deepEqual(await staging.listVerifiedCandidates(scope.tabId), [])
      orchestrator.releaseProjectGenerationFence(scope.tabId)
      assert.equal(
        (await handle.runNext(transport)).kind,
        'idle',
        'Add cancellation must not permanently stop the owner',
      )
    } finally {
      allowExit = true
      release.resolve()
      await run.catch(() => undefined)
      await handle.stopAndCancelActive()
      await owner.close()
    }
  })
})

test('Smart scoped quiescence joins claim startup while the synchronous fence prevents a late dispatch', async () => {
  const entered = deferred()
  const release = deferred()
  await withSmartPatchQueueFixture(
    'illustrious',
    async (f) => {
      const jobs = await admitSmartPatch(f)
      const { normalCancellations, orchestrator, owner } = await ownerFixture(f)
      const staging = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
      await staging.recoverAfterRestart()
      const handle = orchestrator.createSmartPatchExecution(staging, unavailableOutput)
      let executions = 0
      let quiescent = false
      const run = handle.runNext({
        close: async () => undefined,
        executeSmartPatch: async () => {
          executions++
          throw new Error('Fenced claim must not execute')
        },
        ready,
      })
      try {
        await entered.promise
        const drain = handle
          .quiesceForProject({
            localProjectKey: jobs[0].localProjectKey,
            stagingSessionIds: [jobs[0].stagingSessionId],
          })
          .then(() => {
            quiescent = true
          })
        await orchestrator.fenceProjectGeneration(jobs[0].localProjectKey)
        assert.equal(
          quiescent,
          false,
          'The independent fence cannot make an admitted held claim disappear',
        )
        release.resolve()
        await drain
        assert.equal((await run).kind, 'idle')
        await orchestrator.cancelSmartPatchAcceptanceJobs(
          scopeFor(
            f,
            jobs[0].stagingSessionId,
            jobs.map(({ id }) => id),
          ),
        )
        assert.equal(executions, 0)
        assert.equal(normalCancellations(), 0)
        orchestrator.releaseProjectGenerationFence(jobs[0].localProjectKey)
      } finally {
        release.resolve()
        await run.catch(() => undefined)
        await handle.stopAndCancelActive()
        await owner.close()
      }
    },
    {
      beforeClaimUpdate: async () => {
        entered.resolve()
        await release.promise
      },
    },
  )
})

test('Smart Add drains an already completed SQL job while the actual CPU candidate publication is still admitted', async () => {
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    const cpu = await createSourceOutputWorkerOwner(f)
    const drainEntered = deferred()
    const entered = deferred()
    const release = deferred()
    const staging = new SmartPatchGenerationStagingRepository(f.database.db, f.root, {
      afterCompletionCommit: async () => {
        entered.resolve()
        await release.promise
      },
    })
    await staging.recoverAfterRestart()
    const jobs = await admitSmartPatch(f, {
      material: {
        ...f.material,
        manifest: { ...f.material.manifest, items: [f.material.manifest.items[0]] },
      },
    })
    const { normalCancellations, orchestrator, owner } = await ownerFixture(f)
    const handle = orchestrator.createSmartPatchExecution(staging, cpu)
    let publicationReleased = false
    let drainReturnedBeforeRelease = false
    const originalDrain = SmartPatchGenerationProcessor.prototype.quiesceForProject
    SmartPatchGenerationProcessor.prototype.quiesceForProject = function (scope) {
      // Register the return observer before waking the caller. A broken immediately resolved
      // drain must be observed while publication is still held, independent of timer delays.
      const draining = originalDrain.call(this, scope).then(() => {
        if (!publicationReleased) {
          drainReturnedBeforeRelease = true
        }
      })
      drainEntered.resolve()
      return draining
    }
    const run = handle.runNext({
      close: async () => undefined,
      executeSmartPatch: async (request) => {
        const { height, width } = request.internalResolution
        const bytes = literalSmartPatchColorPng(
          width,
          height,
          Array.from({ length: width * height }, () => [23, 47, 91]).flat(),
          3,
        )
        await writeFile(request.output.pngPath, bytes, { flag: 'wx', mode: 0o600 })
        return {
          actualSeed: request.inference.sampling.seed,
          output: {
            byteSize: bytes.length,
            colorSpace: 'srgb',
            height,
            iccSha256: IGS_SRGB_ICC_SHA256,
            path: request.output.pngPath,
            sha256: digest(bytes),
            width,
          },
        }
      },
      ready,
    })
    try {
      await entered.promise
      assert.equal((await f.queue.getManagerEntry(jobs[0].id)).status, 'completed')
      const cpuPid = await cpu.pid()
      assert.throws(() => process.kill(cpuPid, 0), { code: 'ESRCH' })
      await orchestrator.fenceProjectGeneration(jobs[0].localProjectKey)
      let settled = false
      const cancel = orchestrator
        .cancelSmartPatchAcceptanceJobs(scopeFor(f, jobs[0].stagingSessionId, []))
        .then(() => {
          settled = true
        })
      await drainEntered.promise
      assert.equal(settled, false)
      assert.throws(() => orchestrator.releaseProjectGenerationFence(jobs[0].localProjectKey), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      publicationReleased = true
      release.resolve()
      await cancel
      assert.equal(
        drainReturnedBeforeRelease,
        false,
        'Quiescence must join the admitted publication writer.',
      )
      assert.equal((await run).kind, 'completed')
      assert.equal(
        (await staging.listVerifiedCandidates(jobs[0].localProjectKey)).length,
        1,
        'Lifecycle draining alone cannot discard the newly completed candidate',
      )
      assert.equal(normalCancellations(), 0)
      orchestrator.releaseProjectGenerationFence(jobs[0].localProjectKey)
    } finally {
      SmartPatchGenerationProcessor.prototype.quiesceForProject = originalDrain
      release.resolve()
      await run.catch(() => undefined)
      await handle.stopAndCancelActive()
      await cpu.cleanup()
      await owner.close()
    }
  })
})
