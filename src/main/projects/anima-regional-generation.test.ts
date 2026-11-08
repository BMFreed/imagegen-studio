import { ANIMA_SAMPLING_METHOD_KEYS } from '../../shared/projects/anima-sampling-method.js'
import type { AnimaWorkerRequest } from '../../shared/projects/anima-worker-request.js'
import { isGenerationQueuePage } from '../../shared/projects/generation-queue-manager.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmod, link, mkdir, readdir, readFile, symlink, unlink, writeFile } from 'node:fs/promises'
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
import { GenerationWorkerClient } from './generation-worker-client.js'
import { compileCurrentCanvasAnimaRegionalPrompts } from './project-current-canvas-anima-regional-input.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { RegionalGenerationProcessor } from './regional-generation-processor.js'
import { parseAcceptedGenerationBaseV1 } from './regional-queued-generation.js'
import { readRegionalWorkerResult } from './regional-worker-request.js'
import {
  ANIMA_BATCH_READY,
  animaFixturePng,
  animaFixtureSha256,
} from './test-fixtures/anima-batch.js'
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

for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
  test(`regional ${method} dispatch retains native iteration progress, frozen arrays and base-only publication`, async () => {
    await withAnimaStagingFixture(async (fixture) => {
      fixture.prepared.context.sampling.animaMethod = method
      fixture.prepared.context.generationDraft.sampling.animaMethod = method
      fixture.prepared.context.sampling.steps = 20
      fixture.prepared.context.generationDraft.sampling.steps = 20
      const item = await enqueue(fixture)
      const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(item.id)
      const arrays = structuredClone(frozen.input.request.job.sampling)
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
      const outputBytes = await rgbOutput()
      let calls = 0
      const result = await processor.runOne({
        close: async () => {},
        executeCurrentCanvasRegional: async (input, progress) => {
          calls += 1
          assert.deepEqual(input.request.job.sampling, arrays)
          const totalSteps = method === 'heun' ? 39 : 20
          assert.equal(input.request.job.sampling.totalSteps, totalSteps)
          if (method === 'heun') {
            progress?.({ step: 1, totalSteps: 20 })
            assert.equal(processor.getProgressSnapshot().current, null)
          }
          for (let step = 1; step <= totalSteps; step += 1) {
            progress?.({ step, totalSteps })
            assert.equal(processor.getProgressSnapshot().current?.step, step)
            assert.equal(processor.getProgressSnapshot().current?.totalSteps, totalSteps)
          }
          return {
            output: {
              byteSize: outputBytes.length,
              colorSpace: 'srgb',
              height: 64,
              iccSha256: input.request.job.target.iccSha256,
              path: '/historical/result.png',
              sha256: animaFixtureSha256(outputBytes),
              width: 64,
            },
            pngBytes: outputBytes,
            seed: input.request.job.sampling.seed,
          }
        },
        ready: { ...READY, capabilities: [...READY.capabilities, 'anima-regional-sampling-v1'] },
      })
      assert.equal(calls, 1)
      assert.equal(result.kind, 'completed')
      const candidates = await fixture.staging.listVerifiedCandidates(item.localProjectKey)
      assert.equal(candidates.length, 1)
      const accepted = parseAcceptedGenerationBaseV1(candidates[0].frozenPayloadJson)
      assert.equal(accepted.kind, 'anima-txt2img')
      assert.equal(accepted.workerJob.sampling.scheduler, method)
      assert.equal('regional' in accepted, false)
      assert.equal('compositionProfile' in accepted, false)
      assert.ok((await readFile(fixture.projectPath)).equals(fixture.originalProjectBytes))
    })
  })
}

