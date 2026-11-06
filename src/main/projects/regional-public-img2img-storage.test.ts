/**
 * Authored real SQLite/files/receipt/reload tests; ROOT alone executes them. The numerical
 * transport below is controlled and does not qualify native inference. InvokeAI a61ac4fb freezes
 * image references/strength in its Canvas graph and retries the stored root graph. This adapter
 * must preserve that ownership across reload.
 */
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { isGenerationQueuePage } from '../../shared/projects/generation-queue-manager.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type {
  IllustriousImg2ImgRequestV1,
  InferenceWorkerReady,
} from './illustrious-txt2img-job.js'
import type { PreparedNormalGeneration } from './project-generation-preparation.js'
import type { RegionalWorkerInput, RegionalWorkerResult } from './regional-worker-request.js'
import type { RegionalQueueFixture } from './test-fixtures/regional-queue.js'

import { GenerationQueueRepository } from './generation-queue.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { RegionalGenerationProcessor } from './regional-generation-processor.js'
import {
  parseAcceptedGenerationBaseV1,
  parseFrozenQueuedRegionalInvokeV1,
  parseFrozenQueuedRegionalV1,
} from './regional-queued-generation.js'
import {
  createRegionalQueueFixture,
  enqueueRegionalFixture,
  REGIONAL_QUEUE_READY,
  regionalFixtureSha256,
} from './test-fixtures/regional-queue.js'

const READY: InferenceWorkerReady = {
  ...REGIONAL_QUEUE_READY,
  capabilities: [
    ...REGIONAL_QUEUE_READY.capabilities,
    'illustrious-regional-invoke-v1',
    'illustrious-regional-img2img-v1',
    'illustrious-regional-progress-v1',
  ],
}

