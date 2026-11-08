import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { access, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { FrozenGenerationEmbedding } from './illustrious-generation-embeddings.js'
import type {
  OperationalRegionalWorkerInput,
  RegionalWorkerInput,
  RegionalWorkerResult,
} from './regional-worker-request.js'
import type { RegionalQueueFixture } from './test-fixtures/regional-queue.js'

import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { RegionalGenerationProcessor } from './regional-generation-processor.js'
import {
  createRegionalQueueFixture,
  enqueueRegionalFixture,
  REGIONAL_QUEUE_READY,
  regionalFixtureSha256,
} from './test-fixtures/regional-queue.js'

function deferred<T = void>() {
  let resolve!: (value: PromiseLike<T> | T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, reject, resolve }
}

const code = (expected: string) => (error: unknown) => {
  assert.ok(error instanceof Error)
  assert.equal((error as Error & { code: string }).code, expected)
  return true
}

function resultFor(
  fixture: RegionalQueueFixture,
  input: OperationalRegionalWorkerInput,
): RegionalWorkerResult {
  assert.ok(input.compositionProfile !== 'invoke-krea2-global-support-v1')
  return {
    output: {
      byteSize: fixture.outputBytes.length,
      colorSpace: 'srgb',
      height: input.request.job.bbox.height,
      iccSha256: IGS_SRGB_ICC_SHA256,
      path: path.join(fixture.root, 'already-disposed-worker-output.png'),
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

test('regional processor publishes owned PNG bytes after original target and worker output are gone', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const expectedAlpha = Buffer.from(fixture.regional.recipe.regions[0].coverage.alpha)
    await rm(fixture.request.job.target.path)
    fixture.regional.recipe.regions[0].coverage.alpha.fill(9)
    fixture.regional.recipe.regions[0].positive!.text = 'later Project edit'
    const processor = new RegionalGenerationProcessor(
      fixture.queue,
      fixture.staging,
      fixture.models,
    )
    let calls = 0
    const outcome = await processor.runOne({
      close: async () => assert.fail('Healthy borrowed transport stays reusable.'),
      executeCurrentCanvasRegional: async (input) => {
        calls++
        assert.ok(Buffer.from(input.recipe.regions[0].coverage.alpha).equals(expectedAlpha))
        assert.equal(input.recipe.regions[0].positive!.text, 'regional positive')
        assert.notEqual(input.request.requestId, queued.id)
        assert.equal(input.request.job.sampling.seed, 123)
        await access(input.request.job.target.path)
        const result = resultFor(fixture, input)
        await assert.rejects(access(result.output.path), { code: 'ENOENT' })
        return result
      },
      ready: REGIONAL_QUEUE_READY,
    })
    assert.equal(calls, 1)
    assert.equal(outcome.kind, 'completed')
    if (outcome.kind !== 'completed') {
      assert.fail('Expected durable private candidate.')
    }
    assert.ok((await readFile(outcome.candidate.assetPath)).equals(fixture.outputBytes))
    assert.equal((await row(fixture, queued.id)).status, 'completed')
    assert.equal(
      (await fixture.staging.listVerifiedRegionalCandidates(queued.localProjectKey)).length,
      1,
    )
    assert.equal((await fixture.staging.listVerifiedCandidates(queued.localProjectKey)).length, 0)
    assert.equal(
      await fixture.staging.readLastActualSeed(
        queued.localProjectKey,
        fixture.prepared.context.documentId,
      ),
      123,
    )
    assert.deepEqual(
      await processor.runOne({
        close: async () => {},
        executeCurrentCanvasRegional: async () => assert.fail('No pending row.'),
        ready: REGIONAL_QUEUE_READY,
      }),
      { kind: 'idle' },
    )
  } finally {
    await fixture.close()
  }
})

test('regional processor rejects missing capability and crossed CPU lane before claiming', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const processor = new RegionalGenerationProcessor(
      fixture.queue,
      fixture.staging,
      fixture.models,
    )
    for (const ready of [
      {
        ...REGIONAL_QUEUE_READY,
        capabilities: REGIONAL_QUEUE_READY.capabilities.filter(
          (entry) => entry !== 'private-current-canvas-regional-v1',
        ),
      },
      { ...REGIONAL_QUEUE_READY, runtimeProfile: 'linux-cpu' },
    ]) {
      await assert.rejects(
        processor.runOne({
          close: async () => assert.fail('No borrowed work.'),
          executeCurrentCanvasRegional: async () => assert.fail('No dispatch.'),
          ready,
        }),
        code('INFERENCE_UNAVAILABLE'),
      )
      assert.equal((await row(fixture, queued.id)).status, 'pending')
    }
  } finally {
    await fixture.close()
  }
})

