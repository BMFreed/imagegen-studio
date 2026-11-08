import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type {
  OperationalRegionalWorkerInput,
  RegionalWorkerResult,
} from './regional-worker-request.js'
import type { RegionalQueueFixture } from './test-fixtures/regional-queue.js'

import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { ProjectGenerationStagingLifecycle } from './project-generation-staging-lifecycle.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { RegionalGenerationProcessor } from './regional-generation-processor.js'
import { SmartPatchGenerationStagingRepository } from './smart-patch-generation-staging.js'
import {
  createRegionalQueueFixture,
  enqueueRegionalFixture,
  REGIONAL_QUEUE_READY,
  regionalFixtureSha256,
} from './test-fixtures/regional-queue.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}

function resultFor(
  f: RegionalQueueFixture,
  input: OperationalRegionalWorkerInput,
): RegionalWorkerResult {
  assert.ok(input.compositionProfile !== 'invoke-krea2-global-support-v1')
  return {
    output: {
      byteSize: f.outputBytes.length,
      colorSpace: 'srgb',
      height: input.request.job.bbox.height,
      iccSha256: IGS_SRGB_ICC_SHA256,
      path: path.join(f.root, 'already-disposed-output.png'),
      sha256: regionalFixtureSha256(f.outputBytes),
      width: input.request.job.bbox.width,
    },
    pngBytes: Buffer.from(f.outputBytes),
    seed: input.request.job.sampling.seed,
  }
}

async function publishRegional(f: RegionalQueueFixture) {
  const item = await enqueueRegionalFixture(f)
  const claimed = await f.queue.claimNextPendingRegional()
  assert.equal(claimed?.item.id, item.id)
  assert.ok(claimed)
  return await f.staging.publishRegionalCandidate({
    actualSeed: f.prepared.context.sampling.seed,
    expectedStatusSequence: claimed.item.statusSequence,
    pngBytes: f.outputBytes,
    queueItemId: item.id,
  })
}

async function enqueueNormal(f: RegionalQueueFixture) {
  return await f.queue.enqueueIllustriousGeneration({
    prepared: f.prepared,
    projectPath: f.projectPath,
    request: f.request,
    stagingSessionId: randomUUID(),
  })
}

test('regional lifecycle metadata survives corrupt frozen input and leaves public manager routing closed', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const regional = await enqueueRegionalFixture(f)
    const normal = await enqueueNormal(f)
    await f.db
      .updateTable('generation_queue_item')
      .set({ frozen_payload_json: 'invalid frozen payload' })
      .where('id', '=', regional.id)
      .execute()
    await rm(path.join(f.root, 'generation-inputs', regional.id), { recursive: true })
    const metadata = await f.queue.getRegionalQueueItem(regional.id)
    assert.deepEqual(metadata, regional)
    assert.ok(metadata)
    metadata.stagingSessionId = randomUUID()
    assert.deepEqual(await f.queue.getRegionalQueueItem(regional.id), regional)
    assert.equal(await f.queue.getRegionalQueueItem(normal.id), null)
    assert.equal(await f.queue.getRegionalQueueItem(randomUUID()), null)
    await assert.rejects(f.queue.getManagerEntry(regional.id), { code: 'QUEUE_ITEM_NOT_FOUND' })
    assert.equal((await f.queue.getManagerEntry(normal.id)).id, normal.id)
    await assert.rejects(f.queue.loadVerifiedRegionalInput(regional.id), {
      code: 'QUEUE_INPUT_INVALID',
    })
  } finally {
    await f.close()
  }
})