function opaquePng(profile: Buffer): Buffer {
  const chunk = (name: string, bytes: Buffer): Buffer => {
    const out = Buffer.alloc(bytes.length + 12)
    out.writeUInt32BE(bytes.length)
    out.write(name, 4)
    bytes.copy(out, 8)
    out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(64)
  header.writeUInt32BE(64, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc((64 * 4 + 1) * 64)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      rows.set([x * 3, y * 3, (x + y) % 256, 255], y * 257 + 1 + x * 4)
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('iCCP', Buffer.concat([Buffer.from('srgb\0\0'), deflateSync(profile)])),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

async function imageInput(f: RegionalQueueFixture, strength = 0.5, steps = 30) {
  const bytes = opaquePng(
    await readFile(path.resolve('worker-python/src/imagegen_worker/srgb.icc')),
  )
  const targetPath = path.join(
    path.dirname(f.request.job.target.path),
    `opaque-${randomUUID()}.png`,
  )
  await writeFile(targetPath, bytes, { flag: 'wx', mode: 0o600 })
  const descriptor = { byteSize: bytes.length, sha256: regionalFixtureSha256(bytes) }
  const prepared: PreparedNormalGeneration = {
    context: {
      ...structuredClone(f.prepared.context),
      kind: 'normal-img2img-preparation',
      sampling: { ...f.prepared.context.sampling, denoisingStrength: strength, steps },
      target: { ...f.prepared.context.target, ...descriptor },
    },
    targetPngBytes: bytes,
  }
  const request: IllustriousImg2ImgRequestV1 = {
    ...structuredClone(f.request),
    job: {
      ...structuredClone(f.request.job),
      sampling: { ...f.request.job.sampling, denoisingStrength: strength, steps },
      target: { ...f.request.job.target, ...descriptor, path: targetPath },
    },
    requestId: randomUUID(),
    type: 'generate-illustrious-img2img',
  }
  return {
    prepared,
    regional: { ...structuredClone(f.regional), compositionProfile: 'invoke-canvas-v1' as const },
    request,
  }
}

async function enqueue(
  f: RegionalQueueFixture,
  input: Awaited<ReturnType<typeof imageInput>>,
  queue = f.queue,
) {
  const stagingSessionId = randomUUID()
  return await queue.enqueueInvokeCanvasRegional({
    ...input,
    preflight: async (entries) =>
      await f.staging.preflightRegionalBatchCapacity({
        entries,
        localProjectKey: localProjectRecoveryKey(f.projectPath),
        projectPath: f.projectPath,
        stagingSessionId,
      }),
    projectPath: f.projectPath,
    stagingSessionId,
  })
}

function resultFor(f: RegionalQueueFixture, input: RegionalWorkerInput): RegionalWorkerResult {
  return {
    output: {
      byteSize: f.outputBytes.length,
      colorSpace: 'srgb',
      height: 64,
      iccSha256: IGS_SRGB_ICC_SHA256,
      path: path.join(f.root, 'already-disposed.png'),
      sha256: regionalFixtureSha256(f.outputBytes),
      width: 64,
    },
    pngBytes: Buffer.from(f.outputBytes),
    seed: input.request.job.sampling.seed,
  }
}

for (const strength of [0, 0.5, 1]) {
  test(`public IMG freezes exact opaque pixels and strength ${strength} across parser/reload/base projection`, async () => {
    const f = await createRegionalQueueFixture()
    try {
      const input = await imageInput(f, strength)
      const item = await enqueue(f, input)
      const loaded = await f.queue.loadVerifiedRegionalInput(item.id)
      assert.equal(loaded.payload.kind, 'illustrious-regional-img2img')
      assert.ok(loaded.input.request.type === 'generate-illustrious-img2img')
      assert.equal(loaded.input.request.job.sampling.denoisingStrength, strength)
      assert.ok((await readFile(loaded.targetPath)).equals(input.prepared.targetPngBytes))
      const json = JSON.stringify(loaded.payload)
      assert.equal(parseFrozenQueuedRegionalInvokeV1(json).kind, 'illustrious-regional-img2img')
      assert.throws(() => parseFrozenQueuedRegionalV1(json), { code: 'QUEUE_INPUT_INVALID' })
      const base = parseAcceptedGenerationBaseV1(json)
      assert.ok(base.kind === 'illustrious-img2img')
      assert.equal(base.context.sampling.denoisingStrength, strength)
      assert.equal(base.workerJob.sampling.denoisingStrength, strength)
      assert.ok(
        !('regional' in base) &&
          !('compositionProfile' in base) &&
          !('initializationProfile' in base),
      )
      assert.equal(await f.queue.claimNextPending(), null)
      const page = await f.queue.listManagerPage()
      assert.equal(isGenerationQueuePage(page), true)
      assert.equal(page.items[0].operation, 'illustrious-regional-img2img')
      assert.equal(page.items[0].details?.sampling.denoisingStrength, strength)
      const reloaded = new GenerationQueueRepository(f.db, f.dataRoot)
      await reloaded.recoverAfterRestart()
      assert.deepEqual((await reloaded.loadVerifiedRegionalInput(item.id)).payload, loaded.payload)
    } finally {
      await f.close()
    }
  })
}

test('public IMG/TXT share oldest-first claims and running slot while private rows stay hidden', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const privateJob = await enqueueRegionalFixture(f)
    const image = await enqueue(f, await imageInput(f))
    const text = await f.queue.enqueueInvokeCanvasRegional({
      prepared: f.prepared,
      projectPath: f.projectPath,
      regional: { ...f.regional, compositionProfile: 'invoke-canvas-v1' },
      request: f.request,
      stagingSessionId: randomUUID(),
    })
    await f.db
      .updateTable('generation_queue_item')
      .set({ created_at: '2026-01-01T00:00:00.000Z' })
      .where('id', '=', image.id)
      .execute()
    await f.db
      .updateTable('generation_queue_item')
      .set({ created_at: '2026-01-01T00:00:01.000Z' })
      .where('id', '=', text.id)
      .execute()
    const page = await f.queue.listManagerPage()
    assert.equal(page.counts.pending, 2)
    assert.ok(!page.items.some(({ id }) => id === privateJob.id))
    assert.equal(await f.queue.nextDispatchableKind(), 'regional')
    assert.equal((await f.queue.claimNextPendingInvokeCanvasRegional())?.item.id, image.id)
    assert.equal(await f.queue.claimNextPendingInvokeCanvasRegional(), null)
    assert.equal(await f.queue.claimNextPendingRegional(), null)
    assert.equal(await f.queue.claimNextPending(), null)
    const canceled = await f.queue.cancel(image.id)
    await f.queue.acknowledgeCanceledRunning(image.id, canceled.statusSequence)
    assert.equal((await f.queue.claimNextPendingInvokeCanvasRegional())?.item.id, text.id)
  } finally {
    await f.close()
  }
})

for (const strength of [0, 0.5]) {
  test(`public IMG frozen Retry retains pixels/strength ${strength}/recipe after authoring edits`, async () => {
    const f = await createRegionalQueueFixture()
    try {
      const input = await imageInput(f, strength)
      const item = await enqueue(f, input)
      const before = await f.queue.loadVerifiedRegionalInput(item.id)
      const canceled = await f.queue.cancel(item.id)
      input.prepared.context.sampling.seed = 99
      input.request.job.sampling.denoisingStrength = 0.9
      input.regional.recipe.regions[0].positive!.text = 'later authored regional prompt'
      input.regional.recipe.regions[0].coverage.alpha.fill(0)
      const copy = await f.queue.retryInvokeCanvasRegionalTerminal(item.id, canceled.statusSequence)
      const after = await f.queue.loadVerifiedRegionalInput(copy.id)
      assert.equal(
        (await f.queue.getManagerEntry(copy.id)).operation,
        'illustrious-regional-img2img',
      )
      assert.equal(after.payload.kind, 'illustrious-regional-img2img')
      assert.deepEqual(after.payload, before.payload)
      assert.deepEqual(after.input.recipe, before.input.recipe)
      assert.ok((await readFile(after.targetPath)).equals(await readFile(before.targetPath)))
      assert.ok(after.input.request.type === 'generate-illustrious-img2img')
      assert.equal(after.input.request.job.sampling.denoisingStrength, strength)
    } finally {
      await f.close()
    }
  })
}

test('IMG candidate publication preserves ordinary IMG base and independent transparent/private histories', async () => {
  const f = await createRegionalQueueFixture()
  try {
    await enqueueRegionalFixture(f)
    const image = await enqueue(f, await imageInput(f, 0))
    const claim = await f.queue.claimNextPendingInvokeCanvasRegional()
    assert.ok(claim && claim.item.id === image.id)
    const candidate = await f.staging.publishRegionalCandidate({
      actualSeed: 123,
      expectedStatusSequence: claim.item.statusSequence,
      pngBytes: f.outputBytes,
      queueItemId: image.id,
    })
    const base = parseAcceptedGenerationBaseV1(candidate.frozenPayloadJson)
    assert.ok(base.kind === 'illustrious-img2img')
    assert.equal(base.context.sampling.denoisingStrength, 0)
    assert.equal((await f.queue.getManagerEntry(image.id)).status, 'completed')
    assert.equal(
      (await f.db.selectFrom('generation_candidate_receipt').selectAll().execute()).length,
      1,
    )
    const page = await f.queue.listManagerPage()
    assert.equal(isGenerationQueuePage(page), true)
    assert.equal(page.items.length, 1)
  } finally {
    await f.close()
  }
})

for (const invalid of [
  'rescale',
  'precision',
  'initialization',
  'sampler',
  'strength-mismatch',
  'mode-mismatch',
] as const) {
  test(`IMG frozen parser refuses otherwise-valid unsupported ${invalid}`, async () => {
    const f = await createRegionalQueueFixture()
    try {
      const item = await enqueue(f, await imageInput(f))
      const loaded = await f.queue.loadVerifiedRegionalInput(item.id)
      assert.ok(loaded.payload.kind === 'illustrious-regional-img2img')
      const bad: Record<string, unknown> = { ...structuredClone(loaded.payload) }
      const context = loaded.payload.context
      const job = loaded.payload.workerJob
      if (invalid === 'rescale') {
        // Public image .7 is now valid; this negative fixture exceeds the unchanged range.
        context.sampling.cfgRescale = 1
        job.sampling.cfgRescale = 1
      }
      if (invalid === 'precision') {
        context.vaePrecision = 'Auto'
        job.vaePrecision = 'Auto'
      }
      if (invalid === 'initialization') {
        bad.initializationProfile = 'invoke-cpu-f32-add-noise-v1'
      }
      if (invalid === 'sampler') {
        context.sampling.sampler = 'Euler a'
        context.sampling.invokeScheduler = 'euler_a'
        job.sampling.scheduler = 'euler_a'
      }
      if (invalid === 'strength-mismatch') {
        job.sampling.denoisingStrength = 0.9
      }
      if (invalid === 'mode-mismatch') {
        bad.kind = 'illustrious-regional-txt2img'
      }
      bad.context = context
      bad.workerJob = job
      assert.throws(() => parseFrozenQueuedRegionalInvokeV1(JSON.stringify(bad)), {
        code: 'QUEUE_INPUT_INVALID',
      })
    } finally {
      await f.close()
    }
  })
}

test('IMG target mode and corrupted frozen Retry refuse without creating another SQL attempt', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const input = await imageInput(f)
    const wrong = structuredClone(input)
    wrong.prepared.targetPngBytes = Buffer.from(f.prepared.targetPngBytes)
    wrong.prepared.context.target = structuredClone(f.prepared.context.target)
    wrong.request.job.target = structuredClone(f.request.job.target)
    await assert.rejects(enqueue(f, wrong), { code: 'QUEUE_INPUT_INVALID' })
    assert.equal((await f.db.selectFrom('generation_queue_item').selectAll().execute()).length, 0)
    const item = await enqueue(f, input)
    const canceled = await f.queue.cancel(item.id)
    const frozen = await f.queue.loadVerifiedRegionalInput(item.id)
    await writeFile(frozen.targetPath, Buffer.from('changed frozen PNG'))
    const before = await f.db.selectFrom('generation_queue_item').selectAll().execute()
    await assert.rejects(
      f.queue.retryInvokeCanvasRegionalTerminal(item.id, canceled.statusSequence),
      { code: 'QUEUE_INPUT_INVALID' },
    )
    assert.deepEqual(await f.db.selectFrom('generation_queue_item').selectAll().execute(), before)
  } finally {
    await f.close()
  }
})

