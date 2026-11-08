import type { AnimaWorkerRequest } from '../../shared/projects/anima-worker-request.js'
import { isGenerationQueuePage } from '../../shared/projects/generation-queue-manager.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { link, readdir, readFile, symlink, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type { CurrentCanvasRegionalRecipe } from './project-current-canvas-regional-recipe.js'

import { prepareAnimaGenerationBatch } from './anima-generation-batch.js'
import { withAnimaGenerationBatchRequests } from './anima-generation-request.js'
import { parseFrozenQueuedAnimaRegionalV1 } from './anima-regional-queued-generation.js'
import {
  type AnimaRegionalWorkerInput,
  captureAnimaRegionalWorkerInput,
  prepareAnimaRegionalWorkerRequest,
} from './anima-regional-worker-request.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { compileCurrentCanvasAnimaRegionalPrompts } from './project-current-canvas-anima-regional-input.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { RegionalGenerationProcessor } from './regional-generation-processor.js'
import { parseAcceptedGenerationBaseV1 } from './regional-queued-generation.js'
import { readRegionalWorkerResult } from './regional-worker-request.js'
import { ANIMA_BATCH_READY, animaFixtureSha256 } from './test-fixtures/anima-batch.js'
import { type AnimaStagingFixture, withAnimaStagingFixture } from './test-fixtures/anima-staging.js'
import { REGIONAL_QUEUE_READY } from './test-fixtures/regional-queue.js'

const READY = {
  ...REGIONAL_QUEUE_READY,
  capabilities: [
    ...REGIONAL_QUEUE_READY.capabilities,
    ...ANIMA_BATCH_READY.capabilities,
    'anima-regional-txt2img-v1',
  ],
}

function prepare(fixture: AnimaStagingFixture) {
  const context = fixture.prepared.context
  context.loras = []
  context.generationDraft.loras = []
  context.prompts = { negative: '', positive: '(cat:1.7) blue' }
  context.generationDraft.positivePrompt = { embeddingRefs: [], text: context.prompts.positive }
  context.generationDraft.negativePrompt = { embeddingRefs: [], text: '' }
  return prepareAnimaGenerationBatch({ iterations: 1, prepared: fixture.prepared })
}
function regional(
  fixture: AnimaStagingFixture,
  request: AnimaWorkerRequest,
): AnimaRegionalWorkerInput {
  const bbox = fixture.prepared.context.bbox
  const positive = { embeddingRefs: [], text: '𐐀 (red fox:2)' }
  const negative = { embeddingRefs: [], text: '' }
  const recipe: CurrentCanvasRegionalRecipe = {
    bbox,
    documentId: fixture.prepared.context.documentId,
    documentRevision: fixture.prepared.context.documentRevision,
    family: 'anima',
    globalPrompts: {
      negative,
      positive: { embeddingRefs: [], text: fixture.prepared.context.prompts.positive },
    },
    item: {
      iteration: 0,
      promptPairIndex: 0,
      prompts: fixture.prepared.context.prompts,
      seed: request.job.sampling.seed,
    },
    kind: 'current-canvas-regional-recipe',
    regions: [
      {
        authoredPrompts: { negative: null, positive, useGlobalNegativePrompt: true },
        coverage: {
          alpha: new Uint8Array(bbox.width * bbox.height).fill(180),
          bounds: bbox,
          intersection: bbox,
          kind: 'covered',
        },
        maskId: randomUUID(),
        maskRevision: 7,
        negative: { prompt: negative, source: 'current-canvas' },
        positive,
        referenceImages: [],
        regionId: randomUUID(),
      },
    ],
  }
  return {
    compiledPrompts: [...compileCurrentCanvasAnimaRegionalPrompts(recipe)],
    compositionProfile: 'invoke-krea2-global-support-v1',
    promptInterpretation: 'invoke-fragments-v1',
    recipe,
    request,
  }
}
async function enqueue(
  fixture: AnimaStagingFixture,
  options: {
    beforeCommit?: () => Promise<void>
    retainInput?: (input: AnimaRegionalWorkerInput) => void
  } = {},
) {
  const preparedBatch = prepare(fixture)
  const stagingSessionId = randomUUID()
  const items = await withAnimaGenerationBatchRequests({
    modelService: fixture.modelService,
    prepared: preparedBatch,
    ready: READY,
    scratchBasePath: fixture.scratch,
    use: async (requests) => {
      const input = regional(fixture, requests[0])
      options.retainInput?.(input)
      return await fixture.queue.enqueueAnimaRegionalBatchWithCaptureGate({
        beforeCommit: options.beforeCommit,
        preflight: async (entries) =>
          await fixture.staging.preflightRegionalBatchCapacity({
            entries,
            localProjectKey: localProjectRecoveryKey(fixture.projectPath),
            projectPath: fixture.projectPath,
            stagingSessionId,
          }),
        preparedBatch,
        projectPath: fixture.projectPath,
        regionalInputs: [input],
        requests,
        stagingSessionId,
      })
    },
  })
  return items[0]
}