test('regional capacity preflight sees immutable frozen identity and refuses before files or SQL publication', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const before = await readdir(path.join(f.root, 'generation-inputs'))
    let calls = 0
    await assert.rejects(
      f.queue.enqueueCurrentCanvasRegional({
        preflight: async (entries) => {
          calls++
          assert.equal(entries.length, 1)
          assert.equal(Object.isFrozen(entries), true)
          assert.equal(Object.isFrozen(entries[0]), true)
          assert.equal(JSON.parse(entries[0].frozenPayloadJson).kind, 'illustrious-regional')
          assert.equal(
            await f.db
              .selectFrom('generation_queue_item')
              .select('id')
              .where('id', '=', entries[0].queueItemId)
              .executeTakeFirst(),
            undefined,
          )
          throw new Error('explicit capacity refusal')
        },
        prepared: f.prepared,
        projectPath: f.projectPath,
        regional: f.regional,
        request: f.request,
        stagingSessionId: randomUUID(),
      }),
      /explicit capacity refusal/,
    )
    assert.equal(calls, 1)
    assert.deepEqual(await readdir(path.join(f.root, 'generation-inputs')), before)
    assert.deepEqual(await f.db.selectFrom('generation_queue_item').selectAll().execute(), [])
    assert.deepEqual(
      await f.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
      [],
    )
    assert.equal((await enqueueNormal(f)).status, 'pending')
  } finally {
    await f.close()
  }
})

test('regional admission rechecks its Project fence after asynchronous capacity preflight', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const before = await readdir(path.join(f.root, 'generation-inputs'))
    const localProjectKey = localProjectRecoveryKey(f.projectPath)
    await assert.rejects(
      f.queue.enqueueCurrentCanvasRegional({
        preflight: async () => {
          f.queue.fenceProject(localProjectKey)
        },
        prepared: f.prepared,
        projectPath: f.projectPath,
        regional: f.regional,
        request: f.request,
        stagingSessionId: randomUUID(),
      }),
      { code: 'QUEUE_PROJECT_CLOSING' },
    )
    assert.deepEqual(await readdir(path.join(f.root, 'generation-inputs')), before)
    assert.deepEqual(await f.db.selectFrom('generation_queue_item').selectAll().execute(), [])
  } finally {
    await f.close()
  }
})

test('regional admission captures and rechecks its owner guard after asynchronous capacity preflight', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const before = await readdir(path.join(f.root, 'generation-inputs'))
    let current = true
    const input = {
      assertCurrent: () => {
        if (!current) {
          throw new Error('captured owner changed')
        }
      },
      preflight: async () => {
        current = false
        input.assertCurrent = () => {}
      },
      prepared: f.prepared,
      projectPath: f.projectPath,
      regional: f.regional,
      request: f.request,
      stagingSessionId: randomUUID(),
    }
    await assert.rejects(f.queue.enqueueCurrentCanvasRegional(input), /captured owner changed/)
    assert.deepEqual(await readdir(path.join(f.root, 'generation-inputs')), before)
    assert.deepEqual(await f.db.selectFrom('generation_queue_item').selectAll().execute(), [])
  } finally {
    await f.close()
  }
})

test('regional scoped quiescence joins claim startup after the Project fence and keeps the owner reusable', async () => {
  const reached = deferred()
  const resume = deferred()
  const f = await createRegionalQueueFixture({
    queueHooks: {
      beforeClaimUpdate: async () => {
        reached.resolve()
        await resume.promise
      },
    },
  })
  try {
    const item = await enqueueRegionalFixture(f)
    const processor = new RegionalGenerationProcessor(f.queue, f.staging, f.models)
    const transport = {
      close: async () => {},
      executeCurrentCanvasRegional: async (input: OperationalRegionalWorkerInput) =>
        resultFor(f, input),
      ready: REGIONAL_QUEUE_READY,
    }
    const running = processor.runOne(transport)
    await reached.promise
    f.queue.fenceProject(item.localProjectKey)
    let settled = false
    const quiescence = processor
      .quiesceForProject({ localProjectKey: item.localProjectKey })
      .then(() => {
        settled = true
      })
    await Promise.resolve()
    assert.equal(settled, false)
    resume.resolve()
    assert.equal((await running).kind, 'idle')
    await quiescence
    assert.equal((await f.queue.getRegionalQueueItem(item.id))?.status, 'pending')
    f.queue.releaseProjectFence(item.localProjectKey)
    assert.equal((await processor.runOne(transport)).kind, 'completed')
  } finally {
    resume.resolve()
    await f.close()
  }
})

