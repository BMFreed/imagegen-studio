import assert from 'node:assert/strict'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { AnimaGenerationModelResolver } from './anima-generation-preparation.js'
import type { FrozenQueuedAnimaGenerationV1 } from './anima-queued-generation.js'

import { withQueuedAnimaGenerationRequest } from './anima-queued-request.js'
import { ANIMA_BATCH_READY } from './test-fixtures/anima-batch.js'
import { enqueueAnimaStagingBatch, withAnimaStagingFixture } from './test-fixtures/anima-staging.js'

test('Anima Retry lease captures durable prompts, zero seed, byte buffer and peer before awaits, then cleans only its stage', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const { items } = await enqueueAnimaStagingBatch(fixture)
    const frozenInput = await fixture.queue.loadVerifiedInput(items[0].id)
    const frozen = { ...frozenInput, targetPngBytes: await readFile(frozenInput.targetPath) }
    assert.ok(frozen.payload.kind === 'anima-txt2img' || frozen.payload.kind === 'anima-img2img')
    const payload = frozen.payload
    const original = structuredClone(payload)
    const bytes = Buffer.from(frozen.targetPngBytes)
    const ready = structuredClone(ANIMA_BATCH_READY)
    const neighbor = path.join(fixture.scratch, 'neighbor.txt')
    await writeFile(neighbor, 'keep')
    let calls = 0
    let stage = ''
    const models: AnimaGenerationModelResolver = {
      ...fixture.modelService,
      resolveVerifiedGenerationAnimaBundleForPlan: async (reference) => {
        if (++calls === 1) {
          payload.context.prompts.positive = 'later edit'
          payload.context.sampling.seed = 29
          bytes.fill(0)
          ready.capabilities.length = 0
        }
        return await fixture.modelService.resolveVerifiedGenerationAnimaBundleForPlan(reference)
      },
    }
    await withQueuedAnimaGenerationRequest({
      modelService: models,
      payload,
      ready,
      scratchBasePath: fixture.scratch,
      targetPngBytes: bytes,
      use: async (request) => {
        stage = request.job.output.stagingRoot
        assert.match(path.basename(stage), /^anima-request-/)
        assert.equal(request.job.output.pngPath, path.join(stage, 'result.png'))
        assert.equal((await stat(stage)).mode & 0o777, 0o700)
        assert.equal((await stat(request.job.target.path)).mode & 0o777, 0o600)
        assert.deepEqual(await readFile(request.job.target.path), frozen.targetPngBytes)
        assert.deepEqual(request.job.prompts, original.workerJob.prompts)
        assert.deepEqual(request.job.sampling, original.workerJob.sampling)
        assert.equal(request.job.sampling.seed, 0)
        assert.notEqual(request.requestId, original.originRequestId)
        throw new Error('consumer refusal')
      },
    }).then(
      () => assert.fail('Consumer refusal must escape.'),
      (error: unknown) => assert.equal((error as Error).message, 'consumer refusal'),
    )
    assert.equal(calls, 2, 'Resources are requalified after target write too.')
    await assert.rejects(stat(stage), { code: 'ENOENT' })
    assert.equal(await readFile(neighbor, 'utf8'), 'keep')
  })
})

test('Anima Retry lease refuses incompatible peers and changed pixels before resource resolution or scratch creation', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const { items } = await enqueueAnimaStagingBatch(fixture)
    const frozenInput = await fixture.queue.loadVerifiedInput(items[0].id)
    const frozen = { ...frozenInput, targetPngBytes: await readFile(frozenInput.targetPath) }
    assert.ok(frozen.payload.kind === 'anima-txt2img' || frozen.payload.kind === 'anima-img2img')
    let resolved = 0
    const models: AnimaGenerationModelResolver = {
      ...fixture.modelService,
      resolveVerifiedGenerationAnimaBundleForPlan: async (reference) => {
        resolved++
        return await fixture.modelService.resolveVerifiedGenerationAnimaBundleForPlan(reference)
      },
    }
    const options = {
      modelService: models,
      payload: frozen.payload,
      ready: ANIMA_BATCH_READY,
      scratchBasePath: fixture.scratch,
      targetPngBytes: frozen.targetPngBytes,
      use: async () => assert.fail('Refused input cannot reach consumer.'),
    }
    const before = await readdir(fixture.scratch)
    await assert.rejects(
      withQueuedAnimaGenerationRequest({
        ...options,
        ready: { ...ANIMA_BATCH_READY, capabilities: [] },
      }),
      { code: 'INFERENCE_UNAVAILABLE' },
    )
    await assert.rejects(
      withQueuedAnimaGenerationRequest({ ...options, targetPngBytes: Buffer.alloc(1) }),
      { code: 'GENERATION_TARGET_CHANGED' },
    )
    assert.equal(resolved, 0)
    assert.deepEqual(await readdir(fixture.scratch), before)
  })
})

test('Anima Retry lease refuses resource and target changes during its last qualification and removes its private stage', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const { items } = await enqueueAnimaStagingBatch(fixture)
    const frozenInput = await fixture.queue.loadVerifiedInput(items[0].id)
    const frozen = { ...frozenInput, targetPngBytes: await readFile(frozenInput.targetPath) }
    assert.ok(frozen.payload.kind === 'anima-txt2img' || frozen.payload.kind === 'anima-img2img')
    const payload: FrozenQueuedAnimaGenerationV1 = frozen.payload
    const before = await readdir(fixture.scratch)
    for (const change of ['bundle', 'target'] as const) {
      let calls = 0
      const models: AnimaGenerationModelResolver = {
        ...fixture.modelService,
        resolveVerifiedGenerationAnimaBundleForPlan: async (reference) => {
          const bundle =
            await fixture.modelService.resolveVerifiedGenerationAnimaBundleForPlan(reference)
          if (++calls === 2) {
            if (change === 'bundle') {
              return { ...bundle, qwen3Encoder: { ...bundle.qwen3Encoder, byteSize: 999 } }
            }
            const stage = (await readdir(fixture.scratch)).find((entry) =>
              entry.startsWith('anima-request-'),
            )!
            await writeFile(path.join(fixture.scratch, stage, 'target.png'), 'replacement')
          }
          return bundle
        },
      }
      await assert.rejects(
        withQueuedAnimaGenerationRequest({
          modelService: models,
          payload,
          ready: ANIMA_BATCH_READY,
          scratchBasePath: fixture.scratch,
          targetPngBytes: frozen.targetPngBytes,
          use: async () => assert.fail('Changed input cannot reach consumer.'),
        }),
        { code: change === 'bundle' ? 'QUEUE_INPUT_INVALID' : 'GENERATION_INPUT_CHANGED' },
      )
      assert.deepEqual(await readdir(fixture.scratch), before)
    }
  })
})
