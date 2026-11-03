import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type {
  GenerationDenoisingProgress,
  GenerationProgressSnapshot,
} from '../../shared/projects/generation-progress.js'
import { supportsInferenceRegionalProgress } from '../../shared/projects/inference-worker-capabilities.js'

import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import type { InferenceWorkerReady } from './illustrious-txt2img-job.js'
import type { RegionalGenerationTransport } from './regional-generation-processor.js'
import type { RegionalWorkerInput, RegionalWorkerResult } from './regional-worker-request.js'
import type { RegionalQueueFixture } from './test-fixtures/regional-queue.js'

import { GenerationProgressSource } from './generation-progress-source.js'
import { RegionalGenerationProcessor } from './regional-generation-processor.js'
import {
  createRegionalQueueFixture,
  enqueueRegionalFixture,
  REGIONAL_QUEUE_READY,
  regionalFixtureSha256,
} from './test-fixtures/regional-queue.js'

const PROGRESS_READY: InferenceWorkerReady = {
  ...REGIONAL_QUEUE_READY,
  capabilities: [...REGIONAL_QUEUE_READY.capabilities, 'illustrious-regional-progress-v1'],
}

function deferred<T = void>() {
  let resolve!: (value: PromiseLike<T> | T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, reject, resolve }
}

function resultFor(
  fixture: RegionalQueueFixture,
  input: RegionalWorkerInput,
): RegionalWorkerResult {
  return {
    output: {
      byteSize: fixture.outputBytes.length,
      colorSpace: 'srgb',
      height: input.request.job.bbox.height,
      iccSha256: IGS_SRGB_ICC_SHA256,
      path: path.join(fixture.root, 'already-disposed-regional-progress-output.png'),
      sha256: regionalFixtureSha256(fixture.outputBytes),
      width: input.request.job.bbox.width,
    },
    pngBytes: Buffer.from(fixture.outputBytes),
    seed: input.request.job.sampling.seed,
  }
}

async function row(fixture: RegionalQueueFixture, id: string) {
  return await fixture.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}

function beginRun(
  fixture: RegionalQueueFixture,
  processor: RegionalGenerationProcessor,
  options: {
    close?: () => Promise<void>
    ready?: InferenceWorkerReady
  } = {},
) {
  const started = deferred<{
    input: RegionalWorkerInput
    send: (progress: GenerationDenoisingProgress) => void
  }>()
  const completion = deferred<RegionalWorkerResult>()
  const transport: RegionalGenerationTransport = {
    close: options.close ?? (async () => {}),
    executeCurrentCanvasRegional: async (input, onProgress) => {
      assert.equal(typeof onProgress, 'function')
      started.resolve({ input, send: onProgress! })
      return await completion.promise
    },
    ready: options.ready ?? PROGRESS_READY,
  }
  const run = processor.runOne(transport)
  return {
    complete: (input: RegionalWorkerInput) => completion.resolve(resultFor(fixture, input)),
    completion,
    run,
    started: started.promise,
    transport,
  }
}

function processorFor(fixture: RegionalQueueFixture) {
  return new RegionalGenerationProcessor(fixture.queue, fixture.staging, fixture.models)
}

test('regional progress capability requires the exact qualified engine and both telemetry owners', () => {
  assert.equal(supportsInferenceRegionalProgress(PROGRESS_READY), true)
  assert.equal(
    supportsInferenceRegionalProgress({
      ...PROGRESS_READY,
      capabilities: PROGRESS_READY.capabilities
        .filter((value) => value !== 'private-current-canvas-regional-v1')
        .concat('illustrious-regional-invoke-v1'),
    }),
    true,
  )
  for (const value of [
    null,
    REGIONAL_QUEUE_READY,
    { ...PROGRESS_READY, workerVersion: '0.13.0' },
    { ...PROGRESS_READY, workerVersion: '0.15.0' },
    { ...PROGRESS_READY, runtimeProfile: 'linux-cpu' },
    ...['denoising-progress', 'private-current-canvas-regional-v1', 'illustrious-txt2img'].map(
      (missing) => ({
        ...PROGRESS_READY,
        capabilities: PROGRESS_READY.capabilities.filter((entry) => entry !== missing),
      }),
    ),
  ]) {
    assert.equal(supportsInferenceRegionalProgress(value), false)
  }
})

