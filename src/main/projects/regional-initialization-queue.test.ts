import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { RegionalWorkerInput } from './regional-worker-request.js'
import type { RegionalQueueFixture } from './test-fixtures/regional-queue.js'

import { GenerationQueueRepository } from './generation-queue.js'
import { RegionalGenerationProcessor } from './regional-generation-processor.js'
import {
  loadRegionalQueuedInput,
  parseFrozenQueuedRegionalInvokeV1,
  parseFrozenQueuedRegionalV1,
} from './regional-queued-generation.js'
import { captureRegionalWorkerInput } from './regional-worker-request.js'
import {
  createRegionalQueueFixture,
  enqueueRegionalFixture,
  REGIONAL_QUEUE_READY,
} from './test-fixtures/regional-queue.js'

const INITIALIZATION = 'invoke-cpu-f32-add-noise-v1' as const
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

function selectInvokeInitialization(fixture: RegionalQueueFixture): RegionalWorkerInput {
  fixture.prepared.context.sampling.sampler = 'Euler a'
  fixture.prepared.context.sampling.invokeScheduler = 'euler_a'
  fixture.request.job.sampling.scheduler = 'euler_a'
  return { ...fixture.regional, initializationProfile: INITIALIZATION, request: fixture.request }
}

async function enqueue(fixture: RegionalQueueFixture, input: RegionalWorkerInput) {
  const { request, ...regional } = input
  assert.ok(request.type === 'generate-illustrious-txt2img')
  return await fixture.queue.enqueueCurrentCanvasRegional({
    prepared: fixture.prepared,
    projectPath: fixture.projectPath,
    regional,
    request,
    stagingSessionId: randomUUID(),
  })
}

/** InvokeAI a61ac4fb retries its stored graph; this adapter must copy the same frozen choice. */
test('explicit initialization survives real queue reopen recovery and frozen Retry', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const input = selectInvokeInitialization(fixture)
    const expectedRecipe = structuredClone(input.recipe)
    const pending = enqueue(fixture, input)
    delete input.initializationProfile
    input.recipe.regions[0].positive!.text = 'later live authoring'
    input.recipe.regions[0].coverage.alpha.fill(17)
    const source = await pending
    await rm(fixture.request.job.target.path)
    const running = await fixture.queue.claimNextPendingRegional()
    assert.equal(running?.item.id, source.id)

    const reopened = new GenerationQueueRepository(fixture.db, fixture.root)
    assert.equal((await reopened.recoverAfterRestart()).canceledCount, 1)
    const canceled = await reopened.loadVerifiedRegionalInput(source.id)
    assert.equal(canceled.item.status, 'canceled')
    assert.equal(canceled.input.initializationProfile, INITIALIZATION)
    assert.equal(canceled.payload.initializationProfile, INITIALIZATION)
    assert.equal(canceled.input.request.job.sampling.scheduler, 'euler_a')
    assert.deepEqual(canceled.input.recipe, expectedRecipe)
    const sourceMetadata = JSON.parse(
      await readFile(path.join(path.dirname(canceled.targetPath), 'regional.json'), 'utf8'),
    ) as Record<string, unknown>
    assert.equal(sourceMetadata.initializationProfile, INITIALIZATION)

    const retried = await reopened.retryCurrentCanvasRegionalTerminal(
      source.id,
      canceled.item.statusSequence,
    )
    const retry = await reopened.loadVerifiedRegionalInput(retried.id)
    assert.notEqual(retried.id, source.id)
    assert.notEqual(retry.targetPath, canceled.targetPath)
    assert.deepEqual(retry.payload, canceled.payload)
    assert.equal(retry.input.initializationProfile, INITIALIZATION)
    assert.deepEqual(retry.input.recipe, expectedRecipe)
    assert.ok((await readFile(retry.targetPath)).equals(fixture.prepared.targetPngBytes))
    await reopened.deleteTerminal(source.id, canceled.item.statusSequence + 1)
    assert.equal(
      (await reopened.loadVerifiedRegionalInput(retried.id)).input.initializationProfile,
      INITIALIZATION,
    )
  } finally {
    await fixture.close()
  }
})