test('non-Euler regional dispatch refuses an old peer before invoking transport and preserves frozen input', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    fixture.prepared.context.sampling.animaMethod = 'heun'
    fixture.prepared.context.generationDraft.sampling.animaMethod = 'heun'
    const item = await enqueue(fixture)
    const before = await fixture.queue.loadVerifiedAnimaRegionalInput(item.id)
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
      executeCurrentCanvasRegional: async () =>
        assert.fail('Unqualified peer must not receive a regional flow job.'),
      ready: READY,
    })
    assert.equal(result.kind, 'failed')
    const after = await fixture.queue.loadVerifiedAnimaRegionalInput(item.id)
    assert.deepEqual(after.payload, before.payload)
    assert.deepEqual(after.input.recipe, before.input.recipe)
    assert.equal((await fixture.staging.listVerifiedCandidates(item.localProjectKey)).length, 0)
  })
})

test('regional flow client qualifies before scratch and consumes exact native Heun progress over unchanged JSONL', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const runtime = path.join(fixture.root, 'regional-flow-runtime')
    const scratch = path.join(fixture.root, 'regional-flow-client')
    const received = path.join(fixture.root, 'regional-flow-wire.jsonl')
    await mkdir(runtime)
    await mkdir(scratch, { mode: 0o700 })
    const executable = path.join(runtime, 'python')
    const outputBytes = await rgbOutput()
    for (const support of [false, true]) {
      const ready = {
        ...READY,
        capabilities: [
          ...READY.capabilities,
          ...(support ? ['anima-regional-sampling-v1'] : []),
          ...(process.platform === 'linux' ? ['linux-owned-inference-v1'] : []),
        ],
        pythonVersion: '3.12.13',
        type: 'ready',
      }
      // Protocol substitute only: no native kernel guard or inference is claimed here.
      const script = String.raw`#!${process.execPath}
const fs = require('node:fs'), crypto = require('node:crypto');
const args = process.argv.slice(2);
const valid = process.platform === 'linux'
  ? args.length === 7 && JSON.stringify(args.slice(0, 6)) === JSON.stringify(['-I', '-m', 'imagegen_worker.owned_inference', '--parent-pid', String(process.ppid), '--scratch-base'])
  : args.join(' ') === '-I -m imagegen_worker.inference_main';
if (!valid) process.exit(21);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
process.stdout.write(JSON.stringify(${JSON.stringify(ready)}) + '\n');
require('node:readline').createInterface({input: process.stdin}).on('line', line => {
  const wire = JSON.parse(line);
  if (wire.type !== 'execute-current-canvas-anima-regional' || wire.reportProgress !== true) throw Error('Wrong flow owner');
  const bytes = fs.readFileSync(wire.bundle.path);
  if (bytes.length !== wire.bundle.byteSize || sha(bytes) !== wire.bundle.sha256) throw Error('Changed bundle');
  const bundle = JSON.parse(bytes), plan = bundle.request.job.sampling;
  fs.appendFileSync(${JSON.stringify(received)}, JSON.stringify({method:plan.scheduler,plan,keys:Object.keys(wire).sort()}) + '\n');
  for (let step = 1; step <= plan.totalSteps; step++) process.stdout.write(JSON.stringify({type:'generation-progress',protocolVersion:'1',requestId:wire.requestId,step,totalSteps:plan.totalSteps}) + '\n');
  fs.writeFileSync(bundle.request.job.output.pngPath, Buffer.from(${JSON.stringify(outputBytes.toString('base64'))}, 'base64'), {flag:'wx'});
  process.stdout.write(JSON.stringify({type:'generation-done',protocolVersion:'1',requestId:wire.requestId,outputPath:bundle.request.job.output.pngPath,seed:plan.seed}) + '\n');
});
`
      await writeFile(executable, script)
      await chmod(executable, 0o700)
      const client = await GenerationWorkerClient.start(
        { pythonExecutable: executable, runtimeRoot: runtime, scratchBasePath: scratch },
        { requestTimeoutMs: 3000, shutdownWaitMs: 100 },
      )
      try {
        for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
          fixture.prepared.context.sampling.animaMethod = method
          fixture.prepared.context.generationDraft.sampling.animaMethod = method
          fixture.prepared.context.sampling.steps = 20
          fixture.prepared.context.generationDraft.sampling.steps = 20
          await withAnimaGenerationBatchRequests({
            modelService: fixture.modelService,
            prepared: prepare(fixture),
            ready: READY,
            scratchBasePath: fixture.scratch,
            use: async (requests) => {
              const input = regional(fixture, requests[0])
              const frozen = structuredClone(input)
              const progress: { step: number; totalSteps: number }[] = []
              if (!support && method !== 'euler') {
                const before = await readFile(received, 'utf8')
                await assert.rejects(
                  client.executeCurrentCanvasRegional(input, (value) => progress.push(value)),
                  { code: 'WORKER_VERSION_MISMATCH' },
                )
                assert.equal(await readFile(received, 'utf8'), before)
                assert.deepEqual(progress, [])
              } else {
                const result = await client.executeCurrentCanvasRegional(input, (value) =>
                  progress.push(value),
                )
                assert.ok(result.pngBytes.equals(outputBytes))
                const totalSteps = method === 'heun' ? 39 : 20
                assert.deepEqual(
                  progress,
                  Array.from({ length: totalSteps }, (_, index) => ({
                    step: index + 1,
                    totalSteps,
                  })),
                )
              }
              assert.deepEqual(input, frozen)
              assert.deepEqual(await readdir(scratch), [])
            },
          })
        }
      } finally {
        await client.close()
      }
    }
    const records = (await readFile(received, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { keys: string[]; method: string })
    assert.deepEqual(
      records.map((record) => record.method),
      ['euler', ...ANIMA_SAMPLING_METHOD_KEYS],
    )
    assert.ok(
      records.every(
        (record) =>
          JSON.stringify(record.keys) ===
          JSON.stringify([
            'bundle',
            'protocolVersion',
            'reportProgress',
            'requestId',
            'stagingRoot',
            'type',
          ]),
      ),
    )
  })
})

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