test('Anima regional queue freezes exact policy, weighted sidecars/alpha, public details and explicit Retry independently of later authoring', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    let authored: AnimaRegionalWorkerInput | undefined
    const item = await enqueue(fixture, {
      retainInput: (input) => {
        authored = input
      },
    })
    authored!.recipe.regions[0].coverage.alpha.fill(0)
    authored!.compiledPrompts[2] = { ...authored!.compiledPrompts[2], text: 'later' }
    fixture.prepared.context.prompts.positive = 'new draft'
    const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(item.id)
    assert.equal(frozen.payload.kind, 'anima-regional-txt2img')
    assert.equal(frozen.payload.context.animaPromptInterpretation, 'invoke-fragments-v1')
    assert.equal(frozen.input.recipe.regions[0].coverage.alpha[0], 180)
    assert.equal(frozen.input.compiledPrompts[2].text, '𐐀 (red fox:2)')
    const page = await fixture.queue.listManagerPage()
    assert.equal(isGenerationQueuePage(page), true)
    assert.equal(page.items[0].operation, 'anima-regional-txt2img')
    assert.equal(page.items[0].details?.sampling.animaMethod, 'euler')
    assert.equal(await fixture.queue.nextDispatchableKind(), 'regional')
    assert.equal(await fixture.queue.claimNextPending(), null)
    const canceled = await fixture.queue.cancel(item.id)
    const retry = await fixture.queue.retryAnimaRegionalTerminal(item.id, canceled.statusSequence)
    const copied = await fixture.queue.loadVerifiedAnimaRegionalInput(retry.id)
    assert.deepEqual(copied.payload, frozen.payload)
    assert.deepEqual(copied.input.compiledPrompts, frozen.input.compiledPrompts)
    assert.notEqual(copied.targetPath, frozen.targetPath)
    const prior = await readFile(path.join(path.dirname(frozen.targetPath), 'region-0.alpha8'))
    await writeFile(
      path.join(path.dirname(frozen.targetPath), 'region-0.alpha8'),
      Buffer.alloc(prior.length),
    )
    await assert.rejects(fixture.queue.loadVerifiedAnimaRegionalInput(item.id), {
      code: 'QUEUE_INPUT_INVALID',
    })
    assert.equal(
      (await fixture.queue.loadVerifiedAnimaRegionalInput(retry.id)).input.recipe.regions[0]
        .coverage.alpha[0],
      180,
    )
    assert.equal((await fixture.queue.claimNextPendingInvokeCanvasRegional())?.item.id, retry.id)
    const base = parseAcceptedGenerationBaseV1(JSON.stringify(copied.payload))
    assert.equal(base.kind, 'anima-txt2img')
    assert.equal('regional' in base, false)
    assert.equal('compositionProfile' in base, false)
    assert.equal('promptInterpretation' in base, false)
    assert.equal(base.context.animaPromptInterpretation, 'invoke-fragments-v1')
  })
})