test('unsupported initialization fails only its frozen attempt before resolver or transport and Retry succeeds', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const source = await enqueue(fixture, selectInvokeInitialization(fixture))
    const blocked = new RegionalGenerationProcessor(fixture.queue, fixture.staging, {
      assertNoUnboundGenerationEmbeddings: async () =>
        assert.fail('No model work before capability admission.'),
      resolveVerifiedGenerationCheckpointForPlan: async () =>
        assert.fail('No model work before capability admission.'),
      resolveVerifiedGenerationEmbeddingForPlan: async () =>
        assert.fail('No model work before capability admission.'),
    })
    assert.deepEqual(
      await blocked.runOne({
        close: async () => assert.fail('No native dispatch means no transport shutdown.'),
        executeCurrentCanvasRegional: async () =>
          assert.fail('Unsupported policy must never dispatch.'),
        ready: REGIONAL_QUEUE_READY,
      }),
      { kind: 'failed', queueItemId: source.id },
    )
    const failed = await fixture.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', source.id)
      .executeTakeFirstOrThrow()
    assert.equal(failed.status, 'failed')
    assert.equal(failed.error_code, 'GENERATION_INPUT_CHANGED')
    assert.equal(await fixture.staging.hasPublicationReceipt(source.id), false)
    assert.equal(
      (await fixture.staging.listVerifiedRegionalCandidates(source.localProjectKey)).length,
      0,
    )

    const retry = await fixture.queue.retryCurrentCanvasRegionalTerminal(
      source.id,
      failed.status_sequence,
    )
    const processor = new RegionalGenerationProcessor(
      fixture.queue,
      fixture.staging,
      fixture.models,
    )
    let calls = 0
    const completed = await processor.runOne({
      close: async () => assert.fail('Healthy transport remains reusable.'),
      executeCurrentCanvasRegional: async (input) => {
        calls++
        assert.ok(input.compositionProfile !== 'invoke-krea2-global-support-v1')
        assert.equal(input.initializationProfile, INITIALIZATION)
        assert.equal(input.request.job.sampling.scheduler, 'euler_a')
        return {
          output: {
            byteSize: fixture.outputBytes.length,
            colorSpace: 'srgb',
            height: 64,
            iccSha256: IGS_SRGB_ICC_SHA256,
            path: path.join(fixture.root, 'explicit-already-consumed-output.png'),
            sha256: sha(fixture.outputBytes),
            width: 64,
          },
          pngBytes: Buffer.from(fixture.outputBytes),
          seed: 123,
        }
      },
      ready: {
        ...REGIONAL_QUEUE_READY,
        capabilities: [...REGIONAL_QUEUE_READY.capabilities, 'illustrious-regional-invoke-init-v1'],
      },
    })
    assert.equal(calls, 1)
    assert.equal(completed.kind, 'completed')
    if (completed.kind !== 'completed') {
      assert.fail('Expected a private durable Retry candidate.')
    }
    assert.equal(completed.queueItemId, retry.id)
    assert.ok((await readFile(completed.candidate.assetPath)).equals(fixture.outputBytes))
    assert.equal(
      (await fixture.queue.loadVerifiedRegionalInput(retry.id)).input.initializationProfile,
      INITIALIZATION,
    )
  } finally {
    await fixture.close()
  }
})

test('historical queue and Retry keep initialization absent without adopting a current default', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const source = await enqueueRegionalFixture(fixture)
    const original = await fixture.queue.loadVerifiedRegionalInput(source.id)
    const metadata = JSON.parse(
      await readFile(path.join(path.dirname(original.targetPath), 'regional.json'), 'utf8'),
    ) as Record<string, unknown>
    assert.equal(Object.hasOwn(original.input, 'initializationProfile'), false)
    assert.equal(Object.hasOwn(original.payload, 'initializationProfile'), false)
    assert.equal(Object.hasOwn(metadata, 'initializationProfile'), false)
    assert.equal(original.input.request.job.sampling.scheduler, 'euler')
    const reopened = new GenerationQueueRepository(fixture.db, fixture.root)
    await reopened.recoverAfterRestart()
    const canceled = await reopened.loadVerifiedRegionalInput(source.id)
    const retry = await reopened.retryCurrentCanvasRegionalTerminal(
      source.id,
      canceled.item.statusSequence,
    )
    const copied = await reopened.loadVerifiedRegionalInput(retry.id)
    assert.equal(Object.hasOwn(copied.input, 'initializationProfile'), false)
    assert.equal(Object.hasOwn(copied.payload, 'initializationProfile'), false)
    assert.deepEqual(copied.payload, original.payload)
  } finally {
    await fixture.close()
  }
})

for (const value of [null, false, 1, '', 'invoke-cpu-f32-add-noise-v2', {}, []]) {
  test(`regional capture refuses explicit initialization ${JSON.stringify(value)}`, async () => {
    const fixture = await createRegionalQueueFixture()
    try {
      const input = selectInvokeInitialization(fixture)
      assert.throws(
        () =>
          captureRegionalWorkerInput({
            ...input,
            initializationProfile: value,
          } as unknown as RegionalWorkerInput),
        { code: 'INVALID_REQUEST' },
      )
      assert.equal((await fixture.queue.listManagerPage()).items.length, 0)
      assert.equal(captureRegionalWorkerInput(input).initializationProfile, INITIALIZATION)
    } finally {
      await fixture.close()
    }
  })
}

