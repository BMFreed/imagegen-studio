import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { RegionalWorkerInput } from './regional-worker-request.js'
import type { RegionalQueueFixture } from './test-fixtures/regional-queue.js'

import { GenerationQueueRepository } from './generation-queue.js'
import {
  loadRegionalQueuedInput,
  parseAcceptedGenerationBaseV1,
  parseFrozenQueuedRegionalInvokeV1,
  parseFrozenQueuedRegionalV1,
} from './regional-queued-generation.js'
import { createRegionalQueueFixture } from './test-fixtures/regional-queue.js'

const INITIALIZATION = 'invoke-cpu-f32-add-noise-v1' as const

/** Real migrated queue/filesystem; no public Generate, worker or trained-model claim. */
function publicInput(fixture: RegionalQueueFixture, initialized: boolean) {
  fixture.prepared.context.sampling.sampler = initialized ? 'Euler a' : 'Euler'
  fixture.prepared.context.sampling.invokeScheduler = initialized ? 'euler_a' : 'euler'
  fixture.request.job.sampling.scheduler = initialized ? 'euler_a' : 'euler'
  return {
    ...fixture.regional,
    compositionProfile: 'invoke-canvas-v1' as const,
    ...(initialized ? { initializationProfile: INITIALIZATION } : {}),
  }
}

async function enqueue(
  fixture: RegionalQueueFixture,
  regional: Omit<RegionalWorkerInput, 'request'>,
) {
  return await fixture.queue.enqueueInvokeCanvasRegional({
    prepared: fixture.prepared,
    projectPath: fixture.projectPath,
    regional,
    request: fixture.request,
    stagingSessionId: randomUUID(),
  })
}

for (const initialized of [false, true]) {
  test(`public frozen sampler matrix retains exact initialization presence: ${initialized ? 'Euler a' : 'Euler'}`, async () => {
    const f = await createRegionalQueueFixture()
    try {
      const item = await enqueue(f, publicInput(f, initialized))
      const loaded = await f.queue.loadVerifiedRegionalInput(item.id)
      const parsed = parseFrozenQueuedRegionalInvokeV1(JSON.stringify(loaded.payload))
      assert.equal(parsed.kind, 'illustrious-regional-txt2img')
      assert.equal(parsed.compositionProfile, 'invoke-canvas-v1')
      assert.equal(Object.hasOwn(parsed, 'initializationProfile'), initialized)
      assert.equal(parsed.initializationProfile, initialized ? INITIALIZATION : undefined)
      assert.equal(loaded.input.initializationProfile, parsed.initializationProfile)
      assert.equal(parsed.workerJob.sampling.scheduler, initialized ? 'euler_a' : 'euler')
      const metadata = JSON.parse(
        await readFile(path.join(path.dirname(loaded.targetPath), 'regional.json'), 'utf8'),
      ) as Record<string, unknown>
      assert.equal(Object.hasOwn(metadata, 'initializationProfile'), initialized)
      assert.equal(metadata.initializationProfile, parsed.initializationProfile)
      assert.equal(
        (await f.queue.getManagerEntry(item.id)).details?.sampling.sampler,
        initialized ? 'Euler a' : 'Euler',
      )
      assert.throws(() => parseFrozenQueuedRegionalV1(JSON.stringify(parsed)), {
        code: 'QUEUE_INPUT_INVALID',
      })
      const base = parseAcceptedGenerationBaseV1(JSON.stringify(parsed))
      assert.equal(base.kind, 'illustrious-txt2img')
      if (base.kind !== 'illustrious-txt2img') {
        assert.fail('Public regional provenance must project an ordinary Illustrious base.')
      }
      assert.ok(!('regional' in base))
      assert.ok(!('compositionProfile' in base))
      assert.ok(!('initializationProfile' in base))
      assert.deepEqual(base.context, parsed.context)
      assert.deepEqual(base.workerJob, parsed.workerJob)
    } finally {
      await f.close()
    }
  })
}