for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
  for (const strength of [0, 0.5, 1]) {
    test(`opaque regional ${method} strength ${strength} dispatch preserves native count and ordinary image publication`, async () => {
      await withAnimaStagingFixture(
        async (fixture) => {
          if (fixture.prepared.context.mode !== 'img2img') {
            assert.fail('Opaque fixture required')
          }
          fixture.prepared.context.sampling.animaMethod = method
          fixture.prepared.context.generationDraft.sampling.animaMethod = method
          fixture.prepared.context.sampling.steps = 20
          fixture.prepared.context.generationDraft.sampling.steps = 20
          fixture.prepared.context.sampling.denoisingStrength = strength
          fixture.prepared.context.generationDraft.sampling.denoisingStrength = strength
          const item = await enqueue(fixture)
          const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(item.id)
          assert.equal(frozen.payload.kind, 'anima-regional-img2img')
          if (method === 'heun' && strength === 0.5) {
            assert.throws(
              () =>
                parseFrozenQueuedAnimaRegionalV1(
                  JSON.stringify({
                    ...frozen.payload,
                    kind: 'anima-regional-txt2img',
                  }),
                ),
              { code: 'QUEUE_INPUT_INVALID' },
            )
          }
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
          const bytes = await rgbOutput()
          const result = await processor.runOne({
            close: async () => {},
            executeCurrentCanvasRegional: async (input, progress) => {
              if (input.request.type !== 'generate-anima-img2img') {
                assert.fail('Expected ordinary IMG command')
              }
              assert.deepEqual(input.request.job.sampling, frozen.input.request.job.sampling)
              const totalSteps =
                strength === 0
                  ? 0
                  : method === 'heun'
                    ? strength === 1
                      ? 39
                      : 19
                    : strength === 1
                      ? 20
                      : 10
              assert.equal(input.request.job.sampling.totalSteps, totalSteps)
              progress?.({ step: 1, totalSteps: totalSteps === 20 ? 19 : 20 })
              assert.equal(processor.getProgressSnapshot().current, null)
              for (let step = 1; step <= totalSteps; step++) {
                progress?.({ step, totalSteps })
                assert.equal(processor.getProgressSnapshot().current?.step, step)
                assert.equal(processor.getProgressSnapshot().current?.totalSteps, totalSteps)
              }
              return {
                output: {
                  byteSize: bytes.length,
                  colorSpace: 'srgb',
                  height: 64,
                  iccSha256: input.request.job.target.iccSha256,
                  path: '/historical/image.png',
                  sha256: animaFixtureSha256(bytes),
                  width: 64,
                },
                pngBytes: bytes,
                seed: input.request.job.sampling.seed,
              }
            },
            ready: {
              ...READY,
              capabilities: [
                ...READY.capabilities,
                'anima-regional-img2img-v1',
                'anima-regional-sampling-v1',
              ],
            },
          })
          assert.equal(result.kind, 'completed')
          assert.equal(processor.getProgressSnapshot().current, null)
          const candidates = await fixture.staging.listVerifiedCandidates(item.localProjectKey)
          assert.equal(candidates.length, 1)
          const base = parseAcceptedGenerationBaseV1(candidates[0].frozenPayloadJson)
          if (base.kind !== 'anima-img2img') {
            assert.fail('Image provenance lost its ordinary operation')
          }
          assert.equal(base.workerJob.sampling.strength, strength)
          assert.equal(base.context.sampling.denoisingStrength, strength)
          assert.equal('regional' in base, false)
          assert.equal('compositionProfile' in base, false)
          assert.ok((await readFile(fixture.projectPath)).equals(fixture.originalProjectBytes))
        },
        { opaque: true },
      )
    })
  }
}