test('native failure confirms physical exit before terminalizing and frozen Retry completes fresh', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const processor = new RegionalGenerationProcessor(
      fixture.queue,
      fixture.staging,
      fixture.models,
    )
    let closes = 0
    const failed = await processor.runOne({
      close: async () => {
        closes++
        assert.equal((await row(fixture, queued.id)).status, 'running')
      },
      executeCurrentCanvasRegional: async () => {
        throw new Error('injected native failure')
      },
      ready: REGIONAL_QUEUE_READY,
    })
    assert.deepEqual(failed, { kind: 'failed', queueItemId: queued.id })
    assert.equal(closes, 1)
    const failedRow = await row(fixture, queued.id)
    assert.equal(failedRow.error_code, 'GENERATION_WORKER_FAILED')
    const retry = await fixture.queue.retryCurrentCanvasRegionalTerminal(
      queued.id,
      failedRow.status_sequence,
    )
    await fixture.queue.deleteTerminal(queued.id, (await row(fixture, queued.id)).status_sequence)
    const restored = await processor.runOne({
      close: async () => assert.fail('Healthy recovery.'),
      executeCurrentCanvasRegional: async (input) => resultFor(fixture, input),
      ready: REGIONAL_QUEUE_READY,
    })
    assert.equal(restored.kind, 'completed')
    assert.equal((await row(fixture, retry.id)).status, 'completed')
  } finally {
    await fixture.close()
  }
})

for (const fault of ['seed', 'hash', 'dimensions'] as const) {
  test(`regional ${fault} mismatch closes worker and never reserves a publication receipt`, async () => {
    const fixture = await createRegionalQueueFixture()
    try {
      const queued = await enqueueRegionalFixture(fixture)
      const processor = new RegionalGenerationProcessor(
        fixture.queue,
        fixture.staging,
        fixture.models,
      )
      let closes = 0
      const outcome = await processor.runOne({
        close: async () => {
          closes++
        },
        executeCurrentCanvasRegional: async (input) => {
          const result = resultFor(fixture, input)
          if (fault === 'seed') {
            result.seed++
          } else if (fault === 'hash') {
            result.output.sha256 = '0'.repeat(64)
          } else {
            result.output.width = 128
          }
          return result
        },
        ready: REGIONAL_QUEUE_READY,
      })
      assert.equal(outcome.kind, 'failed')
      assert.equal(closes, 1)
      assert.equal(await fixture.staging.hasPublicationReceipt(queued.id), false)
      assert.equal(
        (await fixture.staging.listVerifiedRegionalCandidates(queued.localProjectKey)).length,
        0,
      )
    } finally {
      await fixture.close()
    }
  })
}

test('frozen checkpoint policy drift refuses before native consumption', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const original = fixture.models.resolveVerifiedGenerationCheckpointForPlan
    fixture.models.resolveVerifiedGenerationCheckpointForPlan = async (reference) => {
      const verified = await original(reference)
      return {
        ...verified,
        noiseProfile: { ...verified.noiseProfile!, timestepSpacing: 'linspace' },
      }
    }
    const processor = new RegionalGenerationProcessor(
      fixture.queue,
      fixture.staging,
      fixture.models,
    )
    const outcome = await processor.runOne({
      close: async () => assert.fail('Nothing was dispatched.'),
      executeCurrentCanvasRegional: async () => assert.fail('Policy changed.'),
      ready: REGIONAL_QUEUE_READY,
    })
    assert.equal(outcome.kind, 'failed')
    assert.equal((await row(fixture, queued.id)).error_code, 'GENERATION_INPUT_CHANGED')
  } finally {
    await fixture.close()
  }
})