test('regional numeric progress owns exact running metadata and never completes or persists a job', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const processor = processorFor(fixture)
    const progress = new GenerationProgressSource([processor])
    try {
      const observed: GenerationProgressSnapshot[] = []
      processor.onProgress((snapshot) => observed.push(snapshot))
      const work = beginRun(fixture, processor)
      const { input, send } = await work.started
      const running = await row(fixture, queued.id)
      assert.deepEqual(processor.getProgressSnapshot(), { current: null, revision: 0 })
      send({ step: 1, totalSteps: 2 })
      const expected = {
        documentId: fixture.prepared.context.documentId,
        jobId: queued.id,
        projectKey: queued.localProjectKey,
        statusSequence: running.status_sequence,
        step: 1,
        totalSteps: 2,
      }
      assert.deepEqual(processor.getProgressSnapshot(), { current: expected, revision: 1 })
      assert.deepEqual(progress.getProgressSnapshot(), { current: expected, revision: 1 })
      send({ step: 2, totalSteps: 2 })
      assert.deepEqual(await row(fixture, queued.id), running)
      assert.equal(await fixture.staging.hasPublicationReceipt(queued.id), false)
      assert.equal(
        (await fixture.staging.listVerifiedRegionalCandidates(queued.localProjectKey)).length,
        0,
      )
      assert.equal(processor.getProgressSnapshot().current?.step, 2)
      work.complete(input)
      assert.equal((await work.run).kind, 'completed')
      assert.deepEqual(processor.getProgressSnapshot(), { current: null, revision: 3 })
      assert.deepEqual(progress.getProgressSnapshot(), { current: null, revision: 3 })
      send({ step: 2, totalSteps: 2 })
      assert.equal(processor.getProgressSnapshot().revision, 3)
      assert.deepEqual(
        observed.map((snapshot) => snapshot.current?.step ?? null),
        [1, 2, null],
      )
      assert.equal((await row(fixture, queued.id)).status, 'completed')
    } finally {
      progress.dispose()
    }
  } finally {
    await fixture.close()
  }
})

test('regional progress ignores malformed, reversed, duplicate and wrong-total observations', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const processor = processorFor(fixture)
    const work = beginRun(fixture, processor)
    const { input, send } = await work.started
    send({ step: 1, totalSteps: 2 })
    const first = processor.getProgressSnapshot()
    const running = await row(fixture, queued.id)
    for (const invalid of [
      null,
      { step: 1, totalSteps: 2 },
      { step: 0, totalSteps: 2 },
      { step: 3, totalSteps: 2 },
      { step: 2, totalSteps: 3 },
      { step: 1.5, totalSteps: 2 },
      { step: Number.NaN, totalSteps: 2 },
      { step: true, totalSteps: 2 },
      { outputPath: '/not-telemetry', step: 2, totalSteps: 2 },
    ]) {
      send(invalid as GenerationDenoisingProgress)
      assert.deepEqual(processor.getProgressSnapshot(), first)
    }
    assert.deepEqual(await row(fixture, queued.id), running)
    send({ step: 2, totalSteps: 2 })
    assert.equal(processor.getProgressSnapshot().current?.step, 2)
    work.complete(input)
    assert.equal((await work.run).kind, 'completed')
  } finally {
    await fixture.close()
  }
})