test('opaque Anima regional dispatch refuses old image peer without transport or frozen-input mutation', async () => {
  await withAnimaStagingFixture(
    async (fixture) => {
      const item = await enqueue(fixture)
      const before = await fixture.queue.loadVerifiedAnimaRegionalInput(item.id)
      const processor = new RegionalGenerationProcessor(
        fixture.queue,
        fixture.staging,
        {
          ...fixture.modelService,
          assertNoUnboundGenerationEmbeddings: async () => {},
          resolveVerifiedGenerationCheckpointForPlan: async () => {
            throw new Error('wrong family')
          },
          resolveVerifiedGenerationEmbeddingForPlan: async () => {
            throw new Error('wrong family')
          },
        },
        'invoke-canvas-v1',
      )
      let calls = 0
      const result = await processor.runOne({
        close: async () => {},
        executeCurrentCanvasRegional: async () => {
          calls++
          throw new Error('old peer reached transport')
        },
        ready: READY,
      })
      assert.equal(result.kind, 'failed')
      assert.equal(calls, 0)
      const after = await fixture.queue.loadVerifiedAnimaRegionalInput(item.id)
      assert.deepEqual(after.payload, before.payload)
      assert.equal((await fixture.staging.listVerifiedCandidates(item.localProjectKey)).length, 0)
    },
    { opaque: true },
  )
})

for (const alpha of [0, 127, 255]) {
  test(`opaque Anima regional lease checks actual alpha ${alpha} before materializing request files`, async () => {
    await withAnimaStagingFixture(
      async (fixture) => {
        await withAnimaGenerationBatchRequests({
          modelService: fixture.modelService,
          prepared: prepare(fixture),
          ready: READY,
          scratchBasePath: fixture.scratch,
          use: async (requests) => {
            const input = regional(fixture, requests[0])
            if (input.request.type !== 'generate-anima-img2img') {
              assert.fail('Opaque image required')
            }
            const original = await readFile(input.request.job.target.path)
            const bytes = await animaFixturePng(alpha)
            await writeFile(input.request.job.target.path, bytes)
            const changed: AnimaRegionalWorkerInput = {
              ...structuredClone(input),
              request: {
                ...input.request,
                job: {
                  ...input.request.job,
                  target: {
                    ...input.request.job.target,
                    byteSize: bytes.length,
                    sha256: animaFixtureSha256(bytes),
                  },
                },
              },
            }
            if (alpha === 255) {
              const lease = await prepareAnimaRegionalWorkerRequest(changed, fixture.scratch)
              assert.equal(lease.request.type, 'generate-anima-img2img')
              await lease.dispose()
            } else {
              const before = await readdir(fixture.scratch)
              await assert.rejects(prepareAnimaRegionalWorkerRequest(changed, fixture.scratch))
              assert.deepEqual(await readdir(fixture.scratch), before)
            }
            await writeFile(input.request.job.target.path, original)
            const recovered = await prepareAnimaRegionalWorkerRequest(input, fixture.scratch)
            await recovered.dispose()
          },
        })
      },
      { opaque: true },
    )
  })
}