for (const corruption of ['compiled', 'policy', 'alpha', 'symlink', 'hardlink', 'extra'] as const) {
  test(`Anima regional frozen loader rejects ${corruption} sidecar corruption`, async () => {
    await withAnimaStagingFixture(async (fixture) => {
      const item = await enqueue(fixture)
      const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(item.id)
      const root = path.dirname(frozen.targetPath)
      if (corruption === 'compiled' || corruption === 'policy') {
        const file = path.join(root, 'regional.json')
        const metadata = JSON.parse((await readFile(file)).toString('utf8'))
        if (corruption === 'compiled') {
          metadata.compiledPrompts[2].prompt.spans[0].weight = 9
        } else {
          metadata.promptInterpretation = 'legacy'
        }
        await writeFile(file, JSON.stringify(metadata))
      } else if (corruption === 'extra') {
        await writeFile(path.join(root, 'region-9.alpha8'), 'unexpected')
      } else {
        const file = path.join(root, 'region-0.alpha8')
        if (corruption === 'alpha') {
          await writeFile(file, Buffer.alloc(4096))
        } else {
          await unlink(file)
          await (corruption === 'symlink'
            ? symlink(frozen.targetPath, file)
            : link(frozen.targetPath, file))
        }
      }
      await assert.rejects(fixture.queue.loadVerifiedAnimaRegionalInput(item.id), {
        code: 'QUEUE_INPUT_INVALID',
      })
      assert.equal(
        (await fixture.database.db.selectFrom('generation_candidate_receipt').selectAll().execute())
          .length,
        0,
      )
    })
  })
}

test('Anima regional files-first transaction rolls back every row and sidecar on capture gate refusal', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    await assert.rejects(
      enqueue(fixture, {
        beforeCommit: async () => {
          throw new Error('capture changed')
        },
      }),
      /capture changed/,
    )
    assert.equal(
      (await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute()).length,
      0,
    )
    assert.deepEqual(await readdir(path.join(fixture.root, 'generation-inputs')), [])
    assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
  })
})

test('Anima regional transport shares exact owned bundle/result disposal and rejects changed Main compilation', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const prepared = prepare(fixture)
    await withAnimaGenerationBatchRequests({
      modelService: fixture.modelService,
      prepared,
      ready: READY,
      scratchBasePath: fixture.scratch,
      use: async (requests) => {
        fixture.outputBytes = await rgbOutput()
        const input = regional(fixture, requests[0])
        const lease = await prepareAnimaRegionalWorkerRequest(input, fixture.scratch)
        const root = lease.wire.stagingRoot
        try {
          assert.equal(lease.wire.type, 'execute-current-canvas-anima-regional')
          assert.deepEqual(Object.keys(lease.wire).sort(), [
            'bundle',
            'protocolVersion',
            'requestId',
            'stagingRoot',
            'type',
          ])
          const bytes = await readFile(lease.wire.bundle.path)
          assert.equal(animaFixtureSha256(bytes), lease.wire.bundle.sha256)
          const bundle = JSON.parse(bytes.toString('utf8'))
          assert.deepEqual(Object.keys(bundle).sort(), [
            'compiledPrompts',
            'compositionProfile',
            'promptInterpretation',
            'recipe',
            'request',
            'schemaVersion',
          ])
          assert.equal(bundle.request.type, 'generate-anima-txt2img')
          assert.equal(
            bundle.recipe.regions[0].coverage.alpha.$alpha8.path,
            path.join(root, 'region-0.alpha8'),
          )
          await writeFile(lease.request.job.output.pngPath, fixture.outputBytes)
          const result = await readRegionalWorkerResult(lease, {
            outputPath: lease.request.job.output.pngPath,
            protocolVersion: '1',
            requestId: lease.request.requestId,
            seed: lease.request.job.sampling.seed,
            type: 'generation-done',
          })
          assert.deepEqual(result.pngBytes, fixture.outputBytes)
        } finally {
          await lease.dispose()
        }
        await assert.rejects(readFile(path.join(root, 'bundle.json')))
        const changed = structuredClone(input)
        changed.compiledPrompts[2] = { ...changed.compiledPrompts[2], text: 'unfrozen' }
        assert.throws(() => captureAnimaRegionalWorkerInput(changed), { code: 'INVALID_REQUEST' })
      },
    })
  })
})