test('public initialized Retry keeps frozen policy after restart and later caller changes', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const regional = publicInput(f, true)
    const expected = structuredClone(regional.recipe)
    const pending = enqueue(f, regional)
    delete regional.initializationProfile
    regional.recipe.regions[0].positive!.text = 'later authoring'
    regional.recipe.regions[0].coverage.alpha.fill(17)
    const item = await pending
    await rm(f.request.job.target.path)
    assert.equal((await f.queue.claimNextPendingInvokeCanvasRegional())?.item.id, item.id)
    const reopened = new GenerationQueueRepository(f.db, f.root)
    assert.equal((await reopened.recoverAfterRestart()).canceledCount, 1)
    const source = await reopened.loadVerifiedRegionalInput(item.id)
    f.prepared.context.sampling.sampler = 'Euler'
    f.prepared.context.sampling.invokeScheduler = 'euler'
    f.request.job.sampling.scheduler = 'euler'
    const retried = await reopened.retryInvokeCanvasRegionalTerminal(
      item.id,
      source.item.statusSequence,
    )
    const copied = await reopened.loadVerifiedRegionalInput(retried.id)
    assert.deepEqual(copied.payload, source.payload)
    assert.deepEqual(copied.input.recipe, expected)
    assert.equal(copied.input.initializationProfile, INITIALIZATION)
    assert.equal(copied.input.request.job.sampling.scheduler, 'euler_a')
    assert.notEqual(copied.targetPath, source.targetPath)
    assert.ok((await readFile(copied.targetPath)).equals(f.prepared.targetPngBytes))
    assert.equal((await reopened.getManagerEntry(retried.id)).details?.sampling.sampler, 'Euler a')
  } finally {
    await f.close()
  }
})

const refusedPairs = [
  { marker: undefined, scheduler: 'euler_a' },
  { marker: INITIALIZATION, scheduler: 'euler' },
  { marker: null, scheduler: 'euler_a' },
  { marker: 'invoke-cpu-f32-add-noise-v2', scheduler: 'euler_a' },
  { marker: {}, scheduler: 'euler_a' },
] as const

for (const [index, pair] of refusedPairs.entries()) {
  test(`public sampler/initialization mismatch refuses before publication: ${index}`, async () => {
    const f = await createRegionalQueueFixture()
    try {
      const regional = publicInput(f, pair.scheduler === 'euler_a')
      if (pair.marker === undefined) {
        delete regional.initializationProfile
      } else {
        Object.assign(regional, { initializationProfile: pair.marker })
      }
      let preflightCalls = 0
      await assert.rejects(
        f.queue.enqueueInvokeCanvasRegional({
          preflight: async () => {
            preflightCalls++
          },
          prepared: f.prepared,
          projectPath: f.projectPath,
          regional,
          request: f.request,
          stagingSessionId: randomUUID(),
        }),
        { code: 'QUEUE_INPUT_INVALID' },
      )
      assert.equal(preflightCalls, 0)
      assert.equal(
        (await f.db.selectFrom('generation_queue_item').select('id').execute()).length,
        0,
      )
      assert.equal(
        (await f.db.selectFrom('generation_candidate_receipt').select('candidate_id').execute())
          .length,
        0,
      )
    } finally {
      await f.close()
    }
  })
}

test('public frozen parser refuses downgrades and unknown explicit versions', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const item = await enqueue(f, publicInput(f, true))
    const { payload } = await f.queue.loadVerifiedRegionalInput(item.id)
    const { initializationProfile: _initialization, ...absent } = payload
    for (const altered of [
      absent,
      { ...payload, initializationProfile: null },
      { ...payload, initializationProfile: 'invoke-cpu-f32-add-noise-v2' },
    ]) {
      assert.throws(() => parseFrozenQueuedRegionalInvokeV1(JSON.stringify(altered)), {
        code: 'QUEUE_INPUT_INVALID',
      })
    }
    assert.equal(
      parseFrozenQueuedRegionalInvokeV1(JSON.stringify(payload)).initializationProfile,
      INITIALIZATION,
    )
  } finally {
    await f.close()
  }
})

test('public initialized recipe metadata cannot be downgraded independently of the frozen payload', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const initialized = await enqueue(f, publicInput(f, true))
    const control = await enqueue(f, publicInput(f, false))
    const loaded = await f.queue.loadVerifiedRegionalInput(initialized.id)
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
      regional: {
        byteSize: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    }
    await assert.rejects(loadRegionalQueuedInput(root, payload, loaded.input.request), {
      code: 'QUEUE_INPUT_INVALID',
    })
    assert.equal(
      (await f.queue.loadVerifiedRegionalInput(control.id)).input.initializationProfile,
      undefined,
    )
  } finally {
    await f.close()
  }
})