test('regional scoped quiescence waits beyond SQL completion and snapshots the exact Project/session scope', async () => {
  const f = await createRegionalQueueFixture()
  const published = deferred()
  const release = deferred()
  try {
    const item = await enqueueRegionalFixture(f)
    const originalPublish = f.staging.publishRegionalCandidate.bind(f.staging)
    f.staging.publishRegionalCandidate = async (input) => {
      const result = await originalPublish(input)
      published.resolve()
      await release.promise
      return result
    }
    const processor = new RegionalGenerationProcessor(f.queue, f.staging, f.models)
    const running = processor.runOne({
      close: async () => assert.fail('Completed inference does not need cancellation.'),
      executeCurrentCanvasRegional: async (input) => resultFor(f, input),
      ready: REGIONAL_QUEUE_READY,
    })
    await published.promise
    f.queue.fenceProject(item.localProjectKey)
    assert.deepEqual(await f.queue.listUnfinishedByProject(item.localProjectKey), [])
    await processor.quiesceForProject({ localProjectKey: `project-v1-${'0'.repeat(64)}` })
    await processor.quiesceForProject({
      localProjectKey: item.localProjectKey,
      stagingSessionIds: [randomUUID()],
    })
    const scope = {
      localProjectKey: item.localProjectKey,
      stagingSessionIds: [item.stagingSessionId],
    }
    let settled = false
    const quiescence = processor.quiesceForProject(scope).then(() => {
      settled = true
    })
    scope.stagingSessionIds[0] = randomUUID()
    scope.localProjectKey = `project-v1-${'0'.repeat(64)}`
    await Promise.resolve()
    assert.equal(settled, false)
    release.resolve()
    assert.equal((await running).kind, 'completed')
    await quiescence
    assert.equal((await f.staging.listVerifiedRegionalCandidates(item.localProjectKey)).length, 1)
    assert.deepEqual(await f.staging.listVerifiedCandidates(item.localProjectKey), [])
  } finally {
    release.resolve()
    await f.close()
  }
})

test('regional scoped quiescence retains unconfirmed physical exit until explicit cancellation confirms it', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const item = await enqueueRegionalFixture(f)
    const processor = new RegionalGenerationProcessor(f.queue, f.staging, f.models)
    let closes = 0
    await assert.rejects(
      processor.runOne({
        close: async () => {
          if (++closes === 1) {
            throw new Error('physical exit unconfirmed')
          }
        },
        executeCurrentCanvasRegional: async () => {
          throw new Error('controlled native failure')
        },
        ready: REGIONAL_QUEUE_READY,
      }),
      { code: 'WORKER_EXIT_UNCONFIRMED' },
    )
    f.queue.fenceProject(item.localProjectKey)
    await assert.rejects(processor.quiesceForProject({ localProjectKey: item.localProjectKey }), {
      code: 'WORKER_EXIT_UNCONFIRMED',
    })
    assert.equal((await f.queue.getRegionalQueueItem(item.id))?.status, 'running')
    assert.equal((await processor.cancelAndWait(item.id)).status, 'canceled')
    await processor.quiesceForProject({ localProjectKey: item.localProjectKey })
    assert.equal(closes, 2)
  } finally {
    await f.close()
  }
})

test('regional scoped quiescence retains uncertain publication for existing restart reconciliation', async () => {
  const f = await createRegionalQueueFixture({
    stagingHooks: {
      afterManifestPublish: async () => {
        throw new Error('controlled interruption after manifest publication')
      },
    },
  })
  try {
    const item = await enqueueRegionalFixture(f)
    const processor = new RegionalGenerationProcessor(f.queue, f.staging, f.models)
    await assert.rejects(
      processor.runOne({
        close: async () => {},
        executeCurrentCanvasRegional: async (input) => resultFor(f, input),
        ready: REGIONAL_QUEUE_READY,
      }),
      { code: 'PUBLICATION_UNCERTAIN' },
    )
    f.queue.fenceProject(item.localProjectKey)
    await assert.rejects(processor.quiesceForProject({ localProjectKey: item.localProjectKey }), {
      code: 'PUBLICATION_UNCERTAIN',
    })
    assert.equal(await f.staging.hasPublicationReceipt(item.id), true)
    assert.equal((await f.queue.getRegionalQueueItem(item.id))?.status, 'running')
    const queue = new GenerationQueueRepository(f.db, f.root)
    const staging = new GenerationStagingRepository(f.db, f.root)
    await queue.recoverAfterRestart()
    assert.equal((await staging.recoverAfterRestart()).reconciledCount, 1)
    assert.equal((await staging.listVerifiedRegionalCandidates(item.localProjectKey)).length, 1)
    assert.deepEqual(await staging.listVerifiedCandidates(item.localProjectKey), [])
  } finally {
    await f.close()
  }
})