test('Anima regional processor publishes through existing receipt/Results owner and portable ordinary base projection', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const item = await enqueue(fixture)
    fixture.outputBytes = await rgbOutput()
    const models = {
      ...fixture.modelService,
      assertNoUnboundGenerationEmbeddings: async () => {},
      resolveVerifiedGenerationCheckpointForPlan: async () => {
        throw new Error('wrong family')
      },
      resolveVerifiedGenerationEmbeddingForPlan: async () => {
        throw new Error('wrong family')
      },
    }
    const processor = new RegionalGenerationProcessor(
      fixture.queue,
      fixture.staging,
      models,
      'invoke-canvas-v1',
    )
    const result = await processor.runOne({
      close: async () => {},
      executeCurrentCanvasRegional: async (input) => {
        assert.equal(input.compositionProfile, 'invoke-krea2-global-support-v1')
        return {
          output: {
            byteSize: fixture.outputBytes.length,
            colorSpace: 'srgb',
            height: 64,
            iccSha256: input.request.job.target.iccSha256,
            path: '/historical/result.png',
            sha256: animaFixtureSha256(fixture.outputBytes),
            width: 64,
          },
          pngBytes: fixture.outputBytes,
          seed: input.request.job.sampling.seed,
        }
      },
      ready: READY,
    })
    assert.equal(result.kind, 'completed')
    assert.equal(
      (await fixture.queue.loadVerifiedAnimaRegionalInput(item.id)).item.status,
      'completed',
    )
    const candidates = await fixture.staging.listVerifiedCandidates(
      localProjectRecoveryKey(fixture.projectPath),
    )
    assert.equal(candidates.length, 1)
    assert.equal(
      parseAcceptedGenerationBaseV1(candidates[0].frozenPayloadJson).kind,
      'anima-txt2img',
    )
    const restored = new GenerationStagingRepository(fixture.database.db, fixture.root)
    await restored.recoverAfterRestart()
    assert.equal(
      (await restored.listVerifiedCandidates(localProjectRecoveryKey(fixture.projectPath))).length,
      1,
    )
  })
})