test('opaque regional flow client requires its own capability and consumes zero clipped and full native progress', async () => {
  await withAnimaStagingFixture(
    async (fixture) => {
      if (fixture.prepared.context.mode !== 'img2img') {
        assert.fail('Opaque fixture required')
      }
      const runtime = path.join(fixture.root, 'regional-flow-runtime')
      const scratch = path.join(fixture.root, 'regional-flow-client')
      const received = path.join(fixture.root, 'regional-flow-wire.jsonl')
      await mkdir(runtime)
      await mkdir(scratch, { mode: 0o700 })
      const executable = path.join(runtime, 'python')
      const outputBytes = await rgbOutput()
      for (const support of [false, true]) {
        const ready = {
          ...READY,
          capabilities: [
            ...READY.capabilities,
            'anima-regional-sampling-v1',
            ...(support ? ['anima-regional-img2img-v1'] : []),
            ...(process.platform === 'linux' ? ['linux-owned-inference-v1'] : []),
          ],
          pythonVersion: '3.12.13',
          type: 'ready',
        }
        // Protocol substitute only: no native kernel guard or inference is claimed here.
        const script = String.raw`#!${process.execPath}
const fs = require('node:fs'), crypto = require('node:crypto');
const args = process.argv.slice(2);
const valid = process.platform === 'linux'
  ? args.length === 7 && JSON.stringify(args.slice(0, 6)) === JSON.stringify(['-I', '-m', 'imagegen_worker.owned_inference', '--parent-pid', String(process.ppid), '--scratch-base'])
  : args.join(' ') === '-I -m imagegen_worker.inference_main';
if (!valid) process.exit(21);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
process.stdout.write(JSON.stringify(${JSON.stringify(ready)}) + '\n');
require('node:readline').createInterface({input: process.stdin}).on('line', line => {
  const wire = JSON.parse(line);
  if (wire.type !== 'execute-current-canvas-anima-regional' || wire.reportProgress !== true) throw Error('Wrong flow owner');
  const bytes = fs.readFileSync(wire.bundle.path);
  if (bytes.length !== wire.bundle.byteSize || sha(bytes) !== wire.bundle.sha256) throw Error('Changed bundle');
  const bundle = JSON.parse(bytes), plan = bundle.request.job.sampling;
  if (bundle.request.type !== 'generate-anima-img2img' || plan.mode !== 'img2img') throw Error('Wrong image mode');
  fs.appendFileSync(${JSON.stringify(received)}, JSON.stringify({method:plan.scheduler,plan,keys:Object.keys(wire).sort()}) + '\n');
  for (let step = 1; step <= plan.totalSteps; step++) process.stdout.write(JSON.stringify({type:'generation-progress',protocolVersion:'1',requestId:wire.requestId,step,totalSteps:plan.totalSteps}) + '\n');
  fs.writeFileSync(bundle.request.job.output.pngPath, Buffer.from(${JSON.stringify(outputBytes.toString('base64'))}, 'base64'), {flag:'wx'});
  process.stdout.write(JSON.stringify({type:'generation-done',protocolVersion:'1',requestId:wire.requestId,outputPath:bundle.request.job.output.pngPath,seed:plan.seed}) + '\n');
});
`
        await writeFile(executable, script)
        await chmod(executable, 0o700)
        const client = await GenerationWorkerClient.start(
          { pythonExecutable: executable, runtimeRoot: runtime, scratchBasePath: scratch },
          { requestTimeoutMs: 3000, shutdownWaitMs: 100 },
        )
        try {
          for (const { method, strength } of ANIMA_SAMPLING_METHOD_KEYS.flatMap((method) =>
            [0, 0.5, 1].map((strength) => ({ method, strength })),
          )) {
            fixture.prepared.context.sampling.animaMethod = method
            fixture.prepared.context.generationDraft.sampling.animaMethod = method
            fixture.prepared.context.sampling.denoisingStrength = strength
            fixture.prepared.context.generationDraft.sampling.denoisingStrength = strength
            fixture.prepared.context.sampling.steps = 20
            fixture.prepared.context.generationDraft.sampling.steps = 20
            await withAnimaGenerationBatchRequests({
              modelService: fixture.modelService,
              prepared: prepare(fixture),
              ready: READY,
              scratchBasePath: fixture.scratch,
              use: async (requests) => {
                const input = regional(fixture, requests[0])
                const frozen = structuredClone(input)
                const progress: { step: number; totalSteps: number }[] = []
                if (!support) {
                  await assert.rejects(
                    client.executeCurrentCanvasRegional(input, (value) => progress.push(value)),
                    { code: 'WORKER_VERSION_MISMATCH' },
                  )
                  await assert.rejects(readFile(received), { code: 'ENOENT' })
                  assert.deepEqual(progress, [])
                } else {
                  const result = await client.executeCurrentCanvasRegional(input, (value) =>
                    progress.push(value),
                  )
                  assert.ok(result.pngBytes.equals(outputBytes))
                  const totalSteps =
                    strength === 0
                      ? 0
                      : method === 'heun'
                        ? strength === 1
                          ? 39
                          : 19
                        : strength === 1
                          ? 20
                          : 10
                  assert.deepEqual(
                    progress,
                    Array.from({ length: totalSteps }, (_, index) => ({
                      step: index + 1,
                      totalSteps,
                    })),
                  )
                }
                assert.deepEqual(input, frozen)
                assert.deepEqual(await readdir(scratch), [])
              },
            })
          }
        } finally {
          await client.close()
        }
      }
      const records = (await readFile(received, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as { keys: string[]; method: string })
      assert.deepEqual(
        records.map((record) => record.method),
        ANIMA_SAMPLING_METHOD_KEYS.flatMap((method) => [method, method, method]),
      )
      assert.ok(
        records.every(
          (record) =>
            JSON.stringify(record.keys) ===
            JSON.stringify([
              'bundle',
              'protocolVersion',
              'reportProgress',
              'requestId',
              'stagingRoot',
              'type',
            ]),
        ),
      )
    },
    { opaque: true },
  )
})

test('opaque regional lease rejects changed source digest and recovers without changing the input', async () => {
  await withAnimaStagingFixture(
    async (fixture) => {
      await withAnimaGenerationBatchRequests({
        modelService: fixture.modelService,
        prepared: prepare(fixture),
        ready: READY,
        scratchBasePath: fixture.scratch,
        use: async (requests) => {
          const input = regional(fixture, requests[0])
          const frozen = structuredClone(input)
          const target = input.request.job.target.path
          const original = await readFile(target)
          await writeFile(target, Buffer.from('changed opaque source'))
          const before = await readdir(fixture.scratch)
          await assert.rejects(prepareAnimaRegionalWorkerRequest(input, fixture.scratch))
          assert.deepEqual(await readdir(fixture.scratch), before)
          assert.deepEqual(input, frozen)
          await writeFile(target, original)
          const recovered = await prepareAnimaRegionalWorkerRequest(input, fixture.scratch)
          await recovered.dispose()
        },
      })
    },
    { opaque: true },
  )
})