test('regional signed refs are independently reverified and collaborator methods are captured', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const region = fixture.regional.recipe.regions[0]
    const expected: string[] = []
    const entries: FrozenGenerationEmbedding[] = []
    for (const [index, sign] of ['positive', 'negative'].entries()) {
      const managedPath = path.join(fixture.root, `exact-${sign}.safetensors`)
      const bytes = Buffer.from(`explicit exact ${sign} TI fixture`)
      await writeFile(managedPath, bytes, { mode: 0o600 })
      const reference = {
        baseModelFamily: 'illustrious' as const,
        civitaiFileId: 101 + index,
        civitaiModelId: 201 + index,
        civitaiVersionId: 301 + index,
        displayName: `Exact ${sign}`,
        fileSha256: regionalFixtureSha256(bytes),
        kind: 'embedding' as const,
        localModelId: randomUUID(),
        localVersionId: randomUUID(),
        predictionType: null,
        versionName: 'fixture',
      }
      entries.push({ byteSize: bytes.length, managedPath, reference, token: '<same>' })
    }
    region.positive = {
      embeddingRefs: [{ resource: entries[0].reference, token: '<same>' }],
      text: '<same>',
    }
    region.negative = {
      prompt: {
        embeddingRefs: [{ resource: entries[1].reference, token: '<same>' }],
        text: '<same>',
      },
      source: 'regional',
    }
    region.embeddings = { negative: [entries[1]], positive: [entries[0]] }
    const queued = await enqueueRegionalFixture(fixture)
    fixture.models.resolveVerifiedGenerationEmbeddingForPlan = async (reference) => {
      expected.push(reference.fileSha256)
      const entry = entries.find((item) => item.reference.fileSha256 === reference.fileSha256)
      assert.ok(entry)
      return structuredClone(entry)
    }
    let pairs = 0
    fixture.models.assertNoUnboundGenerationEmbeddings = async ({
      negativePrompt,
      positivePrompt,
    }) => {
      pairs++
      if (pairs === 2) {
        assert.equal(negativePrompt.text, '<same>')
        assert.equal(positivePrompt.text, '<same>')
      }
      positivePrompt.text = 'collaborator argument mutation'
    }
    const processor = new RegionalGenerationProcessor(
      fixture.queue,
      fixture.staging,
      fixture.models,
    )
    fixture.models.resolveVerifiedGenerationEmbeddingForPlan = async () =>
      assert.fail('Methods were captured.')
    const outcome = await processor.runOne({
      close: async () => {},
      executeCurrentCanvasRegional: async (input) => {
        assert.equal(input.recipe.regions[0].positive!.text, '<same>')
        assert.equal(input.recipe.regions[0].negative.prompt.text, '<same>')
        return resultFor(fixture, input)
      },
      ready: REGIONAL_QUEUE_READY,
    })
    assert.equal(outcome.kind, 'completed')
    assert.equal(pairs, 2)
    assert.deepEqual(expected, [entries[0].reference.fileSha256, entries[1].reference.fileSha256])
    assert.equal((await row(fixture, queued.id)).status, 'completed')
  } finally {
    await fixture.close()
  }
})