test('Project lifecycle owns regional candidates while public presence stays typed and tombstones survive restart', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const regional = await publishRegional(f)
    const normalItem = await enqueueNormal(f)
    const normalClaim = await f.queue.claimNextPending()
    assert.equal(normalClaim?.item.id, normalItem.id)
    assert.ok(normalClaim)
    const scratch = path.join(f.root, 'scratch')
    await mkdir(scratch, { mode: 0o700 })
    const provisionalRoot = await mkdtemp(path.join(scratch, 'illustrious-request-'))
    const provisionalOutputPath = path.join(provisionalRoot, 'result.png')
    await writeFile(provisionalOutputPath, f.outputBytes, { mode: 0o600 })
    const normal = await f.staging.publishGenerationCandidate({
      actualSeed: f.prepared.context.sampling.seed,
      expectedProvisionalRoot: provisionalRoot,
      expectedStatusSequence: normalClaim.item.statusSequence,
      provisionalOutputPath,
      queueItemId: normalItem.id,
    })
    const smart = new SmartPatchGenerationStagingRepository(f.db, f.root)
    await smart.recoverAfterRestart()
    const lifecycle = new ProjectGenerationStagingLifecycle(f.staging, smart)
    assert.deepEqual(await lifecycle.listVerifiedCandidates(regional.localProjectKey), [normal])
    assert.deepEqual(await lifecycle.listOwnedCandidates(regional.localProjectKey), [
      normal,
      regional,
    ])
    f.queue.fenceProject(regional.localProjectKey)
    assert.equal((await lifecycle.discardProject(regional.localProjectKey)).cleanupDeferred, false)
    assert.deepEqual(await lifecycle.listOwnedCandidates(regional.localProjectKey), [])
    const queue = new GenerationQueueRepository(f.db, f.root)
    const staging = new GenerationStagingRepository(f.db, f.root)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    assert.deepEqual(await staging.listVerifiedRegionalCandidates(regional.localProjectKey), [])
    assert.deepEqual(await staging.listVerifiedCandidates(regional.localProjectKey), [])
  } finally {
    await f.close()
  }
})

test('Project lifecycle validates private ownership before its first discard tombstone', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const regional = await publishRegional(f)
    const smart = new SmartPatchGenerationStagingRepository(f.db, f.root)
    await smart.recoverAfterRestart()
    for (const overlap of ['candidate', 'session'] as const) {
      const publicCandidate = {
        ...regional,
        candidateId: overlap === 'candidate' ? regional.candidateId : randomUUID(),
        stagingSessionId: overlap === 'session' ? regional.stagingSessionId : randomUUID(),
      }
      const lifecycle = new ProjectGenerationStagingLifecycle(
        {
          discardProject: f.staging.discardProject.bind(f.staging),
          listVerifiedCandidates: async () => [publicCandidate],
          listVerifiedRegionalCandidates: f.staging.listVerifiedRegionalCandidates.bind(f.staging),
        },
        smart,
      )
      await assert.rejects(lifecycle.discardProject(regional.localProjectKey), /ownership overlap/)
      assert.deepEqual(
        await f.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
        [],
      )
      assert.equal(
        (await f.staging.listVerifiedRegionalCandidates(regional.localProjectKey)).length,
        1,
      )
    }
  } finally {
    await f.close()
  }
})