for (const strength of [0, 0.5]) {
  test(`IMG controlled transport preserves actual bounded progress at strength ${strength}`, async () => {
    const f = await createRegionalQueueFixture()
    try {
      await enqueue(f, await imageInput(f, strength))
      const processor = new RegionalGenerationProcessor(
        f.queue,
        f.staging,
        f.models,
        'invoke-canvas-v1',
      )
      const seen: { step: number; totalSteps: number }[] = []
      processor.onProgress((snapshot) => {
        if (snapshot.current) {
          seen.push({ step: snapshot.current.step, totalSteps: snapshot.current.totalSteps })
        }
      })
      const result = await processor.runOne({
        close: async () => {},
        executeCurrentCanvasRegional: async (input, send) => {
          send?.({ step: 1, totalSteps: strength === 0 ? 1 : 16 })
          send?.({ step: 2, totalSteps: 31 })
          send?.({ step: 2, totalSteps: 15 })
          send?.({ step: 2, totalSteps: 16 })
          return resultFor(f, input)
        },
        ready: READY,
      })
      assert.equal(result.kind, 'completed')
      assert.deepEqual(
        seen,
        strength === 0
          ? []
          : [
              { step: 1, totalSteps: 16 },
              { step: 2, totalSteps: 16 },
            ],
      )
      assert.equal(processor.getProgressSnapshot().current, null)
    } finally {
      await f.close()
    }
  })
}