test('explicit initialization cannot reinterpret Euler while absent private transport keeps both legacy samplers', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const legacy = { ...fixture.regional, request: fixture.request }
    assert.equal(Object.hasOwn(captureRegionalWorkerInput(legacy), 'initializationProfile'), false)
    assert.throws(
      () => captureRegionalWorkerInput({ ...legacy, initializationProfile: INITIALIZATION }),
      { code: 'INVALID_REQUEST' },
    )
    const selected = selectInvokeInitialization(fixture)
    assert.equal(captureRegionalWorkerInput(selected).initializationProfile, INITIALIZATION)
    delete selected.initializationProfile
    assert.equal(
      Object.hasOwn(captureRegionalWorkerInput(selected), 'initializationProfile'),
      false,
    )
  } finally {
    await fixture.close()
  }
})

test('rehashing regional metadata cannot erase its frozen initialization identity', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const input = selectInvokeInitialization(fixture)
    const source = await enqueue(fixture, input)
    const neighbor = await enqueue(fixture, input)
    const loaded = await fixture.queue.loadVerifiedRegionalInput(source.id)
    const root = path.dirname(loaded.targetPath)
    const metadata = JSON.parse(await readFile(path.join(root, 'regional.json'), 'utf8')) as Record<
      string,
      unknown
    >
    delete metadata.initializationProfile
    const bytes = Buffer.from(JSON.stringify(metadata))
    await writeFile(path.join(root, 'regional.json'), bytes, { mode: 0o600 })
    const payload = {
      ...loaded.payload,
      regional: { byteSize: bytes.length, sha256: sha(bytes) },
    }
    await assert.rejects(loadRegionalQueuedInput(root, payload, loaded.input.request), {
      code: 'QUEUE_INPUT_INVALID',
    })
    assert.equal(
      (await fixture.queue.loadVerifiedRegionalInput(neighbor.id)).input.initializationProfile,
      INITIALIZATION,
    )
  } finally {
    await fixture.close()
  }
})

test('private frozen parser distinguishes explicit ancestral initialization from historical Euler', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const source = await enqueue(fixture, selectInvokeInitialization(fixture))
    const { payload } = await fixture.queue.loadVerifiedRegionalInput(source.id)
    assert.deepEqual(parseFrozenQueuedRegionalV1(JSON.stringify(payload)), payload)
    const { initializationProfile: _initialization, ...missing } = payload
    for (const variant of [
      missing,
      { ...payload, initializationProfile: null },
      { ...payload, initializationProfile: 'invoke-cpu-f32-add-noise-v2' },
      { ...payload, initializationProfile: { schemaVersion: 1 } },
    ]) {
      assert.throws(() => parseFrozenQueuedRegionalV1(JSON.stringify(variant)), {
        code: 'QUEUE_INPUT_INVALID',
      })
    }
  } finally {
    await fixture.close()
  }
})

test('public Euler a requires explicit operation while private initialization rows stay private', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const source = await enqueue(fixture, selectInvokeInitialization(fixture))
    const loaded = await fixture.queue.loadVerifiedRegionalInput(source.id)
    assert.throws(() => parseFrozenQueuedRegionalInvokeV1(JSON.stringify(loaded.payload)), {
      code: 'QUEUE_INPUT_INVALID',
    })
    const publicJob = await fixture.queue.enqueueInvokeCanvasRegional({
      prepared: fixture.prepared,
      projectPath: fixture.projectPath,
      regional: {
        ...fixture.regional,
        compositionProfile: 'invoke-canvas-v1',
        initializationProfile: INITIALIZATION,
      },
      request: fixture.request,
      stagingSessionId: randomUUID(),
    })
    const publicInput = await fixture.queue.loadVerifiedRegionalInput(publicJob.id)
    assert.equal(publicInput.payload.kind, 'illustrious-regional-txt2img')
    assert.equal(publicInput.input.initializationProfile, INITIALIZATION)
    assert.equal(publicInput.input.request.job.sampling.scheduler, 'euler_a')
    assert.equal((await fixture.queue.listManagerPage()).items.length, 1)
    assert.equal(
      (await fixture.queue.loadVerifiedRegionalInput(source.id)).payload.kind,
      'illustrious-regional',
    )
  } finally {
    await fixture.close()
  }
})