test('cancel keeps global running slot until physical close and ignores a late completed result', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const processor = new RegionalGenerationProcessor(
      fixture.queue,
      fixture.staging,
      fixture.models,
    )
    const dispatched = deferred<RegionalWorkerInput>()
    const late = deferred<RegionalWorkerResult>()
    const closing = deferred()
    const physicalExit = deferred()
    const run = processor.runOne({
      close: async () => {
        closing.resolve()
        await physicalExit.promise
      },
      executeCurrentCanvasRegional: async (input) => {
        assert.ok(input.compositionProfile !== 'invoke-krea2-global-support-v1')
        dispatched.resolve(input)
        return await late.promise
      },
      ready: REGIONAL_QUEUE_READY,
    })
    const input = await dispatched.promise
    const canceled = processor.cancelAndWait(queued.id)
    await closing.promise
    const beforeExit = await row(fixture, queued.id)
    assert.equal(beforeExit.status, 'running')
    assert.equal(beforeExit.error_code, 'USER_CANCELED')
    assert.equal(await fixture.queue.claimNextPendingRegional(), null)
    physicalExit.resolve()
    assert.equal((await canceled).status, 'canceled')
    assert.equal((await run).kind, 'canceled')
    late.resolve(resultFor(fixture, input))
    await late.promise
    assert.equal(
      (await fixture.staging.listVerifiedRegionalCandidates(queued.localProjectKey)).length,
      0,
    )
    assert.equal(await fixture.staging.hasPublicationReceipt(queued.id), false)
  } finally {
    await fixture.close()
  }
})

test('unconfirmed close retains running ownership until explicit close retry succeeds', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const processor = new RegionalGenerationProcessor(
      fixture.queue,
      fixture.staging,
      fixture.models,
    )
    let closes = 0
    const transport = {
      close: async () => {
        if (++closes === 1) {
          throw new Error('physical exit unconfirmed')
        }
      },
      executeCurrentCanvasRegional: async () => {
        throw new Error('injected native failure')
      },
      ready: REGIONAL_QUEUE_READY,
    }
    await assert.rejects(processor.runOne(transport), code('WORKER_EXIT_UNCONFIRMED'))
    assert.equal((await row(fixture, queued.id)).status, 'running')
    await assert.rejects(processor.runOne(transport), code('WORKER_EXIT_UNCONFIRMED'))
    assert.equal((await processor.cancelAndWait(queued.id)).status, 'canceled')
    assert.equal(closes, 2)
    const source = await row(fixture, queued.id)
    const retry = await fixture.queue.retryCurrentCanvasRegionalTerminal(
      queued.id,
      source.status_sequence,
    )
    const recovered = await processor.runOne({
      close: async () => {},
      executeCurrentCanvasRegional: async (input) => resultFor(fixture, input),
      ready: REGIONAL_QUEUE_READY,
    })
    assert.equal(recovered.kind, 'completed')
    assert.equal((await row(fixture, retry.id)).status, 'completed')
  } finally {
    await fixture.close()
  }
})

test('cancellation which races a private claim is observed before native dispatch', async () => {
  const reached = deferred()
  const resume = deferred()
  const fixture = await createRegionalQueueFixture({
    queueHooks: {
      beforeClaimUpdate: async () => {
        reached.resolve()
        await resume.promise
      },
    },
  })
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const processor = new RegionalGenerationProcessor(
      fixture.queue,
      fixture.staging,
      fixture.models,
    )
    let closes = 0
    const run = processor.runOne({
      close: async () => {
        closes++
      },
      executeCurrentCanvasRegional: async () => assert.fail('Cancel won before encoding.'),
      ready: REGIONAL_QUEUE_READY,
    })
    await reached.promise
    const canceled = processor.cancelAndWait(queued.id)
    resume.resolve()
    assert.equal((await canceled).status, 'canceled')
    assert.equal((await run).kind, 'canceled')
    assert.equal(closes, 1)
    assert.equal((await row(fixture, queued.id)).status, 'canceled')
  } finally {
    resume.resolve()
    await fixture.close()
  }
})