test('IMG dispatch requires its separate capability before resource work or numerical transport', async () => {
  const f = await createRegionalQueueFixture()
  try {
    await enqueue(f, await imageInput(f))
    let numerical = 0
    let resource = 0
    const resolver = {
      ...f.models,
      resolveVerifiedGenerationCheckpointForPlan: async (
        ...args: Parameters<typeof f.models.resolveVerifiedGenerationCheckpointForPlan>
      ) => {
        resource++
        return await f.models.resolveVerifiedGenerationCheckpointForPlan(...args)
      },
    }
    const processor = new RegionalGenerationProcessor(
      f.queue,
      f.staging,
      resolver,
      'invoke-canvas-v1',
    )
    const result = await processor.runOne({
      close: async () => {},
      executeCurrentCanvasRegional: async (input) => {
        numerical++
        return resultFor(f, input)
      },
      ready: {
        ...READY,
        capabilities: READY.capabilities.filter(
          (value) => value !== 'illustrious-regional-img2img-v1',
        ),
      },
    })
    assert.equal(result.kind, 'failed')
    assert.equal(resource, 0)
    assert.equal(numerical, 0)
    assert.equal(
      (await f.db.selectFrom('generation_candidate_receipt').selectAll().execute()).length,
      0,
    )
  } finally {
    await f.close()
  }
})
