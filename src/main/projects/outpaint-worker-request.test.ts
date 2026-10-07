import {
  supportsInferenceAnimaOutpaint,
  supportsInferenceEuler,
  supportsInferenceOutpaint,
} from '../../shared/projects/inference-worker-capabilities.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import { GenerationProcessor, type GenerationWorkerTransport } from './generation-processor.js'
import { buildFrozenQueuedOutpaintV1, parseFrozenGenerationPayloadV1 } from './generation-queue.js'
import {
  buildQueuedOutpaintWorkerRequest,
  captureOutpaintWorkerRequest,
  isOutpaintWorkerRequest,
} from './outpaint-worker-request.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ANIMA_BATCH_READY, animaFixturePng } from './test-fixtures/anima-batch.js'
import {
  enqueueOutpaintConsumerBatch,
  withOutpaintConsumerFixture,
} from './test-fixtures/outpaint-consumers.js'
import { OUTPAINT_READY } from './test-fixtures/outpaint-ready.js'

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} strict wire retains outpaint identity and numeric options without an RGB fallback`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const payload = buildFrozenQueuedOutpaintV1(fixture.outpaintPrepared, randomUUID())
      const provisionalRoot = path.join(fixture.scratch, 'request')
      const request = buildQueuedOutpaintWorkerRequest({
        infill: await fixture.infillResolver.resolveVerifiedOutpaintInfill(),
        outputPath: path.join(provisionalRoot, 'result.png'),
        payload,
        provisionalRoot,
        ready: OUTPAINT_READY,
        requestId: randomUUID(),
        targetPath: path.join(provisionalRoot, 'target.png'),
      })
      assert.equal(request.type, `generate-${family}-outpaint`)
      assert.deepEqual(request.job.conditioning, payload.context.conditioning)
      assert.deepEqual(request.job.sampling, payload.workerJob.sampling)
      assert.deepEqual(request.job.prompts, payload.workerJob.prompts)
      assert.deepEqual(captureOutpaintWorkerRequest(request, OUTPAINT_READY), request)
      for (const mutate of [
        (value: typeof request) => {
          value.job.conditioning = {
            ...value.job.conditioning,
            policy: { ...value.job.conditioning.policy, outputMode: 'composited' },
          } as never
        },
        (value: typeof request) => {
          Object.assign(value.job, { target: { ...value.job.target, sha256: 'f'.repeat(64) } })
        },
        (value: typeof request) => {
          Object.assign(value.job, { bbox: { ...value.job.bbox, x: value.job.bbox.x + 1 } })
        },
        (value: typeof request) => {
          value.job.infillResource.path = value.job.target.path
        },
        (value: typeof request) => {
          Object.assign(value.job, { maskPath: '/renderer/forged.png' })
        },
      ]) {
        const altered = structuredClone(request)
        mutate(altered)
        assert.throws(() => captureOutpaintWorkerRequest(altered, OUTPAINT_READY))
      }
      assert.throws(
        () => captureOutpaintWorkerRequest(request, ANIMA_BATCH_READY),
        /has not qualified/,
      )
      assert.equal(request.job.conditioning.policy.outputMode, 'contribution')
    })
  })

  test(`${family} actual queue dispatches explicit command and publishes independently verified RGBA`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const { items } = await enqueueOutpaintConsumerBatch(fixture)
      let generated = 0
      const transport: GenerationWorkerTransport = {
        close: async () => {},
        generate: async (request, onProgress) => {
          generated++
          assert.ok(isOutpaintWorkerRequest(request))
          assert.equal(request.type, `generate-${family}-outpaint`)
          assert.deepEqual(request.job.conditioning, fixture.outpaintPrepared.context.conditioning)
          assert.deepEqual(
            request.job.prompts,
            (await fixture.queue.loadVerifiedInput(items[0].id)).payload.workerJob.prompts,
          )
          const totalSteps =
            request.type === 'generate-anima-outpaint' ? request.job.sampling.totalSteps : 1
          onProgress?.({ step: 1, totalSteps })
          // This source is uniformly soft 128: native expansion permits every output pixel.
          // The independently checked neighboring output is all255 RGBA, not source alpha128.
          await writeFile(request.job.output.pngPath, await animaFixturePng(255))
          return {
            outputPath: request.job.output.pngPath,
            protocolVersion: '1',
            requestId: request.requestId,
            seed: request.job.sampling.seed,
            type: 'generation-done',
          }
        },
        ready: OUTPAINT_READY,
      }
      const processor = new GenerationProcessor(
        fixture.queue,
        fixture.staging,
        fixture.outpaintModels,
        fixture.scratch,
        fixture.infillResolver,
      )
      const result = await processor.runOne(transport)
      assert.equal(result.kind, 'completed')
      if (result.kind !== 'completed') {
        assert.fail('Expected a published candidate.')
      }
      assert.equal(
        parseFrozenGenerationPayloadV1(result.candidate.frozenPayloadJson).kind,
        `${family}-outpaint`,
      )
      assert.equal(generated, 1)
      assert.equal((await fixture.queue.getManagerEntry(items[0].id)).status, 'completed')
      assert.equal(await fixture.staging.hasPublicationReceipt(items[0].id), true)
      assert.equal(
        (await fixture.staging.listVerifiedCandidates(localProjectRecoveryKey(fixture.projectPath)))
          .length,
        1,
      )
      assert.deepEqual(await readdir(fixture.scratch), [])
    })
  })

  test(`${family} an actual terminal seed deviation is retained without rewriting frozen inputs`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const { items } = await enqueueOutpaintConsumerBatch(fixture)
      let closed = 0
      const transport: GenerationWorkerTransport = {
        close: async () => {
          closed++
        },
        generate: async (request) => {
          await writeFile(request.job.output.pngPath, await animaFixturePng(255))
          return {
            outputPath: request.job.output.pngPath,
            protocolVersion: '1',
            requestId: request.requestId,
            seed: (request.job.sampling.seed + 1) >>> 0,
            type: 'generation-done',
          }
        },
        ready: OUTPAINT_READY,
      }
      const processor = new GenerationProcessor(
        fixture.queue,
        fixture.staging,
        fixture.outpaintModels,
        fixture.scratch,
        fixture.infillResolver,
      )
      const result = await processor.runOne(transport)
      assert.equal(result.kind, 'completed')
      if (result.kind !== 'completed') {
        assert.fail('Expected a verified actual-seed candidate.')
      }
      assert.equal(
        result.candidate.actualSeed,
        (fixture.outpaintPrepared.context.sampling.seed + 1) >>> 0,
      )
      assert.equal(
        parseFrozenGenerationPayloadV1(result.candidate.frozenPayloadJson).workerJob.sampling.seed,
        fixture.outpaintPrepared.context.sampling.seed,
      )
      assert.equal(closed, 0)
      assert.equal(await fixture.staging.hasPublicationReceipt(items[0].id), true)
      const projectKey = localProjectRecoveryKey(fixture.projectPath)
      const recovered = await fixture.staging.listVerifiedCandidates(projectKey)
      assert.equal(recovered.length, 1)
      assert.equal(recovered[0].actualSeed, result.candidate.actualSeed)
      assert.equal(
        await fixture.staging.readLastActualSeed(
          projectKey,
          fixture.outpaintPrepared.context.documentId,
        ),
        result.candidate.actualSeed,
      )
      assert.equal((await fixture.queue.getManagerEntry(items[0].id)).status, 'completed')
    })
  })
}

test('ordinary Euler strict outpaint capture requires its qualified peer and retains the exact command', async () => {
  await withOutpaintConsumerFixture('illustrious', async (fixture) => {
    const payload = buildFrozenQueuedOutpaintV1(fixture.outpaintPrepared, randomUUID())
    const provisionalRoot = path.join(fixture.scratch, 'request')
    const request = buildQueuedOutpaintWorkerRequest({
      infill: await fixture.infillResolver.resolveVerifiedOutpaintInfill(),
      outputPath: path.join(provisionalRoot, 'result.png'),
      payload,
      provisionalRoot,
      ready: OUTPAINT_READY,
      requestId: randomUUID(),
      targetPath: path.join(provisionalRoot, 'target.png'),
    })
    assert.equal(request.type, 'generate-illustrious-outpaint')
    if (request.type !== 'generate-illustrious-outpaint') {
      throw new Error('The Illustrious fixture returned another command.')
    }
    request.job.sampling.scheduler = 'euler'
    const expected = structuredClone(request)
    const ready = {
      ...OUTPAINT_READY,
      capabilities: [...OUTPAINT_READY.capabilities, 'illustrious-euler'],
      workerVersion: '0.13.0',
    }
    const captured = captureOutpaintWorkerRequest(request, ready)
    assert.deepEqual(captured, expected)
    request.job.sampling.scheduler = 'euler_a'
    assert.equal(captured.job.sampling.scheduler, 'euler')

    for (const peer of [
      { ...ready, workerVersion: '0.12.0' },
      { ...ready, capabilities: OUTPAINT_READY.capabilities },
    ]) {
      assert.throws(
        () => captureOutpaintWorkerRequest(expected, peer),
        /has not qualified ordinary Illustrious Euler/,
      )
      assert.deepEqual(captureOutpaintWorkerRequest(request, peer), request)
    }
    assert.equal(expected.job.sampling.scheduler, 'euler')
    assert.deepEqual(captured.job.conditioning, payload.context.conditioning)
    assert.deepEqual(captured.job.target, expected.job.target)
    assert.deepEqual(captured.job.infillResource, expected.job.infillResource)
  })
})

test('native Anima Euler outpaint capture remains independent of the Illustrious Euler capability', async () => {
  await withOutpaintConsumerFixture('anima', async (fixture) => {
    const payload = buildFrozenQueuedOutpaintV1(fixture.outpaintPrepared, randomUUID())
    const provisionalRoot = path.join(fixture.scratch, 'request')
    const request = buildQueuedOutpaintWorkerRequest({
      infill: await fixture.infillResolver.resolveVerifiedOutpaintInfill(),
      outputPath: path.join(provisionalRoot, 'result.png'),
      payload,
      provisionalRoot,
      ready: OUTPAINT_READY,
      requestId: randomUUID(),
      targetPath: path.join(provisionalRoot, 'target.png'),
    })
    assert.equal(request.type, 'generate-anima-outpaint')
    // The preparation fixture compiles the native Anima Euler plan before this capture.
    assert.equal(request.job.sampling.scheduler, 'euler')
    for (const peer of [OUTPAINT_READY, { ...OUTPAINT_READY, workerVersion: '0.13.0' }]) {
      assert.equal(supportsInferenceEuler(peer), false)
      assert.deepEqual(captureOutpaintWorkerRequest(request, peer), request)
    }
  })
})

test('outpaint capability qualification preserves legacy peers and Illustrious without native BF16', () => {
  assert.equal(supportsInferenceOutpaint(ANIMA_BATCH_READY), false)
  assert.equal(supportsInferenceAnimaOutpaint(ANIMA_BATCH_READY), false)
  assert.equal(supportsInferenceAnimaOutpaint(OUTPAINT_READY), true)
  const illustriousOnly = {
    ...OUTPAINT_READY,
    capabilities: OUTPAINT_READY.capabilities.filter((value) => !value.startsWith('anima-')),
  }
  assert.equal(supportsInferenceOutpaint(illustriousOnly), true)
  assert.equal(supportsInferenceAnimaOutpaint(illustriousOnly), false)
  for (const missing of OUTPAINT_READY.capabilities) {
    const peer = {
      ...OUTPAINT_READY,
      capabilities: OUTPAINT_READY.capabilities.filter((value) => value !== missing),
    }
    assert.equal(supportsInferenceAnimaOutpaint(peer), false, missing)
  }
  assert.equal(supportsInferenceOutpaint({ ...OUTPAINT_READY, workerVersion: '0.13.0' }), true)
  assert.equal(supportsInferenceEuler({ ...OUTPAINT_READY, workerVersion: '0.13.0' }), false)
  for (const workerVersion of ['0.11.0', '0.12.1', '0.14.0']) {
    assert.equal(supportsInferenceOutpaint({ ...OUTPAINT_READY, workerVersion }), false)
  }
})