async function rgbOutput(): Promise<Buffer> {
  const profile = await readFile(path.resolve('worker-python/src/imagegen_worker/srgb.icc'))
  const chunk = (name: string, bytes: Buffer): Buffer => {
    const result = Buffer.alloc(bytes.length + 12)
    result.writeUInt32BE(bytes.length)
    result.write(name, 4)
    bytes.copy(result, 8)
    result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4)
    return result
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(64)
  header.writeUInt32BE(64, 4)
  header[8] = 8
  header[9] = 2
  const rows = Buffer.alloc((64 * 3 + 1) * 64)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      rows.set([32 + x, 48 + y, 96], y * (64 * 3 + 1) + 1 + x * 3)
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

test('Anima regional frozen policy refuses missing/changed markers and keeps ordinary interpretation absence explicit', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const item = await enqueue(fixture)
    const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(item.id)
    for (const key of ['compositionProfile', 'promptInterpretation'] as const) {
      const absent = { ...frozen.payload } as Record<string, unknown>
      delete absent[key]
      assert.throws(() => parseFrozenQueuedAnimaRegionalV1(JSON.stringify(absent)), {
        code: 'QUEUE_INPUT_INVALID',
      })
      assert.throws(
        () =>
          parseFrozenQueuedAnimaRegionalV1(JSON.stringify({ ...frozen.payload, [key]: 'unknown' })),
        { code: 'QUEUE_INPUT_INVALID' },
      )
    }
    const ordinary = parseAcceptedGenerationBaseV1(JSON.stringify(frozen.payload))
    assert.equal(ordinary.kind, 'anima-txt2img')
    assert.equal(ordinary.context.animaPromptInterpretation, 'invoke-fragments-v1')
    for (const alter of [
      (input: AnimaRegionalWorkerInput) => {
        input.recipe.regions[0].positive = null
      },
      (input: AnimaRegionalWorkerInput) => {
        input.recipe.regions[0].positive!.text = ''
      },
      (input: AnimaRegionalWorkerInput) => {
        input.recipe.regions[0].negative.prompt.text = ' '
      },
      (input: AnimaRegionalWorkerInput) => {
        input.recipe.globalPrompts.negative.text = 'bad'
      },
      (input: AnimaRegionalWorkerInput) => {
        input.recipe.regions[0].positive!.text = '{cat|dog}'
      },
    ]) {
      const input = structuredClone(frozen.input)
      alter(input)
      assert.throws(() => captureAnimaRegionalWorkerInput(input), { code: 'INVALID_REQUEST' })
    }
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

test('Anima regional Cancel retains running slot and lease fence until physical exit, suppresses late progress/completion, then frozen Retry works', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const item = await enqueue(fixture)
    const models = {
      ...fixture.modelService,
      assertNoUnboundGenerationEmbeddings: async () => {},
      resolveVerifiedGenerationCheckpointForPlan: async () => {
        throw new Error('wrong family')
      },
      resolveVerifiedGenerationEmbeddingForPlan: async () => {
        throw new Error('wrong family')
      },
    }
    const processor = new RegionalGenerationProcessor(
      fixture.queue,
      fixture.staging,
      models,
      'invoke-canvas-v1',
    )
    const dispatched = deferred<void>()
    const closing = deferred<void>()
    const physicalExit = deferred<void>()
    const late = deferred<Awaited<ReturnType<typeof readRegionalWorkerResult>>>()
    let progress: ((value: { step: number; totalSteps: number }) => void) | undefined
    const run = processor.runOne({
      close: async () => {
        closing.resolve()
        await physicalExit.promise
      },
      executeCurrentCanvasRegional: async (_input, onProgress) => {
        progress = onProgress
        onProgress?.({ step: 1, totalSteps: 4 })
        dispatched.resolve()
        return await late.promise
      },
      ready: READY,
    })
    await dispatched.promise
    assert.equal(processor.getProgressSnapshot().current?.step, 1)
    const canceled = processor.cancelAndWait(item.id)
    await closing.promise
    assert.equal(processor.getProgressSnapshot().current, null)
    assert.equal(
      (await fixture.queue.loadVerifiedAnimaRegionalInput(item.id)).item.status,
      'running',
    )
    assert.equal(await fixture.queue.claimNextPendingInvokeCanvasRegional(), null)
    progress?.({ step: 2, totalSteps: 4 })
    assert.equal(processor.getProgressSnapshot().current, null)
    physicalExit.resolve()
    const terminal = await canceled
    assert.equal(terminal.status, 'canceled')
    assert.equal((await run).kind, 'canceled')
    const input = (await fixture.queue.loadVerifiedAnimaRegionalInput(item.id)).input
    const bytes = await rgbOutput()
    late.resolve({
      output: {
        byteSize: bytes.length,
        colorSpace: 'srgb',
        height: 64,
        iccSha256: input.request.job.target.iccSha256,
        path: '/historical/result.png',
        sha256: animaFixtureSha256(bytes),
        width: 64,
      },
      pngBytes: bytes,
      seed: input.request.job.sampling.seed,
    })
    await late.promise
    assert.equal(await fixture.staging.hasPublicationReceipt(item.id), false)
    assert.equal((await fixture.staging.listVerifiedCandidates(item.localProjectKey)).length, 0)
    fixture.prepared.context.prompts.positive = 'new current draft'
    const retry = await fixture.queue.retryAnimaRegionalTerminal(item.id, terminal.statusSequence)
    assert.equal(
      (await fixture.queue.loadVerifiedAnimaRegionalInput(retry.id)).input.recipe.globalPrompts
        .positive.text,
      '(cat:1.7) blue',
    )
  })
})

test('Anima regional queue refuses equivalent compiled text when complete Main recipe and frozen authoring source differ', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const preparedBatch = prepare(fixture)
    const stagingSessionId = randomUUID()
    await withAnimaGenerationBatchRequests({
      modelService: fixture.modelService,
      prepared: preparedBatch,
      ready: READY,
      scratchBasePath: fixture.scratch,
      use: async (requests) => {
        const input = regional(fixture, requests[0])
        input.recipe.globalPrompts.positive.text = '(cat:1.70) blue'
        input.recipe.item = {
          ...input.recipe.item,
          prompts: { ...input.recipe.item.prompts, positive: '(cat:1.70) blue' },
        }
        input.compiledPrompts = [...compileCurrentCanvasAnimaRegionalPrompts(input.recipe)]
        assert.deepEqual(input.compiledPrompts[0].prompt, requests[0].job.prompts.positive)
        await assert.rejects(
          fixture.queue.enqueueAnimaRegionalBatchWithCaptureGate({
            preflight: async () =>
              assert.fail('Source disagreement must refuse before capacity/publication.'),
            preparedBatch,
            projectPath: fixture.projectPath,
            regionalInputs: [input],
            requests,
            stagingSessionId,
          }),
          { code: 'QUEUE_INPUT_INVALID' },
        )
        assert.equal(
          (await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute())
            .length,
          0,
        )
      },
    })
  })
})