test('regional cancellation clears immediately before exit and stale callbacks cannot affect frozen Retry', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const processor = processorFor(fixture)
    const closing = deferred()
    const physicalExit = deferred()
    const work = beginRun(fixture, processor, {
      close: async () => {
        closing.resolve()
        await physicalExit.promise
      },
    })
    const first = await work.started
    first.send({ step: 1, totalSteps: 2 })
    const canceled = processor.cancelAndWait(queued.id)
    assert.equal(processor.getProgressSnapshot().current, null)
    first.send({ step: 2, totalSteps: 2 })
    assert.equal(processor.getProgressSnapshot().current, null)
    await closing.promise
    assert.equal((await row(fixture, queued.id)).status, 'running')
    assert.equal(await fixture.staging.hasPublicationReceipt(queued.id), false)
    physicalExit.resolve()
    assert.equal((await canceled).status, 'canceled')
    assert.equal((await work.run).kind, 'canceled')
    const terminal = await row(fixture, queued.id)
    const retry = await fixture.queue.retryCurrentCanvasRegionalTerminal(
      queued.id,
      terminal.status_sequence,
    )
    const recovered = beginRun(fixture, processor)
    const second = await recovered.started
    second.send({ step: 1, totalSteps: 2 })
    const fresh = processor.getProgressSnapshot()
    assert.equal(fresh.current?.jobId, retry.id)
    assert.equal(fresh.current?.step, 1)
    first.send({ step: 2, totalSteps: 2 })
    work.complete(first.input)
    await work.completion.promise
    assert.deepEqual(processor.getProgressSnapshot(), fresh)
    recovered.complete(second.input)
    assert.equal((await recovered.run).kind, 'completed')
    assert.equal(await fixture.staging.hasPublicationReceipt(queued.id), false)
  } finally {
    await fixture.close()
  }
})

test('regional failure clears before worker close and successful frozen Retry receives fresh progress', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const processor = processorFor(fixture)
    let closes = 0
    const work = beginRun(fixture, processor, {
      close: async () => {
        closes++
        assert.equal(processor.getProgressSnapshot().current, null)
        assert.equal((await row(fixture, queued.id)).status, 'running')
      },
    })
    const first = await work.started
    first.send({ step: 1, totalSteps: 2 })
    work.completion.reject(new Error('injected regional worker failure'))
    assert.equal((await work.run).kind, 'failed')
    assert.equal(closes, 1)
    assert.equal(processor.getProgressSnapshot().current, null)
    const failed = await row(fixture, queued.id)
    assert.equal(failed.error_code, 'GENERATION_WORKER_FAILED')
    assert.equal(await fixture.staging.hasPublicationReceipt(queued.id), false)
    const retry = await fixture.queue.retryCurrentCanvasRegionalTerminal(
      queued.id,
      failed.status_sequence,
    )
    const recovered = beginRun(fixture, processor)
    const second = await recovered.started
    second.send({ step: 1, totalSteps: 2 })
    const current = processor.getProgressSnapshot()
    assert.equal(current.current?.jobId, retry.id)
    first.send({ step: 2, totalSteps: 2 })
    assert.deepEqual(processor.getProgressSnapshot(), current)
    recovered.complete(second.input)
    assert.equal((await recovered.run).kind, 'completed')
  } finally {
    await fixture.close()
  }
})

test('regional stopping hides progress while the exact worker exit remains unconfirmed', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const processor = processorFor(fixture)
    const closing = deferred()
    const exited = deferred()
    const work = beginRun(fixture, processor, {
      close: async () => {
        closing.resolve()
        await exited.promise
      },
    })
    const active = await work.started
    active.send({ step: 1, totalSteps: 2 })
    const stopping = processor.stopAndCancelActive()
    assert.equal(processor.getProgressSnapshot().current, null)
    active.send({ step: 2, totalSteps: 2 })
    await closing.promise
    assert.equal(processor.getProgressSnapshot().current, null)
    assert.equal((await row(fixture, queued.id)).status, 'running')
    exited.resolve()
    await stopping
    assert.equal((await work.run).kind, 'canceled')
    work.complete(active.input)
    await work.completion.promise
    assert.equal((await row(fixture, queued.id)).status, 'canceled')
  } finally {
    await fixture.close()
  }
})