test('stop joins a pending claim and prevents all subsequent regional dispatch', async () => {
  const reached = deferred()
  const resume = deferred()
  const fixture = await createRegionalQueueFixture({
    queueHooks: {
      beforeClaimUpdate: async () => {
        reached.resolve()
        await resume.promise
      },
    },
  })
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const processor = new RegionalGenerationProcessor(
      fixture.queue,
      fixture.staging,
      fixture.models,
    )
    const transport = {
      close: async () => {},
      executeCurrentCanvasRegional: async () => assert.fail('Stopped before dispatch.'),
      ready: REGIONAL_QUEUE_READY,
    }
    const run = processor.runOne(transport)
    await reached.promise
    const stopped = processor.stopAndCancelActive()
    resume.resolve()
    await stopped
    assert.equal((await run).kind, 'canceled')
    assert.equal((await row(fixture, queued.id)).status, 'canceled')
    await assert.rejects(processor.runOne(transport), code('CLOSED'))
  } finally {
    resume.resolve()
    await fixture.close()
  }
})

test('cancel during manifest publication joins the durable completion transaction', async () => {
  const published = deferred()
  const resume = deferred()
  const fixture = await createRegionalQueueFixture({
    stagingHooks: {
      afterManifestPublish: async () => {
        published.resolve()
        await resume.promise
      },
    },
  })
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const processor = new RegionalGenerationProcessor(
      fixture.queue,
      fixture.staging,
      fixture.models,
    )
    const run = processor.runOne({
      close: async () => assert.fail('Native work already completed.'),
      executeCurrentCanvasRegional: async (input) => resultFor(fixture, input),
      ready: REGIONAL_QUEUE_READY,
    })
    await published.promise
    const cancellation = processor.cancelAndWait(queued.id)
    assert.equal((await row(fixture, queued.id)).error_code, null)
    resume.resolve()
    assert.equal((await cancellation).status, 'completed')
    assert.equal((await run).kind, 'completed')
    assert.equal(
      (await fixture.staging.listVerifiedRegionalCandidates(queued.localProjectKey)).length,
      1,
    )
  } finally {
    resume.resolve()
    await fixture.close()
  }
})

test('manifest-first uncertainty stays fenced and restart reconciles the exact private candidate', async () => {
  let fail = true
  const fixture = await createRegionalQueueFixture({
    stagingHooks: {
      afterManifestPublish: async () => {
        if (fail) {
          throw new Error('injected interruption after manifest sync')
        }
      },
    },
  })
  try {
    const queued = await enqueueRegionalFixture(fixture)
    const processor = new RegionalGenerationProcessor(
      fixture.queue,
      fixture.staging,
      fixture.models,
    )
    const transport = {
      close: async () => {},
      executeCurrentCanvasRegional: async (input: OperationalRegionalWorkerInput) =>
        resultFor(fixture, input),
      ready: REGIONAL_QUEUE_READY,
    }
    await assert.rejects(processor.runOne(transport), code('PUBLICATION_UNCERTAIN'))
    assert.equal((await row(fixture, queued.id)).status, 'running')
    assert.equal(await fixture.staging.hasPublicationReceipt(queued.id), true)
    await assert.rejects(processor.runOne(transport), code('PUBLICATION_UNCERTAIN'))
    await assert.rejects(processor.cancelAndWait(queued.id), code('PUBLICATION_UNCERTAIN'))
    fail = false
    const queue = new GenerationQueueRepository(fixture.db, fixture.root)
    const staging = new GenerationStagingRepository(fixture.db, fixture.root)
    await queue.recoverAfterRestart()
    assert.equal((await staging.recoverAfterRestart()).reconciledCount, 1)
    const candidates = await staging.listVerifiedRegionalCandidates(queued.localProjectKey)
    assert.equal(candidates.length, 1)
    assert.ok((await readFile(candidates[0].assetPath)).equals(fixture.outputBytes))
    assert.equal((await row(fixture, queued.id)).status, 'completed')
    assert.equal((await staging.listVerifiedCandidates(queued.localProjectKey)).length, 0)
  } finally {
    await fixture.close()
  }
})