test('regional snapshots and subscriber exceptions cannot mutate telemetry or durable jobs', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const processor = processorFor(fixture)
    const seen: GenerationProgressSnapshot[] = []
    processor.onProgress((snapshot) => {
      snapshot.revision = 999
      if (snapshot.current) {
        snapshot.current.jobId = 'listener mutation'
        snapshot.current.documentId = 'listener mutation'
        snapshot.current.statusSequence = 999
        snapshot.current.step = 999
      }
      throw new Error('injected broken UI subscriber')
    })
    const unsubscribe = processor.onProgress((snapshot) => seen.push(snapshot))
    const work = beginRun(fixture, processor)
    const { input, send } = await work.started
    const running = await row(fixture, queued.id)
    const progress = { step: 1, totalSteps: 2 }
    send(progress)
    progress.step = 2
    const snapshot = processor.getProgressSnapshot()
    assert.equal(snapshot.current?.jobId, queued.id)
    assert.equal(snapshot.current?.statusSequence, running.status_sequence)
    assert.equal(snapshot.current?.step, 1)
    assert.equal(snapshot.revision, 1)
    assert.deepEqual(seen, [snapshot])
    snapshot.current.step = 999
    snapshot.current.jobId = 'caller mutation'
    snapshot.revision = 999
    assert.equal(processor.getProgressSnapshot().current?.step, 1)
    assert.equal(processor.getProgressSnapshot().current?.jobId, queued.id)
    assert.deepEqual(await row(fixture, queued.id), running)
    unsubscribe()
    work.complete(input)
    assert.equal((await work.run).kind, 'completed')
    assert.equal(seen.length, 1)
    assert.equal(processor.getProgressSnapshot().current, null)
  } finally {
    await fixture.close()
  }
})

test('legacy regional execution stays quiet and cannot inherit progress from an extra callback', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    await enqueueRegionalFixture(fixture)
    const processor = processorFor(fixture)
    const seen: GenerationProgressSnapshot[] = []
    processor.onProgress((snapshot) => seen.push(snapshot))
    const work = beginRun(fixture, processor, { ready: REGIONAL_QUEUE_READY })
    const { input, send } = await work.started
    send({ step: 1, totalSteps: 2 })
    send({ step: 2, totalSteps: 2 })
    assert.deepEqual(processor.getProgressSnapshot(), { current: null, revision: 0 })
    work.complete(input)
    assert.equal((await work.run).kind, 'completed')
    assert.deepEqual(seen, [])
    assert.deepEqual(processor.getProgressSnapshot(), { current: null, revision: 0 })
  } finally {
    await fixture.close()
  }
})

test('regional transport methods and ready capability state are detached before claim awaits', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    await enqueueRegionalFixture(fixture)
    const processor = processorFor(fixture)
    const started = deferred<RegionalWorkerInput>()
    const completion = deferred<RegionalWorkerResult>()
    const ready = { ...PROGRESS_READY, capabilities: [...PROGRESS_READY.capabilities] }
    const transport: RegionalGenerationTransport = {
      async close() {
        assert.equal(this, transport)
      },
      async executeCurrentCanvasRegional(input, onProgress) {
        assert.equal(this, transport)
        onProgress?.({ step: 1, totalSteps: 2 })
        started.resolve(input)
        return await completion.promise
      },
      ready,
    }
    const run = processor.runOne(transport)
    ready.capabilities.length = 0
    transport.executeCurrentCanvasRegional = async () => assert.fail('Method was captured.')
    const input = await started.promise
    assert.equal(processor.getProgressSnapshot().current?.step, 1)
    completion.resolve(resultFor(fixture, input))
    assert.equal((await run).kind, 'completed')
  } finally {
    await fixture.close()
  }
})
